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
