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
    fanfare: () => { [523, 659, 784].forEach((f, i) => tone(f, i * .12, .25, 'sawtooth', .12)); tone(1047, .36, .8, 'sawtooth', .14); },
    // PRO: סאונדים מיוחדים לזכייה
    jackpot: () => { for (let i = 0; i < 14; i++) tone(1200 + (i % 4) * 180, i * .06, .12, 'square', .08); [523, 659, 784, 1047].forEach((f, i) => tone(f, .9 + i * .1, .5, 'triangle', .2)); tone(1568, 1.35, 1.1, 'triangle', .18); },
    levelup: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .07, .16, 'square', .1)); tone(1568, .45, .7, 'square', .1); },
    epic: () => { tone(65, 0, 1.2, 'sawtooth', .3); tone(98, 0, 1.2, 'sawtooth', .18); [262, 330, 392, 523].forEach((f, i) => tone(f, .25 + i * .18, .9, 'sawtooth', .1)); tone(784, 1, 1.4, 'triangle', .18); },
    arcade: () => { for (let i = 0; i < 6; i++) { tone(660 + i * 110, i * .09, .08, 'square', .1); tone(880 + i * 110, i * .09 + .045, .08, 'square', .08); } tone(1760, .6, .6, 'square', .09); }
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
