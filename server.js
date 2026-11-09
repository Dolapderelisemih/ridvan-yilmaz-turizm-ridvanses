const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');

// .env ortam değişkeni dosyasını otomatik yükle (bağımlılıksız)
const ENV_FILE = path.join(__dirname, '.env');
try {
  if (fs.existsSync(ENV_FILE)) {
    const envLines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/(^['"]|['"]$)/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (err) {
  console.error('.env dosyası okunamadı:', err.message);
}

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err.message, err.stack);
  try {
    isWritingRuntimeFile = false;
    flushPendingSaveSync();
  } catch {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 65536,
  perMessageDeflate: false
});

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Güvenlik Başlıkları (Security Headers) & Cross-Origin Destek
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  const origin = req.headers.origin || '';
  if (
    origin &&
    (origin.endsWith('.ridvanyilmazturizm.com') ||
      origin === 'https://ridvanyilmazturizm.com' ||
      origin.endsWith('.vercel.app') ||
      origin.startsWith('http://localhost:'))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-RY-Auth, X-Rys-Relay-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const DATA_FILE = path.join(__dirname, 'data', 'seed.json');
const RUNTIME_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), 'ridvanses-runtime.json')
  : path.join(__dirname, 'data', 'runtime.json');
const REA_FILE = path.join(__dirname, 'rea-umrahvoice-analysis.json');

function getDefaultState() {
  return {
    agency: {
      name: 'Rıdvan Yılmaz Turizm',
      shortName: 'RıdvanSes',
      phone: '+90 538 399 96 66',
      city: 'Osmangazi / Bursa'
    },
    tours: [],
    guides: [],
    hotels: [],
    announcements: [],
    sosAlerts: [],
    requests: [],
    siyerPoints: [],
    journeySteps: {}
  };
}

function loadState() {
  try {
    if (fs.existsSync(RUNTIME_FILE)) {
      return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Runtime state okunamadı, seed kullanılıyor:', err.message);
  }
  try {
    if (fs.existsSync(DATA_FILE)) {
      const seed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      saveState(seed);
      return seed;
    }
  } catch (err) {
    console.error('Seed state okunamadı, varsayılan boş şema kullanılıyor:', err.message);
  }
  const fallback = getDefaultState();
  saveState(fallback);
  return fallback;
}

let pendingSaveTimer = null;
let pendingSaveStateRef = null;
let isWritingRuntimeFile = false;
let writeAgainAfterCurrent = false;

async function flushAsyncRuntimeWrite() {
  if (isWritingRuntimeFile || !pendingSaveStateRef) return;
  isWritingRuntimeFile = true;
  const snapshot = pendingSaveStateRef;
  pendingSaveStateRef = null;
  const tmpFile = `${RUNTIME_FILE}.tmp`;
  try {
    const payload = JSON.stringify(snapshot, null, 2);
    await fs.promises.writeFile(tmpFile, payload, 'utf8');
    await fs.promises.rename(tmpFile, RUNTIME_FILE);
  } catch (err) {
    console.error('Runtime state asenkron kaydedilemedi:', err.message);
  } finally {
    isWritingRuntimeFile = false;
    if (writeAgainAfterCurrent || pendingSaveStateRef) {
      writeAgainAfterCurrent = false;
      flushAsyncRuntimeWrite();
    }
  }
}

function flushPendingSaveSync() {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  if (pendingSaveStateRef) {
    const tmpFile = `${RUNTIME_FILE}.tmp`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(pendingSaveStateRef, null, 2), 'utf8');
      fs.renameSync(tmpFile, RUNTIME_FILE);
      pendingSaveStateRef = null;
    } catch (err) {
      console.error('Runtime state senkron flush hatası:', err.message);
    }
  }
}

process.on('SIGINT', () => {
  flushPendingSaveSync();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushPendingSaveSync();
  process.exit(0);
});

function saveState(state) {
  try {
    if (state && typeof state === 'object') {
      if (Array.isArray(state.sosAlerts) && state.sosAlerts.length > 100) {
        state.sosAlerts = state.sosAlerts.slice(0, 100);
      }
      if (Array.isArray(state.announcements) && state.announcements.length > 100) {
        state.announcements = state.announcements.slice(0, 100);
      }
      if (Array.isArray(state.requests) && state.requests.length > 200) {
        state.requests = state.requests.slice(0, 200);
      }
    }
    pendingSaveStateRef = state;
    if (isWritingRuntimeFile) {
      writeAgainAfterCurrent = true;
      return;
    }
    if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
    pendingSaveTimer = setTimeout(() => {
      pendingSaveTimer = null;
      flushAsyncRuntimeWrite();
    }, 250);
  } catch (err) {
    console.error('Runtime state kaydedilemedi:', err.message);
  }
}

let db = loadState();

// Ensure Polarsteps-style journeySteps exist in runtime db
function ensureJourneySteps() {
  if (!db.journeySteps || typeof db.journeySteps !== 'object') {
    try {
      const seedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      db.journeySteps = seedData.journeySteps || {};
      saveState(db);
    } catch {
      db.journeySteps = {};
    }
  }
}
ensureJourneySteps();

function buildDefaultStepsForTour(tour) {
  return [
    {
      id: `step-${Date.now()}-1`,
      order: 1,
      dayLabel: '1. Gün • Başlangıç',
      title: 'Bursa & İstanbul Buluşma — İhram ve Niyet',
      locationLabel: 'Osmangazi / Bursa — Havalimanı',
      category: 'ulasim',
      lat: 40.1885,
      lng: 29.0610,
      distanceKm: 0,
      status: 'completed',
      timestamp: 'Başlangıç',
      guideNote: `${tour.guideName || 'Rehber Hocamız'} eşliğinde ihram niyetimizi alarak kutsal topraklara doğru yola çıktık.`,
      prayerSummary: 'Allâhümme innî ürîdü’l-umrate fe-yessirhâ lî ve tekabbelhâ minnî.'
    },
    {
      id: `step-${Date.now()}-2`,
      order: 2,
      dayLabel: '2. Gün • Şu Anki Durak',
      title: 'Mescid-i Haram & Kâbe-i Muazzama Tavafı',
      locationLabel: 'Kâbe-i Muazzama • Mekke-i Mükerreme',
      category: 'kabe',
      lat: 21.4225,
      lng: 39.8262,
      distanceKm: 2465,
      status: 'active',
      timestamp: 'Canlı Durak',
      guideNote: 'Beytullah huzurunda canlı sesli rehberlik eşliğinde Umre tavafımızı ve sa’y ibadetimizi eda ediyoruz.',
      prayerSummary: 'Rabbenâ âtinâ fi’d-dünyâ haseneten ve fi’l-âhirati haseneten ve kınâ azâbe’n-nâr.'
    },
    {
      id: `step-${Date.now()}-3`,
      order: 3,
      dayLabel: 'Medine-i Münevvere',
      title: 'Mescid-i Nebevî & Ravza-i Mutahhara Ziyareti',
      locationLabel: 'Mescid-i Nebevî • Medine-i Münevvere',
      category: 'medine',
      lat: 24.4672,
      lng: 39.6111,
      distanceKm: 2968,
      status: 'planned',
      timestamp: 'Planlanan',
      guideNote: 'Peygamber Efendimiz’in ﷺ huzurunda salat ü selam ve Siyer-i Nebi ziyaretleri.',
      prayerSummary: 'Esselâmü aleyke yâ Resûlallâh, esselâmü aleyke yâ Habîballâh.'
    }
  ];
}

function getTourSteps(tourCode) {
  const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
  ensureJourneySteps();
  if (!Array.isArray(db.journeySteps[code])) {
    const existingTour = (db.tours || []).find((t) => String(t.code || '').toUpperCase() === code);
    if (!existingTour) {
      return buildDefaultStepsForTour({ code, guideName: 'Ömer Ali Gültekin' });
    }
    db.journeySteps[code] = buildDefaultStepsForTour(existingTour);
    saveState(db);
  }
  return db.journeySteps[code];
}

function computeJourneyStats(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const completedOrActive = list.filter((s) => s.status === 'completed' || s.status === 'active');
  const completedCount = list.filter((s) => s.status === 'completed').length;
  const activeStep = list.find((s) => s.status === 'active') || completedOrActive[completedOrActive.length - 1] || list[0] || null;
  const currentDistanceKm = completedOrActive.reduce((maxKm, s) => Math.max(maxKm, Number(s.distanceKm) || 0), 0);
  const totalPlannedKm = list.reduce((maxKm, s) => Math.max(maxKm, Number(s.distanceKm) || 0), 0);
  return {
    totalSteps: list.length,
    completedCount,
    visitedCount: completedOrActive.length,
    currentDistanceKm,
    totalPlannedKm,
    activeStepId: activeStep ? activeStep.id : null,
    activeStepTitle: activeStep ? activeStep.title : 'Kâbe-i Muazzama',
    activeDayLabel: activeStep ? activeStep.dayLabel : '1. Gün'
  };
}

// Live Room State in Memory
// key: `${tourCode}:${roomId}`
const liveRooms = new Map();

function getOrCreateRoom(tourCode, roomId = 'genel') {
  const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
  const rId = String(roomId || 'genel').trim();
  const key = `${code}:${rId}`;
  if (!liveRooms.has(key)) {
    const tour = db.tours.find((t) => t.code === code) || db.tours[0];
    liveRooms.set(key, {
      key,
      tourCode: code,
      roomId: rId,
      tourName: tour ? tour.name : code,
      guideName: tour ? tour.guideName : 'Ömer Ali Gültekin',
      isLive: false,
      broadcastMode: 'idle',
      startedAt: Date.now() - 18 * 60 * 1000,
      currentTopic:
        code === 'RY-KASIM'
          ? 'Kasım Umresi — Kâbe’nin Huzuru & Peygamber Efendimizin ﷺ İzinde Manevi Yolculuk'
          : 'Kâbe-i Muazzama Tavaf Duaları & Siyer-i Nebi Sohbeti',
      activeTawafStage: null,
      guideLocation: null,
      clients: new Map() // clientId -> { ws, id, role, name, phone, lang, joinedAt }
    });
  }
  return liveRooms.get(key);
}

// Initialize default rooms
getOrCreateRoom('RY-KASIM', 'genel');
getOrCreateRoom('RY-KASIM', 'siyer');

function getTourRooms(tourCode) {
  const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
  const list = [];
  for (const r of liveRooms.values()) {
    if (r.tourCode === code) list.push(r);
  }
  return list;
}

// Çoklu Oda Akıllı Yayın Yönlendirici:
// Rehber 'genel' (Ana Kanal) odasındaysa, aynı kafilenin kendi bağımsız canlı rehberi olmayan tüm odalarına ('genel' + 'siyer') yayın yapar.
// Rehber özellikle 'siyer' odasını seçtiyse yalnızca 'siyer' odasına yayın yapar (böylece iki hoca aynı anda çakışmadan farklı odalarda konuşabilir).
function getTargetBroadcastRooms(sourceRoom) {
  if (!sourceRoom) return [];
  if (sourceRoom.roomId && sourceRoom.roomId !== 'genel') {
    return [sourceRoom];
  }
  return getTourRooms(sourceRoom.tourCode).filter((r) => {
    if (r.roomId === sourceRoom.roomId) return true;
    const hasDedicatedGuide = Array.from(r.clients.values()).some((c) => c.role === 'guide');
    return !hasDedicatedGuide;
  });
}

function serializeRoom(room, includePilgrimDetails = true) {
  let pilgrimCount = 0;
  const pilgrims = [];
  const guides = [];
  const seenIds = new Set();

  // Aynı kafiledeki (ör. RY-KASIM:genel ve RY-KASIM:siyer) tüm bağlı hacıları tek listede birleştir
  // ki Siyer odasını seçen hacı da rehberin ekranında görünsün ve toplam dinleyici sayısı tutarlı olsun.
  const tourRooms = getTourRooms(room.tourCode);
  for (const r of tourRooms) {
    for (const c of r.clients.values()) {
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      if (c.role === 'guide') {
        guides.push({
          id: c.id,
          name: c.name,
          phone: includePilgrimDetails ? (c.phone || '') : '',
          role: c.role,
          roomId: r.roomId,
          lang: c.lang || 'tr',
          joinedAt: c.joinedAt
        });
      } else if (c.role === 'pilgrim') {
        pilgrimCount++;
        if (includePilgrimDetails) {
          pilgrims.push({
            id: c.id,
            name: c.name,
            phone: c.phone || '',
            role: c.role,
            roomId: r.roomId,
            lang: c.lang || 'tr',
            joinedAt: c.joinedAt
          });
        }
      }
    }
  }

  return {
    key: room.key,
    tourCode: room.tourCode,
    roomId: room.roomId,
    tourName: room.tourName,
    guideName: room.guideName,
    isLive: room.isLive,
    broadcastMode: room.broadcastMode,
    startedAt: room.startedAt,
    currentTopic: room.currentTopic,
    activeTawafStage: room.activeTawafStage || null,
    guidePeerId: room.guidePeerId || null,
    audioSourceId:room.audioSourceId||null,
    audioStateKnown:!!room.audioStateKnown,
    audioStateSeq:room.audioStateSeq||null,audioStateEnded:!!room.audioStateEnded,
    guideLocation: room.guideLocation || null,
    connectedPilgrims: pilgrims,
    connectedGuides: guides,
    totalListeners: pilgrimCount,
    realListenerCount: pilgrimCount
  };
}

