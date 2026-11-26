#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function makeMockEnv() {
  const store = new Map();
  function makeNode(nodeType, tagOrVal) {
    const node = {
      nodeType,
      childNodes: [],
      parentElement: null,
      attributes: {},
      classList: {
        _set: new Set(),
        add(...xs) { xs.forEach((x) => this._set.add(x)); },
        contains(x) { return this._set.has(x); },
        toggle(x, force) { force ? this._set.add(x) : this._set.delete(x); }
      },
      get firstChild() { return this.childNodes[0] || null; },
      get firstElementChild() { return this.childNodes.find((c) => c.nodeType === 1) || null; },
      get nextElementSibling() {
        if (!this.parentElement) return null;
        const sibs = this.parentElement.childNodes.filter((c) => c.nodeType === 1);
        const i = sibs.indexOf(this);
        return i >= 0 ? (sibs[i + 1] || null) : null;
      },
      appendChild(c) { c.parentElement = this; this.childNodes.push(c); return c; },
      setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
      addEventListener() {},
      closest(sel) {
        const parts = sel.split(',').map((s) => s.trim());
        let cur = this;
        while (cur) {
          for (const p of parts) {
            if (p.startsWith('#') && cur.id === p.slice(1)) return cur;
            if (p.startsWith('.') && cur.classList.contains(p.slice(1))) return cur;
            if (p === '[data-gh-ru-access]' && cur.hasAttribute('data-gh-ru-access')) return cur;
            if (p === '[itemprop="name"]' && cur.getAttribute('itemprop') === 'name') return cur;
            if (/^[a-z]+$/i.test(p) && cur.tagName === p.toUpperCase()) return cur;
          }
          cur = cur.parentElement;
        }
        return null;
      }
    };
    if (nodeType === 3) node.nodeValue = tagOrVal;
    else node.tagName = tagOrVal.toUpperCase();
    return node;
  }

  const head = makeNode(1, 'head');
  const body = makeNode(1, 'body');
  const doc = {
    head,
    body,
    getElementById(id) {
      const find = (n) => {
        if (n.id === id) return n;
        for (const c of n.childNodes) {
          if (c.nodeType === 1) {
            const f = find(c);
            if (f) return f;
          }
        }
        return null;
      };
      return find(head) || find(body);
    },
    createElement: (t) => makeNode(1, t),
    createTreeWalker(root, _what, filter) {
      const list = [];
      const walk = (n) => {
        for (const c of n.childNodes) {
          if (filter.acceptNode(c) === 1) {
            list.push(c);
            if (c.nodeType === 1) walk(c);
          }
        }
      };
      walk(root);
      let idx = -1;
      return { nextNode: () => (++idx < list.length ? list[idx] : null) };
    },
    addEventListener() {}
  };

  return { store, makeNode, head, body, doc };
}

// 1. Artifact syntax, manifest & icon checks
const jsFiles = [
  'desktop/ru-localization.js',
  'extension/content.js',
  'extension/popup.js',
  'userscript/github-ru.user.js'
];
for (const rel of jsFiles) {
  const full = path.join(DIST, rel);
  assert.ok(fs.existsSync(full), `Missing build artifact: ${rel}`);
  new vm.Script(fs.readFileSync(full, 'utf8'), { filename: rel });
}

