# AUDIO EXCELLENCE REPORT — v52 doğrulama ve v53 ince ayar denetimi

8 Kasım 2026. Git HEAD `3d33d09b43a733309d8d882efaa9137c254340e6`. Mevcut kaynaklar değiştirilmedi; tek çıktı bu rapordur. Kod yamaları öneridir, uygulanmış sayılmaz.

## 1. Doğrulanan v52 durumu

**İstenen komut doğrudan diskte çalıştırıldı: 24/24 PASS + V52 PASS, exit 0.** Test rapor metnini okumadan çalışıyor. Canlı localhost Express/ws, binary/JSON seq=0 ve batch/bozuk frame kontrolü dahil önceki testler geçti. Test runtime snapshot'ını geri yazdı.

| Hat | Doğrulama | Sınır |
|---|---|---|
| Yakalama | 193 tap SRC, finite korumalar, 480 örnek, 128==2048 kernel, UI profili aktarımı | Gerçek fonem/SPL/çift konuşma ayrıştırma kanıtı değil |
| Oynatım | 32→24 budama, seq wrap/reorder/dedup, 72 kaynak örneklik continuation overlap | İlk oynatım öncesi geçmişsiz blend ayrı incelendi |
| Relay/fanout | 100 ms poll, yerel 200 ms TTL, ayrı queue sınırları, kısa drop/ağır terminate | WAN/broker/roaming sürekliliği garantisi değil |
| İstemci yaşam döngüsü | Context token, pending TTL, gesture/WakeLock/pause testleri | Gerçek iOS/Android arama/kilit testi değil |
| Bağımsız test | Step5 gerçek disk kaynak sembollerini okuyor | Test kapsamı dışında hata bulunamayacağı anlamına gelmez |

**Sıfır-hata onayı verilmiyor:** aşağıdaki yeni karşı örnekler mevcut testlerin kapsamadığı koşullardır. 85–95 dB SPL'yi mikrofon kalibrasyonu olmadan dBFS'ye çevirmek veya tek kanallı VAD ile üst üste konuşmaları %100 ayırmak mümkün değildir. Yakın boom mikrofon/rüzgarlık ve hacılarda kulaklık temel önlemdir.

## 2. Bulgular ve soruların doğrudan yanıtları

| Önem | Kaynak | Bulgular |
|---|---|---|
| P1 | public/pcm-capture-worklet.js:157–173 | Comfort attack 3 ms üstel; 10 ms sonra 1 değil ~.9643. VAD 10 ms hop ve enerji EMA nedeniyle ilk foneme kalan ön süre daha az olabilir. |
| P1 | public/pcm-player-worklet.js:159–166,177–194 | Ön tamponda history yokken pendingQueueBlend=true kalır; sıfır continuation ilk 72 örneği ayrıca zayıflatır. Standart 5 ms startup fade de vardır. |
| P1 | public/pcm-player-worklet.js:286–296 | Uzun açlık sonrası haveHistory=false yapılırken eski PLC r/used geçmişi kalıyor; tekrar başlangıçta eski pitch geçmişi kullanılabilir. |
| P1 | public/vercel-ws-shim.js:325–362 | Failback TCP open anında yapılır; room/auth ACK beklenmez. Kısmi batch daha sonra native JSON yoluna gidebilir; doğrudan her zaman kayboluyor demek yanlış, fakat geçiş güvencesi yok. App onopen çağrılmadığı için live metadata/admin/family aboneliği yenilenmeyebilir. |
| P1 | server.js:1344–1379 | Relay auth flag'leri yalnız true'ya set ediliyor; mevcut guide HTTP session'ı sonraki geçersiz/yok token isteğinde yetkili kalabilir. joinContext, mevcut currentRoom varsa değişik odaya uygulanmıyor. |
| P2 | public/rehber.html:1268–1297 | Kısmi set-profile bayrakları **sıfırlamıyor**. Ancak gönderimin tek merkezden yapılması reset/UI tutarlılığı için daha iyi. reset açıklaması 400 ms susma kalibrasyonuyla çelişiyor. |
| P2 | public/rehber.html:1571–1745 | Eski processGuideFloatChunkDsp ve RMS-AES state ölü. Aktif graph/reset içindeki eski state referansları birlikte temizlenmeli. |
| P2 | public/dinle.html:1583–1696 | Bekleyen veri rebuild'de bilinçli olarak atılır; seq sender'da sürer ama player yeniden anchor/prebuffer yapar. Kesintisiz korunuyor denemez; bayat sesi saklamak da doğru çözüm değil. |

### 2.1 Comfort-fade matematiği

Kapalı durumdan açılmada g(t)=1−exp(−t/3ms): 3 ms'de .6321, 6 ms'de .8647, 10 ms'de .9643 (-.315 dB). İç expander .126'dan aynı τ ile açılıyorsa 10 ms'de .9688, ikisinin çarpımı yaklaşık .9342 (-.59 dB). Bu değerler **VAD açılma anından itibaren**; VAD ilk 10 ms hop sonunda karar verirse 10 ms lookahead'in tamamı attack'a kalmayabilir. İlk hecenin doğal ünsüz enerjisi ve VAD gecikmesi ayrı test edilmelidir.

V53 yalnız comfort katmanında 48 örnek/2 ms sonlu raised-cosine açılma ve her zaman etkin 72 örnek/3 ms ek waveform gecikmesi kullanır. İki profil arasında gecikme değiştirilmez. Koşul: VAD ile waveform arasında en az 2 ms ön süre varsa comfort gain tam 1 olur. Ek gecikme +3 ms'dir; iç expander'ın kendi attack'ı ve yanlış/çok geç VAD kararı çözülmüş sayılmaz. [Web Audio](https://www.w3.org/TR/webaudio/) zaman/render API sözleşmesidir; fonem anlaşılabilirliği sertifikası değildir.

### 2.2 Profil, temizleme ve kurtarma

setProfile yalnız verilen reject/continuousSpeech alanlarını değiştirir; kernel comfortFade için de undefined kontrolü yapar. reject/reset çağrısı mevcut iki tercihi korur; buna karşı bir sıfırlama hatası raporlanmıyor. V53 syncGuideAudioProfile(resetLock) üzerinden tam profil gönderir. Reset kalibrasyonu 400 ms boyunca konuşmadan beklemeyi açıkça anlatır.

Eski DSP bölümü yalnız tanımdır; canlı handler frame nesnesini alır. Temizlikte o bölgedeki guideWasIdlePaused/lastGuideMicChunkAt ve canlı BroadcastChannel referansı korunur. Eski graph reset atamaları kaldırılır. Receiver rebuild, pendingRxFrames ve worklet queue'yu bilerek temizler; yeni kaynaklardan gelen ilk seq anchor olur. rxLoadToken eski promise'in yeni context'i ele geçirmesini önler. 13 frame/260 ms pending sınırı canlı sesin başlangıcını kaybettirebilir; bu sınırlı gecikme politikasıdır. Arama sırasında erişilemeyen gerçek kelimeler geri üretilemez.

### 2.3 Coalescing ve failback

Native başlangıçta JSON PCM biriktirilmediğinden ilk native→relay geçişinde normalde kısmi coalescer yoktur. Relay→native failback'te 1–2 frame varsa v52 timer sonradan native send'e düşebilir; fakat öncesinde join/auth ACK alınmış değildir ve metadata yenilenmez. V53 eski yolu ACK'e kadar korur, doğru oda/abonelik ACK'i alınca app onopen ile join/live state'i yeniler, yalnız taze kuyruk/kısmi batch'i yeni native yoluna aktarır, sonra MQTT'yi kapatır. >120 ms partial veya >200 ms queued medya yine bilinçli atılır. Kaynak/oda değişmişse eski odaya ait ses yeni odaya taşınmaz.

Buna rağmen “kayıpsız failback” garantisi verilmez. Probe/ACK gecikirken eski yol da çökmüş olabilir; mevcut v1 frame stream-id/media timestamp taşımıyor. In-flight kontrolün sonucu belirsizse replay çift etki yapabilir; kalıcı kontrol ACK/idempotency sistemi ayrı gereksinimdir. Callback, closed flag ve generation korumaları geçiş yarışını sınırlar.

### 2.4 HTTP session, batch ve yetki

Coalesced frames mevcut wrapper tarafından 1–3 ayrı 480 örnek frame'e ayrılır; outbox tekil frame tutar, drain yerel 200 ms TTL uygular. Bu doğru. V53 batch biçimini değiştirmez. Fakat auth her HTTP isteğinde yeniden hesaplanmalı; guide/admin session'ı geçersiz token ile kullanılamamalı. Oda değişikliği header joinContext ile gelirse önce yeni odaya katılım/PIN doğrulanmalı; başarısızsa audio eski odada işlenmemeli. Yeni helper ve POST/GET blokları bu sınırı ekler. Bu, native açık WS oturumlarının token iptali veya public broker ACL sorunlarını da çözdüğü anlamına gelmez. Herkese açık relay clientId tam bir erişim denetimi tasarımı değildir.

## 3. Tam v53 yamaları

Aşağıdaki kodlar mevcut v52 API'sini korur; gerçek paket DTX, yeni codec veya stream-id eklemez. [Opus RFC 6716](https://www.rfc-editor.org/rfc/rfc6716.html) üretim codec/PLC/FEC için ayrı mimari referanstır. Kaybolan konuşmayı “sıfır kopma” diye yeniden adlandırmak yerine drop/conceal/rebuffer ölçülmelidir.


### public/pcm-capture-worklet.js — tamamı

Yeni 3 ms delay comfortFade kapalıyken de korunur; profil değişiminde faz/zaman sıçraması yaratılmaz.

