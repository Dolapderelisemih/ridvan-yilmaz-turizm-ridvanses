# RıdvanSes v67 — v66 Uygulama, Uçtan Uca Ses ve Native Yetki Ömrü Denetimi

Denetim: **10 Kasım 2026**, kök **D:/umresesliyazılım**. Disk HEAD: **79df33f91cf885c1e1701581c2a47e1fd5cd4471**. Bu turda yalnız bu rapor güncellendi. Aşağıdaki v67 diff'i kaynaklara uygulanmadı; stage, commit, push veya deployment yapılmadı.

**Karar:** v66'nın 11 kaynak hedefi önceki rapor yamasıyla eşleşiyor; reverse-check **exit0**, değiştirilmemiş disk paketi **50/50 PASS, exit0**. Yeni bir **P1-67-01** doğrulandı: native WebSocket token iptalinden/süre dolumundan sonra önbellekteki yetki bayraklarıyla yayın yapabiliyor. Bu yüzden **“SIFIR HATA — v66 %100 ONAYLI (PRODUCTION-READY)” onayı verilmiyor**. Tek v67 çözümü ve iki yeni test, gerçek CLI bellek provasında **52/52 PASS, exit0** verdi. Sonuç test kapsamındaki davranışları kanıtlar; bütün olası kod kusurlarının yokluğunu veya sahada sıfır kopmayı kanıtlamaz.

## 1. v66 uygulama eşliği

| Kontrol | Kanıt |
| --- | --- |
| Başlangıç raporundaki v66 diff | Tek diff;30.758 UTF-8 bayt; SHA-256 **1f69c5b760cdf3c3fd163ec5687efee472526654d49b87bdfa4ed454320c896c** |
| git apply --reverse --check --ignore-space-change - | Başlangıçta ve nihai kontrolde **exit0**, stderr boş |
| node scripts/verify-system.js | Disk v66 üzerinde **50 / 50 [BAŞARILI / PASS], exit0**, V53..V66 E2E/Unit dahil |
| HEAD stat | 11 kaynak + rapor =12 dosya;579 ekleme /495 silme |
| Başlangıç çalışma ağacı | Yalnız AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md silinmiş |
| Kalıcı kaynak düzenlemesi | Yok;15 incelenen kaynak dosyasının ham hash'leri başlangıçla aynı |
| Workletler | Capture60-audio / player61-audio korunmuş; yeni DSP yaması gerektiren kusur bu turda doğrulanmadı |

### 1.1 İstenen 11 hedef dosyanın gerçek satırları

Aşağıdaki konumlar **disk HEAD79df33f** içindir; v67 sonrası satırlar değildir.

| Dosya / gereksinim | Satır ve değerlendirme |
| --- | --- |
| public/vercel-ws-shim.js / _closeMqttClients |401–410: generation403 ve timer iptali404, end(true)406'dan önce; client listesi408 ve topic409'da temizleniyor. **Topic temizliği end döngüsünden sonradır**; önceki v66 diff'i de tam olarak böyledir. Senkron end callback'leri generation çiti nedeniyle iş yapamaz. |
| public/vercel-ws-shim.js / _initMqttBus |412–419: senkron close413, generation414, relay/OPEN/explicit-close bekçisi415–417; loader419'da aynı sahipliği denetliyor. |
| public/vercel-ws-shim.js / broker callback'leri | connect444–445, subscription ACK454–455, message476–477: eski generation reddi eylemden/parsing/dedup'tan önce. |
| public/vercel-ws-shim.js / snapshot timer |617–624: generation620; callback622 kontrolü handle623 sıfırlamasından önce. İptal edilmiş eski callback yeni timer'ı bozamıyor. |
| scripts/verify-system.js / fixture |716: ADIM-4.1 MQTT denemesi açık relay üzerinde başlıyor. |
| scripts/verify-system.js / V66 testleri |E2E çağrısı588; runStep5V66AudioChecks3615–3668; runV66MqttOwnershipChecks3670–3728; Unit main çağrısı3749. Disk koşusunda ikisi de PASS. |
| public/sw.js |4: ridvanses-pwa-v66;11: shim?v=66; capture60-audio / player61-audio sabit. |
| public/dinle.html |19: shim?v=66;2656: sw.js?v=66. |
| public/rehber.html |31: shim?v=66. |
| public/panel.html |32: shim?v=66. |
| public/index.html |85: shim?v=66. |
| public/login.html |13: shim?v=66. |
| public/rota.html |12: shim?v=66. |
| public/ani-kitabi.html |10: shim?v=66. |
| public/yaka-karti.html |11: shim?v=66. |

**V66 E2E tekrar ölçümü:** HTTP PCM[100,101,102], native PCM103; staleBrokerDelivered=0, staleSourceResets=0; emekli capability409; native takeover sonrası MQTT client0; geç script sonrası client0; PCM eşliği true. Unit altı grup:100 replacement boyunca en çok2 aktif client, kapanış sonrası0, eski callback teslimi0; loader/route/close/native/suback/dedup/timer çitleri PASS. V66'nın P2-66-01 düzeltmesinde eksik uygulama veya yeni doğrulanmış MQTT sahiplik regresyonu yok.

## 2. Yeni P1-67-01 — Native yayın yetkisi revoke/expiry sonrasında önbellekte kalıyor

### 2.1 Kök neden ve gerçek konumlar

| Disk konumu | Kusur |
| --- | --- |
| [server.js:534](D:/umresesliyazılım/server.js:534)–541 / revokeAuthToken | Oturum map'ten siliniyor ve revoked Set'ine ekleniyor; mevcut native socket'lerin yetkisi/üyeliği değişmiyor. |
| [server.js:609](D:/umresesliyazılım/server.js:609)–620 / isValidAuthToken | Revoke ve expiresAt kontrolü doğru; fakat native ses girişinde bu fonksiyon yeniden çağrılmıyor. |
| [server.js:924](D:/umresesliyazılım/server.js:924)–930 | Geçerli bir JSON tokenı bir kez ws/ctx.isAuthenticated=true yapıyor. Daha sonra isAuthedClient yalnız bu boolean'ları okuyor. |
| server.js:1057,1165 | guide-stream-state / JSON audio-chunk bu cached yetkiyi kullanıyor. |
| [server.js:1298](D:/umresesliyazılım/server.js:1298)–1325 | Handshake yetkisi kaydediliyor; binary giriş1323 yalnız cached bayraklara bakıyor. Token artık geçersizken binary ses fan-out'a çıkabiliyor. |
| server.js:1387–1407 | Close temizliği ve30 s heartbeat yalnız soket liveness'ını izliyor; token ömrü denetlenmiyor. |
| server.js:1521–1532 | Handoff prepare/commit tokenı yeniden denetliyor; fakat bu doğrulama daha sonraki normal native yayın boyunca sürdürülmüyor. |
| server.js:1611–1617,1703–1726 | HTTP relay istek başına yeniden doğrulama yapıyor. Native/HTTP yetki ömrü bu nedenle farklı. |

