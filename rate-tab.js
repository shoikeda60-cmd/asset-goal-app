(() => {
  if (window.AssetGoalTabs) return;
  const home=document.querySelector('.wrap');
  if(!home) return;

  const style=document.createElement('style');
  style.textContent=`
    body{padding-bottom:78px}
    #appTabBar{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);border-top:1px solid #e5e7eb;padding:8px 10px calc(8px + env(safe-area-inset-bottom))}
    #appTabBar .tab-inner{width:min(740px,100%);margin:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
    #appTabBar button{padding:10px 4px;border:0;border-radius:12px;background:#f1f5f9;color:#475569;font-weight:800;font-size:13px}
    #appTabBar button.active{background:#2563eb;color:#fff;box-shadow:0 6px 16px rgba(37,99,235,.22)}
    .fx-page{max-width:760px;margin:0 auto;padding:0 0 92px}
    .fx-page[hidden]{display:none!important}
  `;
  document.head.appendChild(style);

  const bar=document.createElement('nav');
  bar.id='appTabBar';
  bar.innerHTML='<div class="tab-inner"><button type="button" data-tab="home" class="active">ホーム</button></div>';
  document.body.appendChild(bar);
  const inner=bar.querySelector('.tab-inner');
  const pages=new Map();

  function refreshGrid(){ inner.style.gridTemplateColumns=`repeat(${1+pages.size},1fr)`; }
  function setTab(id){
    home.hidden=id!=='home';
    pages.forEach((p,key)=>{p.el.hidden=key!==id;});
    inner.querySelectorAll('button[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));
    if(id!=='home' && pages.has(id)) pages.get(id).onShow?.();
    window.scrollTo({top:0,behavior:'instant'});
  }
  inner.querySelector('[data-tab="home"]').onclick=()=>setTab('home');

  window.AssetGoalTabs={
    register({id,label,element,onShow}){
      if(!id||!element||pages.has(id)) return;
      element.classList.add('fx-page'); element.hidden=true;
      home.insertAdjacentElement('afterend',element);
      pages.set(id,{el:element,onShow});
      const b=document.createElement('button'); b.type='button'; b.dataset.tab=id; b.textContent=label||id;
      b.onclick=()=>setTab(id); inner.appendChild(b); refreshGrid();
    },
    setTab
  };
})();