(() => {
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
