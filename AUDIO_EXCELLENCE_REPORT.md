# RıdvanSes v64 — v63 Uygulama, Medya Nesli ve Ses Sürekliliği Denetimi

Denetim tarihi: **9 Kasım 2026**. Kök: **D:/umresesliyazılım**. İncelenen disk HEAD: **aa2b5b7820a9a425ded03800a74ff4beaa7cf18d**. Yalnız bu rapor güncellenmiştir; aşağıdaki yama kaynaklara uygulanmamış, commit/push/deploy yapılmamıştır.

**Karar:** v63 yaması eksiksiz uygulanmış; gerçek disk doğrulaması **44/44 PASS, exit0**. Üç P2 ve bir P3 çalışma zamanı bulgusu doğrulandı. Bu nedenle **“SIFIR HATA — v63 %100 ONAYLI (PRODUCTION-READY)” sonucu verilemez**. Yeni P0/P1 doğrulanmadı; bu, bütün olası hataların yokluğu kanıtı değildir. Somut bulguların v64 çözümü, yeni ADIM-3.V64/ADIM-5.V64 ve tek uygulanabilir diff aşağıdadır. DSP çekirdeklerine yama gerekçesi bulunmadığından değiştirilmediler.

## 1. v63 uygulama doğrulaması

| Kontrol | Kanıt |
| --- | --- |
| Önceki rapordaki tek v63 diff'i | git apply --reverse --check --ignore-space-change -: **exit0**, stderr boş |
| v63 diff kimliği | 57.228 bayt; SHA-256 **b771acc404425bd42b9f034aba45f8aefc6c192b29b56322656b3bf3d84b663b** |
| Commit | 12 kaynak + rapor =13 dosya; git show --stat HEAD:846 ekleme/808 silme; HEAD aa2b5b7 |
| Disk testi | **node scripts/verify-system.js → 44 / 44 [BAŞARILI / PASS], exit0**, V53..V63 E2E ve Unit dahil |
| Çalışma ağacı başlangıcı | Yalnız AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md unstaged silinmiş; kaynak değişikliği yok |
| Capture/player | HEAD^→HEAD değişmemiş; bu turdaki v64 diff'inde de hedef değiller |

Capture ham SHA-256: **30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a**. Player: **062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7**. Başlangıç/son toplam15 kaynak hash'i ayrıca karşılaştırıldı.

### 1.1 İstenen 12 dosya ve v63 gereksinimleri

Tüm satırlar disk HEAD aa2b5b7'ye aittir; diff'in yeni satırları değildir.

| Dosya/alan | Gerçek satır ve değerlendirme |
| --- | --- |
| server.js kaynak reseti |481–485: kaynak değişince seq=null,ended=false,known=false; aynı kaynak idempotent. PASS. |
| server.js durum kabulü |476–479 ve1047–1072: rehber kontrolünde **strictly larger audioStateSeq** kabul edilir. Sunucuda aynı ordinal/ended=true istemci kontrolüyle yaratılmaz; terminal durum evaluateTourGuidePresence tarafından üretilir. Receiver'ın sözlükbilimsel (seq,ended) denetimiyle birlikte beklenen monotonluğu sağlar. Sunucudaki işlevi doğrudan çift karşılaştırıyor diye yanlış tanımlamıyoruz. |
| server.js miras/grace |679–734: Genel'den alt odaya known/seq/ended aktarılır;685,718 terminal stop'u kurar. removeClientFromRoom içindeki2500 ms grace korunur. PASS. |
| server.js GET ve şema |1734: q.audioSourceId DTO'ya aktarılır;1245–1282 ortak validator,1273 pozitif güvenli tamsayı seq denetimi.1664–1697 GET/POST requestSeq ortak. V63 gerçek GET/POST/handoff testi PASS. |
| vercel-ws-shim.js sayaç |87–92: globalThis sayacı replacement socket'ler arasında paylaşılır, minimum üstüne çıkar, güvenli tamsayı taşması reddedilir.700–701 guide kontrolüne seq ve ended=false atanır. PASS. |
| vercel-ws-shim.js MQTT paritesi |611–629 snapshot isLive/mode/known/seq/ended;824 stream-state seq. V63 Unit gerçek işlevlerden pariteyi doğrular. PASS; medya paketinin bu sürüme bağlanması ayrı açık. |
| vercel-ws-shim.js yeni relay |950–955: cache ordinal artırılır, eski guide kontrolleri batch'ten çıkarılır, state unshift ile ilk PCM önüne gelir. V63 E2E first PCM10/state14 PASS. Stop+resume sırasında önceden alınmış batch'in nesli hâlâ ayırt edilmiyor; P2-64-02. |
| dinle.html alıcı durumu |1180–1200: kaynak reseti ve (seq,ended) denetimi;1220 connect,1636 değişkenler,2573 leave reseti.1281–1291 known snapshot toparlanması;1317–1340 stream-state. Eski/eşit ordinal geri sarmaz. PASS; JSON ses kabulü1204–1215 ordinali denetlemez. |
| verify-system.js |585 E2E çağrısı;3054–3141 runStep5V63AudioChecks,3144–3222 runV63StateChecks;3238 Unit çağrısı.8 V63 Unit grubu, gerçek kontrol kaybı/snapshot, relay ilk PCM, GET/POST/handoff bayt eşliği PASS. |
| sw.js |4 cache ridvanses-pwa-v63;11 shim63;13 capture60-audio,14 player61-audio. PASS. |
| dinle/rehber/panel/index HTML |Shim satırları sırasıyla19/31/32/85: v=63. dinle:2637 SW63. PASS. |
| login/rota/ani-kitabi/yaka-karti HTML |Shim satırları13/12/10/11: v=63. PASS. |

v63 yamasının uygulanmış olması ile v63 testlerinin henüz kapsamamadığı kenar durumlarının bulunmaması farklı iddialardır. Aşağıdaki bulgular bu ikinci alanı genişletir.

## 2. Kanıtlı kalan bulgular

### P2-64-01 — Aynı kaynak yeniden açıldığında eski PCM/demo yeni yayına sızabiliyor

**Konum:** [server.js:471](D:/umresesliyazılım/server.js:471),1152–1185,1320–1356; [dinle.html:1204](D:/umresesliyazılım/public/dinle.html:1204),1369–1392; shim:125–130,743–760.

v63 audioStateSeq yalnız kontrol/snapshot sırasını belirler. audioSourceId aynı sayfa boyunca sabittir; PCM seq'si stop'ta sıfırlanan player kuyruğunda yeniden ankraj olabilir. Güncel isLive=true ve aynı sourceId, gecikmiş eski sesin güncel yakalama dönemine ait olduğunu kanıtlamaz. Eski demo notasının da medya nesli yoktur.

**Disk receiver probu:** aynı kaynak true10 → false11 → true12 → eski kontrol dönemine ait JSON PCM500. Son durum **audioStateSeq=12, player q=[500]**. Bir20 ms eski çerçeve yeniden kuyruğa girdi.

**Değişmemiş gerçek v63 sunucusunda negatif E2E:** resume sonrasında eski/eksik/gelecek nesil alanlı üç geç JSON enjekte edildi. HTTP ses sayısı **2→5**, player q=[500,499,498]; yeni test FAIL/exit1. Aynı probe v64'te **2→2, q=[]**. Bu60 ms ham PCM kabulüdür; fiziksel hoparlör kaydı yapılmadı.

**v64:** yeni pozitif tamsayı **audioMediaEpoch**. Start/stop/mod değişiminde ve sona ermiş taşımanın yeniden kurulmasında yeni nesil; aynı moddaki konu güncellemesinde aynı nesil. PCM/synth bu alanı taşır. Coalescer etiketi gecikmiş flush anında değil **çerçeve girerken** alır. Shim ve sunucu eski nesli reddeder; receiver JSON yolunda da doğrular. Yeni nesil, pending/worklet reseti ve rxAudioDeliveryEpoch artırımıyla eski Blob dönüşümünü geçersiz kılar. Salt metadata güncellemesi ses zaman çizelgesini resetlemez.

Ham binary972 B formatı değişmez. Native yol, aynı sokette sıralı kontrol+binary ve sahiplik çitini kullanır; sunucunun HTTP fallback JSON'u geçerli epoch ile etiketlenir. Aktif HTTP→native handoff aynı nesli korur. ACK açık terminal/stopped durum gösteriyorsa shim sonraki rehber senkronizasyonunda yeni nesil kurar ve yalnız hâlâ güncel taze pending medyayı ona taşır. Bu ayrım, aktif handoff'ta gereksiz rebuffer oluşturmaz.

### P2-64-02 — relay-open beklerken stop+resume, yerel eski batch'i yeniden canlandırıyor

**Konum:** [vercel-ws-shim.js:931](D:/umresesliyazılım/public/vercel-ws-shim.js:931),950–970.

batch, relay-open await'inden önce kuyruğun dışına alınır. v62/v63 stop işlemi ana kuyruğu/coalescer'ı temizlese de bu yerel diziyi temizleyemez. Bekleme sırasında stop ve tekrar start olursa son isLive=true ve sourceId aynı olduğundan eski batch yeniden “fresh” sayılır. İlk kontrolün öne alınmış olması bu problemi çözmez.

**Gerçek v63 _flushAndPoll + deferred fetch probu:** eski seq100 batch'te; açık1 → stop2 → açık3 sırasında open cevabı bekletildi. Cevap bırakıldığında gönderim **[state4(true), PCM100]** oldu. Bu bir varsayımsal sıra çizimi değil, disk işlevinin yürütülmüş çıktısıdır.

**v64:** yeniden ilan öncesi güncel capture epoch belirlenir. Eski epoch'taki yerel batch reddedilir. Güncel epoch'taki batch, _sendQueue ve coalescer frames yeni taşıma epoch'una birlikte taşınır; orijinal _queuedAt korunur, süre aşımı “yenilenmez”. Böylece stop öncesi medyaya yeni etiket basılmaz, güncel taze veri de gereksiz düşmez. Yeni epoch, sonraki ses yayımlanmadan önce MQTT stream-state ile ayrıca duyurulur; snapshot da aynı epoch'u taşır.

**V64 Unit:** eski100 ilk HTTP gövdesinde yok; güncel101 ve coalescer102 korunarak epoch4'e geçer; eski99 epoch1 kalır ve kabul filtresinde elenir. Native terminal ACK/aktif ACK için ayrı gerçek shim işlevi testinde sırasıyla yeni nesil/aynı nesil doğrulanır. HTTP requestSeq, audioStateSeq ve medya nesli birbirinin yerine kullanılmaz.

### P2-64-03 — HTTP-only demo notaları _queuedAt eksikliği nedeniyle düşüyor

**Konum:** [vercel-ws-shim.js:125](D:/umresesliyazılım/public/vercel-ws-shim.js:125),747–760,893–923,933–936,962–969; rehber.html:2065–2076.

