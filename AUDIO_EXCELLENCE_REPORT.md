# RıdvanSes v61 — v60 Uygulama ve Ses Oturumu Sınırları Denetimi

**9 Kasım 2026. Taban HEAD: f64caa236acef7924d4a8d6a7b6890b22138e65c.** Yalnız bu rapor yazılır. Kaynaklar/stage/commit/deploy değiştirilmez. Önceden silinmiş AUDIT_FIX_SUMMARY.md ve AUDIT_REPORT.md korunur.

## 1. v60 uygulama ve regresyon özeti

Önceki raporun v60 unified diff'i için **git apply --reverse --check --ignore-space-change -:exit0**. **node scripts/verify-system.js:38/38 PASS,exit0**; ADIM-3.V60 ve ADIM-5.V60 dahil. git show --stat HEAD,istenen12 kaynak dosyası ile raporu gösteriyor:13 dosyalık commit'in13'üncüsü AUDIO_EXCELLENCE_REPORT.md'dir. Başlangıç git status yalnız kullanıcıya ait iki silmeyi gösteriyordu.

v60 açıklamasıyla gerçek kod bu kez eşleşiyor: RysOutputFir mevcut ve pre-Hermite _pull'a bağlı; düşük çıkış testleri var. İptal edilen getUserMedia sonucu, eski heal ticket/preview ve güncel mute/profil kontrolleri mevcut. Fakat bunlar aşağıdaki bağımsız dinleyici/soket ve de-click kusurlarını kapsamadığı için38 test tek başına eksiksizlik kanıtı değildir.

| v60 maddesi | Gerçek disk konumu | Doğrulama / bu tur durumu |
|---|---|---|
|P2-59-08 | pcm-player-worklet.js:12–30,123–126,230–234,329–333; verify:2368–2501 |193-tap output FIR,8/16kHz ton reddi ve reset/starvation temizliği mevcut; PASS. |
|P1-60-01 | rehber.html:1635–1720,1884–1948,2003–2018 | Generation/job sahipliği, izin sonrası güncellik ve stop öncelikli donanım bırakma mevcut;17 lifecycle kontrolü PASS. |
|P2-60-02 | rehber.html:1506–1545,1635–1750,1792–1882 | Yerel graph commit, callback kimliği, heal ticket ve eski preview koruması mevcut; PASS. Soket callback'leri ayrı bir sınırdır, P2-61-01'de ele alınır. |
|P2-60-03 | rehber.html:1721–1750 | Force pending bayrağı/cooldown ayrımı ve heal sırasında yeni force korunumu mevcut; PASS. |
|P2-60-04 | rehber.html:1506–1514; pcm-capture-worklet.js:223–244 | Stop kontrol mesajı, handler/port temizliği, process→false mevcut; PASS. Bu gerçek cihazda30dk heap ölçümü değildir. |
|P2-60-05 | rehber.html:1792–1882 | Preview24kHz AudioBuffer, sahiplik/temizlik ve ölçüm kapsamını doğru belirten UI mevcut; PASS. |

**Karar: Gerçek P2 kusurları var; v61 gereklidir.** Kozmetik yama veya “0 P0/0 P1/0 P2, Kâbe sahası onaylı” hükmü üretilmez. Aşağıdaki tek diff üç kök neden ailesini kapatır ve yeni ADIM-3.V61/ADIM-5.V61 kontrollerini ekler.

## 2. Kanıtlı kalan kusurlar — v60 disk satırları

### P2-61-01 — Eski soket/Blob ve reconnect yeni ses oturumunu etkileyebiliyor

public/dinle.html:1180–1229,1352–1363,2494–2507; rehber.html:733–815. Dinleyici eski soketin yalnız onclose/onerror'ını temizliyor; onopen/onmessage ve özellikle Blob.arrayBuffer() Promise'i iptal edilmiyor. Callback'ler global ws kullanıyor. Eski close'un daha önce kurulmuş timer'ı da yeni bağlantıyı kapatabilir. Rehber soketinde aynı sahiplik eksikliği var. Mikrofonun v60 generation koruması bu WebSocket callback'lerini kapsamaz.

**Deterministik gerçek fonksiyon tekrar üretimi:** A odasında Blob dönüşü bekliyor → leaveRoom → B odası → B'den seq10 kabulü → A'nın seq9000 Blob'u dönüyor. v60 player expected9000,q=[9000],resync1; B'nin seq10 paketi yeni ankordan çıkarılıyor. Bu yalnız varsayımsal timer değildir: gerçek onmessage içindeki await/Promise sınırı çalıştırıldı. Yanlış odadan kısa ses veya rebuffer/PLC kopması oluşturabilir.

v61: Callback/timer yalnız yakaladığı socket hâlâ global ws ise etkili. Eski bütün handler'lar bırakılır. Yeni bağlantıda main/worklet kuyruğu resetlenir. stopAllActiveSources delivery epoch'u ilerletir; bekleyen Blob sonucu hem socket hem epoch değişmemişse kabul edilir. Böylece leave/yeniden katılma, pause/rebuild veya stream-state false arada gerçekleşmişse eski Blob kuyruklandıramaz. Aynı yardımcı Node ve tarayıcı soket modelleriyle sınanır.

### P2-61-02 — Kanal kimliği yayın kaynağı/seq dönemi kimliği değildir

server.js:370–428,1017–1038,1120–1148,1265–1310; dinle.html:1239–1283; pcm-player-worklet.js:157–168. guidePeerId kanal adıdır; aynı odadaki yeni rehber/yenilenen rehber sayfası aynı kanal kimliğini kullanabilir. Player eski expected'a göre daha küçük seq'yi late sayar. İlk yeni paket source kontrolü olmadan eski kuyrukla karışır; seq başından kaynak değişimini güvenilir çıkarmak mümkün değildir. Genel kanal→bağımsız alt rehber→genel devrinde de kaynak sınırı gerekir.

v61: Rehber sayfası bir audioSourceId üretir ve join'e koyar; mikrofon heal/oda geçişi/HTTP-native handoff boyunca bu sayfa kimliği korunur, sayfa yenilenince değişir. Eski istemci source göndermiyorsa sunucu bağlantı clientId'sine düşer. Sunucu bunu yalnız doğrulanmış guide üyeliğinden alır; ilk PCM veya guide-stream-state true öncesinde hedef odalara audio-source kontrolü yollar, room metadata'sına da ekler. İstemci farklı source gördüğünde queue/seq anchor'ını resetler; aynı source tekrarında reset yapmaz.972B binary başlık/PCM,seq mod2^31 ve coalescer formatı değişmez.

MQTT room-state/stream-state de aynı rehber sayfa kimliğini taşır; HTTP/native ile karşılıklı source flip'i üretecek ayrı broker kimliği kullanılmaz. Yeni kimlik128 karakter ve güvenli ASCII sınıfıyla nested handoff bağlamında da doğrulanır; subscription digest'e katılır. Kısmi aynı-oda/rol metadata güncellemesinde korunur; başka role/odaya eski kimlik kendiliğinden devredilmez. Bu kaynak kimliği bir yetkilendirme sırrı değildir. Public MQTT'nin mevcut kimlik/ACL zafiyeti bu değişiklikle çözülmez.

Legacy rehberde sayfa source kimliği olmadığı için bağlantı değişimi bir source değişimi sayılıp kısa yeniden ön tamponlama doğurabilir. Yeni istemcilerde aynı sayfanın bağlantı/handoff değişiminde kimlik sabittir. Karma eski/yeni sürümlerde yeni metadata'nın mevcut olması garanti edilmediğinden bütün kaynak değişimleri için garanti verilmez; birlikte dağıtım gerekir.

### P2-61-03 — Reset fade sonrası sessizlikten eski genliğe sıçrama

public/pcm-player-worklet.js:123–154,190–197,253–274. _reset,lastOut'u eski son örnekte tutuyor. !playing dalı çıkışı5ms cosine ile sıfıra düşürüyor ama lastOut/tail'i gerçek çıkışla güncellemiyor. Ön tamponlama bitince _startBlend eski lastOut'u tekrar ilk örneğe koyuyor.

**Ölçüm:** +0.20 sabit PCM oynat → reset →30ms sessizlik →-0.20 yeni PCM.8/16/24/44.1/48kHz'in hepsinde gerçek önceki çıkış0 iken ilk restart örneği≈0.200000003. Bu-13.98dBFS büyüklükte tek örnek sınır sıçramasıdır; RMS ses seviyesi veya fiziksel dBA değildir. RX HP bunu dalga sınırından silmez; geçici bileşen/tık üretme riski vardır.

v61: !playing fade'in her örneğinde gerçek lastOut ve tail ring güncellenir; _startBlend gerçekten son çalınan örnekten başlar. Sıfırlama/yeniden başlatma/starvation beş çıkış hızında sınanır. FIR ve PLC matematiği değişmez. Sabit DC fixture'da düşük hız FIR'in band-sınırlı basamak cevabındaki iç türev ile hatalı ilk örnek sıçraması ayrı raporlanır; bütün maxStep değerleri sıfırmış gibi sunulmaz.

