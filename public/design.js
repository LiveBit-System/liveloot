// ---------- עיצוב מהיר: קנבס 1080 על 1080 ----------
(() => {
  const SIZE = 1080;
  const stage = $('#dsStage');
  const cv = new fabric.Canvas('dsCanvas', { preserveObjectStacking: true, backgroundColor: '#ffffff', selectionColor: 'rgba(124,77,255,.12)', selectionBorderColor: '#7C4DFF' });
  fabric.Object.prototype.set({ transparentCorners: false, cornerColor: '#FFD23F', cornerStrokeColor: '#200A3A', borderColor: '#7C4DFF', cornerSize: 14, cornerStyle: 'circle', padding: 6 });

  // התאמת גודל: העיצוב תמיד 1080, התצוגה מוקטנת לפי המקום
  function fit() {
    const w = Math.max(240, Math.min(stage.clientWidth, 720));
    const z = w / SIZE;
    cv.setDimensions({ width: w, height: w });
    cv.setZoom(z);
    cv.requestRenderAll();
  }
  new ResizeObserver(fit).observe(stage);

  // ---------- ביטול וביצוע שוב ----------
  let undo = [], redo = [], restoring = false, snapT = null;
  const snapshot = () => JSON.stringify(cv.toDatalessJSON(['dsKind']));
  function record() {
    if (restoring) return;
    clearTimeout(snapT);
    snapT = setTimeout(() => {
      const s = snapshot();
      if (undo[undo.length - 1] !== s) { undo.push(s); if (undo.length > 60) undo.shift(); redo = []; }
      save(s);
    }, 120);
  }
  function restore(json) {
    restoring = true;
    cv.loadFromJSON(json, () => { cv.requestRenderAll(); restoring = false; syncBg(); onSelect(); save(json); });
  }
  function doUndo() { if (undo.length < 2) return; redo.push(undo.pop()); restore(undo[undo.length - 1]); }
  function doRedo() { if (!redo.length) return; const s = redo.pop(); undo.push(s); restore(s); }
  ['object:added', 'object:modified', 'object:removed'].forEach(ev => cv.on(ev, record));
  cv.on('text:changed', record);

  // שמירה אוטומטית במחשב, כדי שהעיצוב לא ייעלם כשסוגרים
  function save(s) { try { localStorage.setItem('ll_design', s); } catch {} }

  // ---------- טקסט ----------
  async function useFont(val) {
    const [family, weight] = val.split('|');
    try { await document.fonts.load(`${weight} 80px "${family}"`, 'אבג abc'); } catch {}
    return { fontFamily: family, fontWeight: weight };
  }
  $('#dsAddText').addEventListener('click', async () => {
    const f = await useFont($('#dsFont').value);
    const t = new fabric.IText('הטקסט שלך', {
      left: SIZE / 2, top: SIZE / 2, originX: 'center', originY: 'center',
      fontSize: 120, fill: '#FFD23F', stroke: '#200A3A', strokeWidth: 10, paintFirst: 'stroke',
      textAlign: 'center', direction: 'rtl', ...f, dsKind: 'text'
    });
    cv.add(t); cv.setActiveObject(t); cv.requestRenderAll();
  });

  // ---------- תמונות ----------
  function addImage(url, at) {
    fabric.Image.fromURL(url, img => {
      if (!img || !img.width) return toast('לא הצלחתי לטעון את התמונה');
      const max = SIZE * 0.6, k = Math.min(1, max / Math.max(img.width, img.height));
      img.set({ left: at ? at.x : SIZE / 2, top: at ? at.y : SIZE / 2, originX: 'center', originY: 'center', scaleX: k, scaleY: k, dsKind: 'image' });
      cv.add(img); cv.setActiveObject(img); cv.requestRenderAll();
    }, { crossOrigin: 'anonymous' });
  }
  $('#dsImgInput').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return toast('התמונה גדולה מדי (עד 15MB)');
    const rd = new FileReader();
    rd.onload = () => addImage(rd.result);
    rd.readAsDataURL(f);
  });

  // ---------- ספריית מתנות ----------
  const giftSrc = g => g.image ? '/api/img?u=' + encodeURIComponent(g.image) : '';
  function renderGifts() {
    const q = $('#dsGiftSearch').value.trim().toLowerCase();
    const list = (typeof giftCatalog !== 'undefined' ? giftCatalog : []).filter(g => g.image && (!q || g.name.toLowerCase().includes(q)));
    $('#dsGiftGrid').innerHTML = list.length ? list.slice(0, 400).map(g => `
      <li><button type="button" class="ds-gift" draggable="true" data-src="${lvEsc(giftSrc(g))}" title="${lvEsc(g.name)}">
        <img src="${lvEsc(giftSrc(g))}" alt="" loading="lazy"><span dir="ltr">${lvEsc(g.name)}</span></button></li>`).join('')
      : '<li class="hint">אין מתנות עם תמונה עדיין. תתחבר ללייב פעם אחת או לחץ "רענן מטיקטוק" בבחירת המתנות של הגלגל.</li>';
  }
  $('#dsGiftsBtn').addEventListener('click', () => {
    const open = $('#dsGifts').hidden;
    $('#dsGifts').hidden = !open; $('#dsGiftsBtn').setAttribute('aria-expanded', String(open));
    if (open) renderGifts();
  });
  $('#dsGiftSearch').addEventListener('input', renderGifts);
  $('#dsGiftGrid').addEventListener('click', e => { const b = e.target.closest('.ds-gift'); if (b) addImage(b.dataset.src); });
  $('#dsGiftGrid').addEventListener('dragstart', e => { const b = e.target.closest('.ds-gift'); if (b) e.dataTransfer.setData('text/ll-gift', b.dataset.src); });
  stage.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/ll-gift') || [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  stage.addEventListener('drop', e => {
    e.preventDefault();
    const r = cv.upperCanvasEl.getBoundingClientRect(), z = cv.getZoom();
    const at = { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
    const src = e.dataTransfer.getData('text/ll-gift');
    if (src) return addImage(src, at);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) { const rd = new FileReader(); rd.onload = () => addImage(rd.result, at); rd.readAsDataURL(f); }
  });

  // ---------- מאפייני טקסט ----------
  const isText = o => o && (o.type === 'i-text' || o.type === 'textbox' || o.type === 'text');
  function onSelect() {
    const o = cv.getActiveObject();
    $('#dsTextProps').hidden = !isText(o);
    $('#dsObjTools').disabled = !o;
    if (isText(o)) {
      const v = `${o.fontFamily}|${o.fontWeight}`;
      if ([...$('#dsFont').options].some(x => x.value === v)) $('#dsFont').value = v;
      $('#dsSize').value = Math.round(o.fontSize * (o.scaleY || 1)); $('#dsSize').nextElementSibling.textContent = $('#dsSize').value;
      $('#dsColor').value = toHex(o.fill); $('#dsStroke').value = toHex(o.stroke || '#000000');
      $('#dsStrokeW').value = o.strokeWidth || 0; $('#dsStrokeW').nextElementSibling.textContent = $('#dsStrokeW').value;
    }
  }
  const toHex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#000000';
  ['selection:created', 'selection:updated', 'selection:cleared'].forEach(ev => cv.on(ev, onSelect));
  function setText(props) {
    const o = cv.getActiveObject(); if (!isText(o)) return;
    o.set(props); o.setCoords(); cv.requestRenderAll(); record();
  }
  $('#dsFont').addEventListener('change', async () => setText(await useFont($('#dsFont').value)));
  $('#dsSize').addEventListener('input', e => { e.target.nextElementSibling.textContent = e.target.value; setText({ fontSize: Number(e.target.value), scaleX: 1, scaleY: 1 }); });
  $('#dsColor').addEventListener('input', e => setText({ fill: e.target.value }));
  $('#dsStroke').addEventListener('input', e => setText({ stroke: e.target.value }));
  $('#dsStrokeW').addEventListener('input', e => { e.target.nextElementSibling.textContent = e.target.value; setText({ strokeWidth: Number(e.target.value), paintFirst: 'stroke' }); });

  // ---------- רקע ----------
  function syncBg() {
    const bg = cv.backgroundColor;
    $('#dsTransparent').checked = !bg;
    if (bg) $('#dsBg').value = toHex(bg);
    stage.classList.toggle('transparent', !bg);
  }
  $('#dsBg').addEventListener('input', e => { cv.setBackgroundColor(e.target.value, () => { cv.requestRenderAll(); syncBg(); record(); }); });
  $('#dsTransparent').addEventListener('change', e => { cv.setBackgroundColor(e.target.checked ? null : $('#dsBg').value, () => { cv.requestRenderAll(); syncBg(); record(); }); });

  // ---------- כלים לפריט ----------
  const act = () => cv.getActiveObject();
  $('#dsFront').addEventListener('click', () => { const o = act(); if (o) { o.bringForward(); cv.requestRenderAll(); record(); } });
  $('#dsBack').addEventListener('click', () => { const o = act(); if (o) { o.sendBackwards(); cv.requestRenderAll(); record(); } });
  $('#dsDup').addEventListener('click', () => { const o = act(); if (o) o.clone(c => { c.set({ left: o.left + 40, top: o.top + 40 }); cv.add(c); cv.setActiveObject(c); cv.requestRenderAll(); }, ['dsKind']); });
  function delSel() { const objs = cv.getActiveObjects(); if (!objs.length) return; objs.forEach(o => cv.remove(o)); cv.discardActiveObject(); cv.requestRenderAll(); }
  $('#dsDel').addEventListener('click', delSel);
  $('#dsUndo').addEventListener('click', doUndo);
  $('#dsRedo').addEventListener('click', doRedo);
  $('#dsClear').addEventListener('click', () => $('#dsClearConfirm').hidden = false);
  $('#dsClearNo').addEventListener('click', () => $('#dsClearConfirm').hidden = true);
  $('#dsClearYes').addEventListener('click', () => { cv.clear(); cv.setBackgroundColor('#ffffff', () => { syncBg(); cv.requestRenderAll(); record(); }); $('#dsClearConfirm').hidden = true; });
  document.addEventListener('keydown', e => {
    if ($('.view[data-view="design"]').hidden) return;
    const o = act();
    if (o && o.isEditing) return; // בזמן עריכת טקסט, המקלדת שייכת לטקסט
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && o) { e.preventDefault(); delSel(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
  });

  // ---------- הורדה ושימוש כתמונת פרס ----------
  function exportPng() {
    cv.discardActiveObject(); cv.requestRenderAll();
    try { return cv.toDataURL({ format: 'png', multiplier: SIZE / cv.getWidth() }); }
    catch { toast('אחת התמונות לא מאפשרת שמירה. תמחק אותה ונסה שוב'); return null; }
  }
  $('#dsDownload').addEventListener('click', () => {
    const url = exportPng(); if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = 'LiveLoot-design.png'; document.body.appendChild(a); a.click(); a.remove();
    toast('התמונה ירדה (LiveLoot-design.png)');
  });
  function renderPrizeSel() {
    const list = typeof prizes !== 'undefined' ? prizes : [];
    $('#dsPrizeSel').innerHTML = list.length ? list.map((p, i) => `<option value="${i}">${lvEsc(String(p.text || '').trim() || 'פרס ' + (i + 1))}</option>`).join('') : '<option value="">אין פרסים בגלגל</option>';
  }
  socket.on('config', () => setTimeout(renderPrizeSel, 0));
  $('#dsUsePrize').addEventListener('click', async () => {
    const i = Number($('#dsPrizeSel').value);
    if (!prizes[i]) return toast('קודם תוסיף פרס בטאב "גלגל מזל"');
    const url = exportPng(); if (!url) return;
    try {
      const blob = await (await fetch(url)).blob();
      const r = await fetch('/api/wheel-image', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
      const j = await r.json();
      if (!r.ok) return toast(j.error || 'השמירה נכשלה');
      prizes[i].image = j.url; renderPrizes(); saveWheel();
      toast(`העיצוב נכנס לפרס "${String(prizes[i].text || '').trim() || 'פרס ' + (i + 1)}"`);
    } catch { toast('השמירה נכשלה'); }
  });

  // ---------- התחלה ----------
  let saved = null; try { saved = localStorage.getItem('ll_design'); } catch {}
  if (saved) { restore(saved); undo = [saved]; }
  else {
    useFont('Rubik|900').then(f => {
      const t = new fabric.IText('LiveLoot', { left: SIZE / 2, top: SIZE / 2, originX: 'center', originY: 'center', fontSize: 150, fill: '#7C4DFF', stroke: '#200A3A', strokeWidth: 12, paintFirst: 'stroke', ...f, dsKind: 'text' });
      cv.add(t); cv.requestRenderAll(); undo = [snapshot()];
    });
  }
  fit(); syncBg(); onSelect();
  // הטאב מוסתר בהתחלה, אז מתאימים גודל כשנכנסים אליו
  document.querySelectorAll('.nav-item[data-view="design"]').forEach(b => b.addEventListener('click', () => setTimeout(fit, 30)));
})();
