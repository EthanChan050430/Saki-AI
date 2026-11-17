/**
 * Synthesizes a soft, music-box-like calling ringtone and a brief connected
 * confirmation chime using the Web Audio API (no external audio assets needed).
 */
export function startCallRingtone() {
  const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AudioCtx) {
    return { stop: () => {}, playConnected: () => {} };
  }

  let ctx;
  let master;
  let timer = null;
  let stopped = false;

  try {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.9;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    filter.Q.value = 0.7;

    filter.connect(master);
    master.connect(ctx.destination);

    const playTone = (freq, startAt, duration, peakGain = 0.045) => {
      if (!ctx || stopped) return;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);

      // Subtle warm overtone an octave higher
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(freq * 2, startAt);

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.16, startAt);

      env.gain.setValueAtTime(0.0001, startAt);
      env.gain.linearRampToValueAtTime(peakGain, startAt + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

      osc.connect(env);
      sub.connect(subGain);
      subGain.connect(env);
      env.connect(filter);

      osc.start(startAt);
      sub.start(startAt);
      osc.stop(startAt + duration + 0.02);
      sub.stop(startAt + duration + 0.02);
    };

    const playPhrase = () => {
      if (stopped || !ctx || document.hidden) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().then(() => {
          if (!stopped && ctx && ctx.state === 'running') {
            schedulePhrase();
          }
        }).catch(() => {});
        return;
      }
      if (ctx.state !== 'running') return;
      schedulePhrase();
    };

    const schedulePhrase = () => {
      if (stopped || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime + 0.02;
      // Soft do-mi-so-do arpeggio: C5 -> E5 -> G5 -> C6
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, index) => {
        playTone(freq, now + index * 0.14, 0.5, 0.042);
      });
    };

    playPhrase();
    timer = setInterval(playPhrase, 2200);

    const cleanupContext = (delayMs) => {
      const targetCtx = ctx;
      ctx = null;
      setTimeout(() => {
        try {
          if (targetCtx && targetCtx.state !== 'closed') {
            void targetCtx.close().catch(() => {});
          }
        } catch {}
      }, delayMs);
    };

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (ctx && master) {
        try {
          const now = ctx.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setValueAtTime(master.gain.value, now);
          master.gain.linearRampToValueAtTime(0.0001, now + 0.12);
        } catch {}
        cleanupContext(180);
      }
    };

    const playConnected = () => {
      if (stopped) return;
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (!ctx || !master) return;
      try {
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime + 0.01;
        // Brief gentle two-note confirmation: G5 -> C6
        const osc1 = ctx.createOscillator();
        const env1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(783.99, now);
        env1.gain.setValueAtTime(0.0001, now);
        env1.gain.linearRampToValueAtTime(0.045, now + 0.015);
        env1.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        osc1.connect(env1);
        env1.connect(filter);
        osc1.start(now);
        osc1.stop(now + 0.26);

        const osc2 = ctx.createOscillator();
        const env2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1046.5, now + 0.09);
        env2.gain.setValueAtTime(0.0001, now + 0.09);
        env2.gain.linearRampToValueAtTime(0.05, now + 0.11);
        env2.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
        osc2.connect(env2);
        env2.connect(filter);
        osc2.start(now + 0.09);
        osc2.stop(now + 0.45);
      } catch {}
      cleanupContext(520);
    };

    return { stop, playConnected };
  } catch {
    return { stop: () => {}, playConnected: () => {} };
  }
}
