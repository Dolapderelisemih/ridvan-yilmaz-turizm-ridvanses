const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');

process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Uncaught Exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Güvenlik Başlıkları (Security Headers)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const DATA_FILE = path.join(__dirname, 'data', 'seed.json');
const RUNTIME_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), 'ridvanses-runtime.json')
  : path.join(__dirname, 'data', 'runtime.json');
const REA_FILE = path.join(__dirname, 'rea-umrahvoice-analysis.json');

function loadState() {
  try {
    if (fs.existsSync(RUNTIME_FILE)) {
      return JSON.parse(fs.readFileSync(RUNTIME_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Runtime state okunamadı, seed kullanılıyor:', err.message);
  }
  const seed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  saveState(seed);
  return seed;
}

function saveState(state) {
  try {
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Runtime state kaydedilemedi:', err.message);
  }
}

let db = loadState();

// Live Room State in Memory
// key: `${tourCode}:${roomId}`
const liveRooms = new Map();

function getOrCreateRoom(tourCode, roomId = 'genel') {
  const code = String(tourCode || 'RY-2026').toUpperCase().trim();
  const rId = String(roomId || 'genel').trim();
  const key = `${code}:${rId}`;
  if (!liveRooms.has(key)) {
    const tour = db.tours.find((t) => t.code === code) || db.tours[0];
    liveRooms.set(key, {
      key,
      tourCode: code,
      roomId: rId,
      tourName: tour ? tour.name : code,
      guideName: tour ? tour.guideName : 'Rıdvan Yılmaz Hoca',
      isLive: code === 'RY-2026' || code === 'RY-KASIM' || code === 'SELAMET-2026',
      broadcastMode: code === 'RY-2026' || code === 'RY-KASIM' || code === 'SELAMET-2026' ? 'demo-synth' : 'idle',
      startedAt: Date.now() - 18 * 60 * 1000,
      currentTopic:
        code === 'SELAMET-2026'
          ? 'Selamet Turizm — Canlı Kâbe Tavafı & İrşad Yayını (Demo)'
          : code === 'RY-KASIM'
            ? 'Kasım Umresi — Kâbe’nin Huzuru & Peygamber Efendimizin ﷺ İzinde Manevi Yolculuk'
            : 'Kâbe-i Muazzama Tavaf Duaları & Siyer-i Nebi Sohbeti',
      activeSpeakerClientId: null,
      activeSpeakerName: null,
      guideLocation: null,
      clients: new Map() // clientId -> { ws, id, role, name, phone, lang, handRaised, micGranted, joinedAt }
    });
  }
  return liveRooms.get(key);
}

// Initialize default rooms
getOrCreateRoom('SELAMET-2026', 'genel');
getOrCreateRoom('SELAMET-2026', 'irshad');
getOrCreateRoom('RY-KASIM', 'genel');
getOrCreateRoom('RY-2026', 'genel');
getOrCreateRoom('RY-2026', 'siyer');
getOrCreateRoom('RY-GENCLIK', 'genel');

function serializeRoom(room) {
  const pilgrims = [];
  const guides = [];
  for (const c of room.clients.values()) {
    const item = {
      id: c.id,
      name: c.name,
      phone: c.phone || '',
      role: c.role,
      lang: c.lang || 'tr',
      handRaised: Boolean(c.handRaised),
      micGranted: Boolean(c.micGranted),
      joinedAt: c.joinedAt
    };
    if (c.role === 'guide') guides.push(item);
    else if (c.role === 'pilgrim') pilgrims.push(item);
  }

  // Simulated baseline pilgrims for demo realism alongside real connected tabs
  const baseCount =
    room.roomId === 'genel'
      ? room.tourCode === 'SELAMET-2026'
        ? 34
        : room.tourCode === 'RY-KASIM'
          ? 38
          : room.tourCode === 'RY-2026'
            ? 42
            : 0
      : 0;

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
    activeSpeakerClientId: room.activeSpeakerClientId,
    activeSpeakerName: room.activeSpeakerName,
    guideLocation: room.guideLocation || null,
    connectedPilgrims: pilgrims,
    connectedGuides: guides,
    totalListeners: pilgrims.length + baseCount,
    realListenerCount: pilgrims.length,
    raisedHandsCount: pilgrims.filter((p) => p.handRaised).length,
    qnaEnabled: typeof room.qnaEnabled === 'undefined' ? true : Boolean(room.qnaEnabled)
  };
}

function broadcastToRoom(room, payload, excludeWs = null) {
  const data = JSON.stringify(payload);
  for (const client of room.clients.values()) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

// HTTP Relay Sessions for Serverless (Vercel) Fallback
const httpRelaySessions = new Map(); // clientId -> { clientId, ws, outbox: [], currentRoom: null, lastSeen: number }

function cleanupStaleRelaySessions() {
  const now = Date.now();
  for (const [cid, sess] of httpRelaySessions.entries()) {
    if (now - sess.lastSeen > 35000) {
      httpRelaySessions.delete(cid);
      if (sess.currentRoom) {
        if (sess.currentRoom.activeSpeakerClientId === cid) {
          sess.currentRoom.activeSpeakerClientId = null;
          sess.currentRoom.activeSpeakerName = null;
        }
        sess.currentRoom.clients.delete(cid);
        broadcastRoomState(sess.currentRoom);
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

function broadcastRoomState(room) {
  if (!room) return;
  if (room._broadcastTimer) return;
  room._broadcastTimer = setTimeout(() => {
    room._broadcastTimer = null;
    const state = serializeRoom(room);
    broadcastToRoom(room, { type: 'room-state', room: state });
    broadcastToAdmins({
      type: 'admin-rooms-update',
      rooms: Array.from(liveRooms.values()).map(serializeRoom)
    });
  }, 100);
}

let clientSeq = 1;

function processClientJsonMessage(ctx, msg) {
  const { clientId, ws } = ctx;

  if (msg.type === 'admin-subscribe') {
    ws.isAdmin = true;
    ws.send(
      JSON.stringify({
        type: 'admin-rooms-update',
        rooms: Array.from(liveRooms.values()).map(serializeRoom),
        sosAlerts: db.sosAlerts,
        announcements: db.announcements
      })
    );
    return;
  }

  if (msg.type === 'join') {
    const tourCode = String(msg.tourCode || 'RY-2026').toUpperCase().trim();
    const roomId = String(msg.roomId || 'genel').trim();
    if (ctx.currentRoom) {
      ctx.currentRoom.clients.delete(clientId);
      broadcastRoomState(ctx.currentRoom);
    }
    ctx.currentRoom = getOrCreateRoom(tourCode, roomId);
    const role = msg.role === 'guide' ? 'guide' : 'pilgrim';
    const clientObj = {
      ws,
      id: clientId,
      role,
      name: msg.name || (role === 'guide' ? 'Rıdvan Yılmaz Hoca' : `Hacı Misafir #${clientSeq++}`),
      phone: msg.phone || '',
      lang: msg.lang || 'tr',
      handRaised: false,
      micGranted: false,
      joinedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };
    ctx.currentRoom.clients.set(clientId, clientObj);
    if (role === 'guide' && msg.name) {
      ctx.currentRoom.guideName = msg.name;
    }

    ws.send(
      JSON.stringify({
        type: 'joined',
        clientId,
        room: serializeRoom(ctx.currentRoom),
        announcements: db.announcements.filter((a) => a.tourCode === tourCode || a.tourCode === 'ALL'),
        siyerPoints: db.siyerPoints
      })
    );
    broadcastRoomState(ctx.currentRoom);
    return;
  }

  const currentRoom = ctx.currentRoom;
  if (!currentRoom) return;
  const sender = currentRoom.clients.get(clientId);
  if (!sender) return;

  switch (msg.type) {
    case 'guide-stream-state': {
      if (sender.role !== 'guide') break;
      currentRoom.isLive = Boolean(msg.isLive);
      currentRoom.broadcastMode = msg.broadcastMode || (currentRoom.isLive ? 'mic' : 'idle');
      if (msg.topic) currentRoom.currentTopic = msg.topic;
      if (msg.guidePeerId) currentRoom.guidePeerId = msg.guidePeerId;
      if (currentRoom.isLive) {
        currentRoom.startedAt = Date.now();
      }
      broadcastRoomState(currentRoom);
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
      broadcastToRoom(currentRoom, locPayload);
      for (const room of liveRooms.values()) {
        if (room !== currentRoom && !Array.from(room.clients.values()).some((c) => c.role === 'guide')) {
          room.guideLocation = currentRoom.guideLocation;
          broadcastToRoom(room, locPayload);
        }
      }
      broadcastRoomState(currentRoom);
      break;
    }

    case 'audio-chunk': {
      const canSpeak = sender.role === 'guide' || sender.micGranted;
      if (!canSpeak) break;
      const chunkPayload = {
        type: 'audio-chunk',
        seq: msg.seq || null,
        speakerId: clientId,
        speakerName: sender.name,
        speakerRole: sender.role,
        sampleRate: msg.sampleRate || 16000,
        samples: msg.samples,
        pcm16: msg.pcm16 || null,
        level: msg.level || 0,
        synthNote: msg.synthNote || null,
        sentAt: msg.sentAt || Date.now()
      };
      broadcastToRoom(currentRoom, chunkPayload, ws);
      if (sender.role === 'guide') {
        for (const room of liveRooms.values()) {
          if (room !== currentRoom && !Array.from(room.clients.values()).some((c) => c.role === 'guide')) {
            broadcastToRoom(room, chunkPayload, ws);
          }
        }
      }
      break;
    }

    case 'raise-hand': {
      sender.handRaised = Boolean(msg.raised);
      if (!sender.handRaised && sender.micGranted) {
        sender.micGranted = false;
        if (currentRoom.activeSpeakerClientId === clientId) {
          currentRoom.activeSpeakerClientId = null;
          currentRoom.activeSpeakerName = null;
        }
      }
      broadcastRoomState(currentRoom);
      broadcastToRoom(currentRoom, {
        type: 'hand-event',
        pilgrimId: clientId,
        pilgrimName: sender.name,
        raised: sender.handRaised,
        questionNote: msg.note || ''
      });
      break;
    }

    case 'grant-mic': {
      if (sender.role !== 'guide') break;
      const target = currentRoom.clients.get(msg.targetClientId);
      if (target) {
        target.micGranted = Boolean(msg.granted);
        if (target.micGranted) {
          target.handRaised = false;
          currentRoom.activeSpeakerClientId = target.id;
          currentRoom.activeSpeakerName = target.name;
        } else if (currentRoom.activeSpeakerClientId === target.id) {
          currentRoom.activeSpeakerClientId = null;
          currentRoom.activeSpeakerName = null;
        }
        if (target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(
            JSON.stringify({
              type: 'mic-permission',
              granted: target.micGranted,
              guideName: sender.name
            })
          );
        }
        broadcastRoomState(currentRoom);
      }
      break;
    }

    case 'set-qna-state': {
      if (sender.role !== 'guide') break;
      currentRoom.qnaEnabled = Boolean(msg.enabled);
      if (!currentRoom.qnaEnabled) {
        // Söz isteme kapatıldığında el kaldıranları temizle ve mikrofonu olanların sözünü bitir
        for (const p of currentRoom.clients.values()) {
          p.handRaised = false;
          if (p.micGranted) {
            p.micGranted = false;
            if (p.ws.readyState === WebSocket.OPEN) {
              p.ws.send(JSON.stringify({ type: 'mic-permission', granted: false, guideName: sender.name }));
            }
          }
        }
        currentRoom.activeSpeakerClientId = null;
        currentRoom.activeSpeakerName = null;
      }
      const qnaPayload = {
        type: 'qna-state',
        enabled: currentRoom.qnaEnabled
      };
      broadcastToRoom(currentRoom, qnaPayload);
      broadcastRoomState(currentRoom);
      break;
    }

    case 'sos-trigger': {
      const alertItem = {
        id: `sos-${Date.now()}`,
        tourCode: currentRoom.tourCode,
        pilgrimName: sender.name,
        phone: sender.phone || msg.phone || '+90 538 000 00 00',
        lat: Number(msg.lat) || 21.4225,
        lng: Number(msg.lng) || 39.8262,
        locationNote: msg.locationNote || 'Mescid-i Haram / Kâbe-i Muazzama Çevresi (Canlı GPS)',
        createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        status: 'active',
        resolvedBy: null
      };
      db.sosAlerts.unshift(alertItem);
      saveState(db);
      broadcastToRoom(currentRoom, { type: 'sos-alert', alert: alertItem });
      broadcastToAdmins({ type: 'sos-alert', alert: alertItem, sosAlerts: db.sosAlerts });
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
      broadcastToRoom(currentRoom, { type: 'new-announcement', announcement: ann });
      broadcastToAdmins({ type: 'new-announcement', announcement: ann });
      break;
    }
  }
}

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const ctx = {
    clientId: `client-${Date.now()}-${clientSeq++}`,
    ws,
    currentRoom: null
  };

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      if (!ctx.currentRoom) return;
      const sender = ctx.currentRoom.clients.get(ctx.clientId);
      if (!sender) return;
      const canSpeak = sender.role === 'guide' || sender.micGranted;
      if (!canSpeak) return;

      for (const peer of ctx.currentRoom.clients.values()) {
        if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN && !peer.ws.isHttpRelay) {
          peer.ws.send(raw, { binary: true });
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
    processClientJsonMessage(ctx, msg);
  });

  ws.on('close', () => {
    if (ctx.currentRoom) {
      if (ctx.currentRoom.activeSpeakerClientId === ctx.clientId) {
        ctx.currentRoom.activeSpeakerClientId = null;
        ctx.currentRoom.activeSpeakerName = null;
      }
      ctx.currentRoom.clients.delete(ctx.clientId);
      broadcastRoomState(ctx.currentRoom);
    }
  });
});

// 30-Second Ping/Pong Heartbeat to prune zombie/dropped connections from mobile networks
const heartbeatTimer = setInterval(() => {
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
function getOrCreateRelaySession(clientId) {
  cleanupStaleRelaySessions();
  const cid = String(clientId || `relay-${Date.now()}-${clientSeq++}`);
  if (!httpRelaySessions.has(cid)) {
    const sess = {
      clientId: cid,
      outbox: [],
      currentRoom: null,
      lastSeen: Date.now(),
      ws: {
        isHttpRelay: true,
        isAdmin: false,
        readyState: WebSocket.OPEN,
        send(data) {
          try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (sess.outbox.length >= 45) sess.outbox.shift();
            sess.outbox.push(parsed);
          } catch {}
        }
      }
    };
    httpRelaySessions.set(cid, sess);
  }
  const session = httpRelaySessions.get(cid);
  session.lastSeen = Date.now();
  return session;
}

app.post('/api/ws-relay', (req, res) => {
  const { clientId, messages, joinContext } = req.body || {};
  const session = getOrCreateRelaySession(clientId);
  if (!session.currentRoom && joinContext && joinContext.type === 'join') {
    processClientJsonMessage(session, joinContext);
  }
  const list = Array.isArray(messages) ? messages : req.body?.message ? [req.body.message] : [];
  for (const msg of list) {
    if (msg && typeof msg === 'object') {
      processClientJsonMessage(session, msg);
    }
  }
  const drained = session.outbox.splice(0, session.outbox.length);
  return res.json({ clientId: session.clientId, messages: drained });
});

app.get('/api/ws-relay', (req, res) => {
  const session = getOrCreateRelaySession(req.query.clientId);
  if (!session.currentRoom && req.query.tourCode) {
    processClientJsonMessage(session, {
      type: 'join',
      tourCode: req.query.tourCode,
      roomId: req.query.roomId || 'genel',
      role: req.query.role || 'pilgrim',
      name: req.query.name || ''
    });
  }
  const drained = session.outbox.splice(0, session.outbox.length);
  return res.json({ clientId: session.clientId, messages: drained });
});

// ======================== REST API ENDPOINTS ========================

// 1. Auth Endpoints (Rehber Yayını & Acente Paneli Yetkili Girişi)
const ADMIN_USERNAME = 'ridvanyilmazturizm@gmail.com';
const ADMIN_PASSWORD = 'dolapdereli16';
const AUTH_COOKIE_NAME = 'ry_auth';
const AUTH_TOKEN_VALUE = 'ry_auth_v1_987a6b5c4d';

function isRequestAuthenticated(req) {
  const cookieHeader = String(req.headers.cookie || '');
  if (cookieHeader.includes(`${AUTH_COOKIE_NAME}=${AUTH_TOKEN_VALUE}`)) return true;
  const authHeader = String(req.headers.authorization || '');
  if (authHeader === `Bearer ${AUTH_TOKEN_VALUE}`) return true;
  return false;
}

app.post('/api/login', (req, res) => {
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
  if (cleanEmail === ADMIN_USERNAME && cleanPass === ADMIN_PASSWORD) {
    user = {
      id: 'admin-1',
      name: 'Rıdvan Yılmaz Turizm (Yetkili)',
      email: ADMIN_USERNAME,
      role: 'agency_admin',
      agency: db.agency.name
    };
  } else if (
    (cleanEmail === 'info@selametturizm.com' || cleanEmail === 'selamet@selametturizm.com' || cleanEmail === 'selamet') &&
    (cleanPass === 'selamet2026' || cleanPass === 'selamet123')
  ) {
    user = {
      id: 'agency-selamet',
      name: 'Selamet Turizm (Yetkili)',
      email: 'info@selametturizm.com',
      role: 'agency_admin',
      agency: 'Selamet Turizm',
      assignedTour: 'SELAMET-2026'
    };
  } else {
    return res.status(401).json({
      success: false,
      message: 'Kullanıcı adı veya şifre hatalı! Lütfen yetkili giriş bilgilerinizi kontrol ediniz.'
    });
  }

  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${AUTH_TOKEN_VALUE}; Path=/; Max-Age=2592000; SameSite=Lax`
  );

  return res.json({
    success: true,
    token: AUTH_TOKEN_VALUE,
    user
  });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`);
  return res.json({ success: true });
});

app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body || {};
  return res.json({
    success: true,
    message: `${email || 'Hesabınız'} için şifre sıfırlama bağlantısı Rıdvan Yılmaz Turizm sisteminden gönderildi.`
  });
});

app.post('/api/demo-request', (req, res) => {
  const { name, company_name, phone, email, message } = req.body || {};
  if (!db.requests) db.requests = [];
  const item = {
    id: `req-${Date.now()}`,
    name,
    company_name,
    phone,
    email,
    message,
    createdAt: new Date().toISOString()
  };
  db.requests.unshift(item);
  saveState(db);
  return res.json({
    success: true,
    message: 'Talebiniz Rıdvan Yılmaz Turizm operasyon ekibine (Beytullah Bey) iletilmiştir.'
  });
});

// 2. Bootstrap & System Overview
app.get('/api/bootstrap', (req, res) => {
  res.json({
    agency: db.agency,
    tours: db.tours,
    guides: db.guides,
    hotels: db.hotels,
    announcements: db.announcements,
    sosAlerts: db.sosAlerts,
    siyerPoints: db.siyerPoints,
    liveRooms: Array.from(liveRooms.values()).map(serializeRoom)
  });
});

// 3. Pilgrim Join Validation
app.post('/api/join-tour', (req, res) => {
  const { code, pin } = req.body || {};
  const cleanCode = String(code || '').toUpperCase().trim();
  const tour = db.tours.find((t) => t.code.toUpperCase() === cleanCode);
  if (!tour) {
    return res.status(404).json({
      success: false,
      message: `"${cleanCode}" koduna ait aktif bir Rıdvan Yılmaz Turizm kafilesi bulunamadı. Örnek kodlar: RY-2026, RY-GENCLIK, RY-EYLUL, RY-5YILDIZ`
    });
  }
  if (tour.pinProtected && tour.pin && String(tour.pin) !== String(pin || '').trim()) {
    return res.status(403).json({
      success: false,
      message: 'Bu kafile odası PIN korumalıdır. Lütfen geçerli PIN kodunu giriniz.'
    });
  }
  const roomState = serializeRoom(getOrCreateRoom(tour.code, 'genel'));
  return res.json({
    success: true,
    tour,
    room: roomState,
    announcements: db.announcements.filter((a) => a.tourCode === tour.code || a.tourCode === 'ALL'),
    siyerPoints: db.siyerPoints
  });
});

// 4. Tour CRUD (Agency Panel)
app.post('/api/tours', (req, res) => {
  const body = req.body || {};
  const code = String(body.code || `RY-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase().trim();
  const newTour = {
    id: `tour-${Date.now()}`,
    code,
    name: body.name || 'Yeni Siyer Umresi Kafilesi',
    dateText: body.dateText || '2026 - 2027 Sezonu',
    duration: body.duration || '15 Gün',
    guideId: body.guideId || 'guide-1',
    guideName: body.guideName || 'Rıdvan Yılmaz Hoca',
    makkahHotel: body.makkahHotel || 'Rayhaan Al Mashaer Hotel',
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
  saveState(db);
  getOrCreateRoom(newTour.code, 'genel');
  res.json({ success: true, tour: newTour });
});

app.delete('/api/tours/:id', (req, res) => {
  db.tours = db.tours.filter((t) => t.id !== req.params.id && t.code !== req.params.id);
  saveState(db);
  res.json({ success: true });
});

// 5. Guides CRUD
app.post('/api/guides', (req, res) => {
  const body = req.body || {};
  const guide = {
    id: `guide-${Date.now()}`,
    name: body.name || 'Yeni Rehber Hoca',
    title: body.title || 'Kafile İrşad Rehberi',
    phone: body.phone || '+90 538 399 96 66',
    email: body.email || `rehber${Date.now()}@ridvanyilmazturizm.com`,
    specialty: body.specialty || 'Siyer ve Umre Rehberliği',
    status: 'online',
    assignedTour: body.assignedTour || 'RY-2026'
  };
  db.guides.push(guide);
  saveState(db);
  res.json({ success: true, guide });
});

// 6. Push Announcements
app.post('/api/announcements', (req, res) => {
  const body = req.body || {};
  const ann = {
    id: `ann-${Date.now()}`,
    tourCode: String(body.tourCode || 'RY-2026').toUpperCase(),
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
  broadcastToAdmins({ type: 'new-announcement', announcement: ann });
  res.json({ success: true, announcement: ann });
});

// 7. SOS Emergency API
app.post('/api/sos', (req, res) => {
  const body = req.body || {};
  const alertItem = {
    id: `sos-${Date.now()}`,
    tourCode: String(body.tourCode || 'RY-2026').toUpperCase(),
    pilgrimName: body.pilgrimName || 'Hacı Misafir',
    phone: body.phone || '+90 538 000 00 00',
    lat: Number(body.lat) || 21.4225,
    lng: Number(body.lng) || 39.8262,
    locationNote: body.locationNote || 'Mescid-i Haram / Kâbe-i Muazzama Çevresi',
    createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
    status: 'active',
    resolvedBy: null
  };
  db.sosAlerts.unshift(alertItem);
  saveState(db);

  for (const room of liveRooms.values()) {
    if (room.tourCode === alertItem.tourCode) {
      broadcastToRoom(room, { type: 'sos-alert', alert: alertItem });
    }
  }
  broadcastToAdmins({ type: 'sos-alert', alert: alertItem, sosAlerts: db.sosAlerts });
  res.json({ success: true, alert: alertItem });
});

app.patch('/api/sos/:id/resolve', (req, res) => {
  const alertItem = db.sosAlerts.find((s) => s.id === req.params.id);
  if (!alertItem) return res.status(404).json({ success: false });
  alertItem.status = 'resolved';
  alertItem.resolvedBy = (req.body && req.body.resolvedBy) || 'Rıdvan Yılmaz Hoca';
  saveState(db);

  for (const room of liveRooms.values()) {
    if (room.tourCode === alertItem.tourCode) {
      broadcastToRoom(room, { type: 'sos-resolved', alert: alertItem });
    }
  }
  broadcastToAdmins({ type: 'sos-resolved', alert: alertItem, sosAlerts: db.sosAlerts });
  res.json({ success: true, alert: alertItem });
});

// 8. REA Analysis Report Endpoint
const REA_SUMMARY_FILE = path.join(__dirname, 'data', 'rea-summary.json');
app.get('/api/rea-report', (req, res) => {
  try {
    if (fs.existsSync(REA_SUMMARY_FILE)) {
      return res.json(JSON.parse(fs.readFileSync(REA_SUMMARY_FILE, 'utf8')));
    }
    if (fs.existsSync(REA_FILE)) {
      const reaData = JSON.parse(fs.readFileSync(REA_FILE, 'utf8'));
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
app.get('/api/qr', async (req, res) => {
  try {
    const code = String(req.query.code || 'RY-2026').toUpperCase().trim();
    const room = String(req.query.room || 'genel').trim();
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const proto = req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : req.protocol || 'http';
    const baseUrl = req.query.baseUrl || `${proto}://${host}`;
    const joinUrl = `${baseUrl}/dinle?code=${encodeURIComponent(code)}&room=${encodeURIComponent(room)}`;

    const tour = db.tours.find((t) => t.code.toUpperCase() === code) || {
      code,
      name: `${code} Siyer Umresi Kafilesi`,
      guideName: 'Rıdvan Yılmaz Hoca',
      makkahHotel: 'Rayhaan Al Mashaer Hotel',
      madinahHotel: 'Medine Merkezi Ravza Oteli'
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
      `🕋 *Rıdvan Yılmaz Turizm — Canlı Rehberlik & Kafile Odası*\n\n` +
      `Kıymetli Misafirimiz,\n` +
      `*${tour.name}* (${tour.guideName}) canlı sesli rehberlik odamıza uygulama veya şifre gerekmeden aşağıdaki bağlantıya dokunarak hemen katılabilirsiniz:\n\n` +
      `🎧 *Canlı Yayına Katıl:* ${joinUrl}\n` +
      `🔑 *Kafile Kodu:* ${tour.code}\n` +
      `🏨 *Mekke Otel:* ${tour.makkahHotel}\n` +
      `🚨 *Acil İletişim:* +90 538 399 96 66`;

    return res.json({
      success: true,
      code,
      room,
      tour,
      joinUrl,
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

app.use(express.static(path.join(__dirname, 'public')));

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
  '/login': 'login.html',
  '/nasil-calisir': 'index.html',
  '/iletisim': 'index.html'
};

Object.entries(routeMap).forEach(([routePath, fileName]) => {
  app.get(routePath, (req, res) => {
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
    console.log(`  Rehber Yayın Ekranı : http://localhost:${PORT}/rehber`);
    console.log(`  Acente Yönetim Panel: http://localhost:${PORT}/panel`);
    console.log(`====================================================================`);
  });
}

module.exports = app;
