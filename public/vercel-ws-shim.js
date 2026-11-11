// RıdvanSes — 3 Katmanlı Hibrit Gerçek Zamanlı Ses, Konum (SOS) & Veri Köprüsü
// 1. Yerel / Dedicated Sunucu: Doğrudan Native WebSocket (/ws)
// 2. Kalıcı WSS Bulut Ses & SOS Otobüsü (MQTT-over-WSS: wss://broker.emqx.io:8084/mqtt) — 35ms gecikme, tüm odalar ve acil SOS için anlık iletim
// 3. Tek-Uçuşlu (/api/ws-relay) HTTP Yedeği (msgId tekilleştirmeli)
(function () {
  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;

  function loadScriptOnce(src, globalName, cb, fallbackSrc) {
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
    s.onerror = () => {
      if (fallbackSrc) {
        s.remove();
        loadScriptOnce(fallbackSrc, globalName, cb);
      }
    };
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
      (m.audioMediaEpoch==null||(Number.isSafeInteger(m.audioMediaEpoch)&&m.audioMediaEpoch>0)) &&
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
        c.push({...m,audioSourceId:m.audioSourceId||sock._joinContext?.audioSourceId||null,
          audioMediaEpoch:m.audioMediaEpoch??sock._lastGuideState?.audioMediaEpoch??null});
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

      const native=this._native;
      // VDS / Özel Domain Ortamında Mobil Şebeke (Asansör/Tünel) El Sıkışma Zaman Aşımı (3.5 sn):
      // İlk hatada doğrudan VDS'i yeniden dene; VDS üst üste erişilemezse (bakım/ağ engeli) otomatik MQTT Bulut Rölesine geç!
      const handshakeLimit = 3500;
      const fallbackTimeout = setTimeout(() => {
        if(this._closedExplicitly||this._native!==native)return;
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
        if (this._isRelay||this._closedExplicitly||this._native!==native) return;
        clearTimeout(fallbackTimeout);
        window.__ryConsecutiveVdsFailures = 0;
        this._opened = true;
        this.readyState = 1; // OPEN
        console.log('⚡ [RıdvanSes] VDS Doğrudan Yerel WebSocket Bağlandı (Ultra Düşük Gecikme Modu)');
        if (typeof this.onopen === 'function') this.onopen(ev);
      };

      this._native.onmessage = event=>this._handleNativeMessage(native,event);

      this._native.onerror = (err) => {
        if (!this._opened && !this._isRelay) {
          console.warn('⚠️ [RıdvanSes WS] Doğrudan VDS WebSocket hatası:', err);
        }
        if (typeof this.onerror === 'function') this.onerror(err);
      };

      this._native.onclose = (ev) => {
        clearTimeout(fallbackTimeout);
        if(this._closedExplicitly||this._native!==native)return;
        if(ev.code===4009){this._handleNativeClose(native,ev);return;}
        if (!this._isRelay) {
          if (!this._opened) {
            window.__ryConsecutiveVdsFailures = (window.__ryConsecutiveVdsFailures || 0) + 1;
            if (window.__ryConsecutiveVdsFailures >= 2) {
              console.warn('⚠️ [RıdvanSes WS] VDS bağlantı hatası — Kesintisiz yayın için MQTT Bulut Rölesi devreye alındı.');
              this._activateCloudRelay();
              return;
            }
          }
          this._handleNativeClose(native,ev);
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
      this._relayClientId=null;this._relayKey=null;this._relayFenced=false;this._relayRequestSeq=0;this._relayGuideStateAckEpoch=null;
      this._httpEpoch=(this._httpEpoch||0)+1;
      this._relayAbort?.abort();this._relayAbort=null;this._inFlight=false;
    }

    _handleNativeMessage(socket,event){
      if(this._native!==socket||this._isRelay||this._closedExplicitly||this.readyState!==1)return;
      if(typeof event.data==='string'){
        let message;try{message=JSON.parse(event.data);}catch(e){}
        if(message?.type==='session-replaced'){this._fenceReplaced();return;}
        if(message)this._observeTrustedMessage(message);
      }
      // Preserve the original ArrayBuffer/Blob event; no PCM copy or re-encoding.
      this.onmessage?.(event);
    }
    _handleNativeClose(socket,event){
      if(this._native!==socket||this._isRelay||this._closedExplicitly)return;
      if(event?.code===4009){this._fenceReplaced();return;}
      this.readyState=3;this.onclose?.(event);
    }

    _tryNativeFailback(){
      if(this._relayFenced||!this._isRelay||this.readyState!==1||this._closedExplicitly||this._failbackProbe)return;
      const join=this._joinContext,generation=this._transportGeneration||0;
      const mode=this._subscriptionType||(this._isAdmin?'admin-subscribe':'join');
      const request=mode==='admin-subscribe'?{type:mode,token:(localStorage.getItem('ry_auth_token')||'').trim()}:
        mode==='family-subscribe'?(join?{type:mode,tourCode:join.tourCode,...(join.pin!==undefined?{pin:join.pin}:{})}:null):join?{...join}:null;
      if(!request)return;
      let probe;try{probe=new NativeWebSocket(this.url);probe.binaryType='arraybuffer';}catch(e){return;}
      this._failbackProbe=probe;let finished=false,commitSent=false,probeFenced=false,handoffId=null;
      const valid=()=>!this._closedExplicitly&&this._isRelay&&this.readyState===1&&
        (this._transportGeneration||0)===generation;
      const cancel=()=>{
        if(finished)return;finished=true;clearTimeout(timer);
        if(this._failbackProbe===probe)this._failbackProbe=null;
        if(this._cancelNativeProbe===cancel)this._cancelNativeProbe=null;
        probe.onopen=null;probe.onmessage=null;probe.onerror=null;probe.onclose=null;
        try{probe.close();}catch(e){}
        // A commit ACK may have been lost. Never reuse a possibly retired source ID,
        // and never clear permanent auth/PIN fencing when an unrelated probe cancels.
        if(commitSent||probeFenced)this._resetRelaySession();
      };
      const timer=setTimeout(cancel,5000);this._cancelNativeProbe=cancel;
      probe.onerror=cancel;probe.onclose=cancel;
      probe.onopen=()=>{
        if(!valid()){cancel();return;}
        // No HTTP source may appear behind a source-less prepare. An old open response is harmless.
        if(!this._relayClientId||!this._relayKey){this._resetRelaySession();this._relayFenced=true;probeFenced=true;}
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
        probe.onmessage=e=>this._handleNativeMessage(probe,e);
        probe.onerror=e=>this.onerror?.(e);
        probe.onclose=e=>this._handleNativeClose(probe,e);
        try{this._handleNativeMessage(probe,{data:JSON.stringify(ack)});}catch(e){this.onerror?.(e);}
        if(this._closedExplicitly||this.readyState!==1||this._isRelay||this._native!==probe)return;
        this._failbackSubscription=request;
        if(mode==='join'&&join.role==='guide'&&ack.room?.audioStateKnown===true&&
          (ack.room.audioStateEnded===true||ack.room.isLive===false))this._forceMediaEpoch=true;
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


    _clearPresence(){
      this._pilgrimMeta?.clear();this._presenceTotal=0;this._mqttInbox=[];this._busSeen?.clear();this._seenIds?.clear();
    }
    _prunePresence(now=Date.now()){
      if(!this._pilgrimMeta)this._pilgrimMeta=new Map();
      for(const [id,p] of this._pilgrimMeta)if(now-p.lastSeenAt>120000)this._pilgrimMeta.delete(id);
      while(this._pilgrimMeta.size>512)this._pilgrimMeta.delete(this._pilgrimMeta.keys().next().value);
    }
    _observeTrustedMessage(msg){
      if(msg?.type==='auth-error'){this._clearPresence();return;}
      if(msg?._localPresence||this._joinContext?.role!=='guide'||!['joined','room-state'].includes(msg?.type))return;
      const room=msg.room,c=this._joinContext;
      if(!room||String(room.tourCode).toUpperCase().trim()!==String(c.tourCode||'RY-KASIM').toUpperCase().trim()||
        String(room.roomId||'genel').trim()!==String(c.roomId||'genel').trim())return;
      this._pilgrimMeta=new Map();let bytes=2;const now=Date.now();
      this._presenceTotal=Number.isSafeInteger(room.totalListeners)&&room.totalListeners>=0?room.totalListeners:
        (Array.isArray(room.connectedPilgrims)?room.connectedPilgrims.length:0);
      for(const p of (Array.isArray(room.connectedPilgrims)?room.connectedPilgrims:[])){
        if(this._pilgrimMeta.size>=512)break;
        const item={id:String(p.id||'').slice(0,96),name:String(p.name||'').slice(0,48),
          lang:String(p.lang||'tr').slice(0,8),phone:String(p.phone||'').slice(0,64),
          roomId:String(p.roomId||'genel').slice(0,64),joinedAt:String(p.joinedAt||'').slice(0,32),lastSeenAt:now};
        if(!item.id)continue;
        bytes+=1+encodeURIComponent(JSON.stringify(item)).replace(/%../g,'x').length;if(bytes>262144)break;
        this._pilgrimMeta.set(item.id,item);
      }
    }
    _fenceReplaced(){
      if(this._replaced)return;
      this._replaced=true;this._clearPresence();this.close();
      this.onmessage?.({data:JSON.stringify({type:'session-replaced'})});
      this.onclose?.({code:4009,reason:'session-replaced'});
    }

    _encodeTopicSegment(value){
      const text=String(value);
      try{return 'u'+encodeURIComponent(text);}catch(e){return 'j'+encodeURIComponent(JSON.stringify(text));}
    }
    _sanitizeCode(str) {
      return this._encodeTopicSegment(String(str || 'RY-KASIM').toUpperCase().trim());
    }

    _busConnected() {
      return this._mqttClients.some((c) => c && c.connected);
    }

    _closeMqttClients() {
      this._mqttInbox=[];
      // Invalidate pending script loads and queued callbacks before ending any client.
      this._mqttGeneration=(this._mqttGeneration||0)+1;
      if(this._roomStateTimer){clearTimeout(this._roomStateTimer);this._roomStateTimer=null;}
      for (const c of this._mqttClients) {
        try { c.end(true); } catch {}
      }
      this._mqttClients = [];
      this._mqttTopic = null;
    }

    _initMqttBus(joinMsg, isAdminMode = false) {
      this._closeMqttClients();
      const generation=this._mqttGeneration;
      const current=()=>this._mqttGeneration===generation&&this._isRelay&&
        this.readyState===1&&!this._closedExplicitly;
      if(!current())return;
      loadScriptOnce('/vendor/mqtt/mqtt.min.js', 'mqtt', () => {
        if (!current()||!window.mqtt) return;

        const codeClean = joinMsg ? this._sanitizeCode(joinMsg.tourCode) : 'ALL';
        const roomClean=this._encodeTopicSegment(String(joinMsg?.roomId||'genel').trim());
        const topic = `ridvanses/v3/room/${codeClean}/${roomClean}`;
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
            if(!current())return;
            // Rehber ve Admin her zaman Global SOS kanalını da dinler (hangi turda olursa olsun kayıp hacıyı görür!)
            if (isAdminMode || (joinMsg && joinMsg.role === 'guide')) {
              client.subscribe(GLOBAL_SOS_TOPIC, { qos: 0 });
            }
            if (!joinMsg) return;
            if (joinMsg.role !== 'guide' && roomClean !== this._encodeTopicSegment('genel')) {
              client.subscribe(`ridvanses/v3/room/${codeClean}/ugenel`, { qos: 0 });
            }
            client.subscribe(topic, { qos: 0 }, () => {
              if(!current())return;
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
            if(!current())return;
            try {
              if(payloadBuf.length>32768)return;
              const frame=JSON.parse(payloadBuf.toString());
              if(frame?.version!==70||frame.topic!==t||!/^[0-9a-f]{64}$/.test(frame.proof||''))return;
              const q=this._mqttInbox||(this._mqttInbox=[]);
              if(q.some(f=>f.proof===frame.proof))return;
              q.push(frame);while(q.length>16)q.shift();
            } catch {}
          });
        });
      }, 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js');
    }



    _publishMqtt(frame) {
      if(frame?.version!==70||!/^[0-9a-f]{64}$/.test(frame.proof||''))return;
      const expected='ridvanses/v3/room/'+this._sanitizeCode(this._joinContext?.tourCode)+'/'+
        this._encodeTopicSegment(String(frame.roomId||'genel').trim());
      if(this._joinContext?.role!=='guide'||frame.topic!==expected)return;
      const payload=JSON.stringify(frame);if(payload.length>32768)return;
      for(const c of this._mqttClients)if(c?.connected){
        try{c.publish(frame.topic,payload,{qos:0});}catch(e){}
      }
    }

    _handleCloudBusMessage(msg){
      // Unverified peers have no authority, including hello/SOS/control.
      return;
    }

    _broadcastP2PRoomState() {
      if (!this._joinContext || this._joinContext.role !== 'guide') return;
      if (this._roomStateTimer) return;
      const generation=this._mqttGeneration||0;
      this._roomStateTimer = setTimeout(() => {
        if((this._mqttGeneration||0)!==generation||this._closedExplicitly||!this._isRelay||this.readyState!==1)return;
        this._roomStateTimer = null;
        if(!this._joinContext||this._joinContext.role!=='guide')return;
        this._prunePresence?.();
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
          audioMediaEpoch:this._lastGuideState?.audioMediaEpoch||null,
          guideLocation: this._guideLocation || null,
          connectedPilgrims: pilgrims,
          totalListeners:Number.isSafeInteger(this._presenceTotal)?this._presenceTotal:pilgrims.length,
          realListenerCount:Number.isSafeInteger(this._presenceTotal)?this._presenceTotal:pilgrims.length
        };
        const payload = {
          _msgId: 'rs-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          type: 'room-state',
          room: roomObj
        };
        this._deliverIncomingMessage({...payload,_localPresence:true});
        this._publishMqtt({...payload,room:{...roomObj,connectedPilgrims:[]}});
      }, 180);
    }

    // PATCH: shim-delivery-v50
    _deliverIncomingMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      if(msg.type==='session-replaced'){this._fenceReplaced();return;}
      this._observeTrustedMessage?.(msg);
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
        if(subscription){
          const old=this._joinContext;
          if(parsed.type!=='join'||!old||String(old.tourCode||'RY-KASIM').toUpperCase().trim()!==String(parsed.tourCode||'RY-KASIM').toUpperCase().trim()||
            String(old.roomId||'genel').trim()!==String(parsed.roomId||'genel').trim()||old.role!==parsed.role||old.token!==parsed.token)this._clearPresence?.();
        }
        if (!parsed._msgId) {
          parsed._msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        }
        if(['join','family-subscribe','admin-subscribe'].includes(parsed.type))this._cancelNativeProbe?.();
        if(parsed.type==='guide-stream-state'){
          const previous=this._lastGuideState,seq=nextRysAudioStateSeq(previous?.audioStateSeq),renew=this._forceMediaEpoch===true;
          this._forceMediaEpoch=false;
          const sameMode=previous&&previous.isLive===parsed.isLive&&previous.broadcastMode===parsed.broadcastMode;
          parsed={...parsed,audioStateSeq:seq,audioStateEnded:false,
            audioMediaEpoch:!renew&&sameMode&&Number.isSafeInteger(previous.audioMediaEpoch)?previous.audioMediaEpoch:seq};
          if(renew&&sameMode){
            const rebase=m=>{
              if(m.type!=='audio-chunk')return m;
              if(Array.isArray(m.frames))return {...m,frames:m.frames.map(rebase)};
              return m.audioMediaEpoch===previous.audioMediaEpoch?{...m,audioMediaEpoch:seq}:m;
            };
            this._sendQueue=this._sendQueue.map(rebase);
            if(this._audioCoalescer?.frames)this._audioCoalescer.frames=this._audioCoalescer.frames.map(rebase);
          }
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
            name: 'Aile Takipçisi',
            ...(parsed.pin !== undefined ? { pin: parsed.pin } : {})
          };
          if (this._isRelay) this._initMqttBus(this._joinContext, false);
        } else if (parsed.type === 'admin-subscribe') {
          this._subscriptionType='admin-subscribe';this._transportGeneration=(this._transportGeneration||0)+1;
          this._isAdmin = true;
          this._joinContext = null;
          if (this._isRelay) this._initMqttBus(null, true);
        }
        if(subscription&&previousRoute!==this._relayRoutingKey()){
          this._clearPresence?.();
          this._sendQueue.length=0;this._audioCoalescer?.clear();this._lastGuideState=null;
        }
        if(subscription&&this._relayFenced&&this._isRelay&&this.readyState===1&&!this._closedExplicitly){
          this._relayFenced=false;
          if(!this._pollTimer)this._pollTimer=setInterval(()=>this._flushAndPoll(),100);
          if(typeof this.url==='string'&&!this.url.includes('.vercel.app/ws')&&!this._vdsFailbackTimer)
            this._vdsFailbackTimer=setInterval(()=>this._tryNativeFailback(),12000);
        }
      }

      if(parsed?.type==='audio-chunk'&&this._joinContext?.role==='guide'){
        const state=this._lastGuideState,pcm=!parsed.synthNote;
        if(state&&(state.isLive===false||pcm&&String(state.broadcastMode||'').startsWith('demo')))return;
        const source=this._joinContext.audioSourceId,epoch=state?.audioMediaEpoch;
        if(parsed.synthNote&&Number.isSafeInteger(epoch)){
          if(parsed.audioMediaEpoch!=null&&parsed.audioMediaEpoch!==epoch)return;
          parsed={...parsed,audioMediaEpoch:epoch};
        }
        if(source&&!pcm){if(parsed.audioSourceId&&parsed.audioSourceId!==source)return;parsed={...parsed,audioSourceId:source};}
        if(pcm&&(source||Number.isSafeInteger(epoch))){
          const frames=parsed.frames===undefined?[parsed]:parsed.frames;
          if(!Array.isArray(frames)||!frames.length||frames.length>3||!frames.every(validRysAudio))return;
          const kept=frames.filter(f=>(!source||!f.audioSourceId||f.audioSourceId===source)&&
            (!Number.isSafeInteger(epoch)||f.audioMediaEpoch==null||f.audioMediaEpoch===epoch))
            .map(f=>({...f,audioSourceId:source||f.audioSourceId||null,audioMediaEpoch:Number.isSafeInteger(epoch)?epoch:f.audioMediaEpoch??null}));
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
          // Gerçek duyuru kimliği (ann-<ts>-<hex>) ve imzalı MQTT yayını /api/ws-relay yanıtından döner; sahte çift kayıt oluşturulmaz.
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
            audioStateSeq:parsed.audioStateSeq,audioStateEnded:false,audioMediaEpoch:parsed.audioMediaEpoch,
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
            phone: (this._joinContext && this._joinContext.phone) || ''
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

      // v70: authenticate media on the server before public MQTT publication.

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
      if(message.type==='audio-chunk'&&!Number.isFinite(message._queuedAt))message={...message,_queuedAt:now};
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
            const previous=this._lastGuideState,seq=nextRysAudioStateSeq(previous.audioStateSeq);
            // Rebase only media from the still-current capture epoch. A stop/resume during
            // relay-open must not relabel the pre-stop captured batch as fresh audio.
            const rebase=m=>{
              if(m.type!=='audio-chunk')return m;
              if(Array.isArray(m.frames))return {...m,frames:m.frames.map(rebase)};
              if(m.audioMediaEpoch==null||m.audioMediaEpoch===previous.audioMediaEpoch)return {...m,audioMediaEpoch:seq};
              return m;
            };
            for(let i=0;i<batch.length;i++)batch[i]=rebase(batch[i]);
            this._sendQueue=this._sendQueue.map(rebase);
            if(this._audioCoalescer?.frames)this._audioCoalescer.frames=this._audioCoalescer.frames.map(rebase);
            this._lastGuideState={...previous,audioStateSeq:seq,audioStateEnded:false,audioMediaEpoch:seq};
            // MQTT receivers must learn the rebased epoch before subsequent live media.
            try{this._publishMqtt?.({_msgId:'ms-'+Date.now()+'-'+seq+'-'+Math.random().toString(36).slice(2),
              type:'stream-state',audioSourceId:this._joinContext.audioSourceId||null,
              audioStateSeq:seq,audioStateEnded:false,audioMediaEpoch:seq,
              isLive:!!previous.isLive,broadcastMode:previous.broadcastMode||'idle',
              currentTopic:previous.topic||this._currentTopic||''});this._broadcastP2PRoomState?.();}catch(e){}
            for(let i=batch.length-1;i>=0;i--)if(batch[i].type==='guide-stream-state')batch.splice(i,1);
            batch.unshift({...this._lastGuideState});
          }
        }
        const token=(localStorage.getItem('ry_auth_token')||'').trim();
        const mode=this._subscriptionType||(this._isAdmin?'admin-subscribe':'join');
        const context=mode==='admin-subscribe'?{type:mode,token}:
          mode==='family-subscribe'?{type:mode,tourCode:this._joinContext?.tourCode||'RY-KASIM',...(this._joinContext?.pin!==undefined?{pin:this._joinContext.pin}:{})}:
          this._joinContext;
        const fresh=batch.filter(m=>{
          if(m.type!=='audio-chunk')return true;
          if(!Number.isFinite(m._queuedAt)||Date.now()-m._queuedAt>200)return false;
          const state=this._lastGuideState,source=this._joinContext?.audioSourceId;
          if(this._joinContext?.role==='guide'&&state&&(state.isLive===false||!m.synthNote&&String(state.broadcastMode||'').startsWith('demo')))return false;
          const frames=Array.isArray(m.frames)?m.frames:[m];
          return frames.every(f=>(!source||!f.audioSourceId||f.audioSourceId===source)&&
            (!Number.isSafeInteger(state?.audioMediaEpoch)||f.audioMediaEpoch===state.audioMediaEpoch));
        });
        // v65: a failed poll can requeue a control behind fresh PCM. Send the latest
        // control first, including a latched stop/start that could not enter a full queue.
        const latest=this._joinContext?.role==='guide'?this._lastGuideState:null;
        if(latest&&(fresh.some(m=>m.type==='guide-stream-state')||
          Number.isSafeInteger(latest.audioMediaEpoch)&&this._relayGuideStateAckEpoch!==latest.audioMediaEpoch)){
          for(let i=fresh.length-1;i>=0;i--)if(fresh[i].type==='guide-stream-state')fresh.splice(i,1);
          fresh.unshift({...latest});
        }
        const submittedGuideEpoch=latest&&fresh[0]?.type==='guide-stream-state'?fresh[0].audioMediaEpoch:null;
        const requestSeq=this._relayRequestSeq=(this._relayRequestSeq||0)+1;
        const res=await fetch('/api/ws-relay',{method:'POST',signal:ac.signal,
          headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:this._relayClientId,
            relayKey:this._relayKey,requestSeq,token,subscriptionContext:context,messages:fresh,
            mqttFrames:(this._mqttInbox||[]).splice(0,8)})});
        const payload=await res.json();if(!current())return;
        if(!res.ok){
          if(res.status===409&&payload.error==='relay-request-stale'){success=true;return;}
          if(res.status===401||res.status===403){
            this._clearPresence?.();
            this._relayFenced=true;
            if(this._pollTimer){clearInterval(this._pollTimer);this._pollTimer=null;}
            if(this._vdsFailbackTimer){clearInterval(this._vdsFailbackTimer);this._vdsFailbackTimer=null;}
            batch.length=0;this._sendQueue.length=0;this._audioCoalescer?.clear();
            this._deliverIncomingMessage({
              type:'auth-error',
              status:res.status,
              error:payload?.error||'unauthorized',
              message:payload?.message||'Oturum süresi doldu veya yetkiniz bulunmuyor.'
            });
            success=true;return;
          }
          if(res.status===409){
            if(payload.reason==='replaced'){this._fenceReplaced();success=true;return;}
            if(payload.error==='relay-session-retired'&&this._failbackProbe)this._relayFenced=true;
            else{
              if(sameRoute())for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
              batch.length=0;this._cancelNativeProbe?.();this._resetRelaySession();
            }
          }
          throw Error('Relay HTTP '+res.status);
        }
        if(!sameRoute()){success=true;return;}
        if(Number.isSafeInteger(submittedGuideEpoch)&&!payload.messages?.some?.(m=>m.type==='auth-error'||m.type==='pin-error'||m.type==='tour-unknown'))
          this._relayGuideStateAckEpoch=submittedGuideEpoch;
        this._prunePresence?.();
        if(Array.isArray(payload.mqttPublications))for(const f of payload.mqttPublications)this._publishMqtt?.(f);
        const terminalSubErr=Array.isArray(payload.messages)&&payload.messages.some(m=>
          m&&(m.type==='pin-error'||m.type==='tour-unknown'||m.type==='subscription-error'));
        if(terminalSubErr){
          this._clearPresence?.();
          this._relayFenced=true;
          if(this._pollTimer){clearInterval(this._pollTimer);this._pollTimer=null;}
          if(this._vdsFailbackTimer){clearInterval(this._vdsFailbackTimer);this._vdsFailbackTimer=null;}
          this._sendQueue.length=0;this._audioCoalescer?.clear();
        }
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
      this._clearPresence?.();
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
      let reqMethod = 'GET';
      let apiPath = '';
      try {
        const isReqObj = typeof Request !== 'undefined' && input instanceof Request;
        const isUrlObj = typeof URL !== 'undefined' && input instanceof URL;
        const urlStr = typeof input === 'string' ? input : isUrlObj ? input.toString() : (input && input.url) || '';
        reqMethod = String((init && init.method) || (isReqObj && input.method) || 'GET').toUpperCase();
        const parsedUrl = new URL(urlStr, window.location.origin);
        apiPath = parsedUrl.pathname || '';
        const isTrustedOrigin =
          parsedUrl.origin === window.location.origin || parsedUrl.origin === VDS_API_ORIGIN;
        if (isTrustedOrigin && apiPath.startsWith('/api/')) {
          const token = localStorage.getItem('ry_auth_token');
          if (token) {
            init = Object.assign({}, init);
            const mergedHeaders = new Headers(init.headers || (isReqObj ? input.headers : undefined));
            mergedHeaders.set('Authorization', 'Bearer ' + token);
            init.headers = mergedHeaders;
          }
          if (
            parsedUrl.origin === window.location.origin &&
            window.location &&
            window.location.host &&
            window.location.host.includes('vercel.app')
          ) {
            const vdsUrl = VDS_API_ORIGIN + apiPath + (parsedUrl.search || '');
            targetInput = isReqObj ? new Request(vdsUrl, input) : vdsUrl;
            isCrossOriginVdsApi = true;
          }
        }
      } catch (e) {}
      if (isCrossOriginVdsApi) {
        const canReadFallback =
          (reqMethod === 'GET' || reqMethod === 'HEAD') &&
          !apiPath.startsWith('/api/ws-relay') &&
          !apiPath.startsWith('/api/push/') &&
          !apiPath.startsWith('/api/rea-report');
        return origFetch.call(this, targetInput, init).catch((err) => {
          if (!canReadFallback || (err && err.name === 'AbortError') || (init && init.signal && init.signal.aborted)) {
            throw err;
          }
          return origFetch.call(this, input, init);
        });
      }
      return origFetch.call(this, targetInput, init);
    };
  }
})();
