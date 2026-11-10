# RıdvanSes v68 — v67 Uygulama, Rol Sınırı ve Yayın Sahipliği Denetimi

Denetim: **10 Kasım 2026**, çalışma kökü **D:/umresesliyazılım**. İncelenen HEAD: **82e4d5658116639ef423de2e060dbebf3b041b07**. Bu turda yalnız bu rapor güncellendi. Aşağıdaki v68 kaynaklara uygulanmadı; stage/commit/push/canlı dağıtım yapılmadı.

**Karar:** v67 yaması eksiksiz eşleşiyor; reverse-check **exit0**, değiştirilmemiş disk paketi **52/52 PASS, exit0**. İki yeni kusur doğrulandı: **P1-68-01**, public dinleyicinin aynı deviceId ile rehber üyeliğini düşürebilmesi; **P2-68-02**, aynı sokette guide→pilgrim geçişinde eski activePublisher kilidinin ve canlı durumun kalması. Bu yüzden **“SIFIR HATA — v67 %100 ONAYLI (PRODUCTION-READY)” onayı verilmiyor**. Tek v68 yaması gerçek CLI bellek provasında **54/54 PASS, exit0** verdi. Başarı bütün olası kusurların yokluğunun veya fiziksel sahada sıfır kopmanın ispatı değildir.

## 1. v67 uygulama eşliği ve disk doğrulaması

| Kontrol | Kanıt |
| --- | --- |
| Başlangıç raporunun v67 diff'i | Tek blok;34.156 UTF-8 bayt; SHA-256 **98c3c439a54d47c36db9362b4419875d3028c8c448371ba456754c2d724dd507** |
| git apply --reverse --check --ignore-space-change - | Başlangıçta ve son kontrolde **exit0**, stderr boş |
| node scripts/verify-system.js | **52 / 52 [BAŞARILI / PASS], exit0**; V51 transport ve paketteki V53..V67 E2E/Unit kontrolleri dahil |
| HEAD stat | 11 kaynak + rapor =12 dosya;621 ekleme /412 silme |
| Başlangıç status | Yalnız AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md silinmiş |
| Kaynak bütünlüğü | 15 incelenen uygulama/test/HTML kaynağının ham hash'leri başlangıçla aynı |
| DSP çekirdekleri | Capture60-audio / player61-audio ve shim callback kodu değişmedi |

### 1.1 İstenen 11 hedefin gerçek satır kontrolü

Aşağıdaki konumlar **disk v67** içindir; diff uygulandıktan sonraki satırlar değildir.

| Dosya / gereksinim | Satır ve sonuç |
| --- | --- |
| server.js / revokeAuthToken |534–543: session silme/revoked Set sonrasında542'de native context taraması. Döngü clean!==AUTH_TOKEN_VALUE bloğunun dışındadır; HTTP logout cevabından önce senkron çalışır. Kalıcı anahtarın eski sözleşmesi korunmuştur. |
| server.js / refreshRysNativeAuth |625–639: HTTP relay bypass;627'de mevcut token/handshake canlı doğrulaması; guide/admin/privileged pending handoff ayrımı; bayrak temizliği, clearRysHandoff,0-grace remove ve terminate. Public listener/family açık kalırken elevated bayrakları kaldırılır. |
| server.js / JSON credential kaydı |943–950: geçerli msg.token946'da bağlanır. Geçersiz token geçerli mevcut credential'ı üzerine yazmaz. |
| server.js / native giriş |ctx referansı1333; binary1344; JSON1404–1405: güncel credential ve canlı yetki kontrolü fan-out'tan önce. |
| server.js / close ve heartbeat |1412: ws.rysAuthContext=null;1421–1433 heartbeat içinde1424'te aynı canlı yetki denetimi. Boşta expiry nominal30 s timer ile, aktif expiry ilk geçersiz girişte ele alınır. |
| server.js / handoff |1547–1561: request/current/handshake credential seçimi,1550'de kayıt ve guide/admin/PIN kontrolleri. Prepare/commit ve sonraki native girişler aynı credential bağını korur. |
| scripts/verify-system.js |E2E çağrısı590; runStep5V67AudioChecks3733–3792; runV67NativeAuthChecks3794–3861; main Unit çağrısı3883. Mevcut loginCredentials157–164 paylaşılır; test kendi ayrı oturumlarını revoke eder. |
| public/sw.js |4: ridvanses-pwa-v67;11: shim?v=67; capture60-audio / player61-audio korunmuş. |
| public/dinle.html |19: shim?v=67;2656: sw.js?v=67. |
| public/rehber.html |31: shim?v=67. |
| public/panel.html |32: shim?v=67. |
| public/index.html |85: shim?v=67. |
| public/login.html |13: shim?v=67. |
| public/rota.html |12: shim?v=67. |
| public/ani-kitabi.html |10: shim?v=67. |
| public/yaka-karti.html |11: shim?v=67. |

**V67 gerçek E2E tekrar ölçümü:** message/Bearer/Cookie yollarının üçünde logout sonrası HTTP PCM0, native binary0, guidePresent=false/isLive=false; admin kapandı; public family açık kaldı ve yetkisiz guide yükselmesi reddedildi; bağımsız tokenlı rehberin PCM'i bayt eşliğiyle devam etti. Unit expiry sınırı, token rotasyonu, prepare iptali ve gerçek kaynak giriş/heartbeat callback testleri PASS. v67'nin yetki ömrü düzeltmesinde eksik uygulama doğrulanmadı; yeni bulgular üyelik/rol geçişi mantığındadır.

## 2. Yeni bulgular ve değiştirilmemiş v67 negatif kanıtları

### P1-68-01 — Public deviceId çakışması yetkili rehberi düşürebiliyor

**Kök neden:** [server.js:1023](D:/umresesliyazılım/server.js:1023)–1039. sameDevice eşitliği üyelik rolünü kontrol etmiyor. PIN kontrolünden geçmiş bir pilgrim, rehberin kullandığı deviceId'yi bildirdiğinde döngü farklı odadaki rehberi de silebiliyor; native socket terminate ediliyor veya HTTP rehber capability'si retired oluyor.1024'teki sameGuide yolunda rol kısıtı mevcut; aynı sınır sameDevice yolunda yok.

deviceId istemcinin gönderdiği metadata'dır; rehber yetki tokenı değildir. **Önkoşul:** hedef deviceId değeri bilinmeli, aynı değer seçilmeli veya çakışmalıdır; korumalı kafilede public katılım için doğru PIN gerekir. Test bu önkoşulu kasıtlı aynı değerle kurar. ID'nin public bootstrap'ta yayımlandığı, rasgele ID ile her rehberin düşürülebileceği veya canlı sistemde istismar gözlendiği iddia edilmiyor.