const manifestPath = path.join(DIST, 'extension', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.strictEqual(manifest.manifest_version, 3);
assert.strictEqual(manifest.content_scripts[0].js[0], 'content.js');

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
for (const sz of [16, 48, 128]) {
  const buf = fs.readFileSync(path.join(DIST, 'extension', 'icons', `icon${sz}.png`));
  assert.ok(buf.subarray(0, 8).equals(PNG_SIG), `Invalid PNG signature for icon${sz}.png`);
}

// 2. Desktop bundle test
async function testDesktop() {
  const { store, makeNode, body, doc } = makeMockEnv();
  let capturedMenu = null;
  const mockIpc = {
    invoke: async (_ch, items) => {
      capturedMenu = items;
      return 'ok';
    }
  };

  const app = makeNode(1, 'div');
  app.setAttribute('id', 'desktop-app-container');
  body.appendChild(app);

  const accessWrap = makeNode(1, 'span');
  const srSpan = makeNode(1, 'span'); srSpan.classList.add('sr-only');
  const srText = makeNode(3, 'File'); srSpan.appendChild(srText);
  const akSpan = makeNode(1, 'span'); akSpan.setAttribute('aria-hidden', 'true'); akSpan.classList.add('access-key');
  const akText = makeNode(3, 'F'); akSpan.appendChild(akText);
  const restSpan = makeNode(1, 'span'); restSpan.setAttribute('aria-hidden', 'true');
  const restText = makeNode(3, 'ile'); restSpan.appendChild(restText);
  accessWrap.appendChild(srSpan); accessWrap.appendChild(akSpan); accessWrap.appendChild(restSpan);
  app.appendChild(accessWrap);

  const countEl = makeNode(1, 'div');
  const countText = makeNode(3, '3 changed files');
  countEl.appendChild(countText);
  app.appendChild(countEl);

  const inputEl = makeNode(1, 'input');
  inputEl.setAttribute('placeholder', 'Create README.md');
  app.appendChild(inputEl);

  const diffEl = makeNode(1, 'div');
  diffEl.classList.add('diff-container');
  const diffText = makeNode(3, 'Changes');
  diffEl.appendChild(diffText);
  app.appendChild(diffEl);

  const sandbox = {
    window: null,
    document: doc,
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    MutationObserver: class { observe() {} },
    requestAnimationFrame: (fn) => fn(),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    require: (name) => (name === 'electron' ? { ipcRenderer: mockIpc } : require(name)),
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener: () => {}
  };
  sandbox.window = sandbox;

  const code = fs.readFileSync(path.join(DIST, 'desktop', 'ru-localization.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'dist/desktop/ru-localization.js' });

  assert.strictEqual(srText.nodeValue, 'Файл');
  assert.strictEqual(akText.nodeValue, 'Файл');
  assert.strictEqual(restText.nodeValue, '');
  assert.strictEqual(countText.nodeValue, '3 изменённых файла');
  assert.strictEqual(inputEl.getAttribute('placeholder'), 'Создать README.md');
  assert.strictEqual(diffText.nodeValue, 'Changes');
  assert.strictEqual(sandbox.__ghDesktopRu.translateString('21 changed files'), '21 изменённый файл');
  assert.strictEqual(sandbox.__ghDesktopRu.translateString('Commit to main'), 'Зафиксировать в main');

  const origMenu = [{ label: '&Copy SHA' }, { label: 'Repository', submenu: [{ label: 'Show in &Explorer' }] }];
  await mockIpc.invoke('show-contextual-menu', origMenu);
  assert.strictEqual(origMenu[0].label, '&Copy SHA');
  assert.strictEqual(capturedMenu[0].label, 'Копировать SHA');
  assert.strictEqual(capturedMenu[1].label, 'Репозиторий');
  assert.strictEqual(capturedMenu[1].submenu[0].label, 'Показать в Проводнике');

  sandbox.__ghDesktopRu.setLang('en');
  sandbox.__ghDesktopRu.applyAll();
  assert.strictEqual(srText.nodeValue, 'File');
  assert.strictEqual(akText.nodeValue, 'F');
  assert.strictEqual(restText.nodeValue, 'ile');
  assert.strictEqual(countText.nodeValue, '3 changed files');
  assert.strictEqual(inputEl.getAttribute('placeholder'), 'Create README.md');
}

// 3. Web bundle test
function testWeb() {
  const { store, makeNode, body, doc } = makeMockEnv();

  const navTab = makeNode(1, 'span');
  const navText = makeNode(3, 'Pull requests');
  navTab.appendChild(navText);
  body.appendChild(navTab);

  const btn = makeNode(1, 'button');
  const btnText = makeNode(3, 'Merge pull request');
  btn.appendChild(btnText);
  body.appendChild(btn);

  const starsEl = makeNode(1, 'span');
  const starsText = makeNode(3, '125 stars');
  starsEl.appendChild(starsText);
  body.appendChild(starsEl);

  const md = makeNode(1, 'article');
  md.classList.add('markdown-body');
  const mdText = makeNode(3, 'Pull requests');
  md.appendChild(mdText);
  body.appendChild(md);

  const blob = makeNode(1, 'td');
  blob.classList.add('blob-code');
  const blobText = makeNode(3, 'Issues');
  blob.appendChild(blobText);
  body.appendChild(blob);

  const repoName = makeNode(1, 'strong');
  repoName.setAttribute('itemprop', 'name');
  const repoText = makeNode(3, 'Issues');
  repoName.appendChild(repoText);
  body.appendChild(repoName);

  const sandbox = {
    window: null,
    document: doc,
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    MutationObserver: class { observe() {} },
    requestAnimationFrame: (fn) => fn(),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener: () => {}
  };
  sandbox.window = sandbox;

  const code = fs.readFileSync(path.join(DIST, 'extension', 'content.js'), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: 'dist/extension/content.js' });

  assert.strictEqual(navText.nodeValue, "Pull Request'ы");
  assert.strictEqual(btnText.nodeValue, 'Выполнить слияние (Merge)');
  assert.strictEqual(starsText.nodeValue, '125 звёзд');
  assert.strictEqual(mdText.nodeValue, 'Pull requests', 'Markdown README must remain untouched');
  assert.strictEqual(blobText.nodeValue, 'Issues', 'Code blob must remain untouched');
  assert.strictEqual(repoText.nodeValue, 'Issues', 'Repository name must remain untouched');
  assert.ok(doc.getElementById('gh-ru-web-switcher'), 'Floating switcher must be injected');

  sandbox.__ghRuWeb.setLang('en');
  sandbox.__ghRuWeb.applyAll();
  assert.strictEqual(navText.nodeValue, 'Pull requests');
  assert.strictEqual(btnText.nodeValue, 'Merge pull request');
  assert.strictEqual(starsText.nodeValue, '125 stars');
}

Promise.resolve()
  .then(testDesktop)
  .then(testWeb)
  .then(() => {
    console.log('ALL_BUILD_AND_RUNTIME_TESTS_PASSED');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
