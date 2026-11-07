# AUDIO EXCELLENCE REPORT — v50 doğrulama / v51 denetimi

7 Kasım 2026. Tek çıktı bu rapordur; kaynak yamaları uygulanmadı. İstenen canlı doğrulama komutu çalıştırıldı. Aşağıdaki satırlar diskte incelenen sürüme aittir.

## 1. v50 uygulama doğrulama özeti

**node scripts/verify-system.js: 22/22 PASS (exit 0).** İlk sandbox çalışması üç statik kontrolden sonra localhost fetch failed ile durdu; yerel ağ erişimiyle tekrar çalıştırma başarılı oldu. Test kendi runtime.json snapshot'ını geri yazdı. Son Git durumunda kaynak değişikliği yoktur.

| Kontrol | Sonuç / sınır |
|---|---|
| JS / inline HTML sözdizimi | 18 JS, 9 HTML içindeki 10 script başarılı |
| Auth, PIN, oda, HTTP/WS binary+JSON, SOS/QR | Test kapsamındaki akışlar geçti; binary 972 byte |
| v50 FIR | 48k→24k 16kHz tonu -118.06 dB; bütün stopband için evrensel -118 dB garantisi değil |
| Noise / kernel | g=.126, n1=1.71e-4; 128 ve 2048 bölmeleri eşdeğer |
| Pitch PLC / seq | Seçili tonda lag=120, sınır farkı 0; phrase reorder ve heartbeat başarılı |
| Eski AES testi | PASS ama artık canlı yolda çağrılmayan processGuideFloatChunkDsp ölçülüyor. %98 echo/%98.5 yan ses iddiası aktif v50 hattının ölçümü değildir. |
| Mobil kurtarma | Bazı kontroller kod metni/anahtar sözcük kontrolü; gerçek iPhone/Android alarm testi değil |

**Talep ile disk arasındaki fark:** RysBiquad ve RysLimiter sınıfları, RYS2 magic, RTCPeerConnection, de-emphasis, q.shift()/maxFrames ve WebRTC↔PCM seçicisi bu kopyada yoktur. q bir Map'tir; coalescer timer 18 değil **40 ms**. ryBroadcastGuideStream sadece stream referansı ve kanal adı saklar (shim:45–51). 972 byte başlık seq32+float64 timestamp+PCM16'dır; magic içermez. Bu nedenle uygulanmamış bir WebRTC hattının ham/DSP sesi veya çift kaynak geçişi doğrulanmış sayılamaz. Bu denetim mevcut PCM hattını esas alır.

## 2. Kalan bulgular ve kök nedenler

| Önem | Dosya:satır | Bulgu / kanıt |
|---|---|---|
| P0 (kanıt boşluğu) | scripts/verify-system.js:766–873 | AES/kalabalık testi eski DSP fonksiyonunu çağırıyor; aktif Worklet bypass ediyor. 22 PASS ≠ sıfır echo veya kalabalık izolasyonu. |
| P1 | public/pcm-capture-worklet.js:115–144 | 4 s minima penceresi uzun kesintisiz hedef konuşmayı noise'a öğrenebilir. 1 s düşük ton ardından .1 genlik/220 Hz sinüste t=2..5 s gain≈1; t=6 s .1465; t=7 s .126. Uzun dua için yaklaşık -18 dB sönme. |
| P1 | public/pcm-capture-worklet.js:34–49,91–103 | Number.isFinite(1e308)=true fakat Float32 ring'e yazılınca Infinity; 500 giriş örneği testinde 97 sonlu olmayan çıkış. Gate doğrudan NaN ile de zehirlenebilir. Gerçek ADC normalizasyonu bunu olağan yapmaz, API sınırı yine korunmalı. |
| P1 | public/pcm-player-worklet.js:218–252 | PLC→real geçişi yok iddiası yanlış: 5 ms _startBlend var. Ancak geçmiş çıkış kuyruğunu replay ederek blend ediyor; gerçek devam eden PLC tahmini değil, lookahead birkaç kaynak örneği erken tetikleniyor. 3 ms kaynak zamanında continuation overlap daha tutarlı. |
| P1 | public/vercel-ws-shim.js:329; server.js:1298–1329 | 450 ms poll ile 200 ms TTL uyumsuz. Sürekli 20 ms seste her 450 ms sorgu en yeni ~10 frame'i korurken ~12–13 frame düşürür; yalnız HTTP yolu düzenli kayıp üretir. |
| P1 | server.js:430–440,1211–1216 | Binary limit 19200, JSON 98304 byte. JSON/base64 kuyruğu çok daha uzun yaşlanır. TCP'ye verilmiş eski frame'i yeni frame düşürerek geri alamazsınız. Sync send exception diğer peer'lerin iterasyonunu kesebilir. |
| P1 | public/vercel-ws-shim.js:111–140 | TTL flush'ta yeniden başlatılıyor: coalescing'deki 40–120 ms yaş sayılmıyor. Timer generation koruması yok. JS tek thread: paralel yazma yok; gecikmiş callback'e karşı explicit generation testi faydalı. |
| P1 | public/rehber.html:1730–1803 | MessagePort kuyruğunda bekleyen eski yakalama frame'leri yeni Date.now timestamp'iyle tazelenerek gönderilebiliyor; main thread durması WS canlılığından bağımsız. |
| P2 | public/dinle.html:1616–1630 | Eski node port/error callback'i context/node kimliği kontrol etmeden global alive/stats'i değiştirebilir. |
| P2 | public/dinle.html:1793–1797 | OS interrupted sürerken user-gesture üzerine context rebuild deneniyor; OS odağı geri vermeden yeni context üretmek çözüm değil. |
| P2 | public/dinle.html:2693–2712 | WakeLock pending/released sentinel tekilliği yok; release sentinel'i null yapmıyor. request yağmuru ve yanlış “ses kesilmez” UI. |
| P2 | public/dinle.html:2933–2947; public/rehber.html:1380–1387 | MediaSession pause/stop kullanıcı komutu da olabilir; zorla playing yapmak bilinçli durdurmayı geçersiz kılıyor. |
| P2 | public/sw.js:8–11,53–70 | Cache listesi sürümsüz worklet, gerçek URL ?v=50-audio. Offline eşleşme garantisi yok; HTML/worklet atomik release manifesti gerekli. |
| P2 | server.js:1101 | JSON seq:msg.seq||null modüler sıfırı null'a çevirir; 50 frame/s'de yaklaşık 497 günde wrap. |

### Akustik ve DSP sınırları

