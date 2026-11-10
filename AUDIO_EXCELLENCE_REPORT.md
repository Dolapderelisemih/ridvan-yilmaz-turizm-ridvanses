# RıdvanSes v70 — Production Security, Topic Isolation & Presence Stability Patch

Tarih: 2026-11-10  
Çalışma alanı: D:/umresesliyazılım  
Taban HEAD: d0252c26a638d333bb244d1e99f3c5f81eb46952 (v69)

## 1. Karar ve onay kapsamı

AUD-01…AUD-06 kapsamındaki dört P1 ve iki P2 bulgu, aşağıdaki tek v70 aday yamasında kapatıldı ve gerçek CLI provasında **58 / 58 [BAŞARILI / PASS], exit 0** elde edildi. Mevcut 56 sonuç korunarak ADIM-3.V70 ve ADIM-5.V70 eklendi. Bu sonuç yalnız aşağıdaki diff ile oluşturulan aday için geçerlidir; çalışma alanındaki uygulama ve test dosyaları hâlâ v69 baytlarıdır.

**Approval Gate: incelemeye hazır; uygulanmadı.** Kalıcı yazılan tek proje dosyası bu rapordur. Stage, commit, push ve dağıtım yapılmadı. Önceden silinmiş AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md korundu.

Ses yolu WebRTC değildir: 24 kHz mono PCM, 12 bayt başlık + 960 bayt PCM16 = 972 bayt native WS paketi; JSON audio-chunk, HTTP relay ve MQTT alternatifleri vardır. ICE/TURN/SDP veya voice-chunk mekanizması eklenmedi. Capture/player DSP dosyaları değiştirilmedi.

## 2. Bulguların kapanışı

Aşağıdaki v69 negatif sonuçları önceki aynı-HEAD denetiminin sentetik, gerçek üretim fonksiyonlarını kullanan ölçümleridir. v70 sütunları bu turdaki kalıcı test ve CLI ölçümleridir; gerçek kişisel veri veya herkese açık broker yayını kullanılmadı.

| Bulgu | v69 kök neden / negatif kanıt | v70 çözümü | Doğrulama |
|---|---|---|---|
| AUD-01, P1 | Shared handler oturumun role/assignedTour bilgisini çözmeden boolean yetki kullandı. ALLOWED kapsamlı oturum OTHER turuna guide katılabildi; admin aboneliği diğer turları gösterdi. | rysPrincipal, rysCanGuide ve rysCanAdmin; native giriş, binary yetki yenileme, shared JSON, HTTP ve handoff prepare/commit aynı canlı principal sınırına bağlı. | Gerçek scoped login: kendi turunda native/HTTP guide kabul; diğer tur native reddi ve HTTP 401; admin ve handoff reddi; sonraki özel admin delta sayısı 0. |
| AUD-02, P1 | İstemcideki sabit hash yalnız başlık alanlarını kapsadı. Yetkisiz PCM 700 kabul edildi; sahte stop player kuyruğunu sıfırladı. | Sunucunun ürettiği, gövdesi AES-256-GCM ile şifreli ve tüm zarfı HMAC-SHA256 ile bağlı kanıt. Broker callback’i hiçbir gövdeyi doğrudan teslim etmez; HTTP poll sunucuda yeniden doğrular. | Gerçek mint → yayın metodu → broker callback → gerçek HTTP verifier → dinle callback → player: PCM 70 byte-birebir. Değişmiş PCM/controller/stop, yanlış tur, replay, iptal edilmiş token: 0 kabul. |
| AUD-03, P1 | Alfanümerik olmayan karakterlerin silinmesi RY-A ve RYA kimliklerini aynı topic’e düşürdü; diğer tur PCM 701’i alabildi. | v3 topic; server canonical tour uppercase+trim, room trim ve case-sensitive. Kayıpsız segment kodlaması; normal UTF-16 için u+encodeURIComponent, eşleşmeyen surrogate için j+encodeURIComponent(JSON.stringify). | RY-A ≠ RYA; a/b ≠ a%2Fb; A ≠ a; iki ayrı bozuk UTF-16 girdisi de ayrışır. Server/istemci topic eşliği ve Genel→alt oda kanıt teslimi geçti. |
| AUD-04, P1 | Route/rol değişiminde _pilgrimMeta temizlenmedi. 1.000 eski kayıt ve sentetik telefon yeni tur snapshot’ına taşındı; JSON 110.399 bayta ulaştı. | Canonical route, rol, source ve authority değişiminde derhal clear; public P2P snapshot’ında connectedPilgrims boş. Sunucu public snapshot’ında serializeRoom(..., false). Kabul edilen HTTP token/scope değişiminde eski özel outbox da temizlenir. | Tur/oda/rol/token değişiminde eski kayıt 0; public telefon sızıntısı 0. Kuyruğa özel telefon snapshot’ı konduktan sonra başka turda public üyeliğe geçildi: eski özel room-state/telefon 0. |
| AUD-05, P2 | Map için kapasite/TTL/leave temizliği yoktu; 1.000 sahte hello kalıcı kayıt oluşturdu. | Yalnız yetkili sunucu snapshot’ı listeyi kurar; 512 kayıt, 256 KiB UTF-8 JSON bütçesi, lastSeenAt, 120 s TTL; tam snapshot ayrılanı siler. HTTP rehber snapshot’ı 15 s, native heartbeat snapshot’ı 30 s. | 1.200 sahte hello → 0 kayıt; 1.200 yetkili sentetik kayıt → kapasite/bütçe içinde. 300 sessiz kullanıcı üç 90 s yenilemede korunur; leave silinir, 120001 ms yenilenmeyen kayıtlar temizlenir. |
| AUD-06, P2 | Eski native guide terminate edildi; rehber sayfası 600/1500 ms sonra yeniden sahip oldu. İki sayfa A,B,A,B,A,B,A,B sahiplik sırası, 7 eviction ve 6 reconnect planı oluşturdu. | session-replaced + native close 4009; HTTP modern/legacy guide için retired reason=replaced. Shim ve rehber sayfası terminal fence uygular, capture/demo durur; heartbeat ve connect tekrar başlatmaz. | Gerçek native 4009 + terminal mesaj; modern/legacy HTTP 409/replaced. Unit: mikrofon track’i bırakıldı; terminal retry 0; gerçek 1006 için aktif 600 ms / idle 1500 ms retry korundu. |


### Kaynak/satır izlenebilirliği

Satırlar 1 tabanlıdır. İlk sütun diskteki v69 dosyasını, son sütun uygulanmış aday v70 metnini gösterir; yeni yordamlar için tabanda — bulunur.

| Dosya | Yordam | v69 satır | v70 aday satır |
|---|---|---:|---:|
| server.js | refreshRysNativeAuth | 625 | 709 |
| server.js | processClientJsonMessageV49 | 940 | 1027 |
| server.js | broadcastToAdmins | 822 | 909 |
| server.js | validateRysHandoff | 1560 | 1660 |
| server.js | applyRysRelayAuth | 1652 | 1755 |
| server.js | syncRysRelayContext | 1695 | 1811 |
| server.js | rysTopicSegment | — | 647 |
| server.js | rysMintMqtt | — | 654 |
| server.js | rysVerifyMqtt | — | 676 |
| public/vercel-ws-shim.js | _sanitizeCode | 393 | 436 |
| public/vercel-ws-shim.js | _initMqttBus | 412 | 456 |
| public/vercel-ws-shim.js | _publishMqtt | 520 | 537 |
| public/vercel-ws-shim.js | _observeTrustedMessage | — | 406 |
| public/vercel-ws-shim.js | _clearPresence | — | 398 |
| public/vercel-ws-shim.js | _broadcastP2PRoomState | 617 | 553 |
| public/vercel-ws-shim.js | _fenceReplaced | — | 425 |
| public/vercel-ws-shim.js | _flushAndPoll | 969 | 911 |
| public/rehber.html | fenceGuideSession | — | 737 |
| public/rehber.html | connectGuideWs | 737 | 746 |
| scripts/verify-system.js | runV70SecurityChecks | — | 4373 |
| scripts/verify-system.js | runStep5V70AudioChecks | — | 4255 |

### 2.1 Principal ve abonelik sınırı

Principal yalnız geçerli canlı token ve activeAuthSessions içindeki session.user üzerinden çözülür. agency rolü assignedTour olmadan rehber yetkisi alamaz. assignedTour içeren her rol aynı tur sınırına tabidir. Kapsamsız agency_admin, admin ve super_admin global yönetici olarak kalır; agency veya başka bir turla sınırlandırılmış kullanıcı admin-subscribe ile global yetki alamaz. Bu paket agency için admin aboneliğini reddetme seçeneğini kullanır.

Admin başlangıç ACK’si yalnız rysCanAdmin ile gönderilir. broadcastToAdmins, native ve HTTP oturum principal’ını her gönderimde tekrar denetler; boolean isAdmin tek başına özel veri açmaz. Geçersiz/iptal edilmiş oturumla guide kontrolü, JSON PCM ve native binary yayın engellenir. Handoff hem prepare hem commit doğrulamasında aynı scope kontrolünü çalıştırır. V67 revoke/expiry, V68 rol düşürme ve V69 oda devri testleri geçer.

HTTP yetki reddi, sağlıklı public family aboneliğini ve bekleyen public mesajlarını silmez. Özel outbox temizliği kabul edilmiş credential/abonelik geçişine uygulanır; başarısız guide elevation bir public aileyi koparamaz. Bu ayrım mevcut ADIM-3.V65 ve ADIM-5.V65 regresyonlarında doğrulandı.

### 2.2 MQTT güvenlik protokolü ve işletim etkisi

1. Rehber media/control mesajını önce mevcut yetkili HTTP relay’e gönderir. Broker bağlı diye HTTP sesini atlayan erken çıkış kaldırıldı.
2. Normal sunucu handler’ı mesajı kabul edip yetkili broadcast oluşturduğunda, yalnız gerçek HTTP guide üyeliği için rysMintMqtt çalışır. Native WS’nin PCM hattı değişmez.
3. Gövde AES-256-GCM ile şifrelenir. Key server secret’tan alan ayrımlı SHA-256 ile türetilir; IV rastgele 12 bayt ve GCM tag 16 bayttır. Secret veya oturum tokenı istemciye/MQTT’ye konmaz.
4. Zarf version, issuer, canonical tour/room/topic, issuedAt/expiresAt, nonce, grant, source, epoch, stateSeq, seq, type ve şifreli payload’ın tamamını kapsar. grant mevcut credential’a HMAC ile bağlıdır; aynı relay üzerinde token değişimi eski kanıtı diriltemez. Anahtarları sıralanmış özyinelemeli JSON’un tamamı HMAC-SHA256 ile imzalanır; karşılaştırma timingSafeEqual kullanır.
5. Ömür 400 ms’dir. Açık gövde bütçesi 16 KiB, broker giriş/zarf bütçesi 32 KiB, yayıncı response kuyruğu 16 zarf, alıcı inbox 16 zarf, HTTP doğrulama batch’i 8, doğrulanmış replay Map’i 128 kayıttır. Sesin eski kopyası yaşam süresini uzatmak için yeniden damgalanmaz.
6. Callback yalnız şekli uygun opak zarfı bounded inbox’a koyar. İstemcideki eski _computeMqttFrameSig tamamen kaldırıldı. hello, ping, SOS veya control gibi ham public broker mesajları presence/UI/player yetkisi kazanamaz.
7. Mevcut HTTP poll içindeki mqttFrames sunucuda MAC, süre, topic/scope, gerçek issuer üyeliği, canlı token/principal, credential grant, current source/state/epoch ve alıcının PIN ile kurulmuş üyeliği açısından yeniden denetlenir. General kapsamındaki alt oda ancak o anda General’dan yayın alıyorsa kabul eder; yerel guide override’ı diğer source kanıtını engeller.
8. Başarılı doğrulamadan sonra gövde çözülür ve normal HTTP messages yolundan dinleyiciye gider. Public room snapshot hedef oda için yeniden serializeRoom(..., false) ile oluşturulur. PCM’de mevcut source/epoch/seq tekilleştirmesi ikinci kopyanın çift çalmasını önler.

**İşletim değişikliği:** MQTT artık HTTP sunucusundan bağımsız, çevrimdışı bir yetki kanalı değildir. Mint ve teslim doğrulaması HTTP erişimi gerektirir; HTTP tamamen erişilemezse MQTT kanalı da güvenli biçimde teslimi durdurur. Native WS çalışırken ses aynı native yol üzerinden sürer; WS bozulduğunda HTTP relay kullanılabilir. Bu tercih iptal edilmiş tokenın bekleyen broker paketine dahi yetki vermemesini sağlar. HTTP’den bağımsız offline doğrulamayla anlık canlı revoke aynı anda garanti edilmez.

Doğrulama mevcut yaklaşık 100 ms poll döngüsüne katılır; paket başına yeni bir endpoint/fetch açılmaz. MQTT kopyası için poll bekleme süresi, broker ve HTTP RTT eklenir; normal HTTP kopyası daha erken gelebilir. 400 ms’yi aşan zarf reddedilir. Bu paketin MQTT yolu için HTTP’den daha düşük gecikme veya bağımsız erişilebilirlik iddiası yoktur. Broker trafik gizliliği için PCM dâhil gövde şifrelidir; topic/issuer/zaman gibi routing metadatası görünür kalır.

### 2.3 Presence, mahremiyet ve terminal devralma

_pilgrimMeta broker hello’larından beslenmez. Yetkili rehberin normal native/HTTP snapshot’ı listeyi yeniler; sahte 1.200 clientId belleği büyütemez. İsim/telefon/oda/dil/zaman alanları bounded kopyalanır; telefon yalnız yerel yetkili rehber görünümünde tutulur. Public snapshot connectedPilgrims=[] taşır. Yetkili toplam dinleyici sayısı ayrıca korunur; cache kapasitesi aşıldığında toplam sayı 512’ye sabitlenmez.

Snapshot UTF-8 bütçesi JSON virgülleri dahil sayılır. Tam snapshot listeyi yeniden kurduğundan ayrılan kişi silinir. lastSeenAt konuşma/PCM üretme zamanına bağlı değildir; sessiz veya arka plandaki aktif kullanıcının varlığını sunucu heartbeat/snapshot yeniler. Gerçek UI thread’i işletim sistemi tarafından tamamen durdurulduğunda kod çalışamaz; yeniden gelen yetkili snapshot güncel listeyi kurar.

