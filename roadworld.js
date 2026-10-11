/* RNDM World v56 — 3D driving and interactive OSM city map.
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
let buildingGeometry=false;
function status(text){$('status').textContent=text||'';}
function rnd(seed){let state=Math.abs(seed)|0;return()=>{state=(Math.imul(state,1664525)+1013904223)|0;return(state>>>0)/4294967296;};}
function v(x,y,z){return {x,y,z};}
function colorMix(hex,f=1){if(!/^#[0-9a-f]{6}$/i.test(hex))return hex;return '#'+[1,3,5].map(i=>Math.min(255,Math.max(0,Math.round(parseInt(hex.slice(i,i+2),16)*f))).toString(16).padStart(2,'0')).join('');}
function face(pts,color,layer=0,stroke=''){if(pts.length>2)worldFaces.push({pts,color,layer,stroke,detail:buildingGeometry&&layer>=12,cx:pts.reduce((n,p)=>n+p.x,0)/pts.length,cz:pts.reduce((n,p)=>n+p.z,0)/pts.length});}
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
 if(poly.length<3)return;poly=poly.slice(0,48);const area=Math.abs(polygonArea(poly));if(area<9||area>80000)return;
 buildingGeometry=true;const rng=rnd(seed), floors=Math.min(10,Math.max(1,Math.round(level||2+Math.floor(rng()*4)))),h=Math.min(35,floors*3.15+0.8);
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
  const distant=worldSource==='OSM'&&Math.hypot(centerX,centerZ)>195;
  if(distant)continue;
  const columns=Math.min(10,Math.max(1,Math.floor((len-1)/3.05)));
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
 buildingGeometry=false;
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
function createFallback(seed=21){
 resetWorld();worldSource='DEMO';const rng=rnd(seed);const steps=[-270,-210,-150,-90,-30,30,90,150,210,270];
 // A recognizable urban street grid with blocks close to the starting point.
 for(const x of [-300,-220,-140,-60,0,60,140,220,300]){
  const main=Math.abs(x)<1;sampleRoad({x,z:-340},{x,z:340},main?12:8.2,main?'Центральный проспект':`Улица ${Math.abs(x)}`);
 }
 for(const z of [-300,-220,-140,-60,60,140,220,300]){
  const main=Math.abs(z-60)<1;sampleRoad({x:-335,z},{x:335,z},main?11:7.5,main?'Садовая улица':'Переулок');
 }
 // Urban blocks, residential houses, clinics and shops between roads.
 let n=0;
 const roadXs=[-300,-220,-140,-60,0,60,140,220,300],roadZs=[-300,-220,-140,-60,60,140,220,300];
 for(let ix=0;ix<roadXs.length-1;ix++)for(let iz=0;iz<roadZs.length-1;iz++){
  const left=roadXs[ix],right=roadXs[ix+1],bottom=roadZs[iz],top=roadZs[iz+1];
  const blockX=(left+right)/2,blockZ=(bottom+top)/2;
  const garden=(ix===0&&iz===4)||(ix===5&&iz===1)||(ix===6&&iz===6);
  if(garden){for(let t=0;t<13;t++)tree(left+14+rng()*(right-left-28),bottom+14+rng()*(top-bottom-28),.85+rng()*.32,rng()<.24,n++);continue;}
  const cols=(right-left)>70?2:1;
  const rows=(top-bottom)>70?2:1;
  for(let cx=0;cx<cols;cx++)for(let cz=0;cz<rows;cz++){
   if(rng()<.08)continue;
   const centerX=left+(right-left)*(cx+.5)/cols;
   const centerZ=bottom+(top-bottom)*(cz+.5)/rows;
   const cellW=(right-left)/cols,cellD=(top-bottom)/rows;
   const w=Math.max(10,cellW-(12+rng()*7));const d=Math.max(11,cellD-(12+rng()*6));
   const bx=centerX+(rng()-.5)*1.8,bz=centerZ+(rng()-.5)*1.8;
   let levels=2+Math.floor(rng()*7);
   if(Math.abs(bx)<95&&Math.abs(bz)<165)levels=4+Math.floor(rng()*5);
   const wall=['#d0b6a1','#e1d0b3','#b8bcb8','#bfa596','#c7bfae','#a9acaa'][Math.floor(rng()*6)];
   building([{x:bx-w/2,z:bz-d/2},{x:bx+w/2,z:bz-d/2},{x:bx+w/2,z:bz+d/2},{x:bx-w/2,z:bz+d/2}],levels,{wall,balcony:levels>=5},++n*29+seed);
   if(rng()<.6)tree(bx+w/2+3.8,bz,.75+rng()*.30,false,n*11);
  }
 }
 for(let zz=-315;zz<315;zz+=38){lamppost(10,zz);lamppost(-10,zz+16);}
 for(let xx=-255;xx<=260;xx+=44){lamppost(xx,-51);lamppost(xx,69);}
 // Short pedestrian crossings at intersections.
 for(let z of [-220,-140,-60,60,140,220])for(const x of [-140,-60,0,60,140]){
  if(Math.hypot(x,z)>290)continue;
  for(let k=-2;k<=2;k++)rectXZ({x:x+k*1.55,z:z-4},{x:x+k*1.55,z:z+4},.82,.133,'#e6e2d5',6);
 }
 busStop(14,22);
 civCars=[{x:4.2,z:85,yaw:0,speed:0,color:'#647c90'},{x:-4,z:142,yaw:Math.PI,speed:0,color:'#dad7c6'},{x:5,z:-86,yaw:0,speed:0,color:'#a46654'},{x:-5,z:192,yaw:0,speed:0,color:'#667069'}];
 worldSource='DEMO';worldReady=true;roadNames=['Центральный проспект','Садовая улица'];
}
function geoPoint(lat,lon){const latRad=center.lat*Math.PI/180;return {x:(lon-center.lon)*111320*Math.cos(latRad),z:(lat-center.lat)*111320};}
function fromOSM(data){if(!data||!Array.isArray(data.elements))throw new Error('Нет данных карты');const nodes=new Map(),ways=[];for(const e of data.elements){if(e.type==='node')nodes.set(e.id,e);else if(e.type==='way')ways.push(e);}resetWorld();worldSource='OSM';const rng=rnd(Math.round(center.lat*10000+center.lon*10000));
 for(const e of ways){const tags=e.tags||{},pts=(e.nodes||[]).map(id=>nodes.get(id)).filter(Boolean).map(n=>geoPoint(n.lat,n.lon)).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));if(pts.length<2)continue;
  if(tags.highway){const width=roadWidth(tags.highway);if(tags.highway==='construction')continue;for(let i=0;i<pts.length-1;i++){if(Math.hypot((pts[i].x+pts[i+1].x)/2,(pts[i].z+pts[i+1].z)/2)<620)sampleRoad(pts[i],pts[i+1],width,tags.name||tags['name:ru']||'Улица',tags.highway);}if(tags.name)roadNames.push(tags.name);}
  else if(tags.building||tags['building:part']){const poly=pts.at(0).x===pts.at(-1).x&&pts.at(0).z===pts.at(-1).z?pts.slice(0,-1):pts;
    const avgx=poly.reduce((s,p)=>s+p.x,0)/poly.length,avgz=poly.reduce((s,p)=>s+p.z,0)/poly.length;
    if(Math.hypot(avgx,avgz)>540||poly.length>140||buildings.length>=300)continue;
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
 if(roads.length<3)throw new Error('Здесь не нашлись дороги OpenStreetMap');
 if(buildings.length<5){
   // Keep actual roads; create visibly synthetic filler near them rather than blank landscape.
   for(const r of roads.filter(r=>r.width>=5).slice(0,90)){
     if(buildings.length>65)break;
     const midpoint={x:(r.a.x+r.b.x)/2,z:(r.a.z+r.b.z)/2};
     const dd=Math.hypot(r.b.x-r.a.x,r.b.z-r.a.z);if(dd<9||Math.hypot(midpoint.x,midpoint.z)>225)continue;
     for(const side of [-1,1]){
       const nx=-(r.b.z-r.a.z)/dd*side,nz=(r.b.x-r.a.x)/dd*side;
       const bx=midpoint.x+nx*(r.width/2+17),bz=midpoint.z+nz*(r.width/2+17);
       if(distToRoad(bx,bz)<7||buildings.some(b=>Math.hypot(b.x-bx,b.z-bz)<25))continue;
       building([{x:bx-10,z:bz-10},{x:bx+10,z:bz-10},{x:bx+10,z:bz+10},{x:bx-10,z:bz+10}],2+Math.floor(rng()*6),{},Math.floor(bx*19+bz));
     }
   }
 }
 if(buildings.length<3)throw new Error('Здесь нет подходящей застройки');
 worldSource='OSM';worldReady=true;
 civCars=[];for(const r of roads.slice(0,65)){if(r.width<6||rng()>.12)continue;const angle=Math.atan2(r.b.x-r.a.x,r.b.z-r.a.z);civCars.push({x:r.a.x*.47+r.b.x*.53,z:r.a.z*.47+r.b.z*.53,yaw:angle,speed:0,color:['#515967','#a55f57','#e6dac6','#759198'][Math.floor(rng()*4)]});}
}
function resize(){dpr=Math.min(devicePixelRatio||1,1.5);deviceW=canvas.clientWidth;deviceH=canvas.clientHeight;canvas.width=Math.round(deviceW*dpr);canvas.height=Math.round(deviceH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}window.addEventListener('resize',resize);resize();
function projection(point,cam){const dx=point.x-cam.x,dz=point.z-cam.z,dy=point.y-cam.y;
 const right=dx*Math.cos(cam.yaw)-dz*Math.sin(cam.yaw),fwd=dx*Math.sin(cam.yaw)+dz*Math.cos(cam.yaw);
 const depth=fwd*cam.cos-dy*cam.sin,up=dy*cam.cos+fwd*cam.sin;
 if(depth<1.25)return null;return {x:deviceW/2+right*cam.f/depth,y:deviceH*.55-up*cam.f/depth,d:depth};}
function makeCamera(){const yaw=car.yaw,off=car.onFoot?9:17,height=car.onFoot?4.1:9;
 const cam={x:car.x-Math.sin(yaw)*off,z:car.z-Math.cos(yaw)*off,y:height,yaw,sin:Math.sin(.20),cos:Math.cos(.20),f:Math.min(deviceW*1.03,deviceH*.98)};return cam;}
function drawSky(){let g=ctx.createLinearGradient(0,0,0,deviceH);g.addColorStop(0,'#638bad');g.addColorStop(.27,'#b8cbd2');g.addColorStop(.43,'#cbd9d1');g.addColorStop(.44,'#9cb294');g.addColorStop(1,'#648e71');ctx.fillStyle=g;ctx.fillRect(0,0,deviceW,deviceH);
 const sx=deviceW*.74,sy=deviceH*.19;const sun=ctx.createRadialGradient(sx,sy,6,sx,sy,deviceW*.35);sun.addColorStop(0,'#ffefcfbb');sun.addColorStop(.2,'#f9e6b345');sun.addColorStop(1,'#ffffff00');ctx.fillStyle=sun;ctx.fillRect(0,0,deviceW,deviceH);
 ctx.fillStyle='#ffffff1d';for(let i=0;i<5;i++){const x=(i*217+100+deviceW*.1)%deviceW,y=60+(i%3)*25;ctx.beginPath();ctx.ellipse(x,y,90,12,0,0,Math.PI*2);ctx.fill();}}
function distanceSqToCam(cx,cz,cam){const dx=cx-cam.x,dz=cz-cam.z;return dx*dx+dz*dz;}
function cameraCoordinates(point,cam){
 const dx=point.x-cam.x,dz=point.z-cam.z,dy=point.y-cam.y;
 const right=dx*Math.cos(cam.yaw)-dz*Math.sin(cam.yaw);
 const fwd=dx*Math.sin(cam.yaw)+dz*Math.cos(cam.yaw);
 return {x:right,y:dy*cam.cos+fwd*cam.sin,d:fwd*cam.cos-dy*cam.sin};
}
function drawFace(f,cam){
 // Clip every polygon at the near plane. v55 discarded the entire facade/road
 // whenever just one corner was behind the camera, producing huge missing patches.
 const near=.65,vertices=f.pts.map(p=>cameraCoordinates(p,cam)),clipped=[];
 for(let i=0;i<vertices.length;i++){
  const a=vertices[i],b=vertices[(i+1)%vertices.length];const inA=a.d>=near,inB=b.d>=near;
  if(inA)clipped.push(a);
  if(inA!==inB){const t=(near-a.d)/(b.d-a.d);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,d:near});}
 }
 if(clipped.length<3)return;
 const projected=clipped.map(p=>({x:deviceW/2+p.x*cam.f/p.d,y:deviceH*.55-p.y*cam.f/p.d,d:p.d}));
 const xs=projected.map(p=>p.x),ys=projected.map(p=>p.y);
 if(Math.max(...xs)<-25||Math.min(...xs)>deviceW+25||Math.max(...ys)<-25||Math.min(...ys)>deviceH+25)return;
 ctx.beginPath();ctx.moveTo(projected[0].x,projected[0].y);
 for(let i=1;i<projected.length;i++)ctx.lineTo(projected[i].x,projected[i].y);
 ctx.closePath();ctx.fillStyle=f.color;ctx.fill();
 if(f.stroke&&Math.min(...projected.map(p=>p.d))<120){ctx.strokeStyle=f.stroke;ctx.lineWidth=.55;ctx.stroke();}
}
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
 for(const f of worldFaces){const distance2=distanceSqToCam(f.cx,f.cz,cam);
 if(distance2>285*285||(f.detail&&distance2>(deviceW<700?105:132)**2))continue;
 const point=cameraCoordinates(v(f.cx,0,f.cz),cam);
 if(point.d<-12)continue;visible.push({...f,depth:point.d});}
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
const endpoints=[
 'https://overpass.kumi.systems/api/interpreter',
 'https://overpass.private.coffee/api/interpreter',
 'https://overpass-api.de/api/interpreter',
 'https://overpass.nchc.org.tw/api/interpreter'
];
let osmRun=0;
const overpassCache=new Map();
async function queryOSM(endpoint,query,signal){
 // GET is allowed by more public Overpass installations than CORS preflighted POST.
 const url=endpoint+'?data='+encodeURIComponent(query);
 const response=await fetch(url,{method:'GET',signal,cache:'default',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error('HTTP '+response.status+' · '+new URL(endpoint).hostname);
 const result=await response.json();
 if(!Array.isArray(result?.elements)||result.elements.length<4)throw Error('Пустой ответ OSM');
 return result;
}
async function fetchOSM(){
 const run=++osmRun,lat=center.lat,lon=center.lon;
 loading=true;status('Загрузка реальных улиц и зданий OSM…');$('worldCounter').textContent='🌍 OSM · загрузка';
 const cacheKey=lat.toFixed(4)+','+lon.toFixed(4);
 const query=`[out:json][timeout:18];(way["highway"](around:590,${lat},${lon});way["building"](around:590,${lat},${lon});way["building:part"](around:450,${lat},${lon});node["natural"="tree"](around:450,${lat},${lon});way["leisure"="park"](around:590,${lat},${lon}););out body;>;out skel qt;`;
 let err=null;let data=overpassCache.get(cacheKey);
 // Authenticated Supabase proxy works on mobile networks where Overpass blocks browser CORS.
 if(!data){
  try{
   if(!supa&&window.supabase?.createClient&&window.RNDM_CONFIG)setupSupabase();
   if(supa){
    const session=await supa.auth.getSession();
    if(session.data?.session?.access_token){
     const result=await Promise.race([
       supa.functions.invoke('rndm-world-osm',{body:{latitude:lat,longitude:lon}}),
       new Promise((_,reject)=>setTimeout(()=>reject(Error('Тайм-аут OSM proxy')),11500))
     ]);
     if(result.error)throw Error(String(result.error.message||result.error));
     if(Array.isArray(result.data?.elements))data=result.data;
    }
   }
  }catch(e){err=e;}
 }
 if(!data){for(const host of endpoints){
  if(run!==osmRun)return;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9800);
  try{data=await queryOSM(host,query,controller.signal);overpassCache.set(cacheKey,data);if(overpassCache.size>4)overpassCache.delete(overpassCache.keys().next().value);break;}
  catch(e){err=e;}finally{clearTimeout(timer);}
 }}
 if(run!==osmRun)return;
 loading=false;
 if(data){try{
   fromOSM(data);assignStart();
   status('Загружено из OpenStreetMap. Высота, окна и фасады приблизительные.');
   $('worldCounter').textContent=`🏘 OSM · ${buildings.length} домов · ${roads.length} дорог`;
   setTimeout(()=>{if(worldSource==='OSM'&&run===osmRun)status('');},6500);return;
  }catch(e){err=e;}
 }
 // Falling back is a visual approximation, not an actual map of a chosen city.
 createFallback(Math.round(lat*1000+lon*100));assignStart();
 status('OSM недоступен: показан ПРИМЕР района, не настоящая карта. Нажми «Карта», чтобы повторить.');
 $('worldCounter').textContent=`🏘 Пример · ${buildings.length} домов`;
 console.warn('[RNDM World] Не удалось загрузить OSM:',err?.message||err);
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

// Slippy map: no external JS library, native mouse/touch pan, wheel/pinch zoom,
// OSM raster tiles with attribution. If tiles are offline, show a map grid.
const mapCanvas=$('cityMap');const mapCtx=mapCanvas.getContext('2d');
const worldMap={lat:center.lat,lon:center.lon,zoom:13,tiles:new Map(),queued:new Set(),selected:{...center},name:'Северное Бутово',drag:null,pinch:0,frame:0};
function mercX(lon,z){return (lon+180)/360*Math.pow(2,z)*256;}
function mercY(lat,z){return (1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*Math.pow(2,z)*256;}
function invMercX(x,z){return x/(Math.pow(2,z)*256)*360-180;}
function invMercY(y,z){return Math.atan(Math.sinh(Math.PI*(1-2*y/(Math.pow(2,z)*256))))*180/Math.PI;}
function resizeWorldMap(){if($('mapPanel').hidden)return;
 const rect=mapCanvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
 if(!rect.width||!rect.height)return;
 mapCanvas.width=Math.round(rect.width*ratio);mapCanvas.height=Math.round(rect.height*ratio);
 mapCtx.setTransform(ratio,0,0,ratio,0,0);requestMapDraw();}
function requestMapDraw(){if(worldMap.frame)return;worldMap.frame=requestAnimationFrame(()=>{worldMap.frame=0;renderWorldMap();});}
function panMap(dx,dy){const zoom=worldMap.zoom;
 const px=mercX(worldMap.lon,zoom)-dx,py=mercY(worldMap.lat,zoom)-dy;
 worldMap.lon=Math.max(-179.99,Math.min(179.99,invMercX(px,zoom)));
 worldMap.lat=Math.max(-84.9,Math.min(84.9,invMercY(py,zoom)));requestMapDraw();}
function mapCoordinates(clientX,clientY){const r=mapCanvas.getBoundingClientRect(),xx=clientX-r.left-r.width/2,yy=clientY-r.top-r.height/2,z=worldMap.zoom;
 return {lat:Math.max(-84.9,Math.min(84.9,invMercY(mercY(worldMap.lat,z)+yy,z))),lon:Math.max(-179.99,Math.min(179.99,invMercX(mercX(worldMap.lon,z)+xx,z)))};}
function pickMapLocation(lat,lon,name='Выбранная точка',zoom=null){
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 worldMap.lat=lat;worldMap.lon=lon;worldMap.selected={lat,lon};worldMap.name=name;
 if(zoom!==null)worldMap.zoom=zoom;
 $('latitude').value=lat.toFixed(5);$('longitude').value=lon.toFixed(5);
 $('chosenPlace').textContent='📍 '+name;
 $('mapNote').textContent=`${lat.toFixed(5)}, ${lon.toFixed(5)} · Нажми «Загрузить район»`;
 requestMapDraw();
}
function loadTile(x,y,z){const max=2**z;
 if(x<0||x>=max||y<0||y>=max)return null;
 const key=`${z}/${x}/${y}`;
 if(worldMap.tiles.has(key))return worldMap.tiles.get(key);
 if(worldMap.queued.size>=18)return null;
 const img=new Image();const tile={img,done:false,failed:false};worldMap.tiles.set(key,tile);worldMap.queued.add(key);
 img.onload=()=>{tile.done=true;worldMap.queued.delete(key);requestMapDraw();};
 img.onerror=()=>{tile.failed=true;worldMap.queued.delete(key);requestMapDraw();};
 img.referrerPolicy='strict-origin-when-cross-origin';img.src=`https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
 if(worldMap.tiles.size>110){for(const k of worldMap.tiles.keys()){if(worldMap.tiles.size<=85)break;if(!worldMap.queued.has(k))worldMap.tiles.delete(k);}}
 return tile;
}
function renderWorldMap(){
 if($('mapPanel').hidden)return;const w=mapCanvas.clientWidth,h=mapCanvas.clientHeight,z=worldMap.zoom;
 mapCtx.fillStyle='#b3c6bb';mapCtx.fillRect(0,0,w,h);
 const cx=mercX(worldMap.lon,z),cy=mercY(worldMap.lat,z),ox=cx-w/2,oy=cy-h/2;
 const minX=Math.floor(ox/256),maxX=Math.floor((ox+w)/256);
 const minY=Math.floor(oy/256),maxY=Math.floor((oy+h)/256);
 let painted=0;
 for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++){
  const sx=x*256-ox,sy=y*256-oy,t=loadTile(x,y,z);
  if(t?.done){mapCtx.drawImage(t.img,sx,sy,256,256);painted++;}
  else{mapCtx.fillStyle=(x+y)%2?'#bacabb':'#bdc9b2';mapCtx.fillRect(sx,sy,256,256);
   mapCtx.strokeStyle='#a0b4a7';mapCtx.strokeRect(sx,sy,256,256);
   mapCtx.fillStyle='#6c8076';mapCtx.font='12px system-ui';mapCtx.fillText('OSM '+z+'/'+x+'/'+y,sx+20,sy+29);}
 }
 const px=mercX(worldMap.selected.lon,z)-ox,py=mercY(worldMap.selected.lat,z)-oy;
 if(px>=-15&&px<=w+15&&py>=-15&&py<=h+15){
  mapCtx.beginPath();mapCtx.arc(px,py,11,0,Math.PI*2);mapCtx.fillStyle='#764ff0';mapCtx.fill();
  mapCtx.lineWidth=3;mapCtx.strokeStyle='#fff';mapCtx.stroke();
  mapCtx.beginPath();mapCtx.arc(px,py,3,0,Math.PI*2);mapCtx.fillStyle='#fff';mapCtx.fill();
 }
 if(!painted){mapCtx.fillStyle='#152543d1';mapCtx.fillRect(9,10,Math.min(315,w-18),42);
  mapCtx.fillStyle='#fff';mapCtx.font='12px system-ui';mapCtx.fillText('Картографические тайлы загружаются…',18,26);
  mapCtx.fillText('Точку можно выбрать и без них',18,41);}
}
function zoomWorldMap(delta){const newZoom=Math.max(3,Math.min(18,worldMap.zoom+delta));worldMap.zoom=newZoom;requestMapDraw();}
let mapMoved=false;
mapCanvas.addEventListener('pointerdown',e=>{
 mapCanvas.setPointerCapture?.(e.pointerId);worldMap.drag={x:e.clientX,y:e.clientY};mapMoved=false;
});
mapCanvas.addEventListener('pointermove',e=>{if(!worldMap.drag)return;const dx=e.clientX-worldMap.drag.x,dy=e.clientY-worldMap.drag.y;
 if(Math.abs(dx)+Math.abs(dy)>3)mapMoved=true;
 if(mapMoved){panMap(dx,dy);worldMap.drag={x:e.clientX,y:e.clientY};}
});
mapCanvas.addEventListener('pointerup',e=>{
 if(!mapMoved){const p=mapCoordinates(e.clientX,e.clientY);pickMapLocation(p.lat,p.lon,'Точка на карте');}
 worldMap.drag=null;
});
mapCanvas.addEventListener('pointercancel',()=>worldMap.drag=null);
mapCanvas.addEventListener('wheel',e=>{e.preventDefault();zoomWorldMap(e.deltaY<0?1:-1);},{passive:false});
$('mapZoomIn').onclick=()=>zoomWorldMap(1);$('mapZoomOut').onclick=()=>zoomWorldMap(-1);
// Two finger gestures on iOS / mobile: reserve one touch to pan, two to zoom.
mapCanvas.addEventListener('touchmove',e=>{if(e.touches.length===2){
 e.preventDefault();const dx=e.touches[0].clientX-e.touches[1].clientX,dy=e.touches[0].clientY-e.touches[1].clientY;
 const dist=Math.hypot(dx,dy);if(worldMap.pinch&&Math.abs(dist/worldMap.pinch-1)>.22){zoomWorldMap(dist>worldMap.pinch?1:-1);worldMap.pinch=dist;}
 else if(!worldMap.pinch)worldMap.pinch=dist;
}},{passive:false});
mapCanvas.addEventListener('touchend',e=>{if(e.touches.length<2)worldMap.pinch=0;});
function openCityMap(){if(groupMode)$('mapNote').textContent='В групповой поездке смена места недоступна: локация общая для всех.';
 $('mapPanel').hidden=false;worldMap.lat=center.lat;worldMap.lon=center.lon;worldMap.selected={...center};
 resizeWorldMap();}
function closeCityMap(){$('mapPanel').hidden=true;}
window.addEventListener('resize',resizeWorldMap);
// Geocoding runs only on deliberate search, no auto-address probing.
$('searchCity').addEventListener('submit',async e=>{
 e.preventDefault();const search=$('citySearchInput');const q=search.value.trim().slice(0,90);
 if(q.length<3){$('searchFeedback').textContent='Введи название города или улицы (не менее 3 символов).';return;}
 const b=$('searchSubmit');b.disabled=true;$('searchFeedback').textContent='Ищу…';
 try{
  const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),8500);
  let resp;
  try{resp=await fetch('https://photon.komoot.io/api/?q='+encodeURIComponent(q)+'&limit=6&lang=ru',{signal:ctl.signal});}
  finally{clearTimeout(timeout);}
  if(!resp.ok)throw Error('Поиск временно недоступен');
  const json=await resp.json();const list=(json.features||[]).filter(x=>x.geometry?.coordinates?.length===2);
  const output=$('searchResults');output.textContent='';
  if(!list.length){$('searchFeedback').textContent='Не найдено. Выбери точку на карте.';return;}
  for(const place of list){const [lon,lat]=place.geometry.coordinates;
   const name=[place.properties?.name,place.properties?.city,place.properties?.state,place.properties?.country].filter(Boolean).filter((t,i,a)=>a.indexOf(t)===i).join(', ');
   const btn=document.createElement('button');btn.type='button';btn.className='search-place';btn.textContent='📍 '+name;
   btn.addEventListener('click',()=>{pickMapLocation(lat,lon,name,14);output.textContent='';$('searchFeedback').textContent='Точка выбрана';});output.append(btn);
  }
  $('searchFeedback').textContent='Выбери один из результатов:';
 }catch(err){$('searchFeedback').textContent='Не удалось выполнить поиск. Карта и координаты доступны без поиска.';}
 finally{b.disabled=false;}
});
$('startGame').addEventListener('click',start);
$('choosePlace').onclick=()=>openCityMap();
$('openMap').onclick=()=>openCityMap();
$('closeMap').onclick=()=>closeCityMap();
for(const b of document.querySelectorAll('[data-place]'))b.onclick=()=>{
 const [lat,lon]=b.dataset.place.split(',').map(Number);
 pickMapLocation(lat,lon,b.textContent.trim(),12);
};
$('loadMap').onclick=async()=>{
 try{
  if(groupMode)throw Error('В групповой поездке карта общая. Для смены места запусти новую комнату.');
  center=fitNumbers();closeCityMap();createFallback(Math.round(center.lat*1000+center.lon*100));assignStart();
  fetchOSM().catch(e=>status(e.message));
  if(!playing)$('startNotice').textContent='Выбрано место: '+center.lat.toFixed(5)+', '+center.lon.toFixed(5);
 }catch(e){$('mapNote').textContent=String(e.message||e);}
};
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
createFallback();assignStart();resize();requestAnimationFrame(loop);$('worldCounter').textContent=`🏘 Пример · ${buildings.length} домов`;
if(!groupMode)status('Готов к поездке · выбери город или начни в демо-районе');
else if(!roomId){$('startNotice').textContent='Открой групповой чат и отправь /group, чтобы создать приглашение.';}
