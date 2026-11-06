# RıdvanSes (Rıdvan Yılmaz Turizm) — Kapsamlı Full-Stack Sistem Denetimi ve Hata Tespiti Raporu (`AUDIT_REPORT.md`)

**Denetim Tarihi:** 6 Kasım 2026  
**Kapsam:** Mimari ve Dosya Keşfi, Statik Analiz, Derinlemesine Kod/Mantık İncelemesi, Güvenlik ve Performans Denetimi  
**Denetim Politikası:** Salt-okunur (Read-Only) denetim — uygulama kaynak kodlarında hiçbir değişiklik yapılmamıştır.

---

## 1. Mimari, Bağımlılık ve Yapılandırma Özeti (Adım 1 & Adım 2 Bulguları)

### 1.1 Proje Mimarisi ve Dizin Yapısı
- **Çalışma Zamanı & Çatı:** Node.js (CommonJS) + `express@^4.22.2` + `ws@^8.18.0` + `qrcode@^1.5.4`.
- **Veri Katmanı:** Dosya tabanlı JSON kalıcılığı (`data/state.json` ve tohum veri olarak `data/seed.json`). Vercel sunucusuz (serverless) ortamında `/tmp/ridvanses-state.json` kullanılmaktadır.
- **İstemci (Frontend) Katmanı:** `public/` dizininde çerçevesiz (Vanilla JS + HTML5 + CSS3 + Web Audio API / AudioWorklet + Leaflet.js + Service Worker PWA) 8 adet sayfa (`index.html`, `dinle.html`, `rehber.html`, `panel.html`, `rota.html`, `ani-kitabi.html`, `yaka-karti.html`, `login.html`, `kullanim-rehberi.html`) ve yardımcı betikler (`vercel-ws-shim.js`, `sw.js`, `pcm-capture-worklet.js`, `pcm-player-worklet.js`, `js/umrah-steps-map.js`).
- **Çift Omurgalı Dağıtım (Dual-Backbone):**
  - Birincil: Render.com (`render.yaml`) üzerinde kalıcı WebSocket destekli Node.js sunucusu.
  - İkincil / Yedek: Vercel (`vercel.json`) üzerinde sunucusuz HTTP + `public/vercel-ws-shim.js` üzerinden Hibrit HTTP Polling / Genel MQTT Broker (`test.mosquitto.org`, `broker.emqx.io`, `broker.hivemq.com`) köprüsü.

### 1.2 Statik Analiz ve Derleme Kontrolleri (Terminal Çıktıları)
- **JavaScript Sözdizimi (`node --check`):** `server.js`, `public/*.js`, `scripts/*.js` ve tüm `.html` dosyalarındaki satır içi (inline) `<script>` blokları `vm.Script` ile doğrulandı; derleme zamanı sözdizimi hatası (`SyntaxError`) bulunmadı.
- **TypeScript / Linter / Test Yapılandırması:** Projede `tsconfig.json`, ESLint/Prettier yapılandırması veya otomatik birim/entegrasyon testi (`npm test` betiği) tanımlı değildir.
- **Bağımlılık Ağacı (`npm ls --depth=0`):** Tüm paketler (`express@4.22.3`, `ws@8.22.0`, `qrcode@1.5.4`, `nodemailer@10.2.1`, `imap-simple@5.1.0`, `mailparser@3.12.4`) kurulu ve sürüm çakışması yoktur; ancak e-posta paketleri ana sunucu tarafından kullanılmadığı halde üretim bağımlılıklarında (`dependencies`) yer almaktadır.

---

## 2. Tespit Edilen Sorunlar ve Sınıflandırma

Aşağıdaki bulgular ciddiyet derecesine göre **`[KRİTİK - Sistemi Çökerten]`**, **`[YÜKSEK - Fonksiyon Bozan]`**, **`[ORTA - Performans/Mimari]`** ve **`[DÜŞÜK - Kod Kalitesi/Temizlik]`** olarak sınıflandırılmıştır.

---

### 🔴 [KRİTİK - Sistemi Çökerten]

#### KRİTİK-01: `data/seed.json` Eksik veya Bozuk Olduğunda Sunucunun Başlangıçta Çökmesi (`Uncaught Exception`)
- **İlgili Dosya ve Satır Aralığı:** `server.js` — Satır `59-70`
- **Sorunun Nedeni:**
  `loadState()` fonksiyonunda `data/state.json` okunurken `try / catch` bloğu kullanıldığı halde, `state.json` bulunamadığında veya okunamadığında devreye giren `return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));` (satır `67`) ifadesi `try / catch` bloğunun **dışında** bırakılmıştır. Eğer `data/seed.json` dosyası silinir, taşınırken eksik kopyalanır veya JSON formatı bozulursa, `server.js` daha HTTP sunucusunu başlatamadan `ENOENT` veya `SyntaxError` fırlatarak tüm Node.js sürecini çökertir.
- **Önerilen Çözüm Yöntemi:**
  Satır `67`'deki `fs.readFileSync(DATA_FILE, 'utf8')` çağrısını da güvenli bir `try / catch` bloğu içine alın ve dosya bulunamazsa veya bozuksa sunucunun en azından boş bir varsayılan şema (`{ tours: [], hotels: [], guides: [], duas: [], timeline: [], faqs: [], sosAlerts: [], requests: [], journeySteps: {} }`) ile ayağa kalkmasını sağlayın.

---

