# RıdvanSes v59 — Gerçek Zamanlı Ses ve 300 Dinleyici Denetimi

Tarih: 8 Kasım 2026. İncelenen disk HEAD: fb29574fd00e9c3af57ae59b6a69be3ec33d0e73 (v58). Çıktı yalnız bu rapordur; yama kaynaklara uygulanmamıştır. Commit/push/dağıtım yapılmamıştır.

## 1. Karar ve v58 doğrulaması

Önceki rapordaki v58 diff için git apply --reverse --check --ignore-space-change -: **exit 0** (ek bayrak olmadan git apply --reverse --check de exit0). Diskte node scripts/verify-system.js: **34 / 34 PASS, exit 0**; V53/V54/V56/V57/V58 regresyonları geçti. Bu, Kâbe'de 300 fiziksel telefon için sıfır kopma/cızırtı sertifikası değildir.

**v59 gereklidir:** ortak IP katılım sınırı, live fakat muted mikrofon izinin kurtarılamaması, biriken gecikmenin çok yavaş giderilmesi, ani gain değişimi ve HTTP fan-out'ta tekrarlanan JSON parse için tam yama aşağıdadır. Fiziksel ADC kırpılması, başka konuşmacıların %100 ayrılması, TCP head-of-line ve OS arka plan durdurması JavaScript ile sıfırlanamaz.

İstekteki genel adların karşılığı: client.js = public/rehber.html + public/dinle.html; client-shim.js = public/vercel-ws-shim.js; pcm-worklet.js = public/pcm-capture-worklet.js + public/pcm-player-worklet.js. Ayrı client.js dosyaları yok. Gerçek endpoint /api/ws-relay; /api/rys-relay veya checkRateLimit adlı fonksiyon yok.

Başlangıçta kullanıcıya ait AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md silmeleri vardı; korunmuştur. Rapor dışındaki kaynakların HEAD'de bırakılması bu silmeleri geri almak anlamına gelmez.

## 2. Bulgular — v58 disk satırları

| Öncelik | Kaynak / konum | Etki ve v59 çözümü |
|---|---|---|
| P1-59-01 | server.js:508–545, 1830–1845 | /api/join-tour toplam60/IP/dakika: tek NAT'ta300 doğru katılımın240'ı429 olabilir. Doğru code/PIN için1200/dakika admission; yanlış denemeler ayrı scope ile60/dakika. Yanlış PIN kotası doğru kullanıcıyı engellemez. |
| P2-59-02 | public/rehber.html:1656–1664, 1764–1813 | devicechange zorlamasız heal çağırıyor; live iz sıfır üretirken chunk heartbeat sürer. Debounce force rebuild, onmute/onunmute, 2s mute tespiti ve 3s tekrar freni eklenir. Fiziksel konuşma sessizliği yüzünden reset yapılmaz. |
| P2-59-03 | public/pcm-player-worklet.js:159–166, 244–247 | 33→24 trim sonrası480ms kalabilir. ±1000ppm en fazla1ms/s kazandırır; 300ms fazlayı eritmek yaklaşık300s sürer. target+120ms üzerinde500ms kalınca sonraki kaynak çerçevesinde target+40ms'e trim ve72 örnek raised-cosine PLC geçişi. Eski kelimeler atlanır; geri getirilemez. |
| P2-59-04 | public/rehber.html:1259–1265; public/dinle.html:1963–1966 | Doğrudan gain.value ataması dalgada ani sıçrama yapabilir.10ms setTargetAtTime; ilk kurulum ataması korunur. |
| P2-59-05 | server.js:451–456, 1268–1295, 1357–1374 | Native binary zaten tek Buffer'dır. HTTP alıcı başına aynı JSON tekrar parse ediliyor. Native→HTTP tek immutable DTO; JSON broadcast'ta tek lazy parse/ortak DTO. TTL/kapasite, yetki, rota ve handoff korunur. |
| P2-59-06 | public/dinle.html:1554–1569, 1874–1887 | WaveShaper oversample=none, limiter harmoniklerinde alias riski.4x oversampling seçilir. Önceden kırpılmış mikrofonu veya WaveShaper ±1 alanını aşan %200 sesi geri getirmez. |
| P2-59-08 | public/pcm-player-worklet.js:82,199–201,244–283 | Gerçek çıkış bağlamı8/16kHz olursa24kHz PCM Hermite ile filtresiz küçülüyor ve ses bandına alias katlanıyor. Yalnız çıkış<24kHz için193-tap Blackman anti-alias FIR eklenir; fc=0.45×çıkışHz,4ms kaynak gecikmesi.44.1/48kHz yolu bypass. |
| P2-59-07 | server.js:515–524 | 5000 bucket üstünde yalnız eskiler temizleniyor; aktif IP'ler sınırsız büyüyebilir.5000 kayıt üst sınırı ve tam reset anında expiry eklenir; dolu kapasitede429. Genel DDoS çözümü değildir. |

300 WS'yi ortak IP nedeniyle1008 ile kapatan uygulama kuralı bulunmadı. Login30/dakika, SOS ve demo limitleri korunur; hacı katılımı rehber/admin login'i kullanmaz. Express trust proxy=1 (server.js:53) tek güvenilir proxy varsayar. VDS Nginx/CDN/firewall konfigürasyonu depoda yok: upstream limit_conn/limit_req/timeout ölçülmedi. deviceId kolay taklit edilebildiği için güvenilir kota anahtarı seçilmedi.1200 doğru katılım/dakika,300 kişi için dört giriş bütçesidir; bütün operatör için sınırsızlık değildir.

## 3. Mikrofon, DSP ve akustik

Hat: gUM → gerçek AudioContext sampleRate → HP85Hz /210Hz -2.5dB /3.2kHz +2dB /LP10.5kHz /gain → capture →24kHz mono PCM16,480 örnek/20ms →12B başlık+960B PCM → WS/relay → listener decode → seq/jitter/PLC worklet → Hermite ASRC → HP/clarity/gain/limiter → çıkış.

public/pcm-capture-worklet.js:10–49,152–219:193 tap/256 faz Blackman sinc; fc=min(10200/rate,.45). Tam sayı zaman sayacı ve sürekli ring geçmişi callback sınırlarında sıfırlanmıyor.8/16/44.1/48kHz'de2s tam100 paket.3072 tamponu artık yok; tipik128 Worklet ve2048 ScriptProcessor aynı çekirdeği kullanıyor.44.1kHz kesirli fazı korunuyor.

HFP8/16kHz fiziksel kaynak, AudioContext'in8/16kHz olacağını garanti etmez; OS48kHz'e yükseltebilir. Çekirdek bağlam hızını kullanıyor. Gerçek cihazda track.getSettings() sampleRate/channelCount/AEC/NS/AGC ile audioCtx.sampleRate kaydedilmeli.8kHz kaynağın4kHz üstü bilgisi geri üretilemez. EQ toplamı da nötr değildir: rehber85Hz HP, çekirdek~80Hz HP ve alıcı65Hz HP alt temeli birlikte azaltır;3.2kHz +2dB ve alıcı3kHz +1.5dB ünsüz bandını artırır. Biquad low/highpass Q birimi dB olduğundan -3.0103 doğrudur; bunu0.707 ile değiştirmek yanlış olur. Rehber gain UI%60–180, alıcı%0–200 (varsayılan120) olduğundan baş boşluğu cihazda ölçülmelidir. FIR gecikmesi96/girişHz:48kHz'de2ms,8kHz'de12ms. İstenen48kHz gUM constraint'i donanım garantisi değildir.