## 3. Derin zincir denetimi ve kapsam sınırları

**Capture:** RysCaptureKernel,8/16/24/44.1/48kHz'i24kHz'e193-tap/256-faz polyphase sinc FIR ile dönüştürür; capture resampler Hermite değildir. Hermite dinleyicinin kesintisiz output resampler'ındadır.24kHz girişin2 saniyede100×480 örnek ürettiği bu tur ayrıca test edilir; diğer dört hızın DC/alias/128==2048 kontrolleri korunur. RysNearExpander400ms kalibrasyon,4s minima,10ms lookahead,240ms hold,3ms attack/120ms release; comfort fade ve±0.98 limiter değişmez. ADC/Bluetooth codec kırpılması yazılımla geri getirilemez. Tek kanal gate rehber kimliği ayıramaz; yumuşak ünsüz/uzun kıraat ile ortam bastırma arasında gerçek tradeoff sürer.

**Mikrofon yaşam döngüsü:** v60 setup/stop/heal/preview/demo ve fallback kurulumları17 kontrolüyle tekrar geçer. Context state/capture stall,muted/ended,devicechange ve module/import sınırları incelendi. Bu tur bu mikrofon transaction'ında yeni bir hata tekrar üretilmedi. İzin penceresi tarayıcı API'since iptal edilemediği için geç gelen iz durdurulur. ScriptProcessor yalnız rehber capture fallback'idir; dinleyicide aktif PCM ScriptProcessor fallback bulunmaz. Dinleyici Worklet olmayan tarayıcılar destek kapsamı dışındadır.

**Player:** RysOutputFir<24kHz'te193 tap,4ms group delay;24/44.1/48 bypass. Hermite fazı paketler arası sürekli; modulo2^31 dedup,sıralama,80–260ms jitter hedefi,60ms pitch-PLC decay ve300ms starvation sonrası restart korunur. catchup target+120ms üzerinde500ms kalırsa frame sınırında target+40ms'e trim ve72 örnek geçiş uygular; kaybolan/atlanan fonemi üretemez. Yeni source kontrolü aynı kanalın başka seq dönemine geçmesini açıkça işaretler. Dinle audioCtx/rxLoadToken/node callback ve await sonrası dinleme/leave kontrolü korunur; yeni socket fence bunları tamamlar.

**Sunucu/taşıma:** İstekteki slowWsCount,MAX_WS_BUFFERED_BYTES,MAX_AUDIO_CHUNKS_PER_POLL sembolleri bu sürümde yok. Gerçek sınırlar rysSendAudio:binary soft9720B≈200ms,JSON16000B,hard>65536B;2s soft tıkanmada yalnız o peer kapanır. _rysAudioDrops/_rysCongestedAt ölçülür. HTTP outbox audio10/200ms,control64; shim audio4 batch/200ms,control64. /api/ws-relay100ms single-flight kısa poll'dur; bekletilen long-poll değildir. Native tek Buffer,HTTP tek base64/DTO; kaynağa yeni kontrol yalnız source değişiminde yollanır. Per-paket source karşılaştırması oda başına O(1); alıcı başına PCM kopyası eklenmez.

**Rotalama:** Genel kanal kendi rehberi bulunmayan odaları kapsar; bağımsız guide varlığı canlı/idle olmasından bağımsız hedefi dışlar (mevcut davranış). Dedicated guide ayrılınca genel PCM tekrar hedefe girer; room state devri2.5s grace sonrası tamamlanır. v61 E2E genel/kadinlar/cocuk/siyer ve native+HTTP ile bu devri sınar. Normal PIN/rol yetkileri,5000 bucket sınırı,doğru katılım1200/IP/dk ve yanlış deneme60/IP/dk korunur. Native/handoff atomik commit/fence ve35s relay expiry eski testleri korunur; V56 gerçek guide handoff'a yeni source kimliği sabitliği assertion'ı eklenir.

**Kapasite ve saha:**300 native dinleyici972×50×300=116.64Mbit/s salt uygulama egress'i; base64 PCM≥153.6Mbit/s.300 HTTP fallback hızlı100ms poll'da~3000 req/s üretebilir. Yerel300 native testi300 HTTP kapasitesini veya VDS/CDN/proxy kotalarını kanıtlamaz. RAM oda/handoff state tek süreç/instance varsayar; Vercel instance'ları ortak RAM paylaşmaz. Üretim relay için tutarlı VDS/paylaşımlı state ve yetkili özel broker gereksinimi sürer.

**Koşulsuz vaat verilmez:** İşletim sistemi ekran kilidi/arama sırasında context ve Worker'ı durdurabilir; WakeLock/sessiz keepalive arka plan ses yetkisi değildir. Resume dokunuş isteyebilir. AEC isteği başka telefonun50–400ms gecikmiş hoparlörüne senkron referans sağlamaz; tam kalabalık izolasyonu ve çapraz cihaz echo için fiziksel mikrofon/kulaklık ve saha kayıtları gerekir. [Media Capture](https://www.w3.org/TR/mediacapture-streams/) ve [Web Audio](https://www.w3.org/TR/webaudio/) bu API sınırlarının birincil kaynaklarıdır. Public MQTT'de istemciden üretilebilen imza ACL/SLA değildir; farklı broker/bağlantılardan gelen eski kontrolün global sırasını source UUID tek başına kanıtlamaz. Bu sınırlamalar için sahada sıfır kopma/0P1 güvenlik sertifikası çıkarılmaz.

## 4. Test ve uygulama düzeni

- Disk v60:38/38 ve reverse-check0.
- ADIM-5.V61: Eski socket/open/message/close/timer/Blob,leave/yeni oda,aynı-socket stop epoch'u,kaynak devri,düşük seq ve sarım;guide stale callback/retry;beş hızda reset/starvation ilk örnek ve maxStep;24kHz capture;source schema/digest/MQTT parity ve cache. Gerçek kaynak fonksiyonları kontrollü VM zamanlayıcısı ile çalıştırılır; cihaz UI/radyo modeli değildir.
- ADIM-3.V61: Gerçek localhost native/HTTP: dört oda,genel/dedicated/genel devri,aynı kanal+düşük seq,bağlantı yenilenmesinde sabit source,seq sarımı,isLive:false,PIN reddi vePCM bayt eşitliği. Mevcut gerçek300 dinleyici testi ayrıca korunur. Yeni toplam40 test beklenir.
- Aday yalnız raporun gerçek diff'i diskten yeniden çıkarılarak bellekte uygulanır; testlerin raporu okuması engellenir. JS node --check stdin veHTML vm.Script ardından tam localhost suite çalışır. Disk kaynakları değişmez; runtime.json ana testin snapshot mekanizmasıyla geri yüklenir.
- Diff'i UTF-8/LF v61.patch'e çıkarın; taban SHA'yı ve git apply --check --ignore-space-change v61.patch sonucunu kontrol ettikten sonra staging'e uygulayın. Bu denetim kaynaklara uygulamaz.
- SW cache61/HTML shim?v61/player?v61-audio birlikte güncellenir. Capture?v60-audio değişmez. Oturumu açık eski sekmeler yeniden açılmalıdır. Önce40 test,sonra30dk cihaz/roaming/kilit/arama/WhatsApp/USB-Bluetooth ve300 native+ayrı300 HTTP soak ölçümleri gerekir.

## 5. v61 unified diff

```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -419,6 +419,7 @@
     currentTopic: room.currentTopic,
     activeTawafStage: room.activeTawafStage || null,
     guidePeerId: room.guidePeerId || null,
+    audioSourceId:room.audioSourceId||null,
     guideLocation: room.guideLocation || null,
     connectedPilgrims: pilgrims,
     connectedGuides: guides,
@@ -462,6 +463,13 @@
     }
     else {try{socket.send(data);}catch(e){}}
   }
+}
+
+// v61: source identity is control metadata; the 972-byte PCM wire format is unchanged.
+function setRysAudioSource(room,sourceId){
+  if(room.audioSourceId===sourceId)return;
+  room.audioSourceId=sourceId;
+  broadcastToRoom(room,{type:'audio-source',audioSourceId:sourceId});
 }
 
 function broadcastToGuidesInTour(tourCode, payload) {
@@ -679,6 +687,7 @@
       r.currentTopic = genelRoom.currentTopic;
       r.guidePeerId = genelRoom.guidePeerId || null;
       r.guideName = genelRoom.guideName;
+      setRysAudioSource(r,genelRoom.audioSourceId||null);
       broadcastToRoom(r, {
         type: 'stream-state',
         isLive: r.isLive,
@@ -947,10 +956,12 @@
     const targetRoom = getOrCreateRoom(tourCode, roomId);
     ctx.currentRoom = targetRoom;
     const deviceId = msg.deviceId ? String(msg.deviceId).trim() : '';
+    const previousSource=prevRoom===targetRoom?targetRoom.clients.get(clientId)?.audioSourceId:null;
     const clientObj = {
       ws,
       id: clientId,
       deviceId,
+      audioSourceId:role==='guide'?(msg.audioSourceId||previousSource||clientId):null,
       role,
       name: msg.name || (role === 'guide' ? 'Ömer Ali Gültekin' : `Hacı Misafir #${clientSeq++}`),
       phone: msg.phone || '',
