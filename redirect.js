(()=>{const name=location.pathname.split('/').pop()||'index.html';const u=new URL('index.html',location.href);
const views={'admin.html':'admin','calls.html':'calls','channels.html':'channels','clips.html':'clips','contacts.html':'contacts'};
const chosen=views[name]||(name==='profile.html'?(new URLSearchParams(location.search).has('user')?'profile':'settings'):null);
u.search=location.search;
if(chosen)u.searchParams.set('view',chosen);
if(name==='reset-password.html')u.searchParams.set('recovery','1');
u.hash=location.hash;
if(name!=='index.html')location.replace(u.href);
})();
