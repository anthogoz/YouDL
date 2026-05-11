import { browser } from 'wxt/browser';
import type { DownloadState, NativeMessage } from '@/types';

const HOST_NAME = 'com.typebeat.downloader';

let nativePort: any = null;

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
        startDownload(message.url, message.format, message.quality);
        sendResponse({ success: true });
        return true;
      }

      if (message.type === 'cancel_download') {
        if (nativePort) {
          nativePort.disconnect();
          nativePort = null;
        }
        if (downloadState.status === 'downloading') {
          downloadState.status = 'error';
          downloadState.errorMessage = 'Download cancelled';
          broadcastState();
        }
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

      return false;
    },
  );
});

function broadcastState(): void {
  browser.runtime
    .sendMessage({ type: 'state_update', state: downloadState })
    .catch(() => {});
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
    downloadState.status = 'success';
    downloadState.title = response.title || downloadState.title;
    downloadState.file = response.file;
    broadcastState();
  } else if (response.status === 'error') {
    downloadState.status = 'error';
    downloadState.errorMessage = response.detail || 'Unknown error';
    broadcastState();
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
  broadcastState();
  ensureNativePort().postMessage({ action: 'get_info', url });
}

function startDownload(url: string, format: string, quality: string): void {
  if (downloadState.status === 'downloading') return;

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
  });
}
