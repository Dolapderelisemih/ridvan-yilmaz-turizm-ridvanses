# RıdvanSes v69 — v68 Uygulama ve Odalar Arası Rehber Devri Denetimi

Denetim: **10 Kasım 2026**, kök **D:/umresesliyazılım**. Disk HEAD: **9e0a6fce1041b8dbb544397428eaee110bde4484**. Yalnız bu rapor güncellendi. Aşağıdaki v69 kaynaklara uygulanmadı; stage/commit/push/canlı dağıtım yapılmadı.

**Karar:** v68'in 11 kaynak hedefi rapor yamasıyla eşleşiyor; reverse-check **exit0**, disk paketi **54/54 PASS, exit0**. Yeni bir **P2-69-01** doğrulandı: rehber aynı cihaz kimliğiyle **yeni context üzerinden başka odaya** geçtiğinde eski odanın publisher/presence ve Genel mirası uzlaştırılmıyor. Rehbersiz oda canlı kalabiliyor; Genel yayınına dönen HTTP alıcı kontrol nesli kurulmadığı için gelen PCM'i reddedebiliyor. Bu nedenle **“SIFIR HATA — v68 %100 ONAYLI (PRODUCTION-READY)” onayı verilmiyor**. Tek v69 diff'i gerçek CLI bellek provasında **56/56 PASS, exit0** verdi.

## 1. v68 uygulama eşliği ve disk testleri

| Kontrol | Kanıt |
| --- | --- |
| Başlangıç raporundan v68 diff | Tek blok;37.716 UTF-8 bayt; SHA-256 **155a36444630328b8f5a928fbbf7b330c44e6e5e08560ca618f1cc37306ec612** |
| git apply --reverse --check --ignore-space-change - | Başlangıç ve son kontrolde **exit0**, stderr boş |
| node scripts/verify-system.js | **54 / 54 [BAŞARILI / PASS], exit0**; mevcut V51 transport ve V53..V68 E2E/Unit kontrolleri dahil |
| HEAD stat | 11 kaynak + rapor =12 dosya;604 ekleme /438 silme |
| Başlangıç status | Yalnız AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md silinmiş |
| Kaynak/runtime bütünlüğü | 15 kaynak + data/runtime.json başlangıç ham SHA-256 değerleriyle eşleşiyor |
| DSP ve shim çekirdeği | Capture60-audio / player61-audio ve shim kaynak kodu değişmedi |

### 1.1 İstenen 11 dosyanın gerçek satır kontrolü

Satırlar **disk HEAD9e0a6fc** içindir; v69 sonrası konumlar değildir.

| Dosya / gereksinim | Konum ve sonuç |
| --- | --- |
| server.js / eski üyelik kaydı |1007–1008: previousClient yalnız prevRoom===targetRoom için alınır; previousSource bu kayıttan okunur. Doğru uygulanmış. |
| server.js / rol sınırı |1025: sameDevice, role===existingClient.role şartını içerir. Public pilgrim aynı ID ile guide'ı düşüremiyor; native/HTTP/legacy matris ve gerçek E2E PASS. |
| server.js / aynı sokette downgrade |1047–1050: yeni listener kaydı korunur; sahibi ise publisher temizlenir; evaluateTourGuidePresence çağrılır. Son guide terminal stop, başka guide takeover ve dedicated→Genel miras testleri PASS. |
| scripts/verify-system.js / V68 E2E |Çağrı591; runV68RoleBoundaryChecks3956–4053. Gerçek native/HTTP çakışması, metadata, same-role reconnect, handoff, downgrade/stop/resume ve bayt eşliği PASS. |
| scripts/verify-system.js / V68 Unit |createV68MembershipHarness3865; runStep5V68AudioChecks3890–3953; main çağrısı4076.7 grup/6 çakışma kombinasyonu PASS. |
| public/sw.js |4: ridvanses-pwa-v68;11: shim?v=68; capture60-audio / player61-audio sabit. |
| public/dinle.html |19: shim?v=68;2656: sw.js?v=68. |
| public/rehber.html |31: shim?v=68. |
| public/panel.html |32: shim?v=68. |
| public/index.html |85: shim?v=68. |
| public/login.html |13: shim?v=68. |
| public/rota.html |12: shim?v=68. |
| public/ani-kitabi.html |10: shim?v=68. |
| public/yaka-karti.html |11: shim?v=68. |

Disk V68 E2E: guidePresent/guideOpen/afterCollisionPcm=true; downgrade sonrası live=false/ended=true/takeoverPcm=true; ana ve alt oda PCM **[40,41,42,51,52,53,55]**, eşlik true; same-room handoff epoch10, yeniden başlama epoch12, eski opaque capability409. V68 Unit7 grup ve crossRoleGuideEvictions0. **P1-68-01 ve P2-68-02 doğru uygulanmış; yeni bulgu aynı soketteki rol değişiminden farklı bir üyelik yoludur.**

## 2. P2-69-01 — Yeni context ile oda değişiminde eski oda uzlaştırılmıyor

### 2.1 Kök neden, konum ve tetikleme

| Disk konumu | Bulguyla ilişkisi |
| --- | --- |
| [server.js:1021](D:/umresesliyazılım/server.js:1021)–1042 | Aynı-role deviceId eşleşmesi tüm kafile odalarında eski üyeliği doğrudan siler; native socket'i terminate eder veya opaque HTTP session'ı retired yapar. |
| [server.js:1032](D:/umresesliyazılım/server.js:1032)–1034 | Eski room.activePublisherClientId, yeni istemci **başka odaya yerleşse bile** yeni clientId'ye aktarılır; eski odada bulunmayan bir üyeyi gösterebilir. |
| server.js:1044–1051 | Presence değerlendirmesi aynı context'in prevRoom değişimine veya aynı odada guide→pilgrim geçişine bağlıdır. Yeni native/HTTP context'te prevRoom=null olduğundan iki dal da çalışmaz. |
| [server.js:766](D:/umresesliyazılım/server.js:766)–798 / removeClientFromRoom | Native close sonrasında eski kayıt zaten silinmiştir; prevClient yoktur. Rehber ayrılışına ait presence/terminal değerlendirmesi bu close ile telafi edilmez. |
| server.js:707–763 | evaluateTourGuidePresence doğru terminal ve Genel miras kodunu içerir; yeni-context cross-room replacement bu fonksiyona ulaşmamaktadır. |
| public/dinle.html:1189–1228 | Modern JSON için kurulmuş source/controller/media epoch gerekir. Kontrolü eksik PCM'i reddetmesi doğrudur; çözüm bu korumayı gevşetmek değildir. |