85–95 dB SPL kalabalık, cihaz hassasiyeti/mesafe bilinmeden dBFS'ye çevrilemez. -118 dB stopband mikrofonun ortam sesini ayırdığı anlamına gelmez: FIR yalnız alias'ı sınırlar. 400 ms kalibrasyonda konuşulursa rehber noise olarak öğrenilebilir. 10 ms lookahead ilk fonemi mutlak korumaz: 10 ms hop kararı, 3 ms attack ve SNR/hysteresis vardır; sessiz f/s eşiği açamayabilir. Hold 240 ms iken nefeste çevre de geçer. -18 dB floor sıfır uğultu değildir.

Uzun konuşma ile sabit gürültüyü tek kanallı enerji/minima ile her koşulda ayırmak belirsiz bir problemdir. Aşağıdaki continuousSpeech **elle seçilen** mod uzun okuma sırasında kapının kapanmasını önler; çevre izolasyonunu artırmaz. Varsayılan adaptif mod korunur; bu fiziksel sınırlama otomatik çözülmüş ilan edilmez. Güçlü izolasyon için yakın boom mikrofon, kulaklık ve lisansı/CPU'su ölçülen konuşmacı odaklı denoiser gerekir. Tarayıcı NS A/B denenebilir; iki agresif NS katmanı heceleri bozabilir.

P/b ve rüzgar ADC'yi saturate ederse sonradan EQ/soft clip özgün dalgayı geri getiremez. Rüzgarlık/mikrofon yönü ve capture headroom birinci adımdır. [Web Audio standardı](https://www.w3.org/TR/webaudio/) API/filtre sözleşmesidir; akustik ayrıştırma garantisi değildir.

### PLC / jitter / kuyruk

Mevcut 5 ms crossfade çıkışta vardır; sıfır geçiş var demek hatalı olurdu. Yeni öneri 72 kaynak örneği/24k=3 ms boyunca gerçek PLC continuation ile real frame'i overlap eder. Eşit güç değil raised-cosine kullanımı aynı fazda gain şişmesini önler; ters fazda iptal fiziksel olarak yine mümkündür. C0/C1 ve pitch sınıfı genellemesi gerçek kayıtta ölçülmelidir. Burst sonrası 32 Map elemanında reset ses zamanını atlar; 5 ms reset fade klik riskini azaltır ama kelimeyi korumaz. WSOLA büyük bir geliştirmedir; doğrulanmamış bir WSOLA'yı mikro yama olarak eklemek önerilmez. ±1000 ppm 100 ms backlog'u minimum 100 s'de eritir. [Opus RFC 6716](https://www.rfc-editor.org/rfc/rfc6716.html) üretim PLC/FEC için tercih edilen mimari dayanağıdır.

### WebRTC ve mobil

Diskte WebRTC taşıması olmadığı için çift kaynak eko olasılığına “sıfırlandı” denemez. Gelecekte ham mic yerine ortak DSP çıkışı MediaStreamDestination'a bağlanmalı; ancak capture şimdilik çıkışa sıfır yazıyor ve kernel 24 kHz frame'leri port'a veriyor. Bunu sadece addTrack(micStream) değiştirerek çözemezsiniz. Üretim geçişi: tek playout owner/generation, aynı stream-id/media timestamp, hazır yeni sink doğrulaması, eski sink mute, kısa kontrollü ramp. İki farklı gecikmedeki aynı konuşmayı rastgele crossfade etmek comb-filter/çift hece üretebilir. Signaling/ICE/TURN/SFU bu depoda bulunmadığından sahte drop-in WebRTC kodu sunulmuyor.

WakeLock ekranı açık tutma isteğidir, kilitte CPU/network garantisi değildir. Worker/sessiz WAV OS askısını önleme yetkisi vermez. Gelen aramada odak geri verilene kadar beklenir; gerekiyorsa dokunuş UI'si gösterilir. Native interruption yaklaşımına referans: [Apple audio interruptions](https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions). iOS/Android cihaz matrisi yapılmadan “asla kopmaz” kabulü verilmez.

## 3. Eksiksiz v51 yamaları

Bunlar mevcut diskteki API'lere yöneliktir, uygulanmadı. Mevcut 12 bayt/480 örnek sözleşmesi korunur. Her kod bloğunun hedefi ve değiştireceği bütün fonksiyon/sınıf açıklanmıştır; gövde atlayan yer tutucu yoktur.


### public/pcm-capture-worklet.js — dosyanın tamamı

FIR constructor/ring sınırı, gate finite/DC koruması ve opsiyonel continuousSpeech. Uzun okuma için mevcut port API: scriptProcessor.port.postMessage({type:"set-profile",continuousSpeech:true}); bitince false gönderin. Bu işlem kullanıcı/rehber tercihi gerektirir; adaptif modun fiziksel belirsizliği sürer.

```js
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
    this.frame = new Float32Array(480);
    this.offset = 0;
    this.sq = 0;
    this.time = 0;
    this.emit = emit;
    this.accept = (s) => {
      const v = this.gate.step(s);
      this.mg += ((this.muted ? 0 : 1) - this.mg) * 0.0083;
      const y = v * this.mg;
      this.frame[this.offset++] = y;
      this.sq += y * y;
      if (this.offset === 480) {
        this.emit({
          type: 'frame',
          samples: this.frame,
          rms: Math.sqrt(this.sq / 480),
          gateOpen: !this.muted && (this.gate.hold > 0 || this.gate.continuousSpeech),
          ready: this.gate.ready,
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
    if (m.type === 'set-profile') this.gate.setProfile(m);
  }

  process(ch, time = 0) {
    this.time = time;
    for (let i = 0; i < ch.length; i++) {
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


### public/pcm-player-worklet.js — dosyanın tamamı

PLC continuation kaynak zamanında karıştırılır; geçmiş PCM/seq/hardware phase yeniden başlatılmaz. Burst resync mevcut bounded davranışı korur.

```js
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
    this.plc = new RysPitchPlc();
    this.plcFrame = new Float32Array(480);
    this.recoveryFrame=new Float32Array(480);this.continuation=new Float32Array(480);
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
    // phraseStart is a hint, not a new media epoch.
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
    const packet=this.q.get(this.expected);this.q.delete(this.expected);
    this.expected=(this.expected+1)%RYS_MOD;this.fi=0;
    if(packet){
      const recovery=this.missing>0;
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
      this.haveHistory = false;
      this.resetFrom = this.lastOut;
      this.resetFade = 0;
    }
    for (let c = 1; c < out.length; c++) out[c].set(ch);
    return true;
  }
}

