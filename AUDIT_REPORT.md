# RıdvanSes (Rıdvan Yılmaz Turizm) — Full-Stack Sistem Denetimi ve Hata Tespiti Raporu (`AUDIT_REPORT.md`)

- **Denetim Tarihi:** 7 Kasım 2026
- **Denetlenen Sürüm / Commit:** `v47` (`9c8d1d8`)
- **Çalışma Dizini:** `d:\umresesliyazılım`
- **Denetim Kapsamı:** Mimari & Konfigürasyon, Statik Analiz & Terminal Doğrulaması, Backend (`server.js`), Gerçek Zamanlı İletişim (`WebSocket`, `HTTP Relay`, `MQTT Failover`), Web Audio DSP & Worklet Motorları (`pcm-capture-worklet.js`, `pcm-player-worklet.js`), PWA İstemci Arayüzleri (`dinle.html`, `rehber.html`, `panel.html`, `login.html`, `rota.html`, `ani-kitabi.html`, `yaka-karti.html`, `kullanim-rehberi.html`, `index.html`, `sw.js`) ve Yardımcı Betikler (`scripts/*.js`).
- **Kısıt:** *Bu denetim sırasında hiçbir kaynak kod dosyası değiştirilmemiştir.*

---

## 1. Mimari ve Dosya Keşfi Özeti

### 1.1. Bağımlılık ve Paket Analizi (`package.json` & `npm ls`)
- **Çalışma Zamanı (Engines):** `node >= 18.0.0` (Mevcut ortam: Node.js `v24.13.0`).
- **Üretim Bağımlılıkları (`dependencies`):**
  - `express@^4.19.2` (Kurulu: `4.22.3`) — HTTP sunucusu ve REST API yönlendiricisi.
  - `ws@^8.18.0` (Kurulu: `8.22.0`) — Birincil düşük gecikmeli WebSocket ses/veri sunucusu.
  - `qrcode@^1.5.4` (Kurulu: `1.5.4`) — Yaka kartı ve kafile katılım QR üreteci.
- **Geliştirme / Yardımcı Bağımlılıklar (`devDependencies`):**
  - `imap-simple@^5.1.0`, `mailparser@^3.7.1`, `nodemailer@^8.0.5` (Kurulu: `10.2.1`) — B2B acente e-posta otomasyon betikleri (`scripts/send-outreach.js`, `scripts/check-replies.js`) tarafından kullanılmaktadır.
- **Eksik / Çakışan Paket Tespiti:**
  - `npm ls --depth=0` kontrolünde kırık veya çakışan bağımlılık (`peerDependency` hatası) bulunmamaktadır.
  - Ancak `package.json` içinde `test`, `lint` veya `check` script'i tanımlı değildir (`"scripts": { "start": "node server.js", "dev": "node server.js" }`); mevcut `scripts/verify-system.js` doğrulama paketi `package.json` içine `"test": "node scripts/verify-system.js"` olarak bağlanmamıştır.

### 1.2. Ortam Değişkenleri ve Konfigürasyon Dosyaları (`.env.example`, `vercel.json`, `render.yaml`, `.gitignore`, `.vercelignore`)
- **`.env.example` vs `render.yaml` / `vercel.json` Uyumsuzluğu:**
  - `.env.example` içinde `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SELAMET_PASSWORD`, `AUTH_TOKEN_SECRET`, `GMAIL_APP_PASSWORD` tanımlanmış olmasına rağmen, `render.yaml` (satır 9-14) üzerinde yalnızca `NODE_ENV=production` tanımlıdır; güvenlik anahtarları (`AUTH_TOKEN_SECRET`, `ADMIN_PASSWORD`) `render.yaml` şablonunda `sync: false` olarak dahi yer almamaktadır.
- **`.gitignore` ve `.vercelignore` Eksiklikleri:**
  - `.gitignore` içinde `data/runtime.json` (satır 6) hariç tutulmuş olmasına rağmen, `data/runtime.json` geçmişte git indeksine eklendiği için (`git ls-files` içinde mevcut) takip edilmeye devam etmektedir.
  - `.vercelignore` yalnızca `rea-polarsteps-report.json` ve `.git` dizinini hariç tutmakta; kök dizindeki `Başlıksız-1234.tif` (7.85 MB) ve `data/outreach-log.json` gibi B2B pazarlama dosyalarını Vercel sunucusuz (serverless) paketine dahil etmektedir.

---

## 2. Statik Analiz ve Derleme Kontrolleri (Terminal)

Terminal üzerinden gerçekleştirilen statik ve dinamik doğrulama kontrolleri:
1. **JS Sözdizimi Kontrolü (`node --check` & `vm.Script`):**
   - `server.js`, `public/*.js` (4 dosya), `public/js/umrah-steps-map.js` ve `scripts/*.js` (12 dosya) olmak üzere toplam **18 JavaScript dosyası** `node --check` ile denetlendi -> **0 Sözdizimi Hatası**.
2. **HTML Satır İçi (Inline) `<script>` Derleme Kontrolü (`vm.Script`):**
   - `public/*.html` altındaki 9 HTML sayfasında yer alan **10 çalıştırılabilir `<script>` bloğu** V8 `vm.Script` derleyicisi ile denetlendi -> **0 Derleme Hatası**.
3. **Uçtan Uca Doğrulama Test Paketi (`node scripts/verify-system.js`):**
   - `16 / 16` mevcut regresyon testi (Canlı HTTP/WebSocket odaları, Binary 12-bayt ses çerçevesi, AudioWorklet DSP zinciri, Service Worker önbellek kuralları ve atomik `runtime.json` yazımı) **BAŞARILI (PASS)** olarak tamamlandı.