Capture:90–148:~80Hz DC/HP; ~200/1000/4000Hz enerji ayırıcıları (ayrık FFT bantları değildir);400ms kalibrasyon,8×500ms rolling minima,6.1–8.9dB açılma,4dB hysteresis,240ms hangover,3ms attack/120ms release,10ms lookahead. Kapalı gain0.126≈-18dB, mutlak sessizlik değildir. Comfort:600ms sonrası80ms düşüş ve sıfıra yuvarlama;2ms raised-cosine açılma; sürekli3ms delay. Mute yumuşatılır.

Gate konuşmacı kimliği tanımaz. Güçlü yan konuşma açabilir; sürekli rehber sesi noise minima'ya karışabilir; ilk400ms konuşma kalibrasyonu etkiler. continuousSpeech uzun kıraat/dua sonlarını korur, ortamı da geçirir. Tek kanalda örtüşen sesleri %100 ayıracak eşik yoktur. Ağıza yakın mikrofon, doğru yön ve headroom gerekir. Gerçek kalabalık kaydı olmadan gate'i sertleştirmek hece kaybını artırabilir; bu tur ölçülen capture53 korunur.

Limiter çıkışı ±0.98 ile bounded; DC ölçümü küçüktür. Fiziksel ADC/Bluetooth codec kırpılması düzeltilemez; yoğun sınırlama harmonik üretir. Capture limiter24kHz'de doğrusal olmayan bloktur: FIR stopband testi, limiter sonrası tüm harmoniklere alias-free garantisi vermez. Bağırırken giriş kazancı azaltılmalı; %200 çıkış doğal ses garantisi değildir.

AEC isteği beamforming garantisi değildir. Yerel render referansı, başka hacı telefonunun50–400ms gecikmiş hoparlörü için senkron referans sağlamaz. BroadcastChannel farklı telefonlar arasında çalışmaz. Yakındaki alıcılar kulaklık kullanmalı, döngü kazancı fiziksel olarak azaltılmalı. Çok cihazlı echo iptali için render referansı/zaman hizalama/adaptif filtre/double-talk ve saha impulse-response ölçümü gerekir. [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) constraint, mute/ended ve devicechange semantiğinin kaynağıdır.

## 4. 1→300 taşıma ve kapasite

Native:972×50=48,600B/s=388.8kbit/s/kişi.300 dinleyici **14.58MB/s=116.64Mbit/s** uygulama egress'i; TCP/TLS/WS/kontrol eklenir. Rehber uplink tek akış. JSON base64 salt PCM512kbit/s/kişi;300'de en az153.6Mbit/s; JSON/MQTT/HTTP ekleri hariç. Çift broker alımları trafiği artırır. Ham PCM, kalabalık roaming hücresinde esas kapasite riskidir.

server.js:431–449: native soft9720B≈200ms,JSON16000B; >65536B hard terminate,2s soft tıkanmada terminate. Gönderim peer bazında atlanır; hızlılar bağımsız devam eder. TCP'ye yazılmış baytlar geri alınamaz: HOL ve kayıp kelimeler PLC ile sıfırlanmaz. Native tek Buffer/no-deflate doğrudur; alıcı başına PCM kopyalama eklenmedi.

HTTP outbox audio10/200ms,control64 (1357–1390); shim audio4batch/200ms,control64; coalescer40ms/max3 ve failback12s. Broker açıkken empty poll sürer; v55 parity korunur.300 HTTP fallback kullanıcı100ms tick ve hızlı cevapta yaklaşık **3000 istek/s** üretir; RTT yükselirse single-flight nedeniyle azalır. Native300 testinin ayrı kapasite sınıfıdır. Opaque relay35s poll kesintisinde sona erer;30s sweep nedeniyle bellekten temizlenme35–65s aralığında, sonraki istekte doğrudan35s kontrolü vardır. Arka plan donması bu süreyi aşarsa409/yeni session ile toparlanır; kesintisizlik sayılmaz. Poll'u broker var diye kaldırmak native-guide/HTTP-listener parity'yi bozar.

RAM Map oda/relay/handoff tek süreç/aynı instance varsayar. Vercel serverless instance'ları RAM paylaşmaz; farklı instance'a poll bu testin kapsamı dışındadır. Production relay tutarlı uzun ömürlü VDS'ye yönlendirilmeli veya paylaşımlı state/broker kullanılmalı. Public MQTT istemci içinden üretilebilen imza, gerçek kimlik/ACL/SLA değildir. Yetkili özel broker ve tercihen Opus/WebRTC/SFU sonraki mimari iştir; v59 codec/protokol göçü içermez.

## 5. Oynatıcı, jitter ve mobil arka plan

public/dinle.html:2035–2135 binary/JSON tek seq; pending13/260ms TTL (1580–1597). Aktif PCM renderer player Worklet'tir; eski BufferSource zamanlayıcı değişkenleri aktif yedek oynatım kanıtı değildir. Worklet yoksa initRxPlayerWorklet:1598–1609 renderersız döner: legacy tarayıcı destek dışıdır; bu tur yeni fallback yazılmadı.

Player hedef80–260ms adaptive jitter; modulo2^31 dedup/sıralama;60–500Hz pitch PLC,60ms cosine decay;300ms starvation sonrası yeniden ön tamponlama. Gerçek PCM dönüşü72/24k=3ms raised-cosine, başlangıç/reset5ms fade. v58 düşük çıkış hızında FIR kullanmıyordu:8kHz çıkışta6kHz,16kHz çıkışta10kHz test tonu ses bandına katlanıyordu; v59 pre-Hermite FIR bunu engeller. Hermite fazı paketler arasında sürekli; ±1000ppm ASRC saat farkı içindir. v59 catch-up mevcut çerçeveyi/fazı sıfırlamaz; geçiş kaynak çerçevesi sınırındadır. Yumuşatma kayıp fonemi geri getirmez; ölçülmüş WSOLA/SOLA ve Opus PLC daha doğal uzun toparlama için ayrı iştir.

public/dinle.html:1656–1703 rebuild;1709–1808 interruption/recovery;1894–1927 state/gesture;2558 SW. Context/token koruması eski callback'i engeller. Rebuild PCM beklemesini temizler; arama boyunca kayıp konuşmayı saklamaz. Resume reddedilirse dokunuş gerekebilir. Worker timer OS dondurmasından muaf değildir; sessiz oscillator/audio veya SW arka plan yetkisi vermez. WakeLock ekranı açık tutar; kilitli ekranda sonsuz süreklilik değildir. [Web Audio API](https://www.w3.org/TR/webaudio/) context/AudioParam; [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) görünürlük/lock sınırlamalarının kaynağıdır.

## 6. Test düzeni ve kanıt sınırı

Disk v58:34/34 PASS; reverse-check exit0. ADIM-3.V59 gerçek yerel TCP/WS ile1 rehber+300 hacı kurar: aynı X-Forwarded-For ve loopback kaynak IP,300 HTTP katılımı,270 sağlıklı+30 duraklatılan soket. Platform TCP pencere boyutundan bağımsız deterministik kontrol için peer.bufferedAmount getter'ı **yalnız testte**20,000B enjekte edilir;3 peer65,537B hard-limit. Prototype handleUpgrade hook/getter üretim koduna eklenmez. Bu gerçek RF/CGNAT emülatörü veya OS tamponunun doğal dolum ölçümü değildir.

120×972B, mutlak zaman hedefine bağlı20ms aralık ve119 aralık için2300–2700ms pacing doğrulaması; sağlıklı başına120 sıra/doğru bayt, latency yüzdelikleri, CPU/event-loop,30 yavaşta1500 kontrollü drop, geri geliş ve3 hard izolasyon. Yerel P99<500ms kaba regresyon freni; saha ağı kabul hedefi değildir. ADIM-5.V59:8/16/44.1/48kHz, callback eşitliği, FIR seçilmiş frekansları, DC/limiter/impulse, zayıf ünsüz hangover modeli, jitter/reorder/duplicate/2 paket PLC,8/16kHz gerçek player çıkışında alias reddi ve catch-up/gain/mute/kota. Bayt bütünlüğü akustik “0 cızırtı” değildir.

