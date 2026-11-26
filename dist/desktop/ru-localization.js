// GitHub RU — GitHub Desktop Russian Localization v1.0.0 (MIT License, by prud / PrudnikovMS)
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

  // --- dictionaries/desktop.js ---
const DESKTOP_DICT = Object.assign({}, COMMON_DICT, {
  // Top menus & File
  'file': 'Файл',
  'new repository…': 'Новый репозиторий…',
  'new repository...': 'Новый репозиторий…',
  'add local repository…': 'Добавить локальный репозиторий…',
  'add local repository...': 'Добавить локальный репозиторий…',
  'clone repository…': 'Клонировать репозиторий…',
  'clone repository...': 'Клонировать репозиторий…',
  'options…': 'Настройки…',
  'options...': 'Настройки…',
  'preferences…': 'Настройки…',
  'exit': 'Выход',
  'quit': 'Выход',

  // Edit
  'edit': 'Правка',
  'select all': 'Выделить всё',

  // View
  'view': 'Вид',
  'repository list': 'Список репозиториев',
  'branches list': 'Список веток',
  'worktrees list': 'Список рабочих деревьев',
  'go to summary': 'Перейти к описанию коммита',
  'toggle full screen': 'Полноэкранный режим',
  'reset zoom': 'Сбросить масштаб',
  'zoom in': 'Увеличить масштаб',
  'zoom out': 'Уменьшить масштаб',
  'expand active resizable': 'Расширить активную панель',
  'contract active resizable': 'Сузить активную панель',
  'reload': 'Перезагрузить',
  'toggle developer tools': 'Инструменты разработчика',

  // Repository
  'push': 'Отправить (Push)',
  'pull': 'Получить (Pull)',
  'fetch': 'Проверить изменения (Fetch)',
  'remove…': 'Удалить из списка…',
  'remove...': 'Удалить из списка…',
  'show in explorer': 'Показать в Проводнике',
  'open in github copilot': 'Открыть в GitHub Copilot',
  'open with…': 'Открыть в…',
  'open with...': 'Открыть в…',
  'create issue on github': 'Создать Issue на GitHub',
  'new worktree…': 'Новое рабочее дерево…',
  'new worktree...': 'Новое рабочее дерево…',
  'repository settings…': 'Настройки репозитория…',
  'repository settings...': 'Настройки репозитория…',
  'command line tool': 'Инструмент командной строки',
  'install': 'Установить',
  'uninstall': 'Удалить',

  // Branch
  'new branch…': 'Новая ветка…',
  'new branch...': 'Новая ветка…',
  'rename…': 'Переименовать…',
  'rename...': 'Переименовать…',
  'delete…': 'Удалить…',
  'delete...': 'Удалить…',
  'discard all changes…': 'Отменить все изменения…',
  'discard all changes...': 'Отменить все изменения…',
  'stash all changes…': 'Отложить все изменения (Stash)…',
  'stash all changes': 'Отложить все изменения (Stash)',
  'compare to branch': 'Сравнить с веткой',
  'merge into current branch…': 'Слить в текущую ветку…',
  'merge into current branch...': 'Слить в текущую ветку…',
  'squash and merge into current branch…': 'Объединить (Squash) и слить в текущую ветку…',
  'rebase current branch…': 'Перебазировать текущую ветку…',
  'view branch on github': 'Открыть ветку на GitHub',
  'view pull request on github': 'Открыть Pull Request на GitHub',
  'update from default branch': 'Обновить из основной ветки',

  // Help
  'help': 'Справка',
  'report issue…': 'Сообщить об ошибке…',
  'contact github support…': 'Связаться с поддержкой GitHub…',
  'show user guides': 'Руководства пользователя',
  'show keyboard shortcuts': 'Горячие клавиши',
  'show logs in explorer': 'Показать журналы в Проводнике',
  'about github desktop': 'О программе GitHub Desktop',

  // Toolbar & Header
  'current repository': 'Текущий репозиторий',
  'current branch': 'Текущая ветка',
  'current worktree': 'Текущее рабочее дерево',
  'publish branch': 'Опубликовать ветку',
  'publish repository': 'Опубликовать репозиторий',
  'fetch origin': 'Обновить (Fetch)',
  'pull origin': 'Получить (Pull)',
  'push origin': 'Отправить (Push)',
  'force push origin': 'Принудительно отправить (Force push)',
  'publish your branch to github': 'Опубликовать ветку на GitHub',
  'publish your repository to github': 'Опубликовать репозиторий на GitHub',
  'filter your repositories': 'Фильтр репозиториев',
  'add': 'Добавить',
  'add…': 'Добавить…',
  'refresh': 'Обновить',

  // Changes / Commit / History / Stash
  'no local changes': 'Нет локальных изменений',
  'there are no uncommitted changes in this repository. here are some friendly suggestions for what to do next.':
    'В этом репозитории нет незафиксированных изменений. Вот что можно сделать дальше:',
  'open the repository in your external editor': 'Открыть репозиторий во внешнем редакторе',
  'open in external editor': 'Открыть во внешнем редакторе',
  'view the files of your repository in explorer': 'Открыть папку репозитория в Проводнике',
  'open the repository page on github in your browser': 'Открыть страницу репозитория на GitHub в браузере',
  'summary (required)': 'Заголовок коммита (обязательно)',
  'commit to': 'Зафиксировать в',
  'amend last commit': 'Дополнить последний коммит',
  'amend commit…': 'Дополнить коммит…',
  'amend commit': 'Дополнить коммит',
  'generate commit message with copilot': 'Сгенерировать сообщение коммита с Copilot',
  'commit with copilot': 'Коммит с Copilot',
  'stashed changes': 'Отложенные изменения (Stash)',
  'restore': 'Восстановить',
  'discard': 'Отменить изменения',
  'discard…': 'Отменить изменения…',
  'view stash': 'Просмотреть отложенные изменения',
  'committed': 'Зафиксировано',
  'no commits yet': 'Коммитов пока нет',
  'check out': 'Переключиться',
  'checkout commit': 'Переключиться на коммит',
  'checkout in new worktree…': 'Открыть в новом рабочем дереве…',
  'cherry-pick commit…': 'Применить коммит (Cherry-pick)…',
  'create branch from commit': 'Создать ветку из коммита',
  'create branch based on…': 'Создать ветку на основе…',
  'revert changes in commit': 'Откатить изменения коммита',
  'reset to commit': 'Сбросить ветку до коммита',
  'reset to commit…': 'Сбросить до коммита…',
  'create tag…': 'Создать тег…',
  'delete tag…': 'Удалить тег…',
  'copy sha': 'Копировать SHA',
  'copy branch name': 'Копировать имя ветки',
  'copy paths': 'Копировать пути',
  'copy relative paths': 'Копировать относительные пути',
  'copy repo name': 'Копировать имя репозитория',
  'copy repo path': 'Копировать путь к репозиторию',
  'copy worktree name': 'Копировать имя рабочего дерева',
  'copy worktree path': 'Копировать путь к рабочему дереву',
  'ignore file (add to .gitignore)': 'Игнорировать файл (добавить в .gitignore)',
  'ignore folder (add to .gitignore)': 'Игнорировать папку (добавить в .gitignore)',
  'discard changes…': 'Отменить изменения…',
  'discard changes': 'Отменить изменения',
  'include selected files': 'Включить выбранные файлы',
  'exclude selected files': 'Исключить выбранные файлы',
  'add signed-off-by trailer': 'Добавить подпись Signed-off-by',
  'allow empty commit': 'Разрешить пустой коммит',
  'bypass commit hooks': 'Пропустить хуки коммита',
  'create a merge commit': 'Создать merge-коммит',

  // Diff options
  'unified': 'Единый вид (Unified)',
  'split': 'Раздельный вид (Split)',
  'hide whitespace changes': 'Скрыть изменения пробелов',
  'show whitespace changes': 'Показать изменения пробелов',
  'expand whole file': 'Развернуть весь файл',
  'collapse expanded lines': 'Свернуть развёрнутые строки',
  'expand all': 'Развернуть всё',
  'expand down': 'Развернуть вниз',
  'expand up': 'Развернуть вверх',
  'diff options': 'Настройки сравнения (Diff)',
  'file does not exist on disk': 'Файл отсутствует на диске',

  // Preferences / Options
  'integrations': 'Интеграции',
  'copilot': 'Copilot',
  'git': 'Git',
  'prompts': 'Запросы и подтверждения',
  'advanced': 'Дополнительно',
  'sign in to github.com': 'Войти в GitHub.com',
  'sign in to github enterprise': 'Войти в GitHub Enterprise',
  'external editor': 'Внешний редактор',
  'shell': 'Терминал (Shell)',
  'applications': 'Приложения',
  'theme': 'Тема оформления',
  'light': 'Светлая',
  'dark': 'Тёмная',
  'system': 'Системная',
  'automatically switch theme to match system theme.': 'Автоматически переключать тему в соответствии с темой системы.',
  'default branch name for new repositories': 'Имя основной ветки для новых репозиториев',
  'enable notifications': 'Включить уведомления',
  'show confirmation dialog before…': 'Показывать окно подтверждения перед…',
  'removing repositories': 'Удалением репозиториев',
  'discarding changes': 'Отменой изменений',
  'discarding changes permanently': 'Безвозвратной отменой изменений',
  'discarding stash': 'Удалением отложенных изменений',
  'force pushing': 'Принудительной отправкой (Force push)',
  'committing changes hidden by filter': 'Коммитом изменений, скрытых фильтром',
  'if possible, show a confirmation dialog when committing conflicted files': 'Показывать подтверждение при коммите файлов с конфликтами',
  'usage': 'Статистика использования',
  'help github desktop improve by submitting': 'Помочь улучшить GitHub Desktop, отправляя',
  'usage stats': 'статистику использования',
  'network and credentials': 'Сеть и учётные данные',
  'use system git credential manager': 'Использовать системный менеджер учётных данных Git',
  'background updates': 'Фоновые обновления',
  'periodically fetch and refresh status of all repositories': 'Периодически проверять и обновлять статус всех репозиториев',
  'choose…': 'Выбрать…',
  'browse…': 'Обзор…',

  // Welcome & Dialogs
  "let's get started!": 'Давайте начнём!',
  'add a repository': 'Добавить репозиторий',
  'create a tutorial repository…': 'Создать учебный репозиторий…',
  'clone a repository from the internet…': 'Клонировать репозиторий из интернета…',
  'create a new repository on your hard drive…': 'Создать новый репозиторий на диске…',
  'add an existing repository from your hard drive…': 'Добавить существующий репозиторий с диска…',
  'create a new repository': 'Создать новый репозиторий',
  'create repository': 'Создать репозиторий',
  'clone a repository': 'Клонировать репозиторий',
  'clone': 'Клонировать',
  'add local repository': 'Добавить локальный репозиторий',
  'add a local repository': 'Добавить локальный репозиторий',
  'add repository': 'Добавить репозиторий',
  'local path': 'Локальный путь',
  'initialize this repository with a readme': 'Инициализировать репозиторий с файлом README',
  'git ignore': 'Файл .gitignore',
  'create a branch': 'Создать ветку',
  'create branch': 'Создать ветку',
  'rename branch': 'Переименовать ветку',
  'delete branch': 'Удалить ветку',
  'delete remote branch': 'Удалить ветку на сервере',
  'remove repository': 'Удалить репозиторий',
  'repository settings': 'Настройки репозитория',
  'confirm discard changes': 'Подтверждение отмены изменений',
  'discarded changes will be unrecoverable': 'Отменённые изменения нельзя будет восстановить',
  'overwrite stash?': 'Перезаписать отложенные изменения?',
  'discard stash?': 'Удалить отложенные изменения?',
  'switch branch': 'Переключить ветку',
  'create a pull request from your current branch': 'Создать Pull Request из текущей ветки',
  'preview the pull request from your current branch': 'Предпросмотр Pull Request из текущей ветки',
  'push rejected': 'Отправка (Push) отклонена',
  'newer commits on remote': 'На сервере есть более новые коммиты',
  'are you sure you want to force push?': 'Вы уверены, что хотите выполнить принудительную отправку (Force push)?',
  'authentication failed': 'Ошибка аутентификации',
  'unable to locate git': 'Не удалось найти Git',
  'unable to open external editor': 'Не удалось открыть внешний редактор',
  'do not show this message again': 'Больше не показывать это сообщение',
  'remote url': 'URL удалённого репозитория',
  'ignored files': 'Игнорируемые файлы',
  'branch name': 'Имя ветки',
  'authentication': 'Аутентификация',
  'url or username/repository': 'URL или пользователь/репозиторий',
  'your name': 'Ваше имя',
  'current': 'Текущая',
  'date format': 'Формат даты',
  'number format': 'Формат чисел',
  'diff tab size': 'Размер табуляции в Diff',
  'prefer absolute dates over relative': 'Предпочитать точные даты относительным',
  'always show worktree list': 'Всегда показывать список рабочих деревьев',
  'load git hook environment variables from shell': 'Загружать переменные окружения Git-хуков из shell',
  'cache git hook environment variables': 'Кэшировать переменные окружения Git-хуков',
  'clear repository account assignments': 'Сбросить привязки аккаунтов к репозиториям',
  'repository account': 'Аккаунт репозитория',
  'copilot settings': 'Настройки Copilot',
  'always use copilot when conflicts are detected': 'Всегда использовать Copilot при обнаружении конфликтов',
  'always use copilot for conflict resolution?': 'Всегда использовать Copilot для разрешения конфликтов?',
  'merge successful': 'Слияние выполнено успешно',
  'cherry pick conflicts': 'Конфликты при Cherry-pick',
  'empty commit': 'Пустой коммит',
  'installing update…': 'Установка обновления…',
  'checking out files': 'Извлечение файлов',
  'committing changes': 'Фиксация изменений',
  'compressing objects': 'Сжатие объектов',
  'receiving objects': 'Получение объектов',
  'resolving deltas': 'Обработка дельт',
  'refreshing repository': 'Обновление репозитория',
  'reverting…': 'Откат изменений…',
  'start tutorial': 'Начать обучение',
  'exit tutorial': 'Завершить обучение'
});