#### KRİTİK-02: `/api/rea-report` Uç Noktasında 134.4 MB Boyutundaki JSON Dosyasının Senkron (`fs.readFileSync`) Okunması ve Event Loop / Bellek Çökmesi (OOM)
- **İlgili Dosya ve Satır Aralığı:** `server.js` — Satır `1593-1604`
- **Sorunun Nedeni:**
  `GET /api/rea-report` uç noktası çağrıldığında `fs.readFileSync(reportPath, 'utf8')` ve ardından `JSON.parse(raw)` işlemleri **ana iş parçacığı (main thread) üzerinde senkron** olarak çalıştırılmaktadır. Diskteki `rea-umrahvoice-analysis.json` dosyası **134.43 MB** boyutundadır. Bu uç noktaya yapılan tek bir istek (veya ardışık 2-3 istek):
  1. Node.js Event Loop'unu saniyelerce tamamen kilitler (o sırada devam eden tüm canlı rehber ses WebSocket paketleri donar ve düşer).
  2. 134 MB metin + ~400 MB V8 JSON nesne ağacı + `res.json()` serileştirmesi nedeniyle ~512 MB RAM sınırına sahip Render/Vercel konteynerlerinde `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` hatasıyla **tüm sunucuyu çökertir**.
- **Önerilen Çözüm Yöntemi:**
  134 MB'lık ham tersine mühendislik (REA) dökümünü çalışma zamanında okuyup `JSON.parse` etmek yerine, derleme/analiz aşamasında yalnızca özet metrikleri içeren küçük bir dosya (`data/rea-summary.json`, < 5 KB) üretin veya uç noktayı tamamen kaldırın/kimlik doğrulama (`requireAuth`) arkasına alıp akış (stream) olarak sunun.

---

#### KRİTİK-03: Yönetici Şifrelerinin ve Sabit Yetki Jetonunun (`AUTH_TOKEN_VALUE`) Kaynak Kodda ve İstemci HTML Dosyalarında Açık Metin Olarak Bulunması
- **İlgili Dosya ve Satır Aralığı:**
  - `server.js` — Satır `944-948`, `991-1002`
  - `public/rehber.html` — Satır `11-17`
  - `public/panel.html` — Satır `12-18`
- **Sorunun Nedeni:**
  1. `server.js` içinde yönetici kullanıcı adı (`ridvanyilmazturizm@gmail.com`), şifresi (`dolapdereli16`), ikinci acente kimlik bilgileri (`selamet2026` / `selamet123`) ve oturum doğrulama jetonu (`AUTH_TOKEN_VALUE = 'ry_auth_v1_987a6b5c4d'`) sabit (hardcoded) olarak tanımlanmıştır.
  2. Daha da kritiği, `public/rehber.html` (satır `14`) ve `public/panel.html` (satır `15`) dosyalarının `<head>` bölümünde:
     `localStorage.setItem('ry_auth_token', 'ry_auth_v1_987a6b5c4d');`
     satırı yer almaktadır. Bu sayede `login.html` ekranına hiç uğramadan veya şifre bilmeden kaynak kodunu görüntüleyen herhangi bir kişi, sunucudaki tüm `requireAuth` korumalı yönetici API'lerine (`POST /api/tours`, `DELETE /api/tours/:code`, `POST /api/sos/:id/resolve`) tam yetkiyle erişebilmektedir.
- **Önerilen Çözüm Yöntemi:**
  - `public/rehber.html` ve `public/panel.html` içindeki otomatik `localStorage.setItem('ry_auth_token', ...)` satırlarını kaldırın; oturum yoksa kullanıcıyı `/login` sayfasına yönlendirin.
  - Şifreleri `process.env` üzerinden (`bcrypt` veya `crypto.scrypt` özeti olarak) okuyun ve her başarılı girişte `crypto.randomBytes(32).toString('hex')` veya imzalı JWT ile süreli, tahmin edilemez oturum jetonları üretin.

---

#### KRİTİK-04: WebSocket ve `/api/ws-relay` Üzerinde Sıfır Kimlik Doğrulama — Yetkisiz Rehber Yayınını Ele Geçirme (Hijack) ve Admin Dinleme Açığı
- **İlgili Dosya ve Satır Aralığı:** `server.js` — Satır `547-643`, `819-862`, `911-940`
- **Sorunun Nedeni:**
  WebSocket bağlantısı (`wss.on('connection')`), JSON mesaj işleyicisi (`processClientJsonMessage`) ve HTTP yedek rölesi (`POST /api/ws-relay`) üzerinde **hiçbir kimlik veya yetki doğrulaması (`isRequestAuthenticated`) yapılmamaktadır**.
  - Herhangi bir anonim istemci `{ type: 'join', role: 'guide', tourCode: 'RY-KASIM', roomId: 'genel' }` mesajı göndererek kendisini kafile rehberi olarak kaydedebilir.
  - Satır `604-612`'deki "zombie socket" temizleme mantığı, yeni bir `role: 'guide'` katıldığında **gerçek rehber hocanın aktif WebSocket bağlantısını zorla kapatmaktadır (`client.close(4000, 'Replaced by new connection')`)**.
  - Ayrıca herhangi bir istemci `{ type: 'admin-subscribe' }` göndererek tüm kafilelerin canlı verilerini, bağlı hacıların telefon numaralarını ve SOS konumlarını gerçek zamanlı dinleyebilir.
- **Önerilen Çözüm Yöntemi:**
  `role === 'guide'` olarak odaya katılma (`join`), `admin-subscribe` mesajları ve `POST /api/ws-relay` üzerindeki rehber komutları (`guide-stream-state`, `audio-chunk`, `guide-announcement`, `tawaf-progress`, `journey-step-Checkin`) için bağlantı/istek anında geçerli yönetici/rehber oturum jetonu veya kafileye özel rehber PIN'i doğrulaması zorunlu tutulmalıdır.

---

