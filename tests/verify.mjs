import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const fields=new Map(),storage=new Map();
function field(id){if(!fields.has(id))fields.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},remove(){},focus(){},scrollHeight:100,clientHeight:100,scrollTop:0,querySelector(){return null;},querySelectorAll(){return[];},getBoundingClientRect(){return{left:0,top:0,width:400,height:400};}});return fields.get(id);}
const rootStyle={setProperty(){},removeProperty(){}};
globalThis.document={querySelector:s=>fields.get(s)||null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},documentElement:{style:rootStyle,dataset:{}},hidden:false,title:'RNDM Chat',body:{append(){}}};
for(const id of ['#root','#modal','#popover','#messageInput','#messages','#sendError','#sendButton','#typingLine','#workspace','#pane'])field(id);
field('#modal').close=()=>{};field('#modal').showModal=()=>{};
globalThis.window={RNDM_CONFIG:{url:'https://project.supabase.co',maxFileBytes:50*1024*1024},addEventListener(){},dispatchEvent(){return true;}};
globalThis.location={href:'https://example.test/rndm/index.html',origin:'https://example.test',hostname:'example.test',pathname:'/rndm/index.html',search:''};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
globalThis.innerWidth=1440;globalThis.innerHeight=900;
const C=await import('../core.js');
const T=await import('../messenger-tools.js');
const V=await import('../views.js');
const {MessengerAPI}=await import('../api.js');
const {staffRole}=await import('../admin.js');
const {Clips}=await import('../clips.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const msg=(id,at='2026-10-10T10:00:00.000Z',extra={})=>({id,conversation_id:'c',sender_id:'me',body:'text '+id,created_at:at,scheduled_for:null,expires_at:null,deleted_at:null,...extra});

test('A request lane deduplicates work, keeps order, and recovers after failure',async()=>{
  const lane=new T.RequestLane(),hold=deferred(),events=[];
  const first=lane.run('refresh',async()=>{events.push('first');await hold.promise;events.push('done');return 3;});
  assert.equal(lane.run('refresh',()=>99),first);
  const next=lane.run('older',async()=>{events.push('older');return 4;});
  await tick();assert.deepEqual(events,['first']);hold.resolve();assert.deepEqual(await Promise.all([first,next]),[3,4]);assert.deepEqual(events,['first','done','older']);
  await assert.rejects(lane.run('error',()=>{throw Error('offline');}));
  assert.equal(await lane.run('refresh',()=>5),5);
});
test('Messages with identical timestamps keep exact bigint ordering and no duplicate IDs',()=>{
  assert.deepEqual(T.sortMessages([msg('9007199254740993'),msg('9007199254740992'),msg('9007199254740993')]).map(m=>m.id),['9007199254740992','9007199254740993']);
});
test('Archived chats are excluded from the unread badge',()=>{
  assert.deepEqual(T.inboxStats([{id:'a',unread:5,kind:'direct'},{id:'b',unread:100,kind:'group'},{id:'c',unread:-2,kind:'group'}],{b:{is_archived:true}}),{unread:5,newChats:1,archived:1,groups:1});
});
test('Search, names and export content cannot produce executable HTML',()=>{
  const attack='<img src=x onerror=alert(1)>';
  assert.ok(!T.highlighted(attack,'img').includes('<img'));
  assert.ok(T.highlighted('АБВ абв','абв').includes('<mark>АБВ</mark>'));
  assert.equal(C.safeURL('javascript:alert(1)'), '');
  assert.equal(T.trustedMedia('https://tracker.test/pixel.png'),'');
  assert.ok(T.trustedMedia('https://project.supabase.co/storage/v1/object/public/a.png'));
  assert.equal(staffRole('user'),false);assert.equal(staffRole('owner'),true);
  const state={dialogs:[],prefs:{},profile:{display_name:attack},active:null,drafts:{},state:{muted:[]},channels:[]};
  assert.ok(!V.welcome(state).includes(attack));
  assert.ok(!V.attachment({attachment_url:'https://tracker.test/x.png',attachment_type:'image/png'}).includes('<img'));
  assert.ok(!V.mediaGallery([msg(1,undefined,{attachment_url:'https://tracker.test/x.png',attachment_type:'image/png'})]).includes('<img'));
});
test('Exports omit deleted text and credentials; emoji search handles typed HTML',()=>{
  const json=JSON.parse(T.exportJSON([msg(1,undefined,{body:'secret',deleted_at:'now',attachment_url:'https://project.supabase.co/a.png'})]));
  assert.equal(json.messages[0].body,'');assert.equal(json.messages[0].attachment_url,null);
  assert.ok(!JSON.stringify(json).includes('secret'));
  assert.ok(T.exportText([msg(1)],{me:{display_name:'Тест'}}).includes('Тест'));
  assert.ok(T.emojiHTML('кот').includes('🐱'));assert.ok(!T.emojiHTML('<img>').includes('<img>'));
  assert.equal(T.fileName('a/b:c*?'), 'a_b_c__');
});

// An isolated PostgREST fixture evaluates filters against records, not live users.
function splitFilter(text){const result=[];let depth=0,last=0;for(let i=0;i<text.length;i++){if(text[i]==='(')depth++;if(text[i]===')')depth--;if(text[i]===','&&!depth){result.push(text.slice(last,i));last=i+1;}}result.push(text.slice(last));return result;}
function compare(a,b){if(/^\d+$/.test(String(a))&&/^\d+$/.test(String(b)))return BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0;return a<b?-1:a>b?1:0;}
function match(row,text){
  if(text.startsWith('and('))return splitFilter(text.slice(4,-1)).every(x=>match(row,x));
  const [col,operator,...parts]=text.split('.');let op=operator,arg=parts.join('.');if(op==='not'){op='not.'+parts.shift();arg=parts.join('.');}
  const value=row[col];if(op==='is')return arg==='null'?value==null:String(value)===arg;
  if(op==='not.is')return value!=null;
  if(op==='eq')return String(value)===arg;if(op==='neq')return String(value)!==arg;
  if(value==null)return false;
  const c=compare(value,arg);if(op==='lt')return c<0;if(op==='lte')return c<=0;if(op==='gt')return c>0;if(op==='gte')return c>=0;
  const pattern=arg.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*').replace(/_/g,'.');
  if(op==='ilike')return new RegExp('^'+pattern+'$','i').test(String(value));if(op==='not.ilike')return !new RegExp('^'+pattern+'$','i').test(String(value));throw Error(op);
}
function mockDB(data){
  const requests=[],inserted=[];
  return{requests,inserted,from(table){
    const filters=[],orders=[];let start=0,end=Infinity,one=false,record;
    const q={select(){return q;},eq(c,v){filters.push(r=>String(r[c])===String(v));return q;},is(c,v){filters.push(r=>v===null?r[c]==null:r[c]===v);return q;},not(c,op,v){filters.push(r=>v===null?r[c]!=null:!match(r,c+'.'+op+'.'+v));return q;},or(expr){filters.push(r=>splitFilter(expr).some(x=>match(r,x)));return q;},ilike(c,p){filters.push(r=>match(r,c+'.ilike.'+p));return q;},in(c,ids){filters.push(r=>ids.map(String).includes(String(r[c])));return q;},order(c,opts={}){orders.push([c,opts.ascending!==false]);return q;},limit(n){end=n-1;return q;},range(a,b){start=a;end=b;return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},insert(value){record={id:999,created_at:new Date().toISOString(),...value};inserted.push(record);return q;},then(resolve,reject){
      requests.push({table,start,end});let rows=record?[record]:[...(data[table]||[])];rows=rows.filter(r=>filters.every(f=>f(r)));
      rows.sort((a,b)=>{for(const [col,ascending]of orders){const c=compare(a[col],b[col]);if(c)return ascending?c:-c;}return 0;});rows=rows.slice(start,end===Infinity?undefined:end+1);
      return Promise.resolve({data:one?rows[0]||null:rows,error:null}).then(resolve,reject);
    }};return q;
  }};
}
function apiFixture(rows){const api=Object.create(MessengerAPI.prototype);api.uid='me';api.sb=mockDB({messages:rows,rndm_channel_posts:rows.map(x=>({...x,channel_id:x.conversation_id,author_id:x.sender_id}))});return api;}
test('Message context finds old records across equal timestamps, and stays inside the chat',async()=>{
  const rows=Array.from({length:500},(_,i)=>msg(i+1));rows.push(msg(501,undefined,{conversation_id:'other'}));
  const api=apiFixture(rows),page=await api.messageContext('c',250);
  assert.equal(page.rows.length,61);assert.equal(page.rows[30].id,250);assert.equal(page.more,true);
  assert.equal(api.sb.requests.length,3);await assert.rejects(api.messageContext('c',501));
});
test('Future, expired and deleted attachments are excluded; gallery pagination works',async()=>{
  const rows=Array.from({length:65},(_,i)=>msg(i+1,undefined,{attachment_url:'https://project.supabase.co/'+i,attachment_type:i%2?'image/png':'application/pdf'}));
  rows.push(msg(100,undefined,{attachment_url:'x',attachment_type:'image/png',scheduled_for:'2999-01-01T00:00:00Z'}),msg(101,undefined,{attachment_url:'x',expires_at:'2000-01-01T00:00:00Z'}),msg(102,undefined,{attachment_url:'x',deleted_at:'now'}));
  const api=apiFixture(rows);
  assert.equal((await api.media('c',false,'all',0)).length,30);assert.equal((await api.media('c',false,'all',60)).length,5);
  assert.equal((await api.media('c',false,'image',30)).length,2);assert.equal((await api.media('c',false,'file',30)).length,3);
  assert.ok((await api.messagePage('c')).every(x=>x.id!==100&&x.id!==101));
});
test('Sending cannot replace sender or conversation through extra fields',async()=>{
  const api=apiFixture([]),sent=await api.send('c','hello',null,{sender_id:'someone',conversation_id:'other',reply_to:1});
  assert.equal(sent.sender_id,'me');assert.equal(sent.conversation_id,'c');assert.equal(sent.reply_to,1);
  await assert.rejects(api.send('c','x'.repeat(4001)));assert.equal(api.sb.inserted.length,1);
});
test('Active file formats and disguised avatar contents are rejected before upload',async()=>{
  const api=apiFixture([]);
  await assert.rejects(api.upload('chat-files',new File(['code'],'attack.html',{type:'text/plain'})));
  await assert.rejects(api.upload('avatars',new File(['<svg>'],'photo.png',{type:'image/png'})));
});

// Run real app state functions with inert DOM surfaces. This is not layout QA.
const appURL=new URL('../app.js',import.meta.url);
let appSource=await readFile(appURL,'utf8');
appSource=appSource.replace(/(from\s*['"])(\.\/[^'"]+)(['"])/g,(_,a,b,c)=>a+new URL(b,appURL).href+c).replace('await boot();','');
appSource+=`\nexport const testing={app,refreshMessages,markRead,send,captureDraft,changeState,mediaMatches,paintHTML,receiveInboxEvent,notifyMessage,inboxDialogs,handleMessengerAction,stopPaneMedia,\n inject(value){api=value;stopped=false;},clear(){for(const timer of app.draftTimers.values())clearTimeout(timer);app.draftTimers.clear();readRequests.clear();lastRead.clear();},\n renderStub(){renderMessages=()=>{};renderCompose=()=>{};renderPinned=()=>{};renderSidebar=()=>{};renderStories=()=>{};applyLanguage=()=>{};toast=()=>{};},\n };`;
const {testing:A}=await import('data:text/javascript;base64,'+Buffer.from(appSource).toString('base64'));
A.renderStub();
function reset(){
  A.clear();Object.assign(A.app,{user:{id:'me'},profile:{id:'me'},active:{id:'c',kind:'direct'},route:'chats',info:{profiles:[],members:[]},messages:[],reactions:[],prefs:{},peopleMap:{},dialogs:[],channels:[],drafts:{},pending:new Set(),confirmedMessages:new Map(),files:new Map(),reply:null,edit:null,historyFocus:false,more:true,state:{notes:[],muted:[],fontSize:16,glassMode:'balanced'},stateChain:Promise.resolve()});
  A.app.epoch++;A.app.messageEpoch++;field('#messageInput').value='';field('#sendError').textContent='';navigator.onLine=true;storage.clear();
  const api={messagePage:async()=>[],reactions:async()=>[],pins:async()=>[],replyMessages:async()=>[],dialogs:async()=>[],channels:async()=>[],draft:async()=>{},markRead:async()=>{},saveState:async()=>{}};A.inject(api);return api;
}
test('Polling and older-page loading never overlap in the same conversation',async()=>{
  const api=reset(),hold=deferred();let active=0,maximum=0,calls=0;
  api.messagePage=async()=>{active++;maximum=Math.max(maximum,active);calls++;if(calls===1)await hold.promise;active--;return[msg(calls)];};
  const first=A.refreshMessages(),duplicate=A.refreshMessages(),older=A.refreshMessages(false,true);await tick();assert.equal(calls,1);hold.resolve();await Promise.all([first,duplicate,older]);assert.equal(calls,2);assert.equal(maximum,1);
});
test('A late response from the previous chat cannot replace the new chat',async()=>{
  const api=reset(),hold=deferred();api.messagePage=()=>hold.promise;const task=A.refreshMessages();await tick();A.app.epoch++;A.app.active={id:'new',kind:'direct'};A.app.messages=[msg(900)];hold.resolve([msg(1)]);await task;assert.equal(A.app.messages[0].id,900);
});
test('A confirmed send survives a refresh that started before the acknowledgement',async()=>{
  const api=reset(),hold=deferred();api.messagePage=async()=>[msg(1)];api.reactions=()=>hold.promise;
  const task=A.refreshMessages();await tick();A.app.confirmedMessages.set('2',msg(2));hold.resolve([]);await task;assert.deepEqual(A.app.messages.map(x=>x.id),[1,2]);
});
test('Read receipts are deduplicated and historical windows never mark the latest chat read',async()=>{
  const api=reset();let reads=0;api.markRead=async()=>{reads++;};A.app.messages=[msg(1)];await A.markRead();await A.markRead();assert.equal(reads,1);A.app.messages=[msg(2,'2026-10-10T11:00:00.000Z')];A.app.historyFocus=true;await A.markRead();assert.equal(reads,1);
});
test('Offline send keeps the draft and performs no write',async()=>{
  const api=reset();let sends=0;api.send=async()=>{sends++;};navigator.onLine=false;field('#messageInput').value='offline text';await A.send();assert.equal(sends,0);assert.equal(field('#messageInput').value,'offline text');assert.equal(A.app.drafts['chat:c'].body,'offline text');
});
test('A slow send cannot erase newly typed text, and double clicks send once',async()=>{
  const api=reset(),hold=deferred();let sends=0;api.send=async()=>{sends++;return hold.promise;};api.messagePage=async()=>[msg(1)];
  field('#messageInput').value='first';const first=A.send();await tick();const second=A.send();field('#messageInput').value='second draft';A.captureDraft();hold.resolve(msg(1,undefined,{body:'first'}));await Promise.all([first,second]);assert.equal(sends,1);assert.equal(field('#messageInput').value,'second draft');assert.equal(A.app.drafts['chat:c'].body,'second draft');assert.equal(A.app.pending.size,0);
});
test('A network error keeps the message and does not automatically resend it',async()=>{
  const api=reset();let sends=0;api.send=async()=>{sends++;throw Error('network timeout');};field('#messageInput').value='keep me';await A.send();assert.equal(field('#messageInput').value,'keep me');assert.equal(A.app.drafts['chat:c'].body,'keep me');assert.equal(sends,1);assert.ok(field('#sendError').textContent.includes('подтвердить'));assert.equal(A.app.pending.size,0);
});
test('Preference writes remain ordered and a failed write does not block later updates',async()=>{
  const api=reset(),hold=deferred(),events=[];let writes=0;api.saveState=async state=>{writes++;events.push(state.fontSize);if(writes===1){await hold.promise;throw Error('temporary');}};
  const first=A.changeState({fontSize:18}),result=assert.rejects(first),next=A.changeState({fontSize:20});await tick();assert.deepEqual(events,[18]);hold.resolve();await result;await next;assert.deepEqual(events,[18,20]);assert.equal(A.app.state.fontSize,20);
});
test('Attachment filters include untyped files while separating audio and images',()=>{assert.equal(A.mediaMatches({attachment_type:null},'file'),true);assert.equal(A.mediaMatches({attachment_type:'image/png'},'file'),false);assert.equal(A.mediaMatches({attachment_type:'audio/mp4'},'audio'),true);});
test('A repeated render can replace a transient error even when the requested HTML is unchanged',()=>{
  const host={innerHTML:''};A.paintHTML(host,'<p>inbox</p>');host.innerHTML='<p>temporary error</p>';A.paintHTML(host,'<p>inbox</p>');assert.equal(host.innerHTML,'<p>inbox</p>');
});
test('Realtime updates do not count duplicates or reveal future scheduled messages',()=>{
  reset();A.app.active={id:'other',kind:'direct'};A.app.dialogs=[{id:'c',unread:0,kind:'direct'}];
  const payload={eventType:'INSERT',new:msg('event-1',undefined,{sender_id:'them'})};A.receiveInboxEvent(payload);A.notifyMessage(payload);A.receiveInboxEvent(payload);assert.equal(A.app.dialogs[0].unread,1);
  A.receiveInboxEvent({eventType:'INSERT',new:msg('event-2',undefined,{sender_id:'them',scheduled_for:'2999-01-01T00:00:00Z'})});assert.equal(A.app.dialogs[0].unread,1);
});
test.after(()=>A.clear());

test('The worker updates without forcing a reload and never mixes HTML routes or cache scopes',async()=>{
  const scope='https://example.test/rndm/',handlers={},cacheStore=new Map(),deleted=[];let skipped=0,network=true;
  const normal=key=>new URL(typeof key==='string'?key:key.url,scope).href;
  const cache={async addAll(){},async put(key,response){cacheStore.set(normal(key),response);},async match(key){return cacheStore.get(normal(key))?.clone();}};
  cacheStore.set(scope+'index.html',new Response('INDEX'));
  class RequestStub{constructor(input,options={}){Object.assign(this,typeof input==='object'?input:{url:input},options);}}
  const runtime={URL,Response,Request:RequestStub,self:{registration:{scope},location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){skipped++;},clients:{claim:async()=>{}}},caches:{open:async()=>cache,keys:async()=>['rndm-%2Frndm%2F-v61','rndm-%2Fother%2F-v61','rndm-v61-unified-inbox'],delete:async key=>{deleted.push(key);return true;}},fetch:async req=>{if(!network)throw Error('offline');return new Response(String(req.url).includes('reset-password')?'RECOVERY':'INDEX');}};
  vm.runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),runtime);
  const dispatch=async(name,request)=>{const waits=[];let response;handlers[name]({request,waitUntil:p=>waits.push(p),respondWith:p=>response=p});const r=await response;await Promise.all(waits);return r;};
  await dispatch('install');assert.equal(skipped,0);await dispatch('activate');assert.deepEqual(deleted,['rndm-%2Frndm%2F-v61']);
  const req={url:scope+'reset-password.html?token=test',method:'GET',mode:'navigate'};assert.equal(await(await dispatch('fetch',req)).text(),'RECOVERY');
  assert.equal(await cacheStore.get(scope+'index.html').clone().text(),'INDEX');network=false;assert.equal(await(await dispatch('fetch',req)).text(),'RECOVERY');
  assert.equal(await dispatch('fetch',{url:'https://project.supabase.co/rest/v1/messages',method:'GET',mode:'cors'}),undefined);
});

