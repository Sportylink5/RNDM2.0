// RNDM Conquest / v70: integrated persistent Moscow strategy for RNDM Chat.
// The browser is not authoritative: all economy, ownership, and combat writes use SQL RPCs.
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rad=n=>n*Math.PI/180;
const MAX_LAT=85.05112878;
const TILE=256;
const VIEW={lat:55.73,lng:37.38,zoom:9};
const MOSCOW_POINTS={center:{lat:55.7558,lng:37.6173},butovo:{lat:55.566,lng:37.572},city:{lat:55.749,lng:37.539},zelenograd:{lat:55.992,lng:37.211},new:{lat:55.407,lng:37.146}};
const tileHost='https://a.basemaps.cartocdn.com/dark_all/';
function world(lat,lng,z){const size=TILE*2**z;const sin=clamp(Math.sin(rad(lat)),-.9999,.9999);return{x:(lng+180)/360*size,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size};}
function inverse(x,y,z){const size=TILE*2**z;const n=Math.PI-2*Math.PI*y/size;return{lat:180/Math.PI*Math.atan(Math.sinh(n)),lng:x/size*360-180};}
function cellId(lat,lng){return`${Math.floor(lng*250)}:${Math.floor(lat*250)}`;}
function km(a,b){const p1=rad(a.lat),p2=rad(b.lat),dl=rad(b.lng-a.lng),dp=p2-p1;return 12742*Math.asin(Math.min(1,Math.sqrt(Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2)));}
function validArea(lat,lng){return lat>=54.72&&lat<=56.09&&lng>=36.70&&lng<=38.18;}
function formatDate(date){return new Date(date).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}
const info={claim:'⚑ Захват',attack:'⚔ Атака',fort:'▤ Блокпост',recruit:'＋ Набор',deploy:'♟ Отряд',move:'➜ Движение'};
export class Conquest{
  constructor(sb,{getProfile=()=>({}),getUser=()=>null,onExit=()=>{},toast=()=>{}}={}){
    this.sb=sb;this.getProfile=getProfile;this.getUser=getUser;this.onExit=onExit;this.toast=toast;
    this.canvas=null;this.ctx=null;this.pane=null;this.view={...VIEW};this.tiles=new Map();this.cells=[];this.units=[];this.player=null;
    this.selected=null;this.selectedUnit=null;this.moveMode=false;this.online=false;this.connected=false;this.busy=false;this.status='Подключение к миру…';this.raf=0;this.closed=true;this.pointer=new Map();this.events=null;this.demo=false;this.demoState=null;this.demoUserId='conquest-local-demo';this.tab='territory';this.lastTap=0;
  }
  open(pane){this.close();this.closed=false;this.pane=pane;this.events=new AbortController();this.pane.innerHTML=`
    <section class="conquest" aria-label="RNDM Conquest: Москва">
      <header class="conquest-topbar"><div class="conquest-brand"><button class="conquest-back" data-conquest="exit" aria-label="К списку игр">←</button><div><small>RNDM / ИГРЫ / ГЛОБАЛЬНАЯ СТРАТЕГИЯ</small><h2>CONQUEST <span>МОСКВА</span></h2><small class="conquest-subtitle">БОРЬБА ЗА ГОРОД · ЕДИНЫЙ МИР</small></div></div><div class="conquest-economy"><span title="Кредиты">◈ <b id="cqCredits">—</b></span><span title="Свободные бойцы">♟ <b id="cqTroops">—</b></span><span title="Территории">▣ <b id="cqOwned">—</b></span><span class="conquest-income" title="Доход за минуту">↗ <b id="cqIncome">—</b>/мин</span></div></header>
      <div class="conquest-game">
        <div class="conquest-map-viewport" id="cqViewport" tabindex="0" aria-label="Карта Москвы. Масштабирование колёсиком мыши или двумя пальцами, перемещение перетаскиванием.">
          <canvas id="cqCanvas"></canvas>
          <div class="conquest-toolbar"><button data-conquest="moscow" title="Обзор всей Москвы">◈ <span>Вся Москва</span></button><button data-conquest="butovo" title="Северное Бутово">⌖ <span>Бутово</span></button><button data-conquest="city" title="Москва-Сити">▥ <span>Сити</span></button><button data-conquest="zelenograd" title="Зеленоград">▧ <span>Зеленоград</span></button><button data-conquest="new" title="Новая Москва">◇ <span>Новая Москва</span></button></div>
          <div class="conquest-zoom"><button data-conquest="zoomIn" aria-label="Приблизить">＋</button><button data-conquest="zoomOut" aria-label="Отдалить">−</button></div>
          <div class="conquest-legend"><span><i class="you"></i> Ваши</span><span><i class="enemy"></i> Другие игроки</span><span><i class="neutral"></i> Нейтральные</span></div>
          <div class="conquest-maplabel"><strong>ГЛОБАЛЬНАЯ КАРТА</strong><small id="cqTileStatus">Загрузка картографической подложки…</small></div><div class="conquest-coords" id="cqPosition">МОСКВА · ЗАГРУЗКА</div>
          <a class="conquest-attrib" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap · © CARTO</a>
        </div>
        <aside class="conquest-side" id="cqSide">
          <div class="conquest-side-head"><div><small>СТРАТЕГИЧЕСКИЙ ШТАБ</small><strong>Командование</strong></div><button class="conquest-minimize" id="cqMinimize" data-conquest="minimize" aria-label="Свернуть игровую панель">⌄</button></div>
          <div class="conquest-side-body"><div class="conquest-connection" id="cqStatus" role="status">Подключение к миру…</div><nav class="conquest-tabs" aria-label="Панель управления"><button type="button" data-conquest="tab-territory" class="active">Участок</button><button type="button" data-conquest="tab-army">Армия</button><button type="button" data-conquest="tab-intel">Задачи</button></nav>
          <div class="conquest-target" id="cqTerritory"><small id="cqTargetType">ВЫБЕРИ УЧАСТОК</small><h3 id="cqTargetName">Москва ждёт командиров</h3><p id="cqTargetInfo">Приблизь карту и нажми на квартал. На телефоне двигай карту пальцем и масштабируй двумя пальцами.</p></div>
          <div class="conquest-actions" id="cqActions"><button data-conquest="claim" id="cqClaim" disabled>⚑ Захват · 100</button><button data-conquest="attack" id="cqAttack" disabled>⚔ Атаковать</button><button data-conquest="fort" id="cqFort" disabled>▤ Блокпост · 200</button><button data-conquest="recruit" id="cqRecruit" disabled>＋ Бойцы · 150</button><button data-conquest="deploy" id="cqDeploy" disabled>♟ Создать отряд</button><button data-conquest="move" id="cqMove" disabled>➜ Отправить отряд</button></div>
          <div class="conquest-army-panel" id="cqArmy" hidden><div class="conquest-panel-label">УПРАВЛЕНИЕ ВОЙСКАМИ</div><p>Выдели зелёный маркер отряда на карте, затем нажми «Маршрут» и укажи точку назначения.</p><div id="cqArmyList"></div></div><div class="conquest-missions" id="cqMissions" hidden><div class="conquest-panel-label">ОПЕРАЦИИ</div><div id="cqMissionList"></div></div><div class="conquest-feed"><small>ОПЕРАТИВНАЯ СВОДКА</small><div id="cqFeed" aria-live="polite">Выбери точку на карте, чтобы начать.</div></div>
          <div class="conquest-help">ПК: колесо, ЛКМ для карты, выбор отряда кликом. Телефон: перетаскивание, двойное касание, жест двумя пальцами. В онлайн-режиме сервер подтверждает все действия.</div>
          </div>
        </aside>
      </div>
    </section>`;
    this.canvas=pane.querySelector('#cqCanvas');this.ctx=this.canvas.getContext('2d',{alpha:false});this.viewport=pane.querySelector('#cqViewport');
    const sig=this.events.signal;
    pane.querySelector('.conquest').addEventListener('click',event=>{const el=event.target.closest('[data-conquest]');if(el)void this.click(el.dataset.conquest);},{signal:sig});
    this.viewport.addEventListener('pointerdown',e=>this.down(e),{signal:sig});
    this.viewport.addEventListener('pointermove',e=>this.pointerMove(e),{signal:sig});
    this.viewport.addEventListener('pointerup',e=>this.up(e),{signal:sig});
    this.viewport.addEventListener('pointercancel',e=>this.up(e,true),{signal:sig});
    this.viewport.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY<0?1:-1,e.clientX,e.clientY);},{signal:sig,passive:false});
    this.viewport.addEventListener('dblclick',e=>{e.preventDefault();this.zoom(1,e.clientX,e.clientY);},{signal:sig});
    this.viewport.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();this.zoom(1);}if(e.key==='-'){e.preventDefault();this.zoom(-1);}if(e.key==='Escape'){this.moveMode=false;this.renderPanel();}},{signal:sig});
    window.addEventListener('resize',()=>this.resize(),{signal:sig});document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.refreshSoon(100);},{signal:sig});
    this.resize();this.loop();void this.connect();
  }
  $ (id){return this.pane?.querySelector('#'+id);}
  feed(message,error=false){const el=this.$('cqFeed');if(el){const item=document.createElement('div');item.className='conquest-event'+(error?' error':'');item.textContent=message;el.prepend(item);while(el.children.length>5)el.lastChild.remove();}if(error)this.toast(message);}
  setStatus(s,ok=false){this.status=s;const el=this.$('cqStatus');if(el){el.textContent=(ok?'● ':'◌ ')+s;el.classList.toggle('online',ok);}}
  resize(){if(!this.canvas||this.closed)return;const dpr=Math.min(devicePixelRatio||1,2),r=this.viewport.getBoundingClientRect();const w=Math.max(320,Math.round(r.width*dpr)),h=Math.max(250,Math.round(r.height*dpr));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.dpr=dpr;this.w=w/dpr;this.h=h/dpr;}
  setView(lat,lng,zoom){this.view={lat,lng,zoom:clamp(zoom,7,19)};const position=this.$('cqPosition');if(position)position.textContent=`${lat.toFixed(3)}° · ${lng.toFixed(3)}° | z${this.view.zoom}`;this.refreshSoon(400);}
  zoom(dir,clientX,clientY){const next=clamp(this.view.zoom+dir,7,19);if(next===this.view.zoom)return;const r=this.viewport.getBoundingClientRect(),px=clientX==null?this.w/2:clientX-r.left,py=clientY==null?this.h/2:clientY-r.top;const under=this.screenToGeo(px,py);this.view.zoom=next;const p=world(under.lat,under.lng,next),middle={x:p.x-(px-this.w/2),y:p.y-(py-this.h/2)},geo=inverse(middle.x,middle.y,next);this.view.lat=clamp(geo.lat,54.35,56.4);this.view.lng=clamp(geo.lng,36.1,38.8);this.refreshSoon(350);}
  screenToGeo(x,y){const o=world(this.view.lat,this.view.lng,this.view.zoom);return inverse(o.x+x-this.w/2,o.y+y-this.h/2,this.view.zoom);}
  geoToScreen(lat,lng){const o=world(this.view.lat,this.view.lng,this.view.zoom),p=world(lat,lng,this.view.zoom);return{x:p.x-o.x+this.w/2,y:p.y-o.y+this.h/2};}
  down(e){if(e.target.closest('button,a'))return;if(e.pointerType==='mouse'&&e.button!==0)return;this.viewport.setPointerCapture?.(e.pointerId);this.pointer.set(e.pointerId,{x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:performance.now(),moved:false});if(this.pointer.size===2){const v=[...this.pointer.values()];this.pinchStart={dist:Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y),zoom:this.view.zoom};}}
  pointerMove(e){const p=this.pointer.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>8)p.moved=true;
    if(this.pointer.size===2){const ps=[...this.pointer.values()];const dist=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);if(this.pinchStart){const target=clamp(Math.round(this.pinchStart.zoom+Math.log2(dist/Math.max(1,this.pinchStart.dist))),7,19);if(target!==this.view.zoom)this.zoom(target-this.view.zoom,(ps[0].x+ps[1].x)/2,(ps[0].y+ps[1].y)/2);}return;}
    const center=world(this.view.lat,this.view.lng,this.view.zoom);const next=inverse(center.x-dx,center.y-dy,this.view.zoom);this.view.lat=clamp(next.lat,54.3,56.5);this.view.lng=clamp(next.lng,35.9,38.9);
  }
  up(e,cancel=false){const p=this.pointer.get(e.pointerId);if(!p)return;this.pointer.delete(e.pointerId);if(this.pointer.size<2)this.pinchStart=null;this.refreshSoon(800);if(cancel||p.moved||this.pointer.size) return;
    const r=this.viewport.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(x<0||y<0||x>r.width||y>r.height)return;
    const latlng=this.screenToGeo(x,y);const unit=this.units.find(u=>{const coord=this.unitPosition(u),pt=this.geoToScreen(coord.lat,coord.lng);return Math.hypot(pt.x-x,pt.y-y)<22;});
    if(!this.moveMode&&unit&&unit.owner_id===this.getUser()?.id){this.selectedUnit=unit.id;this.feed('Отряд выбран. Нажми «Отправить отряд», затем укажи место.');this.renderPanel();return;}
    if(this.moveMode){void this.action('move',latlng,this.selectedUnit);this.moveMode=false;this.renderPanel();return;}
    if(validArea(latlng.lat,latlng.lng)){this.selected=latlng;this.renderPanel();}else this.feed('За пределами игрового региона Москвы. Выбери участок в городе.',true);
  }
  unitPosition(u){const a=Date.parse(u.updated_at||u.created_at),b=Date.parse(u.arrive_at||u.updated_at);const t=b>a?clamp((Date.now()-a)/(b-a),0,1):1;return{lat:u.from_lat+(u.to_lat-u.from_lat)*t,lng:u.from_lng+(u.to_lng-u.from_lng)*t};}
  loop(time=0){if(this.closed)return;if(!document.hidden&&(!this.lastDraw||time-this.lastDraw>=33)){this.draw();this.lastDraw=time;}this.raf=requestAnimationFrame(t=>this.loop(t));}
  draw(){if(!this.ctx||!this.w)return;const ctx=this.ctx;ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.fillStyle='#101a25';ctx.fillRect(0,0,this.w,this.h);this.drawTiles(ctx);
    const z=this.view.zoom;
    for(const c of this.cells){
      const mine=c.owner_id===this.getUser()?.id,p=this.geoToScreen(c.lat,c.lng);
      if(p.x< -130||p.y< -130||p.x>this.w+130||p.y>this.h+130)continue;
      if(z>=11){
        const x0=c.cell_x/250,x1=(c.cell_x+1)/250,y0=c.cell_y/250,y1=(c.cell_y+1)/250;
        const a=this.geoToScreen(y0,x0),b=this.geoToScreen(y1,x1);
        ctx.fillStyle=mine?'#1f82e63d':'#ec54613b';ctx.fillRect(a.x,b.y,b.x-a.x,a.y-b.y);
        ctx.lineWidth=mine?1.6:1.3;ctx.strokeStyle=mine?'#5db6ff':'#f77a88';ctx.strokeRect(a.x,b.y,b.x-a.x,a.y-b.y);
      }else{
        ctx.beginPath();ctx.arc(p.x,p.y,Math.max(6,2.5+(z-7)*2.1),0,Math.PI*2);
        ctx.fillStyle=mine?'#287fe1ad':'#dc5266ac';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle=mine?'#8bc5ff':'#ff9aab';ctx.stroke();
      }
      if(c.fort_level&&z>=11){const r=Math.min(10,Math.max(5,2**(z-12)*3));ctx.fillStyle='#ffd783';ctx.fillRect(p.x-r/2,p.y-r/2,r,r);ctx.strokeStyle='#16233b';ctx.strokeRect(p.x-r/2,p.y-r/2,r,r);}
    }
    for(const u of this.units){const pos=this.unitPosition(u),p=this.geoToScreen(pos.lat,pos.lng);if(p.x< -50||p.y< -50||p.x>this.w+50||p.y>this.h+50)continue;const mine=u.owner_id===this.getUser()?.id;if(this.selectedUnit===u.id&&Date.parse(u.arrive_at)>Date.now()){const dest=this.geoToScreen(u.to_lat,u.to_lng);ctx.strokeStyle='#9eede2';ctx.lineWidth=2;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(dest.x,dest.y);ctx.stroke();ctx.setLineDash([]);}ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fillStyle=mine?'#59e3c6':'#f98d95';ctx.fill();ctx.strokeStyle=this.selectedUnit===u.id?'#fff8c7':'#081923';ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle='#09111b';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText('♟',p.x,p.y+4);}
    if(this.selected){const p=this.geoToScreen(this.selected.lat,this.selected.lng);ctx.strokeStyle='#f5d16d';ctx.lineWidth=2;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(p.x,p.y,19,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    if(this.$('cqPosition')&&Date.now()-(this.lastPos||0)>1000){this.lastPos=Date.now();this.$('cqPosition').textContent=`${this.view.lat.toFixed(3)}° · ${this.view.lng.toFixed(3)}° | z${this.view.zoom}`;}
  }
  drawFallbackTile(ctx,x,y,z,tx,ty){
    // A schematic backdrop only; NOT real-world road or building geometry.
    ctx.fillStyle='#172433';ctx.fillRect(x,y,256,256);
    const rand=(i,j)=>(((tx*73856093)^(ty*19349663)^(i*83492791)^(j*2971215073)^(z*1640531513))>>>0)%101;
    for(let j=0;j<4;j++)for(let i=0;i<4;i++){
      const bx=x+i*64+10,by=y+j*64+10;
      ctx.fillStyle=rand(i,j)<19?'#233c46':'#20313f';ctx.fillRect(bx,by,47,47);
      ctx.fillStyle='#304453';const gap=3,ww=17,hh=12;
      if(rand(i+4,j)<86)ctx.fillRect(bx+gap,by+gap,ww,hh);
      if(rand(i,j+7)<70)ctx.fillRect(bx+25,by+gap,17,19);
      if(rand(i+9,j+3)<80)ctx.fillRect(bx+gap,by+26,34,13);
    }
    ctx.strokeStyle='#496073';ctx.lineWidth=5;
    for(let i=0;i<=4;i++){ctx.beginPath();ctx.moveTo(x+i*64,y);ctx.lineTo(x+i*64,y+256);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y+i*64);ctx.lineTo(x+256,y+i*64);ctx.stroke();}
    ctx.strokeStyle='#718899';ctx.lineWidth=.6;
    for(let i=0;i<=4;i++){ctx.beginPath();ctx.moveTo(x+i*64,y);ctx.lineTo(x+i*64,y+256);ctx.stroke();ctx.beginPath();ctx.moveTo(x,y+i*64);ctx.lineTo(x+256,y+i*64);ctx.stroke();}
  }
  drawTiles(ctx){const z=this.view.zoom,center=world(this.view.lat,this.view.lng,z),sx=center.x-this.w/2,sy=center.y-this.h/2;const x0=Math.floor(sx/TILE),y0=Math.floor(sy/TILE),x1=Math.ceil((sx+this.w)/TILE),y1=Math.ceil((sy+this.h)/TILE),n=2**z;
    const active=new Set();for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){if(y<0||y>=n)continue;const wrapped=((x%n)+n)%n,key=`${z}/${wrapped}/${y}`;active.add(key);let t=this.tiles.get(key);if(!t){t={state:0};this.tiles.set(key,t);const image=new Image();image.decoding='async';image.referrerPolicy='strict-origin-when-cross-origin';image.onload=()=>{t.image=image;t.state=1;this.tileOk=true;};image.onerror=()=>{t.state=-1;};image.src=`${tileHost}${z}/${wrapped}/${y}.png`;}
      const px=x*TILE-sx,py=y*TILE-sy;if(t.state===1)ctx.drawImage(t.image,px,py,TILE+1,TILE+1);else this.drawFallbackTile(ctx,px,py,z,wrapped,y);}
    if(Date.now()-(this.lastTileStatus||0)>1500){this.lastTileStatus=Date.now();const status=this.$('cqTileStatus');if(status)status.textContent=this.tileOk?'Реальные улицы · OpenStreetMap / CARTO':'СХЕМА · реальная карта требует интернет';}
    if(this.tiles.size>220){for(const [k] of this.tiles){if(!active.has(k)){this.tiles.delete(k);if(this.tiles.size<125)break;}}}
  }
  // LOCAL DEMO: explicitly disconnected from the real server; persistent only in this browser.
  initDemo(){
    const saved=(()=>{try{return JSON.parse(localStorage.getItem('rndm_cq_v70_demo'))}catch{return null}})();
    if(saved&&Array.isArray(saved.cells)&&Array.isArray(saved.units)&&Number.isFinite(saved.credits))return saved;
    const make=(lat,lng,owner_id,fort_level=0,garrison=4)=>{
      const cell_x=Math.floor(lng*250),cell_y=Math.floor(lat*250);
      return {cell_x,cell_y,lat:(cell_y+.5)/250,lng:(cell_x+.5)/250,owner_id,fort_level,garrison,shield_until:new Date(Date.now()-1000).toISOString()};
    };
    const cells=[make(55.568,37.578,this.demoUserId,1,6),make(55.566,37.586,'rival-red',1,6),make(55.565,37.591,'rival-red',0,4),make(55.571,37.585,'rival-red',0,4),make(55.563,37.568,'rival-orange',0,4),make(55.749,37.539,'rival-red',2,10),make(55.7558,37.6173,'rival-orange',2,8),make(55.992,37.211,'rival-red',1,8),make(55.407,37.146,'rival-orange',1,8)];
    return {credits:1350,troops:16,cells,units:[],last_income_at:Date.now(),last_action_at:0};
  }
  demoSave(){try{localStorage.setItem('rndm_cq_v70_demo',JSON.stringify(this.demoState));}catch{this.feed('Не удалось сохранить локальный прогресс.',true);}}
  demoSync(){
    const s=this.demoState,elapsed=Math.max(0,Math.floor((Date.now()-s.last_income_at)/60000)),owned=s.cells.filter(c=>c.owner_id===this.demoUserId).length,rate=Math.min(120,2+owned*2);
    if(elapsed){s.credits=Math.min(20000,s.credits+Math.min(elapsed,720)*rate);s.last_income_at+=elapsed*60000;this.demoSave();}
    return{credits:s.credits,troops:s.troops,owned,callsign:'Командир',income_per_minute:rate};
  }
  startDemo(message){
    if(this.closed)return;this.demo=true;this.online=true;this.demoState=this.initDemo();this.getUser=()=>({id:this.demoUserId});this.player=this.demoSync();
    this.setStatus('ДЕМО · локально, другие игроки не подключены',false);
    this.feed('Демонстрационный режим. Захваты и отряды сохраняются на этом устройстве.');
    if(message)this.feed(message,false);
    this.updateStats();this.refresh();
    this.setView(55.568,37.58,13);
    const hq=this.demoState.cells.find(c=>c.owner_id===this.demoUserId);
    if(hq){this.selected={lat:hq.lat,lng:hq.lng};this.renderPanel();}
    this.interval=setInterval(()=>{if(!this.closed){this.player=this.demoSync();this.updateStats();}},30000);
  }
  demoAction(action,point,unitId){
    const s=this.demoState,id=this.demoUserId;
    if(Date.now()-s.last_action_at<550)throw Error('Подожди немного перед следующей командой.');
    const x=point?Math.floor(point.lng*250):null,y=point?Math.floor(point.lat*250):null;
    const c=s.cells.find(c=>c.cell_x===x&&c.cell_y===y);
    const owned=s.cells.filter(q=>q.owner_id===id);
    const adjacent=owned.some(q=>Math.abs(q.cell_x-x)<=2&&Math.abs(q.cell_y-y)<=2);
    let message='Команда выполнена';
    if(action!=='recruit'&&(!point||!validArea(point.lat,point.lng)))throw Error('Выбери участок в игровой зоне Москвы.');
    if(action==='claim'){
      if(c)throw Error('Квартал уже занят.');
      if(owned.length&&!adjacent)throw Error('Захватывай кварталы возле своей территории.');
      if(s.credits<100)throw Error('Нужно 100 кредитов.');
      s.credits-=100;s.cells.push({cell_x:x,cell_y:y,lat:(y+.5)/250,lng:(x+.5)/250,owner_id:id,fort_level:0,garrison:4,shield_until:new Date(Date.now()+120000).toISOString()});message='Участок перешёл под твой контроль!';
    }else if(action==='fort'){
      if(!c||c.owner_id!==id)throw Error('Строй блокпост на своём участке.');
      if(c.fort_level>=3)throw Error('Максимальное укрепление.');
      if(s.credits<200)throw Error('Нужно 200 кредитов.');
      s.credits-=200;c.fort_level++;c.garrison=Math.min(80,c.garrison+3);message='Блокпост улучшен до уровня '+c.fort_level;
    }else if(action==='recruit'){
      if(s.credits<150)throw Error('Нужно 150 кредитов.');
      if(s.troops>55)throw Error('Достигнут лимит свободных бойцов.');
      s.credits-=150;s.troops+=5;message='В резерве +5 бойцов';
    }else if(action==='deploy'){
      if(!c||c.owner_id!==id)throw Error('Набирай отряды на своей территории.');
      if(s.troops<4)throw Error('Требуется четыре бойца.');
      if(s.units.length>=20)throw Error('Лимит 20 отрядов.');
      s.troops-=4;const at={lat:(y+.5)/250,lng:(x+.5)/250};s.units.push({id:'demo-'+Date.now(),owner_id:id,from_lat:at.lat,from_lng:at.lng,to_lat:at.lat,to_lng:at.lng,size:4,updated_at:new Date().toISOString(),arrive_at:new Date().toISOString()});message='Отряд создан. Выдели его на карте.';
    }else if(action==='move'){
      const u=s.units.find(q=>q.id===unitId&&q.owner_id===id);if(!u)throw Error('Сначала выбери свой отряд.');
      if(Date.parse(u.arrive_at)>Date.now())throw Error('Отряд пока в пути.');
      const d=km({lat:u.to_lat,lng:u.to_lng},point);if(d>3.5)throw Error('Не более 3,5 км за один приказ.');
      u.from_lat=u.to_lat;u.from_lng=u.to_lng;u.to_lat=point.lat;u.to_lng=point.lng;u.updated_at=new Date().toISOString();u.arrive_at=new Date(Date.now()+Math.max(3000,d*1000/12*1000)).toISOString();message='Отряд отправлен: '+Math.ceil(d*1000/12)+' с в пути';
    }else if(action==='attack'){
      if(!c||c.owner_id===id)throw Error('Нужен чужой участок.');
      if(!adjacent)throw Error('Нужна соседняя контролируемая территория.');
      if(Date.parse(c.shield_until)>Date.now())throw Error('Участок пока под защитой.');
      const u=s.units.find(q=>q.owner_id===id&&q.size>=3&&Date.parse(q.arrive_at)<=Date.now()&&km({lat:q.to_lat,lng:q.to_lng},point)<1.8);
      if(!u)throw Error('Подведи отряд из 3+ бойцов к атакуемому кварталу.');
      const won=Math.random()*14+u.size*2>c.garrison+c.fort_level*4;u.size=Math.max(1,u.size-(won?2:1));
      if(won){c.owner_id=id;c.fort_level=0;c.garrison=3;c.shield_until=new Date(Date.now()+240000).toISOString();message='Победа! Квартал захвачен.';}
      else{c.garrison=Math.max(1,c.garrison-2);message='Штурм не удался. Защитники понесли потери.';}
    }else throw Error('Неизвестная команда.');
    s.last_action_at=Date.now();this.demoSave();return{ok:true,message};
  }
  async connect(){if(!this.sb){this.startDemo('Для общего онлайна открой игру в RNDM Chat после установки SQL.');return;}try{
      const {data:{user},error:ue}=await this.sb.auth.getUser();if(ue||!user)throw Error('Войди в аккаунт RNDM Chat.');
      const {data,error}=await this.sb.rpc('conquest_sync',{p_callsign:String(this.getProfile()?.display_name||this.getProfile()?.username||'Игрок').slice(0,28)});
      if(error)throw error;if(this.closed)return;this.player=data;this.online=true;this.setStatus('Сервер отвечает · общий мир',true);this.updateStats();await this.refresh();
      this.channel=this.sb.channel('rndm-conquest-v1-'+Math.random().toString(36).slice(2)).on('postgres_changes',{event:'*',schema:'public',table:'conquest_cells'},()=>this.refreshSoon(450)).on('postgres_changes',{event:'*',schema:'public',table:'conquest_units'},()=>this.refreshSoon(450)).subscribe(status=>{if(this.closed)return;this.connected=status==='SUBSCRIBED';this.setStatus(this.connected?'Онлайн · изменения в реальном времени':'Онлайн · периодическое обновление',true);});
      this.interval=setInterval(()=>this.refresh(),15000);this.feed('Подключено к общему миру. Сражения и захваты синхронизируются между игроками.');
    }catch(error){this.online=false;this.startDemo('Онлайн недоступен: проверь SQL и вход в RNDM. '+(error.message||''));}}
  async refresh(force=false){if(this.closed||!this.online||(this.busy&&!force))return;
    if(this.demo){const sw=this.screenToGeo(0,this.h),ne=this.screenToGeo(this.w,0);this.cells=this.demoState.cells.filter(c=>c.lat>=sw.lat-.06&&c.lat<=ne.lat+.06&&c.lng>=sw.lng-.06&&c.lng<=ne.lng+.06);this.units=this.demoState.units.filter(u=>u.to_lat>=sw.lat-.12&&u.to_lat<=ne.lat+.12&&u.to_lng>=sw.lng-.12&&u.to_lng<=ne.lng+.12);this.player=this.demoSync();this.updateStats();this.renderPanel();return;} 
    const sw=this.screenToGeo(0,this.h),ne=this.screenToGeo(this.w,0);
    try{const [cells,units,stats]=await Promise.all([
      this.sb.from('conquest_cells').select('cell_x,cell_y,lat,lng,owner_id,fort_level,garrison,shield_until').gte('lat',sw.lat-.06).lte('lat',ne.lat+.06).gte('lng',sw.lng-.06).lte('lng',ne.lng+.06).limit(700),
      this.sb.from('conquest_units').select('id,owner_id,from_lat,from_lng,to_lat,to_lng,size,updated_at,arrive_at').gte('to_lat',sw.lat-.12).lte('to_lat',ne.lat+.12).gte('to_lng',sw.lng-.12).lte('to_lng',ne.lng+.12).limit(400),
      this.sb.rpc('conquest_sync',{p_callsign:String(this.getProfile()?.display_name||this.getProfile()?.username||'Игрок').slice(0,28)})
    ]);for(const q of [cells,units,stats])if(q.error)throw q.error;
      if(this.closed)return;this.cells=cells.data||[];this.units=units.data||[];this.player=stats.data;this.updateStats();this.renderPanel();
    }catch(error){this.setStatus('Проблема связи · переподключение');this.feed('Не удалось получить состояние карты: '+error.message,true);}}
  refreshSoon(delay=300){if(!this.online)return;clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>this.refresh(),delay);}
  updateStats(){const p=this.player||{};for(const [id,v] of [['cqCredits',p.credits],['cqTroops',p.troops],['cqOwned',p.owned],['cqIncome',p.income_per_minute]]){const el=this.$(id);if(el)el.textContent=Number.isFinite(Number(v))?Number(v).toLocaleString('ru-RU'):'—';}}
  renderPanel(){if(this.closed)return;const c=this.selected&&this.cells.find(c=>cellId(c.lat,c.lng)===cellId(this.selected.lat,this.selected.lng));const own=c?.owner_id===this.getUser()?.id,enemy=!!c&&!own,neutral=!c;
    for(const t of ['territory','army','intel']){const tab=this.pane?.querySelector('[data-conquest="tab-'+t+'"]');if(tab)tab.classList.toggle('active',this.tab===t);}
    for(const [id,show] of [['cqTerritory',this.tab==='territory'],['cqActions',this.tab==='territory'],['cqArmy',this.tab==='army'],['cqMissions',this.tab==='intel']]){const el=this.$(id);if(el)el.hidden=!show;}
    this.renderArmy();this.renderMissions();
    this.$('cqTargetType').textContent=!this.selected?'СТРАТЕГИЧЕСКИЙ ОБЗОР':own?'ВАША ТЕРРИТОРИЯ':enemy?'ТЕРРИТОРИЯ ПРОТИВНИКА':'НЕЙТРАЛЬНЫЙ УЧАСТОК';
    this.$('cqTargetName').textContent=!this.selected?'Карта всей Москвы':own?'Контролируемый квартал':enemy?'Чужая территория':'Свободный квартал';
    this.$('cqTargetInfo').textContent=!this.selected?'Выбери любой квартал Москвы. Для отображения зданий и улиц приблизь карту.':`${this.selected.lat.toFixed(5)}°, ${this.selected.lng.toFixed(5)}° · ${own?`Защита: ${c.garrison} · Блокпост: ${c.fort_level}/3`:enemy?`Гарнизон: ${c.garrison} · Укрепление: ${c.fort_level}`:'Свободно для захвата'}.`;
    const enabled=this.online&&!this.busy&&!!this.selected;const set=(id,allowed)=>{const el=this.$(id);if(el)el.disabled=!allowed;};
    set('cqClaim',enabled&&neutral&&Number(this.player?.credits)>=100);
    set('cqAttack',enabled&&enemy&&Number(this.player?.troops)>=2);
    set('cqFort',enabled&&own&&Number(this.player?.credits)>=200&&(c.fort_level||0)<3);
    set('cqRecruit',this.online&&!this.busy&&Number(this.player?.credits)>=150);
    set('cqDeploy',enabled&&own&&Number(this.player?.troops)>=4);
    set('cqMove',this.online&&!this.busy&&!!this.selectedUnit);
    const b=this.$('cqMove');if(b)b.textContent=this.moveMode?'✕ Отменить выбор':'➜ Отправить отряд';
  }
  renderArmy(){
    const el=this.$('cqArmyList');if(!el)return;
    const mine=this.units.filter(u=>u.owner_id===this.getUser()?.id);
    el.replaceChildren();
    if(!mine.length){const p=document.createElement('p');p.textContent='Пока нет отрядов. Выбери свой квартал на карте → «Создать отряд».';el.append(p);return;}
    mine.forEach((u,i)=>{const b=document.createElement('button');b.type='button';b.className='conquest-unit-card';b.textContent=`Отряд ${i+1} · ${u.size} бойца · ${Date.parse(u.arrive_at)>Date.now()?'в пути':'на позиции'}`;if(this.selectedUnit===u.id)b.classList.add('active');b.addEventListener('click',()=>{this.selectedUnit=u.id;this.tab='territory';const p=this.unitPosition(u);this.setView(p.lat,p.lng,Math.max(this.view.zoom,14));this.renderPanel();this.feed('Отряд выбран. Выбери «Отправить отряд» для маршрута.');});el.append(b);});
  }
  renderMissions(){const el=this.$('cqMissionList');if(!el)return;const owned=this.player?.owned||0,forts=this.cells.filter(c=>c.owner_id===this.getUser()?.id&&c.fort_level>0).length,units=this.units.filter(u=>u.owner_id===this.getUser()?.id).length;const missions=[['Первый штаб','Захвати первый квартал',owned>=1],['Расширение','Контролируй 3 квартала',owned>=3],['Линия обороны','Построй блокпост',forts>=1],['Первый приказ','Создай отряд',units>=1],['Влияние','Контролируй 10 кварталов',owned>=10]];el.replaceChildren();for(const [name,detail,done] of missions){const item=document.createElement('div');item.className='conquest-mission'+(done?' complete':'');const mark=document.createElement('span');mark.textContent=done?'✓':'○';const copy=document.createElement('div');const bold=document.createElement('strong');bold.textContent=name;const small=document.createElement('small');small.textContent=detail;copy.append(bold,small);item.append(mark,copy);el.append(item);}}
  async action(action,point=this.selected,unitId=null){if(!this.online||this.busy)return;if(!point&&action!=='recruit')return;this.busy=true;this.renderPanel();try{const args={p_action:action,p_lat:point?.lat??null,p_lng:point?.lng??null,p_unit_id:unitId??null};const {data,error}=this.demo?{data:this.demoAction(action,point,unitId),error:null}:await this.sb.rpc('conquest_action',args);if(error)throw error;this.feed(data?.message||'Команда выполнена');await this.refresh(true);}catch(error){this.feed(error.message||'Действие не удалось',true);}finally{this.busy=false;this.renderPanel();}}
  async click(action){if(action==='exit'){this.close();this.onExit();return;}if(action.startsWith('tab-')){this.tab=action.slice(4);this.renderPanel();return;}if(action==='minimize'){this.$('cqSide').classList.toggle('collapsed');this.resize();return;}if(action==='zoomIn'){this.zoom(1);return;}if(action==='zoomOut'){this.zoom(-1);return;}if(action==='moscow'){this.setView(VIEW.lat,VIEW.lng,9);return;}if(MOSCOW_POINTS[action]){const p=MOSCOW_POINTS[action];this.setView(p.lat,p.lng,13);return;}if(action==='move'){if(!this.selectedUnit){this.feed('Нажми на зелёный значок отряда на карте.',true);return;}this.moveMode=!this.moveMode;this.renderPanel();if(this.moveMode)this.feed('Выбери точку назначения на карте.');return;}if(Object.keys(info).includes(action)){await this.action(action);}}
  close(){this.closed=true;this.events?.abort();this.events=null;this.channel?.unsubscribe().catch?.(()=>{});if(this.channel&&this.sb)this.sb.removeChannel(this.channel).catch?.(()=>{});this.channel=null;clearInterval(this.interval);clearTimeout(this.refreshTimer);cancelAnimationFrame(this.raf);this.pointer.clear();this.tiles.clear();this.online=false;this.canvas=null;this.ctx=null;this.pane=null;this.demo=false;}
}
