# RıdvanSes v65 — v64 Uygulama, Kontrol Kurulumu ve Röle Sürekliliği Denetimi

Denetim: **9 Kasım 2026**, kök **D:/umresesliyazılım**. İncelenen disk HEAD: **a8b1bffacd8e3d3f2508dd6fee40a957369be36e**. Yalnız bu rapor güncellendi; aşağıdaki v65 yaması kaynaklara uygulanmadı, commit/push/deploy yapılmadı.

**Karar:** v64 paketi eksiksiz uygulanmış; disk doğrulaması **46/46 PASS, exit0**. Üç yeni P2 sınır kusuru doğrulandı: controller kurulmadan/eksik kaynak etiketiyle modern medya kabulü; retry ve dolu kontrol kuyruğunda kontrolün ilk PCM önünde güvenceye alınmaması; başarısız HTTP yeniden doğrulaması sonrasında eski rehber üyeliğinin ve lease'in yaşatılması. Bu nedenle **“SIFIR HATA — v64 %100 ONAYLI (PRODUCTION-READY)” onayı verilmiyor**. Yeni P0/P1/P3 doğrulanmadı; bütün olası hataların bulunmadığı kanıtlanmış değildir. Tek v65 diff'i ve yeni testler aşağıdadır.

## 1. v64 uygulama ve regresyon doğrulaması

| Kontrol | Kanıt |
| --- | --- |
| Başlangıçtaki raporun v64 diff'i | git apply --reverse --check --ignore-space-change -: **exit0**, stderr boş |
| v64 diff kimliği |58.549 bayt; SHA-256 **f5799f749914b5f6e295335531fea4a8deec095cac4d4872f16a699dfd114678** |
| HEAD kapsamı |12 kaynak + rapor =13 dosya; git show --stat:921 ekleme/604 silme |
| Disk komutu | **node scripts/verify-system.js → 46 / 46 [BAŞARILI / PASS], exit0**; V53..V64 E2E/Unit dahil |
| Başlangıç status |Yalnız AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md unstaged silinmiş; uygulama kaynağı değişikliği yok |
| DSP çekirdekleri |Capture/player HEAD^→HEAD değişmemiş; v65 diff'inin de hedefi değiller |

Capture ham SHA-256 **30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a**, player **062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7**.15 kaynak dosyasının başlangıç/son ham hash'leri ayrıca karşılaştırıldı.

### 1.1 İstenen dosya ve gereksinimlerin satır kontrolü

Aşağıdaki konumlar disk HEAD a8b1bff içindir; yeni diff satırları değildir.

| Dosya / v64 alanı | Satır ve değerlendirme |
| --- | --- |
| server.js serialize/handoff |370–427: özet epoch taşır;1596 commit ACK odası yeniden serialize edilir. V64 gerçek native handoff epoch10 ve PCM eşliği PASS. |
| server.js source/state kabulü |488–492 kaynak değişiminde epoch=null;480–486 pozitif güvenli epoch,epoch<=seq ve aynı kaynakta geriye gitmeme kontrolü.1060 guide state kurulumu;1275–1285 wire şeması. PASS. |
| server.js JSON/binary kabulü |472–478 aynı kaynak/bilinen epoch için eşitlik;1181 JSON etiketi;1357 native→HTTP fallback etiketi. Bilinen kontrol durumunda V64 eski medya0. Bilinmeyen/yeni kaynak için erken kabul boşluğu P2-65-01. |
| server.js miras/terminal |686–741: Genel→alt oda epoch712, kontrol mesajları720/739; terminal stop epoch'u korur.2500 ms grace korunmuş. PASS. |
| shim coalescer |70 epoch şeması;125–132 frame girişinde epoch etiketi; mevcut40 ms timer ve120 ms yaş sınırı. PASS. |
| shim native failback |378–379 terminal/stopped ACK _forceMediaEpoch;705–719 semantic epoch/rebase. Aktif ACK aynı nesli korur, terminal ACK yeni nesil açar. V64 Unit PASS. |
| shim send / MQTT |705–724 topic aynı epoch;764–779 PCM/synth kabulü/etiketi;633 snapshot ve848 stream-state epoch'u. PASS. |
| shim HTTP kuyruk/reopen |926–950: eksik _queuedAt'a yerel zaman;977–998 yalnız güncel epoch rebase, MQTT yeniden ilanı, state unshift. V64 E2E ilk yenileme503 korunmuş; retry/capacity ayrı boşluğu P2-65-02. |
| dinle durum/JSON |1180–1218 source/epoch reset, monotonik apply ve epoch değişiminde reset;1225–1230 connect/reset,1651 değişken,2588 leave;1380 JSON kabul çağrısı. Bilinen epoch eşliği PASS; null epoch/source boşluğu P2-65-01. |
| dinle topic/mod |1291–1326 snapshot,1328–1359 stream-state: aynı demo/topic notayı kesmez; mod/epoch/stop temizler. P3-64-04 gerçek işlev probu ve V64 Unit PASS. |
| verifier |586 E2E çağrısı;3223–3328 runStep5V64AudioChecks;3331–3413 runV64MediaChecks;3429 Unit çağrısı.9 v64 Unit grubu ve gerçek HTTP/WS zinciri PASS. |
| sw.js |4 cache ridvanses-pwa-v64,11 shim64; capture60-audio/player61-audio korunmuş. PASS. |
| dinle/rehber/panel/index HTML |Shim64 satırları19/31/32/85; dinle SW64:2652. PASS. |
| login/rota/ani-kitabi/yaka-karti HTML |Shim64 satırları13/12/10/11. PASS. |

v64'ün dört düzeltmesinin yerinde ve kendi regresyonlarında başarılı olması, aşağıdaki yeni kenar durumlarının test edildiği anlamına gelmiyordu.

## 2. Kanıtlı yeni P2 bulguları

### P2-65-01 — Modern medya, kendisine ait controller kurulmadan veya kaynak etiketi olmadan kabul edilebiliyor

**Konum:** [server.js:472](D:/umresesliyazılım/server.js:472)–478 ve1171–1196; [dinle.html:1189](D:/umresesliyazılım/public/dinle.html:1189)–1230,1380.

v64 eşitlik kontrolü yalnız mevcut epoch sayısal olduğunda çalışıyor. Yeni/bilinmeyen source/controller durumunda epoch taşıyan JSON, legacy veri-only başlangıç yolu gibi ele alınabiliyor. Receiver ayrıca sourceId=null iken kaynak eşitliği denetimini atlıyor. Sayısal epoch tek başına, paketin seçili rehbere ait olduğunu kanıtlamaz.

**Disk işlevleriyle iki receiver probu:**

- Hiç kontrol kurulmadan Source=unprimed,epoch10,PCM500 → **q=[500],rxAudioMediaEpoch=null**; receiver kaynağı veriden benimsedi. Sunucu acceptRysAudio da yeni kaynak için böyle bir modern pakete true verdi.
- Bilinen Source=page-s,epoch10 controller varken sourceId=null,epoch10,PCM500 → **q=[500]**; eksik kaynak etiketi bypass oldu.

**v65:** epoch taşıyan JSON için seçili geçerli kaynak kimliği, kurulmuş bilinen controller, açık canlılık ve eşleşen epoch gerekir. Epoch'lu controller sourceId'siz kurulmaz; modern room-state snapshot için audioStateKnown=true açıkça gerekir. Doğrudan stream-state kendi kontrol şemasıyla denetlenir. Sunucu modern medya ile kendiliğinden yeni kaynak başlatmaz; önce yetkili guide-stream-state kurulmalıdır. Receiver eksik/farklı sourceId'yi de reddeder. Legacy hiç epoch kullanmamış veri-only yol korunur; bilinen modern kaynağa legacy downgrade eklenmez.

**Test:** gerçek HTTP E2E'de kontrol öncesi modern PCM50 fan-out'a çıkmaz; gerçek shim MQTT expansion yolundan gelen ilk PCM500 ve kurulmuş kaynağın sourceId=null PCM510'u player'a girmez. Doğru kontrol sonrası51 gelir. Bu bir başlangıç politikasıdır: kontrolü kaybolmuş modern akış snapshot kurulana kadar oynatılmaz. Bu sessizliği, bütün koşullarda sıfır paket kaybı vaadi olarak sunmuyoruz. Normal native/HTTP üretici kontrolü PCM'den önce taşır; MQTT kontrol kaybında v63 snapshot toparlaması önemini korur.