registerProcessor('rys-pcm-player', RysPcmPlayerProcessor);

```


### public/vercel-ws-shim.js — RysAudioCoalescer ve installRysCoalescing tamamı

Mevcut iki tanımın yerine koyun; framing doğrulaması korunur. 40 ms timer, 3×20 ms kota politikası korunur; 18 ms timer çoğu normal frame’i tekil yollayıp batching kazanımını siler.

```js
// PATCH: coalescer-v51
class RysAudioCoalescer {
  constructor(send,clock=()=>Date.now(),schedule=(f,ms)=>setTimeout(f,ms),cancel=id=>clearTimeout(id)){
    this.send=send;this.clock=clock;this.schedule=schedule;this.cancel=cancel;
    this.frames=[];this.timer=null;this.oldest=0;this.generation=0;
  }
  push(m){
    if(!validRysAudio(m))return;
    const now=this.clock();
    if(this.frames.length&&now-this.oldest>120)this.clear();
    if(!this.frames.length)this.oldest=now;
    this.frames.push({...m});
    if(this.frames.length===3){this.flush();return;}
    if(this.timer===null){const generation=this.generation;
      this.timer=this.schedule(()=>{if(generation!==this.generation)return;this.timer=null;this.flush();},40);}
  }
  flush(){
    if(this.timer!==null)this.cancel(this.timer);this.timer=null;this.generation++;
    const frames=this.frames;this.frames=[];
    if(frames.length&&this.clock()-this.oldest<=120)
      this.send({type:'audio-chunk',frames,_queuedAt:this.oldest});
  }
  clear(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;this.frames=[];this.generation++;}
}
function installRysCoalescing(sock) {
    const send = sock.send.bind(sock);
    const close = sock.close.bind(sock);
    const c = new RysAudioCoalescer((m) => send(JSON.stringify({ ...m, _queuedAt: m._queuedAt })));
    sock._audioCoalescer = c;
    sock.send = (data) => {
      let m;
      try {
        m = typeof data === 'string' ? JSON.parse(data) : null;
      } catch (e) {}
      if (sock._isRelay && validRysAudio(m)) {
        c.push(m);
        return;
      }
      send(data);
    };
    sock.close = (...a) => {
      c.clear();
      return close(...a);
    };
  }
```


### server.js — rysSendAudio ve broadcastToRoom tamamı

İlk yardımcı yeni; mevcut broadcastToRoom bütünüyle değiştirilir. Yavaş peer terminate edilmesi yeniden bağlantı maliyeti yaratır; kötü bağlantıda reconnect sayacı izlenmelidir. Bu kalite garantisi değil taze ses politikasıdır.

```js
// PATCH: fanout-v51
function rysSendAudio(socket,data,binary=false){
  if(socket.readyState!==WebSocket.OPEN)return false;
  if(!socket.isHttpRelay&&socket.bufferedAmount>(binary?9600:13200)){
    socket._rysAudioDrops=(socket._rysAudioDrops||0)+1;
    if(typeof socket.terminate==='function')socket.terminate();return false;
  }
  try{
    if(socket.isHttpRelay)socket.send(data);
    else socket.send(data,{binary},err=>{if(err&&typeof socket.terminate==='function')socket.terminate();});
    return true;
  }catch(e){socket._rysAudioErrors=(socket._rysAudioErrors||0)+1;return false;}
}
function broadcastToRoom(room,payload,excludeWs=null,isAudioOverride=false){
  const audio=isAudioOverride||!!(payload&&typeof payload==='object'&&payload.type==='audio-chunk');
  const data=typeof payload==='string'?payload:JSON.stringify(payload);
  for(const client of room.clients.values()){
    const socket=client.ws;if(socket===excludeWs||socket.readyState!==WebSocket.OPEN)continue;
    if(audio)rysSendAudio(socket,data,false);
    else {try{socket.send(data);}catch(e){}}
  }
}
```


### server.js — message handler içindeki if(isBinary) bloğunun tamamı

ws.on(message) içindeki mevcut if(isBinary) bloğu değiştirilir; çevresindeki ctx ve JSON handler korunur. Ayrıca serializedAudio nesnesinde seq:msg.seq||null yerine seq:msg.seq??null kullanılmalı; tam alan satırı aşağıdadır.

```js
// PATCH: binary-v51
if (isBinary) {
      if (!ctx.currentRoom || !(ws.isAuthenticated || ctx.isAuthenticated)) return;
      const sender = ctx.currentRoom.clients.get(ctx.clientId);
      if (!sender || sender.role !== 'guide') return;
      if (
        ctx.currentRoom.activePublisherClientId &&
        ctx.currentRoom.activePublisherClientId !== ctx.clientId &&
        ctx.currentRoom.clients.has(ctx.currentRoom.activePublisherClientId)
      ) {
        return;
      }

      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (!validBinaryPcmFrame(buf)) return;
      ctx.currentRoom.activePublisherClientId = ctx.clientId;
      let fallbackJsonStr = null;

      for (const r of getTargetBroadcastRooms(ctx.currentRoom)) {
        for (const peer of r.clients.values()) {
          if (peer.ws === ws || peer.ws.readyState !== WebSocket.OPEN) continue;
          if (!peer.ws.isHttpRelay) {
            rysSendAudio(peer.ws,buf,true);
          } else if (buf.length > 12) {
            if (!fallbackJsonStr) {
              const rawSeq = buf.readUInt32LE(0);
              const phraseStart = Boolean(rawSeq & 0x80000000);
              const seq = rawSeq & 0x7fffffff;
              const sentAt = buf.readDoubleLE(4);
              const pcmSlice = buf.subarray(12);
              fallbackJsonStr = JSON.stringify({
                type: 'audio-chunk',
                seq,
                phraseStart,
                speakerId: ctx.clientId,
                speakerName: sender.name,
                speakerRole: sender.role,
                sampleRate: 24000,
                pcm16: pcmSlice.toString('base64'),
                level: 0.35,
                sentAt
              });
            }
            rysSendAudio(peer.ws,fallbackJsonStr,false);
          }
        }
      }
      return;
    }
