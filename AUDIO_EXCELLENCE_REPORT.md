# RıdvanSes v56 — Uygulama doğrulaması, rota izolasyonu ve oturum temizliği

**Tarih:** 8 Kasım 2026  
**İncelenen HEAD:** `3fcb087574d87b0515b5236ece094bf7ee8d3bcd`  
**Teslim sınırı:** Yalnız `AUDIO_EXCELLENCE_REPORT.md` güncellenir. Kaynak dosyaları değiştirilmez.

**Karar:** v56 yaması önceki raporla birebir eşleşiyor; doğrudan diskten **30/30 PASS + V53/V54/V55 PASS + V56 E2E/UNIT PASS, exit0**. P1-03 atomik devir düzeltmesi yeni protokolün tanımlı kapsamındaki testlerden geçiyor. Bununla birlikte iki ek açık kusur doğrulandı: **P1: HTTP açılışı sırasında kafile değişince eski sesin yeni kafileye yönelmesi**, **P2: v56 oturumlarının sessiz dönemde temizlenmemesi ve süresi aşılmış kaydın yeniden etkinleşmesi**. Bu yüzden tüm aktarım yolları için koşulsuz nihai onay verilmez. Aşağıdaki dar kapsamlı v57 önerisi kaynaklara yazılmadan **32/32 PASS, exit0** ile doğrulandı.

## 1. Disk doğrulaması ve v56 diff eşliği

Çalıştırıldı:

```powershell
node scripts/verify-system.js
```

Gözlenen ilgili son çıktı:

```text
V53 PASS: source-only DSP/SRC/comfort/profile, queue/PLC/seq, binary+JSON dedup, coalescer, congestion, HTTP single-flight/drain/close, gesture/wake/pause
V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs
V55 PASS: partial name/phone/lang/device preservation; broker-connected empty HTTP poll; mixed native PCM; family/admin deltas
V56 E2E PASS: prepare has no membership side effect; committed source fenced; late requests cannot kill native
V56 UNIT PASS: expired/revoked prepare has no side effects; lost ACK recovers with fresh HTTP ID; no source-ID resurrection
TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: 30 / 30 [BAŞARILI / PASS]
```

Çıkış kodu **0**. 18 JS dosyası ve 9 HTML içindeki 10 inline script kontrolü geçti. Önceki raporun v56 unified diff’i kaynaklara uygulanmadan `git apply --reverse --check --ignore-space-change -` ile sınandı: **exit0**. Önceki 12 kaynak değişikliği diskte mevcut; uygulama eksikliği saptanmadı.

İnceleme başında zaten silinmiş görünen `AUDIT_FIX_SUMMARY.md` ve `AUDIT_REPORT.md` korunur. Yerel test paketinin runtime.json değişiklikleri paket sonunda snapshot ile geri alınır.

## 2. Onaylanan v56 davranışları

| Alan | Gerçek kaynak / doğrulanan sonuç |
|---|---|
| Yan etkisiz HTTP açılışı | server.js:1347–1351; relay-open oda üyeliği veya ses/kontrol işlemez |
| Özel HTTP oturumu | server.js:1363–1376; rys56-ID +192 bit anahtar; yanlış anahtar401, bilinmeyen ID409; anahtar URL’den alınmaz |
| Prepare/commit | server.js:1409–1482; prepare üyeliği bozmaz; commit kaynak revision/üyelik ve güncel yetki/PIN’i kontrol eder |
| Eski kaynak engeli | server.js:1455–1476; başarılı commit sonrası eski HTTP409; silinen yeni-biçim ID yeniden yaratılmaz |
| Commit tekrarı | Cached ACK döner; ikinci join/broadcast yapılmaz |
| İstemci hata kurtarması | public/vercel-ws-shim.js:294–377; kayıp ACK’de eski ID kullanılmaz, yeni HTTP oturumuyla toparlanır |
| Açılış/probe yarışı | Kaynak yokken prepare başlarsa eski relay-open iptal edilir; geç açılış cevabı üyelik başlatamaz |
| MQTT bağımsızlığı | API kapalıyken MQTT ses yolu açık kalır; API gereksinimi MQTT’yi kilitlemez |
| Kimlik/kontrol eşliği | v55 name/phone/lang/deviceId korunumu,6 boş-poll kombinasyonu, family/admin güncellemeleri PASS |
| Cache | Sekiz giriş shim56, SW cache56 ve dinle SW register56; değişmeyen worklet URL’leri53-audio |
| DSP | Capture/player bu commit’te değişmemiş; mevcut SRC, comfort, gate, PLC, seq ve wrap kontrolleri PASS |

P1-03’ün önceki “gecikmiş eski kaynak native soketi terminate eder” senaryosu yeni handoff/opaque-session kapsamındaki gerçek yerel testte engelleniyor. Aşağıdaki yeni P1, bu engelin aşılması değildir; **istemci batch’inin yanlış abonelik başlığıyla gönderilmesi** ayrı bir kusurdur.

## 3. P1 — Kafile değişiminde bekleyen sesin yanlış kafileye gitmesi

**Kaynaklar:** `public/vercel-ws-shim.js:880–905`; özellikle batch’in splice ile yerel değişkene alınması, relay-open await’i ve sonrasında güncel _joinContext’in okunması. `687–695` oda/rol değişiminde yalnız _sendQueue içindeki sesi temizler; önceden splice edilmiş batch’e ulaşamaz. Sunucu `1550–1571` güncel subscriptionContext’e katılıp batch’i bu odada işler.