---

## 3. Tespit Edilen Bulgular

Aşağıdaki bulgular; sistem kararlılığı, güvenlik, çalışma zamanı hatası ve mimari etkilerine göre **4 seviyede** sınıflandırılmıştır.

---

### 🔴 [KRİTİK - Sistemi Çökerten / Tam Yetki Ele Geçirme Riski]

#### KRİTİK-01: Ortam Değişkeni Eksikliğinde Sabit (Deterministik) Yetki Jetonu (`AUTH_TOKEN_VALUE`) ve Sunucu Tarafında İptal Edilemeyen (Non-Revocable) Oturum Mimarisi
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\server.js`
- **Satır Aralığı:** `447 - 480`, `1111 - 1127`, `1181 - 1184`
- **Sorunun Nedeni:**
  1. `server.js:465-467` satırlarında `process.env.AUTH_TOKEN_SECRET` tanımlı olmadığında sistem:
     ```javascript
     const AUTH_TOKEN_VALUE =
       process.env.AUTH_TOKEN_SECRET ||
       Buffer.from('cnlfYXV0aF92MV85ODdhNmI1YzRk', 'base64').toString('utf8');
     ```
     kodunu çalıştırarak sabit `ry_auth_v1_987a6b5c4d` jetonuna geri dönmektedir (fallback). Benzer şekilde `ADMIN_PASSWORD_SHA256` ve `SELAMET_PASSWORD_SHA256` sabit özetleri (`server.js:449-455`) kaynak kodda yer almaktadır. Ortam değişkenlerinin unutulduğu herhangi bir kurulumda (ör. Vercel veya yeni bir VDS), kaynak kodu gören herkes şifre bilmeden doğrudan `Authorization: Bearer ry_auth_v1_987a6b5c4d` başlığıyla tam yönetici (`admin`) ve rehber (`guide`) yetkisi kazanır.
  2. `AUTH_TOKEN_VALUE` sunucu genelinde **tek ve statik bir dizedir**. Oturum süresi (TTL/expiration) yoktur ve `POST /api/logout` (`server.js:1181-1184`) yalnızca istemciye boş çerez göndermekte, sunucu tarafında jetonu geçersiz kılmamaktadır. Çalınan tek bir jeton, sunucu yeniden başlatılıp `.env` değiştirilene kadar tüm kafileleri silme (`DELETE /api/tours/:id`) ve canlı rehber yayınını basma yetkisine sahiptir.
- **Önerilen Çözüm Yöntemi:**
  - Sabit Base64 jeton geri dönüşü (`cnlfYXV0aF92MV85ODdhNmI1YzRk`) tamamen kaldırılmalı; `.env` içinde `AUTH_TOKEN_SECRET` yoksa `crypto.randomBytes(32).toString('hex')` ile çalışma zamanı sırrı üretilmeli veya üretim ortamında (`NODE_ENV=production`) zorunlu tutulmalıdır.
  - Tekil statik jeton yerine `POST /api/login` sırasında `crypto.randomBytes(32).toString('hex')` ile kullanıcıya/cihaza özel oturum jetonu üretilmeli, bellekte (veya `runtime.json` içinde) `{ token, userId, role, assignedTour, expiresAt }` yapısıyla saklanmalı ve `/api/logout` çağrıldığında bu haritadan silinmelidir.

---

#### KRİTİK-02: Herkese Açık (Public) MQTT Rölelerinde Kimlik Doğrulamasız Yayın Basma ve Sahte SOS Enjeksiyonu
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\vercel-ws-shim.js`
- **Satır Aralığı:** `54 - 56`, `312 - 404`, `469 - 486`
- **Sorunun Nedeni:**
  - İstemci yedek röle katmanı (`vercel-ws-shim.js`), birincil WebSocket koptuğunda herkese açık ve kimlik doğrulamasız MQTT broker'larına (`wss://test.mosquitto.org:8081` ve `wss://broker.emqx.io:8084/mqtt`) bağlanmaktadır.
  - Kullanılan MQTT konu (topic) adları tamamen tahmin edilebilirdir: `ridvanses/v2/room/RYKASIM/GENEL` ve `ridvanses/v2/global/sos` (`vercel-ws-shim.js:317-318`).
  - Gelen MQTT mesajları (`vercel-ws-shim.js:343-388`) üzerinde hiçbir kriptografik imza (HMAC / Ed25519) veya rehber doğrulaması yapılmamaktadır (`role === 'pilgrim'` olan her istemci `data.type === 'audio-chunk'`, `'stream-state'`, `'new-announcement'` mesajlarını doğrudan kabul edip çalmaktadır). Dışarıdan herhangi biri `test.mosquitto.org` üzerinden bu konuya JSON paketi yayınlayarak tüm hacılara korsan ses dinletebilir veya yayını kapatabilir (`isLive: false`).
- **Önerilen Çözüm Yöntemi:**
  - Birincil VDS (`ses.ridvanyilmazturizm.com`) üzerinde zaten doğrudan WebSocket ve `/api/ws-relay` (sunucu tarafında `isTokenValid` doğrulaması yapan HTTP rölesi, `server.js:1084`) bulunduğundan, kimlik doğrulamasız genel (public) MQTT broker'ları üzerinden ham ses/komut kabulü kapatılmalı ya da rehberin gönderdiği MQTT paketlerine sunucunun `/api/login` sırasında verdiği kısa ömürlü bir `HMAC-SHA256` imzası / oda anahtarı eklenmelidir.

---