**Gerçek v67 negatif E2E:** genel odada tokenlı native rehber ve PCM40 kurulmuştur. Ardından siyer odasına token taşımayan, doğru PIN'li pilgrim aynı deviceId ile katılmıştır. Ölçüm: **guidePresent=false, guideOpen=false, afterCollisionPcm=false**. Test **“A public pilgrim must not evict a guide by copying deviceId”** koşulunda FAIL / **exit1** vermiştir. Ayrı gerçek processClientJsonMessageV49 VM probunda guidePresent=false, guideTerminated=1 ve ana odanın activePublisherClientId değeri public istemci kimliği olmuştur.

Bu yol bir rehber tokenı çalmaz veya pilgrim'e ses yayınlama rolü vermez; **yetkisiz yayın kesme / üyelik ve publisher devri** kusurudur. Tek rehberli300 dinleyici senaryosunda tek bu katılım yayıncı bağlantısını kesebilir.

**v68:** sameDevice yalnız **aynı normalize edilmiş rol** içinde geçerli olur. Public pilgrim rehberi; guide da aynı ID'li dinleyiciyi bu metadata gerekçesiyle çıkaramaz. Aynı roldeki reconnect, aynı odadaki yetkili guide-name replacement ve gerçek HTTP→native handoff korunur. Bu değişiklik deviceId'yi kriptografik kimlik kanıtına dönüştürmez; aynı rol için mevcut reconnect sözleşmesi devam eder.

### P2-68-02 — Aynı sokette rol düşüşü yayıncı kilidini bırakmıyor

**Kök neden:** [server.js:1007](D:/umresesliyazılım/server.js:1007), [1042](D:/umresesliyazılım/server.js:1042)–1045. join mevcut clientObj'yi pilgrim olarak değiştirebilir; yalnız oda değiştiyse removeClientFromRoom çağrılır. Aynı odada guide→pilgrim olduğunda eski role ait cleanup atlanır. activePublisherClientId artık odada bulunan bir **pilgrim** kimliğini göstermeye devam eder. Native ve JSON publisher bekçileri owner kimliğinin hâlâ clients içinde olmasını yeterli saydığı için başka rehberin kontrol/PCM'i engellenir. Son rehberin rol düşüşünde isLive=true da kalabilir.

**Gerçek v67 negatif E2E:** role-drop odasında tek guide PCM700 yayınlamıştır. Aynı açık soket aynı odada pilgrim olarak yeniden join olmuştur. Sonra ayrı tokenlı yeni guide kontrol20/epoch20 ve PCM701 göndermiştir. Ölçüm: **liveAfterLastGuideDowngrade=true, ended=false, takeoverPcm=false, formerSocketOpen=true**. Eski işleyiciyle bağımsız VM probu da role=pilgrim, publisher=owner, isLive=true üretmiştir. İlk bulgudan bağımsız ayrı odada ölçüldüğünden, rehberin device çakışmasıyla kapanmasının yan etkisi değildir.

**v68:** aynı odadaki önceki client kaydı overwrite edilmeden tutulur. Eski role guide ve yeni role pilgrim ise yeni listener üyeliği silinmeden, yalnız eski sahibin publisher alanı temizlenir; mevcut evaluateTourGuidePresence çalıştırılır. Son rehberde Genel/alt oda terminal stop'u, dedicated rehberin rol düşüşünde Genel kaynağına dönüş, başka rehber varsa onun kontrolü devralabilmesi sağlanır. Farklı odaya geçiş mevcut0-grace removal yolunda kalır.

Rol düşüşü token iptali değildir: geçerli credential'a sahip aynı soket listener olarak açık kalabilir ve uygun sonraki kontrol/epoch ile yeniden guide olabilir. v67 revoke/expiry davranışı değişmez. Birden çok rehber kalmışsa mevcut room liveness politikası korunur; publisher kilidi serbest kalır ve sonraki rehberin geçerli kontrolü kabul edilir.

### 2.1 Negatif / pozitif ölçüm karşılaştırması

| Senaryo | Orijinal v67 server | v68 adayı |
| --- | --- | --- |
| Public aynı-ID katılımında guidePresent |false|true|
| Rehber soketi açık |false|true|
| Çakışma sonrası PCM41 |ulaşmadı|ulaştı|
| Son guide aynı sokette pilgrim olduğunda live |true|false|
| Terminal ended |false|true|
| Yeni rehberin PCM701 devralması |false|true|
| Eski guide soketi listener olarak açık |true|true|

Negatif testte eski server.js diskteki haliyle kullanılmıştır. Yeni verifier ve cache beklentileri bellektedir; HTTP, WS, join/PIN, PCM ve handoff sunucusu gerçektir. Dinleyicinin AudioWorklet/player ortamı VM'dedir. Kontrol ve PCM eşliği fiziksel cihaz akustiği ölçümü değildir.

## 3. Uçtan uca ses/DSP ve taşıma incelemesi

