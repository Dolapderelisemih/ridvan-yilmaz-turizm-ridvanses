# RıdvanSes v63 — v62 Uygulama, Durum Sırası ve Ses Akışı Denetimi

Denetim: **9 Kasım 2026**, çalışma kökü **D:/umresesliyazılım**. Disk HEAD: **0c175d1b6dc5167777ae6bcb29ec09ac71a5c912**. Yalnız bu rapor değiştirildi. Aşağıdaki v63 yaması kaynaklara uygulanmadı; commit veya dağıtım yapılmadı.

**Karar:** v62 eksiksiz uygulanmış ve disk paketi **42/42 PASS** vermiştir. İncelemede üç yeni P2 kusur ailesi doğrulandı: aynı kaynağın canlılık kontrolünde sıralama/snapshot toparlanması, HTTP oturum yenilemesinde ilk PCM'den önce durumun kurulmaması, GET rölesinde kaynak kimliği paritesi. Yeni P0/P1 doğrulanmadı. Bu, bütün yazılımda sıfır hata veya sahada sıfır kopma kanıtı değildir; **0 P0 / 0 P1 / 0 P2 onayı verilmiyor**. Hazırlanan tek v63 yaması ve testleri aşağıdadır.

## 1. v62 uygulama ve regresyon doğrulaması

| Kontrol | Gerçek sonuç |
| --- | --- |
| Başlangıçtaki raporun v62 diff'i | git apply --reverse --check --ignore-space-change -: **exit 0**, stderr boş |
| Diff kimliği | 59.301 bayt; SHA-256 d6fe8b4b7f5b14da7a8ea14e4d06ca0b2f3e9eb19b6acb8946e1fdd114717271 |
| Commit kapsamı | **12 kaynak + rapor = 13 dosya**, 1223 ekleme/701 silme; istenen kaynakların tamamı |
| DSP çekirdekleri | Capture ve player dosyaları HEAD^→HEAD arasında değişmemiş; ham SHA-256 değerleri aşağıda |
| Disk doğrulaması | **node scripts/verify-system.js → 42 / 42 [BAŞARILI / PASS], exit 0**, V53..V62 E2E/Unit dahil |
| Başlangıç çalışma ağacı | Yalnız kullanıcıya ait unstaged silmeler: AUDIT_FIX_SUMMARY.md, AUDIT_REPORT.md |

12 kaynak: server.js, scripts/verify-system.js ve public/{ani-kitabi.html,dinle.html,index.html,login.html,panel.html,rehber.html,rota.html,sw.js,vercel-ws-shim.js,yaka-karti.html}. Ters kontrol, test sayısından bağımsız olarak gerçek diff ile yapıldı. Capture SHA-256: **30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a**; player: **062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7**.

| v62 maddesi | HEAD satırları ve değerlendirme |
| --- | --- |
| P2-62-01 stop/demo bariyeri ve son kontrol | shim:117–124,686–704,729–743,889–908,940–950; server:470–478,1041–1060,1151–1152,1308; dinle:1190–1200,1249–1255,1298–1318,1350. Açık stop sonrası geç medya reddi ve başarısız poll'de son kontrolün korunması mevcut. V62 E2E postStopAudio=0, coalescerAfterStop=0. Farklı geliş sıralarındaki kontrol mesajlarının kendi sıra numarası yok; P2-63-01. |
| P2-62-02 kaynak etiketi | rehber:1628,2071; shim:59–81,729–743; server:1151–1160,1331; dinle:1190–1200,1350. JSON/HTTP/MQTT frame etiketleri ve farklı kaynak reddi mevcut. V62 retiredSourceAudio=0. Kaynak kimliği ile canlılık durumunun sürümü farklı kavramlardır. |
| P2-62-03 demo yaşam döngüsü | rehber:2029–2098; dinle:2015–2040,2192–2220. Generation çiti, en çok4 rehber nota, askıda düğüm oluşturmama, 1 ms kazanç zaman sabiti/10 ms stop ve onended disconnect mevcut; V62 Unit PASS. |
| P2-62-04 requestSeq | server:1651–1685; shim:300–304,953–976. Opaque oturumda GET/POST ortak sıra çiti, eski409 ve eksik/bozuk sıra denetimi mevcut; reset yeni capability için sayacı sıfırlıyor. V62 gerçek gecikmiş gövde probe'u409/relay-request-stale, yeniden katılım yok. Bu sayaç ses kontrol mesajlarının MQTT sırasını çözmez. |
| T-62-01 üyelik bariyeri | verify-system.js:2767–2777. Dedicated istemcinin yerel close olayından sonra sunucunun connectedGuides listesinden kaldırılması bekleniyor. Disk V61 E2E geçti; v63 adayında aynı assertion'lar korunuyor ve son prova ek tekrar içeriyor. |

## 2. Kanıtlı yeni P2 bulguları — disk v62 satırları

### P2-63-01 — Aynı kaynakta eski canlılık kontrolü geri gelebiliyor; daha yeni snapshot toparlayamıyor

**Konum:** server.js:417–424,673–725,1037–1061; public/vercel-ws-shim.js:591–630,803–820; public/dinle.html:1180–1200,1266–1274,1298–1318.

- audioSourceId aynı sayfa boyunca sabit; isLive/broadcastMode güncellemelerinde ayrı bir ordinal yok. İki MQTT yolundan geciken eski true/false, daha yeni kontrolü geri alabilir. HTTP requestSeq yalnız istek gövdelerini sıralar; tek gövde içindeki kontrol mesajlarını veya MQTT teslimini sıralamaz.
- room-state, audioStateKnown=true ve isLive=true içerse bile rxStreamActive zaten false olduğunda dinleyici bunu uygulamaz. Kaçırılmış bir canlı kontrolünden sonra aynı kaynağın PCM'i sürekli reddedilebilir.
- MQTT room-state içinde audioStateKnown yok; kontrolün biliniyor olması da HTTP ile aynı biçimde yayımlanmıyor.

**Disk koduyla deterministik receiver probu:** stream-state(false, sıra10) → aynı kaynak room-state(true, known=true, sıra11) → binary seq7. Sonuç **rxStreamActive=false, mode=idle, q=[]**. Testte verilen sıralar v62 tarafından değerlendirilmez.

**Gerçek v62 sunucusuyla negatif kontrol:** yeni E2E yalnız ilk legacy snapshot'ın numarasız olmasını kabul ederek başlatıldı. true10 → false12 → gecikmiş true11 → PCM8 sonucunda **latestLive=true, state=null, lateAudio=true**; yeni test assertion'ı FAIL/exit1. Aday v63 sunucusunda aynı dizi **false, state12, lateAudio=false**. İlk durma kontrolünün tek başına çalışması ile eski bir kontrolün bunu geri alması ayrı sınırlar.

**v63 çözümü:** aynı kaynak içinde artan audioStateSeq; guide-stream-state, stream-state, bilinen room-state ve handoff ACK'de ortak sürüm. Dinleyici daha yeni bilinen snapshot ile toparlar, eski/eşit kopyayı tekrar uygulamaz. Sunucu da eski/eşit guide kontrolünü reddeder. Kaynak değişiminde yerel ordinal sıfırlanır. Bilinmeyen durumdan known/live/mic'e geçmek alınmış PCM'i gereksiz resetlemez; gerçek stop ve mod değişimi kuyruğu/demoyu temizler.

Sunucunun 2.5 s grace sonundaki otomatik stop'u rehber sayacını tüketmez: aynı ordinal üzerinde **audioStateEnded=true** terminal işareti taşır. Karşılaştırma aynı kaynakta **(audioStateSeq, ended)** çiftidir; ended=true aynı sayının canlı halinden sonra gelir. Sonraki daha büyük rehber ordinali yeniden açabilir. Genel→alt oda devrinde ordinal/known/ended birlikte kopyalanır. Bu çift farklı kaynak UUID'leri arasında global otorite seçimi değildir.

### P2-63-02 — HTTP oturum yenilemesinde kontrol ilk PCM'in arkasına ekleniyor

**Konum:** public/vercel-ws-shim.js:918–950, özellikle939–940; server.js:470–472,1041–1052.

_flushAndPoll yerel batch'i relay-open await'inden önce alıyor; yeni oturum açıldığında _lastGuideState'i **batch.push** ile sona ekliyor. Eski guide aynı kaynak kimliğiyle artık durmuş olarak biliniyorsa acceptRysAudio ilk PCM'i doğru biçimde reddediyor; ancak true kontrolü bundan sonra işleniyor. İlk20–60 ms paket grubunun kaybı mümkündür. Kimlik/oturum yenilenmesi sırasında kelime başı kopması için doğrudan bir yol.

**Gerçek v62 _flushAndPoll probu:** yeni relay-open cevabı sonrası gönderilen messages sırası **[audio-chunk(seq7), guide-stream-state(true)]**. Statik tahmin yerine gerçek işlev mock fetch ile sürüldü.

**v63 çözümü:** yeni capability açılırken eski guide kontrollerini çıkar, güncel durumu yeniden ilan et ve **batch.unshift** ile ilk medya önüne koy. Yeniden ilan ordinali mevcut sayfa sayacı ve cache'deki ordinalin üstüne çıkar; önceki disconnect terminal işaretinden sonra da açılabilir. Son durum false ise v62 taze medya filtresi aynen çalışır. Kaynak/rota ve HTTP epoch çitleri korunur.

**Gerçek v63 E2E:** rehber HTTP oturumu kapatıldı, sunucunun grace sonu terminal stop'u gözlendi; aynı kaynak ve cache ordinal13 ile yeni relay açıldı. İlk batch **[state14(true), PCM10]**; ilk PCM10 hem gerçek player kuyruğuna hem HTTP dinleyiciye ulaştı. 35 s TTL'nin tamamı bu E2E'de beklenmedi; expiry sınırı mevcut V57 Unit'te35000/35001 ms ile ayrıca korunuyor. Burada test edilen sınır, sona ermiş üyelikten yeni opaque oturum açılmasıdır.

### P2-63-03 — GET rölesi açık audioSourceId alanını sessizce atıyor

**Konum:** server.js:1708–1723; karşılaştırma: syncRysRelayJoin:1591–1624 ve digestRysSubscription:1476–1484.

GET bağlamı name/deviceId/phone/lang alanlarını kopyalarken audioSourceId'yi kopyalamıyor. Aynı rehberin POST ve native handoff bağlamıyla eşliği kayboluyor. Kaynak clientId'ye düşebilir; sonraki POST metadata rejoin yapabilir, GET digest'i ile kaynaklı native prepare uyuşmayabilir. Standart shim POST kullanır; kusur korunan GET API uyum yolundadır.

