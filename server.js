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
  if (process.env.NODE_ENV !== 'test') {
    setTimeout(() => process.exit(1), 150).unref();
  }
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

app.disable('x-powered-by');
app.set('trust proxy', process.env.VERCEL ? 1 : 'loopback');

function isLoopbackAddress(addr) {
  const s = String(addr || '').trim();
  return s === '127.0.0.1' || s === '::1' || s === '::ffff:127.0.0.1';
}

function getClientIp(req) {
  const peer = String(req?.socket?.remoteAddress || '').trim();
  const trustedProxy = Boolean(process.env.VERCEL || isLoopbackAddress(peer));
  if (trustedProxy) {
    const xff = String(req?.headers?.['x-forwarded-for'] || '').trim();
    if (xff) {
      const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    }
    const realIp = String(req?.headers?.['x-real-ip'] || '').trim();
    if (realIp && !realIp.includes(',')) return realIp;
  }
  if (req && typeof req.ip === 'string' && req.ip.trim()) return req.ip.trim();
  return peer || 'local';
}

function decodeTourPinHeader(req) {
  const rawHeader = req?.headers?.['x-tour-pin'];
  if (rawHeader == null) return '';
  const str = String(rawHeader).trim();
  if (!str) return '';
  if (String(req?.headers?.['x-tour-pin-enc'] || '').toLowerCase() === 'uri') {
    try {
      return decodeURIComponent(str).trim();
    } catch {
      return str;
    }
  }
  return str;
}

function isTrustedCorsOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  if (origin === 'https://ridvanyilmazturizm.com' || origin === 'https://ses.ridvanyilmazturizm.com') return true;
  if (origin === 'https://ridvanses.vercel.app') return true;
  if (/^https:\/\/[a-z0-9-]+\.ridvanyilmazturizm\.com$/i.test(origin)) return true;
  if (/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/i.test(origin)) return true;
  if (process.env.ALLOWED_ORIGINS) {
    const extras = String(process.env.ALLOWED_ORIGINS)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (extras.includes(origin)) return true;
  }
  return false;
}

// Güvenlik Başlıkları (Security Headers) & Cross-Origin Destek (express.json öncesinde çalışır)
const RYS_CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: mediastream:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://ses.ridvanyilmazturizm.com https://*.ridvanyilmazturizm.com https://ridvanses.vercel.app https://nominatim.openstreetmap.org wss://ses.ridvanyilmazturizm.com wss://*.ridvanyilmazturizm.com wss://broker.emqx.io:8084 wss://test.mosquitto.org:8081 ws://localhost:* ws://127.0.0.1:*",
  "frame-src 'self' https://www.openstreetmap.org",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self' https://wa.me"
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), payment=(), usb=(), geolocation=(self), microphone=(self)');
  res.setHeader('Content-Security-Policy', RYS_CSP_HEADER);
  res.setHeader('Vary', 'Origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  const origin = req.headers.origin || '';
  if (isTrustedCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-RY-Auth, X-Rys-Relay-Key, X-Tour-Pin, X-Tour-Pin-Enc');
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  if (
    req.path &&
    req.path.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
  ) {
    const secSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
    const hasCustomAuthHeader = Boolean(req.headers.authorization || req.headers['x-ry-auth'] || req.headers['x-rys-relay-key']);
    let refererOrigin = '';
    if (!origin && req.headers.referer) {
      try {
        refererOrigin = new URL(String(req.headers.referer)).origin;
      } catch {
        refererOrigin = 'invalid';
      }
    }
    if (
      !hasCustomAuthHeader &&
      (((secSite === 'cross-site' || secSite === 'same-site') && !isTrustedCorsOrigin(origin)) ||
        (origin && !isTrustedCorsOrigin(origin)) ||
        (!secSite && !origin && refererOrigin && !isTrustedCorsOrigin(refererOrigin)))
    ) {
      return res.status(403).json({
        success: false,
        error: 'csrf-blocked',
        message: 'Çapraz kaynak (CSRF) güvenlik doğrulaması reddedildi.'
      });
    }
    const rawCt = String(req.headers['content-type'] || '').toLowerCase().trim();
    const hasBody = Boolean(req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) > 0);
    if (
      (rawCt && !rawCt.startsWith('application/json') && !rawCt.startsWith('application/octet-stream')) ||
      (!rawCt && hasBody)
    ) {
      return res.status(415).json({
        success: false,
        error: 'unsupported-content-type',
        message: 'API uç noktaları yalnızca application/json içerik tipini kabul eder.'
      });
    }
  }
  try {
    const qIdx = req.url.indexOf('?');
    decodeURIComponent(qIdx >= 0 ? req.url.slice(0, qIdx) : req.url);
  } catch {
    return res.status(400).json({ success: false, error: 'invalid-url', message: 'Geçersiz istek adresi.' });
  }
  next();
});

app.use(express.json({ limit: '512kb' }));
app.use((err, req, res, next) => {
  if (res.headersSent || req.aborted || res.destroyed || (err && err.type === 'request.aborted')) {
    return;
  }
  if (
    err &&
    (err.type === 'entity.parse.failed' ||
      err.type === 'encoding.unsupported' ||
      err.type === 'charset.unsupported' ||
      err.type === 'entity.too.large' ||
      err.type === 'stream.not.readable' ||
      err.type === 'stream.encoding.set' ||
      err.status === 400 ||
      err.status === 413 ||
      err.status === 415)
  ) {
    const code = err.status >= 400 && err.status < 500 ? err.status : 400;
    return res.status(code).json({
      success: false,
      error: 'invalid-request-body',
      message: 'Geçersiz istek gövdesi veya kodlaması.'
    });
  }
  return next(err);
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
    await fs.promises.writeFile(tmpFile, payload, { encoding: 'utf8', mode: 0o600 });
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
      fs.writeFileSync(tmpFile, JSON.stringify(pendingSaveStateRef, null, 2), { encoding: 'utf8', mode: 0o600 });
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
      if (Array.isArray(state.revokedAuthTokens) && state.revokedAuthTokens.length > 16384) {
        state.revokedAuthTokens = state.revokedAuthTokens.slice(-16384);
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


// v73 Web Push: no npm dependencies. Persistent state belongs to the VDS, not /tmp.
const rysPushSubs = new Map();
const rysSosPushSubs = new Map();
const rysPushQueue = [];
const rysPushPending = [];
const rysPushRequests = new Map(); // At most four active network requests
let rysPushInFlight=0,rysPushPumpScheduled=false,rysPushVapid=null,rysPushInitError=null;

function rysPushFail(status,code){const e=new Error(code);e.status=status;return e;}
function rysPushB64(value,length){
  if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))throw rysPushFail(400,'invalid-key');
  const b=Buffer.from(value,'base64url');
  if(b.length!==length||b.toString('base64url')!==value)throw rysPushFail(400,'invalid-key');
  return b;
}
function rysPushPoint(value){
  const b=rysPushB64(value,65);
  if(b[0]!==4)throw rysPushFail(400,'invalid-p256dh');
  try{crypto.ECDH.convertKey(b,'prime256v1',undefined,undefined,'uncompressed');}
  catch(e){throw rysPushFail(400,'invalid-p256dh');}
  return b;
}
function rysPushPublicIp(address){
  const net=require('node:net'),family=net.isIP(address);
  if(family===4){
    const a=address.split('.').map(Number),[x,y,z]=a;
    return !(x===0||x===10||x===127||x>=224||x===169&&y===254||
      x===172&&y>=16&&y<=31||x===192&&(y===168||y===0||y===2)||
      x===100&&y>=64&&y<=127||x===198&&(y===18||y===19||y===51&&z===100)||
      x===203&&y===0&&z===113);
  }
  if(family===6){
    let norm=address.toLowerCase();
    const zoneIdx=norm.indexOf('%');if(zoneIdx>=0)norm=norm.slice(0,zoneIdx);
    if(norm.includes('.')){
      const lastColon=norm.lastIndexOf(':');
      const v4=norm.slice(lastColon+1);
      if(net.isIP(v4)===4){
        const oct=v4.split('.').map(Number);
        norm=norm.slice(0,lastColon+1)+((oct[0]<<8)|oct[1]).toString(16)+':'+((oct[2]<<8)|oct[3]).toString(16);
      }
    }
    let groups=[];
    if(norm.includes('::')){
      const [left,right]=norm.split('::');
      const lParts=left?left.split(':'):[];
      const rParts=right?right.split(':'):[];
      const missing=8-(lParts.length+rParts.length);
      if(missing<0)return false;
      groups=[...lParts,...Array(missing).fill('0'),...rParts];
    }else{
      groups=norm.split(':');
    }
    if(groups.length!==8)return false;
    const nums=groups.map(g=>parseInt(g||'0',16));
    if(nums.some(n=>Number.isNaN(n)||n<0||n>0xffff))return false;
    const [head,second]=nums;
    return head>=0x2000&&head<=0x3fff&&head!==0x2002&&
      !(head===0x2001&&(second===0xdb8||second<0x200));
  }
  return false;
}
function rysPushEndpoint(value){
  if(typeof value!=='string'||value.length>2048)throw rysPushFail(400,'invalid-endpoint');
  let u;try{u=new URL(value);}catch(e){throw rysPushFail(400,'invalid-endpoint');}
  if(u.username||u.password||u.hash||u.href.length>2048)throw rysPushFail(400,'invalid-endpoint');
  let test=false;
  if(process.env.NODE_ENV==='test'&&process.env.RYS_PUSH_TEST_ORIGIN){
    let t;try{t=new URL(process.env.RYS_PUSH_TEST_ORIGIN);}catch(e){}
    test=!!t&&t.protocol==='http:'&&t.hostname==='127.0.0.1'&&!!t.port&&u.origin===t.origin;
  }
  const h=u.hostname.toLowerCase();
  const provider=h==='fcm.googleapis.com'||h==='android.googleapis.com'||
    h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com')||
    h.endsWith('.push.services.mozilla.com');
  if(!test&&(u.protocol!=='https:'||u.port||!provider))throw rysPushFail(403,'endpoint-forbidden');
  return {url:u,test};
}
function rysPushLoadVapid(){
  const configured=process.env.RYS_VAPID_PRIVATE_KEY||process.env.VAPID_PRIVATE_KEY;
  const publicEnv=process.env.RYS_VAPID_PUBLIC_KEY||process.env.VAPID_PUBLIC_KEY;
  let material=configured||db.pushVapid?.privateKey,key;
  if(publicEnv&&!configured)throw rysPushFail(503,'vapid-private-key-required');
  if(!material){
    const e=crypto.createECDH('prime256v1');e.generateKeys();
    material=Buffer.from(e.getPrivateKey('hex').padStart(64,'0'),'hex').toString('base64url');
  }
  try{
    if(material.trim().startsWith('{'))key=crypto.createPrivateKey({key:JSON.parse(material),format:'jwk'});
    else if(material.includes('BEGIN'))key=crypto.createPrivateKey(material.replace(/\\n/g,'\n'));
    else{
      const d=rysPushB64(material,32),e=crypto.createECDH('prime256v1');e.setPrivateKey(d);
      const p=e.getPublicKey();key=crypto.createPrivateKey({format:'jwk',key:{kty:'EC',crv:'P-256',
        x:p.subarray(1,33).toString('base64url'),y:p.subarray(33).toString('base64url'),d:d.toString('base64url')}});
    }
    const jwk=key.export({format:'jwk'});
    if(jwk.kty!=='EC'||jwk.crv!=='P-256'||!jwk.d)throw Error('curve');
    const p=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]);
    const check=crypto.createECDH('prime256v1');check.setPrivateKey(rysPushB64(jwk.d,32));
    if(!check.getPublicKey().equals(p))throw Error('inconsistent private key');
    const publicKey=p.toString('base64url');rysPushPoint(publicKey);
    if(publicEnv&&publicEnv!==publicKey)throw Error('public/private mismatch');
    const subject=process.env.RYS_VAPID_SUBJECT||'mailto:info@ridvanyilmazturizm.com';
    const contact=new URL(subject);
    if(!['mailto:','https:'].includes(contact.protocol)||contact.username||contact.password||/[\r\n]/.test(subject))throw Error('subject');
    if(!configured&&(!db.pushVapid||db.pushVapid.publicKey!==publicKey)){
      db.pushVapid={publicKey,privateKey:jwk.d};
      // Startup only: make the identity durable before accepting subscriptions.
      saveState(db);flushPendingSaveSync();
      if(!fs.existsSync(RUNTIME_FILE)||JSON.parse(fs.readFileSync(RUNTIME_FILE,'utf8')).pushVapid?.publicKey!==publicKey)
        throw Error('persistent VAPID write failed');
    }
    return {publicKey,privateKey:key,subject};
  }catch(e){throw rysPushFail(503,'vapid-configuration-error');}
}
function rysPushPersist(){
  db.pushSubscriptions=Array.from(rysPushSubs.values());saveState(db);
}
function rysPushCancel(endpoint,binding){
  for(const active of rysPushRequests.get(endpoint)||[]){
    if(!binding||active.binding===binding)active.request.destroy(Error('push subscription superseded'));
  }
}
function rysPushDrop(endpoint){
  const old=rysPushSubs.get(endpoint);rysPushSubs.delete(endpoint);
  if(old)rysPushCancel(endpoint,old);
}
function rysPushPrune(){
  const counts=new Map();
  for(const [endpoint,s] of Array.from(rysPushSubs.entries()).reverse()){
    const n=(counts.get(s.tourCode)||0)+1;counts.set(s.tourCode,n);
    if(n>512)rysPushDrop(endpoint);
  }
  while(rysPushSubs.size>4096)rysPushDrop(rysPushSubs.keys().next().value);
}
function rysPushInit(){
  if(process.env.VERCEL){rysPushInitError='persistent-vds-required';return;}
  try{
    rysPushVapid=rysPushLoadVapid();
    if(!(process.env.NODE_ENV==='test'&&process.env.RYS_PUSH_TEST_ONLY==='1')){
      for(const row of (Array.isArray(db.pushSubscriptions)?db.pushSubscriptions:[]).slice(-4096)){
        try{
          rysPushEndpoint(row.endpoint);rysPushPoint(row.keys?.p256dh);rysPushB64(row.keys?.auth,16);
          if(!findRysTour(row.tourCode)||row.vapidKey!==rysPushVapid.publicKey||
            !Number.isSafeInteger(row.revision)||row.revision<1)continue;
          rysPushB64(row.subscriptionToken,32);rysPushSubs.set(row.endpoint,row);
        }catch(e){}
      }
      rysPushPrune();
      for(const row of (Array.isArray(db.sosPushSubscriptions)?db.sosPushSubscriptions:[]).slice(-512)){
        try{
          rysPushEndpoint(row.endpoint);rysPushPoint(row.keys?.p256dh);rysPushB64(row.keys?.auth,16);
          if((row.tourCode!=='ALL'&&!findRysTour(row.tourCode))||row.vapidKey!==rysPushVapid.publicKey||
            !Number.isSafeInteger(row.revision)||row.revision<1)continue;
          rysPushB64(row.subscriptionToken,32);rysSosPushSubs.set(row.endpoint,{...row,isSos:true});
        }catch(e){}
      }
      rysSosPushPrune();
    }
  }catch(e){rysPushInitError=e.message;console.error('[WebPush] Initialization unavailable:',e.message);}
}
function rysSosPushPersist(){
  db.sosPushSubscriptions=Array.from(rysSosPushSubs.values());saveState(db);
}
function rysSosPushDrop(endpoint){
  const old=rysSosPushSubs.get(endpoint);rysSosPushSubs.delete(endpoint);
  if(old)rysPushCancel(endpoint,old);
}
function rysSosPushPrune(){
  const counts=new Map();
  for(const [endpoint,s] of Array.from(rysSosPushSubs.entries()).reverse()){
    const n=(counts.get(s.tourCode)||0)+1;counts.set(s.tourCode,n);
    if(n>64)rysSosPushDrop(endpoint);
  }
  while(rysSosPushSubs.size>512)rysSosPushDrop(rysSosPushSubs.keys().next().value);
}
function rysSosPushSubscribe(body,principal){
  if(!principal)throw rysPushFail(401,'auth-required');
  let code=typeof body?.tourCode==='string'?body.tourCode.toUpperCase().trim():'ALL';
  if(!code||code.length>96)throw rysPushFail(400,'invalid-tour');
  if(code==='ALL'){
    if(!rysCanAdmin(principal)){
      if(principal.assignedTour)code=principal.assignedTour;
      else throw rysPushFail(403,'sos-scope-denied');
    }
  }else{
    if(!rysCanGuide(principal,code))throw rysPushFail(403,'sos-scope-denied');
    if(!findRysTour(code))throw rysPushFail(404,'tour-unknown');
  }
  const target=rysPushEndpoint(body.endpoint);
  const p=rysPushPoint(body.keys?.p256dh),auth=rysPushB64(body.keys?.auth,16);
  if(typeof body.deviceId!=='string'||!body.deviceId.trim()||body.deviceId.length>128||
    !Number.isSafeInteger(body.revision)||body.revision<1)throw rysPushFail(400,'invalid-subscription');
  const previous=rysSosPushSubs.get(target.url.href);
  if(previous){
    const sameSecret=previous.keys.auth===auth.toString('base64url')&&previous.keys.p256dh===p.toString('base64url');
    const supTok=typeof body.subscriptionToken==='string'?body.subscriptionToken:'';
    const capability=supTok.length===43&&typeof previous.subscriptionToken==='string'&&
      Buffer.byteLength(supTok)===Buffer.byteLength(previous.subscriptionToken)&&
      crypto.timingSafeEqual(Buffer.from(supTok),Buffer.from(previous.subscriptionToken));
    if(!sameSecret&&!capability)throw rysPushFail(403,'subscription-owner-required');
    if(body.revision<previous.revision||body.revision===previous.revision&&code!==previous.tourCode)
      throw Object.assign(rysPushFail(409,'stale-subscription'),{revision:previous.revision});
  }
  const rawAuthTok=typeof body._rawAuthToken==='string'?body._rawAuthToken.trim():'';
  const authTokenHash=rawAuthTok?crypto.createHash('sha256').update(rawAuthTok).digest('hex'):previous?.authTokenHash||null;
  const sessExp=rawAuthTok&&typeof activeAuthSessions!=='undefined'?activeAuthSessions.get(rawAuthTok)?.expiresAt:null;
  const targetView=body?.targetView==='panel'?'panel':body?.targetView==='rehber'?'rehber':(previous?.targetView==='panel'?'panel':'rehber');
  let s={endpoint:target.url.href,keys:{p256dh:p.toString('base64url'),auth:auth.toString('base64url')},
    tourCode:code,role:rysCanAdmin(principal)?'admin':'guide',targetView,deviceId:body.deviceId.trim(),
    revision:body.revision,subscriptionToken:previous?.subscriptionToken||crypto.randomBytes(32).toString('base64url'),
    authTokenHash,expiresAt:sessExp||(Date.now()+SESSION_TTL_MS),
    vapidKey:rysPushVapid.publicKey,isSos:true,updatedAt:Date.now()};
  if(previous&&previous.tourCode===s.tourCode&&previous.keys.auth===s.keys.auth&&previous.keys.p256dh===s.keys.p256dh){
    Object.assign(previous,s);s=previous;
  }
  if(previous&&previous!==s)rysPushCancel(s.endpoint,previous);
  rysSosPushSubs.delete(s.endpoint);rysSosPushSubs.set(s.endpoint,s);rysSosPushPrune();rysSosPushPersist();
  return {success:true,subscriptionToken:s.subscriptionToken,revision:s.revision,tourCode:s.tourCode,targetView:s.targetView};
}
function rysSosPushUnsubscribe(body){
  const target=rysPushEndpoint(body?.endpoint),s=rysSosPushSubs.get(target.url.href);
  if(!s)return {success:true};
  const supplied=typeof body.subscriptionToken==='string'?body.subscriptionToken:'';
  if(supplied.length!==43)throw rysPushFail(403,'subscription-owner-required');
  const a=Buffer.from(supplied),b=Buffer.from(s.subscriptionToken);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw rysPushFail(403,'subscription-owner-required');
  rysSosPushDrop(s.endpoint);rysSosPushPersist();return {success:true};
}
function rysPushSubscribe(body){
  const code=typeof body?.tourCode==='string'?body.tourCode.toUpperCase().trim():'';
  if(!code||code.length>96)throw rysPushFail(400,'invalid-tour');
  const tour=findRysTour(code);if(!tour)throw rysPushFail(404,'tour-unknown');
  const target=rysPushEndpoint(body.endpoint);
  const p=rysPushPoint(body.keys?.p256dh),auth=rysPushB64(body.keys?.auth,16);
  if(typeof body.deviceId!=='string'||!body.deviceId.trim()||body.deviceId.length>128||
    !Number.isSafeInteger(body.revision)||body.revision<1)throw rysPushFail(400,'invalid-subscription');
  const previous=rysPushSubs.get(target.url.href);
  const supTok=typeof body.subscriptionToken==='string'?body.subscriptionToken:'';
  const hasOwnerCapability=!!previous&&previous.tourCode===code&&supTok.length===43&&
    typeof previous.subscriptionToken==='string'&&Buffer.byteLength(supTok)===Buffer.byteLength(previous.subscriptionToken)&&
    crypto.timingSafeEqual(Buffer.from(supTok),Buffer.from(previous.subscriptionToken));
  if(String(tour.pin||'').trim()&&!hasOwnerCapability&&String(tour.pin).trim()!==String(body.pin||'').trim())
    throw rysPushFail(403,'pin-error');
  if(previous){
    const sameSecret=previous.keys.auth===auth.toString('base64url')&&previous.keys.p256dh===p.toString('base64url');
    const capability=supTok.length===43&&typeof previous.subscriptionToken==='string'&&
      Buffer.byteLength(supTok)===Buffer.byteLength(previous.subscriptionToken)&&
      crypto.timingSafeEqual(Buffer.from(supTok),Buffer.from(previous.subscriptionToken));
    if(!sameSecret&&!capability)throw rysPushFail(403,'subscription-owner-required');
    if(body.revision<previous.revision||body.revision===previous.revision&&code!==previous.tourCode)
      throw Object.assign(rysPushFail(409,'stale-subscription'),{revision:previous.revision});
  }
  let s={endpoint:target.url.href,keys:{p256dh:p.toString('base64url'),auth:auth.toString('base64url')},
    tourCode:code,lang:typeof body.lang==='string'?body.lang.slice(0,16):'tr',deviceId:body.deviceId.trim(),
    revision:body.revision,subscriptionToken:previous?.subscriptionToken||crypto.randomBytes(32).toString('base64url'),
    vapidKey:rysPushVapid.publicKey,updatedAt:Date.now()};
  if(previous&&previous.tourCode===s.tourCode&&previous.keys.auth===s.keys.auth&&previous.keys.p256dh===s.keys.p256dh){
    Object.assign(previous,s);s=previous; // preserve valid pending deliveries for the same binding
  }
  if(previous&&previous!==s)rysPushCancel(s.endpoint,previous);
  rysPushSubs.delete(s.endpoint);rysPushSubs.set(s.endpoint,s);rysPushPrune();rysPushPersist();
  return {success:true,subscriptionToken:s.subscriptionToken,revision:s.revision};
}
function rysPushRotate(body){
  const supplied=typeof body?.subscriptionToken==='string'?body.subscriptionToken:'';
  if(supplied.length!==43)throw rysPushFail(403,'subscription-owner-required');
  const isSos=Boolean(body?.isSos);
  const store=isSos?rysSosPushSubs:rysPushSubs;
  let oldEntry=null;
  if(typeof body?.oldEndpoint==='string'&&body.oldEndpoint){
    try{oldEntry=store.get(rysPushEndpoint(body.oldEndpoint).url.href)||null;}catch(e){}
  }
  if(!oldEntry){
    for(const cand of store.values()){
      if(typeof cand.subscriptionToken==='string'&&Buffer.byteLength(cand.subscriptionToken)===Buffer.byteLength(supplied)&&
        crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(cand.subscriptionToken))){oldEntry=cand;break;}
    }
  }
  if(!oldEntry)throw rysPushFail(404,'subscription-not-found');
  const a=Buffer.from(supplied),b=Buffer.from(oldEntry.subscriptionToken||'');
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw rysPushFail(403,'subscription-owner-required');
  if(isSos&&oldEntry.expiresAt&&Date.now()>oldEntry.expiresAt){
    rysSosPushDrop(oldEntry.endpoint);rysSosPushPersist();
    throw rysPushFail(401,'session-expired');
  }
  if(!isSos&&!findRysTour(oldEntry.tourCode)){
    rysPushDrop(oldEntry.endpoint);rysPushPersist();
    throw rysPushFail(404,'tour-unknown');
  }
  const target=rysPushEndpoint(body.endpoint);
  const p=rysPushPoint(body.keys?.p256dh),auth=rysPushB64(body.keys?.auth,16);
  const nextRev=(Number.isSafeInteger(oldEntry.revision)?oldEntry.revision:1)+1;
  const updated={...oldEntry,endpoint:target.url.href,
    keys:{p256dh:p.toString('base64url'),auth:auth.toString('base64url')},
    subscriptionToken:crypto.randomBytes(32).toString('base64url'),
    revision:nextRev,vapidKey:rysPushVapid.publicKey,updatedAt:Date.now()};
  if(oldEntry.endpoint!==updated.endpoint){
    if(isSos)rysSosPushDrop(oldEntry.endpoint);else rysPushDrop(oldEntry.endpoint);
  }
  store.delete(updated.endpoint);store.set(updated.endpoint,updated);
  if(isSos){rysSosPushPrune();rysSosPushPersist();}else{rysPushPrune();rysPushPersist();}
  return {success:true,subscriptionToken:updated.subscriptionToken,revision:updated.revision,tourCode:updated.tourCode,...(isSos?{targetView:updated.targetView||'rehber'}:{})};
}
function rysPushUnsubscribe(body){
  const target=rysPushEndpoint(body?.endpoint),s=rysPushSubs.get(target.url.href);
  if(!s)return {success:true};
  const supplied=typeof body.subscriptionToken==='string'?body.subscriptionToken:'';
  if(supplied.length!==43)throw rysPushFail(403,'subscription-owner-required');
  const a=Buffer.from(supplied),b=Buffer.from(s.subscriptionToken);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw rysPushFail(403,'subscription-owner-required');
  rysPushDrop(s.endpoint);rysPushPersist();return {success:true};
}
function rysPushEncrypt(subscription,plaintext,entropy=null){
  const ua=rysPushPoint(subscription.keys.p256dh),auth=rysPushB64(subscription.keys.auth,16);
  const text=Buffer.isBuffer(plaintext)?plaintext:Buffer.from(plaintext);
  if(text.length>3993)throw rysPushFail(413,'push-payload-too-large');
  const e=crypto.createECDH('prime256v1');
  if(entropy?.privateKey)e.setPrivateKey(entropy.privateKey);else e.generateKeys();
  const as=e.getPublicKey(),salt=entropy?.salt||crypto.randomBytes(16);
  if(salt.length!==16)throw Error('invalid salt');
  const info=Buffer.concat([Buffer.from('WebPush: info\0'),ua,as]);
  const ikm=Buffer.from(crypto.hkdfSync('sha256',e.computeSecret(ua),auth,info,32));
  const cek=Buffer.from(crypto.hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: aes128gcm\0'),16));
  const nonce=Buffer.from(crypto.hkdfSync('sha256',ikm,salt,Buffer.from('Content-Encoding: nonce\0'),12));
  const header=Buffer.alloc(86);salt.copy(header);header.writeUInt32BE(4096,16);header[20]=65;as.copy(header,21);
  const cipher=crypto.createCipheriv('aes-128-gcm',cek,nonce);
  return Buffer.concat([header,cipher.update(Buffer.concat([text,Buffer.from([2])])),cipher.final(),cipher.getAuthTag()]);
}
function rysPushAuthorization(endpoint){
  const claims={aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+12*3600,sub:rysPushVapid.subject};
  const token=Buffer.from(JSON.stringify({typ:'JWT',alg:'ES256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig=crypto.sign('sha256',Buffer.from(token),{key:rysPushVapid.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
  return 'vapid t='+token+'.'+sig+', k='+rysPushVapid.publicKey;
}
async function rysPushSend(subscription,payload){
  const target=rysPushEndpoint(subscription.endpoint),u=target.url;
  if(process.env.NODE_ENV==='test'&&process.env.RYS_PUSH_TEST_ONLY==='1'&&!target.test)
    throw Error('external push disabled in verification');
  let pinned;
  if(!target.test){
    const dns=require('node:dns').promises;
    let timer;const addresses=await Promise.race([dns.lookup(u.hostname,{all:true,verbatim:true}),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('push DNS timeout')),3000);})]).finally(()=>clearTimeout(timer));
    if(!addresses.length||addresses.some(a=>!rysPushPublicIp(a.address)))throw Error('push private DNS denied');
    pinned=addresses.find(a=>a.family===4)||addresses[0];
  }
  const activeSubMap=subscription.isSos&&typeof rysSosPushSubs!=='undefined'?rysSosPushSubs:rysPushSubs;
  if(activeSubMap.get(subscription.endpoint)!==subscription)throw Error('push subscription superseded');
  const body=rysPushEncrypt(subscription,payload),authorization=rysPushAuthorization(u.href);
  return new Promise((resolve,reject)=>{
    const transport=target.test?require('node:http'):require('node:https');
    const options={method:'POST',headers:{Authorization:authorization,'Content-Encoding':'aes128gcm',
      'Content-Type':'application/octet-stream','Content-Length':body.length,TTL:'86400',Urgency:'high'},
      ...(pinned?{lookup:(host,opts,cb)=>cb(null,opts?.all?[pinned]:pinned.address,pinned.family)}:{})};
    const request=transport.request(u,options,response=>{
      let bytes=0;response.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192)request.destroy(Error('push response too large'));});
      response.on('error',reject);response.on('end',()=>resolve(response.statusCode));
    });
    const active={binding:subscription,request},set=rysPushRequests.get(subscription.endpoint)||new Set();
    set.add(active);rysPushRequests.set(subscription.endpoint,set);
    const deadline=setTimeout(()=>request.destroy(Error('push deadline')),5000);
    request.on('error',reject);request.on('close',()=>{
      clearTimeout(deadline);set.delete(active);if(!set.size)rysPushRequests.delete(subscription.endpoint);
    });request.end(body);
    // Native request never follows redirects; DNS answer is pinned, TLS name remains the provider.
  });
}
function rysPushText(value,bytes){
  let out='',used=0;for(const ch of String(value||'')){const n=Buffer.byteLength(ch);if(used+n>bytes)break;out+=ch;used+=n;}return out;
}
function rysPushPayload(ann,code){
  const data={type:'announcement',id:rysPushText(ann.id,96),title:rysPushText(ann.title||'Kafile Duyurusu',160),
    body:rysPushText(ann.message,2000),tag:'ridvanses-ann-'+rysPushText(ann.id,96),tourCode:code,
    data:{url:'/dinle?code='+encodeURIComponent(code)}};
  let text=JSON.stringify(data);
  while(Buffer.byteLength(text)>3000&&data.body){data.body=rysPushText(data.body,Math.floor(Buffer.byteLength(data.body)/2));text=JSON.stringify(data);}
  if(Buffer.byteLength(text)>3993)throw Error('push payload too large');return text;
}

