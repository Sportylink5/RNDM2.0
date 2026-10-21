// Deterministic simulation. Only the elected room host advances the world.
export const LIMIT=8;
export const COLORS=['#a78bfa','#35e4bb','#ffbf69','#ff6e9c','#67caff','#e3ed78','#ef9fff','#ff896b'];
export const MODES={race:{name:'Neon Racing',label:'Онлайн-гонки',detail:'3 круга · до 8 игроков',icon:'🏎️'},fps:{name:'Signal Arena',label:'FPS от первого лица',detail:'До 10 фрагов · до 8 игроков',icon:'🎯'}};
export const MAP=[
 '11111111111111111111',
 '10000000000000000001',
 '10000000000000000001',
 '10001110000001110001',
 '10001000000000010001',
 '10000000011000000001',
 '10000000011000000001',
 '10011000000000011001',
 '10011000000000011001',
 '10000000011000000001',
 '10000000011000000001',
 '10001000000000010001',
 '10001110000001110001',
 '10000000000000000001',
 '10000000000000000001',
 '11111111111111111111'
];
const SPAWNS=[[2.5,2.5],[17.5,13.5],[17.5,2.5],[2.5,13.5],[9,2.5],[10,13.5],[2.5,8],[17.5,8]];
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
export const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
export function blocked(x,y,r=.2){for(const dx of [-r,r])for(const dy of [-r,r])if(MAP[Math.floor(y+dy)]?.[Math.floor(x+dx)]!=='0')return true;return false;}
export function rayDistance(x,y,a,max=28){const dx=Math.cos(a),dy=Math.sin(a);let gx=Math.floor(x),gy=Math.floor(y);const stepX=dx<0?-1:1,stepY=dy<0?-1:1,deltaX=Math.abs(1/dx),deltaY=Math.abs(1/dy);let sx=(dx<0?x-gx:gx+1-x)*deltaX,sy=(dy<0?y-gy:gy+1-y)*deltaY,d=0;for(let count=0;count<80&&d<max;count++){if(sx<sy){d=sx;sx+=deltaX;gx+=stepX;}else{d=sy;sy+=deltaY;gy+=stepY;}if(MAP[gy]?.[gx]!=='0')return Math.min(d,max);}return max;}
export function trackPoint(progress,lane=0){const a=progress*Math.PI*2-Math.PI/2;return {x:(24+lane)*Math.cos(a),y:(14+lane)*Math.sin(a),a:Math.atan2((14+lane)*Math.cos(a),-(24+lane)*Math.sin(a))};}
export function cleanInput(raw={}){return {gas:clamp(raw.gas,-1,1),steer:clamp(raw.steer,-1,1),forward:clamp(raw.forward,-1,1),strafe:clamp(raw.strafe,-1,1),turn:clamp(raw.turn,-1,1),look:clamp(raw.look,-1.2,1.2),fire:raw.fire===true,boost:raw.boost===true,reload:raw.reload===true};}
function spawn(p,index,players){const points=SPAWNS.map((v,i)=>({v,i,dist:Math.min(999,...Object.values(players).filter(o=>o.id!==p.id&&o.hp>0).map(o=>Math.hypot(o.x-v[0],o.y-v[1])))}));points.sort((a,b)=>b.dist-a.dist||((a.i-index+8)%8)-((b.i-index+8)%8));[p.x,p.y]=points[0].v;p.a=Math.atan2(8-p.y,10-p.x);p.hp=100;p.ammo=24;p.respawn=0;p.shield=2;p.reload=0;}
export function newRound(kind,members,round=1){if(!MODES[kind])throw Error('Неизвестная игра');const s={kind,round,status:'countdown',elapsed:0,countdown:3,players:{},events:[],firstFinish:0};members.slice(0,LIMIT).forEach((m,i)=>addPlayer(s,m,i));return s;}
export function addPlayer(s,m,index=Object.keys(s.players).length){if(s.players[m.id]||index>=LIMIT)return;const p={id:String(m.id),name:String(m.name||'Игрок').slice(0,28),color:COLORS[index%8],score:0,deaths:0};if(s.kind==='race')Object.assign(p,{progress:-index*.012,lane:(index%2?1:-1)*.9,speed:0,boost:100,finished:0,...trackPoint(-index*.012,(index%2?1:-1)*.9)});else Object.assign(p,{hp:100,ammo:24,cooldown:0,shield:2,reload:0,shot:-10,respawn:0});s.players[p.id]=p;if(s.kind==='fps')spawn(p,index,s.players);}
function raceStep(s,inputs,dt){for(const p of Object.values(s.players)){if(p.finished)continue;const v=cleanInput(inputs[p.id]),off=Math.abs(p.lane)>2.4,boost=v.boost&&p.boost>0&&!off&&v.gas>0;const cap=off?8:boost?34:25;p.speed=clamp(p.speed+(v.gas>0?11:v.gas<0?-27:-6)*dt,0,cap);p.boost=clamp(p.boost+(boost?-34:15)*dt,0,100);p.lane=clamp(p.lane+v.steer*(2.2+p.speed*.08)*dt,-4.2,4.2);p.progress+=p.speed*dt/(122+6.28*p.lane);Object.assign(p,trackPoint(p.progress,p.lane));if(p.progress>=3){p.finished=s.elapsed;s.firstFinish||=s.elapsed;}}
 const ps=Object.values(s.players);for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],b=ps[j];if(!a.finished&&!b.finished&&Math.hypot(a.x-b.x,a.y-b.y)<1.1){const k=a.lane<b.lane?-1:1;a.lane=clamp(a.lane+k*dt*2,-4.2,4.2);b.lane=clamp(b.lane-k*dt*2,-4.2,4.2);a.speed*=.98;b.speed*=.98;}}
 if(ps.every(p=>p.finished)||(s.firstFinish&&s.elapsed-s.firstFinish>20)||s.elapsed>=180)s.status='finished';}
