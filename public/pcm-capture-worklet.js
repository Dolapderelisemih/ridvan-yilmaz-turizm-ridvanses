// PATCH: capture-v53
// PATCH: capture-v52
// PATCH: capture-v51
// PATCH: capture-v50
// RıdvanSes v50 — Gerçek Zamanlı AudioWorklet Yakalama Motoru
// 193-tap Blackman FIR; 256 linearly interpolated phase intervals + endpoint.
// + 400ms unity-gain calibration and speech-frozen 4-band rolling-minima expander.
// + Worklet & ScriptProcessor Ortak 480-Örnek (20 ms @ 24 kHz) Çekirdeği (RysCaptureKernel)

class RysFir24 {
  constructor(rate) {
    if(!Number.isFinite(rate)||rate<8000||rate>192000)throw new RangeError('Invalid input rate');
    this.rate = rate;
    this.t = 0;
    this.count = 0;
    this.r = new Float32Array(512);
    this.table = new Float32Array(257 * 193);
    const fc = Math.min(10200 / rate, 0.45);
    for (let p = 0; p <= 256; p++) {
      let sum = 0;
      for (let k = 0; k < 193; k++) {
        const d = k - 96 + p / 256;
        const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * k) / 192) + 0.08 * Math.cos((4 * Math.PI * k) / 192);
        const h = (Math.abs(d) < 1e-10 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d)) * w;
        this.table[p * 193 + k] = h;
        sum += h;
      }
      for (let k = 0; k < 193; k++) {
        this.table[p * 193 + k] /= sum;
      }
    }
  }

  push(x, emit) {
    this.r[this.count & 511] = Number.isFinite(x) ? Math.max(-8,Math.min(8,x)) : 0;
    this.count++;
    while (Math.floor(this.t / 24000) < this.count) {
      const pos = this.t / 24000;
      const b = Math.floor(pos);
      const phase = (pos - b) * 256;
      const p = Math.min(255, Math.floor(phase));
      const mix = phase - p;
      let y = 0;
      for (let k = 0; k < 193; k++) {
        if (b - k >= 0) {
          const h = this.table[p * 193 + k];
          const next = this.table[(p + 1) * 193 + k];
          y += this.r[(b - k) & 511] * (h + (next - h) * mix);
        }
      }
      emit(y);
      this.t += this.rate;
    }
  }
}

class RysNearExpander {
  constructor(o = {}) {
    this.reject = Number.isFinite(o.reject)?Math.max(.15,Math.min(.85,o.reject)):.5;
    this.continuousSpeech=!!o.continuousSpeech;
    this.leveler=!!o.leveler;
    this.lvlEnv=0;
    this.agcGain=1;
    this.outScale=this.leveler?0.92:0.8;
    this.hpX = 0;
    this.hpY = 0;
    this.lp = new Float64Array(3);
    this.e = new Float64Array(4);
    this.n = new Float64Array(4).fill(1e-7);
    this.a = [0.051, 0.2304, 0.6489];
    this.minima = new Float64Array(32).fill(Infinity);
    this.cur = new Float64Array(4).fill(Infinity);
    this.slot = 0;
    this.hops = 0;
    this.count = 0;
    this.age = 0;
    this.look = new Float32Array(240);
    this.li = 0;
    this.g = 1;
    this.hold = 0;
    this.toneEnergy=0;this.toneCorr=0;this.toneError=0;this.toneX1=0;this.toneX2=0;
    this.ready = false;
  }

  setProfile(o = {}) {
    if(o.continuousSpeech!==undefined)this.continuousSpeech=!!o.continuousSpeech;
    if(o.leveler!==undefined)this.leveler=!!o.leveler;
    if (Number.isFinite(o.reject)) {
      this.reject = Math.max(0.15, Math.min(0.85, o.reject));
    }
    if (o.resetLock) {
      this.age = 0;
      this.ready = false;
      this.minima.fill(Infinity);
      this.cur.fill(Infinity);
      this.hold = 0;
    }
  }

