const socket = io();
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let config = null;
let sounds = [];
let topState = null;

const TRIGGER_NAME = { gift: 'מתנה', follow: 'עוקב חדש', share: 'שיתוף', like: 'לייקים', chat: 'פקודה בצ׳אט' };
const BUILTIN_SOUNDS = [['none', 'בלי סאונד'], ['builtin:pop', 'פופ (מובנה)'], ['builtin:coin', 'מטבע (מובנה)'], ['builtin:fanfare', 'חגיגה (מובנה)']];
const fmt = n => Number(n || 0).toLocaleString('he-IL');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- ניווט ----------
function showView(name) {
  if (!$(`.view[data-view="${name}"]`)) name = 'live';
  $$('.view').forEach(v => v.hidden = v.dataset.view !== name);
  $$('.nav-item').forEach(b => b.dataset.view === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  try { history.replaceState(null, '', '#' + name); } catch {}
  fitStages();
}
$$('.nav-item').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- במות תצוגה (מקטינות מסך OBS אמיתי לגודל התיבה) ----------
function fitStages() {
  $$('.stage').forEach(stage => {
    const inner = stage.querySelector('.stage-inner');
    const w = +inner.dataset.w, h = +inner.dataset.h;
    inner.style.width = w + 'px';
    inner.style.height = h + 'px';
    inner.style.transform = `scale(${stage.clientWidth / w})`;
  });
}
new ResizeObserver(fitStages).observe(document.body);

const alertsView = AlertsView($('#alertsStage .stage-inner'), { muted: true });
const topView = TopGiftView($('#tgStage .stage-inner'), { muted: true });
socket.on('alert', a => alertsView.enqueue(a));

// ---------- סטטוס וחיבור ----------
socket.on('status', s => {
  $('#status').dataset.state = s.state;
  $('#statusText').textContent = s.message;
  $('#viewers').textContent = fmt(s.viewers);
  $('#likes').textContent = fmt(s.likes);
  const btn = $('#connectBtn');
  btn.disabled = s.state === 'connecting';
  btn.textContent = s.state === 'live' ? 'התנתק' : s.state === 'connecting' ? 'מתחבר...' : 'התחבר ללייב';
  btn.classList.toggle('btn-primary', s.state !== 'live');
  btn.dataset.live = s.state === 'live' ? '1' : '';
});
$('#connectForm').addEventListener('submit', e => {
  e.preventDefault();
  if ($('#connectBtn').dataset.live) return socket.emit('disconnectLive');
  const username = $('#username').value.replace(/^@/, '').trim();
  if (!username) return toast('צריך לכתוב שם משתמש');
  socket.emit('saveConfig', { username });
  socket.emit('connectLive');
});

// ---------- פיד ----------
const FEED_ICON = {
  gift: ICONS.gift, follow: ICONS.follow, share: ICONS.share, like: ICONS.like,
  wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
};
function describe(e) {
  if (e.type === 'gift') return `שלח <bdi>${lvEsc(e.gift)} ×${e.count}</bdi>`;
  if (e.type === 'follow') return 'התחיל לעקוב';
  if (e.type === 'share') return 'שיתף את הלייב';
  if (e.type === 'like') return `שלח ${e.count} לייקים`;
  if (e.type === 'chat') return lvEsc(e.text);
  if (e.type === 'wheel') return `סובב את הגלגל וקיבל: <b>${lvEsc(e.text)}</b>`;
  return '';
}
function feedItem(e, fresh) {
  const li = document.createElement('li');
  li.dataset.kind = e.type === 'gift' && e.coins >= 100 ? 'big' : e.type;
  if (fresh) li.className = 'fresh';
  const time = new Date(e.time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  li.innerHTML = `
    <span class="ico">${FEED_ICON[e.type] || FEED_ICON.chat}</span>
    <div>
      <div class="who"><bdi>${lvEsc(e.name)}</bdi>${e.test ? '<span class="tag-test">בדיקה</span>' : ''}</div>
      <div class="what">${describe(e)}</div>
    </div>
    <div class="meta">${e.type === 'gift' ? `<b>${fmt(e.coins)}</b>` : ''}${time}</div>`;
  return li;
}
const updateEmpty = () => $('#feedEmpty').hidden = $('#feed').children.length > 0;
socket.on('feedAll', list => { $('#feed').replaceChildren(...list.map(e => feedItem(e))); updateEmpty(); });
socket.on('feed', e => {
  const feed = $('#feed');
  feed.prepend(feedItem(e, true));
  while (feed.children.length > 60) feed.lastChild.remove();
  updateEmpty();
});
$$('[data-test]').forEach(b => b.addEventListener('click', () => socket.emit('test', b.dataset.test)));

// ---------- חוקים ----------
function summary(r) {
  let s = TRIGGER_NAME[r.trigger] || r.trigger;
  if (r.trigger === 'gift' && r.giftName) s += `: רק ${r.giftName}`;
  if (r.trigger === 'gift' && r.minCoins) s += `, מ-${r.minCoins} מטבעות`;
  if (r.trigger === 'like' && r.minCoins) s += `, מ-${r.minCoins} לייקים בבת אחת`;
  return s + `, ${r.duration} שניות`;
}
function soundOptions(current) {
  return [...BUILTIN_SOUNDS, ...sounds.map(f => [f, f])]
    .map(([v, label]) => `<option value="${lvEsc(v)}" ${v === current ? 'selected' : ''}>${lvEsc(label)}</option>`).join('');
}
function syncTriggerFields(form) {
  const t = form.elements.trigger.value;
  form.querySelectorAll('.only-gift').forEach(el => el.hidden = !(t === 'gift' || (t === 'like' && el.classList.contains('only-like'))));
  form.querySelector('.min-label').textContent = t === 'like' ? 'מינימום לייקים בבת אחת' : 'מינימום מטבעות';
}
const FIELDS = ['name', 'trigger', 'giftName', 'minCoins', 'title', 'subtitle', 'style', 'duration'];

function renderRules() {
  const list = $('#rules');
  const open = new Set($$('.rule-edit:not([hidden])').map(f => f.closest('.rule').dataset.id));
  list.replaceChildren();
  config.rules.forEach(r => {
    const li = $('#ruleTpl').content.firstElementChild.cloneNode(true);
    li.dataset.id = r.id;
    li.dataset.kind = r.style;
    li.classList.toggle('off', !r.enabled);
    li.querySelector('.r-name').textContent = r.name;
    li.querySelector('.r-summary').textContent = summary(r);

    const enabled = li.querySelector('.r-enabled');
    enabled.checked = r.enabled;
    enabled.setAttribute('aria-label', 'הפעלת החוק ' + r.name);
    enabled.addEventListener('change', () => { r.enabled = enabled.checked; saveRules(r.enabled ? 'החוק הופעל' : 'החוק כובה'); });
    li.querySelector('.r-test').addEventListener('click', () => socket.emit('testRule', r.id));

    const form = li.querySelector('.rule-edit');
    const editBtn = li.querySelector('.r-edit');
    // elements[] כי form.name / form.title הם מאפיינים של הטופס עצמו
    FIELDS.forEach(k => form.elements[k].value = r[k] ?? '');
    form.elements.sound.innerHTML = soundOptions(r.sound);
    syncTriggerFields(form);
    form.elements.trigger.addEventListener('change', () => syncTriggerFields(form));
    editBtn.addEventListener('click', () => {
      form.hidden = !form.hidden;
      editBtn.setAttribute('aria-expanded', String(!form.hidden));
      editBtn.textContent = form.hidden ? 'ערוך' : 'סגור';
    });
    if (open.has(r.id)) editBtn.click();

    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = form.elements;
      Object.assign(r, {
        name: f.name.value.trim() || 'חוק בלי שם',
        trigger: f.trigger.value,
        giftName: f.giftName.value.trim(),
        minCoins: Number(f.minCoins.value) || 0,
        title: f.title.value,
        subtitle: f.subtitle.value,
        style: f.style.value,
        duration: Math.min(30, Math.max(1, Number(f.duration.value) || 5)),
        sound: f.sound.value
      });
      saveRules('החוק נשמר');
    });
    const confirmBox = li.querySelector('.confirm-inline');
    li.querySelector('.r-delete').addEventListener('click', () => confirmBox.hidden = !confirmBox.hidden);
    li.querySelector('.r-delete-yes').addEventListener('click', () => {
      config.rules = config.rules.filter(x => x.id !== r.id);
      saveRules('החוק נמחק');
    });
    list.appendChild(li);
  });
}
function saveRules(msg) {
  socket.emit('saveConfig', { rules: config.rules });
  if (msg) toast(msg);
}
$('#addRule').addEventListener('click', () => {
  const id = 'r' + Date.now();
  config.rules.unshift({ id, enabled: true, name: 'חוק חדש', trigger: 'gift', giftName: '', minCoins: 0,
    title: '{name}', subtitle: 'שלח {gift} ×{count}', duration: 5, sound: 'builtin:coin', style: 'gift' });
  saveRules();
  socket.once('config', () => document.querySelector(`.rule[data-id="${id}"] .r-edit`)?.click());
});

