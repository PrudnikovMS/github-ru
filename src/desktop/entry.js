const STORAGE_KEY = 'gh_desktop_ru_lang';

function getLang() {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return v === 'en' ? 'en' : 'ru';
  } catch (e) {
    return 'ru';
  }
}

function setLang(lang) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang === 'en' ? 'en' : 'ru');
    }
  } catch (e) {}
}

function isEnglishMode() {
  return getLang() === 'en';
}

const { translateString, translatePlaceholder } = createTranslator(DESKTOP_DICT, DESKTOP_REGEX_RULES);

function installContextMenuHook() {
  try {
    if (typeof require !== 'function') return;
    const electron = require('electron');
    const ipc = electron && electron.ipcRenderer;
    if (!ipc || ipc.__ghRuHooked || typeof ipc.invoke !== 'function') return;
    ipc.__ghRuHooked = true;
    const origInvoke = ipc.invoke.bind(ipc);

    const mapMenuItems = (items) => {
      if (!Array.isArray(items)) return items;
      return items.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const cloned = Object.assign({}, item);
        if (typeof cloned.label === 'string') {
          cloned.label = translateString(cloned.label);
        }
        if (Array.isArray(cloned.submenu)) {
          cloned.submenu = mapMenuItems(cloned.submenu);
        }
        return cloned;
      });
    };

    ipc.invoke = function (channel, ...args) {
      if (channel === 'show-contextual-menu' && !isEnglishMode() && Array.isArray(args[0])) {
        const nextArgs = args.slice();
        nextArgs[0] = mapMenuItems(args[0]);
        return origInvoke(channel, ...nextArgs);
      }
      return origInvoke(channel, ...args);
    };
  } catch (e) {}
}

installContextMenuHook();

const DESKTOP_EXCLUDED = [
  'code', 'pre', 'script', 'style', 'svg', 'textarea', 'input', 'kbd',
  '#gh-desktop-ru-switcher',
  '#diff', '.diff-container', '.diff-code-mirror', '.CodeMirror',
  '.diff-hunk', '.diff-line-gutter',
  '.file-list .filename', '.file-list .path', '.path-text',
  '.commit-details .summary', '.commit-details .body', '.commit-details .author',
  '.commit-list-item .summary', '.commit-list-item .description',
  '.repository-list-item .name', '.branches-list-item .name',
  '.sha', '.user-mention', '.issue-link', '[contenteditable="true"]'
].join(',');

const engine = createDomEngine({
  translateString,
  translatePlaceholder,
  excludedSelector: DESKTOP_EXCLUDED,
  switcherId: 'gh-desktop-ru-switcher',
  isEnglishMode,
  getRootElement: () => document.getElementById('desktop-app-container') || document.body,
  handleAccessText: true
});

function updateSwitcherUi() {
  const enBtn = document.getElementById('gh-ru-btn-en');
  const ruBtn = document.getElementById('gh-ru-btn-ru');
  if (!enBtn || !ruBtn) return;
  const isEn = isEnglishMode();
  enBtn.classList.toggle('active', isEn);
  ruBtn.classList.toggle('active', !isEn);
}

function injectSwitcher() {
  if (!document.head || !document.body) return;
  if (!document.getElementById('gh-desktop-ru-style')) {
    const style = document.createElement('style');
    style.id = 'gh-desktop-ru-style';
    style.textContent = `
      #gh-desktop-ru-switcher {
        position: fixed;
        top: 4px;
        right: 146px;
        height: 20px;
        z-index: 99999;
        display: inline-flex;
        align-items: center;
        gap: 1px;
        padding: 1px;
        border-radius: 9999px;
        border: 1px solid var(--box-border-color, rgba(255, 255, 255, 0.18));
        background: var(--background-color, rgba(36, 41, 46, 0.72));
        -webkit-app-region: no-drag;
        user-select: none;
        font-family: var(--font-family-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
        font-size: 10px;
        line-height: 1;
        box-sizing: border-box;
      }
      #gh-desktop-ru-switcher button {
        border: none;
        background: transparent;
        color: var(--text-secondary-color, #959da5);
        height: 16px;
        padding: 0 6px;
        border-radius: 9999px;
        cursor: pointer;
        font-size: 10px;
        font-weight: 600;
        line-height: 16px;
        margin: 0;
        -webkit-app-region: no-drag;
      }
      #gh-desktop-ru-switcher button:hover:not(.active) {
        color: var(--text-color, #ffffff);
        background: rgba(128, 128, 128, 0.2);
      }
      #gh-desktop-ru-switcher button.active {
        background: var(--box-selected-active-background-color, #0366d6);
        color: #ffffff;
      }
    `;
    document.head.appendChild(style);
  }

  if (!document.getElementById('gh-desktop-ru-switcher')) {
    const box = document.createElement('div');
    box.id = 'gh-desktop-ru-switcher';
    box.title = 'Переключатель языка интерфейса (EN / RU)';

    const enBtn = document.createElement('button');
    enBtn.id = 'gh-ru-btn-en';
    enBtn.type = 'button';
    enBtn.textContent = 'EN';
    enBtn.addEventListener('click', () => {
      setLang('en');
      updateSwitcherUi();
      engine.applyAll();
    });

    const ruBtn = document.createElement('button');
    ruBtn.id = 'gh-ru-btn-ru';
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

function boot() {
  if (!document.body || !document.head) return false;
  injectSwitcher();
  engine.applyAll();
  engine.startObserver('__ghDesktopRuObserver');
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.__ghDesktopRu = {
    translateString,
    applyAll: engine.applyAll,
    getLang,
    setLang
  };
  if (!boot()) {
    const timer = setInterval(() => {
      if (boot()) clearInterval(timer);
    }, 40);
  }
}