Tetikleme için iki ayrı soket/context ve aynı guide deviceId gerekir: örneğin eski native guide genel odadayken yeni HTTP guide siyer odasına katılır. Her iki guide katılımı da geçerli yetki taşır; v68'in public/guide rol koruması aşılmış değildir. Reconnect veya yeni taşıma oturumu sırasında bir oda seçiminin değişmesi yeterlidir.

İki sonucu vardır:

1. Eski Genel odasında guide0 iken isLive=true ve ended=false kalabilir. Native dinleyici terminal stop almaz; eski player kuyruğu resetlenmez. Yeni bir durum olayı gelene kadar oda yanlış canlı görünür.
2. Canlı Genel guide varken dedicated guide yeni context ile başka alt odaya taşınırsa boşalan alt oda Genel controller'ını devralmaz. Sonraki Genel binary fan-out'u source'u değiştirir, fakat target room'un known/state/media epoch bilgisi kurulmamıştır. HTTP relay PCM'i taşısa da modern receiver reddeder. Yeni bir doğru kontrol kurulana kadar devam eden modern PCM'in de reddedilmesi aynı kabul koşulunun sonucudur; uzun süreli saha sessizliği bu testte fiziksel olarak bekletilmemiştir.

Publisher alanının başka odadaki clientId'ye işaret etmesi bir tutarlılık ihlalidir. Bu turda bu dangling alanın tek başına tüm yeni guide girişlerini kilitlediği iddia edilmiyor; mevcut admission bekçisi owner'ın odada bulunmasını ayrıca denetler. Kanıtlanan ses kusuru terminal/miras kontrolünün eksikliğidir.

### 2.2 Değiştirilmemiş v68 üzerinde negatif ölçümler

Yeni E2E, **diskteki orijinal server.js** ile gerçek localhost HTTP/WS üzerinde çalıştırıldı. Yeni verifier yalnız bellekteydi.

**A — Genel odasının boşalması:** native Genel guide PCM40 gönderdi. Aynı deviceId'li yeni HTTP guide siyer'e katıldı; eski native guide kapandı. Ölçüm:
**guides=0, isLive=true, ended=false, nativeStopped=false, queuedOldFrames=1**.
Bu1 sayısı VM player kuyruğundaki frame sayısıdır; fiziksel hoparlörde kaç örnek duyulduğunun ölçümü değildir.

**B — Dedicated→Genel dönüşü:** farklı bir native Genel guide source=general-page, epoch20 kurdu. HTTP dedicated guide siyer'de source=dedicated-page, epoch30 ve PCM50 yayınladı. Aynı deviceId'li yeni native guide other odasına geçti. Genel controller tekrar gönderilmeden binary PCM42 gönderildi. Ölçüm:
**httpFrame42=true, playerFrame42=false, rxEpoch=null, roomKnown=false, roomEpoch=null, source=general-page**.
Paket taşıma katmanına ulaşmıştır; receiver'da geçerli controller eksikliği nedeniyle oynatıcıya kabul edilmemiştir.

Test terminal stop beklentisinde **FAIL / exit1**, true !== false verdi. İkinci probe da assert'ten önce ayrı aşamada ölçüldü. Bağımsız gerçek processClientJsonMessageV49 VM probunda eski Genel guide sayısı0, live=true, ended=false, publisher=new-guide ve eski native terminate1 görüldü; new-guide yalnız siyer üyesiydi.

### 2.3 v69 çözümü

Üyelik tekilleştirmesinde farklı odadan bir guide kaldırıldığında **needsGuidePresenceSync** işaretlenir. Publisher devri yalnız replacement'ın kurulduğu **aynı oda** için yapılır; boşaltılan başka odada owner=null olur.

Yeni üyelik targetRoom'a yerleştirildikten sonra, gerekliyse mevcut evaluateTourGuidePresence bir kez çalıştırılır. Böylece terminal stop veya Genel source/known/seq/mediaEpoch mirası ilk yeni PCM'den önce kurulmuş olur. Değerlendirmeyi yeni guide eklenmeden çalıştırmak geçici yanlış stop yaratabileceği için işlem sırası önemlidir.

Aynı context aynı kafilede başka odadan guide olarak ayrılırsa mevcut0-grace remove zaten o kafileyi uzlaştırır; ikinci değerlendirme yapılmaz. Önceki oda başka kafiledeyse onun cleanup işlemi hedef kafile uzlaştırmasının yerine sayılmaz; iki kafile de değerlendirilir. Önceki rol pilgrim ise bu removal guide presence'ını değerlendirmediğinden gereken son değerlendirme korunur. V68 aynı-room downgrade aynı işaret üzerinden çalışır.

**Aynı odadaki replacement/handoff** farklı oda işaretini üretmez: owner yeni clientId'ye devredilir; bilinen controller/epoch ve canlılık korunur, terminal stop üretilmez. V68 rol sınırı, guide-name replacement, v67 token ömrü, requestSeq/digest/revision/capability çitleri değişmez.

Yeni wire alanı, timer, growing map veya PCM kopyası yoktur; join başına bir yerel boolean eklenmiştir. Üyelik kurma ve uzlaştırma aynı event-loop turundadır, arada await yoktur. Bu düzeltme receiver kabul politikasını veya DSP'yi değiştirmez.

## 3. Uçtan uca ses, DSP ve taşıma denetimi