#### KRİTİK-03: Hız Sınırlaması (Rate Limiting) Olmayan Uç Noktalar Üzerinden Disk/Bellek Taşırma ve Canlı Rehber Ekranını Kilitleme (DoS)
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\server.js`
- **Satır Aralığı:** `269 - 277`, `1150 - 1179`, `1195 - 1215`, `1445 - 1465`, `1687 - 1732`
- **Sorunun Nedeni:**
  1. **SOS Tufanı (`POST /api/sos`, satır `1687-1732`):** Kimlik doğrulaması gerektirmez ve IP başına hız sınırı (rate limit) yoktur. Satır `1693-1704`'teki mükerrer kontrolü yalnızca aynı `pilgrimName` için 10 saniye koruma sağlar. Rastgele `pilgrimName` üreten bir betik saniyede yüzlerce SOS göndererek:
     - Rehberin telefonunda `playSosEmergencyTone()` (`rehber.html:2643`) sirenini aralıksız çaldırıp rehberin mikrofon yayınını sabote edebilir,
     - `db.sosAlerts` dizisini (`slice(0, 100)`) sahte kayıtlarla doldurarak gerçek hacıların acil SOS çağrılarını listeden silebilir,
     - Sürekli `saveState(db)` ve `broadcastToAdmins` tetikleyebilir.
  2. **Rastgele Kafile Kodu ile Veritabanı Şişirme (`GET /api/trips/:code/steps`, satır `1445-1465` ve `getTourSteps`, satır `269-277`):**
     `GET /api/trips/RASTGELE_KOD_123/steps` çağrıldığında, `getTourSteps(db, code)` fonksiyonu böyle bir kafile (`db.tours` içinde) var mı diye **kontrol etmeden** `db.journeySteps[key] = createDefaultJourneySteps(key)` oluşturmakta ve `saveState(db)` ile diske (`data/runtime.json`) kaydetmektedir! Kötü niyetli bir bot binlerce farklı `:code` URL'si çağırarak `runtime.json` dosyasını ve RAM'i yüzlerce megabayta şişirip sunucuyu OOM (Out of Memory) ile çökertebilir.
  3. **Brute-Force (`POST /api/login` & `POST /api/join-tour`):** Yönetici şifresi ve 4 haneli kafile PIN kodu için deneme sınırı yoktur (4 haneli PIN `0000-9999` arası 10.000 istekle saniyeler içinde kırılabilir).
- **Önerilen Çözüm Yöntemi:**
  - `getTourSteps(db, tourCode)` içinde önce `db.tours.some(t => t.code === key)` kontrolü yapılmalı; var olmayan kafile kodları için `db.journeySteps` mutasyona uğratılmamalı ve `saveState(db)` çağrılmamalıdır.
  - `server.js` içine IP tabanlı hafif bir bellek içi hız sınırlayıcı (Sliding Window / Token Bucket middleware) eklenerek `/api/login` (dk'da 10), `/api/join-tour` (dk'da 20), `/api/sos` (dk'da 5) ve `/api/demo-request` (dk'da 5) sınırlandırılmalıdır.

---

#### KRİTİK-04: `uncaughtException` Sonrası Bozuk Durumda (Corrupted State) Çalışmaya Devam Etme ve `isWritingRuntimeFile` Kilitlenmesi
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\server.js`
- **Satır Aralığı:** `32 - 38`, `121 - 157`
- **Sorunun Nedeni:**
  - `server.js:32-34` satırlarındaki `process.on('uncaughtException', ...)` yakalayıcısı hatayı yalnızca konsola yazmakta ve süreci sonlandırmamaktadır.
  - Eğer `flushRuntimeStateToDisk()` (`server.js:121-157`) içinde `isWritingRuntimeFile = true` yapıldıktan sonra beklenmeyen bir senkron hata (ör. `JSON.stringify` sırasında döngüsel referans veya bellek hatası) `try` bloğu dışında veya geri çağrı zincirinde oluşursa `isWritingRuntimeFile` bayrağı kalıcı olarak `true` kalabilir ve sunucu bir daha `runtime.json` dosyasına hiçbir değişiklik yazamaz.
- **Önerilen Çözüm Yöntemi:**
  - `flushRuntimeStateToDisk` içinde `JSON.stringify(pendingRuntimeDb, null, 2)` işlemi `try { ... } catch (err) { isWritingRuntimeFile = false; }` bloğu içine alınmalı ve `uncaughtException` durumunda bekleyen durum diske güvenli şekilde yazılıp PM2'nin temiz bir süreç başlatması için kontrollü `process.exit(1)` uygulanmalıdır.

---

### 🟠 [YÜKSEK - Fonksiyon Bozan / Güvenlik & Ses Sürekliliği Hatası]

