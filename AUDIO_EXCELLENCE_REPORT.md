# RıdvanSes v57 — Uygulama doğrulaması ve giriş hata yalıtımı

**Tarih:** 8 Kasım 2026  
**İncelenen gerçek HEAD:** `15366541ba38ec83fcdd97075af29951506d115e`  
**Teslim:** Yalnız `AUDIO_EXCELLENCE_REPORT.md`. Gerçek kaynaklara dokunulmadı.

**Karar:** v57 diff’i eksiksiz uygulanmış; doğrudan diskten **32/32 PASS + V53/V54/V55 PASS + V56 E2E/UNIT PASS + V57 E2E/UNIT PASS, exit0** doğrulandı. Rota izolasyonu,35 sn sınırı ve mevcut atomik handoff kontrolleri geçiyor. Ek bozuk-girdi incelemesinde **P1 oda durumu zehirlenmesi** ve **P2 bağlantı hatalarının süreç genelindeki işleyiciye kaçması** yeniden üretildi. Bu yüzden tüm aktarım katmanları için koşulsuz onay verilmez. Aşağıdaki dar kapsamlı **v58 sunucu/test yaması**, kaynaklara yazılmadan **34/34 PASS, exit0** ile sınandı.

Bu bulgular v57 diff’inin eksik uygulanması olarak değerlendirilmemelidir. Önceki testler düzgün biçimli protokol mesajlarını ve taşıma yarışlarını kapsıyordu; metadata’nın geçersiz veri türünü ve socket hata sınırını kapsamıyordu.

## 1. Disk doğrulaması ve diff eşliği

Çalıştırıldı:

```powershell
node scripts/verify-system.js
```

Gözlenen ilgili sonuçlar:

```text
V53 PASS: source-only DSP/SRC/comfort/profile, queue/PLC/seq, binary+JSON dedup, coalescer, congestion, HTTP single-flight/drain/close, gesture/wake/pause
V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs
V55 PASS: partial name/phone/lang/device preservation; broker-connected empty HTTP poll; mixed native PCM; family/admin deltas
V56 E2E PASS: prepare has no membership side effect; committed source fenced; late requests cannot kill native
V56 UNIT PASS: expired/revoked prepare has no side effects; lost ACK recovers with fresh HTTP ID; no source-ID resurrection
V57 E2E PASS: delayed relay-open + A-to-B switch; old PCM/control dropped; fresh B PCM/control delivered
V57 UNIT PASS: idle sweep; 35000/35001ms expiry; stale-route response/retry dropped; same-route retry retained
TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: 32 / 32 [BAŞARILI / PASS]
```

Çıkış kodu **0**. 18 JS dosyası ve 9 HTML içindeki 10 inline script kontrolü geçti. Önceki raporun v57 unified diff’i kaynaklara uygulanmadan `git apply --reverse --check --ignore-space-change -` ile sınandı: **exit0**. Önceki 12 kaynak değişikliği mevcut ağaçla eşleşiyor.

Başlangıçta silinmiş görünen `AUDIT_FIX_SUMMARY.md` ve `AUDIT_REPORT.md` kullanıcı değişiklikleri korundu. Yerel paket runtime.json snapshot’ını geri yükler. Ek testler production’a gönderilmedi.

## 2. Onaylanan v57 ve önceki davranışlar

| Alan | Doğrulanan uygulama |
|---|---|
| Rota anahtarı | public/vercel-ws-shim.js:881–887; abonelik türü/tur/oda/rol anahtarı; metadata düzenlemesi rota sayılmıyor |
| Bekleyen batch izolasyonu | Aynı dosya:888–948; relay-open sonrası, cevap ve retry yollarında sameRoute kontrolü; eski PCM/kontrol B’ye taşınmıyor, yeni B verisi ulaşıyor |
| Kuyruk/coalescer temizliği | Aynı dosya:677–719; gerçek rota değişiminde eski kuyruk ve guide-state temizleniyor |
| Idle temizlik | server.js:1277–1287; heartbeat cleaner çağırıyor.1364–1383; opaque kayıtta35000 ms geçerli,35001 ms409 ve kayıt/üyelik kaldırma |
| Atomik handoff | Yan etkisiz prepare, commit sonrası eski ID409, commit idempotansı, kayıp ACK toparlanması ve kaynak yokken açılış yarışı PASS |
| Oturum anahtarı / abonelik | Yeni rys56 ID+anahtar, GET/CORS, family/admin/PIN kontrolleri ve kısmi metadata korunumu PASS |
| Önbellek | Sekiz shim yükleyicisi/SW57; değişmeyen worklet URL’leri53-audio |
| DSP | Capture/player bu commit’te değişmemiş; mevcut FIR/SRC, comfort, gate, finite, PLC, trim ve wrap testleri PASS |

