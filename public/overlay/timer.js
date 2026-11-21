// טיימר סאבתון: זמן שיורד, וכל מתנה/עוקב מוסיפים זמן
function TimerView(root, opts = {}) {
  const el = document.createElement('div');
  el.className = 'lv lv-subt';
  root.appendChild(el);
  el.innerHTML = `<div class="lv-tm-title"></div><div class="lv-tm-box"><span class="lv-tm-time" dir="ltr">00:00:00</span></div><div class="lv-tm-adds"></div>`;
  const $t = el.querySelector('.lv-tm-time'), $title = el.querySelector('.lv-tm-title'), $adds = el.querySelector('.lv-tm-adds');
  let settings = {}, data = { running: false, remaining: 0, endsAt: 0 }, skew = 0, ended = false;

  const pad = n => String(n).padStart(2, '0');
  function fmt(ms) {
    const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function remaining() { return data.running ? Math.max(0, data.endsAt - (Date.now() + skew)) : data.remaining; }
  function tick() {
    const ms = remaining();
    const done = data.started && ms <= 0;
    $t.textContent = done ? (settings.endText || 'הזמן נגמר!') : fmt(ms);
    $t.dir = done ? 'auto' : 'ltr';
    el.classList.toggle('done', done);
    el.classList.toggle('low', !done && data.running && ms < 60e3);
    if (done && !ended && !opts.muted) Sound.play('builtin:fanfare');
    ended = done;
  }
  function apply() {
    const s = settings;
    el.dataset.style = s.style || 'pill';
    el.dataset.font = s.font || 'fredoka';
    el.style.setProperty('--tm-text', s.textColor || '#fff');
    el.style.setProperty('--tm-bg', s.bgColor || '#7C4DFF');
    el.style.setProperty('--tm-accent', s.accentColor || '#FFD23F');
    el.style.setProperty('--tm-ink', s.outlineColor || '#200A3A');
    el.style.setProperty('--tm-size', ((Number(s.size) || 100) / 100) + '');
    $title.textContent = s.title || '';
    $title.hidden = s.showTitle === false || !s.title;
    tick();
  }
  function popAdd(a) {
    if (!a || !a.sec || settings.showAdds === false) return;
    const chip = document.createElement('div');
    chip.className = 'lv-tm-add';
    const sec = a.sec >= 60 ? `+${Math.floor(a.sec / 60)}:${pad(a.sec % 60)}` : `+${a.sec} שנ'`;
    chip.innerHTML = `<b dir="ltr">${sec}</b>${a.name ? `<span dir="auto">${lvEsc(a.name)}</span>` : ''}`;
    $adds.prepend(chip);
    while ($adds.children.length > 3) $adds.lastChild.remove();
    setTimeout(() => chip.classList.add('out'), 3200);
    setTimeout(() => chip.remove(), 3700);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    if (!opts.muted && settings.sound && settings.sound !== 'none') Sound.play(settings.sound);
  }
  setInterval(tick, 250);
  return {
    setSettings(s) { settings = { ...s }; apply(); },
    setData(d) { data = d; if (d.now) skew = d.now - Date.now(); tick(); popAdd(d.add); }
  };
}