**Negatif test:** v63 adayı üzerinde yalnız eski GET eşlemesi bellekte geri alındı. Gerçek GET katılımı200; aynı kaynaklı POST'ta **postRejoined=true** ve yeni test FAIL/exit1. Tam v63 ile **postRejoined=false**. Test, capability'yi URL'ye koymaz; GET için mevcut **X-Rys-Relay-Key** başlığını kullanır.

**v63 çözümü:** q.audioSourceId yalnız verilmişse bağlama aktarılır; mevcut ortak wire/schema doğrulaması çalışır. PIN/token başka odadan devralınmaz. GET ve POST aynı requestSeq çitini kullanır. E2E stale GET409, eksik sıra409, kesirli sıra400, geçersiz kaynak400, başarılı native handoff ve commit sonrası eski GET409 kontrollerini içerir.

## 3. Yeni protokolün kapsamı ve uyumluluğu

| Alan | Kapsam / davranış |
| --- | --- |
| PCM seq | Mod2^31 ses paket sırası; duplicate/PLC/jitter için. Binary zarf972 B olarak kalır. |
| HTTP requestSeq | Her opaque capability içinde istek uygulama sırası; GET query veya POST body. Yeni capability'de1'den başlar. GET anahtarı header'da kalır. |
| audioSourceId | Aynı rehber sayfası ve kaynak devri kimliği; reconnect'te korunur. |
| audioStateSeq | Aynı sayfanın globalThis sayacı; replacement SmartWebSocket nesneleri arasında artar. Reannounce en az cache ordinalinin bir üstüdür. Güvenli pozitif tamsayı; bozuk wire değeri reddedilir. |
| audioStateEnded | Sunucunun o rehber ordinali için disconnect nedeniyle verdiği terminal stop. Yeni guide kontrolü daha büyük ordinalle false'a döndürür. Rehberden gelen alan sunucu tarafından terminal yetkisi olarak kullanılmaz. |
| audioStateKnown | Snapshot'taki isLive/mode'un açık kontrol bilgisi olduğunu belirtir. Veri-only legacy sessiz başlangıcı, açık stop ile karıştırılmaz. MQTT snapshot'ı da aynı bilgiyi taşır. |

Hiç numaralı durum kullanmamış legacy kaynaklar desteklenir. Aynı kaynak numaralı moda geçtiğinde numarasız eski kontrolün üzerine yazmasına izin verilmez; yeni kaynak kimliği yeni sıra uzayıdır. Bu yüzden **backend, shim ve HTML/SW63 birlikte yükseltilmeli**. Eski sekmeler SW aktivasyonu ile otomatik olarak yeni JavaScript'e dönüşmez. Yeni audioStateSeq, PCM payload'ına ayrı bir medya nesli eklemez; PCM eski kopyaları hâlâ paket seq'si, soket/Blob epoch'u ve kuyruk sınırlarıyla ele alınır. Bütün ağ yollarında sınırsız geç teslim için garanti değildir.

## 4. Uçtan uca derin zincir denetimi

| Katman | İncelenen sınır ve sonuç |
| --- | --- |
| Rehber graph ve yaşam döngüsü | rehber.html:1508–1765,1803–2029. gUM/module/import/heal/preview/stop sahipliği korunmuş; V60'ın17 grubu PASS. Socket callback'leri v61 çitli; sendGuideJoinAndSync:685–716 boşta false'ı da gönderir. Demo generation:646,2046–2073; Demo stop/cleanup yaşam döngüsü V62 testlerinde doğrulanır. v63 sayfalardaki shim URL'si dışında bu rehber işlevlerini değiştirmez; kontrol ordinalini taşıma shim'i ekler. |
| Capture DSP | pcm-capture-worklet.js:10–50,53–150,152–220,223–258. 193-tap×256 faz FIR, DC blocker,4 bant expander,480 örnek/20 ms paket. Giriş8/16/24/44.1/48 kHz sayısal testleri ve partition sürekliliği geçer. Capture dosyası bu yamada değişmez. |
| Expander / akustik | 10 ms lookahead,400 ms kalibrasyon,4 s minima, varsayılan7.5 dB açma ve4 dB hysteresis,240 ms hold,3 ms attack/120 ms release. Kapalı gain0.126≈-18 dB; continuousSpeech profilinde konuşma koruma lehine gürültü geçişi vardır. Comfort delay3 ms,600 ms quiet sonrası80 ms fade ve2 ms yükselme. Sıfır yan konuşmacı ayırma algoritması değildir. |
| Fan-out / CGNAT | server.js:432–448. Soft binary9720 B/JSON16000 B, hard65536 B veya2 s süren tıkanma izolasyonu. 300 aynıIP join200 ve301 gerçekWS probe'u geçer; yavaş dinleyici diğerlerini bloke etmez. Eski ses düşürmek gecikme/bütün kelimeleri koruma arasında bilinçli tercihtir. |
| HTTP ve handoff | server.js:1390–1484,1508–1579,1591–1689; shim:294–380,889–984. Opaque cap/35 s süre, 2-phase prepare/commit/revoke, revision/digest ve kaynak üyeliği kontrolü mevcut. Commit transaction'ında await yok. v63 GET kaynak paritesini, ACK state metadata'sını ve requestSeq'nin capability'ye ait oluşunu gerçek taşıma testiyle sınar. |
| HTTP kuyrukları | Sunucu ses10/200 ms, kontrol64; shim ses4 batch/200 ms, kontrol64.100 ms single-flight short-poll ve3 s abort; long-poll değil. v62 retry son durumu korur; v63 yeni session'da kontrolü ilk PCM önüne getirir. |
| Receiver / stop / demo | dinle.html:1180–1375,1615–1717,2015–2047,2192–2220. Socket/Blob/epoch, rxLoadToken/context ve port sahipliği korunur. Ana thread pending en çok13 frame/260 ms. Demo map stop'ta10 ms audio-time sönümü ve onended cleanup; suspended durumda yeni düğüm0, en çok4 aktif rehber nota. Yeni snapshot uzlaştırması bunlarla birlikte test edildi. |
| Player / DSP | pcm-player-worklet.js:12–27,98–187,190–234,253–338.8/16 kHz çıkışta Hermite öncesi193-tap FIR; >=24 kHz'de bu downsample FIR'ı yok. Sürekli faz ve ±1000 ppm ASRC,5 ms geçiş; kalıcı kuyruk fazlalığında kaynak frame sınırında catch-up ve72 örnek/3 ms recovery blend. Player dosyası değişmez. |
| Jitter / PLC | Başlangıç hedef120 ms, uyarlanmış80–260 ms. İlk paket varsa300 ms başlangıç eşiği; ilk60 ms pitch PLC, uzun kayıpta sönüm;300 ms starvation sonrası rebuffer. Hedef+120 ms üzerindeki500 ms backlog catch-up'ı tetikler;>32 frame kuyruk24'e düşer. PLC kayıp kelimeyi geri getiremez. |
| PWA/cache | Disk cache/shim62, player61-audio, capture60-audio tutarlı. v63 cache/shim63 ve dinle SW63; DSP sürümleri korunur. sw.js:51–78 API/WS/auth rotalarını cache'lemez; diğer GET'lerde network-first.8 shim HTML güncellenir. |

### 4.1 Sayısal DSP sonuçları

| Çıkış Hz | firstAfterReset | firstAfterStarvation | DC fixture iç maxStep |
| --- | --- | --- | --- |
| 8000 | 0 | 0 | 0.130492 |
| 16000 | 0 | 0 | 0.145227 |
| 24000 | 0 | 0 | 0.002640 |
| 44100 | 0 | 0 | 0.001428 |
| 48000 | 0 | 0 | 0.001314 |

Düşük hızdaki FIR geçici rejiminden doğan iç maxStep, ilk örnek sıçramasıyla aynı metrik değildir; sıfır fiziksel cızırtı kanıtı olarak sunulmaz. Player alias reddi:8 kHz çıkış/4080,4800,6000 Hz tonları için -76.56,-107.60,-114.02 dB;16 kHz çıkış/8160,9600,10000 Hz için -97.45,-115.88,-127.11 dB. Capture8/16/44.1/48 kHz iki saniyede100 frame; |DC mean|<=1.82e-10, test stopband -95.9/-95.9/-129.7/-107.3 dB.24 kHz girişte de100 frame. Bunlar belirli ton/fixture ölçümleri; tüm spektrum için tek reddetme değeri değildir.200 Hz fixture maxStep0.007356; PLC probe concealedSamples960.

Capture FIR grup gecikmesi96/girişHızı:8/16/24/44.1/48 kHz için12/6/4/2.18/2 ms;10 ms gate lookahead,3 ms comfort,0–20 ms çerçeveleme, başlangıç player120 ms ve düşük çıkışta4 ms FIR eklenir. Ağ/coalescer/HTTP poll ve gerçek donanım çıkışı ayrıca vardır. Bu bütçe, yerel WS teslim yüzdelikleriyle eşitlenen bir ağızdan kulağa ölçüm değildir.

### 4.2 Üretim ve saha için açık kabul koşulları

300 native dinleyici ham çıkışı972×50×300=14.580.000 B/s=**116.64 Mbit/s**, WS/TLS/TCP/IP hariç. Base64 PCM tabanı1280×50×300=19.200.000 B/s=**153.6 Mbit/s**, JSON hariç.300 HTTP dinleyicide100 ms boş poll yaklaşık3000 istek/s. Bu turda300 fiziksel telefon,300 kesintisiz HTTP ses abonesi, VDS NIC/TLS/CPU veya roaming şebeke kapasitesi ölçülmedi. Tek process RAM oturumları çoklu Vercel instance arasında ortak değildir; sabit relay otoritesi veya ortak state gereksinimi sürer.

MQTT public broker imzası istemcide bilinen sabittir (shim:484–506); oda ACL'si ve güvenilir yayıncı doğrulaması değildir. v63 aynı kaynakta durum ordinalini sıralar; **iki farklı kaynak UUID'si arasındaki eski kontrolün global otorite seçimini** çözmez. Genel/dedicated dönüşü aynı kaynağı yeniden meşru kılabildiğinden UUID'yi kalıcı kara listelemek doğru bir çözüm olmaz. Bu tasarım, broker otoritesi/yetkilendirmesi ve çoklu instance sınırları kapanmadan bütün taşıma yollarına tam üretim sertifikası vermez. Raw MQTT bağlantısı bu denetimde gerçek public broker'a açılmadı; gerçek shim yolları VM'de sürüldü.