### P2-65-02 — Retry güncel kontrolü medyanın arkasına koyabiliyor; dolu kuyruk stop'u kaybedebiliyor

**Konum:** [vercel-ws-shim.js:926](D:/umresesliyazılım/public/vercel-ws-shim.js:926)–950,956–1041.

Başarısız poll batch'indeki guide-stream-state catch içinde yeniden enqueue edilir. Enqueue en son _lastGuideState'i seçerek **değeri** doğru korur, ama mevcut kontrolü silip sona eklediği için fresh PCM'in **arkasına** taşır. Sunucu henüz yeni epoch'u bilmiyorsa, ilk taze PCM'i doğru eşitlik kuralıyla düşürür.64 non-audio kayıt doluyken yeni guide kontrolü tamamen reddedilebilir; sonraki poll'de stop'u yeniden üretecek ayrı güvence yoktur.

**Disk gerçek send/enqueue/flush probu:** başarısız eski poll sırasında stop2→resume3→PCM101. Sonraki gövde sırası **[audio-chunk101(epoch3), guide-stream-state(epoch3)]**. Bu20 ms ilk çerçeve, sunucu hâlâ epoch1'deyse kaybolur.

**Gerçek ağ negatif mutasyonu:** adaydan yalnız yeni kontrol-öne-alma bloğu çıkarıldı. Sonraki HTTP gerçekten v65 sunucusuna gitti; log **order=[audio-chunk,guide-stream-state],delivered52=false** ve yeni E2E FAIL/exit1. Tam yamada **[guide-stream-state,audio-chunk],delivered52=true**.

**v65:** HTTP gövdesi hazırlanırken güncel kontrol tekilleştirilip medyanın önüne alınır. Henüz başarılı cevabı alınmamış epoch için _lastGuideState, dolu kuyrukta yer bulamamış stop/start'ı da tekrar üretir. Sadece **o HTTP isteğinde gönderilmiş** ve başarılı/aynı rota cevabını almış epoch _relayGuideStateAckEpoch olarak kaydedilir; geç eski cevap daha yeni durumu ACK'lemiş sayılmaz. Yeni opaque oturumda bu alan null olur. Onaylı boş poll kontrolü gereksiz tekrar etmez.

Ek buffer/ses kopyası veya yeni timer yoktur: tek scalar ACK ve zaten bulunan son kontrol kaydı kullanılır.64 kontrol doluyken body'ye en fazla1 canonical kontrol eklenir; gerçek test65 kayıtla ilerler, server128 sınırının altındadır. Mevcut ses/control kuyruk limitleri değişmez. Stop kuyruk doluyken de ulaşır; sonraki resume53 ve native handoff54 korunur.

### P2-65-03 — Başarısız HTTP yeniden doğrulaması eski rehber üyeliğini ve lease'i yaşatıyor

**Konum:** [server.js:1481](D:/umresesliyazılım/server.js:1481)–1499,1689–1701; cleanupStaleRelaySessions.

resolveRysRelay, auth/bağlam kabulünden önce lastSeen'i güncelliyor. serveRysRelay401 döndürüyor ama mevcut privileged üyelik kalıyor. Sürekli100 ms başarısız poll,35 s temizleme sınırını sürekli ileri taşıyabilir; yayın PCM'i reddedilse de oda rehber/live durumunda kalır.

**Değişmemiş gerçek v64 sunucusunda negatif E2E:** doğrulanmış opaque guide üyeliği kuruldu; sonra aynı capability ile geçersiz body/context kimlik bilgileri ve Authorization olmadan istek yapıldı. HTTP401'e rağmen bootstrap **guidePresent=true,isLive=true**; test FAIL/exit1. Bu test global admin oturumunu revoke etmez; başarısız yeniden doğrulama yolunu sınar. Token gerçekten revoke/expire olduğunda aynı auth=false dalı çalışır, ancak o ayrı30 günlük süre fiziksel olarak beklenmedi.

**v65:** capability zaten doğrulanmışsa mevcut guide/admin membership auth başarısızlığında emekliye ayrılır, outbox/privileged bağlar temizlenir; rehber oda üyeliği0 grace ile kaldırılır. Sonraki eski capability409'dur. lastSeen yalnız auth ve bağlam senkronizasyonu başarı kontrollerinden sonra güncellenir.

**Public-ID güvenliği:** anahtarsız legacy ID'yi bilen anonim birine anında rehber düşürme yetkisi verilmez. Bu üyelik auth hatasında zorla kaldırılmaz; başarısız istek lease yenilemediği için önceki35 s sınırında cleanup, ardından normal guide grace uygulanır. Public family aboneliğinin başarısız guide-elevation denemesi de kendi aboneliğini emekliye ayırmaz. V65 Unit fake-clock1000/20000/34999/35001 ms ile uzamayan lease'i; gerçek E2E family delta bağının korunmasını doğrular.

Bu çözüm sunucu HTTP üyelik/liveness sınırıdır. Public MQTT'nin mevcut güven/yetkilendirme modelini dönüştürmez; broker tarafı erişim/otorite sınırları Bölüm4'te ayrıca belirtilmiştir.

## 3. Protokol ve uygulama etkisi

| Alan | Kapsam |
| --- | --- |
| PCM seq |20 ms paket sırası, mod2^31; duplicate/jitter/PLC için |
| requestSeq |Tek opaque oturumda GET/POST gövde uygulama sırası |
| audioStateSeq / ended |Aynı kaynak kontrol sırası ve sunucunun terminal stop tie-break'i |
| audioMediaEpoch |Aynı üretim dönemi; semantic start/stop/mod/terminal yenilemesinde değişir, topic'te korunur |
| rxAudioDeliveryEpoch |Yerel Blob/port teslim çiti; ağ alanı değildir |
| _relayGuideStateAckEpoch |Yalnız başarılı HTTP gövdesi için yerel teslim kaydı; yeni capability'de sıfırlanır; yeni wire alanı değildir |

v65 yeni bir wire protokol alanı eklemez; v64 source/controller/epoch sözleşmesini tamamlar. Kontrolün hiç kurulmadığı modern paket reddedilir; legacy epoch'suz yol açıkça ayrı uyumluluk kapsamındadır. Native binary972 B formatı değişmez; sıralı native kontrol ve soket sahipliği çiti sürer. Kontrol/epoch kimliği yayıncı kimlik doğrulaması yerine geçmez.

12 hedef: server.js, scripts/verify-system.js, shim, dinle, sw ve shim kullanan diğer7 HTML. Backend/shim/dinle/HTML/SW birlikte güncellenmeli. **Cache/shim65; player61-audio/capture60-audio korunur.** Capture/player kaynakları değişmez. Eski sekmeler SW aktivasyonuyla otomatik olarak yeni JavaScript'e dönüşmez. Yama bu turda kaynaklara uygulanmadı.

## 4. Uçtan uca DSP ve taşıma denetimi