function fpsStep(s,inputs,dt){const ps=Object.values(s.players);for(const [index,p]of ps.entries()){const v=cleanInput(inputs[p.id]);p.shield=Math.max(0,p.shield-dt);p.cooldown=Math.max(0,(p.cooldown||0)-dt);if(p.hp<=0){p.respawn-=dt;if(p.respawn<=0)spawn(p,index,s.players);continue;}p.a=angle(p.a+v.turn*2.5*dt+v.look);if(inputs[p.id])inputs[p.id].look=0;const norm=Math.max(1,Math.hypot(v.forward,v.strafe)),speed=3.7*dt/norm;const dx=(Math.cos(p.a)*v.forward-Math.sin(p.a)*v.strafe)*speed,dy=(Math.sin(p.a)*v.forward+Math.cos(p.a)*v.strafe)*speed;if(!blocked(p.x+dx,p.y))p.x+=dx;if(!blocked(p.x,p.y+dy))p.y+=dy;
 if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(!p.reload)p.ammo=24;continue;}if(v.reload&&p.ammo<24){p.reload=1.3;continue;}if(!v.fire||p.cooldown>0)continue;if(p.ammo<=0){p.reload=1.3;continue;}p.ammo--;p.cooldown=.19;p.shot=s.elapsed;p.shield=0;
 const max=rayDistance(p.x,p.y,p.a,22);let hit=null,best=max;for(const target of ps){if(target.id===p.id||target.hp<=0||target.shield>0)continue;const dx=target.x-p.x,dy=target.y-p.y,along=dx*Math.cos(p.a)+dy*Math.sin(p.a),side=Math.abs(-dx*Math.sin(p.a)+dy*Math.cos(p.a));if(along>0&&along<best&&side<.3){hit=target;best=along;}}if(hit){hit.hp=Math.max(0,hit.hp-25);if(hit.hp===0){p.score++;hit.deaths++;hit.respawn=3;s.events.unshift({by:p.name,target:hit.name,t:s.elapsed});s.events=s.events.slice(0,4);if(p.score>=10)s.status='finished';}}}
 if(s.elapsed>=240)s.status='finished';}
export function stepWorld(s,inputs,dt){if(!s||s.status==='finished')return s;dt=clamp(dt,0,.06);if(s.status==='countdown'){s.countdown-=dt;if(s.countdown<=0){s.countdown=0;s.status='playing';}return s;}s.elapsed+=dt;if(s.kind==='race')raceStep(s,inputs,dt);else fpsStep(s,inputs,dt);return s;}
export function standings(s){return Object.values(s?.players||{}).sort(s?.kind==='race'?(a,b)=>a.finished&&b.finished?a.finished-b.finished:a.finished?-1:b.finished?1:b.progress-a.progress:(a,b)=>b.score-a.score||a.deaths-b.deaths);}