// PATCH: fanout-v52
function rysSendAudio(socket,data,binary=false,now=Date.now()){
  if(socket.readyState!==WebSocket.OPEN||socket._rysClosing)return false;
  const stop=()=>{socket._rysClosing=true;try{socket.terminate?.();}catch(e){}};
  const queued=Number(socket.bufferedAmount)||0,soft=binary?9720:16000;
  if(!socket.isHttpRelay){
    if(queued>65536){stop();return false;}
    if(queued>soft){
      socket._rysAudioDrops=(socket._rysAudioDrops||0)+1;
      if(socket._rysCongestedAt==null)socket._rysCongestedAt=now;
      if(now-socket._rysCongestedAt>=2000)stop();
      return false;
    }
    socket._rysCongestedAt=null;
  }
  try{
    if(socket.isHttpRelay)socket.send(data);
    else socket.send(data,{binary},err=>{if(err)stop();});
    return true;
  }catch(e){socket._rysAudioErrors=(socket._rysAudioErrors||0)+1;return false;}
}
function broadcastToRoom(room,payload,excludeWs=null,isAudioOverride=false){
  const audio=isAudioOverride||!!(payload&&typeof payload==='object'&&payload.type==='audio-chunk');
  const data=typeof payload==='string'?payload:JSON.stringify(payload);
  let relayData;
  for(const client of room.clients.values()){
    const socket=client.ws;if(socket===excludeWs||socket.readyState!==WebSocket.OPEN)continue;
    if(audio){
      if(socket.isHttpRelay&&relayData===undefined){
        try{relayData=payload&&typeof payload==='object'?payload:JSON.parse(data);}catch(e){relayData=data;}
      }
      rysSendAudio(socket,socket.isHttpRelay?relayData:data,false);
    }
    else {try{socket.send(data);}catch(e){}}
  }
}

// v61: source identity is control metadata; the 972-byte PCM wire format is unchanged.
function acceptRysAudio(room,sender,clientId,synth=false){
  const sameSource=room.audioSourceId===(sender.audioSourceId||clientId);
  return !(sameSource&&room.audioStateKnown&&(!room.isLive||!synth&&String(room.broadcastMode||'').startsWith('demo')));
}

function acceptRysAudioState(room,sender,clientId,message){
  if(room.audioSourceId!==(sender.audioSourceId||clientId)||!Number.isSafeInteger(room.audioStateSeq))return true;
  return Number.isSafeInteger(message.audioStateSeq)&&message.audioStateSeq>room.audioStateSeq;
}

function setRysAudioSource(room,sourceId){
  if(room.audioSourceId===sourceId)return;
  room.audioSourceId=sourceId;room.audioStateKnown=false;room.audioStateSeq=null;room.audioStateEnded=false;
  broadcastToRoom(room,{type:'audio-source',audioSourceId:sourceId});
}

function broadcastToGuidesInTour(tourCode, payload) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const r of getTourRooms(tourCode)) {
    for (const client of r.clients.values()) {
      if (client.role === 'guide' && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }
}

const guideDisconnectTimers = new Map(); // room.key -> Timeout

// Auth Constants & Helpers (Rehber Yayını & Acente Paneli Yetkili Girişi — .env Üzerinden Yönetilir)
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'ridvanyilmazturizm@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD_ENV = String(process.env.ADMIN_PASSWORD || '').trim();
const SELAMET_PASSWORD_ENV = String(process.env.SELAMET_PASSWORD || '').trim();
const ADMIN_PASSWORD_SHA256 = '5493a522fbec2df9e753e4befd4fca615a2d43f5a4c09350e7fe578b5cce316f';
const SELAMET_PASSWORD_SHA256 = '0b7eea0794148d756d8b8cbe7d97ac6153c2abe52fe3d20938f9c751b2b73b5a';
const AUTH_COOKIE_NAME = 'ry_auth';
const AUTH_TOKEN_VALUE = String(
  process.env.AUTH_TOKEN_SECRET || crypto.randomBytes(32).toString('hex')
).trim();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
const activeAuthSessions = new Map(); // token -> { user, createdAt, expiresAt }
const revokedAuthTokens = new Set();

function createAuthSession(user) {
  const sessionToken = `rys_${crypto.randomBytes(24).toString('hex')}`;
  const now = Date.now();
  activeAuthSessions.set(sessionToken, {
    user,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });
  return sessionToken;
}

function revokeAuthToken(token) {
  const clean = String(token || '').trim();
  if (!clean) return;
  activeAuthSessions.delete(clean);
  if (clean !== AUTH_TOKEN_VALUE) {
    revokedAuthTokens.add(clean);
  }
}

// IP Tabanlı Hafif Hız Sınırlayıcı (Sliding Window Rate Limiter)
const rateLimitBuckets = new Map();
function createRateLimiter({ windowMs = 60000, max = 30, scope = '', message = 'Çok fazla istek gönderildi. Lütfen biraz bekleyiniz.' } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const ip = String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').trim();
    const key = `${scope}:${req.baseUrl}${req.path}:${ip}`;
    let entry = rateLimitBuckets.get(key);
    if (!entry || now >= entry.resetAt) {
      if (!entry && rateLimitBuckets.size >= 5000) {
        for (const [k, v] of rateLimitBuckets) if (now >= v.resetAt) rateLimitBuckets.delete(k);
        if (rateLimitBuckets.size >= 5000) return res.status(429).json({ success: false, message });
      }
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitBuckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({
        success: false,
        message
      });
    }
    return next();
  };
}

const loginRateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 30,
  message: 'Çok fazla giriş denemesi yapıldı. Lütfen 1 dakika sonra tekrar deneyiniz.'
});
// v59: shared NAT admission and failed PIN attempts use separate buckets.
const joinTourAdmissionLimiter = createRateLimiter({
  scope: 'join-valid', windowMs: 60000, max: 1200,
  message: 'Kafile katılımı yoğun. Lütfen kısa süre sonra tekrar deneyiniz.'
});
const joinTourFailureLimiter = createRateLimiter({
  scope: 'join-invalid', windowMs: 60000, max: 60,
  message: 'Çok fazla hatalı kafile veya PIN denemesi. Lütfen 1 dakika bekleyiniz.'
});
function joinTourRateLimiter(req, res, next) {
  const body = req.body || {}, code = String(body.code || '').toUpperCase().trim();
  const tour = db.tours.find(t => t.code.toUpperCase() === code);
  const valid = !!tour && !(tour.pinProtected && tour.pin && String(tour.pin) !== String(body.pin || '').trim());
  return (valid ? joinTourAdmissionLimiter : joinTourFailureLimiter)(req, res, next);
}
const sosRateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 20,
  message: 'Acil SOS bildiriminiz zaten iletildi. Lütfen bekleyiniz.'
});
const demoRequestRateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 15,
  message: 'Çok fazla talep gönderildi. Lütfen daha sonra tekrar deneyiniz.'
});

function verifyPassword(candidate, envPass, fallbackSha256) {
  const clean = String(candidate || '').trim();
  if (!clean) return false;
  if (envPass) return clean === envPass;
  const hash = crypto.createHash('sha256').update(clean).digest('hex');
  return hash === fallbackSha256;
}

function isValidAuthToken(token) {
  const clean = String(token || '').trim();
  if (!clean || revokedAuthTokens.has(clean)) return false;
  if (clean === AUTH_TOKEN_VALUE) return true;
  const sess = activeAuthSessions.get(clean);
  if (!sess) return false;
  if (Date.now() > sess.expiresAt) {
    activeAuthSessions.delete(clean);
    return false;
  }
  return true;
}

function extractAuthTokenFromReq(req) {
  if (!req || !req.headers) return '';
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerTok = authHeader.slice(7).trim();
    if (isValidAuthToken(bearerTok)) return bearerTok;
  }
  const customHeader = String(req.headers['x-ry-auth'] || '').trim();
  if (isValidAuthToken(customHeader)) return customHeader;
  const cookieHeader = String(req.headers.cookie || '');
  if (cookieHeader) {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq > 0) {
        const k = part.slice(0, eq).trim();
        if(k!==AUTH_COOKIE_NAME)continue;
        let v;try{v=decodeURIComponent(part.slice(eq+1).trim());}catch(e){continue;}
        if (isValidAuthToken(v)) {
          return v;
        }
      }
    }
  }
  if (req.query && req.query.token && isValidAuthToken(req.query.token)) {
    return String(req.query.token).trim();
  }
  return '';
}

function getAuthenticatedUser(req) {
  const tok = extractAuthTokenFromReq(req);
  if (!tok) return null;
  const sess = activeAuthSessions.get(tok);
  if (sess && sess.user) return sess.user;
  return {
    id: 'admin-1',
    name: 'Rıdvan Yılmaz Turizm (Yetkili)',
    email: ADMIN_USERNAME,
    role: 'agency_admin',
    agency: 'Rıdvan Yılmaz Turizm',
    assignedTour: null
  };
}

function isRequestAuthenticated(req) {
  return Boolean(extractAuthTokenFromReq(req));
}

function sanitizeTourForPublic(tour) {
  if (!tour || typeof tour !== 'object') return tour;
  const { pin, ...rest } = tour;
  const isProtected = Boolean(rest.pinProtected || pin);
  return {
    ...rest,
    pinProtected: isProtected,
    pinRequired: isProtected
  };
}

function sanitizeGuideForPublic(guide) {
  if (!guide || typeof guide !== 'object') return guide;
  const { phone, email, ...rest } = guide;
  return rest;
}

function evaluateTourGuidePresence(tourCode) {
  const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
  const genelRoom = getOrCreateRoom(code, 'genel');
  const genelHasGuide = Array.from(genelRoom.clients.values()).some((c) => c.role === 'guide');
  if (!genelHasGuide && genelRoom.isLive) {
    genelRoom.isLive = false;
    genelRoom.broadcastMode = 'idle';genelRoom.audioStateKnown=true;genelRoom.audioStateEnded=true;
    broadcastToFamilyTrackers(code, {
      type: 'stream-state',
      isLive: false,
      broadcastMode: 'idle',
      currentTopic: genelRoom.currentTopic
    });
  }
  for (const r of getTourRooms(code)) {
    const roomHasGuide = Array.from(r.clients.values()).some((c) => c.role === 'guide');
    const coveredByGenel = r.roomId !== 'genel' && genelHasGuide && genelRoom.isLive;
    if (!roomHasGuide && coveredByGenel) {
      r.isLive = genelRoom.isLive;
      r.broadcastMode = genelRoom.broadcastMode;
      r.currentTopic = genelRoom.currentTopic;
      r.guidePeerId = genelRoom.guidePeerId || null;
      r.guideName = genelRoom.guideName;
      setRysAudioSource(r,genelRoom.audioSourceId||null);
      r.audioStateKnown=!!genelRoom.audioStateKnown;
      r.audioStateSeq=genelRoom.audioStateSeq||null;r.audioStateEnded=!!genelRoom.audioStateEnded;
      broadcastToRoom(r, {
        type: 'stream-state',
        isLive: r.isLive,
        broadcastMode: r.broadcastMode,
        currentTopic: r.currentTopic,
        guidePeerId: r.guidePeerId || null,
        audioSourceId:r.audioSourceId||null,
        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
      });
      continue;
    }
    if (!roomHasGuide && !coveredByGenel && r.isLive) {
      r.isLive = false;
      r.broadcastMode = 'idle';r.audioStateKnown=true;r.audioStateEnded=true;
    }
    if (!r.isLive && r.broadcastMode !== 'idle') {
      r.broadcastMode = 'idle';
    }
    if (!roomHasGuide && !coveredByGenel) {
      broadcastToRoom(r, {
        type: 'stream-state',
        isLive: r.isLive,
        broadcastMode: r.broadcastMode,
        currentTopic: r.currentTopic,
        guidePeerId: r.guidePeerId || null,
        audioSourceId:r.audioSourceId||null,
        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
      });
    }
  }
}

function removeClientFromRoom(room, clientId, graceMs = 2500) {
  if (!room) return;
  const prevClient = room.clients.get(clientId);
  room.clients.delete(clientId);
  if (room.activePublisherClientId === clientId) {
    room.activePublisherClientId = null;
  }

  if (prevClient && prevClient.role === 'guide') {
    const timerKey = room.key;
    const code = room.tourCode;
    if (guideDisconnectTimers.has(timerKey)) {
      clearTimeout(guideDisconnectTimers.get(timerKey));
      guideDisconnectTimers.delete(timerKey);
    }
    if (graceMs <= 0) {
      evaluateTourGuidePresence(code);
      broadcastRoomState(room);
      return;
    }
    const timer = setTimeout(() => {
      guideDisconnectTimers.delete(timerKey);
      evaluateTourGuidePresence(code);
      broadcastRoomState(room);
    }, graceMs);
    guideDisconnectTimers.set(timerKey, timer);
    return;
  }

  if (
    room.clients.size === 0 &&
    !room.isLive &&
    !(db.tours || []).some((t) => String(t.code || '').toUpperCase() === String(room.tourCode || '').toUpperCase())
  ) {
    liveRooms.delete(room.key);
    return;
  }

  broadcastRoomState(room);
}

