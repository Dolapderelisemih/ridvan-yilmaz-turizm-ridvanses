# RıdvanSes v62 — v61 Uygulama ve Uçtan Uca Ses/Oturum Denetimi

Denetim: **9 Kasım 2026**. İncelenen disk HEAD: **f5dc303a6aa180e0d8a672049442ad2299b53a57**. Yalnız bu rapor güncellendi; aşağıdaki v62 yaması kaynaklara uygulanmadı, commit veya dağıtım yapılmadı.

**Karar:** v61 yaması eksiksiz uygulanmış; tam disk koşusunun tekrarı **40/40 PASS**. İlk koşu ve ayrı tekrar tanısı, ADIM-3.V61 içinde gerçek bir test senkronizasyon açığını gösterdi. Ayrıca dört P2 kusur ailesi doğrulandı. Bu nedenle **0 P0 / 0 P1 / 0 P2 veya kesintisiz saha onayı verilmiyor**. Yeni P0/P1 doğrulanmadı; bu, bütün olası hataların bulunmadığına ilişkin bir kanıt değildir. Tek v62 yaması aşağıdadır.

## 1. v61 uygulama ve regresyon doğrulaması

| Kontrol | Gerçek sonuç |
| --- | --- |
| Raporun başlangıçtaki v61 diff'i ile ters kontrol | git apply --reverse --check --ignore-space-change -: **exit 0** |
| Commit kapsamı | 13 kaynak + AUDIO_EXCELLENCE_REPORT.md = 14 dosya; istenen hedeflerin tamamı HEAD içinde |
| Başlangıç çalışma ağacı | Yalnız kullanıcıya ait iki unstaged silme: AUDIT_FIX_SUMMARY.md, AUDIT_REPORT.md |
| node scripts/verify-system.js — ilk disk koşusu | **exit 1**, ADIM-3.V61: V61 E2E deadline; önceki V59/300 kişi ve V60 gerçek PCM E2E geçerli |
| Aynı komut — kaynak değiştirmeden tekrar | **40 / 40 [BAŞARILI / PASS], exit 0**, V53..V61 E2E ve Unit dahil |
| Tanı koşusu | V61 E2E tekrar0 PASS, tekrar1 deadline; source=page-general, player q=[]; siyer tek geri dönüş paketini almamış |

v61 hedefleri: server.js, scripts/verify-system.js, public/{ani-kitabi.html,dinle.html,index.html,login.html,panel.html,pcm-player-worklet.js,rehber.html,rota.html,sw.js,vercel-ws-shim.js,yaka-karti.html}. Git stat: 1091 ekleme,1085 silme; bunların içinde önceki raporun değişimi de var. Kaynak diff eşliği yalnız toplam test sayısından çıkarılmadı; gerçek ters yama kontrolü yapıldı.

| v61 maddesi | HEAD satırları ve değerlendirme |
| --- | --- |
| P2-61-01 soket/Blob/epoch sahipliği | dinle.html:1188–1244,1999–2004,2516; rehber.html:736–808. Eski soket callback'leri, eski Blob ve reconnect timer'ı çitli. Mevcut 9 gruplu V61 birim testi PASS. Bununla birlikte aynı güncel sokette **durma sonrasında yeni gelen** PCM ve demo notaları ayrı bir boşluk; P2-62-01/03. |
| P2-61-02 audioSourceId devri | server.js:469–472,959–964,1028–1058,1158,1301,1463–1469,1585–1604; shim:554–627,784–797; dinle.html:1180–1186,1254–1300. Kontrol mesajı/digest/handoff kimliği mevcut, aynı sayfa reconnect'inde sabit. Ancak ses yükü aynı kimliğe bağlanmıyor; P2-62-02. |
| P2-61-03 reset/starvation ilk örneği | pcm-player-worklet.js:263–275,326–337. Beklerken lastOut ve tail gerçekten çıkan fade örnekleriyle ilerletiliyor. Beş çıkış hızında firstAfterReset=0 ve firstAfterStarvation=0. FIR geçici rejimi ve gerçek kayıpların hepsinin sıfır olduğu anlamına gelmez. |

### T-62-01 — V61 testinde istemci close olayı sunucu üyelik bariyeri değil

scripts/verify-system.js:2764–2776, dedicated.terminate()/istemci close sonrasında Genel rehberin tek seq=1001 paketini hemen gönderiyor. Sunucu dedicated üyeyi henüz kaldırmamışsa getTargetBroadcastRooms siyer'i dışarıda bırakıyor. Daha sonra 2.5 s grace sonunda kontrol kaynağı Genel'e dönüyor; gönderilmiş tek paket yeniden üretilmediğinden player q=[] ile bekliyor. Normal canlı yayındaki devamlı paket akışının da kalıcı durduğunu bu test **göstermiyor**.

Yama, /api/bootstrap içindeki siyer.connectedGuides listesinden ilgili clientId'nin çıktığını bekleyip ondan sonra tek paketi gönderir. Yetkili yanıt, 5 s üst sınır; testin deadline'ı büyütülmedi, assertion kaldırılmadı. Böylece beklenen sunucu durumu açıkça gözlenir.

## 2. Kanıtlı P2 bulguları — v61 disk satırları

### P2-62-01 — Durma/demo kontrolü ile medya ve retry kuyruğu ayrışıyor

**Konum:** shim:85–127,654–740,863–882,891–944; server.js:1028–1058,1132–1161,1289–1339; dinle.html:1235–1244,1284–1300,1332–1352.

- 40 ms coalescer'da bekleyen PCM, isLive:false kontrolünden sonra flush oluyor. Gerçek installRysCoalescing ile kaydedilmiş eski timer callback'i çalıştırıldığında v61 gönderim sırası **[guide-stream-state(false), audio-chunk(seq=1)]**.
- HTTP _sendQueue temizliği tek başına yeterli değil: relay-open await'i başlamadan splice ile alınan yerel batch durma sırasında kuyruğun dışında kalabilir.
- Sunucu mevcut kaynağın açıkça durmuş olduğunu kontrol etmeden geç PCM'i kabul edip activePublisherClientId'yi yeniden atayabiliyor. Dinleyici stream-state(false) ile resetlese de sonradan gelen yeni JSON/binary'yi kabul ediyor. Önceden başlamış Blob için v61 epoch kontrolü bu yeni mesajı kapsamaz.
- Başarısız poll'ün eski kontrolü catch içinde kuyruğa geri eklenir. Gerçek _enqueueRelayMessage ile **istenen false, kuyruk [false,true]**; ters yön de mümkündür. Eski false, yeni true'nun ardından gelirse sunucu yayını durmuş sanabilir. Süreç yalnız timeout değil, kalıcı kontrol/medya uyuşmazlığı üretebilir.

**v62:** coalescer stop/demo bariyeri; medya kuyruğu boşaltma ve gönderim kabulü; await sonrası batch'in son durum/kaynağa göre süzülmesi; guide-stream-state kuyruğunda tek **son istenen** kontrolün korunması (retry dahil); sunucuda audioStateKnown ile açık stop ve demo modunda PCM reddi; dinleyicide JSON/binary/Blob stop/mode kabulü. Eski yalnız-medya protokolü için bilinmeyen durum, açık false ile karıştırılmaz. Boşta reconnect de false/idle durumunu açıkça gönderir. Ağın içine çoktan verilmiş baytlar geri çağrılamaz; bariyer kontrolün işlendiği noktadan sonrasını korur.

### P2-62-02 — Ses yükünde kaynak kimliği yok/denetlenmiyor

**Konum:** rehber.html:1618–1637,2063–2071; shim:59–81,118–120,632–652,732–738; server.js:1144–1161,1312–1338; dinle.html:1332–1352.

v61 audioSourceId kontrol yolunda var. Ancak native'den HTTP'ye JSON dönüşümünde/sentetik notada yük etiketi yok; dinleyici verilen etiketi de denetlemiyor. Gerçek HTML listener + gerçek player VM probu: aktif kaynak **page-new**, gelen etiket **page-retired**, seq=9000; v61 player kuyruğu **[9000]**. Eski MQTT/HTTP kopyası yeni kaynağın sıra uzayını kirletebilir.

**v62:** rehber JSON PCM ve synth etiketi; shim'de her bir batch biriminin doğrulanması ve güncel rehber kaynağına bağlanması; kaynak değişimini içeren relayRoutingKey; sunucuda sender ile etiket eşleştirme, JSON/fallback yük etiketi; dinleyicide farklı etiket reddi. Ham 972 B binary zarfı değiştirilmez: aynı native soketin sıralı audio-source kontrolü + soket/Blob epoch çitiyle yorumlanır. Eski etiketsiz uyum yolu korunur; güvenilmeyen veya keyfî sıralanmış çoklu kontrol yayıncısına karşı konsensüs/kimlik doğrulama getirilmez.

### P2-62-03 — Demo callback ve ses düğümlerinin ömrü durma/geçişi aşıyor

**Konum:** rehber.html:2029–2092; dinle.html:1999–2023,2159–2175; reconnect senkronizasyonu rehber.html:684–715.

clearInterval, daha önce görev kuyruğuna alınmış callback'in artık çalışmayacağını kanıtlamaz. Demo callback'i generation/aktiflik denetlemediğinden mikrofona geçişten sonra sentetik paket üretebilir. Dinleyicide demo OscillatorNode'ları activeScheduledSources listesinde değil; stopAllActiveSources onları durdurmaz. Bir notanın kuyruğu 360 ms. Askıdaki bağlamda currentTime ilerlemese de gelen her notada yeni düğüm kuruluyor: sahte suspended saat probunda **10 çağrı → 10 oscillator**, hepsi currentTime+0.36'ya planlı.

**v62:** demo generation ve aktiflik çiti, demo kaynak haritası, stop/reset üzerinde 1 ms zaman sabitli kazanç düşüşü +10 ms stop, onended'da bağlantı temizliği; suspended/interrupted bağlamda yeni demo düğümü oluşturma, en çok4 aktif rehber demo notası. Bu 10 ms bir ses zaman çizelgesi testidir; askıya alınmış OS duvar saatinde 10 ms içinde ses donanımının çalışacağını iddia etmez.

### P2-62-04 — Daha eski HTTP gövdesi yeni relay aboneliğini geri alabiliyor

**Konum:** shim:891–944; server.js:1576–1660,1662–1705.

v57 istemci rota çiti **cevabın** yeni ekrana uygulanmasını önler; sunucuda aynı opaque oturumun istek gövdelerinin uygulama sırasını belirlemez. Abort edilen/yavaş isteğin gövdesi sonraki isteğin arkasından gelebilir. Aynı durum handoff prepare/commit arasındaki revizyonu da geçersiz kılabilir.

**Gerçek TCP kanıtı:** seq1 için başlıklar gönderilip gövde tutuldu; seq2 ile siyer'e katılım tamamlandı; sonra seq1'in eski genel gövdesi bırakıldı. Değişmemiş v61 sunucusu: **200, joined=genel**. v62 sunucusu: **409 relay-request-stale, joined=null**; seq3 aynı siyer üyeliğini yeniden katılımsız korudu. Test normal yerel Express/body-parser/HTTP oturumlarını kullanır; yalnız setTimeout sırasına dayalı bir model değildir.

