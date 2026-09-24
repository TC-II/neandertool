"""Dev server for the mascot sprite generator.

Serves the repo root (like `python -m http.server`) and additionally accepts
POST /__mascot_save/<file> to write generated sprite sheets into assets/mascot/.

Usage (from the repo root):
    python tools/mascot/serve.py            # port 8778
    python tools/mascot/serve.py 9000
Then open http://localhost:8778/tools/mascot/generate.html
"""
import http.server
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'assets', 'mascot')
SAVE_PREFIX = '/__mascot_save/'
SAFE_NAME = re.compile(r'^[a-z0-9_\-]+\.(png|json)$')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        if not self.path.startswith(SAVE_PREFIX):
            self.send_error(404)
            return
        name = self.path[len(SAVE_PREFIX):]
        if not SAFE_NAME.match(name):
            self.send_error(400, 'bad file name')
            return
        length = int(self.headers.get('Content-Length', 0))
        data = self.rfile.read(length)
        os.makedirs(OUT_DIR, exist_ok=True)
        with open(os.path.join(OUT_DIR, name), 'wb') as f:
            f.write(data)
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'ok')
        print(f'saved assets/mascot/{name} ({length} bytes)')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8778
    print(f'Serving {ROOT} on http://localhost:{port}/tools/mascot/generate.html')
    http.server.ThreadingHTTPServer(('', port), Handler).serve_forever()
