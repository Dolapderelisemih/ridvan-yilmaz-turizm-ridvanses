# RıdvanSes v54 — Transport, Relay ve Abonelik Eşliği Denetimi

**Tarih:** 8 Kasım 2026  
**Diskte incelenen HEAD:** `d515333b8d7447460562b1d6ea6c4bc756edcdda`  
**Karar:** Önceki raporda verilen v54 yaması eksiksiz uygulanmış; diskten **27/27 PASS + V53 PASS + V54 PASS, exit 0** doğrulandı. Buna rağmen bütün aktarım yolları için nihai kusursuzluk onayı verilemez: testlerin dışında kalan **bir P1 boş-poll kusuru**, **bir P2 kısmi metadata kaybı** ve önceki raporda açık bırakılan **P1 atomik handoff riski** gerçek yerel sunucuda yeniden üretildi.

Yalnız bu rapor güncellendi. Kaynaklara yama uygulanmadı; aşağıdaki v55 önerisi rapor içindedir. Başlangıçta silinmiş görünen `AUDIT_FIX_SUMMARY.md` ve `AUDIT_REPORT.md` korunur. Yerel test paketi runtime.json snapshot’ını geri yükler.

## 1. Doğrudan disk doğrulaması ve yama eşliği

Çalıştırıldı:

```powershell
node scripts/verify-system.js
```

Gözlenen son çıktı:

```text
[BAŞARILI / PASS] ADIM-3.V54 — Gerçek HTTP/WS: family/admin kapsamı, ilk PIN/yeniden poll, tek ACK ve yayın saati doğrulandı
V53 PASS: source-only DSP/SRC/comfort/profile, queue/PLC/seq, binary+JSON dedup, coalescer, congestion, HTTP single-flight/drain/close, gesture/wake/pause
[BAŞARILI / PASS] ADIM-5.V54 — Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü
V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs
TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: 27 / 27 [BAŞARILI / PASS]
```

Süreç çıkışı **0**. 18 JS dosyasının sözdizimi, 9 HTML içindeki 10 inline script, gerçek yerel HTTP/WS ve kaynak davranış testleri geçti. “27” sonuç grubu sayısıdır; bütün protokol kombinasyonlarının tüketildiği anlamına gelmez.

Önceki raporun v54 unified diff’i, kaynaklara yazmadan `git apply --reverse --check --ignore-space-change -` ile kontrol edildi: **exit 0**. Bu, önceki rapordaki 12 kaynak dosyası değişikliğinin mevcut ağaçta bulunduğunu doğrular. v54 commit’inde capture/player motorları değişmemiştir. Dolayısıyla bir uygulama eksikliğinden çok, önceki çözüm ve test kapsamının dışında kalan davranışlar söz konusudur.

### İstemdeki kod özeti ile gerçek depo arasındaki farklar

Aşağıdaki gerçek satırlar bu HEAD için geçerlidir; istemdeki 1682–1855 / 622–814 aralıkları bu depoyla eşleşmiyor.

| Konu | Gerçek uygulama |
|---|---|
| Auth | `server.js:1346–1351`: `applyRysRelayAuth(session, req, token, context)`. session ve session.ws isAuthenticated yeniden hesaplanır. Geçersiz istekte mevcut ws.isAdmin silinmez; ayrıcalıklı oturumun401 gerektirmesi böyle korunur. `wsSession.user` alanı burada yoktur. |
| Join | `server.js:1353–1371`: alan adı `name`; role/oda eşleşmesi ve name/deviceId/phone/lang karşılaştırması var. PIN metadata karşılaştırmasına dahil değil; gerçek yeni join’de mevcut PIN kontrolü çalışır. Geçerli aynı üyelik her poll’da yeniden PIN istemez. |
| Family/admin | `server.js:1375–1395`. Family üyelik oluşturmaz, ws.familyTourCode kullanır. `role='family'` / `familyRoom` atanmaz. Gerçek ACK’lar `family-state` ve `admin-rooms-update`; burada `admin-rooms`, `global-stats`, `p-telemetry` veya `loc-update` protokolü yoktur. |
| startedAt | `server.js:1003–1024`, `guide-stream-state` işleyicisinde; join işleyicisinde değil. Devam eden yayında saat korunur, stop→start’ta yenilenir. |
| Failback | `public/vercel-ws-shim.js:293–349`: ACK önce334’te iletilir;336’da object snapshot konur; onopen337; finally339’da temizlenir. Aynı abonelik644–648’de `_msgId` hariç alan alan karşılaştırılır. `=== trimmed` veya yalnız ilk mesajı yutan bir string karşılaştırması değildir. |
| Boş poll | `public/vercel-ws-shim.js:842–874`: `_subscriptionType` / `_joinContext` kullanır; `_lastSubscription` yoktur. Gövde POST’tur, fakat847’deki erken return aşağıdaki P1’i yaratır. |
| Testler | `scripts/verify-system.js:1348–1422` runV54RelayRoundTrip;1425–1526 runStep5V54AudioChecks. Gerçek testler sequential assertion içerir; istemdeki named boolean listesi kaynakta yoktur. |