Synth mesajı PCM doğrulayıcısına/coalescer'a girmez. MQTT yokken HTTP kuyruğuna alınır; fakat _enqueueRelayMessage yerel _queuedAt eklemez. Poll filtresi tüm audio-chunk kayıtlarında son200 ms zamanını arar. Sonuç: yalnız HTTP yolunda demo notası gönderilmez.

**Disk enqueue probu:** synth440 kuyruğa girdi, _queuedAt=null; poll yaş koşulu false. **Negatif mutasyon:** v64 adayı üzerinde yalnız zaman damgası düzeltmesi kaldırıldı. PCM'nin coalescer zamanını temsil eden alanı korundu; test HTTP-only synth880 aşamasına ulaştı ve **0 nota ≠ beklenen1**, FAIL/exit1 verdi. Böylece başarısızlık PCM kurulumuyla karıştırılmadı.

**v64:** audio-chunk için yalnız yerel enqueue zamanı verilmemişse Date.now atanır. Verilmiş eski zaman aynen korunur; geçmiş ses tazelenmez.200 ms TTL ve kuyruk üst sınırları korunur. Gerçek HTTP E2E'de synth880 native listener ve iki HTTP dinleyiciye ulaşır; eski epoch'taki440 ulaşmaz.

### P3-64-04 — Demo sırasında konu güncellemesi çalan notayı kesiyor

**Konum:** [dinle.html:1317](D:/umresesliyazılım/public/dinle.html:1317)–1340,2015–2047,2192–2220.

stream-state'in mic dışındaki her kabulü stopAllActiveSources çağırır. Demo modu ve medya aynı kaldığında bile yeni topic kontrolü, kalan360 ms'ye kadar notayı10 ms stop yoluna sokar.

**Disk işlevleriyle prob:** demo10, aktif nota, aynı demo modu/topic11 → **stop=1, harita0**. v64'te topic için **stop=0, nota korunur**; sonraki mic/epoch geçişinde stop=1 ve harita temizlenir. Unknown→known mic snapshot mevcut PCM'i korumaya devam eder; unknown→demo ise olası PCM kuyruğunu temizler. Legacy mod değişimleri de temizlikten geçer.

## 3. v64 protokolü, uyumluluk ve uygulama sırası

| Kimlik | Kapsam |
| --- | --- |
| PCM seq |20 ms çerçeve sırası, mod2^31; player duplicate/sıralama/PLC için |
| HTTP requestSeq |Tek opaque capability içindeki GET/POST istek gövdeleri; yeni capability'de yeniden başlar |
| audioStateSeq / ended |Aynı kaynak kontrol sırası ve sunucunun terminal stop tie-break'i; konu güncellemesinde de artabilir |
| audioMediaEpoch |Aynı ses üretim dönemi; konu güncellemesinde değişmez, stop/resume/mod/terminal taşıma yenilemesinde değişir |
| rxAudioDeliveryEpoch |Receiver'ın yerel async Blob/port teslim çiti; wire alanı değildir |

Epoch, güvenli pozitif tamsayı ve ilgili guide kontrol ordinalinden büyük olamaz. Epoch'lu kaynak için numarasız/eski epoch ile JSON medya veya kontrol downgrade'i reddedilir. Sunucu kaynak değişiminde epoch'u null yapar; Genel→alt oda aktarımı ve serializeRoom/handoff ACK birlikte taşır. Metadata-only rejoin aynı kaynağın neslini bozmaz.

Legacy hiç epoch kullanmamış kaynaklar çalışır. Ancak eski sekme/istemci kendi iç batch'ini etiketlemediği için aynı korumayı geriye dönük kazanamaz. **Backend + shim + dinle + HTML/SW64 birlikte yükseltilmeli.** Eski ve yeni bileşenlerin rastgele karışımına aynı koruma onayı verilmez. Legacy desteği, epoch'lu aynı kaynak için sessiz downgrade değildir.

12 hedef: server.js, scripts/verify-system.js, shim, dinle, sw ve shim kullanan diğer7 HTML. Capture/player dosyaları aynıdır; **cache/shim64, player61-audio, capture60-audio**. Dinle SW64. Eski sekmeler SW aktivasyonuyla otomatik olarak yeni JavaScript'e dönüşmez. Yama bu turda uygulanmadı.

## 4. DSP ve uçtan uca derin denetim

| Katman | İnceleme ve sonuç |
| --- | --- |
| Mikrofon/graph | rehber.html:1508–1765,1803–2030. gUM, module/import, fallback, cihaz değişimi/heal, preview, stop/restart sahiplik çitleri korunmuş. V60'ın17 yaşam döngüsü grubu PASS. Rehberin709,1164,1937,2025,2056,2084 kontrolleri açık mode taşıyor; konu güncellemesi1160–1171. V64 yalnız shim sürüm URL'sini değiştirir. |
| Capture DSP | pcm-capture-worklet.js:10–50,53–150,152–220,223–258.193-tap×256 faz FIR, DC blocker,4 bant expander,480 örnek/20 ms frame.8/16/24/44.1/48 kHz giriş testleri ve parça sınırlarında süreklilik PASS. Eski3072 örnek tamponu yok. |
| Gate/comfort |10 ms lookahead,400 ms kalibrasyon,4 s minima, varsayılan7.5 dB açma/4 dB hysteresis,240 ms hold,3 ms attack/120 ms release. Kapalı kazanç0.126≈-18 dB. Comfort3 ms gecikme,600 ms quiet eşiği/80 ms fade/2 ms açılma. ContinuousSpeech yumuşak heceleri koruma lehine çevreyi de geçirebilir. |
| Frame/taşıma |12 B header+960 B PCM=972 B; phrase biti+mod2^31 seq.50 paket/s. JSON/base64 ve MQTT coalescer1–3 bağımsız frame;40 ms timer/120 ms coalescer yaş sınırı. Yeni epoch her frame'e yakalama kuyruğuna girişte bağlanır. |
| Server/backpressure | server.js:433–449. Binary soft9720 B, JSON16000 B, hard65536 B veya2 s devam eden tıkanma izolasyonu.300 aynıIP join/301 WS,270 sağlam/30 duraklatılmış fixture korunur. Eski sesi düşürmek diğerlerini korur; sonsuz gecikmesiz tam kelime koruması değildir. |
| HTTP/handoff | Capability35 s aktiflik sınırı, cleanup;3 s prepare expiry, atomic no-await commit, digest/revision ve eski oturum409 çitleri mevcut. GET anahtarı X-Rys-Relay-Key; source DTO/schema paritesi v63 testinde PASS.100 ms short-poll/3 s abort; server audio10/200 ms+control64, shim audio4 batch/200 ms+control64. |
| Receiver | Socket kimliği, rxLoadToken/context, pending en çok13 frame/260 ms, AudioContext resume/rebuild, epoch/Blob resetleri korunur. Port FIFO resetten önceki push'ları sınırlar. Yeni epoch kabulü player'a girmeden uygulanır; worklet wire şeması değiştirilmez. |
| Player | pcm-player-worklet.js:12–27,98–187,190–234,253–338.8/16 kHz gerçek çıkışta193-tap FIR ardından sürekli Hermite; >=24 kHz'de downsample FIR yok.±1000 ppm ASRC saat farkı için;5 ms de-click tail,72 örnek/3 ms recovery blend. |
| Jitter/PLC | Başlangıç120 ms, uyarlanmış80–260 ms; en az bir paket varsa300 ms başlangıç eşiği. İlk60 ms pitch PLC, uzun kayıpta sönüm;300 ms starvation rebuffer. Hedef+120 ms üzerinde500 ms backlog catch-up;>32 kuyruk24'e iner. Kayıp konuşma geri üretilemez. |
| Bellek/temizlik | Sabit ring/FIR tabloları ve sınırlı frame kuyrukları; eski mic/preview/heal callback kaynak bırakma testleri, demo map4 nota/suspended durumda düğüm0, stop10 ms audio-time/onended disconnect PASS. Yeni nesil ek bir ses arşivi veya büyüyen kaynak haritası oluşturmaz. |
| SW/arka plan | sw.js:51–78 API/WS/auth rotalarını cache'lemez; diğer GET'ler network-first. Cache sürümü tek başına kilit ekranında işlem garantisi değildir. |

### 4.1 Beş hızdaki sayısal DSP kanıtı

| Çıkış Hz | firstAfterReset | firstAfterStarvation | DC fixture iç maxStep |
| --- | --- | --- | --- |
|8000|0|0|0.130492|
|16000|0|0|0.145227|
|24000|0|0|0.002640|
|44100|0|0|0.001428|
|48000|0|0|0.001314|

Düşük hızdaki FIR geçici rejiminin iç maxStep değeri, ilk örnek hatasıyla aynı ölçüm değildir; “sıfır fiziksel cızırtı” diye yorumlanmaz. Player alias reddi8 kHz çıkışta4080/4800/6000 Hz tonları için -76.56/-107.60/-114.02 dB;16 kHz çıkışta8160/9600/10000 Hz için -97.45/-115.88/-127.11 dB. Capture8/16/44.1/48 kHz iki saniyede100 frame; |DC mean|<=1.82e-10; ilgili stopband fixture -95.9/-95.9/-129.7/-107.3 dB.24 kHz girişte ayrıca100 frame.200 Hz süreklilik maxStep0.007356, örnek PLC probe concealedSamples960. Rakamlar belirli test tonlarıdır, bütün spektruma tek sınır değildir.

FIR capture grup gecikmesi96/girişHızı:8/16/24/44.1/48 kHz için12/6/4/2.18/2 ms.10 ms gate lookahead,3 ms comfort delay,0–20 ms frameleme, player başlangıç120 ms ve düşük çıkışta4 ms FIR eklenir. Ağ/coalescer/HTTP ve fiziksel cihaz gecikmesi ayrıca vardır.5 ms reset tail'i daha önce çalınan sinyali yumuşak kapatır; bu, reddedilmesi gereken eski paketin yeniden kabulü değildir.

### 4.2 Saha ve mimari sınırlar

300 native dinleyicide972×50×300=14.580.000 B/s=**116.64 Mbit/s** ham sunucu çıkışı, WS/TLS/TCP/IP hariç. Base64 PCM tabanı1280×50×300=19.200.000 B/s=**153.6 Mbit/s**, JSON hariç.300 HTTP dinleyicide100 ms poll yaklaşık3000 istek/s. Bu turda300 fiziksel telefon/300 kesintisiz HTTP ses abonesi, roaming, VDS NIC/TLS CPU kapasitesi ölçülmedi. Tek process RAM relay oturumları farklı Vercel instance'ları arasında ortak değildir; tek relay otoritesi veya ortak state gereksinimi sürer.

