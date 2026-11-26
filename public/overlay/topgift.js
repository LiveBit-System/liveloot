// מתנה מצוירת (שלנו, לא תמונה של טיקטוק) שמופיעה לפני המתנה הראשונה
const GIFT_ART = `<svg class="lv-ph" viewBox="0 0 200 180" aria-hidden="true">
  <rect x="38" y="78" width="124" height="92" rx="14" fill="#200A3A"/>
  <rect x="38" y="70" width="124" height="92" rx="14" fill="#FF3E8A" stroke="#200A3A" stroke-width="8"/>
  <rect x="28" y="50" width="144" height="34" rx="10" fill="#FF6FA8" stroke="#200A3A" stroke-width="8"/>
  <rect x="88" y="50" width="24" height="112" fill="#FFD23F" stroke="#200A3A" stroke-width="8"/>
  <path d="M100 50 C 70 10, 40 30, 62 48 Z M100 50 C 130 10, 160 30, 138 48 Z" fill="#FFD23F" stroke="#200A3A" stroke-width="8" stroke-linejoin="round"/>
  <path d="M52 92 h18 M52 108 h10" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".6"/>
</svg>`;
// תצוגת Top Gift: המתנה הכי גדולה בלייב, עם אנימציה כשמישהו עוקף
function TopGiftView(root, opts = {}) {
  const el = document.createElement('div');
  el.className = 'lv lv-top';
  root.appendChild(el);
  let settings = {};
  let top = null;
  let shownCoins = 0;
  let countAnim = null;

  const fmt = n => Number(n || 0).toLocaleString(LL_LOCALE);
  // מצב רצף (Top Streak): במקום מטבעות מראים כמה ברצף
  const valOf = t => opts.streak ? (t.count || 0) : (t.coins || 0);
  const numIcon = () => opts.streak ? '<b class="lv-x">×</b>' : ICONS.coin;
  // כיוון שורת המטבעות לפי השפה: "15,000 COINS" באנגלית, "15,000 מטבעות" בעברית
  const coinsDir = () => /[\u0590-\u05FF]/.test(settings.coinsLabel || '') ? 'rtl' : 'ltr';

  function applySettings() {
    const s = settings;
    el.dataset.font = s.font || 'fredoka';
    el.classList.toggle('outline', !!s.outline);
    el.style.setProperty('--outline', s.outlineColor || '#141414');
  }

  function render() {
    const s = settings;
    applySettings();
    const titleStyle = `color:${lvEsc(s.titleColor)};font-size:${(s.titleSize || 50) / 50}em`;
    if (!top) {
      // לפני שמישהו שלח מתנה: קופסת מתנה מצוירת שלנו ומספר מטבעות לדוגמה
      el.innerHTML = `
        <div class="lv-top-title" style="${titleStyle}">${lvEsc(s.title)}</div>
        ${s.showGift === false ? '' : `<div class="lv-top-gift">${GIFT_ART}</div>`}
        ${s.showCoins === false ? '' : `<div class="lv-top-coins" dir="${coinsDir()}" style="color:${lvEsc(s.coinsColor)}">
          ${numIcon()}<span class="lv-num">${fmt(s.emptyCoins ?? 15000)}</span> ${lvEsc(s.coinsLabel)}</div>`}`;
      return;
    }
    const gift = s.showGift === false ? '' : `
      <div class="lv-top-gift">${top.giftImage
        ? `<img src="${lvEsc(top.giftImage)}" alt="${lvEsc(top.gift)}">`
        : `<svg class="lv-gift-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>`}
        <div class="lv-burst"></div>
      </div>`;
    const avatar = s.showAvatar !== false && top.avatar ? `<img class="lv-top-avatar" src="${lvEsc(top.avatar)}" alt="">` : '';
    el.innerHTML = `
      <div class="lv-top-title" style="${titleStyle}">${lvEsc(s.title)}</div>
      ${gift}
      <div class="lv-top-row" style="font-size:${(s.nameSize || 50) / 50}em">
        ${ICONS.crown.replace('<svg', '<svg class="lv-crown"')}
        ${avatar}
        <span class="lv-top-name" style="color:${lvEsc(s.nameColor)}" dir="auto">${lvEsc(top.name)}</span>
      </div>
      ${s.showCoins === false ? '' : `<div class="lv-top-coins" dir="${coinsDir()}" style="color:${lvEsc(s.coinsColor)}">
        ${numIcon()}<span class="lv-num">${fmt(shownCoins)}</span> ${lvEsc(s.coinsLabel)}</div>`}
      <div class="lv-top-beat"></div>`;
  }

  function countTo(target) {
    cancelAnimationFrame(countAnim);
    const from = shownCoins, start = performance.now(), dur = 900;
    const step = now => {
      const t = Math.min(1, (now - start) / dur);
      shownCoins = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      const n = el.querySelector('.lv-num');
      if (n) n.textContent = fmt(shownCoins);
      if (t < 1) countAnim = requestAnimationFrame(step);
    };
    countAnim = requestAnimationFrame(step);
  }

  function celebrate(previous) {
    el.classList.remove('beaten');
    void el.offsetWidth; // מאתחל את האנימציה
    el.classList.add('beaten');
    const beat = el.querySelector('.lv-top-beat');
    if (beat && previous) beat.textContent = `עקף את ${previous.name}`;
    const burst = el.querySelector('.lv-burst');
    if (burst) {
      burst.innerHTML = Array.from({ length: 14 }, (_, i) =>
        `<i style="--a:${i * (360 / 14)}deg;animation-delay:${(i % 3) * 40}ms"></i>`).join('');
    }
    if (!opts.muted) Sound.play(settings.sound);
    setTimeout(() => el.classList.remove('beaten'), 5000);
  }

  return {
    setSettings(s) { settings = { ...s }; render(); },
    setTop(data) {
      const prevTop = top;
      top = data.top;
      if (!top) { shownCoins = 0; render(); return; }
      if (data.initial || !prevTop) shownCoins = data.initial ? valOf(top) : 0;
      render();
      countTo(valOf(top));
      if (data.beaten && settings.celebrate !== false) celebrate(data.previous);
    }
  };
}
