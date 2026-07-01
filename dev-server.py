#!/usr/bin/env python
"""Tiny static dev server that disables caching.

Plain `python -m http.server` serves files with a far-future heuristic cache
lifetime, so edits often don't show up on reload during development. This adds
no-store headers so every reload fetches fresh files. Serves the current
directory on port 8000.

    python dev-server.py
"""
import http.server
import socketserver

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


# Threaded so a single slow request (e.g. the multi-MB orbital Earth texture) can't
# block every other request behind it.
class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


with ThreadingHTTPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"Serving (no-cache) on http://localhost:{PORT}")
    httpd.serve_forever()
