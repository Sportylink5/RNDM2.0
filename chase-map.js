/* The original user's forest corridor map is expanded fourfold in area. */
export const ORIGINAL = [
'000000000000000000000000000000000000000000000',
'000000000000000000000000000000000000000000000',
'001111100000000000000000000000000000000000000',
'001111111001111111111111111111111111111110000',
'001111111001111111111111111111111111111110000',
'001111111001100000000000000110011000000110000',
'001111111001101111000000000110011000000110000',
'000110011111111111011111111111111001111110000',
'000110011111111111011111111111111001111110000',
'000110011001101111011000000110011001100110000',
'000110011001100110011000000110011011110110000',
'000110011001100111111111100111111111110110000',
'000110011001100111111111100111111111110110000',
'000110011000000110011000000110000011110110000',
'000110011000000110011000000110000000000110000',
'000110011111111110011111111111111001111110000',
'000110011111111110011111111111111001111110000',
'000110011001100110011001100110011001100000000',
'000110011001100110011011110110011001100000000',
'000111111111100111111111110110011001111110000',
'000111111111100111111111110110011001111110000',
'000110011001100110000011110110011001100110000',
'000110011001100110000001101111011001100110000',
'000110011111111111111111111111111001111110000',
'000110011111111111111111111111111001111110000',
'000000000000000000000000001111000000000000000',
'000000000000000000000000000000000000000000000'
];
export const W = 116;
export const H = 80;
const floor = Array.from({length:H},()=>Array(W).fill(0));
const carve = (x,y,w=1,h=1) => { for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++) if(xx>1 && xx<W-2 && yy>1 && yy<H-2) floor[yy][xx]=1; };
// Preserve the map layout and make its corridors wider by a factor of two.
for(let y=0;y<ORIGINAL.length;y++)for(let x=0;x<ORIGINAL[y].length;x++)if(ORIGINAL[y][x]==='1')carve(12+x*2,12+y*2,2,2);
// The new outer forest ring adds a circuit, crosscuts and side paths.
carve(5,5,106,3); carve(5,71,106,3); carve(5,5,3,69); carve(108,5,3,69);
carve(27,5,3,13); carve(70,5,3,15); carve(97,5,3,16);
carve(27,63,3,11); carve(70,61,3,13); carve(95,59,3,15);
carve(5,20,14,3); carve(5,42,18,3); carve(5,58,18,3);
carve(97,23,14,3); carve(96,45,15,3); carve(97,61,14,3);
carve(7,32,18,3); carve(93,34,17,3);
// Corridors crossing the extension: links create multiple alternative routes.
carve(18,7,3,22); carve(95,7,3,21); carve(18,55,3,18); carve(95,56,3,17);
carve(7,32,21,3); carve(92,34,19,3); carve(7,55,20,3); carve(92,57,19,3);
// Additional forest clearings / open arenas make tag gameplay more exciting.
[[24,17,10,7],[46,22,10,8],[75,24,10,9],[40,44,9,8],[69,45,11,8],[19,56,9,6],[88,55,11,6],[53,58,8,6]].forEach(a=>carve(...a));
// Connect each clearing into neighboring existing paths without cutting off the original maze.
const seeds=[[21,19],[30,18],[52,22],[78,22],[44,47],[73,48],[24,60],[93,57],[56,61]];
seeds.forEach(([x,y],i)=>{carve(x,y,3,3);if(i%2)carve(x-3,y,7,2);else carve(x,y-2,2,8);});
export const MAP = floor;
export const isPath = (x,y) => floor[Math.floor(y)]?.[Math.floor(x)] === 1;
export function canStand(x,y,r=.29){return [[-r,-r],[-r,r],[r,-r],[r,r]].every(([dx,dy])=>isPath(x+dx,y+dy));}
export function randomSpawn(index=0){
 const options=[[19,17],[29,18],[53,25],[78,27],[43,47],[75,47],[25,58],[90,57],[55,62]];
 const [x,y]=options[index%options.length];
 if(canStand(x+.5,y+.5))return {x:x+.5,y:y+.5};
 for(let d=0;d<20;d++)for(let dy=-d;dy<=d;dy++)for(let dx=-d;dx<=d;dx++)if(canStand(x+dx+.5,y+dy+.5))return {x:x+dx+.5,y:y+dy+.5};
 return {x:19.5,y:17.5};
}
// Cached, device-independent map drawing.
export function paintTerrain(ctx,scale,ox,oy,viewW,viewH){
 const x0=Math.max(0,Math.floor(ox/scale)-1),x1=Math.min(W,Math.ceil((ox+viewW)/scale)+1);
 const y0=Math.max(0,Math.floor(oy/scale)-1),y1=Math.min(H,Math.ceil((oy+viewH)/scale)+1);
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   let px=x*scale-ox,py=y*scale-oy;
   if(MAP[y][x]){
     ctx.fillStyle=((x*13+y*7)%11<2)?'#ddd5bc':'#e6dfca';ctx.fillRect(px,py,Math.ceil(scale+.5),Math.ceil(scale+.5));
     if(scale>=18 && (x*17+y*23)%7===0){ctx.fillStyle='#c9bfa4';ctx.fillRect(px+scale*.25,py+scale*.68,scale*.08,scale*.08);}
   }else{
     ctx.fillStyle=(x*37+y*47)%7<2?'#246b3e':'#2d7c43';ctx.fillRect(px,py,Math.ceil(scale+.5),Math.ceil(scale+.5));
     if(scale>=15){
       ctx.fillStyle=(x*29+y*19)%4===0?'#55a555':'#3c9350';
       ctx.beginPath();ctx.arc(px+scale*.46,py+scale*.52,scale*.31,0,Math.PI*2);ctx.fill();
       ctx.fillStyle='#215e37';ctx.beginPath();ctx.arc(px+scale*.7,py+scale*.32,scale*.18,0,Math.PI*2);ctx.fill();
     }
   }
 }
}
