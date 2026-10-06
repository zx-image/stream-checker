from http.server import BaseHTTPRequestHandler
import json
import urllib.parse
import yt_dlp

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_path.query)
        target_url = query_params.get('url', [None])[0]

        if not target_url:
            self._send_response(400, {"success": False, "error": "URL parameter wajib diisi!"})
            return

        ydl_opts = {
            'skip_download': True,
            'quiet': True,
            'no_warnings': True,
            'extract_flat': False
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(target_url, download=False)
                formats = info.get('formats', [])
                video_streams = [f for f in formats if f.get('vcodec') != 'none']
                best_video = video_streams[-1] if video_streams else {}
                
                fps = best_video.get('fps') or info.get('fps') or 'N/A'
                vcodec = best_video.get('vcodec') or info.get('vcodec') or 'Unknown'
                acodec = best_video.get('acodec') or info.get('acodec') or 'Unknown'
                width = best_video.get('width') or info.get('width') or 0
                height = best_video.get('height') or info.get('height') or 0
                bitrate = best_video.get('tbr') or best_video.get('vbr') or 0
                filesize = best_video.get('filesize') or best_video.get('filesize_approx') or 0
                
                payload = {
                    "success": True,
                    "platform": info.get('extractor_key', 'Generic'),
                    "title": info.get('title', 'No Title'),
                    "uploader": info.get('uploader') or info.get('channel') or 'Creator',
                    "play_url": best_video.get('url', info.get('url', '')),
                    "specs": {
                        "resolution": f"{width} x {height}",
                        "fps": f"{fps} FPS" if fps != 'N/A' else "N/A",
                        "video_codec": vcodec,
                        "audio_codec": acodec,
                        "bitrate_kbps": round(bitrate, 1) if bitrate else "N/A",
                        "size_mb": round(filesize / (1024 * 1024), 2) if filesize else "N/A",
                        "duration_sec": info.get('duration', 0)
                    }
                }
                self._send_response(200, payload)

        except Exception as e:
            self._send_response(500, {"success": False, "error": str(e)})

    def _send_response(self, status_code, body):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(body).encode('utf-8'))
              
