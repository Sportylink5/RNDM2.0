const VERSION='68.0.0';
const CACHE_PREFIX='rndm-'+encodeURIComponent(new URL(self.registration.scope).pathname)+'-';
const CACHE=CACHE_PREFIX+'v68-arcade';
const SHELL=[
  './arcade.js?v=68.0.0','./arcade-net.js?v=68.0.0','./arcade-engine.js?v=68.0.0','./arcade.css?v=68.0.0',
  './index.html','./redirect.js?v=67.1.0','./bootstrap.js?v=67.4.0','./file-warning.js?v=67.1.0','./pwa-register.js?v=68.0.0','./style.css?v=67.1.0','./liquid-glass.css?v=67.1.0','./config.js?v=67.4.0',
  './organizer.js?v=67.1.0','./qrcode-1.4.4.js?v=67.1.0',
  './app.js?v=68.0.0','./core.js?v=68.0.0','./api.js?v=67.4.0','./together.js?v=67.3.0','./together-games.js?v=67.1.0','./together.css?v=67.3.0',
  './views.js?v=68.0.0','./admin.js?v=67.1.0','./donate.js?v=67.1.0','./donate.css?v=67.1.0',
  './messenger-tools.js?v=67.1.0','./messenger.css?v=67.1.0','./polish.css?v=67.1.0','./gift-art.js?v=67.1.0','./inter.woff2',
  './privacy.html','./reset-password.html',
  './calls.js?v=67.1.0','./clips.js?v=67.1.0',
  './theme.js?v=67.1.0','./supabase-2.117.2.js?v=67.1.0',
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
  // Missing optional assets must never prevent a new service worker from activating.
  const essential=['./index.html','./app.js?v=68.0.0','./together-games.js?v=67.1.0','./together.css?v=67.3.0'];
  event.waitUntil(caches.open(CACHE).then(async cache=>{
    await Promise.allSettled(essential.map(async path=>{
      const response=await fetch(path,{cache:'reload'});
      if(response.ok)await cache.put(path,response);
    }));
  }));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX)&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(!url.href.startsWith(self.registration.scope))return;
  const path=url.pathname;
  const isCode=/\.(?:js|css|webmanifest)$/.test(path);
  const isPage=req.mode==='navigate';
  if(isPage){
    // Cache each public HTML route independently, never a recovery page as index.
    const canonical=new URL(url);canonical.search='';canonical.hash='';
    if(canonical.pathname.endsWith('/'))canonical.pathname+='index.html';
    event.respondWith(fetch(new Request(req,{cache:'no-store'})).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(canonical.href,copy)).catch(()=>{}));
      }
      return response;
    }).catch(async()=>{const cache=await caches.open(CACHE);return await cache.match(canonical.href)||await cache.match('./index.html')||Response.error();}));
    return;
  }
  if(isCode){
    // Prefer fresh deployed JS/CSS to avoid mixed-version imports after a partial update.
    event.respondWith(caches.open(CACHE).then(async cache=>{
      try{
        const response=await fetch(new Request(req,{cache:'no-store'}));
        if(response.ok)event.waitUntil(cache.put(req,response.clone()).catch(()=>{}));
        return response;
      }catch(error){return await cache.match(req)||Response.error();}
    }));return;
  }
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(req)).then(cached=>cached||fetch(req).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{}));}
    return response;
  })));
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const conversation=String(event.notification.data?.conversation||'');
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(c=>c.url.startsWith(self.registration.scope));
    if(existing){await existing.focus();existing.postMessage({type:'RNDM_NOTIFICATION_OPEN',conversation});return;}
    const url=new URL('index.html',self.registration.scope);
    if(/^[a-f\d-]{16,40}$/i.test(conversation))url.searchParams.set('chat',conversation);
    await self.clients.openWindow(url.href);
  })());
});
