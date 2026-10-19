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

  loadScriptOnce('https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js', 'mqtt', () => {});

  window.__ryActiveGuideStream = null;
  window.__ryActiveSocket = null;

  const GLOBAL_SOS_TOPIC = 'ridvanses/v2/global/sos';
  // Birincil: test.mosquitto.org (ölçüm: %0 kayıp, p50 47ms) • Yedek: broker.emqx.io
  const CLOUD_BROKERS = ['wss://test.mosquitto.org:8081', 'wss://broker.emqx.io:8084/mqtt'];

  class SmartWebSocket {
    constructor(url, protocols) {
      const isAppWs = typeof url === 'string' && url.endsWith('/ws') && url.includes(window.location.host);
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
      this._seenIds = new Set();
      this._pollTimer = null;

      this._pilgrimMeta = new Map();
      this._mqttClients = [];
      this._busSeen = new Set();
      this._mqttTopic = null;

      const isVercelHost = window.location.hostname.endsWith('.vercel.app');
      if (isVercelHost) {
        setTimeout(() => this._activateCloudRelay(), 15);
        return;
      }

      try {
        this._native = protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
      } catch (e) {
        this._activateCloudRelay();
        return;
      }

      const fallbackTimeout = setTimeout(() => {
        if (!this._opened && !this._isRelay) {
          this._activateCloudRelay();
        }
      }, 1000);

      this._native.onopen = (ev) => {
        if (this._isRelay) return;
        clearTimeout(fallbackTimeout);
        this._opened = true;
        this.readyState = 1; // OPEN
        if (typeof this.onopen === 'function') this.onopen(ev);
      };

      this._native.onmessage = (ev) => {
        if (this._isRelay) return;
        if (typeof this.onmessage === 'function') this.onmessage(ev);
      };

      this._native.onerror = () => {
        if (!this._opened && !this._isRelay) {
          clearTimeout(fallbackTimeout);
          this._activateCloudRelay();
        }
      };

      this._native.onclose = (ev) => {
        clearTimeout(fallbackTimeout);
        if (!this._opened && !this._isRelay) {
          this._activateCloudRelay();
          return;
        }
        if (!this._isRelay) {
          this.readyState = 3; // CLOSED
          if (typeof this.onclose === 'function') this.onclose(ev);
        }
      };
    }

    _activateCloudRelay() {
      if (this._isRelay) return;
      this._isRelay = true;
      this._opened = true;
      try {
        if (this._native) {
          this._native.onopen = null;
          this._native.onmessage = null;
          this._native.onerror = null;
          this._native.onclose = null;
          this._native.close();
        }
      } catch {}

      this.readyState = 1; // OPEN
      if (typeof this.onopen === 'function') {
        this.onopen({ type: 'open', relay: true });
      }

      this._pollTimer = setInterval(() => this._flushAndPoll(), 450);
    }

    _sanitizeCode(str) {
      return String(str || 'RY2026').toUpperCase().replace(/[^A-Z0-9]/g, '');
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

        // Rehber konsolu tek oda ("genel") üzerinden yayın yaptığı için bulut otobüsünde
        // kafilenin tüm hacıları aynı kafile kanalında buluşur (farklı oda seçen hacı sessiz kalmaz).
        const codeClean = joinMsg ? this._sanitizeCode(joinMsg.tourCode) : 'ALL';
        const topic = `ridvanses/v2/room/${codeClean}/GENEL`;
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

    _publishMqtt(obj, customTopic = null) {
      const targetTopic = customTopic || this._mqttTopic;
      if (!targetTopic) return;
      const payload = JSON.stringify({ ...obj, senderClientId: this._clientId });
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
          const existing = this._pilgrimMeta.get(cid);
          this._pilgrimMeta.set(cid, {
            id: cid,
            name: msg.name || 'Hacı Misafir',
            phone: msg.phone || '',
            lang: msg.lang || 'tr',
            handRaised: existing ? existing.handRaised : false,
            micGranted: existing ? existing.micGranted : false,
            joinedAt: msg.joinedAt || 'Şimdi'
          });
          this._broadcastP2PRoomState();
          return;
        }

        if (msg.type === 'raise-hand') {
          const cid = msg.senderClientId;
          let p = this._pilgrimMeta.get(cid);
          if (!p) {
            p = {
              id: cid,
              name: msg.name || 'Hacı Misafir',
              phone: '',
              lang: 'tr',
              handRaised: false,
              micGranted: false,
              joinedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            };
            this._pilgrimMeta.set(cid, p);
          }
          p.handRaised = Boolean(msg.raised);
          this._broadcastP2PRoomState();
          this._deliverIncomingMessage({
            _msgId: msg._msgId,
            type: 'hand-event',
            pilgrimId: cid,
            pilgrimName: p.name,
            raised: p.handRaised,
            questionNote: msg.note || ''
          });
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

        if (msg.type === 'audio-chunk' && msg.speakerRole === 'pilgrim') {
          this._deliverIncomingMessage(msg);
          return;
        }
      } else {
        if (msg.type === 'audio-chunk') {
          this._deliverIncomingMessage(msg);
          return;
        }
        if (msg.type === 'room-state' || msg.type === 'new-announcement' || msg.type === 'guide-location' || msg.type === 'qna-state') {
          this._deliverIncomingMessage(msg);
          return;
        }
        if (msg.type === 'mic-permission') {
          if (!msg.targetClientId || msg.targetClientId === this._clientId) {
            this._deliverIncomingMessage(msg);
          }
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
        const baseCount = tourCode === 'RY-KASIM' ? 38 : tourCode === 'RY-2026' ? 42 : 0;
        const roomObj = {
          tourCode,
          roomId: this._joinContext.roomId || 'genel',
          guideName: this._joinContext.name || 'Ömer Ali Gültekin',
          isLive: true,
          currentTopic:
            tourCode === 'RY-KASIM'
              ? 'Kasım Umresi — Kâbe’nin Huzuru & Peygamber Efendimizin ﷺ İzinde Manevi Yolculuk'
              : 'Kâbe-i Muazzama Tavaf Duaları & Siyer-i Nebi Sohbeti',
          guideLocation: this._guideLocation || null,
          connectedPilgrims: pilgrims,
          totalListeners: pilgrims.length + baseCount,
          realListenerCount: pilgrims.length,
          raisedHandsCount: pilgrims.filter((x) => x.handRaised).length,
          qnaEnabled: typeof this._qnaEnabled === 'undefined' ? true : this._qnaEnabled
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

    _deliverIncomingMessage(msg) {
      if (!msg || typeof msg !== 'object') return;
      if (msg._msgId) {
        if (this._seenIds.has(msg._msgId)) return;
        this._seenIds.add(msg._msgId);
        if (this._seenIds.size > 400) {
          const first = this._seenIds.values().next().value;
          this._seenIds.delete(first);
        }
      }
      if (typeof this.onmessage === 'function') {
        this.onmessage({ data: JSON.stringify(msg) });
      }
    }

    send(data) {
      let parsed = null;
      try {
        parsed = typeof data === 'string' ? JSON.parse(data) : data;
      } catch {}

      if (parsed && typeof parsed === 'object') {
        if (!parsed._msgId) {
          parsed._msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        }
        if (parsed.type === 'join') {
          this._joinContext = parsed;
          this._initMqttBus(parsed, false);
        } else if (parsed.type === 'admin-subscribe') {
          this._isAdmin = true;
          this._initMqttBus(null, true);
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
        } else if (parsed.type === 'grant-mic') {
          const target = this._pilgrimMeta.get(parsed.targetClientId);
          if (target) {
            target.micGranted = Boolean(parsed.granted);
            if (target.micGranted) target.handRaised = false;
          }
          this._publishMqtt({
            _msgId: parsed._msgId,
            type: 'mic-permission',
            targetClientId: parsed.targetClientId,
            granted: Boolean(parsed.granted),
            guideName: this._joinContext.name || 'Rehber Hoca'
          });
          this._broadcastP2PRoomState();
        } else if (parsed.type === 'set-qna-state') {
          this._qnaEnabled = Boolean(parsed.enabled);
          if (!this._qnaEnabled) {
            for (const p of this._pilgrimMeta.values()) {
              p.handRaised = false;
              p.micGranted = false;
            }
          }
          this._publishMqtt({
            _msgId: parsed._msgId,
            type: 'qna-state',
            enabled: this._qnaEnabled
          });
          this._broadcastP2PRoomState();
        }
      } else {
        if (parsed.type === 'audio-chunk') {
          this._publishMqtt({
            ...parsed,
            speakerRole: 'pilgrim',
            speakerName: (this._joinContext && this._joinContext.name) || 'Hacı Misafir'
          });
        } else if (parsed.type === 'sos-trigger') {
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

      if (this._sendQueue.length >= 16) this._sendQueue.shift();
      this._sendQueue.push(parsed);
      if (!this._inFlight) {
        this._flushAndPoll();
      }
    }

    async _flushAndPoll() {
      if (this.readyState !== 1 || this._inFlight) return;
      const batch = this._sendQueue.splice(0, this._sendQueue.length);
      // MQTT WSS bağlıyken ve gönderilecek kuyruk mesajı yokken gereksiz HTTP GET sorgusu atma (yüzlerce hacı bağlandığında Vercel Serverless kotasını korur)
      if (batch.length === 0 && this._busConnected()) {
        return;
      }
      this._inFlight = true;
      try {
        let res;
        if (batch.length > 0) {
          res = await fetch('/api/ws-relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId: this._clientId,
              joinContext: this._joinContext,
              messages: batch
            })
          });
        } else {
          const jc = this._joinContext || {};
          const qs = new URLSearchParams({
            clientId: this._clientId,
            tourCode: jc.tourCode || '',
            roomId: jc.roomId || 'genel',
            role: jc.role || 'pilgrim',
            name: jc.name || ''
          });
          res = await fetch('/api/ws-relay?' + qs.toString());
        }
        if (res && res.ok) {
          const payload = await res.json();
          if (Array.isArray(payload.messages)) {
            for (const msg of payload.messages) {
              this._deliverIncomingMessage(msg);
            }
          }
        }
      } catch {} finally {
        this._inFlight = false;
      }
    }

    close() {
      this.readyState = 3;
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
})();