#### KRİTİK-05: `.env` Dosyasında Açık Metin Gmail Uygulama Şifresi (`GMAIL_APP_PASSWORD`) Bulunması
- **İlgili Dosya ve Satır Aralığı:** `.env` — Satır `1-2` ve `vercel.json` — Satır `9`
- **Sorunun Nedeni:**
  Proje kök dizinindeki `.env` dosyasında `otomasyonsistemlerisemih@gmail.com` hesabına ait aktif Google Uygulama Şifresi (`GMAIL_APP_PASSWORD=jary bwfu gvmd wjii`) açık metin olarak durmaktadır. `.gitignore` içinde `.env` bulunsa da `.vercelignore` dosyasında `.env` açıkça dışlanmamıştır.
- **Önerilen Çözüm Yöntemi:**
  Google Hesap Güvenliği panelinden ilgili uygulama şifresini derhal iptal edin (revoke) ve yenileyin. `.vercelignore` dosyasına `.env` ve `.env.*` kurallarını ekleyin; sırları yalnızca dağıtım platformunun (Render / Vercel) şifreli ortam değişkenleri panelinde saklayın.

---

### 🟠 [YÜKSEK - Fonksiyon Bozan]

#### YÜKSEK-01: `Array.from(liveRooms.values()).map(serializeRoom)` Çağrılarındaki `index` Parametresi Hatası Nedeniyle İlk Odanın (`RY-KASIM:genel`) Hacı Listesinin Gizlenmesi
- **İlgili Dosya ve Satır Aralığı:** `server.js` — Satır `336`, `555`, `1083`, `1171`, `1235`, `1260`
- **Sorunun Nedeni:**
  `serializeRoom(room, includePilgrimDetails = true)` fonksiyonu ikinci parametre olarak `includePilgrimDetails` boolean değerini alır. Ancak kodun 5 farklı yerinde:
  `Array.from(liveRooms.values()).map(serializeRoom)`
  şeklinde doğrudan fonksiyon referansı geçilmiştir. JavaScript'te `Array.prototype.map` geri çağırım fonksiyonuna `(element, index, array)` argümanlarını geçirir.
  - Dizinin **ilk elemanı (`index === 0`, yani `RY-KASIM:genel` ana odası)** için ikinci parametre `0` (falsy) olur!
  - Sonuç olarak `includePilgrimDetails` ilk oda için `false` çalışır; `connectedPilgrims` dizisi boş (`[]`) döner ve rehber telefon numarası (`phone`) gizlenir. Diğer odalarda (`index >= 1`) ise `1, 2...` (truthy) olduğu için hacı listesi görünür. Bu durum Acente Yönetim Panelinde (`panel.html`) ilk kafilenin bağlı hacı detaylarının görünmemesine yol açar.
- **Önerilen Çözüm Yöntemi:**
  Tüm `.map(serializeRoom)` çağrılarını açıkça `.map((r) => serializeRoom(r, true))` (veya halka açık uç noktalarda `.map((r) => serializeRoom(r, false))`) şeklinde değiştirin.

---

#### YÜKSEK-02: Halka Açık `/api/bootstrap` Uç Noktasının Kişisel Verileri (PII), Hacı Telefonlarını, Müşteri Taleplerini ve Kafile PIN Kodlarını Sızdırması
- **İlgili Dosya ve Satır Aralığı:** `server.js` — Satır `1071-1085`
- **Sorunun Nedeni:**
  Ana sayfa (`index.html`), dinleme ekranı (`dinle.html`) ve rota ekranı (`rota.html`) tarafından kimlik doğrulaması olmadan çağrılan `GET /api/bootstrap` uç noktası:
  - `db.tours` içindeki tüm kafilelerin **açık metin `pin` kodlarını** (`t.pin`),
  - `db.sosAlerts` içindeki tüm hacıların **isim, telefon numarası ve canlı GPS koordinatlarını**,
  - `db.requests` içindeki tüm ön kayıt / demo başvurularının **isim, telefon, e-posta ve mesajlarını**,
  - `liveRooms` içindeki (0. indeks hariç tüm odaların) bağlı hacı telefon numaralarını (`connectedPilgrims`)
  herkese açık olarak döndürmektedir. Ayrıca `dinle.html` üzerinde PIN korumalı bir tura girmek isteyen kullanıcı, `/api/bootstrap` yanıtındaki `t.pin` değerini ağ sekmesinden (Network tab) doğrudan görebilmektedir.
- **Önerilen Çözüm Yöntemi:**
  `/api/bootstrap` yanıtını istemcinin yetki durumuna (`isRequestAuthenticated(req)`) göre filtreleyin: yetkisiz (genel) çağrılarda `tours` nesnelerinden `pin` değerini silin (yalnızca `pinRequired: Boolean(t.pin)` gönderin), `requests` ve `sosAlerts` dizilerini yalnızca yetkili oturumlara döndürün ve `serializeRoom(room, false)` kullanın.

---