### Gerçek v56 üzerinde tekrar üretimi

1. Rehber A kafilesindeyken seq77 JSON PCM batch’i HTTP kuyruğuna girer.
2. _flushAndPoll batch’i yerel değişkene alır; relay-open cevabı beklenir.
3. Aynı soketten B kafilesine join gönderilir.
4. relay-open cevabı serbest bırakılır. Yerel batch hâlâ A sesidir; POST başlığı güncel B bağlamıdır.
5. B kafilesindeki gerçek native WS dinleyicisi A’nın seq77 paketini alır.

Yerel Express/WS ile, diskteki gerçek SmartWebSocket sınıfı kullanılarak ölçüldü:

```text
AUDIT V56 ROUTE:
{"from":"RY-EDGE-A-MW7MHJ2W","to":"RY-EDGE-B-MW7MHJ2W","oldAudioReachedB":true}
```

Buradaki isimler izole test kafileleridir; production oturumu kullanılmadı. HTTP açılışının tamamlanma sırası fixture ile kontrol edildi. Paket yeni ve200 ms TTL içindeydi; sorun bayat paket filtresinin eksikliği değil, **paketin hangi kafileye ait olduğunun kaybıdır**. Hoparlör/donanım kaydı yapılmadı; yanlış alıcının WS üzerinden PCM aldığı doğrulandı.

Aynı mekanizma eski quick-announcement gibi kontrolleri de yeni kafilede çalıştırabilir. Ayrıca bir eski HTTP cevabı kafile değiştikten sonra UI/audio katmanına teslim edilebilir veya başarısız eski batch yeni kafilede retry kuyruğuna girebilir. v56’nın current() kontrolü yalnız epoch/bağlantıyı doğruluyor; normal abonelik değişimi HTTP epoch’unu değiştirmiyor.

### v57 çözümü

- `_relayRoutingKey()` abonelik türü + normalize tur + oda + rol ile kararlı bir rota anahtarı üretir. Admin global kapsamı, family tur kapsamı ayrıdır. İsim/telefon/dil düzenlemesi rota değişimi sayılmaz.
- Gerçek rota değişiminde bekleyen eski ses **ve kontrol** kuyruğu, kısmi coalescer ve eski guide-state temizlenir. Yeni join bundan sonra yeni kuyrukta yer alır.
- HTTP işlemi başında rota sabitlenir. Açılış dönerken rota değişmişse açılan boş oturum güvenle tutulur, fakat eski batch POST edilmez; yeni rota kuyruğu drain edilir.
- Cevap veya ağ hatası döndüğünde rota tekrar kontrol edilir. Eski rota cevabı teslim edilmez, eski kontroller yeni rotaya retry edilmez.
- Aynı rotadaki ağ hatasında mevcut kontrol retry davranışı korunur. Bu düzeltme bütün hatalarda kuyrukları körlemesine boşaltmaz.

Yeni E2E; yalnız eski sesi atmayı değil, **yeni B seq88 sesi ve B kontrolünün gerçekten ulaşmasını** da şart koşar. Böylece “tüm ses kesildiği için sızıntı yok” gibi yanlış bir PASS önlenir.

## 4. P2 — Sessiz v56 oturumları temizlenmiyor, süre aşımı atlanıyor

**Kaynaklar:** `server.js:738–747` cleanup işlevi; `1277–1287` heartbeat; `1295–1296` getOrCreate; `1363–1376` yeni resolve yolu.

cleanupStaleRelaySessions yalnız getOrCreateRelaySession’dan çağrılıyor. v56’nın mevcut-ID istekleri resolveRysRelay ile getOrCreate çağrısını atlıyor; heartbeat sadece WS ping/pong yapıyor. Yeni relay açılışı/legacy oluşturma yoksa susmuş HTTP üyeleri ve retired kayıtları Map’te kalabiliyor. resolve ayrıca35 sn yaş denetimi yapmadan lastSeen’i güncelliyor.

Gerçek resolver ve heartbeat callback’i, kontrollü saat/Map ile yürütüldü; yeni oturum trafiği oluşturulmadı:

```text
AUDIT V56 CLEANUP:
{"expiredStillPresentAfterHeartbeat":true,"resolverStatus":200,"refreshedLastSeen":60000}
```

lastSeen=0 olan kayıt, saat60000 ms’de heartbeat sonrası hâlâ var; sonraki doğru anahtarlı istek200 alıp lastSeen’i60000’e taşıyor. Bu bir gerçek zamanlı60 sn bekleme testi değildir; gerçek kaynak fonksiyonlarının saat fixture’ıyla yürütümüdür.

**Etki:** Susmuş üyelerin dinleyici sayıları, aile/admin outbox’ları ve RAM kayıtları gereğinden uzun yaşayabilir. Bu kusur, commit edilmiş retired kaynak engelini aşmaz: retired kontrolü yine409 verir. Etkilenen durum, aktifken susmuş ama emekliye ayrılmamış kaydın ömrüdür.

**Test boşluğu:** Mevcut runStep5V56HandoffChecks,1814’te Map kaydını elle silip yeniden yaratılamadığını test ediyor. Bu doğru bir ID engelleme testidir; periyodik temizleyicinin gerçekten çalıştığını veya idle süresini kanıtlamaz.

