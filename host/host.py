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
from pathlib import Path
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

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


def download_media(url, format_type, progress_callback, quality="best"):
    """
    Download media from a URL using yt-dlp.
    format_type can be 'audio' or 'video'.
    quality can be 'best', '320', '128' for audio, or '1080', '720' for video.
    Calls progress_callback with updates.
    Returns the target directory on success.
    """
    url = clean_url(url)
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

    # Return the directory where files were saved
    return str(target_dir)


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
            
            if not url:
                send_message({"status": "error", "detail": "No URL provided"})
                continue
            if not is_safe_url(url):
                send_message({"status": "error", "detail": "Invalid URL scheme"})
                continue

            try:
                # Pass quality info to download_media
                target_dir = download_media(url, format_type, send_message, quality=quality)
                send_message({
                    "status": "ok",
                    "title": "Download finished",
                    "file": target_dir
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
            allowed_dir = os.path.normpath(str(DOWNLOADS_DIR))
            if not normalized.startswith(allowed_dir):
                send_message({"status": "error", "detail": "Path outside allowed directory"})
                continue
            
            try:
                if os.path.isdir(normalized):
                    subprocess.run(['explorer', normalized])
                else:
                    subprocess.run(['explorer', '/select,', normalized])
                send_message({"status": "ok"})
            except Exception as e:
                send_message({"status": "error", "detail": str(e)})

        else:
            send_message({"status": "error", "detail": f"Unknown action: {action}"})


if __name__ == "__main__":
    main()
