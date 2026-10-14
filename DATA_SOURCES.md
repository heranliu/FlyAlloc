# 数据来源与授权

核查日期：2026-10-14。以下分别说明数据来源、许可证据和本仓库的实际处理方式；可公开访问的接口不自动等于获得再分发授权。

| 数据 | 来源与许可状态 | 公开仓库中的处理 |
| --- | --- | --- |
| 果蝇连接组 | MaleCNS v1.0，官方标注 CC BY 4.0 | 包含派生的 384 节点矩阵、图元数据和演示图；保留署名、许可和修改说明 |
| 合成演示 | `scripts/generate_demo.py` 确定性生成 | 随仓库提供，MIT；人工数值不代表模型推理或真实行情 |
| 股票与指数日线 | 腾讯公开行情接口；未确认覆盖该接口的公开再分发许可 | `backend/data/` 留本地并被 Git 忽略 |
| 复权因子 | 新浪财经接口；未找到专项开放许可 | 与行情一起留本地，不进入公开包 |
| 真实研究账本与网页记录 | 基于上述输入计算，部分记录包含价格 | `backend/reference/`、`backend/results/` 和 `website/dist/static-*.json` 留本地，不进入公开包 |

## 连接组

[MaleCNS 官方下载页](https://male-cns.janelia.org/download/)列明数据采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；全文见 [LICENSES/CC-BY-4.0.txt](LICENSES/CC-BY-4.0.txt)。

归属：FlyEM / HHMI Janelia Research Campus、University of Cambridge、MRC Laboratory of Molecular Biology、Google Research。

本项目使用经聚合/筛选的 384 节点网络，保留 9,377 条连接，并对传播权重做符号假设和归一化。处理信息见 `backend/graph/metadata.json`。网页使用示意空间布局。检查点中的 `edge_row`、`edge_col`、`edge_base` 属于该连接组派生数据；原创学习参数的 MIT 许可不覆盖这些数据的原始权利。

## 行情与因子

腾讯日线来源为 `proxy.finance.qq.com` 的年度 K 线接口。当前未找到直接覆盖该接口数据公开再分发的许可，因此状态记为**未确认**。其他腾讯产品的用户协议不能直接替代该接口的授权依据。

新浪因子来源为 `finance.sina.com.cn/realstock/company/.../hfq.js`。[新浪财经用户协议](https://finance.sina.com.cn/roll/2021-05-12/doc-ikmxzfmm2033220.shtml)（页面标注 2020-09-23 生效）对内容复制、传播及站外整理展示作出限制；本次未找到因子接口单独授予开放再分发权的文件。该结论不推定所有具体用途的法律性质，仓库按未确认再分发授权处理。

本地数据包保留每份请求的来源、获取时间和完整性校验记录。公开的 `backend/provenance/private-data-manifest.json` 仅包含文件清单及完整性校验信息，不含报价本身。导入工具只校验和复制本地文件，不访问行情服务，也不授予数据使用或分发权。

## 发布边界

Git 忽略规则和发布检查共同排除真实行情、因子、参考账本、真实网页导出与生成结果。公开 ZIP 由 Git 中的文件生成，不直接压缩工作目录。模型与第三方素材保留可公开的许可和归属。

若未来取得数据提供方的书面授权，应记录授权主体、数据范围、允许用途、再分发条件及有效期，再单独更新此说明和发布清单。
