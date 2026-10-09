/* RNDM World v55 — original browser driving scene.
   Road and building footprints: OpenStreetMap contributors, via Overpass API.
   Procedural facades are illustrative and NOT verified representations of actual buildings. */
const $=id=>document.getElementById(id);
const canvas=$('scene'),ctx=canvas.getContext('2d',{alpha:false});
const params=new URL(location.href).searchParams;
const groupMode=params.get('mode')==='group';
const roomId=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(params.get('cid')||'')?params.get('cid'):'';
$('modeLabel').textContent=groupMode?'GROUP':'SOLO';
if(params.get('chat')&&roomId){const u=new URL('index.html',location.href);u.searchParams.set('chat',roomId);$('return').href=u.href;}
else if(roomId){const u=new URL('index.html',location.href);u.searchParams.set('chat',roomId);$('return').href=u.href;}
const defaultLoc={lat:55.5705,lon:37.5779};
let center={...defaultLoc},playing=false,loading=false,worldSource='DEMO',worldReady=false;
let deviceW=0,deviceH=0,dpr=1,frameTick=0,elapsedTime=0,roadNames=[];
let surfaces=[],buildings=[],trees=[],lamps=[],civCars=[],roads=[],parks=[],worldFaces=[];
const car={x:0,z:0,yaw:0,speed:0,boost:0,onFoot:false,step:0};
const keys={gas:false,brake:false,left:false,right:false,boost:false};
const players=new Map();let parked={x:0,z:0,yaw:0};let supa=null,myId='',netTimer=0,networkWorking=false;
const colors={};
function status(text){$('status').textContent=text||'';}
function rnd(seed){let state=Math.abs(seed)|0;return()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};}
function v(x,y,z){return {x,y,z};}
function colorMix(hex,f=1){if(!/^#[0-9a-f]{6}$/i.test(hex))return hex;return '#'+[1,3,5].map(i=>Math.min(255,Math.max(0,Math.round(parseInt(hex.slice(i,i+2),16)*f))).toString(16).padStart(2,'0')).join('');}
function face(pts,color,layer=0,stroke=''){if(pts.length>2)worldFaces.push({pts,color,layer,stroke,cx:pts.reduce((n,p)=>n+p.x,0)/pts.length,cz:pts.reduce((n,p)=>n+p.z,0)/pts.length});}
function rectXZ(a,b,width,y,color,layer=0){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.1)return;const nx=-dz/len*width/2,nz=dx/len*width/2;face([v(a.x+nx,y,a.z+nz),v(b.x+nx,y,b.z+nz),v(b.x-nx,y,b.z-nz),v(a.x-nx,y,a.z-nz)],color,layer);}
function sampleRoad(a,b,width,name='Улица',type='residential'){
 const len=Math.hypot(b.x-a.x,b.z-a.z);if(len<.4)return;
 if(len>16){const n=Math.ceil(len/15);for(let i=0;i<n;i++){const t=i/n,t2=(i+1)/n;sampleRoad({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},{x:a.x+(b.x-a.x)*t2,z:a.z+(b.z-a.z)*t2},width,name,type);}return;}
 roads.push({a,b,width,name,type});
 rectXZ(a,b,width+3.7,.025,'#a6b5b1',0);rectXZ(a,b,width+2.6,.052,'#c9c9bd',1);rectXZ(a,b,width,.09,type==='footway'?'#c4b39c':'#424b51',2);
 if(width>=6){const dx=(b.x-a.x)/len,dz=(b.z-a.z)/len;for(let t=3;t<len-1;t+=12){const A={x:a.x+dx*t,z:a.z+dz*t},B={x:a.x+dx*Math.min(t+5,len),z:a.z+dz*Math.min(t+5,len)};rectXZ(A,B,.14,.105,'#f0e2ab',3);}}
 if(width>=8){const ox=(b.z-a.z)/len*width*.43,oz=-(b.x-a.x)/len*width*.43;for(const sign of [-1,1]){rectXZ({x:a.x+ox*sign,z:a.z+oz*sign},{x:b.x+ox*sign,z:b.z+oz*sign},.13,.108,'#ece6d3',3);}}
}
function roadWidth(type){return ({motorway:19,trunk:16,primary:13,secondary:11,tertiary:9,residential:7.4,unclassified:7,service:4.8,living_street:5.7,footway:2,pedestrian:3,cycleway:2,steps:1.5,path:2,track:3})[type]||6;}
function polygonArea(pts){let s=0;for(let i=0;i<pts.length;i++){const b=pts[(i+1)%pts.length];s+=pts[i].x*b.z-b.x*pts[i].z;}return s/2;}
function distToRoad(x,z){let best=1e6;for(const r of roads){const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,len2=dx*dx+dz*dz;const t=Math.max(0,Math.min(1,((x-r.a.x)*dx+(z-r.a.z)*dz)/(len2||1)));best=Math.min(best,Math.hypot(r.a.x+t*dx-x,r.a.z+t*dz-z)-r.width/2);}return best;}
function pointInPoly(x,z,pts){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if(((a.z>z)!=(b.z>z))&&(x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x))inside=!inside;}return inside;}
function building(poly,level,style,seed){
 if(poly.length<3)return;poly=poly.slice(0,48);const area=Math.abs(polygonArea(poly));if(area<9||area>18000)return;
 const rng=rnd(seed), floors=Math.min(10,Math.max(1,Math.round(level||2+Math.floor(rng()*4)))),h=Math.min(35,floors*3.15+0.8);
 const palette=['#cebfa5','#b4afa7','#c99f82','#d1c2aa','#b7c2bc','#9e9899','#e2d1b7','#b3a08f'];
 const base=style?.wall||palette[Math.floor(rng()*palette.length)],roof=style?.roof||(['#6c5d57','#45494e','#935c4d','#4b565b','#73716d'][Math.floor(rng()*5)]);
 const outline='#766d64';const centerX=poly.reduce((s,p)=>s+p.x,0)/poly.length,centerZ=poly.reduce((s,p)=>s+p.z,0)/poly.length;
 buildings.push({poly,h,x:centerX,z:centerZ});
 face(poly.map(p=>v(p.x,h+.14,p.z)),roof,5,outline);
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<1)continue;
  const nx=dz/len,nz=-dx/len;
  let wallColor=colorMix(base,[1,.94,.84,.9][i%4]);
  face([v(a.x,0,a.z),v(b.x,0,b.z),v(b.x,h,b.z),v(a.x,h,a.z)],wallColor,10,outline);
  if(len<3)continue;
  const columns=Math.min(12,Math.max(1,Math.floor((len-1)/2.85)));
  const margin=(len-columns*1.05)/(columns+1);
  const floorTop=Math.min(floors,10);
  for(let row=0;row<floorTop;row++){
   const y=row*3.15+.96;
   for(let col=0;col<columns;col++){
    if(rng()<.055)continue;
    const t=margin+(margin+1.05)*col;
    const px=a.x+dx*t/len,pz=a.z+dz*t/len;
    const xx=px+nx*.028,zz=pz+nz*.028,ww=1.12,hh=1.48;
    const off=v(dx/len*ww,0,dz/len*ww);
    face([v(xx,y,zz),v(xx+off.x,y,zz+off.z),v(xx+off.x,y+hh,zz+off.z),v(xx,y+hh,zz)],'#e9e4d7',12);
    const trim=.10;
    const w1=v(dx/len*(ww-2*trim),0,dz/len*(ww-2*trim));
    const wx=xx+dx/len*trim+nx*.026,wz=zz+dz/len*trim+nz*.026;
    face([v(wx,y+trim,wz),v(wx+w1.x,y+trim,wz+w1.z),v(wx+w1.x,y+hh-trim,wz+w1.z),v(wx,y+hh-trim,wz)],(row+col+i)%7===0?'#576d7a':'#364a5a',13);
    face([v(wx+w1.x*.47,y+trim,wz+w1.z*.47),v(wx+w1.x*.54,y+trim,wz+w1.z*.54),v(wx+w1.x*.54,y+hh-trim,wz+w1.z*.54),v(wx+w1.x*.47,y+hh-trim,wz+w1.z*.47)],'#b9c3c7',14);
    face([v(wx+w1.x*.08,y+hh*.61,wz+w1.z*.08),v(wx+w1.x*.15,y+hh*.61,wz+w1.z*.15),v(wx+w1.x*.62,y+hh*.90,wz+w1.z*.62),v(wx+w1.x*.55,y+hh*.90,wz+w1.z*.55)],'#667e88',14);
    if(style?.balcony&&row>0&&(col+i)%3===0){const lx=px-dx/len*.21,lz=pz-dz/len*.21;face([v(lx,y-.18,lz),v(lx+dx/len*1.3,y-.18,lz+dz/len*1.3),v(lx+dx/len*1.3+nx*1,y-.18,lz+dz/len*1.3+nz*1),v(lx+nx*1,y-.18,lz+nz*1)],'#b1aca6',15);}
   }
  }
  if(i===0&&len>4){const px=(a.x+b.x)/2+nx*.035,pz=(a.z+b.z)/2+nz*.035;face([v(px-dx/len*.8,0,pz-dz/len*.8),v(px+dx/len*.8,0,pz+dz/len*.8),v(px+dx/len*.8,2.4,pz+dz/len*.8),v(px-dx/len*.8,2.4,pz-dz/len*.8)],'#52483f',19);face([v(px-dx/len*.63,.1,pz-dz/len*.63),v(px-dx/len*.61,.1,pz-dz/len*.61),v(px-dx/len*.61,2.2,pz-dz/len*.61),v(px-dx/len*.63,2.2,pz-dz/len*.63)],'#cfb99b',20);}
 }
 // Roof vents and small details.
 if(floors>=3){const x=centerX,z=centerZ;face([v(x-1,h+.14,z-.65),v(x+1,h+.14,z-.65),v(x+1,h+1.35,z-.65),v(x-1,h+1.35,z-.65)],'#aaa59c',24);}
}
function tree(x,z,scale=1,conifer=false,seed=1){if(Math.hypot(x,z)>520)return;const rng=rnd(seed);const h=(3.9+rng()*2.7)*scale,r=.95*scale;trees.push({x,z,scale});
 const dark=conifer?'#2c594b':'#497e50',mid=conifer?'#34644e':'#5c9460',lite=conifer?'#3d7957':'#75a76a';
 // Cylindrical trunk with branches.
 const a=r*.12;face([v(x-a,0,z-a),v(x+a,0,z-a),v(x+a,h*.61,z-a),v(x-a,h*.61,z-a)],'#6b4b33',8);face([v(x+a,0,z-a),v(x+a,0,z+a),v(x+a,h*.61,z+a),v(x+a,h*.61,z-a)],'#4e3c2c',8);
 const base=h*.42,crownH=h*.82,R=(conifer?1.5:2.05)*scale;
 if(conifer){for(let level=0;level<3;level++){const bottom=base+level*h*.18,top=bottom+h*.38, rr=R*(1-level*.24);for(let k=0;k<6;k++){const a0=k*Math.PI/3,a1=(k+1)*Math.PI/3;face([v(x+Math.cos(a0)*rr,bottom,z+Math.sin(a0)*rr),v(x+Math.cos(a1)*rr,bottom,z+Math.sin(a1)*rr),v(x,top,z)],k%2?dark:mid,11);}}}
 else {const r2=R*.82;for(let k=0;k<9;k++){const a0=k*2*Math.PI/9,a1=(k+1)*2*Math.PI/9;face([v(x+Math.cos(a0)*r2,base,z+Math.sin(a0)*r2),v(x+Math.cos(a1)*r2,base,z+Math.sin(a1)*r2),v(x,h*1.18,z)],k%3===0?lite:k%3===1?dark:mid,12);face([v(x+Math.cos(a0)*r2,h*.83,z+Math.sin(a0)*r2),v(x+Math.cos(a1)*r2,h*.83,z+Math.sin(a1)*r2),v(x,h*1.21,z)],k%2?mid:lite,13);} }
}
function lamppost(x,z,seed=1){const h=6.3,r=.065;lamps.push({x,z});face([v(x-r,0,z),v(x+r,0,z),v(x+r,h,z),v(x-r,h,z)],'#424d58',8);face([v(x,h,z),v(x+1.5,h,z),v(x+1.5,h+.18,z),v(x,h+.18,z)],'#4a555a',9);face([v(x+1.18,h-.16,z),v(x+1.6,h-.16,z),v(x+1.6,h-.02,z),v(x+1.18,h-.02,z)],'#fff8c5',10);}
function busStop(x,z){face([v(x-2,0,z),v(x+2,0,z),v(x+2,0,z+1),v(x-2,0,z+1)],'#d1c3af',3);for(const xx of [x-1.7,x+1.7])face([v(xx,0,z),v(xx+.13,0,z),v(xx+.13,3,z),v(xx,3,z)],'#56656b',8);face([v(x-2,3,z-.3),v(x+2,3,z-.3),v(x+2,3,z+1.25),v(x-2,3,z+1.25)],'#455a65',11);face([v(x-1.6,.8,z+1),v(x+1.6,.8,z+1),v(x+1.6,2.65,z+1),v(x-1.6,2.65,z+1)],'#7cabb1',9);face([v(x-.85,.47,z+.4),v(x+.85,.47,z+.4),v(x+.85,.6,z+.4),v(x-.85,.6,z+.4)],'#91735b',13);}
function resetWorld(){surfaces=[];buildings=[];trees=[];lamps=[];civCars=[];roads=[];parks=[];worldFaces=[];roadNames=[];}
function createFallback(seed=21){resetWorld();const rng=rnd(seed);for(const p of [-120,0,120]){sampleRoad({x:-420,z:p},{x:420,z:p},p===0?12:8,p===0?'Центральный проспект':'Улица Солнечная');sampleRoad({x:p,z:-420},{x:p,z:420},p===0?12:8,p===0?'Главная улица':'Парковая улица');}
 for(let gx=-3;gx<=3;gx++)for(let gz=-3;gz<=3;gz++){
  const x=gx*47+22,z=gz*47+23;
  if(Math.abs(x)<22||Math.abs(z)<22||Math.abs(x-120)<22||Math.abs(z-120)<22||Math.abs(x+120)<22||Math.abs(z+120)<22)continue;
  if((gx===-2&&gz===2)||(gx===1&&gz===-2)){for(let t=0;t<9;t++)tree(x-12+rng()*26,z-9+rng()*22,1+rng()*.18,false,seed+t*11);continue;}
  if(rng()>.12){const w=12+rng()*9,d=10+rng()*14,levels=1+Math.floor(rng()*6);building([{x:x-w/2,z:z-d/2},{x:x+w/2,z:z-d/2},{x:x+w/2,z:z+d/2},{x:x-w/2,z:z+d/2}],levels,{balcony:levels>=4},gx*233+gz*17+seed);}
  for(let j=0;j<2;j++)if(rng()>.24)tree(x+18+rng()*9,z+(rng()-.5)*25,.83+rng()*.25,rng()>.75,seed+gx*77+gz*18+j);
 }
 for(let z=-285;z<=310;z+=35){for(const side of [-1,1]){const px=side*16,pz=z+side*7;if(distToRoad(px,pz)>1&&!buildings.some(b=>pointInPoly(px,pz,b.poly)))tree(px,pz,.65+rng()*.35,rng()>.78,Math.round(px*23+pz*7+seed));}}
 for(const z of [-320,-190,-68,53,175,292]){lamppost(10,z,seed);lamppost(-10,z+25,seed);}
 for(const x of [-319,-185,-68,53,177,300]){lamppost(x,9,seed);}busStop(34,4);
 civCars=[{x:-5,z:50,yaw:Math.PI,speed:.0,color:'#4c6579'},{x:5,z:-65,yaw:0,speed:.0,color:'#b9c3c9'},{x:5,z:95,yaw:0,speed:0,color:'#a16861'},{x:-5,z:-195,yaw:Math.PI,speed:0,color:'#464e60'}];
 worldSource='DEMO';worldReady=true;roadNames=['Центральный проспект','Парковая улица'];
}
function geoPoint(lat,lon){const latRad=center.lat*Math.PI/180;return {x:(lon-center.lon)*111320*Math.cos(latRad),z:(lat-center.lat)*111320};}
function fromOSM(data){if(!data||!Array.isArray(data.elements))throw new Error('Нет данных карты');const nodes=new Map(),ways=[];for(const e of data.elements){if(e.type==='node')nodes.set(e.id,e);else if(e.type==='way')ways.push(e);}resetWorld();const rng=rnd(Math.round(center.lat*10000+center.lon*10000));
 for(const e of ways){const tags=e.tags||{},pts=(e.nodes||[]).map(id=>nodes.get(id)).filter(Boolean).map(n=>geoPoint(n.lat,n.lon)).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));if(pts.length<2)continue;
  if(tags.highway){const width=roadWidth(tags.highway);if(tags.highway==='construction')continue;for(let i=0;i<pts.length-1;i++){if(Math.hypot((pts[i].x+pts[i+1].x)/2,(pts[i].z+pts[i+1].z)/2)<620)sampleRoad(pts[i],pts[i+1],width,tags.name||tags['name:ru']||'Улица',tags.highway);}if(tags.name)roadNames.push(tags.name);}
  else if(tags.building){const poly=pts.at(0).x===pts.at(-1).x&&pts.at(0).z===pts.at(-1).z?pts.slice(0,-1):pts;
    const avgx=poly.reduce((s,p)=>s+p.x,0)/poly.length,avgz=poly.reduce((s,p)=>s+p.z,0)/poly.length;
    if(Math.hypot(avgx,avgz)>400||poly.length>50||buildings.length>=(deviceW<760?70:110))continue;
    const floors=Math.max(1,Math.min(12,Number(tags['building:levels'])||Number(tags.height)/3.15||2+Math.floor(rng()*5)));
    const colorNames={'brick':'#b98a74','concrete':'#b8bbb8','glass':'#83a7b0','wood':'#c19a73','plaster':'#cbc4ab'};
    const wall=/^#[0-9a-f]{6}$/i.test(tags['building:colour'])?tags['building:colour'] : colorNames[tags['building:material']]||undefined;
    building(poly,floors,{wall,balcony:Number(tags['building:levels'])>=5},e.id%100000);
  }
  else if(tags.leisure==='park'||tags.landuse==='grass'){if(pts.length>2){face(pts.map(p=>v(p.x,.018,p.z)),'#719874',0);parks.push(pts);}}
 }
 for(const e of data.elements){if(e.type==='node'&&e.tags?.natural==='tree'){const p=geoPoint(e.lat,e.lon);if(trees.length<125&&Math.hypot(p.x,p.z)<365&&distToRoad(p.x,p.z)>1.2)tree(p.x,p.z,.8+rng()*.45,rng()<.3,e.id%100000);}}
 // Approximate street-tree rows only where OSM doesn't map individual trees.
 if(trees.length<22){for(const r of roads.slice(0,90)){const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,len=Math.hypot(dx,dz);if(len<18)continue;for(let t=11;t<len-4;t+=23){const side=rng()>.5?1:-1,dist=r.width/2+3;const px=r.a.x+dx*t/len-dz/len*dist*side,pz=r.a.z+dz*t/len+dx/len*dist*side;if(Math.hypot(px,pz)<320&&!buildings.some(b=>pointInPoly(px,pz,b.poly)))tree(px,pz,.84+rng()*.32,false,Math.floor(px+pz+20000));}}
 }
 for(const r of roads.slice(0,90)){const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,len=Math.hypot(dx,dz);if(len>55&&rng()>.42){const t=.37;const s=r.width/2+2.8;const px=r.a.x+dx*t-dz/len*s,pz=r.a.z+dz*t+dx/len*s;if(Math.hypot(px,pz)<280)lamppost(px,pz);}}
 if(roads.length<3||buildings.length<3){createFallback();assignStart();throw new Error('В этом районе недостаточно дорог и домов');}worldSource='OSM';worldReady=true;
 civCars=[];for(const r of roads.slice(0,65)){if(r.width<6||rng()>.12)continue;const angle=Math.atan2(r.b.x-r.a.x,r.b.z-r.a.z);civCars.push({x:r.a.x*.47+r.b.x*.53,z:r.a.z*.47+r.b.z*.53,yaw:angle,speed:0,color:['#515967','#a55f57','#e6dac6','#759198'][Math.floor(rng()*4)]});}
}
function resize(){dpr=Math.min(devicePixelRatio||1,1.5);deviceW=canvas.clientWidth;deviceH=canvas.clientHeight;canvas.width=Math.round(deviceW*dpr);canvas.height=Math.round(deviceH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}window.addEventListener('resize',resize);resize();
function projection(point,cam){const dx=point.x-cam.x,dz=point.z-cam.z,dy=point.y-cam.y;
 const right=dx*Math.cos(cam.yaw)-dz*Math.sin(cam.yaw),fwd=dx*Math.sin(cam.yaw)+dz*Math.cos(cam.yaw);
 const depth=fwd*cam.cos-dy*cam.sin,up=dy*cam.cos+fwd*cam.sin;
 if(depth<1.25)return null;return {x:deviceW/2+right*cam.f/depth,y:deviceH*.55-up*cam.f/depth,d:depth};}
function makeCamera(){const yaw=car.yaw,off=car.onFoot?9:17,height=car.onFoot?4.1:9;
 const cam={x:car.x-Math.sin(yaw)*off,z:car.z-Math.cos(yaw)*off,y:height,yaw,sin:Math.sin(.31),cos:Math.cos(.31),f:Math.min(deviceW*1.30,deviceH*1.45)};return cam;}
function drawSky(){let g=ctx.createLinearGradient(0,0,0,deviceH);g.addColorStop(0,'#638bad');g.addColorStop(.27,'#b8cbd2');g.addColorStop(.43,'#cbd9d1');g.addColorStop(.44,'#9cb294');g.addColorStop(1,'#648e71');ctx.fillStyle=g;ctx.fillRect(0,0,deviceW,deviceH);
 const sx=deviceW*.74,sy=deviceH*.19;const sun=ctx.createRadialGradient(sx,sy,6,sx,sy,deviceW*.35);sun.addColorStop(0,'#ffefcfbb');sun.addColorStop(.2,'#f9e6b345');sun.addColorStop(1,'#ffffff00');ctx.fillStyle=sun;ctx.fillRect(0,0,deviceW,deviceH);
 ctx.fillStyle='#ffffff1d';for(let i=0;i<5;i++){const x=(i*217+100+deviceW*.1)%deviceW,y=60+(i%3)*25;ctx.beginPath();ctx.ellipse(x,y,90,12,0,0,Math.PI*2);ctx.fill();}}
function distanceSqToCam(cx,cz,cam){const dx=cx-cam.x,dz=cz-cam.z;return dx*dx+dz*dz;}
function drawFace(f,cam){const verts=f.pts.map(p=>projection(p,cam));if(verts.some(p=>!p))return;const xs=verts.map(p=>p.x),ys=verts.map(p=>p.y);
 if(Math.max(...xs)<-110||Math.min(...xs)>deviceW+110||Math.max(...ys)<-110||Math.min(...ys)>deviceH+110)return;
 ctx.beginPath();ctx.moveTo(verts[0].x,verts[0].y);for(let i=1;i<verts.length;i++)ctx.lineTo(verts[i].x,verts[i].y);ctx.closePath();ctx.fillStyle=f.color;ctx.fill();
 if(f.stroke&&Math.min(...verts.map(p=>p.d))<130){ctx.strokeStyle=f.stroke;ctx.lineWidth=.7;ctx.stroke();}}
function dynamicFace(list,pts,color,layer=0){list.push({pts,color,layer,cx:pts.reduce((s,p)=>s+p.x,0)/pts.length,cz:pts.reduce((s,p)=>s+p.z,0)/pts.length});}
function carMesh(x,z,yaw,body='#c23e6e',scale=1,withPlate=true){const out=[];const s=scale;const p=(lx,ly,lz)=>v(x+(lx*Math.cos(yaw)+lz*Math.sin(yaw))*s,ly*s,z+(-lx*Math.sin(yaw)+lz*Math.cos(yaw))*s);
 const poly=(verts,color,layer=20)=>dynamicFace(out,verts.map(a=>p(...a)),color,layer);
 poly([[-1.17,.08,-2.5],[1.17,.08,-2.5],[1.17,.08,2.5],[-1.17,.08,2.5]],'#253136',15);
 for(const ax of [-1.1,1.1])for(const zz of [-1.45,1.45])poly([[ax-.22,.22,zz-.54],[ax+.22,.22,zz-.54],[ax+.22,.8,zz-.54],[ax-.22,.8,zz-.54]],'#20262e',30);
 poly([[-1,.55,-2.35],[1,.55,-2.35],[1,.55,2.25],[-1,.55,2.25]],body,20);
 poly([[-1,.55,-2.35],[-1,.55,2.25],[-1,1.08,2.25],[-1,1.12,-2.35]],colorMix(body,.76),21);
 poly([[1,.55,2.25],[1,.55,-2.35],[1,1.12,-2.35],[1,1.08,2.25]],colorMix(body,.66),21);
 poly([[-.88,.6,-1.23],[.88,.6,-1.23],[.81,1.62,-.61],[-.81,1.62,-.61]],'#304957',28);
 poly([[-.86,1.62,-.6],[.86,1.62,-.6],[.75,1.62,1.02],[-.75,1.62,1.02]],colorMix(body,.82),30);
 poly([[-.75,1.62,1.02],[.75,1.62,1.02],[.9,.65,1.65],[-.9,.65,1.65]],'#46657a',28);
 for(let t of [-1,1]){poly([[t*.77,1.6,-.55],[t*.92,.6,-1.1],[t*.97,.6,1.25],[t*.74,1.6,.94]],'#385367',29);}
 poly([[-1,.55,2.25],[1,.55,2.25],[1,.95,2.25],[-1,.95,2.25]],colorMix(body,.9),23);
 poly([[-.92,.58,2.26],[-.48,.58,2.26],[-.48,.83,2.26],[-.92,.83,2.26]],'#e44944',24);
 poly([[.48,.58,2.26],[.92,.58,2.26],[.92,.83,2.26],[.48,.83,2.26]],'#e44944',24);
 poly([[-.85,.75,-2.36],[-.37,.75,-2.36],[-.37,.96,-2.36],[-.85,.96,-2.36]],'#fff5bf',24);
 poly([[.37,.75,-2.36],[.85,.75,-2.36],[.85,.96,-2.36],[.37,.96,-2.36]],'#fff5bf',24);
 if(withPlate)poly([[-.28,.58,2.28],[.28,.58,2.28],[.28,.77,2.28],[-.28,.77,2.28]],'#dddde1',25);
 return out;}
function characterMesh(x,z){const out=[];dynamicFace(out,[v(x-.35,0,z),v(x+.35,0,z),v(x+.35,1.5,z),v(x-.35,1.5,z)],'#443d7d',20);dynamicFace(out,[v(x-.28,1.52,z),v(x+.28,1.52,z),v(x+.28,2.1,z),v(x-.28,2.1,z)],'#e2b89f',22);return out;}
function drawCarScene(cam){let dynamic=[];
 for(const c of civCars){if(distanceSqToCam(c.x,c.z,cam)<240*240)dynamic.push(...carMesh(c.x,c.z,c.yaw,c.color,.92,false));}
 for(const p of players.values()){if(!myId||p.user_id===myId)continue;if(distanceSqToCam(p.x,p.z,cam)<240*240)dynamic.push(...carMesh(p.x,p.z,p.heading,'#5f9ec3',1,true));}
 if(car.onFoot){dynamic.push(...carMesh(parked.x,parked.z,parked.yaw,'#894bc5',1.04,true));dynamic.push(...characterMesh(car.x,car.z));}else dynamic.push(...carMesh(car.x,car.z,car.yaw,'#894bc5',1.04,true));
 dynamic=dynamic.map(f=>{const pt=v(f.cx,1,f.cz);const proj=projection(pt,cam);return {...f,depth:proj?.d??0};});dynamic.sort((a,b)=>b.depth-a.depth || a.layer-b.layer);
 for(const f of dynamic)drawFace(f,cam);
 for(const player of players.values()){
  if(player.user_id===myId)continue;const proj=projection(v(player.x,3.5,player.z),cam);if(!proj||proj.x<-80||proj.x>deviceW+80||proj.y<-40||proj.y>deviceH)continue;
  const text=String(player.display_name||player.username||'Игрок').slice(0,15);ctx.font='600 12px Inter, sans-serif';const width=ctx.measureText(text).width+18;
  ctx.fillStyle='#1b2649dc';ctx.fillRect(proj.x-width/2,proj.y-18,width,24);ctx.fillStyle='white';ctx.textAlign='center';ctx.fillText(text,proj.x,proj.y-2);
 }
}
function drawScene(){if(!deviceW||!deviceH)return;drawSky();const cam=makeCamera();const visible=[];
 for(const f of worldFaces){if(distanceSqToCam(f.cx,f.cz,cam)>385*385)continue;const pt=projection(v(f.cx,.8,f.cz),cam);if(!pt)continue;visible.push({...f,depth:pt.d});}
 visible.sort((a,b)=>b.depth-a.depth || a.layer-b.layer);
 for(const f of visible)drawFace(f,cam);
 drawCarScene(cam);drawVignette();}
function drawVignette(){const g=ctx.createLinearGradient(0,0,0,deviceH);g.addColorStop(0,'#10203218');g.addColorStop(.7,'#00000000');g.addColorStop(1,'#142a3922');ctx.fillStyle=g;ctx.fillRect(0,0,deviceW,deviceH);}
function collisions(x,z){for(const b of buildings)if(Math.abs(b.x-x)<50&&Math.abs(b.z-z)<50&&pointInPoly(x,z,b.poly))return true;return false;}
function updateCar(dt){if(!playing)return;const accel=keys.gas?13:keys.brake?-19:0;const resist=car.speed*0.75;
 if(car.onFoot){const dir=keys.gas?1:keys.brake?-1:0;car.speed=dir*3.6;car.yaw+=(keys.right?1:keys.left?-1:0)*dt*2.3;}
 else {car.boost=keys.boost?Math.min(1,car.boost+dt*2):Math.max(0,car.boost-dt*2);
  car.speed+=(accel+(keys.boost?15:0)-resist)*dt;car.speed=Math.max(-10,Math.min(keys.boost?43:28,car.speed));if(!keys.gas&&!keys.brake&&Math.abs(car.speed)<.15)car.speed=0;
  car.yaw+=(keys.right?1:keys.left?-1:0)*Math.min(Math.abs(car.speed)/11,1.4)*dt*(car.speed>=0?1:-1)*.9;}
 const nx=car.x+Math.sin(car.yaw)*car.speed*dt,nz=car.z+Math.cos(car.yaw)*car.speed*dt;
 if(!collisions(nx,nz)){car.x=nx;car.z=nz;}else car.speed=0;
 car.step+=dt*car.speed;$('speed').textContent=String(Math.round(Math.abs(car.speed)*3.6));$('driveMode').textContent=car.onFoot?'ПЕШКОМ':'МАШИНА';
 if(Math.floor(elapsedTime*2)%3===0){const nearest=roads.reduce((best,r)=>{const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z;const t=Math.min(1,Math.max(0,((car.x-r.a.x)*dx+(car.z-r.a.z)*dz)/(dx*dx+dz*dz||1)));const d=Math.hypot(r.a.x+t*dx-car.x,r.a.z+t*dz-car.z);return d<best.d?{d,name:r.name}:best;},{d:1e9,name:'Улица'});$('locationLabel').textContent=nearest.d<28?nearest.name:'Район';}
}
function loop(now){let dt=Math.min(.05,(now-frameTick)/1000||.016);frameTick=now;elapsedTime+=dt;updateCar(dt);drawScene();requestAnimationFrame(loop);}
function assignStart(){const best=roads.filter(r=>r.width>=5).reduce((a,r)=>{const dx=r.b.x-r.a.x,dz=r.b.z-r.a.z,len=Math.hypot(dx,dz);const dist=Math.hypot((r.a.x+r.b.x)/2,(r.a.z+r.b.z)/2);return dist<a.dist&&len>=5?{dist,r}:a;},{dist:Infinity,r:null}).r;
 car.x=best?(best.a.x+best.b.x)/2:0;car.z=best?(best.a.z+best.b.z)/2:0;car.yaw=best?Math.atan2(best.b.x-best.a.x,best.b.z-best.a.z):0;car.speed=0;parked={x:car.x,z:car.z,yaw:car.yaw};
}
function fitNumbers(){const lat=Number($('latitude').value),lon=Number($('longitude').value);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -85||lat>85||lon< -180||lon>180)throw Error('Некорректные координаты');return {lat,lon};}
const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'];
async function fetchOSM(){if(loading)return;loading=true;const lat=center.lat,lon=center.lon;
 status('Загружаем реальные здания и дороги OpenStreetMap…');$('worldCounter').textContent='🌍 OSM · загрузка';
 let err=null;
 const query=`[out:json][timeout:22];(way["highway"](around:440,${lat},${lon});way["building"](around:440,${lat},${lon});node["natural"="tree"](around:440,${lat},${lon});way["leisure"="park"](around:440,${lat},${lon}););out body;>;out skel qt;`;
 for(const host of endpoints){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12500);
  try {const response=await fetch(host,{method:'POST',body:'data='+encodeURIComponent(query),headers:{'content-type':'application/x-www-form-urlencoded'},signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('OSM HTTP '+response.status);const data=await response.json();if(center.lat!==lat||center.lon!==lon){clearTimeout(timer);return;}
   fromOSM(data);assignStart();status('Карта построена по реальным дорогам и контурам домов (OSM).');$('worldCounter').textContent=`🗺️ OSM · ${roads.length} участков дорог · ${buildings.length} зданий`;loading=false;clearTimeout(timer);setTimeout(()=>{if(worldSource==='OSM')status('');},6500);return;
  }catch(e){err=e;}finally{clearTimeout(timer);}}
 loading=false;status('OSM сейчас недоступен. Открыт демонстрационный район; можно попробовать карту позже.');$('worldCounter').textContent='🏙️ Демо-район';console.warn('[RNDM World] OSM:',err?.message||err);
}
function maybeShowWorld(){if(!worldReady){createFallback();assignStart();}}
function setupSupabase(){if(!window.supabase?.createClient||!window.RNDM_CONFIG)throw Error('Не удалось загрузить библиотеку Supabase');const c=window.RNDM_CONFIG;supa=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});return supa;}
async function joinGroup(){if(!roomId)throw Error('Для /group открой групповую переписку и введи команду заново.');
 const sb=setupSupabase();const {data:auth,error:authError}=await sb.auth.getUser();if(authError||!auth?.user)throw Error('Войди в свой аккаунт RNDM Chat перед совместной игрой.');myId=auth.user.id;
 const {data,error}=await sb.rpc('rndm_world_join',{p_conversation_id:roomId,p_lat:center.lat,p_lon:center.lon});if(error)throw error;
 center={lat:Number(data.latitude),lon:Number(data.longitude)};$('latitude').value=center.lat.toFixed(5);$('longitude').value=center.lon.toFixed(5);
 $('modeLabel').textContent='GROUP · '+roomId.slice(0,8);status('Сетевая группа подключена. Все участники чата видят друг друга.');$('players').hidden=false;networkWorking=true;
 netTimer=window.setInterval(async()=>{if(!playing||document.hidden||!supa)return;const {data:d,error:e}=await supa.rpc('rndm_world_sync',{
 p_conversation_id:roomId,p_x:Number(car.x.toFixed(2)),p_z:Number(car.z.toFixed(2)),p_heading:Number(car.yaw.toFixed(3)),p_speed:Number(car.speed.toFixed(2))});
 if(e){networkWorking=false;status('Синхронизация друзей: '+String(e.message||e).slice(0,125));return;}
 networkWorking=true;players.clear();for(const p of d?.players||[])if(p.user_id!==myId)players.set(p.user_id,p);
 $('players').innerHTML='<b>👥 В поездке: '+((d?.players||[]).length||1)+'</b>'+(d?.players||[]).slice(0,9).map(p=>'<p>'+escapeHTML(p.user_id===myId?'Ты':p.display_name||p.username||'Игрок')+'</p>').join('');
 },1450);
}
function escapeHTML(t){return String(t||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
async function start(){if(playing)return;const button=$('startGame');button.disabled=true;try{
 if(groupMode)await joinGroup();maybeShowWorld();playing=true;$('startScreen').hidden=true;fetchOSM().catch(e=>status(e.message));}
 catch(e){status(String(e.message||e));$('startNotice').textContent='Ошибка запуска: '+String(e.message||e);button.disabled=false;}}
$('startGame').addEventListener('click',start);$('choosePlace').onclick=()=>{$('mapPanel').hidden=false;};$('openMap').onclick=()=>{$('mapPanel').hidden=false;};$('closeMap').onclick=()=>{$('mapPanel').hidden=true;};
for(const b of document.querySelectorAll('[data-place]'))b.onclick=()=>{const [lat,lon]=b.dataset.place.split(',');$('latitude').value=lat;$('longitude').value=lon;$('mapNote').textContent='Выбраны координаты. Нажми «Загрузить район». ';};
$('loadMap').onclick=async()=>{try{if(groupMode)throw Error('В групповой игре место выбирает создатель комнаты при первом запуске.');center=fitNumbers();$('mapPanel').hidden=true;createFallback(Math.round(center.lat*1000+center.lon*100));assignStart();fetchOSM().catch(()=>{});if(!playing){$('startNotice').textContent='Выбрано место: '+center.lat.toFixed(4)+', '+center.lon.toFixed(4);}}catch(e){$('mapNote').textContent=String(e.message||e);}};
function toggleFoot(){if(!car.onFoot){parked={x:car.x,z:car.z,yaw:car.yaw};car.onFoot=true;}else{if(Math.hypot(car.x-parked.x,car.z-parked.z)>6){status('Подойди к своей машине, чтобы сесть (F).');return;}car.x=parked.x;car.z=parked.z;car.yaw=parked.yaw;car.onFoot=false;}car.speed=0;status(car.onFoot?'Пешком: W/A/S/D · F — сесть в машину':'За рулём: W/A/S/D · J — ускорение');setTimeout(()=>{if(playing)status('');},2400);}
const bindings={KeyW:'gas',ArrowUp:'gas',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyJ:'boost',ShiftLeft:'boost'};
window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||$('mapPanel').hidden===false)return;if(bindings[e.code]){keys[bindings[e.code]]=true;e.preventDefault();}if(e.repeat)return;if(e.code==='KeyF'){toggleFoot();e.preventDefault();}if(e.code==='KeyX'){assignStart();e.preventDefault();}if(e.code==='KeyM'){$('mapPanel').hidden=!$('mapPanel').hidden;e.preventDefault();}});
window.addEventListener('keyup',e=>{if(bindings[e.code]){keys[bindings[e.code]]=false;e.preventDefault();}});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});
for(const b of document.querySelectorAll('[data-control]')){
 const key=b.dataset.control;if(key==='f'){b.onclick=toggleFoot;continue;}
 const mapped=key==='gas'?'gas':key==='brake'?'brake':key==='boost'?'boost':key;
 const down=e=>{e.preventDefault();b.setPointerCapture?.(e.pointerId);keys[mapped]=true;};const up=e=>{e.preventDefault();keys[mapped]=false;};
 b.addEventListener('pointerdown',down);for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,up);
}
window.addEventListener('pagehide',()=>{if(netTimer)clearInterval(netTimer);if(supa&&roomId&&myId)supa.rpc('rndm_world_leave',{p_conversation_id:roomId}).catch(()=>{});});
createFallback();assignStart();resize();requestAnimationFrame(loop);$('worldCounter').textContent='🏙️ Демонстрационный район';
if(!groupMode)status('Готов к поездке · выбери город или начни в демо-районе');
else if(!roomId){$('startNotice').textContent='Открой групповой чат и отправь /group, чтобы создать приглашение.';}
