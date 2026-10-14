#!/usr/bin/env python3
"""Render the model architecture as SVG paths and a 2x PNG (Matplotlib only).

Run from any directory: python scripts/render_architecture.py
Use --check to compare the committed assets without writing files.
"""
import argparse
import io
import json
from pathlib import Path
import struct

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch, PathPatch
from matplotlib.path import Path as DrawPath

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'docs' / 'assets'
WIDTH, HEIGHT = 1500, 640
BG, INK, MUTED = '#f5f7fb', '#17233c', '#5c6880'
BLUE, TEAL, BORDER = '#6366f1', '#14b8a6', '#dce2ee'
CAPTION = ('Fixed-model replay: independent memory, ensemble allocation and daily portfolio feedback.')


def draw():
    plt.rcParams.update({
        'font.family': 'DejaVu Sans', 'font.size': 10,
        'svg.fonttype': 'path', 'svg.hashsalt': 'flyalloc-architecture',
        'axes.unicode_minus': False, 'path.simplify': False,
    })
    fig = plt.figure(figsize=(WIDTH / 96, HEIGHT / 96), dpi=96, facecolor=BG)
    ax = fig.add_axes([0, 0, 1, 1], xlim=(0, WIDTH), ylim=(0, HEIGHT))
    ax.set_axis_off()
    labels = []

    def text(x, y, value, size=10, weight='normal', color=INK, align='left', bounds=None):
        artist = ax.text(x, y, value, fontsize=size, fontweight=weight, color=color,
                         ha=align, va='center', linespacing=1.4, zorder=6)
        labels.append((artist, bounds or (28, 18, WIDTH - 28, HEIGHT - 18)))
        return artist

    def box(x, y, w, h, fill='white', stroke=BORDER, radius=12, lw=1):
        patch = FancyBboxPatch((x, y), w, h, boxstyle=f'round,pad=0,rounding_size={radius}',
                              facecolor=fill, edgecolor=stroke, linewidth=lw, zorder=2)
        ax.add_patch(patch)
        return (x + 8, y + 6, x + w - 8, y + h - 6)

    def arrow(points, color=MUTED, lw=1.5, size=10, zorder=3):
        # Explicit orthogonal routes keep feedback separate from feed-forward paths.
        if len(points) > 2:
            codes = [DrawPath.MOVETO] + [DrawPath.LINETO] * (len(points) - 2)
            ax.add_patch(PathPatch(DrawPath(points[:-1], codes), fill=False,
                                   color=color, linewidth=lw, capstyle='round',
                                   joinstyle='round', zorder=zorder))
        ax.add_patch(FancyArrowPatch(points[-2], points[-1], arrowstyle='-|>',
                                    color=color, linewidth=lw, mutation_scale=size,
                                    shrinkA=0, shrinkB=1, zorder=zorder))

    text(42, 599, 'FlyAlloc', size=23, weight='bold')
    text(192, 599, 'Model architecture', size=20, color=MUTED)
    text(44, 568, 'Two recurrent policies, one allocation: average logits after each model\'s own state and readout.',
         size=11.5, color=MUTED)

    # Shared observations are routed independently by each seed-specific model.
    bounds = box(42, 283, 204, 158)
    text(60, 416, 'Decision inputs', size=12, weight='bold', bounds=bounds)
    text(60, 382, '308  market features', size=11, bounds=bounds)
    text(60, 354, '    4  account features', size=11, bounds=bounds)
    text(60, 326, '    8  holding weights', size=11, bounds=bounds)
    text(60, 302, 'Known at the decision close', size=9, color=MUTED, bounds=bounds)
    ax.plot([246, 273], [362, 362], color=MUTED, lw=1.5, zorder=3)
    ax.plot([273, 273], [255, 440], color=MUTED, lw=1.5, zorder=3)
    ax.plot(273, 362, 'o', color=MUTED, ms=3, zorder=4)

    for seed, center, accent, fill in [(17, 440, BLUE, '#eef0ff'), (29, 255, TEAL, '#eaf8f5')]:
        bottom = center - 65
        box(296, bottom, 695, 150, fill=fill, stroke=BORDER, radius=15)
        text(314, center + 66, f'SEED {seed}', size=10, weight='bold', color=accent)
        text(392, center + 66, 'own parameters + memory', size=9.5, color=MUTED)
        card_y = center - 43
        route = box(314, card_y, 142, 87)
        graph = box(479, card_y, 213, 87)
        memory = box(718, card_y, 255, 87)

        text(385, center + 21, 'Sparse routes', size=11, weight='bold', align='center', bounds=route)
        text(385, center - 2, '320 input values', size=10, align='center', bounds=route)
        text(385, center - 25, '3 signed nodes/input', size=8.5, color=MUTED, align='center', bounds=route)
        text(585.5, center + 22, 'Connectome graph', size=11, weight='bold', align='center', bounds=graph)
        text(585.5, center - 2, '384 nodes · 9,377 edges', size=10, align='center', bounds=graph)
        text(585.5, center - 25, '3 × tanh graph steps', size=10, color=MUTED, align='center', bounds=graph)
        text(845.5, center + 22, 'Recurrent state', size=11, weight='bold', align='center', bounds=memory)
        text(845.5, center - 1, '3 timescales × 384 = 1,152', size=10, align='center', bounds=memory)
        ax.plot([738, 953], [center - 13, center - 13], color=BORDER, lw=.8, zorder=4)
        text(845.5, center - 28, 'LayerNorm → linear readout', size=10, color=MUTED, align='center', bounds=memory)

        arrow([(273, center), (314, center)], accent)
        arrow([(456, center), (479, center)], accent)
        arrow([(692, center), (718, center)], accent)
        # Independent recurrence loops; there is no cross-seed state connection.
        arrow([(943, card_y + 87), (943, center + 56), (748, center + 56),
               (748, card_y + 87)], accent, lw=1.2, size=8)
        text(846, center + 70, 'own previous state', size=9, color=accent, align='center')
        target_y = 394 if seed == 17 else 338
        arrow([(973, center), (1017, center), (1017, target_y), (1048, target_y)], accent)

    mean = box(1048, 303, 158, 126, stroke='#c7cafc')
    text(1127, 403, 'Average logits', size=12, weight='bold', align='center', bounds=mean)
    text(1127, 371, '(seed 17 + seed 29) / 2', size=8.8, align='center', bounds=mean)
    text(1127, 341, 'States stay separate', size=9, color=MUTED, align='center', bounds=mean)

    transform = box(1251, 303, 207, 126, stroke='#a6ded5')
    arrow([(1206, 366), (1251, 366)], BLUE)
    text(1354.5, 403, 'Allocation transform', size=11.5, weight='bold', align='center', bounds=transform)
    text(1354.5, 376, 'softmax → stock mix', size=10.5, align='center', bounds=transform)
    text(1354.5, 352, 'sigmoid → exposure', size=10.5, align='center', bounds=transform)
    text(1354.5, 323, 'weights = mix × exposure', size=9, color=MUTED, align='center', bounds=transform)
    arrow([(1354.5, 303), (1354.5, 209)], TEAL)
    text(1336, 257, '7 stocks + cash', size=11, weight='bold', color=INK, align='right')
    text(1336, 238, 'cash = 1 − exposure', size=9, color=MUTED, align='right')

    ledger = box(1048, 118, 410, 91, stroke='#a6ded5')
    text(1253, 185, 'Rebalance every 5 observed sessions', size=12, weight='bold', align='center', bounds=ledger)
    text(1253, 159, 'Decision at close → next-open execution', size=10.5, align='center', bounds=ledger)
    text(1253, 136, 'Daily ledger · adjusted-price proxy units · 5 bp / side', size=9, color=MUTED, align='center', bounds=ledger)

    arrow([(1048, 163), (1009, 163), (1009, 89), (144, 89), (144, 283)], TEAL, lw=1.5)
    text(560, 109, 'Account + current holdings at the next decision', size=10.5,
         color='#087d70', align='center')
    text(44, 35, CAPTION, size=10, color=MUTED)

    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    for artist, bounds in labels:
        extent = artist.get_window_extent(renderer).transformed(ax.transData.inverted())
        left, bottom, right, top = bounds
        if not (extent.x0 >= left and extent.y0 >= bottom and extent.x1 <= right and extent.y1 <= top):
            raise AssertionError(f'Text outside its bounds: {artist.get_text()!r}; {tuple(extent.extents)} vs {bounds}')
    return fig, len(labels)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check deterministic existing assets without writing')
    args = parser.parse_args()
    fig, labels = draw()
    png, svg = io.BytesIO(), io.BytesIO()
    fig.savefig(png, format='png', dpi=192, facecolor=BG,
                metadata={'Software': 'FlyAlloc architecture renderer'})
    fig.savefig(svg, format='svg', facecolor=BG,
                metadata={'Date': None, 'Creator': 'FlyAlloc architecture renderer',
                          'Title': 'FlyAlloc model architecture', 'Description': CAPTION})
    plt.close(fig)
    svg_bytes = b'\n'.join(line.rstrip() for line in svg.getvalue().splitlines()) + b'\n'
    payloads = {'architecture.png': png.getvalue(), 'architecture.svg': svg_bytes}
    assert struct.unpack('>II', payloads['architecture.png'][16:24]) == (3000, 1280)
    assert b'<text' not in payloads['architecture.svg'], 'SVG text must be rendered as paths'
    if not args.check:
        OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, content in payloads.items():
        path = OUTPUT / name
        if args.check:
            if not path.exists() or path.read_bytes() != content:
                raise SystemExit(f'{name} differs; regenerate with this Matplotlib environment')
        else:
            path.write_bytes(content)
    print(json.dumps({'status': 'passed' if args.check else 'generated', 'logical_size': [WIDTH, HEIGHT],
                      'png_size': [3000, 1280], 'labels_with_bounds_checked': labels,
                      'svg_text': 'paths', 'matplotlib': matplotlib.__version__}))


if __name__ == '__main__':
    main()
