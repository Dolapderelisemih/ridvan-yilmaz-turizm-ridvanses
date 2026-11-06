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
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
    fs.writeFileSync(RUNTIME_FILE, JSON.stringify(state, null, 2), 'utf8');
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
    const tour = db.tours.find((t) => t.code.toUpperCase() === code) || { code, guideName: 'Ömer Ali Gültekin' };
    db.journeySteps[code] = buildDefaultStepsForTour(tour);
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
      isLive: code === 'RY-KASIM',
      broadcastMode: code === 'RY-KASIM' ? 'demo-synth' : 'idle',
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
    guideLocation: room.guideLocation || null,
    connectedPilgrims: pilgrims,
    connectedGuides: guides,
    totalListeners: pilgrimCount,
    realListenerCount: pilgrimCount
  };
}

function broadcastToRoom(room, payload, excludeWs = null, isAudioOverride = false) {
  const isAudio = isAudioOverride || Boolean(payload && typeof payload === 'object' && payload.type === 'audio-chunk');
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const client of room.clients.values()) {
    if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
      // Dinleyicinin soketinde aşırı veri birikmişse (şebeke takılması), eski sesleri kuyruğa yığma.
      // Hat açıldığında dinleyici doğrudan en güncel canlı sese bağlansın (96 KB 24kHz HD tamponu).
      if (isAudio && client.ws.bufferedAmount && client.ws.bufferedAmount > 98304) {
        continue;
      }
      client.ws.send(data);
    }
  }
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