Bunlar tek başına uygulama hatası değildir; rapor çalışan depoyu esas alır. Özellikle isAdmin’i doğrulama öncesi körlemesine temizlemek önerilmez: mevcut ayrıcalıklı oturuma ait outbox’ı yetkisiz boş poll’dan koruyan401 kuralı korunmalıdır.

## 2. Doğrulanan v54 davranışları

| Davranış | Sonuç / sınır |
|---|---|
| PINli turda HTTP family | Tek family-state, sahte pilgrim üyeliği yok, dinleyici sayısını artırmıyor. Native family ile aynı kamusal kapsam. |
| HTTP admin auth | Yeni ve mevcut abonelikte yetkisiz istek401; doğru token ile ACK. Backend doğrulaması geçiyor. |
| Header+batch aynı abonelik | Header güncel bağlam kabul edilip batch abonelikleri atlanıyor; aynı oturuma çift join/subscribe yapılmıyor. |
| startedAt | Aynı canlı oturumdaki metadata güncellemesi koruyor; durdur→başlat yeniden zamanlıyor. |
| Native failback | Probe ACK doğrulanmadan istemci geçmiyor. Senkron onopen’daki aynı abonelik tekrar gönderilmiyor; güncel live metadata gönderiliyor. ACK→open sırası ve coalescer8/9→10/11 sırası testte doğru. |
| PIN taşıma | Gerçekleşen boş poll POST gövdesinde PIN/device/phone/lang taşır. Mevcut üyeliğe legacy GET PIN’siz çalışır; yeni üyeliğe PIN gerekir. Broker bağlıyken boş poll’un hiç gerçekleşmemesi aşağıda ayrı kusur. |
| Cache | Sekiz shim yükleyicisi54, dinle SW register54, cache adı v54. Değişmeyen worklet’lerin53-audio kalması tutarlıdır; sürüm hatası değildir. |
| DSP / player | v53 motorları ve mevcut sınır testleri geçiyor; bu commit’te yeni bir capture/player regresyonu bulunmadı. Saha akustik mükemmelliği kanıtı değildir. |

Failback baskılama, mevcut senkron onopen gövdesi süresince çalışır. Daha sonra async callback’ten gönderilen join yeni protokol isteğidir; mevcut sayfa işleyicileri senkrondur. Eski coalescer timer’ı generation ile etkisizleşir; bu alanda yeni bir kusur saptanmadı.

## 3. Kalan bulgular: gerçek yerel tekrar üretimleri

### P1-01 — Broker bağlı diye HTTP alımının tamamen durması

**Yer:** `public/vercel-ws-shim.js:847`:

```js
if(!batch.length&&this._busConnected())return;
```

Broker’a bağlanmak, bu odanın rehberinin o broker’a ses bastığını göstermez. Rehber native VDS WS üzerinden yayındayken yalnız hacının WS’i başarısız olabilir. Hacı MQTT’ye bağlanır, fakat native rehber MQTT’ye yayın yapmaz. Sunucu sesi HTTP relay outbox’ına yazar (`server.js:1227–1252`); hacının boş gönderim kuyruğunda poll847’de atlandığından ses hiç alınmaz. Family/admin için de native rehberin sunucu üzerinden ürettiği güncellemeler alınmaz. 35 sn sonra HTTP oturumu temizlenebilir (`server.js:738–746`).

**Ölçülen fixture:** Gerçek yerel sunucuya native rehber + HTTP hacı bağlandı. Rehber972B, seq7 PCM yolladı. Gerçek _flushAndPoll metodu, broker-connected=true stub’ı ve gerçek fetch ile çağrıldı:

```text
AUDIT V54 CONNECTED MQTT EMPTY POLL:
{"fetches":0,"deliveredAudio":0,"serverStillHadAudio":[7]}
```

Son alan, aynı oturumu doğrudan HTTP’den sorgulayarak seq7’nin gerçekten sunucuda beklediğinin görülmesidir. MQTT bağlantısı fixture ile modellenmiştir; kamu broker’ına yayın yapılmadı. Bu kusuru kanıtlamak için gerçek broker gerekmez: erken return fetch’i koşulsuz engeller.

**Neden27 PASS yakalamadı?** scripts/verify-system.js:1508–1518 boş poll testlerinde yalnız _busConnected=false kullanıyor. Failback testlerindeki connected=true ise HTTP alımını sınamıyor.

**Düzeltme:** Bu erken return kaldırılmalı. HTTP, MQTT bağlıyken de alım/kontrol yolunu sürdürmeli; gerçek tekrar ses worklet seq denetimiyle tekilleştirilir. Mevcut100 ms poll aralığı korunur. Uzun vadede HTTP’yi atlamak ancak oda/publisher/stream-epoch bazlı, ölçülmüş teslim kanıtıyla güvenli olabilir; salt broker bağlantı bayrağı yeterli değildir.

### P2-02 — Kısmi metadata güncellemesi verilmemiş alanları siliyor

**Yer:** `server.js:1359–1371`; güncellemenin çağırdığı `processClientJsonMessageV49` join kısmı `937–946`.

