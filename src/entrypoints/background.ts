import { browser } from 'wxt/browser';
import type { DownloadState, NativeMessage } from '@/types';

const HOST_NAME = 'com.typebeat.downloader';

let nativePort: any = null;
let pendingTwitterConvert = false;
let pendingNormalizeAudio = false;


const downloadState: DownloadState = {
  status: 'idle',
  percent: 0,
  details: '',
  text: '',
  title: '',
  thumbnail: '',
  duration: '',
  uploader: '',
  file: '',
  filepath: '',
  errorMessage: '',
  format: 'audio',
  quality: 'best',
};

export default defineBackground(() => {
  // Listen for connections from popup
  browser.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: (response?: any) => void) => {
      if (message.type === 'get_state') {
        sendResponse(downloadState);
        return true;
      }

      if (message.type === 'fetch_info') {
        fetchInfo(message.url);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'start_download') {
        startDownload(message.url, message.format, message.quality, message.customPath, message.convertForTwitter, message.downloadSubtitles, message.normalizeAudio);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'cancel_download') {
        pendingTwitterConvert = false;
        pendingNormalizeAudio = false;
        if (nativePort) {
          nativePort.disconnect();
          nativePort = null;
        }
        if (downloadState.status === 'downloading' || downloadState.status === 'converting' || downloadState.status === 'normalizing') {
          const wasConverting = downloadState.status === 'converting' || downloadState.status === 'normalizing';
          downloadState.status = 'error';
          downloadState.errorMessage = wasConverting ? 'Processing cancelled' : 'Download cancelled';
          broadcastState();
        }
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'save_thumbnail') {
        ensureNativePort().postMessage({ 
          action: 'save_thumbnail', 
          url: message.url,
          title: downloadState.title,
          customPath: message.customPath
        });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'open_folder') {
        if (!nativePort) {
          nativePort = browser.runtime.connectNative(HOST_NAME);
        }
        nativePort.postMessage({ action: 'open_folder', path: message.path });
        sendResponse({ success: true });
        return true;
      }

      // ── Trim Feature Messages ──

      if (message.type === 'serve_file') {
        ensureNativePort().postMessage({ action: 'serve_file', path: message.filePath });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'stop_server') {
        ensureNativePort().postMessage({ action: 'stop_server' });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'trim_video') {
        ensureNativePort().postMessage({
          action: 'trim',
          inputPath: message.inputPath,
          startTime: message.startTime,
          endTime: message.endTime,
        });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'get_waveform') {
        ensureNativePort().postMessage({
          action: 'get_waveform',
          filePath: message.filePath,
        });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'pick_folder') {
        ensureNativePort().postMessage({ action: 'pick_folder' });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'pick_file') {
        ensureNativePort().postMessage({ action: 'pick_file' });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'pick_file_convert') {
        ensureNativePort().postMessage({ action: 'pick_file_convert' });
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'convert_twitter') {
        ensureNativePort().postMessage({
          action: 'convert_twitter',
          inputPath: message.inputPath,
        });
        sendResponse({ success: true });
        return true;
      }

      return false;
    },
  );
});

function broadcastState(): void {
  browser.runtime
    .sendMessage({ type: 'state_update', state: downloadState })
    .catch(() => {});
}

function broadcastToExtension(message: any): void {
  browser.runtime.sendMessage(message).catch(() => {});
}

function ensureNativePort(): any {
  if (!nativePort) {
    nativePort = browser.runtime.connectNative(HOST_NAME);
    nativePort.onMessage.addListener(handleNativeMessage);
    nativePort.onDisconnect.addListener(handleNativeDisconnect);
  }
  return nativePort;
}

