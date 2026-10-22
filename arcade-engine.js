// RNDM Arcade v70: deterministic host-authoritative racing and original FPS mode.
export const LIMIT=8;
export const COLORS=['#a78bfa','#35e4bb','#ffbf69','#ff6e9c','#67caff','#e3ed78','#ef9fff','#ff896b'];
export const MODES={race:{name:'RNDM Racing',label:'Онлайн-гонки',detail:'4 трассы · 3 уровня · умные боты',icon:'🏎️'},fps:{name:'Signal Arena',label:'FPS от первого лица',detail:'До 10 фрагов · до 8 игроков',icon:'🎯'}};
export const LEVELS={easy:{name:'Новичок',speed:.80,skill:.70},normal:{name:'Профи',speed:1,skill:1},hard:{name:'Легенда',speed:1.13,skill:1.25}};
export const TRACKS={
 neon:{name:'Ночной мегаполис',theme:'city',width:10,nodes:[[18,20],[34,11],[54,14],[74,12],[99,16],[116,27],[113,45],[101,58],[79,54],[64,67],[42,69],[19,59],[10,42]]},
 coast:{name:'Прибрежное шоссе',theme:'coast',width:9.5,nodes:[[22,18],[42,12],[68,20],[87,15],[109,25],[112,42],[99,57],[82,68],[56,64],[44,48],[29,52],[11,43],[12,29]]},
 desert:{name:'Пустынный каньон',theme:'desert',width:9.5,nodes:[[17,22],[33,13],[54,17],[76,11],[103,17],[116,35],[109,53],[88,62],[70,52],[53,67],[31,65],[11,49]]},
 snow:{name:'Снежный перевал',theme:'snow',width:9,nodes:[[18,27],[31,14],[51,12],[74,22],[97,11],[116,26],[108,46],[94,61],[74,65],[56,50],[38,67],[16,57],[11,42]]}
};
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
export const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const wrap=(n,m)=>((n%m)+m)%m;
const lerp=(a,b,t)=>a+(b-a)*t;
const tracksCache=new Map();
function catmull(a,b,c,d,t){return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);}
export function getTrack(id='neon'){
 id=TRACKS[id]?id:'neon';if(tracksCache.has(id))return tracksCache.get(id);
 const def=TRACKS[id],nodes=def.nodes,samples=[];
 for(let i=0;i<nodes.length;i++)for(let j=0;j<22;j++){const t=j/22,p=nodes[wrap(i-1,nodes.length)],a=nodes[i],b=nodes[(i+1)%nodes.length],q=nodes[(i+2)%nodes.length];samples.push({x:catmull(p[0],a[0],b[0],q[0],t),y:catmull(p[1],a[1],b[1],q[1],t)});}
 let length=0;for(let i=0;i<samples.length;i++){const a=samples[i],b=samples[(i+1)%samples.length];a.s=length;const ds=Math.hypot(b.x-a.x,b.y-a.y);a.seg=ds;length+=ds;}
 const obj={...def,id,samples,length};tracksCache.set(id,obj);return obj;
}
export function pointOnTrack(tr,progress,lane=0){const dist=wrap(progress*tr.length,tr.length);const pts=tr.samples;let lo=0,hi=pts.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(pts[mid].s<=dist)lo=mid;else hi=mid-1;}
 const a=pts[lo],b=pts[(lo+1)%pts.length],k=clamp((dist-a.s)/Math.max(a.seg,1e-6),0,1),dx=(b.x-a.x)/a.seg,dy=(b.y-a.y)/a.seg;
 return {x:lerp(a.x,b.x,k)-dy*lane,y:lerp(a.y,b.y,k)+dx*lane,a:Math.atan2(dy,dx),s:dist,dx,dy};
}
// Compatibility with the original renderer: new map argument is optional.
export function trackPoint(progress,lane=0,map='neon'){return pointOnTrack(getTrack(map),progress,lane);}
export function nearestTrack(tr,x,y){const pts=tr.samples;let best=Infinity,entry=null;for(let i=0;i<pts.length;i++){
 const a=pts[i],b=pts[(i+1)%pts.length],dx=b.x-a.x,dy=b.y-a.y,k=clamp(((x-a.x)*dx+(y-a.y)*dy)/Math.max(1e-6,dx*dx+dy*dy),0,1),xx=a.x+k*dx,yy=a.y+k*dy,d=(x-xx)**2+(y-yy)**2;
 if(d<best){best=d;entry={x:xx,y:yy,dist:Math.sqrt(d),s:a.s+k*a.seg,tx:dx/a.seg,ty:dy/a.seg,side:Math.sign(dx*(y-yy)-dy*(x-xx))};}}
 return entry;
}
export function cleanInput(raw={}){return {gas:clamp(raw.gas,-1,1),steer:clamp(raw.steer,-1,1),drift:raw.drift===true,forward:clamp(raw.forward,-1,1),strafe:clamp(raw.strafe,-1,1),turn:clamp(raw.turn,-1,1),look:clamp(raw.look,-1.2,1.2),fire:raw.fire===true,boost:raw.boost===true,reload:raw.reload===true};}
export const MAP=[
 '11111111111111111111','10000000000000000001','10000000000000000001','10001110000001110001',
 '10001000000000010001','10000000011000000001','10000000011000000001','10011000000000011001',
 '10011000000000011001','10000000011000000001','10000000011000000001','10001000000000010001',
 '10001110000001110001','10000000000000000001','10000000000000000001','11111111111111111111'];
