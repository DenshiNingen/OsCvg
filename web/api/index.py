from http.server import BaseHTTPRequestHandler
import os
import sys
import json
import tempfile
import traceback
import email
from email.policy import default

# Add repository root to path to import oscgv
# Since this file is in /web/api/index.py, and oscgv is in /web/oscgv/, the repo root is ../
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../'))
if repo_root not in sys.path:
    sys.path.append(repo_root)

try:
    from oscgv.parser import parse_svg
    from oscgv.audio import generate_signal
except ImportError as e:
    print(f"Import error: {e}")
    parse_svg = None
    generate_signal = None

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error_response(400, "Content-Length missing or zero")
                return

            post_data = self.rfile.read(content_length)
            
            # Use email library to parse multipart/form-data
            headers = f"Content-Type: {self.headers.get('Content-Type', '')}\n\n".encode('latin-1') 
            msg = email.message_from_bytes(headers + post_data, policy=default)
            
            file_content = None
            refresh_rate = 60.0
            transit_speed = 20.0
            
            if msg.is_multipart():
                for part in msg.iter_parts():
                    name = part.get_param("name", header="Content-Disposition")
                    
                    if name == "file":
                        file_content = part.get_payload(decode=True)
                    elif name == "refresh_rate":
                        try:
                            refresh_rate = float(part.get_payload(decode=True).decode().strip())
                        except:
                            pass
                    elif name == "transit_speed":
                         try:
                            transit_speed = float(part.get_payload(decode=True).decode().strip())
                         except:
                            pass
            
            if file_content is None:
                self.send_error_response(400, "No file provided")
                return

            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix='.svg', delete=False) as tf:
                tf.write(file_content)
                tf_path = tf.name
            
            try:
                # Parse and Generate
                if parse_svg is None:
                        raise ImportError("oscgv module not found (check requirements)")

                paths = parse_svg(tf_path)
                
                # Generate single frame
                signal = generate_signal(paths, sample_rate=48000, refresh_rate=refresh_rate, transit_speed=transit_speed)
                
                # Convert to list for JSON serialization
                left = signal[:, 0].tolist()
                right = signal[:, 1].tolist()
                
                response_data = {
                    "signal_left": left,
                    "signal_right": right,
                    "sample_rate": 48000
                }
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode())
                
            finally:
                # Cleanup
                if os.path.exists(tf_path):
                    os.remove(tf_path)
                
        except Exception as e:
            traceback.print_exc()
            self.send_error_response(500, str(e))

    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        response = {"error": message}
        self.wfile.write(json.dumps(response).encode())

    def do_GET(self):
         self.send_response(200)
         self.send_header('Content-type', 'text/plain')
         self.end_headers()
         self.wfile.write("OsCvg API is running".encode())