Bir WebSocket'in TCP bağlantısının canlı olması oturum jetonunun hâlâ geçerli olduğu anlamına gelmez. Rehber başka sekmede logout yaptığında, oturum sunucuda iptal edildiğinde veya30 günlük süre dolduğunda, açık native soket yayın yapmaya devam edebiliyor. HTTP doğrulamasının401 vermesi bu mevcut soketin cached yetkisini kendiliğinden iptal etmiyor.

### 2.2 Negatif kanıt: değiştirilmemiş v66 sunucusu

Yeni E2E, aday verifier ile **orijinal v66 server.js** üzerinde gerçek login, WebSocket, PCM ve logout uç noktalarını kullandı:

1. Ayrı bir gerçek login oturumu oluşturuldu; token JSON join ile native rehbere verildi.
2. Geçerli binary/JSON PCM30–31 native ve HTTP dinleyiciye ulaştı.
3. Aynı oturum gerçek POST /api/logout ile iptal edildi; rehber soketi istemci tarafından kapatılmadı.
4. Soket üzerinden binary90 ve JSON91 gönderildi; server pong bariyeriyle işlendiği doğrulandı.
5. Ölçüm: **guidePresent=true, isLive=true, postLogoutHttpFrames=2, postLogoutNativeFrames=1**. HTTP'deki iki frame binary'nin JSON fallback'i ve doğrudan JSON PCM'dir; native sayacı yalnız binary frame'i sayar.
6. Test **“Revoked native credentials must not fan out binary/JSON PCM”** koşulunda FAIL / **exit1**,2 !== 0 verdi.

Bu yalnız statik yorum veya sahte token fixture'ı değildir: sunucunun kendi ürettiği ayrı bir oturum gerçek logout ile iptal edildi ve sonrasındaki ses gerçekten iletildi. Ana test/yönetici tokenı iptal edilmedi. Ayrıca gerçek v66 processClientJsonMessageV49 fonksiyonuyla, isValidAuthToken=false iken cached yetkiyle JSON fan-out1 bağımsız probu elde edildi.

### 2.3 v67 düzeltmesi

**Canlı credential bağlama:** geçerli JSON tokenı ctx.rysAuthToken olarak tutulur; handshake tokenı mevcut fallback'tir. Geçersiz yeni bir token mevcut geçerli credential'ı üzerine yazmaz. Handoff doğrulaması kullanılan geçerli credential'ı kaydeder; request, mevcut credential ve handshake sırasıyla değerlendirilir. Böylece prepare sonrası ve commit sonrası native yetki sahibi bilinmektedir.

**Native giriş:** refreshRysNativeAuth hem binary hem JSON mesaj kabulünde sunucunun mevcut token map/revocation/expiry kurallarını tekrar çalıştırır. Boolean bayraklar tek başına yetki vermez. JSON mesajı geçerli yeni token taşıyorsa önce güvenilir credential güncellenir; sonra canlı doğrulama yapılır.

**Yetki kaybı:** mevcut guide/admin veya privileged pending handoff, artık geçerli credential taşımıyorsa cached bayraklar kapatılır; üyelik0 grace ile kaldırılır, hazırlık timer'ı iptal edilir ve native socket sonlandırılır. Logout, revoke işlemi sırasında mevcut native context'leri senkron tarar; HTTP200 cevabından önce bu üyelik temizliği yapılır. Diğer geçerli tokenla çalışan yayıncılar kapanmaz.

**Boşta süre dolumu:** mevcut30 s heartbeat de aynı denetimi yapar. Mesaj gönderen yayıncı ilk geçersiz girişte durdurulur; boşta privileged socket bir sonraki heartbeat'te temizlenir.30 s mevcut nominal timer periyodudur; event-loop duraklamaları için katı duvar saati üst sınırı iddiası değildir.

**Public ve HTTP uyumu:** yalnız dinleyen/aile takip eden native socket açık kalabilir, fakat eski tokenın elevated yetkisi silinir. Sonraki guide/admin yükselmesi yeni geçerli yetki ister; PIN kuralları mevcut işlem yolunda çalışır. HTTP session bu helper'ın kapsamı dışındadır; mevcut istek başı auth/capability/retirement sözleşmesi korunur. Yapılandırılmış AUTH_TOKEN_VALUE için eski kalıcı anahtar davranışı değiştirilmez; bu anahtar normal login oturumunun logout/TTL modeliyle aynı değildir.

Yeni field'lar yalnız server context/socket referansıdır; dış DTO'ya/protokole eklenmez. ws.rysAuthContext close sırasında temizlenir; ikinci bir büyüyen context map'i veya yeni timer yoktur. Binary header972 B, source/state/epoch, HTTP requestSeq/digest/revision, MQTT generation ve DSP değişmez. Yeni maliyet native mesaj başına mevcut Map/Set tabanlı token kontrolü; logout sırasında mevcut WS listesinde bir taramadır.

**Sınır:** iptalden önce kabul edilip ağ/donanım kuyruğuna girmiş sesi geriye dönük geri çekmek mümkün değildir. Testin sıfır değeri logout **sonrasında gönderilen** yeni medyanın kabulü içindir. Terminal stop ulaştığında mevcut receiver reset/fade mekanizması devreye girer. Bu çözüm public MQTT brokerında yetki otoritesi kurmaz; Bölüm4'teki ayrı mimari sınırlar devam eder.

## 3. Uçtan uca ses/DSP ve dağıtım incelemesi

Satırlar diskteki v66 kaynakları içindir.