```js
// PATCH: capture-v53
// PATCH: capture-v52
// PATCH: capture-v51
// PATCH: capture-v50
// RıdvanSes v50 — Gerçek Zamanlı AudioWorklet Yakalama Motoru
// 193-Tap 256-Faz Blackman Windowed-Sinc Polyphase Anti-Aliasing FIR (RysFir24 — >-118 dB Stopband)
// + 400ms Kalibrasyon ve 4s Rolling Minima Tabanlı 4-Bant Yakın-Alan Ses Kilidi (RysNearExpander)
// + Worklet & ScriptProcessor Ortak 480-Örnek (20 ms @ 24 kHz) Çekirdeği (RysCaptureKernel)

class RysFir24 {
  constructor(rate) {
    if(!Number.isFinite(rate)||rate<8000||rate>192000)throw new RangeError('Invalid input rate');
    this.rate = rate;
    this.t = 0;
    this.count = 0;
    this.r = new Float32Array(512);
    this.table = new Float32Array(256 * 193);
    const fc = Math.min(10200 / rate, 0.45);
    for (let p = 0; p < 256; p++) {
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
      const p = Math.min(255, Math.floor((pos - b) * 256));
      let y = 0;
      for (let k = 0; k < 193; k++) {
        if (b - k >= 0) {
          y += this.r[(b - k) & 511] * this.table[p * 193 + k];
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
    this.g = 0.126;
    this.hold = 0;
    this.ready = false;
  }

  setProfile(o = {}) {
    if(o.continuousSpeech!==undefined)this.continuousSpeech=!!o.continuousSpeech;
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
      for (let k = 0; k < 4; k++) {
        this.cur[k] = Math.min(this.cur[k], this.e[k]);
        let c = this.cur[k];
        for (let j = 0; j < 8; j++) {
          c = Math.min(c, this.minima[j * 4 + k]);
        }
        const t = this.age < 0.4 ? this.e[k] : Math.max(1e-10, c * 1.4);
        const alpha = this.age < 0.4 ? 0.25 : t < this.n[k] ? 0.08 : 0.02;
        this.n[k] += alpha * (t - this.n[k]); // independent of gate/hold
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
      const open = 7.5 + (this.reject - 0.5) * 4;
      const rumble = (this.e[1] + this.e[2]) / (this.e[0] + 1e-12) > 0.8;
      if (this.ready && rumble && snr > (this.hold ? open - 4 : open)) {
        this.hold = 24;
      } else if (this.hold) {
        this.hold--;
      }
    }
    const want = this.ready && (this.hold || this.continuousSpeech) ? 1 : 0.126;
    this.g += (want - this.g) * (1 - Math.exp(-1 / (24000 * (want > this.g ? 0.003 : 0.12))));
    const d = this.look[this.li];
    this.look[this.li] = x;
    this.li = (this.li + 1) % 240;
    let y = d * this.g * 0.8;
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
      const active=this.gate.ready&&(this.gate.hold>0||this.gate.continuousSpeech);
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
    this.port.onmessage = (e) => this.kernel.control(e.data || {});
  }

  process(inputs, outputs) {
    for (const c of outputs[0] || []) c.fill(0);
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

```


### public/pcm-player-worklet.js — tamamı

Geçmişsiz warmup blend’i atlanır; gerçek PLC recovery aynı 72 örnek continuation yöntemini korur. Uzun açlıkta PLC history yeniden başlatılır.

```js
// PATCH: player-v53
// PATCH: player-v52
// PATCH: player-v51
// PATCH: player-v50
// RıdvanSes v50 — Sıra Numarası (Seq) Tabanlı Jitter Tamponu, 48..400 Lag Pitch-PLC ve ±1000 ppm Hermite ASRC Oynatıcı
const RYS_MOD = 0x80000000;
function rysDiff(a, b) {
  return ((a - b + 0x40000000) & 0x7fffffff) - 0x40000000;
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
    this.stats = { late: 0, duplicate: 0, concealed: 0, resync: 0, queueDropped:0 };
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
    this.plc = new RysPitchPlc();
    this.plcFrame = new Float32Array(480);
    this.recoveryFrame=new Float32Array(480);this.continuation=new Float32Array(480);
    this.pendingQueueBlend=false;
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
      this.haveHistory = false;this.missing=0;this.pendingQueueBlend=false;this.plc=new RysPitchPlc();
      this.resetFrom = this.lastOut;
      this.resetFade = 0;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return true;
  }
}

registerProcessor('rys-pcm-player', RysPcmPlayerProcessor);

```


### public/rehber.html — sync/reject/reset tam fonksiyonları

Mevcut bu üç fonksiyonu değiştirin. guideContinuousSpeech/guideComfortFade değişkenleri ve setGuideContinuousSpeech/setGuideComfortFade fonksiyonları kalır.

```js
// PATCH: guide-profile-v53
function syncGuideAudioProfile(resetLock=false){
  const speech=document.getElementById('guideContinuousSpeech'),comfort=document.getElementById('guideComfortFade');
  const status=document.getElementById('guideProfileStatus');
  if(speech)speech.checked=guideContinuousSpeech;if(comfort)comfort.checked=guideComfortFade;
  if(status)status.textContent=guideContinuousSpeech?'Uzun okuma açık; çevre sesi de geçebilir.':
    (guideComfortFade?'Dengeli profil; cümle sonrası dip ses yumuşar.':'Dengeli profil; ortam tabanı korunur.');
  try{scriptProcessor?.port?.postMessage({type:'set-profile',reject:guideSideVoiceRejectLevel,
    continuousSpeech:guideContinuousSpeech,comfortFade:guideComfortFade,resetLock:!!resetLock});}
  catch(e){console.warn('Profil sonraki mikrofon kurulumunda uygulanacak',e);}
}
function updateGuideSideVoiceReject(val){
  const num=Math.max(15,Math.min(85,Number(val)||50));guideSideVoiceRejectLevel=num/100;
  const label=document.getElementById('guideSideVoiceRejectLabel');
  if(label)label.textContent='%'+num+' ('+(num>=70?'Güçlü':num<=30?'Hafif':'Dengeli')+')';
  syncGuideAudioProfile();
}
function resetGuideVoiceLock(){
  syncGuideAudioProfile(true);
  const box=document.getElementById('voiceTestStatusBox');
  if(box){box.style.display='block';box.textContent='Ortam yeniden ölçülüyor: ilk 400 ms konuşmadan bekleyin. Uzun okuma ve dip ses tercihleri korunur.';}
}
```


### public/rehber.html — ölü DSP/state yerine tam blok

let guideGateEnv tanımından başlayıp guide-handler-v51 yorumunun hemen öncesine kadar bölümü bununla değiştirin. Aşağıdaki graph yaması ve reset fonksiyonu birlikte uygulanmalı; kalan eski ad referansı olmamalı.

```js
// PATCH: guide-state-v53
let guideWasIdlePaused=true;
let lastGuideMicChunkAt=0;
let guideAudioGuardChannel=null;
try{if(typeof BroadcastChannel!=='undefined')guideAudioGuardChannel=new BroadcastChannel('ridvanses_audio_guard');}catch(e){}
```


### public/rehber.html — setupGuideMicrophoneGraph tamamı



