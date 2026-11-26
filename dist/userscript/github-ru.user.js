// ==UserScript==
// @name         GitHub RU — Русификатор GitHub.com
// @namespace    https://github.com/PrudnikovMS/github-ru
// @version      1.0.0
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

// GitHub RU — GitHub.com Russian Localization v1.0.0 (MIT License, by prud / PrudnikovMS)
(() => {
  'use strict';

  // --- core/translator.js ---
function normalizeKey(str) {
  if (!str) return '';
  return String(str)
    .replace(/&([^&])/g, '$1')
    .replace(/[\s\u00a0\u2007\u202f\r\n\t]+/g, ' ')
    .trim()
    .toLowerCase();
}

function pluralize(count, one, two, five) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return five;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;
  return five;
}

function translateRelativeTime(str) {
  if (!str) return str;
  let res = String(str).trim();
  if (/^(?:just\s+)?now$/i.test(res)) return 'только что';
  if (/^less than a minute ago$/i.test(res)) return 'меньше минуты назад';
  if (/^a minute ago$/i.test(res)) return 'минуту назад';
  if (/^an hour ago$/i.test(res)) return 'час назад';
  if (/^a day ago$/i.test(res)) return 'день назад';
  if (/^yesterday$/i.test(res)) return 'вчера';
  if (/^today$/i.test(res)) return 'сегодня';
  if (/^never$/i.test(res)) return 'никогда';

  res = res.replace(/^(\d+)\s+seconds?\s+ago$/i, (_, p1) => {
    const n = parseInt(p1, 10);
    return `${n} ${pluralize(n, 'секунду', 'секунды', 'секунд')} назад`;
  });
  res = res.replace(/^(\d+)\s+minutes?\s+ago$/i, (_, p1) => {
    const n = parseInt(p1, 10);
    return `${n} ${pluralize(n, 'минуту', 'минуты', 'минут')} назад`;
  });
  res = res.replace(/^(\d+)\s+hours?\s+ago$/i, (_, p1) => {
    const n = parseInt(p1, 10);
    return `${n} ${pluralize(n, 'час', 'часа', 'часов')} назад`;
  });
  res = res.replace(/^(\d+)\s+days?\s+ago$/i, (_, p1) => {
    const n = parseInt(p1, 10);
    return `${n} ${pluralize(n, 'день', 'дня', 'дней')} назад`;
  });
  res = res.replace(/^(\d+)\s+weeks?\s+ago$/i, (_, p1) => {
    const n = parseInt(p1, 10);
    return `${n} ${pluralize(n, 'неделю', 'недели', 'недель')} назад`;
  });
  res = res.replace(/^(\d+)\s+months?\s+ago$/i, (_, p1) => {
    const n = parseInt(p1, 10);
    return `${n} ${pluralize(n, 'месяц', 'месяца', 'месяцев')} назад`;
  });
  res = res.replace(/^(\d+)\s+years?\s+ago$/i, (_, p1) => {
    const n = parseInt(p1, 10);
    return `${n} ${pluralize(n, 'год', 'года', 'лет')} назад`;
  });
  return res;
}

function createTranslator(exactDict, regexRules) {
  function translateString(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    const key = normalizeKey(raw);
    if (!key) return raw;

    if (Object.prototype.hasOwnProperty.call(exactDict, key)) {
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      return lead + exactDict[key] + trail;
    }

    const clean = raw.replace(/&([^&])/g, '$1').trim();
    for (const rule of regexRules) {
      const m = clean.match(rule.pattern);
      if (m) {
        const out = rule.replace(m);
        if (out && out !== clean) {
          const lead = raw.match(/^\s*/)[0];
          const trail = raw.match(/\s*$/)[0];
          return lead + out + trail;
        }
      }
    }
    return raw;
  }

  function translatePlaceholder(raw) {
    return translateString(raw);
  }

  return { translateString, translatePlaceholder };
}

  // --- core/dom-engine.js ---
function createDomEngine(config) {
  const {
    translateString,
    translatePlaceholder,
    excludedSelector,
    switcherId,
    isEnglishMode,
    getRootElement,
    handleAccessText = false,
    translatedAttrs = ['placeholder', 'title', 'aria-label']
  } = config;

  const originalTextMap = new WeakMap();
  const originalAttrMap = new WeakMap();
  const accessTextOriginalMap = new WeakMap();

  let isApplying = false;
  let scheduledRaf = 0;

  function isExcludedElement(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      return typeof el.closest === 'function' && !!el.closest(excludedSelector);
    } catch (e) {
      return false;
    }
  }

  function isAccessTextSpan(el) {
    if (!handleAccessText || !el || el.nodeType !== 1 || el.tagName !== 'SPAN') return false;
    let hasSrOnly = false;
    let hasHidden = false;
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (c.classList && c.classList.contains('sr-only')) hasSrOnly = true;
      else if (c.getAttribute('aria-hidden') === 'true') hasHidden = true;
    }
    return hasSrOnly && hasHidden;
  }

  function applyAccessTextElement(el, toEnglish) {
    if (isExcludedElement(el)) return;
    let srNode = null;
    const hiddenNodes = [];
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (c.classList && c.classList.contains('sr-only')) {
        if (c.firstChild && c.firstChild.nodeType === 3) srNode = c.firstChild;
      } else if (c.getAttribute('aria-hidden') === 'true') {
        if (c.firstChild && c.firstChild.nodeType === 3) hiddenNodes.push(c.firstChild);
      }
    }
    if (!srNode || hiddenNodes.length === 0) return;

    let rec = accessTextOriginalMap.get(el);
    if (!rec || (srNode.nodeValue !== rec.lastRu && srNode.nodeValue !== rec.origSr)) {
      rec = {
        origSr: srNode.nodeValue,
        origHidden: hiddenNodes.map((n) => ({ node: n, orig: n.nodeValue })),
        lastRu: null
      };
      accessTextOriginalMap.set(el, rec);
    }

    if (toEnglish) {
      if (srNode.nodeValue !== rec.origSr) srNode.nodeValue = rec.origSr;
      for (const h of rec.origHidden) {
        if (h.node.nodeValue !== h.orig) h.node.nodeValue = h.orig;
      }
      return;
    }

    const translated = translateString(rec.origSr);
    if (translated !== rec.origSr) {
      rec.lastRu = translated;
      if (srNode.nodeValue !== translated) srNode.nodeValue = translated;
      if (hiddenNodes[0].nodeValue !== translated) hiddenNodes[0].nodeValue = translated;
      for (let i = 1; i < hiddenNodes.length; i++) {
        if (hiddenNodes[i].nodeValue !== '') hiddenNodes[i].nodeValue = '';
      }
    }
  }

  function applyTextNode(node, toEnglish) {
    const parent = node.parentElement;
    if (!parent || isExcludedElement(parent)) return;
    if (handleAccessText && parent.closest && parent.closest('[data-gh-ru-access]')) return;

    let rec = originalTextMap.get(node);
    const cur = node.nodeValue;
    if (!rec) {
      rec = { orig: cur, lastRu: null };
      originalTextMap.set(node, rec);
    } else if (cur !== rec.orig && cur !== rec.lastRu) {
      rec.orig = cur;
      rec.lastRu = null;
    }

    if (toEnglish) {
      if (node.nodeValue !== rec.orig) node.nodeValue = rec.orig;
      return;
    }

    const translated = translateString(rec.orig);
    if (translated !== rec.orig) {
      rec.lastRu = translated;
      if (node.nodeValue !== translated) node.nodeValue = translated;
    }
  }

  function applyElementAttrs(el, toEnglish) {
    if (!el || el.nodeType !== 1) return;
    if (switcherId && (el.id === switcherId || (el.closest && el.closest('#' + switcherId)))) return;

    const tag = el.tagName;
    const isField = tag === 'INPUT' || tag === 'TEXTAREA';
    if (!isField && isExcludedElement(el)) return;

    let attrMap = originalAttrMap.get(el);
    if (!attrMap) {
      attrMap = {};
      originalAttrMap.set(el, attrMap);
    }

    for (const attr of translatedAttrs) {
      if (!el.hasAttribute(attr)) continue;
      const cur = el.getAttribute(attr);
      let rec = attrMap[attr];
      if (!rec) {
        rec = { orig: cur, lastRu: null };
        attrMap[attr] = rec;
      } else if (cur !== rec.orig && cur !== rec.lastRu) {
        rec.orig = cur;
        rec.lastRu = null;
      }

      if (toEnglish) {
        if (cur !== rec.orig) el.setAttribute(attr, rec.orig);
      } else {
        const next = attr === 'placeholder' ? translatePlaceholder(rec.orig) : translateString(rec.orig);
        if (next !== rec.orig) {
          rec.lastRu = next;
          if (cur !== next) el.setAttribute(attr, next);
        }
      }
    }
  }

  function processSubtree(root, toEnglish) {
    if (!root) return;
    if (root.nodeType === 3) {
      applyTextNode(root, toEnglish);
      return;
    }
    if (root.nodeType !== 1) return;
    if (switcherId && root.id === switcherId) return;

    const accessSpans = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === 1 && switcherId && node.id === switcherId) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let cur = root;
    while (cur) {
      if (cur.nodeType === 1) {
        applyElementAttrs(cur, toEnglish);
        if (isAccessTextSpan(cur)) {
          cur.setAttribute('data-gh-ru-access', '1');
          accessSpans.push(cur);
        }
      } else if (cur.nodeType === 3) {
        applyTextNode(cur, toEnglish);
      }
      cur = walker.nextNode();
    }

    for (const sp of accessSpans) {
      applyAccessTextElement(sp, toEnglish);
    }
  }

  function applyAll() {
    if (!document.body || isApplying) return;
    isApplying = true;
    try {
      const toEnglish = isEnglishMode();
      const root = (typeof getRootElement === 'function' ? getRootElement() : null) || document.body;
      processSubtree(root, toEnglish);
    } finally {
      isApplying = false;
    }
  }

  function scheduleApply() {
    if (scheduledRaf) return;
    scheduledRaf = requestAnimationFrame(() => {
      scheduledRaf = 0;
      applyAll();
    });
  }

  function startObserver(observerFlagKey) {
    if (!document.body || window[observerFlagKey]) return;
    const observer = new MutationObserver((mutations) => {
      if (isApplying) return;
      for (const m of mutations) {
        if (
          switcherId &&
          m.target &&
          (m.target.id === switcherId || (m.target.closest && m.target.closest('#' + switcherId)))
        ) {
          continue;
        }
        scheduleApply();
        break;
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttrs
    });
    window[observerFlagKey] = observer;
  }

  return { applyAll, scheduleApply, startObserver };
}

  // --- dictionaries/common.js ---
