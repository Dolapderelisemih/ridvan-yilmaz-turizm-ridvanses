# RıdvanSes v71 — Uygulama Eşliği ve Doğrudan CLI Doğrulama Raporu

Tarih: 2026-11-10  
Çalışma alanı: D:/umresesliyazılım  
Denetlenen HEAD: 0673384271e594d88c2cf117077f93c7f1d5b540  
Yama tabanı: 73740b2863427fe9a39e74f909dcdebcd08c359c (v70)

## 1. Sonuç ve güncel uygulama durumu

**v71 kaynaklara eksiksiz uygulanmış ve preload olmadan doğrulanmıştır: 60 / 60 [BAŞARILI / PASS], exit 0.** AUD-70R-01…AUD-70R-06 kapsamındaki altı bulgunun kapanışı kaynak incelemesi, gerçek HTTP/WebSocket E2E testleri ve üretim fonksiyonlarını çalıştıran deterministik Unit testleriyle teyit edildi.

Rapordaki diff üzerinde çalışma ağacına karşı `git apply --reverse --check --ignore-space-change -` **exit 0** verdi. Ayrıca v70 tabanındaki her hedef kaynak bellekte aynı diff ile yeniden oluşturuldu; mevcut v71 dosyalarının LF-normalize içerikleri **12/12 birebir eşleşti**. Ters kontrolün yanında bu karşılaştırma, patch dışındaki olası hedef dosya değişikliklerini de kontrol eder. CRLF→LF dışında normalizasyon uygulanmadı; UTF-8 BOM korundu.

Bu rapor önceki “aday / henüz uygulanmadı” durumunu günceller. Aşağıdaki tek diff artık uygulanmış v71 paketinin tarihsel ve doğrulanabilir kaydıdır; bu denetimde kaynaklara yeniden uygulanmadı.

**İncelenen kapsamda yeni ve kanıtlanabilir bir P0/P1/P2/P3 kod bulgusu doğrulanmadı; bu tur yeni yama önerilmedi.** Bu sonuç test edilen durumlarla sınırlıdır; tüm olası cihaz/ağ koşullarında sıfır hata garantisi değildir.

## 2. Diff kimliği ve kaynak bütünlüğü

| Kontrol | Sonuç |
|---|---|
| Tek unified diff | 1 blok, 12 hedef |
| UTF-8 / LF diff boyutu | 77.727 bayt |
| SHA-256 | 68b22040c9fbbdb94f35e165681660a55a2ab41f18422c2c589e6d674f2fc40f |
| Çalışma ağacında reverse check | exit 0; stderr boş |
| v70 + rapor diff’i → mevcut v71 hedefleri | 12/12 içerik eşliği |
| Başlangıç ve son mevcut takipli dosyalar | Rapor hariç 61/61 raw SHA-256 eşliği |
| data/runtime.json | Başlangıç raw Buffer’ı ile birebir eşlik |
| Stage / commit / push / deploy | Yapılmadı |

Diff hash’i yalnız fence içindeki LF metni kapsar; son LF dahildir. Rapor açıklamaları ve fence işaretleri hash’e dahil değildir.

### 2.1 Altı bulgu için kaynak ve test karşılığı

Satırlar mevcut HEAD içindir.

| Bulgu | Kaynak kanıtı | Çalıştırılan doğrulama |
|---|---|---|
| AUD-70R-01 — P1 | server.js:317 rysRoomKey JSON tuple; :352 getOrCreateRoom ortak anahtar; :1115 family actual-target kontrolü; :1140–1160 kayıtlı tur/PIN/actual-target/principal doğrulaması | ':' çarpışma çiftleri ayrı nesne; native ve HTTP özel veri sızıntısı 0; yanlış nesne döndürülen target reddedildi; başka tur PIN’i kapsam dışı token ile aşılamadı |
| AUD-70R-02 — P1 | server.js:320 findRysTour; :328 dropRysRoom timer cleanup; :334 pruneRysRooms; :352–381 tahsis sınırları; :1590 heartbeat sweep | 1000 native + 1 HTTP unknown family → 0 tahsis; Unit 1200 unknown → 0; 64/tur ve 2048/global sınır; 60 s TTL; grace ve 300 sessiz aktif dinleyici korunumu |
| AUD-70R-03 — P2 | server.js:343 commitRysSubscription; :1100 admin; :1118 family; :1160 join; ortak native/HTTP handler | Guide→family/admin eski üyeliği bırakır; admin→pilgrim özel delta 0; family→join eski delta 0; eski PCM ve guide 0; başarısız elevation sağlıklı family aboneliğini korur; HTTP parity |
| AUD-70R-04 — P2 | public/dinle.html:1674 initRxPlayerWorklet; :1697 generation ownership; :1704 failed/backoff; :1728 3000 ms timer; :1764 rebuild; leave/rebuild cancel | Pending load timeout; geç resolve 0 node; 1500 ms sonra fresh context; eski context kapalı; taze seq=801 PCM örnek eşliği; cached failure, 60 s bounded retry, pause/resume ve cancel |
| AUD-70R-05 — P3 | public/vercel-ws-shim.js:318 _handleNativeMessage; :328 _handleNativeClose; :237 ilk native message; :389–392 promoted message/close/ACK; :419 observer; :438 fence | Gerçek prepare/commit ve promoted trusted snapshot; auth-error metadata temizliği; session replacement/4009 terminal fence; cache 0; orijinal ArrayBuffer referansı ve geç callback reddi |
| AUD-70R-06 — P3 | server.js:698 rysMintMqtt; :710 tek const issuedAt=Date.now(); :712 expiresAt=issuedAt+400 | 1 ms ilerleyen saat altında mint saat okuması 1; TTL tam 400 ms; gerçek şifreli proof doğrulaması ve seq=707 PCM byte eşliği |

getOrCreateRoom çağrı yerleri, liveRooms/guideDisconnectTimers erişimleri, oda/tur silme ve kapasiteden null dönen yollar ayrıca okundu. evaluateTourGuidePresence genel oda yokluğunu tolere ediyor; join-tour kapasitede 503, unknown steps güvenli boş cevap veriyor. Uygulama ping’i oda üyeliğine bağlı olmadan family/admin bağlantılarına pong döndürüyor.

Kapasite politikası kişi sayısına bağlı değildir: aynı Genel odasındaki 300 dinleyici tek oda kaydı kullanır. Aktif üyeliği, pending guide grace veya broadcast timer’ı bulunan odalar prune/reclaim ile atılmaz. Konfigüre edilmemiş boş odalar 60 s TTL ile bir sonraki 30 s heartbeat sweep’inde temizlenebilir; tahsis sınırı istek anında uygulanır. Genel ve konfigüre odalar normal idle TTL’den muaftır.

### 2.2 Cache etiketleri

- public/sw.js:4: CACHE_NAME = 'ridvanses-pwa-v71'.
- public/sw.js:11: /vercel-ws-shim.js?v=71.
- index.html:85, dinle.html:19, rehber.html:31, panel.html:32, login.html:13, rota.html:12, ani-kitabi.html:10, yaka-karti.html:11: sekiz shim etiketi de v=71; eski shim etiketi yok.
- Mevcut service worker kayıt çağrısı dinle.html:2691 üzerinde /sw.js?v=71.
- Capture/player dosyaları değişmedi: capture v=60-audio ve player v=61-audio pinleri hem sayfalarla hem SW ile eşleşiyor.

## 3. Preload olmadan gerçek CLI çalıştırması

Çalışma dizininde doğrudan çalıştırılan komut:

```powershell
node scripts/verify-system.js
```

Bu tur --require/preload kullanılmadı. Çağıran shell’deki NODE_OPTIONS test süresince kaldırılıp sonunda eski haline getirildi. Üretim server.js ve diskteki scripts/verify-system.js gerçek localhost HTTP/WebSocket sunucusuyla çalıştı. Dış finally bloğu runtime’ın başlangıç byte dizisini korudu; sonuç RUNTIME_RESTORED=True. Paket 60 PASS, 0 FAIL kaydı üretti ve exit 0 döndü. ADIM-3.V71 ve ADIM-5.V71 ayrı PASS kayıtlarıdır.

| Ölçüm | Bu çalıştırmanın sonucu |
|---|---|
| ADIM-3.V59 gerçek WS fan-out | 300 listener; 270 sağlıklı; 120 frame |
| Sağlıklı hedeflere teslim | 32.400 / 32.400; bozuk frame 0 |
| Slow queue drop / hard isolation | 1.500 kontrollü drop / 3 izolasyon |
| Local fan-out p50 / p95 / p99 / max | 12,94 / 24,43 / 32,21 / 39,90 ms |
| Event-loop p99 / CPU / süre | 24,41 / 1.686 / 2.421,1 ms |
| V71 tuple private sızıntı | native 0 / HTTP 0 |
| V71 unknown family allocation | 1.001 istek / 0 yeni oda |
| V71 eski guide / PCM / özel admin delta | 0 / 0 / 0 |
| Worklet timeout / retry / stale node | 3.000 ms / 2 girişim / 0 |
| Kurtarma sonrası taze ses | seq=801; fresh context; PCM örneği eşit |
| Promoted native replacement | terminal fence true; private cache 0 |
| MQTT proof | 400 ms TTL; seq=707 PCM eşit |

Gecikme sayıları localhost WS dağıtımı içindir; mikrofon-hoparlör toplam gecikmesi veya mobil şebeke saha ölçümü değildir. 30 yavaş/izole hedefin kayıpları sağlıklı 270 hedefin teslim istatistiğine karıştırılmamıştır.

Son komutun ilgili ham çıktısı:

```text
V59 METRICS {"listeners":300,"healthy":270,"frames":120,"healthyFrames":32400,"slowQueueDrops":1500,"hardIsolated":3,"corrupt":0,"p50Ms":12.94,"p95Ms":24.43,"p99Ms":32.21,"maxMs":39.9,"eventLoopP99Ms":24.41,"cpuMs":1686,"elapsedMs":2421.1}
V71 E2E METRICS {"identity":{"nativePrivateLeak":0,"httpPrivateLeak":0,"tupleDistinct":true},"rooms":{"unknownRequests":1001,"unknownAllocations":0,"knownTourMax":64,"generalJoinStillWorks":true},"transitions":{"guideToFamilyOldPcm":0,"oldGuideCount":0,"guideToAdminDetached":true,"adminToPilgrimPrivateDelta":0,"familyToJoinOldDelta":0,"failedElevationFamilyPreserved":true,"httpParity":true},"playerAndHandoff":{"realCommit":true,"trustedSnapshot":true,"loadTimeoutMs":3000,"lateNodes":0,"retryAttempts":2,"livePcmAfterRecovery":801,"freshContext":true,"pcmEqual":true,"promotedFence":true,"privateCacheAfter4009":0},"mqtt":{"ttlMs":400,"verifiedPcm":707,"pcmEqual":true}}
[BAŞARILI / PASS] ADIM-3.V71 — Real tuple/PIN/principal isolation, unknown-room rejection/cap, atomic native+HTTP transitions, promoted guide handoff/fence, watchdog→fresh PCM and encrypted400ms proof
V71 UNIT METRICS {"checks":["tuple-key-colon-pairs;actual-target-identity-defense;private-ACK-PIN-scope","1200-unknown-family-zero-allocation;64-per-tour/2048-global;60s-idle-TTL;300-quiet-and-guide-grace-preserved;timer-cleanup","atomic-guide-family/admin;admin-pilgrim;family-join;no-old-PCM;failed-elevation-and-unknown-tour-preserve-family","single-mint-clock-read;1ms-boundary-proof-valid400ms","load3000ms-timeout;late-resolve-zero-stale-node;1500ms-fresh-context-retry;cached-failure-recovery;60s-backoff<=12;one-live-context;pause-resume-during-backoff;cancel;unsupported-explicit","promoted-ACK/snapshot-trusted-observer;binary-original-reference;auth-clear;4009-terminal-fence;late-callback-drop"],"tupleLeak":0,"unknownAllocations":0,"quietListeners":300,"roomCaps":[64,2048],"idleTtlMs":60000,"loadTimeoutMs":3000,"stalePlayerNodes":0,"mintClockReads":1}
[BAŞARILI / PASS] ADIM-5.V71 — Tuple/scope defense; bounded rooms/TTL/active protection; atomic subscriptions; player load watchdog/backoff; promoted native hooks; single MQTT clock
TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: 60 / 60 [BAŞARILI / PASS]
```