// HTTP Relay Sessions for Serverless (Vercel) Fallback
const httpRelaySessions = new Map(); // clientId -> { clientId, ws, outbox: [], currentRoom: null, lastSeen: number }

function cleanupStaleRelaySessions() {
  const now = Date.now();
  for (const [cid, sess] of httpRelaySessions.entries()) {
    if (now - sess.lastSeen > 35000) {
      httpRelaySessions.delete(cid);
      if (sess.currentRoom) {
        removeClientFromRoom(sess.currentRoom, cid);
      }
    }
  }
}

function broadcastToAdmins(payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((ws) => {
    if (ws.isAdmin && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
  for (const sess of httpRelaySessions.values()) {
    if (sess.ws.isAdmin) {
      sess.ws.send(data);
    }
  }
}

function broadcastToFamilyTrackers(tourCode, payload) {
  const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
  const data = JSON.stringify(payload);
  wss.clients.forEach((ws) => {
    if (ws.familyTourCode === code && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
  for (const sess of httpRelaySessions.values()) {
    if (sess.ws.familyTourCode === code) {
      sess.ws.send(data);
    }
  }
}

function broadcastStepsUpdate(tourCode, activeStepId = null) {
  const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
  const steps = getTourSteps(code);
  const stats = computeJourneyStats(steps);
  const payload = {
    type: 'steps-updated',
    tourCode: code,
    steps,
    stats,
    activeStepId: activeStepId || stats.activeStepId
  };
  for (const room of liveRooms.values()) {
    if (room.tourCode === code) {
      broadcastToRoom(room, payload);
    }
  }
  broadcastToFamilyTrackers(code, payload);
  broadcastToAdmins(payload);
}

function broadcastRoomState(room) {
  if (!room) return;
  if (room._broadcastTimer) return;
  room._broadcastTimer = setTimeout(() => {
    room._broadcastTimer = null;
    const tourRooms = getTourRooms(room.tourCode);
    for (const r of tourRooms) {
      const fullState = serializeRoom(r, true);
      const compactState = serializeRoom(r, false);
      const guidePayload = JSON.stringify({ type: 'room-state', room: fullState });
      const pilgrimPayload = JSON.stringify({ type: 'room-state', room: compactState });

      for (const client of r.clients.values()) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(client.role === 'guide' ? guidePayload : pilgrimPayload);
        }
      }
      if (r.roomId === 'genel') {
        broadcastToFamilyTrackers(r.tourCode, { type: 'room-state', room: compactState });
      }
    }
    broadcastToAdmins({
      type: 'admin-rooms-update',
      rooms: Array.from(liveRooms.values()).map((rm) => serializeRoom(rm, true))
    });
  }, 150);
}

let clientSeq = 1;

// PATCH: framing-v50
function validRysAudio(m) {
  return (
    Boolean(m) &&
    m.type === 'audio-chunk' &&
    m.sampleRate === 24000 &&
    Number.isInteger(m.seq) &&
    m.seq >= 0 &&
    m.seq <= 0x7fffffff &&
    Number.isFinite(m.sentAt) &&
    m.sentAt > 0 &&
    typeof m.pcm16 === 'string' &&
    m.pcm16.length === 1280 &&
    /^[A-Za-z0-9+/]+$/.test(m.pcm16)
  );
}

function unpackRysAudio(m) {
  if (m?.type !== 'audio-chunk') return null;
  const list = m.frames === undefined ? [m] : m.frames;
  if (!Array.isArray(list) || list.length < 1 || list.length > 3 || !list.every(validRysAudio)) return [];
  // Independent units, no fictitious arrival timestamps, no sample slicing.
  return list.map((f) => ({ ...f, _msgId: m._msgId ? m._msgId + ':' + f.seq : f._msgId }));
}

// PATCH: server-wrapper-v50
function processClientJsonMessage(ctx, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'guide-stream-state') {
    const r = ctx.currentRoom;
    const owner = r?.activePublisherClientId;
    if (owner && owner !== ctx.clientId && r.clients.has(owner)) return;
  }
  if (msg.type === 'audio-chunk' && !msg.synthNote) {
    const list = unpackRysAudio(msg);
    if (!list?.length) return;
    for (const f of list) processClientJsonMessageV49(ctx, f);
    return;
  }
  processClientJsonMessageV49(ctx, msg);
}

function processClientJsonMessageV49(ctx, msg) {
  const { clientId, ws } = ctx;
  if (msg && msg.token && isValidAuthToken(msg.token)) {
    ws.isAuthenticated = true;
    ctx.isAuthenticated = true;
  }
  const isAuthedClient = Boolean(ws.isAuthenticated || ctx.isAuthenticated);

  if (msg.type === 'admin-subscribe') {
    if (!isAuthedClient) {
      ws.send(JSON.stringify({ type: 'auth-error', message: 'Acente paneli aboneliği için yetkili oturum gereklidir.' }));
      return;
    }
    ws.isAdmin = true;
    sendRysSubscriptionAck(ctx, {
        type: 'admin-rooms-update',
        rooms: Array.from(liveRooms.values()).map((r) => serializeRoom(r, true)),
        sosAlerts: db.sosAlerts,
        announcements: db.announcements
      });
    return;
  }

  if (msg.type === 'family-subscribe') {
    const tourCode = String(msg.tourCode || 'RY-KASIM').toUpperCase().trim();
    ws.familyTourCode = tourCode;
    const room = getOrCreateRoom(tourCode, 'genel');
    const steps = getTourSteps(tourCode);
    sendRysSubscriptionAck(ctx, {
        type: 'family-state',
        tourCode,
        room: serializeRoom(room, false),
        steps,
        stats: computeJourneyStats(steps),
        announcements: db.announcements.filter((a) => a.tourCode === tourCode || a.tourCode === 'ALL')
      });
    return;
  }

  if (msg.type === 'join') {
    if (msg.role === 'guide' && !isAuthedClient) {
      ws.send(JSON.stringify({ type: 'auth-error', message: 'Rehber yayını başlatmak için yetkili girişi gereklidir.' }));
      return;
    }
    const tourCode = String(msg.tourCode || 'RY-KASIM').toUpperCase().trim();
    const roomId = String(msg.roomId || 'genel').trim();
    const role = msg.role === 'guide' ? 'guide' : 'pilgrim';
    const matchedTour = (db.tours || []).find((t) => String(t.code || '').toUpperCase() === tourCode);
    if (
      role !== 'guide' &&
      !isAuthedClient &&
      matchedTour &&
      matchedTour.pinProtected &&
      matchedTour.pin &&
      String(matchedTour.pin).trim() !== String(msg.pin || '').trim()
    ) {
      ws.send(JSON.stringify({ type: 'pin-error', message: 'Bu kafile odası PIN korumalıdır. Lütfen geçerli PIN kodunu giriniz.' }));
      return;
    }
    const prevRoom = ctx.currentRoom;
    const targetRoom = getOrCreateRoom(tourCode, roomId);
    ctx.currentRoom = targetRoom;
    const deviceId = msg.deviceId ? String(msg.deviceId).trim() : '';
    const previousSource=prevRoom===targetRoom?targetRoom.clients.get(clientId)?.audioSourceId:null;
    const clientObj = {
      ws,
      id: clientId,
      deviceId,
      audioSourceId:role==='guide'?(msg.audioSourceId||previousSource||clientId):null,
      role,
      name: msg.name || (role === 'guide' ? 'Ömer Ali Gültekin' : `Hacı Misafir #${clientSeq++}`),
      phone: msg.phone || '',
      lang: msg.lang || 'tr',
      joinedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };
    // 4G/5G hücre geçişlerinde aynı cihaza veya aynı rehbere ait yarı-açık (zombie) eski soketleri anında temizle
    for (const r of getTourRooms(tourCode)) {
      for (const [existingId, existingClient] of r.clients.entries()) {
        if (existingId === clientId || existingClient.ws === ws) continue;
        const sameDevice = Boolean(deviceId && existingClient.deviceId && existingClient.deviceId === deviceId);
        const sameGuide = Boolean(role === 'guide' && existingClient.role === 'guide' && r.roomId === roomId && existingClient.name === clientObj.name);
        if (sameDevice || sameGuide) {
          if(existingClient.ws?.isHttpRelay){
            const oldRelay=httpRelaySessions.get(existingId);
            if(oldRelay&&(oldRelay.relayKey||ctx.rysAckCapture))oldRelay.relayRetired=true;
          }
          r.clients.delete(existingId);
          if (r.activePublisherClientId === existingId) {
            r.activePublisherClientId = clientId;
          }
          try {
            if (existingClient.ws && !existingClient.ws.isHttpRelay && typeof existingClient.ws.terminate === 'function') {
              existingClient.ws.terminate();
            }
          } catch {}
        }
      }
    }
    targetRoom.clients.set(clientId, clientObj);
    if (prevRoom && prevRoom !== targetRoom) {
      removeClientFromRoom(prevRoom, clientId, 0);
    }
    if (role === 'guide' && guideDisconnectTimers.has(targetRoom.key)) {
      clearTimeout(guideDisconnectTimers.get(targetRoom.key));
      guideDisconnectTimers.delete(targetRoom.key);
    }
    if (role === 'guide' && msg.name) {
      for (const r of getTourRooms(tourCode)) {
        r.guideName = msg.name;
      }
    }

    const tourSteps = getTourSteps(tourCode);
    sendRysSubscriptionAck(ctx, {
        type: 'joined',
        clientId,
        room: serializeRoom(ctx.currentRoom, role === 'guide'),
        announcements: db.announcements.filter((a) => a.tourCode === tourCode || a.tourCode === 'ALL'),
        siyerPoints: db.siyerPoints,
        steps: tourSteps,
        stats: computeJourneyStats(tourSteps)
      });
    broadcastRoomState(ctx.currentRoom);
    return;
  }

  const currentRoom = ctx.currentRoom;
  if (!currentRoom) return;
  const sender = currentRoom.clients.get(clientId);
  if (!sender) return;

  switch (msg.type) {
    case 'guide-stream-state': {
      if (sender.role !== 'guide' || !isAuthedClient) break;
      if(!acceptRysAudioState(currentRoom,sender,clientId,msg))break;
      for (const r of getTargetBroadcastRooms(currentRoom)) {
        const wasLive = r.isLive;
        setRysAudioSource(r,sender.audioSourceId||clientId);r.audioStateKnown=true;
        r.audioStateSeq=msg.audioStateSeq||null;r.audioStateEnded=false;
        r.isLive = Boolean(msg.isLive);
        r.broadcastMode = msg.broadcastMode || (r.isLive ? 'mic' : 'idle');
        if (msg.topic) r.currentTopic = msg.topic;
        if (typeof msg.tawafStage !== 'undefined') r.activeTawafStage = msg.tawafStage || null;
        if (msg.guidePeerId) r.guidePeerId = msg.guidePeerId;
        if (r.isLive) {
          if (!wasLive || !r.startedAt) r.startedAt = Date.now();
          r.activePublisherClientId = clientId;
        } else if (!r.activePublisherClientId || r.activePublisherClientId === clientId) {
          r.activePublisherClientId = null;
        }
        broadcastToRoom(r, {
          type: 'stream-state',
          isLive: r.isLive,
          broadcastMode: r.broadcastMode,
          currentTopic: r.currentTopic,
          guidePeerId: r.guidePeerId || null,
        audioSourceId:r.audioSourceId||null,
        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded
        });
      }
      broadcastToFamilyTrackers(currentRoom.tourCode, {
        type: 'stream-state',
        isLive: currentRoom.isLive,
        broadcastMode: currentRoom.broadcastMode,
        currentTopic: currentRoom.currentTopic
      });
      broadcastToAdmins({
        type: 'admin-rooms-update',
        rooms: Array.from(liveRooms.values()).map((rm) => serializeRoom(rm, true))
      });
      break;
    }

    case 'tawaf-stage-update': {
      if (sender.role !== 'guide') break;
      const stagePayload = {
        id: msg.stageId || 'savt-1',
        badge: msg.badge || 'TAVAF AŞAMASI',
        title: msg.title || 'Tavaf & Sa’y Rehberliği',
        arabic: msg.arabic || '',
        reading: msg.reading || '',
        meaning: msg.meaning || '',
        note: msg.note || '',
        updatedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      };
      for (const r of getTargetBroadcastRooms(currentRoom)) {
        r.activeTawafStage = msg.clear ? null : stagePayload;
        if (!msg.clear && msg.topic) {
          r.currentTopic = msg.topic;
        }
        broadcastToRoom(r, {
          type: 'tawaf-stage',
          activeTawafStage: r.activeTawafStage,
          currentTopic: r.currentTopic
        });
      }
      broadcastToFamilyTrackers(currentRoom.tourCode, {
        type: 'tawaf-stage',
        activeTawafStage: msg.clear ? null : stagePayload,
        currentTopic: currentRoom.currentTopic
      });
      broadcastToAdmins({
        type: 'admin-rooms-update',
        rooms: Array.from(liveRooms.values()).map((rm) => serializeRoom(rm, true))
      });
      break;
    }

    case 'guide-location-update': {
      if (sender.role !== 'guide') break;
      if (msg.active) {
        currentRoom.guideLocation = {
          active: true,
          lat: Number(msg.lat) || 21.4225,
          lng: Number(msg.lng) || 39.8262,
          accuracy: msg.accuracy || null,
          address: msg.address || 'Canlı Rehber GPS Konumu',
          note: msg.note || '',
          guideName: msg.guideName || sender.name || currentRoom.guideName,
          updatedAt: msg.updatedAt || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        };
      } else {
        currentRoom.guideLocation = { active: false };
      }
      const locPayload = {
        type: 'guide-location',
        guideLocation: currentRoom.guideLocation
      };
      for (const r of getTourRooms(currentRoom.tourCode)) {
        r.guideLocation = currentRoom.guideLocation;
        broadcastToRoom(r, locPayload);
      }
      broadcastToFamilyTrackers(currentRoom.tourCode, locPayload);
      broadcastToAdmins({
        type: 'admin-rooms-update',
        rooms: Array.from(liveRooms.values()).map((rm) => serializeRoom(rm, true))
      });
      break;
    }

    case 'audio-chunk': {
      if (sender.role !== 'guide' || !isAuthedClient) break;
      if (
        currentRoom.activePublisherClientId &&
        currentRoom.activePublisherClientId !== clientId &&
        currentRoom.clients.has(currentRoom.activePublisherClientId)
      ) {
        break;
      }
      if(!acceptRysAudio(currentRoom,sender,clientId,!!msg.synthNote))break;
      if(msg.audioSourceId&&msg.audioSourceId!==(sender.audioSourceId||clientId))break;
      currentRoom.activePublisherClientId = clientId;
      const serializedAudio = JSON.stringify({
        type: 'audio-chunk',
        // PATCH: seq-v51
        seq: msg.seq ?? null,
        phraseStart: Boolean(msg.phraseStart),
        speakerId: clientId,
        audioSourceId:sender.audioSourceId||clientId,
        speakerName: sender.name,
        speakerRole: sender.role,
        sampleRate: msg.sampleRate || 24000,
        samples: msg.samples,
        pcm16: msg.pcm16 || null,
        level: msg.level || 0,
        synthNote: msg.synthNote || null,
        sentAt: msg.sentAt || Date.now()
      });
      for (const r of getTargetBroadcastRooms(currentRoom)) {
        setRysAudioSource(r,sender.audioSourceId||clientId);
        broadcastToRoom(r, serializedAudio, ws, true);
      }
      break;
    }

    case 'sos-trigger': {
      recordAndBroadcastSosAlert({
        id: msg.id,
        tourCode: currentRoom.tourCode,
        pilgrimName: sender.name || msg.pilgrimName,
        phone: sender.phone || msg.phone || '+90 538 000 00 00',
        lat: msg.lat,
        lng: msg.lng,
        accuracy: msg.accuracy,
        locationNote: msg.locationNote || 'Mescid-i Haram / Kâbe-i Muazzama Çevresi (Canlı GPS)'
      });
      break;
    }

    case 'quick-announcement': {
      if (sender.role !== 'guide') break;
      const ann = {
        id: `ann-${Date.now()}`,
        tourCode: currentRoom.tourCode,
        title: msg.title || 'Rehber Duyurusu',
        message: msg.message || '',
        sender: sender.name,
        createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        urgent: Boolean(msg.urgent)
      };
      db.announcements.unshift(ann);
      saveState(db);
      for (const r of getTourRooms(currentRoom.tourCode)) {
        broadcastToRoom(r, { type: 'new-announcement', announcement: ann });
      }
      broadcastToFamilyTrackers(currentRoom.tourCode, { type: 'new-announcement', announcement: ann });
      broadcastToAdmins({ type: 'new-announcement', announcement: ann });
      break;
    }

    case 'ping': {
      if (ws && ws.readyState === WebSocket.OPEN && !ws.isHttpRelay) {
        try {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now(), echoTs: msg.ts || null }));
        } catch {}
      }
      break;
    }
  }
}