// ---------- פעולות ואירועים ----------
const fxView = EffectsView($('#fxStage .stage-inner'), { muted: true });
const mediaPreview = MediaView($('#fxStage .stage-inner'), { muted: true });
const voiceTester = EffectsView(document.createElement('div'), {});
socket.on('effect', e => fxView.fire(e));
socket.on('action', a => {
  if ((a.effect && a.effect !== 'none') || (a.voice && a.voice !== 'none')) fxView.fire(a);
  mediaPreview.play(a);
});
socket.on('clear', () => { fxView.clear(); mediaPreview.clear(); alertsView.clear(); wheelView?.clear(); });
$('#clearScreen').addEventListener('click', () => { socket.emit('clearScreen'); toast('המסך נוקה'); });
const fxVol = $('#fxVolume');
let fxVolTimer = null;
fxVol.addEventListener('input', () => {
  fxVol.nextElementSibling.textContent = fxVol.value;
  clearTimeout(fxVolTimer);
  fxVolTimer = setTimeout(() => socket.emit('saveConfig', { fxVolume: Number(fxVol.value) }), 300);
});

const FX_NAME = { none: 'בלי אפקט', splat: 'הצופה נזרק', meteor: 'מטאור', vacuum: 'שואב קוסמי' };
const VOICE_NAME = { male: 'גבר', female: 'אישה', none: 'בלי קול', chipmunk: 'צ׳יפמאנק', giant: 'ענק', robot: 'רובוט', announcer: 'קריין' };
const SCREEN_PATH = n => n === 1 ? '/alerts' : '/screen/' + n;
// במחשב: localtest.me. באתר: הקישור האישי של המשתמש (/w/<מפתח>)
let LINK_BASE = 'http://liveloot.localtest.me:' + (location.port || 80);
// בחלק מהבתים הראוטר או הספק חוסמים את localtest.me (הגנת DNS rebinding), ואז LIVE Studio מציג
// ריבועים אפורים במקום הווידג'ט. בודקים מהמחשב עצמו: אם השם לא נפתח, עוברים לכתובת 127.0.0.1 שתמיד עובדת
(function checkLinkHost() {
  const port = location.port || 80;
  const img = new Image();
  let done = false;
  const fallback = () => {
    if (done || typeof WEB !== 'undefined' && WEB) return; done = true;
    LINK_BASE = 'http://127.0.0.1:' + port;
    try { renderScreens(); renderObs(); renderLinkBoxes(); } catch {}
  };
  img.onload = () => { done = true; };
  img.onerror = fallback;
  setTimeout(fallback, 5000);
  img.src = 'http://liveloot.localtest.me:' + port + '/brand/favicon.png?t=' + Date.now();
})();
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('הקישור הועתק'); }
  catch { toast('לא הצלחתי להעתיק. תסמן את הקישור ותלחץ Ctrl+C'); }
}
function renderScreens() {
  $('#screenLinks').innerHTML = [1, 2, 3, 4].map(n => `
    <li class="screen-link">
      <b>מסך ${n}</b><span>${n === 1 ? 'יחד עם ההתראות' : 'רק פעולות'}</span>
      <code dir="ltr">${lvEsc(LINK_BASE + SCREEN_PATH(n))}</code>
      <button class="btn btn-sm" type="button" data-scopy="${lvEsc(LINK_BASE + SCREEN_PATH(n))}">העתק</button>
    </li>`).join('');
  $$('#screenLinks [data-scopy]').forEach(b => b.addEventListener('click', () => copyText(b.dataset.scopy)));
}
renderScreens();

