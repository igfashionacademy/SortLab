// Sound engine: short tones whose pitch follows the value being touched
(function (SL) {
  'use strict';

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.wave = 'triangle';
      this.volume = 0.4;
      this.low = 160;
      this.high = 1400;
      this.last = 0;
      this.streamDest = null;
    }

    configure(s) {
      this.enabled = !!s.sound;
      this.wave = s.wave;
      this.volume = s.volume / 100;
      this.low = s.pitchLow;
      this.high = Math.max(s.pitchLow + 20, s.pitchHigh);
      if (this.master) this.master.gain.value = this.volume * 0.5;
    }

    get ready() { return !!this.ctx && this.ctx.state === 'running'; }

    // Browsers only allow audio after a tap or click
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume * 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    // Audio stream used when recording videos
    stream() {
      this.unlock();
      if (!this.ctx) return null;
      if (!this.streamDest) {
        this.streamDest = this.ctx.createMediaStreamDestination();
        this.master.connect(this.streamDest);
      }
      return this.streamDest.stream;
    }

    // Renders a list of [time, frac, gain] notes into one audio buffer
    renderNotes(notes, duration) {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!OAC || !notes.length) return Promise.resolve(null);
      const rate = 48000;
      const oc = new OAC(1, Math.ceil((duration + 0.3) * rate), rate);
      const peak = this.wave === 'square' || this.wave === 'sawtooth' ? 0.18 : 0.35;
      for (const [t, frac, gain] of notes) {
        const f = this.low * Math.pow(this.high / this.low, SL.clamp(frac, 0, 1));
        const o = oc.createOscillator();
        const g = oc.createGain();
        o.type = this.wave;
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak * gain, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
        o.connect(g);
        g.connect(oc.destination);
        o.start(t);
        o.stop(t + 0.1);
      }
      return oc.startRendering();
    }

    play(frac, force) {
      if ((!this.enabled && !force) || frac < 0 || !this.ready) return;
      const now = this.ctx.currentTime;
      if (now - this.last < 0.014) return;
      this.last = now;
      const f = this.low * Math.pow(this.high / this.low, SL.clamp(frac, 0, 1));
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = this.wave;
      o.frequency.value = f;
      const peak = this.wave === 'square' || this.wave === 'sawtooth' ? 0.18 : 0.35;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.09);
      o.connect(g);
      g.connect(this.master);
      o.start(now);
      o.stop(now + 0.1);
    }
  }

  SL.audio = new AudioEngine();
})(window.SL);