test('Mobile primary navigation has five controls and keeps channels in the inbox',()=>{
 const state={profile:{},route:'chats'};const shell=V.shell(state);assert.equal((shell.match(/class="nav-item /g)||[]).length,5);assert.ok(!shell.includes('data-nav="roadworld"'));assert.ok(shell.includes('data-nav="random"'));
});
test('Manual unread markers survive list reloads and clear when a chat is read',async()=>{
 const api=reset();A.app.dialogs=[{id:'c',unread:0,kind:'direct'}];A.app.state.manualUnread=['c'];A.app.messages=[msg(1)];let saved=0;api.saveState=async()=>{saved++;};
 assert.equal(A.inboxDialogs()[0].unread,1);await A.markRead();assert.equal(A.inboxDialogs()[0].unread,0);assert.equal(saved,1);
});
test('Voice message speed cycles through 1, 1.5 and 2 without sending a request',async()=>{
 reset();const audio={playbackRate:1},button={closest:()=>({querySelector:()=>audio}),setAttribute(){},textContent:''};
 await A.handleMessengerAction('voice-speed',button);assert.equal(audio.playbackRate,1.5);await A.handleMessengerAction('voice-speed',button);assert.equal(audio.playbackRate,2);await A.handleMessengerAction('voice-speed',button);assert.equal(audio.playbackRate,1);
});
test('Long multiline text is collapsible but the complete source stays present',()=>{
 reset();const html=V.messageHTML(msg(1,undefined,{body:Array(18).fill('Строка').join('\n')}),A.app);assert.ok(html.includes('long-message'));assert.ok(html.includes('data-expand-message="1"'));assert.equal((html.match(/Строка/g)||[]).length,18);
});
test('Clip actions also work with numeric database IDs',async()=>{
 let recipient;const clips=new Clips({uid:'me',sb:{}},{onGift:async id=>{recipient=id;}});clips.rows=[{id:7,user_id:'other'}];
 const card={dataset:{clipId:'7'}},button={closest:()=>card,dataset:{clipAction:'gift'},isConnected:false};await clips.action(button);assert.equal(recipient,'other');
});
test('Clip videos load on demand, once; unsafe video URLs never load',()=>{
 const clips=new Clips({sb:{}},{});let loaded=0;const video={src:'',dataset:{videoSrc:'https://project.supabase.co/clip.mp4'},getAttribute(){return this.src;},load(){loaded++;}};
 clips.ensureVideo(video);clips.ensureVideo(video);assert.equal(loaded,1);video.src='';video.dataset.videoSrc='javascript:alert(1)';clips.ensureVideo(video);assert.equal(loaded,1);
});
test('Holding a clip sets 2x, restores its normal speed, and ignores scrolling gestures',()=>{
 const clips=new Clips({sb:{}},{});clips.host={};clips.playbackSpeed=1.5;const events={},scheduled=[];const hint={hidden:true},progress={addEventListener(){}};
 const card={querySelector:s=>s==='.clip-progress'?progress:hint,addEventListener:(name,fn)=>events[name]=fn};const video={paused:false,playbackRate:1.5,closest:()=>card,addEventListener(){}};
 const oldSet=setTimeout,oldClear=clearTimeout;globalThis.setTimeout=fn=>{scheduled.push(fn);return scheduled.length;};globalThis.clearTimeout=()=>{};
 try{
  clips.wireScrubAndHold(video);const target={closest:()=>null};events.pointerdown({target,button:0,clientX:5,clientY:5});scheduled.at(-1)();assert.equal(video.playbackRate,2);assert.equal(hint.hidden,false);events.pointerup();assert.equal(video.playbackRate,1.5);assert.equal(hint.hidden,true);
  events.pointerdown({target,button:0,clientX:5,clientY:5});events.pointermove({clientX:5,clientY:50});scheduled.at(-1)();assert.equal(video.playbackRate,1.5);
 }finally{globalThis.setTimeout=oldSet;globalThis.clearTimeout=oldClear;}
});

test('Leaving a section pauses its media, without touching a call outside the pane',()=>{
 let pauses=0;const pane=field('#pane'),old=pane.querySelectorAll;pane.querySelectorAll=()=>[{pause(){pauses++;}},{pause(){pauses++;}}];try{A.stopPaneMedia();assert.equal(pauses,2);}finally{pane.querySelectorAll=old;}
});

const O=await import('../organizer.js');
test('Custom folders keep chat and channel IDs separate and bound corrupted state',()=>{
 const folders=O.normalizeFolders([{id:'folder-a',title:'  Работа  ',items:['direct:1','channel:1','direct:1',null]},null,{id:'<script>',items:[]}]);
 assert.deepEqual(folders,[{id:'folder-a',title:'Работа',items:['direct:1','channel:1']}]);assert.notEqual(O.itemKey('channel',1),O.itemKey('direct',1));
 assert.equal(O.normalizeFolders(Array.from({length:30},(_,i)=>({id:'folder-'+i,title:'x',items:Array(800).fill('direct:1')}))).length,12);
});
test('Link gallery escapes HTML and excludes executable schemes',()=>{
 assert.deepEqual(O.bodyLinks('javascript:alert(1) https://example.org/hello. https://example.org/hello.'),['https://example.org/hello']);
 const html=V.mediaGallery([msg(1,undefined,{body:'https://example.org/?x=<script>'})],'links');assert.ok(!html.includes('<script>'));assert.ok(html.includes('noopener noreferrer'));
});
test('Link search retains chat, expiry, deletion and scheduled visibility boundaries',async()=>{
 const rows=[msg(1,undefined,{body:'https://example.org/hello'}),msg(2,undefined,{body:'https://example.org/hello',conversation_id:'other'}),msg(3,undefined,{body:'https://example.org/hello',deleted_at:'now'}),msg(4,undefined,{body:'https://example.org/hello',scheduled_for:'2999-01-01'}),msg(5,undefined,{body:'https://example.org/hello',expires_at:'2000-01-01'})];
 assert.deepEqual((await apiFixture(rows).media('c',false,'links',0,'hello')).map(x=>x.id),[1]);
});
test('A failed clip preference write leaves sound, speed and autoplay intact',async()=>{
 const clips=new Clips({sb:{}},{preferences:{sound:false,speed:1.5,autoplay:false},onPreferences:async()=>{throw Error('offline');}});
 await assert.rejects(clips.savePreferences({sound:true,speed:2,autoplay:true}));assert.deepEqual(clips.preferences(),{sound:false,speed:1.5,autoplay:false,dataSaver:false});
 let saved;clips.ui.onPreferences=async p=>{saved=p;};await clips.savePreferences({dataSaver:true});assert.equal(saved.dataSaver,true);assert.equal(clips.dataSaver,true);
 assert.equal(O.clipPreferences({speed:99}).speed,1);
});
test('Missing channel backend is cached; permission errors are never treated as success',async()=>{
 const api=Object.create(MessengerAPI.prototype);let requests=0;api.sb={rpc:async()=>{requests++;return{error:{code:'PGRST202'}};}};
 assert.equal(await api.channelTools('c'),null);assert.equal(await api.channelTools('c'),null);assert.equal(requests,1);
 const denied=Object.create(MessengerAPI.prototype);denied.sb={rpc:async()=>({error:{code:'42501',message:'denied'}})};await assert.rejects(denied.channelTools('c'));
});
test('Editing a channel post uses the captured channel and keeps failed edits as drafts',async()=>{
 const api=reset();A.app.active={id:'channel',kind:'channel'};A.app.edit={id:9,restore:'old draft'};field('#messageInput').value='Updated post';let editArgs;
 api.editPost=async(...args)=>{editArgs=args;throw Error('permission denied');};await A.send();assert.deepEqual(editArgs,['channel',9,'Updated post']);assert.equal(field('#messageInput').value,'Updated post');assert.ok(A.app.edit);assert.match(field('#sendError').textContent,/Недостаточно прав/);
});
test('The profile QR uses a quiet zone and never inserts payload text as SVG markup',async()=>{
 const context={};vm.runInNewContext(await readFile(new URL('../qrcode-1.4.4.js',import.meta.url),'utf8'),context);globalThis.qrcode=context.qrcode;
 const svg=O.profileQR('https://example.test/index.html?view=profile&user=abc');assert.ok(svg.includes('fill="white"'));assert.ok(svg.includes('M4 '));assert.ok(!svg.includes('https://'));assert.ok(svg.includes('viewBox='));delete globalThis.qrcode;
});