#### YÜKSEK-03: Çoklu Oda (`genel` ve `siyer`) Rehber Bağlantı Kopma Zamanlayıcısının (`guideDisconnectTimers`) Oda Anahtarı (`room.key`) Yerine `tourCode` İle İndekslenmesi
- **İlgili Dosya ve Satır Aralığı:** `server.js` — Satır `393-448`, `619-622`, `893-899`
- **Sorunun Nedeni:**
  Her kafilede iki ayrı oda (`RY-KASIM:genel` ve `RY-KASIM:siyer`) bulunmasına rağmen, `guideDisconnectTimers` haritası `room.key` yerine `tourCode` (`RY-KASIM`) ile anahtarlanmıştır:
  1. `genel` odasındaki rehberin bağlantısı koptuğunda 10 saniyelik `guideDisconnectTimers.get('RY-KASIM')` başlatılır. Eğer bu 10 saniye içinde `siyer` odasına başka bir rehber bağlanırsa (satır `619-622`), `guideDisconnectTimers.get(tourCode)` temizlenir (`clearTimeout`) ve `genel` odasındaki kopmuş rehberin 10 saniyelik temizlik zamanlayıcısı hiçbir zaman çalışmaz (`genel` odası sonsuza dek sahte "CANLI" durumunda asılı kalır).
  2. Ayrıca `evaluateTourGuidePresence(tourCode)` (satır `410-418`) içinde `genel` odası canlıyken (`coveredByGenel = true`), `siyer` odasındaki bağımsız rehber yayını kapattığında `siyer` odasının `guidePeerId`, `guideName` ve `currentTopic` alanları `genel` odasının değerlerine geri eşitlenmemektedir.
- **Önerilen Çözüm Yöntemi:**
  `guideDisconnectTimers` haritasını `room.key` (`${tourCode}:${roomId}`) bazında saklayın ve bir alt odanın (`siyer`) özel rehberi ayrıldığında `genel` odası aktifse alt odanın yayın meta verilerini (`guideName`, `currentTopic`, `broadcastMode`) `genel` odasından senkronize edin.

---

#### YÜKSEK-04: Bulut Yedek Rölesinin (`public/vercel-ws-shim.js`) Alt Odaları (`siyer`) Yok Sayarak Tüm Sesleri `GENEL` Kanalına Birleştirmesi ve Halka Açık MQTT Broker Kullanması
- **İlgili Dosya ve Satır Aralığı:** `public/vercel-ws-shim.js` — Satır `52-57`, `219-221`
- **Sorunun Nedeni:**
  1. `connectMqttTransport(joinMsg)` fonksiyonunda (satır `220`), istemcinin katıldığı `joinMsg.roomId` (`genel` veya `siyer`) tamamen yok sayılarak MQTT konusu sabit olarak `ridvanses/v2/room/${codeClean}/GENEL` şeklinde oluşturulmaktadır. Yedek (Relay) mod devreye girdiğinde `siyer` odasındaki hacılar ve rehberler zorla `GENEL` kanalına düşmektedir.
  2. Kullanılan MQTT sunucuları (`wss://test.mosquitto.org:8081`, `wss://broker.emqx.io:8084/mqtt`, `wss://broker.hivemq.com:8884/mqtt`) kimlik doğrulamasız, herkese açık test sunucularıdır. Konu adını (`ridvanses/v2/room/#`) bilen herkes ses yayınını dinleyebilir, sahte ses basabilir veya sahte SOS/duyuru mesajı enjekte edebilir.
- **Önerilen Çözüm Yöntemi:**
  MQTT konu yoluna oda kimliğini dahil edin (`ridvanses/v2/room/${codeClean}/${(joinMsg.roomId || 'genel').toUpperCase()}`) ve üretim ortamında parola/ACL korumalı özel bir MQTT/WebSocket kümesi (ör. HiveMQ Cloud / EMQX Cloud Private) kullanın.

---

#### YÜKSEK-05: `public/vercel-ws-shim.js` İçindeki `window.fetch` Sarmalayıcısının `Headers` Nesnelerini Ezmesi ve Yetki Jetonunu Üçüncü Parti `/api/` Adreslerine Sızdırma Riski
- **İlgili Dosya ve Satır Aralığı:** `public/vercel-ws-shim.js` — Satır `681-711`
- **Sorunun Nedeni:**
  1. Satır `691`'de `init.headers = Object.assign({}, init.headers, { 'Authorization': 'Bearer ' + token });` kullanılmıştır. Eğer çağıran kod `init.headers` olarak `new Headers({ 'Content-Type': 'application/json' })` örneği geçirirse, `Headers` sınıfının kendi enumerable özelliği olmadığı için `Object.assign` mevcut tüm başlıkları **siler**. Ayrıca `input` bir `Request` nesnesi ise `init` boş olduğunda `Request` üzerindeki başlıklar dikkate alınmaz.
  2. Satır `685`'teki `urlStr.includes('/api/')` kontrolü kaynak (origin) doğrulaması yapmamaktadır. Sayfa ileride harici bir servise (ör. `https://external-service.com/api/v1/...`) istek atarsa yönetici `Bearer` jetonu o harici sunucuya gönderilir.
- **Önerilen Çözüm Yöntemi:**
  Yalnızca aynı origin (`new URL(urlStr, window.location.origin).origin === window.location.origin`) ve `/api/` ile başlayan yollar için jeton ekleyin; başlık birleştirmesini `const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined)); headers.set('Authorization', 'Bearer ' + token);` ile güvenli şekilde yapın.

---

#### YÜKSEK-06: İstemci Ekranlarında (`rehber.html`, `dinle.html`, `panel.html`, `ani-kitabi.html`, `yaka-karti.html`) `escapeHtml` Eksikliği Nedeniyle DOM Tabanlı XSS Açıkları
- **İlgili Dosya ve Satır Aralığı:**
  - `public/rehber.html` — Satır `584`, `597`, `1179`
  - `public/dinle.html` — Satır `997`
  - `public/panel.html` — Satır `1111-1130`
  - `public/ani-kitabi.html` — Satır `395`
  - `public/yaka-karti.html` — Satır `192`, `268`