Mono mikrofonda rehber ve yakındaki kişinin aynı zaman/frekans bileşenleri karışır. Expander yüzde100 konuşmacı ayırma yapmaz; kulaklık mikrofonunun ağza yakınlığı SNR için gereklidir. BroadcastChannel ayrı telefonların hoparlör yolunu referans olarak sağlamaz. echoCancellation:true talebi, ayrı dinleyici cihazının50–400 ms gecikmeli akustik yolunu iptal etme garantisi değildir. [W3C Media Capture AEC tanımı](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-echocancellation).

Alarm/arama/ekran kilidi bağlamı askıya alırsa worklet işlemeyi ve currentTime ilerlemesini durdurabilir; resume/rebuild bu sırada kaybolan konuşmayı geri getirmez. Gerçek iOS/Android, HFP/SCO rota değişimi ve dokunma gereksinimi saha matrisinde sınanmalı. Worklet kurulamazsa receiver'da etkin eski scheduler fallback'i yok. [Web Audio suspend davranışı](https://www.w3.org/TR/webaudio/#dom-audiocontext-suspend). bufferedAmount uçtan uca oynatma gecikmesini veya teslimi ölçmez. [WHATWG WebSocket bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount).

## 5. v63 test ve uygulama düzeni

Yama12 kaynak hedefler: server.js, verifier, shim, dinle, sw ve shim kullanan diğer7 HTML (rehber dahil). Capture/player aynen korunur. Yeni **ADIM-3.V63 + ADIM-5.V63** ile standart toplam **44** olur. Eski V53..V62 assertion'ları korunur; yeni yardımcı işlevlerin VM extraction fixture'larına eklenmesi ve cache63 beklentileri dışında eski testlerin başarı koşulları gevşetilmez. V61 deadline mesajı yalnız tanı için state/queue alanlarıyla genişletilir.

ADIM-3.V63: gerçek localhost WS/HTTP sunucusu, eski kontrol reddi, kasıtlı düşürülen tek stream-state sonrası gerçek room-state toparlanması, grace sonu stop, yeni relay'nin ilk PCM'i, header-key kullanan GET/POST sıra ve kaynak eşliği, native two-phase handoff, eski GET409, binary/JSON PCM bayt eşliği. ADIM-5.V63 **8 grup**: sayfa sayacı; snapshot/live/stop/mod; terminal tie/new source/legacy; sunucu şema/sıra; Genel-alt oda metadata; yeniden açılış sırası; MQTT state/snapshot paritesi; unknown→known canlı snapshot'ta PCM korunumu.

Prova, **rapordaki tek diff bloğunu diskteki bağlam satırlarıyla birebir eşleştirerek bellekte** uygular. fs.readFileSync ve Node module compile aday metinlere yönlendirilir; node --check aday JS'ye, vm.Script aday HTML'lere uygulanır. Verifier'ın raporu kaynak gibi okuması engellenir. Sunucu ve ağ gerçek localhost'tur; VM yalnız tarayıcı/worklet ve belirtilen broker yollarını modeller. Verifier'ın normal runtime.json snapshot/restore mekanizması çalışır. Bu sonuçlar, disk kaynakları v63 yapılmış gibi sunulmaz.

## 6. Doğrudan uygulanabilir tek v63 unified diff

Aşağıdaki UTF-8/LF bloğu kaynaklara uygulanmadı. git apply --check --ignore-space-change - ve boşluk toleransı olmadan --check ile doğrulanır. Backend/shim/dinle/SW sürümleri birlikte ele alınmalıdır.

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -421,6 +421,7 @@
     guidePeerId: room.guidePeerId || null,
     audioSourceId:room.audioSourceId||null,
     audioStateKnown:!!room.audioStateKnown,
+    audioStateSeq:room.audioStateSeq||null,audioStateEnded:!!room.audioStateEnded,
     guideLocation: room.guideLocation || null,
     connectedPilgrims: pilgrims,
     connectedGuides: guides,
@@ -472,9 +473,14 @@
   return !(sameSource&&room.audioStateKnown&&(!room.isLive||!synth&&String(room.broadcastMode||'').startsWith('demo')));
 }
 
+function acceptRysAudioState(room,sender,clientId,message){
+  if(room.audioSourceId!==(sender.audioSourceId||clientId)||!Number.isSafeInteger(room.audioStateSeq))return true;
+  return Number.isSafeInteger(message.audioStateSeq)&&message.audioStateSeq>room.audioStateSeq;
+}
+
 function setRysAudioSource(room,sourceId){
   if(room.audioSourceId===sourceId)return;
-  room.audioSourceId=sourceId;room.audioStateKnown=false;
+  room.audioSourceId=sourceId;room.audioStateKnown=false;room.audioStateSeq=null;room.audioStateEnded=false;
   broadcastToRoom(room,{type:'audio-source',audioSourceId:sourceId});
 }
 
@@ -676,7 +682,7 @@
   const genelHasGuide = Array.from(genelRoom.clients.values()).some((c) => c.role === 'guide');
   if (!genelHasGuide && genelRoom.isLive) {
     genelRoom.isLive = false;
-    genelRoom.broadcastMode = 'idle';
+    genelRoom.broadcastMode = 'idle';genelRoom.audioStateKnown=true;genelRoom.audioStateEnded=true;
     broadcastToFamilyTrackers(code, {
       type: 'stream-state',
       isLive: false,
@@ -695,19 +701,21 @@
       r.guideName = genelRoom.guideName;
       setRysAudioSource(r,genelRoom.audioSourceId||null);
       r.audioStateKnown=!!genelRoom.audioStateKnown;
+      r.audioStateSeq=genelRoom.audioStateSeq||null;r.audioStateEnded=!!genelRoom.audioStateEnded;
       broadcastToRoom(r, {
         type: 'stream-state',
         isLive: r.isLive,
         broadcastMode: r.broadcastMode,
         currentTopic: r.currentTopic,
         guidePeerId: r.guidePeerId || null,
-        audioSourceId:r.audioSourceId||null
+        audioSourceId:r.audioSourceId||null,
+        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
       });
       continue;
     }
     if (!roomHasGuide && !coveredByGenel && r.isLive) {
       r.isLive = false;
-      r.broadcastMode = 'idle';
+      r.broadcastMode = 'idle';r.audioStateKnown=true;r.audioStateEnded=true;
     }
     if (!r.isLive && r.broadcastMode !== 'idle') {
       r.broadcastMode = 'idle';
@@ -719,7 +727,8 @@
         broadcastMode: r.broadcastMode,
         currentTopic: r.currentTopic,
         guidePeerId: r.guidePeerId || null,
-        audioSourceId:r.audioSourceId||null
+        audioSourceId:r.audioSourceId||null,
+        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
       });
     }
   }
@@ -1036,9 +1045,11 @@
   switch (msg.type) {
     case 'guide-stream-state': {
       if (sender.role !== 'guide' || !isAuthedClient) break;
+      if(!acceptRysAudioState(currentRoom,sender,clientId,msg))break;
       for (const r of getTargetBroadcastRooms(currentRoom)) {
         const wasLive = r.isLive;
         setRysAudioSource(r,sender.audioSourceId||clientId);r.audioStateKnown=true;
+        r.audioStateSeq=msg.audioStateSeq||null;r.audioStateEnded=false;
         r.isLive = Boolean(msg.isLive);
         r.broadcastMode = msg.broadcastMode || (r.isLive ? 'mic' : 'idle');
         if (msg.topic) r.currentTopic = msg.topic;
@@ -1056,7 +1067,8 @@
           broadcastMode: r.broadcastMode,
           currentTopic: r.currentTopic,
           guidePeerId: r.guidePeerId || null,
-        audioSourceId:r.audioSourceId||null
+        audioSourceId:r.audioSourceId||null,
+        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
         });
       }
       broadcastToFamilyTrackers(currentRoom.tourCode, {
@@ -1258,6 +1270,7 @@
           const next=value[key];
           if(next===undefined)continue; // Internal GET DTOs may contain omitted optional fields.
           if(strings.has(key)&&next!==null&&typeof next!=='string')return false;
+          if(key==='audioStateSeq'&&next!==null&&(!Number.isSafeInteger(next)||next<1))return false;
           if(key==='audioSourceId'&&next!==null&&(typeof next!=='string'||next.length>128||
             !(/^[a-zA-Z0-9_.-]*$/).test(next)))return false;
           pending.push({value:next,depth:depth+1});
@@ -1717,7 +1730,8 @@
     q.tourCode?{type:'join',tourCode:q.tourCode,roomId:q.roomId||'genel',role:q.role||'pilgrim',
       name:q.name||'',pin:q.pin||'',token:q.token,
       ...(q.deviceId!==undefined?{deviceId:q.deviceId}:{}),
-      ...(q.phone!==undefined?{phone:q.phone}:{}),...(q.lang!==undefined?{lang:q.lang}:{})}:null;
+      ...(q.phone!==undefined?{phone:q.phone}:{}),...(q.lang!==undefined?{lang:q.lang}:{}),
+      ...(q.audioSourceId!==undefined?{audioSourceId:q.audioSourceId}:{})}:null;
   const session=resolveRysRelay(req,res,q);if(!session)return;
   return serveRysRelay(session,req,res,q.token,context);
 });
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -582,6 +582,7 @@
   await runV60AudioRoundTrip({baseUrl,url:wsUrl,token:authToken});
   await runV61SessionChecks({baseUrl,url:wsUrl,token:authToken});
   await runV62StopChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV63StateChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1202,7 +1203,7 @@
   const frame=new ArrayBuffer(972),view=new DataView(frame);view.setUint32(0,0,true);view.setFloat64(4,1,true);
   rx.handleBinaryAudioFrame(frame);rx.playPcmSamples(Buffer.alloc(960).toString('base64'),24000,true,0,false,true);
   assert.equal(rxP.q.size,1);assert.equal(rxP.stats.duplicate,1);
-  const helpers=['validRysAudio','unpackRysAudio'].map(n=>pick(shim,n,'function')).join('\n');
+  const helpers=['nextRysAudioStateSeq','validRysAudio','unpackRysAudio'].map(n=>pick(shim,n,'function')).join('\n');
   const co=box(helpers+'\n'+pick(shim,'RysAudioCoalescer','class'),'globalThis.C=RysAudioCoalescer;').c;
   let jobs=[],now=0,sent=[];
   const c=new co.C(m=>sent.push(m),()=>now,fn=>{jobs.push(fn);return jobs.length;},()=>{});