const COMMON_DICT = {
  'repository': 'Репозиторий',
  'repositories': 'Репозитории',
  'branch': 'Ветка',
  'branches': 'Ветки',
  'changes': 'Изменения',
  'history': 'История',
  'commits': 'Коммиты',
  'commit': 'Коммит',
  'tag': 'Тег',
  'tags': 'Теги',
  'file': 'Файл',
  'files': 'Файлы',
  'settings': 'Настройки',
  'options': 'Настройки',
  'preferences': 'Настройки',
  'accounts': 'Аккаунты',
  'account': 'Аккаунт',
  'appearance': 'Внешний вид',
  'notifications': 'Уведомления',
  'accessibility': 'Специальные возможности',
  'security': 'Безопасность',
  'sign in': 'Войти',
  'sign out': 'Выйти',
  'save': 'Сохранить',
  'cancel': 'Отмена',
  'close': 'Закрыть',
  'ok': 'ОК',
  'confirm': 'Подтвердить',
  'continue': 'Продолжить',
  'apply': 'Применить',
  'reset': 'Сбросить',
  'create': 'Создать',
  'delete': 'Удалить',
  'rename': 'Переименовать',
  'remove': 'Удалить',
  'copy': 'Копировать',
  'cut': 'Вырезать',
  'paste': 'Вставить',
  'undo': 'Отменить',
  'redo': 'Повторить',
  'find': 'Найти',
  'filter': 'Фильтр',
  'search…': 'Поиск…',
  'description': 'Описание',
  'license': 'Лицензия',
  'name': 'Имя',
  'email': 'Электронная почта',
  'path': 'Путь',
  'enabled': 'Включено',
  'disabled': 'Отключено',
  'loading…': 'Загрузка…',
  'learn more': 'Подробнее',
  'error': 'Ошибка',
  'warning': 'Предупреждение',
  'public': 'Публичный',
  'private': 'Приватный',
  'open': 'Открыт',
  'closed': 'Закрыт',
  'merged': 'Слит',
  'draft': 'Черновик',
  'create pull request': 'Создать Pull Request',
  'preview pull request': 'Предпросмотр Pull Request',
  'compare & pull request': 'Сравнить и создать Pull Request',
  'compare on github': 'Сравнить на GitHub',
  'view on github': 'Открыть на GitHub'
};

