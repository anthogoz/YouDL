import { browser } from 'wxt/browser';
import '@/assets/popup.css';
import type { DownloadState } from '@/types';

// ── DOM Elements ──
const videoThumb = document.getElementById('videoThumb') as HTMLImageElement;
const thumbPlaceholder = document.getElementById('thumbPlaceholder') as HTMLDivElement;
const videoTitle = document.getElementById('videoTitle') as HTMLParagraphElement;
const videoUploader = document.getElementById('videoUploader') as HTMLParagraphElement;
const durationBadge = document.getElementById('durationBadge') as HTMLDivElement;
const playlistBadge = document.getElementById('playlistBadge') as HTMLSpanElement;

const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;

const downloadAudioBtn = document.getElementById('downloadAudioBtn') as HTMLButtonElement;
const downloadVideoBtn = document.getElementById('downloadVideoBtn') as HTMLButtonElement;
const quickSaveThumbBtn = document.getElementById('quickSaveThumbBtn') as HTMLButtonElement;

const audioQualityGroup = document.getElementById('audioQualityGroup') as HTMLDivElement;
const videoQualityGroup = document.getElementById('videoQualityGroup') as HTMLDivElement;

const progressSection = document.getElementById('progressSection') as HTMLDivElement;
const progressPercent = document.getElementById('progressPercent') as HTMLSpanElement;
const progressFill = document.getElementById('progressFill') as HTMLDivElement;
const progressDetails = document.getElementById('progressDetails') as HTMLSpanElement;
const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;

const resultSection = document.getElementById('resultSection') as HTMLDivElement;
const resultFilePath = document.getElementById('resultFilePath') as HTMLElement;
const openFolderBtn = document.getElementById('openFolderBtn') as HTMLButtonElement;
const saveThumbBtn = document.getElementById('saveThumbBtn') as HTMLButtonElement;
const trimVideoBtn = document.getElementById('trimVideoBtn') as HTMLButtonElement;

// Settings Elements
const settingsToggle = document.getElementById('settingsToggle') as HTMLButtonElement;
const homeSection = document.getElementById('homeSection') as HTMLDivElement;
const settingsSection = document.getElementById('settingsSection') as HTMLDivElement;
const downloadPathInput = document.getElementById('downloadPathInput') as HTMLInputElement;
const browseFolderBtn = document.getElementById('browseFolderBtn') as HTMLButtonElement;
const resetFolderBtn = document.getElementById('resetFolderBtn') as HTMLButtonElement;
const importFileBtn = document.getElementById('importFileBtn') as HTMLButtonElement;
const twitterToggle = document.getElementById('twitterToggle') as HTMLInputElement;
const subtitlesToggle = document.getElementById('subtitlesToggle') as HTMLInputElement;
const normalizeToggle = document.getElementById('normalizeToggle') as HTMLInputElement;
const convertTwitterBtn = document.getElementById('convertTwitterBtn') as HTMLButtonElement;
const convertProgressSection = document.getElementById('convertProgressSection') as HTMLDivElement;
const convertProgressPercent = document.getElementById('convertProgressPercent') as HTMLSpanElement;
const convertProgressFill = document.getElementById('convertProgressFill') as HTMLDivElement;
const convertResultSection = document.getElementById('convertResultSection') as HTMLDivElement;
const convertResultText = document.getElementById('convertResultText') as HTMLSpanElement;
const convertOpenFolderBtn = document.getElementById('convertOpenFolderBtn') as HTMLButtonElement;
const convertErrorSection = document.getElementById('convertErrorSection') as HTMLDivElement;
const convertErrorText = document.getElementById('convertErrorText') as HTMLSpanElement;

const historyList = document.getElementById('historyList') as HTMLDivElement;
const clearHistoryBtn = document.getElementById('clearHistoryBtn') as HTMLButtonElement;

// ── State ──
let currentUrl = '';
let selectedAudioQuality = 'best';
let selectedVideoQuality = 'best';
let customDownloadPath = '';
let alwaysConvertTwitter = false;
let alwaysDownloadSubtitles = false;
let alwaysNormalizeAudio = false;

// ── Initialization ──
browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  if (!tabs || tabs.length === 0) return;
  const tab = tabs[0];
  currentUrl = tab.url || '';

  if (isSupportedUrl(currentUrl)) {
    videoTitle.textContent = 'Fetching metadata...';
    setStatus('loading', 'Connecting to host...');
    browser.runtime.sendMessage({ type: 'fetch_info', url: currentUrl });
  } else {
    videoTitle.textContent = 'Unsupported website';
    setStatus('error', 'Navigate to a media site');
  }

});