| Katman | Sonuç / sınır |
| --- | --- |
| Rehber graph |rehber.html:1508–1765,1803–2030. İzin/module/import, preview, stop/restart, cihaz değişimi/heal ve eski callback kaynak sahipliği korunur; V60'ın17 yaşam döngüsü grubu PASS.709,1164,1937,2025,2056,2084 controller çağrıları açık mode taşır. V65 rehberde yalnız shim URL'sini değiştirir. |
| Capture |pcm-capture-worklet.js:10–50,53–150,152–220,223–258.193-tap×256 faz FIR, DC blocker,4 bant expander,480 örnek/20 ms frame.8/16/24/44.1/48 kHz giriş/partition sürekliliği PASS. Eski3072 örnek tampon yok. |
| Gate / comfort |10 ms lookahead;400 ms kalibrasyon/4 s minima;7.5 dB açma,4 dB hysteresis;240 ms hold;3 ms attack/120 ms release; kapalı kazanç0.126≈-18 dB. Comfort3 ms delay/600 ms quiet/80 ms fade/2 ms açılma. ContinuousSpeech gürültü bastırma ile yumuşak hece koruması arasında tercih yapar. |
| Paket/coalescer |12 B header+960 B PCM=972 B;50 paket/s;1–3 bağımsız JSON frame,40 ms timer/120 ms coalescer yaş sınırı. Epoch girişte etiketlenir; v65 modern controller tamlığı ve retry sırasını tamamlar. |
| Server /300 |Binary soft9720 B, JSON16000 B;65536 B hard veya2 s devam eden tıkanma izolasyonu.300 aynıIP join ve301 WS fixture PASS. Slow consumer düşürmesi sağlam dinleyicileri korur; tüm paketleri sonsuz gecikmesiz koruyamaz. |
| Relay/handoff |35 s lease, periyodik cleanup,3 s prepare expiry, no-await atomic commit, digest/revision/capability ve eski oturum409. GET key header'da, source DTO/schema paritesi v63 E2E'de korunur. V65 lease'i auth öncesinde yenilemez, rollback/anonim legacy disconnect eklemez. |
| Kuyruk |HTTP100 ms short-poll/3 s abort; server audio10/200 ms+control64, shim audio4 batch/200 ms+control64. Yeni canonical prefix en fazla1 body kaydıdır. HTTP başarıyla ACK'lenmeyen controller her gerektiğinde tekrar kurulur. |
| Receiver |Source/state/epoch ve socket kimliği; rxLoadToken/context, pending en çok13 frame/260 ms, port FIFO reset, Blob teslim çiti. Modern JSON artık controller+source+epoch+live bütünlüğünden geçer. Eski veri worklet'e girmeden reddedilir. |
| Player |pcm-player-worklet.js:12–27,98–187,190–234,253–338.8/16 kHz'de193-tap FIR ardından sürekli Hermite; >=24 kHz'de downsample FIR yok.±1000 ppm ASRC;5 ms de-click ve72 örnek/3 ms recovery blend. |
| Jitter /PLC |Başlangıç120 ms, uyarlanmış80–260 ms. En az bir paket varsa300 ms başlangıç eşiği; ilk60 ms pitch PLC, uzun kayıpta sönüm;300 ms starvation rebuffer. Hedef+120 ms üzerinde500 ms backlog catch-up,>32 frame24'e iner. PLC kayıp kelimeyi geri üretemez. |
| Bellek/temizlik |Sabit ring/FIR tabloları; sınırlı frame kuyrukları. Demo en çok4 nota; suspended durumda yeni düğüm0; stop10 ms audio-time/onended cleanup. V64 dokuz grup korunur. V65 ek büyüyen medya kuyruğu/haritası oluşturmaz. |
| SW / mobil |API/WS/auth rotaları cache dışı; diğer GET network-first. Cache sürümü OS arka planda ses işleme garantisi değildir; mevcut resume/rebuild kayıp süreyi geri getirmez. |

### 4.1 Beş çıkış hızında DSP ölçümleri

| Çıkış Hz | firstAfterReset | firstAfterStarvation | DC fixture iç maxStep |
| --- | --- | --- | --- |
|8000|0|0|0.130492|
|16000|0|0|0.145227|
|24000|0|0|0.002640|
|44100|0|0|0.001428|
|48000|0|0|0.001314|

Düşük hızlı FIR geçici rejiminin iç maxStep'i ilk örnek hatası değildir; sıfır fiziksel cızırtı kanıtı sayılmaz. Player alias reddi8 kHz çıkışta4080/4800/6000 Hz için -76.56/-107.60/-114.02 dB;16 kHz çıkışta8160/9600/10000 Hz için -97.45/-115.88/-127.11 dB. Capture8/16/44.1/48 kHz iki saniyede100 frame; |DC mean|<=1.82e-10 ve ilgili stopband fixture -95.9/-95.9/-129.7/-107.3 dB.24 kHz girişte ayrıca100 frame.200 Hz süreklilik maxStep0.007356; örnek PLC probe concealedSamples960. Rakamlar belirli ton/fixture'lardır, tüm spektrum için tek sınır değildir.

Capture FIR grup gecikmesi96/girişHızı:8/16/24/44.1/48 kHz için12/6/4/2.18/2 ms.10 ms lookahead,3 ms comfort,0–20 ms frameleme, player başlangıç120 ms ve düşük çıkışta4 ms FIR eklenir. Ağ/coalescer/HTTP/donanım ayrıca vardır. Yerel WS teslimi ağızdan kulağa gecikme değildir.5 ms reset tail'i önceki çıkışı yumuşak kapatır; reddedilen eski paketin yeniden kabulü değildir.

### 4.2 Kapanmamış saha ve mimari kabul koşulları

300 native dinleyici için972×50×300=14.580.000 B/s=**116.64 Mbit/s** ham çıkış, WS/TLS/TCP/IP hariç. Base64 PCM tabanı1280×50×300=19.200.000 B/s=**153.6 Mbit/s**, JSON hariç.300 HTTP dinleyicide100 ms poll yaklaşık3000 istek/s.300 fiziksel telefon/300 sürekli HTTP ses abonesi, gerçek roaming veya VDS NIC/TLS CPU kapasitesi bu turda ölçülmedi. Tek process RAM state'i çoklu Vercel instance arasında ortak değildir; tek relay otoritesi veya ortak state gereksinimi sürer.

Public MQTT imzası istemcide bilinen sabittir; oda ACL'si ve güvenilir yayıncı doğrulaması değildir. Aynı kaynak ordinal/epoch çitleri farklı UUID'ler arasında global yayıncı/oda otoritesi seçmez. Genel ve dedicated dönüşü eski UUID'yi yeniden meşru kılabildiğinden kalıcı UUID kara listesi çözüm olmaz. İki MQTT broker'ı ve HTTP arasında farklı kaynaklara ait gecikmiş kontrol seçimi için otorite tasarımı gerekir. V65 bu sınırı veya public MQTT logout/yetki modelini çözdüğünü iddia etmez. Broker yolları gerçek shim işlevleriyle VM'de sürüldü; public broker ağına bağlanılmadı.

Mono mikrofon rehberle yan konuşmacının aynı zaman/frekans bileşenlerini yüzde100 ayıramaz. Mikrofonun ağza yakınlığı SNR için önemlidir. BroadcastChannel ayrı cihazın hoparlör yoluna referans sağlamaz; echoCancellation:true isteği,50–400 ms çapraz cihaz iptali garantisi değildir. [W3C Media Capture AEC tanımı](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-echocancellation).

OS alarm/arama/ekran kilidinde AudioContext'i askıya alabilir; currentTime/worklet durur. Resume/rebuild kayıp konuşmayı geri getirmez. Receiver'da worklet kurulamaması için etkin eski scheduler fallback'i yok; iOS/Android, HFP/SCO ve gesture matrisi fiziksel cihazda sınanmalı. [Web Audio suspend davranışı](https://www.w3.org/TR/webaudio/#dom-audiocontext-suspend). bufferedAmount uçtan uca teslim/oynatma gecikmesi değildir. [WHATWG WebSocket bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount).

## 5. Test düzeni ve tek v65 unified diff

Yeni **ADIM-3.V65** gerçek localhost server/HTTP/WS üzerinde auth401 üyelik temizliği, public family bağının korunumu, modern kontrol öncesi medya reddi, eksik kaynaklı MQTT frame'i, başarısız ilk fetch sonrası gerçek HTTP retry/ilk PCM, dolu kontrol kuyruğunda stop, native handoff/binary fallback ve PCM bayt eşliğini sınar. İlk başarısız gönderim, belirlenmiş fetch Promise'inin reddiyle enjekte edilir; sonraki retry gerçek sunucuya gider. Public MQTT teslimi yerine gerçek shim expansion işlevi çağrılır; fiziksel broker kesintisi simüle edilmiş sayılmaz.

**ADIM-5.V65 altı grup:** modern receiver tamlığı/legacy; server controller kabulü; retry kontrol sırası; full-queue latch/no redundant poll; gönderilmiş epoch ACK/geç cevap; auth-failure/legacy/public-ID/lease güvenliği.35 s sınırı fake-clock ile sınanır, gerçek duvar saati35 s bekletilmez. Eski V53..V64 başarı koşulları korunur; cache65 beklentileri güncellenir.

