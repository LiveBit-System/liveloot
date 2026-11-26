// בונה את docs/i18n-site.js: המנוע של public/i18n.js + המילים מהמילון שהאתר צריך.
// להריץ אחרי שינוי טקסט באתר או במילון:  node scripts/build-site-i18n.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const EN = JSON.parse(fs.readFileSync(path.join(root, 'public/i18n-en.json'), 'utf8'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.(html|js)$/.test(e.name) && e.name !== 'i18n-site.js' ? [path.join(d, e.name)] : []);
const html = walk(path.join(root, 'docs')).map(f => fs.readFileSync(f, 'utf8')).join(' ').replace(/\s+/g, ' ');
const pick = {};
for (const [k, v] of Object.entries(EN)) if (/\{\d+\}/.test(k) || html.includes(k.replace(/\s+/g, ' ')) || html.includes(k.replace(/"/g, '&quot;'))) pick[k] = v;
const engine = fs.readFileSync(path.join(root, 'public/i18n.js'), 'utf8');
fs.writeFileSync(path.join(root, 'docs/i18n-site.js'), `window.LL_EN=${JSON.stringify(pick)};\n${engine}`);
console.log('site words:', Object.keys(pick).length);