#### YÜKSEK-01: Acil SOS Gönderiminde Harici `Nominatim` Ters Geocoding İsteğinin Zaman Aşımı (Timeout) Olmadan SOS İletimini Bloklaması
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\dinle.html`
- **Satır Aralığı:** `2323 - 2336`, `2459 - 2468`
- **Sorunun Nedeni:**
  - Hacı **ACİL SOS** butonuna bastığında (`triggerSosEmergency`, satır `2420`), GPS koordinatı alındıktan hemen sonra satır `2463`'te:
    ```javascript
    if (gps && gps.lat && gps.lng) {
      addressText = await reverseGeocodeAddress(gps.lat, gps.lng);
    }
    const delivered = await deliverSosPayload({ ... });
    ```
    çalışmaktadır.
  - `reverseGeocodeAddress` (`dinle.html:2323-2336`) içinde `fetch('https://nominatim.openstreetmap.org/reverse?...')` çağrısında **hiçbir `AbortController` veya zaman aşımı (timeout) yoktur**.
  - Kâbe/Mekke'de zayıf dolaşım (roaming) internetinde veya `nominatim.openstreetmap.org` Türkiye/Suudi Arabistan IP'lerini yavaşlattığında/blokladığında, tarayıcı `fetch` çağrısı **30 ila 60 saniye boyunca asılı kalmakta** ve bu süre zarfında `deliverSosPayload` (satır `2467`) hiç çağrılmadığı için rehbere SOS bildirimi gitmemektedir! Aynı sorun `rehber.html:2520-2546` (`reverseGeocodeStepLocation`) ve `dinle.html:2476` (`ipwho.is`) çağrılarında da mevcuttur.
- **Önerilen Çözüm Yöntemi:**
  - **Önce SOS koordinatı derhal rehbere ve sunucuya iletilmeli (`deliverSosPayload`)**, adres çözümleme (`reverseGeocodeAddress`) ya arka planda tamamlanmalı ya da `AbortController` ile en fazla **2500 ms** zaman aşımına bağlanmalıdır.

---

#### YÜKSEK-02: PIN Korumalı Kafilelere WebSocket (`join`) ve `/api/ws-relay` Üzerinden PIN Doğrulamasız Doğrudan Giriş Açığı
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\server.js`
- **Satır Aralığı:** `710 - 775`, `1076 - 1114`, `1251 - 1300`
- **Sorunun Nedeni:**
  - `POST /api/join-tour` (`server.js:1265`) uç noktası kafilenin `tour.pin` kodunu doğrulamaktadır.
  - Ancak hacı ekranı (`dinle.html`) URL'den `?code=RY-KASIM` parametresiyle açıldığında veya `connectWebSocket()` doğrudan çalıştığında, WebSocket `msg.type === 'join'` (`server.js:710-775`) ve HTTP rölesi `POST /api/ws-relay` (`server.js:1076-1114`) istemcinin gönderdiği mesajda **PIN kodunu kontrol etmemektedir**.
  - Ayrıca `GET /api/trips/:code/steps`, `GET /api/trips/:code/album` ve `POST /api/trips/:code/memories` uç noktaları da PIN doğrulaması yapmadan özel kafile verilerini ve fotoğraflarını döndürmektedir.
- **Önerilen Çözüm Yöntemi:**
  - `tour.pin` tanımlı olan kafilelerde `POST /api/join-tour` başarılı olduğunda imzalı bir katılım jetonu (`joinToken`) döndürülmeli veya WebSocket `join` mesajında `pin` / `joinToken` doğrulanmalıdır.

---

#### YÜKSEK-03: Çoklu Acente (Multi-Tenant) Yetki Sızıntısı — `agency-selamet` Hesabının Süper Yönetici Yetkilerine Sahip Olması
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\server.js`
- **Satır Aralığı:** `469 - 480`, `1119 - 1127`, `1150 - 1179`, `1218 - 1390`
- **Sorunun Nedeni:**
  - `server.js:469-480` içinde iki farklı yönetici tanımlıdır: `admin-1` (`role: 'admin'`, `assignedTour: null`) ve `agency-selamet` (`role: 'agency'`, `assignedTour: 'RY-KASIM'`).
  - Ancak `POST /api/login` (`server.js:1167`) her iki kullanıcıya da **aynı `AUTH_TOKEN_VALUE`** değerini vermektedir.
  - `requireAuth` (`server.js:1119-1127`) yalnızca `isRequestAuthenticated(req)` kontrolü yaptığı için, `info@selametturizm.com` hesabıyla giriş yapan alt acente; Rıdvan Yılmaz Turizm'e ait tüm diğer turları silebilir (`DELETE /api/tours/:id`), rehberleri değiştirebilir (`POST /api/guides`) ve tüm müşteri demo taleplerini (`GET /api/bootstrap` -> `requests`) okuyabilir.
- **Önerilen Çözüm Yöntemi:**
  - Oturum jetonu kullanıcı kimliği (`user.id`, `user.role`, `user.assignedTour`) ile ilişkilendirilmeli; `role === 'agency'` olan kullanıcıların yalnızca kendi `assignedTour` koduna ait verileri görmesi ve düzenlemesi sunucu tarafında (`server.js`) zorunlu kılınmalıdır.

---

#### YÜKSEK-04: Rehber Canlı Yayındayken Oda Değiştirdiğinde (`genel` <-> `siyer`) 80ms Gecikmeli Silme Zamanlayıcısı (`disconnectTimers`) Kaynaklı Yayın Durumu Yarışı (Race Condition)
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\server.js` ve `d:\umresesliyazılım\public\rehber.html`
- **Satır Aralığı:** `server.js:487 - 522, 616 - 659, 749 - 755` ve `rehber.html:674 - 723, 935 - 942`
- **Sorunun Nedeni:**
  - Rehber yayın esnasında `switchGuideRoom('siyer')` (`rehber.html:935`) fonksiyonunu çağırdığında, istemci aynı WebSocket bağlantısı üzerinden önce `type: 'join', roomId: 'siyer'` ardından hemen (0 ms sonra) `type: 'guide-stream-state', isLive: true` göndermektedir (`rehber.html:682-703`).
  - Sunucu `type: 'join'` mesajını aldığında (`server.js:749-751`), rehberi eski odadan (`genel`) çıkarmak için `removeClientFromRoom(prevRoom, clientId, 80)` çağırarak **80 ms'lik bir `setTimeout`** kurmaktadır.
  - Bu 80 ms dolmadan rehber yeni odaya (`siyer`) eklenmekte ve `evaluateTourGuidePresence(code)` çalışmaktadır. Ancak 80 ms boyunca `genel` odasının `guides` haritasında rehber hâlâ kayıtlı göründüğü için `genelHasGuide === true` hesaplanmakta; 80 ms sonra zamanlayıcı patladığında `genel` odasının `isLive` durumu değişirken `siyer` odasının `coveredByGenel` ve `room-state` yayınları çakışabilmektedir.
  - Oda değiştiren istemci zaten açık bir WebSocket üzerinden bilinçli olarak yeni odaya geçtiği için `graceMs = 80` gecikmesine gerek yoktur; `graceMs` yalnızca soket koptuğunda (`ws.on('close')`, `2500 ms`) anlamlıdır.
