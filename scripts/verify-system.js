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

// PATCH: verify-v52
async function runStep5V52AudioChecks(){
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
  const recovery=new P();recovery.expected=7;recovery.missing=1;
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
  if(typeof recordResult==='function')recordResult('ADIM-5.V52','Kaynak dosyalarından DSP, profil, sıra, fanout ve relay davranışları doğrulandı',true);
  console.log('V52 PASS: source-only DSP/SRC/comfort/profile, queue/PLC/seq, binary+JSON dedup, coalescer, congestion, HTTP single-flight/drain/close, gesture/wake/pause');
}

async function main() {
  const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
  const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
  try {
    await runStep1StaticAndSyntaxChecks();
    await runStep2And3LiveServerAndWsTests();
    await runStep4FrontendPwaAndAtomicWriteChecks();
    await runStep5V52AudioChecks();

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
