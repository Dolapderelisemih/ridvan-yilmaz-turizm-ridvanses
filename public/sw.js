// PATCH: sw-v53
// PATCH: sw-v53
// PATCH: sw-v53
const CACHE_NAME = 'ridvanses-pwa-v84';
const PUSH_META_CACHE = 'ridvanses-push-meta-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/dinle',
  '/rota',
  '/ani-kitabi',
  '/kullanim-rehberi',
  '/css/style.css?v=84',
  '/vercel-ws-shim.js?v=84',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/mqtt/mqtt.min.js',
  '/js/umrah-steps-map.js?v=84',
  '/pcm-capture-worklet.js?v=84-audio',
  '/pcm-player-worklet.js?v=84-audio',
  '/manifest.json',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/icon-192.png',
  '/icons/icon-192-maskable.png',
  '/icons/apple-touch-icon.png',
  '/icons/app-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        if (typeof cache.add === 'function') {
          return Promise.allSettled(ASSETS_TO_CACHE.map((asset) => cache.add(asset)));
        }
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== PUSH_META_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function canonicalHtmlCachePath(lowerPath) {
  if (lowerPath === '/' || lowerPath === '/index.html') return '/';
  if (lowerPath === '/dinle' || lowerPath === '/haci' || lowerPath === '/dinle.html') return '/dinle';
  if (lowerPath === '/rota' || lowerPath === '/izle' || lowerPath === '/rota.html') return '/rota';
  if (lowerPath === '/ani-kitabi' || lowerPath === '/hatira-kitabi' || lowerPath === '/ani-kitabi.html') return '/ani-kitabi';
  if (lowerPath === '/kullanim-rehberi' || lowerPath === '/kullanim-rehberi.html') return '/kullanim-rehberi';
  return null;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.headers && typeof event.request.headers.has === 'function' && event.request.headers.has('range')) return;
  const url = new URL(event.request.url);
  const ownOrigin = self.location && self.location.origin ? self.location.origin : url.origin;
  const lowerPath = url.pathname.toLowerCase();
  if (
    url.origin !== ownOrigin ||
    lowerPath.startsWith('/api/') ||
    lowerPath.startsWith('/ws') ||
    lowerPath.startsWith('/rehber') ||
    lowerPath.startsWith('/hoca') ||
    lowerPath.startsWith('/panel') ||
    lowerPath.startsWith('/acente') ||
    lowerPath.startsWith('/yaka-karti') ||
    lowerPath.startsWith('/login')
  ) {
    return;
  }

  const canonicalPage = canonicalHtmlCachePath(lowerPath);
  const isFastAudioOrVendorAsset =
    lowerPath === '/pcm-player-worklet.js' ||
    lowerPath === '/pcm-capture-worklet.js' ||
    lowerPath.startsWith('/vendor/');

  if (isFastAudioOrVendorAsset) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        const netUpdate = fetch(event.request)
          .then((res) => {
            if (res && res.ok && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => null);
        if (cached) return cached;
        const fresh = await netUpdate;
        if (fresh) return fresh;
        const fallback = await caches.match(url.pathname, { ignoreSearch: true });
        if (fallback) return fallback;
        return new Response('', { status: 503, statusText: 'Offline' });
      })()
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          const cacheKey = canonicalPage ? canonicalPage : event.request;
          caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        if (canonicalPage) {
          const pageHit = await caches.match(canonicalPage, { ignoreSearch: true });
          if (pageHit) return pageHit;
        }
        const exact = await caches.match(event.request);
        if (exact) return exact;
        const cleanHit = await caches.match(url.pathname, { ignoreSearch: true });
        if (cleanHit) return cleanHit;
        if (lowerPath.endsWith('.html')) {
          const stripped = url.pathname.slice(0, -5) || '/';
          const altHit = await caches.match(stripped, { ignoreSearch: true });
          if (altHit) return altHit;
        }
        if (event.request.mode === 'navigate') {
          const navTarget = canonicalPage || '/dinle';
          return (
            (await caches.match(navTarget, { ignoreSearch: true })) ||
            (await caches.match('/dinle', { ignoreSearch: true })) ||
            (await caches.match('/', { ignoreSearch: true })) ||
            new Response('Çevrimdışı bağlantı bekleniyor...', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            })
          );
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      })
  );
});


