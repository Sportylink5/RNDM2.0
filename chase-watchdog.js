// Fail visibly if an old PWA cached a missing/invalid module, instead of "Загрузка..." forever.
(()=>{let done=false;
 const error=()=>{if(done)return;const label=document.getElementById('notice');if(label&&/Подключение|Загрузка/.test(label.textContent||'')){
  label.textContent='Игра не загрузилась. Проверь сеть и обнови сайт; возможно, браузер сохранил старые файлы.';
  label.classList.add('error');document.getElementById('retryConnection')?.removeAttribute('hidden');}
 };
 window.addEventListener('error',e=>{if(e?.filename&&(/chase(?:-map)?\.js/.test(e.filename)))error();});
 window.addEventListener('unhandledrejection',e=>{console.warn('RNDM Chase',e.reason)});
 window.addEventListener('load',()=>setTimeout(error,13000));
 document.addEventListener('chase-init-ok',()=>{done=true});
})();
