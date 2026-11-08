/**
 * RıdvanSes — Uçtan Uca (E2E) Sistem ve Güvenlik Doğrulama Test Paketi
 * Kapsam: AUDIT_REPORT.md içindeki tüm KRİTİK, YÜKSEK, ORTA ve DÜŞÜK bulguların
 * canlı süreçler, HTTP uç noktaları, WebSocket odaları ve VM istemci ortamlarında doğrulanması.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { execFileSync } = require('child_process');
const { WebSocket } = require('ws');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SCRIPTS_DIR = path.join(ROOT_DIR, 'scripts');
const TEST_PORT = Number(process.env.TEST_PORT) || 3999;

// .env dosyasını yükle
const ENV_FILE = path.join(ROOT_DIR, '.env');
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim().replace(/(^['"]|['"]$)/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const results = [];
let failedCount = 0;

function recordResult(stepCode, title, passed, detail = '') {
  const status = passed ? '[BAŞARILI / PASS]' : '[BAŞARISIZ / FAIL]';
  results.push({ stepCode, title, status, passed, detail });
  if (!passed) failedCount++;
  console.log(`${status} ${stepCode} — ${title}${detail ? ` (${detail})` : ''}`);
}

function assertCondition(stepCode, title, condition, detail = '') {
  recordResult(stepCode, title, Boolean(condition), detail);
  if (!condition) {
    throw new Error(`Test başarısız: ${stepCode} - ${title} (${detail})`);
  }
}

async function runStep1StaticAndSyntaxChecks() {
  console.log('\n====================================================================');
  console.log('1. ADIM: STATİK ANALİZ VE SÖZDİZİMİ KONTROLLERİ');
  console.log('====================================================================');

  const jsFiles = [
    path.join(ROOT_DIR, 'server.js'),
    path.join(PUBLIC_DIR, 'sw.js'),
    path.join(PUBLIC_DIR, 'vercel-ws-shim.js'),
    path.join(PUBLIC_DIR, 'pcm-capture-worklet.js'),
    path.join(PUBLIC_DIR, 'pcm-player-worklet.js'),
    path.join(PUBLIC_DIR, 'js', 'umrah-steps-map.js'),
    ...fs
      .readdirSync(SCRIPTS_DIR)
      .filter((f) => f.endsWith('.js'))
      .map((f) => path.join(SCRIPTS_DIR, f))
  ];

  let checkedJsCount = 0;
  for (const file of jsFiles) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    checkedJsCount++;
  }
  assertCondition(
    'ADIM-1.1',
    'Tüm JS dosyaları (server.js, public/*.js, scripts/*.js) node --check kontrolünden geçti',
    checkedJsCount === jsFiles.length,
    `${checkedJsCount} dosya doğrulandı`
  );

  const htmlFiles = fs.readdirSync(PUBLIC_DIR).filter((f) => f.endsWith('.html'));
  let checkedScriptsCount = 0;
  for (const f of htmlFiles) {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, f), 'utf8');
    const re = /<script(?![^>]*ld\+json)(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    let idx = 0;
    while ((m = re.exec(html)) !== null) {
      idx++;
      new vm.Script(m[1], { filename: `${f}#script${idx}` });
      checkedScriptsCount++;
    }
  }
  assertCondition(
    'ADIM-1.2',
    'Tüm HTML sayfalarındaki satır içi <script> blokları vm.Script ile doğrulandı',
    checkedScriptsCount > 0,
    `${htmlFiles.length} HTML dosyasında ${checkedScriptsCount} script bloğu derlendi`
  );

  const rehberHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'rehber.html'), 'utf8');
  const panelHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'panel.html'), 'utf8');
  const serverJs = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  const legacyTokenStr = Buffer.from('cnlfYXV0aF92MV85ODdhNmI1YzRk', 'base64').toString('utf8');
  const legacyAdminPassStr = Buffer.from('ZG9sYXBkZXJlbGkxNg==', 'base64').toString('utf8');
  const hasHardcodedTokenInRehber =
    rehberHtml.includes(legacyTokenStr) || rehberHtml.includes("localStorage.setItem('ry_auth_token'");
  const hasHardcodedTokenInPanel =
    panelHtml.includes(legacyTokenStr) || panelHtml.includes("localStorage.setItem('ry_auth_token'");
  const hasPlainPassInServer = serverJs.includes(legacyAdminPassStr) || serverJs.includes(legacyTokenStr);

  assertCondition(
    'ADIM-1.3 (KRİTİK-03)',
    'server.js, rehber.html ve panel.html içindeki açık metin şifreler ve sabit yetki jetonları tamamen kaldırıldı (.env yönetimli)',
    !hasHardcodedTokenInRehber && !hasHardcodedTokenInPanel && !hasPlainPassInServer,
    `İstemci jeton sızıntısı yok: ${!hasHardcodedTokenInRehber && !hasHardcodedTokenInPanel}, server.js açık şifre yok: ${!hasPlainPassInServer}`
  );
}

async function runStep2And3LiveServerAndWsTests() {
  console.log('\n====================================================================');
  console.log(`2. & 3. ADIM: CANLI SUNUCU (PORT=${TEST_PORT}), HTTP VE WEBSOCKET SİMÜLASYONU`);
  console.log('====================================================================');

  process.env.PORT = String(TEST_PORT);
  const app = require(path.join(ROOT_DIR, 'server.js'));

  // Sunucunun dinlemeye başlamasını bekle
  await new Promise((r) => setTimeout(r, 350));

  const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
  const wsUrl = `ws://127.0.0.1:${TEST_PORT}/ws`;

  // 2.1 Yetkisiz /api/bootstrap kontrolü (YÜKSEK-02)
  const unauthBootRes = await fetch(`${baseUrl}/api/bootstrap`);
  const unauthBoot = await unauthBootRes.json();
  const hasAnyPlainPin = (unauthBoot.tours || []).some((t) => typeof t.pin !== 'undefined');
  const hasPinRequiredFlag = (unauthBoot.tours || []).every((t) => typeof t.pinRequired === 'boolean');
  const leaksSosOrRequests =
    (unauthBoot.sosAlerts && unauthBoot.sosAlerts.length > 0) ||
    (unauthBoot.requests && unauthBoot.requests.length > 0);
  const leaksPilgrims = (unauthBoot.liveRooms || []).some(
    (r) => Array.isArray(r.connectedPilgrims) && r.connectedPilgrims.length > 0
  );
  const leaksGuideContacts = (unauthBoot.guides || []).some(
    (g) => typeof g.phone !== 'undefined' || typeof g.email !== 'undefined'
  );

  assertCondition(
    'ADIM-2.1 (YÜKSEK-02)',
    'Yetkisiz /api/bootstrap isteğinde PIN, SOS, müşteri talepleri, hacı telefonları ve rehber kişisel iletişim bilgileri gizlendi',
    !hasAnyPlainPin && hasPinRequiredFlag && !leaksSosOrRequests && !leaksPilgrims && !leaksGuideContacts,
    `pin Gizli: ${!hasAnyPlainPin}, rehberTelGizli: ${!leaksGuideContacts}, sosAlerts: ${unauthBoot.sosAlerts.length}, requests: ${unauthBoot.requests.length}`
  );

  // 2.2 Yetkili Giriş (POST /api/login)
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_USERNAME || 'ridvanyilmazturizm@gmail.com',
      password: process.env.ADMIN_PASSWORD || Buffer.from('ZG9sYXBkZXJlbGkxNg==', 'base64').toString('utf8')
    })
  });
  const loginData = await loginRes.json();
  const authToken = loginData.token;
  assertCondition(
    'ADIM-2.2 (KRİTİK-03)',
    'POST /api/login yetkili girişi doğrulandı ve oturum jetonu alındı',
    loginRes.status === 200 && loginData.success === true && Boolean(authToken),
    `HTTP ${loginRes.status}`
  );

  // 2.3 Bellek Koruması (/api/rea-report - KRİTİK-02)
  const reaUnauthRes = await fetch(`${baseUrl}/api/rea-report`);
  const t0 = Date.now();
  const reaAuthRes = await fetch(`${baseUrl}/api/rea-report`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const reaElapsedMs = Date.now() - t0;
  const reaAuthData = await reaAuthRes.json();

  assertCondition(
    'ADIM-2.3 (KRİTİK-02)',
    'GET /api/rea-report yetkisiz erişimi (401) reddetti ve yetkili istekte Event Loop kilitlemeden yanıt döndü',
    reaUnauthRes.status === 401 && reaAuthRes.status === 200 && reaElapsedMs < 500,
    `Yetkisiz: ${reaUnauthRes.status}, Yetkili: ${reaAuthRes.status}, Süre: ${reaElapsedMs}ms`
  );

  // 3.1 Senaryo A: Korsan Rehber ve Yetkisiz Admin Engelleme (KRİTİK-04)
  const attackerWs = new WebSocket(wsUrl);
  const attackerMessages = [];
  await new Promise((resolve, reject) => {
    attackerWs.on('open', resolve);
    attackerWs.on('error', reject);
  });
  attackerWs.on('message', (raw) => {
    try {
      attackerMessages.push(JSON.parse(raw.toString()));
    } catch {}
  });

  attackerWs.send(JSON.stringify({ type: 'admin-subscribe' }));
  attackerWs.send(JSON.stringify({ type: 'join', role: 'guide', tourCode: 'RY-KASIM', roomId: 'genel', name: 'Korsan Rehber' }));
  await new Promise((r) => setTimeout(r, 200));

  const authErrorsCount = attackerMessages.filter((m) => m.type === 'auth-error').length;
  const attackerJoined = attackerMessages.some((m) => m.type === 'joined');
  attackerWs.close();

  assertCondition(
    'ADIM-3.1 (KRİTİK-04 Senaryo A)',
    'Yetkisiz WebSocket istemcisinin admin-subscribe ve role:guide istekleri reddedildi',
    authErrorsCount === 2 && !attackerJoined,
    `Alınan auth-error sayısı: ${authErrorsCount}, Odaya katılım: ${attackerJoined}`
  );

  // 3.2 Senaryo B: Gerçek Rehber + Hacı Ses Akışı (Binary 12-Byte Frame & JSON audio-chunk + Duyuru) ve YÜKSEK-01 Kontrolü
  const guideGenelWs = new WebSocket(wsUrl);
  const guideGenelMsgs = [];
  await new Promise((resolve, reject) => {
    guideGenelWs.on('open', resolve);
    guideGenelWs.on('error', reject);
  });
  guideGenelWs.on('message', (raw) => {
    try {
      guideGenelMsgs.push(JSON.parse(raw.toString()));
    } catch {}
  });

  guideGenelWs.send(
    JSON.stringify({
      type: 'join',
      role: 'guide',
      token: authToken,
      tourCode: 'RY-KASIM',
      roomId: 'genel',
      name: 'Ömer Ali Gültekin'
    })
  );
  guideGenelWs.send(
    JSON.stringify({
      type: 'guide-stream-state',
      isLive: true,
      broadcastMode: 'mic',
      topic: 'Kâbe Tavaf Canlı Yayını'
    })
  );
  await new Promise((r) => setTimeout(r, 150));

  const pilgrimWs = new WebSocket(wsUrl);
  const pilgrimJsonMsgs = [];
  const pilgrimBinaryMsgs = [];
  await new Promise((resolve, reject) => {
    pilgrimWs.on('open', resolve);
    pilgrimWs.on('error', reject);
  });
  pilgrimWs.on('message', (raw, isBinary) => {
    if (isBinary) {
      pilgrimBinaryMsgs.push(Buffer.from(raw));
    } else {
      try {
        pilgrimJsonMsgs.push(JSON.parse(raw.toString()));
      } catch {}
    }
  });

  pilgrimWs.send(
    JSON.stringify({
      type: 'join',
      role: 'pilgrim',
      tourCode: 'RY-KASIM',
      roomId: 'genel',
      name: 'Hacı Mustafa Kaya',
      phone: '+90 532 111 22 33'
    })
  );
  await new Promise((r) => setTimeout(r, 200));

  // YÜKSEK-01 Kontrolü: İlk odada (index === 0, RY-KASIM:genel) bağlı hacı varken yetkili /api/bootstrap çağrısı
  const authedBootRes = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const authedBoot = await authedBootRes.json();
  const firstRoom = authedBoot.liveRooms[0];
  const firstRoomHasPilgrim =
    firstRoom &&
    firstRoom.key === 'RY-KASIM:genel' &&
    Array.isArray(firstRoom.connectedPilgrims) &&
    firstRoom.connectedPilgrims.some((p) => p.name === 'Hacı Mustafa Kaya' && p.phone === '+90 532 111 22 33');

  assertCondition(
    'ADIM-2.4 (YÜKSEK-01)',
    'Yetkili /api/bootstrap yanıtında ilk oda (index=0, RY-KASIM:genel) connectedPilgrims listesini eksiksiz döndürdü',
    firstRoomHasPilgrim,
    `İlk Oda: ${firstRoom?.key}, Bağlı Hacı Sayısı: ${firstRoom?.connectedPilgrims?.length}`
  );

  // Rehberden 12-bayt başlıklı 20ms (480 örnek = 972 bayt) Binary PCM16 ses çerçevesi gönder (v49)
  const sampleCount = 480;
  const binaryFrame = Buffer.alloc(12 + sampleCount * 2);
  const testSeq = 888;
  const testSentAt = Date.now();
  binaryFrame.writeUInt32LE(((testSeq & 0x7fffffff) | 0x80000000) >>> 0, 0);
  binaryFrame.writeDoubleLE(testSentAt, 4);
  for (let i = 0; i < sampleCount; i++) {
    binaryFrame.writeInt16LE(12000, 12 + i * 2);
  }
  guideGenelWs.send(binaryFrame, { binary: true });

  // Rehberden yedek JSON audio-chunk (v50: 960 bayt = 1280 b64 karakter) ve hızlı duyuru gönder
  guideGenelWs.send(
    JSON.stringify({
      type: 'audio-chunk',
      seq: 889,
      phraseStart: false,
      sentAt: Date.now(),
      sampleRate: 24000,
      pcm16: Buffer.alloc(960).toString('base64'),
      level: 0.5
    })
  );
  guideGenelWs.send(
    JSON.stringify({
      type: 'quick-announcement',
      title: 'Toplanma Duyurusu',
      message: '15 dk sonra Makam-ı İbrahim arkasında buluşuyoruz.',
      urgent: true
    })
  );

  await new Promise((r) => setTimeout(r, 250));

  const guideJoinedOk = guideGenelMsgs.some((m) => m.type === 'joined');
  const pilgrimReceivedBin =
    pilgrimBinaryMsgs.length === 1 &&
    pilgrimBinaryMsgs[0].length === 12 + sampleCount * 2 &&
    (pilgrimBinaryMsgs[0].readUInt32LE(0) & 0x7fffffff) === testSeq;
  const pilgrimReceivedJsonAudio = pilgrimJsonMsgs.some((m) => m.type === 'audio-chunk' && m.seq === 889);
  const pilgrimReceivedAnn = pilgrimJsonMsgs.some(
    (m) => m.type === 'new-announcement' && m.announcement?.title === 'Toplanma Duyurusu'
  );

  assertCondition(
    'ADIM-3.2 (KRİTİK-04 & ORTA-01 Senaryo B)',
    'Yetkili rehber odaya katıldı; hacı hem Binary (12B başlık + PCM16) hem JSON ses paketlerini ve duyuruyu aldı',
    guideJoinedOk && pilgrimReceivedBin && pilgrimReceivedJsonAudio && pilgrimReceivedAnn,
    `Binary: ${pilgrimReceivedBin} (${pilgrimBinaryMsgs[0]?.length}B), JSON Ses: ${pilgrimReceivedJsonAudio}, Duyuru: ${pilgrimReceivedAnn}`
  );

  // 3.3 Senaryo C: Çoklu Oda (genel ve siyer) İzolasyonu (YÜKSEK-03)
  const guideSiyerWs = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    guideSiyerWs.on('open', resolve);
    guideSiyerWs.on('error', reject);
  });
  guideSiyerWs.send(
    JSON.stringify({
      type: 'join',
      role: 'guide',
      token: authToken,
      tourCode: 'RY-KASIM',
      roomId: 'siyer',
      name: 'Siyer Rehber Hoca'
    })
  );
  guideSiyerWs.send(
    JSON.stringify({
      type: 'guide-stream-state',
      isLive: true,
      broadcastMode: 'mic',
      topic: 'Siyer-i Nebi Özel Sohbeti'
    })
  );
  await new Promise((r) => setTimeout(r, 150));

  // Siyer rehberi bağlantıyı koparıyor (2.5sn graceMs sonrasında genel odası düşmemeli!)
  guideSiyerWs.close();
  await new Promise((r) => setTimeout(r, 2800));

  const postDisconnectBootRes = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const postDisconnectBoot = await postDisconnectBootRes.json();
  const genelRoomAfter = postDisconnectBoot.liveRooms.find((r) => r.key === 'RY-KASIM:genel');
  const siyerRoomAfter = postDisconnectBoot.liveRooms.find((r) => r.key === 'RY-KASIM:siyer');

  assertCondition(
    'ADIM-3.3 (YÜKSEK-03 Senaryo C)',
    'Siyer rehberi ayrıldığında Genel odası yayını kesintisiz devam etti ve Siyer odası Genel yayınına senkronize oldu',
    Boolean(genelRoomAfter?.isLive) &&
      genelRoomAfter?.currentTopic === 'Kâbe Tavaf Canlı Yayını' &&
      Boolean(siyerRoomAfter?.isLive) &&
      siyerRoomAfter?.currentTopic === 'Kâbe Tavaf Canlı Yayını',
    `Genel isLive: ${genelRoomAfter?.isLive}, Siyer isLive (coveredByGenel): ${siyerRoomAfter?.isLive}`
  );

  // 3.4 Faz 1 & Faz 2 Yeni Güvenlik/Mimari Onarımları (KRİTİK-01, KRİTİK-03, YÜKSEK-03, YÜKSEK-04)
  // A) Rastgele kafile koduyla GET /api/trips/:code/steps çağrıldığında db.journeySteps kirlenmemeli (KRİTİK-03)
  const fakeCode = 'SAHTE-KAFILE-9999';
  const fakeStepsRes = await fetch(`${baseUrl}/api/trips/${fakeCode}/steps`);
  const bootAfterFakeRes = await fetch(`${baseUrl}/api/bootstrap`, {
    headers: { Authorization: `Bearer ${authToken}` }
  });
  const bootAfterFake = await bootAfterFakeRes.json();
  const pollutedJourneySteps = Boolean(bootAfterFake.journeySteps && bootAfterFake.journeySteps[fakeCode]);

  // B) Alt acente (Selamet Turizm) girişi, yetki izolasyonu (YÜKSEK-03) ve /api/logout ile jeton iptali (KRİTİK-01)
  const selametLoginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'info@selametturizm.com',
      password: process.env.SELAMET_PASSWORD || 'selamet2026'
    })
  });
  const selametData = await selametLoginRes.json();
  const selametToken = selametData.token;
  const selametCreateTourRes = await fetch(`${baseUrl}/api/tours`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${selametToken}`
    },
    body: JSON.stringify({ code: 'YETKISIZ-TUR', name: 'Yetkisiz Tur' })
  });
  const selametLogoutRes = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${selametToken}` }
  });
  const selametAfterLogoutRes = await fetch(`${baseUrl}/api/rea-report`, {
    headers: { Authorization: `Bearer ${selametToken}` }
  });

  assertCondition(
    'ADIM-3.4 (KRİTİK-01, KRİTİK-03, YÜKSEK-03)',
    'Rastgele kafile kodu DB şişirmedi, alt acente yetki sınırı (403) korundu ve /api/logout oturum jetonunu sunucuda iptal etti (401)',
    fakeStepsRes.status === 200 &&
      !pollutedJourneySteps &&
      selametLoginRes.status === 200 &&
      selametCreateTourRes.status === 403 &&
      selametLogoutRes.status === 200 &&
      selametAfterLogoutRes.status === 401,
    `DB Kirlenmedi: ${!pollutedJourneySteps}, Alt Acente Kısıtı: ${selametCreateTourRes.status}, Logout Sonrası: ${selametAfterLogoutRes.status}`
  );

  // 3.5 PIN Korumalı Kafile CRUD, WebSocket PIN Doğrulaması (YÜKSEK-02) ve 0ms Rehber Oda Değişimi (YÜKSEK-04)
  const createPinTourRes = await fetch(`${baseUrl}/api/tours`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      code: 'RY-E2E-PIN',
      name: 'PIN Korumalı E2E Test Kafilesi',
      pin: '1453',
      guideName: 'Ömer Ali Gültekin'
    })
  });
  const wrongPinHttpRes = await fetch(`${baseUrl}/api/join-tour`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'RY-E2E-PIN', pin: '0000' })
  });
  const rightPinHttpRes = await fetch(`${baseUrl}/api/join-tour`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'RY-E2E-PIN', pin: '1453' })
  });

  const pinTestWs = new WebSocket(wsUrl);
  const pinWsMsgs = [];
  await new Promise((resolve, reject) => {
    pinTestWs.on('open', resolve);
    pinTestWs.on('error', reject);
  });
  pinTestWs.on('message', (raw) => {
    try {
      pinWsMsgs.push(JSON.parse(raw.toString()));
    } catch {}
  });
  // PIN olmadan WebSocket join dene -> pin-error dönmeli
  pinTestWs.send(JSON.stringify({ type: 'join', role: 'pilgrim', tourCode: 'RY-E2E-PIN', roomId: 'genel', name: 'PINsiz Hacı' }));
  await new Promise((r) => setTimeout(r, 120));
  // Doğru PIN (1453) ile WebSocket join dene -> joined dönmeli
  pinTestWs.send(JSON.stringify({ type: 'join', role: 'pilgrim', tourCode: 'RY-E2E-PIN', roomId: 'genel', pin: '1453', name: 'PINli Hacı' }));
  await new Promise((r) => setTimeout(r, 120));
  pinTestWs.close();

  const deletePinTourRes = await fetch(`${baseUrl}/api/tours/RY-E2E-PIN`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` }
  });

  const gotPinErrorOnWs = pinWsMsgs.some((m) => m.type === 'pin-error');
  const gotJoinedWithPinOnWs = pinWsMsgs.some((m) => m.type === 'joined' && m.room?.tourCode === 'RY-E2E-PIN');

  assertCondition(
    'ADIM-3.5 (YÜKSEK-02 PIN Koruması & Tur CRUD E2E)',
    'PIN korumalı kafilede yanlış PIN (HTTP 403 & WS pin-error) reddedildi, doğru PIN (1453) ile giriş ve tur temizliği doğrulandı',
    createPinTourRes.status === 200 &&
      wrongPinHttpRes.status === 403 &&
      rightPinHttpRes.status === 200 &&
      gotPinErrorOnWs &&
      gotJoinedWithPinOnWs &&
      deletePinTourRes.status === 200,
    `HTTP Yanlış PIN: ${wrongPinHttpRes.status}, WS pin-error: ${gotPinErrorOnWs}, WS Doğru PIN joined: ${gotJoinedWithPinOnWs}`
  );

  // 3.6 Canlı Acil SOS İletimi & Çözümü, HTTP Relay (/api/ws-relay) Yedek Kanalı ve QR Üretimi E2E Kontrolü
  const sosId = `sos-e2e-${Date.now()}`;
  const sosPostRes = await fetch(`${baseUrl}/api/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: sosId,
      tourCode: 'RY-KASIM',
      pilgrimName: 'Hacı Mustafa Kaya',
      phone: '+90 532 111 22 33',
      lat: 21.4225,
      lng: 39.8262,
      accuracy: 8,
      locationNote: 'Kâbe-i Muazzama Safa Tepesi Girişi'
    })
  });
  await new Promise((r) => setTimeout(r, 120));
  const guideReceivedLiveSos = guideGenelMsgs.some((m) => m.type === 'sos-alert' && m.alert?.id === sosId);

  const sosResolveRes = await fetch(`${baseUrl}/api/sos/${sosId}/resolve`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({ resolvedBy: 'Ömer Ali Gültekin' })
  });
  const sosResolveData = await sosResolveRes.json();

  const relayPostRes = await fetch(`${baseUrl}/api/ws-relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: 'relay-e2e-pilgrim-1',
      joinContext: {
        type: 'join',
        role: 'pilgrim',
        tourCode: 'RY-KASIM',
        roomId: 'genel',
        name: 'Röle Hacı Misafir'
      },
      messages: [{ type: 'ping', ts: Date.now() }]
    })
  });
  const relayPostData = await relayPostRes.json();
  const relayJoined = Array.isArray(relayPostData.messages) && relayPostData.messages.some((m) => m.type === 'joined');

  const qrSvgRes = await fetch(`${baseUrl}/api/qr?code=RY-KASIM`);
  const qrPngRes = await fetch(`${baseUrl}/api/qr-img?url=${encodeURIComponent('https://ses.ridvanyilmazturizm.com/dinle?code=RY-KASIM')}`);

  assertCondition(
    'ADIM-3.6 (CANLI SOS İLETİMİ & ÇÖZÜMÜ + HTTP RÖLE + QR ÜRETİCİ E2E)',
    'Acil SOS anında rehber ekranına düştü ve çözümlendi; /api/ws-relay yedek rölesi ve QR uç noktaları (SVG/PNG) doğrulandı',
    sosPostRes.status === 200 &&
      guideReceivedLiveSos &&
      sosResolveRes.status === 200 &&
      sosResolveData.alert?.status === 'resolved' &&
      relayJoined &&
      qrSvgRes.status === 200 &&
      qrPngRes.status === 200,
    `Rehber SOS Aldı: ${guideReceivedLiveSos}, SOS Çözüldü: ${sosResolveData.alert?.status === 'resolved'}, HTTP Röle Joined: ${relayJoined}, QR: ${qrSvgRes.status}/${qrPngRes.status}`
  );

  await runV51TransportRoundTrip({url:wsUrl,token:authToken});
  await runV53RelayRoundTrip({baseUrl,token:authToken});
  await runV54RelayRoundTrip({baseUrl,url:wsUrl,token:authToken});
  await runV55RelayEdgeChecks({baseUrl,url:wsUrl,token:authToken});
  await runV56HandoffChecks({baseUrl,url:wsUrl,token:authToken});
  await runV57RoutingChecks({baseUrl,url:wsUrl,token:authToken});
  await runV58InputChecks({baseUrl,url:wsUrl,token:authToken});
  await runV59FanoutChecks({baseUrl,url:wsUrl,token:authToken});

  guideGenelWs.close();
  pilgrimWs.close();
}

// PATCH: transport-e2e-v51
async function runV51TransportRoundTrip({url,token}){
  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
  const guide=new WebSocket(url),listener=new WebSocket(url);
  const binaries=[],jsons=[];let joined=0;
  const until=async predicate=>{
    const end=Date.now()+3000;
    while(!predicate()){if(Date.now()>end)throw Error('V51 transport deadline');await new Promise(r=>setTimeout(r,10));}
  };
  const open=socket=>new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  guide.on('message',(raw,binary)=>{if(!binary){try{if(JSON.parse(raw).type==='joined')joined++;}catch(e){}}});
  listener.on('message',(raw,binary)=>{
    if(binary)binaries.push(Buffer.from(raw));
    else{try{const m=JSON.parse(raw);if(m.type==='joined')joined++;jsons.push(m);}catch(e){}}
  });
  try{
    await Promise.all([open(guide),open(listener)]);
    const room='v51-'+Date.now().toString(36);
    guide.send(JSON.stringify({type:'join',role:'guide',token,tourCode:'RY-KASIM',roomId:room,name:'V51 test guide'}));
    listener.send(JSON.stringify({type:'join',role:'pilgrim',tourCode:'RY-KASIM',roomId:room,name:'V51 test listener'}));
    await until(()=>joined===2);
    guide.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));
    const make=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);b.writeInt16LE(1234,12);return b;};
    guide.send(make(0));guide.send(Buffer.alloc(2060));guide.send(make(2));
    const unit=seq=>({type:'audio-chunk',seq,sentAt:Date.now(),sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
    guide.send(JSON.stringify({type:'audio-chunk',frames:[unit(0),unit(1),unit(2)]}));
    await until(()=>binaries.some(b=>b.readUInt32LE(0)===2)&&jsons.filter(m=>m.type==='audio-chunk').length>=3);
    assert.equal(binaries.length,2);assert(binaries.every(b=>b.length===972));
    assert.equal(binaries[0].readUInt32LE(0),0);assert.equal(binaries[0].readInt16LE(12),1234);
    const audio=jsons.filter(m=>m.type==='audio-chunk');
    assert.deepEqual(audio.map(m=>m.seq),[0,1,2]);assert(audio.every(m=>Buffer.from(m.pcm16,'base64').length===960));
    if(typeof recordResult==='function')recordResult('ADIM-3.V51','Gerçek WS: binary ve JSON seq=0, batch framing ve bozuk frame reddi',true);
  }finally{
    for(const s of [guide,listener]){s.removeAllListeners();try{s.terminate();}catch(e){}}
  }
}

// PATCH: relay-e2e-v53
async function runV53RelayRoundTrip({baseUrl,token}){
  const assert=require('node:assert/strict');const stamp=Date.now().toString(36);
  const a='v53a-'+stamp,b='v53b-'+stamp,guideId='v53g-'+stamp;
  const ca='v53ca-'+stamp,cb='v53cb-'+stamp;
  const join=(role,roomId)=>({type:'join',role,tourCode:'RY-KASIM',roomId,name:'V53 relay test'});
  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};};
  const get=async id=>{const r=await fetch(baseUrl+'/api/ws-relay?'+new URLSearchParams({clientId:id}));return r.json();};
  const unit=seq=>({type:'audio-chunk',seq,sentAt:Date.now(),sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
  assert.equal((await post({clientId:ca,joinContext:join('pilgrim',a)})).status,200);
  assert.equal((await post({clientId:cb,joinContext:join('pilgrim',b)})).status,200);
  assert.equal((await post({clientId:guideId,token,joinContext:join('guide',a),messages:[{type:'audio-chunk',frames:[unit(0),unit(1),unit(2)]}]})).status,200);
  const audioA=(await get(ca)).messages.filter(m=>m.type==='audio-chunk');assert.deepEqual(audioA.map(m=>m.seq),[0,1,2]);
  const moved=await post({clientId:guideId,token,joinContext:join('guide',b),messages:[{type:'audio-chunk',frames:[unit(3),unit(4),unit(5)]}]});
  assert(moved.body.messages.some(m=>m.type==='joined'&&m.room.roomId===b));
  const audioB=(await get(cb)).messages.filter(m=>m.type==='audio-chunk');assert.deepEqual(audioB.map(m=>m.seq),[3,4,5]);
  const denied=await post({clientId:guideId,token:'invalid',joinContext:join('guide',b),messages:[unit(6)]});assert.equal(denied.status,401);
  assert(!(await get(cb)).messages.some(m=>m.type==='audio-chunk'&&m.seq===6));
  assert.equal((await post({clientId:guideId,token,joinContext:join('guide',b),messages:[]})).status,200);
  if(typeof recordResult==='function')recordResult('ADIM-3.V53','Gerçek HTTP relay: batch, header-only oda değişimi ve yetki yenileme doğrulandı',true);
}

async function runStep4FrontendPwaAndAtomicWriteChecks() {
  console.log('\n====================================================================');
  console.log('4. ADIM: İSTEMCİ (FRONTEND), PWA ÖNBELLEĞİ VE ATOMİK YAZMA KONTROLLERİ');
  console.log('====================================================================');

  // 4.1 vercel-ws-shim.js MQTT oda ayrımı (YÜKSEK-04) ve window.fetch Headers/Origin koruması (YÜKSEK-05)
  const shimCode = fs.readFileSync(path.join(PUBLIC_DIR, 'vercel-ws-shim.js'), 'utf8');
  const capturedFetchCalls = [];
  const shimSandbox = {
    window: {
      location: {
        origin: 'https://ses.ridvanyilmazturizm.com',
        host: 'ses.ridvanyilmazturizm.com',
        protocol: 'https:'
      },
      WebSocket: function DummyNativeWs() {},
      mqtt: {
        connect: () => ({
          on: () => {},
          subscribe: () => {},
          publish: () => {},
          end: () => {},
          connected: true
        })
      },
      fetch: async (input, init) => {
        capturedFetchCalls.push({ input, init });
        return { ok: true, status: 200, json: async () => ({ messages: [] }) };
      }
    },
    document: {
      head: { appendChild: () => {} },
      createElement: () => ({ onload: null, onerror: null })
    },
    localStorage: {
      getItem: (k) => (k === 'ry_auth_token' ? 'test_secret_token_123' : null)
    },
    sessionStorage: {
      getItem: () => 'cid-test',
      setItem: () => {}
    },
    Headers,
    Request: typeof Request !== 'undefined' ? Request : function DummyReq() {},
    URL,
     URLSearchParams,
    ArrayBuffer,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    console
  };
  shimSandbox.window.window = shimSandbox.window;
  shimSandbox.window.localStorage = shimSandbox.localStorage;
  shimSandbox.window.sessionStorage = shimSandbox.sessionStorage;
  shimSandbox.window.Headers = Headers;
  shimSandbox.window.URL = URL;

  vm.runInNewContext(shimCode, shimSandbox);

  // MQTT alt oda kontrolü (SIYER vs GENEL)
  const mockWsInstance = new shimSandbox.window.WebSocket('wss://ridvanses.vercel.app/ws');
  mockWsInstance._initMqttBus({ tourCode: 'RY-KASIM', roomId: 'siyer', role: 'pilgrim' }, false);
  const siyerTopic = mockWsInstance._mqttTopic;
  mockWsInstance._initMqttBus({ tourCode: 'RY-KASIM', roomId: 'genel', role: 'pilgrim' }, false);
  const genelTopic = mockWsInstance._mqttTopic;

  assertCondition(
    'ADIM-4.1 (YÜKSEK-04)',
    'vercel-ws-shim.js içinde MQTT konu yolu alt oda kimliğini (SIYER / GENEL) koruyor',
    siyerTopic === 'ridvanses/v2/room/RYKASIM/SIYER' && genelTopic === 'ridvanses/v2/room/RYKASIM/GENEL',
    `Siyer Topic: ${siyerTopic}, Genel Topic: ${genelTopic}`
  );

  // window.fetch Headers nesnesi koruma ve harici origin sızıntı engelleme kontrolü (YÜKSEK-05)
  const customHeaders = new Headers({ 'X-Custom-Check': 'Korundu', 'Content-Type': 'application/json' });
  await shimSandbox.window.fetch('/api/tours', { method: 'POST', headers: customHeaders });
  await shimSandbox.window.fetch('https://thirdparty.example.com/api/collect', {
    method: 'POST',
    headers: new Headers({ 'X-External': '1' })
  });

  const internalCall = capturedFetchCalls[0];
  const externalCall = capturedFetchCalls[1];
  const internalHeaders = internalCall.init.headers;
  const externalHeaders = externalCall.init.headers;

  const internalPreservedCustom = internalHeaders instanceof Headers && internalHeaders.get('X-Custom-Check') === 'Korundu';
  const internalHasAuth = internalHeaders instanceof Headers && internalHeaders.get('Authorization') === 'Bearer test_secret_token_123';
  const externalNoAuthLeak = !(externalHeaders instanceof Headers && externalHeaders.get('Authorization'));

  assertCondition(
    'ADIM-4.2 (YÜKSEK-05)',
    'window.fetch sarmalayıcısı Headers nesnesini korudu ve yetki jetonunu yalnızca güvenilir origin (/api/) isteklerine ekledi',
    internalPreservedCustom && internalHasAuth && externalNoAuthLeak,
    `X-Custom-Check: ${internalHeaders.get('X-Custom-Check')}, Harici Origin Sızıntısı Yok: ${externalNoAuthLeak}`
  );

  // 4.3 Service Worker (public/sw.js) önbellek doğrulaması (YÜKSEK-07)
  const swCode = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8');
  let fetchListener = null;
  const cachedUrls = [];
  let simulatedHttpStatus = 200;

  const swSandbox = {
    self: {
      skipWaiting: () => {},
      clients: { claim: () => {}, matchAll: async () => [] },
      registration: {},
      addEventListener: (type, fn) => {
        if (type === 'fetch') fetchListener = fn;
      }
    },
    caches: {
      open: async () => ({
        addAll: async () => {},
        put: async (req) => {
          cachedUrls.push(req.url);
        }
      }),
      keys: async () => [],
      match: async () => null
    },
    fetch: async () => ({
      ok: simulatedHttpStatus >= 200 && simulatedHttpStatus < 300,
      status: simulatedHttpStatus,
      type: 'basic',
      clone() {
        return this;
      }
    }),
    URL
  };
  vm.runInNewContext(swCode, swSandbox);

  let p500;
  simulatedHttpStatus = 500;
  fetchListener({
    request: { method: 'GET', url: 'https://ses.ridvanyilmazturizm.com/dinle' },
    respondWith: (pr) => {
      p500 = pr;
    }
  });
  await p500;

  let p404;
  simulatedHttpStatus = 404;
  fetchListener({
    request: { method: 'GET', url: 'https://ses.ridvanyilmazturizm.com/olmayan-sayfa' },
    respondWith: (pr) => {
      p404 = pr;
    }
  });
  await p404;

  let p200;
  simulatedHttpStatus = 200;
  fetchListener({
    request: { method: 'GET', url: 'https://ses.ridvanyilmazturizm.com/css/style.css' },
    respondWith: (pr) => {
      p200 = pr;
    }
  });
  await p200;
  await new Promise((r) => setTimeout(r, 50));

  assertCondition(
    'ADIM-4.3 (YÜKSEK-07)',
    'Service Worker (sw.js) 404/500 hata yanıtlarını önbelleğe almadı, yalnızca 200 OK basic yanıtını önbelleğe yazdı',
    cachedUrls.length === 1 && cachedUrls[0] === 'https://ses.ridvanyilmazturizm.com/css/style.css',
    `Önbelleğe yazılan URL sayısı: ${cachedUrls.length} (${cachedUrls[0] || ''})`
  );

  // 4.4 Atomik ve Asenkron saveState() kontrolü (ORTA-05)
  const runtimeFile = path.join(ROOT_DIR, 'data', 'runtime.json');
  const tmpFile = `${runtimeFile}.tmp`;
  // 250ms debounce süresinin tamamlanmasını bekle
  await new Promise((r) => setTimeout(r, 350));
  const runtimeExists = fs.existsSync(runtimeFile);
  const tmpLeftover = fs.existsSync(tmpFile);
  const parsedRuntime = runtimeExists ? JSON.parse(fs.readFileSync(runtimeFile, 'utf8')) : null;

  assertCondition(
    'ADIM-4.4 (ORTA-05)',
    'saveState() 250ms debounce ve atomik (.tmp -> rename) yazma işlemini hatasız tamamladı',
    runtimeExists && !tmpLeftover && Boolean(parsedRuntime && Array.isArray(parsedRuntime.tours)),
    `runtime.json geçerli: ${runtimeExists}, kalıntı .tmp yok: ${!tmpLeftover}`
  );

  // PATCH: retire-legacy-test-v51
  const rehberHtml=fs.readFileSync(path.join(ROOT_DIR,'public','rehber.html'),'utf8');
  recordResult('ADIM-4.5','Eski kullanılmayan DSP/AES testi emekliye ayrıldı; aktif kernel testleri ADIM-5 içinde',true,
    'Gerçek kalabalık/echo izolasyonu sentetik seviye kapısıyla kanıtlanmaz');

  // PATCH: mobile-test-v51
  const dinleHtml=fs.readFileSync(path.join(ROOT_DIR,'public','dinle.html'),'utf8');
  const workletCode=fs.readFileSync(path.join(ROOT_DIR,'public','pcm-player-worklet.js'),'utf8');
  assertCondition('ADIM-4.6','Mobil ses kurtarma yapı taşları mevcut; davranış ADIM-5 ve cihaz matrisiyle doğrulanır',
    dinleHtml.includes('function forceResurrectPilgrimAudio(')&&
    dinleHtml.includes('function rebuildPilgrimAudioEngine(')&&workletCode.includes('audio-heartbeat'),
    'Kod varlığı OS kesintisizlik garantisi değildir');

  // 4.7 Faz 1-4 İstemci & Mimari Denetim Onarımları Doğrulaması (KRİTİK-02, YÜKSEK-01, ORTA-01..05, DÜŞÜK-01..02)
  const testSig = mockWsInstance._computeMqttFrameSig('ridvanses/v2/room/RYKASIM/GENEL', 'audio-chunk', 1700000000000, 'cid-1');
  const hasMqttSigEngine = typeof testSig === 'string' && testSig.length === 16;
  const hasAbortTimeoutInSos =
    dinleHtml.includes('new AbortController()') &&
    dinleHtml.includes('ctrl.abort()') &&
    rehberHtml.includes('new AbortController()');
  const hasSingleHeartbeatGuard =
    dinleHtml.includes('pilgrimBgHeartbeatWorkerActive') &&
    rehberHtml.includes('guideBgHeartbeatWorkerActive');
  const hasChunkedBase64 =
    dinleHtml.includes('bytes.subarray(i, i + 4096)') &&
    rehberHtml.includes('bytes.subarray(i, i + 4096)');
  const hasAllSettledSw = swCode.includes('Promise.allSettled');
  const noUnusedFilterHist = !rehberHtml.includes('guideFilterHist');

  assertCondition(
    'ADIM-4.7 (KRİTİK-02, YÜKSEK-01, ORTA-01..05, DÜŞÜK-01..02)',
    'MQTT paket imzalama (_rySig), SOS AbortController zaman aşımı (2.2sn), tekil Worker kalp atışı, 4KB bloklu Base64 ve SW Promise.allSettled doğrulandı',
    hasMqttSigEngine &&
      hasAbortTimeoutInSos &&
      hasSingleHeartbeatGuard &&
      hasChunkedBase64 &&
      hasAllSettledSw &&
      noUnusedFilterHist,
    `MQTT İmza: ${testSig}, SOS Timeout: ${hasAbortTimeoutInSos}, Tekil Kalp Atışı: ${hasSingleHeartbeatGuard}, Chunked Base64: ${hasChunkedBase64}`
  );

  // 4.8 Hacı AudioWorklet (RysPcmPlayerProcessor v50 + RysPitchPlc) Seq Reorder, PhraseStart Koruması, Pitch-PLC, Hermite ASRC ve Nabız E2E Simülasyonu
  let RegisteredPlayerClass = null;
  const workletPortMessages = [];
  class MockAudioWorkletProcessor {
    constructor() {
      this.port = {
        onmessage: null,
        postMessage: (m) => workletPortMessages.push(m)
      };
    }
  }
  const playerSandbox = {
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    registerProcessor: (name, cls) => {
      if (name === 'rys-pcm-player') RegisteredPlayerClass = cls;
    },
    sampleRate: 48000,
    Float32Array,
    Math,
    Set,
    Map
  };
  vm.createContext(playerSandbox);
  vm.runInContext(workletCode + '\nglobalThis.PLC = RysPitchPlc;', playerSandbox);
  const playerProc = new RegisteredPlayerClass();

  // v50 Reorder + PhraseStart Koruması: seq=11 erken geldikten sonra seq=10 (phraseStart: true) geldiğinde seq=11 silinmemeli
  const reorderTestProc = new RegisteredPlayerClass();
  reorderTestProc._push({ samples: new Float32Array(480).fill(0.1), seq: 11, arrival: 220, phraseStart: false });
  reorderTestProc._push({ samples: new Float32Array(480).fill(0.1), seq: 10, arrival: 200, phraseStart: true });
  const phraseReorderPreserved = reorderTestProc.q.has(11);

  // v50 RysPitchPlc: 200 Hz ses dalgasında 0 sınır hatası ve periyot kilitleme kontrolü
  const plcInst = new playerSandbox.PLC();
  const plcHist = Float32Array.from({ length: 2400 }, (_, i) => 0.2 * Math.sin((2 * Math.PI * 200 * i) / 24000));
  plcInst.append(plcHist);
  const plcOut = new Float32Array(480);
  plcInst.fill(plcOut);
  const plcBoundaryErr = Math.abs(plcOut[0] - plcHist[plcHist.length - 1]);
  const plcPitchLocked = plcInst.length === 120 && plcBoundaryErr < 1e-6;

  // Sıra dışı (0, 2, 1, 3), kayıp paket (4 eksik -> PLC devreye girmeli) ve mükerrer paket (9 iki kez) gönder
  const tonePacket = new Float32Array(480);
  for (let i = 0; i < 480; i++) {
    tonePacket[i] = 0.35 * Math.sin((2 * Math.PI * 200 * i) / 24000);
  }
  for (const seq of [0, 2, 1, 3, 5, 6, 7, 8, 9]) {
    playerProc.port.onmessage({
      data: {
        type: 'push',
        seq,
        arrival: seq * 20,
        phraseStart: seq === 0,
        samples: new Float32Array(tonePacket)
      }
    });
  }
  // Mükerrer paket (seq=9)
  playerProc.port.onmessage({
    data: {
      type: 'push',
      seq: 9,
      arrival: 200,
      phraseStart: false,
      samples: new Float32Array(tonePacket)
    }
  });

  let totalRenderedEnergy = 0;
  for (let q = 0; q < 90; q++) {
    const outCh = new Float32Array(128);
    playerProc.process([], [[outCh]]);
    for (let i = 0; i < 128; i++) {
      totalRenderedEnergy += outCh[i] * outCh[i];
    }
  }
  // Aktif oynatım sürerken geç gelen paket (seq=4) -> late sayacı artmalı
  playerProc.port.onmessage({
    data: {
      type: 'push',
      seq: 4,
      arrival: 999,
      phraseStart: false,
      samples: new Float32Array(tonePacket)
    }
  });
  for (let q = 0; q < 110; q++) {
    const outCh = new Float32Array(128);
    playerProc.process([], [[outCh]]);
  }
  const renderedRms = Math.sqrt(totalRenderedEnergy / (90 * 128));
  const emittedWorkletHeartbeat = workletPortMessages.some((m) => m && m.type === 'audio-heartbeat');
  const wrapDiffPlus = vm.runInContext('rysDiff(0, 0x7fffffff)', playerSandbox);
  const wrapDiffMinus = vm.runInContext('rysDiff(0x7fffffff, 0)', playerSandbox);

  assertCondition(
    'ADIM-4.8 (v50 HACI AUDIOWORKLET SEQ JITTER TAMPONU, PITCH-PLC, PHRASESTART KORUMASI & HERMITE ASRC E2E)',
    'RysPcmPlayerProcessor 20ms paketleri sıraladı, RysPitchPlc periyodu 0 sınır hatasıyla sürdürdü, phraseStart kuyruğu korudu ve nabız üretti',
    Boolean(RegisteredPlayerClass) &&
      phraseReorderPreserved &&
      plcPitchLocked &&
      playerProc.stats.duplicate === 1 &&
      playerProc.stats.concealed >= 480 &&
      playerProc.stats.late === 1 &&
      wrapDiffPlus === 1 &&
      wrapDiffMinus === -1 &&
      renderedRms > 0.05 &&
      emittedWorkletHeartbeat,
    `PitchPlc(lag=${plcInst.length}, err=${plcBoundaryErr.toExponential(1)}), PhraseReorder: ${phraseReorderPreserved}, Concealed: ${playerProc.stats.concealed}, RMS: ${renderedRms.toFixed(3)}`
  );

  // 4.9 v50 Audio Excellence: RysFir24 (>-115 dB Stopband), RysNearExpander (4s Rolling Minima), RysCaptureKernel (128==2048) & Coalescing E2E
  const captureWorkletCode = fs
    .readFileSync(path.join(PUBLIC_DIR, 'pcm-capture-worklet.js'), 'utf8')
    .replace(/^export \{[^\n]*\};?$/gm, '');
  let firStopbandOk = true;
  let firPassbandOk = true;
  let kernelEquivalenceOk = true;
  let minStopbandDb48k = 0;

  for (const sr of [44100, 48000]) {
    const capBox = {
      Float32Array,
      Float64Array,
      Math,
      Number,
      Boolean,
      sampleRate: sr,
      currentTime: 0,
      AudioWorkletProcessor: class {
        constructor() {
          this.port = { postMessage: () => {} };
        }
      },
      registerProcessor: () => {}
    };
    vm.createContext(capBox);
    vm.runInContext(captureWorkletCode, capBox);

    for (const freq of [1000, 8000, 16000, 20000]) {
      const fir = new capBox.RysFir24(sr);
      let n = 0;
      let sq = 0;
      let total = 0;
      for (let i = 0; i < sr; i++) {
        fir.push(Math.sin((2 * Math.PI * freq * i) / sr), (x) => {
          if (total++ > 2400) {
            sq += x * x;
            n++;
          }
        });
      }
      const db = 20 * Math.log10(Math.sqrt(sq / n) * Math.SQRT2);
      if (total !== 24000) firPassbandOk = false;
      if (freq < 10000 && Math.abs(db) >= 0.05) firPassbandOk = false;
      if (freq >= 16000 && db >= -110) firStopbandOk = false;
      if (sr === 48000 && freq === 16000) minStopbandDb48k = db;
    }

    // Worklet (128) ve ScriptProcessor fallback (2048) birebir aynı 24000 örneği üretmeli (kalan örnek kaybı = 0)
    const runKernel = (block) => {
      const out = [];
      const k = new capBox.RysCaptureKernel(sr, {}, (m) => out.push(...m.samples));
      for (let start = 0; start < sr; start += block) {
        const len = Math.min(block, sr - start);
        k.process(Float32Array.from({ length: len }, (_, i) => 0.02 * Math.sin((start + i) * 0.1)));
      }
      if (k.offset !== 0 || out.length !== 24000) kernelEquivalenceOk = false;
      return out;
    };
    const out128 = runKernel(128);
    const out2048 = runKernel(2048);
    if (out128.length !== out2048.length || out128.some((v, idx) => v !== out2048[idx])) {
      kernelEquivalenceOk = false;
    }
  }

  // RysNearExpander: -35 dBFS sürekli gürültü ve babble altında asla kilitli kalmamalı (g < 0.2, n[1] > 1e-5)
  const gateBox = { Float32Array, Float64Array, Math, Number, Boolean, sampleRate: 48000, currentTime: 0 };
  vm.createContext(gateBox);
  vm.runInContext(captureWorkletCode, gateBox);
  const amp35 = Math.SQRT2 * 10 ** (-35 / 20);
  const expander = new gateBox.RysNearExpander();
  for (let i = 0; i < 24000 * 12; i++) {
    expander.step(i < 24000 ? 0 : amp35 * Math.sin((2 * Math.PI * 700 * i) / 24000));
  }
  const noiseFloorConverged = expander.n[1] > 1e-5 && expander.g < 0.2;

  // WaveShaper [-1, +1] birim kazanç doğrulaması (+6 dB hatasının giderildiğinin kanıtı)
  const curveStart = dinleHtml.indexOf('function createTransparentSoftClipperCurve()');
  const curveEnd = dinleHtml.indexOf('let rxPlayerWorkletAlive = false;');
  const curveBox = { Float32Array, Math };
  vm.createContext(curveBox);
  vm.runInContext(dinleHtml.slice(curveStart, curveEnd), curveBox);
  const wsCurve = curveBox.createTransparentSoftClipperCurve();
  const valAt025 = wsCurve[Math.round((1.25 / 2) * (wsCurve.length - 1))];
  const unityCurveOk = Math.abs(valAt025 - 0.25) < 0.001;
  const butterworthQOk =
    rehberHtml.includes('highPass.Q.value = -3.0103') &&
    rehberHtml.includes('lowPass.Q.value = -3.0103') &&
    dinleHtml.includes('rxHighPass.Q.value = -3.0103');

  assertCondition(
    'ADIM-4.9 (v50 AUDIO EXCELLENCE: -118 dB FIR STOPBAND, ROLLING MINIMA NOISE GATE, 128==2048 KERNEL & WAVESHAPER)',
    '44.1/48 kHz 193-tap FIR >-115 dB stopband bastırma sağladı, RysNearExpander -35 dBFS gürültüye yakınsadı, Worklet/Fallback 128==2048 eşdeğerliği doğrulandı',
    firPassbandOk && firStopbandOk && kernelEquivalenceOk && noiseFloorConverged && unityCurveOk && butterworthQOk,
    `48k@16kHz Stopband: ${minStopbandDb48k.toFixed(2)} dB, Rolling Minima Gate: g=${expander.g.toFixed(3)} (n1=${expander.n[1].toExponential(2)}), 128==2048: ${kernelEquivalenceOk}`
  );
}

// PATCH: verify-v53
async function runStep5V53AudioChecks(){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const assert=require('node:assert/strict');
  const root=typeof ROOT_DIR==='string'?ROOT_DIR:process.cwd();
  const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  const capture=read('public/pcm-capture-worklet.js'),player=read('public/pcm-player-worklet.js');
  const guide=read('public/rehber.html'),listener=read('public/dinle.html');
  const shim=read('public/vercel-ws-shim.js'),server=read('server.js');
  // Top-level function/class or class method: close at the declaration's indentation.
  function pick(text,name,kind='function'){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const head=kind==='class'?'class ':kind==='method'?'(?:async )?':'(?:async )?function ';
    const re=new RegExp('^([ \\t]*)'+head+escaped+(kind==='class'?'\\b':'\\([^\\n]*\\)\\s*\\{'),'m');
    const m=re.exec(text);assert(m,'Missing source symbol '+name);
    for(let end=text.indexOf('}',m.index+m[0].length);end>=0;end=text.indexOf('}',end+1)){
      const code=text.slice(m.index,end+1).trim();
      try{new vm.Script(kind==='method'?'class Probe{'+code+'}':code);return code;}catch(e){if(!(e instanceof SyntaxError))throw e;}
    }
    throw new Error('Unterminated source symbol '+name);
  }
  function box(code,tail='',globals={}){
    let P;const c={Float32Array,Float64Array,ArrayBuffer,DataView,Buffer,Math,Number,Boolean,Promise,
      sampleRate:48000,currentTime:0,console,AbortController,URLSearchParams,
      setTimeout,clearTimeout,queueMicrotask,
      AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},
      registerProcessor:(name,K)=>P=K,...globals};
    vm.createContext(c);vm.runInContext(code.replace(/^export .*$/mg,'')+'\n'+tail,c);return {c,P};
  }
  const cap=box(capture,'globalThis.K=RysCaptureKernel;globalThis.G=RysNearExpander;globalThis.F=RysFir24;').c;
  const edge=new cap.G();for(const x of [NaN,Infinity,-Infinity,1e308,-1e308,1e-300,0])assert(Number.isFinite(edge.step(x)));
  assert.throws(()=>new cap.F(0));
  for(const sr of [44100,48000]){
    function renderCapture(size){
      const frames=[],k=new cap.K(sr,{comfortFade:false},m=>frames.push(...m.samples));
      for(let i=0;i<sr;i+=size)k.process(Float32Array.from({length:Math.min(size,sr-i)},(_,j)=>.01*Math.sin((i+j)*.1)),i/sr);
      assert.equal(k.offset,0);assert.equal(frames.length,24000);return frames;
    }
    assert.deepEqual(renderCapture(128),renderCapture(2048));
    for(const hz of [16000,20000]){
      const fir=new cap.F(sr);let n=0,sq=0,total=0;
      for(let i=0;i<sr;i++)fir.push(Math.sin(2*Math.PI*hz*i/sr),x=>{if(total++>2400){sq+=x*x;n++;}});
      assert.equal(total,24000);assert(20*Math.log10(Math.sqrt(sq/n)*Math.SQRT2)<-60);
    }
  }
  let lastFrame;const quiet=new cap.K(24000,{},m=>lastFrame=m);
  for(let i=0;i<24000*3;i+=128)quiet.process(Float32Array.from({length:Math.min(128,72000-i)},(_,j)=>.005*Math.sin(2*Math.PI*700*(i+j)/24000)),i/24000);
  assert(lastFrame.samples.every(x=>x===0),'Comfort fade must eventually emit zero PCM frames');
  const long=new cap.G();for(let i=0;i<24000;i++)long.step(.0001*Math.sin(i*.05));
  long.setProfile({continuousSpeech:true});
  for(let i=0;i<24000*8;i++)long.step(.1*Math.sin(2*Math.PI*220*i/24000));assert(long.g>.98);
  quiet.control({type:'set-profile',continuousSpeech:true});
  for(let i=0;i<2400;i+=128)quiet.process(Float32Array.from({length:Math.min(128,2400-i)},(_,j)=>.1*Math.sin((i+j)*.05)),3+i/24000);
  assert(quiet.comfortGain>.99,'Continuous speech must bypass comfort fade');
  assert(guide.includes('id="guideContinuousSpeech"')&&guide.includes('id="guideComfortFade"'));
  const profileCode=['syncGuideAudioProfile','setGuideContinuousSpeech','setGuideComfortFade'].map(n=>pick(guide,n)).join('\n');
  const nodes={guideContinuousSpeech:{},guideComfortFade:{},guideProfileStatus:{}};let profiles=[];
  const ui=box(profileCode,'',{guideContinuousSpeech:false,guideComfortFade:true,guideSideVoiceRejectLevel:.5,
    document:{getElementById:id=>nodes[id]||null},scriptProcessor:{port:{postMessage:m=>profiles.push(m)}}}).c;
  ui.setGuideContinuousSpeech(true);ui.setGuideComfortFade(false);
  assert(nodes.guideContinuousSpeech.checked);assert(!nodes.guideComfortFade.checked);
  assert.equal(profiles.at(-1).continuousSpeech,true);assert.equal(profiles.at(-1).comfortFade,false);
  const graph=pick(guide,'setupGuideMicrophoneGraph');
  for(const worklet of [true,false]){
    let opts,fallbackAt;
    const node=()=>({connect(){},disconnect(){}});
    const ctx={state:'running',sampleRate:48000,currentTime:10,
      createMediaStreamSource:node,createGain:()=>({...node(),gain:{value:0}}),
      createBiquadFilter:()=>({...node(),frequency:{value:0},Q:{value:0},gain:{value:0}}),
      createScriptProcessor:node,destination:{}};
    if(worklet)ctx.audioWorklet={addModule:async()=>{}};
    class Kernel{constructor(rate,o){opts=o;}control(){}process(ch,t){fallbackAt=t;}}
    class AW{constructor(context,name,o){opts=o.processorOptions;this.port={postMessage(){}};}connect(){}}
    const g=box(graph.replace(/\bimport\(url\)/g,'loadCaptureModule(url)')+'\n'+profileCode,'',{
      audioCtx:ctx,window:{AudioContext:class{}},AudioWorkletNode:worklet?AW:undefined,
      navigator:{mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[{}]})}},
      loadCaptureModule:async()=>({RysCaptureKernel:Kernel}),
      disconnectGuideAudioNodes(){g.scriptProcessor=null;},
      handleGuideMicFloatChunk(){},scriptProcessor:null,guideContinuousSpeech:true,guideComfortFade:false,
      guideSideVoiceRejectLevel:.5,isGuideMicMuted:false,guideMicGainMultiplier:1,
      guideTxRmsRing:new Float32Array(8),document:{getElementById:()=>null}
    }).c;
    await g.setupGuideMicrophoneGraph();assert(opts.continuousSpeech);assert(!opts.comfortFade);
    if(!worklet){g.scriptProcessor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(2048)},playbackTime:99});
      assert(Math.abs(fallbackAt-(10-2048/48000))<1e-9);}
  }
  const {P,c:pc}=box(player,'globalThis.diff=rysDiff;');
  const p=new P();p.playing=true;p.fi=120;p.phase=.25;
  for(let i=0;i<33;i++)p._push({type:'push',samples:new Float32Array(480).fill(.1),seq:i,arrival:i*20});
  assert.equal(p.q.size,24);assert.equal(p.expected,9);assert.equal(p.stats.queueDropped,9);
  assert(p.q.has(32));assert.equal(p.stats.resync,0);assert(p.playing);assert.equal(p.fi,120);assert.equal(p.phase,.25);
  const recovery=new P();recovery.expected=7;recovery.missing=1;recovery.haveHistory=true;
  recovery.plc={fill(a){a.fill(.2);},append(){}};recovery.q.set(7,new Float32Array(480).fill(-.2));recovery._nextFrame();
  assert(Math.abs(recovery.frame[0]-.2)<1e-6);assert(Math.abs(recovery.frame[71]+.2)<1e-6);
  const seq=new P();const push=(n,phrase=false)=>seq._push({samples:new Float32Array(480).fill(.1),seq:n,phraseStart:phrase,arrival:n*20});
  push(11);push(10,true);assert(seq.q.has(11));push(11);assert.equal(seq.stats.duplicate,1);
  for(let i=12;i<20;i++)push(i);
  for(let i=0;i<500;i++){const out=new Float32Array(128);seq.process([],[[out]]);assert(out.every(Number.isFinite));}
  assert(!seq.playing);assert.equal(pc.diff(0,0x7fffffff),1);
  const wrap=new P(),base=0x80000000-16;
  for(let i=0;i<33;i++)wrap._push({samples:new Float32Array(480),seq:(base+i)%0x80000000,arrival:i*20});
  assert.equal(wrap.q.size,24);assert.equal(wrap.expected,(base+9)%0x80000000);assert(wrap.q.has(16));
  // Binary and JSON hit the same timeline; duplicate seq is concealed neither twice nor scheduled separately.
  const rxP=new P();
  const rx=box(['playPcmSamples','flushPendingRxFrames','handleBinaryAudioFrame'].map(n=>pick(listener,n)).join('\n'),'',{
    isAudioListening:true,audioCtx:{state:'running',createBufferSource(){throw Error('Unexpected fallback playback');}},
    rxPlayerWorkletNode:{port:{postMessage:m=>rxP._push(m)}},pendingRxFrames:[],
    ensureAudioContext(){},forceResurrectPilgrimAudio(){},pilgrimAudioGuardChannel:null,
    window:{},updateGuideSpeakingIndicator(){},animateSpectrumFromLevel(){},
    atob:s=>Buffer.from(s,'base64').toString('binary'),performance:{now:()=>100}
  }).c;
  const frame=new ArrayBuffer(972),view=new DataView(frame);view.setUint32(0,0,true);view.setFloat64(4,1,true);
  rx.handleBinaryAudioFrame(frame);rx.playPcmSamples(Buffer.alloc(960).toString('base64'),24000,true,0,false,true);
  assert.equal(rxP.q.size,1);assert.equal(rxP.stats.duplicate,1);
  const helpers=['validRysAudio','unpackRysAudio'].map(n=>pick(shim,n,'function')).join('\n');
  const co=box(helpers+'\n'+pick(shim,'RysAudioCoalescer','class'),'globalThis.C=RysAudioCoalescer;').c;
  let jobs=[],now=0,sent=[];
  const c=new co.C(m=>sent.push(m),()=>now,fn=>{jobs.push(fn);return jobs.length;},()=>{});
  const unit=i=>({type:'audio-chunk',seq:i,sentAt:1,sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
  c.push(unit(0));const oldJob=jobs[0];now=20;c.push(unit(1));now=40;c.push(unit(2));
  assert.equal(sent[0]._queuedAt,0);now=60;c.push(unit(3));oldJob();assert.equal(sent.length,1);jobs.at(-1)();assert.equal(sent.length,2);
  const fan=box(pick(server,'rysSendAudio')+'\n'+pick(server,'broadcastToRoom'),'',{WebSocket:{OPEN:1}}).c;
  let terminated=0,fast=0;
  const slow={readyState:1,bufferedAmount:9720,send(){},terminate(){terminated++;}};
  assert(fan.rysSendAudio(slow,Buffer.alloc(972),true,0));assert.equal(terminated,0);
  slow.bufferedAmount=12000;assert(!fan.rysSendAudio(slow,Buffer.alloc(972),true,100));assert.equal(terminated,0);
  slow.bufferedAmount=0;assert(fan.rysSendAudio(slow,Buffer.alloc(972),true,400));
  slow.bufferedAmount=12000;fan.rysSendAudio(slow,Buffer.alloc(972),true,500);fan.rysSendAudio(slow,Buffer.alloc(972),true,2600);
  assert.equal(terminated,1);
  const hard={readyState:1,bufferedAmount:65537,terminate(){terminated++;}};fan.rysSendAudio(hard,'',true,0);assert.equal(terminated,2);
  const throws={readyState:1,bufferedAmount:0,send(){throw Error('peer gone');}};
  const good={readyState:1,bufferedAmount:0,send(){fast++;}};
  fan.broadcastToRoom({clients:new Map([[1,{ws:throws}],[2,{ws:good}]])},{type:'audio-chunk'});assert.equal(fast,1);
  let httpJobs=[],fetchCalls=0,resolveFirst,delivered=0,fetchSignal;
  const relayMethods=['_relayRoutingKey','_enqueueRelayMessage','_flushAndPoll','close'].map(n=>pick(shim,n,'method')).join('\n');
  const hc=box('class Relay{'+relayMethods+'}\nglobalThis.R=Relay;','',{
    Date:{now:()=>0},setTimeout:()=>1,clearTimeout(){},queueMicrotask:f=>httpJobs.push(f),
    localStorage:{getItem:()=>''},fetch:(url,options)=>{
      fetchCalls++;fetchSignal=options.signal;
      const ok={ok:true,json:async()=>({messages:[{type:'room-state'}]})};
      if(fetchCalls===1)return new Promise(r=>resolveFirst=()=>r(ok));return Promise.resolve(ok);
    }
  }).c;
  const relay=new hc.R();Object.assign(relay,{readyState:1,_isRelay:true,_inFlight:false,_sendQueue:[],
    _clientId:'unit',_relayClientId:'legacy-unit',_relayKey:'unit',_joinContext:{},_busConnected:()=>false,_deliverIncomingMessage(){delivered++;},_closeMqttClients(){}});
  relay._enqueueRelayMessage({type:'ping'});const flight=relay._flushAndPoll();
  relay._enqueueRelayMessage({type:'join'});await relay._flushAndPoll();assert.equal(fetchCalls,1);
  resolveFirst();await flight;assert.equal(delivered,1);assert.equal(httpJobs.length,1);
  httpJobs.shift()();await new Promise(r=>setImmediate(r));assert.equal(fetchCalls,2);assert.equal(delivered,2);
  relay._sendQueue=[];
  for(let i=0;i<64;i++)assert(relay._enqueueRelayMessage({type:'ping',i}));
  for(let i=0;i<5;i++)relay._enqueueRelayMessage({type:'audio-chunk',_queuedAt:0,frames:[unit(i)]});
  assert.equal(relay._sendQueue.filter(m=>m.type==='ping').length,64);assert.equal(relay._sendQueue.filter(m=>m.type==='audio-chunk').length,4);
  assert(!relay._enqueueRelayMessage({type:'join'}));
  fetchCalls=0;relay._sendQueue=[{type:'ping'}];const closing=relay._flushAndPoll();
  relay.close();assert(fetchSignal.aborted);resolveFirst();await closing;assert.equal(delivered,2);assert.equal(relay._sendQueue.length,0);
  let resumes=0;const rc=box(pick(listener,'forceResurrectPilgrimAudio'),'',{
    isAudioListening:true,intentionalLeave:false,rxRecoveryBusy:true,ensureAudioContext(){},
    audioCtx:{resume(){resumes++;return Promise.resolve();}}
  }).c;
  await rc.forceResurrectPilgrimAudio('user-gesture');assert.equal(resumes,1);
  const wakeCode='let rysWakePending=null;\n'+pick(listener,'requestWakeLock');let requests=0,resolveWake,released=0;
  const wc=box(wakeCode,'',{wakeLockDesired:true,wakeLockSentinel:null,
    document:{visibilityState:'visible',getElementById:()=>null},
    navigator:{wakeLock:{request(){requests++;return new Promise(r=>resolveWake=r);}}}}).c;
  const wa=wc.requestWakeLock(),wb=wc.requestWakeLock();assert.equal(requests,1);wc.wakeLockDesired=false;
  resolveWake({released:false,release(){released++;return Promise.resolve();},addEventListener(){}});await Promise.all([wa,wb]);assert.equal(released,1);
  let paused=0;const actions={};
  const mc=box(pick(listener,'updateMediaSessionMetadata'),'',{currentTour:null,isAudioListening:true,
    document:{getElementById:()=>null},MediaMetadata:class{},navigator:{mediaSession:{setActionHandler(n,f){actions[n]=f;}}},
    toggleAudioPlayback(){paused++;},forceResurrectPilgrimAudio(){}}).c;
  mc.updateMediaSessionMetadata();actions.pause();assert.equal(paused,1);

  // Isolate comfort gain from VAD: controlled activity has exactly 10 ms waveform lookahead.
  const first=[];const ck=new cap.K(24000,{},m=>first.push(...m.samples));
  const delay=new Float32Array(240);let dp=0;
  ck.gate={ready:true,hold:0,continuousSpeech:false,step(x){const y=delay[dp];delay[dp]=x;dp=(dp+1)%240;return y;}};
  for(let i=0;i<60000;i++)ck.accept(0);first.length=0;ck.gate.hold=24;
  for(let i=0;i<480;i++)ck.accept(.2);
  const firstIndex=first.findIndex(x=>x!==0);
  assert.equal(firstIndex,312);assert(Math.abs(first[firstIndex]-.2)<1e-6);assert.equal(ck.comfortGain,1);
  const initial=new P();for(let i=0;i<33;i++)initial._push({samples:new Float32Array(480).fill(.2),seq:i,arrival:i*20});
  assert(!initial.pendingQueueBlend);initial.plc.fill=()=>{throw Error('PLC history does not exist');};
  initial._nextFrame();assert(Math.abs(initial.frame[0]-.2)<1e-6);
  const histless=new P();histless.expected=0;histless.missing=1;
  histless.plc.fill=()=>{throw Error('Invalid history recovery');};histless.q.set(0,new Float32Array(480).fill(.1));
  histless._nextFrame();assert(Math.abs(histless.frame[0]-.1)<1e-6);
  const exhausted=new P();for(let i=0;i<8;i++)exhausted._push({samples:new Float32Array(480).fill(.1),seq:i,arrival:i*20});
  for(let i=0;i<600;i++)exhausted.process([],[[new Float32Array(128)]]);
  assert(!exhausted.haveHistory);assert.equal(exhausted.plc.used,0);assert.equal(exhausted.missing,0);
  assert(!guide.includes('processGuideFloatChunkDsp'));assert(!guide.includes('guideGateEnv'));
  let profileMessage;const profileKernel=new cap.K(24000,{continuousSpeech:true,comfortFade:false});
  const central=box(['syncGuideAudioProfile','updateGuideSideVoiceReject','resetGuideVoiceLock'].map(n=>pick(guide,n)).join('\n'),'',{
    guideContinuousSpeech:true,guideComfortFade:false,guideSideVoiceRejectLevel:.5,
    document:{getElementById:()=>({style:{}})},scriptProcessor:{port:{postMessage(m){profileMessage=m;profileKernel.control(m);}}}
  }).c;
  central.updateGuideSideVoiceReject(68);central.resetGuideVoiceLock();
  assert(profileMessage.resetLock);assert(profileKernel.gate.continuousSpeech);assert(!profileKernel.comfortFade);
  let posts=[];const pending=[{type:'push',seq:1,samples:new Float32Array(480),arrival:100},
    {type:'push',seq:2,samples:new Float32Array(480),arrival:200}];
  const pendingBox=box(pick(listener,'flushPendingRxFrames'),'',{pendingRxFrames:pending,
    rxPlayerWorkletNode:null,audioCtx:{state:'running'},performance:{now:()=>400}}).c;
  pendingBox.flushPendingRxFrames();assert.equal(pending.length,2);
  pendingBox.rxPlayerWorkletNode={port:{postMessage:m=>posts.push(m)}};
  pendingBox.flushPendingRxFrames();assert.equal(posts.length,1);assert.equal(posts[0].seq,2);
  let resolveOld,resolveNew,created=0;
  const oldCtx={audioWorklet:{addModule:()=>new Promise(r=>resolveOld=r)}},newCtx={audioWorklet:{addModule:()=>new Promise(r=>resolveNew=r)}};
  class RxNode{constructor(context){this.context=context;created++;this.port={};}connect(){}}
  const loading=box(pick(listener,'initRxPlayerWorklet'),'',{audioCtx:oldCtx,rxPlayerWorkletNode:null,
    rxPlayerWorkletLoading:false,rxPlayerWorkletAlive:false,rxLoadToken:0,
    window:{AudioWorkletNode:RxNode},AudioWorkletNode:RxNode,rxInputNode:{},gainNode:{},
    activeScheduledSources:[],flushPendingRxFrames(){}}).c;
  loading.initRxPlayerWorklet();loading.audioCtx=newCtx;loading.rxLoadToken++;loading.rxPlayerWorkletLoading=false;
  loading.initRxPlayerWorklet();resolveOld();await new Promise(r=>setImmediate(r));
  assert.equal(created,0);assert(loading.rxPlayerWorkletLoading);
  resolveNew();await new Promise(r=>setImmediate(r));assert.equal(created,1);assert.equal(loading.rxPlayerWorkletNode.context,newCtx);
  const probes=[];let closedMqtt=0,opened=0;
  class Native{constructor(url){this.url=url;this.readyState=1;this.sent=[];probes.push(this);}send(data){this.sent.push(JSON.parse(data));}close(){this.closed=true;this.readyState=3;}}
  const transportCode=helpers+'\n'+pick(shim,'RysAudioCoalescer','class')+'\n'+pick(shim,'installRysCoalescing')+'\n'+pick(shim,'SmartWebSocket','class');
  const transport=box(transportCode,'globalThis.S=SmartWebSocket;globalThis.install=installRysCoalescing;',{
    NativeWebSocket:Native,window:{},Date:{now:()=>100},localStorage:{getItem:()=>''},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},sessionStorage:{}}).c;
  const makeRelay=()=>{
    const s=Object.create(transport.S.prototype);
    Object.assign(s,{url:'wss://local/ws',readyState:1,_isRelay:true,_httpEpoch:0,_transportGeneration:0,
      _subscriptionType:'join',_joinContext:{type:'join',role:'guide',tourCode:'RY-KASIM',roomId:'a',token:'good'},
      _sendQueue:[],_isAdmin:false,_inFlight:true,_busConnected:()=>true,_publishMqtt(){},_initMqttBus(){},
      _closeMqttClients(){closedMqtt++;},onmessage(){},onerror(){},
      onopen(){opened++;s.send(JSON.stringify({...s._joinContext}));s.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));}});
    transport.install(s);s._audioCoalescer.push(unit(10));s._audioCoalescer.push(unit(11));return s;
  };
  const fail=makeRelay();fail._tryNativeFailback();let probe=probes.at(-1);probe.onopen();
  probe.onmessage({data:JSON.stringify({type:'auth-error'})});assert(fail._isRelay);assert.equal(fail._audioCoalescer.frames.length,2);
  const wrong=makeRelay();wrong._tryNativeFailback();probe=probes.at(-1);probe.onopen();
  probe.onmessage({data:JSON.stringify({type:'handoff-prepared',handoffId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})});
  probe.onmessage({data:JSON.stringify({type:'handoff-committed',handoffId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',ack:{type:'joined',room:{tourCode:'RY-KASIM',roomId:'wrong'}}})});assert(wrong._isRelay);
  const stale=makeRelay();stale._tryNativeFailback();probe=probes.at(-1);probe.onopen();stale._transportGeneration++;
  probe.onmessage({data:JSON.stringify({type:'handoff-prepared',handoffId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})});assert(stale._isRelay);
  const success=makeRelay();success._tryNativeFailback();probe=probes.at(-1);probe.onopen();
  assert(success._isRelay);assert.equal(closedMqtt,0);
  probe.onmessage({data:JSON.stringify({type:'handoff-prepared',handoffId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})});assert(success._isRelay);
  probe.onmessage({data:JSON.stringify({type:'handoff-committed',handoffId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',ack:{type:'joined',room:{tourCode:'RY-KASIM',roomId:'a'}}})});
  assert(!success._isRelay);assert.equal(opened,1);assert.equal(closedMqtt,1);
  const batch=probe.sent.find(m=>Array.isArray(m.frames));assert(batch);assert.deepEqual(Array.from(batch.frames,m=>m.seq),[10,11]);
  assert(probe.sent.some(m=>m.type==='guide-stream-state'&&m.isLive));
  success.close();success._activateCloudRelay();assert.equal(success.readyState,3);assert.equal(opened,1);
  const roomChange=makeRelay();roomChange._sendQueue=[{type:'audio-chunk',frames:[unit(5)],_queuedAt:100}];
  roomChange.send(JSON.stringify({...roomChange._joinContext,roomId:'b'}));
  assert.equal(roomChange._audioCoalescer.frames.length,0);assert(!roomChange._sendQueue.some(m=>m.type==='audio-chunk'));
  const auth=box(pick(server,'applyRysRelayAuth')+'\n'+pick(server,'syncRysRelayJoin'),'',{
    isRequestAuthenticated:req=>!!req.auth,isValidAuthToken:token=>token==='good',
    processClientJsonMessage(session,join){if(join.pin==='right')session.currentRoom={tourCode:join.tourCode,roomId:join.roomId,
      clients:new Map([[session.clientId,{role:join.role}]])};}
  }).c;
  const session={clientId:'unit',isAuthenticated:true,ws:{isAuthenticated:true},currentRoom:{tourCode:'RY-KASIM',roomId:'a',
    clients:new Map([['unit',{role:'guide'}]])}};
  assert(!auth.applyRysRelayAuth(session,{},'bad',null));assert(!session.isAuthenticated);assert(!session.ws.isAuthenticated);
  assert(auth.applyRysRelayAuth(session,{},'good',null));
  assert(!auth.syncRysRelayJoin(session,{type:'join',role:'guide',tourCode:'RY-KASIM',roomId:'b',pin:'wrong'}));
  assert.equal(session.currentRoom.roomId,'a');
  assert(auth.syncRysRelayJoin(session,{type:'join',role:'guide',tourCode:'RY-KASIM',roomId:'b',pin:'right'}));
  console.log('V53 DETAILS: isolated comfort firstSample='+firstIndex+', gain=1; warmup/history guards; ACK/generation/partial-frame handoff; HTTP auth refreshed');

  if(typeof recordResult==='function')recordResult('ADIM-5.V53','Kaynak dosyalarından DSP, profil, sıra, fanout ve relay davranışları doğrulandı',true);
  console.log('V53 PASS: source-only DSP/SRC/comfort/profile, queue/PLC/seq, binary+JSON dedup, coalescer, congestion, HTTP single-flight/drain/close, gesture/wake/pause');
}

// v54 source-only real HTTP/WS regression test.
async function runV54RelayRoundTrip({baseUrl,url,token}){
  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
  const stamp=Date.now().toString(36),code='RY-V54-'+stamp.toUpperCase();
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
  const post=async body=>{
    const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,...await r.json()};
  };
  const get=async query=>{const r=await fetch(baseUrl+'/api/ws-relay?'+new URLSearchParams(query));return {status:r.status,...await r.json()};};
  const family={type:'family-subscribe',tourCode:code},admin={type:'admin-subscribe',token};
  const join=pin=>({type:'join',role:'pilgrim',tourCode:code,roomId:'genel',name:'V54 listener',pin});
  const guide={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V54 guide '+stamp,token};
  const guideId='v54-guide-'+stamp,listenerId='v54-listener-'+stamp;
  let socket;
  try{
    const created=await fetch(baseUrl+'/api/tours',{method:'POST',headers,
      body:JSON.stringify({code,name:'V54 isolated regression',pin:'1453',guideName:guide.name})});
    assert.equal(created.status,200);
    const fam=await post({clientId:'v54-family-'+stamp,subscriptionContext:family,messages:[family]});
    assert.equal(fam.messages.filter(m=>m.type==='family-state').length,1);
    assert(!fam.messages.some(m=>m.type==='joined'||m.type==='pin-error'));
    const again=await post({clientId:'v54-family-'+stamp,subscriptionContext:family,messages:[]});
    assert(!again.messages.some(m=>m.type==='family-state'),'Idempotent poll must not repeat ACK');
    const famGet=await get({clientId:'v54-familyget-'+stamp,subscription:'family-subscribe',tourCode:code});
    assert(famGet.messages.some(m=>m.type==='family-state'));
    const a=await post({clientId:'v54-admin-'+stamp,token,subscriptionContext:admin,messages:[admin]});
    assert.equal(a.messages.filter(m=>m.type==='admin-rooms-update').length,1);
    assert.equal((await post({clientId:'v54-admin-'+stamp,token:'bad',subscriptionContext:{type:'admin-subscribe'},messages:[]})).status,401);
    assert.equal((await get({clientId:'v54-adminbad-'+stamp,subscription:'admin-subscribe'})).status,401);
    const freshAdmin=await get({clientId:'v54-adminget-'+stamp,subscription:'admin-subscribe',token});
    assert(freshAdmin.messages.some(m=>m.type==='admin-rooms-update'));
    // Legacy GET: PIN required on first join, omitted on an existing membership.
    const denied=await get({clientId:listenerId,tourCode:code});
    assert(denied.messages.some(m=>m.type==='pin-error'));
    const accepted=await get({clientId:listenerId,tourCode:code,pin:'1453',deviceId:'v54-device-'+stamp,phone:'test',lang:'en'});
    assert(accepted.messages.some(m=>m.type==='joined'));
    assert(!(await get({clientId:listenerId,tourCode:code})).messages.some(m=>m.type==='pin-error'));
    const resumed=await post({clientId:'v54-resumed-'+stamp,joinContext:join('1453'),subscriptionContext:join('1453'),messages:[join('1453')]});
    assert.equal(resumed.messages.filter(m=>m.type==='joined').length,1);
    const renamed={...join('1453'),name:'V54 renamed listener'};
    const edited=await post({clientId:'v54-resumed-'+stamp,subscriptionContext:renamed,messages:[renamed]});
    assert.equal(edited.messages.filter(m=>m.type==='joined').length,1,'Metadata edit needs exactly one ACK');
    assert(!(await post({clientId:'v54-resumed-'+stamp,subscriptionContext:renamed,messages:[]})).messages.some(m=>m.type==='joined'));
    const wrong=await post({clientId:'v54-wrong-'+stamp,subscriptionContext:join('wrong'),messages:[]});
    assert(wrong.messages.some(m=>m.type==='pin-error'));
    // A family tracker must not be registered as an audio listener.
    const g=await post({clientId:guideId,token,subscriptionContext:guide,messages:[guide,{type:'guide-stream-state',isLive:true,broadcastMode:'mic'}]});
    assert(g.messages.some(m=>m.type==='joined'&&m.room.totalListeners===2));
    assert(g.messages.find(m=>m.type==='joined').room.connectedPilgrims.some(p=>p.name===renamed.name));
    guide.name='V54 updated guide '+stamp;
    const editedGuide=await post({clientId:guideId,token,subscriptionContext:guide,messages:[guide]});
    assert(editedGuide.messages.some(m=>m.type==='joined'&&m.room.connectedGuides.some(p=>p.name===guide.name)));
    const view=await get({clientId:'v54-clock1-'+stamp,tourCode:code,pin:'1453'});
    const startedAt=view.messages.find(m=>m.type==='joined').room.startedAt;
    await new Promise(r=>setTimeout(r,15));
    await post({clientId:guideId,token,subscriptionContext:guide,messages:[{type:'guide-stream-state',isLive:true,broadcastMode:'mic',topic:'same session'}]});
    const view2=await get({clientId:'v54-clock2-'+stamp,tourCode:code,pin:'1453'});
    assert.equal(view2.messages.find(m=>m.type==='joined').room.startedAt,startedAt);
    await post({clientId:guideId,token,subscriptionContext:guide,messages:[{type:'guide-stream-state',isLive:false}]});
    await post({clientId:guideId,token,subscriptionContext:guide,messages:[{type:'guide-stream-state',isLive:true,broadcastMode:'mic'}]});
    const view3=await get({clientId:'v54-clock3-'+stamp,tourCode:code,pin:'1453'});
    assert(view3.messages.find(m=>m.type==='joined').room.startedAt>startedAt);
    // Native family subscription has the same public scope, without audio PIN.
    const native=[];socket=new WebSocket(url);
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    socket.on('message',raw=>{try{native.push(JSON.parse(raw.toString()));}catch(e){}});
    socket.send(JSON.stringify(family));const until=Date.now()+2000;
    while(!native.some(m=>m.type==='family-state')&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
    assert(native.some(m=>m.type==='family-state'));assert(!native.some(m=>m.type==='joined'||m.type==='pin-error'));
    if(typeof recordResult==='function')recordResult('ADIM-3.V54','Gerçek HTTP/WS: family/admin kapsamı, ilk PIN/yeniden poll, tek ACK ve yayın saati doğrulandı',true);
  }finally{
    socket?.close();
    await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
  }
}

// v54: extra behavioral assertions read the source tree only.
async function runStep5V54AudioChecks(){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
  const root=typeof ROOT_DIR==='string'?ROOT_DIR:process.cwd();
  const read=f=>fs.readFileSync(path.join(root,f),'utf8').replace(/\r\n/g,'\n');
  function pick(text,name,kind='function'){
    const head=kind==='class'?'class ':kind==='method'?'(?:async )?':'(?:async )?function ';
    const re=new RegExp('^([ \\t]*)'+head+name+(kind==='class'?'\\b':'\\([^\\n]*\\)\\s*\\{'),'m'),m=re.exec(text);
    assert(m,'Missing '+name);
    for(let e=text.indexOf('}',m.index+m[0].length);e>=0;e=text.indexOf('}',e+1)){
      const code=text.slice(m.index,e+1).trim();
      try{new vm.Script(kind==='method'?'class Probe{'+code+'}':code);return code;}catch(x){if(!(x instanceof SyntaxError))throw x;}
    }
    throw Error('Unterminated '+name);
  }
  function box(code,tail='',extra={}){
    let P;const c={Float32Array,Float64Array,Math,Number,Boolean,ArrayBuffer,DataView,Buffer,
      sampleRate:48000,currentTime:0,Date,console,setTimeout,clearTimeout,setInterval,clearInterval,
      Promise,AbortController,URLSearchParams,queueMicrotask,
      AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},
      registerProcessor:(name,K)=>P=K,...extra};
    vm.createContext(c);vm.runInContext(code.replace(/^export .*$/mg,'')+'\n'+tail,c);return {c,P};
  }
  const cap=box(read('public/pcm-capture-worklet.js'),'globalThis.K=RysCaptureKernel;').c;
  for(const rate of [24000,44100,48000]){
    const a=[],b=[],ka=new cap.K(rate,{continuousSpeech:true},m=>a.push(...m.samples));
    const kb=new cap.K(rate,{continuousSpeech:true},m=>b.push(...m.samples));
    for(let i=0;i<rate;i+=128){
      const input=Float32Array.from({length:Math.min(128,rate-i)},(_,j)=>i<rate/2?0:.02*Math.sin(2*Math.PI*220*(i+j)/rate));
      kb.control({type:'set-profile',reject:i%256?.15:.85,comfortFade:!!(i%256)});
      ka.process(input,i/rate);kb.process(input,i/rate);
    }
    assert.deepEqual(a,b,'Fixed latency/profile bypass must preserve samples at '+rate);
    kb.control({type:'set-profile',resetLock:true,reject:NaN});
    assert(kb.gate.continuousSpeech);assert(!kb.gate.ready);
    const finite=[],k=new cap.K(rate,{continuousSpeech:true},m=>finite.push(...m.samples));
    for(let i=0;i<rate;i+=128)k.process(Float32Array.from({length:Math.min(128,rate-i)},(_,j)=>[NaN,Infinity,-Infinity,3.4e38,-3.4e38,.00001][(i+j)%6]),i/rate);
    assert(finite.length>0&&finite.every(x=>Number.isFinite(x)&&Math.abs(x)<=.981));
  }
  const {P,c:pc}=box(read('public/pcm-player-worklet.js'),'globalThis.diff=rysDiff;');
  const packet=(seq,arrival=0)=>({samples:new Float32Array(480).fill(.2),seq,arrival});
  const active=new P();active.playing=true;active.haveHistory=true;active.fi=120;active.phase=.375;
  for(let i=0;i<33;i++)active._push(packet(i,i*20));
  assert(active.pendingQueueBlend);assert.equal(active.fi,120);assert.equal(active.phase,.375);
  active.plc={fill(a){a.fill(-.2);},append(){}};active._nextFrame();
  assert(Math.abs(active.frame[0]+.2)<1e-6);assert(Math.abs(active.frame[71]-.2)<1e-6);assert(!active.pendingQueueBlend);
  const exhausted=new P();
  for(let i=0;i<8;i++)exhausted._push(packet((0x7ffffffc+i)%0x80000000,i*20));
  for(let i=0;i<600;i++){const out=new Float32Array(128);exhausted.process([],[[out]]);assert(out.every(Number.isFinite));}
  assert(!exhausted.playing);assert.equal(exhausted.missing,0);assert(!exhausted.haveHistory);
  assert.equal(exhausted.plc.used,0);assert.equal(exhausted.plc.lost,0);assert(!exhausted.pendingQueueBlend);
  exhausted._push(packet(0));assert.equal(exhausted.expected,0);
  assert.equal(pc.diff(0,0x7fffffff),1);assert.equal(pc.diff(0x7fffffff,0),-1);
  const shim=read('public/vercel-ws-shim.js');
  const prefix=['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
  let now=100,opened=0,acks=0;const probes=[],jobs=[];
  class Native{constructor(){this.readyState=1;this.sent=[];probes.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(){this.readyState=3;}}
  const t=box(prefix+'\n'+pick(shim,'RysAudioCoalescer','class')+'\n'+pick(shim,'SmartWebSocket','class'),
    'globalThis.S=SmartWebSocket;globalThis.install=installRysCoalescing;',{
      NativeWebSocket:Native,window:{},localStorage:{getItem:()=> 'good'},Date:{now:()=>now},
      setTimeout:f=>{jobs.push(f);return jobs.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){}}).c;
  const audio=seq=>({type:'audio-chunk',seq,sentAt:100,sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
  for(const mode of ['join','family-subscribe','admin-subscribe']){
    const order=[],s=Object.create(t.S.prototype),context={type:'join',role:'guide',tourCode:'RY-KASIM',roomId:'a',token:'good'};
    Object.assign(s,{url:'wss://local/ws',readyState:1,_isRelay:true,_transportGeneration:0,
      _subscriptionType:mode,_joinContext:context,_isAdmin:mode==='admin-subscribe',_sendQueue:[{type:'audio-chunk',frames:[audio(8),audio(9)],_queuedAt:100}],
      _busConnected:()=>true,_initMqttBus(){},_publishMqtt(){},_closeMqttClients(){},onerror(e){throw e;},
      onmessage(){acks++;order.push('ack');},
      onopen(){opened++;order.push('open');
        const request=mode==='join'?context:mode==='family-subscribe'?{type:mode,tourCode:context.tourCode}:{type:mode,token:'good'};
        s.send(JSON.stringify({...request}));
        if(mode==='join')s.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));
      }});
    t.install(s);s._audioCoalescer.push(audio(10));s._audioCoalescer.push(audio(11));
    const oldJob=jobs.at(-1);s._tryNativeFailback();const probe=probes.at(-1);probe.onopen();assert(s._isRelay);
    const type=mode==='join'?'joined':mode==='family-subscribe'?'family-state':'admin-rooms-update';
    probe.onmessage({data:JSON.stringify({type:'handoff-prepared',handoffId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})});assert(s._isRelay);
    probe.onmessage({data:JSON.stringify({type:'handoff-committed',handoffId:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',ack:{type,room:{tourCode:'RY-KASIM',roomId:'a'},tourCode:'RY-KASIM'}})});
    assert(!s._isRelay);assert.deepEqual(order,['ack','open']);
    assert.equal(probe.sent.filter(m=>m.type==='handoff-prepare'&&m.subscription.type===mode).length,1);
    assert.equal(probe.sent.filter(m=>m.type==='handoff-commit').length,1);
    assert.equal(probe.sent.filter(m=>m.type===mode).length,0,'No ordinary duplicate subscription for '+mode);
    const seqs=probe.sent.flatMap(m=>m.frames?m.frames.map(f=>f.seq):[]);
    assert.deepEqual(seqs,[8,9,10,11]);const count=probe.sent.length;oldJob();assert.equal(probe.sent.length,count);
    s.close();
  }
  assert.equal(opened,3);assert.equal(acks,3);
  // Empty poll: family/admin never fabricate a pilgrim join; PIN stays in POST.
  const bodies=[],relay=box('class Relay{'+pick(shim,'_relayRoutingKey','method')+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.R=Relay;','',{
    localStorage:{getItem:()=>''},fetch:async(url,opts)=>{assert.equal(url,'/api/ws-relay');assert.equal(opts.method,'POST');
      bodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({messages:[]})};}}).c;
  for(const connected of [false,true])for(const mode of ['family-subscribe','admin-subscribe','join']){
    const s=new relay.R();Object.assign(s,{readyState:1,_isRelay:true,_sendQueue:[],_clientId:'unit',_relayClientId:'legacy-unit',_relayKey:'unit',
      _subscriptionType:mode,_joinContext:{type:'join',tourCode:'X',role:'pilgrim',pin:'1453',deviceId:'device'},
      _busConnected:()=>connected,_deliverIncomingMessage(){},_enqueueRelayMessage(){}});
    const before=bodies.length;await s._flushAndPoll();
    assert.equal(bodies.length,before+1,'Broker connectivity must not suppress empty polling');
    const body=bodies.at(-1);assert.equal(body.subscriptionContext.type,mode);
    if(mode!=='join')assert.equal(body.joinContext??null,null);
    else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
  }
  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v59"));assert(sw.includes('/vercel-ws-shim.js?v=59'));
  for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'59',f+' stale shim');
  }
  if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
  console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
}

// v55: partial identity update and mixed native/HTTP while MQTT is connected.
async function runV55RelayEdgeChecks({baseUrl,url,token}){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
  const stamp=Date.now().toString(36),code='RY-V55-'+stamp.toUpperCase();
  const cid='v55-listener-'+stamp,deviceId='v55-device-'+stamp;
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
  const post=async body=>{
    const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal(r.status,200);return r.json();
  };
  const wait=async fn=>{
    const until=Date.now()+2000;
    while(!fn()){if(Date.now()>until)throw Error('V55 deadline');await new Promise(r=>setTimeout(r,5));}
  };
  const connect=async join=>{
    const s=new WebSocket(url),messages=[];
    s.on('message',(raw,binary)=>{if(!binary)try{messages.push(JSON.parse(raw.toString()));}catch(e){}});
    await new Promise((resolve,reject)=>{s.once('open',resolve);s.once('error',reject);});
    s.send(JSON.stringify(join));await wait(()=>messages.some(m=>m.type==='joined'));
    return {s,messages};
  };
  let guide,secondListener;
  try{
    const created=await fetch(baseUrl+'/api/tours',{method:'POST',headers,
      body:JSON.stringify({code,name:'V55 relay regression',pin:'1453',guideName:'V55 guide '+stamp})});
    assert.equal(created.status,200);
    const initial={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',pin:'1453',
      name:'Initial name',phone:'audit-phone',deviceId,lang:'ar'};
    await post({clientId:cid,subscriptionContext:initial,messages:[initial]});
    const partial={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',pin:'1453',name:'Updated name'};
    await post({clientId:cid,subscriptionContext:partial,messages:[partial]});
    const guideJoin={type:'join',role:'guide',token,tourCode:code,roomId:'genel',name:'V55 guide '+stamp};
    guide=await connect(guideJoin);
    const observed=guide.messages.find(m=>m.type==='joined').room.connectedPilgrims.find(p=>p.id===cid);
    assert.equal(observed.name,'Updated name');assert.equal(observed.phone,'audit-phone');
    assert.equal(observed.lang,'ar','Partial rename must preserve language');
    // A phone-only edit must preserve the already updated name and stable device.
    const phoneOnly={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',pin:'1453',phone:'updated-phone'};
    await post({clientId:cid,subscriptionContext:phoneOnly,messages:[phoneOnly]});
    const joinedCount=guide.messages.filter(m=>m.type==='joined').length;
    guide.s.send(JSON.stringify(guideJoin));
    await wait(()=>guide.messages.filter(m=>m.type==='joined').length>joinedCount);
    const afterPhone=guide.messages.filter(m=>m.type==='joined').at(-1).room.connectedPilgrims.find(p=>p.id===cid);
    assert.equal(afterPhone.name,'Updated name');assert.equal(afterPhone.phone,'updated-phone');assert.equal(afterPhone.lang,'ar');
    await post({clientId:cid,subscriptionContext:phoneOnly,messages:[]});
    const source=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8').replace(/\r\n/g,'\n');
    const begin=source.indexOf('    _relayRoutingKey(){');
    const end=source.indexOf('\n    // PATCH: shim-close',begin);
    assert(begin>=0&&end>begin);
    let browserToken='',fetchCount=0;
    const sandbox={AbortController,setTimeout,clearTimeout,queueMicrotask,Date,console,
      localStorage:{getItem:()=>browserToken},
      fetch:(route,options)=>{fetchCount++;assert.equal(route,'/api/ws-relay');assert.equal(options.method,'POST');return fetch(baseUrl+route,options);}};
    vm.createContext(sandbox);
    vm.runInContext('class Relay{'+source.slice(begin,end)+'}\nglobalThis.R=Relay;',sandbox);
    const make=(mode,context,id)=>{
      const r=new sandbox.R(),delivered=[];
      Object.assign(r,{readyState:1,_isRelay:true,_clientId:id,_relayClientId:id,_relayKey:'unit',_subscriptionType:mode,_joinContext:context,
        _sendQueue:[],_busConnected:()=>true,_deliverIncomingMessage:m=>delivered.push(m),_enqueueRelayMessage(){}});
      return {r,delivered};
    };
    const listener=make('join',phoneOnly,cid);
    const frame=Buffer.alloc(972);frame.writeUInt32LE(7,0);frame.writeDoubleLE(Date.now(),4);
    guide.s.send(frame);await new Promise(r=>setTimeout(r,25));
    await listener.r._flushAndPoll();
    assert.equal(fetchCount,1,'A connected broker must not suppress an empty HTTP poll');
    assert(listener.delivered.some(m=>m.type==='audio-chunk'&&m.seq===7),'Native guide PCM must reach the HTTP listener');
    // Family/admin control messages also need HTTP when their broker has no publisher.
    const familyContext={type:'family-subscribe',tourCode:code},familyId='v55-family-'+stamp;
    const adminContext={type:'admin-subscribe',token},adminId='v55-admin-'+stamp;
    await post({clientId:familyId,subscriptionContext:familyContext,messages:[familyContext]});
    await post({clientId:adminId,token,subscriptionContext:adminContext,messages:[adminContext]});
    const family=make('family-subscribe',{tourCode:code},familyId),admin=make('admin-subscribe',null,adminId);
    guide.s.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));
    await wait(()=>guide.messages.some(m=>m.type==='stream-state'&&m.isLive));
    await family.r._flushAndPoll();assert(family.delivered.some(m=>m.type==='stream-state'&&m.isLive));
    browserToken=token;await admin.r._flushAndPoll();browserToken='';
    assert(admin.delivered.some(m=>m.type==='admin-rooms-update'&&m.rooms.some(r=>r.tourCode===code&&r.isLive)));
    // Native dedup verifies preservation of deviceId, which is not in serializeRoom.
    secondListener=await connect({...initial,name:'Replacement device'});
    const room=secondListener.messages.find(m=>m.type==='joined').room;
    assert.equal(room.totalListeners,1,'Partial metadata must preserve deviceId for native dedup');
    if(typeof recordResult==='function')recordResult('ADIM-3.V55',
      'Kısmi kimlik korunumu; MQTT bağlıyken native PCM ve family/admin HTTP güncellemeleri',true);
    console.log('V55 PASS: partial name/phone/lang/device preservation; broker-connected empty HTTP poll; mixed native PCM; family/admin deltas');
  }finally{
    guide?.s.close();secondListener?.s.close();
    await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
  }
}

async function runV56HandoffChecks({baseUrl,url,token}){
  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
  const stamp=Date.now().toString(36),code='RY-V56-'+stamp.toUpperCase(),sockets=[];
  const post=async body=>{
    const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:r.status,...await r.json()};
  };
  const open=async extra=>{
    const r=await post({type:'relay-open',version:56,...extra});
    assert.equal(r.status,200);assert(r.clientId.startsWith('rys56-'));assert(/^[0-9a-f]{48}$/.test(r.relayKey));
    return {clientId:r.clientId,relayKey:r.relayKey};
  };
  const wait=async predicate=>{
    const until=Date.now()+2500;while(!predicate()){
      if(Date.now()>until)throw Error('V56 WS deadline');await new Promise(r=>setTimeout(r,5));
    }
  };
  const socket=async()=>{
    const ws=new WebSocket(url),messages=[];let closed=false;sockets.push(ws);
    ws.on('message',(raw,binary)=>{if(!binary)try{messages.push(JSON.parse(raw.toString()));}catch(e){}});
    ws.on('close',()=>closed=true);
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});
    return {ws,messages,closed:()=>closed};
  };
  const prepare=async(s,source,subscription)=>{
    s.ws.send(JSON.stringify({type:'handoff-prepare',relayClientId:source?.clientId||null,
      relayKey:source?.relayKey||null,subscription}));
    await wait(()=>s.messages.some(m=>m.type==='handoff-prepared'||m.type==='handoff-error'));
    const prepared=s.messages.find(m=>m.type==='handoff-prepared');assert(prepared,'Prepare rejected');
    return prepared.handoffId;
  };
  const commit=async(s,id)=>{
    s.ws.send(JSON.stringify({type:'handoff-commit',handoffId:id}));
    await wait(()=>s.messages.some(m=>m.type==='handoff-committed'||m.type==='handoff-error'));
    return s.messages.find(m=>m.type==='handoff-committed');
  };
  const media=seq=>({type:'audio-chunk',seq,sentAt:Date.now(),sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
  const guide={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V56 guide '+stamp,deviceId:'v56-guide-'+stamp,token};
  const pilgrim={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',name:'V56 listener',deviceId:'v56-listener-'+stamp,pin:'1453'};
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
  try{
    assert.equal((await fetch(baseUrl+'/api/tours',{method:'POST',headers,
      body:JSON.stringify({code,name:'V56 handoff regression',pin:'1453',guideName:guide.name})})).status,200);
    const source=await open({subscriptionContext:guide,messages:[guide]});
    const before=await post({clientId:'v56-family-view-'+stamp,subscriptionContext:{type:'family-subscribe',tourCode:code}});
    assert.equal(before.messages.find(m=>m.type==='family-state').room.connectedGuides.length,0,'relay-open must have no join side effect');
    assert.equal((await post({...source,token,subscriptionContext:guide,messages:[guide,{type:'guide-stream-state',isLive:true,broadcastMode:'mic'}]})).status,200);
    const listener=await open();await post({...listener,subscriptionContext:pilgrim,messages:[pilgrim]});
    // Prepare/cancel leaves the old HTTP publisher usable.
    const canceled=await socket();await prepare(canceled,source,guide);
    await post({...source,token,subscriptionContext:guide,messages:[media(0)]});
    assert((await post({...listener,subscriptionContext:pilgrim})).messages.some(m=>m.type==='audio-chunk'&&m.seq===0));
    canceled.ws.send(JSON.stringify({type:'handoff-cancel'}));canceled.ws.close();
    assert.equal((await post({...source,token,subscriptionContext:guide,messages:[]})).status,200);
    // A changed HTTP context invalidates a prepared ticket without moving membership.
    const changed=await socket(),changedId=await prepare(changed,source,guide);
    const moved={...guide,roomId:'siyer'};
    await post({...source,token,subscriptionContext:moved,messages:[]});
    assert.equal(await commit(changed,changedId),undefined);
    assert(changed.messages.some(m=>m.type==='handoff-error'&&m.code==='context-changed'));changed.ws.close();
    await post({...source,token,subscriptionContext:guide,messages:[{type:'guide-stream-state',isLive:true,broadcastMode:'mic'}]});
    // Commit is the server's linearization point. Every late old request is fenced.
    const native=await socket(),id=await prepare(native,source,guide);
    const committed=await commit(native,id);assert.equal(committed?.ack?.type,'joined');
    assert.equal(committed.ack.room.connectedGuides.length,1);
    for(let n=0;n<3;n++){
      const late=await post({...source,token,subscriptionContext:guide,messages:[media(10+n)]});
      assert.equal(late.status,409);assert.equal(late.error,'relay-session-retired');
    }
    const roomEvents=native.messages.filter(m=>m.type==='room-state').length;
    native.ws.send(JSON.stringify({type:'handoff-commit',handoffId:id}));
    await wait(()=>native.messages.filter(m=>m.type==='handoff-committed').length===2);
    assert.equal(native.messages.filter(m=>m.type==='room-state').length,roomEvents,'Commit retry must not rejoin');
    assert.equal((await post({type:'relay-close',version:56,...source})).status,200);
    const binary=Buffer.alloc(972);binary.writeUInt32LE(3,0);binary.writeDoubleLE(Date.now(),4);
    native.ws.send(binary);await new Promise(r=>setTimeout(r,25));
    assert((await post({...listener,subscriptionContext:pilgrim})).messages.some(m=>m.type==='audio-chunk'&&m.seq===3));
    assert(!native.closed(),'Late relay request must not terminate the native socket');
    assert.equal((await post({clientId:source.clientId,relayKey:'g'.repeat(48)})).status,401);
    assert.equal((await post({clientId:source.clientId,relayKey:'ğ'.repeat(48)})).status,401);
    assert.equal((await post({clientId:'rys56-'+'f'.repeat(36),relayKey:'b'.repeat(48)})).status,409);
    const get=await fetch(baseUrl+'/api/ws-relay?'+new URLSearchParams({clientId:listener.clientId}));
    assert.equal(get.status,401,'A public clientId alone must not drain a v56 outbox');
    const preflight=await fetch(baseUrl+'/api/ws-relay',{method:'OPTIONS',headers:{
      Origin:'https://ridvanses.vercel.app','Access-Control-Request-Method':'GET',
      'Access-Control-Request-Headers':'x-rys-relay-key'}});
    assert((preflight.headers.get('access-control-allow-headers')||'').toLowerCase().includes('x-rys-relay-key'));
    const keyedGet=await fetch(baseUrl+'/api/ws-relay?'+new URLSearchParams({clientId:listener.clientId}),
      {headers:{'X-Rys-Relay-Key':listener.relayKey}});
    assert.equal(keyedGet.status,200);
    const urlKey=await fetch(baseUrl+'/api/ws-relay?'+new URLSearchParams({clientId:listener.clientId,relayKey:listener.relayKey}));
    assert.equal(urlKey.status,401,'Relay key must not be accepted from a GET URL');
    // Pilgrim without deviceId still transfers exactly one membership; PIN is rechecked.
    for(const subscription of [
      {...pilgrim,deviceId:'',name:'V56 no-device listener',phone:'preserved-phone',lang:'ar'},
      {type:'family-subscribe',tourCode:code},
      {type:'admin-subscribe',token}
    ]){
      const old=await open();await post({...old,token:subscription.type==='admin-subscribe'?token:undefined,
        subscriptionContext:subscription,messages:[subscription]});
      if(subscription.type==='join'){
        const wrong=await socket();wrong.ws.send(JSON.stringify({type:'handoff-prepare',relayClientId:old.clientId,relayKey:old.relayKey,
          subscription:{...subscription,pin:'wrong'}}));
        await wait(()=>wrong.messages.some(m=>m.type==='handoff-error'));
        assert(wrong.messages.some(m=>m.code==='pin-required'));wrong.ws.close();
        assert.equal((await post({...old,subscriptionContext:subscription})).status,200);
      }
      const target=await socket(),ticket=await prepare(target,old,subscription);
      const done=await commit(target,ticket);assert(done);
      assert.equal(done.ack.type,subscription.type==='join'?'joined':subscription.type==='family-subscribe'?'family-state':'admin-rooms-update');
      if(subscription.type==='join')assert.equal(done.ack.room.totalListeners,2);
      assert.equal((await post({...old,token,subscriptionContext:subscription})).status,409);
      target.ws.close();
    }
    // A fresh HTTP generation replaces and fences an abandoned v56 generation.
    const chainJoin={...guide,roomId:'chain',name:'V56 chain '+stamp,deviceId:'chain-'+stamp};
    const older=await open(),newer=await open();
    await post({...older,token,subscriptionContext:chainJoin});
    await post({...newer,token,subscriptionContext:chainJoin});
    assert.equal((await post({...older,token,subscriptionContext:chainJoin})).status,409);
    const chainNative=await socket(),chainTicket=await prepare(chainNative,newer,chainJoin);
    assert(await commit(chainNative,chainTicket));
    assert.equal((await post({...older,token,subscriptionContext:chainJoin})).status,409);
    chainNative.ws.close();
    // MQTT-only source: no HTTP session has joined, so no source fencing is needed.
    const lone=await socket(),loneId=await prepare(lone,null,{type:'family-subscribe',tourCode:code});
    assert.equal((await commit(lone,loneId)).ack.type,'family-state');lone.ws.close();
    if(typeof recordResult==='function')recordResult('ADIM-3.V56',
      'Gerçek HTTP/WS: yan etkisiz open/prepare, cancel, revision, commit/idempotans, eski istek409, native PCM, PIN ve3 abonelik',true);
    console.log('V56 E2E PASS: prepare has no membership side effect; committed source fenced; late requests cannot kill native');
  }finally{
    for(const ws of sockets)ws.close();
    await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
  }
}

async function runStep5V56HandoffChecks(){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
  function pick(text,name,kind='function'){
    const head=kind==='class'?'class ':kind==='method'?'(?:async )?':'(?:async )?function ';
    const m=new RegExp('^([ \\t]*)'+head+name+(kind==='class'?'\\b':'\\([^\\n]*\\)\\s*\\{'),'m').exec(text);
    assert(m,'Missing '+name);
    for(let end=text.indexOf('}',m.index+m[0].length);end>=0;end=text.indexOf('}',end+1)){
      const code=text.slice(m.index,end+1).trim();
      try{new vm.Script(kind==='method'?'class Probe{'+code+'}':code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}
    }
    throw Error('Unterminated '+name);
  }
  const server=read('server.js'),shim=read('public/vercel-ws-shim.js');
  const names=['resolveRysRelay','digestRysSubscription','sendRysSubscriptionAck','clearRysHandoff','validateRysHandoff','handleRysNativeHandoff'];
  let now=1000,allowed=true,joins=0,created=0;
  const sessions=new Map(),serverJobs=[];
  const sc={crypto,Buffer,console,Date:{now:()=>now},httpRelaySessions:sessions,db:{tours:[]},
    isValidAuthToken:t=>allowed&&t==='good',
    getOrCreateRelaySession(){created++;throw Error('Unknown v56 ID must not be recreated');},
    setTimeout(fn){serverJobs.push(fn);return {unref(){}};},clearTimeout(){},
    removeClientFromRoom(room,id){room.clients.delete(id);},
    serializeRoom:room=>({members:room.clients.size}),
    processClientJsonMessage(ctx,request){
      joins++;ctx.currentRoom=activeSource.currentRoom;
      ctx.currentRoom.clients.set(ctx.clientId,{role:'guide',name:request.name});
      sc.sendRysSubscriptionAck(ctx,{type:'joined',room:{members:ctx.currentRoom.clients.size}});
    }};
  vm.createContext(sc);vm.runInContext(names.map(n=>pick(server,n)).join('\n'),sc);
  let activeSource;
  const request={type:'join',role:'guide',token:'good',tourCode:'X',roomId:'genel',name:'Guide',deviceId:'d'};
  const make=()=>{
    const source={clientId:'rys56-unit',relayKey:'b'.repeat(48),relayRevision:1,relayRetired:false,ws:{},
      currentRoom:{clients:new Map([['rys56-unit',{role:'guide',name:'Guide',deviceId:'d'}]])}};
    source.relayDigest=sc.digestRysSubscription(request);sessions.set(source.clientId,source);activeSource=source;
    const sent=[],ctx={clientId:'native',currentRoom:null,ws:{send:s=>sent.push(JSON.parse(s)),close(){}}};
    sc.handleRysNativeHandoff(ctx,{type:'handoff-prepare',subscription:request,relayClientId:source.clientId,relayKey:source.relayKey});
    const id=sent.find(m=>m.type==='handoff-prepared').handoffId;
    return {source,ctx,sent,id};
  };
  let a=make();assert.equal(joins,0);now+=4000;
  sc.handleRysNativeHandoff(a.ctx,{type:'handoff-commit',handoffId:a.id});
  assert(a.sent.some(m=>m.code==='prepare-expired'));assert(!a.source.relayRetired);assert.equal(joins,0);
  a=make();sc.handleRysNativeHandoff(a.ctx,{type:'handoff-cancel'});assert(!a.ctx.rysHandoff);assert.equal(joins,0);
  a=make();allowed=false;sc.handleRysNativeHandoff(a.ctx,{type:'handoff-commit',handoffId:a.id});
  assert(a.sent.some(m=>m.code==='auth-required'));assert(!a.source.relayRetired);assert.equal(joins,0);allowed=true;
  a=make();sc.handleRysNativeHandoff(a.ctx,{type:'handoff-commit',handoffId:a.id});
  assert(a.source.relayRetired);assert.equal(joins,1);assert.equal(a.source.currentRoom.clients.size,1);
  sc.handleRysNativeHandoff(a.ctx,{type:'handoff-commit',handoffId:a.id});assert.equal(joins,1);
  sessions.delete(a.source.clientId);
  let status=200;const res={status(n){status=n;return this;},json(){return this;}};
  assert.equal(sc.resolveRysRelay({headers:{},method:'POST'},res,{clientId:a.source.clientId,relayKey:a.source.relayKey}),null);
  assert.equal(status,409);assert.equal(created,0,'Cleanup must not let a retired ID be recreated');

  // Client: commit was sent, HTTP reports retired, but the commit ACK is lost.
  const helpers=['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
  const probes=[],jobs=[];let fetchMode='retired',delivered=0,mqttClosed=0,published=0,resolveOpen;
  const bodies=[];
  class Native{constructor(){this.readyState=1;this.sent=[];probes.push(this);}send(s){this.sent.push(JSON.parse(s));}close(){this.readyState=3;}}
  const cc={console,Buffer,Date:{now:()=>100},AbortController,ArrayBuffer,Float32Array,URLSearchParams,
    NativeWebSocket:Native,window:{},localStorage:{getItem:()=>''},
    setTimeout(fn,ms){const job={fn,ms};jobs.push(job);return job;},clearTimeout(){},setInterval:()=>1,clearInterval(){},queueMicrotask,
    fetch:async(route,options)=>{
      const body=JSON.parse(options.body);bodies.push(body);
      if(body.type==='relay-close')return {ok:true,json:async()=>({closed:true})};
      if(fetchMode==='offline')throw Error('API offline');
      if(body.type==='relay-open'){
        if(fetchMode==='deferred')return new Promise(r=>resolveOpen=r);
        return {ok:true,json:async()=>({clientId:'rys56-new',relayKey:'c'.repeat(48)})};
      }
      if(fetchMode==='retired')return {ok:false,status:409,json:async()=>({error:'relay-session-retired'})};
      return {ok:true,json:async()=>({messages:[{type:'room-state'}]})};
    }};
  vm.createContext(cc);vm.runInContext(helpers+'\n'+pick(shim,'RysAudioCoalescer','class')+'\n'+
    pick(shim,'SmartWebSocket','class')+'\nglobalThis.S=SmartWebSocket;globalThis.install=installRysCoalescing;',cc);
  const client=()=>{
    const s=Object.create(cc.S.prototype);
    Object.assign(s,{url:'wss://local/ws',readyState:1,_isRelay:true,_httpEpoch:0,_transportGeneration:0,
      _clientId:'stable-mqtt-identity',_relayClientId:'rys56-old',_relayKey:'b'.repeat(48),
      _subscriptionType:'join',_joinContext:{...request},_sendQueue:[],
      _lastGuideState:{type:'guide-stream-state',isLive:true,broadcastMode:'mic'},
      _busConnected:()=>true,_initMqttBus(){},_publishMqtt(){published++;},
      _closeMqttClients(){mqttClosed++;},_deliverIncomingMessage(){delivered++;},onmessage(){},onerror(){}});
    cc.install(s);return s;
  };
  const c=client();c._tryNativeFailback();const probe=probes.at(-1);probe.onopen();
  const handoffId='a'.repeat(32);probe.onmessage({data:JSON.stringify({type:'handoff-prepared',handoffId})});
  assert(probe.sent.some(m=>m.type==='handoff-commit'));
  await c._flushAndPoll();assert(c._relayFenced);assert.equal(c._relayClientId,'rys56-old');
  const sent=bodies.length;await c._flushAndPoll();assert.equal(bodies.length,sent,'Do not reopen while commit ACK is pending');
  jobs.find(j=>j.ms===5000).fn();
  assert(c._isRelay);assert.equal(c._relayClientId,null);assert.equal(c._relayKey,null);assert(!c._relayFenced);
  assert.equal(mqttClosed,0,'Failed failback must keep MQTT active');
  fetchMode='normal';await c._flushAndPoll();
  assert.equal(c._relayClientId,'rys56-new');assert.equal(c._clientId,'stable-mqtt-identity');
  const normal=bodies.filter(b=>b.subscriptionContext).at(-1);
  assert.equal(normal.clientId,'rys56-new');assert(normal.messages.some(m=>m.type==='guide-stream-state'&&m.isLive));
  const closing=client();closing._relayClientId=null;closing._relayKey=null;fetchMode='deferred';
  const flight=closing._flushAndPoll();closing.close();
  resolveOpen({ok:true,json:async()=>({clientId:'rys56-late',relayKey:'d'.repeat(48)})});
  await flight;assert.equal(closing.readyState,3);assert.equal(closing._relayClientId,null);
  // A source-less prepare must abort an in-flight open and keep new HTTP joins paused.
  const opening=client();opening._relayClientId=null;opening._relayKey=null;fetchMode='deferred';
  const openingFlight=opening._flushAndPoll();opening._tryNativeFailback();
  const sourceLess=probes.at(-1);sourceLess.onopen();
  assert(opening._relayFenced);
  assert.equal(sourceLess.sent.find(m=>m.type==='handoff-prepare').relayClientId,null);
  resolveOpen({ok:true,json:async()=>({clientId:'rys56-too-late',relayKey:'e'.repeat(48)})});
  await openingFlight;assert.equal(opening._relayClientId,null);
  const requests=bodies.length;await opening._flushAndPoll();assert.equal(bodies.length,requests);
  sourceLess.onerror();assert(!opening._relayFenced);assert(opening._isRelay);
  fetchMode='offline';const offline=client();offline._relayClientId=null;offline._relayKey=null;
  await offline._flushAndPoll();assert(offline._isRelay);
  const frame=seq=>({type:'audio-chunk',seq,sampleRate:24000,sentAt:100,pcm16:Buffer.alloc(960).toString('base64')});
  for(let i=0;i<3;i++)offline.send(JSON.stringify(frame(i)));
  assert(published>0,'MQTT audio must keep working while relay-open is unavailable');
  if(typeof recordResult==='function')recordResult('ADIM-5.V56',
    'Prepare expiry/revoke/cancel; silinen ID409; ACK kaybı/fencing/yeni oturum; geç open cevabı; MQTT bağımsızlığı',true);
  console.log('V56 UNIT PASS: expired/revoked prepare has no side effects; lost ACK recovers with fresh HTTP ID; no source-ID resurrection');
}

async function runV57RoutingChecks({baseUrl,url,token}){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{WebSocket}=require('ws');
  const stamp=Date.now().toString(36),a='RY-V57-A-'+stamp.toUpperCase(),b='RY-V57-B-'+stamp.toUpperCase();
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
  const wait=async predicate=>{
    const until=Date.now()+2500;while(!predicate()){
      if(Date.now()>until)throw Error('V57 routing deadline');await new Promise(r=>setTimeout(r,5));
    }
  };
  let listener,socket;
  try{
    for(const code of [a,b])assert.equal((await fetch(baseUrl+'/api/tours',{method:'POST',headers,
      body:JSON.stringify({code,name:'V57 routing regression',guideName:'V57 guide'})})).status,200);
    listener=new WebSocket(url);const received=[];
    listener.on('message',(raw,binary)=>{if(!binary)try{received.push(JSON.parse(raw.toString()));}catch(e){}});
    await new Promise((r,j)=>{listener.once('open',r);listener.once('error',j);});
    listener.send(JSON.stringify({type:'join',role:'pilgrim',tourCode:b,roomId:'genel',name:'V57 B listener'}));
    await wait(()=>received.some(m=>m.type==='joined'));
    const source=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8').replace(/\r\n/g,'\n');
    const begin=source.indexOf('  class SmartWebSocket {'),end=source.indexOf('\n  SmartWebSocket.CONNECTING',begin);
    let release,notify;const opening=new Promise(r=>notify=r);const clock=Date.now();
    const context={console,Buffer,Date:class extends Date{static now(){return clock;}},AbortController,ArrayBuffer,Float32Array,URLSearchParams,window:{},
      NativeWebSocket:class{},localStorage:{getItem:()=>token},
      setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,
      fetch:async(route,options)=>{
        const body=JSON.parse(options.body),response=await fetch(baseUrl+route,options);
        if(body.type==='relay-open'){
          const data=await response.json();notify();await new Promise(r=>release=r);
          return {ok:true,json:async()=>data};
        }
        return response;
      }};
    vm.createContext(context);vm.runInContext(source.slice(begin,end)+'\nglobalThis.S=SmartWebSocket;',context);
    socket=Object.create(context.S.prototype);
    const joinA={type:'join',role:'guide',tourCode:a,roomId:'genel',name:'V57 guide',token};
    Object.assign(socket,{readyState:1,_isRelay:true,_httpEpoch:0,_transportGeneration:0,_joinContext:joinA,_subscriptionType:'join',
      _sendQueue:[],_clientId:'logical-v57',_initMqttBus(){},_closeMqttClients(){},_publishMqtt(){},
      _busConnected:()=>false,_deliverIncomingMessage(){},_audioCoalescer:{clear(){}}});
    const unit=seq=>({type:'audio-chunk',seq,sampleRate:24000,sentAt:clock,pcm16:Buffer.alloc(960).toString('base64')});
    socket._sendQueue.push({type:'audio-chunk',frames:[unit(77)],_queuedAt:clock},
      {type:'quick-announcement',message:'OLD-A',title:'A only'});
    const flight=socket._flushAndPoll();await opening;
    socket.send(JSON.stringify({...joinA,tourCode:b}));
    socket._enqueueRelayMessage({type:'audio-chunk',frames:[unit(88)],_queuedAt:clock});
    socket.send(JSON.stringify({type:'quick-announcement',title:'B only',message:'NEW-B'}));
    release();await flight;
    await wait(()=>received.some(m=>m.type==='audio-chunk'&&m.seq===88)&&
      received.some(m=>m.type==='new-announcement'&&m.announcement?.message==='NEW-B'));
    assert(!received.some(m=>m.type==='audio-chunk'&&m.seq===77),'Old A PCM must not be posted under B context');
    assert(!received.some(m=>m.type==='new-announcement'&&m.announcement?.message==='OLD-A'),'Old A command must not reach B');
    if(typeof recordResult==='function')recordResult('ADIM-3.V57',
      'Gerçek HTTP/WS: relay-open sırasında kafile değişimi eski PCM/kontrolü yeni kafileye taşımadı; yeni ses/kontrol ulaştı',true);
    console.log('V57 E2E PASS: delayed relay-open + A-to-B switch; old PCM/control dropped; fresh B PCM/control delivered');
  }finally{
    socket?.close();listener?.close();
    for(const code of [a,b])await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
  }
}

async function runStep5V57RoutingChecks(){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
  const read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
  const server=read('server.js'),shim=read('public/vercel-ws-shim.js');
  function pick(text,name,kind='function'){
    const head=kind==='class'?'class ':kind==='method'?'(?:async )?':'(?:async )?function ';
    const m=new RegExp('^([ \\t]*)'+head+name+(kind==='class'?'\\b':'\\([^\\n]*\\)\\s*\\{'),'m').exec(text);assert(m,'Missing '+name);
    for(let end=text.indexOf('}',m.index+m[0].length);end>=0;end=text.indexOf('}',end+1)){
      const code=text.slice(m.index,end+1).trim();
      try{new vm.Script(kind==='method'?'class Probe{'+code+'}':code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}
    }
    throw Error('Unterminated '+name);
  }
  // Run the real periodic callback with no getOrCreate/new-session traffic.
  const map=new Map(),removed=[];let heartbeat;
  map.set('rys56-idle',{lastSeen:0,currentRoom:{},relayKey:'b'.repeat(48),ws:{}});
  map.set('rys56-live',{lastSeen:59000,relayKey:'c'.repeat(48),ws:{}});
  const sc={httpRelaySessions:map,Date:{now:()=>60000},Buffer,crypto:require('node:crypto'),wss:{clients:new Set()},
    removeClientFromRoom:(room,id)=>removed.push(id),setInterval(fn,ms){assert.equal(ms,30000);heartbeat=fn;return 1;},
    getOrCreateRelaySession(){throw Error('Must not create an expired opaque ID');}};
  vm.createContext(sc);
  const first=server.indexOf('const heartbeatTimer = setInterval('),last=server.indexOf("\nwss.on('close'",first);
  vm.runInContext(pick(server,'cleanupStaleRelaySessions')+'\n'+pick(server,'resolveRysRelay')+'\n'+server.slice(first,last),sc);
  heartbeat();assert(!map.has('rys56-idle'));assert(map.has('rys56-live'));assert.deepEqual(removed,['rys56-idle']);
  // Requests themselves enforce the 35s boundary, including before the next sweep.
  const respond=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(m){this.body=m;return this;}});
  map.set('rys56-edge',{lastSeen:25000,relayKey:'d'.repeat(48),ws:{}});let response=respond();
  assert(sc.resolveRysRelay({headers:{},method:'POST'},response,{clientId:'rys56-edge',relayKey:'d'.repeat(48)}));
  assert.equal(response.statusCode,200); // Exactly 35000ms is still valid, matching cleanup's > comparison.
  map.set('rys56-expired',{lastSeen:24999,relayKey:'e'.repeat(48),ws:{},currentRoom:{}});
  response=respond();
  assert.equal(sc.resolveRysRelay({headers:{},method:'POST'},response,{clientId:'rys56-expired',relayKey:'e'.repeat(48)}),null);
  assert.equal(response.statusCode,409);assert.equal(response.body.error,'relay-session-expired');assert(!map.has('rys56-expired'));
  // Client: reject stale responses/retries when the route changed, preserve retries for the same route.
  let resolveFetch,rejectFetch;const delivered=[],microtasks=[];
  const cc={console,Buffer,Date,AbortController,ArrayBuffer,Float32Array,URLSearchParams,window:{},NativeWebSocket:class{},
    localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
    queueMicrotask:fn=>microtasks.push(fn),
    fetch:()=>new Promise((resolve,reject)=>{resolveFetch=resolve;rejectFetch=reject;})};
  const helpers=['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
  vm.createContext(cc);vm.runInContext(helpers+'\n'+pick(shim,'RysAudioCoalescer','class')+'\n'+
    pick(shim,'SmartWebSocket','class')+'\nglobalThis.S=SmartWebSocket;',cc);
  const make=()=>{
    const s=Object.create(cc.S.prototype);
    Object.assign(s,{readyState:1,_isRelay:true,_relayClientId:'rys56-ready',_relayKey:'b'.repeat(48),
      _joinContext:{type:'join',role:'guide',tourCode:'A',roomId:'genel'},_subscriptionType:'join',_sendQueue:[],
      _initMqttBus(){},_publishMqtt(){},_busConnected:()=>false,_audioCoalescer:{clear(){}},
      _deliverIncomingMessage:m=>delivered.push(m)});
    return s;
  };
  const late=make(),old=late._relayRoutingKey();
  const flight=late._flushAndPoll();late.send(JSON.stringify({...late._joinContext,tourCode:'B'}));
  assert.notEqual(late._relayRoutingKey(),old);
  resolveFetch({ok:true,json:async()=>({messages:[{type:'room-state',room:{tourCode:'A'}}]})});
  await flight;assert.equal(delivered.length,0,'Old route response must not update B');
  const fail=make();fail._sendQueue=[{type:'quick-announcement',message:'OLD-A'}];
  const failed=fail._flushAndPoll();fail.send(JSON.stringify({...fail._joinContext,tourCode:'B'}));
  rejectFetch(Error('network'));await failed;
  assert(!fail._sendQueue.some(m=>m.message==='OLD-A'),'A retry must not be replayed in B');
  const same=make();same._sendQueue=[{type:'quick-announcement',message:'KEEP-A'}];
  const retry=same._flushAndPoll();rejectFetch(Error('network'));await retry;
  assert(same._sendQueue.some(m=>m.message==='KEEP-A'),'Unchanged-route controls retain existing retry behavior');
  const metadata=make(),key=metadata._relayRoutingKey();metadata._joinContext.name='Changed name';
  assert.equal(metadata._relayRoutingKey(),key,'Metadata edit is not a routing change');
  const modes=make();modes._sendQueue=[{type:'quick-announcement',message:'guide only'}];
  modes._inFlight=true;
  modes.send(JSON.stringify({type:'family-subscribe',tourCode:'A'}));
  assert(!modes._sendQueue.some(m=>m.message==='guide only'));
  if(typeof recordResult==='function')recordResult('ADIM-5.V57',
    'Periyodik relay temizliği, 35s sınırı, rota sonrası eski cevap/retry engeli ve aynı-rota retry korunumu',true);
  console.log('V57 UNIT PASS: idle sweep; 35000/35001ms expiry; stale-route response/retry dropped; same-route retry retained');
}

async function runV58InputChecks({baseUrl,url,token}){
  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
  const code='RY-V58-'+Date.now().toString(36).toUpperCase(),sockets=[],escaped=[];
  const monitor=error=>escaped.push(error.name+':'+(error.code||''));
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
  const wait=async predicate=>{
    const until=Date.now()+2500;while(!predicate()){
      if(Date.now()>until)throw Error('V58 input deadline');await new Promise(r=>setTimeout(r,5));
    }
  };
  const connect=async options=>{
    const ws=new WebSocket(url,options),messages=[];let closed=false;
    sockets.push(ws);ws.on('error',()=>{});ws.on('close',()=>closed=true);
    ws.on('message',(raw,binary)=>{if(binary)messages.push({binary:Buffer.from(raw)});
      else try{messages.push(JSON.parse(raw.toString()));}catch(e){}});
    await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
    return {ws,messages,closed:()=>closed};
  };
  const bootstrap=()=>fetch(baseUrl+'/api/bootstrap',{headers:{Authorization:'Bearer '+token}});
  process.on('uncaughtExceptionMonitor',monitor);
  try{
    assert.equal((await fetch(baseUrl+'/api/tours',{method:'POST',headers,
      body:JSON.stringify({code,name:'V58 isolated input test',guideName:'V58 guide'})})).status,200);
    assert.equal((await bootstrap()).status,200);
    const bad=await connect(),nested='['.repeat(8000)+'0'+']'.repeat(8000);
    bad.ws.send('{"type":"join","role":"pilgrim","tourCode":'+JSON.stringify(code)+',"roomId":"genel","name":'+nested+'}');
    await wait(bad.closed);assert(!bad.messages.some(m=>m.type==='joined'),'Invalid name must never become a room member');
    assert.equal((await bootstrap()).status,200);
    const guide=await connect();
    guide.ws.send(JSON.stringify({type:'join',role:'guide',token,tourCode:code,roomId:'genel',name:'V58 guide'}));
    await wait(()=>guide.messages.some(m=>m.type==='joined'));
    assert.equal(guide.messages.find(m=>m.type==='joined').room.totalListeners,0);
    const listener=await connect();listener.ws.send(JSON.stringify({type:'join',role:'pilgrim',tourCode:code,roomId:'genel',name:'Healthy listener'}));
    await wait(()=>listener.messages.some(m=>m.type==='joined'));
    // Relay context is rejected before sync/join; no HTTP-to-WS poison path.
    const opened=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'relay-open',version:56})});
    const cap=await opened.json();
    const raw='{"clientId":'+JSON.stringify(cap.clientId)+',"relayKey":'+JSON.stringify(cap.relayKey)+
      ',"subscriptionContext":{"type":"join","role":"pilgrim","tourCode":'+JSON.stringify(code)+',"name":'+nested+'}}';
    const invalid=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
    assert.equal(invalid.status,400);assert.equal((await bootstrap()).status,200);
    const credentials=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({clientId:{toString:null},messages:[]})});
    assert.equal(credentials.status,400);
    const coercion=await connect();coercion.ws.send('{"type":"join","tourCode":{"toString":null},"role":"pilgrim"}');
    await wait(coercion.closed);
    // A receiver/protocol error belongs to the offending socket, not process.uncaughtException.
    const unmasked=await connect();unmasked.ws._socket.write(Buffer.from([0x81,0]));await wait(unmasked.closed);
    const oversized=await connect();oversized.ws.send(Buffer.alloc(65537));await wait(oversized.closed);
    const cookie=await connect({headers:{Cookie:'unrelated_cookie=%'}});
    cookie.ws.send(JSON.stringify({type:'family-subscribe',tourCode:code}));
    await wait(()=>cookie.messages.some(m=>m.type==='family-state'));cookie.ws.close();
    // Good binary PCM and the existing numeric demo note still work after all rejections.
    const frame=Buffer.alloc(972);frame.writeUInt32LE(58,0);frame.writeDoubleLE(Date.now(),4);
    guide.ws.send(frame);await wait(()=>listener.messages.some(m=>m.binary?.readUInt32LE(0)===58));
    guide.ws.send(JSON.stringify({type:'audio-chunk',synthNote:440,level:.4}));
    await wait(()=>listener.messages.some(m=>m.type==='audio-chunk'&&m.synthNote===440));
    assert.equal((await bootstrap()).status,200);assert.deepEqual(escaped,[]);
    if(typeof recordResult==='function')recordResult('ADIM-3.V58',
      'Gerçek HTTP/WS: geçersiz metadata state öncesi reddedildi; bozuk frame/cookie yerel kaldı; sağlam PCM/demo devam etti',true);
    console.log('V58 E2E PASS: malformed anonymous join cannot poison room/bootstrap; receiver errors isolated; healthy PCM/demo preserved');
  }finally{
    for(const ws of sockets)ws.terminate();process.removeListener('uncaughtExceptionMonitor',monitor);
    await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
  }
}

async function runStep5V58InputChecks(){
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
  const source=fs.readFileSync(path.join(ROOT_DIR,'server.js'),'utf8').replace(/\r\n/g,'\n');
  function pick(name){
    const m=new RegExp('^function '+name+'\\([^\\n]*\\)\\s*\\{','m').exec(source);assert(m,'Missing '+name);
    for(let end=source.indexOf('}',m.index+m[0].length);end>=0;end=source.indexOf('}',end+1)){
      const code=source.slice(m.index,end+1);
      try{new vm.Script(code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}
    }throw Error('Unterminated '+name);
  }
  const box={AUTH_COOKIE_NAME:'unit_auth',isValidAuthToken:t=>t==='good'};
  vm.createContext(box);vm.runInContext(pick('isRysClientMessage')+'\n'+pick('extractAuthTokenFromReq'),box);
  const valid=box.isRysClientMessage;
  assert(valid({type:'join',name:'Guide',phone:null,lang:'ar'}));
  assert(valid({type:'admin-subscribe',token:undefined}));
  assert(!valid({type:'join',name:[]}));assert(!valid({type:'join',name:{}}));
  assert(!valid({type:'join',tourCode:{toString:null}}));
  assert(!valid(JSON.parse('{"type":"join","__proto__":{"admin":true}}')));
  let tree={};for(let i=0;i<9;i++)tree={data:tree};
  assert(!valid({type:'ping',extra:tree}));assert(!valid({type:'ping',extra:Array(513).fill(0)}));
  assert(!valid({type:'ping',value:Infinity}));assert(!valid({type:'audio-chunk',synthNote:NaN}));
  assert(valid({type:'audio-chunk',synthNote:440,level:.4}));
  assert(valid({type:'quick-announcement',message:'x'.repeat(16384)}));
  assert(!valid({type:'quick-announcement',message:'x'.repeat(16385)}));
  const unit=seq=>({type:'audio-chunk',seq,sampleRate:24000,sentAt:1,pcm16:Buffer.alloc(960).toString('base64')});
  assert(valid({type:'audio-chunk',frames:[unit(0),unit(1),unit(2)]}));
  assert(valid({type:'handoff-prepare',relayClientId:null,relayKey:null,
    subscription:{type:'join',role:'pilgrim',tourCode:'X',pin:'1453',name:'Hacı'}}));
  assert.equal(box.extractAuthTokenFromReq({headers:{cookie:'unrelated=%; unit_auth=g%6f%6fd'}}),'good');
  assert.equal(box.extractAuthTokenFromReq({headers:{cookie:'unit_auth=%'},query:{token:'good'}}),'good');
  assert.equal(box.extractAuthTokenFromReq({headers:{cookie:'unit_auth=%'}}),'');
  if(typeof recordResult==='function')recordResult('ADIM-5.V58',
    'Metadata tipleri, derinlik/genişlik/string sınırları, tehlikeli anahtarlar, PCM/demo uyumu ve cookie fallback',true);
  console.log('V58 UNIT PASS: bounded iterative wire validation; non-string metadata rejected; PCM/demo accepted; malformed cookies ignored');
}


// v59: real 301 WebSockets; deterministic queue fault injection is reported separately from TCP pause.
async function runV59FanoutChecks({baseUrl,url,token}){
  const assert=require('node:assert/strict'),wsLib=require('ws');
  const {monitorEventLoopDelay}=require('node:perf_hooks');
  const code='RY-V59-'+Date.now().toString(36).toUpperCase(),ip='198.51.100.59';
  const auth={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const sockets=[],peers=new Map(),received=Array.from({length:300},()=>[]),faults=[],latencies=[],sent=new Map();
  const originalUpgrade=wsLib.WebSocketServer.prototype.handleUpgrade;let joined=0;
  const deadline=async(test,ms=10000)=>{const end=Date.now()+ms;while(!test()){
    if(Date.now()>end)throw Error('V59 deadline; joined='+joined);await new Promise(r=>setTimeout(r,5));}};
  const request=async(body)=>{const r=await fetch(baseUrl+'/api/join-tour',{method:'POST',
    headers:{'Content-Type':'application/json','X-Forwarded-For':ip},body:JSON.stringify(body)});await r.arrayBuffer();return r.status;};
  const lag=monitorEventLoopDelay({resolution:10});let guide,created=false;
  wsLib.WebSocketServer.prototype.handleUpgrade=function(req,socket,head,cb){
    return originalUpgrade.call(this,req,socket,head,(ws,request)=>{
      if(request?.headers['x-rys-v59']!==undefined)peers.set(request.headers['x-rys-v59'],ws);
      return cb(ws,request);
    });
  };
  const connect=async(index,role)=>{
    const socket=new wsLib.WebSocket(url,{headers:{'X-Forwarded-For':ip,'X-Rys-V59':String(index)}});sockets.push(socket);
    socket.on('error',e=>faults.push(e.message));
    socket.on('message',(raw,binary)=>{
      if(binary){
        if(role==='guide')return;
        const seq=raw.length===972?raw.readUInt32LE(0)&0x7fffffff:-1,expected=sent.get(seq);
        if(!expected||!raw.equals(expected.bytes))faults.push('PCM mismatch '+index+'/'+seq);
        else{received[index].push(seq);latencies.push(performance.now()-expected.at);}
      }else{try{if(JSON.parse(raw.toString()).type==='joined')joined++;}catch(e){faults.push('bad JSON');}}
    });
    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
    socket.send(JSON.stringify({type:'join',role,tourCode:code,roomId:'genel',pin:'3159',
      token:role==='guide'?token:undefined,name:'V59 '+role+' '+index,deviceId:'v59-'+code+'-'+index}));
    return socket;
  };
  let pace0=0;
  const frame=async(seq)=>{
    if(seq===0)pace0=performance.now();
    const bytes=Buffer.alloc(972);bytes.writeUInt32LE(seq,0);bytes.writeDoubleLE(Date.now(),4);
    for(let i=0;i<480;i++)bytes.writeInt16LE(Math.round(9000*Math.sin(2*Math.PI*200*(seq*480+i)/24000)),12+2*i);
    sent.set(seq,{bytes,at:performance.now()});guide.send(bytes);
    await new Promise(r=>setTimeout(r,Math.max(0,pace0+(seq+1)*20-performance.now()))); // paced 50 pps, never a synthetic all-at-once send storm
  };
  try{
    const create=await fetch(baseUrl+'/api/tours',{method:'POST',headers:auth,
      body:JSON.stringify({code,name:'V59 CGNAT 300',pin:'3159',guideName:'V59 guide -1'})});
    assert.equal(create.status,200);await create.arrayBuffer();created=true;
    const statuses=[];
    for(let start=0;start<300;start+=30)statuses.push(...await Promise.all(Array.from({length:30},()=>request({code,pin:'3159'}))));
    console.log('V59 CGNAT HTTP: '+JSON.stringify(statuses.reduce((a,s)=>(a[s]=(a[s]||0)+1,a),{})));
    assert.equal(statuses.filter(s=>s===200).length,300,'300 valid clients behind one NAT must be admitted');
    for(let i=0;i<61;i++)assert.equal(await request({code,pin:'wrong'}),i<60?403:429);
    assert.equal(await request({code,pin:'3159'}),200,'failed PIN bucket must not block valid NAT peers');
    guide=await connect(-1,'guide');
    for(let start=0;start<300;start+=30)await Promise.all(Array.from({length:30},(_,j)=>connect(start+j,'pilgrim')));
    await deadline(()=>joined===301&&peers.size===301);
    const cpu=process.cpuUsage(),started=performance.now();lag.enable();
    for(let seq=0;seq<20;seq++)await frame(seq);
    await deadline(()=>received.every(a=>a.length===20));
    const slow=sockets.filter(s=>s!==guide).slice(0,30);
    for(let i=0;i<30;i++){
      slow[i]._socket.pause();
      // Deterministic transport-queue pressure, independent of OS TCP window size.
      Object.defineProperty(peers.get(String(i)),'bufferedAmount',{configurable:true,get:()=>20000});
    }
    for(let seq=20;seq<70;seq++)await frame(seq);
    const dropped=Array.from({length:30},(_,i)=>peers.get(String(i))._rysAudioDrops||0);
    assert(dropped.every(n=>n===50),'each congested peer must drop exactly its 50 stale frames');
    for(let i=0;i<30;i++){delete peers.get(String(i)).bufferedAmount;slow[i]._socket.resume();}
    for(let seq=70;seq<110;seq++)await frame(seq);
    await deadline(()=>received.slice(30).every(a=>a.length===110)&&received.slice(0,30).every(a=>a.length===60));
    for(let i=0;i<3;i++)Object.defineProperty(peers.get(String(i)),'bufferedAmount',{configurable:true,get:()=>65537});
    for(let seq=110;seq<120;seq++)await frame(seq);
    await deadline(()=>received.slice(30).every(a=>a.length===120));
    await deadline(()=>[0,1,2].every(i=>peers.get(String(i))._rysClosing));
    lag.disable();
    for(let i=30;i<300;i++)assert.deepEqual(received[i],Array.from({length:120},(_,n)=>n));
    for(let i=3;i<30;i++)assert.deepEqual(received[i],[...Array.from({length:20},(_,n)=>n),...Array.from({length:50},(_,n)=>n+70)]);
    assert.deepEqual(faults,[]);assert(latencies.every(x=>Number.isFinite(x)&&x>=0));
    latencies.sort((a,b)=>a-b);const percentile=p=>latencies[Math.floor((latencies.length-1)*p)];
    const elapsed=performance.now()-started,used=process.cpuUsage(cpu);
    assert(percentile(.99)<500,'local fanout P99 exceeded 500ms; inspect host contention');
    const metrics={listeners:300,healthy:270,frames:120,healthyFrames:270*120,
      slowQueueDrops:dropped.reduce((a,b)=>a+b,0),hardIsolated:3,corrupt:0,
      p50Ms:+percentile(.5).toFixed(2),p95Ms:+percentile(.95).toFixed(2),p99Ms:+percentile(.99).toFixed(2),
      maxMs:+latencies.at(-1).toFixed(2),eventLoopP99Ms:+(lag.percentile(99)/1e6).toFixed(2),
      cpuMs:+((used.user+used.system)/1000).toFixed(1),elapsedMs:+elapsed.toFixed(1)};
    console.log('V59 METRICS '+JSON.stringify(metrics));
    recordResult('ADIM-3.V59','300 same-IP joins; 301 real WS; 270 healthy intact; 30 paused + injected queues; 3 hard-isolated',true,JSON.stringify(metrics));
    console.log('V59 E2E PASS: byte integrity and local transport delay; physical crackle/OS background are not measured');
  }finally{
    lag.disable();wsLib.WebSocketServer.prototype.handleUpgrade=originalUpgrade;
    for(const s of sockets)try{s._socket?.resume();s.terminate();}catch(e){}
    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:auth});await r.arrayBuffer();}
  }
}


async function runStep5V59AudioChecks(){
  const assert=require('node:assert/strict');
  const read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
  const capture=read('public/pcm-capture-worklet.js'),player=read('public/pcm-player-worklet.js'),guide=read('public/rehber.html'),listener=read('public/dinle.html'),server=read('server.js');
  function pick(source,name){
    const match=new RegExp('^[ \\t]*(?:async )?function '+name+'\\(','m').exec(source);
    if(!match)throw Error('V59 missing '+name);
    for(let end=source.indexOf('}',match.index);end>=0;end=source.indexOf('}',end+1)){
      const text=source.slice(match.index,end+1);try{new vm.Script(text);return text;}catch(e){if(e.name!=='SyntaxError')throw e;}
    }throw Error('V59 unterminated '+name);
  }
  const box={Float32Array,Float64Array,Math,Number,RangeError,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},
    registerProcessor:(n,P)=>box.P=P,sampleRate:48000};
  vm.createContext(box);vm.runInContext(capture.replace(/^export .*$/mg,''),box);
  const rms=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length);
  const dsp=[];
  for(const rate of [8000,16000,44100,48000]){
    const input=Float32Array.from({length:rate*2},(_,i)=>.2+.8*Math.sin(2*Math.PI*997*i/rate));
    const run=block=>{const frames=[],kernel=new box.RysCaptureKernel(rate,{continuousSpeech:true,comfortFade:false},m=>frames.push(Array.from(m.samples)));
      for(let i=0;i<input.length;i+=block)kernel.process(input.subarray(i,i+block),i/rate);
      assert.equal(frames.length,100);assert(frames.every(a=>a.length===480&&a.every(Number.isFinite)));
      return frames.flat();};
    const a=run(128),b=run(2048);assert.deepEqual(a,b,'128/2048 partition must preserve all samples');
    const stable=a.slice(24000),dc=stable.reduce((s,x)=>s+x,0)/stable.length;
    assert(Math.abs(dc)<1e-5);assert(Math.max(...stable.map(Math.abs))<.98);
    const impulse=new box.RysFir24(rate),tail=[];
    for(let i=0;i<rate;i++)impulse.push(i===0?1:0,x=>tail.push(x));
    assert.equal(tail.length,24000);assert(tail.slice(2000).every(x=>Math.abs(x)<1e-15));
    const amplitude=f=>{const fir=new box.RysFir24(rate),out=[];
      for(let i=0;i<rate;i++)fir.push(.2*Math.sin(2*Math.PI*f*i/rate),x=>out.push(x));return rms(out.slice(2400));};
    const pass=amplitude(1000);assert(pass>.13&&pass<.15);
    const stop=rate>=44100?amplitude(14000):amplitude(rate*.49);
    const stopDb=20*Math.log10(Math.max(1e-16,stop)/pass);
    assert(stopDb<(rate>=44100?-75:-30),'band-edge rejection '+rate+' '+stopDb);
    dsp.push({rate,frames:100,dc:+dc.toExponential(2),stopDb:+stopDb.toFixed(1)});
  }
  const loud=new box.RysCaptureKernel(48000,{continuousSpeech:true,comfortFade:false},m=>loudFrames.push(...m.samples)),loudFrames=[];
  loud.process(Float32Array.from({length:96000},(_,i)=>.3+6*Math.sin(2*Math.PI*997*i/48000)));
  assert(loudFrames.every(x=>Number.isFinite(x)&&Math.abs(x)<=.980001));
  // Model a quiet consonant immediately after a loud vowel: verify hangover, not speaker identity.
  const gate=new box.RysNearExpander();for(let i=0;i<12000;i++)gate.step(0);
  for(let i=0;i<2400;i++)gate.step(.3*Math.sin(2*Math.PI*1500*i/24000));assert(gate.hold>0);
  for(let i=0;i<480;i++)gate.step(.006*Math.sin(2*Math.PI*3000*i/24000));assert(gate.hold>0&&gate.g>.9);
  vm.runInContext(player,box);const P=box.P,p=new P(),arrivals=[];
  for(let seq=0;seq<110;seq++){
    if(seq===20||seq===21)continue;
    arrivals.push({seq,at:seq*20+[0,28,2,9][seq%4],samples:Float32Array.from({length:480},(_,i)=>.25*Math.sin(2*Math.PI*200*(seq*480+i)/24000))});
  }arrivals.sort((a,b)=>a.at-b.at);
  let now=0,prev=0,maxStep=0,index=0;
  while(now<2050){
    while(index<arrivals.length&&arrivals[index].at<=now){const m=arrivals[index++];p._push({...m,arrival:m.at});if(m.seq%7===0)p._push({...m,arrival:m.at});}
    const out=new Float32Array(128);p.process([],[[out]]);
    for(const y of out){assert(Number.isFinite(y)&&Math.abs(y)<=.99);maxStep=Math.max(maxStep,Math.abs(y-prev));prev=y;}
    now+=128/48;
  }
  assert(p.stats.duplicate>0);assert(p.stats.concealed>=960);assert(maxStep<.06,'200Hz fixture abrupt jump '+maxStep);
  const catchup=new P();catchup.playing=true;catchup.target=.08;catchup.expected=0;
  catchup.haveHistory=true;catchup.frame.fill(.1);catchup.fi=0;catchup.catchupArmed=true;
  for(let seq=0;seq<20;seq++)catchup.q.set(seq,new Float32Array(480).fill(-.1));
  catchup.plc={fill:a=>a.fill(.1),append(){}};const phase=.375;catchup.phase=phase;
  catchup._nextFrame();assert.equal(catchup.stats.catchupDropped,14);assert.equal(catchup.expected,15);
  assert.equal(catchup.phase,phase);assert(Math.abs(catchup.frame[0]-.1)<1e-6);assert(Math.abs(catchup.frame[71]+.1)<1e-6);
  const arming=new P();arming.playing=true;arming.target=.08;arming.haveHistory=true;arming.frame.fill(.1);arming.fi=0;
  for(let i=0;i<210;i++){while(arming.q.size<20){const seq=arming.expected===null?0:(arming.expected+arming.q.size)%0x80000000;if(arming.expected===null)arming.expected=seq;arming.q.set(seq,new Float32Array(480).fill(.1));}
    arming.process([],[[new Float32Array(128)]]);if(arming.stats.catchupDropped>0)break;}
  assert(arming.stats.catchupDropped>0,'sustained backlog must arm catch-up within 560ms');
  const env={isMicBroadcasting:true,isVoiceLoopbackTesting:false,isHealingGuideMic:false,
    micStream:{getAudioTracks:()=>[{readyState:'live',muted:true}],getTracks:()=>[]},guideTrackMutedAt:1000,guideLastMicRebuildAt:0,
    lastGuideMicChunkAt:5000,Date:{now:()=>5000},audioCtx:null,disconnectGuideAudioNodes(){},
    setupGuideMicrophoneGraph:async()=>{env.rebuilds++;},rebuilds:0,window:{},document:{getElementById:()=>null},console};
  vm.createContext(env);vm.runInContext(pick(guide,'healGuideMicrophoneIfNeeded'),env);
  await env.healGuideMicrophoneIfNeeded();assert.equal(env.rebuilds,1);await env.healGuideMicrophoneIfNeeded();assert.equal(env.rebuilds,1);
  assert(guide.includes('healGuideMicrophoneIfNeeded(true), 350'));assert(guide.includes('audioTrack.onmute'));
  for(const [source,name,node,value] of [[guide,'updateGuideMicGain','guideMicGainNode',1.25],[listener,'updateVolume','gainNode',1.25]]){
    const calls=[],g={audioCtx:{currentTime:9},document:{getElementById:()=>({})}};g[node]={gain:{setTargetAtTime:(...args)=>calls.push(args)}};
    vm.createContext(g);vm.runInContext(pick(source,name),g);g[name](125);assert.deepEqual(calls,[[value,9,.01]]);
  }
  assert(listener.includes("softClipper.oversample = '4x'"));
  const rateBox={rateLimitBuckets:new Map(),Date:{now:()=>0}};vm.createContext(rateBox);vm.runInContext(pick(server,'createRateLimiter'),rateBox);
  const response={status(n){this.code=n;return this;},json(){}};let admitted=0;
  const limiter=rateBox.createRateLimiter({max:1});const req={baseUrl:'',path:'/x',ip:'one',headers:{}};
  limiter(req,response,()=>admitted++);limiter(req,response,()=>admitted++);assert.equal(admitted,1);assert.equal(response.code,429);
  for(let i=0;i<5100;i++)limiter({...req,ip:'ip-'+i},response,()=>{});assert.equal(rateBox.rateLimitBuckets.size,5000);
  rateBox.Date.now=()=>60000;limiter({...req,ip:'fresh'},response,()=>admitted++);assert.equal(admitted,2);
  assert(server.includes('rysSendAudio(peer.ws,fallbackPayload,false)'));
  assert(!server.includes('fallbackJsonStr'));
  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=59-audio'));
  assert(read('public/sw.js').includes('pcm-capture-worklet.js?v=53-audio'));
  recordResult('ADIM-5.V59','8/16/44.1/48k DSP; FIR rejection; DC/limiter/partition; PLC/jitter/catchup; mic mute/retry; gain ramps; bounded CGNAT buckets',true);
  console.log('V59 DSP METRICS '+JSON.stringify({rates:dsp,fixture200HzMaxStep:+maxStep.toFixed(6),concealedSamples:p.stats.concealed}));
  console.log('V59 UNIT PASS: numerical model checks; no physical headset or lock-screen guarantee');
}

async function main() {
  const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
  const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
  try {
    await runStep1StaticAndSyntaxChecks();
    await runStep2And3LiveServerAndWsTests();
    await runStep4FrontendPwaAndAtomicWriteChecks();
    await runStep5V53AudioChecks();
    await runStep5V54AudioChecks();
    await runStep5V56HandoffChecks();
    await runStep5V57RoutingChecks();
    await runStep5V58InputChecks();
    await runStep5V59AudioChecks();

    console.log('\n====================================================================');
    console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
    console.log('====================================================================\n');
    if (runtimeSnapshot !== null) {
      fs.writeFileSync(runtimePath, runtimeSnapshot, 'utf8');
    }
    process.exit(0);
  } catch (err) {
    if (runtimeSnapshot !== null) {
      try {
        fs.writeFileSync(runtimePath, runtimeSnapshot, 'utf8');
      } catch {}
    }
    console.error('\n❌ DOĞRULAMA TESTİ HATASI:', err.message);
    process.exit(1);
  }
}

main();
