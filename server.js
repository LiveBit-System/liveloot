// LiveLoot - כלי התראות ווידג'טים ל-TikTok LIVE
// מריצים עם start.bat ופותחים http://localhost:3000

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
let MsEdgeTTS = null, OUTPUT_FORMAT = {};
try { ({ MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')); } catch { console.log('[tts] msedge-tts not installed, funny voices are off'); }

// באפליקציה (LiveLoot.exe) הכלי רץ בתוך החלון, והנתונים נשמרים בתיקיית המשתמש
const APP = !!process.env.LIVELOOT_APP;
const PORT = +process.env.LIVELOOT_PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.LIVELOOT_DATA || path.join(ROOT, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SOUNDS_DIR = APP ? path.join(DATA_DIR, 'sounds') : path.join(ROOT, 'sounds');
const WHEEL_IMG_DIR = path.join(DATA_DIR, 'wheel-images');
const MEDIA_DIR = path.join(DATA_DIR, 'media');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SOUNDS_DIR, { recursive: true });

// ---------- הגדרות ברירת מחדל ----------
const DEFAULT_TOPGIFT = {
  title: 'המתנה הכי גדולה',
  titleColor: '#FFFFFF',
  titleSize: 50,
  nameColor: '#FFFFFF',
  nameSize: 50,
  coinsColor: '#F5C542',
  coinsLabel: 'מטבעות',
  emptyCoins: 15000,        // המספר שמוצג לפני שמישהו שלח מתנה
  showGift: true,
  showAvatar: true,
  showCoins: true,
  outline: true,
  outlineColor: '#141414',
  font: 'fredoka',
  mode: 'send',            // send = כל השליחה (מתנה × כמות ברצף), single = מחיר מתנה אחת
  celebrate: true,         // אנימציה כשמישהו עוקף את השיא
  sound: 'builtin:fanfare',
  resetOnNewStream: true
};

// אפקטים על המסך. לכל אירוע מופעל החוק הכי מדויק שמתאים (מתנה בשם > מינימום גבוה > כללי)
const DEFAULT_EFFECTS = [
  { id: 'e1', enabled: true, name: 'מטאור על מתנה גדולה', trigger: 'gift', giftName: '', minCoins: 100,
    effect: 'meteor', voice: 'announcer', voiceText: '{name} הפיל מטאור!' },
  { id: 'e4', enabled: true, name: 'שואב אבק קוסמי', trigger: 'gift', giftName: '', minCoins: 20,
    effect: 'vacuum', voice: 'giant', voiceText: '{name} נשאב לחור שחור' },
  { id: 'e2', enabled: true, name: 'הצופה נזרק על המסך', trigger: 'gift', giftName: '', minCoins: 1,
    effect: 'splat', voice: 'chipmunk', voiceText: '{name}' },
  { id: 'e3', enabled: false, name: 'עוקב חדש נזרק', trigger: 'follow', giftName: '', minCoins: 0,
    effect: 'splat', voice: 'giant', voiceText: '{name} עוקב' }
];

function newAction(a = {}) {
  return { id: a.id || 'a' + Date.now().toString(36), name: a.name || 'פעולה חדשה', screen: Number(a.screen) || 1, duration: Number(a.duration) || 5,
    sound: a.sound || '', soundName: a.soundName || '', video: a.video || '', videoName: a.videoName || '', image: a.image || '', imageName: a.imageName || '',
    volume: a.volume ?? 100, caption: a.caption || '', effect: a.effect || 'none', voice: a.voice || 'none', voiceText: a.voiceText || '', wheel: !!a.wheel,
    cooldown: Number(a.cooldown) || 0, userCooldown: Number(a.userCooldown) || 0 };
}
function newEvent(e = {}) {
  return { id: e.id || 'v' + Date.now().toString(36), enabled: e.enabled !== false, trigger: e.trigger || 'gift', giftName: e.giftName || '',
    minCoins: Number(e.minCoins) || 0, maxCoins: Number(e.maxCoins) || 0, actions: Array.isArray(e.actions) ? e.actions : [], pick: e.pick === 'random' ? 'random' : 'all',
    command: e.command || '', user: e.user || '', repeatCombo: !!e.repeatCombo };
}

// מונה עוקבים
const DEFAULT_FOLLOWERS = {
  label: 'עוקבים', ringColor: '#F5C542', numberColor: '#FFFFFF', labelColor: '#C9CCD3',
  font: 'fredoka', outline: true, showAvatar: true, showSession: true, celebrate: true, sound: 'builtin:pop', goal: 0
};

// גלגל מזל
const DEFAULT_WHEEL = {
  enabled: true, triggerGifts: ['Rose'], onFollow: false, hideIdle: false,
  // תורמים גדולים: 0 = כבוי
  minCoins: 0, coinsPerSpin: 0, bigAtCoins: 0,
  prizes: [
    { id: 'p1', text: 'רק שוטגאן', color: '#F5C542', chance: 20 },
    { id: 'p2', text: 'בלי לבנות', color: '#FF6A3D', chance: 15 },
    { id: 'p3', text: 'שיר בלייב', color: '#3DD68C', chance: 15 },
    { id: 'p4', text: 'מבטא רוסי', color: '#A48BFA', chance: 15 },
    { id: 'p5', text: 'רק פיקאקס', color: '#F472B6', chance: 10 },
    { id: 'p6', text: 'נסה שוב', color: '#6FE3FF', chance: 25 }
  ]
};

const DEFAULT_CONFIG = {
  wheel: DEFAULT_WHEEL,
  followers: DEFAULT_FOLLOWERS,
  fxVolume: 80,
  username: 'liroy0641',
  signApiKey: '',
  topGift: DEFAULT_TOPGIFT,
  rules: [
    { id: 'r1', enabled: true, name: 'כל מתנה', trigger: 'gift', giftName: '', minCoins: 0,
      title: '{name}', subtitle: 'שלח {gift} ×{count}', duration: 5, sound: 'builtin:coin', style: 'gift' },
    { id: 'r2', enabled: true, name: 'מתנה גדולה', trigger: 'gift', giftName: '', minCoins: 100,
      title: '{name}', subtitle: 'מתנה ענקית! {gift} ×{count}', duration: 8, sound: 'builtin:fanfare', style: 'big' },
    { id: 'r3', enabled: true, name: 'עוקב חדש', trigger: 'follow', giftName: '', minCoins: 0,
      title: '{name}', subtitle: 'התחיל לעקוב', duration: 4, sound: 'builtin:pop', style: 'follow' },
    { id: 'r4', enabled: true, name: 'שיתוף', trigger: 'share', giftName: '', minCoins: 0,
      title: '{name}', subtitle: 'שיתף את הלייב', duration: 4, sound: 'builtin:pop', style: 'share' },
    { id: 'r5', enabled: false, name: 'הרבה לייקים', trigger: 'like', giftName: '', minCoins: 15,
      title: '{name}', subtitle: 'שלח {count} לייקים', duration: 3, sound: 'none', style: 'like' }
  ]
};

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

const TERMS_VERSION = '2026-11';
let config = { ...DEFAULT_CONFIG, ...readJson(CONFIG_FILE, {}) };
config.topGift = { ...DEFAULT_TOPGIFT, ...(config.topGift || {}) };
// פעולות ואירועים: פעולה = מה קורה על המסך, אירוע = מתי זה קורה. האפקטים הישנים הופכים לפעולות + אירועים
if (!Array.isArray(config.actions) || !Array.isArray(config.events)) {
  const old = Array.isArray(config.effects) ? config.effects : DEFAULT_EFFECTS;
  config.actions = []; config.events = [];
  const giftMins = old.filter(e => e.trigger === 'gift' && !e.giftName).map(e => Number(e.minCoins) || 0).sort((a, b) => a - b);
  for (const e of old) {
    const aid = 'a' + e.id;
    config.actions.push(newAction({ id: aid, name: e.name, effect: e.effect, voice: e.voice, voiceText: e.voiceText }));
    // בעבר רק האפקט הכי חזק הופעל. עכשיו כל האירועים שמתאימים פועלים, אז נותנים לכל אחד טווח מטבעות
    let maxCoins = 0;
    if (e.trigger === 'gift' && !e.giftName) { const next = giftMins.find(m => m > (Number(e.minCoins) || 0)); if (next) maxCoins = next - 1; }
    config.events.push(newEvent({ id: 'v' + e.id, enabled: e.enabled !== false, trigger: e.trigger, giftName: e.giftName || '', minCoins: Number(e.minCoins) || 0, maxCoins, actions: [aid] }));
  }
}
delete config.effects; delete config.knownEffects;
config.actions = config.actions.map(newAction);
config.events = config.events.map(newEvent);
if (typeof config.fxVolume !== 'number') config.fxVolume = 80;
config.followers = { ...DEFAULT_FOLLOWERS, ...(config.followers || {}) };
delete config.tts; // קריאת הצ'אט הוסרה
delete config.wheel?.announce; delete config.wheel?.voice;
config.wheel = { ...DEFAULT_WHEEL, ...(config.wheel || {}) };
// מעבר ממתנה אחת לכמה מתנות שמסובבות
if (typeof config.wheel.triggerGift === 'string') {
  const g = config.wheel.triggerGift.trim();
  config.wheel.triggerGifts = g ? [g] : [];
  delete config.wheel.triggerGift;
}
if (!Array.isArray(config.wheel.triggerGifts)) config.wheel.triggerGifts = [];
const saveConfig = () => writeJson(CONFIG_FILE, config);
saveConfig();

// מצב שנשמר בין הפעלות (כדי שה-Top Gift לא ייעלם אם סוגרים את הכלי באמצע לייב)
let state = { topGift: null, lastRoomId: null, followers: { count: 0, avatar: '', name: '', session: 0 }, ...readJson(STATE_FILE, {}) };
if (!Array.isArray(state.wheelHistory)) state.wheelHistory = []; // מי זכה בגלגל (רק לפאנל)
const saveState = () => writeJson(STATE_FILE, state);

// ---------- שרת ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use('/', express.static(path.join(ROOT, 'public')));
app.use('/sounds', express.static(SOUNDS_DIR));
app.use('/wheel-img', express.static(WHEEL_IMG_DIR));
app.use('/media', express.static(MEDIA_DIR));
// העלאת סאונד / וידאו / תמונה לפעולות (נשמר בתיקיית data\media)
const MEDIA_TYPES = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'weba', 'audio/aac': 'aac', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp'
};
app.post('/api/media', express.raw({ type: () => true, limit: '80mb' }), (req, res) => {
  const ext = MEDIA_TYPES[String(req.headers['content-type'] || '').split(';')[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'סוג קובץ לא נתמך. אפשר MP3, WAV, MP4, WEBM, PNG, JPG, GIF' });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
  fs.writeFileSync(path.join(MEDIA_DIR, name), req.body);
  let original = '';
  try { original = decodeURIComponent(String(req.headers['x-file-name'] || '')).slice(0, 80); } catch {}
  res.json({ url: '/media/' + name, name: original || name });
});
// העלאת תמונה לפרס בגלגל (נשמרת בתיקיית data)
app.post('/api/wheel-image', express.raw({ type: 'image/*', limit: '8mb' }), (req, res) => {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[req.headers['content-type']];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'רק תמונות PNG, JPG, GIF או WEBP' });
  fs.mkdirSync(WHEEL_IMG_DIR, { recursive: true });
  const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
  fs.writeFileSync(path.join(WHEEL_IMG_DIR, name), req.body);
  res.json({ url: '/wheel-img/' + name });
});
// מסך הפתיחה מופיע רק בפעם הראשונה. אחר כך נפתח ישר הפאנל (ו-/home מציג אותו שוב)
app.get('/', (req, res) => /(^|;\s*)ll_seen=1/.test(req.headers.cookie || '') ? res.redirect('/panel.html') : res.sendFile(path.join(ROOT, 'public/home.html')));
app.get('/home', (req, res) => res.sendFile(path.join(ROOT, 'public/home.html')));
app.get('/legal', (req, res) => res.sendFile(path.join(ROOT, 'public/legal.html')));
// קישורים קצרים ל-OBS / TikTok LIVE Studio
app.get('/alerts', (req, res) => res.sendFile(path.join(ROOT, 'public/overlay/alerts.html')));
app.get('/topgift', (req, res) => res.sendFile(path.join(ROOT, 'public/overlay/topgift.html')));
app.get('/followers', (req, res) => res.sendFile(path.join(ROOT, 'public/overlay/followers.html')));
app.get('/wheel', (req, res) => res.sendFile(path.join(ROOT, 'public/overlay/wheel.html')));
app.get('/screen/:n', (req, res) => res.sendFile(path.join(ROOT, 'public/overlay/alerts.html')));
// ---------- קול: Edge TTS בעברית (חינמי, דרך האינטרנט) ----------
const TTS_VOICES = { avri: 'he-IL-AvriNeural', hila: 'he-IL-HilaNeural' };
const ttsCache = new Map();
// מנקה אימוג'ים וסימנים שהקריין היה מקריא בצורה מוזרה
const cleanSpeech = t => String(t || '').replace(/[^\p{L}\p{N}\s.,!?'"-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
const xmlEsc = t => t.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
async function synth(text, voice) {
  if (!MsEdgeTTS) throw new Error('msedge-tts not installed');
  const key = voice + '|' + text;
  if (ttsCache.has(key)) return ttsCache.get(key);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(TTS_VOICES[voice] || TTS_VOICES.avri, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(xmlEsc(text));
  const buf = await new Promise((resolve, reject) => {
    const chunks = [];
    audioStream.on('data', c => chunks.push(c));
    audioStream.on('close', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
  try { tts.close(); } catch {}
  if (ttsCache.size > 80) ttsCache.delete(ttsCache.keys().next().value);
  ttsCache.set(key, buf);
  return buf;
}
app.get('/api/tts', async (req, res) => {
  const text = cleanSpeech(req.query.text) || 'צופה';
  try {
    const buf = await synth(text, String(req.query.voice || 'avri'));
    res.set('Content-Type', 'audio/mpeg').send(buf);
  } catch (e) {
    console.error('[tts] failed:', e?.message || e);
    res.status(502).end();
  }
});

app.get('/api/sounds', (req, res) => {
  res.json(fs.readdirSync(SOUNDS_DIR).filter(f => /\.(mp3|wav|ogg)$/i.test(f)));
});

// ---------- סטטוס ופיד ----------
let connection = null;
let giftList = new Map();
// מתנות מוכרות, למקרה שגם רשימת המתנות של החדר לא נטענה
const KNOWN_GIFTS = { 5655: { name: 'Rose', diamond_count: 1, type: 1 } };
let status = { state: 'offline', message: 'לא מחובר', username: config.username, viewers: 0, likes: 0 };
const feed = [];

// ---------- רשימת המתנות של טיקטוק ----------
// נמשכת ישר מטיקטוק כשמתחברים ללייב, ונשמרת במחשב כדי שתהיה זמינה גם בלי לייב
const GIFTS_FILE = path.join(DATA_DIR, 'gifts.json');
let giftCatalog = [];
try { giftCatalog = JSON.parse(fs.readFileSync(GIFTS_FILE, 'utf8')).filter(g => g && g.name); } catch {}
if (!giftCatalog.length) giftCatalog = [{ id: 5655, name: 'Rose', coins: 1, image: '' }];
const sortCatalog = () => giftCatalog.sort((a, b) => a.coins - b.coins || a.name.localeCompare(b.name));
function saveCatalog() {
  sortCatalog();
  try { fs.writeFileSync(GIFTS_FILE, JSON.stringify(giftCatalog)); } catch (e) { console.error('[gifts]', e.message); }
  io.emit('gifts', { list: giftCatalog, updated: Date.now() });
}
function setCatalogFromTikTok(raw) {
  const list = (Array.isArray(raw) ? raw : raw?.gifts || []).filter(g => g && g.name);
  if (!list.length) return 0;
  const byName = new Map(giftCatalog.map(g => [g.name.toLowerCase(), g]));
  for (const g of list) {
    giftList.set(String(g.id), g);
    byName.set(String(g.name).toLowerCase(), { id: g.id, name: String(g.name).trim(), coins: Number(g.diamond_count ?? g.diamondCount) || 0, image: imgUrl(g.image) || imgUrl(g.icon) || '' });
  }
  giftCatalog = [...byName.values()];
  saveCatalog();
  return list.length;
}
// מתנה שהגיעה בלייב ולא הייתה ברשימה נכנסת אליה לבד
function learnGift(evt) {
  if (!evt.gift || /^Gift \d+$/.test(evt.gift)) return;
  const g = giftCatalog.find(x => x.name.toLowerCase() === evt.gift.toLowerCase());
  if (g) { if (!g.image && evt.giftImage) { g.image = evt.giftImage; saveCatalog(); } return; }
  giftCatalog.push({ id: evt.giftId || 0, name: evt.gift, coins: evt.unitCoins || 0, image: evt.giftImage || '' });
  saveCatalog();
}
async function refreshGiftCatalog() {
  if (!connection) return { ok: false, message: 'צריך להתחבר ללייב כדי למשוך את המתנות מטיקטוק' };
  try {
    const n = setCatalogFromTikTok(await connection.fetchAvailableGifts());
    console.log(`[gifts] loaded ${n} gifts from TikTok`);
    return n ? { ok: true, count: giftCatalog.length } : { ok: false, message: 'טיקטוק לא החזירה מתנות. נסה שוב בעוד דקה' };
  } catch (e) {
    console.error('[gifts] fetch failed:', e?.message || e);
    return { ok: false, message: 'לא הצלחתי למשוך את המתנות מטיקטוק. נסה שוב בעוד דקה' };
  }
}

function setStatus(patch) {
  status = { ...status, ...patch };
  io.emit('status', status);
}
function pushFeed(evt) {
  feed.unshift(evt);
  if (feed.length > 60) feed.pop();
  io.emit('feed', evt);
}
// טיקטוק משנה מדי פעם את שמות השדות בהודעות. כאן תומכים גם בשמות הישנים וגם בחדשים
// (נבדק מול הודעות אמיתיות מהלייב: nickname, displayId, avatarThumb.urlList, content, gift.diamondCount)
function findUser(data) {
  if (data?.user && (data.user.nickname || data.user.uniqueId || data.user.displayId)) return data.user;
  const seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 4 || seen.has(o)) return null;
    seen.add(o);
    if ((typeof o.nickname === 'string' && o.nickname) || (typeof o.uniqueId === 'string' && o.uniqueId)) return o;
    for (const k of Object.keys(o)) {
      if (k === 'toUser' || k === 'atUser') continue; // לא המקבל, השולח
      const r = walk(o[k], depth + 1);
      if (r) return r;
    }
    return null;
  };
  return walk(data, 0) || data?.user || null;
}
const imgUrl = img => img?.urlList?.[0] || img?.url_list?.[0] || img?.url?.[0] || '';
const pic = data => { const u = findUser(data); return imgUrl(u?.profilePicture) || imgUrl(u?.avatarThumb) || ''; };
const userId = data => { const u = findUser(data); return u?.uniqueId || u?.displayId || ''; };
const displayName = data => { const u = findUser(data); return u?.nickname || u?.uniqueId || u?.displayId || 'צופה'; };

// ---------- Top Gift ----------
function giftValue(evt) {
  return config.topGift.mode === 'single' ? (evt.unitCoins || evt.coins) : evt.coins;
}
function updateTopGift(evt) {
  const value = giftValue(evt);
  if (!value) return;
  const current = state.topGift;
  if (current && value <= current.coins) return; // צריך לעקוף, לא להשתוות
  state.topGift = {
    name: evt.name, avatar: evt.avatar || '', gift: evt.gift, giftImage: evt.giftImage || '',
    count: evt.count, coins: value, at: Date.now(), test: !!evt.test
  };
  saveState();
  io.emit('topGift', { top: state.topGift, previous: current || null, beaten: !!current });
}
function resetTopGift() {
  state.topGift = null;
  saveState();
  io.emit('topGift', { top: null, previous: null, beaten: false, reset: true });
}

// ---------- חוקים ----------
function fill(text, evt) {
  return String(text || '')
    .replaceAll('{name}', evt.name)
    .replaceAll('{gift}', evt.gift || '')
    .replaceAll('{count}', evt.count ?? '')
    .replaceAll('{coins}', evt.coins ?? '');
}
function matchRule(rule, evt) {
  if (!rule.enabled || rule.trigger !== evt.type) return false;
  if (evt.type === 'gift') {
    // אפשר כמה מתנות מופרדות בפסיק: "Rose, Lion"
    if (rule.giftName && !giftNames(rule.giftName).includes(String(evt.gift).toLowerCase())) return false;
    if (rule.minCoins && evt.coins < rule.minCoins) return false;
  }
  if (evt.type === 'like' && rule.minCoins && evt.count < rule.minCoins) return false;
  return true;
}
// החוק הכי ספציפי מנצח: מתנה בשם > מינימום גבוה > כללי
function pickRule(evt) {
  const matches = config.rules.filter(r => matchRule(r, evt));
  matches.sort((a, b) => (b.giftName ? 1 : 0) - (a.giftName ? 1 : 0) || (b.minCoins || 0) - (a.minCoins || 0));
  return matches[0];
}
function sendAlert(rule, evt) {
  io.emit('alert', {
    id: evt.id, style: rule.style,
    title: fill(rule.title, evt), subtitle: fill(rule.subtitle, evt),
    avatar: evt.avatar || '', giftImage: evt.giftImage || '',
    duration: rule.duration, sound: rule.sound
  });
}
// ---------- מונה עוקבים ----------
function emitFollowers(extra = {}) {
  io.emit('followers', { ...state.followers, ...extra });
}
function addFollower(evt) {
  const f = state.followers;
  if (evt.test) { // בדיקה: מראה +1 על המסך בלי לשנות את המספר האמיתי
    emitFollowers({ count: f.count + 1, session: (f.session || 0) + 1, lastName: evt.name });
    return;
  }
  const total = Number(evt.followCount || 0);
  f.count = total > f.count ? total : f.count + 1; // טיקטוק שולח את המספר המדויק, ואם לא, מוסיפים 1
  followsSincePoll++;
  f.session = (f.session || 0) + 1;
  saveState();
  emitFollowers({ lastName: evt.name });
}
// פרטי בעל הלייב (תמונה, שם, עוקבים) מתוך מידע החדר שמגיע בחיבור
function ownerInfo(roomInfo) {
  const seen = new Set();
  const find = (o, d) => {
    if (!o || typeof o !== 'object' || d > 5 || seen.has(o)) return null;
    seen.add(o);
    if (o.owner && typeof o.owner === 'object') return o.owner;
    for (const k of Object.keys(o)) { const r = find(o[k], d + 1); if (r) return r; }
    return null;
  };
  const o = find(roomInfo, 0);
  if (!o) return null;
  return {
    count: Number(o.follow_info?.follower_count ?? o.followInfo?.followerCount ?? 0),
    avatar: o.avatar_thumb?.url_list?.[0] || o.avatarThumb?.urlList?.[0] || o.avatar_medium?.url_list?.[0] || '',
    name: o.nickname || o.display_id || ''
  };
}

// ---------- ירידה בעוקבים ----------
// טיקטוק לא שולחת אירוע "הסיר עוקב", ולא אומרת מי. אז בודקים את מספר העוקבים כל דקה,
// ואם הוא ירד מראים את הירידה (בלי שם, כי אין דרך לדעת)
let followPoll = null;
// משווים מדידה למדידה מאותו מקור (מידע החדר), ומקזזים את העוקבים החדשים שהגיעו בינתיים.
// ככה עיכוב במספר של טיקטוק לא נראה כמו "הסירו עוקב"
let pollBase = 0, followsSincePoll = 0;
function startFollowerPoll(startCount) {
  clearInterval(followPoll);
  pollBase = Number(startCount) || 0;
  followsSincePoll = 0;
  followPoll = setInterval(async () => {
    if (!connection || status.state !== 'live') return;
    try {
      const owner = ownerInfo(await connection.fetchRoomInfo());
      if (!owner || !owner.count) return;
      if (pollBase) {
        const unfollows = followsSincePoll - (owner.count - pollBase);
        if (unfollows > 0) {
          const f = state.followers;
          f.count = Math.max(0, f.count - unfollows);
          f.lost = (f.lost || 0) + unfollows;
          saveState();
          emitFollowers({ lostNow: unfollows });
          console.log(`[followers] -${unfollows} (now ${f.count})`);
        }
      }
      pollBase = owner.count;
      followsSincePoll = 0;
    } catch (e) { /* נבדוק שוב בעוד דקה */ }
  }, 60 * 1000);
}

// ---------- גלגל מזל ----------
// השרת בוחר את הפרס (לפי אחוזי הסיכוי) ומתזמן סיבוב אחד בכל פעם, כדי שכל המסכים יראו אותו דבר
const SPIN_MS = 6000, SPIN_GAP_MS = 4300;
let wheelFreeAt = 0, wheelPending = 0, wheelGen = 0;
function pickPrize(prizes) {
  const total = prizes.reduce((a, p) => a + Math.max(0, Number(p.chance) || 0), 0);
  if (total <= 0) return Math.floor(Math.random() * prizes.length);
  let r = Math.random() * total;
  for (let i = 0; i < prizes.length; i++) { r -= Math.max(0, Number(prizes[i].chance) || 0); if (r < 0) return i; }
  return prizes.length - 1;
}
// תור הסיבובים: מי שתרם מתנה מסובב לפני מי שרק עשה עוקב. בתוך כל קבוצה, לפי הסדר
const wheelQueue = [];
let wheelTimer = null;
// השהיה: סיבובים חדשים נכנסים לתור ומחכים, ולא מתחילים עד שמחזירים לפעולה
if (typeof state.wheelPaused !== 'boolean') state.wheelPaused = false;
const emitWheelState = () => io.emit('wheelState', { paused: state.wheelPaused, queued: wheelQueue.length });
function spinWheel(evt, times = 1, opt = {}) {
  const w = config.wheel;
  const prizes = (w.prizes || []).filter(p => String(p.text || '').trim() || p.image);
  if (!w.enabled || prizes.length < 2) return;
  const prio = evt.type === 'follow' ? 1 : 0;
  for (let n = 0; n < times && wheelQueue.length < 500; n++) wheelQueue.push({ evt: n === 0 && opt.bigFirst ? { ...evt, forceBig: true } : evt, prio, seq: Date.now() + n / 100 });
  runWheelQueue();
  emitWheelState();
}
// סיבוב אחד בכל פעם. כשהגלגל פתוח ב-LIVE Studio, הוא מודיע מתי הפרס הופיע ומתי סיים,
// וזה מה שקובע את הזוכים ואת תחילת הסיבוב הבא. בלי גלגל פתוח, שעונים קבועים במקום
let wheelOverlays = 0, wheelBusy = null;
function runWheelQueue() {
  clearTimeout(wheelTimer);
  if (wheelBusy || !wheelQueue.length || state.wheelPaused) return;
  wheelQueue.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
  const { evt } = wheelQueue.shift();
  const prizes = (config.wheel.prizes || []).filter(p => String(p.text || '').trim() || p.image);
  if (!config.wheel.enabled || prizes.length < 2) { wheelQueue.length = 0; emitWheelState(); return; }
  let index = pickPrize(prizes);
  if (evt.forceBig) { const b = prizes.findIndex(p => p.big); if (b >= 0) index = b; }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const live = wheelOverlays > 0;
  wheelBusy = { id, evt, prizes, index, recorded: false, gen: wheelGen,
    resultTimer: setTimeout(() => recordWheelWin(id), SPIN_MS + (live ? 9000 : 200)),
    doneTimer: setTimeout(() => finishWheelSpin(id), live ? SPIN_MS + 25000 : SPIN_MS + SPIN_GAP_MS) };
  wheelPending = wheelQueue.length;
  io.emit('wheelSpin', { id, name: evt.name, avatar: evt.avatar || '', index, prizes, duration: SPIN_MS, pending: wheelPending });
  emitWheelState();
}
function recordWheelWin(id) {
  const b = wheelBusy;
  if (!b || b.id !== id || b.recorded || b.gen !== wheelGen) return;
  b.recorded = true;
  const { evt, prizes, index } = b;
  const prize = String(prizes[index].text || '').trim() || 'פרס';
  pushFeed({ id: Date.now() + Math.random(), time: Date.now(), type: 'wheel', name: evt.name, text: prize, test: !!evt.test });
  const win = { id, at: Date.now(), name: evt.name || 'צופה', uid: evt.uid || '',
    prize, big: !!prizes[index].big, room: state.lastRoomId || null, test: !!evt.test, via: evt.type === 'follow' ? 'follow' : evt.gift ? evt.gift : '' };
  state.wheelHistory.unshift(win);
  if (state.wheelHistory.length > 1000) state.wheelHistory.length = 1000;
  saveState();
  io.emit('wheelWin', win);
}
function finishWheelSpin(id) {
  const b = wheelBusy;
  if (!b || b.id !== id) return;
  recordWheelWin(id);
  clearTimeout(b.resultTimer); clearTimeout(b.doneTimer);
  wheelBusy = null;
  wheelTimer = setTimeout(runWheelQueue, 500);
}
const followSpun = new Set(); // מי כבר סובב בזכות עקיבה בלייב הזה
function clearWheel() { wheelGen++; wheelPending = 0; wheelFreeAt = 0; wheelQueue.length = 0; clearTimeout(wheelTimer); if (wheelBusy) { clearTimeout(wheelBusy.resultTimer); clearTimeout(wheelBusy.doneTimer); wheelBusy = null; } emitWheelState(); }

// ---------- פעולות ואירועים ----------
function matchEvent(ev, evt) {
  if (!ev.enabled || ev.trigger !== evt.type) return false;
  if (ev.user) {
    const want = ev.user.replace(/^@/, '').trim().toLowerCase();
    if (want && ![evt.uid, evt.name].some(x => String(x || '').toLowerCase() === want)) return false;
  }
  if (evt.type === 'chat') {
    const cmd = ev.command.trim().toLowerCase();
    return !cmd || String(evt.text || '').trim().toLowerCase().startsWith(cmd);
  }
  if (!matchRule(ev, evt)) return false;
  const amount = evt.type === 'gift' ? evt.coins : evt.type === 'like' ? evt.count : null;
  if (amount != null && ev.maxCoins && amount > ev.maxCoins) return false;
  return true;
}
// זמן המתנה: כמה שניות עד שאפשר להפעיל שוב (לכולם, ולכל צופה בנפרד)
const lastRun = new Map();
function onCooldown(a, evt) {
  if (evt.test) return false;
  const now = Date.now();
  if (a.cooldown && now - (lastRun.get(a.id) || 0) < a.cooldown * 1000) return true;
  const uk = a.id + '|' + (evt.uid || evt.name);
  if (a.userCooldown && now - (lastRun.get(uk) || 0) < a.userCooldown * 1000) return true;
  lastRun.set(a.id, now); lastRun.set(uk, now);
  return false;
}
function runAction(a, evt) {
  if (!a || onCooldown(a, evt)) return;
  if (a.wheel) spinWheel(evt);
  const hasScreen = a.sound || a.video || a.image || a.caption || (a.effect && a.effect !== 'none') || (a.voice && a.voice !== 'none');
  if (!hasScreen) return;
  io.emit('action', {
    screen: a.screen || 1, duration: a.duration || 5, volume: a.volume ?? 100,
    sound: a.sound, video: a.video, image: a.image, caption: fill(a.caption, evt),
    effect: a.effect, voice: a.voice, voiceText: fill(a.voiceText, evt),
    name: evt.name, avatar: evt.avatar || '', giftImage: evt.giftImage || ''
  });
}
function runEvent(ev, evt) {
  const list = ev.actions.map(id => config.actions.find(a => a.id === id)).filter(Boolean);
  if (!list.length) return;
  // קומבו: Rose x5 מפעיל 5 פעמים (עד 10), עם רווח קטן בין הפעמים
  const times = ev.trigger === 'gift' && ev.repeatCombo ? Math.min(10, Math.max(1, evt.count || 1)) : 1;
  for (let n = 0; n < times; n++) {
    setTimeout(() => {
      const run = ev.pick === 'random' ? [list[Math.floor(Math.random() * list.length)]] : list;
      run.forEach(a => runAction(a, evt));
    }, n * 700);
  }
}
function fireEvents(evt) {
  for (const ev of config.events || []) if (matchEvent(ev, evt)) runEvent(ev, evt);
}
const SAMPLE_VIEWERS = ['Player1', 'Gamer1', 'BlueFox', 'NovaX'];
const giftNames = v => String(v || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const firstGift = v => String(v || '').split(',')[0].trim();
function sampleEvt(type = 'gift', ev = {}) {
  const name = SAMPLE_VIEWERS[Math.floor(Math.random() * SAMPLE_VIEWERS.length)];
  const coins = Math.max(1, Number(ev.minCoins) || 1);
  return { type, name, gift: firstGift(ev.giftName) || 'Rose', count: type === 'like' ? coins : (ev.repeatCombo ? 3 : 1), coins, avatar: '', text: ev.command || '', test: true };
}
function handleEvent(evt) {
  evt.id = Date.now() + Math.random().toString(36).slice(2, 6);
  evt.time = Date.now();
  const rule = pickRule(evt);
  evt.rule = rule ? rule.name : null;
  pushFeed(evt);
  if (rule) sendAlert(rule, evt);
  if (evt.type === 'gift') updateTopGift(evt);
  if (evt.type === 'follow') addFollower(evt);
  const wt = config.wheel;
  if (evt.type === 'gift') {
    if (!evt.test) learnGift(evt);
    // מתנה מהרשימה, או כל מתנה ששווה לפחות X מטבעות
    const named = (wt.triggerGifts || []).some(g => String(g).trim().toLowerCase() === String(evt.gift).toLowerCase());
    const minC = Number(wt.minCoins) || 0, perSpin = Number(wt.coinsPerSpin) || 0, bigAt = Number(wt.bigAtCoins) || 0;
    const byValue = minC > 0 && (evt.unitCoins || 0) >= minC;
    if (named || byValue) {
      // יותר מטבעות = יותר סיבובים. בלי זה: כל מתנה ברצף = סיבוב
      let times = perSpin > 0 ? Math.floor((evt.coins || 0) / perSpin) : (evt.count || 1);
      times = Math.min(Math.max(1, times), 100);
      // מתנה ענקית: הסיבוב הראשון שלה נוחת על פרס גדול
      spinWheel(evt, times, { bigFirst: bigAt > 0 && (evt.coins || 0) >= bigAt });
    }
  }
  // עוקב מסובב רק פעם אחת בכל לייב, גם אם הוריד עוקב ועקב שוב
  if (evt.type === 'follow' && wt.onFollow) {
    const k = String(evt.uid || evt.name || '').toLowerCase();
    if (evt.test || !followSpun.has(k)) { if (!evt.test) followSpun.add(k); spinWheel(evt); }
  }
  fireEvents(evt);
}

// ---------- חיבור לטיקטוק ----------
async function connectLive() {
  await disconnectLive(true);
  const username = config.username.replace(/^@/, '').trim();
  if (!username) return setStatus({ state: 'error', message: 'חסר שם משתמש' });
  const at = '⁨@' + username + '⁩'; // שומר על כיוון השם בתוך טקסט בעברית

  setStatus({ state: 'connecting', message: 'מתחבר ל-' + at + '...', username });

  const opts = {};
  if (config.signApiKey) opts.signApiKey = config.signApiKey;
  connection = new TikTokLiveConnection(username, opts);

  connection.on(WebcastEvent.GIFT, data => {
    const d = data.giftDetails || data.gift || {};
    // אם המתנה מגיעה בלי פרטים, משלימים מרשימת המתנות של החדר
    const x = data.extendedGiftInfo || giftList.get(String(data.giftId)) || KNOWN_GIFTS[data.giftId] || {};
    const giftType = d.giftType ?? d.type ?? x.type;
    const count = data.repeatCount || 1;
    const unit = Number(d.diamondCount || x.diamond_count || 0);
    const giftName = d.giftName || d.name || x.name || ('Gift ' + data.giftId);
    console.log(`[gift] ${displayName(data)} | ${giftName} x${count} | ${unit} coins each | streak end ${!!data.repeatEnd}`);
    if (giftType === 1 && !data.repeatEnd) return; // מתנות ברצף: רק בסוף הרצף
    handleEvent({
      type: 'gift', name: displayName(data), uid: userId(data), avatar: pic(data),
      gift: giftName, giftId: data.giftId, count,
      unitCoins: unit || 1, coins: (unit || 1) * count, // אם המחיר לא ידוע, לפחות לא לפספס את המתנה
      giftImage: imgUrl(d.giftImage) || imgUrl(d.image) || imgUrl(x.image) || ''
    });
  });
  connection.on(WebcastEvent.FOLLOW, data => handleEvent({ type: 'follow', name: displayName(data), uid: userId(data), avatar: pic(data), followCount: Number(data.followCount || 0) }));
  connection.on(WebcastEvent.SHARE, data => handleEvent({ type: 'share', name: displayName(data), uid: userId(data), avatar: pic(data) }));
  connection.on(WebcastEvent.LIKE, data => {
    const total = data.totalLikeCount ?? data.total;
    if (total) setStatus({ likes: Number(total) });
    handleEvent({ type: 'like', name: displayName(data), uid: userId(data), avatar: pic(data), count: Number(data.likeCount ?? data.count ?? 1) });
  });
  connection.on(WebcastEvent.CHAT, data => console.log(`[chat] ${displayName(data)}: ${data.comment || data.content || ''}`));
  connection.on(WebcastEvent.CHAT, data => {
    const evt = { id: Date.now() + Math.random(), time: Date.now(), type: 'chat',
      name: displayName(data), uid: userId(data), avatar: pic(data), text: data.comment || data.content || '' };
    pushFeed(evt);
    fireEvents(evt);
  });
  connection.on(WebcastEvent.ROOM_USER, data => setStatus({ viewers: Number(data.viewerCount ?? data.total ?? 0) }));
  connection.on(WebcastEvent.STREAM_END, () => setStatus({ state: 'offline', message: 'הלייב הסתיים' }));
  connection.on(ControlEvent.DISCONNECTED, () => {
    if (status.state === 'live') setStatus({ state: 'offline', message: 'החיבור נותק' });
  });
  connection.on(ControlEvent.ERROR, ({ info, exception }) => console.error('[TikTok error]', info, exception?.message || ''));
  connection.on(ControlEvent.CONNECTED, () => console.log('[TikTok] connected, waiting for events...'));

  try {
    const s = await connection.connect();
    // לייב חדש = roomId חדש. מאפסים את ה-Top Gift רק אז, לא כשסתם מתחברים מחדש לאותו לייב
    if (s?.roomId && s.roomId !== state.lastRoomId) {
      state.lastRoomId = s.roomId;
      followSpun.clear();
      state.followers.session = 0; // לייב חדש: סופרים מחדש את העוקבים של הלייב
      state.followers.lost = 0;
      if (config.topGift.resetOnNewStream) resetTopGift(); else saveState();
    }
    const owner = ownerInfo(s?.roomInfo || connection?.roomInfo);
    if (owner) {
      if (owner.count) state.followers.count = owner.count;
      if (owner.avatar) state.followers.avatar = owner.avatar;
      if (owner.name) state.followers.name = owner.name;
      saveState();
      emitFollowers({ initial: true });
      console.log(`[TikTok] followers: ${state.followers.count}`);
    }
    setStatus({ state: 'live', message: 'מחובר ללייב של ' + at });
    refreshGiftCatalog(); // ברקע, לא מעכב את החיבור
    startFollowerPoll(owner?.count);
  } catch (err) {
    const name = err?.constructor?.name || '';
    let message = 'החיבור נכשל: ' + (err?.message || err);
    if (name === 'UserOfflineError') message = at + ' לא בלייב כרגע. תעלה ללייב ואז תתחבר.';
    if (name === 'InvalidResponseCompositeError') message = 'לא מצאתי לייב פעיל של ' + at + '. תבדוק שאתה בלייב ושהשם נכון.';
    if (name === 'SignatureRateLimitError') message = 'שירות החתימה עמוס. נסה שוב בעוד דקה, או הוסף מפתח Euler בהגדרות.';
    console.error('[TikTok] connect failed:', name, err?.message);
    connection = null;
    setStatus({ state: 'error', message });
  }
}
async function disconnectLive(silent) {
  clearInterval(followPoll);
  if (connection) {
    const c = connection;
    connection = null;
    try { await c.disconnect(); } catch {}
  }
  if (!silent) setStatus({ state: 'offline', message: 'לא מחובר' });
}

// ---------- אירועי בדיקה ----------
const SAMPLE_NAMES = ['pixel.queen', 'fn.legend', 'moon_walker', 'sky.dreamer', 'night.owl', 'cool_cat'];
const TEST = {
  gift: () => ({ type: 'gift', name: 'luna.live', gift: 'Rose', count: 5, unitCoins: 1, coins: 5 }),
  bigGift: () => ({ type: 'gift', name: 'big.spender', gift: 'Lion', count: 1, unitCoins: 29999, coins: 29999 }),
  follow: () => ({ type: 'follow', name: 'star.rider' }),
  share: () => ({ type: 'share', name: 'happy.viewer' }),
  like: () => ({ type: 'like', name: 'like.machine', count: 30 }),
  // מתנה שתמיד עוקפת את השיא הנוכחי, כדי לראות את אנימציית העקיפה
  topGift: () => {
    const base = state.topGift?.coins || 0;
    const coins = base ? base + Math.ceil(base * 0.3) : 500;
    return { type: 'gift', name: SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)],
      gift: coins > 5000 ? 'Universe' : 'Galaxy', count: 1, unitCoins: coins, coins };
  }
};

// ---------- סוקט ----------
io.on('connection', socket => {
  // מראה בחלון השחור כשווידג'ט ב-LIVE Studio מתחבר, כדי לדעת אם הוא בכלל הגיע לכלי
  const from = (() => { try { return new URL(socket.handshake.headers.referer || '').pathname; } catch { return ''; } })();
  if (from && from !== '/panel.html' && !from.startsWith('/panel')) {
    const t = new Date().toLocaleTimeString('he-IL');
    console.log(`[widget] ${t} connected: ${from}`);
    socket.on('disconnect', () => console.log(`[widget] ${new Date().toLocaleTimeString('he-IL')} disconnected: ${from}`));
  }
  socket.emit('status', status);
  socket.emit('config', config);
  socket.emit('feedAll', feed);
  socket.emit('topGift', { top: state.topGift, previous: null, beaten: false, initial: true });
  socket.emit('followers', { ...state.followers, initial: true });
  socket.emit('wheelHistory', { list: state.wheelHistory, room: state.lastRoomId });
  socket.emit('gifts', { list: giftCatalog });
  socket.on('refreshGifts', async (ack) => { const r = await refreshGiftCatalog(); if (typeof ack === 'function') ack(r); });
  socket.emit('wheelState', { paused: state.wheelPaused, queued: wheelQueue.length });
  socket.on('wheelOverlay', () => {
    if (socket.data.wheelOverlay) return;
    socket.data.wheelOverlay = true; wheelOverlays++;
    socket.on('disconnect', () => { wheelOverlays = Math.max(0, wheelOverlays - 1); });
  });
  socket.on('wheelResult', id => recordWheelWin(String(id)));
  socket.on('wheelDone', id => finishWheelSpin(String(id)));
  socket.on('wheelPause', on => { state.wheelPaused = !!on; saveState(); if (!state.wheelPaused) runWheelQueue(); emitWheelState(); });
  socket.on('clearWheelHistory', () => { state.wheelHistory = []; saveState(); io.emit('wheelHistory', { list: [], room: state.lastRoomId }); });

  socket.on('connectLive', () => connectLive());
  socket.on('disconnectLive', () => disconnectLive());
  socket.on('test', kind => { if (TEST[kind]) handleEvent({ ...TEST[kind](), test: true }); });
  socket.on('resetTopGift', () => resetTopGift());
  socket.on('clearScreen', () => { clearWheel(); io.emit('clear'); });
  // בדיקה של "תורמים גדולים": מתנה בשווי מסוים מצופה מדומה
  socket.on('testGiftValue', g => {
    const c = giftCatalog.find(x => x.name === g?.name) || { name: 'Gift', coins: Math.max(1, Number(g?.coins) || 1), image: '' };
    const count = Math.max(1, Math.min(99, Number(g?.count) || 1));
    handleEvent({ type: 'gift', name: 'BlueFox', uid: 'test', avatar: '', gift: c.name, count, unitCoins: c.coins || 1, coins: (c.coins || 1) * count, giftImage: c.image, test: true });
  });
  socket.on('testWheel', opt => spinWheel({ name: ['Player1', 'Gamer1', 'BlueFox', 'NovaX'][Math.floor(Math.random() * 4)], test: true, forceBig: !!(opt && opt.big) }));
  socket.on('testUnfollow', () => {
    const f = state.followers;
    emitFollowers({ count: Math.max(0, f.count - 1), lost: (f.lost || 0) + 1, lostNow: 1 });
  });
  socket.emit('autostart', autostartInfo());
  socket.on('setAutostart', on => {
    try { setAutostart(!!on); } catch (e) { console.error('[autostart]', e.message); }
    io.emit('autostart', autostartInfo());
  });
  socket.on('moveToBackground', () => moveToBackground());
  socket.on('stopTool', () => { io.emit('stopping'); setTimeout(() => process.exit(0), 300); });
  // מספר עוקבים ידני (למשל לפני הלייב הראשון, כשעוד לא ידוע)
  socket.on('setFollowers', n => {
    const v = Math.max(0, Math.floor(Number(n) || 0));
    state.followers.count = v;
    saveState();
    emitFollowers({ initial: true });
  });
  socket.on('testAction', id => runAction((config.actions || []).find(a => a.id === id), sampleEvt('gift')));
  socket.on('testEvent', id => {
    const ev = (config.events || []).find(e => e.id === id);
    if (ev) runEvent(ev, sampleEvt(ev.trigger, ev));
  });
  socket.on('testRule', id => {
    const rule = config.rules.find(r => r.id === id);
    if (!rule) return;
    const sample = rule.trigger === 'gift'
      ? { type: 'gift', name: 'בדיקה', gift: firstGift(rule.giftName) || 'Rose', count: 1, coins: Math.max(rule.minCoins || 1, 1) }
      : rule.trigger === 'like' ? { type: 'like', name: 'בדיקה', count: Math.max(rule.minCoins || 1, 1) }
      : { type: rule.trigger, name: 'בדיקה' };
    const evt = { ...sample, id: 't' + Date.now(), time: Date.now(), test: true, rule: rule.name };
    pushFeed(evt);
    sendAlert(rule, evt);
  });
  // תנאי השימוש: מאשרים פעם אחת (ושוב רק אם הגרסה שלהם משתנה)
  socket.emit('appInfo', { version: process.env.LIVELOOT_VERSION || '', terms: TERMS_VERSION, accepted: config.termsAccepted === TERMS_VERSION });
  socket.on('acceptTerms', () => { config.termsAccepted = TERMS_VERSION; saveConfig(); io.emit('appInfo', { version: process.env.LIVELOOT_VERSION || '', terms: TERMS_VERSION, accepted: true }); });
  socket.on('saveConfig', patch => {
    if (patch.topGift) patch.topGift = { ...config.topGift, ...patch.topGift };
    if (patch.followers) patch.followers = { ...config.followers, ...patch.followers };
    if (patch.wheel) patch.wheel = { ...config.wheel, ...patch.wheel };
    config = { ...config, ...patch };
    saveConfig();
    io.emit('config', config);
    if (patch.username) setStatus({ username: config.username });
  });
});

// באפליקציה אין הפעלה ברקע: היא נפתחת ונסגרת עם החלון
function autostartInfo() { return { supported: false, on: false, background: false }; }
function setAutostart() {}
function moveToBackground() {}
// הלוג לא גדל בלי סוף
try { const lf = path.join(DATA_DIR, 'log.txt'); if (fs.existsSync(lf) && fs.statSync(lf).size > 5e6) fs.writeFileSync(lf, ''); } catch {}


// אם הכלי כבר רץ ברקע, לא מפעילים עוד עותק
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    if (APP && global.__livelootPortBusy) return global.__livelootPortBusy();
    console.log('\n  LiveLoot is already running in the background.');
    console.log('  Panel: http://localhost:' + PORT + '\n');
    process.exit(0);
  }
  throw e;
});

global.__livelootNotice = msg => io.emit('appNotice', msg);
server.listen(PORT, () => {
  if (global.__livelootReady) global.__livelootReady();
  console.log('');
  console.log('  LiveLoot is running');
  console.log('  Panel:            http://localhost:' + PORT);
  console.log('  Alerts link:      http://liveloot.localtest.me:' + PORT + '/alerts');
  console.log('  Top Gift link:    http://liveloot.localtest.me:' + PORT + '/topgift');
  console.log('');
});
