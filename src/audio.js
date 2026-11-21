// Tiny procedural sound kit (Web Audio). No files to download; everything is synthesised.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('goop-fishing-muted') === '1'; } catch { /* storage unavailable */ }
    this.ambient = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('goop-fishing-muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  get ready() { return this.ctx && this.ctx.state === 'running'; }

  noiseBurst({ dur = 0.4, type = 'lowpass', f0 = 1200, f1 = 300, q = 1, gain = 0.5, attack = 0.005 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const filt = this.ctx.createBiquadFilter(); filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t); filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  tone({ f0 = 440, f1 = f0, dur = 0.2, type = 'sine', gain = 0.25, delay = 0 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }

  cast() { this.noiseBurst({ dur: 0.55, type: 'bandpass', f0: 600, f1: 3200, q: 2, gain: 0.35, attack: 0.08 }); }
  splash(big = false) {
    this.noiseBurst({ dur: big ? 0.9 : 0.45, f0: big ? 2600 : 1800, f1: 200, gain: big ? 0.7 : 0.4 });
    this.tone({ f0: big ? 300 : 500, f1: 90, dur: 0.18, gain: 0.12 });
  }
  bite() { this.tone({ f0: 880, f1: 1320, dur: 0.12, type: 'triangle', gain: 0.3 }); this.tone({ f0: 1320, f1: 1760, dur: 0.14, type: 'triangle', gain: 0.25, delay: 0.1 }); }
  hook() { this.tone({ f0: 180, f1: 80, dur: 0.25, type: 'square', gain: 0.12 }); this.splash(); }
  click(tension = 0.5) { this.tone({ f0: 1800 + tension * 900, f1: 1200, dur: 0.025, type: 'square', gain: 0.05 }); }
  strain() { this.tone({ f0: 220, f1: 200, dur: 0.12, type: 'sawtooth', gain: 0.04 }); }
  snap() { this.noiseBurst({ dur: 0.25, type: 'highpass', f0: 4000, f1: 1500, gain: 0.6, attack: 0.001 }); this.tone({ f0: 600, f1: 70, dur: 0.4, type: 'sawtooth', gain: 0.15 }); }
  catch(rarity, shiny = false) {
    const notes = { Common: [523, 659, 784], Uncommon: [523, 659, 784, 1047], Rare: [587, 740, 880, 1175], Epic: [523, 659, 784, 1047, 1319, 1568], Legendary: [392, 523, 659, 784, 1047, 1319, 1568, 2093] }[rarity] || [523, 659, 784];
    notes.forEach((f, i) => { this.tone({ f0: f, dur: 0.35, type: 'triangle', gain: 0.2, delay: i * 0.09 }); this.tone({ f0: f * 2, dur: 0.25, type: 'sine', gain: 0.06, delay: i * 0.09 }); });
    if (shiny) [1568, 2093, 2637, 3136].forEach((f, i) => this.tone({ f0: f, dur: 0.3, type: 'sine', gain: 0.1, delay: 0.5 + i * 0.07 }));
  }
  step() { this.noiseBurst({ dur: 0.09, type: 'lowpass', f0: 900 + Math.random() * 500, f1: 200, gain: 0.08, attack: 0.004 }); }
  discover() { [659, 784, 988, 1319].forEach((f, i) => this.tone({ f0: f, dur: 0.4, type: 'triangle', gain: 0.16, delay: i * 0.12 })); }
  note() { this.tone({ f0: 1047, f1: 1568, dur: 0.18, type: 'sine', gain: 0.18 }); this.tone({ f0: 1568, f1: 2093, dur: 0.25, type: 'sine', gain: 0.12, delay: 0.12 }); this.noiseBurst({ dur: 0.3, type: 'highpass', f0: 3000, f1: 6000, gain: 0.06 }); }
  bump() { this.tone({ f0: 160, f1: 90, dur: 0.18, type: 'triangle', gain: 0.18 }); }
  coin() { this.tone({ f0: 988, dur: 0.08, type: 'square', gain: 0.08 }); this.tone({ f0: 1319, dur: 0.18, type: 'square', gain: 0.08, delay: 0.07 }); }
  thunder() { this.noiseBurst({ dur: 2.2, f0: 500, f1: 40, gain: 0.8, attack: 0.02 }); }

  /** Looping ambience: crickets at night, rain hiss in bad weather. */
  setAmbience({ night, rain }) {
    if (!this.ready) return;
    const key = `${night}|${rain}`;
    if (this.ambientKey === key) return;
    this.ambientKey = key;
    if (this.ambient) { const old = this.ambient; old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); setTimeout(() => old.nodes.forEach((n) => n.stop?.()), 2000); }
    const gain = this.ctx.createGain(); gain.gain.value = 0; gain.connect(this.master);
    const nodes = [];
    if (rain) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = rain === 'storm' ? 1400 : 2400;
      const g = this.ctx.createGain(); g.gain.value = rain === 'storm' ? 0.22 : 0.12;
      src.connect(f).connect(g).connect(gain); src.start(); nodes.push(src);
    }
    if (night) {
      // crickets: a fast-gated high tone
      const o = this.ctx.createOscillator(); o.frequency.value = 4400;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 28;
      const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 0.5;
      const amp = this.ctx.createGain(); amp.gain.value = 0.5;
      const slow = this.ctx.createOscillator(); slow.frequency.value = 0.7;
      const slowGain = this.ctx.createGain(); slowGain.gain.value = 0.5;
      const amp2 = this.ctx.createGain(); amp2.gain.value = 0.5;
      lfo.connect(lfoGain).connect(amp.gain);
      slow.connect(slowGain).connect(amp2.gain);
      const out = this.ctx.createGain(); out.gain.value = 0.012;
      o.connect(amp).connect(amp2).connect(out).connect(gain);
      [o, lfo, slow].forEach((n) => n.start()); nodes.push(o, lfo, slow);
    }
    gain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.8);
    this.ambient = { gain, nodes };
  }
}