Standart toplam **48**. Rapordaki tek diff disk bağlam satırlarıyla birebir eşleştirilerek bellekte kurulur. Geçici CommonJS preload, fs/module compile okumalarını aday kaynaklara yönlendirir; gerçek **node --require <preload> scripts/verify-system.js** ana girişi çalışır. Syntax/HTML inline kontrolleri aday metinde yapılır; verifier'ın raporu kaynak gibi okuması engellenir. Server ve localhost ağ gerçektir; tarayıcı/worklet VM'dedir. Dış finally runtime baytlarını geri alıp geçici preload'u siler. Aşağıdaki kaynak yaması bu turda uygulanmadı.

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -473,6 +473,8 @@
   const sameSource=room.audioSourceId===(sender.audioSourceId||clientId);
   if(sameSource&&room.audioStateKnown&&(!room.isLive||!synth&&String(room.broadcastMode||'').startsWith('demo')))return false;
   // Raw binary uses the ordered native socket; JSON must name the active media epoch.
+  if(message?.audioMediaEpoch!=null&&(!sameSource||!room.audioStateKnown||!room.isLive||
+    !Number.isSafeInteger(room.audioMediaEpoch)))return false;
   if(message&&sameSource&&Number.isSafeInteger(room.audioMediaEpoch)&&message.audioMediaEpoch!==room.audioMediaEpoch)return false;
   return true;
 }
@@ -1496,7 +1498,7 @@
     }
   }else s=s||getOrCreateRelaySession(id);
   if(s.relayRetired){res.status(409).json({error:'relay-session-retired'});return null;}
-  s.lastSeen=Date.now();return s;
+  return s;
 }
 function digestRysSubscription(m){
   if(!m)return null;
@@ -1686,19 +1688,34 @@
   session.lastRequestSeq=seq;return true;
 }
 
+// Only a verified opaque capability may immediately retire a privileged membership.
+// Legacy public IDs must not become an anonymous disconnect primitive.
+function retireRysRelayOnAuthFailure(session){
+  if(!session.relayKey)return;
+  const room=session.currentRoom,member=room?.clients.get(session.clientId);
+  if(member?.role!=='guide'&&!session.ws.isAdmin)return;
+  session.relayRetired=true;session.currentRoom=null;
+  session.ws.isAdmin=false;session.ws.familyTourCode=null;
+  if(Array.isArray(session.outbox))session.outbox.length=0;
+  if(room?.clients.has(session.clientId))removeClientFromRoom(room,session.clientId,0);
+}
+
 function serveRysRelay(session,req,res,token,context,messages=[]){
   if((context&&!isRysClientMessage(context))||!Array.isArray(messages)||messages.length>128||
     !messages.every(isRysClientMessage))return res.status(400).json({error:'relay-invalid-message'});
   if(context&&!['join','family-subscribe','admin-subscribe'].includes(context.type))
     return res.status(400).json({error:'relay-context-invalid'});
   if(!acceptRysRelayRequestOrder(session,req.method==='GET'?req.query:req.body,res))return;
-  if(!applyRysRelayAuth(session,req,token,context))
+  if(!applyRysRelayAuth(session,req,token,context)){
+    retireRysRelayOnAuthFailure(session);
     return res.status(401).json({error:'relay-auth-required'});
+  }
   if(!syncRysRelayContext(session,context)){
     const errors=drainRysRelaySession(session).filter(m=>m.type==='pin-error'||m.type==='auth-error');
     return res.json({clientId:session.clientId,messages:errors.length?errors:
       [{type:'pin-error',message:'Kafile/oda katılımı reddedildi; PIN ve yetkiyi kontrol edin.'}]});
   }
+  session.lastSeen=Date.now();
   if(session.relayKey&&context){
     const digest=digestRysSubscription(context);
     if(session.relayDigest!==digest){session.relayDigest=digest;session.relayRevision=(session.relayRevision||0)+1;}
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -584,6 +584,7 @@
   await runV62StopChecks({baseUrl,url:wsUrl,token:authToken});
   await runV63StateChecks({baseUrl,url:wsUrl,token:authToken});
   await runV64MediaChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV65ReadinessChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1535,9 +1536,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v64"));assert(sw.includes('/vercel-ws-shim.js?v=64'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v65"));assert(sw.includes('/vercel-ws-shim.js?v=65'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'64',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'65',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2502,7 +2503,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2712,7 +2713,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2951,7 +2952,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3136,7 +3137,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3323,7 +3324,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3409,6 +3410,172 @@
   }
 }
 
