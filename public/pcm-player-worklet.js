// RıdvanSes v49 — Sıra Numarası (Seq) Tabanlı Jitter Tamponu, Dalga-Tabanlı PLC ve ±1000 ppm Hermite ASRC Oynatıcı
const RYS_MOD = 0x80000000;
function rysDiff(a, b) {
  return ((a - b + 0x40000000) & 0x7fffffff) - 0x40000000;
}

class RysPcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rate = typeof sampleRate === 'number' && sampleRate > 0 ? sampleRate : 48000;
    this.hb = 0;
    this.target = 0.120;
    this.jitter = 0;
    this.lastArrival = null;
    this.lastSeq = null;
    this.stats = { late: 0, duplicate: 0, concealed: 0, resync: 0 };
    this.phraseSeen = new Set();
    this.tail = new Float32Array(Math.max(2, Math.round(this.rate * 0.005)));
    this.blend = new Float32Array(this.tail.length);
    this.tailPos = 0;
    this._reset();
    this.port.onmessage = (e) => {
      const m = (e && e.data) || {};
      if (m.type === 'reset') {
        this._reset();
        return;
      }
      if (m.type === 'push') this._push(m);
    };
  }

  _reset() {
    this.q = new Map();
    this.expected = null;
    this.playing = false;
    this.frame = new Float32Array(480);
    this.fi = 480;
    this.history = new Float32Array(480);
    this.haveHistory = false;
    this.missing = 0;
    this.wait = 0;
    this.phase = 0;
    this.ratio = 1;
    this.y0 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.y3 = 0;
    this.primed = false;
    this.resetFrom = this.lastOut || 0;
    this.resetFade = 0;
    this.lastOut = this.resetFrom;
    this.fade = 0;
    this.blend.fill(0);
    this.tail.fill(0);
    this.tailPos = 0;
    this.fadeN = Math.max(2, Math.round(this.rate * 0.005));
    this.lastArrival = null;
    this.lastSeq = null;
  }

  _push(m) {
    if (
      !(m.samples instanceof Float32Array) ||
      m.samples.length !== 480 ||
      !Number.isInteger(m.seq) ||
      m.seq < 0 ||
      m.seq >= RYS_MOD ||
      !Number.isFinite(m.arrival)
    ) {
      return;
    }
    for (const x of m.samples) {
      if (!Number.isFinite(x)) return;
    }
    // phraseStart reconnect/resync işaretidir; yinelenen ilk paket reset yapmamalı.
    if (m.phraseStart && !this.phraseSeen.has(m.seq)) {
      this.phraseSeen.add(m.seq);
      if (this.phraseSeen.size > 64) {
        this.phraseSeen.delete(this.phraseSeen.values().next().value);
      }
      this._reset();
    }
    if (this.expected === null) this.expected = m.seq;
    let d = rysDiff(m.seq, this.expected);
    if (d < 0 && !this.playing && d >= -12) {
      this.expected = m.seq;
      d = 0;
    }
    if (d < 0) {
      this.stats.late++;
      return;
    }
    if (this.q.has(m.seq)) {
      this.stats.duplicate++;
      return;
    }
    // Uzun kopma/yeniden bağlanmada eski zamanı sonsuza dek takip etmeyin.
    if (d > 32) {
      this.stats.resync++;
      this._reset();
      this.expected = m.seq;
    }
    if (this.lastArrival !== null && this.lastSeq !== null) {
      const ds = rysDiff(m.seq, this.lastSeq);
      if (ds > 0 && ds < 32) {
        const delta = Math.abs((m.arrival - this.lastArrival) / 1000 - ds * 0.020);
        this.jitter += (Math.min(0.5, delta) - this.jitter) / 16;
        const wanted = Math.max(0.080, Math.min(0.260, 0.060 + 4 * this.jitter));
        // Büyüme hızlı, küçülme yavaş. Aktif akışta hedef değişimi ASRC'ye yansır.
        this.target += (wanted - this.target) * (wanted > this.target ? 0.25 : 0.002);
      }
    }
    this.lastArrival = m.arrival;
    this.lastSeq = m.seq;
    if (this.q.size >= 32) {
      this.stats.resync++;
      this._reset();
      this.expected = m.seq;
    }
    this.q.set(m.seq, m.samples);
  }

  _startBlend() {
    const correction = this.lastOut - this.tail[this.tailPos];
    for (let i = 0; i < this.tail.length; i++) {
      const w = 0.5 + 0.5 * Math.cos((Math.PI * i) / (this.tail.length - 1));
      this.blend[i] = this.tail[(this.tailPos + i) % this.tail.length] + correction * w;
    }
    this.fade = 0;
  }

  _nextFrame() {
    const packet = this.q.get(this.expected);
    this.q.delete(this.expected);
    this.expected = (this.expected + 1) % RYS_MOD;
    this.fi = 0;
    if (packet) {
      // PLC ve gerçek waveform arasında 5 ms raised-cosine geçiş.
      const recovery = this.missing > 0;
      if (recovery) this._startBlend();
      this.missing = 0;
      this.frame = packet;
      this.history.set(packet);
      this.haveHistory = true;
    } else {
      this.missing++;
      this.stats.concealed += 480;
      // Tekrarlar ilk 60 ms içinde söner; sonsuz buzz üretmez.
      const lost = (this.missing - 1) * 480;
      const plc = new Float32Array(480);
      for (let i = 0; i < 480; i++) {
        const age = lost + i;
        const g = age < 1440 ? 0.5 * (1 + Math.cos((Math.PI * age) / 1440)) : 0;
        plc[i] = this.haveHistory ? this.history[i] * g : 0;
      }
      // Frame sınırında history sonundan başına geçişi yumuşat.
      const from = this.frame[479] || 0;
      const n = 120;
      for (let i = 0; i < n; i++) {
        const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1));
        plc[i] = from * (1 - w) + plc[i] * w;
      }
      this.frame = plc;
    }
  }

  _pull() {
    if (this.fi >= 480) this._nextFrame();
    return this.frame[this.fi++];
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out?.[0]) return true;
    const ch = out[0];
    const n = ch.length;
    this.hb += n;
    if (this.hb >= this.rate * 0.5) {
      this.hb = 0;
      this.port.postMessage({ type: 'audio-heartbeat' });
      this.port.postMessage({
        type: 'stats',
        ...this.stats,
        bufferedMs: this.q.size * 20,
        targetMs: this.target * 1000,
        jitterMs: this.jitter * 1000
      });
    }
    if (!this.playing) {
      if (this.expected !== null && this.q.size > 0) this.wait += n / this.rate;
      else this.wait = 0;
      const need = Math.ceil(this.target / 0.020);
      if (
        this.expected !== null &&
        (this.q.size >= need || (this.wait > 0.300 && this.q.size > 0))
      ) {
        this.playing = true;
        this._startBlend();
      } else {
        for (let i = 0; i < n; i++) {
          const w =
            this.resetFade < this.fadeN
              ? 0.5 + 0.5 * Math.cos((Math.PI * this.resetFade) / (this.fadeN - 1))
              : 0;
          ch[i] = this.resetFrom * w;
          this.resetFade++;
        }
        for (let c = 1; c < out.length; c++) out[c].set(ch);
        return true;
      }
    }
    const queued = this.q.size * 480 + (480 - this.fi);
    const error = queued / 24000 - this.target;
    const wanted = 1 + Math.max(-0.001, Math.min(0.001, error * 0.01));
    this.ratio += (wanted - this.ratio) * Math.min(1, n / (this.rate * 2));
    const step = (24000 / this.rate) * this.ratio;
    if (!this.primed) {
      this.y0 = 0;
      this.y1 = this._pull();
      this.y2 = this._pull();
      this.y3 = this._pull();
      this.phase = 0;
      this.primed = true;
    }
    for (let i = 0; i < n; i++) {
      const t = this.phase;
      const a = this.y0;
      const b = this.y1;
      const c = this.y2;
      const d = this.y3;
      const c1 = 0.5 * (c - a);
      const c2 = a - 2.5 * b + 2 * c - 0.5 * d;
      const c3 = 0.5 * (d - a) + 1.5 * (b - c);
      let y = ((c3 * t + c2) * t + c1) * t + b;
      if (this.fade < this.fadeN) {
        const w = 0.5 - 0.5 * Math.cos((Math.PI * this.fade) / (this.fadeN - 1));
        y = this.blend[this.fade] * (1 - w) + y * w;
        this.fade++;
      }
      y = Math.max(-0.99, Math.min(0.99, y));
      ch[i] = y;
      this.lastOut = y;
      this.tail[this.tailPos] = y;
      this.tailPos = (this.tailPos + 1) % this.tail.length;
      this.phase += step;
      while (this.phase >= 1) {
        this.phase -= 1;
        this.y0 = this.y1;
        this.y1 = this.y2;
        this.y2 = this.y3;
        this.y3 = this._pull();
      }
    }
    // 300 ms'den uzun eksik ses: ileride gerçek ses gelince yeniden ön tamponla.
    if (this.missing >= 15 && this.q.size === 0) {
      this.playing = false;
      this.expected = null;
      this.wait = 0;
      this.primed = false;
      this.fi = 480;
      this.haveHistory = false;
      this.resetFrom = this.lastOut;
      this.resetFade = 0;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return true;
  }
}

registerProcessor('rys-pcm-player', RysPcmPlayerProcessor);
