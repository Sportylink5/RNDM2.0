import {$,$$,esc,icon,ib,avatar,sid,unique,preview,safeURL,richText,day,time,bytes,errorText,readLocal,writeLocal} from './core.js?v=56.0.0';
import {MessengerAPI} from './api.js?v=56.0.0';
import * as V from './views.js?v=56.0.0';
import {Admin,staffRole} from './admin.js?v=56.0.0';
import {Calls} from './calls.js?v=56.0.0';
import {Clips} from './clips.js?v=56.0.0';
import {applyColors,validColors,defaultColors} from './theme.js?v=56.0.0';

const defaults={notes:[],muted:[],wallpaper:'default',enterSend:true,notifications:false,notificationSound:false,colors:null};
const app={user:null,profile:null,route:'chats',folder:'all',active:null,info:null,dialogs:[],channels:[],friends:[],prefs:{},drafts:{},state:{...defaults},messages:[],reactions:[],peopleMap:{},replyLookup:{},pins:[],reply:null,edit:null,files:new Map(),pending:new Set(),epoch:0,messageEpoch:0,more:false,rt:[],globalRt:[],stateChain:Promise.resolve(),draftTimers:new Map(),refreshing:false};
let calls,clips,admin;
let api,toastTimer,searchTimer,messageSearchTimer,typingTimer,refreshTimer,listTimer,messageSizeObserver,record=null,voiceBusy=false,authMode='login',stopped=false,recoverySeen=false;
let previousRoute='chats',previousChatId=null;
let randomTimer=null,randomToken=0,randomSearching=false,randomMatch=null,randomPerson=null,randomCount=null,randomInFlight=null;
let randomLanguage='any',randomInterest='any';
let giftRecipient=null,giftRecipientName='',giftRecipientSearchTimer=null;
let starsRenderToken=0;
const root=$('#root'),modal=$('#modal'),pop=$('#popover');
const activeKey=()=>app.active ? app.active.kind+':'+app.active.id : '';
const chatKey=id=>'chat:'+id;
const localStateKey=()=>`rndm30-state:${app.user.id}`;
const localDraftKey=()=>`rndm30-drafts:${app.user.id}`;
const fileFor=()=>app.files.get(activeKey());
const currentMessage=id=>app.messages.find(x=>sid(x.id)===sid(id));
const isCurrent=(epoch,id)=>epoch===app.epoch && app.active?.id===id;
function toast(message) { clearTimeout(toastTimer);const host=$('#toast');host.textContent=message;host.hidden=false;toastTimer=setTimeout(()=>host.hidden=true,4200); }
function showError(host,error) { if (host) host.innerHTML=`<div class="notice error-notice">${esc(errorText(error))}</div>`; }
function closePop(){pop.hidden=true;pop.innerHTML='';}
function showModal(title,body) {
  closePop();if(modal.open)modal.close();
  modal.innerHTML=`<div class="modal-head"><h2 id="modalTitle">${esc(title)}</h2>${ib('close','Закрыть','close-modal')}</div><div class="modal-body">${body}</div>`;
  modal.showModal();return modal;
}
function confirmAction(title,text,callback,label='Удалить') {
  showModal(title,`<p>${esc(text)}</p><div class="modal-actions"><button class="secondary" data-action="close-modal">Отмена</button><button class="primary" id="confirmAction">${label}</button></div><div id="modalError"></div>`);
  $('#confirmAction').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{await callback();modal.close();}catch(error){showError($('#modalError'),error);}finally{b.disabled=false;}};
}
function showPop(anchor,html,emoji=false) {
  pop.classList.toggle('emoji-popover',emoji);pop.innerHTML=html;pop.hidden=false;
  const rect=anchor.getBoundingClientRect(),width=pop.offsetWidth,height=pop.offsetHeight;
  pop.style.left=Math.max(10,Math.min(rect.right-width,innerWidth-width-10))+'px';
  pop.style.top=Math.max(10,Math.min(rect.top>height+15 ? rect.top-height-6 : rect.bottom+6,innerHeight-height-10))+'px';
}
function connection(message='RNDM · на связи',offline=false){if($('#connectionText'))$('#connectionText').textContent=message;if($('#statusDot'))$('#statusDot').classList.toggle('offline',offline);}
function setTheme(theme) {
  applyColors(app.user?app.state.colors:null);
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('rndm-theme',theme);}catch{}
  if(app.route==='settings'&&app.user)$('#pane').innerHTML=V.settings(app);
}
async function changeState(updater) {
  const uid=app.user.id;
  const task=app.stateChain.catch(()=>{}).then(async()=>{
    if(app.user?.id!==uid||stopped)throw new Error('Войди в аккаунт перед сохранением.');
    const value=typeof updater==='function'?updater(app.state):{...app.state,...updater};
    await api.saveState(value);if(app.user?.id!==uid||stopped)return value;app.state=value;writeLocal(localStateKey(),{value,at:Date.now()});return value;
  });
  app.stateChain=task;return task;
}
function captureDraft() {
  const input=$('#messageInput');if(!app.active || !input || app.edit)return;
  storeDraft(app.active,input.value);
}
function storeDraft(active,body) {
  const key=active.kind==='direct'||active.kind==='group' ? chatKey(active.id) : active.kind+':'+active.id;
  app.drafts[key]={body,updated_at:new Date().toISOString()};writeLocal(localDraftKey(),app.drafts);
  if(!['direct','group'].includes(active.kind))return;
  clearTimeout(app.draftTimers.get(key));
  const value=body,cid=active.id;
  const uid=app.user.id;
  app.draftTimers.set(key,setTimeout(()=>{app.draftTimers.delete(key);if(app.user?.id!==uid||stopped)return;api.draft(cid,value).catch(()=>connection('Черновик сохранён на устройстве',true));},600));
}
function clearDraft(active,original) {
  const key=['direct','group'].includes(active.kind)?chatKey(active.id):active.kind+':'+active.id;
  if(app.drafts[key]?.body===original || !app.drafts[key]?.body)storeDraft(active,'');
}
function cancelEdit(){if(!app.edit)return;const restore=app.edit.restore;app.edit=null;if($('#messageInput'))$('#messageInput').value=restore;renderCompose();}
function stopSubscriptions(){app.rt.forEach(ch=>api.unwatch(ch));app.rt=[];clearTimeout(refreshTimer);clearTimeout(typingTimer);}
function stopAll(){stopRandomSearch(true).catch(()=>{});admin?.stop();calls?.stop().catch(()=>{});clips?.stop();stopped=true;++app.epoch;++app.messageEpoch;stopSubscriptions();app.globalRt.forEach(ch=>api.unwatch(ch));app.globalRt=[];clearInterval(listTimer);cancelVoice();}


const RU_PROFANITY=[/бл(?:я|е)(?:д|т)\w*/giu,/ху[йеяё]\w*/giu,/пизд\w*/giu,/еб(?:а|у|ё|е|и)\w*/giu,/ёб\w*/giu,/су(?:ка|чк)\w*/giu,/мудак\w*/giu];
const EN_PROFANITY=[/fuck\w*/giu,/shit\w*/giu,/bitch\w*/giu,/cunt\w*/giu,/motherfuck\w*/giu];
const HARD_BLOCK=[
  /(?<![а-яё])(?:убью|убить|зарежу|взорву)\s+(?:тебя|тебе|вас|его|её|их)(?![а-яё])/iu,
  /\b(?:kill|murder|stab|bomb)\s+(?:you|him|her|them)\b/iu
];
function hasProfanity(text){return [...RU_PROFANITY,...EN_PROFANITY].some(r=>(r.lastIndex=0,r.test(text)));}
function maskProfanity(text){let out=String(text||'');for(const r of [...RU_PROFANITY,...EN_PROFANITY]){r.lastIndex=0;out=out.replace(r,m=>'•'.repeat(Math.max(3,Math.min(m.length,8))));}return out;}
function filterOutgoing(text){
  const raw=String(text||'');
  if(HARD_BLOCK.some(r=>(r.lastIndex=0,r.test(raw))))return {ok:false,text:raw,reason:'Это сообщение нельзя отправить: обнаружен недопустимый контент.'};
  const mode=app.profile?.censorship_mode||'mask';
  if(mode==='strict'&&hasProfanity(raw))return {ok:false,text:raw,reason:'Сообщение не отправлено: включена строгая цензура.'};
  if(mode==='mask')return {ok:true,text:maskProfanity(raw)};
  return {ok:true,text:raw};
}
function censoredMessages(rows){
  return (rows||[]).map(m=>({...m,body:applyIncomingCensorship(m.body??m.content??m.text??''),content:m.content!=null?applyIncomingCensorship(m.content):m.content,text:m.text!=null?applyIncomingCensorship(m.text):m.text}));
}
function applyIncomingCensorship(text){
  const mode=app.profile?.censorship_mode||'mask';
  return mode==='off'?String(text||''):maskProfanity(text);
}

function applyLanguage(){
 const lang=app.profile?.app_language||localStorage.getItem('rndm-language')||'ru';
 document.documentElement.lang=lang;
 const labels={notifications:['Уведомления','Notifications'],random:['Рулетка','Random chat'],chats:['Чаты','Chats'],contacts:['Контакты','Contacts'],channels:['Каналы','Channels'],tapolka:['Тапалка','Tap game'],stars:['Звёзды','Stars'],clips:['Клипы','Clips'],calls:['Звонки','Calls'],settings:['Настройки','Settings'],saved:['Избранное','Saved'],admin:['Админка','Admin'],profile:['Профиль','Profile']};
 const dict={'Мой RNDM':'My RNDM','Настройки':'Settings','Профиль':'Profile','Посмотреть мой профиль':'View my profile','Обложка профиля':'Profile cover','Загрузить обложку':'Upload cover','Имя пользователя':'Username','Имя':'Name','О себе':'About','Сохранить профиль':'Save profile','Изменить фото':'Change photo','Язык приложения / Language':'App language / Язык','Язык интерфейса / Interface language':'Interface language / Язык','Цензура':'Content filter','Оформление':'Appearance','Аккаунт':'Account','Сохранить / Save':'Save / Сохранить','Подарки':'Gifts','Звёзды':'Stars','Написать':'Message','Добавить':'Add friend','🎁 Подарить':'🎁 Send gift','Звёзды и подарки':'Stars and gifts','Открыть кошелёк':'Open wallet','Редактировать профиль':'Edit profile','Твои цвета':'Your colors','Выйти из аккаунта':'Sign out','Изменить пароль':'Change password','Статус':'Status','Клипы':'Clips','Звонки':'Calls','Сохранить цвета':'Save colors','Общение и приватность':'Chat & privacy','Тапалка':'Tap game','Котик':'Cat','Энергия':'Energy','Задания на сегодня':'Today’s tasks','Улучшения котика':'Cat upgrades','Восстановление':'Regeneration','Вместимость энергии':'Energy capacity','Публикации':'Posts','Новая публикация':'New post','Закрепить':'Pin','Удалить':'Delete','Написать сообщение':'Message','Написать':'Message','Написать публикацию':'Write a post','Отправить подарок':'Send gift','Подарок':'Gift','Друзья':'Friends','Найти случайного собеседника':'Find a random partner','Начать поиск':'Start searching','Остановить поиск':'Stop searching','Другой человек':'Find another person','Добавить в друзья':'Add friend','Новые':'Latest','Популярные':'Popular','Подписки':'Following','Подписаться':'Follow','Клипы':'Clips','Хештег':'Hashtag','Первый клип — за тобой':'Be the first to post','Выложить':'Upload','Музыка профиля':'Profile music','Название трека':'Track title','Ссылка на аудио':'Audio URL','Сохранить музыку':'Save music','Посмотреть публикации в профиле':'View profile posts','Поиск в переписке':'Search messages','Прикрепить файл':'Attach file','Записать голосовое':'Record voice','Отложить сообщение':'Schedule message','Отложенная отправка':'Scheduled message','Выключить звук':'Mute','Включить звук':'Unmute','Закреплено':'Pinned','Обновить':'Refresh','Завершить':'End','Предпросмотр':'Preview','Открыть чат':'Open chat','Профиль':'Profile','Сохранить':'Save','Получено':'Claimed','Сегодня':'Today','Рейтинг канала':'Leaderboard','Загрузить ещё':'Load more','Обложка':'Cover','История знакомств':'Meeting history','Избранное пусто':'Saved collection is empty','Выйти':'Sign out','Закрыть':'Close','Уведомления':'Notifications','Непрочитанные':'Unread','Прочитать всё':'Mark all read','История знакомств':'Match history','За неделю':'This week','За всё время':'All time','Редкий':'Rare','Легендарный':'Legendary','Порядок блоков профиля':'Profile sections order','Сначала подарки':'Gifts first','Сначала публикации':'Posts first','Проверить соединение':'Check connection','Отмена':'Cancel','Отправить':'Send','Переписка':'Conversation','Сохранить оформление':'Save appearance','Кошелёк':'Wallet','Активность':'Activity','Проверить':'Check'};
 const backward=Object.fromEntries(Object.entries(dict).map(([a,b])=>[b,a]));
 const table=lang==='en'?dict:backward;
 const safeZones=['#pane .settings-pane','#pane .public-profile','#pane .tapolka-page','#pane .cat-progression','#pane .clips-feed','#pane .clip-feed-tools','#pane .random-page','#pane .star-wallet-page','#pane .welcome','.rail-nav','#pane .chat-header','#pane .notification-page','#pane .random-history','#pane .cat-cosmetics','#modal .gift-shop-v43'];
 document.querySelectorAll(safeZones.join(',')).forEach(host=>{
  const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){
   const parent=node.parentElement;
   if(!parent || parent.closest('.profile-identity,.profile-bio,.profile-identity *, .profile-bio *, .message-body, .row-preview, .gift-showcase-list, .tapolka-board, .clip-copy, .admin-pane, input,textarea,option,script,style,[contenteditable]'))continue;
   const raw=node.nodeValue,trimmed=raw.trim();if(trimmed&&table[trimmed])node.nodeValue=raw.replace(trimmed,table[trimmed]);
  }
 });
 document.querySelectorAll('[data-nav]').forEach(el=>{
  const pair=labels[el.dataset.nav];if(!pair)return;
  if(el.matches('.nav-item')){const span=el.querySelector('span:last-child');if(span)span.textContent=pair[lang==='en'?1:0];}
 });
 const heading=$('#sectionTitle');if(heading&&labels[app.route])heading.textContent=labels[app.route][lang==='en'?1:0];
}


// Recover from mixed-version PWA caches while preserving auth, drafts and settings.
async function repairFrontendCache(reload=true){
  if('caches' in window){
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k.startsWith('rndm-')).map(k=>caches.delete(k)));
  }
  if('serviceWorker' in navigator){
    try{const registration=await navigator.serviceWorker.getRegistration('./');await registration?.update();}catch{}
  }
  if(reload){
    const url=new URL(location.href);
    url.searchParams.set('updated',window.RNDM_CONFIG?.version||'56.0.0');
    location.replace(url.href);
  }
}