Public MQTT imzası istemcide bilinen sabittir; oda ACL'si veya güvenilir yayıncı doğrulaması değildir. V64 aynı seçili kaynağın medya neslini bağlar; farklı kaynak UUID'leri arasında global otorite seçimini çözmez. Genel/dedicated dönüşü eski UUID'yi yeniden meşru kılabildiğinden kalıcı UUID kara listesi doğru çözüm olmaz. Broker güveni/otoritesi ve çoklu instance tasarımı kapanmadan bütün taşıma yollarına tam üretim sertifikası verilmez. Broker yolları gerçek shim işlevleriyle VM'de sürüldü; gerçek public broker ağına bağlanılmadı.

Mono mikrofonda rehber/yan konuşmacı aynı zaman-frekans alanını paylaşır; expander yüzde100 ayırma yapmaz. Mikrofonun ağza yakınlığı SNR için önemlidir. BroadcastChannel ayrı telefon hoparlörünün gecikmeli akustik referansı değildir. echoCancellation:true istemi50–400 ms çapraz cihaz yankısını otomatik iptal garantisi vermez. [W3C Media Capture AEC tanımı](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-echocancellation).

OS alarm/arama/ekran kilidinde bağlamı askıya alabilir; currentTime ve worklet işlenmesi durur. Resume/rebuild kaybolan konuşmayı geri getirmez. Worklet kurulamazsa receiver'da etkin eski scheduler fallback'i yok; iOS/Android ve HFP/SCO rota/gesture matrisi fiziksel cihazlarla doğrulanmalı. [Web Audio suspend davranışı](https://www.w3.org/TR/webaudio/#dom-audiocontext-suspend). bufferedAmount uçtan uca teslim/oynatma gecikmesi değildir. [WHATWG WebSocket bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount).

## 5. Test düzeni ve tek v64 unified diff

Yeni **ADIM-3.V64** gerçek localhost HTTP/WS sunucusunda HTTP-only PCM/synth, Genel/alt oda alımı, eski/eksik/gelecek medya nesli, MQTT paket genişletmesi, grace stop/relay yenilemesi, native handoff/binary fallback, topic sürekliliği ve stale Blob'u sınar. Public MQTT teslimi ağ bağlantısı yerine gerçek _deliverIncomingMessage işleviyle sürülür. Gerçek capture→native/HTTP→player zinciri önceki V60 E2E'de korunur.

**ADIM-5.V64 dokuz grup:** semantic epoch/topic; coalescer giriş etiketi; receiver PCM/synth/Blob/reset; server/schema/downgrade; stop+resume sırasında deferred relay-open ve güncel pending'in korunumu; Genel-alt oda mirası; HTTP-only synth TTL/expiry; terminal native ACK ile aktif handoff ayrımı; demo topic/mod nota ömrü. Önceki V53..V63 assertion'ları korunur; yalnız ortak fixture'a rxAudioMediaEpoch başlangıcı ve cache64 beklentileri eklenir.

Standart toplam **46** olur. Prova, bu dosyadaki **tek diff bloğunu** disk bağlam satırlarıyla birebir eşleştirerek bellekte yeniden kurar. fs.readFileSync/module compile aday kaynaklara yönlendirilir; JS syntax ve HTML inline script kontrolü aday metinlerde yapılır. Verifier'ın raporu kaynak gibi okuması engellenir. Gerçek localhost ağ/server kodu yürütülür; tarayıcı/AudioWorklet VM ile modellenir. Testin runtime.json snapshot/restore davranışı kullanılır. Kaynaklar v64 yapılmış gibi gösterilmez; yalnız bellek adayına ait sonuç ayrı yazılır.

Aşağıdaki UTF-8/LF yama hem git apply --check - hem git apply --check --ignore-space-change - ile kontrol edilir. Bu turda uygulama yapılmamıştır.

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -422,6 +422,7 @@
     audioSourceId:room.audioSourceId||null,
     audioStateKnown:!!room.audioStateKnown,
     audioStateSeq:room.audioStateSeq||null,audioStateEnded:!!room.audioStateEnded,
+    audioMediaEpoch:room.audioMediaEpoch||null,
     guideLocation: room.guideLocation || null,
     connectedPilgrims: pilgrims,
     connectedGuides: guides,
@@ -468,19 +469,25 @@
 }
 
 // v61: source identity is control metadata; the 972-byte PCM wire format is unchanged.
-function acceptRysAudio(room,sender,clientId,synth=false){
+function acceptRysAudio(room,sender,clientId,synth=false,message=null){
   const sameSource=room.audioSourceId===(sender.audioSourceId||clientId);
-  return !(sameSource&&room.audioStateKnown&&(!room.isLive||!synth&&String(room.broadcastMode||'').startsWith('demo')));
+  if(sameSource&&room.audioStateKnown&&(!room.isLive||!synth&&String(room.broadcastMode||'').startsWith('demo')))return false;
+  // Raw binary uses the ordered native socket; JSON must name the active media epoch.
+  if(message&&sameSource&&Number.isSafeInteger(room.audioMediaEpoch)&&message.audioMediaEpoch!==room.audioMediaEpoch)return false;
+  return true;
 }
 
 function acceptRysAudioState(room,sender,clientId,message){
+  const epoch=message.audioMediaEpoch;
+  if(epoch!=null&&(!Number.isSafeInteger(epoch)||epoch<1||!Number.isSafeInteger(message.audioStateSeq)||epoch>message.audioStateSeq))return false;
   if(room.audioSourceId!==(sender.audioSourceId||clientId)||!Number.isSafeInteger(room.audioStateSeq))return true;
-  return Number.isSafeInteger(message.audioStateSeq)&&message.audioStateSeq>room.audioStateSeq;
+  if(!Number.isSafeInteger(message.audioStateSeq)||message.audioStateSeq<=room.audioStateSeq)return false;
+  return !Number.isSafeInteger(room.audioMediaEpoch)||(Number.isSafeInteger(epoch)&&epoch>=room.audioMediaEpoch);
 }
 
 function setRysAudioSource(room,sourceId){
   if(room.audioSourceId===sourceId)return;
-  room.audioSourceId=sourceId;room.audioStateKnown=false;room.audioStateSeq=null;room.audioStateEnded=false;
+  room.audioSourceId=sourceId;room.audioStateKnown=false;room.audioStateSeq=null;room.audioStateEnded=false;room.audioMediaEpoch=null;
   broadcastToRoom(room,{type:'audio-source',audioSourceId:sourceId});
 }
 
@@ -702,6 +709,7 @@
       setRysAudioSource(r,genelRoom.audioSourceId||null);
       r.audioStateKnown=!!genelRoom.audioStateKnown;
       r.audioStateSeq=genelRoom.audioStateSeq||null;r.audioStateEnded=!!genelRoom.audioStateEnded;
+      r.audioMediaEpoch=genelRoom.audioMediaEpoch||null;
       broadcastToRoom(r, {
         type: 'stream-state',
         isLive: r.isLive,
@@ -709,7 +717,7 @@
         currentTopic: r.currentTopic,
         guidePeerId: r.guidePeerId || null,
         audioSourceId:r.audioSourceId||null,
-        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
+        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded,audioMediaEpoch:r.audioMediaEpoch||null
       });
       continue;
     }
@@ -728,7 +736,7 @@
         currentTopic: r.currentTopic,
         guidePeerId: r.guidePeerId || null,
         audioSourceId:r.audioSourceId||null,
-        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
+        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded,audioMediaEpoch:r.audioMediaEpoch||null
       });
     }
   }
@@ -1049,7 +1057,7 @@
       for (const r of getTargetBroadcastRooms(currentRoom)) {
         const wasLive = r.isLive;
         setRysAudioSource(r,sender.audioSourceId||clientId);r.audioStateKnown=true;
-        r.audioStateSeq=msg.audioStateSeq||null;r.audioStateEnded=false;
+        r.audioStateSeq=msg.audioStateSeq||null;r.audioStateEnded=false;r.audioMediaEpoch=msg.audioMediaEpoch||null;
         r.isLive = Boolean(msg.isLive);
         r.broadcastMode = msg.broadcastMode || (r.isLive ? 'mic' : 'idle');
         if (msg.topic) r.currentTopic = msg.topic;
@@ -1068,7 +1076,7 @@
           currentTopic: r.currentTopic,
           guidePeerId: r.guidePeerId || null,
         audioSourceId:r.audioSourceId||null,
-        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
+        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded,audioMediaEpoch:r.audioMediaEpoch||null
         });
       }
       broadcastToFamilyTrackers(currentRoom.tourCode, {
@@ -1160,7 +1168,7 @@
       ) {
         break;
       }
-      if(!acceptRysAudio(currentRoom,sender,clientId,!!msg.synthNote))break;
+      if(!acceptRysAudio(currentRoom,sender,clientId,!!msg.synthNote,msg))break;
       if(msg.audioSourceId&&msg.audioSourceId!==(sender.audioSourceId||clientId))break;
       currentRoom.activePublisherClientId = clientId;
       const serializedAudio = JSON.stringify({
@@ -1170,6 +1178,7 @@
         phraseStart: Boolean(msg.phraseStart),
         speakerId: clientId,
         audioSourceId:sender.audioSourceId||clientId,
+        audioMediaEpoch:msg.audioMediaEpoch??null,
         speakerName: sender.name,
         speakerRole: sender.role,
         sampleRate: msg.sampleRate || 24000,
@@ -1263,6 +1272,8 @@
         if(!Number.isFinite(value))return false;
       }else if(typeof value==='boolean')continue;
       else if(typeof value==='object'){
+        if(value.type==='guide-stream-state'&&value.audioMediaEpoch!=null&&
+          (!Number.isSafeInteger(value.audioStateSeq)||value.audioMediaEpoch>value.audioStateSeq))return false;
         const keys=Object.keys(value);if(keys.length>512)return false;
         for(const key of keys){
           characters+=key.length;
@@ -1270,7 +1281,7 @@
           const next=value[key];
           if(next===undefined)continue; // Internal GET DTOs may contain omitted optional fields.
           if(strings.has(key)&&next!==null&&typeof next!=='string')return false;
-          if(key==='audioStateSeq'&&next!==null&&(!Number.isSafeInteger(next)||next<1))return false;
+          if((key==='audioStateSeq'||key==='audioMediaEpoch')&&next!==null&&(!Number.isSafeInteger(next)||next<1))return false;
           if(key==='audioSourceId'&&next!==null&&(typeof next!=='string'||next.length>128||
             !(/^[a-zA-Z0-9_.-]*$/).test(next)))return false;
           pending.push({value:next,depth:depth+1});
@@ -1343,6 +1354,7 @@
                 phraseStart,
                 speakerId: ctx.clientId,
                 audioSourceId:sender.audioSourceId||ctx.clientId,
+                audioMediaEpoch:ctx.currentRoom.audioMediaEpoch||null,
                 speakerName: sender.name,
                 speakerRole: sender.role,
                 sampleRate: 24000,
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -583,6 +583,7 @@
   await runV61SessionChecks({baseUrl,url:wsUrl,token:authToken});
   await runV62StopChecks({baseUrl,url:wsUrl,token:authToken});
   await runV63StateChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV64MediaChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1534,9 +1535,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v63"));assert(sw.includes('/vercel-ws-shim.js?v=63'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v64"));assert(sw.includes('/vercel-ws-shim.js?v=64'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'63',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'64',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2501,7 +2502,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v63'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2593,7 +2594,7 @@
   const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='roomSelect'?'genel':'6061',style:{},classList:{remove(){},add(){},contains(){return true;}}});return elements.get(id);};
   const noop=()=>{};
   const g={WebSocket:SocketClass||FakeSocket,ws:null,intentionalLeave:false,isAudioListening:true,
-    currentTour:{code:'A'},currentLang:'tr',pilgrimDeviceId:'v61-device',pendingRxFrames:[],rxAudioDeliveryEpoch:0,rxAudioSourceId:null,rxStreamActive:null,rxStreamMode:null,rxAudioStateSeq:null,rxAudioStateEnded:false,
+    currentTour:{code:'A'},currentLang:'tr',pilgrimDeviceId:'v61-device',pendingRxFrames:[],rxAudioDeliveryEpoch:0,rxAudioSourceId:null,rxStreamActive:null,rxStreamMode:null,rxAudioStateSeq:null,rxAudioStateEnded:false,rxAudioMediaEpoch:null,
     rxPlayerWorkletNode:{port:{postMessage:m=>{if(m.type==='reset')player._reset();else if(m.type==='push')player._push(m);}}},
     audioCtx:{state:'running',currentTime:1,resume:async()=>{}},activeGuideDemoSources:new Map(),activeScheduledSources:[],nextAudioTime:0,lastHwEndSample:0,rxHermiteHist:null,rxHermitePos:0,
     lastReceivedAudioSeq:0,lastPacketReceivedAt:0,lastRawChunkAt:0,lastPacketReceivedAt:0,rxFallbackSubSeq:0,
@@ -2711,7 +2712,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v63'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2950,7 +2951,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v63'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3135,7 +3136,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v63'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3219,6 +3220,195 @@
   }
 }
 
