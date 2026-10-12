const VERSION='59.1.0';
const CACHE='rndm-v59-1-liquid-glass-tap-channel';
const SHELL=[
  './index.html','./redirect.js?v=59.1.0','./bootstrap.js?v=59.1.0','./file-warning.js?v=59.1.0','./pwa-register.js?v=59.1.0','./style.css?v=59.1.0','./liquid-glass.css?v=59.1.0','./config.js?v=59.1.0',
  './app.js?v=59.1.0','./core.js?v=59.1.0','./api.js?v=59.1.0',
  './views.js?v=59.1.0','./admin.js?v=59.1.0','./donate.js?v=59.1.0','./donate.css?v=59.1.0',
  './calls.js?v=59.1.0','./clips.js?v=59.1.0',
  './theme.js?v=59.1.0','./supabase-2.117.2.js?v=59.1.0',
  './manifest.webmanifest','./icon-192.png','./icon-512.png',
  './star-gold.webp','./gift-gold.webp',
  './gift-balloon.webp',
  './gift-bear.webp',
  './gift-butterfly.webp',
  './gift-cake.webp',
  './gift-candy.webp',
  './gift-car.webp',
  './gift-cat.webp',
  './gift-celestial_crown.webp',
  './gift-coffee.webp',
  './gift-comet.webp',
  './gift-cookie.webp',
  './gift-cosmic_gate.webp',
  './gift-crown.webp',
  './gift-diamond.webp',
  './gift-eternal_flame.webp',
  './gift-firework.webp',
  './gift-flower.webp',
  './gift-galaxy.webp',
  './gift-gift_box.webp',
  './gift-gold_dragon.webp',
  './gift-heart.webp',
  './gift-lucky_cat.webp',
  './gift-magic_orb.webp',
  './gift-moon.webp',
  './gift-mythic_mask.webp',
  './gift-neon_star.webp',
  './gift-owl.webp',
  './gift-paw.webp',
  './gift-rainbow.webp',
  './gift-relic_cat.webp',
  './gift-rndm_relic.webp',
  './gift-rocket.webp',
  './gift-rose.webp',
  './gift-sparkle.webp',
  './gift-sun.webp',
  './gift-trophy.webp',
  './gift-unicorn.webp',
  './gift-violet_comet.webp'
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
