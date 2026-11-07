# AUDIO EXCELLENCE REPORT — v51 denetimi ve v52 önerileri

7 Kasım 2026. İncelenen Git HEAD: `35dd2b0eb898a61546d728ca07ec957e42ac83b9`. Kaynak dosyalar değiştirilmedi; yalnız bu rapor oluşturuldu. Aşağıdaki yamalar diske uygulanmadı.

## 1. v51 doğrulama özeti

**İstenen `node scripts/verify-system.js` çalıştırıldı: exit 1.** Önceki 23 kontrol PASS oldu, fakat Step5 `AUDIO_EXCELLENCE_REPORT.md` için ENOENT ile durdu. Başlangıçta rapor Git'te silinmiş görünüyordu. Bu koşulda “23/23 + V51 PASS yeniden doğrulandı” veya “sıfır hatayla entegrasyon” denemez. Test kendi runtime snapshot'ını geri yazdı; kaynak dosyalara müdahale edilmedi.

| Yama | Disk / test durumu |
|---|---|
| capture-v51 | Finite giriş sınırı, FIR, continuousSpeech ve mute state var. 4 s minima + varsayılan kapı duruyor. |
| player-v51 | 72 kaynak örnek/3 ms PLC continuation overlap mevcut; q Map, seq mod 2^31. |
| coalescer / poll | 3×20 ms, 40 ms timer, generation koruması, oldest _queuedAt ve 100 ms poll mevcut. |
| fanout/binary/seq | Kısa kuyrukta terminate politikası, binary/JSON ortak send helper, seq=0 korunması mevcut. |
| rehber UI/graph | continuousSpeech kullanıcı kontrolü yok; processorOptions/fallback seçeneklerine aktarılmıyor. |
| receiver / mobile | Worklet tek medya yolu, context token ve WakeLock single-flight mevcut. Gerçek telefon deneyi yapılmadı. |
| SW | v51 ve sürümlü worklet cache girdileri mevcut; atomik dağıtım garantisi değildir. |
| Step1–4 / transport | 18 JS, 9 HTML içindeki 10 script; gerçek WS binary/JSON seq0, batch ve bozuk frame reddi dahil 23 PASS. |
| Step5 | Rapor metnine bağımlı; eksik raporda hata, bazı parçalar gerçek kaynaktan okunmuyor. v52'de kaldırılmalı. |

## 2. Bulgular, matematik ve kararlar

| Öncelik | Dosya:satır | Kök neden / sonuç |
|---|---|---|
| P1 | scripts/verify-system.js:1058–1188 | Step5 raporu/parçalarını okuyor. Testin öneri metnini test etmesi gerçek entegrasyon kusurunu gizleyebilir; rapor silinince test çalışmıyor. |
| P1 | public/rehber.html:1225–1286,1909–1937 | continuousSpeech yalnız çekirdekte. UI ve kurulum parametreleri yok; yeniden mikrofon kurulumunda manuel port tercihi kaybolur. |
| P1 | public/rehber.html:1728,1937 | playbackTime gelecekteki çıkış zamanı; currentTime−capturedAt negatifse 180 ms yaş filtresi onu taze kabul eder. Bu bir numeric crash değil, yakalama yaşı semantiği hatasıdır. |
| P1 | public/pcm-player-worklet.js:164–187 | q>=32 halinde bütün kuyruk reset. 33 ardışık frame simülasyonunda 1 frame kalır; q tutarak drop politikasına geçilebilir. |
| P1 | server.js:432–439 | 9720 byte (~10 frame/200 ms) v51'in 9600 eşiğini aşar ve terminate tetikler. Kısa takılmada TCP/TLS/oda katılımı maliyeti yaratır. |
| P1 | public/vercel-ws-shim.js:819–822 | Tek 16 mesaj kuyruğu dolunca shift ses/kontrol ayrımı yapmadan en eskisini atar. inFlight süresince yeni mesaj kaybolmaz ama bu sınır/TTL yüzünden atılabilir. |
| P2 | public/vercel-ws-shim.js:827–875 | İşlem sürerken poll no-op. Başarılı POST sonrası yeni kuyruk ancak yeni send veya bir sonraki 100 ms tick ile boşalır. close/failback sonrasında eski fetch cevabı teslim edilebilir. |
| P2 | public/pcm-capture-worklet.js:137–144 | Adaptif kapı kapalıyken gain .126 ≈ -17.99 dB; zayıflatılmış ortam sürekli taşınır. Bu comfort noise sentezi değildir. |
| P2 | public/dinle.html:2054–2132 | Binary ve JSON aynı Worklet yoluna gider. Konuşma için AudioBufferSourceNode fallback kalmamış; eski resampler/scheduled-source alanları ölü kalıntı. Modül yüklenmezse sessizlik var, otomatik ikinci playout yok. |

