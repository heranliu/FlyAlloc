// A segment of the original fixed-policy ledger, not a cash-restarted simulation.
export function selectInterval(source,start,end){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>=end)throw Error('结束日期需要晚于开始日期');
 const first=source.frames.findIndex(f=>f.entryDate>=start&&f.valuationDate<=end);
 if(first<0)throw Error('这段日期里没有完整的交易记录，请扩大区间');
 let last=first;while(last+1<source.frames.length&&source.frames[last+1].valuationDate<=end)last++;
 const capital=source.frames[first].preperiodEquity??(first?source.frames[first-1].equity:source.initialCapital),baselineCapital=source.frames[first].baselinePreperiodEquity??(first?source.frames[first-1].baselineEquity:source.initialCapital);
 let peak=capital,basePeak=baselineCapital;
 const frames=source.frames.slice(first,last+1).map(f=>{peak=Math.max(peak,f.equity);basePeak=Math.max(basePeak,f.baselineEquity);return {...f,drawdown:f.equity/peak-1,baselineDrawdown:f.baselineEquity/basePeak-1}});
 const terminal=frames.at(-1);
 return {...source,initialCapital:capital,baselineInitialCapital:baselineCapital,frames,period:{entryStart:frames[0].entryDate,valuationEnd:terminal.valuationDate},interval:{first,last,requestedStart:start,requestedEnd:end,originalInitialCapital:source.initialCapital,capitalBeforeFirstReturn:capital,baselineCapitalBeforeFirstReturn:baselineCapital},metrics:{...source.metrics,totalReturn:terminal.equity/capital-1,baselineReturn:terminal.baselineEquity/baselineCapital-1,maxDrawdown:Math.min(0,...frames.map(f=>f.drawdown)),meanExposure:frames.reduce((s,f)=>s+f.weights.reduce((a,b)=>a+b,0),0)/frames.length,assumedCost:frames.reduce((s,f)=>s+f.cost,0),fees:frames.reduce((s,f)=>s+(f.fees||0),0),slippage:frames.reduce((s,f)=>s+(f.slippage||0),0)}};
}

export function intervalProfitability(run){
 const monthly=new Map();let capital=run.initialCapital;
 for(const f of run.frames){const month=f.valuationDate.slice(0,7);if(!monthly.has(month))monthly.set(month,{start:capital,end:f.equity});else monthly.get(month).end=f.equity;capital=f.equity;}
 const values=[run.initialCapital,...run.frames.map(f=>f.equity)];let positive=0,windows=0;
 for(let i=20;i<values.length;i++){windows++;if(values[i]>values[i-20])positive++;}
 return {positiveMonths:[...monthly.values()].filter(m=>m.end>m.start).length,months:monthly.size,positive20:positive,windows20:windows};
}