**v62:** her opaque oturumda artan requestSeq; şekil doğrulaması sonrası, auth/üyelik mutasyonundan önce sunucu son sıra çiti. Eski sıra409; bir kez sıralı moda geçmiş oturumda eksik sıra409; geçersiz sıra400. Shim stale yanıtında oturumu gereksiz yenilemez. Oturum yenilenirken sayaç sıfırlanır; yeni rastgele capability ayrı sıra uzayıdır. Legacy public-ID oturumları ve henüz requestSeq kullanmamış eski opaque istemciler uyumlu kalır. Dolayısıyla koruma **v62 shim + v62 backend** birlikte kullanıldığında geçerlidir; eski istemciye geriye dönük tam sıralama garantisi verilmez.

## 3. Uçtan uca zincir: matematik, kapasite ve kalan sınırlar

| Katman | Kod ve denetim sonucu |
| --- | --- |
| Mikrofon / EQ / graph | rehber.html:1507–1759,1801–2027. gUM gerçek hızı ctx.sampleRate üzerinden çekirdeğe giriyor; 85 Hz HP,210 Hz/-2.5 dB mud cut,3.2 kHz/+2 dB presence,10.5 kHz LP. AEC istek; NS/AGC false, başarısızlıkta audio:true fallback. Yerel graph sahipliği, permission/module/import/heal/preview yarışları V60'ın17 grubunda PASS. Stop track'leri ve worklet'i bırakıyor. Socket, oda ve demo kontrolü bu turun ayrı bulguları. |
| Capture çekirdeği | pcm-capture-worklet.js:10–50,53–150,152–220,223–258. 193-tap ×256 faz FIR, kesim min(10200/rate,.45), 512 ring; DC/4 bant expander; 240 örnek/10 ms lookahead; 400 ms kalibrasyon,4 s rolling minima; SNR açma7.5 dB varsayılan,4 dB hysteresis,240 ms hold,3 ms attack/120 ms release; kapalı kazanç0.126 ≈ -18 dB. Comfort gecikmesi72 örnek/3 ms,600 ms sessizlik eşiği ve80 ms fade,2 ms yükselme. Paket480 örnek/20 ms; eski3072 örnek çerçevesi yok. ContinuousSpeech ve comfortFade profili yumuşak ünsüz/çevre sızıntısı değiş tokuşudur. |
| Sıra / binary | Her paket12 B header+960 B PCM=972 B; işaret biti phraseStart, seq mod2^31. Player modulo farkıyla dedup/wrap yapıyor. HTTP/MQTT kopyalarının aynı seq'si tekilleştirilebilir; seq tek başına kaynak kimliği değildir. v62 bu ayrımı JSON yükünde tamamlıyor. |
| Sunucu / 300 fan-out | server.js:432–448. Ses soketinde9720 B binary/16000 B JSON yumuşak sınır;65536 B sert sınır veya2 s devam eden tıkanma izolasyonu. 300 aynıIP join200 ve301 gerçekWS testi PASS. Yavaş kullanıcı için eski sesi düşürmek diğerlerini korur; tüm kelimeleri koruyup sıfır gecikme garantisi vermez. |
| HTTP / handoff | server.js:1390–1457,1479–1574; shim:294–378,863–944. Opaque capability,35 s aktiflik sınırı, periyodik temizleme; two-phase prepare/commit/revoke ve revision/digest, eski committed oturum409. Sunucu audio outbox10/200 ms ve control64; shim audio4 batch/200 ms, control64. Poll100 ms tek istekli short-poll; long-poll değil. v62 gövde sırasını ekler. |
| Listener / sahiplik | dinle.html:1180–1300,1599–1700,1999–2023,2079–2155. Pending ana thread kuyruğu en çok13 frame/260 ms; port FIFO + reset; rxLoadToken/context kimliği ve socket epoch çitleri var. Yeni post-stop/source/demo kontrolleriyle birlikte test edildi. AudioWorklet kurulamazsa etkin eski scheduler oynatıcısına dönüş yok; cihaz destek kapsamı buna göre seçilmeli. |
| Player / anti-alias | pcm-player-worklet.js:12–27,123–187,190–234,253–338. <24 kHz gerçek çıkışta193-tap RysOutputFir, ardından sürekli Hermite; >/=24 kHz'de bu düşük geçiren FIR gerekmez. 8/16/24/44.1/48 kHz reset/starvation ölçümleri aşağıda. |
| Jitter / PLC / catch-up | Başlangıç hedefi120 ms, uyarlanan hedef80–260 ms; başlangıç300 ms bekleme üst sınırı (en az bir paket varsa). Pitch PLC ilk60 ms'yi köprüler, sonraki kayıpta sönüm;300 ms starvation rebuffer. ASRC ±1000 ppm saat sürüklenmesi için; sürekli backlog'u hızlı eritmez. Hedef+120 ms üzerinde500 ms birikince kaynak çerçeve sınırında catch-up,72 örnek/3 ms recovery blend; toplam>32 kuyruk24'e düşer. Bunlar kayıp konuşmayı yeniden icat etmez. |
| Önbellek | Disk v61: cache/shim61, player61-audio, capture60-audio tutarlı. v62: cache/shim62, dinle SW62; DSP dosyaları değişmediğinden player61-audio/capture60-audio korunur. 8 shim kullanan HTML güncellenir. sw.js:51–78 API/WS/auth sayfalarını cache'lemez; diğer GET'ler network-first. SW canlı ses için arka plan çalışma garantisi sağlamaz. |

### 3.1 Ölçülen DSP davranışı

Aynı kaynak çekirdekleriyle tam doğrulamadaki sonuçlar; fiziksel ADC/DAC veya Bluetooth kodek ölçümü değildir.

| Çıkış Hz | reset sonrası ilk örnek | starvation sonrası ilk örnek | DC fixture içindeki maxStep |
| --- | --- | --- | --- |
| 8000 | 0 | 0 | 0.130492 |
| 16000 | 0 | 0 | 0.145227 |
| 24000 | 0 | 0 | 0.002640 |
| 44100 | 0 | 0 | 0.001428 |
| 48000 | 0 | 0 | 0.001314 |

8/16 kHz'deki yüksek iç maxStep, FIR'ın DC fixture geçici rejimidir; ilk örnek hatasıyla aynı metrik değildir. Rapor bunu sıfır cızırtı kanıtı olarak sunmaz. Player alias bastırımı:8 kHz çıkışta4080/4800/6000 Hz için -76.56/-107.60/-114.02 dB;16 kHz çıkışta8160/9600/10000 Hz için -97.45/-115.88/-127.11 dB. Capture8/16/44.1/48 kHz iki saniyede100 çerçeve; DC kalıntısı |mean|<=1.82e-10, ilgili test stopband değerleri -95.9/-95.9/-129.7/-107.3 dB. V61 ayrıca24 kHz girişte100 çerçeveyi doğruluyor. Stopband rakamları test tonlarına aittir; bütün frekanslar için aynı reddi iddia etmez. 200 Hz süreklilik fixture maxStep0.007356; örnek PLC probe concealedSamples960.

FIR grup gecikmesi96/girişHızı:8/16/24/44.1/48 kHz için12/6/4/2.18/2 ms. Buna10 ms gate lookahead,3 ms comfort delay,0–20 ms çerçeveleme, başlangıçta120 ms player hedefi ve düşük çıkış hızında4 ms FIR eklenir. Ağ, HTTP poll/coalescer ve cihaz çıkış gecikmesi ayrıca vardır. Bu bir tasarım bütçesidir; yerel WS gecikme yüzdelikleriyle ağızdan kulağa gecikme eşitlenmez.

### 3.2 300 kişi, ağ ve akustik için onaylanmamış alanlar

Ham PCM tek dinleyici24,000×2=48,000 B/s,384 kbit/s;972 B×50×300=14,580,000 B/s=**116.64 Mbit/s** sunucu çıkışı, WS/TLS/TCP/IP hariç. Base64 PCM tabanı1280×50×300=19,200,000 B/s=**153.6 Mbit/s**, JSON ve control hariç. Tamamı100 ms HTTP poll kullanan300 kişi boşta yaklaşık3000 istek/s üretir. Bu turda300 HTTP sürekli ses abonesi, gerçek VDS NIC/TLS CPU veya roaming kapasite testi yapılmadı. 300 join/WS testi bunu kanıtlamaz. Tek process/RAM relay oturumu çoklu Vercel instance arasında paylaşılan state değildir; farklı instance'a düşen open/poll/handoff için ortak state veya belirli bir relay otoritesi gerekir.

Public MQTT broker'larına gönderilen iki kopyanın kontrol sırası global olarak tekilleştirilmiş bir kaynak nesli değildir (shim:452–505,554–627). İstemcide bilinen sabit imza broker ACL'si veya güvenilir yayıncı kimlik doğrulaması sayılmaz. v62 geçersiz medya kaynağını seçili kaynağa göre reddeder; gecikmiş kontrol mesajlarının kaynak seçimini geri alma ihtimaline karşı dağıtık konsensüs veya oda yetkilendirmesi sağlamaz. PIN korunumu testleri native/HTTP sunucusuna aittir. Üretim MQTT yetki/otorite tasarımı ayrı kapatılmadan tüm taşıma yollarına aynı güvenlik/kesin sıralama onayı verilmez.

Tek mono mikrofonda yakın ve uzak insanların aynı zaman/frekans içeriği karışıktır; bu expander, konuşmacı ayırıcı/beamformer değildir. Gate kapalıyken bile kazanç0.126'dır; konuşurken ortam da geçebilir. Kulaklık mikrofonunu ağza yakın tutmak SNR'yi iyileştirir, fakat80 dB ortamı yüzde100 silmek bu ölçümlerle kanıtlanamaz. Başka telefonun50–400 ms hoparlör yolunun referansı burada yok; BroadcastChannel aynı origin/cihaz kapsamını aşmaz. AEC=true isteği ayrı cihazın gecikmeli akustik yolunu iptal etme garantisi değildir. [W3C Media Capture AEC tanımı](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-echocancellation).

Alarm/arama/arka plan/ekran kilidi AudioContext'i askıya alırsa donanım ve worklet gerçek zamanda durabilir; resume/rebuild kaybedilen zamanın konuşmasını geri getirmez. Suspended bağlamda currentTime ilerlemez. Gerçek iOS/Android sürümü, Bluetooth HFP/SCO geçişi ve dokunma gereksinimi sahada doğrulanmalı. [Web Audio durum ve suspend davranışı](https://www.w3.org/TR/webaudio/#dom-audiocontext-suspend). bufferedAmount yalnız henüz ağa verilmemiş uygulama baytlarını gösterir; uçtan uca teslim/çıkış gecikmesi ölçümü değildir. [WHATWG WebSocket bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount).

## 4. v62 yaması ve test düzeni

Yama12 dosyayı değiştirir: server.js, scripts/verify-system.js, rehber/dinle/shim/sw ve shim kullanan diğer6 HTML. Capture/player DSP dosyaları aynen korunur. Yeni ADIM-3.V62 + ADIM-5.V62 ile standart toplam **42** olur; eski V53..V61 testleri ve assertion'ları korunur. V61 yalnız doğru üyelik bariyeriyle senkronize edilir; cache beklentileri62'ye yükseltilir.