function validBinaryPcmFrame(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length === 972 &&
    Number.isFinite(buf.readDoubleLE(4)) &&
    buf.readDoubleLE(4) > 0
  );
}

// v58: validate untrusted JSON before it can become room or handoff state.
function isRysClientMessage(message){
  if(!message||typeof message!=='object'||Array.isArray(message)||
    typeof message.type!=='string'||!message.type||message.type.length>64)return false;
  const strings=isRysClientMessage.stringFields||(isRysClientMessage.stringFields=new Set(['type','tourCode','roomId','role','name','phone','deviceId','lang','pin','token',
    'clientId','relayClientId','relayKey','handoffId','guidePeerId','stageId','badge','topic','title',
    'arabic','reading','meaning','note','address','guideName','pilgrimName','locationNote','id','alertId',
    'message','broadcastMode','updatedAt','_msgId','pcm16']));
  const forbidden=isRysClientMessage.forbiddenKeys||(isRysClientMessage.forbiddenKeys=
    new Set(['__proto__','prototype','constructor','toString','valueOf','toJSON']));
  const pending=[{value:message,depth:0}];let nodes=0,characters=0;
  try{
    while(pending.length){
      const {value,depth}=pending.pop();
      if(++nodes>4096||depth>8)return false;
      if(value===null)continue;
      if(typeof value==='string'){
        characters+=value.length;if(value.length>16384||characters>65536)return false;
      }else if(typeof value==='number'){
        if(!Number.isFinite(value))return false;
      }else if(typeof value==='boolean')continue;
      else if(typeof value==='object'){
        const keys=Object.keys(value);if(keys.length>512)return false;
        for(const key of keys){
          characters+=key.length;
          if(characters>65536||key.length>64||forbidden.has(key))return false;
          const next=value[key];
          if(next===undefined)continue; // Internal GET DTOs may contain omitted optional fields.
          if(strings.has(key)&&next!==null&&typeof next!=='string')return false;
          if(key==='audioStateSeq'&&next!==null&&(!Number.isSafeInteger(next)||next<1))return false;
          if(key==='audioSourceId'&&next!==null&&(typeof next!=='string'||next.length>128||
            !(/^[a-zA-Z0-9_.-]*$/).test(next)))return false;
          pending.push({value:next,depth:depth+1});
        }
      }else return false;
    }
    return true;
  }catch(e){return false;}
}

// WebSocket Connection Handler
wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.isAuthenticated = Boolean(req && isRequestAuthenticated(req));
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const ctx = {
    clientId: `client-${Date.now()}-${clientSeq++}`,
    ws,
    currentRoom: null,
    isAuthenticated: ws.isAuthenticated,
    rysHandshakeToken: extractAuthTokenFromReq(req)
  };

  const rejectInput=()=>{
    clearRysHandoff(ctx);
    try{ws.terminate();}catch(e){}
  };
  ws.on('error',rejectInput);
  ws.on('message', (raw, isBinary) => {
    try{
    ws.isAlive = true;
    // PATCH: binary-v51
    if (isBinary) {
      if (!ctx.currentRoom || !(ws.isAuthenticated || ctx.isAuthenticated)) return;
      const sender = ctx.currentRoom.clients.get(ctx.clientId);
      if (!sender || sender.role !== 'guide') return;
      if (
        ctx.currentRoom.activePublisherClientId &&
        ctx.currentRoom.activePublisherClientId !== ctx.clientId &&
        ctx.currentRoom.clients.has(ctx.currentRoom.activePublisherClientId)
      ) {
        return;
      }

      if(!acceptRysAudio(ctx.currentRoom,sender,ctx.clientId))return;
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      if (!validBinaryPcmFrame(buf)) return;
      ctx.currentRoom.activePublisherClientId = ctx.clientId;
      let fallbackPayload = null;

      for (const r of getTargetBroadcastRooms(ctx.currentRoom)) {
        setRysAudioSource(r,sender.audioSourceId||ctx.clientId);
        for (const peer of r.clients.values()) {
          if (peer.ws === ws || peer.ws.readyState !== WebSocket.OPEN) continue;
          if (!peer.ws.isHttpRelay) {
            rysSendAudio(peer.ws,buf,true);
          } else if (buf.length > 12) {
            if (!fallbackPayload) {
              const rawSeq = buf.readUInt32LE(0);
              const phraseStart = Boolean(rawSeq & 0x80000000);
              const seq = rawSeq & 0x7fffffff;
              const sentAt = buf.readDoubleLE(4);
              const pcmSlice = buf.subarray(12);
              fallbackPayload = {
                type: 'audio-chunk',
                seq,
                phraseStart,
                speakerId: ctx.clientId,
                audioSourceId:sender.audioSourceId||ctx.clientId,
                speakerName: sender.name,
                speakerRole: sender.role,
                sampleRate: 24000,
                pcm16: pcmSlice.toString('base64'),
                level: 0.35,
                sentAt
              };
            }
            rysSendAudio(peer.ws,fallbackPayload,false);
          }
        }
      }
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if(!isRysClientMessage(msg)){rejectInput();return;}
    if(handleRysNativeHandoff(ctx,msg))return;
    processClientJsonMessage(ctx, msg);
    }catch(e){rejectInput();}
  });

  ws.on('close', () => {
    clearRysHandoff(ctx);
    if (ctx.currentRoom) {
      removeClientFromRoom(ctx.currentRoom, ctx.clientId);
    }
  });
});

// 30-Second Ping/Pong Heartbeat to prune zombie/dropped connections from mobile networks
const heartbeatTimer = setInterval(() => {
  cleanupStaleRelaySessions();
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatTimer);
});

// Serverless HTTP Realtime Relay Endpoint (Vercel Fallback)
// PATCH: server-outbox-v50
function getOrCreateRelaySession(clientId) {
  cleanupStaleRelaySessions();
  const cid = String(clientId || `relay-${Date.now()}-${clientSeq++}`);
  if (!httpRelaySessions.has(cid)) {
    const sess = {
      clientId: cid,
      outbox: [],
      currentRoom: null,
      lastSeen: Date.now(),
      isAuthenticated: false,
      ws: {
        isHttpRelay: true,
        isAdmin: false,
        isAuthenticated: false,
        readyState: WebSocket.OPEN,
        send(data) {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            const now = Date.now();
            // Store internal envelopes; never trust remote sentAt for queue TTL.
            sess.outbox = sess.outbox.filter((e) => e.message.type !== 'audio-chunk' || now - e.at <= 200);
            if (parsed.type === 'audio-chunk') {
              const audio = sess.outbox.filter((e) => e.message.type === 'audio-chunk');
              if (audio.length >= 10) {
                const oldest = sess.outbox.findIndex((e) => e.message.type === 'audio-chunk');
                sess.outbox.splice(oldest, 1);
              }
            } else if (sess.outbox.filter((e) => e.message.type !== 'audio-chunk').length >= 64) {
              const oldest = sess.outbox.findIndex((e) => e.message.type !== 'audio-chunk');
              sess.outbox.splice(oldest, 1);
            }
            sess.outbox.push({ at: now, message: parsed });
          } catch (e) {}
        }
      }
    };
    httpRelaySessions.set(cid, sess);
  }
  const session = httpRelaySessions.get(cid);
  session.lastSeen = Date.now();
  return session;
}

function drainRysRelaySession(sess) {
  const now = Date.now();
  return sess.outbox
    .splice(0)
    .filter((e) => e.message.type !== 'audio-chunk' || now - e.at <= 200)
    .map((e) => e.message);
}

