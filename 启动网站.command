#!/bin/sh
set -eu
FLYALLOC_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
for FLYALLOC_PYTHON in python3 python3.14 python3.13 python3.12 python3.11 python3.10 python; do
  if command -v "$FLYALLOC_PYTHON" >/dev/null 2>&1 &&
     "$FLYALLOC_PYTHON" -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; then
    exec "$FLYALLOC_PYTHON" "$FLYALLOC_DIR/serve.py" start --port "${PORT:-8080}"
  fi
done
echo "需要 Python 3.10 或更新版本。请安装后重新运行。" >&2
exit 1