@@ -1026,6 +1037,7 @@
         if (r.isLive) {
           if (!wasLive || !r.startedAt) r.startedAt = Date.now();
           r.activePublisherClientId = clientId;
+          setRysAudioSource(r,sender.audioSourceId||clientId);
         } else if (!r.activePublisherClientId || r.activePublisherClientId === clientId) {
           r.activePublisherClientId = null;
         }
@@ -1143,6 +1155,7 @@
         sentAt: msg.sentAt || Date.now()
       });
       for (const r of getTargetBroadcastRooms(currentRoom)) {
+        setRysAudioSource(r,sender.audioSourceId||clientId);
         broadcastToRoom(r, serializedAudio, ws, true);
       }
       break;
@@ -1232,6 +1245,8 @@
           const next=value[key];
           if(next===undefined)continue; // Internal GET DTOs may contain omitted optional fields.
           if(strings.has(key)&&next!==null&&typeof next!=='string')return false;
+          if(key==='audioSourceId'&&next!==null&&(typeof next!=='string'||next.length>128||
+            !(/^[a-zA-Z0-9_.-]*$/).test(next)))return false;
           pending.push({value:next,depth:depth+1});
         }
       }else return false;
@@ -1283,6 +1298,7 @@
       let fallbackPayload = null;
 
       for (const r of getTargetBroadcastRooms(ctx.currentRoom)) {
+        setRysAudioSource(r,sender.audioSourceId||ctx.clientId);
         for (const peer of r.clients.values()) {
           if (peer.ws === ws || peer.ws.readyState !== WebSocket.OPEN) continue;
           if (!peer.ws.isHttpRelay) {
@@ -1449,7 +1465,7 @@
     String(m.roomId||'genel').trim(),m.role==='guide'?'guide':'pilgrim',
     m.name||'',m.deviceId===undefined?null:String(m.deviceId).trim(),
     m.phone===undefined?null:m.phone,m.lang===undefined?null:m.lang,
-    m.pin===undefined?null:String(m.pin),m.token||''
+    m.pin===undefined?null:String(m.pin),m.token||'',m.audioSourceId||null
   ])).digest('hex');
 }
 function sendRysSubscriptionAck(ctx,payload){
@@ -1501,7 +1517,7 @@
         const previous=source.currentRoom?.clients.get(source.clientId);
         if(!previous){fail('source-not-joined');return true;}
         request.name=request.name||previous.name;
-        for(const key of ['deviceId','phone','lang'])
+        for(const key of ['deviceId','phone','lang','audioSourceId'])
           if(request[key]===undefined)request[key]=previous[key];
       }
     }
@@ -1566,6 +1582,7 @@
   const metadataMatches=()=>{
     const c=session.currentRoom?.clients.get(session.clientId);if(!c)return false;
     if(joinContext.name&&c.name!==joinContext.name)return false;
+    if(role==='guide'&&joinContext.audioSourceId&&c.audioSourceId!==joinContext.audioSourceId)return false;
     for(const key of ['deviceId','phone','lang']){
       if(joinContext[key]===undefined)continue;
       const wanted=key==='lang'?(joinContext.lang||'tr'):
@@ -1583,7 +1600,8 @@
       name:joinContext.name||previous.name,
       deviceId:joinContext.deviceId===undefined?previous.deviceId:joinContext.deviceId,
       phone:joinContext.phone===undefined?previous.phone:joinContext.phone,
-      lang:joinContext.lang===undefined?previous.lang:joinContext.lang
+      lang:joinContext.lang===undefined?previous.lang:joinContext.lang,
+      audioSourceId:joinContext.audioSourceId===undefined?previous.audioSourceId:joinContext.audioSourceId
     }:joinContext;
     processClientJsonMessage(session,effective);
   }
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -580,6 +580,7 @@
   await runV58InputChecks({baseUrl,url:wsUrl,token:authToken});
   await runV59FanoutChecks({baseUrl,url:wsUrl,token:authToken});
   await runV60AudioRoundTrip({baseUrl,url:wsUrl,token:authToken});