@@ -1486,7 +1487,7 @@
   exhausted._push(packet(0));assert.equal(exhausted.expected,0);
   assert.equal(pc.diff(0,0x7fffffff),1);assert.equal(pc.diff(0x7fffffff,0),-1);
   const shim=read('public/vercel-ws-shim.js');
-  const prefix=['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
+  const prefix=['nextRysAudioStateSeq','validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
   let now=100,opened=0,acks=0;const probes=[],jobs=[];
   class Native{constructor(){this.readyState=1;this.sent=[];probes.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(){this.readyState=3;}}
   const t=box(prefix+'\n'+pick(shim,'RysAudioCoalescer','class')+'\n'+pick(shim,'SmartWebSocket','class'),
@@ -1533,9 +1534,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v62"));assert(sw.includes('/vercel-ws-shim.js?v=62'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v63"));assert(sw.includes('/vercel-ws-shim.js?v=63'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'62',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'63',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -1830,7 +1831,7 @@
   assert.equal(status,409);assert.equal(created,0,'Cleanup must not let a retired ID be recreated');
 
   // Client: commit was sent, HTTP reports retired, but the commit ACK is lost.
-  const helpers=['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
+  const helpers=['nextRysAudioStateSeq','validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
   const probes=[],jobs=[];let fetchMode='retired',delivered=0,mqttClosed=0,published=0,resolveOpen;
   const bodies=[];
   class Native{constructor(){this.readyState=1;this.sent=[];probes.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;}}
@@ -1994,7 +1995,7 @@
     localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
     queueMicrotask:fn=>microtasks.push(fn),
     fetch:()=>new Promise((resolve,reject)=>{resolveFetch=resolve;rejectFetch=reject;})};
-  const helpers=['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
+  const helpers=['nextRysAudioStateSeq','validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
   vm.createContext(cc);vm.runInContext(helpers+'\n'+pick(shim,'RysAudioCoalescer','class')+'\n'+
     pick(shim,'SmartWebSocket','class')+'\nglobalThis.S=SmartWebSocket;',cc);
   const make=()=>{
@@ -2500,7 +2501,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v62'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v63'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2592,7 +2593,7 @@
   const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='roomSelect'?'genel':'6061',style:{},classList:{remove(){},add(){},contains(){return true;}}});return elements.get(id);};
   const noop=()=>{};
   const g={WebSocket:SocketClass||FakeSocket,ws:null,intentionalLeave:false,isAudioListening:true,
-    currentTour:{code:'A'},currentLang:'tr',pilgrimDeviceId:'v61-device',pendingRxFrames:[],rxAudioDeliveryEpoch:0,rxAudioSourceId:null,rxStreamActive:null,rxStreamMode:null,
+    currentTour:{code:'A'},currentLang:'tr',pilgrimDeviceId:'v61-device',pendingRxFrames:[],rxAudioDeliveryEpoch:0,rxAudioSourceId:null,rxStreamActive:null,rxStreamMode:null,rxAudioStateSeq:null,rxAudioStateEnded:false,
     rxPlayerWorkletNode:{port:{postMessage:m=>{if(m.type==='reset')player._reset();else if(m.type==='push')player._push(m);}}},
     audioCtx:{state:'running',currentTime:1,resume:async()=>{}},activeGuideDemoSources:new Map(),activeScheduledSources:[],nextAudioTime:0,lastHwEndSample:0,rxHermiteHist:null,rxHermitePos:0,
     lastReceivedAudioSeq:0,lastPacketReceivedAt:0,lastRawChunkAt:0,lastPacketReceivedAt:0,rxFallbackSubSeq:0,
@@ -2606,7 +2607,7 @@
     renderGuideLiveLocation:noop,renderLiveTawafStage:noop,renderAnnouncements:noop,renderPrayers:noop,renderPilgrimJourney:noop,
     showAppToast:noop,playGentleHarmonyNote:noop,prependAnnouncement:noop,playNotificationChime:noop,sendServiceWorkerNotification:noop,
     stopBackgroundKeepAliveAudio:noop,releaseWakeLock:noop};
-  vm.createContext(g);vm.runInContext(['updateRxAudioSource','acceptRxAudioFrame','stopAllActiveSources','flushPendingRxFrames','playPcmSamples',
+  vm.createContext(g);vm.runInContext(['updateRxAudioSource','applyRxAudioState','acceptRxAudioFrame','stopAllActiveSources','flushPendingRxFrames','playPcmSamples',
     'handleBinaryAudioFrame','connectWebSocket','leaveRoom'].map(pick).join('\n'),g);
   const packet=(seq,value=.1)=>{const b=new ArrayBuffer(972),v=new DataView(b);v.setUint32(0,seq,true);v.setFloat64(4,Date.now(),true);
     for(let i=0;i<480;i++)v.setInt16(12+i*2,Math.round(value*32767),true);return b;};
@@ -2703,14 +2704,14 @@
   {
     const methods=['send','_broadcastP2PRoomState'].map(n=>pick(shim,n,'method')).join('\n'),published=[],timers=[];
     const g={Date,Math,ArrayBuffer,window:{ryGetDynamicChannelId:()=> 'same-channel'},setTimeout:fn=>{timers.push(fn);return 1;}};
-    vm.createContext(g);vm.runInContext('class Probe{'+methods+'}\nglobalThis.P=Probe;',g);
+    vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\nclass Probe{'+methods+'}\nglobalThis.P=Probe;',g);
     const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:true,_joinContext:{role:'guide',tourCode:'T',roomId:'genel',audioSourceId:'stable-page'},
       _publishMqtt:m=>published.push(m),_deliverIncomingMessage(){},_enqueueRelayMessage:()=>true,_busConnected:()=>true,_pilgrimMeta:new Map()});
     p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));timers.at(-1)();
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v62'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v63'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2723,7 +2724,7 @@
   const code='RY-V61-'+Date.now().toString(36).toUpperCase(),headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
   const sockets=[],controls=[],received=new Map(),httpMessages=[],errors=[];let h,session,created=false;
   const until=async(test,timeout=5000)=>{const end=Date.now()+timeout;while(!test()){
-    if(Date.now()>end)throw Error('V61 E2E deadline');await new Promise(r=>setTimeout(r,5));}};
+    if(Date.now()>end)throw Error('V61 E2E deadline '+JSON.stringify({source:h?.g.rxAudioSourceId,active:h?.g.rxStreamActive,mode:h?.g.rxStreamMode,state:h?.g.rxAudioStateSeq,ended:h?.g.rxAudioStateEnded,q:h?Array.from(h.player.q.keys()):[],received:Array.from(received,([k,v])=>[k,v.length]),lastControls:controls.slice(-6).map(m=>({type:m.type,source:m.audioSourceId||m.room?.audioSourceId,live:m.isLive??m.room?.isLive,known:m.room?.audioStateKnown,mode:m.broadcastMode||m.room?.broadcastMode}))}));await new Promise(r=>setTimeout(r,5));}};
   const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
   const poll=async()=>{const data=await post({...session,subscriptionContext:{type:'join',role:'pilgrim',tourCode:code,roomId:'siyer',pin:'6061',name:'V61 HTTP'}});
     httpMessages.push(...(data.messages||[]));};
@@ -2816,7 +2817,7 @@
   const unit=(seq,source='page-a')=>({type:'audio-chunk',seq,sampleRate:24000,sentAt:Date.now(),pcm16:Buffer.alloc(960).toString('base64'),audioSourceId:source});
   {
     const output=[],jobs=[],g={Date,Math,ArrayBuffer,Map,Set,Number,setTimeout:fn=>{jobs.push(fn);return jobs.length;},clearTimeout(){}};
-    vm.createContext(g);vm.runInContext(['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n')+'\n'+pick(shim,'RysAudioCoalescer','class'),g);
+    vm.createContext(g);vm.runInContext(['nextRysAudioStateSeq','validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n')+'\n'+pick(shim,'RysAudioCoalescer','class'),g);
     const socket={_isRelay:true,_joinContext:{audioSourceId:'page-a'},send:s=>output.push(JSON.parse(s)),close(){}};
     g.installRysCoalescing(socket);socket.send(JSON.stringify(unit(1)));const old=jobs.at(-1);
     socket.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));old();
@@ -2826,7 +2827,7 @@
   }
   {
     const published=[],jobs=[],g={Date,Math,ArrayBuffer,Map,Set,Number,window:{ryGetDynamicChannelId:()=> 'channel'}};
-    vm.createContext(g);vm.runInContext(pick(shim,'validRysAudio')+'\nclass Probe{'+pick(shim,'send','method')+'\n'+pick(shim,'_relayRoutingKey','method')+'}\nglobalThis.P=Probe;',g);
+    vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\n'+pick(shim,'validRysAudio')+'\nclass Probe{'+pick(shim,'send','method')+'\n'+pick(shim,'_relayRoutingKey','method')+'}\nglobalThis.P=Probe;',g);
     const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:true,_joinContext:{role:'guide',tourCode:'T',roomId:'genel',audioSourceId:'page-a'},
       _sendQueue:[{type:'audio-chunk',frames:[unit(1)]},{type:'ping'}],_audioCoalescer:{clear(){jobs.push('clear');}},
       _publishMqtt:m=>published.push(m),_broadcastP2PRoomState(){},_enqueueRelayMessage(m){p._sendQueue.push(m);return true;},_busConnected:()=>true});
@@ -2913,7 +2914,7 @@
         const body=JSON.parse(options.body);bodies.push(body);
         return {ok:body.requestSeq!==3,status:body.requestSeq===3?409:200,json:async()=>body.requestSeq===3?{error:'relay-request-stale'}:{messages:[]}};
       }};
-    vm.createContext(g);vm.runInContext('class Probe{'+['_flushAndPoll','_resetRelaySession'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=Probe;',g);
+    vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\nclass Probe{'+['_flushAndPoll','_resetRelaySession'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=Probe;',g);
     const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_sendQueue:[],_httpEpoch:0,_relayClientId:'rys56-unit',_relayKey:'a'.repeat(48),
       _joinContext:{type:'join',role:'pilgrim',tourCode:'T'},_relayRoutingKey:()=> 'route',_deliverIncomingMessage(){}});
     await p._flushAndPoll();await p._flushAndPoll();await p._flushAndPoll();