function handleNativeMessage(response: NativeMessage): void {
  if (response.status === 'info_result') {
    downloadState.status = 'idle';
    downloadState.title = response.title;
    downloadState.thumbnail = response.thumbnail;
    downloadState.duration = response.duration;
    downloadState.uploader = response.uploader;
    downloadState.playlistCount = response.playlistCount;
    broadcastState();
  } else if (response.status === 'progress') {
    downloadState.status = 'downloading';
    downloadState.percent = response.percent;

    const details: string[] = [];
    if (response.size) details.push(response.size);
    if (response.speed) details.push(response.speed);
    if (response.eta) details.push(`ETA: ${response.eta}`);

    downloadState.details = details.join(' • ');
    downloadState.text = `${response.percent}%`;
    broadcastState();
  } else if (response.status === 'info') {
    downloadState.status = 'downloading';
    downloadState.text =
      response.text.length > 50 ? `${response.text.substring(0, 47)}...` : response.text;
    downloadState.details = 'Processing...';
    broadcastState();
  } else if (response.status === 'ok' && 'file' in response && response.file) {
    // Store download result
    downloadState.title = response.title || downloadState.title;
    downloadState.file = response.file;
    downloadState.filepath = response.filepath || '';

    // Download finished — check if we need to auto-convert for Twitter or normalize audio
    if (pendingTwitterConvert && downloadState.filepath) {
      pendingTwitterConvert = false;
      downloadState.status = 'converting';
      downloadState.percent = 0;
      downloadState.text = '0%';
      downloadState.details = 'Re-encoding to H.264+AAC...';
      broadcastState();
      ensureNativePort().postMessage({
        action: 'convert_twitter',
        inputPath: downloadState.filepath,
      });
    } else if (pendingNormalizeAudio && downloadState.filepath && downloadState.format === 'audio') {
      pendingNormalizeAudio = false;
      downloadState.status = 'normalizing';
      downloadState.percent = 0;
      downloadState.text = '0%';
      downloadState.details = 'Normalizing volume levels...';
      broadcastState();
      ensureNativePort().postMessage({
        action: 'normalize_audio',
        inputPath: downloadState.filepath,
      });
    } else {
      pendingTwitterConvert = false;
      pendingNormalizeAudio = false;
      downloadState.status = 'success';
      saveDownloadHistory();
      broadcastState();
    }
  } else if (response.status === 'error') {
    downloadState.status = 'error';
    downloadState.errorMessage = response.detail || 'Unknown error';
    broadcastState();
  } else if (response.status === 'save_thumb_ok') {
    broadcastToExtension({ type: 'save_thumb_complete', outputPath: response.filepath });
  } else if (response.status === 'save_thumb_error') {
    broadcastToExtension({ type: 'save_thumb_error', detail: response.detail });
  }
  // ── Trim-specific native messages ──
  else if (response.status === 'serve_ready') {
    broadcastToExtension({ type: 'serve_file_ready', url: response.url });
  } else if (response.status === 'trim_progress') {
    broadcastToExtension({ type: 'trim_progress', percent: response.percent });
  } else if (response.status === 'trim_ok') {
    broadcastToExtension({ type: 'trim_complete', outputPath: response.file });
  } else if (response.status === 'trim_error') {
    broadcastToExtension({ type: 'trim_error', detail: response.detail });
  } else if (response.status === 'waveform_ready') {
    broadcastToExtension({ type: 'waveform_ready', url: response.url });
  } else if (response.status === 'waveform_error') {
    broadcastToExtension({ type: 'waveform_error', detail: response.detail });
  } else if (response.status === 'pick_folder_result') {
    broadcastToExtension({ type: 'pick_folder_result', path: response.path });
  } else if (response.status === 'pick_file_result') {
    broadcastToExtension({ type: 'pick_file_result', path: response.path });
  } else if (response.status === 'pick_file_convert_result') {
    broadcastToExtension({ type: 'pick_file_convert_result', path: response.path });
  } else if (response.status === 'convert_progress') {
    // If we're in auto-convert mode (download flow), update downloadState
    if (downloadState.status === 'converting') {
      downloadState.percent = response.percent;
      downloadState.text = `${response.percent}%`;
      broadcastState();
    }
    // Also forward to settings converter UI
    broadcastToExtension({ type: 'convert_progress', percent: response.percent });
  } else if (response.status === 'convert_ok') {
    // If we were in auto-convert mode, show success with the converted file
    if (downloadState.status === 'converting') {
      downloadState.status = 'success';
      downloadState.filepath = response.file;
      saveDownloadHistory();
      broadcastState();
    }
    broadcastToExtension({ type: 'convert_complete', outputPath: response.file });
  } else if (response.status === 'convert_error') {
    // If auto-convert failed, still show success for the download itself
    if (downloadState.status === 'converting') {
      downloadState.status = 'success';
      broadcastState();
    }
    broadcastToExtension({ type: 'convert_error', detail: response.detail });
  } else if (response.status === 'normalize_progress') {
    if (downloadState.status === 'normalizing') {
      downloadState.percent = response.percent;
      downloadState.text = `${response.percent}%`;
      broadcastState();
    }
    broadcastToExtension({ type: 'normalize_progress', percent: response.percent });
  } else if (response.status === 'normalize_ok') {
    if (downloadState.status === 'normalizing') {
      downloadState.status = 'success';
      downloadState.filepath = response.file;
      saveDownloadHistory();
      broadcastState();
    }
    broadcastToExtension({ type: 'normalize_complete', outputPath: response.file });
  } else if (response.status === 'normalize_error') {
    if (downloadState.status === 'normalizing') {
      downloadState.status = 'success';
      broadcastState();
    }
    broadcastToExtension({ type: 'normalize_error', detail: response.detail });
  }
}

function handleNativeDisconnect(): void {
  nativePort = null;
  if (downloadState.status === 'downloading' || downloadState.status === 'loading_info') {
    downloadState.status = 'error';
    downloadState.errorMessage = 'Native host disconnected';
    broadcastState();
  }
}

function fetchInfo(url: string): void {
  downloadState.status = 'loading_info';
  downloadState.playlistCount = undefined;
  broadcastState();
  ensureNativePort().postMessage({ action: 'get_info', url });
}

function startDownload(url: string, format: string, quality: string, customPath?: string, convertForTwitter?: boolean, downloadSubtitles?: boolean, normalizeAudio?: boolean): void {
  if (downloadState.status === 'downloading' || downloadState.status === 'converting' || downloadState.status === 'normalizing') return;

  pendingTwitterConvert = format === 'video' && !!convertForTwitter;
  pendingNormalizeAudio = format === 'audio' && !!normalizeAudio;

  downloadState.status = 'downloading';
  downloadState.percent = 0;
  downloadState.details = '--';
  downloadState.text = 'Starting...';
  downloadState.format = format as 'audio' | 'video';
  downloadState.quality = quality;
  broadcastState();

  ensureNativePort().postMessage({
    action: 'download',
    url,
    format,
    quality,
    customPath,
    downloadSubtitles: !!downloadSubtitles,
    normalizeAudio: !!normalizeAudio,
  });
}

function saveDownloadHistory(): void {
  browser.storage.local.get('downloadHistory').then((res) => {
    const history = res.downloadHistory || [];
    const newItem = {
      id: Date.now().toString(),
      title: downloadState.title,
      date: new Date().toISOString(),
      filepath: downloadState.filepath,
      format: downloadState.format,
      thumbnail: downloadState.thumbnail
    };
    
    // Add to beginning and keep max 20 items
    history.unshift(newItem);
    if (history.length > 20) {
      history.length = 20;
    }
    
    browser.storage.local.set({ downloadHistory: history });
  });
}