// v56: opaque HTTP sessions; opening never joins a room or executes messages.
function openRysRelay56(res){
  const s=getOrCreateRelaySession('rys56-'+crypto.randomBytes(18).toString('hex'));
  s.relayKey=crypto.randomBytes(24).toString('hex');
  s.relayRevision=0;s.relayDigest=null;s.relayRetired=false;
  return res.json({type:'relay-opened',clientId:s.clientId,relayKey:s.relayKey});
}
function closeRysRelay56(req,res){
  const s=httpRelaySessions.get(String(req.body?.clientId||''));
  const a=String(req.body?.relayKey||''),b=String(s?.relayKey||'');
  if(!s||!/^[0-9a-f]{48}$/.test(a)||!/^[0-9a-f]{48}$/.test(b)||
    !crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b)))
    return res.status(401).json({error:'relay-key-required'});
  s.relayRetired=true;s.ws.isAdmin=false;s.ws.familyTourCode=null;
  if(s.currentRoom?.clients.has(s.clientId))removeClientFromRoom(s.currentRoom,s.clientId,0);
  return res.json({closed:true});
}
function resolveRysRelay(req,res,input){
  const id=String(input?.clientId||'');
  let s=httpRelaySessions.get(id);
  if(id.startsWith('rys56-')){
    if(!s){res.status(409).json({error:'relay-session-expired'});return null;}
    const supplied=String((req.method==='GET'?null:input?.relayKey)||req.headers?.['x-rys-relay-key']||'');
    const expected=String(s.relayKey||'');
    if(!/^[0-9a-f]{48}$/.test(supplied)||!/^[0-9a-f]{48}$/.test(expected)||
      !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))){
      res.status(401).json({error:'relay-key-required'});return null;
    }
    if(Date.now()-s.lastSeen>35000){
      httpRelaySessions.delete(id);
      if(s.currentRoom)removeClientFromRoom(s.currentRoom,id);
      res.status(409).json({error:'relay-session-expired'});return null;
    }
  }else s=s||getOrCreateRelaySession(id);
  if(s.relayRetired){res.status(409).json({error:'relay-session-retired'});return null;}
  s.lastSeen=Date.now();return s;
}
function digestRysSubscription(m){
  if(!m)return null;
  return crypto.createHash('sha256').update(JSON.stringify([
    m.type,String(m.tourCode||'RY-KASIM').toUpperCase().trim(),
    String(m.roomId||'genel').trim(),m.role==='guide'?'guide':'pilgrim',
    m.name||'',m.deviceId===undefined?null:String(m.deviceId).trim(),
    m.phone===undefined?null:m.phone,m.lang===undefined?null:m.lang,
    m.pin===undefined?null:String(m.pin),m.token||'',m.audioSourceId||null
  ])).digest('hex');
}
function sendRysSubscriptionAck(ctx,payload){
  if(ctx.rysAckCapture)ctx.rysAckCapture.ack=payload;
  else ctx.ws.send(JSON.stringify(payload));
}
function clearRysHandoff(ctx){
  if(ctx.rysHandoff?.timer)clearTimeout(ctx.rysHandoff.timer);
  ctx.rysHandoff=null;
}
function validateRysHandoff(ctx,request){
  const authed=!!(isValidAuthToken(request.token)||isValidAuthToken(ctx.rysHandshakeToken));
  ctx.isAuthenticated=authed;ctx.ws.isAuthenticated=authed;
  if((request.type==='admin-subscribe'||request.type==='join'&&request.role==='guide')&&!authed)
    return 'auth-required';
  if(request.type==='join'&&request.role!=='guide'&&!authed){
    const code=String(request.tourCode||'RY-KASIM').toUpperCase().trim();
    const tour=(db.tours||[]).find(t=>String(t.code||'').toUpperCase()===code);
    if(tour?.pinProtected&&tour.pin&&String(tour.pin).trim()!==String(request.pin||'').trim())
      return 'pin-required';
  }
  return null;
}
function handleRysNativeHandoff(ctx,msg){
  if(!['handoff-prepare','handoff-commit','handoff-cancel'].includes(msg?.type))return false;
  const reply=payload=>ctx.ws.send(JSON.stringify(payload));
  const fail=code=>{clearRysHandoff(ctx);reply({type:'handoff-error',code});};
  if(msg.type==='handoff-cancel'){clearRysHandoff(ctx);return true;}
  if(msg.type==='handoff-prepare'){
    if(ctx.currentRoom||ctx.ws.isAdmin||ctx.ws.familyTourCode){fail('probe-already-subscribed');return true;}
    const raw=msg.subscription;
    if(!raw||!['join','family-subscribe','admin-subscribe'].includes(raw.type)||
      JSON.stringify(raw).length>8192){fail('invalid-subscription');return true;}
    const request=JSON.parse(JSON.stringify(raw));
    const invalid=validateRysHandoff(ctx,request);if(invalid){fail(invalid);return true;}
    let source=null;
    if(msg.relayClientId){
      source=httpRelaySessions.get(String(msg.relayClientId));
      const a=String(msg.relayKey||''),b=String(source?.relayKey||'');
      if(!source||source.relayRetired||!/^[0-9a-f]{48}$/.test(a)||!/^[0-9a-f]{48}$/.test(b)||
        !crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))){
        fail('stale-relay');return true;
      }
      if(!source.relayDigest||source.relayDigest!==digestRysSubscription(request)){
        fail('context-changed');return true;
      }
      // Transfer optional identity fields from this same existing HTTP membership.
      if(request.type==='join'){
        const previous=source.currentRoom?.clients.get(source.clientId);
        if(!previous){fail('source-not-joined');return true;}
        request.name=request.name||previous.name;
        for(const key of ['deviceId','phone','lang','audioSourceId'])
          if(request[key]===undefined)request[key]=previous[key];
      }
    }
    clearRysHandoff(ctx);
    const pending={id:crypto.randomBytes(16).toString('hex'),request,source,
      revision:source?.relayRevision||0,digest:source?.relayDigest||null,expires:Date.now()+3000};
    pending.timer=setTimeout(()=>{
      if(ctx.rysHandoff===pending){ctx.rysHandoff=null;reply({type:'handoff-error',code:'prepare-expired'});}
    },3000);pending.timer.unref?.();
    ctx.rysHandoff=pending;
    reply({type:'handoff-prepared',handoffId:pending.id});return true;
  }
  if(ctx.rysCommittedHandoff?.id===msg.handoffId){
    ctx.ws.send(ctx.rysCommittedHandoff.envelope);return true; // Idempotent retry; no second join.
  }
  const p=ctx.rysHandoff;
  if(!p||p.id!==msg.handoffId||Date.now()>p.expires){fail('prepare-expired');return true;}
  if(p.source&&(httpRelaySessions.get(p.source.clientId)!==p.source||p.source.relayRetired||
    p.source.relayRevision!==p.revision||p.source.relayDigest!==p.digest||
    p.request.type==='join'&&!p.source.currentRoom?.clients.has(p.source.clientId))){
    fail('context-changed');return true;
  }
  const invalid=validateRysHandoff(ctx,p.request);if(invalid){fail(invalid);return true;}
  const capture={ack:null};ctx.rysAckCapture=capture;
  try{
    // No await in this transaction: membership transfer and source fencing are one event-loop turn.
    processClientJsonMessage(ctx,p.request);
    const expected=p.request.type==='join'?'joined':
      p.request.type==='family-subscribe'?'family-state':'admin-rooms-update';
    if(capture.ack?.type!==expected){fail('subscription-rejected');return true;}
    if(p.source){
      p.source.relayRetired=true;p.source.ws.isAdmin=false;p.source.ws.familyTourCode=null;
      if(p.source.currentRoom?.clients.has(p.source.clientId))
        removeClientFromRoom(p.source.currentRoom,p.source.clientId,0);
    }
    if(p.request.type==='join')capture.ack.room=serializeRoom(ctx.currentRoom,p.request.role==='guide');
    const envelope=JSON.stringify({type:'handoff-committed',handoffId:p.id,ack:capture.ack});
    ctx.rysCommittedHandoff={id:p.id,envelope};
    clearRysHandoff(ctx);ctx.ws.send(envelope);
  }catch(e){
    clearRysHandoff(ctx);
    try{reply({type:'handoff-error',code:'commit-failed'});}catch(ignore){}
    try{ctx.ws.close();}catch(ignore){}
  }finally{ctx.rysAckCapture=null;}
  return true;
}

// PATCH: relay-auth-v53
function applyRysRelayAuth(session,req,token,context){
  const authenticated=!!(isRequestAuthenticated(req)||isValidAuthToken(token)||isValidAuthToken(context?.token));
  const client=session.currentRoom?.clients.get(session.clientId);
  session.isAuthenticated=authenticated;session.ws.isAuthenticated=authenticated;
  return authenticated||!(client?.role==='guide'||session.ws.isAdmin||
    context?.role==='guide'||context?.type==='admin-subscribe');
}
function syncRysRelayJoin(session,joinContext){
  if(!joinContext||joinContext.type!=='join')return true;
  const code=String(joinContext.tourCode||'RY-KASIM').toUpperCase().trim();
  const room=String(joinContext.roomId||'genel').trim(),role=joinContext.role==='guide'?'guide':'pilgrim';
  const matches=()=>session.currentRoom?.tourCode===code&&session.currentRoom?.roomId===room&&
    session.currentRoom.clients.get(session.clientId)?.role===role;
  const metadataMatches=()=>{
    const c=session.currentRoom?.clients.get(session.clientId);if(!c)return false;
    if(joinContext.name&&c.name!==joinContext.name)return false;
    if(role==='guide'&&joinContext.audioSourceId&&c.audioSourceId!==joinContext.audioSourceId)return false;
    for(const key of ['deviceId','phone','lang']){
      if(joinContext[key]===undefined)continue;
      const wanted=key==='lang'?(joinContext.lang||'tr'):
        key==='deviceId'?String(joinContext.deviceId||'').trim():(joinContext.phone||'');
      if((c[key]||(key==='lang'?'tr':''))!==wanted)return false;
    }
    return true;
  };
  if(!matches()||!metadataMatches()){
    const previous=matches()?session.currentRoom.clients.get(session.clientId):null;
    // Preserve omitted metadata only for this existing room/role membership.
    // PIN/token are never inherited, and another room/role gets no old identity.
    const effective=previous?{
      ...joinContext,
      name:joinContext.name||previous.name,
      deviceId:joinContext.deviceId===undefined?previous.deviceId:joinContext.deviceId,
      phone:joinContext.phone===undefined?previous.phone:joinContext.phone,
      lang:joinContext.lang===undefined?previous.lang:joinContext.lang,
      audioSourceId:joinContext.audioSourceId===undefined?previous.audioSourceId:joinContext.audioSourceId
    }:joinContext;
    processClientJsonMessage(session,effective);
  }
  return !!(matches()&&metadataMatches());
}

// v54: actual subscription type, without a fabricated pilgrim join.
function syncRysRelayContext(session,context){
  if(!context)return true;
  if(context.type==='join'){
    if(!syncRysRelayJoin(session,context))return false;
    session.ws.isAdmin=false;session.ws.familyTourCode=null;
    return true;
  }
  if(context.type!=='family-subscribe'&&context.type!=='admin-subscribe')return false;
  if(session.currentRoom){
    const old=session.currentRoom;session.currentRoom=null;
    removeClientFromRoom(old,session.clientId,0);
  }
  if(context.type==='admin-subscribe'){
    session.ws.familyTourCode=null;
    if(!session.ws.isAdmin)processClientJsonMessage(session,context);
    return !!session.ws.isAdmin;
  }
  const code=String(context.tourCode||'RY-KASIM').toUpperCase().trim();
  session.ws.isAdmin=false;
  if(session.ws.familyTourCode!==code)processClientJsonMessage(session,{...context,tourCode:code});
  return session.ws.familyTourCode===code;
}

// v62: an ordered opaque session cannot apply an older HTTP body after a newer one.
function acceptRysRelayRequestOrder(session,input,res){
  if(!session.relayKey)return true; // Keep the legacy public-ID protocol compatible.
  const raw=input?.requestSeq;
  if(raw===undefined){
    if(session.lastRequestSeq===undefined)return true;
    res.status(409).json({error:'relay-request-order-required'});return false;
  }
  const seq=typeof raw==='string'&&/^[1-9][0-9]{0,15}$/.test(raw)?Number(raw):raw;
  if(!Number.isSafeInteger(seq)||seq<1){res.status(400).json({error:'relay-invalid-order'});return false;}
  if(seq<=(session.lastRequestSeq||0)){res.status(409).json({error:'relay-request-stale'});return false;}
  session.lastRequestSeq=seq;return true;
}

function serveRysRelay(session,req,res,token,context,messages=[]){
  if((context&&!isRysClientMessage(context))||!Array.isArray(messages)||messages.length>128||
    !messages.every(isRysClientMessage))return res.status(400).json({error:'relay-invalid-message'});
  if(context&&!['join','family-subscribe','admin-subscribe'].includes(context.type))
    return res.status(400).json({error:'relay-context-invalid'});
  if(!acceptRysRelayRequestOrder(session,req.method==='GET'?req.query:req.body,res))return;
  if(!applyRysRelayAuth(session,req,token,context))
    return res.status(401).json({error:'relay-auth-required'});
  if(!syncRysRelayContext(session,context)){
    const errors=drainRysRelaySession(session).filter(m=>m.type==='pin-error'||m.type==='auth-error');
    return res.json({clientId:session.clientId,messages:errors.length?errors:
      [{type:'pin-error',message:'Kafile/oda katılımı reddedildi; PIN ve yetkiyi kontrol edin.'}]});
  }
  if(session.relayKey&&context){
    const digest=digestRysSubscription(context);
    if(session.relayDigest!==digest){session.relayDigest=digest;session.relayRevision=(session.relayRevision||0)+1;}
  }
  if(session.relayKey&&!context&&messages.some(m=>['join','family-subscribe','admin-subscribe'].includes(m?.type)))
    return res.status(400).json({error:'relay-context-required'});
  for(const m of messages){
    if(!m||typeof m!=='object')continue;
    // Explicit context is the latest subscription. Do not replay stale queued joins.
    if(context&&['join','family-subscribe','admin-subscribe'].includes(m.type))continue;
    processClientJsonMessage(session,m);
  }
  return res.json({clientId:session.clientId,messages:drainRysRelaySession(session)});
}

