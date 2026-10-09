import {$,esc,icon,avatar,errorText} from './core.js?v=56.0.0';
const must=r=>{if(r.error)throw r.error;return r.data;};

export class Calls {
  constructor(api,toast){this.api=api;this.sb=api.sb;this.toast=toast;this.client=crypto.randomUUID();this.active=null;this.incoming=null;this.busy=false;this.polling=false;}
  start(){
    this.stopped=false;
    this.channel=this.api.watch('call_invites',null,()=>this.pollInvites().catch(()=>{}));
    this.timer=setInterval(()=>this.pollInvites().catch(()=>{}),3000);
    this.pollInvites().catch(()=>{});
  }
  async stop(){this.stopped=true;clearInterval(this.timer);this.api.unwatch(this.channel);this.clearIncoming();await this.end();}
  async pollInvites(){
    if(this.stopped||this.polling)return;this.polling=true;
    try{
      const rows=must(await this.sb.from('call_invites').select('*').or(`caller_id.eq.${this.api.uid},callee_id.eq.${this.api.uid}`).order('created_at',{ascending:false}).limit(25))||[];
      if(this.stopped)return;
      if(this.active?.invite){const row=rows.find(x=>x.id===this.active.invite);if(row&&['declined','ended','missed'].includes(row.status)){await this.end(false);this.toast(row.status==='declined'?'Звонок отклонён':'Звонок завершён');}}
      const incoming=rows.find(x=>x.callee_id===this.api.uid&&x.status==='ringing'&&Date.now()-new Date(x.created_at).getTime()<60000);
      if(this.incoming&&!rows.some(x=>x.id===this.incoming.id&&x.status==='ringing'))this.clearIncoming();
      if(incoming&&!this.active&&!this.busy&&this.incoming?.id!==incoming.id)await this.showIncoming(incoming);
    }finally{this.polling=false;}
  }
  clearIncoming(){this.incoming=null;$('#incomingCall')?.remove();}
  async showIncoming(invite){
    this.incoming=invite;const person=(await this.api.profiles([invite.caller_id]))[0];if(this.incoming?.id!==invite.id||this.stopped)return;
    $('#incomingCall')?.remove();const box=document.createElement('section');box.id='incomingCall';box.className='incoming-call';box.setAttribute('role','alert');
    box.innerHTML=`${avatar(person)}<div><small>Входящий ${invite.mode==='audio'?'аудио':'видео'}звонок</small><b>${esc(person?.display_name||person?.username||'Пользователь')}</b></div><button class="secondary" data-call-reject>Отклонить</button><button class="primary" data-call-accept>Принять</button>`;
    document.body.append(box);
    box.querySelector('[data-call-reject]').onclick=async e=>{e.currentTarget.disabled=true;try{must(await this.sb.rpc('respond_call_invite',{p_invite:invite.id,p_accept:false}));this.clearIncoming();}catch(error){this.toast(errorText(error));e.currentTarget.disabled=false;}};
    box.querySelector('[data-call-accept]').onclick=()=>this.accept(invite,person).catch(e=>this.toast(errorText(e)));
  }
  async media(mode){
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Для звонка открой сайт по HTTPS и разреши микрофон.');
    try{return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:mode==='video'?{width:{ideal:640},height:{ideal:480},facingMode:'user'}:false});}
    catch(e){throw new Error(e.name==='NotAllowedError'?'Разреши доступ к микрофону'+(mode==='video'?' и камере':'')+' в браузере.':e.name==='NotFoundError'?'Микрофон или камера не найдены.':e.message);}
  }
  async dial(person,mode='audio'){
    if(this.active||this.busy)throw new Error('Сначала заверши текущий звонок.');this.busy=true;let stream;
    try{
      stream=await this.media(mode);if(this.stopped){stream.getTracks().forEach(t=>t.stop());return;}
      const data=must(await this.sb.rpc('invite_call',{p_target:person.id,p_mode:mode,p_client:this.client}));
      const active={room:data.room_id,invite:data.invite_id,role:'host',mode,person,stream,last:0,ice:[],chain:Promise.resolve(),closed:false};this.active=active;if(this.stopped){await this.end();return;}
      await this.setup(active);this.status('Вызываем…');
    }catch(e){stream?.getTracks().forEach(t=>t.stop());await this.end();throw e;}finally{this.busy=false;}
  }
  async accept(invite,person){
    if(this.active||this.busy)return;this.busy=true;let stream;
    const button=$('[data-call-accept]');if(button)button.disabled=true;
    try{
      stream=await this.media(invite.mode);if(this.stopped){stream.getTracks().forEach(t=>t.stop());return;}
      const response=must(await this.sb.rpc('respond_call_invite',{p_invite:invite.id,p_accept:true}));
      if(response.status!=='accepted')throw new Error('Звонок уже завершён.');
      must(await this.sb.rpc('join_call_room_v2',{p_room:invite.room_id,p_client:this.client}));
      const active={room:invite.room_id,invite:invite.id,role:'guest',mode:invite.mode,person,stream,last:0,ice:[],chain:Promise.resolve(),closed:false};this.active=active;this.clearIncoming();if(this.stopped){await this.end();return;}
      await this.setup(active);await this.send(active,'ready');
    }catch(e){stream?.getTracks().forEach(t=>t.stop());await this.end();throw e;}finally{this.busy=false;if(button?.isConnected)button.disabled=false;}
  }
  status(text){const el=$('#callStatus');if(el)el.textContent=text;}
  async send(a,kind,payload={}){if(a.closed)return;must(await this.sb.rpc('send_call_signal_v2',{p_room:a.room,p_client:this.client,p_kind:kind,p_payload:payload}));}
  async setup(a){
    const box=document.createElement('section');box.id='activeCall';box.className='call-overlay';box.setAttribute('role','dialog');box.setAttribute('aria-label','Звонок');
    box.innerHTML=`<div class="call-card"><div class="call-heading">${avatar(a.person)}<div><h2>${esc(a.person?.display_name||a.person?.username||'Пользователь')}</h2><p id="callStatus" role="status">Соединяем…</p></div></div><div class="call-media ${a.mode==='audio'?'audio-only':''}"><video id="remoteCallVideo" autoplay playsinline></video><video id="localCallVideo" autoplay muted playsinline></video>${a.mode==='audio'?'<div class="audio-avatar">'+avatar(a.person,'large')+'</div>':''}</div><button class="text-button" id="callPlay" hidden>Включить звук собеседника</button><div class="call-controls"><button class="secondary" id="callMic" aria-pressed="false">${icon('mic')}Микрофон</button>${a.mode==='video'?`<button class="secondary" id="callCam" aria-pressed="false">${icon('video')}Камера</button>`:''}<button class="primary call-end" id="callEnd">${icon('phone')}Завершить</button></div></div>`;
    document.body.append(box);$('#localCallVideo').srcObject=a.stream;
    $('#callEnd').onclick=()=>this.end().catch(e=>this.toast(errorText(e)));
    $('#callMic').onclick=e=>{const tracks=a.stream.getAudioTracks(),enabled=!tracks[0]?.enabled;tracks.forEach(t=>t.enabled=enabled);e.currentTarget.setAttribute('aria-pressed',String(!enabled));e.currentTarget.classList.toggle('off',!enabled);};
    if($('#callCam'))$('#callCam').onclick=e=>{const tracks=a.stream.getVideoTracks(),enabled=!tracks[0]?.enabled;tracks.forEach(t=>t.enabled=enabled);e.currentTarget.setAttribute('aria-pressed',String(!enabled));e.currentTarget.classList.toggle('off',!enabled);};
    $('#callPlay').onclick=async()=>{try{await $('#remoteCallVideo').play();$('#callPlay').hidden=true;}catch{this.toast('Нажми ещё раз, чтобы включить звук.');}};
    a.pc=new RTCPeerConnection({iceServers:window.RNDM_CONFIG.iceServers||[{urls:['stun:stun.l.google.com:19302','stun:stun.cloudflare.com:3478']}],iceCandidatePoolSize:2});
    a.stream.getTracks().forEach(track=>a.pc.addTrack(track,a.stream));
    a.pc.ontrack=e=>{if(a.closed)return;const remote=$('#remoteCallVideo');a.remote ||= new MediaStream();if(!a.remote.getTracks().includes(e.track))a.remote.addTrack(e.track);remote.srcObject=a.remote;remote.play().catch(()=>{$('#callPlay').hidden=false;});};
    a.pc.onicecandidate=e=>{if(e.candidate)this.send(a,'ice',{candidate:e.candidate.toJSON()}).catch(err=>this.status(errorText(err)));};
    a.pc.onconnectionstatechange=()=>{
      if(a.closed)return;const state=a.pc.connectionState;
      if(state==='connected'){clearTimeout(a.timeout);clearTimeout(a.disconnect);this.status('На связи');}
      else if(state==='failed'){this.toast('Соединение не установлено. Попробуй другую сеть; для сложных сетей нужен TURN.');this.end().catch(()=>{});}
      else if(state==='disconnected'){this.status('Связь прервалась…');clearTimeout(a.disconnect);a.disconnect=setTimeout(()=>this.end().catch(()=>{}),20000);}
    };
    // One serialized reader: realtime only wakes the reader, never advances its cursor.
    a.channel=this.api.watch('call_signals','room_id=eq.'+a.room,()=>this.pull(a));
    a.roomChannel=this.api.watch('call_rooms','id=eq.'+a.room,p=>{if(p.new?.status==='ended'&&!a.closed)this.end(false).catch(()=>{});});
    a.timer=setInterval(()=>this.pull(a),1000);
    a.timeout=setTimeout(()=>{if(this.active===a){this.toast('Нет ответа или не удалось установить соединение.');this.end().catch(()=>{});}},60000);
    await this.pull(a);
  }
  pull(a){
    if(a.closed||a.pulling)return a.chain;a.pulling=true;
    a.chain=a.chain.catch(()=>{}).then(async()=>{
      const rows=must(await this.sb.from('call_signals').select('*').eq('room_id',a.room).gt('id',a.last).order('id',{ascending:true}).limit(100))||[];
      for(const row of rows){if(a.closed)return;if(row.sender_client!==this.client)await this.signal(a,row);a.last=Number(row.id);}
    }).catch(e=>{if(!a.closed)this.status('Проверяем связь: '+errorText(e));}).finally(()=>a.pulling=false);return a.chain;
  }
  async signal(a,row){
    const p=row.payload||{},pc=a.pc;
    if(row.kind==='ready'&&a.role==='host'&&pc.signalingState==='stable'){
      await pc.setLocalDescription(await pc.createOffer());await this.send(a,'offer',{sdp:pc.localDescription.toJSON()});
    }else if(row.kind==='offer'&&a.role==='guest'){
      await pc.setRemoteDescription(p.sdp);await this.flush(a);await pc.setLocalDescription(await pc.createAnswer());await this.send(a,'answer',{sdp:pc.localDescription.toJSON()});
    }else if(row.kind==='answer'&&a.role==='host'&&pc.signalingState==='have-local-offer'){
      await pc.setRemoteDescription(p.sdp);await this.flush(a);
    }else if(row.kind==='ice'&&p.candidate){if(pc.remoteDescription)await pc.addIceCandidate(p.candidate);else a.ice.push(p.candidate);}
    else if(row.kind==='hangup'){await this.end(false);this.toast('Собеседник завершил звонок');}
  }
  async flush(a){for(const c of a.ice.splice(0))await a.pc.addIceCandidate(c);}
  async end(notify=true){
    const a=this.active;if(!a)return;this.active=null;a.closed=true;
    clearInterval(a.timer);clearTimeout(a.timeout);clearTimeout(a.disconnect);this.api.unwatch(a.channel);this.api.unwatch(a.roomChannel);
    a.pc?.close();a.stream?.getTracks().forEach(t=>t.stop());$('#activeCall')?.remove();
    if(notify){const r=await this.sb.rpc('end_call_room_v2',{p_room:a.room,p_client:this.client});if(r.error)must(await this.sb.rpc('finish_call_invite',{p_room:a.room}));}
  }
  async history(host){
    host.innerHTML='<div class="sidebar-empty"><span class="spinner"></span></div>';
    try{
      const rows=must(await this.sb.from('call_invites').select('*').or(`caller_id.eq.${this.api.uid},callee_id.eq.${this.api.uid}`).order('created_at',{ascending:false}).limit(50))||[];
      const people=await this.api.profiles(rows.map(r=>r.caller_id===this.api.uid?r.callee_id:r.caller_id));if(!host.isConnected)return;
      const labels={ringing:'Без ответа',accepted:'Принят',declined:'Отклонён',ended:'Завершён',missed:'Пропущен'};
      host.innerHTML=rows.map(r=>{const p=people.find(p=>p.id===(r.caller_id===this.api.uid?r.callee_id:r.caller_id));return `<article class="call-history">${avatar(p)}<div><b>${esc(p?.display_name||p?.username||'Пользователь')}</b><p>${r.caller_id===this.api.uid?'Исходящий':'Входящий'} · ${labels[r.status]||esc(r.status)} · ${new Date(r.created_at).toLocaleString('ru-RU')}</p></div><button class="icon-button" data-call-user="${esc(p?.id||'')}" data-call-mode="${r.mode}" aria-label="Позвонить снова">${icon(r.mode==='video'?'video':'phone')}</button></article>`;}).join('')||'<div class="sidebar-empty"><p>Звонков пока нет. Открой личный чат и нажми на телефон или камеру.</p></div>';
    }catch(e){host.innerHTML=`<div class="notice error-notice">${esc(errorText(e))}</div>`;}
  }
}