## 4. Ses ve taşıma değerlendirmesinin sınırı

Mevcut paket capture/resample/FIR, player/jitter/PLC/de-click, source/media epoch ve stop/resume bariyerleri, Blob/socket generation, native/HTTP handoff, MQTT route/metadata sınırları, canlı principal/revoke ve rol değişim regresyonlarını da çalıştırdı. V71’e ait altı kusur bu mevcut kontrolleri bozmadan kapatılmış durumda.

Player testlerinde üretim receiver fonksiyonları ve gerçek ağ kullanılır; AudioContext/AudioWorklet donanımı deterministik VM modeli ve sanal timer ile temsil edilir. Watchdog’un timeout/backoff/geç resolve davranışı bu modelde kanıtlanmıştır. Gerçek Bluetooth cihazı, iOS/Android ekran kilidi/arama kesintisi, Kâbe kalabalık izolasyonu, harici MQTT broker veya 300 eşzamanlı HTTP+MQTT saha kapasitesi bu tur ölçülmedi. Bu sınırlar yeni doğrulanmış kod kusurları olarak sınıflandırılmadı.

## 5. Çalışma ağacının korunumu

Denetimde yalnız bu rapor kalıcı olarak güncellendi. Rapor dışındaki mevcut 61 takipli dosyanın başlangıç raw SHA-256 değerleri ve runtime Buffer’ı son okumayla karşılaştırıldı. HEAD 0673384 kaldı; index’e yazılmadı. Başlangıçtaki AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md silinmeleri korundu.

Seçilmiş başlangıç = son raw SHA-256 değerleri:

| Dosya | SHA-256 |
|---|---|
| server.js | 381a56e29bd2ea85e37cb8bb7130729cf0e51c79b3de1f129ddd2edcc9bd847f |
| scripts/verify-system.js | 7800b23776df907540c8c5850a5b333b76440025440e2ce898c46cf7a84a5691 |
| public/dinle.html | cc7af976d628804675f015bc834b3b094325f15080372733e39068d572bba27c |
| public/vercel-ws-shim.js | 2946aca9501946bfe0751c7cb0a9623a0d09ebf81980b8d207a8788e691aadfa |
| public/rehber.html | 1339b29b98a0c5dd63d9eaab7fcecaf6bc21e0679a1c14b8e125ac0e74e41c3d |
| public/sw.js | 58e27fa11b1f3d8c80ba89f94f846eff3933b6490aba787a07675a59dac3b35e |
| public/pcm-capture-worklet.js | 30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a |
| public/pcm-player-worklet.js | 062a66aa91bc775bd94b3dfb231243cd6b6e4ff5623893100a79512e0a629af7 |
| data/runtime.json | 087e97acb7b29e389c4ac4da3014ce2aee8de575cd9d602c3af2eae3e11a32c4 |

## 6. Uygulanmış v71 unified diff — değişmeyen kayıt

Aşağıdaki blok, denetlenen 77.727 baytlık orijinal v71 diff’idir. İçeriği değiştirilmedi. Bu HEAD üzerinde ileri uygulama komutu yerine ters check kullanılmalıdır; kod zaten v71’dir.


