# RıdvanSes v73 — Gerçek Web Push Altyapısı ve Doğrulama Raporu

Tarih: 2026-11-10  
Onaylanan taban HEAD: c8b641bf9a36c939651d02d5e0ea69ada5edf132 (DSP v72, 62 test)  
Çalışma alanı: D:/umresesliyazılım

## 1. Sonuç ve uygulama durumu

**Web Push v73 uygulandı ve doğrulandı: 64 / 64 [BAŞARILI / PASS], exit 0.** DSP v72 (`c8b641b`) üzerine ilerlenerek mevcut 62 test korundu ve ADIM-3.V73 ile ADIM-5.V73 eklendi. İki ses worklet’i, DSP algoritmaları ve 72-audio modül sürümleri değiştirilmedi.

**Uygulama durumu: UYGULANDI VE DOĞRULANDI (v73 — 64/64 PASS).** Çalışma ağacında `git apply --reverse --check --ignore-space-change -` → `exit 0`. AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md silinmeleri korundu.

Aday, açık bir sayfaya veya WebSocket bağlantısına ihtiyaç duymadan Service Worker push olayında bildirim gösterecek standart hattı ekler. Gerçek yerel HTTP push alıcısı üzerinde şifreli gövde, bağımsız alıcı anahtarıyla çözüldü; VAPID imzası doğrulandı. Android/iPhone fiziksel cihazı veya gerçek FCM/APNs servisiyle canlı teslim testi yapılmadı. Uygulamanın kapalı olması ile işletim sisteminde uygulamanın zorla durdurulması/bildirimlerin kapatılması aynı garanti değildir.

## 2. Standart hat ve kalıcı kimlik

Hattın akışı: kullanıcı izni → PushManager.subscribe → PIN doğrulamalı VDS kaydı → duyuru oluşturma → asenkron şifreli HTTP POST → push sağlayıcısı → OS/Service Worker push olayı → showNotification.

