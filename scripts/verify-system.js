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
  const relayMethods=['_enqueueRelayMessage','_flushAndPoll','close'].map(n=>pick(shim,n,'method')).join('\n');
  const hc=box('class Relay{'+relayMethods+'}\nglobalThis.R=Relay;','',{
    Date:{now:()=>0},setTimeout:()=>1,clearTimeout(){},queueMicrotask:f=>httpJobs.push(f),
    localStorage:{getItem:()=>''},fetch:(url,options)=>{
      fetchCalls++;fetchSignal=options.signal;
      const ok={ok:true,json:async()=>({messages:[{type:'room-state'}]})};
      if(fetchCalls===1)return new Promise(r=>resolveFirst=()=>r(ok));return Promise.resolve(ok);
    }
  }).c;
  const relay=new hc.R();Object.assign(relay,{readyState:1,_isRelay:true,_inFlight:false,_sendQueue:[],
    _clientId:'unit',_joinContext:{},_busConnected:()=>false,_deliverIncomingMessage(){delivered++;},_closeMqttClients(){}});
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
  probe.onmessage({data:JSON.stringify({type:'joined',room:{tourCode:'RY-KASIM',roomId:'wrong'}})});assert(wrong._isRelay);
  const stale=makeRelay();stale._tryNativeFailback();probe=probes.at(-1);probe.onopen();stale._transportGeneration++;
  probe.onmessage({data:JSON.stringify({type:'joined',room:{tourCode:'RY-KASIM',roomId:'a'}})});assert(stale._isRelay);
  const success=makeRelay();success._tryNativeFailback();probe=probes.at(-1);probe.onopen();
  assert(success._isRelay);assert.equal(closedMqtt,0);
  probe.onmessage({data:JSON.stringify({type:'joined',room:{tourCode:'RY-KASIM',roomId:'a'}})});
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
    probe.onmessage({data:JSON.stringify({type,room:{tourCode:'RY-KASIM',roomId:'a'},tourCode:'RY-KASIM'})});
    assert(!s._isRelay);assert.deepEqual(order,['ack','open']);
    assert.equal(probe.sent.filter(m=>m.type===mode).length,1,'Exactly one native subscription for '+mode);
    const seqs=probe.sent.flatMap(m=>m.frames?m.frames.map(f=>f.seq):[]);
    assert.deepEqual(seqs,[8,9,10,11]);const count=probe.sent.length;oldJob();assert.equal(probe.sent.length,count);
    s.close();
  }
  assert.equal(opened,3);assert.equal(acks,3);
  // Empty poll: family/admin never fabricate a pilgrim join; PIN stays in POST.
  const bodies=[],relay=box('class Relay{'+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.R=Relay;','',{
    localStorage:{getItem:()=>''},fetch:async(url,opts)=>{assert.equal(url,'/api/ws-relay');assert.equal(opts.method,'POST');
      bodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({messages:[]})};}}).c;
  for(const connected of [false,true])for(const mode of ['family-subscribe','admin-subscribe','join']){
    const s=new relay.R();Object.assign(s,{readyState:1,_isRelay:true,_sendQueue:[],_clientId:'unit',
      _subscriptionType:mode,_joinContext:{type:'join',tourCode:'X',role:'pilgrim',pin:'1453',deviceId:'device'},
      _busConnected:()=>connected,_deliverIncomingMessage(){},_enqueueRelayMessage(){}});
    const before=bodies.length;await s._flushAndPoll();
    assert.equal(bodies.length,before+1,'Broker connectivity must not suppress empty polling');
    const body=bodies.at(-1);assert.equal(body.subscriptionContext.type,mode);
    if(mode!=='join')assert.equal(body.joinContext,null);
    else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
  }
  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v55"));assert(sw.includes('/vercel-ws-shim.js?v=55'));
  for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'55',f+' stale shim');
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
    const begin=source.indexOf('    async _flushAndPoll(){');
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
      Object.assign(r,{readyState:1,_isRelay:true,_clientId:id,_subscriptionType:mode,_joinContext:context,
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

async function main() {
  const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
  const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
  try {
    await runStep1StaticAndSyntaxChecks();
    await runStep2And3LiveServerAndWsTests();
    await runStep4FrontendPwaAndAtomicWriteChecks();
    await runStep5V53AudioChecks();
    await runStep5V54AudioChecks();

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
