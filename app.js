import {$,$$,esc,icon,ib,avatar,sid,unique,preview,safeURL,richText,day,time,bytes,errorText,readLocal,writeLocal} from './core.js?v=67.1.0';
import {MessengerAPI} from './api.js?v=67.1.0';
import {Together} from './together.js?v=67.3.0';
import * as V from './views.js?v=67.1.0';
import {Admin,staffRole} from './admin.js?v=67.1.0';
import {Calls} from './calls.js?v=67.1.0';
import {Clips} from './clips.js?v=67.1.0';
import {DonateHub} from './donate.js?v=67.1.0';
import {applyColors,validColors,defaultColors} from './theme.js?v=67.1.0';
import {RequestLane,inboxStats,sortMessages,trustedMedia,exportText,exportJSON,fileName,highlighted,emojiHTML} from './messenger-tools.js?v=67.1.0';

import {normalizeFolders,itemKey,bodyLinks,profileQR} from './organizer.js?v=67.1.0';
const defaults={folders:[],clipPreferences:{},randomFilters:{language:'any',interest:'any'},notes:[],muted:[],wallpaper:'default',enterSend:true,notifications:false,notificationSound:false,notificationPreview:false,manualUnread:[],glassMode:'balanced',colors:null,fontSize:16,compact:false,reduceMotion:false};
const app={togetherAccess:false,user:null,profile:null,route:'chats',folder:'all',active:null,info:null,dialogs:[],channels:[],channelResults:[],channelDirectory:[],channelView:'discover',channelOffset:0,channelHasMore:true,channelLoading:false,channelError:'',friends:[],prefs:{},drafts:{},state:{...defaults},messages:[],reactions:[],peopleMap:{},replyLookup:{},pins:[],reply:null,edit:null,files:new Map(),pending:new Set(),epoch:0,messageEpoch:0,more:false,rt:[],globalRt:[],stateChain:Promise.resolve(),draftTimers:new Map(),refreshing:false};
let calls,clips,admin,donateHub,together=null,authSubscription=null,booting=false;
let api,toastTimer,searchTimer,messageSearchTimer,typingTimer,refreshTimer,listTimer,messageSizeObserver,record=null,voiceBusy=false,authMode='login',stopped=false,recoverySeen=false;
let channelSearchLoading=false,channelSearchError='',channelSearchVersion=0,channelDirectoryRequest=0,tapolkaReturnRoute='channels';
let previousRoute='chats',previousChatId=null;
let randomTimer=null,randomToken=0,randomSearching=false,randomMatch=null,randomPerson=null,randomCount=null,randomInFlight=null;
let randomLanguage='any',randomInterest='any';
let giftRecipient=null,giftRecipientName='',giftRecipientSearchTimer=null;
let starsRenderToken=0;
const root=$('#root'),modal=$('#modal'),pop=$('#popover');
Object.assign(app,{historyFocus:false,selection:new Set(),selecting:false,confirmedMessages:new Map(),expandedMessages:new Set()});
let messageLane={epoch:-1,lane:new RequestLane()},sidebarPaintTimer,readRequests=new Map(),lastRead=new Map(),badgeValue=-1;
let gallery={epoch:0,filter:'all',query:'',rows:[],offset:0,more:true,loading:false,token:0};
let installPrompt=null;
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
  closePop();for(const media of $$('audio,video',modal))media.pause();if(modal.open)modal.close();
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
function applyGlassMode(){
  const value=app.state.glassMode;
  document.documentElement.dataset.glass=['full','balanced','low'].includes(value)?value:'balanced';
  const font=[14,16,18,20].includes(Number(app.state.fontSize))?Number(app.state.fontSize):16;
  document.documentElement.style.setProperty('--message-font',font+'px');
  document.documentElement.dataset.density=app.state.compact?'compact':'comfortable';
  document.documentElement.dataset.motion=app.state.reduceMotion?'reduce':'normal';
}
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
    await api.saveState(value);if(app.user?.id!==uid||stopped)return value;app.state=value;applyGlassMode();writeLocal(localStateKey(),{value,at:Date.now()});return value;
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
function stopSubscriptions(reset=true){together?.stop();if(reset){messageSizeObserver?.disconnect();clearTimeout(messageSearchTimer);resetConversationTools();}app.rt.forEach(ch=>api.unwatch(ch));app.rt=[];clearTimeout(refreshTimer);clearTimeout(typingTimer);}
function stopAll(){app.togetherAccess=false;for(const timer of app.draftTimers.values())clearTimeout(timer);app.draftTimers.clear();clearTimeout(sidebarPaintTimer);for(const file of app.files.values())if(file.url)URL.revokeObjectURL(file.url);readRequests.clear();lastRead.clear();badgeValue=-1;document.title="RNDM Chat";try{navigator.clearAppBadge?.()?.catch(()=>{});}catch{}donateHub?.stop();stopRandomSearch(true).catch(()=>{});admin?.stop();calls?.stop().catch(()=>{});clips?.stop();stopped=true;++app.epoch;++app.messageEpoch;stopSubscriptions();app.globalRt.forEach(ch=>api.unwatch(ch));app.globalRt=[];clearInterval(listTimer);cancelVoice();}


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
 const labels={notifications:['Уведомления','Notifications'],random:['Рулетка','Random chat'],chats:['Чаты','Chats'],contacts:['Контакты','Contacts'],channels:['Каналы','Channels'],tapolka:['Тапалка','Tap game'],stars:['Звёзды','Stars'],donate:['Донат','Support'],clips:['Клипы','Clips'],calls:['Звонки','Calls'],settings:['Настройки','Settings'],saved:['Избранное','Saved'],admin:['Админка','Admin'],profile:['Профиль','Profile']};
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
    const keys=await caches.keys(),scope=new URL('./',location.href).href,prefix='rndm-'+encodeURIComponent(new URL(scope).pathname)+'-';
    for(const name of keys.filter(k=>k.startsWith('rndm-'))){if(name.startsWith(prefix)){await caches.delete(name);continue;}const entries=await(await caches.open(name)).keys();if(entries.length&&entries.every(req=>req.url.startsWith(scope)))await caches.delete(name);}
  }
  if('serviceWorker' in navigator){
    try{const registration=await navigator.serviceWorker.getRegistration('./');await registration?.update();}catch{}
  }
  if(reload){
    const url=new URL(location.href);
    url.searchParams.set('updated',window.RNDM_CONFIG?.version||'67.2.0');
    location.replace(url.href);
  }
}

