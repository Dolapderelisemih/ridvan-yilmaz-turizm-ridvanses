/**
 * RıdvanSes — 500 Kişilik Bursa Konumu Canlı Ses & Yük Stres Testi
 * Simülasyon:
 * - 500 Eşzamanlı Hacı (Bursa Osmangazi / Ulu Cami GPS koordinatları)
 * - 1 Canlı Rehber Hoca (Kesintisiz PCM16 Ses Akışı: 85.33ms dilimler)
 * - Canlı Telemetri: Gecikme (Latency), Paket Kaybı, Tampon Boşalma (Underrun)
 * - data/stress-test-live.json & data/stress-test-report.json
 */

const { WebSocket } = require('ws');
const fs = require('fs');
const path = require('path');

const WS_URL = process.env.WS_URL || 'wss://ses.ridvanyilmazturizm.com/ws';
const TOTAL_PILGRIMS = parseInt(process.env.PILGRIMS || '500', 10);
const DURATION_SEC = parseInt(process.env.DURATION || '3600', 10); // 1 Saat (3600 sn)
const FRAME_INTERVAL_MS = 85.33; // ~11.72 pkt/s (standart 4096-örnek çerçeve)
const TOUR_CODE = 'RY-2026';

// Bursa Osmangazi / Ulu Cami merkez koordinatları
const BURSA_BASE_LAT = 40.1828;
const BURSA_BASE_LNG = 29.0612;

function getRandomBursaCoords() {
  // ~500 metre yarıçapında rastgele dağılım
  const latOffset = (Math.random() - 0.5) * 0.009;
  const lngOffset = (Math.random() - 0.5) * 0.009;
  return {
    lat: Number((BURSA_BASE_LAT + latOffset).toFixed(6)),
    lng: Number((BURSA_BASE_LNG + lngOffset).toFixed(6))
  };
}

// 1365 örnekli PCM16 simülasyon ses verisi
function generateSamplePcm16Base64() {
  const numSamples = 1365;
  const buffer = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const val = Math.floor(Math.sin((i / numSamples) * 2 * Math.PI * 4) * 11000);
    buffer.writeInt16LE(val, i * 2);
  }
  return buffer.toString('base64');
}

const samplePcm16 = generateSamplePcm16Base64();