```


### server.js — serializedAudio seq alanı

Bu bir nesne alanıdır, bağımsız program değildir; yalnız o alan satırının yerine geçer.

```js
// PATCH: seq-v51
seq: msg.seq ?? null,
```


### public/rehber.html — handleGuideMicFloatChunk tamamı

Yakalama saati AudioContext alanındadır; senkron duvar saatleri gerektirmez. Eski frame atılırken seq medya süresini korur. Fallback playbackTime ileride olabilir; yalnız pozitif büyük yaş atılır.

```js
// PATCH: guide-handler-v51
function handleGuideMicFloatChunk(m) {
      if ((!isMicBroadcasting && !isVoiceLoopbackTesting) || !audioCtx) return;
      if (m?.type !== 'frame' || !(m.samples instanceof Float32Array) || m.samples.length !== 480) return;
      lastGuideMicChunkAt = Date.now();
      if(Number.isFinite(m.capturedAt)&&audioCtx.currentTime-m.capturedAt>.180){
        guideAudioSeq=(guideAudioSeq+1)&0x7fffffff;return;
      }
      if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
        audioCtx.resume().catch(() => {});
      }
      const a = m.samples;
      const rms = m.rms;
      const level = Math.min(1, rms * 6);
      animateGuideSpectrum(level);

      const label = document.getElementById('dbMeterText');
      if (label) {
        if (isGuideMicMuted) {
          label.textContent = '🔇 Mikrofon Geçici Sessizde (Özel Konuşma Modu)';
        } else if (!m.ready) {
          label.textContent = '400 ms ortam ölçümü: konuşmadan bekleyin';
        } else {
          const dbVal = rms > 0.0001 ? Math.max(-48, Math.min(0, Math.round(20 * Math.log10(rms)))) : -48;
          label.textContent =
            !m.gateOpen || dbVal <= -42
              ? '🛡️ Yakın-Alan Ses Kilidi: Yan Sesler Engelleniyor'
              : `🎙️ Rehber Sesi Yayında (${dbVal} dB • Saf Stüdyo Kristal HD)`;
        }
      }

      if (isVoiceLoopbackTesting) {
        loopbackRecordedChunks.push({ samples: a.slice(), sampleRate: 24000 });
        return;
      }

      const nowMs = Date.now();
      if (guideAudioGuardChannel) {
        try {
          guideAudioGuardChannel.postMessage({ type: 'guide-mic-active', rms, ts: nowMs });
        } catch {}
      }
      if ((!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) && nowMs - lastGuideBgWsReconnectAt >= 2500) {
        lastGuideBgWsReconnectAt = nowMs;
        connectGuideWs();
      }

      guideAudioSeq = (guideAudioSeq + 1) & 0x7fffffff;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        guideWasIdlePaused = true;
        return;
      }
      if (ws.bufferedAmount > 19200) return;
      const phraseStart = guideWasIdlePaused;
      try {
        if (ws.isRelay || ws._isRelay) {
          ws.send(JSON.stringify({
            type: 'audio-chunk',
            seq: guideAudioSeq,
            phraseStart,
            sentAt: Date.now(),
            sampleRate: 24000,
            pcm16: floatTo16BitBase64(a),
            level
          }));
        } else {
          ws.send(encodeBinaryAudioPacket(a, guideAudioSeq, Date.now(), phraseStart));
        }
        guideWasIdlePaused = false;
      } catch (e) {
        guideWasIdlePaused = true;
      }
    }
```


### public/dinle.html — initRxPlayerWorklet tamamı

Eski callback bağlamları izole edilir; heartbeat callback’inden reentrant recover çağrısı kaldırılır.

```js
// PATCH: rx-init-v51
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
        .addModule('/pcm-player-worklet.js?v=51-audio')
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


### public/dinle.html — forceResurrectPilgrimAudio tamamı



```js
// PATCH: recovery-v51
async function forceResurrectPilgrimAudio(trigger = 'manual') {
      if (!isAudioListening || intentionalLeave) return;
      if (trigger === 'user-gesture') {
        ensureAudioContext();
        audioCtx?.resume().catch(() => {});
        if (rxRecoveryBusy) return;
      }
      if (rxRecoveryBusy) return;
      if (trigger !== 'user-gesture' && Date.now() - rxLastRecovery < 850) return;
      rxLastRecovery = Date.now();
      rxRecoveryBusy = true;
      try {
        startBackgroundKeepAliveAudio();
        ensureAudioContext();
        const ctx = audioCtx;
        if (!ctx || ctx.state === 'closed') {
          rebuildPilgrimAudioEngine('closed-ctx-' + trigger);
          verifyPilgrimWebSocketAfterInterruption();
          return;
        }
        if (ctx.state !== 'running') {
          await Promise.race([
            ctx.resume().catch(() => {}),
            new Promise((r) => setTimeout(r, 800))
          ]);
        }
        if (audioCtx !== ctx || !isAudioListening || intentionalLeave) return;
        if (ctx.state !== 'running') {
          // OS may still own audio focus. Keep one context and wait for a later gesture/state event.
          syncAudioUnlockButtonUi();
          return;
        }
        const before = ctx.currentTime;
        await new Promise((r) => setTimeout(r, 160));
        if (audioCtx !== ctx || !isAudioListening || intentionalLeave) return;
        if (ctx.state === 'running' && ctx.currentTime > before + 0.01) {
          wasSystemAudioInterrupted = false;
          flushPendingRxFrames();
          if (interruptionRecoveryTimer) {
            clearInterval(interruptionRecoveryTimer);
            interruptionRecoveryTimer = null;
          }
          if (rxPlayerWorkletNode && !rxPlayerWorkletAlive && lastRxWorkletHeartbeatAt === 1) {
            rebuildPilgrimAudioEngine('processor-error');
          }
        } else if (
          Date.now() - lastAudioEngineRebuildAt > 4500 &&
          (trigger === 'user-gesture' || document.visibilityState === 'visible')
        ) {
          rebuildPilgrimAudioEngine('clock-stalled-' + trigger);
          verifyPilgrimWebSocketAfterInterruption();
        }
        syncAudioUnlockButtonUi();
      } catch {
        syncAudioUnlockButtonUi();
      } finally {
        rxRecoveryBusy = false;
      }
    }
```


### public/dinle.html — requestWakeLock tamamı ve yeni pending değişkeni

Mevcut requestWakeLock değiştirilir, wakeLockDesired/wakeLockSentinel mevcut tanımları korunur. Mevcut visibility recovery yeniden isteği yapar.