+  await runV61SessionChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1531,9 +1532,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v60"));assert(sw.includes('/vercel-ws-shim.js?v=60'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v61"));assert(sw.includes('/vercel-ws-shim.js?v=61'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'60',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'61',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -1668,7 +1669,7 @@
     return s.messages.find(m=>m.type==='handoff-committed');
   };
   const media=seq=>({type:'audio-chunk',seq,sentAt:Date.now(),sampleRate:24000,pcm16:Buffer.alloc(960).toString('base64')});
-  const guide={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V56 guide '+stamp,deviceId:'v56-guide-'+stamp,token};
+  const guide={type:'join',role:'guide',tourCode:code,roomId:'genel',name:'V56 guide '+stamp,deviceId:'v56-guide-'+stamp,audioSourceId:'v56-page-'+stamp,token};
   const pilgrim={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',name:'V56 listener',deviceId:'v56-listener-'+stamp,pin:'1453'};
   const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
   try{
@@ -1693,9 +1694,12 @@
     assert(changed.messages.some(m=>m.type==='handoff-error'&&m.code==='context-changed'));changed.ws.close();
     await post({...source,token,subscriptionContext:guide,messages:[{type:'guide-stream-state',isLive:true,broadcastMode:'mic'}]});
     // Commit is the server's linearization point. Every late old request is fenced.
-    const native=await socket(),id=await prepare(native,source,guide);
+    const partialGuide={...guide};delete partialGuide.audioSourceId;
+    await post({...source,token,subscriptionContext:partialGuide,messages:[]});
+    const native=await socket(),id=await prepare(native,source,partialGuide);
     const committed=await commit(native,id);assert.equal(committed?.ack?.type,'joined');
     assert.equal(committed.ack.room.connectedGuides.length,1);
+    assert.equal(committed.ack.room.audioSourceId,guide.audioSourceId,'Guide page source must survive HTTP/native handoff');
     for(let n=0;n<3;n++){
       const late=await post({...source,token,subscriptionContext:guide,messages:[media(10+n)]});
       assert.equal(late.status,409);assert.equal(late.error,'relay-session-retired');
@@ -1707,7 +1711,10 @@
     assert.equal((await post({type:'relay-close',version:56,...source})).status,200);
     const binary=Buffer.alloc(972);binary.writeUInt32LE(3,0);binary.writeDoubleLE(Date.now(),4);
     native.ws.send(binary);await new Promise(r=>setTimeout(r,25));
-    assert((await post({...listener,subscriptionContext:pilgrim})).messages.some(m=>m.type==='audio-chunk'&&m.seq===3));
+    const afterHandoff=await post({...listener,subscriptionContext:pilgrim});
+    assert(afterHandoff.messages.some(m=>m.type==='audio-chunk'&&m.seq===3));
+    assert(!afterHandoff.messages.some(m=>m.type==='audio-source'&&m.audioSourceId!==guide.audioSourceId),
+      'Omitted source identity must be inherited from this same HTTP membership at commit');
     assert(!native.closed(),'Late relay request must not terminate the native socket');
     assert.equal((await post({clientId:source.clientId,relayKey:'g'.repeat(48)})).status,401);
     assert.equal((await post({clientId:source.clientId,relayKey:'ğ'.repeat(48)})).status,401);
@@ -2310,7 +2317,7 @@
   rateBox.Date.now=()=>60000;limiter({...req,ip:'fresh'},response,()=>admitted++);assert.equal(admitted,2);
   assert(server.includes('rysSendAudio(peer.ws,fallbackPayload,false)'));
   assert(!server.includes('fallbackJsonStr'));
-  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=60-audio'));
+  assert(read('public/sw.js').includes('pcm-player-worklet.js?v=61-audio'));
   assert(read('public/sw.js').includes('pcm-capture-worklet.js?v=60-audio'));
   recordResult('ADIM-5.V59','8/16/44.1/48k DSP; FIR rejection; DC/limiter/partition; PLC/jitter/catchup; mic mute/retry; gain ramps; bounded CGNAT buckets',true);
   console.log('V59 DSP METRICS '+JSON.stringify({rates:dsp,fixture200HzMaxStep:+maxStep.toFixed(6),concealedSamples:p.stats.concealed}));
@@ -2492,9 +2499,9 @@
     p.rxFir.r.fill(1);p.playing=true;p.expected=0;p.missing=15;
     p.process([],[[new Float32Array(128)]]);assert(!p.playing);assert(p.rxFir.r.every(x=>x===0));
   }
-  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v60'));
-  for(const asset of ['pcm-player-worklet.js?v=60-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
-  assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=60-audio'));
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v61'));
+  for(const asset of ['pcm-player-worklet.js?v=61-audio','pcm-capture-worklet.js?v=60-audio'])assert(sw.includes(asset));
+  assert(guide.includes('pcm-capture-worklet.js?v=60-audio'));assert(read('public/dinle.html').includes('pcm-player-worklet.js?v=61-audio'));
   console.log('V60 UNIT METRICS '+JSON.stringify({lifecycleChecks:checks,alias}));
   recordResult('ADIM-5.V60','Low-rate player anti-alias; source/reset/starvation; guide permission/module/preview/heal races; explicit capture shutdown; cache60',true);
   console.log('V60 UNIT PASS');
@@ -2571,6 +2578,221 @@
   }
 }
 
+function createV61ListenerHarness(source,playerSource,SocketClass){
+  const assert=require('node:assert/strict');
+  function pick(name){const m=new RegExp('^[ \\t]*(?:async )?function '+name+'\\(','m').exec(source);if(!m)return '';
+    for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){const text=source.slice(m.index,end+1);
+      try{new vm.Script(text);return text;}catch(e){if(e.name!=='SyntaxError')throw e;}}throw Error('V61 missing '+name);}
+  const box={Float32Array,Float64Array,Math,Number,sampleRate:48000,
+    AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(n,P)=>box.P=P};
+  vm.createContext(box);vm.runInContext(playerSource,box);const player=new box.P(),sockets=[],jobs=[],elements=new Map(),ui=[];
+  class FakeSocket{static OPEN=1;static CONNECTING=0;static CLOSED=3;constructor(){this.readyState=0;this.sent=[];sockets.push(this);}send(raw){this.sent.push(raw);}close(){this.readyState=3;}}
+  class DeferredBlob{constructor(){this.promise=new Promise(resolve=>this.resolve=resolve);}arrayBuffer(){return this.promise;}}
+  const element=id=>{if(!elements.has(id))elements.set(id,{value:id==='roomSelect'?'genel':'6061',style:{},classList:{remove(){},add(){},contains(){return true;}}});return elements.get(id);};
+  const noop=()=>{};
+  const g={WebSocket:SocketClass||FakeSocket,ws:null,intentionalLeave:false,isAudioListening:true,
+    currentTour:{code:'A'},currentLang:'tr',pilgrimDeviceId:'v61-device',pendingRxFrames:[],rxAudioDeliveryEpoch:0,rxAudioSourceId:null,
+    rxPlayerWorkletNode:{port:{postMessage:m=>{if(m.type==='reset')player._reset();else if(m.type==='push')player._push(m);}}},
+    audioCtx:{state:'running',currentTime:1,resume:async()=>{}},activeScheduledSources:[],nextAudioTime:0,lastHwEndSample:0,rxHermiteHist:null,rxHermitePos:0,
+    lastReceivedAudioSeq:0,lastPacketReceivedAt:0,lastRawChunkAt:0,lastPacketReceivedAt:0,rxFallbackSubSeq:0,
+    window:{location:{protocol:'http:',host:'localhost'},ryGetDynamicChannelId:(tour,room)=>tour+'/'+room},
+    document:{getElementById:element,querySelector:()=>null},navigator:{geolocation:{clearWatch(){}}},gpsWatchId:null,
+    I18N:{tr:{}},Blob:DeferredBlob,ArrayBuffer,DataView,Float32Array,Math,Number,Boolean,Date,performance,
+    setTimeout:(fn,ms)=>{const j={fn,ms,cancelled:false};jobs.push(j);return j;},clearTimeout:j=>{if(j)j.cancelled=true;},
+    atob:s=>Buffer.from(s,'base64').toString('binary'),console:{error(){},warn(){}},
+    pilgrimAudioGuardChannel:null,pilgrimUmrahMap:null,ensureAudioContext:noop,forceResurrectPilgrimAudio:noop,
+    updatePilgrimConnectionUi:x=>ui.push(x),updateGuideSpeakingIndicator:noop,animateSpectrumFromLevel:noop,
+    renderGuideLiveLocation:noop,renderLiveTawafStage:noop,renderAnnouncements:noop,renderPrayers:noop,renderPilgrimJourney:noop,
+    showAppToast:noop,playGentleHarmonyNote:noop,prependAnnouncement:noop,playNotificationChime:noop,sendServiceWorkerNotification:noop,
+    stopBackgroundKeepAliveAudio:noop,releaseWakeLock:noop};
+  vm.createContext(g);vm.runInContext(['updateRxAudioSource','stopAllActiveSources','flushPendingRxFrames','playPcmSamples',
+    'handleBinaryAudioFrame','connectWebSocket','leaveRoom'].map(pick).join('\n'),g);
+  const packet=(seq,value=.1)=>{const b=new ArrayBuffer(972),v=new DataView(b);v.setUint32(0,seq,true);v.setFloat64(4,Date.now(),true);
+    for(let i=0;i<480;i++)v.setInt16(12+i*2,Math.round(value*32767),true);return b;};
+  const connect=(tour='A',room='genel')=>{g.intentionalLeave=false;g.isAudioListening=true;g.currentTour={code:tour};
+    g.connectWebSocket(tour,room,'V61 listener','');const s=g.ws;if(!SocketClass){s.readyState=1;s.onopen();}return s;};
+  const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
+  return {g,player,sockets,jobs,ui,packet,connect,tick,DeferredBlob,assert};
+}
+
+
+async function runStep5V61AudioChecks(){
+  const assert=require('node:assert/strict'),read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const listener=read('public/dinle.html'),guide=read('public/rehber.html'),player=read('public/pcm-player-worklet.js'),server=read('server.js'),shim=read('public/vercel-ws-shim.js');
+  function pick(source,name,kind='function'){
+    const m=new RegExp('^[ \\t]*'+(kind==='function'?'(?:async )?function ':'(?:async )?')+name+'\\([^\\n]*\\)\\s*\\{','m').exec(source);
+    assert(m,'V61 missing '+name);for(let end=source.indexOf('}',m.index);end>=0;end=source.indexOf('}',end+1)){
+      const text=source.slice(m.index,end+1);try{new vm.Script(kind==='method'?'class Probe{'+text+'}':text);return text;}catch(e){if(e.name!=='SyntaxError')throw e;}
+    }throw Error('V61 unterminated '+name);
+  }
+  const checks=[];
+  {
+    const h=createV61ListenerHarness(listener,player),a=h.connect('A'),oldOpen=a.onopen,oldMessage=a.onmessage,oldClose=a.onclose;
+    const pending=new h.DeferredBlob();a.onmessage({data:pending});h.g.leaveRoom();const b=h.connect('B');b.onmessage({data:h.packet(10)});
+    const epoch=h.g.rxAudioDeliveryEpoch,jobs=h.jobs.length,sends=b.sent.length;
+    oldOpen();oldMessage({data:JSON.stringify({type:'stream-state',isLive:false})});oldClose();pending.resolve(h.packet(9000));await h.tick();
+    assert.deepEqual(Array.from(h.player.q.keys()),[10]);assert.equal(h.player.expected,10);assert.equal(h.player.stats.resync,0);
+    assert.equal(h.g.rxAudioDeliveryEpoch,epoch);assert.equal(h.jobs.length,jobs);assert.equal(b.sent.length,sends);
+    assert.equal(a.onopen,null);assert.equal(a.onmessage,null);checks.push('old-socket-open-message-close-and-Blob-fenced');
+    b.onclose();const timer=h.jobs.at(-1);h.connect('C');const current=h.g.ws;timer.fn();assert.equal(h.g.ws,current);
+    checks.push('queued-reconnect-cannot-close-new-socket');
+  }
+  {
+    const h=createV61ListenerHarness(listener,player),s=h.connect(),pending=new h.DeferredBlob();s.onmessage({data:pending});
+    s.onmessage({data:JSON.stringify({type:'stream-state',isLive:false})});pending.resolve(h.packet(9000));await h.tick();
+    assert.equal(h.player.q.size,0);assert.equal(h.player.expected,null);checks.push('stop-event-invalidates-inflight-Blob');
+    s.onmessage({data:JSON.stringify({type:'stream-state',isLive:true,broadcastMode:'mic'})});s.onmessage({data:h.packet(40)});
+    assert(h.player.q.has(40));
+  }
+  {
+    const h=createV61ListenerHarness(listener,player),s=h.connect();s.onmessage({data:JSON.stringify({type:'audio-source',audioSourceId:'old'})});
+    s.onmessage({data:h.packet(1000)});h.player.playing=true;
+    s.onmessage({data:JSON.stringify({type:'room-state',room:{audioSourceId:'new',guidePeerId:'same-channel'}})});
+    s.onmessage({data:h.packet(10)});assert.deepEqual(Array.from(h.player.q.keys()),[10]);
+    const epoch=h.g.rxAudioDeliveryEpoch;s.onmessage({data:JSON.stringify({type:'audio-source',audioSourceId:'new'})});assert.equal(h.g.rxAudioDeliveryEpoch,epoch);
+    s.onmessage({data:JSON.stringify({type:'audio-source',audioSourceId:'wrap'})});
+    s.onmessage({data:h.packet(0x7fffffff)});s.onmessage({data:h.packet(0)});
+    assert.deepEqual(Array.from(h.player.q.keys()),[0x7fffffff,0]);checks.push('source-handover-lower-seq-idempotence-and-wrap');
+  }
+  {
+    const h=createV61ListenerHarness(listener,player),s=h.connect();s.onmessage({data:h.packet(1000)});h.player.playing=true;
+    const b=h.connect('B');b.onmessage({data:h.packet(10)});assert.deepEqual(Array.from(h.player.q.keys()),[10]);checks.push('connect-discards-old-main-and-worklet-timeline');
+  }
+  {
+    const base=createV61ListenerHarness(listener,player),jobs=[],g={ws:null,guideWsReconnectTimer:null,isMicBroadcasting:true,isDemoBroadcasting:false,
+      window:{location:{protocol:'http:',host:'localhost'}},WebSocket:base.g.WebSocket,Blob:base.DeferredBlob,joined:0,rendered:0,
+      sendGuideJoinAndSync:()=>{g.joined++;g.ws.send('join');},renderRoomState:()=>g.rendered++,
+      setTimeout:fn=>{const job={fn};jobs.push(job);return job;},clearTimeout(){},console:{warn(){},error(){}}};
+    vm.createContext(g);vm.runInContext(pick(guide,'connectGuideWs'),g);g.connectGuideWs();const a=g.ws,open=a.onopen,message=a.onmessage,close=a.onclose;
+    g.connectGuideWs();const b=g.ws;open();message({data:JSON.stringify({type:'room-state',room:{}})});close();
+    assert.equal(g.joined,0);assert.equal(g.rendered,0);assert.equal(jobs.length,0);assert.equal(a.onmessage,null);
+    b.onclose();const timer=jobs.at(-1);g.connectGuideWs();const c=g.ws;timer.fn();assert.equal(g.ws,c);checks.push('guide-socket-and-retry-ownership');
+  }
+  const reset=[];
+  for(const rate of [8000,16000,24000,44100,48000]){
+    const box={Float32Array,Float64Array,Math,Number,sampleRate:rate,
+      AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(n,P)=>box.P=P};
+    vm.createContext(box);vm.runInContext(player,box);const p=new box.P();
+    const push=(base,value)=>{for(let i=0;i<12;i++)p._push({seq:base+i,arrival:(base+i)*20,samples:new Float32Array(480).fill(value)});};
+    const render=seconds=>{let last=0,max=0;for(let n=0;n<Math.ceil(rate*seconds/128);n++){
+      const block=new Float32Array(128);p.process([],[[block]]);for(const y of block){assert(Number.isFinite(y));max=Math.max(max,Math.abs(y-last));last=y;}}
+      return {last,max};};
+    push(0,.2);render(.1);p.port.onmessage({data:{type:'reset'}});render(.03);assert(Math.abs(p.lastOut)<1e-8);
+    push(100,-.2);const block=new Float32Array(128);p.process([],[[block]]);const first=Math.abs(block[0]);assert(first<1e-7,'restart must begin at actual silence '+rate+' '+first);
+    let maxStep=0,previous=0;for(const y of block){maxStep=Math.max(maxStep,Math.abs(y-previous));previous=y;}
+    assert(maxStep<.15,'reset fade contains a discontinuity '+rate+' '+maxStep);
+    render(1);assert(!p.playing);assert(Math.abs(p.lastOut)<1e-8);push(1000,.2);const next=new Float32Array(128);p.process([],[[next]]);assert(Math.abs(next[0])<1e-7);
+    reset.push({rate,firstAfterReset:first,maxStep:+maxStep.toFixed(6),firstAfterStarvation:Math.abs(next[0])});
+  }
+  const captureBox={Float32Array,Float64Array,Math,Number};vm.createContext(captureBox);
+  vm.runInContext(read('public/pcm-capture-worklet.js').replace(/^export .*$/mg,''),captureBox);
+  const frames=[],kernel=new captureBox.RysCaptureKernel(24000,{continuousSpeech:true,comfortFade:false},m=>frames.push(m));
+  kernel.process(Float32Array.from({length:48000},(_,i)=>.2+.2*Math.sin(2*Math.PI*997*i/24000)));
+  assert.equal(frames.length,100);assert(frames.every(m=>m.samples.length===480&&m.samples.every(Number.isFinite)));checks.push('24k-input-exact-frames');
+  {
+    const sent=[],room={},g={crypto:require('node:crypto'),broadcastToRoom:(r,m)=>sent.push(m)};vm.createContext(g);
+    vm.runInContext(['setRysAudioSource','isRysClientMessage','digestRysSubscription'].map(n=>pick(server,n)).join('\n'),g);
+    g.setRysAudioSource(room,'page-a');g.setRysAudioSource(room,'page-a');g.setRysAudioSource(room,'page-b');assert.equal(sent.length,2);
+    assert(g.isRysClientMessage({type:'join',audioSourceId:'audio-page-1'}));assert(!g.isRysClientMessage({type:'join',audioSourceId:{}}));
+    assert(!g.isRysClientMessage({type:'join',audioSourceId:'x'.repeat(129)}));
+    assert(!g.isRysClientMessage({type:'handoff-prepare',subscription:{type:'join',audioSourceId:{}}}));
+    assert.notEqual(g.digestRysSubscription({type:'join',audioSourceId:'a'}),g.digestRysSubscription({type:'join',audioSourceId:'b'}));
+    checks.push('source-schema-control-idempotence-and-handoff-digest');
+  }
+  {
+    const methods=['send','_broadcastP2PRoomState'].map(n=>pick(shim,n,'method')).join('\n'),published=[],timers=[];
+    const g={Date,Math,ArrayBuffer,window:{ryGetDynamicChannelId:()=> 'same-channel'},setTimeout:fn=>{timers.push(fn);return 1;}};
+    vm.createContext(g);vm.runInContext('class Probe{'+methods+'}\nglobalThis.P=Probe;',g);
+    const p=new g.P();Object.assign(p,{readyState:1,_isRelay:true,_inFlight:true,_joinContext:{role:'guide',tourCode:'T',roomId:'genel',audioSourceId:'stable-page'},
+      _publishMqtt:m=>published.push(m),_deliverIncomingMessage(){},_enqueueRelayMessage:()=>true,_busConnected:()=>true,_pilgrimMeta:new Map()});
+    p.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));timers.at(-1)();
+    assert(published.filter(m=>['room-state','stream-state'].includes(m.type)).every(m=>(m.audioSourceId||m.room?.audioSourceId)==='stable-page'));
+    checks.push('MQTT-room-and-stream-source-parity');
+  }
+  const sw=read('public/sw.js');assert(sw.includes('ridvanses-pwa-v61'));assert(sw.includes('pcm-player-worklet.js?v=61-audio'));
+  assert(sw.includes('pcm-capture-worklet.js?v=60-audio'));
+  console.log('V61 UNIT METRICS '+JSON.stringify({checks,reset,capture24kFrames:frames.length}));
+  recordResult('ADIM-5.V61','Socket/Blob/retry/source ownership; 5-rate reset/starvation de-click; 24k capture; source schema/digest/MQTT; cache61',true);
+  console.log('V61 UNIT PASS');
+}
+
+
+async function runV61SessionChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
+  const code='RY-V61-'+Date.now().toString(36).toUpperCase(),headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
+  const sockets=[],controls=[],received=new Map(),httpMessages=[],errors=[];let h,session,created=false;
+  const until=async(test,timeout=5000)=>{const end=Date.now()+timeout;while(!test()){
+    if(Date.now()>end)throw Error('V61 E2E deadline');await new Promise(r=>setTimeout(r,5));}};
+  const post=async body=>{const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
+  const poll=async()=>{const data=await post({...session,subscriptionContext:{type:'join',role:'pilgrim',tourCode:code,roomId:'siyer',pin:'6061',name:'V61 HTTP'}});
+    httpMessages.push(...(data.messages||[]));};
+  const connect=async(key,join)=>{const socket=new WebSocket(url),messages=[];sockets.push(socket);received.set(key,[]);
+    socket.on('error',e=>errors.push(e.message));socket.on('message',(raw,binary)=>{
+      if(binary)received.get(key).push(Buffer.from(raw));else try{messages.push(JSON.parse(raw.toString()));}catch(e){errors.push('bad JSON');}});
+    await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
+    socket.send(JSON.stringify({type:'join',tourCode:code,roomId:'genel',pin:'6061',...join}));
+    await until(()=>messages.some(m=>m.type==='joined'||m.type==='pin-error'));return {socket,messages};};
+  const binary=(seq,value=.1)=>{const b=Buffer.alloc(972);b.writeUInt32LE(seq,0);b.writeDoubleLE(Date.now(),4);
+    for(let i=0;i<480;i++)b.writeInt16LE(Math.round(value*32767),12+i*2);return b;};
+  class Bridge{
+    static OPEN=1;static CONNECTING=0;static CLOSED=3;
+    constructor(address){this.real=new WebSocket(address);sockets.push(this.real);
+      this.real.on('open',()=>this.onopen?.({}));this.real.on('close',()=>this.onclose?.({}));
+      this.real.on('error',e=>{errors.push(e.message);this.onerror?.(e);});
+      this.real.on('message',(raw,isBinary)=>{
+        if(!isBinary)try{controls.push(JSON.parse(raw.toString()));}catch(e){}
+        const data=isBinary?raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength):raw.toString();this.onmessage?.({data});
+      });}
+    get readyState(){return this.real.readyState;}send(data){this.real.send(data);}close(){this.real.close();}
+  }
+  const state=(socket,extra={})=>socket.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic',guidePeerId:'same-channel',...extra}));
+  const joinG={role:'guide',token,name:'V61 general',deviceId:'v61-general-device',audioSourceId:'page-general'};
+  try{
+    const c=await fetch(baseUrl+'/api/tours',{method:'POST',headers,body:JSON.stringify({code,name:'V61 source/route test',pin:'6061'})});
+    assert.equal(c.status,200);await c.arrayBuffer();created=true;
+    let general=await connect('guide',joinG);
+    for(const room of ['genel','kadinlar','cocuk'])await connect(room,{role:'pilgrim',name:'V61 '+room,deviceId:'v61-'+room,roomId:room});
+    h=createV61ListenerHarness(fs.readFileSync(path.join(ROOT_DIR,'public/dinle.html'),'utf8'),fs.readFileSync(path.join(ROOT_DIR,'public/pcm-player-worklet.js'),'utf8'),Bridge);
+    const address=new URL(url);h.g.window.location={protocol:address.protocol==='wss:'?'https:':'http:',host:address.host};h.connect(code,'siyer');
+    await until(()=>controls.some(m=>m.type==='joined'));
+    const opened=await post({type:'relay-open',version:56});session={clientId:opened.clientId,relayKey:opened.relayKey};await poll();
+    const denied=await connect('bad-pin',{role:'pilgrim',name:'PIN must fail',roomId:'siyer',pin:'wrong'});
+    assert(denied.messages.some(m=>m.type==='pin-error'));
+    state(general.socket,{topic:'General topic'});const first=binary(1000);general.socket.send(first);
+    await until(()=>h.player.q.has(1000)&&['genel','kadinlar','cocuk'].every(r=>received.get(r).length===1));await poll();
+    assert.equal(h.g.rxAudioSourceId,'page-general');
+    const dedicated=await connect('dedicated',{role:'guide',token,name:'V61 dedicated',roomId:'siyer',audioSourceId:'page-dedicated'});
+    state(dedicated.socket,{topic:'Dedicated topic'});dedicated.socket.send(binary(10,-.1));
+    await until(()=>h.player.q.has(10));assert(!h.player.q.has(1000));assert.equal(h.g.rxAudioSourceId,'page-dedicated');await poll();
+    for(const r of ['genel','kadinlar','cocuk'])assert.equal(received.get(r).length,1,'dedicated audio leaked to '+r);
+    const closed=new Promise(resolve=>dedicated.socket.once('close',resolve));dedicated.socket.terminate();await closed;
+    general.socket.send(binary(1001));await until(()=>h.player.q.has(1001)&&h.g.rxAudioSourceId==='page-general');await poll();
+    await until(()=>h.g.document.getElementById('liveTopicText').textContent==='General topic',4000);
+    const epoch=h.g.rxAudioDeliveryEpoch,oldClosed=new Promise(resolve=>general.socket.once('close',resolve));
+    general=await connect('replacement',joinG);await oldClosed;state(general.socket,{topic:'General topic'});general.socket.send(binary(1002));
+    await until(()=>h.player.q.has(1002));assert.equal(h.g.rxAudioDeliveryEpoch,epoch,'same page epoch must survive connection replacement');await poll();
+    general.socket.send(JSON.stringify({type:'join',tourCode:code,roomId:'genel',pin:'6061',...joinG,audioSourceId:'page-wrap'}));
+    state(general.socket);general.socket.send(binary(0x7fffffff));general.socket.send(binary(0));
+    await until(()=>h.player.q.has(0x7fffffff)&&h.player.q.has(0));assert.equal(h.g.rxAudioSourceId,'page-wrap');await poll();
+    general.socket.send(JSON.stringify({type:'guide-stream-state',isLive:false,broadcastMode:'idle'}));await until(()=>h.player.q.size===0);
+    assert.equal(received.get('bad-pin').length,0);assert.deepEqual(errors,[]);
+    const audio=httpMessages.filter(m=>m.type==='audio-chunk');
+    for(const seq of [1000,10,1001,1002,0x7fffffff,0])assert(audio.some(m=>m.seq===seq),'HTTP missing seq '+seq);
+    const expected=new Map([[1000,first],[10,binary(10,-.1)],[1001,binary(1001)],[1002,binary(1002)],[0x7fffffff,binary(0x7fffffff)],[0,binary(0)]]);
+    for(const m of audio)assert(Buffer.from(m.pcm16,'base64').equals(expected.get(m.seq).subarray(12)));
+    const sourceOrder=httpMessages.filter(m=>m.type==='audio-source').map(m=>m.audioSourceId);
+    assert.deepEqual(sourceOrder,['page-general','page-dedicated','page-general','page-wrap']);
+    console.log('V61 E2E METRICS '+JSON.stringify({rooms:4,httpAudioFrames:audio.length,sourceOrder,lowerSeqAccepted:10,
+      stableSourceOnReconnect:true,wrapAccepted:true,stoppedQueue:h.player.q.size,wrongPinAudioFrames:0,pcmEqual:true}));
+    recordResult('ADIM-3.V61','Real native+HTTP: 4 rooms, dedicated/general handover, lower seq, stable page epoch, wrap, stop, PIN and byte parity',true);
+    console.log('V61 E2E PASS');
+  }finally{
+    h?.g.leaveRoom();for(const s of sockets)try{s.terminate();}catch(e){}
+    if(session)try{await post({...session,type:'relay-close'});}catch(e){}
+    if(created){const r=await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers});await r.arrayBuffer();}
+  }
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -2585,6 +2807,7 @@
     await runStep5V58InputChecks();
     await runStep5V59AudioChecks();
     await runStep5V60AudioChecks();
