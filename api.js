import {timeoutFetch, sid, unique, safeURL} from './core.js?v=64.0.0';

function must(result) { if (result.error) throw result.error; return result.data; }
const now = () => new Date().toISOString();
const key = 'messenger-v30';

export class MessengerAPI {
  constructor() {
    const cfg = window.RNDM_CONFIG;
    if (!window.supabase?.createClient) throw new Error('Не удалось загрузить библиотеку подключения. Обнови страницу.');
    this.sb = window.supabase.createClient(cfg.url,cfg.key,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
      global:{fetch:timeoutFetch},realtime:{params:{eventsPerSecond:6}}
    });
    this.uid = null;
  }
  async session() { const data = must(await this.sb.auth.getSession()); this.uid = data.session?.user.id || null; return data.session; }
  async giftCatalog(){return must(await this.sb.from('rndm_gift_catalog').select('id,name,emoji,price,rarity,collection').eq('is_active',true).order('sort_order'))||[];}
  async starsWallet(){return must(await this.sb.rpc('rndm_wallet_state'));}
  async myGifts(){return must(await this.sb.rpc('rndm_my_gifts',{max_rows:60}))||[];}
  async claimDailyStars(){const rows=must(await this.sb.rpc('claim_daily_reward'));return Array.isArray(rows)?rows[0]:rows;}
  async sendGift(target,gift,note=''){return must(await this.sb.rpc('rndm_send_gift',{target,gift,note}));}
  async profileGifts(target){return must(await this.sb.rpc('rndm_profile_gifts',{target,max_rows:24}))||[];}
  async notifications(limit=80){return must(await this.sb.from('notifications').select('id,kind,title,body,link,created_at,is_read,actor_id').eq('user_id',this.uid).order('created_at',{ascending:false}).limit(limit))||[];}
  async notificationUnread(){const r=await this.sb.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',this.uid).eq('is_read',false);if(r.error)throw r.error;return r.count||0;}
  async markNotification(id){return must(await this.sb.from('notifications').update({is_read:true}).eq('user_id',this.uid).eq('id',Number(id)).select('id'));}
  async markAllNotifications(){return must(await this.sb.from('notifications').update({is_read:true}).eq('user_id',this.uid).eq('is_read',false).select('id'));}
  async randomHistory(){const rows=must(await this.sb.from('rndm_random_history').select('partner_id,conversation_id,last_met_at,matches,is_favorite').eq('user_id',this.uid).order('is_favorite',{ascending:false}).order('last_met_at',{ascending:false}).limit(24))||[];const users=await this.profiles(rows.map(x=>x.partner_id));return rows.map(row=>({...row,person:users.find(p=>p.id===row.partner_id)||null}));}
  async randomFavorite(partnerId,on){return must(await this.sb.from('rndm_random_history').update({is_favorite:!!on}).eq('user_id',this.uid).eq('partner_id',partnerId).select('partner_id'));}
  async profileSocial(userId){const [count,following]=await Promise.all([this.sb.from('rndm_follows').select('follower_id',{count:'exact',head:true}).eq('followee_id',userId),this.sb.from('rndm_follows').select('follower_id').eq('followee_id',userId).eq('follower_id',this.uid).maybeSingle()]);if(count.error)throw count.error;if(following.error)throw following.error;return {followers:count.count||0,following:!!following.data};}
  async catCosmeticState(){const row=must(await this.sb.from('rndm_cat_progress').select('skin_id,accessory_id').eq('user_id',this.uid).maybeSingle());return row||{skin_id:'classic',accessory_id:'none'};}
  async catCosmetic(kind,choice){return must(await this.sb.rpc('rndm_cat_cosmetic',{kind,choice}));}
  async catWeeklyBoard(){return must(await this.sb.rpc('rndm_cat_weekly_leaderboard',{max_rows:20}))||[];}
  async catMyScore(){const row=must(await this.sb.from('rndm_tapolka_scores').select('taps').eq('user_id',this.uid).maybeSingle());return Number(row?.taps||0);}
  async creatorStats(){return must(await this.sb.rpc('rndm_creator_clip_stats'));}

  async publicProfile(userId) {
    const {data,error}=await this.sb.from('rndm_public_profiles').select('id,username,display_name,avatar_url,cover_url,bio,status,last_seen,created_at,app_role,is_verified,is_premium,is_banned,reputation,xp,stars,profile_accent,frame_id,profile_cover_style,profile_layout,profile_private,show_friends,show_clips,show_followers,allow_messages,allow_friend_requests').eq('id',userId).maybeSingle();
    if(error)throw error; return data;
  }
  async randomJoin(language='any',interest='any') {
    const result=must(await this.sb.rpc('rndm_random_search',{p_language:language,p_interest:interest}));
    return Array.isArray(result)?result[0]:result;
  }
  async randomWaitingCount(){return Number(must(await this.sb.rpc('random_waiting_count'))||0);}
  async randomLeave(){return must(await this.sb.rpc('random_chat_leave'));}
  async updatePreferences(patch) {
    const allowed={};
    if(['ru','en'].includes(patch.app_language))allowed.app_language=patch.app_language;
    if(['strict','mask','off'].includes(patch.censorship_mode))allowed.censorship_mode=patch.censorship_mode;
    if(!Object.keys(allowed).length)throw new Error('Не выбраны настройки для сохранения.');
    const changed=must(await this.sb.from('profiles').update(allowed).eq('id',this.uid).select('id')); if(!changed?.length)throw new Error('Сервер не подтвердил сохранение настроек.'); return this.profile();
  }
  async profile() {
    const row = must(await this.sb.rpc('rndm_my_profile'));
    if (row) return row;
    const boot = await this.sb.rpc('rndm_bootstrap');
    if (!boot.error && boot.data?.profile) return boot.data.profile;
    throw new Error('Не удалось загрузить профиль. Обнови страницу или войди заново.');
  }
  async profiles(ids) {
    ids = [...new Set(ids.filter(Boolean))]; if (!ids.length) return [];
    return must(await this.sb.from('rndm_public_profiles').select('id,username,display_name,avatar_url,bio,last_seen,hide_last_seen').in('id',ids)) || [];
  }
  async preferences() {
    return must(await this.sb.from('conversation_preferences').select('*').eq('user_id',this.uid)) || [];
  }
  async preference(cid, value) {
    const row = must(await this.sb.from('conversation_preferences').upsert({user_id:this.uid,conversation_id:cid,...value,updated_at:now()},{onConflict:'user_id,conversation_id'}).select().single());
    return row;
  }
  async dialogs() {
    const bundled = await this.sb.rpc('chat_dialogs_bundle');
    if (!bundled.error) {
      const rows = Array.isArray(bundled.data) ? bundled.data : bundled.data?.dialogs;
      if (Array.isArray(rows)) return unique(rows.map(x=>({...x,id:sid(x.conversation_id || x.id),kind:x.kind || 'direct',title:x.title || x.other_display_name || x.other_username || 'Пользователь',unread:Number(x.unread_count || 0),last:x.last_created_at,preview:x.last_attachment_name || x.last_body || 'Начни общение',avatar_url:x.avatar_url}))).filter(x=>x.id);
    }
    const memberships = must(await this.sb.from('conversation_members').select('conversation_id,last_read_at,role,conversations(id,kind,title,avatar_url,created_at)').eq('user_id',this.uid).order('joined_at',{ascending:false})) || [];
    if (!memberships.length) return [];
    const ids = memberships.map(x=>x.conversation_id);
    const members = must(await this.sb.from('conversation_members').select('conversation_id,user_id').in('conversation_id',ids)) || [];
    const people = await this.profiles(members.map(x=>x.user_id).filter(x=>x!==this.uid));
    const pm = Object.fromEntries(people.map(x=>[x.id,x]));
    const unreadRes = await this.sb.rpc('chat_unread_breakdown');
    const unread = Object.fromEntries((Array.isArray(unreadRes.data) ? unreadRes.data : []).map(x=>[x.conversation_id,Number(x.unread_count || 0)]));
    const result = []; // Bounded batches avoid hiding an old chat behind a busy group.
    for (let start = 0; start < memberships.length; start += 5) {
      result.push(...await Promise.all(memberships.slice(start,start+5).map(async member=>{
        const conv = member.conversations || {};
        const person = pm[members.find(x=>x.conversation_id===member.conversation_id && x.user_id!==this.uid)?.user_id];
        const timestamp = now();
        const last = must(await this.sb.from('messages').select('body,attachment_name,created_at,sender_id').eq('conversation_id',member.conversation_id).is('deleted_at',null).or(`scheduled_for.is.null,scheduled_for.lte.${timestamp}`).or(`expires_at.is.null,expires_at.gt.${timestamp}`).order('created_at',{ascending:false}).limit(1))?.[0];
        let count = unread[member.conversation_id];
        if (count == null && unreadRes.error) {
          let query = this.sb.from('messages').select('id',{count:'exact',head:true}).eq('conversation_id',member.conversation_id).neq('sender_id',this.uid).is('deleted_at',null).or(`scheduled_for.is.null,scheduled_for.lte.${timestamp}`).or(`expires_at.is.null,expires_at.gt.${timestamp}`);
          if (member.last_read_at) query=query.gt('created_at',member.last_read_at);
          const r=await query; count=r.error ? 0 : r.count;
        }
        return {id:sid(member.conversation_id),kind:conv.kind || 'direct',title:conv.kind==='group' ? (conv.title || 'Группа') : (person?.display_name || person?.username || 'Пользователь'),avatar_url:conv.kind==='group' ? conv.avatar_url : person?.avatar_url,other_id:person?.id,preview:last?.attachment_name || last?.body || 'Начни общение',last:last?.created_at || conv.created_at,unread:Number(count || 0)};
      })));
    }
    return unique(result);
  }
  async info(cid) {
    const [conv,members] = await Promise.all([
      this.sb.from('conversations').select('*').eq('id',cid).single(),
      this.sb.from('conversation_members').select('user_id,role,last_read_at').eq('conversation_id',cid)
    ]);
    const c=must(conv), ms=must(members) || [];
    if (!ms.some(x=>x.user_id===this.uid)) throw new Error('Этот чат недоступен твоему аккаунту.');
    return {conv:c,members:ms,profiles:await this.profiles(ms.map(x=>x.user_id))};
  }
  async messagePage(cid, before = null) {
    const timestamp=now();
    let query=this.sb.from('messages').select('*').eq('conversation_id',cid).or(`scheduled_for.is.null,scheduled_for.lte.${timestamp}`).or(`expires_at.is.null,expires_at.gt.${timestamp}`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(60);
    if (before) query=query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
    return (must(await query) || []).reverse();
  }
  async messageContext(cid,id,channel=false){
    const table=channel?'rndm_channel_posts':'messages',col=channel?'channel_id':'conversation_id',timestamp=now();
    const query=()=>{
      let q=this.sb.from(table).select('*').eq(col,cid);
      if(!channel)q=q.or(`scheduled_for.is.null,scheduled_for.lte.${timestamp}`).or(`expires_at.is.null,expires_at.gt.${timestamp}`);
      return q;
    };
    const target=must(await query().eq('id',id).maybeSingle());
    if(!target)throw new Error('Сообщение недоступно или больше не хранится в чате.');
    const t=target.created_at,mid=target.id;
    const [before,after]=await Promise.all([
      query().or(`created_at.lt.${t},and(created_at.eq.${t},id.lt.${mid})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30),
      query().or(`created_at.gt.${t},and(created_at.eq.${t},id.gt.${mid})`).order('created_at',{ascending:true}).order('id',{ascending:true}).limit(30)
    ]);
    const old=must(before)||[],next=must(after)||[];
    return {rows:[...old.reverse(),target,...next],more:old.length===30};
  }
  async media(cid,channel=false,filter='all',offset=0,search=''){
    const timestamp=now(),table=channel?'rndm_channel_posts':'messages',col=channel?'channel_id':'conversation_id';
    let q=this.sb.from(table).select('*').eq(col,cid);
    q=filter==='links'?q.ilike('body','%http%'):q.not('attachment_url','is',null);
    const term=String(search).replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,80);if(term)q=q.or(`body.ilike.%${term}%,attachment_name.ilike.%${term}%`);
    if(!channel)q=q.is('deleted_at',null).or(`scheduled_for.is.null,scheduled_for.lte.${timestamp}`).or(`expires_at.is.null,expires_at.gt.${timestamp}`);
    if(['image','video','audio'].includes(filter))q=q.ilike('attachment_type',filter+'/%');
    else if(filter==='file')q=q.or('attachment_type.is.null,and(attachment_type.not.ilike.image/%,attachment_type.not.ilike.video/%,attachment_type.not.ilike.audio/%)');
    const start=Math.max(0,Number(offset)||0);
    return must(await q.order('created_at',{ascending:false}).order('id',{ascending:false}).range(start,start+29))||[];
  }
  async reactions(ids, channel = false) {
    if (!ids.length) return [];
    const rows=[];for(let i=0;i<ids.length;i+=150)rows.push(...(must(await this.sb.from(channel ? 'rndm_channel_reactions' : 'message_reactions').select('*').in(channel ? 'post_id' : 'message_id',ids.slice(i,i+150)))||[]));return rows;
  }
  async replyMessages(ids) {const rows=[];for(let i=0;i<ids.length;i+=150)rows.push(...(must(await this.sb.from('messages').select('id,body,sender_id,attachment_name,deleted_at').in('id',ids.slice(i,i+150)))||[]));return rows;}
  async pins(cid) { return must(await this.sb.from('pinned_messages').select('message_id,pinned_by').eq('conversation_id',cid)) || []; }
  async pinMessage(cid,mid,remove=false) {
    if (remove) {
      const removed=must(await this.sb.from('pinned_messages').delete().eq('conversation_id',cid).eq('message_id',mid).select('message_id'));
      if (!removed?.length) throw new Error('Нет прав на снятие этого закрепления.');
    } else must(await this.sb.from('pinned_messages').upsert({conversation_id:cid,message_id:mid,pinned_by:this.uid},{onConflict:'conversation_id,message_id'}).select('message_id').single());
  }
  async markRead(cid) { must(await this.sb.from('conversation_members').update({last_read_at:now()}).eq('conversation_id',cid).eq('user_id',this.uid).select('conversation_id').single()); }
  async drafts() { return must(await this.sb.from('message_drafts').select('conversation_id,body,updated_at').eq('user_id',this.uid)) || []; }
  async draft(cid,body) { must(await this.sb.from('message_drafts').upsert({user_id:this.uid,conversation_id:cid,body,updated_at:now()},{onConflict:'user_id,conversation_id'})); }
  async upload(bucket,file,prefix='messages') {
    if (!file?.size) throw new Error('Выбери непустой файл.');
    if (file.size > window.RNDM_CONFIG.maxFileBytes) throw new Error('Максимальный размер файла — 50 МБ.');
    const originalName=String(file.name||'file').slice(0,150);
    const blockedExtension=/\.(?:html?|xhtml|mhtml|svgz?|xml|js|mjs|cjs|ts|php|phtml|asp|aspx|jsp|exe|dll|bat|cmd|ps1|vbs|wsf|hta|scr|msi|app|jar|swf|wasm|apk|ipa|lnk|url|webloc)(?:\.|$)/i;
    const declaredType=String(file.type||'').toLowerCase();
    if(blockedExtension.test(originalName)||/^(?:text\/html|image\/svg\+xml|application\/(?:javascript|x-javascript|x-msdownload|x-msdos-program|x-httpd-php|x-shockwave-flash|wasm|xml)|text\/javascript)/.test(declaredType))
      throw new Error('Этот тип файла может выполнять код. Передавай такой файл только внутри безопасного ZIP.');
    // Active-content formats are never rendered inline, even when disguised as a photo.
    if(['avatars','group-avatars','channel-avatars'].includes(bucket)){
      if(!['image/jpeg','image/png','image/webp','image/gif'].includes(declaredType)) throw new Error('Фото профиля должно быть JPEG, PNG, WebP или GIF.');
      const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
      const str=Array.from(head).map(x=>String.fromCharCode(x)).join('');
      const valid=declaredType==='image/jpeg'&&head[0]===255&&head[1]===216&&head[2]===255
        ||declaredType==='image/png'&&str.startsWith('\x89PNG\r\n\x1a\n')
        ||declaredType==='image/gif'&&(str.startsWith('GIF87a')||str.startsWith('GIF89a'))
        ||declaredType==='image/webp'&&str.startsWith('RIFF')&&str.slice(8,12)==='WEBP';
      if(!valid)throw new Error('Содержимое файла не соответствует формату изображения.');
    }
    const bucketLimit={'avatars':5,'group-avatars':5,'channel-avatars':5,'market-files':20,'clips':100,'videos':250,'stories':50,'channel-files':50,'chat-files':50};
    const maxMb=bucketLimit[bucket]??50;
    if(file.size>maxMb*1024*1024)throw new Error('Для этого раздела максимальный размер файла — '+maxMb+' МБ.');
    const type=file.type || ({mp3:'audio/mpeg',m4a:'audio/mp4',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',jpg:'image/jpeg',png:'image/png'})[originalName.split('.').pop().toLowerCase()] || 'application/octet-stream';
    const name=originalName.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100) || 'file';
    const path=`${this.uid}/${prefix}/${crypto.randomUUID()}-${name}`;
    must(await this.sb.storage.from(bucket).upload(path,file,{contentType:type,upsert:false,cacheControl:'3600'}));
    const {data}=this.sb.storage.from(bucket).getPublicUrl(path);
    return {url:data.publicUrl,name:file.name,type,path,bucket};
  }
  async send(cid,body,file=null,extra={}) {
    body=String(body||'');if(body.length>4000)throw new Error('В сообщении может быть до 4000 символов.');
    const allowed=['reply_to','forwarded_from','scheduled_for','expires_at','attachment_url','attachment_name','attachment_type'];
    extra=Object.fromEntries(Object.entries(extra).filter(([name])=>allowed.includes(name)));
    let upload=null;
    if (file) upload=await this.upload('chat-files',file);
    try {
      return must(await this.sb.from('messages').insert({conversation_id:cid,sender_id:this.uid,body,attachment_url:upload?.url || extra.attachment_url || null,attachment_name:upload?.name || extra.attachment_name || null,attachment_type:upload?.type || extra.attachment_type || null,...extra}).select().single());
    } catch (error) {
      if (upload && !/fetch|network|abort|timeout/i.test(error.message || '')) await this.sb.storage.from(upload.bucket).remove([upload.path]);
      throw error;
    }
  }
  async edit(mid,body) { return must(await this.sb.from('messages').update({body,edited_at:now()}).eq('id',mid).eq('sender_id',this.uid).select().single()); }
  async remove(mid) { return must(await this.sb.from('messages').update({body:'',attachment_url:null,attachment_name:null,attachment_type:null,deleted_at:now()}).eq('id',mid).eq('sender_id',this.uid).select().single()); }
  async react(cid,mid,emoji,channel=false) {
    const table=channel ? 'rndm_channel_reactions' : 'message_reactions', idcol=channel ? 'post_id' : 'message_id';
    const match=()=>this.sb.from(table).select('*').eq(idcol,mid).eq('user_id',this.uid).eq('emoji',emoji).maybeSingle();
    const existing=must(await match());
    if (existing) must(await this.sb.from(table).delete().eq(idcol,mid).eq('user_id',this.uid).eq('emoji',emoji));
    else must(await this.sb.from(table).insert({[idcol]:mid,user_id:this.uid,emoji,...(!channel ? {conversation_id:cid} : {})}));
  }
  async saved() {
    const refs=must(await this.sb.from('saved_messages').select('message_id').eq('user_id',this.uid)) || [];
    if (!refs.length) return [];
    const rows=[];
    for (let i=0;i<refs.length;i+=150) rows.push(...(must(await this.sb.from('messages').select('*').in('id',refs.slice(i,i+150).map(x=>x.message_id))) || []));
    return unique(rows).map(x=>({...x,saved_original:x.id,id:'saved-'+x.id,forwarded_from:x.id}));
  }
  async saveMessage(mid) { must(await this.sb.from('saved_messages').upsert({user_id:this.uid,message_id:mid},{onConflict:'user_id,message_id'})); }
  async unsave(mid) { must(await this.sb.from('saved_messages').delete().eq('user_id',this.uid).eq('message_id',mid)); }
  async state() { return must(await this.sb.from('user_state').select('value,updated_at').eq('user_id',this.uid).eq('key',key).maybeSingle()); }
  async stories() {
    const rows=must(await this.sb.from('stories').select('id,user_id,media_url,media_type,body,created_at,expires_at').gt('expires_at',now()).order('created_at',{ascending:false}).limit(100)) || [];
    const people=await this.profiles(rows.map(x=>x.user_id));
    return rows.map(x=>({...x,person:people.find(p=>p.id===x.user_id)}));
  }
  async createStory(body,file) {
    let uploaded=null;
    if(file){if(!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime))$/.test(file.type))throw new Error('Выбери фото JPG, PNG, WebP, GIF или видео MP4, WebM, MOV.');uploaded=await this.upload('stories',file,'stories');}
    try{return must(await this.sb.from('stories').insert({user_id:this.uid,body,media_url:uploaded?.url || null,media_type:uploaded?(uploaded.type.startsWith('video/')?'video':'image'):'text',expires_at:new Date(Date.now()+86400000).toISOString()}).select().single());}
    catch(error){if(uploaded&&!/fetch|network|abort|timeout/i.test(error.message||''))await this.sb.storage.from('stories').remove([uploaded.path]);throw error;}
  }
  async viewStory(id){must(await this.sb.from('story_views').upsert({story_id:id,user_id:this.uid},{onConflict:'story_id,user_id'}));}
  async deleteStory(id){const rows=must(await this.sb.from('stories').delete().eq('id',id).eq('user_id',this.uid).select('id'));if(!rows?.length)throw new Error('Можно удалить только свою историю.');}
  async saveState(value) { must(await this.sb.from('user_state').upsert({user_id:this.uid,key,value,updated_at:now()},{onConflict:'user_id,key'})); }
  async people(query) {
    const value=String(query||'').trim().replace(/^@/,'').replace(/[^\p{L}\p{N}_ -]/gu,' ').replace(/\s+/g,' ').slice(0,64).trim(); if (value.length<2) return [];
    return must(await this.sb.from('rndm_public_profiles').select('id,username,display_name,avatar_url,bio,last_seen,hide_last_seen').neq('id',this.uid).or(`username.ilike.%${value}%,display_name.ilike.%${value}%`).limit(30)) || [];
  }
  async friends() {
    const rows=must(await this.sb.from('friendships').select('*').or(`requester.eq.${this.uid},addressee.eq.${this.uid}`).order('created_at',{ascending:false})) || [];
    const people=await this.profiles(rows.map(x=>x.requester===this.uid ? x.addressee : x.requester));
    return rows.map(row=>({...row,person:people.find(x=>x.id===(row.requester===this.uid ? row.addressee : row.requester))}));
  }
  async direct(uid) { const data=must(await this.sb.rpc('get_or_create_direct',{other:uid})); return typeof data==='string' ? data : data?.id || data?.conversation_id; }
  async friend(uid) { must(await this.sb.rpc('send_friend_request',{other:uid})); }
  async accept(id) { must(await this.sb.rpc('accept_friend_request',{request_id:Number(id)})); }
  async removeFriend(id) { must(await this.sb.from('friendships').delete().eq('id',id)); }
  async group(title,ids) { const data=must(await this.sb.rpc('create_group',{group_title:title,member_ids:ids})); return typeof data==='string' ? data : data?.id || data?.conversation_id; }
  async addGroupMembers(cid,ids){return must(await this.sb.rpc('rndm_group_add_members',{p_group:cid,p_users:ids}));}
  async setGroupAvatar(cid,url){return must(await this.sb.rpc('rndm_group_set_avatar',{p_group:cid,p_url:url}));}
  async setChannelAvatar(cid,url){const rows=must(await this.sb.from('rndm_channels').update({avatar_url:url}).eq('id',cid).eq('owner_id',this.uid).select('id'));if(!rows?.length)throw new Error('Нет прав на изменение аватара канала.');}
  async channel(cid){
    const ch=must(await this.sb.from('rndm_channels').select('*').eq('id',cid).maybeSingle());
    if(!ch)throw new Error('Канал не найден.');
    const [sub,count]=await Promise.all([
      this.sb.from('rndm_channel_subscriptions').select('channel_id').eq('channel_id',cid).eq('user_id',this.uid).maybeSingle(),
      this.sb.from('rndm_channel_subscriptions').select('channel_id',{count:'exact',head:true}).eq('channel_id',cid)
    ]);
    if(sub.error)throw sub.error;
    return {...ch,id:sid(ch.id),kind:'channel',title:ch.name,preview:ch.description||'',joined:!!sub.data,count:Math.max(0,Number(count.count||ch.promo_subscribers||0))};
  }
  async channels(){
    // Never automatically enumerate every public channel. Load only mine / subscribed.
    const [sub,owned]=await Promise.all([
      this.sb.from('rndm_channel_subscriptions').select('channel_id').eq('user_id',this.uid).limit(400),
      this.sb.from('rndm_channels').select('*').eq('owner_id',this.uid).limit(400)
    ]);
    const subs=must(sub)||[],mine=must(owned)||[],ids=[...new Set([...subs.map(x=>x.channel_id),...mine.map(x=>x.id)])];
    if(!ids.length)return [];
    const rows=must(await this.sb.from('rndm_channels').select('*').in('id',ids).order('created_at',{ascending:false}).limit(400))||[];
    return rows.map(ch=>({...ch,id:sid(ch.id),kind:'channel',title:ch.name,preview:ch.description||'',joined:subs.some(s=>s.channel_id===ch.id)||ch.owner_id===this.uid,count:Number(ch.promo_subscribers||0)}));
  }
  async directoryChannels(query='',offset=0,limit=30){
    // Only rows that existing server-side RLS allows the current user to read.
    // Do not copy channels into dialogs or create database records.
    const safe=String(query||'').trim().replace(/^@/,'').replace(/[^\p{L}\p{N}_ -]/gu,'').slice(0,40).trim();
    const page=Math.max(0,Number(offset)||0),size=Math.max(1,Math.min(50,Number(limit)||30));
    let request=this.sb.from('rndm_channels').select('*');
    if(safe.length>=2)request=request.or(`name.ilike.%${safe}%,handle.ilike.%${safe}%`);
    else if(safe)request=request.ilike('name',`%${safe}%`);
    const rows=must(await request.order('created_at',{ascending:false}).range(page,page+size-1))||[];
    if(!rows.length)return [];
    const existing=await this.sb.from('rndm_channel_subscriptions').select('channel_id').eq('user_id',this.uid).in('channel_id',rows.map(x=>x.id));
    // If subscriptions are temporarily unavailable, still show the readable catalog.
    const joined=new Set((existing.data||[]).map(x=>x.channel_id));
    return rows.map(ch=>({...ch,id:sid(ch.id),kind:'channel',title:ch.name,
      preview:ch.description||'Канал RNDM',joined:ch.owner_id===this.uid||joined.has(ch.id),
      count:Number(ch.promo_subscribers||0)}));
  }
  async searchChannels(query){
    const value=String(query||'').trim().replace(/^@/,'').replace(/[^\p{L}\p{N}_ -]/gu,'').slice(0,40).trim();
    if(value.length<2)return [];
    const rows=must(await this.sb.from('rndm_channels').select('*')
       .or(`name.ilike.%${value}%,handle.ilike.%${value}%`)
       .order('created_at',{ascending:false}).limit(30))||[];
    if(!rows.length)return [];
    const [subs,counts]=await Promise.all([
      this.sb.from('rndm_channel_subscriptions').select('channel_id').eq('user_id',this.uid).in('channel_id',rows.map(x=>x.id)),
      this.sb.from('rndm_channel_subscriptions').select('channel_id').in('channel_id',rows.map(x=>x.id)).limit(3000)
    ]);
    if(subs.error)throw subs.error;
    const joined=new Set((subs.data||[]).map(x=>x.channel_id));
    const countMap={};for(const entry of counts.data||[])countMap[entry.channel_id]=(countMap[entry.channel_id]||0)+1;
    return rows.map(ch=>({...ch,id:sid(ch.id),kind:'channel',title:ch.name,preview:ch.description||'',joined:joined.has(ch.id)||ch.owner_id===this.uid,count:Math.max(countMap[ch.id]||0,Number(ch.promo_subscribers||0))}));
  }
  async join(cid,leave=false) { if (leave) must(await this.sb.from('rndm_channel_subscriptions').delete().eq('channel_id',cid).eq('user_id',this.uid)); else must(await this.sb.from('rndm_channel_subscriptions').insert({channel_id:cid,user_id:this.uid})); }
  async createChannel(name,description) {
    name=String(name||'').trim(); description=String(description||'').trim();
    if(name.length<2||name.length>15)throw new Error('Название канала: от 2 до 15 символов.');
    if(description.length>50)throw new Error('Описание канала: максимум 50 символов.');
    const channel=must(await this.sb.from('rndm_channels').insert({owner_id:this.uid,name,description,emoji:'📡',handle:'ch_'+crypto.randomUUID().replaceAll('-','').slice(0,12)}).select().single());
    // Ownership is sufficient for publishing even if subscribing is unavailable.
    await this.sb.from('rndm_channel_subscriptions').insert({channel_id:channel.id,user_id:this.uid});
    return channel;
  }
  async posts(cid,before=null) {
    let query=this.sb.from('rndm_channel_posts').select('*').eq('channel_id',cid).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(60);
    if (before) query=query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
    return (must(await query) || []).reverse().map(x=>({...x,sender_id:x.author_id}));
  }
  async publish(cid,body,file) {
    let upload=null; if (file) upload=await this.upload('channel-files',file,'posts');
    try { return must(await this.sb.from('rndm_channel_posts').insert({channel_id:cid,author_id:this.uid,body,attachment_url:upload?.url || null,attachment_name:upload?.name || null,attachment_type:upload?.type || null}).select().single()); }
    catch(error) { if (upload && !/fetch|network|abort|timeout/i.test(error.message || '')) await this.sb.storage.from(upload.bucket).remove([upload.path]); throw error; }
  }
  async channelTools(cid){if(this.channelToolsUnavailable)return null;const result=await this.sb.rpc('rndm_v64_channel_state',{p_channel:String(cid)});if(result.error){if(['PGRST202','42883'].includes(result.error.code)){this.channelToolsUnavailable=true;return null;}throw result.error;}return result.data;}
  async channelPin(cid,mid=null){return must(await this.sb.rpc('rndm_v64_channel_pin',{p_channel:String(cid),p_post:mid===null?null:String(mid)}));}
  async channelStaff(cid,user,role){return must(await this.sb.rpc('rndm_v64_channel_staff',{p_channel:String(cid),p_user:user,p_role:role}));}
  async editPost(cid,mid,body){return {...must(await this.sb.from('rndm_channel_posts').update({body:String(body).trim().slice(0,4000)}).eq('channel_id',cid).eq('id',mid).eq('author_id',this.uid).select().single()),sender_id:this.uid};}
  async commonGroups(uid,dialogs){const groups=dialogs.filter(x=>x.kind==='group').slice(0,400);if(!groups.length)return [];const rows=must(await this.sb.from('conversation_members').select('conversation_id').eq('user_id',uid).in('conversation_id',groups.map(x=>x.id)))||[];const ids=new Set(rows.map(x=>String(x.conversation_id)));return groups.filter(x=>ids.has(String(x.id)));}
  async reportUser(uid,reason,details){if(!uid||uid===this.uid)throw new Error('Выбери другого пользователя.');return must(await this.sb.from('reports').insert({reporter_id:this.uid,target_user_id:uid,reason:String(reason).slice(0,80),details:String(details).slice(0,1000),status:'open'}).select('id').single());}
  async deletePost(mid) { const rows=must(await this.sb.from('rndm_channel_posts').delete().eq('id',mid).eq('author_id',this.uid).select('id')); if (!rows?.length) throw new Error('Сервер не подтвердил удаление.'); }
  async comments(pid) {
    const rows=must(await this.sb.from('rndm_channel_comments').select('*').eq('post_id',pid).order('created_at',{ascending:true})) || [];
    const people=await this.profiles(rows.map(x=>x.user_id)); return rows.map(row=>({...row,person:people.find(x=>x.id===row.user_id)}));
  }
  async comment(pid,body) { return must(await this.sb.from('rndm_channel_comments').insert({post_id:pid,user_id:this.uid,body}).select().single()); }
  async updateProfile(value) {
    if('username' in value&&String(value.username).length>15)throw new Error('Ник: максимум 15 символов.');
    if('display_name' in value&&String(value.display_name).length>15)throw new Error('Имя: максимум 15 символов.');
    if('bio' in value&&String(value.bio||'').length>50)throw new Error('Описание: максимум 50 символов.');
    const changed=must(await this.sb.from('profiles').update(value).eq('id',this.uid).select('id')); if(!changed?.length)throw new Error('Сервер не подтвердил сохранение профиля.'); return this.profile();
  }
  async heartbeat() { await this.sb.from('profiles').update({last_seen:now()}).eq('id',this.uid); }
  async typing(cid,activity='typing') { await this.sb.from('typing_states').upsert({conversation_id:cid,user_id:this.uid,activity,updated_at:now()}); }
  async typers(cid) { return must(await this.sb.from('typing_states').select('user_id,activity,updated_at').eq('conversation_id',cid).neq('user_id',this.uid).gt('updated_at',new Date(Date.now()-5500).toISOString())) || []; }
  watch(table,filter,callback,status) {
    return this.sb.channel('rndm30-'+table+'-'+crypto.randomUUID()).on('postgres_changes',{event:'*',schema:'public',table,...(filter ? {filter} : {})},callback).subscribe(status);
  }
  unwatch(channel) {if(channel)try{Promise.resolve(this.sb.removeChannel(channel)).catch(()=>{});}catch{}}


  async catState(){return must(await this.sb.rpc('rndm_cat_state'));}
  async catTap(amount=1){return must(await this.sb.rpc('rndm_cat_tap',{amount:Math.min(8,Math.max(1,Number(amount)||1))}));}
  async catUpgrade(kind){return must(await this.sb.rpc('rndm_cat_upgrade',{kind}));}
  async followingIds(){return (must(await this.sb.from('rndm_follows').select('followee_id').eq('follower_id',this.uid))||[]).map(x=>x.followee_id);}
  async followUser(userId,following){if(userId===this.uid)throw new Error('Нельзя подписаться на себя');
    if(following)return must(await this.sb.from('rndm_follows').delete().eq('follower_id',this.uid).eq('followee_id',userId).select());
    return must(await this.sb.from('rndm_follows').insert({follower_id:this.uid,followee_id:userId}).select());
  }
  async profileMoments(userId){return must(await this.sb.from('profile_moments').select('id,user_id,body,media_url,media_type,is_featured,created_at').eq('user_id',userId).order('is_featured',{ascending:false}).order('created_at',{ascending:false}).limit(30))||[];}
  async createProfileMoment(body){const text=String(body||'').trim();if(!text||text.length>1000)throw new Error('Публикация должна содержать 1–1000 символов');return must(await this.sb.from('profile_moments').insert({user_id:this.uid,body:text}).select().single());}
  async deleteProfileMoment(id){return must(await this.sb.from('profile_moments').delete().eq('user_id',this.uid).eq('id',id).select('id'));}
  async pinProfileMoment(id){
    const old=await this.sb.from('profile_moments').update({is_featured:false}).eq('user_id',this.uid).eq('is_featured',true);
    if(old.error)throw old.error;
    return must(await this.sb.from('profile_moments').update({is_featured:true}).eq('user_id',this.uid).eq('id',id).select('id'));
  }
  async tapolkaTap(amount=1) { const data=must(await this.sb.rpc('rndm_tapolka_tap',{amount})); return Number(data||0); }
  async tapolkaLeaderboard(limit=20) { return must(await this.sb.rpc('rndm_tapolka_leaderboard',{max_rows:limit})) || []; }
}