```js
// PATCH: wakelock-v51
let rysWakePending=null;
async function requestWakeLock(){
  wakeLockDesired=true;
  const title=document.getElementById('wakeLockStatusTitle'),sub=document.getElementById('wakeLockStatusSub');
  if(wakeLockSentinel&&!wakeLockSentinel.released)return;
  if(rysWakePending)return rysWakePending;
  if(!navigator.wakeLock||document.visibilityState!=='visible')return;
  rysWakePending=(async()=>{
    try{
      const sentinel=await navigator.wakeLock.request('screen');
      if(!wakeLockDesired||document.visibilityState!=='visible'){await sentinel.release();return;}
      wakeLockSentinel=sentinel;
      sentinel.addEventListener('release',()=>{
        if(wakeLockSentinel===sentinel)wakeLockSentinel=null;
        if(title)title.textContent='Ekran koruması bırakıldı';
      });
      if(title)title.textContent='Ekran açık tutma etkin';
      if(sub)sub.textContent='İşletim sistemi ses kesintileri ayrıca yönetilir.';
    }catch(e){if(title)title.textContent='Ekran açık tutma kullanılamıyor';}
    finally{rysWakePending=null;}
  })();return rysWakePending;
}
```


<!-- BASELINE-HASHES {"public/pcm-capture-worklet.js": "c3cb78e000864190c97ab8e0cd5a8b69ff06b79f9f95a41f4f9e4424f3cb91f7", "public/pcm-player-worklet.js": "ca4f0a037f1018f31ce606d166cae3d921d3a8404458363ec95bb3d9ab96a320", "public/rehber.html": "6666f3e65ae289a2288ffa1a9c5fa0cb5d60558aae5bbb513b83f8be9391249c", "public/dinle.html": "c87d76f94488be92c5ea76e0f077aaca1a50048839ca6043b9122b63119ac913", "public/vercel-ws-shim.js": "7cd61727a8a1da52413396ef5a8356bbfb50476bc58f64f70a6d476fb962bedc", "server.js": "fa4bc42f3311427165e18b74170f0dc17e651d777358405ab53c46a01a420520", "public/sw.js": "1a4e41d8828142da666fd4c8c62f70ef7d30c85c9bd9dc055b649b3ce7905e63", "scripts/verify-system.js": "34961ddc49f80c7b94f03a6b715d68335dae531dd1372e12abe8d1412ec66b93"} -->

### public/dinle.html — updateMediaSessionMetadata tamamı

Kullanıcının pause/stop komutuna uyulur; OS kesintisi AudioContext state üzerinden izlenir. Bu değişiklik eski anahtar sözcük tabanlı test 4.6 beklentisini değiştirir; yeni davranış testi aşağıdadır.

```js
// PATCH: media-pilgrim-v51
function updateMediaSessionMetadata() {
      if (!('mediaSession' in navigator)) return;
      const title = document.getElementById('liveTopicText')?.textContent?.trim() || 'Canlı Tavaf & Siyer Rehberliği';
      const artist = document.getElementById('liveGuideName')?.textContent?.trim() || 'Ömer Ali Gültekin';
      const album = document.getElementById('liveTourTitle')?.textContent?.trim() || 'Rıdvan Yılmaz Turizm';

      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: `${artist} (${currentTour ? currentTour.code : 'RY-KASIM'})`,
        album,
        artwork: [
          { src: '/icons/icon-192.png?v=19', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png?v=19', sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.playbackState = isAudioListening ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', () => {
        if (!isAudioListening) {
          toggleAudioPlayback();
        } else {
          forceResurrectPilgrimAudio('mediasession-play');
        }
      });
      // Kullanıcı pause/stop komutu dinleme tercihini değiştirir; OS kesintisi context state ile izlenir.
      navigator.mediaSession.setActionHandler('pause',()=>{if(isAudioListening)toggleAudioPlayback();});
      navigator.mediaSession.setActionHandler('stop',()=>{if(isAudioListening)toggleAudioPlayback();});
    }
```

### public/rehber.html — updateGuideMediaSession tamamı

Kullanıcının pause/stop komutuna uyulur; OS kesintisi AudioContext state üzerinden izlenir. Bu değişiklik eski anahtar sözcük tabanlı test 4.6 beklentisini değiştirir; yeni davranış testi aşağıdadır.

```js
// PATCH: media-guide-v51
function updateGuideMediaSession() {
      if (!('mediaSession' in navigator)) return;
      try {
        const topic = document.getElementById('topicInput')?.value?.trim() || 'Canlı Tavaf & Siyer Rehberliği';
        const guideName = document.getElementById('guideNameSelect')?.value || 'Ömer Ali Gültekin';
        const tourCode = document.getElementById('guideTourSelect')?.value || 'RY-KASIM';
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `🔴 CANLI YAYIN • ${topic}`,
          artist: `${guideName} (${tourCode})`,
          album: 'Rıdvan Yılmaz Turizm — Rehber Stüdyosu',
          artwork: [
            { src: '/icons/icon-192.png?v=19', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png?v=19', sizes: '512x512', type: 'image/png' }
          ]
        });
        navigator.mediaSession.playbackState = (isMicBroadcasting || isDemoBroadcasting) ? 'playing' : 'paused';
        navigator.mediaSession.setActionHandler('play', () => {
          recoverGuideLiveSession();
        });
        navigator.mediaSession.setActionHandler('pause',()=>{if(isMicBroadcasting)stopMicBroadcast();if(isDemoBroadcasting)toggleDemoBroadcast();});
      } catch {}
    }
```

### public/sw.js — dosyanın tamamı

İki HTML içinde shim script src /vercel-ws-shim.js?v=51, SW register /sw.js?v=51 olmalı. Rehber setupGuideMicrophoneGraph URL sabitini tam satır olarak const url = "/pcm-capture-worklet.js?v=51-audio"; yapın. Player init yaması zaten v51 URL kullanır. Atomik manifest/hashing ayrıca üretim dağıtım işidir; cache sürümü tek başına bütün yayınlamayı atomik yapmaz.

