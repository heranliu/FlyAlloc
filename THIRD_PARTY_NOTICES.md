# 第三方内容与许可

根目录 MIT 许可证适用于 FlyAlloc 的原创代码、文档、合成演示数值和原创模型参数。下表所列第三方材料继续适用其原许可；整个仓库不能统一解释为只有 MIT。

| 内容 / 文件 | 作者与来源 | 许可与随包文件 |
| --- | --- | --- |
| `backend/graph/*`、`website/dist/demo-graph.json`，以及检查点中的连接组拓扑和基矩阵 | FlyEM / HHMI Janelia、University of Cambridge、MRC Laboratory of Molecular Biology、Google Research；[MaleCNS v1.0](https://male-cns.janelia.org/download/) | CC BY 4.0；`LICENSES/CC-BY-4.0.txt` |
| `website/dist/vendor/*.js` | Three.js authors，r180；[上游许可](https://raw.githubusercontent.com/mrdoob/three.js/r180/LICENSE) | MIT；`website/dist/vendor/THREE-LICENSE` |
| `website/dist/assets/fly.glb`、`fly-cpu.json` | FlyBody，Google DeepMind / HHMI Janelia；[固定上游提交](https://github.com/TuragaLab/flybody/tree/d015e9bfe441bd90ae431bac24c55cb74bdbce26) | Apache-2.0；`website/dist/assets/flybody-LICENSE` |
| `website/dist/assets/fly-sans.woff`、`fly-sans-bold.woff` | Noto Sans CJK SC Regular / Bold 2.004；Copyright 2014–2021 Adobe；[Noto CJK](https://github.com/notofonts/noto-cjk) | OFL 1.1；`website/dist/assets/FONT-LICENSE` |
| `website/dist/assets/fly-mono.woff` | Noto Sans Mono Regular 2.006；Copyright 2015 Google LLC | OFL 1.1；`website/dist/assets/MONO-FONT-LICENSE` |

## 修改与归属

- **连接组**：节点聚合与筛选、连接保留、符号假设和权重归一化见 `backend/graph/metadata.json`。演示的空间布局、资产收益和活动为项目生成；连接组数据仍须按 CC BY 署名。
- **FlyBody**：由官方 Blender 文件转换为 glTF，重建材质并简化部分网格；CPU 版本进一步简化几何。保留的身体结构用于解释性动画。完整来源、固定提交与修改记录见 `website/dist/assets/PROVENANCE.txt`。相关论文：[Vaxenburg et al., Nature (2025)](https://doi.org/10.1038/s41586-025-09029-4)。
- **字体**：文件身份与版权按 WOFF 内嵌信息列出，保留 OFL 正文。原 Debian 包装版权汇总另存为 `FONT-PACKAGING-NOTICE`；其中针对 `debian/*` 的条款不扩展到本项目源码。现有网页字体文件没有在本次整理中修改。
- **Three.js**：保留原版权头、完整 MIT 许可及随包模块。

依赖包 NumPy、pandas、SciPy 与 PyTorch 由用户按 `backend/requirements.txt` 安装，未将其二进制分发包纳入本仓库；各自继续适用上游许可。
