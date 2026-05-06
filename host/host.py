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

def read_message():
    """Read a single message from stdin (sent by Chrome)."""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length or len(raw_length) < 4:
        return None

    message_length = struct.unpack("<I", raw_length)[0]
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


def download_media(url, format_type, progress_callback):
    """
    Download media from a YouTube URL using yt-dlp.
    format_type can be 'audio' or 'video'.
    Calls progress_callback with updates.
    Returns the target directory on success.
    """
    downloads_dir = Path.home() / "Downloads" / "YouDL"
    
    if format_type == "audio":
        target_dir = downloads_dir / "Audio"
        os.makedirs(target_dir, exist_ok=True)
        output_template = str(target_dir / "%(title)s.%(ext)s")
        
        cmd = [
            "yt-dlp",
            "--no-warnings",
            "--newline",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",
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
        
        cmd = [
            "yt-dlp",
            "--no-warnings",
            "--newline",
            "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
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

        elif action == "download":
            url = message.get("url", "")
            format_type = message.get("format", "audio")
            
            if not url:
                send_message({"status": "error", "detail": "No URL provided"})
                continue

            try:
                target_dir = download_media(url, format_type, send_message)
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
            
            try:
                if os.path.isdir(filepath):
                    subprocess.run(['explorer', os.path.normpath(filepath)])
                else:
                    subprocess.run(['explorer', '/select,', os.path.normpath(filepath)])
                send_message({"status": "ok"})
            except Exception as e:
                send_message({"status": "error", "detail": str(e)})

        else:
            send_message({"status": "error", "detail": f"Unknown action: {action}"})


if __name__ == "__main__":
    main()