```js
// PATCH: sw-v51
const CACHE_NAME = 'ridvanses-pwa-v51';
const ASSETS_TO_CACHE = [
  '/',
  '/dinle',
  '/rota',
  '/ani-kitabi',
  '/css/style.css',
  '/vercel-ws-shim.js?v=51',
  '/js/umrah-steps-map.js',
  '/pcm-capture-worklet.js?v=51-audio',
  '/pcm-player-worklet.js?v=51-audio',
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

### HTTP fallback poll periyodu — tam satır bloğu

Shim _activateCloudRelay içindeki mevcut _pollTimer atamasının yerine:

```js
// PATCH: poll-v51
this._pollTimer = setInterval(() => this._flushAndPoll(), 100);
```

Bu yalnız uyumsuz 450 ms/200 ms politikasını yerel-düşük RTT koşulunda düzeltir. 100 ms + RTT + browser throttling 200 ms'yi geçerse kayıp kalır. 1000 dinleyicide yaklaşık 10000 poll/s maliyeti doğurabilir; HTTP telefon görüşmesi altyapısı olarak önerilmez. RTT arttığında buffer/TTL ile gecikme arasında açık politika seçilmeli veya persistent medya yolu kullanılmalı. MQTT connected olduğu için HTTP poll atlamanın subscribe/auth/medya sağlığına eşit olmadığı ayrıca izlenmeli. Kamu broker'a gizli veri/üretim garantisi verilmemeli.

### Kapsam dışı gerçek altyapı gereksinimleri

Özel MQTT ACL/TLS/yayıncı yetkisi, stream-id/sample timestamp müzakeresi, WebRTC signaling/ICE/TURN/SFU, neural model ve WSOLA depoda yoktur. Bunlar mevcut fonksiyonun eksiksiz mikro yamasıyla varmış gibi gösterilemez. Bu rapor bu işleri tamamlandı diye etiketlemiyor. Sıfır çevre sesi/echo için kulaklık ve mikrofona yakın konuşma ilk adım; mevcut eşik kapısını daha agresif yapmak yumuşak heceleri daha fazla keser.

## 4. Güncellenmiş doğrulama testleri

Mevcut 22/22 sonucu yukarıda **değiştirilmemiş v50** için kaydedilmiştir. Aşağıdaki v51 testleri ayrıca bu raporun kodlarını bellekte çalıştırır; v51 kaynak dosyalarına uygulanmış gibi bir sonuç üretilmez. Gerçek E2E testinin auth/oda/WS/HTTP bölümleri korunur.

### scripts/verify-system.js entegrasyonu

1. Mevcut 4.5 yorumundan 4.6 yorumuna kadarki eski, kullanılmayan DSP testini kaldırıp aşağıdaki **tam bloğu** koyun. Eski fonksiyon üstünden %98 akustik garanti yazılması son bulur; gerçek kernel kontrolleri yeni Step5'te yapılır.

```js
// PATCH: retire-legacy-test-v51
const rehberHtml=fs.readFileSync(path.join(ROOT_DIR,'public','rehber.html'),'utf8');
recordResult('ADIM-4.5','Eski kullanılmayan DSP/AES testi emekliye ayrıldı; aktif kernel testleri ADIM-5 içinde',true,
  'Gerçek kalabalık/echo izolasyonu sentetik seviye kapısıyla kanıtlanmaz');
```

2. Mevcut 4.6 yorumundan 4.7 yorumuna kadarki **tam bloğu** şununla değiştirin. `dinleHtml`/`workletCode` daha sonra Step4 tarafından kullanıldığı için burada tanımları korunur.

```js
// PATCH: mobile-test-v51
const dinleHtml=fs.readFileSync(path.join(ROOT_DIR,'public','dinle.html'),'utf8');
const workletCode=fs.readFileSync(path.join(ROOT_DIR,'public','pcm-player-worklet.js'),'utf8');
assertCondition('ADIM-4.6','Mobil ses kurtarma yapı taşları mevcut; davranış ADIM-5 ve cihaz matrisiyle doğrulanır',
  dinleHtml.includes('function forceResurrectPilgrimAudio(')&&
  dinleHtml.includes('function rebuildPilgrimAudioEngine(')&&workletCode.includes('audio-heartbeat'),
  'Kod varlığı OS kesintisizlik garantisi değildir');