const SPAWNS=[[2.5,2.5],[17.5,13.5],[17.5,2.5],[2.5,13.5],[9,2.5],[10,13.5],[2.5,8],[17.5,8]];
export function blocked(x,y,r=.2){for(const dx of [-r,r])for(const dy of [-r,r])if(MAP[Math.floor(y+dy)]?.[Math.floor(x+dx)]!=='0')return true;return false;}
export function rayDistance(x,y,a,max=28){const dx=Math.cos(a),dy=Math.sin(a);let gx=Math.floor(x),gy=Math.floor(y),stepX=dx<0?-1:1,stepY=dy<0?-1:1,deltaX=Math.abs(1/dx),deltaY=Math.abs(1/dy),sx=(dx<0?x-gx:gx+1-x)*deltaX,sy=(dy<0?y-gy:gy+1-y)*deltaY,d=0;for(let count=0;count<80&&d<max;count++){if(sx<sy){d=sx;sx+=deltaX;gx+=stepX;}else{d=sy;sy+=deltaY;gy+=stepY;}if(MAP[gy]?.[gx]!=='0')return Math.min(d,max);}return max;}
function spawn(p,index,players){const points=SPAWNS.map((v,i)=>({v,i,dist:Math.min(999,...Object.values(players).filter(o=>o.id!==p.id&&o.hp>0).map(o=>Math.hypot(o.x-v[0],o.y-v[1])))}));points.sort((a,b)=>b.dist-a.dist||((a.i-index+8)%8)-((b.i-index+8)%8));[p.x,p.y]=points[0].v;p.a=Math.atan2(8-p.y,10-p.x);p.hp=100;p.ammo=24;p.respawn=0;p.shield=2;p.reload=0;}
export function newRound(kind,members,round=1,opts={}){
 if(!MODES[kind])throw Error('Неизвестная игра');const track=TRACKS[opts.track]?opts.track:'neon',difficulty=LEVELS[opts.difficulty]?opts.difficulty:'normal';const s={kind,round,track,difficulty,status:'countdown',elapsed:0,countdown:3,players:{},events:[],firstFinish:0};
 members.slice(0,LIMIT).forEach((m,i)=>addPlayer(s,m,i));if(kind==='race'){const count=clamp(opts.bots,0,LIMIT-Object.keys(s.players).length);for(let i=0;i<count;i++)addPlayer(s,{id:`__rndm_bot_${i}`,name:['NITRO','KIRA','GHOST','TURBO','MAX','VIPER','BLAZE'][i],bot:true},Object.keys(s.players).length);}
 return s;
}
export function addPlayer(s,m,index=Object.keys(s.players).length){if(s.players[m.id]||index>=LIMIT)return;const p={id:String(m.id),name:String(m.name||'Игрок').slice(0,28),color:COLORS[index%8],score:0,deaths:0,bot:m.bot===true};
 if(s.kind==='race'){const tr=getTrack(s.track),distance=-index*3.5,pos=pointOnTrack(tr,distance/tr.length,(index%2?1:-1)*1.8);Object.assign(p,{x:pos.x,y:pos.y,a:pos.a,speed:0,vx:0,vy:0,boost:100,progress:distance/tr.length,raceDistance:distance,trackS:pos.s,finished:0,offroad:false,drifting:false});}
 else Object.assign(p,{hp:100,ammo:24,cooldown:0,shield:2,reload:0,shot:-10,respawn:0});s.players[p.id]=p;if(s.kind==='fps')spawn(p,index,s.players);
}
// Exposed for frame prediction: this updates real heading/velocity, not an artificial lane.
export function driveCar(p,raw,dt,tr){const v=cleanInput(raw);p.steer=v.steer;const near=nearestTrack(tr,p.x,p.y),off=near.dist>tr.width*.53;const nitro=v.boost&&p.boost>0&&v.gas>0&&!off&&p.speed>2;const speedMax=off?11:nitro?36:27;
 let acc=v.gas>0?(nitro?24:14)*v.gas:v.gas<0?(p.speed>0?29:11)*v.gas:-4;
 p.speed=clamp((p.speed||0)+acc*dt,-5,speedMax);if(v.gas===0&&Math.abs(p.speed)<.16)p.speed=0;
 p.boost=clamp((p.boost??100)+(nitro?-26:11)*dt,0,100);
 const steerSpeed=Math.min(1,Math.abs(p.speed)/5),yaw=v.steer*(v.drift?2.22:1.56)*steerSpeed*(.94+.2*clamp(Math.abs(p.speed)/27,0,1))*dt*(p.speed<0?-1:1);
 p.a=angle(p.a+yaw);const fx=Math.cos(p.a),fy=Math.sin(p.a),grip=v.drift?.9:off?1.7:6.5,blend=1-Math.exp(-grip*dt);
 p.vx=lerp(p.vx||0,fx*p.speed,blend);p.vy=lerp(p.vy||0,fy*p.speed,blend);
 if(off){const slow=Math.exp(-.85*dt);p.vx*=slow;p.vy*=slow;p.speed*=slow;}
 p.x+=(p.vx||0)*dt;p.y+=(p.vy||0)*dt;p.steer=v.steer;p.drifting=v.drift&&Math.abs(v.steer)>.1&&p.speed>8;p.offroad=off;
 const newNear=nearestTrack(tr,p.x,p.y);if(newNear.dist>tr.width*.5+9){p.x=newNear.x;p.y=newNear.y;p.speed=Math.min(p.speed,8);p.vx*=.2;p.vy*=.2;}
 // Progress is based on actual travelled position along the track; no teleport/lane exploit.
 const old=p.trackS??newNear.s;let delta=newNear.s-old;if(delta>tr.length*.5)delta-=tr.length;if(delta<-tr.length*.5)delta+=tr.length;
 const plausible=Math.abs(delta)<Math.max(2,Math.abs(p.speed)*dt*2.5+1);
 if(plausible&&newNear.dist<tr.width*.6&&delta*(p.vx*newNear.tx+p.vy*newNear.ty)>=-1){p.raceDistance=(p.raceDistance||0)+delta;}
 p.trackS=newNear.s;p.progress=(p.raceDistance||0)/tr.length;
 return p;
}
export function botInput(s,p){
 const tr=getTrack(s.track),level=LEVELS[s.difficulty]||LEVELS.normal;
 const speed=Math.max(0,p.speed),current=nearestTrack(tr,p.x,p.y);
 // Each rival has a separate preferred racing line and small pace variation.
 const index=Number(p.id.match(/(\d+)$/)?.[1]||0),personality=((index*7+3)%9)/9;
 let lane=(index%2?-1:1)*(.45+personality*.75);
 // Passing a slower rival: steer onto a different line instead of braking forever.
 for(const rival of Object.values(s.players)){
  if(rival.id===p.id||rival.finished)continue;
  const d=(rival.raceDistance||0)-(p.raceDistance||0),lateral=Math.hypot(rival.x-p.x,rival.y-p.y);
  if(d>0&&d<14&&lateral<8&&(rival.speed||0)<speed+2){lane=(index%2?-1:1)*(2.2+personality*.5);break;}
 }
 const ahead=pointOnTrack(tr,(current.s+clamp(speed*.44+7,10,23))/tr.length,lane);
 const further=pointOnTrack(tr,(current.s+clamp(speed*1.14+14,23,47))/tr.length,lane*.6);
 const targetA=Math.atan2(ahead.y-p.y,ahead.x-p.x),error=angle(targetA-p.a);
 const bend=Math.abs(angle(further.a-ahead.a));
 const steer=clamp(error*(2.05+.30*level.skill),-1,1);
 const wanted=clamp((32.5-bend*22)*(level.speed*level.skill)*(0.94+personality*.11),11,35);
 const gas=speed>wanted?-.6:1;
 return {gas,steer,boost:p.boost>28&&speed>12&&bend<.20&&current.dist<tr.width*.41&&Math.sin(s.elapsed*.14+index)>.0};
}
function raceStep(s,inputs,dt){const tr=getTrack(s.track),players=Object.values(s.players);for(const p of players){if(p.finished)continue;const v=p.bot?botInput(s,p):inputs[p.id]||{};driveCar(p,v,dt,tr);if(p.progress>=3){p.finished=s.elapsed;s.firstFinish||=s.elapsed;}}
 for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){const a=players[i],b=players[j];if(a.finished||b.finished)continue;const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<2&&d>.001){const push=(2-d)*.48/d;a.x-=dx*push;a.y-=dy*push;b.x+=dx*push;b.y+=dy*push;a.speed*=.975;b.speed*=.975;}}
 if(players.every(p=>p.finished)||(s.firstFinish&&s.elapsed-s.firstFinish>22)||s.elapsed>=260)s.status='finished';
}
function fpsStep(s,inputs,dt){const ps=Object.values(s.players);for(const [index,p]of ps.entries()){const v=cleanInput(inputs[p.id]);p.shield=Math.max(0,p.shield-dt);p.cooldown=Math.max(0,(p.cooldown||0)-dt);if(p.hp<=0){p.respawn-=dt;if(p.respawn<=0)spawn(p,index,s.players);continue;}p.a=angle(p.a+v.turn*2.5*dt+v.look);if(inputs[p.id])inputs[p.id].look=0;const norm=Math.max(1,Math.hypot(v.forward,v.strafe)),speed=3.7*dt/norm;const dx=(Math.cos(p.a)*v.forward-Math.sin(p.a)*v.strafe)*speed,dy=(Math.sin(p.a)*v.forward+Math.cos(p.a)*v.strafe)*speed;if(!blocked(p.x+dx,p.y))p.x+=dx;if(!blocked(p.x,p.y+dy))p.y+=dy;
 if(p.reload>0){p.reload=Math.max(0,p.reload-dt);if(!p.reload)p.ammo=24;continue;}if(v.reload&&p.ammo<24){p.reload=1.3;continue;}if(!v.fire||p.cooldown>0)continue;if(p.ammo<=0){p.reload=1.3;continue;}p.ammo--;p.cooldown=.19;p.shot=s.elapsed;p.shield=0;
 const max=rayDistance(p.x,p.y,p.a,22);let hit=null,best=max;for(const target of ps){if(target.id===p.id||target.hp<=0||target.shield>0)continue;const dx=target.x-p.x,dy=target.y-p.y,along=dx*Math.cos(p.a)+dy*Math.sin(p.a),side=Math.abs(-dx*Math.sin(p.a)+dy*Math.cos(p.a));if(along>0&&along<best&&side<.3){hit=target;best=along;}}if(hit){hit.hp=Math.max(0,hit.hp-25);if(hit.hp===0){p.score++;hit.deaths++;hit.respawn=3;s.events.unshift({by:p.name,target:hit.name,t:s.elapsed});s.events=s.events.slice(0,4);if(p.score>=10)s.status='finished';}}}
 if(s.elapsed>=240)s.status='finished';}
export function stepWorld(s,inputs,dt){if(!s||s.status==='finished')return s;dt=clamp(dt,0,.06);if(s.status==='countdown'){s.countdown-=dt;if(s.countdown<=0){s.countdown=0;s.status='playing';}return s;}s.elapsed+=dt;if(s.kind==='race')raceStep(s,inputs,dt);else fpsStep(s,inputs,dt);return s;}
export function standings(s){return Object.values(s?.players||{}).sort(s?.kind==='race'?(a,b)=>a.finished&&b.finished?a.finished-b.finished:a.finished?-1:b.finished?1:b.progress-a.progress:(a,b)=>b.score-a.score||a.deaths-b.deaths);}