+async function runStep5V64AudioChecks(){
+  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const shim=read('public/vercel-ws-shim.js'),listener=read('public/dinle.html'),server=read('server.js'),checks=[];
+  function pick(source,name,kind='function'){
+    const m=new RegExp('^[ \\t]*'+(kind==='function'?'(?:async )?function '+name:kind==='class'?'class '+name+'\\b':'(?:async )?'+name)+'(?:\\([^\\n]*\\))?\\s*\\{','m').exec(source);assert(m,'V64 missing '+name);
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const s=source.slice(m.index,end+1);try{new vm.Script(kind==='method'?'class P{'+s+'}':s);return s;}catch(e){if(e.name!=='SyntaxError')throw e;}}
+    throw Error('V64 unterminated '+name);
+  }
+  const audio=(seq,epoch)=>({type:'audio-chunk',_queuedAt:Date.now(),seq,audioSourceId:'page-s',audioMediaEpoch:epoch,sentAt:Date.now(),sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64'),level:.5});
+  const state=(seq,epoch,live=true,mode='mic')=>({type:'stream-state',audioSourceId:'page-s',audioStateSeq:seq,audioMediaEpoch:epoch,isLive:live,broadcastMode:live?mode:'idle'});
+  {
+    const sent=[],g={Date,Math,ArrayBuffer};vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\n'+pick(shim,'validRysAudio')+'\nclass P{'+pick(shim,'send','method')+'}\nglobalThis.P=P;',g);
+    const p=new g.P();Object.assign(p,{_isRelay:false,_sendQueue:[],_joinContext:{role:'guide',audioSourceId:'page-s'},_native:{readyState:1,send:raw=>sent.push(JSON.parse(raw))}});
+    const control=(live,mode='mic')=>p.send(JSON.stringify({type:'guide-stream-state',isLive:live,broadcastMode:live?mode:'idle'}));
+    control(true);control(true);control(false);control(true);assert.deepEqual(sent.map(m=>m.audioMediaEpoch),[1,1,3,4]);assert.deepEqual(sent.map(m=>m.audioStateSeq),[1,2,3,4]);
+    p.send(JSON.stringify({type:'audio-chunk',frames:[audio(500,1),audio(501,4)]}));assert.deepEqual(Array.from(sent.at(-1).frames,f=>f.seq),[501]);
+    control(true,'demo-synth');const count=sent.length;p.send(JSON.stringify({type:'audio-chunk',synthNote:440,audioMediaEpoch:1}));assert.equal(sent.length,count);
+    p.send(JSON.stringify({type:'audio-chunk',synthNote:880}));assert.equal(sent.at(-1).audioMediaEpoch,5);checks.push('semantic-epoch-topic-continuity-and-sender-PCM-synth-admission');
+  }
+  {
+    const output=[],jobs=[],g={Date,Math,Number,setTimeout:fn=>{jobs.push(fn);return jobs.length;},clearTimeout(){}};vm.createContext(g);
+    vm.runInContext(['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n')+'\n'+pick(shim,'RysAudioCoalescer','class'),g);
+    const sock={_isRelay:true,_joinContext:{audioSourceId:'page-s'},_lastGuideState:{audioMediaEpoch:10},send:raw=>output.push(JSON.parse(raw)),close(){}};
+    g.installRysCoalescing(sock);const m=audio(1,undefined);sock.send(JSON.stringify(m));assert.equal(sock._audioCoalescer.frames[0].audioMediaEpoch,10);
+    sock._lastGuideState.audioMediaEpoch=12;jobs.at(-1)();assert.equal(output[0].frames[0].audioMediaEpoch,10);checks.push('coalescer-tags-capture-epoch-before-delayed-flush');
+  }
+  {
+    const h=createV61ListenerHarness(listener,read('public/pcm-player-worklet.js')),s=h.connect(),deliver=m=>s.onmessage({data:JSON.stringify(m)});
+    deliver(state(10,10));deliver(audio(500,10));assert(h.player.q.has(500));const before=h.g.rxAudioDeliveryEpoch;
+    deliver(state(11,10));assert(h.player.q.has(500));assert.equal(h.g.rxAudioDeliveryEpoch,before);
+    deliver(state(12,12,false));deliver(state(13,13));deliver(audio(500,10));deliver(audio(501,undefined));assert.equal(h.player.q.size,0);
+    deliver(audio(502,13));assert(h.player.q.has(502));const blob=new h.DeferredBlob();s.onmessage({data:blob});
+    deliver(state(14,14));assert.equal(h.player.q.size,0);blob.resolve(h.packet(503));await h.tick();assert.equal(h.player.q.size,0);
+    deliver(state(15,14));deliver(audio(504,14));assert(h.player.q.has(504));deliver({...state(16,null)});assert.equal(h.g.rxAudioStateSeq,15);
+    deliver(state(17,14,true,'demo-synth'));let notes=0;h.g.playGentleHarmonyNote=()=>notes++;
+    deliver({type:'audio-chunk',audioSourceId:'page-s',audioMediaEpoch:13,synthNote:440});assert.equal(notes,0);
+    deliver({type:'audio-chunk',audioSourceId:'page-s',audioMediaEpoch:14,synthNote:880});assert.equal(notes,1);
+    h.g.leaveRoom();assert.equal(h.g.rxAudioMediaEpoch,null);const legacy=h.connect();legacy.onmessage({data:JSON.stringify(audio(1,undefined))});assert(h.player.q.has(1));
+    checks.push('receiver-stop-resume-old-JSON-missing-tag-demo-Blob-and-epoch-reset');
+  }
+  {
+    const g={broadcastToRoom(){}};vm.createContext(g);vm.runInContext(['acceptRysAudio','acceptRysAudioState','setRysAudioSource','isRysClientMessage'].map(n=>pick(server,n)).join('\n'),g);
+    const room={audioSourceId:'page-s',audioStateKnown:true,isLive:true,broadcastMode:'mic',audioStateSeq:13,audioMediaEpoch:13},sender={audioSourceId:'page-s'};
+    assert(!g.acceptRysAudio(room,sender,'c',false,audio(1,10)));assert(!g.acceptRysAudio(room,sender,'c',false,audio(1,undefined)));
+    assert(g.acceptRysAudio(room,sender,'c',false,audio(1,13)));assert(g.acceptRysAudio(room,sender,'c'));
+    assert(!g.acceptRysAudioState(room,sender,'c',{audioStateSeq:14}));assert(!g.acceptRysAudioState(room,sender,'c',{audioStateSeq:14,audioMediaEpoch:12}));assert(g.acceptRysAudioState(room,sender,'c',{audioStateSeq:14,audioMediaEpoch:13}));
+    assert(g.isRysClientMessage({type:'guide-stream-state',audioStateSeq:14,audioMediaEpoch:13}));
+    for(const epoch of [0,-1,1.5,'13',[],Number.MAX_SAFE_INTEGER+1])assert(!g.isRysClientMessage({type:'audio-chunk',audioMediaEpoch:epoch}));
+    assert(!g.isRysClientMessage({type:'guide-stream-state',audioStateSeq:14,audioMediaEpoch:15}));g.setRysAudioSource(room,'new');assert.equal(room.audioMediaEpoch,null);
+    checks.push('server-JSON-admission-implicit-native-downgrade-and-schema');
+  }
+  {
+    let resolveOpen;const bodies=[],published=[],g={Date,Math,Number,ArrayBuffer,window:{ryGetDynamicChannelId:()=> 'channel'},localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},queueMicrotask(){},
+      AbortController:class{constructor(){this.signal={};}abort(){}},fetch:async(u,o)=>{const b=JSON.parse(o.body);bodies.push(b);if(b.type==='relay-open')return new Promise(r=>resolveOpen=r);return {ok:true,json:async()=>({messages:[]})};}};
+    vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\n'+pick(shim,'validRysAudio')+'\nclass P{'+['send','_enqueueRelayMessage','_flushAndPoll'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=P;',g);
+    const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:true,_httpEpoch:0,_sendQueue:[],_joinContext:{type:'join',role:'guide',audioSourceId:'page-s'},_relayRoutingKey:()=> 'route',_publishMqtt:m=>published.push(m),_broadcastP2PRoomState(){},_busConnected:()=>false,_deliverIncomingMessage(){}});
+    p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));p.send(JSON.stringify(audio(100,1)));p._sendQueue=p._sendQueue.filter(m=>m.type==='audio-chunk');p._inFlight=false;
+    const flight=p._flushAndPoll();p.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));p.send(JSON.stringify(audio(101,3)));
+    p._audioCoalescer={frames:[audio(102,3),audio(99,1)]};resolveOpen({ok:true,json:async()=>({clientId:'rys56-renewed',relayKey:'a'.repeat(48)})});await flight;
+    const first=bodies.at(-1).messages;assert.deepEqual(first.map(m=>m.type),['guide-stream-state']);assert.equal(first[0].audioMediaEpoch,4);assert(published.some(m=>m.type==='stream-state'&&m.audioStateSeq===4&&m.audioMediaEpoch===4));
+    assert.equal(p._sendQueue.find(m=>m.seq===101).audioMediaEpoch,4);assert.deepEqual(Array.from(p._audioCoalescer.frames,m=>m.audioMediaEpoch),[4,1]);
+    await p._flushAndPoll();assert.deepEqual(bodies.at(-1).messages.filter(m=>m.type==='audio-chunk').map(m=>m.seq),[101]);assert.equal(bodies.at(-1).messages.find(m=>m.seq===101).audioMediaEpoch,4);
+    checks.push('stop-resume-during-open-drops-captured-old-and-rebases-current-pending-media');
+  }
+  {
+    const general={roomId:'genel',clients:new Map([['g',{role:'guide'}]]),isLive:true,broadcastMode:'mic',audioSourceId:'page-s',audioStateKnown:true,audioStateSeq:11,audioMediaEpoch:10},sub={roomId:'siyer',clients:new Map(),isLive:false};
+    const g={getOrCreateRoom:()=>general,getTourRooms:()=>[general,sub],broadcastToRoom(){},broadcastToFamilyTrackers(){}};vm.createContext(g);
+    vm.runInContext(pick(server,'setRysAudioSource')+'\n'+pick(server,'evaluateTourGuidePresence'),g);g.evaluateTourGuidePresence('T');assert.equal(sub.audioMediaEpoch,10);
+    general.clients.clear();g.evaluateTourGuidePresence('T');assert.equal(sub.audioMediaEpoch,10);assert.equal(sub.audioStateEnded,true);checks.push('general-subroom-inherits-media-epoch-through-terminal-stop');
+  }
+  {
+    let now=100;const g={Date:class extends Date{static now(){return now;}},Number};vm.createContext(g);
+    vm.runInContext('class P{'+pick(shim,'_enqueueRelayMessage','method')+'}\nglobalThis.P=P;',g);const p=new g.P();p._sendQueue=[];
+    p._enqueueRelayMessage({type:'audio-chunk',synthNote:880});assert.equal(p._sendQueue[0]._queuedAt,100);
+    now=301;p._enqueueRelayMessage({type:'ping'});assert(!p._sendQueue.some(m=>m.synthNote));
+    p._enqueueRelayMessage({type:'audio-chunk',synthNote:440,_queuedAt:0});assert.equal(p._sendQueue.at(-1)._queuedAt,0);
+    checks.push('non-coalesced-demo-gets-local-TTL-and-expired-media-is-not-restamped');
+  }
+  {
+    for(const terminal of [false,true]){
+      const probes=[],g={Date,Math,ArrayBuffer,window:{},setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:()=>''}};
+      class Native{constructor(){this.readyState=1;this.sent=[];probes.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(){}}
+      g.NativeWebSocket=Native;vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\n'+pick(shim,'validRysAudio')+'\nclass P{'+['send','_tryNativeFailback'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=P;',g);
+      const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,url:'ws://local/ws',_transportGeneration:0,_joinContext:{type:'join',role:'guide',tourCode:'T',roomId:'genel',audioSourceId:'page-s'},
+        _relayClientId:'rys56-old',_relayKey:'a'.repeat(48),_lastGuideState:{type:'guide-stream-state',isLive:true,broadcastMode:'mic',audioStateSeq:5,audioMediaEpoch:5},
+        _sendQueue:[{...audio(81,5),_queuedAt:Date.now()}],_audioCoalescer:{frames:[audio(82,5)],flush(){}},_closeMqttClients(){},_resetRelaySession(){this._relayClientId=null;this._relayKey=null;}});
+      p.onopen=()=>p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));p._tryNativeFailback();const probe=probes[0];probe.onopen();
+      const id='a'.repeat(32);probe.onmessage({data:JSON.stringify({type:'handoff-prepared',handoffId:id})});
+      probe.onmessage({data:JSON.stringify({type:'handoff-committed',handoffId:id,ack:{type:'joined',room:{tourCode:'T',roomId:'genel',audioStateKnown:true,isLive:!terminal,audioStateEnded:terminal,audioMediaEpoch:5}}})});
+      const expected=terminal?6:5;assert.equal(p._lastGuideState.audioMediaEpoch,expected);assert.equal(p._audioCoalescer.frames[0].audioMediaEpoch,expected);
+      assert.equal(probe.sent.find(m=>m.type==='audio-chunk').audioMediaEpoch,expected);assert.equal(p._isRelay,false);
+    }
+    checks.push('native-failback-terminal-ACK-renews-epoch-active-handoff-preserves-it');
+  }
+  {
+    const h=createV61ListenerHarness(listener,read('public/pcm-player-worklet.js')),s=h.connect(),deliver=m=>s.onmessage({data:JSON.stringify(m)});let stopped=0;
+    deliver(state(10,10,true,'demo-synth'));
+    const osc={context:h.g.audioCtx,stop(){stopped++;},disconnect(){}},env={gain:{cancelAndHoldAtTime(){},setTargetAtTime(){}},disconnect(){}};
+    h.g.activeGuideDemoSources.set(osc,env);deliver({...state(11,10,true,'demo-synth'),currentTopic:'new topic'});
+    assert.equal(stopped,0);assert.equal(h.g.activeGuideDemoSources.size,1);
+    deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
+    checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
+  }
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v64'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
+  recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
+}
+
+async function runV64MediaChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),code='RY-V64-'+Date.now().toString(36).toUpperCase();
+  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token},caps=[],sockets=[],controls=[],jsonAudio=[],httpFrames=[],subFrames=[],published=[],errors=[];let h,p,created=false;
+  const until=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error('V64 deadline '+label+' '+JSON.stringify({source:h?.g.rxAudioSourceId,state:h?.g.rxAudioStateSeq,epoch:h?.g.rxAudioMediaEpoch,live:h?.g.rxStreamActive,q:h?Array.from(h.player.q.keys()):[]}));await new Promise(r=>setTimeout(r,5));}};
+  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200,'V64 relay '+body.type);return r.json();};
+  const open=async()=>{const r=await post({type:'relay-open',version:56}),cap={clientId:r.clientId,relayKey:r.relayKey};caps.push(cap);return cap;};
+  const pcm=Buffer.alloc(960);for(let i=0;i<480;i++)pcm.writeInt16LE(3456,2*i);
+  const audio=(seq,epoch)=>({type:'audio-chunk',_queuedAt:Date.now(),audioSourceId:'page-media',audioMediaEpoch:epoch,seq,sentAt:Date.now(),sampleRate:24000,pcm16:pcm.toString('base64'),level:.5});
+  class Bridge{static OPEN=1;static CONNECTING=0;static CLOSED=3;
+    constructor(address){this.real=new WebSocket(address);sockets.push(this.real);this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));this.real.on('error',e=>errors.push(e.message));
+      this.real.on('message',(raw,binary)=>{if(!binary){const m=JSON.parse(raw);controls.push(m);if(m.type==='audio-chunk')jsonAudio.push(m);}this.onmessage?.({data:binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString()});});}
+    get readyState(){return this.real.readyState;}send(raw){this.real.send(raw);}close(){this.real.close();}}
+  const barrier=async()=>{const ts=Date.now()+Math.random();h.g.ws.send(JSON.stringify({type:'ping',ts}));await until(()=>controls.some(m=>m.type==='pong'&&m.echoTs===ts),'listener pong');};
+  const context={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V64 guide',deviceId:'v64-guide-'+code,audioSourceId:'page-media',token};
+  const listenerContext=roomId=>({type:'join',role:'pilgrim',tourCode:code,roomId,name:'V64 HTTP '+roomId,pin:'6064'});
+  let main,sub;const poll=async()=>{for(const [cap,room,dest] of [[main,'genel',httpFrames],[sub,'siyer',subFrames]]){const r=await post({...cap,subscriptionContext:listenerContext(room)});dest.push(...r.messages.filter(m=>m.type==='audio-chunk'));}};
+  const tx=async messages=>{p._inFlight=true;for(const m of messages)p.send(JSON.stringify(m));p._inFlight=false;await p._flushAndPoll();};
+  const state=(isLive,mode='mic',topic='V64')=>({type:'guide-stream-state',isLive,broadcastMode:isLive?mode:'idle',topic});
+  const raw=messages=>post({clientId:p._relayClientId,relayKey:p._relayKey,requestSeq:++p._relayRequestSeq,subscriptionContext:context,messages,token});
+  try{
+    const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers,body:JSON.stringify({code,name:'V64 media generation',pin:'6064'})});assert.equal(r.status,200);await r.arrayBuffer();created=true;
+    h=createV61ListenerHarness(fs.readFileSync(path.join(ROOT_DIR,'public/dinle.html'),'utf8'),fs.readFileSync(path.join(ROOT_DIR,'public/pcm-player-worklet.js'),'utf8'),Bridge);
+    const address=new URL(url);h.g.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};h.g.document.getElementById('tourPinInput').value='6064';h.connect(code);await until(()=>controls.some(m=>m.type==='joined'),'joined');
+    main=await open();sub=await open();await poll();
+    const shim=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8');
+    function pick(name,kind='method'){const m=new RegExp('^[ \\t]*'+(kind==='function'?'function ':'(?:async )?')+name+'\\([^\\n]*\\)\\s*\\{','m').exec(shim);assert(m);
+      for(let end=shim.indexOf('}',m.index);end>=0;end=shim.indexOf('}',end+1)){const s=shim.slice(m.index,end+1);try{new vm.Script(kind==='method'?'class P{'+s+'}':s);return s;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V64 missing '+name);}
+    const g={Date,Math,Number,ArrayBuffer,setTimeout,clearTimeout,queueMicrotask,AbortController,window:{ryGetDynamicChannelId:()=> 'same-channel'},localStorage:{getItem:()=>token},fetch:(route,options)=>fetch(baseUrl+route,options)};
+    vm.createContext(g);vm.runInContext(['nextRysAudioStateSeq','validRysAudio','unpackRysAudio'].map(n=>pick(n,'function')).join('\n')+'\nclass P{'+['send','_enqueueRelayMessage','_flushAndPoll','_resetRelaySession','_deliverIncomingMessage'].map(n=>pick(n)).join('\n')+'}\nglobalThis.P=P;',g);
+    p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,_sendQueue:[],_joinContext:context,_relayRoutingKey:()=> 'main',_seenIds:new Set(),_publishMqtt:m=>published.push(m),_broadcastP2PRoomState(){},_busConnected:()=>false,onmessage(){}});
+    await tx([state(true),audio(500)]);caps.push({clientId:p._relayClientId,relayKey:p._relayKey});await until(()=>h.player.q.has(500),'first PCM');await poll();
+    const firstEpoch=p._lastGuideState.audioMediaEpoch,firstDelivery=h.g.rxAudioDeliveryEpoch;
+    await tx([state(true,'mic','topic-only'),audio(501)]);await until(()=>h.player.q.has(501),'topic PCM');await poll();assert.equal(h.g.rxAudioDeliveryEpoch,firstDelivery);
+    assert.equal(p._lastGuideState.audioMediaEpoch,firstEpoch);
+    await tx([state(false)]);await until(()=>h.g.rxStreamActive===false,'stop');await tx([state(true)]);await until(()=>h.g.rxStreamActive===true,'resume');
+    const resumed=p._lastGuideState.audioMediaEpoch,before=httpFrames.length;
+    await raw([audio(500,firstEpoch),audio(499,undefined),audio(498,resumed+100)]);await barrier();await poll();
+    console.log('V64 OLD MEDIA PROBE '+JSON.stringify({before,after:httpFrames.length,queue:Array.from(h.player.q.keys()),activeEpoch:resumed}));
+    assert.equal(httpFrames.length,before,'Old/missing/future JSON must not pass the server after resume');assert.equal(h.player.q.size,0);
+    // Feed the actual MQTT expansion path directly into the actual listener callback.
+    const delivery=new g.P();delivery._seenIds=new Set();delivery.onmessage=e=>h.g.ws.onmessage(e);
+    delivery._deliverIncomingMessage({_msgId:'v64-old-pcm',type:'audio-chunk',frames:[audio(500,firstEpoch),audio(499,firstEpoch)]});assert.equal(h.player.q.size,0);
+    await tx([audio(502)]);await until(()=>h.player.q.has(502),'resumed PCM');await poll();
+    await tx([state(true,'demo-synth')]);const oldDemo=p._lastGuideState.audioMediaEpoch;
+    await tx([state(false)]);await tx([state(true,'demo-synth')]);await barrier();let notes=0;h.g.playGentleHarmonyNote=()=>notes++;
+    delivery._deliverIncomingMessage({_msgId:'v64-old-note',type:'audio-chunk',audioSourceId:'page-media',audioMediaEpoch:oldDemo,synthNote:440});assert.equal(notes,0);
+    await raw([{type:'audio-chunk',audioSourceId:'page-media',audioMediaEpoch:oldDemo,synthNote:440}]);
+    await tx([{type:'audio-chunk',synthNote:880,level:.5}]);await barrier();await poll();assert.equal(notes,1,'HTTP-only synth without a coalescer timestamp must arrive');
+    await tx([state(true,'mic')]);await barrier();const beforeRenew=p._lastGuideState.audioMediaEpoch;
+    await post({clientId:p._relayClientId,relayKey:p._relayKey,type:'relay-close',version:56});p._resetRelaySession();
+    await until(()=>h.g.rxStreamActive===false&&h.g.rxAudioStateEnded===true,'terminal grace');
+    await tx([audio(503)]);caps.push({clientId:p._relayClientId,relayKey:p._relayKey});await until(()=>h.player.q.has(503),'renewed first PCM');await poll();
+    const renewed=p._lastGuideState.audioMediaEpoch;assert(renewed>beforeRenew);assert(published.some(m=>m.type==='stream-state'&&m.audioMediaEpoch===renewed));
+    const native=new WebSocket(url),events=[];sockets.push(native);native.on('error',e=>errors.push(e.message));native.on('message',(raw,binary)=>{if(!binary)events.push(JSON.parse(raw));});
+    await new Promise((resolve,reject)=>{native.once('open',resolve);native.once('error',reject);});
+    native.send(JSON.stringify({type:'handoff-prepare',relayClientId:p._relayClientId,relayKey:p._relayKey,subscription:context}));await until(()=>events.some(m=>m.type==='handoff-prepared'),'prepare');
+    const handoffId=events.find(m=>m.type==='handoff-prepared').handoffId;native.send(JSON.stringify({type:'handoff-commit',handoffId}));await until(()=>events.some(m=>m.type==='handoff-committed'),'commit');
+    const ack=events.find(m=>m.type==='handoff-committed').ack;assert.equal(ack.room.audioMediaEpoch,renewed);assert.equal(ack.room.audioStateKnown,true);
+    const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+    const nativeBarrier=async()=>{const ts=Date.now()+Math.random();native.send(JSON.stringify({type:'ping',ts}));await until(()=>events.some(m=>m.type==='pong'&&m.echoTs===ts),'native pong');await barrier();};
+    native.send(binary(504));await nativeBarrier();await poll();assert(h.player.q.has(504));
+    const nextSeq=p._lastGuideState.audioStateSeq+1;
+    native.send(JSON.stringify({...state(true),audioStateSeq:nextSeq,audioMediaEpoch:renewed}));native.send(binary(505));await nativeBarrier();await poll();assert(h.player.q.has(505));
+    const blob=new h.DeferredBlob();h.g.ws.onmessage({data:blob});
+    native.send(JSON.stringify({...state(true),audioStateSeq:nextSeq+1,audioMediaEpoch:nextSeq+1}));await until(()=>h.g.rxAudioMediaEpoch===nextSeq+1,'new epoch');
+    blob.resolve(h.packet(999));await h.tick();assert(!h.player.q.has(999));native.send(binary(506));await nativeBarrier();await poll();assert(h.player.q.has(506));
+    native.send(JSON.stringify({...state(false),audioStateSeq:nextSeq+2,audioMediaEpoch:nextSeq+2}));native.send(binary(507));native.send(JSON.stringify(audio(508,renewed)));await nativeBarrier();await poll();
+    const expected=[500,501,502,503,504,505,506],mainPcm=httpFrames.filter(m=>m.pcm16),subPcm=subFrames.filter(m=>m.pcm16);
+    assert.deepEqual(mainPcm.map(m=>m.seq),expected);assert.deepEqual(subPcm.map(m=>m.seq),expected);
+    assert.deepEqual(httpFrames.filter(m=>m.synthNote).map(m=>m.synthNote),[880]);assert.deepEqual(subFrames.filter(m=>m.synthNote).map(m=>m.synthNote),[880]);
+    for(const m of [...mainPcm,...subPcm]){assert(Buffer.from(m.pcm16,'base64').equals(pcm));assert(Number.isSafeInteger(m.audioMediaEpoch));}
+    assert.equal(h.player.q.size,0);assert.deepEqual(errors,[]);
+    console.log('V64 E2E METRICS '+JSON.stringify({mainPcm:mainPcm.map(m=>m.seq),subPcm:subPcm.map(m=>m.seq),httpOnlySynth:[880],oldMediaAfterResume:0,oldDemoNotes:0,staleBlobFrames:0,firstAfterRenewal:503,handoffEpoch:renewed,pcmEqual:true}));
+    recordResult('ADIM-3.V64','Real HTTP-only PCM/synth; same-source media epoch; old MQTT/server media rejected; topic continuity; grace renewal first PCM; native handoff/Blob fence; byte integrity',true);console.log('V64 E2E PASS');
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
@@ -3236,6 +3426,7 @@
     await runStep5V61AudioChecks();
     await runStep5V62AudioChecks();
     await runStep5V63AudioChecks();
+    await runStep5V64AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=63"></script>
+  <script src="/vercel-ws-shim.js?v=64"></script>
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
-  <script src="/vercel-ws-shim.js?v=63"></script>
+  <script src="/vercel-ws-shim.js?v=64"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1181,7 +1181,7 @@
       if(typeof sourceId!=='string'||!sourceId||sourceId.length>128||!(/^[a-zA-Z0-9_.-]+$/).test(sourceId))return;
       if(rxAudioSourceId!==sourceId){
         if(rxAudioSourceId!==null){lastReceivedAudioSeq=0;stopAllActiveSources();}
-        rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;
+        rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;rxAudioMediaEpoch=null;
       }
       rxAudioSourceId=sourceId;
     }