```js
// PATCH: guide-graph-v53
async function setupGuideMicrophoneGraph() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx) {
        try {
          audioCtx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: 48000 });
        } catch {
          audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
        }
        audioCtx.onstatechange = () => {
          if ((isMicBroadcasting || isVoiceLoopbackTesting) && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
            audioCtx.resume().catch(() => {});
          }
        };
      }
      if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
        await audioCtx.resume();
      }

      // ÖNEMLİ: Donanım Akustik Yankı İptali (echoCancellation: true) telefonun yönlü (beamforming) mikrofonunu
      // aktif eder ve hoparlörden dönen yankıyı donanımda siler; noiseSuppression ve autoGainControl ise
      // tiz harfleri boğuklaştırmaması ve Kâbe kalabalık sesini yükseltmemesi için %100 KAPALI (false) tutulur!
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: 48000
          }
        });
      } catch (strictErr) {
        console.warn('Gelişmiş mikrofon ayarı kabul edilmedi, temel ses kullanılıyor:', strictErr);
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Gelen telefon araması veya Bluetooth/yaka mikrofonu çıkması durumunda otomatik mikrofon kurtarma (Auto-Heal)
      const audioTrack = micStream && micStream.getAudioTracks ? micStream.getAudioTracks()[0] : null;
      if (audioTrack) {
        audioTrack.onended = () => {
          if (isMicBroadcasting && !isHealingGuideMic) {
            console.warn('🔄 [Rehber Mikrofon] Mikrofon izi kesildi (arama/kulaklık değişimi), 300ms içinde otomatik kurtarılıyor...');
            setTimeout(() => healGuideMicrophoneIfNeeded(), 300);
          }
        };
      }

      disconnectGuideAudioNodes();
      const source = audioCtx.createMediaStreamSource(micStream);
      guideSourceNode = source;

      // 1. Rüzgar ve Mekanik Dip Uğultu Kesici (85 Hz Butterworth High-Pass — Web Audio Q birimi dB: -3.0103)
      const highPass = audioCtx.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 85;
      highPass.Q.value = -3.0103;
      guideHighPassNode = highPass;

      // 2. Yakın Mikrofon Boğukluk / Kutu Sesi Giderici (210 Hz -2.5 dB Mud Cut — Sesteki boğukluğu temizler)
      const mudCut = audioCtx.createBiquadFilter();
      mudCut.type = 'peaking';
      mudCut.frequency.value = 210;
      mudCut.Q.value = 1.2;
      mudCut.gain.value = -2.5;
      guideMudCutNode = mudCut;

      // 3. Stüdyo Konuşma ve Ünsüz Harf Netleştirici (3200 Hz +2.0 dB Presence — Yankı döngü kazancını şişirmeden harfleri netleştirir)
      const presence = audioCtx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 3200;
      presence.Q.value = 0.85;
      presence.gain.value = 2.0;
      guidePresenceNode = presence;

      // 4. Geniş-Bant Kristal HD Tiz Sınırı (10500 Hz Butterworth Low-Pass — Web Audio Q birimi dB: -3.0103)
      const lowPass = audioCtx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 10500;
      lowPass.Q.value = -3.0103;
      guideLowPassNode = lowPass;

      // 5. Rehber Mikrofon Kazancı (Gain — Varsayılan %100 / 1.0 Doğal Gür Ses)
      guideMicGainNode = audioCtx.createGain();
      guideMicGainNode.gain.value = guideMicGainMultiplier;

      zeroGainNode = audioCtx.createGain();
      zeroGainNode.gain.value = 0;

      source.connect(highPass);
      highPass.connect(mudCut);
      mudCut.connect(presence);
      presence.connect(lowPass);
      lowPass.connect(guideMicGainNode);

      guideWasIdlePaused = true;

      lastGuideMicChunkAt = Date.now();
      const ctx = audioCtx;
      const url = "/pcm-capture-worklet.js?v=53-audio";
      if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        try {
          await ctx.audioWorklet.addModule(url);
          if (audioCtx !== ctx) throw Error('Eski bağlam');
          scriptProcessor = new AudioWorkletNode(ctx, 'rys-pcm-capture', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            processorOptions: {
              muted: isGuideMicMuted,
              reject: guideSideVoiceRejectLevel,
              continuousSpeech:guideContinuousSpeech,comfortFade:guideComfortFade
            }
          });
          scriptProcessor.port.onmessage = (e) => {
            if (audioCtx === ctx) handleGuideMicFloatChunk(e.data);
          };
        } catch (e) {
          console.warn(e);
          scriptProcessor = null;
        }
      }
      if (!scriptProcessor) {
        const { RysCaptureKernel } = await import(url);
        if (audioCtx !== ctx) throw Error('Eski bağlam');
        const k = new RysCaptureKernel(
          ctx.sampleRate,
          { muted: isGuideMicMuted, reject: guideSideVoiceRejectLevel,continuousSpeech:guideContinuousSpeech,comfortFade:guideComfortFade },
          handleGuideMicFloatChunk
        );
        scriptProcessor = ctx.createScriptProcessor(2048, 1, 1);
        scriptProcessor.port = { postMessage: (m) => k.control(m) };
        scriptProcessor.onaudioprocess = (e) => {
          if(audioCtx!==ctx)return;
          const data=e.inputBuffer.getChannelData(0);
          const estimatedStart=Math.max(0,ctx.currentTime-data.length/ctx.sampleRate);
          k.process(data,estimatedStart);
        };
      }
      guideMicGainNode.connect(scriptProcessor);
      scriptProcessor.connect(zeroGainNode);
      zeroGainNode.connect(ctx.destination);
      syncGuideAudioProfile();
    }
```


### public/vercel-ws-shim.js — send tamamı

Join/abonelik generation kaydedilir; farklı odaya geçişte eski medyanın yeni odaya sızması engellenir.

```js
// PATCH: shim-send-v53
send(data) {
      if (
        (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) ||
        (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(data))
      ) {
        if (!this._isRelay && this._native && this._native.readyState === 1) {
          this._native.send(data);
        }
        return;
      }

      let parsed = null;
      try {
        parsed = typeof data === 'string' ? JSON.parse(data) : data;
      } catch {}

      if (parsed && typeof parsed === 'object') {
        if (!parsed._msgId) {
          parsed._msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        }
        if (parsed.type === 'join') {
          const old=this._joinContext;
          if(old&&(old.tourCode!==parsed.tourCode||old.roomId!==parsed.roomId||old.role!==parsed.role)){
            this._audioCoalescer?.clear();this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk');
          }
          this._subscriptionType='join';this._transportGeneration=(this._transportGeneration||0)+1;
          this._joinContext = parsed;
          if (this._isRelay) this._initMqttBus(parsed, false);
        } else if (parsed.type === 'family-subscribe') {
          this._subscriptionType='family-subscribe';this._transportGeneration=(this._transportGeneration||0)+1;
          this._joinContext = {
            type: 'join',
            role: 'pilgrim',
            tourCode: parsed.tourCode || 'RY-KASIM',
            roomId: 'genel',
            name: 'Aile Takipçisi'
          };
          if (this._isRelay) this._initMqttBus(this._joinContext, false);
        } else if (parsed.type === 'admin-subscribe') {
          this._subscriptionType='admin-subscribe';this._transportGeneration=(this._transportGeneration||0)+1;
          this._isAdmin = true;
          if (this._isRelay) this._initMqttBus(null, true);
        }
      }

      if (!this._isRelay) {
        if (this._native && this._native.readyState === 1) {
          this._native.send(typeof parsed === 'object' ? JSON.stringify(parsed) : data);
        }
        return;
      }

      if (!parsed) return;

      if (this._joinContext && this._joinContext.role === 'guide') {
        if (parsed.type === 'audio-chunk') {
          this._publishMqtt({
            ...parsed,
            speakerRole: 'guide',
            speakerName: this._joinContext.name || 'Ömer Ali Gültekin'
          });
        } else if (parsed.type === 'guide-location-update') {
          if (parsed.active === false) {
            this._guideLocation = {
              active: false,
              updatedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
          } else {
            this._guideLocation = {
              active: true,
              lat: Number(parsed.lat),
              lng: Number(parsed.lng),
              accuracy: parsed.accuracy || null,
              address: parsed.address || '',
              note: parsed.note || 'Kafile Toplanma / Rehber Konumu',
              guideName: this._joinContext.name || 'Rehber Hoca',
              updatedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
          }
          const locPayload = {
            _msgId: parsed._msgId,
            type: 'guide-location',
            guideLocation: this._guideLocation
          };
          this._publishMqtt(locPayload);
          this._broadcastP2PRoomState();
        } else if (parsed.type === 'quick-announcement') {
          const annPayload = {
            _msgId: parsed._msgId,
            type: 'new-announcement',
            announcement: {
              id: 'ann-' + Date.now(),
              tourCode: this._joinContext.tourCode,
              title: parsed.title || 'Rehber Duyurusu',
              message: parsed.message || '',
              sender: this._joinContext.name || 'Rehber Hoca',
              createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              urgent: true
            }
          };
          this._publishMqtt(annPayload);
          this._deliverIncomingMessage(annPayload);
        } else if (parsed.type === 'guide-stream-state') {
          if (typeof parsed.isLive !== 'undefined') this._isLive = Boolean(parsed.isLive);
          this._broadcastMode = parsed.broadcastMode || (this._isLive ? 'mic' : 'idle');
          if (parsed.topic) this._currentTopic = parsed.topic;
          this._publishMqtt({
            _msgId: parsed._msgId,
            type: 'stream-state',
            isLive: this._isLive,
            broadcastMode: this._broadcastMode,
            currentTopic: this._currentTopic,
            guidePeerId: window.ryGetDynamicChannelId(
              this._joinContext.tourCode || 'RY-KASIM',
              this._joinContext.roomId || 'genel'
            )
          });
          this._broadcastP2PRoomState();
        } else if (parsed.type === 'tawaf-stage-update') {
          if (parsed.clear) {
            this._activeTawafStage = null;
          } else {
            this._activeTawafStage = {
              id: parsed.stageId || 'savt-1',
              badge: parsed.badge || 'TAVAF AŞAMASI',
              title: parsed.title || 'Tavaf & Sa’y Rehberliği',
              arabic: parsed.arabic || '',
              reading: parsed.reading || '',
              meaning: parsed.meaning || '',
              note: parsed.note || '',
              updatedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            };
            if (parsed.topic) this._currentTopic = parsed.topic;
          }
          this._publishMqtt({
            _msgId: parsed._msgId,
            type: 'tawaf-stage',
            activeTawafStage: this._activeTawafStage,
            currentTopic: this._currentTopic
          });
          this._broadcastP2PRoomState();
        }
      } else {
        if (parsed.type === 'sos-trigger') {
          const enrichedSos = {
            ...parsed,
            alertId: 'sos-' + Date.now(),
            tourCode: (this._joinContext && this._joinContext.tourCode) || 'RY-KASIM',
            pilgrimName: (this._joinContext && this._joinContext.name) || 'Hacı Misafir',
            phone: (this._joinContext && this._joinContext.phone) || '+90 538 399 96 66'
          };
          this._publishMqtt(enrichedSos);
          // Global SOS kanalına da yayınla ki Rehber/Acente hangi sekmede olursa olsun anında görsün!
          this._publishMqtt({
            _msgId: parsed._msgId,
            type: 'sos-alert',
            alert: {
              id: enrichedSos.alertId,
              tourCode: enrichedSos.tourCode,
              pilgrimName: enrichedSos.pilgrimName,
              phone: enrichedSos.phone,
              lat: Number(parsed.lat),
              lng: Number(parsed.lng),
              accuracy: parsed.accuracy || null,
              locationNote: parsed.locationNote || 'Canlı Cihaz GPS Konumu',
              createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              status: 'active'
            }
          }, GLOBAL_SOS_TOPIC);
        } else {
          this._publishMqtt({
            ...parsed,
            name: (this._joinContext && this._joinContext.name) || 'Hacı Misafir'
          });
        }
      }

      // MQTT WSS bağlıyken ses paketlerini (audio-chunk) yavaş HTTP /api/ws-relay kuyruğuna sokma (ağ tıkanıklığını ve 450ms gecikmeli çift paketi önler)
      if (parsed.type === 'audio-chunk' && this._busConnected()) {
        return;
      }

      if(!this._enqueueRelayMessage(parsed))return;
      if (!this._inFlight) {
        this._flushAndPoll();
      }
    }
```


