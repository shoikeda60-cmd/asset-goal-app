const CACHE='asset-goal-v7-profit-chart';
const ASSETS=['./','./index.html','./manifest.webmanifest','./cashflow.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
  self.clients.claim()
])));
async function pageWithCashflow(req){
  try{
    const r=await fetch(req,{cache:'no-store'});
    let html=await r.text();
    if(!html.includes('cashflow.js')) html=html.replace('</body>','<script src="./cashflow.js?v=7"></script></body>');
    return new Response(html,{status:r.status,statusText:r.statusText,headers:{'Content-Type':'text/html; charset=utf-8'}});
  }catch(e){
    const cached=await caches.match('./index.html');
    if(!cached) throw e;
    let html=await cached.text();
    if(!html.includes('cashflow.js')) html=html.replace('</body>','<script src="./cashflow.js?v=7"></script></body>');
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
  }
}
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'){
    e.respondWith(pageWithCashflow(e.request));
    return;
  }
  if(new URL(e.request.url).pathname.endsWith('/cashflow.js')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const c=r.clone();caches.open(CACHE).then(cache=>cache.put('./cashflow.js',c));return r;}).catch(()=>caches.match('./cashflow.js')));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
