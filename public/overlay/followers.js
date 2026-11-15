// מונה עוקבים: תמונת הפרופיל שלך, ומתחתיה מספר העוקבים שמתעדכן בזמן אמת
function FollowersView(root, opts = {}) {
  const el = document.createElement('div');
  el.className = 'lv lv-fol';
  root.appendChild(el);
  let settings = {};
  let data = { count: 0, avatar: '', name: '', session: 0 };
  let shown = 0, anim = null;
  const fmt = n => Number(n || 0).toLocaleString('he-IL');

  function render() {
    const s = settings;
    el.dataset.font = s.font || 'fredoka';
    el.classList.toggle('outline', s.outline !== false);
    el.style.setProperty('--ring', s.ringColor || '#F5C542');
    el.style.setProperty('--num', s.numberColor || '#FFFFFF');
    el.style.setProperty('--lbl', s.labelColor || '#C9CCD3');
    const initial = (String(data.name || '?').replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase();
    const goal = Number(s.goal) || 0;
    const pct = goal ? Math.min(100, (data.count / goal) * 100) : 0;
    el.innerHTML = `
      ${s.showAvatar === false ? '' : `<div class="lv-fol-pic">
        ${data.avatar ? `<img src="${lvEsc(data.avatar)}" alt="">` : data.name ? `<span>${lvEsc(initial)}</span>`
          : `<span><svg viewBox="0 0 24 24" width="96" height="96" fill="#C9CCD3"><circle cx="12" cy="8" r="4.2"/><path d="M3.5 21c.8-4.3 4.2-7 8.5-7s7.7 2.7 8.5 7z"/></svg></span>`}
        <i class="lv-fol-ring"></i>
      </div>`}
      <div class="lv-fol-num" dir="ltr">${fmt(shown)}</div>
      <div class="lv-fol-lbl">${lvEsc(s.label ?? 'עוקבים')}</div>
      ${goal ? `<div class="lv-fol-goal"><div class="lv-fol-bar"><i style="width:${pct}%"></i></div><span dir="ltr">${fmt(data.count)} / ${fmt(goal)}</span></div>` : ''}
      ${s.showSession !== false && (data.session > 0 || data.lost > 0) ? `<div class="lv-fol-session" dir="rtl">
        ${data.session > 0 ? `<bdi class="lv-fol-gain" dir="ltr">+${fmt(data.session)}</bdi>` : ''}
        ${data.lost > 0 ? `<bdi class="lv-fol-lost" dir="ltr">-${fmt(data.lost)}</bdi>` : ''}
        <span>בלייב הזה</span></div>` : ''}
      <div class="lv-fol-plus" aria-hidden="true"></div>`;
  }

  function countTo(target) {
    cancelAnimationFrame(anim);
    const from = shown, start = performance.now(), dur = Math.min(1200, 300 + Math.abs(target - from) * 60);
    const step = now => {
      const t = Math.min(1, (now - start) / dur);
      shown = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      const n = el.querySelector('.lv-fol-num');
      if (n) n.textContent = fmt(shown);
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function drop(by) {
    if (settings.celebrate === false) return;
    el.classList.remove('dropped'); void el.offsetWidth; el.classList.add('dropped');
    const plus = el.querySelector('.lv-fol-plus');
    if (plus) {
      const p = document.createElement('span');
      p.className = 'minus';
      p.innerHTML = `<bdi dir="ltr">-${by}</bdi>`;
      plus.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  }
  function celebrate(by, who) {
    if (settings.celebrate === false) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    const plus = el.querySelector('.lv-fol-plus');
    if (plus) {
      const p = document.createElement('span');
      p.innerHTML = `<bdi dir="ltr">+${by}</bdi>${who ? ' <bdi>' + lvEsc(who) + '</bdi>' : ''}`;
      plus.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
    if (!opts.muted && settings.sound && settings.sound !== 'none') Sound.play(settings.sound);
  }

  return {
    setSettings(s) { settings = { ...s }; render(); },
    setData(d, initial) {
      const prev = data.count;
      data = { ...data, ...d };
      render();
      if (initial || !prev) { shown = data.count; render(); return; }
      countTo(data.count);
      if (d.lostNow) drop(d.lostNow);
      else if (data.count > prev) celebrate(data.count - prev, d.lastName);
    }
  };
}