ADIM-3.V62 gerçek localhost sunucu/WS/HTTP kullanır: tutulan eski TCP gövdesi, native/HTTP stop-resume, yanlış kaynak, aynı kaynaktan geç PCM/synth, native binary stop, bayt paritesi. MQTT'nin paket genişletme yolu gerçek shim işleviyle VM'de sürülür; dış broker bağlantısı değildir. ADIM-5.V62 **11 grup**: coalescer; relay admission/source; JSON/binary/Blob receiver; demo timer; idle reconnect; demo node cleanup/suspend/cap; sunucu state; opaque request order; shim seq/reset/stale409; relay-open await sırasında stop; başarısız poll'de her iki yönde son kontrolün korunması.

Prova yöntemi: **bu dosyadaki tek diff bloğu diskteki dosyalara bağlam satırları birebir eşleştirilerek bellekte uygulandı**. fs.readFileSync ve Node module compile yalnız aday dosyalar için yönlendirildi; syntax check aday metne uygulandı. Verifier'ın raporu kaynak gibi okuması engellendi. localhost sunucu gerçek aday server.js ile çalıştı. Geçici data/runtime.json verifier'ın normal snapshot/restore mekanizmasını kullandı. İzlenen kaynak dosyalarına yama uygulanmadı. Bu, diskte v62 kuruluymuş gibi gösterilen bir test sonucu değildir.

## 5. Doğrudan uygulanabilir tek v62 unified diff

Aşağıdaki blok UTF-8/LF unified diff'tir; yalnız bu bloğu ayıklayarak git apply --check --ignore-space-change - ile kontrol edin. Bu denetimde kontrol yapılır, kaynaklara uygulama kullanıcıya bırakılır.

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -420,6 +420,7 @@
     activeTawafStage: room.activeTawafStage || null,
     guidePeerId: room.guidePeerId || null,
     audioSourceId:room.audioSourceId||null,
+    audioStateKnown:!!room.audioStateKnown,
     guideLocation: room.guideLocation || null,
     connectedPilgrims: pilgrims,
     connectedGuides: guides,
@@ -466,9 +467,14 @@
 }
 
 // v61: source identity is control metadata; the 972-byte PCM wire format is unchanged.
+function acceptRysAudio(room,sender,clientId,synth=false){
+  const sameSource=room.audioSourceId===(sender.audioSourceId||clientId);
+  return !(sameSource&&room.audioStateKnown&&(!room.isLive||!synth&&String(room.broadcastMode||'').startsWith('demo')));
+}
+
 function setRysAudioSource(room,sourceId){
   if(room.audioSourceId===sourceId)return;
-  room.audioSourceId=sourceId;
+  room.audioSourceId=sourceId;room.audioStateKnown=false;
   broadcastToRoom(room,{type:'audio-source',audioSourceId:sourceId});
 }
 
@@ -688,12 +694,14 @@
       r.guidePeerId = genelRoom.guidePeerId || null;
       r.guideName = genelRoom.guideName;
       setRysAudioSource(r,genelRoom.audioSourceId||null);
+      r.audioStateKnown=!!genelRoom.audioStateKnown;
       broadcastToRoom(r, {
         type: 'stream-state',
         isLive: r.isLive,
         broadcastMode: r.broadcastMode,
         currentTopic: r.currentTopic,
-        guidePeerId: r.guidePeerId || null
+        guidePeerId: r.guidePeerId || null,
+        audioSourceId:r.audioSourceId||null
       });
       continue;
     }
@@ -710,7 +718,8 @@
         isLive: r.isLive,
         broadcastMode: r.broadcastMode,
         currentTopic: r.currentTopic,
-        guidePeerId: r.guidePeerId || null
+        guidePeerId: r.guidePeerId || null,
+        audioSourceId:r.audioSourceId||null
       });
     }
   }
@@ -1029,6 +1038,7 @@
       if (sender.role !== 'guide' || !isAuthedClient) break;
       for (const r of getTargetBroadcastRooms(currentRoom)) {
         const wasLive = r.isLive;
+        setRysAudioSource(r,sender.audioSourceId||clientId);r.audioStateKnown=true;
         r.isLive = Boolean(msg.isLive);
         r.broadcastMode = msg.broadcastMode || (r.isLive ? 'mic' : 'idle');
         if (msg.topic) r.currentTopic = msg.topic;
@@ -1037,7 +1047,6 @@
         if (r.isLive) {
           if (!wasLive || !r.startedAt) r.startedAt = Date.now();
           r.activePublisherClientId = clientId;
-          setRysAudioSource(r,sender.audioSourceId||clientId);
         } else if (!r.activePublisherClientId || r.activePublisherClientId === clientId) {
           r.activePublisherClientId = null;
         }
@@ -1046,7 +1055,8 @@
           isLive: r.isLive,
           broadcastMode: r.broadcastMode,
           currentTopic: r.currentTopic,
-          guidePeerId: r.guidePeerId || null
+          guidePeerId: r.guidePeerId || null,
+        audioSourceId:r.audioSourceId||null
         });
       }
       broadcastToFamilyTrackers(currentRoom.tourCode, {
@@ -1138,6 +1148,8 @@
       ) {
         break;
       }
+      if(!acceptRysAudio(currentRoom,sender,clientId,!!msg.synthNote))break;
+      if(msg.audioSourceId&&msg.audioSourceId!==(sender.audioSourceId||clientId))break;
       currentRoom.activePublisherClientId = clientId;
       const serializedAudio = JSON.stringify({
         type: 'audio-chunk',
@@ -1145,6 +1157,7 @@
         seq: msg.seq ?? null,
         phraseStart: Boolean(msg.phraseStart),
         speakerId: clientId,
+        audioSourceId:sender.audioSourceId||clientId,
         speakerName: sender.name,
         speakerRole: sender.role,
         sampleRate: msg.sampleRate || 24000,
@@ -1292,6 +1305,7 @@
         return;
       }
 
+      if(!acceptRysAudio(ctx.currentRoom,sender,ctx.clientId))return;
       const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
       if (!validBinaryPcmFrame(buf)) return;
       ctx.currentRoom.activePublisherClientId = ctx.clientId;
@@ -1315,6 +1329,7 @@
                 seq,
                 phraseStart,
                 speakerId: ctx.clientId,
+                audioSourceId:sender.audioSourceId||ctx.clientId,
                 speakerName: sender.name,
                 speakerRole: sender.role,
                 sampleRate: 24000,
@@ -1632,11 +1647,26 @@
   return session.ws.familyTourCode===code;
 }
 
+// v62: an ordered opaque session cannot apply an older HTTP body after a newer one.
+function acceptRysRelayRequestOrder(session,input,res){
+  if(!session.relayKey)return true; // Keep the legacy public-ID protocol compatible.
+  const raw=input?.requestSeq;
+  if(raw===undefined){
+    if(session.lastRequestSeq===undefined)return true;
+    res.status(409).json({error:'relay-request-order-required'});return false;
+  }
+  const seq=typeof raw==='string'&&/^[1-9][0-9]{0,15}$/.test(raw)?Number(raw):raw;
+  if(!Number.isSafeInteger(seq)||seq<1){res.status(400).json({error:'relay-invalid-order'});return false;}
+  if(seq<=(session.lastRequestSeq||0)){res.status(409).json({error:'relay-request-stale'});return false;}
+  session.lastRequestSeq=seq;return true;
+}
+
 function serveRysRelay(session,req,res,token,context,messages=[]){
   if((context&&!isRysClientMessage(context))||!Array.isArray(messages)||messages.length>128||
     !messages.every(isRysClientMessage))return res.status(400).json({error:'relay-invalid-message'});
   if(context&&!['join','family-subscribe','admin-subscribe'].includes(context.type))
     return res.status(400).json({error:'relay-context-invalid'});
+  if(!acceptRysRelayRequestOrder(session,req.method==='GET'?req.query:req.body,res))return;
   if(!applyRysRelayAuth(session,req,token,context))
     return res.status(401).json({error:'relay-auth-required'});
   if(!syncRysRelayContext(session,context)){
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -581,6 +581,7 @@
   await runV59FanoutChecks({baseUrl,url:wsUrl,token:authToken});
   await runV60AudioRoundTrip({baseUrl,url:wsUrl,token:authToken});
   await runV61SessionChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV62StopChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1532,9 +1533,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v61"));assert(sw.includes('/vercel-ws-shim.js?v=61'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v62"));assert(sw.includes('/vercel-ws-shim.js?v=62'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'61',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'62',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2499,7 +2500,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v61'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v62'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2591,9 +2592,9 @@
   const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='roomSelect'?'genel':'6061',style:{},classList:{remove(){},add(){},contains(){return true;}}});return elements.get(id);};
   const noop=()=>{};
   const g={WebSocket:SocketClass||FakeSocket,ws:null,intentionalLeave:false,isAudioListening:true,
-    currentTour:{code:'A'},currentLang:'tr',pilgrimDeviceId:'v61-device',pendingRxFrames:[],rxAudioDeliveryEpoch:0,rxAudioSourceId:null,
+    currentTour:{code:'A'},currentLang:'tr',pilgrimDeviceId:'v61-device',pendingRxFrames:[],rxAudioDeliveryEpoch:0,rxAudioSourceId:null,rxStreamActive:null,rxStreamMode:null,
     rxPlayerWorkletNode:{port:{postMessage:m=>{if(m.type==='reset')player._reset();else if(m.type==='push')player._push(m);}}},
-    audioCtx:{state:'running',currentTime:1,resume:async()=>{}},activeScheduledSources:[],nextAudioTime:0,lastHwEndSample:0,rxHermiteHist:null,rxHermitePos:0,
+    audioCtx:{state:'running',currentTime:1,resume:async()=>{}},activeGuideDemoSources:new Map(),activeScheduledSources:[],nextAudioTime:0,lastHwEndSample:0,rxHermiteHist:null,rxHermitePos:0,
     lastReceivedAudioSeq:0,lastPacketReceivedAt:0,lastRawChunkAt:0,lastPacketReceivedAt:0,rxFallbackSubSeq:0,
     window:{location:{protocol:'http:',host:'localhost'},ryGetDynamicChannelId:(tour,room)=>tour+'/'+room},
     document:{getElementById:element,querySelector:()=>null},navigator:{geolocation:{clearWatch(){}}},gpsWatchId:null,
@@ -2605,7 +2606,7 @@
     renderGuideLiveLocation:noop,renderLiveTawafStage:noop,renderAnnouncements:noop,renderPrayers:noop,renderPilgrimJourney:noop,
     showAppToast:noop,playGentleHarmonyNote:noop,prependAnnouncement:noop,playNotificationChime:noop,sendServiceWorkerNotification:noop,
     stopBackgroundKeepAliveAudio:noop,releaseWakeLock:noop};