// Restore state from background
browser.runtime.sendMessage({ type: 'get_state' }).then((state: DownloadState) => {
  renderState(state);
});

// Load settings
browser.storage.local.get(['customDownloadPath', 'alwaysConvertTwitter', 'alwaysDownloadSubtitles', 'alwaysNormalizeAudio']).then((res) => {
  if (res.customDownloadPath) {
    customDownloadPath = res.customDownloadPath;
    downloadPathInput.value = customDownloadPath;
  }
  if (res.alwaysConvertTwitter) {
    alwaysConvertTwitter = true;
    twitterToggle.checked = true;
  }
  if (res.alwaysDownloadSubtitles) {
    alwaysDownloadSubtitles = true;
    subtitlesToggle.checked = true;
  }
  if (res.alwaysNormalizeAudio) {
    alwaysNormalizeAudio = true;
    normalizeToggle.checked = true;
  }
});

// Twitter/X toggle persistence
twitterToggle.addEventListener('change', () => {
  alwaysConvertTwitter = twitterToggle.checked;
  browser.storage.local.set({ alwaysConvertTwitter });
});

// Subtitles toggle persistence
subtitlesToggle.addEventListener('change', () => {
  alwaysDownloadSubtitles = subtitlesToggle.checked;
  browser.storage.local.set({ alwaysDownloadSubtitles });
});

// Normalize toggle persistence
normalizeToggle.addEventListener('change', () => {
  alwaysNormalizeAudio = normalizeToggle.checked;
  browser.storage.local.set({ alwaysNormalizeAudio });
});

// ── Download History ──
function renderHistory() {
  browser.storage.local.get('downloadHistory').then((res) => {
    const history = res.downloadHistory || [];
    if (history.length === 0) {
      historyList.innerHTML = '<div class="history-empty">No recent downloads</div>';
      clearHistoryBtn.classList.add('hidden');
      return;
    }

    clearHistoryBtn.classList.remove('hidden');
    historyList.innerHTML = '';
    
    history.forEach((item: any) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      
      const thumb = item.thumbnail || 'icons/icon-48.png';
      const date = new Date(item.date).toLocaleString(undefined, { 
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      });
      
      el.innerHTML = `
        <img src="${thumb}" class="history-thumb" alt="" />
        <div class="history-meta">
          <span class="history-title" title="${item.title}">${item.title}</span>
          <span class="history-date">${item.format.toUpperCase()} • ${date}</span>
        </div>
        <button type="button" class="history-action open-history-folder" data-path="${item.filepath}" title="Open Folder">
          📁
        </button>
      `;
      historyList.appendChild(el);
    });

    // Wire open folder buttons
    historyList.querySelectorAll('.open-history-folder').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const path = (e.currentTarget as HTMLButtonElement).dataset.path;
        if (path) browser.runtime.sendMessage({ type: 'open_folder', path });
      });
    });
  });
}

clearHistoryBtn.addEventListener('click', () => {
  browser.storage.local.set({ downloadHistory: [] }).then(() => {
    renderHistory();
  });
});

// ── Settings Navigation ──
settingsToggle.addEventListener('click', () => {
  const isSettingsOpen = !settingsSection.classList.contains('hidden');
  if (isSettingsOpen) {
    settingsSection.classList.add('hidden');
    homeSection.classList.remove('hidden');
    settingsToggle.style.opacity = '0.5';
  } else {
    homeSection.classList.add('hidden');
    settingsSection.classList.remove('hidden');
    settingsToggle.style.opacity = '1';
    renderHistory(); // Refresh history when opening settings
    settingsSection.scrollIntoView({ behavior: 'smooth' });
  }
});

// ── Settings Actions ──
browseFolderBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'pick_folder' });
});

importFileBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'pick_file' });
});

convertTwitterBtn.addEventListener('click', () => {
  // Reset state
  convertProgressSection.classList.add('hidden');
  convertResultSection.classList.add('hidden');
  convertErrorSection.classList.add('hidden');
  browser.runtime.sendMessage({ type: 'pick_file_convert' });
});

convertOpenFolderBtn.addEventListener('click', () => {
  const path = convertOpenFolderBtn.dataset.path;
  if (path) browser.runtime.sendMessage({ type: 'open_folder', path });
});

downloadPathInput.addEventListener('change', () => {
  customDownloadPath = downloadPathInput.value;
  browser.storage.local.set({ customDownloadPath });
});

resetFolderBtn.addEventListener('click', () => {
  customDownloadPath = '';
  downloadPathInput.value = '';
  browser.storage.local.remove('customDownloadPath');
});