### v57 çözümü

- Mevcut30 sn heartbeat callback’ine cleanup çağrısı eklenir; yeni bir timer yaratılmaz. Servis kapanışındaki mevcut clearInterval davranışı korunur.
- Yeni-biçim v56 kaydına gelen doğru anahtarlı istekte35 sn idle sınırı lastSeen güncellenmeden sınanır. Süresi aşılmış kayıt silinir, eski üyeliği kaldırılır ve409 relay-session-expired döner. Aynı ID yeniden yaratılmaz.
- Temizleyici tüm HTTP kayıtlarını toplar. Sonraki istekle35 sn denetimi, özel rys56 oturumları içindir; legacy ID uyumluluk davranışı korunur.
- Sınır mevcut cleaner ile aynıdır:35000 ms geçerli,35001 ms süresi aşılmış. Periyodik arka plan temizliği, normal işleyen event loop’ta yaklaşık35–65 sn aralığında gerçekleşebilir; gelen v56 isteği bir sonraki sweep’i beklemez.

## 5. DSP, atomiklik ve kalan mimari sınırlar

Bu turda capture/player için yeni bir sayısal P1/P2 regresyonu saptanmadı. `public/pcm-capture-worklet.js` ve `public/pcm-player-worklet.js` kaynak hash’leri önceki motorlarla aynıdır. Mevcut testler24/44.1/48 kHz örnekleri,128/2048 chunk eşliği, FIR örnek noktaları,72 örnek comfort delay/48 örnek attack, finite örnekler, aktif trim/PLC/starvation ve seq wrap üzerinden geçti.

Bu sonuç saha akustik garantisi değildir: tek mikrofon gate’i aynı anda konuşan kişileri %100 ayıramaz; kısa PLC kaybolan sözcükleri geri üretmez; OS arama/kilit kesintisi JS ile bütünüyle önlenemez. Public MQTT kimlik/ACL ve çok cihazlı AEC sınırları önceki raporlardaki kapsamda devam eder.

