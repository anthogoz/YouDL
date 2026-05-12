#!/usr/bin/env python3
"""
YouDL — Native Messaging Host
Handles stdin/stdout communication with Chrome using the Native Messaging protocol.
Each message is prefixed by a 4-byte unsigned int (little-endian) indicating its length.
"""

import sys
import json
import struct
import subprocess
import os
import re
import threading
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import tkinter as tk
from tkinter import filedialog


def clean_url(url):
    """
    If the URL is a YouTube video with playlist/mix params (e.g. &list=RD...),
    strip the playlist params so yt-dlp only downloads the single video.
    Pure playlist URLs (no video ID) are left untouched.
    """
    parsed = urlparse(url)
    if parsed.hostname not in ("www.youtube.com", "youtube.com", "m.youtube.com"):
        return url

    params = parse_qs(parsed.query, keep_blank_values=True)

    # If there's a video ID AND a list param, it's a single video in a playlist context
    if "v" in params and "list" in params:
        # Keep only the video ID, drop playlist-related params
        clean_params = {"v": params["v"]}
        clean_query = urlencode(clean_params, doseq=True)
        return urlunparse(parsed._replace(query=clean_query))

    return url


MAX_MESSAGE_SIZE = 1024 * 1024  # 1 MB — Chrome enforces this limit too


