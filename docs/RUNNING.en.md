# Running FlyAlloc

[简体中文](RUNNING.md) | English

Run all commands from the project root. The web assets are already built; no npm installation, frontend build tools, or online APIs are required.

## 1. Start the website

| Platform | Requirement | Start command |
| --- | --- | --- |
| macOS / Linux | Python 3.10+ | `python3 serve.py start` |
| Windows | Python 3.10+ | `py -3 serve.py start` |

Open the address printed by the command, normally `http://127.0.0.1:8080/`. The server listens only on the local loopback address. Closing the terminal that started it does not stop the background service.

```bash
python3 serve.py status
python3 serve.py stop
# Choose a starting port
python3 serve.py start --port 8090
# Run in the foreground; press Ctrl+C to stop
python3 serve.py serve --port 8080
```

On Windows, replace `python3` in these commands with `py -3`. On macOS, you can double-click `启动网站.command`; on Windows, double-click `start.bat`. Use the command line on Linux.

If the port is occupied, background startup tries the next nine ports. Use the address printed in the terminal. Start the service again after restarting your computer. Runtime logs are written to `.runtime/server.log`; Git ignores this directory.

## 2. Public demo and research records

The public download displays **“合成演示” (synthetic demo)** by default: seven fictional assets with artificial allocations and neural activity. These numbers demonstrate interface interactions; they are not model inference results.

You can import local research data that you are authorized to use:

```bash
python3 scripts/local_data.py import /path/to/FlyAlloc-local-data.zip
python3 scripts/local_data.py check
```

Windows example:

```powershell
py -3 scripts/local_data.py import "C:\data\FlyAlloc-local-data.zip"
py -3 scripts/local_data.py check
```

Before writing files, the import tool checks the file manifest, sizes, and content integrity. It does not execute files inside the ZIP, download data, or overwrite existing files with different contents. After a successful import, refresh the page to load the research records. The synthetic demo is used only when the research file is absent and returns HTTP 404. A damaged research file or a server error produces an error instead of silently switching data sources.

A working copy with complete local research data can export a backup:

```bash
python3 scripts/local_data.py export ../FlyAlloc-local-data.zip
```

This ZIP contains market data and research records whose redistribution authorization has not been confirmed. Keep it as a local backup; do not add it to the repository, release attachments, or a public website. See [Data sources and authorization](../DATA_SOURCES.md) for the scope. You can regenerate and check the synthetic demo independently:

```bash
python3 scripts/generate_demo.py
python3 scripts/generate_demo.py --check
```

## 3. Model inference and ledger replay

Use **Python 3.12** and import the local research data as described above.

macOS / Linux:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python backend/replay.py
```

Windows:

```powershell
py -3.12 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.venv\Scripts\python.exe backend\replay.py
```

Inference runs on the CPU and does not require CUDA. Installing dependencies requires an internet connection; afterward, inference uses only local models and data. Output goes to `backend/results/` by default, including replay ledgers, neural states, and `verification.json`. Use `--output` to choose another directory.

Verification covers the integrity of model and input files, decision records, orders, an independent NumPy ledger, and neural states from both random seeds. Discrete fields must match. Floating-point comparisons use an absolute tolerance of `1e-8` and a relative tolerance of `1e-9`; exact equality is also recorded.

## 4. Checks and release packaging

Node.js 22+ is required. There are no npm dependencies to install.

```bash
npm test
# Run only when all local research data is present
npm run test:research
python3 scripts/check_release.py
```

`check_release.py` requires a standalone Git working copy. If you downloaded a source ZIP, run `npm test` instead.

`npm test` uses only the public synthetic demo. It covers themes, date selection and playback, chart values, scene initialization, data fallback, and error handling. `test:research` checks the original values and provenance consistency of the research export; it does not run in public CI.

To prepare a public ZIP, first commit the reviewed files to this repository, then run:

```bash
python3 scripts/check_release.py --committed
# Package only the Git commit, excluding ignored local data and runtime records
git archive --format=zip --prefix=FlyAlloc/ --output=../FlyAlloc-GitHub.zip HEAD
```

Do not compress the entire working directory directly: it may contain local research data ignored by Git. The project maintainer decides separately whether to upload anything. The startup and check scripts neither create remote repositories nor push code.

## Troubleshooting

- **No data when opening HTML directly:** use the HTTP service described above instead of double-clicking `index.html`.
- **The page still shows old content:** refresh the actual address printed by the service. Use `status` to check its port.
- **Python is missing or has the wrong version:** the website requires 3.10+; inference uses 3.12. On Windows, try `py -3` first.
- **3D acceleration is unavailable:** the page can use the bundled CPU geometry and software renderer. Function-level tests do not replace browser hardware compatibility checks.
- **Model verification reports missing data:** import the local data and run `local_data.py check`. Do not substitute the synthetic demo for the research reference ledger.

Verified environment: macOS arm64, Python 3.12.7, Node.js 26.8.2. The Windows startup branch is implemented but has not been verified on native Windows.
