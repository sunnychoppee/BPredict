"use client";

/**
 * Tiny WebAudio synth — no audio assets to ship. The context is created on first user gesture
 * (browsers block autoplay) and every cue is a short envelope on oscillators / noise.
 */
export type Cue = "chip" | "place" | "cancel" | "lock" | "tick" | "win" | "lose" | "void" | "click";
/** `casino` = chip clatter & fanfares; `soft` = short, quiet UI tones for the 簡約漲跌 skin. */
export type SoundTheme = "casino" | "soft";

const STORAGE_KEY = "bp.sound";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = typeof window !== "undefined" ? window.localStorage?.getItem(STORAGE_KEY) === "off" : false;
  private theme: SoundTheme = "casino";

  get muted() {
    return this._muted;
  }
  setTheme(t: SoundTheme) {
    this.theme = t;
  }
  setMuted(m: boolean) {
    this._muted = m;
    try {
      window.localStorage.setItem(STORAGE_KEY, m ? "off" : "on");
    } catch {
      /* private mode */
    }
    if (!m) this.unlock();
  }

  /** Call from a user gesture (click/touch) to create / resume the AudioContext. */
  unlock() {
    if (typeof window === "undefined") return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* no audio */
    }
  }

  play(cue: Cue) {
    if (this._muted || !this.ctx || !this.master || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    if (this.theme === "soft") return this.playSoft(cue, t);
    switch (cue) {
      case "chip":
      case "click":
        this.noise(t, 0.03, 1800, 0.5);
        this.tone(t, 0.04, 1200, "square", 0.15);
        break;
      case "place":
        this.noise(t, 0.05, 2400, 0.6);
        this.tone(t, 0.08, 660, "triangle", 0.25);
        this.tone(t + 0.03, 0.08, 990, "triangle", 0.2);
        break;
      case "cancel":
        this.tone(t, 0.12, 440, "triangle", 0.2);
        this.tone(t + 0.08, 0.14, 330, "triangle", 0.2);
        break;
      case "lock":
        this.tone(t, 0.18, 523, "sine", 0.3);
        this.tone(t + 0.15, 0.25, 392, "sine", 0.3);
        break;
      case "tick":
        this.tone(t, 0.05, 1500, "square", 0.12);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.09, 0.22, f, "triangle", 0.3));
        this.tone(t + 0.4, 0.5, 1319, "sine", 0.2);
        break;
      case "lose":
        this.tone(t, 0.25, 220, "sawtooth", 0.15);
        this.tone(t + 0.12, 0.35, 165, "sawtooth", 0.15);
        break;
      case "void":
        this.tone(t, 0.2, 440, "sine", 0.2);
        this.tone(t + 0.2, 0.2, 440, "sine", 0.2);
        break;
    }
  }

  /** Soft theme: no noise bursts, sine-only, shorter and ~40% quieter. */
  private playSoft(cue: Cue, t: number) {
    switch (cue) {
      case "chip":
      case "click":
        this.tone(t, 0.03, 900, "sine", 0.08);
        break;
      case "place":
        this.tone(t, 0.07, 620, "sine", 0.14);
        this.tone(t + 0.04, 0.08, 830, "sine", 0.1);
        break;
      case "cancel":
        this.tone(t, 0.09, 420, "sine", 0.1);
        break;
      case "lock":
        this.tone(t, 0.14, 587, "sine", 0.14);
        break;
      case "tick":
        this.tone(t, 0.04, 1200, "sine", 0.07);
        break;
      case "win":
        [659, 880].forEach((f, i) => this.tone(t + i * 0.1, 0.2, f, "sine", 0.16));
        break;
      case "lose":
        this.tone(t, 0.22, 262, "sine", 0.1);
        break;
      case "void":
        this.tone(t, 0.16, 440, "sine", 0.1);
        break;
    }
  }

  private tone(at: number, dur: number, freq: number, type: OscillatorType, gain: number) {
    if (!this.ctx || !this.master) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noise(at: number, dur: number, cutoff: number, gain: number) {
    if (!this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(at);
  }
}

let engine: SoundEngine | null = null;
export function sound(): SoundEngine {
  if (!engine) engine = new SoundEngine();
  return engine;
}