function startupDeadline(request,label,ms=14000){
  let timer;
  return Promise.race([
    Promise.resolve(request),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' не отвечает. Проверь соединение или повтори вход.')),ms);})
  ]).finally(()=>clearTimeout(timer));
}
async function boot() {
  if(booting)return;booting=true;
  try {
    api ||= new MessengerAPI();
    together ||= new Together(api,{toast,canAccess:()=>app.togetherAccess===true});
    authSubscription?.unsubscribe();
    const authWatcher=api.sb.auth.onAuthStateChange((event,session)=>{
      // The SDK holds the auth lock during callbacks; no API calls here.
      if(event==='PASSWORD_RECOVERY'){recoverySeen=true;try{sessionStorage.setItem('rndm30-recovery','1');}catch{};setTimeout(()=>auth('recovery'),0);}
      if(event==='SIGNED_OUT'&&app.user)setTimeout(()=>{stopAll();app.user=null;applyColors(null);auth('login');},0);
    });
    authSubscription=authWatcher?.data?.subscription||null;
    const session=await startupDeadline(api.session(),'Авторизация Supabase',14000);
    const recovery=recoverySeen || new URL(location.href).searchParams.get('recovery')==='1' || sessionStorage.getItem('rndm30-recovery')==='1';
    if(session && recovery){app.user=session.user;auth('recovery');return;}
    if(session)await start(session.user);else auth('login');
  } catch(error) {
    const message=String(error?.message||'');
    const outdated=/\bis not a function\b|\b(?:undefined|null)\b.*\b(?:property|properties)\b/i.test(message);
    if(outdated){
      const flag='rndm-repair-once-'+(window.RNDM_CONFIG?.version||'67.2.0');
      try{
        if(sessionStorage.getItem(flag)!=='1'){
          sessionStorage.setItem(flag,'1');
          root.innerHTML='<div class="boot"><span class="brand-mark">R</span><h2>Обновляем приложение…</h2><p>Загружаем согласованную версию интерфейса.</p><span class="spinner"></span></div>';
          await repairFrontendCache();return;
        }
      }catch(repairError){console.warn('RNDM cache repair:',repairError);}
    }
    root.innerHTML=`<div class="boot"><span class="brand-mark">R</span><h2>${outdated?'Ошибка загрузки интерфейса':'Не удалось подключиться'}</h2><p>${esc(errorText(error))}</p><button class="primary" data-action="repair-app">Обновить приложение</button><button class="secondary" data-action="retry-boot">Повторить</button></div>`;
  }finally{booting=false;}
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
  stopped=false;++app.epoch;++app.messageEpoch;app.user=user;api.uid=user.id;const profile=await startupDeadline(api.profile(),'Загрузка профиля',14000);
  if(app.user?.id!==user.id||stopped)return;
  app.profile=profile;app.togetherAccess=profile.app_role==='owner';app.peopleMap={[user.id]:profile};app.pending=new Set();app.prefs={};app.dialogs=[];app.channels=[];app.friends=[];app.channelDirectory=[];app.channelResults=[];notified.clear();readRequests.clear();lastRead.clear();badgeValue=-1;
  app.state={...defaults,...readLocal(localStateKey(),{}).value};app.drafts=readLocal(localDraftKey(),{});app.files=new Map();app.active=null;app.info=null;app.route='chats';app.folder='all';
  applyColors(app.state.colors);app.stories=[];app.storiesError='';
  root.innerHTML=V.shell(app);$('#pane').innerHTML=V.welcome(app);wireShell();
  const results=await Promise.allSettled([api.preferences(),api.drafts(),api.state(),api.dialogs(),api.channels()].map((q,i)=>startupDeadline(q,['Настройки чатов','Черновики','Настройки','Список чатов','Каналы'][i],16000)));
  if(app.user?.id!==user.id||stopped)return;
  if(results[0].status==='fulfilled')app.prefs=Object.fromEntries(results[0].value.map(x=>[sid(x.conversation_id),x]));else connection('Настройки чатов недоступны',true);
  if(results[1].status==='fulfilled')for(const row of results[1].value){const k=chatKey(row.conversation_id);if(!app.drafts[k] || new Date(row.updated_at)>new Date(app.drafts[k].updated_at))app.drafts[k]=row;}
  if(results[2].status==='fulfilled' && results[2].value?.value){app.state={...defaults,...results[2].value.value};writeLocal(localStateKey(),{value:app.state,at:Date.now()});}else if(results[2].status==='rejected')connection('Настройки доступны на устройстве',true);
  if(results[3].status==='fulfilled')app.dialogs=results[3].value;
  if(results[4].status==='fulfilled')app.channels=results[4].value;
  if(results[3].status==='fulfilled'){renderSidebar();applyLanguage();}else{renderSidebarError(results[3].reason);}
  applyColors(app.state.colors);applyGlassMode();refreshStories().catch(()=>{});refreshNotificationBadge().catch(()=>{});
  admin=new Admin(api,{toast,modal:showModal,confirm:confirmAction,close:()=>modal.close(),onProfile:showPerson});
  calls=new Calls(api,toast);calls.start();
  clips=new Clips(api,{preferences:app.state.clipPreferences,onPreferences:async value=>changeState(s=>({...s,clipPreferences:value})),toast,modal:showModal,confirm:confirmAction,onProfile:showPerson,onGift:openGiftShop});
  donateHub=new DonateHub(api,{toast,onWallet:()=>navigate('stars'),profile:()=>app.profile});
  api.heartbeat().catch(()=>{});clearInterval(listTimer);let tick=0;
  listTimer=setInterval(()=>{if(stopped || document.hidden || !navigator.onLine)return;tick++;if(tick%2===0)refreshStories().catch(()=>{});if(app.active)refreshMessages().catch(()=>{});if(tick%2===0)refreshLists().catch(()=>{});if(tick%20===0)api.heartbeat().catch(()=>{});if(tick%2===0)refreshNotificationBadge().catch(()=>{});if(['direct','group'].includes(app.active?.kind)){updateTypers();if(tick%2===0&&app.profile?.app_role!=='owner')refreshTogetherAccess().catch(()=>{});}},15000);
  app.globalRt.forEach(ch=>api.unwatch(ch));app.globalRt=[];
  app.globalRt.push(api.watch('messages',null,payload=>{receiveInboxEvent(payload);notifyMessage(payload);clearTimeout(listRefreshDebounce);listRefreshDebounce=setTimeout(()=>refreshLists().catch(()=>{}),350);},status=>{if(status==='SUBSCRIBED')connection();else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')connection('Обновляем каждые 15 секунд',true);}));
  app.globalRt.push(api.watch('conversation_members','user_id=eq.'+user.id,()=>refreshLists().catch(()=>{})));
  const params=new URLSearchParams(location.search);
  if(params.get('chat'))await openConversation(params.get('chat'),false);
  else if(params.get('view')==='chats'&&params.get('channel'))await openChannel(params.get('channel'),false);
  else if(params.get('view')==='profile'){app.profileTarget=params.get('user')||app.user.id;await navigate('profile',false);}
  else if(params.get('view')==='channels'){await navigate('channels',false);if(params.get('channel'))await openChannel(params.get('channel'),false);}
  else if(params.get('view')==='contacts')await navigate('contacts');
  else if(params.get('view')==='random'){await navigate('random',false);}
  else if(params.get('view')==='donate'){await navigate('donate',false);}
  else if(params.get('view')==='stars'){await navigate('stars',false);}else if(params.get('view')==='notifications'){await navigate('notifications',false);}
  else if(params.get('view')==='clips'){await navigate('clips',false);}
  else if(params.get('view')==='admin'){await navigate('admin',false);}
  else if(params.get('view')==='tapolka'){await navigate('tapolka',false);}
  else if(params.get('view')==='calls'){await navigate('calls',false);}
  else if(params.get('view')==='settings')await navigate('settings');
  else if(params.get('view')==='saved')await navigate('saved',false);
  if(params.get('view')!=='profile'&&(params.get('user')||params.get('id')))await showPerson(params.get('user')||params.get('id'));
}
let listRefreshDebounce;let notificationList=[],notificationFilter='all',notificationPoll=0,lastNotificationId=0,randomHistory=[];let catBoardMode='all';
const notified=new Set();
let soundContext=null;
function playMessageSound(){
  if(!app.state.notificationSound)return;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    soundContext ||= new Ctx();
    if(soundContext.state!=='running')return;
    const oscillator=soundContext.createOscillator(),gain=soundContext.createGain();
    oscillator.type='sine';oscillator.frequency.setValueAtTime(740,soundContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(930,soundContext.currentTime+.09);
    gain.gain.setValueAtTime(.0001,soundContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.045,soundContext.currentTime+.015);
    gain.gain.exponentialRampToValueAtTime(.0001,soundContext.currentTime+.15);
    oscillator.connect(gain).connect(soundContext.destination);oscillator.start();oscillator.stop(soundContext.currentTime+.16);
  }catch{}
}
function receiveInboxEvent(payload){
  const m=payload?.new;if(payload?.eventType!=='INSERT'||!m||!app.user||notified.has(sid(m.id)))return;
  if(m.scheduled_for&&new Date(m.scheduled_for)>new Date()||m.expires_at&&new Date(m.expires_at)<=new Date())return;
  const item=app.dialogs.find(x=>x.id===sid(m.conversation_id));if(!item)return;
  item.last=m.created_at;item.preview=preview(m);const host=$('#messages');
  const reading=!document.hidden&&app.active?.id===item.id&&!app.historyFocus&&host&&host.scrollHeight-host.scrollTop-host.clientHeight<110;
  if(m.sender_id!==app.user.id&&!reading)item.unread=Math.max(0,Number(item.unread)||0)+1;
  renderSidebar();
}
function notifyMessage(payload){
  const m=payload?.new;
  if(payload?.eventType!=='INSERT'||!m||!app.user||m.sender_id===app.user.id)return;
  if(m.scheduled_for&&new Date(m.scheduled_for)>new Date()||m.expires_at&&new Date(m.expires_at)<=new Date())return;
  const id=sid(m.id),cid=sid(m.conversation_id);
  if(notified.has(id)||app.state.muted?.includes(cid))return;
  notified.add(id);if(notified.size>500)notified.delete(notified.values().next().value);
  if(!document.hidden && app.active?.id===cid)return;
  playMessageSound();
  if(!document.hidden||!app.state.notifications||!('Notification' in window)||Notification.permission!=='granted')return;
  // Deduplicate across multiple open tabs without storing text or sender information.
  try{
    const prefix='rndm-notified:'+app.user.id+':',key=prefix+id;
    if(localStorage.getItem(key))return;
    localStorage.setItem(key,String(Date.now()));
    // Avoid indefinitely accumulating notification marker keys.
    if(notified.size%50===0){let checked=0;for(let i=localStorage.length-1;i>=0&&checked<600;i--){const k=localStorage.key(i);if(k?.startsWith(prefix)){checked++;if(Date.now()-Number(localStorage.getItem(k))>86400000)localStorage.removeItem(k);}}}
  }catch{}
  const title=app.dialogs.find(x=>x.id===cid)?.title||'RNDM Chat';
  const options={body:app.state.notificationPreview?preview(m).slice(0,120):'Новое сообщение',icon:new URL('icon-192.png',location.href).href,tag:'rndm-'+id,data:{conversation:cid}};
  const open=()=>{window.focus();openConversation(cid).catch(()=>{});};
  if(navigator.serviceWorker?.getRegistration){
    navigator.serviceWorker.getRegistration().then(reg=>{
      if(reg?.showNotification)return reg.showNotification(title,options);
      const n=new Notification(title,options);n.onclick=()=>{open();n.close();};
    }).catch(()=>{try{const n=new Notification(title,options);n.onclick=()=>{open();n.close();};}catch{}});
  }else try{const n=new Notification(title,options);n.onclick=()=>{open();n.close();};}catch{}
}

function wireShell() {
  $('#listSearch').addEventListener('input',()=>{
    renderSidebar();applyLanguage();clearTimeout(searchTimer);
    const route=app.route;
    if(['contacts','chats'].includes(route))searchTimer=setTimeout(searchPeople,320);
    else if(['channels','tapolka'].includes(route)&&app.channelView==='discover'){
      searchTimer=setTimeout(()=>loadChannelDirectory(true),340);
    }
  });
  $('#listSearch').addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.currentTarget.value='';renderSidebar();applyLanguage();if(app.route==='channels'&&app.channelView==='discover')loadChannelDirectory(true);}
  });
}
async function loadChannelDirectory(reset=false){
  if(!app.user||stopped||app.route!=='channels'||app.channelView!=='discover')return;
  if(app.channelLoading&&!reset)return;
  const token=++channelDirectoryRequest,uid=app.user.id;
  if(reset){app.channelOffset=0;app.channelDirectory=[];app.channelHasMore=true;}
  const search=$('#listSearch')?.value.trim()||'';
  app.channelLoading=true;app.channelError='';renderSidebar();applyLanguage();
  try{
    const found=await api.directoryChannels(search,app.channelOffset,30);
    if(token!==channelDirectoryRequest||app.user?.id!==uid||app.route!=='channels'||app.channelView!=='discover'||$('#listSearch')?.value.trim()!==search)return;
    const seen=new Set(app.channelDirectory.map(ch=>ch.id));
    for(const ch of found)if(!seen.has(ch.id)){app.channelDirectory.push(ch);seen.add(ch.id);}
    app.channelOffset+=found.length;app.channelHasMore=found.length===30;
    app.channelResults=app.channelDirectory;
  }catch(error){if(token===channelDirectoryRequest)app.channelError=errorText(error);}
  finally{if(token===channelDirectoryRequest){app.channelLoading=false;renderSidebar();applyLanguage();}}
}
function renderSidebarError(error){$('#dialogList').innerHTML=`<div class="sidebar-empty"><p>${esc(errorText(error))}</p><button class="secondary" data-action="refresh-list">Повторить</button></div>`;}
function renderSidebar() {
  if(!$('#dialogList'))return;
  const oldScroll=$('#dialogList').scrollTop;renderStories();updateUnreadBadge();
  const route=app.route==='tapolka'?'channels':app.route, search=$('#listSearch').value.trim().toLowerCase();
  const randomShortcut=$('.quick-random');if(randomShortcut)randomShortcut.hidden=route!=='chats';
  const starBadge=$('#starBalanceNav');if(starBadge&&app.profile)starBadge.textContent=Number(app.profile.stars||0).toLocaleString('ru-RU');
  $$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.nav===route||(el.dataset.nav==='chats'&&route==='channels')||(el.classList.contains('nav-more')&&!['chats','contacts','random','channels','clips'].includes(route))));
  $('#sectionTitle').textContent={random:'Рулетка',chats:'Чаты',contacts:'Контакты',channels:'Каналы',saved:'Избранное',settings:'Настройки',clips:'Клипы',calls:'Звонки',admin:'Админка',stars:'Звёзды',donate:'Донат',notifications:'Уведомления',profile:'Профиль'}[route]||'RNDM';
  const count=route==='chats'?app.dialogs.length+app.channels.length+1:route==='channels'?app.channels.length+1:route==='contacts'?app.friends.filter(x=>x.status==='accepted').length:0;
  $('#sectionCount').textContent=count;$('#sectionCount').hidden=!count;
  $('#listSearch').placeholder=route==='channels'?(app.channelView==='discover'?'Поиск по всем каналам':'Поиск моих каналов'):'Поиск чатов, групп и каналов';
  $('#listSearch').closest('.searchbox').hidden=['random','saved','settings','clips','calls','admin','stars','donate','profile','notifications'].includes(route);
  const tabs=route==='chats'?[['all','Все'],['direct','Личные'],['pinned','Важные'],['group','Группы'],['channel','Каналы'],['unread','Новые'],['archive','Архив']]:route==='channels'?[['discover','Каталог'],['mine','Мои каналы']]:[];
  if(route==='chats')tabs.push(...normalizeFolders(app.state.folders).map(f=>[f.id,f.title]));
  paintHTML($('#folderTabs'),tabs.map(([name,label])=>`<button type="button" data-folder="${name}" aria-pressed="${(route==='channels'?app.channelView:app.folder)===name}" class="${(route==='channels'?app.channelView:app.folder)===name?'active':''}">${esc(label)}${name==='unread'&&inboxStats(inboxDialogs(),app.prefs).newChats?'<span class="tab-badge">'+inboxStats(inboxDialogs(),app.prefs).newChats+'</span>':''}</button>`).join('')+(route==='chats'?'<button type="button" data-action="folders-manage" aria-label="Управление папками">＋ Папки</button>':''));$('#folderTabs').hidden=!tabs.length;
  const host=$('#dialogList');
  if(route==='chats'){
    const ownChannels=app.channels.map(ch=>({...ch,kind:'channel',title:ch.title||ch.name,preview:ch.description||'Новые публикации канала'}));
    const combined=unique([...inboxDialogs(),...ownChannels]).filter(x=>{
      const pref=app.prefs[x.id]||{};
      if((app.folder==='archive')!==!!pref.is_archived)return false;
      if(['direct','group','channel'].includes(app.folder)&&x.kind!==app.folder)return false;
      const custom=normalizeFolders(app.state.folders).find(f=>f.id===app.folder);if(custom&&!custom.items.includes(itemKey(x.kind,x.id)))return false;
      if(app.folder==='unread'&&!x.unread)return false;
      if(app.folder==='pinned'&&!pref.is_pinned)return false;
      return !search||(String(x.title||'')+' '+String(x.preview||'')).toLowerCase().includes(search);
    }).sort((a,b)=>Number(app.prefs[b.id]?.is_pinned||0)-Number(app.prefs[a.id]?.is_pinned||0)||new Date(b.last||b.created_at||0)-new Date(a.last||a.created_at||0));
    const catVisible=['all','channel'].includes(app.folder)&&!search || (['all','channel'].includes(app.folder)&&['тапалка','таполка','тап','котик','tapolka','cat'].some(term=>term.includes(search)||search.includes(term)));
    let previousPinned=false;
    const list=combined.map((item,i)=>{const pinned=!!app.prefs[item.id]?.is_pinned;let label='';if(i===0&&pinned)label='<div class="list-label">Закреплённые</div>';else if((i===0||previousPinned)&&!pinned)label='<div class="list-label">Переписки и каналы</div>';previousPinned=pinned;return label+V.row(item,app);}).join('');
    const channelEntry=app.folder==='channel'?'<div class="inbox-channel-tip">Подписки здесь. Найти другие каналы можно в каталоге.</div>':'';
    const footer=app.folder==='channel'?'<button type="button" class="directory-entry" data-action="browse-channels">'+icon('search')+' Найти другие каналы '+icon('chevron')+'</button>':'';
    paintHTML(host,channelEntry+list+footer+(catVisible?'<div class="list-label game-label">Для тебя</div>'+V.tapolkaRow(app.route==='tapolka'):'')+(!combined.length&&!catVisible?`<div class="sidebar-empty"><p>${search?'Ничего не найдено.':app.folder==='archive'?'В архиве пока пусто.':app.folder==='unread'?'Все сообщения прочитаны.':'Тут появятся твои переписки и каналы.'}</p>${!search?'<button class="secondary" data-action="new">Начать общение</button>':''}</div>`:''));
    if(search&&!$('#peopleSearchResults'))host.insertAdjacentHTML('beforeend','<div id="peopleSearchResults"></div>');
  }else if(route==='contacts'){
    const incoming=app.friends.filter(x=>x.status==='pending'&&x.addressee===app.user.id);
    const accepted=app.friends.filter(x=>x.status==='accepted'&&x.person&&(!search||(x.person.display_name+' '+x.person.username).toLowerCase().includes(search.replace(/^@/,''))));
    paintHTML(host,(incoming.length?`<div class="list-label">Заявки в друзья</div>${incoming.map(x=>`<div class="chat-row">${avatar(x.person)}<span class="row-content"><span class="row-name">${esc(x.person?.display_name || 'Пользователь')}</span><span class="row-bottom"><span class="row-preview">Хочет добавить тебя</span></span></span><button class="icon-button small" data-accept="${x.id}" aria-label="Принять заявку">${icon('check')}</button><button class="icon-button small" data-decline="${x.id}" aria-label="Отклонить заявку">${icon('close')}</button></div>`).join('')}`:'')+`<div class="list-label">Мои контакты</div>`+(accepted.map(x=>V.personRow(x.person)).join('')||'<div class="sidebar-empty"><p>Найди человека через поиск по имени или @username.</p></div>')+'<div id="peopleSearchResults"></div>');
  }else if(route==='channels'){
    const discovering=app.channelView==='discover';
    const rows=discovering?app.channelDirectory:app.channels.filter(x=>!search||(String(x.title||x.name)+' '+String(x.description||'')).toLowerCase().includes(search));
    const catVisible=!search||['тапалка','таполка','тап','котик','tapolka','cat'].some(term=>term.includes(search)||search.includes(term));
    const top=`<div class="channel-list-note">${discovering?'Каталог каналов':'Мои каналы'}<small>${discovering?'Все доступные публичные каналы. Открывай и подписывайся.':'Твои подписки и созданные каналы.'}</small></div>`;
    const listing=rows.map(x=>V.row({...x,preview:(x.joined?'✓ Подписка · ':'')+(x.description||'Канал RNDM')},app)).join('');
    const empty=app.channelError?`<div class="sidebar-empty"><p>${esc(app.channelError)}</p><button class="secondary" data-action="channels-reload">Повторить</button></div>`:app.channelLoading?'<div class="sidebar-empty"><span class="spinner"></span><p>Загружаем каналы…</p></div>':!rows.length?`<div class="sidebar-empty"><p>${search?'Каналы по запросу не найдены.':discovering?'Пока нет доступных каналов.':'Ты пока не подписан на другие каналы.'}</p></div>`:'';
    const more=discovering&&app.channelHasMore&&!app.channelLoading&&!app.channelError?'<button type="button" class="directory-entry" data-action="channels-more">Показать ещё каналы '+icon('chevron')+'</button>':'';
    paintHTML(host,top+(catVisible?V.tapolkaRow(app.route==='tapolka'):'')+listing+empty+more);
  }else if(route==='random'){
    paintHTML(host,'<div class="sidebar-empty"><span class="random-sidebar-ornament">✨</span><h3>Новые знакомства</h3><p>Выбирай тему и находи людей для общения.</p><button class="primary" data-action="random-start">Начать поиск</button></div>');
  }else if(route==='notifications'){
    paintHTML(host,'<div class="sidebar-empty"><span style="font-size:38px">🔔</span><h3>Твои события</h3><p>Подарки, сообщения, звонки и новые знакомства.</p><button class="primary" data-action="notifications-refresh">Обновить события</button></div>');
  }else if(route==='donate'){
    paintHTML(host,'<div class="sidebar-empty"><span style="font-size:46px">💜</span><h3>Поддержать RNDM</h3><p>Boosty, 1000 Stars и три кейса с эксклюзивными подарками.</p><button class="primary" data-nav="stars">Открыть кошелёк ⭐</button></div>');
  }else if(route==='stars'){
    paintHTML(host,'<div class="sidebar-empty"><span style="font-size:42px">⭐</span><h3>Твой кошелёк</h3><p>Забирай ежедневные звёзды и дари подарки друзьям.</p><button class="primary" data-action="stars-refresh">Обновить баланс</button></div>');
  }else if(route==='saved'){
    paintHTML(host,V.row({id:'saved',kind:'saved',title:'Избранное',preview:'Твои заметки и сохранённые сообщения'},app)+'<div class="sidebar-empty"><p>Сохраняй важное через меню сообщения или добавляй заметки прямо здесь.</p></div>');
  }else if(route==='admin'){
    paintHTML(host,'<div class="sidebar-empty"><p>Управление пользователями, жалобами и публикациями.</p><button class="secondary" data-nav="chats">Открыть чаты</button></div>');
  }else if(route==='clips'||route==='calls'){
    paintHTML(host,`<div class="sidebar-empty"><p>${route==='clips'?'Смотри видео, делись своими клипами и общайся в комментариях.':'Позвони из личного чата. История вызовов показана справа.'}</p><button class="secondary" data-nav="chats">Открыть чаты</button></div>`);
  }else{
    paintHTML(host,`<div class="detail-profile">${avatar(app.profile,'large')}<h2>${esc(app.profile.display_name)}</h2><p>@${esc(app.profile.username)}</p></div><div class="sidebar-empty"><p>Настрой RNDM под себя.<br>Твой профиль, оформление и приватность.</p></div>`);
  }
  host.scrollTop=oldScroll;
}
let listRefreshPromise=null;
async function refreshLists() {
  if(!app.user||stopped)return;if(listRefreshPromise)return listRefreshPromise;
  const uid=app.user.id;
  listRefreshPromise=(async()=>{
    const withChannels=['channels','tapolka','chats'].includes(app.route),withFriends=app.route==='contacts';
    const results=await Promise.allSettled([api.dialogs(),withChannels?api.channels():Promise.resolve(null),withFriends?api.friends():Promise.resolve(null)]);
    if(app.user?.id!==uid||stopped)return;
    if(results[0].status==='fulfilled')app.dialogs=results[0].value;
    if(results[1].status==='fulfilled'&&results[1].value)app.channels=results[1].value;
    if(results[2].status==='fulfilled'&&results[2].value)app.friends=results[2].value;
    renderSidebar();applyLanguage();
    if(!app.active&&app.route==='chats')paintHTML($('#pane'),V.welcome(app));
    if(results[0].status==='rejected')throw results[0].reason;
    connection(navigator.onLine?'RNDM · на связи':'Нет соединения',!navigator.onLine);
  })().finally(()=>listRefreshPromise=null);return listRefreshPromise;
}
async function searchPeople() {
  const field=$('#listSearch');if(!field)return;const query=field.value.trim(),route=app.route;
  if(query.replace(/^@/,'').length<2){if($('#peopleSearchResults'))$('#peopleSearchResults').innerHTML='';return;}
  try{const people=await api.people(query);if($('#listSearch')?.value.trim()!==query||app.route!==route)return;people.forEach(p=>app.peopleMap[p.id]=p);const host=$('#peopleSearchResults');if(host)host.innerHTML='<div class="list-label">Люди</div>'+people.map(x=>V.personRow(x)).join('')+(people.length?'':'<div class="sidebar-empty"><p>Никого не найдено.</p></div>');}catch(error){if($('#peopleSearchResults'))showError($('#peopleSearchResults'),error);}
}
async function navigate(route,push=true) {
  stopPaneMedia();
  if(!app.user)return;
  if(!['chats','random','contacts','channels','clips','calls','saved','stars','donate','settings','notifications','profile','admin','tapolka'].includes(route))route='chats';
  if(app.route==='random' && route==='random'){renderRandomPage();return;}
  if(app.route==='random' && route!=='random')await stopRandomSearch(true).catch(()=>{});
  if(route==='admin'&&!staffRole(app.profile.app_role)){toast('Админка доступна только администрации.');route='chats';}
  admin?.stop();donateHub?.stop();
  applyColors(app.state.colors);clips?.stop();captureDraft();cancelEdit();cancelVoice();stopSubscriptions();closePop();
  ++app.epoch;++app.messageEpoch;app.active=null;app.info=null;app.reply=null;app.messages=[];app.route=route;app.folder='all';if(route==='tapolka'&&!['chats','channels'].includes(tapolkaReturnRoute))tapolkaReturnRoute='channels';if(route==='channels')app.channelView='discover';++channelDirectoryRequest;++channelSearchVersion;channelSearchLoading=false;channelSearchError='';app.channelResults=[];$('#listSearch').value='';$('#workspace').classList.toggle('in-chat',['settings','saved','tapolka','clips','calls','admin','profile','random','stars','donate','notifications'].includes(route));
  if(push){const url=new URL(location.href);url.search='';if(route!=='chats'){url.searchParams.set('view',route);if(route==='profile'&&app.profileTarget)url.searchParams.set('user',app.profileTarget);}history.pushState({},'',url);}
  $('#pane').innerHTML=route==='settings'?V.settings(app):V.welcome(app);renderSidebar();applyLanguage();
  const epoch=app.epoch;
  try{
    if(route==='admin'){await admin.open($('#pane'));return;}
    if(route==='random'){await openRandomPage();return;}
    if(route==='tapolka'){await openTapolka();return;}
    if(route==='stars'){await openStars();return;}if(route==='donate'){await donateHub.open($('#pane'));return;}if(route==='notifications'){await openNotifications();return;}
    if(route==='profile'){await openPublicProfile(app.profileTarget);return;}
    if(route==='clips'){await clips.open($('#pane'),new URL(location.href).searchParams.get('clip'));return;}
    if(route==='calls'){$('#pane').innerHTML='<header class="chat-header"><button class="icon-button back-mobile" data-action="back" aria-label="К чатам">'+icon('back')+'</button><h2>Звонки</h2><button class="secondary" data-action="refresh-calls">Обновить</button></header><section class="calls-history" id="callsHistory"></section>';await calls.history($('#callsHistory'));return;}
    if(route==='contacts'){const friends=await api.friends();if(epoch!==app.epoch)return;app.friends=friends;friends.forEach(x=>{if(x.person)app.peopleMap[x.person.id]=x.person;});}
    if(route==='channels'){try{const channels=await api.channels();if(epoch!==app.epoch)return;app.channels=channels;}catch(error){console.warn('RNDM channel subscriptions:',errorText(error));}await loadChannelDirectory(true);}
    if(route==='saved'){await openSaved(push);return;}
    if(route==='chats')await refreshLists();
    renderSidebar();applyLanguage();
  }catch(error){if(epoch===app.epoch)renderSidebarError(error);}
}
async function refreshTogetherAccess(){
  if(!app.user)return false;
  if(app.profile?.app_role==='owner'){app.togetherAccess=true;return true;}
  const uid=app.user.id;
  let allowed=false;
  try{const result=await Promise.race([api.sb.rpc('rndm_together_can_access'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Истекло время проверки доступа к играм')),12000))]);if(result.error)throw result.error;allowed=result.data===true;}
  catch(error){console.warn('Together access check:',error.message);}
  if(app.user?.id!==uid)return false;
  const before=app.togetherAccess;
  app.togetherAccess=allowed;
  if(!allowed&&before){together?.stop();document.querySelector('.tg-header-button')?.remove();}
  if(allowed&&!before&&['direct','group'].includes(app.active?.kind)&&document.querySelector('#pane .header-tools')){
    const box=document.querySelector('#pane .header-tools');
    if(!box.querySelector('.tg-header-button')){
      const button=document.createElement('button');button.type='button';button.className='icon-button tg-header-button';button.dataset.action='together-open';button.title='RNDM Together · закрытый тест';button.setAttribute('aria-label','Открыть RNDM Together');button.textContent='🎮';box.prepend(button);
    }
    together?.bind(app.active.id).catch(error=>console.warn('Together:',error.message));
  }
  return allowed;
}

async function openConversation(id,push=true) {
  stopPaneMedia();
  id=sid(id);if(!id)return;
  if(app.route==='random')await stopRandomSearch(true).catch(()=>{});
  admin?.stop();clips?.stop();captureDraft();cancelEdit();cancelVoice();stopSubscriptions();closePop();
  const epoch=++app.epoch;++app.messageEpoch;app.route='chats';app.active={id,kind:app.dialogs.find(x=>x.id===id)?.kind || 'direct'};app.reply=null;app.messages=[];app.reactions=[];app.pins=[];app.replyLookup={};app.info=null;
  $('#workspace').classList.add('in-chat');$('#pane').innerHTML='<div class="empty-messages"><span class="spinner"></span><h3>Открываем чат…</h3></div>';renderSidebar();applyLanguage();
  if(push){const url=new URL(location.href);url.search='';url.searchParams.set('chat',id);history.pushState({},'',url);}
  try{
    const info=await api.info(id);if(!isCurrent(epoch,id))return;
    // Chat opening is independent from the optional beta-games permission endpoint.
    app.info=info;app.active={...app.dialogs.find(x=>x.id===id),id,kind:info.conv.kind || 'direct'};info.profiles.forEach(p=>app.peopleMap[p.id]=p);
    $('#pane').innerHTML=V.conversation(app);wireConversation();
    if(app.togetherAccess)together?.bind(id).catch(error=>console.warn('Together:',error.message));
    refreshTogetherAccess().catch(error=>console.warn('Together access:',error.message));
    await refreshMessages(true);if(!isCurrent(epoch,id))return;
    subscribeActive();await markRead().catch(()=>connection('Не удалось отметить прочтение',true));renderSidebar();applyLanguage();
  }catch(error){if(isCurrent(epoch,id))$('#pane').innerHTML=`<div class="empty-messages">${icon('chats')}<h3>Чат пока недоступен</h3><p class="muted">${esc(errorText(error))}</p><button class="secondary" data-retry-chat="${esc(id)}">Повторить</button><button class="text-button" data-action="back">К списку чатов</button></div>`;}
}
async function openChannel(id,push=true) {
  stopPaneMedia();
  admin?.stop();clips?.stop();captureDraft();cancelEdit();cancelVoice();stopSubscriptions();closePop();const epoch=++app.epoch;++app.messageEpoch;
  const source=app.route==='chats'?'chats':'channels';app.route=source;app.active=null;$('#workspace').classList.add('in-chat');$('#pane').innerHTML='<div class="empty-messages"><span class="spinner"></span><h3>Открываем канал…</h3></div>';let channel=app.channels.find(x=>x.id===sid(id))||app.channelResults.find(x=>x.id===sid(id))||app.channelDirectory.find(x=>x.id===sid(id));
  try{const fresh=await api.channel(id);if(epoch!==app.epoch)return;channel={...channel,...fresh};try{channel.tools=await api.channelTools(id);}catch(error){channel.toolsError=errorText(error);}}
  catch(error){if(!channel){if(epoch===app.epoch)$('#pane').innerHTML=`<div class="empty-messages"><p>${esc(errorText(error))}</p><button class="secondary" data-action="back">К списку каналов</button></div>`;return;}console.warn('Channel metadata refresh:',errorText(error));}
  if(epoch!==app.epoch)return;app.active=channel;
  app.info=null;app.reply=null;app.reactions=[];app.messages=[];app.pins=[];$('#workspace').classList.add('in-chat');$('#pane').innerHTML=V.conversation(app);wireConversation();renderSidebar();applyLanguage();
  if(push)history.pushState({},'',location.pathname+'?view='+source+'&channel='+encodeURIComponent(id));
  try{await refreshMessages(true);if(epoch===app.epoch)subscribeActive();}catch(error){if(epoch===app.epoch)showError($('#messages'),error);}
}
async function openSaved(push=true) {
  stopPaneMedia();
  admin?.stop();clips?.stop();captureDraft();cancelEdit();cancelVoice();stopSubscriptions();const epoch=++app.epoch;++app.messageEpoch;app.route='saved';app.active={id:'saved',kind:'saved'};app.info=null;app.reply=null;app.messages=[];app.reactions=[];app.pins=[];
  $('#workspace').classList.add('in-chat');$('#pane').innerHTML=V.conversation(app);wireConversation();renderSidebar();applyLanguage();
  if(push)history.replaceState({},'',location.pathname+'?view=saved');
  try{await refreshMessages(true);}catch(error){if(epoch===app.epoch)showError($('#messages'),error);}
}
function wireConversation() {
  applyWallpaper();
  const input=$('#messageInput');
  if(input){const key=['direct','group'].includes(app.active.kind)?chatKey(app.active.id):activeKey();input.value=app.drafts[key]?.body || '';input.addEventListener('input',()=>{captureDraft();renderCompose();scheduleSidebarPaint();if(['direct','group'].includes(app.active.kind))sendTyping();});input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&innerWidth>760&&app.state.enterSend!==false){event.preventDefault();send();}if(event.key==='Escape'){cancelEdit();app.reply=null;renderCompose();}});$('#composer').onsubmit=e=>{e.preventDefault();send();};$('#attachmentInput').onchange=e=>selectFile(e.target.files?.[0]);renderCompose();}
  const host=$('#messages');let width=host.clientWidth,height=host.clientHeight;
  wireFileInput(input);
  const resizeMessages=()=>{if(width===host.clientWidth&&height===host.clientHeight)return;const follow=host.dataset.follow==='true';width=host.clientWidth;height=host.clientHeight;if(follow)host.scrollTop=host.scrollHeight;const jump=$('[data-action=bottom]');if(jump)jump.hidden=!app.historyFocus&&host.scrollHeight-host.scrollTop-host.clientHeight<100;};
  host.addEventListener('scroll',()=>{resizeMessages();const near=host.scrollHeight-host.scrollTop-host.clientHeight<100;host.dataset.follow=String(near);const jump=$('[data-action=bottom]');if(jump)jump.hidden=near&&!app.historyFocus;if(near&&!app.historyFocus)markRead().catch(()=>{});},{passive:true});
  // Native-feeling reply gesture, preserves vertical scrolling and text selection.
  let swipe=null;
  host.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||!['direct','group'].includes(app.active?.kind)||event.target.closest('button,a,input,textarea,video,audio,.attachment'))return;
    const row=event.target.closest('.message-row[data-mid]');
    if(!row||!host.contains(row)||!currentMessage(row.dataset.mid)||currentMessage(row.dataset.mid).deleted_at)return;
    swipe={id:row.dataset.mid,row,x:event.clientX,y:event.clientY,at:Date.now()};
  },{passive:true});
  host.addEventListener('pointerup',event=>{
    if(!swipe||event.pointerType!=='touch')return;
    const start=swipe;swipe=null;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.abs(dx)<64||Math.abs(dy)>48||Date.now()-start.at>950||window.getSelection()?.toString())return;
    const message=currentMessage(start.id);
    if(!message||!['direct','group'].includes(app.active?.kind))return;
    cancelEdit();app.reply=message;closePop();renderCompose();
    const input=$('#messageInput');if(input){input.focus({preventScroll:true});input.scrollIntoView({block:'nearest'});}
    if(navigator.vibrate)navigator.vibrate(10);
  },{passive:true});
  host.addEventListener('pointercancel',()=>swipe=null,{passive:true});
  host.addEventListener('load',()=>{if(host.dataset.follow==='true')host.scrollTop=host.scrollHeight;},true);
  messageSizeObserver?.disconnect();if(window.ResizeObserver){messageSizeObserver=new ResizeObserver(resizeMessages);messageSizeObserver.observe(host);}
  $('#messageSearch').addEventListener('input',()=>{clearTimeout(messageSearchTimer);messageSearchTimer=setTimeout(searchMessages,350);});
  $('[data-action=bottom]').hidden=true;
}
function refreshMessages(initial=false,older=false) {
  const active=app.active,epoch=app.epoch;if(!active||stopped)return Promise.resolve();
  if(app.historyFocus&&!initial&&!older)return Promise.resolve();
  if(messageLane.epoch!==epoch)messageLane={epoch,lane:new RequestLane()};
  return messageLane.lane.run(initial?'initial':older?'older':'latest',async()=>{
    if(!isCurrent(epoch,active.id)||app.historyFocus&&!initial&&!older)return;
    const request=++app.messageEpoch;let rows;
    if(active.kind==='saved')rows=sortMessages([...(await api.saved()),...(app.state.notes||[])]);
    else if(active.kind==='channel')rows=await api.posts(active.id,older?app.messages[0]:null);
    else rows=await api.messagePage(active.id,older?app.messages[0]:null);
    if(!isCurrent(epoch,active.id)||request!==app.messageEpoch)return;
    let messages;
    if(older)messages=sortMessages([...rows,...app.messages]);
    else if(initial||active.kind==='saved')messages=rows;
    else{const fresh=new Set(rows.map(x=>sid(x.id))),earliest=rows[0];messages=sortMessages([...app.messages.filter(x=>!fresh.has(sid(x.id))&&earliest&&new Date(x.created_at)<new Date(earliest.created_at)),...rows]);}
    if(!older&&!app.historyFocus){for(const row of rows)app.confirmedMessages.delete(sid(row.id));messages=sortMessages([...messages,...app.confirmedMessages.values()]);}
    const followups=await messageDetails(active,messages);
    if(!isCurrent(epoch,active.id)||request!==app.messageEpoch)return;
    if(!older&&!app.historyFocus)messages=sortMessages([...messages,...app.confirmedMessages.values()]);
    app.messages=messages;
    if(active.kind==='saved')app.more=false;else if(initial||older)app.more=rows.length===60;
    applyMessageDetails(followups);renderMessages(initial,older);renderPinned();
  });
}
async function messageDetails(active,rows){
  const ids=rows.filter(x=>!x.note).map(x=>x.saved_original||x.id);
  return Promise.allSettled([
    active.kind==='saved'?Promise.resolve([]):api.reactions(ids,active.kind==='channel'),
    ['direct','group'].includes(active.kind)?api.pins(active.id):active.kind==='channel'?api.channelTools(active.id).then(t=>t?.pin?[{message_id:t.pin}]:[]):Promise.resolve([]),
    ['direct','group'].includes(active.kind)?api.replyMessages([...new Set(rows.map(x=>x.reply_to).filter(Boolean))]):Promise.resolve([])
  ]);
}
function applyMessageDetails(results){
  if(results[0].status==='fulfilled')app.reactions=results[0].value;
  if(results[1].status==='fulfilled')app.pins=results[1].value;
  if(results[2].status==='fulfilled')app.replyLookup=Object.fromEntries(results[2].value.map(x=>[sid(x.id),x]));
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
    const html=V.messageHTML({...message,body:applyIncomingCensorship(message.body)},app);node.dataset.key=k;node.dataset.mid=sid(message.id);node.className='message-row '+((message.sender_id===app.user.id||message.note)?'own':'')+(app.selecting?' selecting':'')+(app.selection.has(sid(message.id))?' selected':'');
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
  const jump=$('[data-action=bottom]');if(jump){jump.hidden=!app.historyFocus&&host.scrollHeight-host.clientHeight-host.scrollTop<100;jump.title=app.historyFocus?'Вернуться к последним сообщениям':'К новым сообщениям';}
  renderSelection();
}
function updateMessageNode(node,html){
  if(!node.querySelector('.attachment')){node.innerHTML=html;return;}
  const next=document.createElement('div');next.innerHTML=html;
  const oldStable=node.cloneNode(true),newStable=next.cloneNode(true);
  for(const selector of ['.message-meta','.reaction-list','.voice-speed']){oldStable.querySelector(selector)?.remove();newStable.querySelector(selector)?.remove();}
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
async function markRead(){
  const a=app.active,host=$('#messages'),uid=app.user?.id;if(!a||!uid||app.historyFocus||!['direct','group'].includes(a.kind)||document.hidden||!host||host.scrollHeight-host.clientHeight-host.scrollTop>110)return;
  const newest=app.messages.at(-1)?.created_at;if(!newest)return;
  const key=uid+':'+a.id;if(newest<=String(lastRead.get(key)||'')&&!(app.state.manualUnread||[]).includes(a.id))return;
  if(readRequests.has(key))return readRequests.get(key);
  const task=(async()=>{await api.markRead(a.id);if(app.user?.id!==uid||stopped)return;lastRead.set(key,newest);if((app.state.manualUnread||[]).includes(a.id))await changeState(s=>({...s,manualUnread:(s.manualUnread||[]).filter(x=>x!==a.id)}));const dialog=app.dialogs.find(x=>x.id===a.id);if(dialog?.unread){dialog.unread=0;renderSidebar();applyLanguage();}})().finally(()=>readRequests.delete(key));
  readRequests.set(key,task);return task;
}
function subscribeActive() {
  stopSubscriptions(false);const active=app.active;if(!active||active.kind==='saved')return;
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
  const count=$('#composeCount');if(count){count.textContent=input.value.length+' / 4000';count.classList.toggle('near-limit',input.value.length>=3600);}
  const pending=app.pending.has(activeKey());$('#sendButton').disabled=pending||!!record||(!input.value.trim()&&!file);$('#sendButton').title=pending?'Отправляем…':app.edit?'Сохранить изменение':'Отправить сообщение';
  $('[data-action=voice]').disabled=pending||!!app.edit||!!file||voiceBusy;
  $('[data-action=voice]').classList.toggle('active',!!record);$('[data-action=voice]').setAttribute('aria-label',record?'Остановить запись':'Записать голосовое');
  if(record)$('#typingLine').textContent='Запись '+Math.floor((Date.now()-record.started)/1000)+' с · нажми микрофон, чтобы остановить';
  if(pending)$('#typingLine').textContent='Отправляем'+(file?' вложение…':'…');
  $('#messages')?.classList.toggle('recording',!!record);
}
function clearFile(key=activeKey()) { const file=app.files.get(key);if(file?.url)URL.revokeObjectURL(file.url);app.files.delete(key);if(key===activeKey())renderCompose(); }
function selectFile(file) {
  if(!file)return;if(app.pending.has(activeKey())){toast('Дождись завершения отправки.');return;}if(app.edit){toast('Сначала закончи редактирование');return;}if(!file.size||file.size>window.RNDM_CONFIG.maxFileBytes){toast(file.size?'Максимальный размер — 50 МБ':'Файл пустой');return;}
  clearFile();app.files.set(activeKey(),{file,url:['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)?URL.createObjectURL(file):null});$('#attachmentInput').value='';renderCompose();
}
async function send() {
  const active=app.active,input=$('#messageInput');if(!active||!input||record)return;
  const key=activeKey(),original=input.value,file=fileFor();let body=original.trim();if(app.pending.has(key)||(!body&&!file))return;
  if(body&&active.kind!=='saved'){const check=filterOutgoing(body);if(!check.ok){$('#sendError').textContent=check.reason;return;}body=check.text;}
  if(!navigator.onLine){$('#sendError').textContent='Нет соединения. Текст сохранён в черновике; отправь его после подключения.';captureDraft();return;}
  const reply=app.reply,edit=app.edit,epoch=app.epoch;app.pending.add(key);$('#sendError').textContent='';captureDraft();renderCompose();
  try {
    let confirmed;
    if(edit){if(!body)throw new Error('Текст сообщения не может быть пустым.');confirmed=active.kind==='channel'?await api.editPost(active.id,edit.id,body):await api.edit(edit.id,body);}
    else if(active.kind==='saved'){
      let upload=null;if(file)upload=await api.upload('chat-files',file.file,'saved');
      const note={id:'note-'+crypto.randomUUID(),note:true,sender_id:app.user.id,body,created_at:new Date().toISOString(),attachment_url:upload?.url,attachment_name:upload?.name,attachment_type:upload?.type};
      try{await changeState(state=>({...state,notes:[...(state.notes||[]),note]}));}catch(error){if(upload&&!/fetch|network|abort|timeout/i.test(error.message||''))await api.sb.storage.from(upload.bucket).remove([upload.path]);throw error;}
    }else if(active.kind==='channel'){const row=await api.publish(active.id,body,file?.file);confirmed={...row,sender_id:row.author_id};}
    else confirmed=await api.send(active.id,body,file?.file,reply?{reply_to:reply.id}:{});
    if(!edit)clearDraft(active,original);
    if(app.files.get(key)===file)clearFile(key);
    if(isCurrent(epoch,active.id)){
      if(edit && app.edit===edit){cancelEdit();}
      else if(input.value===original)input.value='';
      if(app.reply===reply)app.reply=null;renderCompose();
      if(confirmed?.id&&!app.historyFocus){app.confirmedMessages.set(sid(confirmed.id),confirmed);app.messages=sortMessages([...app.messages,confirmed]);renderMessages();}
      const leaveHistory=!edit&&app.historyFocus;if(leaveHistory)app.historyFocus=false;
      await refreshMessages(leaveHistory).then(markRead).catch(()=>toast('Сообщение отправлено. Обнови чат, чтобы увидеть его.'));
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
  showModal('Новая группа',`<form id="groupForm"><label class="field">Название<input id="groupName" placeholder="Например, Наш круг" maxlength="80" minlength="2" required></label><label class="field">Аватарка группы (необязательно)<input id="newGroupAvatar" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"></label><p class="muted" style="font-size:11px;margin:15px 0">Добавь участников из своих контактов.</p><div class="modal-list">${people.map(p=>`<label class="select-person"><input type="checkbox" name="member" value="${esc(p.id)}">${avatar(p,'small')}<div><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div></label>`).join('')||'<p class="muted" style="font-size:12px;padding:10px">Сначала добавь людей в контакты.</p>'}</div><div id="modalError"></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button type="submit" class="primary">Создать группу</button></div></form>`);
  $('#groupForm').onsubmit=async e=>{e.preventDefault();const b=$('button[type=submit]',e.currentTarget);b.disabled=true;try{const ids=new FormData(e.currentTarget).getAll('member');if(!ids.length)throw new Error('Выбери хотя бы одного участника.');const cid=await api.group($('#groupName').value.trim(),ids);if(!cid)throw new Error('Сервер не подтвердил создание группы.');const picture=$('#newGroupAvatar')?.files?.[0];if(picture){try{await apiUploadChatAvatar(cid,picture,'group');}catch(imageError){toast('Группа создана, но фото не загрузилось: '+errorText(imageError));}}modal.close();await refreshLists();await openConversation(cid);}catch(error){showError($('#modalError'),error);}finally{b.disabled=false;}};
}
async function prepareChatAvatar(file) {
  if(!file)throw new Error('Выбери фотографию.');
  const type=String(file.type||'').toLowerCase();
  if(!/^image\/(jpeg|png|webp|heic|heif)$/.test(type))throw new Error('Выбери JPG, PNG, WebP или HEIC.');
  if(file.size>10*1024*1024||file.size<50)throw new Error('Фотография должна быть меньше 10 МБ.');
  const source=URL.createObjectURL(file);
  const img=new Image();
  try {
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Телефон не смог открыть фото. Попробуй JPG.'));img.src=source;});
    const width=img.naturalWidth,height=img.naturalHeight;
    if(!width||!height)throw new Error('Неверное изображение.');
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,512/Math.max(width,height));
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Редактор фото недоступен.');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));
    if(!blob||!blob.size)throw new Error('Не удалось обработать фотографию.');
    return new File([blob],'chat-avatar.jpg',{type:'image/jpeg'});
  }finally{URL.revokeObjectURL(source);}
}
async function apiUploadChatAvatar(chatId,file,kind) {
  const photo=await prepareChatAvatar(file);
  const bucket=kind==='group'?'group-avatars':'channel-avatars';
  const upload=await api.upload(bucket,photo,'images');
  try {
    if(kind==='group')await api.setGroupAvatar(chatId,upload.url);
    else await api.setChannelAvatar(chatId,upload.url);
    return upload.url;
  }catch(error){
    if(!/fetch|network|abort|timeout/i.test(error.message||''))await api.sb.storage.from(bucket).remove([upload.path]).catch(()=>{});
    throw error;
  }
}
async function openGroupInvite(){
  const active={...app.active};
  if(active.kind!=='group'||!app.info)throw new Error('Сначала открой группу.');
  if(!app.info.members.some(m=>m.user_id===app.user.id&&['owner','admin'].includes(m.role)))
    throw new Error('Добавлять участников может владелец или администратор.');
  const already=new Set(app.info.members.map(m=>m.user_id));
  const friends=await api.friends();
  const people=friends.filter(x=>x.status==='accepted'&&x.person&&!already.has(x.person.id)).map(x=>x.person);
  showModal('Добавить людей в группу',`<form id="inviteGroupForm"><p class="muted">Выбери друзей из контактов. Только владелец и администраторы могут добавлять людей. Не больше 200 участников в группе.</p><label class="searchbox modal-search">${icon('search')}<input type="search" id="inviteGroupSearch" placeholder="Имя или @username" autocomplete="off" aria-label="Поиск друзей"></label><div class="modal-list" id="inviteGroupList">${people.map(p=>`<label class="select-person"><input type="checkbox" name="member" value="${esc(p.id)}">${avatar(p,'small')}<div><b>${esc(p.display_name||p.username)}</b><small>@${esc(p.username)}</small></div></label>`).join('')||'<p class="muted" style="padding:12px">Все твои друзья уже в группе. Чтобы пригласить других, сначала добавь их в контакты.</p>'}</div><div id="inviteGroupError"></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button type="submit" class="primary" ${people.length?'':'disabled'}>Добавить участников</button></div></form>`);
  const search=$('#inviteGroupSearch');search.oninput=()=>{
    const query=search.value.trim().replace(/^@/,'').toLowerCase();
    $$('#inviteGroupList .select-person').forEach(row=>row.hidden=!!query&&!row.textContent.toLowerCase().includes(query));
  };
  $('#inviteGroupForm').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,btn=$('button[type=submit]',form);
    btn.disabled=true;
    try{
      const ids=new FormData(form).getAll('member');if(!ids.length)throw new Error('Выбери хотя бы одного друга.');
      const result=await api.addGroupMembers(active.id,ids);
      modal.close();const n=Number(result?.count||0);
      if(app.active?.id===active.id){app.info=await api.info(active.id);const presence=$('#presenceText');if(presence)presence.textContent=app.info.members.length+' участников';if($('#detail'))info();}
      await refreshLists();toast(n?`Добавлено участников: ${n}`:'Все выбранные друзья уже в группе.');
    }catch(error){showError($('#inviteGroupError'),error);}finally{if(btn.isConnected)btn.disabled=false;}
  };
}
function openChatAvatarChooser(kind){
  const active={...app.active};if(!active||!['group','channel'].includes(kind))return;
  if(active.kind!==kind){toast('Открой нужную группу или канал.');return;}
  const saved=kind==='group'?app.info?.conv?.avatar_url:active.avatar_url;
  showModal(kind==='group'?'Аватарка группы':'Аватарка канала',`<form id="chatAvatarForm"><div class="avatar-change-preview">${avatar({display_name:active.title||app.info?.conv?.title||'Группа',avatar_url:saved},'large',kind==='group'?'contacts':'channels')}</div><p class="muted">Выбери фото для оформления. Мы автоматически уменьшим его до 512 пикселей. Можно выбрать фотографию из галереи iPhone.</p><label class="field">Новое фото<input id="chatAvatarPicture" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" required></label><div id="chatAvatarError"></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button class="primary" type="submit">Сохранить фото</button></div></form>`);
  $('#chatAvatarForm').onsubmit=async event=>{
    event.preventDefault();const button=$('button[type=submit]',event.currentTarget);button.disabled=true;
    try{
      const file=$('#chatAvatarPicture').files?.[0];const url=await apiUploadChatAvatar(active.id,file,kind);
      if(kind==='group'){
        const dialog=app.dialogs.find(x=>x.id===active.id);if(dialog)dialog.avatar_url=url;
        if(app.active?.id===active.id){app.info.conv.avatar_url=url;app.active.avatar_url=url;}
      }else{
        for(const list of [app.channels,app.channelResults]){const ch=list.find(x=>x.id===active.id);if(ch)ch.avatar_url=url;}
        if(app.active?.id===active.id)app.active.avatar_url=url;
      }
      modal.close();renderSidebar();
      if(app.active?.id===active.id){const element=$('#pane .chat-header > .avatar');if(element)element.outerHTML=avatar({title:active.title||app.info?.conv?.title||'Группа',avatar_url:url},'',kind==='group'?'contacts':'channels');if($('#detail'))info();}
      toast('Фото сохранено');
    }catch(error){showError($('#chatAvatarError'),error);}finally{if(button.isConnected)button.disabled=false;}
  };
}

function newChannel() {
  showModal('Новый канал',`<form id="channelForm"><label class="field">Название<input id="channelName" placeholder="Имя твоего канала" minlength="2" maxlength="15" required></label><label class="field">Описание<textarea id="channelDescription" rows="3" maxlength="50" placeholder="О чём здесь будут публикации?"></textarea></label><label class="field">Аватарка канала<input id="newChannelAvatar" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"></label><p class="muted" style="font-size:11px;line-height:1.7">Публикации доступны читателям. Писать посты может владелец канала.</p><div id="modalError"></div><div class="modal-actions"><button type="button" class="secondary" data-action="close-modal">Отмена</button><button class="primary" type="submit">Создать канал</button></div></form>`);
  $('#channelForm').onsubmit=async e=>{e.preventDefault();const b=$('button[type=submit]',e.currentTarget);b.disabled=true;try{const ch=await api.createChannel($('#channelName').value.trim(),$('#channelDescription').value.trim());const picture=$('#newChannelAvatar')?.files?.[0];if(picture){try{await apiUploadChatAvatar(ch.id,picture,'channel');}catch(imageError){toast('Канал создан, но фото не загрузилось: '+errorText(imageError));}}modal.close();await navigate('channels');await openChannel(ch.id);}catch(error){showError($('#modalError'),error);}finally{b.disabled=false;}};
}
async function showPerson(uid){
 if(modal.open)modal.close();
 if(!uid)return;
 previousRoute=app.route;previousChatId=app.active?.kind==='direct'?app.active.id:null;app.profileTarget=uid;
 await navigate('profile');
}

function chatMenu(anchor) {
  const a=app.active;if(!a)return;const pref=app.prefs[a.id]||{};
  let html=`<button data-action="info">${icon('info')}Информация</button><button data-action="chat-search">${icon('search')}Поиск по переписке</button>`;
  if(a.kind==='direct')html+=`<button data-action="chat-gift">${icon('gift')}Подарить подарок</button>`;
  if(['direct','group'].includes(a.kind))html+=`<button data-action="pin-chat">${icon('pin')}${pref.is_pinned?'Открепить чат':'Закрепить чат'}</button><button data-action="archive-chat">${icon('archive')}${pref.is_archived?'Вернуть из архива':'В архив'}</button><button data-action="mute-chat">${icon('mute')}${app.state.muted.includes(a.id)?'Включить уведомления':'Без уведомлений'}</button><button data-action="chat-wallpaper">${icon('image')}Фон чата</button><button data-action="schedule-message">🕒 Отложить сообщение</button>`;
  if(a.kind==='channel')html+=`<button data-action="join-channel">${icon(a.joined?'close':'plus')}${a.joined?'Отписаться':'Подписаться'}</button>`;
  if(a.kind==='group'&&app.info?.members.some(m=>m.user_id===app.user.id&&['owner','admin'].includes(m.role)))html+=`<button data-action="group-invite">${icon('plus')}Добавить участников</button><button data-action="group-avatar">${icon('image')}Аватарка группы</button>`;
  if(a.kind==='channel'&&a.owner_id===app.user.id)html+=`<button data-action="channel-avatar">${icon('image')}Аватарка канала</button>`;
  html+=`<button data-action="select-messages">${icon('check')}Выбрать сообщения</button><button data-action="media">${icon('image')}Медиа и файлы</button><button data-action="export-chat">${icon('download')}Экспорт переписки</button><button data-action="refresh-chat">${icon('refresh')}Обновить</button>`;showPop(anchor,html);
}
function messageMenu(id,anchor) {
  const m=currentMessage(id);if(!m||m.deleted_at)return;const own=m.sender_id===app.user.id,a=app.active;let html='';
  if(a.kind!=='saved')html=`<div class="quick-reactions">${['❤️','👍','🔥','😂','😮','🎉'].map(emoji=>`<button data-reaction="${esc(m.id)}" data-emoji="${emoji}" aria-label="Реакция ${emoji}">${emoji}</button>`).join('')}</div>`;
  if(['direct','group'].includes(a.kind))html+=`<button data-reply="${esc(m.id)}">${icon('reply')}Ответить</button><button data-forward="${esc(m.id)}">${icon('forward')}Переслать</button><button data-save="${esc(m.id)}">${icon('saved')}В избранное</button><button data-pin-message="${esc(m.id)}">${icon('pin')}${app.pins.some(x=>sid(x.message_id)===sid(m.id))?'Снять закрепление':'Закрепить'}</button>`;
  if(a.kind==='channel'&&a.tools?.can_pin)html+=`<button data-action="channel-pin" data-post="${esc(m.id)}">${icon('pin')}${app.pins.some(x=>sid(x.message_id)===sid(m.id))?'Снять общий закреп':'Закрепить для всех'}</button>`;
  if(m.body)html+=`<button data-copy="${esc(m.id)}">${icon('copy')}Копировать текст</button>`;
  if(own&&['direct','group','channel'].includes(a.kind)&&m.body)html+=`<button data-edit="${esc(m.id)}">${icon('edit')}Изменить</button>`;
  if((own&&['direct','group'].includes(a.kind))||(a.kind==='channel'&&a.owner_id===app.user.id)||a.kind==='saved')html+=`<button class="danger" data-delete="${esc(m.id)}">${icon('trash')}${a.kind==='saved'?'Убрать из избранного':'Удалить'}</button>`;
  showPop(anchor,html);
}
function info() {
  const a=app.active;if(!a)return;
  $('#detail')?.remove();
  const person=a.kind==='saved'?{display_name:'Избранное'}:a.kind==='channel'?a:a.kind==='group'?{display_name:app.info.conv.title,avatar_url:app.info.conv.avatar_url}:app.info.profiles.find(p=>p.id!==app.user.id)||app.profile;
  const title=a.kind==='group'?app.info.conv.title:person.display_name || person.title || person.username;
  const html=`<aside class="detail" id="detail"><div class="detail-head"><h3>Информация</h3>${ib('close','Закрыть информацию','close-info')}</div><div class="detail-profile">${avatar(person,'large',a.kind==='group'?'contacts':a.kind==='channel'?'channels':a.kind==='saved'?'saved':'')}<h2>${esc(title)}</h2><p>${esc(a.description || person.bio || (a.kind==='saved'?'Твоё личное пространство':a.kind==='group'?app.info.members.length+' участников':person.username?'@'+person.username:''))}</p></div>
    ${['direct','group'].includes(a.kind)?`<section class="detail-section"><button class="detail-action" data-action="pin-chat">${icon('pin')}${app.prefs[a.id]?.is_pinned?'Открепить чат':'Закрепить чат'}</button><button class="detail-action" data-action="archive-chat">${icon('archive')}${app.prefs[a.id]?.is_archived?'Вернуть из архива':'Отправить в архив'}</button>${a.kind==='direct'?`<button class="detail-action" data-person="${esc(person.id)}">${icon('contacts')}Профиль собеседника</button>`:''}</section>`:''}
    ${a.kind==='group'?`<section class="detail-section"><h3>Участники · ${app.info.members.length}</h3>${app.info.members.some(m=>m.user_id===app.user.id&&['owner','admin'].includes(m.role))?`<div class="group-detail-tools"><button type="button" class="secondary" data-action="group-invite">${icon('plus')} Добавить участников</button><button type="button" class="secondary" data-action="group-avatar">${icon('image')} Изменить аватарку</button></div>`:''}${app.info.profiles.map(p=>`<button class="detail-person" data-person="${esc(p.id)}">${avatar(p,'small')}<span><b>${esc(p.display_name || p.username)}</b><small>@${esc(p.username)}</small></span></button>`).join('')}</section>`:''}
    ${a.kind==='channel'&&a.owner_id===app.user.id?`<section class="detail-section"><button type="button" class="detail-action" data-action="channel-staff">Роли и редакторы</button><button type="button" class="detail-action" data-action="channel-avatar">${icon('image')} Изменить аватарку канала</button></section>`:''}
    <section class="detail-section"><div class="gallery-heading"><h3>Медиа и файлы</h3>${ib('refresh','Обновить вложения','media-reload','small')}</div><label class="field">Поиск вложений<input id="mediaQuery" type="search" maxlength="80" placeholder="Название файла или текст"></label><div id="mediaGallery" aria-live="polite"></div></section></aside>`;
  $('#pane').insertAdjacentHTML('beforeend',html);gallery={epoch:app.epoch,filter:'all',query:'',rows:[],offset:0,more:true,loading:false,error:'',token:gallery.token+1};loadGallery(true).catch(()=>{});let timer;$('#mediaQuery').oninput=e=>{gallery.query=e.target.value;gallery.token++;gallery.loading=false;clearTimeout(timer);timer=setTimeout(()=>{if($('#mediaQuery'))loadGallery(true).catch(()=>{});},300);};
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
  if(!randomSearching&&!randomMatch){randomLanguage=app.state.randomFilters?.language||'any';randomInterest=app.state.randomFilters?.interest||'any';}
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
  await changeState(s=>({...s,randomFilters:{language:l,interest:i}}));randomLanguage=l;randomInterest=i;
  // Clear any matched session before starting another one.
  if(randomMatch)await stopRandomSearch(true);
  else await api.randomLeave();
  randomError='';randomMatch=null;randomPerson=null;randomSearching=true;
  const token=++randomToken;renderRandomPage();
  await pollRandomSearch(token);
}

async function openTapolka(){
  $('#pane').innerHTML='<div class="empty-messages"><span class="spinner"></span><h3>Открываем Тапалку…</h3></div>';
  try{const [board,base,cosmetics,own]=await Promise.all([catBoardMode==='weekly'?api.catWeeklyBoard():api.tapolkaLeaderboard(20),api.catState(),api.catCosmeticState(),api.catMyScore()]);const state={...base,...cosmetics};
  if(app.route!=='tapolka')return;
  catState=state;tapolkaMine=Number(own||state.total_taps||0);
  $('#pane').innerHTML=V.tapolka(app,board,tapolkaMine,state);$$('[data-action="cat-board-mode"]').forEach(b=>b.classList.toggle('active',b.dataset.mode===catBoardMode));applyLanguage();
  }catch(error){if(app.route!=='tapolka')return;$('#pane').innerHTML=`<header class="chat-header"><button type="button" class="icon-button back-mobile" data-action="back" aria-label="К каналам">${icon('back')}</button><div class="header-title"><h2>🐱 Котик · Тапалка</h2><p>Игровой канал RNDM</p></div></header><div class="empty-messages"><h3>Канал временно недоступен</h3><p>${esc(errorText(error))}</p><button type="button" class="primary" data-action="tapolka-retry">Попробовать снова</button></div>`;}}
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
    host.innerHTML=rows.map(m=>`<button class="search-result" data-jump="${esc(m.id)}"><b>${day(m.created_at)} · ${time(m.created_at)}</b><p>${highlighted(applyIncomingCensorship(m.body),value)}</p></button>`).join('')||'<div class="sidebar-empty"><p>Сообщения не найдены.</p></div>';
  }catch(error){if(isCurrent(epoch,active.id))showError(host,error);}
}
async function jumpMessage(id) {
  closePop();const epoch=app.epoch,active={...app.active};let node=$$('[data-mid]').find(x=>x.dataset.mid===sid(id));
  if(!node&&['direct','group','channel'].includes(active.kind)){
    // Find an old message in three bounded queries, regardless of its age.
    const previousFocus=app.historyFocus;app.historyFocus=true;++app.messageEpoch;let windowed;
    try{windowed=await api.messageContext(active.id,id,active.kind==='channel');}catch(error){if(isCurrent(epoch,active.id))app.historyFocus=previousFocus;throw error;}
    const details=await messageDetails(active,windowed.rows);if(!isCurrent(epoch,active.id))return;
    ++app.messageEpoch;app.historyFocus=true;app.messages=windowed.rows.map(m=>active.kind==='channel'?{...m,sender_id:m.author_id}:m);app.more=windowed.more;applyMessageDetails(details);renderMessages(true);renderPinned();
    node=$$('[data-mid]').find(x=>x.dataset.mid===sid(id));
  }
  if(epoch!==app.epoch)return;
  if(!node){toast('Сообщение недоступно или больше не хранится в чате.');return;}
  $('#messageSearchResults').hidden=true;node.scrollIntoView({block:'center',behavior:app.state.reduceMotion?'auto':'smooth'});node.classList.remove('message-highlight');void node.offsetWidth;node.classList.add('message-highlight');
}

let storyRequest=null,storyQueue=[],storyIndex=0,storyPreviewURL=null;
function storySeen(){return readLocal('rndm31-seen:'+app.user.id,[]);}
function renderStories(){
  const host=$('#storiesStrip');if(!host||!app.user)return;host.hidden=app.route!=='chats';if(host.hidden)return;
  const seen=storySeen(),groups=new Map();
  for(const story of (app.stories||[]).filter(x=>new Date(x.expires_at)>new Date())){const group=groups.get(story.user_id)||[];group.push(story);groups.set(story.user_id,group);}
  paintHTML(host,`<button type="button" class="story-chip story-add" data-action="new-story" aria-label="Добавить историю"><span class="story-ring">${avatar(app.profile)}<span class="story-plus">+</span></span><span>Моя история</span></button>`+[...groups.values()].map(rows=>{const story=[...rows].reverse().find(x=>!seen.includes(sid(x.id)))||rows[0],person=story.person||{display_name:'Пользователь'};return `<button class="story-chip ${rows.every(x=>seen.includes(sid(x.id)))?'seen':''}" data-story="${esc(story.id)}" aria-label="История: ${esc(person.display_name||person.username||'Пользователь')}"><span class="story-ring">${avatar(person)}</span><span>${esc(story.user_id===app.user.id?'Ты':person.display_name||person.username||'Пользователь')}</span></button>`;}).join('')+(app.storiesError?'<button class="story-retry text-button" data-action="retry-stories">Истории недоступны<br>Повторить</button>':''));
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
  showModal(person.display_name||person.username||'История',`<div class="story-view"><div class="story-steps" aria-label="Истории">${storyQueue.map((x,i)=>`<button type="button" class="${i===index?'active':i<index?'seen':''}" data-action="story-jump" data-index="${i}" aria-label="История ${i+1}" aria-current="${i===index}"></button>`).join('')}</div><div class="story-meta">${avatar(person,'small')}<span>${day(story.created_at)} · ${time(story.created_at)}</span><span>${index+1} / ${storyQueue.length}</span></div><div class="story-content">${media}${story.body?`<p>${esc(story.body)}</p>`:''}</div><div class="story-controls"><button class="secondary" data-action="story-prev" ${index===0?'disabled':''} aria-label="Предыдущая история">${icon('back')}</button><span class="muted">Исчезнет через ${Math.max(1,Math.ceil((new Date(story.expires_at)-Date.now())/3600000))} ч.</span><button class="secondary" data-action="story-next" ${index===storyQueue.length-1?'disabled':''} aria-label="Следующая история">${icon('chevron')}</button></div>${story.user_id===app.user.id?`<button class="text-button danger" data-story-delete="${esc(story.id)}">Удалить историю</button>`:''}</div>`);
  const seen=storySeen();if(!seen.includes(sid(story.id))){writeLocal('rndm31-seen:'+app.user.id,[...seen,sid(story.id)].slice(-500));api.viewStory(story.id).catch(()=>{});renderStories();}
}
function clearStoryPreview(){if(storyPreviewURL){URL.revokeObjectURL(storyPreviewURL);storyPreviewURL=null;}}
modal.addEventListener('close',()=>{clearStoryPreview();for(const media of $$('audio,video',modal))media.pause();});
function newStory(){
  clearStoryPreview();showModal('Новая история',`<form id="storyForm"><p class="muted story-note">Текст, фото или видео на 24 часа. Истории видны пользователям RNDM, которым сервер разрешает их просмотр.</p><label class="field">Что нового?<textarea id="storyText" name="body" maxlength="1000" rows="4" placeholder="Поделись моментом…"></textarea></label><label class="secondary story-file">${icon('attach')}Добавить фото или видео<input id="storyFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"></label><div id="storyPreview" class="story-preview"></div><div id="storyError" role="alert"></div><button class="primary" type="submit">Опубликовать на 24 часа</button></form>`);
  const form=$('#storyForm');$('#storyFile').onchange=event=>{clearStoryPreview();const file=event.target.files?.[0],host=$('#storyPreview');host.innerHTML='';if(!file)return;if(!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.type)||file.size>window.RNDM_CONFIG.maxFileBytes){event.target.value='';host.textContent='Фото или видео до 50 МБ в поддерживаемом формате.';return;}storyPreviewURL=URL.createObjectURL(file);host.innerHTML=(file.type.startsWith('image/')?`<img src="${storyPreviewURL}" alt="Предпросмотр истории">`:`<video src="${storyPreviewURL}" controls playsinline></video>`)+`<span>${esc(file.name)}</span><button type="button" class="text-button" id="removeStoryFile">Убрать файл</button>`;$('#removeStoryFile').onclick=()=>{clearStoryPreview();$('#storyFile').value='';host.innerHTML='';};};
  form.onsubmit=event=>{event.preventDefault();const body=$('#storyText').value.trim(),file=$('#storyFile').files?.[0],button=$('[type=submit]',form),uid=app.user.id;guarded('post-story',async()=>{try{if(!body&&!file)throw new Error('Добавь текст, фото или видео.');await api.createStory(body,file);if(app.user?.id!==uid)return;if(form.isConnected)modal.close();await refreshStories();toast('История опубликована на 24 часа');}catch(error){if(form.isConnected)showError($('#storyError'),error);}},button);};
}

const locks=new Set();
async function guarded(key,fn,button){if(locks.has(key))return;locks.add(key);if(button)button.disabled=true;try{await fn();}catch(error){toast(errorText(error));}finally{locks.delete(key);if(button?.isConnected)button.disabled=false;}}
document.addEventListener('click',event=>{
  const row=event.target.closest('.message-row');if(app.selecting&&row&&!event.target.closest('button,a,video,audio,input')){toggleSelection(row.dataset.mid);return;}
  const button=event.target.closest('button');if(!button)return;
  const d=button.dataset;
  if(d.callUser){guarded('call',async()=>{const person=(await api.profiles([d.callUser]))[0];if(!person)throw new Error('Пользователь недоступен.');await calls.dial(person,d.callMode||'audio');},button);return;}
  if(d.story){openStory(d.story);return;}
  if(d.storyDelete){confirmAction('Удалить историю?','Она исчезнет из ленты.',async()=>{await api.deleteStory(d.storyDelete);await refreshStories();});return;}
  if(d.auth){const email=$('#authForm [name=email]')?.value||'';auth(d.auth,email);return;}
  if(d.nav){if(modal.open&&modal.querySelector('.more-menu'))modal.close();if(d.nav==='tapolka')tapolkaReturnRoute=['chats','channels'].includes(app.route)?app.route:tapolkaReturnRoute;navigate(d.nav).catch(error=>toast(errorText(error)));return;}
  if(d.folder){if(app.route==='channels'){if(!['mine','discover'].includes(d.folder))return;app.channelView=d.folder;$('#listSearch').value='';++channelDirectoryRequest;app.channelLoading=false;app.channelError='';renderSidebar();applyLanguage();if(d.folder==='discover')loadChannelDirectory(true);return;}app.folder=d.folder;renderSidebar();applyLanguage();return;}
  if(d.open){if(d.open===suppressInboxRow&&Date.now()<suppressInboxClickUntil)return;guarded('open:'+d.open,()=>d.kind==='channel'?openChannel(d.open):d.kind==='saved'?openSaved():openConversation(d.open));return;}
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
  if(d.insertEmoji){const input=$('#messageInput');if(!input)return;const recent=readLocal('rndm-emojis:'+app.user.id,[]);writeLocal('rndm-emojis:'+app.user.id,[d.insertEmoji,...recent.filter(e=>e!==d.insertEmoji)].slice(0,16));const start=input.selectionStart,end=input.selectionEnd;input.setRangeText(d.insertEmoji,start,end,'end');input.dispatchEvent(new Event('input'));input.focus();closePop();return;}
  if(d.setTheme){setTheme(d.setTheme);return;}
  if(d.wallpaper){guarded('state',async()=>{await changeState({wallpaper:d.wallpaper});$('#pane').innerHTML=V.settings(app);});return;}
  if(d.chatWallpaper){const a={...app.active};guarded('preference',async()=>{app.prefs[a.id]=await api.preference(a.id,{theme_id:d.chatWallpaper});if(app.active?.id===a.id)applyWallpaper();modal.close();});return;}
  if(d.inboxAction){inboxAction(button).catch(error=>toast(errorText(error)));return;}
  if(d.expandMessage){const id=sid(d.expandMessage);if(app.expandedMessages.has(id))app.expandedMessages.delete(id);else app.expandedMessages.add(id);renderMessages();return;}
  if(d.mediaOpen){openMedia(d.mediaOpen,d.mediaName);return;}
  if(d.selectMessage){toggleSelection(d.selectMessage);return;}
  if(d.action)handleAction(d.action,button).catch(error=>toast(errorText(error)));
});
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.dataset.setting)guarded('setting',async()=>{try{await changeState({[input.dataset.setting]:input.checked});}catch(error){input.checked=!input.checked;throw error;}});
  if(input.id==='messageFontSize')guarded('font-size',async()=>{const value=Number(input.value);if([14,16,18,20].includes(value))await changeState({fontSize:value});});
  if(input.id==='glassMode')guarded('glass-mode',async()=>{const value=input.value;if(!['full','balanced','low'].includes(value))return;await changeState({glassMode:value});toast('Эффект стекла обновлён');});
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
document.addEventListener('input',event=>{if(event.target.id==='emojiSearch'){const list=$('#emojiList');if(list)list.innerHTML=emojiHTML(event.target.value,readLocal('rndm-emojis:'+app.user.id,[]));return;}if(event.target.id==='giftRecipientSearch'){clearTimeout(giftRecipientSearchTimer);const q=event.target.value;giftRecipientSearchTimer=setTimeout(()=>searchGiftRecipients(q),260);}if(event.target.closest('#profileStyleForm'))updateStylePreview();if(event.target.closest('#colorsForm')){const colors=Object.fromEntries(new FormData($('#colorsForm')));if(validColors(colors)){applyColors(colors);for(const field of $$('#colorsForm input'))field.nextElementSibling.textContent=field.value.toUpperCase();}}});
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
  try{const profile=await api.publicProfile(uid);if(!profile)throw new Error('Профиль не найден');const parts=await Promise.allSettled([api.profileGifts(uid),api.profileMoments(uid),api.profileSocial(uid),api.commonGroups(uid,app.dialogs)]);if(app.route!=='profile'||app.profileTarget!==uid)return;const get=(i,fallback)=>parts[i].status==='fulfilled'?parts[i].value:fallback;$('#pane').innerHTML=V.publicProfileView(app,profile,get(0,[]),get(1,[]),get(2,{}));const groups=get(3,[]);if(groups.length)$('#pane').insertAdjacentHTML('beforeend',`<section class="common-groups"><h3>Общие группы</h3>${groups.map(g=>`<button class="secondary" data-open="${esc(g.id)}">${esc(g.title)}</button>`).join('')}</section>`);applyLanguage();}
  catch(error){showError($('#pane'),error);}
}