const COMMON_REGEX_RULES = [
  {
    pattern: /^(\d+)\s+changed\s+files?$/i,
    replace: (m) => {
      const n = parseInt(m[1], 10);
      return `${n} ${pluralize(n, 'изменённый файл', 'изменённых файла', 'изменённых файлов')}`;
    }
  },
  {
    pattern: /^(\d+)\s+files?\s+selected$/i,
    replace: (m) => {
      const n = parseInt(m[1], 10);
      return `${n} ${pluralize(n, 'файл выбран', 'файла выбрано', 'файлов выбрано')}`;
    }
  },
  {
    pattern: /^(\d+)\s+conflicted\s+files?$/i,
    replace: (m) => {
      const n = parseInt(m[1], 10);
      return `${n} ${pluralize(n, 'конфликтный файл', 'конфликтных файла', 'конфликтных файлов')}`;
    }
  },
  {
    pattern: /^(\d+)\s+commits?$/i,
    replace: (m) => {
      const n = parseInt(m[1], 10);
      return `${n} ${pluralize(n, 'коммит', 'коммита', 'коммитов')}`;
    }
  },
  {
    pattern: /^(\d+)\s+branches?$/i,
    replace: (m) => {
      const n = parseInt(m[1], 10);
      return `${n} ${pluralize(n, 'ветка', 'ветки', 'веток')}`;
    }
  },
  {
    pattern: /^(\d+)\s+tags?$/i,
    replace: (m) => {
      const n = parseInt(m[1], 10);
      return `${n} ${pluralize(n, 'тег', 'тега', 'тегов')}`;
    }
  },
  {
    pattern: /^Last\s+fetched\s+(.+)$/i,
    replace: (m) => `Последняя проверка: ${translateRelativeTime(m[1])}`
  }
];

  // --- dictionaries/web.js ---
