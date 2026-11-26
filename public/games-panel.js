// טאבים של משחקים ו-PRO: טבלת מובילים, קרב מתנות, מכירה פומבית, צ'אט מוקרא, סיכום לייב
(function () {
  // ---------- טבלת מובילים ----------
  const bdView = BoardView($('#bdStage .stage-inner'), { muted: true });
  const fillBoard = bindSettingsForm($('#bdForm'), 'board', s => bdView.setSettings(s));
  socket.on('board', d => bdView.setData(d));
  $('#bdTest').addEventListener('click', () => socket.emit('testGame'));
  $('#bdReset').addEventListener('click', () => { socket.emit('resetBoard'); toast('הטבלה התאפסה'); });

  // ---------- קרב מתנות ----------
  const btView = BattleView($('#btStage .stage-inner'), { muted: true });
  const btForm = $('#btForm');
  const syncMode = () => {
    const chat = btForm.elements.mode.value === 'chat';
    btForm.querySelectorAll('.gift-only').forEach(e => e.hidden = chat);
    btForm.querySelectorAll('.chat-only').forEach(e => e.hidden = !chat);
  };
  const fillBattle = bindSettingsForm(btForm, 'battle', s => { btView.setSettings(s); syncMode(); });
  const gifts = v => v.split(',').map(x => x.trim()).filter(Boolean);
  let gT = null;
  ['#btAGifts', '#btBGifts'].forEach(id => $(id).addEventListener('input', () => {
    clearTimeout(gT);
    gT = setTimeout(() => socket.emit('saveConfig', { battle: { aGifts: gifts($('#btAGifts').value), bGifts: gifts($('#btBGifts').value) } }), 400);
  }));
  socket.on('battle', d => btView.setData(d));
  $$('[data-bt]').forEach(b => b.addEventListener('click', () => socket.emit('battleCmd', b.dataset.bt)));

  // ---------- מכירה פומבית ----------
  const auView = AuctionView($('#auStage .stage-inner'), { muted: true });
  const fillAuction = bindSettingsForm($('#auForm'), 'auction', s => auView.setSettings(s));
  socket.on('auction', d => auView.setData(d));
  $$('[data-au]').forEach(b => b.addEventListener('click', () => socket.emit('auctionCmd', b.dataset.au)));

  // ---------- צ'אט מוקרא ----------
  const fillChat = bindSettingsForm($('#ctForm'), 'chatTts');
  $('#ctTest').addEventListener('click', () => {
    if (!PRO.active) return showView('pro');
    socket.emit('testChatSpeak'); toast('נשלח למסך ההתראות. אם הוא פתוח ב-LIVE Studio, תשמע אותו שם');
  });

  socket.on('config', c => {
    if (c.board) { fillBoard(c.board); bdView.setSettings(c.board); }
    if (c.battle) {
      fillBattle(c.battle); btView.setSettings(c.battle); syncMode();
      if (document.activeElement !== $('#btAGifts')) $('#btAGifts').value = (c.battle.aGifts || []).join(', ');
      if (document.activeElement !== $('#btBGifts')) $('#btBGifts').value = (c.battle.bGifts || []).join(', ');
    }
    if (c.auction) { fillAuction(c.auction); auView.setSettings(c.auction); }
    if (c.chatTts) fillChat(c.chatTts);
  });

  // ---------- סיכום לייב ----------
  let recap = { current: {}, history: [] }, pick = 0;
  const ILS = coins => Math.round((coins || 0) * 0.005 * 3.7); // הערכה: ~0.5 סנט למטבע, ~3.7 ש"ח לדולר
  const n = v => Number(v || 0).toLocaleString(LL_LOCALE);
  const dateOf = t => t ? new Date(t).toLocaleDateString(LL_LOCALE, { day: 'numeric', month: 'numeric' }) : '';
  const dur = s => { const ms = (s.endedAt || s.lastAt || Date.now()) - (s.startedAt || Date.now()); const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} שעות` : `${m} דקות`; };
  function sessions() { return [recap.current, ...(recap.history || [])].filter(Boolean); }
  function renderRecap() {
    const list = sessions();
    if (pick >= list.length) pick = 0;
    $('#rcTabs').innerHTML = list.slice(0, 8).map((s, i) => `<button type="button" class="btn btn-sm${i === pick ? ' btn-primary' : ''}" data-rc="${i}">${i === 0 ? 'הלייב האחרון' : dateOf(s.startedAt)}</button>`).join('');
    $$('#rcTabs [data-rc]').forEach(b => b.addEventListener('click', () => { pick = Number(b.dataset.rc); renderRecap(); }));
    const s = list[pick] || {};
    const stats = [['מטבעות', n(s.coins)], ['בערך בשקלים', '₪' + n(ILS(s.coins))], ['מתנות', n(s.gifts)], ['עוקבים חדשים', n(s.follows)], ['שיתופים', n(s.shares)], ['לייקים', n(s.likes)], ['משך', dur(s)]];
    $('#rcStats').innerHTML = stats.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    $('#rcTop').innerHTML = (s.top || []).length ? s.top.map((d, i) => `<li class="pro-row"><span class="acct-av">${i + 1}</span><span class="pro-row-txt"><b dir="auto">${lvEsc(d.name)}</b><small>${n(d.coins)} מטבעות</small></span></li>`).join('') : '<li class="hint">עוד אין תורמים.</li>';
    drawStory(s);
  }
  // תמונה לסטורי 1080 על 1920
  async function drawStory(s) {
    const c = $('#rcCanvas'), g = c.getContext('2d');
    try { await document.fonts.load('900 80px Rubik'); } catch {}
    const grd = g.createLinearGradient(0, 0, 0, 1920); grd.addColorStop(0, '#2A1660'); grd.addColorStop(1, '#0E0A1A');
    g.fillStyle = grd; g.fillRect(0, 0, 1080, 1920);
    g.direction = LLi18n.lang === 'en' ? 'ltr' : 'rtl'; g.textAlign = 'center';
    g.fillStyle = '#FFD23F'; g.font = '900 96px Rubik, sans-serif'; g.fillText(t('סיכום הלייב'), 540, 240);
    g.fillStyle = '#B9B1D0'; g.font = '700 44px Rubik, sans-serif'; g.fillText(dateOf(s.startedAt) + ' · ' + t(dur(s)), 540, 320);
    const boxes = [['מטבעות', n(s.coins)], ['מתנות', n(s.gifts)], ['עוקבים חדשים', n(s.follows)], ['לייקים', n(s.likes)]];
    boxes.forEach(([k, v], i) => {
      const x = i % 2 ? 90 : 570, y = 420 + Math.floor(i / 2) * 250;
      g.fillStyle = '#7C4DFF'; roundRect(g, x, y, 420, 210, 36); g.fill();
      g.fillStyle = '#fff'; g.font = '900 84px Rubik, sans-serif'; g.fillText(v, x + 210, y + 110);
      g.font = '700 40px Rubik, sans-serif'; g.fillStyle = '#E6DDFF'; g.fillText(t(k), x + 210, y + 172);
    });
    g.fillStyle = '#fff'; g.font = '900 64px Rubik, sans-serif'; g.fillText(t('תודה לתורמים!'), 540, 1020);
    (s.top || []).slice(0, 5).forEach((d, i) => {
      const y = 1080 + i * 130;
      g.fillStyle = i === 0 ? '#FFD23F' : 'rgba(255,255,255,.1)'; roundRect(g, 110, y, 860, 108, 28); g.fill();
      g.fillStyle = i === 0 ? '#241600' : '#fff'; g.font = '800 52px Rubik, sans-serif';
      g.textAlign = 'right'; g.fillText(String(i + 1), 935, y + 72); g.fillText(d.name, 880, y + 72);
      g.textAlign = 'left'; g.fillText(n(d.coins), 150, y + 72); g.textAlign = 'center';
    });
    const logo = new Image(); logo.src = 'brand/logo.png';
    await new Promise(r => { logo.onload = r; logo.onerror = r; });
    if (logo.width) g.drawImage(logo, 540 - 230, 1790, 460, 460 * logo.height / logo.width);
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  $('#rcSave').addEventListener('click', () => {
    $('#rcCanvas').toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'LiveLoot-סיכום-לייב.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); });
  });
  socket.on('recap', d => { recap = d || recap; renderRecap(); });
  $$('.nav-item[data-view="recap"]').forEach(b => b.addEventListener('click', () => socket.emit('getRecap')));
  socket.emit('getGames');
})();
