import {esc,icon,safeURL,errorText} from './core.js?v=59.1.0';
import {giftArt} from './gift-art.js?v=59.1.0';

const must=({data,error})=>{if(error)throw error;return data;};
const money=n=>Number(n||0).toLocaleString('ru-RU');
const dt=s=>s?new Date(s).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'}):'—';
const secureBoosty=url=>{const safe=safeURL(url);try{const u=new URL(safe);return u.protocol==='https:'&&u.hostname==='boosty.to'&&u.pathname.length>1?safe:'';}catch{return '';}};
const statusName={pending:'На проверке',approved:'Подтверждена',rejected:'Отклонена'};

export class DonateHub {
 constructor(api,{toast,onWallet,profile}){this.api=api;this.sb=api.sb;this.toast=toast;this.onWallet=onWallet;this.getProfile=profile;this.host=null;this.busy=false;this.lastPrize=null;this.click=e=>this.handleClick(e);this.submit=e=>this.handleSubmit(e);}
 stop(){if(this.host){this.host.removeEventListener('click',this.click);this.host.removeEventListener('submit',this.submit);}this.host=null;}
 async open(host){
   this.stop();this.host=host;host.addEventListener('click',this.click);host.addEventListener('submit',this.submit);
   host.innerHTML='<header class="chat-header"><button type="button" class="icon-button back-mobile" data-action="back" aria-label="К чатам">'+icon('back')+'</button><div class="header-title"><h2>💜 Поддержать RNDM</h2><p>Boosty · подарки · кейсы</p></div><button class="secondary" data-donate="refresh">Обновить</button></header><div class="donate-loading"><span class="spinner"></span> Загружаем поддержку проекта…</div>';
   const results=await Promise.allSettled([
    this.sb.rpc('rndm_donation_public'),
    this.sb.from('rndm_donation_requests').select('id,reference,status,created_at,decided_at,awarded_stars,subscription_month').eq('user_id',this.api.uid).order('created_at',{ascending:false}).limit(12),
    this.sb.from('rndm_case_types').select('id,name,emoji,price,common_pct,rare_pct,exclusive_pct').eq('active',true).order('sort_order'),
    this.sb.from('rndm_case_inventory').select('id,gift_id,case_id,acquired_at,exchanged_at,transferred_at').eq('owner_id',this.api.uid).is('exchanged_at',null).order('acquired_at',{ascending:false}).limit(60),
    this.sb.from('rndm_gift_catalog').select('id,name,emoji,rarity,case_only').order('sort_order'),
    this.api.starsWallet(),
    this.getProfile()?.app_role==='owner'?this.sb.rpc('rndm_donation_owner_settings'):Promise.resolve({data:null,error:null}),
    this.getProfile()?.app_role==='owner'?this.sb.rpc('rndm_donation_admin_list',{p_limit:50}):Promise.resolve({data:[],error:null})
   ]);
   if(this.host!==host)return;
   const read=(n,fallback)=>results[n].status==='fulfilled'&&!results[n].value.error?results[n].value.data:fallback;
   const donation=read(0,{url:'',label:'Поддержать RNDM',enabled:false});
   const requests=read(1,[])||[],cases=read(2,[])||[],inventory=read(3,[])||[],catalog=read(4,[])||[];
   const wallet=results[5].status==='fulfilled'?(results[5].value||{balance:0}):{balance:0};const owner=read(6,{}),allRequests=read(7,[])||[];
   const errors=results.flatMap((part,i)=>part.status==='rejected'?[String(part.reason)]:part.value?.error?[`Раздел ${i+1}: ${errorText(part.value.error)}`]:[]);
   host.innerHTML=this.view({donation,requests,cases,inventory,catalog,wallet,owner,allRequests,errors});
 }
 view({donation,requests,cases,inventory,catalog,wallet,owner,allRequests,errors}){
  const href=donation.enabled?secureBoosty(donation.url):'';
  const gifts=Object.fromEntries(catalog.map(item=>[item.id,item]));
  const isOwner=this.getProfile()?.app_role==='owner';
  const reqRows=requests.map(r=>`<div class="donate-line"><span><b>${esc(r.reference)}</b><small>${dt(r.created_at)}</small></span><span class="donate-status ${esc(r.status)}">${esc(statusName[r.status]||r.status)}${r.status==='approved'?' · +'+money(r.awarded_stars)+' ⭐':''}</span></div>`).join('');
  const caseRows=cases.map(c=>`<article class="donate-case"><div class="donate-case-emoji">${giftArt({id:"gift_box",emoji:c.emoji,name:c.name})}</div><h3>${esc(c.name)}</h3><strong>${money(c.price)} ⭐</strong><p>Обычный ${Number(c.common_pct)}% · Редкий ${Number(c.rare_pct)}% · Эксклюзив ${Number(c.exclusive_pct)}%</p><button type="button" class="primary" data-donate="open-case" data-id="${esc(c.id)}" data-price="${Number(c.price)}" data-name="${esc(c.name)}" ${Number(wallet.balance||0)<Number(c.price)?'disabled title="Недостаточно звёзд"':''}>Открыть кейс</button></article>`).join('');
  const inventoryRows=inventory.map(item=>{const g=gifts[item.gift_id]||{name:item.gift_id,emoji:'🎁'};return `<div class="donate-inventory-item"><span class="donate-item-emoji">${giftArt(g)}</span><span class="donate-item-name"><b>${esc(g.name)}</b><small>${g.case_only?'✦ Эксклюзивный предмет':esc(g.rarity||'Обычный')} · ${dt(item.acquired_at)}</small></span><button type="button" class="secondary" data-donate="send-case" data-id="${esc(item.id)}" data-name="${esc(g.name)}">Подарить</button></div>`;}).join('');
  const caseExclusive=catalog.filter(g=>g.case_only).map(g=>`<span class="donate-exclusive">${giftArt(g)}<b>${esc(g.name)}</b></span>`).join('');
  const approval=allRequests.filter(r=>r.status==='pending').map(r=>`<div class="donate-review"><div><b>${esc(r.username||r.display_name||'Пользователь')}</b><small>${esc(r.reference)} · ${dt(r.created_at)}</small><p>${esc(r.comment||'Без комментария')}</p></div><div class="donate-review-actions"><button type="button" class="primary" data-donate="approve" data-id="${esc(r.id)}">+1000 ⭐</button><button type="button" class="secondary" data-donate="reject" data-id="${esc(r.id)}">Отклонить</button></div></div>`).join('');
  return `<header class="chat-header"><button type="button" class="icon-button back-mobile" data-action="back" aria-label="К чатам">${icon('back')}</button><div class="header-title"><h2>💜 Донат и кейсы</h2><p>Поддержи развитие RNDM Chat</p></div><button type="button" class="secondary" data-donate="refresh">↻</button></header>
  <div class="donate-page">
   <section class="donate-hero"><div class="donate-hero-glow" aria-hidden="true">✦</div><span class="donate-kicker">ПОДДЕРЖКА RNDM CHAT</span><h1>Больше возможностей.<br><em>Больше общения.</em></h1><p>Подписка на Boosty помогает развивать мессенджер, а подтверждённая подписка 1000 ₽ даёт бонус 1000 RNDM Stars.</p><div class="donate-hero-tags"><span>⭐ 1000 Stars</span><span>💜 Boosty</span><span>🔒 Проверка владельцем</span></div>
   ${href?`<a class="donate-boosty-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer">💜 Перейти на Boosty ↗</a>`:'<div class="donate-unconfigured">Ссылка Boosty ещё не подтверждена владельцем. Донаты временно недоступны.</div>'}
   </section>
   ${errors.length?`<div class="donate-notice">${errors.map(esc).join('<br>')}</div>`:''}
   <section class="donate-section"><div class="donate-section-heading"><div><h2>💳 Подписка и бонус</h2><p>После оплаты и проверки твоей подписки</p></div><span class="donate-mark">1000 ⭐</span></div>
    <div class="donate-benefits"><div><strong>1000 ₽</strong><small>подписка / месяц</small></div><div><strong>1000 ⭐</strong><small>бонус за оплаченный месяц</small></div></div>
    <p class="donate-fineprint">Оплата происходит только на Boosty. Звёзды не начисляются автоматически по скриншоту и не обмениваются на деньги. Подписку и сумму владелец проверяет вручную.</p>
    <form id="donateRequestForm" class="donate-form"><label class="field">ID платежа или подписки Boosty<input name="reference" maxlength="120" minlength="6" placeholder="Укажи номер оплаченной подписки" required ${href?'':'disabled'}></label><label class="field">Комментарий для проверки (необязательно)<textarea name="comment" rows="2" maxlength="400" placeholder="Boosty-ник и месяц оплаты" ${href?'':'disabled'}></textarea></label><button class="primary" type="submit" ${href?'':'disabled'}>Отправить на проверку</button><small>Не присылай пароли, номера карт, паспорт или полный чек.</small></form>
    <div class="donate-history"><h3>Мои заявки</h3>${reqRows||'<p class="muted">Заявок пока нет.</p>'}</div>
   </section>
   <section class="donate-section"><div class="donate-section-heading"><div><h2>🎁 Три кейса</h2><p>Игровые звёзды · вероятности открыты</p></div><button type="button" class="secondary" data-nav="stars">Баланс: ${money(wallet.balance)} ⭐</button></div><div class="donate-cases">${caseRows||'<p class="muted">Кейсы пока недоступны.</p>'}</div><p class="donate-fineprint">Содержимое выбирает сервер. Открытие расходует звёзды и не гарантирует редкий приз. Подарки нельзя обменять на реальные деньги.</p></section>
   ${this.lastPrize?`<section class="donate-prize" role="status"><span class="donate-prize-visual">${giftArt(this.lastPrize)}</span><div><b>Получено: ${esc(this.lastPrize.name)}</b><small>${this.lastPrize.exclusive?'✦ Эксклюзив!':'Предмет добавлен в коллекцию'}</small></div><button type="button" class="secondary" data-donate="clear-prize">✕</button></section>`:''}
   <section class="donate-section"><div class="donate-section-heading"><div><h2>✨ Эксклюзивные подарки</h2><p>Их нельзя купить отдельно — только найти в кейсах</p></div></div><div class="donate-exclusives">${caseExclusive||'<p class="muted">В каталоге пока нет эксклюзивов.</p>'}</div></section>
   <section class="donate-section"><div class="donate-section-heading"><div><h2>🎒 Моя коллекция</h2><p>Подарки, полученные из кейсов</p></div></div><div class="donate-inventory">${inventoryRows||'<p class="muted">Пока пусто. Открой кейс, чтобы найти первый подарок.</p>'}</div></section>
   ${isOwner?`<section class="donate-section donate-owner"><div class="donate-section-heading"><div><h2>👑 Управление донатами — Owner</h2><p>Настрой свою ссылку и подтверждай реальные платежи</p></div></div>
    <form id="donateSettingsForm" class="donate-form"><label class="field">Твоя страница Boosty<input name="url" type="url" placeholder="https://boosty.to/твой_аккаунт" value="${esc(owner?.url||'')}" maxlength="500"></label><label class="field">Название кнопки<input name="label" maxlength="60" value="${esc(owner?.label||'Поддержать RNDM')}"></label><button class="primary" type="submit">Сохранить и подтвердить ссылку</button><small>Проверь, что эта страница Boosty принадлежит тебе. Чтобы отключить донаты, очисти ссылку и сохрани.</small></form><h3>Ожидают проверки</h3>${approval||'<p class="muted">Новых заявок нет.</p>'}
   </section>`:''}
  </div>`;
 }
 async run(key,task){if(this.busy)return;this.busy=true;try{await task();}catch(e){this.toast(errorText(e));}finally{this.busy=false;}}
 async handleClick(event){const b=event.target.closest('[data-donate]');if(!b||!this.host?.contains(b))return;const action=b.dataset.donate;
  if(action==='refresh'){await this.run('refresh',()=>this.open(this.host));return;}
  if(action==='clear-prize'){this.lastPrize=null;await this.open(this.host);return;}
  if(action==='open-case'){
   const id=b.dataset.id,price=Number(b.dataset.price),name=b.dataset.name;
   if(!['basic','premium','legendary'].includes(id))return;
   if(!window.confirm(`Открыть кейс «${name}» за ${price} ⭐? Приз случайный, расходы вернуть нельзя.`))return;
   await this.run('case',async()=>{const r=must(await this.sb.rpc('rndm_case_open',{p_case:id}));this.lastPrize={gift_id:r.gift_id,name:r.name,emoji:r.emoji,exclusive:!!r.exclusive};this.toast(`${r.emoji} ${r.name} — добавлено в коллекцию`);await this.open(this.host);});return;
  }
  if(action==='send-case'){
   const item=b.dataset.id,name=b.dataset.name;const raw=window.prompt(`Кому подарить «${name}»? Введи точный @username:`, '');if(raw===null)return;
   const username=String(raw||'').trim().replace(/^@/,'').toLowerCase();if(!/^[a-z0-9_]{3,15}$/.test(username)){this.toast('Укажи точный @username');return;}
   await this.run('send',async()=>{const result=await this.sb.from('rndm_public_profiles').select('id,username').eq('username',username).maybeSingle();const target=must(result);if(!target)throw new Error('Получатель не найден');if(target.id===this.api.uid)throw new Error('Нельзя отправить самому себе');if(!window.confirm(`Отправить «${name}» пользователю @${username}?`))return;must(await this.sb.rpc('rndm_case_send',{p_item:item,p_target:target.id,p_note:'Подарок из кейса RNDM'}));this.toast('Подарок отправлен');await this.open(this.host);});return;
  }
  if(action==='approve'||action==='reject'){
   if(this.getProfile()?.app_role!=='owner')return;
   const yes=action==='approve',id=b.dataset.id;
   if(!window.confirm(yes?'Подтверждаешь, что нашёл этот платёж на СВОЕЙ странице Boosty и подписка действительна? Начислим пользователю 1000 ⭐.':'Отклонить заявку?'))return;
   await this.run('review',async()=>{must(await this.sb.rpc('rndm_donation_admin_decide',{p_id:id,p_approve:yes}));this.toast(yes?'Подтверждено, 1000 ⭐ зачислены':'Заявка отклонена');await this.open(this.host);});return;
  }
 }
 async handleSubmit(event){const form=event.target;if(!['donateRequestForm','donateSettingsForm'].includes(form.id))return;event.preventDefault();
  if(form.id==='donateRequestForm'){
   const fd=new FormData(form);await this.run('submit',async()=>{must(await this.sb.rpc('rndm_donation_submit',{p_reference:String(fd.get('reference')||'').trim(),p_comment:String(fd.get('comment')||'').trim()}));this.toast('Заявка отправлена Owner на проверку');await this.open(this.host);});
  }else if(form.id==='donateSettingsForm'&&this.getProfile()?.app_role==='owner'){
   const fd=new FormData(form),url=String(fd.get('url')||'').trim(),label=String(fd.get('label')||'').trim();
   if(url&&!secureBoosty(url)){this.toast('Нужна ссылка на страницу boosty.to');return;}
   if(url&&!window.confirm(`Подтверди, что страница ${url} принадлежит тебе. Открыть донаты для пользователей?`))return;
   await this.run('settings',async()=>{must(await this.sb.rpc('rndm_donation_admin_settings',{p_url:url,p_label:label}));this.toast(url?'Страница Boosty подключена':'Донаты отключены');await this.open(this.host);});
  }
 }
}
