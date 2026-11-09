// RıdvanSes — 3 Katmanlı Hibrit Gerçek Zamanlı Ses, Konum (SOS) & Veri Köprüsü
// 1. Yerel / Dedicated Sunucu: Doğrudan Native WebSocket (/ws)
// 2. Kalıcı WSS Bulut Ses & SOS Otobüsü (MQTT-over-WSS: wss://broker.emqx.io:8084/mqtt) — 35ms gecikme, tüm odalar ve acil SOS için anlık iletim
// 3. Tek-Uçuşlu (/api/ws-relay) HTTP Yedeği (msgId tekilleştirmeli)
(function () {
  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;

  function loadScriptOnce(src, globalName, cb) {
    if (window[globalName]) {
      cb();
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => cb());
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => cb();
    document.head.appendChild(s);
  }

  // MQTT betiği yalnızca bulut yedek (relay) modu devreye girdiğinde tembel (lazy) yüklenir.
  window.__ryActiveGuideStream = null;
  window.__ryActiveSocket = null;
  window.__ryActiveGuideChannelId = null;

  window.ryGetDynamicChannelId = function (tourCode, roomId) {
    const cleanCode = String(tourCode || 'RY-KASIM')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'ry-kasim';
    const cleanRoom = String(roomId || 'genel')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'genel';
    return `ridvanses-${cleanCode}-${cleanRoom}-guide-v26`;
  };

  window.ryBroadcastGuideStream = function (stream, tourCode, roomId) {
    window.__ryActiveGuideStream = stream || null;
    const sock = window.__ryActiveSocket;
    const resolvedTour = tourCode || (sock && sock._joinContext && sock._joinContext.tourCode) || 'RY-KASIM';
    const resolvedRoom = roomId || (sock && sock._joinContext && sock._joinContext.roomId) || 'genel';
    window.__ryActiveGuideChannelId = stream ? window.ryGetDynamicChannelId(resolvedTour, resolvedRoom) : null;
    return window.__ryActiveGuideChannelId;
  };

  const GLOBAL_SOS_TOPIC = 'ridvanses/v2/global/sos';
  // Birincil: test.mosquitto.org (ölçüm: %0 kayıp, p50 47ms) • Yedek: broker.emqx.io
  const CLOUD_BROKERS = ['wss://test.mosquitto.org:8081', 'wss://broker.emqx.io:8084/mqtt'];

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
      (m.audioSourceId==null||(typeof m.audioSourceId==='string'&&m.audioSourceId.length<=128&&/^[a-zA-Z0-9_.-]+$/.test(m.audioSourceId))) &&
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

  // PATCH: coalescing-v50
  // PATCH: coalescer-v51
  // Per page, shared by replacement sockets; the audioSourceId is stable for this page.
  function nextRysAudioStateSeq(minimum=0){
    const n=globalThis.__ryGuideAudioStateSeq;
    const next=Math.max(Number.isSafeInteger(n)&&n>=0?n:0,Number.isSafeInteger(minimum)&&minimum>=0?minimum:0)+1;
    if(!Number.isSafeInteger(next))throw new RangeError('Audio state sequence exhausted');
    globalThis.__ryGuideAudioStateSeq=next;return next;
  }

  class RysAudioCoalescer {
    constructor(send,clock=()=>Date.now(),schedule=(f,ms)=>setTimeout(f,ms),cancel=id=>clearTimeout(id)){
      this.send=send;this.clock=clock;this.schedule=schedule;this.cancel=cancel;
      this.frames=[];this.timer=null;this.oldest=0;this.generation=0;
    }
    push(m){
      if(!validRysAudio(m))return;
      const now=this.clock();
      if(this.frames.length&&now-this.oldest>120)this.clear();
      if(!this.frames.length)this.oldest=now;
      this.frames.push({...m});
      if(this.frames.length===3){this.flush();return;}
      if(this.timer===null){const generation=this.generation;
        this.timer=this.schedule(()=>{if(generation!==this.generation)return;this.timer=null;this.flush();},40);}
    }
    flush(){
      if(this.timer!==null)this.cancel(this.timer);this.timer=null;this.generation++;
      const frames=this.frames;this.frames=[];
      if(frames.length&&this.clock()-this.oldest<=120)
        this.send({type:'audio-chunk',frames,_queuedAt:this.oldest});
    }
    clear(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;this.frames=[];this.generation++;}
  }
  function installRysCoalescing(sock) {
    const send = sock.send.bind(sock);
    const close = sock.close.bind(sock);
    const c = new RysAudioCoalescer((m) => send(JSON.stringify({ ...m, _queuedAt: m._queuedAt })));
    sock._audioCoalescer = c;
    sock.send = (data) => {
      let m;
      try {
        m = typeof data === 'string' ? JSON.parse(data) : null;
      } catch (e) {}
      if(m?.type==='guide-stream-state'&&(!m.isLive||String(m.broadcastMode||'').startsWith('demo')))c.clear();
      if (sock._isRelay && validRysAudio(m)) {
        c.push({...m,audioSourceId:m.audioSourceId||sock._joinContext?.audioSourceId||null});
        return;
      }
      send(data);
    };
    sock.close = (...a) => {
      c.clear();
      return close(...a);
    };
  }

  class SmartWebSocket {
    constructor(url, protocols) {
      const isAppWs =
        typeof url === 'string' &&
        url.endsWith('/ws') &&
        (url.includes(window.location.host) ||
          url.includes('ridvanyilmazturizm.com') ||
          url.includes('vercel.app'));
      if (!isAppWs) {
        return protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
      }

      window.__ryActiveSocket = this;
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;

      this._isRelay = false;
      this._opened = false;
      this._inFlight = false;
      this._clientId =
        sessionStorage.getItem('ry_relay_cid') ||
        'ry-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      sessionStorage.setItem('ry_relay_cid', this._clientId);

      this._joinContext = null;
      this._isAdmin = false;
      this._sendQueue = [];
      installRysCoalescing(this);
      this._seenIds = new Set();
      this._pollTimer = null;

      this._pilgrimMeta = new Map();
      this._mqttClients = [];
      this._busSeen = new Set();
      this._mqttTopic = null;

      const isTargetServerlessOnly = typeof url === 'string' && url.includes('.vercel.app/ws');
      if (isTargetServerlessOnly) {
        setTimeout(() => this._activateCloudRelay(), 15);
        return;
      }

      try {
        this._native = protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
        this._native.binaryType = 'arraybuffer';
      } catch (e) {
        this.readyState = 3;
        setTimeout(() => {
          if (typeof this.onclose === 'function') this.onclose({ type: 'close' });
        }, 50);
        return;
      }

      // VDS / Özel Domain Ortamında Mobil Şebeke (Asansör/Tünel) El Sıkışma Zaman Aşımı (3.5 sn):
      // İlk hatada doğrudan VDS'i yeniden dene; VDS üst üste erişilemezse (bakım/ağ engeli) otomatik MQTT Bulut Rölesine geç!
      const handshakeLimit = 3500;
      const fallbackTimeout = setTimeout(() => {
        if (!this._opened && !this._isRelay) {
          window.__ryConsecutiveVdsFailures = (window.__ryConsecutiveVdsFailures || 0) + 1;
          try {
            if (this._native) {
              this._native.onopen = null;
              this._native.onmessage = null;
              this._native.onerror = null;
              this._native.onclose = null;
              this._native.close();
            }
          } catch {}
          if (window.__ryConsecutiveVdsFailures >= 2) {
            console.warn('⚠️ [RıdvanSes WS] VDS ardışık zaman aşımı — Kesintisiz yayın için MQTT Bulut Rölesi devreye alındı.');
            this._activateCloudRelay();
            return;
          }
          console.warn('⚠️ [RıdvanSes WS] VDS el sıkışması zaman aşımına uğradı, doğrudan VDS yeniden denenecek...');
          this.readyState = 3; // CLOSED
          if (typeof this.onclose === 'function') this.onclose({ type: 'close', timeout: true });
        }
      }, handshakeLimit);

      this._native.onopen = (ev) => {
        if (this._isRelay) return;
        clearTimeout(fallbackTimeout);
        window.__ryConsecutiveVdsFailures = 0;
        this._opened = true;
        this.readyState = 1; // OPEN
        console.log('⚡ [RıdvanSes] VDS Doğrudan Yerel WebSocket Bağlandı (Ultra Düşük Gecikme Modu)');
        if (typeof this.onopen === 'function') this.onopen(ev);
      };

      this._native.onmessage = (ev) => {
        if (this._isRelay) return;
        if (typeof this.onmessage === 'function') this.onmessage(ev);
      };

      this._native.onerror = (err) => {
        if (!this._opened && !this._isRelay) {
          console.warn('⚠️ [RıdvanSes WS] Doğrudan VDS WebSocket hatası:', err);
        }
        if (typeof this.onerror === 'function') this.onerror(err);
      };

      this._native.onclose = (ev) => {
        clearTimeout(fallbackTimeout);
        if (!this._isRelay) {
          if (!this._opened) {
            window.__ryConsecutiveVdsFailures = (window.__ryConsecutiveVdsFailures || 0) + 1;
            if (window.__ryConsecutiveVdsFailures >= 2) {
              console.warn('⚠️ [RıdvanSes WS] VDS bağlantı hatası — Kesintisiz yayın için MQTT Bulut Rölesi devreye alındı.');
              this._activateCloudRelay();
              return;
            }
          }
          this.readyState = 3; // CLOSED
          if (typeof this.onclose === 'function') this.onclose(ev);
        }
      };
    }

    get bufferedAmount() {
      if (!this._isRelay && this._native && typeof this._native.bufferedAmount === 'number') {
        return this._native.bufferedAmount;
      }
      return 0;
    }

    get isRelay() {
      return Boolean(this._isRelay);
    }

    get binaryType() {
      return (this._native && this._native.binaryType) || this._binaryType || 'arraybuffer';
    }

    set binaryType(val) {
      this._binaryType = val;
      if (this._native) {
        try {
          this._native.binaryType = val;
        } catch {}
      }
    }

    // PATCH: transport-v53
    _activateCloudRelay(){
      if(this._isRelay||this._closedExplicitly)return;
      this._isRelay=true;this._opened=true;
      this._resetRelaySession();
      this._httpEpoch=(this._httpEpoch||0)+1;this._relayAbort?.abort();this._inFlight=false;
      try{if(this._native){this._native.onopen=null;this._native.onmessage=null;
        this._native.onerror=null;this._native.onclose=null;this._native.close();}}catch(e){}
      this.readyState=1;
      if(this._joinContext)this._initMqttBus(this._joinContext,false);
      else if(this._isAdmin)this._initMqttBus(null,true);
      if(typeof this.onopen==='function')this.onopen({type:'open',relay:true});
      this._audioCoalescer?.flush();
      if(this._pollTimer)clearInterval(this._pollTimer);
      this._pollTimer=setInterval(()=>this._flushAndPoll(),100);
      if(!this.url.includes('.vercel.app/ws')&&!this._vdsFailbackTimer)
        this._vdsFailbackTimer=setInterval(()=>this._tryNativeFailback(),12000);
    }
    _resetRelaySession(){
      const clientId=this._relayClientId,relayKey=this._relayKey;
      if(clientId&&relayKey){
        // Best-effort close is safe even after commit: it names only the old HTTP ID.
        try{fetch('/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({type:'relay-close',version:56,clientId,relayKey}),keepalive:true}).catch(()=>{});}catch(e){}
      }
      this._relayClientId=null;this._relayKey=null;this._relayFenced=false;this._relayRequestSeq=0;
      this._httpEpoch=(this._httpEpoch||0)+1;
      this._relayAbort?.abort();this._relayAbort=null;this._inFlight=false;
    }
    _tryNativeFailback(){
      if(!this._isRelay||this.readyState!==1||this._closedExplicitly||this._failbackProbe)return;
      const join=this._joinContext,generation=this._transportGeneration||0;
      const mode=this._subscriptionType||(this._isAdmin?'admin-subscribe':'join');
      const request=mode==='admin-subscribe'?{type:mode,token:(localStorage.getItem('ry_auth_token')||'').trim()}:
        mode==='family-subscribe'?(join?{type:mode,tourCode:join.tourCode}:null):join?{...join}:null;
      if(!request)return;
      let probe;try{probe=new NativeWebSocket(this.url);probe.binaryType='arraybuffer';}catch(e){return;}
      this._failbackProbe=probe;let finished=false,commitSent=false,handoffId=null;
      const valid=()=>!this._closedExplicitly&&this._isRelay&&this.readyState===1&&
        (this._transportGeneration||0)===generation;
      const cancel=()=>{
        if(finished)return;finished=true;clearTimeout(timer);
        if(this._failbackProbe===probe)this._failbackProbe=null;
        if(this._cancelNativeProbe===cancel)this._cancelNativeProbe=null;
        probe.onopen=null;probe.onmessage=null;probe.onerror=null;probe.onclose=null;
        try{probe.close();}catch(e){}
        // A commit ACK may have been lost. Never reuse a possibly retired source ID.
        if(commitSent||this._relayFenced)this._resetRelaySession();
      };
      const timer=setTimeout(cancel,5000);this._cancelNativeProbe=cancel;
      probe.onerror=cancel;probe.onclose=cancel;
      probe.onopen=()=>{
        if(!valid()){cancel();return;}
        // No HTTP source may appear behind a source-less prepare. An old open response is harmless.
        if(!this._relayClientId||!this._relayKey){this._resetRelaySession();this._relayFenced=true;}
        try{probe.send(JSON.stringify({type:'handoff-prepare',subscription:request,
          relayClientId:this._relayClientId||null,relayKey:this._relayKey||null}));}catch(e){cancel();}
      };
      probe.onmessage=ev=>{
        let msg;try{msg=JSON.parse(ev.data);}catch(e){return;}
        if(!valid()){cancel();return;}
        if(msg.type==='handoff-error'||msg.type==='auth-error'||msg.type==='pin-error'){
          if(msg.code==='stale-relay')this._resetRelaySession();cancel();return;
        }
        if(msg.type==='handoff-prepared'){
          if(commitSent)return;
          if(typeof msg.handoffId!=='string'||!/^[0-9a-f]{32}$/.test(msg.handoffId)){cancel();return;}
          handoffId=msg.handoffId;commitSent=true;
          try{probe.send(JSON.stringify({type:'handoff-commit',handoffId}));}catch(e){cancel();}
          return;
        }
        if(msg.type!=='handoff-committed'||!commitSent||msg.handoffId!==handoffId)return;
        const ack=msg.ack,expected=mode==='join'?'joined':mode==='family-subscribe'?'family-state':'admin-rooms-update';
        if(ack?.type!==expected){cancel();return;}
        if(mode==='join'&&(!ack.room||String(ack.room.tourCode).toUpperCase().trim()!==
          String(join.tourCode||'RY-KASIM').toUpperCase().trim()||
          String(ack.room.roomId)!==String(join.roomId||'genel').trim())){cancel();return;}
        if(mode==='family-subscribe'&&String(ack.tourCode).toUpperCase().trim()!==
          String(join.tourCode||'RY-KASIM').toUpperCase().trim()){cancel();return;}
        finished=true;clearTimeout(timer);this._failbackProbe=null;this._cancelNativeProbe=null;
        this._native=probe;this._isRelay=false;this._opened=true;
        this._resetRelaySession();
        if(this._pollTimer){clearInterval(this._pollTimer);this._pollTimer=null;}
        if(this._vdsFailbackTimer){clearInterval(this._vdsFailbackTimer);this._vdsFailbackTimer=null;}
        probe.onmessage=e=>{if(!this._isRelay&&this.readyState===1)this.onmessage?.(e);};
        probe.onerror=e=>this.onerror?.(e);
        probe.onclose=e=>{if(!this._isRelay){this.readyState=3;this.onclose?.(e);}};
        try{this.onmessage?.({data:JSON.stringify(ack)});}catch(e){this.onerror?.(e);}
        if(this._closedExplicitly||this.readyState!==1||this._isRelay||this._native!==probe)return;
        this._failbackSubscription=request;
        try{this.onopen?.({type:'open',failback:true});}catch(e){this.onerror?.(e);}
        finally{this._failbackSubscription=null;}
        if(this._closedExplicitly||this.readyState!==1||this._isRelay||this._native!==probe)return;
        const pending=this._sendQueue.splice(0),now=Date.now();
        for(const m of pending){
          if(['join','family-subscribe','admin-subscribe','guide-stream-state'].includes(m.type))continue;
          if(m.type==='audio-chunk'&&(!Number.isFinite(m._queuedAt)||now-m._queuedAt>200))continue;
          try{this.send(JSON.stringify(m));}catch(e){this.onerror?.(e);}
        }
        this._audioCoalescer?.flush();this._closeMqttClients();window.__ryConsecutiveVdsFailures=0;
      };
    }

    _sanitizeCode(str) {
      return String(str || 'RYKASIM').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    _busConnected() {
      return this._mqttClients.some((c) => c && c.connected);
    }

    _closeMqttClients() {
      for (const c of this._mqttClients) {
        try { c.end(true); } catch {}
      }
      this._mqttClients = [];
    }

    _initMqttBus(joinMsg, isAdminMode = false) {
      loadScriptOnce('https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js', 'mqtt', () => {
        if (!window.mqtt) return;
        this._closeMqttClients();

        const codeClean = joinMsg ? this._sanitizeCode(joinMsg.tourCode) : 'ALL';
        const roomClean = joinMsg && joinMsg.roomId ? String(joinMsg.roomId).trim().toUpperCase() : 'GENEL';
        const topic = `ridvanses/v2/room/${codeClean}/${roomClean}`;
        this._mqttTopic = topic;

        // Ölçüm (30 sn, 23 paket/sn): broker.emqx.io yayıncı başına ~10 mesaj/sn ile sınırlıyor (%54 kayıp);
        // test.mosquitto.org %0 kayıp / p50 47ms. Ses ve kontrol mesajları HER İKİ brokera birden gider,
        // alıcı tarafında _msgId ile tekilleştirilir — biri yavaşlarsa/çökerse diğeri sesi taşır.
        CLOUD_BROKERS.forEach((brokerUrl) => {
          let client;
          try {
            client = window.mqtt.connect(brokerUrl, {
              clientId: 'ry_' + this._clientId + '_' + Math.random().toString(36).slice(2, 6),
              clean: true,
              keepalive: 20,
              reconnectPeriod: 1200,
              connectTimeout: 8000
            });
          } catch {
            return;
          }
          this._mqttClients.push(client);

          client.on('connect', () => {
            // Rehber ve Admin her zaman Global SOS kanalını da dinler (hangi turda olursa olsun kayıp hacıyı görür!)
            if (isAdminMode || (joinMsg && joinMsg.role === 'guide')) {
              client.subscribe(GLOBAL_SOS_TOPIC, { qos: 0 });
            }
            if (!joinMsg) return;
            if (joinMsg.role !== 'guide' && roomClean !== 'GENEL') {
              client.subscribe(`ridvanses/v2/room/${codeClean}/GENEL`, { qos: 0 });
            }
            client.subscribe(topic, { qos: 0 }, () => {
              if (joinMsg.role !== 'guide') {
                this._publishMqtt({
                  _msgId: 'hello-' + this._clientId + '-' + Date.now(),
                  type: 'p2p-pilgrim-hello',
                  clientId: this._clientId,
                  name: joinMsg.name || 'Hacı Misafir',
                  phone: joinMsg.phone || '',
                  lang: joinMsg.lang || 'tr',
                  joinedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                });
              } else {
                this._publishMqtt({
                  _msgId: 'gping-' + this._clientId + '-' + Date.now(),
                  type: 'p2p-guide-ping',
                  guideName: joinMsg.name || 'Ömer Ali Gültekin'
                });
              }
            });
          });

          client.on('message', (t, payloadBuf) => {
            try {
              const msg = JSON.parse(payloadBuf.toString());
              if (!msg || msg.senderClientId === this._clientId) return;
              // KRİTİK-02: Herkese açık MQTT broker'larından gelen imzasız veya bayat (>60sn) paketleri reddet
              const frameTs = Number(msg._ryTs) || 0;
              if (!frameTs || Math.abs(Date.now() - frameTs) > 60000) return;
              const expectedSig = this._computeMqttFrameSig(t, msg.type, frameTs, msg.senderClientId);
              if (!msg._rySig || msg._rySig !== expectedSig) return;
              // Aynı mesaj iki brokerdan da gelir: ilk geleni işle, ikincisini at
              if (msg._msgId) {
                if (this._busSeen.has(msg._msgId)) return;
                this._busSeen.add(msg._msgId);
                if (this._busSeen.size > 800) {
                  this._busSeen.delete(this._busSeen.values().next().value);
                }
              }
              if (t === GLOBAL_SOS_TOPIC) {
                if (msg.type === 'sos-alert' || msg.type === 'sos-resolved') {
                  this._deliverIncomingMessage(msg);
                }
                return;
              }
              this._handleCloudBusMessage(msg);
            } catch {}
          });
        });
      });
    }

    _computeMqttFrameSig(topic, type, ts, senderId) {
      const raw = `ryv2|${String(topic || '')}|${String(type || '')}|${Number(ts) || 0}|${String(senderId || '')}|kabe_shield_2026`;
      let h1 = 0x811c9dc5;
      let h2 = 0x1505;
      for (let i = 0; i < raw.length; i++) {
        const c = raw.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 = ((h2 << 5) + h2 + c) >>> 0;
      }
      return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
    }

    _publishMqtt(obj, customTopic = null) {
      const targetTopic = customTopic || this._mqttTopic;
      if (!targetTopic) return;
      const nowTs = Date.now();
      const sig = this._computeMqttFrameSig(targetTopic, obj && obj.type, nowTs, this._clientId);
      const payload = JSON.stringify({ ...obj, senderClientId: this._clientId, _ryTs: nowTs, _rySig: sig });
      for (const c of this._mqttClients) {
        if (c && c.connected) {
          try { c.publish(targetTopic, payload, { qos: 0 }); } catch {}
        }
      }
    }

    _handleCloudBusMessage(msg) {
      const role = this._joinContext ? this._joinContext.role : 'pilgrim';

      if (msg.type === 'p2p-guide-ping' && role !== 'guide' && this._joinContext) {
        this._publishMqtt({
          _msgId: 'hello-' + this._clientId + '-' + Date.now(),
          type: 'p2p-pilgrim-hello',
          clientId: this._clientId,
          name: this._joinContext.name || 'Hacı Misafir',
          phone: this._joinContext.phone || '',
          lang: this._joinContext.lang || 'tr',
          joinedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        });
        return;
      }

      if (role === 'guide') {
        if (msg.type === 'p2p-pilgrim-hello') {
          const cid = msg.clientId || msg.senderClientId;
          this._pilgrimMeta.set(cid, {
            id: cid,
            name: msg.name || 'Hacı Misafir',
            phone: msg.phone || '',
            lang: msg.lang || 'tr',
            roomId: msg.roomId || 'genel',
            joinedAt: msg.joinedAt || 'Şimdi'
          });
          this._broadcastP2PRoomState();
          return;
        }

        if (msg.type === 'sos-trigger') {
          const cid = msg.senderClientId;
          const p = this._pilgrimMeta.get(cid);
          const alertItem = {
            id: msg.alertId || ('sos-' + Date.now()),
            tourCode: msg.tourCode || (this._joinContext ? this._joinContext.tourCode : 'RY-KASIM'),
            pilgrimName: msg.pilgrimName || (p ? p.name : 'Hacı Misafir'),
            phone: msg.phone || (p && p.phone) || '+90 538 399 96 66',
            lat: Number(msg.lat) || 21.4225,
            lng: Number(msg.lng) || 39.8262,
            accuracy: msg.accuracy || null,
            locationNote: msg.locationNote || 'Canlı Cihaz GPS Konumu',
            createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            status: 'active'
          };
          this._deliverIncomingMessage({
            _msgId: msg._msgId,
            type: 'sos-alert',
            alert: alertItem
          });
          return;
        }

        if (
          msg.type === 'new-announcement' ||
          msg.type === 'announcement-deleted' ||
          msg.type === 'steps-updated'
        ) {
          this._deliverIncomingMessage(msg);
          return;
        }
      } else {
        if (msg.type === 'audio-chunk') {
          this._deliverIncomingMessage(msg);
          return;
        }
        if (
          msg.type === 'room-state' ||
          msg.type === 'audio-source' ||
          msg.type === 'stream-state' ||
          msg.type === 'tawaf-stage' ||
          msg.type === 'new-announcement' ||
          msg.type === 'announcement-deleted' ||
          msg.type === 'guide-location' ||
          msg.type === 'steps-updated' ||
          msg.type === 'family-state'
        ) {
          this._deliverIncomingMessage(msg);
          return;
        }
      }
    }

    _broadcastP2PRoomState() {
      if (!this._joinContext || this._joinContext.role !== 'guide') return;
      if (this._roomStateTimer) return;
      this._roomStateTimer = setTimeout(() => {
        this._roomStateTimer = null;
        if (!this._joinContext || this._joinContext.role !== 'guide') return;
        const pilgrims = Array.from(this._pilgrimMeta.values());
        const tourCode = this._joinContext.tourCode || 'RY-KASIM';
        const roomId = this._joinContext.roomId || 'genel';
        const isLive=typeof this._lastGuideState?.isLive==='boolean'?this._lastGuideState.isLive:
          typeof this._isLive==='undefined'?true:Boolean(this._isLive);
        const roomObj = {
          tourCode,
          roomId,
          guideName: this._joinContext.name || 'Ömer Ali Gültekin',
          isLive,
          broadcastMode:this._lastGuideState?.broadcastMode||this._broadcastMode||(isLive?'mic':'idle'),
          currentTopic:
            this._currentTopic ||
            (tourCode === 'RY-KASIM'
              ? 'Kasım Umresi — Kâbe’nin Huzuru & Peygamber Efendimizin ﷺ İzinde Manevi Yolculuk'
              : 'Kâbe-i Muazzama Tavaf Duaları & Siyer-i Nebi Sohbeti'),
          activeTawafStage: this._activeTawafStage || null,
          guidePeerId: window.ryGetDynamicChannelId(tourCode, roomId),
          audioSourceId:this._joinContext.audioSourceId||null,
          audioStateKnown:typeof this._lastGuideState?.isLive==='boolean'||typeof this._isLive==='boolean',
          audioStateSeq:this._lastGuideState?.audioStateSeq||null,audioStateEnded:false,
          guideLocation: this._guideLocation || null,
          connectedPilgrims: pilgrims,
          totalListeners: pilgrims.length,
          realListenerCount: pilgrims.length
        };
        const payload = {
          _msgId: 'rs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          type: 'room-state',
          room: roomObj
        };
        this._deliverIncomingMessage(payload);
        this._publishMqtt(payload);
      }, 180);
    }

    // PATCH: shim-delivery-v50
    _deliverIncomingMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg._msgId) {
        if (this._seenIds.has(msg._msgId)) return;
        this._seenIds.add(msg._msgId);
        if (this._seenIds.size > 400) {
          this._seenIds.delete(this._seenIds.values().next().value);
        }
      }
      if (msg.type === 'audio-chunk' && !msg.synthNote) {
        const list = unpackRysAudio(msg);
        if (!list?.length) return;
        if (typeof this.onmessage === 'function') {
          for (const f of list) this.onmessage({ data: JSON.stringify(f) });
        }
        return;
      }
      if (typeof this.onmessage === 'function') {
        this.onmessage({ data: JSON.stringify(msg) });
      }
    }

    // PATCH: shim-send-v53
    send(data) {
      if (
        (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) ||
        (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(data))
      ) {
        if (!this._isRelay && this._native && this._native.readyState === 1) {
          this._native.send(data);
        }
        return;
      }

      let parsed = null;
      try {
        parsed = typeof data === 'string' ? JSON.parse(data) : data;
      } catch {}

      // The ACK-gated probe has already subscribed. Suppress only an identical
      // subscription during the synthetic open; changed UI data must still be sent.
      if (this._failbackSubscription && parsed && typeof parsed === 'object') {
        const old = this._failbackSubscription;
        const keys = new Set([...Object.keys(old), ...Object.keys(parsed)]);
        keys.delete('_msgId');
        if ([...keys].every(k => JSON.stringify(old[k]) === JSON.stringify(parsed[k]))) return;
      }
      if (parsed && typeof parsed === 'object') {
        const subscription=['join','family-subscribe','admin-subscribe'].includes(parsed.type);
        const previousRoute=subscription?this._relayRoutingKey():null;
        if (!parsed._msgId) {
          parsed._msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        }
        if(['join','family-subscribe','admin-subscribe'].includes(parsed.type))this._cancelNativeProbe?.();
        if(parsed.type==='guide-stream-state'){
          parsed={...parsed,audioStateSeq:nextRysAudioStateSeq(this._lastGuideState?.audioStateSeq),audioStateEnded:false};
          this._lastGuideState={...parsed};
          if(!parsed.isLive||String(parsed.broadcastMode||'').startsWith('demo')){
            this._audioCoalescer?.clear();this._sendQueue=(this._sendQueue||[]).filter(m=>m.type!=='audio-chunk');
          }
        }
        if(['family-subscribe','admin-subscribe'].includes(parsed.type)){
          this._lastGuideState=null;this._audioCoalescer?.clear();
          this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk');
        }
        if (parsed.type === 'join') {
          const old=this._joinContext;
          if(old&&(old.tourCode!==parsed.tourCode||old.roomId!==parsed.roomId||old.role!==parsed.role||
            parsed.audioSourceId!==undefined&&old.audioSourceId!==parsed.audioSourceId)){
            this._lastGuideState=null;
            this._audioCoalescer?.clear();this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk');
          }
          this._isAdmin=false;
          this._subscriptionType='join';this._transportGeneration=(this._transportGeneration||0)+1;
          this._joinContext = parsed;
          if (this._isRelay) this._initMqttBus(parsed, false);
        } else if (parsed.type === 'family-subscribe') {
          this._isAdmin=false;
          this._subscriptionType='family-subscribe';this._transportGeneration=(this._transportGeneration||0)+1;
          this._joinContext = {
            type: 'join',
            role: 'pilgrim',
            tourCode: parsed.tourCode || 'RY-KASIM',
            roomId: 'genel',
            name: 'Aile Takipçisi'
          };
          if (this._isRelay) this._initMqttBus(this._joinContext, false);
        } else if (parsed.type === 'admin-subscribe') {
          this._subscriptionType='admin-subscribe';this._transportGeneration=(this._transportGeneration||0)+1;
          this._isAdmin = true;
          this._joinContext = null;
          if (this._isRelay) this._initMqttBus(null, true);
        }
        if(subscription&&previousRoute!==this._relayRoutingKey()){
          this._sendQueue.length=0;this._audioCoalescer?.clear();this._lastGuideState=null;
        }
      }

      if(parsed?.type==='audio-chunk'&&this._joinContext?.role==='guide'){
        const state=this._lastGuideState,pcm=!parsed.synthNote;
        if(state&&(state.isLive===false||pcm&&String(state.broadcastMode||'').startsWith('demo')))return;
        const source=this._joinContext.audioSourceId;
        if(source&&!pcm){if(parsed.audioSourceId&&parsed.audioSourceId!==source)return;parsed={...parsed,audioSourceId:source};}
        if(pcm&&source){
          const frames=parsed.frames===undefined?[parsed]:parsed.frames;
          if(!Array.isArray(frames)||!frames.length||frames.length>3||!frames.every(validRysAudio))return;
          const kept=frames.filter(f=>!f.audioSourceId||f.audioSourceId===source).map(f=>({...f,audioSourceId:source}));
          if(!kept.length)return;
          parsed=parsed.frames===undefined?kept[0]:{...parsed,frames:kept,audioSourceId:source};
        }
      }
      if (!this._isRelay) {
        if (this._native && this._native.readyState === 1) {
          this._native.send(typeof parsed === 'object' ? JSON.stringify(parsed) : data);
        }
        return;
      }

      if (!parsed) return;

      if (this._joinContext && this._joinContext.role === 'guide') {
        if (parsed.type === 'audio-chunk') {
          this._publishMqtt({
            ...parsed,
            speakerRole: 'guide',
            speakerName: this._joinContext.name || 'Ömer Ali Gültekin'
          });
        } else if (parsed.type === 'guide-location-update') {
          if (parsed.active === false) {
            this._guideLocation = {
              active: false,
              updatedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
          } else {
            this._guideLocation = {
              active: true,
              lat: Number(parsed.lat),
              lng: Number(parsed.lng),
              accuracy: parsed.accuracy || null,
              address: parsed.address || '',
              note: parsed.note || 'Kafile Toplanma / Rehber Konumu',
              guideName: this._joinContext.name || 'Rehber Hoca',
              updatedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
          }
          const locPayload = {
            _msgId: parsed._msgId,
            type: 'guide-location',
            guideLocation: this._guideLocation
          };
          this._publishMqtt(locPayload);
          this._broadcastP2PRoomState();
        } else if (parsed.type === 'quick-announcement') {
          const annPayload = {
            _msgId: parsed._msgId,
            type: 'new-announcement',
            announcement: {
              id: 'ann-' + Date.now(),
              tourCode: this._joinContext.tourCode,
              title: parsed.title || 'Rehber Duyurusu',
              message: parsed.message || '',
              sender: this._joinContext.name || 'Rehber Hoca',
              createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              urgent: true
            }
          };
          this._publishMqtt(annPayload);
          this._deliverIncomingMessage(annPayload);
        } else if (parsed.type === 'guide-stream-state') {
          if (typeof parsed.isLive !== 'undefined') this._isLive = Boolean(parsed.isLive);
          this._broadcastMode = parsed.broadcastMode || (this._isLive ? 'mic' : 'idle');
          if (parsed.topic) this._currentTopic = parsed.topic;
          this._publishMqtt({
            _msgId: parsed._msgId,
            type: 'stream-state',
            isLive: this._isLive,
            broadcastMode: this._broadcastMode,
            currentTopic: this._currentTopic,
            audioSourceId:this._joinContext.audioSourceId||null,
            audioStateSeq:parsed.audioStateSeq,audioStateEnded:false,
            guidePeerId: window.ryGetDynamicChannelId(
              this._joinContext.tourCode || 'RY-KASIM',
              this._joinContext.roomId || 'genel'
            )
          });
          this._broadcastP2PRoomState();
        } else if (parsed.type === 'tawaf-stage-update') {
          if (parsed.clear) {
            this._activeTawafStage = null;
          } else {
            this._activeTawafStage = {
              id: parsed.stageId || 'savt-1',
              badge: parsed.badge || 'TAVAF AŞAMASI',
              title: parsed.title || 'Tavaf & Sa’y Rehberliği',
              arabic: parsed.arabic || '',
              reading: parsed.reading || '',
              meaning: parsed.meaning || '',
              note: parsed.note || '',
              updatedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            };
            if (parsed.topic) this._currentTopic = parsed.topic;
          }
          this._publishMqtt({
            _msgId: parsed._msgId,
            type: 'tawaf-stage',
            activeTawafStage: this._activeTawafStage,
            currentTopic: this._currentTopic
          });
          this._broadcastP2PRoomState();
        }
      } else {
        if (parsed.type === 'sos-trigger') {
          const enrichedSos = {
            ...parsed,
            alertId: 'sos-' + Date.now(),
            tourCode: (this._joinContext && this._joinContext.tourCode) || 'RY-KASIM',
            pilgrimName: (this._joinContext && this._joinContext.name) || 'Hacı Misafir',
            phone: (this._joinContext && this._joinContext.phone) || '+90 538 399 96 66'
          };
          this._publishMqtt(enrichedSos);
          // Global SOS kanalına da yayınla ki Rehber/Acente hangi sekmede olursa olsun anında görsün!
          this._publishMqtt({
            _msgId: parsed._msgId,
            type: 'sos-alert',
            alert: {
              id: enrichedSos.alertId,
              tourCode: enrichedSos.tourCode,
              pilgrimName: enrichedSos.pilgrimName,
              phone: enrichedSos.phone,
              lat: Number(parsed.lat),
              lng: Number(parsed.lng),
              accuracy: parsed.accuracy || null,
              locationNote: parsed.locationNote || 'Canlı Cihaz GPS Konumu',
              createdAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
              status: 'active'
            }
          }, GLOBAL_SOS_TOPIC);
        } else {
          this._publishMqtt({
            ...parsed,
            name: (this._joinContext && this._joinContext.name) || 'Hacı Misafir'
          });
        }
      }

      // MQTT WSS bağlıyken ses paketlerini (audio-chunk) yavaş HTTP /api/ws-relay kuyruğuna sokma (ağ tıkanıklığını ve 450ms gecikmeli çift paketi önler)
      if (parsed.type === 'audio-chunk' && this._busConnected()) {
        return;
      }

      if(!this._enqueueRelayMessage(parsed))return;
      if (!this._inFlight) {
        this._flushAndPoll();
      }
    }

    // PATCH: shim-queue-v52
    _enqueueRelayMessage(message){
      if(message.type==='guide-stream-state'){
        message={...(this._lastGuideState||message)};
        this._sendQueue=this._sendQueue.filter(m=>m.type!=='guide-stream-state');
      }
      const now=Date.now();
      this._sendQueue=this._sendQueue.filter(m=>m.type!=='audio-chunk'||
        (Number.isFinite(m._queuedAt)&&now-m._queuedAt<=200));
      const audio=message.type==='audio-chunk';
      const matches=this._sendQueue.filter(m=>(m.type==='audio-chunk')===audio).length;
      const limit=audio?4:64;
      if(matches>=limit){
        this._relayQueueDrops=(this._relayQueueDrops||0)+1;
        if(!audio)return false;
        const oldest=this._sendQueue.findIndex(m=>m.type==='audio-chunk');this._sendQueue.splice(oldest,1);
      }
      this._sendQueue.push(message);return true;
    }

    // PATCH: shim-http-v52
    _relayRoutingKey(){
      const mode=this._subscriptionType||(this._isAdmin?'admin-subscribe':'join'),c=this._joinContext||{};
      if(mode==='admin-subscribe')return JSON.stringify([mode]);
      const tour=String(c.tourCode||'RY-KASIM').toUpperCase().trim();
      if(mode==='family-subscribe')return JSON.stringify([mode,tour]);
      const route=[mode,tour,String(c.roomId||'genel').trim(),c.role==='guide'?'guide':'pilgrim'];
      if(c.role==='guide'&&c.audioSourceId)route.push(c.audioSourceId);
      return JSON.stringify(route);
    }
    async _flushAndPoll(){
      if(this.readyState!==1||!this._isRelay||this._inFlight||this._relayFenced)return;
      const epoch=this._httpEpoch||0,route=this._relayRoutingKey();
      const sameRoute=()=>route===this._relayRoutingKey();
      const current=()=>this.readyState===1&&this._isRelay&&(this._httpEpoch||0)===epoch;
      const batch=this._sendQueue.splice(0).filter(m=>m.type!=='audio-chunk'||
        (Number.isFinite(m._queuedAt)&&Date.now()-m._queuedAt<=200));
      this._inFlight=true;const ac=new AbortController();this._relayAbort=ac;
      const timer=setTimeout(()=>ac.abort(),3000);let success=false;
      try{
        if(!this._relayClientId||!this._relayKey){
          // Opening has no subscription/media side effect, even if this response is lost.
          const opened=await fetch('/api/ws-relay',{method:'POST',signal:ac.signal,
            headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'relay-open',version:56})});
          const data=await opened.json();if(!current())return;
          if(!opened.ok||!String(data.clientId||'').startsWith('rys56-')||
            !/^[0-9a-f]{48}$/.test(data.relayKey||''))throw Error('Relay open failed');
          this._relayClientId=data.clientId;this._relayKey=data.relayKey;
          if(!sameRoute()){success=true;return;}
          if(this._lastGuideState&&this._joinContext?.role==='guide'){
            // Reannounce before the first PCM; renewal may follow an authoritative disconnect stop.
            this._lastGuideState={...this._lastGuideState,audioStateSeq:nextRysAudioStateSeq(this._lastGuideState?.audioStateSeq),audioStateEnded:false};
            for(let i=batch.length-1;i>=0;i--)if(batch[i].type==='guide-stream-state')batch.splice(i,1);
            batch.unshift({...this._lastGuideState});
          }
        }
        const token=(localStorage.getItem('ry_auth_token')||'').trim();
        const mode=this._subscriptionType||(this._isAdmin?'admin-subscribe':'join');
        const context=mode==='admin-subscribe'?{type:mode,token}:
          mode==='family-subscribe'?{type:mode,tourCode:this._joinContext?.tourCode||'RY-KASIM'}:
          this._joinContext;
        const fresh=batch.filter(m=>{
          if(m.type!=='audio-chunk')return true;
          if(!Number.isFinite(m._queuedAt)||Date.now()-m._queuedAt>200)return false;
          const state=this._lastGuideState,source=this._joinContext?.audioSourceId;
          if(this._joinContext?.role==='guide'&&state&&(state.isLive===false||!m.synthNote&&String(state.broadcastMode||'').startsWith('demo')))return false;
          const frames=Array.isArray(m.frames)?m.frames:[m];
          return !source||frames.every(f=>!f.audioSourceId||f.audioSourceId===source);
        });
        const requestSeq=this._relayRequestSeq=(this._relayRequestSeq||0)+1;
        const res=await fetch('/api/ws-relay',{method:'POST',signal:ac.signal,
          headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:this._relayClientId,
            relayKey:this._relayKey,requestSeq,token,subscriptionContext:context,messages:fresh})});
        const payload=await res.json();if(!current())return;
        if(!res.ok){
          if(res.status===409&&payload.error==='relay-request-stale'){success=true;return;}
          if(res.status===409){
            if(payload.error==='relay-session-retired'&&this._failbackProbe)this._relayFenced=true;
            else{
              if(sameRoute())for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
              batch.length=0;this._cancelNativeProbe?.();this._resetRelaySession();
            }
          }
          throw Error('Relay HTTP '+res.status);
        }
        if(!sameRoute()){success=true;return;}
        if(Array.isArray(payload.messages))for(const m of payload.messages)this._deliverIncomingMessage(m);
        success=true;
      }catch(e){
        if(current()&&sameRoute())for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
      }finally{
        clearTimeout(timer);
        if(this._relayAbort===ac)this._relayAbort=null;
        if((this._httpEpoch||0)===epoch)this._inFlight=false;
        if(success&&current()&&this._sendQueue.length)
          queueMicrotask(()=>{if(current())this._flushAndPoll();});
      }
    }

    // PATCH: shim-close-v53
    close() {
      this._closedExplicitly=true;this._cancelNativeProbe?.();this._resetRelaySession?.();
      this.readyState = 3;
      this._httpEpoch=(this._httpEpoch||0)+1;
      this._relayAbort?.abort();this._relayAbort=null;
      this._audioCoalescer?.clear();this._sendQueue.length=0;
      if (this._vdsFailbackTimer) {
        clearInterval(this._vdsFailbackTimer);
        this._vdsFailbackTimer = null;
      }
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
      this._closeMqttClients();
      if (this._native) {
        try { this._native.close(); } catch {}
      }
    }
  }

  SmartWebSocket.CONNECTING = 0;
  SmartWebSocket.OPEN = 1;
  SmartWebSocket.CLOSING = 2;
  SmartWebSocket.CLOSED = 3;

  window.WebSocket = SmartWebSocket;

  // Yetkili oturumlarda (/panel ve /rehber) çerez engeli olsa bile tüm /api/ isteklerine Authorization başlığını otomatik ekle
  // ve .vercel.app üzerinden girildiğinde tüm /api/ isteklerini ana Cidde VDS sunucusuna (https://ses.ridvanyilmazturizm.com) yönlendir
  const VDS_API_ORIGIN = 'https://ses.ridvanyilmazturizm.com';
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      let targetInput = input;
      let isCrossOriginVdsApi = false;
      try {
        const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
        const parsedUrl = new URL(urlStr, window.location.origin);
        const isTrustedOrigin =
          parsedUrl.origin === window.location.origin || parsedUrl.origin === VDS_API_ORIGIN;
        if (isTrustedOrigin && parsedUrl.pathname.startsWith('/api/')) {
          const token = localStorage.getItem('ry_auth_token');
          if (token) {
            init = Object.assign({}, init);
            const mergedHeaders = new Headers(
              init.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined)
            );
            mergedHeaders.set('Authorization', 'Bearer ' + token);
            init.headers = mergedHeaders;
          }
          if (
            typeof input === 'string' &&
            urlStr.startsWith('/api/') &&
            window.location &&
            window.location.host &&
            window.location.host.includes('vercel.app')
          ) {
            targetInput = VDS_API_ORIGIN + urlStr;
            isCrossOriginVdsApi = true;
          }
        }
      } catch (e) {}
      if (isCrossOriginVdsApi) {
        return origFetch.call(this, targetInput, init).catch(() => origFetch.call(this, input, init));
      }
      return origFetch.call(this, targetInput, init);
    };
  }
})();
