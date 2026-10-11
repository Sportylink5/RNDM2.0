if('serviceWorker' in navigator&&location.protocol==='https:'){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=58.1.0',
 {scope:'./',updateViaCache:'none'}).then(reg=>reg.update().catch(console.warn)).catch(console.warn));
}
