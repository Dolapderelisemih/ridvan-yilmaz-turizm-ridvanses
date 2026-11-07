// RıdvanSes v46 — Broadcast-Grade Continuous Ring-Buffer AudioWorklet Player
// Donanım ses iş parçacığında (Audio Rendering Thread) sıfır kelime kesintisi, sıfır paket sınırı
// boşluğu ve %100 sabit perde (1.0x) ile 48 kHz / 44.1 kHz telefon görüşmesi akıcılığında oynatım sağlar.
class RysPcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' && sampleRate > 0 ? sampleRate : 48000;
    this._sampleRate = sr;
    this._capacity = Math.max(144000, Math.ceil(sr * 3.0)); // 3.0 saniyelik dairesel tampon
    this._ring = new Float32Array(this._capacity);
    this._writePtr = 0;
    this._readPtr = 0;
    this._available = 0;

    // Adaptif Jitter Ön Tamponu (150ms - 260ms Arası Kâbe Şebeke Yoğunluğuna Göre Esneyen Yastık)
    this._minPrebuffer = Math.round(sr * 0.150);
    this._maxPrebuffer = Math.round(sr * 0.260);
    this._prebufferTarget = Math.round(sr * 0.165);
    this._optimalTarget = Math.round(sr * 0.200);
    // 960ms maksimum gecikme sınırı (4G/Wi-Fi paket patlamalarını asla erken kesmez; yalnızca >1 sn bayat birikmede yumuşak hizalar)
    this._maxBufferTarget = Math.round(sr * 0.960);
    this._stablePushCount = 0;
    this._lastPushHadAudio = false;

    this._state = 'buffering'; // 'buffering' | 'playing'
    // PLC Hold: Konuşma sırasında 4G paket gecikmesi (10ms-320ms) olursa hemen 250ms'lik 'buffering' kilidine
    // düşüp kelimeleri kesik kesik yapmaz; geciken paket gelir gelmez anında çalmaya devam eder!
    this._plcHoldTicks = 0;
    this._maxPlcHoldTicks = Math.ceil((sr * 0.340) / 128); // ~340ms mikro-kopma köprüsü
    this._bufferingWaitTicks = 0;
    this._maxShortWordWaitTicks = Math.ceil((sr * 0.095) / 128); // Kısa kelimelerin tamponda kalmaması için ~95ms drenaj

    this._fadeInSamples = Math.round(sr * 0.005); // 5ms kosinüs yumuşak giriş
    this._fadeInPos = 0;
    this._lastSample = 0;
    this._heartbeatTicks = 749;

    this.port.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg) return;
      if (msg.type === 'reset') {
        this._writePtr = 0;
        this._readPtr = 0;
        this._available = 0;
        this._state = 'buffering';
        this._plcHoldTicks = 0;
        this._bufferingWaitTicks = 0;
        this._fadeInPos = 0;
        this._lastSample = 0;
        return;
      }
      if (msg.type === 'push' && msg.samples) {
        this._pushSamples(msg.samples, Boolean(msg.phraseStart), Boolean(msg.isSilent));
      }
    };
  }

  _pushSamples(samples, phraseStart, isSilent = false) {
    const len = samples.length;
    if (!len) return;

    this._lastPushHadAudio = !isSilent;
    this._bufferingWaitTicks = 0;

    if (!isSilent && this._state === 'playing') {
      this._stablePushCount++;
      if (this._stablePushCount >= 180 && this._prebufferTarget > this._minPrebuffer) {
        this._prebufferTarget = Math.max(this._minPrebuffer, this._prebufferTarget - Math.round(this._sampleRate * 0.012));
        this._optimalTarget = this._prebufferTarget + Math.round(this._sampleRate * 0.030);
        this._stablePushCount = 0;
      }
    }

    // Yalnızca tampon tamamen boşken ve yeni cümle başlangıcıysa ön tamponlamaya gir
    if (phraseStart && this._available === 0 && this._state !== 'playing') {
      this._state = 'buffering';
      this._fadeInPos = 0;
    }

    // Tampon 960ms sınırını aşmışsa (uzun ağ takılması sonrası toplu paket hücumu) en güncel 200ms'ye yumuşak crossfade yap
    if (this._available + len > this._maxBufferTarget) {
      const dropCount = (this._available + len) - this._optimalTarget;
      if (dropCount > 0 && dropCount < this._available) {
        const oldSample = this._ring[this._readPtr];
        this._readPtr = (this._readPtr + dropCount) % this._capacity;
        this._available -= dropCount;
        const blendLen = Math.min(128, this._available);
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
    this._heartbeatTicks = (this._heartbeatTicks + 1) | 0;
    if (this._heartbeatTicks >= 750) {
      this._heartbeatTicks = 0;
      try {
        this.port.postMessage({ type: 'audio-heartbeat' });
      } catch {}
    }

    const output = outputs[0];
    if (!output || !output[0]) return true;
    const outCh = output[0];
    const frames = outCh.length;

    if (this._state === 'buffering') {
      if (this._available > 0) {
        this._bufferingWaitTicks++;
      } else {
        this._bufferingWaitTicks = 0;
      }
      // Ön tampon dolduğunda VEYA kısa bir kelime gelip 95ms boyunca başka paket gelmediğinde hemen çal!
      if (
        this._available >= this._prebufferTarget ||
        (this._available >= frames && this._bufferingWaitTicks >= this._maxShortWordWaitTicks)
      ) {
        this._state = 'playing';
        this._plcHoldTicks = 0;
        this._bufferingWaitTicks = 0;
        this._fadeInPos = 0;
      } else {
        for (let i = 0; i < frames; i++) {
          if (Math.abs(this._lastSample) > 1e-5) {
            this._lastSample *= 0.92;
            outCh[i] = this._lastSample;
          } else {
            this._lastSample = 0;
            outCh[i] = 0;
          }
        }
        if (output.length > 1 && output[1]) output[1].set(outCh);
        return true;
      }
    }

    if (this._available >= frames) {
      this._plcHoldTicks = 0;
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
      // Konuşma ortasında anlık 4G/Wi-Fi gecikmesi olduğunda hemen 'buffering' kilidine girip sesi 250ms kesme!
      // 340ms boyunca 'playing' (PLC Hold) durumunda kalarak geciken paket gelir gelmez kesintisiz çal:
      for (let i = 0; i < frames; i++) {
        if (this._available > 0) {
          this._lastSample = this._ring[this._readPtr];
          this._readPtr = (this._readPtr + 1) % this._capacity;
          this._available--;
        } else {
          this._lastSample *= 0.94;
        }
        outCh[i] = this._lastSample;
      }
      this._fadeInPos = 0;
      this._plcHoldTicks++;

      if (this._plcHoldTicks >= this._maxPlcHoldTicks) {
        if (this._lastPushHadAudio) {
          this._stablePushCount = 0;
          this._prebufferTarget = Math.min(this._maxPrebuffer, this._prebufferTarget + Math.round(this._sampleRate * 0.025));
          this._optimalTarget = this._prebufferTarget + Math.round(this._sampleRate * 0.030);
        }
        this._state = 'buffering';
        this._plcHoldTicks = 0;
      }
    }

    if (output.length > 1 && output[1]) {
      output[1].set(outCh);
    }
    return true;
  }
}

registerProcessor('rys-pcm-player', RysPcmPlayerProcessor);