| Katman | Bulgular ve doğrulama |
| --- | --- |
| Rehber mikrofon / public/rehber.html:1571–1767 |180 ms eski capture sınırı,19200 B gönderim backpressure; getUserMedia1677, module/import beklemeleri ve callback/track/processor sahipliği; preview/start/stop/heal/devicechange. V60'ın17 yaşam döngüsü grubu PASS. Yeni native yetki bulgusu capture işleminden sonraki server kabulündedir. |
| Mikrofon graph / rehber.html:1681–1687 |85 Hz HP;210 Hz -2.5 dB mud cut;3200 Hz +2 dB presence;10500 Hz LP; manuel gain. AEC=true, noiseSuppression=false, AGC=false, mono48 kHz istenir; cihazın gerçek route/sampleRate seçimi ayrı izlenmelidir. |
| Capture / public/pcm-capture-worklet.js:10–50,152–258 |193 tap ×256 faz Blackman FIR; gerçek giriş hızı ve sürekli faz;480 örnek /20 ms @24 kHz; transferable frame sahipliği; stop sonrası processor false.8/16/24/44.1/48 kHz frame/partition/SRC kontrolleri PASS. |
| Expander / capture:53–150 |4 bant zarf/minima;400 ms kalibrasyon,4 s minima;10 ms lookahead;7.5 dB açma/4 dB hysteresis;240 ms hold,3 ms attack/120 ms release; kapalı gain0.126≈-18 dB. continuousSpeech hece koruması ile gürültü bastırma tercihini değiştirir. Yüzde100 yan konuşmacı ayrıştırmaz. |
| Comfort/mute / capture:152–220 |3 ms delay,600 ms quiet sonrası80 ms azalma,2 ms açılış ve yumuşak mute. V53..V61 fixture'ları PASS. |
| Coalescer / public/vercel-ws-shim.js:95–140 |1–3 bağımsız frame;40 ms timer,120 ms TTL; stop/demo clear; epoch capture girişinde etiketli. Stop-resume/relay-open sırasında eski batch yeni nesle taşınmıyor; V64/65 regresyonları PASS. |
| Native/HTTP/MQTT / shim:287–389,401–514,617–663,969–1065 |Tek uçuş HTTP,3 s abort,100 ms poll; audio4 batch/200 ms ve64 kontrol limiti; eski rota response/retry çiti; v65 control-first latch; v66 loader/broker/suback/timer generation çiti. Handoff capability ve ACK sahipliği korunuyor. |
| Server kabul/fan-out / server.js:435–494,908–923,1057+,1298–1385 |activePublisher sahipliği; modern source/known/live/epoch ve controller seq; binary/JSON paritesi. Token ömründeki yeni native boşluk P1-67-01'dir. V67 giriş testleri expired binary/JSON'u fan-out öncesi durdurur. |
| Relay/handoff / server.js:1415–1768 |48 hex key;35 s lease;3 s prepare; no-await atomik commit; retired/expired409; metadata korunumu, context digest/revision, requestSeq; auth/context sonrası lease. V53..V66 testleri adayda da PASS. |
| Genel→alt oda / server.js:358–368,688–744 |Dedicated guide yoksa source/state/epoch mirası; son rehber ayrılışında terminal stop. V61..V66 E2E kaynak, düşük seq, wrap, handoff ve terminal kontrolü PASS. V67 yetki iptalinde mevcut0-grace presence yolunu kullanır. |
| Receiver / public/dinle.html:1180–1406 |Soket/Blob teslim çiti; source/stateSeq/ended/mediaEpoch; kontrol kurulmadan modern JSON reddi; explicit stop/mod/source geçişinde reset. V64 eski epoch kabulü0; V65 unprimed kabul0; V66 eski MQTT sahip teslimi0. |
| Port/kurtarma / dinle.html:1658–1897 |En çok13 frame/260 ms main kuyruğu; rxLoadToken/context/processor sahipliği; FIFO reset; askıdayken taze PCM almama, resume/rebuild/probe. Worklet kurulamaması için etkin scheduler fallback'i yok; aşağıdaki saha sınırı korunuyor. |
| Player / public/pcm-player-worklet.js:12–27,124–187,190–338 |8/16 kHz çıkışta193 tap anti-alias FIR sonra Hermite;24/44.1/48 kHz'de downsample FIR yok. Sürekli faz, ±1000 ppm ASRC, seq wrap/late/duplicate reddi; bounded q ve recovery blend. Bu turda yeni DSP kusuru doğrulanmadı. |
| Jitter/PLC / player:30–96,190–338 |Başlangıç120 ms; hedef80–260 ms; en az1 frame varsa300 ms başlangıç eşiği;60 ms pitch PLC+sönüm;300 ms starvation rebuffer. >32 frame→24 trim, hedef+120 ms üzerinde500 ms backlog catch-up;3 ms recovery ve5 ms rampalar. Kayıp sözcük geri üretilemez. |
| PWA / public/sw.js:4–79 |API/WS/auth/rehber/panel cache dışı; ses çekirdekleri60/61. v67 yalnız release cache'lerini67'ye taşır. Açık eski sekmenin JS'i SW activation ile otomatik değişmez. |

### 3.1 Beş çıkış hızında ölçümler

V61 reset/starvation fixture'ı disk50/50 ve son aday52/52 koşusunda tekrar geçti:

| Çıkış Hz | firstAfterReset | firstAfterStarvation | DC fixture iç maxStep |
| --- | --- | --- | --- |
|8000|0|0|0.130492|
|16000|0|0|0.145227|
|24000|0|0|0.002640|
|44100|0|0|0.001428|
|48000|0|0|0.001314|

Düşük hızlı FIR'ın iç geçici rejim maxStep'i ilk örnek sıçramasıyla aynı ölçü değildir; fiziksel cızırtının sıfır olduğunu göstermez.

V60 player alias fixture:8 kHz çıkışta4080/4800/6000 Hz için **-76.56/-107.60/-114.02 dB**;16 kHz çıkışta8160/9600/10000 Hz için **-97.45/-115.88/-127.11 dB**. Bunlar belirtilen tonlardaki ölçümlerdir; tüm spektrum için tek bastırma sınırı değildir.24 kHz capture fixture'ında2 s→100 frame; diğer desteklenen oranlarda süreklilik/çerçeveleme kontrolleri PASS.

Capture FIR grup gecikmesi96/girişHızı:8/16/24/44.1/48 kHz için12/6/4/2.18/2 ms.10 ms lookahead,3 ms comfort,0–20 ms frameleme,0–40 ms coalescer,120 ms ilk jitter hedefi ve düşük çıkışta player FIR4 ms ayrıca vardır. Ağ ve donanım eklenir. Yerel transport p99 ağızdan kulağa toplam gecikme değildir.

Ham SHA-256: capture **30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a**; player **062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7**; shim **a89f929edf4cd9cfaccb0f48f38705ca60b2bdb3d2c538ca9cbb485618f3f48e**. Üç çekirdek bu turda değişmedi; v67 diff'i de capture/player/shim kaynak metnini değiştirmiyor.

### 3.2 1→300 yerel dağıtım testi

300 aynı IP geçerli join200;301 gerçek WS;270 sağlam dinleyici×120 frame=**32.400 eksiksiz frame**,30 paused/injected-queue peer'de **1500 soft drop**,3 hard izolasyon, **0 bozuk PCM**. Disk ve son v67 adayı bu koşulları geçti.

