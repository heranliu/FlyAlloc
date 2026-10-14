"""Load the two frozen checkpoints and produce their original neural allocations."""
import numpy as np,torch
from torch import nn
from graph_policy import FlyPolicy
torch.set_num_threads(2)

class Policy(FlyPolicy):
 def __init__(self,seed):
  super().__init__(312,seed);self.head=nn.Linear(1152,9);nn.init.normal_(self.head.weight,std=.003);nn.init.zeros_(self.head.bias)
  with torch.no_grad():self.head.bias[7]=float(np.log(.55/.45));self.head.bias[8]=float(np.log(.25/.75))
 def action(self,l,holding,mode):
  exp=torch.sigmoid(l[7]);p=torch.cat([exp*torch.softmax(l[:7],dim=-1),(1-exp).reshape(1)])
  return p
 def decision(self,x,account,holding,state,w):
  q=self.propagation(torch.cat([x,account]),holding,w);state=self.advance(q,state);return self.head(self.state_norm(state.reshape(-1))),state

def load(path,seed):
 m=Policy(seed)
 with np.load(path,allow_pickle=False) as z:m.load_state_dict({k:torch.tensor(z[k]) for k in z.files})
 return m

def allowed(mode,index):
 assert mode=='weekly','This release only replays the fixed weekly policy.'
 return index%5==0