### public/vercel-ws-shim.js — activate ve yeni failback metodu

Mevcut _activateCloudRelay yerine ilk metodu koyun; _tryNativeFailback aynı SmartWebSocket sınıfına yeni metottur. NativeWebSocket IIFE içindeki mevcut referanstır.

```js
// PATCH: transport-v53
_activateCloudRelay(){
  if(this._isRelay||this._closedExplicitly)return;
  this._isRelay=true;this._opened=true;
  this._httpEpoch=(this._httpEpoch||0)+1;this._relayAbort?.abort();this._inFlight=false;
  try{if(this._native){this._native.onopen=null;this._native.onmessage=null;
    this._native.onerror=null;this._native.onclose=null;this._native.close();}}catch(e){}
  this.readyState=1;
  if(this._joinContext)this._initMqttBus(this._joinContext,false);
  else if(this._isAdmin)this._initMqttBus(null,true);
  if(typeof this.onopen==='function')this.onopen({type:'open',relay:true});
  this._audioCoalescer?.flush();
  if(this._pollTimer)clearInterval(this._pollTimer);
  this._pollTimer=setInterval(()=>this._flushAndPoll(),100);
  if(!this.url.includes('.vercel.app/ws')&&!this._vdsFailbackTimer)
    this._vdsFailbackTimer=setInterval(()=>this._tryNativeFailback(),12000);
}
_tryNativeFailback(){
  if(!this._isRelay||this.readyState!==1||this._closedExplicitly||this._failbackProbe)return;
  const join=this._joinContext,generation=this._transportGeneration||0;
  const mode=this._subscriptionType||(this._isAdmin?'admin-subscribe':'join');
  let request,ackType;
  if(mode==='admin-subscribe'){
    request={type:mode,token:(localStorage.getItem('ry_auth_token')||'').trim()};ackType='admin-rooms-update';
  }else if(mode==='family-subscribe'){
    if(!join)return;request={type:mode,tourCode:join.tourCode};ackType='family-state';
  }else{if(!join)return;request={...join};ackType='joined';}
  let probe;try{probe=new NativeWebSocket(this.url);probe.binaryType='arraybuffer';}catch(e){return;}
  this._failbackProbe=probe;let finished=false;
  const cancel=()=>{
    if(finished)return;finished=true;clearTimeout(timer);
    if(this._failbackProbe===probe)this._failbackProbe=null;
    if(this._cancelNativeProbe===cancel)this._cancelNativeProbe=null;
    probe.onopen=null;probe.onmessage=null;probe.onerror=null;probe.onclose=null;
    try{probe.close();}catch(e){}
  };
  const timer=setTimeout(cancel,3000);this._cancelNativeProbe=cancel;
  probe.onerror=cancel;probe.onclose=cancel;
  probe.onopen=()=>{
    if(this._closedExplicitly||!this._isRelay||(this._transportGeneration||0)!==generation){cancel();return;}
    try{probe.send(JSON.stringify(request));}catch(e){cancel();}
  };
  probe.onmessage=ev=>{
    let msg;try{msg=JSON.parse(ev.data);}catch(e){return;}
    if(msg.type==='auth-error'||msg.type==='pin-error'){cancel();return;}
    if(msg.type!==ackType)return;
    if(this._closedExplicitly||!this._isRelay||(this._transportGeneration||0)!==generation){cancel();return;}
    if(mode==='join'&&(!msg.room||String(msg.room.tourCode).toUpperCase().trim()!==String(join.tourCode||'RY-KASIM').toUpperCase().trim()||
      String(msg.room.roomId)!==String(join.roomId||'genel').trim())){cancel();return;}
    finished=true;clearTimeout(timer);this._failbackProbe=null;this._cancelNativeProbe=null;
    this._native=probe;this._isRelay=false;this._opened=true;
    this._httpEpoch=(this._httpEpoch||0)+1;this._relayAbort?.abort();this._relayAbort=null;this._inFlight=false;
    if(this._pollTimer){clearInterval(this._pollTimer);this._pollTimer=null;}
    if(this._vdsFailbackTimer){clearInterval(this._vdsFailbackTimer);this._vdsFailbackTimer=null;}
    probe.onmessage=e=>{if(!this._isRelay&&this.readyState===1)this.onmessage?.(e);};
    probe.onerror=e=>this.onerror?.(e);
    probe.onclose=e=>{if(!this._isRelay){this.readyState=3;this.onclose?.(e);}};
    // Re-send current join/live metadata through the application's existing open handler.
    if(typeof this.onopen==='function')this.onopen({type:'open',failback:true});
    const pending=this._sendQueue.splice(0),now=Date.now();
    for(const m of pending){
      if(m.type==='join'||m.type==='family-subscribe'||m.type==='admin-subscribe'||m.type==='guide-stream-state')continue;
      if(m.type==='audio-chunk'&&(!Number.isFinite(m._queuedAt)||now-m._queuedAt>200))continue;
      try{this.send(JSON.stringify(m));}catch(e){this.onerror?.(e);}
    }
    this._audioCoalescer?.flush();
    this._closeMqttClients();window.__ryConsecutiveVdsFailures=0;
    this.onmessage?.(ev);
  };
}
```


### public/vercel-ws-shim.js — close tamamı



```js
// PATCH: shim-close-v53
close() {
      this._closedExplicitly=true;this._cancelNativeProbe?.();
      this.readyState = 3;
      this._httpEpoch=(this._httpEpoch||0)+1;
      this._relayAbort?.abort();this._relayAbort=null;
      this._audioCoalescer?.clear();this._sendQueue.length=0;
      if (this._vdsFailbackTimer) {
        clearInterval(this._vdsFailbackTimer);
        this._vdsFailbackTimer = null;
      }
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
      this._closeMqttClients();
      if (this._native) {
        try { this._native.close(); } catch {}
      }
    }
```


### server.js — yeni auth/join yardımcıları

POST/GET route’larından önce ekleyin. isRequestAuthenticated/isValidAuthToken mevcut sunucu yardımcılarıdır.

```js
// PATCH: relay-auth-v53
function applyRysRelayAuth(session,req,token,joinContext){
  const authenticated=!!(isRequestAuthenticated(req)||isValidAuthToken(token)||isValidAuthToken(joinContext?.token));
  const client=session.currentRoom?.clients.get(session.clientId);
  session.isAuthenticated=authenticated;session.ws.isAuthenticated=authenticated;
  return authenticated||!(client?.role==='guide'||session.ws.isAdmin||joinContext?.role==='guide');
}
function syncRysRelayJoin(session,joinContext){
  if(!joinContext||joinContext.type!=='join')return true;
  const code=String(joinContext.tourCode||'RY-KASIM').toUpperCase().trim();
  const room=String(joinContext.roomId||'genel').trim(),role=joinContext.role==='guide'?'guide':'pilgrim';
  const matches=()=>session.currentRoom?.tourCode===code&&session.currentRoom?.roomId===room&&
    session.currentRoom.clients.get(session.clientId)?.role===role;
  if(!matches())processClientJsonMessage(session,joinContext);
  return !!matches();
}
```


### server.js — POST ve GET relay route bloklarının tamamı

Mevcut iki route kaydını değiştirin; eski kayıtları ayrıca bırakmayın. PIN reddinde medya işlenmez; guide/admin yetki yoksa 401.

```js
// PATCH: relay-routes-v53
app.post('/api/ws-relay',(req,res)=>{
  const {clientId,messages,joinContext,token}=req.body||{};
  const session=getOrCreateRelaySession(clientId);
  if(!applyRysRelayAuth(session,req,token,joinContext))return res.status(401).json({error:'relay-auth-required'});
  if(!syncRysRelayJoin(session,joinContext))return res.json({clientId:session.clientId,
    messages:[{type:'pin-error',message:'Kafile/oda katılımı reddedildi; PIN ve yetkiyi kontrol edin.'}]});
  const list=Array.isArray(messages)?messages:req.body?.message?[req.body.message]:[];
  for(const m of list)if(m&&typeof m==='object')processClientJsonMessage(session,m);
  return res.json({clientId:session.clientId,messages:drainRysRelaySession(session)});
});
app.get('/api/ws-relay',(req,res)=>{
  const session=getOrCreateRelaySession(req.query.clientId);
  const join=req.query.tourCode?{type:'join',tourCode:req.query.tourCode,roomId:req.query.roomId||'genel',
    role:req.query.role||'pilgrim',name:req.query.name||'',pin:req.query.pin||'',token:req.query.token}:null;
  if(!applyRysRelayAuth(session,req,req.query.token,join))return res.status(401).json({error:'relay-auth-required'});
  if(!syncRysRelayJoin(session,join))return res.json({clientId:session.clientId,
    messages:[{type:'pin-error',message:'Kafile/oda katılımı reddedildi; PIN ve yetkiyi kontrol edin.'}]});
  return res.json({clientId:session.clientId,messages:drainRysRelaySession(session)});
});
```