| Ölçüm | Disk v66 | Son rapor v67 provası |
| --- | --- | --- |
|p50 /p95 /p99 teslim ms|10.11 /17.80 /49.95|10.87 /16.19 /25.06|
|max teslim ms|56.01|31.93|
|event loop p99 ms|25.74|23.94|
|CPU ms / geçen ms|1969 /2423.3|1563 /2430.6|

50 pps, yaklaşık2.4 s ve aynı host ölçümüdür; host yüküyle değişir. Kuyruk basıncı OS TCP penceresine bağımlı olmamak için enjekte edilir; sağlam peer baytları gerçek WS'de karşılaştırılır.300 fiziksel telefon, uzun soak/roaming veya300 sürekli HTTP dinleyici bu test değildir.

Native ham egress972×50×300=**116.64 Mbit/s**, TLS/TCP/IP hariç. Base64 PCM tabanı1280×50×300=**153.6 Mbit/s**, JSON hariç.300 HTTP dinleyicide100 ms poll yaklaşık3000 istek/s. Soft/hard drop sağlam alıcıyı korur; sıfır paket kaybı ile sıfır gecikmeyi birlikte garanti etmez. bufferedAmount gönderim için bekleyen veridir; dinleyicide oynatma ACK'i değildir. [WHATWG bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount).

## 4. Saha ve mimari kabul sınırları

Public MQTT imzası istemcide bilinen sabite dayanır; oda ACL'si veya sunucu tarafından doğrulanmış yayıncı yetkisi değildir. V66 eski yerel broker ömrünü çitler; v67 native sunucu kabulünü çitler. **Public MQTT üzerinden mevcut istemcinin yayın yetkisinin server logout ile kaldırıldığı iddia edilmiyor.** Farklı kaynak UUID'leri/broker yolları arasında global oda/yayıncı otoritesi ayrıca tasarlanmalıdır. Aynı kaynak seq/epoch çiti bunu çözmez.

HTTP relay ve oda state'i process RAM'indedir. Çoklu serverless instance'ta ortak state veya tek relay otoritesi gerekir. Gerçek VDS NIC/TLS kapasitesi, multi-instance toparlama ve canlı deployment bu turda sınanmadı.

Mono mikrofon, rehber ile yan konuşmacının çakışan zaman/frekans bileşenlerini yüzde100 ayırmaz. Ağza yakın mikrofon SNR için önemlidir. BroadcastChannel başka telefonun hoparlörüne AEC referansı sağlamaz. echoCancellation=true bir UA isteğidir;50–400 ms çapraz cihaz akustik kuyruğunu her koşulda kaldırma garantisi değildir. [W3C echoCancellation](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-echocancellation).

AudioContext askıya alındığında worklet/script işlemeleri durur; gerçek zamanlı capture verisi kaybolabilir. Resume geçmiş konuşmayı geri getirmez. [W3C suspend](https://www.w3.org/TR/webaudio/#dom-audiocontext-suspend). Receiver'da worklet kurulamaması için etkin eski scheduler fallback'i yoktur. iOS/Android kilit, alarm/arama, WhatsApp, HFP/SCO, ses route değişimi ve yoğun4G/5G/roaming fiziksel cihazlarda sınanmalıdır. Kod/VM testleri kesintisiz saha sertifikası değildir.

Bu turda **P1-67-01 dışında yeni P0/P2/P3 somut ses kusuru doğrulanmadı**. Önceki mimari sınırlar kapatılmış sayılmıyor; başka kusur bulunmayacağı iddiası da yok.

## 5. v67 test matrisi ve gerçek CLI prova düzeni

### ADIM-3.V67

Gerçek login/logout, native WS ve HTTP relay kullanılır; sadece dinleyicinin WebAudio/player kısmı VM'dedir. Üç ayrı opaque login oturumu denenir: JSON join tokenı, handshake Bearer ve handshake Cookie. Her birinde geçerli binary/JSON PCM baytları önce doğrulanır, sonra logout sonrası yeni medyanın reddi,0-grace guide stop, admin kapanışı, public family'nin açık kalıp guide yükselmesinin reddi ve başka tokenlı sağlıklı rehberin bayt eşliği sınanır. Token veya parolalar metriklere yazılmaz.

| Mod | Logout sonrası HTTP PCM | Native binary PCM | guidePresent /isLive | Admin kapandı | Family /bağımsız yayın |
| --- | --- | --- | --- | --- | --- |
|message|0|0|false /false|true|korundu|
|bearer|0|0|false /false|true|korundu|
|cookie|0|0|false /false|true|korundu|

### ADIM-5.V67

Altı anlamlı grup: expiry sınırı; revoke/healthy/public-family ayrımı; prepared handoff credential ve timer temizliği; handshake→JSON token rotasyonu/geçersiz tokenın overwrite edememesi; cached bayrakların yetki sayılmaması ve HTTP/static uyumu; **üretim kaynak metninden çıkarılmış gerçek binary/JSON giriş ve heartbeat callback'leriyle** expiry reddi. Pozitif native frame önce peer'e ulaştırılır, saat ilerletilince sonraki frame fan-out'a çıkmaz.30 gün duvar saati beklenmez; expiresAt sınırı kontrollü saatle2000/2001 ms'de sınanır. Expired JSON handler'ı downstream işleyiciyi çağırmaz; idle heartbeat üyeliği kaldırır.

İki yeni recordResult ile50→52; eski V53..V66 başarı koşulları korunur. Login credential nesnesi mevcut test girişinden paylaşılır; E2E ayrı token üretir, ana test tokenını revoke etmez. Cache kontrolleri67'ye yükselir.

### Prova ve kaynak bütünlüğü

Rapordaki **tek diff** disk bağlamıyla her hunk eşleştirilerek bellekte uygulanır. Geçici CommonJS preload fs okumaları/module compile ve syntax check'leri aday metne yönlendirir. Gerçek komut **node --require <geçici-preload.cjs> scripts/verify-system.js**; verifier main ve localhost sunucusu gerçektir. Verifier'ın raporu kaynak olarak okuması engellenir. Uygulama/test kaynakları diskte hiç yamalanmaz.

Dış finally data/runtime.json'ın koşu öncesi ham baytlarını geri yazar ve preload dosyasını siler. Son status yalnız **M AUDIO_EXCELLENCE_REPORT.md**, **D AUDIT_FIX_SUMMARY.md**, **D AUDIT_REPORT.md**.15 kaynak hash'i başlangıçla aynı; runtime Git farkı yok.

| Kontrol | Sonuç |
| --- | --- |
| Disk v66 / normal CLI | **50/50 PASS, exit0** |
| Yeni E2E / orijinal v66 server | Beklenen PCM koşulunda **FAIL, exit1**; HTTP2/native binary1 |
| Son rapor diff'i / gerçek CLI bellek provası | **52/52 PASS, exit0** |
| Başlangıç v66 diff ters kontrolü | **exit0** |
| v67 git apply --check - | **exit0** |
| v67 git apply --check --ignore-space-change - | **exit0** |
| Uygulanan kalıcı kaynak yaması | **Yok** |

## 6. Doğrudan uygulanabilir tek v67 unified diff

**Taban79df33f**,11 hedef: server.js, scripts/verify-system.js, public/sw.js ve shim kullanan8 HTML. Cache/shim URL sürümü67; player61-audio/capture60-audio korunur. Shim'in kendi callback/DSP/protokol kodu değişmez.

Diff **34.156 UTF-8 bayt**, SHA-256 **98c3c439a54d47c36db9362b4419875d3028c8c448371ba456754c2d724dd507**. Önce diff'i check edin, uyguladıktan sonra normal node scripts/verify-system.js komutunda52/52 sonucunu doğrulayın. Dağıtım bu denetimde yapılmadı.

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -538,6 +538,8 @@
   if (clean !== AUTH_TOKEN_VALUE) {
     revokedAuthTokens.add(clean);
   }
+  // Revoke existing native publishers/admins as well as later HTTP requests.
+  for(const ws of wss.clients)if(ws.rysAuthContext)refreshRysNativeAuth(ws.rysAuthContext);
 }
 
 // IP Tabanlı Hafif Hız Sınırlayıcı (Sliding Window Rate Limiter)