| Katman / disk alanı | Sonuç ve kapsam |
| --- | --- |
| Rehber / public/rehber.html:1571–1767 |180 ms stale capture,19200 B gönderim backpressure; getUserMedia/module/import/preview/start/stop/heal/devicechange/track/processor sahipliği. V60'ın17 yaşam döngüsü grubu PASS; yeni kusur server üyelik topolojisindedir. |
| Mikrofon graph / rehber.html:1677–1687 |AEC=true, NS=false, AGC=false, mono48 kHz istek;85 Hz HP,210 Hz -2.5 dB mud cut,3200 Hz +2 dB presence,10500 Hz LP, manuel gain. Gerçek cihaz route'u ayrı bir kabul alanıdır. |
| Capture / public/pcm-capture-worklet.js:10–50,152–258 |193 tap ×256 faz Blackman polyphase FIR, sürekli faz,480 örnek/20 ms @24 kHz; transfer sonrası yeni frame sahipliği ve stop→processor false.8/16/24/44.1/48 kHz kontrolleri PASS. |
| Expander / capture:53–150 |4 bant zarf/minima;400 ms kalibrasyon/4 s minima,10 ms lookahead;7.5 dB açma/4 dB hysteresis;240 ms hold,3 ms attack/120 ms release; kapalı gain0.126≈-18 dB. continuousSpeech hece korumasıyla bastırma arasında tercih yapar. |
| Comfort/mute / capture:152–220 |3 ms delay;600 ms quiet sonrası80 ms sönüm,2 ms açılma, yumuşak mute. Yeni gürültü üretimi değil PCM'i sönümleme/sıfırlamadır. |
| Coalescer / public/vercel-ws-shim.js:95–140 |1–3 bağımsız frame;40 ms timer/120 ms TTL; stop/demo clear ve capture epoch etiketi. V64/65 batch/nesil/retry kontrolleri PASS. |
| Taşıma / shim:287–389,401–514,617–663,969–1065 |100 ms tek-uçuş poll/3 s abort;4 audio batch/200 ms+64 kontrol; rota/response/retry çiti, v65 control-first latch, v66 MQTT generation; native handoff ACK ve capability sahipliği. Yeni v69 aynı-room handoff epoch40'ı korudu. |
| Server audio/auth / server.js:435–494,534–543,625–639,1333+ |Modern source/known/live/media epoch ve activePublisher admission; v67 native canlı token/revoke/expiry; binary/JSON paritesi. Native packet972 B biçimi değişmez. |
| Server üyelik/presence / server.js:707–798,1002–1070 |V68 rol sınırlı dedup ve same-context downgrade doğru. Yeni-context cross-room eski oda uzlaştırma boşluğu v69 ile kapatılır. |
| Relay/handoff / server.js:1448+ |48 hex opaque key,35 s lease,3 s prepare, requestSeq/context digest/revision, no-await commit, retired/expired409, metadata ve auth/context sonrası lease. Mevcut V53..V68 regresyonları adayda da PASS. |
| Receiver / public/dinle.html:1180–1406 |Socket/Blob teslim çiti, source/stateSeq/ended/mediaEpoch, modern controller gereksinimi ve stop/mod/source reset. V69 kontrolü server'da tamamlar; unknown epoch'lu PCM'i kabul ettiren bypass eklenmez. |
| Port/kurtarma / dinle.html:1658–1897 |En çok13 frame/260 ms main queue; rxLoadToken/context/processor sahipliği, FIFO reset, askıda veri düşürme, resume/rebuild/probe. Etkin workletless scheduler fallback'i yoktur. |
| Player / public/pcm-player-worklet.js:12–27,124–187,190–338 |8/16 kHz'de193 tap anti-alias FIR→Hermite;24/44.1/48 kHz'de downsample FIR yok. Sürekli faz, ±1000 ppm ASRC, seq wrap/late/duplicate ve bounded q. Yeni DSP kusuru bu testlerde doğrulanmadı. |
| Jitter/PLC / player:30–96,190–338 |Başlangıç120 ms, adaptif80–260 ms; en az1 frame ile300 ms başlangıç eşiği;60 ms pitch PLC+sönüm;300 ms starvation rebuffer. >32 frame→24 trim; hedef+120 ms üzerinde500 ms catch-up;3 ms recovery/5 ms rampalar. |
| PWA / public/sw.js:4–79 |API/WS/auth/rehber/panel cache dışı. v69 cache/shim URL69'a çıkar; capture60-audio/player61-audio korunur. Açık eski sekmenin JS'i SW activation ile otomatik yenilenmez. |

### 3.1 Beş örnekleme hızında DSP ölçümleri

V61 reset/starvation fixture'ı disk54/54 ve aday56/56 koşularında tekrar geçti:

| Çıkış Hz | firstAfterReset | firstAfterStarvation | DC fixture iç maxStep |
| --- | --- | --- | --- |
|8000|0|0|0.130492|
|16000|0|0|0.145227|
|24000|0|0|0.002640|
|44100|0|0|0.001428|
|48000|0|0|0.001314|

İç FIR geçici rejim maxStep'i ilk örnek sıçraması değildir; fiziksel cızırtı sıfırı kanıtlanmaz. V60 alias fixture:8 kHz çıkışta4080/4800/6000 Hz için **-76.56/-107.60/-114.02 dB**;16 kHz çıkışta8160/9600/10000 Hz için **-97.45/-115.88/-127.11 dB**.24 kHz capture2 s→100 frame; diğer belirtilen oranlarda frame/partition/SRC kontrolleri PASS. Bu ölçümler belirtilen hız/tonlarla sınırlıdır; diğer desteklenebilen hızlarda aynı stopband başarısı varsayılmaz.

Capture FIR gecikmesi96/girişHızı:8/16/24/44.1/48 kHz için12/6/4/2.18/2 ms.10 ms lookahead,3 ms comfort,0–20 ms frameleme,0–40 ms coalescer,120 ms ilk jitter hedefi ve düşük çıkışta player FIR4 ms eklenir. Ağ/donanım ayrıca vardır. Yerel WS gecikmesi ağızdan kulağa toplam süre değildir.

Ham SHA-256: capture **30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a**, player **062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7**, shim **a89f929edf4cd9cfaccb0f48f38705ca60b2bdb3d2c538ca9cbb485618f3f48e**. Üç kaynak diskte de v69 diff'inde de değişmedi.

### 3.2 1→300 gerçek yerel WS yük testi

300 aynı-IP geçerli join200;301 gerçek WS;270 sağlam dinleyici×120 frame=**32.400 eksiksiz frame**,30 paused/injected-queue peer'de **1500 soft drop**,3 hard izolasyon ve **0 bozuk PCM**. Her iki tam koşu bu kabul koşullarını geçti.

| Ölçüm | Disk v68 | v69 rapor provası |
| --- | --- | --- |
|p50 /p95 /p99 teslim ms|13.87 /22.30 /42.13|14.75 /24.96 /38.65|
|max teslim ms|55.40|51.98|
|event loop p99 ms|23.94|24.79|
|CPU ms /geçen ms|1750 /2416.4|2062 /2430.5|

Aynı hostta yaklaşık2.4 s/50 pps fixture'ıdır. Host yükü ve scheduling ile değişir; hızlanma veya saha gecikmesi garantisi değildir. İki p99 değeri de paketin yerel500 ms kabul eşiğinin altındadır. Yavaş peer kuyruk basıncı enjekte edilir; sağlam peer baytları gerçek WS'de karşılaştırılır.300 fiziksel telefon,300 sürekli HTTP listener, uzun soak veya gerçek roaming ölçülmedi.

