// RıdvanSes v29 — Broadcast-Grade Continuous Ring-Buffer AudioWorklet Player
// Donanım ses iş parçacığında (Audio Rendering Thread) sıfır kesinti, sıfır paket sınırı
// boşluğu ve %100 sabit perde (1.0x) ile 48 kHz / 44.1 kHz saf stüdyo oynatımı sağlar.
class RysPcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' && sampleRate > 0 ? sampleRate : 48000;
    this._sampleRate = sr;
    this._capacity = Math.max(96000, Math.ceil(sr * 2.5)); // 2.5 saniyelik dairesel tampon
    this._ring = new Float32Array(this._capacity);
    this._writePtr = 0;
    this._readPtr = 0;
    this._available = 0;

    // 135ms güvenli başlangıç yastığı (mobil Wi-Fi/4G paket dalgalanmalarını tamamen emer)
    this._prebufferTarget = Math.round(sr * 0.135);
    // 520ms maksimum gecikme sınırı (aşırı birikme olursa perdeyi değiştirmeden yumuşak geçiş yapar)
    this._maxBufferTarget = Math.round(sr * 0.520);
    this._optimalTarget = Math.round(sr * 0.160);

    this._state = 'buffering'; // 'buffering' | 'playing'
    this._fadeInSamples = Math.round(sr * 0.008); // 8ms kosinüs yumuşak giriş
    this._fadeInPos = 0;
    this._lastSample = 0;

    this.port.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg) return;
      if (msg.type === 'reset') {
        this._writePtr = 0;
        this._readPtr = 0;
        this._available = 0;
        this._state = 'buffering';
        this._fadeInPos = 0;
        this._lastSample = 0;
        return;
      }
      if (msg.type === 'push' && msg.samples) {
        this._pushSamples(msg.samples, Boolean(msg.phraseStart));
      }
    };
  }

  _pushSamples(samples, phraseStart) {
    const len = samples.length;
    if (!len) return;

    // Eğer yeni bir cümle başlangıcıysa ve tampon zaten boşsa yumuşak giriş hazırla
    if (phraseStart && this._available === 0) {
      this._state = 'buffering';
      this._fadeInPos = 0;
    }

    // Tampon aşırı dolmuşsa (>520ms) en güncel 160ms'ye yumuşak çapraz geçiş (crossfade) yap
    if (this._available + len > this._maxBufferTarget) {
      const dropCount = (this._available + len) - this._optimalTarget;
      if (dropCount > 0 && dropCount < this._available) {
        const oldSample = this._ring[this._readPtr];
        this._readPtr = (this._readPtr + dropCount) % this._capacity;
        this._available -= dropCount;
        // İlk 64 örnekte eski örnekten yeni konuma yumuşak geçiş uygula
        const blendLen = Math.min(64, this._available);
        for (let k = 0; k < blendLen; k++) {
          const idx = (this._readPtr + k) % this._capacity;
          const alpha = (k + 1) / (blendLen + 1);
          this._ring[idx] = oldSample * (1 - alpha) + this._ring[idx] * alpha;
        }
      }
    }

    for (let i = 0; i < len; i++) {
      if (this._available < this._capacity) {
        this._ring[this._writePtr] = samples[i];
        this._writePtr = (this._writePtr + 1) % this._capacity;
        this._available++;
      }
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const outCh = output[0];
    const frames = outCh.length;

    if (this._state === 'buffering') {
      if (this._available >= this._prebufferTarget) {
        this._state = 'playing';
        this._fadeInPos = 0;
      } else {
        // Tampon dolana kadar sıfır (veya önceki son örneğin yumuşak sönümlenmesi)
        for (let i = 0; i < frames; i++) {
          if (Math.abs(this._lastSample) > 1e-5) {
            this._lastSample *= 0.90;
            outCh[i] = this._lastSample;
          } else {
            this._lastSample = 0;
            outCh[i] = 0;
          }
        }
        return true;
      }
    }

    if (this._available >= frames) {
      for (let i = 0; i < frames; i++) {
        let s = this._ring[this._readPtr];
        this._readPtr = (this._readPtr + 1) % this._capacity;
        this._available--;

        if (this._fadeInPos < this._fadeInSamples) {
          const w = 0.5 * (1 - Math.cos((Math.PI * this._fadeInPos) / this._fadeInSamples));
          s = this._lastSample * (1 - w) + s * w;
          this._fadeInPos++;
        }

        this._lastSample = s;
        outCh[i] = s;
      }
    } else {
      // Konuşma durduğunda veya ağda uzun boşluk olduğunda son örnekleri sıfıra yumuşakça indir
      // ve bir sonraki cümle için tekrar 135ms güvenli tampon (buffering) moduna geç!
      for (let i = 0; i < frames; i++) {
        if (this._available > 0) {
          this._lastSample = this._ring[this._readPtr];
          this._readPtr = (this._readPtr + 1) % this._capacity;
          this._available--;
        } else {
          this._lastSample *= 0.92;
        }
        outCh[i] = this._lastSample;
      }
      this._state = 'buffering';
      this._fadeInPos = 0;
    }

    // İkinci kanal (stereo) varsa kopyala
    if (output.length > 1 && output[1]) {
      output[1].set(outCh);
    }
    return true;
  }
}

registerProcessor('rys-pcm-player', RysPcmPlayerProcessor);