+async function runStep5V65AudioChecks(){
+  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const shim=read('public/vercel-ws-shim.js'),listener=read('public/dinle.html'),server=read('server.js'),checks=[];
+  function pick(source,name,kind='function'){
+    const m=new RegExp('^[ \\t]*'+(kind==='function'?'(?:async )?function '+name:kind==='class'?'class '+name+'\\b':'(?:async )?'+name)+'(?:\\([^\\n]*\\))?\\s*\\{','m').exec(source);assert(m,'V65 missing '+name);
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const s=source.slice(m.index,end+1);try{new vm.Script(kind==='method'?'class P{'+s+'}':s);return s;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V65 unterminated '+name);
+  }
+  const audio=(seq,epoch)=>({type:'audio-chunk',seq,audioSourceId:'page-s',audioMediaEpoch:epoch,sentAt:Date.now(),sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64'),level:.5});
+  const state=(seq,epoch=seq,live=true)=>({type:'stream-state',audioSourceId:'page-s',audioStateSeq:seq,audioMediaEpoch:epoch,isLive:live,broadcastMode:live?'mic':'idle'});
+  {
+    const h=createV61ListenerHarness(listener,read('public/pcm-player-worklet.js')),s=h.connect(),deliver=m=>s.onmessage({data:JSON.stringify(m)});
+    deliver(audio(500,10));assert.equal(h.player.q.size,0);assert.equal(h.g.rxAudioSourceId,null);
+    deliver({...state(10),audioSourceId:null});assert.equal(h.g.rxAudioMediaEpoch,null);
+    deliver({type:'room-state',room:{...state(10)}});assert.equal(h.g.rxAudioMediaEpoch,null);
+    deliver({...state(10),audioStateKnown:false});assert.equal(h.g.rxAudioMediaEpoch,null);
+    deliver({type:'room-state',room:{...state(10),audioStateKnown:true}});
+    for(const source of [null,undefined,'another-page']){deliver({...audio(500,10),audioSourceId:source});assert.equal(h.player.q.size,0);}
+    deliver(audio(501,10));assert(h.player.q.has(501));
+    const epoch=h.g.rxAudioDeliveryEpoch;deliver(state(11,10));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);assert(h.player.q.has(501));
+    deliver(state(12,12,false));deliver(audio(502,12));assert.equal(h.player.q.size,0);deliver(state(13));deliver(audio(503,12));assert.equal(h.player.q.size,0);
+    deliver(audio(504,13));assert(h.player.q.has(504));h.g.leaveRoom();const legacy=h.connect();legacy.onmessage({data:JSON.stringify(audio(1,undefined))});assert(h.player.q.has(1));
+    checks.push('modern-media-waits-for-complete-live-controller-legacy-data-only-preserved');
+  }
+  {
+    const g={};vm.createContext(g);vm.runInContext(pick(server,'acceptRysAudio'),g);const sender={audioSourceId:'page-s'};
+    for(const room of [{},{audioSourceId:'page-s'},{audioSourceId:'page-s',audioStateKnown:false,isLive:true,audioMediaEpoch:10},{audioSourceId:'other',audioStateKnown:true,isLive:true,audioMediaEpoch:10}])assert(!g.acceptRysAudio(room,sender,'c',false,audio(1,10)));
+    const room={audioSourceId:'page-s',audioStateKnown:true,isLive:true,broadcastMode:'mic',audioMediaEpoch:10};assert(g.acceptRysAudio(room,sender,'c',false,audio(1,10)));
+    assert(!g.acceptRysAudio(room,sender,'c',false,audio(1,undefined)));assert(g.acceptRysAudio({},sender,'c',false,audio(1,undefined)));assert(g.acceptRysAudio({},sender,'c'));
+    checks.push('server-modern-epoch-requires-installed-source-known-live-state');
+  }
+  function relay(fetcher){
+    const bodies=[],g={Date,Math,Number,ArrayBuffer,window:{ryGetDynamicChannelId:()=> 'channel'},localStorage:{getItem:()=> 'good'},setTimeout:()=>1,clearTimeout(){},queueMicrotask(){},
+      AbortController:class{constructor(){this.signal={};}abort(){}},fetch:async(u,o)=>{const b=JSON.parse(o.body);bodies.push(b);return fetcher?fetcher(b,bodies.length):{ok:true,json:async()=>({messages:[]})};}};
+    vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\n'+pick(shim,'validRysAudio')+'\nclass P{'+['send','_enqueueRelayMessage','_flushAndPoll','_resetRelaySession'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=P;',g);
+    const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,_relayClientId:'rys56-unit',_relayKey:'a'.repeat(48),_sendQueue:[],
+      _joinContext:{type:'join',role:'guide',audioSourceId:'page-s'},_lastGuideState:{...state(1),type:'guide-stream-state'},_relayRoutingKey:()=> 'route',_publishMqtt(){},_broadcastP2PRoomState(){},_busConnected:()=>false,_deliverIncomingMessage(){}});return {p,g,bodies};
+  }
+  {
+    let reject;const {p,bodies}=relay((b,n)=>n===1?new Promise((a,r)=>reject=r):{ok:true,json:async()=>({messages:[]})});p._sendQueue=[{...state(1),type:'guide-stream-state'}];
+    const flight=p._flushAndPoll();p.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));p.send(JSON.stringify(audio(101,3)));
+    reject(Error('injected send failure'));await flight;await p._flushAndPoll();const sent=bodies.at(-1).messages;
+    assert.equal(sent[0].type,'guide-stream-state');assert.equal(sent[0].audioMediaEpoch,3);assert.equal(sent[1].seq,101);assert.equal(p._relayGuideStateAckEpoch,3);
+    checks.push('failed-poll-retry-installs-latest-controller-before-fresh-PCM');
+  }
+  {
+    const {p,bodies}=relay();p._relayGuideStateAckEpoch=1;p._sendQueue=Array.from({length:64},()=>({type:'ping'}));p._inFlight=true;
+    p.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));assert.equal(p._sendQueue.length,64);p._inFlight=false;await p._flushAndPoll();
+    assert.equal(bodies.at(-1).messages.length,65);assert.equal(bodies.at(-1).messages[0].isLive,false);assert.equal(p._relayGuideStateAckEpoch,2);
+    await p._flushAndPoll();assert.equal(bodies.at(-1).messages.length,0);p._resetRelaySession();assert.equal(p._relayGuideStateAckEpoch,null);
+    checks.push('full-control-queue-cannot-drop-latched-stop-no-redundant-empty-poll-replay');
+  }
+  {
+    let resolve;const {p,bodies}=relay((b,n)=>n===1?new Promise(r=>resolve=r):{ok:true,json:async()=>({messages:[]})});p._sendQueue=[{...state(1),type:'guide-stream-state'}];
+    const flight=p._flushAndPoll();p.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));resolve({ok:true,json:async()=>({messages:[]})});await flight;
+    assert.equal(p._relayGuideStateAckEpoch,1);await p._flushAndPoll();assert.equal(bodies.at(-1).messages[0].audioMediaEpoch,2);assert.equal(p._relayGuideStateAckEpoch,2);
+    const refused=relay(()=>({ok:true,json:async()=>({messages:[{type:'auth-error'}]})}));await refused.p._flushAndPoll();assert.equal(refused.p._relayGuideStateAckEpoch,undefined);
+    checks.push('only-submitted-successful-epoch-acknowledged-late-response-cannot-ack-new-state');
+  }
+  {
+    let now=100;const map=new Map(),removed=[];
+    const g={Date:class extends Date{static now(){return now;}},crypto:require('node:crypto'),Buffer,httpRelaySessions:map,
+      isRequestAuthenticated:r=>r.auth===true,isValidAuthToken:t=>t==='good',syncRysRelayContext:()=>true,processClientJsonMessage(){},
+      drainRysRelaySession:s=>s.outbox.splice(0),getOrCreateRelaySession(){throw Error('unexpected new legacy session');},
+      removeClientFromRoom:(room,id,grace)=>{removed.push({id,grace});room.clients.delete(id);}};
+    vm.createContext(g);vm.runInContext(['isRysClientMessage','acceptRysRelayRequestOrder','applyRysRelayAuth','retireRysRelayOnAuthFailure','serveRysRelay','resolveRysRelay','cleanupStaleRelaySessions','digestRysSubscription'].map(n=>pick(server,n)).join('\n'),g);
+    const response=()=>({status(n){this.code=n;return this;},json(m){this.body=m;}});
+    const member=(id,key,role='guide')=>{const room={clients:new Map([[id,{role}]])},s={clientId:id,relayKey:key,ws:{isAdmin:false,familyTourCode:null},currentRoom:room,lastSeen:0,outbox:[]};map.set(id,s);return s;};
+    const s=member('rys56-key','a'.repeat(48)),res=response();g.serveRysRelay(s,{method:'POST',body:{requestSeq:1}},res,'bad',{type:'join',role:'guide'});
+    assert.equal(res.code,401);assert.equal(s.lastSeen,0);assert.equal(s.relayRetired,true);assert.equal(s.currentRoom,null);assert(removed.some(x=>x.id===s.clientId&&x.grace===0));
+    const stale=response();assert.equal(g.resolveRysRelay({method:'POST',headers:{}},stale,{clientId:s.clientId,relayKey:s.relayKey}),null);assert.equal(stale.code,409);
+    const legacy=member('legacy-public-id',undefined);for(now of [1000,20000,34999]){g.resolveRysRelay({method:'POST',headers:{}},response(),{clientId:legacy.clientId});g.serveRysRelay(legacy,{method:'POST',body:{}},response(),'bad',{type:'join',role:'guide'});}
+    assert.equal(legacy.lastSeen,0);assert(legacy.currentRoom.clients.has(legacy.clientId));now=35001;g.cleanupStaleRelaySessions();assert(!map.has(legacy.clientId));
+    const family={clientId:'rys56-family',relayKey:'b'.repeat(48),ws:{familyTourCode:'T',isAdmin:false},lastSeen:0,outbox:[]};
+    g.serveRysRelay(family,{method:'POST',body:{requestSeq:1}},response(),'bad',{type:'join',role:'guide'});assert(!family.relayRetired);assert.equal(family.ws.familyTourCode,'T');assert.equal(family.lastSeen,0);
+    g.serveRysRelay(family,{method:'POST',body:{requestSeq:2}},response(),undefined,{type:'family-subscribe',tourCode:'T'});assert.equal(family.lastSeen,35001);
+    const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
+    checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
+  }
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v65'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
+  recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
+}
+
+async function runV65ReadinessChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),code='RY-V65-'+Date.now().toString(36).toUpperCase();
+  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token},caps=[],sockets=[],controls=[],jsonAudio=[],httpAudio=[],subAudio=[],requests=[],errors=[];let h,p,created=false,failNext=false,rejectSend;
+  const until=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error('V65 deadline '+label+' '+JSON.stringify({source:h?.g.rxAudioSourceId,live:h?.g.rxStreamActive,epoch:h?.g.rxAudioMediaEpoch,q:h?Array.from(h.player.q.keys()):[]}));await new Promise(r=>setTimeout(r,5));}};
+  const response=body=>fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});
+  const post=async body=>{const r=await response(body);assert.equal(r.status,200,'V65 relay '+body.type);return r.json();};
+  const open=async()=>{const r=await post({type:'relay-open',version:56}),s={clientId:r.clientId,relayKey:r.relayKey};caps.push(s);return s;};
+  const pcm=Buffer.alloc(960);for(let i=0;i<480;i++)pcm.writeInt16LE(4567,2*i);
+  const audio=(seq,epoch,source='page-main')=>({type:'audio-chunk',seq,audioMediaEpoch:epoch,audioSourceId:source,sentAt:Date.now(),sampleRate:24000,pcm16:pcm.toString('base64'),level:.5});
+  const context={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V65 main',deviceId:'v65-main-'+code,audioSourceId:'page-main',token};
+  const authContext={...context,name:'V65 auth',deviceId:'v65-auth-'+code,audioSourceId:'page-auth'};
+  class Bridge{static OPEN=1;static CONNECTING=0;static CLOSED=3;
+    constructor(address){this.real=new WebSocket(address);sockets.push(this.real);this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));this.real.on('error',e=>errors.push(e.message));
+      this.real.on('message',(raw,binary)=>{if(!binary){const m=JSON.parse(raw);controls.push(m);if(m.type==='audio-chunk')jsonAudio.push(m);}this.onmessage?.({data:binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString()});});}
+    get readyState(){return this.real.readyState;}send(raw){this.real.send(raw);}close(){this.real.close();}}
+  let main,sub;const listener=roomId=>({type:'join',role:'pilgrim',tourCode:code,roomId,name:'V65 HTTP '+roomId,pin:'6065'});
+  const poll=async()=>{for(const [cap,room,out] of [[main,'genel',httpAudio],[sub,'siyer',subAudio]]){const r=await post({...cap,subscriptionContext:listener(room)});out.push(...r.messages.filter(m=>m.type==='audio-chunk'));}};
+  const barrier=async()=>{const ts=Date.now()+Math.random();h.g.ws.send(JSON.stringify({type:'ping',ts}));await until(()=>controls.some(m=>m.type==='pong'&&m.echoTs===ts),'listener pong');};
+  const state=(live,topic='V65')=>({type:'guide-stream-state',isLive:live,broadcastMode:live?'mic':'idle',topic});
+  const tx=async messages=>{p._inFlight=true;for(const m of messages)p.send(JSON.stringify(m));p._inFlight=false;await p._flushAndPoll();};
+  try{
+    const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers,body:JSON.stringify({code,name:'V65 readiness/retry/auth',pin:'6065'})});assert.equal(r.status,200);await r.arrayBuffer();created=true;
+    h=createV61ListenerHarness(fs.readFileSync(path.join(ROOT_DIR,'public/dinle.html'),'utf8'),fs.readFileSync(path.join(ROOT_DIR,'public/pcm-player-worklet.js'),'utf8'),Bridge);
+    const address=new URL(url);h.g.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};h.g.document.getElementById('tourPinInput').value='6065';h.connect(code);await until(()=>controls.some(m=>m.type==='joined'),'joined');
+    main=await open();sub=await open();await poll();
+    const shim=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8');
+    function pick(name,kind='method'){const m=new RegExp('^[ \\t]*'+(kind==='function'?'function ':'(?:async )?')+name+'\\([^\\n]*\\)\\s*\\{','m').exec(shim);assert(m);
+      for(let end=shim.indexOf('}',m.index);end>=0;end=shim.indexOf('}',end+1)){const s=shim.slice(m.index,end+1);try{new vm.Script(kind==='method'?'class P{'+s+'}':s);return s;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V65 missing '+name);}
+    const g={Date,Math,Number,ArrayBuffer,setTimeout,clearTimeout,queueMicrotask,AbortController,window:{ryGetDynamicChannelId:()=> 'same-channel'},localStorage:{getItem:()=>token},
+      fetch:(route,options)=>{requests.push(JSON.parse(options.body));if(failNext){failNext=false;return new Promise((resolve,reject)=>rejectSend=reject);}return fetch(baseUrl+route,options);}};
+    vm.createContext(g);vm.runInContext(['nextRysAudioStateSeq','validRysAudio','unpackRysAudio'].map(n=>pick(n,'function')).join('\n')+'\nclass P{'+['send','_enqueueRelayMessage','_flushAndPoll','_deliverIncomingMessage'].map(n=>pick(n)).join('\n')+'}\nglobalThis.P=P;',g);
+    const delivery=new g.P();delivery._seenIds=new Set();delivery.onmessage=e=>h.g.ws.onmessage(e);
+    delivery._deliverIncomingMessage({_msgId:'v65-before-controller',...audio(500,10)});assert.equal(h.player.q.size,0);assert.equal(h.g.rxAudioSourceId,null);
+    const auth=await open();await post({...auth,requestSeq:1,subscriptionContext:authContext,messages:[{...state(true),audioStateSeq:10,audioMediaEpoch:10},audio(40,10,'page-auth')]});
+    await until(()=>h.player.q.has(40),'authorized initial PCM');await poll();
+    const denied=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...auth,requestSeq:2,token:'invalid',subscriptionContext:{...authContext,token:'invalid'}})});
+    assert.equal(denied.status,401);assert.equal((await denied.json()).error,'relay-auth-required');
+    const boot=await fetch(baseUrl+'/api/bootstrap',{headers}),snapshot=await boot.json(),room=snapshot.liveRooms.find(r=>r.tourCode===code&&r.roomId==='genel');
+    console.log('V65 AUTH PROBE '+JSON.stringify({guidePresent:room.connectedGuides.some(c=>c.id===auth.clientId),isLive:room.isLive}));
+    assert(!room.connectedGuides.some(c=>c.id===auth.clientId),'Failed reauthentication must remove verified opaque guide membership');assert.equal(room.isLive,false);
+    const retired=await response({...auth,requestSeq:3,subscriptionContext:authContext});assert.equal(retired.status,409);assert.equal((await retired.json()).error,'relay-session-retired');
+    await barrier();assert.equal(h.player.q.size,0);
+    const guide=await open();await post({...guide,requestSeq:1,subscriptionContext:context});await post({...guide,requestSeq:2,subscriptionContext:context,messages:[audio(50,50)]});
+    await barrier();await poll();assert(!httpAudio.some(m=>m.seq===50));assert(!jsonAudio.some(m=>m.seq===50));
+    p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,_relayClientId:guide.clientId,_relayKey:guide.relayKey,_relayRequestSeq:2,_sendQueue:[],_joinContext:context,
+      _seenIds:new Set(),_relayRoutingKey:()=> 'main',_publishMqtt(){},_broadcastP2PRoomState(){},_busConnected:()=>false,_deliverIncomingMessage(){}});
+    await tx([state(true),audio(51)]);await until(()=>h.player.q.has(51),'controller then PCM');await poll();
+    assert.equal(p._relayGuideStateAckEpoch,1);
+    delivery._deliverIncomingMessage({_msgId:'v65-missing-source',...audio(510,1),audioSourceId:null});assert(!h.player.q.has(510));assert(h.player.q.has(51));
+    p._inFlight=true;p.send(JSON.stringify(state(true,'pending topic')));p._inFlight=false;failNext=true;const flight=p._flushAndPoll();
+    p.send(JSON.stringify(state(false)));p.send(JSON.stringify(state(true)));p.send(JSON.stringify(audio(52)));rejectSend(Error('injected request did not reach server'));await flight;
+    await p._flushAndPoll();await barrier();await poll();
+    console.log('V65 RETRY PROBE '+JSON.stringify({order:requests.at(-1).messages.map(m=>m.type),delivered52:httpAudio.some(m=>m.seq===52)}));
+    assert(httpAudio.some(m=>m.seq===52),'First fresh PCM must survive the failed-poll retry');assert(h.player.q.has(52));
+    p._sendQueue=Array.from({length:64},()=>({type:'ping'}));p._inFlight=true;p.send(JSON.stringify(state(false)));p._inFlight=false;await p._flushAndPoll();
+    assert.equal(requests.at(-1).messages.length,65);assert.equal(requests.at(-1).messages[0].isLive,false);await barrier();assert.equal(h.g.rxStreamActive,false);assert.equal(h.player.q.size,0);
+    await tx([state(true),audio(53)]);await until(()=>h.player.q.has(53),'full queue recovery');await poll();await p._flushAndPoll();assert.equal(requests.at(-1).messages.length,0);
+    const native=new WebSocket(url),events=[];sockets.push(native);native.on('error',e=>errors.push(e.message));native.on('message',(raw,binary)=>{if(!binary)events.push(JSON.parse(raw));});
+    await new Promise((resolve,reject)=>{native.once('open',resolve);native.once('error',reject);});native.send(JSON.stringify({type:'handoff-prepare',relayClientId:p._relayClientId,relayKey:p._relayKey,subscription:context}));
+    await until(()=>events.some(m=>m.type==='handoff-prepared'),'prepare');const handoffId=events.find(m=>m.type==='handoff-prepared').handoffId;
+    native.send(JSON.stringify({type:'handoff-commit',handoffId}));await until(()=>events.some(m=>m.type==='handoff-committed'),'commit');const ack=events.find(m=>m.type==='handoff-committed').ack;
+    assert.equal(ack.room.audioMediaEpoch,p._lastGuideState.audioMediaEpoch);
+    const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+    const nativeBarrier=async()=>{const ts=Date.now()+Math.random();native.send(JSON.stringify({type:'ping',ts}));await until(()=>events.some(m=>m.type==='pong'&&m.echoTs===ts),'native pong');await barrier();};
+    native.send(binary(54));await nativeBarrier();await poll();assert(h.player.q.has(54));
+    // A failed guide elevation must not retire an existing public family subscription.
+    const family=await open(),familyContext={type:'family-subscribe',tourCode:code};await post({...family,requestSeq:1,subscriptionContext:familyContext});
+    const familyDenied=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...family,requestSeq:2,token:'invalid',subscriptionContext:{...context,token:'invalid'}})});
+    assert.equal(familyDenied.status,401);await familyDenied.arrayBuffer();const next=p._lastGuideState.audioStateSeq+1;
+    native.send(JSON.stringify({...state(true,'family still bound'),audioStateSeq:next,audioMediaEpoch:p._lastGuideState.audioMediaEpoch}));await nativeBarrier();
+    const familyPoll=await post({...family,requestSeq:3,subscriptionContext:familyContext});assert(familyPoll.messages.some(m=>m.type==='stream-state'&&m.currentTopic==='family still bound'));
+    native.send(JSON.stringify({...state(false),audioStateSeq:next+1,audioMediaEpoch:next+1}));native.send(binary(55));await nativeBarrier();await poll();
+    const expected=[40,51,52,53,54];assert.deepEqual(httpAudio.map(m=>m.seq),expected);assert.deepEqual(subAudio.map(m=>m.seq),expected);
+    for(const m of [...httpAudio,...subAudio])assert(Buffer.from(m.pcm16,'base64').equals(pcm));assert.deepEqual(errors,[]);assert.equal(h.player.q.size,0);
+    console.log('V65 E2E METRICS '+JSON.stringify({mainPcm:httpAudio.map(m=>m.seq),subPcm:subAudio.map(m=>m.seq),unprimedReceiverFrames:0,unprimedServerFrames:0,retryFirstPcm:52,fullQueueStop:true,authFailureGuidePresent:false,oldCapabilityStatus:409,familyPreserved:true,pcmEqual:true}));
+    recordResult('ADIM-3.V65','Real auth-failure cleanup/public-family safety; unknown-controller media rejection; failed request retry preserves first PCM; full-queue stop; native handoff and byte parity',true);console.log('V65 E2E PASS');
+  }finally{
+    h?.g.leaveRoom();for(const s of sockets)try{s.terminate();}catch(e){}
+    for(const cap of caps)try{await post({...cap,type:'relay-close',version:56});}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -3427,6 +3594,7 @@
     await runStep5V62AudioChecks();
     await runStep5V63AudioChecks();
     await runStep5V64AudioChecks();
+    await runStep5V65AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=64"></script>
+  <script src="/vercel-ws-shim.js?v=65"></script>
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
-  <script src="/vercel-ws-shim.js?v=64"></script>
+  <script src="/vercel-ws-shim.js?v=65"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1191,6 +1191,7 @@
       if(state.audioStateSeq!=null&&(!Number.isSafeInteger(state.audioStateSeq)||state.audioStateSeq<1))return false;
       if(state.audioMediaEpoch!=null&&(!Number.isSafeInteger(state.audioMediaEpoch)||state.audioMediaEpoch<1||
         !Number.isSafeInteger(state.audioStateSeq)||state.audioMediaEpoch>state.audioStateSeq))return false;
+      if(state.audioMediaEpoch!=null&&(!state.audioSourceId||state.audioStateKnown===false))return false;
       if(state.audioSourceId!=null&&(typeof state.audioSourceId!=='string'||!state.audioSourceId||state.audioSourceId.length>128||!(/^[a-zA-Z0-9_.-]+$/).test(state.audioSourceId)))return false;
       updateRxAudioSource(state.audioSourceId);
       const seq=state.audioStateSeq??null,ended=state.audioStateEnded===true;
@@ -1211,6 +1212,9 @@
       if(rxStreamActive===false)return false;
       if(json){
         if(mediaEpoch!=null&&(!Number.isSafeInteger(mediaEpoch)||mediaEpoch<1))return false;
+        // Epoch-bearing media is meaningful only after its control state is installed.
+        if(mediaEpoch!=null&&(!Number.isSafeInteger(rxAudioMediaEpoch)||!rxStreamActive||
+          !sourceId||sourceId!==rxAudioSourceId))return false;
         if(Number.isSafeInteger(rxAudioMediaEpoch)&&mediaEpoch!==rxAudioMediaEpoch)return false;
       }
       if(!synth&&String(rxStreamMode||'').startsWith('demo')||synth&&rxStreamMode==='mic')return false;
@@ -1293,7 +1297,7 @@
           if (r) {
             const previousMode=rxStreamMode;
             updateRxAudioSource(r.audioSourceId);
-            if(r.audioStateKnown===true||rxStreamActive===null&&r.isLive===true){
+            if(r.audioStateKnown===true||rxStreamActive===null&&r.isLive===true&&r.audioMediaEpoch==null){
               if(applyRxAudioState(r)&&(rxStreamActive===false||previousMode!==rxStreamMode&&
                 (previousMode!==null||String(rxStreamMode||'').startsWith('demo'))))stopAllActiveSources();
             }
@@ -2649,7 +2653,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=64').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=65').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=64"></script>
+  <script src="/vercel-ws-shim.js?v=65"></script>
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
-  <script src="/vercel-ws-shim.js?v=64"></script>
+  <script src="/vercel-ws-shim.js?v=65"></script>
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
-  <script src="/vercel-ws-shim.js?v=64"></script>
+  <script src="/vercel-ws-shim.js?v=65"></script>
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
-  <script src="/vercel-ws-shim.js?v=64"></script>
+  <script src="/vercel-ws-shim.js?v=65"></script>
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
-  <script src="/vercel-ws-shim.js?v=64"></script>
+  <script src="/vercel-ws-shim.js?v=65"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v64';
+const CACHE_NAME = 'ridvanses-pwa-v65';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=64',
+  '/vercel-ws-shim.js?v=65',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
   '/pcm-player-worklet.js?v=61-audio',
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -310,7 +310,7 @@
         try{fetch('/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},
           body:JSON.stringify({type:'relay-close',version:56,clientId,relayKey}),keepalive:true}).catch(()=>{});}catch(e){}
       }