v56 prepare/commit atomikliği tek Node işçisindeki RAM oturumlarına dayanır. HTTP ve WS farklı işçilere/instance’lara dağıtılırsa ortak sahiplik/CAS veya uygun yönlendirme gerekir; bu v57 yaması dağıtık oturum mimarisi getirmez. [Node.js Cluster belgeleri](https://nodejs.org/api/cluster.html)

Legacy ordinary-join/anahtarsız HTTP biçimi uyumluluk için duruyor. v56 atomik devir garantisi, yeni protokole katılan istemci+sunucu ve opaque oturum kapsamındadır; eski açık sekmelerin tamamı bu garantiyi kendiliğinden kazanmaz. Fiziksel cihaz/roaming/yük testi bu çalışmada yapılmadı; GitHub/VDS/Vercel dağıtımı talepte verilen bilgidir, bu denetimde production’a yazılmadı.

## 6. Doğrulama sonuçları ve uygulama sırası

| Kontrol | Sonuç / gerçek kapsam |
|---|---|
| Diskteki v56 | **30/30 PASS**, V53/V54/V55/V56 E2E/UNIT PASS, exit0 |
| Önceki v56 diff reverse-check | **exit0**,12 kaynak değişikliği eşleşiyor |
| Ek v56 tanı | Yanlış B alıcısına A PCM’i ulaştı; idle kayıt heartbeat sonrası kaldı ve200 ile yenilendi |
| Yeni unit testi eski v56 üzerinde | Beklenen negatif kontrol: assert(!map.has('rys56-idle')) başarısız; temizlik kusuru yakalandı |
| Aday v57 sözdizimi |14 JS/inline derlemesi PASS; ayrıca bütün aday modüller tam koşuda derlendi |
| v57 diff uygulanabilirliği | git apply --check --ignore-space-change -: **exit0**; gerçek kaynaklara uygulanmadı |
| Son v57 tam önizleme | **32/32 PASS**, V53/V54/V55/V56 ve V57 testleri PASS, exit0 |

v57 E2E, gerçek yerel Express/WS sunucusunu ve gerçek SmartWebSocket kaynak sınıfını kullanır; ilk HTTP açılışının cevabı geciktirilir. Paketin taze kalması için istemci saati kontrollüdür. A’nın ses/kontrolünün B’ye gitmemesi, B’nin yeni ses/kontrolünün alınması birlikte doğrulanır.

v57 kaynak testi; yeni oturum oluşturmadan heartbeat temizliği,35000/35001 ms sınırı, rota değiştikten sonra eski cevap/retry engeli, aynı rota retry’sinin korunumu ve yalnız metadata değişiminin rota sayılmamasını kapsar. Mevcut30 grup korunur; iki yeni sonuç grubu toplamı32 yapar.

Önizleme aracı rapor diff’ini bellekte uygular; testlerin kaynak okumaları aday metinlere yönlendirilir ve testlerin raporu okuması engellenir. Raporu yalnız önizleme hazırlığı okur. Ana paketin child-process syntax kontrolleri diski gördüğü için aday syntax ayrıca stdin/VM üzerinden sınandı. **32/32, v57’nin diske veya production’a uygulandığı anlamına gelmez.**

Bu yama handoff wire şemasını değiştirmez: `relay-open/close version:56` ve mevcut prepare/commit mesajları korunur. **57 yalnız uygulama/cache sürümüdür.** Yeni ve eski v56 API istemcileri sunucuyla uyumludur. Sunucu temizliği ve istemci rota koruması ayrı düzeltmelerdir; ikisinin tamamlanması için iki taraf da güncellenmelidir. Önce sunucu, sonra shim/cache dağıtımı yapılabilir.

Sekiz shim yükleyicisi ve SW cache/register57’ye alınır; değişmeyen worklet’ler53-audio kalır. İlk uygulama sonrasında gerçek diskte `node scripts/verify-system.js` tekrar çalıştırılmalı; ardından özellikle yayın sırasında kafile/oda değiştirme, HTTP cevabı gecikmesi ve35 sn üzeri uyku/sinyal kaybı fiziksel cihazlarla sınanmalıdır.

## 7. Tam uygulanabilir v57 unified diff

**Hedef HEAD:**3fcb087. Aşağıdaki diff tam yardımcı/metot/test kodlarını içerir. Denetim sırasında kaynaklara uygulanmadı. Daha sonra UTF-8 patch olarak çıkarılıp `git apply --check`, `git apply` ve `node scripts/verify-system.js` ile uygulanıp diskten doğrulanabilir. Beklenen sonuç32 gruptur. Kaynak ağaç değişmişse check başarısızlığını dikkate alın.


```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -1275,6 +1275,7 @@
 
 // 30-Second Ping/Pong Heartbeat to prune zombie/dropped connections from mobile networks
 const heartbeatTimer = setInterval(() => {
+  cleanupStaleRelaySessions();
   wss.clients.forEach((ws) => {
     if (ws.isAlive === false) {
       return ws.terminate();
@@ -1371,6 +1372,11 @@
       !crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))){
       res.status(401).json({error:'relay-key-required'});return null;
     }
+    if(Date.now()-s.lastSeen>35000){
+      httpRelaySessions.delete(id);
+      if(s.currentRoom)removeClientFromRoom(s.currentRoom,id);
+      res.status(409).json({error:'relay-session-expired'});return null;
+    }
   }else s=s||getOrCreateRelaySession(id);
   if(s.relayRetired){res.status(409).json({error:'relay-session-retired'});return null;}
   s.lastSeen=Date.now();return s;
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -576,6 +576,7 @@
   await runV54RelayRoundTrip({baseUrl,url:wsUrl,token:authToken});
   await runV55RelayEdgeChecks({baseUrl,url:wsUrl,token:authToken});
   await runV56HandoffChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV57RoutingChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1215,7 +1216,7 @@
   const good={readyState:1,bufferedAmount:0,send(){fast++;}};
   fan.broadcastToRoom({clients:new Map([[1,{ws:throws}],[2,{ws:good}]])},{type:'audio-chunk'});assert.equal(fast,1);
   let httpJobs=[],fetchCalls=0,resolveFirst,delivered=0,fetchSignal;
-  const relayMethods=['_enqueueRelayMessage','_flushAndPoll','close'].map(n=>pick(shim,n,'method')).join('\n');
+  const relayMethods=['_relayRoutingKey','_enqueueRelayMessage','_flushAndPoll','close'].map(n=>pick(shim,n,'method')).join('\n');
   const hc=box('class Relay{'+relayMethods+'}\nglobalThis.R=Relay;','',{
     Date:{now:()=>0},setTimeout:()=>1,clearTimeout(){},queueMicrotask:f=>httpJobs.push(f),
     localStorage:{getItem:()=>''},fetch:(url,options)=>{
@@ -1513,7 +1514,7 @@
   }
   assert.equal(opened,3);assert.equal(acks,3);
   // Empty poll: family/admin never fabricate a pilgrim join; PIN stays in POST.
-  const bodies=[],relay=box('class Relay{'+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.R=Relay;','',{
+  const bodies=[],relay=box('class Relay{'+pick(shim,'_relayRoutingKey','method')+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.R=Relay;','',{
     localStorage:{getItem:()=>''},fetch:async(url,opts)=>{assert.equal(url,'/api/ws-relay');assert.equal(opts.method,'POST');
       bodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({messages:[]})};}}).c;
   for(const connected of [false,true])for(const mode of ['family-subscribe','admin-subscribe','join']){
@@ -1526,9 +1527,9 @@
     if(mode!=='join')assert.equal(body.joinContext??null,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v56"));assert(sw.includes('/vercel-ws-shim.js?v=56'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v57"));assert(sw.includes('/vercel-ws-shim.js?v=57'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'56',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'57',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
@@ -1581,7 +1582,7 @@
     assert.equal(afterPhone.name,'Updated name');assert.equal(afterPhone.phone,'updated-phone');assert.equal(afterPhone.lang,'ar');
     await post({clientId:cid,subscriptionContext:phoneOnly,messages:[]});
     const source=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8').replace(/\r\n/g,'\n');
-    const begin=source.indexOf('    async _flushAndPoll(){');
+    const begin=source.indexOf('    _relayRoutingKey(){');
     const end=source.indexOf('\n    // PATCH: shim-close',begin);
     assert(begin>=0&&end>begin);
     let browserToken='',fetchCount=0;
@@ -1883,6 +1884,138 @@
   console.log('V56 UNIT PASS: expired/revoked prepare has no side effects; lost ACK recovers with fresh HTTP ID; no source-ID resurrection');
 }
 
+async function runV57RoutingChecks({baseUrl,url,token}){
+  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{WebSocket}=require('ws');
+  const stamp=Date.now().toString(36),a='RY-V57-A-'+stamp.toUpperCase(),b='RY-V57-B-'+stamp.toUpperCase();
+  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
+  const wait=async predicate=>{
+    const until=Date.now()+2500;while(!predicate()){
+      if(Date.now()>until)throw Error('V57 routing deadline');await new Promise(r=>setTimeout(r,5));
+    }
+  };
+  let listener,socket;
+  try{
+    for(const code of [a,b])assert.equal((await fetch(baseUrl+'/api/tours',{method:'POST',headers,
+      body:JSON.stringify({code,name:'V57 routing regression',guideName:'V57 guide'})})).status,200);
+    listener=new WebSocket(url);const received=[];
+    listener.on('message',(raw,binary)=>{if(!binary)try{received.push(JSON.parse(raw.toString()));}catch(e){}});
+    await new Promise((r,j)=>{listener.once('open',r);listener.once('error',j);});
+    listener.send(JSON.stringify({type:'join',role:'pilgrim',tourCode:b,roomId:'genel',name:'V57 B listener'}));
+    await wait(()=>received.some(m=>m.type==='joined'));
+    const source=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8').replace(/\r\n/g,'\n');
+    const begin=source.indexOf('  class SmartWebSocket {'),end=source.indexOf('\n  SmartWebSocket.CONNECTING',begin);
+    let release,notify;const opening=new Promise(r=>notify=r);const clock=Date.now();
+    const context={console,Buffer,Date:class extends Date{static now(){return clock;}},AbortController,ArrayBuffer,Float32Array,URLSearchParams,window:{},
+      NativeWebSocket:class{},localStorage:{getItem:()=>token},
+      setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,
+      fetch:async(route,options)=>{
+        const body=JSON.parse(options.body),response=await fetch(baseUrl+route,options);
+        if(body.type==='relay-open'){
+          const data=await response.json();notify();await new Promise(r=>release=r);
+          return {ok:true,json:async()=>data};
+        }
+        return response;
+      }};
+    vm.createContext(context);vm.runInContext(source.slice(begin,end)+'\nglobalThis.S=SmartWebSocket;',context);
+    socket=Object.create(context.S.prototype);
+    const joinA={type:'join',role:'guide',tourCode:a,roomId:'genel',name:'V57 guide',token};
+    Object.assign(socket,{readyState:1,_isRelay:true,_httpEpoch:0,_transportGeneration:0,_joinContext:joinA,_subscriptionType:'join',
+      _sendQueue:[],_clientId:'logical-v57',_initMqttBus(){},_closeMqttClients(){},_publishMqtt(){},
+      _busConnected:()=>false,_deliverIncomingMessage(){},_audioCoalescer:{clear(){}}});
+    const unit=seq=>({type:'audio-chunk',seq,sampleRate:24000,sentAt:clock,pcm16:Buffer.alloc(960).toString('base64')});
+    socket._sendQueue.push({type:'audio-chunk',frames:[unit(77)],_queuedAt:clock},
+      {type:'quick-announcement',message:'OLD-A',title:'A only'});
+    const flight=socket._flushAndPoll();await opening;
+    socket.send(JSON.stringify({...joinA,tourCode:b}));
+    socket._enqueueRelayMessage({type:'audio-chunk',frames:[unit(88)],_queuedAt:clock});
+    socket.send(JSON.stringify({type:'quick-announcement',title:'B only',message:'NEW-B'}));
+    release();await flight;
+    await wait(()=>received.some(m=>m.type==='audio-chunk'&&m.seq===88)&&
+      received.some(m=>m.type==='new-announcement'&&m.announcement?.message==='NEW-B'));
+    assert(!received.some(m=>m.type==='audio-chunk'&&m.seq===77),'Old A PCM must not be posted under B context');
+    assert(!received.some(m=>m.type==='new-announcement'&&m.announcement?.message==='OLD-A'),'Old A command must not reach B');
+    if(typeof recordResult==='function')recordResult('ADIM-3.V57',
+      'Gerçek HTTP/WS: relay-open sırasında kafile değişimi eski PCM/kontrolü yeni kafileye taşımadı; yeni ses/kontrol ulaştı',true);
+    console.log('V57 E2E PASS: delayed relay-open + A-to-B switch; old PCM/control dropped; fresh B PCM/control delivered');
+  }finally{
+    socket?.close();listener?.close();
+    for(const code of [a,b])await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
+  }
+}
+
+async function runStep5V57RoutingChecks(){
+  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
+  const read=f=>fs.readFileSync(path.join(ROOT_DIR,f),'utf8').replace(/\r\n/g,'\n');
+  const server=read('server.js'),shim=read('public/vercel-ws-shim.js');
+  function pick(text,name,kind='function'){
+    const head=kind==='class'?'class ':kind==='method'?'(?:async )?':'(?:async )?function ';
+    const m=new RegExp('^([ \\t]*)'+head+name+(kind==='class'?'\\b':'\\([^\\n]*\\)\\s*\\{'),'m').exec(text);assert(m,'Missing '+name);
+    for(let end=text.indexOf('}',m.index+m[0].length);end>=0;end=text.indexOf('}',end+1)){
+      const code=text.slice(m.index,end+1).trim();
+      try{new vm.Script(kind==='method'?'class Probe{'+code+'}':code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}
+    }
+    throw Error('Unterminated '+name);
+  }
+  // Run the real periodic callback with no getOrCreate/new-session traffic.
+  const map=new Map(),removed=[];let heartbeat;
+  map.set('rys56-idle',{lastSeen:0,currentRoom:{},relayKey:'b'.repeat(48),ws:{}});
+  map.set('rys56-live',{lastSeen:59000,relayKey:'c'.repeat(48),ws:{}});
+  const sc={httpRelaySessions:map,Date:{now:()=>60000},Buffer,crypto:require('node:crypto'),wss:{clients:new Set()},
+    removeClientFromRoom:(room,id)=>removed.push(id),setInterval(fn,ms){assert.equal(ms,30000);heartbeat=fn;return 1;},
+    getOrCreateRelaySession(){throw Error('Must not create an expired opaque ID');}};
+  vm.createContext(sc);
+  const first=server.indexOf('const heartbeatTimer = setInterval('),last=server.indexOf("\nwss.on('close'",first);
+  vm.runInContext(pick(server,'cleanupStaleRelaySessions')+'\n'+pick(server,'resolveRysRelay')+'\n'+server.slice(first,last),sc);
+  heartbeat();assert(!map.has('rys56-idle'));assert(map.has('rys56-live'));assert.deepEqual(removed,['rys56-idle']);
+  // Requests themselves enforce the 35s boundary, including before the next sweep.
+  const respond=()=>({statusCode:200,status(n){this.statusCode=n;return this;},json(m){this.body=m;return this;}});
+  map.set('rys56-edge',{lastSeen:25000,relayKey:'d'.repeat(48),ws:{}});let response=respond();
+  assert(sc.resolveRysRelay({headers:{},method:'POST'},response,{clientId:'rys56-edge',relayKey:'d'.repeat(48)}));
+  assert.equal(response.statusCode,200); // Exactly 35000ms is still valid, matching cleanup's > comparison.
+  map.set('rys56-expired',{lastSeen:24999,relayKey:'e'.repeat(48),ws:{},currentRoom:{}});
+  response=respond();
+  assert.equal(sc.resolveRysRelay({headers:{},method:'POST'},response,{clientId:'rys56-expired',relayKey:'e'.repeat(48)}),null);
+  assert.equal(response.statusCode,409);assert.equal(response.body.error,'relay-session-expired');assert(!map.has('rys56-expired'));
+  // Client: reject stale responses/retries when the route changed, preserve retries for the same route.
+  let resolveFetch,rejectFetch;const delivered=[],microtasks=[];
+  const cc={console,Buffer,Date,AbortController,ArrayBuffer,Float32Array,URLSearchParams,window:{},NativeWebSocket:class{},
+    localStorage:{getItem:()=>''},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
+    queueMicrotask:fn=>microtasks.push(fn),
+    fetch:()=>new Promise((resolve,reject)=>{resolveFetch=resolve;rejectFetch=reject;})};
+  const helpers=['validRysAudio','unpackRysAudio','installRysCoalescing'].map(n=>pick(shim,n)).join('\n');
+  vm.createContext(cc);vm.runInContext(helpers+'\n'+pick(shim,'RysAudioCoalescer','class')+'\n'+
+    pick(shim,'SmartWebSocket','class')+'\nglobalThis.S=SmartWebSocket;',cc);
+  const make=()=>{
+    const s=Object.create(cc.S.prototype);
+    Object.assign(s,{readyState:1,_isRelay:true,_relayClientId:'rys56-ready',_relayKey:'b'.repeat(48),
+      _joinContext:{type:'join',role:'guide',tourCode:'A',roomId:'genel'},_subscriptionType:'join',_sendQueue:[],
+      _initMqttBus(){},_publishMqtt(){},_busConnected:()=>false,_audioCoalescer:{clear(){}},
+      _deliverIncomingMessage:m=>delivered.push(m)});
+    return s;
+  };
+  const late=make(),old=late._relayRoutingKey();
+  const flight=late._flushAndPoll();late.send(JSON.stringify({...late._joinContext,tourCode:'B'}));
+  assert.notEqual(late._relayRoutingKey(),old);
+  resolveFetch({ok:true,json:async()=>({messages:[{type:'room-state',room:{tourCode:'A'}}]})});
+  await flight;assert.equal(delivered.length,0,'Old route response must not update B');
+  const fail=make();fail._sendQueue=[{type:'quick-announcement',message:'OLD-A'}];
+  const failed=fail._flushAndPoll();fail.send(JSON.stringify({...fail._joinContext,tourCode:'B'}));
+  rejectFetch(Error('network'));await failed;
+  assert(!fail._sendQueue.some(m=>m.message==='OLD-A'),'A retry must not be replayed in B');
+  const same=make();same._sendQueue=[{type:'quick-announcement',message:'KEEP-A'}];
+  const retry=same._flushAndPoll();rejectFetch(Error('network'));await retry;
+  assert(same._sendQueue.some(m=>m.message==='KEEP-A'),'Unchanged-route controls retain existing retry behavior');
+  const metadata=make(),key=metadata._relayRoutingKey();metadata._joinContext.name='Changed name';
+  assert.equal(metadata._relayRoutingKey(),key,'Metadata edit is not a routing change');
+  const modes=make();modes._sendQueue=[{type:'quick-announcement',message:'guide only'}];
+  modes._inFlight=true;
+  modes.send(JSON.stringify({type:'family-subscribe',tourCode:'A'}));
+  assert(!modes._sendQueue.some(m=>m.message==='guide only'));
+  if(typeof recordResult==='function')recordResult('ADIM-5.V57',
+    'Periyodik relay temizliği, 35s sınırı, rota sonrası eski cevap/retry engeli ve aynı-rota retry korunumu',true);
+  console.log('V57 UNIT PASS: idle sweep; 35000/35001ms expiry; stale-route response/retry dropped; same-route retry retained');
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -1893,6 +2026,7 @@
     await runStep5V53AudioChecks();
     await runStep5V54AudioChecks();
     await runStep5V56HandoffChecks();
+    await runStep5V57RoutingChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -675,6 +675,8 @@
         if ([...keys].every(k => JSON.stringify(old[k]) === JSON.stringify(parsed[k]))) return;
       }
       if (parsed && typeof parsed === 'object') {
+        const subscription=['join','family-subscribe','admin-subscribe'].includes(parsed.type);
+        const previousRoute=subscription?this._relayRoutingKey():null;
         if (!parsed._msgId) {
           parsed._msgId = 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
         }
@@ -710,6 +712,9 @@
           this._isAdmin = true;
           this._joinContext = null;
           if (this._isRelay) this._initMqttBus(null, true);
+        }
+        if(subscription&&previousRoute!==this._relayRoutingKey()){
+          this._sendQueue.length=0;this._audioCoalescer?.clear();this._lastGuideState=null;
         }
       }
 
@@ -873,9 +878,17 @@
     }
 
     // PATCH: shim-http-v52
+    _relayRoutingKey(){
+      const mode=this._subscriptionType||(this._isAdmin?'admin-subscribe':'join'),c=this._joinContext||{};
+      if(mode==='admin-subscribe')return JSON.stringify([mode]);
+      const tour=String(c.tourCode||'RY-KASIM').toUpperCase().trim();
+      if(mode==='family-subscribe')return JSON.stringify([mode,tour]);
+      return JSON.stringify([mode,tour,String(c.roomId||'genel').trim(),c.role==='guide'?'guide':'pilgrim']);
+    }
     async _flushAndPoll(){
       if(this.readyState!==1||!this._isRelay||this._inFlight||this._relayFenced)return;
-      const epoch=this._httpEpoch||0;
+      const epoch=this._httpEpoch||0,route=this._relayRoutingKey();
+      const sameRoute=()=>route===this._relayRoutingKey();
       const current=()=>this.readyState===1&&this._isRelay&&(this._httpEpoch||0)===epoch;
       const batch=this._sendQueue.splice(0).filter(m=>m.type!=='audio-chunk'||
         (Number.isFinite(m._queuedAt)&&Date.now()-m._queuedAt<=200));
@@ -890,6 +903,7 @@
           if(!opened.ok||!String(data.clientId||'').startsWith('rys56-')||
             !/^[0-9a-f]{48}$/.test(data.relayKey||''))throw Error('Relay open failed');
           this._relayClientId=data.clientId;this._relayKey=data.relayKey;
+          if(!sameRoute()){success=true;return;}
           if(this._lastGuideState&&this._joinContext?.role==='guide')
             batch.push({...this._lastGuideState});
         }
@@ -908,16 +922,17 @@
           if(res.status===409){
             if(payload.error==='relay-session-retired'&&this._failbackProbe)this._relayFenced=true;
             else{
-              for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
+              if(sameRoute())for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
               batch.length=0;this._cancelNativeProbe?.();this._resetRelaySession();
             }
           }
           throw Error('Relay HTTP '+res.status);
         }
+        if(!sameRoute()){success=true;return;}
         if(Array.isArray(payload.messages))for(const m of payload.messages)this._deliverIncomingMessage(m);
         success=true;
       }catch(e){
-        if(current())for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
+        if(current()&&sameRoute())for(const m of batch)if(m.type!=='audio-chunk')this._enqueueRelayMessage(m);
       }finally{
         clearTimeout(timer);
         if(this._relayAbort===ac)this._relayAbort=null;
diff --git a/public/sw.js b/public/sw.js
--- a/public/sw.js
+++ b/public/sw.js
@@ -1,14 +1,14 @@
 // PATCH: sw-v53
 // PATCH: sw-v53
 // PATCH: sw-v53
-const CACHE_NAME = 'ridvanses-pwa-v56';
+const CACHE_NAME = 'ridvanses-pwa-v57';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=56',
+  '/vercel-ws-shim.js?v=57',
   '/js/umrah-steps-map.js',
   '/pcm-capture-worklet.js?v=53-audio',
   '/pcm-player-worklet.js?v=53-audio',
diff --git a/public/ani-kitabi.html b/public/ani-kitabi.html
--- a/public/ani-kitabi.html
+++ b/public/ani-kitabi.html
@@ -7,7 +7,7 @@
   <meta name="description" content="Rıdvan Yılmaz Turizm Umre ve Siyer yolculuğunuzun baskıya hazır A4 manevi hatıra kitapçığı ve imzalı Umre Ziyaret Beratı." />
   <link rel="icon" type="image/svg+xml" href="/icons/icon-512.svg" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=56"></script>
+  <script src="/vercel-ws-shim.js?v=57"></script>
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
-  <script src="/vercel-ws-shim.js?v=56"></script>
+  <script src="/vercel-ws-shim.js?v=57"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -2555,7 +2555,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=56').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=57').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=56"></script>
+  <script src="/vercel-ws-shim.js?v=57"></script>
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
-  <script src="/vercel-ws-shim.js?v=56"></script>
+  <script src="/vercel-ws-shim.js?v=57"></script>
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
-  <script src="/vercel-ws-shim.js?v=56"></script>
+  <script src="/vercel-ws-shim.js?v=57"></script>
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
-  <script src="/vercel-ws-shim.js?v=56"></script>
+  <script src="/vercel-ws-shim.js?v=57"></script>
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
-  <script src="/vercel-ws-shim.js?v=56"></script>
+  <script src="/vercel-ws-shim.js?v=57"></script>
   <style>
     .rota-hero-strip {
       background:
diff --git a/public/yaka-karti.html b/public/yaka-karti.html
--- a/public/yaka-karti.html
+++ b/public/yaka-karti.html
@@ -8,7 +8,7 @@
   <meta name="robots" content="noindex, nofollow" />
   <link rel="canonical" href="https://ses.ridvanyilmazturizm.com/yaka-karti" />
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=56"></script>
+  <script src="/vercel-ws-shim.js?v=57"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```

<!-- SOURCE-HASHES {"server.js":"f5579c397a328dc9ab1dea5f9a17038a48e65355bb90bc390abe1b2080d2dffe","scripts/verify-system.js":"db0a1a462fb9edd1f5081a9facb1c20935f8134862c9baf67d3019aaa98b0e39","public/ani-kitabi.html":"913d90b9acd49c4a5b7e2ee3de73bff2be7d461540c8a6f78b29f756aeee65fc","public/dinle.html":"d0d450b79c1df594655caf8c2494b41f43b7792e64b3e72d24037c1477124bf4","public/index.html":"ef8abbf9f1eb01a7d85cacc25aa22a45a1e715e5d31f1fb43dc4736db3769c29","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"2ee15e21e7b2668595701d0c1704a073ddf227394801f8aa47f62888e38a778e","public/panel.html":"032e2894843c24931c3cbd68c2c71530941043dd3450b546c46fedc1ffcfcc05","public/pcm-capture-worklet.js":"e6f7c223b92928825481589f626e53b64ff70c17710f668000440c68d559e564","public/pcm-player-worklet.js":"9bfbcb06d2904d375ff06498e232cc09a32c5c9624b36bb8947bbc5270323183","public/rehber.html":"ad47655bb15e3c282362e4b0aebcd405d535c38636fc4eecb47690f45b82a518","public/rota.html":"6e72a39a2d411f1b914d8b7bab7823403fa5bd383b59ad482cbfbd4f90acde84","public/sw.js":"d19cf0fe1e51d9618072d1f8b65ee5a1f7ad8fd6799a6c7e0af409bd12f29896","public/vercel-ws-shim.js":"1856fc4a0ed76d9c464cd31c870ca6d306e194ecf1ccfe49560048dad44baca8","public/yaka-karti.html":"fc933eef3869521ca03ed7805cbe01faffdd703ef97c0e23fa33eb22e458584a"} -->

## 8. Teslim kanıtı ve nihai değerlendirme

Son aday koşusundan:

```text
[BAŞARILI / PASS] ADIM-5.V56 — Prepare expiry/revoke/cancel; silinen ID409; ACK kaybı/fencing/yeni oturum; geç open cevabı; MQTT bağımsızlığı
V56 UNIT PASS: expired/revoked prepare has no side effects; lost ACK recovers with fresh HTTP ID; no source-ID resurrection
[BAŞARILI / PASS] ADIM-5.V57 — Periyodik relay temizliği, 35s sınırı, rota sonrası eski cevap/retry engeli ve aynı-rota retry korunumu
V57 UNIT PASS: idle sweep; 35000/35001ms expiry; stale-route response/retry dropped; same-route retry retained
TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: 32 / 32 [BAŞARILI / PASS]
```

Denetim sonunda15 gerçek kaynak dosyasının SHA-256 değeri başlangıçla aynı kaldı. Gerçek kaynaklar hâlâ3fcb087 sürümündedir. Test runtime snapshot’ı geri yüklendi; başlangıçtaki iki kullanıcı silinmesi korundu. Tek güncellenen teslim dosyası bu rapordur.

**Nihai değerlendirme:** v56’nın önceki diff’e uygun uygulanması ve30/30 test sonucu onaylanır. Yeni tekrar üretimleri nedeniyle tüm aktarım katmanları için koşulsuz onay verilmez. Öncelik, yanlış kafileye medya/kontrol taşınmasını engelleyen P1 rota koruması; ardından P2 idle temizlik/süre sınırıdır. Rapor içindeki v57 çözümü belirtilen yerel32/32 koşudan geçmiştir; diske veya production’a uygulanmış değildir.
