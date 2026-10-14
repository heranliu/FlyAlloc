# README figures / README 图示

Reproducible figures generated from the bundled public assets. 图示使用随包公开资源生成。

| Figure | Inputs and meaning |
| --- | --- |
| `overview.png` / `overview.svg` | FlyBody geometry, MaleCNS-derived connectivity and synthetic demo allocations and activity. / FlyBody 几何、MaleCNS 派生连接图及合成演示的配置与活动。 |
| `architecture.png` / `architecture.svg` | The implemented model and its feedback path. / 模型结构与反馈关系。 |

## Regenerate / 重新生成

The figures are committed, so viewing the README adds no dependencies. Regeneration requires Python, NumPy and Matplotlib:

图文件已随仓库提供；阅读 README 不需安装绘图依赖。重新生成时运行：

```bash
python -m pip install numpy matplotlib
python scripts/render_overview.py
python scripts/render_architecture.py
```

These figures were generated with Matplotlib 3.9.2 and NumPy 1.26.4.

The PNG files are suitable for Markdown previews; SVG files retain editable vector geometry and outlined text. Both formats are produced directly from the scripts. PNG 适合文档预览，SVG 保留矢量图形和轮廓化文字。

## Provenance and license / 来源与许可

- **FlyBody body geometry** in the overview: Apache-2.0, from the existing `website/dist/assets/fly-cpu.json`. The figure projects that mesh to two dimensions and changes lighting/color for illustration. Attribution: Google DeepMind / HHMI Janelia. Full source and modifications: [asset provenance](../../website/dist/assets/PROVENANCE.txt); [Apache license](../../website/dist/assets/flybody-LICENSE).
- **MaleCNS connectivity** in the overview: CC BY 4.0. Attribution: FlyEM / HHMI Janelia, University of Cambridge, MRC Laboratory of Molecular Biology, Google Research. The figure uses a schematic spherical layout, draws the 512 strongest connections and colors nodes with synthetic activity. [Data source and modifications](../../DATA_SOURCES.md); [license](../../LICENSES/CC-BY-4.0.txt).
- **Figure lettering**: DejaVu Sans supplied by Matplotlib 3.9.2; Bitstream Vera / Arev copyright notices and DejaVu public-domain changes are preserved in [DejaVu font notices](../../LICENSES/DejaVu-fonts.txt). SVG lettering is stored as glyph outlines. / 图中文字使用 DejaVu Sans，SVG 保留字形轮廓及相应许可声明。
- **Original plotting code, layout and synthetic values**: MIT. Original architecture figure: MIT. The overview combines these with the separately licensed components above; its reuse must retain their notices.