P1-03 ve v57 rota düzeltmesinin önceki tekrar üretimleri geçiyor. Aşağıdaki yeni bulgu, eski HTTP kaynağının fence’i aşması değildir; **doğrulanmamış metadata’nın paylaşılan oda durumuna yazılmasıdır**.

## 3. P1 — Kimliği doğrulanmamış dinleyici geçersiz metadata ile oda durumunu zehirleyebiliyor

**Yerler:** `server.js:914–993` join işleyicisi; özellikle937–946’daki clientObj alanları. `1206–1265` JSON.parse sonrası veri türü doğrulanmadan dispatch. `1556 ve devamı` relay context senkronizasyonu. `sendRysSubscriptionAck` / oda serialization’ı1393 ve devamı.

64 KiB WebSocket payload sınırı zaten vardı (`server.js:46–50`); v58 bunu yeni eklemiyor. Ancak64 KiB’den küçük JSON, çok derin bir dizi/nesne içerebilir. name gibi bir alan dizi/nesne olarak kabul edilip clientObj’ye giriyor. Bu veri daha sonra yetkili oda snapshot’ına dahil edildiğinde JSON.stringify taşabiliyor.

### Gerçek v57 üzerinde yerel tekrar üretimi

İzole, PINsiz test kafilesinde; admin yetkisi olmayan bir pilgrim bağlantısı name alanında8000 kat iç içe dizi gönderdi. Bu JSON yaklaşık16 KiB’dir; mevcut64 KiB sınırının altındadır. İlk pilgrim ACK’sı ayrıntılı hacı listesini içermediği için bağlantı joined aldı. Daha sonra aynı odadaki rehberin HTTP relay katılımı ve yetkili bootstrap seri hale getirme sırasında500 verdi:

```text
AUDIT V57 MALFORMED NAME:
{"unauthenticatedPilgrimJoined":true,"bootstrapBefore":200,"guideJoin":500,"bootstrapAfter":500}

AUDIT V57 AFTER BAD MEMBER CLOSE: 200
```

Sunucu hata imzası:

```text
RangeError: Maximum call stack size exceeded
    at JSON.stringify
    at sendRysSubscriptionAck
```

Hatalı üye kapandığında bootstrap200’e döndü. Bu, kalıcı seed dosyası bozulması değil; canlı oda üyeliğindeki geçersiz verinin kontrol/katılım cevaplarını bozmasıdır. Native rehber ACK’sı da aynı serialization yolunu kullanır; doğrudan gözlenen500’ler HTTP cevaplarıdır. Bütün mevcut binary sesin o anda kesildiği veya sürecin çöktüğü iddia edilmiyor.

**Önem:** Rehber katılımı, panel/oda snapshot’ı ve bu veriyi taşıyan handoff akışları dış istemci metadata’sına bağlı hale geliyor. Gelen paketin yalnız JSON olarak parse edilebilmesi ve byte sınırında kalması yeterli değil.

**v58 çözümü:** WS mesajı ve relay context/messages, oda veya handoff durumuna yazılmadan ortak bir bounded doğrulayıcıdan geçirilir. name/phone/tourCode/roomId gibi string alanlarda nesne/dizi kabulü kaldırılır. Geçersiz WS istemcisi sonlandırılır; geçersiz relay gövdesi400 alır. Böylece catch sonrasında zehirli üyeyi temizlemeye güvenilmez; üye baştan oluşmaz.

## 4. P2 — Frame ve cookie hataları bağlantı sınırında tutulmuyor

**Yerler:** `server.js:1191–1274` WS connection/message işleyicileri; yerel error listener ve dispatch exception sınırı yok. `578–604` cookie ayrıştırıcısı, ilgisiz cookie değerini de decode ediyor ve URIError’ı yakalamıyor. `32–38` süreç genelindeki uncaughtException handler’ı.

Yerel testte geçerli WS upgrade sonrası maskesiz çerçeve ve ayrı bağlantıda `Cookie: unrelated_cookie=%` gönderildi. process.uncaughtExceptionMonitor şu hataları gözledi:

```text
AUDIT V57 SOCKET ERROR BOUNDARY:
[{"name":"RangeError","code":"WS_ERR_EXPECTED_MASK"},{"name":"URIError","code":null}]
```

