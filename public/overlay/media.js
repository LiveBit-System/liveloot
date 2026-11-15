// פעולות עם קבצים: סאונד, וידאו ותמונה/GIF שהעלית. כל פעולה עם תמונה או וידאו מחכה בתור לקודמת
function MediaView(root, opts = {}) {
  const layer = document.createElement('div');
  layer.className = 'lv lv-media-layer';
  root.appendChild(layer);
  const queue = [];
  let busy = false, gen = 0, volume = .8;
  const playing = new Set();

  function playSound(url, vol) {
    if (opts.muted || !url) return null;
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, volume * vol));
    playing.add(a);
    a.addEventListener('ended', () => playing.delete(a));
    a.play().catch(() => playing.delete(a));
    return a;
  }

  function show(item) {
    busy = true;
    const g = gen;
    const vol = Number(item.volume ?? 100) / 100;
    const box = document.createElement('div');
    box.className = 'lv-mx';
    let media = '';
    if (item.video) media = `<video class="lv-mx-video" src="${lvEsc(item.video)}" autoplay playsinline ${opts.muted ? 'muted' : ''}></video>`;
    else if (item.image) media = `<img class="lv-mx-img" src="${lvEsc(item.image)}" alt="">`;
    box.innerHTML = media + (item.caption ? `<div class="lv-mx-cap" dir="auto">${lvEsc(item.caption)}</div>` : '');
    layer.appendChild(box);
    if (item.sound) playSound(item.sound, vol);

    let done = false;
    const finish = () => {
      if (done) return; done = true;
      box.classList.add('out');
      setTimeout(() => { box.remove(); if (g !== gen) return; busy = false; next(); }, 350);
    };
    const video = box.querySelector('video');
    if (video) {
      video.volume = Math.max(0, Math.min(1, volume * vol));
      playing.add(video);
      // וידאו מתנגן עד הסוף (עד דקה), אלא אם הגדרת זמן ארוך יותר
      video.addEventListener('ended', () => setTimeout(() => g === gen && finish(), 150));
      video.addEventListener('error', () => g === gen && finish());
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
      setTimeout(() => g === gen && finish(), Math.max(60, Number(item.duration) || 0) * 1000);
    } else {
      setTimeout(() => g === gen && finish(), Math.max(1, Number(item.duration) || 5) * 1000);
    }
  }
  function next() {
    if (busy || !queue.length) return;
    show(queue.shift());
  }

  return {
    play(item) {
      if (item.video || item.image || item.caption) { queue.push(item); next(); }
      else if (item.sound) playSound(item.sound, Number(item.volume ?? 100) / 100);
    },
    clear() {
      gen++; queue.length = 0; busy = false;
      playing.forEach(m => { try { m.pause(); } catch {} });
      playing.clear();
      layer.replaceChildren();
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) / 100));
      playing.forEach(m => { try { m.volume = volume; } catch {} });
    }
  };
}