Tamamlanan son ölçümler bölüm9'dadır.

## 7. Uygulama ve saha kabulü

1. Diff'i UTF-8 v59.patch olarak çıkarın; git apply --check --ignore-space-change v59.patch, ardından git apply --ignore-space-change v59.patch. Bu denetim kaynaklara uygulamaz.
2. node scripts/verify-system.js: yeni toplam36/36 ve V59 E2E/UNIT PASS beklenir. Test geçici tur/soketleri finally'de kapatır; ana paket runtime.json snapshot'ını geri yükler.
3. Önce staging300 native, ayrıca300 HTTP fallback kapasitesi: egress/event-loop/reconnect ve capture→DAC P50/P95/P99. Native yerel sonuç HTTP/MQTT veya VDS donanım kapasitesi kanıtı sayılmaz.
4. Gerçek8/16kHz Bluetooth ve kablolu44.1/48kHz, iki iOS+iki Android ile30dk saha: kalabalık kayıt, kıraat/yumuşak ünsüz, tak/çıkar, mute/ended, kilit, arama/alarm/WhatsApp, Wi-Fi↔4G,50–400ms hoparlör geri dönüşü. Kayıp kelime/kırpılma ve insan dinlemesi kaydı; kalibre dBA olmadan80dB iddiası yok.
5. SW cache59, HTML shim59 ve player59-audio birlikte dağıtılmalı. Capture53-audio değişmedi; shim mantığı57 ve wire handoff56 korunur. URL59 bir protokol değişikliği değildir; yeni worklet gerçekten yüklenmeli.

Diff eksiksizdir; placeholder veya rapordan kod okuyan test içermez. Satırlar v58 tabanına aittir.

## 8. v59 unified diff

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -451,9 +451,15 @@
 function broadcastToRoom(room,payload,excludeWs=null,isAudioOverride=false){
   const audio=isAudioOverride||!!(payload&&typeof payload==='object'&&payload.type==='audio-chunk');
   const data=typeof payload==='string'?payload:JSON.stringify(payload);
+  let relayData;
   for(const client of room.clients.values()){
     const socket=client.ws;if(socket===excludeWs||socket.readyState!==WebSocket.OPEN)continue;
-    if(audio)rysSendAudio(socket,data,false);
+    if(audio){
+      if(socket.isHttpRelay&&relayData===undefined){
+        try{relayData=payload&&typeof payload==='object'?payload:JSON.parse(data);}catch(e){relayData=data;}
+      }
+      rysSendAudio(socket,socket.isHttpRelay?relayData:data,false);
+    }
     else {try{socket.send(data);}catch(e){}}
   }
 }
@@ -507,22 +513,21 @@
 
 // IP Tabanlı Hafif Hız Sınırlayıcı (Sliding Window Rate Limiter)
 const rateLimitBuckets = new Map();
