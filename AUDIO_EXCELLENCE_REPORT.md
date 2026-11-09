# RıdvanSes v60 — v59 Uygulama, Ses Zinciri ve Yarış Denetimi

**9 Kasım 2026 — taban HEAD: e41e2011006aec051ce49d9a0f99442486b99feb.** Yalnız bu rapor yazıldı; kaynaklara yama uygulanmadı, commit/push/dağıtım yapılmadı. Kullanıcının önceden sildiği AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md korunur.

## 1. Karar: v59 diff uygulanmış; P2-59-08 tamamlanmamış

Önceki raporun v59 unified diff'i için **git apply --reverse --check --ignore-space-change -: exit0**.12 hedef dosyada diff'in geri alınabilir olması, yayınlanan diff'in uygulandığını gösterir. Diskte **node scripts/verify-system.js:36/36 PASS, exit0**; eski V53–V59 E2E/unit kontrolleri geçti.

**Önemli düzeltme:** Önceki raporun bulgular tablosu ve9.2 açıklaması FIR/player testinin tamamlandığını söylüyor; fakat o rapordaki unified diff'te de diskte de RysOutputFir/rxFir ve düşük çıkış hızı alias testi yok. Bu kullanıcı uygulama hatası değildir: önceki raporun açıklaması ile teslim edilen patch/test içeriği tutarsızdı. Önceki “tamamlandı” hükmü geri alınmıştır. Bu tur karar yalnız rapordan yeniden kurulan adayın gerçek test sonucuna dayanır; sonuç bölümünde disk ve aday ayrı gösterilir.

| v59 kontrolü | Disk sonucu |
|---|---|
|12 dosyalık unified diff reverse-check | PASS |
|36 test | PASS |
|Player'da FIR sınıfı, reset/starvation yaşam döngüsü, pre-Hermite bağlantı | YOK (public/pcm-player-worklet.js:11,104–135,210–212,260–299) |
|8/16kHz player alias testi | YOK (scripts/verify-system.js:2224–2314) |
|ADIM-5.V59 içindeki8/16kHz döngü | Capture girişini sınar; player sampleRate48kHz kalır. Çıkış alias kusurunu kapsamaz. |
|Zorunlu devicechange'in3s cooldown'da yutulmaması | Eksik (rehber.html:1773–1775) |

**v60 gereklidir.** “Hiç kusur kalmadı” kararı verilmez. Aşağıdaki tek diff eksik FIR'ı, mikrofon yaşam döngüsündeki tekrar üretilebilen yarışları ve bu değişikliklerin testlerini içerir.

## 2. Yeni bulgular ve çözümler — v59 disk satırları

| Kimlik | Yer | Tetikleyici / sonuç | v60 işlemi |
|---|---|---|---|
|P2-59-08 (açık) | public/pcm-player-worklet.js:82,104,210–212,260–299; verify:2224–2314 | Gerçek çıkış8/16kHz ise24kHz PCM yalnız Hermite ile küçülür; Nyquist üstü enerji konuşma bandına katlanır. | Çıkış<24kHz için193-tap Blackman FIR, cutoff0.45×çıkışHz; _pull içinde Hermite'den önce; reset ve starvation'da sıfırlama. Gerçek player render alias testi. |
|P1-60-01 | public/rehber.html:1641–1654,1724–1746,1961–2020,2074–2095 | getUserMedia beklerken stop; izin sonradan gelir ve toggle devam edip yayını açar. Testte isMicBroadcasting=true, eski track live/stops0 ve bir yeniden yayın çağrısı görüldü. Durdurulmuş mikrofonun açılması mahremiyet ve ses karışması kusurudur. | Generation + yerel kaynak sahipliği; stop pending işi geçersiz kılar; sonradan gelen track durdurulur; commit yalnız güncel kuşakta. |
|P2-60-02 | rehber.html:1503–1538,1726–1758,1767–1813,1858–1957 | Aynı AudioContext'teki eski callback yalnız bağlama bakar; eski kurulum global stream/processor'ı ezebilir. Eski heal finally yeni heal kilidini açabilir.4s önizleme eski kaldığı halde yeni grafiği durdurabilir. | Yerel graph transaction, node/stream/kuşak kontrolü; heal ticket; eski finally güncel işi değiştirmez; preview ve start sahiplik kontrolleri. |
|P2-60-03 | rehber.html:1773–1775,1815–1820 | Force isteği3s cooldown'a takılır veya başka heal sürerken kaybolur; heartbeat live/çalışan eski izi gördüğünde rota yenilemesi tekrar yapılmaz. | Pending devicechange bayrağı; force cooldown'ı aşar; heal sırasında gelen yeni force bayrağı sonraki denemeye korunur. |
|P2-60-04 | rehber.html:1503–1509; pcm-capture-worklet.js:223–239 | disconnect eski ScriptProcessor handler'ını/processorerror'ı kapatmıyor; Worklet process daima true. Eski closure ve etkin işlemci ömrü için gereksiz tutunma riski. Ölçülmüş saha heap sızıntısı iddiası değildir. | Handler temizleme, MessagePort kapama ve stop kontrol mesajı; capture processor stop sonrası false döner. DSP hesapları değişmez. |
|P2-60-05 | rehber.html:1908–1945 | Önizleme kendi filtresiz Hermite küçültmesini yapıp dinleyiciyle birebir ve%0 robotik ses iddiası gösterir. Ağ/jitter/PLC bu testte yoktur. |24kHz kaynak buffer'ı korunur, bağlam dönüşümünü AudioBufferSource yapar; UI yalnız mikrofon kaydı testi olduğunu söyler. Preview kaynak/veri temizliği test edilir. |

Kurulum iptali getUserMedia izin penceresini kapatamaz: tarayıcı API'si AbortSignal almaz. İzin sonucunun uygulamayı tekrar etkinleştirmesi engellenir; geç gelen track hemen durdurulur. İzin hiç sonuçlanmazsa tarayıcının bekleyen isteği uygulama tarafından zorla sonlandırılamaz. Kurulum başına yalnız yerel kaynaklar temizlenir; eski cleanup yeni graph'a dokunmaz.

## 3. v60 ses ve yaşam döngüsü tasarımı

**Player FIR:**193 katsayı,256 örneklik ring,normalize DC kazancı1,Blackman pencere; kaynak24kHz'te96 örnek=4ms group delay. Yalnız gerçek AudioContext çıkışı24kHz altındaysa çalışır.24/44.1/48kHz bypass; sürekli FIR durumu paket sınırında korunur. PLC/catch-up karışımı önce, FIR sonra, mevcut sürekli-faz Hermite en sonda. Resync/reset/starvation FIR geçmişini temizler. İşlem sample başına allocation yapmaz; düşük hızlı çıkışta yaklaşık4.6M MAC/s ek maliyet cihazda ölçülmelidir. Bu seçilmiş bir FIR tasarımıdır; bütün tarayıcı/codec'lerde fiziksel sıfır alias veya bütün frekanslarda aynı stopband garantisi değildir.

**Mikrofon:** Her setup artan generation ve iptal edilebilir yerel job alır. Stream/EQ/processor yerel hazırlanır; güncellik her await sonrasında denetlenir. Başarılı graph tek senkron bölümde global olur; yenisi hazır olmadan eski kurulumun cleanup'ı yeni kaynakları durduramaz. Frame, track-ended, fallback audio callback ve processorerror yalnız güncel kuşak/stream/node'da etkili olur. Stop pending job'u temizler; start çift tıklaması iptal olarak işler. Eski heal finally yeni heal'in ticket'ını açamaz. Önizleme sonrası geç timer veya Promise sonucu yeni yayını kesemez. Aktif worklet'e stop iletilir; ana tarafta port/handler ve bütün düğümler bırakılır.

**Capture DSP korunur:**193-tap/256-faz24kHz dönüşüm,480 örnek/20ms paketler;400ms noise kalibrasyonu,4s minima,240ms hold,10ms lookahead,3ms attack/120ms release,comfort geçişi ve limiter matematiği değişmedi. v60-audio etiketi capture'ın yalnız yaşam döngüsü değişikliği içindir. Rehber gain ve dinleyici volume10ms ramp, listener WaveShaper4x, mevcut adaptive jitter80–260ms,60ms PLC decay ve±1000ppm ASRC korunur. Catch-up atlanan fonemi geri getirmez;72 örnek geçiş anlık genlik sıçramasını azaltır.

## 4. Sunucu,300 dinleyici, relay ve kalan sınırlar

server.js:431–449 her peer için backpressure uygular: binary soft9720B≈200ms,JSON16000B; hard>65536B veya2s soft tıkanmada yalnız o soket kapanır. Native aynı Buffer'ı paylaşır.451–464 JSON broadcast tek lazy parse;1283–1310 binary→HTTP ortak DTO;1372–1389 outbox audio10/200ms ve control64. Bu tur sunucuda bu akışları değiştirecek yeni tekrar üretilebilir kusur bulunmadı; v59 kodu korunur. Bu, genel güvenlik/sonsuz yük onayı değildir.

Ortak IP doğru katılım1200/dk, yanlış deneme60/dk ayrı scope; login30/dk korunur. Mevcut ADIM-3.V59 aynı IP'de300 katılım/301 gerçek WS/270 sağlıklı ve30 duraklatılan peer testini sürdürür.30 peer için bufferedAmount getter enjeksiyonu kullanılır: doğal TCP penceresinin dolduğu veya gerçek CGNAT radyo koşulunun emüle edildiği iddia edilmez. Peer'a önceden TCP ile yazılmış baytlar geri alınamaz; HOL ve gerçek kayıp konuşma vardır.

972×50×300=**116.64Mbit/s** salt native PCM uygulama egress'i; protokol/TLS/kontrol eklenir. Base64 salt PCM300 alıcıda en az153.6Mbit/s. HTTP fallback300×100ms tick yaklaşık3000 req/s'ye çıkabilir; single-flight/RTT azaltır. Yeni E2E bu300 HTTP kapasitesini sınamaz. WS/MQTT/HTTP parity, boş poll,35s relay expiry, rota ayrımı ve two-phase native handoff eski testlerle yeniden doğrulanır; broker bağlı diye boş poll kaldırılmaz.

RAM oda/relay Map'leri tek süreç/aynı instance varsayar. Vercel instance'ları paylaşımlı RAM sağlamaz; production HTTP relay uzun ömürlü tutarlı VDS veya paylaşımlı state gerektirir. Public MQTT istemci imzası özel kimlik/ACL/SLA yerine geçmez. VDS Nginx/CDN limit_conn/limit_req/timeout dosyaları burada bulunmadığı için upstream ortak-IP kapasitesi bu sonuçla kanıtlanmaz. Opus/WebRTC/SFU ve yetkili broker ayrı mimari iştir.