function removeClientFromRoom(room, clientId) {
  if (!room) return;
  const prevClient = room.clients.get(clientId);
  room.clients.delete(clientId);

  if (prevClient && prevClient.role === 'guide') {
    const genelRoom = getOrCreateRoom(room.tourCode, 'genel');
    const genelHasGuide = Array.from(genelRoom.clients.values()).some((c) => c.role === 'guide');
    if (!genelHasGuide && genelRoom.isLive) {
      genelRoom.isLive = false;
      genelRoom.broadcastMode = 'idle';
      broadcastToFamilyTrackers(room.tourCode, {
        type: 'stream-state',
        isLive: false,
        broadcastMode: 'idle',
        currentTopic: genelRoom.currentTopic
      });
    }
    for (const r of getTourRooms(room.tourCode)) {
      const roomHasGuide = Array.from(r.clients.values()).some((c) => c.role === 'guide');
      const coveredByGenel = r.roomId !== 'genel' && genelHasGuide && genelRoom.isLive;
      if (!roomHasGuide && !coveredByGenel && r.isLive) {
        r.isLive = false;
        r.broadcastMode = 'idle';
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
          guidePeerId: r.guidePeerId || null
        });
      }
    }
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

  if (msg.type === 'family-subscribe') {
    const tourCode = String(msg.tourCode || 'RY-KASIM').toUpperCase().trim();
    ws.familyTourCode = tourCode;
    const room = getOrCreateRoom(tourCode, 'genel');
    const steps = getTourSteps(tourCode);
    ws.send(
      JSON.stringify({
        type: 'family-state',
        tourCode,
        room: serializeRoom(room, false),
        steps,
        stats: computeJourneyStats(steps),
        announcements: db.announcements.filter((a) => a.tourCode === tourCode || a.tourCode === 'ALL')
      })
    );
    return;
  }

  if (msg.type === 'join') {
    const tourCode = String(msg.tourCode || 'RY-KASIM').toUpperCase().trim();
    const roomId = String(msg.roomId || 'genel').trim();
    if (ctx.currentRoom) {
      removeClientFromRoom(ctx.currentRoom, clientId);
    }
    ctx.currentRoom = getOrCreateRoom(tourCode, roomId);
    const role = msg.role === 'guide' ? 'guide' : 'pilgrim';
    const clientObj = {
      ws,
      id: clientId,
      role,
      name: msg.name || (role === 'guide' ? 'Ömer Ali Gültekin' : `Hacı Misafir #${clientSeq++}`),
      phone: msg.phone || '',
      lang: msg.lang || 'tr',
      joinedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };
    ctx.currentRoom.clients.set(clientId, clientObj);
    if (role === 'guide' && msg.name) {
      for (const r of getTourRooms(tourCode)) {
        r.guideName = msg.name;
      }
    }

    const tourSteps = getTourSteps(tourCode);
    ws.send(
      JSON.stringify({
        type: 'joined',
        clientId,
        room: serializeRoom(ctx.currentRoom, role === 'guide'),
        announcements: db.announcements.filter((a) => a.tourCode === tourCode || a.tourCode === 'ALL'),
        siyerPoints: db.siyerPoints,
        steps: tourSteps,
        stats: computeJourneyStats(tourSteps)
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
      for (const r of getTargetBroadcastRooms(currentRoom)) {
        r.isLive = Boolean(msg.isLive);
        r.broadcastMode = msg.broadcastMode || (r.isLive ? 'mic' : 'idle');
        if (msg.topic) r.currentTopic = msg.topic;
        if (typeof msg.tawafStage !== 'undefined') r.activeTawafStage = msg.tawafStage || null;
        if (msg.guidePeerId) r.guidePeerId = msg.guidePeerId;
        if (r.isLive) {
          r.startedAt = Date.now();
        }
        broadcastToRoom(r, {
          type: 'stream-state',
          isLive: r.isLive,
          broadcastMode: r.broadcastMode,
          currentTopic: r.currentTopic,
          guidePeerId: r.guidePeerId || null
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
      if (sender.role !== 'guide') break;
      const serializedAudio = JSON.stringify({
        type: 'audio-chunk',
        seq: msg.seq || null,
        phraseStart: Boolean(msg.phraseStart),
        speakerId: clientId,
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
        broadcastToRoom(r, serializedAudio, ws, true);
      }
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
      broadcastToGuidesInTour(currentRoom.tourCode, { type: 'sos-alert', alert: alertItem });
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
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        } catch {}
      }
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
    ws.isAlive = true;
    if (isBinary) {
      if (!ctx.currentRoom) return;
      const sender = ctx.currentRoom.clients.get(ctx.clientId);
      if (!sender || sender.role !== 'guide') return;

      for (const r of getTargetBroadcastRooms(ctx.currentRoom)) {
        for (const peer of r.clients.values()) {
          if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN && !peer.ws.isHttpRelay) {
            peer.ws.send(raw, { binary: true });
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
    processClientJsonMessage(ctx, msg);
  });

  ws.on('close', () => {
    if (ctx.currentRoom) {
      removeClientFromRoom(ctx.currentRoom, ctx.clientId);
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
  const customHeader = String(req.headers['x-ry-auth'] || '');
  if (customHeader === AUTH_TOKEN_VALUE) return true;
  return false;
}

function requireAuth(req, res, next) {
  if (!isRequestAuthenticated(req)) {
    return res.status(401).json({
      success: false,
      message: 'Bu işlem için yetkili (Rehber / Acente) oturumu gereklidir.'
    });
  }
  return next();
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
      assignedTour: 'RY-KASIM'
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
  res.json({
    agency: db.agency,
    tours: db.tours,
    guides: db.guides,
    hotels: db.hotels,
    announcements: db.announcements,
    sosAlerts: db.sosAlerts,
    requests: db.requests || [],
    siyerPoints: db.siyerPoints,
    journeySteps: db.journeySteps,
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
    tour,
    room: roomState,
    announcements: db.announcements.filter((a) => a.tourCode === tour.code || a.tourCode === 'ALL'),
    siyerPoints: db.siyerPoints,
    steps,
    stats
  });
});

// 4. Tour CRUD (Agency Panel)
app.post('/api/tours', requireAuth, (req, res) => {
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
    rooms: Array.from(liveRooms.values()).map(serializeRoom)
  });
  res.json({ success: true, tour: newTour, steps: db.journeySteps[newTour.code] });
});

app.patch('/api/tours/:id', requireAuth, (req, res) => {
  const targetId = String(req.params.id || '').trim();
  const tour = db.tours.find((t) => t.id === targetId || t.code.toUpperCase() === targetId.toUpperCase());
  if (!tour) {
    return res.status(404).json({ success: false, message: 'Düzenlenecek kafile bulunamadı.' });
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
      rooms: Array.from(liveRooms.values()).map(serializeRoom)
    });
  }
  return res.json({ success: true, tour });
});

app.delete('/api/tours/:id', requireAuth, (req, res) => {
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
    rooms: Array.from(liveRooms.values()).map(serializeRoom)
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
  const tour = db.tours.find((t) => t.code.toUpperCase() === code) || db.tours[0] || {
    code,
    name: 'Kasım Umresi Kafilesi',
    guideName: 'Ömer Ali Gültekin',
    dateText: 'Kasım 2026 • 10 Gün',
    duration: '10 Gün (8 Mekke + 2 Medine)',
    makkahHotel: 'Mekke Otel Kudi Tower',
    madinahHotel: '2 Gün Medine Konaklama (Merkezi Bölge)'
  };
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
app.post('/api/sos', (req, res) => {
  const body = req.body || {};
  const alertItem = {
    id: `sos-${Date.now()}`,
    tourCode: String(body.tourCode || 'RY-KASIM').toUpperCase(),
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

  broadcastToGuidesInTour(alertItem.tourCode, { type: 'sos-alert', alert: alertItem });
  broadcastToAdmins({ type: 'sos-alert', alert: alertItem, sosAlerts: db.sosAlerts });
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
      tour,
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
