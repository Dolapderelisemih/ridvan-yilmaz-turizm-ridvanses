# RıdvanSes v66 — v65 Uygulama, DSP ve MQTT Callback Sahipliği Denetimi

Denetim: **10 Kasım 2026**, çalışma kökü **D:/umresesliyazılım**. İncelenen disk HEAD: **d9f6d5a6ddc1e2d159bd01a6d4e9282fb7092207**. Bu denetimin kalıcı düzenlemesi yalnız bu rapordur; aşağıdaki v66 yaması kaynaklara uygulanmadı, stage/commit/push/deploy yapılmadı.

**Karar:** v65'in 12 hedef dosyası rapordaki yamayla eşleşiyor; ters uygulama kontrolü **exit 0**, disk paketi **48/48 PASS**. Bir yeni **P2-66-01** doğrulandı: kapanmış/eski MQTT oturumunun gecikmiş script, broker ve snapshot callback'leri taşıma/oda sahipliğini aşabiliyor. Bu nedenle **“SIFIR HATA — v65 %100 ONAYLI (PRODUCTION-READY)” onayı verilmiyor**. Hazırlanan tek v66 yaması gerçek CLI provasında **50/50 PASS, exit 0** verdi. Bu sayı bütün olası hataların yokluğunun veya fiziksel sahada sıfır kopmanın kanıtı değildir.

## 1. v65 uygulama eşliği ve disk testleri

| Kontrol | Sonuç |
| --- | --- |
| HEAD | d9f6d5a6ddc1e2d159bd01a6d4e9282fb7092207 |
| Başlangıç raporundan çıkarılan v65 diff | 41.219 UTF-8 bayt; SHA-256 e5a94e8054b8b83b4125547c94e64f23929b9dbb8e0a5acb07f84d39baf9222c |
| git apply --reverse --check --ignore-space-change - | Başlangıçta ve son kontrolde **exit 0**, stderr boş |
| node scripts/verify-system.js | Değiştirilmemiş v65 üzerinde **48 / 48 [BAŞARILI / PASS]**, V53..V65 E2E/Unit dahil |
| HEAD kapsamı | 12 kaynak + rapor = 13 dosya; git show --stat: 612 ekleme / 689 silme |
| Başlangıç status | Yalnız AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md silinmiş |
| Capture/player | Kaynakları ve URL sürümleri korunuyor; v66 DSP çekirdeklerini değiştirmiyor |

### 1.1 İstenen 12 dosyanın gereksinim denetimi

Satırlar diskteki d9f6d5a içindir; aşağıdaki diff uygulandıktan sonraki satırlar değildir.

| Dosya / gereksinim | Gerçek konum ve kanıt |
| --- | --- |
| server.js / modern medya kabulü | 472–480: epoch taşıyan JSON için aynı kaynak, bilinen kontrol, canlı oda ve güvenli tamsayı oda epoch'u zorunlu; bilinen modern epoch'a etiketsiz downgrade reddediliyor. V65 kontrol öncesi fan-out 0. |
| server.js / relay çözümü | 1483–1502: opaque key ve 35 s sınırı denetleniyor; resolver mevcut lease'i yenilemiyor. 1415–1456 yardımcı fonksiyonun yeni oturum oluşturma zamanı ile başarılı istek yenilemesi ayrı değerlendirildi. Mevcut legacy kaydı resolver map'ten alıyor. |
| server.js / auth kaybı | 1693–1701: relayKey sahibi mevcut guide/admin emekliye ayrılıyor; oda üyeliği 0 grace ile kaldırılıyor, privileged bağlar/outbox temizleniyor. Anahtarsız public ID anonim disconnect yetkisi kazanmıyor. |
| server.js / başarılı lease | 1703–1726: auth ve context senkronizasyonu kabulünden sonra 1718'de lastSeen güncelleniyor. V65 fake-clock başarısız lease uzatımı 0; 35000/35001 ms sınırı önceki testlerde korunuyor. |
| public/vercel-ws-shim.js / reset | 307–317: yeni relay capability'de requestSeq ve _relayGuideStateAckEpoch sıfırlanıyor. |
| public/vercel-ws-shim.js / retry ve dolu kuyruk | 1014–1042: en son guide-stream-state tekilleştirilip fresh.unshift ile PCM önüne konuyor; gönderilen epoch yalnız başarılı ve aynı rota cevabında onaylanıyor. V65 retry sırası [guide-stream-state,audio-chunk]; ilk PCM52 ulaştı. 64 kontrol doluyken stop dahil 65 kayıt gönderildi. |
| public/dinle.html / controller kurulumu | 1189–1209: epoch'lu kontrol kaynak kimliği ve geçerli sıralama gerektiriyor; audioStateKnown=false reddediliyor. |
| public/dinle.html / JSON kabulü | 1211–1228: epoch'lu JSON için kurulmuş rxAudioMediaEpoch, aktif yayın ve eşleşen kaynak zorunlu. Eksik/farklı kaynak medya kuyruğuna girmiyor. |
| public/dinle.html / snapshot | 1295–1306: modern joined/room-state yalnız audioStateKnown=true olduğunda controller kuruyor; bilinmeyen özetin legacy canlı kabulü ancak audioMediaEpoch yoksa açık. |
| scripts/verify-system.js | E2E çağrısı 587; runStep5V65AudioChecks 3413–3494, runV65ReadinessChecks 3496–3577; main Unit çağrısı 3597. İkisi de gerçek disk koşusunda PASS. |
| public/sw.js | 4: ridvanses-pwa-v65; 11: shim?v=65. Capture60-audio / player61-audio korunmuş. |
| public/ani-kitabi.html | 10: shim?v=65. |
| public/dinle.html | 19: shim?v=65; 2656: sw.js?v=65. |
| public/index.html | 85: shim?v=65. |
| public/login.html | 13: shim?v=65. |
| public/panel.html | 32: shim?v=65. |
| public/rehber.html | 31: shim?v=65. |
| public/rota.html | 12: shim?v=65. |
| public/yaka-karti.html | 11: shim?v=65. |

Disk V65 E2E: ana ve alt oda PCM sıraları **[40,51,52,53,54]**, bayt eşliği true; kontrol öncesi receiver/server kabulü 0; auth kaybında guidePresent=false / isLive=false; eski capability409; family aboneliği korunmuş. Unit altı kontrol grubu, başarısız lease uzatımı0. Ters kontrol ile birlikte bunlar v65 uygulama eşliğini destekliyor; yeni MQTT yarışı önceki test matrisinde yoktu.