const WEB_DICT = Object.assign({}, COMMON_DICT, {
  // Global header & dashboard
  'dashboard': 'Главная',
  'home': 'Главная',
  'feed': 'Лента',
  'issues': 'Задачи (Issues)',
  'pull requests': 'Pull Request\'ы',
  'discussions': 'Обсуждения',
  'actions': 'Действия (Actions)',
  'projects': 'Проекты',
  'wiki': 'Вики',
  'insights': 'Аналитика',
  'code': 'Код',
  'explore': 'Обзор',
  'marketplace': 'Маркетплейс',
  'codespaces': 'Codespaces',
  'gists': 'Gist-ы',
  'top repositories': 'Популярные репозитории',
  'recent activity': 'Недавняя активность',
  'new': 'Создать',
  'new repository': 'Новый репозиторий',
  'import repository': 'Импортировать репозиторий',
  'new gist': 'Новый Gist',
  'new organization': 'Новая организация',
  'new project': 'Новый проект',
  'type / to search': 'Нажмите / для поиска',
  'search or jump to...': 'Поиск или переход…',

  // User menu & Profile
  'your profile': 'Ваш профиль',
  'your repositories': 'Ваши репозитории',
  'your projects': 'Ваши проекты',
  'your stars': 'Ваши звёзды',
  'your gists': 'Ваши Gist-ы',
  'your organizations': 'Ваши организации',
  'your enterprises': 'Ваши Enterprise',
  'your sponsors': 'Ваши спонсоры',
  'set status': 'Установить статус',
  'edit profile': 'Редактировать профиль',
  'overview': 'Обзор',
  'stars': 'Звёзды',
  'packages': 'Пакеты',
  'popular repositories': 'Популярные репозитории',
  'pinned': 'Закреплённые',
  'customize your pins': 'Настроить закреплённые',
  'follow': 'Подписаться',
  'unfollow': 'Отписаться',
  'followers': 'Подписчики',
  'following': 'Подписки',
  'achievements': 'Достижения',
  'highlights': 'Избранное',
  'organizations': 'Организации',
  'sponsoring': 'Спонсорство',
  'feature preview': 'Новые функции',
  'sign up': 'Регистрация',

  // Repository Header & File Tree
  'public template': 'Публичный шаблон',
  'private template': 'Приватный шаблон',
  'watch': 'Отслеживать',
  'unwatch': 'Не отслеживать',
  'watching': 'Отслеживают',
  'fork': 'Форкнуть (Fork)',
  'forks': 'Форки',
  'star': 'В избранное (Star)',
  'starred': 'В избранном',
  'sponsor': 'Поддержать',
  'pin': 'Закрепить',
  'unpin': 'Открепить',
  'use this template': 'Использовать шаблон',
  'go to file': 'Перейти к файлу',
  'add file': 'Добавить файл',
  'create new file': 'Создать новый файл',
  'upload files': 'Загрузить файлы',
  'download zip': 'Скачать ZIP',
  'open with github desktop': 'Открыть в GitHub Desktop',
  'clone': 'Клонировать',
  'https': 'HTTPS',
  'ssh': 'SSH',
  'github cli': 'GitHub CLI',
  'local': 'Локально',
  'about': 'О проекте',
  'no description, website, or topics provided.': 'Описание, сайт и темы не указаны.',
  'readme': 'README',
  'code of conduct': 'Правила поведения',
  'contributing': 'Участие в разработке',
  'security policy': 'Политика безопасности',
  'activity': 'Активность',
  'releases': 'Релизы',
  'no releases published': 'Релизы ещё не опубликованы',
  'create a new release': 'Создать новый релиз',
  'no packages published': 'Пакеты не опубликованы',
  'deployments': 'Развёртывания',
  'environments': 'Окружения',
  'contributors': 'Участники',
  'languages': 'Языки',
  'view all branches': 'Все ветки',
  'view all tags': 'Все теги',
  'switch branches/tags': 'Переключить ветку/тег',
  'find or create a branch…': 'Найти или создать ветку…',
  'default': 'По умолчанию',
  'latest': 'Последний',

  // Issues & Pull Requests
  'new issue': 'Новая задача',
  'new pull request': 'Новый Pull Request',
  'labels': 'Метки',
  'milestones': 'Этапы (Milestones)',
  'assignees': 'Исполнители',
  'author': 'Автор',
  'reviews': 'Ревью',
  'reviewers': 'Ревьюеры',
  'sort': 'Сортировка',
  'newest': 'Сначала новые',
  'oldest': 'Сначала старые',
  'most commented': 'Больше всего комментариев',
  'recently updated': 'Недавно обновлённые',
  'conversation': 'Обсуждение',
  'checks': 'Проверки',
  'files changed': 'Изменённые файлы',
  'review changes': 'Оставить ревью',
  'approve': 'Одобрить',
  'request changes': 'Запросить правки',
  'comment': 'Комментировать',
  'submit review': 'Отправить ревью',
  'merge pull request': 'Выполнить слияние (Merge)',
  'confirm merge': 'Подтвердить слияние',
  'squash and merge': 'Объединить и слить (Squash)',
  'confirm squash and merge': 'Подтвердить Squash and merge',
  'rebase and merge': 'Перебазировать и слить (Rebase)',
  'confirm rebase and merge': 'Подтвердить Rebase and merge',
  'close issue': 'Закрыть задачу',
  'reopen issue': 'Переоткрыть задачу',
  'close pull request': 'Закрыть Pull Request',
  'reopen pull request': 'Переоткрыть Pull Request',
  'delete branch': 'Удалить ветку',
  'restore branch': 'Восстановить ветку',
  'write': 'Редактор',
  'preview': 'Предпросмотр',
  'subscribe': 'Подписаться',
  'unsubscribe': 'Отписаться',
  'leave a comment': 'Оставьте комментарий',
  'add a comment': 'Добавить комментарий',
  'commit changes': 'Зафиксировать изменения',
  'commit changes…': 'Зафиксировать изменения…',
  'propose changes': 'Предложить изменения',
  'edit file': 'Редактировать файл',
  'raw': 'Исходник (Raw)',
  'blame': 'История строк (Blame)',
  'copy raw file': 'Копировать исходный код',
  'download raw file': 'Скачать файл',

  // Repository Settings
  'general': 'Основные',
  'collaborators': 'Участники доступа',
  'collaborators and teams': 'Участники и команды',
  'moderation options': 'Модерация',
  'rules': 'Правила',
  'rulesets': 'Наборы правил',
  'webhooks': 'Вебхуки (Webhooks)',
  'pages': 'GitHub Pages',
  'secrets and variables': 'Секреты и переменные',
  'code security': 'Безопасность кода',
  'deploy keys': 'Ключи развёртывания',
  'danger zone': 'Опасная зона',
  'change repository visibility': 'Изменить видимость репозитория',
  'change visibility': 'Изменить видимость',
  'transfer ownership': 'Передать права владения',
  'transfer': 'Передать',
  'archive this repository': 'Архивировать репозиторий',
  'unarchive this repository': 'Разархивировать репозиторий',
  'delete this repository': 'Удалить этот репозиторий',
  'repository name': 'Название репозитория',
  'template repository': 'Репозиторий-шаблон',
  'default branch': 'Основная ветка',
  'social preview': 'Обложка для соцсетей',
  'features': 'Разделы',
  'pull requests': 'Pull Request\'ы',
  'sponsorships': 'Спонсорство',
  'preserve this repository': 'Сохранить репозиторий в архив'
});