async function boot() {
  try {
    api=new MessengerAPI();
    api.sb.auth.onAuthStateChange((event,session)=>{
      // The SDK holds the auth lock during callbacks; no API calls here.
      if(event==='PASSWORD_RECOVERY'){recoverySeen=true;try{sessionStorage.setItem('rndm30-recovery','1');}catch{};setTimeout(()=>auth('recovery'),0);}
      if(event==='SIGNED_OUT'&&app.user)setTimeout(()=>{stopAll();app.user=null;applyColors(null);auth('login');},0);
    });
    const session=await api.session();
    const recovery=recoverySeen || new URL(location.href).searchParams.get('recovery')==='1' || sessionStorage.getItem('rndm30-recovery')==='1';
    if(session && recovery){app.user=session.user;auth('recovery');return;}
    if(session)await start(session.user);else auth('login');
  } catch(error) {
    const message=String(error?.message||'');
    const outdated=/\bis not a function\b|\b(?:undefined|null)\b.*\b(?:property|properties)\b/i.test(message);
    if(outdated){
      const flag='rndm-repair-once-'+(window.RNDM_CONFIG?.version||'56.0.0');
      try{
        if(sessionStorage.getItem(flag)!=='1'){
          sessionStorage.setItem(flag,'1');
          root.innerHTML='<div class="boot"><span class="brand-mark">R</span><h2>Обновляем приложение…</h2><p>Загружаем согласованную версию интерфейса.</p><span class="spinner"></span></div>';
          await repairFrontendCache();return;
        }
      }catch(repairError){console.warn('RNDM cache repair:',repairError);}
    }
    root.innerHTML=`<div class="boot"><span class="brand-mark">R</span><h2>${outdated?'Ошибка загрузки интерфейса':'Не удалось подключиться'}</h2><p>${esc(errorText(error))}</p><button class="primary" data-action="repair-app">Обновить приложение</button><button class="secondary" data-action="retry-boot">Повторить</button></div>`;
  }
}
function auth(mode,email='') {
  applyColors(null);
  authMode=mode;root.innerHTML=V.authView(mode,email);
  const form=$('#authForm');
  form.onsubmit=async event=>{
    event.preventDefault();const button=$('button[type=submit]',form),fd=new FormData(form);button.disabled=true;$('#authMessage').innerHTML='';
    try {
      let result;
      if(mode==='login'){
        result=await api.sb.auth.signInWithPassword({email:String(fd.get('email')).trim(),password:fd.get('password')});
        if(result.error)throw result.error;api.uid=result.data.user.id;await start(result.data.user);
      }else if(mode==='register'){
        const username=String(fd.get('username')||'').trim().toLowerCase(),name=String(fd.get('name')||'').trim();
        if(!/^[a-z0-9_]{3,15}$/.test(username)||name.length>15)throw new Error('Ник от 3 до 15 символов, имя не длиннее 15.');
        result=await api.sb.auth.signUp({email:String(fd.get('email')).trim(),password:fd.get('password'),options:{data:{username,display_name:name},emailRedirectTo:new URL('index.html',location.href).href}});
        if(result.error)throw result.error;
        if(result.data.session){api.uid=result.data.user.id;await start(result.data.user);}else $('#authMessage').innerHTML='<div class="notice">Аккаунт создан. Подтверди почту по ссылке из письма, затем войди.</div>';
      }else if(mode==='forgot'){
        result=await api.sb.auth.resetPasswordForEmail(String(fd.get('email')).trim(),{redirectTo:new URL('reset-password.html?recovery=1',location.href).href});if(result.error)throw result.error;
        $('#authMessage').innerHTML='<div class="notice">Если аккаунт с такой почтой существует, ты получишь письмо со ссылкой для смены пароля.</div>';
      }else{
        if(fd.get('password')!==fd.get('password2'))throw new Error('Пароли не совпадают.');
        result=await api.sb.auth.updateUser({password:fd.get('password')});if(result.error)throw result.error;
        sessionStorage.removeItem('rndm30-recovery');history.replaceState({},'',location.pathname);toast('Пароль изменён');await start((await api.session()).user);
      }
    }catch(error){showError($('#authMessage'),error);}finally{if(button.isConnected)button.disabled=false;}
  };
}
async function start(user) {
  stopped=false;++app.epoch;++app.messageEpoch;app.user=user;api.uid=user.id;const profile=await api.profile();
  if(app.user?.id!==user.id||stopped)return;
  app.profile=profile;app.peopleMap={[user.id]:profile};
  app.state={...defaults,...readLocal(localStateKey(),{}).value};app.drafts=readLocal(localDraftKey(),{});app.files=new Map();app.active=null;app.info=null;app.route='chats';app.folder='all';
  applyColors(app.state.colors);app.stories=[];app.storiesError='';
  root.innerHTML=V.shell(app);$('#pane').innerHTML=V.welcome();wireShell();
  const results=await Promise.allSettled([api.preferences(),api.drafts(),api.state(),api.dialogs()]);
  if(app.user?.id!==user.id||stopped)return;
  if(results[0].status==='fulfilled')app.prefs=Object.fromEntries(results[0].value.map(x=>[sid(x.conversation_id),x]));else connection('Настройки чатов недоступны',true);
  if(results[1].status==='fulfilled')for(const row of results[1].value){const k=chatKey(row.conversation_id);if(!app.drafts[k] || new Date(row.updated_at)>new Date(app.drafts[k].updated_at))app.drafts[k]=row;}
  if(results[2].status==='fulfilled' && results[2].value?.value){app.state={...defaults,...results[2].value.value};writeLocal(localStateKey(),{value:app.state,at:Date.now()});}else if(results[2].status==='rejected')connection('Настройки доступны на устройстве',true);
  if(results[3].status==='fulfilled'){app.dialogs=results[3].value;renderSidebar();applyLanguage();}else{renderSidebarError(results[3].reason);}
  applyColors(app.state.colors);refreshStories().catch(()=>{});refreshNotificationBadge().catch(()=>{});
  admin=new Admin(api,{toast,modal:showModal,confirm:confirmAction,close:()=>modal.close(),onProfile:showPerson});
  calls=new Calls(api,toast);calls.start();
  clips=new Clips(api,{toast,modal:showModal,confirm:confirmAction,onProfile:showPerson,onGift:openGiftShop});
  api.heartbeat().catch(()=>{});clearInterval(listTimer);let tick=0;
  listTimer=setInterval(()=>{if(stopped || document.hidden || !navigator.onLine)return;tick++;if(tick%2===0)refreshStories().catch(()=>{});if(app.active)refreshMessages().catch(()=>{});if(tick%2===0)refreshLists().catch(()=>{});if(tick%20===0)api.heartbeat().catch(()=>{});if(tick%2===0)refreshNotificationBadge().catch(()=>{});if(['direct','group'].includes(app.active?.kind))updateTypers();},15000);
  app.globalRt.forEach(ch=>api.unwatch(ch));app.globalRt=[];
  app.globalRt.push(api.watch('messages',null,payload=>{notifyMessage(payload);clearTimeout(listRefreshDebounce);listRefreshDebounce=setTimeout(()=>refreshLists().catch(()=>{}),350);},status=>{if(status==='SUBSCRIBED')connection();else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')connection('Обновляем каждые 15 секунд',true);}));
  app.globalRt.push(api.watch('conversation_members','user_id=eq.'+user.id,()=>refreshLists().catch(()=>{})));
  const params=new URLSearchParams(location.search);
  if(params.get('chat'))await openConversation(params.get('chat'),false);
  else if(params.get('view')==='profile'){app.profileTarget=params.get('user')||app.user.id;await navigate('profile',false);}
  else if(params.get('view')==='channels'){await navigate('channels',false);if(params.get('channel'))await openChannel(params.get('channel'),false);}
  else if(params.get('view')==='contacts')await navigate('contacts');
  else if(params.get('view')==='random'){await navigate('random',false);}
  else if(params.get('view')==='stars'){await navigate('stars',false);}else if(params.get('view')==='notifications'){await navigate('notifications',false);}
  else if(params.get('view')==='clips'){await navigate('clips',false);}
  else if(params.get('view')==='admin'){await navigate('admin',false);}
  else if(params.get('view')==='calls'){await navigate('calls',false);}
  else if(params.get('view')==='settings')await navigate('settings');
  else if(params.get('view')==='saved')await navigate('saved',false);
  if(params.get('user') || params.get('id'))await showPerson(params.get('user') || params.get('id'));
}
let listRefreshDebounce;let notificationList=[],notificationFilter='all',notificationPoll=0,lastNotificationId=0,randomHistory=[];let catBoardMode='all';
const notified=new Set();
function notifyMessage(payload){
  const m=payload?.new;if(payload?.eventType!=='INSERT'||!m||m.sender_id===app.user.id||!document.hidden||!app.state.notifications||app.state.muted.includes(sid(m.conversation_id))||!window.Notification||Notification.permission!=='granted'||notified.has(sid(m.id)))return;
  notified.add(sid(m.id));if(notified.size>500)notified.delete(notified.values().next().value);
  try{const n=new Notification(app.dialogs.find(x=>x.id===sid(m.conversation_id))?.title||'RNDM Chat',{body:preview(m).slice(0,140),icon:new URL('icon-192.svg',location.href).href,tag:'rndm-'+m.id});n.onclick=()=>{window.focus();openConversation(m.conversation_id).catch(()=>{});n.close();};}catch{}
}
function wireShell() {
  $('#listSearch').addEventListener('input',()=>{renderSidebar();applyLanguage();clearTimeout(searchTimer);if(['contacts','chats'].includes(app.route))searchTimer=setTimeout(searchPeople,320);});
  $('#listSearch').addEventListener('keydown',e=>{if(e.key==='Escape'){e.currentTarget.value='';renderSidebar();applyLanguage();}});
}
function renderSidebarError(error){$('#dialogList').innerHTML=`<div class="sidebar-empty"><p>${esc(errorText(error))}</p><button class="secondary" data-action="refresh-list">Повторить</button></div>`;}
function renderSidebar() {
  if(!$('#dialogList'))return;
  renderStories();
  const route=app.route, search=$('#listSearch').value.trim().toLowerCase();
  const starBadge=$('#starBalanceNav');if(starBadge&&app.profile)starBadge.textContent=Number(app.profile.stars||0).toLocaleString('ru-RU');
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.nav===route));
  $('#sectionTitle').textContent={random:'Рулетка',chats:'Чаты',contacts:'Контакты',channels:'Каналы',saved:'Избранное',settings:'Настройки',clips:'Клипы',calls:'Звонки',admin:'Админка',tapolka:'Тапалка',stars:'Звёзды',notifications:'Уведомления',profile:'Профиль'}[route]||'RNDM';
  const count=route==='chats'?app.dialogs.length:route==='channels'?app.channels.length:route==='contacts'?app.friends.filter(x=>x.status==='accepted').length:0;
  $('#sectionCount').textContent=count;$('#sectionCount').hidden=!count;
  $('#listSearch').closest('.searchbox').hidden=['random','saved','settings','clips','calls','admin','tapolka','stars','profile','notifications'].includes(route);
  const tabs=route==='chats'?[['all','Все'],['direct','Личные'],['group','Группы'],['unread','Новые'],['archive','Архив']]:route==='channels'?[['all','Все'],['joined','Мои']]:[];
  $('#folderTabs').innerHTML=tabs.map(([name,label])=>`<button type="button" data-folder="${name}" class="${app.folder===name?'active':''}">${label}</button>`).join('');$('#folderTabs').hidden=!tabs.length;
  const host=$('#dialogList');
  if(route==='chats'){
    const rows=app.dialogs.filter(x=>{
      const pref=app.prefs[x.id]||{};if((app.folder==='archive')!==!!pref.is_archived)return false;
      if(['direct','group'].includes(app.folder)&&x.kind!==app.folder)return false;
      if(app.folder==='unread'&&!x.unread)return false;
      return !search||(x.title+' '+x.preview).toLowerCase().includes(search);
    }).sort((a,b)=>Number(app.prefs[b.id]?.is_pinned || 0)-Number(app.prefs[a.id]?.is_pinned || 0) || new Date(b.last || 0)-new Date(a.last || 0));
    let previousPinned=false;
    host.innerHTML=(typeof V.randomSidebar==='function'?V.randomSidebar():`<button type="button" class="random-sidebar-entry" data-nav="random">✨ RNDM Рулетка →</button>`)+rows.map((item,i)=>{const pinned=!!app.prefs[item.id]?.is_pinned;let label='';if(i===0&&pinned)label='<div class="list-label">Закреплённые</div>';else if((i===0||previousPinned)&&!pinned)label='<div class="list-label">Все сообщения</div>';previousPinned=pinned;return label+V.row(item,app);}).join('') + (!rows.length ? `<div class="sidebar-empty">${icon(app.folder==='archive'?'archive':'chats')}<p>${search?'Чаты не найдены. Найди человека по имени или @username.':app.folder==='archive'?'В архиве пока пусто.':app.folder==='unread'?'Все сообщения прочитаны.':'Здесь появятся твои разговоры.'}</p>${!search?'<button class="secondary" data-action="new">Начать общение</button>':''}</div>` : '');
    if(search)host.insertAdjacentHTML('beforeend','<div id="peopleSearchResults"></div>');
  }else if(route==='contacts'){
    const incoming=app.friends.filter(x=>x.status==='pending'&&x.addressee===app.user.id);
    const accepted=app.friends.filter(x=>x.status==='accepted'&&x.person&&(!search||(x.person.display_name+' '+x.person.username).toLowerCase().includes(search.replace(/^@/,''))));
    host.innerHTML=(incoming.length?`<div class="list-label">Заявки в друзья</div>${incoming.map(x=>`<div class="chat-row">${avatar(x.person)}<span class="row-content"><span class="row-name">${esc(x.person?.display_name || 'Пользователь')}</span><span class="row-bottom"><span class="row-preview">Хочет добавить тебя</span></span></span><button class="icon-button small" data-accept="${x.id}" aria-label="Принять заявку">${icon('check')}</button><button class="icon-button small" data-decline="${x.id}" aria-label="Отклонить заявку">${icon('close')}</button></div>`).join('')}`:'')+`<div class="list-label">Мои контакты</div>`+(accepted.map(x=>V.personRow(x.person)).join('')||'<div class="sidebar-empty"><p>Найди человека через поиск по имени или @username.</p></div>')+'<div id="peopleSearchResults"></div>';
  }else if(route==='channels'){
    const rows=app.channels.filter(x=>(app.folder!=='joined'||x.joined||x.owner_id===app.user.id)&&(!search||(x.title+' '+x.description).toLowerCase().includes(search)));
    host.innerHTML=`<button type="button" class="chat-row tap-channel-row" data-nav="tapolka"><span class="avatar tone-1 tap-avatar">R</span><span class="row-content"><span class="row-top"><span class="row-name">Тапалка</span><span class="row-time">GAME</span></span><span class="row-bottom"><span class="row-preview">Игровой канал · общий рейтинг тапов</span></span></span></button>`+(rows.map(x=>V.row({...x,preview:x.count+' подписчиков · '+(x.description||'')},app)).join('')||'<div class="sidebar-empty"><p>Других каналов пока нет.</p><button class="secondary" data-action="new-channel">Создать канал</button></div>');
  }else if(route==='random'){
    host.innerHTML='<div class="sidebar-empty"><span class="random-sidebar-ornament">✨</span><h3>Новые знакомства</h3><p>Выбирай тему и находи людей для общения.</p><button class="primary" data-action="random-start">Начать поиск</button></div>';
  }else if(route==='tapolka'){
    host.innerHTML='<div class="sidebar-empty"><div class="tap-mini">R</div><p>Отдельный игровой канал RNDM. Тапай и соревнуйся с другими.</p><button class="primary" data-nav="tapolka">Открыть тапалку</button></div>';
  }else if(route==='notifications'){
    host.innerHTML='<div class="sidebar-empty"><span style="font-size:38px">🔔</span><h3>Твои события</h3><p>Подарки, сообщения, звонки и новые знакомства.</p><button class="primary" data-action="notifications-refresh">Обновить события</button></div>';
  }else if(route==='stars'){
    host.innerHTML='<div class="sidebar-empty"><span style="font-size:42px">⭐</span><h3>Твой кошелёк</h3><p>Забирай ежедневные звёзды и дари подарки друзьям.</p><button class="primary" data-action="stars-refresh">Обновить баланс</button></div>';
  }else if(route==='saved'){
    host.innerHTML=V.row({id:'saved',kind:'saved',title:'Избранное',preview:'Твои заметки и сохранённые сообщения'},app)+'<div class="sidebar-empty"><p>Сохраняй важное через меню сообщения или добавляй заметки прямо здесь.</p></div>';
  }else if(route==='admin'){
    host.innerHTML='<div class="sidebar-empty"><p>Управление пользователями, жалобами и публикациями.</p><button class="secondary" data-nav="chats">Открыть чаты</button></div>';
  }else if(route==='clips'||route==='calls'||route==='tapolka'){
    host.innerHTML=`<div class="sidebar-empty"><p>${route==='clips'?'Смотри видео, делись своими клипами и общайся в комментариях.':route==='tapolka'?'Общий игровой канал: тапай и соревнуйся в рейтинге.':'Позвони из личного чата. История вызовов показана справа.'}</p><button class="secondary" data-nav="chats">Открыть чаты</button></div>`;
  }else{
    host.innerHTML=`<div class="detail-profile">${avatar(app.profile,'large')}<h2>${esc(app.profile.display_name)}</h2><p>@${esc(app.profile.username)}</p></div><div class="sidebar-empty"><p>Настрой RNDM под себя.<br>Твой профиль, оформление и приватность.</p></div>`;
  }
}
let listRefreshPromise=null;
async function refreshLists() {
  if(!app.user || stopped)return;
  if(listRefreshPromise)return listRefreshPromise;
  const uid=app.user.id;
  listRefreshPromise=(async()=>{
    const dialogs=await api.dialogs();if(app.user?.id!==uid||stopped)return;app.dialogs=dialogs;
    if(app.route==='channels'){const channels=await api.channels();if(app.user?.id!==uid||stopped)return;app.channels=channels;}
    if(app.route==='contacts'){const friends=await api.friends();if(app.user?.id!==uid||stopped)return;app.friends=friends;}
    renderSidebar();applyLanguage();connection(navigator.onLine?'RNDM · на связи':'Нет соединения',!navigator.onLine);
  })().finally(()=>listRefreshPromise=null);return listRefreshPromise;
}
async function searchPeople() {
  const field=$('#listSearch');if(!field)return;const query=field.value.trim(),route=app.route;
  if(query.replace(/^@/,'').length<2){if($('#peopleSearchResults'))$('#peopleSearchResults').innerHTML='';return;}
  try{const people=await api.people(query);if($('#listSearch')?.value.trim()!==query||app.route!==route)return;people.forEach(p=>app.peopleMap[p.id]=p);const host=$('#peopleSearchResults');if(host)host.innerHTML='<div class="list-label">Люди</div>'+people.map(x=>V.personRow(x)).join('')+(people.length?'':'<div class="sidebar-empty"><p>Никого не найдено.</p></div>');}catch(error){if($('#peopleSearchResults'))showError($('#peopleSearchResults'),error);}
}
async function navigate(route,push=true) {
  if(!app.user)return;
  if(app.route==='random' && route==='random'){renderRandomPage();return;}
  if(app.route==='random' && route!=='random')await stopRandomSearch(true).catch(()=>{});
  if(route==='admin'&&!staffRole(app.profile.app_role)){toast('Админка доступна только администрации.');route='chats';}
  admin?.stop();
  applyColors(app.state.colors);clips?.stop();captureDraft();cancelEdit();cancelVoice();stopSubscriptions();closePop();
  ++app.epoch;++app.messageEpoch;app.active=null;app.info=null;app.reply=null;app.messages=[];app.route=route;app.folder='all';$('#listSearch').value='';$('#workspace').classList.toggle('in-chat',['settings','saved','tapolka','clips','calls','admin','profile','random','stars','notifications'].includes(route));
  if(push){const url=new URL(location.href);url.search='';if(route!=='chats'){url.searchParams.set('view',route);if(route==='profile'&&app.profileTarget)url.searchParams.set('user',app.profileTarget);}history.pushState({},'',url);}
  $('#pane').innerHTML=route==='settings'?V.settings(app):V.welcome();renderSidebar();applyLanguage();
  const epoch=app.epoch;
  try{
    if(route==='admin'){await admin.open($('#pane'));return;}
    if(route==='random'){await openRandomPage();return;}
    if(route==='tapolka'){await openTapolka();return;}
    if(route==='stars'){await openStars();return;}if(route==='notifications'){await openNotifications();return;}
    if(route==='profile'){await openPublicProfile(app.profileTarget);return;}
    if(route==='clips'){await clips.open($('#pane'),new URL(location.href).searchParams.get('clip'));return;}
    if(route==='calls'){$('#pane').innerHTML='<header class="chat-header"><button class="icon-button back-mobile" data-action="back" aria-label="К чатам">'+icon('back')+'</button><h2>Звонки</h2><button class="secondary" data-action="refresh-calls">Обновить</button></header><section class="calls-history" id="callsHistory"></section>';await calls.history($('#callsHistory'));return;}
    if(route==='contacts'){const friends=await api.friends();if(epoch!==app.epoch)return;app.friends=friends;friends.forEach(x=>{if(x.person)app.peopleMap[x.person.id]=x.person;});}
    if(route==='channels'){const channels=await api.channels();if(epoch!==app.epoch)return;app.channels=channels;}
    if(route==='saved'){await openSaved(push);return;}
    if(route==='chats')await refreshLists();
    renderSidebar();applyLanguage();
  }catch(error){if(epoch===app.epoch)renderSidebarError(error);}
}
async function openConversation(id,push=true) {
  id=sid(id);if(!id)return;
  if(app.route==='random')await stopRandomSearch(true).catch(()=>{});
  admin?.stop();clips?.stop();captureDraft();cancelEdit();cancelVoice();stopSubscriptions();closePop();
  const epoch=++app.epoch;++app.messageEpoch;app.route='chats';app.active={id,kind:app.dialogs.find(x=>x.id===id)?.kind || 'direct'};app.reply=null;app.messages=[];app.reactions=[];app.pins=[];app.replyLookup={};app.info=null;
  $('#workspace').classList.add('in-chat');$('#pane').innerHTML='<div class="empty-messages"><span class="spinner"></span><h3>Открываем чат…</h3></div>';renderSidebar();applyLanguage();
  if(push){const url=new URL(location.href);url.search='';url.searchParams.set('chat',id);history.pushState({},'',url);}
  try{
    const info=await api.info(id);if(!isCurrent(epoch,id))return;
    app.info=info;app.active={...app.dialogs.find(x=>x.id===id),id,kind:info.conv.kind || 'direct'};info.profiles.forEach(p=>app.peopleMap[p.id]=p);
    $('#pane').innerHTML=V.conversation(app);wireConversation();
    await refreshMessages(true);if(!isCurrent(epoch,id))return;
    subscribeActive();await markRead().catch(()=>connection('Не удалось отметить прочтение',true));renderSidebar();applyLanguage();
  }catch(error){if(isCurrent(epoch,id))$('#pane').innerHTML=`<div class="empty-messages">${icon('chats')}<h3>Чат пока недоступен</h3><p class="muted">${esc(errorText(error))}</p><button class="secondary" data-retry-chat="${esc(id)}">Повторить</button><button class="text-button" data-action="back">К списку чатов</button></div>`;}
}
async function openChannel(id,push=true) {
  admin?.stop();clips?.stop();captureDraft();cancelEdit();cancelVoice();stopSubscriptions();closePop();const epoch=++app.epoch;++app.messageEpoch;
  app.route='channels';app.active=app.channels.find(x=>x.id===sid(id));if(!app.active){toast('Канал не найден');return;}
  app.info=null;app.reply=null;app.reactions=[];app.messages=[];app.pins=[];$('#workspace').classList.add('in-chat');$('#pane').innerHTML=V.conversation(app);wireConversation();renderSidebar();applyLanguage();
  if(push)history.pushState({},'',location.pathname+'?view=channels&channel='+encodeURIComponent(id));
  try{await refreshMessages(true);if(epoch===app.epoch)subscribeActive();}catch(error){if(epoch===app.epoch)showError($('#messages'),error);}
}
async function openSaved(push=true) {
  admin?.stop();clips?.stop();captureDraft();cancelEdit();cancelVoice();stopSubscriptions();const epoch=++app.epoch;++app.messageEpoch;app.route='saved';app.active={id:'saved',kind:'saved'};app.info=null;app.reply=null;app.messages=[];app.reactions=[];app.pins=[];
  $('#workspace').classList.add('in-chat');$('#pane').innerHTML=V.conversation(app);wireConversation();renderSidebar();applyLanguage();
  if(push)history.replaceState({},'',location.pathname+'?view=saved');
  try{await refreshMessages(true);}catch(error){if(epoch===app.epoch)showError($('#messages'),error);}
}
function wireConversation() {
  applyWallpaper();
  const input=$('#messageInput');
  if(input){const key=['direct','group'].includes(app.active.kind)?chatKey(app.active.id):activeKey();input.value=app.drafts[key]?.body || '';input.addEventListener('input',()=>{captureDraft();renderCompose();renderSidebar();applyLanguage();if(['direct','group'].includes(app.active.kind))sendTyping();});input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&innerWidth>760&&app.state.enterSend!==false){event.preventDefault();send();}if(event.key==='Escape'){cancelEdit();app.reply=null;renderCompose();}});$('#composer').onsubmit=e=>{e.preventDefault();send();};$('#attachmentInput').onchange=e=>selectFile(e.target.files?.[0]);renderCompose();}
  const host=$('#messages');let width=host.clientWidth,height=host.clientHeight;
  const resizeMessages=()=>{if(width===host.clientWidth&&height===host.clientHeight)return;const follow=host.dataset.follow==='true';width=host.clientWidth;height=host.clientHeight;if(follow)host.scrollTop=host.scrollHeight;const jump=$('[data-action=bottom]');if(jump)jump.hidden=host.scrollHeight-host.scrollTop-host.clientHeight<100;};
  host.addEventListener('scroll',()=>{resizeMessages();const near=host.scrollHeight-host.scrollTop-host.clientHeight<100;host.dataset.follow=String(near);const jump=$('[data-action=bottom]');if(jump)jump.hidden=near;if(near)markRead().catch(()=>{});},{passive:true});
  host.addEventListener('load',()=>{if(host.dataset.follow==='true')host.scrollTop=host.scrollHeight;},true);
  messageSizeObserver?.disconnect();if(window.ResizeObserver){messageSizeObserver=new ResizeObserver(resizeMessages);messageSizeObserver.observe(host);}
  $('#messageSearch').addEventListener('input',()=>{clearTimeout(messageSearchTimer);messageSearchTimer=setTimeout(searchMessages,350);});
  $('[data-action=bottom]').hidden=true;
}
async function refreshMessages(initial=false,older=false) {
  const active=app.active;if(!active || stopped)return;
  const epoch=app.epoch,request=++app.messageEpoch;
  let rows;
  if(active.kind==='saved')rows=[...(await api.saved()),...app.state.notes].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  else if(active.kind==='channel')rows=await api.posts(active.id,older?app.messages[0]:null);
  else rows=await api.messagePage(active.id,older?app.messages[0]:null);
  if(!isCurrent(epoch,active.id)||request!==app.messageEpoch)return;
  if(active.kind==='saved')app.more=false;
  else if(initial||older)app.more=rows.length===60;
  if(older)app.messages=unique([...rows,...app.messages]);
  else if(initial || active.kind==='saved')app.messages=rows;
  else{const freshIds=new Set(rows.map(x=>sid(x.id)));const earliest=rows[0]?.created_at;app.messages=unique([...app.messages.filter(x=>!freshIds.has(sid(x.id))&&earliest&&new Date(x.created_at)<new Date(earliest)),...rows]);}
  const ids=app.messages.filter(x=>!x.note).map(x=>x.saved_original || x.id);
  const followups=await Promise.allSettled([
    active.kind==='saved'?Promise.resolve([]):api.reactions(ids,active.kind==='channel'),
    ['direct','group'].includes(active.kind)?api.pins(active.id):Promise.resolve([]),
    ['direct','group'].includes(active.kind)?api.replyMessages([...new Set(app.messages.map(x=>x.reply_to).filter(Boolean))]):Promise.resolve([])
  ]);
  if(!isCurrent(epoch,active.id)||request!==app.messageEpoch)return;
  if(followups[0].status==='fulfilled')app.reactions=followups[0].value;
  if(followups[1].status==='fulfilled')app.pins=followups[1].value;
  if(followups[2].status==='fulfilled')app.replyLookup=Object.fromEntries(followups[2].value.map(x=>[sid(x.id),x]));
  renderMessages(initial,older);renderPinned();
}
function renderMessages(initial=false,older=false) {
  const host=$('#messages');if(!host)return;
  const scroll=host.scrollTop,height=host.scrollHeight,near=initial||height-host.clientHeight-scroll<110;
  const nodes=new Map([...host.children].map(node=>[node.dataset.key,node]));const desired=[];
  if(app.more){let button=nodes.get('older')||document.createElement('button');button.className='load-older';button.dataset.key='older';button.dataset.action='older';button.textContent='Предыдущие сообщения';desired.push(button);}
  let date='';
  for(const message of app.messages){
    const d=day(message.created_at);if(d!==date){date=d;const k='date-'+new Date(message.created_at).toDateString();let node=nodes.get(k)||document.createElement('div');node.className='date-separator';node.dataset.key=k;node.textContent=d;desired.push(node);}
    const k='m-'+sid(message.id);let node=nodes.get(k)||document.createElement('div');
    const html=V.messageHTML({...message,body:applyIncomingCensorship(message.body)},app);node.dataset.key=k;node.dataset.mid=sid(message.id);node.className='message-row '+((message.sender_id===app.user.id||message.note)?'own':'');
    if(node._html!==html){updateMessageNode(node,html);node._html=html;}
    desired.push(node);
  }
  if(!app.messages.length){const node=document.createElement('div');node.className='empty-messages';node.dataset.key='empty';node.innerHTML=`${icon(app.active.kind==='saved'?'saved':'chats')}<h3>${app.active.kind==='channel'?'Здесь пока тихо.':'Начнём разговор?'}</h3><p>${app.active.kind==='saved'?'Добавь заметку или сохрани сообщение из чата.':app.active.kind==='channel'?'Новые публикации появятся здесь.':'Напиши первое сообщение.'}</p>`;desired.push(node);}
  // Move only nodes whose position changed. Existing video/audio elements survive.
  let cursor=host.firstChild;const keep=new Set(desired);
  for(const node of desired){if(node===cursor)cursor=cursor.nextSibling;else host.insertBefore(node,cursor);}
  for(const node of [...host.children])if(!keep.has(node))node.remove();
  host.dataset.follow=String(near&&!older);
  if(older)host.scrollTop=scroll+host.scrollHeight-height;
  else if(near)host.scrollTop=host.scrollHeight;
  const jump=$('[data-action=bottom]');if(jump)jump.hidden=host.scrollHeight-host.clientHeight-host.scrollTop<100;
}
function updateMessageNode(node,html){
  if(!node.querySelector('.attachment')){node.innerHTML=html;return;}
  const next=document.createElement('div');next.innerHTML=html;
  const oldStable=node.cloneNode(true),newStable=next.cloneNode(true);
  for(const selector of ['.message-meta','.reaction-list']){oldStable.querySelector(selector)?.remove();newStable.querySelector(selector)?.remove();}
  if(oldStable.innerHTML!==newStable.innerHTML){node.innerHTML=html;return;}
  // Receipts and reactions should never restart an audio/video attachment.
  const meta=node.querySelector('.message-meta'),newMeta=next.querySelector('.message-meta');if(meta&&newMeta)meta.innerHTML=newMeta.innerHTML;
  const reactions=node.querySelector('.reaction-list'),newReactions=next.querySelector('.reaction-list');
  if(reactions&&newReactions)reactions.innerHTML=newReactions.innerHTML;
  else if(reactions)reactions.remove();
  else if(newReactions)node.querySelector('.bubble').insertBefore(newReactions,meta);
}
function renderPinned() {
  const host=$('#pinnedBanner');if(!host)return;host.hidden=!app.pins.length;if(!app.pins.length)return;
  const pin=app.pins[app.pins.length-1],message=app.messages.find(x=>sid(x.id)===sid(pin.message_id));
  host.innerHTML=`${icon('pin')}<button data-jump="${esc(pin.message_id)}"><b>Закреплённое сообщение${app.pins.length>1?' · '+app.pins.length:''}</b><span>${esc(message?preview(message):'Открыть сообщение #'+pin.message_id)}</span></button>`;
}
async function markRead(){const a=app.active,host=$('#messages');if(!a||!['direct','group'].includes(a.kind)||document.hidden||!host||host.scrollHeight-host.clientHeight-host.scrollTop>110)return;await api.markRead(a.id);const dialog=app.dialogs.find(x=>x.id===a.id);if(dialog?.unread){dialog.unread=0;renderSidebar();applyLanguage();}}
function subscribeActive() {
  stopSubscriptions();const active=app.active;if(!active||active.kind==='saved')return;
  const refresh=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refreshMessages().then(markRead).catch(()=>connection('Не удалось обновить чат',true));},180);};
  if(active.kind==='channel'){
    app.rt.push(api.watch('rndm_channel_posts','channel_id=eq.'+active.id,refresh));app.rt.push(api.watch('rndm_channel_reactions',null,refresh));
  }else{
    app.rt.push(api.watch('messages','conversation_id=eq.'+active.id,refresh));app.rt.push(api.watch('message_reactions','conversation_id=eq.'+active.id,refresh));app.rt.push(api.watch('pinned_messages','conversation_id=eq.'+active.id,refresh));
    app.rt.push(api.watch('conversation_members','conversation_id=eq.'+active.id,async()=>{const epoch=app.epoch;try{const info=await api.info(active.id);if(isCurrent(epoch,active.id)){app.info=info;renderMessages();}}catch{}}));
    app.rt.push(api.watch('typing_states','conversation_id=eq.'+active.id,updateTypers));
  }
}
let lastTyping=0;
function sendTyping(){if(Date.now()-lastTyping<2500)return;lastTyping=Date.now();api.typing(app.active.id).catch(()=>{});}
async function updateTypers(){const a=app.active,epoch=app.epoch;if(!a||!['direct','group'].includes(a.kind))return;try{const rows=await api.typers(a.id);if(!isCurrent(epoch,a.id)||!$('#typingLine')||record)return;$('#typingLine').textContent=rows.map(row=>(app.peopleMap[row.user_id]?.display_name||'Собеседник')+(row.activity==='recording'?' записывает голосовое…':' печатает…')).join(', ');clearTimeout(typingTimer);typingTimer=setTimeout(()=>{if(isCurrent(epoch,a.id)&&$('#typingLine')&&!record)$('#typingLine').textContent='';},6000);}catch{}}
function renderCompose() {
  const input=$('#messageInput');if(!input)return;input.style.height='auto';input.style.height=Math.min(input.scrollHeight,innerWidth<=760?100:150)+'px';
  const context=$('#replyContext'),target=app.edit||app.reply;context.hidden=!target;
  if(target)context.innerHTML=`${icon(app.edit?'edit':'reply')}<div class="context-text"><b>${app.edit?'Редактирование':'Ответ на сообщение'}</b><p>${esc(preview(target))}</p></div>${ib('close','Отменить','cancel-context','small')}`;
  const file=fileFor(),fileHost=$('#fileContext');fileHost.hidden=!file;
  if(file)fileHost.innerHTML=`${file.url?`<img class="file-preview-thumb" src="${esc(file.url)}" alt="">`:icon('file')}<div class="context-text"><b>${esc(file.file.name)}</b><p>${bytes(file.file.size)} · файл готов к отправке</p><p class="attachment-warning">⚠️ Пока ссылка на вложение доступна каждому, у кого она есть. Не отправляй документы, пароли и конфиденциальные файлы.</p></div>${file.file.type.startsWith('image/')?ib('edit','Редактор фото','edit-photo','small'):''}${ib('close','Убрать вложение','remove-file','small')}`;
  const pending=app.pending.has(activeKey());$('#sendButton').disabled=pending||!!record||(!input.value.trim()&&!file);$('#sendButton').title=pending?'Отправляем…':app.edit?'Сохранить изменение':'Отправить сообщение';
  $('[data-action=voice]').disabled=pending||!!app.edit||!!file||voiceBusy;
  $('[data-action=voice]').classList.toggle('active',!!record);$('[data-action=voice]').setAttribute('aria-label',record?'Остановить запись':'Записать голосовое');
  if(record)$('#typingLine').textContent='Запись '+Math.floor((Date.now()-record.started)/1000)+' с · нажми микрофон, чтобы остановить';
  if(pending)$('#typingLine').textContent='Отправляем'+(file?' вложение…':'…');
  $('#messages')?.classList.toggle('recording',!!record);
}
function clearFile(key=activeKey()) { const file=app.files.get(key);if(file?.url)URL.revokeObjectURL(file.url);app.files.delete(key);if(key===activeKey())renderCompose(); }
function selectFile(file) {
  if(!file)return;if(app.edit){toast('Сначала закончи редактирование');return;}if(!file.size||file.size>window.RNDM_CONFIG.maxFileBytes){toast(file.size?'Максимальный размер — 50 МБ':'Файл пустой');return;}
  clearFile();app.files.set(activeKey(),{file,url:file.type.startsWith('image/')?URL.createObjectURL(file):null});$('#attachmentInput').value='';renderCompose();
}
async function send() {
  const active=app.active,input=$('#messageInput');if(!active||!input||record)return;
  const key=activeKey(),original=input.value,file=fileFor();let body=original.trim();if(app.pending.has(key)||(!body&&!file))return;
  if(body&&active.kind!=='saved'){const check=filterOutgoing(body);if(!check.ok){$('#sendError').textContent=check.reason;return;}body=check.text;}
  const reply=app.reply,edit=app.edit,epoch=app.epoch;app.pending.add(key);$('#sendError').textContent='';captureDraft();renderCompose();
  try {
    if(edit){if(!body)throw new Error('Текст сообщения не может быть пустым.');await api.edit(edit.id,body);}
    else if(active.kind==='saved'){
      let upload=null;if(file)upload=await api.upload('chat-files',file.file,'saved');
      const note={id:'note-'+crypto.randomUUID(),note:true,sender_id:app.user.id,body,created_at:new Date().toISOString(),attachment_url:upload?.url,attachment_name:upload?.name,attachment_type:upload?.type};
      try{await changeState(state=>({...state,notes:[...(state.notes||[]),note]}));}catch(error){if(upload&&!/fetch|network|abort|timeout/i.test(error.message||''))await api.sb.storage.from(upload.bucket).remove([upload.path]);throw error;}
    }else if(active.kind==='channel')await api.publish(active.id,body,file?.file);
    else await api.send(active.id,body,file?.file,reply?{reply_to:reply.id}:{});
    if(!edit)clearDraft(active,original);
    if(app.files.get(key)===file)clearFile(key);
    if(isCurrent(epoch,active.id)){
      if(edit && app.edit===edit){cancelEdit();}
      else if(input.value===original)input.value='';
      if(app.reply===reply)app.reply=null;renderCompose();
      await refreshMessages().then(markRead).catch(()=>toast('Сообщение отправлено. Обнови чат, чтобы увидеть его.'));
    }
    await refreshLists().catch(()=>connection('Сообщение отправлено · список обновится позже',true));
  }catch(error){if(isCurrent(epoch,active.id)&&$('#sendError'))$('#sendError').textContent=errorText(error);else toast(errorText(error));}
  finally{app.pending.delete(key);if(isCurrent(epoch,active.id)){if($('#typingLine'))$('#typingLine').textContent='';renderCompose();}}
}
async function voice() {
  if(record){record.recorder.stop();return;}
  if(voiceBusy)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Запись доступна в браузере с микрофоном через HTTPS или localhost.');return;}
  if(app.edit||app.pending.has(activeKey()))return;
  const epoch=app.epoch,key=activeKey();voiceBusy=true;renderCompose();
  try {
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(epoch!==app.epoch){stream.getTracks().forEach(x=>x.stop());return;}
    const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(x=>MediaRecorder.isTypeSupported(x));
    const recorder=new MediaRecorder(stream,type?{mimeType:type}:{}),chunks=[];
    record={recorder,stream,started:Date.now(),key,cancelled:false};const snapshot=record;
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onerror=()=>{snapshot.cancelled=true;cleanupVoice(snapshot);toast('Не удалось записать звук. Проверь микрофон.');};
    recorder.onstop=()=>{
      const blob=new Blob(chunks,{type:recorder.mimeType || 'audio/webm'});cleanupVoice(snapshot);
      if(snapshot.cancelled||epoch!==app.epoch||!blob.size)return;
      const ext=blob.type.includes('mp4')?'m4a':'webm';selectFile(new File([blob],'voice-'+Date.now()+'.'+ext,{type:blob.type}));toast('Голосовое готово. Нажми отправить.');
    };
    recorder.start(500);record.timer=setInterval(renderCompose,1000);record.limit=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},120000);renderCompose();
    if(['direct','group'].includes(app.active.kind))api.typing(app.active.id,'recording').catch(()=>{});
  }catch(error){toast(error.name==='NotAllowedError'?'Разреши доступ к микрофону в настройках браузера.':errorText(error));}
  finally{voiceBusy=false;renderCompose();}
}
function cleanupVoice(snapshot){clearInterval(snapshot.timer);clearTimeout(snapshot.limit);snapshot.stream.getTracks().forEach(x=>x.stop());if(record===snapshot)record=null;if($('#typingLine'))$('#typingLine').textContent='';renderCompose();}
function cancelVoice(){if(!record)return;record.cancelled=true;if(record.recorder.state!=='inactive')record.recorder.stop();cleanupVoice(record);}