## 2. Yeni bulgu: P2-66-01 — Eski MQTT callback'leri oda/taşıma ömrünü aşabiliyor

**Konumlar:** [loader:9](D:/umresesliyazılım/public/vercel-ws-shim.js:9), [_closeMqttClients:401](D:/umresesliyazılım/public/vercel-ws-shim.js:401), [_initMqttBus:408](D:/umresesliyazılım/public/vercel-ws-shim.js:408), connect436, subscribe ACK445, message466; [snapshot timer:606](D:/umresesliyazılım/public/vercel-ws-shim.js:606). Native takeover389 ve explicit close1070 brokerları sonlandırıyor, fakat bu sonlandırma callback'lerin geçerliliğini denetlemiyor.

### 2.1 Kök neden ve tetikleme

MQTT betiği ilk relay kullanımı sırasında asenkron yükleniyor. _initMqttBus, eski brokerları yükleme callback'inin **içinde** kapatıyor. Callback script'in daha sonra gelmesine kadar bekliyor; o arada oda/rol değişebilir, native handoff tamamlanabilir veya soket açıkça kapatılabilir. Callback'te readyState, relay modu, kapanış veya generation kontrolü bulunmuyor. Geç yükleme kapanmış sokette iki yeni reconnect eden broker istemcisi açabiliyor.

Mevcut client.end(true) çağrısının ardından eldeki callback referansları da geçerlilik kontrolü yapmıyor. Eski connect/subscription ACK callback'i yeni rotaya hello/ping basabilir; eski message callback'i imzası/yaşı geçerli mesajı _handleCloudBusMessage üzerinden aynı SmartWebSocket'in güncel onmessage'ına taşıyabilir. Rota değişiminden sonraki farklı kaynaklı stop, receiver'ın kabul ettiği kaynağı değiştirip güncel player kuyruğunu sıfırlar. Aynı source/epoch için sıralama koruması farklı kaynağa ait bu eski taşıma callback'ini ayırt etmez.

180 ms _broadcastP2PRoomState timer'ı kapanışta iptal edilmiyor ve yalnız guide rolünü kontrol ediyor. Kapanmış/native olmuş eski relay yerel room-state üretebiliyor. Yalnız callback'in içini filtrelemek yerine timer da kapatılmalı; iptal edilmiş eski callback yeni timer'ın handle'ını silememeli.

Bu bulgu, public broker yetkilendirmesinin genel tasarımından bağımsız bir **yerel callback sahipliği kusurudur**. Normal oda değişimi ve taşıma failback'i yeterlidir; saldırgan veya bozuk PCM gerektirmez.

### 2.2 Değişmemiş v65 üzerinde kanıt

1. Diskteki gerçek _initMqttBus / _closeMqttClients fonksiyonlarıyla ertelenmiş script yükleme probu: init → explicit close → loader callback. **Kapanıştan sonra 2 connect, 2 canlı MQTT client**, topic OLD/GENEL. close bu bağlantıların yaratılmasından önce çalışmıştı.
2. Yeni E2E testi, aday verifier + değiştirilmemiş v65 shim ile gerçek localhost HTTP/WS sunucusunda çalıştırıldı. Önce genel HTTP dinleme, sonra gerçek siyer aboneliği ve güncel PCM102 kuruldu. Eski genel broker callback'leri serbest bırakıldı:
   **staleDelivered=2, source=v66-old-route, live=false, queue=[]**.
   Paket zaman damgası ve mevcut imza kontrolü geçerliydi. Yeni test **“Ended broker must not deliver into the replacement route”** koşulunda FAIL / **exit1**, 11 !== 9 verdi.
3. Bu negatif koşu gerçek server/HTTP rota değişimini kullanır. CDN ve broker callback sırası deterministik fixture ile enjekte edilir; public broker altyapısında ölçülmüş bir gecikme dağılımı olarak sunulmaz.

### 2.3 v66 çözümü

_closeMqttClients, **end çağrılarından önce** _mqttGeneration artırır, snapshot timer'ını iptal eder ve topic'i temizler. Böylece senkron end sırasında tetiklenen callback bile eski sahibini kaybetmiştir.

_initMqttBus eski ömrü **senkron olarak** bitirir; oluşan generation'ı yakalar. Loader, connect, subscribe ACK ve message callback'leri yalnız aynı generation, açık readyState, relay modu ve explicit-close=false koşullarında iş yapar. Eski loader yeni rotanın brokerlarını kapatamaz; eski mesaj dedup Set'ini bile kirletemez. Geçerli yeni brokerın mesajları ve mevcut HTTP/MQTT seq tekilleştirmesi korunur.

Snapshot timer'ı da generation ve yaşam durumunu denetler. Eski generation reddi handle sıfırlamasından önce yapılır; iptal edilmiş eski callback yeni timer'ı bozamaz.

Yeni ağ/protokol alanı, ses kopyası veya per-paket timer eklenmiyor. Bir yerel generation sayacı kullanılıyor. Native/HTTP requestSeq, audioStateSeq, audioMediaEpoch, relay key, digest/revision, 35 s lease ve PCM wire formatı değişmiyor. Server veya DSP çekirdeği için bu bulguya bağlı değişiklik gerekmiyor.

## 3. Uçtan uca ses zinciri denetimi