@@ -2927,7 +2928,7 @@
         if(body.type==='relay-open')return new Promise(resolve=>resolveOpen=resolve);
         return {ok:true,json:async()=>({messages:[]})};
       }};
-    vm.createContext(g);vm.runInContext('class Probe{'+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.P=Probe;',g);
+    vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\nclass Probe{'+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.P=Probe;',g);
     const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,_sendQueue:[{...unit(90),_queuedAt:Date.now()}],
       _joinContext:{type:'join',role:'guide',tourCode:'T',audioSourceId:'page-a'},_lastGuideState:{type:'guide-stream-state',isLive:true,broadcastMode:'mic'},
       _relayRoutingKey:()=> 'route',_deliverIncomingMessage(){}});
@@ -2940,7 +2941,7 @@
     for(const latestLive of [false,true]){
       let rejectPoll;const g={Date,Math,Number,localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},queueMicrotask(){},
         AbortController:class{constructor(){this.signal={};}abort(){}},fetch:()=>new Promise((resolve,reject)=>rejectPoll=reject)};
-      vm.createContext(g);vm.runInContext('class Probe{'+['_flushAndPoll','_enqueueRelayMessage'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=Probe;',g);
+      vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\nclass Probe{'+['_flushAndPoll','_enqueueRelayMessage'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=Probe;',g);
       const stale={type:'guide-stream-state',isLive:!latestLive,broadcastMode:latestLive?'idle':'mic'},latest={type:'guide-stream-state',isLive:latestLive,broadcastMode:latestLive?'mic':'idle'};
       const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,_sendQueue:[stale],_lastGuideState:stale,
         _relayClientId:'rys56-retry',_relayKey:'a'.repeat(48),_joinContext:{type:'join',role:'guide',tourCode:'T',audioSourceId:'page-a'},_relayRoutingKey:()=> 'route'});
@@ -2949,7 +2950,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v62'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v63'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3050,6 +3051,174 @@
   }
 }
 
