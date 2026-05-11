import { browser } from 'wxt/browser';
import '@/assets/popup.css';
import type { DownloadState } from '@/types';

// ── DOM Elements ──
const videoThumb = document.getElementById('videoThumb') as HTMLImageElement;
const thumbPlaceholder = document.getElementById('thumbPlaceholder') as HTMLDivElement;
const videoTitle = document.getElementById('videoTitle') as HTMLParagraphElement;
const videoUploader = document.getElementById('videoUploader') as HTMLParagraphElement;
const durationBadge = document.getElementById('durationBadge') as HTMLDivElement;

const statusDot = document.getElementById('statusDot') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;

const downloadAudioBtn = document.getElementById('downloadAudioBtn') as HTMLButtonElement;
const downloadVideoBtn = document.getElementById('downloadVideoBtn') as HTMLButtonElement;

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

// ── State ──
let currentUrl = '';
let selectedAudioQuality = 'best';
let selectedVideoQuality = 'best';

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

  // Restore state from background
  browser.runtime.sendMessage({ type: 'get_state' }).then((state: DownloadState) => {
    renderState(state);
  });
});

// ── Listen for updates ──
browser.runtime.onMessage.addListener((message: any) => {
  if (message.type === 'state_update') {
    renderState(message.state);
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
  if (state.thumbnail) {
    videoThumb.src = state.thumbnail;
    videoThumb.classList.remove('hidden');
    thumbPlaceholder.classList.add('hidden');
  } else {
    videoThumb.classList.add('hidden');
    thumbPlaceholder.classList.remove('hidden');
    thumbPlaceholder.textContent = '🌐';
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
    setStatus('loading', 'Downloading...');
    downloadAudioBtn.disabled = true;
    downloadVideoBtn.disabled = true;
    progressSection.classList.remove('hidden');
    resultSection.classList.add('hidden');

    progressPercent.textContent = state.text || '0%';
    progressFill.style.width = `${state.percent}%`;
    progressDetails.textContent = state.details || 'Processing...';
  } else if (state.status === 'success') {
    setStatus('active', 'Download finished');
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add('hidden');
    resultSection.classList.remove('hidden');
    resultFilePath.textContent = state.file || '';
    openFolderBtn.dataset.path = state.file;
  } else if (state.status === 'error') {
    setStatus('error', state.errorMessage || 'Error occurred');
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add('hidden');
  } else {
    // Idle
    setStatus('active', 'Ready');
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add('hidden');
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
  });
});

downloadVideoBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({
    type: 'start_download',
    url: currentUrl,
    format: 'video',
    quality: selectedVideoQuality,
  });
});

cancelBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'cancel_download' });
});

openFolderBtn.addEventListener('click', () => {
  const path = openFolderBtn.dataset.path;
  if (path) browser.runtime.sendMessage({ type: 'open_folder', path });
});