// ── Listen for updates ──
browser.runtime.onMessage.addListener((message: any) => {
  if (message.type === 'state_update') {
    renderState(message.state);
  } else if (message.type === 'pick_folder_result') {
    customDownloadPath = message.path;
    downloadPathInput.value = customDownloadPath;
    browser.storage.local.set({ customDownloadPath });
  } else if (message.type === 'pick_file_result') {
    browser.tabs.create({ url: browser.runtime.getURL(`trim.html?file=${encodeURIComponent(message.path)}`) });
  } else if (message.type === 'pick_file_convert_result') {
    // User picked a file for Twitter conversion — start converting
    convertTwitterBtn.setAttribute('disabled', '');
    convertProgressSection.classList.remove('hidden');
    convertResultSection.classList.add('hidden');
    convertErrorSection.classList.add('hidden');
    convertProgressPercent.textContent = '0%';
    convertProgressFill.style.width = '0%';
    browser.runtime.sendMessage({ type: 'convert_twitter', inputPath: message.path });
  } else if (message.type === 'convert_progress') {
    convertProgressPercent.textContent = `${message.percent}%`;
    convertProgressFill.style.width = `${message.percent}%`;
  } else if (message.type === 'convert_complete') {
    convertTwitterBtn.removeAttribute('disabled');
    convertProgressSection.classList.add('hidden');
    convertResultSection.classList.remove('hidden');
    convertErrorSection.classList.add('hidden');
    // Show just the filename
    const fileName = message.outputPath.split(/[\\/]/).pop() || 'Converted!';
    convertResultText.textContent = fileName;
    convertOpenFolderBtn.dataset.path = message.outputPath;
  } else if (message.type === 'convert_error') {
    convertTwitterBtn.removeAttribute('disabled');
    convertProgressSection.classList.add('hidden');
    convertResultSection.classList.add('hidden');
    convertErrorSection.classList.remove('hidden');
    convertErrorText.textContent = message.detail || 'Conversion failed';
  } else if (message.type === 'save_thumb_complete') {
    setStatus('active', 'Cover saved successfully!');
  } else if (message.type === 'save_thumb_error') {
    setStatus('error', message.detail || 'Failed to save cover');
  }
});

// ── Helpers ──
function isSupportedUrl(url: string): boolean {
  return Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));
}

function setStatus(type: string, text: string): void {
  statusDot.className = `status-dot ${type}`;
  statusText.textContent = text;
}

function renderState(state: DownloadState): void {
  // 1. Metadata
  if (state.title) {
    videoTitle.textContent = state.title;
    videoUploader.textContent = state.uploader || '';
  }
  if (state.playlistCount && state.playlistCount > 1) {
    playlistBadge.textContent = `🎵 ${state.playlistCount}`;
    playlistBadge.classList.remove('hidden');
  } else {
    playlistBadge.classList.add('hidden');
  }
  if (state.thumbnail) {
    videoThumb.src = state.thumbnail;
    videoThumb.classList.remove('hidden');
    thumbPlaceholder.classList.add('hidden');
    quickSaveThumbBtn.classList.remove('hidden');
  } else {
    videoThumb.classList.add('hidden');
    thumbPlaceholder.classList.remove('hidden');
    thumbPlaceholder.textContent = '🌐';
    quickSaveThumbBtn.classList.add('hidden');
  }

  if (state.duration) {
    durationBadge.textContent = state.duration;
    durationBadge.classList.remove('hidden');
  } else {
    durationBadge.classList.add('hidden');
  }

  // 2. Status & Buttons
  if (state.status === 'loading_info') {
    setStatus('loading', 'Analyzing video...');
    downloadAudioBtn.disabled = true;
    downloadVideoBtn.disabled = true;
  } else if (state.status === 'downloading') {
    setStatus('active', 'Downloading...');
    downloadAudioBtn.disabled = true;
    downloadVideoBtn.disabled = true;
    progressSection.classList.remove('hidden');
    resultSection.classList.add('hidden');

    progressPercent.textContent = `${state.percent}%`;
    progressFill.style.width = `${state.percent}%`;
    progressFill.classList.remove('convert-fill');
    
    // Details (Size, Speed, ETA)
    progressDetails.textContent = state.details || '';
  } else if (state.status === 'converting') {
    setStatus('active', 'Converting...');
    downloadAudioBtn.disabled = true;
    downloadVideoBtn.disabled = true;
    progressSection.classList.remove('hidden');
    resultSection.classList.add('hidden');

    progressPercent.textContent = state.text || '0%';
    progressFill.style.width = `${state.percent}%`;
    progressFill.classList.add('convert-fill');
    progressDetails.textContent = 'Re-encoding to H.264+AAC...';
  } else if (state.status === 'normalizing') {
    setStatus('active', 'Normalizing Audio...');
    downloadAudioBtn.disabled = true;
    downloadVideoBtn.disabled = true;
    progressSection.classList.remove('hidden');
    resultSection.classList.add('hidden');

    progressPercent.textContent = state.text || '0%';
    progressFill.style.width = `${state.percent}%`;
    progressFill.classList.add('convert-fill'); // Reuse convert fill style for now
    progressDetails.textContent = 'Normalizing volume levels...';
  } else if (state.status === 'success') {
    setStatus('active', 'Download finished');
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add('hidden');
    progressFill.classList.remove('convert-fill');
    resultSection.classList.remove('hidden');
    resultFilePath.textContent = state.file || '';
    openFolderBtn.dataset.path = state.file;

    // Show trim button for both audio and video downloads with a known file path
    if (state.filepath) {
      trimVideoBtn.classList.remove('hidden');
      trimVideoBtn.dataset.path = state.filepath;
    } else {
      trimVideoBtn.classList.add('hidden');
    }

    // Show save thumbnail button if thumbnail exists
    if (state.thumbnail) {
      saveThumbBtn.classList.remove('hidden');
    } else {
      saveThumbBtn.classList.add('hidden');
    }
  } else if (state.status === 'error') {
    setStatus('error', state.errorMessage || 'Error occurred');
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add('hidden');
    progressFill.classList.remove('convert-fill');
  } else {
    // Idle
    setStatus('active', 'Ready');
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add('hidden');
    progressFill.classList.remove('convert-fill');
  }
}

