// ווידג'טים של PRO: טבלת מובילים, קרב מתנות, מכירה פומבית
const fmtN = n => Number(n || 0).toLocaleString('he-IL');
const avatarHtml = (r, cls) => r.avatar
  ? `<img class="${cls}" src="${lvEsc(r.avatar)}" alt="" referrerpolicy="no-referrer">`
  : `<span class="${cls} lv-av-letter">${lvEsc((r.name || '?').trim()[0] || '?')}</span>`;
const clock = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

// ---------- טבלת מובילים: 5 התורמים הגדולים, עם "עקף!" כשמישהו עולה ----------
function BoardView(root, opts = {}) {
  const el = document.createElement('div');
  el.className = 'lv lv-board';
  root.appendChild(el);
  let settings = {}, list = [];
  function render(passed) {
    const s = settings, n = Number(s.count) || 5;
    el.dataset.font = s.font || 'fredoka';
    el.style.setProperty('--bd-title', s.titleColor || '#fff');
    el.style.setProperty('--bd-name', s.nameColor || '#fff');
    el.style.setProperty('--bd-coins', s.coinsColor || '#FFD23F');
    el.style.setProperty('--bd-accent', s.accentColor || '#7C4DFF');
    el.style.setProperty('--bd-ink', s.outlineColor || '#200A3A');
    const rows = list.slice(0, n);
    const body = rows.length ? rows.map((r, i) => `
      <li class="lv-bd-row r${i + 1}${passed && passed.key === r.key ? ' up' : ''}">
        <span class="lv-bd-rank">${i + 1}</span>
        ${s.showAvatar === false ? '' : avatarHtml(r, 'lv-bd-av')}
        <span class="lv-bd-name" dir="auto">${lvEsc(r.name)}</span>
        <span class="lv-bd-coins">${ICONS.coin}${fmtN(r.coins)}</span>
      </li>`).join('')
      : `<li class="lv-bd-empty">מי יהיה הראשון?</li>`;
    el.innerHTML = `<div class="lv-bd-title">${lvEsc(s.title || '')}</div><ol class="lv-bd-list">${body}</ol>
      ${passed && s.celebrate !== false ? `<div class="lv-bd-pass" dir="auto">${lvEsc(passed.name)} עלה למקום ${passed.rank + 1}!</div>` : ''}`;
  }
  return {
    setSettings(s) { settings = { ...s }; render(); },
    setData(d) {
      list = d.list || [];
      const passed = d.passed && d.passed.rank < (Number(settings.count) || 5) ? d.passed : null;
      render(passed);
      if (passed && settings.celebrate !== false && !opts.muted && settings.sound && settings.sound !== 'none') Sound.play(settings.sound);
    }
  };
}