function queueRysPushAnnouncement(ann,allTours=false){
  if(!rysPushVapid||!ann?.id||!rysPushSubs.size)return;
  // Snapshot references only; preview serialization/crypto is yielded in bounded batches.
  if(rysPushPending.length>=8)rysPushPending.shift();
  rysPushPending.push({broadcastAll:allTours===true,announcement:{id:rysPushText(ann.id,96),title:rysPushText(ann.title,160),
    message:rysPushText(ann.message,2000),tourCode:String(ann.tourCode||'').toUpperCase().trim()},
    targets:Array.from(rysPushSubs.values()),index:0,payloads:new Map()});
  scheduleRysPushPump();
}
function scheduleRysPushPump(){
  if(!rysPushPumpScheduled){rysPushPumpScheduled=true;setImmediate(pumpRysPushQueue);}
}
function pumpRysPushQueue(){
  rysPushPumpScheduled=false;
  let budget=64;
  while(rysPushPending.length&&rysPushQueue.length<8192&&budget>0){
    const pending=rysPushPending[0];
    if(pending.index>=pending.targets.length){rysPushPending.shift();continue;}
    const s=pending.targets[pending.index++],ann=pending.announcement;budget--;
    if(rysPushSubs.get(s.endpoint)!==s||!findRysTour(s.tourCode)||
      !pending.broadcastAll&&ann.tourCode!==s.tourCode)continue;
    if(!pending.payloads.has(s.tourCode))pending.payloads.set(s.tourCode,rysPushPayload(ann,s.tourCode));
    rysPushQueue.push({subscription:s,payload:pending.payloads.get(s.tourCode),attempt:0});
  }
  while(rysPushInFlight<4&&rysPushQueue.length){
    const job=rysPushQueue.shift(),s=job.subscription;
    if(rysPushSubs.get(s.endpoint)!==s||!findRysTour(s.tourCode))continue;
    rysPushInFlight++;
    Promise.resolve().then(()=>rysPushSend(s,job.payload)).then(async status=>{
      if((status===404||status===410)&&rysPushSubs.get(s.endpoint)===s){
        rysPushDrop(s.endpoint);rysPushPersist();
      }else if((status===429||status>=500)&&job.attempt<2&&rysPushSubs.get(s.endpoint)===s){
        job.attempt++;
        await new Promise(resolve=>setTimeout(resolve,job.attempt===1?1000:4000));
        if(rysPushSubs.get(s.endpoint)===s&&rysPushQueue.length<8192)rysPushQueue.push(job);
      }
    }).catch(()=>{}).finally(()=>{
      rysPushInFlight--;
      if(rysPushQueue.length||rysPushPending.length)scheduleRysPushPump();
    });
  }
  if(rysPushPending.length&&rysPushQueue.length<8192)scheduleRysPushPump();
}
rysPushInit();