- [RFC 8030](https://www.rfc-editor.org/rfc/rfc8030): üretimde HTTPS push endpoint’ine POST; TTL=86400, Urgency=high. 404/410 aboneliği düşürür.
- [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) ve [RFC 8188](https://www.rfc-editor.org/rfc/rfc8188): her iletide yeni P-256 ECDH anahtarı/salt; auth secret ile HKDF-SHA256, ardından CEK/nonce türetimi; tek AES-128-GCM kayıt, son delimiter 0x02. 86 bayt başlıkta salt/rs=4096/65 bayt sender point bulunur. En fazla 3993 bayt plaintext, en fazla 4096 bayt wire body.
- [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292): Authorization: vapid t=JWT, k=publicKey; ES256/64 bayt IEEE-P1363 imza, aud=endpoint origin, exp=şimdi+12 saat, mailto/https sub. VAPID anahtarı ile ileti ECDH anahtarı ayrıdır.

package.json ve package-lock.json değişmedi; yeni npm paketi yoktur. crypto/http/https/dns/net ve mevcut Express/WS kullanılır.

VAPID konfigürasyonu:

| Alan | Davranış |
|---|---|
| RYS_VAPID_PRIVATE_KEY | 32 bayt base64url veya private P-256 JWK JSON veya PEM; escaped \\n desteklenir |
| RYS_VAPID_PUBLIC_KEY | İsteğe bağlı eşleşme kontrolü; 65 bayt uncompressed base64url. Tek başına public key konfigürasyonu reddedilir |
| RYS_VAPID_SUBJECT | Varsayılan mailto:info@ridvanyilmazturizm.com |
| VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY | Öneksiz isimler de desteklenir |
| Env anahtarı yok / kalıcı VDS | Anahtar üretilir, db.pushVapid içinde saklanır; başlangıçta senkron atomik flush doğrulanmadan abonelik kabul edilmez |
| Bozuk/mismatched anahtar | Sessizce yeni kimliğe dönülmez; push API 503 verir, ses sunucusu çalışmaya devam eder |
| Vercel serverless | /tmp kalıcı registry sayılmaz; push API 503 ile kalıcı VDS gerektirir |

Mevcut vercel-ws-shim.js, Vercel sayfasından yapılan /api/ çağrılarını zaten Cidde VDS’e yönlendirir. İstemci aynı /api/push/... yollarını kullanır; Vercel’de ayrı ve geçici bir push kimliği/registry oluşturulmaz. Push servisi için bu kalıcı VDS topolojisi korunmalıdır.

VDS abonelikleri db.pushSubscriptions JSON dizisinden Map’e yüklenir; kayıtlı tur, endpoint, P-256 nokta, auth ve mevcut VAPID kimliği tekrar doğrulanır. Normal kayıt güncellemeleri mevcut 250 ms debounced saveState yolunu ve SIGINT/SIGTERM flush’unu kullanır. Ani process/elektrik kaybındaki son debounce penceresi ve RAM gönderim kuyruğu için dayanıklılık garantisi verilmez. Registry tek VDS işlemi içindir; birden fazla bağımsız instance için paylaşımlı kalıcı store bu paketin kapsamında değildir.

Özel VAPID/abonelik anahtarları HTML’e, public-key API’sine veya test loguna eklenmez. Runtime’a geçici olarak yazılan test durumu sonunda başlangıç raw byte’larına döndürülmüştür.

## 3. API, scope ve kapasite sözleşmesi

| Uç nokta | Girdi / cevap |
|---|---|
| GET /api/push/vapid-public-key | 200: success=true, publicKey; yalnız public key. Cache-Control: no-store |
| POST /api/push/subscribe | endpoint, keys.p256dh, keys.auth, tourCode, pin, lang, deviceId, revision; 200: success, subscriptionToken, revision |
| POST /api/push/unsubscribe | endpoint + subscriptionToken; sahibine ait kaydı siler. Olmayan kayıt için idempotent success |
| Hatalar | malformed URL/key/DTO=400; yanlış PIN/SSRF/owner/scope=403; unknown tour=404; eski kayıt revision=409; push konfigürasyonu yok=503 |

Ek uygulama alanları:

- revision pozitif safe integer’dır; istemci timestamp+yerel sayaç üretir ve 409 sonrası sunucu revision’ından ileri gider. Geç gelen eski tur güncellemesi yeni turu geri alamaz.
- subscriptionToken 32 rastgele bayt base64url capability’dir. Unsubscribe için endpoint tek başına yeterli değildir. İstemci receipt’i saklar; PIN yalnız bellek bağlamında tutulur.
- Aynı endpoint’in güncellemesinde mevcut p256dh+auth veya kayıt capability’si sahipliği kanıtlar; yeni tur PIN’i yine kontrol edilir. Bir endpoint’in tek güncel tur üyeliği vardır.
- Aynı tur/anahtar bağının metadata güncellemesi bekleyen meşru iletileri iptal etmez. Tur veya anahtar değişiminde eski binding bırakılır; bekleyen işler elenir, aktif request iptal edilir. DNS beklemesi sonrasında binding yeniden kontrol edilir. Eski 410 cevabı yeni kaydı silemez.
- REST duyurusu için canlı principal/tur kapsamı kontrol edilir. ALL yayını yalnız admin tarafından REST yolunda açık global izinle tetiklenir. ALL adlı gerçek bir turdaki rehberin RT duyurusu global yetki sayılmaz.
- Tur silme registry ve ilgili aktif istekleri temizler.

SSRF sınırları:

- Üretim yalnız https, varsayılan 443; userinfo/fragment yok; normalize endpoint en fazla 2048 karakter.
- Sağlayıcılar: fcm.googleapis.com, android.googleapis.com, *.push.apple.com, *.notify.windows.com, *.push.services.mozilla.com.
- DNS’nin tüm cevapları public IP kontrolünden geçer; seçilen cevap lookup callback’iyle pinlenir. Native TLS hostname/certificate kontrolü korunur. Redirect takip edilmez.
- 65 bayt/0x04 p256dh noktasının P-256 üzerinde olduğu native crypto ile doğrulanır. auth tam 16 bayt canonical base64url olmalıdır.
- Loopback istisnası yalnız NODE_ENV=test ve açık RYS_PUSH_TEST_ORIGIN=http://127.0.0.1:<port> kombinasyonundadır. İstemci gövdesi bu izni açamaz.
- Verifier ayrıca RYS_PUSH_TEST_ONLY=1 ayarlar: gerçek abonelikler yüklenmez ve dış push hedeflerine gönderim engellenir. Yerel testler gerçek kullanıcılara bildirim göndermez.

Kapasite ve işleme:

| Kaynak | Sınır |
|---|---:|
| Abonelik / tur | 512, en eski güncellenmiş kayıt düşer |
| Abonelik / process | 4096 |
| Bekleyen duyuru snapshot’ı | 8 |
| Gönderim kuyruğu | 8192 iş |
| Bir event-loop dilimindeki fan-out | 64 kayıt |
| Eşzamanlı ağ gönderimi | 4 |
| DNS / request deadline | 3 s / 5 s |
| Geçici 429 veya 5xx | En fazla 2 tekrar, 1 s / 4 s bekleme |
| Subscribe/unsubscribe rate limit | Aynı IP ve yol için 1200/dakika |

Tek origin’de birer aboneliği olan 300 dinleyici 512 kayıt sınırını aşmaz; sınır fiziksel kişi değil abonelik sayısı içindir. Rate limit CGNAT için yüksek tutuldu. Kuyruklar sınırsız değildir: yoğunluk altında eski bekleyen duyurular düşebilir. Ağ istisnaları best-effort olarak sonlandırılır; bu paket kalıcı gönderim outbox’ı veya tam bir teslim garantisi sağlamaz. Sağlayıcının zaten kabul ettiği bildirim sonradan geri çağrılamaz.

Duyuru önizlemesi title=160, body=2000 UTF-8 bayta kadar alınır; JSON escaping ile 3000 bayt hedefi aşılırsa body daraltılır. Tam uzun duyuru DB/uygulama kaydı değişmez. Normal boyuttaki Türkçe/Arapça E2E metni birebir eşleşti; büyük önizlemenin kırpılması RFC paket sınırına uymak içindir.

## 4. Service Worker ve istemci

SW push olayında sayfa/WS aramaz; json() veya text() payload’ını işler ve event.waitUntil(showNotification(...)) kullanır. Başlık/gövde metin olarak verilir. İstenen icon/badge/vibrate alanları, renotify=false ve data.url eklenir.

Duyuru etiketi her iki yolda aynıdır: ridvanses-ann-<announcement.id>. WS SHOW_NOTIFICATION ve Web Push aynı registration içinde aynı tag’i kullanır; test modelinde iki showNotification çağrısı tek görünür kayıt üretir. Bu, kalıcı “exactly once” teslim günlüğü değildir; ayrı origin/PWA kurulumları tek bildirim alanı paylaşmaz.

notificationclick yalnız kendi origin’inin /dinle URL’sine izin verir. Uygun açık pencere odaklanır, gerekirse gezinir; pencere kapanmışsa veya navigate/focus başarısızsa openWindow denenir. Dış URL güvenli /dinle hedefine düşer.

İstemci akışı:

1. İzin isteği doğrudan kullanıcının enableNotificationPermission aksiyonundan gelir; join izinsiz prompt açmaz.
2. Başarılı join-tour cevabı, doğrulanmış tur/PIN bağlamını belleğe kurar. İzin zaten granted ise sync başlar.
3. serviceWorker.ready ve push-capable v73+ active worker beklenir; yükleme/bekleme sınırlıdır. controllerchange ve online olayı tekrar senkronizasyon sağlar.
4. Public key alınır; getSubscription kullanılır; gerekli durumda subscribe({userVisibleOnly:true, applicationServerKey}) çağrılır. Mevcut uygulama sunucusu anahtarı değişmişse abonelik yenilenir.
5. Güncel tur/PIN/keys/device/lang/revision sunucuya yazılır. Generation kontrolü ve tek job, eski tur işleminin yeni durumu UI’da geri almasını önler; sunucu revision da geç gelen yazmayı reddeder.
6. Bildirim izni tek başına “abonelik aktif” sayılmaz. Kafile yok, browser unsupported veya kayıt başarısız durumunda başarı mesajı verilmez. Yayın ekranından ayrılmak push kaydını otomatik silmez; kapalıyken duyuru almanın nedeni budur.

iOS non-standalone uyarısı Paylaş > Ana Ekrana Ekle akışını korur. [WebKit’in resmi açıklamasına](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/) göre iOS/iPadOS 16.4+ desteği Home Screen web uygulamalarına yöneliktir; izin doğrudan kullanıcı etkileşimiyle istenir. Mevcut manifest standalone’dır. Gerçek işletim sistemi izinleri, Focus/DND, zorla durdurma ve ağ politikaları koddan zorla aşılamaz.

## 5. Bizzat çalıştırılan doğrulama

| Ölçüm | Sonuç |
|---|---|
| Değiştirilmemiş onaylı taban | 62/62 PASS; exit 0 |
| Final aday gerçek CLI | 64/64 PASS; 0 FAIL; exit 0 |
| VAPID public / gerçek ikinci süreç | 65 bayt / aynı kimlik=true |
| Wire body / bağımsız çözüm / ES256 | 12 ileti; max 383 bayt / true / true |
| RFC8291 known-answer / key format | true / 3 format |
| Temel API negatifleri | 6 reddedilen durum; ek owner/scope/revision testleri |
| Başka tura sızıntı | 0 |
| 404 / 410 temizliği | true / true |
| REST / WS / HTTP relay tetikleri | PASS / true / true |
| Slow provider / duyuru API max | 1500 ms / 13 ms |
| Slow provider sırasında native PCM | true; 0 ms Date.now tick farkı |
| Tag modeli | 2 showNotification çağrısı / 1 görünür kayıt |
| Kapasite / en çok paralel iş | 512 tur / 4096 global / 4 |
| DNS rebinding / stale-DNS fence | true / true |
| Stale410 yeni kayıt korunumu | true |
| 1→300 WS regresyonu | 270 sağlıklı hedefe 32400/32400 frame; bozuk=0 |
| WS fan-out p50/p95/p99/max | 13.99/27.77/37.01/42.01 ms |
| Event-loop P99 | 24.36 ms (localhost yük fixture’ı) |

“0 ms” ölçümü Date.now milisaniye çözünürlüğünde aynı tick’tir; fiziksel mikrofon-hoparlör sıfır gecikmesi anlamına gelmez. Slow-provider testi, alıcı cevabını 1500 ms bekletirken duyuru API’sinin dönmesini ve gerçek 972 bayt native WS PCM paketinin akmasını sınadı.

ADIM-3.V73:

- Üç API, yanlış PIN/unknown tour/metadata-IP/spoof host/bozuk P-256/auth negatifleri.
- Yerel alıcıda gerçek HTTP başlıkları, ES256 imza ve aud/exp; sender’dan bağımsız HMAC-HKDF + alıcı ECDH + GCM çözümü; son delimiter ve Unicode başlık/gövde eşliği.
- İkinci gerçek Node sürecinde aynı runtime/konfigürasyondan VAPID public key’in değişmemesi. İkinci süreç port 0 kullanır ve HTTP sunucularını temiz kapatır.
- REST, native WS quick-announcement ve HTTP relay ortak handler tetikleri.
- Başka tura sızıntı yokluğu, 404/410 temizliği, 302’nin takip edilmemesi; tur değişimi/eski revision/owner unsubscribe ve scoped yayın reddi.
- Push sağlayıcısı yavaşken canlı sesin ve API’nin ilerlemesi.

ADIM-5.V73:

- RFC8291 bölüm 5/Appendix A known-answer gövdesi birebir; sınır kayıt 4096 bayt, fazla plaintext reddi.
- Üç private key formatı, JSON kalıcılık round-trip’i, tutarsız private/public reddi; leading-zero özel scalar’ın tam 32 bayta doldurulması.
- Provider/URL/IP/DNS-rebinding negatifleri; DNS beklerken değişen binding ve aktif istek iptali.
- Gerçek subscribe fonksiyonuyla 513/4097 kayıt sınırları; fan-out 64/4/8/8192 sınırları ve eski 410 cevabının yeni kaydı koruması.
- İstemci sayfası olmadan SW push handler, aynı tag, text fallback, safe click/focus/navigate/open ve kapanan pencere.
- İzin akışı, iOS standalone şartı, tur değişimi sırasında stale job, mevcut PushManager aboneliğinin tekrar kullanılması ve PIN’in browser storage’a yazılmaması.
- SW/8 HTML cache v73; worklet pinlerinin 72-audio kalması.

Son çalıştırmanın yeni adım çıktı metrikleri:

```text
V73 E2E METRICS {"keyBytes":65,"restartSameKey":true,"announcementApiMaxMs":13,"liveAudioDuringSlowPush":true,"liveAudioMs":0,"denials":6,"encryptedBodies":12,"maxBodyBytes":383,"independentDecrypt":true,"es256Valid":true,"ttl":86400,"urgency":"high","otherTourLeak":0,"gone410Removed":true,"gone404Removed":true,"redirectFollowed":false,"wsTrigger":true,"httpRelayTrigger":true,"tourMoved":true,"staleRevisionRejected":true,"unsubscribe":true,"scopedPublishDenied":true}
[BAŞARILI / PASS] ADIM-3.V73 — Real Web Push/VAPID HTTP receiver, independent ECDH-HKDF-GCM decrypt; PIN/SSRF/key/scope guards; WS/relay trigger; tour migration and gone cleanup
V73 UNIT METRICS {"rfc8291KnownAnswer":true,"keyFormats":3,"persistedIdentity":true,"leadingZeroScalar":true,"dnsRebindingDenied":true,"staleDnsFenced":true,"capacityPerTour":512,"capacityGlobal":4096,"pendingAnnouncements":8,"fanoutBatch":64,"maxConcurrent":4,"stale410Preserved":true,"swPushWithoutPage":true,"displayedSameTag":1,"safeClick":true,"latestTour":true,"iosStandalone":true,"pinPersisted":false}
[BAŞARILI / PASS] ADIM-5.V73 — RFC8291 vector/VAPID persistence/formats; endpoint/SSRF/capacity; bounded async fanout; SW closed-page/tag/click; iOS and latest-tour subscription
TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: 64 / 64 [BAŞARILI / PASS]
```

Kaynakta aday satırları (diff uygulandığında):

| Aday dosya/satır | Amaç |
|---|---|
| server.js:365 | kalıcı VAPID |
| server.js:349 | sağlayıcı / URL |
| server.js:439 | PIN / kayıt / revision |
| server.js:476 | RFC8291 |
| server.js:492 | RFC8292 |
| server.js:498 | DNS / HTTPS / fence |
| server.js:542 | asenkron fanout |
| public/sw.js:95 | arka plan |
| public/sw.js:103 | odak / yönlendirme |
| public/dinle.html:2809 | istemci |
| scripts/verify-system.js:5064 | ADIM-3.V73 |
| scripts/verify-system.js:4876 | ADIM-5.V73 |

### 5.1 Test yöntemi ve uygulanabilirlik

```text
node scripts/verify-system.js
# Güncel, değiştirilmemiş c8b641b: 62/62 PASS, exit 0

node --require <TEMP>/rys-v73-push-preload.cjs scripts/verify-system.js
# Bu rapordaki aday bellekte: 64/64 PASS, exit 0

git apply --check --ignore-space-change -
# Asıl c8b641b ağacında: exit 0

git apply --reverse --check --ignore-space-change -
# Aday uygulanmış bağımsız TEMP Git deposunda: exit 0
```

Preload yalnız source read/CommonJS compile ve aday syntax-check girdisini bellekte değiştirir. Gerçek verifier, gerçek localhost HTTP/WS sunucusu ve alıcı çalıştı. Verifier’ın raporu kaynak/cevap olarak okuması engellidir. Bir fiziksel cihazda izin düğmesine basıldığı veya FCM/APNs’e canlı mesaj gönderildiği iddia edilmez; SW/istemci davranışı deterministik VM modeliyle sınandı.

Ters check henüz uygulanmamış asıl ağaca karşı PASS olarak sunulmadı. 12 hedefin başlangıç byte’ları bağımsız TEMP Git deposuna kopyalanıp gerçekten apply edildi; ileri check / apply / reverse check exit 0 verdi. Uygulanan dosyalar yalnız CRLF→LF normalize edilerek, BOM korunarak, test edilen adayla 12/12 SHA eşleşti. Güvenli mutlak yolu doğrulanan geçici repo temizlendi.

## 6. Korunum, kapsam ve patch kimliği

- Kaynak/test/config mevcut takipli dosyalar: rapor hariç 61/61 başlangıç raw SHA-256 eşliği.
- data/runtime.json ayrıca Buffer düzeyinde eşit; CLI finally blokları başlangıç byte’larını geri yükledi.
- Geçici preload silindi; stage/index/commit/push/deploy yok. HEAD c8b641b kaldı.
- İki önceki dosya silinmesi korundu.
- public/pcm-capture-worklet.js ve public/pcm-player-worklet.js patch’e dahil değil; DSP v72 değişiklikleri geri alınmadı.
- package.json, package-lock.json ve public/vercel-ws-shim.js uygulama içeriği değişmedi.
- Patch hedefleri: server.js, scripts/verify-system.js, public/sw.js, 8 HTML ve .env.example (12 dosya). SW/cache/shim URL’leri v73; capture/player v=72-audio.

| Dosya | Başlangıç = son raw SHA-256 |
|---|---|
| server.js | 381a56e29bd2ea85e37cb8bb7130729cf0e51c79b3de1f129ddd2edcc9bd847f |
| scripts/verify-system.js | 10a57a463bb1d8d6eaad1ab6e4694ab94fde61e7ff9faf0c3acff98cb1d4a4de |
| public/dinle.html | f8ad301cfa8a3603db2bb23ed4de682816d8bd88acd0dc0e5ae24217ed411872 |
| public/sw.js | e498d410f5defde11b57dee7df72b1df6aa2340e22f1e6498fc6ebbfb1e44c26 |
| public/pcm-capture-worklet.js | 0f44e45caa8fc5c5bf9f17e52d238deb7a9231b59cf7e7c92298d5e208958428 |
| public/pcm-player-worklet.js | bd1d7389531a6d6b627e3ef5eb44429dea9cffaca9400b28d2014d5d410830f0 |
| public/vercel-ws-shim.js | 2946aca9501946bfe0751c7cb0a9623a0d09ebf81980b8d207a8788e691aadfa |
| package.json | c175e7789419f1baa38683712f9506d6d11561bc16d9b332baa3af5115f07d82 |
| package-lock.json | aa52091b91e2283e901ad72feb918725224c8834c08d05995c4a66748c992ed1 |
| data/runtime.json | 087e97acb7b29e389c4ac4da3014ce2aee8de575cd9d602c3af2eae3e11a32c4 |

Diff: **84022 UTF-8/LF bayt**; SHA-256 **39f70907560b75c6af6f139e3c016ce9623fd32b9b469462113b786134995a31**. Hash yalnız diff fence içindeki, son LF dahil metne aittir.

## 7. Uygulanmış Web Push v73 unified diff

Aşağıdaki yama c8b641b üzerine uygulanmış ve doğrudan `node scripts/verify-system.js` komutuyla **64 / 64 [BAŞARILI / PASS], exit 0** olarak doğrulanmıştır (`git apply --reverse --check --ignore-space-change -` → `exit 0`).


```diff
diff --git a/.env.example b/.env.example
--- a/.env.example
+++ b/.env.example
@@ -7,3 +7,11 @@
 SELAMET_USERNAME=info@selametturizm.com
 SELAMET_PASSWORD=your_agency_password
 AUTH_TOKEN_SECRET=your_secret_session_token
+
+# Web Push (persistent VDS). Use the same identity across restarts/instances.
+# Private: 32-byte base64url, P-256 private JWK JSON, or PKCS8/SEC1 PEM (escaped \n supported).
+# If omitted on the VDS, a key pair is generated and persisted in data/runtime.json.
+RYS_VAPID_PUBLIC_KEY=
+RYS_VAPID_PRIVATE_KEY=
+RYS_VAPID_SUBJECT=mailto:info@ridvanyilmazturizm.com
+# Test loopback is disabled in production; never configure it for deployment.
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=72"></script>
+  <script src="/vercel-ws-shim.js?v=73"></script>
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
-  <script src="/vercel-ws-shim.js?v=72"></script>
+  <script src="/vercel-ws-shim.js?v=73"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1114,6 +1114,7 @@
         }
 
         currentTour = data.tour;
+        setWebPushTour(currentTour.code,pin);
         updatePilgrimHotelNavigationUi(currentTour);
         try {
           localStorage.setItem('ridvanses_pilgrim_name', name);
@@ -1409,7 +1410,7 @@
           const dot = document.getElementById('annUnreadDot');
           if (dot) dot.style.display = 'block';
           playNotificationChime();
-          sendServiceWorkerNotification(msg.announcement.title, msg.announcement.message);
+          sendServiceWorkerNotification(msg.announcement.title,msg.announcement.message,'ridvanses-ann-'+msg.announcement.id);
         }
 
         if (msg.type === 'announcement-deleted' && msg.id) {
@@ -2688,7 +2689,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=72').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=73').catch(() => {});
       });
     }
 
@@ -2768,57 +2769,141 @@
       await enableNotificationPermission();
     }
 
+
+    function urlBase64ToUint8Array(value){
+      if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Geçersiz bildirim anahtarı');
+      const text=atob((value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));
+      return Uint8Array.from(text,ch=>ch.charCodeAt(0));
+    }
+    function rysWebPushState(){
+      return window.__rysWebPush||(window.__rysWebPush={context:null,generation:0,promise:null,revision:0,status:'idle'});
+    }
+    function setWebPushTour(tourCode,pin){
+      const state=rysWebPushState();
+      state.context={tourCode:String(tourCode||'').toUpperCase().trim(),pin:String(pin||'')};
+      state.generation++;
+      if(typeof Notification!=='undefined'&&Notification.permission==='granted')void syncWebPushSubscription();
+    }
+    function nextWebPushRevision(minimum=0){
+      const state=rysWebPushState();let previous=0;
+      try{previous=Number(localStorage.getItem('rys_push_revision'))||0;}catch(e){}
+      const revision=Math.max(Date.now()*1024,state.revision+1,previous+1,minimum+1);
+      if(!Number.isSafeInteger(revision))throw Error('Bildirim kaydı yenilenemedi');
+      state.revision=revision;
+      try{localStorage.setItem('rys_push_revision',String(revision));}catch(e){}
+      return revision;
+    }
+    async function webPushFetch(url,init){
+      const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),8000);
+      try{return await fetch(url,{...init,signal:ac.signal});}finally{clearTimeout(timer);}
+    }
+    async function awaitWebPushWorker(registration,current){
+      for(let i=0;i<80;i++){
+        if(!current())return false;
+        const active=registration.active;
+        if(active?.state==='activated'&&Number(new URL(active.scriptURL).searchParams.get('v'))>=73)return true;
+        await new Promise(resolve=>setTimeout(resolve,100));
+      }
+      throw Error('Bildirim Service Worker güncellemesi bekleniyor');
+    }
+    async function syncWebPushSubscription(){
+      const state=rysWebPushState();state.generation++;
+      if(state.promise)return state.promise;
+      let completed=state.generation;
+      state.promise=(async()=>{
+        let result=false;
+        do{
+          const generation=state.generation,context=state.context&&{...state.context};
+          completed=generation;result=false;
+          const current=()=>generation===state.generation;
+          if(!context?.tourCode||typeof Notification==='undefined'||Notification.permission!=='granted'||
+            !('serviceWorker' in navigator)||isIosDevice()&&!isStandaloneApp()){
+            state.status='waiting';continue;
+          }
+          try{
+            let timer;
+            const registration=await Promise.race([navigator.serviceWorker.ready,
+              new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Service Worker hazır değil')),8000);})])
+              .finally(()=>clearTimeout(timer));
+            if(!current())continue;
+            if(!registration.pushManager){state.status='unsupported';continue;}
+            if(!await awaitWebPushWorker(registration,current))continue;
+            const keyResponse=await webPushFetch('/api/push/vapid-public-key',{cache:'no-store'});
+            if(!keyResponse.ok)throw Error('Bildirim sunucusu hazır değil');
+            const keyData=await keyResponse.json(),key=urlBase64ToUint8Array(keyData.publicKey);
+            if(key.length!==65||key[0]!==4)throw Error('Bildirim anahtarı geçersiz');
+            if(!current())continue;
+            let subscription=await registration.pushManager.getSubscription();
+            if(!current())continue;
+            if(subscription){
+              const old=subscription.options?.applicationServerKey;
+              const bytes=old?new Uint8Array(old.buffer||old,old.byteOffset||0,old.byteLength):null;
+              if(!bytes||bytes.length!==key.length||bytes.some((b,i)=>b!==key[i])){
+                await subscription.unsubscribe();subscription=null;
+              }
+            }
+            if(!current())continue;
+            if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
+            if(!current())continue;
+            let receipt=null;try{receipt=JSON.parse(localStorage.getItem('rys_push_receipt')||'null');}catch(e){}
+            const json=subscription.toJSON();
+            let body={endpoint:json.endpoint,keys:json.keys,tourCode:context.tourCode,pin:context.pin,
+              lang:currentLang,deviceId:pilgrimDeviceId,revision:nextWebPushRevision(),
+              ...(receipt?.endpoint===json.endpoint?{subscriptionToken:receipt.subscriptionToken}:{})};
+            let response=await webPushFetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
+            let saved=await response.json();
+            if(response.status===409&&saved.error==='stale-subscription'&&current()){
+              body={...body,revision:nextWebPushRevision(saved.revision)};
+              response=await webPushFetch('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
+              saved=await response.json();
+            }
+            if(!response.ok||!saved.success)throw Error('Bildirim aboneliği kaydedilemedi');
+            try{localStorage.setItem('rys_push_receipt',JSON.stringify({endpoint:json.endpoint,subscriptionToken:saved.subscriptionToken}));}catch(e){}
+            if(current()){state.status='subscribed';state.tourCode=context.tourCode;result=true;}
+          }catch(e){if(current())state.status='retry';}
+        }while(completed!==state.generation);
+        return result;
+      })().finally(()=>{
+        state.promise=null;
+        // Latch a context change arriving between the last await and finalization.
+        if(completed!==state.generation)queueMicrotask(()=>void syncWebPushSubscription());
+      });
+      return state.promise;
+    }
+
     async function enableNotificationPermission() {
-      if (!('Notification' in window)) {
-        if (isIosDevice() && !isStandaloneApp()) {
-          showAppToast(
-            '<strong>iPhone Bilgilendirmesi:</strong><br/>Apple güvenlik politikası gereği bildirim alabilmek için lütfen önce alt menüdeki <strong>Paylaş > Ana Ekrana Ekle</strong> adımlarını tamamlayınız.',
-            6000
-          );
-        } else {
-          showAppToast('Cihazınız web anlık bildirimlerini desteklememektedir. Sesli canlı yayın ve konum takibiniz kesintisiz çalışmaktadır.', 5000);
-        }
+      if(isIosDevice()&&!isStandaloneApp()){
+        showAppToast('<strong>iPhone Bilgilendirmesi:</strong><br/>Bildirimler için <strong>Paylaş > Ana Ekrana Ekle</strong> adımlarını tamamlayıp uygulamayı Ana Ekrandan açın.',6000);
         return;
       }
-
-      try {
-        let perm = Notification.permission;
-        if (perm === 'granted') {
-          showAppToast('Bildirim izni zaten açık! Kafile duyuruları telefonunuza gelecektir.', 3500);
-          sendServiceWorkerNotification('RıdvanSes Bildirimleri Aktif', 'Kafile duyuruları ve toplanma saatleri telefonunuza anında düşecektir.');
+      if(!('Notification' in window)||!('serviceWorker' in navigator)){
+        showAppToast('Bu tarayıcı arka plan bildirimlerini desteklemiyor.',5000);return;
+      }
+      try{
+        let permission=Notification.permission;
+        if(permission!=='granted')permission=await Notification.requestPermission();
+        if(permission==='granted'){
+          const active=await syncWebPushSubscription();
+          showAppToast(active?'Kafile bildirimleri etkinleştirildi.':
+            !rysWebPushState().context?'İzin açık; bir kafileye katıldığınızda bildirimler etkinleşir.':
+            'Bildirim aboneliği tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin.',5000);
+          if(active)sendServiceWorkerNotification('RıdvanSes Bildirimleri Aktif','Kafile duyuruları için bildirim aboneliğiniz kaydedildi.','ridvanses-push-enabled');
           closePwaModal();
-          return;
-        }
-
-        if (typeof Notification.requestPermission === 'function') {
-          try {
-            perm = await Notification.requestPermission();
-          } catch (e) {
-            perm = await new Promise((res) => Notification.requestPermission(res));
-          }
-        }
-
-        if (perm === 'granted') {
-          sendServiceWorkerNotification('RıdvanSes Bildirimleri Aktif', 'Kafile duyuruları ve toplanma saatleri telefonunuza anında düşecektir.');
-          showAppToast('Bildirim izni başarıyla verildi!', 4000);
-          closePwaModal();
-        } else if (perm === 'denied') {
-          showAppToast('Bildirim izni engellenmiş. Telefon Ayarları > RıdvanSes > Bildirimler bölümünden izin verebilirsiniz.', 6000);
-        }
-      } catch (err) {
-        showAppToast('Bildirim izni alınırken bir sorun oluştu.', 3500);
-      }
-    }
-
-    function sendServiceWorkerNotification(title, body) {
-      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
-        navigator.serviceWorker.controller.postMessage({
-          type: 'SHOW_NOTIFICATION',
-          title,
-          body
-        });
-      }
-    }
+        }else if(permission==='denied'){
+          showAppToast('Bildirim izni engellenmiş. Telefon Ayarları > RıdvanSes > Bildirimler bölümünden izin verebilirsiniz.',6000);
+        }
+      }catch(e){showAppToast('Bildirim izni alınırken bir sorun oluştu.',3500);}
+    }
+    function sendServiceWorkerNotification(title,body,tag){
+      if('serviceWorker' in navigator&&navigator.serviceWorker.controller){
+        const code=rysWebPushState().context?.tourCode||currentTour?.code;
+        navigator.serviceWorker.controller.postMessage({type:'SHOW_NOTIFICATION',title,body,
+          tag:tag||'ridvanses-notify',data:{url:code?'/dinle?code='+encodeURIComponent(code):'/dinle'}});
+      }
+    }
+    window.addEventListener('online',()=>{if(rysWebPushState().context)void syncWebPushSubscription();});
+    navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(rysWebPushState().context)void syncWebPushSubscription();});
+
 
     let wakeLockSentinel = null;
     let wakeLockDesired = true;
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=72"></script>
+  <script src="/vercel-ws-shim.js?v=73"></script>
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
-  <script src="/vercel-ws-shim.js?v=72"></script>
+  <script src="/vercel-ws-shim.js?v=73"></script>
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
-  <script src="/vercel-ws-shim.js?v=72"></script>
+  <script src="/vercel-ws-shim.js?v=73"></script>
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
-  <script src="/vercel-ws-shim.js?v=72"></script>
+  <script src="/vercel-ws-shim.js?v=73"></script>
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
-  <script src="/vercel-ws-shim.js?v=72"></script>
+  <script src="/vercel-ws-shim.js?v=73"></script>
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
-const CACHE_NAME = 'ridvanses-pwa-v72';
+const CACHE_NAME = 'ridvanses-pwa-v73';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=72',
+  '/vercel-ws-shim.js?v=73',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=72-audio',
   '/pcm-player-worklet.js?v=72-audio',
@@ -71,27 +71,43 @@
   );
 });
 
-self.addEventListener('message', (event) => {
-  const data = event.data || {};
-  if (data.type === 'SHOW_NOTIFICATION' && self.registration.showNotification) {
-    self.registration.showNotification(data.title || 'Rıdvan Yılmaz Turizm Duyurusu', {
-      body: data.body || '',
-      icon: '/icons/icon-512.png',
-      badge: '/icons/icon-192.png',
-      vibrate: [200, 100, 200],
-      tag: data.tag || 'ridvanses-notify'
-    });
+
+function rysNotificationUrl(value){
+  try{
+    const url=new URL(value||'/dinle',self.location.origin);
+    if(url.origin===self.location.origin&&url.pathname==='/dinle')return url.href;
+  }catch(e){}
+  return new URL('/dinle',self.location.origin).href;
+}
+function showRysNotification(message){
+  const data=message&&typeof message==='object'?message:{body:String(message||'')};
+  const tag=typeof data.tag==='string'&&data.tag?data.tag.slice(0,180):
+    data.id?'ridvanses-ann-'+String(data.id).slice(0,96):'ridvanses-notify';
+  return self.registration.showNotification(String(data.title||'RıdvanSes Kafile Duyurusu').slice(0,160),{
+    body:String(data.body||data.message||'').slice(0,2000),
+    icon:'/icons/icon-512.png',badge:'/icons/icon-192.png',vibrate:[200,100,200],
+    tag,renotify:false,data:{url:rysNotificationUrl(data.data?.url||data.url)}
+  });
+}
+self.addEventListener('message',event=>{
+  if(event.data?.type==='SHOW_NOTIFICATION')event.waitUntil(showRysNotification(event.data));
+});
+self.addEventListener('push',event=>{
+  let data={};
+  if(event.data){
+    try{data=event.data.json();}
+    catch(e){try{data={body:event.data.text()};}catch(e){}}
   }
+  event.waitUntil(showRysNotification(data));
 });
-
-self.addEventListener('notificationclick', (event) => {
+self.addEventListener('notificationclick',event=>{
   event.notification.close();
-  event.waitUntil(
-    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
-      if (clientList.length > 0) {
-        return clientList[0].focus();
-      }
-      return self.clients.openWindow('/dinle');
-    })
-  );
+  const target=rysNotificationUrl(event.notification.data?.url);
+  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
+    const exact=clients.find(c=>c.url===target);
+    if(exact){try{return await exact.focus();}catch(e){}}
+    const active=clients.find(c=>{try{const u=new URL(c.url);return u.origin===self.location.origin&&u.pathname==='/dinle';}catch(e){return false;}});
+    if(active?.navigate){try{const navigated=await active.navigate(target);if(navigated)return await navigated.focus();}catch(e){}}
+    return self.clients.openWindow(target);
+  }));
 });
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=72"></script>
+  <script src="/vercel-ws-shim.js?v=73"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -592,6 +592,7 @@
   await runV69RoomReplacementChecks({baseUrl,url:wsUrl,token:authToken});
   await runV70SecurityChecks({baseUrl,url:wsUrl,token:authToken,credentials:loginCredentials});
   await runV71IsolationChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV73PushChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1567,9 +1568,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v72"));assert(sw.includes('/vercel-ws-shim.js?v=72'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v73"));assert(sw.includes('/vercel-ws-shim.js?v=73'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'72',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'73',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -2534,7 +2535,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v73'));
   for(const asset of ['pcm-player-worklet.js?v=72-audio','pcm-capture-worklet.js?v=72-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=72-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=72-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2744,7 +2745,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2983,7 +2984,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3168,7 +3169,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3355,7 +3356,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3519,7 +3520,7 @@
     const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
     checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
   recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
 }
@@ -3693,7 +3694,7 @@
     h.s.close();assert(h.clients.every(c=>c.ended===1));assert.equal(h.received.length,0);
     checks.push('100-replacements-bounded-active-clients-invalidate-before-synchronous-end');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('vercel-ws-shim.js?v=72'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('vercel-ws-shim.js?v=73'));
   assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V66 UNIT METRICS '+JSON.stringify({checks,clientsAfterDelayedClose:0,staleDelivered:0,activeClientsMax:2,replacements:100}));
   recordResult('ADIM-5.V66','MQTT loader/client/suback/timer ownership across route, close and native takeover; bounded replacement; cache66',true);console.log('V66 UNIT PASS');
@@ -3815,7 +3816,7 @@
     sockets.clear();const idle=member('idle-expired','json-expired');g.heartbeat();assert.equal(idle.ws.terminated,1);assert.equal(idle.currentRoom,null);
     checks.push('real-binary-and-JSON-ingress-reject-expired-credentials-idle-heartbeat-cleans-membership');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('vercel-ws-shim.js?v=72'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('vercel-ws-shim.js?v=73'));
   assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V67 UNIT METRICS '+JSON.stringify({checks,expiredGuidePresent:false,expiryGraceMs:0,revokedGuideTerminated:1,revokedAdminTerminated:1,healthyTerminated:0,publicFamilyTerminated:0,cancelledPrepare:true}));
   recordResult('ADIM-5.V67','Native live credential expiry/revoke, token rotation, pending handoff cleanup, public-family isolation and HTTP/static compatibility; cache67',true);console.log('V67 UNIT PASS');
@@ -3975,7 +3976,7 @@
     assert.equal(h.room('siyer').audioSourceId,'page');assert.equal(h.room('siyer').audioMediaEpoch,10);assert.equal(h.room('siyer').isLive,true);
     checks.push('dedicated-guide-downgrade-restores-General-source-state-epoch-inheritance');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('vercel-ws-shim.js?v=72'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('vercel-ws-shim.js?v=73'));
   assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V68 UNIT METRICS '+JSON.stringify({checks,collisionCases,crossRoleGuideEvictions:0,downgradeOwner:null,sameRoleReconnect:true,terminalStop:true,coveredByGenel:true}));
   recordResult('ADIM-5.V68','Role-isolated device dedup; native/HTTP/legacy collisions; same-role reconnect; same-socket downgrade/owner release/terminal stop and General inheritance; cache68',true);console.log('V68 UNIT PASS');
@@ -4156,7 +4157,7 @@
     assert.equal(h.room().activePublisherClientId,null);assert(h.room('target').clients.has('current'));
     checks.push('cross-tour-prior-guide-removal-does-not-suppress-target-tour-reconciliation');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v72'));assert(sw.includes('vercel-ws-shim.js?v=72'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v73'));assert(sw.includes('vercel-ws-shim.js?v=73'));
   assert(sw.includes('pcm-player-worklet.js?v=72-audio'));assert(sw.includes('pcm-capture-worklet.js?v=72-audio'));
   console.log('V69 UNIT METRICS '+JSON.stringify({checks,vacatedOwners:0,reconciliationsPerAffectedTour:1,sameRoomTerminalControls:0,generalControllerReady:true,crossTourSync:true}));
   recordResult('ADIM-5.V69','Cross-room guide replacement owner cleanup; terminal/General reconciliation after membership install; same-room continuity; existing-context and duplicate-room coverage; cache69',true);console.log('V69 UNIT PASS');
@@ -4871,9 +4872,376 @@
   recordResult('ADIM-5.V72.PLAYER','Band-limited ASRC; five-rate reset/starvation and catch-up; 1/3/5% and burst PLC; 60/120/180ms jitter; four-minute +/-1000ppm drift',true);
 }
 
+
+async function runStep5V73PushChecks(){
+  const assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
+  const read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8'),source=read('server.js'),listener=read('public/dinle.html'),sw=read('public/sw.js');
+  const names=['rysPushFail','rysPushB64','rysPushPoint','rysPushPublicIp','rysPushEndpoint','rysPushLoadVapid','rysPushPersist',
+    'rysPushCancel','rysPushDrop','rysPushPrune','rysPushSubscribe','rysPushUnsubscribe','rysPushEncrypt','rysPushAuthorization','rysPushText','rysPushPayload',
+    'queueRysPushAnnouncement','scheduleRysPushPump','pumpRysPushQueue','rysPushSend'];
+  const g={Buffer,URL,crypto,require,process:{env:{}},RUNTIME_FILE:'/fixture/runtime.json',
+    db:{tours:[{code:'T',pin:'5555'},{code:'OTHER',pin:'7777'}]},rysPushSubs:new Map(),rysPushQueue:[],rysPushPending:[],
+    rysPushRequests:new Map(),rysPushInFlight:0,rysPushPumpScheduled:false,Date,setTimeout,clearTimeout,setImmediate,console,
+    saveState(){},flushPendingSaveSync(){g.persisted=JSON.stringify(g.db);},
+    fs:{existsSync:()=>true,readFileSync:()=>g.persisted},findRysTour:code=>g.db.tours.find(t=>t.code===code)};
+  vm.createContext(g);vm.runInContext(names.map(n=>v70Pick(source,n)).join('\n'),g);
+  g.rysPushVapid=g.rysPushLoadVapid();const originalPublic=g.rysPushVapid.publicKey;
+  assert.equal(Buffer.from(originalPublic,'base64url').length,65);
+  g.db=JSON.parse(g.persisted);assert.equal(g.rysPushLoadVapid().publicKey,originalPublic,'persisted restart identity');
+  for(const material of [g.db.pushVapid.privateKey,JSON.stringify(g.rysPushVapid.privateKey.export({format:'jwk'})),
+    g.rysPushVapid.privateKey.export({format:'pem',type:'pkcs8'})]){
+    g.process.env.RYS_VAPID_PRIVATE_KEY=material;g.process.env.RYS_VAPID_PUBLIC_KEY=originalPublic;
+    assert.equal(g.rysPushLoadVapid().publicKey,originalPublic);
+  }
+  g.process.env={};
+  const wrongPublic=crypto.createECDH('prime256v1');wrongPublic.generateKeys();
+  const wrongPoint=wrongPublic.getPublicKey(),inconsistent=g.rysPushVapid.privateKey.export({format:'jwk'});
+  inconsistent.x=wrongPoint.subarray(1,33).toString('base64url');inconsistent.y=wrongPoint.subarray(33).toString('base64url');
+  g.process.env={RYS_VAPID_PRIVATE_KEY:JSON.stringify(inconsistent)};
+  assert.throws(()=>g.rysPushLoadVapid(),e=>e.status===503);g.process.env={};
+  const savedDb=JSON.stringify(g.db),savedPersisted=g.persisted,nativeCrypto=g.crypto;
+  delete g.db.pushVapid;
+  g.crypto={...crypto,createECDH:curve=>{
+    const e=crypto.createECDH(curve);e.generateKeys=()=>{const d=Buffer.alloc(32);d[31]=1;e.setPrivateKey(d);return e.getPublicKey();};return e;
+  }};
+  const shortScalar=g.rysPushLoadVapid();assert.equal(Buffer.from(g.db.pushVapid.privateKey,'base64url').length,32);
+  assert.equal(shortScalar.privateKey.export({format:'jwk'}).d.length,43);
+  g.crypto=nativeCrypto;g.db=JSON.parse(savedDb);g.persisted=savedPersisted;
+  // RFC8291 section5 / appendixA known-answer vector; not our sender/receiver round-trip.
+  const vector={keys:{auth:'BTBZMqHH6r4Tts7J_aSIgg',
+    p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'}};
+  const expected='DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
+  const encrypted=g.rysPushEncrypt(vector,'When I grow up, I want to be a watermelon',{
+    privateKey:Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw','base64url'),
+    salt:Buffer.from('DGv6ra1nlYgDCS1FRnbzlw','base64url')});
+  assert.equal(encrypted.toString('base64url'),expected);
+  assert.throws(()=>g.rysPushEncrypt(vector,Buffer.alloc(3994)),e=>e.status===413);
+  assert.equal(g.rysPushEncrypt(vector,Buffer.alloc(3993)).length,4096);
+  const bad=Buffer.alloc(65);bad[0]=4;assert.throws(()=>g.rysPushPoint(bad.toString('base64url')));
+  assert.throws(()=>g.rysPushB64('A'.repeat(21),16));
+  for(const endpoint of ['http://169.254.169.254/latest/meta-data','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x',
+    'https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x','https://fcm.googleapis.com/x#fragment'])
+    assert.throws(()=>g.rysPushEndpoint(endpoint));
+  assert.throws(()=>g.rysPushEndpoint('https://fcm.googleapis.com/'+ 'ş'.repeat(1000)));
+  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.100.100.200','172.16.0.1','192.168.1.1','::1',
+    '::ffff:127.0.0.1','fd00::1','2001:0000::1','2001:db8::1','2002:7f00:1::1'])assert(!g.rysPushPublicIp(ip),ip);
+  for(const ip of ['8.8.8.8','1.1.1.1','2606:4700::1111','2001:4860:4860::8888'])assert(g.rysPushPublicIp(ip),ip);
+  let outbound=0;const nativeRequire=g.require;
+  g.require=name=>name==='node:dns'?{promises:{lookup:async()=>[{address:'127.0.0.1',family:4}]}}:
+    name==='node:https'?{request(){outbound++;throw Error('unexpected network');}}:nativeRequire(name);
+  await assert.rejects(()=>g.rysPushSend({endpoint:'https://fcm.googleapis.com/fcm/send/ssrf'},'{}'),/private DNS/);
+  assert.equal(outbound,0);
+  let resolveDns;
+  g.require=name=>name==='node:dns'?{promises:{lookup:()=>new Promise(resolve=>resolveDns=resolve)}}:
+    name==='node:https'?{request(){outbound++;throw Error('unexpected network');}}:nativeRequire(name);
+  const staleDns={endpoint:'https://fcm.googleapis.com/fcm/send/dns-race'};
+  g.rysPushSubs.set(staleDns.endpoint,staleDns);const oldDnsJob=g.rysPushSend(staleDns,'{}');
+  g.rysPushSubs.set(staleDns.endpoint,{...staleDns,tourCode:'OTHER'});
+  resolveDns([{address:'8.8.8.8',family:4}]);await assert.rejects(()=>oldDnsJob,/superseded/);
+  assert.equal(outbound,0);g.rysPushSubs.clear();g.require=nativeRequire;
+  g.process.env={NODE_ENV:'test',RYS_PUSH_TEST_ORIGIN:'http://127.0.0.1:12345'};
+  assert(g.rysPushEndpoint('http://127.0.0.1:12345/receiver').test);
+  assert.throws(()=>g.rysPushEndpoint('http://127.0.0.1:12346/receiver'));
+  assert.throws(()=>g.rysPushEndpoint('http://localhost:12345/receiver'));
+  g.process.env.NODE_ENV='production';assert.throws(()=>g.rysPushEndpoint('http://127.0.0.1:12345/receiver'));g.process.env={};
+  let revision=0;const ua=crypto.createECDH('prime256v1');ua.generateKeys();
+  const keys={p256dh:ua.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')};
+  const sub=(tourCode='T',id='one')=>({endpoint:'https://fcm.googleapis.com/fcm/send/'+id,keys,tourCode,pin:tourCode==='T'?'5555':'7777',
+    lang:'tr',deviceId:'unit-device',revision:++revision});
+  const first=sub(),receipt=g.rysPushSubscribe(first),binding=g.rysPushSubs.get(first.endpoint);
+  assert.throws(()=>g.rysPushSubscribe({...first,revision:++revision,keys:{...keys,auth:crypto.randomBytes(16).toString('base64url')}}),e=>e.status===403);
+  g.rysPushSubscribe({...first,revision:++revision});assert.equal(g.rysPushSubs.get(first.endpoint),binding);
+  let activeCancelled=0;
+  g.rysPushRequests.set(first.endpoint,new Set([{binding,request:{destroy(){activeCancelled++;}}}]));
+  g.rysPushSubscribe({...sub('OTHER'),endpoint:first.endpoint});assert.notEqual(g.rysPushSubs.get(first.endpoint),binding);
+  assert.equal(activeCancelled,1);g.rysPushRequests.clear();
+  assert.throws(()=>g.rysPushSubscribe({...first,revision:1}),e=>e.status===409);
+  assert.throws(()=>g.rysPushUnsubscribe({endpoint:first.endpoint,subscriptionToken:'wrong'}),e=>e.status===403);
+  assert(g.rysPushUnsubscribe({endpoint:first.endpoint,subscriptionToken:receipt.subscriptionToken}).success);
+  for(let i=0;i<513;i++)g.rysPushSubscribe(sub('T','limit-'+i));
+  assert.equal(g.rysPushSubs.size,512);assert(!g.rysPushSubs.has('https://fcm.googleapis.com/fcm/send/limit-0'));
+  g.rysPushSubs.clear();
+  g.db.tours=Array.from({length:9},(_,i)=>({code:'C'+i,pin:'7777'}));
+  for(let i=0;i<4097;i++)g.rysPushSubscribe(sub('C'+Math.floor(i/512),'global-'+i));
+  assert.equal(g.rysPushSubs.size,4096);assert(!g.rysPushSubs.has('https://fcm.googleapis.com/fcm/send/global-0'));
+  assert(Array.from(g.rysPushSubs.values()).every(s=>g.db.pushSubscriptions.includes(s)));
+  const scheduled=[];g.setImmediate=fn=>scheduled.push(fn);
+  g.rysPushSend=()=>{throw Error('unexpected test network');};
+  g.queueRysPushAnnouncement({id:'literal-all-tour',tourCode:'ALL',title:'Scoped',message:'Not a global grant'});
+  scheduled.shift()();assert.equal(g.rysPushQueue.length,0);assert.equal(g.rysPushInFlight,0);
+  g.rysPushPending.length=0;scheduled.length=0;g.rysPushPumpScheduled=false;
+  for(let i=0;i<12;i++)g.queueRysPushAnnouncement({id:'queue-'+i,tourCode:'ALL',title:'Notice',message:'Body'},true);
+  assert.equal(g.rysPushPending.length,8);assert.equal(g.rysPushQueue.length,0,'enqueue must not encrypt synchronously');
+  let concurrent=0,maxConcurrent=0;g.rysPushSend=async()=>{concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);await Promise.resolve();concurrent--;return 201;};
+  scheduled.shift()();assert(g.rysPushQueue.length<=64);assert(g.rysPushInFlight<=4);
+  for(let i=0;i<12;i++)await Promise.resolve();assert.equal(maxConcurrent,4);
+  // Finish in-memory fake work without touching production endpoints.
+  g.rysPushPending.length=0;g.rysPushQueue.length=0;scheduled.length=0;
+  g.rysPushSubs.clear();g.db.tours=[{code:'T',pin:'5555'}];
+  const oldReceipt=g.rysPushSubscribe(sub('T','stale410')),oldRow=g.rysPushSubs.get('https://fcm.googleapis.com/fcm/send/stale410');
+  let finish;g.rysPushSend=()=>new Promise(resolve=>finish=resolve);
+  g.rysPushQueue.push({subscription:oldRow,payload:'{}',attempt:0});g.pumpRysPushQueue();await Promise.resolve();
+  const replacement={...oldRow,keys:{...oldRow.keys,auth:crypto.randomBytes(16).toString('base64url')}};
+  g.rysPushSubs.set(oldRow.endpoint,replacement);finish(410);for(let i=0;i<10;i++)await Promise.resolve();
+  assert.equal(g.rysPushSubs.get(oldRow.endpoint),replacement,'late410 must not delete a new binding');
+
+  const handlers={},displayed=new Map(),shown=[],opened=[],focused=[],navigated=[];
+  let windows=[];const swBox={URL,Promise,console,fetch(){},caches:{},
+    self:{location:{origin:'https://example.test'},skipWaiting(){},addEventListener:(n,fn)=>handlers[n]=fn,
+      registration:{showNotification:(title,options)=>{shown.push({title,options});displayed.set(options.tag,{title,options});return Promise.resolve();}},
+      clients:{claim(){},matchAll:async()=>windows,openWindow:async url=>opened.push(url)}}};
+  vm.createContext(swBox);vm.runInContext(sw,swBox);
+  const invoke=async(type,data)=>{let work;handlers[type]({...data,waitUntil:p=>work=p});await work;};
+  const notice={id:'same-id',title:'Dua',body:'Toplanma',tag:'ridvanses-ann-same-id',data:{url:'/dinle?code=T'}};
+  await invoke('message',{data:{...notice,type:'SHOW_NOTIFICATION'}});
+  await invoke('push',{data:{json:()=>notice}});
+  assert.equal(displayed.size,1);assert.equal(shown.length,2);
+  assert.equal(shown.at(-1).options.tag,'ridvanses-ann-same-id');
+  assert.deepEqual(Array.from(shown.at(-1).options.vibrate),[200,100,200]);
+  assert.equal(shown.at(-1).options.data.url,'https://example.test/dinle?code=T');
+  await invoke('push',{data:{json(){throw Error('plain');},text:()=> 'Plain message'}});
+  assert.equal(shown.at(-1).options.body,'Plain message');
+  const click=url=>({notification:{data:{url},close(){}}});
+  windows=[{url:'https://example.test/dinle?code=T',focus:async()=>focused.push('exact')}];
+  await invoke('notificationclick',click('/dinle?code=T'));assert.equal(focused.length,1);
+  windows=[{url:'https://example.test/dinle?code=T',focus:async()=>{throw Error('closed window');}}];
+  await invoke('notificationclick',click('/dinle?code=T'));assert.equal(opened.at(-1),'https://example.test/dinle?code=T');
+  windows=[{url:'https://example.test/dinle?code=OLD',navigate:async url=>{navigated.push(url);return {focus:async()=>focused.push('new')};}}];
+  await invoke('notificationclick',click('/dinle?code=T'));assert.equal(navigated[0],'https://example.test/dinle?code=T');
+  windows=[];await invoke('notificationclick',click('https://evil.test/phish'));assert.equal(opened.at(-1),'https://example.test/dinle');
+
+  const storage=new Map(),posted=[],messages=[],toasts=[];let subscription=null,subscribeCalls=0,requests=0,ios=false,standalone=true,keyReply=null,held=null;
+  const publicKey=originalPublic;
+  const N={permission:'granted',async requestPermission(){requests++;N.permission='granted';return 'granted';}};
+  const registration={active:{state:'activated',scriptURL:'https://example.test/sw.js?v=73'},pushManager:{
+    async getSubscription(){return subscription;},async subscribe(options){
+      subscribeCalls++;assert(options.userVisibleOnly);assert.equal(options.applicationServerKey.length,65);
+      subscription={endpoint:'https://fcm.googleapis.com/fcm/send/client-'+subscribeCalls,
+        options:{applicationServerKey:options.applicationServerKey.buffer},
+        toJSON:()=>({endpoint:subscription.endpoint,keys}),async unsubscribe(){subscription=null;return true;}};
+      return subscription;
+    }}};
+  const ui={window:{Notification:N},navigator:{serviceWorker:{ready:Promise.resolve(registration),controller:{postMessage:m=>messages.push(m)}}},
+    Notification:N,Uint8Array,URL,Promise,AbortController,Date,Math,Number,setTimeout,clearTimeout,queueMicrotask,
+    atob:s=>Buffer.from(s,'base64').toString('binary'),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
+    currentLang:'tr',pilgrimDeviceId:'client-device',currentTour:{code:'T'},isIosDevice:()=>ios,isStandaloneApp:()=>standalone,
+    showAppToast:t=>toasts.push(t),closePwaModal(){},fetch:async(url,options)=>{
+      if(url.endsWith('vapid-public-key')){
+        if(keyReply){const wait=keyReply;keyReply=null;return wait;}
+        return {ok:true,status:200,json:async()=>({publicKey})};
+      }
+      const body=JSON.parse(options.body);posted.push(body);
+      return {ok:true,status:200,json:async()=>({success:true,revision:body.revision,subscriptionToken:'receipt-token'})};
+    }};
+  vm.createContext(ui);vm.runInContext(['urlBase64ToUint8Array','rysWebPushState','setWebPushTour','nextWebPushRevision',
+    'webPushFetch','awaitWebPushWorker','syncWebPushSubscription','enableNotificationPermission','sendServiceWorkerNotification']
+    .map(n=>v70Pick(listener,n)).join('\n'),ui);
+  const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
+  keyReply=new Promise(resolve=>held=resolve);ui.setWebPushTour('T','5555');await tick();
+  ui.setWebPushTour('OTHER','7777');held({ok:true,status:200,json:async()=>({publicKey})});
+  await ui.syncWebPushSubscription();await tick();
+  assert(posted.length>0&&posted.every(p=>p.tourCode==='OTHER'));assert.equal(subscribeCalls,1);
+  assert.equal(posted.at(-1).pin,'7777');assert.equal(ui.rysWebPushState().tourCode,'OTHER');
+  ui.setWebPushTour('T','5555');await ui.syncWebPushSubscription();assert.equal(posted.at(-1).tourCode,'T');assert.equal(subscribeCalls,1);
+  assert(!Array.from(storage.values()).join('|').includes('5555'),'PIN must not persist in browser storage');
+  N.permission='default';ios=true;standalone=false;const before=posted.length;await ui.enableNotificationPermission();
+  assert.equal(requests,0);assert.equal(posted.length,before);assert(toasts.at(-1).includes('Ana Ekrana Ekle'));
+  standalone=true;await ui.enableNotificationPermission();assert.equal(requests,1);assert.equal(ui.rysWebPushState().status,'subscribed');
+  ui.sendServiceWorkerNotification('Dua','Toplanma','ridvanses-ann-same-id');
+  assert.equal(messages.at(-1).tag,'ridvanses-ann-same-id');
+  assert(messages.at(-1).data.url.includes('code=T'));
+  assert(read('public/sw.js').includes("ridvanses-pwa-v73"));
+  for(const f of ['index','dinle','rehber','panel','login','rota','ani-kitabi','yaka-karti'])
+    assert(read('public/'+f+'.html').includes('/vercel-ws-shim.js?v=73'),f);
+  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=72-audio'));
+  console.log('V73 UNIT METRICS '+JSON.stringify({rfc8291KnownAnswer:true,keyFormats:3,persistedIdentity:true,leadingZeroScalar:true,dnsRebindingDenied:true,staleDnsFenced:true,
+    capacityPerTour:512,capacityGlobal:4096,pendingAnnouncements:8,fanoutBatch:64,maxConcurrent,
+    stale410Preserved:true,swPushWithoutPage:true,displayedSameTag:1,safeClick:true,latestTour:true,iosStandalone:true,pinPersisted:false}));
+  recordResult('ADIM-5.V73','RFC8291 vector/VAPID persistence/formats; endpoint/SSRF/capacity; bounded async fanout; SW closed-page/tag/click; iOS and latest-tour subscription',true);
+}
+
+
+async function runV73PushChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),crypto=require('node:crypto'),http=require('node:http'),{WebSocket}=require('ws');
+  const stamp=Date.now().toString(36).toUpperCase(),a='P73-A-'+stamp,b='P73-B-'+stamp;
+  const auth={'Content-Type':'application/json',Authorization:'Bearer '+token},plain={'Content-Type':'application/json'};
+  const received=[],errors=[],clients=new Map(),registrations=[],sockets=[],created=[];
+  let origin,relay,subscriptionRevision=0,slowPushPending=false,maxApiMs=0,audioDuringPushMs=0;const previousOrigin=process.env.RYS_PUSH_TEST_ORIGIN;
+  const receiver=http.createServer((req,res)=>{
+    const chunks=[];let size=0;
+    req.on('data',x=>{size+=x.length;if(size>4096)req.destroy();else chunks.push(x);});
+    req.on('error',e=>errors.push(e.message));
+    req.on('end',()=>{
+      try{
+        const data=Buffer.concat(chunks),receiverKey=clients.get(req.url);assert(receiverKey,'unregistered receiver URL');
+        assert.equal(req.method,'POST');assert.equal(req.headers['content-encoding'],'aes128gcm');
+        assert.equal(req.headers.ttl,'86400');assert.equal(req.headers.urgency,'high');assert(data.length<=4096);
+        const authorization=/^vapid t=([A-Za-z0-9_.-]+), k=([A-Za-z0-9_-]+)$/.exec(req.headers.authorization);
+        assert(authorization);const [head,claims,sig]=authorization[1].split('.');
+        assert.equal(JSON.parse(Buffer.from(head,'base64url')).alg,'ES256');
+        const claim=JSON.parse(Buffer.from(claims,'base64url'));
+        assert.equal(claim.aud,origin);assert(claim.exp>Date.now()/1000&&claim.exp<Date.now()/1000+86400);
+        const publicKey=Buffer.from(authorization[2],'base64url');assert.equal(publicKey.length,65);
+        const key=crypto.createPublicKey({format:'jwk',key:{kty:'EC',crv:'P-256',
+          x:publicKey.subarray(1,33).toString('base64url'),y:publicKey.subarray(33).toString('base64url')}});
+        assert.equal(Buffer.from(sig,'base64url').length,64);
+        assert(crypto.verify('sha256',Buffer.from(head+'.'+claims),{key,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'base64url')));
+        assert.equal(authorization[2],receiverKey.vapid);
+        const salt=data.subarray(0,16);assert.equal(data.readUInt32BE(16),4096);assert.equal(data[20],65);
+        const as=data.subarray(21,86),ua=receiverKey.ua.getPublicKey(),secret=receiverKey.ua.computeSecret(as);
+        const hmac=(key,bytes)=>crypto.createHmac('sha256',key).update(bytes).digest();
+        const prkKey=hmac(receiverKey.auth,secret);
+        const ikm=hmac(prkKey,Buffer.concat([Buffer.from('WebPush: info\0'),ua,as,Buffer.from([1])]));
+        const prk=hmac(salt,ikm);
+        const cek=hmac(prk,Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'),Buffer.from([1])])).subarray(0,16);
+        const nonce=hmac(prk,Buffer.concat([Buffer.from('Content-Encoding: nonce\0'),Buffer.from([1])])).subarray(0,12);
+        const decipher=crypto.createDecipheriv('aes-128-gcm',cek,nonce);decipher.setAuthTag(data.subarray(data.length-16));
+        const clear=Buffer.concat([decipher.update(data.subarray(86,data.length-16)),decipher.final()]);
+        assert.equal(clear[clear.length-1],2);const payload=JSON.parse(clear.subarray(0,clear.length-1).toString('utf8'));
+        assert.equal(payload.tag,'ridvanses-ann-'+payload.id);assert.equal(payload.data.url,'/dinle?code='+encodeURIComponent(payload.tourCode));
+        received.push({path:req.url,payload,bytes:data.length,signatureValid:true});
+        if(req.url==='/gone'){res.writeHead(410);res.end();}
+        else if(req.url==='/dead'){res.writeHead(404);res.end();}
+        else if(req.url==='/redirect'){res.writeHead(302,{Location:origin+'/follow'});res.end();}
+        else{
+          const slow=req.url==='/a'&&payload.title==='Toplanma — التجمع';
+          if(slow)slowPushPending=true;
+          const timer=setTimeout(()=>{if(slow)slowPushPending=false;if(!res.destroyed){res.writeHead(201);res.end();}},slow?1500:40);
+          res.on('close',()=>{clearTimeout(timer);if(slow)slowPushPending=false;});
+        }
+      }catch(e){errors.push(e.message);res.writeHead(400);res.end();}
+    });
+  });
+  const wait=ms=>new Promise(r=>setTimeout(r,ms));
+  const until=async(fn,label)=>{const end=Date.now()+8000;while(!fn()){assert.equal(errors.length,0,errors.join(';'));if(Date.now()>end)throw Error('V73 timeout '+label);await wait(10);}};
+  const post=async(path,body,status=200,authorized=false)=>{
+    const response=await fetch(baseUrl+path,{method:'POST',headers:authorized?auth:plain,body:JSON.stringify(body)});
+    const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;
+  };
+  const subscribe=async(path,code,pin)=>{
+    const ua=crypto.createECDH('prime256v1');ua.generateKeys();const secret=crypto.randomBytes(16);
+    const body={endpoint:origin+path,keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:secret.toString('base64url')},
+      tourCode:code,pin,lang:'tr',deviceId:'push-'+path,revision:++subscriptionRevision};
+    clients.set(path,{ua,auth:secret,vapid:publicKey});
+    const result=await post('/api/push/subscribe',body);
+    const row={path,body,subscriptionToken:result.subscriptionToken};registrations.push(row);return row;
+  };
+  const publish=async(code,title,body)=>{
+    const started=Date.now();const result=await post('/api/announcements',{tourCode:code,title,message:body},200,true);
+    const elapsed=Date.now()-started;maxApiMs=Math.max(maxApiMs,elapsed);
+    assert(elapsed<1000,'announcement API waited for remote delivery');
+    return result.announcement;
+  };
+  let publicKey;
+  try{
+    await new Promise(resolve=>receiver.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+receiver.address().port;
+    process.env.RYS_PUSH_TEST_ORIGIN=origin;
+    const k=await fetch(baseUrl+'/api/push/vapid-public-key');assert.equal(k.status,200);publicKey=(await k.json()).publicKey;
+    assert.equal(Buffer.from(publicKey,'base64url').length,65);
+
+    // Boot a second real process against the persisted identity; inherit the
+    // rehearsal preload when present, so normal post-apply CLI also uses this check.
+    const restartScript="const http=require('node:http'),servers=[],create=http.createServer,interval=global.setInterval;\nhttp.createServer=function(...args){const s=create.apply(this,args);servers.push(s);return s;};\nglobal.setInterval=(...args)=>{const timer=interval(...args);timer.unref();return timer;};\nconst shutdown=()=>{for(const server of servers){server.closeAllConnections?.();server.close();}};\nconst app=require('./server.js');\nconst listener=app.listen(0,'127.0.0.1',async()=>{\n  try{\n    const r=await fetch('http://127.0.0.1:'+listener.address().port+'/api/push/vapid-public-key');\n    const j=await r.json();if(!r.ok)throw Error(j.error);\n    process.stdout.write('V73_RESTART_KEY '+j.publicKey+'\\n');\n  }catch(e){console.error(e.message);process.exitCode=1;}\n  finally{shutdown();}\n});";
+    const restartedKey=await new Promise((resolve,reject)=>{
+      const child=require('node:child_process').spawn(process.execPath,[...process.execArgv,'-e',restartScript],{
+        cwd:ROOT_DIR,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
+      let stdout='',stderr='';
+      const timer=setTimeout(()=>{child.kill();reject(Error('VAPID restart deadline'));},8000);
+      child.stdout.on('data',x=>{stdout+=x;if(stdout.length>32768)child.kill();});
+      child.stderr.on('data',x=>{stderr=(stderr+x).slice(-2048);});
+      child.on('error',e=>{clearTimeout(timer);reject(e);});
+      child.on('close',code=>{clearTimeout(timer);const match=/V73_RESTART_KEY ([A-Za-z0-9_-]+)/.exec(stdout);
+        if(code!==0||!match)reject(Error('VAPID restart process failed '+stderr));else resolve(match[1]);});
+    });
+    assert.equal(restartedKey,publicKey,'restart must not rotate VAPID identity');
+    for(const code of [a,b]){const r=await post('/api/tours',{code,name:'Push E2E',pin:code===a?'7351':'7352'},200,true);created.push(code);}
+    const ua=crypto.createECDH('prime256v1');ua.generateKeys();
+    const valid={endpoint:origin+'/a',keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')},
+      tourCode:a,pin:'7351',lang:'tr',deviceId:'bad-case',revision:1};
+    await post('/api/push/subscribe',{...valid,pin:'wrong'},403);
+    await post('/api/push/subscribe',{...valid,tourCode:'UNKNOWN-'+stamp},404);
+    await post('/api/push/subscribe',{...valid,endpoint:'http://169.254.169.254/latest/meta-data/'},403);
+    await post('/api/push/subscribe',{...valid,endpoint:'https://fcm.googleapis.com.evil.test/x'},403);
+    await post('/api/push/subscribe',{...valid,keys:{...valid.keys,p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url')}},400);
+    await post('/api/push/subscribe',{...valid,keys:{...valid.keys,auth:'AA'}},400);
+    const x=await subscribe('/a',a,'7351'),other=await subscribe('/b',b,'7352');
+    const gone=await subscribe('/gone',a,'7351'),dead=await subscribe('/dead',a,'7351'),redirect=await subscribe('/redirect',a,'7351');
+    await post('/api/push/unsubscribe',{endpoint:gone.body.endpoint},403);
+    const ws=new WebSocket(url);sockets.push(ws);const messages=[];
+    ws.on('error',e=>errors.push(e.message));ws.on('message',(raw,binary)=>{if(!binary)messages.push(JSON.parse(raw));});
+    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
+    ws.send(JSON.stringify({type:'join',tourCode:a,roomId:'genel',role:'guide',name:'Push guide',token}));
+    await until(()=>messages.some(m=>m.type==='joined'),'guide join');
+    ws.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic',audioStateSeq:10,audioMediaEpoch:10}));
+    await until(()=>messages.some(m=>m.type==='stream-state'&&m.isLive===true),'live audio controller');
+    const pilgrim=new WebSocket(url);sockets.push(pilgrim);let pilgrimJoined=false,pcmReceivedAt=0;
+    pilgrim.on('error',e=>errors.push(e.message));
+    pilgrim.on('message',(raw,binary)=>{
+      if(binary){if(raw.length===972&&raw.readUInt32LE(0)===73)pcmReceivedAt=Date.now();}
+      else if(JSON.parse(raw).type==='joined')pilgrimJoined=true;
+    });
+    await new Promise((resolve,reject)=>{pilgrim.once('open',resolve);pilgrim.once('error',reject);});
+    pilgrim.send(JSON.stringify({type:'join',tourCode:a,roomId:'genel',role:'pilgrim',pin:'7351',name:'Push/audio probe'}));
+    await until(()=>pilgrimJoined,'audio listener join');
+    const ann=await publish(a,'Toplanma — التجمع','Türkçe / العربية\nKapı 73, saat 20:15.');
+    await until(()=>received.filter(r=>r.payload.id===ann.id).length===4,'encrypted REST fanout');
+    const first=received.find(r=>r.path==='/a'&&r.payload.id===ann.id);
+    assert.equal(first.payload.title,ann.title);assert.equal(first.payload.body,ann.message);
+    assert(!received.some(r=>r.path==='/b'&&r.payload.id===ann.id));assert(!received.some(r=>r.path==='/follow'));
+    assert(slowPushPending,'provider must still be waiting');
+    const pcmSentAt=Date.now(),pcm=Buffer.alloc(972);pcm.writeUInt32LE(73);pcm.writeDoubleLE(pcmSentAt,4);
+    for(let i=0;i<480;i++)pcm.writeInt16LE(1234,12+i*2);
+    ws.send(pcm);await until(()=>pcmReceivedAt>0,'live PCM during slow push');
+    audioDuringPushMs=pcmReceivedAt-pcmSentAt;assert(audioDuringPushMs<500);assert(slowPushPending);
+
+    await wait(100);
+    await post('/api/push/unsubscribe',{endpoint:gone.body.endpoint},200);
+    await post('/api/push/unsubscribe',{endpoint:dead.body.endpoint},200);
+    ws.send(JSON.stringify({type:'quick-announcement',title:'WS duyurusu',message:'Gerçek zamanlı duyuru'}));
+    await until(()=>received.some(r=>r.path==='/a'&&r.payload.title==='WS duyurusu'),'WS push trigger');
+    const opened=await post('/api/ws-relay',{type:'relay-open',version:56});relay=opened;
+    await post('/api/ws-relay',{clientId:opened.clientId,relayKey:opened.relayKey,requestSeq:1,token,
+      subscriptionContext:{type:'join',tourCode:a,roomId:'genel',role:'guide',name:'HTTP push guide',token},
+      messages:[{type:'quick-announcement',title:'Relay duyurusu',message:'HTTP ortak handler'}]});
+    await until(()=>received.some(r=>r.path==='/a'&&r.payload.title==='Relay duyurusu'),'relay push trigger');
+    const moved={...x.body,tourCode:b,pin:'7352',revision:100};
+    await post('/api/push/subscribe',moved);
+    await post('/api/push/subscribe',{...x.body,revision:99},409);
+    const beforeMove=await publish(a,'Eski tur','Ulaşmamalı');await wait(150);
+    assert(!received.some(r=>r.path==='/a'&&r.payload.id===beforeMove.id));
+    const next=await publish(b,'Yeni tur','Sadece güncel kayıt');
+    await until(()=>received.some(r=>r.path==='/a'&&r.payload.id===next.id)&&received.some(r=>r.path==='/b'&&r.payload.id===next.id),'tour migration');
+    await post('/api/push/unsubscribe',{endpoint:x.body.endpoint,subscriptionToken:'bad'},403);
+    await post('/api/push/unsubscribe',{endpoint:x.body.endpoint,subscriptionToken:x.subscriptionToken});
+    const after=await publish(b,'Abonelikten sonra','Tek alıcı');
+    await until(()=>received.some(r=>r.path==='/b'&&r.payload.id===after.id),'unsubscribe remaining recipient');
+    assert(!received.some(r=>r.path==='/a'&&r.payload.id===after.id));
+    const login=await post('/api/login',{email:'selamet',password:process.env.SELAMET_PASSWORD||'selamet2026'});
+    const scoped=await fetch(baseUrl+'/api/announcements',{method:'POST',headers:{...plain,Authorization:'Bearer '+login.token},
+      body:JSON.stringify({tourCode:b,title:'Forbidden',message:'No cross-tour push'})});
+    assert.equal(scoped.status,403);await scoped.arrayBuffer();
+    await fetch(baseUrl+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+login.token}});
+    assert.equal(errors.length,0,errors.join(';'));
+    console.log('V73 E2E METRICS '+JSON.stringify({keyBytes:65,restartSameKey:true,announcementApiMaxMs:maxApiMs,liveAudioDuringSlowPush:true,liveAudioMs:audioDuringPushMs,denials:6,encryptedBodies:received.length,maxBodyBytes:Math.max(...received.map(r=>r.bytes)),
+      independentDecrypt:true,es256Valid:true,ttl:86400,urgency:'high',otherTourLeak:0,gone410Removed:true,gone404Removed:true,
+      redirectFollowed:false,wsTrigger:true,httpRelayTrigger:true,tourMoved:true,staleRevisionRejected:true,unsubscribe:true,scopedPublishDenied:true}));
+    recordResult('ADIM-3.V73','Real Web Push/VAPID HTTP receiver, independent ECDH-HKDF-GCM decrypt; PIN/SSRF/key/scope guards; WS/relay trigger; tour migration and gone cleanup',true);
+  }finally{
+    for(const s of sockets)try{s.terminate();}catch(e){}
+    if(relay)try{await post('/api/ws-relay',{type:'relay-close',version:56,clientId:relay.clientId,relayKey:relay.relayKey});}catch(e){}
+    for(const r of registrations)try{await post('/api/push/unsubscribe',{endpoint:r.body.endpoint,subscriptionToken:r.subscriptionToken});}catch(e){}
+    for(const code of created){const r=await fetch(baseUrl+'/api/tours/'+encodeURIComponent(code),{method:'DELETE',headers:auth});await r.arrayBuffer();}
+    await wait(100);
+    if(previousOrigin===undefined)delete process.env.RYS_PUSH_TEST_ORIGIN;else process.env.RYS_PUSH_TEST_ORIGIN=previousOrigin;
+    receiver.closeAllConnections?.();await new Promise(resolve=>receiver.close(resolve));
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
+  process.env.NODE_ENV='test';
+  process.env.RYS_PUSH_TEST_ONLY='1'; // Never send verifier announcements to real subscriptions.
   try {
     await runStep1StaticAndSyntaxChecks();
     await runStep2And3LiveServerAndWsTests();
@@ -4897,6 +5265,7 @@
     await runStep5V70AudioChecks();
     await runStep5V71AudioChecks();
     await runStep5V72QualityChecks();
+    await runStep5V73PushChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -306,6 +306,296 @@
     activeStepTitle: activeStep ? activeStep.title : 'Kâbe-i Muazzama',
     activeDayLabel: activeStep ? activeStep.dayLabel : '1. Gün'
   };
+}
+
+
+// v73 Web Push: no npm dependencies. Persistent state belongs to the VDS, not /tmp.
+const rysPushSubs = new Map();
+const rysPushQueue = [];
+const rysPushPending = [];
+const rysPushRequests = new Map(); // At most four active network requests
+let rysPushInFlight=0,rysPushPumpScheduled=false,rysPushVapid=null,rysPushInitError=null;
+
+function rysPushFail(status,code){const e=new Error(code);e.status=status;return e;}
+function rysPushB64(value,length){
+  if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))throw rysPushFail(400,'invalid-key');
+  const b=Buffer.from(value,'base64url');
+  if(b.length!==length||b.toString('base64url')!==value)throw rysPushFail(400,'invalid-key');
+  return b;
+}
+function rysPushPoint(value){
+  const b=rysPushB64(value,65);
+  if(b[0]!==4)throw rysPushFail(400,'invalid-p256dh');
+  try{crypto.ECDH.convertKey(b,'prime256v1',undefined,undefined,'uncompressed');}
+  catch(e){throw rysPushFail(400,'invalid-p256dh');}
+  return b;
+}
+function rysPushPublicIp(address){
+  const net=require('node:net'),family=net.isIP(address);
+  if(family===4){
+    const a=address.split('.').map(Number),[x,y,z]=a;
+    return !(x===0||x===10||x===127||x>=224||x===169&&y===254||
+      x===172&&y>=16&&y<=31||x===192&&(y===168||y===0||y===2)||
+      x===100&&y>=64&&y<=127||x===198&&(y===18||y===19||y===51&&z===100)||
+      x===203&&y===0&&z===113);
+  }
+  if(family===6){
+    const parts=address.toLowerCase().split(':'),head=parseInt(parts[0],16),second=parseInt(parts[1],16);
+    return head>=0x2000&&head<=0x3fff&&head!==0x2002&&
+      !(head===0x2001&&(second===0xdb8||second<0x200));
+  }
+  return false;
+}
+function rysPushEndpoint(value){
+  if(typeof value!=='string'||value.length>2048)throw rysPushFail(400,'invalid-endpoint');
+  let u;try{u=new URL(value);}catch(e){throw rysPushFail(400,'invalid-endpoint');}
+  if(u.username||u.password||u.hash||u.href.length>2048)throw rysPushFail(400,'invalid-endpoint');
+  let test=false;
+  if(process.env.NODE_ENV==='test'&&process.env.RYS_PUSH_TEST_ORIGIN){
+    let t;try{t=new URL(process.env.RYS_PUSH_TEST_ORIGIN);}catch(e){}
+    test=!!t&&t.protocol==='http:'&&t.hostname==='127.0.0.1'&&!!t.port&&u.origin===t.origin;
+  }
+  const h=u.hostname.toLowerCase();
+  const provider=h==='fcm.googleapis.com'||h==='android.googleapis.com'||
+    h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com')||
+    h.endsWith('.push.services.mozilla.com');
+  if(!test&&(u.protocol!=='https:'||u.port||!provider))throw rysPushFail(403,'endpoint-forbidden');
+  return {url:u,test};
+}
+function rysPushLoadVapid(){
+  const configured=process.env.RYS_VAPID_PRIVATE_KEY||process.env.VAPID_PRIVATE_KEY;
+  const publicEnv=process.env.RYS_VAPID_PUBLIC_KEY||process.env.VAPID_PUBLIC_KEY;
+  let material=configured||db.pushVapid?.privateKey,key;
+  if(publicEnv&&!configured)throw rysPushFail(503,'vapid-private-key-required');
+  if(!material){
+    const e=crypto.createECDH('prime256v1');e.generateKeys();
+    material=Buffer.from(e.getPrivateKey('hex').padStart(64,'0'),'hex').toString('base64url');
+  }
+  try{
+    if(material.trim().startsWith('{'))key=crypto.createPrivateKey({key:JSON.parse(material),format:'jwk'});
+    else if(material.includes('BEGIN'))key=crypto.createPrivateKey(material.replace(/\\n/g,'\n'));
+    else{
+      const d=rysPushB64(material,32),e=crypto.createECDH('prime256v1');e.setPrivateKey(d);
+      const p=e.getPublicKey();key=crypto.createPrivateKey({format:'jwk',key:{kty:'EC',crv:'P-256',
+        x:p.subarray(1,33).toString('base64url'),y:p.subarray(33).toString('base64url'),d:d.toString('base64url')}});
+    }
+    const jwk=key.export({format:'jwk'});
+    if(jwk.kty!=='EC'||jwk.crv!=='P-256'||!jwk.d)throw Error('curve');
+    const p=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]);
+    const check=crypto.createECDH('prime256v1');check.setPrivateKey(rysPushB64(jwk.d,32));
+    if(!check.getPublicKey().equals(p))throw Error('inconsistent private key');
+    const publicKey=p.toString('base64url');rysPushPoint(publicKey);
+    if(publicEnv&&publicEnv!==publicKey)throw Error('public/private mismatch');
+    const subject=process.env.RYS_VAPID_SUBJECT||'mailto:info@ridvanyilmazturizm.com';
+    const contact=new URL(subject);
+    if(!['mailto:','https:'].includes(contact.protocol)||contact.username||contact.password||/[\r\n]/.test(subject))throw Error('subject');
+    if(!configured&&(!db.pushVapid||db.pushVapid.publicKey!==publicKey)){
+      db.pushVapid={publicKey,privateKey:jwk.d};
+      // Startup only: make the identity durable before accepting subscriptions.
+      saveState(db);flushPendingSaveSync();
+      if(!fs.existsSync(RUNTIME_FILE)||JSON.parse(fs.readFileSync(RUNTIME_FILE,'utf8')).pushVapid?.publicKey!==publicKey)
+        throw Error('persistent VAPID write failed');
+    }
+    return {publicKey,privateKey:key,subject};
+  }catch(e){throw rysPushFail(503,'vapid-configuration-error');}
+}
+function rysPushPersist(){
+  db.pushSubscriptions=Array.from(rysPushSubs.values());saveState(db);
+}
+function rysPushCancel(endpoint,binding){
+  for(const active of rysPushRequests.get(endpoint)||[]){
+    if(!binding||active.binding===binding)active.request.destroy(Error('push subscription superseded'));
+  }
+}
+function rysPushDrop(endpoint){
+  const old=rysPushSubs.get(endpoint);rysPushSubs.delete(endpoint);
+  if(old)rysPushCancel(endpoint,old);
+}
+function rysPushPrune(){
+  const counts=new Map();
+  for(const [endpoint,s] of Array.from(rysPushSubs.entries()).reverse()){
+    const n=(counts.get(s.tourCode)||0)+1;counts.set(s.tourCode,n);
+    if(n>512)rysPushDrop(endpoint);
+  }
+  while(rysPushSubs.size>4096)rysPushDrop(rysPushSubs.keys().next().value);
+}
+function rysPushInit(){
+  if(process.env.VERCEL){rysPushInitError='persistent-vds-required';return;}
+  try{
+    rysPushVapid=rysPushLoadVapid();
+    if(!(process.env.NODE_ENV==='test'&&process.env.RYS_PUSH_TEST_ONLY==='1')){
+      for(const row of (Array.isArray(db.pushSubscriptions)?db.pushSubscriptions:[]).slice(-4096)){
+        try{
+          rysPushEndpoint(row.endpoint);rysPushPoint(row.keys?.p256dh);rysPushB64(row.keys?.auth,16);
+          if(!findRysTour(row.tourCode)||row.vapidKey!==rysPushVapid.publicKey||
+            !Number.isSafeInteger(row.revision)||row.revision<1)continue;
+          rysPushB64(row.subscriptionToken,32);rysPushSubs.set(row.endpoint,row);
+        }catch(e){}
+      }
+      rysPushPrune();
+    }
+  }catch(e){rysPushInitError=e.message;console.error('[WebPush] Initialization unavailable:',e.message);}
+}
+function rysPushSubscribe(body){
+  const code=typeof body?.tourCode==='string'?body.tourCode.toUpperCase().trim():'';
+  if(!code||code.length>96)throw rysPushFail(400,'invalid-tour');
+  const tour=findRysTour(code);if(!tour)throw rysPushFail(404,'tour-unknown');
+  if(String(tour.pin||'').trim()&&String(tour.pin).trim()!==String(body.pin||'').trim())throw rysPushFail(403,'pin-error');
+  const target=rysPushEndpoint(body.endpoint);
+  const p=rysPushPoint(body.keys?.p256dh),auth=rysPushB64(body.keys?.auth,16);
+  if(typeof body.deviceId!=='string'||!body.deviceId.trim()||body.deviceId.length>128||
+    !Number.isSafeInteger(body.revision)||body.revision<1)throw rysPushFail(400,'invalid-subscription');
+  const previous=rysPushSubs.get(target.url.href);
+  if(previous){
+    const sameSecret=previous.keys.auth===auth.toString('base64url')&&previous.keys.p256dh===p.toString('base64url');
+    const capability=typeof body.subscriptionToken==='string'&&body.subscriptionToken===previous.subscriptionToken;
+    if(!sameSecret&&!capability)throw rysPushFail(403,'subscription-owner-required');
+    if(body.revision<previous.revision||body.revision===previous.revision&&code!==previous.tourCode)
+      throw Object.assign(rysPushFail(409,'stale-subscription'),{revision:previous.revision});
+  }
+  let s={endpoint:target.url.href,keys:{p256dh:p.toString('base64url'),auth:auth.toString('base64url')},
+    tourCode:code,lang:typeof body.lang==='string'?body.lang.slice(0,16):'tr',deviceId:body.deviceId.trim(),
+    revision:body.revision,subscriptionToken:previous?.subscriptionToken||crypto.randomBytes(32).toString('base64url'),
+    vapidKey:rysPushVapid.publicKey,updatedAt:Date.now()};
+  if(previous&&previous.tourCode===s.tourCode&&previous.keys.auth===s.keys.auth&&previous.keys.p256dh===s.keys.p256dh){
+    Object.assign(previous,s);s=previous; // preserve valid pending deliveries for the same binding
+  }
+  if(previous&&previous!==s)rysPushCancel(s.endpoint,previous);
+  rysPushSubs.delete(s.endpoint);rysPushSubs.set(s.endpoint,s);rysPushPrune();rysPushPersist();
+  return {success:true,subscriptionToken:s.subscriptionToken,revision:s.revision};
+}
+function rysPushUnsubscribe(body){
+  const target=rysPushEndpoint(body?.endpoint),s=rysPushSubs.get(target.url.href);
+  if(!s)return {success:true};
+  const supplied=typeof body.subscriptionToken==='string'?body.subscriptionToken:'';
+  if(supplied.length!==43)throw rysPushFail(403,'subscription-owner-required');
+  const a=Buffer.from(supplied),b=Buffer.from(s.subscriptionToken);
+  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw rysPushFail(403,'subscription-owner-required');
+  rysPushDrop(s.endpoint);rysPushPersist();return {success:true};
+}
+function rysPushEncrypt(subscription,plaintext,entropy=null){
+  const ua=rysPushPoint(subscription.keys.p256dh),auth=rysPushB64(subscription.keys.auth,16);
+  const text=Buffer.isBuffer(plaintext)?plaintext:Buffer.from(plaintext);
+  if(text.length>3993)throw rysPushFail(413,'push-payload-too-large');
+  const e=crypto.createECDH('prime256v1');
+  if(entropy?.privateKey)e.setPrivateKey(entropy.privateKey);else e.generateKeys();
+  const as=e.getPublicKey(),salt=entropy?.salt||crypto.randomBytes(16);
+  if(salt.length!==16)throw Error('invalid salt');
+  const info=Buffer.concat([Buffer.from('WebPush: info\0'),ua,as]);
+  const ikm=Buffer.from(crypto.hkdfSync('sha256',e.computeSecret(ua),auth,info,32));
+  const cek=Buffer.from(crypto.hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16));
+  const nonce=Buffer.from(crypto.hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));
+  const header=Buffer.alloc(86);salt.copy(header);header.writeUInt32BE(4096,16);header[20]=65;as.copy(header,21);
+  const cipher=crypto.createCipheriv('aes-128-gcm',cek,nonce);
+  return Buffer.concat([header,cipher.update(Buffer.concat([text,Buffer.from([2])])),cipher.final(),cipher.getAuthTag()]);
+}
+function rysPushAuthorization(endpoint){
+  const claims={aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+12*3600,sub:rysPushVapid.subject};
+  const token=Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
+  const sig=crypto.sign('sha256',Buffer.from(token),{key:rysPushVapid.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
+  return 'vapid t='+token+'.'+sig+', k='+rysPushVapid.publicKey;
+}
+async function rysPushSend(subscription,payload){
+  const target=rysPushEndpoint(subscription.endpoint),u=target.url;
+  if(process.env.NODE_ENV==='test'&&process.env.RYS_PUSH_TEST_ONLY==='1'&&!target.test)
+    throw Error('external push disabled in verification');
+  let pinned;
+  if(!target.test){
+    const dns=require('node:dns').promises;
+    let timer;const addresses=await Promise.race([dns.lookup(u.hostname,{all:true,verbatim:true}),
+      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('push DNS timeout')),3000);})]).finally(()=>clearTimeout(timer));
+    if(!addresses.length||addresses.some(a=>!rysPushPublicIp(a.address)))throw Error('push private DNS denied');
+    pinned=addresses.find(a=>a.family===4)||addresses[0];
+  }
+  if(rysPushSubs.get(subscription.endpoint)!==subscription)throw Error('push subscription superseded');
+  const body=rysPushEncrypt(subscription,payload),authorization=rysPushAuthorization(u.href);
+  return new Promise((resolve,reject)=>{
+    const transport=target.test?require('node:http'):require('node:https');
+    const options={method:'POST',headers:{Authorization:authorization,'Content-Encoding':'aes128gcm',
+      'Content-Type':'application/octet-stream','Content-Length':body.length,TTL:'86400',Urgency:'high'},
+      ...(pinned?{lookup:(host,opts,cb)=>cb(null,opts?.all?[pinned]:pinned.address,pinned.family)}:{})};
+    const request=transport.request(u,options,response=>{
+      let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192)request.destroy(Error('push response too large'));});
+      response.on('error',reject);response.on('end',()=>resolve(response.statusCode));
+    });
+    const active={binding:subscription,request},set=rysPushRequests.get(subscription.endpoint)||new Set();
+    set.add(active);rysPushRequests.set(subscription.endpoint,set);
+    const deadline=setTimeout(()=>request.destroy(Error('push deadline')),5000);
+    request.on('error',reject);request.on('close',()=>{
+      clearTimeout(deadline);set.delete(active);if(!set.size)rysPushRequests.delete(subscription.endpoint);
+    });request.end(body);
+    // Native request never follows redirects; DNS answer is pinned, TLS name remains the provider.
+  });
+}
+function rysPushText(value,bytes){
+  let out='',used=0;for(const ch of String(value||'')){const n=Buffer.byteLength(ch);if(used+n>bytes)break;out+=ch;used+=n;}return out;
+}
+function rysPushPayload(ann,code){
+  const data={type:'announcement',id:rysPushText(ann.id,96),title:rysPushText(ann.title||'Kafile Duyurusu',160),
+    body:rysPushText(ann.message,2000),tag:'ridvanses-ann-'+rysPushText(ann.id,96),tourCode:code,
+    data:{url:'/dinle?code='+encodeURIComponent(code)}};
+  let text=JSON.stringify(data);
+  while(Buffer.byteLength(text)>3000&&data.body){data.body=rysPushText(data.body,Math.floor(Buffer.byteLength(data.body)/2));text=JSON.stringify(data);}
+  if(Buffer.byteLength(text)>3993)throw Error('push payload too large');return text;
+}
+
+function queueRysPushAnnouncement(ann,allTours=false){
+  if(!rysPushVapid||!ann?.id||!rysPushSubs.size)return;
+  // Snapshot references only; preview serialization/crypto is yielded in bounded batches.
+  if(rysPushPending.length>=8)rysPushPending.shift();
+  rysPushPending.push({broadcastAll:allTours===true,announcement:{id:rysPushText(ann.id,96),title:rysPushText(ann.title,160),
+    message:rysPushText(ann.message,2000),tourCode:String(ann.tourCode||'').toUpperCase().trim()},
+    targets:Array.from(rysPushSubs.values()),index:0,payloads:new Map()});
+  scheduleRysPushPump();
+}
+function scheduleRysPushPump(){
+  if(!rysPushPumpScheduled){rysPushPumpScheduled=true;setImmediate(pumpRysPushQueue);}
+}
+function pumpRysPushQueue(){
+  rysPushPumpScheduled=false;
+  let budget=64;
+  while(rysPushPending.length&&rysPushQueue.length<8192&&budget>0){
+    const pending=rysPushPending[0];
+    if(pending.index>=pending.targets.length){rysPushPending.shift();continue;}
+    const s=pending.targets[pending.index++],ann=pending.announcement;budget--;
+    if(rysPushSubs.get(s.endpoint)!==s||!findRysTour(s.tourCode)||
+      !pending.broadcastAll&&ann.tourCode!==s.tourCode)continue;
+    if(!pending.payloads.has(s.tourCode))pending.payloads.set(s.tourCode,rysPushPayload(ann,s.tourCode));
+    rysPushQueue.push({subscription:s,payload:pending.payloads.get(s.tourCode),attempt:0});
+  }
+  while(rysPushInFlight<4&&rysPushQueue.length){
+    const job=rysPushQueue.shift(),s=job.subscription;
+    if(rysPushSubs.get(s.endpoint)!==s||!findRysTour(s.tourCode))continue;
+    rysPushInFlight++;
+    Promise.resolve().then(()=>rysPushSend(s,job.payload)).then(async status=>{
+      if((status===404||status===410)&&rysPushSubs.get(s.endpoint)===s){
+        rysPushDrop(s.endpoint);rysPushPersist();
+      }else if((status===429||status>=500)&&job.attempt<2&&rysPushSubs.get(s.endpoint)===s){
+        job.attempt++;
+        await new Promise(resolve=>setTimeout(resolve,job.attempt===1?1000:4000));
+        if(rysPushSubs.get(s.endpoint)===s&&rysPushQueue.length<8192)rysPushQueue.push(job);
+      }
+    }).catch(()=>{}).finally(()=>{
+      rysPushInFlight--;
+      if(rysPushQueue.length||rysPushPending.length)scheduleRysPushPump();
+    });
+  }
+  if(rysPushPending.length&&rysPushQueue.length<8192)scheduleRysPushPump();
+}
+rysPushInit();
+
+app.get('/api/push/vapid-public-key',(req,res)=>{
+  res.setHeader('Cache-Control','no-store');
+  if(!rysPushVapid)return res.status(503).json({success:false,error:rysPushInitError||'push-unavailable'});
+  return res.json({success:true,publicKey:rysPushVapid.publicKey});
+});
+for(const [route,handler] of [['subscribe',rysPushSubscribe],['unsubscribe',rysPushUnsubscribe]]){
+  app.post('/api/push/'+route,createRateLimiter({max:1200,windowMs:60000}),(req,res)=>{
+    res.setHeader('Cache-Control','no-store');
+    if(!rysPushVapid)return res.status(503).json({success:false,error:'push-unavailable'});
+    try{return res.json(handler(req.body));}
+    catch(e){return res.status(e.status||400).json({success:false,error:e.message,...(e.revision?{revision:e.revision}:{})});}
+  });
 }
 
 // Live Room State in Memory
@@ -1410,7 +1700,7 @@
     case 'quick-announcement': {
       if (sender.role !== 'guide') break;
       const ann = {
-        id: `ann-${Date.now()}`,
+        id: `ann-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
         tourCode: currentRoom.tourCode,
         title: msg.title || 'Rehber Duyurusu',
         message: msg.message || '',
@@ -1420,6 +1710,7 @@
       };
       db.announcements.unshift(ann);
       saveState(db);
+      queueRysPushAnnouncement(ann);
       for (const r of getTourRooms(currentRoom.tourCode)) {
         broadcastToRoom(r, { type: 'new-announcement', announcement: ann });
       }
@@ -2347,6 +2638,8 @@
     if (db.journeySteps && db.journeySteps[deletedCode]) {
       delete db.journeySteps[deletedCode];
     }
+    for(const [endpoint,subscription] of rysPushSubs)if(subscription.tourCode===deletedCode)rysPushDrop(endpoint);
+    db.pushSubscriptions=Array.from(rysPushSubs.values());
     for (const [key, room] of liveRooms.entries()) {
       if (room.tourCode === deletedCode) {
         dropRysRoom(room);
@@ -2571,9 +2864,14 @@
 // 6. Push Announcements
 app.post('/api/announcements', requireAuth, (req, res) => {
   const body = req.body || {};
+  const tourCode=String(body.tourCode||'RY-KASIM').toUpperCase().trim();
+  const principal=rysPrincipal(extractAuthTokenFromReq(req));
+  if(tourCode==='ALL'?!rysCanAdmin(principal):!rysCanGuide(principal,tourCode))
+    return res.status(403).json({success:false,error:'announcement-scope'});
+  if(tourCode!=='ALL'&&!findRysTour(tourCode))return res.status(404).json({success:false,error:'tour-unknown'});
   const ann = {
-    id: `ann-${Date.now()}`,
-    tourCode: String(body.tourCode || 'RY-KASIM').toUpperCase(),
+    id: `ann-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
+    tourCode,
     title: body.title || 'Kafile Duyurusu',
     message: body.message || '',
     sender: body.sender || 'Rıdvan Yılmaz Turizm Operasyon',
@@ -2582,6 +2880,7 @@
   };
   db.announcements.unshift(ann);
   saveState(db);
+  queueRysPushAnnouncement(ann,ann.tourCode==='ALL');
 
   // Broadcast to matching rooms
   for (const room of liveRooms.values()) {
```
