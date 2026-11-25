// Efectos de sonido sintetizados con Web Audio (sin archivos).
const Snd = {
  ctx: null,
  on: (() => { try { return localStorage.getItem('hc_snd') !== '0'; } catch (e) { return true; } })(),
  last: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    this.ctx = new A();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    const n = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  },
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('hc_snd', this.on ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
    return this.on;
  },
  tone(freq, dur, type = 'square', vol = 0.15, delay = 0, slide = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  hiss(dur, freq, vol = 0.2, kind = 'lowpass', delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = kind; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.02);
  },
  play(name, faction) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gap = { hit: 0.07, chop: 0.12, shoot: 0.08, boom: 0.1, death: 0.12, ack: 0.15 }[name] || 0.05;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const low = faction === 'orc';
    switch (name) {
      case 'click': this.tone(520, 0.06, 'triangle', 0.18); break;
      case 'select': this.tone(low ? 130 : 330, 0.09, low ? 'sawtooth' : 'triangle', 0.12, 0, low ? -30 : 90); break;
      case 'ack':
        this.tone(low ? 110 : 294, 0.09, low ? 'sawtooth' : 'square', 0.09, 0, low ? 40 : 0);
        this.tone(low ? 98 : 392, 0.12, low ? 'sawtooth' : 'square', 0.09, 0.09, low ? -35 : 0);
        break;
      case 'hit': this.hiss(0.07, 3200, 0.2, 'bandpass'); this.tone(900 + Math.random() * 500, 0.05, 'triangle', 0.05); break;
      case 'chop': this.hiss(0.08, 700, 0.18); break;
      case 'shoot': this.hiss(0.12, 2200, 0.09, 'highpass'); break;
      case 'boom': this.hiss(0.5, 260, 0.55); this.tone(70, 0.4, 'sine', 0.3, 0, -35); break;
      case 'death': this.tone(low ? 160 : 340, 0.25, 'sawtooth', 0.08, 0, -120); break;
      case 'built': [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.16, i * 0.1)); break;
      case 'trained': this.tone(low ? 147 : 440, 0.1, 'square', 0.09); this.tone(low ? 196 : 587, 0.16, 'square', 0.09, 0.1); break;
      case 'alert': [0, 0.28].forEach(d => { this.tone(low ? 220 : 392, 0.2, 'sawtooth', 0.15, d); this.tone(low ? 165 : 294, 0.2, 'sawtooth', 0.1, d); }); break;
      case 'error': this.tone(120, 0.16, 'square', 0.1); break;
      case 'heal': this.tone(880, 0.2, 'sine', 0.08, 0, 440); break;
      case 'fury': this.tone(90, 0.3, 'sawtooth', 0.12, 0, 90); break;
      case 'horn': [0, 0.35, 0.7].forEach((d, i) => this.tone([196, 196, 262][i], i === 2 ? 0.7 : 0.3, 'sawtooth', 0.14, d)); break;
      case 'win': [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'square', 0.11, i * 0.17)); break;
      case 'lose': [392, 370, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.1, i * 0.32)); break;
    }
  },
};