- **Sorunun Nedeni:**
  Projede çoğu yerde `escapeHtml()` kullanılmış olmasına rağmen aşağıdaki noktalarda API'den veya kullanıcı girdisinden gelen veriler doğrudan `innerHTML` içine kaçışsız (unescaped) yerleştirilmektedir:
  - `rehber.html#L584` & `#L597`: `guideSelect.innerHTML` ve `tourSelect.innerHTML` içinde `g.name`, `g.title`, `t.code`, `t.name`.
  - `rehber.html#L1179`: `listEl.innerHTML` içinde `${tourCode}`.
  - `dinle.html#L997`: `roomSel.innerHTML` içinde `rm.id`, `rm.name`, `rm.guide`.
  - `panel.html#L1111-L1130`: `reaReportContent.innerHTML` içinde `r.evidence_id`, `ps.*`.
  - `ani-kitabi.html#L395`: `tourSelect.innerHTML` içinde `t.code`, `t.name`.
  - `yaka-karti.html#L192`: `sel.innerHTML` içinde `t.code`, `t.name`, `t.guideName`.
- **Önerilen Çözüm Yöntemi:**
  Yukarıdaki tüm şablon dizgilerinde (template literals) dinamik değişkenleri `escapeHtml(...)` fonksiyonundan geçirin veya `<option>` elemanlarını `document.createElement('option')` ve `.textContent` / `.value` ile oluşturun.

---

#### YÜKSEK-07: Service Worker (`public/sw.js`) Tarafından Hatalı (`404` / `500`) Yanıtların Önbelleğe (Cache) Yazılması
- **İlgili Dosya ve Satır Aralığı:** `public/sw.js` — Satır `48-60`
- **Sorunun Nedeni:**
  Statik varlıklar için ağdan gelen yanıt önbelleğe alınırken:
  ```javascript
  return fetch(event.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return res;
  });
  ```
  yanıtın başarılı olup olmadığı (`res && res.ok && res.status === 200`) kontrol edilmemektedir. Sunucu geçici bir `502 Bad Gateway` veya `404 Not Found` döndürdüğünde bu hatalı yanıt kalıcı olarak PWA önbelleğine yazılır ve kullanıcı çevrimdışı/yavaş ağda kaldığı sürece bozuk yanıtı almaya devam eder.
- **Önerilen Çözüm Yöntemi:**
  `cache.put(event.request, copy)` çağrısını yalnızca `if (res && res.ok && res.status === 200 && res.type === 'basic')` koşulu sağlandığında çalıştırın.

---

### 🟡 [ORTA - Performans/Mimari]

#### ORTA-01: Canlı PCM16 Ses Akışında JSON + Base64 Kodlaması ve `String.fromCharCode` Döngüsü Nedeniyle %33 Bant Genişliği Ek Yükü ve Çöp Toplama (GC) Baskısı
- **İlgili Dosya ve Satır Aralığı:**
  - `public/rehber.html` — Satır `1349-1364`, `1452-1461`
  - `server.js` — Satır `750-770`, `833-846`
  - `public/dinle.html` — Satır `1816-1826`
- **Sorunun Nedeni:**
  `server.js` içinde ikili (binary) WebSocket ses çerçevelerini doğrudan ileten çok hızlı bir yol (`! isBinary` kontrolü, satır `833-846`) mevcut olmasına rağmen, `public/rehber.html` her 64 ms'de bir 1.536 örnekli PCM16 verisini (3.072 bayt) `for` döngüsüyle `binary += String.fromCharCode(bytes[i])` yaparak Base64 metnine çevirmekte ve JSON (`type: 'audio-chunk'`) olarak göndermektedir.
  - Sunucu (`server.js#L750-L770`) her ses paketinde `JSON.parse` ve `JSON.stringify` çalıştırmaktadır.
  - 500 hacı bağlıyken saniyede ~15.6 paket × 500 = 7.800 JSON çerçevesi serileştirilmekte ve Base64 nedeniyle %33 fazladan mobil veri (~16 KB/sn yerine ~22 KB/sn) harcanmaktadır.
- **Önerilen Çözüm Yöntemi:**
  Birincil WebSocket bağlantısında ses çerçevelerini küçük bir ikili başlık (ör. 12 bayt: `[seq:uint32, sentAt:float64]` + ham `Int16Array` buffer) ile doğrudan `ArrayBuffer` (Binary WebSocket Frame) olarak gönderin; Base64 JSON formatını yalnızca HTTP/MQTT yedek rölesi (`vercel-ws-shim.js`) aktifken kullanın.

---

#### ORTA-02: `public/rehber.html` Mikrofon İyileştirme (`healGuideMicrophoneIfNeeded`) Sırasında Eski Web Audio Düğümlerinin (`source`, `highPass`, `lowPass`) Koparılmaması (Ses Grafiği Sızıntısı)
- **İlgili Dosya ve Satır Aralığı:** `public/rehber.html` — Satır `1623-1677`, `1717-1748`
- **Sorunun Nedeni:**
  `setupGuideMicrophoneGraph()` çağrıldığında `audioCtx.createMediaStreamSource(mediaStream)`, `highPass` ve `lowPass` filtre düğümleri yerel değişken olarak oluşturulup birbirine bağlanmaktadır (`source -> highPass -> lowPass -> guideMicGainNode`). Ancak mikrofon kurtarma fonksiyonu `healGuideMicrophoneIfNeeded()` (satır `1717-1735`) yalnızca `scriptProcessor`, `guideMicGainNode` ve `zeroGainNode` düğümlerini `.disconnect()` etmektedir. Her iyileştirme döngüsünde aynı `mediaStream` üzerinde yeni bir `MediaStreamAudioSourceNode` ve filtre zinciri birikerek bellek ve CPU sızıntısına yol açmaktadır.