app.get('/api/push/vapid-public-key',(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!rysPushVapid)return res.status(503).json({success:false,error:rysPushInitError||'push-unavailable'});
  return res.json({success:true,publicKey:rysPushVapid.publicKey});
});
for(const [route,handler] of [['subscribe',rysPushSubscribe],['unsubscribe',rysPushUnsubscribe],['rotate',rysPushRotate]]){
  app.post('/api/push/'+route,createRateLimiter({max:1200,windowMs:60000}),(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(!rysPushVapid)return res.status(503).json({success:false,error:'push-unavailable'});
    const clientIp=typeof getClientIp==='function'?getClientIp(req):(req.ip||'local');
    if(route==='subscribe'&&typeof isIpBucketLocked==='function'&&isIpBucketLocked(clientIp,'push-pin-fail',30)){
      res.setHeader('Retry-After','60');
      return res.status(429).json({success:false,error:'rate-limited',message:'Çok fazla hatalı PIN denemesi yapıldı. Lütfen 1 dakika bekleyiniz.'});
    }
    try{return res.json(handler(req.body));}
    catch(e){
      if(route==='subscribe'&&e?.message==='pin-error'&&typeof consumeIpBucket==='function'){
        if(!consumeIpBucket(clientIp,'push-pin-fail',30,60000)){
          res.setHeader('Retry-After','60');
          return res.status(429).json({success:false,error:'rate-limited',message:'Çok fazla hatalı PIN denemesi yapıldı. Lütfen 1 dakika bekleyiniz.'});
        }
      }
      return res.status(e.status||400).json({success:false,error:e.message,...(e.revision?{revision:e.revision}:{})});
    }
  });
}
app.post('/api/push/subscribe-sos',createRateLimiter({max:240,windowMs:60000}),(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!rysPushVapid)return res.status(503).json({success:false,error:'push-unavailable'});
  try{
    const rawTok=extractAuthTokenFromReq(req)||String(req.body?.authToken||'').trim();
    const principal=rysPrincipal(rawTok);
    return res.json(rysSosPushSubscribe({...req.body,_rawAuthToken:rawTok},principal));
  }catch(e){return res.status(e.status||400).json({success:false,error:e.message,...(e.revision?{revision:e.revision}:{})});}
});
app.post('/api/push/unsubscribe-sos',createRateLimiter({max:240,windowMs:60000}),(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!rysPushVapid)return res.status(503).json({success:false,error:'push-unavailable'});
  try{return res.json(rysSosPushUnsubscribe(req.body));}
  catch(e){return res.status(e.status||400).json({success:false,error:e.message});}
});
function rysSosPushPayload(alertItem,targetUrlOverride=null){
  const code=String(alertItem.tourCode||'RY-KASIM').toUpperCase().trim();
  const hasCoords=alertItem.lat!=null&&alertItem.lng!=null&&Number.isFinite(Number(alertItem.lat))&&Number.isFinite(Number(alertItem.lng));
  const mapsUrl=hasCoords?`https://www.google.com/maps?q=${Number(alertItem.lat)},${Number(alertItem.lng)}`:null;
  const lines=[
    `${alertItem.pilgrimName||'Hacı Misafir'} (${code}) acil konum / kayıp çağrısı gönderdi!`,
    alertItem.locationNote?`Konum: ${alertItem.locationNote}`:'',
    alertItem.phone?`Tel: ${alertItem.phone}`:''
  ].filter(Boolean).join(' • ');
  const data={
    type:'sos-alert',
    id:rysPushText(alertItem.id,96),
    title:rysPushText(`🚨 ACİL SOS: ${alertItem.pilgrimName||'Kayıp Hacı'} (${code})`,160),
    body:rysPushText(lines,1800),
    tag:'ridvanses-sos-'+rysPushText(alertItem.id,96),
    tourCode:code,
    data:{url:targetUrlOverride||`/rehber?code=${encodeURIComponent(code)}`,...(mapsUrl?{mapsUrl}:{})}
  };
  return JSON.stringify(data);
}
let rysSosPushInFlight=0;
const rysSosPushQueue=[];
function pumpRysSosPushQueue(){
  while(rysSosPushInFlight<8&&rysSosPushQueue.length>0){
    const job=rysSosPushQueue.shift();
    if(!job||!job.sub||rysSosPushSubs.get(job.sub.endpoint)!==job.sub)continue;
    rysSosPushInFlight++;
    setImmediate(async()=>{
      const {sub,payload}=job;
      try{
        for(let attempt=0;attempt<3;attempt++){
          if(rysSosPushSubs.get(sub.endpoint)!==sub)break;
          try{
            const status=await rysPushSend(sub,payload);
            if((status===404||status===410)&&rysSosPushSubs.get(sub.endpoint)===sub){
              rysSosPushDrop(sub.endpoint);rysSosPushPersist();break;
            }
            if(status>=200&&status<300)break;
            if(status!==429&&status<500)break;
          }catch(e){}
          if(attempt<2)await new Promise(r=>setTimeout(r,attempt===0?1000:3000));
        }
      }finally{
        rysSosPushInFlight=Math.max(0,rysSosPushInFlight-1);
        if(rysSosPushQueue.length>0)pumpRysSosPushQueue();
      }
    });
  }
}
function queueRysPushSos(alertItem){
  if(!rysPushVapid||!alertItem?.id||!rysSosPushSubs.size)return;
  const now=Date.now();
  let droppedExpired=false;
  for(const [ep,s] of rysSosPushSubs){
    if(s.expiresAt&&now>s.expiresAt){rysSosPushDrop(ep);droppedExpired=true;}
  }
  if(droppedExpired)rysSosPushPersist();
  const code=String(alertItem.tourCode||'RY-KASIM').toUpperCase().trim();
  const targets=Array.from(rysSosPushSubs.values()).filter(s=>s.tourCode==='ALL'||s.tourCode===code);
  if(!targets.length)return;
  let guidePayload,panelPayload;
  try{
    guidePayload=rysSosPushPayload(alertItem,`/rehber?code=${encodeURIComponent(code)}`);
    panelPayload=rysSosPushPayload(alertItem,`/panel?code=${encodeURIComponent(code)}#sos`);
  }catch(e){return;}
  for(const sub of targets){
    if(rysSosPushQueue.length>=256)rysSosPushQueue.shift();
    const usePanelUrl=sub.targetView==='panel';
    rysSosPushQueue.push({sub,payload:usePanelUrl?panelPayload:guidePayload});
  }
  pumpRysSosPushQueue();
}
let activeSmtpConnections=0;
const sosEmailCooldownByTour=new Map();
function sendEmergencySosEmail(alertItem){
  if(process.env.NODE_ENV==='test')return;
  const smtpPass=String(process.env.GMAIL_APP_PASSWORD||'').replace(/\s+/g,'').trim();
  const smtpUser=String(process.env.ADMIN_USERNAME||'').trim();
  if(!smtpPass||!smtpUser||!smtpUser.includes('@'))return;
  if(/^\[TEST\]/i.test(String(alertItem.pilgrimName||''))||alertItem.isTest)return;
  if(activeSmtpConnections>=2)return;
  const now=Date.now();
  const tourKey=String(alertItem.tourCode||'RY-KASIM').toUpperCase().trim();
  const pilgrimKey=String(alertItem.deviceId||alertItem.pilgrimName||'misafir').trim().toLowerCase().slice(0,80);
  const compositeKey=`${tourKey}:${pilgrimKey}`;
  const lastEmailAt=sosEmailCooldownByTour.get(compositeKey)||0;
  if(now-lastEmailAt<15000)return;
  if(sosEmailCooldownByTour.size>=256){
    for(const [k,ts] of sosEmailCooldownByTour)if(now-ts>60000)sosEmailCooldownByTour.delete(k);
    while(sosEmailCooldownByTour.size>=512){
      const oldest=sosEmailCooldownByTour.keys().next().value;
      if(!oldest)break;
      sosEmailCooldownByTour.delete(oldest);
    }
  }
  sosEmailCooldownByTour.set(compositeKey,now);
  activeSmtpConnections++;
  setImmediate(()=>{
    let released=false;
    const releaseSmtp=()=>{if(!released){released=true;activeSmtpConnections=Math.max(0,activeSmtpConnections-1);}};
    try{
      const tls=require('node:tls');
      const cleanSmtpField=(val,maxLen=240)=>String(val??'').replace(/[\r\n\0]+/g,' ').trim().slice(0,maxLen);
      const safeTour=cleanSmtpField(alertItem.tourCode,40);
      const safePilgrim=cleanSmtpField(alertItem.pilgrimName,120);
      const safePhone=cleanSmtpField(alertItem.phone||'-',40);
      const safeCreated=cleanSmtpField(alertItem.createdAt,40);
      const safeNote=cleanSmtpField(alertItem.locationNote||'-',400);
      const hasValidCoords=Number.isFinite(Number(alertItem.lat))&&Number.isFinite(Number(alertItem.lng))&&!(Number(alertItem.lat)===0&&Number(alertItem.lng)===0);
      const mapsUrl=hasValidCoords
        ? `https://www.google.com/maps?q=${Number(alertItem.lat)},${Number(alertItem.lng)}`
        : 'Cihaz GPS konumu alınamadı (Lütfen hacıya telefon/WhatsApp üzerinden ulaşınız)';
      const subj=`=?UTF-8?B?${Buffer.from(`🚨 ACİL SOS ALARMI: ${safePilgrim} (${safeTour})`).toString('base64')}?=`;
      const bodyText=[
        'RıdvanSes Canlı Saha Acil Durum (SOS) Bildirimi',
        '------------------------------------------------',
        `Kafile Kodu : ${safeTour}`,
        `Hacı Adı    : ${safePilgrim}`,
        `Telefon     : ${safePhone}`,
        `Saat        : ${safeCreated}`,
        `Not / Bölge : ${safeNote}`,
        `GPS         : ${hasValidCoords ? `${Number(alertItem.lat)}, ${Number(alertItem.lng)}${alertItem.accuracy ? ` (±${Math.round(Number(alertItem.accuracy)||0)}m)` : ''}` : 'Konum Alınamadı'}`,
        `Google Maps : ${mapsUrl}`,
        `Rehber Ekran: https://ses.ridvanyilmazturizm.com/rehber?code=${encodeURIComponent(safeTour)}`
      ].map(line=>line.startsWith('.')?'.'+line:line).join('\r\n');
      const steps=[
        `EHLO ses.ridvanyilmazturizm.com`,
        `AUTH LOGIN`,
        Buffer.from(smtpUser).toString('base64'),
        Buffer.from(smtpPass).toString('base64'),
        `MAIL FROM:<${smtpUser}>`,
        `RCPT TO:<${smtpUser}>`,
        `DATA`,
        `From: "RidvanSes Acil SOS" <${smtpUser}>\r\nTo: <${smtpUser}>\r\nSubject: ${subj}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${bodyText}\r\n.`,
        `QUIT`
      ];
      let stepIdx=-1,buf='';
      const sock=tls.connect({host:'smtp.gmail.com',port:465,servername:'smtp.gmail.com',timeout:6000});
      const timer=setTimeout(()=>{releaseSmtp();try{sock.destroy();}catch(e){}},7000);
      sock.on('data',chunk=>{
        buf+=chunk.toString('utf8');
        const lines=buf.split(/\r?\n/);buf=lines.pop()||'';
        for(const line of lines){
          if(!/^\d{3} /.test(line))continue;
          const code=Number(line.slice(0,3));
          if(code>=400){clearTimeout(timer);releaseSmtp();try{sock.destroy();}catch(e){}return;}
          stepIdx++;
          if(stepIdx<steps.length)sock.write(steps[stepIdx]+'\r\n');
        }
      });
      sock.on('error',()=>{clearTimeout(timer);releaseSmtp();});
      sock.on('close',()=>{clearTimeout(timer);releaseSmtp();});
    }catch(e){releaseSmtp();}
  });
}

// Live Room State in Memory
// key: `${tourCode}:${roomId}`
const liveRooms = new Map();
const guideDisconnectTimers = new Map(); // Tuple room.key -> Timeout


function rysRoomKey(tourCode,roomId='genel'){
  return JSON.stringify([String(tourCode||'RY-KASIM').toUpperCase().trim(),String(roomId||'genel').trim()]);
}
function findRysTour(tourCode){
  const code=String(tourCode||'RY-KASIM').toUpperCase().trim();
  return (db.tours||[]).find(t=>String(t.code||'').toUpperCase().trim()===code)||null;
}
function isConfiguredRysRoom(room){
  const tour=findRysTour(room.tourCode);
  return !!tour&&(room.roomId==='genel'||room.roomId==='siyer'||(tour.rooms||[]).some(r=>String(r.id||'').trim()===room.roomId));
}
function dropRysRoom(room){
  if(room._broadcastTimer){clearTimeout(room._broadcastTimer);room._broadcastTimer=null;}
  const timer=guideDisconnectTimers.get(room.key);
  if(timer){clearTimeout(timer);guideDisconnectTimers.delete(room.key);}
  if(liveRooms.get(room.key)===room)liveRooms.delete(room.key);
}
function pruneRysRooms(now=Date.now(),pressureTour=null){
  for(const room of liveRooms.values()){
    if(room.clients.size||guideDisconnectTimers.has(room.key)||room._broadcastTimer)continue;
    const registered=!!findRysTour(room.tourCode),configured=isConfiguredRysRoom(room);
    const expired=!registered||!configured&&now-(room.idleSince??room.lastUsedAt??now)>=60000;
    const reclaim=pressureTour&&!configured&&(room.tourCode===pressureTour||liveRooms.size>=2048);
    if(expired||reclaim)dropRysRoom(room);
  }
}
function commitRysSubscription(ctx,type){
  // Called only after authorization, PIN, registry and target identity validation.
  ctx.ws.isAdmin=false;ctx.ws.familyTourCode=null;
  if(type!=='join'&&ctx.currentRoom){
    const previous=ctx.currentRoom;ctx.currentRoom=null;
    removeClientFromRoom(previous,ctx.clientId,0);
  }
}

function getOrCreateRoom(tourCode, roomId = 'genel') {
  const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
  const rId = String(roomId || 'genel').trim();
  const key=rysRoomKey(code,rId),tour=findRysTour(code),now=Date.now();
  if(!tour)return null;
  if (!liveRooms.has(key)) {
    // 64 rooms/tour and 2048 globally; active rooms and pending guide grace are never evicted.
    const count=()=>Array.from(liveRooms.values()).filter(r=>r.tourCode===code).length;
    if(liveRooms.size>=2048||count()>=64)pruneRysRooms(now,code);
    if(liveRooms.size>=2048||count()>=64)return null;
    const genelSource = rId !== 'genel' ? liveRooms.get(rysRoomKey(code, 'genel')) : null;
    const inheritLive = Boolean(genelSource && genelSource.isLive);
    liveRooms.set(key, {
      key,
      tourCode: code,
      roomId: rId,
      tourName: tour ? tour.name : code,
      guideName: inheritLive && genelSource.guideName ? genelSource.guideName : (tour ? tour.guideName : 'Ömer Ali Gültekin'),
      isLive: inheritLive,
      broadcastMode: inheritLive ? (genelSource.broadcastMode || 'mic') : 'idle',
      startedAt: inheritLive && genelSource.startedAt ? genelSource.startedAt : Date.now() - 18 * 60 * 1000,
      currentTopic: inheritLive && genelSource.currentTopic
        ? genelSource.currentTopic
        : code === 'RY-KASIM'
          ? 'Kasım Umresi — Kâbe’nin Huzuru & Peygamber Efendimizin ﷺ İzinde Manevi Yolculuk'
          : 'Kâbe-i Muazzama Tavaf Duaları & Siyer-i Nebi Sohbeti',
      ...(inheritLive && genelSource.guidePeerId ? { guidePeerId: genelSource.guidePeerId } : {}),
      ...(inheritLive && genelSource.audioSourceId ? { audioSourceId: genelSource.audioSourceId } : {}),
      ...(inheritLive && genelSource.audioStateKnown ? {
        audioStateKnown: genelSource.audioStateKnown,
        audioStateSeq: genelSource.audioStateSeq,
        audioStateEnded: genelSource.audioStateEnded,
        audioMediaEpoch: genelSource.audioMediaEpoch
      } : {}),
      activeTawafStage: inheritLive ? (genelSource.activeTawafStage || null) : null,
      guideLocation: inheritLive ? (genelSource.guideLocation || null) : null,
      lastUsedAt:now,idleSince:now,
      clients: new Map() // clientId -> { ws, id, role, name, phone, lang, joinedAt }
    });
  }
  const room=liveRooms.get(key);room.lastUsedAt=now;
  return room;
}

