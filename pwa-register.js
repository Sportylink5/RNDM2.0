if('serviceWorker' in navigator&&location.protocol==='https:'){
  let reloading=false,requested=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requested&&!reloading){reloading=true;location.reload();}});
  const offer=reg=>{
    if(!reg.waiting||document.getElementById('pwaUpdate'))return;
    const banner=document.createElement('div');banner.id='pwaUpdate';banner.className='update-banner';banner.setAttribute('role','status');
    banner.innerHTML='<span>Новая версия RNDM<small>Черновики сохранятся при обновлении</small></span><button type="button" class="primary">Обновить</button><button type="button" class="icon-button" aria-label="Обновить позже">×</button>';
    banner.querySelector('.primary').onclick=()=>{if(!window.dispatchEvent(new Event('RNDM_BEFORE_UPDATE',{cancelable:true}))){banner.querySelector('small').textContent='Заверши отправку, запись или звонок';return;}requested=true;reg.waiting?.postMessage('SKIP_WAITING');};
    banner.querySelector('.icon-button').onclick=()=>banner.remove();document.body.append(banner);
  };
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=72.0.0',{scope:'./',updateViaCache:'none'}).then(reg=>{
    offer(reg);reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)offer(reg);});});
    reg.update().catch(()=>{});
  }).catch(()=>{}));
}