<!-- SOURCE-HASHES {"public/pcm-capture-worklet.js": "15a3921558baf5af836a20737dadcc0e86f583ecab54d2863fb4a00eee535f28", "public/pcm-player-worklet.js": "f9f5ba0d6fa2ab0dc98c4539a5f18417132514b39983779ea8a9dd486f7d924c", "public/rehber.html": "2418a681445c6cba1d8c84f7d38ab3d6021c2c6f855feb5b64298cca5c972c93", "public/dinle.html": "cf269e98cf183984e78736430aad8b411aaa78a1983977c742b49159a3896974", "public/vercel-ws-shim.js": "77b52d0ec502a1909c79330fc1e6d65b8bb02317cf09b18a22281e662220fe6a", "server.js": "bd799cc29bd42f47e1bbbf878f038b1001c910791d85f8d20d1e7b0a09720bd5", "public/sw.js": "1f6adc3d3cd31809debbf2217ae6a6881274b34803451e3e7cf799b7c72fb1cb", "scripts/verify-system.js": "fd255a30d8ead467bf383ccce18d3fbc77440a083ae42b5d60a72975806d16c2"} -->

## 4. Gerçek kaynakları okuyan, rapordan bağımsız doğrulama

Testler gerçek kaynak dosyalarını okumaya devam eder; rapordan kod çekmez. Mevcut `runStep5V52AudioChecks` fonksiyonunun tamamını aşağıdakiyle değiştirip main içindeki çağrıyı **`await runStep5V53AudioChecks();`** yapın. Receiver gerçek-history PLC fixture'ında haveHistory=true eklenmiştir: geçmişsiz başlangıç ile gerçek kurtarma artık ayrı test edilir. Önceki Step1–4/E2E kontrolleri korunur.