async function main() {
  console.log('================================================================');
  console.log('  🕋 RIDVANSES 500 KİŞİLİK CANLI SES STRES TESTİ');
  console.log(`  Hedef Sunucu  : ${WS_URL}`);
  console.log(`  Kafile Kodu   : ${TOUR_CODE}`);
  console.log(`  Dinleyici     : ${TOTAL_PILGRIMS} Hacı (Bursa Konumu)`);
  console.log(`  Test Süresi   : ${DURATION_SEC} saniye (~${(DURATION_SEC / 60).toFixed(0)} dakika)`);
  console.log('================================================================\n');

  const pilgrims = [];
  const clientStats = new Map();
  let connectedCount = 0;
  let guideWs = null;
  let isRunning = true;
  let sentChunks = 0;
  let streamStart = 0;

  // 1. Dinleyicileri Kademeli Olarak Bağla (Ramp-up: 10 hacı / 50ms)
  console.log(`[AŞAMA 1] ${TOTAL_PILGRIMS} Hacı Bursa'dan bağlanıyor...`);
  const rampStart = Date.now();

  for (let i = 1; i <= TOTAL_PILGRIMS; i++) {
    const pid = `pilgrim-bursa-${i}`;
    const coords = getRandomBursaCoords();

    clientStats.set(pid, {
      id: pid,
      name: `Bursa Hacısı #${i}`,
      coords,
      receivedChunks: 0,
      totalBytes: 0,
      latencies: [],
      lastRecvAt: 0,
      underruns: 0
    });

    const ws = new WebSocket(WS_URL, { perMessageDeflate: false });

    ws.on('open', () => {
      connectedCount++;
      // Odaya katıl
      ws.send(JSON.stringify({
        type: 'join',
        tourCode: TOUR_CODE,
        roomId: 'genel',
        role: 'pilgrim',
        name: `Bursa Hacısı #${i}`,
        phone: `0545${String(1000000 + i).slice(1)}`,
        lang: 'tr',
        location: coords
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio-chunk') {
          const now = Date.now();
          const st = clientStats.get(pid);
          if (!st) return;

          st.receivedChunks++;
          st.totalBytes += data.length;

          if (msg.sentAt) {
            const lat = now - msg.sentAt;
            st.latencies.push(lat);
            if (st.latencies.length > 200) st.latencies.shift(); // Bellek tasarrufu için son 200'ü tut
          }

          if (st.lastRecvAt > 0) {
            const gap = now - st.lastRecvAt;
            if (gap > 220) {
              st.underruns++;
            }
          }
          st.lastRecvAt = now;
        }
      } catch (e) {}
    });

    ws.on('error', () => {});
    ws.on('close', () => {
      connectedCount = Math.max(0, connectedCount - 1);
    });

    pilgrims.push(ws);

    if (i % 10 === 0) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  // Bağlantıların tamamlanmasını bekle (en fazla 15 sn)
  const waitMax = Date.now() + 15000;
  while (connectedCount < TOTAL_PILGRIMS * 0.98 && Date.now() < waitMax) {
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ ${connectedCount} / ${TOTAL_PILGRIMS} Hacı başarıyla bağlandı ve canlı odaya girdi! (${((Date.now() - rampStart) / 1000).toFixed(1)} sn)\n`);

  // 2. Rehber Hoca Bağlantısını Aç ve Yayını Başlat
  console.log('[AŞAMA 2] Rehber Hoca mikrofonu açıyor ve canlı yayın başlıyor...');
  guideWs = new WebSocket(WS_URL, { perMessageDeflate: false });

  await new Promise((resolve) => {
    guideWs.on('open', () => {
      guideWs.send(JSON.stringify({
        type: 'join',
        tourCode: TOUR_CODE,
        roomId: 'genel',
        role: 'guide',
        name: 'Rıdvan Yılmaz Hoca (Canlı Rehber)'
      }));

      guideWs.send(JSON.stringify({
        type: 'guide-stream-state',
        isLive: true,
        broadcastMode: 'mic',
        topic: 'Bursa Kafile Stres Testi — Kâbe Tavaf ve Siyer Canlı Yayını'
      }));

      guideWs.send(JSON.stringify({
        type: 'guide-location-update',
        active: true,
        lat: BURSA_BASE_LAT,
        lng: BURSA_BASE_LNG,
        locationNote: 'Bursa Ulu Cami ve Tarihi Çarşı (Rehber Konumu)'
      }));

      setTimeout(resolve, 1000);
    });
  });

  console.log('🎙️ Hoca canlı yayında! 500 hacıya kesintisiz ses aktarımı başladı.\n');

  // 3. Canlı Ses Akışı Döngüsü (85ms aralıklarla PCM paketleri)
  streamStart = Date.now();
  const streamEnd = streamStart + (DURATION_SEC * 1000);

  const audioTimer = setInterval(() => {
    if (!isRunning || Date.now() >= streamEnd) {
      clearInterval(audioTimer);
      return;
    }

    sentChunks++;
    const packet = JSON.stringify({
      type: 'audio-chunk',
      seq: sentChunks,
      sentAt: Date.now(),
      sampleRate: 16000,
      pcm16: samplePcm16,
      level: 0.72
    });

    if (guideWs.readyState === WebSocket.OPEN) {
      guideWs.send(packet);
    }
  }, FRAME_INTERVAL_MS);

  // 4. Periyodik Telemetri Raporlama (Her 15 saniyede bir konsola ve JSON dosyasına yansıt)
  const reportInterval = setInterval(() => {
    if (!isRunning || Date.now() >= streamEnd) {
      clearInterval(reportInterval);
      return;
    }

    const elapsedSec = Math.floor((Date.now() - streamStart) / 1000);
    const remainingSec = Math.max(0, DURATION_SEC - elapsedSec);

    let totalRecv = 0;
    let totalBytes = 0;
    let recentLatencies = [];
    let underrunCount = 0;

    for (const st of clientStats.values()) {
      totalRecv += st.receivedChunks;
      totalBytes += st.totalBytes;
      underrunCount += st.underruns;
      if (st.latencies.length) {
        recentLatencies.push(st.latencies[st.latencies.length - 1]);
      }
    }

    const expectedRecv = sentChunks * connectedCount;
    const packetLossPct = expectedRecv > 0
      ? Math.max(0, ((expectedRecv - totalRecv) / expectedRecv) * 100).toFixed(2)
      : '0.00';

    recentLatencies.sort((a, b) => a - b);
    const avgLat = recentLatencies.length
      ? (recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length).toFixed(0)
      : 0;
    const p95Lat = recentLatencies.length ? recentLatencies[Math.floor(recentLatencies.length * 0.95)] : 0;
    const throughputMB = (totalBytes / (1024 * 1024)).toFixed(1);

    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    const timeStr = `${m}d ${s < 10 ? '0' : ''}${s}s`;

    console.log(`⏱️ [${timeStr} / ${(DURATION_SEC / 60).toFixed(0)}d] | Dinleyici: ${connectedCount} Hacı | Hoca Paket: ${sentChunks} | Gecikme: ~${avgLat}ms (p95: ${p95Lat}ms) | Kayıp: %${packetLossPct} | Trafik: ${throughputMB} MB | Takılma: ${underrunCount}`);

    // Canlı durum dosyasını yaz
    try {
      const liveStatus = {
        updatedAt: new Date().toISOString(),
        elapsedSec,
        durationSec: DURATION_SEC,
        progressPct: ((elapsedSec / DURATION_SEC) * 100).toFixed(1),
        connectedPilgrims: connectedCount,
        sentChunks,
        totalRecvChunks: totalRecv,
        packetLossPct: Number(packetLossPct),
        avgLatencyMs: Number(avgLat),
        p95LatencyMs: Number(p95Lat),
        totalTrafficMB: Number(throughputMB),
        underrunCount
      };
      fs.writeFileSync(
        path.join(__dirname, '..', 'data', 'stress-test-live.json'),
        JSON.stringify(liveStatus, null, 2),
        'utf8'
      );
    } catch (e) {}
  }, 15000);

  // 1 saat sonunda testi tamamla
  await new Promise(resolve => {
    const checkTimer = setInterval(() => {
      if (Date.now() >= streamEnd || !isRunning) {
        clearInterval(checkTimer);
        resolve();
      }
    }, 2000);
  });

  finalizeTest();

  function finalizeTest() {
    isRunning = false;
    clearInterval(audioTimer);
    clearInterval(reportInterval);

    console.log('\n================================================================');
    console.log('  🏁 STRES TESTİ TAMAMLANDI — GENEL DEĞERLENDİRME RAPORU');
    console.log('================================================================');

    let grandTotalRecv = 0;
    let grandTotalBytes = 0;
    let grandUnderruns = 0;
    let allLats = [];

    for (const st of clientStats.values()) {
      grandTotalRecv += st.receivedChunks;
      grandTotalBytes += st.totalBytes;
      grandUnderruns += st.underruns;
      allLats = allLats.concat(st.latencies);
    }

    const expectedTotal = sentChunks * connectedCount;
    const successRate = expectedTotal > 0 ? ((grandTotalRecv / expectedTotal) * 100).toFixed(2) : '100.00';
    allLats.sort((a, b) => a - b);
    const finalAvgLat = allLats.length ? (allLats.reduce((a, b) => a + b, 0) / allLats.length).toFixed(1) : 0;
    const finalP95 = allLats.length ? allLats[Math.floor(allLats.length * 0.95)] : 0;

    console.log(`- Toplam Dinleyici Hacı Sayısı       : ${connectedCount}`);
    console.log(`- Rehber Hoca Tarafından Atılan Paket: ${sentChunks} adet`);
    console.log(`- Dinleyicilere Ulaşan Toplam Paket  : ${grandTotalRecv} adet`);
    console.log(`- Başarı / Teslimat Oranı            : %${successRate} (${Number(successRate) >= 98 ? '🏆 MÜKEMMEL' : '⚠️ İNCELENMELİ'})`);
    console.log(`- Ortalama Gecikme (Latency)         : ${finalAvgLat} ms`);
    console.log(`- 95. Yüzdelik Gecikme (p95)         : ${finalP95} ms`);
    console.log(`- Toplam İletilen Ses Verisi         : ${(grandTotalBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`- Tampon Boşalma / Ses Kesintisi     : ${grandUnderruns} adet`);

    // Kapat
    try { guideWs.close(); } catch(e){}
    pilgrims.forEach(w => { try { w.close(); } catch(e){} });

    // Sonuç dosyasını kaydet
    const report = {
      testDate: new Date().toISOString(),
      totalPilgrims: connectedCount,
      durationSec: DURATION_SEC,
      actualElapsedSec: Math.floor((Date.now() - streamStart) / 1000),
      sentChunks,
      receivedChunks: grandTotalRecv,
      successRate: `${successRate}%`,
      avgLatencyMs: Number(finalAvgLat),
      p95LatencyMs: Number(finalP95),
      totalTrafficMB: Number((grandTotalBytes / (1024 * 1024)).toFixed(2)),
      underrunCount: grandUnderruns,
      location: 'Bursa / Osmangazi (Ulu Cami Çevresi)'
    };

    fs.writeFileSync(
      path.join(__dirname, '..', 'data', 'stress-test-report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );
    console.log('✅ Rapor data/stress-test-report.json dosyasına kaydedildi.');
  }

  process.on('SIGINT', () => {
    console.log('\nStres testi kullanıcı tarafından durduruldu. Sonuçlar derleniyor...');
    finalizeTest();
    process.exit(0);
  });
}

main().catch(console.error);