  step(raw) {
    raw=Number.isFinite(raw)?Math.max(-8,Math.min(8,raw)):0;
    const x = 0.9793 * (this.hpY + raw - this.hpX);
    this.hpX = raw;
    this.hpY = Math.abs(x)<1e-20?0:x;
    // A stationary sinusoid is predictable by a second-order recurrence.
    // Do not freeze its noise estimate as if it were sustained harmonic speech.
    this.toneEnergy+=.001*(x*x-this.toneEnergy);
    this.toneCorr+=.001*(x*this.toneX1-this.toneCorr);
    const cos=Math.max(-1,Math.min(1,this.toneCorr/(this.toneEnergy+1e-20)));
    const residual=x-2*cos*this.toneX1+this.toneX2;
    this.toneError+=.001*(residual*residual-this.toneError);
    this.toneX2=this.toneX1;this.toneX1=x;
    for (let k = 0; k < 3; k++) {
      this.lp[k] += this.a[k] * (x - this.lp[k]);
    }
    const b0 = this.lp[0];
    const b1 = this.lp[1] - b0;
    const b2 = this.lp[2] - this.lp[1];
    const b3 = x - this.lp[2];
    this.e[0] += 0.005 * (b0 * b0 - this.e[0]);
    this.e[1] += 0.005 * (b1 * b1 - this.e[1]);
    this.e[2] += 0.005 * (b2 * b2 - this.e[2]);
    this.e[3] += 0.005 * (b3 * b3 - this.e[3]);
    if (++this.count === 240) {
      this.count = 0;
      this.age += 0.01;
      // A speech interval must not become the next noise floor when minima rotate.
      const open=4.5+(this.reject-.5)*4;
      const speechLikely=this.ready&&this.hold>0&&this.toneError>this.toneEnergy*.0005;
      for (let k = 0; k < 4; k++) {
        this.cur[k] = Math.min(this.cur[k], this.e[k]);
        let c = this.cur[k];
        for (let j = 0; j < 8; j++) {
          c = Math.min(c, this.minima[j * 4 + k]);
        }
        const t = this.age < 0.4 ? this.e[k] : Math.max(1e-10, c * 1.4);
        const alpha = this.age < 0.4 ? 0.25 : t < this.n[k] ? 0.08 : 0.02;
        if(!speechLikely||t<this.n[k])this.n[k] += alpha * (t - this.n[k]);
      }
      if (++this.hops === 50) {
        this.hops = 0;
        for (let k = 0; k < 4; k++) {
          this.minima[this.slot * 4 + k] = this.cur[k];
          this.cur[k] = Infinity;
        }
        this.slot = (this.slot + 1) % 8;
      }
      this.ready = this.age >= 0.4;
      const e = this.e[1] + 1.3 * this.e[2] + 0.35 * this.e[3];
      const n = this.n[1] + 1.3 * this.n[2] + 0.35 * this.n[3] + 1e-12;
      const snr = 10 * Math.log10((e + 1e-12) / n);
      // 2 dB hysteresis stays above the measured stationary noise excess.
      const rumble = (this.e[1] + this.e[2]) / (this.e[0] + 1e-12) > 0.8;
      if (this.ready && rumble && snr > (this.hold ? open - 2 : open)) {
        this.hold = 24;
      } else if (this.hold) {
        this.hold--;
      }
    }
    const want = !this.ready || this.hold || this.continuousSpeech ? 1 : 0.126;
    this.g += (want - this.g) * (1 - Math.exp(-1 / (24000 * (want > this.g ? 0.003 : 0.12))));
    const d = this.look[this.li];
    this.look[this.li] = x;
    this.li = (this.li + 1) % 240;
    if (this.leveler && this.ready) {
      this.lvlEnv += (d * d - this.lvlEnv) * 0.0021;
      const rms = Math.sqrt(this.lvlEnv + 1e-12);
      if (this.hold > 0) {
        const wantAgc = rms > 0.004 ? Math.min(2.0, Math.max(0.38, Math.pow(0.11 / rms, 0.45))) : 1;
        this.agcGain += (wantAgc - this.agcGain) * (wantAgc < this.agcGain ? 0.0028 : 0.00018);
      } else if (this.continuousSpeech && rms > 0.11) {
        const wantAgc = Math.min(1.0, Math.max(0.38, Math.pow(0.11 / rms, 0.45)));
        this.agcGain += (wantAgc - this.agcGain) * (wantAgc < this.agcGain ? 0.0028 : 0.0004);
      } else {
        this.agcGain += (1 - this.agcGain) * 0.0004;
      }
    } else {
      this.agcGain += (1 - this.agcGain) * 0.0005;
    }
    const targetScale = this.leveler ? this.agcGain * 0.92 : 0.8;
    this.outScale += (targetScale - this.outScale) * 0.002;
    let y = d * this.g * this.outScale;
    if (Math.abs(y) > 0.85) {
      y = Math.sign(y) * (0.85 + 0.13 * Math.tanh((Math.abs(y) - 0.85) / 0.13));
    }
    return y;
  }
}

