import {LIMIT,MODES,cleanInput,newRound,addPlayer,stepWorld} from './arcade-engine.js?v=70.0.0';
export const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function roomCode(){const bytes=crypto.getRandomValues(new Uint8Array(10));return [...bytes].map(n=>CODE_ALPHABET[n%32]).join('');}
export function normalizeCode(value){return String(value||'').toUpperCase().replace(/[\s-]/g,'');}
export function validCode(value){return /^[A-HJ-NP-Z2-9]{10}$/.test(value);}
// Public invitation rooms carry only nicknames, controls, and temporary match state.
// No message, profile, economy, SQL, or Together tables are read or changed.
export class ArcadeRoom{
 constructor(sb,{onChange=()=>{},onError=()=>{}}={}){this.sb=sb;this.onChange=onChange;this.onError=onError;this.id=[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');this.members=[];this.inputs={};this.sequences={};this.seq=0;this.world=null;this.connected=false;this.disposed=false;this.netState='Подключение…';this.localInput=cleanInput();}
 get isHost(){return this.host===this.id;}
 async connect(kind,code,name,create=false){if(!MODES[kind]||!validCode(code))throw Error('Код комнаты: 10 латинских букв и цифр.');this.kind=kind;this.code=code;this.create=create;this.member={id:this.id,name:String(name||'Игрок').replace(/[<>\u0000-\u001f]/g,'').slice(0,28),joined:Date.now(),creator:create};
  const channel=this.sb.channel(`rndm-arcade-v70:${kind}:${code}`,{config:{presence:{key:this.id},broadcast:{self:false,ack:false}}});this.channel=channel;
  return new Promise((resolve,reject)=>{let settled=false;const ready=()=>{if(settled)return;settled=true;clearTimeout(this.timeout);resolve(this);};const fail=error=>{if(settled){this.onError(error);return;}settled=true;clearTimeout(this.timeout);this.close();reject(error);};this.fail=fail;this.ready=ready;this.cancelConnect=()=>{if(!settled){settled=true;reject(Error('Подключение отменено.'));}};
   this.timeout=setTimeout(()=>fail(Error(create?'Сервер игр не ответил. Проверь соединение и доступность Realtime.':'Комната не найдена. Проверь игру, код и попроси создателя оставить комнату открытой.')),12000);
   channel.on('presence',{event:'sync'},()=>this.syncPresence());
   channel.on('broadcast',{event:'packet'},({payload})=>this.receive(payload));
   channel.subscribe(async status=>{if(this.disposed)return;if(status==='SUBSCRIBED'){this.connected=true;this.netState='В сети';const result=await channel.track(this.member).catch(()=> 'error');if(result!=='ok'){fail(Error('Не удалось зарегистрировать игрока в комнате.'));return;}if(this.disposed)return;this.loop||=setInterval(()=>this.tick(),33);this.send('hello',{});this.onChange(this);}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){this.connected=false;this.netState='Соединение потеряно · повторное подключение';this.localInput=cleanInput();this.onChange(this);if(!settled)fail(Error('Не удалось подключиться к онлайн-комнате. Проверь интернет и Realtime.'));}});
  });
 }
 syncPresence(){if(this.disposed)return;const all=Object.values(this.channel.presenceState()).flat().filter(p=>typeof p.id==='string'&&p.id.length<80&&Number.isFinite(p.joined)).map(p=>({id:p.id,name:String(p.name||'Игрок').slice(0,28),joined:p.joined,creator:p.creator===true}));this.members=[...new Map(all.map(m=>[m.id,m])).values()].sort((a,b)=>Number(b.creator)-Number(a.creator)||a.joined-b.joined||a.id.localeCompare(b.id));
  if(!this.members.some(m=>m.id===this.id))return;if(this.members.findIndex(m=>m.id===this.id)>=LIMIT){this.fail(Error('Комната заполнена: максимум 8 игроков.'));this.close();return;}this.members=this.members.slice(0,LIMIT);
  if(!this.create&&!this.hasPeer&&this.members.length<2)return;this.hasPeer||=this.members.some(m=>m.id!==this.id);const oldHost=this.host;this.host=this.members[0]?.id;
  if(this.isHost&&this.world){const ids=new Set(this.members.map(m=>m.id));for(const id of Object.keys(this.world.players))if(!ids.has(id)&&!this.world.players[id].bot)delete this.world.players[id];for(const m of this.members)if(this.kind==='fps'&&this.world.status==='playing')addPlayer(this.world,m);}
  for(const id of Object.keys(this.inputs))if(!this.members.some(m=>m.id===id)){delete this.inputs[id];delete this.sequences[id];}
  if(oldHost!==this.host){this.sequence=0;this.lastSnapshot=0;this.accum=0;this.netState='В сети';if(this.isHost){this.world&&this.world.status==='playing'&&(this.world.events=[]);this.send('snapshot',{world:this.world,sequence:++this.sequence});}}
  this.ready();this.send('hello',{});this.onChange(this);
 }
 send(type,data){if(!this.connected||this.disposed)return;this.channel.send({type:'broadcast',event:'packet',payload:{v:70,type,id:this.id,...data}}).then(result=>{if(result==='timed out'||result==='error'){this.netState='Задержка сети';this.onChange(this);}}).catch(()=>{});}
 receive(p){if(this.disposed||p?.v!==70||!this.members.some(m=>m.id===p.id))return;
  if(p.type==='input'&&this.isHost&&Number.isSafeInteger(p.seq)&&p.seq>(this.sequences[p.id]||0)){this.sequences[p.id]=p.seq;const v=cleanInput(p.input);v.look= Math.max(-1.2,Math.min(1.2,(this.inputs[p.id]?.look||0)+v.look));v.at=performance.now();this.inputs[p.id]=v;}
  if(p.type==='snapshot'&&p.id===this.host&&!this.isHost&&Number.isSafeInteger(p.sequence)&&p.sequence>(this.lastSnapshot||0)){const w=p.world;if(w!==null&&(!w||w.kind!==this.kind||!['countdown','playing','finished'].includes(w.status)||!w.players||Object.keys(w.players).length>LIMIT||!Number.isFinite(w.elapsed)||!Object.values(w.players).every(x=>x&&typeof x.id==='string'&&Number.isFinite(x.x)&&Number.isFinite(x.y)&&Math.abs(x.x)<1000&&Math.abs(x.y)<1000&&Number.isFinite(x.a))))return;this.lastSnapshot=p.sequence;this.world=w;this.receivedAt=performance.now();this.netState='В сети';this.onChange(this);}
  if(p.type==='hello'&&this.isHost)this.send('snapshot',{world:this.world,sequence:++this.sequence});
 }
 setInput(raw){const v=cleanInput(raw);v.look=Math.max(-1.2,Math.min(1.2,(this.localInput.look||0)+v.look));this.localInput=v;}
 start(options={}){if(!this.isHost||!this.connected)throw Error('Матч запускает ведущий комнаты.');if(this.members.length<2&&!(this.kind==='race'&&Number(options.bots)>0))throw Error('Нужно два игрока или хотя бы один бот.');if(this.world&&this.world.status!=='finished')throw Error('Матч уже идёт.');this.options=this.kind==='race'?{track:options.track,difficulty:options.difficulty,bots:Math.min(7,Math.max(0,Number(options.bots)||0))}:{};this.world=newRound(this.kind,this.members,(this.world?.round||0)+1,this.options||{});this.sequence||=0;this.inputs={};this.send('snapshot',{world:this.world,sequence:++this.sequence});this.onChange(this);}
 tick(){if(!this.connected||this.disposed||!this.host)return;const now=performance.now(),dt=Math.min(.085,(now-(this.lastTick||now))/1000);this.lastTick=now;
  if(now-(this.lastSend||0)>66){const input={...this.localInput};this.localInput.look=0;this.lastSend=now;if(this.isHost){input.look+=(this.inputs[this.id]?.look||0);input.at=now;this.inputs[this.id]=input;}else this.send('input',{seq:++this.seq,input});}
  if(this.isHost){for(const [id,input]of Object.entries(this.inputs))if(now-input.at>500)this.inputs[id]=cleanInput();if(this.world){this.accum=Math.min(.12,(this.accum||0)+dt);let loops=0;while(this.accum>=1/60&&loops++<7){stepWorld(this.world,this.inputs,1/60);this.accum-=1/60;}}if(now-(this.lastBroadcast||0)>110){this.lastBroadcast=now;this.send('snapshot',{world:this.world,sequence:++this.sequence});this.onChange(this);}}
  else if(this.receivedAt&&now-this.receivedAt>3000&&this.netState==='В сети'){this.netState='Ожидаем ведущего…';this.onChange(this);}
 }
 close(){if(this.disposed)return;this.disposed=true;this.cancelConnect?.();this.connected=false;clearTimeout(this.timeout);clearInterval(this.loop);this.localInput=cleanInput();if(this.channel){this.sb.removeChannel(this.channel).catch(()=>{});this.channel=null;}this.members=[];}
}
