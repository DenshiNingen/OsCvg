from http.server import HTTPServer
import sys
import os

# Add root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from api.index import handler

class RequestHandler(handler):
    def do_OPTIONS(self):
        # Handle CORS for local dev
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def end_headers(self):
        # Inject CORS headers into all responses
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

PORT = 5328

if __name__ == "__main__":
    print(f"Starting Local API Server on http://localhost:{PORT}")
    httpd = HTTPServer(('0.0.0.0', PORT), RequestHandler)
    httpd.serve_forever()
