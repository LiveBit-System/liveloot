// סאונדים: מובנים (בלי קבצים) או קבצים מתיקיית sounds
const Sound = (() => {
  let ctx = null;
  function audio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function tone(freq, start, dur, type = 'triangle', vol = .25) {
    const a = audio();
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, a.currentTime + start);
    g.gain.linearRampToValueAtTime(vol, a.currentTime + start + .01);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + start + dur);
    o.connect(g).connect(a.destination);
    o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + .05);
  }
  const BUILTIN = {
    pop: () => { tone(520, 0, .12, 'sine', .35); tone(880, .06, .14, 'sine', .25); },
    coin: () => { tone(988, 0, .1, 'square', .12); tone(1319, .09, .35, 'square', .12); },
    fanfare: () => { [523, 659, 784].forEach((f, i) => tone(f, i * .12, .25, 'sawtooth', .12)); tone(1047, .36, .8, 'sawtooth', .14); }
  };
  return {
    play(sound) {
      if (!sound || sound === 'none') return;
      try {
        if (sound.startsWith('builtin:')) return BUILTIN[sound.slice(8)]?.();
        const el = new Audio('/sounds/' + encodeURIComponent(sound));
        el.volume = .9;
        el.play().catch(() => {});
      } catch {}
    }
  };
})();