| Katman / dosya | İncelenen davranış ve sonuç |
| --- | --- |
| Rehber yakalama / rehber.html:1571–1767 | 180 ms eski capture sınırı; ws backpressure19200 B; izin/module/fallback import sahipliği, track/processor error, devicechange/heal, stop/restart/preview. V60'ın17 yaşam döngüsü grubu PASS. getUserMedia1677: echoCancellation=true, noiseSuppression=false, autoGainControl=false, mono48 kHz istek; fallback audio=true. Cihazın gerçek seçimi garanti edilmiyor. |
| Rehber EQ | 1681–1687: 85 Hz HP, 210 Hz -2.5 dB mud cut, 3200 Hz +2 dB presence, 10500 Hz LP, manuel gain. Capture çıkışında limiter ve DC/rumble süzme mevcut. |
| Capture / pcm-capture-worklet.js:10–50 | 193 tap ×256 faz polyphase FIR; gerçek giriş sampleRate'iyle kesintisiz faz. 480 örnek /20 ms PCM24 kHz frame. Eski3072 tampon kullanılmıyor. 8/16/24/44.1/48 kHz süreklilik ve frame sayısı testleri geçiyor. |
| Expander / capture:53–150 | 4 bant enerji/minima,400 ms kalibrasyon,4 s rolling minima;10 ms lookahead;7.5 dB açma ve4 dB hysteresis,240 ms hold,3 ms attack/120 ms release. Kapalı gain0.126≈-18 dB; yüzde100 susturma/konuşmacı ayrıştırma değil. continuousSpeech düşük hece kesilmesini azaltırken gürültü bastırmayı gevşetir. |
| Comfort / capture:152–220 | 72 örnek3 ms gecikme;600 ms quiet sonrası80 ms azalma,2 ms yükseliş; mute yumuşatma. Her frame transfer sonrası yeni Float32Array sahipliği; stop kontrolüyle processor false dönebiliyor. |
| Coalescer / shim:95–140 | Bağımsız480 örnek frame'lerden1–3'lü birleştirme;40 ms timer/120 ms yaş sınırı; semantic stop/demo clear; capture epoch'u girişte etiketleniyor. Gecikmiş eski batch yeni epoch'a yanlış taşınmıyor: V64 PASS. |
| Taşıma / shim:287–389,926–1052 | Tek uçuş HTTP100 ms,3 s abort; kuyruk4 audio batch/200 ms+64 kontrol; eski rota response/retry çiti, iki aşamalı native ACK, kaynak capability emekliliği. V65 kontrol retry/dolu kuyruk koruması PASS; yeni MQTT callback çiti v66'dadır. |
| Server / server.js:435–494,908–923,1057+ | Native ve JSON fan-out; activePublisher sahipliği; modern source/controller/live/epoch kabulü; kontrol seq monotonluğu; source değişiminde state reset. Native binary972 B biçimi değişmez. |
| HTTP/handoff / server.js:1415–1768 | 48 hex capability key; requestSeq sırası; subscription digest/revision; metadata korunumu; prepare3 s; no-await atomik commit; retired/expired409; başarı sonrası lease;35 s stale cleanup. V53..V65 regresyonları PASS. |
| Genel→alt oda / server.js:358–368,688–744 | Dedicated guide olmayan alt odalara durum ve source/seq/epoch mirası; son guide ayrılışında terminal stop tie-break. V61..V65 gerçek oda/handoff testleri PASS. |
| Alıcı / dinle.html:1180–1406 | Soket ve Blob teslim sahipliği, source/state/epoch/ended sırası; modern controller kurulmadan JSON yok; explicit stop/mod değişimi reset. V65 unprimed0, V64 postResumeOldFrames0. |
| Port/kurtarma / dinle.html:1658–1897 | Main queue en çok13 frame/260 ms; rxLoadToken/context/processor sahipliği; FIFO reset, suspended giriş düşürme, resume/rebuild ve probe kontrolleri. Eski callback'lerin yeni motora sahip olmasını önleyen mevcut testler PASS. |
| Player / pcm-player-worklet.js:12–27,124–187,190–338 | 8/16 kHz çıkışta193 tap FIR, ardından sürekli Hermite;24/44.1/48 kHz'de downsampling FIR gerekmiyor. Seq wrap ve duplicate/late reddi;±1000 ppm ASRC; sınırlı q, recovery/catch-up yumuşatması. Yeni DSP kusuru bu testlerde doğrulanmadı. |
| Jitter/PLC / player:30–96,190–338 | Başlangıç120 ms; uyarlanmış80–260 ms; en az1 frame varsa300 ms başlangıç timeout;60 ms pitch PLC ve sönüm;300 ms starvation rebuffer. >32 frame'de24'e trim; hedef+120 ms üzerinde500 ms backlog'da catch-up;3 ms recovery blend ve5 ms rampalar. Kayıp konuşmayı geri kurma veya sıfır gecikme garantisi yok. |
| PWA / sw.js:4–79 | API/WS/auth/rehber/panel network cache dışında; ses çekirdekleri60/61; HTML/shim/SW birlikte66'ya çıkacak. SW activation açık sekmedeki eski JavaScript'i otomatik yeniden yazmaz. |

### 3.1 Beş örnekleme hızında DSP kanıtı

V61 reset/starvation fixture ölçümleri her iki tam pakette tekrar geçti:

| Gerçek çıkış Hz | firstAfterReset | firstAfterStarvation | DC fixture iç maxStep |
| --- | --- | --- | --- |
|8000|0|0|0.130492|
|16000|0|0|0.145227|
|24000|0|0|0.002640|
|44100|0|0|0.001428|
|48000|0|0|0.001314|

Düşük hız FIR geçici rejiminin iç maxStep'i ilk örnek sıçramasıyla aynı ölçü değildir; tablo fiziksel cızırtının sıfır olduğu iddiasını taşımaz.

V60 player alias fixture'ları:

| Çıkış Hz | Giriş tonu Hz | Bastırma dB |
| --- | --- | --- |
|8000|4080|-76.56|
|8000|4800|-107.60|
|8000|6000|-114.02|
|16000|8160|-97.45|
|16000|9600|-115.88|
|16000|10000|-127.11|

Capture24 kHz girişte2 saniyede100 frame; diğer desteklenen oranlarda frame/partition/DC/SRC kontrolleri PASS. Capture FIR grup gecikmesi96/girişHızı olduğundan8/16/24/44.1/48 kHz için12/6/4/2.18/2 ms'dir.10 ms lookahead,3 ms comfort, frameleme0–20 ms, coalescer0–40 ms, jitter başlangıç120 ms, düşük çıkışta player FIR4 ms, donanım ve ağ bunun üzerine eklenir. Bu yüzden yerel ağ teslim ölçüsü ağızdan kulağa toplam gecikme olarak kullanılamaz.

Capture ham SHA-256 **30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a**; player **062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7**. Worklet kaynakları bu turda değiştirilmedi.

### 3.2 1→300 fan-out ve kapasite kanıtı

Değiştirilmemiş v65 gerçek localhost testi:300 aynı IP'den geçerli join200;301 gerçek WS;270 sağlam dinleyicide120'şer frame=**32.400 eksiksiz frame**,30 duraklatılmış/injected backpressure peer'de **1500 soft drop**,3 hard izolasyon, **0 bozuk PCM**.