// Initialize default rooms for all configured tours
getOrCreateRoom('RY-KASIM', 'genel');
getOrCreateRoom('RY-KASIM', 'siyer');
for (const seededTour of db.tours || []) {
  if (!seededTour || !seededTour.code) continue;
  getOrCreateRoom(seededTour.code, 'genel');
  getOrCreateRoom(seededTour.code, 'siyer');
  if (Array.isArray(seededTour.rooms)) {
    for (const rm of seededTour.rooms) {
      if (rm && rm.id) getOrCreateRoom(seededTour.code, rm.id);
    }
  }
}

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
  if(!room)return null;
  let pilgrimCount = 0;
  let roomPilgrimCount = 0;
  const pilgrims = [];
  const guides = [];
  const seenIds = new Set();
  const roomSeenIds = new Set();

  for (const c of room.clients.values()) {
    if (c.role === 'pilgrim' && !roomSeenIds.has(c.id)) {
      roomSeenIds.add(c.id);
      roomPilgrimCount++;
    }
  }

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
    audioMediaEpoch:room.audioMediaEpoch||null,
    guideLocation: room.guideLocation || null,
    connectedPilgrims: pilgrims,
    connectedGuides: guides,
    roomListenerCount: roomPilgrimCount,
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
let serverBroadcastMsgSeq=0;
function broadcastToRoom(room,payload,excludeWs=null,isAudioOverride=false){
  const audio=isAudioOverride||!!(payload&&typeof payload==='object'&&payload.type==='audio-chunk');
  if(!audio&&payload&&typeof payload==='object'&&!payload._msgId){
    payload._msgId='srv-'+(++serverBroadcastMsgSeq);
  }
  const data=typeof payload==='string'?payload:JSON.stringify(payload);
  let relayData;
  if(globalThis.__rysMqttPublisher&&typeof rysMintMqtt==='function')rysMintMqtt(globalThis.__rysMqttPublisher,room,payload);
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
function acceptRysAudio(room,sender,clientId,synth=false,message=null){
  const sameSource=room.audioSourceId===(sender.audioSourceId||clientId);
  if(sameSource&&room.audioStateKnown&&(!room.isLive||!synth&&String(room.broadcastMode||'').startsWith('demo')))return false;
  // Raw binary uses the ordered native socket; JSON must name the active media epoch.
  if(message?.audioMediaEpoch!=null&&(!sameSource||!room.audioStateKnown||!room.isLive||
    !Number.isSafeInteger(room.audioMediaEpoch)))return false;
  if(message&&sameSource&&Number.isSafeInteger(room.audioMediaEpoch)&&message.audioMediaEpoch!==room.audioMediaEpoch)return false;
  return true;
}

function acceptRysAudioState(room,sender,clientId,message){
  const epoch=message.audioMediaEpoch;
  if(epoch!=null&&(!Number.isSafeInteger(epoch)||epoch<1||!Number.isSafeInteger(message.audioStateSeq)||epoch>message.audioStateSeq))return false;
  if(room.audioSourceId!==(sender.audioSourceId||clientId)||!Number.isSafeInteger(room.audioStateSeq))return true;
  if(!Number.isSafeInteger(message.audioStateSeq)||message.audioStateSeq<=room.audioStateSeq)return false;
  return !Number.isSafeInteger(room.audioMediaEpoch)||(Number.isSafeInteger(epoch)&&epoch>=room.audioMediaEpoch);
}

function setRysAudioSource(room,sourceId){
  if(room.audioSourceId===sourceId)return;
  room.audioSourceId=sourceId;room.audioStateKnown=false;room.audioStateSeq=null;room.audioStateEnded=false;room.audioMediaEpoch=null;
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



// Auth Constants & Helpers (Rehber Yayını & Acente Paneli Yetkili Girişi — .env Üzerinden Yönetilir)
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'ridvanyilmazturizm@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD_ENV = String(process.env.ADMIN_PASSWORD || '').trim();
const SELAMET_USERNAME_ENV = String(process.env.SELAMET_USERNAME || '').trim().toLowerCase();
const SELAMET_PASSWORD_ENV = String(process.env.SELAMET_PASSWORD || '').trim();
const ADMIN_PASSWORD_SHA256 = '5493a522fbec2df9e753e4befd4fca615a2d43f5a4c09350e7fe578b5cce316f';
const SELAMET_PASSWORD_SHA256 = '0b7eea0794148d756d8b8cbe7d97ac6153c2abe52fe3d20938f9c751b2b73b5a';
const AUTH_COOKIE_NAME = 'ry_auth';
const AUTH_TOKEN_VALUE = (() => {
  const envSecret = String(process.env.AUTH_TOKEN_SECRET || '').trim();
  if (envSecret) return envSecret;
  if (db && typeof db.authSecret === 'string' && db.authSecret.trim().length >= 32) {
    return db.authSecret.trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  if (db && typeof db === 'object') {
    db.authSecret = generated;
    if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
      try { saveState(db); } catch (e) {}
    }
  }
  return generated;
})();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 gün
const MAX_ACTIVE_AUTH_SESSIONS = 4096;
const MAX_REVOKED_AUTH_TOKENS = 16384;
const activeAuthSessions = new Map(); // token -> { user, createdAt, expiresAt }
const revokedAuthTokens = new Set(Array.isArray(db.revokedAuthTokens) ? db.revokedAuthTokens.slice(-MAX_REVOKED_AUTH_TOKENS) : []);

function pruneAuthState(now = Date.now()) {
  for (const [tok, sess] of activeAuthSessions) {
    if (!sess || now > sess.expiresAt) activeAuthSessions.delete(tok);
  }
  while (activeAuthSessions.size > MAX_ACTIVE_AUTH_SESSIONS) {
    const oldestKey = activeAuthSessions.keys().next().value;
    if (!oldestKey) break;
    activeAuthSessions.delete(oldestKey);
  }
  while (revokedAuthTokens.size > MAX_REVOKED_AUTH_TOKENS) {
    const oldestRevoked = revokedAuthTokens.values().next().value;
    if (!oldestRevoked) break;
    revokedAuthTokens.delete(oldestRevoked);
  }
}

function createAuthSession(user) {
  const now = Date.now();
  if (typeof pruneAuthState === 'function') pruneAuthState(now);
  const expiresAt = now + SESSION_TTL_MS;
  const payloadB64 = Buffer.from(
    JSON.stringify({
      u: user,
      iat: now,
      exp: expiresAt,
      jti: crypto.randomBytes(12).toString('hex')
    }),
    'utf8'
  ).toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', AUTH_TOKEN_VALUE)
    .update('rys-sess-v74:' + payloadB64)
    .digest('base64url');
  const sessionToken = `rys_${payloadB64}.${sigB64}`;
  activeAuthSessions.set(sessionToken, {
    user,
    createdAt: now,
    expiresAt
  });
  return sessionToken;
}

function revokeAuthToken(token) {
  const clean = String(token || '').trim();
  if (!clean) return;
  activeAuthSessions.delete(clean);
  if (typeof rysSosPushSubs !== 'undefined' && rysSosPushSubs && rysSosPushSubs.size) {
    const revokedHash = crypto.createHash('sha256').update(clean).digest('hex');
    let droppedSos = false;
    for (const [ep, sub] of rysSosPushSubs) {
      if (sub && sub.authTokenHash && sub.authTokenHash === revokedHash) {
        rysSosPushDrop(ep);
        droppedSos = true;
      }
    }
    if (droppedSos && typeof rysSosPushPersist === 'function') rysSosPushPersist();
  }
  if (clean !== AUTH_TOKEN_VALUE && typeof revokedAuthTokens !== 'undefined' && revokedAuthTokens) {
    revokedAuthTokens.add(clean);
    if (typeof pruneAuthState === 'function') pruneAuthState();
    if (typeof db !== 'undefined' && db && typeof saveState === 'function') {
      const cap = typeof MAX_REVOKED_AUTH_TOKENS === 'number' ? MAX_REVOKED_AUTH_TOKENS : 2048;
      db.revokedAuthTokens = Array.from(revokedAuthTokens).slice(-cap);
      saveState(db);
    }
  }
  // Revoke existing native publishers/admins as well as active HTTP relay sessions.
  if (typeof wss !== 'undefined' && wss && wss.clients) {
    for(const ws of wss.clients)if(ws.rysAuthContext)refreshRysNativeAuth(ws.rysAuthContext);
  }
  if (typeof httpRelaySessions !== 'undefined' && httpRelaySessions && httpRelaySessions.size) {
    for (const sess of httpRelaySessions.values()) {
      if (sess && sess.rysAuthToken === clean) {
        const room = sess.currentRoom;
        const member = room?.clients?.get(sess.clientId);
        sess.rysAuthToken = null;
        sess.isAuthenticated = false;
        if (sess.ws) sess.ws.isAuthenticated = false;
        if (Array.isArray(sess.outbox)) sess.outbox.length = 0;
        sess.mqttPublications = [];
        sess.mqttVerified?.clear?.();
        if (member?.role === 'guide' || sess.ws?.isAdmin) {
          sess.currentRoom = null;
          sess.relayDigest = null;
          if (sess.ws) {
            sess.ws.isAdmin = false;
          }
          if (room && room.clients && room.clients.has(sess.clientId) && typeof removeClientFromRoom === 'function') {
            removeClientFromRoom(room, sess.clientId, 0);
          }
        }
      }
    }
  }
}

function getRequiredTourPin(tour) {
  return tour && (tour.pinProtected || tour.pin) ? String(tour.pin || '').trim() : '';
}

// IP Tabanlı Hafif Hız Sınırlayıcı (Sliding Window Rate Limiter — Auth/PIN kovaları ayrık tutulur)
const rateLimitBuckets = new Map();
const authRateLimitBuckets = new Map();
function ensureBucketMapCapacity(map, cap = 5000, now = Date.now()) {
  if (map.size < cap) return;
  for (const [k, v] of map) {
    if (!v || now >= v.resetAt) map.delete(k);
  }
  while (map.size >= cap) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}
function getScopedRateMap(scope) {
  return /^(login|join-invalid|ws-pin-fail|steps-pin-fail|push-pin-fail|ws-sos|sos-http)$/.test(String(scope || ''))
    ? authRateLimitBuckets
    : rateLimitBuckets;
}
function clearAuthRateLimitOnSuccess(req) {
  const ip = String((typeof getClientIp === 'function' ? getClientIp(req) : '') || req?.ip || req?.socket?.remoteAddress || 'local').trim() || 'local';
  const normPath = String((req?.baseUrl || '') + (req?.path || '/')).toLowerCase().replace(/\/+$/, '') || '/';
  authRateLimitBuckets.delete(`login:${normPath}:${ip}`);
  authRateLimitBuckets.delete(`ip:login:${ip}`);
}
function consumeIpBucket(ip, scope, max, windowMs = 60000) {
  const now = Date.now();
  const targetMap = getScopedRateMap(scope);
  const cleanIp = String(ip || 'local').trim() || 'local';
  const key = `ip:${scope}:${cleanIp}`;
  let entry = targetMap.get(key);
  if (!entry || now >= entry.resetAt) {
    if (!entry) ensureBucketMapCapacity(targetMap, 5000, now);
    entry = { count: 0, resetAt: now + windowMs };
    targetMap.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= max;
}
function isIpBucketLocked(ip, scope, max) {
  const now = Date.now();
  const targetMap = getScopedRateMap(scope);
  const cleanIp = String(ip || 'local').trim() || 'local';
  const entry = targetMap.get(`ip:${scope}:${cleanIp}`);
  return Boolean(entry && now < entry.resetAt && entry.count >= max);
}
function createRateLimiter({ windowMs = 60000, max = 30, maxRequests, scope = '', message = 'Çok fazla istek gönderildi. Lütfen biraz bekleyiniz.' } = {}) {
  const limit = typeof maxRequests === 'number' ? maxRequests : max;
  const fallbackBuckets = new Map();
  return (req, res, next) => {
    const buckets =
      typeof getScopedRateMap === 'function'
        ? getScopedRateMap(scope)
        : typeof rateLimitBuckets !== 'undefined' && rateLimitBuckets
          ? rateLimitBuckets
          : fallbackBuckets;
    const now = Date.now();
    const headers = (req && req.headers) || {};
    const resolvedIp = typeof getClientIp === 'function' ? getClientIp(req) : '';
    const rawIp = resolvedIp || req.ip || req.socket?.remoteAddress || (headers['x-real-ip'] ? String(headers['x-real-ip']) : '') || 'local';
    const ip = String(rawIp).trim() || 'local';
    const normPath = String((req.baseUrl || '') + (req.path || '/')).toLowerCase().replace(/\/+$/, '') || '/';
    const key = `${scope}:${normPath}:${ip}`;
    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      if (!entry && buckets.size >= 5000) {
        for (const [k, v] of buckets) {
          if (!v || now >= v.resetAt) buckets.delete(k);
        }
        while (buckets.size >= 5000) {
          const oldestKey = buckets.keys().next().value;
          if (!oldestKey) break;
          buckets.delete(oldestKey);
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      if (typeof res.setHeader === 'function') {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      }
      return res.status(429).json({
        success: false,
        message
      });
    }
    return next();
  };
}

const loginRateLimiter = createRateLimiter({
  scope: 'login',
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
  const reqPin = getRequiredTourPin(tour);
  const valid = !!tour && !(reqPin && reqPin !== String(body.pin || '').trim());
  return (valid ? joinTourAdmissionLimiter : joinTourFailureLimiter)(req, res, next);
}
const sosRateLimiter = createRateLimiter({
  scope: 'sos-http',
  windowMs: 60000,
  max: 20,
  message: 'Acil SOS bildiriminiz zaten iletildi. Lütfen bekleyiniz.'
});
const demoRequestRateLimiter = createRateLimiter({
  windowMs: 60000,
  max: 15,
  message: 'Çok fazla talep gönderildi. Lütfen daha sonra tekrar deneyiniz.'
});
const relayOpenRateLimiter = createRateLimiter({
  scope: 'relay-open',
  windowMs: 60000,
  max: 1200,
  message: 'Çok fazla yedek oturum açma isteği gönderildi.'
});
const logoutRateLimiter = createRateLimiter({
  scope: 'logout',
  windowMs: 60000,
  max: 120,
  message: 'Çok fazla çıkış isteği gönderildi. Lütfen kısa süre sonra tekrar deneyiniz.'
});
const forgotPasswordRateLimiter = createRateLimiter({
  scope: 'login',
  windowMs: 60000,
  max: 10,
  message: 'Çok fazla şifre yenileme isteği gönderildi. Lütfen 1 dakika bekleyiniz.'
});

function verifyPassword(candidate, envPass, fallbackSha256) {
  const clean = String(candidate || '').trim();
  if (!clean) return false;
  if (envPass) {
    const candDigest = crypto.createHash('sha256').update(clean).digest();
    const envDigest = crypto.createHash('sha256').update(String(envPass)).digest();
    return crypto.timingSafeEqual(candDigest, envDigest);
  }
  const hash = crypto.createHash('sha256').update(clean).digest('hex');
  if (typeof fallbackSha256 !== 'string' || fallbackSha256.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(fallbackSha256));
}

function isValidAuthToken(token) {
  const clean = String(token || '').trim();
  if (!clean) return false;
  if (typeof revokedAuthTokens !== 'undefined' && revokedAuthTokens && revokedAuthTokens.has(clean)) return false;
  if (
    typeof AUTH_TOKEN_VALUE === 'string' &&
    AUTH_TOKEN_VALUE &&
    (typeof crypto !== 'undefined' && typeof Buffer !== 'undefined'
      ? Buffer.byteLength(clean) === Buffer.byteLength(AUTH_TOKEN_VALUE) &&
        crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(AUTH_TOKEN_VALUE))
      : clean === AUTH_TOKEN_VALUE)
  ) {
    return true;
  }
  const sess = typeof activeAuthSessions !== 'undefined' && activeAuthSessions ? activeAuthSessions.get(clean) : null;
  if (sess) {
    if (Date.now() > sess.expiresAt) {
      activeAuthSessions.delete(clean);
      return false;
    }
    return true;
  }
  if (
    clean.startsWith('rys_') &&
    clean.includes('.') &&
    typeof crypto !== 'undefined' &&
    typeof Buffer !== 'undefined' &&
    typeof AUTH_TOKEN_VALUE === 'string' &&
    AUTH_TOKEN_VALUE.length > 0
  ) {
    const body = clean.slice(4);
    const dotIdx = body.indexOf('.');
    if (dotIdx > 0 && body.indexOf('.', dotIdx + 1) === -1) {
      const payloadB64 = body.slice(0, dotIdx);
      const sigB64 = body.slice(dotIdx + 1);
      if (sigB64.length === 43 && /^[A-Za-z0-9_-]+$/.test(payloadB64) && /^[A-Za-z0-9_-]+$/.test(sigB64)) {
        const expectedSig = crypto
          .createHmac('sha256', AUTH_TOKEN_VALUE)
          .update('rys-sess-v74:' + payloadB64)
          .digest('base64url');
        if (
          expectedSig.length === sigB64.length &&
          crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedSig))
        ) {
          try {
            const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
            if (parsed && parsed.u && Number.isFinite(parsed.exp) && Date.now() <= parsed.exp) {
              if (typeof activeAuthSessions !== 'undefined' && activeAuthSessions) {
                const maxSess = typeof MAX_ACTIVE_AUTH_SESSIONS === 'number' ? MAX_ACTIVE_AUTH_SESSIONS : 4096;
                if (activeAuthSessions.size >= maxSess && typeof pruneAuthState === 'function') pruneAuthState();
                activeAuthSessions.set(clean, {
                  user: parsed.u,
                  createdAt: Number(parsed.iat) || Date.now(),
                  expiresAt: parsed.exp
                });
              }
              return true;
            }
          } catch (e) {}
        }
      }
    }
  }
  return false;
}



function rysPrincipal(token){
  if(!isValidAuthToken(token))return null;
  if(String(token).trim()===AUTH_TOKEN_VALUE)return {role:'agency_admin',assignedTour:null};
  const u=activeAuthSessions.get(String(token).trim())?.user;
  if(!u||!['agency','agency_admin','super_admin','admin'].includes(u.role))return null;
  const assignedTour=u.assignedTour?String(u.assignedTour).toUpperCase().trim():null;
  if(u.role==='agency'&&!assignedTour)return null;
  return {role:u.role,assignedTour};
}
function rysCanGuide(principal,code){
  return !!principal&&(!principal.assignedTour||principal.assignedTour===String(code||'RY-KASIM').toUpperCase().trim());
}
function rysCanAdmin(principal){
  return !!principal&&!principal.assignedTour&&['agency_admin','super_admin','admin'].includes(principal.role);
}
function rysCanonical(value){
  if(Array.isArray(value))return '['+value.map(rysCanonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+rysCanonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function rysTopicSegment(value){
  const text=String(value);
  try{return 'u'+encodeURIComponent(text);}catch(e){return 'j'+encodeURIComponent(JSON.stringify(text));}
}
function rysMqttTopic(code,room){
  return 'ridvanses/v3/room/'+rysTopicSegment(String(code||'RY-KASIM').toUpperCase().trim())+'/'+rysTopicSegment(String(room||'genel').trim());
}
function rysMintMqtt(session,room,payload){
  const member=session.currentRoom?.clients.get(session.clientId);
  if(room!==session.currentRoom||!session.ws.isHttpRelay||session.relayRetired||member?.role!=='guide'||
    !rysCanGuide(rysPrincipal(session.rysAuthToken),room.tourCode))return;
  let body=typeof payload==='string'?JSON.parse(payload):payload;
  if(!['audio-chunk','stream-state','audio-source','room-state','tawaf-stage','guide-location'].includes(body?.type))return;
  if(body.type==='room-state')body={type:'room-state',room:serializeRoom(room,false)};
  if(Buffer.byteLength(JSON.stringify(body),'utf8')>16384)return;
  const iv=crypto.randomBytes(12),key=crypto.createHash('sha256').update('rys-mqtt-v70:'+AUTH_TOKEN_VALUE).digest();
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(body),'utf8'),cipher.final()]);
  const sealed={iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:encrypted.toString('base64')};
  const issuedAt=Date.now();
  const frame=JSON.parse(JSON.stringify({version:70,issuer:session.clientId,tourCode:room.tourCode,roomId:room.roomId,
    topic:rysMqttTopic(room.tourCode,room.roomId),issuedAt,expiresAt:issuedAt+400,
    nonce:crypto.randomBytes(12).toString('hex'),
    grant:crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update('rys-grant70:'+session.rysAuthToken).digest('hex'),
    source:room.audioSourceId||null,
    epoch:room.audioMediaEpoch||null,stateSeq:room.audioStateSeq||null,seq:body.seq??null,type:body.type,payload:sealed}));
  frame.proof=crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update(rysCanonical(frame)).digest('hex');
  const q=session.mqttPublications||(session.mqttPublications=[]);q.push(frame);
  while(q.length>16)q.shift();
}
function rysVerifyMqtt(receiver,frame){
  if(!frame||frame.version!==70||JSON.stringify(frame).length>32768)return null;
  const {proof,...unsigned}=frame;
  if(!/^[0-9a-f]{64}$/.test(proof||''))return null;
  const expected=crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update(rysCanonical(unsigned)).digest('hex');
  if(!crypto.timingSafeEqual(Buffer.from(proof),Buffer.from(expected)))return null;
  const now=Date.now();
  if(frame.issuedAt>now||frame.expiresAt<now||frame.expiresAt-frame.issuedAt>400||
    frame.topic!==rysMqttTopic(frame.tourCode,frame.roomId))return null;
  const issuer=httpRelaySessions.get(frame.issuer),origin=issuer?.currentRoom;
  const publisher=origin?.clients.get(issuer?.clientId),target=receiver.currentRoom;
  if(!issuer||issuer.relayRetired||now-issuer.lastSeen>35000||publisher?.role!=='guide'||
    !rysCanGuide(rysPrincipal(issuer.rysAuthToken),origin.tourCode)||
    !target||!target.clients.has(receiver.clientId)||target.tourCode!==frame.tourCode||
    !getTargetBroadcastRooms(origin).includes(target))return null;
  if(frame.grant!==crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update('rys-grant70:'+issuer.rysAuthToken).digest('hex'))return null;
  if(origin.roomId!==frame.roomId||target.audioSourceId!==frame.source||
    (target.audioMediaEpoch||null)!==frame.epoch||(target.audioStateSeq||null)!==frame.stateSeq)return null;
  const sealed=frame.payload;
  if(!/^[0-9a-f]{24}$/.test(sealed?.iv||'')||!/^[0-9a-f]{32}$/.test(sealed?.tag||''))return null;
  const key=crypto.createHash('sha256').update('rys-mqtt-v70:'+AUTH_TOKEN_VALUE).digest();
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(sealed.iv,'hex'));
  decipher.setAuthTag(Buffer.from(sealed.tag,'hex'));
  const body=JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.data,'base64')),decipher.final()]).toString('utf8'));
  if(body.type!==frame.type||(body.seq??null)!==frame.seq)return null;
  if(body.type==='audio-chunk'&&(!target.isLive||body.audioSourceId!==frame.source||body.audioMediaEpoch!==frame.epoch))return null;
  const seen=receiver.mqttVerified||(receiver.mqttVerified=new Map());
  for(const [id,expiry] of seen)if(expiry<now)seen.delete(id);
  if(seen.has(proof))return null;
  seen.set(proof,frame.expiresAt);while(seen.size>128)seen.delete(seen.keys().next().value);
  return body.type==='room-state'?{type:'room-state',room:serializeRoom(target,false)}:body;
}

function refreshRysNativeAuth(ctx){
  if(!ctx||ctx.ws.isHttpRelay)return true; // HTTP capabilities revalidate per request.
  const principal=rysPrincipal(ctx.rysAuthToken||ctx.rysHandshakeToken);
  const memberNow=ctx.currentRoom?.clients.get(ctx.clientId);
  const authed=!!principal&&(!ctx.ws.isAdmin||rysCanAdmin(principal))&&
    (memberNow?.role!=='guide'||rysCanGuide(principal,ctx.currentRoom.tourCode));
  ctx.isAuthenticated=authed;ctx.ws.isAuthenticated=authed;
  if(authed)return true;
  const room=ctx.currentRoom,member=room?.clients.get(ctx.clientId),pending=ctx.rysHandoff?.request;
  const privileged=member?.role==='guide'||ctx.ws.isAdmin||pending?.type==='admin-subscribe'||
    pending?.type==='join'&&pending.role==='guide';
  if(!privileged)return true; // Public listeners/family remain connected, without elevation.
  ctx.currentRoom=null;ctx.ws.isAdmin=false;ctx.ws.familyTourCode=null;
  clearRysHandoff(ctx);
  if(room?.clients.has(ctx.clientId))removeClientFromRoom(room,ctx.clientId,0);
  try{ctx.ws.terminate();}catch(e){}
  return false;
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
  const reqPath = String(req.path || req.url || '');
  const isLegacyRelayGetWithoutKey =
    req.method === 'GET' && reqPath.startsWith('/api/ws-relay') && !req.headers['x-rys-relay-key'];
  const isCrossSiteApiCall =
    reqPath.startsWith('/api/') && String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site';
  const cookieHeader = !isLegacyRelayGetWithoutKey && !isCrossSiteApiCall ? String(req.headers.cookie || '') : '';
  if (cookieHeader) {
    const cookieName = typeof AUTH_COOKIE_NAME === 'string' ? AUTH_COOKIE_NAME : 'ry_auth';
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq > 0) {
        const k = part.slice(0, eq).trim();
        if(k!==cookieName)continue;
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
  if (tok === AUTH_TOKEN_VALUE) {
    return {
      id: 'admin-1',
      name: 'Rıdvan Yılmaz Turizm (Yetkili)',
      email: ADMIN_USERNAME,
      role: 'agency_admin',
      agency: 'Rıdvan Yılmaz Turizm',
      assignedTour: null
    };
  }
  return null;
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
  const genelHasGuide = !!genelRoom&&Array.from(genelRoom.clients.values()).some((c) => c.role === 'guide');
  if (!genelHasGuide && genelRoom?.isLive) {
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
      r.activeTawafStage = genelRoom.activeTawafStage || null;
      r.activePublisherClientId = null;
      setRysAudioSource(r,genelRoom.audioSourceId||null);
      r.audioStateKnown=!!genelRoom.audioStateKnown;
      r.audioStateSeq=genelRoom.audioStateSeq||null;r.audioStateEnded=!!genelRoom.audioStateEnded;
      r.audioMediaEpoch=genelRoom.audioMediaEpoch||null;
      broadcastToRoom(r, {
        type: 'stream-state',
        isLive: r.isLive,
        broadcastMode: r.broadcastMode,
        currentTopic: r.currentTopic,
        guidePeerId: r.guidePeerId || null,
        audioSourceId:r.audioSourceId||null,
        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded,audioMediaEpoch:r.audioMediaEpoch||null
      });
      continue;
    }
    if (!roomHasGuide && !coveredByGenel && r.isLive) {
      r.isLive = false;
      r.broadcastMode = 'idle';r.audioStateKnown=true;r.audioStateEnded=true;
      r.activePublisherClientId = null;
    }
    if (!roomHasGuide && !coveredByGenel && r.activePublisherClientId) {
      r.activePublisherClientId = null;
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
        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded,audioMediaEpoch:r.audioMediaEpoch||null
      });
    }
  }
}

function removeClientFromRoom(room, clientId, graceMs = 2500) {
  if (!room) return;
  const prevClient = room.clients.get(clientId);
  room.clients.delete(clientId);
  if(!room.clients.size)room.idleSince=Date.now();
  if (room.activePublisherClientId === clientId) {
    room.activePublisherClientId = null;
  }
  if (prevClient && prevClient.role === 'guide') {
    for (const siblingRoom of getTourRooms(room.tourCode)) {
      if (siblingRoom.activePublisherClientId === clientId) {
        siblingRoom.activePublisherClientId = null;
      }
    }
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
    dropRysRoom(room);
    return;
  }

  broadcastRoomState(room);
}