const openEdits = { act: new Set(), ev: new Set() };
function actSummary(a) {
  const parts = [`מסך ${a.screen}`];
  if (a.sound) parts.push('סאונד');
  if (a.video) parts.push('וידאו');
  if (a.image) parts.push('תמונה');
  if (a.caption) parts.push('כיתוב');
  if (a.effect && a.effect !== 'none') parts.push(FX_NAME[a.effect]);
  if (a.voice && a.voice !== 'none') parts.push('קול: ' + VOICE_NAME[a.voice]);
  if (a.wheel) parts.push('סיבוב בגלגל');
  return parts.join(' · ');
}
function evTitle(e) {
  const unit = e.trigger === 'like' ? 'לייקים' : 'מטבעות';
  let t;
  if (e.trigger === 'gift') {
    if (e.giftName) t = `מתנה: ${e.giftName}`;
    else if (e.maxCoins) t = `מתנה של ${e.minCoins || 1} עד ${e.maxCoins} ${unit}`;
    else t = e.minCoins > 1 ? `מתנה של ${e.minCoins}+ ${unit}` : 'כל מתנה';
  } else if (e.trigger === 'like') t = e.minCoins ? `${e.minCoins}+ לייקים` : 'לייקים';
  else if (e.trigger === 'chat') t = e.command ? `פקודה: ${e.command}` : 'כל הודעה בצ׳אט';
  else t = TRIGGER_NAME[e.trigger] || e.trigger;
  return e.user ? `${t} (רק ${e.user})` : t;
}
function evSummary(e) {
  let s = TRIGGER_NAME[e.trigger] || e.trigger;
  const unit = e.trigger === 'like' ? 'לייקים' : 'מטבעות';
  if (e.trigger === 'gift' && e.giftName) s += `: ${e.giftName}`;
  if ((e.trigger === 'gift' || e.trigger === 'like') && (e.minCoins || e.maxCoins)) {
    s += e.maxCoins ? `, ${e.minCoins || 0} עד ${e.maxCoins} ${unit}` : `, מ-${e.minCoins} ${unit}`;
  }
  const names = e.actions.map(id => config.actions.find(a => a.id === id)?.name).filter(Boolean);
  if (e.repeatCombo) s += ', כל מתנה בקומבו';
  return `${s} ← ${names.length ? (e.pick === 'random' ? 'אחת אקראית מתוך: ' : '') + names.join(', ') : 'אין פעולות מחוברות'}`;
}
function mediaField(a, key, label, accept) {
  const has = a[key];
  return `<div class="field media-field" data-key="${key}"><span>${label}</span>
    ${has ? `<div class="media-chip"><span dir="auto">${lvEsc(a[key + 'Name'] || a[key].split('/').pop())}</span><button type="button" class="btn btn-sm" data-rm="${key}">הסר</button></div>`
      : `<label class="btn btn-sm media-up">בחר קובץ<input type="file" accept="${accept}" hidden data-up="${key}"></label>`}</div>`;
}
function renderActions() {
  const list = $('#actList');
  list.replaceChildren();
  $('#actEmpty').hidden = config.actions.length > 0;
  config.actions.forEach(a => {
    const li = document.createElement('li');
    li.className = 'rule';
    li.dataset.kind = a.video ? 'big' : a.image ? 'share' : a.sound ? 'follow' : a.wheel ? 'wheel' : 'gift';
    li.innerHTML = `
      <div class="rule-row">
        <span class="rule-dot" aria-hidden="true"></span>
        <div class="rule-info"><b></b><small></small></div>
        <button class="btn btn-sm" type="button" data-do="test">הפעל</button>
        <button class="btn btn-sm" type="button" data-do="edit" aria-expanded="false">ערוך</button>
        <button class="btn btn-sm" type="button" data-do="dup">שכפל</button>
        <button class="btn btn-sm btn-icon" type="button" data-do="del" aria-label="מחק פעולה" title="מחק"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>
      </div>
      <div class="row-confirm" hidden><span>למחוק את הפעולה? היא תוסר גם מהאירועים.</span><button type="button" class="btn btn-danger btn-sm" data-do="delYes">כן, מחק</button><button type="button" class="btn btn-sm" data-do="delNo">ביטול</button></div>
      <form class="rule-edit" hidden>
        <label class="field"><span>שם הפעולה</span><input name="name" maxlength="40"></label>
        <label class="field"><span>באיזה מסך</span><select name="screen"><option value="1">מסך 1 (עם ההתראות)</option><option value="2">מסך 2</option><option value="3">מסך 3</option><option value="4">מסך 4</option></select></label>
        <label class="field"><span>כמה שניות על המסך (תמונה וכיתוב)</span><input name="duration" type="number" min="1" max="60"></label>
        ${mediaField(a, 'sound', 'סאונד (MP3, WAV)', 'audio/*')}
        ${mediaField(a, 'video', 'וידאו (MP4, WEBM)', 'video/mp4,video/webm,video/quicktime')}
        ${mediaField(a, 'image', 'תמונה או GIF', 'image/png,image/jpeg,image/gif,image/webp')}
        <label class="field range"><span>עוצמת הקובץ</span><input name="volume" type="range" min="0" max="100"><output></output></label>
        <label class="field wide"><span>כיתוב על המסך (לא חובה)</span><input name="caption" placeholder="{name} שלח {gift}!"></label>
        <label class="field"><span>אפקט</span><select name="effect"><option value="none">בלי אפקט</option><option value="splat">הצופה נזרק על המסך</option><option value="meteor">מטאור</option><option value="vacuum">שואב אבק קוסמי</option></select></label>
        <label class="field"><span>קול מצחיק</span><select name="voice"><option value="none">בלי קול</option><option value="male">גבר</option><option value="female">אישה</option><option value="chipmunk">צ'יפמאנק</option><option value="giant">ענק</option><option value="robot">רובוט</option><option value="announcer">קריין דרמטי</option></select></label>
        <label class="field wide"><span>מה הקול אומר</span><input name="voiceText"></label>
        <label class="field"><span>זמן המתנה בין הפעלות (שניות, לכולם)</span><input name="cooldown" type="number" min="0" max="3600"></label>
        <label class="field"><span>זמן המתנה לכל צופה (שניות)</span><input name="userCooldown" type="number" min="0" max="3600"></label>
        <label class="check wide"><input type="checkbox" name="wheel"><span>גם לסובב את גלגל המזל</span></label>
        <p class="hint wide">{name} זה שם הצופה, {gift} שם המתנה, {count} הכמות.</p>
        <div class="edit-actions wide">
          <button type="submit" class="btn btn-primary btn-sm">שמור</button>
          <button type="button" class="btn btn-sm" data-do="hear">השמע את הקול</button>
        </div>
      </form>`;
    li.querySelector('b').textContent = a.name;
    li.querySelector('small').textContent = actSummary(a);
    const form = li.querySelector('form'), f = form.elements;
    ['name', 'screen', 'duration', 'volume', 'caption', 'effect', 'voice', 'voiceText', 'cooldown', 'userCooldown'].forEach(k => f[k].value = a[k] ?? '');
    f.wheel.checked = !!a.wheel;
    const out = f.volume.nextElementSibling; out.textContent = f.volume.value;
    f.volume.addEventListener('input', () => out.textContent = f.volume.value);
    const editBtn = li.querySelector('[data-do="edit"]');
    const toggle = open => { form.hidden = !open; editBtn.setAttribute('aria-expanded', String(open)); editBtn.textContent = open ? 'סגור' : 'ערוך'; open ? openEdits.act.add(a.id) : openEdits.act.delete(a.id); };
    editBtn.addEventListener('click', () => toggle(form.hidden));
    if (openEdits.act.has(a.id)) toggle(true);
    li.querySelector('[data-do="test"]').addEventListener('click', () => socket.emit('testAction', a.id));
    li.querySelector('[data-do="hear"]').addEventListener('click', () => {
      if (f.voice.value === 'none') return toast('בחרת "בלי קול"');
      voiceTester.speak(f.voice.value, f.voiceText.value.replaceAll('{name}', 'Player1').replaceAll('{gift}', 'Lion').replaceAll('{count}', '1'));
    });
    const conf = li.querySelector('.row-confirm');
    li.querySelector('[data-do="del"]').addEventListener('click', () => conf.hidden = !conf.hidden);
    li.querySelector('[data-do="delNo"]').addEventListener('click', () => conf.hidden = true);
    li.querySelector('[data-do="dup"]').addEventListener('click', () => {
      const copy = { ...JSON.parse(JSON.stringify(a)), id: 'a' + Date.now().toString(36), name: a.name + ' (עותק)' };
      config.actions.splice(config.actions.indexOf(a) + 1, 0, copy);
      openEdits.act.add(copy.id);
      saveAE('הפעולה שוכפלה');
    });
    li.querySelector('[data-do="delYes"]').addEventListener('click', () => {
      config.actions = config.actions.filter(x => x.id !== a.id);
      config.events.forEach(e => e.actions = e.actions.filter(x => x !== a.id));
      saveAE('הפעולה נמחקה');
    });
    const readForm = () => Object.assign(a, {
      name: f.name.value.trim() || 'פעולה בלי שם', screen: Number(f.screen.value) || 1, duration: Number(f.duration.value) || 5,
      volume: Number(f.volume.value), caption: f.caption.value, effect: f.effect.value, voice: f.voice.value, voiceText: f.voiceText.value, wheel: f.wheel.checked,
      cooldown: Number(f.cooldown.value) || 0, userCooldown: Number(f.userCooldown.value) || 0
    });
    form.addEventListener('submit', e => { e.preventDefault(); readForm(); saveAE('הפעולה נשמרה'); });
    form.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      readForm(); a[b.dataset.rm] = ''; a[b.dataset.rm + 'Name'] = ''; saveAE();
    }));
    form.querySelectorAll('[data-up]').forEach(inp => inp.addEventListener('change', async () => {
      const file = inp.files[0];
      if (!file) return;
      if (file.size > 80 * 1024 * 1024) return toast('הקובץ גדול מדי (עד 80MB)');
      const label = inp.closest('label'); label.classList.add('loading'); label.firstChild.textContent = 'מעלה...';
      try {
        const r = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
        const j = await r.json();
        if (!r.ok) { toast(j.error || 'ההעלאה נכשלה'); renderActions(); return; }
        readForm(); a[inp.dataset.up] = j.url; a[inp.dataset.up + 'Name'] = j.name;
        saveAE('הקובץ הועלה');
      } catch { toast('ההעלאה נכשלה'); renderActions(); }
    }));
    list.appendChild(li);
  });
}
function renderEvents() {
  const list = $('#evList');
  list.replaceChildren();
  $('#evEmpty').hidden = config.events.length > 0;
  config.events.forEach(e => {
    const li = document.createElement('li');
    li.className = 'rule';
    li.dataset.kind = e.trigger === 'gift' ? (e.minCoins >= 100 ? 'big' : 'gift') : e.trigger;
    li.classList.toggle('off', !e.enabled);
    li.innerHTML = `
      <div class="rule-row">
        <label class="switch"><input type="checkbox" data-do="on"><i></i></label>
        <span class="rule-dot" aria-hidden="true"></span>
        <div class="rule-info"><b></b><small></small></div>
        <button class="btn btn-sm" type="button" data-do="test">בדוק</button>
        <button class="btn btn-sm" type="button" data-do="edit" aria-expanded="false">ערוך</button>
        <button class="btn btn-sm btn-icon" type="button" data-do="del" aria-label="מחק אירוע" title="מחק"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg></button>
      </div>
      <div class="row-confirm" hidden><span>למחוק את האירוע?</span><button type="button" class="btn btn-danger btn-sm" data-do="delYes">כן, מחק</button><button type="button" class="btn btn-sm" data-do="delNo">ביטול</button></div>
      <form class="rule-edit" hidden>
        <label class="field"><span>מתי</span><select name="trigger"><option value="gift">מתנה</option><option value="follow">עוקב חדש</option><option value="share">שיתוף</option><option value="like">לייקים</option><option value="chat">פקודה בצ'אט</option></select></label>
        <div class="field only-gift"><span>מתנה מסוימת (לא חובה)</span><div class="gift-pick-row"><input name="giftName" placeholder="כל מתנה" aria-label="מתנה מסוימת"><button type="button" class="btn btn-sm" data-pick-gift>בחר</button></div></div>
        <label class="field only-gift only-like"><span class="min-label">מינימום מטבעות</span><input name="minCoins" type="number" min="0"></label>
        <label class="field only-gift only-like"><span>מקסימום (0 = בלי הגבלה)</span><input name="maxCoins" type="number" min="0"></label>
        <label class="field ev-chat"><span>הפקודה (ריק = כל הודעה)</span><input name="command" placeholder="!מטאור" dir="auto"></label>
        <label class="field"><span>רק צופה מסוים (לא חובה)</span><input name="user" placeholder="@username" dir="ltr"></label>
        <label class="check ev-gift wide"><input type="checkbox" name="repeatCombo"><span>להפעיל על כל מתנה בקומבו (Rose ×5 = 5 פעמים, עד 10)</span></label>
        <fieldset class="field wide act-pick"><span>אילו פעולות להפעיל</span><div class="act-checks"></div></fieldset>
        <label class="field"><span>אם בחרת כמה פעולות</span><select name="pick"><option value="all">להפעיל את כולן</option><option value="random">להפעיל אחת אקראית</option></select></label>
        <div class="edit-actions wide">
          <button type="submit" class="btn btn-primary btn-sm">שמור</button>
        </div>
      </form>`;
    li.querySelector('b').textContent = evTitle(e);
    li.querySelector('small').textContent = evSummary(e);
    const on = li.querySelector('[data-do="on"]');
    on.checked = e.enabled; on.setAttribute('aria-label', 'הפעלת האירוע');
    on.addEventListener('change', () => { e.enabled = on.checked; saveAE(e.enabled ? 'האירוע הופעל' : 'האירוע כובה'); });
    const form = li.querySelector('form'), f = form.elements;
    ['trigger', 'giftName', 'minCoins', 'maxCoins', 'pick', 'command', 'user'].forEach(k => f[k].value = e[k] ?? '');
    f.repeatCombo.checked = !!e.repeatCombo;
    li.querySelector('.act-checks').innerHTML = config.actions.length
      ? config.actions.map(a => `<label class="check"><input type="checkbox" value="${lvEsc(a.id)}" ${e.actions.includes(a.id) ? 'checked' : ''}><span>${lvEsc(a.name)}</span></label>`).join('')
      : '<p class="hint">קודם צריך ליצור פעולה למעלה.</p>';
    const syncEv = () => { syncTriggerFields(form); form.querySelector('.ev-chat').hidden = f.trigger.value !== 'chat'; form.querySelector('.ev-gift').hidden = f.trigger.value !== 'gift'; };
    syncEv();
    f.trigger.addEventListener('change', syncEv);
    const editBtn = li.querySelector('[data-do="edit"]');
    const toggle = open => { form.hidden = !open; editBtn.setAttribute('aria-expanded', String(open)); editBtn.textContent = open ? 'סגור' : 'ערוך'; open ? openEdits.ev.add(e.id) : openEdits.ev.delete(e.id); };
    editBtn.addEventListener('click', () => toggle(form.hidden));
    if (openEdits.ev.has(e.id)) toggle(true);
    li.querySelector('[data-do="test"]').addEventListener('click', () => {
      if (!e.actions.length) return toast('אין פעולות מחוברות לאירוע הזה');
      socket.emit('testEvent', e.id);
    });
    const conf = li.querySelector('.row-confirm');
    li.querySelector('[data-do="del"]').addEventListener('click', () => conf.hidden = !conf.hidden);
    li.querySelector('[data-do="delNo"]').addEventListener('click', () => conf.hidden = true);
    li.querySelector('[data-do="delYes"]').addEventListener('click', () => { config.events = config.events.filter(x => x.id !== e.id); saveAE('האירוע נמחק'); });
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      Object.assign(e, {
        trigger: f.trigger.value, giftName: f.giftName.value.trim(), minCoins: Number(f.minCoins.value) || 0, maxCoins: Number(f.maxCoins.value) || 0,
        pick: f.pick.value, actions: [...li.querySelectorAll('.act-checks input:checked')].map(x => x.value),
        command: f.command.value.trim(), user: f.user.value.trim(), repeatCombo: f.repeatCombo.checked
      });
      saveAE('האירוע נשמר');
    });
    list.appendChild(li);
  });
}
function renderAE() { renderActions(); renderEvents(); }
function saveAE(msg) {
  socket.emit('saveConfig', { actions: config.actions, events: config.events });
  if (msg) toast(msg);
}
$('#addAction').addEventListener('click', () => {
  const id = 'a' + Date.now().toString(36);
  config.actions.unshift({ id, name: 'פעולה חדשה', screen: 1, duration: 5, sound: '', video: '', image: '', volume: 100, caption: '', effect: 'none', voice: 'none', voiceText: '', wheel: false });
  openEdits.act.add(id);
  saveAE();
});
$('#addEvent').addEventListener('click', () => {
  const id = 'v' + Date.now().toString(36);
  config.events.unshift({ id, enabled: true, trigger: 'gift', giftName: '', minCoins: 1, maxCoins: 0, actions: config.actions[0] ? [config.actions[0].id] : [], pick: 'all' });
  openEdits.ev.add(id);
  saveAE();
});