- **Önerilen Çözüm Yöntemi:**
  - `server.js:750` satırında istemci aynı bağlantı üzerinden başka bir odaya geçerken (`prevRoomKey !== newRoomKey`), `removeClientFromRoom(prevRoom, clientId, 0)` (anında silme) uygulanmalı veya doğrudan senkron silme yapılmalıdır.

---

#### YÜKSEK-05: 44.1 kHz Donanımlarda `AudioContext` ve `pcm-capture-worklet.js` Örnekleme Hızı (Sample Rate) Uyumsuzluğu
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\rehber.html` ve `d:\umresesliyazılım\public\pcm-capture-worklet.js`
- **Satır Aralığı:** `rehber.html:1636 - 1647, 1791 - 1805` ve `pcm-capture-worklet.js:4 - 23`
- **Sorunun Nedeni:**
  - `rehber.html:1794` satırında `getUserMedia` içinde `sampleRate: { ideal: 48000 }` istenmektedir, ancak satır `1803`'te `new AudioContextClass({ latencyHint: 'interactive' })` çağrılırken `sampleRate: 48000` parametresi verilmemektedir.
  - Bazı iOS cihazlarda, Bluetooth kulaklıklarda veya Windows ses kartlarında `AudioContext` donanım varsayılanı olan `44100 Hz` ile açılır.
  - `pcm-capture-worklet.js:6` sabit `3072` örnek (sample) biriktirmektedir (`48000 Hz`'de tam `64 ms` ve `24000 Hz`'e 2:1 tam sayı bölünür -> `1536` örnek).
  - Ancak `inputSampleRate = 44100 Hz` olduğunda `ratio = 44100 / 24000 = 1.8375` olur ve `Math.round(3072 / 1.8375) = 1672` örnek üretilir. Her pakette `1671.8367` yerine `1672` örnek üretilmesi nedeniyle paket sınırlarında `0.163` örneklik faz kayması (fractional phase drift) oluşur ve doğrusal (linear) interpolasyon sırasında hafif metalik tını / çıtırtı meydana gelebilir.
- **Önerilen Çözüm Yöntemi:**
  - `new AudioContextClass({ latencyHint: 'interactive', sampleRate: 48000 })` ile `48000 Hz` açıkça talep edilmeli (desteklemeyen tarayıcılar için `try/catch` ile parametresiz fallback bırakılmalı) ve `resampleTo24k` fonksiyonunda paketler arası kesirli indeks (`resamplePhaseRemainder`) korunmalıdır.

---

#### YÜKSEK-06: `.vercel.app` Alan Adı Üzerinden Giriş Yapıldığında Çapraz Köken (Cross-Origin) Çerez ve `<a target="_blank">` Yetki Kaybı
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\vercel-ws-shim.js`, `d:\umresesliyazılım\public\login.html`, `d:\umresesliyazılım\public\panel.html`, `d:\umresesliyazılım\server.js`
- **Satır Aralığı:** `vercel-ws-shim.js:797 - 835`, `login.html:174 - 183`, `panel.html:720`, `server.js:1169 - 1172, 1926 - 1933`
- **Sorunun Nedeni:**
  - Kullanıcı `https://ridvanses.vercel.app/login` adresinden giriş yaptığında, `vercel-ws-shim.js:826` `/api/login` isteğini `https://ses.ridvanyilmazturizm.com/api/login` adresine yönlendirir (`credentials` parametresi olmadan).
  - `login.html:178` satırı `document.cookie = 'ry_auth=...'` ile çerezi yalnızca `ridvanses.vercel.app` origin'ine yazar.
  - Ancak `ridvanses.vercel.app` üzerindeki `server.js` (Vercel Serverless) kendi `.env` dosyasında `AUTH_TOKEN_SECRET` barındırmıyorsa (veya VDS'deki `.env` ile farklıysa), kullanıcı `/panel` veya `/rehber` sayfasına yönlendirildiğinde (`window.location.href = '/panel'`), Vercel üzerindeki `server.js:1928` (`isRequestAuthenticated(req)`) çerezdeki VDS jetonunu reddedip kullanıcıyı sonsuz `/login` döngüsüne sokabilir!
  - Ayrıca `panel.html:720` satırındaki `<a href="/api/rea-report" target="_blank">` bağlantısı `window.fetch` kullanmadığı için `Authorization: Bearer` başlığı eklenemez ve çapraz kökende `401 Yetkisiz Erişim` hatası verir.
- **Önerilen Çözüm Yöntemi:**
  - `ridvanses.vercel.app` trafiğinin tamamı `vercel.json` içinde veya DNS düzeyinde doğrudan `https://ses.ridvanyilmazturizm.com` birincil sunucusuna yönlendirilmeli ya da Vercel ortam değişkenlerindeki `AUTH_TOKEN_SECRET` ile VDS `.env` değerinin birebir aynı olduğu garanti altına alınmalıdır.
  - `server.js:1171` içindeki `Set-Cookie` başlığına HTTPS altında `Secure; HttpOnly` bayrakları eklenmelidir.

---

### 🟡 [ORTA - Performans / Mimari / Bellek Yönetimi]

#### ORTA-01: Dinleyici ve Rehber Sayfalarında Çift Kalp Atışı (Main Thread `setInterval` + Web Worker `setInterval`) Çalışması
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\dinle.html` ve `d:\umresesliyazılım\public\rehber.html`
- **Satır Aralığı:** `dinle.html:2257 - 2268, 2886 - 2905` ve `rehber.html:2021 - 2039`
- **Sorunun Nedeni:**
  - `dinle.html` içinde `pilgrimBackgroundHeartbeatTick()` fonksiyonu hem satır `2267`'de `setInterval(..., 2500)` ile ana iş parçacığında (main thread) hem de satır `2895`'te oluşturulan `Blob` Web Worker içinde `setInterval(..., 2500)` ile **aynı anda** tetiklenmektedir.
  - Aynı durum `rehber.html:2021` ve `2031`'de `guideBackgroundHeartbeatTick()` için de geçerlidir.
  - Ekran açıkken her 2.5 saniyede bir 2 kez (toplamda 1.25 saniyede bir) kontrol ve potansiyel `ping` / `AudioContext` denetimi çalışmaktadır. Ayrıca bu zamanlayıcılar sayfa ilk yüklendiği andan itibaren (kullanıcı henüz hiçbir odaya katılmamışken bile) sürekli çalışmaktadır.
- **Önerilen Çözüm Yöntemi:**
  - Web Worker başarıyla oluşturulduysa ana iş parçacığındaki `setInterval` yalnızca yedek (fallback) olarak tutulmalı (Worker varsa ana `setInterval` başlatılmamalı) ve zamanlayıcı içinde `if (!activeTourCode) return;` kontrolü en başta yapılmalıdır.

---

#### ORTA-02: `liveRooms` Bellek İçi (In-Memory) Haritasının Temizlenmemesi (Unbounded Map Growth)
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\server.js`
- **Satır Aralığı:** `301`, `566 - 614`, `695`, `718`
- **Sorunun Nedeni:**
  - `getOrCreateLiveRoom(tourCode, roomId)` (`server.js:566`) çağrıldığında `liveRooms` (`Map`) içine yeni bir oda nesnesi eklenmektedir.
  - Odadaki tüm rehberler, hacılar ve aile izleyicileri ayrıldığında (`guides.size === 0 && pilgrims.size === 0 && familyWatchers.size === 0`), varsayılan (`RY-KASIM`, `RY-RAMAZAN`, `RY-Saban`) haricindeki dinamik oluşturulmuş odalar `liveRooms` haritasından hiçbir zaman silinmemektedir.
- **Önerilen Çözüm Yöntemi:**
  - `removeClientFromRoom` ve `ws.on('close')` sonunda, oda `db.tours` içindeki kayıtlı bir kafileye ait değilse ve içinde hiç bağlı istemci kalmadıysa `liveRooms.delete(key)` ile bellekten temizlenmelidir.

---

#### ORTA-03: Yedek Röle (HTTP / MQTT) Ses Kodlama ve Çözme Döngülerinde O(N) String Birleştirme Yükü
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\rehber.html` ve `d:\umresesliyazılım\public\dinle.html`
- **Satır Aralığı:** `rehber.html:1465 - 1469, 2324 - 2327` ve `dinle.html:2927 - 2929`
- **Sorunun Nedeni:**
  - Yedek röle aktifken saniyede ~16 kez çalışan ses gönderim/alım döngüsünde:
    ```javascript
    let binary = '';
    const bytes = new Uint8Array(pcm16.buffer);
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    ```
    kullanılmaktadır. `3072` baytlık her pakette `3072` kez karakter birleştirmesi yapılması eski Android cihazlarda Garbage Collector (GC) duraksamalarına yol açabilir.
- **Önerilen Çözüm Yöntemi:**
  - `String.fromCharCode.apply(null, bytes)` (3072 bayt çağrı yığını sınırının çok altındadır) veya `8192` baytlık bloklar halinde `subarray` ile tek seferde dönüştürme yapılmalıdır.

---

#### ORTA-04: Vercel Serverless (`/tmp`) ve Oracle Cloud VDS (`data/runtime.json`) Arasında Çift Beyin (Split-Brain) Durumu
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\vercel.json`, `d:\umresesliyazılım\server.js`, `d:\umresesliyazılım\public\vercel-ws-shim.js`, `d:\umresesliyazılım\public\yaka-karti.html`
- **Satır Aralığı:** `vercel.json:1 - 22`, `server.js:77 - 79`, `vercel-ws-shim.js:814 - 835`, `yaka-karti.html:290`
- **Sorunun Nedeni:**
  - Kullanıcı `ridvanses.vercel.app` üzerinden sisteme girdiğinde `window.fetch('/api/...')` çağrıları `vercel-ws-shim.js:826` tarafından VDS'e (`https://ses.ridvanyilmazturizm.com`) yönlendirilmektedir.
  - Ancak `yaka-karti.html:290` içindeki `<img src="/api/qr-img?url=...">` veya `vercel-ws-shim.js:821` içindeki `/api/ws-relay` çağrıları `window.fetch` yönlendirmesine girmediği için doğrudan Vercel Serverless fonksiyonuna (`server.js`) gitmektedir!
  - Bu nedenle `.vercel.app` üzerindeki bir istemci `/api/ws-relay` (HTTP Polling yedek rölesi) moduna düşerse, ses paketlerini VDS yerine Vercel'deki izole serverless fonksiyonuna göndermekte ve VDS'deki hacılarla iletişim kopmaktadır.
- **Önerilen Çözüm Yöntemi:**
  - `vercel-ws-shim.js:821` satırındaki `urlStr.startsWith('/api/ws-relay')` istisnası kaldırılmalı; `/api/ws-relay` istekleri de birincil ses sunucusu olan `PRIMARY_VOICE_HTTP_ORIGIN` (`https://ses.ridvanyilmazturizm.com`) adresine yönlendirilmelidir.

---

#### ORTA-05: `public/sw.js` İçinde `addAll(STATIC_ASSETS)` Hatasının Sessizce Yutulması ve Versiyon Sabitliği
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\sw.js`
- **Satır Aralığı:** `1 - 27`
- **Sorunun Nedeni:**
  - `CACHE_NAME = 'ridvanses-pwa-v15'` (`sw.js:1`) olarak sabitlenmiştir; `rehber.html` veya `dinle.html` güncellendiğinde ağ bağlantısı zayıf olan ve `fetch` isteği zaman aşımına uğrayan istemciler önbellekteki eski sürümü görebilir.
  - Ayrıca `cache.addAll(STATIC_ASSETS).catch(() => {})` (`sw.js:24`) içinde `STATIC_ASSETS` listesindeki 10 dosyadan herhangi biri (ör. anlık ağ hatasıyla) yüklenemezse `addAll` atomik olduğu için **hiçbir dosya** önbelleğe alınmaz.
- **Önerilen Çözüm Yöntemi:**
  - `STATIC_ASSETS` içindeki her varlık `Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)))` ile bağımsız önbelleğe alınmalı ve önemli dağıtımlarda `CACHE_NAME` sürümü artırılmalıdır.

---

### 🟢 [DÜŞÜK - Kod Kalitesi / Temizlik / Bakım Kolaylığı]

#### DÜŞÜK-01: `rehber.html` İçinde Kullanılmayan Ölü Kodlar (`guideFilterHist` ve `toggleDemoBroadcast`)
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\rehber.html`
- **Satır Aralığı:** `1535`, `1890`, `2277 - 2338`
- **Sorunun Nedeni:**
  1. `const guideFilterHist = new Float32Array(6);` (`rehber.html:1535`) tanımlanmakta ve `stopMicBroadcast` (`rehber.html:1890`) içinde `.fill(0)` ile sıfırlanmaktadır; ancak filtreleme işlemi Web Audio `BiquadFilterNode` zincirine taşındığı için bu dizi hiçbir yerde okunmamakta veya yazılmamaktadır (Not: `scripts/verify-system.js:593` satırı DSP kod kesitini bulmak için `rehberHtml.indexOf('const guideFilterHist = new Float32Array(6);')` çapasını kullandığından, silinirken `verify-system.js` çapasının da güncellenmesi gerekir).
  2. `toggleDemoBroadcast()` fonksiyonu (`rehber.html:2277-2338`) DOM'dan kaldırılmış olan `document.getElementById('startDemoStreamBtn')` elemanına başvurmakta ve hiçbir yerden çağrılmamaktadır (eğer çağrılırsa `btn` `null` olduğu için satır `2283`'te `TypeError: Cannot set properties of null (setting 'textContent')` fırlatır).