+async function runStep5V63AudioChecks(){
+  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const shim=read('public/vercel-ws-shim.js'),listener=read('public/dinle.html'),server=read('server.js'),checks=[];
+  function pick(source,name,kind='function'){
+    const m=new RegExp('^[ \\t]*'+(kind==='function'?'(?:async )?function '+name:kind==='class'?'class '+name+'\\b':'(?:async )?'+name)+'(?:\\([^\\n]*\\))?\\s*\\{','m').exec(source);assert(m,'V63 missing '+name);
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){
+      const text=source.slice(m.index,end+1);try{new vm.Script(kind==='method'?'class P{'+text+'}':text);return text;}catch(e){if(e.name!=='SyntaxError')throw e;}
+    }throw Error('V63 unterminated '+name);
+  }
+  const state=(seq,isLive,ended=false)=>({type:'stream-state',audioSourceId:'page-s',audioStateSeq:seq,audioStateEnded:ended,isLive,broadcastMode:isLive?'mic':'idle'});
+  {
+    const sent=[],g={Date,Math,ArrayBuffer};vm.createContext(g);
+    vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\nclass P{'+pick(shim,'send','method')+'}\nglobalThis.P=P;',g);
+    const socket=()=>{const p=new g.P();Object.assign(p,{_isRelay:false,_native:{readyState:1,send:raw=>sent.push(JSON.parse(raw))},_sendQueue:[]});return p;};
+    const a=socket(),b=socket();a.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));b.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));
+    assert.deepEqual(sent.map(m=>m.audioStateSeq),[1,2]);assert(sent.every(m=>m.audioStateEnded===false));
+    assert.equal(g.nextRysAudioStateSeq(20),21);checks.push('page-counter-shared-by-replacement-sockets-and-minimum');
+  }
+  {
+    const h=createV61ListenerHarness(listener,read('public/pcm-player-worklet.js')),s=h.connect(),deliver=m=>s.onmessage({data:JSON.stringify(m)});
+    deliver({type:'joined',room:{...state(10,false),audioStateKnown:true}});assert.equal(h.g.rxStreamActive,false);
+    deliver({type:'room-state',room:{...state(11,true),audioStateKnown:true}});s.onmessage({data:h.packet(1)});assert(h.player.q.has(1));
+    const epoch=h.g.rxAudioDeliveryEpoch;deliver(state(10,false));deliver({type:'room-state',room:{...state(10,false),audioStateKnown:true}});
+    deliver({type:'room-state',room:{...state(11,true),audioStateKnown:true}});assert(h.player.q.has(1));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);
+    deliver(state(12,false));assert.equal(h.player.q.size,0);
+    deliver({type:'room-state',room:{...state(13,true),audioStateKnown:true}});s.onmessage({data:h.packet(2)});assert(h.player.q.has(2));
+    deliver({...state(14,true),broadcastMode:'demo-synth'});assert.equal(h.player.q.size,0);s.onmessage({data:h.packet(3)});assert.equal(h.player.q.size,0);
+    deliver({...state(15,true),broadcastMode:'mic'});s.onmessage({data:h.packet(4)});assert(h.player.q.has(4));
+    const blob=new h.DeferredBlob();s.onmessage({data:blob});deliver(state(16,false));blob.resolve(h.packet(5));await h.tick();assert.equal(h.player.q.size,0);
+    checks.push('known-snapshot-recovers-missed-live-stop-mode-and-rejects-stale-duplicates');
+    deliver(state(17,true));s.onmessage({data:h.packet(6)});assert(h.player.q.has(6));
+    deliver(state(17,false,true));assert.equal(h.g.rxAudioStateEnded,true);assert.equal(h.player.q.size,0);
+    deliver(state(17,true));deliver({...state(null,true)});s.onmessage({data:h.packet(7)});assert.equal(h.player.q.size,0);
+    deliver(state(18,true));s.onmessage({data:h.packet(8)});assert(h.player.q.has(8));
+    deliver({...state(1,true),audioSourceId:'page-new'});s.onmessage({data:h.packet(1)});assert(h.player.q.has(1));assert.equal(h.g.rxAudioStateSeq,1);
+    const before=h.g.rxAudioStateSeq;deliver({...state(1.5,false),audioSourceId:'page-new'});assert.equal(h.g.rxAudioStateSeq,before);
+    h.g.leaveRoom();const legacy=h.connect();legacy.onmessage({data:JSON.stringify({type:'joined',room:{audioSourceId:'legacy',audioStateKnown:false,isLive:false}})});
+    legacy.onmessage({data:h.packet(1)});assert(h.player.q.has(1));checks.push('disconnect-terminal-tie-next-ordinal-source-reset-and-legacy');
+  }
+  {
+    const g={broadcastToRoom(){}};vm.createContext(g);vm.runInContext(['setRysAudioSource','acceptRysAudioState','isRysClientMessage'].map(n=>pick(server,n)).join('\n'),g);
+    const room={audioSourceId:'page-s',audioStateSeq:11,audioStateEnded:true};
+    assert(!g.acceptRysAudioState(room,{audioSourceId:'page-s'},'client',{audioStateSeq:11}));assert(!g.acceptRysAudioState(room,{audioSourceId:'page-s'},'client',{}));
+    assert(g.acceptRysAudioState(room,{audioSourceId:'page-s'},'client',{audioStateSeq:12}));assert(g.acceptRysAudioState(room,{audioSourceId:'new'},'client',{audioStateSeq:1}));
+    g.setRysAudioSource(room,'new');assert.equal(room.audioStateSeq,null);assert.equal(room.audioStateEnded,false);
+    assert(g.isRysClientMessage({type:'guide-stream-state',audioStateSeq:12}));for(const v of [0,-1,1.5,'2',[],Number.MAX_SAFE_INTEGER+1])assert(!g.isRysClientMessage({type:'guide-stream-state',audioStateSeq:v}));
+    checks.push('server-monotonic-state-and-wire-schema');
+  }
+  {
+    const general={roomId:'genel',clients:new Map([['g',{role:'guide'}]]),isLive:true,broadcastMode:'mic',audioSourceId:'page-s',audioStateKnown:true,audioStateSeq:5,audioStateEnded:false};
+    const sub={roomId:'siyer',clients:new Map(),isLive:false,broadcastMode:'idle'},messages=[];
+    const g={getOrCreateRoom:()=>general,getTourRooms:()=>[general,sub],broadcastToRoom:(r,m)=>messages.push(m),broadcastToFamilyTrackers(){}};
+    vm.createContext(g);vm.runInContext(pick(server,'setRysAudioSource')+'\n'+pick(server,'evaluateTourGuidePresence'),g);
+    g.evaluateTourGuidePresence('T');assert.equal(sub.audioSourceId,'page-s');assert.equal(sub.audioStateSeq,5);assert.equal(sub.audioStateKnown,true);assert.equal(sub.isLive,true);
+    general.clients.clear();g.evaluateTourGuidePresence('T');assert.equal(general.audioStateEnded,true);assert.equal(sub.audioStateEnded,true);assert.equal(sub.audioStateSeq,5);assert.equal(sub.isLive,false);
+    assert(messages.some(m=>m.type==='stream-state'&&m.audioStateSeq===5&&m.audioStateEnded===true));checks.push('general-subroom-inheritance-and-disconnect-terminal-metadata');
+  }
+  {
+    const bodies=[],g={Date,Math,Number,localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},queueMicrotask(){},
+      AbortController:class{constructor(){this.signal={};}abort(){}},fetch:async(url,options)=>{
+        const body=JSON.parse(options.body);bodies.push(body);return {ok:true,json:async()=>body.type==='relay-open'?{clientId:'rys56-renewed',relayKey:'a'.repeat(48)}:{messages:[]}};
+      }};vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\nclass P{'+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.P=P;',g);
+    const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,
+      _sendQueue:[{type:'guide-stream-state',isLive:false,audioStateSeq:9},{type:'audio-chunk',seq:7,_queuedAt:Date.now(),audioSourceId:'page-s'}],
+      _lastGuideState:{type:'guide-stream-state',isLive:true,broadcastMode:'mic',audioStateSeq:11},_joinContext:{type:'join',role:'guide',audioSourceId:'page-s'},_relayRoutingKey:()=> 'route',_deliverIncomingMessage(){}});
+    await p._flushAndPoll();const messages=bodies.at(-1).messages;assert.deepEqual(messages.map(m=>m.type),['guide-stream-state','audio-chunk']);assert.equal(messages[0].audioStateSeq,12);assert.equal(messages[0].isLive,true);
+    assert.equal(messages[1].seq,7);assert.equal(bodies.at(-1).requestSeq,1);checks.push('relay-renewal-promotes-state-before-first-pcm-and-old-controls');
+  }
+  {
+    const published=[],jobs=[],g={Date,Math,ArrayBuffer,window:{ryGetDynamicChannelId:()=> 'channel'},setTimeout:fn=>{jobs.push(fn);return jobs.length;}};
+    vm.createContext(g);vm.runInContext(pick(shim,'nextRysAudioStateSeq')+'\nclass P{'+['send','_broadcastP2PRoomState'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=P;',g);
+    const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:true,_joinContext:{role:'guide',audioSourceId:'page-s'},_pilgrimMeta:new Map(),_publishMqtt:m=>published.push(m),_deliverIncomingMessage(){},_enqueueRelayMessage:()=>true,_busConnected:()=>true});
+    p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));jobs.at(-1)();
+    const stream=published.find(m=>m.type==='stream-state'),room=published.find(m=>m.type==='room-state').room;
+    assert.equal(stream.audioStateSeq,1);assert.equal(room.audioStateSeq,1);assert.equal(room.audioStateKnown,true);assert.equal(room.isLive,true);
+    p.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));jobs.at(-1)();
+    assert.equal(published.filter(m=>m.type==='room-state').at(-1).room.audioStateSeq,2);checks.push('MQTT-stream-and-snapshot-known-state-sequence-parity');
+  }
+  {
+    const h=createV61ListenerHarness(listener,read('public/pcm-player-worklet.js')),s=h.connect();
+    s.onmessage({data:JSON.stringify({type:'audio-source',audioSourceId:'page-s'})});s.onmessage({data:h.packet(1001)});assert(h.player.q.has(1001));
+    const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
+    assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
+  }
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v63'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
+  recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
+  console.log('V63 UNIT PASS');
+}
+
+async function runV63StateChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),code='RY-V63-'+Date.now().toString(36).toUpperCase();
+  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token},caps=[],sockets=[],controls=[],httpFrames=[],subFrames=[],errors=[];
+  let h,p,created=false,dropStateSeq=null;const bodies=[];
+  const until=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error('V63 deadline '+label+' '+JSON.stringify({active:h?.g.rxStreamActive,state:h?.g.rxAudioStateSeq,ended:h?.g.rxAudioStateEnded,q:h?Array.from(h.player.q.keys()):[]}));await new Promise(r=>setTimeout(r,5));}};
+  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200,'V63 relay '+body.type);return r.json();};
+  const open=async()=>{const r=await post({type:'relay-open',version:56}),cap={clientId:r.clientId,relayKey:r.relayKey};caps.push(cap);return cap;};
+  const pcm=Buffer.alloc(960);for(let i=0;i<480;i++)pcm.writeInt16LE(2345,2*i);
+  const audio=(seq,source='page-main')=>({type:'audio-chunk',audioSourceId:source,seq,sentAt:Date.now(),sampleRate:24000,pcm16:pcm.toString('base64'),level:.5});
+  const state=(seq,live)=>({type:'guide-stream-state',audioStateSeq:seq,isLive:live,broadcastMode:live?'mic':'idle'});
+  class Bridge{static OPEN=1;static CONNECTING=0;static CLOSED=3;
+    constructor(address){this.real=new WebSocket(address);sockets.push(this.real);this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));this.real.on('error',e=>errors.push(e.message));
+      this.real.on('message',(raw,binary)=>{let m;if(!binary){m=JSON.parse(raw);controls.push(m);if(m.type==='stream-state'&&m.audioStateSeq===dropStateSeq){dropStateSeq=null;return;}}
+        this.onmessage?.({data:binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString()});});}
+    get readyState(){return this.real.readyState;}send(raw){this.real.send(raw);}close(){this.real.close();}}
+  const listenerBarrier=async()=>{const ts=Date.now()+Math.random();h.g.ws.send(JSON.stringify({type:'ping',ts}));await until(()=>controls.some(m=>m.type==='pong'&&m.echoTs===ts),'listener pong');};
+  const mainContext={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V63 main',audioSourceId:'page-main',token};
+  const pilgrimContext=roomId=>({type:'join',role:'pilgrim',tourCode:code,roomId,name:'V63 HTTP '+roomId,pin:'6063'});
+  const poll=async(cap,context,dest)=>{const r=await post({...cap,subscriptionContext:context});dest.push(...r.messages.filter(m=>m.type==='audio-chunk'));return r;};
+  try{
+    const createdResponse=await fetch(baseUrl+'/api/tours',{method:'POST',headers,body:JSON.stringify({code,name:'V63 ordered state',pin:'6063'})});assert.equal(createdResponse.status,200);await createdResponse.arrayBuffer();created=true;
+    const publisher=await open();await post({...publisher,subscriptionContext:mainContext,messages:[state(10,true)]});
+    h=createV61ListenerHarness(fs.readFileSync(path.join(ROOT_DIR,'public/dinle.html'),'utf8'),fs.readFileSync(path.join(ROOT_DIR,'public/pcm-player-worklet.js'),'utf8'),Bridge);
+    const address=new URL(url);h.g.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};h.g.document.getElementById('tourPinInput').value='6063';h.connect(code);
+    await until(()=>h.g.rxStreamActive===true&&h.g.rxAudioStateSeq===10,'joined live');
+    const listener=await open();await poll(listener,pilgrimContext('genel'),httpFrames);
+    await post({...publisher,subscriptionContext:mainContext,messages:[audio(7)]});await until(()=>h.player.q.has(7),'initial PCM');await poll(listener,pilgrimContext('genel'),httpFrames);
+    await post({...publisher,subscriptionContext:mainContext,messages:[state(12,false),state(11,true),audio(8)]});await listenerBarrier();await poll(listener,pilgrimContext('genel'),httpFrames);
+    console.log('V63 STATE PROBE '+JSON.stringify({latestLive:h.g.rxStreamActive,state:h.g.rxAudioStateSeq,lateAudio:httpFrames.some(m=>m.seq===8)}));
+    assert.equal(h.g.rxStreamActive,false);assert.equal(h.g.rxAudioStateSeq,12);assert.equal(h.player.q.size,0);assert(!httpFrames.some(m=>m.seq===8));
+    dropStateSeq=13;await post({...publisher,subscriptionContext:mainContext,messages:[state(13,true)]});await listenerBarrier();assert.equal(h.g.rxStreamActive,false);
+    const renamed={...mainContext,name:'V63 renamed'};await post({...publisher,subscriptionContext:renamed});await until(()=>h.g.rxStreamActive===true&&h.g.rxAudioStateSeq===13,'room snapshot repairs missed state');
+    await post({...publisher,subscriptionContext:renamed,messages:[audio(9)]});await until(()=>h.player.q.has(9),'snapshot recovered PCM');await poll(listener,pilgrimContext('genel'),httpFrames);
+    h.g.ws.onmessage({data:JSON.stringify({type:'room-state',room:{audioSourceId:'page-main',audioStateKnown:true,audioStateSeq:12,isLive:false,broadcastMode:'idle'}})});assert(h.player.q.has(9));
+    await post({...publisher,type:'relay-close',version:56});await until(()=>h.g.rxStreamActive===false&&h.g.rxAudioStateEnded===true&&h.g.rxAudioStateSeq===13,'disconnect grace terminal');
+    const shim=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8');
+    function pick(name,kind='method'){const m=new RegExp('^[ \\t]*'+(kind==='function'?'function ':'(?:async )?')+name+'\\([^\\n]*\\)\\s*\\{','m').exec(shim);assert(m);
+      for(let end=shim.indexOf('}',m.index);end>=0;end=shim.indexOf('}',end+1)){const s=shim.slice(m.index,end+1);try{new vm.Script(kind==='method'?'class P{'+s+'}':s);return s;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V63 missing '+name);}
+    const g={Date,Math,Number,setTimeout,clearTimeout,queueMicrotask,AbortController,localStorage:{getItem:()=>token},fetch:async(route,options)=>{bodies.push(JSON.parse(options.body));return fetch(baseUrl+route,options);}};
+    vm.createContext(g);vm.runInContext(pick('nextRysAudioStateSeq','function')+'\nclass P{'+pick('_flushAndPoll')+'}\nglobalThis.P=P;',g);
+    p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,_sendQueue:[{...audio(10),_queuedAt:Date.now()}],_lastGuideState:state(13,true),_joinContext:renamed,_relayRoutingKey:()=> 'main',_deliverIncomingMessage(){}});
+    await p._flushAndPoll();caps.push({clientId:p._relayClientId,relayKey:p._relayKey});await until(()=>h.player.q.has(10)&&h.g.rxAudioStateSeq===14,'renewed first PCM');await poll(listener,pilgrimContext('genel'),httpFrames);
+    assert.deepEqual(bodies.at(-1).messages.map(m=>m.type),['guide-stream-state','audio-chunk']);assert.equal(bodies.at(-1).messages[0].audioStateSeq,14);assert(httpFrames.some(m=>m.seq===10));
+    // GET and POST must name the same guide source and share the same ordinal fence.
+    const sub=await open();await poll(sub,pilgrimContext('siyer'),subFrames);
+    const getGuide=await open(),getContext={type:'join',role:'guide',tourCode:code,roomId:'siyer',name:'V63 GET guide',pin:'',token,audioSourceId:'page-get'};
+    const get=async(seq,extra={})=>{const q=new URLSearchParams({clientId:getGuide.clientId,subscription:'join',...getContext,...extra});if(seq!==undefined)q.set('requestSeq',String(seq));return fetch(baseUrl+'/api/ws-relay?'+q,{headers:{...headers,'X-Rys-Relay-Key':getGuide.relayKey}});};
+    const joined=await get(1);const joinedBody=await joined.json();console.log('V63 GET JOIN '+JSON.stringify({status:joined.status,error:joinedBody.error}));assert.equal(joined.status,200);assert(joinedBody.messages.some(m=>m.type==='joined'));
+    const same=await post({...getGuide,requestSeq:2,subscriptionContext:getContext,messages:[state(1,true),audio(20,'page-get')]});
+    console.log('V63 GET PROBE '+JSON.stringify({postRejoined:same.messages.some(m=>m.type==='joined')}));assert(!same.messages.some(m=>m.type==='joined'),'GET must preserve explicit audioSourceId');
+    await poll(sub,pilgrimContext('siyer'),subFrames);assert(subFrames.some(m=>m.seq===20&&m.audioSourceId==='page-get'));
+    for(const [seq,status,error] of [[1,409,'relay-request-stale'],[undefined,409,'relay-request-order-required'],['1.5',400,'relay-invalid-order']]){
+      const r=await get(seq);assert.equal(r.status,status);assert.equal((await r.json()).error,error);
+    }
+    const next=await get(3);assert.equal(next.status,200);assert(!(await next.json()).messages.some(m=>m.type==='joined'));
+    const bad=await get(4,{audioSourceId:'bad source'});assert.equal(bad.status,400);await bad.arrayBuffer();
+    const native=new WebSocket(url),events=[];sockets.push(native);native.on('error',e=>errors.push(e.message));native.on('message',(raw,binary)=>{if(!binary)events.push(JSON.parse(raw));});
+    await new Promise((resolve,reject)=>{native.once('open',resolve);native.once('error',reject);});
+    native.send(JSON.stringify({type:'handoff-prepare',relayClientId:getGuide.clientId,relayKey:getGuide.relayKey,subscription:getContext}));
+    await until(()=>events.some(m=>m.type==='handoff-prepared'),'GET handoff prepare');const handoffId=events.find(m=>m.type==='handoff-prepared').handoffId;
+    native.send(JSON.stringify({type:'handoff-commit',handoffId}));await until(()=>events.some(m=>m.type==='handoff-committed'),'GET handoff commit');
+    const ack=events.find(m=>m.type==='handoff-committed').ack;assert.equal(ack.room.audioSourceId,'page-get');assert.equal(ack.room.audioStateSeq,1);assert.equal(ack.room.audioStateKnown,true);
+    const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+    const nativeBarrier=async()=>{const ts=Date.now()+Math.random();native.send(JSON.stringify({type:'ping',ts}));await until(()=>events.some(m=>m.type==='pong'&&m.echoTs===ts),'native pong');};
+    native.send(binary(21));await nativeBarrier();await poll(sub,pilgrimContext('siyer'),subFrames);
+    native.send(JSON.stringify(state(2,false)));native.send(binary(22));await nativeBarrier();await poll(sub,pilgrimContext('siyer'),subFrames);
+    assert.deepEqual(subFrames.map(m=>m.seq),[20,21]);for(const m of [...httpFrames,...subFrames])assert(Buffer.from(m.pcm16,'base64').equals(pcm));
+    const retired=await get(4);assert.equal(retired.status,409);assert.equal((await retired.json()).error,'relay-session-retired');assert.deepEqual(errors,[]);
+    assert.deepEqual(httpFrames.map(m=>m.seq),[7,9,10]);
+    console.log('V63 E2E METRICS '+JSON.stringify({mainSeq:httpFrames.map(m=>m.seq),getHandoffSeq:subFrames.map(m=>m.seq),staleStateAudio:0,missedStateRecovered:true,renewalFirstPcm:10,renewalStateSeq:14,getPostRejoin:false,retiredGetStatus:409,pcmEqual:true}));
+    recordResult('ADIM-3.V63','Real state ordering; missed-control snapshot repair; disconnect/renew first PCM; GET/POST ordinal/source parity; native handoff and byte integrity',true);console.log('V63 E2E PASS');
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
@@ -3066,6 +3235,7 @@
     await runStep5V60AudioChecks();
     await runStep5V61AudioChecks();
     await runStep5V62AudioChecks();
+    await runStep5V63AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=62"></script>
+  <script src="/vercel-ws-shim.js?v=63"></script>
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
-  <script src="/vercel-ws-shim.js?v=62"></script>
+  <script src="/vercel-ws-shim.js?v=63"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1178,12 +1178,27 @@
     })();
 
     function updateRxAudioSource(sourceId){
-      if(typeof sourceId!=='string'||!sourceId)return;
+      if(typeof sourceId!=='string'||!sourceId||sourceId.length>128||!(/^[a-zA-Z0-9_.-]+$/).test(sourceId))return;
       if(rxAudioSourceId!==sourceId){
         if(rxAudioSourceId!==null){lastReceivedAudioSeq=0;stopAllActiveSources();}
-        rxStreamActive=null;rxStreamMode=null;
+        rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;
       }
       rxAudioSourceId=sourceId;
+    }
+
+    function applyRxAudioState(state){
+      if(typeof state?.isLive!=='boolean')return false;
+      if(state.audioStateSeq!=null&&(!Number.isSafeInteger(state.audioStateSeq)||state.audioStateSeq<1))return false;
+      if(state.audioSourceId!=null&&(typeof state.audioSourceId!=='string'||!state.audioSourceId||state.audioSourceId.length>128||!(/^[a-zA-Z0-9_.-]+$/).test(state.audioSourceId)))return false;
+      updateRxAudioSource(state.audioSourceId);
+      const seq=state.audioStateSeq??null,ended=state.audioStateEnded===true;
+      if(rxAudioStateSeq!==null){
+        if(seq===null||seq<rxAudioStateSeq||seq===rxAudioStateSeq&&(!ended||rxAudioStateEnded))return false;
+      }
+      rxAudioStateSeq=seq;rxAudioStateEnded=ended;
+      rxStreamActive=state.isLive;
+      if(typeof state.broadcastMode==='string')rxStreamMode=state.broadcastMode;
+      return true;
     }
 
     function acceptRxAudioFrame(sourceId,synth=false){
@@ -1202,7 +1217,7 @@
         clearTimeout(window._ryWsReconnectTimeout);
         window._ryWsReconnectTimeout = null;
       }