-function createRateLimiter({ windowMs = 60000, max = 30, message = 'Çok fazla istek gönderildi. Lütfen biraz bekleyiniz.' } = {}) {
+function createRateLimiter({ windowMs = 60000, max = 30, scope = '', message = 'Çok fazla istek gönderildi. Lütfen biraz bekleyiniz.' } = {}) {
   return (req, res, next) => {
     const now = Date.now();
     const ip = String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').trim();
-    const key = `${req.baseUrl}${req.path}:${ip}`;
+    const key = `${scope}:${req.baseUrl}${req.path}:${ip}`;
     let entry = rateLimitBuckets.get(key);
-    if (!entry || now > entry.resetAt) {
+    if (!entry || now >= entry.resetAt) {
+      if (!entry && rateLimitBuckets.size >= 5000) {
+        for (const [k, v] of rateLimitBuckets) if (now >= v.resetAt) rateLimitBuckets.delete(k);
+        if (rateLimitBuckets.size >= 5000) return res.status(429).json({ success: false, message });
+      }
       entry = { count: 0, resetAt: now + windowMs };
       rateLimitBuckets.set(key, entry);
     }
     entry.count += 1;
-    if (rateLimitBuckets.size > 5000) {
-      for (const [k, v] of rateLimitBuckets.entries()) {
-        if (now > v.resetAt) rateLimitBuckets.delete(k);
-      }
-    }
     if (entry.count > max) {
       return res.status(429).json({
         success: false,
@@ -538,11 +543,21 @@
   max: 30,
   message: 'Çok fazla giriş denemesi yapıldı. Lütfen 1 dakika sonra tekrar deneyiniz.'
 });
-const joinTourRateLimiter = createRateLimiter({
-  windowMs: 60000,
-  max: 60,
-  message: 'Çok fazla kafile doğrulama isteği gönderildi. Lütfen kısa süre bekleyiniz.'
-});
+// v59: shared NAT admission and failed PIN attempts use separate buckets.
+const joinTourAdmissionLimiter = createRateLimiter({
+  scope: 'join-valid', windowMs: 60000, max: 1200,
+  message: 'Kafile katılımı yoğun. Lütfen kısa süre sonra tekrar deneyiniz.'
+});
+const joinTourFailureLimiter = createRateLimiter({
+  scope: 'join-invalid', windowMs: 60000, max: 60,
+  message: 'Çok fazla hatalı kafile veya PIN denemesi. Lütfen 1 dakika bekleyiniz.'
+});
+function joinTourRateLimiter(req, res, next) {
+  const body = req.body || {}, code = String(body.code || '').toUpperCase().trim();
+  const tour = db.tours.find(t => t.code.toUpperCase() === code);
+  const valid = !!tour && !(tour.pinProtected && tour.pin && String(tour.pin) !== String(body.pin || '').trim());
+  return (valid ? joinTourAdmissionLimiter : joinTourFailureLimiter)(req, res, next);
+}
 const sosRateLimiter = createRateLimiter({
   windowMs: 60000,
   max: 20,
@@ -1265,7 +1280,7 @@
       const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
       if (!validBinaryPcmFrame(buf)) return;
       ctx.currentRoom.activePublisherClientId = ctx.clientId;
-      let fallbackJsonStr = null;
+      let fallbackPayload = null;
 
       for (const r of getTargetBroadcastRooms(ctx.currentRoom)) {
         for (const peer of r.clients.values()) {
@@ -1273,13 +1288,13 @@
           if (!peer.ws.isHttpRelay) {
             rysSendAudio(peer.ws,buf,true);
           } else if (buf.length > 12) {
-            if (!fallbackJsonStr) {
+            if (!fallbackPayload) {
               const rawSeq = buf.readUInt32LE(0);
               const phraseStart = Boolean(rawSeq & 0x80000000);
               const seq = rawSeq & 0x7fffffff;
               const sentAt = buf.readDoubleLE(4);
               const pcmSlice = buf.subarray(12);
-              fallbackJsonStr = JSON.stringify({
+              fallbackPayload = {
                 type: 'audio-chunk',
                 seq,
                 phraseStart,
@@ -1290,9 +1305,9 @@
                 pcm16: pcmSlice.toString('base64'),
                 level: 0.35,
                 sentAt
-              });
+              };
             }
-            rysSendAudio(peer.ws,fallbackJsonStr,false);
+            rysSendAudio(peer.ws,fallbackPayload,false);
           }
         }
       }
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -578,6 +578,7 @@
   await runV56HandoffChecks({baseUrl,url:wsUrl,token:authToken});
   await runV57RoutingChecks({baseUrl,url:wsUrl,token:authToken});
   await runV58InputChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV59FanoutChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1528,9 +1529,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v57"));assert(sw.includes('/vercel-ws-shim.js?v=57'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v59"));assert(sw.includes('/vercel-ws-shim.js?v=59'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'57',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'59',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2121,6 +2122,198 @@
   console.log('V58 UNIT PASS: bounded iterative wire validation; non-string metadata rejected; PCM/demo accepted; malformed cookies ignored');
 }
 
+
+// v59: real 301 WebSockets; deterministic queue fault injection is reported separately from TCP pause.
+async function runV59FanoutChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),wsLib=require('ws');
+  const {monitorEventLoopDelay}=require('node:perf_hooks');
+  const code='RY-V59-'+Date.now().toString(36).toUpperCase(),ip='198.51.100.59';
+  const auth={Authorization:'Bearer '+token,'Content-Type':'application/json'};
+  const sockets=[],peers=new Map(),received=Array.from({length:300},()=>[]),faults=[],latencies=[],sent=new Map();
+  const originalUpgrade=wsLib.WebSocketServer.prototype.handleUpgrade;let joined=0;
+  const deadline=async(test,ms=10000)=>{const end=Date.now()+ms;while(!test()){
+    if(Date.now()>end)throw Error('V59 deadline; joined='+joined);await new Promise(r=>setTimeout(r,5));}};
+  const request=async(body)=>{const r=await fetch(baseUrl+'/api/join-tour',{method:'POST',
+    headers:{'Content-Type':'application/json','X-Forwarded-For':ip},body:JSON.stringify(body)});await r.arrayBuffer();return r.status;};
+  const lag=monitorEventLoopDelay({resolution:10});let guide,created=false;
+  wsLib.WebSocketServer.prototype.handleUpgrade=function(req,socket,head,cb){
+    return originalUpgrade.call(this,req,socket,head,(ws,request)=>{
+      if(request?.headers['x-rys-v59']!==undefined)peers.set(request.headers['x-rys-v59'],ws);
+      return cb(ws,request);
+    });
+  };
+  const connect=async(index,role)=>{
+    const socket=new wsLib.WebSocket(url,{headers:{'X-Forwarded-For':ip,'X-Rys-V59':String(index)}});sockets.push(socket);
+    socket.on('error',e=>faults.push(e.message));
+    socket.on('message',(raw,binary)=>{
+      if(binary){
+        if(role==='guide')return;
+        const seq=raw.length===972?raw.readUInt32LE(0)&0x7fffffff:-1,expected=sent.get(seq);
+        if(!expected||!raw.equals(expected.bytes))faults.push('PCM mismatch '+index+'/'+seq);
+        else{received[index].push(seq);latencies.push(performance.now()-expected.at);}
+      }else{try{if(JSON.parse(raw.toString()).type==='joined')joined++;}catch(e){faults.push('bad JSON');}}
+    });
+    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
+    socket.send(JSON.stringify({type:'join',role,tourCode:code,roomId:'genel',pin:'3159',
+      token:role==='guide'?token:undefined,name:'V59 '+role+' '+index,deviceId:'v59-'+code+'-'+index}));
+    return socket;
+  };
+  let pace0=0;
+  const frame=async(seq)=>{
+    if(seq===0)pace0=performance.now();
+    const bytes=Buffer.alloc(972);bytes.writeUInt32LE(seq,0);bytes.writeDoubleLE(Date.now(),4);
+    for(let i=0;i<480;i++)bytes.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*200*(seq*480+i)/24000)),12+2*i);
+    sent.set(seq,{bytes,at:performance.now()});guide.send(bytes);
+    await new Promise(r=>setTimeout(r,Math.max(0,pace0+(seq+1)*20-performance.now()))); // paced 50 pps, never a synthetic all-at-once send storm
+  };
+  try{
+    const create=await fetch(baseUrl+'/api/tours',{method:'POST',headers:auth,
+      body:JSON.stringify({code,name:'V59 CGNAT 300',pin:'3159',guideName:'V59 guide -1'})});
+    assert.equal(create.status,200);await create.arrayBuffer();created=true;
+    const statuses=[];
+    for(let start=0;start<300;start+=30)statuses.push(...await Promise.all(Array.from({length:30},()=>request({code,pin:'3159'}))));
+    console.log('V59 CGNAT HTTP: '+JSON.stringify(statuses.reduce((a,s)=>(a[s]=(a[s]||0)+1,a),{})));
+    assert.equal(statuses.filter(s=>s===200).length,300,'300 valid clients behind one NAT must be admitted');
+    for(let i=0;i<61;i++)assert.equal(await request({code,pin:'wrong'}),i<60?403:429);
+    assert.equal(await request({code,pin:'3159'}),200,'failed PIN bucket must not block valid NAT peers');
+    guide=await connect(-1,'guide');
+    for(let start=0;start<300;start+=30)await Promise.all(Array.from({length:30},(_,j)=>connect(start+j,'pilgrim')));
+    await deadline(()=>joined===301&&peers.size===301);
+    const cpu=process.cpuUsage(),started=performance.now();lag.enable();
+    for(let seq=0;seq<20;seq++)await frame(seq);
+    await deadline(()=>received.every(a=>a.length===20));
+    const slow=sockets.filter(s=>s!==guide).slice(0,30);
+    for(let i=0;i<30;i++){
+      slow[i]._socket.pause();
+      // Deterministic transport-queue pressure, independent of OS TCP window size.
+      Object.defineProperty(peers.get(String(i)),'bufferedAmount',{configurable:true,get:()=>20000});
+    }
+    for(let seq=20;seq<70;seq++)await frame(seq);
+    const dropped=Array.from({length:30},(_,i)=>peers.get(String(i))._rysAudioDrops||0);
+    assert(dropped.every(n=>n===50),'each congested peer must drop exactly its 50 stale frames');
+    for(let i=0;i<30;i++){delete peers.get(String(i)).bufferedAmount;slow[i]._socket.resume();}
+    for(let seq=70;seq<110;seq++)await frame(seq);
+    await deadline(()=>received.slice(30).every(a=>a.length===110)&&received.slice(0,30).every(a=>a.length===60));
+    for(let i=0;i<3;i++)Object.defineProperty(peers.get(String(i)),'bufferedAmount',{configurable:true,get:()=>65537});
+    for(let seq=110;seq<120;seq++)await frame(seq);
+    await deadline(()=>received.slice(30).every(a=>a.length===120));
+    await deadline(()=>[0,1,2].every(i=>peers.get(String(i))._rysClosing));
+    lag.disable();
+    for(let i=30;i<300;i++)assert.deepEqual(received[i],Array.from({length:120},(_,n)=>n));
+    for(let i=3;i<30;i++)assert.deepEqual(received[i],[...Array.from({length:20},(_,n)=>n),...Array.from({length:50},(_,n)=>n+70)]);
+    assert.deepEqual(faults,[]);assert(latencies.every(x=>Number.isFinite(x)&&x>=0));
+    latencies.sort((a,b)=>a-b);const percentile=p=>latencies[Math.floor((latencies.length-1)*p)];
+    const elapsed=performance.now()-started,used=process.cpuUsage(cpu);
+    assert(percentile(.99)<500,'local fanout P99 exceeded 500ms; inspect host contention');
+    const metrics={listeners:300,healthy:270,frames:120,healthyFrames:270*120,
+      slowQueueDrops:dropped.reduce((a,b)=>a+b,0),hardIsolated:3,corrupt:0,
+      p50Ms:+percentile(.5).toFixed(2),p95Ms:+percentile(.95).toFixed(2),p99Ms:+percentile(.99).toFixed(2),
+      maxMs:+latencies.at(-1).toFixed(2),eventLoopP99Ms:+(lag.percentile(99)/1e6).toFixed(2),
+      cpuMs:+((used.user+used.system)/1000).toFixed(1),elapsedMs:+elapsed.toFixed(1)};
+    console.log('V59 METRICS '+JSON.stringify(metrics));
+    recordResult('ADIM-3.V59','300 same-IP joins; 301 real WS; 270 healthy intact; 30 paused + injected queues; 3 hard-isolated',true,JSON.stringify(metrics));
+    console.log('V59 E2E PASS: byte integrity and local transport delay; physical crackle/OS background are not measured');
+  }finally{
+    lag.disable();wsLib.WebSocketServer.prototype.handleUpgrade=originalUpgrade;
+    for(const s of sockets)try{s._socket?.resume();s.terminate();}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:auth});await r.arrayBuffer();}
+  }
+}
+
+
+async function runStep5V59AudioChecks(){
+  const assert=require('node:assert/strict');
+  const read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const capture=read('public/pcm-capture-worklet.js'),player=read('public/pcm-player-worklet.js'),guide=read('public/rehber.html'),listener=read('public/dinle.html'),server=read('server.js');
+  function pick(source,name){
+    const match=new RegExp('^[ \\t]*(?:async )?function '+name+'\\(','m').exec(source);
+    if(!match)throw Error('V59 missing '+name);
+    for(let end=source.indexOf('}',match.index);end>=0;end=source.indexOf('}',end+1)){
+      const text=source.slice(match.index,end+1);try{new vm.Script(text);return text;}catch(e){if(e.name!=='SyntaxError')throw e;}
+    }throw Error('V59 unterminated '+name);
+  }
+  const box={Float32Array,Float64Array,Math,Number,RangeError,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},
+    registerProcessor:(n,P)=>box.P=P,sampleRate:48000};
+  vm.createContext(box);vm.runInContext(capture.replace(/^export .*$/mg,''),box);
+  const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
+  const dsp=[];
+  for(const rate of [8000,16000,44100,48000]){
+    const input=Float32Array.from({length:rate*2},(_,i)=>.2+.8*Math.sin(2*Math.PI*997*i/rate));
+    const run=block=>{const frames=[],kernel=new box.RysCaptureKernel(rate,{continuousSpeech:true,comfortFade:false},m=>frames.push(Array.from(m.samples)));
+      for(let i=0;i<input.length;i+=block)kernel.process(input.subarray(i,i+block),i/rate);
+      assert.equal(frames.length,100);assert(frames.every(a=>a.length===480&&a.every(Number.isFinite)));
+      return frames.flat();};
+    const a=run(128),b=run(2048);assert.deepEqual(a,b,'128/2048 partition must preserve all samples');
+    const stable=a.slice(24000),dc=stable.reduce((s,x)=>s+x,0)/stable.length;
+    assert(Math.abs(dc)<1e-5);assert(Math.max(...stable.map(Math.abs))<.98);
+    const impulse=new box.RysFir24(rate),tail=[];
+    for(let i=0;i<rate;i++)impulse.push(i===0?1:0,x=>tail.push(x));
+    assert.equal(tail.length,24000);assert(tail.slice(2000).every(x=>Math.abs(x)<1e-15));
+    const amplitude=f=>{const fir=new box.RysFir24(rate),out=[];
+      for(let i=0;i<rate;i++)fir.push(.2*Math.sin(2*Math.PI*f*i/rate),x=>out.push(x));return rms(out.slice(2400));};
+    const pass=amplitude(1000);assert(pass>.13&&pass<.15);
+    const stop=rate>=44100?amplitude(14000):amplitude(rate*.49);
+    const stopDb=20*Math.log10(Math.max(1e-16,stop)/pass);
+    assert(stopDb<(rate>=44100?-75:-30),'band-edge rejection '+rate+' '+stopDb);
+    dsp.push({rate,frames:100,dc:+dc.toExponential(2),stopDb:+stopDb.toFixed(1)});
+  }
+  const loud=new box.RysCaptureKernel(48000,{continuousSpeech:true,comfortFade:false},m=>loudFrames.push(...m.samples)),loudFrames=[];
+  loud.process(Float32Array.from({length:96000},(_,i)=>.3+6*Math.sin(2*Math.PI*997*i/48000)));
+  assert(loudFrames.every(x=>Number.isFinite(x)&&Math.abs(x)<=.980001));
+  // Model a quiet consonant immediately after a loud vowel: verify hangover, not speaker identity.
+  const gate=new box.RysNearExpander();for(let i=0;i<12000;i++)gate.step(0);
+  for(let i=0;i<2400;i++)gate.step(.3*Math.sin(2*Math.PI*1500*i/24000));assert(gate.hold>0);
+  for(let i=0;i<480;i++)gate.step(.006*Math.sin(2*Math.PI*3000*i/24000));assert(gate.hold>0&&gate.g>.9);
+  vm.runInContext(player,box);const P=box.P,p=new P(),arrivals=[];
+  for(let seq=0;seq<110;seq++){
+    if(seq===20||seq===21)continue;
+    arrivals.push({seq,at:seq*20+[0,28,2,9][seq%4],samples:Float32Array.from({length:480},(_,i)=>.25*Math.sin(2*Math.PI*200*(seq*480+i)/24000))});
+  }arrivals.sort((a,b)=>a.at-b.at);
+  let now=0,prev=0,maxStep=0,index=0;
+  while(now<2050){
+    while(index<arrivals.length&&arrivals[index].at<=now){const m=arrivals[index++];p._push({...m,arrival:m.at});if(m.seq%7===0)p._push({...m,arrival:m.at});}
+    const out=new Float32Array(128);p.process([],[[out]]);
+    for(const y of out){assert(Number.isFinite(y)&&Math.abs(y)<=.99);maxStep=Math.max(maxStep,Math.abs(y-prev));prev=y;}
+    now+=128/48;
+  }
+  assert(p.stats.duplicate>0);assert(p.stats.concealed>=960);assert(maxStep<.06,'200Hz fixture abrupt jump '+maxStep);
+  const catchup=new P();catchup.playing=true;catchup.target=.08;catchup.expected=0;
+  catchup.haveHistory=true;catchup.frame.fill(.1);catchup.fi=0;catchup.catchupArmed=true;
+  for(let seq=0;seq<20;seq++)catchup.q.set(seq,new Float32Array(480).fill(-.1));
+  catchup.plc={fill:a=>a.fill(.1),append(){}};const phase=.375;catchup.phase=phase;
+  catchup._nextFrame();assert.equal(catchup.stats.catchupDropped,14);assert.equal(catchup.expected,15);
+  assert.equal(catchup.phase,phase);assert(Math.abs(catchup.frame[0]-.1)<1e-6);assert(Math.abs(catchup.frame[71]+.1)<1e-6);
+  const arming=new P();arming.playing=true;arming.target=.08;arming.haveHistory=true;arming.frame.fill(.1);arming.fi=0;
+  for(let i=0;i<210;i++){while(arming.q.size<20){const seq=arming.expected===null?0:(arming.expected+arming.q.size)%0x80000000;if(arming.expected===null)arming.expected=seq;arming.q.set(seq,new Float32Array(480).fill(.1));}
+    arming.process([],[[new Float32Array(128)]]);if(arming.stats.catchupDropped>0)break;}
+  assert(arming.stats.catchupDropped>0,'sustained backlog must arm catch-up within 560ms');
+  const env={isMicBroadcasting:true,isVoiceLoopbackTesting:false,isHealingGuideMic:false,
+    micStream:{getAudioTracks:()=>[{readyState:'live',muted:true}],getTracks:()=>[]},guideTrackMutedAt:1000,guideLastMicRebuildAt:0,
+    lastGuideMicChunkAt:5000,Date:{now:()=>5000},audioCtx:null,disconnectGuideAudioNodes(){},
+    setupGuideMicrophoneGraph:async()=>{env.rebuilds++;},rebuilds:0,window:{},document:{getElementById:()=>null},console};
+  vm.createContext(env);vm.runInContext(pick(guide,'healGuideMicrophoneIfNeeded'),env);
+  await env.healGuideMicrophoneIfNeeded();assert.equal(env.rebuilds,1);await env.healGuideMicrophoneIfNeeded();assert.equal(env.rebuilds,1);
+  assert(guide.includes('healGuideMicrophoneIfNeeded(true), 350'));assert(guide.includes('audioTrack.onmute'));
+  for(const [source,name,node,value] of [[guide,'updateGuideMicGain','guideMicGainNode',1.25],[listener,'updateVolume','gainNode',1.25]]){
+    const calls=[],g={audioCtx:{currentTime:9},document:{getElementById:()=>({})}};g[node]={gain:{setTargetAtTime:(...args)=>calls.push(args)}};
+    vm.createContext(g);vm.runInContext(pick(source,name),g);g[name](125);assert.deepEqual(calls,[[value,9,.01]]);
+  }
+  assert(listener.includes("softClipper.oversample = '4x'"));
+  const rateBox={rateLimitBuckets:new Map(),Date:{now:()=>0}};vm.createContext(rateBox);vm.runInContext(pick(server,'createRateLimiter'),rateBox);
+  const response={status(n){this.code=n;return this;},json(){}};let admitted=0;
+  const limiter=rateBox.createRateLimiter({max:1});const req={baseUrl:'',path:'/x',ip:'one',headers:{}};
+  limiter(req,response,()=>admitted++);limiter(req,response,()=>admitted++);assert.equal(admitted,1);assert.equal(response.code,429);
+  for(let i=0;i<5100;i++)limiter({...req,ip:'ip-'+i},response,()=>{});assert.equal(rateBox.rateLimitBuckets.size,5000);
+  rateBox.Date.now=()=>60000;limiter({...req,ip:'fresh'},response,()=>admitted++);assert.equal(admitted,2);
+  assert(server.includes('rysSendAudio(peer.ws,fallbackPayload,false)'));
+  assert(!server.includes('fallbackJsonStr'));
+  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=59-audio'));
+  assert(read('public/sw.js').includes('pcm-capture-worklet.js?v=53-audio'));
+  recordResult('ADIM-5.V59','8/16/44.1/48k DSP; FIR rejection; DC/limiter/partition; PLC/jitter/catchup; mic mute/retry; gain ramps; bounded CGNAT buckets',true);
+  console.log('V59 DSP METRICS '+JSON.stringify({rates:dsp,fixture200HzMaxStep:+maxStep.toFixed(6),concealedSamples:p.stats.concealed}));
+  console.log('V59 UNIT PASS: numerical model checks; no physical headset or lock-screen guarantee');
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -2133,6 +2326,7 @@
     await runStep5V56HandoffChecks();
     await runStep5V57RoutingChecks();
     await runStep5V58InputChecks();
