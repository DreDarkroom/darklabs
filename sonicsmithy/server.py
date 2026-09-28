#!/usr/bin/env python3
"""Sonic Smithy local server. Static files + a tiny encode/save API.

    python server.py            # http://127.0.0.1:8765

Binds to localhost only. The browser app works without it (WAV + zip export
still function); the server adds OGG Vorbis / MP3 encoding and writing
straight into ./exports/ so a Godot project can point at that folder.
"""
import http.server, io, json, os, socketserver, sys, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
EXPORTS = os.path.join(ROOT, "exports")
PORT = int(os.environ.get("PORT", 8765))

try:
    import numpy as np, soundfile as sf
    HAVE_SF = True
except Exception:  # server still serves files without the encoder deps
    HAVE_SF = False

# Vorbis quality (0..1) that lands near a nominal bitrate for 44.1k stereo.
VORBIS_Q = [(48, .1), (64, .2), (96, .3), (128, .4), (160, .5), (192, .6), (240, .7), (320, .85), (500, 1.0)]


def vorbis_q(kbps):
    for k, q in VORBIS_Q:
        if kbps <= k:
            return q
    return 1.0


def encode(wav_bytes, fmt, kbps):
    data, sr = sf.read(io.BytesIO(wav_bytes), dtype="float32", always_2d=True)
    out = io.BytesIO()
    if fmt == "ogg":
        sf.write(out, data, sr, format="OGG", subtype="VORBIS", compression_level=vorbis_q(kbps))
    elif fmt == "mp3":
        # libsndfile: compression_level 0 = best quality. Map 320k->0.0, 64k->~0.8.
        level = max(0.0, min(1.0, (320 - kbps) / 320))
        sf.write(out, data, sr, format="MP3", compression_level=level, bitrate_mode="CONSTANT")
    elif fmt == "flac":
        sf.write(out, data, sr, format="FLAC", subtype="PCM_24")
    else:
        raise ValueError("unsupported format " + fmt)
    return out.getvalue()


def safe_export_path(rel):
    rel = rel.replace("\\", "/").lstrip("/")
    full = os.path.normpath(os.path.join(EXPORTS, rel))
    if not full.startswith(EXPORTS + os.sep):
        raise ValueError("path escapes exports/")
    return full


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/api/caps"):
            return self._json({"encode": HAVE_SF, "formats": ["wav"] + (["ogg", "mp3", "flac"] if HAVE_SF else []),
                               "exports": EXPORTS})
        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            if u.path == "/api/encode":
                if not HAVE_SF:
                    return self._json({"error": "install numpy + soundfile"}, 501)
                fmt = q.get("fmt", ["ogg"])[0]
                kbps = int(q.get("kbps", ["160"])[0])
                b = encode(body, fmt, kbps)
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
            elif u.path == "/api/save":
                full = safe_export_path(q["path"][0])
                os.makedirs(os.path.dirname(full), exist_ok=True)
                with open(full, "wb") as f:
                    f.write(body)
                self._json({"ok": True, "path": os.path.relpath(full, ROOT)})
            else:
                self._json({"error": "not found"}, 404)
        except Exception as e:
            self._json({"error": str(e)}, 400)

    def log_message(self, fmt, *a):
        if "/api/" in (a[0] if a else ""):
            sys.stderr.write("[api] " + (fmt % a) + "\n")


class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    os.makedirs(EXPORTS, exist_ok=True)
    with S(("127.0.0.1", PORT), H) as srv:
        print(f"Sonic Smithy  ->  http://127.0.0.1:{PORT}   (encoder: {'on' if HAVE_SF else 'off'})")
        srv.serve_forever()
