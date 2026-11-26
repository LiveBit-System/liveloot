// LiveLoot i18n: the UI is written in Hebrew, and this file shows it in English when the language is English.
// The server serves it at /i18n.js with window.LL_LANG and window.LL_EN (the dictionary) set first.
// Works in the browser (translates the page and anything added later) and in Node (require it for t()).
(function (root) {
  const HEB = /[֐-׿]/;
  let lang = 'he', exact = new Map(), pats = [];
  function load(dict) {
    exact = new Map(); pats = [];
    for (const [k, v] of Object.entries(dict || {})) {
      const key = k.replace(/\s+/g, ' ').trim();
      if (/\{\d+\}/.test(key)) {
        const names = [];
        const re = key.split(/(\{\d+\})/).map(part => {
          if (/^\{\d+\}$/.test(part)) { names.push(part); return '([\\s\\S]+?)'; }
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('');
        pats.push({ re: new RegExp('^' + re + '$'), names, en: v, weight: key.replace(/\{\d+\}/g, '').length });
      } else exact.set(key, v);
    }
    pats.sort((a, b) => b.weight - a.weight);
  }
  function core(s) {
    let r = exact.get(s);
    if (r != null) return r;
    for (const p of pats) {
      const m = s.match(p.re);
      if (!m) continue;
      let out = p.en;
      p.names.forEach((n, i) => { out = out.split(n).join(tr(m[i + 1])); });
      return out;
    }
    return null;
  }
  // Translates one string. Keeps the spaces and punctuation around it.
  function tr(s) {
    if (lang === 'he' || s == null) return s;
    s = String(s);
    if (!HEB.test(s)) return s;
    const norm = s.replace(/\s+/g, ' ');
    const m = norm.match(/^(\s*)([\s\S]*?)(\s*)$/);
    let r = core(m[2]);
    if (r == null) {
      const p = m[2].match(/^([\s,.:;!?()"'״׳\-–·•←→]*)([\s\S]*?)([\s,.:;!?()"'״׳\-–·•←→]*)$/);
      if (p && p[2] && p[2] !== m[2]) { const c = core(p[2]); if (c != null) r = p[1] + c + p[3]; }
    }
    if (r == null) {
      // טקסט מורכב מכמה חלקים ("מתנה, מ-100 מטבעות · קול: קריין"): מתרגמים כל חלק לבד
      const parts = m[2].split(/( · | ← |, )/);
      if (parts.length > 1) {
        const out = parts.map((x, i) => i % 2 ? x : tr(x)).join('');
        if (out !== m[2]) r = out;
      }
    }
    if (r == null) return s;
    return m[1] + r.replace(/←/g, '→') + m[3];
  }
  // t('שלח {0}', x) is also allowed: fills {0}, {1} after translating
  function t(s, ...args) {
    let out = tr(s);
    args.forEach((a, i) => { out = out.split('{' + i + '}').join(a); });
    return out;
  }

  const api = { t, tr, load, get lang() { return lang; }, setLang(l) { lang = l === 'en' ? 'en' : 'he'; } };

  if (typeof module !== 'undefined' && module.exports) {
    try { load(require('./i18n-en.json')); } catch (e) {}
    module.exports = api;
    return;
  }

  // ---------- browser ----------
  lang = root.LL_LANG === 'en' ? 'en' : 'he';
  load(root.LL_EN);
  root.LLi18n = api; root.t = t;
  root.LL_LOCALE = lang === 'en' ? 'en-US' : 'he-IL';
  const d = root.document;
  d.documentElement.lang = lang;
  d.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  if (lang === 'he') return;

  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'content', 'data-tip'];
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  const skip = el => !el || SKIP[el.nodeName] || (el.closest && el.closest('[data-noi18n],[contenteditable="true"]'));
  function textNode(n) {
    if (!HEB.test(n.nodeValue) || skip(n.parentElement)) return;
    const v = tr(n.nodeValue);
    if (v !== n.nodeValue) n.nodeValue = v;
  }
  function el(e) {
    if (skip(e)) return;
    for (const a of ATTRS) {
      const v = e.getAttribute && e.getAttribute(a);
      if (v && HEB.test(v)) { const n = tr(v); if (n !== v) e.setAttribute(a, n); }
    }
    if (e.nodeName === 'INPUT' && /^(button|submit)$/i.test(e.type) && HEB.test(e.value)) e.value = tr(e.value);
  }
  function walk(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) return textNode(rootNode);
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    if (rootNode.nodeType === 1) { if (skip(rootNode)) return; el(rootNode); }
    const w = d.createTreeWalker(rootNode, 5 /* elements + text */, null);
    let n;
    while ((n = w.nextNode())) n.nodeType === 3 ? textNode(n) : el(n);
  }
  if (d.title) d.title = tr(d.title);
  const start = () => {
    walk(d.documentElement);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') textNode(m.target);
        else if (m.type === 'attributes') el(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(d.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat('value') });
  };
  // Translate what's already parsed now, and the rest as it arrives
  start();
  // Dialogs that some pages use
  for (const f of ['alert', 'confirm', 'prompt']) {
    const orig = root[f]; if (typeof orig === 'function') root[f] = (msg, ...r) => orig.call(root, tr(msg), ...r);
  }
})(typeof window !== 'undefined' ? window : globalThis);