- **Önerilen Çözüm Yöntemi:**
  `guideSourceNode`, `guideHighPassNode` ve `guideLowPassNode` referanslarını üst kapsamda saklayın ve `healGuideMicrophoneIfNeeded()` ile `stopBroadcast()` içinde bu düğümlere de `.disconnect()` uygulayın.

---

#### ORTA-03: `public/yaka-karti.html` Sayfasında Her Tuş Vuruşunda (`oninput`) Debounce Olmadan `/api/qr` Ağ İsteği Atılması ve Yarış Durumu (Race Condition)
- **İlgili Dosya ve Satır Aralığı:** `public/yaka-karti.html` — Satır `136`, `160`, `211-278`
- **Sorunun Nedeni:**
  `#customPilgrimInput` ve `#bulkPilgrimsTextarea` alanlarında `oninput="updateBadges()"` tanımlıdır. Kullanıcı toplu hacı listesine 40 kişinin adını yazarken veya yapıştırırken her harfte asenkron `updateBadges()` tetiklenmekte, her çağrıda `await fetch('/api/qr?...')` isteği atılmakta ve tüm kartların DOM ağacı (`grid.innerHTML`) baştan oluşturulmaktadır. Ağ yanıtları farklı sıralarda dönerse eski bir `updateBadges()` çağrısı yeni DOM'un üzerine yazabilmektedir.
- **Önerilen Çözüm Yöntemi:**
  Metin girdilerinde `updateBadges()` çağrısını 250-300 ms `debounce` ile sarmalayın ve `AbortController` veya artan bir `renderSeq` sayacı kullanarak eski yanıtların DOM'u ezmesini engelleyin.

---

#### ORTA-04: `URL.createObjectURL` İle Oluşturulan Web Worker Blob URL'lerinin İptal Edilmemesi (`revokeObjectURL`) ve Temizlenmeyen Zamanlayıcılar
- **İlgili Dosya ve Satır Aralığı:**
  - `public/rehber.html` — Satır `1785-1806`, `2053-2112`
  - `public/dinle.html` — Satır `1509-1518`, `2562-2580`
- **Sorunun Nedeni:**
  1. `rehber.html` (`startBroadcast` içinde, satır `1790`) ve `dinle.html` (`startSilentKeepAlive` içinde, satır `2566`) her yayın/oturum başlatıldığında `new Blob(...)` ve `URL.createObjectURL(...)` ile yeni bir Worker URL'si üretmekte, ancak Worker sonlandırıldığında (`terminate()`) `URL.revokeObjectURL()` çağırmamaktadır.
  2. `dinle.html` satır `1509`'daki `setInterval` (`pilgrimAudioGuardChannel.postMessage({ type: 'ping' })`) sayfa açık kaldığı sürece dinleme durdurulsa bile arka planda çalışmaya devam etmektedir.
- **Önerilen Çözüm Yöntemi:**
  Worker oluşturulduktan hemen sonra veya `terminate()` edilirken `URL.revokeObjectURL(blobUrl)` çağırın; `pilgrimAudioGuardChannel` zamanlayıcısını yalnızca ses açıkken (`audioUnlocked === true`) çalıştıracak şekilde yönetin.

---

#### ORTA-05: `server.js` İçinde `saveState()` Çağrılarının Her API/WebSocket İşleminde Tüm Veritabanını Senkron `fs.writeFileSync` İle Diske Yazması
- **İlgili Dosya ve Satır Aralığı:** `server.js` — Satır `72-79`
- **Sorunun Nedeni:**
  Her SOS bildiriminde, tur güncellemesinde, demo talebinde ve Siyer durağı eklemesinde `saveState(db)` çağrılmakta ve `fs.writeFileSync(RUNTIME_STATE_FILE, JSON.stringify(state, null, 2), 'utf8')` ile tüm veritabanı ana iş parçacığını bloklayarak diske yazılmaktadır. Ayrıca eşzamanlı işlemlerde atomik yazma (önce `.tmp` dosyasına yazıp `fs.rename` yapma) uygulanmadığı için süreç beklenmedik şekilde kapanırsa `state.json` yarım yazılarak bozulabilir.
- **Önerilen Çözüm Yöntemi:**
  `saveState` fonksiyonunu kısa süreli (ör. 250 ms) bir birleştirici (debounce/coalesce) ile `fs.promises.writeFile(tmpFile, ...)` + `fs.promises.rename(tmpFile, RUNTIME_STATE_FILE)` kullanarak asenkron ve atomik hale getirin.

---

#### ORTA-06: `vercel.json` Yapılandırmasında Eski `version: 2` (`builds` / `routes`) Kullanımı ve Gereksiz Büyük Dosyaların Serverless Pakete Dahil Edilmesi
- **İlgili Dosya ve Satır Aralığı:** `vercel.json` — Satır `1-21` ve `.vercelignore` — Satır `1-6`
- **Sorunun Nedeni:**
  1. `vercel.json` içinde eski `builds` ve `routes` direktifleri kullanılmaktadır (Vercel bu kullanımda uyarı vermekte ve modern `rewrites` / `functions` yapısını önermektedir).
  2. `includeFiles: ["data/**", "public/**"]` ayarı nedeniyle `data/umre-acenteleri.json`, `data/outreach-log.json`, `data/bounced-emails.json` gibi B2B pazarlama verileri ve `public/*.pdf` dosyaları her soğuk başlatmada (cold start) sunucusuz fonksiyona paketlenmektedir.
  3. Kök dizindeki `Başlıksız-1234.tif` (7.85 MB) ve `scripts/` klasörü `.vercelignore` içinde dışlanmamıştır.