-  vm.createContext(g);vm.runInContext(['updateRxAudioSource','stopAllActiveSources','flushPendingRxFrames','playPcmSamples',
+  vm.createContext(g);vm.runInContext(['updateRxAudioSource','acceptRxAudioFrame','stopAllActiveSources','flushPendingRxFrames','playPcmSamples',
     'handleBinaryAudioFrame','connectWebSocket','leaveRoom'].map(pick).join('\n'),g);
   const packet=(seq,value=.1)=>{const b=new ArrayBuffer(972),v=new DataView(b);v.setUint32(0,seq,true);v.setFloat64(4,Date.now(),true);
     for(let i=0;i<480;i++)v.setInt16(12+i*2,Math.round(value*32767),true);return b;};
@@ -2709,7 +2710,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v61'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v62'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2766,6 +2767,15 @@
     await until(()=>h.player.q.has(10));assert(!h.player.q.has(1000));assert.equal(h.g.rxAudioSourceId,'page-dedicated');await poll();
     for(const r of ['genel','kadinlar','cocuk'])assert.equal(received.get(r).length,1,'dedicated audio leaked to '+r);
     const closed=new Promise(resolve=>dedicated.socket.once('close',resolve));dedicated.socket.terminate();await closed;
+    // Local TCP close is not the server membership linearization point.
+    const dedicatedId=dedicated.messages.find(m=>m.type==='joined').clientId,retiredBy=Date.now()+5000;
+    for(;;){
+      const response=await fetch(baseUrl+'/api/bootstrap',{headers}),snapshot=await response.json();
+      const room=snapshot.liveRooms.find(r=>r.tourCode===code&&r.roomId==='siyer');
+      if(room&&!room.connectedGuides.some(g=>g.id===dedicatedId))break;
+      if(Date.now()>retiredBy)throw Error('V61 dedicated membership did not retire');
+      await new Promise(r=>setTimeout(r,5));
+    }
     general.socket.send(binary(1001));await until(()=>h.player.q.has(1001)&&h.g.rxAudioSourceId==='page-general');await poll();
     await until(()=>h.g.document.getElementById('liveTopicText').textContent==='General topic',4000);
     const epoch=h.g.rxAudioDeliveryEpoch,oldClosed=new Promise(resolve=>general.socket.once('close',resolve));
@@ -2793,6 +2803,253 @@
   }
 }
 