-      this._relayClientId=null;this._relayKey=null;this._relayFenced=false;this._relayRequestSeq=0;
+      this._relayClientId=null;this._relayKey=null;this._relayFenced=false;this._relayRequestSeq=0;this._relayGuideStateAckEpoch=null;
       this._httpEpoch=(this._httpEpoch||0)+1;
       this._relayAbort?.abort();this._relayAbort=null;this._inFlight=false;
     }
@@ -1011,6 +1011,15 @@
           return frames.every(f=>(!source||!f.audioSourceId||f.audioSourceId===source)&&
             (!Number.isSafeInteger(state?.audioMediaEpoch)||f.audioMediaEpoch===state.audioMediaEpoch));
         });
+        // v65: a failed poll can requeue a control behind fresh PCM. Send the latest
+        // control first, including a latched stop/start that could not enter a full queue.
+        const latest=this._joinContext?.role==='guide'?this._lastGuideState:null;
+        if(latest&&(fresh.some(m=>m.type==='guide-stream-state')||
+          Number.isSafeInteger(latest.audioMediaEpoch)&&this._relayGuideStateAckEpoch!==latest.audioMediaEpoch)){
+          for(let i=fresh.length-1;i>=0;i--)if(fresh[i].type==='guide-stream-state')fresh.splice(i,1);
+          fresh.unshift({...latest});
+        }
+        const submittedGuideEpoch=latest&&fresh[0]?.type==='guide-stream-state'?fresh[0].audioMediaEpoch:null;
         const requestSeq=this._relayRequestSeq=(this._relayRequestSeq||0)+1;
         const res=await fetch('/api/ws-relay',{method:'POST',signal:ac.signal,
           headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:this._relayClientId,
@@ -1028,6 +1037,8 @@
           throw Error('Relay HTTP '+res.status);
         }
         if(!sameRoute()){success=true;return;}
+        if(Number.isSafeInteger(submittedGuideEpoch)&&!payload.messages?.some?.(m=>m.type==='auth-error'||m.type==='pin-error'))
+          this._relayGuideStateAckEpoch=submittedGuideEpoch;
         if(Array.isArray(payload.messages))for(const m of payload.messages)this._deliverIncomingMessage(m);
         success=true;
       }catch(e){
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=64"></script>
+  <script src="/vercel-ws-shim.js?v=65"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```

## 6. Nihai test ve ölçüm sonuçları

| Koşu | Sonuç |
| --- | --- |
| Disk v64 | **node scripts/verify-system.js → 46/46 PASS, exit0** |
| Yeni E2E + değişmemiş v64 sunucusu | **FAIL/exit1**: HTTP401 sonrası guidePresent=true,isLive=true; yeni auth-cleanup assertion'ı yakaladı |
| Yalnız yeni kontrol-prefix bloğu çıkarılmış aday | **FAIL/exit1**: order=[audio-chunk,guide-stream-state],delivered52=false; ilk taze PCM kaybı gerçek sonraki HTTP isteğinde gözlendi |
| Nihai rapor diff'i, CommonJS bellek preload ve gerçek CLI | **node --require <geçici preload> scripts/verify-system.js → 48 / 48 [BAŞARILI / PASS], exit0**; V53..V65 E2E/Unit korunmuş |

Son48 koşusunun300 dinleyici probe'u:300 aynıIP join200;301 gerçekWS;270 sağlam×120 frame=**32400 sağlam teslim**;30 duraklatılmış/yapay backlog soketi;1500 soft drop;3 hard izolasyon;0 bozuk PCM. Yerel gönderim→WS teslim p50 **13.67 ms**, p95 **31.82 ms**, p99 **40.89 ms**, max **59.08 ms**; event-loop p99 **27.15 ms**, CPU **1750 ms**, süre **2439.2 ms**. Disk46 koşusunda p50/p95/p99/max=13.61/22.54/28.31/34.88 ms idi. Farklar kontrollü performans A/B'si değildir; host yükleri farklıdır. Bu sayılar300 fiziksel cihazın akustik veya roaming gecikmesi değildir.

V64 regresyonu korunur: ana/siyer PCM [500,501,502,503,504,505,506], HTTP-only synth [880],oldMediaAfterResume=0,oldDemoNotes=0,staleBlobFrames=0,firstAfterRenewal=503,handoffEpoch=10,pcmEqual=true.

V65 gerçek zincir: **mainPcm=subPcm=[40,51,52,53,54]**; unprimedReceiverFrames=0,unprimedServerFrames=0,retryFirstPcm=52,fullQueueStop=true,authFailureGuidePresent=false,oldCapabilityStatus=409,familyPreserved=true,pcmEqual=true.

- Yetkili ilk40 geldi; başarısız yeniden doğrulama sonrasında üyelik/live kapandı ve eski capability409 oldu.
- Kontrol kurulmadan50 ve MQTT500; bilinen controller varken kaynak etiketsiz510 kabul edilmedi. Doğru controller sonrası51 geldi.
- İlk fetch kasıtlı reddedildikten sonra retry kontrolü öne koydu ve52 korundu.
- 64 kontrol doluyken canonical stop65. kayıtlı body'nin önünde ulaştı; sonraki resume53 ve native handoff54 geldi. Son stop sonrası55 gelmedi.
- Public family aboneliği başarısız guide-elevation sonrasında sonraki stream-state delta'sını aldı. Tüm PCM baytları eşit.

V65 Unit altı grupta unprimedFrames=0,retryFirstPcmPreserved=true,fullQueueStopDelivered=true,failedAuthLeaseExtensions=0. Geç HTTP yanıtı yalnız kendi gönderilmiş epoch'unu ACK'ler; yeni bekleyen stop'un ACK'i sayılmaz. Başarılı boş poll aynı kontrolü gereksiz tekrarlamaz. Modern controller/source tamlığı, data-only legacy uyumluluğu, anonim public-ID ile zorla disconnect engeli ve35001 ms cleanup sınırı ayrı assert edilir.

Bu sıfırlar belirtilen fixture ve enjeksiyonlardır; tüm radyo/OS/broker zamanlamalarında evrensel sıfır anlamına gelmez. Negatif koşular başarıya dahil edilmedi. Kontrol-prefix mutasyonu tam eski shim olarak sunulmaz; yalnız belirli sıralama korumasının nedensel etkisini ölçer.

Kanıt logları yerel TEMP altında: **rys-v65-baseline.log**, **rys-v65-old-server.log**, **rys-v65-old-order.log**, **rys-v65-report-final.log**. Sonuncusu nihai 41.219 baytlık diff'i gerçek CLI ana girişinde kullanır. Her koşuda dış PowerShell finally runtime.json başlangıç baytlarını geri aldı ve geçici .cjs preload'u sildi. Bu turda ESM preload kullanılmadı.

## 7. Artefakt ve çalışma ağacı bütünlüğü

Tek diff, **12 hedef**, **41.219 bayt**, UTF-8/LF. SHA-256: **e5a94e8054b8b83b4125547c94e64f23929b9dbb8e0a5acb07f84d39baf9222c**. **git apply --check -** ve **git apply --check --ignore-space-change -** exit0. HEAD'teki önceki rapordan v64 diff'i çıkarılarak **git apply --reverse --check --ignore-space-change -** ayrıca exit0 ile doğrulandı.

Proje kökünde kaynak değiştirmeden aynı artefakt kontrolleri:

```powershell
@'
from pathlib import Path
import re, subprocess
text = Path('AUDIO_EXCELLENCE_REPORT.md').read_text(encoding='utf-8')
blocks = re.findall(r'(?ms)^```diff\n(.*?)^```\s*$', text)
assert len(blocks) == 1
patch = blocks[0].encode('utf-8')
subprocess.run(['git','apply','--check','-'], input=patch, check=True)
subprocess.run(['git','apply','--check','--ignore-space-change','-'], input=patch, check=True)
previous = subprocess.check_output(['git','show','HEAD:AUDIO_EXCELLENCE_REPORT.md']).decode('utf-8')
v64 = re.findall(r'(?ms)^```diff\n(.*?)^```\s*$', previous)[0].encode('utf-8')
subprocess.run(['git','apply','--reverse','--check','--ignore-space-change','-'], input=v64, check=True)
print('V64 reverse / V65 strict / V65 ignore-space: PASS')
'@ | python -
```

Bu turda yama uygulanmadı. Daha sonra kaynaklara uygulandığında standart node scripts/verify-system.js sonucu **48/48** olmalıdır;46 disk v64'e aittir. Test sayısı tekrarlarla artırılmadı, eski başarı koşulları gevşetilmedi.

Son HEAD **a8b1bff** değişmedi;15 kaynak dosyasının ham SHA-256 değeri başlangıçla aynıdır. git status yalnız **M AUDIO_EXCELLENCE_REPORT.md** ile başlangıçtaki **D AUDIT_FIX_SUMMARY.md / D AUDIT_REPORT.md** durumlarını içerir. Kaynak stage/restore/commit/push/deploy yapılmadı. Unified diff boş bağlam satırlarının zorunlu tek boşluk öneki korunur; rapor whitespace kontrolü git -c core.whitespace=-blank-at-eol diff --check ile yapıldı.

<!-- SOURCE-HASHES {"server.js":"0131f656ea9971d97d3ea1fa1fee65ebc59ea3cc56c3d511e76cc428dd4a4868","scripts/verify-system.js":"2c35e8b884451d6abafc5669cdf9da57a0fd3384a9db720b95f7047d9aeb004b","public/ani-kitabi.html":"51bf40003fea301a1101383560089aff744c2ad15701bceddd8454eb14d5c631","public/dinle.html":"d882d3c598076c0df148d94ac7af1d35a99a04a78d44036772cb51252c67d3fc","public/index.html":"1c56d01b18c3ad2bc75ec14a0afb77eccbcdb68c9c3e379692b2542623c58a2e","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"c1ab801316cf10da21e4260d950863e7977e3b66fc612f76535c1ccdadddc723","public/panel.html":"d3cbac032d7bf24b80c668b2e1c6680d35206612a976c2ed28972cdc02ae6a23","public/pcm-capture-worklet.js":"30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a","public/pcm-player-worklet.js":"062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7","public/rehber.html":"c1bec91b5ddf2c9f06eb2f175a53560e7b2c6ed8142c1148b040b6aaf203528f","public/rota.html":"5e4babc197f0f6754d61108795c73dc1e5183da7c66fc507b5005736e5591350","public/sw.js":"6ed412581f8119c098b4f21d2ed8156b556eb6b147e56d610fe4366f8fc7742a","public/vercel-ws-shim.js":"d6ad3a16a5f32e998571144a3c45bbbdbf64a108fc1ea0cb39e1b2d992d14d04","public/yaka-karti.html":"d2809db42b2795e48603f1430c884fe578f79308e634091f45743ef559ee056c"} -->
