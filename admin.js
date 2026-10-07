import {$,$$,esc,icon,avatar,safeURL,errorText} from './core.js';
const must=r=>{if(r.error)throw r.error;return r.data;};
export const staffRole=role=>['owner','admin','moderator'].includes(role);
const rank={user:0,premium:10,verified:20,moderator:30,admin:40,owner:50};
const roleNames={user:'Пользователь',premium:'Premium',verified:'Подтверждённый',moderator:'Модератор',admin:'Администратор',owner:'Владелец'};
const kinds={clips:'Клипы',clip_comments:'Комментарии к клипам',channels:'Каналы',channel_posts:'Публикации каналов',channel_comments:'Комментарии каналов',stories:'Истории'};
const fields={clips:{caption:['Описание',2000]},clip_comments:{body:['Комментарий',1000]},channels:{name:['Название',80],description:['Описание',4000]},channel_posts:{body:['Текст',4000]},channel_comments:{body:['Комментарий',1000]},stories:{body:['Текст',1000]}};
const cleanSearch=s=>String(s||'').trim().replace(/^@/,'').replace(/[,()%\\]/g,' ').slice(0,80).trim();
const date=s=>s?new Date(s).toLocaleString('ru-RU'):'—';
function message(e){if(/staff required|admin required|owner required|permission denied/i.test(e?.message||''))return 'Недостаточно прав. Обнови страницу или войди в аккаунт администратора.';return errorText(e);}
export class Admin {
  constructor(api,ui){this.api=api;this.sb=api.sb;this.ui=ui;this.epoch=0;this.requests=0;this.locks=new Set();this.tab='users';}
  pauseMedia(){if(this.host)$$('video',this.host).forEach(video=>video.pause());}
  stop(){++this.epoch;++this.requests;this.pauseMedia();if(this.host)this.host.onclick=null;this.host=null;}
  current(token){return this.host?.isConnected&&token===this.epoch;}
  async open(host){
    this.stop();this.host=host;const token=this.epoch;host.innerHTML='<div class="empty-messages"><span class="spinner"></span><p>Проверяем доступ…</p></div>';
    try{
      const profile=await this.api.profile();if(!this.current(token))return;
      this.role=profile.app_role||'user';
      if(!staffRole(this.role))throw new Error('Админка доступна только владельцу, администраторам и модераторам.');
      // This flag is a UI readiness switch, never an authorization mechanism.
      // Every write is still authorized by its server RPC.
      this.writeReady=window.RNDM_CONFIG.adminWriteEnabled===true;
      this.offset=0;this.search='';this.kind='clips';this.reportFilter='open';this.tab='users';
      host.innerHTML=`<header class="chat-header"><button class="icon-button back-mobile" data-action="back" aria-label="К чатам">${icon('back')}</button><h2>Админка</h2><span class="admin-role">${esc(roleNames[this.role])}</span><div class="header-tools"><button class="secondary" data-admin-action="refresh">Обновить</button></div></header><section class="admin-pane"><div class="admin-kpis" id="adminStats"></div><nav class="admin-tabs" aria-label="Разделы админки">${Object.entries({users:'Пользователи',reports:'Жалобы',content:'Публикации',audit:'Журнал'}).map(([key,label])=>`<button data-admin-tab="${key}" class="${key==='users'?'active':''}">${label}</button>`).join('')}</nav>${!this.writeReady?'<div class="notice admin-readiness">Блокировки, назначение ролей и удаление пока выключены. Можно просматривать пользователей и журнал, обрабатывать жалобы и редактировать публикации.</div>':''}<div id="adminPanel"></div></section>`;
      host.onclick=event=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.adminTab)this.switchTab(b.dataset.adminTab);else if(b.dataset.adminAction)this.action(b).catch(e=>this.ui.toast(message(e)));};
      this.stats(token).catch(()=>{});await this.switchTab('users');
    }catch(e){if(this.current(token))host.innerHTML=`<div class="empty-messages">${icon('shield')}<h3>Нет доступа</h3><p class="muted">${esc(message(e))}</p><button class="secondary" data-action="back">Вернуться к чатам</button></div>`;}
  }
  async stats(token=this.epoch){
    const items=[['profiles','Пользователей'],['profiles','Заблокировано','is_banned',true],['reports','Открытых жалоб','status','open'],['clips','Клипов'],['rndm_channels','Каналов']];
    const results=await Promise.allSettled(items.map(async([table,,field,value])=>{let q=this.sb.from(table).select('id',{count:'exact',head:true});if(field)q=q.eq(field,value);const r=await q;if(r.error)throw r.error;return r.count??0;}));
    if(this.current(token)&&$('#adminStats',this.host))$('#adminStats',this.host).innerHTML=items.map(([,label],i)=>`<article><b>${results[i].status==='fulfilled'?results[i].value.toLocaleString('ru-RU'):'—'}</b><span>${label}</span></article>`).join('');
  }
  async switchTab(tab){
    if(!this.host||!['users','reports','content','audit'].includes(tab))return;this.tab=tab;this.offset=0;this.search='';++this.requests;
    $$('[data-admin-tab]',this.host).forEach(b=>b.classList.toggle('active',b.dataset.adminTab===tab));
    const panel=$('#adminPanel',this.host);this.pauseMedia();panel.innerHTML=`<form class="admin-toolbar" id="adminFilter">${tab==='content'?`<label class="field">Раздел<select id="adminKind">${Object.entries(kinds).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>`:''}${tab==='reports'?'<label class="field">Статус<select id="adminReportFilter"><option value="open">Новые</option><option value="reviewing">В работе</option><option value="resolved">Решённые</option><option value="rejected">Отклонённые</option><option value="all">Все</option></select></label>':''}${tab==='users'||tab==='content'?'<label class="field admin-search">Поиск<input id="adminSearch" maxlength="80" placeholder="'+(tab==='users'?'Имя или @username':'Текст публикации или ID клипа')+'"></label><button class="primary" type="submit">Найти</button>':''}</form><div id="adminList"></div><div class="admin-pagination" id="adminPagination"></div>`;
    if($('#adminKind',panel)){$('#adminKind',panel).value=this.kind;$('#adminKind',panel).onchange=()=>{this.kind=$('#adminKind',panel).value;this.offset=0;this.load().catch(()=>{});};}
    if($('#adminReportFilter',panel)){$('#adminReportFilter',panel).value=this.reportFilter;$('#adminReportFilter',panel).onchange=()=>{this.reportFilter=$('#adminReportFilter',panel).value;this.offset=0;this.load().catch(()=>{});};}
    $('#adminFilter',panel).onsubmit=e=>{e.preventDefault();this.search=cleanSearch($('#adminSearch',panel)?.value);this.offset=0;this.load().catch(()=>{});};
    await this.load();
  }
  async load(){
    if(!this.host)return;const token=this.epoch,request=++this.requests,tab=this.tab,host=$('#adminList',this.host),pagination=$('#adminPagination',this.host);if(!host)return;
    this.pauseMedia();host.innerHTML='<div class="sidebar-empty"><span class="spinner"></span><p>Загружаем…</p></div>';pagination.innerHTML='';
    try{
      let rows,count;
      if(tab==='users'){
        let q=this.sb.from('profiles').select('id,username,display_name,avatar_url,bio,app_role,is_verified,is_premium,reputation,xp,stars,is_banned,ban_reason,banned_until,last_seen',{count:'exact'}).order('last_seen',{ascending:false,nullsFirst:false}).order('id',{ascending:true});
        if(this.search)q=q.or(`username.ilike.%${this.search}%,display_name.ilike.%${this.search}%`);
        const r=await q.range(this.offset,this.offset+24);rows=must(r)||[];count=r.count;
      }else if(tab==='reports'){
        let q=this.sb.from('reports').select('id,reason,details,status,created_at,target_user_id,reporter_id',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false});if(this.reportFilter!=='all')q=q.eq('status',this.reportFilter);
        const r=await q.range(this.offset,this.offset+24);rows=must(r)||[];count=r.count;
      }else if(tab==='content'){
        rows=(must(await this.sb.rpc('admin_list_content',{content_kind:this.kind,search_text:this.search,max_rows:100}))||[]).map(r=>typeof r==='string'?JSON.parse(r):r);count=rows.length;
      }else{
        const r=await this.sb.from('admin_audit').select('id,actor_id,target_user_id,action,details,created_at',{count:'exact'}).order('created_at',{ascending:false}).order('id',{ascending:false}).range(this.offset,this.offset+24);rows=must(r)||[];count=r.count;
      }
      if(!this.current(token)||request!==this.requests)return;this.rows=rows;this.total=count??rows.length;
      host.innerHTML=rows.map(r=>tab==='users'?this.userCard(r):tab==='reports'?this.reportCard(r):tab==='content'?this.contentCard(r):this.auditCard(r)).join('')||'<div class="sidebar-empty"><p>Записей не найдено.</p></div>';
      if(tab!=='content')pagination.innerHTML=`<button class="secondary" data-admin-action="prev" ${this.offset===0?'disabled':''}>Назад</button><span>${this.total?this.offset+1:0}–${this.offset+rows.length} из ${this.total}</span><button class="secondary" data-admin-action="next" ${this.offset+rows.length>=this.total?'disabled':''}>Далее</button>`;
      else if(rows.length===100)pagination.innerHTML='<p class="muted">Показаны последние 100 записей. Уточни поиск, чтобы найти нужную.</p>';
    }catch(e){if(this.current(token)&&request===this.requests)host.innerHTML=`<div class="notice error-notice">${esc(message(e))}</div><button class="secondary" data-admin-action="refresh">Повторить</button>`;}
  }
  userCard(p){
    const canBan=this.writeReady&&p.id!==this.api.uid&&(p.is_banned||rank[this.role]>(rank[p.app_role]??0));
    const canRole=this.writeReady&&['owner','admin'].includes(this.role)&&p.id!==this.api.uid&&(this.role==='owner'||!['owner','admin'].includes(p.app_role));
    const canEdit=['owner','admin'].includes(this.role)&&(this.role==='owner'||!['owner','admin'].includes(p.app_role));
    return `<article class="admin-card admin-user">${avatar(p)}<div class="admin-copy"><h3>${esc(p.display_name||p.username||'Пользователь')}</h3><p>@${esc(p.username)} · ${esc(roleNames[p.app_role]||p.app_role)}</p><small>ID: ${esc(p.id)}</small><div class="admin-user-badges">${p.is_verified?'<span>✓ Verified</span>':''}${p.is_premium?'<span>★ Premium</span>':''}<span>⭐ ${Number(p.stars||0).toLocaleString('ru-RU')}</span><span>XP ${Number(p.xp||0).toLocaleString('ru-RU')}</span></div>${p.bio?`<p class="admin-user-bio">${esc(p.bio)}</p>`:''}${p.is_banned?`<p class="admin-ban">Заблокирован${p.banned_until?' до '+date(p.banned_until):' бессрочно'}<br>${esc(p.ban_reason||'Причина не указана')}</p>`:''}</div><div class="admin-actions"><button class="secondary" data-admin-action="user-edit" data-id="${esc(p.id)}" ${canEdit?'':'disabled'}>Редактировать</button>${this.role==='owner'?`<button class="secondary" data-admin-action="email" data-id="${esc(p.id)}">Почта</button>`:''}<button class="secondary" data-admin-action="ban" data-id="${esc(p.id)}" ${canBan?'':'disabled'}>${p.is_banned?'Разблокировать':'Заблокировать'}</button><button class="secondary" data-admin-action="role" data-id="${esc(p.id)}" ${canRole?'':'disabled'}>Роль</button></div></article>`;
  }
  reportCard(r){return `<article class="admin-card"><h3>Жалоба #${esc(r.id)} · ${esc(r.reason)}</h3><p>${esc(r.details)}</p><small>${date(r.created_at)} · ${esc({open:'Новая',reviewing:'В работе',resolved:'Решена',rejected:'Отклонена'}[r.status]||r.status)}<br>От: ${esc(r.reporter_id)} · На: ${esc(r.target_user_id||'публикацию')}</small><div class="admin-actions">${[['reviewing','В работу'],['resolved','Решена'],['rejected','Отклонить']].map(([key,label])=>`<button class="secondary" data-admin-action="report" data-id="${esc(r.id)}" data-status="${key}" ${r.status===key?'disabled':''}>${label}</button>`).join('')}</div></article>`;}
  contentCard(r){const p=r.payload||{},url=safeURL(p.video_url||p.media_url||p.attachment_url),video=p.video_url||p.media_type==='video'||p.attachment_type?.startsWith('video/'),image=p.media_type==='image'||p.attachment_type?.startsWith('image/');
    return `<article class="admin-card"><h3>${esc(r.title||'Без названия')}</h3><p>${esc(r.subtitle)}</p><small>ID: ${esc(r.id)}</small>${url&&video?`<video class="admin-media" src="${esc(url)}" controls playsinline preload="none"></video>`:url&&image?`<img class="admin-media" src="${esc(url)}" loading="lazy" alt="Публикация">`:''}<div class="admin-actions">${['owner','admin'].includes(this.role)?`<button class="secondary" data-admin-action="edit" data-id="${esc(r.id)}">Редактировать</button>`:''}<button class="secondary danger" data-admin-action="delete" data-id="${esc(r.id)}" ${this.writeReady&&(this.role!=='moderator'||this.kind!=='channels')?'':'disabled'}>Удалить</button></div></article>`;}
  auditCard(r){return `<article class="admin-card"><h3>${esc(r.action)}</h3><small>${date(r.created_at)}<br>Автор: ${esc(r.actor_id||'—')} · Пользователь: ${esc(r.target_user_id||'—')}</small><pre class="admin-details">${esc(JSON.stringify(r.details||{},null,2))}</pre></article>`;}
  async mutate(key,button,fn){
    if(this.locks.has(key))return;const token=this.epoch;this.locks.add(key);if(button)button.disabled=true;
    try{await fn();this.ui.toast('Изменения сохранены');if(this.current(token)){await this.load();this.stats(token).catch(()=>{});}}
    finally{this.locks.delete(key);if(button?.isConnected)button.disabled=false;}
  }
  requireWrite(){if(!this.writeReady)throw new Error('Блокировки, роли и удаление пока выключены.');}
  async action(button){
    const action=button.dataset.adminAction,id=button.dataset.id;
    if(action==='refresh'){await this.load();this.stats().catch(()=>{});return;}
    if(action==='prev'||action==='next'){this.offset=Math.max(0,this.offset+(action==='next'?25:-25));await this.load();return;}
    const row=this.rows?.find(r=>String(r.id)===id);if(!row)return;
    if(action==='user-edit'){this.editUser(row);return;}
    if(action==='email'){await this.editEmail(row);return;}
    if(action==='report'){const status=button.dataset.status;await this.mutate('report:'+id,button,()=>this.sb.rpc('admin_resolve_report',{report_id:Number(id),new_status:status}).then(must));return;}
    if(action==='edit'){this.edit(row);return;}
    this.requireWrite();
    if(action==='delete'){
      const kind=this.kind;this.ui.confirm('Удалить публикацию?',`${kinds[kind]}: ${row.title||id}. Удаление нельзя отменить.`,()=>this.mutate('delete:'+kind+id,null,async()=>{const r=must(await this.sb.rpc('admin_delete_content',{content_kind:kind,content_id:id}));if(!r?.affected)throw new Error('Публикация не найдена или уже удалена.');}));return;
    }
    if(action==='ban'){
      if(row.is_banned){this.ui.confirm('Разблокировать пользователя?',row.display_name||row.username,()=>this.mutate('ban:'+id,null,()=>this.sb.rpc('admin_unban_user',{target:id}).then(must)),'Разблокировать');return;}
      this.ui.modal('Заблокировать пользователя',`<form id="adminBanForm"><p>${esc(row.display_name||row.username)}</p><label class="field">Причина<textarea name="reason" rows="3" maxlength="500" required></textarea></label><label class="field">Срок<select name="hours"><option value="24">24 часа</option><option value="168">7 дней</option><option value="720">30 дней</option><option value="0">Бессрочно</option></select></label><div id="adminFormError"></div><button class="primary" type="submit">Заблокировать</button></form>`);
      const form=$('#adminBanForm');form.onsubmit=e=>{e.preventDefault();const fd=new FormData(form),reason=String(fd.get('reason')).trim();if(!reason)return;this.formWrite(form,()=>this.sb.rpc('admin_ban_user',{target:id,reason,hours:Number(fd.get('hours'))}).then(must));};return;
    }
    if(action==='role'){
      const options=this.role==='owner'?['user','premium','verified','moderator','admin','owner']:['user','premium','verified','moderator'];
      this.ui.modal('Изменить роль',`<form id="adminRoleForm"><p>${esc(row.display_name||row.username)}</p><label class="field">Роль<select name="role">${options.map(r=>`<option value="${r}" ${r===row.app_role?'selected':''}>${roleNames[r]}</option>`).join('')}</select></label><p class="muted">Администратор получает доступ к управлению сайтом.</p><div id="adminFormError"></div><button class="primary" type="submit">Сохранить роль</button></form>`);
      const form=$('#adminRoleForm');form.onsubmit=e=>{e.preventDefault();const role=String(new FormData(form).get('role'));if(role===row.app_role)return;this.formWrite(form,()=>this.sb.rpc('admin_set_role',{target:id,new_role:role}).then(must));};
    }
  }
  editUser(row){
    if(!['owner','admin'].includes(this.role))return;
    if(this.role!=='owner'&&['owner','admin'].includes(row.app_role)){this.ui.toast('Только Owner может редактировать администратора.');return;}
    this.ui.modal('Редактировать пользователя',`<form id="adminUserEditForm"><label class="field">Имя<input name="display_name" maxlength="60" value="${esc(row.display_name||'')}" required></label><label class="field">@username<input name="username" maxlength="32" pattern="[a-zA-Z0-9_]{3,32}" value="${esc(row.username||'')}" required></label><label class="field">О себе<textarea name="bio" rows="3" maxlength="500">${esc(row.bio||'')}</textarea></label><label class="field">URL аватара<input name="avatar_url" maxlength="2000" value="${esc(row.avatar_url||'')}"></label><div class="admin-check-grid"><label><input type="checkbox" name="is_verified" ${row.is_verified?'checked':''}> Verified</label><label><input type="checkbox" name="is_premium" ${row.is_premium?'checked':''}> Premium</label></div><div class="admin-number-grid"><label class="field">Репутация<input name="reputation" type="number" step="1" value="${Number(row.reputation||0)}"></label><label class="field">XP<input name="xp" type="number" min="0" step="1" value="${Number(row.xp||0)}"></label><label class="field">Звёзды<input name="stars" type="number" min="0" step="1" value="${Number(row.stars||0)}"></label></div><div id="adminFormError"></div><button class="primary" type="submit">Сохранить пользователя</button></form>`);
    const form=$('#adminUserEditForm');
    form.onsubmit=e=>{e.preventDefault();const fd=new FormData(form);const patch={display_name:String(fd.get('display_name')||'').trim(),username:String(fd.get('username')||'').trim().toLowerCase(),bio:String(fd.get('bio')||''),avatar_url:String(fd.get('avatar_url')||'').trim(),is_verified:fd.has('is_verified'),is_premium:fd.has('is_premium'),reputation:Number(fd.get('reputation')||0),xp:Number(fd.get('xp')||0),stars:Number(fd.get('stars')||0)};this.formWrite(form,()=>this.sb.rpc('admin_update_user_profile',{target:row.id,patch}).then(must));};
  }
  async editEmail(row){
    if(this.role!=='owner')return;
    this.ui.modal('Почта пользователя',`<form id="adminEmailForm"><p class="muted">${esc(row.display_name||row.username)} · @${esc(row.username)}</p><label class="field">Email<input name="email" type="email" autocomplete="off" placeholder="Загружаем…" disabled required></label><div id="adminFormError"></div><button class="primary" type="submit" disabled>Сохранить email</button></form>`);
    const form=$('#adminEmailForm'),input=$('[name=email]',form),submit=$('[type=submit]',form);
    try{const r=await this.sb.functions.invoke('owner-user-email',{body:{action:'get',target_id:row.id}});if(r.error)throw r.error;if(r.data?.error)throw new Error(r.data.error);input.value=r.data?.email||'';input.placeholder='user@example.com';input.disabled=false;submit.disabled=false;}
    catch(e){if(form.isConnected)$('#adminFormError',form).innerHTML=`<div class="notice error-notice">${esc(message(e))}</div>`;return;}
    form.onsubmit=e=>{e.preventDefault();const email=String(new FormData(form).get('email')||'').trim().toLowerCase();this.formWrite(form,async()=>{const r=await this.sb.functions.invoke('owner-user-email',{body:{action:'update',target_id:row.id,email}});if(r.error)throw r.error;if(r.data?.error)throw new Error(r.data.error);});};
  }
  edit(row){
    const kind=this.kind,available=fields[kind]||{},payload=row.payload||{};if(!['owner','admin'].includes(this.role))return;
    this.ui.modal('Редактировать публикацию',`<form id="adminEditForm">${Object.entries(available).map(([key,[label,max]])=>`<label class="field">${label}<textarea name="${key}" rows="${key==='name'?1:4}" maxlength="${max}">${esc(payload[key]||'')}</textarea></label>`).join('')}<div id="adminFormError"></div><button class="primary" type="submit">Сохранить</button></form>`);
    const form=$('#adminEditForm');form.onsubmit=e=>{e.preventDefault();const patch=Object.fromEntries(new FormData(form));if(kind==='channels'&&!patch.name.trim()){this.ui.toast('Название канала не может быть пустым.');return;}this.formWrite(form,async()=>{const r=must(await this.sb.rpc('admin_update_content',{content_kind:kind,content_id:String(row.id),patch}));if(!r?.affected)throw new Error('Публикация не найдена или уже удалена.');});};
  }
  async formWrite(form,fn){const button=$('[type=submit]',form),token=this.epoch;if(button.disabled)return;button.disabled=true;
    try{await fn();this.ui.toast('Изменения сохранены');if(form.isConnected)this.ui.close();if(this.current(token)){await this.load();this.stats(token).catch(()=>{});}}
    catch(e){if(form.isConnected)$('#adminFormError',form).innerHTML=`<div class="notice error-notice">${esc(message(e))}</div>`;}
    finally{if(button.isConnected)button.disabled=false;}
  }
}
