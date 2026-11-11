// PATCH: sw-v53
// PATCH: sw-v53
// PATCH: sw-v53
const CACHE_NAME = 'ridvanses-pwa-v76';
const ASSETS_TO_CACHE = [
  '/',
  '/dinle',
  '/rota',
  '/ani-kitabi',
  '/css/style.css',
  '/vercel-ws-shim.js?v=76',
  '/js/umrah-steps-map.js',
  '/pcm-capture-worklet.js?v=72-audio',
  '/pcm-player-worklet.js?v=72-audio',
  '/manifest.json',
  '/icons/icon-512.png',
  '/icons/icon-192.png',
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
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/rehber') ||
    url.pathname.startsWith('/hoca') ||
    url.pathname.startsWith('/panel') ||
    url.pathname.startsWith('/acente') ||
    url.pathname.startsWith('/yaka-karti') ||
    url.pathname.startsWith('/login')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const exact = await caches.match(event.request);
        if (exact) return exact;
        const ownOrigin = self.location && self.location.origin ? self.location.origin : url.origin;
        if (url.origin === ownOrigin) {
          const cleanHit = await caches.match(url.pathname, { ignoreSearch: true });
          if (cleanHit) return cleanHit;
          if (event.request.mode === 'navigate') {
            return (await caches.match('/dinle', { ignoreSearch: true })) || caches.match('/');
          }
        }
        return null;
      })
  );
});


function rysNotificationUrl(value){
  try{
    const url=new URL(value||'/dinle',self.location.origin);
    if(url.origin===self.location.origin&&['/dinle','/rehber','/panel'].includes(url.pathname))return url.href;
  }catch(e){}
  return new URL('/dinle',self.location.origin).href;
}
function showRysNotification(message){
  const data=message&&typeof message==='object'?message:{body:String(message||'')};
  const isSos=data.type==='sos-alert';
  const tag=typeof data.tag==='string'&&data.tag?data.tag.slice(0,180):
    data.id?(isSos?'ridvanses-sos-':'ridvanses-ann-')+String(data.id).slice(0,96):'ridvanses-notify';
  return self.registration.showNotification(String(data.title||'RıdvanSes Kafile Duyurusu').slice(0,160),{
    body:String(data.body||data.message||'').slice(0,2000),
    icon:'/icons/icon-512.png',badge:'/icons/icon-192.png',
    vibrate:isSos?[400,120,400,120,600]:[200,100,200],
    tag,renotify:isSos,
    ...(isSos?{requireInteraction:true}:{}),
    data:{url:rysNotificationUrl(data.data?.url||data.url)}
  });
}
self.addEventListener('message',event=>{
  if(event.data?.type==='SHOW_NOTIFICATION')event.waitUntil(showRysNotification(event.data));
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
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    const exact=clients.find(c=>c.url===target);
    if(exact){try{return await exact.focus();}catch(e){}}
    const targetPath=new URL(target).pathname;
    const active=clients.find(c=>{try{const u=new URL(c.url);return u.origin===self.location.origin&&u.pathname===targetPath;}catch(e){return false;}});
    if(active?.navigate){try{const navigated=await active.navigate(target);if(navigated)return await navigated.focus();}catch(e){}}
    return self.clients.openWindow(target);
  }));
});
