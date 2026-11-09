// PATCH: player-v53
// PATCH: player-v52
// PATCH: player-v51
// PATCH: player-v50
// RıdvanSes v50 — Sıra Numarası (Seq) Tabanlı Jitter Tamponu, 48..400 Lag Pitch-PLC ve ±1000 ppm Hermite ASRC Oynatıcı
const RYS_MOD = 0x80000000;
function rysDiff(a, b) {
  return ((a - b + 0x40000000) & 0x7fffffff) - 0x40000000;
}

// v60: anti-alias the 24kHz source before rendering below 24kHz.
class RysOutputFir {
  constructor(rate){
    this.r=new Float32Array(256);this.h=new Float64Array(193);this.pos=0;
    const fc=.45*rate/24000;let sum=0;
    for(let k=0;k<193;k++){
      const d=k-96,w=.42-.5*Math.cos(2*Math.PI*k/192)+.08*Math.cos(4*Math.PI*k/192);
      const h=(d===0?2*fc:Math.sin(2*Math.PI*fc*d)/(Math.PI*d))*w;
      this.h[k]=h;sum+=h;
    }
    for(let k=0;k<193;k++)this.h[k]/=sum;
  }
  step(x){
    this.r[this.pos]=x;let y=0;
    for(let k=0;k<193;k++)y+=this.h[k]*this.r[(this.pos-k+256)&255];
    this.pos=(this.pos+1)&255;return y;
  }
}

class RysPitchPlc {
  constructor() {
    this.r = new Float32Array(2048);
    this.w = 0;
    this.used = 0;
    this.p = new Float32Array(400);
    this.length = 0;
    this.pos = 0;
    this.lost = 0;
    this.last = 0;
  }

  append(a) {
    for (const x of a) {
      this.r[this.w] = x;
      this.w = (this.w + 1) & 2047;
      this.used = Math.min(2048, this.used + 1);
      this.last = x;
    }
    this.lost = 0;
  }

  at(back) {
    return this.r[(this.w - back + 2048) & 2047];
  }

  begin() {
    let best = -1;
    let lagBest = 0;
    if (this.used >= 880) {
      for (let lag = 48; lag <= 400; lag += 2) {
        let xy = 0;
        let xx = 0;
        let yy = 0;
        for (let k = 1; k <= 240; k += 4) {
          const a = this.at(k);
          const b = this.at(k + lag);
          xy += a * b;
          xx += a * a;
          yy += b * b;
        }
        const c = xy / Math.sqrt(xx * yy + 1e-20);
        if (c > best) {
          best = c;
          lagBest = lag;
        }
      }
    }
    this.length = best > 0.65 ? lagBest : 0;
    this.pos = 0;
    for (let i = 0; i < this.length; i++) {
      this.p[i] = this.at(this.length - i);
    }
  }

