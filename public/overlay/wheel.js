// גלגל מזל בסגנון קופסת הפתעה: קופסה צבעונית מתפוצצת, ואז רצועת קלפים רצה ונעצרת על הפרס שהשרת בחר
function WheelView(root, opts = {}) {
  const el = document.createElement('div');
  el.className = 'lv lv-cw';
  el.innerHTML = `
    <div class="lv-cw-who"></div>
    <div class="lv-cw-rays"></div>
    <div class="lv-cw-reel">
      <div class="lv-cw-band"><div class="lv-cw-track"></div></div>
      <div class="lv-cw-title">גלגל המזל</div>
      <svg class="lv-cw-pointer" viewBox="0 0 56 50" aria-hidden="true">
        <path d="M6 5 H50 L28 44 Z" fill="#FF3E8A" stroke="#200A3A" stroke-width="6" stroke-linejoin="round"/>
        <path d="M14 10 H30 L22 24 Z" fill="#fff" opacity=".45"/>
      </svg>
    </div>
    <div class="lv-cw-box">${BOX_SVG()}</div>
    <div class="lv-cw-flash"></div>
    <div class="lv-cw-result" aria-live="polite"></div>
    <div class="lv-cw-queue"></div>`;
  root.appendChild(el);
  const $ = s => el.querySelector(s);
  const who = $('.lv-cw-who'), box = $('.lv-cw-box'), reel = $('.lv-cw-reel'), track = $('.lv-cw-track'),
    ptr = $('.lv-cw-pointer'), flash = $('.lv-cw-flash'), result = $('.lv-cw-result'), queueEl = $('.lv-cw-queue');

  let settings = { prizes: [] };
  let busy = false, gen = 0, serverPending = 0;
  const queue = [];
  const STEP = 176 + 14, CARD = 176;
  const prizes = () => (settings.prizes || []).filter(p => p && (String(p.text || '').trim() || p.image));

  // ---------- התאמה לגודל החלון ----------
  function fit() {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    el.style.transform = `translate(-50%, -50%) scale(${Math.min(w / 700, h / 700)})`;
  }
  fit();
  try { new ResizeObserver(fit).observe(root); } catch { addEventListener('resize', fit); }

  // ---------- קלפים ----------
  function card(p) {
    const d = document.createElement('div');
    d.className = 'lv-cw-card';
    const c = /^#[\da-f]{6}$/i.test(p.color || '') ? p.color : '#F5C542';
    d.style.setProperty('--c', c);
    d.style.setProperty('--c1', shade(c, .35));
    d.style.setProperty('--c2', shade(c, -.38));
    const t = String(p.text || '').trim();
    if (p.image) {
      d.classList.add('has-img');
      d.innerHTML = `<img src="${lvEsc(p.image)}" alt="">` + (t ? `<span class="cap">${lvEsc(t)}</span>` : '');
      return d;
    }
    const n = [...t].length;
    d.style.fontSize = (n <= 4 ? 50 : n <= 7 ? 40 : n <= 11 ? 32 : n <= 18 ? 26 : 21) + 'px';
    d.textContent = t;
    return d;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
  }
  function setX(x) { track.style.transform = `translateX(${x}px)`; }
  // מצב מנוחה: הפרסים בשורה מתחת לכותרת
  function idle() {
    const list = prizes();
    track.replaceChildren();
    if (!list.length) return;
    const row = [];
    while (row.length < 9) row.push(...list);
    row.slice(0, 9).forEach(p => track.appendChild(card(p)));
    setX(350 - (4 * STEP + CARD / 2));
  }

  // ---------- סאונד ----------
  let actx = null;
  const A = () => actx || (actx = new (window.AudioContext || window.webkitAudioContext)());
  function beep(freq, dur, type = 'square', vol = .08, when = 0, slide = 0) {
    if (opts.muted || settings.muted) return;
    try {
      const a = A(), t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
    } catch {}
  }
  function boomSound() {
    if (opts.muted || settings.muted) return;
    try {
      const a = A(), len = a.sampleRate * .5, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      const s = a.createBufferSource(), g = a.createGain(); g.gain.value = .5;
      s.buffer = buf; s.connect(g).connect(a.destination); s.start();
    } catch {}
    beep(180, .35, 'sine', .35, 0, 50);
  }

  // ---------- רצף הפתיחה ----------
  const later = (ms, fn, g) => setTimeout(() => { if (g === gen) fn(); }, ms);
  function play(s) {
    const list = s.prizes && s.prizes.length ? s.prizes : prizes();
    if (!list.length || !(s.index >= 0 && s.index < list.length)) { busy = false; next(); return; }
    busy = true;
    const g = gen;
    const dur = Math.max(4000, s.duration || 6000);
    const BOX = 1500, SPIN = dur - BOX;
    el.classList.add('active');
    el.classList.remove('done');
    reel.classList.remove('on');
    const initial = (String(s.name || '?').replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase();
    who.innerHTML = `<span class="av">${s.avatar ? `<img src="${lvEsc(s.avatar)}" alt="">` : lvEsc(initial)}</span>
      <bdi>${lvEsc(s.name || '')}</bdi><small>פותח את הקופסה</small>`;
    who.classList.add('on');

    // 1. הקופסה קופצת, רועדת ומתפוצצת
    box.className = box.classList.contains('idle') ? 'lv-cw-box pulse' : 'lv-cw-box in';
    beep(300, .25, 'sine', .25, 0, 700);
    later(450, () => { box.className = 'lv-cw-box shake'; for (let i = 0; i < 6; i++) beep(140 + i * 25, .06, 'square', .06, i * .11); }, g);
    later(1150, () => {
      box.className = 'lv-cw-box boom';
      boomSound();
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
      shards();
    }, g);
    later(1400, () => { box.className = 'lv-cw-box'; reel.classList.add('on'); }, g);

    // 2. רצועה ארוכה שהפרס הזוכה יושב בה במקום קבוע
    const WIN = 44, total = WIN + 5;
    const weights = list.map(p => Math.max(1, Number(p.chance) || 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    const rnd = () => { let r = Math.random() * sum; for (let i = 0; i < list.length; i++) { r -= weights[i]; if (r < 0) return i; } return 0; };
    track.replaceChildren();
    const cards = [];
    for (let i = 0; i < total; i++) {
      const c = card(list[i === WIN ? s.index : rnd()]);
      track.appendChild(c); cards.push(c);
    }
    const startX = 350 - (2 * STEP + CARD / 2);
    const endX = 350 - (WIN * STEP + CARD / 2) + (Math.random() - .5) * CARD * .7;
    setX(startX);

    later(BOX, () => {
      const t0 = performance.now();
      let lastIdx = -1;
      const frame = now => {
        if (g !== gen) return;
        const u = Math.min(1, (now - t0) / SPIN);
        const e = 1 - Math.pow(1 - u, 4);
        const x = startX + (endX - startX) * e;
        setX(x);
        const idx = Math.floor((350 - x) / STEP);
        if (idx !== lastIdx) {
          if (cards[lastIdx]) cards[lastIdx].classList.remove('hot');
          if (cards[idx]) cards[idx].classList.add('hot');
          lastIdx = idx;
          beep(1500, .035, 'square', .05);
          ptr.classList.remove('bump'); void ptr.getBBox(); ptr.classList.add('bump');
        }
        if (u < 1) requestAnimationFrame(frame);
        else win(s, list[s.index], cards[WIN], g);
      };
      requestAnimationFrame(frame);
    }, g);
  }
  function win(s, prize, c, g) {
    try { opts.onResult && opts.onResult(s); } catch {}
    track.querySelectorAll('.hot').forEach(x => x.classList.remove('hot'));
    const big = !!prize?.big;
    c.classList.add('win');
    el.classList.add('done', big ? 'big' : 'meh');
    who.classList.remove('on');
    const label = String(prize?.text || '').trim() || 'פרס';
    result.innerHTML = (big ? '<em>פרס גדול!</em>' : '') +
      `<b dir="auto">${lvEsc(s.name || '')}</b><span>קיבל: <bdi>${lvEsc(label)}</bdi></span>`;
    if (big) {
      if (!opts.muted && !settings.muted) { Sound.play('builtin:fanfare'); setTimeout(() => Sound.play('builtin:fanfare'), 700); }
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
      confetti(prize?.color, 90);
      later(900, () => confetti(prize?.color, 60), g);
    } else {
      womp();
    }
    later(big ? 5000 : 2800, () => {
      el.classList.remove('done', 'big', 'meh');
      busy = false;
      try { opts.onDone && opts.onDone(s); } catch {}
      if (!queue.length) showIdle();
      next();
    }, g);
  }
  // צליל אכזבה: וואה-וואה-וואה-וואאאה
  function womp() {
    [392, 370, 349].forEach((f, i) => beep(f, .32, 'sawtooth', .09, i * .34, f * .96));
    beep(330, .9, 'sawtooth', .1, 1.02, 250);
  }
  function shards() {
    for (let i = 0; i < 14; i++) {
      const sh = document.createElement('i');
      sh.className = 'lv-cw-shard go';
      sh.style.setProperty('--a', (i / 14 * 360 + Math.random() * 12) + 'deg');
      el.appendChild(sh);
      setTimeout(() => sh.remove(), 700);
    }
  }
  function confetti(color, count = 46) {
    const cols = [color || '#F5C542', '#ffffff', '#F5C542', '#FF6A3D', '#3DD68C', '#A48BFA', '#6FE3FF'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('i');
      p.className = 'lv-confetti';
      p.style.cssText = `--x:${(Math.random() - .5) * 760}px;--y:${-300 - Math.random() * 300}px;--r:${Math.random() * 900}deg;background:${cols[i % cols.length]};animation-delay:${Math.random() * .15}s`;
      el.appendChild(p);
      setTimeout(() => p.remove(), 2300);
    }
  }
  function next() {
    renderQueue();
    if (busy || !queue.length) return;
    play(queue.shift());
    renderQueue();
  }
  function renderQueue() {
    const n = queue.length + serverPending;
    queueEl.textContent = n ? `עוד ${n} בתור` : '';
  }
  function showIdle() {
    if (busy) return;
    idle();
    // במנוחה רואים רק את קופסת סימן השאלה
    reel.classList.remove('on');
    box.className = settings.hideIdle ? 'lv-cw-box' : 'lv-cw-box idle';
    el.classList.toggle('active', !settings.hideIdle);
  }

  return {
    setSettings(s) {
      settings = { ...s };
      el.classList.toggle('hide-idle', !!s.hideIdle);
      showIdle();
    },
    enqueue(s) { serverPending = s.pending || 0; queue.push(s); next(); },
    clear() {
      gen++; queue.length = 0; serverPending = 0; busy = false;
      el.classList.remove('done'); who.classList.remove('on');
      renderQueue(); showIdle();
    }
  };

  function BOX_SVG() {
    // ארגז הפתעה סגול עם פסים, חגורות צהובות וסימן שאלה
    return `<svg viewBox="0 0 360 360" aria-hidden="true">
      <defs>
        <pattern id="cwStripe" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="14" height="28" fill="#fff" opacity=".13"/>
        </pattern>
      </defs>
      <rect x="30" y="58" width="300" height="270" rx="34" fill="#200A3A"/>
      <rect x="30" y="44" width="300" height="270" rx="34" fill="#7C4DFF" stroke="#200A3A" stroke-width="12"/>
      <rect x="30" y="44" width="300" height="270" rx="34" fill="url(#cwStripe)"/>
      <rect x="30" y="44" width="300" height="80" rx="34" fill="#9A72FF" stroke="#200A3A" stroke-width="12"/>
      <rect x="150" y="44" width="60" height="270" fill="#FFD23F" stroke="#200A3A" stroke-width="12"/>
      <rect x="128" y="96" width="104" height="52" rx="12" fill="#FF3E8A" stroke="#200A3A" stroke-width="10"/>
      <circle cx="180" cy="122" r="9" fill="#200A3A"/>
      <circle cx="62" cy="80" r="9" fill="#FFD23F" stroke="#200A3A" stroke-width="5"/>
      <circle cx="298" cy="80" r="9" fill="#FFD23F" stroke="#200A3A" stroke-width="5"/>
      <text x="180" y="290" text-anchor="middle" font-family="Rubik, sans-serif" font-weight="900" font-size="150"
        fill="#fff" stroke="#200A3A" stroke-width="18" stroke-linejoin="round" paint-order="stroke">?</text>
    </svg>`;
  }
}
