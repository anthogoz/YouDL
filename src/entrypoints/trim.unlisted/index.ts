import { browser } from 'wxt/browser';
import '@/assets/trim.css';

// ── Configuration ──
const FRAME_DURATION = 1 / 30; // Assume 30fps for frame stepping
const SKIP_SECONDS = 5;
const ZOOM_PADDING_RATIO = 0.3; // Extra padding around trim region when auto-zooming (30% each side)
const AUTO_ZOOM_THRESHOLD = 0.15; // Auto-zoom when selection < 15% of total duration
const MIN_ZOOM = 1;
const MAX_ZOOM = 80;

// ── DOM Elements ──
const fileName = document.getElementById('fileName') as HTMLParagraphElement;
const loadingOverlay = document.getElementById('loadingOverlay') as HTMLDivElement;
const video = document.getElementById('videoPlayer') as HTMLVideoElement;
const audioVisualizer = document.getElementById('audioVisualizer') as HTMLDivElement;
const playerOverlay = document.getElementById('playerOverlay') as HTMLDivElement;
const playIndicator = document.getElementById('playIndicator') as HTMLDivElement;

const currentTimeEl = document.getElementById('currentTime') as HTMLSpanElement;
const totalTimeEl = document.getElementById('totalTime') as HTMLSpanElement;

const timelineContainer = document.getElementById('timelineContainer') as HTMLDivElement;
const timelineWaveform = document.getElementById('timelineWaveform') as HTMLImageElement;
// const timelineTrack = document.getElementById('timelineTrack') as HTMLDivElement;
const timelinePlayed = document.getElementById('timelinePlayed') as HTMLDivElement;
const trimRegion = document.getElementById('trimRegion') as HTMLDivElement;
const playhead = document.getElementById('playhead') as HTMLDivElement;
const handleIn = document.getElementById('handleIn') as HTMLDivElement;
const handleOut = document.getElementById('handleOut') as HTMLDivElement;

const zoomIndicator = document.getElementById('zoomIndicator') as HTMLDivElement;
const zoomLevelEl = document.getElementById('zoomLevel') as HTMLSpanElement;
const zoomResetBtn = document.getElementById('zoomResetBtn') as HTMLButtonElement;
const zoomFitBtn = document.getElementById('zoomFitBtn') as HTMLButtonElement;

const playPauseBtn = document.getElementById('playPauseBtn') as HTMLButtonElement;
const playPauseIcon = document.getElementById('playPauseIcon') as HTMLSpanElement;
const prevFrameBtn = document.getElementById('prevFrameBtn') as HTMLButtonElement;
const nextFrameBtn = document.getElementById('nextFrameBtn') as HTMLButtonElement;
const skipBackBtn = document.getElementById('skipBackBtn') as HTMLButtonElement;
const skipForwardBtn = document.getElementById('skipForwardBtn') as HTMLButtonElement;
const setInBtn = document.getElementById('setInBtn') as HTMLButtonElement;
const setOutBtn = document.getElementById('setOutBtn') as HTMLButtonElement;
const goToInBtn = document.getElementById('goToInBtn') as HTMLButtonElement;
const goToOutBtn = document.getElementById('goToOutBtn') as HTMLButtonElement;
const magnetToggleBtn = document.getElementById('magnetToggleBtn') as HTMLButtonElement;

const inPointInput = document.getElementById('inPointInput') as HTMLInputElement;
const outPointInput = document.getElementById('outPointInput') as HTMLInputElement;
const trimDuration = document.getElementById('trimDuration') as HTMLSpanElement;
const outputFileName = document.getElementById('outputFileName') as HTMLSpanElement;

const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const cancelTrimBtn = document.getElementById('cancelTrimBtn') as HTMLButtonElement;

const exportOverlay = document.getElementById('exportOverlay') as HTMLDivElement;
const exportProgressFill = document.getElementById('exportProgressFill') as HTMLDivElement;
const exportPercent = document.getElementById('exportPercent') as HTMLParagraphElement;

