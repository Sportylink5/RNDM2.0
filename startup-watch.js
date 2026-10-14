/* RNDM v67.1: page bootstrap diagnostic; NEVER touches user tokens/settings. */
(()=>{
  'use strict';
  const version='67.1.0';
  const root=()=>document.getElementById('root');
  let problem='',shown=false;
  const cleanMessage=text=>String(text||'').replace(/[<>\u0000-\u001f]/g,'').slice(0,250);
  function onBoot(){
    const el=root();
    return el && el.querySelector('.boot .spinner');
  }
  function show(reason){
    const el=root();if(!el||!onBoot()||shown)return;
    shown=true;
    const section=document.createElement('section');section.className='boot rndm-load-error';
    section.style.cssText='max-width:500px;margin:8vh auto;padding:20px;text-align:center;';
    const title=document.createElement('h2');title.textContent='Не удалось загрузить RNDM Chat';
    const desc=document.createElement('p');desc.textContent=cleanMessage(reason||'Один из файлов не загрузился. Возможно, обновление установлено не полностью.');
    const tip=document.createElement('p');tip.textContent='Чаты и аккаунты сохранены. Установи все файлы исправления v67.1 в корень GitHub Pages.';
    const retry=document.createElement('button');retry.type='button';retry.textContent='Повторить загрузку';retry.className='primary';
    retry.onclick=()=>location.reload();
    const repair=document.createElement('button');repair.type='button';repair.textContent='Обновить кэш приложения';repair.className='secondary';
    repair.style.marginLeft='8px';
    repair.onclick=async()=>{
      repair.disabled=true;repair.textContent='Сбрасываем кэш…';
      try{
        const scope=new URL('./',location.href);
        if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration(scope.href);if(reg && reg.scope===scope.href)await reg.unregister();}
        if('caches' in window){for(const key of await caches.keys())if(key.startsWith('rndm-'))await caches.delete(key);}
      }catch(e){console.warn('RNDM cache reset:',e);}
      const url=new URL(location.href);url.searchParams.set('fix',version);location.replace(url.href);
    };
    section.append(title,desc,tip,retry,repair);
    el.replaceChildren(section);
  }
  addEventListener('error',event=>{
    const target=event.target;
    if(target && (target.tagName==='SCRIPT'||target.tagName==='LINK')){
      problem='Отсутствует файл '+(target.getAttribute('src')||target.getAttribute('href')||'ресурс')+'. Загрузите обновление полностью.';
      setTimeout(()=>show(problem),100);
    }else if(event.error){
      problem='Ошибка скрипта: '+cleanMessage(event.error.message||'');
      setTimeout(()=>show(problem),100);
    }
  },true);
  addEventListener('unhandledrejection',e=>{
    problem='Ошибка запуска: '+cleanMessage(e.reason?.message||e.reason||'');
    setTimeout(()=>show(problem),100);
  });
  // Module-import failures don't always dispatch resource error on a <script> element.
  setTimeout(()=>show(problem||'Загрузка заняла слишком много времени. Проверь интернет и полноту обновления.'),24000);
})();