app.post('/api/ws-relay',(req,res)=>{
  if(['clientId','relayKey','token'].some(k=>req.body?.[k]!=null&&
    (typeof req.body[k]!=='string'||req.body[k].length>16384)))
    return res.status(400).json({error:'relay-invalid-credentials'});
  if(req.body?.messages!==undefined&&!Array.isArray(req.body.messages))
    return res.status(400).json({error:'relay-invalid-message'});
  if(['relay-open','relay-close'].includes(req.body?.type)&&!isRysClientMessage(req.body))
    return res.status(400).json({error:'relay-invalid-message'});
  if(req.body?.type==='relay-open'&&req.body.version===56)return openRysRelay56(res);
  if(req.body?.type==='relay-close'&&req.body.version===56)return closeRysRelay56(req,res);
  const {clientId,messages,joinContext,subscriptionContext,token}=req.body||{};
  const context=subscriptionContext||joinContext||null;
  const list=Array.isArray(messages)?messages:req.body?.message?[req.body.message]:[];
  const session=resolveRysRelay(req,res,req.body||{});if(!session)return;
  return serveRysRelay(session,req,res,token,context,list);
});
app.get('/api/ws-relay',(req,res)=>{
  if(['clientId','relayKey','token'].some(k=>req.query?.[k]!=null&&
    (typeof req.query[k]!=='string'||req.query[k].length>16384)))
    return res.status(400).json({error:'relay-invalid-credentials'});
  // Legacy GET is retained. Existing joined sessions need not repeat their PIN.
  const q=req.query,mode=q.subscription||'join';
  const context=mode==='admin-subscribe'?{type:mode,token:q.token}:
    mode==='family-subscribe'?{type:mode,tourCode:q.tourCode||'RY-KASIM'}:
    mode!=='join'?{type:mode}:
    q.tourCode?{type:'join',tourCode:q.tourCode,roomId:q.roomId||'genel',role:q.role||'pilgrim',
      name:q.name||'',pin:q.pin||'',token:q.token,
      ...(q.deviceId!==undefined?{deviceId:q.deviceId}:{}),
      ...(q.phone!==undefined?{phone:q.phone}:{}),...(q.lang!==undefined?{lang:q.lang}:{}),
      ...(q.audioSourceId!==undefined?{audioSourceId:q.audioSourceId}:{})}:null;
  const session=resolveRysRelay(req,res,q);if(!session)return;
  return serveRysRelay(session,req,res,q.token,context);
});

// ======================== REST API ENDPOINTS ========================

// 1. Auth Endpoints (Rehber Yayını & Acente Paneli Yetkili Girişi)
function requireAuth(req, res, next) {
  if (!isRequestAuthenticated(req)) {
    return res.status(401).json({
      success: false,
      message: 'Bu işlem için yetkili (Rehber / Acente) oturumu gereklidir.'
    });
  }
  return next();
}

app.post('/api/login', loginRateLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();

  if (!cleanEmail || !cleanPass) {
    return res.status(400).json({
      success: false,
      message: 'Kullanıcı adı (e-posta) ve şifre alanı zorunludur.'
    });
  }

  let user = null;
  if (cleanEmail === ADMIN_USERNAME && verifyPassword(cleanPass, ADMIN_PASSWORD_ENV, ADMIN_PASSWORD_SHA256)) {
    user = {
      id: 'admin-1',
      name: 'Rıdvan Yılmaz Turizm (Yetkili)',
      email: ADMIN_USERNAME,
      role: 'agency_admin',
      agency: db.agency.name,
      assignedTour: null
    };
  } else if (
    (cleanEmail === 'info@selametturizm.com' || cleanEmail === 'selamet@selametturizm.com' || cleanEmail === 'selamet') &&
    verifyPassword(cleanPass, SELAMET_PASSWORD_ENV, SELAMET_PASSWORD_SHA256)
  ) {
    user = {
      id: 'agency-selamet',
      name: 'Selamet Turizm (Yetkili)',
      email: 'info@selametturizm.com',
      role: 'agency',
      agency: 'Selamet Turizm',
      assignedTour: 'RY-KASIM'
    };
  } else {
    return res.status(401).json({
      success: false,
      message: 'Kullanıcı adı veya şifre hatalı! Lütfen yetkili giriş bilgilerinizi kontrol ediniz.'
    });
  }

  const sessionToken = createAuthSession(user);
  const isSecure = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${sessionToken}; Path=/; Max-Age=2592000; SameSite=Lax${isSecure ? '; Secure' : ''}`
  );

  return res.json({
    success: true,
    token: sessionToken,
    user
  });
});

app.post('/api/logout', (req, res) => {
  const tok = extractAuthTokenFromReq(req);
  if (tok) revokeAuthToken(tok);
  res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`);
  return res.json({ success: true });
});

app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body || {};
  const cleanEmail = String(email || '').trim();
  return res.json({
    success: true,
    message: `${cleanEmail || 'Yetkili hesabınız'} için şifre yenileme talebiniz kaydedildi. Güvenlik nedeniyle yetkili şifre sıfırlama işlemleri Rıdvan Yılmaz Turizm Merkez Ofisi (+90 538 399 96 66) tarafından gerçekleştirilmektedir.`
  });
});

app.post('/api/demo-request', demoRequestRateLimiter, (req, res) => {
  const { name, company_name, phone, email, message } = req.body || {};
  if (!db.requests) db.requests = [];
  const item = {
    id: `req-${Date.now()}`,
    name: name || 'İsimsiz Başvuru',
    company_name: company_name || 'Belirtilmedi',
    phone: phone || '',
    email: email || '',
    message: message || '',
    createdAt: new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
  };
  db.requests.unshift(item);
  saveState(db);
  broadcastToAdmins({ type: 'new-request', request: item, requests: db.requests });
  return res.json({
    success: true,
    request: item,
    message: 'Talebiniz Rıdvan Yılmaz Turizm operasyon ekibine (Beytullah Bey) iletilmiştir.'
  });
});

app.delete('/api/requests/:id', requireAuth, (req, res) => {
  const authedUser = getAuthenticatedUser(req);
  if (authedUser && authedUser.assignedTour) {
    return res.status(403).json({ success: false, message: 'Bu işlem yalnızca ana acente yöneticisi tarafından yapılabilir.' });
  }
  if (!db.requests) db.requests = [];
  const targetId = req.params.id;
  const prevLen = db.requests.length;
  db.requests = db.requests.filter((r) => r.id !== targetId);
  if (db.requests.length === prevLen) {
    return res.status(404).json({ success: false, message: 'Silinecek ön kayıt talebi bulunamadı.' });
  }
  saveState(db);
  broadcastToAdmins({ type: 'requests-updated', requests: db.requests });
  return res.json({ success: true, requests: db.requests });
});

// 2. Bootstrap & System Overview
app.get('/api/bootstrap', (req, res) => {
  ensureJourneySteps();
  const authedUser = getAuthenticatedUser(req);
  const isAuthed = Boolean(authedUser);
  const assignedCode = authedUser && authedUser.assignedTour ? String(authedUser.assignedTour).toUpperCase() : null;

  const rawTours = assignedCode
    ? (db.tours || []).filter((t) => String(t.code || '').toUpperCase() === assignedCode)
    : db.tours || [];
  const toursPayload = isAuthed
    ? rawTours
    : rawTours.map((t) => sanitizeTourForPublic(t));

  const guidesPayload = isAuthed
    ? db.guides
    : (db.guides || []).map((g) => sanitizeGuideForPublic(g));

  const sosPayload = !isAuthed
    ? []
    : assignedCode
      ? (db.sosAlerts || []).filter((s) => String(s.tourCode || '').toUpperCase() === assignedCode)
      : db.sosAlerts;

  const requestsPayload = !isAuthed || assignedCode ? [] : db.requests || [];

  const liveRoomsList = Array.from(liveRooms.values())
    .filter((r) => !assignedCode || String(r.tourCode || '').toUpperCase() === assignedCode)
    .map((r) => serializeRoom(r, isAuthed));

  res.json({
    agency: db.agency,
    tours: toursPayload,
    guides: guidesPayload,
    hotels: db.hotels,
    announcements: db.announcements,
    sosAlerts: sosPayload,
    requests: requestsPayload,
    siyerPoints: db.siyerPoints,
    journeySteps: db.journeySteps,
    liveRooms: liveRoomsList
  });
});

// 3. Pilgrim Join Validation
app.post('/api/join-tour', joinTourRateLimiter, (req, res) => {
  const { code, pin } = req.body || {};
  const cleanCode = String(code || '').toUpperCase().trim();
  const tour = db.tours.find((t) => t.code.toUpperCase() === cleanCode);
  if (!tour) {
    return res.status(404).json({
      success: false,
      message: `"${cleanCode}" koduna ait aktif bir Rıdvan Yılmaz Turizm kafilesi bulunamadı. Lütfen geçerli kafile kodunu giriniz (Örn: RY-KASIM).`
    });
  }
  if (tour.pinProtected && tour.pin && String(tour.pin) !== String(pin || '').trim()) {
    return res.status(403).json({
      success: false,
      message: 'Bu kafile odası PIN korumalıdır. Lütfen geçerli PIN kodunu giriniz.'
    });
  }
  const roomState = serializeRoom(getOrCreateRoom(tour.code, 'genel'), false);
  const steps = getTourSteps(tour.code);
  const stats = computeJourneyStats(steps);
  return res.json({
    success: true,
    tour: sanitizeTourForPublic(tour),
    room: roomState,
    announcements: db.announcements.filter((a) => a.tourCode === tour.code || a.tourCode === 'ALL'),
    siyerPoints: db.siyerPoints,
    steps,
    stats
  });
});

