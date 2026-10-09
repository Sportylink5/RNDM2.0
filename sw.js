const VERSION='47.0.0';
const CACHE='rndm-v47-shell';
const SHELL=[
  './index.html','./style.css?v=47.0.0','./config.js?v=47.0.0',
  './app.js?v=47.0.0','./core.js?v=47.0.0','./api.js?v=47.0.0',
  './views.js?v=47.0.0','./admin.js?v=47.0.0',
  './calls.js?v=47.0.0','./clips.js?v=47.0.0',
  './theme.js?v=47.0.0','./supabase-2.117.2.js?v=47.0.0',
  './manifest.webmanifest','./icon-192.png','./icon-512.png',
  './star-gold.webp','./gift-gold.webp'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('rndm-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  const path=url.pathname;
  const isCode=/\.(?:js|css|webmanifest)$/.test(path);
  const isPage=req.mode==='navigate';
  if(isPage||isCode){
    event.respondWith(fetch(new Request(req,{cache:'no-store'})).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(isPage?'./index.html':req,copy)).catch(()=>{}));
      }
      return response;
    }).catch(async()=>await caches.match(isPage?'./index.html':req)||Response.error()));
    return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{}));}
    return response;
  })));
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
