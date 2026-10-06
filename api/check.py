import json
import urllib.parse
import yt_dlp

def handler(request):
    # Mengambil query parameter url (?url=...)
    query_string = request.environ.get('QUERY_STRING', '')
    params = urllib.parse.parse_qs(query_string)
    target_url = params.get('url', [None])[0]

    if not target_url:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({"success": False, "error": "URL parameter wajib diisi!"})
        }

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

            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps(payload)
            }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({"success": False, "error": str(e)})
        }

# Alias fungsi untuk Vercel Python Runtime
app = handler
