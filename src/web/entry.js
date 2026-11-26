const STORAGE_KEY = 'gh_ru_web_lang';

function getLang() {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return v === 'en' ? 'en' : 'ru';
  } catch (e) {
    return 'ru';
  }
}

function setLang(lang) {
  const next = lang === 'en' ? 'en' : 'ru';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
    }
  } catch (e) {}
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: next });
    }
  } catch (e) {}
  return next;
}

function isEnglishMode() {
  return getLang() === 'en';
}

const { translateString, translatePlaceholder } = createTranslator(WEB_DICT, WEB_REGEX_RULES);

const WEB_EXCLUDED = [
  'code', 'pre', 'kbd', 'textarea', 'input', 'script', 'style', 'svg',
  '#gh-ru-web-switcher',
  '.markdown-body', '.comment-body',
  '.blob-code', '.blob-code-inner', '.react-code-lines', '.react-file-line', '.react-code-text',
  '.highlight', '.diff-table', '.file-diff-split',
  '.commit-title', '.commit-desc', '.commit-message',
  '[data-testid="file-name-id"]', '[itemprop="name"]', '[itemprop="additionalName"]',
  '.author', '.vcard-fullname', '.vcard-username', '.user-mention', '.issue-link',
  '[contenteditable="true"]'
].join(',');

const engine = createDomEngine({
  translateString,
  translatePlaceholder,
  excludedSelector: WEB_EXCLUDED,
  switcherId: 'gh-ru-web-switcher',
  isEnglishMode,
  getRootElement: () => document.body,
  handleAccessText: false
});

function updateSwitcherUi() {
  const enBtn = document.getElementById('gh-ru-web-btn-en');
  const ruBtn = document.getElementById('gh-ru-web-btn-ru');
  if (!enBtn || !ruBtn) return;
  const isEn = isEnglishMode();
  enBtn.classList.toggle('active', isEn);
  ruBtn.classList.toggle('active', !isEn);
}

function injectSwitcher() {
  if (!document.head || !document.body) return;
  if (!document.getElementById('gh-ru-web-style')) {
    const style = document.createElement('style');
    style.id = 'gh-ru-web-style';
    style.textContent = `
      #gh-ru-web-switcher {
        position: fixed;
        bottom: 16px;
        right: 16px;
        height: 28px;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        border-radius: 9999px;
        border: 1px solid var(--borderColor-default, rgba(128, 128, 128, 0.35));
        background: var(--bgColor-default, rgba(13, 17, 23, 0.9));
        color: var(--fgColor-default, #e6edf3);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
        backdrop-filter: blur(8px);
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 11px;
        line-height: 1;
        box-sizing: border-box;
      }
      #gh-ru-web-switcher button {
        border: none;
        background: transparent;
        color: var(--fgColor-muted, #8b949e);
        height: 22px;
        padding: 0 9px;
        border-radius: 9999px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        line-height: 22px;
        margin: 0;
      }
      #gh-ru-web-switcher button:hover:not(.active) {
        color: var(--fgColor-default, #ffffff);
        background: rgba(128, 128, 128, 0.16);
      }
      #gh-ru-web-switcher button.active {
        background: #238636;
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  if (!document.getElementById('gh-ru-web-switcher')) {
    const box = document.createElement('div');
    box.id = 'gh-ru-web-switcher';
    box.title = 'GitHub RU: переключить язык (EN / RU)';

    const enBtn = document.createElement('button');
    enBtn.id = 'gh-ru-web-btn-en';
    enBtn.type = 'button';
    enBtn.textContent = 'EN';
    enBtn.addEventListener('click', () => {
      setLang('en');
      updateSwitcherUi();
      engine.applyAll();
    });

    const ruBtn = document.createElement('button');
    ruBtn.id = 'gh-ru-web-btn-ru';
    ruBtn.type = 'button';
    ruBtn.textContent = 'RU';
    ruBtn.addEventListener('click', () => {
      setLang('ru');
      updateSwitcherUi();
      engine.applyAll();
    });

    box.appendChild(enBtn);
    box.appendChild(ruBtn);
    document.body.appendChild(box);
    updateSwitcherUi();
  }
}

function bindExtensionBridge() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        if (res && (res[STORAGE_KEY] === 'en' || res[STORAGE_KEY] === 'ru')) {
          try { localStorage.setItem(STORAGE_KEY, res[STORAGE_KEY]); } catch (e) {}
          updateSwitcherUi();
          engine.applyAll();
        }
      });
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'GH_RU_SET_LANG') {
          setLang(msg.lang);
          updateSwitcherUi();
          engine.applyAll();
          if (typeof sendResponse === 'function') sendResponse({ ok: true, lang: getLang() });
        } else if (msg.type === 'GH_RU_GET_LANG') {
          if (typeof sendResponse === 'function') sendResponse({ lang: getLang() });
        }
      });
    }
  } catch (e) {}
}

function bindSpaEvents() {
  if (window.__ghRuWebSpaBound) return;
  window.__ghRuWebSpaBound = true;
  const onNav = () => {
    injectSwitcher();
    engine.scheduleApply();
  };
  document.addEventListener('turbo:load', onNav);
  document.addEventListener('turbo:render', onNav);
  document.addEventListener('pjax:end', onNav);
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', onNav);
  }
}

function boot() {
  if (!document.body || !document.head) return false;
  injectSwitcher();
  bindExtensionBridge();
  bindSpaEvents();
  engine.applyAll();
  engine.startObserver('__ghRuWebObserver');
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.__ghRuWeb = {
    translateString,
    applyAll: engine.applyAll,
    getLang,
    setLang
  };
  if (!boot()) {
    const timer = setInterval(() => {
      if (boot()) clearInterval(timer);
    }, 50);
  }
}
