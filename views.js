import {esc,icon,ib,avatar,time,day,preview,richText,safeURL,sid} from './core.js';
import {staffRole} from './admin.js';
import {defaultColors,validColors} from './theme.js';

export function shell(app) {
  const nav=[['random','Рулетка'],['chats','Чаты'],['contacts','Контакты'],['channels','Каналы'],['tapolka','Тапалка'],['clips','Клипы'],['calls','Звонки'],['saved','Избранное'],['settings','Настройки'],...(staffRole(app.profile.app_role)?[['admin','Админка']]:[])];
  return `<div class="workspace" id="workspace">
    <aside class="rail" aria-label="Разделы"><span class="brand-mark" aria-label="RNDM Chat">R</span>
      <nav class="rail-nav">${nav.map(([name,label])=>`<button class="nav-item ${app.route===name?'active':''}" data-nav="${name}" type="button" title="${label}">${icon(name)}<span>${label}</span></button>`).join('')}</nav>
      <div class="rail-bottom">${ib('moon','Сменить тему','theme')}<button class="rail-me" data-nav="settings" aria-label="Мой профиль">${avatar(app.profile)}</button></div>
    </aside>
    <aside class="sidebar" aria-label="Список чатов">
      <div class="sidebar-header"><div class="sidebar-title"><h1 id="sectionTitle">Чаты</h1><span class="count-pill" id="sectionCount"></span>${staffRole(app.profile.app_role)?`<button class="icon-button mobile-admin-entry" data-nav="admin" type="button" aria-label="Открыть админку" title="Админка">${icon('shield')}</button>`:''}${ib('plus','Новый чат','new','new-chat')}</div>
        <label class="searchbox">${icon('search')}<input id="listSearch" placeholder="Поиск" aria-label="Поиск чатов и людей" autocomplete="off">${ib('close','Очистить поиск','clear-search','small')}</label>
      </div>
      <div class="stories-strip" id="storiesStrip" aria-label="Истории"></div>
      <div class="folder-tabs" id="folderTabs" aria-label="Фильтры чатов"></div>
      <div class="sidebar-list" id="dialogList"></div>
      <div class="sidebar-footer"><span class="status-dot" id="statusDot"></span><span id="connectionText">RNDM · на связи</span></div>
    </aside>
    <main class="pane" id="pane" aria-label="Переписка"></main>
  </div>`;
}
export function welcome() {
  return `<section class="welcome"><div class="welcome-logo">${icon('chats')}</div><span class="eyebrow">Твой круг. Твой ритм.</span><h2>Ближе, чем кажется.</h2><p>Выбери чат и продолжи разговор.<br>Всё важное — в одном месте.</p><button class="primary" data-action="new">${icon('plus')}Начать общение</button><button type="button" class="secondary welcome-random" data-nav="random">${icon('random')} Найти случайного собеседника</button><div class="welcome-tags"><span>${icon('lock')}Личные чаты</span><span>${icon('contacts')}Группы</span><span>${icon('channels')}Каналы</span></div></section>`;
}
export function randomSidebar() {
  return `<button type="button" class="random-sidebar-entry" data-nav="random"><span class="random-sidebar-orb">${icon('random')}</span><span><b>RNDM Рулетка</b><small>Новый собеседник в один клик</small></span><span class="random-sidebar-arrow">→</span></button>`;
}
export function randomPage({searching=false,filterLanguage='any',filterInterest='any',count=null,matched=null,person=null,error=''}) {
  const languages=[['any','Любой язык'],['ru','Русский'],['en','English']];
  const interests=[['any','Любая тема'],['games','🎮 Игры'],['music','🎵 Музыка'],['study','📚 Учёба'],['tech','💻 Технологии'],['movies','🎬 Кино'],['life','💬 Общение']];
  const options=(rows,value)=>rows.map(([id,label])=>`<option value="${id}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');
  const result=matched?`<section class="random-found" role="status"><span class="random-status success">● СОВПАДЕНИЕ!</span><div class="random-found-person">${avatar(person||{display_name:'Собеседник'},'large')}<h3>${esc(person?.display_name||person?.username||'Собеседник найден')}</h3><p>${person?.username?'@'+esc(person.username):'Новый собеседник RNDM'}</p></div><p>Теперь вы можете познакомиться и начать разговор.</p><div class="random-found-actions"><button class="primary" data-action="random-open-chat">${icon('chats')} Открыть чат</button><button class="secondary" data-action="random-profile">Профиль</button><button class="secondary" data-action="random-next">${icon('random')} Другой человек</button></div></section>`:'';
  const waiting=searching?`<section class="random-wait" role="status"><div class="random-spinner">${icon('random')}</div><h3>Ищем собеседника…</h3><p>Как только другой участник начнёт поиск, мы создадим ваш чат.</p><button class="secondary" data-action="random-stop">Остановить поиск</button></section>`:'';
  const start=!searching&&!matched?`<section class="random-ready"><button class="random-start" data-action="random-start">${icon('random')} Начать поиск</button><p>Ты попадёшь в очередь только после нажатия. Можно выйти в любой момент.</p></section>`:'';
  return `<header class="chat-header">${ib('back','К чатам','back','back-mobile')}<div class="header-title"><h2>RNDM Рулетка</h2><p>Знакомства по интересам</p></div></header><div class="random-page">
    <div class="random-hero"><span class="eyebrow">ЗНАКОМЬСЯ ПО-НОВОМУ</span><div class="random-planet">${icon('random')}<i></i><i></i><i></i></div><h1>Никогда не знаешь,<br>кто встретится следующим.</h1><p>Находи новых людей для настоящего общения, без анкет и свайпов.</p></div>
    <div class="random-settings"><label>Язык собеседника<select id="randomLanguage" ${searching?'disabled':''}>${options(languages,filterLanguage)}</select></label><label>Общая тема<select id="randomInterest" ${searching?'disabled':''}>${options(interests,filterInterest)}</select></label><div class="random-counter">${icon('contacts')} <strong>${count===null?'—':Number(count)}</strong><small>в поиске сейчас</small></div></div>
    ${error?`<p class="random-error" role="alert">${esc(error)}</p>`:''}${result}${waiting}${start}
    <div class="random-safety">${icon('shield')}<p>Ты сам решаешь, когда общаться. Пользователи из блок-листа не будут подобраны. Для поиска нужны открытые личные сообщения и доступный профиль.</p></div>
  </div>`;
}
export function row(item,app) {
  const pref=app.prefs[item.id] || {}, draft=app.drafts['chat:'+item.id]?.body;
  const last=item.last ? (day(item.last)==='Сегодня' ? time(item.last) : new Date(item.last).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})) : '';
  const title=item.title || item.display_name || item.name || 'Пользователь';
  return `<button type="button" class="chat-row ${app.active?.id===item.id?'active':''}" data-open="${esc(item.id)}" data-kind="${item.kind || 'direct'}" aria-label="${esc(title)}" aria-current="${app.active?.id===item.id?'true':'false'}">${avatar(item,'',item.kind==='group'?'contacts':item.kind==='channel'?'channels':'')}<span class="row-content"><span class="row-top"><span class="row-name">${esc(title)}</span><span class="row-time">${last}</span></span><span class="row-bottom"><span class="row-preview ${draft?'draft':''}">${esc(draft ? 'Черновик: '+draft : item.preview || '')}</span>${pref.is_pinned ? icon('pin','pin-tiny') : ''}${app.state.muted?.includes(item.id) ? icon('mute','pin-tiny') : ''}${item.unread ? `<span class="unread">${item.unread>99?'99+':item.unread}</span>` : ''}</span></span></button>`;
}
export function personRow(person,action='person') {
  return `<button class="chat-row" data-${action}="${esc(person.id)}" type="button">${avatar(person)}<span class="row-content"><span class="row-name">${esc(person.display_name || person.username)}</span><span class="row-bottom"><span class="row-preview">@${esc(person.username || 'user')}${person.bio?' · '+esc(person.bio):''}</span></span></span>${icon('chevron','pin-tiny')}</button>`;
}
export function conversation(app) {
  const active=app.active;
  let title,status,person;
  if (active.kind==='saved') { title='Избранное';status='Заметки и сохранённые сообщения';person={display_name:title}; }
  else if (active.kind==='channel') { title=active.title;status=active.count+' подписчиков';person=active; }
  else {
    person=app.info.profiles.find(p=>p.id!==app.user.id) || app.profile;
    title=active.kind==='group' ? app.info.conv.title || 'Группа' : person.display_name || person.username || 'Пользователь';
    const online=!person.hide_last_seen && Date.now()-new Date(person.last_seen).getTime()<150000;
    status=active.kind==='group' ? app.info.members.length+' участников' : person.hide_last_seen ? 'Последний визит скрыт' : online ? 'в сети' : person.last_seen ? 'был(а) '+day(person.last_seen).toLowerCase()+' в '+time(person.last_seen) : 'Личный чат';
  }
  const canSend=active.kind!=='channel' || active.owner_id===app.user.id;
  return `<header class="chat-header">${ib('back','К списку чатов','back','back-mobile')}${active.kind==='direct'?`<button type="button" class="chat-header-avatar" data-person="${esc(person.id)}" aria-label="Открыть профиль">${avatar(person)}</button>`:avatar(person,'',active.kind==='saved'?'saved':active.kind==='channel'?'channels':active.kind==='group'?'contacts':'')}<button type="button" class="header-title" ${active.kind==='direct'?`data-person="${esc(person.id)}" title="Открыть профиль"`:'data-action="info"'}><h2>${esc(title)}</h2><p id="presenceText">${esc(status)}</p></button><div class="header-tools">${active.kind==='direct'?ib('phone','Аудиозвонок','call-audio')+ib('video','Видеозвонок','call-video'):''}${ib('search','Поиск в переписке','chat-search')}${active.kind!=='saved'?ib('info','Информация','info','desktop-tool'):''}${ib('more','Меню чата','chat-menu')}</div></header>
    <div id="pinnedBanner" class="pinned-banner" hidden></div>
    <div class="chat-search" id="chatSearch" hidden><input type="search" id="messageSearch" placeholder="Поиск по всей переписке" aria-label="Поиск сообщений">${ib('close','Закрыть поиск','close-chat-search')}</div><div class="search-results" id="messageSearchResults" hidden></div>
    <div class="messages" id="messages" role="log" aria-label="Сообщения"></div>${ib('down','К новым сообщениям','bottom','jump-bottom')}
    ${canSend ? `<div class="composer-wrap"><div class="compose-context" id="replyContext" hidden></div><div class="compose-context" id="fileContext" hidden></div><div class="typing-line" id="typingLine" role="status" aria-live="polite"></div><div class="send-error" id="sendError" role="alert"></div><form class="composer" id="composer">${ib('attach','Прикрепить файл','attach')}${ib('emoji','Эмодзи','emoji')}<textarea id="messageInput" placeholder="Напиши сообщение…" rows="1" maxlength="4000" aria-label="Сообщение"></textarea>${ib('mic','Записать голосовое','voice')}<button type="submit" class="send-button" id="sendButton" title="Отправить сообщение" aria-label="Отправить сообщение">${icon('send')}</button></form><input id="attachmentInput" type="file" hidden><div class="compose-hint">${app.state.enterSend!==false?'Enter — отправить · Shift + Enter — новая строка':'Отправка кнопкой · Enter — новая строка'}</div></div>` : `<div class="readonly-composer">${active.joined?'Ты подписан(а). Новые публикации появятся здесь.':'Подпишись на канал, чтобы добавить его в свой список.'}${!active.joined?'<br><button class="primary" data-action="join-channel">Подписаться</button>':''}</div>`}`;
}
export function attachment(message) {
  const url=safeURL(message.attachment_url); if (!url) return '';
  const type=message.attachment_type || '';
  if (type.startsWith('image/')) return `<div class="attachment"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><img src="${esc(url)}" alt="${esc(message.attachment_name || 'Изображение')}" loading="lazy"></a></div>`;
  if (type.startsWith('video/')) return `<div class="attachment"><video controls playsinline preload="metadata" src="${esc(url)}" aria-label="${esc(message.attachment_name || 'Видео')}"></video></div>`;
  if (type.startsWith('audio/')) return `<div class="attachment"><audio controls preload="metadata" src="${esc(url)}" aria-label="${esc(message.attachment_name || 'Голосовое сообщение')}"></audio></div>`;
  return `<div class="attachment"><a class="file-card" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('file')}<span>${esc(message.attachment_name || 'Файл')}</span>${icon('download')}</a></div>`;
}
export function messageHTML(message,app) {
  const own=message.sender_id===app.user.id || message.note;
  const person=app.info?.profiles?.find(p=>p.id===message.sender_id) || app.peopleMap[message.sender_id] || app.profile;
  const reply=app.replyLookup[sid(message.reply_to)] || app.messages.find(x=>sid(x.id)===sid(message.reply_to));
  const replies=message.reply_to ? `<button class="reply-preview" data-jump="${esc(message.reply_to)}"><b>Ответ ${reply ? esc(app.peopleMap[reply.sender_id]?.display_name || app.info?.profiles?.find(p=>p.id===reply.sender_id)?.display_name || 'на сообщение') : 'на сообщение'}</b><span>${reply ? esc(preview(reply)) : 'Сообщение #'+esc(message.reply_to)}</span></button>` : '';
  const rs=app.reactions.filter(r=>sid(r.message_id || r.post_id)===sid(message.id)), groups=new Map();
  for (const r of rs) { const g=groups.get(r.emoji) || {n:0,mine:false};g.n++;g.mine ||= r.user_id===app.user.id;groups.set(r.emoji,g); }
  const read=app.active.kind==='direct' && own && app.info?.members.filter(x=>x.user_id!==app.user.id).some(x=>x.last_read_at && new Date(x.last_read_at)>=new Date(message.created_at));
  return `${!own && app.active.kind==='group' ? avatar(person,'small') : ''}<div class="bubble">${!own && app.active.kind==='group' ? `<button class="message-sender" data-person="${esc(message.sender_id)}">${esc(person.display_name || person.username || 'Участник')}</button>` : ''}${message.deleted_at ? '<p class="message-body deleted">Сообщение удалено</p>' : `${message.forwarded_from ? '<div class="forwarded">Пересланное сообщение</div>' : ''}${replies}${message.body ? `<div class="message-body">${richText(message.body)}</div>` : ''}${attachment(message)}${groups.size ? `<div class="reaction-list">${[...groups].map(([emoji,g])=>`<button class="reaction-chip ${g.mine?'mine':''}" data-reaction="${esc(message.id)}" data-emoji="${esc(emoji)}">${esc(emoji)} <span>${g.n}</span></button>`).join('')}</div>` : ''}`}
    <div class="message-meta">${message.edited_at?'<span class="edited">изменено</span>':''}<span>${time(message.created_at)}</span>${own && app.active.kind!=='saved' && app.active.kind!=='channel' ? icon(read?'double':'check',read?'read':'') : ''}</div>
    ${app.active.kind==='channel' && !message.deleted_at ? `<button class="comment-link" data-comments="${esc(message.id)}">${icon('chats')}Комментарии${icon('chevron','pin-tiny')}</button>` : ''}</div><div class="message-actions">${message.deleted_at ? '' : `<button type="button" class="icon-button small" data-message-menu="${esc(message.id)}" title="Действия с сообщением" aria-label="Действия с сообщением">${icon('more')}</button>`}</div>`;
}
export function settings(app) {
  const p=app.profile,colors=validColors(app.state.colors)?app.state.colors:document.documentElement.dataset.theme==='light'?{accent:'#7953e5',background:'#f2f3fa',incoming:'#ffffff',outgoing:'#e4dafc'}:defaultColors;
  return `<header class="chat-header">${ib('back','К чатам','back','back-mobile')}<h2 style="font-size:16px">Мой RNDM</h2></header><section class="settings-pane"><h2>Настройки</h2>${staffRole(app.profile.app_role)?`<section class="settings-card"><h3>Управление сайтом</h3><div class="settings-body"><p class="muted">Пользователи, жалобы, публикации и журнал действий.</p><button class="primary" data-nav="admin">${icon('shield')}Открыть админку</button></div></section>`:''}
    <section class="settings-card"><h3>Профиль</h3><div class="settings-body"><button class="secondary" type="button" data-action="my-profile">Посмотреть мой профиль</button></div><form class="settings-body" id="profileForm"><div class="profile-edit">${avatar(p,'large')}<div><b>${esc(p.display_name)}</b><p>@${esc(p.username)}</p><button type="button" class="text-button" data-action="avatar">Изменить фото</button></div></div><input type="file" id="avatarInput" accept="image/jpeg,image/png,image/webp,image/gif" hidden><label class="field">Имя<input name="display_name" value="${esc(p.display_name)}" maxlength="60" required></label><label class="field">Имя пользователя<input name="username" value="${esc(p.username)}" pattern="[a-zA-Z0-9_]{3,32}" maxlength="32" required><small>От 3 до 32 символов: латинские буквы, цифры и _.</small></label><label class="field">О себе<textarea name="bio" rows="3" maxlength="500">${esc(p.bio)}</textarea></label><label class="field">Обложка профиля<div class="profile-cover-preview" ${p.cover_url?`style="background-image:url('${esc(p.cover_url)}')"`:''}></div><button type="button" class="secondary" data-action="cover">Загрузить обложку</button><input type="file" id="coverInput" accept="image/jpeg,image/png,image/webp" hidden></label><div id="profileError"></div><button class="primary" type="submit">Сохранить профиль</button></form></section>
    ${profileAppearanceForm(p)}
    <section class="settings-card"><h3>Оформление</h3><div class="settings-body"><div class="theme-options"><button class="theme-choice ${document.documentElement.dataset.theme!=='light'?'active':''}" data-set-theme="dark">${icon('moon')}Тёмная</button><button class="theme-choice ${document.documentElement.dataset.theme==='light'?'active':''}" data-set-theme="light">${icon('sun')}Светлая</button></div><form id="colorsForm" class="colors-form"><h4>Твои цвета</h4><p class="muted">Выбери любой оттенок. Изменения видны сразу; нажми «Сохранить цвета», чтобы оставить их.</p><div class="color-grid">${Object.entries({accent:'Кнопки и акценты',background:'Фон интерфейса',incoming:'Входящие сообщения',outgoing:'Твои сообщения'}).map(([key,label])=>`<label class="color-field"><span>${label}</span><span class="color-control"><input type="color" name="${key}" value="${colors[key]}" aria-label="${label}"><output>${colors[key].toUpperCase()}</output></span></label>`).join('')}</div><div class="palette-preview"><span class="preview-incoming">Привет! Как тебе эти цвета?</span><span class="preview-outgoing">Теперь RNDM выглядит по-моему ✨</span></div><div id="colorsError" role="alert"></div><div class="color-actions"><button class="primary" type="submit">Сохранить цвета</button><button class="secondary" type="button" data-action="reset-colors">Сбросить</button></div></form><p class="muted" style="font-size:11px;margin:20px 0 12px">Фон переписки</p><div class="theme-swatches">${['default','violet','mint','ocean','sunset'].map(t=>`<button class="theme-swatch ${t} ${app.state.wallpaper===t?'active':''}" data-wallpaper="${t}" aria-label="${{default:'Обычный',violet:'Фиолетовый',mint:'Мятный',ocean:'Океан',sunset:'Закат'}[t]}"></button>`).join('')}</div></div></section>
    <section class="settings-card"><h3>Общение и приватность</h3><label class="setting-row"><div>Отправка клавишей Enter<small>Shift + Enter добавляет новую строку.</small></div><input type="checkbox" data-setting="enterSend" ${app.state.enterSend!==false?'checked':''}></label><div class="setting-row"><div>Уведомления о сообщениях<small>Когда RNDM открыт в фоновой вкладке.</small></div>${window.Notification?`<button class="text-button" data-action="notifications">${app.state.notifications?'Выключить':'Включить'}</button>`:'<span class="muted" style="font-size:10px">Недоступны</span>'}</div><label class="setting-row"><div>Скрыть последний визит<small>Другие пользователи не увидят, когда ты был(а) в сети.</small></div><input type="checkbox" data-privacy="hide_last_seen" ${p.hide_last_seen?'checked':''}></label><label class="setting-row"><div>Разрешить личные сообщения всем<small>Для поиска собеседника в рулетке требуется разрешить сообщения всем.</small></div><input type="checkbox" data-privacy="allow_messages" ${p.allow_messages==='everyone'?'checked':''}></label><label class="setting-row"><div>Показываться в поиске<small>Нужен для чат-рулетки.</small></div><input type="checkbox" data-privacy="discoverable" ${p.discoverable?'checked':''}></label><label class="setting-row"><div>Закрытый профиль<small>Закрытые профили не участвуют в чат-рулетке.</small></div><input type="checkbox" data-privacy="profile_private" ${p.profile_private?'checked':''}></label></section>
    <section class="settings-card" id="languageSettings"><h3>🌐 Язык приложения / Language</h3><div class="settings-body"><label class="field">Язык интерфейса / Interface language<select id="appLanguage"><option value="ru" ${p.app_language!=='en'?'selected':''}>Русский</option><option value="en" ${p.app_language==='en'?'selected':''}>English</option></select></label><label class="field">Цензура<select id="censorshipMode"><option value="strict" ${p.censorship_mode==='strict'?'selected':''}>Строгая</option><option value="mask" ${p.censorship_mode!=='off'&&p.censorship_mode!=='strict'?'selected':''}>Маскировать мат</option><option value="off" ${p.censorship_mode==='off'?'selected':''}>Без маскировки</option></select></label><button type="button" class="primary" data-action="save-content-settings">Сохранить / Save</button></div></section>
    <section class="settings-card"><h3>Аккаунт</h3><div class="settings-body"><p class="muted" style="font-size:12px;overflow-wrap:anywhere;margin-bottom:16px">${esc(app.user.email)}</p><button class="secondary" data-action="password">Изменить пароль</button><button class="detail-action danger" data-action="logout" style="margin-top:13px">${icon('logout')}Выйти из аккаунта</button></div></section><p class="muted" style="font-size:10px;text-align:center">RNDM Chat · 42.0 · Общение в твоём ритме</p></section>`;
}
export function authView(mode, email='') {
  const labels={login:['С возвращением.','Войди в свой RNDM и продолжи разговор.'],register:['Твой новый круг.','Создай аккаунт и будь ближе к своим.'],forgot:['Восстановим доступ.','Отправим ссылку для смены пароля на твою почту.'],recovery:['Новый пароль.','Придумай новый пароль для своего аккаунта.']};
  const [title,sub]=labels[mode];
  return `<div class="auth-page"><section class="auth-intro"><div class="auth-brand"><span class="brand-mark">R</span>RNDM Chat</div><div class="auth-copy"><span class="eyebrow">Твой круг. Твой ритм.</span><h1>Разговоры,<br>которые<br><span>сближают.</span></h1><p>Личные сообщения, группы и каналы.<br>Место для своих — и для новых встреч.</p></div><p class="auth-footer">RNDM Chat · Общение без лишнего</p></section><section class="auth-form-wrap"><div class="auth-form-card"><div class="auth-mobile-brand"><span class="brand-mark">R</span>RNDM Chat</div><h2>${title}</h2><p>${sub}</p><form id="authForm" data-mode="${mode}">
    ${mode==='register'?'<label class="field">Как тебя зовут<input name="name" autocomplete="name" maxlength="60" required></label><label class="field">Имя пользователя<input name="username" placeholder="your_name" autocomplete="username" pattern="[a-zA-Z0-9_]{3,32}" minlength="3" maxlength="32" required><small>Латинские буквы, цифры и _. Минимум 3 символа.</small></label>':''}
    ${mode!=='recovery'?`<label class="field">Почта<input name="email" type="email" value="${esc(email)}" placeholder="you@example.com" autocomplete="email" required></label>`:''}
    ${mode!=='forgot'?`<label class="field">Пароль<input name="password" type="password" placeholder="${mode==='login'?'Твой пароль':'Не менее 8 символов'}" autocomplete="${mode==='login'?'current-password':'new-password'}" ${mode==='login'?'':'minlength="8"'} maxlength="128" required></label>`:''}
    ${mode==='recovery'?'<label class="field">Повтори пароль<input name="password2" type="password" autocomplete="new-password" minlength="8" required></label>':''}
    ${mode==='login'?'<button type="button" class="text-button" data-auth="forgot">Забыл(а) пароль?</button>':''}<div id="authMessage" role="alert"></div><button class="primary" type="submit">${{login:'Войти',register:'Создать аккаунт',forgot:'Отправить ссылку',recovery:'Сохранить пароль'}[mode]}${icon('chevron')}</button></form><div class="auth-switch">${mode==='login'?'Впервые здесь? <button data-auth="register">Создать аккаунт</button>':'<button data-auth="login">Назад ко входу</button>'}</div></div></section>${ib('moon','Сменить тему','theme','auth-theme')}</div>`;
}

export function tapolka(app,board=[],mine=0) {
  const top=board.slice(0,20);
  return `<header class="chat-header">${ib('back','К чатам','back','back-mobile')}<div class="header-title"><h2>🐱 Котик · Тапалка</h2><p>Общий игровой канал RNDM</p></div><button class="secondary" data-action="tapolka-refresh">Обновить</button></header>
  <section class="tapolka-page">
    <div class="tapolka-hero"><span class="eyebrow">RNDM GAME CHANNEL</span><h1>Тапай. Набирай очки. Поднимайся в рейтинг.</h1><p>Твои нажатия сохраняются в облаке и синхронизируются между телефоном и ПК.</p><div class="tapolka-score"><small>Твой счёт</small><strong id="tapolkaMine">${Number(mine||0).toLocaleString('ru-RU')}</strong><span>тапов</span></div><button class="tapolka-button" id="tapolkaButton" data-action="tapolka-tap" aria-label="Тапнуть"><span class="tap-cat" aria-hidden="true">🐱</span><b>ПОГЛАДИТЬ</b><small>нажимай быстрее</small></button><div class="tapolka-pending" id="tapolkaPending"></div></div>
    <div class="tapolka-board"><div class="tapolka-board-head"><div><span class="eyebrow">ТОП ИГРОКОВ</span><h2>Рейтинг канала</h2></div><button class="icon-button" data-action="tapolka-refresh" aria-label="Обновить рейтинг">${icon('refresh')}</button></div><div id="tapolkaBoard">${top.map((x,i)=>`<div class="tapolka-rank ${x.user_id===app.user.id?'mine':''}"><span class="tapolka-place">${i+1}</span>${avatar(x)}<span class="row-content"><b>${esc(x.display_name||x.username||'Игрок')}</b><small>@${esc(x.username||'user')}</small></span><strong>${Number(x.taps||0).toLocaleString('ru-RU')}</strong></div>`).join('')||'<div class="sidebar-empty"><p>Стань первым игроком — сделай первый тап.</p></div>'}</div></div>
  </section>`;
}

const PROFILE_COVERS=['aurora','cosmos','sunset','ocean','forest','rose','minimal'];
const PROFILE_FRAMES=['none','neon','gold','frost','rose','rainbow'];
export function profileAppearanceForm(p) {
 const style=PROFILE_COVERS.includes(p.profile_cover_style)?p.profile_cover_style:'aurora';
 const frame=PROFILE_FRAMES.includes(p.frame_id)?p.frame_id:'none';
 const accent=/^#[0-9a-f]{6}$/i.test(p.profile_accent||'')?p.profile_accent:'#9478ff';
 const styles=[['aurora','Аврора'],['cosmos','Космос'],['sunset','Закат'],['ocean','Океан'],['forest','Лес'],['rose','Роза'],['minimal','Минимализм']];
 const frames=[['none','Без рамки'],['neon','Неон'],['gold','Золото'],['frost','Лёд'],['rose','Розовая'],['rainbow','Радуга']];
 const options=(rows,v)=>rows.map(([id,label])=>`<option value="${id}" ${v===id?'selected':''}>${label}</option>`).join('');
 return `<section class="settings-card profile-decor-editor"><h3>✨ Оформление профиля</h3><div class="settings-body"><p class="muted">Эти украшения увидят друзья, когда откроют твой профиль. Настройки хранятся в базе.</p><form id="profileStyleForm">
 <div class="profile-live-preview" id="profileLivePreview" style="--profile-accent:${accent}"><div class="profile-live-cover cover-${style}" id="profileLiveCover"></div><div class="profile-live-avatar"><span id="profileLiveFrame" class="avatar-frame frame-${frame}">${avatar(p,'large')}</span><div><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div></div></div>
 <label class="field">Фон профиля<select name="profile_cover_style" id="profileCoverStyle">${options(styles,style)}</select></label>
 <label class="field">Рамка аватара<select name="frame_id" id="profileFrame">${options(frames,frame)}</select></label>
 <label class="field">Цвет профиля<span class="profile-accent-input"><input type="color" name="profile_accent" id="profileAccent" value="${accent}"><output id="profileAccentText">${accent.toUpperCase()}</output></span></label>
 <div id="profileStyleError" role="alert"></div><button type="submit" class="primary">Сохранить оформление</button></form></div></section>`;
}
export function publicProfileView(app,p,gifts=[]) {
  if(!p)return `<div class="empty-state"><h2>Профиль не найден</h2></div>`;
  const rawCover=p.cover_url&&safeURL(p.cover_url);
  const cover=rawCover?`style="background-image:url('${esc(rawCover)}')"`:'';
  const coverStyle=PROFILE_COVERS.includes(p.profile_cover_style)?p.profile_cover_style:'aurora';
  const frame=PROFILE_FRAMES.includes(p.frame_id)?p.frame_id:'none';
  const accent=/^#[0-9a-f]{6}$/i.test(p.profile_accent||'')?p.profile_accent:'#9478ff';
  const mine=p.id===app.user.id;
  const role=p.app_role&&p.app_role!=='user'?`<span class="profile-role">${esc(p.app_role)}</span>`:'';
  return `<div class="public-profile styled-profile" style="--profile-accent:${accent}">
    <header class="profile-cover cover-${coverStyle}" ${cover}>${ib('back','Назад','profile-back','profile-back')}<div class="profile-cover-shade"></div></header>
    <section class="profile-main-card">
      <div class="profile-big-avatar"><span class="avatar-frame frame-${frame}">${avatar(p)}</span></div>
      <div class="profile-identity"><h1>${esc(p.display_name||p.username||'Пользователь')} ${p.is_verified?'✓':''}</h1><p>@${esc(p.username||'user')} ${role}</p></div>
      <div class="profile-actions">${mine?`<button class="primary" data-nav="settings">Редактировать и оформить профиль</button>`:`<button class="primary" data-action="profile-message" data-user="${esc(p.id)}">Написать</button><button class="secondary" data-action="profile-friend" data-user="${esc(p.id)}">Добавить</button><button class="secondary" data-action="profile-gift" data-user="${esc(p.id)}">🎁 Подарить</button>`}</div>
      <p class="profile-bio">${esc(p.bio||'Пользователь пока ничего о себе не рассказал.')}</p>
      <div class="profile-stats"><span><b>${Number(p.reputation||0)}</b>репутация</span><span><b>${Number(p.xp||0)}</b>XP</span><span><b>${Number(p.stars||0)}</b>звёзд</span></div>
      <section class="gift-showcase"><h3>🎁 Подарки</h3><div class="gift-showcase-list">${gifts.length?gifts.map(g=>`<div class="gift-chip" title="${esc(g.gift_name)} от ${esc(g.sender_name)}"><span>${esc(g.gift_emoji)}</span><small>${esc(g.sender_name)}</small></div>`).join(''):'<p>Подарков пока нет</p>'}</div></section>
      <div class="profile-details"><div><small>Статус</small><b>${esc(p.status||'offline')}</b></div><div><small>В RNDM с</small><b>${p.created_at?new Date(p.created_at).toLocaleDateString(app.profile?.app_language==='en'?'en-GB':'ru-RU'):'—'}</b></div></div>
    </section>
  </div>`;
}

export function giftShop(target,items,balance){return `<div class="gift-shop"><header><h2>🎁 Отправить подарок</h2><button class="secondary" data-action="gift-close">Закрыть</button></header><p>Твой баланс: <strong>⭐ ${Number(balance||0).toLocaleString('ru-RU')}</strong></p><div class="gift-grid">${items.map(g=>`<button class="gift-option" data-action="gift-send" data-user="${esc(target)}" data-gift="${esc(g.id)}"><span>${esc(g.emoji)}</span><b>${esc(g.name)}</b><small>⭐ ${g.price}</small></button>`).join('')}</div><label>Сообщение (необязательно)<input id="giftNote" maxlength="160" placeholder="Напиши пожелание"></label></div>`;}