// ---------- מונה עוקבים ----------
const folView = FollowersView($('#folStage .stage-inner'), { muted: true });
const folForm = $('#folForm');
let folState = null;
socket.on('followers', d => {
  folState = { ...(folState || {}), ...d };
  folView.setData(d, d.initial);
  $('#folInfo').innerHTML = folState.count
    ? `יש לך <b>${fmt(folState.count)}</b> עוקבים${folState.session ? `, <b>${fmt(folState.session)}</b> חדשים בלייב הזה` : ''}${folState.lost ? `, <b>${fmt(folState.lost)}</b> הסירו` : ''}.`
    : 'המספר יופיע אחרי שתתחבר ללייב, או שתכתוב אותו למטה.';
});
function fillFollowersForm(s) {
  for (const el of folForm.elements) {
    if (!el.name || !(el.name in s)) continue;
    if (el.type === 'checkbox') el.checked = !!s[el.name]; else el.value = s[el.name];
  }
  folForm.elements.sound.innerHTML = soundOptions(s.sound);
}
let folTimer = null;
folForm.addEventListener('input', e => {
  if (e.target.id === 'folManual') return;
  const patch = {};
  for (const f of folForm.elements) {
    if (!f.name) continue;
    patch[f.name] = f.type === 'checkbox' ? f.checked : f.type === 'number' ? Number(f.value) || 0 : f.value;
  }
  folView.setSettings({ ...config.followers, ...patch });
  clearTimeout(folTimer);
  folTimer = setTimeout(() => { socket.emit('saveConfig', { followers: patch }); $('#folSaved').textContent = 'נשמר. הווידג׳ט בלייב התעדכן.'; }, 350);
});
folForm.addEventListener('submit', e => e.preventDefault());
$('#testUnfollow').addEventListener('click', () => socket.emit('testUnfollow'));
$('#folManualSet').addEventListener('click', () => {
  const v = Number($('#folManual').value);
  if (!Number.isFinite(v) || v < 0) return toast('צריך לכתוב מספר');
  socket.emit('setFollowers', v);
  toast('מספר העוקבים עודכן');
});

// ---------- גלגל מזל ----------
const wheelView = WheelView($('#wheelStage .stage-inner'), { muted: true });
socket.on('wheelSpin', sp => wheelView.enqueue(sp));
const wheelForm = $('#wheelForm');
let prizes = [];
const pctOf = p => { const tot = prizes.reduce((a, x) => a + Math.max(0, Number(x.chance) || 0), 0); return tot ? Math.round(Math.max(0, Number(p.chance) || 0) / tot * 100) : 0; };
function renderPrizes() {
  const ul = $('#prizeList');
  ul.replaceChildren(...prizes.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'prize-row';
    li.innerHTML = `
      <input type="color" value="${lvEsc(p.color || '#F5C542')}" aria-label="צבע">
      <input type="text" value="${lvEsc(p.text || '')}" maxlength="40" placeholder="${p.image ? 'כיתוב מתחת לתמונה (לא חובה)' : 'מה כתוב על הפרס'}" aria-label="טקסט הפרס">
      <input type="number" min="0" max="1000" value="${Number(p.chance) || 0}" aria-label="סיכוי">
      <button class="btn btn-sm del" type="button" aria-label="מחק פרס" ${prizes.length <= 2 ? 'disabled' : ''}>✕</button>
      <div class="prize-extra">
        ${p.image
          ? `<span class="prize-img"><img src="${lvEsc(p.image)}" alt=""><button class="btn btn-sm" type="button" data-rmimg>הסר תמונה</button></span>`
          : `<label class="btn btn-sm prize-up">הוסף תמונה<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden></label>`}
        <label class="check prize-big"><input type="checkbox" ${p.big ? 'checked' : ''}><span>פרס גדול</span></label>
        <span class="pct">יוצא בערך ב-${pctOf(p)}% מהסיבובים</span>
      </div>`;
    const [color, text, chance] = li.querySelectorAll('input');
    color.addEventListener('input', () => { p.color = color.value; saveWheel(); });
    text.addEventListener('input', () => { p.text = text.value; saveWheel(); });
    chance.addEventListener('input', () => { p.chance = Number(chance.value) || 0; li.parentElement.querySelectorAll('.pct').forEach((el, j) => el.textContent = `יוצא בערך ב-${pctOf(prizes[j])}% מהסיבובים`); saveWheel(); });
    li.querySelector('.del').addEventListener('click', () => { prizes.splice(i, 1); renderPrizes(); saveWheel(); });
    li.querySelector('.prize-big input').addEventListener('change', e => { p.big = e.target.checked; saveWheel(); });
    li.querySelector('[data-rmimg]')?.addEventListener('click', () => { delete p.image; renderPrizes(); saveWheel(); });
    li.querySelector('.prize-up input')?.addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return toast('התמונה גדולה מדי (עד 8MB)');
      try {
        const r = await fetch('/api/wheel-image', { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
        const j = await r.json();
        if (!r.ok) return toast(j.error || 'ההעלאה נכשלה');
        p.image = j.url; renderPrizes(); saveWheel();
      } catch { toast('ההעלאה נכשלה'); }
    });
    return li;
  }));
  $('#addPrize').disabled = prizes.length >= 16;
}
$('#addPrize').addEventListener('click', () => {
  const cols = ['#F5C542', '#FF6A3D', '#3DD68C', '#A48BFA', '#F472B6', '#6FE3FF'];
  prizes.push({ id: 'p' + Date.now(), text: '', color: cols[prizes.length % cols.length], chance: 10 });
  renderPrizes();
  $('#prizeList').lastElementChild?.querySelector('input[type=text]').focus();
});
let wheelTimer = null;
let triggerGifts = [];
// ---------- רשימת המתנות ובחירת מתנות ----------
let giftCatalog = [];
const giftByName = name => giftCatalog.find(g => g.name.toLowerCase() === String(name).trim().toLowerCase());
const giftImg = (g, cls = '') => g && g.image
  ? `<img class="${cls}" src="${lvEsc(g.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'gd-noimg ${cls}',textContent:'🎁'}))">`
  : `<span class="gd-noimg ${cls}">🎁</span>`;
