# 📥 YouDL

> 🇫🇷 [Français](README.fr.md)

YouDL is a powerful, minimalist browser extension that serves as a **GUI for [yt-dlp](https://github.com/yt-dlp/yt-dlp)**. It allows you to download media from **virtually any website** (YouTube, SoundCloud, Twitter, Instagram, TikTok, and 1000+ others) directly in Audio (MP3) or Video (MP4) format.

## ✨ Features

- **Universal Compatibility**: Supports every site supported by `yt-dlp`.
- **Dynamic Previews**: Automatically fetches video thumbnails, titles, and duration.
- **Quality Selection**: Choose between high-bitrate MP3 or specific Video resolutions (1080p, 720p).
- **Premium UI**: Modern Glassmorphism design with smooth animations.
- **Advanced Trimmer**: Lossless trimming (`-c copy`) with a premium interface, interactive waveform, vinyl visualizer for audio, editable timecodes, and magnetic snapping.
- **Custom Settings**: Change your download directory or import local media files for trimming via the native Windows file picker.
- **Native Integration**: Works directly from your browser toolbar.
- **Fast & Reliable**: Leverages the power of `yt-dlp` backend.

## ⚠️ Why isn't this on the Chrome Web Store?

YouDL cannot be published on official stores (Chrome Web Store, Firefox Add-ons) for two main reasons:

1. **Google's YouTube Policy**: Chrome Store strictly forbids any extension that allows downloading videos from YouTube. Any tool that facilitates this is automatically banned.
2. **Native Messaging Requirement**: To provide high-performance downloading and lossless trimming, YouDL requires a "Native Host" (a Python script) to interact with `yt-dlp` and `ffmpeg` on your system. Official stores only allow standalone extensions and do not permit external scripts or local system bridges for security and policy reasons.

This is why YouDL is distributed via **GitHub Releases** and must be installed manually.

## 🛠️ Installation

### 1. Prerequisites

The tool requires **Python** and **FFmpeg** installed on your PC:

- **Python 3.10+** — [python.org](https://www.python.org/downloads/) (check **"Add Python to PATH"** during installation)
- **FFmpeg** — [ffmpeg.org](https://ffmpeg.org/download.html) or install via terminal:
  ```
  winget install ffmpeg
  ```

### 2. Download YouDL

1. Go to the [**Releases**](https://github.com/anthogoz/YouDL/releases/latest) page.
2. Download the latest **`YouDL-vX.X.X-chrome.zip`** (or `firefox` for Firefox).
3. Extract the zip anywhere on your PC.

### 3. Install the extension

1. Open your browser (Chrome, Brave, Edge, etc.).
2. Go to `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Enable **"Developer mode"** (top right).
4. Click **"Load unpacked"**.
5. Select the **`extension`** folder inside the extracted zip.

### 4. Register the Native Host

1. In the extensions page, find **YouDL** and copy its **ID** (e.g. `dfegdbmppdkmaif...`).
2. Open the **`host`** folder from the extracted zip.
3. Double-click **`install_host.bat`**.
4. Paste the extension ID when prompted and press Enter.

> ✅ Done! YouDL is ready to use.

---

## 🚀 Usage

1. Go to any supported website (YouTube, SoundCloud, etc.).
2. Click the **YouDL** icon in your browser toolbar.
3. Choose **"Download MP3"** or **"Download MP4"**.
4. Your files will be saved in `Downloads/YouDL/`.

---

## 🏗️ Development

```bash
# Install dependencies
npm install

# Development mode (with HMR)
npm run dev

# Production build
npm run build            # Chrome
npm run build:firefox    # Firefox

# Lint & format
npm run lint
npm run format
```

---

*Made with ❤️ by [anthogoz](https://github.com/anthogoz)*