- **Önerilen Çözüm Yöntemi:**
  - `toggleDemoBroadcast()` fonksiyonu kaldırılmalı veya `if (btn)` null korumasına alınmalı; `guideFilterHist` ise `verify-system.js` içindeki indeks çapasıyla birlikte temizlenmelidir.

---

#### DÜŞÜK-02: Çoklu Dosyalarda Mükerrer `escapeHtml` Tanımları
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\public\ani-kitabi.html` ve `d:\umresesliyazılım\public\yaka-karti.html`
- **Satır Aralığı:** `ani-kitabi.html:328, 467` ve `yaka-karti.html:184, 263`
- **Sorunun Nedeni:**
  - Hem `ani-kitabi.html` hem de `yaka-karti.html` içinde `escapeHtml` fonksiyonu aynı `<script>` bloğu içinde ikişer kez (biri üst kapsamda, biri `renderPage`/`renderCards` fonksiyonlarının içinde gölgelenmiş/shadowed olarak) tanımlanmıştır.
- **Önerilen Çözüm Yöntemi:**
  - İç kapsamdaki mükerrer `escapeHtml` tanımları kaldırılarak üst kapsamdaki tekil yardımcı fonksiyon kullanılmalıdır.

---

#### DÜŞÜK-03: Git Deposunda (`git ls-files`) Takip Edilen Büyük İkili Dosyalar ve B2B Pazarlama Kayıtları
- **İlgili Dosya Yolu:** `d:\umresesliyazılım\.gitignore`, `d:\umresesliyazılım\Başlıksız-1234.tif`, `d:\umresesliyazılım\data\runtime.json`, `d:\umresesliyazılım\data\outreach-log.json`, `d:\umresesliyazılım\vercel private key.txt`
- **Satır Aralığı:** Proje kök dizini ve `data/` klasörü
- **Sorunun Nedeni:**
  - `Başlıksız-1234.tif` (7.85 MB boyutunda ham TIFF görseli) git deposunda takip edilmektedir (`public/img/logo.png` zaten mevcuttur).
  - `data/runtime.json` `.gitignore`'da olmasına rağmen git indeksinde yer almaktadır.
  - Kök dizinde 0 baytlık takip edilmeyen `vercel private key.txt` dosyası bulunmaktadır.
- **Önerilen Çözüm Yöntemi:**
  - `git rm --cached data/runtime.json` ile çalışma zamanı durum dosyası git takibinden çıkarılmalı, `Başlıksız-1234.tif` ve boş `vercel private key.txt` temizlenmeli, `package.json` içine `"test": "node scripts/verify-system.js"` komutu eklenmelidir.

---

## 4. Özet Bulgular Tablosu

| Kod | Önem Derecesi | Başlık | İlgili Dosya(lar) | Satır Aralığı |
| :--- | :--- | :--- | :--- | :--- |
| **KRİTİK-01** | `[KRİTİK - Sistemi Çökerten]` | Sabit `AUTH_TOKEN_VALUE` fallback'i ve sunucuda iptal edilemeyen tekil statik jeton mimarisi | `server.js` | `447-480`, `1181-1184` |
| **KRİTİK-02** | `[KRİTİK - Sistemi Çökerten]` | Herkese açık MQTT broker'larında (`test.mosquitto.org`) imzasız ses/komut enjeksiyonu | `public/vercel-ws-shim.js` | `54-56`, `312-404` |
| **KRİTİK-03** | `[KRİTİK - Sistemi Çökerten]` | Rate-limit eksikliği ve `GET /api/trips/:code/steps` üzerinden rastgele kodla disk/RAM şişirme | `server.js` | `269-277`, `1445-1465`, `1687-1732` |
| **KRİTİK-04** | `[KRİTİK - Sistemi Çökerten]` | `uncaughtException` sonrası bozuk durum ve `isWritingRuntimeFile` kilitlenme riski | `server.js` | `32-38`, `121-157` |
| **YÜKSEK-01** | `[YÜKSEK - Fonksiyon Bozan]` | Acil SOS sırasında zaman aşımsız `Nominatim` isteğinin SOS gönderimini 30-60sn bloklaması | `public/dinle.html` | `2323-2336`, `2459-2468` |
| **YÜKSEK-02** | `[YÜKSEK - Fonksiyon Bozan]` | PIN korumalı kafilelere WebSocket `join` ve `/api/ws-relay` üzerinden PIN'siz giriş | `server.js` | `710-775`, `1076-1114` |
| **YÜKSEK-03** | `[YÜKSEK - Fonksiyon Bozan]` | `agency-selamet` hesabının süper-admin ile aynı jetonu paylaşıp tüm turları yönetebilmesi | `server.js` | `469-480`, `1150-1179` |
| **YÜKSEK-04** | `[YÜKSEK - Fonksiyon Bozan]` | Rehber oda değiştirirken (`genel` <-> `siyer`) 80ms silme zamanlayıcısı yarış durumu | `server.js`, `public/rehber.html` | `749-755`, `674-723` |
| **YÜKSEK-05** | `[YÜKSEK - Fonksiyon Bozan]` | 44.1 kHz donanımlarda `AudioContext` ve `pcm-capture-worklet.js` (3072 örnek) faz kayması | `public/rehber.html`, `public/pcm-capture-worklet.js` | `1636-1647`, `1791-1805` |
| **YÜKSEK-06** | `[YÜKSEK - Fonksiyon Bozan]` | `.vercel.app` çapraz köken çerez kaybı ve `<a target="_blank">` `/api/rea-report` 401 hatası | `public/vercel-ws-shim.js`, `public/panel.html`, `server.js` | `797-835`, `720`, `1926-1933` |
| **ORTA-01** | `[ORTA - Performans/Mimari]` | Ana iş parçacığı ve Web Worker'da çift (mükerrer) 2.5sn kalp atışı zamanlayıcısı | `public/dinle.html`, `public/rehber.html` | `2257-2268`, `2886-2905` |
| **ORTA-02** | `[ORTA - Performans/Mimari]` | `liveRooms` bellek içi haritasında boşalan dinamik odaların temizlenmemesi | `server.js` | `301`, `566-614` |
| **ORTA-03** | `[ORTA - Performans/Mimari]` | Yedek röle ses döngülerinde `for` ile karakter karakter Base64 string birleştirme yükü | `public/rehber.html`, `public/dinle.html` | `1465-1469`, `2927-2929` |
| **ORTA-04** | `[ORTA - Performans/Mimari]` | `/api/ws-relay` ve `/api/qr-img` çağrılarının VDS yerine Vercel `/tmp` sunucusuna gitmesi | `public/vercel-ws-shim.js`, `vercel.json` | `814-835`, `1-22` |
| **ORTA-05** | `[ORTA - Performans/Mimari]` | `sw.js` içinde atomik `cache.addAll` hatasının tüm çevrimdışı önbelleği devre dışı bırakması | `public/sw.js` | `1-27` |
| **DÜŞÜK-01** | `[DÜŞÜK - Kod Kalitesi/Temizlik]` | `rehber.html` içinde kullanılmayan `guideFilterHist` dizisi ve `toggleDemoBroadcast` ölü kodu | `public/rehber.html` | `1535`, `1890`, `2277-2338` |
| **DÜŞÜK-02** | `[DÜŞÜK - Kod Kalitesi/Temizlik]` | `ani-kitabi.html` ve `yaka-karti.html` içinde gölgelenmiş mükerrer `escapeHtml` tanımları | `public/ani-kitabi.html`, `public/yaka-karti.html` | `328, 467`, `184, 263` |
| **DÜŞÜK-03** | `[DÜŞÜK - Kod Kalitesi/Temizlik]` | Git indeksinde takip edilen `data/runtime.json`, `Başlıksız-1234.tif` (7.85 MB) ve eksik `npm test` | `.gitignore`, `package.json` | Kök Dizin |
