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
