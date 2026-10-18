// RıdvanSes — Akıllı WebSocket & Vercel Serverless HTTP Relay Adaptörü
// Normal sunucularda (Render, Railway, VPS, Localhost) doğrudan gerçek WebSocket (/ws) kullanır.
// Vercel gibi Serverless ortamlarda WebSocket el sıkışması reddedilirse otomatik olarak
// /api/ws-relay üzerinden kesintisiz gerçek zamanlı HTTP senkronizasyonuna geçer.
(function () {
  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;

  class SmartWebSocket {
    constructor(url, protocols) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this._isRelay = false;
      this._clientId =
        sessionStorage.getItem('ry_relay_cid') ||
        'relay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('ry_relay_cid', this._clientId);
      this._pollTimer = null;
      this._sendQueue = [];
      this._opened = false;

      try {
        this._native = protocols ? new NativeWebSocket(url, protocols) : new NativeWebSocket(url);
      } catch (e) {
        this._activateHttpRelay();
        return;
      }

      const fallbackTimeout = setTimeout(() => {
        if (!this._opened && !this._isRelay) {
          this._activateHttpRelay();
        }
      }, 1800);

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
          this._activateHttpRelay();
        }
      };

      this._native.onclose = (ev) => {
        clearTimeout(fallbackTimeout);
        if (!this._opened && !this._isRelay) {
          this._activateHttpRelay();
          return;
        }
        if (!this._isRelay) {
          this.readyState = 3; // CLOSED
          if (typeof this.onclose === 'function') this.onclose(ev);
        }
      };
    }

    _activateHttpRelay() {
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

      this._pollTimer = setInterval(() => this._flushAndPoll(), 550);
    }

    send(data) {
      if (!this._isRelay) {
        if (this._native && this._native.readyState === 1) {
          this._native.send(data);
        }
        return;
      }
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (this._sendQueue.length >= 25) this._sendQueue.shift();
        this._sendQueue.push(parsed);
        this._flushAndPoll();
      } catch {}
    }

    async _flushAndPoll() {
      if (this.readyState !== 1) return;
      const batch = this._sendQueue.splice(0, this._sendQueue.length);
      try {
        let res;
        if (batch.length > 0) {
          res = await fetch('/api/ws-relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: this._clientId, messages: batch })
          });
        } else {
          res = await fetch('/api/ws-relay?clientId=' + encodeURIComponent(this._clientId));
        }
        if (!res.ok) return;
        const payload = await res.json();
        if (Array.isArray(payload.messages) && typeof this.onmessage === 'function') {
          for (const msg of payload.messages) {
            this.onmessage({ data: JSON.stringify(msg) });
          }
        }
      } catch {}
    }

    close() {
      this.readyState = 3;
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
      if (this._native) {
        try {
          this._native.close();
        } catch {}
      }
    }
  }

  SmartWebSocket.CONNECTING = 0;
  SmartWebSocket.OPEN = 1;
  SmartWebSocket.CLOSING = 2;
  SmartWebSocket.CLOSED = 3;

  window.WebSocket = SmartWebSocket;
})();