| Ölçüm | Disk v65 | İlk tam v66 provası |
| --- | --- | --- |
|p50 /p95 /p99 teslim ms|10.61 /17.90 /43.87|10.70 /19.53 /27.73|
|max teslim ms|55.29|34.56|
|event loop p99 ms|25.05|24.44|
|CPU ms / geçen ms|1594 /2421.6|1484 /2416.3|

Bunlar aynı hosttaki2.4 saniyelik 50 pps testlerinin ölçümleridir; host yüküyle değişir. Yavaş peer kuyruk basıncı OS TCP penceresine bağımlı olmamak için deterministik enjekte edilir; sağlam alıcılar gerçek WS üzerinden bayt karşılaştırılır. 300 fiziksel telefon, tüm dinleyicilerin sürekli HTTP'de olması, gerçek4G/5G/roaming veya Jeddah VDS NIC/TLS kapasitesi ölçülmedi.

972×50×300=14.580.000 B/s=**116.64 Mbit/s** native ham egress; TLS/TCP/IP hariç. Base64 PCM tabanı1280×50×300=19.200.000 B/s=**153.6 Mbit/s**, JSON/başlıklar hariç.300 HTTP dinleyicide100 ms poll yaklaşık3000 istek/s'dir. Soft/hard backpressure sağlam dinleyicileri korumak için gecikmiş paket düşürür; sonsuz gecikmesiz sıfır-kayıp hedefiyle eşdeğer değildir. bufferedAmount yalnız gönderim için bekleyen veriyi bildirir; alıcıda çalınma ACK'i değildir. [WHATWG WebSocket bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount).

### 3.3 Üretim/saha kabulünde açık kalan mimari sınırlar

Public MQTT imzası istemcide bilinen sabit içerir; oda ACL'si veya güvenilir rehber yetkisi değildir. V66 **eski yerel MQTT ömrünü** dışlar; halen geçerli MQTT bağlantısından farklı kaynaklara ait çakışan/gecikmiş kontrol seçimi için global kaynak/oda otoritesi kurmaz. Aynı source/seq/epoch koruması farklı UUID'leri karşılaştıran sunucu onayı yerine geçmez. Bu eski mimari sınır kapatılmış sayılmıyor.

HTTP üyelik/oda/relay state'i process RAM'indedir. Çoklu serverless instance için ortak state/tek relay otoritesi gerekir; v66 dağıtık veri katmanı eklemiyor. Canlı deployment veya çoklu instance toparlaması bu turda sınanmadı.

Mono mikrofon, aynı zaman/frekans alanını paylaşan rehber ve1 m ötedeki yan konuşmacıyı yüzde100 ayıracak gözlemi sağlamaz. Yakın ağız mikrofonu akustik SNR'ı artırır. BroadcastChannel yalnız aynı tarayıcı origin'inin yerel bağlamlarını bağlar; başka telefondaki hoparlörün gecikmeli AEC referansı değildir. echoCancellation=true UA'nın uyguladığı bir istektir; çapraz cihaz50–400 ms echo kuyruğunu her koşulda iptal etme garantisi değildir. [W3C echoCancellation tanımı](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-echocancellation).

AudioContext askıya alındığında işleme callback'leri durur ve gerçek zamanlı capture verisi kaybolabilir; resume kayıp konuşmayı geri getirmez. Mevcut kurtarma, OS ses odağı/izin/gesture kısıtını aşamaz. [W3C suspend davranışı](https://www.w3.org/TR/webaudio/#dom-audiocontext-suspend). Receiver AudioWorklet kurulamazsa etkin eski scheduler fallback'i yoktur (dinle.html:1689–1690); UI/mobil destek matrisi sahada doğrulanmalıdır. Gerçek iOS/Android kilit, alarm/arama, WhatsApp geçişi, Bluetooth HFP/SCO yön değişimi ve uzun roaming testi yapılmadan kesintisizlik onayı verilemez.

Bu sınırlar yeni yamanın sağladığı regresyon başarısından ayrıdır. Bu turda P2-66-01 dışında yeni bir P0/P1/P3 somut ses kod kusuru doğrulanmadı; bu ifade bütün olasılıkların elendiği anlamına gelmez.

## 4. v66 testleri, prova yöntemi ve uygulama kapsamı

**ADIM-3.V66:** gerçek server, HTTP ve WS ile genel→siyer abonelik geçişi; güncel broker üzerinden PCM101; aynı paketin HTTP duplicate reddi; eski broker connect/suback/control/audio callback'lerinin reddi; gerçek prepare/commit native failback; retired capability409; native PCM103 ve örnek bazında PCM16 eşliği. Sonuç: HTTP[100,101,102], native103; staleBrokerDelivered0, staleSourceResets0; native sonrası MQTT client0; geç script sonrası client0. Public broker/CDN olayları fixture, ağ sunucusu ve HTTP/WS handoff gerçektir.

**ADIM-5.V66 altı grup:** kapanış sonrası geç CDN; birden fazla bekleyen rotada yalnız son loader; eski connect/suback/message ve dedup kirletme reddi + yeni client pozitif kontrol; native takeover; snapshot timer iptali/eski generation/yeni handle korunumu;100 art arda replacement ve senkron end callback'i. En fazla2 aktif MQTT client, kapanış sonrası0, stale teslim0. Sabit active-client sayısı tüm tarayıcı/library heap ömrünün formal ispatı değildir.

Eski V53..V65 beklentileri korunur; global cache kontrolü66'ya güncellenir. ADIM-4.1 fixture'ı MQTT'yi gerçek kullanımındaki gibi **açık relay** üzerinde başlatır. Test sonucu sayısını yapay yükselten ayrı recordResult eklenmez: yalnız iki yeni sonuçla48→50.

Rapordaki tek diff her hunk'ın eski bağlamı diskteki dosyayla karşılaştırılarak bellekte uygulanır. Geçici **CommonJS preload**, fs kaynak okumalarını ve module compile'ı bu bellek kopyasına yönlendirir; syntax check'ler de aday metin üzerinde yapılır. Gerçek komut **node --require <geçici-preload.cjs> scripts/verify-system.js**'dir; verifier main ve gerçek localhost sunucusu çalışır. Verifier'ın raporu kaynak olarak okuması engellenir. Dış finally data/runtime.json'ın koşu öncesi ham baytlarını geri yazar ve geçici preload'u siler. Uygulama/test kaynakları diskte hiç yamalanmaz.

