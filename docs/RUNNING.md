# 运行说明

所有命令都在项目根目录执行。网页资源已经构建，无需 npm install、前端构建工具或在线 API。

## 1. 启动网页

| 环境 | 要求 | 启动命令 |
| --- | --- | --- |
| macOS / Linux | Python 3.10+ | `python3 serve.py start` |
| Windows | Python 3.10+ | `py -3 serve.py start` |

打开命令输出的地址，默认 `http://127.0.0.1:8080/`。启动器仅监听本机回环地址；关闭启动终端不会停止后台服务。

```bash
python3 serve.py status
python3 serve.py stop
# 指定起始端口
python3 serve.py start --port 8090
# 前台运行，按 Ctrl+C 停止
python3 serve.py serve --port 8080
```

Windows 将以上 `python3` 换成 `py -3`。macOS 可双击 `启动网站.command`，Windows 可双击 `start.bat`。Linux 直接使用命令行。

如果端口被占用，后台启动会尝试随后九个端口，以终端显示地址为准。电脑重启后需要再次启动。运行日志在 `.runtime/server.log`，该目录被 Git 忽略。默认黑色主题；右上角可切换白色，浏览器会保存选择。

## 2. 公开演示与研究记录

公开下载默认显示“合成演示”：七个虚构资产、人工配置与人工神经活动。这里的数字用于验证界面交互，不是模型推理结果。

具有合法使用权限的本地研究数据可导入：

```bash
python3 scripts/local_data.py import /path/to/FlyAlloc-local-data.zip
python3 scripts/local_data.py check
```

Windows 示例：

```powershell
py -3 scripts/local_data.py import "C:\data\FlyAlloc-local-data.zip"
py -3 scripts/local_data.py check
```

导入工具检查完整文件清单、大小和 SHA-256 后再写入；不执行 ZIP 内文件、不联网下载、不覆盖内容不一致的已有文件。导入成功后刷新页面即可加载研究记录。只有研究文件不存在、返回 HTTP 404 时才使用合成演示；研究文件损坏或服务器错误会显示错误，避免悄悄切换数据。

已有完整本地研究数据的工作副本可以导出备份：

```bash
python3 scripts/local_data.py export ../FlyAlloc-local-data.zip
```

这个 ZIP 含有授权尚未确认可再分发的行情及研究记录，只作本地备份。不要将它加入仓库、Release 附件或公开网页。详细范围见 [数据来源与授权](../DATA_SOURCES.md)。合成演示可以独立再生成与校验：

```bash
python3 scripts/generate_demo.py
python3 scripts/generate_demo.py --check
```

## 3. 模型推理与账本重放

使用 **Python 3.12**，先按上一节导入本地研究数据。

macOS / Linux：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python backend/replay.py
```

Windows：

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.venv\Scripts\python.exe backend\replay.py
```

依赖使用 CPU 推理，不需要 CUDA。安装依赖需要网络；安装后，推理仅使用本地模型与数据。输出默认写入 `backend/results/`，包括重放账本、神经状态和 `verification.json`。可用 `--output` 指定其他目录。

校验覆盖模型和输入文件摘要、决策记录、订单、独立 NumPy 账本及双种子神经状态。离散字段要求一致；浮点比较使用绝对容差 `1e-8`、相对容差 `1e-9`，同时记录严格相等情况。

## 4. 检查与发布打包

需要 Node.js 22+；没有 npm 依赖需要安装。

```bash
npm test
# 仅在本地研究数据齐全时运行
npm run test:research
python3 scripts/check_release.py
```

`check_release.py` 需要独立 Git 工作副本；通过源码 ZIP 下载的用户运行 `npm test` 即可。

`npm test` 仅依赖公开的合成演示，涵盖主题、日期和回放、图表值、场景初始化、数据回退和错误处理。`test:research` 检查真实研究导出的原值与来源指纹，不在公开 CI 中运行。

准备公开 ZIP 时，先将审核过的文件提交到本仓库，再运行：

```bash
python3 scripts/check_release.py --committed
# 只打包 Git 提交，自动排除被忽略的本地数据和运行记录
git archive --format=zip --prefix=FlyAlloc/ --output=../FlyAlloc-GitHub.zip HEAD
```

不要直接压缩整个工作目录：它可能含有被 Git 忽略的本地研究数据。上传行为由项目维护者单独决定，启动和检查脚本均不会创建远程仓库或推送代码。

## 常见问题

- **直接打开 HTML 后没有数据**：请通过上面的 HTTP 服务访问，不能双击 `index.html`。
- **页面仍显示旧内容**：刷新服务输出的实际地址；可使用 `status` 查看端口。
- **Python 找不到或版本不符**：网页使用 3.10+；推理环境使用 3.12。Windows 先试 `py -3`。
- **三维加速不可用**：页面可使用随包 CPU 几何与软件渲染路径；函数级测试不替代浏览器硬件兼容性检查。
- **模型校验缺少数据**：先执行本地数据导入及 `local_data.py check`，不要用合成演示替代真实参考账本。

验证环境：macOS arm64、Python 3.12.7、Node.js 26.8.2。Windows 启动分支已实现，尚未在原生 Windows 环境执行验证。
