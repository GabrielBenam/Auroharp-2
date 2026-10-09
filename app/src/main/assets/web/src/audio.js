/* Audio: síntesis de cuerda pulsada Karplus-Strong precalculada por cuerda (Web Audio API).
   Implementa el modelo de apagado: presionar una barra apaga las cuerdas que vibran bajo su fieltro. */
(function (g) {
  'use strict';
  const AH = g.AH = g.AH || {};

  function ks(ctx, freq, seconds) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / freq));
    const line = new Float32Array(N);
    // excitación: ruido filtrado (pulsación con púa suave)
    let prev = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; prev = 0.6 * prev + 0.4 * r; line[i] = prev; }
    // decaimiento dependiente de la frecuencia: graves sostienen más
    const decay = 0.996 + Math.min(0.0035, 30 / freq * 0.0035);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const a = line[idx], b = line[(idx + 1) % N];
      const v = decay * 0.5 * (a + b);
      out[i] = a;
      line[idx] = v;
      idx = (idx + 1) % N;
    }
    // envolvente de ataque corto para evitar clic
    for (let i = 0; i < Math.min(64, len); i++) out[i] *= i / 64;
    return buf;
  }

  function Audio(tuning) {
    this.tuning = tuning;
    this.ctx = null; this.buffers = []; this.voices = [];
    this.volume = 0.7; this.strumMs = 14;
  }
  Audio.prototype.ensure = function () {
    if (!this.ctx) {
      const AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      this.buffers = this.tuning.map(s => ks(this.ctx, AH.theory.midiToFreq(s.midi), 4.5));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  };
  Audio.prototype.setTuning = function (tuning) { this.tuning = tuning; if (this.ctx) this.buffers = tuning.map(s => ks(this.ctx, AH.theory.midiToFreq(s.midi), 4.5)); };
  Audio.prototype.setVolume = function (v) { this.volume = v; if (this.master) this.master.gain.value = v; };
  Audio.prototype.pluck = function (i, when, vel) {
    if (!this.ensure() || !this.buffers[i]) return;
    this.damp(i, when);
    const src = this.ctx.createBufferSource(); src.buffer = this.buffers[i];
    const gn = this.ctx.createGain(); gn.gain.value = (vel || 0.8) * 0.35;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    src.connect(gn);
    if (pan) { pan.pan.value = (i / (this.tuning.length - 1)) * 1.2 - 0.6; gn.connect(pan); pan.connect(this.master); } else gn.connect(this.master);
    const t = when || this.ctx.currentTime;
    src.start(t);
    this.voices[i] = { src, gn };
  };
  /** Rasgueo de grave a agudo sobre las cuerdas indicadas (índices). */
  Audio.prototype.strum = function (strings, ms) {
    if (!this.ensure()) return;
    const step = (ms !== undefined ? ms : this.strumMs) / 1000;
    const t0 = this.ctx.currentTime + 0.01;
    strings.slice().sort((a, b) => a - b).forEach((i, k) => this.pluck(i, t0 + k * step, 0.75 + Math.random() * 0.1));
  };
  Audio.prototype.damp = function (i, when) {
    const v = this.voices[i];
    if (!v || !this.ctx) return;
    const t = when || this.ctx.currentTime;
    try { v.gn.gain.cancelScheduledValues(t); v.gn.gain.setTargetAtTime(0, t, 0.012); v.src.stop(t + 0.1); } catch (e) { /* ya detenida */ }
    this.voices[i] = null;
  };
  /** Aplica una máscara de fieltro: apaga lo que vibra donde la máscara es 0. */
  Audio.prototype.applyMask = function (mask) {
    for (let i = 0; i < mask.length; i++) if (!mask[i]) this.damp(i);
  };
  Audio.prototype.dampAll = function () { for (let i = 0; i < this.voices.length; i++) this.damp(i); };

  AH.Audio = Audio;
})(typeof globalThis !== 'undefined' ? globalThis : window);