@@ -617,6 +619,23 @@
     return false;
   }
   return true;
+}
+
+
+function refreshRysNativeAuth(ctx){
+  if(!ctx||ctx.ws.isHttpRelay)return true; // HTTP capabilities revalidate per request.
+  const authed=!!isValidAuthToken(ctx.rysAuthToken||ctx.rysHandshakeToken);
+  ctx.isAuthenticated=authed;ctx.ws.isAuthenticated=authed;
+  if(authed)return true;
+  const room=ctx.currentRoom,member=room?.clients.get(ctx.clientId),pending=ctx.rysHandoff?.request;
+  const privileged=member?.role==='guide'||ctx.ws.isAdmin||pending?.type==='admin-subscribe'||
+    pending?.type==='join'&&pending.role==='guide';
+  if(!privileged)return true; // Public listeners/family remain connected, without elevation.
+  ctx.currentRoom=null;ctx.ws.isAdmin=false;ctx.ws.familyTourCode=null;
+  clearRysHandoff(ctx);
+  if(room?.clients.has(ctx.clientId))removeClientFromRoom(room,ctx.clientId,0);
+  try{ctx.ws.terminate();}catch(e){}
+  return false;
 }
 
 function extractAuthTokenFromReq(req) {
@@ -924,6 +943,7 @@
 function processClientJsonMessageV49(ctx, msg) {
   const { clientId, ws } = ctx;
   if (msg && msg.token && isValidAuthToken(msg.token)) {
+    ctx.rysAuthToken=String(msg.token).trim();
     ws.isAuthenticated = true;
     ctx.isAuthenticated = true;
   }
@@ -1310,6 +1330,7 @@
     rysHandshakeToken: extractAuthTokenFromReq(req)
   };
 
+  ws.rysAuthContext=ctx;
   const rejectInput=()=>{
     clearRysHandoff(ctx);
     try{ws.terminate();}catch(e){}
@@ -1320,6 +1341,7 @@
     ws.isAlive = true;
     // PATCH: binary-v51
     if (isBinary) {
+      if(!refreshRysNativeAuth(ctx))return;
       if (!ctx.currentRoom || !(ws.isAuthenticated || ctx.isAuthenticated)) return;
       const sender = ctx.currentRoom.clients.get(ctx.clientId);
       if (!sender || sender.role !== 'guide') return;
@@ -1379,12 +1401,15 @@
       return;
     }
     if(!isRysClientMessage(msg)){rejectInput();return;}
+    if(isValidAuthToken(msg.token))ctx.rysAuthToken=String(msg.token).trim();
+    if(!refreshRysNativeAuth(ctx))return;
     if(handleRysNativeHandoff(ctx,msg))return;
     processClientJsonMessage(ctx, msg);
     }catch(e){rejectInput();}
   });
 
   ws.on('close', () => {
+    ws.rysAuthContext=null;
     clearRysHandoff(ctx);
     if (ctx.currentRoom) {
       removeClientFromRoom(ctx.currentRoom, ctx.clientId);
@@ -1396,6 +1421,7 @@
 const heartbeatTimer = setInterval(() => {
   cleanupStaleRelaySessions();
   wss.clients.forEach((ws) => {
+    if(ws.rysAuthContext&&!refreshRysNativeAuth(ws.rysAuthContext))return;
     if (ws.isAlive === false) {
       return ws.terminate();
     }
@@ -1519,7 +1545,9 @@
   ctx.rysHandoff=null;
 }
 function validateRysHandoff(ctx,request){
-  const authed=!!(isValidAuthToken(request.token)||isValidAuthToken(ctx.rysHandshakeToken));
+  const token=[request.token,ctx.rysAuthToken,ctx.rysHandshakeToken].find(isValidAuthToken);
+  const authed=!!token;
+  if(authed)ctx.rysAuthToken=String(token).trim();
   ctx.isAuthenticated=authed;ctx.ws.isAuthenticated=authed;
   if((request.type==='admin-subscribe'||request.type==='join'&&request.role==='guide')&&!authed)
     return 'auth-required';
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -154,13 +154,14 @@
   );
 
   // 2.2 Yetkili Giriş (POST /api/login)
+  const loginCredentials={
+    email: process.env.ADMIN_USERNAME || 'ridvanyilmazturizm@gmail.com',
+    password: process.env.ADMIN_PASSWORD || Buffer.from('ZG9sYXBkZXJlbGkxNg==', 'base64').toString('utf8')
+  };
   const loginRes = await fetch(`${baseUrl}/api/login`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
-    body: JSON.stringify({
-      email: process.env.ADMIN_USERNAME || 'ridvanyilmazturizm@gmail.com',
-      password: process.env.ADMIN_PASSWORD || Buffer.from('ZG9sYXBkZXJlbGkxNg==', 'base64').toString('utf8')
-    })
+    body: JSON.stringify(loginCredentials)
   });
   const loginData = await loginRes.json();
   const authToken = loginData.token;
@@ -586,6 +587,7 @@
   await runV64MediaChecks({baseUrl,url:wsUrl,token:authToken});
   await runV65ReadinessChecks({baseUrl,url:wsUrl,token:authToken});
   await runV66MqttOwnershipChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV67NativeAuthChecks({baseUrl,url:wsUrl,token:authToken,credentials:loginCredentials});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1538,9 +1540,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v66"));assert(sw.includes('/vercel-ws-shim.js?v=66'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v67"));assert(sw.includes('/vercel-ws-shim.js?v=67'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'66',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'67',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2505,7 +2507,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2715,7 +2717,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2954,7 +2956,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3139,7 +3141,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3326,7 +3328,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3490,7 +3492,7 @@
     const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
     checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
   recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
 }
@@ -3661,7 +3663,7 @@
     h.s.close();assert(h.clients.every(c=>c.ended===1));assert.equal(h.received.length,0);
     checks.push('100-replacements-bounded-active-clients-invalidate-before-synchronous-end');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v66'));assert(sw.includes('vercel-ws-shim.js?v=66'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('vercel-ws-shim.js?v=67'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V66 UNIT METRICS '+JSON.stringify({checks,clientsAfterDelayedClose:0,staleDelivered:0,activeClientsMax:2,replacements:100}));
   recordResult('ADIM-5.V66','MQTT loader/client/suback/timer ownership across route, close and native takeover; bounded replacement; cache66',true);console.log('V66 UNIT PASS');
@@ -3727,6 +3729,137 @@
   }
 }
 
+
+async function runStep5V67AudioChecks(){
+  const assert=require('node:assert/strict'),source=fs.readFileSync(path.join(ROOT_DIR,'server.js'),'utf8').replace(/\r\n/g,'\n'),checks=[];
+  function pick(name){const m=new RegExp('^function '+name+'\\(','m').exec(source);assert(m,'V67 missing '+name);
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const code=source.slice(m.index,end+1);try{new vm.Script(code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V67 unterminated '+name);}
+  let now=1000;const sessions=new Map(),revoked=new Set(),sockets=new Set(),removed=[];
+  const g={Date:{now:()=>now},AUTH_TOKEN_VALUE:'static-root',activeAuthSessions:sessions,revokedAuthTokens:revoked,wss:{clients:sockets},db:{tours:[]},
+    clearTimeout:j=>{if(j)j.cancelled=true;},removeClientFromRoom:(room,id,grace)=>{removed.push({id,grace});room.clients.delete(id);}};
+  vm.createContext(g);vm.runInContext(['isValidAuthToken','revokeAuthToken','refreshRysNativeAuth','clearRysHandoff','validateRysHandoff','processClientJsonMessageV49'].map(pick).join('\n'),g);
+  const grant=(token,expiresAt=10000)=>sessions.set(token,{expiresAt});
+  const member=(id,token,role='guide',extra={})=>{const ws={isAuthenticated:true,isAdmin:false,familyTourCode:null,terminated:0,terminate(){this.terminated++;}},
+    room=role?{clients:new Map([[id,{role}]])}:null,ctx={clientId:id,ws,currentRoom:room,isAuthenticated:true,rysAuthToken:token,...extra};
+    ws.rysAuthContext=ctx;sockets.add(ws);return ctx;};
+  grant('expires',2000);const expiry=member('expiry','expires');now=1999;assert(g.refreshRysNativeAuth(expiry));now=2000;assert(g.refreshRysNativeAuth(expiry));
+  now=2001;assert(!g.refreshRysNativeAuth(expiry));assert.equal(expiry.currentRoom,null);assert.equal(expiry.ws.terminated,1);assert.equal(expiry.ws.isAuthenticated,false);
+  assert(removed.some(r=>r.id==='expiry'&&r.grace===0));checks.push('expiry-boundary-revalidates-cached-native-privilege-and-removes-with-zero-grace');
+  grant('revoked');grant('healthy');const guide=member('revoked-guide','revoked'),admin=member('revoked-admin','revoked',null),healthy=member('healthy','healthy'),family=member('family','revoked',null);
+  admin.ws.isAdmin=true;family.ws.familyTourCode='T';g.revokeAuthToken('revoked');
+  assert.equal(guide.ws.terminated,1);assert.equal(admin.ws.terminated,1);assert.equal(admin.ws.isAdmin,false);
+  assert.equal(healthy.ws.terminated,0);assert.equal(healthy.isAuthenticated,true);assert.equal(family.ws.terminated,0);assert.equal(family.ws.familyTourCode,'T');assert.equal(family.isAuthenticated,false);
+  g.revokeAuthToken('revoked');assert.equal(guide.ws.terminated,1);checks.push('logout-revokes-only-current-token-publishers-admins-public-family-stays-without-elevation');
+  grant('prepare');const pending=member('pending',null,null);
+  assert.equal(g.validateRysHandoff(pending,{type:'join',role:'guide',token:'prepare'}),null);
+  const timer={cancelled:false};pending.rysHandoff={request:{type:'join',role:'guide'},timer};g.revokeAuthToken('prepare');
+  assert.equal(pending.ws.terminated,1);assert.equal(pending.rysHandoff,null);assert(timer.cancelled);checks.push('prepared-native-handoff-retains-credential-and-is-cancelled-on-revoke');
+  grant('first');grant('second');const rotated=member('rotated',null,null,{rysHandshakeToken:'first'});
+  assert(g.refreshRysNativeAuth(rotated));g.processClientJsonMessageV49(rotated,{type:'ping',token:'second'});assert.equal(rotated.rysAuthToken,'second');
+  g.processClientJsonMessageV49(rotated,{type:'ping',token:'bad'});assert.equal(rotated.rysAuthToken,'second');
+  rotated.currentRoom={clients:new Map([['rotated',{role:'guide'}]])};g.revokeAuthToken('first');assert.equal(rotated.ws.terminated,0);assert(g.refreshRysNativeAuth(rotated));
+  g.revokeAuthToken('second');assert.equal(rotated.ws.terminated,1);checks.push('handshake-to-message-token-rotation-invalid-token-does-not-overwrite-current-credential');
+  const forged=member('cached-flags-only',null);assert(!g.refreshRysNativeAuth(forged));assert.equal(forged.ws.terminated,1);
+  const relay={ws:{isHttpRelay:true,isAuthenticated:true},isAuthenticated:true};assert(g.refreshRysNativeAuth(relay));assert.equal(relay.isAuthenticated,true);
+  const legacy=member('legacy-handshake',null,null,{rysHandshakeToken:'static-root'});assert(g.refreshRysNativeAuth(legacy));
+  checks.push('boolean-flags-alone-never-authorize-native-HTTP-and-configured-static-key-contract-preserved');
+  {
+    // Execute the production ingress and heartbeat callbacks, not copies of their admission logic.
+    Object.assign(g,{Buffer,WebSocket:{OPEN:1},getTargetBroadcastRooms:r=>[r],setRysAudioSource(){},
+      rysSendAudio(){g.forwarded++;},forwarded:0,processClientJsonMessage(){g.jsonProcessed++;},jsonProcessed:0,
+      handleRysNativeHandoff:()=>false,rejectInput(){throw Error('Unexpected malformed input');},cleanupStaleRelaySessions(){}});
+    vm.runInContext(['validBinaryPcmFrame','acceptRysAudio','isRysClientMessage'].map(pick).join('\n'),g);
+    const marker="  ws.on('message', ",start=source.indexOf(marker)+marker.length,end=source.indexOf("\n  });\n\n  ws.on('close'",start);
+    assert(start>=marker.length&&end>start);vm.runInContext('globalThis.ingress='+source.slice(start,end)+'\n}',g);
+    now=3000;grant('ingress',3001);const native=member('ingress','ingress');
+    Object.assign(native.currentRoom,{audioSourceId:'page',audioStateKnown:true,isLive:true,broadcastMode:'mic',audioMediaEpoch:1});
+    Object.assign(native.currentRoom.clients.get('ingress'),{audioSourceId:'page',ws:native.ws});native.currentRoom.clients.set('receiver',{ws:{readyState:1}});
+    g.ctx=native;g.ws=native.ws;const b=Buffer.alloc(972);b.writeUInt32LE(1,0);b.writeDoubleLE(100,4);
+    g.ingress(b,true);assert.equal(g.forwarded,1,'Positive native frame must reach the peer');
+    now=3002;g.ingress(b,true);assert.equal(g.forwarded,1);assert.equal(native.ws.terminated,1);
+    grant('json-expired',3001);const json=member('json-expired','json-expired');g.ctx=json;g.ws=json.ws;
+    g.ingress(Buffer.from(JSON.stringify({type:'audio-chunk',seq:2,sampleRate:24000,sentAt:100,pcm16:Buffer.alloc(960).toString('base64')})),false);
+    assert.equal(g.jsonProcessed,0);assert.equal(json.ws.terminated,1);
+    const heartbeat=/const heartbeatTimer = setInterval\(\(\) => \{([\s\S]*?)\n\}, 30000\);/.exec(source);assert(heartbeat);
+    vm.runInContext('globalThis.heartbeat=()=>{'+heartbeat[1]+'\n}',g);
+    sockets.clear();const idle=member('idle-expired','json-expired');g.heartbeat();assert.equal(idle.ws.terminated,1);assert.equal(idle.currentRoom,null);
+    checks.push('real-binary-and-JSON-ingress-reject-expired-credentials-idle-heartbeat-cleans-membership');
+  }
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v67'));assert(sw.includes('vercel-ws-shim.js?v=67'));
+  assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V67 UNIT METRICS '+JSON.stringify({checks,expiredGuidePresent:false,expiryGraceMs:0,revokedGuideTerminated:1,revokedAdminTerminated:1,healthyTerminated:0,publicFamilyTerminated:0,cancelledPrepare:true}));
+  recordResult('ADIM-5.V67','Native live credential expiry/revoke, token rotation, pending handoff cleanup, public-family isolation and HTTP/static compatibility; cache67',true);console.log('V67 UNIT PASS');
+}
+
+async function runV67NativeAuthChecks({baseUrl,url,token,credentials}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),code='RY-V67-'+Date.now().toString(36).toUpperCase();
+  const auth={'Content-Type':'application/json',Authorization:'Bearer '+token},sockets=[],caps=[],issued=[],events=[],received=[],faults=[],pcm=Buffer.alloc(960);let h,created=false;
+  for(let i=0;i<480;i++)pcm.writeInt16LE(Math.round(6000*Math.sin(2*Math.PI*250*i/24000)),2*i);
+  const until=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error('V67 deadline '+label);await new Promise(r=>setTimeout(r,5));}};
+  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:auth,body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
+  const login=async()=>{const r=await fetch(baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
+    assert.equal(r.status,200);const data=await r.json();assert(data.token?.startsWith('rys_'));issued.push(data.token);return data.token;};
+  const logout=async value=>{const r=await fetch(baseUrl+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+value}});assert.equal(r.status,200);await r.arrayBuffer();};
+  const connect=async headers=>{const ws=new WebSocket(url,headers?{headers}:undefined);sockets.push(ws);ws.messages=[];ws.on('error',e=>faults.push(e.message));
+    ws.on('message',(raw,binary)=>{if(!binary){const m=JSON.parse(raw);ws.messages.push(m);events.push(m);}});
+    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;};
+  const barrier=async ws=>{const ts=Date.now()+Math.random();ws.send(JSON.stringify({type:'ping',ts}));await until(()=>ws.messages.some(m=>m.type==='pong'&&m.echoTs===ts),'pong');};
+  class Bridge{constructor(address){this.real=new WebSocket(address);sockets.push(this.real);this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));this.real.on('error',e=>faults.push(e.message));
+    this.real.on('message',(raw,binary)=>{if(binary)received.push(raw.readUInt32LE(0)&0x7fffffff);else events.push(JSON.parse(raw));this.onmessage?.({data:binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString()});});}
+    get readyState(){return this.real.readyState;}send(raw){this.real.send(raw);}close(){this.real.close();}}
+  const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+  const join=room=>({type:'join',role:'pilgrim',tourCode:code,roomId:room,name:'V67 HTTP '+room,pin:'6067'});
+  const state=source=>({type:'guide-stream-state',audioStateSeq:10,audioMediaEpoch:10,isLive:true,broadcastMode:'mic',topic:'V67'});
+  const json=(seq,source)=>({type:'audio-chunk',seq,audioSourceId:source,audioMediaEpoch:10,sampleRate:24000,sentAt:Date.now(),pcm16:pcm.toString('base64'),level:.5});
+  const open=async()=>{const r=await post({type:'relay-open',version:56}),c={clientId:r.clientId,relayKey:r.relayKey};caps.push(c);return c;};
+  const metrics=[];
+  try{
+    const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers:auth,body:JSON.stringify({code,name:'V67 native credential lifetime',pin:'6067'})});assert.equal(r.status,200);await r.arrayBuffer();created=true;
+    h=createV61ListenerHarness(fs.readFileSync(path.join(PUBLIC_DIR,'dinle.html'),'utf8'),fs.readFileSync(path.join(PUBLIC_DIR,'pcm-player-worklet.js'),'utf8'),Bridge);
+    const address=new URL(url);h.g.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};h.g.document.getElementById('tourPinInput').value='6067';h.connect(code);
+    await until(()=>events.some(m=>m.type==='joined'),'listener joined');
+    const main=await open(),healthyHttp=await open();await post({...main,subscriptionContext:join('genel')});await post({...healthyHttp,subscriptionContext:join('healthy')});
+    const healthy=await connect();healthy.send(JSON.stringify({type:'join',role:'guide',tourCode:code,roomId:'healthy',name:'V67 healthy',audioSourceId:'healthy-page',token}));
+    await until(()=>healthy.messages.some(m=>m.type==='joined'),'healthy joined');healthy.send(JSON.stringify(state('healthy-page')));await barrier(healthy);
+    for(const [index,mode] of ['message','bearer','cookie'].entries()){
+      const credential=await login(),headers=mode==='bearer'?{Authorization:'Bearer '+credential}:mode==='cookie'?{Cookie:'ry_auth='+encodeURIComponent(credential)}:undefined;
+      const guide=await connect(headers),source='v67-'+mode,base=index*100;
+      guide.send(JSON.stringify({type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V67 '+mode,audioSourceId:source,...(mode==='message'?{token:credential}:{})}));
+      await until(()=>guide.messages.some(m=>m.type==='joined'),'guide '+mode);guide.send(JSON.stringify(state(source)));guide.send(binary(base+30));guide.send(JSON.stringify(json(base+31,source)));
+      await barrier(guide);await until(()=>h.player.q.has(base+30)&&h.player.q.has(base+31),'initial audio '+mode);
+      const prior=await post({...main,subscriptionContext:join('genel')});for(const seq of [base+30,base+31]){const m=prior.messages.find(m=>m.type==='audio-chunk'&&m.seq===seq);assert(m&&Buffer.from(m.pcm16,'base64').equals(pcm));}
+      const admin=await connect({Authorization:'Bearer '+credential});admin.send(JSON.stringify({type:'admin-subscribe'}));await until(()=>admin.messages.some(m=>m.type==='admin-rooms-update'),'admin');
+      const family=await connect({Authorization:'Bearer '+credential});family.send(JSON.stringify({type:'family-subscribe',tourCode:code}));await until(()=>family.messages.some(m=>m.type==='family-state'),'family');
+      await logout(credential);
+      const boot=await fetch(baseUrl+'/api/bootstrap',{headers:auth}),snapshot=await boot.json(),room=snapshot.liveRooms.find(r=>r.tourCode===code&&r.roomId==='genel');
+      const guidePresent=room.connectedGuides.some(c=>c.name==='V67 '+mode);
+      if(!guidePresent)await until(()=>guide.readyState===WebSocket.CLOSED,'revoked guide closed');
+      // In the broken server the socket is still open and these revoked frames really fan out.
+      if(guide.readyState===WebSocket.OPEN){guide.send(binary(base+90));guide.send(JSON.stringify(json(base+91,source)));await barrier(guide);}
+      const after=await post({...main,subscriptionContext:join('genel')});
+      const postLogoutFrames=after.messages.filter(m=>m.type==='audio-chunk'&&[base+90,base+91].includes(m.seq)).length;
+      const probe={mode,guidePresent:room.connectedGuides.some(c=>c.name==='V67 '+mode),isLive:room.isLive,postLogoutHttpFrames:postLogoutFrames,postLogoutNativeFrames:received.filter(n=>[base+90,base+91].includes(n)).length};
+      console.log('V67 REVOKE PROBE '+JSON.stringify(probe));
+      assert.equal(postLogoutFrames,0,'Revoked native credentials must not fan out binary/JSON PCM');
+      assert.equal(probe.postLogoutNativeFrames,0);assert.equal(probe.guidePresent,false);assert.equal(room.isLive,false);
+      await until(()=>guide.readyState===WebSocket.CLOSED&&admin.readyState===WebSocket.CLOSED&&h.g.rxStreamActive===false,'revoked sockets closed');assert.equal(h.player.q.size,0);assert.equal(family.readyState,WebSocket.OPEN);
+      const errorsBefore=family.messages.filter(m=>m.type==='auth-error').length;
+      family.send(JSON.stringify({type:'join',role:'guide',tourCode:code,roomId:'genel',name:'forbidden elevation'}));
+      await until(()=>family.messages.filter(m=>m.type==='auth-error').length===errorsBefore+1,'family elevation rejected');assert.equal(family.readyState,WebSocket.OPEN);
+      healthy.send(binary(base+73));await barrier(healthy);const good=await post({...healthyHttp,subscriptionContext:join('healthy')});
+      assert(good.messages.some(m=>m.type==='audio-chunk'&&m.seq===base+73&&Buffer.from(m.pcm16,'base64').equals(pcm)));
+      metrics.push({...probe,adminClosed:true,familyPreserved:true,healthyPcm:true});family.close();
+    }
+    assert.deepEqual(faults,[]);console.log('V67 E2E METRICS '+JSON.stringify({cases:metrics,revokedPcm:0,pcmEqual:true}));
+    recordResult('ADIM-3.V67','Real login/logout fences native message/bearer/cookie publishers and admins; binary/JSON stop, HTTP parity and independent healthy/public-family survival',true);console.log('V67 E2E PASS');
+  }finally{
+    h?.g.leaveRoom();for(const ws of sockets)try{ws.terminate();}catch(e){}
+    for(const cap of caps)try{await post({...cap,type:'relay-close',version:56});}catch(e){}
+    for(const credential of issued)try{await logout(credential);}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:auth});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -3747,6 +3880,7 @@
     await runStep5V64AudioChecks();
     await runStep5V65AudioChecks();
     await runStep5V66AudioChecks();
+    await runStep5V67AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=66"></script>
+  <script src="/vercel-ws-shim.js?v=67"></script>
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
-  <script src="/vercel-ws-shim.js?v=66"></script>
+  <script src="/vercel-ws-shim.js?v=67"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -2653,7 +2653,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=66').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=67').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=66"></script>
+  <script src="/vercel-ws-shim.js?v=67"></script>
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
-  <script src="/vercel-ws-shim.js?v=66"></script>
+  <script src="/vercel-ws-shim.js?v=67"></script>
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
-  <script src="/vercel-ws-shim.js?v=66"></script>
+  <script src="/vercel-ws-shim.js?v=67"></script>
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
-  <script src="/vercel-ws-shim.js?v=66"></script>
+  <script src="/vercel-ws-shim.js?v=67"></script>
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
-  <script src="/vercel-ws-shim.js?v=66"></script>
+  <script src="/vercel-ws-shim.js?v=67"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v66';
+const CACHE_NAME = 'ridvanses-pwa-v67';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=66',
+  '/vercel-ws-shim.js?v=67',
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
-  <script src="/vercel-ws-shim.js?v=66"></script>
+  <script src="/vercel-ws-shim.js?v=67"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```