- **Önerilen Çözüm Yöntemi:**
  `.vercelignore` dosyasına `*.tif`, `scripts/`, `documents/`, `data/outreach-log.json`, `data/umre-acenteleri.json`, `data/bounced-emails.json` ekleyin ve `includeFiles` değerini yalnızca `data/seed.json` ve gerekli HTML/JS şablonlarıyla sınırlandırın.

---

### 🟢 [DÜŞÜK - Kod Kalitesi/Temizlik]

#### DÜŞÜK-01: `public/rehber.html` İçinde DOM'da Karşılığı Olmayan Ölü Fonksiyon (`toggleDemoBroadcast`)
- **İlgili Dosya ve Satır Aralığı:** `public/rehber.html` — Satır `2053-2112`
- **Sorunun Nedeni:**
  `toggleDemoBroadcast()` fonksiyonu `document.getElementById('startDemoStreamBtn')` elemanına erişmeye çalışmaktadır (`btn.textContent = ...`, `btn.className = ...`). Ancak arayüz sadeleştirmesi sırasında `startDemoStreamBtn` butonu HTML'den kaldırılmıştır. Fonksiyon şu an hiçbir yerden çağrılmadığı için çökme yaratmamaktadır, ancak konsoldan veya ileride bir yerden tetiklenirse `TypeError: Cannot set properties of null (setting 'textContent')` hatası fırlatacaktır.
- **Önerilen Çözüm Yöntemi:**
  Kullanılmayan `toggleDemoBroadcast()` fonksiyonunu kaldırın veya `if (btn)` koruması (null-check) ekleyin.

---

#### DÜŞÜK-02: `server.js` İçindeki `/api/forgot-password` Uç Noktasının İşlevsiz (Stub/No-Op) Olması
- **İlgili Dosya ve Satır Aralığı:** `server.js` — Satır `1027-1033`
- **Sorunun Nedeni:**
  `POST /api/forgot-password` uç noktası gelen `email` bilgisini kontrol ettikten sonra gerçekte hiçbir e-posta göndermemekte veya sıfırlama kodu üretmemekte, yalnızca sahte bir başarı mesajı döndürmektedir.
- **Önerilen Çözüm Yöntemi:**
  Ya gerçek bir şifre sıfırlama akışı bağlayın ya da kullanıcıyı yanıltmamak için şifre sıfırlama taleplerini doğrudan sistem yöneticisi iletişim kanalına yönlendirin.

---

