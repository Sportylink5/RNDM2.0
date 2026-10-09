if('serviceWorker' in navigator&&location.protocol==='https:'){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=56.0.0',
 {scope:'./',updateViaCache:'none'}).then(reg=>reg.update().catch(console.warn)).catch(console.warn));
}
