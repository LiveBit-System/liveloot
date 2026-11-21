// בונים את ההתקנה של Windows מלינוקס בלי wine: electron-builder יודע לחלץ את קובץ ההסרה
// ב-JavaScript (UninstallerReader), אבל משתמש בזה רק במק. כאן מפעילים את זה תמיד.
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'targets', 'nsis', 'NsisTarget.js');
let s = fs.readFileSync(f, 'utf8');
const from = 'if ((0, macosVersion_1.isMacOsCatalina)()) {\n            try {\n                await nsisUtil_1.UninstallerReader.exec';
if (s.includes(from)) {
  s = s.replace(from, 'if (true) {\n            try {\n                await nsisUtil_1.UninstallerReader.exec');
  fs.writeFileSync(f, s);
  console.log('patched electron-builder: uninstaller extracted without wine');
} else console.log('electron-builder already patched (or changed)');
