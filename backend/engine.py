import copy,numpy as np,torch
from policy import allowed
from metrics import metrics

def transact(q,cash,price,quote,target,fee=.0005):
 wealth=cash+(q*price).sum();want=target[:7]*wealth;held=q*price;sell=torch.relu(held-want)*quote;cash=cash+sell.sum()*(1-fee);q=q-sell/price
 buy=torch.relu(want-q*price)*quote;scale=torch.clamp(cash/(buy.sum()*(1+fee)).clamp(min=1e-15),max=1.);buy=buy*scale;cash=cash-buy.sum()*(1+fee);q=q+buy/price;return q,cash,sell,buy

def account_vector(wealth,peak,previouslogs,age,like):
 rolling=sum(previouslogs[-20:]);return torch.stack([(wealth/peak-1).clamp(-1,0),like.new_tensor(rolling).clamp(-1,1),torch.log((wealth/100000).clamp(min=1e-9)).clamp(-3,3),like.new_tensor(min(age,20)/20)])
def burn(m,x,first):
 state=None
 with torch.no_grad():
  w=m.graph()
  for t in range(max(0,first-128),first):
   _,state=m.decision(x[t],x.new_zeros(4),x.new_tensor([0]*7+[1]),state,w)
 return state

def evaluate(models,d,f):
 mode='weekly';extra_slip=0.
 models=[copy.deepcopy(m).double().eval() for m in models];x=torch.tensor(f['inputs'],dtype=torch.float64);op=torch.tensor(d['open'],dtype=torch.float64);cl=torch.tensor(d['close'],dtype=torch.float64);quote=torch.tensor(d['actual'],dtype=torch.float64);q=x.new_zeros(7);cash=x.new_tensor(100000.);peak=x.new_tensor(100000.);states=[burn(m,x,int(f['eval'][0])) for m in models];ws=[m.graph() for m in models];rows=[];orders=[];hist=[];decision_logs=[];decision_peak=x.new_tensor(100000.);previous_decision_wealth=x.new_tensor(100000.);allstates=[];age=0;rate=.0005+extra_slip
 with torch.no_grad():
  for i,t in enumerate(f['eval']):
   vals=torch.cat([q*cl[t],cash.reshape(1)]);wealth=vals.sum();hold=vals/wealth;decision_logs.append(float(torch.log(wealth/previous_decision_wealth)));previous_decision_wealth=wealth;decision_peak=torch.maximum(decision_peak,wealth);account=account_vector(wealth,decision_peak,decision_logs,age,x);ls=[]
   for k,m in enumerate(models):
    l,states[k]=m.decision(x[t],account,hold,states[k],ws[k])
    ls.append(l)
   l=torch.stack(ls).mean(0);p=models[0].action(l,hold,mode);do=allowed(mode,i)
   pre=cash+(q*op[t+1]).sum();sell=x.new_zeros(7);buy=x.new_zeros(7)
   if do:q,cash,sell,buy=transact(q,cash,op[t+1],quote[t+1],p,rate)
   age=0 if float(sell.sum()+buy.sum())>1e-6 else age+1;entryq=q.clone();entrycash=cash.clone();value=torch.cat([q*op[t+1],cash.reshape(1)]);weights=value/value.sum();gross=q*(op[t+2]-op[t+1]);dayorders=[]
   def record(sell,buy,tt,reason):
    for side,amounts in [('sell',sell),('buy',buy)]:
     for j,n in enumerate(amounts.tolist()):
      if n>1e-7:dayorders.append({'symbol':d['symbols'][j],'side':side,'decision_date':str(d['dates'][t]) if reason=='neural_rebalance' else None,'execution_date':str(d['dates'][tt]),'reason':reason,'adjusted_price':float(op[tt,j]),'adjusted_proxy_units':n/float(op[tt,j]),'notional':n,'fee':.0005*n,'slippage':extra_slip*n,'cost':rate*n,'basis':d['price_basis'],'execution_evidence':'fractional adjusted-price proxy; not raw shares or exchange fills'})
   record(sell,buy,t+1,'neural_rebalance')
   if i==len(f['eval'])-1:
    q,cash,s,b=transact(q,cash,op[t+2],quote[t+2],x.new_tensor([0]*7+[1]),rate);record(s,b,t+2,'predeclared_terminal_liquidation')
   eq=cash+(q*op[t+2]).sum();peak=torch.maximum(peak,eq);cost=sum(o['cost'] for o in dayorders);assert abs(float(eq-pre-gross.sum())+cost)<1e-6;assert float(cash)>-1e-7 and float(q.min())>-1e-9;net=float(eq/pre-1);hist.append(float(torch.log(eq/pre)))
   rows.append({'decision_date':str(d['dates'][t]),'entry_date':str(d['dates'][t+1]),'valuation_date':str(d['dates'][t+2]),'neural_target':p.tolist(),'actual_weights':weights.tolist(),'holding_weights_at_decision_close':hold.tolist(),'equity':float(eq),'preperiod_equity':float(pre),'net_return':net,'cost':cost,'fee':sum(o['fee'] for o in dayorders),'slippage':sum(o['slippage'] for o in dayorders),'turnover':sum(o['notional'] for o in dayorders)/float(pre),'logits':l.tolist(),'adjusted_proxy_units_at_entry':entryq.tolist(),'cash_at_entry':float(entrycash),'gross_stock_pnl':gross.tolist(),'rebalance_scheduled':do,'account_inputs':account.tolist(),'terminal_residual_value':float((q*op[t+2]).sum()) if i==len(f['eval'])-1 else None});orders+=dayorders;allstates.append(np.array([s.numpy() for s in states],dtype=np.float32))
 r={'metrics':metrics(rows),'daily':rows,'orders':orders,'joint_states':np.array(allstates),'price_basis':d['price_basis'],'mode':mode};ii=[i for i,r in enumerate(rows) if r['entry_date']>='2026-01-01']
 if ii:r['metrics_2026_frontend']=metrics(rows,ii[0])
 return r