| Prova | Sonuç |
| --- | --- |
| Disk v65, normal CLI |48/48 PASS|
| Yeni testler + değiştirilmemiş v65 shim |Beklenen yerde FAIL, exit1; stale teslim2, yanlış source/stop, boş player |
| Tam rapor v66 adayı |**50/50 PASS, exit0** |
| git apply --check - |**exit0** |
| git apply --check --ignore-space-change - |**exit0** |
| Başlangıç v65 diff ters kontrolü |**exit0** |
| Kalıcı kaynak değişikliği |Yok; yalnız rapor |

v66 **11 hedef dosyadır:** shim, verifier, SW ve shim kullanan8 HTML. Server, capture/player, örnekleme ve binary frame biçimi değişmez. **Shim/SW66, capture60-audio/player61-audio** birlikte korunmalıdır. Önce rapor diff'ini check edip uygulayın, sonra normal node scripts/verify-system.js ile50/50 doğrulayın; yayınlama bu denetimin kapsamı değildir.

Denetim sırasında başka çalışma ani-kitabi.html ve runtime üzerinde geçici değişiklik yaptı; bu denetim bunları geri almadı. Son kontrolde15 izlenen ses/taşıma/test/HTML kaynağının ham hash'i başlangıçla aynıydı ve runtime Git farkı yoktu. Başlangıçtan sonra oluşturulmuş **ziyaret-berati-36-misafir-baski.html** dosyası korunuyor; rapor+iki eski silinmiş rapor dışında bu harici untracked dosya status'ta kalabilir. Kullanıcıya ait AUDIT_FIX_SUMMARY.md / AUDIT_REPORT.md silinmeleri korunmuştur.

## 5. Doğrudan uygulanabilir tek v66 unified diff

Diff: **30.758 UTF-8 bayt**, SHA-256 **1f69c5b760cdf3c3fd163ec5687efee472526654d49b87bdfa4ed454320c896c**. Hedef taban d9f6d5a. ani-kitabi.html hunk'ı yalnız cache satırına odaklanmak için iki bağlam satırı kullanır. Diğer içeriklere değişiklik önermez. Aşağıdaki diff bu turda kaynaklara uygulanmamıştır.

