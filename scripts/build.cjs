#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version || '1.0.0';

function readSrc(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8').replace(/\r\n/g, '\n').trim();
}

function buildIife(modules, bannerComment) {
  const parts = [bannerComment, '(() => {', "  'use strict';"];
  for (const mod of modules) {
    parts.push(`\n  // --- ${mod} ---`);
    parts.push(readSrc(mod));
  }
  parts.push('\n})();\n');
  return parts.join('\n');
}

function validateJs(code, filename) {
  new vm.Script(code, { filename });
}

function writeOut(relPath, content) {
  const abs = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

// Pure-Node RGBA PNG generator for valid extension icons
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function createIconPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const r = size * 0.44;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r + 0.8) {
        raw[px] = 0; raw[px + 1] = 0; raw[px + 2] = 0; raw[px + 3] = 0;
        continue;
      }
      // GitHub dark background with green badge border & bright center dot/bar
      let red = 13, green = 17, blue = 23, alpha = 255;
      if (dist > r - Math.max(1.5, size * 0.1)) {
        red = 35; green = 134; blue = 54; // #238636
      } else {
        // Draw stylized "RU" / two-stripe accent
        const ny = (y - cy) / r;
        const nx = (x - cx) / r;
        if (Math.abs(nx) < 0.45 && ny > -0.35 && ny < -0.08) {
          red = 240; green = 246; blue = 252;
        } else if (Math.abs(nx) < 0.45 && ny >= -0.08 && ny < 0.18) {
          red = 88; green = 166; blue = 255;
        } else if (Math.abs(nx) < 0.45 && ny >= 0.18 && ny < 0.42) {
          red = 248; green = 81; blue = 73;
        }
      }
      raw[px] = red; raw[px + 1] = green; raw[px + 2] = blue; raw[px + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// 1. Desktop bundle
const desktopCode = buildIife(
  ['core/translator.js', 'core/dom-engine.js', 'dictionaries/common.js', 'dictionaries/desktop.js', 'desktop/entry.js'],
  `// GitHub RU — GitHub Desktop Russian Localization v${VERSION} (MIT License, by prud / PrudnikovMS)`
);
validateJs(desktopCode, 'dist/desktop/ru-localization.js');
writeOut('desktop/ru-localization.js', desktopCode);

// 2. Web content bundle (shared between Extension & Userscript)
const webBanner = `// GitHub RU — GitHub.com Russian Localization v${VERSION} (MIT License, by prud / PrudnikovMS)`;
const webCode = buildIife(
  ['core/translator.js', 'core/dom-engine.js', 'dictionaries/common.js', 'dictionaries/web.js', 'web/entry.js'],
  webBanner
);
validateJs(webCode, 'dist/extension/content.js');
writeOut('extension/content.js', webCode);

// 3. Userscript bundle
const userscriptHeader = `// ==UserScript==
// @name         GitHub RU — Русификатор GitHub.com
// @namespace    https://github.com/PrudnikovMS/github-ru
// @version      ${VERSION}
// @description  Полная русская локализация интерфейса GitHub.com и Gist с мгновенным переключателем EN | RU (MIT License, by prud)
// @author       prud (PrudnikovMS)
// @license      MIT
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @homepageURL  https://github.com/PrudnikovMS/github-ru
// @supportURL   https://github.com/PrudnikovMS/github-ru/issues
// @downloadURL  https://raw.githubusercontent.com/PrudnikovMS/github-ru/main/dist/userscript/github-ru.user.js
// @updateURL    https://raw.githubusercontent.com/PrudnikovMS/github-ru/main/dist/userscript/github-ru.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==
`;
const userscriptCode = userscriptHeader + '\n' + webCode;
validateJs(userscriptCode, 'dist/userscript/github-ru.user.js');
writeOut('userscript/github-ru.user.js', userscriptCode);

// 4. Extension Manifest V3 + Popup + Icons
const manifest = {
  manifest_version: 3,
  name: 'GitHub RU — Русификатор GitHub.com',
  version: VERSION,
  description: 'Русская локализация интерфейса GitHub.com и Gist с мгновенным переключателем EN | RU. Не трогает код и README.',
  author: 'prud (PrudnikovMS)',
  homepage_url: 'https://github.com/PrudnikovMS/github-ru',
  icons: {
    '16': 'icons/icon16.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png'
  },
  permissions: ['storage'],
  host_permissions: ['https://github.com/*', 'https://gist.github.com/*'],
  content_scripts: [
    {
      matches: ['https://github.com/*', 'https://gist.github.com/*'],
      js: ['content.js'],
      run_at: 'document_idle'
    }
  ],
  action: {
    default_title: 'GitHub RU (EN | RU)',
    default_popup: 'popup.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png'
    }
  },
  browser_specific_settings: {
    gecko: {
      id: 'github-ru@prudnikovms.github.io',
      strict_min_version: '109.0'
    }
  }
};
const manifestStr = JSON.stringify(manifest, null, 2) + '\n';
JSON.parse(manifestStr);
writeOut('extension/manifest.json', manifestStr);

const popupHtml = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0;
      padding: 14px;
      width: 240px;
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
    }
    .title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    .sub { color: #8b949e; font-size: 11px; margin-bottom: 12px; }
    .row { display: flex; gap: 6px; margin-bottom: 12px; }
    button {
      flex: 1;
      height: 30px;
      border-radius: 8px;
      border: 1px solid #30363d;
      background: #161b22;
      color: #c9d1d9;
      font-weight: 600;
      cursor: pointer;
    }
    button.active {
      background: #238636;
      border-color: #2ea043;
      color: #ffffff;
    }
    a { color: #58a6ff; font-size: 11px; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="title">GitHub RU v${VERSION}</div>
  <div class="sub">Локализация интерфейса github.com</div>
  <div class="row">
    <button id="btn-ru" type="button">Русский (RU)</button>
    <button id="btn-en" type="button">English (EN)</button>
  </div>
  <a href="https://github.com/PrudnikovMS/github-ru" target="_blank" rel="noreferrer">Репозиторий проекта (MIT)</a>
  <script src="popup.js"></script>
</body>
</html>
`;
writeOut('extension/popup.html', popupHtml);

const popupJs = `(() => {
  'use strict';
  const KEY = 'gh_ru_web_lang';
  const btnRu = document.getElementById('btn-ru');
  const btnEn = document.getElementById('btn-en');

  function render(lang) {
    const isEn = lang === 'en';
    btnRu.classList.toggle('active', !isEn);
    btnEn.classList.toggle('active', isEn);
  }

  function applyLang(lang) {
    const next = lang === 'en' ? 'en' : 'ru';
    render(next);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [KEY]: next });
    }
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { type: 'GH_RU_SET_LANG', lang: next }, () => {
            void chrome.runtime.lastError;
          });
        }
      });
    }
  }

  btnRu.addEventListener('click', () => applyLang('ru'));
  btnEn.addEventListener('click', () => applyLang('en'));

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([KEY], (res) => {
      render(res && res[KEY] === 'en' ? 'en' : 'ru');
    });
  } else {
    render('ru');
  }
})();
`;
validateJs(popupJs, 'dist/extension/popup.js');
writeOut('extension/popup.js', popupJs);

for (const sz of [16, 48, 128]) {
  const iconAbs = path.join(DIST, 'extension', 'icons', `icon${sz}.png`);
  fs.mkdirSync(path.dirname(iconAbs), { recursive: true });
  fs.writeFileSync(iconAbs, createIconPng(sz));
}

console.log(`[build.cjs] Built desktop, extension (MV3), and userscript v${VERSION} in dist/`);