### 2.1 Uzun dua: hangi çözüm gerçekçi?

Harmonik/pitch/spectral flux ile otomatik rehber kimliği ayrımı mevcut değil. Sürekli tonal konuşma 4 s pencere sonunda noise'a öğrenilebilir. Pitch periodicity, aynı anda konuşan yan kişiyi de bulur; sessiz s/ş/f ve reverb altında güvenilir kaynak kimliği sağlamaz. Bu nedenle v52 otomatik “kusursuz konuşmacı ayırıcı” eklemez. Açık kullanıcı tercihi olan uzun okuma kontrolü ekler, mikrofon yeniden kurulurken taşır. Uzun okuma modunda ortamın da geçebileceği UI'de açıklanır. Sessizlik/fade kararları bu modda devre dışı bırakılır.

85–95 dB SPL dBFS değildir; kalibre mikrofon/mesafe bilinmeden sabit dijital eşik önerisi saha garantisi olmaz. Boom mikrofon, rüzgarlık, hacıda kulaklık ve doğrulanmış denoiser/Opus medya altyapısı hâlâ gereklidir.

### 2.2 Fallback zamanı

Worklet currentTime, render quantum başlangıcının context zamanıdır. ScriptProcessor playbackTime çıkış tamponunun oynatılacağı zamanı gösterir; gerçek ADC örnek saatinin yerine geçmez. Örneğin currentTime=10.000, playbackTime=10.043 ise yaş=-43 ms; 180 ms filtresi yakalamaz. [Web Audio API](https://www.w3.org/TR/webaudio/) zaman alanlarının birincil dayanağıdır.

Yama fallback için callback context zamanı−inputDuration ile **tahmini blok başlangıcı**, kernel içinde örnek başına zaman artışı kullanır. Bu normal 2048@48k bloğu yaklaşık 0–42.67 ms yaş aralığına getirir. Ana thread uzun süre askıda kaldığında tarayıcının girdi tamponunun gerçek yaşını tam ölçtüğü iddia edilmez. ScriptProcessor geri dönüşü Worklet ile yaşam döngüsü/güvenilirlik açısından eşit değildir.

### 2.3 Comfort-Fade ve DTX ayrımı

-18 dB taban bir izolasyon garantisi değildir. V52 adaptif modda kapı kapandıktan 600 ms sonra 80 ms zaman sabitli dip ses fade'i ekler; tekrar açılma 3 ms, mevcut 10 ms lookahead korunur. Eşik VAD yanlış kapanırsa fade hedef konuşmayı da azaltabilir; kullanıcı bu kontrolü kapatabilir. Uzun okuma bunu bypass eder.

**v52 paket DTX'i açmaz.** 480 örnek/20 ms ve seq sürekli kalır, sessizlik sıfır PCM olarak gider. Böylece kulağa dip hışırtısı azaltılır, ağ trafiği azaltılmaz: mono PCM payload 384 kbit/s + başlık ≈388.8 kbit/s, Base64 daha yüksek. Ağ tasarrufu için açık DTX/CNG/gap+stream-id+media timestamp müzakeresi veya [Opus](https://www.rfc-editor.org/rfc/rfc6716.html) gerekir. Sıfır frame'leri sessizce göndermemek önceki timeline sorunlarını geri getirir.

### 2.4 Kuyruk taşması

32×20=640 ms **medya süresi**; tüm frame'lerin konuşma olduğu anlamına gelmez. Eski birkaç frame'i atmak bütün kelimeleri korumaz; atılan medyanın içeriği yine kaybolur. Öneri 33 frame'den en yeni 24'ü saklar, 9 frame/180 ms atlar; mevcut çalan frame/ASRC phase korunur ve sonraki kaynak frame sınırında 3 ms PLC-continuation overlap yapılır. Başlangıç simülasyonunda 24 frame saklanır, 1'e düşmez. Kalan 480 ms gecikme bilinçli bir üst sınırdır; hedef 80–260 ms'ye anında inildiği söylenmez. WSOLA/opus zaman ölçekleme ayrı kapsamdır. Çok büyük seq sıçraması/ayrı kaynakta tam reset hâlâ gerekir; v1 stream-id taşımadığı için kaynak değişimi kesin ayırt edilemez.

### 2.5 Backpressure ve inFlight

Soft eşikte yeni frame düşürmek, zaten TCP'ye verilmiş bayat sesi silmez; geçici stall'da yeniden handshake'i önler. V52 binary soft=9720, JSON soft=16000 byte; hard=65536 byte veya soft üstünde kesintisiz 2 s. Drop/resync/terminate ölçülür. Tek kötü dinleyiciye ek ses yığılmaz; ortak event loop/CPU/egress maliyeti diğerlerini yine etkileyebilir. `bufferedAmount` işletim sistemi/radyo uçtan uca kuyruk yaşı değildir. [ws belgeleri](https://github.com/websockets/ws/blob/master/doc/ws.md) send/bufferedAmount/terminate sözleşmesini açıklar.

İşlem sürerken yeni mesajlar _sendQueue'da kalır, 100 ms timer ikinci fetch açmaz. V52 başarı sonrası yeni kuyruğu microtask ile boşaltır; hata halinde hızlı retry döngüsü kurmaz. Kontrol ve ses için ayrı sayısal sınırlar, 200 ms yerel medya TTL, close sırasında AbortController ve eski cevap guard'ı eklenir. HTTP RTT+zamanlayıcı askısı TTL'yi aşarsa kayıp sürer; 100 ms poll düşük gecikme garantisi değildir. Çok sayıda dinleyici için persistent medya yolu gerekir.

## 3. Eksiksiz v52 yamaları

Yamalar burada sunulmuştur, mevcut dosyalara yazılmamıştır. Header 12 bayt/480 örnek sözleşmesi korunur. HTML ve iki worklet/shim/SW release sürümleri birlikte geçirilmelidir. Aşağıdaki kodlar gövde atlayan yer tutucu içermez.


### public/pcm-capture-worklet.js — dosyanın tamamı

Comfort fade tüm PCM frame’leri üretmeye devam eder; gerçek DTX değildir. continuousSpeech=true iken fade bypass olur.

```js
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
    this.comfortAttack=1-Math.exp(-1/(24000*.003));
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
      this.comfortGain+=(want-this.comfortGain)*(want>this.comfortGain?this.comfortAttack:this.comfortRelease);
      if(want===0&&this.comfortGain<1e-6)this.comfortGain=0;
      const y = v * this.mg * this.comfortGain;
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


### public/rehber.html — kullanıcı kontrolü

guideSpectrum div satırının hemen sonrasına bu tam HTML bloğunu ekleyin.

```html
<div style="margin:12px 0;color:#CBD5E1;">
  <label><input id="guideContinuousSpeech" type="checkbox" onchange="setGuideContinuousSpeech(this.checked)" />
    Kesintisiz uzun dua / okuma</label>
  <p style="font-size:.8rem;">Uzun okumada ses kapısı kapanmaz; çevredeki konuşmalar da duyulabilir.</p>
  <label><input id="guideComfortFade" type="checkbox" checked onchange="setGuideComfortFade(this.checked)" />
    Cümle sonrasında dip sesi yumuşat</label>
  <p id="guideProfileStatus" role="status" style="font-size:.8rem;">Dengeli ses profili</p>
</div>
```


### public/rehber.html — yeni profil state ve fonksiyonları

let zeroGainNode tanımından önce bir kez ekleyin. Tercih sayfa oturumu boyunca saklanır; mikrofon iyileştirmesinde korunur; sayfa reload varsayılana döner.

```js
// PATCH: guide-profile-v52
let guideContinuousSpeech=false;
let guideComfortFade=true;
function syncGuideAudioProfile(){
  const speech=document.getElementById('guideContinuousSpeech');
  const comfort=document.getElementById('guideComfortFade');
  const status=document.getElementById('guideProfileStatus');
  if(speech)speech.checked=guideContinuousSpeech;if(comfort)comfort.checked=guideComfortFade;
  if(status)status.textContent=guideContinuousSpeech?'Uzun okuma açık; çevre sesi de geçebilir.':
    (guideComfortFade?'Dengeli profil; cümle sonrası dip ses yumuşar.':'Dengeli profil; ortam tabanı korunur.');
  try{scriptProcessor?.port?.postMessage({type:'set-profile',reject:guideSideVoiceRejectLevel,
    continuousSpeech:guideContinuousSpeech,comfortFade:guideComfortFade});}catch(e){console.warn('Ses profili sonraki mikrofon kurulumunda uygulanacak',e);}
}
function setGuideContinuousSpeech(enabled){guideContinuousSpeech=!!enabled;syncGuideAudioProfile();}
function setGuideComfortFade(enabled){guideComfortFade=!!enabled;syncGuideAudioProfile();}
```


### public/rehber.html — setupGuideMicrophoneGraph tamamı



```js
// PATCH: guide-graph-v52
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

      guideGateEnv = 0;
      guideGateGain = 1.0;
      guideNoiseFloor = 0.0012;
      guideVoiceRefEnv = 0.045;
      guideSpeechHoldSamples = 0;
      guideDirectPauseSeen = false;
      guideTxRmsRing.fill(0);
      guideSilentChunksCount = 0;
      guideWasIdlePaused = true;

      lastGuideMicChunkAt = Date.now();
      const ctx = audioCtx;
      const url = "/pcm-capture-worklet.js?v=52-audio";
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


### public/pcm-player-worklet.js — dosyanın tamamı



```js
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
      this.pendingQueueBlend=true;
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
      const recovery=this.missing>0||this.pendingQueueBlend;this.pendingQueueBlend=false;
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


### server.js — rysSendAudio tamamı

Mevcut helper yerine geçer; broadcastToRoom ve binary fanout çağrıları değişmez. now opsiyonel parametresi yalnız deterministik test içindir.

```js
// PATCH: fanout-v52
function rysSendAudio(socket,data,binary=false,now=Date.now()){
  if(socket.readyState!==WebSocket.OPEN||socket._rysClosing)return false;
  const stop=()=>{socket._rysClosing=true;try{socket.terminate?.();}catch(e){}};
  const queued=Number(socket.bufferedAmount)||0,soft=binary?9720:16000;
  if(!socket.isHttpRelay){
    if(queued>65536){stop();return false;}
    if(queued>soft){
      socket._rysAudioDrops=(socket._rysAudioDrops||0)+1;
      if(socket._rysCongestedAt==null)socket._rysCongestedAt=now;
      if(now-socket._rysCongestedAt>=2000)stop();
      return false;
    }
    socket._rysCongestedAt=null;
  }
  try{
    if(socket.isHttpRelay)socket.send(data);
    else socket.send(data,{binary},err=>{if(err)stop();});
    return true;
  }catch(e){socket._rysAudioErrors=(socket._rysAudioErrors||0)+1;return false;}
}
```


### public/vercel-ws-shim.js — send tamamı

SmartWebSocket sınıfı içindeki mevcut send metodunun yerine koyun; kurucudaki installRysCoalescing çağrısı korunur.

```js
// PATCH: shim-send-v52
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
          this._joinContext = parsed;
          if (this._isRelay) this._initMqttBus(parsed, false);
        } else if (parsed.type === 'family-subscribe') {
          this._joinContext = {
            type: 'join',
            role: 'pilgrim',
            tourCode: parsed.tourCode || 'RY-KASIM',
            roomId: 'genel',
            name: 'Aile Takipçisi'
          };
          if (this._isRelay) this._initMqttBus(this._joinContext, false);
        } else if (parsed.type === 'admin-subscribe') {
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


### public/vercel-ws-shim.js — yeni enqueue metodu

SmartWebSocket sınıfına _flushAndPoll öncesinde ekleyin. Ses en fazla 4 batch, kontrol en fazla 64; kontrol taşmasında yeni kontrol reddedilip sayaç artırılır. ACK/kalıcı outbox teslimat garantisi ayrıca gerekir.

```js
// PATCH: shim-queue-v52
_enqueueRelayMessage(message){
  const now=Date.now();
  this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk'||
    (Number.isFinite(m._queuedAt)&&now-m._queuedAt<=200));
  const audio=message.type==='audio-chunk';
  const matches=this._sendQueue.filter(m=>(m.type==='audio-chunk')===audio).length;
  const limit=audio?4:64;
  if(matches>=limit){
    this._relayQueueDrops=(this._relayQueueDrops||0)+1;
    if(!audio)return false;
    const oldest=this._sendQueue.findIndex(m=>m.type==='audio-chunk');this._sendQueue.splice(oldest,1);
  }
  this._sendQueue.push(message);return true;
}
```


### public/vercel-ws-shim.js — _flushAndPoll tamamı



```js
// PATCH: shim-http-v52
async _flushAndPoll(){
  if(this.readyState!==1||!this._isRelay)return;
  if(this._inFlight)return;
  const epoch=this._httpEpoch||0;
  const batch=this._sendQueue.splice(0).filter(m=>m.type!=='audio-chunk'||
    (Number.isFinite(m._queuedAt)&&Date.now()-m._queuedAt<=200));
  if(!batch.length&&this._busConnected())return;
  this._inFlight=true;const ac=new AbortController();this._relayAbort=ac;
  const timer=setTimeout(()=>ac.abort(),3000);let success=false;
  try{
    const token=(localStorage.getItem('ry_auth_token')||'').trim();let res;
    if(batch.length)res=await fetch('/api/ws-relay',{method:'POST',signal:ac.signal,
      headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:this._clientId,
        token,joinContext:this._joinContext,messages:batch})});
    else{
      const jc=this._joinContext||{},q=new URLSearchParams({clientId:this._clientId,
        tourCode:jc.tourCode||'',roomId:jc.roomId||'genel',role:jc.role||'pilgrim',name:jc.name||''});
      if(token)q.set('token',token);res=await fetch('/api/ws-relay?'+q,{signal:ac.signal});
    }
    if(!res.ok)throw Error('Relay HTTP '+res.status);
    const payload=await res.json();
    if(this.readyState!==1||!this._isRelay||(this._httpEpoch||0)!==epoch)return;
    if(Array.isArray(payload.messages))for(const m of payload.messages)this._deliverIncomingMessage(m);
    success=true;
  }catch(e){
    if(this.readyState===1&&this._isRelay&&(this._httpEpoch||0)===epoch)
      for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
  }finally{
    clearTimeout(timer);
    if(this._relayAbort===ac)this._relayAbort=null;
    if((this._httpEpoch||0)===epoch)this._inFlight=false;
    if(success&&this.readyState===1&&this._isRelay&&this._sendQueue.length)
      queueMicrotask(()=>{if(this.readyState===1&&this._isRelay)this._flushAndPoll();});
  }
}
```


### public/vercel-ws-shim.js — close tamamı



```js
// PATCH: shim-close-v52
close() {
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


<!-- SOURCE-HASHES {"public/pcm-capture-worklet.js": "5f2516a46d3d12e798260616de8df158f321ef683d8911e6c79e2d0726a86f01", "public/pcm-player-worklet.js": "00ae9d286965d13bb2a03f28f2e5708d8a98e7a24407147251d5ac6dad4d109f", "public/rehber.html": "d227bf53e9618e4f8cbce5475990e91aa03b16a4f33ad1286b224870351479f7", "public/dinle.html": "0ad06a902e428be825530e5b4902b5c22e62fecb4de2b95704c7f4c612ae4ed4", "public/vercel-ws-shim.js": "37639df3bca4df8125f2b09c2fe688553149d1f5610cfcf0963b8e532c0af0c1", "server.js": "6b990c64bc770bed71728ce0025db43c5b272a4a18502a6f3290c75e2dbf444c", "public/sw.js": "45e5cadbc48538777b114c513a14c0f9ffea1b6d862afd6971d14144f468a36f", "scripts/verify-system.js": "c745eb4d9661fed4cd235bc0612da5435dd9b859902d86b0ce1c755d0bdb50be"} -->

## 4. Rapor metninden bağımsız v52 doğrulaması

`scripts/verify-system.js` içindeki `runStep5V51AudioChecks` fonksiyonunun **tamamını** aşağıdakiyle değiştirin. `main()` içindeki `await runStep5V51AudioChecks();` satırını `await runStep5V52AudioChecks();` yapın. Step1–4 ve gerçek `runV51TransportRoundTrip` korunur. Yeni Step5 yalnız hedef kaynak dosyalarını okur; rapor/patch etiketi/hash manifesti/parça kataloğu aramaz. Raporu silmek testin çalışmasına engel olmaz.

```js
// PATCH: verify-v52
async function runStep5V52AudioChecks(){
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
  const recovery=new P();recovery.expected=7;recovery.missing=1;
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
  if(typeof recordResult==='function')recordResult('ADIM-5.V52','Kaynak dosyalarından DSP, profil, sıra, fanout ve relay davranışları doğrulandı',true);
  console.log('V52 PASS: source-only DSP/SRC/comfort/profile, queue/PLC/seq, binary+JSON dedup, coalescer, congestion, HTTP single-flight/drain/close, gesture/wake/pause');
}
```

Testler bağımsızlığını raporu okumayarak sağlar; fonksiyon/sınıf seçicisi gerçek deklarasyonu bulup Node parser ile tamamlanan ilk gövdeyi seçer; tek satırlı gövdeleri de destekler. Sembol bulunamazsa fail eder. Graph testi dynamic import sınırını mock'lar; gerçek tarayıcı modül yükleme/CSP/arka plan davranışını kanıtlamaz. E2E HTTP/WS kısmı Step2–3'te gerçek localhost sunucusunu kullanmaya devam eder. Gerçek radyo/roaming veya 85–95 dB SPL sahası simüle edilmiş sayılmaz.

### public/dinle.html — initRxPlayerWorklet tamamı (release sürümü)

Mevcut context token/callback kimliği ve tek oynatıcı davranışı korunur.

```js
// PATCH: rx-init-v52
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
        .addModule('/pcm-player-worklet.js?v=52-audio')
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

### public/sw.js — dosyanın tamamı (release sürümü)

```js
// PATCH: sw-v52
// PATCH: sw-v52
const CACHE_NAME = 'ridvanses-pwa-v52';
const ASSETS_TO_CACHE = [
  '/',
  '/dinle',
  '/rota',
  '/ani-kitabi',
  '/css/style.css',
  '/vercel-ws-shim.js?v=52',
  '/js/umrah-steps-map.js',
  '/pcm-capture-worklet.js?v=52-audio',
  '/pcm-player-worklet.js?v=52-audio',
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

İki HTML'deki shim script etiketini bu tam etiketle değiştirin:

```html
<script src="/vercel-ws-shim.js?v=52"></script>
```

Dinle sayfasındaki mevcut SW register satırının yerine:

```js
// PATCH: sw-register-v52
navigator.serviceWorker.register('/sw.js?v=52').catch(() => {});
```

Bu sürüm numaraları dağıtım eşlemesi içindir; cache güncellemesini tek başına atomik kabul etmeyin. Eski v51 istemcileriyle 480 örnek/12 bayt sözleşmesi aynı olsa da aktif ses davranışı farklıdır. Gerçek rollout/canary ve geri alma iki HTML, worklet'ler, shim, server/test ve SW sürümünü birlikte yönetmelidir.

## 5. Çalıştırılan kanıtlar ve uygulama durumu

| Çalıştırma | Gerçek sonuç |
|---|---|
| Diskteki v51, istenen node scripts/verify-system.js | 23 kayıt PASS; Step5 eksik rapor nedeniyle ENOENT; exit **1** |
| v51 33 ardışık frame VM | q.size=1, expected=32, resync=1 |
| v51 bufferedAmount=9720 byte | terminate sayısı=1 |
| Fallback zaman örneği | currentTime=10, playbackTime=10.043 → yaş=-43 ms |
| v52 kaynak adayları bellekte, yeni bağımsız Step5 | **V52 PASS**; testin raporu okuması engellenerek çalıştırıldı |
| Aynı adaylar bellekten yüklü gerçek localhost HTTP/WS test paketi | **24/24 PASS + V52 PASS, exit 0** |
| Değişiklik kontrolü | İncelenen 8 kaynak dosyanın SHA-256 değerleri aynı; yalnız bu rapor yazıldı |

Aday doğrulaması şu şekilde yapıldı: yamalar yalnız bellekteki kaynak kopyalarına uygulandı; aday JS ve HTML script blokları derlendi. Node modül yükleyicisi/okuyucusu aday kopyaları sundu; Express/ws localhost üzerinde gerçek HTTP/WS alışverişi yaptı. Diskteki kaynaklar değiştirilmedi. Paket içindeki ilk 18 dosyalık node --check taraması diskteki tabanı tarar; ayrıca aday dosyaların tamamı önceden ayrı syntax kontrolünden geçirildi. Baseline v51 ile aday v52 sonucu birbirine karıştırılmamalıdır.

Yeni Step5 testinin kendisi yalnız gerçek kaynak yollarını okur. Rapor metninden aday oluşturma işlemi denetim provasıdır ve uygulamanın test kodunun bağımlılığı değildir. Bu raporu silerek bağımsız test çalıştırma, ancak v52 test yaması kaynaklara uygulandıktan sonra mümkündür; diskte kalan eski v51 Step5 hâlâ rapora bağımlıdır.

### Kapsam sınırları ve saha kabulü

Hata bulunmadığı veya sıfır akustik kusur garanti edildiği sonucu çıkarılmadı. Yeni UI, DSP ve zaman kontrolleri VM/mocked API ile; auth/oda/taşıma gerçek localhost ile doğrulandı. Gerçek browser CSP/modül yükleme, mobil background, BT/arama, 85–95 dB kalabalık kaydı, mikrofon clipping'i, çok cihaz feedback ve yüzlerce dinleyicinin ortak radyo/egress yükü denenmedi.

Uygulama sonrasında ayrı testler: 30 dk kilit ekranı, arama/alarm/WhatsApp sonrası kurtarma, düşük Android/iPhone Safari/PWA, 100–500 ms burst, %1–5 ardışık kayıp, 100/500+ alıcı, uzun Arapça okuma, s/ş/f başlangıçları ve cümle sonları. mouth-to-ear p50/p95/p99, late/concealed/queueDropped/resync, socket soft-drop/hard-close, relay retry/queue drops ve fonem kaybı ölçülmeli. Farklı telefonların Date.now farkı tek yönlü akustik gecikme ölçümü değildir.

Öncelik: bağımsız test → UI/profil aktarımı → fallback zaman semantiği → bounded kuyruk budama/backpressure → HTTP close/drain → isteğe bağlı comfort-fade. Comfort-fade hece korunumu ölçümü olmadan zorunlu izolasyon modu olarak pazarlanmamalı. Gerçek DTX, neural ayrıştırma, Opus/SFU ve WSOLA ayrı geliştirmelerdir.