```diff
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -585,6 +585,7 @@
   await runV63StateChecks({baseUrl,url:wsUrl,token:authToken});
   await runV64MediaChecks({baseUrl,url:wsUrl,token:authToken});
   await runV65ReadinessChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV66MqttOwnershipChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -712,6 +713,7 @@
 
   // MQTT alt oda kontrolü (SIYER vs GENEL)
   const mockWsInstance = new shimSandbox.window.WebSocket('wss://ridvanses.vercel.app/ws');
+  mockWsInstance._isRelay=true;mockWsInstance.readyState=1; // MQTT belongs to an open relay.
   mockWsInstance._initMqttBus({ tourCode: 'RY-KASIM', roomId: 'siyer', role: 'pilgrim' }, false);
   const siyerTopic = mockWsInstance._mqttTopic;
   mockWsInstance._initMqttBus({ tourCode: 'RY-KASIM', roomId: 'genel', role: 'pilgrim' }, false);
@@ -1536,9 +1538,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v65"));assert(sw.includes('/vercel-ws-shim.js?v=65'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v66"));assert(sw.includes('/vercel-ws-shim.js?v=66'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'65',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'66',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2503,7 +2505,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2713,7 +2715,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2952,7 +2954,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3137,7 +3139,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3324,7 +3326,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3488,7 +3490,7 @@
     const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
     checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
   recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
 }
@@ -3576,6 +3578,155 @@
   }
 }
 
+
+function createV66MqttHarness(source,options={}){
+  // Real shim/loader/event handlers; deterministic CDN/broker delivery, no public broker I/O.
+  const clients=[],scripts=[],jobs=[],published=[],received=[],storage=new Map();
+  class Native{constructor(){this.readyState=0;}send(){}close(){this.readyState=3;}}
+  const doc={querySelector:()=>scripts[0]||null,head:{appendChild:s=>scripts.push(s)},
+    createElement:()=>({listeners:[],addEventListener(type,fn){if(type==='load')this.listeners.push(fn);}})};
+  const fetcher=options.fetch|| (async()=>({ok:true,status:200,json:async()=>({messages:[]})}));
+  const g={window:{WebSocket:options.SocketClass||Native,location:{origin:'https://ridvanses.vercel.app',host:'ridvanses.vercel.app',protocol:'https:'},fetch:fetcher},
+    document:doc,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
+    localStorage:{getItem:()=>options.token||''},URL,URLSearchParams,Headers,Request,ArrayBuffer,Date,Math,Number,Buffer,AbortController,fetch:fetcher,
+    console:{log(){},warn(){},error(){}},setTimeout:(fn,ms)=>{const j={fn,ms,cancelled:false};jobs.push(j);return j;},
+    clearTimeout:j=>{if(j)j.cancelled=true;},setInterval:()=>1,clearInterval(){},queueMicrotask(){}};
+  const mqtt={connect(url){const c={url,connected:true,handlers:{},subscriptions:[],acks:[],ended:0,
+    on(type,fn){this.handlers[type]=fn;return this;},subscribe(topic,o,cb){this.subscriptions.push(topic);if(cb)this.acks.push(cb);},
+    publish(topic,raw){published.push({client:c,topic,message:JSON.parse(raw)});},
+    end(){this.ended++;this.connected=false;options.onEnd?.(c);}};
+    clients.push(c);return c;}};
+  vm.createContext(g);vm.runInContext(source,g);
+  const s=new g.window.WebSocket('wss://ridvanses.vercel.app/ws');
+  Object.assign(s,{readyState:1,_opened:true,_isRelay:true,_inFlight:true});
+  if(options.url)s.url=options.url;
+  s.onmessage=e=>{received.push(e);options.onmessage?.(e);};
+  const load=()=>{g.window.mqtt=mqtt;for(const script of scripts){script.onload?.();for(const fn of script.listeners)fn();}};
+  const init=(join={type:'join',role:'pilgrim',tourCode:'V66',roomId:'genel'})=>{
+    s._joinContext=join;s._subscriptionType='join';s._initMqttBus(join);};
+  const emit=(c,message,topic=c.subscriptions.find(t=>t!=='ridvanses/v2/global/sos')||s._mqttTopic)=>{
+    const m={...message,senderClientId:'v66-remote',_ryTs:Date.now()};
+    m._rySig=s._computeMqttFrameSig(topic,m.type,m._ryTs,m.senderClientId);
+    c.handlers.message?.(topic,Buffer.from(JSON.stringify(m)));
+  };
+  return {s,g,clients,scripts,jobs,published,received,load,init,emit};
+}
+
+async function runStep5V66AudioChecks(){
+  const assert=require('node:assert/strict'),shim=fs.readFileSync(path.join(PUBLIC_DIR,'vercel-ws-shim.js'),'utf8'),checks=[];
+  const message=id=>({_msgId:id,type:'stream-state',audioSourceId:'old-page',audioStateSeq:900,audioMediaEpoch:900,isLive:false,broadcastMode:'idle'});
+  {
+    const h=createV66MqttHarness(shim);h.init();h.s.close();h.load();h.load();
+    assert.equal(h.clients.length,0,'Closed relay must not create clients after a delayed CDN load');
+    assert.equal(h.s._mqttTopic,null);checks.push('delayed-CDN-after-close-creates-zero-clients');
+  }
+  {
+    const h=createV66MqttHarness(shim);h.init({role:'pilgrim',tourCode:'OLD',roomId:'genel'});h.init({role:'pilgrim',tourCode:'NEW',roomId:'siyer'});
+    h.load();assert.equal(h.clients.length,2,'Only the latest pending route may open the two brokers');
+    const active=h.s._mqttClients.slice();h.scripts[0].onload();
+    assert.deepEqual(h.s._mqttClients,active);assert(active.every(c=>!c.ended));
+    assert.equal(h.s._mqttTopic,'ridvanses/v2/room/NEW/SIYER');
+    checks.push('new-route-invalidates-older-loader-before-script-arrival');
+    h.s.close();
+  }
+  {
+    const h=createV66MqttHarness(shim);h.init();h.load();const old=h.clients.slice();
+    for(const c of old)c.handlers.connect();const ack=old[0].acks[0];assert(ack);
+    h.emit(old[0],message('live-before-switch'));assert.equal(h.received.length,1);
+    h.init({role:'pilgrim',tourCode:'NEW',roomId:'genel'});const active=h.clients.slice(-2);
+    assert(old.every(c=>c.ended===1));const counts={received:h.received.length,published:h.published.length,seen:h.s._busSeen.size};
+    for(const c of old){const n=c.subscriptions.length;c.handlers.connect();assert.equal(c.subscriptions.length,n);h.emit(c,message('shared-after-switch'),'ridvanses/v2/room/V66/GENEL');}
+    ack();assert.equal(h.published.length,counts.published);assert.equal(h.received.length,counts.received);assert.equal(h.s._busSeen.size,counts.seen);
+    for(const c of active)c.handlers.connect();active[0].acks[0]();assert(h.published.length>counts.published);
+    h.emit(active[0],message('shared-after-switch'));assert.equal(h.received.length,counts.received+1,'Stale callbacks must not poison current dedup IDs');
+    checks.push('ended-client-connect-suback-message-and-dedup-fenced-current-client-works');
+    h.s._isRelay=false;h.s._closeMqttClients();const delivered=h.received.length;
+    h.emit(active[0],message('after-native'),'ridvanses/v2/room/NEW/GENEL');active[0].handlers.connect();active[0].acks[0]();
+    assert.equal(h.received.length,delivered);assert.equal(h.s._mqttClients.length,0);
+    checks.push('native-takeover-rejects-old-broker-events');h.s.close();
+  }
+  {
+    const h=createV66MqttHarness(shim);h.init({role:'guide',tourCode:'V66',roomId:'genel',audioSourceId:'guide-page'});h.load();
+    h.s._lastGuideState={isLive:true,broadcastMode:'mic',audioStateSeq:1,audioMediaEpoch:1};
+    h.s._broadcastP2PRoomState();const old=h.s._roomStateTimer;assert(old);
+    h.s._closeMqttClients();assert(old.cancelled);h.s._broadcastP2PRoomState();const next=h.s._roomStateTimer;
+    old.fn();assert.equal(h.s._roomStateTimer,next,'A queued cancelled timer must not clear its replacement');
+    assert.equal(h.received.length,0);next.fn();assert.equal(h.received.length,1);assert.equal(h.s._roomStateTimer,null);
+    h.s._broadcastP2PRoomState();const last=h.s._roomStateTimer;h.s.close();last.fn();assert.equal(h.received.length,1);
+    checks.push('room-snapshot-timer-cancelled-generation-fenced-and-replacement-preserved');
+  }
+  {
+    let h;h=createV66MqttHarness(shim,{onEnd:c=>h.emit(c,message('sync-end'),'ridvanses/v2/room/V66/GENEL')});h.init();h.load();
+    for(let i=0;i<100;i++){h.init();assert.equal(h.s._mqttClients.length,2);assert.equal(h.clients.filter(c=>!c.ended).length,2);}
+    h.s.close();assert(h.clients.every(c=>c.ended===1));assert.equal(h.received.length,0);
+    checks.push('100-replacements-bounded-active-clients-invalidate-before-synchronous-end');
+  }
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('vercel-ws-shim.js?v=66'));
+  assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V66 UNIT METRICS '+JSON.stringify({checks,clientsAfterDelayedClose:0,staleDelivered:0,activeClientsMax:2,replacements:100}));
+  recordResult('ADIM-5.V66','MQTT loader/client/suback/timer ownership across route, close and native takeover; bounded replacement; cache66',true);console.log('V66 UNIT PASS');
+}
+
+async function runV66MqttOwnershipChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),code='RY-V66-'+Date.now().toString(36).toUpperCase();
+  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token},sockets=[],events=[],errors=[],pcm=Buffer.alloc(960);
+  for(let i=0;i<480;i++)pcm.writeInt16LE(Math.round(7000*Math.sin(2*Math.PI*300*i/24000)),2*i);
+  let guide,h,bus,created=false,committed=false;
+  const until=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error('V66 deadline '+label);await new Promise(r=>setTimeout(r,5));}};
+  const state=(seq,live=true)=>({type:'guide-stream-state',audioStateSeq:seq,audioMediaEpoch:live?10:seq,isLive:live,broadcastMode:live?'mic':'idle'});
+  const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+  class Bridge{constructor(address){this.real=new WebSocket(address);sockets.push(this.real);this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));
+    this.real.on('error',e=>{errors.push(e.message);this.onerror?.(e);});this.real.on('message',(raw,binary)=>{const data=binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString();
+      if(!binary){const m=JSON.parse(raw);events.push(m);if(m.type==='handoff-committed')committed=true;}this.onmessage?.({data});});}
+    get readyState(){return this.real.readyState;}send(raw){this.real.send(raw);}close(){this.real.close();}}
+  const barrier=async()=>{const ts=Date.now()+Math.random();guide.send(JSON.stringify({type:'ping',ts}));await until(()=>events.some(m=>m.type==='pong'&&m.echoTs===ts),'guide pong');};
+  try{
+    const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers,body:JSON.stringify({code,name:'V66 broker ownership',pin:'6066'})});assert.equal(r.status,200);await r.arrayBuffer();created=true;
+    guide=new WebSocket(url);sockets.push(guide);guide.on('error',e=>errors.push(e.message));guide.on('message',(raw,binary)=>{if(!binary)events.push(JSON.parse(raw));});
+    await new Promise((resolve,reject)=>{guide.once('open',resolve);guide.once('error',reject);});
+    guide.send(JSON.stringify({type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V66 guide',deviceId:'v66-guide-'+code,audioSourceId:'v66-page',token}));
+    await until(()=>events.some(m=>m.type==='joined'),'guide joined');
+    h=createV61ListenerHarness(fs.readFileSync(path.join(PUBLIC_DIR,'dinle.html'),'utf8'),fs.readFileSync(path.join(PUBLIC_DIR,'pcm-player-worklet.js'),'utf8'));h.connect(code);
+    bus=createV66MqttHarness(fs.readFileSync(path.join(PUBLIC_DIR,'vercel-ws-shim.js'),'utf8'),{SocketClass:Bridge,url,fetch:(route,o)=>fetch(baseUrl+route,o),onmessage:e=>h.g.ws.onmessage(e)});
+    const join={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',name:'V66 relay',deviceId:'v66-listener-'+code,pin:'6066'};
+    bus.init(join);bus.s._inFlight=false;await bus.s._flushAndPoll();
+    guide.send(JSON.stringify(state(10)));guide.send(binary(100));await barrier();await bus.s._flushAndPoll();
+    assert(h.player.q.has(100));const samples=h.player.q.get(100);for(let i=0;i<480;i++)assert.equal(samples[i],pcm.readInt16LE(2*i)/32768);
+    bus.load();const stale=bus.clients.slice();for(const c of stale)c.handlers.connect();
+    const audio=seq=>({_msgId:'v66-pcm-'+seq,type:'audio-chunk',audioSourceId:'v66-page',audioMediaEpoch:10,seq,sentAt:Date.now(),sampleRate:24000,pcm16:pcm.toString('base64'),level:.5});
+    bus.emit(stale[0],audio(101));assert(h.player.q.has(101),'Current broker must still deliver media');
+    guide.send(binary(101));await barrier();await bus.s._flushAndPoll();assert(h.player.stats.duplicate>=1,'HTTP/MQTT duplicate remains deduplicated');
+    // A real HTTP route change installs the new room before old broker callbacks are released.
+    h.connect(code,'siyer');bus.s._inFlight=true;bus.s.send(JSON.stringify({...join,roomId:'siyer'}));bus.s._inFlight=false;await bus.s._flushAndPoll();
+    guide.send(JSON.stringify({...state(11),topic:'inherit-current'}));guide.send(binary(102));await barrier();await bus.s._flushAndPoll();assert(h.player.q.has(102));
+    const delivery=h.g.rxAudioDeliveryEpoch,source=h.g.rxAudioSourceId,seen=bus.s._busSeen.size,delivered=bus.received.length,published=bus.published.length;
+    const staleControl={_msgId:'v66-stale-route',type:'stream-state',audioSourceId:'v66-old-route',audioStateSeq:900,audioMediaEpoch:900,isLive:false,broadcastMode:'idle'};
+    for(const c of stale){c.handlers.connect();for(const ack of c.acks)ack();bus.emit(c,staleControl,'ridvanses/v2/room/'+code.replace(/[^A-Z0-9]/g,'')+'/GENEL');bus.emit(c,{...audio(900),audioSourceId:'v66-old-route',audioMediaEpoch:900},'ridvanses/v2/room/'+code.replace(/[^A-Z0-9]/g,'')+'/GENEL');}
+    console.log('V66 STALE BROKER PROBE '+JSON.stringify({staleDelivered:bus.received.length-delivered,source:h.g.rxAudioSourceId,live:h.g.rxStreamActive,queue:Array.from(h.player.q.keys())}));
+    assert.equal(bus.received.length,delivered,'Ended broker must not deliver into the replacement route');assert.equal(bus.published.length,published);
+    assert.equal(h.g.rxAudioDeliveryEpoch,delivery);assert.equal(h.g.rxAudioSourceId,source);assert.equal(h.g.rxStreamActive,true);assert.equal(bus.s._busSeen.size,seen);assert(h.player.q.has(102));assert(!h.player.q.has(900));
+    // Fail back using the real two-phase native transaction, then release old MQTT events.
+    const active=bus.clients.slice(-2);for(const c of active)c.handlers.connect();
+    const cap={clientId:bus.s._relayClientId,relayKey:bus.s._relayKey};
+    bus.s._tryNativeFailback();await until(()=>committed&&!bus.s._isRelay,'native takeover');
+    assert.equal(bus.s._mqttClients.length,0);assert(active.every(c=>c.ended===1));
+    const before=bus.received.length;
+    for(const c of active){bus.emit(c,staleControl);for(const ack of c.acks)ack();c.handlers.connect();}
+    assert.equal(bus.received.length,before);assert.equal(h.g.rxStreamActive,true);
+    const retired=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify({...cap,requestSeq:999,subscriptionContext:{...join,roomId:'siyer'}})});
+    assert.equal(retired.status,409);await retired.arrayBuffer();
+    guide.send(binary(103));await barrier();await until(()=>h.player.q.has(103),'native PCM after stale broker');assert(!h.player.q.has(900));
+    for(const seq of [102,103]){const a=h.player.q.get(seq);for(let i=0;i<480;i++)assert.equal(a[i],pcm.readInt16LE(2*i)/32768);}
+    const delayed=createV66MqttHarness(fs.readFileSync(path.join(PUBLIC_DIR,'vercel-ws-shim.js'),'utf8'));delayed.init();delayed.s._isRelay=false;delayed.s._closeMqttClients();delayed.load();assert.equal(delayed.clients.length,0);delayed.s.close();
+    assert.deepEqual(errors,[]);
+    console.log('V66 E2E METRICS '+JSON.stringify({httpPcm:[100,101,102],nativePcm:103,staleBrokerDelivered:0,staleSourceResets:0,retiredStatus:409,clientsAfterNative:0,delayedClientsAfterNative:0,pcmEqual:true}));
+    recordResult('ADIM-3.V66','Real HTTP room switch and two-phase native failback reject late MQTT controls/media; active broker and dedup preserved; PCM byte parity',true);console.log('V66 E2E PASS');
+  }finally{
+    h?.g.leaveRoom();bus?.s.close();for(const socket of sockets)try{socket.terminate();}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -3595,6 +3746,7 @@
     await runStep5V63AudioChecks();
     await runStep5V64AudioChecks();
     await runStep5V65AudioChecks();
+    await runStep5V66AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -8,5 +8,5 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=65"></script>
+  <script src="/vercel-ws-shim.js?v=66"></script>
   <style>
     body {
diff --git a/public/dinle.html b/public/dinle.html
--- a/public/dinle.html
+++ b/public/dinle.html
@@ -16,7 +16,7 @@
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/dinle" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=65"></script>
+  <script src="/vercel-ws-shim.js?v=66"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -2653,7 +2653,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=65').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=66').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=65"></script>
+  <script src="/vercel-ws-shim.js?v=66"></script>
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
-  <script src="/vercel-ws-shim.js?v=65"></script>
+  <script src="/vercel-ws-shim.js?v=66"></script>
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
-  <script src="/vercel-ws-shim.js?v=65"></script>
+  <script src="/vercel-ws-shim.js?v=66"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
diff --git a/public/rehber.html b/public/rehber.html
--- a/public/rehber.html
+++ b/public/rehber.html
@@ -28,7 +28,7 @@
       window.location.href = '/login?next=/rehber';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=65"></script>
+  <script src="/vercel-ws-shim.js?v=66"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
     .console-wrap {
diff --git a/public/rota.html b/public/rota.html
--- a/public/rota.html
+++ b/public/rota.html
@@ -9,7 +9,7 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=65"></script>
+  <script src="/vercel-ws-shim.js?v=66"></script>
   <style>
     .rota-hero-strip {
       background:
diff --git a/public/sw.js b/public/sw.js
--- a/public/sw.js
+++ b/public/sw.js
@@ -1,14 +1,14 @@
 // PATCH: sw-v53
 // PATCH: sw-v53
 // PATCH: sw-v53
-const CACHE_NAME = 'ridvanses-pwa-v65';
+const CACHE_NAME = 'ridvanses-pwa-v66';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=65',
+  '/vercel-ws-shim.js?v=66',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
   '/pcm-player-worklet.js?v=61-audio',
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -399,16 +399,24 @@
     }
 
     _closeMqttClients() {
+      // Invalidate pending script loads and queued callbacks before ending any client.
+      this._mqttGeneration=(this._mqttGeneration||0)+1;
+      if(this._roomStateTimer){clearTimeout(this._roomStateTimer);this._roomStateTimer=null;}
       for (const c of this._mqttClients) {
         try { c.end(true); } catch {}
       }
       this._mqttClients = [];
+      this._mqttTopic = null;
     }
 
     _initMqttBus(joinMsg, isAdminMode = false) {
+      this._closeMqttClients();
+      const generation=this._mqttGeneration;
+      const current=()=>this._mqttGeneration===generation&&this._isRelay&&
+        this.readyState===1&&!this._closedExplicitly;
+      if(!current())return;
       loadScriptOnce('https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js', 'mqtt', () => {
-        if (!window.mqtt) return;
-        this._closeMqttClients();
+        if (!current()||!window.mqtt) return;
 
         const codeClean = joinMsg ? this._sanitizeCode(joinMsg.tourCode) : 'ALL';
         const roomClean = joinMsg && joinMsg.roomId ? String(joinMsg.roomId).trim().toUpperCase() : 'GENEL';
@@ -434,6 +442,7 @@
           this._mqttClients.push(client);
 
           client.on('connect', () => {
+            if(!current())return;
             // Rehber ve Admin her zaman Global SOS kanalını da dinler (hangi turda olursa olsun kayıp hacıyı görür!)
             if (isAdminMode || (joinMsg && joinMsg.role === 'guide')) {
               client.subscribe(GLOBAL_SOS_TOPIC, { qos: 0 });
@@ -443,6 +452,7 @@
               client.subscribe(`ridvanses/v2/room/${codeClean}/GENEL`, { qos: 0 });
             }
             client.subscribe(topic, { qos: 0 }, () => {
+              if(!current())return;
               if (joinMsg.role !== 'guide') {
                 this._publishMqtt({
                   _msgId: 'hello-' + this._clientId + '-' + Date.now(),
@@ -464,6 +474,7 @@
           });
 
           client.on('message', (t, payloadBuf) => {
+            if(!current())return;
             try {
               const msg = JSON.parse(payloadBuf.toString());
               if (!msg || msg.senderClientId === this._clientId) return;
@@ -606,9 +617,11 @@
     _broadcastP2PRoomState() {
       if (!this._joinContext || this._joinContext.role !== 'guide') return;
       if (this._roomStateTimer) return;
+      const generation=this._mqttGeneration||0;
       this._roomStateTimer = setTimeout(() => {
+        if((this._mqttGeneration||0)!==generation||this._closedExplicitly||!this._isRelay||this.readyState!==1)return;
         this._roomStateTimer = null;
-        if (!this._joinContext || this._joinContext.role !== 'guide') return;
+        if(!this._joinContext||this._joinContext.role!=='guide')return;
         const pilgrims = Array.from(this._pilgrimMeta.values());
         const tourCode = this._joinContext.tourCode || 'RY-KASIM';
         const roomId = this._joinContext.roomId || 'genel';
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=65"></script>
+  <script src="/vercel-ws-shim.js?v=66"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```