```diff
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=70"></script>
+  <script src="/vercel-ws-shim.js?v=71"></script>
   <style>
     body {
       background: #e9e2d5;
diff --git a/public/dinle.html b/public/dinle.html
--- a/public/dinle.html
+++ b/public/dinle.html
@@ -16,7 +16,7 @@
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/dinle" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=70"></script>
+  <script src="/vercel-ws-shim.js?v=71"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1670,63 +1670,96 @@
     }
 
     // PATCH: rx-init-v53
+
     function initRxPlayerWorklet() {
-      if (rxPlayerWorkletNode && rxPlayerWorkletNode.context !== audioCtx) {
-        rxPlayerWorkletNode = null;
-        rxPlayerWorkletAlive = false;
-      }
-      if (!audioCtx || rxPlayerWorkletNode || rxPlayerWorkletLoading) return;
-      if (!audioCtx.audioWorklet || typeof window.AudioWorkletNode === 'undefined') return;
-      const ctx = audioCtx;
-      const token = ++rxLoadToken;
-      rxPlayerWorkletLoading = true;
-      ctx.audioWorklet
-        .addModule('/pcm-player-worklet.js?v=61-audio')
-        .then(() => {
-          if (token !== rxLoadToken || audioCtx !== ctx || rxPlayerWorkletNode) return;
-          const node = new AudioWorkletNode(ctx, 'rys-pcm-player', {
-            numberOfInputs: 0,
-            numberOfOutputs: 1,
-            outputChannelCount: [1]
-          });
-          node.onprocessorerror = () => {
-            if(audioCtx!==ctx||rxPlayerWorkletNode!==node)return;
-            rxPlayerWorkletAlive = false;
-            lastRxWorkletHeartbeatAt = 1;
-          };
-          node.port.onmessage = (ev) => {
-            if(audioCtx!==ctx||rxPlayerWorkletNode!==node)return;
-            const d = (ev && ev.data) || {};
-            if (d.type === 'audio-heartbeat') {
-              rxPlayerWorkletAlive = true;
-              lastRxWorkletHeartbeatAt = Date.now();
-
-            } else if (d.type === 'stats') {
-              window.__ryRxAudioStats = d;
+      const state=window.__ryRxPlayerLoad||(window.__ryRxPlayerLoad={
+        ctx:null,token:0,timer:null,retryAt:0,failures:0,unsupported:false
+      });
+      if(state.ctx!==audioCtx){
+        clearTimeout(state.timer);state.timer=null;state.ctx=audioCtx;
+        if(!state.restarting){state.retryAt=0;state.failures=0;}
+        state.restarting=false;state.needsRebuild=false;state.unsupported=false;
+        state.token=++rxLoadToken;rxPlayerWorkletLoading=false;
+      }
+      if(rxPlayerWorkletNode&&rxPlayerWorkletNode.context!==audioCtx){
+        try{rxPlayerWorkletNode.disconnect();rxPlayerWorkletNode.port?.close();}catch(e){}
+        rxPlayerWorkletNode=null;rxPlayerWorkletAlive=false;
+      }
+      if(!audioCtx||audioCtx.state==='closed'||rxPlayerWorkletNode||rxPlayerWorkletLoading)return;
+      if(!audioCtx.audioWorklet||typeof window.AudioWorkletNode==='undefined'){
+        if(!state.unsupported&&typeof showAppToast==='function')
+          showAppToast('Bu tarayıcı canlı sesi desteklemiyor. Güncel bir tarayıcıyla yeniden açın.');
+        state.unsupported=true;window.__ryRxAudioStatus='unsupported';return;
+      }
+      if(state.needsRebuild||Date.now()<state.retryAt)return;
+      clearTimeout(state.timer);state.timer=null;
+      const ctx=audioCtx,token=++rxLoadToken;state.token=token;
+      const owned=()=>rxLoadToken===token&&state.token===token&&state.ctx===ctx&&audioCtx===ctx;
+      state.cancel=()=>{
+        clearTimeout(state.timer);state.timer=null;state.token=++rxLoadToken;
+        rxPlayerWorkletLoading=false;
+        if(!state.restarting){state.retryAt=0;state.failures=0;state.needsRebuild=false;}
+        state.ctx=null;
+      };
+      const failed=reason=>{
+        if(!owned())return;
+        clearTimeout(state.timer);state.timer=null;rxPlayerWorkletLoading=false;
+        const retryToken=++rxLoadToken;state.token=retryToken;
+        if(!isAudioListening||intentionalLeave||ctx.state==='closed')return;
+        state.failures=Math.min(6,state.failures+1);
+        const delay=Math.min(8000,1500*Math.pow(2,state.failures-1));
+        state.retryAt=Date.now()+delay;window.__ryRxAudioStatus=reason;
+        state.needsRebuild=true;
+        const retry=()=>{
+          if(state.token!==retryToken||rxLoadToken!==retryToken||state.ctx!==ctx||audioCtx!==ctx)return;
+          state.timer=null;
+          if(!isAudioListening||intentionalLeave){state.cancel();return;}
+          if(rxPlayerWorkletNode)return;
+          // A Worklet caches failed/pending module responses. Retry in a fresh, closed-over context.
+          state.restarting=true;
+          try{rebuildPilgrimAudioEngine('worklet-load-retry');}finally{state.restarting=false;}
+          if(audioCtx===ctx&&state.token===retryToken&&!rxPlayerWorkletNode){
+            state.retryAt=Date.now()+1500;state.timer=setTimeout(retry,1500);
+          }
+        };
+        state.timer=setTimeout(retry,delay);
+      };
+      rxPlayerWorkletLoading=true;window.__ryRxAudioStatus='loading';
+      state.timer=setTimeout(()=>failed('load-timeout'),3000);
+      let loading;
+      try{loading=ctx.audioWorklet.addModule('/pcm-player-worklet.js?v=61-audio');}
+      catch(error){failed('load-error');return;}
+      Promise.resolve(loading)
+        .then(()=>{
+          if(!owned())return;
+          if(!isAudioListening||intentionalLeave||ctx.state==='closed'){state.cancel();return;}
+          let node;
+          try{
+            node=new AudioWorkletNode(ctx,'rys-pcm-player',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
+            node.onprocessorerror=()=>{
+              if(audioCtx!==ctx||rxPlayerWorkletNode!==node)return;
+              rxPlayerWorkletAlive=false;lastRxWorkletHeartbeatAt=1;
+            };
+            node.port.onmessage=ev=>{
+              if(audioCtx!==ctx||rxPlayerWorkletNode!==node)return;
+              const data=ev?.data||{};
+              if(data.type==='audio-heartbeat'){rxPlayerWorkletAlive=true;lastRxWorkletHeartbeatAt=Date.now();}
+              else if(data.type==='stats')window.__ryRxAudioStats=data;
+            };
+            node.connect(rxInputNode||gainNode);rxPlayerWorkletNode=node;
+            rxPlayerWorkletAlive=true;lastRxWorkletHeartbeatAt=Date.now();
+            clearTimeout(state.timer);state.timer=null;state.retryAt=0;state.failures=0;
+            state.unsupported=false;rxPlayerWorkletLoading=false;window.__ryRxAudioStatus='ready';
+            while(activeScheduledSources.length){
+              const src=activeScheduledSources.shift();
+              try{src.onended=null;src.stop();src.disconnect();src.buffer=null;}catch(e){}
             }
-          };
-          node.connect(rxInputNode || gainNode);
-          rxPlayerWorkletNode = node;
-          rxPlayerWorkletAlive = true;
-          lastRxWorkletHeartbeatAt = Date.now();
-          while (activeScheduledSources.length > 0) {
-            const src = activeScheduledSources.shift();
-            try {
-              src.onended = null;
-              src.stop();
-              src.disconnect();
-              src.buffer = null;
-            } catch {}
-          }
-          flushPendingRxFrames();
+            flushPendingRxFrames();
+          }catch(error){try{node?.disconnect();node?.port?.close();}catch(e){}throw error;}
         })
-        .catch((e) => {
-          console.warn('Player worklet yüklenemedi', e);
-        })
-        .finally(() => {
-          if (token === rxLoadToken) rxPlayerWorkletLoading = false;
-        });
-    }
+        .catch(error=>{if(owned()){console.warn('Player yüklemesi yeniden denenecek',error);failed('load-error');}});
+    }
+
 
     function rebuildPilgrimAudioEngine(reason = 'auto-heal') {
       if (!isAudioListening || isRebuildingAudioEngine) return;
@@ -1735,6 +1768,7 @@
       isRebuildingAudioEngine = true;
       lastAudioEngineRebuildAt = now;
       try {
+        window.__ryRxPlayerLoad?.cancel?.();
         ++rxLoadToken;
         rxPlayerWorkletLoading = false;
         stopAllActiveSources();
@@ -2589,6 +2623,7 @@
     }
 
     function leaveRoom() {
+      window.__ryRxPlayerLoad?.cancel?.();
       intentionalLeave = true;rxAudioSourceId=null;rxStreamActive=null;rxStreamMode=null;rxAudioStateSeq=null;rxAudioStateEnded=false;rxAudioMediaEpoch=null;
       if (window._ryWsReconnectTimeout) {
         clearTimeout(window._ryWsReconnectTimeout);
@@ -2653,7 +2688,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=70').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=71').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=70"></script>
+  <script src="/vercel-ws-shim.js?v=71"></script>
   <style>
     .hero {
       padding: 64px 0 76px;
diff --git a/public/login.html b/public/login.html
--- a/public/login.html
+++ b/public/login.html
@@ -10,7 +10,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/login" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=70"></script>
+  <script src="/vercel-ws-shim.js?v=71"></script>
   <style>
     .login-shell {
       max-width: 460px;
diff --git a/public/panel.html b/public/panel.html
--- a/public/panel.html
+++ b/public/panel.html
@@ -29,7 +29,7 @@
       window.location.href = '/login?next=/panel';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=70"></script>
+  <script src="/vercel-ws-shim.js?v=71"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
diff --git a/public/rehber.html b/public/rehber.html
--- a/public/rehber.html
+++ b/public/rehber.html
@@ -28,7 +28,7 @@
       window.location.href = '/login?next=/rehber';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=70"></script>
+  <script src="/vercel-ws-shim.js?v=71"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
     .console-wrap {
diff --git a/public/rota.html b/public/rota.html
--- a/public/rota.html
+++ b/public/rota.html
@@ -9,7 +9,7 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=70"></script>
+  <script src="/vercel-ws-shim.js?v=71"></script>
   <style>
     .rota-hero-strip {
       background:
diff --git a/public/sw.js b/public/sw.js
--- a/public/sw.js
+++ b/public/sw.js
@@ -1,14 +1,14 @@
 // PATCH: sw-v53
 // PATCH: sw-v53
 // PATCH: sw-v53
-const CACHE_NAME = 'ridvanses-pwa-v70';
+const CACHE_NAME = 'ridvanses-pwa-v71';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=70',
+  '/vercel-ws-shim.js?v=71',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
   '/pcm-player-worklet.js?v=61-audio',
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -196,10 +196,12 @@
         return;
       }
 
+      const native=this._native;
       // VDS / Özel Domain Ortamında Mobil Şebeke (Asansör/Tünel) El Sıkışma Zaman Aşımı (3.5 sn):
       // İlk hatada doğrudan VDS'i yeniden dene; VDS üst üste erişilemezse (bakım/ağ engeli) otomatik MQTT Bulut Rölesine geç!
       const handshakeLimit = 3500;
       const fallbackTimeout = setTimeout(() => {
+        if(this._closedExplicitly||this._native!==native)return;
         if (!this._opened && !this._isRelay) {
           window.__ryConsecutiveVdsFailures = (window.__ryConsecutiveVdsFailures || 0) + 1;
           try {
@@ -223,7 +225,7 @@
       }, handshakeLimit);
 
       this._native.onopen = (ev) => {
-        if (this._isRelay) return;
+        if (this._isRelay||this._closedExplicitly||this._native!==native) return;
         clearTimeout(fallbackTimeout);
         window.__ryConsecutiveVdsFailures = 0;
         this._opened = true;
@@ -232,13 +234,7 @@
         if (typeof this.onopen === 'function') this.onopen(ev);
       };
 
-      this._native.onmessage = (ev) => {
-        if (this._isRelay) return;
-        if(typeof ev.data==='string'){try{const msg=JSON.parse(ev.data);
-          if(msg.type==='session-replaced'){this._fenceReplaced();return;}
-          this._observeTrustedMessage(msg);}catch(e){}}
-        if (typeof this.onmessage === 'function') this.onmessage(ev);
-      };
+      this._native.onmessage = event=>this._handleNativeMessage(native,event);
 
       this._native.onerror = (err) => {
         if (!this._opened && !this._isRelay) {
@@ -249,7 +245,8 @@
 
       this._native.onclose = (ev) => {
         clearTimeout(fallbackTimeout);
-        if(ev.code===4009){this._fenceReplaced();return;}
+        if(this._closedExplicitly||this._native!==native)return;
+        if(ev.code===4009){this._handleNativeClose(native,ev);return;}
         if (!this._isRelay) {
           if (!this._opened) {
             window.__ryConsecutiveVdsFailures = (window.__ryConsecutiveVdsFailures || 0) + 1;
@@ -259,8 +256,7 @@
               return;
             }
           }
-          this.readyState = 3; // CLOSED
-          if (typeof this.onclose === 'function') this.onclose(ev);
+          this._handleNativeClose(native,ev);
         }
       };
     }
@@ -318,6 +314,23 @@
       this._httpEpoch=(this._httpEpoch||0)+1;
       this._relayAbort?.abort();this._relayAbort=null;this._inFlight=false;
     }
+
+    _handleNativeMessage(socket,event){
+      if(this._native!==socket||this._isRelay||this._closedExplicitly||this.readyState!==1)return;
+      if(typeof event.data==='string'){
+        let message;try{message=JSON.parse(event.data);}catch(e){}
+        if(message?.type==='session-replaced'){this._fenceReplaced();return;}
+        if(message)this._observeTrustedMessage(message);
+      }
+      // Preserve the original ArrayBuffer/Blob event; no PCM copy or re-encoding.
+      this.onmessage?.(event);
+    }
+    _handleNativeClose(socket,event){
+      if(this._native!==socket||this._isRelay||this._closedExplicitly)return;
+      if(event?.code===4009){this._fenceReplaced();return;}
+      this.readyState=3;this.onclose?.(event);
+    }
+
     _tryNativeFailback(){
       if(!this._isRelay||this.readyState!==1||this._closedExplicitly||this._failbackProbe)return;
       const join=this._joinContext,generation=this._transportGeneration||0;
@@ -373,10 +386,10 @@
         this._resetRelaySession();
         if(this._pollTimer){clearInterval(this._pollTimer);this._pollTimer=null;}
         if(this._vdsFailbackTimer){clearInterval(this._vdsFailbackTimer);this._vdsFailbackTimer=null;}
-        probe.onmessage=e=>{if(!this._isRelay&&this.readyState===1)this.onmessage?.(e);};
+        probe.onmessage=e=>this._handleNativeMessage(probe,e);
         probe.onerror=e=>this.onerror?.(e);
-        probe.onclose=e=>{if(!this._isRelay){this.readyState=3;this.onclose?.(e);}};
-        try{this.onmessage?.({data:JSON.stringify(ack)});}catch(e){this.onerror?.(e);}
+        probe.onclose=e=>this._handleNativeClose(probe,e);
+        try{this._handleNativeMessage(probe,{data:JSON.stringify(ack)});}catch(e){this.onerror?.(e);}
         if(this._closedExplicitly||this.readyState!==1||this._isRelay||this._native!==probe)return;
         this._failbackSubscription=request;
         if(mode==='join'&&join.role==='guide'&&ack.room?.audioStateKnown===true&&
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=70"></script>
+  <script src="/vercel-ws-shim.js?v=71"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -286,7 +286,7 @@
   const firstRoom = authedBoot.liveRooms[0];
   const firstRoomHasPilgrim =
     firstRoom &&
-    firstRoom.key === 'RY-KASIM:genel' &&
+    firstRoom.key === JSON.stringify(['RY-KASIM','genel']) &&
     Array.isArray(firstRoom.connectedPilgrims) &&
     firstRoom.connectedPilgrims.some((p) => p.name === 'Hacı Mustafa Kaya' && p.phone === '+90 532 111 22 33');
 
@@ -383,8 +383,8 @@
     headers: { Authorization: `Bearer ${authToken}` }
   });
   const postDisconnectBoot = await postDisconnectBootRes.json();
-  const genelRoomAfter = postDisconnectBoot.liveRooms.find((r) => r.key === 'RY-KASIM:genel');
-  const siyerRoomAfter = postDisconnectBoot.liveRooms.find((r) => r.key === 'RY-KASIM:siyer');
+  const genelRoomAfter = postDisconnectBoot.liveRooms.find((r) => r.key === JSON.stringify(['RY-KASIM','genel']));
+  const siyerRoomAfter = postDisconnectBoot.liveRooms.find((r) => r.key === JSON.stringify(['RY-KASIM','siyer']));
 
   assertCondition(
     'ADIM-3.3 (YÜKSEK-03 Senaryo C)',
@@ -591,6 +591,7 @@
   await runV68RoleBoundaryChecks({baseUrl,url:wsUrl,token:authToken});
   await runV69RoomReplacementChecks({baseUrl,url:wsUrl,token:authToken});
   await runV70SecurityChecks({baseUrl,url:wsUrl,token:authToken,credentials:loginCredentials});
+  await runV71IsolationChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1115,8 +1116,10 @@
   const source=fs.readFileSync(path.join(ROOT_DIR,'server.js'),'utf8');
   g.AUTH_TOKEN_VALUE=g.AUTH_TOKEN_VALUE||'good';
   g.activeAuthSessions=g.activeAuthSessions||new Map();
+  g.liveRooms=g.liveRooms||new Map();g.guideDisconnectTimers=g.guideDisconnectTimers||new Map();
+  g.WebSocket=g.WebSocket||{OPEN:1};
   g.AUTH_COOKIE_NAME='unit_auth';
-  vm.runInContext(['rysPrincipal','rysCanGuide','rysCanAdmin','extractAuthTokenFromReq'].map(n=>v70Pick(source,n)).join('\n'),g);
+  vm.runInContext(['rysPrincipal','rysCanGuide','rysCanAdmin','extractAuthTokenFromReq','rysRoomKey','findRysTour','isConfiguredRysRoom','dropRysRoom','pruneRysRooms','commitRysSubscription'].map(n=>v70Pick(source,n)).join('\n'),g);
 }
 
 async function runStep5V53AudioChecks(){
@@ -1329,7 +1332,7 @@
   class RxNode{constructor(context){this.context=context;created++;this.port={};}connect(){}}
   const loading=box(pick(listener,'initRxPlayerWorklet'),'',{audioCtx:oldCtx,rxPlayerWorkletNode:null,
     rxPlayerWorkletLoading:false,rxPlayerWorkletAlive:false,rxLoadToken:0,
-    window:{AudioWorkletNode:RxNode},AudioWorkletNode:RxNode,rxInputNode:{},gainNode:{},
+    window:{AudioWorkletNode:RxNode},isAudioListening:true,intentionalLeave:false,AudioWorkletNode:RxNode,rxInputNode:{},gainNode:{},
     activeScheduledSources:[],flushPendingRxFrames(){}}).c;
   loading.initRxPlayerWorklet();loading.audioCtx=newCtx;loading.rxLoadToken++;loading.rxPlayerWorkletLoading=false;
   loading.initRxPlayerWorklet();resolveOld();await new Promise(r=>setImmediate(r));
@@ -1564,9 +1567,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v70"));assert(sw.includes('/vercel-ws-shim.js?v=70'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v71"));assert(sw.includes('/vercel-ws-shim.js?v=71'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'70',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'71',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -1823,7 +1826,7 @@
   const names=['resolveRysRelay','digestRysSubscription','sendRysSubscriptionAck','clearRysHandoff','validateRysHandoff','handleRysNativeHandoff'];
   let now=1000,allowed=true,joins=0,created=0;
   const sessions=new Map(),serverJobs=[];
-  const sc={crypto,Buffer,console,Date:{now:()=>now},httpRelaySessions:sessions,db:{tours:[]},
+  const sc={crypto,Buffer,console,Date:{now:()=>now},httpRelaySessions:sessions,db:{tours:[{code:'X'}]},
     isValidAuthToken:t=>allowed&&t==='good',
     getOrCreateRelaySession(){created++;throw Error('Unknown v56 ID must not be recreated');},
     setTimeout(fn){serverJobs.push(fn);return {unref(){}};},clearTimeout(){},
@@ -2003,7 +2006,7 @@
   const map=new Map(),removed=[];let heartbeat;
   map.set('rys56-idle',{lastSeen:0,currentRoom:{},relayKey:'b'.repeat(48),ws:{}});
   map.set('rys56-live',{lastSeen:59000,relayKey:'c'.repeat(48),ws:{}});
-  const sc={httpRelaySessions:map,Date:{now:()=>60000},Buffer,crypto:require('node:crypto'),wss:{clients:new Set()},
+  const sc={httpRelaySessions:map,Date:{now:()=>60000},Buffer,crypto:require('node:crypto'),wss:{clients:new Set()},pruneRysRooms(){},
     removeClientFromRoom:(room,id)=>removed.push(id),setInterval(fn,ms){assert.equal(ms,30000);heartbeat=fn;return 1;},
     getOrCreateRelaySession(){throw Error('Must not create an expired opaque ID');}};
   vm.createContext(sc);
@@ -2531,7 +2534,7 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));
   for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
   assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
@@ -2741,7 +2744,7 @@
     assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
     checks.push('MQTT-room-and-stream-source-parity');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
   assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
   recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
@@ -2980,7 +2983,7 @@
     }
     checks.push('failed-poll-retry-keeps-latest-stop-and-resume-only');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V62 UNIT METRICS '+JSON.stringify({checks,coalescerPostStopAudio:0,receiverPostStopFrames:0}));
   recordResult('ADIM-5.V62','Stop/mode/source barriers across coalescer, relay, receiver, demo lifecycle and server; idle reconnect; cache62',true);
   console.log('V62 UNIT PASS');
@@ -3165,7 +3168,7 @@
     const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'room-state',room:{...state(1,true),audioStateKnown:true}})});
     assert(h.player.q.has(1001));assert.equal(h.g.rxAudioDeliveryEpoch,epoch);checks.push('unknown-to-known-live-snapshot-preserves-current-pcm');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V63 UNIT METRICS '+JSON.stringify({checks,snapshotRecovered:true,staleStateResets:0,renewalFirstPcmPreserved:true}));
   recordResult('ADIM-5.V63','Ordered state/snapshot recovery; terminal disconnect; source reset; inheritance; MQTT parity; renewal state-before-PCM; cache63',true);
   console.log('V63 UNIT PASS');
@@ -3352,7 +3355,7 @@
     deliver(state(12,12,true,'mic'));assert.equal(stopped,1);assert.equal(h.g.activeGuideDemoSources.size,0);
     checks.push('demo-topic-keeps-current-note-and-mode-change-stops-it');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V64 UNIT METRICS '+JSON.stringify({checks,postResumeOldFrames:0,capturedOldBatchFrames:0,currentPendingPreserved:true,topicTimelinePreserved:true}));
   recordResult('ADIM-5.V64','Media epoch across PCM/synth/coalescer/server/receiver; topic continuity; Blob fencing; stop-resume during relay-open; pending-media preservation; cache64',true);console.log('V64 UNIT PASS');
 }
@@ -3516,7 +3519,7 @@
     const good=member('rys56-good','c'.repeat(48));g.serveRysRelay(good,{auth:true,method:'POST',body:{requestSeq:1}},response(),'good',{type:'join',role:'guide'});assert.equal(good.lastSeen,35001);
     checks.push('auth-failure-retires-verified-privileged-capability-public-ID-cannot-disconnect-legacy-no-failed-lease-renewal');
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V65 UNIT METRICS '+JSON.stringify({checks,unprimedFrames:0,retryFirstPcmPreserved:true,fullQueueStopDelivered:true,failedAuthLeaseExtensions:0}));
   recordResult('ADIM-5.V65','Controller readiness; retry control-first and latched full-queue stop; submitted-epoch ACK; auth-failure cleanup and lease/public-ID safety; cache65',true);console.log('V65 UNIT PASS');
 }
@@ -3690,7 +3693,7 @@
     h.s.close();assert(h.clients.every(c=>c.ended===1));assert.equal(h.received.length,0);
     checks.push('100-replacements-bounded-active-clients-invalidate-before-synchronous-end');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('vercel-ws-shim.js?v=70'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('vercel-ws-shim.js?v=71'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V66 UNIT METRICS '+JSON.stringify({checks,clientsAfterDelayedClose:0,staleDelivered:0,activeClientsMax:2,replacements:100}));
   recordResult('ADIM-5.V66','MQTT loader/client/suback/timer ownership across route, close and native takeover; bounded replacement; cache66',true);console.log('V66 UNIT PASS');
@@ -3762,7 +3765,7 @@
   function pick(name){const m=new RegExp('^function '+name+'\\(','m').exec(source);assert(m,'V67 missing '+name);
     for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const code=source.slice(m.index,end+1);try{new vm.Script(code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V67 unterminated '+name);}
   let now=1000;const sessions=new Map(),revoked=new Set(),sockets=new Set(),removed=[];
-  const g={Date:{now:()=>now},AUTH_TOKEN_VALUE:'static-root',activeAuthSessions:sessions,revokedAuthTokens:revoked,wss:{clients:sockets},db:{tours:[]},
+  const g={Date:{now:()=>now},AUTH_TOKEN_VALUE:'static-root',activeAuthSessions:sessions,revokedAuthTokens:revoked,wss:{clients:sockets},db:{tours:[{code:'RY-KASIM'}]},
     clearTimeout:j=>{if(j)j.cancelled=true;},removeClientFromRoom:(room,id,grace)=>{removed.push({id,grace});room.clients.delete(id);}};
   vm.createContext(g);installV70AuthFixture(g);vm.runInContext(['isValidAuthToken','revokeAuthToken','refreshRysNativeAuth','clearRysHandoff','validateRysHandoff','processClientJsonMessageV49'].map(pick).join('\n'),g);
   const grant=(token,expiresAt=10000)=>sessions.set(token,{expiresAt,user:{role:'agency_admin',assignedTour:null}});
@@ -3812,7 +3815,7 @@
     sockets.clear();const idle=member('idle-expired','json-expired');g.heartbeat();assert.equal(idle.ws.terminated,1);assert.equal(idle.currentRoom,null);
     checks.push('real-binary-and-JSON-ingress-reject-expired-credentials-idle-heartbeat-cleans-membership');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('vercel-ws-shim.js?v=70'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('vercel-ws-shim.js?v=71'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V67 UNIT METRICS '+JSON.stringify({checks,expiredGuidePresent:false,expiryGraceMs:0,revokedGuideTerminated:1,revokedAdminTerminated:1,healthyTerminated:0,publicFamilyTerminated:0,cancelledPrepare:true}));
   recordResult('ADIM-5.V67','Native live credential expiry/revoke, token rotation, pending handoff cleanup, public-family isolation and HTTP/static compatibility; cache67',true);console.log('V67 UNIT PASS');
@@ -3972,7 +3975,7 @@
     assert.equal(h.room('siyer').audioSourceId,'page');assert.equal(h.room('siyer').audioMediaEpoch,10);assert.equal(h.room('siyer').isLive,true);
     checks.push('dedicated-guide-downgrade-restores-General-source-state-epoch-inheritance');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('vercel-ws-shim.js?v=70'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('vercel-ws-shim.js?v=71'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V68 UNIT METRICS '+JSON.stringify({checks,collisionCases,crossRoleGuideEvictions:0,downgradeOwner:null,sameRoleReconnect:true,terminalStop:true,coveredByGenel:true}));
   recordResult('ADIM-5.V68','Role-isolated device dedup; native/HTTP/legacy collisions; same-role reconnect; same-socket downgrade/owner release/terminal stop and General inheritance; cache68',true);console.log('V68 UNIT PASS');
@@ -4153,7 +4156,7 @@
     assert.equal(h.room().activePublisherClientId,null);assert(h.room('target').clients.has('current'));
     checks.push('cross-tour-prior-guide-removal-does-not-suppress-target-tour-reconciliation');
   }
-  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v70'));assert(sw.includes('vercel-ws-shim.js?v=70'));
+  const sw=fs.readFileSync(path.join(PUBLIC_DIR,'sw.js'),'utf8');assert(sw.includes('ridvanses-pwa-v71'));assert(sw.includes('vercel-ws-shim.js?v=71'));
   assert(sw.includes('pcm-player-worklet.js?v=61-audio'));assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
   console.log('V69 UNIT METRICS '+JSON.stringify({checks,vacatedOwners:0,reconciliationsPerAffectedTour:1,sameRoomTerminalControls:0,generalControllerReady:true,crossTourSync:true}));
   recordResult('ADIM-5.V69','Cross-room guide replacement owner cleanup; terminal/General reconciliation after membership install; same-room continuity; existing-context and duplicate-room coverage; cache69',true);console.log('V69 UNIT PASS');
@@ -4477,6 +4480,296 @@
   }
 }
 
+
+async function runStep5V71AudioChecks(){
+  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8');
+  const server=read('server.js'),shim=read('public/vercel-ws-shim.js'),listener=read('public/dinle.html'),checks=[];
+  const h=createV68MembershipHarness(server),g=h.g;let now=1000;
+  g.crypto=require('node:crypto');g.Buffer=Buffer;g.liveRooms=new Map();
+  g.db.tours=[{code:'T',rooms:[{id:'genel'},{id:'siyer'}]},{code:'T:SUB',pinProtected:true,pin:'private-pin'},{code:'OTHER',pinProtected:true,pin:'other-pin'}];
+  g.Date=class extends Date{static now(){return now;}};g.setTimeout=()=>({unref(){}});
+  g.clearTimeout=t=>{if(t)t.cancelled=true;};
+  g.revokedAuthTokens=new Set();g.activeAuthSessions.set('scoped',{expiresAt:1e9,user:{role:'agency',assignedTour:'T'}});
+  vm.runInContext(['isValidAuthToken','getOrCreateRoom','getTourRooms','removeClientFromRoom','rysCanonical','rysTopicSegment','rysMqttTopic','rysMintMqtt','rysVerifyMqtt']
+    .map(n=>v70Pick(server,n)).join('\n'),g);
+  {
+    const privateRoom=g.getOrCreateRoom('T:SUB','hidden');
+    privateRoom.clients.set('victim',{id:'victim',role:'pilgrim',phone:'PRIVATE-V71',name:'Victim',ws:{readyState:1,send(){}}});
+    const actor=h.context('actor');g.processClientJsonMessageV49(actor,{type:'join',role:'guide',tourCode:'T',roomId:'SUB:hidden',name:'Actor',token:'scoped'});
+    assert.equal(actor.currentRoom.tourCode,'T');assert.notEqual(actor.currentRoom,privateRoom);
+    assert(!JSON.stringify(actor.ws.messages).includes('PRIVATE-V71'));
+    assert.notEqual(g.rysRoomKey('T:SUB','hidden'),g.rysRoomKey('T','SUB:hidden'));
+    const real=g.getOrCreateRoom;g.getOrCreateRoom=()=>privateRoom;
+    const poisoned=h.context('poisoned');g.processClientJsonMessageV49(poisoned,{type:'join',role:'guide',tourCode:'T',roomId:'x',token:'good'});
+    assert.equal(poisoned.currentRoom,null);assert(!poisoned.ws.messages.some(m=>m.type==='joined'));g.getOrCreateRoom=real;
+    const pin=h.context('pin');g.processClientJsonMessageV49(pin,{type:'join',role:'pilgrim',tourCode:'OTHER',roomId:'genel',token:'scoped'});
+    assert.equal(pin.currentRoom,null);assert(pin.ws.messages.some(m=>m.type==='pin-error'));
+    checks.push('tuple-key-colon-pairs;actual-target-identity-defense;private-ACK-PIN-scope');
+  }
+  {
+    const initial=g.liveRooms.size,publicClient=h.context('unknown-family');
+    for(let i=0;i<1200;i++)g.processClientJsonMessageV49(publicClient,{type:'family-subscribe',tourCode:'UNKNOWN-'+i});
+    assert.equal(g.liveRooms.size,initial);assert.equal(publicClient.currentRoom,null);assert(!publicClient.ws.familyTourCode);
+    for(let i=0;i<1200;i++)assert.equal(g.getOrCreateRoom('UNKNOWN-'+i,'genel'),null);
+    const main=g.getOrCreateRoom('T','genel');
+    for(let i=0;i<300;i++)main.clients.set('quiet-'+i,{id:'quiet-'+i,role:'pilgrim',ws:{readyState:1,send(){}}});
+    const idle=g.getOrCreateRoom('OTHER','idle');now+=59999;g.pruneRysRooms();assert(g.liveRooms.has(idle.key));
+    now++;g.pruneRysRooms();assert(!g.liveRooms.has(idle.key));assert.equal(main.clients.size,300);
+    const grace=g.getOrCreateRoom('OTHER','grace');grace.idleSince=0;g.guideDisconnectTimers.set(grace.key,{});
+    g.pruneRysRooms();assert(g.liveRooms.has(grace.key));g.guideDisconnectTimers.delete(grace.key);g.pruneRysRooms();assert(!g.liveRooms.has(grace.key));
+    const timerRoom=g.getOrCreateRoom('OTHER','delete-timer'),timer={};timerRoom._broadcastTimer=timer;
+    g.dropRysRoom(timerRoom);assert(timer.cancelled);assert(!g.liveRooms.has(timerRoom.key));
+    while(Array.from(g.liveRooms.values()).filter(r=>r.tourCode==='T').length<64){
+      const r=g.getOrCreateRoom('T','active-'+g.liveRooms.size);assert(r);r.clients.set('active',{role:'pilgrim'});
+    }
+    assert.equal(g.getOrCreateRoom('T','over-cap'),null);assert.equal(main.clients.size,300);
+    const saved=g.liveRooms;g.liveRooms=new Map();
+    for(let i=0;i<2048;i++){const key=g.rysRoomKey('F-'+i,'r');g.liveRooms.set(key,{key,tourCode:'F-'+i,roomId:'r',clients:new Map([['live',{}]])});}
+    assert.equal(g.getOrCreateRoom('OTHER','global-over-cap'),null);g.liveRooms=saved;
+    checks.push('1200-unknown-family-zero-allocation;64-per-tour/2048-global;60s-idle-TTL;300-quiet-and-guide-grace-preserved;timer-cleanup');
+  }
+  {
+    const owner=h.context('owner');g.processClientJsonMessageV49(owner,{type:'join',role:'guide',tourCode:'OTHER',roomId:'genel',audioSourceId:'owner-page',token:'good'});
+    g.processClientJsonMessageV49(owner,{type:'guide-stream-state',isLive:true,broadcastMode:'mic',audioStateSeq:10,audioMediaEpoch:10});
+    const old=owner.currentRoom;
+    g.processClientJsonMessageV49(owner,{type:'family-subscribe',tourCode:'T'});
+    assert.equal(owner.currentRoom,null);assert(!old.clients.has(owner.clientId));assert.equal(old.isLive,false);assert.equal(old.activePublisherClientId,null);
+    const before=h.events.length;g.processClientJsonMessageV49(owner,{type:'audio-chunk',seq:77,sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64'),sentAt:now});
+    assert.equal(h.events.length,before);
+    g.processClientJsonMessageV49(owner,{type:'join',role:'guide',tourCode:'OTHER',roomId:'genel',token:'good'});
+    g.processClientJsonMessageV49(owner,{type:'admin-subscribe',token:'good'});assert(owner.ws.isAdmin);assert.equal(owner.currentRoom,null);assert.equal(owner.ws.familyTourCode,null);
+    g.processClientJsonMessageV49(owner,{type:'join',role:'pilgrim',tourCode:'OTHER',roomId:'genel',pin:'other-pin'});
+    assert.equal(owner.ws.isAdmin,false);assert.equal(owner.ws.familyTourCode,null);
+    const family=h.context('public-family');g.processClientJsonMessageV49(family,{type:'family-subscribe',tourCode:'T'});
+    g.processClientJsonMessageV49(family,{type:'join',role:'guide',tourCode:'T',token:'bad'});
+    assert.equal(family.ws.familyTourCode,'T');assert.equal(family.currentRoom,null);
+    g.processClientJsonMessageV49(family,{type:'ping',ts:123});assert(family.ws.messages.some(m=>m.type==='pong'&&m.echoTs===123));
+    g.processClientJsonMessageV49(family,{type:'family-subscribe',tourCode:'UNKNOWN'});
+    assert.equal(family.ws.familyTourCode,'T');
+    g.processClientJsonMessageV49(family,{type:'join',role:'pilgrim',tourCode:'OTHER',pin:'other-pin',roomId:'genel'});
+    assert.equal(family.ws.familyTourCode,null);assert.equal(family.currentRoom.tourCode,'OTHER');
+    checks.push('atomic-guide-family/admin;admin-pilgrim;family-join;no-old-PCM;failed-elevation-and-unknown-tour-preserve-family');
+  }
+  {
+    const room=g.getOrCreateRoom('OTHER','genel'),issuer={clientId:'ttl-issuer',currentRoom:room,ws:{isHttpRelay:true},rysAuthToken:'good',lastSeen:1000};
+    room.clients.set(issuer.clientId,{role:'guide',audioSourceId:'ttl-page'});Object.assign(room,{isLive:true,audioSourceId:'ttl-page',audioStateSeq:10,audioMediaEpoch:10});
+    const receiver={clientId:'ttl-receiver',currentRoom:room};room.clients.set(receiver.clientId,{role:'pilgrim'});
+    g.httpRelaySessions.set(issuer.clientId,issuer);let reads=0;g.Date={now:()=>++reads===1?1000:1001};
+    g.rysMintMqtt(issuer,room,{type:'audio-chunk',seq:7,audioSourceId:'ttl-page',audioMediaEpoch:10,sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
+    const frame=issuer.mqttPublications.at(-1);assert.equal(reads,1);assert.equal(frame.expiresAt-frame.issuedAt,400);
+    assert.equal(g.rysVerifyMqtt(receiver,frame).seq,7);checks.push('single-mint-clock-read;1ms-boundary-proof-valid400ms');
+  }
+  {
+
+    const jobs=new Map(),attempts=[],created=[],posts=[],contexts=[];let time=10000,jobId=0,mode='defer';
+    const graphNode=()=>({connect(){},disconnect(){},gain:{value:1},frequency:{value:0},Q:{value:0}});
+    const newContext=()=>{
+      const ctx={state:'running',currentTime:1,destination:{},close(){this.state='closed';return Promise.resolve();},resume:()=>Promise.resolve(),
+        createBiquadFilter:graphNode,createGain:graphNode,
+        audioWorklet:{addModule(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});attempts.push({resolve,reject,ctx});if(mode==='reject'||ctx.cachedFailure){ctx.cachedFailure=true;reject(Error('cached network failure'));}return promise;}}};
+      contexts.push(ctx);return ctx;
+    };
+    class RxNode{constructor(ctx){this.context=ctx;created.push(this);this.port={postMessage:m=>posts.push(m),close(){}};}connect(){}disconnect(){}}
+    const ctx=newContext(),b={window:{AudioWorkletNode:RxNode,AudioContext:class{constructor(){return newContext();}}},
+      AudioWorkletNode:RxNode,audioCtx:ctx,rxLoadToken:0,rxPlayerWorkletLoading:false,rxPlayerWorkletNode:null,rxPlayerWorkletAlive:false,
+      rxInputNode:{},gainNode:{},volumeMultiplier:1,activeScheduledSources:[],lastRxWorkletHeartbeatAt:0,
+      isAudioListening:true,intentionalLeave:false,isRebuildingAudioEngine:false,lastAudioEngineRebuildAt:0,
+      lastAudioCtxTimeVal:-1,audioCtxStuckCount:0,lastReceivedAudioSeq:0,
+      stopAllActiveSources(){},startBackgroundKeepAliveAudio(){},syncAudioUnlockButtonUi(){},
+      Date:{now:()=>time},console:{warn(){},log(){}},flushPendingRxFrames(){posts.push('flush');},
+      setTimeout(fn,ms){const id=++jobId;jobs.set(id,{fn,at:time+ms});return id;},clearTimeout:id=>jobs.delete(id)};
+    vm.createContext(b);vm.runInContext(['initRxPlayerWorklet','ensureAudioContext','rebuildPilgrimAudioEngine'].map(n=>v70Pick(listener,n)).join('\n'),b);
+    const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
+    const advance=async ms=>{const end=time+ms;while(true){const next=[...jobs].filter(([,j])=>j.at<=end).sort((a,c)=>a[1].at-c[1].at)[0];if(!next)break;time=next[1].at;if(b.audioCtx)b.audioCtx.currentTime+=.1;jobs.delete(next[0]);next[1].fn();await tick();}time=end;await tick();};
+    b.initRxPlayerWorklet();assert.equal(attempts.length,1);await advance(3000);assert.equal(b.rxPlayerWorkletLoading,false);
+    const retryToken=b.rxLoadToken;attempts[0].resolve();await tick();assert.equal(created.length,0);assert.equal(b.rxLoadToken,retryToken);
+    for(let i=0;i<100;i++)b.initRxPlayerWorklet();assert.equal(attempts.length,1);
+    await advance(1500);assert.equal(attempts.length,2);assert.equal(ctx.state,'closed');assert.notEqual(attempts[1].ctx,ctx);
+    attempts[1].resolve();await tick();assert.equal(created.length,1);assert.equal(b.rxPlayerWorkletNode.context,b.audioCtx);assert.equal(jobs.size,0);
+    assert(posts.includes('flush'));assert.equal(b.window.__ryRxAudioStatus,'ready');
+    // Each context deliberately retains a rejected response; success requires a new context.
+    mode='reject';time+=1500;b.rebuildPilgrimAudioEngine('fixture-cached-failure');await tick();const at=attempts.length;
+    for(let second=0;second<60;second++){for(let i=0;i<50;i++)b.initRxPlayerWorklet();await advance(1000);}
+    const retryCount=attempts.length-at;assert(retryCount>1&&retryCount<=12);assert(jobs.size<=1);
+    assert(contexts.every(c=>c===b.audioCtx||c.state==='closed'),'Only one live context across failed cached loads');
+    const failedCtx=b.audioCtx;mode='defer';b.isAudioListening=false;await advance(8000);
+    assert.equal(jobs.size,0);assert.equal(b.window.__ryRxPlayerLoad.needsRebuild,false);
+    b.isAudioListening=true;b.initRxPlayerWorklet();await tick();await advance(1500);assert.notEqual(b.audioCtx,failedCtx);
+    attempts.at(-1).resolve();await tick();assert.equal(b.window.__ryRxAudioStatus,'ready');
+    b.window.__ryRxPlayerLoad.cancel();const stopped=attempts.length;await advance(20000);assert.equal(attempts.length,stopped);assert.equal(jobs.size,0);
+    b.audioCtx={state:'running'};b.rxPlayerWorkletNode=null;b.initRxPlayerWorklet();
+    assert.equal(b.window.__ryRxAudioStatus,'unsupported');assert.equal(jobs.size,0);
+    checks.push('load3000ms-timeout;late-resolve-zero-stale-node;1500ms-fresh-context-retry;cached-failure-recovery;60s-backoff<=12;one-live-context;pause-resume-during-backoff;cancel;unsupported-explicit');
+
+  }
+  {
+    const probes=[];class Native{constructor(){this.readyState=1;this.sent=[];probes.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(){this.readyState=3;}}
+    const h=createV66MqttHarness(shim,{SocketClass:Native}),s=h.s,join={type:'join',role:'guide',tourCode:'T',roomId:'genel',audioSourceId:'page'};
+    h.init(join);h.load();Object.assign(s,{_relayClientId:'rys56-v71',_relayKey:'b'.repeat(48)});
+    s._observeTrustedMessage({type:'room-state',room:{tourCode:'T',roomId:'genel',connectedPilgrims:[{id:'old'}]}});
+    s._tryNativeFailback();const p=probes.at(-1);p.onopen();const handoffId='a'.repeat(32);
+    p.onmessage({data:JSON.stringify({type:'handoff-prepared',handoffId})});
+    p.onmessage({data:JSON.stringify({type:'handoff-committed',handoffId,ack:{type:'joined',room:{tourCode:'T',roomId:'genel',connectedPilgrims:[{id:'new'}]}}})});
+    assert.deepEqual([...s._pilgrimMeta.keys()],['new']);
+    p.onmessage({data:JSON.stringify({type:'room-state',room:{tourCode:'T',roomId:'genel',connectedPilgrims:[{id:'newer'}]}})});
+    assert.deepEqual([...s._pilgrimMeta.keys()],['newer']);
+    const buffer=new ArrayBuffer(972);p.onmessage({data:buffer});assert.equal(h.received.at(-1).data,buffer);
+    p.onmessage({data:JSON.stringify({type:'auth-error'})});assert.equal(s._pilgrimMeta.size,0);
+    p.onclose({code:4009,reason:'session-replaced'});assert(s._replaced);assert(s._closedExplicitly);assert.equal(s.readyState,3);
+    const n=h.received.length;p.onmessage({data:buffer});assert.equal(h.received.length,n);
+    checks.push('promoted-ACK/snapshot-trusted-observer;binary-original-reference;auth-clear;4009-terminal-fence;late-callback-drop');
+  }
+  console.log('V71 UNIT METRICS '+JSON.stringify({checks,tupleLeak:0,unknownAllocations:0,quietListeners:300,roomCaps:[64,2048],idleTtlMs:60000,loadTimeoutMs:3000,stalePlayerNodes:0,mintClockReads:1}));
+  recordResult('ADIM-5.V71','Tuple/scope defense; bounded rooms/TTL/active protection; atomic subscriptions; player load watchdog/backoff; promoted native hooks; single MQTT clock',true);
+  console.log('V71 UNIT PASS');
+}
+
+
+async function runV71IsolationChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws'),stamp=Date.now().toString(36).toUpperCase();
+  const code='RY-V71-'+stamp,part='V71-'+stamp,privateCode='RY-KASIM:'+part;
+  const headers={'Content-Type':'application/json'},auth={...headers,Authorization:'Bearer '+token},sockets=[],caps=[],created=[],issued=[],errors=[];
+  const metrics={};let guideBus,rx;
+  const wait=ms=>new Promise(r=>setTimeout(r,ms));
+  const until=async(test,label)=>{const end=Date.now()+7000;while(!test()){if(Date.now()>end)throw Error('V71 deadline '+label);await wait(5);}};
+  const relay=async(body,status=200)=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
+  const open=async()=>{const r=await relay({type:'relay-open',version:56}),c={clientId:r.clientId,relayKey:r.relayKey,seq:0};caps.push(c);return c;};
+  const poll=(c,context,messages=[],extra={},status=200)=>relay({clientId:c.clientId,relayKey:c.relayKey,requestSeq:++c.seq,subscriptionContext:context,messages,...extra},status);
+  const connect=async()=>{const ws=new WebSocket(url);ws.messages=[];sockets.push(ws);ws.on('error',e=>errors.push(e.message));
+    ws.on('message',(raw,binary)=>{if(!binary)ws.messages.push(JSON.parse(raw));});
+    await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return ws;};
+  const send=async(ws,msg,type)=>{const n=ws.messages.length;ws.send(JSON.stringify(msg));await until(()=>ws.messages.slice(n).some(m=>m.type===type),type);return ws.messages.slice(n).find(m=>m.type===type);};
+  const boot=async()=>{const r=await fetch(baseUrl+'/api/bootstrap',{headers:auth});assert.equal(r.status,200);return r.json();};
+  const state=(seq,topic='V71')=>({type:'guide-stream-state',isLive:true,broadcastMode:'mic',audioStateSeq:seq,audioMediaEpoch:seq,topic});
+  const pcm=Buffer.alloc(960);for(let i=0;i<480;i++)pcm.writeInt16LE(3000,i*2);
+  const binary=seq=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq);b.writeDoubleLE(Date.now(),4);pcm.copy(b,12);return b;};
+  const pilgrim=(tour,room='genel')=>({type:'join',role:'pilgrim',tourCode:tour,roomId:room,pin:'7771',name:'V71 listener'});
+  class Bridge{
+    constructor(address){this.real=new WebSocket(address);sockets.push(this.real);this.real.on('open',()=>this.onopen?.({}));
+      this.real.on('error',e=>{errors.push(e.message);this.onerror?.(e);});
+      this.real.on('close',(code,reason)=>this.onclose?.({code,reason:reason.toString()}));
+      this.real.on('message',(raw,binary)=>this.onmessage?.({data:binary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString()}));}
+    get readyState(){return this.real.readyState;}get bufferedAmount(){return this.real.bufferedAmount;}
+    send(raw){this.real.send(raw);}close(){this.real.close();}
+  }
+  try{
+    for(const tour of [code,privateCode]){
+      const r=await fetch(baseUrl+'/api/tours',{method:'POST',headers:auth,body:JSON.stringify({code:tour,name:'V71 isolation fixture',pin:'7771'})});
+      assert.equal(r.status,200);await r.arrayBuffer();created.push(tour);
+    }
+    const login=await fetch(baseUrl+'/api/login',{method:'POST',headers,body:JSON.stringify({email:'selamet',password:process.env.SELAMET_PASSWORD||'selamet2026'})});
+    assert.equal(login.status,200);const scoped=(await login.json()).token;issued.push(scoped);
+    const privateGuide=await connect();await send(privateGuide,{type:'join',role:'guide',tourCode:privateCode,roomId:'hidden',name:'V71 private guide',audioSourceId:'v71-private',token},'joined');
+    await send(privateGuide,state(10),'stream-state');
+    const privateCap=await open();await poll(privateCap,{...pilgrim(privateCode,'hidden'),phone:'V71-PRIVATE-PHONE'});
+    const actor=await connect();const ownAck=await send(actor,{type:'join',role:'guide',tourCode:'RY-KASIM',roomId:part+':hidden',name:'V71 scoped',audioSourceId:'v71-scoped',token:scoped},'joined');
+    assert.equal(ownAck.room.tourCode,'RY-KASIM');assert.equal(ownAck.room.roomId,part+':hidden');
+    assert(!JSON.stringify(ownAck).includes('V71-PRIVATE-PHONE'));
+    const scopedCap=await open(),scopedAck=await poll(scopedCap,{type:'join',role:'guide',tourCode:'RY-KASIM',roomId:part+':hidden',name:'V71 scoped HTTP',audioSourceId:'v71-scoped-http',token:scoped},[],{token:scoped});
+    assert(scopedAck.messages.some(m=>m.type==='joined'&&m.room.tourCode==='RY-KASIM'));
+    metrics.identity={nativePrivateLeak:0,httpPrivateLeak:JSON.stringify(scopedAck).includes('V71-PRIVATE-PHONE')?1:0,tupleDistinct:ownAck.room.key!==privateGuide.messages.find(m=>m.type==='joined').room.key};
+    assert.equal(metrics.identity.httpPrivateLeak,0);assert(metrics.identity.tupleDistinct);
+
+    const unknown=await connect(),prefix='V71-UNKNOWN-'+stamp+'-';const initial=(await boot()).liveRooms.length;
+    for(let i=0;i<1000;i++)unknown.send(JSON.stringify({type:'family-subscribe',tourCode:prefix+i}));
+    await until(()=>unknown.messages.filter(m=>m.type==='subscription-error').length===1000,'unknown family rejection');
+    unknown.close();const unknownHttp=await open();
+    const refused=await poll(unknownHttp,{type:'family-subscribe',tourCode:prefix+'HTTP'});assert(refused.messages.some(m=>m.type==='subscription-error'));
+    const after=(await boot()).liveRooms;assert.equal(after.length,initial);assert(!after.some(r=>r.tourCode.startsWith(prefix)));
+    const flood=await connect();for(let i=0;i<100;i++)flood.send(JSON.stringify(pilgrim(code,'ephemeral-'+i)));
+    await until(()=>flood.messages.filter(m=>m.type==='joined'||m.type==='subscription-error').length===100,'bounded valid rooms');
+    const capped=(await boot()).liveRooms.filter(r=>r.tourCode===code).length;assert(capped<=64);
+    await send(flood,pilgrim(code),'joined');flood.close();
+    metrics.rooms={unknownRequests:1001,unknownAllocations:0,knownTourMax:capped,generalJoinStillWorks:true};
+
+    const listener=await open();await poll(listener,pilgrim(code));
+    const guide=await connect(),guideJoin={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V71 transition guide',audioSourceId:'v71-transition',token};
+    await send(guide,guideJoin,'joined');await send(guide,state(10),'stream-state');
+    await send(guide,{type:'family-subscribe',tourCode:privateCode},'family-state');guide.send(binary(303));
+    await send(guide,{type:'ping',ts:Date.now()},'pong');
+    const stopped=await poll(listener,pilgrim(code));assert(!stopped.messages.some(m=>m.type==='audio-chunk'&&m.seq===303));
+    const room=(await boot()).liveRooms.find(r=>r.tourCode===code&&r.roomId==='genel');
+    assert.equal(room.isLive,false);assert(!room.connectedGuides.some(c=>c.name===guideJoin.name));
+    await send(guide,guideJoin,'joined');await send(guide,state(20),'stream-state');
+    await send(guide,{type:'admin-subscribe',token},'admin-rooms-update');
+    assert(!(await boot()).liveRooms.find(r=>r.tourCode===code&&r.roomId==='genel').connectedGuides.some(c=>c.name===guideJoin.name));
+    await send(guide,pilgrim(code),'joined');const offset=guide.messages.length;
+    await send(privateGuide,state(11,'private delta'),'stream-state');await wait(180);
+    assert(!guide.messages.slice(offset).some(m=>m.type==='admin-rooms-update'));
+    await send(guide,{type:'family-subscribe',tourCode:code},'family-state');await send(guide,pilgrim(privateCode,'hidden'),'joined');
+    const owner=await connect();await send(owner,{...guideJoin,name:'V71 current owner',audioSourceId:'v71-current'},'joined');
+    const afterJoin=guide.messages.length;await send(owner,state(30,'no old family'),'stream-state');await wait(80);
+    assert(!guide.messages.slice(afterJoin).some(m=>m.type==='stream-state'&&m.currentTopic==='no old family'));
+    const family=await connect();await send(family,{type:'family-subscribe',tourCode:code},'family-state');
+    await send(family,{type:'join',role:'guide',tourCode:code,token:'bad'},'auth-error');
+    await send(family,{type:'family-subscribe',tourCode:prefix+'rejected'},'subscription-error');
+    await send(owner,{...state(31,'family preserved'),audioMediaEpoch:30},'stream-state');
+    await until(()=>family.messages.some(m=>m.type==='stream-state'&&m.currentTopic==='family preserved'),'public family intact');
+    const httpTransition=await open(),httpJoin={...guideJoin,roomId:'http-transition',name:'V71 HTTP transition',audioSourceId:'v71-http-transition'};
+    await poll(httpTransition,httpJoin,[state(10)],{token});
+    const familyReply=await poll(httpTransition,{type:'family-subscribe',tourCode:code},[],{token});
+    assert(familyReply.messages.some(m=>m.type==='family-state'));
+    assert(!(await boot()).liveRooms.find(r=>r.tourCode===code&&r.roomId==='http-transition').connectedGuides.some(c=>c.name===httpJoin.name));
+    metrics.transitions={guideToFamilyOldPcm:0,oldGuideCount:0,guideToAdminDetached:true,adminToPilgrimPrivateDelta:0,familyToJoinOldDelta:0,failedElevationFamilyPreserved:true,httpParity:true};
+
+    const shim=fs.readFileSync(path.join(PUBLIC_DIR,'vercel-ws-shim.js'),'utf8'),listenHtml=fs.readFileSync(path.join(PUBLIC_DIR,'dinle.html'),'utf8');
+    const page={...guideJoin,roomId:'handoff',name:'V71 promoted guide',audioSourceId:'v71-promoted'};
+    const handoff=await open();await poll(handoff,page,[state(10)],{token});
+    guideBus=createV66MqttHarness(shim,{SocketClass:Bridge,url,token,fetch:(route,options)=>fetch(baseUrl+route,options)});
+    guideBus.init(page);guideBus.load();Object.assign(guideBus.s,{_relayClientId:handoff.clientId,_relayKey:handoff.relayKey,_inFlight:false});
+    guideBus.s._pilgrimMeta.set('old',{id:'old'});guideBus.s._tryNativeFailback();
+    await until(()=>!guideBus.s._isRelay,'real handoff commit');assert(!guideBus.s._pilgrimMeta.has('old'));
+    const newcomer=await connect(),newAck=await send(newcomer,pilgrim(code,'handoff'),'joined');
+    await until(()=>guideBus.s._pilgrimMeta.has(newAck.clientId),'promoted native trusted snapshot');
+    rx=createV61ListenerHarness(listenHtml,fs.readFileSync(path.join(PUBLIC_DIR,'pcm-player-worklet.js'),'utf8'),Bridge);
+    const rg=rx.g,jobs=new Map();let clock=10000,id=0,moduleAttempts=0,lateResolve,nodes=0;
+    rg.Date=class extends Date{static now(){return clock;}};rg.performance={now:()=>clock};
+    rg.setTimeout=(fn,ms)=>{const key=++id;jobs.set(key,{fn,at:clock+ms});return key;};rg.clearTimeout=key=>jobs.delete(key);
+    rg.rxPlayerWorkletNode=null;rg.rxPlayerWorkletLoading=false;rg.rxLoadToken=0;rg.rxInputNode={};rg.gainNode={};
+    const contexts=[],graphNode=()=>({connect(){},disconnect(){},gain:{value:1},frequency:{value:0},Q:{value:0}});
+    const makeContext=()=>{const ctx={state:'running',currentTime:1,destination:{},close(){this.state='closed';return Promise.resolve();},resume:()=>Promise.resolve(),
+      createBiquadFilter:graphNode,createGain:graphNode,audioWorklet:{addModule(){moduleAttempts++;return moduleAttempts===1?new Promise(r=>lateResolve=r):Promise.resolve();}}};contexts.push(ctx);return ctx;};
+    rg.audioCtx=makeContext();rg.window.AudioContext=class{constructor(){return makeContext();}};
+    Object.assign(rg,{volumeMultiplier:1,isRebuildingAudioEngine:false,lastAudioEngineRebuildAt:0,lastAudioCtxTimeVal:-1,audioCtxStuckCount:0,
+      startBackgroundKeepAliveAudio(){},syncAudioUnlockButtonUi(){}});rg.console.log=()=>{};
+    class RxNode{constructor(ctx){this.context=ctx;nodes++;this.port={postMessage:m=>{if(m.type==='reset')rx.player._reset();else rx.player._push(m);},close(){}};}connect(){}disconnect(){}}
+    rg.window.AudioWorkletNode=RxNode;rg.AudioWorkletNode=RxNode;
+    vm.runInContext(['initRxPlayerWorklet','ensureAudioContext','rebuildPilgrimAudioEngine'].map(n=>v70Pick(listenHtml,n)).join('\n'),rg);
+    const address=new URL(url);rg.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};
+    rg.document.getElementById('tourPinInput').value='7771';rx.connect(code,'handoff');
+    await until(()=>rg.rxAudioMediaEpoch===10,'receiver installed controller');
+    guideBus.s._native.send(binary(800));await until(()=>moduleAttempts===1&&rg.pendingRxFrames.length>0,'pending first PCM');
+    const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
+    const advance=async ms=>{const end=clock+ms;while(true){const item=[...jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;clock=item[1].at;jobs.delete(item[0]);item[1].fn();await tick();}clock=end;await tick();};
+    await advance(3000);assert.equal(rg.rxPlayerWorkletLoading,false);lateResolve();await tick();assert.equal(nodes,0);
+    await advance(1500);assert.equal(nodes,1);assert.equal(moduleAttempts,2);assert(!rx.player.q.has(800));
+    assert.equal(contexts[0].state,'closed');assert.equal(contexts.filter(c=>c.state!=='closed').length,1);
+    guideBus.s._native.send(binary(801));await until(()=>rx.player.q.has(801),'fresh PCM after watchdog');
+    assert.equal(rx.player.q.get(801)[0],3000/32768);
+    const replacement=await connect();await send(replacement,{...page,audioSourceId:'v71-replacement'},'joined');
+    await until(()=>guideBus.s._replaced,'promoted 4009 fence');
+    assert(guideBus.s._closedExplicitly);assert.equal(guideBus.s._pilgrimMeta.size,0);
+    metrics.playerAndHandoff={realCommit:true,trustedSnapshot:true,loadTimeoutMs:3000,lateNodes:0,retryAttempts:2,livePcmAfterRecovery:801,freshContext:true,pcmEqual:true,promotedFence:true,privateCacheAfter4009:0};
+
+    const issuer=await open(),recipient=await open(),mqttJoin={...guideJoin,tourCode:privateCode,roomId:'genel',name:'V71 MQTT issuer',audioSourceId:'v71-mqtt'};
+    await poll(recipient,pilgrim(privateCode));const sent=await poll(issuer,mqttJoin,[state(50),{type:'audio-chunk',seq:707,sampleRate:24000,pcm16:pcm.toString('base64'),audioSourceId:'v71-mqtt',audioMediaEpoch:50,sentAt:Date.now()}],{token});
+    assert(sent.mqttPublications.length>=2);assert(sent.mqttPublications.every(f=>f.expiresAt-f.issuedAt===400));
+    await poll(recipient,pilgrim(privateCode));const proof=sent.mqttPublications.find(f=>f.type==='audio-chunk');
+    const verified=await poll(recipient,pilgrim(privateCode),[],{mqttFrames:[proof]});
+    assert(verified.messages.some(m=>m.type==='audio-chunk'&&m.seq===707&&Buffer.from(m.pcm16,'base64').equals(pcm)));
+    metrics.mqtt={ttlMs:400,verifiedPcm:707,pcmEqual:true};assert.deepEqual(errors,[]);
+    console.log('V71 E2E METRICS '+JSON.stringify(metrics));
+    recordResult('ADIM-3.V71','Real tuple/PIN/principal isolation, unknown-room rejection/cap, atomic native+HTTP transitions, promoted guide handoff/fence, watchdog→fresh PCM and encrypted400ms proof',true);
+    console.log('V71 E2E PASS');
+  }finally{
+    rx?.g.leaveRoom();guideBus?.s.close();
+    for(const socket of sockets)try{socket.terminate();}catch(e){}
+    for(const cap of caps)try{await relay({clientId:cap.clientId,relayKey:cap.relayKey,type:'relay-close',version:56});}catch(e){}
+    for(const value of issued)try{await fetch(baseUrl+'/api/logout',{method:'POST',headers:{Authorization:'Bearer '+value}});}catch(e){}
+    for(const tour of created){const r=await fetch(baseUrl+'/api/tours/'+encodeURIComponent(tour),{method:'DELETE',headers:auth});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -4501,6 +4794,7 @@
     await runStep5V68AudioChecks();
     await runStep5V69AudioChecks();
     await runStep5V70AudioChecks();
+    await runStep5V71AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -311,13 +311,54 @@
 // Live Room State in Memory
 // key: `${tourCode}:${roomId}`
 const liveRooms = new Map();
+const guideDisconnectTimers = new Map(); // Tuple room.key -> Timeout
+
+
+function rysRoomKey(tourCode,roomId='genel'){
+  return JSON.stringify([String(tourCode||'RY-KASIM').toUpperCase().trim(),String(roomId||'genel').trim()]);
+}
+function findRysTour(tourCode){
+  const code=String(tourCode||'RY-KASIM').toUpperCase().trim();
+  return (db.tours||[]).find(t=>String(t.code||'').toUpperCase().trim()===code)||null;
+}
+function isConfiguredRysRoom(room){
+  const tour=findRysTour(room.tourCode);
+  return !!tour&&(room.roomId==='genel'||(tour.rooms||[]).some(r=>String(r.id||'').trim()===room.roomId));
+}
+function dropRysRoom(room){
+  if(room._broadcastTimer){clearTimeout(room._broadcastTimer);room._broadcastTimer=null;}
+  const timer=guideDisconnectTimers.get(room.key);
+  if(timer){clearTimeout(timer);guideDisconnectTimers.delete(room.key);}
+  if(liveRooms.get(room.key)===room)liveRooms.delete(room.key);
+}
+function pruneRysRooms(now=Date.now(),pressureTour=null){
+  for(const room of liveRooms.values()){
+    if(room.clients.size||guideDisconnectTimers.has(room.key)||room._broadcastTimer)continue;
+    const registered=!!findRysTour(room.tourCode),configured=isConfiguredRysRoom(room);
+    const expired=!registered||!configured&&now-(room.idleSince??room.lastUsedAt??now)>=60000;
+    const reclaim=pressureTour&&!configured&&(room.tourCode===pressureTour||liveRooms.size>=2048);
+    if(expired||reclaim)dropRysRoom(room);
+  }
+}
+function commitRysSubscription(ctx,type){
+  // Called only after authorization, PIN, registry and target identity validation.
+  ctx.ws.isAdmin=false;ctx.ws.familyTourCode=null;
+  if(type!=='join'&&ctx.currentRoom){
+    const previous=ctx.currentRoom;ctx.currentRoom=null;
+    removeClientFromRoom(previous,ctx.clientId,0);
+  }
+}
 
 function getOrCreateRoom(tourCode, roomId = 'genel') {
   const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
   const rId = String(roomId || 'genel').trim();
-  const key = `${code}:${rId}`;
+  const key=rysRoomKey(code,rId),tour=findRysTour(code),now=Date.now();
+  if(!tour)return null;
   if (!liveRooms.has(key)) {
-    const tour = db.tours.find((t) => t.code === code) || db.tours[0];
+    // 64 rooms/tour and 2048 globally; active rooms and pending guide grace are never evicted.
+    const count=()=>Array.from(liveRooms.values()).filter(r=>r.tourCode===code).length;
+    if(liveRooms.size>=2048||count()>=64)pruneRysRooms(now,code);
+    if(liveRooms.size>=2048||count()>=64)return null;
     liveRooms.set(key, {
       key,
       tourCode: code,
@@ -333,10 +374,12 @@
           : 'Kâbe-i Muazzama Tavaf Duaları & Siyer-i Nebi Sohbeti',
       activeTawafStage: null,
       guideLocation: null,
+      lastUsedAt:now,idleSince:now,
       clients: new Map() // clientId -> { ws, id, role, name, phone, lang, joinedAt }
     });
   }
-  return liveRooms.get(key);
+  const room=liveRooms.get(key);room.lastUsedAt=now;
+  return room;
 }
 
 // Initialize default rooms
@@ -368,6 +411,7 @@
 }
 
 function serializeRoom(room, includePilgrimDetails = true) {
+  if(!room)return null;
   let pilgrimCount = 0;
   const pilgrims = [];
   const guides = [];
@@ -505,7 +549,7 @@
   }
 }
 
-const guideDisconnectTimers = new Map(); // room.key -> Timeout
+
 
 // Auth Constants & Helpers (Rehber Yayını & Acente Paneli Yetkili Girişi — .env Üzerinden Yönetilir)
 const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || 'ridvanyilmazturizm@gmail.com').trim().toLowerCase();
@@ -663,8 +707,9 @@
   const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
   const encrypted=Buffer.concat([cipher.update(JSON.stringify(body),'utf8'),cipher.final()]);
   const sealed={iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),data:encrypted.toString('base64')};
+  const issuedAt=Date.now();
   const frame=JSON.parse(JSON.stringify({version:70,issuer:session.clientId,tourCode:room.tourCode,roomId:room.roomId,
-    topic:rysMqttTopic(room.tourCode,room.roomId),issuedAt:Date.now(),expiresAt:Date.now()+400,
+    topic:rysMqttTopic(room.tourCode,room.roomId),issuedAt,expiresAt:issuedAt+400,
     nonce:crypto.randomBytes(12).toString('hex'),
     grant:crypto.createHmac('sha256',AUTH_TOKEN_VALUE).update('rys-grant70:'+session.rysAuthToken).digest('hex'),
     source:room.audioSourceId||null,
@@ -794,8 +839,8 @@
 function evaluateTourGuidePresence(tourCode) {
   const code = String(tourCode || 'RY-KASIM').toUpperCase().trim();
   const genelRoom = getOrCreateRoom(code, 'genel');
-  const genelHasGuide = Array.from(genelRoom.clients.values()).some((c) => c.role === 'guide');
-  if (!genelHasGuide && genelRoom.isLive) {
+  const genelHasGuide = !!genelRoom&&Array.from(genelRoom.clients.values()).some((c) => c.role === 'guide');
+  if (!genelHasGuide && genelRoom?.isLive) {
     genelRoom.isLive = false;
     genelRoom.broadcastMode = 'idle';genelRoom.audioStateKnown=true;genelRoom.audioStateEnded=true;
     broadcastToFamilyTrackers(code, {
@@ -854,6 +899,7 @@
   if (!room) return;
   const prevClient = room.clients.get(clientId);
   room.clients.delete(clientId);
+  if(!room.clients.size)room.idleSince=Date.now();
   if (room.activePublisherClientId === clientId) {
     room.activePublisherClientId = null;
   }
@@ -884,7 +930,7 @@
     !room.isLive &&
     !(db.tours || []).some((t) => String(t.code || '').toUpperCase() === String(room.tourCode || '').toUpperCase())
   ) {
-    liveRooms.delete(room.key);
+    dropRysRoom(room);
     return;
   }
 
@@ -1037,6 +1083,13 @@
   const principal=rysPrincipal(ctx.rysAuthToken||ctx.rysHandshakeToken);
   const isAuthedClient=!!principal;
   ws.isAuthenticated=isAuthedClient;ctx.isAuthenticated=isAuthedClient;
+  // Application heartbeat belongs to the connection, including family/admin subscriptions.
+  if(msg.type==='ping'){
+    if(ws.readyState===WebSocket.OPEN&&!ws.isHttpRelay){
+      try{ws.send(JSON.stringify({type:'pong',ts:Date.now(),echoTs:msg.ts||null}));}catch(e){}
+    }
+    return;
+  }
 
   if (msg.type === 'admin-subscribe') {
     if (!rysCanAdmin(principal)) {
@@ -1044,6 +1097,7 @@
       ws.send(JSON.stringify({ type: 'auth-error', message: 'Acente paneli aboneliği için yetkili oturum gereklidir.' }));
       return;
     }
+    commitRysSubscription(ctx,'admin-subscribe');
     ws.isAdmin = true;
     sendRysSubscriptionAck(ctx, {
         type: 'admin-rooms-update',
@@ -1056,8 +1110,13 @@
 
   if (msg.type === 'family-subscribe') {
     const tourCode = String(msg.tourCode || 'RY-KASIM').toUpperCase().trim();
+    const room = getOrCreateRoom(tourCode, 'genel');
+    if(!room){ws.send(JSON.stringify({type:'subscription-error',code:'room-unavailable'}));return;}
+    if(room.tourCode!==tourCode||room.roomId!=='genel'){
+      ws.send(JSON.stringify({type:'subscription-error',code:'room-identity-mismatch'}));return;
+    }
+    commitRysSubscription(ctx,'family-subscribe');
     ws.familyTourCode = tourCode;
-    const room = getOrCreateRoom(tourCode, 'genel');
     const steps = getTourSteps(tourCode);
     sendRysSubscriptionAck(ctx, {
         type: 'family-state',
@@ -1078,7 +1137,8 @@
     const tourCode = String(msg.tourCode || 'RY-KASIM').toUpperCase().trim();
     const roomId = String(msg.roomId || 'genel').trim();
     const role = msg.role === 'guide' ? 'guide' : 'pilgrim';
-    const matchedTour = (db.tours || []).find((t) => String(t.code || '').toUpperCase() === tourCode);
+    const matchedTour=findRysTour(tourCode);
+    if(!matchedTour){ws.send(JSON.stringify({type:'subscription-error',code:'tour-unknown'}));return;}
     if (
       role !== 'guide' &&
       !rysCanGuide(principal,tourCode) &&
@@ -1092,6 +1152,12 @@
     }
     const prevRoom = ctx.currentRoom;
     const targetRoom = getOrCreateRoom(tourCode, roomId);
+    if(!targetRoom){ws.send(JSON.stringify({type:'subscription-error',code:'room-unavailable'}));return;}
+    if(targetRoom.tourCode!==tourCode||targetRoom.roomId!==roomId||
+      role==='guide'&&!rysCanGuide(principal,targetRoom.tourCode)){
+      ws.send(JSON.stringify({type:'auth-error',message:'Oda kimliği ve yetki kapsamı eşleşmiyor.'}));return;
+    }
+    commitRysSubscription(ctx,'join');
     ctx.currentRoom = targetRoom;
     const deviceId = msg.deviceId ? String(msg.deviceId).trim() : '';
     const previousClient=prevRoom===targetRoom?targetRoom.clients.get(clientId):null;
@@ -1362,14 +1428,6 @@
       break;
     }
 
-    case 'ping': {
-      if (ws && ws.readyState === WebSocket.OPEN && !ws.isHttpRelay) {
-        try {
-          ws.send(JSON.stringify({ type: 'pong', ts: Date.now(), echoTs: msg.ts || null }));
-        } catch {}
-      }
-      break;
-    }
   }
 }
 
@@ -1529,7 +1587,7 @@
 
 // 30-Second Ping/Pong Heartbeat to prune zombie/dropped connections from mobile networks
 const heartbeatTimer = setInterval(() => {
-  cleanupStaleRelaySessions();
+  cleanupStaleRelaySessions();pruneRysRooms();
   wss.clients.forEach((ws) => {
     if(ws.rysAuthContext&&!refreshRysNativeAuth(ws.rysAuthContext))return;
     if (ws.isAlive === false) {
@@ -1662,11 +1720,12 @@
   const principal=rysPrincipal(token),authed=!!principal;
   if(request.type==='admin-subscribe'&&!rysCanAdmin(principal))return 'scope-required';
   if(request.type==='join'&&request.role==='guide'&&!rysCanGuide(principal,request.tourCode))return 'scope-required';
+  if(request.type!=='admin-subscribe'&&!findRysTour(request.tourCode))return 'tour-unknown';
   if(authed)ctx.rysAuthToken=String(token).trim();
   ctx.isAuthenticated=authed;ctx.ws.isAuthenticated=authed;
   if((request.type==='admin-subscribe'||request.type==='join'&&request.role==='guide')&&!authed)
     return 'auth-required';
-  if(request.type==='join'&&request.role!=='guide'&&!authed){
+  if(request.type==='join'&&request.role!=='guide'&&!rysCanGuide(principal,request.tourCode)){
     const code=String(request.tourCode||'RY-KASIM').toUpperCase().trim();
     const tour=(db.tours||[]).find(t=>String(t.code||'').toUpperCase()===code);
     if(tour?.pinProtected&&tour.pin&&String(tour.pin).trim()!==String(request.pin||'').trim())
@@ -1828,18 +1887,13 @@
     return true;
   }
   if(context.type!=='family-subscribe'&&context.type!=='admin-subscribe')return false;
-  if(session.currentRoom){
-    const old=session.currentRoom;session.currentRoom=null;
-    removeClientFromRoom(old,session.clientId,0);
-  }
   if(context.type==='admin-subscribe'){
-    session.ws.familyTourCode=null;
-    if(!session.ws.isAdmin)processClientJsonMessage(session,context);
-    return !!session.ws.isAdmin;
+    if(!session.ws.isAdmin||session.currentRoom||session.ws.familyTourCode)processClientJsonMessage(session,context);
+    return !!session.ws.isAdmin&&!session.currentRoom&&!session.ws.familyTourCode;
   }
   const code=String(context.tourCode||'RY-KASIM').toUpperCase().trim();
-  session.ws.isAdmin=false;
-  if(session.ws.familyTourCode!==code)processClientJsonMessage(session,{...context,tourCode:code});
+  if(session.ws.familyTourCode!==code||session.currentRoom||session.ws.isAdmin)
+    processClientJsonMessage(session,{...context,tourCode:code});
   return session.ws.familyTourCode===code;
 }
 
@@ -1880,7 +1934,7 @@
     return res.status(401).json({error:'relay-auth-required'});
   }
   if(!syncRysRelayContext(session,context)){
-    const errors=drainRysRelaySession(session).filter(m=>m.type==='pin-error'||m.type==='auth-error');
+    const errors=drainRysRelaySession(session).filter(m=>m.type==='pin-error'||m.type==='auth-error'||m.type==='subscription-error');
     return res.json({clientId:session.clientId,messages:errors.length?errors:
       [{type:'pin-error',message:'Kafile/oda katılımı reddedildi; PIN ve yetkiyi kontrol edin.'}]});
   }
@@ -2132,7 +2186,9 @@
       message: 'Bu kafile odası PIN korumalıdır. Lütfen geçerli PIN kodunu giriniz.'
     });
   }
-  const roomState = serializeRoom(getOrCreateRoom(tour.code, 'genel'), false);
+  const allocatedRoom=getOrCreateRoom(tour.code,'genel');
+  if(!allocatedRoom)return res.status(503).json({success:false,error:'room-capacity'});
+  const roomState=serializeRoom(allocatedRoom,false);
   const steps = getTourSteps(tour.code);
   const stats = computeJourneyStats(steps);
   return res.json({
@@ -2293,7 +2349,7 @@
     }
     for (const [key, room] of liveRooms.entries()) {
       if (room.tourCode === deletedCode) {
-        liveRooms.delete(key);
+        dropRysRoom(room);
       }
     }
   }
@@ -2332,7 +2388,12 @@
   const tour = isRequestAuthenticated(req) ? rawTour : sanitizeTourForPublic(rawTour);
   const steps = getTourSteps(code);
   const stats = computeJourneyStats(steps);
-  const room = serializeRoom(getOrCreateRoom(code, 'genel'), false);
+  const allocatedRoom=getOrCreateRoom(code,'genel');
+  if(!allocatedRoom){
+    if(findRysTour(code))return res.status(503).json({success:false,error:'room-capacity'});
+    return res.json({success:false,error:'tour-unknown',tour:null,steps:[],stats:computeJourneyStats([]),room:null,announcements:[]});
+  }
+  const room=serializeRoom(allocatedRoom,false);
   const announcements = db.announcements.filter((a) => a.tourCode === code || a.tourCode === 'ALL');
   return res.json({
     success: true,
```