socket.on('gifts', d => {
  giftCatalog = d.list || [];
  renderGiftChips();
  if ($('#giftDialog').open) renderGiftGrid();
});

function renderGiftChips() {
  const ul = $('#giftChips');
  ul.innerHTML = triggerGifts.length
    ? triggerGifts.map((g, i) => {
        const c = giftByName(g);
        return `<li class="gift-chip">${giftImg(c, 'chip-img')}<span dir="ltr">${lvEsc(g)}</span>${c && c.coins ? `<small class="coin">${c.coins}</small>` : ''}<button type="button" aria-label="הסר ${lvEsc(g)}" data-i="${i}">✕</button></li>`;
      }).join('')
    : '<li class="hint">עוד אין מתנות. בלי מתנה הגלגל יסתובב רק מעוקבים, מתורמים גדולים או מפעולות.</li>';
  ul.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { triggerGifts.splice(Number(b.dataset.i), 1); renderGiftChips(); saveWheel(); }));
}

// חלון אחד לכל המקומות: בחירה של כמה מתנות, או של מתנה אחת (בשביל מחיר)
const picker = { multi: true, sel: [], done: null };
function openGiftPicker({ multi = true, selected = [], title = 'בחר מתנות', onDone }) {
  picker.multi = multi; picker.sel = [...selected]; picker.done = onDone;
  $('#giftDialogTitle').textContent = title;
  $('#gdOk').hidden = !multi;
  $('#gdSearch').value = ''; $('#gdManual').value = '';
  renderGiftGrid();
  $('#giftDialog').showModal();
  setTimeout(() => $('#gdSearch').focus(), 30);
}
function renderGiftGrid() {
  const q = $('#gdSearch').value.trim().toLowerCase();
  const sort = $('#gdSort').value;
  let list = giftCatalog.filter(g => !q || g.name.toLowerCase().includes(q));
  list = [...list].sort(sort === 'desc' ? (a, b) => b.coins - a.coins : sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => a.coins - b.coins);
  const few = giftCatalog.length < 10;
  $('#gdNote').textContent = few
    ? 'הרשימה המלאה של טיקטוק נטענת בפעם הראשונה שאתה מתחבר ללייב. אחרי זה היא נשמרת במחשב.'
    : `${giftCatalog.length} מתנות מטיקטוק`;
  $('#gdGrid').innerHTML = list.length ? list.map(g => {
    const on = picker.sel.some(x => x.toLowerCase() === g.name.toLowerCase());
    return `<li><button type="button" class="gd-card" aria-pressed="${on}" data-name="${lvEsc(g.name)}">
      ${giftImg(g, 'gd-img')}<span class="gd-name" dir="ltr">${lvEsc(g.name)}</span><span class="coin">${g.coins || '?'}</span></button></li>`;
  }).join('') : `<li class="gd-empty">לא מצאתי "${lvEsc(q)}". אפשר להוסיף אותה בשם למטה.</li>`;
  $('#gdCount').textContent = picker.multi ? (picker.sel.length ? `נבחרו ${picker.sel.length}` : 'לא נבחרו מתנות') : 'לחץ על מתנה';
}
$('#gdGrid').addEventListener('click', e => {
  const b = e.target.closest('.gd-card'); if (!b) return;
  const name = b.dataset.name;
  if (!picker.multi) { $('#giftDialog').close(); picker.done && picker.done([name], giftByName(name)); return; }
  const i = picker.sel.findIndex(x => x.toLowerCase() === name.toLowerCase());
  if (i >= 0) picker.sel.splice(i, 1); else picker.sel.push(name);
  renderGiftGrid();
});
$('#gdSearch').addEventListener('input', renderGiftGrid);
$('#gdSort').addEventListener('change', renderGiftGrid);
function addManualGift() {
  const name = $('#gdManual').value.trim(); if (!name) return;
  $('#gdManual').value = '';
  if (!picker.multi) { $('#giftDialog').close(); picker.done && picker.done([name], giftByName(name)); return; }
  if (!picker.sel.some(x => x.toLowerCase() === name.toLowerCase())) picker.sel.push(name);
  $('#gdSearch').value = name; renderGiftGrid();
}
$('#gdManualAdd').addEventListener('click', addManualGift);
$('#gdManual').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addManualGift(); } });
$('#gdOk').addEventListener('click', e => { e.preventDefault(); $('#giftDialog').close(); picker.done && picker.done(picker.sel); });
$('#gdRefresh').addEventListener('click', () => {
  const b = $('#gdRefresh'); b.disabled = true; b.textContent = 'מושך מטיקטוק...';
  socket.emit('refreshGifts', r => {
    b.disabled = false; b.textContent = 'רענן מטיקטוק';
    toast(r && r.ok ? `נטענו ${r.count} מתנות` : (r && r.message) || 'לא הצלחתי');
  });
});