const successOverlay = document.getElementById('successOverlay') as HTMLDivElement;
const successPath = document.getElementById('successPath') as HTMLParagraphElement;
const closeSuccessBtn = document.getElementById('closeSuccessBtn') as HTMLButtonElement;
const openTrimmedBtn = document.getElementById('openTrimmedBtn') as HTMLButtonElement;

// ── State ──
let filePath = '';
let inPoint = 0;
let outPoint = 0;
let duration = 0;
let isDraggingHandle: 'in' | 'out' | null = null;
let isDraggingTimeline = false;
let isMagnetEnabled = true;

// Zoom state
let zoomLevel = 1; // 1 = no zoom, higher = more zoomed
let zoomCenter = 0.5; // 0..1, center of the visible window in the full timeline

// ── Parse URL params ──
const params = new URLSearchParams(window.location.search);
const fileParam = params.get('file');

// Basic Audio detection by extension
const isAudioOnly = fileParam ? /\.(mp3|m4a|wav|flac)$/i.test(fileParam) : false;

if (!fileParam) {
  fileName.textContent = 'Error: No file path provided';
  loadingOverlay.classList.add('hidden');
} else {
  filePath = fileParam;
  // Show just the file name
  const parts = filePath.replace(/\\/g, '/').split('/');
  fileName.textContent = parts[parts.length - 1] || filePath;

  // Compute output file name
  const lastPart = parts[parts.length - 1] || '';
  const dotIdx = lastPart.lastIndexOf('.');
  if (dotIdx > 0) {
    outputFileName.textContent = `${lastPart.substring(0, dotIdx)}_trimmed${lastPart.substring(dotIdx)}`;
  } else {
    outputFileName.textContent = `${lastPart}_trimmed`;
  }

  // Request the background to start serving the file
  browser.runtime.sendMessage({ type: 'serve_file', filePath });
}

// ── Listen for messages from background ──
browser.runtime.onMessage.addListener((message: any) => {
  if (message.type === 'serve_file_ready') {
    loadVideo(message.url);
  } else if (message.type === 'trim_progress') {
    exportProgressFill.style.width = `${message.percent}%`;
    exportPercent.textContent = `${Math.round(message.percent)}%`;
  } else if (message.type === 'trim_complete') {
    exportOverlay.classList.add('hidden');
    successOverlay.classList.remove('hidden');
    successPath.textContent = message.outputPath;
    openTrimmedBtn.dataset.path = message.outputPath;
  } else if (message.type === 'trim_error') {
    exportOverlay.classList.add('hidden');
    alert(`Trim failed: ${message.detail}`);
  } else if (message.type === 'waveform_ready') {
    timelineWaveform.src = message.url;
    timelineWaveform.onload = () => {
      timelineWaveform.classList.remove('hidden');
    };
  } else if (message.type === 'waveform_error') {
    console.error('Waveform failed:', message.detail);
    // Don't alert the user for a purely visual feature failure to avoid disruption, just log it.
  } else if (message.type === 'error') {
    loadingOverlay.classList.add('hidden');
    alert(`Host error: ${message.detail}`);
  }
});

// ── Load Video ──
function loadVideo(url: string): void {
  video.src = url;
  video.load();

  video.addEventListener('loadedmetadata', () => {
    duration = video.duration;
    outPoint = duration;
    totalTimeEl.textContent = formatTime(duration);
    loadingOverlay.classList.add('hidden');
    updateTrimUI();

    if (isAudioOnly) {
      audioVisualizer.classList.remove('hidden');
    }

    // Generate waveform
    browser.runtime.sendMessage({ type: 'get_waveform', filePath });
  });

  video.addEventListener('timeupdate', () => {
    // ── Loop playback within trim region ──
    if (!video.paused && video.currentTime >= outPoint) {
      video.currentTime = inPoint;
    }
    updatePlayhead();
    currentTimeEl.textContent = formatTime(video.currentTime);
  });

  video.addEventListener('play', () => {
    playPauseIcon.textContent = '⏸';
    flashPlayIndicator('⏸');
    if (isAudioOnly) audioVisualizer.classList.add('video-playing');
  });

  video.addEventListener('pause', () => {
    playPauseIcon.textContent = '▶';
    flashPlayIndicator('▶');
    if (isAudioOnly) audioVisualizer.classList.remove('video-playing');
  });

  video.addEventListener('ended', () => {
    // Loop back to in point instead of stopping
    video.currentTime = inPoint;
    video.play();
  });
}