```js
// PATCH: verify-v53
async function runStep5V53AudioChecks(){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const assert=require('node:assert/strict');
  const root=typeof ROOT_DIR==='string'?ROOT_DIR:process.cwd();
  const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  const capture=read('public/pcm-capture-worklet.js'),player=read('public/pcm-player-worklet.js');
  const guide=read('public/rehber.html'),listener=read('public/dinle.html');
  const shim=read('public/vercel-ws-shim.js'),server=read('server.js');
  // Top-level function/class or class method: close at the declaration's indentation.
  function pick(text,name,kind='function'){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const head=kind==='class'?'class ':kind==='method'?'(?:async )?':'(?:async )?function ';
    const re=new RegExp('^([ \\t]*)'+head+escaped+(kind==='class'?'\\b':'\\([^\\n]*\\)\\s*\\{'),'m');
    const m=re.exec(text);assert(m,'Missing source symbol '+name);
    for(let end=text.indexOf('}',m.index+m[0].length);end>=0;end=text.indexOf('}',end+1)){
      const code=text.slice(m.index,end+1).trim();
      try{new vm.Script(kind==='method'?'class Probe{'+code+'}':code);return code;}catch(e){if(!(e instanceof SyntaxError))throw e;}
    }
    throw new Error('Unterminated source symbol '+name);
  }
  function box(code,tail='',globals={}){
    let P;const c={Float32Array,Float64Array,ArrayBuffer,DataView,Buffer,Math,Number,Boolean,Promise,
      sampleRate:48000,currentTime:0,console,AbortController,URLSearchParams,
      setTimeout,clearTimeout,queueMicrotask,
      AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},
      registerProcessor:(name,K)=>P=K,...globals};
    vm.createContext(c);vm.runInContext(code.replace(/^export .*$/mg,'')+'\n'+tail,c);return {c,P};
  }
  const cap=box(capture,'globalThis.K=RysCaptureKernel;globalThis.G=RysNearExpander;globalThis.F=RysFir24;').c;
  const edge=new cap.G();for(const x of [NaN,Infinity,-Infinity,1e308,-1e308,1e-300,0])assert(Number.isFinite(edge.step(x)));
  assert.throws(()=>new cap.F(0));
  for(const sr of [44100,48000]){
    function renderCapture(size){
      const frames=[],k=new cap.K(sr,{comfortFade:false},m=>frames.push(...m.samples));
      for(let i=0;i<sr;i+=size)k.process(Float32Array.from({length:Math.min(size,sr-i)},(_,j)=>.01*Math.sin((i+j)*.1)),i/sr);
      assert.equal(k.offset,0);assert.equal(frames.length,24000);return frames;
    }
    assert.deepEqual(renderCapture(128),renderCapture(2048));
    for(const hz of [16000,20000]){
      const fir=new cap.F(sr);let n=0,sq=0,total=0;
      for(let i=0;i<sr;i++)fir.push(Math.sin(2*Math.PI*hz*i/sr),x=>{if(total++>2400){sq+=x*x;n++;}});
      assert.equal(total,24000);assert(20*Math.log10(Math.sqrt(sq/n)*Math.SQRT2)<-60);
    }
  }
  let lastFrame;const quiet=new cap.K(24000,{},m=>lastFrame=m);
  for(let i=0;i<24000*3;i+=128)quiet.process(Float32Array.from({length:Math.min(128,72000-i)},(_,j)=>.005*Math.sin(2*Math.PI*700*(i+j)/24000)),i/24000);
  assert(lastFrame.samples.every(x=>x===0),'Comfort fade must eventually emit zero PCM frames');
  const long=new cap.G();for(let i=0;i<24000;i++)long.step(.0001*Math.sin(i*.05));
  long.setProfile({continuousSpeech:true});
  for(let i=0;i<24000*8;i++)long.step(.1*Math.sin(2*Math.PI*220*i/24000));assert(long.g>.98);
  quiet.control({type:'set-profile',continuousSpeech:true});
  for(let i=0;i<2400;i+=128)quiet.process(Float32Array.from({length:Math.min(128,2400-i)},(_,j)=>.1*Math.sin((i+j)*.05)),3+i/24000);
  assert(quiet.comfortGain>.99,'Continuous speech must bypass comfort fade');
  assert(guide.includes('id="guideContinuousSpeech"')&&guide.includes('id="guideComfortFade"'));
  const profileCode=['syncGuideAudioProfile','setGuideContinuousSpeech','setGuideComfortFade'].map(n=>pick(guide,n)).join('\n');
  const nodes={guideContinuousSpeech:{},guideComfortFade:{},guideProfileStatus:{}};let profiles=[];
  const ui=box(profileCode,'',{guideContinuousSpeech:false,guideComfortFade:true,guideSideVoiceRejectLevel:.5,
    document:{getElementById:id=>nodes[id]||null},scriptProcessor:{port:{postMessage:m=>profiles.push(m)}}}).c;
  ui.setGuideContinuousSpeech(true);ui.setGuideComfortFade(false);
  assert(nodes.guideContinuousSpeech.checked);assert(!nodes.guideComfortFade.checked);
  assert.equal(profiles.at(-1).continuousSpeech,true);assert.equal(profiles.at(-1).comfortFade,false);
  const graph=pick(guide,'setupGuideMicrophoneGraph');
  for(const worklet of [true,false]){
    let opts,fallbackAt;
    const node=()=>({connect(){},disconnect(){}});
    const ctx={state:'running',sampleRate:48000,currentTime:10,
      createMediaStreamSource:node,createGain:()=>({...node(),gain:{value:0}}),
      createBiquadFilter:()=>({...node(),frequency:{value:0},Q:{value:0},gain:{value:0}}),
      createScriptProcessor:node,destination:{}};
    if(worklet)ctx.audioWorklet={addModule:async()=>{}};
    class Kernel{constructor(rate,o){opts=o;}control(){}process(ch,t){fallbackAt=t;}}
    class AW{constructor(context,name,o){opts=o.processorOptions;this.port={postMessage(){}};}connect(){}}
    const g=box(graph.replace(/\bimport\(url\)/g,'loadCaptureModule(url)')+'\n'+profileCode,'',{
      audioCtx:ctx,window:{AudioContext:class{}},AudioWorkletNode:worklet?AW:undefined,
      navigator:{mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[{}]})}},
      loadCaptureModule:async()=>({RysCaptureKernel:Kernel}),
      disconnectGuideAudioNodes(){g.scriptProcessor=null;},
      handleGuideMicFloatChunk(){},scriptProcessor:null,guideContinuousSpeech:true,guideComfortFade:false,
      guideSideVoiceRejectLevel:.5,isGuideMicMuted:false,guideMicGainMultiplier:1,
      guideTxRmsRing:new Float32Array(8),document:{getElementById:()=>null}
    }).c;
    await g.setupGuideMicrophoneGraph();assert(opts.continuousSpeech);assert(!opts.comfortFade);
    if(!worklet){g.scriptProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(2048)},playbackTime:99});
      assert(Math.abs(fallbackAt-(10-2048/48000))<1e-9);}
  }
  const {P,c:pc}=box(player,'globalThis.diff=rysDiff;');
  const p=new P();p.playing=true;p.fi=120;p.phase=.25;
  for(let i=0;i<33;i++)p._push({type:'push',samples:new Float32Array(480).fill(.1),seq:i,arrival:i*20});
  assert.equal(p.q.size,24);assert.equal(p.expected,9);assert.equal(p.stats.queueDropped,9);
  assert(p.q.has(32));assert.equal(p.stats.resync,0);assert(p.playing);assert.equal(p.fi,120);assert.equal(p.phase,.25);
  const recovery=new P();recovery.expected=7;recovery.missing=1;recovery.haveHistory=true;
  recovery.plc={fill(a){a.fill(.2);},append(){}};recovery.q.set(7,new Float32Array(480).fill(-.2));recovery._nextFrame();
  assert(Math.abs(recovery.frame[0]-.2)<1e-6);assert(Math.abs(recovery.frame[71]+.2)<1e-6);
  const seq=new P();const push=(n,phrase=false)=>seq._push({samples:new Float32Array(480).fill(.1),seq:n,phraseStart:phrase,arrival:n*20});
  push(11);push(10,true);assert(seq.q.has(11));push(11);assert.equal(seq.stats.duplicate,1);
  for(let i=12;i<20;i++)push(i);
  for(let i=0;i<500;i++){const out=new Float32Array(128);seq.process([],[[out]]);assert(out.every(Number.isFinite));}
  assert(!seq.playing);assert.equal(pc.diff(0,0x7fffffff),1);
  const wrap=new P(),base=0x80000000-16;
  for(let i=0;i<33;i++)wrap._push({samples:new Float32Array(480),seq:(base+i)%0x80000000,arrival:i*20});
  assert.equal(wrap.q.size,24);assert.equal(wrap.expected,(base+9)%0x80000000);assert(wrap.q.has(16));
  // Binary and JSON hit the same timeline; duplicate seq is concealed neither twice nor scheduled separately.
  const rxP=new P();
  const rx=box(['playPcmSamples','flushPendingRxFrames','handleBinaryAudioFrame'].map(n=>pick(listener,n)).join('\n'),'',{
    isAudioListening:true,audioCtx:{state:'running',createBufferSource(){throw Error('Unexpected fallback playback');}},
    rxPlayerWorkletNode:{port:{postMessage:m=>rxP._push(m)}},pendingRxFrames:[],
    ensureAudioContext(){},forceResurrectPilgrimAudio(){},pilgrimAudioGuardChannel:null,
    window:{},updateGuideSpeakingIndicator(){},animateSpectrumFromLevel(){},
    atob:s=>Buffer.from(s,'base64').toString('binary'),performance:{now:()=>100}
  }).c;
  const frame=new ArrayBuffer(972),view=new DataView(frame);view.setUint32(0,0,true);view.setFloat64(4,1,true);
  rx.handleBinaryAudioFrame(frame);rx.playPcmSamples(Buffer.alloc(960).toString('base64'),24000,true,0,false,true);
  assert.equal(rxP.q.size,1);assert.equal(rxP.stats.duplicate,1);
  const helpers=['validRysAudio','unpackRysAudio'].map(n=>pick(shim,n,'function')).join('\n');
  const co=box(helpers+'\n'+pick(shim,'RysAudioCoalescer','class'),'globalThis.C=RysAudioCoalescer;').c;
  let jobs=[],now=0,sent=[];
  const c=new co.C(m=>sent.push(m),()=>now,fn=>{jobs.push(fn);return jobs.length;},()=>{});
  const unit=i=>({type:'audio-chunk',seq:i,sentAt:1,sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
  c.push(unit(0));const oldJob=jobs[0];now=20;c.push(unit(1));now=40;c.push(unit(2));
  assert.equal(sent[0]._queuedAt,0);now=60;c.push(unit(3));oldJob();assert.equal(sent.length,1);jobs.at(-1)();assert.equal(sent.length,2);
  const fan=box(pick(server,'rysSendAudio')+'\n'+pick(server,'broadcastToRoom'),'',{WebSocket:{OPEN:1}}).c;
  let terminated=0,fast=0;
  const slow={readyState:1,bufferedAmount:9720,send(){},terminate(){terminated++;}};
  assert(fan.rysSendAudio(slow,Buffer.alloc(972),true,0));assert.equal(terminated,0);
  slow.bufferedAmount=12000;assert(!fan.rysSendAudio(slow,Buffer.alloc(972),true,100));assert.equal(terminated,0);
  slow.bufferedAmount=0;assert(fan.rysSendAudio(slow,Buffer.alloc(972),true,400));
  slow.bufferedAmount=12000;fan.rysSendAudio(slow,Buffer.alloc(972),true,500);fan.rysSendAudio(slow,Buffer.alloc(972),true,2600);
  assert.equal(terminated,1);
  const hard={readyState:1,bufferedAmount:65537,terminate(){terminated++;}};fan.rysSendAudio(hard,'',true,0);assert.equal(terminated,2);
  const throws={readyState:1,bufferedAmount:0,send(){throw Error('peer gone');}};
  const good={readyState:1,bufferedAmount:0,send(){fast++;}};
  fan.broadcastToRoom({clients:new Map([[1,{ws:throws}],[2,{ws:good}]])},{type:'audio-chunk'});assert.equal(fast,1);
  let httpJobs=[],fetchCalls=0,resolveFirst,delivered=0,fetchSignal;
  const relayMethods=['_enqueueRelayMessage','_flushAndPoll','close'].map(n=>pick(shim,n,'method')).join('\n');
  const hc=box('class Relay{'+relayMethods+'}\nglobalThis.R=Relay;','',{
    Date:{now:()=>0},setTimeout:()=>1,clearTimeout(){},queueMicrotask:f=>httpJobs.push(f),
    localStorage:{getItem:()=>''},fetch:(url,options)=>{
      fetchCalls++;fetchSignal=options.signal;
      const ok={ok:true,json:async()=>({messages:[{type:'room-state'}]})};
      if(fetchCalls===1)return new Promise(r=>resolveFirst=()=>r(ok));return Promise.resolve(ok);
    }
  }).c;
  const relay=new hc.R();Object.assign(relay,{readyState:1,_isRelay:true,_inFlight:false,_sendQueue:[],
    _clientId:'unit',_joinContext:{},_busConnected:()=>false,_deliverIncomingMessage(){delivered++;},_closeMqttClients(){}});
  relay._enqueueRelayMessage({type:'ping'});const flight=relay._flushAndPoll();
  relay._enqueueRelayMessage({type:'join'});await relay._flushAndPoll();assert.equal(fetchCalls,1);
  resolveFirst();await flight;assert.equal(delivered,1);assert.equal(httpJobs.length,1);
  httpJobs.shift()();await new Promise(r=>setImmediate(r));assert.equal(fetchCalls,2);assert.equal(delivered,2);
  relay._sendQueue=[];
  for(let i=0;i<64;i++)assert(relay._enqueueRelayMessage({type:'ping',i}));
  for(let i=0;i<5;i++)relay._enqueueRelayMessage({type:'audio-chunk',_queuedAt:0,frames:[unit(i)]});
  assert.equal(relay._sendQueue.filter(m=>m.type==='ping').length,64);assert.equal(relay._sendQueue.filter(m=>m.type==='audio-chunk').length,4);
  assert(!relay._enqueueRelayMessage({type:'join'}));
  fetchCalls=0;relay._sendQueue=[{type:'ping'}];const closing=relay._flushAndPoll();
  relay.close();assert(fetchSignal.aborted);resolveFirst();await closing;assert.equal(delivered,2);assert.equal(relay._sendQueue.length,0);
  let resumes=0;const rc=box(pick(listener,'forceResurrectPilgrimAudio'),'',{
    isAudioListening:true,intentionalLeave:false,rxRecoveryBusy:true,ensureAudioContext(){},
    audioCtx:{resume(){resumes++;return Promise.resolve();}}
  }).c;
  await rc.forceResurrectPilgrimAudio('user-gesture');assert.equal(resumes,1);
  const wakeCode='let rysWakePending=null;\n'+pick(listener,'requestWakeLock');let requests=0,resolveWake,released=0;
  const wc=box(wakeCode,'',{wakeLockDesired:true,wakeLockSentinel:null,
    document:{visibilityState:'visible',getElementById:()=>null},
    navigator:{wakeLock:{request(){requests++;return new Promise(r=>resolveWake=r);}}}}).c;
  const wa=wc.requestWakeLock(),wb=wc.requestWakeLock();assert.equal(requests,1);wc.wakeLockDesired=false;
  resolveWake({released:false,release(){released++;return Promise.resolve();},addEventListener(){}});await Promise.all([wa,wb]);assert.equal(released,1);
  let paused=0;const actions={};
  const mc=box(pick(listener,'updateMediaSessionMetadata'),'',{currentTour:null,isAudioListening:true,
    document:{getElementById:()=>null},MediaMetadata:class{},navigator:{mediaSession:{setActionHandler(n,f){actions[n]=f;}}},
    toggleAudioPlayback(){paused++;},forceResurrectPilgrimAudio(){}}).c;
  mc.updateMediaSessionMetadata();actions.pause();assert.equal(paused,1);

  // Isolate comfort gain from VAD: controlled activity has exactly 10 ms waveform lookahead.
  const first=[];const ck=new cap.K(24000,{},m=>first.push(...m.samples));
  const delay=new Float32Array(240);let dp=0;
  ck.gate={ready:true,hold:0,continuousSpeech:false,step(x){const y=delay[dp];delay[dp]=x;dp=(dp+1)%240;return y;}};
  for(let i=0;i<60000;i++)ck.accept(0);first.length=0;ck.gate.hold=24;
  for(let i=0;i<480;i++)ck.accept(.2);
  const firstIndex=first.findIndex(x=>x!==0);
  assert.equal(firstIndex,312);assert(Math.abs(first[firstIndex]-.2)<1e-6);assert.equal(ck.comfortGain,1);
  const initial=new P();for(let i=0;i<33;i++)initial._push({samples:new Float32Array(480).fill(.2),seq:i,arrival:i*20});
  assert(!initial.pendingQueueBlend);initial.plc.fill=()=>{throw Error('PLC history does not exist');};
  initial._nextFrame();assert(Math.abs(initial.frame[0]-.2)<1e-6);
  const histless=new P();histless.expected=0;histless.missing=1;
  histless.plc.fill=()=>{throw Error('Invalid history recovery');};histless.q.set(0,new Float32Array(480).fill(.1));
  histless._nextFrame();assert(Math.abs(histless.frame[0]-.1)<1e-6);
  const exhausted=new P();for(let i=0;i<8;i++)exhausted._push({samples:new Float32Array(480).fill(.1),seq:i,arrival:i*20});
  for(let i=0;i<600;i++)exhausted.process([],[[new Float32Array(128)]]);
  assert(!exhausted.haveHistory);assert.equal(exhausted.plc.used,0);assert.equal(exhausted.missing,0);
  assert(!guide.includes('processGuideFloatChunkDsp'));assert(!guide.includes('guideGateEnv'));
  let profileMessage;const profileKernel=new cap.K(24000,{continuousSpeech:true,comfortFade:false});
  const central=box(['syncGuideAudioProfile','updateGuideSideVoiceReject','resetGuideVoiceLock'].map(n=>pick(guide,n)).join('\n'),'',{
    guideContinuousSpeech:true,guideComfortFade:false,guideSideVoiceRejectLevel:.5,
    document:{getElementById:()=>({style:{}})},scriptProcessor:{port:{postMessage(m){profileMessage=m;profileKernel.control(m);}}}
  }).c;
  central.updateGuideSideVoiceReject(68);central.resetGuideVoiceLock();
  assert(profileMessage.resetLock);assert(profileKernel.gate.continuousSpeech);assert(!profileKernel.comfortFade);
  let posts=[];const pending=[{type:'push',seq:1,samples:new Float32Array(480),arrival:100},
    {type:'push',seq:2,samples:new Float32Array(480),arrival:200}];
  const pendingBox=box(pick(listener,'flushPendingRxFrames'),'',{pendingRxFrames:pending,
    rxPlayerWorkletNode:null,audioCtx:{state:'running'},performance:{now:()=>400}}).c;
  pendingBox.flushPendingRxFrames();assert.equal(pending.length,2);
  pendingBox.rxPlayerWorkletNode={port:{postMessage:m=>posts.push(m)}};
  pendingBox.flushPendingRxFrames();assert.equal(posts.length,1);assert.equal(posts[0].seq,2);
  let resolveOld,resolveNew,created=0;
  const oldCtx={audioWorklet:{addModule:()=>new Promise(r=>resolveOld=r)}},newCtx={audioWorklet:{addModule:()=>new Promise(r=>resolveNew=r)}};
  class RxNode{constructor(context){this.context=context;created++;this.port={};}connect(){}}
  const loading=box(pick(listener,'initRxPlayerWorklet'),'',{audioCtx:oldCtx,rxPlayerWorkletNode:null,
    rxPlayerWorkletLoading:false,rxPlayerWorkletAlive:false,rxLoadToken:0,
    window:{AudioWorkletNode:RxNode},AudioWorkletNode:RxNode,rxInputNode:{},gainNode:{},
    activeScheduledSources:[],flushPendingRxFrames(){}}).c;
  loading.initRxPlayerWorklet();loading.audioCtx=newCtx;loading.rxLoadToken++;loading.rxPlayerWorkletLoading=false;
  loading.initRxPlayerWorklet();resolveOld();await new Promise(r=>setImmediate(r));
  assert.equal(created,0);assert(loading.rxPlayerWorkletLoading);
  resolveNew();await new Promise(r=>setImmediate(r));assert.equal(created,1);assert.equal(loading.rxPlayerWorkletNode.context,newCtx);
  const probes=[];let closedMqtt=0,opened=0;
  class Native{constructor(url){this.url=url;this.readyState=1;this.sent=[];probes.push(this);}send(data){this.sent.push(JSON.parse(data));}close(){this.closed=true;this.readyState=3;}}
  const transportCode=helpers+'\n'+pick(shim,'RysAudioCoalescer','class')+'\n'+pick(shim,'installRysCoalescing')+'\n'+pick(shim,'SmartWebSocket','class');
  const transport=box(transportCode,'globalThis.S=SmartWebSocket;globalThis.install=installRysCoalescing;',{
    NativeWebSocket:Native,window:{},Date:{now:()=>100},localStorage:{getItem:()=>''},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},sessionStorage:{}}).c;
  const makeRelay=()=>{
    const s=Object.create(transport.S.prototype);
    Object.assign(s,{url:'wss://local/ws',readyState:1,_isRelay:true,_httpEpoch:0,_transportGeneration:0,
      _subscriptionType:'join',_joinContext:{type:'join',role:'guide',tourCode:'RY-KASIM',roomId:'a',token:'good'},
      _sendQueue:[],_isAdmin:false,_inFlight:true,_busConnected:()=>true,_publishMqtt(){},_initMqttBus(){},
      _closeMqttClients(){closedMqtt++;},onmessage(){},onerror(){},
      onopen(){opened++;s.send(JSON.stringify({...s._joinContext}));s.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));}});
    transport.install(s);s._audioCoalescer.push(unit(10));s._audioCoalescer.push(unit(11));return s;
  };
  const fail=makeRelay();fail._tryNativeFailback();let probe=probes.at(-1);probe.onopen();
  probe.onmessage({data:JSON.stringify({type:'auth-error'})});assert(fail._isRelay);assert.equal(fail._audioCoalescer.frames.length,2);
  const wrong=makeRelay();wrong._tryNativeFailback();probe=probes.at(-1);probe.onopen();
  probe.onmessage({data:JSON.stringify({type:'joined',room:{tourCode:'RY-KASIM',roomId:'wrong'}})});assert(wrong._isRelay);
  const stale=makeRelay();stale._tryNativeFailback();probe=probes.at(-1);probe.onopen();stale._transportGeneration++;
  probe.onmessage({data:JSON.stringify({type:'joined',room:{tourCode:'RY-KASIM',roomId:'a'}})});assert(stale._isRelay);
  const success=makeRelay();success._tryNativeFailback();probe=probes.at(-1);probe.onopen();
  assert(success._isRelay);assert.equal(closedMqtt,0);
  probe.onmessage({data:JSON.stringify({type:'joined',room:{tourCode:'RY-KASIM',roomId:'a'}})});
  assert(!success._isRelay);assert.equal(opened,1);assert.equal(closedMqtt,1);
  const batch=probe.sent.find(m=>Array.isArray(m.frames));assert(batch);assert.deepEqual(Array.from(batch.frames,m=>m.seq),[10,11]);
  assert(probe.sent.some(m=>m.type==='guide-stream-state'&&m.isLive));
  success.close();success._activateCloudRelay();assert.equal(success.readyState,3);assert.equal(opened,1);
  const roomChange=makeRelay();roomChange._sendQueue=[{type:'audio-chunk',frames:[unit(5)],_queuedAt:100}];
  roomChange.send(JSON.stringify({...roomChange._joinContext,roomId:'b'}));
  assert.equal(roomChange._audioCoalescer.frames.length,0);assert(!roomChange._sendQueue.some(m=>m.type==='audio-chunk'));
  const auth=box(pick(server,'applyRysRelayAuth')+'\n'+pick(server,'syncRysRelayJoin'),'',{
    isRequestAuthenticated:req=>!!req.auth,isValidAuthToken:token=>token==='good',
    processClientJsonMessage(session,join){if(join.pin==='right')session.currentRoom={tourCode:join.tourCode,roomId:join.roomId,
      clients:new Map([[session.clientId,{role:join.role}]])};}
  }).c;
  const session={clientId:'unit',isAuthenticated:true,ws:{isAuthenticated:true},currentRoom:{tourCode:'RY-KASIM',roomId:'a',
    clients:new Map([['unit',{role:'guide'}]])}};
  assert(!auth.applyRysRelayAuth(session,{},'bad',null));assert(!session.isAuthenticated);assert(!session.ws.isAuthenticated);
  assert(auth.applyRysRelayAuth(session,{},'good',null));
  assert(!auth.syncRysRelayJoin(session,{type:'join',role:'guide',tourCode:'RY-KASIM',roomId:'b',pin:'wrong'}));
  assert.equal(session.currentRoom.roomId,'a');
  assert(auth.syncRysRelayJoin(session,{type:'join',role:'guide',tourCode:'RY-KASIM',roomId:'b',pin:'right'}));
  console.log('V53 DETAILS: isolated comfort firstSample='+firstIndex+', gain=1; warmup/history guards; ACK/generation/partial-frame handoff; HTTP auth refreshed');

  if(typeof recordResult==='function')recordResult('ADIM-5.V53','Kaynak dosyalarından DSP, profil, sıra, fanout ve relay davranışları doğrulandı',true);
  console.log('V53 PASS: source-only DSP/SRC/comfort/profile, queue/PLC/seq, binary+JSON dedup, coalescer, congestion, HTTP single-flight/drain/close, gesture/wake/pause');
}
```