-      rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;lastReceivedAudioSeq=0;stopAllActiveSources();
+      rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;lastReceivedAudioSeq=0;stopAllActiveSources();
       if (ws) {
         try {
           ws.onopen=null;ws.onmessage=null;
@@ -1264,12 +1279,15 @@
 
         if(msg.type==='audio-source'){updateRxAudioSource(msg.audioSourceId);return;}
         if (msg.type === 'joined' || msg.type === 'room-state') {
-          const r = msg.room;
+          let r = msg.room;
           if (r) {
+            const previousMode=rxStreamMode;
             updateRxAudioSource(r.audioSourceId);
-            if(r.audioStateKnown===true&&(msg.type==='joined'||rxStreamActive===null)){
-              rxStreamActive=!!r.isLive;rxStreamMode=r.broadcastMode||null;
-            }else if(rxStreamActive===null&&r.isLive===true){rxStreamActive=true;rxStreamMode=r.broadcastMode||null;}
+            if(r.audioStateKnown===true||rxStreamActive===null&&r.isLive===true){
+              if(applyRxAudioState(r)&&(rxStreamActive===false||previousMode!==null&&previousMode!==rxStreamMode))stopAllActiveSources();
+            }
+            // A delayed snapshot may update counts, but must not roll back the accepted audio state.
+            if(rxStreamActive!==null)r={...r,isLive:rxStreamActive,broadcastMode:rxStreamMode};
             document.getElementById('liveGuideName').textContent = r.guideName;
             document.getElementById('liveListenerCount').textContent = r.totalListeners;
             document.getElementById('liveTopicText').textContent = r.currentTopic;
@@ -1297,9 +1315,7 @@
         }
 
         if (msg.type === 'stream-state') {
-          updateRxAudioSource(msg.audioSourceId);
-          if(typeof msg.isLive==='boolean')rxStreamActive=msg.isLive;
-          if(typeof msg.broadcastMode==='string')rxStreamMode=msg.broadcastMode;
+          if(!applyRxAudioState(msg))return;
           if (msg.currentTopic) {
             document.getElementById('liveTopicText').textContent = msg.currentTopic;
           }
@@ -1617,6 +1633,7 @@
     let rxLoadToken = 0;
     let rxAudioDeliveryEpoch=0,rxAudioSourceId=null;
     let rxStreamActive=null,rxStreamMode=null;
+    let rxAudioStateSeq=null,rxAudioStateEnded=false;
     const pendingRxFrames = [];
 
     function flushPendingRxFrames() {
@@ -2553,7 +2570,7 @@
     }
 
     function leaveRoom() {
-      intentionalLeave = true;rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;
+      intentionalLeave = true;rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;
       if (window._ryWsReconnectTimeout) {
         clearTimeout(window._ryWsReconnectTimeout);
         window._ryWsReconnectTimeout = null;
@@ -2617,7 +2634,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=62').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=63').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=62"></script>
+  <script src="/vercel-ws-shim.js?v=63"></script>
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
-  <script src="/vercel-ws-shim.js?v=62"></script>
+  <script src="/vercel-ws-shim.js?v=63"></script>
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
-  <script src="/vercel-ws-shim.js?v=62"></script>
+  <script src="/vercel-ws-shim.js?v=63"></script>
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
-  <script src="/vercel-ws-shim.js?v=62"></script>
+  <script src="/vercel-ws-shim.js?v=63"></script>
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
-  <script src="/vercel-ws-shim.js?v=62"></script>
+  <script src="/vercel-ws-shim.js?v=63"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v62';
+const CACHE_NAME = 'ridvanses-pwa-v63';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=62',
+  '/vercel-ws-shim.js?v=63',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
   '/pcm-player-worklet.js?v=61-audio',
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -83,6 +83,14 @@
 
   // PATCH: coalescing-v50
   // PATCH: coalescer-v51
+  // Per page, shared by replacement sockets; the audioSourceId is stable for this page.
+  function nextRysAudioStateSeq(minimum=0){
+    const n=globalThis.__ryGuideAudioStateSeq;
+    const next=Math.max(Number.isSafeInteger(n)&&n>=0?n:0,Number.isSafeInteger(minimum)&&minimum>=0?minimum:0)+1;
+    if(!Number.isSafeInteger(next))throw new RangeError('Audio state sequence exhausted');
+    globalThis.__ryGuideAudioStateSeq=next;return next;
+  }
+
   class RysAudioCoalescer {
     constructor(send,clock=()=>Date.now(),schedule=(f,ms)=>setTimeout(f,ms),cancel=id=>clearTimeout(id)){
       this.send=send;this.clock=clock;this.schedule=schedule;this.cancel=cancel;
@@ -600,13 +608,14 @@
         const pilgrims = Array.from(this._pilgrimMeta.values());
         const tourCode = this._joinContext.tourCode || 'RY-KASIM';
         const roomId = this._joinContext.roomId || 'genel';
-        const isLive = typeof this._isLive === 'undefined' ? true : Boolean(this._isLive);
+        const isLive=typeof this._lastGuideState?.isLive==='boolean'?this._lastGuideState.isLive:
+          typeof this._isLive==='undefined'?true:Boolean(this._isLive);
         const roomObj = {
           tourCode,
           roomId,
           guideName: this._joinContext.name || 'Ömer Ali Gültekin',
           isLive,
-          broadcastMode: this._broadcastMode || (isLive ? 'mic' : 'idle'),
+          broadcastMode:this._lastGuideState?.broadcastMode||this._broadcastMode||(isLive?'mic':'idle'),
           currentTopic:
             this._currentTopic ||
             (tourCode === 'RY-KASIM'
@@ -615,6 +624,8 @@
           activeTawafStage: this._activeTawafStage || null,
           guidePeerId: window.ryGetDynamicChannelId(tourCode, roomId),
           audioSourceId:this._joinContext.audioSourceId||null,
+          audioStateKnown:typeof this._lastGuideState?.isLive==='boolean'||typeof this._isLive==='boolean',
+          audioStateSeq:this._lastGuideState?.audioStateSeq||null,audioStateEnded:false,
           guideLocation: this._guideLocation || null,
           connectedPilgrims: pilgrims,
           totalListeners: pilgrims.length,
@@ -686,6 +697,7 @@
         }
         if(['join','family-subscribe','admin-subscribe'].includes(parsed.type))this._cancelNativeProbe?.();
         if(parsed.type==='guide-stream-state'){
+          parsed={...parsed,audioStateSeq:nextRysAudioStateSeq(this._lastGuideState?.audioStateSeq),audioStateEnded:false};
           this._lastGuideState={...parsed};
           if(!parsed.isLive||String(parsed.broadcastMode||'').startsWith('demo')){
             this._audioCoalescer?.clear();this._sendQueue=(this._sendQueue||[]).filter(m=>m.type!=='audio-chunk');
@@ -809,6 +821,7 @@
             broadcastMode: this._broadcastMode,
             currentTopic: this._currentTopic,
             audioSourceId:this._joinContext.audioSourceId||null,
+            audioStateSeq:parsed.audioStateSeq,audioStateEnded:false,
             guidePeerId: window.ryGetDynamicChannelId(
               this._joinContext.tourCode || 'RY-KASIM',
               this._joinContext.roomId || 'genel'
@@ -934,8 +947,12 @@
             !/^[0-9a-f]{48}$/.test(data.relayKey||''))throw Error('Relay open failed');
           this._relayClientId=data.clientId;this._relayKey=data.relayKey;
           if(!sameRoute()){success=true;return;}
-          if(this._lastGuideState&&this._joinContext?.role==='guide')
-            batch.push({...this._lastGuideState});
+          if(this._lastGuideState&&this._joinContext?.role==='guide'){
+            // Reannounce before the first PCM; renewal may follow an authoritative disconnect stop.
+            this._lastGuideState={...this._lastGuideState,audioStateSeq:nextRysAudioStateSeq(this._lastGuideState?.audioStateSeq),audioStateEnded:false};
+            for(let i=batch.length-1;i>=0;i--)if(batch[i].type==='guide-stream-state')batch.splice(i,1);
+            batch.unshift({...this._lastGuideState});
+          }
         }
         const token=(localStorage.getItem('ry_auth_token')||'').trim();
         const mode=this._subscriptionType||(this._isAdmin?'admin-subscribe':'join');
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=62"></script>
+  <script src="/vercel-ws-shim.js?v=63"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```

## 7. Nihai prova ölçümleri

| Koşu | Sonuç |
| --- | --- |
| Disk v62, komut aynen çalıştırıldı | **42 / 42 [BAŞARILI / PASS], exit0** |
| Yeni test + değişmemiş v62 sunucusu | **FAIL/exit1**, eski true11 durmuş false12'yi geri aldı; raw HTTP PCM8 iletildi. Başlangıçta yalnız legacy numarasız snapshot'a uyum tanındı. |
| v63 adayı, yalnız GET kaynak eşlemesi eski haline alınmış | **FAIL/exit1**, GET200 sonrası aynı kaynaklı POST yeniden joined üretti. Bu, kontrollü bir negatif mutasyon testidir; gerçek v62 tam paket koşusu olarak sunulmaz. |
| Rapordaki nihai v63 diff'inden bellek provası | **44 / 44 [BAŞARILI / PASS], exit0**, V53..V63 dahil |
| Aynı paket + V61 E2E beş tekrar | **48/48 PASS, exit0**; standart44'e dört ek V61 kaydı.5/5 kaynak devri, aynı sayfa replacement, düşük seq ve wrap geçti. |

Başarılı44 koşusunun300 dinleyici probe'u:300 aynıIP join200;301 gerçekWS;270 sağlam dinleyici×120 paket=**32400 sağlam teslim**;30 duraklatılmış/yapay backlog soketi;1500 soft drop;3 hard izolasyon;0 bozuk PCM. Yerel gönderim→WS teslim p50 **9.73 ms**, p95 **20.00 ms**, p99 **56.03 ms**, max **64.89 ms**; event-loop p99 **24.79 ms**; CPU **1828 ms**, süre **2411.1 ms**. Disk42 koşusunda p50/p95/p99/max=11.38/23.03/28.62/33.72 ms idi. Koşular farklı anlık host yükleri içerir; bu fark hızlanma/yavaşlama A/B kanıtı değildir. Rakamlar ağızdan kulağa veya RF ölçümü değildir.

V63 gerçek zincir: **mainSeq=[7,9,10]**, **getHandoffSeq=[20,21]**;staleStateAudio=0,missedStateRecovered=true,renewalFirstPcm=10,renewalStateSeq=14,getPostRejoin=false,retiredGetStatus=409,pcmEqual=true. seq8 gecikmiş eski kontrolle yeniden açılmadı;seq9 kaçan stream-state sonrası gerçek room-state ile geldi;seq10 grace stop sonrasında yeni relay'nin ilk batch'inden geldi;seq20 GET/POST veseq21 native handoff sonrasında aynı PCM baytlarıyla ulaştı;native stop sonrasıseq22 iletilmedi.

Bu sıfırlar yalnız testteki enjeksiyonların sonucudur. Gerçek public broker/çoklu instance, sınırsız geç medya, fiziksel feedback veya OS arka plan davranışının tamamında evrensel sıfır anlamına gelmez.8 birim grubunun tam listesi test çıktısında V63 UNIT METRICS olarak yazılır.

Kanıt logları yerel TEMP altında: rys-v63-baseline.log, rys-v63-old-server.log, rys-v63-old-get.log, rys-v63-report-full.log, rys-v63-report-stress.log. Ara adaylarda V61 beklemesi ve GET testinin header kullanımı incelendi; unknown→known snapshot'ta PCM silinmemesi ayrı regresyonla kapatıldı. Yalnız son full44 ve stress48 koşuları nihai başarı olarak sayıldı. Disk v62'nin ilk42 sonucu bu ara aday sorunlarından etkilenmedi.

## 8. Artefakt ve çalışma ağacı bütünlüğü

Tek diff bloğu, **12 hedef**, **57.228 bayt**, UTF-8/LF. Diff SHA-256: **b771acc404425bd42b9f034aba45f8aefc6c192b29b56322656b3bf3d84b663b**. Hem **git apply --check -** hem **git apply --check --ignore-space-change -** exit0. HEAD içindeki önceki raporun v62 diff'i yeniden çıkarılarak **git apply --reverse --check --ignore-space-change -** exit0 olarak kontrol edildi.

Kaynak değiştirmeden tekrar kontrol etmek için PowerShell'de proje kökünden:

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
v62 = re.findall(r'(?ms)^```diff\n(.*?)^```\s*$', previous)[0].encode('utf-8')
subprocess.run(['git','apply','--reverse','--check','--ignore-space-change','-'], input=v62, check=True)
print('V62 reverse / V63 strict / V63 ignore-space: PASS')
'@ | python -
```

Daha sonra v63 kaynaklara uygulandığında normal node scripts/verify-system.js sonucunun **44/44** olması beklenir.42 disk v62'ye,48 bu denetimin ek tekrarlı provasına aittir. Bu turda uygulama yapılmadı.

15 kaynak dosyasının başlangıç/son ham SHA-256 değerleri aynı;HEAD **0c175d1** değişmedi. Testin geçici runtime.json içeriği verifier'ın snapshot'ına geri döndü. Son git status yalnız rapor değişikliği ve başlangıçtaki AUDIT_FIX_SUMMARY.md/AUDIT_REPORT.md unstaged silmelerini içerir. Stage/restore/commit/push/deploy yok. Unified diff boş bağlam satırlarının tek boşluk öneki korunur; rapor whitespace kontrolü git -c core.whitespace=-blank-at-eol diff --check ile yapıldı.

<!-- SOURCE-HASHES {"server.js":"4b2c1acb2b55a7ced8c764d65fc272c730b5f67d2297d374c44999759b8fe5cf","scripts/verify-system.js":"bec4fbbe927dc152ea5369882c2c6fee9085222f5c99dc9f8df59537cf7eb190","public/ani-kitabi.html":"ea8bf3d597e65e2b9a2af1d0f55a0708662c28068f8bfb5eb53c50c5e37748d0","public/dinle.html":"84c3525d80461316f5eb667cce491d42f2aca4e78af43e47e9b5a88b141fd681","public/index.html":"a35083f4f4f248f4b7286e4eb608351f8c112178b5d6cd5487d750a36e1b7bf1","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"9d1769504bfac3a2ec99310cdb15e27adcd13f30a044f5795a99237dc632d33d","public/panel.html":"153e52af789a3ee26833623484df30f7e78368e2e7d0809938832efcece54e1e","public/pcm-capture-worklet.js":"30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a","public/pcm-player-worklet.js":"062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7","public/rehber.html":"ed91a0ecbaa03246830fcfc3f3da5fa6aa258c102f3b496d8bfeb94eafd4b063","public/rota.html":"6fd43e860b4aad1c2d6ac3ae845fa1d1b196048a9d150d950cf56e04ce8c79ca","public/sw.js":"a991003ca25adf63b84fdc4e05e4e5670e9e34e4b93420e1e533d50b4afc5338","public/vercel-ws-shim.js":"e65c64583c874dab24a11fa4c733b56fa496a968c0972fdf250b2d5673f99476","public/yaka-karti.html":"b3bef146afee79555592b5fb55c3cc23d7c0782bcb091953330efc88f4add7d6"} -->