function rysNotificationUrl(value){
  try{
    const url=new URL(value||'/dinle',self.location.origin);
    if(url.origin===self.location.origin&&['/dinle','/rehber','/panel','/rota','/ani-kitabi','/kullanim-rehberi'].includes(url.pathname))return url.href;
  }catch(e){}
  return new URL('/dinle',self.location.origin).href;
}
function showRysNotification(message){
  const data=message&&typeof message==='object'?message:{body:String(message||'')};
  const isSos=data.type==='sos-alert';
  const tag=typeof data.tag==='string'&&data.tag?data.tag.slice(0,180):
    data.id?(isSos?'ridvanses-sos-':'ridvanses-ann-')+String(data.id).slice(0,96):'ridvanses-notify-'+Date.now();
  return self.registration.showNotification(String(data.title||'RıdvanSes Kafile Duyurusu').slice(0,160),{
    body:String(data.body||data.message||'').slice(0,2000),
    icon:'/icons/icon-512.png',badge:'/icons/icon-192.png',
    vibrate:isSos?[400,120,400,120,600]:[200,100,200],
    tag,renotify:isSos,
    ...(isSos?{requireInteraction:true}:{}),
    data:{url:rysNotificationUrl(data.data?.url||data.url)}
  });
}
async function rysSavePushMeta(kind, meta) {
  const safeKind = kind === 'sos' ? 'sos' : 'pilgrim';
  const reqUrl = 'https://push-meta.rys.local/' + safeKind;
  try {
    const cache = await caches.open(PUSH_META_CACHE);
    if (!meta || typeof meta !== 'object') {
      await cache.delete(reqUrl);
      return;
    }
    await cache.put(reqUrl, new Response(JSON.stringify(meta), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (e) {}
}

async function rysLoadPushMeta(kind) {
  const safeKind = kind === 'sos' ? 'sos' : 'pilgrim';
  try {
    const cache = await caches.open(PUSH_META_CACHE);
    const hit = await cache.match('https://push-meta.rys.local/' + safeKind);
    if (!hit) return null;
    return await hit.json();
  } catch (e) {
    return null;
  }
}

self.addEventListener('message',event=>{
  if(event.origin&&event.origin!==self.location.origin)return;
  if(event.data?.type==='SHOW_NOTIFICATION'){event.waitUntil(showRysNotification(event.data));return;}
  if(event.data?.type==='SYNC_PUSH_META'){event.waitUntil(rysSavePushMeta(event.data.kind||event.data.meta?.kind,event.data.meta));}
});
self.addEventListener('push',event=>{
  let data={};
  if(event.data){
    try{data=event.data.json();}
    catch(e){try{data={body:event.data.text()};}catch(e){}}
  }
  event.waitUntil(showRysNotification(data));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=rysNotificationUrl(event.notification.data?.url);
  const targetUrlObj=new URL(target);
  const targetPath=targetUrlObj.pathname;
  const newCode=(targetUrlObj.searchParams.get('code')||'').toUpperCase().trim();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const exact=clients.find(c=>c.url===target);
    if(exact){
      try{exact.postMessage?.({type:'RYS_NOTIFICATION_CLICK',url:target,code:newCode});}catch(e){}
      try{return await exact.focus();}catch(e){}
    }
    const active=clients.find(c=>{try{const u=new URL(c.url);return u.origin===self.location.origin&&u.pathname===targetPath;}catch(e){return false;}});
    if(active){
      let oldCode='';
      try{oldCode=(new URL(active.url).searchParams.get('code')||'').toUpperCase().trim();}catch(e){}
      const switchingTour=Boolean(newCode&&oldCode&&newCode!==oldCode&&targetPath!=='/rehber'&&targetPath!=='/panel');
      if(switchingTour&&typeof active.navigate==='function'){
        try{
          const next=await active.navigate(target);
          return await (next||active).focus?.();
        }catch(e){}
      }
      try{active.postMessage?.({type:'RYS_NOTIFICATION_CLICK',url:target,code:newCode});}catch(e){}
      try{return await active.focus();}catch(e){}
    }
    return self.clients.openWindow(target);
  }));
});
self.addEventListener('pushsubscriptionchange',event=>{
  event.waitUntil((async()=>{
    try{
      const apiOrigin=String((self.location&&(self.location.hostname||self.location.host))||'').split(':')[0].endsWith('.vercel.app')?'https://ses.ridvanyilmazturizm.com':self.location.origin;
      const subOpts={userVisibleOnly:true};
      if(event.oldSubscription?.options?.applicationServerKey){
        subOpts.applicationServerKey=event.oldSubscription.options.applicationServerKey;
      }else{
        const keyRes=await fetch(apiOrigin+'/api/push/vapid-public-key',{cache:'no-store'});
        const keyJson=await keyRes.json();
        if(keyJson?.publicKey){
          const b64=String(keyJson.publicKey).replace(/-/g,'+').replace(/_/g,'/');
          const pad=b64+'='.repeat((4-(b64.length%4))%4);
          const raw=atob(pad);
          const arr=new Uint8Array(raw.length);
          for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
          subOpts.applicationServerKey=arr;
        }
      }
      const newSub=event.newSubscription||(self.registration?.pushManager&&subOpts.applicationServerKey
        ? await self.registration.pushManager.subscribe(subOpts)
        : null);
      const newJson=newSub&&(typeof newSub.toJSON==='function'?newSub.toJSON():newSub);
      const rotated={};
      if(newJson?.endpoint&&newJson?.keys){
        for(const kind of ['pilgrim','sos']){
          const meta=await rysLoadPushMeta(kind);
          if(!meta?.subscriptionToken)continue;
          try{
            const rotRes=await fetch(apiOrigin+'/api/push/rotate',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({
                oldEndpoint:event.oldSubscription?.endpoint||meta.endpoint||'',
                subscriptionToken:meta.subscriptionToken,
                endpoint:newJson.endpoint,
                keys:newJson.keys,
                isSos:kind==='sos'
              })
            });
            if(rotRes.ok){
              const rotData=await rotRes.json().catch(()=>({}));
              const nextToken=rotData?.subscriptionToken||meta.subscriptionToken;
              const nextMeta={
                ...meta,
                endpoint:newJson.endpoint,
                subscriptionToken:nextToken
              };
              rotated[kind]={endpoint:newJson.endpoint,subscriptionToken:nextToken,tourCode:meta.tourCode};
              await rysSavePushMeta(kind,nextMeta);
            }
          }catch(e){}
        }
      }
      const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
      for(const client of clients){
        try{client.postMessage({type:'PUSH_SUBSCRIPTION_CHANGED',rotated});}catch(e){}
      }
    }catch(e){}
  })());
});