// ── Formatting ──
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function formatTimeShort(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function parseTimeInput(input: string): number | null {
  // Format expected: mm:ss.ms
  const parts = input.split(':');
  if (parts.length !== 2) return null;
  const mins = parseInt(parts[0], 10);
  const secsParts = parts[1].split('.');
  const secs = parseInt(secsParts[0], 10);
  const ms = secsParts.length > 1 ? parseInt(secsParts[1], 10) : 0;
  
  if (Number.isNaN(mins) || Number.isNaN(secs) || Number.isNaN(ms)) return null;
  return mins * 60 + secs + ms / 1000;
}

// ── Play indicator flash ──
function flashPlayIndicator(icon: string): void {
  playIndicator.textContent = icon;
  playIndicator.classList.add('show');
  setTimeout(() => playIndicator.classList.remove('show'), 400);
}

// ── Zoom ──

/**
 * Apply zoom to the timeline. The timeline-container uses CSS transform
 * to scale its content, but we actually do it by adjusting the positions
 * of all elements relative to a visible window.
 *
 * zoomLevel: 1 = full timeline visible, N = only 1/N of the timeline visible
 * zoomCenter: 0..1, the center of the visible portion
 */
function getVisibleRange(): { start: number; end: number } {
  const windowSize = 1 / zoomLevel;
  let start = zoomCenter - windowSize / 2;
  let end = zoomCenter + windowSize / 2;

  // Clamp to [0, 1]
  if (start < 0) {
    end -= start;
    start = 0;
  }
  if (end > 1) {
    start -= (end - 1);
    end = 1;
  }
  start = Math.max(0, start);
  end = Math.min(1, end);

  return { start, end };
}

/** Map a time (0..duration) to a percent in the visible zoomed window */
function timeToZoomedPercent(time: number): number {
  if (duration <= 0) return 0;
  const normalized = time / duration; // 0..1
  const { start, end } = getVisibleRange();
  const range = end - start;
  if (range <= 0) return 0;
  return ((normalized - start) / range) * 100;
}

/** Map a client X position to a time, accounting for zoom */
function positionToTime(clientX: number): number {
  const rect = timelineContainer.getBoundingClientRect();
  const relativeX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const { start, end } = getVisibleRange();
  const normalized = start + relativeX * (end - start);
  return normalized * duration;
}

function updateZoomUI(): void {
  if (zoomLevel <= 1.05) {
    zoomIndicator.classList.add('hidden');
    timelineWaveform.style.width = '100%';
    timelineWaveform.style.left = '0';
  } else {
    zoomIndicator.classList.remove('hidden');
    zoomLevelEl.textContent = `${zoomLevel.toFixed(1)}x`;

    const { start } = getVisibleRange();
    timelineWaveform.style.width = `${zoomLevel * 100}%`;
    timelineWaveform.style.left = `${-start * zoomLevel * 100}%`;
  }
}

function setZoom(newZoom: number, center?: number): void {
  zoomLevel = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  if (center !== undefined) {
    zoomCenter = center;
  }
  // Clamp center so the visible window stays in bounds
  const halfWindow = (1 / zoomLevel) / 2;
  zoomCenter = Math.max(halfWindow, Math.min(1 - halfWindow, zoomCenter));

  if (zoomLevel <= 1.05) {
    zoomLevel = 1;
    zoomCenter = 0.5;
  }

  updateZoomUI();
  updatePlayhead();
  updateTrimUI();
}

function zoomToFitSelection(): void {
  if (duration <= 0) return;

  const selStart = inPoint / duration;
  const selEnd = outPoint / duration;
  const selWidth = selEnd - selStart;

  if (selWidth <= 0 || selWidth >= 1) {
    setZoom(1);
    return;
  }

  // Add padding around the selection
  const padding = selWidth * ZOOM_PADDING_RATIO;
  const visibleWidth = selWidth + padding * 2;
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, 1 / visibleWidth));
  const newCenter = (selStart + selEnd) / 2;

  setZoom(newZoom, newCenter);
}

