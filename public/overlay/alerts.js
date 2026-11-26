// תצוגת התראות: תור שמציג אחת אחרי השנייה
const ICONS = {
  gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
  follow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4M12 2v13"/></svg>',
  like: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.8 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18l-1.6-10.2-4.9 4.4L12 5l-2.5 7.2-4.9-4.4z"/><rect x="3" y="19.5" width="18" height="2" rx="1"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#F5C542"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#B88A12" stroke-width="2"/></svg>'
};
ICONS.big = ICONS.gift;

function lvEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function AlertsView(root, opts = {}) {
  const stage = document.createElement('div');
  stage.className = 'lv lv-alerts';
  root.appendChild(stage);
  const queue = [];
  let busy = false, gen = 0;

  // מדגיש שם מתנה + ×כמות, או מספר לייקים
  const highlight = sub => lvEsc(sub).replace(/([A-Za-z][\w ]*?\s?×\d+|×\d+|\d[\d,]*\s?(?:לייקים|likes))/g, '<b dir="ltr">$1</b>');

  function render(a) {
    const el = document.createElement('div');
    el.className = 'lv-alert';
    el.dataset.style = a.style || 'gift';
    const media = a.giftImage ? `<img class="lv-gift-img" src="${lvEsc(a.giftImage)}" alt="">`
      : a.avatar ? `<img src="${lvEsc(a.avatar)}" alt="">`
      : (ICONS[a.style] || ICONS.gift);
    el.innerHTML = `
      <div class="lv-media">${media}</div>
      <div class="lv-alert-text">
        <div class="lv-alert-title">${lvEsc(a.title)}</div>
        <div class="lv-alert-sub">${highlight(a.subtitle)}</div>
      </div>
      <div class="lv-timer"><i style="animation-duration:${a.duration}s"></i></div>`;
    stage.appendChild(el);
    return el;
  }
  function next() {
    if (busy || !queue.length) return;
    busy = true;
    const a = queue.shift();
    const el = render(a);
    if (!opts.muted) Sound.play(a.sound);
    const g = gen;
    setTimeout(() => {
      if (g !== gen) return;
      el.classList.add('out');
      setTimeout(() => { if (g !== gen) return; el.remove(); busy = false; setTimeout(next, 200); }, 350);
    }, (a.duration || 5) * 1000);
  }
  return {
    enqueue(a) { queue.push(a); next(); },
    clear() { gen++; queue.length = 0; busy = false; stage.querySelectorAll('.lv-alert').forEach(n => n.remove()); }
  };
}