+    await runStep5V61AudioChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=60"></script>
+  <script src="/vercel-ws-shim.js?v=61"></script>
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
-  <script src="/vercel-ws-shim.js?v=60"></script>
+  <script src="/vercel-ws-shim.js?v=61"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -1177,13 +1177,23 @@
       }
     })();
 
+    function updateRxAudioSource(sourceId){
+      if(typeof sourceId!=='string'||!sourceId)return;
+      if(rxAudioSourceId!==null&&rxAudioSourceId!==sourceId){
+        lastReceivedAudioSeq=0;stopAllActiveSources();
+      }
+      rxAudioSourceId=sourceId;
+    }
+
     function connectWebSocket(tourCode, roomId, name, phone) {
       if (window._ryWsReconnectTimeout) {
         clearTimeout(window._ryWsReconnectTimeout);
         window._ryWsReconnectTimeout = null;
       }
+      rxAudioSourceId=null;lastReceivedAudioSeq=0;stopAllActiveSources();
       if (ws) {
         try {
+          ws.onopen=null;ws.onmessage=null;
           ws.onclose = null;
           ws.onerror = null;
           ws.close();
@@ -1194,7 +1204,8 @@
       const wsHost = window.location.host.includes('vercel.app')
         ? 'ses.ridvanyilmazturizm.com'
         : window.location.host;
-      ws = new WebSocket(`${proto}//${wsHost}/ws`);
+      const socket=new WebSocket(`${proto}//${wsHost}/ws`);ws=socket;
+      const current=()=>ws===socket&&!intentionalLeave;
       ws.binaryType = 'arraybuffer';
 
       window.__ryActiveListenerChannelId =
@@ -1203,10 +1214,11 @@
           : `ridvanses-${String(tourCode || 'RY-KASIM').toLowerCase()}-${String(roomId || 'genel').toLowerCase()}-guide-v26`;
 
       ws.onopen = () => {
+        if(!current())return;
         window.__ryPilgrimReconnectAttempts = 0;
         updatePilgrimConnectionUi('connected');
         const currentPin = (document.getElementById('tourPinInput')?.value || '').trim();
-        ws.send(JSON.stringify({
+        socket.send(JSON.stringify({
           type: 'join',
           role: 'pilgrim',
           deviceId: pilgrimDeviceId,
@@ -1220,13 +1232,15 @@
       };
 
       ws.onmessage = (event) => {
+        if(!current())return;
         window.__ryLastServerMsgAt = Date.now();
         if (event.data instanceof ArrayBuffer) {
           handleBinaryAudioFrame(event.data);
           return;
         }
         if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
-          event.data.arrayBuffer().then((buf) => handleBinaryAudioFrame(buf)).catch(() => {});
+          const epoch=rxAudioDeliveryEpoch;
+          event.data.arrayBuffer().then(buf=>{if(current()&&epoch===rxAudioDeliveryEpoch)handleBinaryAudioFrame(buf);}).catch(()=>{});
           return;
         }
         let msg;
@@ -1236,9 +1250,11 @@
           return;
         }
 
+        if(msg.type==='audio-source'){updateRxAudioSource(msg.audioSourceId);return;}
         if (msg.type === 'joined' || msg.type === 'room-state') {
           const r = msg.room;
           if (r) {
+            updateRxAudioSource(r.audioSourceId);
             document.getElementById('liveGuideName').textContent = r.guideName;
             document.getElementById('liveListenerCount').textContent = r.totalListeners;
             document.getElementById('liveTopicText').textContent = r.currentTopic;
@@ -1266,6 +1282,7 @@
         }
 
         if (msg.type === 'stream-state') {
+          updateRxAudioSource(msg.audioSourceId);
           if (msg.currentTopic) {
             document.getElementById('liveTopicText').textContent = msg.currentTopic;
           }
@@ -1350,6 +1367,7 @@
       };
 
       ws.onclose = () => {
+        if(!current())return;
         if (intentionalLeave) return;
         updatePilgrimConnectionUi('reconnecting');
         if (window._ryWsReconnectTimeout) clearTimeout(window._ryWsReconnectTimeout);
@@ -1357,13 +1375,14 @@
         window.__ryPilgrimReconnectAttempts = attempts + 1;
         const retryDelay = Math.min(2500, Math.round(500 * Math.pow(1.5, attempts)));
         window._ryWsReconnectTimeout = setTimeout(() => {
-          if (!intentionalLeave) {
+          if (current()) {
             connectWebSocket(tourCode, roomId, name, phone);
           }
         }, retryDelay);
       };
 
       ws.onerror = (err) => {
+        if(!current())return;
         console.error('Hacı WebSocket hatası:', err);
       };
     }
@@ -1578,6 +1597,7 @@
     let systemInterruptionStartedAt = 0;
     let interruptionRecoveryTimer = null;
     let rxLoadToken = 0;
+    let rxAudioDeliveryEpoch=0,rxAudioSourceId=null;
     const pendingRxFrames = [];
 
     function flushPendingRxFrames() {
@@ -1606,7 +1626,7 @@
       const token = ++rxLoadToken;
       rxPlayerWorkletLoading = true;
       ctx.audioWorklet
-        .addModule('/pcm-player-worklet.js?v=60-audio')
+        .addModule('/pcm-player-worklet.js?v=61-audio')
         .then(() => {
           if (token !== rxLoadToken || audioCtx !== ctx || rxPlayerWorkletNode) return;
           const node = new AudioWorkletNode(ctx, 'rys-pcm-player', {
@@ -1977,6 +1997,7 @@
     const activeScheduledSources = [];
 
     function stopAllActiveSources() {
+      ++rxAudioDeliveryEpoch;
       pendingRxFrames.length = 0;
       if (rxPlayerWorkletNode && rxPlayerWorkletNode.port) {
         try {
@@ -2492,13 +2513,14 @@
     }
 
     function leaveRoom() {
-      intentionalLeave = true;
+      intentionalLeave = true;rxAudioSourceId=null;
       if (window._ryWsReconnectTimeout) {
         clearTimeout(window._ryWsReconnectTimeout);
         window._ryWsReconnectTimeout = null;
       }
       if (ws) {
         try {
+          ws.onopen=null;ws.onmessage=null;
           ws.onclose = null;
           ws.onerror = null;
           ws.close();
@@ -2555,7 +2577,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=60').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=61').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=60"></script>
+  <script src="/vercel-ws-shim.js?v=61"></script>
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
-  <script src="/vercel-ws-shim.js?v=60"></script>
+  <script src="/vercel-ws-shim.js?v=61"></script>
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
-  <script src="/vercel-ws-shim.js?v=60"></script>
+  <script src="/vercel-ws-shim.js?v=61"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
diff --git a/public/pcm-player-worklet.js b/public/pcm-player-worklet.js
--- a/public/pcm-player-worklet.js
+++ b/public/pcm-player-worklet.js
@@ -267,6 +267,9 @@
               ? 0.5 + 0.5 * Math.cos((Math.PI * this.resetFade) / (this.fadeN - 1))
               : 0;
           ch[i] = this.resetFrom * w;
+          this.lastOut=ch[i];
+          this.tail[this.tailPos]=ch[i];
+          this.tailPos=(this.tailPos+1)%this.tail.length;
           this.resetFade++;
         }
         for (let c = 1; c < out.length; c++) out[c].set(ch);
diff --git a/public/rehber.html b/public/rehber.html
--- a/public/rehber.html
+++ b/public/rehber.html
@@ -28,7 +28,7 @@
       window.location.href = '/login?next=/rehber';
     }
   </script>
-  <script src="/vercel-ws-shim.js?v=60"></script>
+  <script src="/vercel-ws-shim.js?v=61"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
     .console-wrap {
@@ -679,6 +679,8 @@
       }
     })();
 
+    const guideAudioSourceId='audio-'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
+
     function sendGuideJoinAndSync() {
       if (!ws || ws.readyState !== WebSocket.OPEN) return;
       const tourCode = document.getElementById('guideTourSelect').value;
@@ -695,6 +697,7 @@
         role: 'guide',
         token: authToken,
         deviceId: guideDeviceId,
+        audioSourceId:guideAudioSourceId,
         tourCode,
         roomId,
         name: guideName,
@@ -737,6 +740,7 @@
       }
       if (ws) {
         try {
+          ws.onopen=null;ws.onmessage=null;
           ws.onclose = null;
           ws.onerror = null;
           ws.close();
@@ -747,13 +751,16 @@
       const wsHost = window.location.host.includes('vercel.app')
         ? 'ses.ridvanyilmazturizm.com'
         : window.location.host;
-      ws = new WebSocket(`${proto}//${wsHost}/ws`);
+      const socket=new WebSocket(`${proto}//${wsHost}/ws`);ws=socket;
+      const current=()=>ws===socket;
 
       ws.onopen = () => {
+        if(!current())return;
         sendGuideJoinAndSync();
       };
 
       ws.onmessage = (ev) => {
+        if(!current())return;
         if (ev.data instanceof Blob) return;
         let msg;
         try {
@@ -802,15 +809,17 @@
       };
 
       ws.onclose = () => {
+        if(!current())return;
         const retryMs = isMicBroadcasting || isDemoBroadcasting ? 600 : 1500;
         console.warn(`Rehber bağlantısı kapandı, ${retryMs} ms içinde otomatik yeniden bağlanılacak...`);
         if (guideWsReconnectTimer) clearTimeout(guideWsReconnectTimer);
         guideWsReconnectTimer = setTimeout(() => {
-          connectGuideWs();
+          if(current())connectGuideWs();
         }, retryMs);
       };
 
       ws.onerror = (e) => {
+        if(!current())return;
         console.error('Rehber WebSocket hatası:', e);
       };
     }
diff --git a/public/rota.html b/public/rota.html
--- a/public/rota.html
+++ b/public/rota.html
@@ -9,7 +9,7 @@
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=60"></script>
+  <script src="/vercel-ws-shim.js?v=61"></script>
   <style>
     .rota-hero-strip {
       background:
diff --git a/public/sw.js b/public/sw.js
--- a/public/sw.js
+++ b/public/sw.js
@@ -1,17 +1,17 @@
 // PATCH: sw-v53
 // PATCH: sw-v53
 // PATCH: sw-v53
-const CACHE_NAME = 'ridvanses-pwa-v60';
+const CACHE_NAME = 'ridvanses-pwa-v61';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=60',
+  '/vercel-ws-shim.js?v=61',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=60-audio',
-  '/pcm-player-worklet.js?v=60-audio',
+  '/pcm-player-worklet.js?v=61-audio',
   '/manifest.json',
   '/icons/icon-512.png',
   '/icons/icon-192.png',
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -574,6 +574,7 @@
         }
         if (
           msg.type === 'room-state' ||
+          msg.type === 'audio-source' ||
           msg.type === 'stream-state' ||
           msg.type === 'tawaf-stage' ||
           msg.type === 'new-announcement' ||
@@ -611,6 +612,7 @@
               : 'Kâbe-i Muazzama Tavaf Duaları & Siyer-i Nebi Sohbeti'),
           activeTawafStage: this._activeTawafStage || null,
           guidePeerId: window.ryGetDynamicChannelId(tourCode, roomId),
+          audioSourceId:this._joinContext.audioSourceId||null,
           guideLocation: this._guideLocation || null,
           connectedPilgrims: pilgrims,
           totalListeners: pilgrims.length,
@@ -785,6 +787,7 @@
             isLive: this._isLive,
             broadcastMode: this._broadcastMode,
             currentTopic: this._currentTopic,
+            audioSourceId:this._joinContext.audioSourceId||null,
             guidePeerId: window.ryGetDynamicChannelId(
               this._joinContext.tourCode || 'RY-KASIM',
               this._joinContext.roomId || 'genel'
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=60"></script>
+  <script src="/vercel-ws-shim.js?v=61"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```

## 6. Son doğrulama ve sayısal sonuçlar

**Raporun gerçek v61 diff'i üzerinden40/40 PASS,exit0.** Aday Node module/fs loader ile yalnız bellekte kuruldu; JS node --check stdin veHTML vm.Script kontrolleriyle birlikte bütün paket geçti. Testlerin AUDIO_EXCELLENCE_REPORT.md okuması engellendi. Diskteki kaynak hâlâ f64caa2/v60 ve38 testtir;40 sonucu uygulanmış/deploy edilmiş bir sürüm iddiası değildir.

### 6.1 v60 ve300 dinleyici regresyonu

| Ölçüm | Disk v60 | Son v61 aday |
|---|---:|---:|
|Toplam |38/38 |40/40 |
|Aynı IP doğru katılım |300/300 |300/300 |
|Gerçek WebSocket |301 |301 |
|Sağlıklı dinleyici / doğru frame |270×120=32,400 |270×120=32,400 |
|Bozuk PCM frame |0 |0 |
|Kontrollü30 slow peer drop |1500 |1500 |
|Hard izole peer |3 |3 |
|P50 send→Node callback |11.17ms |9.51ms |
|P95 |20.06ms |14.76ms |
|P99 |22.48ms |18.44ms |
|Max |27.52ms |36.75ms |
|Event-loop P99 |25.28ms |24.26ms |
|CPU user+system |1561ms |1156ms |
|Yayın fazı |2418.5ms |2418.5ms |

Kısa tek koşuların farkı bir hızlanma/yavaşlama oranı olarak sunulmaz. CPU sunucu+301 istemcinin aynı Node sürecindeki toplamıdır. Latency capture→DAC veya internet değeri değildir.30 slow socket gerçekten duraklatılır; deterministik kuyruk koşulu ayrıca bufferedAmount getter enjeksiyonudur. Doğal TCP tıkanması/RF/300 fiziksel telefon ölçümü değildir.1500 kontrollü drop sağlıklı270 kişide değildir.

### 6.2 Yeni gerçek oda/kaynak E2E

Dört oda: genel,kadinlar,cocuk,siyer. Native dinleyici gerçek dinle.html callback'lerini Node soket adaptörüyle kullanır; ayrıca gerçek HTTP listener var. Source sırası **page-general → page-dedicated → page-general → page-wrap**;HTTP tarafında6 PCM frame (seq1000,10,1001,1002,2147483647,0) ve bütün PCM baytları eşit.

- Aynı guidePeerId/same-channel altında dedicated rehberin daha küçük seq10'u yeni ankorda kabul edildi; eski seq1000 kuyruğu bırakıldı.
- Dedicated ses genel/kadinlar/cocuk'a sızmadı. Ayrılınca genel PCM tekrar siyer'e geldi;2.5s grace sonrası genel topic/room state devri de doğrulandı.
- Aynı rehber sayfa epoch'u ile bağlantı yenilenince source sabit kaldı; gereksiz player reset olmadı. V56 gerçek HTTP/native prepare/commit testi,prepare isteğinde source alanı eksik olduğunda dahi aynı HTTP üyeliğinden kimliğin devralınmasını ve ilk native PCM'de source değişmemesini de sınar ve geçti.
- Yeni source döneminde2147483647→0 kabul edildi. isLive:false sonrası player q.size=0. Yanlış PIN'li native istemci0 ses frame aldı.

Bu test üç sabit bir tonun duyumsal kalitesini değil,routing/source/seq/state ve byte parity'yi ölçer. Yeni E2E altı frame'lik kontrol sınırı testi;300 yük kontrolü eski ayrı testte sürer. Public broker kesintisi ve karma eski istemci saha kapasitesi bu sonuçla onaylanmaz.

### 6.3 Eski Blob ve reset tıklaması karşılaştırması

| Tekrar üretim | v60 | v61 aday |
|---|---|---|
|A'dan bekleyen Blob,leave,B seq10,A seq9000 sonucu | expected9000,q[9000],resync1 | expected10,q[10],resync0 |
|Eski socket onopen/message/close ve reconnect timer | Güncel socket/UI/kuyruğa etki edebilir | Kimlik denetiminde etkisiz; eski handler'lar bırakılır |
|Aynı socket'te stop'tan önce başlayan Blob | Stop sonrası tekrar ses kuyruğuna girebilir | Delivery epoch değiştiği için atılır |
|Eski source / yeni source daha küçük seq | Eski expected ile late/yeniden tamponlama riski | Açık source değişiminde reset; tekrarlanan aynı source idempotent |

Reset fixture:+0.20 PCM → reset →30ms sessizlik →-0.20 PCM. v60'ın bütün hızlarda yeniden başlayan ilk örneği≈0.200000003,gerçek önceki çıkış0. v61 sonuçları:

| ÇıkışHz | İlk restart sıçraması | Yeni ilk128 örnekte maxStep | Starvation sonrası ilk örnek |
|---|---:|---:|---:|
|8000 |0 |0.130492 |0 |
|16000 |0 |0.145227 |0 |
|24000 |0 |0.002640 |0 |
|44100 |0 |0.001428 |0 |
|48000 |0 |0.001314 |0 |

**maxStep sütunu sıfır değildir.**8/16kHz'teki yüksek iç adım, bu yapay DC işaret değişiminin4ms group-delay'li FIR basamak cevabını da içerir; hatalı ilk örneğin sessizlikten eski lastOut'a sıçramasıyla aynı ölçüm değildir. İlk restart örneği0 koşulu ve bütün128 örnek için bu fixture'a özel<0.15 sınırı ayrı assertion'lardır. DC sabit test konuşma veya fiziksel click/pop sertifikası değildir; bütün sesler için maxStep<0.15 genellemesi yapılmaz. Mevcut200Hz jitter/PLC fixture0.007356 maxStep ve iki eksik paket için960 kaynak örnek PLC ile tekrar geçti.

24kHz capture girişinde2s→100×480 örnek,sonlu çıkış. v60'ın diğer dört giriş hızı/128==2048/DC/limiter kontrolleri ve output8/16kHz alias ölçümleri de korunarak geçti. Output6kHz/8kHz reddi-114.02dB,10kHz/16kHz reddi-127.11dB; Nyquist yakını8kHz/4080Hz -76.56dB. Seçilmiş ton reddi tüm frekans/fazlar için alt sınır garantisi değildir.

### 6.4 Artefakt ve çalışma ağacı bütünlüğü

- Tek v61 diff,**13 hedef dosya**: server.js,scripts/verify-system.js,vercel-ws-shim.js,pcm-player-worklet.js,sw.js ve sekiz HTML. Capture worklet matematiği/kodu değiştirilmez; capture URL60-audio korunur.
- **git apply --check -** ve **git apply --check --ignore-space-change -**:exit0. Patch UTF-8/LF; boş context satırının tek boşluk prefix'i unified diff formatındandır.
- Başlangıç15 kaynak dosyasının SHA-256'sı kontrol edildi:**0 fark**. HEAD f64caa236acef7924d4a8d6a7b6890b22138e65c değişmedi. Yalnız AUDIO_EXCELLENCE_REPORT.md güncellendi; iki önceden silinmiş rapor aynen kaldı.

**Nihai karar:** v60 eksiksiz uygulanmış ve kendi38 regresyonunu geçmiştir. Bu tur üç P2 kök neden ailesi kanıtlandığı için0 kusur/saha hazır onayı verilmez. v61,bu somut socket/source/reset kusurlarını kapatan,rapordaki diff'i test edilmiş40/40 PASS staging adayıdır. Fiziksel akustik,OS kesintisi,public MQTT ACL/sıralama ve300 HTTP fallback kapasitesi için bölüm4'teki saha kabulü sürer; “Kâbe'de300 kişi,sıfır cızırtı/sıfır kopma” garantisi verilmez.

<!-- SOURCE-HASHES {"server.js":"d71033560fb172e2ffe53a2b2049f20e717bb64ab7c62ed1fdcd24c93fecc669","scripts/verify-system.js":"0d3df4d0e644f7493a3ddd1da4aab8b66ff0151d2e0a144a7c024693e28d14c6","public/ani-kitabi.html":"f5907dbd74747015793c1fe08d3dcf8d5427361b721b18de42d9123e97b4689b","public/dinle.html":"985a7e661fc3ca9108ea72f3d5e6c14a8c88cdcf6257982ebaf1d9fe8ea0d4d8","public/index.html":"8c676b3ab1316a72be2f3d28435905aac216f4f2a31437e9187a357cbf05809c","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"5427f32f76f3ef1ae45bbdaef5204e8ba824f4fd7196be74266a4bff5fd235c9","public/panel.html":"c8dee853faac99d0bd60dc85b19cd3a998072230a76c2b2256fbf2572e337d90","public/pcm-capture-worklet.js":"30340ea62d03b35c3239220460cb48176d1005fb18efbea05c4c06d8d6e6911a","public/pcm-player-worklet.js":"a4a74d105f3c72bba01d7ffa3de4d7a5270064a6b137442879ba76c1d9eead94","public/rehber.html":"3090bc93a8567771fcf1bfcb0d1090cdc134c067fcfa1cf4c3bbf331ee7270d9","public/rota.html":"2f41de10c2311879dbad14d1b0dba563e6cb51b80c1fd9599d0678a29b8cc909","public/sw.js":"cfca0676a93afe15d09ddee1169ade135940963e1ba8de4de0796c2f176b6812","public/vercel-ws-shim.js":"33831bb515dcec2932c2060f67882cc2a1e720c14f1726dde8ff2b410a962d6f","public/yaka-karti.html":"d0d99a03b826531d5f1b263d2cd3f93906980672b4798bb1d37c2ea06ae9209c"} -->
