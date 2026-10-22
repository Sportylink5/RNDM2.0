// RNDM CONQUEST v71.1 — Moscow's actual OSM building footprints, one online world.
// Security: frontend never writes ownership or balances. Every action is an authenticated RPC.
// Offline/error states are explicit; NO fake local multiplayer or client-side territory writes.
const PI=Math.PI, deg=n=>n*PI/180, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const TILE=256, MAP_TILE=(window.RNDM_CONQUEST_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
const POINTS={moscow:[55.7558,37.6173,10],butovo:[55.570,37.578,16],city:[55.749,37.539,16],zelenograd:[55.988,37.203,15],new:[55.410,37.150,14]};
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const showNumber=n=>Math.round(Number(n)||0).toLocaleString('ru-RU');
function projected(lat,lng,z){const sin=clamp(Math.sin(deg(lat)),-.999999,.999999),s=TILE*2**z;return{x:(lng+180)/360*s,y:(.5-Math.log((1+sin)/(1-sin))/(4*PI))*s};}
function geographic(x,y,z){const s=TILE*2**z;return{lat:Math.atan(Math.sinh(PI-2*PI*y/s))*180/PI,lng:x/s*360-180};}
function pointInRing(pt,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>pt.lat)!==(b[1]>pt.lat))&&pt.lng<(b[0]-a[0])*(pt.lat-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function pointInGeo(pt,geom){if(!geom)return false;const polys=geom.type==='Polygon'?[geom.coordinates]:geom.type==='MultiPolygon'?geom.coordinates:[];return polys.some(poly=>poly[0]?.length>2&&pointInRing(pt,poly[0])&&!poly.slice(1).some(r=>pointInRing(pt,r)));}
function hexColor(s){return /^#[0-9a-f]{6}$/i.test(s||'')?s:'#6d7d93';}
export class Conquest {
 constructor(sb,{getUser=()=>null,getProfile=()=>({}),toast=()=>{},onExit=()=>{}}={}){
  this.sb=sb;this.getUser=getUser;this.getProfile=getProfile;this.toast=toast;this.onExit=onExit;
  this.root=null;this.canvas=null;this.ctx=null;this.abort=null;this.channel=null;this.timer=null;this.requestTimer=null;
  this.view={lat:55.7558,lng:37.6173,zoom:10};this.buildings=[];this.overview=[];this.orders=[];this.tiles=new Map();
  this.me=null;this.team=null;this.selectedId=null;this.selectedSource=null;this.sourceCandidates=[];this.sourceTarget=null;this.busy=false;this.loaded=false;this.closed=true;
  this.pointers=new Map();this.downPoint=null;this.firstLoad=true;this.lastLoadedKey='';this.requests=0;this.stale=false;
 }
 open(pane){this.close();this.closed=false;this.root=pane;this.abort=new AbortController();this.root.innerHTML=`
 <section class="cq71" aria-label="RNDM Conquest — Москва">
 <header class="cq71-top"><button class="cq71-exit" data-cq="exit" title="Назад в Игры" aria-label="Вернуться к играм">←</button>
 <div class="cq71-brand"><small>RNDM / ИГРЫ / ЕДИНЫЙ МИР</small><strong>CONQUEST <em>МОСКВА</em></strong></div>
 <div class="cq71-team-chip" id="cqTeamChip"><span id="cqTeamFlag">◇</span><span id="cqTeamName">Команда не создана</span></div>
 <div class="cq71-money" title="Ресурсы">◆ <b id="cqCredits">—</b></div>
 <div class="cq71-count" title="Захваченные здания">▥ <b id="cqCaptured">—</b></div>
 <button class="cq71-collapse-mobile" data-cq="panel" aria-label="Открыть панель">☷</button>
 </header>
 <div class="cq71-layout"><div class="cq71-map" id="cqMap" tabindex="0" aria-label="Реальная карта Москвы. Перемещайте и масштабируйте карту">
 <canvas id="cqCanvas"></canvas>
 <div class="cq71-places" role="group" aria-label="Переход по карте"><button data-cq="moscow">Вся Москва</button><button data-cq="butovo">Бутово</button><button data-cq="city">Москва-Сити</button><button data-cq="zelenograd">Зеленоград</button><button data-cq="new">Новая Москва</button></div>
 <div class="cq71-zoom"><button data-cq="plus" aria-label="Приблизить карту">+</button><button data-cq="minus" aria-label="Отдалить карту">−</button></div>
 <div class="cq71-live" id="cqLive" role="status">◌ Соединение с миром…</div>
 <div class="cq71-hint" id="cqMapHint">Приблизь карту до домов, чтобы выбрать здание</div>
 <div class="cq71-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OSM</a></div>
 </div>
 <aside class="cq71-sidebar" id="cqSide">
 <div class="cq71-sidehead"><div><small>ТАКТИЧЕСКИЙ ШТАБ</small><h2>Управление</h2></div><button data-cq="panel" aria-label="Свернуть панель">⌄</button></div>
 <div class="cq71-sidebody"><div class="cq71-tabs"><button class="active" data-cq="tab-target">Здание</button><button data-cq="tab-army">Армия</button><button data-cq="tab-team">Команда</button></div>
 <div class="cq71-tab-content" id="cqTargetTab"><div class="cq71-selection"><small id="cqBuildingKind">ВЫБЕРИ ЗДАНИЕ</small><h3 id="cqBuildingTitle">Москва — общий мир</h3><p id="cqBuildingDescription">На карте отображаются реальные дома. Приблизь карту до 15-го масштаба, нажми на дом и отправь разведчика.</p><div id="cqOwnerRow" class="cq71-owner"></div></div>
 <div class="cq71-actiongrid"><button id="cqScout" class="cq71-primary" data-cq="scout" disabled>⌁ Отправить разведчика · 40</button><button id="cqRecruit" data-cq="recruit" disabled>＋ Нанять 5 бойцов · 120</button><button id="cqFort" data-cq="fort" disabled>▤ Блокпост · 220</button></div>
 <div class="cq71-march"><strong>Переброска армии</strong><p>Из своего здания — к выбранному дому. Если цель защищена, сначала нужна разведка.</p>
 <label>Откуда отправить<input id="cqSourceSearch" type="search" placeholder="Поиск по своим домам…" autocomplete="off"></label>
 <select id="cqSource" aria-label="Выбрать исходное здание"></select>
 <label>Количество бойцов <input id="cqTroopCount" type="number" min="1" max="1000" inputmode="numeric" value="5"></label>
 <button id="cqMarch" data-cq="dispatch" disabled>➜ Отправить армию</button>
 </div></div>
 <div class="cq71-tab-content" id="cqArmyTab" hidden><h3>Отряды в пути</h3><p>Отряды движутся между зданиями. Бои разрешаются сервером по прибытии.</p><div id="cqOrders"></div></div>
 <div class="cq71-tab-content" id="cqTeamTab" hidden><div id="cqTeamDetails"></div><p>Каждый участник управляет собственной командой. Цвет команды одинаков на карте у всех игроков.</p></div>
 <div class="cq71-feed"><small>СОБЫТИЯ</small><div id="cqFeed" aria-live="polite"></div></div>
 </div></aside></div>
 <div class="cq71-modal" id="cqTeamModal" hidden><form id="cqTeamForm" class="cq71-setup"><div class="cq71-setup-icon">⚑</div><small>НАЧАЛО ИГРЫ · ОДИН ОБЩИЙ СЕРВЕР</small><h2>Создай свою команду</h2><p>Все игроки находятся на одной карте Москвы. Придумай название и флаг, выбери цвет, который будет обозначать твои дома.</p>
 <label>Название команды<input id="cqCreateName" name="name" minlength="3" maxlength="32" autocomplete="off" placeholder="Например, Северный Союз" required></label>
 <label>Флаг команды<input id="cqCreateFlag" name="flag" maxlength="16" value="🚩" required></label>
 <div class="cq71-flags" role="group" aria-label="Примеры флагов"><button type="button" data-flag="🚩">🚩</button><button type="button" data-flag="🏴">🏴</button><button type="button" data-flag="🏳️">🏳️</button><button type="button" data-flag="🦅">🦅</button><button type="button" data-flag="⚔️">⚔️</button><button type="button" data-flag="🛡️">🛡️</button><button type="button" data-flag="👑">👑</button></div>
 <label>Цвет команды<div class="cq71-colorbox"><input id="cqCreateColor" name="color" type="color" value="#3894ff"><span id="cqHex">#3894ff</span></div></label>
 <button class="cq71-primary cq71-start" type="submit">Создать команду и войти в Москву</button><p class="cq71-error" id="cqCreateError" role="alert"></p></form></div>
 <div class="cq71-blocker" id="cqErrorScreen" hidden><div class="cq71-blockerbox"><h3>Нет подключения к общему миру</h3><p id="cqErrorReason"></p><button data-cq="retry">Повторить подключение</button><button data-cq="exit">Вернуться в Игры</button></div></div>
 </section>`;
 this.canvas=this.$('cqCanvas');this.ctx=this.canvas.getContext('2d',{alpha:false});this.map=this.$('cqMap');
 const s=this.abort.signal;
 pane.addEventListener('click',e=>{let t=e.target.closest('[data-flag]');if(t){this.$('cqCreateFlag').value=t.dataset.flag;return;}t=e.target.closest('[data-cq]');if(t){void this.command(t.dataset.cq);}}, {signal:s});
 this.$('cqTeamForm').addEventListener('submit',e=>{e.preventDefault();void this.makeTeam();},{signal:s});
 this.$('cqCreateColor').addEventListener('input',e=>{this.$('cqHex').textContent=e.target.value;},{signal:s});
 this.$('cqSourceSearch').addEventListener('input',()=>this.sources(),{signal:s});
 this.$('cqSource').addEventListener('change',e=>{this.selectedSource=e.target.value||null;this.panel();},{signal:s});
 this.$('cqTroopCount').addEventListener('input',()=>this.panel(),{signal:s});
 this.map.addEventListener('pointerdown',e=>this.pointerDown(e),{signal:s});
 this.map.addEventListener('pointermove',e=>this.pointerMove(e),{signal:s});
 this.map.addEventListener('pointerup',e=>this.pointerUp(e),{signal:s});
 this.map.addEventListener('pointercancel',e=>this.pointerUp(e,true),{signal:s});
 this.map.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY<0?1:-1,e.clientX,e.clientY);},{signal:s,passive:false});
 this.map.addEventListener('dblclick',e=>{e.preventDefault();this.zoom(1,e.clientX,e.clientY);},{signal:s});
 window.addEventListener('resize',()=>this.resize(),{signal:s});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.refreshSoon(150);},{signal:s});
 this.resize();this.loop();void this.connect();
 }
 $(id){return this.root?.querySelector('#'+id);}
 log(msg,error=false){const box=this.$('cqFeed');if(!box)return;const item=document.createElement('p');item.textContent=msg;item.className=error?'error':'';box.prepend(item);while(box.children.length>5)box.lastChild.remove();if(error)this.toast(msg);}
 status(msg,ok=false){const l=this.$('cqLive');if(!l)return;l.textContent=(ok?'● ':'◌ ')+msg;l.classList.toggle('ok',ok);}
 errorScreen(reason){const m=this.$('cqErrorScreen');if(m)m.hidden=false;const p=this.$('cqErrorReason');if(p)p.textContent=reason;this.status('Общий сервер недоступен',false);}
 resize(){if(this.closed||!this.canvas)return;const box=this.map.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.dpr=dpr;this.w=Math.max(box.width,120);this.h=Math.max(box.height,120);const w=Math.round(this.w*dpr),h=Math.round(this.h*dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;} }
 position(lat,lng){const center=projected(this.view.lat,this.view.lng,this.view.zoom),p=projected(lat,lng,this.view.zoom);return{x:p.x-center.x+this.w/2,y:p.y-center.y+this.h/2};}
 geo(x,y){const c=projected(this.view.lat,this.view.lng,this.view.zoom);return geographic(c.x+x-this.w/2,c.y+y-this.h/2,this.view.zoom);}
 viewAt(lat,lng,zoom){this.view={lat:clamp(lat,54.6,56.2),lng:clamp(lng,36.3,38.5),zoom:clamp(zoom,8,19)};this.selectedId=null;this.refreshSoon(200);this.panel();}
 zoom(delta,clientX,clientY){const nz=clamp(this.view.zoom+delta,8,19);if(nz===this.view.zoom)return;const rect=this.map.getBoundingClientRect();const x=clientX==null?this.w/2:clientX-rect.left,y=clientY==null?this.h/2:clientY-rect.top;const a=this.geo(x,y);const anchor=projected(a.lat,a.lng,nz),newCenter=geographic(anchor.x-(x-this.w/2),anchor.y-(y-this.h/2),nz);this.view.zoom=nz;this.view.lat=clamp(newCenter.lat,54.6,56.2);this.view.lng=clamp(newCenter.lng,36.3,38.5);this.selectedId=null;this.refreshSoon(220);this.panel();}
 pointerDown(e){if(e.target.closest('button,a'))return;if(e.pointerType==='mouse'&&e.button!==0)return;this.map.setPointerCapture?.(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false});if(this.pointers.size===2){const a=[...this.pointers.values()];this.pinch={distance:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),zoom:this.view.zoom};}}
 pointerMove(e){const p=this.pointers.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;if(Math.hypot(p.x-p.startX,p.y-p.startY)>7)p.moved=true;
  if(this.pointers.size>=2){const a=[...this.pointers.values()];const d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(this.pinch){const target=clamp(Math.round(this.pinch.zoom+Math.log2(d/Math.max(this.pinch.distance,1))),8,19);if(target!==this.view.zoom)this.zoom(target-this.view.zoom,(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2);}return;}
  const c=projected(this.view.lat,this.view.lng,this.view.zoom),next=geographic(c.x-dx,c.y-dy,this.view.zoom);this.view.lat=clamp(next.lat,54.6,56.2);this.view.lng=clamp(next.lng,36.3,38.5);
 }
 pointerUp(e,cancel=false){const p=this.pointers.get(e.pointerId);if(!p)return;this.pointers.delete(e.pointerId);if(this.pointers.size<2)this.pinch=null;this.refreshSoon(350);if(cancel||p.moved||this.pointers.size||this.view.zoom<15)return;
  const r=this.map.getBoundingClientRect(),geo=this.geo(e.clientX-r.left,e.clientY-r.top);let hit=this.buildings.find(b=>pointInGeo(geo,b.geometry));
  if(!hit){let min=15;for(const b of this.buildings){const s=this.position(b.lat,b.lng),d=Math.hypot(s.x-(e.clientX-r.left),s.y-(e.clientY-r.top));if(d<min){min=d;hit=b;}}}
  if(hit){this.selectedId=hit.id;this.panel();this.log('Выбрано здание '+(hit.address||hit.name||'#'+hit.id));}else this.log('Здесь нет загруженного здания. Приблизь карту или выбери другой дом.');
 }
 loop(t=0){if(this.closed)return;if(!document.hidden&&(!this.lastFrame||t-this.lastFrame>37)){this.paint();this.lastFrame=t;}this.animation=requestAnimationFrame(t=>this.loop(t));}
 paint(){if(!this.ctx||!this.w)return;const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.fillStyle='#d6dde6';c.fillRect(0,0,this.w,this.h);this.tilesPaint(c);
  if(this.view.zoom>=15){for(const b of this.buildings){const poly=b.geometry?.type==='Polygon'?[b.geometry.coordinates]:b.geometry?.type==='MultiPolygon'?b.geometry.coordinates:[];const mine=b.owner_id===this.team?.id;const selected=b.id===this.selectedId;let filled=false;c.beginPath();for(const rings of poly)for(const ring of rings){if(ring.length<3)continue;ring.forEach(([lng,lat],i)=>{const p=this.position(lat,lng);if(i===0)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);});c.closePath();filled=true;}
    if(!filled)continue;c.fillStyle=b.owner_id?hexColor(b.team_color)+(selected?'bf':'70'):'#8ba5b747';c.fill('evenodd');c.lineWidth=selected?3:mine?1.9:1.1;c.strokeStyle=selected?'#ffffff':b.owner_id?hexColor(b.team_color):'#71849a';c.stroke();
    const center=this.position(b.lat,b.lng);if(b.owner_id&&this.view.zoom>=17){c.font='bold 14px system-ui';c.textAlign='center';c.fillStyle='#061b24';c.fillText(b.team_flag||'⚑',center.x,center.y+5);}
   }}else{for(const b of this.overview){const pt=this.position(b.lat,b.lng);if(pt.x<-40||pt.x>this.w+40||pt.y<-40||pt.y>this.h+40)continue;const r=clamp(5+Math.sqrt(Number(b.count))*2,7,23);c.beginPath();c.arc(pt.x,pt.y,r,0,PI*2);c.fillStyle=hexColor(b.team_color)+'b8';c.fill();c.strokeStyle='#ffffffb8';c.lineWidth=1.5;c.stroke();c.textAlign='center';c.fillStyle='#fff';c.font='bold 11px system-ui';c.fillText(String(b.count),pt.x,pt.y+4);}}
  for(const o of this.orders){const now=Date.now(),a=Date.parse(o.departed_at),z=Date.parse(o.arrives_at),f=clamp((now-a)/Math.max(1,z-a),0,1);const from=this.position(o.source_lat,o.source_lng),to=this.position(o.target_lat,o.target_lng);c.setLineDash([6,6]);c.strokeStyle=hexColor(o.team_color);c.lineWidth=2;c.beginPath();c.moveTo(from.x,from.y);c.lineTo(to.x,to.y);c.stroke();c.setLineDash([]);const x=from.x+(to.x-from.x)*f,y=from.y+(to.y-from.y)*f;c.fillStyle=hexColor(o.team_color);c.beginPath();c.arc(x,y,7,0,PI*2);c.fill();c.strokeStyle='#fff';c.stroke();c.font='bold 10px system-ui';c.fillStyle='#1a2437';c.textAlign='center';c.fillText('⚔',x,y+3);}
  const label=this.$('cqMapHint');if(label&&Date.now()-(this.hintAt||0)>1200){this.hintAt=Date.now();label.textContent=this.view.zoom<15?'Приблизь до домов: z'+this.view.zoom+' / 15':this.buildings.length?'Реальные здания · OSM · на экране: '+this.buildings.length:'Загрузка зданий…';}
 }
 tilesPaint(c){const {zoom:z}=this.view,center=projected(this.view.lat,this.view.lng,z),sx=center.x-this.w/2,sy=center.y-this.h/2,x0=Math.floor(sx/TILE),x1=Math.ceil((sx+this.w)/TILE),y0=Math.floor(sy/TILE),y1=Math.ceil((sy+this.h)/TILE),n=2**z,needed=new Set();for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){if(y<0||y>=n)continue;const xx=((x%n)+n)%n,key=`${z}/${xx}/${y}`;needed.add(key);let item=this.tiles.get(key);if(!item){item={ready:false};this.tiles.set(key,item);const img=new Image();img.referrerPolicy='strict-origin-when-cross-origin';img.decoding='async';img.onload=()=>{item.ready=true;item.img=img;};img.onerror=()=>item.failed=true;img.src=MAP_TILE.replace('{z}',String(z)).replace('{x}',String(xx)).replace('{y}',String(y));}
   if(item.ready)c.drawImage(item.img,x*TILE-sx,y*TILE-sy,TILE+1,TILE+1);
  }if(this.tiles.size>160)for(const k of this.tiles.keys()){if(!needed.has(k)){this.tiles.delete(k);if(this.tiles.size<=90)break;}}}
 async rpc(name,args){if(!this.sb)throw Error('Supabase не подключён к мессенджеру.');const {data,error}=await this.sb.rpc(name,args);if(error)throw Error(error.message||'Ошибка сервера');return data;}
 async connect(){this.status('Проверяем аккаунт RNDM…');try{
   if(!this.sb)throw Error('Не найден клиент Supabase. Запусти игру через RNDM Chat.');
   const {data,error}=await this.sb.auth.getUser();if(error||!data?.user)throw Error('Войди в свой аккаунт RNDM Chat.');
   this.me=await this.rpc('cq71_me');if(this.closed)return;this.$('cqErrorScreen').hidden=true;
   if(this.me.needs_team){this.$('cqTeamModal').hidden=false;this.status('Создание команды');return;}
   this.activate();
  }catch(e){if(!this.closed)this.errorScreen(e.message||'Проблема подключения');}}
 activate(){this.team=this.me.team;this.$('cqTeamModal').hidden=true;this.$('cqTeamFlag').textContent=this.team.flag;this.$('cqTeamName').textContent=this.team.name;this.$('cqTeamChip').style.setProperty('--team',hexColor(this.team.color));this.$('cqCredits').textContent=showNumber(this.team.credits);this.$('cqCaptured').textContent=showNumber(this.team.buildings);
  this.status('Общий онлайн · соединение',true);this.loaded=true;this.feedStarted=true;
  if(this.channel){this.sb.removeChannel(this.channel).catch(()=>{});this.channel=null;}
  this.channel=this.sb.channel('cq71-changes-'+Math.random().toString(36).slice(2)).on('postgres_changes',{event:'INSERT',schema:'public',table:'cq71_events'},p=>{const ev=p.new||{};if(this.closed)return;this.refreshSoon(650);if(ev.team_id===this.team?.id&&ev.note)this.log(ev.note);}).subscribe(status=>{if(this.closed)return;this.status(status==='SUBSCRIBED'?'В сети · общий мир':status==='CHANNEL_ERROR'?'Связь восстановится по таймеру':'В сети · проверка связи',status==='SUBSCRIBED');});
  clearInterval(this.timer);this.timer=setInterval(()=>{if(!this.closed&&!document.hidden)void this.refresh();},12000);
  void this.refresh();this.log('Команда '+this.team.name+' в общем мире. Все захваты сохраняются на сервере.');
 }
 async makeTeam(){if(this.busy)return;const name=this.$('cqCreateName').value.trim(),flag=this.$('cqCreateFlag').value.trim(),color=this.$('cqCreateColor').value;const err=this.$('cqCreateError');err.textContent='';if(name.length<3||name.length>32||!flag){err.textContent='Заполни название и флаг.';return;}this.busy=true;const submit=this.$('cqTeamForm').querySelector('[type="submit"]');submit.disabled=true;try{await this.rpc('cq71_create_team',{p_name:name,p_flag:flag,p_color:color});this.me=await this.rpc('cq71_me');if(this.closed)return;this.activate();}catch(e){err.textContent=e.message;}finally{this.busy=false;submit.disabled=false;this.refreshSoon(50);}}
 rect(){const sw=this.geo(0,this.h),ne=this.geo(this.w,0);return{p_south:clamp(sw.lat-.005,54.65,56.2),p_north:clamp(ne.lat+.005,54.65,56.2),p_west:clamp(sw.lng-.005,36.35,38.5),p_east:clamp(ne.lng+.005,36.35,38.5),p_zoom:this.view.zoom};}
 async refresh(){if(!this.loaded||this.closed||this.busy)return;const r=this.rect();if(r.p_north<=r.p_south||r.p_east<=r.p_west)return;const token=++this.requests;
  try{const info=await this.rpc('cq71_world',r);if(this.closed||token!==this.requests)return;this.buildings=info.buildings||[];this.overview=info.overview||[];this.orders=info.orders||[];this.stale=false;this.panel();if(Date.now()-(this.lastMe||0)>18000){this.lastMe=Date.now();void this.refreshMe();}}
  catch(e){if(this.closed||token!==this.requests)return;this.status('Нет ответа сервера · переподключение',false);if(!this.stale){this.stale=true;this.log('Обновление карты: '+e.message,true);}}}
 async refreshMe(){try{const me=await this.rpc('cq71_me');if(this.closed)return;this.me=me;this.team=me.team;this.$('cqCredits').textContent=showNumber(me.team.credits);this.$('cqCaptured').textContent=showNumber(me.team.buildings);this.status('Общий онлайн · данные сервера',true);}catch(e){this.log('Статус команды: '+e.message,true);}}
 refreshSoon(ms=300){if(!this.loaded||this.closed)return;clearTimeout(this.requestTimer);this.requestTimer=setTimeout(()=>this.refresh(),ms);}
 selected(){return this.buildings.find(b=>b.id===this.selectedId)||null;}
 sources(){const sel=this.$('cqSource'),query=this.$('cqSourceSearch').value.trim().toLowerCase(),mine=this.sourceCandidates.filter(b=>Number(b.garrison)>1&&b.id!==this.selectedId&&((b.address||'')+(b.name||'')+b.id).toLowerCase().includes(query));
   sel.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=mine.length?'Выбери свой дом':'Нет своих домов рядом';sel.append(empty);
   for(const b of mine){const op=document.createElement('option');op.value=b.id;op.textContent=(b.address||b.name||'Дом #'+b.id)+' · '+b.garrison+' бойцов';sel.append(op);}
   if(mine.some(b=>b.id===this.selectedSource))sel.value=this.selectedSource;else this.selectedSource=null;
 }
 panel(){if(this.closed||!this.root)return;const b=this.selected(),team=this.team;const own=b&&b.owner_id===team?.id,enemy=b&&b.owner_id&&b.owner_id!==team?.id,free=b&&!b.owner_id;
  const kind=this.$('cqBuildingKind'),title=this.$('cqBuildingTitle'),details=this.$('cqBuildingDescription'),owner=this.$('cqOwnerRow');
  kind.textContent=b?(own?'НАША ТЕРРИТОРИЯ':enemy?'ЧУЖОЕ ЗДАНИЕ':'СВОБОДНОЕ ЗДАНИЕ'):'РЕАЛЬНАЯ МОСКВА';
  title.textContent=b?(b.address||b.name||'Здание OSM #'+b.id):'Карта всей Москвы';
  details.textContent=!b?'Приблизь карту минимум до 15-го масштаба и выбери реальный дом. Захватить можно только существующий объект OSM.':own?'Наш гарнизон: '+b.garrison+' · Блокпост: '+b.fort_level+'/5. Можно нанять бойцов или укрепить дом.':enemy?'Команда: '+(b.team_name||'Противник')+' · '+(b.scouted?'Разведка: '+b.garrison+' защитников, блокпост '+b.fort_level:'Силы неизвестны: сначала отправь разведчика.'):'Здесь нет команды. Разведчик проверит дом и, если он по-прежнему пуст, сразу займёт.';
  owner.replaceChildren();if(b?.owner_id){const color=document.createElement('i');color.style.background=hexColor(b.team_color);const name=document.createElement('span');name.textContent=(b.team_flag||'⚑')+' '+(b.team_name||'Команда');owner.append(color,name);}else if(b){owner.textContent='◇ Никому не принадлежит';}
  if(b&&this.loaded&&this.sourceTarget!==b.id){this.sourceTarget=b.id;this.sourceCandidates=[];this.selectedSource=null;void this.loadSources(b.id);}else if(!b){this.sourceTarget=null;this.sourceCandidates=[];this.selectedSource=null;}
  const can=!!b&&this.loaded&&!this.busy;this.$('cqScout').disabled=!can||own||this.team?.credits<40;this.$('cqRecruit').disabled=!can||!own||this.team?.credits<120||b.garrison>495;this.$('cqFort').disabled=!can||!own||this.team?.credits<220||b.fort_level>=5;
  this.sources();const target=b&&b.id,source=this.sourceCandidates.find(x=>x.id===this.selectedSource),troops=Number(this.$('cqTroopCount').value);
  this.$('cqMarch').disabled=!can||!source||!Number.isInteger(troops)||troops<1||troops>=Number(source.garrison)||(enemy&&!b.scouted);
  const list=this.$('cqOrders');if(list&&!this.$('cqArmyTab').hidden){list.replaceChildren();const mine=this.orders.filter(x=>x.team_id===team?.id);if(!mine.length)list.textContent='Никто не в пути.';for(const o of mine){const el=document.createElement('div');el.className='cq71-order';el.textContent='⚔ '+o.troops+' бойцов · до '+new Date(o.arrives_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});list.append(el);}}
  const detail=this.$('cqTeamDetails');if(detail&&team)detail.innerHTML='<div class="cq71-team-big"><span style="color:'+hexColor(team.color)+'">'+html(team.flag)+'</span><strong>'+html(team.name)+'</strong></div><div class="cq71-team-stat">Цвет: '+html(team.color)+' · Зданий: '+showNumber(team.buildings)+' · Доход: +'+showNumber(team.income)+'/мин.</div>';
 }
 async loadSources(id){try{const candidates=await this.rpc('cq71_sources',{p_target:id});if(this.closed||this.sourceTarget!==id)return;this.sourceCandidates=candidates||[];this.sources();}catch(e){if(!this.closed&&this.sourceTarget===id)this.log('Источники армии: '+e.message,true);}}
 async act(type){const b=this.selected();if(!b||this.busy)return;this.busy=true;this.panel();try{let res;if(type==='scout')res=await this.rpc('cq71_scout',{p_osm_id:b.id});else if(type==='recruit')res=await this.rpc('cq71_recruit',{p_osm_id:b.id});else if(type==='fort')res=await this.rpc('cq71_fort',{p_osm_id:b.id});else if(type==='dispatch'){
    const amount=Number(this.$('cqTroopCount').value),source=this.selectedSource;if(!source||!Number.isInteger(amount)||amount<1)throw Error('Выбери свой дом и число бойцов.');res=await this.rpc('cq71_dispatch',{p_source:source,p_target:b.id,p_troops:amount});}
   if(res?.message)this.log(res.message);if(res?.outcome==='occupied')this.log('Разведка: '+res.team_flag+' '+res.team_name+', '+res.garrison+' защитников.');
   this.lastMe=0;this.busy=false;await this.refresh();await this.refreshMe();
  }catch(e){this.log(e.message||'Ошибка команды',true);}finally{this.busy=false;this.panel();}}
 async command(which){if(which==='exit'){this.close();this.onExit();return;}if(which==='retry'){this.$('cqErrorScreen').hidden=true;void this.connect();return;}
  if(which==='panel'){this.$('cqSide').classList.toggle('minimized');this.resize();return;}
  if(which==='plus'||which==='minus'){this.zoom(which==='plus'?1:-1);return;}
  if(POINTS[which]){const p=POINTS[which];this.viewAt(...p);return;}
  if(which.startsWith('tab-')){for(const a of ['target','army','team']){const cur=which==='tab-'+a;this.$({target:'cqTargetTab',army:'cqArmyTab',team:'cqTeamTab'}[a]).hidden=!cur;this.root.querySelector('[data-cq="tab-'+a+'"]').classList.toggle('active',cur);}this.panel();return;}
  if(['scout','recruit','fort','dispatch'].includes(which))await this.act(which);
 }
 close(){this.closed=true;this.abort?.abort();this.abort=null;clearInterval(this.timer);clearTimeout(this.requestTimer);cancelAnimationFrame(this.animation);this.requests++;this.loaded=false;this.tiles.clear();this.pointers.clear();if(this.channel&&this.sb)this.sb.removeChannel(this.channel).catch(()=>{});this.channel=null;this.root=null;this.canvas=null;this.ctx=null;this.map=null;}
}