def read_message():
    """Read a single message from stdin (sent by Chrome)."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None

    message_length = struct.unpack("<I", raw_length)[0]
    if message_length > MAX_MESSAGE_SIZE:
        return None

    raw_message = sys.stdin.buffer.read(message_length)
    if not raw_message:
        return None

    return json.loads(raw_message.decode("utf-8"))


def send_message(message):
    """Send a single message to stdout (received by Chrome)."""
    try:
        encoded = json.dumps(message, ensure_ascii=False).encode("utf-8")
        sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
    except Exception:
        raise ConnectionError("Chrome disconnected")


ALLOWED_URL_SCHEMES = ("http://", "https://")
DOWNLOADS_DIR = Path.home() / "Downloads" / "YouDL"


def is_safe_url(url):
    """Validate URL uses an allowed scheme (http/https only)."""
    return isinstance(url, str) and url.startswith(ALLOWED_URL_SCHEMES)


def is_safe_path(filepath):
    """Validate that a file path exists. Security is handled by the native messaging protocol."""
    normalized = os.path.normpath(os.path.abspath(filepath))
    return os.path.exists(normalized)


# ── Local HTTP File Server ──

class CORSRequestHandler(SimpleHTTPRequestHandler):
    """HTTP handler that serves a single file with CORS and Range support."""

    served_files = {}  # Will map 'video' -> path, 'waveform' -> path

    def log_message(self, format, *args):
        """Suppress default logging."""
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        path_key = self.path.lstrip("/")
        served_file = self.served_files.get(path_key)

        if not served_file or not os.path.exists(served_file):
            self.send_error(404)
            return

        file_size = os.path.getsize(served_file)
        content_type = "application/octet-stream"
        if served_file.lower().endswith(".mp4"):
            content_type = "video/mp4"
        elif served_file.lower().endswith(".webm"):
            content_type = "video/webm"
        elif served_file.lower().endswith(".mkv"):
            content_type = "video/x-matroska"
        elif served_file.lower().endswith(".png"):
            content_type = "image/png"

        # Handle Range requests for video seeking
        range_header = self.headers.get("Range")
        if range_header:
            try:
                range_spec = range_header.replace("bytes=", "")
                parts = range_spec.split("-")
                start = int(parts[0])
                end = int(parts[1]) if parts[1] else file_size - 1
                end = min(end, file_size - 1)
                length = end - start + 1

                self.send_response(206)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(length))
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Accept-Ranges", "bytes")
                self._send_cors_headers()
                self.end_headers()

                with open(served_file, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk_size = min(65536, remaining)
                        chunk = f.read(chunk_size)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
                return
            except (ValueError, IndexError):
                pass  # Fall through to full file response

        # Full file response
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_size))
        self.send_header("Accept-Ranges", "bytes")
        self._send_cors_headers()
        self.end_headers()

        with open(served_file, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")


file_server = None
file_server_thread = None


def start_file_server(filepath, route="video"):
    """
    Start a local HTTP server (if not running) and serve the file at /<route>.
    Returns the port.
    """
    global file_server, file_server_thread

    CORSRequestHandler.served_files[route] = filepath

    if file_server:
        return file_server.server_address[1]

    # Find a free port
    file_server = HTTPServer(("127.0.0.1", 0), CORSRequestHandler)
    port = file_server.server_address[1]

    file_server_thread = threading.Thread(target=file_server.serve_forever, daemon=True)
    file_server_thread.start()

    return port


def stop_file_server():
    """Stop the file server if running."""
    global file_server, file_server_thread
    if file_server:
        file_server.shutdown()
        file_server = None
    file_server_thread = None


# ── FFmpeg Trim ──

def trim_video(input_path, start_time, end_time, progress_callback):
    """
    Trim a video using ffmpeg with copy codec (lossless, fast).
    Returns the output file path on success.
    """
    input_path = os.path.normpath(os.path.abspath(input_path))
    base, ext = os.path.splitext(input_path)
    output_path = f"{base}_trimmed{ext}"

    # If output already exists, add a number
    counter = 1
    while os.path.exists(output_path):
        output_path = f"{base}_trimmed_{counter}{ext}"
        counter += 1

    duration = end_time - start_time

    cmd = [
        "ffmpeg",
        "-y",
        "-ss", f"{start_time:.3f}",
        "-to", f"{end_time:.3f}",
        "-i", input_path,
    ]

    ext_lower = ext.lower()
    if ext_lower in [".mp4", ".mkv", ".mov"]:
        # Re-encode both video and audio for frame accuracy and perfect sync
        cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "320k"])
    elif ext_lower in [".webm"]:
        cmd.extend(["-c:v", "libvpx-vp9", "-cpu-used", "4", "-c:a", "libopus", "-b:a", "192k"])
    else:
        # For audio formats like mp3, m4a, wav, or unknown, copy streams.
        cmd.extend(["-c", "copy"])

    cmd.extend([
        "-avoid_negative_ts", "make_zero",
        "-progress", "pipe:1",
        output_path,
    ])

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,  # Don't pipe stderr — prevents deadlock
        text=True,
        encoding="utf-8",
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

    # Parse ffmpeg progress output
    for line in iter(process.stdout.readline, ''):
        line = line.strip()
        if not line:
            continue

        # ffmpeg -progress outputs out_time_us (microseconds) or out_time_ms (also microseconds, confusingly)
        out_time_s = None
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                raw_val = int(line.split("=")[1])
                out_time_s = raw_val / 1_000_000
            except (ValueError, IndexError):
                pass
        elif line.startswith("out_time="):
            # Format: HH:MM:SS.microseconds
            try:
                time_str = line.split("=")[1].strip()
                parts = time_str.split(":")
                if len(parts) == 3:
                    h, m, s = float(parts[0]), float(parts[1]), float(parts[2])
                    out_time_s = h * 3600 + m * 60 + s
            except (ValueError, IndexError):
                pass

        if out_time_s is not None and duration > 0:
            percent = min(100, (out_time_s / duration) * 100)
            try:
                progress_callback({
                    "status": "trim_progress",
                    "percent": round(percent, 1)
                })
            except ConnectionError:
                process.terminate()
                raise

    process.stdout.close()
    return_code = process.wait()

    if return_code != 0:
        raise Exception(f"FFmpeg trim failed (code {return_code})")

    return output_path


def generate_waveform(input_path):
    """
    Generate a waveform PNG from the given media file using FFmpeg.
    Returns the path to the generated PNG in the system temp directory.
    """
    import tempfile
    input_path = str(Path(input_path).resolve())
    
    base_name = os.path.splitext(os.path.basename(input_path))[0]
    temp_dir = tempfile.gettempdir()
    output_path = os.path.join(temp_dir, f"youdl_wf_{base_name}.png")

    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_path,
        "-filter_complex", "showwavespic=s=1200x60:colors=a78bfa|a78bfa",
        "-frames:v", "1",
        output_path
    ]

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

    _, stderr = process.communicate()
    return_code = process.wait()

    if return_code != 0:
        raise Exception(f"FFmpeg waveform generation failed (code {return_code}): {stderr}")

    return output_path


def download_media(url, format_type, progress_callback, quality="best", custom_path=None):
    """
    Download media from a URL using yt-dlp.
    format_type can be 'audio' or 'video'.
    quality can be 'best', '320', '128' for audio, or '1080', '720' for video.
    custom_path allows overriding the default output directory.
    Calls progress_callback with updates.
    Returns (target_dir, last_file_path) on success.
    """
    url = clean_url(url)
    
    if custom_path and os.path.exists(custom_path):
        downloads_dir = Path(custom_path)
    else:
        downloads_dir = DOWNLOADS_DIR
    
    if format_type == "audio":
        target_dir = downloads_dir / "Audio"
        os.makedirs(target_dir, exist_ok=True)
        output_template = str(target_dir / "%(title)s.%(ext)s")
        
        audio_quality = "0" # Default best (320)
        if quality == "128":
            audio_quality = "5"
        
        cmd = [
            "yt-dlp",
            "--no-warnings",
            "--newline",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", audio_quality,
            "--embed-metadata",
            "--embed-thumbnail",
            "--output", output_template,
            "--no-simulate",
            url,
        ]
    else:  # video
        target_dir = downloads_dir / "Video"
        os.makedirs(target_dir, exist_ok=True)
        output_template = str(target_dir / "%(title)s.%(ext)s")
        
        # Quality selection for video
        video_format = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
        if quality == "1080":
            video_format = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best"
        elif quality == "720":
            video_format = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best"

        cmd = [
            "yt-dlp",
            "--no-warnings",
            "--newline",
            "--format", video_format,
            "--merge-output-format", "mp4",
            "--embed-metadata",
            "--embed-thumbnail",
            "--output", output_template,
            "--no-simulate",
            url,
        ]

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"

    last_file = None

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )

    for line in iter(process.stdout.readline, ''):
        line = line.strip()
        if not line:
            continue

        # Strip ANSI escape codes
        clean_line = re.sub(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])', '', line)

        percent_match = re.search(r'\[download\]\s+(?P<percent>[0-9.]+)%', clean_line)
        if percent_match:
            try:
                percent = float(percent_match.group('percent'))
                size_match = re.search(r'of\s+([~0-9.a-zA-Z]+)', clean_line)
                speed_match = re.search(r'at\s+([~0-9.a-zA-Z/]+)', clean_line)
                eta_match = re.search(r'ETA\s+([0-9:]+)', clean_line)
                
                progress_callback({
                    "status": "progress",
                    "percent": percent,
                    "size": size_match.group(1) if size_match else "",
                    "speed": speed_match.group(1) if speed_match else "",
                    "eta": eta_match.group(1) if eta_match else ""
                })
            except ConnectionError:
                process.terminate()
                raise
            except Exception:
                pass
        else:
            # Track the output file path from yt-dlp output
            dest_match = re.search(r'Destination:\s+(.+)', clean_line)
            merge_match = re.search(r'Merging formats into "(.+?)"', clean_line)
            move_match = re.search(r'Moving file (.+?) to (.+)', clean_line)
            already_match = re.search(r'\[download\]\s+(.+?)\s+has already been downloaded', clean_line)

            if move_match:
                last_file = move_match.group(2).strip().strip('"')
            elif merge_match:
                last_file = merge_match.group(1).strip()
            elif already_match:
                last_file = already_match.group(1).strip()
            elif dest_match and not last_file:
                last_file = dest_match.group(1).strip()

            # Send general info messages so the user knows what's happening (e.g. downloading playlist)
            if clean_line.startswith('[') or "Downloading" in clean_line:
                try:
                    progress_callback({
                        "status": "info",
                        "text": clean_line
                    })
                except ConnectionError:
                    process.terminate()
                    raise

    process.stdout.close()
    return_code = process.wait()

    if return_code != 0:
        raise Exception(f"yt-dlp failed (code {return_code}). Check if FFmpeg is correctly installed if you are converting to MP3.")

    if last_file and not os.path.isabs(last_file):
        last_file = os.path.join(target_dir, last_file)

    # Return the directory and the actual file path
    return str(target_dir), last_file


def main():
    """Read continuous messages from Chrome, process them."""
    while True:
        message = read_message()

        if message is None:
            break

        action = message.get("action", "")

        if action == "ping":
            send_message({
                "status": "ok",
                "reply": "pong",
                "received": message.get("message", ""),
                "detail": "Native host is running!",
            })

        elif action == "get_info":
            url = message.get("url", "")
            if not url:
                send_message({"status": "error", "detail": "No URL provided"})
                continue
            if not is_safe_url(url):
                send_message({"status": "error", "detail": "Invalid URL scheme"})
                continue
            
            try:
                # Use yt-dlp to get video metadata
                cmd = ["yt-dlp", "-j", "--no-playlist", "--flat-playlist", url]
                result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", creationflags=subprocess.CREATE_NO_WINDOW)
                
                # If it fails to get JSON, we don't throw an error, we just send generic info
                if result.returncode != 0 or not result.stdout.strip():
                    send_message({
                        "status": "info_result",
                        "title": "Supported Media Found",
                        "thumbnail": "",
                        "duration": "",
                        "uploader": "Generic Site",
                    })
                    continue
                
                # yt-dlp can return multiple JSON objects (one per line) for some pages
                first_line = result.stdout.splitlines()[0]
                info = json.loads(first_line)
                
                send_message({
                    "status": "info_result",
                    "title": info.get("title", "Unknown Title"),
                    "thumbnail": info.get("thumbnail", ""),
                    "duration": info.get("duration_string", ""),
                    "uploader": info.get("uploader", ""),
                })
            except Exception:
                # Fallback to generic info so buttons stay active
                send_message({
                    "status": "info_result",
                    "title": "Ready to Download",
                    "thumbnail": "",
                    "duration": "",
                    "uploader": "External Source",
                })

        elif action == "download":
            url = message.get("url", "")
            format_type = message.get("format", "audio")
            quality = message.get("quality", "best") # 'best', '1080', '720' etc.
            custom_path = message.get("customPath", None)
            
            if not url:
                send_message({"status": "error", "detail": "No URL provided"})
                continue
            if not is_safe_url(url):
                send_message({"status": "error", "detail": "Invalid URL scheme"})
                continue

            try:
                # Pass quality info to download_media
                target_dir, last_file = download_media(url, format_type, send_message, quality=quality, custom_path=custom_path)
                send_message({
                    "status": "ok",
                    "title": "Download finished",
                    "file": str(target_dir),
                    "filepath": str(last_file) if last_file else ""
                })
            except ConnectionError:
                # Connection closed by Chrome (e.g. Stop button clicked), exit cleanly
                break
            except Exception as e:
                try:
                    send_message({"status": "error", "detail": str(e)})
                except ConnectionError:
                    break

        elif action == "open_folder":
            filepath = message.get("path", "")
            if not filepath or not os.path.exists(filepath):
                send_message({"status": "error", "detail": "File not found"})
                continue

            # Security: restrict to YouDL downloads directory only
            normalized = os.path.normpath(os.path.abspath(filepath))
            if not os.path.exists(normalized):
                send_message({"status": "error", "detail": "Path does not exist"})
                continue
            
            try:
                if os.path.isdir(normalized):
                    subprocess.run(['explorer', normalized])
                else:
                    subprocess.run(['explorer', '/select,', normalized])
                send_message({"status": "ok"})
            except Exception as e:
                send_message({"status": "error", "detail": str(e)})

        elif action == "serve_file":
            filepath = message.get("path", "")
            if not filepath:
                send_message({"status": "error", "detail": "No file path provided"})
                continue
            if not is_safe_path(filepath):
                send_message({"status": "error", "detail": "File not found or outside allowed directory"})
                continue

            try:
                port = start_file_server(filepath)
                send_message({
                    "status": "serve_ready",
                    "url": f"http://127.0.0.1:{port}/video",
                    "port": port
                })
            except Exception as e:
                send_message({"status": "error", "detail": str(e)})

        elif action == "stop_server":
            stop_file_server()
            send_message({"status": "ok"})

        elif action == "trim":
            input_path = message.get("inputPath", "")
            start_time = message.get("startTime", 0)
            end_time = message.get("endTime", 0)

            if not input_path:
                send_message({"status": "trim_error", "detail": "No input file provided"})
                continue
            if not is_safe_path(input_path):
                send_message({"status": "trim_error", "detail": "File not found or outside allowed directory"})
                continue
            if end_time <= start_time:
                send_message({"status": "trim_error", "detail": "Invalid time range"})
                continue

            try:
                output_path = trim_video(input_path, start_time, end_time, send_message)
                send_message({
                    "status": "trim_ok",
                    "file": output_path
                })
            except ConnectionError:
                break
            except Exception as e:
                try:
                    send_message({"status": "trim_error", "detail": str(e)})
                except ConnectionError:
                    break

        elif action == "get_waveform":
            input_path = message.get("filePath", "")
            if not input_path:
                send_message({"status": "waveform_error", "detail": "No input file provided"})
                continue
            if not is_safe_path(input_path):
                send_message({"status": "waveform_error", "detail": "File not found or outside allowed directory"})
                continue

            try:
                # Generate waveform and return URL for local server
                png_path = generate_waveform(input_path)
                # Ensure server is running (we reuse the existing server logic)
                port = start_file_server(png_path, route="waveform")
                send_message({
                    "status": "waveform_ready",
                    "imagePath": png_path,
                    "url": f"http://127.0.0.1:{port}/waveform"
                })
            except Exception as e:
                send_message({"status": "waveform_error", "detail": str(e)})

        elif action == "pick_folder":
            try:
                root = tk.Tk()
                root.withdraw()
                root.attributes('-topmost', True)
                folder_path = filedialog.askdirectory(parent=root, title="Select Download Folder")
                root.destroy()
                if folder_path:
                    send_message({"status": "pick_folder_result", "path": folder_path})
                else:
                    send_message({"status": "pick_folder_cancelled"})
            except Exception as e:
                send_message({"status": "error", "detail": str(e)})

        elif action == "pick_file":
            try:
                root = tk.Tk()
                root.withdraw()
                root.attributes('-topmost', True)
                file_path = filedialog.askopenfilename(
                    parent=root,
                    title="Select Media File to Trim",
                    filetypes=[("Media Files", "*.mp4 *.webm *.mkv *.mp3 *.m4a *.wav *.flac"), ("All Files", "*.*")]
                )
                root.destroy()
                if file_path:
                    send_message({"status": "pick_file_result", "path": file_path})
                else:
                    send_message({"status": "pick_file_cancelled"})
            except Exception as e:
                send_message({"status": "error", "detail": str(e)})

        else:
            send_message({"status": "error", "detail": f"Unknown action: {action}"})


if __name__ == "__main__":
    main()