// 4. Tour CRUD (Agency Panel)
app.post('/api/tours', requireAuth, (req, res) => {
  const authedUser = getAuthenticatedUser(req);
  if (authedUser && authedUser.assignedTour) {
    return res.status(403).json({ success: false, message: 'Alt acente hesabı yeni kafile oluşturamaz.' });
  }
  const body = req.body || {};
  const code = String(body.code || `RY-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase().trim();
  if (db.tours.some((t) => String(t.code || '').toUpperCase() === code)) {
    return res.status(400).json({
      success: false,
      message: `"${code}" kafile kodu zaten kullanımda. Lütfen farklı bir kafile kodu belirleyiniz.`
    });
  }
  const newTour = {
    id: `tour-${Date.now()}`,
    code,
    name: body.name || 'Yeni Siyer Umresi Kafilesi',
    dateText: body.dateText || '2026 - 2027 Sezonu',
    duration: body.duration || '15 Gün',
    guideId: body.guideId || 'guide-1',
    guideName: body.guideName || 'Rıdvan Yılmaz Hoca',
    makkahHotel: body.makkahHotel || 'Mekke Otel Kudi Tower',
    madinahHotel: body.madinahHotel || 'Medine Merkezi Ravza Oteli',
    pin: body.pin || '',
    pinProtected: Boolean(body.pin),
    status: body.status || 'active',
    capacity: Number(body.capacity) || 100,
    registeredCount: Number(body.registeredCount) || 1,
    description: body.description || 'Rıdvan Yılmaz Turizm Siyer Umresi Kafilesi',
    rooms: [
      { id: 'genel', name: 'Genel Kafile & Tavaf Yayını', guide: body.guideName || 'Rıdvan Yılmaz Hoca', active: true },
      { id: 'siyer', name: 'Siyer-i Nebi Sohbet Odası', guide: body.guideName || 'Rıdvan Yılmaz Hoca', active: true }
    ]
  };
  db.tours.unshift(newTour);
  if (newTour.guideName && !db.guides.some((g) => g.name.toLowerCase() === newTour.guideName.toLowerCase())) {
    db.guides.push({
      id: `guide-${Date.now()}`,
      name: newTour.guideName,
      title: 'Kafile İrşad Rehberi',
      phone: '+90 538 399 96 66',
      email: `rehber${Date.now()}@ridvanyilmazturizm.com`,
      specialty: 'Siyer ve Umre Rehberliği',
      status: 'online',
      assignedTour: newTour.code
    });
  }
  ensureJourneySteps();
  if (!db.journeySteps[newTour.code]) {
    db.journeySteps[newTour.code] = buildDefaultStepsForTour(newTour);
  }
  saveState(db);
  getOrCreateRoom(newTour.code, 'genel');
  getOrCreateRoom(newTour.code, 'siyer');
  broadcastToAdmins({
    type: 'admin-rooms-update',
    rooms: Array.from(liveRooms.values()).map((r) => serializeRoom(r, true))
  });
  res.json({ success: true, tour: newTour, steps: db.journeySteps[newTour.code] });
});

app.patch('/api/tours/:id', requireAuth, (req, res) => {
  const targetId = String(req.params.id || '').trim();
  const tour = db.tours.find((t) => t.id === targetId || t.code.toUpperCase() === targetId.toUpperCase());
  if (!tour) {
    return res.status(404).json({ success: false, message: 'Düzenlenecek kafile bulunamadı.' });
  }
  const authedUser = getAuthenticatedUser(req);
  if (authedUser && authedUser.assignedTour && String(tour.code || '').toUpperCase() !== String(authedUser.assignedTour).toUpperCase()) {
    return res.status(403).json({ success: false, message: 'Yalnızca kendi acentenize atanmış kafileyi düzenleyebilirsiniz.' });
  }
  const body = req.body || {};
  if (typeof body.name === 'string' && body.name.trim()) tour.name = body.name.trim();
  if (typeof body.dateText === 'string' && body.dateText.trim()) tour.dateText = body.dateText.trim();
  if (typeof body.duration === 'string' && body.duration.trim()) tour.duration = body.duration.trim();
  if (typeof body.guideName === 'string' && body.guideName.trim()) {
    tour.guideName = body.guideName.trim();
    if (!db.guides.some((g) => g.name.toLowerCase() === tour.guideName.toLowerCase())) {
      db.guides.push({
        id: `guide-${Date.now()}`,
        name: tour.guideName,
        title: 'Kafile İrşad Rehberi',
        phone: '+90 538 399 96 66',
        email: `rehber${Date.now()}@ridvanyilmazturizm.com`,
        specialty: 'Siyer ve Umre Rehberliği',
        status: 'online',
        assignedTour: tour.code
      });
    }
    if (Array.isArray(tour.rooms)) {
      tour.rooms.forEach((rm) => {
        rm.guide = tour.guideName;
      });
    }
    for (const r of getTourRooms(tour.code)) {
      r.guideName = tour.guideName;
      r.tourName = tour.name;
    }
  }
  if (typeof body.makkahHotel === 'string' && body.makkahHotel.trim()) tour.makkahHotel = body.makkahHotel.trim();
  if (typeof body.madinahHotel === 'string' && body.madinahHotel.trim()) tour.madinahHotel = body.madinahHotel.trim();
  if (typeof body.description === 'string') tour.description = body.description.trim();
  if (typeof body.status === 'string' && body.status.trim()) tour.status = body.status.trim();
  if (body.capacity !== undefined && Number.isFinite(Number(body.capacity))) {
    tour.capacity = Math.max(1, Number(body.capacity));
  }
  if (body.registeredCount !== undefined && Number.isFinite(Number(body.registeredCount))) {
    tour.registeredCount = Math.max(0, Number(body.registeredCount));
  }
  if (typeof body.pin === 'string') {
    tour.pin = body.pin.trim();
    tour.pinProtected = Boolean(tour.pin);
  }

  for (const r of getTourRooms(tour.code)) {
    r.tourName = tour.name;
  }
  saveState(db);
  const firstRoom = getTourRooms(tour.code)[0];
  if (firstRoom) {
    broadcastRoomState(firstRoom);
  } else {
    broadcastToAdmins({
      type: 'admin-rooms-update',
      rooms: Array.from(liveRooms.values()).map((r) => serializeRoom(r, true))
    });
  }
  return res.json({ success: true, tour });
});

app.delete('/api/tours/:id', requireAuth, (req, res) => {
  const authedUser = getAuthenticatedUser(req);
  if (authedUser && authedUser.assignedTour) {
    return res.status(403).json({ success: false, message: 'Alt acente hesabı kafile silemez.' });
  }
  const targetId = req.params.id;
  const deletedTour = db.tours.find((t) => t.id === targetId || t.code === targetId);
  const deletedCode = deletedTour ? deletedTour.code : targetId;
  db.tours = db.tours.filter((t) => t.id !== targetId && t.code !== targetId);
  if (deletedCode) {
    db.announcements = db.announcements.filter((a) => a.tourCode !== deletedCode);
    if (db.journeySteps && db.journeySteps[deletedCode]) {
      delete db.journeySteps[deletedCode];
    }
    for (const [key, room] of liveRooms.entries()) {
      if (room.tourCode === deletedCode) {
        liveRooms.delete(key);
      }
    }
  }
  saveState(db);
  broadcastToAdmins({
    type: 'admin-rooms-update',
    rooms: Array.from(liveRooms.values()).map((r) => serializeRoom(r, true))
  });
  res.json({ success: true });
});

// 4B. Polarsteps-Inspired Spiritual Journey Steps Engine (Rota & Adımlar)
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

app.get('/api/trips/:code/steps', (req, res) => {
  const code = String(req.params.code || 'RY-KASIM').toUpperCase().trim();
  const rawTour = db.tours.find((t) => t.code.toUpperCase() === code) || db.tours[0] || {
    code,
    name: 'Kasım Umresi Kafilesi',
    guideName: 'Ömer Ali Gültekin',
    dateText: 'Kasım 2026 • 10 Gün',
    duration: '10 Gün (8 Mekke + 2 Medine)',
    makkahHotel: 'Mekke Otel Kudi Tower',
    madinahHotel: '2 Gün Medine Konaklama (Merkezi Bölge)'
  };
  const tour = isRequestAuthenticated(req) ? rawTour : sanitizeTourForPublic(rawTour);
  const steps = getTourSteps(code);
  const stats = computeJourneyStats(steps);
  const room = serializeRoom(getOrCreateRoom(code, 'genel'), false);
  const announcements = db.announcements.filter((a) => a.tourCode === code || a.tourCode === 'ALL');
  return res.json({
    success: true,
    tour,
    steps,
    stats,
    room,
    announcements,
    agency: db.agency
  });
});

app.post('/api/trips/:code/steps', requireAuth, (req, res) => {
  const code = String(req.params.code || 'RY-KASIM').toUpperCase().trim();
  const body = req.body || {};
  const steps = getTourSteps(code);

  const lat = Number(body.lat) || 21.4225;
  const lng = Number(body.lng) || 39.8262;
  const status = ['completed', 'active', 'planned'].includes(body.status) ? body.status : 'active';

  // Insert logic: if status is 'active', mark previous active steps as 'completed'
  // and insert right before the first 'planned' step (unless explicit order provided)
  let insertIndex = steps.length;
  if (status === 'active' && typeof body.order === 'undefined') {
    const firstPlannedIdx = steps.findIndex((s) => s.status === 'planned');
    if (firstPlannedIdx !== -1) {
      insertIndex = firstPlannedIdx;
    }
    for (let i = 0; i < insertIndex; i++) {
      if (steps[i].status === 'active') {
        steps[i].status = 'completed';
      }
    }
  }

  const prevStep = insertIndex > 0 ? steps[insertIndex - 1] : null;
  let computedKm = Number(body.distanceKm);
  if (!Number.isFinite(computedKm) || computedKm <= 0) {
    if (prevStep) {
      const segKm = haversineKm(Number(prevStep.lat) || lat, Number(prevStep.lng) || lng, lat, lng);
      computedKm = (Number(prevStep.distanceKm) || 0) + Math.max(1, segKm);
    } else {
      computedKm = 0;
    }
  }

  const nowStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const newStep = {
    id: `step-${Date.now()}`,
    order: insertIndex + 1,
    dayLabel: body.dayLabel || `Canlı Durak • ${nowStr}`,
    title: body.title || 'Yeni Siyer & Ziyaret Durağı',
    locationLabel: body.locationLabel || 'Kutsal Topraklar • Canlı Konum',
    category: body.category || 'siyer',
    lat,
    lng,
    distanceKm: computedKm,
    status,
    timestamp: body.timestamp || `Bugün ${nowStr}`,
    guideNote:
      body.guideNote ||
      'Rehber hocamız eşliğinde bu mübarek noktada Siyer-i Nebi sohbeti ve dua halkası gerçekleştirildi.',
    prayerSummary:
      body.prayerSummary ||
      'Allâhümme salli alâ seyyidinâ Muhammedin ve alâ âli seyyidinâ Muhammed.'
  };

  steps.splice(insertIndex, 0, newStep);
  steps.forEach((s, idx) => {
    s.order = idx + 1;
  });

  saveState(db);
  broadcastStepsUpdate(code, newStep.id);
  const stats = computeJourneyStats(steps);
  return res.json({ success: true, step: newStep, steps, stats });
});

app.patch('/api/trips/:code/steps/:stepId', requireAuth, (req, res) => {
  const code = String(req.params.code || 'RY-KASIM').toUpperCase().trim();
  const stepId = req.params.stepId;
  const body = req.body || {};
  const steps = getTourSteps(code);
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Durak bulunamadı.' });
  }

  const target = steps[idx];
  if (typeof body.title === 'string' && body.title.trim()) target.title = body.title.trim();
  if (typeof body.dayLabel === 'string' && body.dayLabel.trim()) target.dayLabel = body.dayLabel.trim();
  if (typeof body.locationLabel === 'string' && body.locationLabel.trim()) target.locationLabel = body.locationLabel.trim();
  if (typeof body.category === 'string' && body.category.trim()) target.category = body.category.trim();
  if (typeof body.guideNote === 'string') target.guideNote = body.guideNote.trim();
  if (typeof body.prayerSummary === 'string') target.prayerSummary = body.prayerSummary.trim();
  if (typeof body.timestamp === 'string') target.timestamp = body.timestamp.trim();
  if (Number.isFinite(Number(body.lat)) && body.lat !== undefined) target.lat = Number(body.lat);
  if (Number.isFinite(Number(body.lng)) && body.lng !== undefined) target.lng = Number(body.lng);
  if (Number.isFinite(Number(body.distanceKm)) && body.distanceKm !== undefined) {
    target.distanceKm = Number(body.distanceKm);
  }

  if (body.status && ['completed', 'active', 'planned'].includes(body.status)) {
    if (body.status === 'active' && !body.singleOnly) {
      // Polarsteps chronological progression: earlier steps become completed, later active steps become planned
      steps.forEach((s, i) => {
        if (i < idx) {
          s.status = 'completed';
        } else if (i === idx) {
          s.status = 'active';
          s.timestamp = body.timestamp || `Canlı • ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (s.status === 'active') {
          s.status = 'planned';
        }
      });
    } else {
      target.status = body.status;
    }
  }

  saveState(db);
  broadcastStepsUpdate(code, target.id);
  const stats = computeJourneyStats(steps);
  return res.json({ success: true, step: target, steps, stats });
});

app.delete('/api/trips/:code/steps/:stepId', requireAuth, (req, res) => {
  const code = String(req.params.code || 'RY-KASIM').toUpperCase().trim();
  const stepId = req.params.stepId;
  const steps = getTourSteps(code);
  const nextSteps = steps.filter((s) => s.id !== stepId);
  if (nextSteps.length === steps.length) {
    return res.status(404).json({ success: false, message: 'Silinecek durak bulunamadı.' });
  }
  nextSteps.forEach((s, idx) => {
    s.order = idx + 1;
  });
  db.journeySteps[code] = nextSteps;
  saveState(db);
  broadcastStepsUpdate(code);
  const stats = computeJourneyStats(nextSteps);
  return res.json({ success: true, steps: nextSteps, stats });
});

// 5. Guides CRUD
app.post('/api/guides', requireAuth, (req, res) => {
  const body = req.body || {};
  const guide = {
    id: `guide-${Date.now()}`,
    name: body.name || 'Yeni Rehber Hoca',
    title: body.title || 'Kafile İrşad Rehberi',
    phone: body.phone || '+90 538 399 96 66',
    email: body.email || `rehber${Date.now()}@ridvanyilmazturizm.com`,
    specialty: body.specialty || 'Siyer ve Umre Rehberliği',
    status: 'online',
    assignedTour: body.assignedTour || 'RY-KASIM'
  };
  db.guides.push(guide);
  saveState(db);
  res.json({ success: true, guide });
});

app.delete('/api/guides/:id', requireAuth, (req, res) => {
  const targetId = req.params.id;
  const prevLen = db.guides.length;
  db.guides = db.guides.filter((g) => g.id !== targetId);
  if (db.guides.length === prevLen) {
    return res.status(404).json({ success: false, message: 'Silinecek rehber bulunamadı.' });
  }
  saveState(db);
  return res.json({ success: true });
});

// 6. Push Announcements
app.post('/api/announcements', requireAuth, (req, res) => {
  const body = req.body || {};
  const ann = {
    id: `ann-${Date.now()}`,
    tourCode: String(body.tourCode || 'RY-KASIM').toUpperCase(),
    title: body.title || 'Kafile Duyurusu',
    message: body.message || '',
    sender: body.sender || 'Rıdvan Yılmaz Turizm Operasyon',
    createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    urgent: Boolean(body.urgent)
  };
  db.announcements.unshift(ann);
  saveState(db);

  // Broadcast to matching rooms
  for (const room of liveRooms.values()) {
    if (ann.tourCode === 'ALL' || room.tourCode === ann.tourCode) {
      broadcastToRoom(room, { type: 'new-announcement', announcement: ann });
    }
  }
  if (ann.tourCode === 'ALL') {
    db.tours.forEach((t) => broadcastToFamilyTrackers(t.code, { type: 'new-announcement', announcement: ann }));
  } else {
    broadcastToFamilyTrackers(ann.tourCode, { type: 'new-announcement', announcement: ann });
  }
  broadcastToAdmins({ type: 'new-announcement', announcement: ann });
  res.json({ success: true, announcement: ann });
});

