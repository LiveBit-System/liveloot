// LiveLoot - אפליקציה למחשב
// פותחת חלון עם הפאנל, ומריצה את השרת בתוכה בלי חלון שחור.
// סוגרים את החלון והכל נסגר, כולל הווידג'טים ב-LIVE Studio.
const { app, BrowserWindow, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch {}

const PORT = 4777;
const PANEL = `http://localhost:${PORT}/`;

// רק עותק אחד פתוח. פתיחה שנייה מחזירה את החלון הקיים לקדמת המסך
if (!app.requestSingleInstanceLock()) { app.quit(); return; }

let win = null;
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
});

// צלילים בפאנל (תצוגה מקדימה של הגלגל וההתראות) בלי ללחוץ קודם על הדף
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function startServer() {
  const data = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(data, { recursive: true });
  process.env.LIVELOOT_APP = '1';
  process.env.LIVELOOT_PORT = String(PORT);
  process.env.LIVELOOT_DATA = data;
  process.env.LIVELOOT_VERSION = app.getVersion();
  // לוג לקובץ, כדי שיהיה מה לבדוק אם משהו לא עובד אצל משתמש
  try {
    const logFile = path.join(data, 'log.txt');
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 5e6) fs.writeFileSync(logFile, '');
    const out = fs.createWriteStream(logFile, { flags: 'a' });
    const wrap = orig => (...a) => { try { out.write(a.map(String).join(' ') + '\n'); } catch {} orig(...a); };
    console.log = wrap(console.log.bind(console));
    console.error = wrap(console.error.bind(console));
  } catch {}
  return new Promise(resolve => {
    global.__livelootReady = () => resolve(true);
    global.__livelootPortBusy = () => resolve(false);
    require('./server.js');
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380, height: 880, minWidth: 980, minHeight: 640,
    backgroundColor: '#0E0A1A',
    title: 'LiveLoot',
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true }
  });
  win.once('ready-to-show', () => win.show());

  // קישורים לאתרים אחרים נפתחים בדפדפן הרגיל, לא בתוך האפליקציה
  const isLocal = url => /^https?:\/\/(localhost|127\.0\.0\.1|([a-z0-9-]+\.)?localtest\.me)(:\d+)?\//i.test(url);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocal(url)) shell.openExternal(url.replace(/\/\/[^/]*localtest\.me/i, '//localhost'));
    else if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isLocal(url)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });

  win.loadURL(PANEL);
  // סגירת החלון עוצרת את LiveLoot, ואז הווידג'טים בלייב נעלמים (ריבועים אפורים ב-LIVE Studio). שואלים לפני
  win.on('close', e => {
    if (app.__quitting) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['מזער ותשאיר פועל', 'סגור בכל זאת'], defaultId: 0, cancelId: 0,
      title: 'LiveLoot', message: 'אם תסגור את LiveLoot, הגלגל וההתראות בלייב יפסיקו לעבוד.',
      detail: 'בזמן לייב צריך להשאיר את LiveLoot פתוח. אפשר פשוט למזער אותו.'
    });
    if (r === 0) { e.preventDefault(); win.minimize(); } else app.__quitting = true;
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const ok = await startServer();
  if (!ok) {
    dialog.showErrorBox('LiveLoot',
      'LiveLoot כבר פתוח, או שתוכנה אחרת משתמשת בפורט ' + PORT + '.\n' +
      'סגור את החלון הקודם של LiveLoot ונסה שוב.');
    app.exit(0);
    return;
  }
  createWindow();
  checkForUpdates();
});

// עדכונים אוטומטיים מ-GitHub: מורידים ברקע, ומתקינים כשסוגרים את האפליקציה
function checkForUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', i => console.log('[update] available', i.version));
  autoUpdater.on('update-downloaded', i => {
    console.log('[update] downloaded', i.version);
    if (global.__livelootNotice) global.__livelootNotice({ kind: 'update', version: i.version });
  });
  autoUpdater.on('error', e => console.log('[update] error', e && e.message));
  const run = () => autoUpdater.checkForUpdates().catch(e => console.log('[update] check failed', e && e.message));
  setTimeout(run, 8000);
  setInterval(run, 3 * 60 * 60 * 1000); // בלייב ארוך, בודק שוב כל 3 שעות
}

// סגירת החלון סוגרת את כל הכלי
app.on('before-quit', () => { app.__quitting = true; });
app.on('window-all-closed', () => app.quit());