// HTTP Relay Sessions for Serverless (Vercel) Fallback
const MAX_HTTP_RELAY_SESSIONS = 4096;
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
  const maxRelayCap = typeof MAX_HTTP_RELAY_SESSIONS === 'number' ? MAX_HTTP_RELAY_SESSIONS : 4096;
  while (httpRelaySessions.size > maxRelayCap) {
    let victimId = null;
    // 1. Evict idle/unsubscribed sessions first so active listeners cannot be dropped by relay-open floods
    for (const [cid, sess] of httpRelaySessions.entries()) {
      if (!sess.currentRoom && !sess.ws?.isAdmin && !sess.ws?.familyTourCode) {
        victimId = cid;
        break;
      }
    }
    // 2. Next prefer evicting legacy non-rys56 sessions before capability sessions
    if (!victimId) {
      for (const [cid, sess] of httpRelaySessions.entries()) {
        const member = sess.currentRoom?.clients?.get(cid);
        if (!sess.relayKey && member?.role !== 'guide' && !sess.ws?.isAdmin) {
          victimId = cid;
          break;
        }
      }
    }
    if (!victimId) {
      for (const [cid, sess] of httpRelaySessions.entries()) {
        const member = sess.currentRoom?.clients?.get(cid);
        if (member?.role !== 'guide' && !sess.ws?.isAdmin) {
          victimId = cid;
          break;
        }
      }
    }
    if (!victimId) victimId = httpRelaySessions.keys().next().value;
    if (!victimId) break;
    const victim = httpRelaySessions.get(victimId);
    httpRelaySessions.delete(victimId);
    if (victim?.currentRoom) removeClientFromRoom(victim.currentRoom, victimId);
  }
}