#### DÜŞÜK-03: `scripts/check-bounces.js` ve `scripts/detailed-bounces.js` İçinde TLS Sertifika Doğrulamasının Kapatılması (`rejectUnauthorized: false`) ve Korunmasız `.env` Okuması
- **İlgili Dosya ve Satır Aralığı:** `scripts/check-bounces.js` — Satır `6`, `18`
- **Sorunun Nedeni:**
  1. Satır `6`'da `fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')` çağrısı `fs.existsSync` kontrolü olmadan yapılmaktadır (`.env` yoksa betik çöker).
  2. Satır `18`'de `tlsOptions: { rejectUnauthorized: false }` kullanılarak Gmail IMAP bağlantısında SSL/TLS sertifika doğrulaması devre dışı bırakılmıştır (Ortadaki Adam / MITM saldırısına açık).
- **Önerilen Çözüm Yöntemi:**
  `fs.existsSync` kontrolü ekleyin ve `imap.gmail.com` geçerli bir resmi sertifikaya sahip olduğu için `rejectUnauthorized: false` ayarını kaldırın.

---

#### DÜŞÜK-04: Üretim Bağımlılıklarında (`package.json`) Yalnızca CLI Betiklerinin Kullandığı Paketlerin Yer Alması ve Kök Dizindeki Kopya/Gereksiz Dosyalar
- **İlgili Dosya ve Satır Aralığı:**
  - `package.json` — Satır `10-17`
  - `.gitignore` — Satır `1-14`
  - Proje Kök Dizini ve `public/`
- **Sorunun Nedeni:**
  1. `imap-simple`, `mailparser` ve `nodemailer` paketleri `server.js` tarafından hiç kullanılmamakta, yalnızca `scripts/` altındaki yerel pazarlama betikleri tarafından kullanılmaktadır. Buna rağmen `dependencies` altında tutuldukları için bulut sunucu kurulum süresini ve boyutunu artırmaktadırlar.
  2. `Ridvan_Yilmaz_Turizm_RidvanSes_Kullanim_Rehberi.pdf` (2.09 MB) hem kök dizinde hem `public/` dizininde; `Selamet_Turizm_Ozel_Sistem_Sunumu.pdf` (1.48 MB) hem `documents/` hem `public/` dizininde çift kopya olarak bulunmaktadır.
  3. Kök dizinde 0 baytlık `vercel private key.txt` ve 7.85 MB boyutunda `Başlıksız-1234.tif` dosyaları yer almaktadır.
  4. `.gitignore` içinde `.vercel` satırı iki kez (satır `5` ve satır `14`) tekrarlanmıştır.
- **Önerilen Çözüm Yöntemi:**
  Sadece yerel betiklerde kullanılan paketleri `devDependencies` altına taşıyın; kök dizindeki `vercel private key.txt`, `Başlıksız-1234.tif` ve mükerrer PDF kopyalarını temizleyin; `.gitignore` dosyasındaki tekrar eden `.vercel` satırını kaldırın.

---

## 3. Özet Bulgular Tablosu

| Kod | Seviye | Dosya | Satır | Kısa Açıklama |
| :--- | :--- | :--- | :--- | :--- |
| **KRİTİK-01** | `[KRİTİK - Sistemi Çökerten]` | `server.js` | `59-70` | `data/seed.json` okumasının `try/catch` dışında olması (Başlangıçta çökme riski) |
| **KRİTİK-02** | `[KRİTİK - Sistemi Çökerten]` | `server.js` | `1593-1604` | `/api/rea-report` içinde 134.4 MB dosyanın senkron okunması (Event Loop kilidi & OOM çökmesi) |
| **KRİTİK-03** | `[KRİTİK - Sistemi Çökerten]` | `server.js`, `rehber.html`, `panel.html` | `944-1002`, `14`, `15` | Sabit yönetici şifreleri ve istemci HTML içine gömülü `ry_auth_v1_987a6b5c4d` yetki jetonu |
| **KRİTİK-04** | `[KRİTİK - Sistemi Çökerten]` | `server.js` | `547-643`, `911-940` | Kimlik doğrulamasız WebSocket `role: 'guide'` ile canlı rehber yayınını düşürme ve ele geçirme |
| **KRİTİK-05** | `[KRİTİK - Sistemi Çökerten]` | `.env`, `.vercelignore` | `1-2`, `1-6` | Açık metin Gmail Uygulama Şifresi ve `.vercelignore` eksikliği |
| **YÜKSEK-01** | `[YÜKSEK - Fonksiyon Bozan]` | `server.js` | `555`, `1083`, `1171`, `1235`, `1260` | `.map(serializeRoom)` çağrısında `index=0` nedeniyle ilk odanın hacı listesinin gizlenmesi |
| **YÜKSEK-02** | `[YÜKSEK - Fonksiyon Bozan]` | `server.js` | `1071-1085` | `/api/bootstrap` uç noktasının kafile PIN kodlarını, hacı telefonlarını ve SOS verilerini sızdırması |
| **YÜKSEK-03** | `[YÜKSEK - Fonksiyon Bozan]` | `server.js` | `393-448`, `619-622` | `guideDisconnectTimers` haritasının `room.key` yerine `tourCode` ile anahtarlanması (Çoklu oda çakışması) |
| **YÜKSEK-04** | `[YÜKSEK - Fonksiyon Bozan]` | `public/vercel-ws-shim.js` | `52-57`, `219-221` | Yedek MQTT modunda tüm odaların `GENEL` kanalına zorlanması ve halka açık broker kullanımı |
| **YÜKSEK-05** | `[YÜKSEK - Fonksiyon Bozan]` | `public/vercel-ws-shim.js` | `681-711` | `window.fetch` sarmalayıcısının `Headers` nesnesini ezmesi ve origin kontrolü yapmaması |
| **YÜKSEK-06** | `[YÜKSEK - Fonksiyon Bozan]` | `rehber.html`, `dinle.html`, `panel.html`, `ani-kitabi.html`, `yaka-karti.html` | Çeşitli | Seçim kutuları (`<select>`) ve rapor şablonlarında `escapeHtml` eksikliği (DOM XSS) |
| **YÜKSEK-07** | `[YÜKSEK - Fonksiyon Bozan]` | `public/sw.js` | `48-60` | Service Worker'ın `res.ok` kontrolü yapmadan `404`/`500` yanıtlarını önbelleğe yazması |
| **ORTA-01** | `[ORTA - Performans/Mimari]` | `rehber.html`, `server.js`, `dinle.html` | `1349-1364`, `750-770` | Canlı PCM16 sesin Binary WebSocket yerine Base64 JSON ile taşınması (%33 ek yük) |
| **ORTA-02** | `[ORTA - Performans/Mimari]` | `public/rehber.html` | `1623-1677`, `1717-1748` | Mikrofon kurtarma sırasında eski `source`/`highPass`/`lowPass` Web Audio düğümlerinin koparılmaması |
| **ORTA-03** | `[ORTA - Performans/Mimari]` | `public/yaka-karti.html` | `136`, `160`, `211-278` | Her tuş vuruşunda (`oninput`) debounce olmadan `/api/qr` ağ isteği ve DOM yeniden çizimi |
| **ORTA-04** | `[ORTA - Performans/Mimari]` | `rehber.html`, `dinle.html` | `1790`, `1509`, `2566` | `URL.createObjectURL` Blob sızıntısı ve durdurulmayan `pilgrimAudioGuardChannel` zamanlayıcısı |
| **ORTA-05** | `[ORTA - Performans/Mimari]` | `server.js` | `72-79` | Her durum değişikliğinde senkron ve atomik olmayan `fs.writeFileSync` kullanımı |
| **ORTA-06** | `[ORTA - Performans/Mimari]` | `vercel.json`, `.vercelignore` | `1-21`, `1-6` | Eski Vercel `builds`/`routes` yapısı ve gereksiz büyük dosyaların sunucusuz pakete dahil edilmesi |
| **DÜŞÜK-01** | `[DÜŞÜK - Kod Kalitesi/Temizlik]` | `public/rehber.html` | `2053-2112` | Silinmiş `startDemoStreamBtn` elemanına referans veren ölü `toggleDemoBroadcast` fonksiyonu |
| **DÜŞÜK-02** | `[DÜŞÜK - Kod Kalitesi/Temizlik]` | `server.js` | `1027-1033` | İşlevsiz (no-op) `/api/forgot-password` uç noktası |
| **DÜŞÜK-03** | `[DÜŞÜK - Kod Kalitesi/Temizlik]` | `scripts/check-bounces.js` | `6`, `18` | `rejectUnauthorized: false` TLS zafiyeti ve kontrolsüz `.env` okuması |
| **DÜŞÜK-04** | `[DÜŞÜK - Kod Kalitesi/Temizlik]` | `package.json`, `.gitignore`, Kök Dizin | `10-17`, `1-14` | Kullanılmayan üretim bağımlılıkları, mükerrer PDF'ler ve `Başlıksız-1234.tif` (7.85 MB) |
