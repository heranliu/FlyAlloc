#!/usr/bin/env python3
"""Render a README figure from public demo data and the licensed FlyBody mesh.

Requires numpy and matplotlib. This is an explanatory figure, not a browser
screenshot. Portfolio weights/activity are synthetic, not model predictions.
FlyBody geometry: Apache-2.0; MaleCNS connectivity: CC BY 4.0.
"""
from pathlib import Path
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection, PolyCollection
from matplotlib.patches import FancyBboxPatch
from matplotlib.colors import LinearSegmentedColormap

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/assets'
BG = '#f5f7fb'
INK = '#17233c'
MUTED = '#65738b'
INDIGO = '#6366f1'
TEAL = '#0da893'


def main():
    demo = json.loads((ROOT / 'website/dist/demo-data.json').read_text())
    mesh = json.loads((ROOT / 'website/dist/assets/fly-cpu.json').read_text())
    graph = demo['graph']
    assert demo['synthetic'] and not demo['modelInference']
    assert mesh['license'] == 'Apache-2.0'
    frame = demo['frames'][75]
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
                         'svg.fonttype': 'path', 'svg.hashsalt': 'flyalloc-overview',
                         'axes.labelcolor': MUTED, 'xtick.color': MUTED, 'ytick.color': MUTED})
    fig = plt.figure(figsize=(16, 8.8), facecolor=BG)
    fig.text(.035, .945, 'A window into portfolio decisions', fontsize=26, weight='bold', color=INK)
    fig.text(.035, .907, 'Connectivity, state and allocation on a shared timeline', fontsize=13, color=MUTED)
    fig.text(.965, .945, 'FlyAlloc', ha='right', fontsize=17, weight='bold', color=INDIGO)

    def panel(x, y, w, h, number, title, subtitle):
        fig.add_artist(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.006,rounding_size=.012',
                       transform=fig.transFigure, fc='white', ec='#dfe5ef', lw=.9, zorder=-1))
        fig.text(x+.015, y+h-.041, number, fontsize=10, color=INDIGO, weight='bold')
        fig.text(x+.049, y+h-.042, title, fontsize=14, color=INK, weight='bold')
        fig.text(x+.015, y+h-.075, subtitle, fontsize=10, color=MUTED)

    panel(.035, .115, .285, .735, '01', 'Fly model', 'FlyBody geometry')
    panel(.338, .435, .307, .415, '02', 'Connectivity & state', '384 nodes · 512 strongest edges shown')
    panel(.663, .435, .302, .415, '03', 'Portfolio allocation', 'Snapshot 76 / 120')
    panel(.338, .115, .627, .29, '04', 'Exposure through time', 'Stock and cash weights · 120 steps')

    # Orthographic projection of the existing body mesh; no anatomical inference.
    ax = fig.add_axes([.041, .235, .272, .48]); ax.set_axis_off()
    yaw, tilt = np.deg2rad(18), np.deg2rad(43)
    # Forward is -X. View from above and slightly from the side; head is at top.
    right = np.array([np.sin(yaw), 0, np.cos(yaw)])
    up = np.array([-np.cos(yaw)*np.cos(tilt), np.sin(tilt), np.sin(yaw)*np.cos(tilt)])
    depth = np.cross(right, up)
    tri_all, colors, depths = [], [], []
    light = np.array([-.4, .8, .5]); light /= np.linalg.norm(light)
    for part in mesh['parts']:
        vertices = np.asarray(part['positions']).reshape(-1, 3)
        faces = np.asarray(part['indices']).reshape(-1, 3)
        triangles = vertices[faces]
        normal = np.cross(triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0])
        normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-12)
        shade = .60 + .40*np.abs(normal @ light)
        color = np.asarray(part['color'][:3])
        color = color*.76 + np.array([.34, .36, .51])*.24
        rgb = np.clip(color[None, :]*shade[:, None], 0, 1)
        projected = np.stack((triangles @ right, triangles @ up), axis=-1)
        tri_all.extend(projected); depths.extend(triangles.mean(1) @ depth)
        alpha = .48 if 'wing' in part['name'] else 1.
        colors.extend(np.c_[rgb, np.full(len(rgb), alpha)])
    order = np.argsort(depths)
    tri_all, colors = np.asarray(tri_all)[order], np.asarray(colors)[order]
    ax.add_collection(PolyCollection(tri_all, facecolors=colors, edgecolors='none', rasterized=False))
    xy=tri_all.reshape(-1,2); low=xy.min(0); high=xy.max(0); pad=(high-low)*.05
    ax.set_xlim(low[0]-pad[0], high[0]+pad[0]); ax.set_ylim(low[1]-pad[1], high[1]+pad[1]); ax.set_aspect('equal')
    fig.text(.1775, .203, 'Drosophila melanogaster', ha='center', fontsize=12, style='italic', color=INK)

    ax=fig.add_axes([.351,.475,.281,.268]); ax.set_axis_off(); ax.set_aspect('equal')
    n=len(graph['nodes']); i=np.arange(n); y=1-2*(i+.5)/n; r=np.sqrt(1-y*y); angle=i*2.399963
    xyz=np.c_[np.cos(angle)*r, y, np.sin(angle)*r]
    coords=np.c_[xyz[:,0]+.16*xyz[:,2], xyz[:,1]*.86+.12*xyz[:,2]]
    ids={str(node['id']):j for j,node in enumerate(graph['nodes'])}
    edges=sorted(graph['edges'], key=lambda e:abs(e['weight']), reverse=True)[:512]
    segments=[[coords[ids[str(e['source'])]],coords[ids[str(e['target'])]]] for e in edges]
    ax.add_collection(LineCollection(segments, colors='#8c9ac7', linewidths=.35, alpha=.19))
    values=np.asarray(frame['states'][0]['values'])/255
    cmap=LinearSegmentedColormap.from_list('activity',['#c4cee1','#6568e5','#16bfa9'])
    ax.scatter(coords[:,0],coords[:,1],c=values,cmap=cmap,s=6+values*15,lw=.35,edgecolors='white',zorder=3)
    ax.set_xlim(-1.2,1.2);ax.set_ylim(-1.05,1.05)

    ax=fig.add_axes([.706,.487,.226,.245])
    weights=np.r_[frame['weights'],frame['cashWeight']]*100
    ys=np.arange(8); labels=list('ABCDEFG')+['Cash']
    ax.barh(ys,weights,height=.58,color=[INDIGO]*7+['#a9b5c9'],zorder=3)
    ax.set_yticks(ys,labels,fontsize=9);ax.invert_yaxis();ax.set_xlim(0,max(weights)*1.25)
    ax.set_xticks([]);ax.tick_params(axis='y',length=0,pad=8)
    for yy,v in zip(ys,weights):ax.text(v+.65,yy,f'{v:.1f}%',va='center',fontsize=9,color=INK)
    for sp in ax.spines.values():sp.set_visible(False)

    ax=fig.add_axes([.377,.177,.567,.118])
    x=np.arange(1,len(demo['frames'])+1)
    stocks=np.asarray([sum(f['weights']) for f in demo['frames']])*100
    cash=np.asarray([f['cashWeight'] for f in demo['frames']])*100
    assert np.allclose(stocks+cash,100), 'Stock and cash weights must sum to 100%'
    ax.stackplot(x,stocks,cash,colors=[INDIGO,'#d9e0ed'],labels=['Stocks','Cash'],step='post')
    ax.set_xticks([1,30,60,90,120]);ax.tick_params(labelsize=9,length=0,pad=5)
    ax.set_yticks([0,50,100],['0%','50%','100%'])
    ax.set_xlim(1,120);ax.set_ylim(0,100)
    ax.grid(axis='y',color='white',lw=.7,alpha=.55)
    for sp in ax.spines.values():sp.set_visible(False)
    ax.legend(loc='upper right',bbox_to_anchor=(1,1.56),ncols=2,frameon=False,fontsize=9,handlelength=2)
    fig.text(.944,.137,'Step',ha='right',fontsize=9,color=MUTED)
    fig.text(.035,.061,'Synthetic demo data',fontsize=10,color=MUTED)
    fig.text(.965,.061,'FlyBody · Apache-2.0   /   MaleCNS · CC BY 4.0',fontsize=9,ha='right',color=MUTED)
    OUT.mkdir(parents=True, exist_ok=True)
    for ext in ('svg','png'):
        metadata={'Date':None,'Creator':'FlyAlloc'} if ext=='svg' else {'Software':'FlyAlloc'}
        path = OUT/f'overview.{ext}'
        fig.savefig(path,dpi=150,facecolor=fig.get_facecolor(),metadata=metadata)
        if ext == 'svg':
            path.write_bytes(b'\n'.join(line.rstrip() for line in path.read_bytes().splitlines()) + b'\n')
    plt.close(fig)
    print('Rendered docs/assets/overview.svg and overview.png from public assets only.')


if __name__=='__main__':main()