@@ -1189,20 +1189,30 @@
     function applyRxAudioState(state){
       if(typeof state?.isLive!=='boolean')return false;
       if(state.audioStateSeq!=null&&(!Number.isSafeInteger(state.audioStateSeq)||state.audioStateSeq<1))return false;
+      if(state.audioMediaEpoch!=null&&(!Number.isSafeInteger(state.audioMediaEpoch)||state.audioMediaEpoch<1||
+        !Number.isSafeInteger(state.audioStateSeq)||state.audioMediaEpoch>state.audioStateSeq))return false;
       if(state.audioSourceId!=null&&(typeof state.audioSourceId!=='string'||!state.audioSourceId||state.audioSourceId.length>128||!(/^[a-zA-Z0-9_.-]+$/).test(state.audioSourceId)))return false;
       updateRxAudioSource(state.audioSourceId);
       const seq=state.audioStateSeq??null,ended=state.audioStateEnded===true;
       if(rxAudioStateSeq!==null){
         if(seq===null||seq<rxAudioStateSeq||seq===rxAudioStateSeq&&(!ended||rxAudioStateEnded))return false;
       }
-      rxAudioStateSeq=seq;rxAudioStateEnded=ended;
+      const epoch=state.audioMediaEpoch??null;
+      if(Number.isSafeInteger(rxAudioMediaEpoch)&&(!Number.isSafeInteger(epoch)||epoch<rxAudioMediaEpoch))return false;
+      const epochChanged=rxAudioMediaEpoch!==null&&epoch!==rxAudioMediaEpoch;
+      rxAudioMediaEpoch=epoch;rxAudioStateSeq=seq;rxAudioStateEnded=ended;
+      if(epochChanged){lastReceivedAudioSeq=0;stopAllActiveSources();}
       rxStreamActive=state.isLive;
       if(typeof state.broadcastMode==='string')rxStreamMode=state.broadcastMode;
       return true;
     }
 