async function newConversation() {
  showModal('Новое общение',`<label class="searchbox modal-search">${icon('search')}<input id="newPeopleQuery" placeholder="Имя или @username" autocomplete="off" aria-label="Найти человека"></label><div class="modal-list" id="newPeopleResults"><p class="muted" style="font-size:12px;padding:15px 8px">Найди человека и открой личный чат.</p></div><div class="modal-actions"><button class="secondary" data-action="new-group">${icon('contacts')}Группа</button><button class="secondary" data-action="new-channel">${icon('channels')}Канал</button></div>`);
  const input=$('#newPeopleQuery');let timer,version=0;
  input.oninput=()=>{clearTimeout(timer);const current=++version;timer=setTimeout(async()=>{try{const people=await api.people(input.value);if(current!==version||!$('#newPeopleResults'))return;people.forEach(p=>app.peopleMap[p.id]=p);$('#newPeopleResults').innerHTML=people.map(x=>V.personRow(x,'new-direct')).join('')||'<p class="muted" style="padding:14px;font-size:12px">Никого не найдено. Введи хотя бы 2 символа.</p>';}catch(error){if($('#newPeopleResults'))showError($('#newPeopleResults'),error);}},300);};
}
async function openDirect(uid) { const cid=await api.direct(uid);if(!cid)throw new Error('Сервер не вернул адрес чата.');modal.close();await refreshLists();await openConversation(cid); }
async function newGroup() {
  const friends=await api.friends();const people=friends.filter(x=>x.status==='accepted'&&x.person).map(x=>x.person);
  showModal('Новая группа',`<form id="groupForm"><label class="field">Название<input id="groupName" placeholder="Например, Наш круг" maxlength="80" minlength="2" required></label><p class="muted" style="font-size:11px;margin:15px 0">Добавь участников из своих контактов.</p><div class="modal-list">${people.map(p=>`<label class="select-person"><input type="checkbox" name="member" value="${esc(p.id)}">${avatar(p,'small')}<div><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div></label>`).join('')||'<p class="muted" style="font-size:12px;padding:10px">Сначала добавь людей в контакты.</p>'}</div><div id="modalError"></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button type="submit" class="primary">Создать группу</button></div></form>`);
  $('#groupForm').onsubmit=async e=>{e.preventDefault();const b=$('button[type=submit]',e.currentTarget);b.disabled=true;try{const ids=new FormData(e.currentTarget).getAll('member');if(!ids.length)throw new Error('Выбери хотя бы одного участника.');const cid=await api.group($('#groupName').value.trim(),ids);if(!cid)throw new Error('Сервер не подтвердил создание группы.');modal.close();await refreshLists();await openConversation(cid);}catch(error){showError($('#modalError'),error);}finally{b.disabled=false;}};
}
function newChannel() {
  showModal('Новый канал',`<form id="channelForm"><label class="field">Название<input id="channelName" placeholder="Имя твоего канала" minlength="2" maxlength="15" required></label><label class="field">Описание<textarea id="channelDescription" rows="3" maxlength="50" placeholder="О чём здесь будут публикации?"></textarea></label><p class="muted" style="font-size:11px;line-height:1.7">Публикации доступны читателям. Писать посты может владелец канала.</p><div id="modalError"></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button class="primary" type="submit">Создать канал</button></div></form>`);
  $('#channelForm').onsubmit=async e=>{e.preventDefault();const b=$('button[type=submit]',e.currentTarget);b.disabled=true;try{const ch=await api.createChannel($('#channelName').value.trim(),$('#channelDescription').value.trim());modal.close();await navigate('channels');await openChannel(ch.id);}catch(error){showError($('#modalError'),error);}finally{b.disabled=false;}};
}
async function showPerson(uid){
 if(modal.open)modal.close();
 if(!uid)return;
 previousRoute=app.route;previousChatId=app.active?.kind==='direct'?app.active.id:null;app.profileTarget=uid;
 await navigate('profile');
}