  fill(out) {
    if (!this.lost) this.begin();
    const correction = this.last - (this.length ? this.p[0] : 0);
    for (let i = 0; i < out.length; i++) {
      const age = this.lost + i;
      const g = age < 1440 ? 0.5 + 0.5 * Math.cos((Math.PI * age) / 1440) : 0;
      const b = age < 120 ? 0.5 + 0.5 * Math.cos((Math.PI * age) / 119) : 0;
      out[i] = ((this.length ? this.p[this.pos++ % this.length] : 0) + correction * b) * g;
    }
    this.lost += out.length;
  }
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
    this.stats = { late: 0, duplicate: 0, concealed: 0, resync: 0, queueDropped:0, catchupDropped:0 };
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
    this.rxFir=this.rate<24000?new RysOutputFir(this.rate):null;
    this.plc = new RysPitchPlc();
    this.plcFrame = new Float32Array(480);
    this.recoveryFrame=new Float32Array(480);this.continuation=new Float32Array(480);
    this.pendingQueueBlend=false;this.catchupAge=0;this.catchupArmed=false;
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
    if(!(m?.samples instanceof Float32Array)||m.samples.length!==480||!Number.isInteger(m.seq)||
      m.seq<0||m.seq>=RYS_MOD||!Number.isFinite(m.arrival))return;
    for(const x of m.samples)if(!Number.isFinite(x))return;
    if(this.expected===null)this.expected=m.seq;
    let d=rysDiff(m.seq,this.expected);
    if(d<0&&!this.playing&&d>=-12){this.expected=m.seq;d=0;}
    if(d<0){this.stats.late++;return;}
    if(this.q.has(m.seq)){this.stats.duplicate++;return;}
    // Large discontinuities or an isolated far-future packet still require a new buffer anchor.
    if(d>128||(d>32&&this.q.size<24)){
      this.stats.resync++;this._reset();this.expected=m.seq;
    }
    if(this.lastArrival!==null&&this.lastSeq!==null){
      const ds=rysDiff(m.seq,this.lastSeq);
      if(ds>0&&ds<32){
        const delta=Math.abs((m.arrival-this.lastArrival)/1000-ds*.020);
        this.jitter+=(Math.min(.5,delta)-this.jitter)/16;
        const wanted=Math.max(.080,Math.min(.260,.060+4*this.jitter));
        this.target+=(wanted-this.target)*(wanted>this.target ? .25 : .002);
      }
    }
    this.lastArrival=m.arrival;this.lastSeq=m.seq;this.q.set(m.seq,m.samples);
    if(this.q.size>32){
      const keys=Array.from(this.q.keys()).sort((a,b)=>rysDiff(a,this.expected)-rysDiff(b,this.expected));
      const remove=keys.length-24;
      for(let i=0;i<remove;i++)this.q.delete(keys[i]);
      this.expected=keys[remove];this.stats.queueDropped+=remove;
      // Preserve current frame/phase. Blend at the next source frame boundary.
      this.pendingQueueBlend=this.playing&&this.haveHistory;
    }
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
    if(this.catchupArmed){
      this.catchupArmed=false;
      const keep=Math.ceil(this.target/.020)+2;
      const keys=Array.from(this.q.keys()).sort((a,b)=>rysDiff(a,this.expected)-rysDiff(b,this.expected));
      const remove=Math.max(0,keys.length-keep);
      if(remove){
        for(let i=0;i<remove;i++)this.q.delete(keys[i]);
        this.expected=keys[remove];this.stats.catchupDropped+=remove;
        this.pendingQueueBlend=this.haveHistory;
      }
    }
    const packet=this.q.get(this.expected);this.q.delete(this.expected);
    this.expected=(this.expected+1)%RYS_MOD;this.fi=0;
    if(packet){
      const recovery=this.haveHistory&&(this.missing>0||this.pendingQueueBlend);this.pendingQueueBlend=false;
      if(recovery){
        // Predict the next PLC samples before replacing its state with real media.
        this.plc.fill(this.continuation);this.recoveryFrame.set(packet);
        for(let i=0;i<72;i++){
          const w=.5-.5*Math.cos(Math.PI*i/71);
          this.recoveryFrame[i]=(1-w)*this.continuation[i]+w*packet[i];
        }
        this.frame=this.recoveryFrame;
      }else this.frame=packet;
      this.missing=0;this.history.set(packet);this.haveHistory=true;this.plc.append(packet);
    }else{
      this.missing++;this.stats.concealed+=480;this.plc.fill(this.plcFrame);this.frame=this.plcFrame;
    }
  }

  _pull() {
    if (this.fi >= 480) this._nextFrame();
    const x=this.frame[this.fi++];
    return this.rxFir?this.rxFir.step(x):x;
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
    // Ppm drift correction cannot drain a sustained network backlog promptly.
    if(this.q.size*.020>this.target+.120){
      this.catchupAge+=n/this.rate;
      if(this.catchupAge>=.500){this.catchupArmed=true;this.catchupAge=0;}
    }else this.catchupAge=0;
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
      this.haveHistory = false;this.missing=0;this.pendingQueueBlend=false;this.catchupAge=0;this.catchupArmed=false;this.plc=new RysPitchPlc();
      this.rxFir=this.rate<24000?new RysOutputFir(this.rate):null;
      this.resetFrom = this.lastOut;
      this.resetFade = 0;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return true;
  }
}

registerProcessor('rys-pcm-player', RysPcmPlayerProcessor);