Native ham egress972×50×300=**116.64 Mbit/s**, TLS/TCP/IP hariç; base64 PCM tabanı **153.6 Mbit/s**, JSON hariç.300 HTTP listener'da100 ms poll yaklaşık3000 istek/s. Soft/hard drop sağlam alıcıları korur; sınırsız gecikmesiz sıfır kayıp sağlamaz. bufferedAmount gönderim için bekleyen veridir, dinleyicide oynatma ACK'i değildir. [WHATWG bufferedAmount](https://websockets.spec.whatwg.org/#dom-websocket-bufferedamount).

## 4. Açık saha ve mimari kabul sınırları

Public MQTT imzası istemcide bilinen sabite dayanır; oda ACL'si veya server yayıncı yetkisi değildir. V66 yerel broker callback ömrünü, v67 native token ömrünü, v68 rol sınırını, v69 üyelik topolojisi sonrası kontrolü çitler. Public MQTT logout/otorite, farklı UUID/broker yolları arasında global kaynak seçimi ve aynı-role deviceId'nin kriptografik sahipliği bu yamayla çözülmüş sayılmaz.

Relay/oda state'i process RAM'indedir. Çoklu serverless instance için ortak state veya tek otorite gerekir. Canlı deployment, VDS NIC/TLS kapasitesi ve multi-instance failover bu turda sınanmadı.

Mono mikrofon çakışan rehber/yan konuşmacı bileşenlerini yüzde100 ayıramaz. BroadcastChannel başka telefonun hoparlör yoluna AEC referansı sağlamaz. echoCancellation=true UA isteğidir;50–400 ms çapraz cihaz yankı kuyruğunu her ortamda kaldırma garantisi değildir. [W3C echoCancellation](https://www.w3.org/TR/mediacapture-streams/#dom-mediatrackconstraintset-echocancellation).

AudioContext askıya alındığında işleme durur; gerçek zamanlı veri kaybolabilir, resume geçmiş konuşmayı geri getirmez. [W3C suspend](https://www.w3.org/TR/webaudio/#dom-audiocontext-suspend). iOS/Android kilit, alarm/arama, WhatsApp, HFP/SCO ve yoğun4G/5G/roaming fiziksel cihaz kabulü gerekir. PLC kayıp sözcüğü geri üretmez; kod/VM testi sıfır akustik yankı veya kopma sertifikası değildir.

Bu turda **P2-69-01 dışında yeni P0/P1/P3 somut ses kusuru doğrulanmadı**. Önceki mimari sınırlar kapatılmış sayılmıyor; bütün olası hataların elendiği de iddia edilmiyor.

## 5. Yeni testler, negatif kontrol ve gerçek CLI provası

**ADIM-3.V69:** gerçek HTTP/WS üzerinden native Genel→yeni HTTP dedicated replacement, eski Genel terminal stop ve native player reset; başka Genel source/epoch20 kurulması; dedicated HTTP→başka odadaki yeni native replacement; Genel kontrolü yeniden gönderilmeden ilk PCM42'nin HTTP receiver/player'a kabulü. Aynı-room native→HTTP replacement'ta control/epoch40'ın korunması, yeni kontrol göndermeden JSON PCM61, gerçek iki aşamalı handoff sonrası binary62, eski opaque capability409 ve bayt eşliği de sınanır.

Aday ölçümleri:
- Vacated Genel: guide0, live=false, ended=true, nativeStopped=true, queuedOldFrames0.
- Fallback: HTTP42=true, player42=true, rxEpoch20, roomKnown=true, roomEpoch20, source=general-page.
- Ana/free PCM **[40,41,42]**; dedicated oda PCM **[40,50,42]**; yeni odanın medyası **[60,61,62]**; same-room ve handoff epoch40; PCM eşliği true.
- Dedicated50'den Genel42'ye dönüş kaynak değişimidir. Seq farklı source/medya dönemleri arasında tek global ordinal olarak karşılaştırılmaz.

**ADIM-5.V69 sekiz grup:** native/opaque/legacy eski guide'ın yeni-context cross-room replacement'ı; dedicated boşalınca Genel controller mirası; aynı-room replacement'ta terminal/epoch reset olmaması; kalan guide'ın sahipliği alabilmesi; önceki context guide/pilgrim iken farklı odaya geçişte etkilenen kafile başına bir kez uzlaştırma; birden fazla zombie guide odasının tek işlem sonrası uzlaştırılması; v68 cross-role korumasının ve gereksiz sync üretmemenin korunması; farklı kafiledeki önceki guide cleanup işleminin hedef kafile uzlaştırmasını atlamaması. Mevcut V68 harness'ında **gerçek removeClientFromRoom** da çalıştırılır; önceki basit remove stub'ına dayanılarak duplicate-sync başarısı varsayılmaz. Eski V51..V68 kontrolleri korunur; iki yeni recordResult ile54→56.

| Koşu / kontrol | Sonuç |
| --- | --- |
| Değiştirilmemiş disk v68, normal CLI | **54/54 PASS, exit0** |
| Yeni E2E + orijinal v68 server | Bozuk vacancy/fallback ölçümleri; terminal beklentisinde **FAIL, exit1** |
| Son tek v69 diff'inden gerçek CLI bellek provası | **56/56 PASS, exit0** |
| Başlangıç v68 diff ters kontrolü | **exit0** |
| v69 git apply --check - | **exit0** |
| v69 git apply --check --ignore-space-change - | **exit0** |
| Negative ve candidate dış wrapper runtime kontrolü | **RUNTIME_RESTORED=True**, ikisinde de |
| Kalıcı uygulama/test kaynak yaması | **Yok** |

Rapordaki tek diff'in her hunk bağlamı diskle eşleştirilerek aday bellekte oluşturulur. Geçici CommonJS preload fs/module compile ve syntax okumalarını adaya yönlendirir; gerçek komut **node --require <geçici-preload.cjs> scripts/verify-system.js**'dir. Verifier main ve localhost server gerçektir; verifier'ın raporu kaynak gibi okuması engellenir. Uygulama/test kaynakları diskte yamalanmaz.

Her koşu öncesi data/runtime.json ReadAllBytes ile alınmış; dış finally aynı byte dizisini WriteAllBytes ile geri yazmış; restored byte dizisi koşu öncesiyle karşılaştırılmıştır. Geçici preload silinmiştir.15 kaynak ve runtime başlangıç SHA-256 değerleriyle aynıdır. Runtime SHA-256 **142391142c78422eae2fcf5eb7ad02e9f48bf7b568b44d8687cc023bc3e83dc2**. Son status yalnız **M AUDIO_EXCELLENCE_REPORT.md**, **D AUDIT_FIX_SUMMARY.md**, **D AUDIT_REPORT.md**; eski silinmeler korunmuştur.

## 6. Doğrudan uygulanabilir tek v69 unified diff

Taban **9e0a6fce1041b8dbb544397428eaee110bde4484**.11 hedef: server.js, scripts/verify-system.js, public/sw.js ve shim kullanan8 HTML. Cache/shim URL69; capture60-audio / player61-audio korunur. Production değişikliği join ve üyelik sonrası presence sırasındadır; DSP/shim kaynak metni değişmez.

Diff **36.345 UTF-8 bayt**, SHA-256 **1cf2c5ee14ed2b90f529bc466678e918acdb5d79289066152e18e9c8869fb9dc**. Kaynaklara uygulanmamıştır. Uygulamadan önce check edin; uygulamadan sonra normal node scripts/verify-system.js ile56/56 sonucunu doğrulayın.

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -1018,6 +1018,7 @@
       joinedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
     };
     // 4G/5G hücre geçişlerinde aynı cihaza veya aynı rehbere ait yarı-açık (zombie) eski soketleri anında temizle
+    let needsGuidePresenceSync=false;
     for (const r of getTourRooms(tourCode)) {
       for (const [existingId, existingClient] of r.clients.entries()) {
         if (existingId === clientId || existingClient.ws === ws) continue;
@@ -1030,8 +1031,10 @@
             if(oldRelay&&(oldRelay.relayKey||ctx.rysAckCapture))oldRelay.relayRetired=true;
           }
           r.clients.delete(existingId);
+          if(existingClient.role==='guide'&&r!==targetRoom)needsGuidePresenceSync=true;
           if (r.activePublisherClientId === existingId) {
-            r.activePublisherClientId = clientId;
+            // Transfer ownership only within the room that receives the replacement.
+            r.activePublisherClientId = r===targetRoom?clientId:null;
           }
           try {
             if (existingClient.ws && !existingClient.ws.isHttpRelay && typeof existingClient.ws.terminate === 'function') {
@@ -1043,12 +1046,16 @@
     }
     targetRoom.clients.set(clientId, clientObj);
     if (prevRoom && prevRoom !== targetRoom) {
+      const wasGuide=prevRoom.clients.get(clientId)?.role==='guide';
       removeClientFromRoom(prevRoom, clientId, 0);
+      if(wasGuide&&prevRoom.tourCode===tourCode)needsGuidePresenceSync=false; // Same-tour removal already reconciled it.
     } else if(previousClient?.role==='guide'&&role!=='guide'){
       // Keep the new listener membership, release the former publisher and sync inheritance/stop.
       if(targetRoom.activePublisherClientId===clientId)targetRoom.activePublisherClientId=null;
-      evaluateTourGuidePresence(tourCode);
-    }
+      needsGuidePresenceSync=true;
+    }
+    // The replacement must be installed before checking General coverage or terminal stop.
+    if(needsGuidePresenceSync)evaluateTourGuidePresence(tourCode);
     if (role === 'guide' && guideDisconnectTimers.has(targetRoom.key)) {
       clearTimeout(guideDisconnectTimers.get(targetRoom.key));
       guideDisconnectTimers.delete(targetRoom.key);
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -589,6 +589,7 @@
   await runV66MqttOwnershipChecks({baseUrl,url:wsUrl,token:authToken});
   await runV67NativeAuthChecks({baseUrl,url:wsUrl,token:authToken,credentials:loginCredentials});
   await runV68RoleBoundaryChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV69RoomReplacementChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1541,9 +1542,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v68"));assert(sw.includes('/vercel-ws-shim.js?v=68'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v69"));assert(sw.includes('/vercel-ws-shim.js?v=69'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'68',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'69',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2508,7 +2509,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2718,7 +2719,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2957,7 +2958,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3142,7 +3143,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3329,7 +3330,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3493,7 +3494,7 @@
     const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
     checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
   recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
 }
@@ -3664,7 +3665,7 @@
     h.s.close();assert(h.clients.every(c=>c.ended===1));assert.equal(h.received.length,0);
     checks.push('100-replacements-bounded-active-clients-invalidate-before-synchronous-end');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('vercel-ws-shim.js?v=68'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('vercel-ws-shim.js?v=69'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V66 UNIT METRICS '+JSON.stringify({checks,clientsAfterDelayedClose:0,staleDelivered:0,activeClientsMax:2,replacements:100}));
   recordResult('ADIM-5.V66','MQTT loader/client/suback/timer ownership across route, close and native takeover; bounded replacement; cache66',true);console.log('V66 UNIT PASS');
@@ -3786,7 +3787,7 @@
     sockets.clear();const idle=member('idle-expired','json-expired');g.heartbeat();assert.equal(idle.ws.terminated,1);assert.equal(idle.currentRoom,null);
     checks.push('real-binary-and-JSON-ingress-reject-expired-credentials-idle-heartbeat-cleans-membership');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('vercel-ws-shim.js?v=68'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('vercel-ws-shim.js?v=69'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V67 UNIT METRICS '+JSON.stringify({checks,expiredGuidePresent:false,expiryGraceMs:0,revokedGuideTerminated:1,revokedAdminTerminated:1,healthyTerminated:0,publicFamilyTerminated:0,cancelledPrepare:true}));
   recordResult('ADIM-5.V67','Native live credential expiry/revoke, token rotation, pending handoff cleanup, public-family isolation and HTTP/static compatibility; cache67',true);console.log('V67 UNIT PASS');
@@ -3946,7 +3947,7 @@
     assert.equal(h.room('siyer').audioSourceId,'page');assert.equal(h.room('siyer').audioMediaEpoch,10);assert.equal(h.room('siyer').isLive,true);
     checks.push('dedicated-guide-downgrade-restores-General-source-state-epoch-inheritance');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v68'));assert(sw.includes('vercel-ws-shim.js?v=68'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('vercel-ws-shim.js?v=69'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V68 UNIT METRICS '+JSON.stringify({checks,collisionCases,crossRoleGuideEvictions:0,downgradeOwner:null,sameRoleReconnect:true,terminalStop:true,coveredByGenel:true}));
   recordResult('ADIM-5.V68','Role-isolated device dedup; native/HTTP/legacy collisions; same-role reconnect; same-socket downgrade/owner release/terminal stop and General inheritance; cache68',true);console.log('V68 UNIT PASS');
@@ -4052,6 +4053,179 @@
   }
 }
 
+
+async function runStep5V69AudioChecks(){
+  const assert=require('node:assert/strict'),source=fs.readFileSync(path.join(ROOT_DIR,'server.js'),'utf8').replace(/\r\n/g,'\n'),checks=[];
+  function pick(name){const m=new RegExp('^function '+name+'\\(','m').exec(source);assert(m,'V69 missing '+name);
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const code=source.slice(m.index,end+1);try{new vm.Script(code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V69 unterminated '+name);}
+  function fixture(){
+    const h=createV68MembershipHarness(source);vm.runInContext(pick('removeClientFromRoom'),h.g);
+    let calls=0;const real=h.g.evaluateTourGuidePresence;
+    h.g.evaluateTourGuidePresence=code=>{calls++;h.atSync?.(code);return real(code);};h.syncCalls=()=>calls;
+    return h;
+  }
+  for(const options of [{},{http:true},{http:true,legacy:true}]){
+    const h=fixture(),old=h.seed('old','guide','same',options);h.room('free');
+    h.atSync=()=>assert(h.room('moved').clients.has('replacement'),'Install replacement before reconciling guide presence');
+    h.join(h.context('replacement'),{role:'guide',roomId:'moved',deviceId:'same',audioSourceId:'new-page',token:'good'});
+    for(const id of ['genel','free']){assert.equal(h.room(id).isLive,false);assert.equal(h.room(id).audioStateEnded,true);}
+    assert.equal(h.room().activePublisherClientId,null);assert.equal(h.syncCalls(),1);
+    if(options.http&&!options.legacy)assert.equal(old.relayRetired,true);if(!options.http)assert.equal(old.ws.terminated,1);
+  }
+  checks.push('new-native-opaque-legacy-replacement-leaves-no-owner-in-vacated-room-and-terminal-stops-uncovered-rooms');
+  {
+    const h=fixture();h.seed('general','guide','general-device');h.room().audioSourceId='general-page';h.room().clients.get('general').audioSourceId='general-page';
+    const old=h.seed('dedicated','guide','moving-device',{roomId:'siyer',http:true});Object.assign(h.room('siyer'),{audioSourceId:'dedicated-page',audioStateSeq:30,audioMediaEpoch:30});
+    h.room('siyer').clients.get('dedicated').audioSourceId='dedicated-page';
+    h.join(h.context('new-dedicated'),{role:'guide',roomId:'other',deviceId:'moving-device',audioSourceId:'other-page',token:'good'});
+    const r=h.room('siyer');assert.equal(r.activePublisherClientId,null);assert.equal(r.audioSourceId,'general-page');assert.equal(r.audioStateKnown,true);
+    assert.equal(r.audioStateSeq,10);assert.equal(r.audioMediaEpoch,10);assert.equal(r.isLive,true);assert.equal(old.relayRetired,true);
+    checks.push('vacated-dedicated-room-inherits-installed-General-controller-before-next-PCM');
+  }
+  {
+    const h=fixture(),old=h.seed('old','guide','same',{http:true}),before=h.room().audioMediaEpoch;
+    h.join(h.context('same-room'),{role:'guide',deviceId:'same',name:'renamed',audioSourceId:'page',token:'good'});
+    assert.equal(h.syncCalls(),0);assert.equal(h.room().activePublisherClientId,'same-room');assert.equal(h.room().audioMediaEpoch,before);
+    assert.equal(h.room().audioStateEnded,undefined);assert.equal(h.room().isLive,true);assert.equal(old.relayRetired,true);assert.equal(h.events.length,0);
+    checks.push('same-room-reconnect-transfers-owner-without-terminal-control-or-media-epoch-reset');
+  }
+  {
+    const h=fixture(),old=h.seed('owner','guide','same'),waiting=h.seed('waiting','guide','different');
+    h.room().activePublisherClientId='owner';h.join(h.context('mover'),{role:'guide',roomId:'other',deviceId:'same',token:'good'});
+    assert.equal(h.room().activePublisherClientId,null);assert.equal(waiting.ws.terminated,0);
+    h.g.processClientJsonMessage(waiting,{type:'guide-stream-state',audioStateSeq:11,audioMediaEpoch:11,isLive:true,broadcastMode:'mic'});
+    assert.equal(h.room().activePublisherClientId,'waiting');checks.push('remaining-guide-keeps-membership-and-can-publish-after-owner-moves');
+  }
+  for(const priorRole of ['guide','pilgrim']){
+    const h=fixture();h.seed('old','guide','same');const current=h.seed('current',priorRole,'previous',{roomId:'previous'});
+    h.join(current,{role:'guide',roomId:'target',deviceId:'same',audioSourceId:'target-page',token:'good'});
+    assert.equal(h.syncCalls(),1,'Guide removal or explicit reconciliation must run once');
+    assert.equal(h.room().isLive,false);assert.equal(h.room('previous').clients.has('current'),false);
+    assert.equal(h.room('target').clients.get('current').role,'guide');assert.equal(h.room().activePublisherClientId,null);
+  }
+  checks.push('existing-context-room-change-avoids-double-guide-sync-and-still-syncs-when-leaving-pilgrim-role');
+  {
+    const h=fixture();for(const id of ['genel','a','b'])h.seed('old-'+id,'guide','same',{roomId:id,http:id!=='genel'});
+    h.join(h.context('replacement'),{role:'guide',roomId:'target',deviceId:'same',audioSourceId:'target-page',token:'good'});
+    assert.equal(h.syncCalls(),1);for(const id of ['genel','a','b']){assert.equal(h.room(id).activePublisherClientId,null);assert.equal(h.room(id).isLive,false);}
+    assert(h.room('target').clients.has('replacement'));checks.push('multiple-vacated-guide-rooms-reconciled-after-one-atomic-membership-update');
+  }
+  {
+    const h=fixture();h.seed('general','guide','same');h.join(h.context('public'),{deviceId:'same',roomId:'other'});
+    assert.equal(h.syncCalls(),0);assert(h.room().clients.has('general'));assert.equal(h.room().activePublisherClientId,'general');
+    checks.push('v68-cross-role-device-boundary-preserved-without-spurious-presence-sync');
+  }
+  {
+    const h=fixture();h.seed('old-target','guide','same');
+    const previous={key:'OLD:genel',tourCode:'OLD',roomId:'genel',clients:new Map(),isLive:true,broadcastMode:'mic',audioSourceId:'old-tour-page',audioStateKnown:true,audioStateSeq:7,audioMediaEpoch:7,activePublisherClientId:'current'};
+    const current=h.context('current');current.currentRoom=previous;current.isAuthenticated=true;current.ws.isAuthenticated=true;
+    previous.clients.set('current',{id:'current',ws:current.ws,role:'guide',deviceId:'prior',audioSourceId:'old-tour-page'});
+    h.g.getOrCreateRoom=(code,id)=>code==='OLD'?previous:h.room(id);
+    h.g.getTourRooms=code=>code==='OLD'?[previous]:Array.from(h.rooms.values()).filter(r=>r.tourCode===code);
+    const tours=[];h.atSync=code=>tours.push(code);
+    h.join(current,{role:'guide',roomId:'target',deviceId:'same',audioSourceId:'target-page',token:'good'});
+    assert.deepEqual(tours,['OLD','T']);assert.equal(previous.isLive,false);assert.equal(h.room().isLive,false);
+    assert.equal(h.room().activePublisherClientId,null);assert(h.room('target').clients.has('current'));
+    checks.push('cross-tour-prior-guide-removal-does-not-suppress-target-tour-reconciliation');
+  }
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('vercel-ws-shim.js?v=69'));
+  assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V69 UNIT METRICS '+JSON.stringify({checks,vacatedOwners:0,reconciliationsPerAffectedTour:1,sameRoomTerminalControls:0,generalControllerReady:true,crossTourSync:true}));
+  recordResult('ADIM-5.V69','Cross-room guide replacement owner cleanup; terminal/General reconciliation after membership install; same-room continuity; existing-context and duplicate-room coverage; cache69',true);console.log('V69 UNIT PASS');
+}
+
+
+async function runV69RoomReplacementChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),code='RY-V69-'+Date.now().toString(36).toUpperCase(),device='moving-'+code;
+  const headers={'Content-Type':'application/json'},auth={...headers,Authorization:'Bearer '+token},sockets=[],caps=[],faults=[],mainAudio=[],subAudio=[],freeAudio=[],newAudio=[],pcm=Buffer.alloc(960);let hMain,hSub,created=false;
+  for(let i=0;i<480;i++)pcm.writeInt16LE(Math.round(6200*Math.sin(2*Math.PI*350*i/24000)),2*i);
+  const until=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error('V69 deadline '+label);await new Promise(r=>setTimeout(r,5));}};
+  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200,'V69 relay '+body.type);return r.json();};
+  const open=async()=>{const r=await post({type:'relay-open',version:56}),c={clientId:r.clientId,relayKey:r.relayKey,seq:0};caps.push(c);return c;};
+  const body=(c,context,messages=[])=>({clientId:c.clientId,relayKey:c.relayKey,requestSeq:++c.seq,subscriptionContext:context,messages});
+  const pollCap=(c,context,messages=[])=>post(body(c,context,messages));
+  const join=(role,roomId,name,id,source)=>({type:'join',role,tourCode:code,roomId,name,deviceId:id,pin:'6069',...(role==='guide'?{token,audioSourceId:source}:{})});
+  const connect=async()=>{const s=new WebSocket(url);sockets.push(s);s.messages=[];s.on('error',e=>faults.push(e.message));s.on('message',(raw,binary)=>{if(!binary)s.messages.push(JSON.parse(raw));});
+    await new Promise((resolve,reject)=>{s.once('open',resolve);s.once('error',reject);});return s;};
+  const joined=async(s,context)=>{s.send(JSON.stringify(context));await until(()=>s.messages.some(m=>m.type==='joined'),'join '+context.name);return s.messages.find(m=>m.type==='joined');};
+  const barrier=async s=>{const ts=Date.now()+Math.random();s.send(JSON.stringify({type:'ping',ts}));await until(()=>s.messages.some(m=>m.type==='pong'&&m.echoTs===ts),'pong');};
+  const boot=async()=>{const r=await fetch(baseUrl+'/api/bootstrap',{headers:auth});assert.equal(r.status,200);return (await r.json()).liveRooms.filter(r=>r.tourCode===code);};
+  const state=(seq,epoch=seq)=>({type:'guide-stream-state',audioStateSeq:seq,audioMediaEpoch:epoch,isLive:true,broadcastMode:'mic'});
+  const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+  const audio=(seq,source,epoch)=>({type:'audio-chunk',seq,audioSourceId:source,audioMediaEpoch:epoch,sentAt:Date.now(),sampleRate:24000,pcm16:pcm.toString('base64'),level:.5});
+  class Bridge{constructor(address){this.real=new WebSocket(address);sockets.push(this.real);this.messages=[];this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));this.real.on('error',e=>faults.push(e.message));
+    this.real.on('message',(raw,binary)=>{if(!binary)this.messages.push(JSON.parse(raw));this.onmessage?.({data:binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString()});});}
+    get readyState(){return this.real.readyState;}send(raw){this.real.send(raw);}close(){this.real.close();}}
+  try{
+    const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers:auth,body:JSON.stringify({code,name:'V69 cross-room replacement',pin:'6069'})});assert.equal(r.status,200);await r.arrayBuffer();created=true;
+    const listenerSource=fs.readFileSync(path.join(PUBLIC_DIR,'dinle.html'),'utf8'),playerSource=fs.readFileSync(path.join(PUBLIC_DIR,'pcm-player-worklet.js'),'utf8');
+    hMain=createV61ListenerHarness(listenerSource,playerSource,Bridge);const address=new URL(url);
+    hMain.g.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};hMain.g.document.getElementById('tourPinInput').value='6069';
+    hMain.connect(code);await until(()=>hMain.g.ws.messages.some(m=>m.type==='joined'),'native main witness');
+    hSub=createV61ListenerHarness(listenerSource,playerSource);hSub.connect(code,'siyer');
+    const main=await open(),sub=await open(),free=await open(),other=await open();
+    const mainContext=join('pilgrim','genel','main witness','w-main'),subContext=join('pilgrim','siyer','HTTP receiver','w-sub'),
+      freeContext=join('pilgrim','free','free witness','w-free'),otherContext=join('pilgrim','other','new room witness','w-other');
+    const poll=async()=>{for(const [c,context,out] of [[main,mainContext,mainAudio],[sub,subContext,subAudio],[free,freeContext,freeAudio],[other,otherContext,newAudio]]){
+      const p=await pollCap(c,context);out.push(...p.messages.filter(m=>m.type==='audio-chunk'));
+      if(c===sub)for(const m of p.messages)hSub.g.ws.onmessage({data:JSON.stringify(m)});
+    }};
+    await poll();
+    const old=await connect();await joined(old,join('guide','genel','old general',device,'old-general'));
+    old.send(JSON.stringify(state(10)));old.send(binary(40));await barrier(old);await until(()=>hMain.player.q.has(40),'initial native PCM');await poll();assert(hSub.player.q.has(40));
+
+    // A fresh HTTP context moves the same guide identity away from General.
+    const relay=await open(),relayContext=join('guide','siyer','moving HTTP guide',device,'dedicated-page');
+    await pollCap(relay,relayContext);await until(()=>old.readyState===WebSocket.CLOSED,'old general replaced');await poll();
+    const empty=(await boot()).find(r=>r.roomId==='genel'),vacancy={guides:empty.connectedGuides.filter(g=>g.roomId==='genel').length,isLive:empty.isLive,ended:empty.audioStateEnded,
+      nativeStopped:hMain.g.rxStreamActive===false,queuedOldFrames:hMain.player.q.size};
+    console.log('V69 VACANCY PROBE '+JSON.stringify(vacancy));
+
+    // Establish a different General publisher, then make the HTTP guide leave its dedicated room.
+    const general=await connect();await joined(general,join('guide','genel','remaining general','general-device','general-page'));
+    general.send(JSON.stringify(state(20)));general.send(binary(41));await barrier(general);await poll();
+    await pollCap(relay,relayContext,[state(30),audio(50,'dedicated-page',30)]);await poll();assert(hSub.player.q.has(50));assert.equal(hSub.g.rxAudioMediaEpoch,30);
+
+    const moved=await connect(),movedContext=join('guide','other','moved native guide',device,'other-page');
+    await joined(moved,movedContext);await barrier(moved);
+    // No fresh General control is sent: the inherited controller must precede this first PCM.
+    general.send(binary(42));await barrier(general);await poll();
+    const inherited=(await boot()).find(r=>r.roomId==='siyer'),fallback={httpFrame42:subAudio.some(m=>m.seq===42),playerFrame42:hSub.player.q.has(42),
+      rxEpoch:hSub.g.rxAudioMediaEpoch,roomKnown:inherited.audioStateKnown,roomEpoch:inherited.audioMediaEpoch,source:inherited.audioSourceId};
+    console.log('V69 FALLBACK PROBE '+JSON.stringify(fallback));
+    assert.equal(vacancy.isLive,false,'A vacated General room must receive terminal stop after cross-context replacement');
+    assert.equal(vacancy.ended,true);assert.equal(vacancy.nativeStopped,true);assert.equal(vacancy.queuedOldFrames,0);
+    assert.equal(fallback.httpFrame42,true);assert.equal(fallback.playerFrame42,true,'Inherited General control must be installed before the first PCM');
+    assert.equal(fallback.rxEpoch,20);assert.equal(fallback.roomKnown,true);assert.equal(fallback.roomEpoch,20);assert.equal(fallback.source,'general-page');
+    const stale=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body(relay,relayContext))});assert.equal(stale.status,409);await stale.arrayBuffer();
+
+    // Same-room replacement deliberately preserves the established controller and media epoch.
+    moved.send(JSON.stringify(state(40)));moved.send(binary(60));await barrier(moved);await poll();
+    const same=await open(),sameContext=join('guide','other','same-room HTTP replacement',device,'other-page');
+    const replacement=await pollCap(same,sameContext),ack=replacement.messages.find(m=>m.type==='joined');
+    assert.equal(ack.room.audioMediaEpoch,40);assert.equal(ack.room.audioStateKnown,true);assert.equal(ack.room.audioStateEnded,false);
+    await until(()=>moved.readyState===WebSocket.CLOSED,'same-room old native closed');
+    await pollCap(same,sameContext,[audio(61,'other-page',40)]);const samePoll=await pollCap(other,otherContext);newAudio.push(...samePoll.messages.filter(m=>m.type==='audio-chunk'));
+    assert(samePoll.messages.some(m=>m.type==='audio-chunk'&&m.seq===61));assert(!samePoll.messages.some(m=>m.type==='stream-state'&&m.audioStateEnded));
+
+    const native=await connect();native.send(JSON.stringify({type:'handoff-prepare',relayClientId:same.clientId,relayKey:same.relayKey,subscription:sameContext}));
+    await until(()=>native.messages.some(m=>m.type==='handoff-prepared'),'prepare');const handoffId=native.messages.find(m=>m.type==='handoff-prepared').handoffId;
+    native.send(JSON.stringify({type:'handoff-commit',handoffId}));await until(()=>native.messages.some(m=>m.type==='handoff-committed'),'commit');
+    assert.equal(native.messages.find(m=>m.type==='handoff-committed').ack.room.audioMediaEpoch,40);
+    native.send(binary(62));await barrier(native);await poll();
+    const retired=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body(same,sameContext))});assert.equal(retired.status,409);await retired.arrayBuffer();
+    assert.deepEqual(mainAudio.map(m=>m.seq),[40,41,42]);assert.deepEqual(freeAudio.map(m=>m.seq),[40,41,42]);assert.deepEqual(subAudio.map(m=>m.seq),[40,50,42]);
+    assert.deepEqual(newAudio.filter(m=>m.seq>=60).map(m=>m.seq),[60,61,62]);
+    for(const m of [...mainAudio,...subAudio,...freeAudio,...newAudio])assert(Buffer.from(m.pcm16,'base64').equals(pcm));assert.deepEqual(faults,[]);
+    console.log('V69 E2E METRICS '+JSON.stringify({vacancy,fallback,mainPcm:[40,41,42],subPcm:[40,50,42],newRoomPcm:[60,61,62],sameRoomEpoch:40,handoffEpoch:40,oldCapabilities409:true,pcmEqual:true}));
+    recordResult('ADIM-3.V69','Real fresh-context cross-room replacement stops vacated General and primes inherited HTTP playback before PCM; native/HTTP retirement; same-room continuity and two-phase handoff; byte parity',true);console.log('V69 E2E PASS');
+  }finally{
+    hMain?.g.leaveRoom();hSub?.g.leaveRoom();for(const s of sockets)try{s.terminate();}catch(e){}
+    for(const c of caps)try{await post({type:'relay-close',version:56,clientId:c.clientId,relayKey:c.relayKey});}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:auth});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -4074,6 +4248,7 @@
     await runStep5V66AudioChecks();
     await runStep5V67AudioChecks();
     await runStep5V68AudioChecks();
+    await runStep5V69AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=68"></script>
+  <script src="/vercel-ws-shim.js?v=69"></script>
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
-  <script src="/vercel-ws-shim.js?v=68"></script>
+  <script src="/vercel-ws-shim.js?v=69"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -2653,7 +2653,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=68').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=69').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=68"></script>
+  <script src="/vercel-ws-shim.js?v=69"></script>
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
-  <script src="/vercel-ws-shim.js?v=68"></script>
+  <script src="/vercel-ws-shim.js?v=69"></script>
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
-  <script src="/vercel-ws-shim.js?v=68"></script>
+  <script src="/vercel-ws-shim.js?v=69"></script>
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
-  <script src="/vercel-ws-shim.js?v=68"></script>
+  <script src="/vercel-ws-shim.js?v=69"></script>
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
-  <script src="/vercel-ws-shim.js?v=68"></script>
+  <script src="/vercel-ws-shim.js?v=69"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v68';
+const CACHE_NAME = 'ridvanses-pwa-v69';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=68',
+  '/vercel-ws-shim.js?v=69',
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
-  <script src="/vercel-ws-shim.js?v=68"></script>
+  <script src="/vercel-ws-shim.js?v=69"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```