// ── Quality Selection ──
function setupToggleGroup(group: HTMLDivElement, callback: (quality: string) => void): void {
  group.addEventListener('click', (e: Event) => {
    const btn = (e.target as HTMLElement).closest('.toggle-btn') as HTMLButtonElement | null;
    if (!btn) return;

    group.querySelectorAll('.toggle-btn').forEach((b) => {
      b.classList.remove('active');
    });
    btn.classList.add('active');
    callback(btn.dataset.quality || 'best');
  });
}

setupToggleGroup(audioQualityGroup, (q) => (selectedAudioQuality = q));
setupToggleGroup(videoQualityGroup, (q) => (selectedVideoQuality = q));

// ── Actions ──
downloadAudioBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({
    type: 'start_download',
    url: currentUrl,
    format: 'audio',
    quality: selectedAudioQuality,
    customPath: customDownloadPath || undefined,
    downloadSubtitles: alwaysDownloadSubtitles,
    normalizeAudio: alwaysNormalizeAudio,
  });
});

downloadVideoBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({
    type: 'start_download',
    url: currentUrl,
    format: 'video',
    quality: selectedVideoQuality,
    customPath: customDownloadPath || undefined,
    convertForTwitter: alwaysConvertTwitter,
    downloadSubtitles: alwaysDownloadSubtitles,
    normalizeAudio: alwaysNormalizeAudio,
  });
});

cancelBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'cancel_download' });
});

openFolderBtn.addEventListener('click', () => {
  const path = openFolderBtn.dataset.path;
  if (path) browser.runtime.sendMessage({ type: 'open_folder', path });
});

trimVideoBtn.addEventListener('click', () => {
  const path = trimVideoBtn.dataset.path;
  if (path) {
    // Open trim page in a new tab, passing the file path
    const trimUrl = browser.runtime.getURL(`/trim.html?file=${encodeURIComponent(path)}`);
    browser.tabs.create({ url: trimUrl });
  }
});

saveThumbBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({
    type: 'save_thumbnail',
    url: videoThumb.src, // Reusing the loaded thumbnail URL
    customPath: customDownloadPath || undefined
  });
  
  // Visual feedback
  const originalText = saveThumbBtn.innerHTML;
  saveThumbBtn.innerHTML = '✅ Saved';
  saveThumbBtn.disabled = true;
  setTimeout(() => {
    saveThumbBtn.innerHTML = originalText;
    saveThumbBtn.disabled = false;
  }, 2000);
});

quickSaveThumbBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // Avoid triggering any preview-card clicks if any
  if (videoThumb.src) {
    setStatus('loading', 'Saving cover...');
    browser.runtime.sendMessage({
      type: 'save_thumbnail',
      url: videoThumb.src,
      customPath: customDownloadPath || undefined
    });
  }
});
