"""Neural-only eight-asset simplex policy; every sensory path traverses three real graph steps."""
import numpy as np,scipy.sparse as sp,torch
from torch import nn
from paths import ROOT

class FlyPolicy(nn.Module):
    def __init__(self,input_features,seed=17):
        super().__init__();torch.manual_seed(seed);self.input_features=input_features;self.seed=seed
        w=sp.load_npz(ROOT/'graph/reservoir_384.npz').tocoo();order=np.lexsort((w.col,w.row))
        self.register_buffer('edge_row',torch.tensor(w.row[order],dtype=torch.long));self.register_buffer('edge_col',torch.tensor(w.col[order],dtype=torch.long))
        self.register_buffer('edge_base',torch.tensor(w.data[order],dtype=torch.float32));self.edge_raw=nn.Parameter(torch.zeros(len(w.data)))
        rng=np.random.default_rng(seed);routes=np.zeros((input_features+8,384),np.float32)
        for i in range(len(routes)):
            nodes=rng.choice(384,3,replace=False);routes[i,nodes]=rng.choice([-1.,1.],3)/np.sqrt(3)
        self.register_buffer('sensory_routes',torch.tensor(routes));self.input_raw=nn.Parameter(torch.zeros(input_features+8))
        rate=torch.tensor([.5,.1,.025]);self.rate_raw=nn.Parameter(torch.logit((rate-.01)/.79))
        self.state_norm=nn.LayerNorm(1152,elementwise_affine=False)
        self.head=nn.Linear(1152,8);nn.init.normal_(self.head.weight,std=.003);nn.init.constant_(self.head.bias,-.2)
        with torch.no_grad():self.head.bias[7]=.6

    def graph(self):
        gain=1+.5*torch.tanh(self.edge_raw);values=self.edge_base*gain
        w=values.new_zeros((384,384)).index_put((self.edge_row,self.edge_col),values)
        w=w*(.9/w.abs().sum(1).clamp(min=.9))[:,None]
        return w

    def propagation(self,sensory,holdings,w=None):
        if w is None:w=self.graph()
        x=torch.cat([sensory,holdings],dim=-1);gain=1+.75*torch.tanh(self.input_raw)
        q=torch.tanh(.35*(x*gain)@self.sensory_routes)
        for _ in range(3):q=torch.tanh(q@w.T)
        return q

    def advance(self,q,state=None):
        if state is None:state=q.new_zeros((3,384))
        rate=.01+.79*torch.sigmoid(self.rate_raw)
        return (1-rate[:,None])*state+rate[:,None]*q