metadataMatches yalnız verilen alanları karşılaştırır; herhangi biri değişirse V49 tam clientObj oluşturur. V49’da verilmemiş deviceId/phone/lang varsayılanlara döner, verilmemiş name yeniden varsayılan isim olur.

**Ölçülen örnek:** Önce name+phone+deviceId+lang='ar' ile HTTP katılımı; sonra aynı oda/rol için yalnız name değiştirilir. Gerçek native rehberin joined snapshot’ında:

```text
AUDIT V54 PARTIAL METADATA:
{"phone":"","lang":"tr","name":"Updated name"}
```

Beklenen phone='audit-phone', lang='ar'. DeviceId de aynı tam-nesne oluşturma yolunda boşalır; zombie cihaz tekilleştirmesini zayıflatır. Telefon kaybı SOS iletişim metadata’sını, dil kaybı içerik tercihlerini etkiler. Normal UI’ın tam context POST’u bu sorunu çoğunlukla örtse de legacy GET/kısmi POST desteklenen yoldur.

**Neden27 PASS yakalamadı?** İsim değiştirme testi `1385–1390` ilk katılımcıya phone/deviceId/lang vermiyor; bu nedenle varsayılanlara dönmeyi fark etmiyor. Verilmemiş alanların *hiç güncelleme olmayan* poll’da korunması test ediliyor; bir başka alan değişirken korunması test edilmiyor.

**Düzeltme:** Yalnız mevcut aynı oda/rol üyeliğinde, gerçek join çağrısından önce verilmemiş metadata’yı eski üyeden tamamla. PIN/token’ı devralma; başka oda veya role eski kimliği taşımama. Aşağıdaki yama bunu yapar ve ilk/sonraki aynı context tek-ACK davranışını korur. Boş string açık bir alan silme isteği olarak, undefined ise verilmemiş alan olarak kalır (name’in mevcut falsy-semantikleri korunur).

### P1-03 — Geç gelen eski relay isteği yeni native soketi öldürebiliyor

**Yer:** `server.js:948–962` sameDevice/sameGuide silmesi; `1370` relay yeniden join’i; shim probe join’i `314–324`.

Bu, önceki raporda açık bırakılan atomik devir riskidir; v54 ile getirilen çift-join düzeltmesinin başarısız olduğu anlamına gelmez. İstemci ACK gating’i ile sunucu devir atomikliği farklıdır.

**Gerçek yerel sunucuda oluşturulan sıra:**

1. HTTP rehber aynı tur/oda/deviceId ile katılır.
2. Native probe aynı kimlikle katılır ve joined alır; eski HTTP üye kaydı temizlenir.
3. Aynı eski HTTP oturumunun bir isteği daha sunucuda işlenir.
4. syncRysRelayJoin üyeyi göremeyince tekrar join yapar; sameDevice/sameGuide native soketi terminate eder.

```text
AUDIT V54 STALE RELAY AFTER NATIVE JOIN:
{"nativeTerminated":true}
```

Bu tanı, eski isteğin sunucuda native join’den sonra işlenmesi sırasını açıkça üretir. Gerçek shim’de ağda/HTTP katmanında bekleyen bir isteğin gecikmesi modellenir; fiziksel roaming veya browser abort zamanlaması ölçülmedi. AbortController sunucuda kabul edilmiş işi geri alamaz.

**Çözüm kapsamı:** Sunucunun verdiği, yetki/oda/cihazla bağlı handoff kimliği; yan etkisiz prepare; doğrulanmış commit; eski relay generation’ına409/fencing; cancel/timeout rollback. Prepare’daki yeni rehberin eski üyeyi silmemesi gerekir. İstemcide yalnız ikinci bir join’i yutmak bu çözüm değildir. Aşağıdaki iki küçük v55 düzeltmesi bu büyük protokolü uygulamaz; bu bulgu açık kalır. Geçici olarak failback’i devre dışı bırakmak riski azaltır fakat native’e otomatik dönüşü kaybettirir; ana yamaya böyle bir davranış değişikliği eklenmedi.

## 4. DSP, akustik ve mobil sınırların güncel değerlendirmesi

`public/pcm-capture-worklet.js` ve `public/pcm-player-worklet.js` v54 commit’inde değişmedi. Mevcut testler 24/44.1/48 kHz’de sonlu örnekleri,128/2048 chunk eşliğini, seçili FIR frekanslarını, comfort açılışını, profil bypass’ını, aktif trim/PLC/starvation/wrap ve binary+JSON tekilleştirmesini sınar.

