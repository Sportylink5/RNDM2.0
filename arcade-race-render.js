import {COLORS,getTrack,pointOnTrack,nearestTrack,clamp} from './arcade-engine.js?v=70.0.0';
const WORLD_W=128,WORLD_H=82;
const THEMES={
 city:{ground:'#0b1c28',low:'#143445',spot:'#294355',road:'#26333e',edge:'#51e7d6',curb:'#a7a1fa',accent:'#54ffe4'},
 coast:{ground:'#174344',low:'#246861',spot:'#5a8f72',road:'#354a56',edge:'#fff2cc',curb:'#eeaf7c',accent:'#8af6ff'},
 desert:{ground:'#66412b',low:'#b57849',spot:'#cf9764',road:'#444147',edge:'#ffd1a1',curb:'#fd7d64',accent:'#ffe38c'},
 snow:{ground:'#526b81',low:'#95b6cd',spot:'#dce8f0',road:'#3b4b59',edge:'#e8fcff',curb:'#7fe7ff',accent:'#dcffff'}
};
function randomGenerator(seed){let s=seed|0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function makeBackdrop(tr){const cvs=document.createElement('canvas'),res=10;cvs.width=WORLD_W*res;cvs.height=WORLD_H*res;
 const c=cvs.getContext('2d',{alpha:false});c.scale(res,res);const T=THEMES[tr.theme],r=randomGenerator(2026+tr.id.length*971);let g=c.createLinearGradient(0,0,WORLD_W,WORLD_H);g.addColorStop(0,T.ground);g.addColorStop(.55,T.low);g.addColorStop(1,T.ground);c.fillStyle=g;c.fillRect(0,0,WORLD_W,WORLD_H);
 // Subtle terrain texture, stable between frames.
 for(let i=0;i<3000;i++){const x=r()*WORLD_W,y=r()*WORLD_H,z=.05+r()*.28;c.fillStyle=r()>.5?'#ffffff0a':'#0000000d';c.fillRect(x,y,z,z);}
 if(tr.theme==='city'){
  // City blocks and illuminated streets outside the course.
  c.strokeStyle='#7097b426';c.lineWidth=.5;for(let x=0;x<WORLD_W;x+=8){c.beginPath();c.moveTo(x,0);c.lineTo(x,WORLD_H);c.stroke();}for(let y=0;y<WORLD_H;y+=8){c.beginPath();c.moveTo(0,y);c.lineTo(WORLD_W,y);c.stroke();}
 }
 if(tr.theme==='coast'){c.fillStyle='#105166';c.beginPath();c.moveTo(119,0);c.lineTo(128,0);c.lineTo(128,82);c.lineTo(122,82);c.bezierCurveTo(109,60,132,31,119,0);c.fill();c.strokeStyle='#73e5d04b';c.lineWidth=.4;for(let i=0;i<45;i++){const x=117+r()*14,y=r()*82;c.beginPath();c.moveTo(x,y);c.lineTo(x+1.4,y+.2);c.stroke();}}
 // Environment objects are drawn only away from the collision course.
 for(let i=0;i<510;i++){
  const x=3+r()*(WORLD_W-6),y=3+r()*(WORLD_H-6),n=nearestTrack(tr,x,y);if(n.dist<tr.width*.5+3)continue;
  const sz=.6+r()*2.1;c.save();c.translate(x,y);
  if(tr.theme==='city'){
   c.fillStyle='#030e1670';c.fillRect(-sz*.5+.3,-sz*.5+.4,sz*1.2,sz*1.2);c.fillStyle=r()>.5?'#304756':'#253544';c.fillRect(-sz*.6,-sz*.6,sz*1.1,sz*1.1);c.strokeStyle='#7bcdf82e';c.lineWidth=.08;c.strokeRect(-sz*.6,-sz*.6,sz*1.1,sz*1.1);c.fillStyle=r()>.35?'#f6cb7044':'#cde8ff40';for(let a=0;a<3;a++)for(let b=0;b<2;b++)if(r()>.24)c.fillRect(-sz*.45+a*sz*.31,-sz*.38+b*sz*.39,sz*.12,sz*.15);
  } else if(tr.theme==='coast'){
   c.fillStyle='#041e2880';c.beginPath();c.ellipse(.27,.3,sz*.65,sz*.5,0,0,7);c.fill();c.fillStyle=r()>.4?'#377b57':'#77a86c';c.beginPath();c.arc(0,0,sz*.5,0,7);c.fill();c.fillStyle='#b6d49536';c.beginPath();c.arc(-.18,-.16,sz*.25,0,7);c.fill();
  } else if(tr.theme==='desert'){
   c.fillStyle='#3a201c55';c.beginPath();c.ellipse(.35,.35,sz*.5,sz*.27,0,0,7);c.fill();c.fillStyle=r()>.5?'#b99b6d':'#7d5844';c.beginPath();c.moveTo(-sz*.6,sz*.25);c.lineTo(-sz*.3,-sz*.45);c.lineTo(sz*.38,-sz*.3);c.lineTo(sz*.55,sz*.22);c.closePath();c.fill();
  } else {
   c.fillStyle='#1d44525e';c.beginPath();c.ellipse(.3,.4,sz*.5,sz*.4,0,0,7);c.fill();c.fillStyle='#305760';c.fillRect(-.09,0,.18,sz*.48);c.fillStyle=r()>.4?'#d5f3f6':'#a6d5df';c.beginPath();c.moveTo(0,-sz*.9);c.lineTo(-sz*.43,sz*.1);c.lineTo(sz*.43,sz*.1);c.closePath();c.fill();
  } c.restore();
 }
 const pts=tr.samples;function stroke(width,color,dash=[]){c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.closePath();c.lineCap='round';c.lineJoin='round';c.lineWidth=width;c.strokeStyle=color;c.setLineDash(dash);c.stroke();c.setLineDash([]);}
 c.save();c.shadowColor='#000000ba';c.shadowBlur=13;c.shadowOffsetY=.6;stroke(tr.width+3,'#0d111a');c.restore();
 stroke(tr.width+1.7,T.curb);stroke(tr.width+1.1,'#101c27');stroke(tr.width,T.road);
 // Track edge glow + racing line and irregular asphalt lighting.
 stroke(tr.width-.22,'#ffffff06');stroke(.11,'#f9f6ed85',[1.6,3.2]);
 for(const side of [-1,1]){c.beginPath();for(let i=0;i<pts.length;i++){const p=pointOnTrack(tr,pts[i].s/tr.length,side*(tr.width*.5-.4));if(i===0)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);}c.closePath();c.strokeStyle=T.edge;c.lineWidth=.13;c.shadowColor=T.accent;c.shadowBlur=tr.theme==='city'?3:1;c.stroke();}c.shadowBlur=0;
 for(let i=0;i<pts.length;i+=3){if(i%6===0){const p=pointOnTrack(tr,pts[i].s/tr.length,tr.width*.5+.2),q=pointOnTrack(tr,pts[i].s/tr.length,-tr.width*.5-.2);c.strokeStyle=i%12===0?'#f6f6ff':T.curb;c.lineWidth=.55;c.beginPath();c.moveTo(p.x,p.y);c.lineTo(p.x+(q.x-p.x)*.07,p.y+(q.y-p.y)*.07);c.moveTo(q.x,q.y);c.lineTo(q.x+(p.x-q.x)*.07,q.y+(p.y-q.y)*.07);c.stroke();}}
 // Starting line is across the road, perpendicular to travel.
 const a=pointOnTrack(tr,0,-tr.width/2),b=pointOnTrack(tr,0,tr.width/2),dx=(b.x-a.x)/12,dy=(b.y-a.y)/12;
 for(let row=0;row<2;row++)for(let i=0;i<12;i++){const x=a.x+dx*i+Math.cos(a.a)*row*.35,y=a.y+dy*i+Math.sin(a.a)*row*.35;c.fillStyle=(row+i)%2?'#f5f8fc':'#172634';c.beginPath();c.arc(x,y,.32,0,7);c.fill();}
 c.font='bold 3px system-ui';c.textAlign='center';c.fillStyle=T.accent+'bb';c.fillText('R N D M',62,40);c.font='bold 1.2px system-ui';c.fillText(tr.name.toUpperCase(),62,43);
 return cvs;
}
function drawCar(c,p,t,isMe){c.save();c.translate(p.x,p.y);c.rotate(p.a);const speeding=(p.speed||0)>30;
 c.fillStyle='#000a';c.beginPath();c.ellipse(.27,.32,1.7,.87,0,0,7);c.fill();
 if(speeding){const flame=1.0+Math.sin(t*.036)*.4;c.fillStyle='#5cefffbc';c.beginPath();c.moveTo(-1.45,-.23);c.lineTo(-1.75-flame,-.08);c.lineTo(-1.45,.05);c.moveTo(-1.45,.18);c.lineTo(-1.8-flame,.36);c.lineTo(-1.45,.48);c.fill();}
 for(const side of [-1,1])for(const x of [-.88,.85]){c.save();c.translate(x,side*.73);if(x>0)c.rotate((p.steer||0)*.24);c.fillStyle='#070d17';c.fillRect(-.43,-.22,.77,.44);c.fillStyle='#6d7783';c.fillRect(-.29,-.23,.4,.05);c.restore();}
 c.fillStyle=p.color||COLORS[0];c.beginPath();c.roundRect(-1.36,-.57,2.72,1.14,.32);c.fill();
 c.fillStyle='#050e1a';c.beginPath();c.roundRect(-.42,-.5,1.16,1.0,.20);c.fill();c.fillStyle='#7addfb7d';c.fillRect(.48,-.38,.18,.76);c.fillStyle='#ffffff3f';c.fillRect(-.98,-.42,.34,.08);c.fillRect(-.98,.34,.34,.08);
 c.fillStyle='#f9ffe7';c.fillRect(1.16,-.46,.22,.27);c.fillRect(1.16,.19,.22,.27);c.fillStyle='#fc3c67';c.fillRect(-1.37,-.47,.14,.27);c.fillRect(-1.37,.20,.14,.27);
 c.fillStyle='#15202a';c.fillRect(-1.28,-.78,.25,1.56);c.fillRect(1.05,-.66,.16,1.32);
 if(isMe){c.strokeStyle='#fff';c.lineWidth=.09;c.shadowColor='#8effdc';c.shadowBlur=.5;c.beginPath();c.arc(0,0,2.12,0,7);c.stroke();}c.restore();
}
export class RaceRenderer{
 constructor(){this.cache=new Map();this.visual=new Map();this.lastTime=0;this.camera=null;}
 reset(){this.visual.clear();this.lastTime=0;this.camera=null;}
 draw(c,w,H,s,uid,t,room,input={}){
 const tr=getTrack(s?.track||'neon'),theme=THEMES[tr.theme];let bg=this.cache.get(tr.id);if(!bg){bg=makeBackdrop(tr);this.cache.set(tr.id,bg);}
 const raw=Object.values(s?.players||{}),age=room&&!room.isHost?clamp((t-(room.receivedAt||t))/1000,0,.14):0,dt=clamp((t-(this.lastTime||t))/1000,.001,.055);this.lastTime=t;
 const ps=raw.map(p=>{if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return null;
  let x=p.x+(p.vx||Math.cos(p.a)*p.speed||0)*age,y=p.y+(p.vy||Math.sin(p.a)*p.speed||0)*age,a=p.a;
  if(p.id===uid&&room&&!room.isHost){const yaw=(input.steer||0)*1.55*clamp(Math.abs(p.speed||0)/5,0,1)*age;a+=yaw;x+=Math.cos(a)*(input.gas>0?1.1:0)*age;y+=Math.sin(a)*(input.gas>0?1.1:0)*age;}
  const last=this.visual.get(p.id);if(last){const snapDist=Math.hypot(last.x-x,last.y-y);const alpha=snapDist>16?1:1-Math.exp(-dt/(p.id===uid?.050:.095));x+=((last.x-x)*(1-alpha));y+=((last.y-y)*(1-alpha));a+=Math.atan2(Math.sin(last.a-a),Math.cos(last.a-a))*(1-alpha);}
  const shown={...p,x,y,a};this.visual.set(p.id,shown);return shown;
 }).filter(Boolean);
 const me=ps.find(p=>p.id===uid)||ps[0]||{x:64,y:41,a:0};const mobile=w<620,zoom=Math.min(w/(mobile?38:65),H/(mobile?48:42)),halfW=w/(2*zoom),halfH=H/(2*zoom);const look=clamp((me.speed||0)*.22,0,5),wantX=clamp(me.x+Math.cos(me.a)*look,halfW,WORLD_W-halfW),wantY=clamp(me.y+Math.sin(me.a)*look,halfH,WORLD_H-halfH);
 if(!this.camera)this.camera={x:wantX,y:wantY};const follow=1-Math.exp(-dt/0.23);this.camera.x+=(wantX-this.camera.x)*follow;this.camera.y+=(wantY-this.camera.y)*follow;
 c.fillStyle=theme.ground;c.fillRect(0,0,w,H);c.save();c.translate(w/2,H/2);c.scale(zoom,zoom);c.translate(-this.camera.x,-this.camera.y);c.drawImage(bg,0,0,WORLD_W,WORLD_H);
 for(const p of ps){if(p.drifting){c.strokeStyle='#0c111a75';c.lineWidth=.16;c.beginPath();c.moveTo(p.x-Math.cos(p.a)*.5,p.y-Math.sin(p.a)*.5);c.lineTo(p.x-(p.vx||0)*.17,p.y-(p.vy||0)*.17);c.stroke();}}
 for(const p of ps)drawCar(c,p,t,p.id===uid);
 for(const p of ps){c.save();c.textAlign='center';c.font='bold 1.05px system-ui';c.lineWidth=.33;c.strokeStyle='#07131be6';c.strokeText(String(p.name).slice(0,13),p.x,p.y-2.4);c.fillStyle=p.id===uid?'#ffffff':'#f2ebff';c.fillText(String(p.name).slice(0,13),p.x,p.y-2.4);c.restore();}
 c.restore();
 // Mini-map stays readable even at portrait phone resolutions.
 const mw=mobile?104:150,mh=mobile?66:96,mx=w-mw-12,my=mobile?H-mh-84:H-mh-14;c.fillStyle='#05121be1';c.beginPath();c.roundRect(mx-6,my-6,mw+12,mh+12,8);c.fill();c.strokeStyle='#dcf3ff40';c.lineWidth=1;c.stroke();c.save();c.translate(mx,my);const sc=Math.min(mw/WORLD_W,mh/WORLD_H);c.scale(sc,sc);c.beginPath();const pts=tr.samples;c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.closePath();c.strokeStyle='#8299af';c.lineWidth=2;c.stroke();for(const p of ps){c.fillStyle=p.id===uid?'#fff':p.color;c.beginPath();c.arc(p.x,p.y,p.id===uid?2.9:2,0,7);c.fill();}c.restore();
 // Subtle speed readout in the playfield, independent of HTML HUD.
 if(s?.status==='playing'){const speed=Math.round((me.speed||0)*8);c.save();c.font=`900 ${mobile?25:35}px system-ui`;c.textAlign='left';c.fillStyle='#ffffffdd';c.fillText(String(speed),15,H-33);c.font='bold 10px system-ui';c.fillStyle='#cbd9e6';c.fillText('КМ/Ч',17,H-19);c.restore();}
 }
}
