/* RNDM Chat v67.2: fail-visible startup; does not read or erase account tokens. */
(()=>{
  'use strict';
  try{document.documentElement.dataset.theme=localStorage.getItem('rndm-theme')==='light'?'light':'dark';}catch{}
  const VERSION='67.2.0', BASE=new URL('./',location.href), problems=[];
  const trim=x=>String(x??'').replace(/[\u0000-\u001f<>]/g,' ').slice(0,220);
  const note=x=>{const msg=trim(x);if(msg&&!problems.includes(msg))problems.push(msg);};
  const loading=()=>!!document.querySelector('#root > .boot .spinner');
  const elt=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
  async function inspect(){
    const target=document.getElementById('rndmDiagnoseResults');if(!target)return;
    const assets=['app.js','api.js','views.js','core.js','together.js','together-games.js','supabase-2.117.2.js'];
    const outputs=[];
    for(const filename of assets){
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4000);
      try{
        const u=new URL(filename,BASE);u.searchParams.set('check',VERSION+'-'+Date.now());
        const r=await fetch(u,{cache:'no-store',signal:controller.signal});
        const type=r.headers.get('content-type')||'';
        outputs.push((r.ok && (/javascript|ecmascript|text\/plain|application\/octet-stream/i.test(type))?'✓ ':'✕ ')+filename+' · HTTP '+r.status+(r.ok&&!/javascript|ecmascript|text\/plain|application\/octet-stream/i.test(type)?' · неверный тип файла':'') );
      }catch(err){outputs.push('✕ '+filename+' · нет ответа '+trim(err?.message));}
      finally{clearTimeout(timer);}
    }
    target.textContent=outputs.join('\n');
  }
  async function cleanCache(){
    const button=document.getElementById('rndmRepair');if(button){button.disabled=true;button.textContent='Обновляем…';}
    try{
      if('serviceWorker' in navigator){
        const all=await navigator.serviceWorker.getRegistrations();
        await Promise.all(all.filter(r=>r.scope===BASE.href).map(r=>r.unregister()));
      }
      if('caches' in window){
        const keys=await caches.keys(), ours='rndm-'+encodeURIComponent(BASE.pathname)+'-';
        await Promise.all(keys.filter(k=>k.startsWith(ours)).map(k=>caches.delete(k)));
      }
    }catch(err){note('Не удалось очистить кэш: '+trim(err?.message));}
    const u=new URL('index.html',BASE);u.searchParams.set('repair',VERSION+'-'+Date.now());
    location.replace(u.href);
  }
  function show(){
    if(!loading()||document.getElementById('rndmDiagnostic'))return;
    const root=document.getElementById('root');if(!root)return;
    const panel=elt('section');panel.id='rndmDiagnostic';panel.className='boot';
    panel.style.cssText='max-width:530px;margin:6vh auto;padding:24px;border-radius:18px;text-align:left;display:block;line-height:1.5';
    const title=elt('h2','RNDM Chat не смог запуститься');
    title.style.cssText='font-size:22px;margin:0 0 8px';
    const description=elt('p',problems[0]||'Подключение или загрузка одного из модулей занимает слишком много времени.');
    const reassurance=elt('p','Твоя переписка и аккаунт не удалены. Можно проверить файлы и обновить только кэш приложения.');
    reassurance.style.opacity='.8';
    const actions=elt('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
    const button=(text,fn)=>{const b=elt('button',text);b.type='button';b.style.cssText='padding:10px 14px;border-radius:10px;background:#513ea9;color:white;border:1px solid #968af1;cursor:pointer;font:inherit';b.addEventListener('click',fn);return b;};
    const reload=button('Повторить',()=>location.reload());
    const fix=button('Очистить кэш и открыть сайт',cleanCache);fix.id='rndmRepair';
    const test=button('Проверить файлы',inspect);
    actions.append(reload,fix,test);
    const results=elt('pre');results.id='rndmDiagnoseResults';results.style.cssText='font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere';
    const foot=elt('small','Диагностика v'+VERSION+' · Если проверка показывает ✕ — соответствующий файл не опубликован на GitHub Pages.');
    panel.append(title,description,reassurance,actions,results,foot);
    root.replaceChildren(panel);
  }
  addEventListener('error',event=>{
    const node=event.target;
    if(node?.tagName==='SCRIPT'||node?.tagName==='LINK')note('Не загрузился файл: '+(node.getAttribute('src')||node.getAttribute('href')||'ресурс'));
    else if(event.error)note('Ошибка JavaScript: '+(event.error.message||'неизвестная'));
  },true);
  addEventListener('unhandledrejection',event=>note('Ошибка запуска: '+(event.reason?.message||event.reason||'неизвестная')));
  addEventListener('DOMContentLoaded',()=>setTimeout(show,14500),{once:true});
  window.RNDM_STARTUP_GUARD={version:VERSION,show,problems};
})();