- Capture72 örnek sabit comfort delay=3 ms,48 örnek sonlu açılış=2 ms; inner lookahead240 örnek=10 ms. FIR yaklaşık2–2.18 ms; toplam algoritmik≈15 ms.20 ms frame, donanım, ağ ve player hedefi buna eklenir.
- `firstSample=312, gain=1` kontrollü VAD fixture’ıdır. Gerçek kalabalıkta yumuşak ünsüz korunumunu tek başına kanıtlamaz.400 ms yeniden kalibrasyon konuşma sırasında attenuasyon yapabilir.
- .126 kapalı gate kazancı≈−18 dB; kaynak kimliği/mesafe ayrıştırması değildir. Rehber konuşurken aynı banttaki yan konuşma geçebilir. AEC true donanım beamforming veya başka telefonların gecikmiş hoparlör yankısının bastırılması garantisi değildir. [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) constraint ve işleme davranışını tanımlar.
- Player80–260 ms adaptif hedef, kısa PLC ve ±1000 ppm ASRC kullanır. q33→24 budaması180 ms gerçek medya atar;3 ms crossfade sözcükleri geri getirmez. Starvation yeniden ön tamponlama gerektirir.
- iOS/Android arama, ekran kilidi ve OS durdurmasından sonra token/context guard güvenli toparlanma sağlar; işletim sisteminin ses donanımını alıkoyduğu sürede kesintisiz ses garanti edilemez. [Web Audio API](https://www.w3.org/TR/webaudio/) rendering ve interrupted/suspended durumlarını tanımlar.
- Test logundaki “>−115 dB stopband” başlığı genellenmemeli: ADIM-4.9 assertion’ı seçili16/20 kHz noktalarında −110 dB altını şart koşar;48k/16k ölçümü −118.06 dB. Bütün frekans/cihaz matrisi ölçülmüş değildir.

Bu turda bu iki motora yeni yama önerilmiyor. Herkese açık MQTT broker’ı ve istemcide görünen sabit ile türetilen _rySig güven modeli de önceki mimari sınırlama olarak sürüyor; sunucu PIN/auth kontrolünün bu yol için eşdeğer olduğu varsayılamaz. Özel broker/oda ACL ve sunucu tarafından verilen kısa ömürlü kimlik gerekir.

## 5. Test kapsamı, dağıtım ve kapasite notları

- Baseline gerçek kaynaklardan, rapora bağımlı olmadan27/27 geçti.
- Ek tanı koşusu yalnız verify kodunu bellekte genişletti; gerçek server.js diskteki sürümdü. Yukarıdaki üç çıktı bu koşudan gelir. Genel27 sonuç yine geçti; tanılar mevcut test paketine eklenmedi.
- Yeni pozitif regresyon, kendi PINli turunda kısmi isim ve telefon düzenlemesini, metadata’nın korunmasını, deviceId’nin native dedup ile korunmasını, native972B PCM’in HTTP alıcıya ulaşmasını ve MQTT-connected=true iken family/admin delta alımını sınar.
- Kaynak testi ayrıca3 abonelik tipi ×2 broker durumu olmak üzere6 boş-poll kombinasyonu içerir. Cache assertions55’e güncellenir; eski v53/v54 fonksiyonel kontroller korunur.
- Mevcut100 ms HTTP poll’u MQTT bağlıyken de sürdürmek doğruluğu sağlar;≈10 istek/sn/istemci üretir.1000 relay istemcisi≈10.000 istek/sn demektir. Bu küçük düzeltme kapasite onayı değildir. Daha büyük ölçek için kontrollü taşıma/SFU ve ayrı kontrol/ses akışı gerekir.
- GitHub/origin, Oracle ve Vercel dağıtımı talepte verilen bilgidir. [VDS](https://ses.ridvanyilmazturizm.com) ve [Vercel](https://ridvanses.vercel.app) adreslerine salt okunur web erişimi denendi; araç erişimi sağlayamadı. Bu sonuç sitelerin kapalı olduğuna kanıt değildir. SSH/deploy SHA, production yük ve fiziksel cihaz testleri yapılmadı.

## 6. Uygulanabilir küçük v55 yaması

**Hedef:** d515333. Yalnız P1-01 ve P2-02, ilgili test ve cache sürümleri. P1-03 atomik handoff ve MQTT güven mimarisi kapsam dışı kalır; yama için genel “bütün sorunlar çözüldü” iddiası yoktur.

Aşağıdaki tam unified diff rapordadır; denetim sırasında gerçek kaynaklara uygulanmaz. İleride UTF-8 patch olarak çıkarıp önce `git apply --check`, ardından `git apply` ve `node scripts/verify-system.js` çalıştırılabilir. Sekiz shim URL’si/cache/SW register55 olur; değişmeyen DSP worklet URL’leri53-audio kalır. Beklenen sonuç mevcut27 gruba ek bir gerçek E2E grubu ile28’dir.

Önce server, sonra istemci/shim+cache dağıtımı önerilir. Bu sıralama kısmi güncellemede yeni metadata davranışını hazır eder; hem eski hem yeni istemci için HTTP kusuru ancak yeni shim ile giderilir. Fiziksel saha testi ve handoff protokolü ayrıca tamamlanmalıdır.


```diff
diff --git a/server.js b/server.js
--- a/server.js
+++ b/server.js
@@ -1367,7 +1367,19 @@
     }
     return true;
   };
-  if(!matches()||!metadataMatches())processClientJsonMessage(session,joinContext);
+  if(!matches()||!metadataMatches()){
+    const previous=matches()?session.currentRoom.clients.get(session.clientId):null;
+    // Preserve omitted metadata only for this existing room/role membership.
+    // PIN/token are never inherited, and another room/role gets no old identity.
+    const effective=previous?{
+      ...joinContext,
+      name:joinContext.name||previous.name,
+      deviceId:joinContext.deviceId===undefined?previous.deviceId:joinContext.deviceId,
+      phone:joinContext.phone===undefined?previous.phone:joinContext.phone,
+      lang:joinContext.lang===undefined?previous.lang:joinContext.lang
+    }:joinContext;
+    processClientJsonMessage(session,effective);
+  }
   return !!(matches()&&metadataMatches());
 }
 
diff --git a/scripts/verify-system.js b/scripts/verify-system.js
--- a/scripts/verify-system.js
+++ b/scripts/verify-system.js
@@ -574,6 +574,7 @@
   await runV51TransportRoundTrip({url:wsUrl,token:authToken});
   await runV53RelayRoundTrip({baseUrl,token:authToken});
   await runV54RelayRoundTrip({baseUrl,url:wsUrl,token:authToken});
+  await runV55RelayEdgeChecks({baseUrl,url:wsUrl,token:authToken});
 
   guideGenelWs.close();
   pilgrimWs.close();
@@ -1509,20 +1510,114 @@
   const bodies=[],relay=box('class Relay{'+pick(shim,'_flushAndPoll','method')+'}\nglobalThis.R=Relay;','',{
     localStorage:{getItem:()=>''},fetch:async(url,opts)=>{assert.equal(url,'/api/ws-relay');assert.equal(opts.method,'POST');
       bodies.push(JSON.parse(opts.body));return {ok:true,json:async()=>({messages:[]})};}}).c;
-  for(const mode of ['family-subscribe','admin-subscribe','join']){
+  for(const connected of [false,true])for(const mode of ['family-subscribe','admin-subscribe','join']){
     const s=new relay.R();Object.assign(s,{readyState:1,_isRelay:true,_sendQueue:[],_clientId:'unit',
       _subscriptionType:mode,_joinContext:{type:'join',tourCode:'X',role:'pilgrim',pin:'1453',deviceId:'device'},
-      _busConnected:()=>false,_deliverIncomingMessage(){},_enqueueRelayMessage(){}});
-    await s._flushAndPoll();const body=bodies.at(-1);assert.equal(body.subscriptionContext.type,mode);
+      _busConnected:()=>connected,_deliverIncomingMessage(){},_enqueueRelayMessage(){}});
+    const before=bodies.length;await s._flushAndPoll();
+    assert.equal(bodies.length,before+1,'Broker connectivity must not suppress empty polling');
+    const body=bodies.at(-1);assert.equal(body.subscriptionContext.type,mode);
     if(mode!=='join')assert.equal(body.joinContext,null);
     else{assert.equal(body.subscriptionContext.pin,'1453');assert.equal(body.subscriptionContext.deviceId,'device');}
   }
-  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v54"));assert(sw.includes('/vercel-ws-shim.js?v=54'));
+  const sw=read('public/sw.js');assert(sw.includes("ridvanses-pwa-v55"));assert(sw.includes('/vercel-ws-shim.js?v=55'));
   for(const f of fs.readdirSync(path.join(root,'public')).filter(f=>f.endsWith('.html'))){
-    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'54',f+' stale shim');
+    for(const m of read('public/'+f).matchAll(/vercel-ws-shim\.js\?v=(\d+)/g))assert.equal(m[1],'55',f+' stale shim');
   }
   if(typeof recordResult==='function')recordResult('ADIM-5.V54','Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü',true);
   console.log('V54 PASS: 3 sample rates; DSP/profile bounds; PLC restart/wrap; single join/ACK for 3 modes; pending/coalescer order; POST context; all shim URLs');
+}
+
+// v55: partial identity update and mixed native/HTTP while MQTT is connected.
+async function runV55RelayEdgeChecks({baseUrl,url,token}){
+  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
+  const assert=require('node:assert/strict'),{WebSocket}=require('ws');
+  const stamp=Date.now().toString(36),code='RY-V55-'+stamp.toUpperCase();
+  const cid='v55-listener-'+stamp,deviceId='v55-device-'+stamp;
+  const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
+  const post=async body=>{
+    const r=await fetch(baseUrl+'/api/ws-relay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
+    assert.equal(r.status,200);return r.json();
+  };
+  const wait=async fn=>{
+    const until=Date.now()+2000;
+    while(!fn()){if(Date.now()>until)throw Error('V55 deadline');await new Promise(r=>setTimeout(r,5));}
+  };
+  const connect=async join=>{
+    const s=new WebSocket(url),messages=[];
+    s.on('message',(raw,binary)=>{if(!binary)try{messages.push(JSON.parse(raw.toString()));}catch(e){}});
+    await new Promise((resolve,reject)=>{s.once('open',resolve);s.once('error',reject);});
+    s.send(JSON.stringify(join));await wait(()=>messages.some(m=>m.type==='joined'));
+    return {s,messages};
+  };
+  let guide,secondListener;
+  try{
+    const created=await fetch(baseUrl+'/api/tours',{method:'POST',headers,
+      body:JSON.stringify({code,name:'V55 relay regression',pin:'1453',guideName:'V55 guide '+stamp})});
+    assert.equal(created.status,200);
+    const initial={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',pin:'1453',
+      name:'Initial name',phone:'audit-phone',deviceId,lang:'ar'};
+    await post({clientId:cid,subscriptionContext:initial,messages:[initial]});
+    const partial={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',pin:'1453',name:'Updated name'};
+    await post({clientId:cid,subscriptionContext:partial,messages:[partial]});
+    const guideJoin={type:'join',role:'guide',token,tourCode:code,roomId:'genel',name:'V55 guide '+stamp};
+    guide=await connect(guideJoin);
+    const observed=guide.messages.find(m=>m.type==='joined').room.connectedPilgrims.find(p=>p.id===cid);
+    assert.equal(observed.name,'Updated name');assert.equal(observed.phone,'audit-phone');
+    assert.equal(observed.lang,'ar','Partial rename must preserve language');
+    // A phone-only edit must preserve the already updated name and stable device.
+    const phoneOnly={type:'join',role:'pilgrim',tourCode:code,roomId:'genel',pin:'1453',phone:'updated-phone'};
+    await post({clientId:cid,subscriptionContext:phoneOnly,messages:[phoneOnly]});
+    const joinedCount=guide.messages.filter(m=>m.type==='joined').length;
+    guide.s.send(JSON.stringify(guideJoin));
+    await wait(()=>guide.messages.filter(m=>m.type==='joined').length>joinedCount);
+    const afterPhone=guide.messages.filter(m=>m.type==='joined').at(-1).room.connectedPilgrims.find(p=>p.id===cid);
+    assert.equal(afterPhone.name,'Updated name');assert.equal(afterPhone.phone,'updated-phone');assert.equal(afterPhone.lang,'ar');
+    await post({clientId:cid,subscriptionContext:phoneOnly,messages:[]});
+    const source=fs.readFileSync(path.join(ROOT_DIR,'public/vercel-ws-shim.js'),'utf8').replace(/\r\n/g,'\n');
+    const begin=source.indexOf('    async _flushAndPoll(){');
+    const end=source.indexOf('\n    // PATCH: shim-close',begin);
+    assert(begin>=0&&end>begin);
+    let browserToken='',fetchCount=0;
+    const sandbox={AbortController,setTimeout,clearTimeout,queueMicrotask,Date,console,
+      localStorage:{getItem:()=>browserToken},
+      fetch:(route,options)=>{fetchCount++;assert.equal(route,'/api/ws-relay');assert.equal(options.method,'POST');return fetch(baseUrl+route,options);}};
+    vm.createContext(sandbox);
+    vm.runInContext('class Relay{'+source.slice(begin,end)+'}\nglobalThis.R=Relay;',sandbox);
+    const make=(mode,context,id)=>{
+      const r=new sandbox.R(),delivered=[];
+      Object.assign(r,{readyState:1,_isRelay:true,_clientId:id,_subscriptionType:mode,_joinContext:context,
+        _sendQueue:[],_busConnected:()=>true,_deliverIncomingMessage:m=>delivered.push(m),_enqueueRelayMessage(){}});
+      return {r,delivered};
+    };
+    const listener=make('join',phoneOnly,cid);
+    const frame=Buffer.alloc(972);frame.writeUInt32LE(7,0);frame.writeDoubleLE(Date.now(),4);
+    guide.s.send(frame);await new Promise(r=>setTimeout(r,25));
+    await listener.r._flushAndPoll();
+    assert.equal(fetchCount,1,'A connected broker must not suppress an empty HTTP poll');
+    assert(listener.delivered.some(m=>m.type==='audio-chunk'&&m.seq===7),'Native guide PCM must reach the HTTP listener');
+    // Family/admin control messages also need HTTP when their broker has no publisher.
+    const familyContext={type:'family-subscribe',tourCode:code},familyId='v55-family-'+stamp;
+    const adminContext={type:'admin-subscribe',token},adminId='v55-admin-'+stamp;
+    await post({clientId:familyId,subscriptionContext:familyContext,messages:[familyContext]});
+    await post({clientId:adminId,token,subscriptionContext:adminContext,messages:[adminContext]});
+    const family=make('family-subscribe',{tourCode:code},familyId),admin=make('admin-subscribe',null,adminId);
+    guide.s.send(JSON.stringify({type:'guide-stream-state',isLive:true,broadcastMode:'mic'}));
+    await wait(()=>guide.messages.some(m=>m.type==='stream-state'&&m.isLive));
+    await family.r._flushAndPoll();assert(family.delivered.some(m=>m.type==='stream-state'&&m.isLive));
+    browserToken=token;await admin.r._flushAndPoll();browserToken='';
+    assert(admin.delivered.some(m=>m.type==='admin-rooms-update'&&m.rooms.some(r=>r.tourCode===code&&r.isLive)));
+    // Native dedup verifies preservation of deviceId, which is not in serializeRoom.
+    secondListener=await connect({...initial,name:'Replacement device'});
+    const room=secondListener.messages.find(m=>m.type==='joined').room;
+    assert.equal(room.totalListeners,1,'Partial metadata must preserve deviceId for native dedup');
+    if(typeof recordResult==='function')recordResult('ADIM-3.V55',
+      'Kısmi kimlik korunumu; MQTT bağlıyken native PCM ve family/admin HTTP güncellemeleri',true);
+    console.log('V55 PASS: partial name/phone/lang/device preservation; broker-connected empty HTTP poll; mixed native PCM; family/admin deltas');
+  }finally{
+    guide?.s.close();secondListener?.s.close();
+    await fetch(baseUrl+'/api/tours/'+code,{method:'DELETE',headers:{Authorization:'Bearer '+token}});
+  }
 }
 
 async function main() {
diff --git a/public/vercel-ws-shim.js b/public/vercel-ws-shim.js
--- a/public/vercel-ws-shim.js
+++ b/public/vercel-ws-shim.js
@@ -844,7 +844,8 @@
       const epoch=this._httpEpoch||0;
       const batch=this._sendQueue.splice(0).filter(m=>m.type!=='audio-chunk'||
         (Number.isFinite(m._queuedAt)&&Date.now()-m._queuedAt<=200));
-      if(!batch.length&&this._busConnected())return;
+      // Broker connectivity does not prove this room has an MQTT publisher.
+      // Keep HTTP receive/control active; the player deduplicates audio by seq.
       this._inFlight=true;const ac=new AbortController();this._relayAbort=ac;
       const timer=setTimeout(()=>ac.abort(),3000);let success=false;
       try{
diff --git a/public/sw.js b/public/sw.js
--- a/public/sw.js
+++ b/public/sw.js
@@ -1,14 +1,14 @@
 // PATCH: sw-v53
 // PATCH: sw-v53
 // PATCH: sw-v53
-const CACHE_NAME = 'ridvanses-pwa-v54';
+const CACHE_NAME = 'ridvanses-pwa-v55';
 const ASSETS_TO_CACHE = [
   '/',
   '/dinle',
   '/rota',
   '/ani-kitabi',
   '/css/style.css',
-  '/vercel-ws-shim.js?v=54',
+  '/vercel-ws-shim.js?v=55',
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
-  <script src="/vercel-ws-shim.js?v=54"></script>
+  <script src="/vercel-ws-shim.js?v=55"></script>
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
-  <script src="/vercel-ws-shim.js?v=54"></script>
+  <script src="/vercel-ws-shim.js?v=55"></script>
   <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
   <script src="/js/umrah-steps-map.js?v=47"></script>
   <style>
@@ -2555,7 +2555,7 @@
     if ('serviceWorker' in navigator) {
       window.addEventListener('load', () => {
         // PATCH: sw-register-v53
-        navigator.serviceWorker.register('/sw.js?v=54').catch(() => {});
+        navigator.serviceWorker.register('/sw.js?v=55').catch(() => {});
       });
     }
 
diff --git a/public/index.html b/public/index.html
--- a/public/index.html
+++ b/public/index.html
@@ -82,7 +82,7 @@
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=19" />
   <title>Rıdvan Yılmaz Turizm | RıdvanSes — Dijital Sesli Rehberlik & Kafile Sistemi</title>
   <link rel="stylesheet" href="/css/style.css?v=19" />
-  <script src="/vercel-ws-shim.js?v=54"></script>
+  <script src="/vercel-ws-shim.js?v=55"></script>
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
-  <script src="/vercel-ws-shim.js?v=54"></script>
+  <script src="/vercel-ws-shim.js?v=55"></script>
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
-  <script src="/vercel-ws-shim.js?v=54"></script>
+  <script src="/vercel-ws-shim.js?v=55"></script>
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
-  <script src="/vercel-ws-shim.js?v=54"></script>
+  <script src="/vercel-ws-shim.js?v=55"></script>
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
-  <script src="/vercel-ws-shim.js?v=54"></script>
+  <script src="/vercel-ws-shim.js?v=55"></script>
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
-  <script src="/vercel-ws-shim.js?v=54"></script>
+  <script src="/vercel-ws-shim.js?v=55"></script>
   <style>
     .print-toolbar {
       background: linear-gradient(155deg, #06231B 0%, #093529 100%);
```

<!-- SOURCE-HASHES {"server.js":"ef95cff83a8407243577a3d6f92636ad18db5a362e5b77dda7f65d9909cb5d84","scripts/verify-system.js":"1a0373cb85bce0c54839ba4270c90eff68b26d53dc77bf82cd5af101dfd4ac2e","public/ani-kitabi.html":"5ca2f9eee77e5e50d94011dae421e11bd8d91480fb35517854471b914da570e8","public/dinle.html":"417dec5161f3db3b88b0e89f8f701d03f7c13b22897abc29f8f25d982fa6814b","public/index.html":"121fbd7f315923b9b108e2c1b7120e877f9061d8383eec0b216587b4e745cbe6","public/kullanim-rehberi.html":"c019fb50dfcf83d1097920c3210c3dea82b071de2e1000ffa15c39ad6f71de3e","public/login.html":"f2f25b098da7a1971489890e989f81ce6ff5643eea7b447d3c3a84d751b679ea","public/panel.html":"c30e3ca5a06fcd4d50778b2effa2c6d7ccaa213c3abff03ad88e62c32c10dc4b","public/pcm-capture-worklet.js":"e6f7c223b92928825481589f626e53b64ff70c17710f668000440c68d559e564","public/pcm-player-worklet.js":"9bfbcb06d2904d375ff06498e232cc09a32c5c9624b36bb8947bbc5270323183","public/rehber.html":"fdd1f909f008f115cec7989d780e8b2222f3e3fc333861ca0b9ac4bbbacf4f2f","public/rota.html":"083fbfb70175ac04c4ba3011b0e74916a3f1f67b8fa684762b34e91148e88349","public/sw.js":"bb77b6346ff886eef594857bc6ea4cf80336e53b4cfa009389d7305de3e67a46","public/vercel-ws-shim.js":"c2069dbbb135ce8827e81e33c99e0edd03babe68d113f0d2a438d4e1f54c4bfb","public/yaka-karti.html":"17018ba2d0fde5014a25f32c952c9e0df0c9f9feaa6b977450b8450ef9278d92"} -->

## 7. v55 önizlemesinin gerçek doğrulama sonucu

| Kontrol | Sonuç | Anlamı |
|---|---|---|
| Diskteki v54 | **27/27 PASS, V53 PASS, V54 PASS, exit0** | Yukarıdaki HEAD’in mevcut test paketi geçti. |
| Önceki v54 yamasının reverse-check’i | **exit0** | Önceki rapordaki12 kaynak değişikliği gerçekten uygulanmış. |
| Yeni boş-poll testini v54 kaynaklarıyla çalıştırma | **Beklenen negatif kontrol:** Broker connectivity must not suppress empty polling;3≠4 | MQTT-connected=true durumunda fetch yapılmadığı yeni testçe yakalandı. |
| Yeni E2E testini v54 sunucusuyla çalıştırma | **Beklenen negatif kontrol, exit1:** ''≠'audit-phone' | Kısmi isim güncellemesinin telefon kaybını yakaladı; testin yeni davranışı gerçekten sınadığı doğrulandı. Bu koşu mevcut27 testin normal sonucu ile karıştırılmamalı. |
| Rapordaki v55 diff için git apply --check | **exit0** | Kaynaklara uygulamadan mevcut HEAD’e uygunluğu sınandı. |
| Aday JS/HTML sözdizimi | **14 derleme PASS** | Değişen JS stdin’den node --check, HTML inline script’ler VM’den derlendi. |
| Aday v53/v54 kaynak kontrolleri | **V53 PASS + V54 PASS** | Diff’in bellekte uygulanmış kaynaklarıyla önceki kontroller ve genişletilmiş6 boş-poll kombinasyonu geçti. |
| Son tam v55 önizlemesi | **28/28 PASS + V53 PASS + V54 PASS + V55 PASS, exit0** | Aday server/shim/verify bellekte yüklendi; gerçek yerel Express/WS sunucusunda test edildi. |
| Handoff kapsamı | **P1-03 açık** | Yeni28 sonuç bu yarışı çözdüğü veya kapsadığı iddiasını taşımaz. |

Son pozitif koşunun ilgili çıktısı:

```text
[BAŞARILI / PASS] ADIM-3.V55 — Kısmi kimlik korunumu; MQTT bağlıyken native PCM ve family/admin HTTP güncellemeleri
V55 PASS: partial name/phone/lang/device preservation; broker-connected empty HTTP poll; mixed native PCM; family/admin deltas
[BAŞARILI / PASS] ADIM-5.V53 — Kaynak dosyalarından DSP, profil, sıra, fanout ve relay davranışları doğrulandı
[BAŞARILI / PASS] ADIM-5.V54 — Ek kaynak testleri: profil/taşma, aktif trim/starvation/wrap, tek failback ACK/sıra, HTTP kapsamı ve cache sürümü
TÜM DOĞRULAMA TESTLERİ TAMAMLANDI: 28 / 28 [BAŞARILI / PASS]
```

Önizleme aracı rapordaki diff’i bellekte uygular; testlerin kaynak okumalarını bu aday sürümlere yönlendirir ve testlerin raporu okumasını engeller. Yalnız önizlemeyi kuran araç raporu okur. Ana paketin child-process sözdizimi kontrolleri diskteki dosyaları gördüğü için aday sözdizimi ayrıca stdin/VM ile doğrulanmıştır.

**Teslim sınırı:** Kaynak dosyaları hâlâ d515333 sürümündedir. v55’in28/28 sonucu diskten uygulanmış bir sürüm veya production testi değildir. Denetim sonunda15 kaynak dosyasının SHA-256 değerlerinin başlangıçla aynı olduğu doğrulanır. Tek güncellenen teslim dosyası bu rapordur.

**Nihai değerlendirme:** v54’ün önceki rapora uygun uygulanması onaylanır. Bütün transport yollarında kesintisizlik ve abonelik eşliği için koşulsuz üretim onayı verilmez. Öncelik P1-01 boş-poll düzeltmesi, P2-02 metadata korunumu ve ardından P1-03 sunucu tarafından yönetilen atomik devir protokolüdür.
