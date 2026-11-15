// שם את אייקון הארגז ופרטי LiveLoot בתוך LiveLoot.exe (בלי wine, ב-JavaScript בלבד)
const path = require('path');
const fs = require('fs');

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import('resedit');
  const exePath = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  const ico = Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 1033, ico.icons.map(i => i.data));

  const ver = ctx.packager.appInfo.version;
  const [a, b, c] = ver.split('.').map(Number);
  const vi = Resource.VersionInfo.fromEntries(res.entries)[0];
  vi.setFileVersion(a, b, c, 0, 1033);
  vi.setProductVersion(a, b, c, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: 'LiveLoot',
    ProductName: 'LiveLoot',
    CompanyName: 'Liroy',
    OriginalFilename: 'LiveLoot.exe',
    InternalName: 'LiveLoot',
    LegalCopyright: 'LiveLoot'
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('  • LiveLoot icon written into', path.basename(exePath));
};