function broadcastToAdmins(payload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach((ws) => {
    if (ws.isAdmin && ws.readyState === WebSocket.OPEN && rysCanAdmin(rysPrincipal(ws.rysAuthContext?.rysAuthToken||ws.rysAuthContext?.rysHandshakeToken))) {
      ws.send(data);
    }
  });
  for (const sess of httpRelaySessions.values()) {
    if (sess.ws.isAdmin && rysCanAdmin(rysPrincipal(sess.rysAuthToken))) {
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
    ctx.rysAuthToken=String(msg.token).trim();
    ws.isAuthenticated = true;
    ctx.isAuthenticated = true;
  }
  const principal=rysPrincipal(ctx.rysAuthToken||ctx.rysHandshakeToken);
  const isAuthedClient=!!principal;
  ws.isAuthenticated=isAuthedClient;ctx.isAuthenticated=isAuthedClient;
  // Application heartbeat belongs to the connection, including family/admin subscriptions.
  if(msg.type==='ping'){
    if(ws.readyState===WebSocket.OPEN&&!ws.isHttpRelay){
      try{ws.send(JSON.stringify({type:'pong',ts:Date.now(),echoTs:msg.ts||null}));}catch(e){}
    }
    return;
  }

  if (msg.type === 'admin-subscribe') {
    if (!rysCanAdmin(principal)) {
      ws.isAdmin=false;
      ws.send(JSON.stringify({ type: 'auth-error', message: 'Acente paneli aboneliği için yetkili oturum gereklidir.' }));
      return;
    }
    commitRysSubscription(ctx,'admin-subscribe');
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
    const matchedTour = findRysTour(tourCode);
    if (!matchedTour) {
      ws.send(JSON.stringify({ type: 'subscription-error', code: 'tour-unknown' }));
      return;
    }
    const requiredFamilyPin = typeof getRequiredTourPin === 'function'
      ? getRequiredTourPin(matchedTour)
      : (matchedTour.pinProtected || matchedTour.pin ? String(matchedTour.pin || '').trim() : '');
    if (!rysCanGuide(principal, tourCode) && requiredFamilyPin) {
      if (typeof isIpBucketLocked === 'function' && ctx.clientIp && isIpBucketLocked(ctx.clientIp, 'ws-pin-fail', 60)) {
        ws.send(JSON.stringify({ type: 'pin-error', code: 'rate-limited', message: 'Çok fazla hatalı PIN denemesi yapıldı. Lütfen 1 dakika bekleyiniz.' }));
        return;
      }
      if (requiredFamilyPin !== String(msg.pin || '').trim()) {
        if (typeof consumeIpBucket === 'function' && ctx.clientIp && String(msg.pin || '').trim().length > 0) {
          if (!consumeIpBucket(ctx.clientIp, 'ws-pin-fail', 60, 60000)) {
            ws.send(JSON.stringify({ type: 'pin-error', code: 'rate-limited', message: 'Çok fazla hatalı PIN denemesi yapıldı. Lütfen 1 dakika bekleyiniz.' }));
            return;
          }
        }
        ws.send(JSON.stringify({ type: 'pin-error', message: 'Bu kafile rotası PIN korumalıdır. Lütfen geçerli PIN kodunu giriniz.' }));
        return;
      }
    }
    const room = getOrCreateRoom(tourCode, 'genel');
    if(!room){ws.send(JSON.stringify({type:'subscription-error',code:'room-unavailable'}));return;}
    if(room.tourCode!==tourCode||room.roomId!=='genel'){
      ws.send(JSON.stringify({type:'subscription-error',code:'room-identity-mismatch'}));return;
    }
    commitRysSubscription(ctx,'family-subscribe');
    ctx.pinVerifiedForTour = requiredFamilyPin && requiredFamilyPin === String(msg.pin || '').trim() ? tourCode : null;
    ws.familyTourCode = tourCode;
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
    if (msg.role === 'guide' && !rysCanGuide(principal,msg.tourCode)) {
      if (principal && principal.assignedTour) {
        ws.send(JSON.stringify({
          type: 'auth-error',
          code: 'forbidden-tour',
          assignedTour: principal.assignedTour,
          message: `Hesabınız yalnızca ${principal.assignedTour} kafilesi için yetkilendirilmiştir.`
        }));
        return;
      }
      ws.send(JSON.stringify({ type: 'auth-error', message: 'Rehber yayını başlatmak için yetkili girişi gereklidir.' }));
      return;
    }
    const tourCode = String(msg.tourCode || 'RY-KASIM').toUpperCase().trim();
    const roomId = String(msg.roomId || 'genel').trim();
    const role = msg.role === 'guide' ? 'guide' : 'pilgrim';
    const matchedTour=findRysTour(tourCode);
    if(!matchedTour){ws.send(JSON.stringify({type:'subscription-error',code:'tour-unknown'}));return;}
    if (
      roomId !== 'genel' &&
      roomId !== 'siyer' &&
      Array.isArray(matchedTour.removedRoomIds) &&
      matchedTour.removedRoomIds.includes(roomId.toLowerCase())
    ) {
      ws.send(JSON.stringify({
        type: 'subscription-error',
        code: 'room-removed',
        fallbackRoomId: 'genel',
        message: 'Bu özel oda acente tarafından kapatıldı. Lütfen Genel Yayın odasına geçiniz.'
      }));
      return;
    }
    const requiredJoinPin = typeof getRequiredTourPin === 'function'
      ? getRequiredTourPin(matchedTour)
      : (matchedTour && (matchedTour.pinProtected || matchedTour.pin) ? String(matchedTour.pin || '').trim() : '');
    if (role !== 'guide' && !rysCanGuide(principal, tourCode) && requiredJoinPin) {
      if (typeof isIpBucketLocked === 'function' && ctx.clientIp && isIpBucketLocked(ctx.clientIp, 'ws-pin-fail', 60)) {
        ws.send(JSON.stringify({ type: 'pin-error', code: 'rate-limited', message: 'Çok fazla hatalı PIN denemesi yapıldı. Lütfen 1 dakika bekleyiniz.' }));
        return;
      }
      if (requiredJoinPin !== String(msg.pin || '').trim()) {
        if (typeof consumeIpBucket === 'function' && ctx.clientIp && String(msg.pin || '').trim().length > 0) {
          if (!consumeIpBucket(ctx.clientIp, 'ws-pin-fail', 60, 60000)) {
            ws.send(JSON.stringify({ type: 'pin-error', code: 'rate-limited', message: 'Çok fazla hatalı PIN denemesi yapıldı. Lütfen 1 dakika bekleyiniz.' }));
            return;
          }
        }
        ws.send(JSON.stringify({ type: 'pin-error', message: 'Bu kafile odası PIN korumalıdır. Lütfen geçerli PIN kodunu giriniz.' }));
        return;
      }
    }
    const prevRoom = ctx.currentRoom;
    const targetRoom = getOrCreateRoom(tourCode, roomId);
    if(!targetRoom){ws.send(JSON.stringify({type:'subscription-error',code:'room-unavailable'}));return;}
    if(targetRoom.tourCode!==tourCode||targetRoom.roomId!==roomId||
      role==='guide'&&!rysCanGuide(principal,targetRoom.tourCode)){
      ws.send(JSON.stringify({type:'auth-error',message:'Oda kimliği ve yetki kapsamı eşleşmiyor.'}));return;
    }
    if (role === 'guide' && msg.takeover === false && targetRoom.isLive && targetRoom.activePublisherClientId && targetRoom.activePublisherClientId !== clientId) {
      const activeOwner = targetRoom.clients.get(targetRoom.activePublisherClientId);
      const incomingSource = msg.audioSourceId ? String(msg.audioSourceId).trim() : '';
      const incomingDevice = msg.deviceId ? String(msg.deviceId).trim() : '';
      const isSameOwner = Boolean(
        activeOwner &&
          (activeOwner.ws === ws ||
            (incomingSource && activeOwner.audioSourceId === incomingSource) ||
            (incomingDevice && activeOwner.deviceId && activeOwner.deviceId === incomingDevice))
      );
      if (activeOwner && !isSameOwner) {
        ws.send(JSON.stringify({
          type: 'subscription-error',
          code: 'guide-already-live',
          message: 'Bu kafile odasında şu an başka bir sekmede veya cihazda aktif canlı yayın devam ediyor.'
        }));
        return;
      }
    }
    commitRysSubscription(ctx,'join');
    ctx.pinVerifiedForTour =
      role !== 'guide' && requiredJoinPin && requiredJoinPin === String(msg.pin || '').trim() ? tourCode : null;
    ctx.currentRoom = targetRoom;
    const deviceId = msg.deviceId ? String(msg.deviceId).trim() : '';
    const previousClient=prevRoom===targetRoom?targetRoom.clients.get(clientId):null;
    const previousSource=previousClient?.audioSourceId;
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
    let needsGuidePresenceSync=false;
    for (const r of getTourRooms(tourCode)) {
      for (const [existingId, existingClient] of r.clients.entries()) {
        if (existingId === clientId || existingClient.ws === ws) continue;
        // deviceId is client metadata; a listener must never evict a guide by copying it.
        const sameDevice = Boolean(role === existingClient.role && deviceId && existingClient.deviceId && existingClient.deviceId === deviceId);
        const passiveDifferentDeviceProbe = Boolean(
          msg.takeover === false && deviceId && existingClient.deviceId && existingClient.deviceId !== deviceId
        );
        const sameGuide = Boolean(
          role === 'guide' &&
            existingClient.role === 'guide' &&
            r.roomId === roomId &&
            (msg.takeover === true || (existingClient.name === clientObj.name && !passiveDifferentDeviceProbe))
        );
        if (sameDevice || sameGuide) {
          if(existingClient.ws?.isHttpRelay){
            const oldRelay=httpRelaySessions.get(existingId);
            if(oldRelay&&(existingClient.role==='guide'||oldRelay.relayKey||ctx.rysAckCapture)){
              oldRelay.relayRetired=true;oldRelay.relayRetiredReason=ctx.rysAckCapture?'handoff':'replaced';
              oldRelay.mqttPublications=[];
            }
          }
          r.clients.delete(existingId);
          if(existingClient.role==='guide'&&r!==targetRoom)needsGuidePresenceSync=true;
          if (r.activePublisherClientId === existingId) {
            // Transfer ownership only within the room that receives the replacement.
            r.activePublisherClientId = r===targetRoom?clientId:null;
          }
          try {
            if (existingClient.ws && !existingClient.ws.isHttpRelay && typeof existingClient.ws.terminate === 'function') {
              if(existingClient.role==='guide'&&typeof existingClient.ws.close==='function'){
                existingClient.ws.send(JSON.stringify({type:'session-replaced'}));
                existingClient.ws.close(4009,'session-replaced');
              }else existingClient.ws.terminate();
            }
          } catch {}
        }
      }
    }
    targetRoom.clients.set(clientId, clientObj);
    if (prevRoom && prevRoom !== targetRoom) {
      const wasGuide=prevRoom.clients.get(clientId)?.role==='guide';
      removeClientFromRoom(prevRoom, clientId, 0);
      if(wasGuide&&prevRoom.tourCode===tourCode)needsGuidePresenceSync=false; // Same-tour removal already reconciled it.
    } else if(previousClient?.role==='guide'&&role!=='guide'){
      // Keep the new listener membership, release the former publisher and sync inheritance/stop.
      if(targetRoom.activePublisherClientId===clientId)targetRoom.activePublisherClientId=null;
      needsGuidePresenceSync=true;
    }
    // The replacement must be installed before checking General coverage or terminal stop.
    if(needsGuidePresenceSync)evaluateTourGuidePresence(tourCode);
    if (role === 'guide' && guideDisconnectTimers.has(targetRoom.key)) {
      clearTimeout(guideDisconnectTimers.get(targetRoom.key));
      guideDisconnectTimers.delete(targetRoom.key);
    }
    if (role === 'guide' && msg.name) {
      targetRoom.guideName = msg.name;
      if (targetRoom.roomId === 'genel') {
        for (const r of getTourRooms(tourCode)) {
          if (r !== targetRoom && !Array.from(r.clients.values()).some((c) => c.role === 'guide')) {
            r.guideName = msg.name;
          }
        }
      }
    }

    const tourSteps = getTourSteps(tourCode);
    const guideSosAlerts =
      role === 'guide' && rysCanGuide(principal, tourCode)
        ? (db.sosAlerts || []).filter((s) => String(s.tourCode || '').toUpperCase() === tourCode)
        : undefined;
    sendRysSubscriptionAck(ctx, {
        type: 'joined',
        clientId,
        room: serializeRoom(ctx.currentRoom, role === 'guide'),
        announcements: db.announcements.filter((a) => a.tourCode === tourCode || a.tourCode === 'ALL'),
        siyerPoints: db.siyerPoints,
        steps: tourSteps,
        stats: computeJourneyStats(tourSteps),
        ...(guideSosAlerts !== undefined ? { sosAlerts: guideSosAlerts } : {})
      });
    broadcastRoomState(ctx.currentRoom);
    return;
  }

  const currentRoom = ctx.currentRoom;
  if (!currentRoom) return;
  const sender = currentRoom.clients.get(clientId);
  if (!sender) return;
  if(sender.role==='guide'&&!rysCanGuide(principal,currentRoom.tourCode))return;

  switch (msg.type) {
    case 'guide-stream-state': {
      if (sender.role !== 'guide' || !isAuthedClient) break;
      if(!acceptRysAudioState(currentRoom,sender,clientId,msg))break;
      for (const r of getTargetBroadcastRooms(currentRoom)) {
        const wasLive = r.isLive;
        setRysAudioSource(r,sender.audioSourceId||clientId);r.audioStateKnown=true;
        r.audioStateSeq=msg.audioStateSeq||null;r.audioStateEnded=false;r.audioMediaEpoch=msg.audioMediaEpoch||null;
        r.isLive = Boolean(msg.isLive);
        r.broadcastMode = msg.broadcastMode || (r.isLive ? 'mic' : 'idle');
        if (msg.topic) r.currentTopic = msg.topic;
        if (typeof msg.tawafStage !== 'undefined') r.activeTawafStage = msg.tawafStage || null;
        if (msg.guidePeerId) r.guidePeerId = msg.guidePeerId;
        if (r.isLive) {
          if (!wasLive || !r.startedAt) r.startedAt = Date.now();
          r.activePublisherClientId = clientId;
          if (sender.name && (r === currentRoom || !Array.from(r.clients.values()).some((c) => c.role === 'guide'))) {
            r.guideName = sender.name;
          }
        } else if (!r.activePublisherClientId || r.activePublisherClientId === clientId) {
          r.activePublisherClientId = null;
        }
        broadcastToRoom(r, {
          type: 'stream-state',
          isLive: r.isLive,
          broadcastMode: r.broadcastMode,
          currentTopic: r.currentTopic,
          guideName: r.guideName || null,
          guidePeerId: r.guidePeerId || null,
        audioSourceId:r.audioSourceId||null,
        audioStateSeq:r.audioStateSeq||null,audioStateEnded:!!r.audioStateEnded,audioMediaEpoch:r.audioMediaEpoch||null
        });
      }
      broadcastToFamilyTrackers(currentRoom.tourCode, {
        type: 'stream-state',
        isLive: currentRoom.isLive,
        broadcastMode: currentRoom.broadcastMode,
        currentTopic: currentRoom.currentTopic,
        guideName: currentRoom.guideName || null
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
      if(!acceptRysAudio(currentRoom,sender,clientId,!!msg.synthNote,msg))break;
      if(msg.audioSourceId&&msg.audioSourceId!==(sender.audioSourceId||clientId))break;
      currentRoom.activePublisherClientId = clientId;
      const serializedAudio = JSON.stringify({
        type: 'audio-chunk',
        // PATCH: seq-v51
        seq: msg.seq ?? null,
        phraseStart: Boolean(msg.phraseStart),
        speakerId: clientId,
        audioSourceId:sender.audioSourceId||clientId,
        audioMediaEpoch:msg.audioMediaEpoch??null,
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
      if (typeof consumeIpBucket === 'function') {
        const sosIp = ctx.clientIp || ctx.clientId || 'local';
        if (!consumeIpBucket(sosIp, 'ws-sos', 20, 60000)) break;
      }
      const createdWsSos = recordAndBroadcastSosAlert({
        id: msg.id,
        tourCode: currentRoom.tourCode,
        deviceId: sender.deviceId || '',
        pilgrimName: sender.name || msg.pilgrimName,
        phone: sender.phone || msg.phone || '',
        lat: msg.lat,
        lng: msg.lng,
        accuracy: msg.accuracy,
        gpsSource: msg.gpsSource,
        locationNote: msg.locationNote || msg.note || ''
      });
      try {
        if (ws && ws.readyState === WebSocket.OPEN && createdWsSos && createdWsSos.id) {
          ws.send(JSON.stringify({ type: 'sos-ack', id: createdWsSos.id, tourCode: createdWsSos.tourCode }));
        }
      } catch {}
      break;
    }

    case 'quick-announcement': {
      if (sender.role !== 'guide') break;
      const ann = {
        id: `ann-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
        tourCode: currentRoom.tourCode,
        title: String(msg.title || 'Rehber Duyurusu').trim().slice(0, 140) || 'Rehber Duyurusu',
        message: String(msg.message || '').trim().slice(0, 1200),
        sender: String(sender.name || 'Rehber Hoca').trim().slice(0, 120),
        createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        urgent: Boolean(msg.urgent)
      };
      db.announcements.unshift(ann);
      if (db.announcements.length > 100) db.announcements.length = 100;
      saveState(db);
      queueRysPushAnnouncement(ann);
      for (const r of getTourRooms(currentRoom.tourCode)) {
        broadcastToRoom(r, { type: 'new-announcement', announcement: ann });
      }
      broadcastToFamilyTrackers(currentRoom.tourCode, { type: 'new-announcement', announcement: ann });
      broadcastToAdmins({ type: 'new-announcement', announcement: ann });
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
        if(value.type==='guide-stream-state'&&value.audioMediaEpoch!=null&&
          (!Number.isSafeInteger(value.audioStateSeq)||value.audioMediaEpoch>value.audioStateSeq))return false;
        const keys=Object.keys(value);if(keys.length>512)return false;
        for(const key of keys){
          characters+=key.length;
          if(characters>65536||key.length>64||forbidden.has(key))return false;
          const next=value[key];
          if(next===undefined)continue; // Internal GET DTOs may contain omitted optional fields.
          if(strings.has(key)&&next!==null&&typeof next!=='string')return false;
          if((key==='audioStateSeq'||key==='audioMediaEpoch')&&next!==null&&(!Number.isSafeInteger(next)||next<1))return false;
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
  const wsOrigin = String(req?.headers?.origin || '').trim();
  if (wsOrigin) {
    let schemeInvalid = false;
    try {
      const parsedOrigin = new URL(wsOrigin);
      const isHttpsReq = Boolean(req?.socket?.encrypted || String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https');
      if (isHttpsReq && parsedOrigin.protocol !== 'https:') {
        schemeInvalid = true;
      }
    } catch {
      schemeInvalid = true;
    }
    if (schemeInvalid || !isTrustedCorsOrigin(wsOrigin)) {
      try {
        ws.close(1008, 'origin-not-allowed');
      } catch {}
      return;
    }
  }

  ws.isAlive = true;
  ws.isAuthenticated = Boolean(req && isRequestAuthenticated(req));
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const rawClientIp = getClientIp(req);
  const ctx = {
    clientId: `client-${Date.now()}-${clientSeq++}-${crypto.randomBytes(8).toString('hex')}`,
    clientIp: String(rawClientIp).trim() || 'local',
    ws,
    currentRoom: null,
    isAuthenticated: ws.isAuthenticated,
    rysHandshakeToken: extractAuthTokenFromReq(req)
  };

  ws.rysAuthContext=ctx;
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
      if(!refreshRysNativeAuth(ctx))return;
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
              let sumSq = 0;
              const sampleCount = pcmSlice.length >> 1;
              for (let i = 0; i < sampleCount; i++) {
                const s = pcmSlice.readInt16LE(i << 1) / 32768;
                sumSq += s * s;
              }
              const rms = sampleCount > 0 ? Math.sqrt(sumSq / sampleCount) : 0;
              const computedLevel = rms < 0.0005 ? 0 : Math.min(1, Math.max(0.009, Math.round(rms * 6 * 1000) / 1000));
              fallbackPayload = {
                type: 'audio-chunk',
                seq,
                phraseStart,
                speakerId: ctx.clientId,
                audioSourceId:sender.audioSourceId||ctx.clientId,
                audioMediaEpoch:ctx.currentRoom.audioMediaEpoch||null,
                speakerName: sender.name,
                speakerRole: sender.role,
                sampleRate: 24000,
                pcm16: pcmSlice.toString('base64'),
                level: computedLevel,
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
    if(isValidAuthToken(msg.token))ctx.rysAuthToken=String(msg.token).trim();
    if(!refreshRysNativeAuth(ctx))return;
    if(handleRysNativeHandoff(ctx,msg))return;
    processClientJsonMessage(ctx, msg);
    }catch(e){rejectInput();}
  });

  ws.on('close', () => {
    ws.rysAuthContext=null;
    clearRysHandoff(ctx);
    if (ctx.currentRoom) {
      removeClientFromRoom(ctx.currentRoom, ctx.clientId);
    }
  });
});

// 30-Second Ping/Pong Heartbeat to prune zombie/dropped connections from mobile networks
const heartbeatTimer = setInterval(() => {
  cleanupStaleRelaySessions();pruneRysRooms();if(typeof pruneAuthState==='function')pruneAuthState();
  wss.clients.forEach((ws) => {
    if(ws.rysAuthContext&&!refreshRysNativeAuth(ws.rysAuthContext))return;
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    if(ws.rysAuthContext?.currentRoom?.clients.get(ws.rysAuthContext.clientId)?.role==='guide'){
      try{ws.send(JSON.stringify({type:'room-state',room:serializeRoom(ws.rysAuthContext.currentRoom,true)}));}catch(e){}
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
            // 600 ms / 28-frame HTTP relay buffer accommodates Saudi roaming 4G RTTs (150-300 ms) without dropping speech.
            sess.outbox = sess.outbox.filter((e) => e.message.type !== 'audio-chunk' || now - e.at <= 600);
            if (parsed.type === 'audio-chunk') {
              const audio = sess.outbox.filter((e) => e.message.type === 'audio-chunk');
              if (audio.length >= 28) {
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
    .filter((e) => e.message.type !== 'audio-chunk' || now - e.at <= 600)
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
  if(!id||id.length>160||id.startsWith('client-')){
    res.status(403).json({error:'relay-key-required'});return null;
  }
  if(typeof wss!=='undefined'&&wss&&wss.clients){
    for(const wsClient of wss.clients){
      if(wsClient?.rysAuthContext?.clientId===id){
        res.status(403).json({error:'relay-key-required'});return null;
      }
    }
  }
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
  }else{
    if(!s&&typeof consumeIpBucket==='function'){
      const legacyIp=String((typeof getClientIp==='function'?getClientIp(req):'')||req?.ip||req?.socket?.remoteAddress||'').trim();
      if(legacyIp&&!consumeIpBucket(legacyIp,'legacy-relay-create',300,60000)){
        res.status(429).json({error:'rate-limited'});return null;
      }
    }
    s=s||getOrCreateRelaySession(id);
  }
  if(s.relayRetired){res.status(409).json({error:'relay-session-retired',reason:s.relayRetiredReason||'handoff'});return null;}
  cleanupStaleRelaySessions();
  return s;
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
  const token=[request.token,ctx.rysAuthToken,ctx.rysHandshakeToken].find(isValidAuthToken);
  const principal=rysPrincipal(token),authed=!!principal;
  if(request.type==='admin-subscribe'&&!rysCanAdmin(principal))return 'scope-required';
  if(request.type==='join'&&request.role==='guide'&&!rysCanGuide(principal,request.tourCode))return 'scope-required';
  const handoffTour=request.type!=='admin-subscribe'?findRysTour(request.tourCode):null;
  if(request.type!=='admin-subscribe'&&!handoffTour)return 'tour-unknown';
  if(request.type==='join'){
    const handoffRoomId=String(request.roomId||'genel').trim().toLowerCase();
    if(handoffRoomId!=='genel'&&handoffRoomId!=='siyer'&&Array.isArray(handoffTour?.removedRoomIds)&&handoffTour.removedRoomIds.includes(handoffRoomId))
      return 'room-removed';
  }
  if(authed)ctx.rysAuthToken=String(token).trim();
  ctx.isAuthenticated=authed;ctx.ws.isAuthenticated=authed;
  if((request.type==='admin-subscribe'||request.type==='join'&&request.role==='guide')&&!authed)
    return 'auth-required';
  if((request.type==='family-subscribe'||request.type==='join'&&request.role!=='guide')&&!rysCanGuide(principal,request.tourCode)){
    const code=String(request.tourCode||'RY-KASIM').toUpperCase().trim();
    const tour=(db.tours||[]).find(t=>String(t.code||'').toUpperCase()===code);
    const reqPin=typeof getRequiredTourPin==='function'?getRequiredTourPin(tour):(tour&&(tour.pinProtected||tour.pin)?String(tour.pin||'').trim():'');
    if(reqPin&&reqPin!==String(request.pin||'').trim())
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
    if(typeof isIpBucketLocked==='function'&&ctx.clientIp&&isIpBucketLocked(ctx.clientIp,'ws-pin-fail',60)&&(request.type==='family-subscribe'||request.type==='join'&&request.role!=='guide')){
      fail('rate-limited');return true;
    }
    const invalid=validateRysHandoff(ctx,request);
    if(invalid){
      if(invalid==='pin-required'&&typeof consumeIpBucket==='function'&&ctx.clientIp&&String(request.pin||'').trim().length>0){
        if(!consumeIpBucket(ctx.clientIp,'ws-pin-fail',60,60000)){fail('rate-limited');return true;}
      }
      fail(invalid);return true;
    }
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
  const credential=[extractAuthTokenFromReq(req),token,context?.token].find(isValidAuthToken);
  const principal=rysPrincipal(credential),authenticated=!!principal;
  session.isAuthenticated=authenticated;session.ws.isAuthenticated=authenticated;
  const client=session.currentRoom?.clients.get(session.clientId);
  let allowed=true;
  if(context?.type==='admin-subscribe'||session.ws.isAdmin&&!context)allowed=rysCanAdmin(principal);
  else if(context?.type==='join'&&context.role==='guide')allowed=rysCanGuide(principal,context.tourCode);
  else if(client?.role==='guide'&&!context)allowed=rysCanGuide(principal,session.currentRoom.tourCode);
  // A rejected elevation must not erase a healthy public family's subscription/outbox.
  if(!allowed)return false;
  const nextCredential=authenticated?String(credential).trim():null;
  if((session.rysAuthToken||null)!==nextCredential){
    if(Array.isArray(session.outbox))session.outbox.length=0;
    session.mqttPublications=[];session.mqttVerified?.clear();session.presenceSnapshotAt=0;
  }
  session.rysAuthToken=nextCredential;
  return true;
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
  const room=session.currentRoom,member=room?.clients.get(session.clientId);
  const previous=session.ws.isAdmin?['admin-subscribe']:session.ws.familyTourCode?
    ['family-subscribe',session.ws.familyTourCode]:room?
    ['join',room.tourCode,room.roomId,member?.role||'pilgrim',member?.role==='guide'?member.audioSourceId||null:null]:['none'];
  const desired=context.type==='admin-subscribe'?['admin-subscribe']:context.type==='family-subscribe'?
    ['family-subscribe',String(context.tourCode||'RY-KASIM').toUpperCase().trim()]:
    ['join',String(context.tourCode||'RY-KASIM').toUpperCase().trim(),String(context.roomId||'genel').trim(),
      context.role==='guide'?'guide':'pilgrim',context.role==='guide'?context.audioSourceId||member?.audioSourceId||null:null];
  if(JSON.stringify(previous)!==JSON.stringify(desired)){
    const preservedTerminalErrors=Array.isArray(session.outbox)
      ?session.outbox.filter(raw=>{
          try{const p=typeof raw==='string'?JSON.parse(raw):raw;return p&&(p.type==='subscription-error'||p.type==='tour-unknown');}
          catch(e){return false;}
        })
      :[];
    if(Array.isArray(session.outbox))session.outbox.length=0;
    for(const kept of preservedTerminalErrors)session.outbox.push(kept);
    session.mqttPublications=[];session.mqttVerified?.clear();session.presenceSnapshotAt=0;
  }
  if(context.type==='join'){
    if(!syncRysRelayJoin(session,context))return false;
    session.ws.isAdmin=false;session.ws.familyTourCode=null;
    return true;
  }
  if(context.type!=='family-subscribe'&&context.type!=='admin-subscribe')return false;
  if(context.type==='admin-subscribe'){
    if(!session.ws.isAdmin||session.currentRoom||session.ws.familyTourCode)processClientJsonMessage(session,context);
    return !!session.ws.isAdmin&&!session.currentRoom&&!session.ws.familyTourCode;
  }
  const code=String(context.tourCode||'RY-KASIM').toUpperCase().trim();
  if(session.ws.familyTourCode!==code||session.currentRoom||session.ws.isAdmin)
    processClientJsonMessage(session,{...context,tourCode:code});
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

// Only a verified opaque capability may immediately retire a privileged membership.
// Legacy public IDs must not become an anonymous disconnect primitive.
function retireRysRelayOnAuthFailure(session){
  if(!session.relayKey)return;
  const room=session.currentRoom,member=room?.clients.get(session.clientId);
  if(member?.role!=='guide'&&!session.ws.isAdmin)return;
  session.relayRetired=true;session.currentRoom=null;
  session.ws.isAdmin=false;session.ws.familyTourCode=null;
  if(Array.isArray(session.outbox))session.outbox.length=0;
  if(room?.clients.has(session.clientId))removeClientFromRoom(room,session.clientId,0);
}

function serveRysRelay(session,req,res,token,context,messages=[]){
  session.clientIp=String((typeof getClientIp==='function'?getClientIp(req):'')||req?.ip||req?.socket?.remoteAddress||session.clientIp||'local').trim()||'local';
  if((context&&!isRysClientMessage(context))||!Array.isArray(messages)||messages.length>128||
    !messages.every(isRysClientMessage))return res.status(400).json({error:'relay-invalid-message'});
  if(context&&!['join','family-subscribe','admin-subscribe'].includes(context.type))
    return res.status(400).json({error:'relay-context-invalid'});
  if(!acceptRysRelayRequestOrder(session,req.method==='GET'?req.query:req.body,res))return;
  if(!applyRysRelayAuth(session,req,token,context)){
    retireRysRelayOnAuthFailure(session);
    return res.status(401).json({error:'relay-auth-required'});
  }
  if(!syncRysRelayContext(session,context)){
    const errors=drainRysRelaySession(session).filter(m=>m.type==='pin-error'||m.type==='auth-error'||m.type==='subscription-error');
    return res.json({clientId:session.clientId,messages:errors.length?errors:
      [{type:'pin-error',message:'Kafile/oda katılımı reddedildi; PIN ve yetkiyi kontrol edin.'}]});
  }
  session.lastSeen=Date.now();
  if(session.relayKey&&context){
    const digest=digestRysSubscription(context);
    if(session.relayDigest!==digest){session.relayDigest=digest;session.relayRevision=(session.relayRevision||0)+1;}
  }
  if(session.relayKey&&!context&&messages.some(m=>['join','family-subscribe','admin-subscribe'].includes(m?.type)))
    return res.status(400).json({error:'relay-context-required'});
  session.mqttPublications=[];
  const previousPublisher=globalThis.__rysMqttPublisher;
  globalThis.__rysMqttPublisher=session;
  try{for(const m of messages){
    if(!m||typeof m!=='object')continue;
    // Explicit context is the latest subscription. Do not replay stale queued joins.
    if(context&&['join','family-subscribe','admin-subscribe'].includes(m.type))continue;
    processClientJsonMessage(session,m);
  }
  }finally{globalThis.__rysMqttPublisher=previousPublisher;}
  const incoming=drainRysRelaySession(session);
  const seenPollAudioKeys=new Set();
  for(const item of incoming){
    if(item&&item.type==='audio-chunk'&&item.seq!=null){
      seenPollAudioKeys.add(`${item.audioSourceId||''}:${item.audioMediaEpoch||''}:${item.seq}`);
    }
  }
  const frames=req.body?.mqttFrames;
  if(Array.isArray(frames))for(const f of frames.slice(0,8)){
    try{
      const verified=rysVerifyMqtt(session,f);
      if(verified){
        if(verified.type==='audio-chunk'&&verified.seq!=null){
          const audioKey=`${verified.audioSourceId||''}:${verified.audioMediaEpoch||''}:${verified.seq}`;
          if(seenPollAudioKeys.has(audioKey))continue;
          seenPollAudioKeys.add(audioKey);
        }
        incoming.push(verified);
      }
    }catch(e){}
  }
  const publications=session.mqttPublications||[];session.mqttPublications=[];
  if(session.currentRoom?.clients.get(session.clientId)?.role==='guide'&&
    Date.now()-(session.presenceSnapshotAt||0)>=15000){
    session.presenceSnapshotAt=Date.now();incoming.push({type:'room-state',room:serializeRoom(session.currentRoom,true)});
  }
  return res.json({clientId:session.clientId,messages:incoming,mqttPublications:publications});
}

app.post('/api/ws-relay',(req,res)=>{
  if(['clientId','relayKey','token'].some(k=>req.body?.[k]!=null&&
    (typeof req.body[k]!=='string'||req.body[k].length>16384)))
    return res.status(400).json({error:'relay-invalid-credentials'});
  if(req.body?.messages!==undefined&&!Array.isArray(req.body.messages))
    return res.status(400).json({error:'relay-invalid-message'});
  if(['relay-open','relay-close'].includes(req.body?.type)&&!isRysClientMessage(req.body))
    return res.status(400).json({error:'relay-invalid-message'});
  if(req.body?.type==='relay-open'&&req.body.version===56){
    return relayOpenRateLimiter(req,res,()=>openRysRelay56(res));
  }
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
    mode==='family-subscribe'?{type:mode,tourCode:q.tourCode||'RY-KASIM',...(q.pin!==undefined?{pin:q.pin}:{})}:
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
    (cleanEmail === 'info@selametturizm.com' ||
      cleanEmail === 'selamet@selametturizm.com' ||
      cleanEmail === 'selamet' ||
      (SELAMET_USERNAME_ENV && cleanEmail === SELAMET_USERNAME_ENV)) &&
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

  if (typeof clearAuthRateLimitOnSuccess === 'function') {
    clearAuthRateLimitOnSuccess(req);
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

app.post('/api/logout', logoutRateLimiter, (req, res) => {
  const tok = extractAuthTokenFromReq(req);
  if (tok) revokeAuthToken(tok);
  const secureCookie = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${secureCookie}`);
  return res.json({ success: true });
});

app.post('/api/forgot-password', forgotPasswordRateLimiter, (req, res) => {
  const { email } = req.body || {};
  const cleanEmail = String(email || '').trim().slice(0, 160);
  return res.json({
    success: true,
    message: `${cleanEmail || 'Yetkili hesabınız'} için şifre yenileme talebiniz kaydedildi. Güvenlik nedeniyle yetkili şifre sıfırlama işlemleri Rıdvan Yılmaz Turizm Merkez Ofisi (+90 538 399 96 66) tarafından gerçekleştirilmektedir.`
  });
});

app.post('/api/demo-request', demoRequestRateLimiter, (req, res) => {
  const { name, company_name, phone, email, message } = req.body || {};
  if (!db.requests) db.requests = [];
  const item = {
    id: `req-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    name: String(name || 'İsimsiz Başvuru').trim().slice(0, 120),
    company_name: String(company_name || 'Belirtilmedi').trim().slice(0, 160),
    phone: String(phone || '').trim().slice(0, 40),
    email: String(email || '').trim().slice(0, 160),
    message: String(message || '').trim().slice(0, 2000),
    createdAt: new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
  };
  db.requests.unshift(item);
  if (db.requests.length > 200) db.requests.length = 200;
  saveState(db);
  broadcastToAdmins({ type: 'new-request', request: item, requests: db.requests });
  return res.json({
    success: true,
    request: item,
    message: 'Talebiniz Rıdvan Yılmaz Turizm operasyon ekibine (Beytullah Bey) iletilmiştir.'
  });
});

app.delete('/api/requests/:id', requireAuth, (req, res) => {
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanAdmin(principal)) {
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
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  res.setHeader('Vary', 'Origin, Cookie, Authorization');
  ensureJourneySteps();
  const bootstrapPrincipal = rysPrincipal(extractAuthTokenFromReq(req));
  const authedUser = bootstrapPrincipal ? getAuthenticatedUser(req) : null;
  const isAuthed = Boolean(bootstrapPrincipal && authedUser);
  const assignedCode = bootstrapPrincipal && bootstrapPrincipal.assignedTour ? String(bootstrapPrincipal.assignedTour).toUpperCase() : null;

  const rawTours = assignedCode
    ? (db.tours || []).filter((t) => String(t.code || '').toUpperCase() === assignedCode)
    : db.tours || [];
  const toursPayload = isAuthed
    ? rawTours
    : rawTours.map((t) => sanitizeTourForPublic(t));

  const guidesPayload = !isAuthed
    ? (db.guides || []).map((g) => sanitizeGuideForPublic(g))
    : assignedCode
      ? (db.guides || []).filter((g) => String(g.assignedTour || '').toUpperCase().trim() === assignedCode)
      : db.guides || [];

  const sosPayload = !isAuthed
    ? []
    : assignedCode
      ? (db.sosAlerts || []).filter((s) => String(s.tourCode || '').toUpperCase() === assignedCode)
      : db.sosAlerts;

  const requestsPayload = !isAuthed || assignedCode ? [] : db.requests || [];

  const pinProtectedCodes = new Set(
    (db.tours || [])
      .filter((t) => Boolean(t && (t.pinProtected || t.pin) && String(t.pin || '').trim()))
      .map((t) => String(t.code || '').toUpperCase().trim())
  );

  const liveRoomsList = Array.from(liveRooms.values())
    .filter((r) => !assignedCode || String(r.tourCode || '').toUpperCase() === assignedCode)
    .map((r) => {
      const serialized = serializeRoom(r, isAuthed);
      if (!isAuthed && serialized && pinProtectedCodes.has(String(r.tourCode || '').toUpperCase().trim())) {
        serialized.guideLocation = null;
      }
      return serialized;
    });

  const announcementsPayload = !isAuthed
    ? (db.announcements || []).filter((a) => !pinProtectedCodes.has(String(a.tourCode || '').toUpperCase().trim()))
    : assignedCode
      ? (db.announcements || []).filter((a) => {
          const tc = String(a.tourCode || '').toUpperCase().trim();
          return tc === assignedCode || tc === 'ALL';
        })
      : db.announcements || [];

  const journeyStepsPayload = {};
  for (const [k, v] of Object.entries(db.journeySteps || {})) {
    const upperK = String(k || '').toUpperCase().trim();
    if (assignedCode && upperK !== assignedCode) continue;
    if (!isAuthed && pinProtectedCodes.has(upperK)) continue;
    journeyStepsPayload[k] = v;
  }

  res.json({
    authenticated: isAuthed,
    user: authedUser || null,
    agency: db.agency,
    tours: toursPayload,
    guides: guidesPayload,
    hotels: db.hotels,
    announcements: announcementsPayload,
    sosAlerts: sosPayload,
    requests: requestsPayload,
    siyerPoints: db.siyerPoints,
    journeySteps: journeyStepsPayload,
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
  const requiredJoinTourPin = getRequiredTourPin(tour);
  if (requiredJoinTourPin && requiredJoinTourPin !== String(pin || '').trim()) {
    return res.status(403).json({
      success: false,
      message: 'Bu kafile odası PIN korumalıdır. Lütfen geçerli PIN kodunu giriniz.'
    });
  }
  const allocatedRoom=getOrCreateRoom(tour.code,'genel');
  if(!allocatedRoom)return res.status(503).json({success:false,error:'room-capacity'});
  const roomState=serializeRoom(allocatedRoom,false);
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
const RYS_TOUR_CODE_RE = /^[A-Z0-9_:-]{2,32}$/;

function evictTourLiveSubscribers(tourCode, reason = 'pin-changed') {
  const code = String(tourCode || '').toUpperCase().trim();
  if (!code) return;
  const isDeleted = reason === 'tour-deleted';
  const roomErrPayload = isDeleted
    ? JSON.stringify({ type: 'tour-unknown', code: 'tour-unknown', message: 'Bu kafile sonlandırıldı.' })
    : JSON.stringify({ type: 'pin-error', message: 'Kafile PIN kodu güncellendi. Lütfen yeni PIN kodu ile tekrar katılınız.' });
  const familyErrPayload = isDeleted
    ? JSON.stringify({ type: 'subscription-error', code: 'tour-unknown', message: 'Bu kafile sonlandırıldı.' })
    : JSON.stringify({ type: 'pin-error', message: 'Kafile PIN kodu güncellendi.' });

  for (const room of getTourRooms(code)) {
    for (const [cid, client] of Array.from(room.clients.entries())) {
      if (!isDeleted && client.role === 'guide') continue;
      try {
        if (client.ws && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(roomErrPayload);
        }
      } catch (e) {}
      if (client.ws && client.ws.rysAuthContext && client.ws.rysAuthContext.currentRoom === room) {
        client.ws.rysAuthContext.currentRoom = null;
      }
      const relaySess = httpRelaySessions.get(cid);
      if (relaySess) {
        relaySess.currentRoom = null;
        relaySess.relayDigest = null;
      }
      room.clients.delete(cid);
      if (room.activePublisherClientId === cid) {
        room.activePublisherClientId = null;
      }
      if (!isDeleted && client.ws && !client.ws.isHttpRelay) {
        try { client.ws.close(4003, 'pin-changed'); } catch (e) {}
      } else if (isDeleted && client.ws && !client.ws.isHttpRelay) {
        try { client.ws.close(4004, 'tour-deleted'); } catch (e) {}
      }
    }
    if (isDeleted) {
      dropRysRoom(room);
    } else {
      if (!room.clients.size) room.idleSince = Date.now();
      broadcastRoomState(room);
    }
  }

  wss.clients.forEach((ws) => {
    if (ws.familyTourCode === code) {
      ws.familyTourCode = null;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(familyErrPayload);
          if (!ws.isHttpRelay) {
            ws.close(isDeleted ? 4004 : 4003, isDeleted ? 'tour-deleted' : 'pin-changed');
          }
        }
      } catch (e) {}
    }
  });
  for (const sess of httpRelaySessions.values()) {
    if (sess.ws.familyTourCode === code) {
      sess.ws.familyTourCode = null;
      sess.relayDigest = null;
      try { sess.ws.send(familyErrPayload); } catch (e) {}
    }
  }

  for (const [endpoint, sub] of rysPushSubs) {
    if (sub.tourCode === code) rysPushDrop(endpoint);
  }
  db.pushSubscriptions = Array.from(rysPushSubs.values());
}

function sanitizeCustomRoomsList(rawRooms, guideName) {
  const baseRooms = [
    { id: 'genel', name: 'Genel Kafile & Tavaf Yayını', guide: guideName, active: true },
    { id: 'siyer', name: 'Siyer-i Nebi Sohbet Odası', guide: guideName, active: true }
  ];
  const seen = new Set(['genel', 'siyer']);
  if (!rawRooms) return baseRooms;
  const parseRoomToken = (entry) => {
    const trimmed = String(entry || '').trim();
    if (!trimmed) return null;
    const sep = trimmed.indexOf(':');
    if (sep > 0) {
      return { id: trimmed.slice(0, sep).trim(), name: trimmed.slice(sep + 1).trim() };
    }
    const slug = trimmed
      .toLowerCase()
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28);
    return { id: slug, name: trimmed };
  };
  let items = [];
  if (Array.isArray(rawRooms)) {
    items = rawRooms.map((item) => (typeof item === 'string' ? parseRoomToken(item) : item)).filter(Boolean);
  } else if (typeof rawRooms === 'string' && rawRooms.trim()) {
    items = rawRooms
      .split(/[\r\n,]+/)
      .map(parseRoomToken)
      .filter(Boolean);
  }
  for (const item of items) {
    if (baseRooms.length >= 12) break;
    const id = String((item && item.id) || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 32);
    const name = String((item && item.name) || id)
      .trim()
      .slice(0, 80);
    if (!id || id.length < 2 || seen.has(id) || !name) continue;
    seen.add(id);
    baseRooms.push({ id, name, guide: guideName, active: true });
  }
  return baseRooms;
}

app.post('/api/tours', requireAuth, (req, res) => {
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanAdmin(principal)) {
    return res.status(403).json({ success: false, message: 'Alt acente hesabı yeni kafile oluşturamaz.' });
  }
  if (db.tours.length >= 200) {
    return res.status(400).json({ success: false, message: 'Maksimum aktif kafile sınırına (200) ulaşıldı.' });
  }
  const body = req.body || {};
  const code = String(body.code || `RY-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase().trim();
  if (!RYS_TOUR_CODE_RE.test(code) || code === 'ALL') {
    return res.status(400).json({
      success: false,
      message: 'Kafile kodu yalnızca harf, rakam, tire (-) veya alt çizgi (_) içerebilir (2–24 karakter).'
    });
  }
  if (db.tours.some((t) => String(t.code || '').toUpperCase() === code)) {
    return res.status(400).json({
      success: false,
      message: `"${code}" kafile kodu zaten kullanımda. Lütfen farklı bir kafile kodu belirleyiniz.`
    });
  }
  const cleanPin = String(body.pin || '').trim().slice(0, 32);
  const cleanGuideName = String(body.guideName || 'Rıdvan Yılmaz Hoca').trim().slice(0, 120) || 'Rıdvan Yılmaz Hoca';
  const newTour = {
    id: `tour-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    code,
    name: String(body.name || 'Yeni Siyer Umresi Kafilesi').trim().slice(0, 140) || 'Yeni Siyer Umresi Kafilesi',
    dateText: String(body.dateText || '2026 - 2027 Sezonu').trim().slice(0, 80),
    duration: String(body.duration || '15 Gün').trim().slice(0, 80),
    guideId: String(body.guideId || 'guide-1').trim().slice(0, 64),
    guideName: cleanGuideName,
    makkahHotel: String(body.makkahHotel || 'Mekke Otel Kudi Tower').trim().slice(0, 160),
    madinahHotel: String(body.madinahHotel || 'Medine Merkezi Ravza Oteli').trim().slice(0, 160),
    pin: cleanPin,
    pinProtected: Boolean(cleanPin),
    status: String(body.status || 'active').trim().slice(0, 32),
    capacity:
      body.capacity !== undefined && String(body.capacity).trim() !== '' && Number.isFinite(Number(body.capacity))
        ? Math.max(1, Math.min(10000, Number(body.capacity)))
        : 100,
    registeredCount:
      body.registeredCount !== undefined && String(body.registeredCount).trim() !== '' && Number.isFinite(Number(body.registeredCount))
        ? Math.max(0, Math.min(10000, Number(body.registeredCount)))
        : 1,
    description: String(body.description || 'Rıdvan Yılmaz Turizm Siyer Umresi Kafilesi').trim().slice(0, 600),
    rooms: sanitizeCustomRoomsList(body.customRooms !== undefined ? body.customRooms : body.rooms, cleanGuideName)
  };
  db.tours.unshift(newTour);
  if (newTour.guideName && db.guides.length < 300 && !db.guides.some((g) => g.name.toLowerCase() === newTour.guideName.toLowerCase())) {
    db.guides.push({
      id: `guide-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
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
  for (const rm of newTour.rooms || []) {
    if (rm && rm.id) getOrCreateRoom(newTour.code, rm.id);
  }
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
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanGuide(principal, tour.code)) {
    return res.status(403).json({ success: false, message: 'Yalnızca kendi acentenize atanmış kafileyi düzenleyebilirsiniz.' });
  }
  const body = req.body || {};
  const prevPin = String(tour.pin || '').trim();
  if (typeof body.name === 'string' && body.name.trim()) tour.name = body.name.trim().slice(0, 140);
  if (typeof body.dateText === 'string' && body.dateText.trim()) tour.dateText = body.dateText.trim().slice(0, 80);
  if (typeof body.duration === 'string' && body.duration.trim()) tour.duration = body.duration.trim().slice(0, 80);
  if (typeof body.guideName === 'string' && body.guideName.trim()) {
    tour.guideName = body.guideName.trim().slice(0, 120);
    if (
      rysCanAdmin(principal) &&
      db.guides.length < 300 &&
      !db.guides.some((g) => g.name.toLowerCase() === tour.guideName.toLowerCase())
    ) {
      db.guides.push({
        id: `guide-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
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
  if (typeof body.makkahHotel === 'string' && body.makkahHotel.trim()) tour.makkahHotel = body.makkahHotel.trim().slice(0, 160);
  if (typeof body.madinahHotel === 'string' && body.madinahHotel.trim()) tour.madinahHotel = body.madinahHotel.trim().slice(0, 160);
  if (typeof body.description === 'string') tour.description = body.description.trim().slice(0, 600);
  if (typeof body.status === 'string' && body.status.trim()) tour.status = body.status.trim().slice(0, 32);
  if (body.capacity !== undefined && String(body.capacity).trim() !== '' && Number.isFinite(Number(body.capacity))) {
    tour.capacity = Math.max(1, Math.min(10000, Number(body.capacity)));
  }
  if (body.registeredCount !== undefined && String(body.registeredCount).trim() !== '' && Number.isFinite(Number(body.registeredCount))) {
    tour.registeredCount = Math.max(0, Math.min(10000, Number(body.registeredCount)));
  }
  if (body.customRooms !== undefined || Array.isArray(body.rooms)) {
    const prevConfiguredRoomIds = new Set(
      (Array.isArray(tour.rooms) ? tour.rooms : []).map((rm) => rm && rm.id).filter(Boolean)
    );
    tour.rooms = sanitizeCustomRoomsList(body.customRooms !== undefined ? body.customRooms : body.rooms, tour.guideName);
    const nextAllowedRoomIds = new Set(['genel', 'siyer', ...tour.rooms.map((rm) => rm && rm.id).filter(Boolean)]);
    const removedSet = new Set(
      (Array.isArray(tour.removedRoomIds) ? tour.removedRoomIds : [])
        .map((x) => String(x || '').trim().toLowerCase())
        .filter((x) => x && !nextAllowedRoomIds.has(x))
    );
    for (const prevId of prevConfiguredRoomIds) {
      const lowerPrev = String(prevId || '').trim().toLowerCase();
      if (lowerPrev && lowerPrev !== 'genel' && lowerPrev !== 'siyer' && !nextAllowedRoomIds.has(lowerPrev)) {
        removedSet.add(lowerPrev);
      }
    }
    const roomRemovedPayload = JSON.stringify({
      type: 'subscription-error',
      code: 'room-removed',
      fallbackRoomId: 'genel',
      message: 'Bu özel oda acente tarafından kapatıldı. Lütfen Genel Yayın odasına geçiniz.'
    });
    let droppedCustomRoom = false;
    for (const r of getTourRooms(tour.code)) {
      if (!nextAllowedRoomIds.has(r.roomId) && (prevConfiguredRoomIds.has(r.roomId) || (r.roomId !== 'genel' && r.roomId !== 'siyer'))) {
        removedSet.add(String(r.roomId || '').trim().toLowerCase());
        droppedCustomRoom = true;
        for (const [cid, client] of Array.from(r.clients.entries())) {
          try {
            if (client.ws && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(roomRemovedPayload);
            }
          } catch (e) {}
          if (client.ws && client.ws.rysAuthContext && client.ws.rysAuthContext.currentRoom === r) {
            client.ws.rysAuthContext.currentRoom = null;
          }
          const relaySess = httpRelaySessions.get(cid);
          if (relaySess && relaySess.currentRoom === r) {
            relaySess.currentRoom = null;
            relaySess.relayDigest = null;
          }
          r.clients.delete(cid);
          if (client.ws && !client.ws.isHttpRelay) {
            try { client.ws.close(4005, 'room-removed'); } catch (e) {}
          }
        }
        dropRysRoom(r);
      }
    }
    tour.removedRoomIds = Array.from(removedSet).slice(-64);
    for (const rm of tour.rooms) {
      if (rm && rm.id) getOrCreateRoom(tour.code, rm.id);
    }
    if (droppedCustomRoom) {
      evaluateTourGuidePresence(tour.code);
    }
  }
  let pinTightened = false;
  if (typeof body.pin === 'string') {
    tour.pin = body.pin.trim().slice(0, 32);
    tour.pinProtected = Boolean(tour.pin);
    if (tour.pinProtected && tour.pin !== prevPin) {
      pinTightened = true;
    }
  }

  for (const r of getTourRooms(tour.code)) {
    r.tourName = tour.name;
  }
  if (pinTightened) {
    evictTourLiveSubscribers(tour.code, 'pin-changed');
  }
  saveState(db);
  const firstRoom = getTourRooms(tour.code)[0];
  if (firstRoom) {
    broadcastRoomState(firstRoom);
  }
  broadcastToAdmins({
    type: 'admin-rooms-update',
    rooms: Array.from(liveRooms.values()).map((r) => serializeRoom(r, true))
  });
  return res.json({ success: true, tour });
});

app.delete('/api/tours/:id', requireAuth, (req, res) => {
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanAdmin(principal)) {
    return res.status(403).json({ success: false, message: 'Alt acente hesabı kafile silemez.' });
  }
  const targetId = String(req.params.id || '').trim();
  const targetUpper = targetId.toUpperCase();
  const deletedTour = db.tours.find((t) => t.id === targetId || String(t.code || '').toUpperCase() === targetUpper);
  if (!deletedTour) {
    return res.status(404).json({ success: false, message: 'Silinecek kafile bulunamadı.' });
  }
  const deletedCode = String(deletedTour.code || '').toUpperCase().trim();
  db.tours = db.tours.filter((t) => t.id !== deletedTour.id);
  if (deletedCode) {
    evictTourLiveSubscribers(deletedCode, 'tour-deleted');
    db.announcements = db.announcements.filter((a) => a.tourCode !== deletedCode);
    if (db.journeySteps && db.journeySteps[deletedCode]) {
      delete db.journeySteps[deletedCode];
    }
    for(const [endpoint,subscription] of rysPushSubs)if(subscription.tourCode===deletedCode)rysPushDrop(endpoint);
    db.pushSubscriptions=Array.from(rysPushSubs.values());
    for(const [endpoint,subscription] of rysSosPushSubs)if(subscription.tourCode===deletedCode)rysSosPushDrop(endpoint);
    db.sosPushSubscriptions=Array.from(rysSosPushSubs.values());
    for (const [key, room] of liveRooms.entries()) {
      if (room.tourCode === deletedCode) {
        dropRysRoom(room);
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
  res.setHeader('Cache-Control', 'no-store');
  const code = String(req.params.code || 'RY-KASIM').toUpperCase().trim();
  const rawTour = findRysTour(code);
  if (!rawTour) {
    return res.status(404).json({
      success: false,
      error: 'tour-unknown',
      tour: null,
      steps: [],
      stats: computeJourneyStats([]),
      room: null,
      announcements: []
    });
  }
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  const isAuthedForTour = rysCanGuide(principal, code);
  const requiresPin = Boolean(getRequiredTourPin(rawTour));
  const headerPin = typeof decodeTourPinHeader === 'function' ? decodeTourPinHeader(req) : String(req.headers['x-tour-pin'] || '');
  const suppliedPin = String(headerPin || req.query?.pin || '').trim();
  const reqIp = getClientIp(req);
  if (requiresPin && !isAuthedForTour && suppliedPin.length > 0) {
    if (isIpBucketLocked(reqIp, 'steps-pin-fail', 60)) {
      return res.status(429).json({
        success: false,
        error: 'rate-limited',
        message: 'Çok fazla hatalı PIN denemesi yapıldı. Lütfen 1 dakika bekleyiniz.'
      });
    }
    if (suppliedPin !== String(rawTour.pin).trim()) {
      if (!consumeIpBucket(reqIp, 'steps-pin-fail', 60, 60000)) {
        return res.status(429).json({
          success: false,
          error: 'rate-limited',
          message: 'Çok fazla hatalı PIN denemesi yapıldı. Lütfen 1 dakika bekleyiniz.'
        });
      }
    }
  }
  const pinSatisfied = !requiresPin || isAuthedForTour || suppliedPin === String(rawTour.pin).trim();
  const tour = isAuthedForTour ? rawTour : sanitizeTourForPublic(rawTour);
  const steps = pinSatisfied ? getTourSteps(code) : [];
  const stats = computeJourneyStats(steps);
  let room = null;
  if (pinSatisfied) {
    const allocatedRoom = getOrCreateRoom(code, 'genel');
    if (!allocatedRoom) {
      return res.status(503).json({ success: false, error: 'room-capacity' });
    }
    room = serializeRoom(allocatedRoom, false);
  }
  const announcements = pinSatisfied
    ? db.announcements.filter((a) => a.tourCode === code || a.tourCode === 'ALL')
    : [];
  return res.json({
    success: true,
    pinRequired: !pinSatisfied,
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
  if (!findRysTour(code)) {
    return res.status(404).json({ success: false, error: 'tour-unknown', message: 'Kafile bulunamadı.' });
  }
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanGuide(principal, code)) {
    return res.status(403).json({ success: false, message: 'Bu kafilenin rotası üzerinde işlem yetkiniz yok.' });
  }
  const body = req.body || {};
  const steps = getTourSteps(code);
  if (steps.length >= 100) {
    return res.status(400).json({ success: false, message: 'Bir kafile için en fazla 100 rota durağı eklenebilir.' });
  }

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
    id: `step-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    order: insertIndex + 1,
    dayLabel: String(body.dayLabel || `Canlı Durak • ${nowStr}`).trim().slice(0, 120),
    title: String(body.title || 'Yeni Siyer & Ziyaret Durağı').trim().slice(0, 180) || 'Yeni Siyer & Ziyaret Durağı',
    locationLabel: String(body.locationLabel || 'Kutsal Topraklar • Canlı Konum').trim().slice(0, 160),
    category: String(body.category || 'siyer').trim().slice(0, 40),
    lat,
    lng,
    distanceKm: computedKm,
    status,
    timestamp: String(body.timestamp || `Bugün ${nowStr}`).trim().slice(0, 80),
    guideNote: String(
      body.guideNote ||
        'Rehber hocamız eşliğinde bu mübarek noktada Siyer-i Nebi sohbeti ve dua halkası gerçekleştirildi.'
    )
      .trim()
      .slice(0, 1200),
    prayerSummary: String(
      body.prayerSummary || 'Allâhümme salli alâ seyyidinâ Muhammedin ve alâ âli seyyidinâ Muhammed.'
    )
      .trim()
      .slice(0, 800)
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
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanGuide(principal, code)) {
    return res.status(403).json({ success: false, message: 'Bu kafilenin rotası üzerinde işlem yetkiniz yok.' });
  }
  const stepId = req.params.stepId;
  const body = req.body || {};
  const steps = getTourSteps(code);
  const idx = steps.findIndex((s) => s.id === stepId);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Durak bulunamadı.' });
  }

  const target = steps[idx];
  if (typeof body.title === 'string' && body.title.trim()) target.title = body.title.trim().slice(0, 180);
  if (typeof body.dayLabel === 'string' && body.dayLabel.trim()) target.dayLabel = body.dayLabel.trim().slice(0, 120);
  if (typeof body.locationLabel === 'string' && body.locationLabel.trim()) target.locationLabel = body.locationLabel.trim().slice(0, 160);
  if (typeof body.category === 'string' && body.category.trim()) target.category = body.category.trim().slice(0, 40);
  if (typeof body.guideNote === 'string') target.guideNote = body.guideNote.trim().slice(0, 1200);
  if (typeof body.prayerSummary === 'string') target.prayerSummary = body.prayerSummary.trim().slice(0, 800);
  if (typeof body.timestamp === 'string') target.timestamp = body.timestamp.trim().slice(0, 80);
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
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanGuide(principal, code)) {
    return res.status(403).json({ success: false, message: 'Bu kafilenin rotası üzerinde işlem yetkiniz yok.' });
  }
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
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanAdmin(principal)) {
    return res.status(403).json({ success: false, message: 'Yeni rehber ekleme yetkisi yalnızca ana acente yöneticisine açıktır.' });
  }
  const assignedTour = String(body.assignedTour || 'RY-KASIM').toUpperCase().trim();
  if (!findRysTour(assignedTour)) {
    return res.status(404).json({ success: false, message: 'Atanacak kafile kodu bulunamadı.' });
  }
  if (db.guides.length >= 300) {
    return res.status(400).json({ success: false, message: 'Maksimum rehber kaydı sınırına (300) ulaşıldı.' });
  }
  const guide = {
    id: `guide-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    name: String(body.name || 'Yeni Rehber Hoca').trim().slice(0, 120),
    title: String(body.title || 'Kafile İrşad Rehberi').trim().slice(0, 140),
    phone: String(body.phone || '+90 538 399 96 66').trim().slice(0, 40),
    email: String(body.email || `rehber${Date.now()}@ridvanyilmazturizm.com`).trim().slice(0, 160),
    specialty: String(body.specialty || 'Siyer ve Umre Rehberliği').trim().slice(0, 200),
    status: 'online',
    assignedTour
  };
  db.guides.push(guide);
  saveState(db);
  res.json({ success: true, guide });
});

app.delete('/api/guides/:id', requireAuth, (req, res) => {
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanAdmin(principal)) {
    return res.status(403).json({ success: false, message: 'Rehber kaydı silme yetkisi yalnızca ana acente yöneticisine açıktır.' });
  }
  const targetId = req.params.id;
  const targetGuide = db.guides.find((g) => g.id === targetId);
  if (!targetGuide) {
    return res.status(404).json({ success: false, message: 'Silinecek rehber bulunamadı.' });
  }
  if (db.guides.length <= 1) {
    return res.status(400).json({ success: false, message: 'Sistemde en az bir aktif rehber kaydı bulunmalıdır.' });
  }
  db.guides = db.guides.filter((g) => g.id !== targetId);
  saveState(db);
  return res.json({ success: true });
});

// 6. Push Announcements
app.post('/api/announcements', requireAuth, (req, res) => {
  const body = req.body || {};
  const tourCode=String(body.tourCode||'RY-KASIM').toUpperCase().trim();
  const principal=rysPrincipal(extractAuthTokenFromReq(req));
  if(tourCode==='ALL'?!rysCanAdmin(principal):!rysCanGuide(principal,tourCode))
    return res.status(403).json({success:false,error:'announcement-scope'});
  if(tourCode!=='ALL'&&!findRysTour(tourCode))return res.status(404).json({success:false,error:'tour-unknown'});
  const ann = {
    id: `ann-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
    tourCode,
    title: String(body.title || 'Kafile Duyurusu').trim().slice(0, 140) || 'Kafile Duyurusu',
    message: String(body.message || '').trim().slice(0, 1200),
    sender: String(body.sender || 'Rıdvan Yılmaz Turizm Operasyon').trim().slice(0, 120),
    createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    urgent: Boolean(body.urgent)
  };
  db.announcements.unshift(ann);
  if (db.announcements.length > 100) db.announcements.length = 100;
  saveState(db);
  queueRysPushAnnouncement(ann,ann.tourCode==='ALL');

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
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (deletedAnn.tourCode === 'ALL' ? !rysCanAdmin(principal) : !rysCanGuide(principal, deletedAnn.tourCode)) {
    return res.status(403).json({ success: false, message: 'Bu duyuru kaydını silme yetkiniz yok.' });
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
  const visibleAnnouncements = principal?.assignedTour
    ? db.announcements.filter((a) => a.tourCode === principal.assignedTour || a.tourCode === 'ALL')
    : db.announcements;
  return res.json({ success: true, id: targetId, announcements: visibleAnnouncements });
});

// 7. SOS Emergency API
function recordAndBroadcastSosAlert(raw) {
  const nowMs = Date.now();
  const requestedId = raw.id ? String(raw.id).trim().slice(0, 64) : '';
  const safeClientSosId = /^sos-[A-Za-z0-9_-]{4,60}$/.test(requestedId) ? requestedId : '';
  const tourCode = String(raw.tourCode || 'RY-KASIM').toUpperCase().trim().slice(0, 96);
  const pilgrimName = String(raw.pilgrimName || 'Hacı Misafir').trim().slice(0, 120);

  const existingById = safeClientSosId
    ? db.sosAlerts.find((s) => s.id === safeClientSosId && s.tourCode === tourCode)
    : null;
  const existing =
    existingById ||
    db.sosAlerts.find(
      (s) =>
        s.status === 'active' &&
        s.tourCode === tourCode &&
        s.pilgrimName === pilgrimName &&
        s.createdAtMs &&
        nowMs - s.createdAtMs < 10000
    );
  if (existing) {
    return {
      id: existing.id,
      tourCode: existing.tourCode,
      status: existing.status,
      isTest: Boolean(existing.isTest),
      duplicate: true
    };
  }

  const idAlreadyUsed = safeClientSosId && db.sosAlerts.some((s) => s.id === safeClientSosId);
  const finalId = safeClientSosId && !idAlreadyUsed
    ? safeClientSosId
    : `sos-${nowMs}-${crypto.randomBytes(4).toString('hex')}`;
  const rawPhone = String(raw.phone == null ? '' : raw.phone).trim().slice(0, 40);
  const numLat = raw.lat === null || raw.lat === undefined || raw.lat === '' ? NaN : Number(raw.lat);
  const numLng = raw.lng === null || raw.lng === undefined || raw.lng === '' ? NaN : Number(raw.lng);
  const hasRealCoords =
    Number.isFinite(numLat) &&
    Number.isFinite(numLng) &&
    !(numLat === 0 && numLng === 0) &&
    Math.abs(numLat) <= 90 &&
    Math.abs(numLng) <= 180;
  const gpsSource = !hasRealCoords
    ? 'none'
    : raw.gpsSource === 'tour-fallback' || raw.gpsSource === 'tour-step-fallback'
      ? 'tour-fallback'
      : 'live-gps';
  const defaultNote = hasRealCoords
    ? 'Mescid-i Haram / Kâbe-i Muazzama Çevresi'
    : '⚠️ Cihaz GPS Konumu Alınamadı — Lütfen Hacıyla Telefon/WhatsApp Üzerinden İletişime Geçin';
  const resolvedNote = String(raw.locationNote || raw.note || defaultNote).trim().slice(0, 300);
  const alertItem = {
    id: finalId,
    tourCode,
    deviceId: String(raw.deviceId || '').trim().slice(0, 96),
    pilgrimName,
    phone: rawPhone,
    lat: hasRealCoords ? numLat : null,
    lng: hasRealCoords ? numLng : null,
    accuracy: hasRealCoords && raw.accuracy ? Number(raw.accuracy) : null,
    gpsSource,
    locationNote: resolvedNote,
    note: resolvedNote,
    createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    createdAtMs: nowMs,
    status: 'active',
    isTest: Boolean(raw.isTest),
    resolvedBy: null
  };
  db.sosAlerts.unshift(alertItem);
  if (db.sosAlerts.length > 100) db.sosAlerts.length = 100;
  saveState(db);

  broadcastToGuidesInTour(alertItem.tourCode, { type: 'sos-alert', alert: alertItem });
  broadcastToAdmins({ type: 'sos-alert', alert: alertItem, sosAlerts: db.sosAlerts });
  if (!alertItem.isTest) {
    queueRysPushSos(alertItem);
    sendEmergencySosEmail(alertItem);
  }
  return alertItem;
}

app.post('/api/sos', sosRateLimiter, (req, res) => {
  const body = req.body || {};
  const tourCode = String(body.tourCode || 'RY-KASIM').toUpperCase().trim();
  const tour = findRysTour(tourCode);
  if (!tour) {
    return res.status(404).json({ success: false, error: 'tour-unknown', message: 'Geçersiz kafile kodu.' });
  }
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  const isAuthedGuide = rysCanGuide(principal, tourCode);
  const requiredPin = getRequiredTourPin(tour);
  if (requiredPin && !isAuthedGuide) {
    const headerPin = typeof decodeTourPinHeader === 'function' ? decodeTourPinHeader(req) : String(req.headers['x-tour-pin'] || '');
    const suppliedPin = String(body.pin || headerPin || '').trim();
    if (suppliedPin && suppliedPin !== requiredPin) {
      const reqDeviceId = String(body.deviceId || '').trim();
      const inLiveRoom = Boolean(
        reqDeviceId &&
          getTourRooms(tourCode).some((r) =>
            Array.from(r.clients.values()).some((c) => c.deviceId && c.deviceId === reqDeviceId)
          )
      );
      if (!inLiveRoom) {
        return res.status(403).json({ success: false, error: 'pin-error', message: 'Bu kafile için geçerli PIN kodu gereklidir.' });
      }
    }
  }
  const isAuthedTest = Boolean(body.isTest && isAuthedGuide);
  const alertItem = recordAndBroadcastSosAlert({ ...body, tourCode, isTest: isAuthedTest });
  res.json({ success: true, duplicate: Boolean(alertItem.duplicate), alert: alertItem });
});

app.patch('/api/sos/:id/resolve', requireAuth, (req, res) => {
  const alertItem = db.sosAlerts.find((s) => s.id === req.params.id);
  if (!alertItem) return res.status(404).json({ success: false });
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanGuide(principal, alertItem.tourCode)) {
    return res.status(403).json({ success: false, message: 'Bu SOS kaydı üzerinde yetkiniz yok.' });
  }
  alertItem.status = 'resolved';
  alertItem.resolvedBy = String((req.body && req.body.resolvedBy) || 'Rıdvan Yılmaz Hoca').trim().slice(0, 120);
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
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanGuide(principal, targetAlert.tourCode)) {
    return res.status(403).json({ success: false, message: 'Bu SOS kaydını silme yetkiniz yok.' });
  }
  db.sosAlerts = db.sosAlerts.filter((s) => s.id !== targetId);
  saveState(db);
  broadcastToGuidesInTour(targetAlert.tourCode, { type: 'sos-resolved', alert: targetAlert });
  broadcastToAdmins({ type: 'sos-resolved', alert: targetAlert, sosAlerts: db.sosAlerts });
  const visibleSosAlerts = principal?.assignedTour
    ? db.sosAlerts.filter((s) => s.tourCode === principal.assignedTour)
    : db.sosAlerts;
  return res.json({ success: true, sosAlerts: visibleSosAlerts });
});

// 8. REA Analysis Report Endpoint
const REA_SUMMARY_FILE = path.join(__dirname, 'data', 'rea-summary.json');
const MAX_REA_INLINE_BYTES = 5 * 1024 * 1024; // 5 MB safety limit
app.get('/api/rea-report', requireAuth, async (req, res) => {
  const principal = rysPrincipal(extractAuthTokenFromReq(req));
  if (!rysCanAdmin(principal)) {
    return res.status(403).json({
      available: false,
      error: 'Bu teknik mimari raporu yalnızca ana acente yöneticisine açıktır.'
    });
  }
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
    return res.status(500).json({ available: false, error: 'rea-report-error' });
  }
  return res.json({ available: false });
});

// 9. QR Code & WhatsApp Invite Generator Endpoint
function resolveTrustedPublicBaseUrl(req) {
  const isAllowedPublicOrigin = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return null;
    try {
      const u = new URL(candidate);
      if (u.origin === 'https://ses.ridvanyilmazturizm.com' || u.origin === 'https://ridvanses.vercel.app') {
        return u.origin;
      }
      if (/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(u.origin)) {
        return u.origin;
      }
    } catch (e) {}
    return null;
  };
  if (req.query && req.query.baseUrl) {
    const allowedOverride = isAllowedPublicOrigin(String(req.query.baseUrl).trim());
    if (allowedOverride) return allowedOverride;
  }
  const rawHost = String(req.get('host') || '').trim().toLowerCase();
  const proto = req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0].trim().toLowerCase()
    : req.protocol || 'https';
  const inferred = isAllowedPublicOrigin(`${proto === 'http' ? 'http' : 'https'}://${rawHost}`);
  return inferred || 'https://ses.ridvanyilmazturizm.com';
}

const qrRateLimiter = createRateLimiter({ max: 2400, windowMs: 60000, message: 'Çok fazla QR isteği gönderildi.' });

app.get('/api/qr-img', qrRateLimiter, async (req, res) => {
  try {
    const code = String(req.query.code || 'RY-KASIM').toUpperCase().trim();
    if (!findRysTour(code)) {
      return res.status(404).send('');
    }
    const room =
      String(req.query.room || 'genel')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 64) || 'genel';
    const pilgrimName = String(req.query.name || '').trim().slice(0, 80);
    const baseUrl = resolveTrustedPublicBaseUrl(req);
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

app.get('/api/qr', qrRateLimiter, async (req, res) => {
  try {
    const code = String(req.query.code || 'RY-KASIM').toUpperCase().trim();
    const tour = findRysTour(code);
    if (!tour) {
      return res.status(404).json({ success: false, error: 'tour-unknown', message: 'Kafile bulunamadı.' });
    }
    const room =
      String(req.query.room || 'genel')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 64) || 'genel';
    const pilgrimName = String(req.query.name || '').trim().slice(0, 80);
    const targetMode = String(req.query.target || '').trim().toLowerCase();
    const baseUrl = resolveTrustedPublicBaseUrl(req);
    let joinUrl = `${baseUrl}/dinle?code=${encodeURIComponent(code)}&room=${encodeURIComponent(room)}`;
    if (pilgrimName) {
      joinUrl += `&name=${encodeURIComponent(pilgrimName)}`;
    }
    const familyTrackUrl = `${baseUrl}/rota?code=${encodeURIComponent(code)}`;
    const keepsakeBookUrl = `${baseUrl}/ani-kitabi?code=${encodeURIComponent(code)}`;
    const qrTargetUrl =
      targetMode === 'ani-kitabi'
        ? keepsakeBookUrl
        : targetMode === 'rota'
          ? familyTrackUrl
          : joinUrl;

    const dataUrl = await QRCode.toDataURL(qrTargetUrl, {
      width: 360,
      margin: 1,
      color: {
        dark: '#0a3d30',
        light: '#ffffff'
      }
    });

    const isPinTour = Boolean((tour.pinProtected || tour.pin) && String(tour.pin || '').trim());
    const accessPhrase = isPinTour
      ? 'uygulama indirmeden, acentemizin paylaştığı kafile PIN kodunuzla'
      : 'uygulama veya şifre gerekmeden';
    const whatsappText =
      `🕋 *Rıdvan Yılmaz Turizm — Canlı Rehberlik & Manevi Rota*\n\n` +
      `Kıymetli Misafirimiz,\n` +
      `*${tour.name}* (${tour.guideName}) canlı sesli rehberlik odamıza ${accessPhrase} aşağıdaki bağlantıya dokunarak hemen katılabilirsiniz:\n\n` +
      `🎧 *Canlı Yayına Katıl:* ${joinUrl}\n` +
      `📍 *Aile Canlı Rota Takibi:* ${familyTrackUrl}\n` +
      `📖 *Umre Hatıra Kitapçığı:* ${keepsakeBookUrl}\n` +
      `🔑 *Kafile Kodu:* ${tour.code}${isPinTour ? ' (🔒 PIN Korumalı)' : ''}\n` +
      `🏨 *Mekke Otel:* ${tour.makkahHotel}\n` +
      `🚨 *Acil İletişim:* +90 538 399 96 66`;

    const qrPrincipal = rysPrincipal(extractAuthTokenFromReq(req));
    return res.json({
      success: true,
      code,
      room,
      tour: rysCanGuide(qrPrincipal, tour.code || code) ? tour : sanitizeTourForPublic(tour),
      joinUrl: qrTargetUrl,
      listenUrl: joinUrl,
      familyTrackUrl,
      keepsakeBookUrl,
      dataUrl,
      whatsappText,
      whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(whatsappText)}`
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'qr-generation-failed' });
  }
});

// ======================== STATIC & PAGE ROUTES ========================
const protectedRoutes = new Set([
  '/rehber',
  '/hoca',
  '/rehber.html',
  '/panel',
  '/acente-kafile-yonetim-sistemi',
  '/panel.html',
  '/yaka-karti',
  '/yaka-karti.html'
]);

app.use((req, res, next) => {
  const normalizedPath = String(req.path || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (protectedRoutes.has(normalizedPath) && !isRequestAuthenticated(req)) {
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
  res.type('image/png');
  res.sendFile(path.join(__dirname, 'public', 'icons', 'icon-192.png'));
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

app.use((err, req, res, next) => {
  if (res.headersSent || req.aborted || res.destroyed) return;
  if (err instanceof URIError || (err && err.status === 400)) {
    return res.status(400).json({ success: false, error: 'invalid-url', message: 'Geçersiz istek adresi.' });
  }
  const status = err && err.status >= 400 && err.status < 600 ? err.status : 500;
  return res.status(status).json({ success: false, error: 'server-error', message: 'İstek işlenirken sunucu hatası oluştu.' });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  const BIND_HOST = String(process.env.BIND_HOST || '0.0.0.0').trim() || '0.0.0.0';
  server.listen(PORT, BIND_HOST, () => {
    console.log(`====================================================================`);
    console.log(`  Rıdvan Yılmaz Turizm — RıdvanSes Canlı Rehber & Kafile Sistemi`);
    console.log(`  Dinleme Arayüzü     : ${BIND_HOST}:${PORT}`);
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