| Katman / disk konumu | Sonuç |
| --- | --- |
| Mikrofon / public/rehber.html:1571–1767 |180 ms stale capture,19200 B backpressure; getUserMedia/module/import/preview/start/stop/heal/devicechange/track/processor sahipliği. V60'ın17 yaşam döngüsü grubu ve eski callback çitleri PASS. Yeni kusurlar capture DSP'den sonraki server üyelik yolundadır. |
| Rehber graph / rehber.html:1677–1687 |AEC=true, noiseSuppression=false, AGC=false, mono48 kHz istek;85 Hz HP,210 Hz -2.5 dB mud cut,3200 Hz +2 dB presence,10500 Hz LP, manuel gain. Gerçek route/hız browser/hardware seçimidir. |
| Capture / public/pcm-capture-worklet.js:10–50,152–258 |193 tap ×256 faz Blackman FIR; sürekli faz, gerçek giriş sampleRate'i;480 örnek /20 ms @24 kHz; frame transfer sahipliği ve stop→processor false.8/16/24/44.1/48 kHz süreklilik/çerçeveleme kontrolleri PASS. |
| Expander / capture:53–150 |4 bant zarf/minima;400 ms kalibrasyon,4 s rolling minima;10 ms lookahead;7.5 dB açma/4 dB hysteresis;240 ms hold,3 ms attack/120 ms release; kapalı gain0.126≈-18 dB. continuousSpeech hece koruması ile çevre bastırma tercihini değiştirir. |
| Comfort/mute / capture:152–220 |3 ms delay;600 ms quiet sonrası80 ms azalma;2 ms yükseliş, yumuşak mute. “Comfort” yolu gürültü üretimi değil mevcut PCM'i sönümleme/sıfırlamadır. Yeni DSP kusuru bu testlerde doğrulanmadı. |
| Coalescer / public/vercel-ws-shim.js:95–140 |1–3 bağımsız frame;40 ms timer/120 ms TTL; stop/demo clear; capture epoch'u girişte bağlanır. Stop/resume/relay-open batch çitleri V64/65'te PASS. |
| Taşıma / shim:287–389,401–514,617–663,969–1065 |100 ms tek-uçuş poll/3 s abort;4 audio batch/200 ms+64 kontrol; rota/cevap/retry çiti; v65 control-first latch; v66 loader/client/suback/timer generation. Native/HTTP handoff ACK ve capability çitleri korunmuş. |
| Native yetki / server.js:534–543,625–639,1333–1424 |v67 canlı token/revoke/expiry denetimi eksiksiz. Yeni role/ID hataları bu yetkiyi doğruladıktan sonraki join/dedup/üyelik değişiminde oluşuyor; v68 token modelini değiştirmez. |
| Server fan-out / server.js:435–494,931–942,1184+,1338+ |Aktif publisher, modern source/known/live/epoch kabulü; binary/JSON paritesi. Yeni v68 aynı-role dedup ve rol düşüşünde owner release'i tamamlar.972 B PCM wire değişmez. |
| Relay/handoff / server.js:1441–1796 |48 hex capability,35 s lease,3 s prepare, requestSeq/digest/revision, no-await commit, retired/expired409, metadata ve auth/context sonrası lease. V53..V67 regresyonları v68'de de PASS. |
| Genel→alt oda / server.js:358–368,707–763 |Dedicated guide yoksa kaynak/durum/epoch mirası; terminal stop. Yeni role-downgrade değerlendirmesi aynı mevcut mekanizmayı kullanır. Dedicated→Genel dönüşü Unit; ana/alt terminal ve yeniden başlama gerçek E2E ile doğrulandı. |
| Receiver / public/dinle.html:1180–1406 |Socket/Blob delivery çiti; source/stateSeq/ended/mediaEpoch kabulü; controller kurulmadan modern JSON yok; stop/mod/source değişiminde reset. V64 eski epoch0; V65 unprimed0; V66 eski MQTT callback teslimi0. |
| Port/kurtarma / dinle.html:1658–1897 |Main queue en çok13 frame/260 ms; rxLoadToken/context/processor sahipliği, FIFO reset, askıda veri düşürme, resume/rebuild/probe. Etkin workletless scheduler fallback'i yoktur; saha destek sınırı sürer. |
| Player / public/pcm-player-worklet.js:12–27,124–187,190–338 |8/16 kHz'de193 tap anti-alias FIR→Hermite;24/44.1/48 kHz'de downsample FIR yok; sürekli faz, ±1000 ppm ASRC, seq wrap/late/duplicate çitleri ve sınırlı kuyruk. |
| Jitter/PLC / player:30–96,190–338 |Başlangıç120 ms, adaptif80–260 ms; en az1 frame ile300 ms başlangıç eşiği;60 ms pitch PLC+sönüm;300 ms starvation rebuffer. >32 frame→24 trim; hedef+120 ms üzerinde500 ms catch-up;3 ms recovery/5 ms rampalar. |
| PWA / public/sw.js:4–79 |API/WS/auth/rehber/panel cache dışı; worklet sürümleri60/61 korunur. v68 release cache'leri68'e çıkarır; açık sekmenin eski JS'i activation ile kendiliğinden değişmez. |

### 3.1 Beş örnekleme hızında tekrar geçen DSP ölçümleri

| Çıkış Hz | firstAfterReset | firstAfterStarvation | DC fixture iç maxStep |
| --- | --- | --- | --- |
|8000|0|0|0.130492|
|16000|0|0|0.145227|
|24000|0|0|0.002640|
|44100|0|0|0.001428|
|48000|0|0|0.001314|

Düşük hız FIR iç geçici rejimi ilk örnek sıçramasıyla aynı ölçü değildir; tablo fiziksel cızırtının sıfır olduğu anlamına gelmez. V60 player alias fixture:8 kHz çıkışta4080/4800/6000 Hz için **-76.56/-107.60/-114.02 dB**;16 kHz çıkışta8160/9600/10000 Hz için **-97.45/-115.88/-127.11 dB**.24 kHz capture2 s→100 frame; diğer giriş oranları/frame-partition kontrolleri de PASS.

Capture FIR gecikmesi96/girişHızı:8/16/24/44.1/48 kHz için12/6/4/2.18/2 ms.10 ms lookahead,3 ms comfort,0–20 ms frameleme,0–40 ms coalescer,120 ms ilk jitter hedefi ve düşük çıkışta player FIR4 ms eklenir. Ağ/donanım ayrıca vardır; yerel WS teslim süresi ağızdan kulağa toplam gecikme değildir.

Capture ham SHA-256 **30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a**; player **062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7**; shim **a89f929edf4cd9cfaccb0f48f38705ca60b2bdb3d2c538ca9cbb485618f3f48e**. Bu üç kaynak diskte de v68 diff'inde de değişmez.

### 3.2 1→300 yerel fan-out ölçümleri

300 aynı-IP geçerli join200;301 gerçek WS;270 sağlam dinleyici×120 frame=**32.400 eksiksiz frame**,30 paused/injected-queue peer'de **1500 soft drop**,3 hard izolasyon, **0 bozuk PCM**. Hem disk hem son aday bu kabul koşullarını geçti.

| Ölçüm | Disk v67 | Son v68 rapor provası |
| --- | --- | --- |
|p50 /p95 /p99 teslim ms|20.54 /61.93 /70.64|14.27 /32.28 /44.99|
|max teslim ms|74.05|55.40|
|event loop p99 ms|59.83|30.33|
|CPU ms /geçen ms|2155 /2430.2|1938 /2432.5|

Aynı hostta yaklaşık2.4 s/50 pps ölçümüdür; host yüküyle değişir, hızlanma garantisi değildir. Yavaş soket basıncı deterministik enjekte edilir; sağlam peer baytları gerçek WS'de karşılaştırılır.300 fiziksel telefon,300 sürekli HTTP dinleyici veya uzun roaming/soak testi değildir.

Native PCM ham çıkış972×50×300=**116.64 Mbit/s**, TLS/TCP/IP hariç; base64 PCM tabanı **153.6 Mbit/s**, JSON hariç.300 HTTP dinleyicide100 ms poll yaklaşık3000 istek/s. Soft/hard drop sağlam alıcıyı korur; sınırsız gecikmesiz sıfır kayıp sağlamaz. bufferedAmount gönderim için kuyruklanan veri miktarıdır, alıcıda oynatma ACK'i değildir. [WHATWG bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount).

## 4. Kapanmamış saha ve mimari kabul sınırları

Public MQTT imzası istemcide bilinen sabite dayanır; oda ACL'si veya sunucunun yayıncı yetkisi değildir. V66 yerel broker callback ömrünü, v67 native token ömrünü, v68 server üyelik rol sınırını çitler. Public MQTT logout/yayın yetkisi, farklı UUID/broker yolları arasında global oda otoritesi ve aynı rol deviceId sahipliğinin kriptografik doğrulanması bu yamayla çözülmüş sayılmaz.