Intentional replacement native close frame’inde 4009 ve kontrol mesajında session-replaced taşır. HTTP capability emekli edilir; modern ve legacy guide response reason=replaced döner. Rehber fence’i mic generation’ı iptal eder, track/node/keepalive kaynaklarını bırakır, demo generation/interval’ını sonlandırır ve reconnect/heartbeat’i engeller. Aynı sayfanın otomatik kontrolü fence’i sıfırlamaz; açık kullanıcı devralması için sayfa yenileme yeni page source oluşturur. Handoff reason=handoff bu terminal replacement ile karıştırılmaz; lost ACK recovery testleri korunur.

## 3. Doğrulama yöntemi ve ölçümler

Gerçek giriş komutu: node --require <TEMP>/rys-v70-preload.cjs scripts/verify-system.js.

Preload bu rapordaki tek unified diff’i okuyup her hunk’ın mevcut dosya bağlamını doğruladı; adayları yalnız fs.readFileSync ve CommonJS compile belleğinde sundu. node --check aday metni stdin’den derledi. Testlerin raporu kaynak kod sanarak okuması engellendi. Sunucu, localhost HTTP, gerçek WS soketleri, login/logout, capability ve handoff yolları gerçek CLI tarafından çalıştı. Uygulama/test dosyaları diske yazılmadı. Her CLI çalışması finally bloğunda data/runtime.json başlangıç byte dizisini geri yükledi ve host preload dosyasını sildi.

MQTT/CDN ağı deterministik test broker adaptörüyle temsil edildi; gerçek shim publish/subscribe/message callback kodları çalıştı. ADIM-3.V70’te kanıt gerçek HTTP sunucusunda üretildi ve doğrulandı, gerçek dinle callback/player kuyruğuna ulaştı. Herkese açık broker’a sentetik veya kişisel veri yayımlanmadı. V66 sahiplik fixture’ı artık sahte istemci imzası üretmez; yalnız o fixture’ın HTTP verifier dönüşü mock’tur, kriptografik güven ve revoke V70 gerçek HTTP testindedir.

| Kontrol | Nihai sonuç |
|---|---|
| Aday CLI sonuç sayısı | 58 / 58 [BAŞARILI / PASS] |
| CLI exit | 0 |
| Mevcut V51…V69 E2E/DSP/relay/handoff/security sonuçları | Korundu, PASS |
| Yeni ADIM-3.V70 | PASS |
| Yeni ADIM-5.V70 | PASS |
| Scoped native/HTTP kendi turunda guide | Kabul |
| Başka tura guide / scoped admin / handoff | Reddedildi |
| Scoped admin özel başlangıç/delta sızıntısı | 0 |
| Değişmiş/yetkisiz/yanlış tur/replay/revoked MQTT kabulü | 0 |
| Broker’da açık PCM | Yok |
| Gerçek doğrulanmış PCM | seq=70; byte-birebir |
| General proof → yetkili alt oda | PASS |
| Eski özel HTTP outbox’ın public yeni tura sızıntısı | 0 |
| Sahte hello / presence | 1.200 / 0 |
| Presence üst sınırı | 512 kayıt ve 262.144 bayt |
| Sessiz aktif kullanıcı korunumu | 300; üç 90 s yenileme |
| TTL / ayrılma temizliği | 120001 ms ve eksilen snapshot PASS |
| Broker inbox / verifier batch / replay cap | 16 / 8 / 128 |
| Native intentional replacement | 4009 + session-replaced |
| Modern / legacy guide HTTP replacement | 409, reason=replaced |
| Guide capture terminal release / otomatik retry | Track bırakıldı / 0 |
| Gerçek 1006 reconnect | Aktif 600 ms, idle 1500 ms |
| V67 revoke/expiry ve V68 downgrade | PASS |
| V69 oda devri / General inheritance / terminal stop | PASS |


Ham nihai V70 E2E metriği: {"scope":{"ownNative":true,"ownHttp":true,"otherNativeDenied":true,"otherHttp401":true,"adminDenied":true,"handoffDenied":true},"mqtt":{"validPcmSeq":70,"pcmEqual":true,"forgedAccepted":0,"wrongTourAccepted":0,"replayedAccepted":0,"revokedAccepted":0,"clearPcmOnBroker":false,"generalFallbackVerified":true,"oldPrivateOutboxLeak":0},"replacement":{"nativeClose":4009,"nativeTerminalNotice":true,"httpStatus":409,"httpReason":"replaced","legacyHttpStatus":409,"scopedAdminDeltas":0}}

Ham nihai V70 Unit metriği: {"checks":["real-principal-scope-admin-handoff-HTTP-revoke; encrypted-full-body-proof-tamper-replay; collision-free-topics;legacy-guide-terminal-retirement;private-outbox-route-and-credential-fence","1200-forged-hellos-zero-presence;512/256KiB-cap;300-quiet-renewals;TTL/leave;route-role-authority-clear;bounded-inbox","4009-and-HTTP409-terminal-capture-release-no-reconnect;1006-active600ms-idle1500ms-preserved"],"forgedAccepted":0,"stalePresence":0,"quietActive":300,"metaCap":512,"metaBudget":262144,"inboxCap":16}

### 3.1 1→300 gerçek WS yük testi

ADIM-3.V59 bu adayla yeniden çalıştı: aynı IP’den 300 katılım HTTP 200; 301 gerçek WS (1 guide + 300 listener). 270 sağlıklı dinleyici, 30 pause edilmiş dinleyici ve enjekte edilmiş backpressure durumları içerir. Bu test LTE/roaming veya cihaz hoparlöründeki uçtan uca gecikmeyi ölçmez; aşağıdaki süreler localhost taşıma ölçümleridir.


| Ölçüm | Sonuç |
|---|---:|
| Sağlıklı dinleyici / frame | 270 / 120 |
| Sağlam teslim edilen frame | 32400 |
| Bozuk frame | 0 |
| Yavaş kuyruk drop | 1500 |
| Hard backpressure izolasyonu | 3 |
| p50 / p95 / p99 (ms) | 7.23 / 11.16 / 23.51 |
| Max / event-loop p99 (ms) | 26.36 / 22.53 |
| CPU / test süresi (ms) | 547 / 2417.8 |

Mevcut sayısal capture/player testleri de geçti: 8/16/24/44.1/48 kHz yolları, FIR alias reddi, source/epoch reset, PLC/starvation/catch-up, capture cancellation ve gain ramp regresyonları. Capture/player worklet SHA değerleri değişmedi; cache parametreleri capture60-audio / player61-audio olarak kaldı.

### 3.2 Negatif kontroller: testin hatayı yakaladığı ayrıca ölçüldü

Aşağıdaki mutasyonlar yalnız bellekte yapıldı ve her denemeden sonra aday metin geri kondu. Başarılı sayılan bir testin sadece kaynak içinde metin aramasına dayanmadığı doğrulandı. Bunlar CLI’daki 58 pozitif sonuca ek kontrol ölçümleridir.

| Devre dışı bırakılan koruma | Yeni testin sonucu |
|---|---|
| AUD-01 assignedTour karşılaştırması | FAIL: reddedilmesi gereken guide üyeliği oluştu |
| AUD-02 verifier canlı issuer credential kontrolü | FAIL: iptal edilmiş tokenla önceden imzalanmış stop kabul edildi |
| AUD-03 tireyi koruyan topic kimliği | FAIL: iki topic aynı uRYA/ugenel değerine düştü |
| AUD-04 _pilgrimMeta clear | FAIL: eski kayıt 300; beklenen 0 |
| AUD-05 kapasite/boyut koruması | FAIL: 512 üst sınırı aşıldı |
| AUD-06 guide onclose 4009 ayrımı | FAIL: yeni retry timer’ı oluştu (3; beklenen 2 mevcut timer) |
| Ek AUD-04 server özel outbox clear | FAIL: eski özel outbox 1; beklenen 0 |

Altı ana negatif kontrol 6/6, ek outbox negatif kontrolü 1/1 hatayı yakaladı. Mutation denemelerinin FAIL sonucu beklenen başarı ölçütüdür; teslim edilen yamada bu mutasyonlar bulunmaz.

## 4. Diff uygulanabilirliği ve kaynak bütünlüğü

Gerçek çalışma ağacında git apply --check --ignore-space-change -: **exit 0**.

Kaynaklara kalıcı dokunmama kuralı nedeniyle ters kontrol v69 çalışma ağacına karşı yapılmadı: v70 henüz o ağaca uygulanmış değildir. Bunun yerine 12 hedefin başlangıç byte dizileri yalıtılmış TEMP dizinine kopyalandı; orada ileri check, gerçek apply ve git apply --reverse --check --ignore-space-change - komutları çalıştı: **ileri exit 0, apply exit 0, ters check exit 0**. Temp hedefinin çözümlenmiş mutlak yolu TEMP/rys-v70-check-* sınırında doğrulandıktan sonra kopya silindi. Asıl .git/index, stage veya HEAD değiştirilmedi.

İki yönün farklı, doğru kod durumlarına karşı sınanması, yalnız rapor yazma kuralını koruyarak yamanın hem uygulanabilir hem geri alınabilir olduğunu doğrular.


Diff kimliği: **89025 UTF-8 bayt**, SHA-256 **a7b4c2f2e9ee1592201dc890127cd60a5177ab8bb6e3787da20e6a840dc5ebbd** (yalnız fence içindeki diff, LF satır sonları ve son newline dahil).


Dosya kapsamı 12 hedeftir: server.js, public/vercel-ws-shim.js, scripts/verify-system.js, public/sw.js ve 8 HTML. public/dinle.html bu pakette yalnız cache parametrelerini değiştirir; normal native/HTTP mesajları mevcut source/epoch/seq kabul kapısından geçer, güvenilmeyen MQTT teslimi shim’de kapatıldığı için ikinci bir doğrulayıcı ses motoruna eklenmez.

public/sw.js CACHE_NAME=ridvanses-pwa-v70; shim URL’leri v=70. index, dinle, rehber, panel, login, rota, ani-kitabi ve yaka-karti HTML’lerinin shim sürümü 70; mevcut sw.js URL’leri de 70. Capture60-audio / player61-audio korunur.

### 4.1 Başlangıç baytlarının korunumu

Aşağıdaki 15 odak uygulama/test dosyası ve runtime için başlangıç raw SHA-256 değerleriyle son okuma karşılaştırıldı: **16/16 byte eşliği**. Diğer uygulama/test kaynaklarına yazma işlemi yapılmadı; Git durumu bu rapor dışındaki takipli kaynaklarda değişiklik göstermiyor. Runtime her provada byte dizisiyle geri yüklendi; metin/JSON yeniden serileştirme kullanılmadı.


| Dosya | Başlangıç = son raw SHA-256 |
|---|---|
| server.js | 7bf9eccf8b7c7c4d243ff13456aae0697c234fb1ffda3cba6722f6eff82c2f71 |
| scripts/verify-system.js | aa8b7488c53670de3eac1991ac559cf8f1e8c477eef63b8b6357fba431c2fcb4 |
| public/ani-kitabi.html | 97c78637f97b71a0f1537f834f455d3f76a4a18b4e642786c2670254cd43df24 |
| public/dinle.html | 76139df0aa07be2e95595ec3e32acac8623e6dfbb57e0641dde0504af8ada0bd |
| public/index.html | 57da54f51dafe948bc909cf04b0b0e5dac897ce262e943e1b16d4da06584c3ed |
| public/kullanim-rehberi.html | c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e |
| public/login.html | 4cdea412a9676f407377cd2818d0d02e8d0d7b2d027ad26d8190289bce2327ce |
| public/panel.html | 0b643fe7cde887c0992c4db1702ea162a1d56ac1bff2ff2f9f9f027ddadb5c04 |
| public/pcm-capture-worklet.js | 30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a |
| public/pcm-player-worklet.js | 062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7 |
| public/rehber.html | c3133c192803db87a213c0800896a128b29fd7b0e70bb5025745e46803ad0fd4 |
| public/rota.html | 856796012963865f623afcc28910c3395fa6f66ec95f86508b2b62335b38914b |
| public/sw.js | 8d0210463fdb702487e1a6341d28206f67092d035cd1c63019ac3468ebdb6343 |
| public/vercel-ws-shim.js | a89f929edf4cd9cfaccb0f48f38705ca60b2bdb3d2c538ca9cbb485618f3f48e |
| public/yaka-karti.html | 2ce70468d6669f33f499de1f2785aec2bab7f946bf2350c6ca66ddaac72bb9af |
| data/runtime.json | 087e97acb7b29e389c4ac4da3014ce2aee8de575cd9d602c3af2eae3e11a32c4 |

Son Git durumunun beklenen içeriği: yalnız AUDIO_EXCELLENCE_REPORT.md modified; AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md deleted. Yeni uygulama/test dosyası, preload, stage/commit/push/deploy yoktur. CLI host preload’u ve Node-VM hazırlığında kullanılan ek preload silindi; yalıtılmış apply kopyası silindi.

## 5. Kabul sınırları

Bu rapor altı belirtilen kod bulgusunun kapandığını ve yerel doğrulama sonuçlarını belgeliyor. Fiziksel Kâbe akustiği, çapraz cihaz akustik echo, 80 dB kalabalıkta yüzde yüz yan konuşma izolasyonu, mobil OS’nin ekran kilidi/arama sırasında çalışma izni veya gerçek roaming kesintisizliği bu komutlarla kanıtlanmaz. Bu yüzden evrensel “sıfır hata / yüzde yüz cihaz garantisi” kararı verilmez.

300 WS yük ölçümü native fan-out içindir. 300 eşzamanlı HTTP+şifreli MQTT doğrulaması için saha kapasite/RTT ölçümü yapılmadı. Aynı relay oturumunu tutan mevcut tek sunucu/oturum yönlendirme modeli korunur; çok süreçli dağıtımda canlı session lookup için ortak state veya aynı worker’a yönlendirme gerekir. Ana ses hattı ve DSP değişmedi; güvenlik nedeniyle HTTP erişimine bağlı MQTT davranışı onayda özellikle değerlendirilmelidir.

## 6. Tek ve eksiksiz v70 unified diff

Aşağıdaki tek diff, raporun kendisini veya runtime verisini içermez. HEAD d0252c2 üzerine uygulanmak üzere hazırlanmıştır. Uygulama sonrası normal node scripts/verify-system.js komutu yeni 58 testlik paketi çalıştırır. Bu teslimde yama yalnız bu raporun içindedir.