function chatMenu(anchor) {
  const a=app.active;if(!a)return;const pref=app.prefs[a.id]||{};
  let html=`<button data-action="info">${icon('info')}Информация</button>`;
  if(['direct','group'].includes(a.kind))html+=`<button data-action="pin-chat">${icon('pin')}${pref.is_pinned?'Открепить чат':'Закрепить чат'}</button><button data-action="archive-chat">${icon('archive')}${pref.is_archived?'Вернуть из архива':'В архив'}</button><button data-action="mute-chat">${icon('mute')}${app.state.muted.includes(a.id)?'Включить уведомления':'Без уведомлений'}</button><button data-action="chat-wallpaper">${icon('image')}Фон чата</button><button data-action="schedule-message">🕒 Отложить сообщение</button>`;
  if(a.kind==='channel')html+=`<button data-action="join-channel">${icon(a.joined?'close':'plus')}${a.joined?'Отписаться':'Подписаться'}</button>`;
  html+=`<button data-action="refresh-chat">${icon('refresh')}Обновить</button>`;showPop(anchor,html);
}
function messageMenu(id,anchor) {
  const m=currentMessage(id);if(!m||m.deleted_at)return;const own=m.sender_id===app.user.id,a=app.active;let html='';
  if(a.kind!=='saved')html=`<div class="quick-reactions">${['❤️','👍','🔥','😂','😮','🎉'].map(emoji=>`<button data-reaction="${esc(m.id)}" data-emoji="${emoji}" aria-label="Реакция ${emoji}">${emoji}</button>`).join('')}</div>`;
  if(['direct','group'].includes(a.kind))html+=`<button data-reply="${esc(m.id)}">${icon('reply')}Ответить</button><button data-forward="${esc(m.id)}">${icon('forward')}Переслать</button><button data-save="${esc(m.id)}">${icon('saved')}В избранное</button><button data-pin-message="${esc(m.id)}">${icon('pin')}${app.pins.some(x=>sid(x.message_id)===sid(m.id))?'Снять закрепление':'Закрепить'}</button>`;
  if(m.body)html+=`<button data-copy="${esc(m.id)}">${icon('copy')}Копировать текст</button>`;
  if(own&&['direct','group'].includes(a.kind)&&m.body)html+=`<button data-edit="${esc(m.id)}">${icon('edit')}Изменить</button>`;
  if((own&&['direct','group'].includes(a.kind))||(a.kind==='channel'&&a.owner_id===app.user.id)||a.kind==='saved')html+=`<button class="danger" data-delete="${esc(m.id)}">${icon('trash')}${a.kind==='saved'?'Убрать из избранного':'Удалить'}</button>`;
  showPop(anchor,html);
}
function info() {
  const a=app.active;if(!a)return;
  $('#detail')?.remove();
  const person=a.kind==='saved'?{display_name:'Избранное'}:a.kind==='channel'?a:app.info.profiles.find(p=>p.id!==app.user.id)||app.profile;
  const title=a.kind==='group'?app.info.conv.title:person.display_name || person.title || person.username;
  const attachments=app.messages.filter(x=>x.attachment_url&&!x.deleted_at),images=attachments.filter(x=>x.attachment_type?.startsWith('image/'));
  const html=`<aside class="detail" id="detail"><div class="detail-head"><h3>Информация</h3>${ib('close','Закрыть информацию','close-info')}</div><div class="detail-profile">${avatar(person,'large',a.kind==='group'?'contacts':a.kind==='channel'?'channels':a.kind==='saved'?'saved':'')}<h2>${esc(title)}</h2><p>${esc(a.description || person.bio || (a.kind==='saved'?'Твоё личное пространство':a.kind==='group'?app.info.members.length+' участников':person.username?'@'+person.username:''))}</p></div>
    ${['direct','group'].includes(a.kind)?`<section class="detail-section"><button class="detail-action" data-action="pin-chat">${icon('pin')}${app.prefs[a.id]?.is_pinned?'Открепить чат':'Закрепить чат'}</button><button class="detail-action" data-action="archive-chat">${icon('archive')}${app.prefs[a.id]?.is_archived?'Вернуть из архива':'Отправить в архив'}</button>${a.kind==='direct'?`<button class="detail-action" data-person="${esc(person.id)}">${icon('contacts')}Профиль собеседника</button>`:''}</section>`:''}
    ${a.kind==='group'?`<section class="detail-section"><h3>Участники</h3>${app.info.profiles.map(p=>`<button class="detail-person" data-person="${esc(p.id)}">${avatar(p,'small')}<span><b>${esc(p.display_name || p.username)}</b><small>@${esc(p.username)}</small></span></button>`).join('')}</section>`:''}
    <section class="detail-section"><h3>Медиа и файлы</h3><p class="muted" style="font-size:10px;margin-bottom:13px">Из загруженной части переписки. Больше — через поиск.</p>${images.length?`<div class="media-grid">${images.map(m=>`<a href="${esc(safeURL(m.attachment_url))}" target="_blank" rel="noopener noreferrer"><img src="${esc(safeURL(m.attachment_url))}" alt="${esc(m.attachment_name || 'Изображение')}" loading="lazy"></a>`).join('')}</div>`:''}${attachments.filter(x=>!x.attachment_type?.startsWith('image/')).map(m=>`<a class="media-file" href="${esc(safeURL(m.attachment_url))}" target="_blank" rel="noopener noreferrer">${icon('file')}<span>${esc(m.attachment_name || 'Файл')}</span></a>`).join('')}${!attachments.length?'<p class="muted" style="font-size:12px">Файлов пока нет.</p>':''}</section></aside>`;
  $('#pane').insertAdjacentHTML('beforeend',html);
}
function wallpaper() {
  showModal('Фон чата',`<p>Выбери настроение для этой переписки.</p><div class="theme-swatches">${['default','violet','mint','ocean','sunset'].map(t=>`<button class="theme-swatch ${t}" data-chat-wallpaper="${t}" aria-label="${t}"></button>`).join('')}</div><div id="modalError"></div>`);
}
async function forward(id) {
  const m=currentMessage(id);if(!m)return;
  const targetDialogs=app.dialogs.filter(x=>x.id!==app.active.id);
  showModal('Переслать сообщение',`<p>${esc(preview(m).slice(0,180))}</p><div class="modal-list">${targetDialogs.map(x=>`<button class="chat-row" data-forward-target="${esc(x.id)}">${avatar(x)}<span class="row-content"><span class="row-name">${esc(x.title)}</span></span>${icon('chevron')}</button>`).join('')||'<p class="muted" style="font-size:12px;padding:12px">Сначала начни ещё один разговор.</p>'}</div><div id="modalError"></div>`);
  modal.querySelectorAll('[data-forward-target]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api.send(button.dataset.forwardTarget,m.body||'',null,{attachment_url:m.attachment_url,attachment_name:m.attachment_name,attachment_type:m.attachment_type,forwarded_from:m.id});modal.close();toast('Сообщение переслано');await refreshLists();}catch(error){showError($('#modalError'),error);button.disabled=false;}});
}
async function deleteMessage(id) {
  const m=currentMessage(id),active={...app.active};if(!m)return;
  confirmAction(active.kind==='saved'?'Убрать из избранного?':'Удалить сообщение?',active.kind==='saved'?'Оригинал в переписке останется.':'Сообщение будет удалено для участников этой переписки.',async()=>{
    if(active.kind==='saved'){if(m.note)await changeState(s=>({...s,notes:s.notes.filter(x=>x.id!==m.id)}));else await api.unsave(m.saved_original);}
    else if(active.kind==='channel')await api.deletePost(m.id);else await api.remove(m.id);
    if(app.active?.id===active.id)await refreshMessages();await refreshLists();
  },active.kind==='saved'?'Убрать':'Удалить');
}
async function comments(id) {
  const rows=await api.comments(id);
  const render=rows=>rows.map(c=>`<div class="comment-row">${avatar(c.person,'small')}<div class="comment-content"><b>${esc(c.person?.display_name || 'Пользователь')}</b><small>${time(c.created_at)}</small><p>${richText(c.body)}</p></div></div>`).join('')||'<p class="muted" style="font-size:12px;padding:15px 0">Начни обсуждение этой публикации.</p>';
  showModal('Комментарии',`<div id="commentsList" class="comments-list">${render(rows)}</div><form class="comment-form" id="commentForm"><textarea name="body" rows="2" maxlength="2000" required placeholder="Напиши комментарий…" aria-label="Комментарий"></textarea><button type="submit" class="primary" aria-label="Отправить комментарий">${icon('send')}</button></form><div id="modalError"></div>`);
  $('#commentForm').onsubmit=async e=>{e.preventDefault();const input=$('textarea',e.currentTarget),button=$('button',e.currentTarget),original=input.value,body=original.trim();if(!body)return;button.disabled=true;try{await api.comment(id,body);if(input.value===original)input.value='';const fresh=await api.comments(id);if($('#commentsList'))$('#commentsList').innerHTML=render(fresh);}catch(error){showError($('#modalError'),error);}finally{button.disabled=false;}};
}
let tapolkaPending=0,tapolkaTimer=null,tapolkaBusy=false,tapolkaMine=0,catState=null;

function renderRandomPage(){
  if(app.route!=='random')return;
  const el=$('#pane');if(!el)return;
  el.innerHTML=V.randomPage({searching:randomSearching,filterLanguage:randomLanguage,filterInterest:randomInterest,count:randomCount,matched:randomMatch,person:randomPerson,error:randomError,history:randomHistory});
  applyLanguage();
}
let randomError='';
async function openRandomPage(){
  randomError='';randomMatch=null;randomPerson=null;randomSearching=false;
  renderRandomPage();
  try{const [count,hist]=await Promise.all([api.randomWaitingCount(),api.randomHistory().catch(()=>[])]);randomCount=count;randomHistory=hist;if(app.route==='random')renderRandomPage();}
  catch{randomCount=null;}
}
async function stopRandomSearch(force=false){
  const wasActive=randomSearching||randomMatch;
  ++randomToken;clearTimeout(randomTimer);randomTimer=null;randomSearching=false;randomMatch=null;randomPerson=null;
  if(app.route==='random'&&!force)renderRandomPage();
  if(wasActive&&api?.uid){if(randomInFlight)await randomInFlight.catch(()=>{});await api.randomLeave();}
}
async function pollRandomSearch(token){
  if(!randomSearching||token!==randomToken||app.route!=='random'||document.hidden)return;
  try{
    const query=api.randomJoin(randomLanguage,randomInterest);randomInFlight=query;
    const [found,count]=await Promise.all([query,api.randomWaitingCount().catch(()=>null)]);
    if(randomInFlight===query)randomInFlight=null;
    if(token!==randomToken||app.route!=='random'||!randomSearching){
      return;
    }
    randomCount=count;
    if(found?.match_status==='matched'&&found.conversation_id&&found.matched_user_id){
      randomSearching=false;clearTimeout(randomTimer);
      randomMatch={conversation_id:found.conversation_id,matched_user_id:found.matched_user_id};
      try{randomPerson=await api.publicProfile(found.matched_user_id);}catch{randomPerson=null;}
      if(token===randomToken&&app.route==='random'){randomHistory=await api.randomHistory().catch(()=>randomHistory);renderRandomPage();}
      return;
    }
    renderRandomPage();
    randomTimer=setTimeout(()=>pollRandomSearch(token),3500);
  }catch(error){
    randomInFlight=null;
    if(token!==randomToken)return;
    randomSearching=false;randomError=errorText(error);clearTimeout(randomTimer);
    await api.randomLeave().catch(()=>{});
    if(app.route==='random')renderRandomPage();
  }
}
async function startRandomSearch(){
  if(randomSearching)return;
  const l=$('#randomLanguage')?.value||randomLanguage,i=$('#randomInterest')?.value||randomInterest;
  if(!['any','ru','en'].includes(l)||!['any','games','music','study','tech','movies','life'].includes(i))throw new Error('Некорректные фильтры поиска');
  randomLanguage=l;randomInterest=i;
  // Clear any matched session before starting another one.
  if(randomMatch)await stopRandomSearch(true);
  else await api.randomLeave();
  randomError='';randomMatch=null;randomPerson=null;randomSearching=true;
  const token=++randomToken;renderRandomPage();
  await pollRandomSearch(token);
}

async function openTapolka(){
  $('#pane').innerHTML='<div class="empty-messages"><span class="spinner"></span><h3>Открываем Тапалку…</h3></div>';
  const [board,base,cosmetics,own]=await Promise.all([catBoardMode==='weekly'?api.catWeeklyBoard():api.tapolkaLeaderboard(20),api.catState(),api.catCosmeticState(),api.catMyScore()]);const state={...base,...cosmetics};
  if(app.route!=='tapolka')return;
  catState=state;tapolkaMine=Number(own||state.total_taps||0);
  $('#pane').innerHTML=V.tapolka(app,board,tapolkaMine,state);$$('[data-action="cat-board-mode"]').forEach(b=>b.classList.toggle('active',b.dataset.mode===catBoardMode));applyLanguage();
}
async function flushTapolka(){
  if(tapolkaBusy||tapolkaPending<1)return;
  tapolkaBusy=true;const amount=Math.min(8,tapolkaPending);tapolkaPending-=amount;
  try{
    const result=await api.catTap(amount);
    tapolkaMine=Number(result.taps);if(catState){catState.energy=result.energy;catState.daily_taps=result.today_taps;catState.level=result.level;catState.stars_earned_today=Number(catState.stars_earned_today||0)+Number(result.stars_earned||0);}
    if(app.profile&&result.stars_earned)app.profile.stars=Number(app.profile.stars||0)+Number(result.stars_earned);
    const el=$('#tapolkaMine');if(el)el.textContent=Number(tapolkaMine+tapolkaPending).toLocaleString('ru-RU');
    if(result.stars_earned){toast('🐱 Задание выполнено: +'+result.stars_earned+' ⭐');renderSidebar();}
    const energy=$('#catEnergyText');if(energy)energy.textContent=result.energy+' / '+result.max_energy;
    const bar=$('#catEnergyBar');if(bar)bar.style.width=Math.max(0,100*result.energy/Math.max(1,result.max_energy))+'%';
    const today=$('#catDailyTaps');if(today)today.textContent=result.today_taps;
    const stars=$('#catStarsEarned');if(stars)stars.textContent=catState.stars_earned_today+' / 24';
    const level=$('#catLevel');if(level)level.textContent=result.level;
  }catch(error){tapolkaPending=0;const counter=$('#tapolkaMine');if(counter)counter.textContent=Number(tapolkaMine).toLocaleString('ru-RU');const pending=$('#tapolkaPending');if(pending)pending.textContent='';toast(errorText(error));catState=await api.catState().catch(()=>catState);}
  finally{tapolkaBusy=false;if(tapolkaPending>0)tapolkaTimer=setTimeout(flushTapolka,320);else refreshTapolkaBoard().catch(()=>{});}
}
async function refreshTapolkaBoard(){if(app.route!=='tapolka')return;const board=catBoardMode==='weekly'?await api.catWeeklyBoard():await api.tapolkaLeaderboard(20);const host=$('#tapolkaBoard');if(!host)return;host.innerHTML=board.map((x,i)=>`<div class="tapolka-rank ${x.user_id===app.user.id?'mine':''}"><span class="tapolka-place">${i+1}</span>${avatar(x)}<span class="row-content"><b>${esc(x.display_name||x.username||'Игрок')}</b><small>@${esc(x.username||'user')}</small></span><strong>${Number(x.taps||0).toLocaleString('ru-RU')}</strong></div>`).join('')||'<div class="sidebar-empty"><p>Рейтинг пока пуст.</p></div>';}
function tapolkaTap(){if(catState&&catState.energy<=tapolkaPending){toast('⚡ Энергия котика закончилась. Подожди восстановления.');return;}tapolkaPending++;const score=$('#tapolkaMine');if(score)score.textContent=Number(tapolkaMine+tapolkaPending).toLocaleString('ru-RU');const b=$('#tapolkaButton');if(b){b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');}const p=$('#tapolkaPending');if(p)p.textContent=tapolkaPending>1?`+${tapolkaPending}`:'';clearTimeout(tapolkaTimer);tapolkaTimer=setTimeout(flushTapolka,450);}

async function searchMessages() {
  const input=$('#messageSearch');if(!input||!app.active)return;const value=input.value.trim(),active={...app.active},epoch=app.epoch;
  const host=$('#messageSearchResults');if(!value){host.hidden=true;host.innerHTML='';return;}host.hidden=false;host.innerHTML='<div class="sidebar-empty"><span class="spinner"></span></div>';
  try {
    let rows;
    if(active.kind==='saved')rows=app.messages.filter(x=>x.body?.toLowerCase().includes(value.toLowerCase()));
    else{
      const pattern='%'+value.replace(/[\\%_]/g,c=>'\\'+c)+'%';const table=active.kind==='channel'?'rndm_channel_posts':'messages',col=active.kind==='channel'?'channel_id':'conversation_id';
      let query=api.sb.from(table).select('*').eq(col,active.id).ilike('body',pattern).order('created_at',{ascending:false}).limit(80);
      if(active.kind!=='channel'){const now=new Date().toISOString();query=query.is('deleted_at',null).or(`scheduled_for.is.null,scheduled_for.lte.${now}`).or(`expires_at.is.null,expires_at.gt.${now}`);}
      const result=await query;if(result.error)throw result.error;rows=result.data||[];
    }
    if(!isCurrent(epoch,active.id)||$('#messageSearch')?.value.trim()!==value)return;
    host.innerHTML=rows.map(m=>`<button class="search-result" data-jump="${esc(m.id)}"><b>${day(m.created_at)} · ${time(m.created_at)}</b><p>${esc(m.body)}</p></button>`).join('')||'<div class="sidebar-empty"><p>Сообщения не найдены.</p></div>';
  }catch(error){if(isCurrent(epoch,active.id))showError(host,error);}
}
async function jumpMessage(id) {
  closePop();const epoch=app.epoch;let node=$$('[data-mid]').find(x=>x.dataset.mid===sid(id));
  // Load older pages without throwing away a saved draft or changing the chat.
  let pages=0;
  while(!node&&app.more&&pages++<20){await refreshMessages(false,true);if(epoch!==app.epoch)return;node=$$('[data-mid]').find(x=>x.dataset.mid===sid(id));}
  if(!node){toast('Сообщение недоступно или находится дальше в истории.');return;}
  $('#messageSearchResults').hidden=true;node.scrollIntoView({block:'center',behavior:'smooth'});node.classList.remove('message-highlight');void node.offsetWidth;node.classList.add('message-highlight');
}

let storyRequest=null,storyQueue=[],storyIndex=0,storyPreviewURL=null;
function storySeen(){return readLocal('rndm31-seen:'+app.user.id,[]);}
function renderStories(){
  const host=$('#storiesStrip');if(!host||!app.user)return;host.hidden=app.route!=='chats';if(host.hidden)return;
  const seen=storySeen(),groups=new Map();
  for(const story of (app.stories||[]).filter(x=>new Date(x.expires_at)>new Date())){const group=groups.get(story.user_id)||[];group.push(story);groups.set(story.user_id,group);}
  host.innerHTML=`<button type="button" class="story-chip story-add" data-action="new-story" aria-label="Добавить историю"><span class="story-ring">${avatar(app.profile)}<span class="story-plus">+</span></span><span>Моя история</span></button>`+[...groups.values()].map(rows=>{const story=[...rows].reverse().find(x=>!seen.includes(sid(x.id)))||rows[0],person=story.person||{display_name:'Пользователь'};return `<button class="story-chip ${rows.every(x=>seen.includes(sid(x.id)))?'seen':''}" data-story="${esc(story.id)}" aria-label="История: ${esc(person.display_name||person.username||'Пользователь')}"><span class="story-ring">${avatar(person)}</span><span>${esc(story.user_id===app.user.id?'Ты':person.display_name||person.username||'Пользователь')}</span></button>`;}).join('')+(app.storiesError?'<button class="story-retry text-button" data-action="retry-stories">Истории недоступны<br>Повторить</button>':'');
}
async function refreshStories(){
  if(!app.user||stopped)return;const uid=app.user.id;if(storyRequest?.uid===uid)return storyRequest.promise;
  const request={uid,promise:null};storyRequest=request;
  request.promise=(async()=>{try{const rows=await api.stories();if(app.user?.id!==uid||stopped)return;app.stories=rows;app.storiesError='';}catch(error){if(app.user?.id!==uid||stopped)return;app.storiesError=errorText(error);}finally{if(app.user?.id===uid&&!stopped)renderStories();if(storyRequest===request)storyRequest=null;}})();return request.promise;
}
function openStory(id){
  const story=(app.stories||[]).find(x=>sid(x.id)===sid(id));if(!story)return;
  storyQueue=app.stories.filter(x=>x.user_id===story.user_id&&new Date(x.expires_at)>new Date()).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  showStory(storyQueue.findIndex(x=>sid(x.id)===sid(id)));
}
function showStory(index){
  const story=storyQueue[index];if(!story)return;if(new Date(story.expires_at)<=new Date()){modal.close();refreshStories();toast('Срок этой истории закончился');return;}
  storyIndex=index;const person=story.person||{display_name:'Пользователь'},url=safeURL(story.media_url);
  const media=url&&story.media_type==='image'?`<img src="${esc(url)}" alt="Фото в истории">`:url&&story.media_type==='video'?`<video src="${esc(url)}" controls playsinline preload="metadata" aria-label="Видео в истории"></video>`:'';
  showModal(person.display_name||person.username||'История',`<div class="story-view"><div class="story-meta">${avatar(person,'small')}<span>${day(story.created_at)} · ${time(story.created_at)}</span><span>${index+1} / ${storyQueue.length}</span></div><div class="story-content">${media}${story.body?`<p>${esc(story.body)}</p>`:''}</div><div class="story-controls"><button class="secondary" data-action="story-prev" ${index===0?'disabled':''} aria-label="Предыдущая история">${icon('back')}</button><span class="muted">Исчезнет через ${Math.max(1,Math.ceil((new Date(story.expires_at)-Date.now())/3600000))} ч.</span><button class="secondary" data-action="story-next" ${index===storyQueue.length-1?'disabled':''} aria-label="Следующая история">${icon('chevron')}</button></div>${story.user_id===app.user.id?`<button class="text-button danger" data-story-delete="${esc(story.id)}">Удалить историю</button>`:''}</div>`);
  const seen=storySeen();if(!seen.includes(sid(story.id))){writeLocal('rndm31-seen:'+app.user.id,[...seen,sid(story.id)].slice(-500));api.viewStory(story.id).catch(()=>{});renderStories();}
}
function clearStoryPreview(){if(storyPreviewURL){URL.revokeObjectURL(storyPreviewURL);storyPreviewURL=null;}}
modal.addEventListener('close',clearStoryPreview);
function newStory(){
  clearStoryPreview();showModal('Новая история',`<form id="storyForm"><p class="muted story-note">Текст, фото или видео на 24 часа. Истории видны пользователям RNDM, которым сервер разрешает их просмотр.</p><label class="field">Что нового?<textarea id="storyText" name="body" maxlength="1000" rows="4" placeholder="Поделись моментом…"></textarea></label><label class="secondary story-file">${icon('attach')}Добавить фото или видео<input id="storyFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"></label><div id="storyPreview" class="story-preview"></div><div id="storyError" role="alert"></div><button class="primary" type="submit">Опубликовать на 24 часа</button></form>`);
  const form=$('#storyForm');$('#storyFile').onchange=event=>{clearStoryPreview();const file=event.target.files?.[0],host=$('#storyPreview');host.innerHTML='';if(!file)return;if(!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.type)||file.size>window.RNDM_CONFIG.maxFileBytes){event.target.value='';host.textContent='Фото или видео до 50 МБ в поддерживаемом формате.';return;}storyPreviewURL=URL.createObjectURL(file);host.innerHTML=(file.type.startsWith('image/')?`<img src="${storyPreviewURL}" alt="Предпросмотр истории">`:`<video src="${storyPreviewURL}" controls playsinline></video>`)+`<span>${esc(file.name)}</span><button type="button" class="text-button" id="removeStoryFile">Убрать файл</button>`;$('#removeStoryFile').onclick=()=>{clearStoryPreview();$('#storyFile').value='';host.innerHTML='';};};
  form.onsubmit=event=>{event.preventDefault();const body=$('#storyText').value.trim(),file=$('#storyFile').files?.[0],button=$('[type=submit]',form),uid=app.user.id;guarded('post-story',async()=>{try{if(!body&&!file)throw new Error('Добавь текст, фото или видео.');await api.createStory(body,file);if(app.user?.id!==uid)return;if(form.isConnected)modal.close();await refreshStories();toast('История опубликована на 24 часа');}catch(error){if(form.isConnected)showError($('#storyError'),error);}},button);};
}

const locks=new Set();
async function guarded(key,fn,button){if(locks.has(key))return;locks.add(key);if(button)button.disabled=true;try{await fn();}catch(error){toast(errorText(error));}finally{locks.delete(key);if(button?.isConnected)button.disabled=false;}}
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  const d=button.dataset;
  if(d.callUser){guarded('call',async()=>{const person=(await api.profiles([d.callUser]))[0];if(!person)throw new Error('Пользователь недоступен.');await calls.dial(person,d.callMode||'audio');},button);return;}
  if(d.story){openStory(d.story);return;}
  if(d.storyDelete){confirmAction('Удалить историю?','Она исчезнет из ленты.',async()=>{await api.deleteStory(d.storyDelete);await refreshStories();});return;}
  if(d.auth){const email=$('#authForm [name=email]')?.value||'';auth(d.auth,email);return;}
  if(d.nav){navigate(d.nav).catch(error=>toast(errorText(error)));return;}
  if(d.folder){app.folder=d.folder;renderSidebar();applyLanguage();return;}
  if(d.open){guarded('open:'+d.open,()=>d.kind==='channel'?openChannel(d.open):d.kind==='saved'?openSaved():openConversation(d.open));return;}
  if(d.retryChat){guarded('retry',()=>openConversation(d.retryChat));return;}
  if(d.person){guarded('person',()=>showPerson(d.person));return;}
  if(d.contact){guarded('direct',()=>openDirect(d.contact),button);return;}
  if(d.newDirect){guarded('direct',()=>openDirect(d.newDirect),button);return;}
  if(d.accept){guarded('friend',async()=>{await api.accept(d.accept);app.friends=await api.friends();renderSidebar();applyLanguage();},button);return;}
  if(d.decline){guarded('friend',async()=>{await api.removeFriend(d.decline);app.friends=await api.friends();renderSidebar();applyLanguage();},button);return;}
  if(d.messageMenu){messageMenu(d.messageMenu,button);return;}
  if(d.reaction){const active={...app.active},epoch=app.epoch;guarded('reaction:'+d.reaction+':'+d.emoji,async()=>{closePop();await api.react(active.id,d.reaction,d.emoji,active.kind==='channel');if(isCurrent(epoch,active.id))await refreshMessages();},button);return;}
  if(d.reply){app.reply=currentMessage(d.reply);cancelEdit();closePop();renderCompose();$('#messageInput').focus();return;}
  if(d.edit){const m=currentMessage(d.edit);if(!m)return;captureDraft();app.edit={...m,restore:$('#messageInput').value};app.reply=null;$('#messageInput').value=m.body;closePop();renderCompose();$('#messageInput').focus();return;}
  if(d.delete){closePop();deleteMessage(d.delete);return;}
  if(d.save){guarded('save',async()=>{closePop();await api.saveMessage(d.save);toast('В избранном');});return;}
  if(d.copy){guarded('copy',async()=>{await navigator.clipboard.writeText(currentMessage(d.copy)?.body||'');closePop();toast('Текст скопирован');});return;}
  if(d.forward){guarded('forward',()=>forward(d.forward));return;}
  if(d.pinMessage){const a={...app.active},remove=app.pins.some(x=>sid(x.message_id)===d.pinMessage);guarded('pin-msg',async()=>{closePop();await api.pinMessage(a.id,d.pinMessage,remove);if(app.active?.id===a.id)await refreshMessages();toast(remove?'Закрепление снято':'Сообщение закреплено');});return;}
  if(d.comments){guarded('comments',()=>comments(d.comments));return;}
  if(d.jump){guarded('jump',()=>jumpMessage(d.jump));return;}
  if(d.insertEmoji){const input=$('#messageInput'),start=input.selectionStart,end=input.selectionEnd;input.setRangeText(d.insertEmoji,start,end,'end');input.dispatchEvent(new Event('input'));input.focus();closePop();return;}
  if(d.setTheme){setTheme(d.setTheme);return;}
  if(d.wallpaper){guarded('state',async()=>{await changeState({wallpaper:d.wallpaper});$('#pane').innerHTML=V.settings(app);});return;}
  if(d.chatWallpaper){const a={...app.active};guarded('preference',async()=>{app.prefs[a.id]=await api.preference(a.id,{theme_id:d.chatWallpaper});if(app.active?.id===a.id)applyWallpaper();modal.close();});return;}
  if(d.action)handleAction(d.action,button).catch(error=>toast(errorText(error)));
});
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.dataset.setting)guarded('setting',async()=>{try{await changeState({[input.dataset.setting]:input.checked});}catch(error){input.checked=!input.checked;throw error;}});
  if(input.dataset.privacy)guarded('privacy',async()=>{try{const v=input.dataset.privacy==='allow_messages'?(input.checked?'everyone':'none'):input.checked;app.profile=await api.updateProfile({[input.dataset.privacy]:v});}catch(error){input.checked=!input.checked;throw error;}});
  if(input.closest('#profileStyleForm'))updateStylePreview();
  if(input.id==='avatarInput')uploadAvatar(input.files[0]);if(input.id==='coverInput')uploadCover(input.files[0]);
});
function updateStylePreview(){
  const form=$('#profileStyleForm'),preview=$('#profileLivePreview');if(!form||!preview)return;
  const color=form.elements.profile_accent.value,style=form.elements.profile_cover_style.value,frame=form.elements.frame_id.value;
  if(!/^#[0-9a-f]{6}$/i.test(color))return;
  preview.style.setProperty('--profile-accent',color);
  $('#profileLiveCover').className='profile-live-cover cover-'+style;
  $('#profileLiveFrame').className='avatar-frame frame-'+frame;
  $('#profileAccentText').textContent=color.toUpperCase();
}
async function saveProfileStyle(form){
  const value=Object.fromEntries(new FormData(form));
  if(!['aurora','cosmos','sunset','ocean','forest','rose','minimal'].includes(value.profile_cover_style))throw new Error('Неверный стиль обложки');
  if(!['none','neon','gold','frost','rose','rainbow'].includes(value.frame_id))throw new Error('Неверная рамка аватара');
  if(!/^#[0-9a-f]{6}$/i.test(value.profile_accent))throw new Error('Неверный цвет');if(!['gifts-first','posts-first'].includes(value.profile_layout))throw new Error('Неверный порядок блоков');
  app.profile=await api.updateProfile(value);
  app.peopleMap[app.user.id]=app.profile;
  $('#pane').innerHTML=V.settings(app);
  applyLanguage();toast('Оформление профиля сохранено в Supabase');
}
document.addEventListener('input',event=>{if(event.target.id==='giftRecipientSearch'){clearTimeout(giftRecipientSearchTimer);const q=event.target.value;giftRecipientSearchTimer=setTimeout(()=>searchGiftRecipients(q),260);}if(event.target.closest('#profileStyleForm'))updateStylePreview();if(event.target.closest('#colorsForm')){const colors=Object.fromEntries(new FormData($('#colorsForm')));if(validColors(colors)){applyColors(colors);for(const field of $$('#colorsForm input'))field.nextElementSibling.textContent=field.value.toUpperCase();}}});
document.addEventListener('submit',event=>{if(event.target.id==='colorsForm'){event.preventDefault();const form=event.target,button=$('[type=submit]',form),colors=Object.fromEntries(new FormData(form));guarded('colors',async()=>{try{if(!validColors(colors))throw new Error('Выбери четыре цвета.');await changeState({colors});applyColors(colors);toast('Твои цвета сохранены');}catch(error){showError($('#colorsError'),error);}},button);return;}if(event.target.id==='profileForm'){event.preventDefault();saveProfile(event.target);}if(event.target.id==='profileStyleForm'){event.preventDefault();guarded('profile-style',async()=>{try{await saveProfileStyle(event.target);}catch(error){showError($('#profileStyleError'),error);}});}
  if(event.target.id==='profileMusicForm'){event.preventDefault();const form=event.target;guarded('profile-music',async()=>{
   try{const fd=new FormData(form);const url=String(fd.get('profile_music_url')||'').trim();
      if(url&&!/^https:\/\//i.test(url))throw new Error('Только защищённые ссылки HTTPS');
      if(url&&!(new URL(url)).hostname)throw new Error('Некорректная ссылка');
      app.profile=await api.updateProfile({profile_music_url:url||null,music_title:String(fd.get('music_title')||'').trim().slice(0,100)});
      $('#pane').innerHTML=V.settings(app);toast('Музыка профиля сохранена');
    }catch(error){showError($('#profileMusicError'),error);}
  },form.querySelector('[type=submit]'));}});
async function openPublicProfile(uid){
  if(!uid){await navigate(previousRoute||'chats');return;}
  $('#pane').innerHTML='<div class="empty-state"><h2>Загрузка профиля…</h2></div>';
  try{const profile=await api.publicProfile(uid);if(!profile)throw new Error('Профиль не найден');const parts=await Promise.allSettled([api.profileGifts(uid),api.profileMoments(uid),api.profileSocial(uid)]);if(app.route!=='profile'||app.profileTarget!==uid)return;const get=(i,fallback)=>parts[i].status==='fulfilled'?parts[i].value:fallback;$('#pane').innerHTML=V.publicProfileView(app,profile,get(0,[]),get(1,[]),get(2,{}));applyLanguage();}
  catch(error){showError($('#pane'),error);}
}


async function refreshNotificationBadge(){
 if(!app.user||stopped)return;
 const count=await api.notificationUnread();
 const badge=$('#notifRailCount'),top=$('#notificationsHeaderCount');
 for(const el of [badge,top])if(el){el.hidden=count===0;el.textContent=count>99?'99+':String(count);}
 return count;
}
async function openNotifications(){
 const route=app.route,epoch=app.epoch,pane=$('#pane');if(!pane)return;
 pane.innerHTML='<div class="star-wallet-loading"><span class="spinner"></span><p>Загружаем уведомления…</p></div>';
 try{
   const rows=await api.notifications();if(epoch!==app.epoch||route!=='notifications')return;
   notificationList=rows;
   pane.innerHTML=V.notificationsPage(app,rows,notificationFilter);
   refreshNotificationBadge().catch(()=>{});applyLanguage();
 }catch(error){if(epoch===app.epoch)pane.innerHTML=`<div class="empty-messages"><h3>Не удалось загрузить события</h3><p>${esc(errorText(error))}</p><button class="primary" data-action="notifications-refresh">Повторить</button></div>`;}
}

async function openStars(){
  const epoch=app.epoch, pane=$('#pane');
  if(!pane)return;
  pane.innerHTML='<div class="star-wallet-loading"><span class="spinner"></span><p>Загружаем кошелёк...</p></div>';
  const results=await Promise.allSettled([api.starsWallet(),api.myGifts(),api.giftCatalog(),api.friends(),api.caseTypes(),api.caseInventory(),api.donationConfig(),api.donationRequests()]);
  if(epoch!==app.epoch||app.route!=='stars')return;
  if(results[0].status==='rejected'){
    pane.innerHTML=`<div class="star-wallet-loading"><h2>Не удалось загрузить баланс</h2><p>${esc(errorText(results[0].reason))}</p><button type="button" class="primary" data-action="stars-refresh">Повторить</button></div>`;
    return;
  }
  const val=i=>results[i].status==='fulfilled'?results[i].value:[];
  const wallet=val(0),history=val(1),catalog=val(2),friends=val(3);
  if(app.profile)app.profile.stars=Number(wallet.balance||0);
  pane.innerHTML=V.starsWallet(app,{wallet,history,catalog,friends,cases:val(4),inventory:val(5),donation:val(6)||{},donations:val(7)});
  const donationForm=$('#rndm54-donation-form');if(donationForm)donationForm.onsubmit=event=>{event.preventDefault();const form=event.currentTarget;guarded('donation-submit',async()=>{const data=new FormData(form);await api.donationSubmit(String(data.get('reference')||'').trim(),String(data.get('comment')||''));toast('Заявка записана. Владелец сверит платёж.');await openStars();},form.querySelector('[type=submit]'));};
  const failures=[4,5,6,7].filter(i=>results[i].status==='rejected');if(failures.length){const section=pane.querySelector('.rndm54-section');if(section)section.insertAdjacentHTML('beforeend',`<p class="star-load-note">Некоторые функции требуют обновления базы данных: ${esc(errorText(results[failures[0]].reason))}</p>`);}
  renderSidebar();applyLanguage();
  for(let i=1;i<4;i++)if(results[i].status==='rejected'){
    const section=pane.querySelectorAll('.star-wallet-section')[i-1];
    if(section)section.insertAdjacentHTML('beforeend',`<p class="star-load-note">${esc(errorText(results[i].reason))}</p>`);
  }
}
async function openGiftShop(target){
  if(!app.user?.id||!target||target===app.user.id)throw new Error('Выбери другого пользователя.');
  const [catalog,wallet,p]=await Promise.all([api.giftCatalog(),api.starsWallet(),api.publicProfile(target)]);
  if(!p||p.is_banned)throw new Error('Пользователь недоступен.');
  giftRecipient=target;giftRecipientName=p.display_name||p.username||'другу';
  if(app.profile)app.profile.stars=Number(wallet.balance||0);
  showModal('🎁 Отправить подарок',V.giftShop(target,catalog,wallet.balance,giftRecipientName,app.profile?.app_language||'ru'));
  renderSidebar();
}
function showGiftRecipients(){
  giftRecipient=null;giftRecipientName='';
  showModal('Кому подарить?',V.giftRecipients([],app.profile?.app_language||'ru'));
  const search=$('#giftRecipientSearch');search?.focus();
}
async function searchGiftRecipients(text){
  const query=String(text||'').trim();
  if(query.replace(/^@/,'').length<2){if($('#giftRecipientResults'))$('#giftRecipientResults').innerHTML='<p class="muted">Введите хотя бы две буквы.</p>';return;}
  try{
    const rows=(await api.people(query)).filter(p=>p.id!==app.user.id);
    if($('#giftRecipientSearch')?.value.trim()!==query)return;
    const dest=$('#giftRecipientResults');
    if(dest)dest.innerHTML=V.giftRecipientRows(rows,app.profile?.app_language||'ru');
  }catch(error){if($('#giftRecipientResults'))showError($('#giftRecipientResults'),error);}
}

async function handleAction(action,button) {
  if(action==='notifications-filter'){notificationFilter=button.dataset.filter||'all';if(app.route==='notifications')$('#pane').innerHTML=V.notificationsPage(app,notificationList,notificationFilter);applyLanguage();return;}
  if(action==='notifications-refresh'){await guarded('notifications-refresh',openNotifications,button);return;}
  if(action==='notifications-all'){await guarded('notifications-all',async()=>{await api.markAllNotifications();await openNotifications();},button);return;}
  if(action==='notifications-open'){await guarded('notifications-open',async()=>{const item=notificationList.find(n=>String(n.id)===button.dataset.id);if(!item)return;await api.markNotification(item.id);await refreshNotificationBadge();const link=String(item.link||'');const target=new URL(link,location.href);if(target.origin===location.origin){const view=target.searchParams.get('view');if(target.searchParams.get('chat')){await openConversation(target.searchParams.get('chat'));return;}if(view==='profile'||target.pathname.endsWith('profile.html')){app.profileTarget=target.searchParams.get('user')||item.actor_id||app.user.id;await navigate('profile');return;}}await openNotifications();},button);return;}
  if(action==='notifications-permission'){if(!('Notification'in window)){toast('Этот браузер не поддерживает системные уведомления.');return;}const perm=await Notification.requestPermission();toast(perm==='granted'?'Уведомления разрешены':'Разрешение не предоставлено');return;}
  if(action==='random-history-chat'){const id=button.dataset.chat;if(id)await guarded('history-chat',()=>openConversation(id),button);return;}
  if(action==='random-history-favorite'){await guarded('history-favorite',async()=>{const id=button.dataset.user,nowFavorite=button.dataset.favorite!=='1';await api.randomFavorite(id,nowFavorite);randomHistory=await api.randomHistory();renderRandomPage();toast(nowFavorite?'★ Человек в избранных':'Удалено из избранных');},button);return;}
  if(action==='profile-follow'){await guarded('profile-follow',async()=>{const id=button.dataset.user,following=button.dataset.following==='1';await api.followUser(id,following);await openPublicProfile(id);toast(following?'Подписка отменена':'Подписка оформлена');},button);return;}
  if(action==='cat-cosmetic'){await guarded('cat-cosmetic',async()=>{await api.catCosmetic(button.dataset.kind,button.dataset.choice);await openTapolka();toast('🐱 Новый образ сохранён');},button);return;}
  if(action==='cat-board-mode'){catBoardMode=button.dataset.mode==='weekly'?'weekly':'all';$$('[data-action="cat-board-mode"]').forEach(el=>el.classList.toggle('active',el.dataset.mode===catBoardMode));await guarded('cat-board',refreshTapolkaBoard,button);return;}
  if(action==='random-start'){await guarded('random-start',startRandomSearch,button);return;}
  if(action==='random-stop'){await guarded('random-stop',async()=>{await stopRandomSearch();toast('Поиск остановлен');},button);return;}
  if(action==='random-next'){await guarded('random-next',async()=>{await stopRandomSearch(true);await startRandomSearch();},button);return;}
  if(action==='random-profile'){if(randomMatch?.matched_user_id)await showPerson(randomMatch.matched_user_id);return;}
  if(action==='random-open-chat'){if(randomMatch?.conversation_id)await openConversation(randomMatch.conversation_id);return;}
  if(action==='random-friend'){if(randomMatch?.matched_user_id)await guarded('random-friend',async()=>{await api.friend(randomMatch.matched_user_id);toast('Запрос в друзья отправлен');},button);return;}
  if(action==='random-gift'){if(randomMatch?.matched_user_id)await guarded('random-gift',()=>openGiftShop(randomMatch.matched_user_id),button);return;}
  if(action==='profile-gift'||action==='stars-gift-to'){
    const target=button.dataset.user;
    await guarded('gift-shop',()=>openGiftShop(target),button);return;
  }
  if(action==='chat-gift'){
    const other=app.info?.profiles?.find(p=>p.id!==app.user.id);
    if(!other){toast('Открой личный чат с пользователем.');return;}
    await guarded('gift-shop',()=>openGiftShop(other.id),button);return;
  }
  if(action==='stars-find-user'){showGiftRecipients();return;}
  if(action==='gift-close'){if(modal.open)modal.close();return;}
  if(action==='gift-wallet'){if(modal.open)modal.close();await navigate('stars');return;}
  if(action==='gift-confirm'){
    await guarded('gift-confirm',async()=>{
      const choice=document.querySelector('#modal input[name="giftPick"]:checked');
      if(!choice)throw new Error('Выбери подарок.');
      if(!giftRecipient)throw new Error('Получатель не выбран.');
      const note=$('#giftNote')?.value||'';
      const result=await api.sendGift(giftRecipient,choice.value,note);
      if(app.profile)app.profile.stars=Number(result.balance);
      toast(`🎁 ${result.emoji} Подарок отправлен!`);
      if(modal.open)modal.close();
      if(app.route==='stars')await openStars();
      else if(app.route==='profile'&&app.profileTarget===giftRecipient)await openPublicProfile(giftRecipient);
      renderSidebar();applyLanguage();
    },button);return;
  }
  if(action==='cat-upgrade'){await guarded('cat-upgrade',async()=>{
     const kind=button.dataset.upgrade,level=kind==='energy'?Number(catState?.energy_level||1):Number(catState?.regen_level||1);
     const price=kind==='energy'?30+20*(level-1):45+25*(level-1);
     confirmAction('Купить улучшение котика?',`Стоимость: ${price} ⭐. Улучшение сохраняется навсегда.`,async()=>{
       const result=await api.catUpgrade(kind);if(app.profile)app.profile.stars=result.balance;
       await openTapolka();renderSidebar();toast('🐱 Котик стал сильнее!');
     },'Улучшить');
   },button);return;}
  if(action==='profile-post-new'){showModal('Новая публикация',`<form id="profileMomentForm"><label class="field">Что нового?<textarea name="body" rows="5" maxlength="1000" required placeholder="Поделись новостью, достижением или мыслью…"></textarea></label><div id="profileMomentError"></div><button class="primary" type="submit">Опубликовать</button></form>`);$('#profileMomentForm').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;guarded('new-profile-post',async()=>{await api.createProfileMoment(new FormData(form).get('body'));modal.close();await openPublicProfile(app.user.id);toast('Публикация добавлена');},form.querySelector('[type=submit]'));};return;}
  if(action==='profile-post-delete'){confirmAction('Удалить публикацию?','Публикация исчезнет из профиля.',async()=>{await api.deleteProfileMoment(button.dataset.post);await openPublicProfile(app.user.id);toast('Публикация удалена');});return;}
  if(action==='profile-post-pin'){await guarded('profile-post-pin',async()=>{await api.pinProfileMoment(button.dataset.post);await openPublicProfile(app.user.id);toast('Публикация закреплена');},button);return;}

  if(action==='gift-exchange'){
    const type=button.dataset.source,id=button.dataset.item;
    const name=button.dataset.title||'Подарок';
    const base=Number(button.dataset.base||0),credit=Number(button.dataset.amount||0);
    if(!['received','case'].includes(type)||!id||credit<=0)return;
    const fee=Math.max(0,base-credit);
    showModal('↺ Обменять подарок?',`<div class="rndm55-confirm"><p>«${esc(name)}» исчезнет из доступных подарков и больше не сможет быть отправлен другу.</p><div class="rndm55-exchange-breakdown"><span>Стоимость</span><b>${base.toLocaleString('ru-RU')} ⭐</b><span>Комиссия 10%</span><b>−${fee.toLocaleString('ru-RU')} ⭐</b><span>На баланс</span><strong>+${credit.toLocaleString('ru-RU')} ⭐</strong></div><p class="muted">Это необратимая операция. Реальные деньги не используются.</p><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button type="button" class="primary" data-action="gift-exchange-confirm" data-source="${esc(type)}" data-item="${esc(id)}">Обменять</button></div></div>`);
    return;
  }
  if(action==='gift-exchange-confirm'){
    await guarded('gift-exchange-confirm',async()=>{
      const result=await api.exchangeGift(button.dataset.source,button.dataset.item);
      if(app.profile)app.profile.stars=Number(result.balance);
      if(modal.open)modal.close();
      toast(`✅ +${Number(result.received)} ⭐ за подарок · комиссия ${Number(result.commission)} ⭐`);
      if(app.route==='stars')await openStars();
      renderSidebar();
    },button);
    return;
  }
  if(action==='case-open'){
    const id=button.dataset.case,title=button.dataset.title,cost=Number(button.dataset.price);
    showModal('📦 Открыть кейс?',`<p>Кейс «${esc(title)}». С баланса спишется <b>⭐ ${cost}</b>. Случайный подарок окажется в коллекции. Выигрыш можно обменять на игровые звёзды с комиссией 10%, но не на деньги.</p><div class="modal-actions"><button class="secondary" data-action="close-modal">Отмена</button><button class="primary" data-action="case-confirm" data-case="${esc(id)}">Открыть кейс</button></div>`);return;
  }
  if(action==='case-confirm'){
    await guarded('case-confirm',async()=>{
      const result=await api.caseOpen(button.dataset.case);
      if(app.profile)app.profile.stars=Number(result.balance);
      await openStars();renderSidebar();
      showModal(result.exclusive?'💠 ЭКСКЛЮЗИВ!':'🎉 Твой приз!',`<div class="rndm54-win"><span>${V.giftArt(result.gift_id,result.name)}</span><h2>${esc(result.name)}</h2><p>${result.exclusive?'Эксклюзив из кейса':'Редкость: '+esc(result.rarity)}</p><small>Сохранено в коллекции. Остаток: ⭐ ${Number(result.balance).toLocaleString('ru-RU')}</small></div><button type="button" class="primary" data-action="close-modal">Отлично!</button>`);
    },button);return;
  }
  if(action==='case-gift'){
    const itemId=button.dataset.item;
    showModal('🎁 Передать предмет другу',`<form id="rndm54-case-gift-form"><p>Укажи точный @username друга. Предмет перейдёт в его коллекцию навсегда.</p><label class="field">Имя пользователя<input name="username" required minlength="3" maxlength="32" placeholder="@username" autocomplete="off"></label><label class="field">Пожелание<input name="note" maxlength="160" placeholder="Необязательно"></label><div id="caseGiftError"></div><button class="primary" type="submit">Найти и отправить</button></form>`);
    const form=$('#rndm54-case-gift-form');form.onsubmit=event=>{event.preventDefault();const submit=form.querySelector('button[type=submit]');guarded('case-gift-send',async()=>{
      const data=new FormData(form),username=String(data.get('username')||'').replace(/^@/,'').trim().toLowerCase();
      const people=await api.people(username);const target=people.find(p=>String(p.username||'').toLowerCase()===username);
      if(!target)throw new Error('Пользователь с таким @username не найден.');
      if(target.id===app.user.id)throw new Error('Нельзя отправить подарок себе.');
      await api.caseSend(itemId,target.id,String(data.get('note')||''));if(modal.open)modal.close();
      toast('🎁 Подарок передан пользователю @'+username);if(app.route==='stars')await openStars();
    },submit);};return;
  }
  if(action==='stars-refresh'){await guarded('stars-refresh',()=>openStars(),button);return;}
  if(action==='stars-claim'){
    await guarded('stars-claim',async()=>{
      const result=await api.claimDailyStars();
      toast(`⭐ Получено ${Number(result?.stars||15)} звёзд и ${Number(result?.xp||40)} XP!`);
      await openStars();
    },button);return;
  }
  if(action==='call-audio'||action==='call-video'){if(app.active?.kind!=='direct')return;const person=app.info?.profiles.find(p=>p.id!==app.user.id);if(person)await guarded('call',()=>calls.dial(person,action==='call-video'?'video':'audio'),button);return;}
  if(action==='refresh-calls'){await calls.history($('#callsHistory'));return;}
  if(action==='tapolka-tap'){tapolkaTap();return;}
  if(action==='tapolka-refresh'){await guarded('tapolka-refresh',refreshTapolkaBoard,button);return;}
  if(action==='close-modal'){modal.close();return;}if(action==='close-info'){$('#detail')?.remove();return;}
  if(action==='new-story'){newStory();return;}
  if(action==='profile-back'){if(previousChatId){const id=previousChatId;previousChatId=null;await openConversation(id);}else await navigate(previousRoute||'chats');return;}
  if(action==='profile-message'){const uid=button.dataset.user;await guarded('profile-message',async()=>{await openDirect(uid);},button);return;}
  if(action==='profile-friend'){const uid=button.dataset.user;await guarded('profile-friend',async()=>{await api.friend(uid);toast('Запрос в друзья отправлен');},button);return;}
  if(action==='save-content-settings'){await guarded('save-content-settings',async()=>{const patch={app_language:$('#appLanguage')?.value||'ru',censorship_mode:$('#censorshipMode')?.value||'mask'};app.profile=await api.updatePreferences(patch);localStorage.setItem('rndm-language',patch.app_language);localStorage.setItem('rndm-censorship',patch.censorship_mode);applyLanguage();toast(patch.app_language==='en'?'Settings saved':'Настройки сохранены');await navigate('settings');},button);return;}
  if(action==='retry-stories'){refreshStories().catch(()=>{});return;}
  if(action==='story-prev'||action==='story-next'){showStory(storyIndex+(action==='story-next'?1:-1));return;}
  if(action==='reset-colors'){guarded('colors',async()=>{await changeState({colors:null});applyColors(null);$('#pane').innerHTML=V.settings(app);toast('Фирменные цвета восстановлены');},button);return;}
  if(action==='theme'){setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');return;}
  if(action==='repair-app'){await repairFrontendCache();return;}
  if(action==='retry-boot'){root.innerHTML='<div class="boot"><span class="spinner"></span><p>Подключаемся…</p></div>';boot();return;}
  if(action==='new'){if(app.route==='channels')newChannel();else guarded('new',newConversation);return;}
  if(action==='new-group'){guarded('new-group',newGroup);return;}if(action==='new-channel'){newChannel();return;}
  if(action==='clear-search'){$('#listSearch').value='';renderSidebar();applyLanguage();return;}
  if(action==='refresh-list'){guarded('list',refreshLists,button);return;}
  if(action==='back'){await navigate('chats');return;}
  if(action==='info'){closePop();info();return;}if(action==='chat-menu'){chatMenu(button);return;}
  if(action==='chat-search'){$('#chatSearch').hidden=false;$('#messageSearch').focus();return;}
  if(action==='close-chat-search'){$('#chatSearch').hidden=true;$('#messageSearchResults').hidden=true;$('#messageSearch').value='';return;}
  if(action==='refresh-chat'){closePop();guarded('refresh',()=>refreshMessages(),button);return;}
  if(action==='older'){guarded('older',()=>refreshMessages(false,true),button);return;}
  if(action==='bottom'){$('#messages').scrollTop=$('#messages').scrollHeight;return;}
  if(action==='attach'){$('#attachmentInput').click();return;}if(action==='remove-file'){clearFile();return;}if(action==='edit-photo'){await openPhotoEditor();return;}
  if(action==='cancel-context'){cancelEdit();app.reply=null;renderCompose();return;}
  if(action==='emoji'){showPop(button,`<div class="emoji-grid">${['😀','😊','😂','🥰','😍','😎','🤔','😮','😢','😭','😅','🙃','❤️','💜','💚','👍','👎','🙏','🔥','✨','🎉','💯','👋','🤝','🚀','☕','🎮','🎵','🌿','⭐'].map(e=>`<button data-insert-emoji="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`,true);return;}
  if(action==='schedule-message'){
    if(!['direct','group'].includes(app.active?.kind)){toast('Отложенная отправка доступна в чатах');return;}
    const text=$('#messageInput')?.value.trim();if(!text){toast('Сначала напиши сообщение');return;}
    const date=new Date(Date.now()+3600000);date.setMinutes(Math.ceil(date.getMinutes()/5)*5,0,0);
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
    showModal('Отложенное сообщение',`<form id="scheduleForm"><p class="muted">Текст сообщения сохранится в базе и появится в переписке в выбранное время. Не закрывай окно до подтверждения.</p><label class="field">Когда отправить?<input type="datetime-local" name="when" value="${local}" required></label><div id="scheduleError"></div><button type="submit" class="primary">Запланировать</button></form>`);
    const id=app.active.id;
    $('#scheduleForm').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;guarded('schedule-message',async()=>{
      try{const date=new Date(new FormData(form).get('when'));if(!Number.isFinite(date.getTime())||date.getTime()<Date.now()+60000||date.getTime()>Date.now()+30*86400000)throw new Error('Выбери время от 1 минуты до 30 дней');
       const filtered=filterOutgoing(text);if(!filtered.ok)throw new Error(filtered.reason);
       await api.send(id,filtered.text,null,{scheduled_for:date.toISOString()});modal.close();
       if(app.active?.id===id&&$('#messageInput')?.value.trim()===text)$('#messageInput').value='';
       toast('🕒 Сообщение запланировано.');
      }catch(error){showError($('#scheduleError'),error);}
    },form.querySelector('[type=submit]'));};return;
  }
  if(action==='voice'){await voice();return;}
  if(action==='pin-chat'||action==='archive-chat'){
    const a={...app.active},field=action==='pin-chat'?'is_pinned':'is_archived',value=!app.prefs[a.id]?.[field];closePop();
    guarded('preference',async()=>{app.prefs[a.id]=await api.preference(a.id,{[field]:value});renderSidebar();applyLanguage();toast(field==='is_pinned'?(value?'Чат закреплён':'Чат откреплён'):(value?'Чат в архиве':'Чат возвращён'));});return;
  }
  if(action==='mute-chat'){const id=app.active.id;closePop();guarded('state',async()=>{await changeState(s=>({...s,muted:s.muted.includes(id)?s.muted.filter(x=>x!==id):[...s.muted,id]}));renderSidebar();applyLanguage();toast(app.state.muted.includes(id)?'Уведомления этого чата выключены':'Уведомления включены');});return;}
  if(action==='chat-wallpaper'){wallpaper();return;}
  if(action==='join-channel'){const a={...app.active};closePop();guarded('join',async()=>{await api.join(a.id,a.joined);app.channels=await api.channels();if(app.active?.id===a.id)await openChannel(a.id,false);renderSidebar();applyLanguage();});return;}
  if(action==='avatar'){$('#avatarInput').click();return;}if(action==='cover'){$('#coverInput').click();return;}if(action==='my-profile'){await showPerson(app.user.id);return;}
  if(action==='password'){changePassword();return;}
  if(action==='diagnose-calls'){await diagnoseCalls();return;}
  if(action==='test-microphone'){await testMicrophone();return;}
  if(action==='notifications'){guarded('notifications',async()=>{if(!window.Notification)throw new Error('Этот браузер не поддерживает уведомления.');if(app.state.notifications){await changeState({notifications:false});}else{const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Разреши уведомления в настройках браузера.');await changeState({notifications:true});}if(app.route==='settings')$('#pane').innerHTML=V.settings(app);},button);return;}
  if(action==='logout'){confirmAction('Выйти из аккаунта?','Ты сможешь снова войти с прежней почтой и паролем.',async()=>{captureDraft();const result=await api.sb.auth.signOut();if(result.error)throw result.error;stopAll();app.user=null;applyColors(null);auth('login');},'Выйти');}
}
function applyWallpaper(){const host=$('#messages');if(!host)return;host.className='messages';const theme=app.prefs[app.active.id]?.theme_id || app.state.wallpaper;if(['violet','mint','ocean','sunset'].includes(theme))host.classList.add('theme-'+theme);}
async function saveProfile(form) {const button=$('button[type=submit]',form);button.disabled=true;try{const fd=new FormData(form);app.profile=await api.updateProfile({display_name:String(fd.get('display_name')).trim(),username:String(fd.get('username')).trim().toLowerCase(),bio:String(fd.get('bio')).trim()});app.peopleMap[app.user.id]=app.profile;$('#pane').innerHTML=V.settings(app);renderSidebar();applyLanguage();toast('Профиль сохранён в базе данных');}catch(error){showError($('#profileError'),error);}finally{button.disabled=false;}}
async function uploadAvatar(file) {if(!file)return;if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024){toast('Нужно изображение JPG, PNG, WebP или GIF до 5 МБ.');return;}await guarded('avatar',async()=>{const uploaded=await api.upload('avatars',file,'avatar');try{app.profile=await api.updateProfile({avatar_url:uploaded.url});$('#pane').innerHTML=V.settings(app);renderSidebar();applyLanguage();toast('Фото профиля обновлено');}catch(error){await api.sb.storage.from('avatars').remove([uploaded.path]);throw error;}});}
async function uploadCover(file){
 if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){toast('Обложка: JPG, PNG или WebP до 5 МБ');return;}
 await guarded('cover',async()=>{
  const uploaded=await api.upload('avatars',file,'cover');
  try{app.profile=await api.updateProfile({cover_url:uploaded.url});$('#pane').innerHTML=V.settings(app);app.peopleMap[app.user.id]=app.profile;renderSidebar();applyLanguage();toast('Обложка обновлена и сохранена');}
  catch(error){await api.sb.storage.from('avatars').remove([uploaded.path]);throw error;}
 });
}

async function openPhotoEditor(){
  const selected=fileFor();
  if(!selected?.file?.type.startsWith('image/')){toast('Сначала прикрепи фотографию');return;}
  const src=selected.url||URL.createObjectURL(selected.file);
  showModal('Редактор фотографии',`<div class="photo-editor"><canvas id="photoCanvas" aria-label="Предпросмотр фотографии"></canvas><div class="photo-editor-controls"><button class="secondary" type="button" id="photoRotate">↻ Повернуть</button><label class="field">Яркость <input type="range" id="photoBrightness" min="60" max="160" value="100"></label><label class="setting-row">Чёрно-белое <input type="checkbox" id="photoGray"></label></div><p class="muted">Для отправки будет создана копия фотографии. Оригинал на устройстве не изменится.</p><div id="photoEditorError"></div><button class="primary" id="photoSave" type="button">Применить</button></div>`);
  const canvas=$('#photoCanvas'),ctx=canvas?.getContext('2d');
  if(!canvas||!ctx)return;
  const img=new Image();let turns=0;
  const render=()=>{
    if(!img.naturalWidth)return;
    const sideways=turns%2===1,scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
    const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.width=sideways?h:w;canvas.height=sideways?w:h;
    ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(turns*Math.PI/2);
    ctx.filter=`brightness(${$('#photoBrightness')?.value||100}%) ${$('#photoGray')?.checked?'grayscale(100%)':''}`;
    ctx.drawImage(img,-w/2,-h/2,w,h);ctx.restore();
  };
  $('#photoRotate').onclick=()=>{turns=(turns+1)%4;render();};
  $('#photoBrightness').oninput=render;$('#photoGray').onchange=render;
  $('#photoSave').onclick=async()=>{
    const b=$('#photoSave');b.disabled=true;
    try{
      if(!canvas.width)throw new Error('Фотография ещё загружается');
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Не удалось обработать изображение')),'image/jpeg',0.88));
      if(blob.size>window.RNDM_CONFIG.maxFileBytes)throw new Error('Изображение слишком большое');
      const name=selected.file.name.replace(/\.[^.]+$/,'')+'-rndm.jpg';
      const edited=new File([blob],name,{type:'image/jpeg'});
      const key=activeKey();const old=app.files.get(key);
      if(old?.url)URL.revokeObjectURL(old.url);
      app.files.set(key,{file:edited,url:URL.createObjectURL(edited)});
      modal.close();renderCompose();toast('Фотография обработана');
    }catch(err){showError($('#photoEditorError'),err);}finally{if(b.isConnected)b.disabled=false;}
  };
  img.onload=render;img.onerror=()=>showError($('#photoEditorError'),new Error('Не удалось открыть изображение'));
  img.src=src;
}
async function diagnoseCalls(){
 const secure=window.isSecureContext,rtc=typeof RTCPeerConnection!=='undefined',media=!!navigator.mediaDevices?.getUserMedia;
 const ice=window.RNDM_CONFIG?.iceServers||[];
 const relay=ice.some(server=>JSON.stringify(server.urls||'').includes('turn:')||JSON.stringify(server.urls||'').includes('turns:'));
 const row=(name,ok,detail='')=>`<div class="diagnostic-row"><span>${ok?'✅':'⚠️'} ${esc(name)}</span><small>${esc(detail)}</small></div>`;
 showModal('Проверка звонков',`<div class="call-diagnostics">${row('Безопасное HTTPS-соединение',secure)}${row('Поддержка WebRTC',rtc)}${row('Доступ к микрофону',media,'Проверяется по отдельному запросу')}${row('Релейный TURN-сервер',relay,relay?'Настроен':'Для надёжных звонков в разных сетях потребуется TURN')}<button type="button" class="primary" data-action="test-microphone">Проверить микрофон</button><p class="muted">Эта диагностика проверяет устройство и конфигурацию, но не подтверждает связь между двумя абонентами.</p></div>`);
}
async function testMicrophone(){
 const btn=document.querySelector('[data-action="test-microphone"]');if(btn)btn.disabled=true;
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Микрофон недоступен в этом браузере');
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  stream.getTracks().forEach(t=>t.stop());toast('🎙 Микрофон доступен');
 }catch(error){toast('Микрофон: '+errorText(error));}finally{if(btn?.isConnected)btn.disabled=false;}
}
function changePassword(){showModal('Изменить пароль',`<form id="passwordForm"><label class="field">Новый пароль<input type="password" name="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><label class="field">Повтори пароль<input type="password" name="repeat" minlength="8" autocomplete="new-password" required></label><div id="modalError"></div><button type="submit" class="primary">Сохранить</button></form>`);$('#passwordForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),button=$('button',e.currentTarget);button.disabled=true;try{if(fd.get('password')!==fd.get('repeat'))throw new Error('Пароли не совпадают.');const result=await api.sb.auth.updateUser({password:fd.get('password')});if(result.error)throw result.error;modal.close();toast('Пароль изменён');}catch(error){showError($('#modalError'),error);}finally{button.disabled=false;}};}

document.addEventListener('pointerdown',event=>{if(!pop.hidden&&!pop.contains(event.target)&&!event.target.closest('[data-message-menu],[data-action="chat-menu"],[data-action="emoji"]'))closePop();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closePop();$('#detail')?.remove();}if((event.ctrlKey||event.metaKey)&&event.key==='k'&&app.user){event.preventDefault();$('#listSearch').focus();}if(event.key==='ArrowUp'&&$('#messageInput')===document.activeElement&&!$('#messageInput').value&&['direct','group'].includes(app.active?.kind)){const m=[...app.messages].reverse().find(x=>x.sender_id===app.user.id&&!x.deleted_at&&x.body);if(m){event.preventDefault();app.edit={...m,restore:''};$('#messageInput').value=m.body;renderCompose();}}});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});
window.addEventListener('popstate',()=>{if(!app.user)return;const params=new URLSearchParams(location.search);if(params.get('chat'))openConversation(params.get('chat'),false);else {if(params.get('view')==='profile')app.profileTarget=params.get('user')||app.user.id;navigate(params.get('view')||'chats',false);}});
window.addEventListener('offline',()=>connection('Нет соединения · черновики сохраняются',true));
window.addEventListener('online',()=>{connection();refreshLists().catch(()=>{});if(app.active)refreshMessages().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&randomSearching){stopRandomSearch().catch(()=>{});randomError='Поиск остановлен, пока приложение в фоне. Нажми «Начать поиск» заново.';}if(!document.hidden&&app.user&&!stopped){refreshNotificationBadge().catch(()=>{});refreshLists().catch(()=>{});if(app.active)refreshMessages().then(markRead).catch(()=>{});}});
window.addEventListener('pagehide',()=>{if(randomSearching || randomMatch)api?.randomLeave().catch(()=>{});clearTimeout(randomTimer);randomSearching=false;admin?.stop();calls?.stop().catch(()=>{});clips?.stop();captureDraft();cancelVoice();stopSubscriptions();app.globalRt.forEach(ch=>api.unwatch(ch));app.globalRt=[];});
if(window.visualViewport){const size=()=>{document.documentElement.style.setProperty('--app-height',Math.round(window.visualViewport.height)+'px');};window.visualViewport.addEventListener('resize',size);size();}
// PWA registration is handled by index.html (one registration per app load).
await boot();

window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