Relay/oda state'i process RAM'indedir; çoklu serverless instance için ortak state veya tek otorite gerekir. Canlı deployment, VDS NIC/TLS kapasitesi ve multi-instance failover bu turda ölçülmedi.

Mono mikrofon çakışan rehber/yan konuşmacı bileşenlerini yüzde100 ayıramaz. BroadcastChannel başka telefonun hoparlörüne AEC referansı sağlamaz. echoCancellation=true UA isteğidir;50–400 ms çapraz cihaz akustik kuyruğunu her ortamda kaldırma garantisi değildir. [W3C echoCancellation](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-echocancellation).

AudioContext askıda işlemeyi durdurur; gerçek zamanlı verinin bir bölümü kaybolabilir, resume kayıp konuşmayı geri getirmez. [W3C suspend](https://www.w3.org/TR/webaudio/#dom-audiocontext-suspend). iOS/Android kilit, alarm/arama, WhatsApp, HFP/SCO ve yoğun4G/5G/roaming fiziksel cihaz kabulü gerekir. PLC kayıp sözcüğü geri üretmez; test paketi sıfır akustik yankı/kopma sertifikası değildir.

Yeni P0/P3 doğrulanmadı; **P1-68-01 ve P2-68-02 dışında yeni somut kusur doğrulanmadı**. Önceki mimari sınırlar kapatılmış sayılmıyor ve başka kusur bulunamayacağı iddia edilmiyor.

## 5. v68 test kapsamı ve gerçek CLI prova düzeni

**ADIM-3.V68** gerçek server/HTTP/WS ile iki negatif senaryoyu, ardından aynı-role pilgrim reconnect'i, farklı isimli yetkili guide replacement'ını, public metadata rejoin'in HTTP guide'ı emekliye ayıramamasını, native public çakışmasında HTTP guide'ın korunmasını, gerçek prepare/commit handoff ve eski capability409'u sınar. Aynı sokette listener'a düşme, ana/alt terminal stop, eski rolden PCM54 reddi ve yeni epoch12 ile yeniden guide olup PCM55 yayınlama da dahildir.

Ana ve alt oda PCM sırası **[40,41,42,51,52,53,55]**, bayt eşliği true; guideHandoffEpoch10, resumeEpoch12. Aynı rol device dedup'u kasıtlı korunur: son ana senaryoda rol değişiminde role özgü ayrı listener ID'si kullanılır; bağımsız downgrade fixture'ı ve Unit aynı ID ile rol değişimini de sınar. Reconnect'in beklenen aynı-role kapatması, cross-role koruması sanılarak gizlenmez.

**ADIM-5.V68** üretim join/wrapper/serialize/source/state/presence fonksiyonlarını VM'de çalıştıran7 grup içerir: native/opaque/legacy guide × native/HTTP pilgrim **6 çakışma kombinasyonu** ve metadata rejoin; ters yönde guide'ın listener'ı koruması; aynı-role native/HTTP reconnect ve değiştirilmiş guide adı; PIN/auth/oda-sınırlı guide-name sözleşmesi; aynı sokette son guide downgrade+resume; bekleyen başka rehberin owner devralması; dedicated downgrade sonrası Genel source/state/epoch mirası. Kaynakla aynı boolean'ı tekrar hesaplamak yerine üyelik, socket termination, capability retirement ve gerçek controller kabulü gözlenir.

Yalnız iki yeni recordResult ile52→54. Eski V51..V67 kontrolleri korunur; cache beklentileri68 olur.

| Koşu / kontrol | Sonuç |
| --- | --- |
| Değiştirilmemiş disk v67, normal CLI | **52/52 PASS, exit0** |
| Yeni E2E + orijinal v67 server | İki bozuk probe ölçüldü; rehber korunumu koşulunda **FAIL, exit1** |
| Son tek v68 diff'inden kurulan gerçek CLI bellek provası | **54/54 PASS, exit0** |
| Başlangıç v67 diff ters kontrolü | **exit0** |
| v68 git apply --check - | **exit0** |
| v68 git apply --check --ignore-space-change - | **exit0** |
| Kalıcı uygulama/test kaynak değişikliği | **Yok** |

Rapordaki tek diff her hunk bağlamı diskteki kaynakla eşleştirilerek bellekte uygulanır. Geçici CommonJS preload fs/module compile ve syntax okumalarını bu adaya yönlendirir; gerçek komut **node --require <geçici-preload.cjs> scripts/verify-system.js**'dir. Verifier main ve localhost sunucusu gerçektir; verifier'ın raporu kaynak olarak okuması engellenir. Uygulama/test kaynakları diskte yamalanmaz.

Her koşudan önce data/runtime.json **ReadAllBytes** ile alınmış; dış finally aynı byte dizisini **WriteAllBytes** ile geri yazmış ve preload'u silmiştir. Son runtime SHA-256 **142391142c78422eae2fcf5eb7ad02e9f48bf7b568b44d8687cc023bc3e83dc2**; runtime Git farkı yoktur.15 kaynak başlangıç hash'iyle eşleşir. Son status yalnız **M AUDIO_EXCELLENCE_REPORT.md**, **D AUDIT_FIX_SUMMARY.md**, **D AUDIT_REPORT.md**; kullanıcı silinmeleri korunmuştur.

## 6. Doğrudan uygulanabilir tek v68 unified diff

Taban **82e4d5658116639ef423de2e060dbebf3b041b07**.11 hedef: server.js, scripts/verify-system.js, public/sw.js ve shim kullanan8 HTML. Cache/shim URL68; capture60-audio / player61-audio korunur. Yeni wire alanı, timer, growing map veya ses kopyası eklenmez; production davranış değişikliği server join yolundadır.

Diff **37.716 UTF-8 bayt**, SHA-256 **155a36444630328b8f5a928fbbf7b330c44e6e5e08560ca618f1cc37306ec612**. Kaynaklara uygulanmamıştır. Uygulamadan önce check edin; uygulama sonrasında normal node scripts/verify-system.js ile54/54 sonucunu doğrulayın.

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -1004,7 +1004,8 @@
     const targetRoom = getOrCreateRoom(tourCode, roomId);
     ctx.currentRoom = targetRoom;
     const deviceId = msg.deviceId ? String(msg.deviceId).trim() : '';
-    const previousSource=prevRoom===targetRoom?targetRoom.clients.get(clientId)?.audioSourceId:null;
+    const previousClient=prevRoom===targetRoom?targetRoom.clients.get(clientId):null;
+    const previousSource=previousClient?.audioSourceId;
     const clientObj = {
       ws,
       id: clientId,
@@ -1020,7 +1021,8 @@
     for (const r of getTourRooms(tourCode)) {
       for (const [existingId, existingClient] of r.clients.entries()) {
         if (existingId === clientId || existingClient.ws === ws) continue;
-        const sameDevice = Boolean(deviceId && existingClient.deviceId && existingClient.deviceId === deviceId);
+        // deviceId is client metadata; a listener must never evict a guide by copying it.
+        const sameDevice = Boolean(role === existingClient.role && deviceId && existingClient.deviceId && existingClient.deviceId === deviceId);
         const sameGuide = Boolean(role === 'guide' && existingClient.role === 'guide' && r.roomId === roomId && existingClient.name === clientObj.name);
         if (sameDevice || sameGuide) {
           if(existingClient.ws?.isHttpRelay){
@@ -1042,6 +1044,10 @@
     targetRoom.clients.set(clientId, clientObj);
     if (prevRoom && prevRoom !== targetRoom) {
       removeClientFromRoom(prevRoom, clientId, 0);
+    } else if(previousClient?.role==='guide'&&role!=='guide'){
+      // Keep the new listener membership, release the former publisher and sync inheritance/stop.
+      if(targetRoom.activePublisherClientId===clientId)targetRoom.activePublisherClientId=null;
+      evaluateTourGuidePresence(tourCode);
     }
     if (role === 'guide' && guideDisconnectTimers.has(targetRoom.key)) {
       clearTimeout(guideDisconnectTimers.get(targetRoom.key));
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -588,6 +588,7 @@
   await runV65ReadinessChecks({baseUrl,url:wsUrl,token:authToken});
   await runV66MqttOwnershipChecks({baseUrl,url:wsUrl,token:authToken});
   await runV67NativeAuthChecks({baseUrl,url:wsUrl,token:authToken,credentials:loginCredentials});
+  await runV68RoleBoundaryChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1540,9 +1541,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v67"));assert(sw.includes('/vercel-ws-shim.js?v=67'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v68"));assert(sw.includes('/vercel-ws-shim.js?v=68'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'67',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'68',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2507,7 +2508,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2717,7 +2718,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2956,7 +2957,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3141,7 +3142,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3328,7 +3329,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3492,7 +3493,7 @@
     const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
     checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
   recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
 }
@@ -3663,7 +3664,7 @@
     h.s.close();assert(h.clients.every(c=>c.ended===1));assert.equal(h.received.length,0);
     checks.push('100-replacements-bounded-active-clients-invalidate-before-synchronous-end');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('vercel-ws-shim.js?v=67'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('vercel-ws-shim.js?v=68'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V66 UNIT METRICS '+JSON.stringify({checks,clientsAfterDelayedClose:0,staleDelivered:0,activeClientsMax:2,replacements:100}));
   recordResult('ADIM-5.V66','MQTT loader/client/suback/timer ownership across route, close and native takeover; bounded replacement; cache66',true);console.log('V66 UNIT PASS');
@@ -3785,7 +3786,7 @@
     sockets.clear();const idle=member('idle-expired','json-expired');g.heartbeat();assert.equal(idle.ws.terminated,1);assert.equal(idle.currentRoom,null);
     checks.push('real-binary-and-JSON-ingress-reject-expired-credentials-idle-heartbeat-cleans-membership');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('vercel-ws-shim.js?v=67'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('vercel-ws-shim.js?v=68'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V67 UNIT METRICS '+JSON.stringify({checks,expiredGuidePresent:false,expiryGraceMs:0,revokedGuideTerminated:1,revokedAdminTerminated:1,healthyTerminated:0,publicFamilyTerminated:0,cancelledPrepare:true}));
   recordResult('ADIM-5.V67','Native live credential expiry/revoke, token rotation, pending handoff cleanup, public-family isolation and HTTP/static compatibility; cache67',true);console.log('V67 UNIT PASS');
@@ -3860,6 +3861,197 @@
   }
 }
 
+
+function createV68MembershipHarness(source){
+  const assert=require('node:assert/strict'),rooms=new Map(),sessions=new Map(),events=[];
+  const room=(id='genel')=>{if(!rooms.has(id))rooms.set(id,{key:'T:'+id,tourCode:'T',roomId:id,clients:new Map(),isLive:true,broadcastMode:'mic',
+    audioSourceId:'page',audioStateKnown:true,audioStateSeq:10,audioMediaEpoch:10,activePublisherClientId:null});return rooms.get(id);};
+  const g={Date,Map,Set,Boolean,String,clientSeq:1,liveRooms:rooms,httpRelaySessions:sessions,guideDisconnectTimers:new Map(),WebSocket:{OPEN:1},
+    db:{tours:[{code:'T',pinProtected:true,pin:'6068'}],announcements:[],siyerPoints:[]},
+    isValidAuthToken:t=>t==='good',getOrCreateRoom:(code,id)=>room(id),getTourRooms:()=>Array.from(rooms.values()),
+    getTourSteps:()=>[],computeJourneyStats:()=>({}),broadcastToAdmins(){},broadcastToFamilyTrackers(){},broadcastToRoom:(r,p)=>events.push({room:r.roomId,message:p}),broadcastRoomState(){},removeClientFromRoom:(r,id)=>r.clients.delete(id),clearTimeout(){}};
+  function pick(name){const m=new RegExp('^function '+name+'\\(','m').exec(source);assert(m,'V68 missing '+name);
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const code=source.slice(m.index,end+1);try{new vm.Script(code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V68 unterminated '+name);}
+  vm.createContext(g);vm.runInContext(['serializeRoom','sendRysSubscriptionAck','getTargetBroadcastRooms','setRysAudioSource','evaluateTourGuidePresence','acceptRysAudioState','processClientJsonMessage','processClientJsonMessageV49'].map(pick).join('\n'),g);
+  const context=(id,http=false)=>({clientId:id,currentRoom:null,isAuthenticated:false,ws:{isHttpRelay:http,isAuthenticated:false,readyState:1,terminated:0,messages:[],
+    send(raw){this.messages.push(JSON.parse(raw));},terminate(){this.terminated++;this.readyState=3;}}});
+  const seed=(id,role,deviceId,options={})=>{const c=context(id,!!options.http),r=room(options.roomId||'genel');
+    c.currentRoom=r;c.isAuthenticated=role==='guide';c.ws.isAuthenticated=c.isAuthenticated;
+    r.clients.set(id,{id,ws:c.ws,role,deviceId,name:options.name||id,audioSourceId:role==='guide'?'page':null,lang:'tr'});
+    if(role==='guide')r.activePublisherClientId=id;
+    if(options.http){c.relayKey=options.legacy?undefined:'a'.repeat(48);c.relayRetired=false;sessions.set(id,c);}
+    return c;};
+  const join=(c,extra={})=>{const msg={type:'join',tourCode:'T',roomId:'genel',role:'pilgrim',pin:'6068',name:c.clientId,...extra};
+    g.processClientJsonMessageV49(c,msg);return c;};
+  return {g,rooms,sessions,events,room,context,seed,join};
+}
+
+
+async function runStep5V68AudioChecks(){
+  const assert=require('node:assert/strict'),source=fs.readFileSync(path.join(ROOT_DIR,'server.js'),'utf8').replace(/\r\n/g,'\n'),checks=[];
+  let collisionCases=0;
+  for(const oldOptions of [{},{http:true},{http:true,legacy:true}])for(const incomingHttp of [false,true]){
+    const h=createV68MembershipHarness(source),guide=h.seed('guide','guide','shared',oldOptions),p=h.context('public',incomingHttp);
+    h.join(p,{deviceId:' shared ',roomId:'siyer'});assert(h.room().clients.has('guide'),'Public device metadata must not remove a guide');
+    assert.equal(guide.ws.terminated,0);assert.equal(h.room().activePublisherClientId,'guide');if(oldOptions.http)assert.equal(guide.relayRetired,false);
+    h.join(p,{deviceId:'shared',roomId:'siyer',name:'metadata update',phone:'123'});assert(h.room().clients.has('guide'));assert.equal(h.room().audioMediaEpoch,10);
+    assert.equal(p.currentRoom.clients.get('public').role,'pilgrim');collisionCases++;
+  }
+  checks.push('native-opaque-legacy-guides-survive-native-HTTP-pilgrim-device-collision-and-metadata-rejoin');
+  {
+    const h=createV68MembershipHarness(source),listener=h.seed('listener','pilgrim','shared',{http:true}),guide=h.context('new-guide');
+    h.join(guide,{role:'guide',deviceId:'shared',name:'different',audioSourceId:'new-page',token:'good'});
+    assert(h.room().clients.has('listener'));assert.equal(listener.relayRetired,false);
+    h.g.processClientJsonMessage(guide,{type:'guide-stream-state',audioStateSeq:11,audioMediaEpoch:11,isLive:true,broadcastMode:'mic'});
+    assert.equal(h.room().activePublisherClientId,'new-guide');checks.push('authorized-guide-collision-preserves-existing-listener');
+  }
+  {
+    const h=createV68MembershipHarness(source),guide=h.seed('guide','guide','shared'),old=h.seed('old-listener','pilgrim','shared');
+    h.join(h.context('replacement'),{deviceId:'shared',roomId:'siyer'});assert.equal(old.ws.terminated,1);assert(!h.room().clients.has('old-listener'));assert(h.room().clients.has('guide'));
+    const oldHttp=h.seed('old-http','pilgrim','other',{http:true});h.join(h.context('new-http',true),{deviceId:'other'});assert.equal(oldHttp.relayRetired,true);
+    const publisher=h.seed('old-publisher','guide','publisher',{http:true});h.join(h.context('new-publisher'),{role:'guide',deviceId:'publisher',name:'renamed',token:'good'});
+    assert.equal(publisher.relayRetired,true);assert.equal(h.room().activePublisherClientId,'new-publisher');
+    checks.push('same-role-pilgrim-reconnect-and-renamed-guide-replacement-still-retire-old-memberships');
+  }
+  {
+    const h=createV68MembershipHarness(source),guide=h.seed('guide','guide','x',{name:'same name'});
+    h.join(h.context('bad'),{role:'guide',deviceId:'x',token:'invalid'});assert(h.room().clients.has('guide'));
+    h.join(h.context('wrong-pin'),{deviceId:'x',pin:'wrong'});assert(h.room().clients.has('guide'));
+    h.join(h.context('name-replacement'),{role:'guide',deviceId:'different',name:'same name',token:'good'});assert.equal(guide.ws.terminated,1);
+    const other=h.seed('other-room','guide','other',{roomId:'siyer',name:'same name'});h.join(h.context('general-name'),{role:'guide',name:'same name',token:'good'});
+    assert.equal(other.ws.terminated,0);checks.push('PIN-auth-and-room-scoped-guide-name-replacement-contracts-preserved');
+  }
+  {
+    const h=createV68MembershipHarness(source),guide=h.seed('owner','guide','shared');h.room('siyer');
+    h.join(guide,{role:'pilgrim',deviceId:'shared'});assert.equal(h.room().clients.get('owner').role,'pilgrim');assert.equal(guide.ws.terminated,0);
+    for(const r of h.rooms.values()){assert.equal(r.isLive,false);assert.equal(r.audioStateEnded,true);}
+    assert.equal(h.room().activePublisherClientId,null);
+    h.join(guide,{role:'guide',deviceId:'shared',audioSourceId:'page',token:'good'});
+    h.g.processClientJsonMessage(guide,{type:'guide-stream-state',audioStateSeq:11,audioMediaEpoch:11,isLive:true,broadcastMode:'mic'});
+    assert.equal(h.room().isLive,true);assert.equal(h.room().activePublisherClientId,'owner');
+    checks.push('same-socket-last-guide-downgrade-keeps-listener-clears-owner-stops-main-sub-and-can-resume');
+  }
+  {
+    const h=createV68MembershipHarness(source),owner=h.seed('owner','guide','one'),waiting=h.seed('waiting','guide','two');
+    h.room().activePublisherClientId='owner';h.join(owner,{role:'pilgrim',deviceId:'one'});
+    assert.equal(h.room().activePublisherClientId,null);
+    h.g.processClientJsonMessage(waiting,{type:'guide-stream-state',audioStateSeq:11,audioMediaEpoch:11,isLive:true,broadcastMode:'mic'});
+    assert.equal(h.room().activePublisherClientId,'waiting');checks.push('downgraded-listener-cannot-block-another-existing-guide');
+  }
+  {
+    const h=createV68MembershipHarness(source);h.seed('general','guide','g');const dedicated=h.seed('dedicated','guide','d',{roomId:'siyer'});
+    Object.assign(h.room('siyer'),{audioSourceId:'dedicated-page',audioStateSeq:30,audioMediaEpoch:30});h.room('siyer').clients.get('dedicated').audioSourceId='dedicated-page';
+    h.join(dedicated,{role:'pilgrim',roomId:'siyer',deviceId:'d'});
+    assert.equal(h.room('siyer').clients.get('dedicated').role,'pilgrim');assert.equal(h.room('siyer').activePublisherClientId,null);
+    assert.equal(h.room('siyer').audioSourceId,'page');assert.equal(h.room('siyer').audioMediaEpoch,10);assert.equal(h.room('siyer').isLive,true);
+    checks.push('dedicated-guide-downgrade-restores-General-source-state-epoch-inheritance');
+  }
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('vercel-ws-shim.js?v=68'));
+  assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V68 UNIT METRICS '+JSON.stringify({checks,collisionCases,crossRoleGuideEvictions:0,downgradeOwner:null,sameRoleReconnect:true,terminalStop:true,coveredByGenel:true}));
+  recordResult('ADIM-5.V68','Role-isolated device dedup; native/HTTP/legacy collisions; same-role reconnect; same-socket downgrade/owner release/terminal stop and General inheritance; cache68',true);console.log('V68 UNIT PASS');
+}
+
+
+async function runV68RoleBoundaryChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),code='RY-V68-'+Date.now().toString(36).toUpperCase(),device='v68-shared-'+code;
+  const auth={'Content-Type':'application/json',Authorization:'Bearer '+token},headers={'Content-Type':'application/json'},sockets=[],caps=[],controls=[],mainAudio=[],subAudio=[],faults=[],pcm=Buffer.alloc(960);let h,created=false;
+  for(let i=0;i<480;i++)pcm.writeInt16LE(Math.round(6500*Math.sin(2*Math.PI*400*i/24000)),2*i);
+  const until=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error('V68 deadline '+label);await new Promise(r=>setTimeout(r,5));}};
+  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200,'V68 relay '+body.type);return r.json();};
+  const open=async()=>{const r=await post({type:'relay-open',version:56}),c={clientId:r.clientId,relayKey:r.relayKey,seq:0};caps.push(c);return c;};
+  const capBody=(c,context,messages=[])=>({clientId:c.clientId,relayKey:c.relayKey,requestSeq:++c.seq,subscriptionContext:context,messages});
+  const capPost=(c,context,messages=[])=>post(capBody(c,context,messages));
+  const join=(role,roomId,name,deviceId)=>({type:'join',role,tourCode:code,roomId,name,deviceId,pin:'6068',...(role==='guide'?{token,audioSourceId:'page-main'}:{})});
+  const connect=async()=>{const s=new WebSocket(url);sockets.push(s);s.messages=[];s.on('error',e=>faults.push(e.message));
+    s.on('message',(raw,binary)=>{if(!binary)s.messages.push(JSON.parse(raw));});
+    await new Promise((resolve,reject)=>{s.once('open',resolve);s.once('error',reject);});return s;};
+  const joined=async(s,context)=>{const n=s.messages.filter(m=>m.type==='joined').length;s.send(JSON.stringify(context));await until(()=>s.messages.filter(m=>m.type==='joined').length===n+1,'join '+context.name);return s.messages.filter(m=>m.type==='joined').at(-1);};
+  const barrier=async s=>{const ts=Date.now()+Math.random();s.send(JSON.stringify({type:'ping',ts}));await until(()=>s.messages.some(m=>m.type==='pong'&&m.echoTs===ts),'pong');};
+  const boot=async()=>{const r=await fetch(baseUrl+'/api/bootstrap',{headers:auth});assert.equal(r.status,200);const b=await r.json();return b.liveRooms.filter(r=>r.tourCode===code);};
+  const state=(seq,epoch=10)=>({type:'guide-stream-state',audioStateSeq:seq,audioMediaEpoch:epoch,isLive:true,broadcastMode:'mic'});
+  const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+  const audio=(seq,epoch=10)=>({type:'audio-chunk',seq,audioSourceId:'page-main',audioMediaEpoch:epoch,sentAt:Date.now(),sampleRate:24000,pcm16:pcm.toString('base64'),level:.5});
+  class Bridge{constructor(address){this.real=new WebSocket(address);sockets.push(this.real);this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));this.real.on('error',e=>faults.push(e.message));
+    this.real.on('message',(raw,binary)=>{if(!binary)controls.push(JSON.parse(raw));this.onmessage?.({data:binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString()});});}
+    get readyState(){return this.real.readyState;}send(raw){this.real.send(raw);}close(){this.real.close();}}
+  try{
+    const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers:auth,body:JSON.stringify({code,name:'V68 membership role boundary',pin:'6068'})});assert.equal(r.status,200);await r.arrayBuffer();created=true;
+    // Independent same-socket downgrade fixture, before a collision can disconnect the main guide.
+    const dropCap=await open(),dropContext=join('pilgrim','role-drop','drop listener','drop-listener-'+code);
+    await capPost(dropCap,dropContext);const drop=await connect();
+    await joined(drop,{...join('guide','role-drop','downgrade owner','drop-device'),audioSourceId:'drop-page'});
+    drop.send(JSON.stringify(state(10)));drop.send(binary(700));await barrier(drop);
+    assert((await capPost(dropCap,dropContext)).messages.some(m=>m.type==='audio-chunk'&&m.seq===700));
+    await joined(drop,join('pilgrim','role-drop','former guide listener','drop-device'));await barrier(drop);
+    const stopped=(await boot()).find(r=>r.roomId==='role-drop');
+    const waiting=await connect();await joined(waiting,{...join('guide','role-drop','waiting guide','waiting-device'),audioSourceId:'takeover-page'});
+    waiting.send(JSON.stringify(state(20,20)));waiting.send(binary(701));await barrier(waiting);
+    const takeover=(await capPost(dropCap,dropContext)).messages.some(m=>m.type==='audio-chunk'&&m.seq===701);
+    const downgradeProbe={liveAfterLastGuideDowngrade:stopped.isLive,ended:stopped.audioStateEnded,takeoverPcm:takeover,formerSocketOpen:drop.readyState===WebSocket.OPEN};
+    console.log('V68 DOWNGRADE PROBE '+JSON.stringify(downgradeProbe));
+
+    h=createV61ListenerHarness(fs.readFileSync(path.join(PUBLIC_DIR,'dinle.html'),'utf8'),fs.readFileSync(path.join(PUBLIC_DIR,'pcm-player-worklet.js'),'utf8'),Bridge);
+    const address=new URL(url);h.g.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};h.g.document.getElementById('tourPinInput').value='6068';h.connect(code);
+    await until(()=>controls.some(m=>m.type==='joined'),'witness joined');
+    const main=await open(),sub=await open(),mainContext=join('pilgrim','genel','main witness','main-witness'),subContext=join('pilgrim','siyer','sub witness','sub-witness');
+    const poll=async()=>{for(const [cap,context,out] of [[main,mainContext,mainAudio],[sub,subContext,subAudio]]){const r=await capPost(cap,context);out.push(...r.messages.filter(m=>m.type==='audio-chunk'));}};
+    await poll();const guide=await connect(),guideContext=join('guide','genel','original guide',device),guideAck=await joined(guide,guideContext);
+    guide.send(JSON.stringify(state(10)));guide.send(binary(40));await barrier(guide);await until(()=>h.player.q.has(40),'initial main PCM');await poll();
+
+    const publicNative=await connect(),publicContext=join('pilgrim','siyer','public collider',device);await joined(publicNative,publicContext);
+    const snapshot=(await boot()).find(r=>r.roomId==='genel'),guidePresent=snapshot.connectedGuides.some(g=>g.id===guideAck.clientId);
+    if(guidePresent){guide.send(binary(41));await barrier(guide);await until(()=>h.player.q.has(41),'PCM after collision');}
+    else await until(()=>guide.readyState===WebSocket.CLOSED,'broken guide evicted');
+    await poll();const collisionProbe={guidePresent,guideOpen:guide.readyState===WebSocket.OPEN,afterCollisionPcm:mainAudio.some(m=>m.seq===41)};
+    console.log('V68 COLLISION PROBE '+JSON.stringify(collisionProbe));
+    assert(guidePresent,'A public pilgrim must not evict a guide by copying deviceId');
+    assert.equal(downgradeProbe.liveAfterLastGuideDowngrade,false);assert.equal(downgradeProbe.ended,true);
+    assert(takeover,'A former guide in listener role must not block a valid replacement publisher');assert(downgradeProbe.formerSocketOpen);
+    assert(collisionProbe.afterCollisionPcm);
+
+    // Same-role pilgrim reconnect remains deduplicated, while the guide with that ID survives.
+    const publicHttp=await open(),publicHttpContext=join('pilgrim','genel','public HTTP collider',device);
+    await capPost(publicHttp,publicHttpContext);await until(()=>publicNative.readyState===WebSocket.CLOSED,'same-role listener replacement');
+    assert.equal(guide.readyState,WebSocket.OPEN,'Guide survives same-role pilgrim replacement');guide.send(binary(42));await barrier(guide);await poll();
+    assert((await capPost(publicHttp,publicHttpContext)).messages.some(m=>m.type==='audio-chunk'&&m.seq===42));
+
+    // Authorized same-role guide replacement may use a changed display name.
+    const relayGuide=await open(),relayContext=join('guide','genel','renamed HTTP guide',device);
+    await capPost(relayGuide,relayContext,[state(11),audio(51)]);await until(()=>guide.readyState===WebSocket.CLOSED&&h.player.q.has(51),'legitimate guide replacement');
+    await poll();assert((await capPost(publicHttp,publicHttpContext)).messages.some(m=>m.type==='audio-chunk'&&m.seq===51));
+    await capPost(publicHttp,{...publicHttpContext,name:'public metadata update',phone:'123'});
+    await capPost(relayGuide,relayContext); // Must still be 200; no public-context retirement.
+    const secondPublic=await connect();await joined(secondPublic,join('pilgrim','siyer','native versus HTTP guide',device));
+    await capPost(relayGuide,relayContext,[audio(52)]);await until(()=>h.player.q.has(52),'HTTP guide after native collider');await poll();
+    const publicRetired=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(capBody(publicHttp,publicHttpContext))});assert.equal(publicRetired.status,409);await publicRetired.arrayBuffer();
+
+    // Real two-phase handoff keeps the cross-role listener, and retires only its source guide.
+    const native=await connect();native.send(JSON.stringify({type:'handoff-prepare',relayClientId:relayGuide.clientId,relayKey:relayGuide.relayKey,subscription:relayContext}));
+    await until(()=>native.messages.some(m=>m.type==='handoff-prepared'),'prepare');const handoffId=native.messages.find(m=>m.type==='handoff-prepared').handoffId;
+    native.send(JSON.stringify({type:'handoff-commit',handoffId}));await until(()=>native.messages.some(m=>m.type==='handoff-committed'),'commit');
+    assert.equal(native.messages.find(m=>m.type==='handoff-committed').ack.room.audioMediaEpoch,10);assert.equal(secondPublic.readyState,WebSocket.OPEN,'Cross-role listener survives guide handoff');
+    native.send(binary(53));await barrier(native);await until(()=>h.player.q.has(53),'handoff PCM');await poll();
+    const retired=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(capBody(relayGuide,relayContext))});assert.equal(retired.status,409);await retired.arrayBuffer();
+
+    // Same socket can explicitly become a listener, stop inheritance and then resume as guide.
+    await joined(native,join('pilgrim','genel','downgraded native listener','role-listener-'+code));await barrier(native);
+    await until(()=>h.g.rxStreamActive===false,'downgrade terminal stop');assert.equal(h.player.q.size,0);
+    const terminalRooms=await boot();for(const id of ['genel','siyer']){const r=terminalRooms.find(r=>r.roomId===id);assert.equal(r.isLive,false);assert.equal(r.audioStateEnded,true);}
+    native.send(binary(54));await barrier(native);await poll();assert(!mainAudio.some(m=>m.seq===54));
+    await joined(native,relayContext);native.send(JSON.stringify(state(12,12)));native.send(binary(55));await barrier(native);await until(()=>h.player.q.has(55),'same-socket resume');await poll();
+    assert.equal(h.g.rxAudioMediaEpoch,12);assert.equal(secondPublic.readyState,WebSocket.OPEN,'Listener survives guide role restoration');
+    const expected=[40,41,42,51,52,53,55];assert.deepEqual(mainAudio.map(m=>m.seq),expected);assert.deepEqual(subAudio.map(m=>m.seq),expected);
+    for(const m of [...mainAudio,...subAudio])assert(Buffer.from(m.pcm16,'base64').equals(pcm));assert.deepEqual(faults,[]);
+    console.log('V68 E2E METRICS '+JSON.stringify({collision:collisionProbe,downgrade:downgradeProbe,mainPcm:expected,subPcm:expected,publicMetadataGuideRetirement:false,sameRoleListenerDedup:true,guideHandoffEpoch:10,resumeEpoch:12,oldCapabilities409:true,pcmEqual:true}));
+    recordResult('ADIM-3.V68','Real native/HTTP role collision isolation; same-role reconnect and authorized handoff; metadata safety; same-socket downgrade/terminal stop/owner takeover/resume; PCM parity',true);console.log('V68 E2E PASS');
+  }finally{
+    h?.g.leaveRoom();for(const s of sockets)try{s.terminate();}catch(e){}
+    for(const c of caps)try{await post({type:'relay-close',version:56,clientId:c.clientId,relayKey:c.relayKey});}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:auth});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -3881,6 +4073,7 @@
     await runStep5V65AudioChecks();
     await runStep5V66AudioChecks();
     await runStep5V67AudioChecks();
+    await runStep5V68AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=67"></script>
+  <script src="/vercel-ws-shim.js?v=68"></script>
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
-  <script src="/vercel-ws-shim.js?v=67"></script>
+  <script src="/vercel-ws-shim.js?v=68"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -2653,7 +2653,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=67').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=68').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=67"></script>
+  <script src="/vercel-ws-shim.js?v=68"></script>
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
-  <script src="/vercel-ws-shim.js?v=67"></script>
+  <script src="/vercel-ws-shim.js?v=68"></script>
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
-  <script src="/vercel-ws-shim.js?v=67"></script>
+  <script src="/vercel-ws-shim.js?v=68"></script>
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
-  <script src="/vercel-ws-shim.js?v=67"></script>
+  <script src="/vercel-ws-shim.js?v=68"></script>
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
-  <script src="/vercel-ws-shim.js?v=67"></script>
+  <script src="/vercel-ws-shim.js?v=68"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v67';
+const CACHE_NAME = 'ridvanses-pwa-v68';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=67',
+  '/vercel-ws-shim.js?v=68',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
   '/pcm-player-worklet.js?v=61-audio',
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=67"></script>
+  <script src="/vercel-ws-shim.js?v=68"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```