```

3. Aşağıdaki fonksiyonu `main()` öncesine ekleyin, `await runStep4FrontendPwaAndAtomicWriteChecks();` satırının hemen sonrasına **`await runStep5V51AudioChecks();`** koyun. Fonksiyon bağımsız testte rapor yamalarını, entegrasyonda uygulanmış kaynakları çalıştırabilir.

```js
// PATCH: verify-v51
async function runStep5V51AudioChecks(options={}){
  const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
  const cp=require('node:child_process'),crypto=require('node:crypto');
  const report=fs.readFileSync('AUDIO_EXCELLENCE_REPORT.md','utf8').replace(/\r\n/g,'\n');
  const fence=String.fromCharCode(96).repeat(3);
  const blocks=[...report.matchAll(new RegExp(fence+'js\\s*\\n([\\s\\S]*?)'+fence,'g'))].map(m=>m[1]);
  const get=id=>{const code=blocks.find(x=>x.startsWith('// PATCH: '+id+'\n'));assert(code,id);return code;};
  const source=file=>fs.readFileSync(file,'utf8');
  function scope(code,extra='',globals={}){
    let P;const c={Float32Array,Float64Array,Math,Number,Boolean,Buffer,Promise,
      sampleRate:48000,currentTime:0,structuredClone,
      AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},
      registerProcessor:(n,K)=>P=K,...globals};
    vm.createContext(c);vm.runInContext(code.replace(/^export .*$/mg,'')+'\n'+extra,c);return {c,P};
  }
  const patchMode=options.patches===true;
  const capture=patchMode?get('capture-v51'):source('public/pcm-capture-worklet.js');
  const player=patchMode?get('player-v51'):source('public/pcm-player-worklet.js');
  const compile=code=>{
    const r=cp.spawnSync(process.execPath,['--check','--input-type=module'],{input:code,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
  };
  for(let code of blocks){
    if(code.startsWith('// PATCH: binary-v51'))code='function binaryBlock(ctx,ws,raw,isBinary){'+code+'}';
    if(code.startsWith('// PATCH: seq-v51'))code='const o={'+code+'};';
    compile(code);
  }
  const cap=scope(capture,'globalThis.G=RysNearExpander;globalThis.F=RysFir24;globalThis.K=RysCaptureKernel;').c;
  const guard=new cap.G();
  for(const x of [NaN,Infinity,-Infinity,1e308,-1e308,1e-300,0])assert(Number.isFinite(guard.step(x)));
  const f=new cap.F(48000);let bad=0;
  for(let i=0;i<600;i++)f.push(i===0?1e308:0,y=>{if(!Number.isFinite(y))bad++;});assert.equal(bad,0);
  const long=new cap.G();
  for(let i=0;i<24000;i++)long.step(.0001*Math.sin(2*Math.PI*220*i/24000));
  long.setProfile({continuousSpeech:true});
  for(let i=0;i<24000*12;i++)long.step(.1*Math.sin(2*Math.PI*220*i/24000));
  assert(long.g>.98,'Manual continuous speech must not be learned away');
  for(const sr of [44100,48000]){
    const run=size=>{let out=[];const k=new cap.K(sr,{},m=>out.push(...m.samples));
      for(let i=0;i<sr;i+=size)k.process(Float32Array.from({length:Math.min(size,sr-i)},(_,j)=>.01*Math.sin((i+j)*.1)));
      assert.equal(k.offset,0);assert.equal(out.length,24000);assert(out.every(Number.isFinite));return out;};
    assert.deepEqual(run(128),run(2048));
    for(const hz of [16000,20000]){
      const fir=new cap.F(sr);let sq=0,n=0,count=0;
      for(let i=0;i<sr;i++)fir.push(Math.sin(2*Math.PI*hz*i/sr),y=>{if(count++>2400){sq+=y*y;n++;}});
      assert(20*Math.log10(Math.sqrt(sq/n)*Math.SQRT2)<-60);
    }
  }
  const {P,c:pc}=scope(player,'globalThis.diff=rysDiff;');
  const p=new P();p.expected=7;p.missing=1;
  p.plc={fill(a){a.fill(.2);},append(){}};
  p.q.set(7,new Float32Array(480).fill(-.2));p._nextFrame();
  assert(Math.abs(p.frame[0]-.2)<1e-6);assert(Math.abs(p.frame[71]+.2)<1e-6);
  const queue=new P();
  const push=(seq,phrase=false)=>queue._push({samples:new Float32Array(480).fill(.1),seq,phraseStart:phrase,arrival:seq*20});
  push(11);push(10,true);assert(queue.q.has(11));push(11);assert.equal(queue.stats.duplicate,1);
  for(let i=12;i<20;i++)push(i);
  for(let i=0;i<500;i++){const a=new Float32Array(128);queue.process([],[[a]]);assert(a.every(Number.isFinite));}
  assert(!queue.playing);assert.equal(pc.diff(0,0x7fffffff),1);
  const framing=source('public/vercel-ws-shim.js');
  const start=framing.indexOf('  function validRysAudio('),end=framing.indexOf('  // PATCH: coalescing',start);
  const validCode=framing.slice(start,end);
  let jobs=[],now=0,sent=[];
  const cc=scope(validCode+'\n'+get('coalescer-v51'),'globalThis.C=RysAudioCoalescer;').c;
  const co=new cc.C(m=>sent.push(m),()=>now,fn=>{jobs.push(fn);return jobs.length;},()=>{});
  const unit=i=>({type:'audio-chunk',seq:i,sentAt:1,sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
  co.push(unit(0));const oldJob=jobs[0];now=20;co.push(unit(1));now=40;co.push(unit(2));
  assert.equal(sent.length,1);assert.equal(sent[0]._queuedAt,0);
  now=60;co.push(unit(3));oldJob();assert.equal(sent.length,1);jobs[jobs.length-1]();assert.equal(sent.length,2);
  let fast=0,terminated=0;
  const fc=scope(get('fanout-v51'),'',{WebSocket:{OPEN:1}}).c;
  const slow={readyState:1,bufferedAmount:20000,terminate(){terminated++;},send(){throw Error('unexpected send');}};
  const throws={readyState:1,bufferedAmount:0,send(){throw Error('peer gone');}};
  const good={readyState:1,bufferedAmount:0,send(){fast++;}};
  fc.broadcastToRoom({clients:new Map([[1,{ws:slow}],[2,{ws:throws}],[3,{ws:good}]])},{type:'audio-chunk'});
  assert.equal(fast,1);assert.equal(terminated,1);
  const drainText=source('server.js');const da=drainText.indexOf('function drainRysRelaySession(');
  const db=drainText.indexOf("\napp.post('/api/ws-relay'",da);
  const dc=scope(drainText.slice(da,db),'',{Date:{now:()=>450}}).c;
  const sess={outbox:Array.from({length:23},(_,i)=>({at:i*20,message:{type:'audio-chunk',seq:i}}))};
  const kept=dc.drainRysRelaySession(sess).length;assert.equal(kept,10);
  const makeFn=(text,name)=>{
    const m=new RegExp('^    (?:async )?function '+name+'\\(','m').exec(text);assert(m,name);
    return text.slice(m.index,text.indexOf('\n    }',m.index)+6).trim();
  };
  let resumes=0;
  const recoveryCode=patchMode?get('recovery-v51'):makeFn(source('public/dinle.html'),'forceResurrectPilgrimAudio');
  const rc=scope(recoveryCode,'',{isAudioListening:true,intentionalLeave:false,rxRecoveryBusy:true,
    audioCtx:{resume(){resumes++;return Promise.resolve();}},ensureAudioContext(){}}).c;
  await rc.forceResurrectPilgrimAudio('user-gesture');assert.equal(resumes,1);
  let requests=0,releaseCount=0,resolve;
  const sentinel={released:false,release(){releaseCount++;return Promise.resolve();},addEventListener(){}};
  const wc=scope(get('wakelock-v51'),'',{wakeLockDesired:true,wakeLockSentinel:null,
    document:{visibilityState:'visible',getElementById(){return null;}},
    navigator:{wakeLock:{request(){requests++;return new Promise(r=>resolve=r);}}}}).c;
  const wa=wc.requestWakeLock(),wb=wc.requestWakeLock();assert.equal(requests,1);
  wc.wakeLockDesired=false;resolve(sentinel);await Promise.all([wa,wb]);assert.equal(releaseCount,1);
  let pauses=0;const mediaCode=patchMode?get('media-pilgrim-v51'):makeFn(source('public/dinle.html'),'updateMediaSessionMetadata');
  const handlers={};const mc=scope(mediaCode,'',{currentTour:null,isAudioListening:true,document:{getElementById(){return null;}},
    navigator:{mediaSession:{setActionHandler(n,f){handlers[n]=f;}}},MediaMetadata:class{},
    toggleAudioPlayback(){pauses++;},forceResurrectPilgrimAudio(){}}).c;
  mc.updateMediaSessionMetadata();assert(handlers.pause);handlers.pause();assert.equal(pauses,1);
  if(patchMode){
    const hashes=JSON.parse(report.match(/<!-- BASELINE-HASHES (.*?) -->/)[1]);
    for(const [file,h]of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),h,file);
  }
  console.log('V51 PASS: syntax, finite extremes, manual long speech, FIR/SRC, continuation blend, reorder, timer generation/TTL, peer isolation, gesture, wake single-flight, user pause');
  console.log('HTTP baseline: 23 frames / 450 ms drain -> '+kept+' survive; this is not zero-drop HTTP');
}
```

### Tek komutla rapor kodunu çalıştırma

Proje kökünde PowerShell:

```powershell
node -e "const fs=require('fs');const s=fs.readFileSync('AUDIO_EXCELLENCE_REPORT.md','utf8').replace(/\r\n/g,'\n');const f=String.fromCharCode(96).repeat(3);const b=[...s.matchAll(new RegExp(f+'js\\s*\\n([\\s\\S]*?)'+f,'g'))].map(m=>m[1]);const t=b.find(x=>x.startsWith('// PATCH: verify-v51'));new Function('require',t+';return runStep5V51AudioChecks({patches:true});')(require).catch(e=>{console.error(e);process.exitCode=1;});"
```

Bu tek komut öneri kodlarını bellekte test eder. Kaynaklara uygulanmış v51 E2E sonucu değildir. Tam kaynak entegrasyonu sonrası `node scripts/verify-system.js` ayrıca çalıştırılır. Yeni fonksiyonun patchMode=false kolu capture/player/recovery/media için uygulanmış dosyaları okur; timer/fanout/WakeLock unit testleri rapordaki tam fonksiyonları çalıştırır. Bu ayrım rapor artefaktı kaldırılırsa testlerin de bağımsız test modülüne taşınmasını gerektirir.

### Mobil ve akustik saha kabulü

Gerçek iPhone Safari/PWA, düşük/orta Android Chrome, BT tak/çıkar, kilit 30 dk, WhatsApp, alarm/arama, 300–500 ms burst, ±100/1000 ppm clock, 100/500+ gerçek alıcı. Ölçüler: ağızdan kulağa p50/p95/p99, frame loss/late/resync/concealed, render deadline/GC, Türkçe-Arapça kelime/fonem kaybı ve kör dinleme. Yan ses, aynı anda konuşma ve 50–400 ms çok cihaz yankısı ayrı kayıtlarla ölçülür. İki telefonun Date.now farkı uçtan uca gecikme ölçümü değildir.

### Gerçek HTTP/WebSocket E2E ek testi

Aşağıdaki fonksiyon scripts/verify-system.js içine eklenir. `runStep2And3LiveServerAndWsTests` içinde `authToken` elde edildikten sonra, kapanıştan önce **`await runV51TransportRoundTrip({url:wsUrl,token:authToken});`** çağrılır. Ayrı test alt odası açar, token'ı loglamaz, iki soketi finally'de kapatır. Bu fonksiyon raporun öneri-code VM testinden farklı olarak **gerçek uygulanmış server.js** ile çalışır. Mevcut v50 seq=0/null hatası nedeniyle başarılı olması beklenmez; v51 seq yaması sonrası geçmelidir. Bu yeni E2E henüz kaynağa uygulanıp çalıştırılmadı; baseline 22/22 ile karıştırılmamalıdır.

```js
// PATCH: transport-e2e-v51
async function runV51TransportRoundTrip({url,token}){
  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
  const guide=new WebSocket(url),listener=new WebSocket(url);
  const binaries=[],jsons=[];let joined=0;
  const until=async predicate=>{
    const end=Date.now()+3000;
    while(!predicate()){if(Date.now()>end)throw Error('V51 transport deadline');await new Promise(r=>setTimeout(r,10));}
  };
  const open=socket=>new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  guide.on('message',(raw,binary)=>{if(!binary){try{if(JSON.parse(raw).type==='joined')joined++;}catch(e){}}});
  listener.on('message',(raw,binary)=>{
    if(binary)binaries.push(Buffer.from(raw));
    else{try{const m=JSON.parse(raw);if(m.type==='joined')joined++;jsons.push(m);}catch(e){}}
  });
  try{
    await Promise.all([open(guide),open(listener)]);
    const room='v51-'+Date.now().toString(36);
    guide.send(JSON.stringify({type:'join',role:'guide',token,tourCode:'RY-KASIM',roomId:room,name:'V51 test guide'}));
    listener.send(JSON.stringify({type:'join',role:'pilgrim',tourCode:'RY-KASIM',roomId:room,name:'V51 test listener'}));
    await until(()=>joined===2);
    guide.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));
    const make=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);b.writeInt16LE(1234,12);return b;};
    guide.send(make(0));guide.send(Buffer.alloc(2060));guide.send(make(2));
    const unit=seq=>({type:'audio-chunk',seq,sentAt:Date.now(),sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
    guide.send(JSON.stringify({type:'audio-chunk',frames:[unit(0),unit(1),unit(2)]}));
    await until(()=>binaries.some(b=>b.readUInt32LE(0)===2)&&jsons.filter(m=>m.type==='audio-chunk').length>=3);
    assert.equal(binaries.length,2);assert(binaries.every(b=>b.length===972));
    assert.equal(binaries[0].readUInt32LE(0),0);assert.equal(binaries[0].readInt16LE(12),1234);
    const audio=jsons.filter(m=>m.type==='audio-chunk');
    assert.deepEqual(audio.map(m=>m.seq),[0,1,2]);assert(audio.every(m=>Buffer.from(m.pcm16,'base64').length===960));
    if(typeof recordResult==='function')recordResult('ADIM-3.V51','Gerçek WS: binary ve JSON seq=0, batch framing ve bozuk frame reddi',true);
  }finally{
    for(const s of [guide,listener]){s.removeAllListeners();try{s.terminate();}catch(e){}}
  }
}
```

## 5. Bu denetimde doğrulanan sonuç ve kalan sınır

- Diskteki v50: 22/22 mevcut test geçti. Kaynaklarla talepte anılan WebRTC/RYS2/RysBiquad/RysLimiter sürümü aynı değil.
- Bu rapordaki v51 kodları: sözdizimi, sayısal aşırı değerler, elle seçilen uzun konuşma modu, iki hızda FIR/SRC, PLC continuation overlap, seq/reorder, timer generation/yerel TTL, peer hata izolasyonu, gesture resume, WakeLock single-flight ve bilinçli pause testleri geçti.
- HTTP baseline VM: 450 ms sonunda 23 frame'den 10'u TTL içinde kaldı. Bu politikayla sıfır kayıp iddiası yanlış.
- Gerçek v51 tam uygulama E2E ve mobil/akustik saha testleri yapılmadı. Kaynağa uygulanacak yeni testler rapor içinde verildi; sahte başarı sayısı üretilmedi.

Uzun konuşmada otomatik kapı ile %100 yan ses izolasyonunu aynı anda garanti eden bir DSP eklenmedi. Manuel continuousSpeech uzun okumayı korur ve ortamı da geçirir. Üretim çözümünün fiziksel mikrofon/izolasyon, codec/medya altyapısı ve ölçülmüş cihaz desteği ayağı devam ediyor.