+    await runStep5V59AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=57"></script>
+  <script src="/vercel-ws-shim.js?v=59"></script>
   <style>
     body {
       background: #e9e2d5;
diff --git a/public/dinle.html b/public/dinle.html
--- a/public/dinle.html
+++ b/public/dinle.html
@@ -16,7 +16,7 @@
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/dinle" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=57"></script>
+  <script src="/vercel-ws-shim.js?v=59"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1606,7 +1606,7 @@
       const token = ++rxLoadToken;
       rxPlayerWorkletLoading = true;
       ctx.audioWorklet
-        .addModule('/pcm-player-worklet.js?v=53-audio')
+        .addModule('/pcm-player-worklet.js?v=59-audio')
         .then(() => {
           if (token !== rxLoadToken || audioCtx !== ctx || rxPlayerWorkletNode) return;
           const node = new AudioWorkletNode(ctx, 'rys-pcm-player', {
@@ -1876,7 +1876,7 @@
         if (typeof audioCtx.createWaveShaper === 'function') {
           softClipper = audioCtx.createWaveShaper();
           softClipper.curve = createTransparentSoftClipperCurve();
-          softClipper.oversample = 'none';
+          softClipper.oversample = '4x';
         }
 
         rxHighPass.connect(rxClarity);
@@ -1963,7 +1963,7 @@
     function updateVolume(val) {
       volumeMultiplier = Number(val) / 100;
       document.getElementById('volumeLabel').textContent = `%${val}`;
-      if (gainNode) gainNode.gain.value = volumeMultiplier;
+      if (gainNode) gainNode.gain.setTargetAtTime(volumeMultiplier, audioCtx.currentTime, 0.010);
     }
 
     let nextAudioTime = 0;
@@ -2555,7 +2555,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=57').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=59').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=57"></script>
+  <script src="/vercel-ws-shim.js?v=59"></script>
   <style>
     .hero {
       padding: 64px 0 76px;
diff --git a/public/login.html b/public/login.html
--- a/public/login.html
+++ b/public/login.html
@@ -10,7 +10,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/login" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=57"></script>
+  <script src="/vercel-ws-shim.js?v=59"></script>
   <style>
     .login-shell {
       max-width: 460px;
diff --git a/public/panel.html b/public/panel.html
--- a/public/panel.html
+++ b/public/panel.html
@@ -29,7 +29,7 @@
       window.location.href = '/login?next=/panel';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=57"></script>
+  <script src="/vercel-ws-shim.js?v=59"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
diff --git a/public/pcm-player-worklet.js b/public/pcm-player-worklet.js
--- a/public/pcm-player-worklet.js
+++ b/public/pcm-player-worklet.js
@@ -85,7 +85,7 @@
     this.jitter = 0;
     this.lastArrival = null;
     this.lastSeq = null;
-    this.stats = { late: 0, duplicate: 0, concealed: 0, resync: 0, queueDropped:0 };
+    this.stats = { late: 0, duplicate: 0, concealed: 0, resync: 0, queueDropped:0, catchupDropped:0 };
     this.phraseSeen = new Set();
     this.tail = new Float32Array(Math.max(2, Math.round(this.rate * 0.005)));
     this.blend = new Float32Array(this.tail.length);
@@ -105,7 +105,7 @@
     this.plc = new RysPitchPlc();
     this.plcFrame = new Float32Array(480);
     this.recoveryFrame=new Float32Array(480);this.continuation=new Float32Array(480);
-    this.pendingQueueBlend=false;
+    this.pendingQueueBlend=false;this.catchupAge=0;this.catchupArmed=false;
     this.q = new Map();
     this.expected = null;
     this.playing = false;
@@ -177,6 +177,17 @@
   }
 
   _nextFrame() {
+    if(this.catchupArmed){
+      this.catchupArmed=false;
+      const keep=Math.ceil(this.target/.020)+2;
+      const keys=Array.from(this.q.keys()).sort((a,b)=>rysDiff(a,this.expected)-rysDiff(b,this.expected));
+      const remove=Math.max(0,keys.length-keep);
+      if(remove){
+        for(let i=0;i<remove;i++)this.q.delete(keys[i]);
+        this.expected=keys[remove];this.stats.catchupDropped+=remove;
+        this.pendingQueueBlend=this.haveHistory;
+      }
+    }
     const packet=this.q.get(this.expected);this.q.delete(this.expected);
     this.expected=(this.expected+1)%RYS_MOD;this.fi=0;
     if(packet){
@@ -241,6 +252,11 @@
         return true;
       }
     }
+    // Ppm drift correction cannot drain a sustained network backlog promptly.
+    if(this.q.size*.020>this.target+.120){
+      this.catchupAge+=n/this.rate;
+      if(this.catchupAge>=.500){this.catchupArmed=true;this.catchupAge=0;}
+    }else this.catchupAge=0;
     const queued = this.q.size * 480 + (480 - this.fi);
     const error = queued / 24000 - this.target;
     const wanted = 1 + Math.max(-0.001, Math.min(0.001, error * 0.01));
@@ -290,7 +306,7 @@
       this.wait = 0;
       this.primed = false;
       this.fi = 480;
-      this.haveHistory = false;this.missing=0;this.pendingQueueBlend=false;this.plc=new RysPitchPlc();
+      this.haveHistory = false;this.missing=0;this.pendingQueueBlend=false;this.catchupAge=0;this.catchupArmed=false;this.plc=new RysPitchPlc();
       this.resetFrom = this.lastOut;
       this.resetFade = 0;
     }
diff --git a/public/rehber.html b/public/rehber.html
--- a/public/rehber.html
+++ b/public/rehber.html
@@ -28,7 +28,7 @@
       window.location.href = '/login?next=/rehber';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=57"></script>
+  <script src="/vercel-ws-shim.js?v=59"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
     .console-wrap {
@@ -1261,7 +1261,7 @@
       const lbl = document.getElementById('guideMicGainLabel');
       if (lbl) lbl.textContent = `%${val}`;
       if (guideMicGainNode) {
-        guideMicGainNode.gain.value = guideMicGainMultiplier;
+        guideMicGainNode.gain.setTargetAtTime(guideMicGainMultiplier, audioCtx.currentTime, 0.010);
       }
     }
 
@@ -1493,6 +1493,7 @@
     let guideAudioSeq = Math.floor((Date.now() % 10000000) / 10);
     let lastGuideBgWsReconnectAt = 0;
     let isHealingGuideMic = false;
+    let guideTrackMutedAt = 0, guideLastMicRebuildAt = 0, guideDeviceChangeTimer = null;
     let guideSourceNode = null;
     let guideHighPassNode = null;
     let guideMudCutNode = null;
@@ -1635,9 +1636,8 @@
         await audioCtx.resume();
       }
 
-      // ÖNEMLİ: Donanım Akustik Yankı İptali (echoCancellation: true) telefonun yönlü (beamforming) mikrofonunu
-      // aktif eder ve hoparlörden dönen yankıyı donanımda siler; noiseSuppression ve autoGainControl ise
-      // tiz harfleri boğuklaştırmaması ve Kâbe kalabalık sesini yükseltmemesi için %100 KAPALI (false) tutulur!
+      // AEC is a browser/device request; it does not guarantee beamforming or remote-speaker cancellation.
+      // Disable AGC/NS by preference; inspect track.getSettings() on each real headset.
       try {
         micStream = await navigator.mediaDevices.getUserMedia({
           audio: {
@@ -1655,7 +1655,10 @@
 
       // Gelen telefon araması veya Bluetooth/yaka mikrofonu çıkması durumunda otomatik mikrofon kurtarma (Auto-Heal)
       const audioTrack = micStream && micStream.getAudioTracks ? micStream.getAudioTracks()[0] : null;
+      guideTrackMutedAt = audioTrack?.muted ? Date.now() : 0;
       if (audioTrack) {
+        audioTrack.onmute = () => { if (micStream?.getAudioTracks()[0] === audioTrack) guideTrackMutedAt = Date.now(); };
+        audioTrack.onunmute = () => { if (micStream?.getAudioTracks()[0] === audioTrack) guideTrackMutedAt = 0; };
         audioTrack.onended = () => {
           if (isMicBroadcasting && !isHealingGuideMic) {
             console.warn('🔄 [Rehber Mikrofon] Mikrofon izi kesildi (arama/kulaklık değişimi), 300ms içinde otomatik kurtarılıyor...');
@@ -1765,8 +1768,11 @@
       if (!isMicBroadcasting || isVoiceLoopbackTesting || isHealingGuideMic) return;
       const track = micStream && micStream.getAudioTracks ? micStream.getAudioTracks()[0] : null;
       const trackDead = !track || track.readyState === 'ended';
+      const trackMuted = !!track?.muted && guideTrackMutedAt > 0 && Date.now() - guideTrackMutedAt > 2000;
       const captureStalled = lastGuideMicChunkAt > 0 && (Date.now() - lastGuideMicChunkAt > 2000);
-      if (forceRebuild || trackDead || captureStalled) {
+      if (forceRebuild || trackDead || trackMuted || captureStalled) {
+        if (Date.now() - guideLastMicRebuildAt < 3000) return;
+        guideLastMicRebuildAt = Date.now();
         isHealingGuideMic = true;
         try {
           disconnectGuideAudioNodes();
@@ -1775,7 +1781,7 @@
             micStream = null;
           }
           // Alarm veya telefon araması sonrası AudioContext kilitlendiyse sıfırdan temiz AudioContext aç:
-          if ((trackDead || captureStalled) && audioCtx) {
+          if ((trackDead || trackMuted || captureStalled) && audioCtx) {
             const oldCtx = audioCtx;
             audioCtx = null;
             workletModuleLoaded = false;
@@ -1809,7 +1815,8 @@
     if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
       navigator.mediaDevices.addEventListener('devicechange', () => {
         if (isMicBroadcasting) {
-          setTimeout(() => healGuideMicrophoneIfNeeded(), 350);
+          clearTimeout(guideDeviceChangeTimer);
+          guideDeviceChangeTimer = setTimeout(() => healGuideMicrophoneIfNeeded(true), 350);
         }
       });
     }
diff --git a/public/rota.html b/public/rota.html
--- a/public/rota.html
+++ b/public/rota.html
@@ -9,7 +9,7 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=57"></script>
+  <script src="/vercel-ws-shim.js?v=59"></script>
   <style>
     .rota-hero-strip {
       background:
diff --git a/public/sw.js b/public/sw.js
--- a/public/sw.js
+++ b/public/sw.js
@@ -1,17 +1,17 @@
 // PATCH: sw-v53
 // PATCH: sw-v53
 // PATCH: sw-v53
-const CACHE_NAME = 'ridvanses-pwa-v57';
+const CACHE_NAME = 'ridvanses-pwa-v59';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=57',
+  '/vercel-ws-shim.js?v=59',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=53-audio',
-  '/pcm-player-worklet.js?v=53-audio',
+  '/pcm-player-worklet.js?v=59-audio',
   '/manifest.json',
   '/icons/icon-512.png',
   '/icons/icon-192.png',
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=57"></script>
+  <script src="/vercel-ws-shim.js?v=59"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```

## 9. Son ölçümler, doğrulama ve nihai değerlendirme

**Son aday koşusu:36/36 PASS, exit0.** Kaynakları değiştirmeden rapordaki unified diff bellekte yeniden kuruldu; Node module loader ve fs okuma katmanı adayları kullandı. JS/HTML syntax ve gerçek localhost HTTP/WS kontrolleri bu aday üzerinde çalıştı. node --check alt süreçleri de aday içerikle stdin üzerinden çalıştırıldı. Testlerin raporu okuması harness'te özellikle engellendi: önerilen testler uygulanmış kaynak dosyalarını okur, rapordan kendini doğrulamaz.

Diskteki34/34 ile bellekteki36/36 birbirinden ayrıdır: disk hâlâ v58'dir. V53–V58 testleri korunarak V59 E2E+unit eklendi. V56 eski-relay409/atomic handoff, V57 rota ayrımı ve V58 metadata sınırları da geçti.

### 9.1 Ortak IP ve1→300 fan-out

| Ölçüm | v58 / son v59 aday sonucu |
|---|---|
| Aynı IP,300 doğru HTTP katılımı | v58:60×200 +240×429; v59:300×200 |
| Yanlış PIN | İlk60×403,61'inci429; ardından doğru PIN200 |
| Gerçek WS | 301 bağlantı;1 rehber+300 dinleyici |
| Sağlıklı alıcılar | 270×120 =32,400 çerçeve, sıra ve tüm972 bayt birebir doğru |
| Yavaş alıcılar | 30 gerçek duraklatılan soket + kontrollü20,000B kuyruk;30×50=1500 drop;27'si tekrar normal akışa döndü;3'ü65,537B hard izolasyona alındı |
| Bozuk çerçeve / beklenmeyen soket hatası | 0 /0 (kasıtlı drop ve terminate ayrı sayılır) |
| Yerel gönderim→Node alıcı callback P50/P95/P99 | 14.48 /27.79 /38.75ms |
| En büyük aktarım gecikmesi | 45.27ms |
| Event-loop P99 | 30.59ms |
|120 çerçevenin119 aralığı | 2393.4ms; ortalama20.11ms,≈49.72 paket/s |
| Ölçülen yayın fazı | 2437.5ms |
| CPU | 1969ms user+system; sunucu ve301 test istemcisinin aynı Node sürecindeki toplamı |

Bu3–4 saniyelik yayın fazı olan kısa regresyon testidir; uzun süreli soak/saha kapasite sertifikası değildir. CPU değeri yalnız sunucu maliyeti değildir. Gecikme capture→DAC veya internet gecikmesi değildir; aynı makinede gönderim timestamp'inden ws message callback'ine ölçülmüştür.30 yavaş peer testinin deterministik bufferedAmount enjeksiyonu, doğal TCP tıkanmasının gözlendiği iddiasını taşımaz. İlk geliştirme koşusunda göreli20ms bekleme timer maliyetini biriktiriyordu; rapordaki son test mutlak20ms hedefi ve ölçülmüş pacing sınırı kullanır.

### 9.2 DSP sayısal kanıtı

| Capture giriş hızı |2 saniyede paket | Kararlı DC | Seçilmiş stop/pass RMS oranı |
|---|---:|---:|---:|
|8000Hz |100×480 |1.82e-10 |-95.9dB (3920Hz/1000Hz) |
|16000Hz |100×480 |-1.30e-10 |-95.9dB (7840Hz/1000Hz) |
|44100Hz |100×480 |-1.44e-10 |-129.7dB (14000Hz/1000Hz) |
|48000Hz |100×480 |8.83e-11 |-107.3dB (14000Hz/1000Hz) |

128 ve2048 örneklik parçalamalar tüm çıkış örneklerinde birebir eşit; impulse kuyruğu sonlu; ±6 tepe +0.3DC girişinde çıkış sonlu ve≤0.980001. Bunlar dijital model sinyalleridir; fiziksel ADC, Bluetooth codec ve bütün EQ/akustik zincirin ölçümü değildir. Seçilmiş stop frekansları tüm frekans/faz/örnek oranları için minimum stopband garantisi oluşturmaz; kaynak başlığındaki “>-118dB stopband” genel iddiası bu tabloya göre evrensel değildir.

Jitter/reorder/duplicate ve ardışık iki eksik20ms paketli200Hz/.25 genlik fixture'ında max|y[n]-y[n-1]|=**0.007356**; PLC960 kaynak örneği üretti. Bütün output sonlu/limit içinde. Bu gerçek konuşmanın duyumsal kalite metriği veya sıfır cızırtı sertifikası değildir. Zayıf ünsüz modeli hangover'ı sınar; gerçek kelime doğruluğu sınamaz.

Düşük çıkış hızı yeni bulgusu ayrıca tekrar üretildi:

| Gerçek player çıkışı / PCM tonu | v58 filtre yokken stop/pass | v59 kaynak FIR + gerçek player render |
|---|---:|---:|
|8kHz /6kHz | -0.48dB; belirgin2kHz alias | -114.0dB |
|16kHz /10kHz | -2.54dB; belirgin6kHz alias | -127.1dB |

İki tarafta referans200Hz/.25 genlikli giriş; başlangıç500ms hariç RMS ölçülür. Bu seçilmiş ton reddidir; tüm Nyquist geçiş bandı taraması değildir. FIR yalnız AudioContext<24kHz'de çalışır ve4ms gecikme/ek DSP maliyeti getirir. Gerçek Bluetooth HFP'nin OS tarafından48kHz bağlama yeniden örneklenmesi durumunda bu yeni FIR çalışmaz; OS dönüştürmesinin kalitesi cihazda ölçülür. Hermite'in yüksek frekans genlik hatası/imaging'i de ideal sinc eşdeğeri değildir; tarayıcı çıkışında geniş bant sweep ve dinleme testi sürmelidir.

### 9.3 Dosya bütünlüğü ve karar

v59 diff **12 dosyayı** kapsar: server.js, scripts/verify-system.js, player worklet, sw ve sekiz HTML sayfası. Capture worklet ve shim kaynak algoritması değişmez. git apply --check - ve git apply --check --ignore-space-change - başarılıdır; başlangıç15 kaynak SHA-256 kaydı aşağıdadır. Son kontrol bu15 kaynağın aynı kaldığını doğrular. Aşağıdaki boş-context satırlarının tek boşluk prefix'i unified diff formatının parçasıdır.

**Karar:** v59 kod düzeyinde incelemeye ve staging uygulamasına hazırdır. Ortak-IP engeli ve düşük çıkış alias kusuru yeniden üretilip adayda giderildi; yavaş peer izolasyonu ve PCM bayt bütünlüğü yerelde doğrulandı. Üretimde300 HTTP fallback kapasitesi, gerçek radyo ağı, public MQTT ACL/SLA, fiziksel kalabalık izolasyonu/çapraz cihaz echo ve iOS/Android ekran kilidi sürekliliği onaylanmış değildir. Bu sınırlar saha kabulünde kapanmadan “Kâbe'de300 kişi, sıfır kopma/sıfır cızırtı” yayına çıkış garantisi verilemez.

<!-- SOURCE-HASHES {"server.js":"6302dcb2fc1fe03f3a42bff17f267c0911ba2d2b361e0e9524ac91c8c6148849","scripts/verify-system.js":"086f6f805f3696e5a51117037a3de6b3d6b0ed43f413e93326f414c03b9246bf","public/ani-kitabi.html":"49c5f6af3dfcf33cad2befbbafdeb448a44a37b3877c13d0502ac6507fdce963","public/dinle.html":"f18d8e4626d4fb3430145a166d6475f56c326fb88b19d712fd2847b36af146b2","public/index.html":"572baa2c640b3f11c37e0461e701cacc50a9a6ed8482122f1574487467a560f2","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"8eba7f37d518b0f4748611240e8b938a160b6f0d0fd6118d8aecaa0a424f35f3","public/panel.html":"758bac58b933eec6126ab765ca32b974a33be92d572e241eb54789cef8aa46aa","public/pcm-capture-worklet.js":"e6f7c223b92928825481589f626e53b64ff70c17710f668000440c68d559e564","public/pcm-player-worklet.js":"9bfbcb06d2904d375ff06498e232cc09a32c5c9624b36bb8947bbc5270323183","public/rehber.html":"5ddd9e2f2549f1584c1c28964b4c45411b7c177da5253df1d70a29d9384d79ec","public/rota.html":"9fb74d5cd19981ab37ff283780a71166d14cc8355502e160173137dddba95467","public/sw.js":"2d70f5c3bb559a68f5c6dfc4a4d405b39ae088c29d5f2a3e16e1ccb95cbaab05","public/vercel-ws-shim.js":"33831bb515dcec2932c2060f67882cc2a1e720c14f1726dde8ff2b410a962d6f","public/yaka-karti.html":"8c2b69c27249b31a716660f001c9624377d9ad8c40c8f6b5657cf8f8e2b8b260"} -->