// ---------- קרב מתנות: שתי קבוצות, חבל משיכה, ספירה לאחור ----------
function BattleView(root, opts = {}) {
  const el = document.createElement('div');
  el.className = 'lv lv-battle';
  root.appendChild(el);
  el.innerHTML = `
    <div class="lv-bt-head"><span class="lv-bt-team a"></span><span class="lv-bt-clock" dir="ltr"></span><span class="lv-bt-team b"></span></div>
    <div class="lv-bt-bar"><div class="lv-bt-fill a"></div><div class="lv-bt-fill b"></div><div class="lv-bt-knot"></div></div>
    <div class="lv-bt-scores"><span class="a"></span><span class="b"></span></div>
    <div class="lv-bt-hint"></div>
    <div class="lv-bt-last" dir="auto"></div>
    <div class="lv-bt-win" dir="auto"></div>`;
  const q = s => el.querySelector(s);
  let settings = {}, data = { running: false, a: 0, b: 0 }, skew = 0, lastAt = 0, wonShown = null;
  function apply() {
    const s = settings;
    el.dataset.font = s.font || 'fredoka';
    el.style.setProperty('--bt-a', s.aColor || '#3D8BFF');
    el.style.setProperty('--bt-b', s.bColor || '#FF3E5E');
    q('.lv-bt-team.a').textContent = s.aName || 'A';
    q('.lv-bt-team.b').textContent = s.bName || 'B';
    q('.lv-bt-hint').textContent = s.mode === 'chat'
      ? `כותבים ${s.joinA || '1'} בצ'אט בשביל ${s.aName}, או ${s.joinB || '2'} בשביל ${s.bName}. אחר כך כל מתנה נספרת לקבוצה שלכם`
      : `${(s.aGifts || []).join(', ')} = ${s.aName}   |   ${(s.bGifts || []).join(', ')} = ${s.bName}`;
  }
  function tick() {
    const left = data.running ? data.endsAt - (Date.now() + skew) : 0;
    q('.lv-bt-clock').textContent = data.running ? clock(left) : (data.winner ? 'סוף!' : '');
    el.classList.toggle('final', data.running && left < 10000);
  }
  function render() {
    const a = data.a || 0, b = data.b || 0, tot = a + b;
    const pa = tot ? a / tot : 0.5;
    q('.lv-bt-fill.a').style.width = (pa * 100) + '%';
    q('.lv-bt-fill.b').style.width = ((1 - pa) * 100) + '%';
    q('.lv-bt-knot').style.left = `calc(${(1 - pa) * 100}% - 22px)`;
    q('.lv-bt-scores .a').textContent = fmtN(a);
    q('.lv-bt-scores .b').textContent = fmtN(b);
    el.classList.toggle('idle', !data.running && !data.winner);
    const L = data.last;
    if (L && L.at !== lastAt) {
      lastAt = L.at;
      const box = q('.lv-bt-last');
      box.innerHTML = `<b>${lvEsc(L.name)}</b> +${fmtN(L.pts)} ל${lvEsc(L.side === 'a' ? settings.aName : settings.bName)}`;
      box.className = 'lv-bt-last show ' + L.side;
      el.classList.remove('hit-a', 'hit-b'); void el.offsetWidth; el.classList.add('hit-' + L.side);
    }
    const w = q('.lv-bt-win');
    if (data.winner) {
      const name = data.winner === 'tie' ? '' : (data.winner === 'a' ? settings.aName : settings.bName);
      w.textContent = data.winner === 'tie' ? 'תיקו!' : String(settings.winText || '{team} ניצחו!').replace('{team}', name);
      w.className = 'lv-bt-win show ' + data.winner;
      if (wonShown !== data.endsAt && !opts.muted && settings.sound && settings.sound !== 'none') Sound.play(settings.sound);
      wonShown = data.endsAt;
    } else w.className = 'lv-bt-win';
    tick();
  }
  setInterval(tick, 250);
  return {
    setSettings(s) { settings = { ...s }; apply(); render(); },
    setData(d) { data = d; if (d.now) skew = d.now - Date.now(); render(); }
  };
}

// ---------- מכירה פומבית: מי שנותן הכי הרבה עד שהזמן נגמר ----------
function AuctionView(root, opts = {}) {
  const el = document.createElement('div');
  el.className = 'lv lv-auction';
  root.appendChild(el);
  el.innerHTML = `
    <div class="lv-au-tag">מכירה פומבית</div>
    <div class="lv-au-prize" dir="auto"></div>
    <div class="lv-au-clock" dir="ltr"></div>
    <ol class="lv-au-list"></ol>
    <div class="lv-au-flash" dir="auto"></div>
    <div class="lv-au-win" dir="auto"></div>`;
  const q = s => el.querySelector(s);
  let settings = {}, data = { running: false, top: [] }, skew = 0, wonShown = null;
  function tick() {
    const left = data.running ? data.endsAt - (Date.now() + skew) : 0;
    q('.lv-au-clock').textContent = data.running ? clock(left) : '';
    el.classList.toggle('final', data.running && left < 10000);
  }
  function flash(t) {
    const f = q('.lv-au-flash'); f.textContent = t; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
  }
  function render(d = {}) {
    const s = settings;
    el.dataset.font = s.font || 'fredoka';
    el.style.setProperty('--au-accent', s.accentColor || '#FFD23F');
    q('.lv-au-prize').textContent = s.prize || '';
    el.classList.toggle('idle', !data.running && !data.winner);
    q('.lv-au-list').innerHTML = (data.top || []).map((r, i) => `
      <li class="r${i + 1}">${avatarHtml(r, 'lv-au-av')}<span class="nm" dir="auto">${lvEsc(r.name)}</span><span class="cn">${ICONS.coin}${fmtN(r.coins)}</span></li>`).join('')
      || (data.running ? '<li class="empty">שלחו מתנה כדי להציע</li>' : '');
    if (d.newLeader) flash(`${d.newLeader} מוביל!`);
    if (d.extended) flash('הזמן הוארך!');
    const w = q('.lv-au-win');
    if (data.winner) {
      w.innerHTML = `<small>הזוכה</small><b>${lvEsc(data.winner.name)}</b><span>${ICONS.coin}${fmtN(data.winner.coins)}</span>`;
      w.classList.add('show');
      if (wonShown !== data.endsAt && !opts.muted && s.sound && s.sound !== 'none') Sound.play(s.sound);
      wonShown = data.endsAt;
    } else w.classList.remove('show');
    tick();
  }
  setInterval(tick, 250);
  return {
    setSettings(s) { settings = { ...s }; render(); },
    setData(d) { data = d; if (d.now) skew = d.now - Date.now(); render(d); }
  };
}
