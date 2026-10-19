/**
 * RıdvanSes — Canlı Ses Yayını Eşzamanlı Dinleyici Kapasite & Gecikme Stres Testi
 * Yeni 4096-örnekli (85.33ms, 11.72 pkt/s) PCM16 sürekli radyo akışı testi.
 */
const { WebSocket } = require('ws');

const WS_URL = process.env.WS_URL || 'ws://localhost:3000/ws';
const FRAME_INTERVAL_MS = 85.33; // 4096 örnek @ 48kHz downsampled (16kHz)
const DURATION_SEC = 10; // Her aşama için test süresi (saniye)

// 1365 örnekli PCM16 simülasyon sesi (Base64)
function generateSamplePcm16Base64() {
  const numSamples = 1365;
  const buffer = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const val = Math.floor(Math.sin((i / numSamples) * 2 * Math.PI * 5) * 12000);
    buffer.writeInt16LE(val, i * 2);
  }
  return buffer.toString('base64');
}

const samplePcm16 = generateSamplePcm16Base64();

async function runCapacityStage(listenerCount) {
  console.log(`\n======================================================`);
  console.log(`🚀 TEST AŞAMASI: ${listenerCount} Eşzamanlı Hacı (Dinleyici)`);
  console.log(`======================================================`);

  const pilgrims = [];
  const clientStats = new Map(); // id -> { received: 0, latencies: [], gaps: [], lastRecvAt: 0, underruns: 0 }

  // 1. Dinleyici Hacı bağlantılarını aç
  const connectStart = Date.now();
  for (let i = 1; i <= listenerCount; i++) {
    const ws = new WebSocket(WS_URL);
    const pid = `pilgrim-${i}`;
    clientStats.set(pid, {
      received: 0,
      latencies: [],
      gaps: [],
      lastRecvAt: 0,
      underruns: 0,
      seqs: []
    });

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'join',
        tourCode: 'RY-KASIM',
        roomId: 'genel',
        role: 'pilgrim',
        name: `Hacı Test #${i}`
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio-chunk') {
          const now = Date.now();
          const st = clientStats.get(pid);
          if (!st) return;

          st.received++;
          if (msg.seq) st.seqs.push(msg.seq);

          if (msg.sentAt) {
            const lat = now - msg.sentAt;
            st.latencies.push(lat);
          }

          if (st.lastRecvAt > 0) {
            const gap = now - st.lastRecvAt;
            st.gaps.push(gap);
            // 85ms akış + 120ms mobil jitter buffer = 205ms üzeri boşluk takılma (underrun) riski
            if (gap > 200) {
              st.underruns++;
            }
          }
          st.lastRecvAt = now;
        }
      } catch (err) {}
    });

    pilgrims.push(ws);
  }

  // Tüm bağlantıların açılmasını bekle
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const openCount = pilgrims.filter((w) => w.readyState === WebSocket.OPEN).length;
  console.log(`✅ ${openCount}/${listenerCount} Hacı bağlandı (${Date.now() - connectStart}ms)`);

  // 2. Rehber (Hoca) Yayıncısını Bağla
  const guideWs = new WebSocket(WS_URL);
  await new Promise((resolve) => {
    guideWs.on('open', () => {
      guideWs.send(JSON.stringify({
        type: 'join',
        tourCode: 'RY-KASIM',
        roomId: 'genel',
        role: 'guide',
        name: 'Rehber Hoca (Test)'
      }));
      guideWs.send(JSON.stringify({
        type: 'guide-stream-state',
        isLive: true,
        broadcastMode: 'mic',
        topic: 'Canlı Kapasite Test Yayını'
      }));
      setTimeout(resolve, 500);
    });
  });

  console.log(`🎙️ Rehber yayına başladı, ses akışı gönderiliyor (${DURATION_SEC} saniye)...`);

  // 3. Gerçek Zamanlı Ses Akışını Gönder
  let sentPackets = 0;
  const streamStart = Date.now();
  const streamEnd = streamStart + DURATION_SEC * 1000;

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      if (Date.now() >= streamEnd) {
        clearInterval(timer);
        resolve();
        return;
      }

      sentPackets++;
      const payload = JSON.stringify({
        type: 'audio-chunk',
        seq: sentPackets,
        sentAt: Date.now(),
        sampleRate: 16000,
        pcm16: samplePcm16,
        level: 0.65
      });

      if (guideWs.readyState === WebSocket.OPEN) {
        guideWs.send(payload);
      }
    }, FRAME_INTERVAL_MS);
  });

  // Son paketlerin teslimatı için 800ms bekle
  await new Promise((resolve) => setTimeout(resolve, 800));

  // 4. Bağlantıları temizle
  guideWs.close();
  pilgrims.forEach((ws) => ws.close());

  // 5. İstatistikleri Hesapla
  let totalReceived = 0;
  let allLatencies = [];
  let allGaps = [];
  let totalUnderruns = 0;
  let clientsWithPacketLoss = 0;

  for (const [pid, st] of clientStats.entries()) {
    totalReceived += st.received;
    allLatencies = allLatencies.concat(st.latencies);
    allGaps = allGaps.concat(st.gaps);
    totalUnderruns += st.underruns;

    const loss = Math.max(0, sentPackets - st.received);
    if (loss > 0) clientsWithPacketLoss++;
  }

  allLatencies.sort((a, b) => a - b);
  allGaps.sort((a, b) => a - b);

  const expectedTotalPackets = sentPackets * listenerCount;
  const packetSuccessRate = (totalReceived / (expectedTotalPackets || 1)) * 100;
  const avgLatency = allLatencies.length
    ? (allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length).toFixed(1)
    : 0;
  const p50Latency = allLatencies.length ? allLatencies[Math.floor(allLatencies.length * 0.5)] : 0;
  const p95Latency = allLatencies.length ? allLatencies[Math.floor(allLatencies.length * 0.95)] : 0;
  const p99Latency = allLatencies.length ? allLatencies[Math.floor(allLatencies.length * 0.99)] : 0;
  const maxLatency = allLatencies.length ? allLatencies[allLatencies.length - 1] : 0;

  const avgGap = allGaps.length
    ? (allGaps.reduce((a, b) => a + b, 0) / allGaps.length).toFixed(1)
    : 0;
  const maxGap = allGaps.length ? allGaps[allGaps.length - 1] : 0;

  console.log(`\n📊 SONUÇLAR (${listenerCount} Eşzamanlı Dinleyici):`);
  console.log(`- Rehber Tarafından Gönderilen Paket : ${sentPackets} adet (~${(sentPackets / DURATION_SEC).toFixed(1)} pkt/s)`);
  console.log(`- Beklenen Toplam Paket             : ${expectedTotalPackets} adet`);
  console.log(`- Başarıyla Ulaşan Toplam Paket     : ${totalReceived} adet`);
  console.log(`- Paket Başarı / Teslimat Oranı     : %${packetSuccessRate.toFixed(2)} (${packetSuccessRate >= 99.5 ? '🏆 MÜKEMMEL' : '⚠️ KAYIP VAR'})`);
  console.log(`- Ortalama Gecikme (Transit Latency): ${avgLatency} ms`);
  console.log(`- Medyan (p50) Gecikme              : ${p50Latency} ms`);
  console.log(`- p95 Gecikme                       : ${p95Latency} ms`);
  console.log(`- p99 Gecikme                       : ${p99Latency} ms`);
  console.log(`- Maksimum Gecikme                  : ${maxLatency} ms`);
  console.log(`- Paketler Arası Ortalama Aralık    : ${avgGap} ms (İdeal: ~85 ms)`);
  console.log(`- Paketler Arası Maksimum Aralık    : ${maxGap} ms`);
  console.log(`- Takılma / Tampon Boşalma Olayı   : ${totalUnderruns} adet (${totalUnderruns === 0 ? '🟢 %0 KESİNTİSİZ AKICI SES' : '⚠️ KESİNTİ YAŞANDI'})`);

  const mem = process.memoryUsage();
  console.log(`- Test İstemci Bellek Tüketimi (RSS): ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);

  return {
    listenerCount,
    sentPackets,
    totalReceived,
    expectedTotalPackets,
    packetSuccessRate: Number(packetSuccessRate.toFixed(2)),
    avgLatency: Number(avgLatency),
    p50Latency,
    p95Latency,
    p99Latency,
    maxLatency,
    avgGap: Number(avgGap),
    maxGap,
    totalUnderruns,
    clientsWithPacketLoss
  };
}

async function runAllStages() {
  console.log(`======================================================================`);
  console.log(`🎧 RIDVANSES YENİ RADYO YAYINI DİNLEME KAPASİTE VE GECİKME TESTİ`);
  console.log(`   Hedef: ws://localhost:3000/ws`);
  console.log(`   Akış : 4096-örnek downsampled PCM16 (85.33ms / 11.72 pkt/s)`);
  console.log(`======================================================================`);

  const stages = [50, 150, 300, 500];
  const summary = [];

  for (const count of stages) {
    const res = await runCapacityStage(count);
    summary.push(res);
    // Aşamalar arasında sunucunun soketleri temizlemesi için 2 sn bekle
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\n======================================================================`);
  console.log(`🏁 GENEL KAPASİTE VE GECİKME ÖZET TABLOSU:`);
  console.log(`======================================================================`);
  console.table(summary.map((s) => ({
    'Hacı Sayısı': s.listenerCount,
    'Başarı Oranı': `%${s.packetSuccessRate}`,
    'Ortalama Gecikme': `${s.avgLatency} ms`,
    'p95 Gecikme': `${s.p95Latency} ms`,
    'Maksimum Gecikme': `${s.maxLatency} ms`,
    'Kesinti / Takılma': s.totalUnderruns === 0 ? '0 (Akıcı)' : `${s.totalUnderruns} kez`
  })));
}

runAllStages().catch(console.error);
