/**
 * RıdvanSes — Polarsteps-Inspired Spiritual Journey & Live Route Map Engine
 * Powered by Leaflet 1.9.4 + CartoDB Voyager Retina Tiles (Zero API Key Required)
 */
(function (global) {
  'use strict';

  const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const VOYAGER_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  let leafletPromise = null;

  function ensureLeafletLoaded() {
    if (global.L && typeof global.L.map === 'function') {
      return Promise.resolve(global.L);
    }
    if (leafletPromise) return leafletPromise;

    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = LEAFLET_CSS_URL;
        document.head.appendChild(link);
      }
      const existingScript = document.querySelector('script[src*="leaflet.js"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(global.L));
        existingScript.addEventListener('error', reject);
        return;
      }
      const script = document.createElement('script');
      script.src = LEAFLET_JS_URL;
      script.async = true;
      script.onload = () => resolve(global.L);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
    return leafletPromise;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Generates a subtle Polarsteps-like curved flight arc for long-distance legs (>250 km)
  function buildSegmentCoords(p1, p2) {
    const lat1 = Number(p1[0]);
    const lng1 = Number(p1[1]);
    const lat2 = Number(p2[0]);
    const lng2 = Number(p2[1]);
    const distDeg = Math.hypot(lat2 - lat1, lng2 - lng1);
    if (distDeg < 2.2) {
      return [[lat1, lng1], [lat2, lng2]];
    }
    const pts = [];
    const segments = 24;
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    // Perpendicular offset for smooth visual flight curve
    const dx = lng2 - lng1;
    const dy = lat2 - lat1;
    const curveFactor = 0.14;
    const ctrlLat = midLat + dx * curveFactor;
    const ctrlLng = midLng - dy * curveFactor;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const inv = 1 - t;
      const lat = inv * inv * lat1 + 2 * inv * t * ctrlLat + t * t * lat2;
      const lng = inv * inv * lng1 + 2 * inv * t * ctrlLng + t * t * lng2;
      pts.push([lat, lng]);
    }
    return pts;
  }

  class UmrahStepsMap {
    constructor(containerId, options = {}) {
      this.containerId = containerId;
      this.options = Object.assign(
        {
          initialCenter: [21.4225, 39.8262],
          initialZoom: 11,
          defaultView: 'holy-lands', // 'holy-lands' | 'full' | 'active'
          onStepSelect: null,
          scrollWheelZoom: false
        },
        options
      );
      this.map = null;
      this.routeLayerGroup = null;
      this.markersLayerGroup = null;
      this.guideMarker = null;
      this.markerById = new Map();
      this.steps = [];
      this.guideLocation = null;
      this._readyPromise = this._init();
    }

    async _init() {
      const el = document.getElementById(this.containerId);
      if (!el) return null;
      const L = await ensureLeafletLoaded();
      if (!L) return null;

      this.map = L.map(el, {
        center: this.options.initialCenter,
        zoom: this.options.initialZoom,
        scrollWheelZoom: Boolean(this.options.scrollWheelZoom),
        zoomControl: true
      });

      L.tileLayer(VOYAGER_TILES, {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap &copy; CARTO | RıdvanSes Manevi Rota'
      }).addTo(this.map);

      this.routeLayerGroup = L.layerGroup().addTo(this.map);
      this.markersLayerGroup = L.layerGroup().addTo(this.map);

      if (this.steps.length > 0) {
        this._drawSteps(true);
      }
      if (this.guideLocation) {
        this._drawGuidePin();
      }
      return this.map;
    }

    async setSteps(steps, opts = {}) {
      this.steps = Array.isArray(steps) ? steps.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
      await this._readyPromise;
      if (!this.map) return;
      this._drawSteps(Boolean(opts.autoFit));
    }

    _drawSteps(autoFit = false) {
      const L = global.L;
      if (!this.map || !L) return;

      this.routeLayerGroup.clearLayers();
      this.markersLayerGroup.clearLayers();
      this.markerById.clear();

      if (!this.steps.length) return;

      // Determine split point between visited (completed + active) and planned
      let lastVisitedIdx = -1;
      this.steps.forEach((s, idx) => {
        if (s.status === 'completed' || s.status === 'active') {
          lastVisitedIdx = idx;
        }
      });

      const completedCoords = [];
      for (let i = 0; i < lastVisitedIdx; i++) {
        const a = [Number(this.steps[i].lat), Number(this.steps[i].lng)];
        const b = [Number(this.steps[i + 1].lat), Number(this.steps[i + 1].lng)];
        const seg = buildSegmentCoords(a, b);
        if (completedCoords.length) seg.shift();
        completedCoords.push(...seg);
      }

      if (completedCoords.length >= 2) {
        // Subtle emerald halo underneath
        L.polyline(completedCoords, {
          color: '#0b4636',
          weight: 8,
          opacity: 0.24,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(this.routeLayerGroup);

        // Kaaba Gold solid Polarsteps route line
        L.polyline(completedCoords, {
          color: '#c5a059',
          weight: 4.5,
          opacity: 0.96,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(this.routeLayerGroup);
      }

      // Planned segments
      const plannedStartIdx = Math.max(0, lastVisitedIdx);
      const plannedCoords = [];
      for (let i = plannedStartIdx; i < this.steps.length - 1; i++) {
        const a = [Number(this.steps[i].lat), Number(this.steps[i].lng)];
        const b = [Number(this.steps[i + 1].lat), Number(this.steps[i + 1].lng)];
        const seg = buildSegmentCoords(a, b);
        if (plannedCoords.length) seg.shift();
        plannedCoords.push(...seg);
      }

      if (plannedCoords.length >= 2) {
        L.polyline(plannedCoords, {
          color: '#0b4636',
          weight: 3.2,
          opacity: 0.72,
          dashArray: '8, 8',
          lineCap: 'round'
        }).addTo(this.routeLayerGroup);
      }

      // Step Markers
      this.steps.forEach((step, idx) => {
        const lat = Number(step.lat) || 21.4225;
        const lng = Number(step.lng) || 39.8262;
        const status = ['completed', 'active', 'planned'].includes(step.status) ? step.status : 'planned';
        const num = step.order || idx + 1;
        const size = status === 'active' ? 40 : 34;

        const iconHtml = `<div class="ps-pin ${status}" title="${escapeHtml(step.title)}">${num}</div>`;
        const icon = L.divIcon({
          className: 'ps-pin-wrapper',
          html: iconHtml,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          popupAnchor: [0, -size / 2]
        });

        const statusBadge =
          status === 'active'
            ? '<span style="background:#0b4636;color:#e0be77;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;">● ŞU AN BURADAYIZ</span>'
            : status === 'completed'
            ? '<span style="background:#e6f2ee;color:#0b4636;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;">✓ Ziyaret Edildi</span>'
            : '<span style="background:#f1eae0;color:#53635c;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;">Planlanan Durak</span>';

        const popupHtml = `
          <div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:210px;max-width:265px;padding:2px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="font-size:11px;font-weight:800;color:#0b4636;text-transform:uppercase;">${escapeHtml(step.dayLabel || '')}</span>
              ${statusBadge}
            </div>
            <div style="font-size:14px;font-weight:800;color:#06231b;line-height:1.3;margin-bottom:4px;">${num}. ${escapeHtml(step.title)}</div>
            <div style="font-size:11.5px;color:#53635c;font-weight:600;margin-bottom:6px;">📍 ${escapeHtml(step.locationLabel || '')} • ${Number(step.distanceKm) || 0} km</div>
            ${step.guideNote ? `<div style="font-size:12px;color:#0f1d18;line-height:1.45;background:#faf7f2;padding:7px 9px;border-radius:8px;border-left:3px solid #c5a059;">${escapeHtml(step.guideNote)}</div>` : ''}
          </div>
        `;

        const marker = L.marker([lat, lng], {
          icon,
          zIndexOffset: status === 'active' ? 900 : status === 'completed' ? 400 : 100
        }).bindPopup(popupHtml);

        marker.on('click', () => {
          if (typeof this.options.onStepSelect === 'function') {
            this.options.onStepSelect(step);
          }
        });

        marker.addTo(this.markersLayerGroup);
        this.markerById.set(step.id, marker);
      });

      if (autoFit) {
        if (this.options.defaultView === 'full') {
          this.fitFullJourney();
        } else if (this.options.defaultView === 'active') {
          const active = this.steps.find((s) => s.status === 'active') || this.steps[0];
          if (active) this.focusStep(active.id, 13, false);
        } else {
          this.fitHolyLands();
        }
      }
    }

    async updateGuideLocation(loc) {
      this.guideLocation = loc && loc.lat && loc.lng ? loc : null;
      await this._readyPromise;
      this._drawGuidePin();
    }

    _drawGuidePin() {
      const L = global.L;
      if (!this.map || !L) return;

      if (this.guideMarker) {
        this.map.removeLayer(this.guideMarker);
        this.guideMarker = null;
      }
      if (!this.guideLocation) return;

      const lat = Number(this.guideLocation.lat);
      const lng = Number(this.guideLocation.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const guideName = this.guideLocation.guideName || 'Rehber Hoca';
      const icon = L.divIcon({
        className: 'ps-pin-wrapper',
        html: `<div class="ps-guide-live-pin">🎙️ Canlı GPS</div>`,
        iconSize: [108, 28],
        iconAnchor: [54, 34],
        popupAnchor: [0, -30]
      });

      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      this.guideMarker = L.marker([lat, lng], { icon, zIndexOffset: 1500 })
        .bindPopup(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif;min-width:195px;">
            <div style="font-size:11px;font-weight:800;color:#dc2626;text-transform:uppercase;">● CANLI REHBER KONUMU</div>
            <div style="font-size:14px;font-weight:800;color:#06231b;margin:3px 0;">${escapeHtml(guideName)}</div>
            <div style="font-size:11.5px;color:#53635c;margin-bottom:8px;">Son güncelleme: ${escapeHtml(this.guideLocation.updatedAt || 'Şimdi')}</div>
            <a href="${mapsUrl}" target="_blank" rel="noopener" style="display:inline-block;background:#0b4636;color:#fff;font-size:11.5px;font-weight:700;padding:6px 10px;border-radius:8px;text-decoration:none;">Google Haritalar Yol Tarifi →</a>
          </div>`
        )
        .addTo(this.map);
    }

    async focusStep(stepOrId, zoom = 14, openPopup = true) {
      await this._readyPromise;
      if (!this.map) return;
      const id = typeof stepOrId === 'object' && stepOrId ? stepOrId.id : stepOrId;
      const step = this.steps.find((s) => s.id === id);
      if (!step) return;
      this.map.flyTo([Number(step.lat), Number(step.lng)], zoom, { duration: 1.15 });
      const marker = this.markerById.get(step.id);
      if (marker && openPopup) {
        setTimeout(() => marker.openPopup(), 450);
      }
    }

    async fitHolyLands() {
      await this._readyPromise;
      const L = global.L;
      if (!this.map || !L) return;
      // Filter steps in Hijaz region (lat < 30) so map shows Jeddah-Makkah-Madinah clearly
      const hijaz = this.steps.filter((s) => Number(s.lat) < 30);
      const list = hijaz.length >= 2 ? hijaz : this.steps;
      if (!list.length) return;
      const bounds = L.latLngBounds(list.map((s) => [Number(s.lat), Number(s.lng)]));
      this.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 13 });
    }

    async fitFullJourney() {
      await this._readyPromise;
      const L = global.L;
      if (!this.map || !L || !this.steps.length) return;
      const bounds = L.latLngBounds(this.steps.map((s) => [Number(s.lat), Number(s.lng)]));
      this.map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
    }

    async focusMakkah() {
      await this._readyPromise;
      if (this.map) this.map.flyTo([21.4225, 39.8262], 13, { duration: 1.1 });
    }

    async focusMadinah() {
      await this._readyPromise;
      if (this.map) this.map.flyTo([24.4672, 39.6111], 13, { duration: 1.1 });
    }

    async invalidateSize() {
      await this._readyPromise;
      if (!this.map) return;
      setTimeout(() => {
        if (this.map) this.map.invalidateSize();
      }, 90);
    }

    static renderTimeline(container, steps, options = {}) {
      const el = typeof container === 'string' ? document.getElementById(container) : container;
      if (!el) return;
      const list = Array.isArray(steps) ? steps.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
      if (!list.length) {
        el.innerHTML = '<div style="padding:18px;text-align:center;color:var(--color-muted);font-size:0.88rem;">Henüz tanımlanmış manevi yolculuk durağı bulunmuyor.</div>';
        return;
      }

      el.innerHTML = list
        .map((step, idx) => {
          const status = ['completed', 'active', 'planned'].includes(step.status) ? step.status : 'planned';
          const statusText =
            status === 'active'
              ? '● Şu An Buradayız'
              : status === 'completed'
              ? '✓ Ziyaret Edildi'
              : 'Planlanan Durak';
          const num = step.order || idx + 1;
          const adminActions = options.editable
            ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--color-hairline);" onclick="event.stopPropagation();">
                ${
                  status !== 'active'
                    ? `<button type="button" class="btn btn-primary btn-sm" data-step-action="activate" data-step-id="${escapeHtml(step.id)}">📍 Şu An Buradayız Yap</button>`
                    : `<span class="badge badge-gold">Aktif Canlı Durak</span>`
                }
                ${
                  status !== 'completed'
                    ? `<button type="button" class="btn btn-secondary btn-sm" data-step-action="complete" data-step-id="${escapeHtml(step.id)}">✓ Tamamlandı</button>`
                    : ''
                }
                ${
                  options.allowDelete
                    ? `<button type="button" class="btn btn-outline btn-sm" style="color:#dc2626;border-color:rgba(220,38,38,0.28);" data-step-action="delete" data-step-id="${escapeHtml(step.id)}">Sil</button>`
                    : ''
                }
              </div>`
            : '';

          return `
            <div class="ps-step-card is-${status}" data-step-id="${escapeHtml(step.id)}">
              <span class="ps-step-dot"></span>
              <div class="ps-step-head">
                <span class="ps-step-day">${num}. Durak • ${escapeHtml(step.dayLabel || '')}</span>
                <span class="ps-step-status ${status}">${statusText}</span>
              </div>
              <div class="ps-step-title">${escapeHtml(step.title)}</div>
              <div class="ps-step-loc">📍 ${escapeHtml(step.locationLabel || '')} • <strong>${Number(step.distanceKm) || 0} km</strong> ${step.timestamp ? `• ${escapeHtml(step.timestamp)}` : ''}</div>
              ${step.guideNote ? `<div class="ps-step-note">${escapeHtml(step.guideNote)}</div>` : ''}
              ${step.prayerSummary && options.showPrayers !== false ? `<div class="ps-step-prayer">🤲 “${escapeHtml(step.prayerSummary)}”</div>` : ''}
              ${adminActions}
            </div>
          `;
        })
        .join('');

      el.querySelectorAll('.ps-step-card').forEach((card) => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-step-id');
          const step = list.find((s) => s.id === id);
          if (step && typeof options.onSelect === 'function') {
            options.onSelect(step);
          }
        });
      });

      if (options.editable && typeof options.onAction === 'function') {
        el.querySelectorAll('[data-step-action]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.getAttribute('data-step-action');
            const id = btn.getAttribute('data-step-id');
            const step = list.find((s) => s.id === id);
            if (step) options.onAction(action, step, btn);
          });
        });
      }
    }
  }

  global.UmrahStepsMap = UmrahStepsMap;
})(window);
