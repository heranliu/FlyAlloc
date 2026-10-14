"""Serve FlyAlloc locally with Python 3.10+; no third-party packages required."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import ProxyHandler, Request, build_opener
import argparse
import hmac
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time

HERE = Path(__file__).resolve().parent
DIST = HERE / 'website' / 'dist'
RUNTIME = HERE / '.runtime'
OPENER = build_opener(ProxyHandler({}))
STATUS_PATH = '/__flyalloc_status'
STOP_PATH = '/__flyalloc_stop'


def read_json(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def same_directory(value):
    # The saved PID is informational; no process is ever terminated by its PID.
    try:
        return isinstance(value, str) and os.path.normcase(str(Path(value).resolve())) == os.path.normcase(str(HERE))
    except (OSError, ValueError):
        return False


def write_json(path, value):
    temporary = path.with_name(path.name + '.' + secrets.token_hex(8) + '.tmp')
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def probe(port):
    try:
        with OPENER.open(f'http://127.0.0.1:{port}{STATUS_PATH}', timeout=.5) as response:
            value = json.loads(response.read(8192))
        if (isinstance(value, dict) and value.get('project') == 'FlyAlloc'
                and same_directory(value.get('directory'))
                and value.get('port') == port and isinstance(value.get('instance_id'), str)):
            return value
    except (OSError, URLError, ValueError):
        pass
    return None


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json_response(self, code, value):
        body = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == STATUS_PATH:
            self.json_response(200, self.server.info)
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != STOP_PATH:
            self.json_response(404, {'error': 'Unknown endpoint'})
            return
        expected = 'Bearer ' + self.server.control_token
        origin = self.headers.get('Origin')
        allowed_origins = (None, f'http://127.0.0.1:{self.server.server_port}',
                           f'http://localhost:{self.server.server_port}')
        if origin not in allowed_origins or not hmac.compare_digest(self.headers.get('Authorization', ''), expected):
            self.json_response(403, {'error': 'Invalid instance credentials'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 2048:
                raise ValueError('Invalid body length')
            value = json.loads(self.rfile.read(length))
            if (not isinstance(value, dict) or not same_directory(value.get('directory'))
                    or value.get('instance_id') != self.server.info['instance_id']):
                raise ValueError('Instance mismatch')
        except (ValueError, OSError):
            self.json_response(403, {'error': 'Instance mismatch'})
            return
        self.json_response(202, {'stopping': self.server.info['instance_id']})
        # shutdown() must run outside the serve_forever() thread.
        threading.Thread(target=self.server.shutdown, daemon=True).start()


def serve(port):
    if not (DIST / 'index.html').is_file():
        raise RuntimeError(f'找不到网页文件：{DIST / "index.html"}')
    RUNTIME.mkdir(mode=0o700, exist_ok=True)
    with ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(DIST))) as server:
        server.daemon_threads = True
        server.control_token = secrets.token_urlsafe(32)
        server.info = {'project': 'FlyAlloc', 'directory': str(HERE), 'port': port,
                       'pid': os.getpid(), 'instance_id': secrets.token_hex(16),
                       'url': f'http://127.0.0.1:{port}/'}
        record = RUNTIME / f'service-{port}.json'
        try:
            write_json(record, {**server.info, 'control_token': server.control_token})
            write_json(RUNTIME / 'service.json', server.info)
            print(f'FlyAlloc：{server.info["url"]}（前台运行时按 Ctrl+C 停止）', flush=True)
            try:
                server.serve_forever(poll_interval=.1)
            except KeyboardInterrupt:
                pass
        finally:
            # Do not remove credentials belonging to a replacement instance.
            for file in (record, RUNTIME / 'service.json'):
                if read_json(file).get('instance_id') == server.info['instance_id']:
                    file.unlink(missing_ok=True)
            print('FlyAlloc 服务已停止。', flush=True)


def show_running(info):
    print(f'FlyAlloc 已运行：{info["url"]}\n'
          f'停止：python serve.py stop --port {info["port"]}', flush=True)


def start(port):
    if not (DIST / 'index.html').is_file():
        raise RuntimeError(f'找不到网页文件：{DIST / "index.html"}')
    RUNTIME.mkdir(mode=0o700, exist_ok=True)
    # Reuse a previous fallback even when the originally requested port is free again.
    for candidate in range(port, min(port + 10, 65536)):
        info = probe(candidate)
        if info is not None:
            show_running(info)
            return
    for candidate in range(port, min(port + 10, 65536)):
        info = probe(candidate)
        if info is not None:
            show_running(info)
            return
        try:
            with socket.socket() as listener:
                if os.name != 'nt':
                    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                listener.bind(('127.0.0.1', candidate))
        except OSError:
            continue
        options = {'close_fds': True}
        if os.name == 'nt':
            options['creationflags'] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            options['start_new_session'] = True
        with (RUNTIME / 'server.log').open('ab') as log:
            process = subprocess.Popen([sys.executable, '-X', 'utf8', str(Path(__file__).resolve()),
                                        'serve', '--port', str(candidate)], cwd=str(HERE),
                                       stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                       **options)
        for _ in range(50):
            info = probe(candidate)
            if info is not None:
                show_running(info)
                print('关闭启动窗口不会停止服务；重启电脑后需要再次启动。', flush=True)
                return
            if process.poll() is not None:
                # Another listener may have claimed this port after the initial check.
                break
            time.sleep(.1)
        else:
            raise RuntimeError(f'服务启动尚未完成，请查看 {RUNTIME / "server.log"}，或运行 status。')
    raise RuntimeError(f'{port} 起的最多 10 个端口不可用或服务启动失败；请更换 --port 并查看 .runtime/server.log。')


def services(port=None):
    if port is not None:
        ports = [port]
    else:
        ports = []
        for file in RUNTIME.glob('service-*.json'):
            value = read_json(file)
            candidate = value.get('port')
            if isinstance(candidate, int) and not isinstance(candidate, bool) and 1024 <= candidate <= 65535:
                ports.append(candidate)
        ports = sorted(set(ports))
    return [info for candidate in ports if (info := probe(candidate)) is not None]


def stop(port=None):
    running = services(port)
    if not running:
        print('此目录没有正在运行的 FlyAlloc 服务。')
        return
    for info in running:
        credentials = read_json(RUNTIME / f'service-{info["port"]}.json')
        token = credentials.get('control_token')
        if (not same_directory(credentials.get('directory'))
                or credentials.get('instance_id') != info['instance_id']
                or not isinstance(token, str) or not token):
            raise RuntimeError('服务凭据缺失或实例不匹配，未发送停止请求。前台服务可用 Ctrl+C 停止。')
        request = Request(f'http://127.0.0.1:{info["port"]}{STOP_PATH}', method='POST',
                          data=json.dumps({'directory': str(HERE), 'instance_id': info['instance_id']}).encode(),
                          headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        try:
            with OPENER.open(request, timeout=2) as response:
                if response.status != 202:
                    raise RuntimeError('服务未确认停止；没有使用 PID 终止进程。')
        except (OSError, URLError) as error:
            raise RuntimeError(f'停止请求未获确认，未操作其他进程：{error}') from error
        for _ in range(50):
            current = probe(info['port'])
            if current is None or current['instance_id'] != info['instance_id']:
                print(f'FlyAlloc 已停止：{info["url"]}', flush=True)
                break
            time.sleep(.1)
        else:
            raise RuntimeError('服务尚未停止，请稍后运行 status；没有使用 PID 强制终止。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'serve', 'status', 'stop'])
    parser.add_argument('--port', type=int, help='Start/serve defaults to 8080; status/stop without a port checks all saved local instances.')
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        parser.error('Python 3.10 or newer is required')
    if args.port is not None and not 1024 <= args.port <= 65535:
        parser.error('port must be between 1024 and 65535')
    try:
        if args.action == 'start':
            start(args.port or 8080)
        elif args.action == 'serve':
            serve(args.port or 8080)
        elif args.action == 'stop':
            stop(args.port)
        else:
            running = services(args.port)
            if not running:
                print('此目录没有正在运行的 FlyAlloc 服务。')
                return 1
            for info in running:
                print(json.dumps(info, ensure_ascii=False))
    except (OSError, RuntimeError) as error:
        print(f'FlyAlloc：{error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
