(() => {
  function totalCashflowUntilAxis(ts=null){
    return (state.cashflows||[]).reduce((sum,c)=>{
      if(ts && new Date(c.ts)>new Date(ts)) return sum;
      return sum + (c.type==='withdrawal' ? -Number(c.amount) : Number(c.amount));
    },0);
  }
  function adjustedAssetAxis(asset,ts=null){
    return Number(asset)-totalCashflowUntilAxis(ts);
  }
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
    if(min===max){ const span=Math.max(Math.abs(min)*0.2,1000); min-=span; max+=span; }
    const raw=(max-min)/Math.max(1,count-1);
    const power=Math.pow(10,Math.floor(Math.log10(Math.max(raw,1))));
    const scaled=raw/power;
    let step=scaled<=1?1:scaled<=2?2:scaled<=5?5:10;
    step*=power;
    const start=Math.floor(min/step)*step;
    const end=Math.ceil(max/step)*step;
    const ticks=[];
    for(let v=start;v<=end+step*0.5;v+=step) ticks.push(Math.round(v));
    return ticks;
  }
  function frame(ctx,W,H,L,R,T,B,ticks,Y){
    ctx.lineWidth=1;
    ctx.font='11px sans-serif';
    ctx.textAlign='right';ctx.textBaseline='middle';
    ticks.forEach(v=>{
      const y=Y(v);
      ctx.strokeStyle='#eef2f7';ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(W-R,y);ctx.stroke();
      ctx.fillStyle='#6b7280';ctx.fillText(formatAxisYen(v),L-8,y);
    });
    ctx.strokeStyle='#d1d5db';ctx.beginPath();ctx.moveTo(L,T);ctx.lineTo(L,H-B);ctx.lineTo(W-R,H-B);ctx.stroke();
  }
  function xlabels(ctx,W,H,L,R,B,series,X){
    if(!series.length) return;
    const ids=[0,Math.floor((series.length-1)/2),series.length-1].filter((v,i,a)=>a.indexOf(v)===i);
    ctx.font='11px sans-serif';ctx.fillStyle='#6b7280';ctx.textBaseline='top';
    ids.forEach((idx,pos)=>{
      const x=X(idx);
      ctx.textAlign=pos===0?'left':(pos===ids.length-1?'right':'center');
      ctx.fillText(formatShortDate(series[idx].label),x,H-B+8);
      ctx.strokeStyle='#e5e7eb';ctx.beginPath();ctx.moveTo(x,H-B);ctx.lineTo(x,H-B+4);ctx.stroke();
    });
  }
  function line(ctx,series,key,X,Y,stroke,dash=[]){
    ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.setLineDash(dash);ctx.beginPath();
    series.forEach((p,i)=>{const x=X(i),y=Y(p[key]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    ctx.stroke();ctx.setLineDash([]);
  }
  function badge(ctx,W,H,x,y,value,color){
    const txt=formatAxisYen(value);
    ctx.font='11px sans-serif';
    const w=ctx.measureText(txt).width+12,h=20;
    let bx=Math.max(4,Math.min(W-w-4,x-w-8));
    const by=Math.max(4,Math.min(H-h-4,y-h/2));
    ctx.fillStyle='rgba(255,255,255,.96)';ctx.strokeStyle=color;ctx.lineWidth=1;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(bx,by,w,h,8); else ctx.rect(bx,by,w,h);
    ctx.fill();ctx.stroke();
    ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(txt,bx+6,by+h/2);
  }
  function drawAsset(){
    const c=document.getElementById('chart'); if(!c) return;
    const ctx=c.getContext('2d'),W=c.width,H=c.height;ctx.clearRect(0,0,W,H);
    const L=64,R=16,T=28,B=30,pts=state.records.slice(-40),s=state.settings;
    if(!pts.length){ctx.fillStyle='#6b7280';ctx.font='14px sans-serif';ctx.fillText('記録するとグラフが表示されます',20,40);return;}
    const start=parseDate(s.startDate);
    const series=pts.map(r=>{const d=new Date(r.ts);const day=Math.max(0,tradingDaysBetween(start,new Date(d.getFullYear(),d.getMonth(),d.getDate())));return {actual:adjustedAssetAxis(r.asset,r.ts),plan:plannedAsset(day),label:d};});
    const vals=series.flatMap(x=>[x.actual,x.plan]);let min=Math.min(...vals),max=Math.max(...vals);const span=max-min||1;min-=span*.08;max+=span*.08;
    const ticks=niceTicks(min,max,5);min=Math.min(...ticks);max=Math.max(...ticks);
    const X=i=>L+(W-L-R)*(series.length===1?.5:i/(series.length-1));const Y=v=>H-B-(H-T-B)*(v-min)/(max-min||1);
    frame(ctx,W,H,L,R,T,B,ticks,Y);xlabels(ctx,W,H,L,R,B,series,X);
    line(ctx,series,'plan',X,Y,'#9ca3af',[6,5]);line(ctx,series,'actual',X,Y,'#2563eb');
    ctx.font='12px sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#2563eb';ctx.fillText('実績',L,14);ctx.fillStyle='#6b7280';ctx.fillText('計画',L+44,14);
    const last=series.at(-1);ctx.fillStyle='#2563eb';ctx.beginPath();ctx.arc(X(series.length-1),Y(last.actual),3.5,0,Math.PI*2);ctx.fill();badge(ctx,W,H,X(series.length-1),Y(last.actual),last.actual,'#2563eb');
  }
  function drawProfit(){
    const c=document.getElementById('profitChart'); if(!c) return;
    const ctx=c.getContext('2d'),W=c.width,H=c.height;ctx.clearRect(0,0,W,H);
    const L=64,R=16,T=28,B=30,pts=state.records.slice(-40),s=state.settings;
    if(!pts.length){ctx.fillStyle='#6b7280';ctx.font='14px sans-serif';ctx.fillText('記録するとグラフが表示されます',20,40);return;}
    const series=pts.map(r=>({profit:Number(r.asset)-Number(s.startAsset)-totalCashflowUntilAxis(r.ts),label:new Date(r.ts)}));
    const vals=series.map(x=>x.profit);let min=Math.min(...vals,0),max=Math.max(...vals,0);if(min===max){min-=1000;max+=1000;}const span=max-min||1;min-=span*.08;max+=span*.08;
    const ticks=niceTicks(min,max,5);min=Math.min(...ticks);max=Math.max(...ticks);
    const X=i=>L+(W-L-R)*(series.length===1?.5:i/(series.length-1));const Y=v=>H-B-(H-T-B)*(v-min)/(max-min||1);
    frame(ctx,W,H,L,R,T,B,ticks,Y);xlabels(ctx,W,H,L,R,B,series,X);
    const zy=Y(0);ctx.strokeStyle='#d1d5db';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(L,zy);ctx.lineTo(W-R,zy);ctx.stroke();ctx.setLineDash([]);
    const last=series.at(-1),color=last.profit>=0?'#2563eb':'#dc2626';line(ctx,series,'profit',X,Y,color);
    ctx.font='12px sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText('純利益',L,14);ctx.fillStyle='#6b7280';ctx.textAlign='right';ctx.fillText('0円ライン',W-R,Math.max(12,zy-8));
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(X(series.length-1),Y(last.profit),3.5,0,Math.PI*2);ctx.fill();badge(ctx,W,H,X(series.length-1),Y(last.profit),last.profit,color);
  }
  const previousRender=render;
  render=function(){ previousRender(); drawAsset(); drawProfit(); };
  render();
})();
