// RıdvanSes v49 — Gerçek Zamanlı AudioWorklet Yakalama Motoru
// 193-Tap 256-Faz Blackman Windowed-Sinc Polyphase Anti-Aliasing FIR (RysFir24)
// + 240-Örnek (10 ms) Lookahead Gecikme Hatlı 4-Bant Spektral SNR Yakın-Alan Kapısı (RysNearExpander)

class RysFir24 {
  constructor(rate) {
    this.rate = Math.round(rate) || 48000;
    this.out = 24000;
    this.pass = this.rate === this.out;
    this.phases = 256;
    this.taps = 193;
    this.mid = (this.taps - 1) >> 1;
    this.ring = new Float32Array(this.taps);
    this.w = 0;
    this.warm = 0;
    this.t = 0;
    if (this.pass) return;
    this.table = new Float32Array(this.phases * this.taps);
    const fc = 10400 / this.rate;
    for (let p = 0; p < this.phases; p++) {
      const frac = p / this.phases;
      let sum = 0;
      const base = p * this.taps;
      for (let k = 0; k < this.taps; k++) {
        const x = k - this.mid - frac;
        const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
        const u = (k - frac) / (this.taps - 1);
        const win = 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u);
        const h = 2 * fc * sinc * win;
        this.table[base + k] = h;
        sum += h;
      }
      const inv = 1 / (sum || 1);
      for (let k = 0; k < this.taps; k++) this.table[base + k] *= inv;
    }
  }

  push(sample, emit) {
    const x = Number.isFinite(sample) ? sample : 0;
    if (this.pass) {
      emit(x);
      return;
    }
    this.ring[this.w] = x;
    this.w = (this.w + 1) % this.taps;
    if (this.warm < this.taps) this.warm++;
    this.t += this.out;
    while (this.t >= this.rate) {
      this.t -= this.rate;
      if (this.warm < this.taps) {
        emit(0);
        continue;
      }
      const p = Math.min(this.phases - 1, Math.floor((this.t / this.rate) * this.phases));
      const base = p * this.taps;
      let acc = 0;
      let idx = this.w;
      for (let k = 0; k < this.taps; k++) {
        acc += this.ring[idx] * this.table[base + k];
        idx++;
        if (idx === this.taps) idx = 0;
      }
      emit(acc);
    }
  }
}

class RysNearExpander {
  constructor(opts = {}) {
    this.hpX = 0;
    this.hpY = 0;
    this.lp200 = 0;
    this.lp1000 = 0;
    this.lp4000 = 0;
    this.e = new Float64Array([1e-8, 1e-8, 1e-8, 1e-8]);
    this.n = new Float64Array([1e-7, 1e-7, 1e-7, 1e-7]);
    // 240 örnek = 10 ms @ 24 kHz Lookahead gecikme hattı (İlk ünsüz harflerin kırpılmasını %100 önler)
    this.look = new Float32Array(240);
    this.li = 0;
    this.g = 0.03;
    this.hold = 0;
    this.reject = Math.max(0.15, Math.min(0.85, Number(opts.reject) || 0.50));
  }

  setProfile(opts = {}) {
    if (opts.reject !== undefined) {
      this.reject = Math.max(0.15, Math.min(0.85, Number(opts.reject) || 0.50));
    }
    if (opts.resetLock) {
      this.e.fill(1e-8);
      this.n.fill(1e-7);
      this.hold = 0;
    }
  }

