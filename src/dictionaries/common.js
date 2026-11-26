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