app.delete('/api/announcements/:id', requireAuth, (req, res) => {
  const targetId = req.params.id;
  const deletedAnn = db.announcements.find((a) => a.id === targetId);
  if (!deletedAnn) {
    return res.status(404).json({ success: false, message: 'Silinecek duyuru bulunamadı.' });
  }
  db.announcements = db.announcements.filter((a) => a.id !== targetId);
  saveState(db);
  for (const room of liveRooms.values()) {
    if (deletedAnn.tourCode === 'ALL' || room.tourCode === deletedAnn.tourCode) {
      broadcastToRoom(room, { type: 'announcement-deleted', id: targetId });
    }
  }
  if (deletedAnn.tourCode === 'ALL') {
    db.tours.forEach((t) => broadcastToFamilyTrackers(t.code, { type: 'announcement-deleted', id: targetId }));
  } else {
    broadcastToFamilyTrackers(deletedAnn.tourCode, { type: 'announcement-deleted', id: targetId });
  }
  broadcastToAdmins({ type: 'announcement-deleted', id: targetId, announcements: db.announcements });
  return res.json({ success: true, id: targetId, announcements: db.announcements });
});

// 7. SOS Emergency API
function recordAndBroadcastSosAlert(raw) {
  const nowMs = Date.now();
  const requestedId = raw.id ? String(raw.id).trim() : '';
  const tourCode = String(raw.tourCode || 'RY-KASIM').toUpperCase().trim();
  const pilgrimName = String(raw.pilgrimName || 'Hacı Misafir').trim();

  const existing = db.sosAlerts.find(
    (s) =>
      (requestedId && s.id === requestedId) ||
      (s.status === 'active' &&
        s.tourCode === tourCode &&
        s.pilgrimName === pilgrimName &&
        s.createdAtMs &&
        nowMs - s.createdAtMs < 10000)
  );
  if (existing) {
    return existing;
  }

  const alertItem = {
    id: requestedId || `sos-${nowMs}`,
    tourCode,
    pilgrimName,
    phone: raw.phone || '+90 538 000 00 00',
    lat: Number(raw.lat) || 21.4225,
    lng: Number(raw.lng) || 39.8262,
    accuracy: raw.accuracy ? Number(raw.accuracy) : null,
    locationNote: raw.locationNote || 'Mescid-i Haram / Kâbe-i Muazzama Çevresi',
    createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    createdAtMs: nowMs,
    status: 'active',
    resolvedBy: null
  };
  db.sosAlerts.unshift(alertItem);
  saveState(db);

  broadcastToGuidesInTour(alertItem.tourCode, { type: 'sos-alert', alert: alertItem });
  broadcastToAdmins({ type: 'sos-alert', alert: alertItem, sosAlerts: db.sosAlerts });
  return alertItem;
}

app.post('/api/sos', sosRateLimiter, (req, res) => {
  const body = req.body || {};
  const alertItem = recordAndBroadcastSosAlert(body);
  res.json({ success: true, alert: alertItem });
});

app.patch('/api/sos/:id/resolve', requireAuth, (req, res) => {
  const alertItem = db.sosAlerts.find((s) => s.id === req.params.id);
  if (!alertItem) return res.status(404).json({ success: false });
  alertItem.status = 'resolved';
  alertItem.resolvedBy = (req.body && req.body.resolvedBy) || 'Rıdvan Yılmaz Hoca';
  saveState(db);

  broadcastToGuidesInTour(alertItem.tourCode, { type: 'sos-resolved', alert: alertItem });
  broadcastToAdmins({ type: 'sos-resolved', alert: alertItem, sosAlerts: db.sosAlerts });
  res.json({ success: true, alert: alertItem });
});

app.delete('/api/sos/:id', requireAuth, (req, res) => {
  const targetId = req.params.id;
  const targetAlert = db.sosAlerts.find((s) => s.id === targetId);
  if (!targetAlert) {
    return res.status(404).json({ success: false, message: 'Silinecek SOS kaydı bulunamadı.' });
  }
  db.sosAlerts = db.sosAlerts.filter((s) => s.id !== targetId);
  saveState(db);
  broadcastToGuidesInTour(targetAlert.tourCode, { type: 'sos-resolved', alert: targetAlert });
  broadcastToAdmins({ type: 'sos-resolved', alert: targetAlert, sosAlerts: db.sosAlerts });
  return res.json({ success: true, sosAlerts: db.sosAlerts });
});

// 8. REA Analysis Report Endpoint
const REA_SUMMARY_FILE = path.join(__dirname, 'data', 'rea-summary.json');
const MAX_REA_INLINE_BYTES = 5 * 1024 * 1024; // 5 MB safety limit
app.get('/api/rea-report', requireAuth, async (req, res) => {
  try {
    if (fs.existsSync(REA_SUMMARY_FILE)) {
      const summaryRaw = await fs.promises.readFile(REA_SUMMARY_FILE, 'utf8');
      return res.json(JSON.parse(summaryRaw));
    }
    if (fs.existsSync(REA_FILE)) {
      const stat = await fs.promises.stat(REA_FILE);
      if (stat.size > MAX_REA_INLINE_BYTES) {
        return res.json({
          available: true,
          summaryOnly: true,
          fileSizeBytes: stat.size,
          evidence_id: 'rea-umrahvoice-bundle',
          provider: 'morluto/rea',
          totalNodes: 0,
          totalEdges: 0,
          message: 'Rapor dosyası 5 MB sınırını aştığı için bellek koruması nedeniyle özet modunda döndürüldü.'
        });
      }
      const rawContent = await fs.promises.readFile(REA_FILE, 'utf8');
      const reaData = JSON.parse(rawContent);
      const graph = reaData.normalized_result.graph;
      const counts = graph.nodes.reduce((acc, n) => {
        acc[n.kind] = (acc[n.kind] || 0) + 1;
        return acc;
      }, {});
      const endpoints = graph.nodes
        .filter((n) => n.kind === 'endpoint')
        .map((n) => n.observations[0]?.properties || n.observations[0]?.label);
      const storage = graph.nodes
        .filter((n) => n.kind === 'storage')
        .map((n) => n.observations[0]?.properties || n.observations[0]?.label);
      const artifacts = graph.nodes
        .filter((n) => n.kind === 'artifact' || n.kind === 'javascript-asset')
        .map((n) => ({
          kind: n.kind,
          label: n.observations[0]?.label,
          bytes: n.observations[0]?.properties?.bytes,
          sha256: n.identity?.sha256
        }));
      return res.json({
        available: true,
        evidence_id: reaData.evidence_id,
        provider: reaData.provider,
        root_artifact_sha256: reaData.normalized_result.root_artifact_sha256,
        inventory_graph_sha256: reaData.normalized_result.inventory_graph_sha256,
        totalNodes: graph.nodes.length,
        totalEdges: graph.edges.length,
        nodeKindCounts: counts,
        endpoints,
        storage,
        artifacts
      });
    }
  } catch (err) {
    return res.status(500).json({ available: false, error: err.message });
  }
  return res.json({ available: false });
});

// 9. QR Code & WhatsApp Invite Generator Endpoint
app.get('/api/qr-img', async (req, res) => {
  try {
    const code = String(req.query.code || 'RY-KASIM').toUpperCase().trim();
    const room = String(req.query.room || 'genel').trim();
    const pilgrimName = String(req.query.name || '').trim();
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : req.protocol || 'http';
    const baseUrl = req.query.baseUrl || `${proto}://${host}`;
    let joinUrl = `${baseUrl}/dinle?code=${encodeURIComponent(code)}&room=${encodeURIComponent(room)}`;
    if (pilgrimName) {
      joinUrl += `&name=${encodeURIComponent(pilgrimName)}`;
    }
    const svg = await QRCode.toString(joinUrl, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#0a3d30',
        light: '#ffffff'
      }
    });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(svg);
  } catch (err) {
    return res.status(500).send('');
  }
});

app.get('/api/qr', async (req, res) => {
  try {
    const code = String(req.query.code || 'RY-KASIM').toUpperCase().trim();
    const room = String(req.query.room || 'genel').trim();
    const pilgrimName = String(req.query.name || '').trim();
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : req.protocol || 'http';
    const baseUrl = req.query.baseUrl || `${proto}://${host}`;
    let joinUrl = `${baseUrl}/dinle?code=${encodeURIComponent(code)}&room=${encodeURIComponent(room)}`;
    if (pilgrimName) {
      joinUrl += `&name=${encodeURIComponent(pilgrimName)}`;
    }
    const familyTrackUrl = `${baseUrl}/rota?code=${encodeURIComponent(code)}`;
    const keepsakeBookUrl = `${baseUrl}/ani-kitabi?code=${encodeURIComponent(code)}`;

    const tour = db.tours.find((t) => t.code.toUpperCase() === code) || db.tours[0] || {
      code,
      name: `Kasım Umresi Kafilesi`,
      guideName: 'Ömer Ali Gültekin',
      makkahHotel: 'Mekke Otel Kudi Tower',
      madinahHotel: '2 Gün Medine Konaklama'
    };

    const dataUrl = await QRCode.toDataURL(joinUrl, {
      width: 360,
      margin: 1,
      color: {
        dark: '#0a3d30',
        light: '#ffffff'
      }
    });

    const whatsappText =
      `🕋 *Rıdvan Yılmaz Turizm — Canlı Rehberlik & Manevi Rota*\n\n` +
      `Kıymetli Misafirimiz,\n` +
      `*${tour.name}* (${tour.guideName}) canlı sesli rehberlik odamıza uygulama veya şifre gerekmeden aşağıdaki bağlantıya dokunarak hemen katılabilirsiniz:\n\n` +
      `🎧 *Canlı Yayına Katıl:* ${joinUrl}\n` +
      `📍 *Aile Canlı Rota Takibi:* ${familyTrackUrl}\n` +
      `📖 *Umre Hatıra Kitapçığı:* ${keepsakeBookUrl}\n` +
      `🔑 *Kafile Kodu:* ${tour.code}\n` +
      `🏨 *Mekke Otel:* ${tour.makkahHotel}\n` +
      `🚨 *Acil İletişim:* +90 538 399 96 66`;

    return res.json({
      success: true,
      code,
      room,
      tour: isRequestAuthenticated(req) ? tour : sanitizeTourForPublic(tour),
      joinUrl,
      familyTrackUrl,
      keepsakeBookUrl,
      dataUrl,
      whatsappText,
      whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(whatsappText)}`
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== STATIC & PAGE ROUTES ========================
const protectedRoutes = new Set([
  '/rehber',
  '/hoca',
  '/rehber.html',
  '/panel',
  '/acente-kafile-yonetim-sistemi',
  '/panel.html'
]);

app.use((req, res, next) => {
  if (protectedRoutes.has(req.path) && !isRequestAuthenticated(req)) {
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return next();
});

app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  })
);

app.get('/favicon.ico', (req, res) => {
  res.type('image/svg+xml');
  res.sendFile(path.join(__dirname, 'public', 'icons', 'icon-512.svg'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

const routeMap = {
  '/': 'index.html',
  '/dinle': 'dinle.html',
  '/haci': 'dinle.html',
  '/rehber': 'rehber.html',
  '/hoca': 'rehber.html',
  '/panel': 'panel.html',
  '/acente-kafile-yonetim-sistemi': 'panel.html',
  '/yaka-karti': 'yaka-karti.html',
  '/rota': 'rota.html',
  '/izle': 'rota.html',
  '/ani-kitabi': 'ani-kitabi.html',
  '/hatira-kitabi': 'ani-kitabi.html',
  '/kullanim-rehberi': 'kullanim-rehberi.html',
  '/login': 'login.html',
  '/nasil-calisir': 'index.html',
  '/iletisim': 'index.html'
};

Object.entries(routeMap).forEach(([routePath, fileName]) => {
  app.get(routePath, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(__dirname, 'public', fileName));
  });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`====================================================================`);
    console.log(`  Rıdvan Yılmaz Turizm — RıdvanSes Canlı Rehber & Kafile Sistemi`);
    console.log(`  Ana Portal          : http://localhost:${PORT}/`);
    console.log(`  Hacı Dinleme Ekranı : http://localhost:${PORT}/dinle`);
    console.log(`  Aile Canlı Rota     : http://localhost:${PORT}/rota?code=RY-KASIM`);
    console.log(`  Umre Hatıra Kitabı  : http://localhost:${PORT}/ani-kitabi?code=RY-KASIM`);
    console.log(`  Rehber Yayın Ekranı : http://localhost:${PORT}/rehber`);
    console.log(`  Acente Yönetim Panel: http://localhost:${PORT}/panel`);
    console.log(`====================================================================`);
  });
}

module.exports = app;