  step(raw) {
    // 80 Hz DC ve rüzgar kesici yüksek geçiren filtre
    const x = 0.9793 * (this.hpY + raw - this.hpX);
    this.hpX = raw;
    this.hpY = x;

    // 4-Bant Spektral Enerji Ayrıştırma (0-200Hz, 200-1000Hz, 1-4kHz, 4-12kHz)
    this.lp200 += 0.0510 * (x - this.lp200);
    this.lp1000 += 0.2304 * (x - this.lp1000);
    this.lp4000 += 0.6489 * (x - this.lp4000);
    const b0 = this.lp200;
    const b1 = this.lp1000 - this.lp200;
    const b2 = this.lp4000 - this.lp1000;
    const b3 = x - this.lp4000;
    const bands = [b0 * b0, b1 * b1, b2 * b2, b3 * b3];
    for (let i = 0; i < 4; i++) {
      this.e[i] = 0.995 * this.e[i] + 0.005 * bands[i];
    }

    const speech = this.e[1] + 1.3 * this.e[2] + 0.35 * this.e[3];
    const noise = this.n[1] + 1.3 * this.n[2] + 0.35 * this.n[3] + 1e-9;
    const snr = 10 * Math.log10(speech / noise);
    const useful = this.e[1] + this.e[2];
    const rumbleOk = useful / (this.e[0] + 1e-9) > 0.8;

    // Adaptif gürültü tabanı yalnızca konuşma yokken yavaşça güncellenir
    if (snr < 4.5 && this.hold === 0) {
      for (let i = 0; i < 4; i++) {
        this.n[i] = Math.min(1e-2, Math.max(1e-9, 0.9995 * this.n[i] + 0.0005 * this.e[i]));
      }
    }

    // Yan ses reddi (reject: 0.15..0.85) değerine göre dinamik SNR eşiği ve taban zayıflatması
    const openSnrDb = 7.5 + (this.reject - 0.5) * 4.0;
    const openEnergy = 1.6e-5 * (0.7 + this.reject * 0.6);
    if (rumbleOk && snr > openSnrDb && speech > openEnergy) {
      this.hold = Math.round(24000 * 0.28); // 280 ms cümle tutma süresi (kelime sonlarını korur)
    } else if (this.hold > 0) {
      this.hold--;
    }

    // Kapı kapalıyken: P0 uyumluluğu ve Kâbe gürültü bastırması için yumuşak taban
    const closedFloor = Math.max(0.012, Math.min(0.126, 0.126 - (this.reject - 0.5) * 0.16));
    const want = this.hold > 0 ? 1 : (snr > 4.5 && rumbleOk ? 0.45 : closedFloor);
    const a = want > this.g ? 0.028 : 0.00055; // ~1.5 ms hızlı açılış, ~75 ms yumuşak kapanış
    this.g += (want - this.g) * a;

    // 10 ms gecikme hattından oku (Lookahead sayesinde ilk ünsüz harfler kırpılmaz)
    const delayed = this.look[this.li];
    this.look[this.li] = x;
    this.li = (this.li + 1) % this.look.length;

    let y = delayed * this.g;
    const ay = Math.abs(y);
    if (ay > 0.85) {
      y = Math.sign(y) * (0.85 + 0.13 * Math.tanh((ay - 0.85) / 0.13));
    }
    return Math.max(-0.98, Math.min(0.98, y));
  }
}

class RysPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.muted = Boolean(opts.muted);
    this.fir = new RysFir24(sampleRate);
    this.gate = new RysNearExpander(opts);
    this.frame = new Float32Array(480); // 20 ms @ 24 kHz
    this.offset = 0;
    this.sq = 0;
    this.port.onmessage = (e) => {
      const d = (e && e.data) || {};
      if (d.type === 'set-mute') this.muted = Boolean(d.muted);
      if (d.type === 'set-profile') this.gate.setProfile(d);
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (out) {
      for (const c of out) c.fill(0);
    }
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    const nowSec = typeof currentTime === 'number' ? currentTime : 0;
    for (let i = 0; i < ch.length; i++) {
      this.fir.push(ch[i], (s24) => {
        const y = this.muted ? 0 : this.gate.step(s24);
        this.frame[this.offset++] = y;
        this.sq += y * y;
        if (this.offset === 480) {
          const outFrame = new Float32Array(this.frame);
          const rms = Math.sqrt(this.sq / 480);
          const gateOpen = !this.muted && (this.gate.hold > 0 || this.gate.g > 0.35);
          this.port.postMessage(
            {
              type: 'frame',
              samples: outFrame,
              rms,
              gateOpen,
              capturedAt: nowSec
            },
            [outFrame.buffer]
          );
          this.offset = 0;
          this.sq = 0;
        }
      });
    }
    return true;
  }
}

registerProcessor('rys-pcm-capture', RysPcmCaptureProcessor);