class RysCaptureKernel {
  constructor(rate, o = {}, emit = () => {}) {
    this.fir = new RysFir24(rate);
    this.gate = new RysNearExpander(o);
    this.muted = Boolean(o.muted);
    this.mg = this.muted ? 0 : 1;
    this.comfortFade=o.comfortFade!==false;this.comfortGain=1;this.quietSamples=0;
    this.comfortDelay=new Float32Array(72);this.comfortDelayPos=0;
    this.comfortRiseLength=48;this.comfortRisePos=48;this.comfortRiseFrom=1;this.comfortTarget=1;
    this.comfortRelease=1-Math.exp(-1/(24000*.080));
    this.frame = new Float32Array(480);
    this.offset = 0;
    this.sq = 0;
    this.time = 0;
    this.emit = emit;
    this.accept = (s) => {
      const v = this.gate.step(s);
      this.mg += ((this.muted ? 0 : 1) - this.mg) * 0.0083;
      const active=!this.gate.ready||this.gate.hold>0||this.gate.continuousSpeech;
      this.quietSamples=active?0:this.quietSamples+1;
      const want=(!this.comfortFade||active||this.quietSamples<=14400)?1:0;
      if(want!==this.comfortTarget){
        this.comfortTarget=want;
        if(want===1){this.comfortRiseFrom=this.comfortGain;this.comfortRisePos=0;}
      }
      if(want===1){
        if(this.comfortRisePos<this.comfortRiseLength){
          const w=.5-.5*Math.cos(Math.PI*(++this.comfortRisePos)/this.comfortRiseLength);
          this.comfortGain=this.comfortRiseFrom+(1-this.comfortRiseFrom)*w;
        }else this.comfortGain=1;
      }else this.comfortGain+=(0-this.comfortGain)*this.comfortRelease;
      if(want===0&&this.comfortGain<1e-6)this.comfortGain=0;
      const delayed=this.comfortDelay[this.comfortDelayPos];
      this.comfortDelay[this.comfortDelayPos]=v;
      this.comfortDelayPos=(this.comfortDelayPos+1)%this.comfortDelay.length;
      const y = delayed * this.mg * this.comfortGain;
      this.frame[this.offset++] = y;
      this.sq += y * y;
      if (this.offset === 480) {
        this.emit({
          type: 'frame',
          samples: this.frame,
          rms: Math.sqrt(this.sq / 480),
          gateOpen: !this.muted && (this.gate.hold > 0 || this.gate.continuousSpeech),
          ready: this.gate.ready,
          comfortSilent:this.comfortGain===0,
          capturedAt: this.time
        });
        this.frame = new Float32Array(480);
        this.offset = 0;
        this.sq = 0;
      }
    };
  }

  control(m) {
    if (m.type === 'set-mute') this.muted = Boolean(m.muted);
    if (m.type === 'set-profile') {
      this.gate.setProfile(m);
      if(m.comfortFade!==undefined)this.comfortFade=!!m.comfortFade;
    }
  }

  process(ch, time = 0) {
    for (let i = 0; i < ch.length; i++) {
      this.time = time + i / this.fir.rate;
      this.fir.push(ch[i], this.accept);
    }
  }
}

class RysPcmCaptureProcessor extends (globalThis.AudioWorkletProcessor || class {}) {
  constructor(o) {
    super();
    this.kernel = new RysCaptureKernel(
      sampleRate,
      o?.processorOptions || {},
      (m) => this.port.postMessage(m, [m.samples.buffer])
    );
    this.stopped=false;
    this.port.onmessage = (e) => {
      const message=e.data||{};
      if(message.type==='stop')this.stopped=true;
      else if(!this.stopped)this.kernel.control(message);
    };
  }

  process(inputs, outputs) {
    for (const c of outputs[0] || []) c.fill(0);
    if(this.stopped)return false;
    const ch = inputs[0]?.[0];
    if (ch) this.kernel.process(ch, currentTime);
    return true;
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor('rys-pcm-capture', RysPcmCaptureProcessor);
}

globalThis.RysFir24 = RysFir24;
globalThis.RysNearExpander = RysNearExpander;
globalThis.RysCaptureKernel = RysCaptureKernel;

export { RysFir24, RysNearExpander, RysCaptureKernel };