function autoZoomIfNeeded(): void {
  if (duration <= 0) return;

  const selRatio = (outPoint - inPoint) / duration;

  // Only auto-zoom if the selection is small relative to the total
  if (selRatio < AUTO_ZOOM_THRESHOLD && selRatio > 0) {
    zoomToFitSelection();
  }
}

// ── Timeline & Playhead ──
function updatePlayhead(): void {
  const percent = timeToZoomedPercent(video.currentTime);
  playhead.style.left = `${percent}%`;
  timelinePlayed.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function updateTrimUI(): void {
  const inPercent = timeToZoomedPercent(inPoint);
  const outPercent = timeToZoomedPercent(outPoint);

  handleIn.style.left = `${inPercent}%`;
  handleOut.style.left = `${outPercent}%`;

  trimRegion.style.left = `${Math.max(0, inPercent)}%`;
  trimRegion.style.width = `${Math.min(100, outPercent) - Math.max(0, inPercent)}%`;

  const selDuration = outPoint - inPoint;
  
  // Only update input if we aren't actively typing in it
  if (document.activeElement !== inPointInput) {
    inPointInput.value = formatTimeShort(inPoint);
  }
  if (document.activeElement !== outPointInput) {
    outPointInput.value = formatTimeShort(outPoint);
  }
  
  trimDuration.textContent = `${selDuration.toFixed(1)}s`;
}

// ── Player Controls ──
function togglePlayPause(): void {
  if (video.paused) {
    // Start playing from the in point if current time is outside the trim range
    if (video.currentTime < inPoint || video.currentTime >= outPoint) {
      video.currentTime = inPoint;
    }
    video.play();
  } else {
    video.pause();
  }
}

function seekToTime(time: number): void {
  video.currentTime = Math.max(0, Math.min(duration, time));
}

function stepFrame(direction: number): void {
  video.pause();
  seekToTime(video.currentTime + direction * FRAME_DURATION);
}

function skip(seconds: number): void {
  seekToTime(video.currentTime + seconds);
}

function setIn(): void {
  inPoint = Math.min(video.currentTime, outPoint - FRAME_DURATION);
  inPoint = Math.max(0, inPoint);
  updateTrimUI();
  autoZoomIfNeeded();
}

function setOut(): void {
  outPoint = Math.max(video.currentTime, inPoint + FRAME_DURATION);
  outPoint = Math.min(duration, outPoint);
  updateTrimUI();
  autoZoomIfNeeded();
}

// ── Click handlers ──
playerOverlay.addEventListener('click', togglePlayPause);
playPauseBtn.addEventListener('click', togglePlayPause);

prevFrameBtn.addEventListener('click', () => stepFrame(-1));
nextFrameBtn.addEventListener('click', () => stepFrame(1));
skipBackBtn.addEventListener('click', () => skip(-SKIP_SECONDS));
skipForwardBtn.addEventListener('click', () => skip(SKIP_SECONDS));

setInBtn.addEventListener('click', setIn);
setOutBtn.addEventListener('click', setOut);

goToInBtn.addEventListener('click', () => seekToTime(inPoint));
goToOutBtn.addEventListener('click', () => seekToTime(outPoint));

// Magnet Toggle
magnetToggleBtn.addEventListener('click', () => {
  isMagnetEnabled = !isMagnetEnabled;
  if (isMagnetEnabled) {
    magnetToggleBtn.classList.add('active');
  } else {
    magnetToggleBtn.classList.remove('active');
  }
});

// Manual Timecode Inputs
inPointInput.addEventListener('change', () => {
  const time = parseTimeInput(inPointInput.value);
  if (time !== null) {
    inPoint = Math.max(0, Math.min(time, outPoint - FRAME_DURATION));
    autoZoomIfNeeded();
  }
  updateTrimUI();
});

outPointInput.addEventListener('change', () => {
  const time = parseTimeInput(outPointInput.value);
  if (time !== null) {
    outPoint = Math.min(duration, Math.max(time, inPoint + FRAME_DURATION));
    autoZoomIfNeeded();
  }
  updateTrimUI();
});

// Zoom controls
zoomResetBtn.addEventListener('click', () => setZoom(1));
zoomFitBtn.addEventListener('click', () => zoomToFitSelection());

// ── Timeline scrubbing ──
timelineContainer.addEventListener('mousedown', (e: MouseEvent) => {
  // Check if clicking on a handle
  const target = e.target as HTMLElement;
  if (target.closest('#handleIn') || target.closest('.trim-handle-in')) {
    isDraggingHandle = 'in';
  } else if (target.closest('#handleOut') || target.closest('.trim-handle-out')) {
    isDraggingHandle = 'out';
  } else {
    isDraggingTimeline = true;
    const time = positionToTime(e.clientX);
    seekToTime(time);
  }
  e.preventDefault();
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  let time = positionToTime(e.clientX);
  
  // Snap to nearest 0.5s if magnet is enabled and we are dragging a handle
  if (isMagnetEnabled && (isDraggingHandle === 'in' || isDraggingHandle === 'out')) {
    time = Math.round(time * 2) / 2;
  }

  if (isDraggingHandle === 'in') {
    inPoint = Math.max(0, Math.min(time, outPoint - FRAME_DURATION));
    updateTrimUI();
  } else if (isDraggingHandle === 'out') {
    outPoint = Math.min(duration, Math.max(time, inPoint + FRAME_DURATION));
    updateTrimUI();
  } else if (isDraggingTimeline) {
    const time = positionToTime(e.clientX);
    seekToTime(time);
  }
});

document.addEventListener('mouseup', () => {
  // Auto-zoom after finishing a handle drag
  if (isDraggingHandle) {
    autoZoomIfNeeded();
  }
  isDraggingHandle = null;
  isDraggingTimeline = false;
});

// ── Mouse wheel zoom on timeline ──
timelineContainer.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();

  // Get the time position under the cursor
  const rect = timelineContainer.getBoundingClientRect();
  const relX = (e.clientX - rect.left) / rect.width;
  const { start, end } = getVisibleRange();
  const cursorNormalized = start + relX * (end - start);

  // Zoom direction
  const zoomFactor = e.deltaY < 0 ? 1.3 : 1 / 1.3;
  const newZoom = zoomLevel * zoomFactor;

  setZoom(newZoom, cursorNormalized);
}, { passive: false });

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e: KeyboardEvent) => {
  // Ignore if typing in an input
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

  switch (e.key) {
    case ' ':
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      skip(-SKIP_SECONDS);
      break;
    case 'ArrowRight':
      e.preventDefault();
      skip(SKIP_SECONDS);
      break;
    case '-':
    case ',':
      e.preventDefault();
      stepFrame(-1);
      break;
    case '+':
    case '=':
    case '.':
      e.preventDefault();
      stepFrame(1);
      break;
    case '[':
      e.preventDefault();
      setIn();
      break;
    case ']':
      e.preventDefault();
      setOut();
      break;
    case '0':
      e.preventDefault();
      setZoom(1);
      break;
    case 'f':
      e.preventDefault();
      zoomToFitSelection();
      break;
  }
});

// ── Export ──
exportBtn.addEventListener('click', () => {
  if (outPoint <= inPoint) {
    alert('Please set valid in/out points');
    return;
  }

  exportOverlay.classList.remove('hidden');
  exportProgressFill.style.width = '0%';
  exportPercent.textContent = '0%';

  browser.runtime.sendMessage({
    type: 'trim_video',
    inputPath: filePath,
    startTime: inPoint,
    endTime: outPoint,
  });
});

// ── Cancel / Close ──
cancelTrimBtn.addEventListener('click', () => {
  browser.runtime.sendMessage({ type: 'stop_server' });
  window.close();
});

// ── Open trimmed file ──
openTrimmedBtn.addEventListener('click', () => {
  const path = openTrimmedBtn.dataset.path;
  if (path) {
    browser.runtime.sendMessage({ type: 'open_folder', path });
  }
});

// ── Close success overlay ──
closeSuccessBtn.addEventListener('click', () => {
  successOverlay.classList.add('hidden');
});

// ── Cleanup on page unload ──
window.addEventListener('beforeunload', () => {
  browser.runtime.sendMessage({ type: 'stop_server' });
});