### Yeni HTTP relay E2E fonksiyonu

Aşağıdaki fonksiyonu script kapsamına ekleyin. runStep2And3LiveServerAndWsTests içinde mevcut runV51TransportRoundTrip çağrısından sonra **`await runV53RelayRoundTrip({baseUrl,token:authToken});`** çağırın. Token loglanmaz; yalnız localhost test sunucusundaki geçici session/odalar kullanılır. Audio TTL 200 ms olduğundan bu E2E localhost gecikmesini esas alır; WAN testi değildir.

```js
// PATCH: relay-e2e-v53
async function runV53RelayRoundTrip({baseUrl,token}){
  const assert=require('node:assert/strict');const stamp=Date.now().toString(36);
  const a='v53a-'+stamp,b='v53b-'+stamp,guideId='v53g-'+stamp;
  const ca='v53ca-'+stamp,cb='v53cb-'+stamp;
  const join=(role,roomId)=>({type:'join',role,tourCode:'RY-KASIM',roomId,name:'V53 relay test'});
  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};};
  const get=async id=>{const r=await fetch(baseUrl+'/api/ws-relay?'+new URLSearchParams({clientId:id}));return r.json();};
  const unit=seq=>({type:'audio-chunk',seq,sentAt:Date.now(),sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
  assert.equal((await post({clientId:ca,joinContext:join('pilgrim',a)})).status,200);
  assert.equal((await post({clientId:cb,joinContext:join('pilgrim',b)})).status,200);
  assert.equal((await post({clientId:guideId,token,joinContext:join('guide',a),messages:[{type:'audio-chunk',frames:[unit(0),unit(1),unit(2)]}]})).status,200);
  const audioA=(await get(ca)).messages.filter(m=>m.type==='audio-chunk');assert.deepEqual(audioA.map(m=>m.seq),[0,1,2]);
  const moved=await post({clientId:guideId,token,joinContext:join('guide',b),messages:[{type:'audio-chunk',frames:[unit(3),unit(4),unit(5)]}]});
  assert(moved.body.messages.some(m=>m.type==='joined'&&m.room.roomId===b));
  const audioB=(await get(cb)).messages.filter(m=>m.type==='audio-chunk');assert.deepEqual(audioB.map(m=>m.seq),[3,4,5]);
  const denied=await post({clientId:guideId,token:'invalid',joinContext:join('guide',b),messages:[unit(6)]});assert.equal(denied.status,401);
  assert(!(await get(cb)).messages.some(m=>m.type==='audio-chunk'&&m.seq===6));
  assert.equal((await post({clientId:guideId,token,joinContext:join('guide',b),messages:[]})).status,200);
  if(typeof recordResult==='function')recordResult('ADIM-3.V53','Gerçek HTTP relay: batch, header-only oda değişimi ve yetki yenileme doğrulandı',true);
}
```

