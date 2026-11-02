import {W,H,MAP,isPath,canStand,randomSpawn,paintTerrain} from './chase-map.js?v=74.0.0';

const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'),ctx=canvas.getContext('2d'),mini=$('miniCanvas'),mc=mini.getContext('2d');
const cfg=window.RNDM_CONFIG||{url:'https://rijqlmrcnshswtoweoai.supabase.co',key:'sb_publishable_Ay6EBRfZx1-Shj1FdMg7ZQ_P61Rii2A'};
const client=window.supabase?.createClient?.(cfg.url,cfg.key,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
});
const state={selectedFriends:new Set(),boost:1.65,duration:240,first:'random',user:null,room:null,roster:[],friends:[],invites:[],players:new Map(),it:null,inputs:new Map(),channel:null,online:false,mode:'idle',isHost:false,remaining:240,elapsed:0,grace:2,sendTimer:0,snapTimer:0,roomCheck:0,inviteCheck:0,lastHost:0,demoBotClock:0,finished:false};
const keyDown=new Set();
if(new URLSearchParams(location.search).has('embed'))document.documentElement.classList.add('embedded');
const touch={dx:0,dy:0,sprint:false,pointer:null,boostPointer:null};
const avatarCache=new Map();
function getAvatar(userId){
 const person=state.roster.find(p=>p.id===userId);
 const url=person?.avatar;
 if(!url || !/^(?:https?:\/\/|data:image\/(?:png|jpeg|webp|gif);base64,)/i.test(url))return null;
 const cached=avatarCache.get(userId);
 if(cached?.url===url)return cached.image;
 const image=new Image();image.referrerPolicy='no-referrer';image.decoding='async';image.src=url;
 avatarCache.set(userId,{url,image});
 if(avatarCache.size>32){const first=avatarCache.keys().next().value;avatarCache.delete(first)}
 return image;
}
let last=0,viewW=800,viewH=560,dpr=1,camera={x:20,y:20};
const COLORS=['#93eea4','#93c9ff','#f9c778','#dcadff','#ffa0bf','#a4ffef','#e5ff98','#ffad86'];
const ids=()=>[...state.players.keys()];
function notice(msg,error=false){$('notice').textContent=msg;$('notice').classList.toggle('error',error);}
function show(id,on){$(id).classList.toggle('hidden',!on);}
function setConnection(s){$('connection').textContent=s;}
function settingsFromForm(){return {duration:Number($('durationSetting').value)||240,boost:Number($('boostSetting').value)||1.65,first:$('firstSetting').value||'random'};}
function labelSettings(s){const m=Math.round((Number(s?.duration)||240)/60),b=Number(s?.boost)||1.65;return `${m} мин · Бег ×${b.toFixed(2)} · ${s?.first==='host'?'водит создатель':'водящий случайный'}`;}
function showSetup(enabled){show('setupSection',enabled);}
function cleanName(name){return String(name||'Игрок').slice(0,36);}
function profileName(id){return cleanName(state.roster.find(p=>p.id===id)?.name||state.friends.find(p=>p.id===id)?.name||id?.slice(0,6));}
function avatarNode(person){const a=document.createElement('span');a.className='avatar';if(person?.avatar&&/^https?:\/\//.test(person.avatar)){const im=document.createElement('img');im.src=person.avatar;im.alt='';im.referrerPolicy='no-referrer';a.append(im)}else a.textContent=(person?.name||'И').charAt(0).toUpperCase();return a;}
function personRow(person,text,button,click,kind='friend'){
 const wrap=document.createElement('div');wrap.className=kind;wrap.append(avatarNode(person));
 const details=document.createElement('div');details.className='person-meta';const b=document.createElement('strong');b.textContent=person.name;const sub=document.createElement('small');sub.textContent=text;details.append(b,sub);wrap.append(details);
 if(button){const btn=document.createElement('button');btn.type='button';btn.textContent=button;btn.addEventListener('click',()=>click(btn));wrap.append(btn)}return wrap;
}
function getError(error){return (error?.message||String(error||'Неизвестная ошибка')).replace(/^(new row violates row-level security policy|permission denied).*/i,'Нет доступа к этой комнате');}
async function rpc(name,args={}){if(!client)throw new Error('Библиотека Supabase не загружена. Нужен интернет.');const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
async function fetchRows(table,columns,fn){let q=client.from(table).select(columns);q=fn?fn(q):q;const {data,error}=await q;if(error)throw error;return data||[];}
async function init(){
 bindUI();paintMiniBase();resize();requestAnimationFrame(loop);
 if(!client){setConnection('● Нет подключения');notice('Не удалось загрузить Supabase. Можно начать тренировку, а для онлайна нужен доступ к сети.',true);return;}
 try{
  const {data:{session},error}=await client.auth.getSession();if(error)throw error;
  state.user=session?.user||null;
  if(!state.user){setConnection('● Войти в RNDM');notice('Войди в тот же аккаунт RNDM, в котором у тебя есть друзья. После входа обнови страницу игры.');return;}
  setConnection('● Аккаунт подключён');notice('Выбери длительность и ускорение, затем создай лобби.');
  try{const rows=await fetchRows('profiles','id,display_name,username,avatar_url',q=>q.eq('id',state.user.id).limit(1));state.meProfile=rows[0]||null;}catch(e){console.warn('Profile avatar not available',e)}
  await loadInvites();
  const invite=new URLSearchParams(location.search).get('invite');
  if(invite&&state.invites.some(i=>i.id===invite)){const i=state.invites.find(v=>v.id===invite);notice(`Тебя пригласили в комнату. Нажми «Принять» ниже.`);}
 }catch(e){setConnection('● Ошибка доступа');notice('Не удалось получить RNDM-сессию: '+getError(e),true)}
}
function bindUI(){
 $('createBtn').addEventListener('click',async()=>{
   if(!state.user){notice('Сначала войди в RNDM Chat, затем открой догонялки.',true);return}
   const b=$('createBtn');b.disabled=true;b.textContent='Создаём лобби…';
   try{await stopRoom();const p=settingsFromForm();const id=await rpc('chase_create_room_config',{p_duration:p.duration,p_boost:p.boost,p_first:p.first});await openRoom(id);notice('Лобби создано! Выбери друзей ниже, отправь приглашения и нажми «Запустить матч».')}catch(e){notice('Не удалось создать лобби: '+getError(e),true)}finally{b.disabled=false;b.textContent='＋ Создать лобби'}
 });
 $('demoBtn').addEventListener('click',async()=>{await stopRoom();startDemo();document.querySelector('.app').classList.remove('show-menu')});
 $('refreshInvites').addEventListener('click',loadInvites);
 $('refreshFriends').addEventListener('click',loadFriends);
 $('inviteSelected').addEventListener('click',sendSelectedInvites);
 $('friendSearch').addEventListener('input',renderFriends);
 $('startBtn').addEventListener('click',async()=>{
  if(!state.room||!state.isHost)return;
  try{await rpc('chase_start_room',{p_room:state.room.id});await refreshRoom();notice('Матч начался! Догоняйте друг друга.');document.querySelector('.app').classList.remove('show-menu')}catch(e){notice(getError(e),true)}
 });
 $('leaveBtn').addEventListener('click',async()=>{try{await stopRoom();notice('Ты вышел из комнаты.')}catch(e){notice(getError(e),true)}});
 $('toggleSidebar').addEventListener('click',()=>document.querySelector('.app').classList.toggle('show-menu'));
 window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(key)&& !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){keyDown.add(key);e.preventDefault()}
 });
 window.addEventListener('keyup',e=>keyDown.delete(e.key.toLowerCase()));
 window.addEventListener('blur',clearInputs);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInputs()});
 window.addEventListener('resize',resize);
 const joy=$('joystick'),head=$('joyHead'),sprint=$('touchSprint');
 const releaseJoy=e=>{if(e?.pointerId!==undefined&&e.pointerId!==touch.pointer)return;touch.pointer=null;touch.dx=0;touch.dy=0;head.style.transform='translate3d(0,0,0)';joy.classList.remove('active')};
 function touchMove(e){if(touch.pointer!==e.pointerId)return;const rect=joy.getBoundingClientRect(),radius=Math.min(rect.width,rect.height)*.37;
  let dx=(e.clientX-rect.left-rect.width/2)/radius,dy=(e.clientY-rect.top-rect.height/2)/radius;
  const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len}
  const dead=.12,mag=Math.hypot(dx,dy),speed=mag<dead?0:Math.min(1,(mag-dead)/(1-dead));
  touch.dx=mag?dx/mag*speed:0;touch.dy=mag?dy/mag*speed;
  head.style.transform=`translate3d(${dx*radius}px,${dy*radius}px,0)`;e.preventDefault();
 }
 joy.addEventListener('pointerdown',e=>{if(touch.pointer!==null)return;touch.pointer=e.pointerId;joy.setPointerCapture(e.pointerId);joy.classList.add('active');touchMove(e);e.preventDefault()});
 joy.addEventListener('pointermove',touchMove);
 for(const t of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(t,releaseJoy);
 const releaseSprint=e=>{if(e?.pointerId!==undefined&&e.pointerId!==touch.boostPointer)return;touch.boostPointer=null;touch.sprint=false;sprint.classList.remove('pressed')};
 sprint.addEventListener('pointerdown',e=>{if(touch.boostPointer!==null)return;touch.boostPointer=e.pointerId;sprint.setPointerCapture(e.pointerId);touch.sprint=true;sprint.classList.add('pressed');e.preventDefault()});
 for(const t of ['pointerup','pointercancel','lostpointercapture'])sprint.addEventListener(t,releaseSprint);
 $('menuBackdrop').addEventListener('click',()=>document.querySelector('.app').classList.remove('show-menu'));
 if(matchMedia('(max-width:740px)').matches)document.querySelector('.app').classList.add('show-menu');
}
function clearInputs(){keyDown.clear();touch.dx=0;touch.dy=0;touch.sprint=false;touch.pointer=null;touch.boostPointer=null;$('joyHead').style.transform='translate3d(0,0,0)';$('joystick').classList.remove('active');$('touchSprint').classList.remove('pressed')}
async function loadFriends(){
 if(!state.user)return;
 try{
 const me=state.user.id;
 const fr=await fetchRows('friendships','requester,addressee,status',q=>q.eq('status','accepted').or(`requester.eq.${me},addressee.eq.${me}`));
 const friendIds=[...new Set(fr.map(f=>f.requester===me?f.addressee:f.requester))].filter(x=>x!==me);
 if(!friendIds.length){state.friends=[];state.friendLoadedAt=state.room?.id;renderFriends();return}
 const profiles=await fetchRows('profiles','id,display_name,username,avatar_url',q=>q.in('id',friendIds));
 state.friendLoadedAt=state.room?.id;state.friends=profiles.map(p=>({id:p.id,name:cleanName(p.display_name||p.username),avatar:p.avatar_url}));renderFriends();
 }catch(e){notice('Не удалось загрузить друзей: '+getError(e),true)}
}
function renderFriends(){
 const list=$('friendList');list.replaceChildren();if(!state.friends.length){const p=document.createElement('p');p.className='empty';p.textContent='Пока нет подтверждённых друзей в RNDM. Добавь друзей в мессенджере.';list.append(p);updateSelection();return}
 const query=$('friendSearch').value.toLocaleLowerCase('ru');let shown=0;
 for(const p of state.friends){if(!p.name.toLocaleLowerCase('ru').includes(query))continue;shown++;
  const inRoom=state.roster.some(x=>x.id===p.id);const invited=state.invites.some(x=>x.recipient_id===p.id&&x.room_id===state.room?.id&&x.status==='pending');
  const row=personRow(p,inRoom?'Уже в лобби':invited?'Приглашение отправлено':'Друг RNDM',null,null,'friend');
  const check=document.createElement('input');check.type='checkbox';check.className='friend-select';check.setAttribute('aria-label','Пригласить '+p.name);check.checked=state.selectedFriends.has(p.id)||inRoom||invited;check.disabled=inRoom||invited;
  check.addEventListener('change',()=>{if(check.checked){if(state.selectedFriends.size<7)state.selectedFriends.add(p.id);else{check.checked=false;notice('Можно пригласить максимум 7 друзей',true)}}else state.selectedFriends.delete(p.id);updateSelection()});
  row.append(check);list.append(row);
 }
 if(!shown){const p=document.createElement('p');p.className='empty';p.textContent='Никого не найдено.';list.append(p)}
 updateSelection();
}
function updateSelection(){
 const b=$('inviteSelected');if(!b)return;
 const n=state.selectedFriends.size;b.disabled=!n||!state.room||!state.isHost;b.textContent=n?`💌 Пригласить выбранных (${n})`:'💌 Выбери друзей';
}
async function sendSelectedInvites(){
 if(!state.isHost||!state.room||!state.selectedFriends.size)return;
 const btn=$('inviteSelected');btn.disabled=true;let ok=0,errors=[];
 const people=[...state.selectedFriends];
 for(const id of people){try{await rpc('chase_invite',{p_room:state.room.id,p_friend:id});ok++;state.selectedFriends.delete(id)}catch(e){errors.push(profileName(id)+': '+getError(e))}}
 await loadInvites();renderFriends();notice(errors.length?`Отправлено: ${ok}. Ошибки: ${errors.join('; ')}`:`Отправлено ${ok} приглашений. Ожидаем друзей!`,!!errors.length);
}
async function loadInvites(){
 if(!state.user)return;
 try{
 const data=await fetchRows('rndm_chase_invites','id,room_id,sender_id,recipient_id,status,created_at',q=>q.or(`recipient_id.eq.${state.user.id},sender_id.eq.${state.user.id}`).order('created_at',{ascending:false}).limit(80));
 state.invites=data;
 const pending=data.filter(x=>x.recipient_id===state.user.id&&x.status==='pending');
 const root=$('inviteList');root.replaceChildren();
 if(pending.length){const senders=[...new Set(pending.map(x=>x.sender_id))];const profiles=await fetchRows('profiles','id,display_name,username,avatar_url',q=>q.in('id',senders));const byId=Object.fromEntries(profiles.map(p=>[p.id,{name:p.display_name||p.username,avatar:p.avatar_url}]));
 for(const inv of pending){const person=byId[inv.sender_id]||{name:'Друг RNDM'};const node=personRow(person,'Зовёт в догонялки',null,null,'invite');const actions=document.createElement('div');actions.className='invite-actions';
 const yes=document.createElement('button');yes.textContent='Принять';yes.addEventListener('click',async()=>{yes.disabled=true;try{await stopRoom();const id=await rpc('chase_respond_invite',{p_invite:inv.id,p_accept:true});await openRoom(id);notice('Ты присоединился к комнате!');await loadInvites()}catch(e){yes.disabled=false;notice(getError(e),true)}});
 const no=document.createElement('button');no.textContent='×';no.className='reject';no.title='Отклонить';no.addEventListener('click',async()=>{try{await rpc('chase_respond_invite',{p_invite:inv.id,p_accept:false});await loadInvites()}catch(e){notice(getError(e),true)}});
 actions.append(yes,no);node.append(actions);root.append(node)}
 }else{const p=document.createElement('p');p.className='empty';p.textContent='Новых приглашений нет.';root.append(p)}
 if(state.room&&state.isHost)renderFriends();
 }catch(e){notice('Не удалось обновить приглашения: '+getError(e),true)}
}
async function openRoom(roomId){
 if(!state.user)throw new Error('Для сетевой игры нужен аккаунт');
 state.mode='lobby';state.finished=false;state.room={id:roomId};state.isHost=false;state.players.clear();state.it=null;state.online=false;state.elapsed=0;state.remaining=240;
 showSetup(false);show('roomSection',true);show('friendsSection',false);state.selectedFriends.clear();
 await refreshRoom();
 if(!state.room||state.mode==='idle')return;
 await joinChannel(roomId);
 $('mapNotice').classList.remove('hidden');$('mapNotice').textContent='Ожидание начала матча…';
}
async function refreshRoom(){
 if(!state.room||!state.user)return;
 const id=state.room.id;
 const room=(await fetchRows('rndm_chase_rooms','id,host_id,status,started_at,ends_at,expires_at,settings',q=>q.eq('id',id).limit(1)))[0];
 if(!room||room.status==='finished'){
  const hadGame=state.mode==='playing';await stopRoom(true);notice(hadGame?'Матч завершён ведущим.':'Комната закрыта.',true);return;
 }
 state.room=room;state.isHost=room.host_id===state.user.id;state.boost=Number(room.settings?.boost)||1.65;state.duration=Number(room.settings?.duration)||240;state.first=room.settings?.first||'random';$('roomSettings').textContent=labelSettings(room.settings);$('timer').textContent=String(Math.floor(state.duration/60)).padStart(2,'0')+':00';
 const members=await fetchRows('rndm_chase_members','user_id,joined_at',q=>q.eq('room_id',id).order('joined_at'));
 const profileIds=members.map(m=>m.user_id);
 const profiles=profileIds.length?await fetchRows('profiles','id,display_name,username,avatar_url',q=>q.in('id',profileIds)):[];
 const byId=Object.fromEntries(profiles.map(p=>[p.id,p]));
 state.roster=members.map((m,i)=>({id:m.user_id,name:cleanName(byId[m.user_id]?.display_name||byId[m.user_id]?.username||'Игрок '+(i+1)),avatar:byId[m.user_id]?.avatar_url||null}));
 const roster=$('roster');roster.replaceChildren();state.roster.forEach(p=>{
  const member=personRow(p,p.id===room.host_id?'Ведущий': 'Участник',null,null,'member');if(p.id===state.it){member.classList.add('it');const tag=document.createElement('span');tag.className='role-tag';tag.textContent='ВОДИТ';member.append(tag)}roster.append(member);
 });
 $('count').textContent=`${state.roster.length}/8`;
 $('roomStatus').textContent=room.status==='waiting'?'Ждём друзей · минимум 2 участника для старта':'Матч идёт';
 show('friendsSection',state.isHost&&room.status==='waiting');
 $('startBtn').hidden=!state.isHost||room.status!=='waiting';$('startBtn').disabled=state.roster.length<2;$('startBtn').textContent=state.roster.length<2?'🔒 Ждём ещё одного игрока':'▶ Запустить матч';
 $('gameTitle').textContent=room.status==='waiting'?'Сбор игроков • Лесные догонялки':'Лесные догонялки • Онлайн';
 if(state.isHost&&room.status==='waiting'&&state.friendLoadedAt!==id){state.friendLoadedAt=id;await loadFriends()}
 if(room.status==='running'&&state.mode!=='playing'){startOnlineMatch()}
 if(room.status==='running'&&state.mode==='playing'){$('roleLabel').textContent=state.it===state.user.id?'Ты водишь!':'Убегай!'}
}
async function joinChannel(id){
 if(state.channel){await client.removeChannel(state.channel);state.channel=null}
 const token=(await client.auth.getSession()).data.session?.access_token;
 if(token&&client.realtime?.setAuth)await client.realtime.setAuth(token);
 const ch=client.channel('rndm-chase:'+id,{config:{private:true,broadcast:{ack:false,self:false},presence:{key:state.user.id}}});
 ch.on('broadcast',{event:'input'},({payload})=>{
  if(!state.isHost||state.mode!=='playing')return;
  if(!state.roster.some(p=>p.id===payload?.id)||payload.id===state.user.id)return;
  let dx=Number(payload.dx),dy=Number(payload.dy);
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
  let size=Math.hypot(dx,dy);if(size>1){dx/=size;dy/=size}
  state.inputs.set(payload.id,{dx,dy,sprint:!!payload.sprint,t:performance.now()});
 }).on('broadcast',{event:'snapshot'},({payload})=>{
  if(state.isHost||state.mode!=='playing'||!payload?.players)return;
  state.lastHost=performance.now();state.it=payload.it;state.remaining=Number(payload.remaining)||0;state.grace=Number(payload.grace)||0;
  for(const data of payload.players){if(!Array.isArray(data)||!state.roster.some(p=>p.id===data[0]))continue;
   const [id,x,y,energy,tags,itTime]=data;if(!Number.isFinite(x)||!Number.isFinite(y)||!canStand(x,y))continue;
   const old=state.players.get(id);if(old){old.tx=x;old.ty=y;old.energy=energy;old.tags=tags;old.itTime=itTime}else state.players.set(id,{id,x,y,tx:x,ty:y,energy,tags,itTime});
  }
 }).on('broadcast',{event:'request_state'},()=>{if(state.isHost&&state.mode==='playing')broadcastSnapshot()});
 state.channel=ch;
 ch.subscribe(async(status)=>{
  if(state.channel!==ch)return;
  state.online=status==='SUBSCRIBED';
  if(state.online){setConnection('● В комнате онлайн');await ch.track({id:state.user.id,name:profileName(state.user.id)});if(state.mode==='playing'&&!state.isHost)ch.send({type:'broadcast',event:'request_state',payload:{}})}
  else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){setConnection('● Переподключение');notice('Не удалось подключить комнату Realtime. Проверь подключение и права доступа.',true)}
 });
}
function startOnlineMatch(){state.mode='playing';state.finished=false;state.remaining=Math.max(0,(new Date(state.room.ends_at)-Date.now())/1000);state.elapsed=0;state.grace=2;state.lastHost=performance.now();$('mapNotice').classList.add('hidden');document.querySelector('.app').classList.remove('show-menu');
 if(state.isHost){state.players.clear();state.roster.forEach((p,i)=>{const xy=randomSpawn(i);state.players.set(p.id,{id:p.id,...xy,tx:xy.x,ty:xy.y,energy:100,tags:0,itTime:0})});state.it=state.first==='host'?state.room.host_id:state.roster[Math.floor(Math.random()*state.roster.length)].id;state.inputs.clear();broadcastSnapshot()}
 else{state.players.clear();state.roster.forEach((p,i)=>{const xy=randomSpawn(i);state.players.set(p.id,{id:p.id,...xy,tx:xy.x,ty:xy.y,energy:100,tags:0,itTime:0})});state.it=state.room.host_id;state.channel?.send({type:'broadcast',event:'request_state',payload:{}})}
 $('roleLabel').textContent=state.it===state.user.id?'Ты водишь!':'Убегай!';
}
function startDemo(){const setup=settingsFromForm();state.boost=setup.boost;state.duration=setup.duration;state.first=setup.first;state.mode='demo';state.room=null;state.isHost=true;state.online=false;state.players.clear();state.roster=[{id:'local',name:state.meProfile?.display_name||state.meProfile?.username||'Ты',avatar:state.meProfile?.avatar_url||null},{id:'bot1',name:'Лиса'},{id:'bot2',name:'Волк'},{id:'bot3',name:'Заяц'}];state.it=state.first==='host'?'local':'bot1';state.remaining=state.duration;state.elapsed=0;state.grace=2;state.finished=false;state.inputs.clear();state.roster.forEach((p,i)=>{const xy=randomSpawn(i);state.players.set(p.id,{id:p.id,...xy,tx:xy.x,ty:xy.y,energy:100,tags:0,itTime:0,ai:{dx:0,dy:0,timer:0}})});
 showSetup(true);show('roomSection',false);show('friendsSection',false);$('gameTitle').textContent='Тренировка • 3 бота';$('mapNotice').classList.add('hidden');$('roleLabel').textContent='Тренировка';notice('Тренировка запущена: боты двигаются по лабиринту.');setConnection('● Локальная тренировка');
}
async function stopRoom(silent=false){
 const prior=state.room;
 if(state.channel){const ch=state.channel;state.channel=null;try{await client?.removeChannel(ch)}catch(e){console.warn(e)}}
 if(prior&&!silent&&state.user){try{await rpc('chase_leave_room',{p_room:prior.id})}catch(e){console.warn('leave room',e)}}
 state.room=null;state.isHost=false;state.online=false;state.selectedFriends.clear();showSetup(true);state.players.clear();state.inputs.clear();state.roster=[];state.it=null;state.mode='idle';state.finished=false;
 show('roomSection',false);show('friendsSection',false);$('gameTitle').textContent='Большой лесной лабиринт';$('roleLabel').textContent='Ожидание игры';$('mapNotice').classList.remove('hidden');$('mapNotice').textContent='Выбери условия, собери друзей и запусти матч';setConnection(state.user?'● Аккаунт подключён':'● Гость');
}
function currentInput(){let dx=Number(keyDown.has('d')||keyDown.has('arrowright'))-Number(keyDown.has('a')||keyDown.has('arrowleft'));
 let dy=Number(keyDown.has('s')||keyDown.has('arrowdown'))-Number(keyDown.has('w')||keyDown.has('arrowup'));
 if(Math.abs(touch.dx)+Math.abs(touch.dy)>.06){dx=touch.dx;dy=touch.dy}
 const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len}return{dx,dy,sprint:keyDown.has('shift')||touch.sprint};
}
function move(player,input,delta,tagger=false){if(!player||!input)return;
 let dx=Number(input.dx)||0,dy=Number(input.dy)||0;const length=Math.hypot(dx,dy);if(length>1){dx/=length;dy/=length}
 const moving=length>.07;const boosting=!!input.sprint&&player.energy>1&&moving;
 player.energy=Math.max(0,Math.min(100,player.energy+(boosting?-30:17)*delta));
 let speed=(tagger?4.75:4.25)*(boosting?state.boost:1);if(!moving)return;
 const nx=player.x+dx*speed*delta,ny=player.y+dy*speed*delta;
 if(canStand(nx,player.y))player.x=nx;
 if(canStand(player.x,ny))player.y=ny;
}
function demoDirection(p,dt){p.ai.timer-=dt;if(p.ai.timer>0)return p.ai;
 p.ai.timer=.28+Math.random()*.38;
 const tagged=state.players.get(state.it);let dx=0,dy=0;
 if(state.it===p.id){let target=null,best=Infinity;for(const x of state.players.values()){if(x.id===p.id)continue;const d=Math.hypot(x.x-p.x,x.y-p.y);if(d<best){best=d;target=x}}if(target){dx=target.x-p.x;dy=target.y-p.y}}
 else if(tagged){const d=Math.hypot(tagged.x-p.x,tagged.y-p.y);if(d<14){dx=p.x-tagged.x;dy=p.y-tagged.y}}
 if(Math.hypot(dx,dy)<.5){const a=Math.random()*Math.PI*2;dx=Math.cos(a);dy=Math.sin(a)}
 const list=[[dx,dy],[dy,-dx],[-dy,dx],[-dx,-dy]];
 let found=false;for(const v of list){const mag=Math.hypot(...v)||1;const vx=v[0]/mag,vy=v[1]/mag;if(canStand(p.x+vx*.62,p.y+vy*.62)){p.ai.dx=vx;p.ai.dy=vy;found=true;break}}
 if(!found){p.ai.dx=0;p.ai.dy=0}p.ai.sprint=state.it===p.id&&p.energy>38;return p.ai;
}
function simulate(dt){
 state.elapsed+=dt;state.grace=Math.max(0,state.grace-dt);
 if(state.mode==='demo')state.remaining=Math.max(0,state.remaining-dt);
 else if(state.room?.ends_at)state.remaining=Math.max(0,(new Date(state.room.ends_at)-Date.now())/1000);
 let input=currentInput();
 for(const [id,p] of state.players){
  let movement;
  if(state.mode==='demo'){movement=id==='local'?input:demoDirection(p,dt)}
  else movement=id===state.user?.id?input:state.inputs.get(id);
  if(movement?.t&&performance.now()-movement.t>1500)movement={dx:0,dy:0,sprint:false};
  move(p,movement,dt,state.it===id);
  if(state.it===id)p.itTime+=dt;
 }
 if(state.grace===0){const seeker=state.players.get(state.it);if(seeker){for(const [id,target] of state.players){if(id===state.it)continue;
 if(Math.hypot(seeker.x-target.x,seeker.y-target.y)<.7){target.tags++;state.it=id;state.grace=2;notice(`${profileName(id)} теперь водит!`);break}
 }}}
 if(state.mode==='playing'&&state.isHost){state.snapTimer+=dt;if(state.snapTimer>.085){state.snapTimer=0;broadcastSnapshot()}}
 if(state.remaining<=0&&!state.finished){state.finished=true;finishMatch()}
}
function broadcastSnapshot(){if(!state.channel||!state.online)return;
 const payload={it:state.it,remaining:state.remaining,grace:state.grace,players:[...state.players.values()].map(p=>[p.id,+p.x.toFixed(3),+p.y.toFixed(3),+p.energy.toFixed(1),p.tags,+p.itTime.toFixed(1)])};
 state.channel.send({type:'broadcast',event:'snapshot',payload}).catch(()=>{});
}
async function finishMatch(){const results=[...state.players.values()].sort((a,b)=>a.itTime-b.itTime);
 const winner=results[0]?profileName(results[0].id):'Игрок';$('mapNotice').textContent=`Время вышло! Лучший результат: ${winner}`;$('mapNotice').classList.remove('hidden');
 if(state.mode==='playing'&&state.isHost){try{await rpc('chase_finish_room',{p_room:state.room.id})}catch(e){console.warn(e)}}
 state.mode='finished';$('roleLabel').textContent='Игра завершена';notice(`Матч завершён. ${winner} меньше всех был водящим!`);
}
function update(dt){if(state.mode==='playing'&&state.isHost||state.mode==='demo')simulate(dt);
 else if(state.mode==='playing'){
  const me=state.players.get(state.user?.id);const inp=currentInput();if(me)move(me,inp,dt,state.it===state.user.id);
  for(const [id,p] of state.players){if(id!==state.user?.id&&Number.isFinite(p.tx)){
   const alpha=Math.min(1,dt*10);p.x+=(p.tx-p.x)*alpha;p.y+=(p.ty-p.y)*alpha;
  }else if(id===state.user?.id&&Number.isFinite(p.tx)){
   const dist=Math.hypot(p.x-p.tx,p.y-p.ty);
   if(dist>3){p.x=p.tx;p.y=p.ty}else if(dist>.14){p.x+=(p.tx-p.x)*Math.min(1,dt*4);p.y+=(p.ty-p.y)*Math.min(1,dt*4)}
  }}
  state.sendTimer+=dt;if(state.sendTimer>.068){state.sendTimer=0;if(state.online)state.channel?.send({type:'broadcast',event:'input',payload:{id:state.user.id,...inp}}).catch(()=>{})}
  if(performance.now()-state.lastHost>6000&&state.online){$('roleLabel').textContent='Нет связи с ведущим'}
 }
 state.roomCheck+=dt;if(state.roomCheck>2.5){state.roomCheck=0;if(state.room&&state.mode!=='finished')refreshRoom().catch(e=>notice(getError(e),true))}
 state.inviteCheck+=dt;if(state.inviteCheck>7){state.inviteCheck=0;if(state.user)loadInvites().catch(()=>{})}
 const myId=state.mode==='demo'?'local':state.user?.id;
 const me=state.players.get(myId);const goal=me||{x:55,y:37};
 camera.x+=(goal.x-camera.x)*Math.min(1,dt*7);camera.y+=(goal.y-camera.y)*Math.min(1,dt*7);
 const value=Math.round(me?.energy??100);$('staminaFill').style.width=value+'%';$('staminaPercent').textContent=value+'%';
 $('timer').textContent=`${String(Math.floor(Math.max(0,state.remaining)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,state.remaining)%60)).padStart(2,'0')}`;
 $('stats').textContent=state.mode==='playing'||state.mode==='demo'?`${state.players.size} игроков • ${state.it===myId?'Ты водишь':'Убегай'} • 116 × 80`:'Большая карта • развилки • обходные пути';
 if(state.mode==='playing'||state.mode==='demo')$('roleLabel').textContent=state.it===myId?'🔴 Ты водишь':'🟢 Убегай';
}
function resize(){const r=canvas.getBoundingClientRect();viewW=Math.max(100,r.width);viewH=Math.max(100,r.height);dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(viewW*dpr);canvas.height=Math.round(viewH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)}
function draw(){ctx.clearRect(0,0,viewW,viewH);const tile=39;const left=Math.max(0,Math.min(W*tile-viewW,camera.x*tile-viewW*.5));const top=Math.max(0,Math.min(H*tile-viewH,camera.y*tile-viewH*.5));
 paintTerrain(ctx,tile,left,top,viewW,viewH);
 for(const [id,p] of state.players){let x=p.x*tile-left,y=p.y*tile-top;if(x< -42||y< -45||x>viewW+42||y>viewH+45)continue;
 const chaser=id===state.it;ctx.fillStyle='#07140c6b';ctx.beginPath();ctx.ellipse(x,y+18,16,7,0,0,Math.PI*2);ctx.fill();
 if(chaser){ctx.strokeStyle='#ff5668';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,21,0,Math.PI*2);ctx.stroke()}
 const index=state.roster.findIndex(u=>u.id===id),radius=17;
 const pic=getAvatar(id);
 ctx.save();ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.clip();
 if(pic?.complete&&pic.naturalWidth>0){ctx.imageSmoothingEnabled=true;const m=Math.min(pic.naturalWidth,pic.naturalHeight);ctx.drawImage(pic,(pic.naturalWidth-m)/2,(pic.naturalHeight-m)/2,m,m,x-radius,y-radius,2*radius,2*radius)}
 else{ctx.fillStyle=COLORS[Math.max(index,0)%COLORS.length];ctx.fillRect(x-radius,y-radius,2*radius,2*radius);ctx.fillStyle='#163021';ctx.font='800 17px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((profileName(id)||'?').charAt(0).toUpperCase(),x,y+1)}ctx.restore();
 ctx.strokeStyle=chaser?'#ff6274':id===(state.mode==='demo'?'local':state.user?.id)?'#ffffff':'#b7ffdc';ctx.lineWidth=chaser?4:2.5;ctx.beginPath();ctx.arc(x,y,radius+1,0,Math.PI*2);ctx.stroke();
 const meId=state.mode==='demo'?'local':state.user?.id;const label=cleanName(id===meId?'Ты':profileName(id));
 ctx.font='700 11px system-ui';ctx.textAlign='center';const width=Math.max(38,ctx.measureText(label).width+13);ctx.fillStyle=id===meId?'#16422fda':'#0b1b15ce';ctx.beginPath();ctx.roundRect(x-width/2,y-39,width,19,6);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(label,x,y-26);
 }
 drawMini(left,top,tile);
}
const minimapBack=document.createElement('canvas');minimapBack.width=mini.width;minimapBack.height=mini.height;const bg=minimapBack.getContext('2d');
function paintMiniBase(){const pw=mini.width/W,ph=mini.height/H;bg.fillStyle='#174e2b';bg.fillRect(0,0,mini.width,mini.height);bg.fillStyle='#d6c5a4';for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(MAP[y][x])bg.fillRect(x*pw,y*ph,Math.ceil(pw),Math.ceil(ph))}
function drawMini(left,top,tile){mc.clearRect(0,0,mini.width,mini.height);mc.drawImage(minimapBack,0,0);const kx=mini.width/W,ky=mini.height/H;
 for(const [id,p] of state.players){mc.fillStyle=id===state.it?'#ff546a':'#a6fdff';mc.beginPath();mc.arc(p.x*kx,p.y*ky,id===(state.mode==='demo'?'local':state.user?.id)?4:3,0,Math.PI*2);mc.fill();mc.strokeStyle='#071711';mc.lineWidth=1;mc.stroke()}
 mc.strokeStyle='#ffffffc4';mc.lineWidth=1.1;mc.strokeRect(left/tile*kx,top/tile*ky,viewW/tile*kx,viewH/tile*ky);
}
function loop(time){const dt=last?Math.max(0,Math.min(.045,(time-last)/1000)):0;last=time;update(dt);draw();requestAnimationFrame(loop)}
init();