```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -456,6 +456,7 @@
   const audio=isAudioOverride||!!(payload&&typeof payload==='object'&&payload.type==='audio-chunk');
   const data=typeof payload==='string'?payload:JSON.stringify(payload);
   let relayData;
+  if(globalThis.__rysMqttPublisher&&typeof rysMintMqtt==='function')rysMintMqtt(globalThis.__rysMqttPublisher,room,payload);
   for(const client of room.clients.values()){
     const socket=client.ws;if(socket===excludeWs||socket.readyState!==WebSocket.OPEN)continue;
     if(audio){
@@ -622,9 +623,95 @@
 }
 
 
+
+function rysPrincipal(token){
+  if(!isValidAuthToken(token))return null;
+  if(String(token).trim()===AUTH_TOKEN_VALUE)return {role:'agency_admin',assignedTour:null};
+  const u=activeAuthSessions.get(String(token).trim())?.user;
+  if(!u||!['agency','agency_admin','super_admin','admin'].includes(u.role))return null;
+  const assignedTour=u.assignedTour?String(u.assignedTour).toUpperCase().trim():null;
+  if(u.role==='agency'&&!assignedTour)return null;
+  return {role:u.role,assignedTour};
+}
+function rysCanGuide(principal,code){
+  return !!principal&&(!principal.assignedTour||principal.assignedTour===String(code||'RY-KASIM').toUpperCase().trim());
+}
+function rysCanAdmin(principal){
+  return !!principal&&!principal.assignedTour&&['agency_admin','super_admin','admin'].includes(principal.role);
+}
+function rysCanonical(value){
+  if(Array.isArray(value))return '['+value.map(rysCanonical).join(',')+']';
+  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+rysCanonical(value[k])).join(',')+'}';
+  return JSON.stringify(value);
+}
+function rysTopicSegment(value){
+  const text=String(value);
+  try{return 'u'+encodeURIComponent(text);}catch(e){return 'j'+encodeURIComponent(JSON.stringify(text));}
+}
+function rysMqttTopic(code,room){
+  return 'ridvanses/v3/room/'+rysTopicSegment(String(code||'RY-KASIM').toUpperCase().trim())+'/'+rysTopicSegment(String(room||'genel').trim());
+}
+function rysMintMqtt(session,room,payload){
+  const member=session.currentRoom?.clients.get(session.clientId);
+  if(room!==session.currentRoom||!session.ws.isHttpRelay||session.relayRetired||member?.role!=='guide'||
+    !rysCanGuide(rysPrincipal(session.rysAuthToken),room.tourCode))return;
+  let body=typeof payload==='string'?JSON.parse(payload):payload;
+  if(!['audio-chunk','stream-state','audio-source','room-state','tawaf-stage','guide-location'].includes(body?.type))return;
+  if(body.type==='room-state')body={type:'room-state',room:serializeRoom(room,false)};
+  if(Buffer.byteLength(JSON.stringify(body),'utf8')>16384)return;
+  const iv=crypto.randomBytes(12),key=crypto.createHash('sha256').update('rys-mqtt-v70:'+AUTH_TOKEN_VALUE).digest();
+  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
+  const encrypted=Buffer.concat([cipher.update(JSON.stringify(body),'utf8'),cipher.final()]);
+  const sealed={iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:encrypted.toString('base64')};
+  const frame=JSON.parse(JSON.stringify({version:70,issuer:session.clientId,tourCode:room.tourCode,roomId:room.roomId,
+    topic:rysMqttTopic(room.tourCode,room.roomId),issuedAt:Date.now(),expiresAt:Date.now()+400,
+    nonce:crypto.randomBytes(12).toString('hex'),
+    grant:crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update('rys-grant70:'+session.rysAuthToken).digest('hex'),
+    source:room.audioSourceId||null,
+    epoch:room.audioMediaEpoch||null,stateSeq:room.audioStateSeq||null,seq:body.seq??null,type:body.type,payload:sealed}));
+  frame.proof=crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update(rysCanonical(frame)).digest('hex');
+  const q=session.mqttPublications||(session.mqttPublications=[]);q.push(frame);
+  while(q.length>16)q.shift();
+}
+function rysVerifyMqtt(receiver,frame){
+  if(!frame||frame.version!==70||JSON.stringify(frame).length>32768)return null;
+  const {proof,...unsigned}=frame;
+  if(!/^[0-9a-f]{64}$/.test(proof||''))return null;
+  const expected=crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update(rysCanonical(unsigned)).digest('hex');
+  if(!crypto.timingSafeEqual(Buffer.from(proof),Buffer.from(expected)))return null;
+  const now=Date.now();
+  if(frame.issuedAt>now||frame.expiresAt<now||frame.expiresAt-frame.issuedAt>400||
+    frame.topic!==rysMqttTopic(frame.tourCode,frame.roomId))return null;
+  const issuer=httpRelaySessions.get(frame.issuer),origin=issuer?.currentRoom;
+  const publisher=origin?.clients.get(issuer?.clientId),target=receiver.currentRoom;
+  if(!issuer||issuer.relayRetired||now-issuer.lastSeen>35000||publisher?.role!=='guide'||
+    !rysCanGuide(rysPrincipal(issuer.rysAuthToken),origin.tourCode)||
+    !target||!target.clients.has(receiver.clientId)||target.tourCode!==frame.tourCode||
+    !getTargetBroadcastRooms(origin).includes(target))return null;
+  if(frame.grant!==crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update('rys-grant70:'+issuer.rysAuthToken).digest('hex'))return null;
+  if(origin.roomId!==frame.roomId||target.audioSourceId!==frame.source||
+    (target.audioMediaEpoch||null)!==frame.epoch||(target.audioStateSeq||null)!==frame.stateSeq)return null;
+  const sealed=frame.payload;
+  if(!/^[0-9a-f]{24}$/.test(sealed?.iv||'')||!/^[0-9a-f]{32}$/.test(sealed?.tag||''))return null;
+  const key=crypto.createHash('sha256').update('rys-mqtt-v70:'+AUTH_TOKEN_VALUE).digest();
+  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(sealed.iv,'hex'));
+  decipher.setAuthTag(Buffer.from(sealed.tag,'hex'));
+  const body=JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.data,'base64')),decipher.final()]).toString('utf8'));
+  if(body.type!==frame.type||(body.seq??null)!==frame.seq)return null;
+  if(body.type==='audio-chunk'&&(!target.isLive||body.audioSourceId!==frame.source||body.audioMediaEpoch!==frame.epoch))return null;
+  const seen=receiver.mqttVerified||(receiver.mqttVerified=new Map());
+  for(const [id,expiry] of seen)if(expiry<now)seen.delete(id);
+  if(seen.has(proof))return null;
+  seen.set(proof,frame.expiresAt);while(seen.size>128)seen.delete(seen.keys().next().value);
+  return body.type==='room-state'?{type:'room-state',room:serializeRoom(target,false)}:body;
+}
+
 function refreshRysNativeAuth(ctx){
   if(!ctx||ctx.ws.isHttpRelay)return true; // HTTP capabilities revalidate per request.
-  const authed=!!isValidAuthToken(ctx.rysAuthToken||ctx.rysHandshakeToken);
+  const principal=rysPrincipal(ctx.rysAuthToken||ctx.rysHandshakeToken);
+  const memberNow=ctx.currentRoom?.clients.get(ctx.clientId);
+  const authed=!!principal&&(!ctx.ws.isAdmin||rysCanAdmin(principal))&&
+    (memberNow?.role!=='guide'||rysCanGuide(principal,ctx.currentRoom.tourCode));
   ctx.isAuthenticated=authed;ctx.ws.isAuthenticated=authed;
   if(authed)return true;
   const room=ctx.currentRoom,member=room?.clients.get(ctx.clientId),pending=ctx.rysHandoff?.request;
@@ -822,12 +909,12 @@
 function broadcastToAdmins(payload) {
   const data = JSON.stringify(payload);
   wss.clients.forEach((ws) => {
-    if (ws.isAdmin && ws.readyState === WebSocket.OPEN) {
+    if (ws.isAdmin && ws.readyState === WebSocket.OPEN && rysCanAdmin(rysPrincipal(ws.rysAuthContext?.rysAuthToken||ws.rysAuthContext?.rysHandshakeToken))) {
       ws.send(data);
     }
   });
   for (const sess of httpRelaySessions.values()) {
-    if (sess.ws.isAdmin) {
+    if (sess.ws.isAdmin && rysCanAdmin(rysPrincipal(sess.rysAuthToken))) {
       sess.ws.send(data);
     }
   }
@@ -947,10 +1034,13 @@
     ws.isAuthenticated = true;
     ctx.isAuthenticated = true;
   }
-  const isAuthedClient = Boolean(ws.isAuthenticated || ctx.isAuthenticated);
+  const principal=rysPrincipal(ctx.rysAuthToken||ctx.rysHandshakeToken);
+  const isAuthedClient=!!principal;
+  ws.isAuthenticated=isAuthedClient;ctx.isAuthenticated=isAuthedClient;
 
   if (msg.type === 'admin-subscribe') {
-    if (!isAuthedClient) {
+    if (!rysCanAdmin(principal)) {
+      ws.isAdmin=false;
       ws.send(JSON.stringify({ type: 'auth-error', message: 'Acente paneli aboneliği için yetkili oturum gereklidir.' }));
       return;
     }
@@ -981,7 +1071,7 @@
   }
 
   if (msg.type === 'join') {
-    if (msg.role === 'guide' && !isAuthedClient) {
+    if (msg.role === 'guide' && !rysCanGuide(principal,msg.tourCode)) {
       ws.send(JSON.stringify({ type: 'auth-error', message: 'Rehber yayını başlatmak için yetkili girişi gereklidir.' }));
       return;
     }
@@ -991,7 +1081,7 @@
     const matchedTour = (db.tours || []).find((t) => String(t.code || '').toUpperCase() === tourCode);
     if (
       role !== 'guide' &&
-      !isAuthedClient &&
+      !rysCanGuide(principal,tourCode) &&
       matchedTour &&
       matchedTour.pinProtected &&
       matchedTour.pin &&
@@ -1028,7 +1118,10 @@
         if (sameDevice || sameGuide) {
           if(existingClient.ws?.isHttpRelay){
             const oldRelay=httpRelaySessions.get(existingId);
-            if(oldRelay&&(oldRelay.relayKey||ctx.rysAckCapture))oldRelay.relayRetired=true;
+            if(oldRelay&&(existingClient.role==='guide'||oldRelay.relayKey||ctx.rysAckCapture)){
+              oldRelay.relayRetired=true;oldRelay.relayRetiredReason=ctx.rysAckCapture?'handoff':'replaced';
+              oldRelay.mqttPublications=[];
+            }
           }
           r.clients.delete(existingId);
           if(existingClient.role==='guide'&&r!==targetRoom)needsGuidePresenceSync=true;
@@ -1038,7 +1131,10 @@
           }
           try {
             if (existingClient.ws && !existingClient.ws.isHttpRelay && typeof existingClient.ws.terminate === 'function') {
-              existingClient.ws.terminate();
+              if(existingClient.role==='guide'&&typeof existingClient.ws.close==='function'){
+                existingClient.ws.send(JSON.stringify({type:'session-replaced'}));
+                existingClient.ws.close(4009,'session-replaced');
+              }else existingClient.ws.terminate();
             }
           } catch {}
         }
@@ -1084,6 +1180,7 @@
   if (!currentRoom) return;
   const sender = currentRoom.clients.get(clientId);
   if (!sender) return;
+  if(sender.role==='guide'&&!rysCanGuide(principal,currentRoom.tourCode))return;
 
   switch (msg.type) {
     case 'guide-stream-state': {
@@ -1438,6 +1535,9 @@
     if (ws.isAlive === false) {
       return ws.terminate();
     }
+    if(ws.rysAuthContext?.currentRoom?.clients.get(ws.rysAuthContext.clientId)?.role==='guide'){
+      try{ws.send(JSON.stringify({type:'room-state',room:serializeRoom(ws.rysAuthContext.currentRoom,true)}));}catch(e){}
+    }
     ws.isAlive = false;
     try {
       ws.ping();
@@ -1536,7 +1636,7 @@
       res.status(409).json({error:'relay-session-expired'});return null;
     }
   }else s=s||getOrCreateRelaySession(id);
-  if(s.relayRetired){res.status(409).json({error:'relay-session-retired'});return null;}
+  if(s.relayRetired){res.status(409).json({error:'relay-session-retired',reason:s.relayRetiredReason||'handoff'});return null;}
   return s;
 }
 function digestRysSubscription(m){
@@ -1559,7 +1659,9 @@
 }
 function validateRysHandoff(ctx,request){
   const token=[request.token,ctx.rysAuthToken,ctx.rysHandshakeToken].find(isValidAuthToken);
-  const authed=!!token;
+  const principal=rysPrincipal(token),authed=!!principal;
+  if(request.type==='admin-subscribe'&&!rysCanAdmin(principal))return 'scope-required';
+  if(request.type==='join'&&request.role==='guide'&&!rysCanGuide(principal,request.tourCode))return 'scope-required';
   if(authed)ctx.rysAuthToken=String(token).trim();
   ctx.isAuthenticated=authed;ctx.ws.isAuthenticated=authed;
   if((request.type==='admin-subscribe'||request.type==='join'&&request.role==='guide')&&!authed)
@@ -1649,13 +1751,27 @@
 }
 
 // PATCH: relay-auth-v53
+
 function applyRysRelayAuth(session,req,token,context){
-  const authenticated=!!(isRequestAuthenticated(req)||isValidAuthToken(token)||isValidAuthToken(context?.token));
+  const credential=[extractAuthTokenFromReq(req),token,context?.token].find(isValidAuthToken);
+  const principal=rysPrincipal(credential),authenticated=!!principal;
+  session.isAuthenticated=authenticated;session.ws.isAuthenticated=authenticated;
   const client=session.currentRoom?.clients.get(session.clientId);
-  session.isAuthenticated=authenticated;session.ws.isAuthenticated=authenticated;
-  return authenticated||!(client?.role==='guide'||session.ws.isAdmin||
-    context?.role==='guide'||context?.type==='admin-subscribe');
-}
+  let allowed=true;
+  if(context?.type==='admin-subscribe'||session.ws.isAdmin&&!context)allowed=rysCanAdmin(principal);
+  else if(context?.type==='join'&&context.role==='guide')allowed=rysCanGuide(principal,context.tourCode);
+  else if(client?.role==='guide'&&!context)allowed=rysCanGuide(principal,session.currentRoom.tourCode);
+  // A rejected elevation must not erase a healthy public family's subscription/outbox.
+  if(!allowed)return false;
+  const nextCredential=authenticated?String(credential).trim():null;
+  if((session.rysAuthToken||null)!==nextCredential){
+    if(Array.isArray(session.outbox))session.outbox.length=0;
+    session.mqttPublications=[];session.mqttVerified?.clear();session.presenceSnapshotAt=0;
+  }
+  session.rysAuthToken=nextCredential;
+  return true;
+}
+
 function syncRysRelayJoin(session,joinContext){
   if(!joinContext||joinContext.type!=='join')return true;
   const code=String(joinContext.tourCode||'RY-KASIM').toUpperCase().trim();
@@ -1694,6 +1810,18 @@
 // v54: actual subscription type, without a fabricated pilgrim join.
 function syncRysRelayContext(session,context){
   if(!context)return true;
+  const room=session.currentRoom,member=room?.clients.get(session.clientId);
+  const previous=session.ws.isAdmin?['admin-subscribe']:session.ws.familyTourCode?
+    ['family-subscribe',session.ws.familyTourCode]:room?
+    ['join',room.tourCode,room.roomId,member?.role||'pilgrim',member?.role==='guide'?member.audioSourceId||null:null]:['none'];
+  const desired=context.type==='admin-subscribe'?['admin-subscribe']:context.type==='family-subscribe'?
+    ['family-subscribe',String(context.tourCode||'RY-KASIM').toUpperCase().trim()]:
+    ['join',String(context.tourCode||'RY-KASIM').toUpperCase().trim(),String(context.roomId||'genel').trim(),
+      context.role==='guide'?'guide':'pilgrim',context.role==='guide'?context.audioSourceId||member?.audioSourceId||null:null];
+  if(JSON.stringify(previous)!==JSON.stringify(desired)){
+    if(Array.isArray(session.outbox))session.outbox.length=0;
+    session.mqttPublications=[];session.mqttVerified?.clear();session.presenceSnapshotAt=0;
+  }
   if(context.type==='join'){
     if(!syncRysRelayJoin(session,context))return false;
     session.ws.isAdmin=false;session.ws.familyTourCode=null;
@@ -1763,13 +1891,27 @@
   }
   if(session.relayKey&&!context&&messages.some(m=>['join','family-subscribe','admin-subscribe'].includes(m?.type)))
     return res.status(400).json({error:'relay-context-required'});
-  for(const m of messages){
+  session.mqttPublications=[];
+  const previousPublisher=globalThis.__rysMqttPublisher;
+  globalThis.__rysMqttPublisher=session;
+  try{for(const m of messages){
     if(!m||typeof m!=='object')continue;
     // Explicit context is the latest subscription. Do not replay stale queued joins.
     if(context&&['join','family-subscribe','admin-subscribe'].includes(m.type))continue;
     processClientJsonMessage(session,m);
   }
-  return res.json({clientId:session.clientId,messages:drainRysRelaySession(session)});
+  }finally{globalThis.__rysMqttPublisher=previousPublisher;}
+  const incoming=drainRysRelaySession(session);
+  const frames=req.body?.mqttFrames;
+  if(Array.isArray(frames))for(const f of frames.slice(0,8)){
+    try{const verified=rysVerifyMqtt(session,f);if(verified)incoming.push(verified);}catch(e){}
+  }
+  const publications=session.mqttPublications||[];session.mqttPublications=[];
+  if(session.currentRoom?.clients.get(session.clientId)?.role==='guide'&&
+    Date.now()-(session.presenceSnapshotAt||0)>=15000){
+    session.presenceSnapshotAt=Date.now();incoming.push({type:'room-state',room:serializeRoom(session.currentRoom,true)});
+  }
+  return res.json({clientId:session.clientId,messages:incoming,mqttPublications:publications});
 }
 
 app.post('/api/ws-relay',(req,res)=>{
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -590,6 +590,7 @@
   await runV67NativeAuthChecks({baseUrl,url:wsUrl,token:authToken,credentials:loginCredentials});
   await runV68RoleBoundaryChecks({baseUrl,url:wsUrl,token:authToken});
   await runV69RoomReplacementChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV70SecurityChecks({baseUrl,url:wsUrl,token:authToken,credentials:loginCredentials});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -726,7 +727,7 @@
   assertCondition(
     'ADIM-4.1 (YÜKSEK-04)',
     'vercel-ws-shim.js içinde MQTT konu yolu alt oda kimliğini (SIYER / GENEL) koruyor',
-    siyerTopic === 'ridvanses/v2/room/RYKASIM/SIYER' && genelTopic === 'ridvanses/v2/room/RYKASIM/GENEL',
+    siyerTopic === 'ridvanses/v3/room/uRY-KASIM/usiyer' && genelTopic === 'ridvanses/v3/room/uRY-KASIM/ugenel',
     `Siyer Topic: ${siyerTopic}, Genel Topic: ${genelTopic}`
   );
 
@@ -859,8 +860,8 @@
     'Kod varlığı OS kesintisizlik garantisi değildir');
 
   // 4.7 Faz 1-4 İstemci & Mimari Denetim Onarımları Doğrulaması (KRİTİK-02, YÜKSEK-01, ORTA-01..05, DÜŞÜK-01..02)
-  const testSig = mockWsInstance._computeMqttFrameSig('ridvanses/v2/room/RYKASIM/GENEL', 'audio-chunk', 1700000000000, 'cid-1');
-  const hasMqttSigEngine = typeof testSig === 'string' && testSig.length === 16;
+  const testSig='server-HMAC/full-canonical-body/live-verification';
+  const hasMqttSigEngine=typeof mockWsInstance._computeMqttFrameSig==='undefined'&&shimCode.includes('mqttFrames:');
   const hasAbortTimeoutInSos =
     dinleHtml.includes('new AbortController()') &&
     dinleHtml.includes('ctrl.abort()') &&
@@ -876,7 +877,7 @@
 
   assertCondition(
     'ADIM-4.7 (KRİTİK-02, YÜKSEK-01, ORTA-01..05, DÜŞÜK-01..02)',
-    'MQTT paket imzalama (_rySig), SOS AbortController zaman aşımı (2.2sn), tekil Worker kalp atışı, 4KB bloklu Base64 ve SW Promise.allSettled doğrulandı',
+    'MQTT sunucu kanıtı ve şifreli gövde, SOS AbortController zaman aşımı (2.2sn), tekil Worker kalp atışı, 4KB bloklu Base64 ve SW Promise.allSettled doğrulandı',
     hasMqttSigEngine &&
       hasAbortTimeoutInSos &&
       hasSingleHeartbeatGuard &&
@@ -1097,6 +1098,27 @@
 }
 
 // PATCH: verify-v53
+
+function v70Pick(source,name,kind='function'){
+  const head=kind==='method'?'(?:async )?':'(?:async )?function ';
+  const m=new RegExp('^[ \\t]*'+head+name+'\\([^\\n]*\\)\\s*\\{','m').exec(source);
+  require('node:assert/strict')(m,'V70 missing '+name);
+  for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){
+    const code=source.slice(m.index,end+1);
+    try{new vm.Script(kind==='method'?'class Probe{'+code+'}':code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}
+  }
+  throw Error('V70 unterminated '+name);
+}
+function installV70AuthFixture(g){
+  // Older units already stub token validity. Resolve their valid root identity through
+  // the real principal/scope helpers; V70 separately exercises real scoped sessions.
+  const source=fs.readFileSync(path.join(ROOT_DIR,'server.js'),'utf8');
+  g.AUTH_TOKEN_VALUE=g.AUTH_TOKEN_VALUE||'good';
+  g.activeAuthSessions=g.activeAuthSessions||new Map();
+  g.AUTH_COOKIE_NAME='unit_auth';
+  vm.runInContext(['rysPrincipal','rysCanGuide','rysCanAdmin','extractAuthTokenFromReq'].map(n=>v70Pick(source,n)).join('\n'),g);
+}
+
 async function runStep5V53AudioChecks(){
   const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
   const assert=require('node:assert/strict');
@@ -1123,7 +1145,7 @@
       setTimeout,clearTimeout,queueMicrotask,
       AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},
       registerProcessor:(name,K)=>P=K,...globals};
-    vm.createContext(c);vm.runInContext(code.replace(/^export .*$/mg,'')+'\n'+tail,c);return {c,P};
+    vm.createContext(c);if(globals.isValidAuthToken)installV70AuthFixture(c);vm.runInContext(code.replace(/^export .*$/mg,'')+'\n'+tail,c);return {c,P};
   }
   const cap=box(capture,'globalThis.K=RysCaptureKernel;globalThis.G=RysNearExpander;globalThis.F=RysFir24;').c;
   const edge=new cap.G();for(const x of [NaN,Infinity,-Infinity,1e308,-1e308,1e-300,0])assert(Number.isFinite(edge.step(x)));
@@ -1542,9 +1564,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v69"));assert(sw.includes('/vercel-ws-shim.js?v=69'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v70"));assert(sw.includes('/vercel-ws-shim.js?v=70'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'69',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'70',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -1812,7 +1834,7 @@
       ctx.currentRoom.clients.set(ctx.clientId,{role:'guide',name:request.name});
       sc.sendRysSubscriptionAck(ctx,{type:'joined',room:{members:ctx.currentRoom.clients.size}});
     }};
-  vm.createContext(sc);vm.runInContext(names.map(n=>pick(server,n)).join('\n'),sc);
+  vm.createContext(sc);installV70AuthFixture(sc);vm.runInContext(names.map(n=>pick(server,n)).join('\n'),sc);
   let activeSource;
   const request={type:'join',role:'guide',token:'good',tourCode:'X',roomId:'genel',name:'Guide',deviceId:'d'};
   const make=()=>{
@@ -1829,7 +1851,7 @@
   assert(a.sent.some(m=>m.code==='prepare-expired'));assert(!a.source.relayRetired);assert.equal(joins,0);
   a=make();sc.handleRysNativeHandoff(a.ctx,{type:'handoff-cancel'});assert(!a.ctx.rysHandoff);assert.equal(joins,0);
   a=make();allowed=false;sc.handleRysNativeHandoff(a.ctx,{type:'handoff-commit',handoffId:a.id});
-  assert(a.sent.some(m=>m.code==='auth-required'));assert(!a.source.relayRetired);assert.equal(joins,0);allowed=true;
+  assert(a.sent.some(m=>m.code==='auth-required'||m.code==='scope-required'));assert(!a.source.relayRetired);assert.equal(joins,0);allowed=true;
   a=make();sc.handleRysNativeHandoff(a.ctx,{type:'handoff-commit',handoffId:a.id});
   assert(a.source.relayRetired);assert.equal(joins,1);assert.equal(a.source.currentRoom.clients.size,1);
   sc.handleRysNativeHandoff(a.ctx,{type:'handoff-commit',handoffId:a.id});assert.equal(joins,1);
@@ -1899,9 +1921,9 @@
   await offline._flushAndPoll();assert(offline._isRelay);
   const frame=seq=>({type:'audio-chunk',seq,sampleRate:24000,sentAt:100,pcm16:Buffer.alloc(960).toString('base64')});
   for(let i=0;i<3;i++)offline.send(JSON.stringify(frame(i)));
-  assert(published>0,'MQTT audio must keep working while relay-open is unavailable');
+  assert(offline._isRelay&&offline._sendQueue.length<=4,'API failure preserves relay mode and a bounded media queue; proof-free broker delivery is retired in v70');
   if(typeof recordResult==='function')recordResult('ADIM-5.V56',
-    'Prepare expiry/revoke/cancel; silinen ID409; ACK kaybı/fencing/yeni oturum; geç open cevabı; MQTT bağımsızlığı',true);
+    'Prepare expiry/revoke/cancel; silinen ID409; ACK kaybı/fencing/yeni oturum; geç open cevabı; MQTT için sunucu kanıtı gereksinimi',true);
   console.log('V56 UNIT PASS: expired/revoked prepare has no side effects; lost ACK recovers with fresh HTTP ID; no source-ID resurrection');
 }
 
@@ -2509,7 +2531,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2719,7 +2741,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2958,7 +2980,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3143,7 +3165,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3330,7 +3352,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3477,10 +3499,10 @@
   {
     let now=100;const map=new Map(),removed=[];
     const g={Date:class extends Date{static now(){return now;}},crypto:require('node:crypto'),Buffer,httpRelaySessions:map,
-      isRequestAuthenticated:r=>r.auth===true,isValidAuthToken:t=>t==='good',syncRysRelayContext:()=>true,processClientJsonMessage(){},
+      isRequestAuthenticated:r=>r.auth===true,isValidAuthToken:t=>t==='good',syncRysRelayContext:()=>true,processClientJsonMessage(){},serializeRoom:()=>({}),
       drainRysRelaySession:s=>s.outbox.splice(0),getOrCreateRelaySession(){throw Error('unexpected new legacy session');},
       removeClientFromRoom:(room,id,grace)=>{removed.push({id,grace});room.clients.delete(id);}};
-    vm.createContext(g);vm.runInContext(['isRysClientMessage','acceptRysRelayRequestOrder','applyRysRelayAuth','retireRysRelayOnAuthFailure','serveRysRelay','resolveRysRelay','cleanupStaleRelaySessions','digestRysSubscription'].map(n=>pick(server,n)).join('\n'),g);
+    vm.createContext(g);installV70AuthFixture(g);vm.runInContext(['isRysClientMessage','acceptRysRelayRequestOrder','applyRysRelayAuth','retireRysRelayOnAuthFailure','serveRysRelay','resolveRysRelay','cleanupStaleRelaySessions','digestRysSubscription'].map(n=>pick(server,n)).join('\n'),g);
     const response=()=>({status(n){this.code=n;return this;},json(m){this.body=m;}});
     const member=(id,key,role='guide')=>{const room={clients:new Map([[id,{role}]])},s={clientId:id,relayKey:key,ws:{isAdmin:false,familyTourCode:null},currentRoom:room,lastSeen:0,outbox:[]};map.set(id,s);return s;};
     const s=member('rys56-key','a'.repeat(48)),res=response();g.serveRysRelay(s,{method:'POST',body:{requestSeq:1}},res,'bad',{type:'join',role:'guide'});
@@ -3494,7 +3516,7 @@
     const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
     checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
   recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
 }
@@ -3609,9 +3631,12 @@
   const init=(join={type:'join',role:'pilgrim',tourCode:'V66',roomId:'genel'})=>{
     s._joinContext=join;s._subscriptionType='join';s._initMqttBus(join);};
   const emit=(c,message,topic=c.subscriptions.find(t=>t!=='ridvanses/v2/global/sos')||s._mqttTopic)=>{
-    const m={...message,senderClientId:'v66-remote',_ryTs:Date.now()};
-    m._rySig=s._computeMqttFrameSig(topic,m.type,m._ryTs,m.senderClientId);
-    c.handlers.message?.(topic,Buffer.from(JSON.stringify(m)));
+    // This ownership fixture mocks the authenticated HTTP verifier, not broker trust.
+    // The real HMAC, tamper/revoke and route checks run in ADIM-3.V70 / ADIM-5.V70.
+    const frame={version:70,topic,proof:'a'.repeat(64),payload:message};
+    c.handlers.message?.(topic,Buffer.from(JSON.stringify(frame)));
+    const index=(s._mqttInbox||[]).indexOf((s._mqttInbox||[]).find(f=>f.payload?._msgId===message._msgId));
+    if(index>=0){s._mqttInbox.splice(index,1);s._deliverIncomingMessage(message);}
   };
   return {s,g,clients,scripts,jobs,published,received,load,init,emit};
 }
@@ -3629,7 +3654,7 @@
     h.load();assert.equal(h.clients.length,2,'Only the latest pending route may open the two brokers');
     const active=h.s._mqttClients.slice();h.scripts[0].onload();
     assert.deepEqual(h.s._mqttClients,active);assert(active.every(c=>!c.ended));
-    assert.equal(h.s._mqttTopic,'ridvanses/v2/room/NEW/SIYER');
+    assert.equal(h.s._mqttTopic,'ridvanses/v3/room/uNEW/usiyer');
     checks.push('new-route-invalidates-older-loader-before-script-arrival');
     h.s.close();
   }
@@ -3641,7 +3666,7 @@
     assert(old.every(c=>c.ended===1));const counts={received:h.received.length,published:h.published.length,seen:h.s._busSeen.size};
     for(const c of old){const n=c.subscriptions.length;c.handlers.connect();assert.equal(c.subscriptions.length,n);h.emit(c,message('shared-after-switch'),'ridvanses/v2/room/V66/GENEL');}
     ack();assert.equal(h.published.length,counts.published);assert.equal(h.received.length,counts.received);assert.equal(h.s._busSeen.size,counts.seen);
-    for(const c of active)c.handlers.connect();active[0].acks[0]();assert(h.published.length>counts.published);
+    for(const c of active)c.handlers.connect();active[0].acks[0]();assert.equal(h.published.length,counts.published,'Unverified hello must never publish PII');
     h.emit(active[0],message('shared-after-switch'));assert.equal(h.received.length,counts.received+1,'Stale callbacks must not poison current dedup IDs');
     checks.push('ended-client-connect-suback-message-and-dedup-fenced-current-client-works');
     h.s._isRelay=false;h.s._closeMqttClients();const delivered=h.received.length;
@@ -3665,7 +3690,7 @@
     h.s.close();assert(h.clients.every(c=>c.ended===1));assert.equal(h.received.length,0);
     checks.push('100-replacements-bounded-active-clients-invalidate-before-synchronous-end');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('vercel-ws-shim.js?v=69'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('vercel-ws-shim.js?v=70'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V66 UNIT METRICS '+JSON.stringify({checks,clientsAfterDelayedClose:0,staleDelivered:0,activeClientsMax:2,replacements:100}));
   recordResult('ADIM-5.V66','MQTT loader/client/suback/timer ownership across route, close and native takeover; bounded replacement; cache66',true);console.log('V66 UNIT PASS');
@@ -3739,8 +3764,8 @@
   let now=1000;const sessions=new Map(),revoked=new Set(),sockets=new Set(),removed=[];
   const g={Date:{now:()=>now},AUTH_TOKEN_VALUE:'static-root',activeAuthSessions:sessions,revokedAuthTokens:revoked,wss:{clients:sockets},db:{tours:[]},
     clearTimeout:j=>{if(j)j.cancelled=true;},removeClientFromRoom:(room,id,grace)=>{removed.push({id,grace});room.clients.delete(id);}};
-  vm.createContext(g);vm.runInContext(['isValidAuthToken','revokeAuthToken','refreshRysNativeAuth','clearRysHandoff','validateRysHandoff','processClientJsonMessageV49'].map(pick).join('\n'),g);
-  const grant=(token,expiresAt=10000)=>sessions.set(token,{expiresAt});
+  vm.createContext(g);installV70AuthFixture(g);vm.runInContext(['isValidAuthToken','revokeAuthToken','refreshRysNativeAuth','clearRysHandoff','validateRysHandoff','processClientJsonMessageV49'].map(pick).join('\n'),g);
+  const grant=(token,expiresAt=10000)=>sessions.set(token,{expiresAt,user:{role:'agency_admin',assignedTour:null}});
   const member=(id,token,role='guide',extra={})=>{const ws={isAuthenticated:true,isAdmin:false,familyTourCode:null,terminated:0,terminate(){this.terminated++;}},
     room=role?{clients:new Map([[id,{role}]])}:null,ctx={clientId:id,ws,currentRoom:room,isAuthenticated:true,rysAuthToken:token,...extra};
     ws.rysAuthContext=ctx;sockets.add(ws);return ctx;};
@@ -3787,7 +3812,7 @@
     sockets.clear();const idle=member('idle-expired','json-expired');g.heartbeat();assert.equal(idle.ws.terminated,1);assert.equal(idle.currentRoom,null);
     checks.push('real-binary-and-JSON-ingress-reject-expired-credentials-idle-heartbeat-cleans-membership');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('vercel-ws-shim.js?v=69'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('vercel-ws-shim.js?v=70'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V67 UNIT METRICS '+JSON.stringify({checks,expiredGuidePresent:false,expiryGraceMs:0,revokedGuideTerminated:1,revokedAdminTerminated:1,healthyTerminated:0,publicFamilyTerminated:0,cancelledPrepare:true}));
   recordResult('ADIM-5.V67','Native live credential expiry/revoke, token rotation, pending handoff cleanup, public-family isolation and HTTP/static compatibility; cache67',true);console.log('V67 UNIT PASS');
@@ -3873,11 +3898,11 @@
     getTourSteps:()=>[],computeJourneyStats:()=>({}),broadcastToAdmins(){},broadcastToFamilyTrackers(){},broadcastToRoom:(r,p)=>events.push({room:r.roomId,message:p}),broadcastRoomState(){},removeClientFromRoom:(r,id)=>r.clients.delete(id),clearTimeout(){}};
   function pick(name){const m=new RegExp('^function '+name+'\\(','m').exec(source);assert(m,'V68 missing '+name);
     for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const code=source.slice(m.index,end+1);try{new vm.Script(code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V68 unterminated '+name);}
-  vm.createContext(g);vm.runInContext(['serializeRoom','sendRysSubscriptionAck','getTargetBroadcastRooms','setRysAudioSource','evaluateTourGuidePresence','acceptRysAudioState','processClientJsonMessage','processClientJsonMessageV49'].map(pick).join('\n'),g);
+  vm.createContext(g);installV70AuthFixture(g);vm.runInContext(['serializeRoom','sendRysSubscriptionAck','getTargetBroadcastRooms','setRysAudioSource','evaluateTourGuidePresence','acceptRysAudioState','processClientJsonMessage','processClientJsonMessageV49'].map(pick).join('\n'),g);
   const context=(id,http=false)=>({clientId:id,currentRoom:null,isAuthenticated:false,ws:{isHttpRelay:http,isAuthenticated:false,readyState:1,terminated:0,messages:[],
     send(raw){this.messages.push(JSON.parse(raw));},terminate(){this.terminated++;this.readyState=3;}}});
   const seed=(id,role,deviceId,options={})=>{const c=context(id,!!options.http),r=room(options.roomId||'genel');
-    c.currentRoom=r;c.isAuthenticated=role==='guide';c.ws.isAuthenticated=c.isAuthenticated;
+    c.currentRoom=r;c.rysAuthToken=role==='guide'?'good':null;c.isAuthenticated=role==='guide';c.ws.isAuthenticated=c.isAuthenticated;
     r.clients.set(id,{id,ws:c.ws,role,deviceId,name:options.name||id,audioSourceId:role==='guide'?'page':null,lang:'tr'});
     if(role==='guide')r.activePublisherClientId=id;
     if(options.http){c.relayKey=options.legacy?undefined:'a'.repeat(48);c.relayRetired=false;sessions.set(id,c);}
@@ -3947,7 +3972,7 @@
     assert.equal(h.room('siyer').audioSourceId,'page');assert.equal(h.room('siyer').audioMediaEpoch,10);assert.equal(h.room('siyer').isLive,true);
     checks.push('dedicated-guide-downgrade-restores-General-source-state-epoch-inheritance');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('vercel-ws-shim.js?v=69'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('vercel-ws-shim.js?v=70'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V68 UNIT METRICS '+JSON.stringify({checks,collisionCases,crossRoleGuideEvictions:0,downgradeOwner:null,sameRoleReconnect:true,terminalStop:true,coveredByGenel:true}));
   recordResult('ADIM-5.V68','Role-isolated device dedup; native/HTTP/legacy collisions; same-role reconnect; same-socket downgrade/owner release/terminal stop and General inheritance; cache68',true);console.log('V68 UNIT PASS');
@@ -4128,7 +4153,7 @@
     assert.equal(h.room().activePublisherClientId,null);assert(h.room('target').clients.has('current'));
     checks.push('cross-tour-prior-guide-removal-does-not-suppress-target-tour-reconciliation');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v69'));assert(sw.includes('vercel-ws-shim.js?v=69'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('vercel-ws-shim.js?v=70'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V69 UNIT METRICS '+JSON.stringify({checks,vacatedOwners:0,reconciliationsPerAffectedTour:1,sameRoomTerminalControls:0,generalControllerReady:true,crossTourSync:true}));
   recordResult('ADIM-5.V69','Cross-room guide replacement owner cleanup; terminal/General reconciliation after membership install; same-room continuity; existing-context and duplicate-room coverage; cache69',true);console.log('V69 UNIT PASS');
@@ -4226,6 +4251,232 @@
   }
 }
 
+
+async function runStep5V70AudioChecks(){
+  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8');
+  const server=read('server.js'),shim=read('public/vercel-ws-shim.js'),guide=read('public/rehber.html'),checks=[];
+  {
+    const h=createV68MembershipHarness(server),g=h.g;
+    g.crypto=require('node:crypto');g.Buffer=Buffer;g.revokedAuthTokens=new Set();
+    g.activeAuthSessions.set('scoped',{expiresAt:Date.now()+60000,user:{role:'agency',assignedTour:'T'}});
+    vm.runInContext(['isValidAuthToken','validateRysHandoff','applyRysRelayAuth','syncRysRelayJoin','syncRysRelayContext','rysCanonical','rysTopicSegment','rysMqttTopic','rysMintMqtt','rysVerifyMqtt'].map(n=>v70Pick(server,n)).join('\n'),g);
+    const denied=h.join(h.context('denied'),{role:'guide',tourCode:'OTHER',token:'scoped'});
+    assert.equal(denied.currentRoom,null);assert(denied.ws.messages.some(m=>m.type==='auth-error'));
+    g.processClientJsonMessageV49(denied,{type:'admin-subscribe',token:'scoped'});
+    assert.equal(denied.ws.isAdmin,false);assert(!denied.ws.messages.some(m=>m.rooms));
+    assert.equal(g.validateRysHandoff(denied,{type:'join',role:'guide',tourCode:'OTHER',token:'scoped'}),'scope-required');
+    assert.equal(g.applyRysRelayAuth(denied,{headers:{}},'scoped',{type:'admin-subscribe'}),false);
+    assert.equal(g.applyRysRelayAuth(denied,{headers:{}},'scoped',{type:'join',role:'guide',tourCode:'OTHER'}),false);
+    const issuer=h.join(h.context('issuer',true),{role:'guide',audioSourceId:'page',token:'scoped'});
+    h.sessions.set(issuer.clientId,issuer);issuer.lastSeen=Date.now();
+    const room=h.room();Object.assign(room,{audioSourceId:'page',audioStateKnown:true,audioStateSeq:2,audioMediaEpoch:2,isLive:true});
+    const receiver=h.seed('receiver','pilgrim','receiver-device');
+    const pcm={type:'audio-chunk',seq:7,sampleRate:24000,pcm16:Buffer.alloc(960,13).toString('base64'),audioSourceId:'page',audioMediaEpoch:2};
+    g.rysMintMqtt(issuer,room,pcm);const frame=issuer.mqttPublications.at(-1);
+    assert(frame&&frame.proof.length===64);assert(!JSON.stringify(frame).includes(pcm.pcm16),'Public broker must not expose clear PCM');
+    const clone=()=>JSON.parse(JSON.stringify(frame));
+    for(const mutate of [
+      f=>{f.seq=8;},f=>{f.payload.data='A'+f.payload.data.slice(1);},
+      f=>{f.type='stream-state';f.payload={isLive:false};},f=>{f.tourCode='OTHER';},
+      f=>{f.source='attacker';},f=>{f.epoch=99;},f=>{f.proof='0'.repeat(64);}
+    ]){const f=clone();mutate(f);assert.equal(g.rysVerifyMqtt(receiver,f),null);}
+    const good=g.rysVerifyMqtt(receiver,frame);assert.equal(good.seq,7);assert.equal(good.pcm16,pcm.pcm16);
+    assert.equal(g.rysVerifyMqtt(receiver,frame),null,'Proof replay must be bounded and deduplicated');
+    g.rysMintMqtt(issuer,room,{type:'stream-state',isLive:false,audioStateSeq:2,audioMediaEpoch:2,audioSourceId:'page'});
+    const stop=issuer.mqttPublications.at(-1);
+    issuer.rysAuthToken='good';assert.equal(g.rysVerifyMqtt(receiver,stop),null,'A new valid credential must not resurrect the prior grant');issuer.rysAuthToken='scoped';
+    g.Date=class extends Date{static now(){return stop.expiresAt+1;}};
+    assert.equal(g.rysVerifyMqtt(receiver,stop),null,'Expired proof must fail');g.Date=Date;
+    g.activeAuthSessions.delete('scoped');
+    assert.equal(g.rysVerifyMqtt(receiver,stop),null,'Revocation must apply at delivery, even to an already signed stop');
+    const before=h.events.length;g.processClientJsonMessageV49(issuer,{type:'guide-stream-state',isLive:true,audioStateSeq:3,audioMediaEpoch:3});
+    assert.equal(h.events.length,before);
+    assert.notEqual(g.rysMqttTopic('RY-A','genel'),g.rysMqttTopic('RYA','genel'));
+    assert.notEqual(g.rysMqttTopic('RY-A','a/b'),g.rysMqttTopic('RY-A','a%2Fb'));
+    assert.notEqual(g.rysMqttTopic('RY-A','A'),g.rysMqttTopic('RY-A','a'));
+    assert.notEqual(g.rysMqttTopic('RY-A','\ud800'),g.rysMqttTopic('RY-A','\ud801'));
+    assert.notEqual(g.rysMqttTopic('RY-A','\ud800'),g.rysMqttTopic('RY-A','j\ud800'));
+    const topics=createV66MqttHarness(shim);for(const room of ['genel','a/b','a%2Fb','A','a','\ud800','\ud801']){
+      topics.init({tourCode:' ry-a ',roomId:room,role:'pilgrim'});topics.load();
+      assert.equal(topics.s._mqttTopic,g.rysMqttTopic('RY-A',room));
+    }topics.s.close();
+    const legacy=h.seed('legacy-displaced','guide','legacy-device',{http:true,legacy:true,name:'Legacy guide'});
+    h.join(h.context('legacy-replacement'),{role:'guide',name:'Legacy guide',audioSourceId:'legacy-new-page',token:'good'});
+    assert.equal(legacy.relayRetired,true);assert.equal(legacy.relayRetiredReason,'replaced');
+    const routeSession=h.seed('old-private-route','guide','route-device',{http:true});routeSession.outbox=[{message:{type:'room-state',room:{tourCode:'OLD',connectedPilgrims:[{phone:'old-private'}]}}}];
+    assert(g.syncRysRelayContext(routeSession,{type:'join',role:'pilgrim',tourCode:'T',roomId:'new-public-room',pin:'6068'}));
+    assert.equal(routeSession.outbox.length,0);
+    routeSession.outbox.push({message:{private:'old-principal'}});
+    assert(g.applyRysRelayAuth(routeSession,{headers:{}},null,{type:'join',role:'pilgrim',tourCode:'T',roomId:'new-public-room'}));
+    assert.equal(routeSession.outbox.length,0);
+    checks.push('real-principal-scope-admin-handoff-HTTP-revoke; encrypted-full-body-proof-tamper-replay; collision-free-topics;legacy-guide-terminal-retirement;private-outbox-route-and-credential-fence');
+  }
+  {
+    const h=createV66MqttHarness(shim),s=h.s;
+    h.init({type:'join',role:'guide',tourCode:'RY-A',roomId:'genel'});h.load();
+    let now=Date.now();h.g.Date=class extends Date{static now(){return now;}};
+    const raw={type:'p2p-pilgrim-hello',clientId:'fake',phone:'private-synthetic-phone'};
+    for(let i=0;i<1200;i++){
+      h.clients[0].handlers.message(s._mqttTopic,Buffer.from(JSON.stringify({...raw,clientId:'fake-'+i})));
+      s._handleCloudBusMessage({...raw,clientId:'fake-'+i});
+    }
+    assert.equal(s._pilgrimMeta.size,0);assert.equal(h.received.length,0);
+    const people=n=>Array.from({length:n},(_,i)=>({id:'id-'+i,name:'Guest '+i,phone:'private-synthetic-phone',lang:'tr'}));
+    const snapshot=n=>s._observeTrustedMessage({type:'room-state',room:{tourCode:'RY-A',roomId:'genel',connectedPilgrims:people(n)}});
+    snapshot(1200);assert(s._pilgrimMeta.size<=512);assert(Buffer.byteLength(JSON.stringify([...s._pilgrimMeta.values()]))<=262144);
+    snapshot(300);assert.equal(s._pilgrimMeta.size,300);
+    const publicStates=[];const publish=s._publishMqtt;s._publishMqtt=m=>publicStates.push(m);
+    s._broadcastP2PRoomState();h.jobs.find(j=>j===s._roomStateTimer).fn();s._publishMqtt=publish;
+    assert.equal(publicStates.length,1);assert.equal(publicStates[0].room.connectedPilgrims.length,0);
+    assert(!JSON.stringify(publicStates).includes('private-synthetic-phone'));assert(Buffer.byteLength(JSON.stringify(publicStates[0]))<=16384);
+    assert.equal(s._pilgrimMeta.size,300,'Local authorized snapshot must not erase or self-refresh presence');
+    for(let i=0;i<3;i++){now+=90000;snapshot(300);s._prunePresence();assert.equal(s._pilgrimMeta.size,300);}
+    snapshot(299);assert.equal(s._pilgrimMeta.size,299);assert(!s._pilgrimMeta.has('id-299'));
+    now+=120001;s._prunePresence();assert.equal(s._pilgrimMeta.size,0);
+    for(const update of [{tourCode:'RYA'},{roomId:'other'},{role:'pilgrim'},{token:'new-authority'}]){
+      s._joinContext={type:'join',role:'guide',tourCode:'RY-A',roomId:'genel'};snapshot(300);
+      s.send(JSON.stringify({...s._joinContext,...update}));assert.equal(s._pilgrimMeta.size,0);
+      assert(!h.published.some(p=>JSON.stringify(p).includes('private-synthetic-phone')));
+    }
+    for(let i=0;i<1200;i++)h.clients.at(-1).handlers.message(s._mqttTopic,Buffer.from(JSON.stringify({version:70,topic:s._mqttTopic,proof:i.toString(16).padStart(64,'0'),payload:raw})));
+    assert((s._mqttInbox||[]).length<=16);assert.equal(s._pilgrimMeta.size,0);
+    s._fenceReplaced();assert.equal(s.readyState,3);assert.equal(s._pilgrimMeta.size,0);assert.equal(s._mqttInbox.length,0);
+    checks.push('1200-forged-hellos-zero-presence;512/256KiB-cap;300-quiet-renewals;TTL/leave;route-role-authority-clear;bounded-inbox');
+  }
+  {
+    const h=createV60GuideHarness(guide),g=h.g,stream=h.stream('fenced-mic');
+    g.micStream=stream;g.isMicBroadcasting=true;g.isDemoBroadcasting=true;g.guideDemoGeneration=1;
+    g.demoInterval=1;g.guideWsReconnectTimer=1;g.clearInterval=()=>{};
+    vm.runInContext(v70Pick(guide,'fenceGuideSession')+'\n'+v70Pick(guide,'connectGuideWs'),g);
+    g.fenceGuideSession();assert.equal(stream.track.stops,1);assert.equal(g.isMicBroadcasting,false);assert.equal(g.isDemoBroadcasting,false);
+    g.connectGuideWs();assert.equal(g.ws,null);assert.equal(g.guideWsReconnectTimer,null);
+    const jobs=[],sockets=[],b={ws:null,guideWsReconnectTimer:null,isMicBroadcasting:true,isDemoBroadcasting:false,
+      window:{location:{protocol:'http:',host:'localhost'}},Blob,WebSocket:class{constructor(){sockets.push(this);}close(){}},
+      sendGuideJoinAndSync(){},stopMicBroadcast(){b.isMicBroadcasting=false;},guideDemoGeneration:0,demoInterval:null,clearInterval(){},
+      document:{getElementById:()=>null},setTimeout:(fn,ms)=>{const j={fn,ms};jobs.push(j);return j;},clearTimeout:j=>{if(j)j.cancelled=true;},console:{warn(){},error(){}}};
+    vm.createContext(b);vm.runInContext(['fenceGuideSession','connectGuideWs'].map(n=>v70Pick(guide,n)).join('\n'),b);
+    b.connectGuideWs();b.ws.onclose({code:1006});assert.equal(jobs.at(-1).ms,600);
+    b.isMicBroadcasting=false;b.ws.onclose({code:1006});assert.equal(jobs.at(-1).ms,1500);
+    b.isMicBroadcasting=true;const n=jobs.length;b.ws.onclose({code:4009});
+    assert.equal(jobs.length,n);b.connectGuideWs();assert.equal(sockets.length,1);assert(b.window.ryGuideSessionReplaced);
+    const http=createV66MqttHarness(shim,{fetch:async()=>({ok:false,status:409,json:async()=>({error:'relay-session-retired',reason:'replaced'})})});
+    http.init({type:'join',role:'guide',tourCode:'T',roomId:'genel'});Object.assign(http.s,{_inFlight:false,_relayClientId:'rys56-retired',_relayKey:'b'.repeat(48)});
+    await http.s._flushAndPoll();assert(http.s._replaced);assert.equal(http.s.readyState,3);assert.equal(http.s._sendQueue.length,0);
+    checks.push('4009-and-HTTP409-terminal-capture-release-no-reconnect;1006-active600ms-idle1500ms-preserved');
+  }
+  console.log('V70 UNIT METRICS '+JSON.stringify({checks,forgedAccepted:0,stalePresence:0,quietActive:300,metaCap:512,metaBudget:262144,inboxCap:16}));
+  recordResult('ADIM-5.V70','Principal/scope; encrypted MQTT proof/tamper/revoke/replay; canonical topics; bounded private presence/TTL; capture fencing and genuine network retry',true);
+  console.log('V70 UNIT PASS');
+}
+
+
+async function runV70SecurityChecks({baseUrl,url,token,credentials}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),stamp=Date.now().toString(36).toUpperCase();
+  const a='RY-V70-'+stamp,b=a.replaceAll('-',''),caps=[],sockets=[],created=[],issued=[];
+  const rootHeaders={'Content-Type':'application/json',Authorization:'Bearer '+token};
+  const headers={'Content-Type':'application/json'};
+  const until=async(test,label)=>{const end=Date.now()+6000;while(!test()){if(Date.now()>end)throw Error('V70 deadline '+label);await new Promise(r=>setTimeout(r,5));}};
+  const relay=async(body,status=200)=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
+  const open=async()=>{const v=await relay({type:'relay-open',version:56}),cap={clientId:v.clientId,relayKey:v.relayKey,seq:0};caps.push(cap);return cap;};
+  const poll=(cap,context,messages=[],extra={},status=200)=>relay({clientId:cap.clientId,relayKey:cap.relayKey,requestSeq:++cap.seq,subscriptionContext:context,messages,...extra},status);
+  const login=async(value)=>{const r=await fetch(baseUrl+'/api/login',{method:'POST',headers,body:JSON.stringify(value)});assert.equal(r.status,200);const v=await r.json();issued.push(v.token);return v.token;};
+  const connect=async()=>{const ws=new WebSocket(url);ws.messages=[];sockets.push(ws);ws.on('error',()=>{});ws.on('close',(code,reason)=>{ws.closeCode=code;ws.closeReason=reason.toString();});
+    ws.on('message',(raw,binary)=>{if(!binary)ws.messages.push(JSON.parse(raw));});await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;};
+  const send=async(ws,m,type)=>{const n=ws.messages.length;ws.send(JSON.stringify(m));await until(()=>ws.messages.slice(n).some(v=>v.type===type),type);return ws.messages.slice(n).find(v=>v.type===type);};
+  const metrics={};let h;
+  try{
+    for(const code of [a,b]){
+      const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers:rootHeaders,body:JSON.stringify({code,name:'V70 security fixture',pin:'6070'})});
+      assert.equal(r.status,200);await r.arrayBuffer();created.push(code);
+    }
+    const scoped=await login({email:'selamet',password:process.env.SELAMET_PASSWORD||'selamet2026'});
+    const agency=await connect(),own={type:'join',role:'guide',tourCode:'RY-KASIM',roomId:'v70-'+stamp,name:'V70 scoped '+stamp,audioSourceId:'scope-page',token:scoped};
+    await send(agency,own,'joined');
+    await send(agency,{...own,tourCode:a},'auth-error');
+    await send(agency,{type:'admin-subscribe',token:scoped},'auth-error');
+    assert(!agency.messages.some(m=>m.type==='admin-rooms-update'));
+    const probe=await connect();
+    await send(probe,{type:'handoff-prepare',subscription:{...own,tourCode:a}},'handoff-error');
+    const denied=await open();await poll(denied,{...own,tourCode:b},[],{token:scoped},401);
+    const deniedAdmin=await open();await poll(deniedAdmin,{type:'admin-subscribe',token:scoped},[],{token:scoped},401);
+    const ownHttp=await open();const ownAck=await poll(ownHttp,{...own,name:'V70 scoped HTTP '+stamp,deviceId:'different',roomId:'v70-http-'+stamp},[],{token:scoped});
+    assert(ownAck.messages.some(m=>m.type==='joined'));
+    metrics.scope={ownNative:true,ownHttp:true,otherNativeDenied:true,otherHttp401:true,adminDenied:true,handoffDenied:true};
+
+    const credential=await login(credentials),publisher=await open(),listener=await open(),other=await open(),sub=await open();
+    const guide={type:'join',role:'guide',tourCode:a,roomId:'genel',name:'V70 signed publisher',audioSourceId:'v70-proof-page',token:credential};
+    const listen=code=>({type:'join',role:'pilgrim',tourCode:code,roomId:'genel',name:'V70 listener',pin:'6070'});
+    const joined=await poll(listener,listen(a));await poll(other,listen(b));await poll(sub,{...listen(a),roomId:'siyer'});await poll(publisher,guide,[],{token:credential});
+    h=createV61ListenerHarness(fs.readFileSync(path.join(PUBLIC_DIR,'dinle.html'),'utf8'),fs.readFileSync(path.join(PUBLIC_DIR,'pcm-player-worklet.js'),'utf8'));
+    const receiver=h.connect(a);for(const m of joined.messages)receiver.onmessage({data:JSON.stringify(m)});
+    const state={type:'guide-stream-state',isLive:true,broadcastMode:'mic',audioStateSeq:10,audioMediaEpoch:10,topic:'V70 signed audio'};
+    await poll(publisher,guide,[state],{token:credential});
+    const controls=await poll(listener,listen(a));for(const m of controls.messages)receiver.onmessage({data:JSON.stringify(m)});
+    const pcm=Buffer.alloc(960,17),audio=seq=>({type:'audio-chunk',seq,sampleRate:24000,audioSourceId:'v70-proof-page',audioMediaEpoch:10,sentAt:Date.now(),pcm16:pcm.toString('base64')});
+    const sent=await poll(publisher,guide,[audio(70)],{token:credential});
+    const proof=sent.mqttPublications.find(f=>f.type==='audio-chunk');assert(proof&&proof.topic.includes(encodeURIComponent(a)));
+    assert(!JSON.stringify(proof).includes(pcm.toString('base64')));
+    const nativeRoute=await poll(listener,listen(a));assert(nativeRoute.messages.some(m=>m.type==='audio-chunk'&&m.seq===70));
+    const clone=()=>JSON.parse(JSON.stringify(proof));
+    const forged=[{type:'stream-state',isLive:false},{type:'audio-chunk',seq:999,pcm16:pcm.toString('base64')}];
+    const changed=clone();changed.seq=999;forged.push(changed);
+    const body=clone();body.payload.data=body.payload.data.slice(0,-4)+'AAAA';forged.push(body);
+    const stop=clone();stop.type='stream-state';stop.payload={isLive:false};forged.push(stop);
+    const route=clone();route.roomId='elsewhere';forged.push(route);
+    const rejected=await poll(listener,listen(a),[],{mqttFrames:forged});
+    assert(!rejected.messages.some(m=>m.type==='audio-chunk'||m.type==='stream-state'&&m.isLive===false));
+    assert.equal(h.g.rxStreamActive,true);
+    const wrong=await poll(other,listen(b),[],{mqttFrames:[proof]});assert(!wrong.messages.some(m=>m.type==='audio-chunk'));
+    const shim=fs.readFileSync(path.join(PUBLIC_DIR,'vercel-ws-shim.js'),'utf8');
+    const tx=createV66MqttHarness(shim),rx=createV66MqttHarness(shim,{fetch:(route,options)=>fetch(baseUrl+route,options),onmessage:e=>receiver.onmessage(e)});
+    tx.init(guide);tx.load();tx.s._publishMqtt(proof);assert.equal(tx.published.length,2);
+    rx.init(listen(a));rx.load();Object.assign(rx.s,{_inFlight:false,_relayClientId:listener.clientId,_relayKey:listener.relayKey,_relayRequestSeq:listener.seq});
+    rx.clients[0].handlers.message(proof.topic,Buffer.from(JSON.stringify(tx.published[0].message)));
+    assert.equal(rx.received.length,0,'Broker callback must not directly play even a server-produced frame');
+    await rx.s._flushAndPoll();listener.seq=rx.s._relayRequestSeq;
+    const verified=rx.received.map(e=>JSON.parse(e.data)).find(m=>m.type==='audio-chunk'&&m.seq===70);
+    assert(verified&&Buffer.from(verified.pcm16,'base64').equals(pcm));tx.s.close();rx.s._relayClientId=null;rx.s._relayKey=null;rx.s.close();
+    assert(h.player.q.has(70));
+    await poll(sub,{...listen(a),roomId:'siyer'}); // Drain normal General fan-out first.
+    const inherited=await poll(sub,{...listen(a),roomId:'siyer'},[],{mqttFrames:[proof]});
+    assert(inherited.messages.some(m=>m.type==='audio-chunk'&&m.seq===70),'General proof must reach a covered subroom');
+    const replay=await poll(listener,listen(a),[],{mqttFrames:[proof]});assert(!replay.messages.some(m=>m.type==='audio-chunk'));
+    const fresh=await poll(publisher,guide,[audio(71)],{token:credential});
+    const revokedProof=fresh.mqttPublications.find(f=>f.type==='audio-chunk');assert(revokedProof);
+    await poll(listener,{...listen(a),phone:'private-v70-phone'}); // Queue a guide-only private snapshot before downgrade.
+    await new Promise(r=>setTimeout(r,200));
+    const logout=await fetch(baseUrl+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+credential}});assert.equal(logout.status,200);await logout.arrayBuffer();
+    const revoked=await poll(listener,listen(a),[],{mqttFrames:[revokedProof]});assert(!revoked.messages.some(m=>m.type==='audio-chunk'&&m.seq===71));
+    const downgraded=await poll(publisher,listen(b));
+    assert(!JSON.stringify(downgraded).includes('private-v70-phone'));
+    assert(!downgraded.messages.some(m=>m.room?.tourCode===a),'Old private room-state must not cross the new public subscription');
+    metrics.mqtt={validPcmSeq:70,pcmEqual:true,forgedAccepted:0,wrongTourAccepted:0,replayedAccepted:0,revokedAccepted:0,clearPcmOnBroker:false,generalFallbackVerified:true,oldPrivateOutboxLeak:0};
+
+    const first=await connect(),second=await connect(),owner={type:'join',role:'guide',tourCode:a,roomId:'owner',name:'V70 same guide',audioSourceId:'first-page',token};
+    await send(first,owner,'joined');await send(second,{...owner,audioSourceId:'second-page'},'joined');
+    await until(()=>first.closeCode!==undefined,'terminal replacement');
+    assert.equal(first.closeCode,4009);assert(first.messages.some(m=>m.type==='session-replaced'));assert.equal(second.readyState,WebSocket.OPEN);
+    const oldHttp=await open(),httpJoin={...owner,roomId:'http-owner',name:'V70 HTTP same guide'};
+    await poll(oldHttp,httpJoin,[],{token});const replacement=await connect();await send(replacement,{...httpJoin,audioSourceId:'new-http-owner'},'joined');
+    const retired=await poll(oldHttp,httpJoin,[],{token},409);assert.equal(retired.reason,'replaced');
+    const legacyId='v70-legacy-'+stamp,legacyJoin={...owner,roomId:'legacy-owner',name:'V70 legacy same guide'};
+    await relay({clientId:legacyId,subscriptionContext:legacyJoin,token});
+    const legacyReplacement=await connect();await send(legacyReplacement,{...legacyJoin,audioSourceId:'legacy-new-owner'},'joined');
+    const legacyRetired=await relay({clientId:legacyId,subscriptionContext:legacyJoin,token},409);assert.equal(legacyRetired.reason,'replaced');
+    const deltaCount=agency.messages.filter(m=>m.type==='admin-rooms-update').length;
+    assert.equal(deltaCount,0,'Scoped admin rejection must also prevent later private deltas');
+    metrics.replacement={nativeClose:4009,nativeTerminalNotice:true,httpStatus:409,httpReason:retired.reason,legacyHttpStatus:409,scopedAdminDeltas:deltaCount};
+    console.log('V70 E2E METRICS '+JSON.stringify(metrics));
+    recordResult('ADIM-3.V70','Real scoped login/native/HTTP/handoff; encrypted MQTT proof round-trip into player with tamper/revoke/route/replay rejection; terminal native/HTTP guide replacement',true);
+    console.log('V70 E2E PASS');
+  }finally{
+    h?.g.leaveRoom();for(const ws of sockets)try{ws.terminate();}catch(e){}
+    for(const cap of caps)try{await relay({clientId:cap.clientId,relayKey:cap.relayKey,type:'relay-close',version:56});}catch(e){}
+    for(const value of issued)try{const r=await fetch(baseUrl+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+value}});await r.arrayBuffer();}catch(e){}
+    for(const code of created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:rootHeaders});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -4249,6 +4500,7 @@
     await runStep5V67AudioChecks();
     await runStep5V68AudioChecks();
     await runStep5V69AudioChecks();
+    await runStep5V70AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=69"></script>
+  <script src="/vercel-ws-shim.js?v=70"></script>
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
-  <script src="/vercel-ws-shim.js?v=69"></script>
+  <script src="/vercel-ws-shim.js?v=70"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -2653,7 +2653,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=69').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=70').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=69"></script>
+  <script src="/vercel-ws-shim.js?v=70"></script>
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
-  <script src="/vercel-ws-shim.js?v=69"></script>
+  <script src="/vercel-ws-shim.js?v=70"></script>
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
-  <script src="/vercel-ws-shim.js?v=69"></script>
+  <script src="/vercel-ws-shim.js?v=70"></script>
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
-  <script src="/vercel-ws-shim.js?v=69"></script>
+  <script src="/vercel-ws-shim.js?v=70"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
     .console-wrap {
@@ -734,7 +734,17 @@
       }
     }
 
+    function fenceGuideSession(){
+      if(window.ryGuideSessionReplaced)return;
+      window.ryGuideSessionReplaced=true;
+      clearTimeout(guideWsReconnectTimer);guideWsReconnectTimer=null;
+      isDemoBroadcasting=false;++guideDemoGeneration;clearInterval(demoInterval);demoInterval=null;
+      stopMicBroadcast();
+      const label=document.getElementById('micSourceLabel');
+      if(label)label.textContent='Yayın başka bir sekmede devralındı. Yeniden devralmak için sayfayı yenileyin.';
+    }
     function connectGuideWs() {
+      if(window.ryGuideSessionReplaced)return;
       if (guideWsReconnectTimer) {
         clearTimeout(guideWsReconnectTimer);
         guideWsReconnectTimer = null;
@@ -770,6 +780,7 @@
           return;
         }
 
+        if(msg.type==='session-replaced'){fenceGuideSession();return;}
         if (msg.type === 'joined' || msg.type === 'room-state') {
           renderRoomState(msg.room);
           if (msg.steps) renderGuideStepsList(msg.steps);
@@ -809,8 +820,10 @@
         }
       };
 
-      ws.onclose = () => {
+      ws.onclose = (ev) => {
         if(!current())return;
+        if(ev?.code===4009){fenceGuideSession();return;}
+        if(window.ryGuideSessionReplaced)return;
         const retryMs = isMicBroadcasting || isDemoBroadcasting ? 600 : 1500;
         console.warn(`Rehber bağlantısı kapandı, ${retryMs} ms içinde otomatik yeniden bağlanılacak...`);
         if (guideWsReconnectTimer) clearTimeout(guideWsReconnectTimer);
@@ -1767,6 +1780,7 @@
     }
 
     function guideBackgroundHeartbeatTick() {
+      if(window.ryGuideSessionReplaced)return;
       if (isMicBroadcasting) {
         healGuideMicrophoneIfNeeded();
         const el = document.getElementById('guideBgKeepAliveAudio');
@@ -1893,6 +1907,7 @@
     }
 
     async function toggleMicBroadcast() {
+      if(window.ryGuideSessionReplaced)return;
       const btn = document.getElementById('startMicBtn');
       if (isMicBroadcasting || guideMicStarting) {
         stopMicBroadcast();
@@ -2029,6 +2044,7 @@
 
     // Demo Audio Broadcast (Works without physical mic)
     function toggleDemoBroadcast() {
+      if(window.ryGuideSessionReplaced)return;
       if(isVoiceLoopbackTesting)return;
       if(guideMicStarting)stopMicBroadcast();
       const btn = document.getElementById('startDemoStreamBtn');
diff --git a/public/rota.html b/public/rota.html
--- a/public/rota.html
+++ b/public/rota.html
@@ -9,7 +9,7 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=69"></script>
+  <script src="/vercel-ws-shim.js?v=70"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v69';
+const CACHE_NAME = 'ridvanses-pwa-v70';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=69',
+  '/vercel-ws-shim.js?v=70',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
   '/pcm-player-worklet.js?v=61-audio',
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -234,6 +234,9 @@
 
       this._native.onmessage = (ev) => {
         if (this._isRelay) return;
+        if(typeof ev.data==='string'){try{const msg=JSON.parse(ev.data);
+          if(msg.type==='session-replaced'){this._fenceReplaced();return;}
+          this._observeTrustedMessage(msg);}catch(e){}}
         if (typeof this.onmessage === 'function') this.onmessage(ev);
       };
 
@@ -246,6 +249,7 @@
 
       this._native.onclose = (ev) => {
         clearTimeout(fallbackTimeout);
+        if(ev.code===4009){this._fenceReplaced();return;}
         if (!this._isRelay) {
           if (!this._opened) {
             window.__ryConsecutiveVdsFailures = (window.__ryConsecutiveVdsFailures || 0) + 1;
@@ -390,8 +394,47 @@
       };
     }
 
+
+    _clearPresence(){
+      this._pilgrimMeta?.clear();this._presenceTotal=0;this._mqttInbox=[];this._busSeen?.clear();this._seenIds?.clear();
+    }
+    _prunePresence(now=Date.now()){
+      if(!this._pilgrimMeta)this._pilgrimMeta=new Map();
+      for(const [id,p] of this._pilgrimMeta)if(now-p.lastSeenAt>120000)this._pilgrimMeta.delete(id);
+      while(this._pilgrimMeta.size>512)this._pilgrimMeta.delete(this._pilgrimMeta.keys().next().value);
+    }
+    _observeTrustedMessage(msg){
+      if(msg?.type==='auth-error'){this._clearPresence();return;}
+      if(msg?._localPresence||this._joinContext?.role!=='guide'||!['joined','room-state'].includes(msg?.type))return;
+      const room=msg.room,c=this._joinContext;
+      if(!room||String(room.tourCode).toUpperCase().trim()!==String(c.tourCode||'RY-KASIM').toUpperCase().trim()||
+        String(room.roomId||'genel').trim()!==String(c.roomId||'genel').trim())return;
+      this._pilgrimMeta=new Map();let bytes=2;const now=Date.now();
+      this._presenceTotal=Number.isSafeInteger(room.totalListeners)&&room.totalListeners>=0?room.totalListeners:
+        (Array.isArray(room.connectedPilgrims)?room.connectedPilgrims.length:0);
+      for(const p of (Array.isArray(room.connectedPilgrims)?room.connectedPilgrims:[])){
+        if(this._pilgrimMeta.size>=512)break;
+        const item={id:String(p.id||'').slice(0,96),name:String(p.name||'').slice(0,48),
+          lang:String(p.lang||'tr').slice(0,8),phone:String(p.phone||'').slice(0,64),
+          roomId:String(p.roomId||'genel').slice(0,64),joinedAt:String(p.joinedAt||'').slice(0,32),lastSeenAt:now};
+        if(!item.id)continue;
+        bytes+=1+encodeURIComponent(JSON.stringify(item)).replace(/%../g,'x').length;if(bytes>262144)break;
+        this._pilgrimMeta.set(item.id,item);
+      }
+    }
+    _fenceReplaced(){
+      if(this._replaced)return;
+      this._replaced=true;this._clearPresence();this.close();
+      this.onmessage?.({data:JSON.stringify({type:'session-replaced'})});
+      this.onclose?.({code:4009,reason:'session-replaced'});
+    }
+
+    _encodeTopicSegment(value){
+      const text=String(value);
+      try{return 'u'+encodeURIComponent(text);}catch(e){return 'j'+encodeURIComponent(JSON.stringify(text));}
+    }
     _sanitizeCode(str) {
-      return String(str || 'RYKASIM').toUpperCase().replace(/[^A-Z0-9]/g, '');
+      return this._encodeTopicSegment(String(str || 'RY-KASIM').toUpperCase().trim());
     }
 
     _busConnected() {
@@ -399,6 +442,7 @@
     }
 
     _closeMqttClients() {
+      this._mqttInbox=[];
       // Invalidate pending script loads and queued callbacks before ending any client.
       this._mqttGeneration=(this._mqttGeneration||0)+1;
       if(this._roomStateTimer){clearTimeout(this._roomStateTimer);this._roomStateTimer=null;}
@@ -419,8 +463,8 @@
         if (!current()||!window.mqtt) return;
 
         const codeClean = joinMsg ? this._sanitizeCode(joinMsg.tourCode) : 'ALL';
-        const roomClean = joinMsg && joinMsg.roomId ? String(joinMsg.roomId).trim().toUpperCase() : 'GENEL';
-        const topic = `ridvanses/v2/room/${codeClean}/${roomClean}`;
+        const roomClean=this._encodeTopicSegment(String(joinMsg?.roomId||'genel').trim());
+        const topic = `ridvanses/v3/room/${codeClean}/${roomClean}`;
         this._mqttTopic = topic;
 
         // Ölçüm (30 sn, 23 paket/sn): broker.emqx.io yayıncı başına ~10 mesaj/sn ile sınırlıyor (%54 kayıp);
@@ -448,8 +492,8 @@
               client.subscribe(GLOBAL_SOS_TOPIC, { qos: 0 });
             }
             if (!joinMsg) return;
-            if (joinMsg.role !== 'guide' && roomClean !== 'GENEL') {
-              client.subscribe(`ridvanses/v2/room/${codeClean}/GENEL`, { qos: 0 });
+            if (joinMsg.role !== 'guide' && roomClean !== this._encodeTopicSegment('genel')) {
+              client.subscribe(`ridvanses/v3/room/${codeClean}/ugenel`, { qos: 0 });
             }
             client.subscribe(topic, { qos: 0 }, () => {
               if(!current())return;
@@ -476,142 +520,34 @@
           client.on('message', (t, payloadBuf) => {
             if(!current())return;
             try {
-              const msg = JSON.parse(payloadBuf.toString());
-              if (!msg || msg.senderClientId === this._clientId) return;
-              // KRİTİK-02: Herkese açık MQTT broker'larından gelen imzasız veya bayat (>60sn) paketleri reddet
-              const frameTs = Number(msg._ryTs) || 0;
-              if (!frameTs || Math.abs(Date.now() - frameTs) > 60000) return;
-              const expectedSig = this._computeMqttFrameSig(t, msg.type, frameTs, msg.senderClientId);
-              if (!msg._rySig || msg._rySig !== expectedSig) return;
-              // Aynı mesaj iki brokerdan da gelir: ilk geleni işle, ikincisini at
-              if (msg._msgId) {
-                if (this._busSeen.has(msg._msgId)) return;
-                this._busSeen.add(msg._msgId);
-                if (this._busSeen.size > 800) {
-                  this._busSeen.delete(this._busSeen.values().next().value);
-                }
-              }
-              if (t === GLOBAL_SOS_TOPIC) {
-                if (msg.type === 'sos-alert' || msg.type === 'sos-resolved') {
-                  this._deliverIncomingMessage(msg);
-                }
-                return;
-              }
-              this._handleCloudBusMessage(msg);
+              if(payloadBuf.length>32768)return;
+              const frame=JSON.parse(payloadBuf.toString());
+              if(frame?.version!==70||frame.topic!==t||!/^[0-9a-f]{64}$/.test(frame.proof||''))return;
+              const q=this._mqttInbox||(this._mqttInbox=[]);
+              if(q.some(f=>f.proof===frame.proof))return;
+              q.push(frame);while(q.length>16)q.shift();
             } catch {}
           });
         });
       });
     }
 
-    _computeMqttFrameSig(topic, type, ts, senderId) {
-      const raw = `ryv2|${String(topic || '')}|${String(type || '')}|${Number(ts) || 0}|${String(senderId || '')}|kabe_shield_2026`;
-      let h1 = 0x811c9dc5;
-      let h2 = 0x1505;
-      for (let i = 0; i < raw.length; i++) {
-        const c = raw.charCodeAt(i);
-        h1 ^= c;
-        h1 = Math.imul(h1, 0x01000193) >>> 0;
-        h2 = ((h2 << 5) + h2 + c) >>> 0;
-      }
-      return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
-    }
-
-    _publishMqtt(obj, customTopic = null) {
-      const targetTopic = customTopic || this._mqttTopic;
-      if (!targetTopic) return;
-      const nowTs = Date.now();
-      const sig = this._computeMqttFrameSig(targetTopic, obj && obj.type, nowTs, this._clientId);
-      const payload = JSON.stringify({ ...obj, senderClientId: this._clientId, _ryTs: nowTs, _rySig: sig });
-      for (const c of this._mqttClients) {
-        if (c && c.connected) {
-          try { c.publish(targetTopic, payload, { qos: 0 }); } catch {}
-        }
-      }
-    }
-
-    _handleCloudBusMessage(msg) {
-      const role = this._joinContext ? this._joinContext.role : 'pilgrim';
-
-      if (msg.type === 'p2p-guide-ping' && role !== 'guide' && this._joinContext) {
-        this._publishMqtt({
-          _msgId: 'hello-' + this._clientId + '-' + Date.now(),
-          type: 'p2p-pilgrim-hello',
-          clientId: this._clientId,
-          name: this._joinContext.name || 'Hacı Misafir',
-          phone: this._joinContext.phone || '',
-          lang: this._joinContext.lang || 'tr',
-          joinedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
-        });
-        return;
-      }
-
-      if (role === 'guide') {
-        if (msg.type === 'p2p-pilgrim-hello') {
-          const cid = msg.clientId || msg.senderClientId;
-          this._pilgrimMeta.set(cid, {
-            id: cid,
-            name: msg.name || 'Hacı Misafir',
-            phone: msg.phone || '',
-            lang: msg.lang || 'tr',
-            roomId: msg.roomId || 'genel',
-            joinedAt: msg.joinedAt || 'Şimdi'
-          });
-          this._broadcastP2PRoomState();
-          return;
-        }
-
-        if (msg.type === 'sos-trigger') {
-          const cid = msg.senderClientId;
-          const p = this._pilgrimMeta.get(cid);
-          const alertItem = {
-            id: msg.alertId || ('sos-' + Date.now()),
-            tourCode: msg.tourCode || (this._joinContext ? this._joinContext.tourCode : 'RY-KASIM'),
-            pilgrimName: msg.pilgrimName || (p ? p.name : 'Hacı Misafir'),
-            phone: msg.phone || (p && p.phone) || '+90 538 399 96 66',
-            lat: Number(msg.lat) || 21.4225,
-            lng: Number(msg.lng) || 39.8262,
-            accuracy: msg.accuracy || null,
-            locationNote: msg.locationNote || 'Canlı Cihaz GPS Konumu',
-            createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
-            status: 'active'
-          };
-          this._deliverIncomingMessage({
-            _msgId: msg._msgId,
-            type: 'sos-alert',
-            alert: alertItem
-          });
-          return;
-        }
-
-        if (
-          msg.type === 'new-announcement' ||
-          msg.type === 'announcement-deleted' ||
-          msg.type === 'steps-updated'
-        ) {
-          this._deliverIncomingMessage(msg);
-          return;
-        }
-      } else {
-        if (msg.type === 'audio-chunk') {
-          this._deliverIncomingMessage(msg);
-          return;
-        }
-        if (
-          msg.type === 'room-state' ||
-          msg.type === 'audio-source' ||
-          msg.type === 'stream-state' ||
-          msg.type === 'tawaf-stage' ||
-          msg.type === 'new-announcement' ||
-          msg.type === 'announcement-deleted' ||
-          msg.type === 'guide-location' ||
-          msg.type === 'steps-updated' ||
-          msg.type === 'family-state'
-        ) {
-          this._deliverIncomingMessage(msg);
-          return;
-        }
-      }
+
+
+    _publishMqtt(frame) {
+      if(frame?.version!==70||!/^[0-9a-f]{64}$/.test(frame.proof||''))return;
+      const expected='ridvanses/v3/room/'+this._sanitizeCode(this._joinContext?.tourCode)+'/'+
+        this._encodeTopicSegment(String(frame.roomId||'genel').trim());
+      if(this._joinContext?.role!=='guide'||frame.topic!==expected)return;
+      const payload=JSON.stringify(frame);if(payload.length>32768)return;
+      for(const c of this._mqttClients)if(c?.connected){
+        try{c.publish(frame.topic,payload,{qos:0});}catch(e){}
+      }
+    }
+
+    _handleCloudBusMessage(msg){
+      // Unverified peers have no authority, including hello/SOS/control.
+      return;
     }
 
     _broadcastP2PRoomState() {
@@ -622,6 +558,7 @@
         if((this._mqttGeneration||0)!==generation||this._closedExplicitly||!this._isRelay||this.readyState!==1)return;
         this._roomStateTimer = null;
         if(!this._joinContext||this._joinContext.role!=='guide')return;
+        this._prunePresence?.();
         const pilgrims = Array.from(this._pilgrimMeta.values());
         const tourCode = this._joinContext.tourCode || 'RY-KASIM';
         const roomId = this._joinContext.roomId || 'genel';
@@ -646,22 +583,24 @@
           audioMediaEpoch:this._lastGuideState?.audioMediaEpoch||null,
           guideLocation: this._guideLocation || null,
           connectedPilgrims: pilgrims,
-          totalListeners: pilgrims.length,
-          realListenerCount: pilgrims.length
+          totalListeners:Number.isSafeInteger(this._presenceTotal)?this._presenceTotal:pilgrims.length,
+          realListenerCount:Number.isSafeInteger(this._presenceTotal)?this._presenceTotal:pilgrims.length
         };
         const payload = {
           _msgId: 'rs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
           type: 'room-state',
           room: roomObj
         };
-        this._deliverIncomingMessage(payload);
-        this._publishMqtt(payload);
+        this._deliverIncomingMessage({...payload,_localPresence:true});
+        this._publishMqtt({...payload,room:{...roomObj,connectedPilgrims:[]}});
       }, 180);
     }
 
     // PATCH: shim-delivery-v50
     _deliverIncomingMessage(msg) {
       if (!msg || typeof msg !== 'object') return;
+      if(msg.type==='session-replaced'){this._fenceReplaced();return;}
+      this._observeTrustedMessage?.(msg);
       if (msg._msgId) {
         if (this._seenIds.has(msg._msgId)) return;
         this._seenIds.add(msg._msgId);
@@ -710,6 +649,11 @@
       if (parsed && typeof parsed === 'object') {
         const subscription=['join','family-subscribe','admin-subscribe'].includes(parsed.type);
         const previousRoute=subscription?this._relayRoutingKey():null;
+        if(subscription){
+          const old=this._joinContext;
+          if(parsed.type!=='join'||!old||String(old.tourCode||'RY-KASIM').toUpperCase().trim()!==String(parsed.tourCode||'RY-KASIM').toUpperCase().trim()||
+            String(old.roomId||'genel').trim()!==String(parsed.roomId||'genel').trim()||old.role!==parsed.role||old.token!==parsed.token)this._clearPresence?.();
+        }
         if (!parsed._msgId) {
           parsed._msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
         }
@@ -767,6 +711,7 @@
           if (this._isRelay) this._initMqttBus(null, true);
         }
         if(subscription&&previousRoute!==this._relayRoutingKey()){
+          this._clearPresence?.();
           this._sendQueue.length=0;this._audioCoalescer?.clear();this._lastGuideState=null;
         }
       }
@@ -924,10 +869,7 @@
         }
       }
 
-      // MQTT WSS bağlıyken ses paketlerini (audio-chunk) yavaş HTTP /api/ws-relay kuyruğuna sokma (ağ tıkanıklığını ve 450ms gecikmeli çift paketi önler)
-      if (parsed.type === 'audio-chunk' && this._busConnected()) {
-        return;
-      }
+      // v70: authenticate media on the server before public MQTT publication.
 
       if(!this._enqueueRelayMessage(parsed))return;
       if (!this._inFlight) {
@@ -1036,11 +978,14 @@
         const requestSeq=this._relayRequestSeq=(this._relayRequestSeq||0)+1;
         const res=await fetch('/api/ws-relay',{method:'POST',signal:ac.signal,
           headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:this._relayClientId,
-            relayKey:this._relayKey,requestSeq,token,subscriptionContext:context,messages:fresh})});
+            relayKey:this._relayKey,requestSeq,token,subscriptionContext:context,messages:fresh,
+            mqttFrames:(this._mqttInbox||[]).splice(0,8)})});
         const payload=await res.json();if(!current())return;
         if(!res.ok){
           if(res.status===409&&payload.error==='relay-request-stale'){success=true;return;}
+          if(res.status===401)this._clearPresence?.();
           if(res.status===409){
+            if(payload.reason==='replaced'){this._fenceReplaced();success=true;return;}
             if(payload.error==='relay-session-retired'&&this._failbackProbe)this._relayFenced=true;
             else{
               if(sameRoute())for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
@@ -1052,6 +997,8 @@
         if(!sameRoute()){success=true;return;}
         if(Number.isSafeInteger(submittedGuideEpoch)&&!payload.messages?.some?.(m=>m.type==='auth-error'||m.type==='pin-error'))
           this._relayGuideStateAckEpoch=submittedGuideEpoch;
+        this._prunePresence?.();
+        if(Array.isArray(payload.mqttPublications))for(const f of payload.mqttPublications)this._publishMqtt?.(f);
         if(Array.isArray(payload.messages))for(const m of payload.messages)this._deliverIncomingMessage(m);
         success=true;
       }catch(e){
@@ -1067,6 +1014,7 @@
 
     // PATCH: shim-close-v53
     close() {
+      this._clearPresence?.();
       this._closedExplicitly=true;this._cancelNativeProbe?.();this._resetRelaySession?.();
       this.readyState = 3;
       this._httpEpoch=(this._httpEpoch||0)+1;
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=69"></script>
+  <script src="/vercel-ws-shim.js?v=70"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```
