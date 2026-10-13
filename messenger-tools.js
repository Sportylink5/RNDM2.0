import {esc, sid, safeURL} from './core.js?v=64.0.0';

// One lane per open conversation. Realtime, polling and pagination cannot race.
export class RequestLane {
  constructor(){this.tail=Promise.resolve();this.tasks=new Map();}
  run(key,work){
    if(this.tasks.has(key))return this.tasks.get(key);
    const task=this.tail.catch(()=>{}).then(work);
    const tracked=task.finally(()=>{if(this.tasks.get(key)===tracked)this.tasks.delete(key);});
    this.tasks.set(key,tracked);this.tail=tracked;return tracked;
  }
}

export const isChat = item => ['direct','group'].includes(item?.kind);
export function inboxStats(dialogs=[],prefs={}){
  const visible=dialogs.filter(x=>!prefs[x.id]?.is_archived);
  return {unread:visible.reduce((n,x)=>n+Math.max(0,Number(x.unread)||0),0),
    newChats:visible.filter(x=>Number(x.unread)>0).length,
    archived:dialogs.filter(x=>prefs[x.id]?.is_archived).length,
    groups:visible.filter(x=>x.kind==='group').length};
}
export function sortMessages(rows){
  return [...new Map(rows.map(x=>[sid(x.id),x])).values()].sort((a,b)=>{
    const dates=new Date(a.created_at)-new Date(b.created_at);if(dates)return dates;
    const aa=sid(a.id),bb=sid(b.id);
    if(/^\d+$/.test(aa)&&/^\d+$/.test(bb))return BigInt(aa)<BigInt(bb)?-1:BigInt(aa)>BigInt(bb)?1:0;
    return aa.localeCompare(bb);
  });
}
export function trustedMedia(value){
  const url=safeURL(value);if(!url)return '';
  try{return new URL(url).origin===new URL(window.RNDM_CONFIG?.url).origin?url:'';}catch{return '';}
}
export function exportText(rows,people={},title='RNDM Chat'){
  return `${title}\nЭкспорт: ${new Date().toLocaleString('ru-RU')}\n\n`+sortMessages(rows).map(m=>{
    const name=people[m.sender_id]?.display_name||people[m.author_id]?.display_name||'Участник';
    const at=new Date(m.created_at).toLocaleString('ru-RU');
    return `[${at}] ${name}\n${m.deleted_at?'Сообщение удалено':m.body||''}${m.attachment_url?'\nВложение: '+(m.attachment_name||'файл')+'\n'+(safeURL(m.attachment_url)||''):''}`;
  }).join('\n\n');
}
export function exportJSON(rows,title='RNDM Chat'){
  return JSON.stringify({app:'RNDM Chat',version:'64.0.0',title,exported_at:new Date().toISOString(),
    messages:sortMessages(rows).map(m=>({id:sid(m.id),sender_id:m.sender_id||m.author_id||null,body:m.deleted_at?'':m.body||'',created_at:m.created_at,
      edited_at:m.edited_at||null,deleted_at:m.deleted_at||null,reply_to:m.reply_to||null,
      attachment_url:m.deleted_at?null:safeURL(m.attachment_url)||null,attachment_name:m.deleted_at?null:m.attachment_name||null}))},null,2);
}
export function fileName(value){return String(value||'RNDM').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,70).trim()||'RNDM';}
export function highlighted(text,query){
  const source=String(text||''),needle=String(query||'').trim();if(!needle)return esc(source);
  let out='',offset=0;const lower=source.toLocaleLowerCase('ru'),find=needle.toLocaleLowerCase('ru');
  let at=lower.indexOf(find);while(at>=0){out+=esc(source.slice(offset,at))+'<mark>'+esc(source.slice(at,at+needle.length))+'</mark>';offset=at+needle.length;at=lower.indexOf(find,offset);}
  return out+esc(source.slice(offset));
}

const emojiGroups=[
  ['Эмоции','эмоции лицо улыбка smile',[['😀','радость улыбка'],['😊','улыбка приятно'],['😂','смех смешно'],['🤣','смех'],['🥰','любовь'],['😍','любовь'],['😎','круто'],['🥳','праздник'],['🤔','думаю'],['😮','удивление'],['😢','грустно'],['😭','слёзы'],['😅','неловко'],['🙃','улыбка'],['😴','сон'],['🤯','удивление'],['🥺','просьба'],['🫠','таю']]],
  ['Жесты','руки жесты hands',[['👍','да нравится'],['👎','нет'],['🙏','спасибо'],['👋','привет пока'],['🤝','дружба'],['💪','сила'],['🫶','любовь'],['👌','ок'],['✌️','мир'],['👏','аплодисменты'],['🤞','удача']]],
  ['Сердца','любовь сердце love heart',[['❤️','красное'],['💜','фиолетовое'],['💚','зелёное'],['🩵','голубое'],['🩷','розовое'],['🖤','чёрное'],['🤍','белое'],['💔','разбито'],['💕','два']]],
  ['Всё остальное','предметы природа',[['🔥','огонь fire'],['✨','сияние'],['🎉','праздник'],['💯','сто'],['🚀','ракета'],['☕','кофе'],['🎮','игры games'],['🎵','музыка music'],['🌿','природа'],['⭐','звезда'],['🐱','кот cat'],['🐶','собака'],['🌙','луна'],['☀️','солнце'],['🎁','подарок'],['🍕','пицца'],['📚','учёба'],['💻','компьютер'],['⚡','энергия'],['✅','готово']]]
];
export function emojiHTML(query='',recent=[]){
  const q=query.trim().toLocaleLowerCase('ru');
  const button=(e,label)=>`<button type="button" data-insert-emoji="${esc(e)}" aria-label="${esc(label||e)}" title="${esc(label||e)}">${e}</button>`;
  const known=new Set(emojiGroups.flatMap(g=>g[2].map(e=>e[0])));
  const recentRows=recent.filter(e=>known.has(e)).slice(0,16);
  const body=emojiGroups.map(([title,tags,rows])=>{
    const filtered=q?rows.filter(([e,label])=>(title+' '+tags+' '+label+' '+e).toLocaleLowerCase('ru').includes(q)):rows;
    return filtered.length?`<section class="emoji-section"><h4>${title}</h4><div class="emoji-grid">${filtered.map(([e,label])=>button(e,label)).join('')}</div></section>`:'';
  }).join('');
  return (!q&&recentRows.length?`<section class="emoji-section"><h4>Недавние</h4><div class="emoji-grid">${recentRows.map(e=>button(e)).join('')}</div></section>`:'')+(body||'<p class="muted emoji-empty">Ничего не найдено</p>');
}