const WEB_REGEX_RULES = COMMON_REGEX_RULES.concat([
  {
    pattern: /^(\d+)\s+stars?$/i,
    replace: (m) => {
      const n = parseInt(m[1], 10);
      return `${n} ${pluralize(n, 'звезда', 'звезды', 'звёзд')}`;
    }
  },
  {
    pattern: /^(\d+)\s+forks?$/i,
    replace: (m) => {
      const n = parseInt(m[1], 10);
      return `${n} ${pluralize(n, 'форк', 'форка', 'форков')}`;
    }
  },
  {
    pattern: /^(\d+)\s+watching$/i,
    replace: (m) => `${m[1]} отслеживают`
  },
  {
    pattern: /^(\d+)\s+open$/i,
    replace: (m) => `${m[1]} открыто`
  },
  {
    pattern: /^(\d+)\s+closed$/i,
    replace: (m) => `${m[1]} закрыто`
  },
  {
    pattern: /^Updated\s+(.+)$/i,
    replace: (m) => `Обновлено ${translateRelativeTime(m[1])}`
  },
  {
    pattern: /^opened\s+(.+)$/i,
    replace: (m) => `открыто ${translateRelativeTime(m[1])}`
  },
  {
    pattern: /^committed\s+(.+)$/i,
    replace: (m) => `коммит ${translateRelativeTime(m[1])}`
  }
]);

  // --- web/entry.js ---
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

})();
