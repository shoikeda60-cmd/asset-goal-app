(() => {
  function totalCashflowUntilAxis(ts=null){
    return (state.cashflows||[]).reduce((sum,c)=>{
      if(ts && new Date(c.ts)>new Date(ts)) return sum;
      return sum + (c.type==='withdrawal' ? -Number(c.amount) : Number(c.amount));
    },0);
  }
  function adjustedAssetAxis(asset,ts=null){ return Number(asset); }
  function formatAxisYen(v){
    const sign=v<0?'-':'';
    const n=Math.abs(Math.round(v));
    if(n>=100000000) return sign+'¥'+(n/100000000).toFixed(n>=1000000000?1:2).replace(/\.0+$/,'')+'億';
    if(n>=10000) return sign+'¥'+(n/10000).toFixed(n>=100000?0:1).replace(/\.0$/,'')+'万';
    return sign+'¥'+n.toLocaleString('ja-JP');
  }
  function formatShortDate(d){ return (d.getMonth()+1)+'/'+d.getDate(); }
  function niceTicks(min,max,count=5){
    if(!(isFinite(min)&&isFinite(max))) return [0];
    if(min===max){ const span=Math.max(Math.abs(min)*.2,1000); min-=span; max+=span; }
    const raw=(max-min)/Math.max(1,count-1);
    const power=Math.pow(10,Math.floor(Math.log10(Math.max(raw,1))));
    const scaled=raw/power;
    let step=scaled<=1?1:scaled<=2?2:scaled<=5?5:10;
    step*=power;
    const start=Math.floor(min/step)*step;
    const end=Math.ceil(max/step)*step;
    const ticks=[];
    for(let v=start;v<=end+step*.5;v+=step) ticks.push(Math.round(v));
    return ticks;
  }
  function setupCanvas(c,height=260){
    const rect=c.getBoundingClientRect();
    const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
    const W=Math.max(280,Math.floor(rect.width||c.clientWidth||700));
    const H=height;
    c.style.height=H+'px';
    c.style.borderRadius='14px';
    c.style.background='linear-gradient(180deg,#fcfdff 0%,#ffffff 100%)';
    c.style.border='1px solid #edf2f7';
    c.width=Math.floor(W*dpr);
    c.height=Math.floor(H*dpr);
    const ctx=c.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    ctx.imageSmoothingEnabled=true;
    return {ctx,W,H};
  }
  function frame(ctx,W,H,L,R,T,B,ticks,Y){
    const plotW=W-L-R, plotH=H-T-B;
    ctx.save();
    ctx.fillStyle='#fcfdff';
    ctx.strokeStyle='#eef2f7';
    ctx.lineWidth=1;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(L,T,plotW,plotH,14); else ctx.rect(L,T,plotW,plotH);
    ctx.fill();ctx.stroke();
    ctx.font='12px system-ui, sans-serif';
    ctx.textAlign='right';ctx.textBaseline='middle';
    ticks.forEach(v=>{
      const y=Y(v);
      ctx.strokeStyle='#edf2f7';ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(W-R,y);ctx.stroke();
      ctx.fillStyle='#64748b';ctx.fillText(formatAxisYen(v),L-10,y);
    });
    ctx.strokeStyle='#d8dee9';ctx.beginPath();ctx.moveTo(L,T);ctx.lineTo(L,H-B);ctx.lineTo(W-R,H-B);ctx.stroke();
    ctx.restore();
  }
  function xlabels(ctx,W,H,L,R,B,series,X){
    if(!series.length) return;
    const target=Math.min(4,series.length);
    const ids=[];
    for(let i=0;i<target;i++) ids.push(Math.round((series.length-1)*(i/(target-1||1))));
    const unique=[...new Set(ids)];
    ctx.save();
    ctx.font='12px system-ui, sans-serif';ctx.fillStyle='#64748b';ctx.textBaseline='top';
    unique.forEach((idx,pos)=>{
      const x=X(idx);
      ctx.textAlign=pos===0?'left':(pos===unique.length-1?'right':'center');
      ctx.fillText(formatShortDate(series[idx].label),x,H-B+8);
      ctx.strokeStyle='#d8dee9';ctx.beginPath();ctx.moveTo(x,H-B);ctx.lineTo(x,H-B+5);ctx.stroke();
    });
    ctx.restore();
  }
  function line(ctx,series,key,X,Y,stroke,dash=[],width=3.5){
    ctx.save();
    ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(dash);ctx.beginPath();
    series.forEach((p,i)=>{const x=X(i),y=Y(p[key]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.stroke();ctx.restore();
  }
  function fillArea(ctx,series,key,X,Y,baseY,top,bottom){
    if(series.length<2) return;
    const g=ctx.createLinearGradient(0,0,0,baseY);g.addColorStop(0,top);g.addColorStop(1,bottom);
    ctx.save();ctx.fillStyle=g;ctx.beginPath();
    series.forEach((p,i)=>{const x=X(i),y=Y(p[key]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.lineTo(X(series.length-1),baseY);ctx.lineTo(X(0),baseY);ctx.closePath();ctx.fill();ctx.restore();
  }
  function point(ctx,x,y,color,r=4.5){
    ctx.save();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,r+2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function badge(ctx,W,H,x,y,value,color){
    const txt=formatAxisYen(value);
    ctx.save();ctx.font='12px system-ui, sans-serif';
    const w=ctx.measureText(txt).width+14,h=24;
    const bx=Math.max(6,Math.min(W-w-6,x-w-10));
    const by=Math.max(6,Math.min(H-h-6,y-h/2));
    ctx.fillStyle='rgba(255,255,255,.98)';ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(bx,by,w,h,10); else ctx.rect(bx,by,w,h);
    ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(txt,bx+7,by+h/2);ctx.restore();
  }
  function legend(ctx,items,left,top){
    ctx.save();ctx.font='12px system-ui, sans-serif';ctx.textBaseline='middle';let x=left;
    items.forEach(item=>{
      if(item.dash){ctx.strokeStyle=item.color;ctx.lineWidth=3;ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x+20,top);ctx.stroke();ctx.setLineDash([]);}else{ctx.fillStyle=item.color;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,top-3,20,6,3);else ctx.rect(x,top-3,20,6);ctx.fill();}
      x+=26;ctx.fillStyle='#334155';ctx.fillText(item.label,x,top);x+=ctx.measureText(item.label).width+20;
    });ctx.restore();
  }
  function drawAsset(){
    const c=document.getElementById('chart'); if(!c) return;
    const {ctx,W,H}=setupCanvas(c,260);
    const L=72,R=18,T=36,B=36,pts=state.records.slice(-40),s=state.settings;
    if(!pts.length){ctx.fillStyle='#64748b';ctx.font='14px system-ui, sans-serif';ctx.fillText('記録するとグラフが表示されます',20,40);return;}
    const start=parseDate(s.startDate);
    const series=pts.map(r=>{const d=new Date(r.ts);const day=Math.max(0,tradingDaysBetween(start,new Date(d.getFullYear(),d.getMonth(),d.getDate())));return {actual:adjustedAssetAxis(r.asset,r.ts),plan:plannedAsset(day),label:d};});
    const vals=series.flatMap(x=>[x.actual,x.plan]);let min=Math.min(...vals),max=Math.max(...vals);const span=max-min||1;min-=span*.1;max+=span*.12;
    const ticks=niceTicks(min,max,5);min=Math.min(...ticks);max=Math.max(...ticks);
    const X=i=>L+(W-L-R)*(series.length===1?.5:i/(series.length-1));const Y=v=>H-B-(H-T-B)*(v-min)/(max-min||1);
    frame(ctx,W,H,L,R,T,B,ticks,Y);xlabels(ctx,W,H,L,R,B,series,X);
    fillArea(ctx,series,'actual',X,Y,H-B,'rgba(37,99,235,.18)','rgba(37,99,235,.02)');
    line(ctx,series,'plan',X,Y,'#94a3b8',[6,5],2.5);line(ctx,series,'actual',X,Y,'#2563eb',[],3.5);
    legend(ctx,[{label:'実績',color:'#2563eb'},{label:'計画',color:'#94a3b8',dash:true}],L,18);
    const last=series.at(-1);point(ctx,X(series.length-1),Y(last.actual),'#2563eb');point(ctx,X(series.length-1),Y(last.plan),'#94a3b8',4);badge(ctx,W,H,X(series.length-1),Y(last.actual),last.actual,'#2563eb');
  }
  function drawProfit(){
    const c=document.getElementById('profitChart'); if(!c) return;
    const {ctx,W,H}=setupCanvas(c,260);
    const L=72,R=18,T=36,B=36,pts=state.records.slice(-40),s=state.settings;
    if(!pts.length){ctx.fillStyle='#64748b';ctx.font='14px system-ui, sans-serif';ctx.fillText('記録するとグラフが表示されます',20,40);return;}
    const series=pts.map(r=>({profit:Number(r.asset)-Number(s.startAsset)-totalCashflowUntilAxis(r.ts),label:new Date(r.ts)}));
    const vals=series.map(x=>x.profit);let min=Math.min(...vals,0),max=Math.max(...vals,0);if(min===max){min-=1000;max+=1000;}const span=max-min||1;min-=span*.1;max+=span*.12;
    const ticks=niceTicks(min,max,5);min=Math.min(...ticks);max=Math.max(...ticks);
    const X=i=>L+(W-L-R)*(series.length===1?.5:i/(series.length-1));const Y=v=>H-B-(H-T-B)*(v-min)/(max-min||1);
    frame(ctx,W,H,L,R,T,B,ticks,Y);xlabels(ctx,W,H,L,R,B,series,X);
    const zy=Y(0);ctx.save();ctx.strokeStyle='#cbd5e1';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(L,zy);ctx.lineTo(W-R,zy);ctx.stroke();ctx.restore();
    const last=series.at(-1),color=last.profit>=0?'#059669':'#dc2626';
    fillArea(ctx,series,'profit',X,Y,H-B,last.profit>=0?'rgba(5,150,105,.18)':'rgba(220,38,38,.16)',last.profit>=0?'rgba(5,150,105,.02)':'rgba(220,38,38,.02)');
    line(ctx,series,'profit',X,Y,color,[],3.5);legend(ctx,[{label:'純利益',color}],L,18);
    ctx.save();ctx.fillStyle='#64748b';ctx.font='12px system-ui, sans-serif';ctx.textAlign='right';ctx.fillText('0円ライン',W-R,Math.max(14,zy-8));ctx.restore();
    point(ctx,X(series.length-1),Y(last.profit),color);badge(ctx,W,H,X(series.length-1),Y(last.profit),last.profit,color);
  }
  const previousRender=render;
  render=function(){ previousRender(); drawAsset(); drawProfit(); };
  window.addEventListener('resize',()=>{clearTimeout(window.__chartResizeTimer);window.__chartResizeTimer=setTimeout(()=>{drawAsset();drawProfit();},100);});
  render();
})();