const DESKTOP_REGEX_RULES = COMMON_REGEX_RULES.concat([
  { pattern: /^Commit\s+to\s+(.+)$/i, replace: (m) => `Зафиксировать в ${m[1]}` },
  { pattern: /^Fetch\s+(.+)$/i, replace: (m) => `Проверить (${m[1]})` },
  { pattern: /^Pull\s+(.+)$/i, replace: (m) => `Получить из ${m[1]}` },
  { pattern: /^Push\s+(.+)$/i, replace: (m) => `Отправить в ${m[1]}` },
  { pattern: /^Force\s+push\s+(.+)$/i, replace: (m) => `Force push в ${m[1]}` },
  { pattern: /^Fetch\s+the\s+latest\s+changes\s+from\s+(.+)$/i, replace: (m) => `Проверить последние изменения в ${m[1]}` },
  { pattern: /^Open\s+in\s+(.+)$/i, replace: (m) => `Открыть в ${m[1]}` },
  { pattern: /^Open\s+this\s+repository\s+in\s+(.+)$/i, replace: (m) => `Открыть репозиторий в ${m[1]}` },
  { pattern: /^Update\s+from\s+(.+)$/i, replace: (m) => `Обновить из ${m[1]}` },
  { pattern: /^Merge\s+(.+)\s+into\s+(.+)$/i, replace: (m) => `Слить ${m[1]} в ${m[2]}` },
  { pattern: /^Compare\s+to\s+(.+)$/i, replace: (m) => `Сравнить с ${m[1]}` },
  { pattern: /^Create\s+([^\s].*)$/, replace: (m) => `Создать ${m[1]}` },
  { pattern: /^Update\s+([^\s].*)$/, replace: (m) => `Обновить ${m[1]}` },
  { pattern: /^Delete\s+([^\s].*)$/, replace: (m) => `Удалить ${m[1]}` }
]);

  // --- desktop/entry.js ---
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

})();
