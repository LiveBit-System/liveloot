// אפקטים על המסך: הצופה נזרק (ספלאט), מטאור, וקולות מצחיקים
function EffectsView(root, opts = {}) {
  const layer = document.createElement('div');
  layer.className = 'lv lv-fx';
  root.appendChild(layer);
  const canvas = document.createElement('canvas');
  canvas.className = 'lv-fx-canvas';
  layer.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0;
  function resize() {
    W = layer.clientWidth || 1920; H = layer.clientHeight || 1080;
    canvas.width = W; canvas.height = H;
  }
  resize();
  new ResizeObserver(resize).observe(layer);

  // ---------- אודיו ----------
  let actx = null;
  const audio = () => actx || (actx = new (window.AudioContext || window.webkitAudioContext)());
  // כל הסאונד עובר דרך "bus" אחד: ככה עוצמה אחת לכולם, ו"נקה מסך" משתיק הכול בבת אחת
  let bus = null, volume = .8;
  function out() {
    const a = audio();
    if (!bus) { bus = a.createGain(); bus.gain.value = volume; bus.connect(a.destination); }
    return bus;
  }
  // טיימרים שמתבטלים כשמנקים את המסך
  let gen = 0;
  const later = (fn, ms) => { const g = gen; setTimeout(() => { if (g === gen) fn(); }, ms); };
  function noise(a, dur) {
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; return src;
  }
  function env(a, node, t0, peak, attack, release) {
    node.gain.setValueAtTime(0, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + attack);
    node.gain.exponentialRampToValueAtTime(.001, t0 + attack + release);
  }
  const SFX = {
    whoosh(delay = 0) {
      const a = audio(), t = a.currentTime + delay, n = noise(a, .5), f = a.createBiquadFilter(), g = a.createGain();
      f.type = 'bandpass'; f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3000, t + .4);
      env(a, g, t, .5, .25, .25);
      n.connect(f).connect(g).connect(out()); n.start(t); n.stop(t + .55);
    },
    splat(delay = 0) {
      const a = audio(), t = a.currentTime + delay;
      const n = noise(a, .35), f = a.createBiquadFilter(), g = a.createGain();
      f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(200, t + .3);
      env(a, g, t, .9, .005, .3);
      n.connect(f).connect(g).connect(out()); n.start(t); n.stop(t + .4);
      const o = a.createOscillator(), og = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(55, t + .25);
      env(a, og, t, .6, .005, .28);
      o.connect(og).connect(out()); o.start(t); o.stop(t + .35);
    },
    rumble(dur) {
      const a = audio(), t = a.currentTime, n = noise(a, dur + .2), f = a.createBiquadFilter(), g = a.createGain();
      f.type = 'lowpass'; f.frequency.setValueAtTime(150, t); f.frequency.linearRampToValueAtTime(900, t + dur);
      g.gain.setValueAtTime(.05, t); g.gain.linearRampToValueAtTime(.7, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + .1);
      n.connect(f).connect(g).connect(out()); n.start(t); n.stop(t + dur + .2);
    },
    boom(delay = 0) {
      const a = audio(), t = a.currentTime + delay;
      const o = a.createOscillator(), og = a.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.4);
      env(a, og, t, 1, .01, 1.6);
      o.connect(og).connect(out()); o.start(t); o.stop(t + 1.8);
      const n = noise(a, 2), f = a.createBiquadFilter(), g = a.createGain();
      f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.8);
      env(a, g, t, .9, .01, 1.9);
      n.connect(f).connect(g).connect(out()); n.start(t); n.stop(t + 2);
    }
  };
  const play = (name, ...args) => { if (!opts.muted) try { SFX[name](...args); } catch {} };

  // ---------- קולות מצחיקים ----------
  // הטקסט מוקרא בשרת (Edge TTS בעברית), וכאן משנים אותו: מהירות/גובה, רובוט, הד
  const VOICES = {
    male:     { voice: 'avri', rate: 1 },
    female:   { voice: 'hila', rate: 1 },
    chipmunk: { voice: 'avri', rate: 1.65 },
    giant:    { voice: 'avri', rate: .68 },
    robot:    { voice: 'hila', rate: 1, robot: true },
    announcer:{ voice: 'avri', rate: .92, echo: true }
  };
  // תור: קול אחד בכל פעם, כדי ששתי מתנות לא ידברו אחת על השנייה
  const speechQueue = [];
  let speaking = false, currentSrc = null;
  function speak(kind, text) {
    if (!VOICES[kind] || !text || opts.muted || opts.noVoice) return;
    if (speechQueue.length >= 5) speechQueue.shift(); // לא נותנים לתור להתארך בהצפה
    speechQueue.push({ kind, text, g: gen });
    nextSpeech();
  }
  async function nextSpeech() {
    if (speaking || !speechQueue.length) return;
    speaking = true;
    const { kind, text, g } = speechQueue.shift();
    try { if (g === gen) await playVoice(VOICES[kind], text, g); } catch {}
    speaking = false;
    setTimeout(nextSpeech, 250);
  }
  async function playVoice(v, text, g) {
    const a = audio();
    const res = await fetch(`${opts.ttsBase || ''}/api/tts?voice=${v.voice}&text=${encodeURIComponent(text)}`);
    if (!res.ok || g !== gen) return;
    const buf = await a.decodeAudioData(await res.arrayBuffer());
    if (g !== gen) return;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = v.rate; // משנה גם את גובה הקול, כמו צ'יפמאנק
    let node = src, lfo = null;
    if (v.robot) {
      const ring = a.createGain(); ring.gain.value = 0;
      lfo = a.createOscillator(); lfo.frequency.value = 55; lfo.connect(ring.gain); lfo.start();
      node.connect(ring); node = ring;
    }
    const master = a.createGain(); master.gain.value = v.robot ? 1.6 : 1.1;
    node.connect(master).connect(out());
    if (v.echo) {
      const d = a.createDelay(); d.delayTime.value = .22;
      const fb = a.createGain(); fb.gain.value = .35;
      master.connect(d); d.connect(fb).connect(d); d.connect(out());
    }
    currentSrc = src;
    await new Promise(resolve => {
      src.onended = () => { lfo?.stop(); resolve(); };
      src.start();
      setTimeout(resolve, buf.duration / v.rate * 1000 + 600); // ביטחון אם onended לא נקרא
    });
    currentSrc = null;
  }

  // ---------- מנוע חלקיקים ----------
  const parts = [];
  let raf = null;
  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= 1 / 60;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.update?.(p);
      p.draw(p);
    }
    raf = parts.length ? requestAnimationFrame(loop) : null;
  }
  const add = p => { parts.push(p); if (!raf) raf = requestAnimationFrame(loop); };

  // ---------- ספלאט: הצופה נזרק על המסך ----------
  const GOO = ['#7CE84A', '#FF4FA3', '#FFB020', '#8E6CFF', '#2FD4C4'];
  function gooPath(r, seed) {
    // כתם עם בליטות + טיפות שנוזלות למטה
    let rnd = seed;
    const R = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;
    const n = 16, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (.78 + R() * .45);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    let d = '';
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      d += i === 0 ? `M${mx},${my}` : '';
      d += ` Q${q[0]},${q[1]} ${(q[0] + pts[(i + 2) % n][0]) / 2},${(q[1] + pts[(i + 2) % n][1]) / 2}`;
    }
    const drips = Array.from({ length: 4 }, () => ({ x: (R() - .5) * r * 1.3, w: 16 + R() * 18, h: 50 + R() * 120 }));
    return { d: d + 'Z', drips };
  }
  function initials(name) {
    const clean = String(name || '?').replace(/[^\p{L}\p{N}]/gu, '');
    return (clean[0] || '?').toUpperCase();
  }
  function splat(e) {
    const size = Math.round(Math.min(W, H) * .17);
    const x = W * (.2 + Math.random() * .6), y = H * (.18 + Math.random() * .42);
    const color = GOO[Math.floor(Math.random() * GOO.length)];
    const fromLeft = Math.random() < .5;
    const g = gooPath(size * .95, Math.floor(Math.random() * 99999));
    const el = document.createElement('div');
    el.className = 'lv-splat';
    el.style.cssText = `left:${x}px;top:${y}px;--s:${size}px;--goo:${color};--fx:${fromLeft ? -W * .7 : W * .7}px;--fy:${-H * .5}px;--rot:${(Math.random() * 40 - 20).toFixed(1)}deg`;
    const face = e.avatar
      ? `<img src="${lvEsc(e.avatar)}" alt="">`
      : `<span class="lv-splat-initial">${lvEsc(initials(e.name))}</span>`;
    el.innerHTML = `
      <svg class="lv-goo" viewBox="${-size * 1.6} ${-size * 1.6} ${size * 3.2} ${size * 3.6}" width="${size * 3.2}" height="${size * 3.6}">
        <path d="${g.d}" fill="var(--goo)"/>
        ${g.drips.map((d, i) => `<rect class="lv-drip" style="animation-delay:${.5 + i * .25}s" x="${d.x - d.w / 2}" y="${size * .3}" width="${d.w}" height="${d.h}" rx="${d.w / 2}" fill="var(--goo)"/>`).join('')}
      </svg>
      <div class="lv-splat-face">${face}</div>
      <div class="lv-splat-name" dir="auto">${lvEsc(e.name)}</div>`;
    layer.appendChild(el);
    play('whoosh');
    play('splat', .42);
    later(() => el.classList.add('slide'), 1400);
    setTimeout(() => el.remove(), 7200);
  }

  // ---------- מטאור ----------
  function meteor(e) {
    const dur = 1.1;
    const tx = W * (.3 + Math.random() * .4), ty = H * (.6 + Math.random() * .2);
    const sx = W + 150, sy = -150;
    const start = performance.now();
    play('rumble', dur);
    // ראש המטאור + שובל אש
    const ang = Math.atan2(ty - sy, tx - sx);
    add({
      life: dur, update(p) {
        const t = Math.min(1, (performance.now() - start) / (dur * 1000));
        const k = t * t;
        p.x = sx + (tx - sx) * k; p.y = sy + (ty - sy) * k;
        for (let i = 0; i < 5; i++) add(ember(p.x + (Math.random() - .5) * 26, p.y + (Math.random() - .5) * 26, 1, .9));
        if (Math.random() < .6) add(smoke(p.x - Math.cos(ang) * 40, p.y - Math.sin(ang) * 40, 50, 1.3, .22));
      },
      draw(p) {
        const r = Math.min(W, H) * .04;
        const len = r * 9;
        const bx = p.x - Math.cos(ang) * len, by = p.y - Math.sin(ang) * len;
        // שובל: משולש מתחדד עם מעבר מאדום שקוף לצהוב
        const lg = ctx.createLinearGradient(bx, by, p.x, p.y);
        lg.addColorStop(0, 'rgba(255,60,0,0)');
        lg.addColorStop(.6, 'rgba(255,120,20,.75)');
        lg.addColorStop(1, 'rgba(255,230,140,1)');
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(p.x + nx * r * 1.1, p.y + ny * r * 1.1);
        ctx.lineTo(p.x - nx * r * 1.1, p.y - ny * r * 1.1);
        ctx.closePath(); ctx.fill();
        // ראש בוער
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
        gr.addColorStop(0, 'rgba(255,255,245,1)');
        gr.addColorStop(.3, 'rgba(255,220,110,1)');
        gr.addColorStop(.6, 'rgba(255,120,30,.7)');
        gr.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.2, 0, 7); ctx.fill();
      }
    });
    later(() => impact(tx, ty, e), dur * 1000);
  }
  function ember(x, y, life, speed) {
    const a = Math.random() * Math.PI * 2, v = (Math.random() * 4 + 1) * speed;
    return {
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life, max: life, r: Math.random() * 4 + 2,
      update(p) { p.x += p.vx; p.y += p.vy; p.vy += .12; },
      draw(p) {
        const k = p.life / p.max;
        ctx.fillStyle = `rgba(255,${Math.round(120 + 120 * k)},40,${k})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k + .5, 0, 7); ctx.fill();
      }
    };
  }
  function smoke(x, y, r, life, alpha) {
    return {
      x, y, r, life, max: life, vx: (Math.random() - .5) * 1.2, vy: -Math.random() * 1.2 - .3,
      update(p) { p.x += p.vx; p.y += p.vy; p.r += 1.1; },
      draw(p) {
        // עשן רך בלי קצוות חדים
        const k = p.life / p.max;
        const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, `rgba(66,60,56,${alpha * k})`);
        gr.addColorStop(1, 'rgba(66,60,56,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
      }
    };
  }
  function impact(x, y, e) {
    play('boom');
    const s = Math.min(W, H);
    // הבזק
    add({ life: .35, max: .35, draw(p) { ctx.fillStyle = `rgba(255,236,200,${.55 * p.life / p.max})`; ctx.fillRect(0, 0, W, H); } });
    // מכתש חרוך
    add({
      life: 5, max: 5, draw(p) {
        const k = Math.min(1, p.life / 1.5);
        ctx.save(); ctx.translate(x, y); ctx.scale(1, .38);
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, s * .16);
        gr.addColorStop(0, `rgba(255,140,40,${.9 * k})`);
        gr.addColorStop(.35, `rgba(60,30,20,${.85 * k})`);
        gr.addColorStop(1, 'rgba(30,20,15,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, s * .16, 0, 7); ctx.fill(); ctx.restore();
      }
    });
    // גל הדף
    add({
      life: .6, max: .6, draw(p) {
        const t = 1 - p.life / p.max;
        ctx.strokeStyle = `rgba(255,220,160,${1 - t})`; ctx.lineWidth = 10 * (1 - t) + 1;
        ctx.save(); ctx.translate(x, y); ctx.scale(1, .45);
        ctx.beginPath(); ctx.arc(0, 0, s * .05 + t * s * .45, 0, 7); ctx.stroke(); ctx.restore();
      }
    });
    // רסיסים, גצים ועשן
    for (let i = 0; i < 46; i++) add(ember(x, y, 1 + Math.random(), 2.4));
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * Math.random(), v = Math.random() * 11 + 4;
      add({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.6, max: 1.6, r: Math.random() * 9 + 5, rot: Math.random() * 6,
        update(p) { p.x += p.vx; p.y += p.vy; p.vy += .45; p.rot += .2; },
        draw(p) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(52,40,34,${p.life / p.max})`; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .8); ctx.restore();
        }
      });
    }
    for (let i = 0; i < 16; i++) add(smoke(x + (Math.random() - .5) * s * .25, y - Math.random() * 40, 50 + Math.random() * 60, 2.6 + Math.random(), .55));
    // כיתוב ליד המכתש
    if (e.caption) {
      const el = document.createElement('div');
      el.className = 'lv-meteor-cap';
      el.style.cssText = `left:${x}px;top:${y - s * .2}px`;
      el.innerHTML = `${e.giftImage ? `<img src="${lvEsc(e.giftImage)}" alt="">` : ''}<span dir="auto">${lvEsc(e.caption)}</span>`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 4200);
    }
  }

  // ---------- שואב אבק קוסמי ----------
  // מערבולת נפתחת, שואבת את הצופה בסחרור, בולעת אותו ואז יורקת אותו החוצה
  function vacuum(e) {
    const s = Math.min(W, H);
    const cx = W * (.3 + Math.random() * .4), cy = H * (.32 + Math.random() * .22);
    const R = s * .2;
    const T = { grow: 500, appear: 300, pull: 2000, spit: 2700, end: 4800 };
    const t0 = performance.now();
    const g = gen;
    const cols = ['180,140,255', '111,227,255', '255,120,220'];

    // המערבולת
    add({
      life: T.end / 1000, draw() {
        const t = performance.now() - t0;
        let k = t < T.grow ? 1 - Math.pow(1 - t / T.grow, 3) : t > T.end - 600 ? Math.max(0, (T.end - t) / 600) : 1;
        if (t > T.pull && t < T.spit) k *= 1 + .28 * Math.sin((t - T.pull) / (T.spit - T.pull) * Math.PI); // בליעה
        const r = R * k;
        if (r < 1) return;
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.25);
        gr.addColorStop(0, 'rgba(8,0,20,1)');
        gr.addColorStop(.35, 'rgba(40,10,90,.95)');
        gr.addColorStop(.7, 'rgba(110,60,230,.55)');
        gr.addColorStop(1, 'rgba(110,60,230,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, r * 1.25, 0, 7); ctx.fill();
        const rot = -t * .007;
        ctx.save(); ctx.translate(cx, cy); ctx.lineCap = 'round';
        for (let arm = 0; arm < 5; arm++) {
          ctx.strokeStyle = `rgba(${cols[arm % 3]},.85)`;
          ctx.lineWidth = Math.max(2, r * .05);
          ctx.beginPath();
          for (let j = 0; j <= 46; j++) {
            const f = j / 46, a = rot + arm * Math.PI * 2 / 5 + f * 3.2, rr = r * (1.15 - f);
            const x = Math.cos(a) * rr, y = Math.sin(a) * rr * .92;
            j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    });
    // חלקיקים שנשאבים פנימה
    const suck = () => {
      if (g !== gen) return;
      const t = performance.now() - t0;
      if (t > T.pull + 200) return;
      for (let i = 0; i < 3; i++) {
        const a0 = Math.random() * 7, r0 = R * (1.4 + Math.random() * .8);
        add({
          a: a0, r: r0, life: 1.2, max: 1.2, c: cols[i % 3],
          update(p) { p.r *= .955; p.a -= .09; if (p.r < 6) p.life = 0; },
          draw(p) {
            const x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r * .92;
            ctx.fillStyle = `rgba(${p.c},${Math.min(1, p.r / R)})`;
            ctx.beginPath(); ctx.arc(x, y, 3 + p.r / R * 4, 0, 7); ctx.fill();
          }
        });
      }
      setTimeout(suck, 40);
    };
    suck();

    // הצופה
    const el = document.createElement('div');
    el.className = 'lv-vac';
    const size = Math.round(s * .14);
    el.style.cssText = `--s:${size}px`;
    el.innerHTML = `<div class="lv-vac-face">${e.avatar ? `<img src="${lvEsc(e.avatar)}" alt="">` : `<span class="lv-splat-initial">${lvEsc(initials(e.name))}</span>`}</div>
      <div class="lv-vac-name" dir="auto">${lvEsc(e.name)}</div>`;
    layer.appendChild(el);
    const a0 = Math.random() * 7, r0 = R * 2.3;
    const dir = Math.random() < .5 ? -1 : 1;
    let spit = null;
    const frame = () => {
      if (g !== gen) { el.remove(); return; }
      const t = performance.now() - t0;
      let x, y, tf, op = 1;
      if (t < T.appear) { op = 0; x = cx + Math.cos(a0) * r0; y = cy + Math.sin(a0) * r0; tf = 'scale(0)'; }
      else if (t < T.grow) {
        const u = (t - T.appear) / (T.grow - T.appear);
        x = cx + Math.cos(a0) * r0; y = cy + Math.sin(a0) * r0;
        tf = `scale(${1 - Math.pow(1 - u, 3)})`;
      } else if (t < T.pull) {
        const u = (t - T.grow) / (T.pull - T.grow), ez = u * u;
        const r = r0 * (1 - ez), a = a0 - ez * Math.PI * 3.2;
        x = cx + Math.cos(a) * r; y = cy + Math.sin(a) * r * .92;
        const sc = 1 - .85 * ez, st = 1 + 1.5 * ez; // נמתח לכיוון המרכז ומתכווץ
        tf = `rotate(${a}rad) scale(${st * sc}, ${sc / Math.sqrt(st)})`;
        el.classList.add('pulling');
      } else if (t < T.spit) { op = 0; x = cx; y = cy; tf = 'scale(0)'; }
      else {
        if (!spit) {
          spit = { x: cx, y: cy, vx: dir * s * (.009 + Math.random() * .006), vy: -s * .03, rot: 0, last: performance.now() };
          el.classList.remove('pulling'); el.classList.add('spat');
          burst(cx, cy);
        }
        const now = performance.now(), dt = Math.min(3, (now - spit.last) / 16.7); spit.last = now;
        spit.vy += s * .0011 * dt; spit.x += spit.vx * dt; spit.y += spit.vy * dt; spit.rot += dir * 14 * dt;
        x = spit.x; y = spit.y;
        const grow = Math.min(1, (t - T.spit) / 260);
        tf = `rotate(${spit.rot}deg) scale(${.2 + 1.05 * grow})`;
        if (y > H + size * 2 || t > T.end + 1500) { el.remove(); return; }
      }
      el.style.opacity = op;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) ${tf}`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    function burst(x, y) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * 7, v = Math.random() * 9 + 3;
        add({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, max: 1, c: cols[i % 3], r: Math.random() * 6 + 3,
          update(p) { p.x += p.vx; p.y += p.vy; p.vy += .25; p.vx *= .98; },
          draw(p) { ctx.fillStyle = `rgba(${p.c},${p.life / p.max})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
        });
      }
    }
    // סאונד: שאיבה שעולה, בליעה, יריקה
    if (!opts.muted) {
      try {
        const a = audio(), t = a.currentTime;
        const dur = (T.pull - T.grow) / 1000 + .5;
        const n = noise(a, dur), f = a.createBiquadFilter(), gn = a.createGain();
        f.type = 'bandpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur);
        gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(.55, t + dur - .1); gn.gain.linearRampToValueAtTime(0, t + dur);
        n.connect(f).connect(gn).connect(out()); n.start(t); n.stop(t + dur);
        const o = a.createOscillator(), og = a.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(700, t + dur);
        og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(.08, t + dur - .1); og.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(og).connect(out()); o.start(t); o.stop(t + dur);
        // גלאמפ
        const tg = t + T.pull / 1000, gl = a.createOscillator(), gg = a.createGain();
        gl.type = 'sine'; gl.frequency.setValueAtTime(200, tg); gl.frequency.exponentialRampToValueAtTime(55, tg + .3);
        env(a, gg, tg, .9, .01, .35); gl.connect(gg).connect(out()); gl.start(tg); gl.stop(tg + .4);
        // פּטוּ! ובוינג
        const ts = t + T.spit / 1000, sp = a.createOscillator(), sg = a.createGain();
        sp.type = 'square'; sp.frequency.setValueAtTime(1100, ts); sp.frequency.exponentialRampToValueAtTime(180, ts + .12);
        env(a, sg, ts, .35, .003, .14); sp.connect(sg).connect(out()); sp.start(ts); sp.stop(ts + .2);
        const bo = a.createOscillator(), bg = a.createGain(), vib = a.createOscillator(), vg = a.createGain();
        bo.type = 'triangle'; bo.frequency.setValueAtTime(260, ts + .05); bo.frequency.exponentialRampToValueAtTime(620, ts + .5);
        vib.frequency.value = 18; vg.gain.value = 40; vib.connect(vg).connect(bo.frequency);
        env(a, bg, ts + .05, .3, .01, .55); bo.connect(bg).connect(out()); bo.start(ts + .05); vib.start(ts + .05); bo.stop(ts + .65); vib.stop(ts + .65);
      } catch {}
    }
  }

  return {
    fire(e) {
      if (opts.unlockAudio) audio();
      if (e.effect === 'splat') splat(e);
      if (e.effect === 'meteor') reduced ? impact(W / 2, H * .7, e) : meteor(e);
      if (e.effect === 'vacuum') vacuum(e);
      const delay = { splat: 400, meteor: 1300, vacuum: 2800 }[e.effect] ?? 300;
      if (e.voice && e.voice !== 'none') later(() => speak(e.voice, e.voiceText), delay);
    },
    // עוצר הכול מיד: אפקטים, חלקיקים, קולות וסאונד
    clear() {
      gen++;
      speechQueue.length = 0;
      try { currentSrc?.stop(); } catch {}
      if (bus) { try { bus.disconnect(); } catch {} bus = null; }
      parts.length = 0;
      ctx.clearRect(0, 0, W, H);
      layer.querySelectorAll(':scope > :not(canvas)').forEach(n => n.remove());
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) / 100));
      if (bus) bus.gain.value = volume;
    },
    speak
  };
}