$('#wh-giftPick').addEventListener('click', () => openGiftPicker({
  selected: triggerGifts, title: 'המתנות שמסובבות את הגלגל',
  onDone: list => { triggerGifts = list; renderGiftChips(); saveWheel(); }
}));
// "לפי מחיר של מתנה": בוחרים מתנה והמחיר שלה נכנס לשדה
document.addEventListener('click', e => {
  const b = e.target.closest('[data-coins-from]'); if (!b) return;
  const input = document.getElementById(b.dataset.coinsFrom);
  openGiftPicker({ multi: false, title: 'בחר מתנה לפי המחיר שלה', onDone: (n, g) => {
    if (!g || !g.coins) return toast('לא ידוע המחיר של המתנה הזאת');
    input.value = g.coins; input.dispatchEvent(new Event('input', { bubbles: true }));
    toast(`${g.name}: ${g.coins} מטבעות`);
  } });
});
// שדה "שם מתנה" בהתראות ובפעולות: כפתור בחירה לידו
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pick-gift]'); if (!b) return;
  const input = b.parentElement.querySelector('input[name=giftName]');
  const cur = input.value.split(',').map(x => x.trim()).filter(Boolean);
  openGiftPicker({ selected: cur, title: 'בחר מתנות', onDone: list => {
    input.value = list.join(', ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } });
});
$('#wh-testValue').addEventListener('click', () => {
  const w = { ...config.wheel, ...wheelPatch() };
  if (!wheelForm.elements.enabled.checked) return toast('קודם תסמן "הגלגל פעיל"');
  openGiftPicker({ multi: false, title: 'איזו מתנה הצופה המדומה שולח?', onDone: (n, g) => {
    socket.emit('testGiftValue', { name: n[0], coins: g ? g.coins : 1, count: 1 });
    const c = g ? g.coins : 1;
    const named = (w.triggerGifts || []).some(x => x.toLowerCase() === n[0].toLowerCase());
    const byVal = +w.minCoins > 0 && c >= +w.minCoins;
    if (!named && !byVal) return toast(`${n[0]} (${c}) לא מסובבת: היא לא ברשימה וזולה מהמינימום`);
    const spins = +w.coinsPerSpin > 0 ? Math.min(100, Math.max(1, Math.floor(c / +w.coinsPerSpin))) : 1;
    toast(`${n[0]} (${c} מטבעות) = ${spins} סיבובים${+w.bigAtCoins > 0 && c >= +w.bigAtCoins ? ', הראשון פרס גדול' : ''}`);
  } });
});
function wheelPatch() {
  const patch = { prizes, triggerGifts };
  for (const f of wheelForm.elements) {
    if (!f.name) continue;
    patch[f.name] = f.type === 'checkbox' ? f.checked : f.value;
  }
  return patch;
}
function saveWheel() {
  const patch = wheelPatch();
  wheelView.setSettings({ ...config.wheel, ...patch });
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { socket.emit('saveConfig', { wheel: patch }); $('#wheelSaved').textContent = 'נשמר. הגלגל בלייב התעדכן.'; }, 400);
}
wheelForm.addEventListener('input', e => { if (e.target.closest('#prizeList')) return; saveWheel(); });
wheelForm.addEventListener('submit', e => e.preventDefault());
function fillWheelForm(w) {
  for (const el of wheelForm.elements) {
    if (!el.name || !(el.name in w)) continue;
    if (el.type === 'checkbox') el.checked = !!w[el.name]; else el.value = w[el.name];
  }
  prizes = JSON.parse(JSON.stringify(w.prizes || []));
  triggerGifts = [...(w.triggerGifts || [])];
  renderPrizes();
  renderGiftChips();
}
$('#wheelTest').addEventListener('click', () => {
  if (prizes.filter(p => String(p.text || '').trim() || p.image).length < 2) return toast('צריך לפחות 2 פרסים עם טקסט או תמונה');
  if (!wheelForm.elements.enabled.checked) return toast('קודם תסמן "הגלגל פעיל"');
  socket.emit('testWheel');
});
$('#wheelTestBig').addEventListener('click', () => {
  if (!prizes.some(p => p.big)) return toast('קודם תסמן "פרס גדול" ליד אחד הפרסים');
  if (!wheelForm.elements.enabled.checked) return toast('קודם תסמן "הגלגל פעיל"');
  socket.emit('testWheel', { big: true });
});

// ---------- עצירה והחזרה של הגלגל ----------
let wheelPaused = false;
socket.on('wheelState', st => {
  wheelPaused = !!st.paused;
  const box = $('#wheelRun');
  box.dataset.paused = String(wheelPaused);
  $('#wheelRunTitle').textContent = wheelPaused ? 'הגלגל עצור' : 'הגלגל פועל';
  $('#wheelRunSub').textContent = wheelPaused
    ? (st.queued ? `${fmt(st.queued)} סיבובים מחכים בתור ויתחילו כשתחזיר לפעולה` : 'סיבובים חדשים יחכו בתור עד שתחזיר לפעולה')
    : (st.queued ? `${fmt(st.queued)} סיבובים בתור` : 'מתנות ועוקבים מסובבים אותו');
  $('#wheelPauseBtn').textContent = wheelPaused ? 'החזר לפעולה' : 'עצור את הגלגל';
});
$('#wheelPauseBtn').addEventListener('click', () => {
  socket.emit('wheelPause', !wheelPaused);
  toast(wheelPaused ? 'הגלגל חזר לפעולה' : 'הגלגל נעצר. הסיבובים יחכו בתור');
});

// ---------- זוכים בגלגל ----------
let winners = [], winRoom = null, winScope = 'now';
const newWins = new Set();
const dayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' });
function renderWinners() {
  const showTests = $('#winTests').checked;
  const q = $('#winSearch').value.trim().toLowerCase();
  const real = winners.filter(w => !w.test);
  const now = real.filter(w => winRoom && w.room === winRoom);
  const counts = new Map(); real.forEach(w => counts.set(w.name, (counts.get(w.name) || 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  $('#winStats').innerHTML = `
    <div class="win-stat"><b>${fmt(now.length)}</b><span>זכיות בלייב הזה</span></div>
    <div class="win-stat hl"><b>${fmt(now.filter(w => w.big).length)}</b><span>פרסים גדולים בלייב הזה</span></div>
    <div class="win-stat"><b>${fmt(real.length)}</b><span>זכיות בכל הזמנים</span></div>
    <div class="win-stat"><b dir="auto">${top ? lvEsc(top[0]) : '-'}</b><span>${top ? `זכה הכי הרבה (${fmt(top[1])} פעמים)` : 'עוד אין זוכים'}</span></div>`;
  let list = winners.filter(w => showTests || !w.test);
  if (winScope === 'now') list = list.filter(w => (winRoom && w.room === winRoom) || (w.test && Date.now() - w.at < 12 * 3600e3));
  if (winScope === 'big') list = list.filter(w => w.big);
  if (q) list = list.filter(w => String(w.name).toLowerCase().includes(q) || String(w.prize).toLowerCase().includes(q));
  const body = $('#winBody');
  let lastDay = '', html = '';
  for (const w of list.slice(0, 400)) {
    const day = dayFmt.format(w.at);
    if (winScope !== 'now' && day !== lastDay) { html += `<tr class="win-day"><td colspan="5">${day}</td></tr>`; lastDay = day; }
    const via = w.via === 'follow' ? 'עקיבה' : w.via ? `מתנה: <bdi dir="ltr">${lvEsc(w.via)}</bdi>` : '';
    html += `<tr class="${w.big ? 'big' : ''} ${newWins.has(w.id) ? 'new' : ''}">
      <td class="when">${timeFmt.format(w.at)}</td>
      <td class="who" dir="auto">${lvEsc(w.name)}</td>
      <td class="prize" dir="auto">${lvEsc(w.prize)}</td>
      <td class="via">${via}</td>
      <td>${w.big ? '<span class="pill pill-big">פרס גדול</span>' : ''}${w.test ? ' <span class="pill pill-test">בדיקה</span>' : ''}</td></tr>`;
  }
  body.innerHTML = html;
  // בטאב גלגל מזל: רק מי שזכה בפרס גדול, בלייב הזה
  const bigNow = winners.filter(w => w.big && ((winRoom && w.room === winRoom) || (w.test && Date.now() - w.at < 12 * 3600e3) || (!winRoom && Date.now() - w.at < 12 * 3600e3)));
  $('#bigWinners').innerHTML = bigNow.length
    ? bigNow.slice(0, 100).map(w => `<li class="${newWins.has(w.id) ? 'new' : ''}"><span class="bw-time">${timeFmt.format(w.at)}</span><span class="bw-name" dir="auto">${lvEsc(w.name)}</span><span class="bw-prize" dir="auto">${lvEsc(w.prize)}${w.test ? ' <span class="pill pill-test">בדיקה</span>' : ''}</span></li>`).join('')
    : '<li class="bw-empty">עוד אף אחד לא זכה בפרס גדול בלייב הזה.</li>';
  newWins.clear();
  const empty = $('#winEmpty');
  empty.hidden = list.length > 0;
  empty.textContent = winners.length === 0 ? 'עוד אף אחד לא זכה. כשצופה יסובב את הגלגל, הוא יופיע כאן.'
    : winScope === 'now' ? 'בלייב הזה עוד אף אחד לא זכה.' : 'אין זוכים שמתאימים לחיפוש.';
}
socket.on('wheelHistory', d => { winners = d.list || []; winRoom = d.room || null; renderWinners(); });
socket.on('wheelWin', w => { winners.unshift(w); if (w.room) winRoom = w.room; newWins.add(w.id); renderWinners(); });
$$('.seg-tabs [data-scope]').forEach(b => b.addEventListener('click', () => {
  winScope = b.dataset.scope;
  $$('.seg-tabs [data-scope]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  renderWinners();
}));
$('#winSearch').addEventListener('input', renderWinners);
$('#winTests').addEventListener('change', renderWinners);
$('#winClear').addEventListener('click', () => $('#winConfirm').hidden = false);
$('#winClearNo').addEventListener('click', () => $('#winConfirm').hidden = true);
$('#winClearYes').addEventListener('click', () => { socket.emit('clearWheelHistory'); $('#winConfirm').hidden = true; toast('ההיסטוריה נמחקה'); });

// ---------- Top Gift ----------
const tgForm = $('#tgForm');
function fillTopGiftForm(s) {
  for (const el of tgForm.elements) {
    if (!el.name || !(el.name in s)) continue;
    if (el.type === 'checkbox') el.checked = !!s[el.name];
    else el.value = s[el.name];
    if (el.type === 'range') el.nextElementSibling.textContent = el.value;
  }
  tgForm.elements.sound.innerHTML = soundOptions(s.sound);
}
let tgSaveTimer = null;
tgForm.addEventListener('input', e => {
  const el = e.target;
  if (el.type === 'range') el.nextElementSibling.textContent = el.value;
  const patch = {};
  for (const f of tgForm.elements) {
    if (!f.name) continue;
    patch[f.name] = f.type === 'checkbox' ? f.checked : f.type === 'range' ? Number(f.value) : f.value;
  }
  topView.setSettings({ ...config.topGift, ...patch }); // תצוגה מיידית
  clearTimeout(tgSaveTimer);
  tgSaveTimer = setTimeout(() => {
    socket.emit('saveConfig', { topGift: patch });
    $('#tgSaved').textContent = 'נשמר. הווידג׳ט בלייב התעדכן.';
  }, 350);
});
tgForm.addEventListener('submit', e => e.preventDefault());

function renderHolder() {
  const t = topState?.top;
  $('#tgHolder').innerHTML = t
    ? `מקום ראשון: <b><bdi>${lvEsc(t.name)}</bdi></b> עם <bdi>${lvEsc(t.gift)}</bdi>, <span class="coins">${fmt(t.coins)} מטבעות</span>${t.test ? ' <span class="tag-test">בדיקה</span>' : ''}`
    : 'עדיין אף אחד לא שלח מתנה. עד אז מוצגת מתנה לדוגמה.';
}
socket.on('topGift', d => { topState = d; topView.setTop(d); renderHolder(); });
$('#tgTest').addEventListener('click', () => socket.emit('test', 'topGift'));
$('#tgReset').addEventListener('click', () => $('#tgConfirm').hidden = false);
$('#tgResetNo').addEventListener('click', () => $('#tgConfirm').hidden = true);
$('#tgResetYes').addEventListener('click', () => { socket.emit('resetTopGift'); $('#tgConfirm').hidden = true; toast('Top Gift אופס'); });

// ---------- OBS ----------
const OVERLAYS = [
  { name: 'מסך התראות', path: '/alerts', size: 'רזולוציה 1920 על 1080 (כל המסך)' },
  { name: 'Top Gift', path: '/topgift', size: 'רזולוציה 600 על 520' },
  { name: 'מונה עוקבים', path: '/followers', size: 'רזולוציה 500 על 520' },
  { name: 'גלגל מזל', path: '/wheel', size: 'רזולוציה 700 על 700' },
  { name: 'Top Streak', path: '/topstreak', size: 'רזולוציה 600 על 520' },
  { name: 'טיימר סאבתון', path: '/timer', size: 'רזולוציה 700 על 360' },
  { name: 'מסך פעולות 2', path: '/screen/2', size: 'רזולוציה 1920 על 1080 (רק אם יש פעולות במסך 2)' },
  { name: 'מסך פעולות 3', path: '/screen/3', size: 'רזולוציה 1920 על 1080 (רק אם יש פעולות במסך 3)' },
  { name: 'מסך פעולות 4', path: '/screen/4', size: 'רזולוציה 1920 על 1080 (רק אם יש פעולות במסך 4)' }
];
function renderObs() {
  $('#obsList').innerHTML = OVERLAYS.map((o, i) => `
  <li class="panel obs-item">
    <div><h2>${o.name}</h2><p>${o.size}</p></div>
    <button class="btn btn-sm" data-copy="${i}">העתק קישור</button>
    <code id="obs-${i}">${lvEsc(LINK_BASE + o.path)}</code>
  </li>`).join('');
  $$('#obsList [data-copy]').forEach(b => b.addEventListener('click', () => copyText($('#obs-' + b.dataset.copy).textContent)));
}
renderObs();

// ---------- קישור ליד כל מסך ----------
const renderLinkBoxes = () => $$('.link-box').forEach(box => { box.querySelector('code').textContent = LINK_BASE + box.dataset.link; });
renderLinkBoxes();
$$('.link-box').forEach(box => {
  const code = box.querySelector('code');
  box.querySelector('[data-copy-link]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code.textContent); toast('הקישור הועתק'); }
    catch {
      const range = document.createRange(); range.selectNodeContents(code);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      toast('הקישור מסומן, תעתיק עם Ctrl+C');
    }
  });
});

// ---------- ריצה ברקע ----------
socket.on('autostart', a => {
  const st = $('#runState');
  if (!a.supported) { $('#runBox').hidden = true; return; }
  $('#autostart').checked = a.on;
  st.dataset.mode = a.background ? 'bg' : 'window';
  st.textContent = a.background ? 'הכלי רץ ברקע' : 'הכלי רץ עם החלון השחור. אם תסגור אותו, הווידג׳טים ייעלמו';
  $('#toBackground').hidden = a.background;
});
$('#autostart').addEventListener('change', e => {
  socket.emit('setAutostart', e.target.checked);
  toast(e.target.checked ? 'הכלי יופעל אוטומטית כשהמחשב נדלק' : 'ההפעלה האוטומטית בוטלה');
});
$('#toBackground').addEventListener('click', () => { socket.emit('moveToBackground'); });
socket.on('movingToBackground', () => toast('עובר לרקע... החלון השחור ייסגר, והפאנל יחזור בעוד כמה שניות'));
$('#stopTool').addEventListener('click', () => $('#stopConfirm').hidden = false);
$('#stopNo').addEventListener('click', () => $('#stopConfirm').hidden = true);
$('#stopYes').addEventListener('click', () => socket.emit('stopTool'));
socket.on('stopping', () => {
  const b = document.createElement('div');
  b.className = 'offline-banner';
  b.textContent = 'הכלי נעצר. כדי להפעיל אותו שוב: לחיצה כפולה על start.bat';
  document.body.appendChild(b);
});
// אם החיבור לכלי נופל, מראים את זה בבירור
socket.on('disconnect', () => { if (!document.querySelector('.offline-banner')) { const b = document.createElement('div'); b.className = 'offline-banner'; b.id = 'lostBanner'; b.textContent = WEB ? 'אין חיבור לאתר. מתחבר מחדש...' : 'אין חיבור לכלי. מתחבר מחדש...'; document.body.appendChild(b); } });
socket.on('connect', () => document.getElementById('lostBanner')?.remove());

// ---------- הגדרות ----------
$('#saveKey').addEventListener('click', () => {
  socket.emit('saveConfig', { signApiKey: $('#signKey').value.trim() });
  toast($('#signKey').value.trim() ? 'המפתח נשמר' : 'המפתח נמחק');
});

$('#keyBannerGo').addEventListener('click', () => showView('prefs'));
// ---------- גרסת האתר ----------
// באתר השרת שולח 'me': שם המשתמש בדיסקורד והמפתח לקישורים האישיים
let WEB = false;
socket.on('me', m => {
  WEB = true;
  document.body.classList.add('is-web');
  LINK_BASE = `${m.base}/w/${m.key}`;
  renderScreens(); renderObs(); renderLinkBoxes();
  if (config) $('#keyBanner').hidden = !!config.hasSignKey;
  $('#runBox').hidden = true;
  const foot = $('.side-foot');
  if (foot) foot.innerHTML = `<span class="side-dot" aria-hidden="true"></span><span class="side-user" dir="auto"></span><a class="side-out" href="/logout">יציאה</a>`;
  if (foot) foot.querySelector('.side-user').textContent = m.name || 'מחובר';
  // הפרס שהמבקר זכה בו בארגז בדף הבית
  try {
    const prize = localStorage.getItem('ll_prize');
    if (prize) { localStorage.removeItem('ll_prize'); setTimeout(() => toast(`הפרס שלך מהארגז: ${prize}. עכשיו תן לצופים שלך לפתוח ארגזים בטאב "גלגל מזל"`), 1200); }
  } catch {}
});

// ---------- הגדרות מהשרת ----------
// מגיעים ממסך הפתיחה: שם בטיקטוק בכתובת, ופרס מהארגז
const fromHome = (() => { try { return new URLSearchParams(location.search).get('tt'); } catch { return null; } })();
if (fromHome !== null) history.replaceState(null, '', location.pathname + location.hash);
socket.on('config', c => {
  const first = !config;
  config = c;
  if (first && fromHome) {
    const tt = fromHome.replace(/^@/, '').trim().replace(/[^A-Za-z0-9._]/g, '').slice(0, 40);
    if (tt && tt !== c.username) { c.username = tt; socket.emit('saveConfig', { username: tt }); setTimeout(() => toast(`השם ${tt} נשמר. אפשר להתחבר ללייב`), 600); }
  }
  if (first && !WEB) {
    try {
      const prize = localStorage.getItem('ll_prize');
      if (prize) { localStorage.removeItem('ll_prize'); setTimeout(() => toast(`הפרס שלך מהארגז: ${prize}. בטאב "גלגל מזל" הצופים שלך פותחים ארגזים`), 2200); }
    } catch {}
  }
  if (first) {
    $('#username').value = c.username || '';
    fillFollowersForm(c.followers || {});
    fillWheelForm(c.wheel || {});
    $('#signKey').value = c.signApiKey || '';
    if (c.hasSignKey) $('#signKey').placeholder = 'מפתח שמור. אפשר להדביק חדש כדי להחליף';
  }
  if (WEB) {
    $('#keyBanner').hidden = !!c.hasSignKey;
    if (c.hasSignKey) $('#signKey').placeholder = 'מפתח שמור. אפשר להדביק חדש כדי להחליף';
  }
  if (first) {
    fillTopGiftForm(c.topGift);
  }
  topView.setSettings(c.topGift);
  folView.setSettings(c.followers || {});
  wheelView.setSettings(c.wheel || {});
  if (topState) topView.setTop({ ...topState, beaten: false, initial: true });
  renderRules();
  renderAE();
  if (document.activeElement !== fxVol) { fxVol.value = c.fxVolume ?? 80; fxVol.nextElementSibling.textContent = fxVol.value; }
});

fetch('/api/sounds').then(r => r.json()).then(list => {
  sounds = list;
  if (config) { renderRules(); tgForm.elements.sound.innerHTML = soundOptions(config.topGift.sound); }
}).catch(() => {});

showView(location.hash.slice(1) || 'live');

// ---------- הודעות מהאפליקציה (עדכון גרסה) ----------
socket.on('appNotice', n => {
  if (!n || n.kind !== 'update' || document.getElementById('updateBar')) return;
  const bar = document.createElement('div');
  bar.id = 'updateBar'; bar.className = 'update-bar'; bar.setAttribute('role', 'status');
  bar.innerHTML = `<b>גרסה חדשה של LiveLoot מוכנה (${lvEsc(n.version || '')})</b><span>היא תותקן לבד בפעם הבאה שתסגור ותפתח את האפליקציה. לא צריך לעשות כלום.</span><button type="button" aria-label="סגור">✕</button>`;
  bar.querySelector('button').addEventListener('click', () => bar.remove());
  document.body.appendChild(bar);
});

// ---------- תנאי שימוש (פעם אחת) וגרסה ----------
socket.on('appInfo', i => {
  if (i.version) $('#appVersion').textContent = i.version;
  const d = $('#termsDialog');
  if (!i.accepted && i.version && !d.open) d.showModal();   // רק באפליקציה (יש גרסה)
  if (i.accepted && d.open) d.close();
});
$('#termsDialog').addEventListener('cancel', e => e.preventDefault()); // לא נסגר ב-Esc בלי אישור
$('#termsCheck').addEventListener('change', e => { $('#termsOk').disabled = !e.target.checked; });
$('#termsOk').addEventListener('click', () => socket.emit('acceptTerms'));

// ---------- בורר רשתות (יוטיוב בקרוב) ----------
$$('.plat').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.plat === 'youtube') { toast('כלים ליוטיוב לייב יגיעו בעדכון הבא'); return; }
}));

