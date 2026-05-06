# 📥 YouDL — Installation Guide

YouDL is a powerful, minimalist browser extension that serves as a **GUI for [yt-dlp](https://github.com/yt-dlp/yt-dlp)**. It allows you to download media from **virtually any website** (YouTube, SoundCloud, Twitter, Instagram, TikTok, and 1000+ others) directly in Audio (MP3) or Video (MP4) format.

## ✨ Features
- **Universal Compatibility**: Supports every site supported by `yt-dlp`.
- **High Quality**: Downloads the best available quality.
- **Native Integration**: Works directly from your browser toolbar.
- **Fast & Reliable**: Leverages the power of `yt-dlp` backend.

## 🛠️ Installation Steps

### 1. Prerequisites: Python & FFmpeg
The tool uses Python and FFmpeg to download and convert files.
- **Python**: Download and install it from [python.org](https://www.python.org/downloads/) (make sure to check **"Add Python to PATH"**).
- **FFmpeg**: Essential for MP3 format and high video quality. Download it from [ffmpeg.org](https://ffmpeg.org/download.html) or install it via `winget install ffmpeg` in a terminal.

### 2. Install the extension in your browser
- Open your browser (Chrome, Brave, Edge, etc.).
- Go to the extensions page: `chrome://extensions` (or `brave://extensions`).
- Enable **"Developer mode"** (top right).
- Click on **"Load unpacked"**.
- Select the folder named `extension` located inside this YouDL folder.

### 3. Configure the Host (Mandatory)
To allow the extension to save files on your PC, you need to register the "host":
- In the extensions page, look for **YouDL** and copy its **ID** (a string of letters like `dfegdbmppdkmaif...`).
- Go to the `host` folder of YouDL.
- Run the `install_host.bat` file.
- Paste the extension ID when prompted and press Enter.

---

## 🚀 How to use it?

1. Go to any supported website (YouTube, etc.).
2. Click the **YouDL** icon in your extension toolbar.
3. Choose **"Download Audio"** or **"Download Video"**.
4. Your files will be saved in your `Downloads/YouDL` folder.

---
*Vibecoded with ❤️ by anthogoz to simplify your downloads.*