Süreçte `[CRITICAL] Uncaught Exception` çıktısı oluştu. **Bu uygulamanın global işleyicisi süreci kapatmıyor; test sunucusu çalışmaya devam etti.** İşleyici synchronous flush yolunu çağırıyor; her olayda gerçekten diske yazıldığı veya ölçülmüş bir ses drop’u oluştuğu iddia edilmiyor.

Hata tek bağlantıya aitken süreç düzeyine taşınıyor. Node’un özel error-event davranışı ve uncaughtException’ın normal akışa devam etme aracı olarak kullanılmaması resmi belgelerde açıklanır. Bu nedenle bağlantı düzeyi yakalama global handler’ın yerini alamayacağı gibi, global handler da bağlantı yalıtımının yerine geçmez. [Node.js Events](https://nodejs.org/api/events.html), [Node.js Process](https://nodejs.org/api/process.html)

**v58 çözümü:**

- WS error olayı için yerel handler eklenir; pending handoff temizlenip yalnız sorunlu socket terminate edilir.
- Message callback’inde beklenmedik dispatch hatası aynı yerel reject yoluna alınır. Global process politikası bu yamada değiştirilmez.
- Yalnız gerçek auth cookie decode edilir. Bozuk auth cookie sessizce yok sayılır; varsa diğer geçerli auth kaynağı kullanılabilir. İlgisiz cookie’nin bozuk yüzdesi WS kurulumunu etkileyemez.
- Başlık/cookie işleyicisi ile HTTP relay credentials kontrolleri geçersiz veri türünün String(...) dönüşümüne kaçmasını önler.

## 5. v58 doğrulama sözleşmesi ve uyumluluk

Bu bir tüm uygulamayı kapsayan JSON Schema değişimi değildir; mesaj/kontrol sınırındaki yapısal korumadır. Mevcut PIN/auth, PCM framing ve seq kontrolleri devam eder.

| Koruma | Sınır / davranış |
|---|---|
| Kök mesaj | Nesne; array değil; type string ve1–64 karakter |
| Metadata/string alanları | Tanımlı string alanlar nesne/dizi olamaz; mevcut opsiyonel null varsayılanları korunur |
| GET’te opsiyonel alanlar | Sunucunun ürettiği DTO’daki undefined alanlar “verilmemiş” kabul edilir; yetkisiz admin GET yine401 alır |
| Derinlik/düğüm |0 tabanlı derinlik en çok8; en çok4096 ziyaret; recursive stringify kullanılmaz |
| Container genişliği | En çok512 anahtar/indeks;480 örnekli legacy dizi için alan bırakır |
| String bütçesi | Tek string16384 karakter; anahtar+string toplamı65536 karakter; bu bir UTF-8 byte ölçümü değildir |
| Sayılar | Finite olmalı; JSON’daki1e400 gibi non-finite sonuçlar reddedilir |
| Özel anahtarlar | __proto__/prototype/constructor/toString/valueOf/toJSON reddedilir |
| Relay envelope | Credential alanları string/null; uzunluk sınırı. messages array olmalı; en çok128 mesaj |
| Medya uyumu |3×480 PCM batch’i ve mevcut numeric synthNote=440 demo biçimi kabul edilir |
| Maliyet | Sabit alan kümeleri yeniden kullanılır; yürüyüş iteratif ve bounded’dır. Kapasite testi yerine geçmez |

HTTP400, structural input hatası içindir. Normal yanlış PIN/eksik yetki semantiği ve mevcut32 test korunur. WSS64 KiB sınırı ve binary972B doğrulaması değişmez; sağlam ses paketleri genel JSON doğrulayıcıya sokulmaz.

**Sürüm ayrımı:** v58 yalnız sunucu ve test değişikliğinin adıdır. İstemci/shim/SW/HTML değişmez: cache57, opaque-session wire version56 ve DSP53-audio korunur. Yeni bir istemci cache göçü gerekmez.

## 6. Tamamlanan doğrulama ve kapsam sınırları

| Kontrol | Sonuç |
|---|---|
| Gerçek v57 disk paketi | **32/32 PASS**, ilgili tüm V53–V57 etiketleri, exit0 |
| Önceki diff reverse-check | **exit0**,12 kaynak değişikliği eşleşiyor |
| Ek negatif tanı | Kimliği doğrulanmamış bozuk name katılımı sonrası guide relay/authorized bootstrap500; üye kapanınca200 |
| Süreç hata monitörü | V57’de WS_ERR_EXPECTED_MASK ve URIError yakalandı |
| v58 candidate syntax | Değişen server.js ve verify-system.js stdin’den node --check ile PASS |
| v58 kaynak testleri | Bounded validator, PCM/demo ve cookie fallback PASS; önceki DSP/transport kaynak testleri PASS |
| Son tam v58 önizlemesi | **34/34 PASS**, V53–V57 ve V58 E2E/UNIT PASS, exit0 |
| Kaynak değişmezliği |15/15 gerçek kaynak dosyası SHA-256 başlangıçla aynı |

Yeni gerçek E2E, geçersiz derin WS name’in joined olamamasını, bootstrap/rehber katılımının200 kalmasını, relay’de hatalı context/credential’ın400 almasını, maskesiz/oversize frame’in yalnız kendi socket’ini kapatmasını ve bozuk cookie’nin normal family aboneliğini engellememesini sınar. Ardından sağlam972B PCM ve demo440’ın başka bir dinleyiciye ulaşmasını şart koşar. Test süresince süreç geneline kaçan hata listesi boş olmalıdır.

Yeni unit testi metadata türleri, derinlik/genişlik/string sınırları, özel anahtarlar, finite sayılar,3’lü PCM batch, kaynaksız prepare biçimi, GET undefined uyumu ve cookie auth fallback’ini kapsar. Mevcut32 grup iki yeni grupla34 olur.

Önizleme aracı rapor diff’ini bellekte uygular; testlerin kaynak okumaları aday metinlere yönlendirilir, testlerin raporu okuması engellenir. Yalnız önizleme hazırlığı raporu okur. Ana paketin child-process syntax kontrolü gerçek diski gördüğünden aday dosyalar ayrıca stdin/VM ile derlendi. **34/34 sonucu diske uygulanmış veya production’da çalıştırılmış v58 değildir.**

DSP motorlarında bu turda yeni P1/P2 bulunmadı. Bununla birlikte tek mikrofonla %100 yan konuşma izolasyonu, çok cihazlı echo iptali, OS arama/kilit sürekliliği ve public MQTT kimlik/ACL mimarisi için önceki sınırlar sürer. Tek işçi/RAM handoff varsayımı ve legacy protokol göçü de geçerlidir. Bu yama genel DDoS/kota, tüm REST endpoint şemaları veya tam güvenlik onayı değildir.

GitHub/VDS/Vercel dağıtımı talepte bildirilen durumdur; bu denetimde SSH/deploy/push veya production oturumu mutasyonu yapılmadı. Bütün bozucu paketler yalnız izole yerel test turuna gönderildi; test turu ve soketler temizlendi, runtime snapshot geri yüklendi.

## 7. Tam uygulanabilir v58 unified diff

**Hedef HEAD:**1536654. Yalnız `server.js` ve `scripts/verify-system.js` değişir. Denetim bu yamayı kaynaklara uygulamaz. UTF-8 patch olarak çıkarılıp önce `git apply --check`, ardından `git apply` ve `node scripts/verify-system.js` ile gerçek diskten doğrulanabilir. Rapor içindeki diff için check zaten exit0 verdi; beklenen toplam34 gruptur.

Sunucu güncellemesi/restart ile yeni giriş sınırı etkin olur. İstemci57 sürümüyle uyumludur; HTML/SW/worklet dosyalarını sırf sunucu etiketi58 oldu diye değiştirmek gerekmez. Geçerli istemciler korunurken geçersiz structural mesajların400/bağlantı kapatma ile reddedilmesi bilinçli davranış değişikliğidir.


```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -591,8 +591,9 @@
       const eq = part.indexOf('=');
       if (eq > 0) {
         const k = part.slice(0, eq).trim();
-        const v = decodeURIComponent(part.slice(eq + 1).trim());
-        if (k === AUTH_COOKIE_NAME && isValidAuthToken(v)) {
+        if(k!==AUTH_COOKIE_NAME)continue;
+        let v;try{v=decodeURIComponent(part.slice(eq+1).trim());}catch(e){continue;}
+        if (isValidAuthToken(v)) {
           return v;
         }
       }
@@ -1187,6 +1188,43 @@
   );
 }
 
+// v58: validate untrusted JSON before it can become room or handoff state.
+function isRysClientMessage(message){
+  if(!message||typeof message!=='object'||Array.isArray(message)||
+    typeof message.type!=='string'||!message.type||message.type.length>64)return false;
+  const strings=isRysClientMessage.stringFields||(isRysClientMessage.stringFields=new Set(['type','tourCode','roomId','role','name','phone','deviceId','lang','pin','token',
+    'clientId','relayClientId','relayKey','handoffId','guidePeerId','stageId','badge','topic','title',
+    'arabic','reading','meaning','note','address','guideName','pilgrimName','locationNote','id','alertId',
+    'message','broadcastMode','updatedAt','_msgId','pcm16']));
+  const forbidden=isRysClientMessage.forbiddenKeys||(isRysClientMessage.forbiddenKeys=
+    new Set(['__proto__','prototype','constructor','toString','valueOf','toJSON']));
+  const pending=[{value:message,depth:0}];let nodes=0,characters=0;
+  try{
+    while(pending.length){
+      const {value,depth}=pending.pop();
+      if(++nodes>4096||depth>8)return false;
+      if(value===null)continue;
+      if(typeof value==='string'){
+        characters+=value.length;if(value.length>16384||characters>65536)return false;
+      }else if(typeof value==='number'){
+        if(!Number.isFinite(value))return false;
+      }else if(typeof value==='boolean')continue;
+      else if(typeof value==='object'){
+        const keys=Object.keys(value);if(keys.length>512)return false;
+        for(const key of keys){
+          characters+=key.length;
+          if(characters>65536||key.length>64||forbidden.has(key))return false;
+          const next=value[key];
+          if(next===undefined)continue; // Internal GET DTOs may contain omitted optional fields.
+          if(strings.has(key)&&next!==null&&typeof next!=='string')return false;
+          pending.push({value:next,depth:depth+1});
+        }
+      }else return false;
+    }
+    return true;
+  }catch(e){return false;}
+}
+
 // WebSocket Connection Handler
 wss.on('connection', (ws, req) => {
   ws.isAlive = true;
@@ -1203,7 +1241,13 @@
     rysHandshakeToken: extractAuthTokenFromReq(req)
   };
 
+  const rejectInput=()=>{
+    clearRysHandoff(ctx);
+    try{ws.terminate();}catch(e){}
+  };
+  ws.on('error',rejectInput);
   ws.on('message', (raw, isBinary) => {
+    try{
     ws.isAlive = true;
     // PATCH: binary-v51
     if (isBinary) {
@@ -1261,8 +1305,10 @@
     } catch {
       return;
     }
+    if(!isRysClientMessage(msg)){rejectInput();return;}
     if(handleRysNativeHandoff(ctx,msg))return;
     processClientJsonMessage(ctx, msg);
+    }catch(e){rejectInput();}
   });
 
   ws.on('close', () => {
@@ -1554,6 +1600,8 @@
 }
 
 function serveRysRelay(session,req,res,token,context,messages=[]){
+  if((context&&!isRysClientMessage(context))||!Array.isArray(messages)||messages.length>128||
+    !messages.every(isRysClientMessage))return res.status(400).json({error:'relay-invalid-message'});
   if(context&&!['join','family-subscribe','admin-subscribe'].includes(context.type))
     return res.status(400).json({error:'relay-context-invalid'});
   if(!applyRysRelayAuth(session,req,token,context))
@@ -1579,6 +1627,13 @@
 }
 
 app.post('/api/ws-relay',(req,res)=>{
+  if(['clientId','relayKey','token'].some(k=>req.body?.[k]!=null&&
+    (typeof req.body[k]!=='string'||req.body[k].length>16384)))
+    return res.status(400).json({error:'relay-invalid-credentials'});
+  if(req.body?.messages!==undefined&&!Array.isArray(req.body.messages))
+    return res.status(400).json({error:'relay-invalid-message'});
+  if(['relay-open','relay-close'].includes(req.body?.type)&&!isRysClientMessage(req.body))
+    return res.status(400).json({error:'relay-invalid-message'});
   if(req.body?.type==='relay-open'&&req.body.version===56)return openRysRelay56(res);
   if(req.body?.type==='relay-close'&&req.body.version===56)return closeRysRelay56(req,res);
   const {clientId,messages,joinContext,subscriptionContext,token}=req.body||{};
@@ -1588,6 +1643,9 @@
   return serveRysRelay(session,req,res,token,context,list);
 });
 app.get('/api/ws-relay',(req,res)=>{
+  if(['clientId','relayKey','token'].some(k=>req.query?.[k]!=null&&
+    (typeof req.query[k]!=='string'||req.query[k].length>16384)))
+    return res.status(400).json({error:'relay-invalid-credentials'});
   // Legacy GET is retained. Existing joined sessions need not repeat their PIN.
   const q=req.query,mode=q.subscription||'join';
   const context=mode==='admin-subscribe'?{type:mode,token:q.token}:
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -577,6 +577,7 @@
   await runV55RelayEdgeChecks({baseUrl,url:wsUrl,token:authToken});
   await runV56HandoffChecks({baseUrl,url:wsUrl,token:authToken});
   await runV57RoutingChecks({baseUrl,url:wsUrl,token:authToken});
+  await runV58InputChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -2016,6 +2017,110 @@
   console.log('V57 UNIT PASS: idle sweep; 35000/35001ms expiry; stale-route response/retry dropped; same-route retry retained');
 }
 
+async function runV58InputChecks({baseUrl,url,token}){
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
+  const code='RY-V58-'+Date.now().toString(36).toUpperCase(),sockets=[],escaped=[];
+  const monitor=error=>escaped.push(error.name+':'+(error.code||''));
+  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
+  const wait=async predicate=>{
+    const until=Date.now()+2500;while(!predicate()){
+      if(Date.now()>until)throw Error('V58 input deadline');await new Promise(r=>setTimeout(r,5));
+    }
+  };
+  const connect=async options=>{
+    const ws=new WebSocket(url,options),messages=[];let closed=false;
+    sockets.push(ws);ws.on('error',()=>{});ws.on('close',()=>closed=true);
+    ws.on('message',(raw,binary)=>{if(binary)messages.push({binary:Buffer.from(raw)});
+      else try{messages.push(JSON.parse(raw.toString()));}catch(e){}});
+    await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
+    return {ws,messages,closed:()=>closed};
+  };
+  const bootstrap=()=>fetch(baseUrl+'/api/bootstrap',{headers:{Authorization:'Bearer '+token}});
+  process.on('uncaughtExceptionMonitor',monitor);
+  try{
+    assert.equal((await fetch(baseUrl+'/api/tours',{method:'POST',headers,
+      body:JSON.stringify({code,name:'V58 isolated input test',guideName:'V58 guide'})})).status,200);
+    assert.equal((await bootstrap()).status,200);
+    const bad=await connect(),nested='['.repeat(8000)+'0'+']'.repeat(8000);
+    bad.ws.send('{"type":"join","role":"pilgrim","tourCode":'+JSON.stringify(code)+',"roomId":"genel","name":'+nested+'}');
+    await wait(bad.closed);assert(!bad.messages.some(m=>m.type==='joined'),'Invalid name must never become a room member');
+    assert.equal((await bootstrap()).status,200);
+    const guide=await connect();
+    guide.ws.send(JSON.stringify({type:'join',role:'guide',token,tourCode:code,roomId:'genel',name:'V58 guide'}));
+    await wait(()=>guide.messages.some(m=>m.type==='joined'));
+    assert.equal(guide.messages.find(m=>m.type==='joined').room.totalListeners,0);
+    const listener=await connect();listener.ws.send(JSON.stringify({type:'join',role:'pilgrim',tourCode:code,roomId:'genel',name:'Healthy listener'}));
+    await wait(()=>listener.messages.some(m=>m.type==='joined'));
+    // Relay context is rejected before sync/join; no HTTP-to-WS poison path.
+    const opened=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},
+      body:JSON.stringify({type:'relay-open',version:56})});
+    const cap=await opened.json();
+    const raw='{"clientId":'+JSON.stringify(cap.clientId)+',"relayKey":'+JSON.stringify(cap.relayKey)+
+      ',"subscriptionContext":{"type":"join","role":"pilgrim","tourCode":'+JSON.stringify(code)+',"name":'+nested+'}}';
+    const invalid=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
+    assert.equal(invalid.status,400);assert.equal((await bootstrap()).status,200);
+    const credentials=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},
+      body:JSON.stringify({clientId:{toString:null},messages:[]})});
+    assert.equal(credentials.status,400);
+    const coercion=await connect();coercion.ws.send('{"type":"join","tourCode":{"toString":null},"role":"pilgrim"}');
+    await wait(coercion.closed);
+    // A receiver/protocol error belongs to the offending socket, not process.uncaughtException.
+    const unmasked=await connect();unmasked.ws._socket.write(Buffer.from([0x81,0]));await wait(unmasked.closed);
+    const oversized=await connect();oversized.ws.send(Buffer.alloc(65537));await wait(oversized.closed);
+    const cookie=await connect({headers:{Cookie:'unrelated_cookie=%'}});
+    cookie.ws.send(JSON.stringify({type:'family-subscribe',tourCode:code}));
+    await wait(()=>cookie.messages.some(m=>m.type==='family-state'));cookie.ws.close();
+    // Good binary PCM and the existing numeric demo note still work after all rejections.
+    const frame=Buffer.alloc(972);frame.writeUInt32LE(58,0);frame.writeDoubleLE(Date.now(),4);
+    guide.ws.send(frame);await wait(()=>listener.messages.some(m=>m.binary?.readUInt32LE(0)===58));
+    guide.ws.send(JSON.stringify({type:'audio-chunk',synthNote:440,level:.4}));
+    await wait(()=>listener.messages.some(m=>m.type==='audio-chunk'&&m.synthNote===440));
+    assert.equal((await bootstrap()).status,200);assert.deepEqual(escaped,[]);
+    if(typeof recordResult==='function')recordResult('ADIM-3.V58',
+      'Gerçek HTTP/WS: geçersiz metadata state öncesi reddedildi; bozuk frame/cookie yerel kaldı; sağlam PCM/demo devam etti',true);
+    console.log('V58 E2E PASS: malformed anonymous join cannot poison room/bootstrap; receiver errors isolated; healthy PCM/demo preserved');
+  }finally{
+    for(const ws of sockets)ws.terminate();process.removeListener('uncaughtExceptionMonitor',monitor);
+    await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
+  }
+}
+
+async function runStep5V58InputChecks(){
+  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
+  const source=fs.readFileSync(path.join(ROOT_DIR,'server.js'),'utf8').replace(/\r\n/g,'\n');
+  function pick(name){
+    const m=new RegExp('^function '+name+'\\([^\\n]*\\)\\s*\\{','m').exec(source);assert(m,'Missing '+name);
+    for(let end=source.indexOf('}',m.index+m[0].length);end>=0;end=source.indexOf('}',end+1)){
+      const code=source.slice(m.index,end+1);
+      try{new vm.Script(code);return code;}catch(e){if(e.name!=='SyntaxError')throw e;}
+    }throw Error('Unterminated '+name);
+  }
+  const box={AUTH_COOKIE_NAME:'unit_auth',isValidAuthToken:t=>t==='good'};
+  vm.createContext(box);vm.runInContext(pick('isRysClientMessage')+'\n'+pick('extractAuthTokenFromReq'),box);
+  const valid=box.isRysClientMessage;
+  assert(valid({type:'join',name:'Guide',phone:null,lang:'ar'}));
+  assert(valid({type:'admin-subscribe',token:undefined}));
+  assert(!valid({type:'join',name:[]}));assert(!valid({type:'join',name:{}}));
+  assert(!valid({type:'join',tourCode:{toString:null}}));
+  assert(!valid(JSON.parse('{"type":"join","__proto__":{"admin":true}}')));
+  let tree={};for(let i=0;i<9;i++)tree={data:tree};
+  assert(!valid({type:'ping',extra:tree}));assert(!valid({type:'ping',extra:Array(513).fill(0)}));
+  assert(!valid({type:'ping',value:Infinity}));assert(!valid({type:'audio-chunk',synthNote:NaN}));
+  assert(valid({type:'audio-chunk',synthNote:440,level:.4}));
+  assert(valid({type:'quick-announcement',message:'x'.repeat(16384)}));
+  assert(!valid({type:'quick-announcement',message:'x'.repeat(16385)}));
+  const unit=seq=>({type:'audio-chunk',seq,sampleRate:24000,sentAt:1,pcm16:Buffer.alloc(960).toString('base64')});
+  assert(valid({type:'audio-chunk',frames:[unit(0),unit(1),unit(2)]}));
+  assert(valid({type:'handoff-prepare',relayClientId:null,relayKey:null,
+    subscription:{type:'join',role:'pilgrim',tourCode:'X',pin:'1453',name:'Hacı'}}));
+  assert.equal(box.extractAuthTokenFromReq({headers:{cookie:'unrelated=%; unit_auth=g%6f%6fd'}}),'good');
+  assert.equal(box.extractAuthTokenFromReq({headers:{cookie:'unit_auth=%'},query:{token:'good'}}),'good');
+  assert.equal(box.extractAuthTokenFromReq({headers:{cookie:'unit_auth=%'}}),'');
+  if(typeof recordResult==='function')recordResult('ADIM-5.V58',
+    'Metadata tipleri, derinlik/genişlik/string sınırları, tehlikeli anahtarlar, PCM/demo uyumu ve cookie fallback',true);
+  console.log('V58 UNIT PASS: bounded iterative wire validation; non-string metadata rejected; PCM/demo accepted; malformed cookies ignored');
+}
+
 async function main() {
   const runtimePath = path.join(ROOT_DIR, 'data', 'runtime.json');
   const runtimeSnapshot = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : null;
@@ -2027,6 +2132,7 @@
     await runStep5V54AudioChecks();
     await runStep5V56HandoffChecks();
     await runStep5V57RoutingChecks();
+    await runStep5V58InputChecks();
 
     console.log('\n====================================================================');
     console.log(`TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: ${results.length} / ${results.length} [BAŞARILI / PASS]`);
```

<!-- SOURCE-HASHES {"server.js":"081a2a6e51ea2f2ea44d2e5a6e6a172056b8d33090d3e67709dbda105477a9e0","scripts/verify-system.js":"a6657f0a5a97b456c5d44406be08f23261f14f82a0971977cb99e3ee8b1f97c0","public/ani-kitabi.html":"49c5f6af3dfcf33cad2befbbafdeb448a44a37b3877c13d0502ac6507fdce963","public/dinle.html":"f18d8e4626d4fb3430145a166d6475f56c326fb88b19d712fd2847b36af146b2","public/index.html":"572baa2c640b3f11c37e0461e701cacc50a9a6ed8482122f1574487467a560f2","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"8eba7f37d518b0f4748611240e8b938a160b6f0d0fd6118d8aecaa0a424f35f3","public/panel.html":"758bac58b933eec6126ab765ca32b974a33be92d572e241eb54789cef8aa46aa","public/pcm-capture-worklet.js":"e6f7c223b92928825481589f626e53b64ff70c17710f668000440c68d559e564","public/pcm-player-worklet.js":"9bfbcb06d2904d375ff06498e232cc09a32c5c9624b36bb8947bbc5270323183","public/rehber.html":"5ddd9e2f2549f1584c1c28964b4c45411b7c177da5253df1d70a29d9384d79ec","public/rota.html":"9fb74d5cd19981ab37ff283780a71166d14cc8355502e160173137dddba95467","public/sw.js":"2d70f5c3bb559a68f5c6dfc4a4d405b39ae088c29d5f2a3e16e1ccb95cbaab05","public/vercel-ws-shim.js":"33831bb515dcec2932c2060f67882cc2a1e720c14f1726dde8ff2b410a962d6f","public/yaka-karti.html":"8c2b69c27249b31a716660f001c9624377d9ad8c40c8f6b5657cf8f8e2b8b260"} -->

## 8. Son teslim kanıtı ve nihai değerlendirme

Son aday koşusunun ilgili çıktısı:

```text
[BAŞARILI / PASS] ADIM-3.V58 — Gerçek HTTP/WS: geçersiz metadata state öncesi reddedildi; bozuk frame/cookie yerel kaldı; sağlam PCM/demo devam etti
V58 E2E PASS: malformed anonymous join cannot poison room/bootstrap; receiver errors isolated; healthy PCM/demo preserved
[BAŞARILI / PASS] ADIM-5.V58 — Metadata tipleri, derinlik/genişlik/string sınırları, tehlikeli anahtarlar, PCM/demo uyumu ve cookie fallback
V58 UNIT PASS: bounded iterative wire validation; non-string metadata rejected; PCM/demo accepted; malformed cookies ignored
TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: 34 / 34 [BAŞARILI / PASS]
```

İnceleme sonunda15 gerçek kaynak dosyasının SHA-256 değerleri başlangıçla aynı kaldı. Kaynaklar hâlâ1536654 sürümündedir. Başlangıçtaki iki kullanıcı silinmesi korundu; runtime snapshot geri yüklendi. Tek güncellenen teslim dosyası bu rapordur.

**Nihai değerlendirme:** v57’nin uygulanması, rota izolasyonu/35 sn davranışı ve32/32 disk sonucu onaylanır. Yeni biçimsel-girdi ve bağlantı-hata tekrar üretimleri nedeniyle tüm katmanlar için koşulsuz onay verilmez. Öncelik, P1’de geçersiz metadata’nın oda durumuna hiç girmemesidir; P2’de beklenen istemci hatalarının yalnız kendi bağlantısını etkilemesi sağlanmalıdır. Raporun v58 yaması belirtilen34/34 yerel önizlemeden geçmiştir; gerçek kaynaklara veya production’a uygulanmamıştır.