async function refreshNotificationBadge(){
 if(!app.user||stopped)return;
 const count=await api.notificationUnread();
 const badge=$('#notifRailCount'),top=$('#notificationsHeaderCount');
 for(const el of [badge,top])if(el){el.hidden=count===0;el.textContent=count>99?'99+':String(count);}
 document.title=count>0?`(${count>99?'99+':count}) RNDM Chat`:'RNDM Chat';
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
  const results=await Promise.allSettled([api.starsWallet(),api.myGifts(),api.giftCatalog(),api.friends()]);
  if(epoch!==app.epoch||app.route!=='stars')return;
  if(results[0].status==='rejected'){
    pane.innerHTML=`<div class="star-wallet-loading"><h2>Не удалось загрузить баланс</h2><p>${esc(errorText(results[0].reason))}</p><button type="button" class="primary" data-action="stars-refresh">Повторить</button></div>`;
    return;
  }
  const val=i=>results[i].status==='fulfilled'?results[i].value:[];
  const wallet=val(0),history=val(1),catalog=val(2),friends=val(3);
  if(app.profile)app.profile.stars=Number(wallet.balance||0);
  pane.innerHTML=V.starsWallet(app,{wallet,history,catalog,friends});
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
  if(action==='together-open'){await refreshTogetherAccess();if(!app.togetherAccess){toast('RNDM Together доступен только Owner и приглашённым тестировщикам.');together?.stop();return;}await together?.open();return;}
  if(await handleMessengerAction(action,button))return;
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
  if(action==='tapolka-retry'){await guarded('tapolka-retry',openTapolka,button);return;}
  if(action==='close-modal'){modal.close();return;}if(action==='close-info'){$('#detail')?.remove();return;}
  if(action==='new-story'){newStory();return;}
  if(action==='profile-back'){if(previousChatId){const id=previousChatId;previousChatId=null;await openConversation(id);}else await navigate(previousRoute||'chats');return;}
  if(action==='profile-message'){const uid=button.dataset.user;await guarded('profile-message',async()=>{await openDirect(uid);},button);return;}
  if(action==='profile-friend'){const uid=button.dataset.user;await guarded('profile-friend',async()=>{await api.friend(uid);toast('Запрос в друзья отправлен');},button);return;}
  if(action==='save-content-settings'){await guarded('save-content-settings',async()=>{const patch={app_language:$('#appLanguage')?.value||'ru',censorship_mode:$('#censorshipMode')?.value||'mask'};app.profile=await api.updatePreferences(patch);localStorage.setItem('rndm-language',patch.app_language);localStorage.setItem('rndm-censorship',patch.censorship_mode);applyLanguage();toast(patch.app_language==='en'?'Settings saved':'Настройки сохранены');await navigate('settings');},button);return;}
  if(action==='retry-stories'){refreshStories().catch(()=>{});return;}
  if(action==='story-jump'){const index=Number(button.dataset.index);if(Number.isInteger(index)&&index>=0&&index<storyQueue.length)showStory(index);return;}
  if(action==='story-prev'||action==='story-next'){showStory(storyIndex+(action==='story-next'?1:-1));return;}
  if(action==='reset-colors'){guarded('colors',async()=>{await changeState({colors:null});applyColors(null);$('#pane').innerHTML=V.settings(app);toast('Фирменные цвета восстановлены');},button);return;}
  if(action==='more-menu'){
    const menu=[['channels','Каталог каналов','channels'],['tapolka','Котик · Тапалка','tapolka'],['calls','Звонки','calls'],['saved','Избранное','saved'],['notifications','Уведомления','notifications'],['stars','Звёзды и подарки','stars'],['settings','Настройки','settings'],['donate','Поддержать RNDM','donate'],...(staffRole(app.profile?.app_role)?[['admin','Админка','shield']]:[])];
    showModal('Разделы RNDM',`<div class="more-menu"><p>Все важные возможности, без лишних вкладок.</p><div class="more-menu-grid">${menu.map(([route,label,glyph])=>`<button class="more-menu-item ${app.route===route?'current':''}" type="button" data-nav="${route}">${icon(glyph)}<span>${esc(label)}</span>${icon('chevron')}</button>`).join('')}</div></div>`);
    return;
  }
  if(action==='theme'){setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');return;}
  if(action==='repair-app'){await repairFrontendCache();return;}
  if(action==='retry-boot'){root.innerHTML='<div class="boot"><span class="spinner"></span><p>Подключаемся…</p></div>';boot();return;}
  if(action==='channels-more'){guarded('channels-more',()=>loadChannelDirectory(false),button);return;}
  if(action==='channels-reload'){guarded('channels-reload',()=>loadChannelDirectory(true),button);return;}
  if(action==='browse-channels'){navigate('channels').catch(error=>toast(errorText(error)));return;}
  if(action==='new'){if(['channels','tapolka'].includes(app.route))newChannel();else guarded('new',newConversation);return;}
  if(action==='new-group'){guarded('new-group',newGroup);return;}if(action==='new-channel'){newChannel();return;}
  if(action==='group-invite'){await guarded('group-invite',openGroupInvite,button);return;}
  if(action==='group-avatar'||action==='channel-avatar'){openChatAvatarChooser(action==='group-avatar'?'group':'channel');return;}
  if(action==='channel-search-retry'){const input=$('#listSearch');input.dispatchEvent(new Event('input'));return;}
  if(action==='clear-search'){$('#listSearch').value='';renderSidebar();applyLanguage();if(app.route==='channels'&&app.channelView==='discover')loadChannelDirectory(true);return;}
  if(action==='refresh-list'){guarded('list',refreshLists,button);return;}
  if(action==='back'){await navigate(app.route==='tapolka'?tapolkaReturnRoute:app.active?.kind==='channel'&&app.route==='channels'?'channels':'chats');return;}
  if(action==='info'){closePop();info();return;}if(action==='chat-menu'){chatMenu(button);return;}
  if(action==='chat-search'){$('#chatSearch').hidden=false;$('#messageSearch').focus();return;}
  if(action==='close-chat-search'){$('#chatSearch').hidden=true;$('#messageSearchResults').hidden=true;$('#messageSearch').value='';return;}
  if(action==='refresh-chat'){closePop();guarded('refresh',()=>refreshMessages(),button);return;}
  if(action==='older'){await guarded('older',()=>refreshMessages(false,true),button);return;}
  if(action==='bottom'){if(app.historyFocus){app.historyFocus=false;await guarded('latest',()=>refreshMessages(true).then(markRead),button);}else $('#messages').scrollTop=$('#messages').scrollHeight;return;}
  if(action==='attach'){$('#attachmentInput').click();return;}if(action==='remove-file'){clearFile();return;}if(action==='edit-photo'){await openPhotoEditor();return;}
  if(action==='cancel-context'){cancelEdit();app.reply=null;renderCompose();return;}
  if(action==='emoji'){showPop(button,`<div class="emoji-picker"><label class="emoji-search">${icon('search')}<input id="emojiSearch" placeholder="Найти эмодзи" aria-label="Поиск эмодзи"></label><div id="emojiList">${emojiHTML('',readLocal('rndm-emojis:'+app.user.id,[]))}</div></div>`,true);return;}
  if(action==='schedule-message'){
    if(!['direct','group'].includes(app.active?.kind)){toast('Отложенная отправка доступна в чатах');return;}
    const original=$('#messageInput')?.value||'',text=original.trim();if(fileFor()||app.edit){toast('Планирование доступно для текстового сообщения. Сначала убери вложение или закончи редактирование.');return;}if(!text){toast('Сначала напиши сообщение');return;}
    const date=new Date(Date.now()+3600000);date.setMinutes(Math.ceil(date.getMinutes()/5)*5,0,0);
    const local=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
    showModal('Отложенное сообщение',`<form id="scheduleForm"><p class="muted">Текст сообщения сохранится в базе и появится в переписке в выбранное время. Не закрывай окно до подтверждения.</p><label class="field">Когда отправить?<input type="datetime-local" name="when" value="${local}" required></label><div id="scheduleError"></div><button type="submit" class="primary">Запланировать</button></form>`);
    const active={...app.active},id=active.id;
    $('#scheduleForm').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;guarded('schedule-message',async()=>{
      try{const date=new Date(new FormData(form).get('when'));if(!Number.isFinite(date.getTime())||date.getTime()<Date.now()+60000||date.getTime()>Date.now()+30*86400000)throw new Error('Выбери время от 1 минуты до 30 дней');
       const filtered=filterOutgoing(text);if(!filtered.ok)throw new Error(filtered.reason);
       await api.send(id,filtered.text,null,{scheduled_for:date.toISOString()});modal.close();clearDraft(active,original);renderCompose();scheduleSidebarPaint();
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
  if(action==='join-channel'){const a={...app.active};closePop();guarded('join',async()=>{await api.join(a.id,a.joined);app.channels=await api.channels();const changed=await api.channel(a.id);app.channelResults=app.channelResults.map(x=>x.id===a.id?changed:x);app.channelDirectory=app.channelDirectory.map(x=>x.id===a.id?changed:x);if(app.active?.id===a.id){app.active=changed;await openChannel(a.id,false);}renderSidebar();applyLanguage();});return;}
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
 showModal('Проверка звонков',`<div class="call-diagnostics">${row('Безопасное HTTPS-соединение',secure)}${row('Поддержка WebRTC',rtc)}${row('Доступ к микрофону',media,'Проверяется по отдельному запросу')}${row('Релейный TURN-сервер',relay,relay?'Указан в настройках (доступность проверяется в реальном звонке)':'Не указан. Звонки через NAT могут не соединиться')}<button type="button" class="primary" data-action="test-microphone">Проверить микрофон</button><p class="muted">Эта диагностика проверяет устройство и конфигурацию, но не подтверждает связь между двумя абонентами.</p></div>`);
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

document.addEventListener('pointerdown',event=>{if(app.state.notificationSound){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(Ctx){soundContext ||= new Ctx();if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});}}catch{}}if(!pop.hidden&&!pop.contains(event.target)&&!event.target.closest('[data-message-menu],[data-action="chat-menu"],[data-action="emoji"]'))closePop();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closePop();$('#detail')?.remove();}if((event.ctrlKey||event.metaKey)&&event.key==='k'&&app.user){event.preventDefault();$('#listSearch').focus();}if(event.key==='ArrowUp'&&$('#messageInput')===document.activeElement&&!$('#messageInput').value&&['direct','group'].includes(app.active?.kind)){const m=[...app.messages].reverse().find(x=>x.sender_id===app.user.id&&!x.deleted_at&&x.body);if(m){event.preventDefault();app.edit={...m,restore:''};$('#messageInput').value=m.body;renderCompose();}}});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)modal.close();}});
window.addEventListener('popstate',()=>{if(!app.user)return;const params=new URLSearchParams(location.search);if(params.get('chat'))openConversation(params.get('chat'),false);else if(params.get('channel')){const route=params.get('view')==='chats'?'chats':'channels';navigate(route,false).then(()=>openChannel(params.get('channel'),false)).catch(()=>{});}else {if(params.get('view')==='profile')app.profileTarget=params.get('user')||app.user.id;navigate(params.get('view')||'chats',false);}});
navigator.serviceWorker?.addEventListener('message',event=>{
  if(event.data?.type!=='RNDM_NOTIFICATION_OPEN'||!app.user)return;
  const cid=String(event.data.conversation||'');
  if(/^[a-f\d-]{16,40}$/i.test(cid))openConversation(cid).catch(()=>{});
});
window.addEventListener('offline',()=>connection('Нет соединения · черновики сохраняются',true));
window.addEventListener('online',()=>{connection('Восстанавливаем соединение…');api?.sb?.realtime?.connect?.();refreshLists().then(()=>connection()).catch(()=>connection('Проверяем сервер…',true));if(app.active)refreshMessages().catch(()=>{});calls?.pollInvites().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&randomSearching){stopRandomSearch().catch(()=>{});randomError='Поиск остановлен, пока приложение в фоне. Нажми «Начать поиск» заново.';}if(!document.hidden&&app.user&&!stopped){calls?.pollInvites().catch(()=>{});refreshNotificationBadge().catch(()=>{});refreshLists().catch(()=>{});if(app.active)refreshMessages().then(markRead).catch(()=>{});}});
window.addEventListener('pagehide',()=>{if(randomSearching || randomMatch)api?.randomLeave().catch(()=>{});clearTimeout(randomTimer);randomSearching=false;admin?.stop();calls?.stop().catch(()=>{});clips?.stop();captureDraft();cancelVoice();stopSubscriptions();app.globalRt.forEach(ch=>api.unwatch(ch));app.globalRt=[];});
if(window.visualViewport){const size=()=>{document.documentElement.style.setProperty('--app-height',Math.round(window.visualViewport.height)+'px');};window.visualViewport.addEventListener('resize',size);size();}
function paintHTML(host,html){if(!host||host._layoutHTML===html&&host._layoutActual===host.innerHTML)return;host.innerHTML=html;host._layoutHTML=html;host._layoutActual=host.innerHTML;}
function stopPaneMedia(){const pane=$('#pane');if(pane)for(const media of $$('audio,video',pane))media.pause();}
function inboxDialogs(){const manual=new Set(app.state.manualUnread||[]);return app.dialogs.map(x=>({...x,unread:Math.max(Number(x.unread)||0,manual.has(x.id)?1:0)}));}
async function shareLink(title,url){
  if(navigator.share){try{await navigator.share({title,url});}catch(error){if(error.name!=='AbortError')throw error;}return;}
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);toast('Ссылка скопирована');return;}
  showModal('Ссылка',`<label class="field">Скопируй адрес<input readonly value="${esc(url)}" aria-label="Ссылка"></label>`);
}
function dialogMenu(row){
  const id=row.dataset.dialogMenu,kind=row.dataset.kind,dialog=app.dialogs.find(x=>x.id===id),channel=app.channels.find(x=>x.id===id)||app.channelDirectory.find(x=>x.id===id),pref=app.prefs[id]||{};
  const button=(action,label,glyph)=>`<button type="button" data-inbox-action="${action}" data-chat-id="${esc(id)}" data-kind="${esc(kind)}">${icon(glyph)}${label}</button>`;
  let html=button('open','Открыть','chats')+button('share','Поделиться ссылкой','forward');
  if(['direct','group'].includes(kind)&&dialog){
    html+=button('pin',pref.is_pinned?'Убрать из важных':'Важный чат','pin')+button('archive',pref.is_archived?'Вернуть из архива':'В архив','archive')+button('mute',app.state.muted.includes(id)?'Включить уведомления':'Без уведомлений','mute');
    html+=button('read',dialog.unread||(app.state.manualUnread||[]).includes(id)?'Пометить прочитанным':'Пометить непрочитанным','check');
  }else if(kind==='channel'&&channel)html+=button('subscription',channel.joined?'Отписаться':'Подписаться',channel.joined?'close':'plus');
  if(['direct','group','channel'].includes(kind))html+=button('folder','Добавить в папки','archive');
  showPop(row,html);
}
async function inboxAction(button){
  const {inboxAction:action,chatId:id,kind}=button.dataset,uid=app.user.id;closePop();
  await guarded('inbox:'+id,async()=>{
    if(action==='folder'){manageFolders(itemKey(kind,id));return;}
    if(action==='open'){await(kind==='channel'?openChannel(id):kind==='saved'?openSaved():openConversation(id));return;}
    if(action==='share'){const url=new URL('index.html',location.href);if(kind==='channel'){url.searchParams.set('view','chats');url.searchParams.set('channel',id);}else if(kind==='saved')url.searchParams.set('view','saved');else url.searchParams.set('chat',id);await shareLink('RNDM Chat',url.href);return;}
    const dialog=app.dialogs.find(x=>x.id===id);
    if(action==='pin'||action==='archive'){if(!dialog)return;const prop=action==='pin'?'is_pinned':'is_archived';app.prefs[id]=await api.preference(id,{[prop]:!app.prefs[id]?.[prop]});}
    else if(action==='mute')await changeState(s=>({...s,muted:s.muted.includes(id)?s.muted.filter(x=>x!==id):[...s.muted,id]}));
    else if(action==='read'){
      if(!dialog)return;const manual=app.state.manualUnread||[],read=Number(dialog.unread)>0||manual.includes(id);
      if(!read&&app.active?.id===id)await navigate('chats');
      if(read)await api.markRead(id);
      await changeState(s=>({...s,manualUnread:read?(s.manualUnread||[]).filter(x=>x!==id):[...new Set([...(s.manualUnread||[]),id])]}));
      lastRead.delete(uid+':'+id);toast(read?'Чат прочитан':'Чат помечен непрочитанным');
    }else if(action==='subscription'){
      const channel=app.channels.find(x=>x.id===id)||app.channelDirectory.find(x=>x.id===id);if(!channel)return;await api.join(id,channel.joined);
      app.channels=await api.channels();if(app.active?.id===id)await openChannel(id,false);
    }
    renderSidebar();await refreshLists();
  },button);
}
let inboxHold=null,suppressInboxClickUntil=0,suppressInboxRow='';
document.addEventListener('contextmenu',event=>{const row=event.target.closest('[data-dialog-menu]');if(!row)return;event.preventDefault();clearTimeout(inboxHold?.timer);dialogMenu(row);suppressInboxRow=row.dataset.dialogMenu;if(inboxHold)inboxHold.opened=true;suppressInboxClickUntil=Date.now()+700;});
document.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch')return;const row=event.target.closest('[data-dialog-menu]');if(!row)return;
  clearTimeout(inboxHold?.timer);inboxHold={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{if(inboxHold)inboxHold.opened=true;dialogMenu(row);suppressInboxRow=row.dataset.dialogMenu;suppressInboxClickUntil=Date.now()+1200;},520)};
},{passive:true});
document.addEventListener('pointermove',event=>{if(inboxHold&&Math.hypot(event.clientX-inboxHold.x,event.clientY-inboxHold.y)>12){clearTimeout(inboxHold.timer);if(inboxHold.opened)suppressInboxClickUntil=Date.now()+800;inboxHold=null;}},{passive:true});
for(const name of ['pointerup','pointercancel'])document.addEventListener(name,()=>{clearTimeout(inboxHold?.timer);if(inboxHold?.opened)suppressInboxClickUntil=Date.now()+800;inboxHold=null;},{passive:true});
document.addEventListener('keydown',event=>{if(!modal.open||!modal.querySelector('.story-view'))return;if(event.key==='ArrowLeft'){event.preventDefault();showStory(storyIndex-1);}if(event.key==='ArrowRight'){event.preventDefault();showStory(storyIndex+1);}});
function scheduleSidebarPaint(){clearTimeout(sidebarPaintTimer);sidebarPaintTimer=setTimeout(()=>{renderSidebar();applyLanguage();},220);}
function updateUnreadBadge(){
  const total=inboxStats(inboxDialogs(),app.prefs).unread,badge=$('#chatUnreadCount');
  if(badge){badge.hidden=!total;badge.textContent=total>99?'99+':String(total);}
  if(badgeValue!==total){badgeValue=total;document.title=total?'('+total+') RNDM Chat':'RNDM Chat';
    try{const result=total?navigator.setAppBadge?.(total):navigator.clearAppBadge?.();result?.catch(()=>{});}catch{}}
}
function resetConversationTools(){app.historyFocus=false;app.selecting=false;app.selection=new Set();app.confirmedMessages.clear();app.expandedMessages.clear();gallery.token++;$('#detail')?.remove();}
function wireFileInput(input){
  const host=$('.composer-wrap');if(!input||!host)return;
  input.addEventListener('paste',event=>{
    const files=[...(event.clipboardData?.files||[])];if(!files.length)return;
    event.preventDefault();selectFile(files[0]);if(files.length>1)toast('Прикреплён первый файл. Остальные отправь отдельными сообщениями.');
  });
  let depth=0;
  host.addEventListener('dragenter',event=>{if(!event.dataTransfer?.types?.includes('Files'))return;event.preventDefault();depth++;host.classList.add('drop-active');});
  host.addEventListener('dragover',event=>{if(event.dataTransfer?.types?.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
  host.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;host.classList.remove('drop-active');}});
  host.addEventListener('drop',event=>{depth=0;host.classList.remove('drop-active');const files=[...(event.dataTransfer?.files||[])];if(!files.length)return;event.preventDefault();selectFile(files[0]);if(files.length>1)toast('Прикреплён первый файл. Остальные отправь отдельными сообщениями.');});
}
function openMedia(value,name='Изображение'){
  const url=trustedMedia(value);if(!url){toast('Внешнее вложение можно открыть по его ссылке.');return;}
  showModal(name,`<div class="media-lightbox"><img src="${esc(url)}" alt="${esc(name)}"><a class="secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('download')} Открыть оригинал</a></div>`);
}
function renderSelection(){
  const host=$('#selectionBar');if(!host)return;host.hidden=!app.selecting;if(!app.selecting)return;
  const count=app.selection.size;
  host.innerHTML=`${ib('close','Отменить выделение','selection-cancel')}<strong>${count?count+' выбрано':'Выбери сообщения'}</strong><div>${['direct','group'].includes(app.active?.kind)?`<button class="icon-button" data-action="selection-save" aria-label="Сохранить в избранное" title="В избранное" ${count?'':'disabled'}>${icon('saved')}</button>`:''}<button class="icon-button" data-action="selection-copy" aria-label="Скопировать выбранные" title="Копировать" ${count?'':'disabled'}>${icon('copy')}</button><button class="icon-button" data-action="selection-export" aria-label="Скачать выбранные" title="Скачать" ${count?'':'disabled'}>${icon('download')}</button></div>`;
}
function toggleSelection(id){
  const message=currentMessage(id);if(!message||message.deleted_at)return;
  id=sid(id);if(app.selection.has(id))app.selection.delete(id);else{if(app.selection.size>=30){toast('Можно выбрать до 30 сообщений за раз.');return;}app.selection.add(id);}
  renderMessages();
}
const selectedMessages=()=>app.messages.filter(m=>app.selection.has(sid(m.id))&&!m.deleted_at);
function conversationTitle(){return app.active?.title||app.info?.conv?.title||app.info?.profiles?.find(p=>p.id!==app.user.id)?.display_name||'RNDM Chat';}
function downloadText(content,name,type='text/plain;charset=utf-8'){
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function exportDialog(selected=false){
  if(!app.active)return;const active={...app.active},epoch=app.epoch,title=conversationTitle(),snapshot=selected?selectedMessages():[...app.messages];
  const full=!selected&&['direct','group','channel'].includes(active.kind);
  showModal(selected?'Скачать выбранные сообщения':'Экспорт переписки',`<form id="exportForm"><p class="muted">Файл сохраняется на твоё устройство. Ссылки на вложения включены; сами файлы скачиваются отдельно.</p><label class="field">Сообщения<select name="scope"><option value="loaded">${selected?'Выбранные':'Загруженные'} · ${snapshot.length}</option>${full?'<option value="all">Вся доступная история</option>':''}</select></label><label class="field">Формат<select name="format"><option value="text">Текст · TXT</option><option value="json">JSON</option></select></label><p id="exportStatus" class="muted" role="status"></p><div id="exportError" role="alert"></div><button type="submit" class="primary">${icon('download')} Скачать</button></form>`);
  $('#exportForm').onsubmit=event=>{
    event.preventDefault();const form=event.currentTarget,fd=new FormData(form);
    guarded('export',async()=>{
      try{
        let rows=snapshot;
        if(fd.get('scope')==='all'){
          rows=[];let before=null;
          for(let page=0;page<168;page++){
            if(!modal.open||epoch!==app.epoch)return;
            const batch=active.kind==='channel'?await api.posts(active.id,before):await api.messagePage(active.id,before);
            rows=sortMessages([...batch,...rows]);if($('#exportStatus'))$('#exportStatus').textContent='Загружено сообщений: '+rows.length;
            if(batch.length<60)break;
            const cursor=batch[0];if(before&&sid(cursor?.id)===sid(before.id))throw new Error('Сервер вернул ту же страницу. Попробуй экспортировать загруженные сообщения.');
            before=cursor;if(page===167)throw new Error('История больше 10 000 сообщений. Для такого чата экспортируй нужную часть из загруженных сообщений.');
          }
        }
        if(!modal.open||epoch!==app.epoch)return;
        const json=fd.get('format')==='json';downloadText(json?exportJSON(rows,title):exportText(rows,app.peopleMap,title),fileName(title)+(selected?'_selected':'')+(json?'.json':'.txt'),json?'application/json;charset=utf-8':'text/plain;charset=utf-8');
        modal.close();toast('Экспорт готов · '+rows.length+' сообщений');
      }catch(error){showError($('#exportError'),error);}
    },form.querySelector('[type=submit]'));
  };
}
async function loadGallery(reset=false){
  const host=$('#mediaGallery'),active=app.active;if(!host||!active)return;
  if(gallery.loading)return;
  if(reset){gallery.rows=[];gallery.offset=0;gallery.more=true;gallery.token++;}
  const token=gallery.token,epoch=app.epoch;gallery.loading=true;renderGallery();
  try{
    const rows=active.kind==='saved'?app.messages.filter(x=>(gallery.filter==='links'?bodyLinks(x.body).length:x.attachment_url)&&!x.deleted_at&&mediaMatches(x,gallery.filter)&&(!gallery.query||(String(x.body||'')+' '+String(x.attachment_name||'')).toLowerCase().includes(gallery.query.toLowerCase()))).slice(gallery.offset,gallery.offset+30):await api.media(active.id,active.kind==='channel',gallery.filter,gallery.offset,gallery.query);
    if(token!==gallery.token||!isCurrent(epoch,active.id)||!$('#mediaGallery'))return;
    gallery.rows=unique([...gallery.rows,...rows]);gallery.offset+=rows.length;gallery.more=rows.length===30;
  }catch(error){if(token===gallery.token&&$('#mediaGallery'))gallery.error=errorText(error);}
  finally{if(token===gallery.token){gallery.loading=false;renderGallery();}}
}
function mediaMatches(message,filter){const type=String(message.attachment_type||'');if(filter==='links')return bodyLinks(message.body).length>0;if(filter==='all')return true;if(filter==='file')return !['image','video','audio'].some(x=>type.startsWith(x+'/'));return type.startsWith(filter+'/');}
function renderGallery(){
  const host=$('#mediaGallery');if(!host)return;
  host.innerHTML=V.mediaGallery(gallery.rows,gallery.filter)+(gallery.error?`<p class="notice error-notice">${esc(gallery.error)}</p><button class="secondary" data-action="media-reload">Повторить</button>`:gallery.loading?'<div class="gallery-loading"><span class="spinner"></span><span>Загружаем вложения…</span></div>':!gallery.rows.length?'<p class="gallery-empty">Таких вложений пока нет.</p>':gallery.more?'<button class="secondary gallery-more" data-action="media-more">Показать ещё</button>':'');
}
async function handleMessengerAction(action,button){
  if(action==='channel-pin'){const a={...app.active};closePop();await api.channelPin(a.id,app.pins.some(x=>sid(x.message_id)===sid(button.dataset.post))?null:button.dataset.post);if(app.active?.id===a.id)await refreshMessages();toast('Общий закреп обновлён');return true;}
  if(action==='channel-staff'){const a={...app.active};if(!a.tools){showModal('Роли канала','<p>Серверные роли и общие закрепы ещё не подключены. Инструкция SETUP_CHANNELS_V64_RU.md есть в архиве. Сейчас публиковать может владелец канала.</p>');return true;}const members=a.tools.staff||[];showModal('Роли канала',`<p>Редактор публикует записи. Администратор также управляет общим закрепом. Назначать роли может владелец.</p>${members.map(x=>`<p>${esc(x.user_id)} · ${esc(x.role)} <button class="text-button" data-staff-remove="${esc(x.user_id)}">Снять роль</button></p>`).join('')}<form id="staffForm"><label class="field">ID пользователя<input name="user" required pattern="[a-fA-F0-9-]{36}" placeholder="UUID из ссылки на профиль"></label><label class="field">Роль<select name="role"><option value="editor">Редактор</option><option value="admin">Администратор</option></select></label><button type="submit" class="primary">Назначить</button><div id="staffError"></div></form>`);$('#staffForm').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;try{const fd=new FormData(e.currentTarget);await api.channelStaff(a.id,fd.get('user'),fd.get('role'));modal.close();await openChannel(a.id,false);toast('Роль сохранена сервером');}catch(error){showError($('#staffError'),error);}finally{b.disabled=false;}};$$('[data-staff-remove]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api.channelStaff(a.id,b.dataset.staffRemove,null);modal.close();await openChannel(a.id,false);}catch(error){toast(errorText(error));b.disabled=false;}});return true;}
  if(action==='folders-manage'){manageFolders();return true;}
  if(action==='profile-qr'){const url=new URL('index.html?view=profile&user='+encodeURIComponent(button.dataset.user),location.href).href;showModal('Приглашение в RNDM',profileQR(url)+`<p>Отсканируй код, чтобы открыть профиль.</p><input class="qr-url" readonly value="${esc(url)}"><button class="primary" data-action="share-profile" data-user="${esc(button.dataset.user)}">Поделиться ссылкой</button>`);return true;}
  if(action==='random-prompt'){const cid=randomMatch?.conversation_id;if(!cid)return true;const prompts=['Привет! Что хорошего случилось у тебя сегодня?','Какую музыку ты сейчас слушаешь?','Если бы можно было поехать куда угодно, что бы ты выбрал(а)?'];showModal('Начать разговор',prompts.map((t,i)=>`<button class="secondary prompt-choice" id="starter${i}">${esc(t)}</button>`).join(''));prompts.forEach((t,i)=>$('#starter'+i).onclick=async()=>{modal.close();await openConversation(cid);if(app.active?.id===cid&&$('#messageInput')){$('#messageInput').value=$('#messageInput').value?$('#messageInput').value+'\n'+t:t;captureDraft();renderCompose();$('#messageInput').focus();}});return true;}
  if(action==='random-report'){const uid=randomMatch?.matched_user_id;if(!uid)return true;showModal('Жалоба на собеседника','<form id="reportForm"><label class="field">Причина<select name="reason"><option>Спам</option><option>Оскорбления</option><option>Опасный контент</option><option>Другое</option></select></label><label class="field">Подробности<textarea name="details" maxlength="1000" required></textarea></label><div id="reportError"></div><button class="primary" type="submit">Отправить жалобу</button></form>');$('#reportForm').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;try{const fd=new FormData(e.currentTarget);await api.reportUser(uid,fd.get('reason'),fd.get('details'));modal.close();toast('Жалоба отправлена');}catch(error){showError($('#reportError'),error);}finally{b.disabled=false;}};return true;}

  if(action==='share-profile'){await shareLink('Профиль RNDM',new URL('index.html?view=profile&user='+encodeURIComponent(button.dataset.user),location.href).href);return true;}
  if(action==='voice-speed'){const audio=button.closest('.voice-message')?.querySelector('audio');if(!audio)return true;const rates=[1,1.5,2],rate=rates[(rates.indexOf(audio.playbackRate)+1)%rates.length];audio.playbackRate=rate;button.textContent=String(rate).replace('.',',')+'×';button.setAttribute('aria-label','Скорость голосового '+rate+'×');return true;}
  if(action==='install-app'){
    if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;}
    else showModal('RNDM на главном экране','<p>На iPhone: открой RNDM в Safari, нажми «Поделиться», затем «На экран Домой».</p><p>На Android и компьютере: в меню браузера выбери «Установить приложение» или «Добавить на главный экран».</p>');
    return true;
  }
  if(action==='focus-search'){$('#listSearch')?.focus();return true;}
  if(action==='show-unread'){await navigate('chats');app.folder='unread';renderSidebar();return true;}
  if(action==='shortcuts'){showModal('Горячие клавиши',`<div class="shortcut-list">${[['Ctrl / ⌘ + K','Найти чат'],['Ctrl / ⌘ + F','Поиск в переписке'],['Ctrl / ⌘ + Enter','Отправить сообщение'],['Shift + Enter','Новая строка'],['↑ в пустом поле','Изменить своё последнее сообщение'],['Esc','Закрыть меню или отменить выделение']].map(([key,label])=>`<div><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div><p class="muted">На телефоне: смахни сообщение в сторону, чтобы ответить. Картинки можно вставлять из буфера обмена.</p>`);return true;}
  if(action==='media'){closePop();info();return true;}
  if(action==='media-filter'){
    const value=button.dataset.filter;if(!['all','image','video','audio','file','links'].includes(value))return true;
    gallery.token++;gallery.loading=false;gallery.error='';gallery.filter=value;await loadGallery(true);return true;
  }
  if(action==='media-more'){await loadGallery();return true;}
  if(action==='media-reload'){gallery.token++;gallery.loading=false;gallery.error='';await loadGallery(true);return true;}
  if(action==='export-chat'){closePop();exportDialog();return true;}
  if(action==='selection-export'){exportDialog(true);return true;}
  if(action==='select-messages'){closePop();app.selecting=true;app.selection.clear();renderMessages();return true;}
  if(action==='selection-cancel'){app.selecting=false;app.selection.clear();renderMessages();return true;}
  if(action==='selection-copy'){
    if(!navigator.clipboard?.writeText)throw new Error('Копирование недоступно. Скачай выбранные сообщения текстовым файлом.');
    await navigator.clipboard.writeText(exportText(selectedMessages(),app.peopleMap,conversationTitle()));toast('Выбранные сообщения скопированы');return true;
  }
  if(action==='selection-save'){
    const rows=selectedMessages(),epoch=app.epoch;if(!['direct','group'].includes(app.active?.kind)||!rows.length)return true;
    await guarded('selection-save',async()=>{
      const results=await Promise.allSettled(rows.map(m=>api.saveMessage(m.id)));
      const ok=results.filter(r=>r.status==='fulfilled').length;
      if(epoch===app.epoch){rows.forEach((m,i)=>{if(results[i].status==='fulfilled')app.selection.delete(sid(m.id));});if(!app.selection.size)app.selecting=false;renderMessages();}
      toast(ok===rows.length?'В избранном · '+ok:'Сохранено '+ok+' из '+rows.length+'. Остальные можно повторить.');
    },button);return true;
  }
  return false;
}
document.addEventListener('keydown',event=>{
  if(!app.user)return;
  if(event.key==='Escape'&&app.selecting&&!modal.open){app.selecting=false;app.selection.clear();renderMessages();return;}
  if(modal.open)return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&app.active){event.preventDefault();$('#chatSearch').hidden=false;$('#messageSearch').focus();}
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&document.activeElement===$('#messageInput')){event.preventDefault();send();}
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
window.addEventListener('RNDM_BEFORE_UPDATE',event=>{if(app.pending.size||record||calls?.active){event.preventDefault();return;}captureDraft();});
// PWA registration is handled by index.html (one registration per app load).
await boot();

window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});

function manageFolders(selectedKey=null){
 const folders=normalizeFolders(app.state.folders);const rows=[...app.dialogs,...app.channels.map(x=>({...x,kind:'channel'}))];
 const render=()=>{showModal('Папки чатов',`<form id="folderCreate"><label class="field">Новая папка<input name="title" maxlength="24" required placeholder="Работа, друзья, любимое"></label><button class="primary" type="submit">Создать</button><div id="folderError"></div></form><div class="folder-manager">${folders.map(f=>`<section><h3>${esc(f.title)}</h3>${selectedKey?`<label><input type="checkbox" data-folder-membership="${esc(f.id)}" ${f.items.includes(selectedKey)?'checked':''}> В этой папке</label>`:`<button class="secondary" data-folder-edit="${esc(f.id)}">Выбрать чаты (${f.items.length})</button>`}<button class="text-button danger" data-folder-remove="${esc(f.id)}">Удалить папку</button></section>`).join('')||'<p class="muted">Создай папку и добавь переписки через меню чата.</p>'}</div>`);
 $('#folderCreate').onsubmit=async e=>{e.preventDefault();try{const title=String(new FormData(e.currentTarget).get('title')).trim();if(!title||folders.length>=12)throw new Error('Можно создать до 12 папок.');if(folders.some(f=>f.title.toLowerCase()===title.toLowerCase()))throw new Error('Такая папка уже есть.');const next=[...folders,{id:'folder-'+crypto.randomUUID(),title,items:selectedKey?[selectedKey]:[]}];await changeState(s=>({...s,folders:next}));renderSidebar();manageFolders(selectedKey);}catch(error){showError($('#folderError'),error);}};
 $$('[data-folder-membership]').forEach(b=>b.onchange=async()=>{b.disabled=true;try{await changeState(s=>({...s,folders:normalizeFolders(s.folders).map(f=>f.id===b.dataset.folderMembership?{...f,items:b.checked?[...new Set([...f.items,selectedKey])]:f.items.filter(k=>k!==selectedKey)}:f)}));renderSidebar();}catch(error){b.checked=!b.checked;toast(errorText(error));}finally{b.disabled=false;}});
 $$('[data-folder-remove]').forEach(b=>b.onclick=()=>confirmAction('Удалить папку?','Переписки останутся в списке чатов.',async()=>{await changeState(s=>({...s,folders:normalizeFolders(s.folders).filter(f=>f.id!==b.dataset.folderRemove)}));if(app.folder===b.dataset.folderRemove)app.folder='all';renderSidebar();manageFolders(selectedKey);}));
 $$('[data-folder-edit]').forEach(b=>b.onclick=()=>{const f=folders.find(x=>x.id===b.dataset.folderEdit);showModal(f.title,`<form id="folderMembers"><div class="modal-list">${rows.map(x=>`<label class="select-person"><input type="checkbox" name="item" value="${esc(itemKey(x.kind,x.id))}" ${f.items.includes(itemKey(x.kind,x.id))?'checked':''}>${esc(x.title||x.name||'Чат')}</label>`).join('')}</div><button class="primary" type="submit">Сохранить</button><div id="folderMemberError"></div></form>`);$('#folderMembers').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;try{const items=new FormData(e.currentTarget).getAll('item');await changeState(s=>({...s,folders:normalizeFolders(s.folders).map(x=>x.id===f.id?{...x,items}:x)}));renderSidebar();manageFolders();}catch(error){showError($('#folderMemberError'),error);}finally{b.disabled=false;}};});};render();
}