// ---------- טופס כללי: ממלא, שומר ומעדכן תצוגה מקדימה ----------
function bindSettingsForm(form, key, onPreview) {
  const values = () => {
    const patch = {};
    for (const f of form.elements) {
      if (!f.name) continue;
      patch[f.name] = f.type === 'checkbox' ? f.checked : (f.type === 'range' || f.type === 'number') ? Number(f.value) : f.value;
    }
    return patch;
  };
  let t = null;
  form.addEventListener('input', e => {
    if (e.target.type === 'range') e.target.nextElementSibling.textContent = e.target.value;
    const patch = values();
    syncWeekFields(form);
    onPreview && onPreview({ ...config[key], ...patch });
    clearTimeout(t);
    t = setTimeout(() => { socket.emit('saveConfig', { [key]: patch }); const sv = form.querySelector('.saved'); if (sv) sv.textContent = 'נשמר. הווידג׳ט בלייב התעדכן.'; }, 350);
  });
  form.addEventListener('submit', e => e.preventDefault());
  return function fill(s) {
    for (const el of form.elements) {
      if (!el.name || !(el.name in s) || document.activeElement === el) continue;
      if (el.type === 'checkbox') el.checked = !!s[el.name]; else el.value = s[el.name];
      if (el.type === 'range') el.nextElementSibling.textContent = el.value;
    }
    if (form.elements.sound) form.elements.sound.innerHTML = soundOptions(s.sound);
    syncWeekFields(form);
  };
}
function syncWeekFields(form) {
  const p = form.elements.period;
  form.querySelectorAll('.week-only').forEach(el => el.hidden = !p || p.value !== 'week');
}
syncWeekFields(tgForm);
tgForm.addEventListener('input', () => syncWeekFields(tgForm));

