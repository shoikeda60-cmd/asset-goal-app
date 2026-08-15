const CACHE='asset-goal-v14-tab-rename';
const ASSETS=['./','./index.html','./manifest.webmanifest','./cashflow.js','./delete-sync.js','./chart-axis.js','./rate-tab.js','./rate-sbi.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
  self.clients.claim()
])));
function enhanceHtml(html){
  const scripts=[];
  if(!html.includes('cashflow.js')) scripts.push('<script src="./cashflow.js?v=14"></script>');
  if(!html.includes('delete-sync.js')) scripts.push('<script src="./delete-sync.js?v=14"></script>');
  if(!html.includes('chart-axis.js')) scripts.push('<script src="./chart-axis.js?v=14"></script>');
  if(!html.includes('rate-tab.js')) scripts.push('<script src="./rate-tab.js?v=14"></script>');
  if(!html.includes('rate-sbi.js')) scripts.push('<script src="./rate-sbi.js?v=14"></script>');
  return scripts.length?html.replace('</body>',scripts.join('')+'</body>'):html;
}
async function pageWithEnhancements(req){
  try{
    const r=await fetch(req,{cache:'no-store'});
    const html=enhanceHtml(await r.text());
    return new Response(html,{status:r.status,statusText:r.statusText,headers:{'Content-Type':'text/html; charset=utf-8'}});
  }catch(e){
    const cached=await caches.match('./index.html');
    if(!cached) throw e;
    const html=enhanceHtml(await cached.text());
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }
}
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'){
    e.respondWith(pageWithEnhancements(e.request));
    return;
  }
  const path=new URL(e.request.url).pathname;
  if(path.endsWith('/cashflow.js')||path.endsWith('/delete-sync.js')||path.endsWith('/chart-axis.js')||path.endsWith('/rate-tab.js')||path.endsWith('/rate-sbi.js')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
      const c=r.clone();
      caches.open(CACHE).then(cache=>cache.put(e.request,c));
      return r;
    }).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});