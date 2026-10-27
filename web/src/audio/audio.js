import { clamp, rand } from '../core/rng.js';

/* ============================================================
   AUDIO — fully procedural. No files, no downloads.
   Wind, sub-drone, oboe-like stag calls, bone chimes, whispers,
   heartbeat and a reverb built from noise.
   ============================================================ */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.volume = 0.85;
    this.danger = 0;
    this.stepTimer = 0;
    this.heartTimer = 0;
    this.whisperTimer = 6;
    this.breathTimer = 2;
    this._last = performance.now() / 1000;
  }

  async start() {
    if (this.ctx) {
      try { await this.ctx.resume(); } catch { /* ignore */ }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.35;

    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // reverb send
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.4, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.55;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.dry = ctx.createGain();
    this.dry.gain.value = 1;
    this.dry.connect(this.master);

    this.noiseBuf = this._noise(6);

    this._wind();
    this._drone();
    this.ready = true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.enabled ? v : 0;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  /* ---------------- buffers ---------------- */
  _noise(seconds = 4) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        // pink-ish
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
      }
    }
    return buf;
  }

  _impulse(seconds = 3, decay = 2) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - Math.exp(-i / 400));
      }
    }
    return buf;
  }

  _out(node, wet = 0.4) {
    node.connect(this.dry);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g);
      g.connect(this.reverb);
    }
  }

  /* ---------------- continuous beds ---------------- */
  _wind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.6;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;

    const gain = ctx.createGain();
    gain.gain.value = 0.16;

    // slow gust LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.021;
    const lfo2g = ctx.createGain();
    lfo2g.gain.value = 0.08;
    lfo2.connect(lfo2g);
    lfo2g.connect(gain.gain);

    // stereo motion
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const panLfo = ctx.createOscillator();
    panLfo.frequency.value = 0.033;
    const panGain = ctx.createGain();
    panGain.gain.value = 0.7;
    panLfo.connect(panGain);

    src.connect(hp); hp.connect(lp); lp.connect(gain);
    if (pan) { gain.connect(pan); pan.connect(this.dry); panGain.connect(pan.pan); }
    else gain.connect(this.dry);

    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    gain.connect(wet); wet.connect(this.reverb);

    src.start();
    lfo.start(); lfo2.start(); panLfo.start();
    this.windLP = lp;
    this.windGain = gain;
  }

  _drone() {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.13;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    lp.Q.value = 3;

    const freqs = [38.9, 58.3, 77.8, 116.5]; // D minor-ish, unsettling
    this.droneOscs = [];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sawtooth' : 'sine';
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.13;

      // slow detune drift
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.02 + i * 0.013;
      const lg = ctx.createGain();
      lg.gain.value = 0.4 + i * 0.2;
      lfo.connect(lg); lg.connect(o.detune);
      lfo.start();

      o.connect(g); g.connect(lp);
      o.start();
      this.droneOscs.push(o);
    });

    lp.connect(out);
    this._out(out, 0.5);
    this.droneLP = lp;
    this.droneOut = out;
  }

  /* ---------------- one-shots ---------------- */
  step(intensity = 0.5, surface = 'leaf') {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.5;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = surface === 'leaf' ? 1800 + Math.random() * 900 : 700 + Math.random() * 300;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    const amp = 0.05 + intensity * 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.16 + intensity * 0.12);
    src.connect(bp); bp.connect(g); this._out(g, 0.18);
    src.start(t, Math.random() * 4, 0.3);
  }

  ping() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1180, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.75);
    o.connect(g); this._out(g, 0.8);
    o.start(t); o.stop(t + 0.8);

    // shimmer
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = 2360;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.03, t + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0004, t + 0.4);
    o2.connect(g2); this._out(g2, 1.0);
    o2.start(t + 0.02); o2.stop(t + 0.45);
  }

  chime(step = 0) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const base = [392, 466.2, 523.3, 622.3][step % 4];
    [1, 2.02, 2.98, 4.1].forEach((mult, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * mult * (1 + (Math.random() - 0.5) * 0.004);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.075 / (i + 1), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 2.6 - i * 0.3);
      o.connect(g); this._out(g, 0.9);
      o.start(t); o.stop(t + 2.8);
    });
  }

  heartbeat(intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const beat = (offset, amp) => {
      const t = ctx.currentTime + offset;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(78, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.28);
      o.connect(g); this._out(g, 0.1);
      o.start(t); o.stop(t + 0.3);
    };
    beat(0, 0.16 * intensity);
    beat(0.16, 0.1 * intensity);
  }

  whisper() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = rand(-0.9, 0.9); pan.connect(this.dry); }
    const syllables = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < syllables; i++) {
      const st = t + i * rand(0.13, 0.26);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.playbackRate.value = rand(0.8, 1.4);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(rand(380, 900), st);
      bp.frequency.linearRampToValueAtTime(rand(700, 1800), st + 0.1);
      bp.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.055, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0005, st + rand(0.1, 0.24));
      src.connect(bp); bp.connect(g);
      g.connect(pan || this.dry);
      if (pan) { const w = ctx.createGain(); w.gain.value = 0.4; g.connect(w); w.connect(this.reverb); }
      else this._out(g, 0.4);
      src.start(st, Math.random() * 4, 0.3);
    }
  }

  stagBreath() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.35;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.linearRampToValueAtTime(420, t + 0.5);
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.25);
    g.gain.linearRampToValueAtTime(0.02, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.2);
    src.connect(bp); bp.connect(g); this._out(g, 0.5);
    src.start(t, Math.random() * 3, 1.4);
  }

  stagCrack() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rand(1.2, 2.0);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = rand(1200, 2600); bp.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.18);
    src.connect(bp); bp.connect(g); this._out(g, 0.45);
    src.start(t, Math.random() * 4, 0.25);
  }

  stagCall(distant = true) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = distant ? 64 : 78;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.35, t + 0.5);
    o.frequency.linearRampToValueAtTime(base * 0.9, t + 2.0);

    // formant "hollow tube"
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.linearRampToValueAtTime(740, t + 0.6);
    bp.frequency.linearRampToValueAtTime(260, t + 2.1);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(distant ? 0.10 : 0.2, t + 0.35);
    g.gain.linearRampToValueAtTime(0.05, t + 1.4);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 2.4);

    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain(); vg.gain.value = 9;
    vib.connect(vg); vg.connect(o.detune); vib.start(); vib.stop(t + 2.5);

    o.connect(bp); bp.connect(g); this._out(g, distant ? 1.0 : 0.7);
    o.start(t); o.stop(t + 2.6);
  }

  hit() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // sub impact
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
    o.connect(g); this._out(g, 0.6);
    o.start(t); o.stop(t + 1.2);

    // metal scrape
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 900;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.25, t);
    g2.gain.exponentialRampToValueAtTime(0.0004, t + 0.5);
    src.connect(hp); hp.connect(g2); this._out(g2, 0.9);
    src.start(t, Math.random() * 4, 0.6);
  }

  stinger() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // dissonant cluster rising
    [233.1, 246.9, 349.2, 466.2].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sawtooth' : 'triangle';
      o.frequency.setValueAtTime(f * 0.98, t);
      o.frequency.linearRampToValueAtTime(f, t + 1.6);
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.linearRampToValueAtTime(3200, t + 1.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 2.0);
      o.connect(bp); bp.connect(g); this._out(g, 0.9);
      o.start(t); o.stop(t + 2.1);
    });
    // noise swell
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.linearRampToValueAtTime(4200, t + 1.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0005, t);
    g.gain.linearRampToValueAtTime(0.12, t + 1.6);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 2.2);
    src.connect(bp); bp.connect(g); this._out(g, 1.0);
    src.start(t, 0, 2.4);
  }

  victory() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const chord = [130.8, 196.0, 261.6, 392.0, 523.3];
    chord.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.25);
      g.gain.linearRampToValueAtTime(0.05, t + i * 0.25 + 0.6);
      g.gain.linearRampToValueAtTime(0.0004, t + 6);
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.2 + i * 0.3;
      const vg = ctx.createGain(); vg.gain.value = 4;
      vib.connect(vg); vg.connect(o.detune); vib.start(); vib.stop(t + 6);
      o.connect(g); this._out(g, 1.1);
      o.start(t + i * 0.25); o.stop(t + 6.2);
    });
  }

  /* ---------------- adaptive mix ---------------- */
  update(danger, running = false, dt = 0.016) {
    if (!this.ready) return;
    this.danger += (danger - this.danger) * Math.min(1, dt * 1.5);
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.droneLP) {
      this.droneLP.frequency.setTargetAtTime(200 + this.danger * 520, now, 0.4);
    }
    if (this.droneOut) {
      this.droneOut.gain.setTargetAtTime(0.11 + this.danger * 0.1, now, 0.5);
    }
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(0.14 + this.danger * 0.05, now, 0.8);
    }

    this.whisperTimer -= dt;
    if (this.whisperTimer <= 0) {
      this.whisperTimer = rand(9, 20) - this.danger * 3;
      if (Math.random() < 0.55) this.whisper();
    }

    this.breathTimer -= dt;
    if (this.breathTimer <= 0) {
      this.breathTimer = rand(3.2, 7.5) / (0.5 + this.danger * 2);
      if (this.danger > 0.12) this.stagBreath();
      if (this.danger > 0.5 && Math.random() < 0.3) this.stagCrack();
    }
  }

  // called from the game loop with deltas
  footstepTick(dt, speed, crouch) {
    if (!this.ready) return;
    if (speed < 0.2) { this.stepTimer = 0; return; }
    this.stepTimer -= dt;
    if (this.stepTimer <= 0) {
      this.stepTimer = crouch ? 0.72 : speed > 3.2 ? 0.32 : 0.5;
      this.step(crouch ? 0.2 : speed > 3.2 ? 1 : 0.55);
    }
  }

  heartbeatTick(dt, dread) {
    if (!this.ready) return;
    const bpm = 52 + dread * 90;
    this.heartTimer -= dt;
    if (this.heartTimer <= 0 && dread > 0.25) {
      this.heartTimer = 60 / bpm;
      this.heartbeat(clamp(0.4 + dread, 0.4, 1.4));
    }
  }
}