+
+async function runStep5V62AudioChecks(){
+  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const shim=read('public/vercel-ws-shim.js'),guide=read('public/rehber.html'),listener=read('public/dinle.html'),server=read('server.js'),checks=[];
+  function pick(source,name,kind='function'){
+    const m=new RegExp('^[ \\t]*'+(kind==='function'?'(?:async )?function '+name:kind==='class'?'class '+name+'\\b':'(?:async )?'+name)+'(?:\\([^\\n]*\\))?\\s*\\{','m').exec(source);assert(m,'V62 missing '+name);
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){
+      const text=source.slice(m.index,end+1);try{new vm.Script(kind==='method'?'class Probe{'+text+'}':text);return text;}catch(e){if(e.name!=='SyntaxError')throw e;}
+    }throw Error('V62 unterminated '+name);
+  }
+  const unit=(seq,source='page-a')=>({type:'audio-chunk',seq,sampleRate:24000,sentAt:Date.now(),pcm16:Buffer.alloc(960).toString('base64'),audioSourceId:source});
+  {
+    const output=[],jobs=[],g={Date,Math,ArrayBuffer,Map,Set,Number,setTimeout:fn=>{jobs.push(fn);return jobs.length;},clearTimeout(){}};
+    vm.createContext(g);vm.runInContext(['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n')+'\n'+pick(shim,'RysAudioCoalescer','class'),g);
+    const socket={_isRelay:true,_joinContext:{audioSourceId:'page-a'},send:s=>output.push(JSON.parse(s)),close(){}};
+    g.installRysCoalescing(socket);socket.send(JSON.stringify(unit(1)));const old=jobs.at(-1);
+    socket.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));old();
+    assert.deepEqual(output.map(m=>m.type),['guide-stream-state']);
+    socket.send(JSON.stringify(unit(2)));socket.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'demo-synth'}));jobs.at(-1)();
+    assert.equal(output.filter(m=>m.type==='audio-chunk').length,0);checks.push('coalescer-stop-and-demo-barriers');
+  }
+  {
+    const published=[],jobs=[],g={Date,Math,ArrayBuffer,Map,Set,Number,window:{ryGetDynamicChannelId:()=> 'channel'}};
+    vm.createContext(g);vm.runInContext(pick(shim,'validRysAudio')+'\nclass Probe{'+pick(shim,'send','method')+'\n'+pick(shim,'_relayRoutingKey','method')+'}\nglobalThis.P=Probe;',g);
+    const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:true,_joinContext:{role:'guide',tourCode:'T',roomId:'genel',audioSourceId:'page-a'},
+      _sendQueue:[{type:'audio-chunk',frames:[unit(1)]},{type:'ping'}],_audioCoalescer:{clear(){jobs.push('clear');}},
+      _publishMqtt:m=>published.push(m),_broadcastP2PRoomState(){},_enqueueRelayMessage(m){p._sendQueue.push(m);return true;},_busConnected:()=>true});
+    p.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));
+    assert(!p._sendQueue.some(m=>m.type==='audio-chunk'));p.send(JSON.stringify(unit(2)));assert(!published.some(m=>m.type==='audio-chunk'));
+    p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));
+    p.send(JSON.stringify({type:'audio-chunk',frames:[unit(3,'page-old'),unit(4)]}));
+    const sent=published.find(m=>m.type==='audio-chunk');assert.deepEqual(Array.from(sent.frames,f=>f.seq),[4]);assert.equal(sent.frames[0].audioSourceId,'page-a');
+    p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'demo-synth'}));
+    p.send(JSON.stringify({type:'audio-chunk',synthNote:440}));
+    assert.equal(published.filter(m=>m.synthNote).at(-1).audioSourceId,'page-a');
+    const a=p._relayRoutingKey();p._joinContext.audioSourceId='page-b';assert.notEqual(p._relayRoutingKey(),a);checks.push('relay-queue-stop-admission-and-source-route');
+  }
+  {
+    const h=createV61ListenerHarness(listener,read('public/pcm-player-worklet.js')),s=h.connect();
+    s.onmessage({data:JSON.stringify({type:'audio-source',audioSourceId:'page-b'})});
+    s.onmessage({data:JSON.stringify({type:'stream-state',isLive:true,broadcastMode:'mic',audioSourceId:'page-b'})});
+    s.onmessage({data:JSON.stringify({...unit(9000,'page-a'),level:.4})});assert.equal(h.player.q.size,0);
+    s.onmessage({data:JSON.stringify({...unit(10,'page-b'),level:.4})});assert(h.player.q.has(10));
+    s.onmessage({data:JSON.stringify({type:'stream-state',isLive:false,broadcastMode:'idle',audioSourceId:'page-b'})});
+    s.onmessage({data:JSON.stringify({...unit(11,'page-b'),level:.4})});s.onmessage({data:h.packet(12)});
+    const blob=new h.DeferredBlob();s.onmessage({data:blob});blob.resolve(h.packet(13));await h.tick();assert.equal(h.player.q.size,0);
+    s.onmessage({data:JSON.stringify({type:'stream-state',isLive:true,broadcastMode:'demo-synth',audioSourceId:'page-b'})});
+    s.onmessage({data:JSON.stringify({...unit(14,'page-b'),level:.4})});assert.equal(h.player.q.size,0);
+    s.onmessage({data:JSON.stringify({type:'stream-state',isLive:true,broadcastMode:'mic',audioSourceId:'page-b'})});
+    s.onmessage({data:JSON.stringify({...unit(15,'page-b'),level:.4})});assert(h.player.q.has(15));    h.g.leaveRoom();const stopped=h.connect();
+    stopped.onmessage({data:JSON.stringify({type:'joined',room:{audioSourceId:'page-b',audioStateKnown:true,isLive:false,broadcastMode:'idle'}})});
+    stopped.onmessage({data:h.packet(16)});assert.equal(h.player.q.size,0);
+    h.g.leaveRoom();const legacy=h.connect();
+    legacy.onmessage({data:JSON.stringify({type:'joined',room:{audioSourceId:'legacy',audioStateKnown:false,isLive:false,broadcastMode:'idle'}})});
+    legacy.onmessage({data:h.packet(17)});assert(h.player.q.has(17));
+    checks.push('receiver-source-stop-mode-binary-Blob-and-resume');
+  }
+  {
+    const h=createV60GuideHarness(guide),intervals=[],sent=[];
+    Object.assign(h.g,{guideAudioSourceId:'unit-demo-page',guideDemoGeneration:0,demoInterval:null,animateGuideSpectrum(){},
+      setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},ws:{readyState:1,send:s=>sent.push(JSON.parse(s))}});
+    vm.runInContext(pick(guide,'toggleDemoBroadcast'),h.g);h.g.toggleDemoBroadcast();const old=intervals[0];old();
+    const start=h.g.toggleMicBroadcast();assert(!h.g.isDemoBroadcasting);const count=sent.length;old();assert.equal(sent.length,count);
+    h.requests[0].resolve(h.stream('mic-after-demo'));await start;old();assert.equal(sent.filter(m=>m.synthNote).length,1);h.g.stopMicBroadcast();
+    checks.push('queued-demo-timer-cannot-send-after-mic-transition');
+  }
+  {
+    const sent=[],g={ws:{readyState:1,send:s=>sent.push(JSON.parse(s))},WebSocket:{OPEN:1},guideDeviceId:'d',guideAudioSourceId:'page-stable',
+      document:{getElementById:id=>({value:id==='guideRoomSelect'?'genel':'T'})},window:{ryGetDynamicChannelId:()=> 'channel'},localStorage:{getItem:()=>''},
+      isMicBroadcasting:false,isDemoBroadcasting:false,currentActiveTawafId:null,isSharingGuideLocation:false};
+    vm.createContext(g);vm.runInContext(pick(guide,'sendGuideJoinAndSync'),g);g.sendGuideJoinAndSync();
+    assert.equal(sent[0].audioSourceId,'page-stable');assert.equal(sent[1].isLive,false);assert.equal(sent[1].broadcastMode,'idle');checks.push('idle-guide-reconnect-explicitly-syncs-stop');
+  }
+  {
+    const h=createV61ListenerHarness(listener,read('public/pcm-player-worklet.js')),params=[],nodes=[];
+    h.g.gainNode={};const param=()=>({value:.08,setValueAtTime(v,t){params.push(['value',v,t]);},exponentialRampToValueAtTime(){},
+      cancelAndHoldAtTime:t=>params.push(['hold',t]),setTargetAtTime:(v,t,c)=>params.push(['target',v,t,c])});
+    h.g.audioCtx.createGain=()=>{const n={gain:param(),connect(){},disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
+    h.g.audioCtx.createOscillator=()=>{const n={context:h.g.audioCtx,frequency:param(),stops:[],connect(){},start(){},stop:t=>n.stops.push(t),disconnect(){this.disconnected=true;}};nodes.push(n);return n;};
+    vm.runInContext(pick(listener,'playGentleHarmonyNote'),h.g);h.g.playGentleHarmonyNote(440,true);assert.equal(h.g.activeGuideDemoSources.size,1);
+    const osc=nodes[0],env=nodes[1];h.g.stopAllActiveSources();assert.equal(h.g.activeGuideDemoSources.size,0);
+    assert.equal(osc.stops.at(-1),1.01);assert(params.some(a=>a[0]==='target'&&a[1]===0));osc.onended();assert(osc.disconnected&&env.disconnected);
+    h.g.audioCtx.state='suspended';const count=nodes.length;h.g.playGentleHarmonyNote(440,true);assert.equal(nodes.length,count);
+    h.g.audioCtx.state='running';for(let i=0;i<5;i++)h.g.playGentleHarmonyNote(440,true);
+    assert.equal(h.g.activeGuideDemoSources.size,4);h.g.stopAllActiveSources();assert.equal(h.g.activeGuideDemoSources.size,0);
+    checks.push('demo-note-stop-ramps-disconnects-suspension-and-cap');
+  }
+  {
+    const g={broadcastToRoom(){}};vm.createContext(g);vm.runInContext(pick(server,'acceptRysAudio')+'\n'+pick(server,'setRysAudioSource'),g);
+    const room={};g.setRysAudioSource(room,'a');room.audioStateKnown=true;room.isLive=false;room.broadcastMode='idle';
+    assert(!g.acceptRysAudio(room,{audioSourceId:'a'},'client'));assert(g.acceptRysAudio(room,{audioSourceId:'b'},'client'));
+    room.isLive=true;room.broadcastMode='demo-synth';assert(!g.acceptRysAudio(room,{audioSourceId:'a'},'client'));assert(g.acceptRysAudio(room,{audioSourceId:'a'},'client',true));
+    g.setRysAudioSource(room,'b');assert(!room.audioStateKnown);checks.push('server-known-stop-demo-and-legacy-new-source');
+  }
+  {
+    const g={};vm.createContext(g);vm.runInContext(pick(server,'acceptRysRelayRequestOrder'),g);
+    const session={relayKey:'a'.repeat(48)},response={status(n){this.code=n;return this;},json(m){this.body=m;}};
+    assert(g.acceptRysRelayRequestOrder(session,{requestSeq:2},response));
+    assert(!g.acceptRysRelayRequestOrder(session,{requestSeq:1},response));assert.equal(response.body.error,'relay-request-stale');
+    assert(!g.acceptRysRelayRequestOrder(session,{},response));assert.equal(response.body.error,'relay-request-order-required');
+    assert(!g.acceptRysRelayRequestOrder(session,{requestSeq:1.5},response));assert.equal(response.code,400);
+    assert(g.acceptRysRelayRequestOrder(session,{requestSeq:3},response));assert.equal(session.lastRequestSeq,3);
+    assert(g.acceptRysRelayRequestOrder({}, {},response));checks.push('opaque-order-stale-missing-invalid-and-legacy');
+  }
+  {
+    const bodies=[],g={Date,Math,localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},queueMicrotask,
+      AbortController:class{constructor(){this.signal={};}abort(){}},fetch:async(url,options)=>{
+        const body=JSON.parse(options.body);bodies.push(body);
+        return {ok:body.requestSeq!==3,status:body.requestSeq===3?409:200,json:async()=>body.requestSeq===3?{error:'relay-request-stale'}:{messages:[]}};
+      }};
+    vm.createContext(g);vm.runInContext('class Probe{'+['_flushAndPoll','_resetRelaySession'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=Probe;',g);
+    const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_sendQueue:[],_httpEpoch:0,_relayClientId:'rys56-unit',_relayKey:'a'.repeat(48),
+      _joinContext:{type:'join',role:'pilgrim',tourCode:'T'},_relayRoutingKey:()=> 'route',_deliverIncomingMessage(){}});
+    await p._flushAndPoll();await p._flushAndPoll();await p._flushAndPoll();
+    assert.deepEqual(bodies.map(m=>m.requestSeq),[1,2,3]);assert.equal(p._relayClientId,'rys56-unit');
+    p._resetRelaySession();assert.equal(p._relayRequestSeq,0);assert.equal(p._relayClientId,null);checks.push('client-monotonic-polls-stale-response-and-session-reset');
+  }
+  {
+    let resolveOpen;const bodies=[],g={Date,Math,localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},queueMicrotask,
+      AbortController:class{constructor(){this.signal={};}abort(){}},fetch:async(url,options)=>{
+        const body=JSON.parse(options.body);bodies.push(body);
+        if(body.type==='relay-open')return new Promise(resolve=>resolveOpen=resolve);
+        return {ok:true,json:async()=>({messages:[]})};
+      }};
+    vm.createContext(g);vm.runInContext('class Probe{'+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.P=Probe;',g);
+    const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,_sendQueue:[{...unit(90),_queuedAt:Date.now()}],
+      _joinContext:{type:'join',role:'guide',tourCode:'T',audioSourceId:'page-a'},_lastGuideState:{type:'guide-stream-state',isLive:true,broadcastMode:'mic'},
+      _relayRoutingKey:()=> 'route',_deliverIncomingMessage(){}});
+    const running=p._flushAndPoll();p._lastGuideState={type:'guide-stream-state',isLive:false,broadcastMode:'idle'};
+    resolveOpen({ok:true,json:async()=>({clientId:'rys56-new',relayKey:'a'.repeat(48)})});await running;
+    assert(!bodies.at(-1).messages.some(m=>m.type==='audio-chunk'));assert(bodies.at(-1).messages.some(m=>m.type==='guide-stream-state'&&m.isLive===false));
+    checks.push('stop-while-relay-open-drops-captured-batch');
+  }
+  {
+    for(const latestLive of [false,true]){
+      let rejectPoll;const g={Date,Math,Number,localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},queueMicrotask(){},
+        AbortController:class{constructor(){this.signal={};}abort(){}},fetch:()=>new Promise((resolve,reject)=>rejectPoll=reject)};
+      vm.createContext(g);vm.runInContext('class Probe{'+['_flushAndPoll','_enqueueRelayMessage'].map(n=>pick(shim,n,'method')).join('\n')+'}\nglobalThis.P=Probe;',g);
+      const stale={type:'guide-stream-state',isLive:!latestLive,broadcastMode:latestLive?'idle':'mic'},latest={type:'guide-stream-state',isLive:latestLive,broadcastMode:latestLive?'mic':'idle'};
+      const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:false,_httpEpoch:0,_sendQueue:[stale],_lastGuideState:stale,
+        _relayClientId:'rys56-retry',_relayKey:'a'.repeat(48),_joinContext:{type:'join',role:'guide',tourCode:'T',audioSourceId:'page-a'},_relayRoutingKey:()=> 'route'});
+      const running=p._flushAndPoll();p._lastGuideState=latest;p._enqueueRelayMessage(latest);rejectPoll(Error('injected poll failure'));await running;
+      assert.deepEqual(Array.from(p._sendQueue,m=>m.isLive),[latestLive]);assert.equal(p._sendQueue[0].broadcastMode,latest.broadcastMode);
+    }
+    checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
+  }
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v62'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
+  recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
+  console.log('V62 UNIT PASS');
+}
+
+
+async function runV62StopChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
+  const code='RY-V62-'+Date.now().toString(36).toUpperCase(),headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
+  const sockets=[],controls=[],jsonAudio=[],binaryAudio=[],httpAudio=[],errors=[];let h,guideSession,listenerSession,created=false;
+  let context={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V62 guide',token,audioSourceId:'page-a'};
+  const until=async test=>{const end=Date.now()+5000;while(!test()){if(Date.now()>end)throw Error('V62 stop deadline '+JSON.stringify({source:h?.g.rxAudioSourceId,active:h?.g.rxStreamActive,mode:h?.g.rxStreamMode,q:h?Array.from(h.player.q.keys()):[],controls:controls.slice(-7).map(m=>({type:m.type,source:m.audioSourceId,live:m.isLive,error:m.message})),json:jsonAudio.map(m=>m.seq),http:httpAudio.map(m=>m.seq),binary:binaryAudio.map(b=>b.readUInt32LE(0))}));await new Promise(r=>setTimeout(r,5));}};
+  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
+  const open=async()=>{const r=await post({type:'relay-open',version:56});return {clientId:r.clientId,relayKey:r.relayKey};};
+  const pcm=Buffer.alloc(960);for(let i=0;i<480;i++)pcm.writeInt16LE(1234,2*i);
+  const unit=(seq,source)=>({type:'audio-chunk',seq,sentAt:Date.now(),sampleRate:24000,pcm16:pcm.toString('base64'),audioSourceId:source,level:.4});
+  const send=messages=>post({...guideSession,token,subscriptionContext:context,messages});
+  const state=(isLive,mode='mic')=>({type:'guide-stream-state',isLive,broadcastMode:isLive?mode:'idle'});
+  const poll=async()=>{const r=await post({...listenerSession,subscriptionContext:{type:'join',role:'pilgrim',tourCode:code,roomId:'genel',pin:'6062',name:'V62 HTTP'}});
+    httpAudio.push(...(r.messages||[]).filter(m=>m.type==='audio-chunk'));};
+  class Bridge{static OPEN=1;static CONNECTING=0;static CLOSED=3;
+    constructor(address){this.real=new WebSocket(address);sockets.push(this.real);
+      this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));this.real.on('error',e=>{errors.push(e.message);this.onerror?.(e);});
+      this.real.on('message',(raw,binary)=>{
+        if(binary)binaryAudio.push(Buffer.from(raw));else{const m=JSON.parse(raw);controls.push(m);if(m.type==='audio-chunk')jsonAudio.push(m);}
+        this.onmessage?.({data:binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString()});
+      });}
+    get readyState(){return this.real.readyState;}send(raw){this.real.send(raw);}close(){this.real.close();}}
+  const barrier=async()=>{const ts=Date.now()+Math.random();h.g.ws.send(JSON.stringify({type:'ping',ts}));await until(()=>controls.some(m=>m.type==='pong'&&m.echoTs===ts));};
+  function pick(source,name){const m=new RegExp('^[ \\t]*(?:async )?'+name+'\\([^\\n]*\\)\\s*\\{','m').exec(source);assert(m);
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const text=source.slice(m.index,end+1);
+      try{new vm.Script('class Probe{'+text+'}');return text;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('Unterminated '+name);}
+  try{
+    const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers,body:JSON.stringify({code,name:'V62 stop/source',pin:'6062'})});assert.equal(r.status,200);await r.arrayBuffer();created=true;
+    // Real TCP headers/body reordering: seq2 completes before seq1's body is released.
+    const ordered=await open(),newContext={type:'join',role:'pilgrim',tourCode:code,roomId:'siyer',pin:'6062',name:'ordered'};
+    const oldBody=JSON.stringify({...ordered,requestSeq:1,subscriptionContext:{...newContext,roomId:'genel'}});
+    let oldRequest;
+    const oldResponse=new Promise((resolve,reject)=>{
+      oldRequest=require('node:http').request(baseUrl+'/api/ws-relay',{method:'POST',headers:{...headers,'Content-Length':Buffer.byteLength(oldBody)}},res=>{
+        const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString())}));
+      });oldRequest.on('error',reject);oldRequest.setTimeout(5000,()=>oldRequest.destroy(Error('V62 old body deadline')));oldRequest.flushHeaders();
+    });
+    try{
+      const newer=await post({...ordered,requestSeq:2,subscriptionContext:newContext});assert(newer.messages.some(m=>m.type==='joined'&&m.room.roomId==='siyer'));
+      oldRequest.end(oldBody);const stale=await oldResponse;
+      console.log('V62 ORDER PROBE '+JSON.stringify({lateStatus:stale.status,lateError:stale.body.error,lateJoined:stale.body.messages?.find(m=>m.type==='joined')?.room?.roomId||null}));
+      assert.equal(stale.status,409);assert.equal(stale.body.error,'relay-request-stale');
+      const missing=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify({...ordered,subscriptionContext:newContext})});
+      assert.equal(missing.status,409);assert.equal((await missing.json()).error,'relay-request-order-required');
+      const current=await post({...ordered,requestSeq:3,subscriptionContext:newContext});assert(!current.messages.some(m=>m.type==='joined'));
+    }finally{if(!oldRequest.writableEnded)oldRequest.end(oldBody);await oldResponse.catch(()=>{});await post({...ordered,type:'relay-close',version:56});}
+    guideSession=await open();await send([state(true)]);
+    h=createV61ListenerHarness(fs.readFileSync(path.join(ROOT_DIR,'public/dinle.html'),'utf8'),fs.readFileSync(path.join(ROOT_DIR,'public/pcm-player-worklet.js'),'utf8'),Bridge);
+    const address=new URL(url);h.g.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};
+    h.g.document.getElementById('tourPinInput').value='6062';h.connect(code);await until(()=>controls.some(m=>m.type==='joined'));
+    listenerSession=await open();await poll();
+    await send([unit(1,'page-a')]);await until(()=>h.player.q.has(1));await poll();
+    await send([state(false)]);await until(()=>h.g.rxStreamActive===false);await send([unit(2,'page-a')]);await barrier();await poll();
+    assert.equal(jsonAudio.length,1);assert(!httpAudio.some(m=>m.seq===2));assert.equal(h.player.q.size,0);
+    await send([state(true),unit(3,'page-retired')]);await barrier();await poll();assert.equal(jsonAudio.length,1);
+    context={...context,audioSourceId:'page-b'};await send([state(true),unit(10,'page-b')]);await until(()=>h.player.q.has(10));await poll();
+    const shim=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8'),g={};vm.createContext(g);
+    // _deliverIncomingMessage expands the same per-frame tags used by MQTT, with no public broker dependency.
+    const valid=shim.slice(shim.indexOf('  function validRysAudio'),shim.indexOf('  // PATCH: coalescing-v50'));
+    vm.runInContext(valid+'\nclass Delivery{'+pick(shim,'_deliverIncomingMessage')+'}\nglobalThis.D=Delivery;',g);
+    const delivery=new g.D();delivery._seenIds=new Set();delivery.onmessage=e=>h.g.ws.onmessage(e);
+    delivery._deliverIncomingMessage({_msgId:'retired-a',type:'audio-chunk',frames:[unit(9000,'page-a'),unit(9001,'page-a')]});
+    assert.deepEqual(Array.from(h.player.q.keys()),[10]);
+    const timerJobs=[],sent=[],sock={_isRelay:true,_joinContext:context,close(){},send:raw=>sent.push(JSON.parse(raw))};
+    vm.runInContext(shim.slice(shim.indexOf('  class RysAudioCoalescer'),shim.indexOf('  class SmartWebSocket')),Object.assign(g,{Date,Math,setTimeout:fn=>{timerJobs.push(fn);return timerJobs.length;},clearTimeout(){}}));
+    g.installRysCoalescing(sock);sock.send(JSON.stringify(unit(11,'page-b')));const staleTimer=timerJobs.at(-1);
+    sock.send(JSON.stringify(state(false)));staleTimer();assert.deepEqual(sent.map(m=>m.type),['guide-stream-state']);
+    await send(sent);await until(()=>h.g.rxStreamActive===false);
+    delivery._deliverIncomingMessage({_msgId:'late-b',type:'audio-chunk',frames:[unit(12,'page-b')]});assert.equal(h.player.q.size,0);
+    await post({...guideSession,type:'relay-close',version:56});guideSession=null;
+    const publisher=new WebSocket(url),events=[];sockets.push(publisher);publisher.on('error',e=>errors.push(e.message));
+    publisher.on('message',(raw,binary)=>{if(!binary)events.push(JSON.parse(raw));});await new Promise((resolve,reject)=>{publisher.once('open',resolve);publisher.once('error',reject);});
+    publisher.send(JSON.stringify(context));await until(()=>events.some(m=>m.type==='joined'));
+    const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+    const publisherBarrier=async()=>{const ts=Date.now()+Math.random();publisher.send(JSON.stringify({type:'ping',ts}));await until(()=>events.some(m=>m.type==='pong'&&m.echoTs===ts));await barrier();};
+    publisher.send(binary(100));await publisherBarrier();await poll();assert.equal(binaryAudio.length,0);assert(!httpAudio.some(m=>m.seq===100));
+    publisher.send(JSON.stringify(state(true)));publisher.send(binary(101));await until(()=>h.player.q.has(101));await poll();
+    publisher.send(JSON.stringify(state(false)));publisher.send(binary(102));publisher.send(JSON.stringify({type:'audio-chunk',synthNote:440,audioSourceId:'page-b'}));
+    await publisherBarrier();await poll();assert.equal(binaryAudio.length,1);assert(!httpAudio.some(m=>m.seq===102||m.synthNote));assert.equal(h.player.q.size,0);
+    assert.deepEqual(httpAudio.map(m=>m.seq),[1,10,101]);assert.deepEqual(jsonAudio.map(m=>m.seq),[1,10]);
+    for(const m of httpAudio){assert(Buffer.from(m.pcm16,'base64').equals(pcm));assert.equal(m.audioSourceId,m.seq===1?'page-a':'page-b');}
+    assert(binaryAudio[0].subarray(12).equals(pcm));assert.deepEqual(errors,[]);
+    console.log('V62 E2E METRICS '+JSON.stringify({acceptedHttpSeq:httpAudio.map(m=>m.seq),acceptedNativeJsonSeq:jsonAudio.map(m=>m.seq),
+      acceptedNativeBinarySeq:binaryAudio.map(b=>b.readUInt32LE(0)),postStopAudio:0,retiredSourceAudio:0,coalescerAfterStop:0,pcmEqual:true}));
+    recordResult('ADIM-3.V62','Real native/HTTP stop+resume; delayed/source-mismatched media rejected; MQTT delivery tags; coalescer barrier; PCM parity',true);
+    console.log('V62 E2E PASS');
+  }finally{
+    h?.g.leaveRoom();for(const s of sockets)try{s.terminate();}catch(e){}
+    if(guideSession)try{await post({...guideSession,type:'relay-close',version:56});}catch(e){}
+    if(listenerSession)try{await post({...listenerSession,type:'relay-close',version:56});}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -2808,6 +3065,7 @@
     await runStep5V59AudioChecks();
     await runStep5V60AudioChecks();
     await runStep5V61AudioChecks();
+    await runStep5V62AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=61"></script>
+  <script src="/vercel-ws-shim.js?v=62"></script>
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
-  <script src="/vercel-ws-shim.js?v=61"></script>
+  <script src="/vercel-ws-shim.js?v=62"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1179,10 +1179,22 @@
 
     function updateRxAudioSource(sourceId){
       if(typeof sourceId!=='string'||!sourceId)return;
-      if(rxAudioSourceId!==null&&rxAudioSourceId!==sourceId){
-        lastReceivedAudioSeq=0;stopAllActiveSources();
+      if(rxAudioSourceId!==sourceId){
+        if(rxAudioSourceId!==null){lastReceivedAudioSeq=0;stopAllActiveSources();}
+        rxStreamActive=null;rxStreamMode=null;
       }
       rxAudioSourceId=sourceId;
+    }
+
+    function acceptRxAudioFrame(sourceId,synth=false){
+      if(rxStreamActive===false)return false;
+      if(!synth&&String(rxStreamMode||'').startsWith('demo')||synth&&rxStreamMode==='mic')return false;
+      if(sourceId!=null){
+        if(typeof sourceId!=='string'||!sourceId||sourceId.length>128||!(/^[a-zA-Z0-9_.-]+$/).test(sourceId))return false;
+        if(rxAudioSourceId!==null&&rxAudioSourceId!==sourceId)return false;
+        if(rxAudioSourceId===null)updateRxAudioSource(sourceId);
+      }
+      return true;
     }
 
     function connectWebSocket(tourCode, roomId, name, phone) {
@@ -1190,7 +1202,7 @@
         clearTimeout(window._ryWsReconnectTimeout);
         window._ryWsReconnectTimeout = null;
       }
-      rxAudioSourceId=null;lastReceivedAudioSeq=0;stopAllActiveSources();
+      rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;lastReceivedAudioSeq=0;stopAllActiveSources();
       if (ws) {
         try {
           ws.onopen=null;ws.onmessage=null;
@@ -1235,12 +1247,12 @@
         if(!current())return;
         window.__ryLastServerMsgAt = Date.now();
         if (event.data instanceof ArrayBuffer) {
-          handleBinaryAudioFrame(event.data);
+          if(acceptRxAudioFrame())handleBinaryAudioFrame(event.data);
           return;
         }
         if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
           const epoch=rxAudioDeliveryEpoch;
-          event.data.arrayBuffer().then(buf=>{if(current()&&epoch===rxAudioDeliveryEpoch)handleBinaryAudioFrame(buf);}).catch(()=>{});
+          event.data.arrayBuffer().then(buf=>{if(current()&&epoch===rxAudioDeliveryEpoch&&acceptRxAudioFrame())handleBinaryAudioFrame(buf);}).catch(()=>{});
           return;
         }
         let msg;
@@ -1255,6 +1267,9 @@
           const r = msg.room;
           if (r) {
             updateRxAudioSource(r.audioSourceId);
+            if(r.audioStateKnown===true&&(msg.type==='joined'||rxStreamActive===null)){
+              rxStreamActive=!!r.isLive;rxStreamMode=r.broadcastMode||null;
+            }else if(rxStreamActive===null&&r.isLive===true){rxStreamActive=true;rxStreamMode=r.broadcastMode||null;}
             document.getElementById('liveGuideName').textContent = r.guideName;
             document.getElementById('liveListenerCount').textContent = r.totalListeners;
             document.getElementById('liveTopicText').textContent = r.currentTopic;
@@ -1283,6 +1298,8 @@
 
         if (msg.type === 'stream-state') {
           updateRxAudioSource(msg.audioSourceId);
+          if(typeof msg.isLive==='boolean')rxStreamActive=msg.isLive;
+          if(typeof msg.broadcastMode==='string')rxStreamMode=msg.broadcastMode;
           if (msg.currentTopic) {
             document.getElementById('liveTopicText').textContent = msg.currentTopic;
           }
@@ -1330,6 +1347,7 @@
         }
 
         if (msg.type === 'audio-chunk') {
+          if(!acceptRxAudioFrame(msg.audioSourceId,!!msg.synthNote))return;
           window.__ryPilgrimReconnectAttempts = 0;
           if (window.__ryPilgrimConnState === 'reconnecting') {
             updatePilgrimConnectionUi('connected');
@@ -1347,7 +1365,7 @@
             } else if (msg.samples && msg.samples.length) {
               playPcmSamples(msg.samples, msg.sampleRate || 24000, false, msg.seq || 0, Boolean(msg.phraseStart), isSilentFrame);
             } else if (msg.synthNote) {
-              playGentleHarmonyNote(msg.synthNote);
+              playGentleHarmonyNote(msg.synthNote,true);
             }
           }
         }
@@ -1598,6 +1616,7 @@
     let interruptionRecoveryTimer = null;
     let rxLoadToken = 0;
     let rxAudioDeliveryEpoch=0,rxAudioSourceId=null;
+    let rxStreamActive=null,rxStreamMode=null;
     const pendingRxFrames = [];
 
     function flushPendingRxFrames() {
@@ -1995,10 +2014,24 @@
     let rxHermiteHist = null;
     let rxHermitePos = 0;
     const activeScheduledSources = [];
+    const activeGuideDemoSources=new Map();
 
     function stopAllActiveSources() {
       ++rxAudioDeliveryEpoch;
       pendingRxFrames.length = 0;
+      for(const [source,envelope] of activeGuideDemoSources){
+        activeGuideDemoSources.delete(source);
+        try{
+          const now=source.context?.currentTime??audioCtx?.currentTime??0;
+          if(envelope.gain.cancelAndHoldAtTime)envelope.gain.cancelAndHoldAtTime(now);
+          else{const held=envelope.gain.value;envelope.gain.cancelScheduledValues(now);envelope.gain.setValueAtTime(held,now);}
+          envelope.gain.setTargetAtTime(0,now,.001);source.stop(now+.010);
+        }catch(e){
+          source.onended=null;
+          try{source.stop();}catch(e){}
+          try{source.disconnect();envelope.disconnect();}catch(e){}
+        }
+      }
       if (rxPlayerWorkletNode && rxPlayerWorkletNode.port) {
         try {
           rxPlayerWorkletNode.port.postMessage({ type: 'reset' });
@@ -2156,8 +2189,13 @@
       }
     }
 
-    function playGentleHarmonyNote(freq = 440) {
+    function playGentleHarmonyNote(freq = 440,guideDemo = false) {
       if (!audioCtx || !gainNode) return;
+      if(audioCtx.state!=='running'){
+        if(guideDemo&&isAudioListening)forceResurrectPilgrimAudio('demo-packet');
+        return;
+      }
+      if(guideDemo&&activeGuideDemoSources.size>=4)return;
       const osc = audioCtx.createOscillator();
       const env = audioCtx.createGain();
       osc.type = 'sine';
@@ -2167,6 +2205,8 @@
       env.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
       osc.connect(env);
       env.connect(gainNode);
+      if(guideDemo)activeGuideDemoSources.set(osc,env);
+      osc.onended=()=>{activeGuideDemoSources.delete(osc);try{osc.disconnect();env.disconnect();}catch(e){}};
       osc.start();
       osc.stop(audioCtx.currentTime + 0.36);
     }
@@ -2513,7 +2553,7 @@
     }
 
     function leaveRoom() {
-      intentionalLeave = true;rxAudioSourceId=null;
+      intentionalLeave = true;rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;
       if (window._ryWsReconnectTimeout) {
         clearTimeout(window._ryWsReconnectTimeout);
         window._ryWsReconnectTimeout = null;
@@ -2577,7 +2617,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=61').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=62').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=61"></script>
+  <script src="/vercel-ws-shim.js?v=62"></script>
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
-  <script src="/vercel-ws-shim.js?v=61"></script>
+  <script src="/vercel-ws-shim.js?v=62"></script>
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
-  <script src="/vercel-ws-shim.js?v=61"></script>
+  <script src="/vercel-ws-shim.js?v=62"></script>
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
-  <script src="/vercel-ws-shim.js?v=61"></script>
+  <script src="/vercel-ws-shim.js?v=62"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
     .console-wrap {
@@ -643,6 +643,7 @@
     let scriptProcessor = null;
     let isMicBroadcasting = false;
     let isDemoBroadcasting = false;
+    let guideDemoGeneration=0;
     let demoInterval = null;
     let activeSosAlerts = [];
     let guideAnnouncements = [];
@@ -703,11 +704,11 @@
         name: guideName,
         guidePeerId
       }));
-      if (isMicBroadcasting || isDemoBroadcasting) {
+      {
         ws.send(JSON.stringify({
           type: 'guide-stream-state',
-          isLive: true,
-          broadcastMode: isMicBroadcasting ? 'mic' : 'demo-synth',
+          isLive: Boolean(isMicBroadcasting||isDemoBroadcasting),
+          broadcastMode: isMicBroadcasting ? 'mic' : (isDemoBroadcasting?'demo-synth':'idle'),
           topic: document.getElementById('topicInput')?.value?.trim() || '',
           guidePeerId
         }));
@@ -1624,6 +1625,7 @@
         if (ws.isRelay || ws._isRelay) {
           ws.send(JSON.stringify({
             type: 'audio-chunk',
+            audioSourceId:guideAudioSourceId,
             seq: guideAudioSeq,
             phraseStart,
             sentAt: Date.now(),
@@ -2041,6 +2043,7 @@
         }
       }
       isDemoBroadcasting = !isDemoBroadcasting;
+      const generation=++guideDemoGeneration;
       if (isDemoBroadcasting) {
         startBroadcastClock();
         if (btn) {
@@ -2059,12 +2062,14 @@
         const notes = [440, 493.88, 523.25, 587.33, 659.25, 587.33, 523.25, 493.88];
         let idx = 0;
         demoInterval = setInterval(() => {
+          if(!isDemoBroadcasting||generation!==guideDemoGeneration)return;
           const level = 0.4 + Math.random() * 0.45;
           animateGuideSpectrum(level);
           if (ws && ws.readyState === WebSocket.OPEN) {
             ws.send(JSON.stringify({
               type: 'audio-chunk',
               level,
+              audioSourceId:guideAudioSourceId,
               synthNote: notes[idx % notes.length]
             }));
           }
diff --git a/public/rota.html b/public/rota.html
--- a/public/rota.html
+++ b/public/rota.html
@@ -9,7 +9,7 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=61"></script>
+  <script src="/vercel-ws-shim.js?v=62"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v61';
+const CACHE_NAME = 'ridvanses-pwa-v62';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=61',
+  '/vercel-ws-shim.js?v=62',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
   '/pcm-player-worklet.js?v=61-audio',
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -66,6 +66,7 @@
       m.seq <= 0x7fffffff &&
       Number.isFinite(m.sentAt) &&
       m.sentAt > 0 &&
+      (m.audioSourceId==null||(typeof m.audioSourceId==='string'&&m.audioSourceId.length<=128&&/^[a-zA-Z0-9_.-]+$/.test(m.audioSourceId))) &&
       typeof m.pcm16 === 'string' &&
       m.pcm16.length === 1280 &&
       /^[A-Za-z0-9+/]+$/.test(m.pcm16)
@@ -115,8 +116,9 @@
       try {
         m = typeof data === 'string' ? JSON.parse(data) : null;
       } catch (e) {}
+      if(m?.type==='guide-stream-state'&&(!m.isLive||String(m.broadcastMode||'').startsWith('demo')))c.clear();
       if (sock._isRelay && validRysAudio(m)) {
-        c.push(m);
+        c.push({...m,audioSourceId:m.audioSourceId||sock._joinContext?.audioSourceId||null});
         return;
       }
       send(data);
@@ -298,7 +300,7 @@
         try{fetch('/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},
           body:JSON.stringify({type:'relay-close',version:56,clientId,relayKey}),keepalive:true}).catch(()=>{});}catch(e){}
       }
-      this._relayClientId=null;this._relayKey=null;this._relayFenced=false;
+      this._relayClientId=null;this._relayKey=null;this._relayFenced=false;this._relayRequestSeq=0;
       this._httpEpoch=(this._httpEpoch||0)+1;
       this._relayAbort?.abort();this._relayAbort=null;this._inFlight=false;
     }
@@ -683,14 +685,20 @@
           parsed._msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
         }
         if(['join','family-subscribe','admin-subscribe'].includes(parsed.type))this._cancelNativeProbe?.();
-        if(parsed.type==='guide-stream-state')this._lastGuideState={...parsed};
+        if(parsed.type==='guide-stream-state'){
+          this._lastGuideState={...parsed};
+          if(!parsed.isLive||String(parsed.broadcastMode||'').startsWith('demo')){
+            this._audioCoalescer?.clear();this._sendQueue=(this._sendQueue||[]).filter(m=>m.type!=='audio-chunk');
+          }
+        }
         if(['family-subscribe','admin-subscribe'].includes(parsed.type)){
           this._lastGuideState=null;this._audioCoalescer?.clear();
           this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk');
         }
         if (parsed.type === 'join') {
           const old=this._joinContext;
-          if(old&&(old.tourCode!==parsed.tourCode||old.roomId!==parsed.roomId||old.role!==parsed.role)){
+          if(old&&(old.tourCode!==parsed.tourCode||old.roomId!==parsed.roomId||old.role!==parsed.role||
+            parsed.audioSourceId!==undefined&&old.audioSourceId!==parsed.audioSourceId)){
             this._lastGuideState=null;
             this._audioCoalescer?.clear();this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk');
           }
@@ -720,6 +728,19 @@
         }
       }
 
+      if(parsed?.type==='audio-chunk'&&this._joinContext?.role==='guide'){
+        const state=this._lastGuideState,pcm=!parsed.synthNote;
+        if(state&&(state.isLive===false||pcm&&String(state.broadcastMode||'').startsWith('demo')))return;
+        const source=this._joinContext.audioSourceId;
+        if(source&&!pcm){if(parsed.audioSourceId&&parsed.audioSourceId!==source)return;parsed={...parsed,audioSourceId:source};}
+        if(pcm&&source){
+          const frames=parsed.frames===undefined?[parsed]:parsed.frames;
+          if(!Array.isArray(frames)||!frames.length||frames.length>3||!frames.every(validRysAudio))return;
+          const kept=frames.filter(f=>!f.audioSourceId||f.audioSourceId===source).map(f=>({...f,audioSourceId:source}));
+          if(!kept.length)return;
+          parsed=parsed.frames===undefined?kept[0]:{...parsed,frames:kept,audioSourceId:source};
+        }
+      }
       if (!this._isRelay) {
         if (this._native && this._native.readyState === 1) {
           this._native.send(typeof parsed === 'object' ? JSON.stringify(parsed) : data);
@@ -866,6 +887,10 @@
 
     // PATCH: shim-queue-v52
     _enqueueRelayMessage(message){
+      if(message.type==='guide-stream-state'){
+        message={...(this._lastGuideState||message)};
+        this._sendQueue=this._sendQueue.filter(m=>m.type!=='guide-stream-state');
+      }
       const now=Date.now();
       this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk'||
         (Number.isFinite(m._queuedAt)&&now-m._queuedAt<=200));
@@ -886,7 +911,9 @@
       if(mode==='admin-subscribe')return JSON.stringify([mode]);
       const tour=String(c.tourCode||'RY-KASIM').toUpperCase().trim();
       if(mode==='family-subscribe')return JSON.stringify([mode,tour]);
-      return JSON.stringify([mode,tour,String(c.roomId||'genel').trim(),c.role==='guide'?'guide':'pilgrim']);
+      const route=[mode,tour,String(c.roomId||'genel').trim(),c.role==='guide'?'guide':'pilgrim'];
+      if(c.role==='guide'&&c.audioSourceId)route.push(c.audioSourceId);
+      return JSON.stringify(route);
     }
     async _flushAndPoll(){
       if(this.readyState!==1||!this._isRelay||this._inFlight||this._relayFenced)return;
@@ -915,13 +942,21 @@
         const context=mode==='admin-subscribe'?{type:mode,token}:
           mode==='family-subscribe'?{type:mode,tourCode:this._joinContext?.tourCode||'RY-KASIM'}:
           this._joinContext;
-        const fresh=batch.filter(m=>m.type!=='audio-chunk'||
-          Number.isFinite(m._queuedAt)&&Date.now()-m._queuedAt<=200);
+        const fresh=batch.filter(m=>{
+          if(m.type!=='audio-chunk')return true;
+          if(!Number.isFinite(m._queuedAt)||Date.now()-m._queuedAt>200)return false;
+          const state=this._lastGuideState,source=this._joinContext?.audioSourceId;
+          if(this._joinContext?.role==='guide'&&state&&(state.isLive===false||!m.synthNote&&String(state.broadcastMode||'').startsWith('demo')))return false;
+          const frames=Array.isArray(m.frames)?m.frames:[m];
+          return !source||frames.every(f=>!f.audioSourceId||f.audioSourceId===source);
+        });
+        const requestSeq=this._relayRequestSeq=(this._relayRequestSeq||0)+1;
         const res=await fetch('/api/ws-relay',{method:'POST',signal:ac.signal,
           headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:this._relayClientId,
-            relayKey:this._relayKey,token,subscriptionContext:context,messages:fresh})});
+            relayKey:this._relayKey,requestSeq,token,subscriptionContext:context,messages:fresh})});
         const payload=await res.json();if(!current())return;
         if(!res.ok){
+          if(res.status===409&&payload.error==='relay-request-stale'){success=true;return;}
           if(res.status===409){
             if(payload.error==='relay-session-retired'&&this._failbackProbe)this._relayFenced=true;
             else{
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=61"></script>
+  <script src="/vercel-ws-shim.js?v=62"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```

## 6. Son prova ve sayısal sonuçlar

| Koşu | Sonuç |
| --- | --- |
| Disk v61 | İlk koşu V61 deadline; değişikliksiz tekrar **40/40 PASS, exit0** |
| Negatif kontrol: yeni E2E, eski gerçek v61 sunucusu | Eski TCP gövdesi200 ve joined=genel; beklenen409 assertion'ı **FAIL, exit1**. Yeni test eski kusuru gerçekten yakalıyor. |
| Rapor diff'inden kurulan nihai v62 | **42 / 42 [BAŞARILI / PASS], exit0**; V53..V62 E2E/Unit korunmuş |
| Nihai v62 + V61 E2E beş tekrar | **46/46 PASS, exit0** (standart42'ye aynı V61 kaydının4 ek tekrarı);5/5 kaynak devri başarılı. Standart paket test sayısı46 değil42'dir. |

Son42 test koşusundaki300 dinleyici probe'u: **300 join200;301 gerçekWS;270 sağlam dinleyici×120 paket=32400 sağlam teslim;30 durdurulmuş/yapay backlog soketi;1500 soft drop;3 hard izolasyon;0 bozuk PCM**. Yerel gönderim→WS teslim süreleri p50 **10.22 ms**, p95 **19.05 ms**, p99 **27.02 ms**, max **31.16 ms**; event-loop p99 **23.63 ms**, CPU **1422 ms**, test süresi **2412 ms**. Yalnızlocalhost ve bu kısa fixture için;300 fiziksel cihaz/300 eşzamanlı HTTP ses poll'ü veya80 dB ortam ölçümü değildir.

V60 gerçek zincir: capture→rehber callback→sunucu→native/HTTP→player;30 native/30 HTTP çerçevesi,bytesEqual=true,staleForwarded=0. Düşük çıkış probe RMS:8 kHz2.733e-7,16 kHz0.1317. Bu ton fixture'ında8 kHz altındaki alias süzülüyor.

V61 gerçek oda probe'u:4 oda;sourceOrder=[page-general,page-dedicated,page-general,page-wrap];HTTP6 ses çerçevesi;düşükseq10 kabul;aynı sayfa reconnect kimliği korunmuş;seq wrap kabul;stop kuyruğu0;yanlışPIN ses0;PCM eşit.

V62 gerçek zincir: acceptedHttpSeq=[1,10,101], acceptedNativeJsonSeq=[1,10], acceptedNativeBinarySeq=[101]. postStopAudio=0,retiredSourceAudio=0,coalescerAfterStop=0,pcmEqual=true. Bu sıfırlar testte enjeksiyonu yapılan belirli geç medya örneklerinin reddidir; bütün olası ağ zamanlamalarında veya eski/etiketsiz MQTT istemcilerinde evrensel sıfır garantisi değildir. Sıra çiti: eski gövde409/relay-request-stale ve joined=null;aynı oturumun yeni seq3 isteği yeniden katılmadan ilerliyor.

11 birim grubu dahil: suspended durumda yeni demo düğümü0;normal durumda en çok4 rehber nota;stop sonu planlı10 ms ve onended disconnect;eski demo timer'ı mic geçişinden sonra yeni synth üretmiyor. Relay-open beklerken alınmış batch'ten post-stop PCM0;başarısız poll retry'ında her iki yönde kuyruk yalnız son isLive değerini içeriyor.

Kanıt logları yerel geçici dizinde: rys-v62-baseline.log, rys-v62-baseline-retry.log, rys-v62-diagnostic.log, rys-v62-old-server.log, rys-v62-report-final.log, rys-v62-report-final-stress.log. Yeni test geliştirilirken protokolde version:56 kapatma alanı ve pong.echoTs eşleşmesi düzeltildi; yalnız yukarıdaki **son iki log** nihai v62 başarı kanıtıdır. Başarısız ara provalar nihai başarı olarak sayılmadı.

### 6.1 Yama bütünlüğü ve yeniden kontrol

Nihai diff12 hedef, UTF-8/LF;59,301 bayt. SHA-256: **d6fe8b4b7f5b14da7a8ea14e4d06ca0b2f3e9eb19b6acb8946e1fdd114717271**. Hem git apply --check - hem git apply --check --ignore-space-change -: **exit0**. Commit içindeki önceki v61 raporu yeniden çıkarılarak ters kontrol de exit0. Bir diff bloğu var; denetim aracı testleri rapor metninden üretmiyor, yalnız diff'ten yeniden kurulan kaynakları okuyor.

PowerShell'de çalışma dizini D:/umresesliyazılım iken, kaynak değiştirmeden aynı kontroller:

```powershell
@'
from pathlib import Path
import re, subprocess
report = Path('AUDIO_EXCELLENCE_REPORT.md').read_text(encoding='utf-8')
blocks = re.findall(r'(?ms)^```diff\n(.*?)^```\s*$', report)
assert len(blocks) == 1
patch = blocks[0].encode('utf-8')
subprocess.run(['git', 'apply', '--check', '-'], input=patch, check=True)
subprocess.run(['git', 'apply', '--check', '--ignore-space-change', '-'], input=patch, check=True)
previous = subprocess.check_output(['git', 'show', 'HEAD:AUDIO_EXCELLENCE_REPORT.md']).decode('utf-8')
v61 = re.findall(r'(?ms)^```diff\n(.*?)^```\s*$', previous)[0].encode('utf-8')
subprocess.run(['git', 'apply', '--reverse', '--check', '--ignore-space-change', '-'], input=v61, check=True)
print('V61 reverse / V62 strict / V62 ignore-space: PASS')
'@ | python -
```

Kaynaklara uygulama bu turda yapılmadı. Daha sonra v62 uygulandığında normal node scripts/verify-system.js sonucunun42/42 olması beklenir;40 disk v61'e,46 bu denetimin ek tekrarlı provasına aittir. Backend ve HTML/shim/SW sürümleri birlikte yayınlanmalı. Hazır eski sekmelerin kodu, SW aktivasyonu ile kendiliğinden yeniden yazılmaz; eski istemci geçiş kapsamı ayrıca izlenmelidir.

### 6.2 Çalışma ağacı koruması

HEAD f5dc303 değişmedi.15 denetlenen kaynak dosyasının başlangıç/son ham SHA-256 değerleri aynı;capture/player dahil. Testin geçici runtime.json değişiklikleri verifier tarafından başlangıç snapshot'ına geri alındı. Son durumda yalnız AUDIO_EXCELLENCE_REPORT.md değiştirilmiş;AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md başlangıçtaki unstaged silinmiş durumda. Kaynaklar stage edilmedi, yama uygulanmadı, commit/push/deploy yapılmadı. Unified diff boş bağlam satırlarının zorunlu tek boşluk öneki nedeniyle rapor için git -c core.whitespace=-blank-at-eol diff --check kullanıldı.

<!-- SOURCE-HASHES {"server.js":"3af6e6358a0aab297d25fa1ae3fcf3af9e2552e09d089c29b99cfee916897862","scripts/verify-system.js":"7cb3dc348ce49f83a68448ae5d92b70667a61c29ed7cbf00340081306b565ca3","public/ani-kitabi.html":"432dbcb8740c48fb8387050d5f500c0454321137afea639cf2913177ef5ee048","public/dinle.html":"e0865ce4bff506fff8c08f52ee039d6099c5391ca649ca29489772c0591f0d5d","public/index.html":"435613376eaa5e3340c8ebea809c2f791d4d0f6fa46aef15e5494c226936ed08","public/login.html":"4522f963df452973d6d26b21ac3d1c7ca76444bbfe347e8502d5bdab48207c41","public/panel.html":"ffefc7081f94063b69cdd2603594edcd7482265ad4e8523a2ffcf3e508707e1e","public/pcm-player-worklet.js":"062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7","public/rehber.html":"72f3ec0b331756a13a399076982e59fae6cb164a02300c978054b1450068cca5","public/rota.html":"bdb11215c9dec7e4d38f64e179df763156294792790f8ff55753aeac52647fde","public/sw.js":"45dab98c177b9179a109c48fcb9513ccb9401576596e47b05915fb982023ac5f","public/vercel-ws-shim.js":"e4ac87622b0d2b3502e89c197526342ec66c2f01cfbc1cc1b60b1617b844663e","public/yaka-karti.html":"f3416f2ec8a2664df3cb4aa5c355ff095de1396bdaf5e764ec20248dc6eed3e0","public/pcm-capture-worklet.js":"30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e"} -->