Listener dinle.html:1598–1653 context/load-token ve node callback koruması mevcut;1767–1824 resume sonrası her await'te ctx/listening/leave denetimi var. Bu alanlarda yeni somut race tekrar üretilemedi. AudioWorklet olmayan tarayıcıda aktif PCM fallback yoktur; destek sınırı sürer. Worklet q≤32, main pending13/260ms, shim audio4 batch/200ms ve control64 ile sınırlıdır. Player phraseSeen Set'i kullanılmıyor/büyütülmüyor; sınırsız öğe ekleme görülmedi.30dk mobil heap/enerji testi yapılmadığı için sahada “bellek sızıntısı yok” genellemesi verilmez.

Ekran kilidi, WhatsApp, alarm ve telefon aramasında OS AudioContext'i kesebilir; resume kullanıcı dokunuşu isteyebilir. Worker/keepalive/WakeLock OS dondurmasını aşan bir yetki değildir. Tek mikrofon gate'i rehber kimliği tanımaz; yakındaki başka konuşmayı%100 ayıramaz. AEC isteği beamforming veya başka telefondaki50–400ms gecikmiş hoparlör referansı sağlamaz. Ağıza yakın mikrofon/kulaklık, gerçek kayıt ve çapraz cihaz akustik ölçümü gereklidir. [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) track/constraint yaşam döngüsünü; [Web Audio](https://www.w3.org/TR/webaudio/) context/render/AudioParam davranışını tanımlar.

## 5. Doğrulama düzeni

**Disk v59:** reverse-check0 ve36/36 PASS. Bu eski test sayısı P2-59-08'i kapsamaz.

**ADIM-5.V60:** Kaynaktaki gerçek fonksiyonlar kontrollü VM izin/cihaz/modül/zamanlayıcı modeliyle çalışır.17 lifecycle kontrolü: stop öncesi bekleyen izin, çift tık+yeniden başlatma, ters izin sırası, addModule/import iptali, stale permission retry, eski worklet/fallback/track/error callback'leri, cooldown ve in-flight force, eski heal finally, eski preview, preview kaynak hızı/temizliği, hata veren start/stop yayın kancalarında donanımın bırakılması, await sonrası güncel mute/profil ve capture stop→false. Player'ın gerçek process çıkışında8/16kHz; Nyquist yakını dahil üçer stop tonu,200Hz referans; reset/starvation geçmiş temizliği;24/44.1/48 bypass. Dijital modeldir; cihaz sürücüsü ölçümü değildir.

**ADIM-3.V60:** Gerçek capture kernel48→24kHz PCM üretir; rehberin gerçek graph callback'i test cihazı üzerinden972B paket köprüsüne bağlanır. Gerçek localhost rehber+native listener+HTTP listener üzerinden30 çerçeve iletilir. Native baytlar veHTTP base64 PCM birebir kontrol edilir; stop/stale callback/iptal edilmiş izin yeni paket yollamamalı, yeni kurulum devam etmelidir. Alınan PCM gerçek player'da8/16kHz render edilir:6kHz ton8kHz'te bastırılır,16kHz'te korunur. Bu test fiziksel tarayıcı DAC/ADC ve gerçek getUserMedia izin UI'sı içermez; paket köprüsü yalnız harness kodudur.

Mevcut V53–V59 testleri korunur; yeni toplam **38 test** beklenir. Cache fixture'ları60'a, eski graph fixture'ları yeni bağımlılıklara uyarlanır; eski davranış kontrolleri kaldırılmaz. Yeni testler raporu okumaz. Son doğrulamada raporun diff'i diskten yeniden çıkarılıp bellek loader'ı ile uygulanır; aday JS stdin node --check veHTML vm.Script'ten geçer, gerçek HTTP/WS suite çalışır. Test runtime.json snapshot'ını geri yükler. Böylece rapor açıklaması ile başka bir bellek adayının karışması önlenir.

## 6. Uygulama ve saha kabulü

1. Aşağıdaki tek diff'i UTF-8/LF v60.patch'e çıkarın; taban SHA'yı kontrol edin; git apply --check --ignore-space-change v60.patch, sonra git apply --ignore-space-change v60.patch. Bu rapor kaynaklara uygulamaz.
2. node scripts/verify-system.js:38/38, V60 E2E/UNIT PASS. Özellikle RysOutputFir/rxFir ve V60 UNIT METRICS alias dizisini kontrol edin; test sayısı tek başına yeterli kanıt değildir.
3. SW cache60, sekiz HTML shim?v60, capture/player?v60-audio birlikte dağıtılmalı. Shim kaynak mantığı ve wire56 handoff değişmez. Eski sekmeler yeniden açılıp gerçekten60 worklet yüklendiği doğrulanmalı.
4. Staging'de30dk300 native, ayrıca300 HTTP fallback; capture→DAC latency, CPU/RSS/heap/GC, reconnect ve queue drop ölçümü.8/16/44.1/48kHz gerçek kulaklık, iki iOS/iki Android; kilit, arama/alarm/WhatsApp, Wi-Fi↔4G, tak/çıkar ve hızlı start/stop. Sessiz/kalabalık kayıtta yumuşak ünsüz, kırpılma, uzun kıraat ve hoparlör geri dönüşü insan dinlemesiyle kabul edilmeli. Yerel kısa testten Kâbe sıfır kopma sertifikası çıkarılamaz.

## 7. v60 unified diff

```diff
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
index 9d4431c..2a82e52 100644
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=59"></script>
+  <script src="/vercel-ws-shim.js?v=60"></script>
   <style>
     body {
       background: #e9e2d5;
diff --git a/public/dinle.html b/public/dinle.html
index 666445a..f227957 100644
--- a/public/dinle.html
+++ b/public/dinle.html
@@ -16,7 +16,7 @@
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/dinle" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=59"></script>
+  <script src="/vercel-ws-shim.js?v=60"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1606,7 +1606,7 @@
       const token = ++rxLoadToken;
       rxPlayerWorkletLoading = true;
       ctx.audioWorklet
-        .addModule('/pcm-player-worklet.js?v=59-audio')
+        .addModule('/pcm-player-worklet.js?v=60-audio')
         .then(() => {
           if (token !== rxLoadToken || audioCtx !== ctx || rxPlayerWorkletNode) return;
           const node = new AudioWorkletNode(ctx, 'rys-pcm-player', {
@@ -2555,7 +2555,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=59').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=60').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
index 9e2b9bc..4754856 100644
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=59"></script>
+  <script src="/vercel-ws-shim.js?v=60"></script>
   <style>
     .hero {
       padding: 64px 0 76px;
diff --git a/public/login.html b/public/login.html
index 43408de..c871daa 100644
--- a/public/login.html
+++ b/public/login.html
@@ -10,7 +10,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/login" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=59"></script>
+  <script src="/vercel-ws-shim.js?v=60"></script>
   <style>
     .login-shell {
       max-width: 460px;
diff --git a/public/panel.html b/public/panel.html
index 0f37e9f..ea09898 100644
--- a/public/panel.html
+++ b/public/panel.html
@@ -29,7 +29,7 @@
       window.location.href = '/login?next=/panel';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=59"></script>
+  <script src="/vercel-ws-shim.js?v=60"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
diff --git a/public/pcm-capture-worklet.js b/public/pcm-capture-worklet.js
index 705b92f..47b946c 100644
--- a/public/pcm-capture-worklet.js
+++ b/public/pcm-capture-worklet.js
@@ -228,11 +228,17 @@ class RysPcmCaptureProcessor extends (globalThis.AudioWorkletProcessor || class
       o?.processorOptions || {},
       (m) => this.port.postMessage(m, [m.samples.buffer])
     );
-    this.port.onmessage = (e) => this.kernel.control(e.data || {});
+    this.stopped=false;
+    this.port.onmessage = (e) => {
+      const message=e.data||{};
+      if(message.type==='stop')this.stopped=true;
+      else if(!this.stopped)this.kernel.control(message);
+    };
   }
 
   process(inputs, outputs) {
     for (const c of outputs[0] || []) c.fill(0);
+    if(this.stopped)return false;
     const ch = inputs[0]?.[0];
     if (ch) this.kernel.process(ch, currentTime);
     return true;
diff --git a/public/pcm-player-worklet.js b/public/pcm-player-worklet.js
index c80975c..95a660a 100644
--- a/public/pcm-player-worklet.js
+++ b/public/pcm-player-worklet.js
@@ -8,6 +8,25 @@ function rysDiff(a, b) {
   return ((a - b + 0x40000000) & 0x7fffffff) - 0x40000000;
 }
 
+// v60: anti-alias the 24kHz source before rendering below 24kHz.
+class RysOutputFir {
+  constructor(rate){
+    this.r=new Float32Array(256);this.h=new Float64Array(193);this.pos=0;
+    const fc=.45*rate/24000;let sum=0;
+    for(let k=0;k<193;k++){
+      const d=k-96,w=.42-.5*Math.cos(2*Math.PI*k/192)+.08*Math.cos(4*Math.PI*k/192);
+      const h=(d===0?2*fc:Math.sin(2*Math.PI*fc*d)/(Math.PI*d))*w;
+      this.h[k]=h;sum+=h;
+    }
+    for(let k=0;k<193;k++)this.h[k]/=sum;
+  }
+  step(x){
+    this.r[this.pos]=x;let y=0;
+    for(let k=0;k<193;k++)y+=this.h[k]*this.r[(this.pos-k+256)&255];
+    this.pos=(this.pos+1)&255;return y;
+  }
+}
+
 class RysPitchPlc {
   constructor() {
     this.r = new Float32Array(2048);
@@ -102,6 +121,7 @@ class RysPcmPlayerProcessor extends AudioWorkletProcessor {
   }
 
   _reset() {
+    this.rxFir=this.rate<24000?new RysOutputFir(this.rate):null;
     this.plc = new RysPitchPlc();
     this.plcFrame = new Float32Array(480);
     this.recoveryFrame=new Float32Array(480);this.continuation=new Float32Array(480);
@@ -209,7 +229,8 @@ class RysPcmPlayerProcessor extends AudioWorkletProcessor {
 
   _pull() {
     if (this.fi >= 480) this._nextFrame();
-    return this.frame[this.fi++];
+    const x=this.frame[this.fi++];
+    return this.rxFir?this.rxFir.step(x):x;
   }
 
   process(inputs, outputs) {
@@ -307,6 +328,7 @@ class RysPcmPlayerProcessor extends AudioWorkletProcessor {
       this.primed = false;
       this.fi = 480;
       this.haveHistory = false;this.missing=0;this.pendingQueueBlend=false;this.catchupAge=0;this.catchupArmed=false;this.plc=new RysPitchPlc();
+      this.rxFir=this.rate<24000?new RysOutputFir(this.rate):null;
       this.resetFrom = this.lastOut;
       this.resetFade = 0;
     }
diff --git a/public/rehber.html b/public/rehber.html
index fd3d115..bcdeec5 100644
--- a/public/rehber.html
+++ b/public/rehber.html
@@ -28,7 +28,7 @@
       window.location.href = '/login?next=/rehber';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=59"></script>
+  <script src="/vercel-ws-shim.js?v=60"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
     .console-wrap {
@@ -1494,6 +1494,23 @@
     let lastGuideBgWsReconnectAt = 0;
     let isHealingGuideMic = false;
     let guideTrackMutedAt = 0, guideLastMicRebuildAt = 0, guideDeviceChangeTimer = null;
+    // v60: only the current setup may own the microphone and emit PCM.
+    let guideMicGeneration=0, guideMicStarting=false, guideMicSetupJob=null;
+    let guideMicHealTicket=null, guideDeviceChangePending=false, guideLoopbackSource=null;
+    function stopGuideMicrophoneStream(stream){
+      for(const track of stream?.getTracks?.()||[]){
+        track.onended=null;track.onmute=null;track.onunmute=null;
+        try{track.stop();}catch(e){}
+      }
+    }
+    function disposeGuideCaptureNode(node){
+      if(!node)return;
+      try{node.port?.postMessage({type:'stop'});}catch(e){}
+      if(node.port)node.port.onmessage=null;
+      node.onaudioprocess=null;node.onprocessorerror=null;
+      try{node.disconnect();}catch(e){}
+      try{node.port?.close?.();}catch(e){}
+    }
     let guideSourceNode = null;
     let guideHighPassNode = null;
     let guideMudCutNode = null;
@@ -1502,10 +1519,7 @@
 
     function disconnectGuideAudioNodes() {
       if (scriptProcessor) {
-        try {
-          if (scriptProcessor.port) scriptProcessor.port.onmessage = null;
-          scriptProcessor.disconnect();
-        } catch {}
+        disposeGuideCaptureNode(scriptProcessor);
         scriptProcessor = null;
       }
       if (guideSourceNode) {
@@ -1619,197 +1633,117 @@
 
     // PATCH: guide-graph-v53
     async function setupGuideMicrophoneGraph() {
-      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
-      if (!audioCtx) {
-        try {
-          audioCtx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: 48000 });
-        } catch {
-          audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
+      const generation=++guideMicGeneration;
+      guideMicSetupJob?.cancel();
+      let stream=null,processor=null,committed=false;
+      const nodes=[];
+      const job={cancel:()=>{
+        disposeGuideCaptureNode(processor);processor=null;
+        for(const node of nodes)try{node.disconnect();}catch(e){}
+        nodes.length=0;stopGuideMicrophoneStream(stream);stream=null;
+      }};
+      guideMicSetupJob=job;
+      const abort=()=>{const error=new Error('Mikrofon kurulumu iptal edildi');error.name='AbortError';return error;};
+      let ctx;
+      const check=()=>{if(generation!==guideMicGeneration||audioCtx!==ctx||ctx.state==='closed')throw abort();};
+      const current=()=>generation===guideMicGeneration&&audioCtx===ctx&&micStream===stream&&scriptProcessor===processor;
+      const own=node=>(nodes.push(node),node);
+      try{
+        const AudioContextClass=window.AudioContext||window.webkitAudioContext;
+        if(!audioCtx||audioCtx.state==='closed'){
+          try{audioCtx=new AudioContextClass({latencyHint:'interactive',sampleRate:48000});}
+          catch(e){audioCtx=new AudioContextClass({latencyHint:'interactive'});}
+          const created=audioCtx;
+          created.onstatechange=()=>{
+            if(audioCtx===created&&(isMicBroadcasting||isVoiceLoopbackTesting)&&
+              (created.state==='suspended'||created.state==='interrupted'))created.resume().catch(()=>{});
+          };
         }
-        audioCtx.onstatechange = () => {
-          if ((isMicBroadcasting || isVoiceLoopbackTesting) && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
-            audioCtx.resume().catch(() => {});
-          }
-        };
-      }
-      if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
-        await audioCtx.resume();
-      }
-
-      // AEC is a browser/device request; it does not guarantee beamforming or remote-speaker cancellation.
-      // Disable AGC/NS by preference; inspect track.getSettings() on each real headset.
-      try {
-        micStream = await navigator.mediaDevices.getUserMedia({
-          audio: {
-            echoCancellation: true,
-            noiseSuppression: false,
-            autoGainControl: false,
-            channelCount: 1,
-            sampleRate: 48000
-          }
-        });
-      } catch (strictErr) {
-        console.warn('Gelişmiş mikrofon ayarı kabul edilmedi, temel ses kullanılıyor:', strictErr);
-        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
-      }
-
-      // Gelen telefon araması veya Bluetooth/yaka mikrofonu çıkması durumunda otomatik mikrofon kurtarma (Auto-Heal)
-      const audioTrack = micStream && micStream.getAudioTracks ? micStream.getAudioTracks()[0] : null;
-      guideTrackMutedAt = audioTrack?.muted ? Date.now() : 0;
-      if (audioTrack) {
-        audioTrack.onmute = () => { if (micStream?.getAudioTracks()[0] === audioTrack) guideTrackMutedAt = Date.now(); };
-        audioTrack.onunmute = () => { if (micStream?.getAudioTracks()[0] === audioTrack) guideTrackMutedAt = 0; };
-        audioTrack.onended = () => {
-          if (isMicBroadcasting && !isHealingGuideMic) {
-            console.warn('🔄 [Rehber Mikrofon] Mikrofon izi kesildi (arama/kulaklık değişimi), 300ms içinde otomatik kurtarılıyor...');
-            setTimeout(() => healGuideMicrophoneIfNeeded(), 300);
-          }
-        };
-      }
-
-      disconnectGuideAudioNodes();
-      const source = audioCtx.createMediaStreamSource(micStream);
-      guideSourceNode = source;
-
-      // 1. Rüzgar ve Mekanik Dip Uğultu Kesici (85 Hz Butterworth High-Pass — Web Audio Q birimi dB: -3.0103)
-      const highPass = audioCtx.createBiquadFilter();
-      highPass.type = 'highpass';
-      highPass.frequency.value = 85;
-      highPass.Q.value = -3.0103;
-      guideHighPassNode = highPass;
-
-      // 2. Yakın Mikrofon Boğukluk / Kutu Sesi Giderici (210 Hz -2.5 dB Mud Cut — Sesteki boğukluğu temizler)
-      const mudCut = audioCtx.createBiquadFilter();
-      mudCut.type = 'peaking';
-      mudCut.frequency.value = 210;
-      mudCut.Q.value = 1.2;
-      mudCut.gain.value = -2.5;
-      guideMudCutNode = mudCut;
-
-      // 3. Stüdyo Konuşma ve Ünsüz Harf Netleştirici (3200 Hz +2.0 dB Presence — Yankı döngü kazancını şişirmeden harfleri netleştirir)
-      const presence = audioCtx.createBiquadFilter();
-      presence.type = 'peaking';
-      presence.frequency.value = 3200;
-      presence.Q.value = 0.85;
-      presence.gain.value = 2.0;
-      guidePresenceNode = presence;
-
-      // 4. Geniş-Bant Kristal HD Tiz Sınırı (10500 Hz Butterworth Low-Pass — Web Audio Q birimi dB: -3.0103)
-      const lowPass = audioCtx.createBiquadFilter();
-      lowPass.type = 'lowpass';
-      lowPass.frequency.value = 10500;
-      lowPass.Q.value = -3.0103;
-      guideLowPassNode = lowPass;
-
-      // 5. Rehber Mikrofon Kazancı (Gain — Varsayılan %100 / 1.0 Doğal Gür Ses)
-      guideMicGainNode = audioCtx.createGain();
-      guideMicGainNode.gain.value = guideMicGainMultiplier;
-
-      zeroGainNode = audioCtx.createGain();
-      zeroGainNode.gain.value = 0;
-
-      source.connect(highPass);
-      highPass.connect(mudCut);
-      mudCut.connect(presence);
-      presence.connect(lowPass);
-      lowPass.connect(guideMicGainNode);
-
-      guideWasIdlePaused = true;
-
-      lastGuideMicChunkAt = Date.now();
-      const ctx = audioCtx;
-      const url = "/pcm-capture-worklet.js?v=53-audio";
-      if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
-        try {
-          await ctx.audioWorklet.addModule(url);
-          if (audioCtx !== ctx) throw Error('Eski bağlam');
-          scriptProcessor = new AudioWorkletNode(ctx, 'rys-pcm-capture', {
-            numberOfInputs: 1,
-            numberOfOutputs: 1,
-            outputChannelCount: [1],
-            processorOptions: {
-              muted: isGuideMicMuted,
-              reject: guideSideVoiceRejectLevel,
-              continuousSpeech:guideContinuousSpeech,comfortFade:guideComfortFade
-            }
-          });
-          scriptProcessor.port.onmessage = (e) => {
-            if (audioCtx === ctx) handleGuideMicFloatChunk(e.data);
+        ctx=audioCtx;
+        if(ctx.state==='suspended'||ctx.state==='interrupted')await ctx.resume();
+        check();
+        // AEC is a request; it does not guarantee beamforming or remote-speaker cancellation.
+        try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,
+          noiseSuppression:false,autoGainControl:false,channelCount:1,sampleRate:48000}});}
+        catch(error){check();stream=await navigator.mediaDevices.getUserMedia({audio:true});}
+        check();
+        const source=own(ctx.createMediaStreamSource(stream));
+        const highPass=own(ctx.createBiquadFilter());highPass.type='highpass';highPass.frequency.value=85;highPass.Q.value = -3.0103;
+        const mudCut=own(ctx.createBiquadFilter());mudCut.type='peaking';mudCut.frequency.value=210;mudCut.Q.value=1.2;mudCut.gain.value=-2.5;
+        const presence=own(ctx.createBiquadFilter());presence.type='peaking';presence.frequency.value=3200;presence.Q.value=.85;presence.gain.value=2;
+        const lowPass=own(ctx.createBiquadFilter());lowPass.type='lowpass';lowPass.frequency.value=10500;lowPass.Q.value = -3.0103;
+        const gain=own(ctx.createGain());gain.gain.value=guideMicGainMultiplier;
+        const zero=own(ctx.createGain());zero.gain.value=0;
+        source.connect(highPass);highPass.connect(mudCut);mudCut.connect(presence);presence.connect(lowPass);lowPass.connect(gain);
+        const onFrame=message=>{if(current())handleGuideMicFloatChunk(message);};
+        const url='/pcm-capture-worklet.js?v=60-audio';
+        const options=()=>({muted:isGuideMicMuted,reject:guideSideVoiceRejectLevel,
+          continuousSpeech:guideContinuousSpeech,comfortFade:guideComfortFade});
+        if(ctx.audioWorklet&&typeof AudioWorkletNode!=='undefined'){
+          try{
+            await ctx.audioWorklet.addModule(url);check();
+            processor=new AudioWorkletNode(ctx,'rys-pcm-capture',{numberOfInputs:1,numberOfOutputs:1,
+              outputChannelCount:[1],processorOptions:options()});
+            processor.port.onmessage=e=>onFrame(e.data);
+            processor.onprocessorerror=()=>{if(current()){lastGuideMicChunkAt=1;guideDeviceChangePending=true;}};
+          }catch(error){check();console.warn('Capture worklet fallback:',error);disposeGuideCaptureNode(processor);processor=null;}
+        }
+        if(!processor){
+          const {RysCaptureKernel}=await import(url);check();
+          const kernel=new RysCaptureKernel(ctx.sampleRate,options(),onFrame);
+          processor=ctx.createScriptProcessor(2048,1,1);
+          processor.port={postMessage:message=>kernel.control(message)};
+          processor.onaudioprocess=e=>{
+            if(!current())return;
+            const data=e.inputBuffer.getChannelData(0);
+            kernel.process(data,Math.max(0,ctx.currentTime-data.length/ctx.sampleRate));
           };
-        } catch (e) {
-          console.warn(e);
-          scriptProcessor = null;
         }
+        check();gain.connect(processor);processor.connect(zero);zero.connect(ctx.destination);
+        // Commit synchronously; cleanup from an older request can only touch its local resources.
+        disconnectGuideAudioNodes();stopGuideMicrophoneStream(micStream);
+        micStream=stream;scriptProcessor=processor;guideSourceNode=source;guideHighPassNode=highPass;
+        guideMudCutNode=mudCut;guidePresenceNode=presence;guideLowPassNode=lowPass;guideMicGainNode=gain;zeroGainNode=zero;
+        const track=stream.getAudioTracks?.()[0];guideTrackMutedAt=track?.muted?Date.now():0;
+        if(track){
+          track.onmute=()=>{if(current())guideTrackMutedAt=Date.now();};
+          track.onunmute=()=>{if(current())guideTrackMutedAt=0;};
+          track.onended=()=>{if(current()&&isMicBroadcasting)setTimeout(()=>{if(current())healGuideMicrophoneIfNeeded();},300);};
+        }
+        guideWasIdlePaused=true;lastGuideMicChunkAt=Date.now();committed=true;syncGuideAudioProfile();
+        return generation;
+      }finally{
+        if(!committed)job.cancel();
+        if(guideMicSetupJob===job)guideMicSetupJob=null;
       }
-      if (!scriptProcessor) {
-        const { RysCaptureKernel } = await import(url);
-        if (audioCtx !== ctx) throw Error('Eski bağlam');
-        const k = new RysCaptureKernel(
-          ctx.sampleRate,
-          { muted: isGuideMicMuted, reject: guideSideVoiceRejectLevel,continuousSpeech:guideContinuousSpeech,comfortFade:guideComfortFade },
-          handleGuideMicFloatChunk
-        );
-        scriptProcessor = ctx.createScriptProcessor(2048, 1, 1);
-        scriptProcessor.port = { postMessage: (m) => k.control(m) };
-        scriptProcessor.onaudioprocess = (e) => {
-          if(audioCtx!==ctx)return;
-          const data=e.inputBuffer.getChannelData(0);
-          const estimatedStart=Math.max(0,ctx.currentTime-data.length/ctx.sampleRate);
-          k.process(data,estimatedStart);
-        };
-      }
-      guideMicGainNode.connect(scriptProcessor);
-      scriptProcessor.connect(zeroGainNode);
-      zeroGainNode.connect(ctx.destination);
-      syncGuideAudioProfile();
     }
 
     async function healGuideMicrophoneIfNeeded(forceRebuild = false) {
-      if (!isMicBroadcasting || isVoiceLoopbackTesting || isHealingGuideMic) return;
-      const track = micStream && micStream.getAudioTracks ? micStream.getAudioTracks()[0] : null;
-      const trackDead = !track || track.readyState === 'ended';
-      const trackMuted = !!track?.muted && guideTrackMutedAt > 0 && Date.now() - guideTrackMutedAt > 2000;
-      const captureStalled = lastGuideMicChunkAt > 0 && (Date.now() - lastGuideMicChunkAt > 2000);
-      if (forceRebuild || trackDead || trackMuted || captureStalled) {
-        if (Date.now() - guideLastMicRebuildAt < 3000) return;
-        guideLastMicRebuildAt = Date.now();
-        isHealingGuideMic = true;
-        try {
-          disconnectGuideAudioNodes();
-          if (micStream) {
-            try { micStream.getTracks().forEach((t) => t.stop()); } catch {}
-            micStream = null;
+      if(forceRebuild&&isMicBroadcasting)guideDeviceChangePending=true;
+      if(!isMicBroadcasting||isVoiceLoopbackTesting||guideMicStarting||isHealingGuideMic)return;
+      const track=micStream?.getAudioTracks?.()[0],trackDead=!track||track.readyState==='ended';
+      const trackMuted=!!track?.muted&&guideTrackMutedAt>0&&Date.now()-guideTrackMutedAt>2000;
+      const captureStalled=lastGuideMicChunkAt>0&&Date.now()-lastGuideMicChunkAt>2000;
+      const forced=guideDeviceChangePending;
+      if(forced||trackDead||trackMuted||captureStalled){
+        if(!forced&&Date.now()-guideLastMicRebuildAt<3000)return;
+        guideDeviceChangePending=false;guideLastMicRebuildAt=Date.now();
+        const ticket={};guideMicHealTicket=ticket;isHealingGuideMic=true;
+        try{
+          disconnectGuideAudioNodes();stopGuideMicrophoneStream(micStream);micStream=null;
+          if((trackDead||trackMuted||captureStalled)&&audioCtx){
+            const oldCtx=audioCtx;audioCtx=null;workletModuleLoaded=false;
+            oldCtx.onstatechange=null;try{oldCtx.close().catch(()=>{});}catch(e){}
           }
-          // Alarm veya telefon araması sonrası AudioContext kilitlendiyse sıfırdan temiz AudioContext aç:
-          if ((trackDead || trackMuted || captureStalled) && audioCtx) {
-            const oldCtx = audioCtx;
-            audioCtx = null;
-            workletModuleLoaded = false;
-            try {
-              oldCtx.onstatechange = null;
-              oldCtx.close().catch(() => {});
-            } catch {}
-          }
-          await setupGuideMicrophoneGraph();
-          if (typeof window.ryBroadcastGuideStream === 'function') {
-            const activeTourCode = document.getElementById('guideTourSelect')?.value || 'RY-KASIM';
-            const activeRoomId = document.getElementById('guideRoomSelect')?.value || 'genel';
-            window.ryBroadcastGuideStream(micStream, activeTourCode, activeRoomId);
-          }
-          const lbl = document.getElementById('micSourceLabel');
-          if (lbl) {
-            lbl.textContent = forceRebuild
-              ? 'Yayın Kaynağı: 24 kHz Saf Stüdyo HD (Akustik Mod Güncellendi)'
-              : 'Yayın Kaynağı: 24 kHz Saf Stüdyo HD (Otomatik Kurtarıldı)';
-          }
-        } catch (e) {
-          console.warn('Mikrofon otomatik kurtarma beklemede:', e);
-        } finally {
-          isHealingGuideMic = false;
-        }
-      } else if (audioCtx && (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted')) {
-        audioCtx.resume().catch(() => {});
-      }
+          const installed=await setupGuideMicrophoneGraph();
+          if(!isMicBroadcasting||installed!==guideMicGeneration||guideMicHealTicket!==ticket)return;
+          if(typeof window.ryBroadcastGuideStream==='function')window.ryBroadcastGuideStream(micStream,
+            document.getElementById('guideTourSelect')?.value||'RY-KASIM',document.getElementById('guideRoomSelect')?.value||'genel');
+          const label=document.getElementById('micSourceLabel');
+          if(label)label.textContent='Yayın Kaynağı: 24 kHz (Mikrofon Yenilendi)';
+        }catch(error){if(error.name!=='AbortError')console.warn('Mikrofon kurtarma beklemede:',error);}
+        finally{if(guideMicHealTicket===ticket){guideMicHealTicket=null;isHealingGuideMic=false;}}
+      }else if(audioCtx&&(audioCtx.state==='suspended'||audioCtx.state==='interrupted'))audioCtx.resume().catch(()=>{});
     }
 
     if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
@@ -1859,17 +1793,19 @@
       const testBtn = document.getElementById('testMyVoiceBtn');
       const statusBox = document.getElementById('voiceTestStatusBox');
       if (isVoiceLoopbackTesting) return;
-      if (isMicBroadcasting) {
+      if (isMicBroadcasting || guideMicStarting) {
         stopMicBroadcast();
       }
       if (isDemoBroadcasting) {
         toggleDemoBroadcast();
       }
 
+      const testVersion=guideMicGeneration+1;
       try {
         loopbackRecordedChunks = [];
         isVoiceLoopbackTesting = true;
-        await setupGuideMicrophoneGraph();
+        const installed=await setupGuideMicrophoneGraph();
+        if(installed!==guideMicGeneration||testVersion!==guideMicGeneration)return;
 
         if (testBtn) {
           testBtn.disabled = true;
@@ -1882,11 +1818,12 @@
 
         await new Promise((r) => setTimeout(r, 4000));
 
+        if(testVersion!==guideMicGeneration)return;
         // Kaydı durdur (hoparlörden çalarken mikrofona geri girmemesi için önce mikrofonu kapatıyoruz!)
         isVoiceLoopbackTesting = false;
         disconnectGuideAudioNodes();
         if (micStream) {
-          micStream.getTracks().forEach((t) => t.stop());
+          stopGuideMicrophoneStream(micStream);
           micStream = null;
         }
 
@@ -1905,62 +1842,48 @@
           offset += c.samples.length;
         }
 
-        // Hacıların telefonundaki 4-Noktalı Kübik Hermite 48 kHz dönüştürücüsünün birebir aynısıyla çal
-        const hwRate = audioCtx.sampleRate || 48000;
-        const step = sr / hwRate;
-        const outLen = Math.floor(merged.length / step);
-        const upsampled = new Float32Array(outLen);
-        for (let i = 0; i < outLen; i++) {
-          const pos = i * step;
-          const idx = Math.floor(pos);
-          const frac = pos - idx;
-          const y0 = merged[Math.max(0, idx - 1)];
-          const y1 = merged[Math.min(merged.length - 1, idx)];
-          const y2 = merged[Math.min(merged.length - 1, idx + 1)];
-          const y3 = merged[Math.min(merged.length - 1, idx + 2)];
-          const c0 = y1;
-          const c1 = 0.5 * (y2 - y0);
-          const c2 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
-          const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
-          upsampled[i] = ((c3 * frac + c2) * frac + c1) * frac + c0;
-        }
-
+        // Keep native 24kHz samples; AudioBufferSource performs context-rate conversion.
         if (testBtn) testBtn.textContent = '🔊 Sesiniz Dinletiliyor...';
         if (statusBox) {
-          statusBox.innerHTML = '🔊 <strong>Kayıt Tamamlandı — Şimdi Dinliyorsunuz:</strong> Hacıların kulaklığında duyacağı 24 kHz → 48 kHz Kübik Hermite Saf Stüdyo HD sesiniz çalınıyor (Lavabo/Robotik ses %0).';
+          statusBox.innerHTML = '🔊 <strong>Kayıt Tamamlandı — Şimdi Dinliyorsunuz:</strong> Bu test yalnız mikrofon kaydınızı dinletir; canlı bağlantı kalitesini ölçmez.';
         }
 
-        const buf = audioCtx.createBuffer(1, upsampled.length, hwRate);
-        buf.copyToChannel(upsampled, 0);
+        const buf = audioCtx.createBuffer(1, merged.length, sr);
+        buf.copyToChannel(merged, 0);
         const src = audioCtx.createBufferSource();
         src.buffer = buf;
         src.connect(audioCtx.destination);
-        src.start();
+        guideLoopbackSource=src;src.start();
         await new Promise((r) => {
           src.onended = r;
           setTimeout(r, 4500);
         });
 
+        if(testVersion!==guideMicGeneration)return;
         if (statusBox) {
-          statusBox.innerHTML = '✅ <strong>Ses Kalitesi Testi Tamamlandı!</strong> Hacıların duyduğu net stüdyo sesini dinlediniz.';
+          statusBox.innerHTML = '✅ <strong>Ses Kalitesi Testi Tamamlandı!</strong> Mikrofon kaydınızı dinlediniz.';
         }
       } catch (err) {
+        if(err.name==='AbortError'||testVersion!==guideMicGeneration)return;
         if (statusBox) {
           statusBox.style.display = 'block';
           statusBox.innerHTML = '⚠️ Mikrofon testi başlatılamadı: ' + (err.message || err.name);
         }
       } finally {
-        isVoiceLoopbackTesting = false;
+        if(testVersion===guideMicGeneration){
+        isVoiceLoopbackTesting = false;loopbackRecordedChunks=[];
+        if(guideLoopbackSource){try{guideLoopbackSource.disconnect();}catch(e){}guideLoopbackSource=null;}
         if (testBtn) {
           testBtn.disabled = false;
           testBtn.textContent = '🎧 Sesimi Test Et (4 Sn Kaydet & Dinle)';
         }
+        }
       }
     }
 
     async function toggleMicBroadcast() {
       const btn = document.getElementById('startMicBtn');
-      if (isMicBroadcasting) {
+      if (isMicBroadcasting || guideMicStarting) {
         stopMicBroadcast();
         btn.textContent = '🎙️ Gerçek Mikrofonla Canlı Yayını Başlat';
         btn.className = 'btn btn-gold';
@@ -1968,13 +1891,17 @@
         return;
       }
 
+      if(isVoiceLoopbackTesting)return;
+
       // Demo ses akışı açıksa otomatik kapat ki gerçek mikrofonun arkasına demo nota sesi karışmasın!
       if (isDemoBroadcasting) {
         toggleDemoBroadcast();
       }
 
+      const startVersion=guideMicGeneration+1;guideMicStarting=true;
       try {
-        await setupGuideMicrophoneGraph();
+        const installed=await setupGuideMicrophoneGraph();
+        if(installed!==guideMicGeneration||startVersion!==guideMicGeneration)return;
 
         const activeTourCode = document.getElementById('guideTourSelect').value || 'RY-KASIM';
         const activeRoomId = document.getElementById('guideRoomSelect')?.value || 'genel';
@@ -2007,6 +1934,8 @@
           }));
         }
       } catch (err) {
+        if(err.name==='AbortError'||startVersion!==guideMicGeneration)return;
+        stopMicBroadcast();
         console.error('Mikrofon başlatma hatası:', err);
         let errorMsg = 'Mikrofon başlatılamadı: ' + (err.message || err.name);
         if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
@@ -2017,7 +1946,7 @@
           errorMsg = 'Mikrofon şu anda başka bir program (Zoom, Discord vb.) tarafından kullanılıyor.';
         }
         alert(errorMsg);
-      }
+      }finally{if(startVersion===guideMicGeneration)guideMicStarting=false;}
     }
 
     let broadcastStartedAtTs = 0;
@@ -2072,30 +2001,25 @@
     }
 
     function stopMicBroadcast() {
-      isMicBroadcasting = false;
-      toggleGuideMicMute(false);
-      stopBroadcastClock();
-      disableGuideKeepAlive();
-      if (ws && ws.readyState === WebSocket.OPEN) {
-        ws.send(JSON.stringify({
-          type: 'guide-stream-state',
-          isLive: false,
-          broadcastMode: 'idle',
-          topic: document.getElementById('topicInput')?.value || ''
-        }));
-      }
-      if (typeof window.ryBroadcastGuideStream === 'function') {
-        window.ryBroadcastGuideStream(null);
-      }
-      disconnectGuideAudioNodes();
-      if (micStream) {
-        micStream.getTracks().forEach((t) => t.stop());
-        micStream = null;
-      }
+      ++guideMicGeneration;guideMicSetupJob?.cancel();guideMicSetupJob=null;
+      guideMicStarting=false;guideMicHealTicket=null;isHealingGuideMic=false;isVoiceLoopbackTesting=false;
+      clearTimeout(guideDeviceChangeTimer);guideDeviceChangeTimer=null;guideDeviceChangePending=false;
+      if(guideLoopbackSource){try{guideLoopbackSource.stop();guideLoopbackSource.disconnect();}catch(e){}guideLoopbackSource=null;}
+      isMicBroadcasting=false;
+      // Release hardware before optional UI/transport hooks can fail.
+      disconnectGuideAudioNodes();const stream=micStream;micStream=null;stopGuideMicrophoneStream(stream);
+      const testButton=document.getElementById('testMyVoiceBtn');
+      if(testButton){testButton.disabled=false;testButton.textContent='🎧 Sesimi Test Et (4 Sn Kaydet & Dinle)';}
+      toggleGuideMicMute(false);stopBroadcastClock();disableGuideKeepAlive();
+      try{if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'guide-stream-state',isLive:false,
+        broadcastMode:'idle',topic:document.getElementById('topicInput')?.value||''}));}catch(e){}
+      try{if(typeof window.ryBroadcastGuideStream==='function')window.ryBroadcastGuideStream(null);}catch(e){}
     }
 
     // Demo Audio Broadcast (Works without physical mic)
     function toggleDemoBroadcast() {
+      if(isVoiceLoopbackTesting)return;
+      if(guideMicStarting)stopMicBroadcast();
       const btn = document.getElementById('startDemoStreamBtn');
       const micBtn = document.getElementById('startMicBtn');
       const srcLabel = document.getElementById('micSourceLabel');
diff --git a/public/rota.html b/public/rota.html
index ad23c04..35c5ca8 100644
--- a/public/rota.html
+++ b/public/rota.html
@@ -9,7 +9,7 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=59"></script>
+  <script src="/vercel-ws-shim.js?v=60"></script>
   <style>
     .rota-hero-strip {
       background:
diff --git a/public/sw.js b/public/sw.js
index 2e91d7a..56c4f10 100644
--- a/public/sw.js
+++ b/public/sw.js
@@ -1,17 +1,17 @@
 // PATCH: sw-v53
 // PATCH: sw-v53
 // PATCH: sw-v53
-const CACHE_NAME = 'ridvanses-pwa-v59';
+const CACHE_NAME = 'ridvanses-pwa-v60';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=59',
+  '/vercel-ws-shim.js?v=60',
   '/js/umrah-steps-map.js',
-  '/pcm-capture-worklet.js?v=53-audio',
-  '/pcm-player-worklet.js?v=59-audio',
+  '/pcm-capture-worklet.js?v=60-audio',
+  '/pcm-player-worklet.js?v=60-audio',
   '/manifest.json',
   '/icons/icon-512.png',
   '/icons/icon-192.png',
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
index 942aeed..8b03171 100644
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=59"></script>
+  <script src="/vercel-ws-shim.js?v=60"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
index d2a2448..a2d3c3d 100644
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -579,6 +579,7 @@ async function runStep2And3LiveServerAndWsTests() {
   await runV57RoutingChecks({baseUrl,url:wsUrl,token:authToken});
   await runV58InputChecks({baseUrl,url:wsUrl,token:authToken});
   await runV59FanoutChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV60AudioRoundTrip({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1157,7 +1158,8 @@ async function runStep5V53AudioChecks(){
     if(worklet)ctx.audioWorklet={addModule:async()=>{}};
     class Kernel{constructor(rate,o){opts=o;}control(){}process(ch,t){fallbackAt=t;}}
     class AW{constructor(context,name,o){opts=o.processorOptions;this.port={postMessage(){}};}connect(){}}
-    const g=box(graph.replace(/\bimport\(url\)/g,'loadCaptureModule(url)')+'\n'+profileCode,'',{
+    const g=box(['stopGuideMicrophoneStream','disposeGuideCaptureNode'].map(n=>pick(guide,n)).join('\n')+'\n'+graph.replace(/\bimport\(url\)/g,'loadCaptureModule(url)')+'\n'+profileCode,'',{
+      guideMicGeneration:0,guideMicSetupJob:null,micStream:null,
       audioCtx:ctx,window:{AudioContext:class{}},AudioWorkletNode:worklet?AW:undefined,
       navigator:{mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[{}]})}},
       loadCaptureModule:async()=>({RysCaptureKernel:Kernel}),
@@ -1529,9 +1531,9 @@ async function runStep5V54AudioChecks(){
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v59"));assert(sw.includes('/vercel-ws-shim.js?v=59'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v60"));assert(sw.includes('/vercel-ws-shim.js?v=60'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'59',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'60',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2287,13 +2289,14 @@ async function runStep5V59AudioChecks(){
   for(let i=0;i<210;i++){while(arming.q.size<20){const seq=arming.expected===null?0:(arming.expected+arming.q.size)%0x80000000;if(arming.expected===null)arming.expected=seq;arming.q.set(seq,new Float32Array(480).fill(.1));}
     arming.process([],[[new Float32Array(128)]]);if(arming.stats.catchupDropped>0)break;}
   assert(arming.stats.catchupDropped>0,'sustained backlog must arm catch-up within 560ms');
-  const env={isMicBroadcasting:true,isVoiceLoopbackTesting:false,isHealingGuideMic:false,
+  const env={guideMicGeneration:0,guideMicStarting:false,guideDeviceChangePending:false,guideMicHealTicket:null,stopGuideMicrophoneStream(){},
+    isMicBroadcasting:true,isVoiceLoopbackTesting:false,isHealingGuideMic:false,
     micStream:{getAudioTracks:()=>[{readyState:'live',muted:true}],getTracks:()=>[]},guideTrackMutedAt:1000,guideLastMicRebuildAt:0,
     lastGuideMicChunkAt:5000,Date:{now:()=>5000},audioCtx:null,disconnectGuideAudioNodes(){},
-    setupGuideMicrophoneGraph:async()=>{env.rebuilds++;},rebuilds:0,window:{},document:{getElementById:()=>null},console};
+    setupGuideMicrophoneGraph:async()=>{env.rebuilds++;return ++env.guideMicGeneration;},rebuilds:0,window:{},document:{getElementById:()=>null},console};
   vm.createContext(env);vm.runInContext(pick(guide,'healGuideMicrophoneIfNeeded'),env);
   await env.healGuideMicrophoneIfNeeded();assert.equal(env.rebuilds,1);await env.healGuideMicrophoneIfNeeded();assert.equal(env.rebuilds,1);
-  assert(guide.includes('healGuideMicrophoneIfNeeded(true), 350'));assert(guide.includes('audioTrack.onmute'));
+  assert(guide.includes('healGuideMicrophoneIfNeeded(true), 350'));assert(guide.includes('track.onmute'));
   for(const [source,name,node,value] of [[guide,'updateGuideMicGain','guideMicGainNode',1.25],[listener,'updateVolume','gainNode',1.25]]){
     const calls=[],g={audioCtx:{currentTime:9},document:{getElementById:()=>({})}};g[node]={gain:{setTargetAtTime:(...args)=>calls.push(args)}};
     vm.createContext(g);vm.runInContext(pick(source,name),g);g[name](125);assert.deepEqual(calls,[[value,9,.01]]);
@@ -2307,13 +2310,267 @@ async function runStep5V59AudioChecks(){
   rateBox.Date.now=()=>60000;limiter({...req,ip:'fresh'},response,()=>admitted++);assert.equal(admitted,2);
   assert(server.includes('rysSendAudio(peer.ws,fallbackPayload,false)'));
   assert(!server.includes('fallbackJsonStr'));
-  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=59-audio'));
-  assert(read('public/sw.js').includes('pcm-capture-worklet.js?v=53-audio'));
+  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=60-audio'));
+  assert(read('public/sw.js').includes('pcm-capture-worklet.js?v=60-audio'));
   recordResult('ADIM-5.V59','8/16/44.1/48k DSP; FIR rejection; DC/limiter/partition; PLC/jitter/catchup; mic mute/retry; gain ramps; bounded CGNAT buckets',true);
   console.log('V59 DSP METRICS '+JSON.stringify({rates:dsp,fixture200HzMaxStep:+maxStep.toFixed(6),concealedSamples:p.stats.concealed}));
   console.log('V59 UNIT PASS: numerical model checks; no physical headset or lock-screen guarantee');
 }
 
+// v60 deterministic browser scheduling harness. Devices/permissions are mocked, production functions are extracted.
+function createV60GuideHarness(source,options={}){
+  const assert=require('node:assert/strict'),requests=[],modules=[],imports=[],processors=[],nodes=[],jobs=[],messages=[],broadcasts=[];
+  const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
+  function pick(name){
+    const m=new RegExp('^[ \\t]*(?:async )?function '+name+'\\(','m').exec(source);if(!m)return '';
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){
+      const text=source.slice(m.index,end+1);try{new vm.Script(text);return text;}catch(e){if(e.name!=='SyntaxError')throw e;}
+    }throw Error('V60 unterminated '+name);
+  }
+  const node=()=>{const n={gain:{value:0,setTargetAtTime(){}},frequency:{value:0},Q:{value:0},
+    connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
+  const ctx={state:'running',sampleRate:48000,currentTime:10,destination:{},
+    resume:async()=>{},close:async()=>{ctx.state='closed';},createMediaStreamSource:node,createGain:node,createBiquadFilter:node,
+    createScriptProcessor:()=>{const n=node();processors.push(n);return n;}};
+  if(options.worklet!==false)ctx.audioWorklet={addModule:()=>{if(!options.deferModules)return Promise.resolve();const d=defer();modules.push(d);return d.promise;}};
+  class Worklet{constructor(context,name,settings){Object.assign(this,node());this.options=settings.processorOptions;this.sent=[];this.port={onmessage:null,
+    postMessage:m=>this.sent.push(m),close:()=>this.closed=true};processors.push(this);}}
+  class Kernel{constructor(rate,profile,emit){this.emit=emit;g.lastKernelProfile=profile;}control(){}process(){this.emit({type:'frame',samples:new Float32Array(480),rms:0});}}
+  const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='guideRoomSelect'?'genel':'RY-V60',style:{},classList:{add(){},remove(){}}});return elements.get(id);};
+  const g={guideMicGeneration:0,guideMicStarting:false,guideMicSetupJob:null,guideMicHealTicket:null,
+    guideDeviceChangePending:false,guideLoopbackSource:null,guideDeviceChangeTimer:null,
+    guideTrackMutedAt:0,guideLastMicRebuildAt:0,guideWasIdlePaused:false,lastGuideMicChunkAt:5000,
+    audioCtx:ctx,micStream:null,scriptProcessor:null,guideSourceNode:null,guideHighPassNode:null,guideMudCutNode:null,
+    guideLowPassNode:null,guidePresenceNode:null,guideMicGainNode:null,zeroGainNode:null,
+    isMicBroadcasting:false,isHealingGuideMic:false,isVoiceLoopbackTesting:false,isDemoBroadcasting:false,
+    isGuideMicMuted:false,guideMicGainMultiplier:1,guideSideVoiceRejectLevel:.5,guideContinuousSpeech:false,guideComfortFade:true,
+    workletModuleLoaded:false,loopbackRecordedChunks:[],guideTxRmsRing:new Float32Array(8),
+    AudioWorkletNode:options.worklet===false?undefined:Worklet,WebSocket:{OPEN:1},ws:null,
+    window:{AudioContext:class{constructor(){ctx.state='running';return ctx;}},ryBroadcastGuideStream:s=>broadcasts.push(s)},
+    navigator:{mediaDevices:{getUserMedia:constraint=>{const d=defer();requests.push({...d,constraint});return d.promise;}}},
+    loadCaptureModule:()=>{if(!options.deferImports)return Promise.resolve({RysCaptureKernel:Kernel});const d=defer();imports.push(d);return d.promise;},
+    setTimeout:(fn,ms)=>{const job={fn,ms,cancelled:false};jobs.push(job);return job;},clearTimeout:job=>{if(job)job.cancelled=true;},
+    document:{getElementById:element},Date:{now:()=>g.now},now:5000,Float32Array,Float64Array,Math,Number,
+    console:{warn(){},error(){}},alert:m=>{throw Error('Unexpected alert '+m);},
+    handleGuideMicFloatChunk:m=>{messages.push(m);options.onFrame?.(m);},syncGuideAudioProfile(){},toggleGuideMicMute(){},
+    enableGuideKeepAlive(){},disableGuideKeepAlive(){},startBroadcastClock(){},stopBroadcastClock(){},connectGuideWs(){},
+    toggleDemoBroadcast(){g.isDemoBroadcasting=!g.isDemoBroadcasting;}};
+  const names=['stopGuideMicrophoneStream','disposeGuideCaptureNode','disconnectGuideAudioNodes','setupGuideMicrophoneGraph',
+    'healGuideMicrophoneIfNeeded','stopMicBroadcast','toggleMicBroadcast','testGuideVoiceLoopback'];
+  vm.createContext(g);vm.runInContext(names.map(pick).join('\n').replace(/\bimport\(url\)/g,'loadCaptureModule(url)'),g);
+  const stream=id=>{const track={id,readyState:'live',muted:false,stops:0,stop(){this.stops++;this.readyState='ended';}};
+    return {id,track,getTracks:()=>[track],getAudioTracks:()=>[track]};};
+  const tick=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
+  return {g,ctx,requests,modules,imports,processors,nodes,jobs,messages,broadcasts,stream,tick,Kernel,assert};
+}
+
+
+async function runStep5V60AudioChecks(){
+  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const guide=read('public/rehber.html'),player=read('public/pcm-player-worklet.js'),checks=[];
+  const stop=h=>h.g.stopMicBroadcast(),started=async(h,id)=>{const p=h.g.toggleMicBroadcast();const s=h.stream(id);h.requests.at(-1).resolve(s);await p;return s;};
+  const aborted=p=>p.then(()=>{throw Error('Expected AbortError');},e=>assert.equal(e.name,'AbortError'));
+  {
+    const h=createV60GuideHarness(guide),p=h.g.toggleMicBroadcast(),s=h.stream('cancelled-permission');
+    stop(h);h.requests[0].resolve(s);await p;assert(!h.g.isMicBroadcasting);assert.equal(h.g.micStream,null);assert.equal(s.track.stops,1);
+    assert.equal(h.broadcasts.filter(Boolean).length,0);checks.push('stop-before-gUM');
+  }
+  {
+    const h=createV60GuideHarness(guide),p=h.g.toggleMicBroadcast();
+    await h.g.toggleMicBroadcast();assert(!h.g.guideMicStarting);const newer=await started(h,'new-start');
+    h.requests[0].resolve(h.stream('old-start'));await p;assert.equal(h.g.micStream,newer);assert(h.g.isMicBroadcasting);
+    checks.push('double-click-stop-restart');stop(h);
+  }
+  {
+    const h=createV60GuideHarness(guide),a=aborted(h.g.setupGuideMicrophoneGraph()),b=h.g.setupGuideMicrophoneGraph();
+    const first=h.stream('old'),second=h.stream('new');h.requests[1].resolve(second);await b;
+    h.requests[0].resolve(first);await a;assert.equal(h.g.micStream,second);assert.equal(first.track.stops,1);assert.equal(second.track.stops,0);
+    checks.push('reversed-permission-order');stop(h);
+  }
+  {
+    const h=createV60GuideHarness(guide,{deferModules:true}),p=h.g.toggleMicBroadcast(),s=h.stream('module-wait');
+    h.requests[0].resolve(s);await h.tick();assert.equal(h.modules.length,1);stop(h);assert.equal(s.track.stops,1);
+    h.modules[0].resolve();await p;assert.equal(h.processors.length,0);assert(h.nodes.every(n=>n.disconnected));
+    checks.push('stop-before-addModule');
+  }
+  {
+    const h=createV60GuideHarness(guide,{worklet:false,deferImports:true}),p=h.g.toggleMicBroadcast(),s=h.stream('import-wait');
+    h.requests[0].resolve(s);await h.tick();assert.equal(h.imports.length,1);stop(h);assert.equal(s.track.stops,1);
+    h.imports[0].resolve({RysCaptureKernel:h.Kernel});await p;assert.equal(h.processors.length,0);checks.push('stop-before-fallback-import');
+  }
+  {
+    const h=createV60GuideHarness(guide),p=h.g.toggleMicBroadcast();stop(h);h.requests[0].reject(Error('denied'));await p;
+    assert.equal(h.requests.length,1,'cancelled strict request must not open another permission request');checks.push('no-stale-gUM-retry');
+  }
+  for(const worklet of [true,false]){
+    const h=createV60GuideHarness(guide,{worklet}),s1=await started(h,'first');
+    const old=h.g.scriptProcessor,callback=worklet?old.port.onmessage:old.onaudioprocess;
+    const ended=s1.track.onended,error=old.onprocessorerror;
+    stop(h);const s2=await started(h,'second'),before=h.messages.length,jobCount=h.jobs.length;
+    if(worklet)callback({data:{samples:new Float32Array(480)}});
+    else callback({inputBuffer:{getChannelData:()=>new Float32Array(2048)}});
+    ended();error?.();assert.equal(h.messages.length,before);assert.equal(h.jobs.length,jobCount);assert.equal(h.g.micStream,s2);
+    assert(old.disconnected);if(worklet){assert(old.sent.some(m=>m.type==='stop'));assert(old.closed);}
+    checks.push(worklet?'stale-worklet-track-error':'stale-scriptprocessor');stop(h);
+  }
+  {
+    const h=createV60GuideHarness(guide);await started(h,'initial');h.g.guideLastMicRebuildAt=h.g.now;
+    const a=h.g.healGuideMicrophoneIfNeeded(true);assert.equal(h.requests.length,2,'forced route change bypasses cooldown');
+    await h.g.healGuideMicrophoneIfNeeded(true);assert(h.g.guideDeviceChangePending,'route change during heal must remain pending');
+    h.requests[1].resolve(h.stream('route-1'));await a;const b=h.g.healGuideMicrophoneIfNeeded();
+    assert.equal(h.requests.length,3);h.requests[2].resolve(h.stream('route-2'));await b;
+    assert(!h.g.guideDeviceChangePending);checks.push('forced-route-during-cooldown-and-heal');stop(h);
+  }
+  {
+    const h=createV60GuideHarness(guide);await started(h,'start');const a=h.g.healGuideMicrophoneIfNeeded(true);stop(h);
+    await started(h,'restart');const b=h.g.healGuideMicrophoneIfNeeded(true),ticket=h.g.guideMicHealTicket;
+    h.requests[1].resolve(h.stream('stale-heal'));await a;assert.equal(h.g.guideMicHealTicket,ticket);assert(h.g.isHealingGuideMic);
+    h.requests[3].resolve(h.stream('current-heal'));await b;assert(!h.g.isHealingGuideMic);checks.push('old-heal-finally-cannot-unlock-new-heal');stop(h);
+  }
+  {
+    const h=createV60GuideHarness(guide),p=h.g.testGuideVoiceLoopback();h.requests[0].resolve(h.stream('preview'));await h.tick();
+    const timer=h.jobs.find(j=>j.ms===4000);assert(timer);stop(h);const s=await started(h,'after-preview');timer.fn();await p;
+    assert.equal(h.g.micStream,s);assert(h.g.isMicBroadcasting);assert(!s.track.stops);checks.push('stale-preview-does-not-stop-new-broadcast');stop(h);
+  }
+  {
+    const h=createV60GuideHarness(guide);let bufferRate=0,copied,source;
+    h.ctx.sampleRate=8000;
+    h.ctx.createBuffer=(channels,length,rate)=>{bufferRate=rate;return {copyToChannel:a=>copied=Array.from(a)};};
+    h.ctx.createBufferSource=()=>source={connect(){},start(){},disconnect(){this.disconnected=true;}};
+    const p=h.g.testGuideVoiceLoopback();h.requests[0].resolve(h.stream('preview-normal'));await h.tick();
+    const samples=new Float32Array(480).fill(.1);h.g.loopbackRecordedChunks.push({samples,sampleRate:24000});
+    h.jobs.find(j=>j.ms===4000).fn();await h.tick();assert.equal(bufferRate,24000);assert.deepEqual(copied,Array.from(samples));
+    source.onended();await p;assert(source.disconnected);assert.equal(h.g.loopbackRecordedChunks.length,0);
+    checks.push('preview-preserves-source-rate-and-releases-data');
+  }
+  {
+    const h=createV60GuideHarness(guide),s=await started(h,'stop-with-errors');
+    h.g.ws={readyState:1,send(){throw Error('socket failed');}};
+    h.g.window.ryBroadcastGuideStream=()=>{throw Error('publisher failed');};
+    assert.doesNotThrow(()=>stop(h));assert.equal(s.track.stops,1);assert.equal(h.g.micStream,null);
+    checks.push('stop-releases-hardware-despite-hook-errors');
+  }
+  {
+    const h=createV60GuideHarness(guide),p=h.g.toggleMicBroadcast(),s=h.stream('failed-start');
+    h.g.alert=()=>{};h.g.window.ryBroadcastGuideStream=()=>{throw Error('publisher start failed');};
+    h.requests[0].resolve(s);await p;assert(!h.g.isMicBroadcasting);assert.equal(h.g.micStream,null);assert.equal(s.track.stops,1);
+    checks.push('post-commit-start-error-releases-microphone');
+  }
+  for(const worklet of [true,false]){
+    const h=createV60GuideHarness(guide,{worklet,deferModules:worklet,deferImports:!worklet});
+    const p=h.g.setupGuideMicrophoneGraph();h.requests[0].resolve(h.stream('profile-wait'));await h.tick();
+    h.g.isGuideMicMuted=true;h.g.guideContinuousSpeech=true;h.g.guideComfortFade=false;
+    if(worklet)h.modules[0].resolve();else h.imports[0].resolve({RysCaptureKernel:h.Kernel});await p;
+    const profile=worklet?h.g.scriptProcessor.options:h.g.lastKernelProfile;
+    assert(profile.muted&&profile.continuousSpeech&&!profile.comfortFade,'latest mute/profile must survive asynchronous setup');
+    checks.push(worklet?'current-profile-after-worklet-await':'current-profile-after-import-await');stop(h);
+  }
+  const captureBox={Float32Array,Float64Array,Math,Number,sampleRate:48000,currentTime:0,
+    AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(n,P)=>captureBox.P=P};
+  vm.createContext(captureBox);vm.runInContext(read('public/pcm-capture-worklet.js').replace(/^export .*$/mg,''),captureBox);
+  const capture=new captureBox.P({processorOptions:{}}),outputs=[[new Float32Array(128)]];
+  assert.equal(capture.process([[new Float32Array(128)]],outputs),true);capture.port.onmessage({data:{type:'stop'}});
+  capture.port.onmessage({data:{type:'set-mute',muted:true}});assert.equal(capture.process([[new Float32Array(128)]],outputs),false);
+  assert(outputs[0][0].every(x=>x===0));assert(!capture.kernel.muted);checks.push('capture-processor-terminates');
+  const alias=[];
+  for(const rate of [8000,16000,24000,44100,48000]){
+    const box={Float32Array,Float64Array,Math,Number,sampleRate:rate,
+      AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(n,P)=>box.P=P};
+    vm.createContext(box);vm.runInContext(player,box);const P=box.P;
+    if(rate>=24000){assert.equal(new P().rxFir,null);continue;}
+    const render=f=>{const p=new P(),out=[];let seq=0,now=0;
+      assert(p.rxFir,'P2-59-08 requires a real pre-Hermite FIR');
+      while(now<2200){while(seq*20<=now){const n=seq++;p._push({seq:n,arrival:n*20,
+        samples:Float32Array.from({length:480},(_,i)=>.25*Math.sin(2*Math.PI*f*(n*480+i)/24000))});}
+        const b=new Float32Array(128);p.process([],[[b]]);if(now>500)out.push(...b);now+=128000/rate;}
+      assert(out.every(Number.isFinite));return Math.sqrt(out.reduce((s,x)=>s+x*x,0)/out.length);};
+    const pass=render(200);assert(pass>.16&&pass<.19);
+    const frequencies=[rate*.51,rate*.6,rate===8000?6000:10000];
+    for(const frequency of frequencies){const db=20*Math.log10(Math.max(1e-16,render(frequency))/pass);
+      assert(db< -70,'alias '+rate+'/'+frequency+' '+db);alias.push({rate,frequency,rejectionDb:+db.toFixed(2)});}
+    const p=new P();p.rxFir.r.fill(1);p._reset();assert(p.rxFir.r.every(x=>x===0));
+    p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
+    p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
+  }
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v60'));
+  for(const asset of ['pcm-player-worklet.js?v=60-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
+  assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=60-audio'));
+  console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
+  recordResult('ADIM-5.V60','Low-rate player anti-alias; source/reset/starvation; guide permission/module/preview/heal races; explicit capture shutdown; cache60',true);
+  console.log('V60 UNIT PASS');
+}
+
+
+async function runV60AudioRoundTrip({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
+  const code='RY-V60-'+Date.now().toString(36).toUpperCase(),headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
+  const sockets=[],native=[],relay=[],sent=new Map(),errors=[],joined=new Set();let session,h,created=false,sequence=0;
+  const until=async f=>{const end=Date.now()+5000;while(!f()){if(Date.now()>end)throw Error('V60 E2E deadline');await new Promise(r=>setTimeout(r,5));}};
+  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});
+    assert.equal(r.status,200);return r.json();};
+  const poll=async()=>{const data=await post({...session,subscriptionContext:{type:'join',role:'pilgrim',tourCode:code,roomId:'genel',pin:'6060',name:'V60 HTTP'}});
+    relay.push(...(data.messages||[]).filter(m=>m.type==='audio-chunk'));};
+  const open=async(role)=>{const s=new WebSocket(url);sockets.push(s);s.on('error',e=>errors.push(e.message));
+    s.on('message',(raw,binary)=>{if(binary)native.push(Buffer.from(raw));else try{if(JSON.parse(raw.toString()).type==='joined')joined.add(s);}catch(e){errors.push('JSON');}});
+    await new Promise((resolve,reject)=>{s.once('open',resolve);s.once('error',reject);});
+    s.send(JSON.stringify({type:'join',role,tourCode:code,roomId:'genel',name:'V60 '+role,pin:'6060',token:role==='guide'?token:undefined}));
+    return s;};
+  try{
+    const createdResponse=await fetch(baseUrl+'/api/tours',{method:'POST',headers,body:JSON.stringify({code,name:'V60 pipeline',pin:'6060'})});
+    assert.equal(createdResponse.status,200);await createdResponse.arrayBuffer();created=true;
+    const guide=await open('guide');await open('pilgrim');await until(()=>joined.size===2);
+    const opened=await post({type:'relay-open',version:56});session={clientId:opened.clientId,relayKey:opened.relayKey};await poll();
+    const captureBox={Float32Array,Float64Array,Math,Number};vm.createContext(captureBox);
+    vm.runInContext(fs.readFileSync(path.join(ROOT_DIR,'public/pcm-capture-worklet.js'),'utf8').replace(/^export .*$/mg,''),captureBox);
+    const frames=[],kernel=new captureBox.RysCaptureKernel(48000,{continuousSpeech:true,comfortFade:false},m=>frames.push(m.samples));
+    kernel.process(Float32Array.from({length:96000},(_,i)=>.25*Math.sin(2*Math.PI*6000*i/48000)));
+    const samples=frames.slice(-30);assert.equal(samples.length,30);
+    h=createV60GuideHarness(fs.readFileSync(path.join(ROOT_DIR,'public/rehber.html'),'utf8'),{onFrame:m=>{
+      const seq=sequence++,bytes=Buffer.alloc(972);bytes.writeUInt32LE(seq,0);bytes.writeDoubleLE(Date.now(),4);
+      for(let i=0;i<480;i++)bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,m.samples[i]))*32767),12+i*2);
+      sent.set(seq,bytes);guide.send(bytes);
+    }});
+    const start=async id=>{const p=h.g.toggleMicBroadcast();h.requests.at(-1).resolve(h.stream(id));await p;assert(h.g.isMicBroadcasting);};
+    await start('guide-first');let callback=h.g.scriptProcessor.port.onmessage;
+    const paced=performance.now();
+    for(let i=0;i<30;i++){
+      if(i===15){
+        h.g.stopMicBroadcast();callback({data:{samples:samples[i]}});assert.equal(sent.size,15);
+        const pending=h.g.toggleMicBroadcast();h.g.stopMicBroadcast();h.requests.at(-1).resolve(h.stream('cancelled-late'));await pending;
+        assert(!h.g.isMicBroadcasting);assert.equal(sent.size,15);await start('guide-new');callback=h.g.scriptProcessor.port.onmessage;
+      }
+      const wait=paced+i*20-performance.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));
+      callback({data:{samples:samples[i]}});
+      if(i%5===4){await until(()=>native.length>=i+1);await poll();}
+    }
+    h.g.stopMicBroadcast();callback({data:{samples:samples[0]}});await until(()=>native.length===30);await poll();
+    assert.equal(sequence,30);assert.equal(relay.length,30);assert.deepEqual(errors,[]);
+    for(let i=0;i<30;i++){
+      assert(native[i].equals(sent.get(i)));assert.equal(relay[i].seq,i);
+      assert(Buffer.from(relay[i].pcm16,'base64').equals(sent.get(i).subarray(12)));
+    }
+    const rendered=[];
+    for(const rate of [8000,16000]){
+      const box={Float32Array,Float64Array,Math,Number,sampleRate:rate,
+        AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(n,P)=>box.P=P};
+      vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(ROOT_DIR,'public/pcm-player-worklet.js'),'utf8'),box);
+      const p=new box.P();for(const bytes of native){const seq=bytes.readUInt32LE(0);p._push({seq,arrival:seq*20,
+        samples:Float32Array.from({length:480},(_,i)=>bytes.readInt16LE(12+i*2)/32768)});}
+      const output=[];for(let now=0;now<550;now+=128000/rate){const block=new Float32Array(128);p.process([],[[block]]);if(now>150)output.push(...block);}
+      assert(output.every(Number.isFinite));const rms=Math.sqrt(output.reduce((s,x)=>s+x*x,0)/output.length);
+      if(rate===8000)assert(rms<.0001,'6kHz must not alias at an 8kHz output');else assert(rms>.05,'6kHz must remain audible at a 16kHz output');
+      rendered.push({rate,rms:+rms.toExponential(3)});
+    }
+    console.log('V60 E2E METRICS '+JSON.stringify({nativeFrames:native.length,httpFrames:relay.length,bytesEqual:true,staleForwarded:0,rendered}));
+    recordResult('ADIM-3.V60','Actual capture kernel -> fenced guide callback -> real native/HTTP relay -> low-rate player; cancelled/stale capture sends no PCM',true);
+    console.log('V60 E2E PASS');
+  }finally{
+    h?.g.stopMicBroadcast();for(const s of sockets)try{s.terminate();}catch(e){}
+    if(session)try{await post({...session,type:'relay-close'});}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -2327,6 +2584,7 @@ async function main() {
     await runStep5V57RoutingChecks();
     await runStep5V58InputChecks();
     await runStep5V59AudioChecks();
+    await runStep5V60AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
```

## 8. Son doğrulama ve ölçümler

**Son rapor artefaktı üzerinden aday tam paket:38/38 PASS, exit0.** V53–V59 E2E/unit kontrolleri ve yeni ADIM-3.V60/ADIM-5.V60 birlikte geçti. Kaynaklar diskte hâlâ e41e201/v59; burada38 sayısı yalnız bellek uygulamasına aittir. Raporun gerçek diff'inde FIR sınıfı, pre-Hermite çağrısı, reset/starvation temizliği,17 lifecycle kontrolü ve iki yeni test çağrısı ayrıca kontrol edildi. Artık açıklamadaki FIR ile diff/test içeriği eşleşiyor.

### 8.1 Disk ve aday300 dinleyici karşılaştırması

| Ölçüm | Disk v59 | Son v60 aday |
|---|---:|---:|
|Toplam doğrulama |36/36 |38/38 |
|Aynı IP'de doğru HTTP katılımı |300/300 |300/300 |
|Gerçek WS |301 |301 |
|Sağlıklı dinleyici/çerçeve |270×120=32,400 |270×120=32,400 |
|Bozuk çerçeve |0 |0 |
|Kontrollü slow-peer drop |1500 |1500 |
|Hard izole peer |3 |3 |
|Send→Node callback P50 |11.61ms |10.58ms |
|P95 |19.17ms |19.15ms |
|P99 |33.56ms |34.58ms |
|Max |55.55ms |41.07ms |
|Event-loop P99 |25.18ms |25.21ms |
|CPU user+system |1203ms |1157ms |
|Ölçülen yayın fazı |2425.8ms |2430.0ms |

Bunlar tek makinede kısa native fan-out regresyonlarıdır; küçük farklar optimizasyon kazancı olarak yorumlanmaz. CPU aynı Node sürecindeki sunucu+301 istemcinin toplamıdır. Latency tarayıcı capture→DAC değildir.30 slow peer'ın duraklatılması ve bufferedAmount enjeksiyonu yukarıda açıklandığı gibi kontrollüdür;1500 drop sağlıklı dinleyicilerde değildir. Paket byte kontrolü fiziksel cızırtı ölçümü değildir.

### 8.2 P2-59-08 öncesi/sonrası

200Hz/.25 genlik referansına göre, başlangıç500ms hariç gerçek player process çıkışı RMS oranları:

| ÇıkışHz / test tonuHz | v59 | v60 |
|---|---:|---:|
|8000 /6000 |-0.48dB (2kHz'e güçlü alias) |-114.02dB |
|16000 /10000 |-2.54dB (6kHz'e güçlü alias) |-127.11dB |
|8000 /4080 |Yeni test |-76.56dB |
|8000 /4800 |Yeni test |-107.60dB |
|16000 /8160 |Yeni test |-97.45dB |
|16000 /9600 |Yeni test |-115.88dB |

24/44.1/48kHz'de rxFir=null bypass; düşük hızda reset ve starvation sonrası FIR ring sıfır. Bu seçilmiş altı ton ölçümüdür; bütün frekans/faz/clock farkları için minimum stopband veya Bluetooth donanımı garantisi değildir.193-tap filtreyi genel “-118dB her yerde” diye etiketlememek gerekir.

Mevcut capture doğrulamasında8/16/44.1/48kHz2s girişin her biri100×480 örnek;128/2048 callback parçalama birebir.200Hz jitter/PLC fixture max ardışık fark0.007356,iki kayıp paket için960 PLC örneği. Bu önceki testler capture/PLC kapsamındadır; v60'ın düşük çıkış testinin yerine geçmez.

### 8.3 Yeni E2E ve yarış kanıtı

Yeni gerçek localhost karma taşıma: **30 native +30 HTTP frame; bütün PCM baytları eşit; staleForwarded=0**.6kHz capture tonu taşındıktan sonra8kHz player RMS2.733e-7,16kHz player RMS0.1317: düşük hızda alias baskılanırken16kHz çıkışta geçerli6kHz içerik korunuyor. ADC/DAC ve getUserMedia cihaz katmanı modellenmiştir; AudioWorklet işlemci sınıfı ve sunucu HTTP/WS yolları gerçek kaynak kodudur.

v59 stop-before-permission tekrar üretimi: kullanıcı durdurduktan sonra izin döndü; isMicBroadcasting=true, eski iz live,stop sayısı0 ve bir yeniden yayın çağrısı. v60 aynı sırada yayın false,micStream=null,geç gelen iz stop sayısı1; canlı yayın çağrısı0.17 lifecycle kontrolü geçti: ters izin sırası, bekleyen addModule/import, iptal sonrası ikinci izin isteğinin engellenmesi, eski worklet/fallback/track/error, force cooldown ve in-flight korunumu, heal ticket, önizleme sonrası yeni graph'ın korunması, kaynak/veri bırakılması, start/stop hook hataları, güncel mute/profil ve explicit processor shutdown.

### 8.4 Dosya bütünlüğü ve karar

- v60 unified diff: **12 dosya** — scripts/verify-system.js, iki PCM worklet, public/sw.js ve sekiz HTML sayfası. server.js ve vercel-ws-shim.js mantığı değişmez.
- **git apply --check -** ve **git apply --check --ignore-space-change -**:exit0. Patch UTF-8/LF'dir. Hunk'taki boş context satırının tek boşluk prefix'i unified diff biçiminin parçasıdır.
- Başlangıç15 kaynak dosyasının SHA-256'sı tekrar kontrol edildi: **0 fark**. Yalnız AUDIO_EXCELLENCE_REPORT.md güncellendi; önceden silinmiş iki rapor korunuyor. HEAD değişmedi; deploy yok.

**Nihai karar:** v59 teslim edilen diff'e uygundur, fakat P2-59-08 o diff'te eksiktir ve36 test bunu kanıtlayamaz. v60 bu eksikliği ve yeniden üretilebilen mikrofon yaşam döngüsü kusurlarını kapatan, rapordan test edilmiş inceleme/staging adayıdır. Gerçek Kâbe RF yükü,300 HTTP fallback kapasitesi, OS ekran kilidi sürekliliği, fiziksel gürültü izolasyonu ve çapraz cihaz echo için onay verilmez; bölüm6'daki cihaz/saha kabulü gereklidir.

<!-- SOURCE-HASHES {"server.js":"d71033560fb172e2ffe53a2b2049f20e717bb64ab7c62ed1fdcd24c93fecc669","scripts/verify-system.js":"01473aa67bc5ad947cb9f29a366adb79daace9c509f5438292676577651f2ca8","public/ani-kitabi.html":"ac2b6e4551512e1cd2f86d6809dd5fe3887c83514edfab880fb66d8c4c5ed145","public/dinle.html":"702547873bcce2f8029d1db24266c9765c670d327a628c5c73f04c1f7c303e76","public/index.html":"b878ce84757ac8f554376e54feaf1e7999e59e5e988ee67fbe8c7aa583739ed4","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"9bcf2b98ac9d65a1de5b9584992806fcb220bddb81918fab692805ff7a5a30a1","public/panel.html":"c388f1596316d99ba9dd252b8e2c7fef8138137519beecdc10dfe9be1b893f22","public/pcm-capture-worklet.js":"e6f7c223b92928825481589f626e53b64ff70c17710f668000440c68d559e564","public/pcm-player-worklet.js":"5ef41d4d3aa8ef142b7cff93c0ebd364cdcd4e8da33f50c24b86e17218b69371","public/rehber.html":"ae40c815b5eff77722668fd50eb7f68faf41873e40f71bb7e1db9f8ec3950a87","public/rota.html":"68644e2e8aacdb1bec2687f11427cd2d2ddaca3dd89ed8ad2a922975aa29bdde","public/sw.js":"74443c290603859d3acb8d3e7a9bcaf64d64993c02fff77f08623ef3c75049f3","public/vercel-ws-shim.js":"33831bb515dcec2932c2060f67882cc2a1e720c14f1726dde8ff2b410a962d6f","public/yaka-karti.html":"4293fc99127b61224662b670ba526fe9b631cf09b7b0246822043a75c1a53872"} -->
