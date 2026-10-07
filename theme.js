export const defaultColors={accent:'#9478ff',background:'#0d111b',incoming:'#1c2232',outgoing:'#493776'};
export function validColors(value){return value&&Object.keys(defaultColors).every(k=>/^#[0-9a-f]{6}$/i.test(value[k]));}
const rgb=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16));
const hex=values=>'#'+values.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
function mix(a,b,weight){const x=rgb(a),y=rgb(b);return hex(x.map((v,i)=>v*(1-weight)+y[i]*weight));}
function luminance(color){const c=rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
export function ink(color){return luminance(color)>.179?'#111827':'#ffffff';}
const properties=['bg','rail','panel','pane','surface','hover','line','text','muted','subtle','accent','mint','incoming','outgoing','incoming-text','outgoing-text','on-accent'];
export function applyColors(colors){
  const root=document.documentElement;
  for(const key of properties)root.style.removeProperty('--'+key);
  delete root.dataset.customColors;
  if(!validColors(colors))return;
  root.dataset.customColors='true';
  const text=ink(colors.background),values={bg:colors.background,pane:colors.background,rail:mix(colors.background,text,.025),panel:mix(colors.background,text,.035),surface:mix(colors.background,text,.07),hover:mix(colors.background,text,.12),line:mix(colors.background,text,.14),text,muted:mix(colors.background,text,.7),subtle:mix(colors.background,text,.58),accent:colors.accent,mint:mix(colors.accent,text,.25),incoming:colors.incoming,outgoing:colors.outgoing,'incoming-text':ink(colors.incoming),'outgoing-text':ink(colors.outgoing),'on-accent':ink(colors.accent)};
  for(const [key,value]of Object.entries(values))root.style.setProperty('--'+key,value);
}
