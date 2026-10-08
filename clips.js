import {$,$$,esc,icon,avatar,safeURL,errorText} from './core.js';
const must=r=>{if(r.error)throw r.error;return r.data;};
export class Clips {
  constructor(api,ui){this.api=api;this.sb=api.sb;this.ui=ui;this.epoch=0;this.sound=true;this.rows=[];this.locks=new Set();}
  stop(){++this.epoch;this.observer?.disconnect();if(this.host){this.host.onclick=null;$$('video',this.host).forEach(v=>{v.pause();v.removeAttribute('src');v.load();});}this.host=null;}
  async open(host,clipId=null){
    this.stop();this.host=host;this.rows=[];this.before=null;this.more=true;this.loading=false;
    host.innerHTML=`<header class="chat-header"><button class="icon-button back-mobile" data-action="back" aria-label="К чатам">${icon('back')}</button><h2>Клипы</h2><div class="header-tools"><button class="secondary" id="clipUpload">${icon('plus')}Выложить</button></div></header><div class="clips-feed" id="clipsFeed"><div class="sidebar-empty"><span class="spinner"></span><p>Загружаем клипы…</p></div></div><input id="clipFile" type="file" accept="video/mp4,video/webm,video/quicktime" hidden>`;
    $('#clipUpload').onclick=()=>{const input=$('#clipFile');input.value='';input.click();};$('#clipFile').onchange=e=>this.upload(e.target.files[0]);
    host.onclick=e=>{const b=e.target.closest('[data-clip-action]');if(b){e.preventDefault();this.action(b).catch(err=>this.ui.toast(errorText(err)));}};
    await this.load(false,clipId);
  }
  async load(append=false,clipId=null){
    if(this.loading||!this.host)return;this.loading=true;const epoch=this.epoch,feed=$('#clipsFeed',this.host);
    try{
      let query=this.sb.from('clips').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30);
      if(append&&this.before)query=query.or(`created_at.lt.${this.before.created_at},and(created_at.eq.${this.before.created_at},id.lt.${this.before.id})`);
      let rows=must(await query)||[];const more=rows.length===30,before=rows.at(-1)||this.before;
      if(!append&&clipId&&!rows.some(x=>x.id===clipId)){const r=must(await this.sb.from('clips').select('*').eq('id',clipId).maybeSingle());if(r)rows.unshift(r);}
      const ids=rows.map(x=>x.id),people=await this.api.profiles(rows.map(x=>x.user_id));
      const [likes,comments,saves]=ids.length?await Promise.all([this.sb.from('clip_likes').select('clip_id,user_id').in('clip_id',ids),this.sb.from('clip_comments').select('clip_id').in('clip_id',ids),this.sb.from('clip_saves').select('clip_id').eq('user_id',this.api.uid).in('clip_id',ids)]):[{data:[]},{data:[]},{data:[]}];
      const lr=must(likes)||[],cr=must(comments)||[],sr=must(saves)||[];
      if(epoch!==this.epoch)return;this.more=more;this.before=before;
      rows=rows.map(r=>({...r,person:people.find(p=>p.id===r.user_id),likes:lr.filter(x=>x.clip_id===r.id).length,comments:cr.filter(x=>x.clip_id===r.id).length,liked:lr.some(x=>x.clip_id===r.id&&x.user_id===this.api.uid),saved:sr.some(x=>x.clip_id===r.id)}));
      const fresh=rows.filter(r=>!this.rows.some(x=>x.id===r.id));this.rows.push(...fresh);
      if(!append)feed.innerHTML='';$('#clipMore',feed)?.remove();feed.insertAdjacentHTML('beforeend',fresh.map(r=>this.card(r)).join(''));
      if(!this.rows.length)feed.innerHTML='<div class="clips-empty">'+icon('clips')+'<h2>Первый клип — за тобой</h2><p>Выложи короткое видео и начни свою ленту.</p></div>';
      if(this.more)feed.insertAdjacentHTML('beforeend','<button class="secondary" id="clipMore">Загрузить ещё</button>');
      if($('#clipMore',feed))$('#clipMore',feed).onclick=()=>this.load(true);
      this.observe(feed);
      if(clipId)feed.querySelector(`[data-clip-id="${CSS.escape(clipId)}"]`)?.scrollIntoView({block:'start'});
    }catch(e){if(epoch===this.epoch){if(!append)feed.innerHTML=`<div class="clips-empty"><div class="notice error-notice">${esc(errorText(e))}</div><button class="secondary" id="clipRetry">Повторить</button></div>`;else this.ui.toast(errorText(e));if($('#clipRetry',feed))$('#clipRetry',feed).onclick=()=>this.load();}}
    finally{if(epoch===this.epoch)this.loading=false;}
  }
  card(r){
    return `<article class="clip-card" data-clip-id="${esc(r.id)}"><video src="${esc(safeURL(r.video_url))}" playsinline webkit-playsinline loop preload="metadata" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback" aria-label="Клип ${esc(r.person?.display_name||'пользователя')}"></video><div class="clip-shade"></div><button type="button" class="clip-play-overlay" data-clip-action="play" aria-label="Пауза или воспроизведение">${icon("play")}</button><div class="clip-copy"><button class="clip-author clip-author-profile" type="button" data-person="${esc(r.user_id)}" aria-label="Открыть профиль автора">${avatar(r.person,'small')}<b>${esc(r.person?.display_name||r.person?.username||'Пользователь')}</b></button><p>${esc(r.caption)}</p></div><div class="clip-actions"><button data-clip-action="sound" aria-label="${this.sound?'Выключить':'Включить'} звук">${icon(this.sound?'volume':'mute')}</button><button data-clip-action="like" class="${r.liked?'selected':''}" aria-label="Лайк" aria-pressed="${r.liked}">${icon('heart')}<span>${r.likes}</span></button><button data-clip-action="comments" aria-label="Комментарии">${icon('chats')}<span>${r.comments}</span></button><button data-clip-action="save" class="${r.saved?'selected':''}" aria-label="Сохранить" aria-pressed="${r.saved}">${icon('saved')}</button><button data-clip-action="share" aria-label="Поделиться">${icon('forward')}</button>${r.user_id===this.api.uid?`<button data-clip-action="delete" aria-label="Удалить свой клип">${icon('trash')}</button>`:''}</div><button class="clip-enable-sound" data-clip-action="enable-sound" hidden>Нажми, чтобы включить звук</button></article>`;
  }
  observe(feed){
    this.observer?.disconnect();
    this.observer=new IntersectionObserver(entries=>entries.forEach(e=>{
      const v=$('video',e.target);if(!v)return;
      if(e.isIntersecting&&e.intersectionRatio>.65){$$('video',feed).forEach(other=>{if(other!==v)other.pause();});this.current=v;this.play(v);}
      else v.pause();
    }),{root:feed,threshold:[0,.65]});$$('.clip-card',feed).forEach(card=>this.observer.observe(card));
  }
  async play(v){
    v.muted=!this.sound;try{await v.play();$('.clip-enable-sound',v.parentElement).hidden=true;}
    catch(e){if(e.name==='NotAllowedError'){v.muted=true;v.play().catch(()=>{});$('.clip-enable-sound',v.parentElement).hidden=!this.sound;}else if(e.name!=='AbortError'){this.ui.toast('Браузер не воспроизводит это видео. Попробуй MP4 (H.264).');}}
  }
  async action(button){
    const card=button.closest('[data-clip-id]'),r=this.rows.find(x=>x.id===card?.dataset.clipId),action=button.dataset.clipAction;if(!r)return;
    if(this.locks.has(action+r.id))return;this.locks.add(action+r.id);button.disabled=true;
    try{
      if(action==='play'){const v=$('video',card);if(v.paused){await this.play(v);}else{v.pause();}button.classList.toggle('paused',!v.paused);}
      else if(action==='sound'||action==='enable-sound'){
        this.sound=action==='enable-sound'?true:!this.sound;this.current=$('video',card);await this.play(this.current);
        $$('[data-clip-action="sound"]',this.host).forEach(b=>{b.innerHTML=icon(this.sound?'volume':'mute');b.setAttribute('aria-label',this.sound?'Выключить звук':'Включить звук');});
      }else if(action==='like'||action==='save'){
        const field=action==='like'?'liked':'saved',table=action==='like'?'clip_likes':'clip_saves';
        must(await (r[field]?this.sb.from(table).delete().eq('clip_id',r.id).eq('user_id',this.api.uid):this.sb.from(table).insert({clip_id:r.id,user_id:this.api.uid})));r[field]=!r[field];
        button.classList.toggle('selected',r[field]);button.setAttribute('aria-pressed',String(r[field]));if(action==='like'){r.likes+=r.liked?1:-1;$('span',button).textContent=r.likes;}
      }else if(action==='comments'){await this.comments(r);}
      else if(action==='share'){
        const url=new URL('index.html',location.href);url.searchParams.set('view','clips');url.searchParams.set('clip',r.id);
        if(navigator.share)await navigator.share({title:'RNDM Clip',url:url.href});else{await navigator.clipboard.writeText(url.href);this.ui.toast('Ссылка скопирована');}
      }else if(action==='delete'){
        this.ui.confirm('Удалить клип?','Публикация исчезнет из ленты.',async()=>{const deleted=must(await this.sb.from('clips').delete().eq('id',r.id).eq('user_id',this.api.uid).select('id'));if(!deleted?.length)throw new Error('Не удалось удалить клип.');$('video',card).pause();this.observer.unobserve(card);card.remove();this.rows=this.rows.filter(x=>x.id!==r.id);this.ui.toast('Клип удалён');});
      }
    }finally{this.locks.delete(action+r.id);if(button.isConnected)button.disabled=false;}
  }
  upload(file){
    if(!file)return;
    if(!['video/mp4','video/webm','video/quicktime'].includes(file.type)||file.size>window.RNDM_CONFIG.maxFileBytes){this.ui.toast('Выбери видео MP4, WebM или MOV до 50 МБ.');return;}
    const url=URL.createObjectURL(file),modal=this.ui.modal('Выложить клип',`<form id="clipPublishForm"><video class="clip-preview" src="${url}" controls playsinline></video><label class="field">Описание<textarea name="caption" maxlength="2000" rows="3" placeholder="О чём твоё видео?"></textarea></label><div id="clipUploadError"></div><button class="primary" type="submit">Опубликовать</button></form>`);
    const revoke=()=>{const video=$('video',form);if(video){video.pause();video.removeAttribute('src');video.load();}URL.revokeObjectURL(url);modal.removeEventListener('close',revoke);};modal.addEventListener('close',revoke);
    const form=$('#clipPublishForm');form.onsubmit=async e=>{
      e.preventDefault();const button=$('[type=submit]',form),uid=this.api.uid;if(button.disabled)return;button.disabled=true;button.textContent='Загружаем…';let uploaded;
      try{
        uploaded=await this.api.upload('clips',file,'clips');
        if(this.api.uid!==uid)throw new Error('Аккаунт изменился. Войди снова перед публикацией.');
        must(await this.sb.from('clips').insert({user_id:this.api.uid,video_url:uploaded.url,caption:String(new FormData(form).get('caption')).trim()}).select().single());
        if(form.isConnected)modal.close();this.ui.toast('Клип опубликован');
        if(this.host)await this.open(this.host);
      }catch(err){if(uploaded&&!/fetch|network|abort|timeout/i.test(err.message||''))await this.sb.storage.from('clips').remove([uploaded.path]);if(form.isConnected)$('#clipUploadError').innerHTML=`<div class="notice error-notice">${esc(errorText(err))}</div>`;}
      finally{if(button.isConnected){button.disabled=false;button.textContent='Опубликовать';}}
    };
  }
  async comments(r){
    this.current?.pause();this.ui.modal('Комментарии',`<div class="comments-list" id="clipComments"><span class="spinner"></span></div><form id="clipCommentForm" class="comment-form"><textarea name="body" maxlength="4000" rows="2" required aria-label="Комментарий" placeholder="Твой комментарий…"></textarea><button class="primary" type="submit" aria-label="Отправить">${icon('send')}</button></form><div id="clipCommentError"></div>`);
    const form=$('#clipCommentForm'),host=$('#clipComments');
    const draw=async()=>{const rows=must(await this.sb.from('clip_comments').select('*').eq('clip_id',r.id).order('created_at',{ascending:true}).limit(200))||[];const people=await this.api.profiles(rows.map(x=>x.user_id));if(!host.isConnected)return;host.innerHTML=rows.map(x=>{const p=people.find(p=>p.id===x.user_id);return `<article class="comment-row">${avatar(p,'small')}<div class="comment-content"><b>${esc(p?.display_name||p?.username||'Пользователь')}</b><p>${esc(x.body)}</p></div></article>`;}).join('')||'<p class="muted">Комментариев пока нет.</p>';};
    form.onsubmit=async e=>{e.preventDefault();const input=$('textarea',form),body=input.value.trim(),button=$('button',form);if(!body||button.disabled)return;button.disabled=true;try{must(await this.sb.from('clip_comments').insert({clip_id:r.id,user_id:this.api.uid,body}).select().single());input.value='';r.comments++;const count=this.host?.querySelector(`[data-clip-id="${CSS.escape(r.id)}"] [data-clip-action="comments"] span`);if(count)count.textContent=r.comments;await draw();}catch(err){if(form.isConnected)$('#clipCommentError').innerHTML=`<div class="notice error-notice">${esc(errorText(err))}</div>`;}finally{if(button.isConnected)button.disabled=false;}};
    try{await draw();}catch(e){if(host.isConnected)host.innerHTML=`<div class="notice error-notice">${esc(errorText(e))}</div>`;}
  }
}
