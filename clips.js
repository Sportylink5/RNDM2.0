import {$,$$,esc,icon,avatar,safeURL,errorText} from './core.js?v=55.0.0';
const must=r=>{if(r.error)throw r.error;return r.data;};
export class Clips {
  constructor(api,ui){this.api=api;this.sb=api.sb;this.ui=ui;this.epoch=0;this.sound=true;this.rows=[];this.locks=new Set();this.feedMode='recommended';this.tag='';this.following=new Set();this.playbackSpeed=1;this.userPaused=new WeakSet();}
  stop(){++this.epoch;this.observer?.disconnect();if(this.host){this.host.onclick=null;$$('video',this.host).forEach(v=>{v.pause();v.removeAttribute('src');v.load();});}this.host=null;}
  async open(host,clipId=null){
    this.stop();this.host=host;this.rows=[];this.before=null;this.more=true;this.loading=false;
    host.innerHTML=`<header class="chat-header"><button class="icon-button back-mobile" data-action="back" aria-label="К чатам">${icon('back')}</button><h2>Клипы</h2><div class="header-tools"><button class="secondary" id="clipStats">${icon('info')}Статистика</button><button class="secondary" id="clipUpload">${icon('plus')}Выложить</button></div></header><div class="clip-feed-tools"><div class="clip-feed-tabs" role="tablist"><button type="button" class="active" data-clip-feed="recommended">Для тебя</button><button type="button" data-clip-feed="latest">Новые</button><button type="button" data-clip-feed="popular">Популярные</button><button type="button" data-clip-feed="following">Подписки</button><button type="button" data-clip-feed="saved">Избранное</button></div><label class="clip-tag-filter"><span>＃</span><input id="clipTag" type="search" maxlength="40" placeholder="Хештег" aria-label="Поиск по хештегу"><button type="button" id="clipTagClear" aria-label="Очистить">×</button></label></div><div class="clips-feed" id="clipsFeed"><div class="sidebar-empty"><span class="spinner"></span><p>Загружаем клипы…</p></div></div><input id="clipFile" type="file" accept="video/mp4,video/webm,video/quicktime" hidden>`;
    $$('[data-clip-feed]',host).forEach(b=>b.classList.toggle('active',b.dataset.clipFeed===this.feedMode));$('#clipStats').onclick=()=>this.analytics().catch(err=>this.ui.toast(errorText(err)));$('#clipUpload').onclick=()=>{const input=$('#clipFile');input.value='';input.click();};$('#clipFile').onchange=e=>this.upload(e.target.files[0]);
    host.onclick=e=>{
      const tab=e.target.closest('[data-clip-feed]');
      if(tab){e.preventDefault();++this.epoch;this.loading=false;this.feedMode=tab.dataset.clipFeed;$$('[data-clip-feed]',host).forEach(b=>b.classList.toggle('active',b===tab));this.rows=[];this.before=null;this.load(false).catch(err=>this.ui.toast(errorText(err)));return;}
      const clear=e.target.closest('#clipTagClear');if(clear){++this.epoch;this.loading=false;$('#clipTag',host).value='';this.tag='';this.load(false).catch(err=>this.ui.toast(errorText(err)));return;}
      const profile=e.target.closest('[data-person]');
      if(profile){
        e.preventDefault();e.stopPropagation();
        const uid=profile.dataset.person;
        if(uid&&typeof this.ui.onProfile==='function'){
          this.current?.pause();
          Promise.resolve().then(()=>this.ui.onProfile(uid)).catch(err=>this.ui.toast(errorText(err)));
        }
        return;
      }
      const b=e.target.closest('[data-clip-action]');if(b){e.preventDefault();this.action(b).catch(err=>this.ui.toast(errorText(err)));}
    };
    const tagInput=$('#clipTag',host);let tagTimer;tagInput?.addEventListener('input',()=>{clearTimeout(tagTimer);tagTimer=setTimeout(()=>{++this.epoch;this.loading=false;this.tag=tagInput.value.trim().replace(/^#/, '').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g,'').slice(0,36);this.rows=[];this.before=null;this.load(false).catch(err=>this.ui.toast(errorText(err)));},380);});
    await this.load(false,clipId);
  }
  async load(append=false,clipId=null){
    if(this.loading||!this.host)return;this.loading=true;const epoch=this.epoch,mode=this.feedMode,tag=this.tag,feed=$('#clipsFeed',this.host);
    try{
      let query=this.sb.from('clips').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(['popular','recommended'].includes(this.feedMode)?100:30);
      if(this.feedMode==='saved'){
        const saved=must(await this.sb.from('clip_saves').select('clip_id').eq('user_id',this.api.uid).limit(300))||[];
        if(epoch!==this.epoch)return;
        if(!saved.length){feed.innerHTML='<div class="clips-empty"><h3>Избранное пусто</h3><p>Нажми закладку на клипе, чтобы сохранить.</p></div>';return;}
        query=query.in('id',saved.map(x=>x.clip_id));
      }else if(this.feedMode==='following'){
        const followed=await this.api.followingIds();if(epoch!==this.epoch)return;
        this.following=new Set(followed);
        if(!followed.length){feed.innerHTML='<div class="clips-empty"><h3>Подписок пока нет</h3><p>Открой интересный клип и подпишись на автора.</p><button class="secondary" id="clipBackLatest">Смотреть новые</button></div>';$('#clipBackLatest',feed).onclick=()=>{this.feedMode='latest';++this.epoch;this.loading=false;this.open(this.host);};return;}
        query=query.in('user_id',followed);
      }else{
        this.following=new Set(await this.api.followingIds().catch(()=>[]));
      }
      if(this.tag)query=query.ilike('caption',`%${this.tag.replace(/[%_]/g,'')}%`);
      if(append&&this.before)query=query.or(`created_at.lt.${this.before.created_at},and(created_at.eq.${this.before.created_at},id.lt.${this.before.id})`);
      let rows=must(await query)||[];const more=!['popular','recommended','saved'].includes(this.feedMode)&&rows.length===30,before=rows.at(-1)||this.before;
      if(!append&&clipId&&!rows.some(x=>x.id===clipId)){const r=must(await this.sb.from('clips').select('*').eq('id',clipId).maybeSingle());if(r)rows.unshift(r);}
      const ids=rows.map(x=>x.id),people=await this.api.profiles(rows.map(x=>x.user_id));
      const [likes,comments,saves]=ids.length?await Promise.all([this.sb.from('clip_likes').select('clip_id,user_id').in('clip_id',ids),this.sb.from('clip_comments').select('clip_id').in('clip_id',ids),this.sb.from('clip_saves').select('clip_id').eq('user_id',this.api.uid).in('clip_id',ids)]):[{data:[]},{data:[]},{data:[]}];
      const lr=must(likes)||[],cr=must(comments)||[],sr=must(saves)||[];
      if(epoch!==this.epoch||mode!==this.feedMode||tag!==this.tag)return;this.more=more;this.before=before;
      rows=rows.map(r=>({...r,following:this.following.has(r.user_id),person:people.find(p=>p.id===r.user_id),likes:lr.filter(x=>x.clip_id===r.id).length,comments:cr.filter(x=>x.clip_id===r.id).length,liked:lr.some(x=>x.clip_id===r.id&&x.user_id===this.api.uid),saved:sr.some(x=>x.clip_id===r.id)}));
      if(this.feedMode==='popular')rows.sort((a,b)=>(b.likes*3+b.comments*2)-(a.likes*3+a.comments*2)||new Date(b.created_at)-new Date(a.created_at));
      if(this.feedMode==='recommended'){
        // Transparent ranking, computed from existing public reactions + freshness + subscriptions.
        const now=Date.now(),score=r=>{
          const ageDays=Math.max(0,(now-new Date(r.created_at).getTime())/86400000);
          return Number(r.likes||0)*3+Number(r.comments||0)*5+(r.following?12:0)+18/(1+ageDays);
        };
        rows.sort((a,b)=>score(b)-score(a)||new Date(b.created_at)-new Date(a.created_at));
      }
      if(!append){this.rows=[];feed.innerHTML='';}
      const fresh=rows.filter(r=>!this.rows.some(x=>x.id===r.id));this.rows.push(...fresh);$('#clipMore',feed)?.remove();feed.insertAdjacentHTML('beforeend',fresh.map(r=>this.card(r)).join(''));
      if(!this.rows.length)feed.innerHTML='<div class="clips-empty">'+icon('clips')+'<h2>Нет подходящих клипов</h2><p>Попробуй другой хештег или подпишись на авторов.</p></div>';
      if(this.more)feed.insertAdjacentHTML('beforeend','<button class="secondary" id="clipMore">Загрузить ещё</button>');
      if($('#clipMore',feed))$('#clipMore',feed).onclick=()=>this.load(true);
      this.wireVideoControls(feed);
      this.observe(feed);
      if(clipId)feed.querySelector(`[data-clip-id="${CSS.escape(clipId)}"]`)?.scrollIntoView({block:'start'});
    }catch(e){if(epoch===this.epoch){if(!append)feed.innerHTML=`<div class="clips-empty"><div class="notice error-notice">${esc(errorText(e))}</div><button class="secondary" id="clipRetry">Повторить</button></div>`;else this.ui.toast(errorText(e));if($('#clipRetry',feed))$('#clipRetry',feed).onclick=()=>this.load();}}
    finally{if(epoch===this.epoch)this.loading=false;}
  }
  card(r){
    return `<article class="clip-card" data-clip-id="${esc(r.id)}"><video src="${esc(safeURL(r.video_url))}" playsinline webkit-playsinline loop preload="metadata" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback" aria-label="Клип ${esc(r.person?.display_name||'пользователя')}"></video><div class="clip-shade"></div><button type="button" class="clip-play-overlay paused" data-clip-action="play" aria-label="Воспроизвести" title="Нажми на видео, чтобы поставить на паузу"><span class="clip-play-symbol">${icon('play')}</span></button><button type="button" class="clip-speed-control" data-clip-action="speed" aria-label="Скорость воспроизведения ${this.playbackSpeed}×" title="Изменить скорость видео"><span class="clip-speed-value">${String(this.playbackSpeed).replace('.',',')}×</span></button><div class="clip-copy"><button class="clip-author clip-author-profile" type="button" data-person="${esc(r.user_id)}" aria-label="Открыть профиль автора ${esc(r.person?.display_name||r.person?.username||'')}">${avatar(r.person,'small')}<b>${esc(r.person?.display_name||r.person?.username||'Пользователь')}</b></button><p>${esc(r.caption)}</p>${r.user_id!==this.api.uid?`<div class="clip-creator-tools"><button type="button" data-clip-action="follow" class="${r.following?'selected':''}">${r.following?'✓ Подписки':'+ Подписаться'}</button><button type="button" data-clip-action="gift">🎁 Подарок</button></div>`:''}</div><div class="clip-actions"><button data-clip-action="sound" aria-label="${this.sound?'Выключить':'Включить'} звук">${icon(this.sound?'volume':'mute')}</button><button data-clip-action="like" class="${r.liked?'selected':''}" aria-label="Лайк" aria-pressed="${r.liked}">${icon('heart')}<span>${r.likes}</span></button><button data-clip-action="comments" aria-label="Комментарии">${icon('chats')}<span>${r.comments}</span></button><button data-clip-action="save" class="${r.saved?'selected':''}" aria-label="Сохранить" aria-pressed="${r.saved}">${icon('saved')}</button><button data-clip-action="share" aria-label="Поделиться">${icon('forward')}</button><button type="button" data-clip-action="download" class="clip-download-action" aria-label="Скачать видео" title="Скачать клип">${icon('download')}</button>${r.user_id===this.api.uid?`<button data-clip-action="delete" aria-label="Удалить свой клип">${icon('trash')}</button>`:''}</div><button class="clip-enable-sound" data-clip-action="enable-sound" hidden>Нажми, чтобы включить звук</button></article>`;
  }
  wireVideoControls(feed){
    $$('video',feed).forEach(video=>{
      if(video.dataset.rndmControls==='1')return;
      video.dataset.rndmControls='1';
      video.playbackRate=this.playbackSpeed;
      video.addEventListener('play',()=>this.updatePlaybackUI(video));
      video.addEventListener('pause',()=>this.updatePlaybackUI(video));
      video.addEventListener('loadedmetadata',()=>{video.playbackRate=this.playbackSpeed;this.updatePlaybackUI(video);});
      this.updatePlaybackUI(video);
    });
  }
  updatePlaybackUI(video){
    const card=video?.closest('.clip-card'),button=card?.querySelector('[data-clip-action="play"]');
    if(!button)return;
    button.classList.toggle('paused',video.paused);
    button.setAttribute('aria-label',video.paused?'Воспроизвести':'Пауза');
    const symbol=button.querySelector('.clip-play-symbol');
    if(symbol)symbol.innerHTML=icon(video.paused?'play':'pause');
  }
  observe(feed){
    this.observer?.disconnect();
    this.observer=new IntersectionObserver(entries=>entries.forEach(e=>{
      const v=$('video',e.target);if(!v)return;
      if(e.isIntersecting&&e.intersectionRatio>.65){
        $$('video',feed).forEach(other=>{if(other!==v)other.pause();});
        this.current=v;
        if(!this.userPaused.has(v))this.play(v);
      }else{
        v.pause();
        if(!e.isIntersecting)this.userPaused.delete(v);
      }
    }),{root:feed,threshold:[0,.65]});$$('.clip-card',feed).forEach(card=>this.observer.observe(card));
  }
  async play(v){
    v.playbackRate=this.playbackSpeed;
    v.muted=!this.sound;try{await v.play();$('.clip-enable-sound',v.parentElement).hidden=true;}
    catch(e){if(e.name==='NotAllowedError'){v.muted=true;v.play().catch(()=>{});$('.clip-enable-sound',v.parentElement).hidden=!this.sound;}else if(e.name!=='AbortError'){this.ui.toast('Браузер не воспроизводит это видео. Попробуй MP4 (H.264).');}}
    this.updatePlaybackUI(v);
  }
  async action(button){
    const card=button.closest('[data-clip-id]'),r=this.rows.find(x=>x.id===card?.dataset.clipId),action=button.dataset.clipAction;if(!r)return;
    if(this.locks.has(action+r.id))return;this.locks.add(action+r.id);button.disabled=true;
    try{
      if(action==='gift'){if(!this.ui.onGift)throw new Error('Отправка подарка временно недоступна');await this.ui.onGift(r.user_id);}
      else if(action==='follow'){
        await this.api.followUser(r.user_id,r.following);
        r.following=!r.following;
        button.textContent=r.following?'✓ Подписки':'+ Подписаться';button.classList.toggle('selected',r.following);
        if(this.feedMode==='following'&&!r.following){card.remove();this.rows=this.rows.filter(x=>x.id!==r.id);}
      }
      else if(action==='play'){
        const v=$('video',card);
        if(v.paused){this.userPaused.delete(v);await this.play(v);}
        else{this.userPaused.add(v);v.pause();}
        this.updatePlaybackUI(v);
      }
      else if(action==='speed'){
        const rates=[1,1.25,1.5,2];
        const current=rates.findIndex(rate=>Math.abs(rate-this.playbackSpeed)<.01);
        this.playbackSpeed=rates[(current+1)%rates.length];
        $$('video',this.host).forEach(v=>{v.playbackRate=this.playbackSpeed;});
        $$('[data-clip-action="speed"]',this.host).forEach(b=>{
          const label=String(this.playbackSpeed).replace('.',',')+'×';
          b.querySelector('.clip-speed-value').textContent=label;
          b.setAttribute('aria-label','Скорость воспроизведения '+label);
        });
      }
      else if(action==='sound'||action==='enable-sound'){
        this.sound=action==='enable-sound'?true:!this.sound;
        this.current=$('video',card);this.current.muted=!this.sound;
        if(!this.current.paused){
          try{await this.current.play();}catch(err){if(err.name!=='NotAllowedError'&&err.name!=='AbortError')throw err;}
        }
        $('.clip-enable-sound',card).hidden=true;
        $$('[data-clip-action="sound"]',this.host).forEach(b=>{b.innerHTML=icon(this.sound?'volume':'mute');b.setAttribute('aria-label',this.sound?'Выключить звук':'Включить звук');});
      }else if(action==='like'||action==='save'){
        const field=action==='like'?'liked':'saved',table=action==='like'?'clip_likes':'clip_saves';
        must(await (r[field]?this.sb.from(table).delete().eq('clip_id',r.id).eq('user_id',this.api.uid):this.sb.from(table).insert({clip_id:r.id,user_id:this.api.uid})));r[field]=!r[field];
        button.classList.toggle('selected',r[field]);button.setAttribute('aria-pressed',String(r[field]));if(action==='like'){r.likes+=r.liked?1:-1;$('span',button).textContent=r.likes;}
      }else if(action==='comments'){await this.comments(r);}
      else if(action==='share'){
        const url=new URL('index.html',location.href);url.searchParams.set('view','clips');url.searchParams.set('clip',r.id);
        if(navigator.share)await navigator.share({title:'RNDM Clip',url:url.href});else{await navigator.clipboard.writeText(url.href);this.ui.toast('Ссылка скопирована');}
      }else if(action==='download'){
        // Download the actual clip file, not just a link to the player.
        await this.downloadClip(r,button);
      }else if(action==='delete'){
        this.ui.confirm('Удалить клип?','Публикация исчезнет из ленты.',async()=>{const deleted=must(await this.sb.from('clips').delete().eq('id',r.id).eq('user_id',this.api.uid).select('id'));if(!deleted?.length)throw new Error('Не удалось удалить клип.');$('video',card).pause();this.observer.unobserve(card);card.remove();this.rows=this.rows.filter(x=>x.id!==r.id);this.ui.toast('Клип удалён');});
      }
    }finally{this.locks.delete(action+r.id);if(button.isConnected)button.disabled=false;}
  }
  async downloadClip(r,button){
    const url=safeURL(r.video_url);
    if(!url)throw new Error('У этого клипа нет доступного видео.');
    const isIOS=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    const original=button.innerHTML;
    button.innerHTML=icon('download')+'<span class="clip-download-wait">…</span>';
    button.setAttribute('aria-busy','true');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),180000);
    try{
      let response;
      try{response=await fetch(url,{method:'GET',mode:'cors',credentials:'omit',signal:controller.signal});}
      catch(error){
        if(error?.name==='AbortError')throw new Error('Загрузка заняла слишком много времени. Попробуй ещё раз.');
        // External hosts sometimes disallow cross-origin reads. Provide a manual option.
        this.downloadFallback(url);
        return;
      }
      if(!response.ok)throw new Error('Не удалось скачать видео (HTTP '+response.status+').');
      const maxBytes=100*1024*1024;
      const declaredSize=Number(response.headers.get('content-length')||0);
      if(declaredSize>maxBytes)throw new Error('Видео слишком большое для загрузки в приложении (лимит 100 МБ).');
      const contentType=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
      if(contentType==='text/html'||contentType==='application/json')throw new Error('Сервер вернул не видео. Попробуй открыть оригинал.');
      const blob=await response.blob();
      if(!blob.size)throw new Error('Видео пустое или недоступно.');
      if(blob.size>maxBytes)throw new Error('Видео слишком большое для загрузки в приложении (лимит 100 МБ).');
      let pathExt='';try{pathExt=new URL(url).pathname.split('.').pop().toLowerCase();}catch{}
      const extension=['mp4','mov','webm'].includes(pathExt)?pathExt:
        contentType.includes('webm')?'webm':contentType.includes('quicktime')?'mov':'mp4';
      const author=String(r.person?.username||r.person?.display_name||'video')
        .replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,26)||'video';
      const clipId=String(r.id||'clip').replace(/[^a-zA-Z0-9]/g,'').slice(0,12)||'clip';
      const name=`RNDM_${author}_${clipId}.${extension}`;
      const type=contentType.startsWith('video/')?contentType:
        extension==='webm'?'video/webm':extension==='mov'?'video/quicktime':'video/mp4';
      const file=typeof File==='function'?new File([blob],name,{type}):null;
      const objectUrl=URL.createObjectURL(blob);
      let cleaned=false;
      const cleanup=()=>{if(!cleaned){cleaned=true;URL.revokeObjectURL(objectUrl);}};
      const save=()=>{
        const anchor=document.createElement('a');anchor.href=objectUrl;
        anchor.download=name;anchor.style.display='none';
        document.body.appendChild(anchor);anchor.click();anchor.remove();
        this.ui.toast(isIOS?'Видео отправлено в загрузки. Проверь «Файлы» → «Загрузки».':'Скачивание клипа началось.');
      };
      if(isIOS){
        // iOS PWA cannot always download after awaiting a network request. Offer a
        // fresh user tap for the native file share sheet / Save to Files.
        const canShareFile=!!(file&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]}));
        const sheet=this.ui.modal('Скачать клип',`<div class="clip-download-sheet"><p>Видео готово: <b>${esc(name)}</b></p><p class="muted">Выбери «Сохранить в Файлы» в системном меню или скачай файл.</p>${canShareFile?'<button type="button" class="primary" id="clipFileShare">Сохранить / Поделиться</button>':''}<button type="button" class="secondary" id="clipFileSave">Скачать файл</button></div>`);
        const bSave=$('#clipFileSave',sheet),bShare=$('#clipFileShare',sheet);
        bSave.onclick=()=>{save();sheet.close();};
        if(bShare)bShare.onclick=async()=>{
          bShare.disabled=true;
          try{await navigator.share({files:[file],title:'Клип RNDM Chat'});sheet.close();}
          catch(error){if(error.name!=='AbortError')this.ui.toast('Не удалось открыть меню. Используй кнопку «Скачать файл».');}
          finally{if(bShare.isConnected)bShare.disabled=false;}
        };
        sheet.addEventListener('close',()=>setTimeout(cleanup,120000),{once:true});
      }else{
        save();setTimeout(cleanup,120000);
      }
    }finally{
      clearTimeout(timeout);
      if(button.isConnected){button.innerHTML=original;button.removeAttribute('aria-busy');}
    }
  }
  downloadFallback(url){
    const sheet=this.ui.modal('Скачивание клипа',`<div class="clip-download-sheet"><p>Источник видео не разрешил прямое скачивание из браузера.</p><p class="muted">Можно открыть видео отдельно и сохранить его средствами браузера.</p><a class="primary" id="clipOpenOriginal" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Открыть видео</a></div>`);
    const link=$('#clipOpenOriginal',sheet);if(link)link.addEventListener('click',()=>sheet.close());
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
  async analytics(){const data=await this.api.creatorStats();this.ui.modal('📊 Статистика клипов',`<section class="creator-stats"><p>Статистика только твоих опубликованных клипов.</p><div><article><b>${Number(data?.clips||0)}</b><span>Клипов</span></article><article><b>${Number(data?.views||0)}</b><span>Просмотров</span></article><article><b>${Number(data?.likes||0)}</b><span>Лайков</span></article><article><b>${Number(data?.comments||0)}</b><span>Комментариев</span></article><article><b>${Number(data?.saves||0)}</b><span>Сохранений</span></article></div></section>`);}
  async comments(r){
    this.current?.pause();this.ui.modal('Комментарии',`<div class="comments-list" id="clipComments"><span class="spinner"></span></div><form id="clipCommentForm" class="comment-form"><textarea name="body" maxlength="4000" rows="2" required aria-label="Комментарий" placeholder="Твой комментарий…"></textarea><button class="primary" type="submit" aria-label="Отправить">${icon('send')}</button></form><div id="clipCommentError"></div>`);
    const form=$('#clipCommentForm'),host=$('#clipComments');
    const draw=async()=>{const rows=must(await this.sb.from('clip_comments').select('*').eq('clip_id',r.id).order('created_at',{ascending:true}).limit(200))||[];const people=await this.api.profiles(rows.map(x=>x.user_id));if(!host.isConnected)return;host.innerHTML=rows.map(x=>{const p=people.find(p=>p.id===x.user_id);return `<article class="comment-row"><button type="button" class="clip-comment-author" data-person="${esc(x.user_id)}" aria-label="Открыть профиль ${esc(p?.display_name||p?.username||'пользователя')}">${avatar(p,'small')}<b>${esc(p?.display_name||p?.username||'Пользователь')}</b></button><div class="comment-content"><p>${esc(x.body)}</p></div></article>`;}).join('')||'<p class="muted">Комментариев пока нет.</p>';};
    form.onsubmit=async e=>{e.preventDefault();const input=$('textarea',form),body=input.value.trim(),button=$('button',form);if(!body||button.disabled)return;button.disabled=true;try{must(await this.sb.from('clip_comments').insert({clip_id:r.id,user_id:this.api.uid,body}).select().single());input.value='';r.comments++;const count=this.host?.querySelector(`[data-clip-id="${CSS.escape(r.id)}"] [data-clip-action="comments"] span`);if(count)count.textContent=r.comments;await draw();}catch(err){if(form.isConnected)$('#clipCommentError').innerHTML=`<div class="notice error-notice">${esc(errorText(err))}</div>`;}finally{if(button.isConnected)button.disabled=false;}};
    try{await draw();}catch(e){if(host.isConnected)host.innerHTML=`<div class="notice error-notice">${esc(errorText(e))}</div>`;}
  }
}