// ---------- Top Streak ----------
const streakView = TopGiftView($('#stStage .stage-inner'), { muted: true, streak: true });
const streakSettings = t => ({ ...t, coinsColor: t.numColor, coinsLabel: 'ברצף', showCoins: true, emptyCoins: 50, titleSize: 50, nameSize: 50 });
const fillStreak = bindSettingsForm($('#stForm'), 'topStreak', s => streakView.setSettings(streakSettings(s)));
let streakState = null;
socket.on('topStreak', d => {
  streakState = d; streakView.setTop(d);
  const t = d.top;
  $('#stHolder').innerHTML = t
    ? `השיא: <b><bdi>${lvEsc(t.name)}</bdi></b> עם <bdi>${lvEsc(t.gift)} ×${fmt(t.count)}</bdi> ברצף${t.test ? ' <span class="tag-test">בדיקה</span>' : ''}`
    : 'עוד אין רצף. רצף נספר מ-2 מתנות זהות ברצף ומעלה.';
});
$('#stTest').addEventListener('click', () => socket.emit('testTopStreak'));
$('#stReset').addEventListener('click', () => { socket.emit('resetTopStreak'); toast('Top Streak אופס'); });

// ---------- טיימר סאבתון ----------
const timerView = TimerView($('#tmStage .stage-inner'), { muted: true });
const tmExample = s => {
  const m = n => n >= 60 ? `${Math.floor(n / 60)} דק' ${n % 60 ? (n % 60) + ' שנ\'' : ''}` : `${n} שנ'`;
  $('#tmExample').textContent = `לדוגמה: ורד (1 מטבע) = ${m(s.secPerCoin * 1)}, דונאט (30) = ${m(s.secPerCoin * 30)}, עוקב = ${m(s.secPerFollow)}`;
};
const fillTimer = bindSettingsForm($('#tmForm'), 'timer', s => { timerView.setSettings(s); tmExample(s); });
let tmData = null;
socket.on('timer', d => {
  tmData = d; timerView.setData(d);
  $('#tmStart').textContent = d.started ? 'המשך' : 'התחל';
  $('#tmState').textContent = !d.started ? 'הטיימר עוד לא התחיל. לחץ "התחל" כשהלייב מתחיל.' : d.running ? 'הטיימר רץ. כל מתנה, עוקב ושיתוף מוסיפים זמן.' : 'הטיימר עצור. מתנות לא מוסיפות זמן עד שתמשיך.';
});
$('#tmStart').addEventListener('click', () => socket.emit('timerCmd', { op: 'start' }));
$('#tmPause').addEventListener('click', () => socket.emit('timerCmd', { op: 'pause' }));
$$('[data-tm-add]').forEach(b => b.addEventListener('click', () => socket.emit('timerCmd', { op: 'add', sec: Number(b.dataset.tmAdd) })));
$('#tmReset').addEventListener('click', () => $('#tmConfirm').hidden = false);
$('#tmResetNo').addEventListener('click', () => $('#tmConfirm').hidden = true);
$('#tmResetYes').addEventListener('click', () => { socket.emit('timerCmd', { op: 'reset' }); $('#tmConfirm').hidden = true; });

socket.on('config', c => {
  if (c.topStreak) { fillStreak(c.topStreak); streakView.setSettings(streakSettings(c.topStreak)); if (streakState) streakView.setTop({ ...streakState, beaten: false, initial: true }); }
  if (c.timer) { fillTimer(c.timer); timerView.setSettings(c.timer); tmExample(c.timer); }
  syncWeekFields(tgForm);
});

// ---------- גלגל: סאונד פרס גדול (PRO) וסיכוי לפי מתנה ----------
$('#wh-bigSoundTry').addEventListener('click', () => Sound.play($('#wh-bigSound').value));
const syncLuck = () => { const on = $('#wh-luckBoost').checked; $('.luck-fields').hidden = !on; };
$('#wh-luckBoost').addEventListener('change', syncLuck);
socket.on('config', () => setTimeout(syncLuck, 0));