### public/dinle.html — initRxPlayerWorklet tamamı (sürüm)

```js
// PATCH: rx-init-v53
function initRxPlayerWorklet() {
      if (rxPlayerWorkletNode && rxPlayerWorkletNode.context !== audioCtx) {
        rxPlayerWorkletNode = null;
        rxPlayerWorkletAlive = false;
      }
      if (!audioCtx || rxPlayerWorkletNode || rxPlayerWorkletLoading) return;
      if (!audioCtx.audioWorklet || typeof window.AudioWorkletNode === 'undefined') return;
      const ctx = audioCtx;
      const token = ++rxLoadToken;
      rxPlayerWorkletLoading = true;
      ctx.audioWorklet
        .addModule('/pcm-player-worklet.js?v=53-audio')
        .then(() => {
          if (token !== rxLoadToken || audioCtx !== ctx || rxPlayerWorkletNode) return;
          const node = new AudioWorkletNode(ctx, 'rys-pcm-player', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1]
          });
          node.onprocessorerror = () => {
            if(audioCtx!==ctx||rxPlayerWorkletNode!==node)return;
            rxPlayerWorkletAlive = false;
            lastRxWorkletHeartbeatAt = 1;
          };
          node.port.onmessage = (ev) => {
            if(audioCtx!==ctx||rxPlayerWorkletNode!==node)return;
            const d = (ev && ev.data) || {};
            if (d.type === 'audio-heartbeat') {
              rxPlayerWorkletAlive = true;
              lastRxWorkletHeartbeatAt = Date.now();

            } else if (d.type === 'stats') {
              window.__ryRxAudioStats = d;
            }
          };
          node.connect(rxInputNode || gainNode);
          rxPlayerWorkletNode = node;
          rxPlayerWorkletAlive = true;
          lastRxWorkletHeartbeatAt = Date.now();
          while (activeScheduledSources.length > 0) {
            const src = activeScheduledSources.shift();
            try {
              src.onended = null;
              src.stop();
              src.disconnect();
              src.buffer = null;
            } catch {}
          }
          flushPendingRxFrames();
        })
        .catch((e) => {
          console.warn('Player worklet yüklenemedi', e);
        })
        .finally(() => {
          if (token === rxLoadToken) rxPlayerWorkletLoading = false;
        });
    }
```

### public/sw.js — tamamı (sürüm)

```js
// PATCH: sw-v53
// PATCH: sw-v53
// PATCH: sw-v53
const CACHE_NAME = 'ridvanses-pwa-v53';
const ASSETS_TO_CACHE = [
  '/',
  '/dinle',
  '/rota',
  '/ani-kitabi',
  '/css/style.css',
  '/vercel-ws-shim.js?v=53',
  '/js/umrah-steps-map.js',
  '/pcm-capture-worklet.js?v=53-audio',
  '/pcm-player-worklet.js?v=53-audio',
  '/manifest.json',
  '/icons/icon-512.png',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
  '/icons/app-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        if (typeof cache.add === 'function') {
          return Promise.allSettled(ASSETS_TO_CACHE.map((asset) => cache.add(asset)));
        }
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/rehber') ||
    url.pathname.startsWith('/hoca') ||
    url.pathname.startsWith('/panel') ||
    url.pathname.startsWith('/acente') ||
    url.pathname.startsWith('/login')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION' && self.registration.showNotification) {
    self.registration.showNotification(data.title || 'Rıdvan Yılmaz Turizm Duyurusu', {
      body: data.body || '',
      icon: '/icons/icon-512.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'ridvanses-notify'
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return self.clients.openWindow('/dinle');
    })
  );
});

```

İki HTML içindeki shim etiketi /vercel-ws-shim.js?v=53 olmalı. Dinle SW register çağrısı /sw.js?v=53 olmalı. Tam değiştirilecek satırlar:

```html
<script src="/vercel-ws-shim.js?v=53"></script>
```

```js
// PATCH: sw-register-v53
navigator.serviceWorker.register('/sw.js?v=53').catch(() => {});
```

Bunlar sürüm eşlemesidir, atomik dağıtım mekanizmasının yerine geçmez. Canary/geri alma bütün HTML/worklet/shim/server/test/SW sürümünü birlikte yönetmeli. Ağda gerçek paket kaybı, OS ses odağı kesintisi, mikrofon clipping'i ve aynı bantta konuşmacı ayrımı bu mikro yamalarla fiziksel olarak ortadan kaldırılmaz.

## 5. Ölçülen sonuçlar ve sınırlar

| Çalıştırma / karşı örnek | Sonuç |
|---|---|
| Diskteki v52, node scripts/verify-system.js | **24/24 PASS + V52 PASS, exit 0** |
| V52 izole comfort fixture, 240 örnek lookahead | İlk sinyal örneği 240; o örnekte ek comfort gain ≈0.964818 |
| V52 ön tamponda 33 frame sonrası ilk kaynak frame | frame[0]=0, frame[71]≈0.2; sıfır history ile gereksiz 3 ms karışım |
| V53 aynı izole fixture | İlk sinyal 312: ek 72 örnek/3 ms; ilk sinyalde comfort gain=1 |
| V53 kaynak adayları bellekte | DSP/profil/PLC/seq, history/warmup, pending TTL, eski context promise, probe ACK/hata/oda/generation, partial batch ve auth birim testleri geçti |
| Aynı adaylarla gerçek localhost HTTP/WS paketi | **25/25 PASS + V53 PASS, exit 0** |

Aday testi: kodlar yalnız bellekteki kaynak kopyalarına uygulandı, aday JS/HTML script blokları ayrıca derlendi; Node okuyucu/modül yükleyicisi bu kopyaları sundu. Express/ws localhost'ta gerçek istek/yanıt alışverişi yaptı. Testin rapor dosyasını okuması engellendi. Diskteki Step1 node --check taraması temel kaynakları tarar; ayrıca değişen aday kaynaklar ayrı syntax kontrolünden geçirildi. Kaynak yamaları üretime veya diske uygulanmadı.

Bu başarı gerçek telefon, kalabalık kayıtları, mikrofon doygunluğu, BT/kilit/OS ses odağı, roaming ve kamu MQTT hizmeti üzerinde sıfır kusur sonucu değildir. Failback probe için native WebSocket API'si mocklandı; gerçek yerel E2E ise HTTP batch/oda/yetki ve WS binary/JSON sözleşmesini sınadı. Testin kapsamadığı bir yola başarı etiketi verilmedi.

### Uygulama ve saha planı

1. Yakalama/player/guide/transport/server/test yamaları birlikte staging'e alınmalı; sürümlü HTML/SW/worklet URL'leri eşleştirilmeli.
2. Step5 çağrısı V53'e, yeni HTTP relay E2E çağrısı authToken mevcutken eklenmeli; eski testler ayrıca korunmalı. Test rapora bağımlı olmamalı.
3. Gerçek iPhone Safari/PWA ve düşük/orta Android'de uzun dua, fısıltı ve s/ş/f/t/k başlangıcı; 30 dk kilit, alarm/arama/BT rota değişimi; burst/reorder/200–500 ms boşluk ve 100/500+ dinleyici denenmeli.
4. ADC→DAC gecikmesi, fonem kaybı, PLC/late/queueDropped/rebuffer, soft-drop/hard-close, relay retry ve failback süreleri ayrı raporlanmalı. Farklı telefonların Date.now farkı gerçek akustik gecikme ölçümü değildir.
5. Yüksüz tek ton stopband değeri, kalabalık izolasyonu veya fonem kalitesi değildir. Aynı anda konuşan kalabalığı ayırmak ve çapraz cihaz echo'yu azaltmak için fiziksel yakın mikrofon/kulaklık ve doğrulanmış codec/denoiser/medya altyapısı şarttır.

Bu denetimde eklenen +3 ms gecikme, sonlu comfort açılmasının bedelidir. İstenmeyen faz veya ünsüz etkisi görülürse comfortFade kullanıcı tarafından kapatılabilir; delay profiller arasında sabit kaldığından kapatırken zaman atlaması yapılmaz. VAD hiç açılmayan heceyi bu mekanizma geri yaratmaz.