-    function acceptRxAudioFrame(sourceId,synth=false){
+    function acceptRxAudioFrame(sourceId,synth=false,mediaEpoch=null,json=false){
       if(rxStreamActive===false)return false;
+      if(json){
+        if(mediaEpoch!=null&&(!Number.isSafeInteger(mediaEpoch)||mediaEpoch<1))return false;
+        if(Number.isSafeInteger(rxAudioMediaEpoch)&&mediaEpoch!==rxAudioMediaEpoch)return false;
+      }
       if(!synth&&String(rxStreamMode||'').startsWith('demo')||synth&&rxStreamMode==='mic')return false;
       if(sourceId!=null){
         if(typeof sourceId!=='string'||!sourceId||sourceId.length>128||!(/^[a-zA-Z0-9_.-]+$/).test(sourceId))return false;
@@ -1217,7 +1227,7 @@
         clearTimeout(window._ryWsReconnectTimeout);
         window._ryWsReconnectTimeout = null;
       }
-      rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;lastReceivedAudioSeq=0;stopAllActiveSources();
+      rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;rxAudioMediaEpoch=null;lastReceivedAudioSeq=0;stopAllActiveSources();
       if (ws) {
         try {
           ws.onopen=null;ws.onmessage=null;
@@ -1284,7 +1294,8 @@
             const previousMode=rxStreamMode;
             updateRxAudioSource(r.audioSourceId);
             if(r.audioStateKnown===true||rxStreamActive===null&&r.isLive===true){
-              if(applyRxAudioState(r)&&(rxStreamActive===false||previousMode!==null&&previousMode!==rxStreamMode))stopAllActiveSources();
+              if(applyRxAudioState(r)&&(rxStreamActive===false||previousMode!==rxStreamMode&&
+                (previousMode!==null||String(rxStreamMode||'').startsWith('demo'))))stopAllActiveSources();
             }
             // A delayed snapshot may update counts, but must not roll back the accepted audio state.
             if(rxStreamActive!==null)r={...r,isLive:rxStreamActive,broadcastMode:rxStreamMode};
@@ -1315,7 +1326,12 @@
         }
 
         if (msg.type === 'stream-state') {
+          const previousMode=rxStreamMode;
           if(!applyRxAudioState(msg))return;
+          if(rxStreamActive===false||previousMode!==rxStreamMode&&
+            (previousMode!==null||String(rxStreamMode||'').startsWith('demo'))){
+            lastReceivedAudioSeq=0;stopAllActiveSources();
+          }
           if (msg.currentTopic) {
             document.getElementById('liveTopicText').textContent = msg.currentTopic;
           }
@@ -1324,11 +1340,9 @@
             lastReceivedAudioSeq = 0;
             stopAllActiveSources();
           }
-          if (msg.broadcastMode === 'mic' && msg.isLive !== false) {
+          if (rxStreamMode === 'mic' && rxStreamActive !== false) {
             updateGuideSpeakingIndicator(true);
           } else {
-            lastReceivedAudioSeq = 0;
-            stopAllActiveSources();
             updateGuideSpeakingIndicator(false);
           }
         }
@@ -1363,7 +1377,7 @@
         }
 
         if (msg.type === 'audio-chunk') {
-          if(!acceptRxAudioFrame(msg.audioSourceId,!!msg.synthNote))return;
+          if(!acceptRxAudioFrame(msg.audioSourceId,!!msg.synthNote,msg.audioMediaEpoch,true))return;
           window.__ryPilgrimReconnectAttempts = 0;
           if (window.__ryPilgrimConnState === 'reconnecting') {
             updatePilgrimConnectionUi('connected');
@@ -1634,6 +1648,7 @@
     let rxAudioDeliveryEpoch=0,rxAudioSourceId=null;
     let rxStreamActive=null,rxStreamMode=null;
     let rxAudioStateSeq=null,rxAudioStateEnded=false;
+    let rxAudioMediaEpoch=null;
     const pendingRxFrames = [];
 
     function flushPendingRxFrames() {
@@ -2570,7 +2585,7 @@
     }
 
     function leaveRoom() {
-      intentionalLeave = true;rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;
+      intentionalLeave = true;rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;rxAudioMediaEpoch=null;
       if (window._ryWsReconnectTimeout) {
         clearTimeout(window._ryWsReconnectTimeout);
         window._ryWsReconnectTimeout = null;
@@ -2634,7 +2649,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=63').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=64').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=63"></script>
+  <script src="/vercel-ws-shim.js?v=64"></script>
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
-  <script src="/vercel-ws-shim.js?v=63"></script>
+  <script src="/vercel-ws-shim.js?v=64"></script>
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
-  <script src="/vercel-ws-shim.js?v=63"></script>
+  <script src="/vercel-ws-shim.js?v=64"></script>
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
-  <script src="/vercel-ws-shim.js?v=63"></script>
+  <script src="/vercel-ws-shim.js?v=64"></script>
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
-  <script src="/vercel-ws-shim.js?v=63"></script>
+  <script src="/vercel-ws-shim.js?v=64"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v63';
+const CACHE_NAME = 'ridvanses-pwa-v64';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=63',
+  '/vercel-ws-shim.js?v=64',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
   '/pcm-player-worklet.js?v=61-audio',
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -67,6 +67,7 @@
       Number.isFinite(m.sentAt) &&
       m.sentAt > 0 &&
       (m.audioSourceId==null||(typeof m.audioSourceId==='string'&&m.audioSourceId.length<=128&&/^[a-zA-Z0-9_.-]+$/.test(m.audioSourceId))) &&
+      (m.audioMediaEpoch==null||(Number.isSafeInteger(m.audioMediaEpoch)&&m.audioMediaEpoch>0)) &&
       typeof m.pcm16 === 'string' &&
       m.pcm16.length === 1280 &&
       /^[A-Za-z0-9+/]+$/.test(m.pcm16)
@@ -126,7 +127,8 @@
       } catch (e) {}
       if(m?.type==='guide-stream-state'&&(!m.isLive||String(m.broadcastMode||'').startsWith('demo')))c.clear();
       if (sock._isRelay && validRysAudio(m)) {
-        c.push({...m,audioSourceId:m.audioSourceId||sock._joinContext?.audioSourceId||null});
+        c.push({...m,audioSourceId:m.audioSourceId||sock._joinContext?.audioSourceId||null,
+          audioMediaEpoch:m.audioMediaEpoch??sock._lastGuideState?.audioMediaEpoch??null});
         return;
       }
       send(data);
@@ -373,6 +375,8 @@
         try{this.onmessage?.({data:JSON.stringify(ack)});}catch(e){this.onerror?.(e);}
         if(this._closedExplicitly||this.readyState!==1||this._isRelay||this._native!==probe)return;
         this._failbackSubscription=request;
+        if(mode==='join'&&join.role==='guide'&&ack.room?.audioStateKnown===true&&
+          (ack.room.audioStateEnded===true||ack.room.isLive===false))this._forceMediaEpoch=true;
         try{this.onopen?.({type:'open',failback:true});}catch(e){this.onerror?.(e);}
         finally{this._failbackSubscription=null;}
         if(this._closedExplicitly||this.readyState!==1||this._isRelay||this._native!==probe)return;
@@ -626,6 +630,7 @@
           audioSourceId:this._joinContext.audioSourceId||null,
           audioStateKnown:typeof this._lastGuideState?.isLive==='boolean'||typeof this._isLive==='boolean',
           audioStateSeq:this._lastGuideState?.audioStateSeq||null,audioStateEnded:false,
+          audioMediaEpoch:this._lastGuideState?.audioMediaEpoch||null,
           guideLocation: this._guideLocation || null,
           connectedPilgrims: pilgrims,
           totalListeners: pilgrims.length,
@@ -697,7 +702,20 @@
         }
         if(['join','family-subscribe','admin-subscribe'].includes(parsed.type))this._cancelNativeProbe?.();
         if(parsed.type==='guide-stream-state'){
-          parsed={...parsed,audioStateSeq:nextRysAudioStateSeq(this._lastGuideState?.audioStateSeq),audioStateEnded:false};
+          const previous=this._lastGuideState,seq=nextRysAudioStateSeq(previous?.audioStateSeq),renew=this._forceMediaEpoch===true;
+          this._forceMediaEpoch=false;
+          const sameMode=previous&&previous.isLive===parsed.isLive&&previous.broadcastMode===parsed.broadcastMode;
+          parsed={...parsed,audioStateSeq:seq,audioStateEnded:false,
+            audioMediaEpoch:!renew&&sameMode&&Number.isSafeInteger(previous.audioMediaEpoch)?previous.audioMediaEpoch:seq};
+          if(renew&&sameMode){
+            const rebase=m=>{
+              if(m.type!=='audio-chunk')return m;
+              if(Array.isArray(m.frames))return {...m,frames:m.frames.map(rebase)};
+              return m.audioMediaEpoch===previous.audioMediaEpoch?{...m,audioMediaEpoch:seq}:m;
+            };
+            this._sendQueue=this._sendQueue.map(rebase);
+            if(this._audioCoalescer?.frames)this._audioCoalescer.frames=this._audioCoalescer.frames.map(rebase);
+          }
           this._lastGuideState={...parsed};
           if(!parsed.isLive||String(parsed.broadcastMode||'').startsWith('demo')){
             this._audioCoalescer?.clear();this._sendQueue=(this._sendQueue||[]).filter(m=>m.type!=='audio-chunk');
@@ -743,12 +761,18 @@
       if(parsed?.type==='audio-chunk'&&this._joinContext?.role==='guide'){
         const state=this._lastGuideState,pcm=!parsed.synthNote;
         if(state&&(state.isLive===false||pcm&&String(state.broadcastMode||'').startsWith('demo')))return;
-        const source=this._joinContext.audioSourceId;
+        const source=this._joinContext.audioSourceId,epoch=state?.audioMediaEpoch;
+        if(parsed.synthNote&&Number.isSafeInteger(epoch)){
+          if(parsed.audioMediaEpoch!=null&&parsed.audioMediaEpoch!==epoch)return;
+          parsed={...parsed,audioMediaEpoch:epoch};
+        }
         if(source&&!pcm){if(parsed.audioSourceId&&parsed.audioSourceId!==source)return;parsed={...parsed,audioSourceId:source};}
-        if(pcm&&source){
+        if(pcm&&(source||Number.isSafeInteger(epoch))){
           const frames=parsed.frames===undefined?[parsed]:parsed.frames;
           if(!Array.isArray(frames)||!frames.length||frames.length>3||!frames.every(validRysAudio))return;
-          const kept=frames.filter(f=>!f.audioSourceId||f.audioSourceId===source).map(f=>({...f,audioSourceId:source}));
+          const kept=frames.filter(f=>(!source||!f.audioSourceId||f.audioSourceId===source)&&
+            (!Number.isSafeInteger(epoch)||f.audioMediaEpoch==null||f.audioMediaEpoch===epoch))
+            .map(f=>({...f,audioSourceId:source||f.audioSourceId||null,audioMediaEpoch:Number.isSafeInteger(epoch)?epoch:f.audioMediaEpoch??null}));
           if(!kept.length)return;
           parsed=parsed.frames===undefined?kept[0]:{...parsed,frames:kept,audioSourceId:source};
         }
@@ -821,7 +845,7 @@
             broadcastMode: this._broadcastMode,
             currentTopic: this._currentTopic,
             audioSourceId:this._joinContext.audioSourceId||null,
-            audioStateSeq:parsed.audioStateSeq,audioStateEnded:false,
+            audioStateSeq:parsed.audioStateSeq,audioStateEnded:false,audioMediaEpoch:parsed.audioMediaEpoch,
             guidePeerId: window.ryGetDynamicChannelId(
               this._joinContext.tourCode || 'RY-KASIM',
               this._joinContext.roomId || 'genel'
@@ -905,6 +929,7 @@
         this._sendQueue=this._sendQueue.filter(m=>m.type!=='guide-stream-state');
       }
       const now=Date.now();
+      if(message.type==='audio-chunk'&&!Number.isFinite(message._queuedAt))message={...message,_queuedAt:now};
       this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk'||
         (Number.isFinite(m._queuedAt)&&now-m._queuedAt<=200));
       const audio=message.type==='audio-chunk';
@@ -949,7 +974,25 @@
           if(!sameRoute()){success=true;return;}
           if(this._lastGuideState&&this._joinContext?.role==='guide'){
             // Reannounce before the first PCM; renewal may follow an authoritative disconnect stop.
-            this._lastGuideState={...this._lastGuideState,audioStateSeq:nextRysAudioStateSeq(this._lastGuideState?.audioStateSeq),audioStateEnded:false};
+            const previous=this._lastGuideState,seq=nextRysAudioStateSeq(previous.audioStateSeq);
+            // Rebase only media from the still-current capture epoch. A stop/resume during
+            // relay-open must not relabel the pre-stop captured batch as fresh audio.
+            const rebase=m=>{
+              if(m.type!=='audio-chunk')return m;
+              if(Array.isArray(m.frames))return {...m,frames:m.frames.map(rebase)};
+              if(m.audioMediaEpoch==null||m.audioMediaEpoch===previous.audioMediaEpoch)return {...m,audioMediaEpoch:seq};
+              return m;
+            };
+            for(let i=0;i<batch.length;i++)batch[i]=rebase(batch[i]);
+            this._sendQueue=this._sendQueue.map(rebase);
+            if(this._audioCoalescer?.frames)this._audioCoalescer.frames=this._audioCoalescer.frames.map(rebase);
+            this._lastGuideState={...previous,audioStateSeq:seq,audioStateEnded:false,audioMediaEpoch:seq};
+            // MQTT receivers must learn the rebased epoch before subsequent live media.
+            try{this._publishMqtt?.({_msgId:'ms-'+Date.now()+'-'+seq+'-'+Math.random().toString(36).slice(2),
+              type:'stream-state',audioSourceId:this._joinContext.audioSourceId||null,
+              audioStateSeq:seq,audioStateEnded:false,audioMediaEpoch:seq,
+              isLive:!!previous.isLive,broadcastMode:previous.broadcastMode||'idle',
+              currentTopic:previous.topic||this._currentTopic||''});this._broadcastP2PRoomState?.();}catch(e){}
             for(let i=batch.length-1;i>=0;i--)if(batch[i].type==='guide-stream-state')batch.splice(i,1);
             batch.unshift({...this._lastGuideState});
           }
@@ -965,7 +1008,8 @@
           const state=this._lastGuideState,source=this._joinContext?.audioSourceId;
           if(this._joinContext?.role==='guide'&&state&&(state.isLive===false||!m.synthNote&&String(state.broadcastMode||'').startsWith('demo')))return false;
           const frames=Array.isArray(m.frames)?m.frames:[m];
-          return !source||frames.every(f=>!f.audioSourceId||f.audioSourceId===source);
+          return frames.every(f=>(!source||!f.audioSourceId||f.audioSourceId===source)&&
+            (!Number.isSafeInteger(state?.audioMediaEpoch)||f.audioMediaEpoch===state.audioMediaEpoch));
         });
         const requestSeq=this._relayRequestSeq=(this._relayRequestSeq||0)+1;
         const res=await fetch('/api/ws-relay',{method:'POST',signal:ac.signal,
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=63"></script>
+  <script src="/vercel-ws-shim.js?v=64"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```

## 6. Nihai test ölçümleri

| Koşu | Sonuç |
| --- | --- |
| Disk v63 | Komut aynen node scripts/verify-system.js; **44/44 PASS, exit0** |
| Yeni E2E + değişmemiş v63 sunucusu | **FAIL/exit1**, resume sonrası HTTP2→5 ve q=[500,499,498]; eski/eksik/gelecek medya nesli ayrılmadı |
| Yalnız yeni TTL satırı kaldırılmış aday | **FAIL/exit1**, HTTP-only synth880 için0 nota, beklenen1; diğer epoch kontrolleri bu noktaya kadar geçti |
| Nihai v64, rapordan bellek kurulumu | **46/46 PASS, exit0**; gerçek verifier gövdesi ve localhost server/HTTP/WS |
| Gerçek CLI ana girişi | **node --require <geçici CommonJS preload> scripts/verify-system.js → 46 / 46 [BAŞARILI / PASS], exit0**; kaynaklar yine bellekte |

Son CommonJS CLI koşusundaki300 dinleyici probe'u:300 aynıIP join200;301 gerçekWS;270 sağlam×120 frame=**32400 sağlam teslim**;30 duraklatılmış/yapay backlog soketi;1500 soft drop;3 hard izolasyon;0 bozuk PCM. Yerel gönderim→WS teslim p50 **7.55 ms**, p95 **11.14 ms**, p99 **16.75 ms**, max **25.79 ms**; event-loop p99 **24.08 ms**, CPU **687 ms**, süre **2415.7 ms**. Disk44 koşusunda p50/p95/p99/max=15.07/26.62/34.02/38.51 ms idi. Bu iki koşu kontrollü performans A/B'si değildir; host yükleri farklıdır. Ölçümler uçtan uca akustik/roaming gecikmesi değildir.

V64 E2E ana ve siyer HTTP PCM listeleri eşit: **[500,501,502,503,504,505,506]**. HTTP-only synth **[880]**. oldMediaAfterResume=0,oldDemoNotes=0,staleBlobFrames=0,firstAfterRenewal=503,handoffEpoch=10,pcmEqual=true. Eski500 ve eksik/gelecek epoch kabul edilmedi; güncel502 geldi; grace sonrasında yeni relay'nin ilk503'ü korundu; native handoff'tan504/505, epoch değişiminden506 geldi; stop sonrası507/508 gelmedi. HTTP fallback native binary'nin PCM baytlarını ve epoch'unu korudu. Bu sıfırlar belirtilen enjeksiyonların sonucudur; bütün ağ/cihaz durumlarında evrensel sıfır garantisi değildir.

V64 Unit dokuz grubunda capturedOldBatchFrames=0,currentPendingPreserved=true,topicTimelinePreserved=true. Topic aynı demo notasını korudu; mod/epoch değişimi temizledi. Terminal native ACK yeni epoch, aktif ACK aynı epoch üretti; güncel pending/coalescer frame'leri doğru etiketle kaldı.200 ms aşılmış kayıt yeniden tazelenmedi.

### 6.1 Ek preload denemesinin sınırı

Doğrudan CLI için denenen **ESM --import preload** koşusu V59 fan-out öncesinde Windows/Node native sonlanması **-1073740791 (0xC0000409)** ile durdu. Bir test assertion'ı değildi; bu turda nedeni belirlenmedi ve PASS sayılmadı. Bunun proje kaynak kodundan doğduğuna dair kanıt yok; aynı nihai kaynaklar standart CommonJS bellek yüklemesi ve gerçek CommonJS-preload CLI girişinde46/46 geçti. Native sonlanmanın yokluğu da bu testlerle kanıtlanmış sayılmaz.

Abort nedeniyle verifier'ın kendi runtime snapshot restore'u çalışamadı. Başlangıç git status'u temiz olan yalnız data/runtime.json, HEAD aa2b5b7 verisine geri döndürüldü; kullanıcıya ait iki rapor silmesine dokunulmadı. Son CommonJS CLI koşusu ayrıca dış PowerShell finally bloğuyla runtime baytlarını geri aldı ve geçici .cjs preload dosyasını sildi. Tüm kaynak hash'leri değişmeden kaldı. ESM denemesi üretim/performans başarı ölçümlerine katılmadı.

Kanıt logları yerel TEMP altında: rys-v64-baseline.log, rys-v64-old-server.log, rys-v64-old-ttl.log, rys-v64-report-final.log ve nihai CLI için **rys-v64-report-final-cjs-cli.log**. ESM denemesi rys-v64-report-final-cli.log dosyasındadır. Ara test fixture düzeltmeleri nihai başarı olarak sayılmadı.

## 7. Yama ve çalışma ağacı bütünlüğü

Tek diff bloğu; **12 hedef**, **58.549 bayt**, UTF-8/LF. SHA-256: **f5799f749914b5f6e295335531fea4a8deec095cac4d4872f16a699dfd114678**. Hem **git apply --check -** hem **git apply --check --ignore-space-change -** exit0. HEAD içindeki önceki raporun v63 diff'i yeniden çıkarılıp **git apply --reverse --check --ignore-space-change -** exit0 ile doğrulandı.

Kaynak değiştirmeden kontrolleri tekrar etmek için proje kökünde:

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
v63 = re.findall(r'(?ms)^```diff\n(.*?)^```\s*$', previous)[0].encode('utf-8')
subprocess.run(['git','apply','--reverse','--check','--ignore-space-change','-'], input=v63, check=True)
print('V63 reverse / V64 strict / V64 ignore-space: PASS')
'@ | python -
```

Bu turda yama uygulanmadı. Daha sonra kaynaklara uygulandığında standart node scripts/verify-system.js sonucu **46/46** olmalıdır;44 disk v63'e aittir. Eski test başarı koşulları gevşetilmedi, test sayısı ek tekrarlarla yapay artırılmadı.

Son durumda HEAD **aa2b5b7** değişmedi;15 kaynak dosyasının ham SHA-256 değerleri başlangıçla aynı. git status yalnız **M AUDIO_EXCELLENCE_REPORT.md** ve başlangıçtaki **D AUDIT_FIX_SUMMARY.md / D AUDIT_REPORT.md** durumlarını içerir. Kaynaklar stage edilmedi veya geri yazılmadı; commit/push/deploy yok. Unified diff boş bağlam satırlarının zorunlu tek boşluk öneki korunur; rapor whitespace kontrolü git -c core.whitespace=-blank-at-eol diff --check ile yapıldı.

<!-- SOURCE-HASHES {"server.js":"3362da59648b331b885964a76ee08191a2f73df8fd8d483e88f2c7b4d29dd77b","scripts/verify-system.js":"c33e62d006f3ad807f6cc56a49f6e3093c4668e0bfcfe8d3875891b4e42fc0b0","public/ani-kitabi.html":"2a88f99ace585cfa6bf4b161f66385e1c02813e266285064f8d1d0c94843ad30","public/dinle.html":"344bd59936b88aa83bdfc7d13632b7485b50f7463e62f1632a77df1c7a9631da","public/index.html":"7d44bb14ae21e838d47e3eeba746e248df5defdafdfd337f6515c08d6845a4ea","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"4a043ff9f66ea29282f92b5164e9ae5dbb97264a2e61bd01dc74b2275f1da946","public/panel.html":"3b5bf70dceebb234cc2ddc7cf25dbe4dcead8f83eedcb38c4f0f903e9654a8d1","public/pcm-capture-worklet.js":"30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a","public/pcm-player-worklet.js":"062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7","public/rehber.html":"ecbce06ed7928f0f83e0070889ef75bff815906a6cfe789839f120303c216991","public/rota.html":"ccb4760757362feef5979e2a3510e492ebf8ac2a0c92d6747fa56cfaa83108d8","public/sw.js":"e4fb0c749d803d5c3583e695b57be2aecc5d276c098b8f9c103d77be32882543","public/vercel-ws-shim.js":"cc7cbd08e8659b540483d0383cc19a78a69cfddee3b24644084a35a5565ae597","public/yaka-karti.html":"a023bea553129c170e27f65b003f5026842c20f53034611b5629983046eec5d3"} -->
