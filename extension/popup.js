// ── DOM Elements ──
const videoThumb = document.getElementById("videoThumb");
const thumbPlaceholder = document.getElementById("thumbPlaceholder");
const videoTitle = document.getElementById("videoTitle");
const videoUploader = document.getElementById("videoUploader");
const durationBadge = document.getElementById("durationBadge");

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

const downloadAudioBtn = document.getElementById("downloadAudioBtn");
const downloadVideoBtn = document.getElementById("downloadVideoBtn");

const audioQualityGroup = document.getElementById("audioQualityGroup");
const videoQualityGroup = document.getElementById("videoQualityGroup");

const progressSection = document.getElementById("progressSection");
const progressPercent = document.getElementById("progressPercent");
const progressFill = document.getElementById("progressFill");
const progressDetails = document.getElementById("progressDetails");
const cancelBtn = document.getElementById("cancelBtn");

const resultSection = document.getElementById("resultSection");
const resultFilePath = document.getElementById("resultFilePath");
const openFolderBtn = document.getElementById("openFolderBtn");

// ── State ──
let currentUrl = "";
let selectedAudioQuality = "best";
let selectedVideoQuality = "best";

// ── Initialization ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || tabs.length === 0) return;
  const tab = tabs[0];
  currentUrl = tab.url || "";

  if (isSupportedUrl(currentUrl)) {
    // Initial UI state
    videoTitle.textContent = "Fetching metadata...";
    setStatus("loading", "Connecting to host...");
    
    // Request metadata from background
    chrome.runtime.sendMessage({ type: "fetch_info", url: currentUrl });
  } else {
    videoTitle.textContent = "Unsupported website";
    setStatus("error", "Navigate to a media site");
  }
  
  // Restore state from background
  chrome.runtime.sendMessage({ type: "get_state" }, (state) => {
    renderState(state);
  });
});

// ── Listen for updates ──
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "state_update") {
    renderState(message.state);
  }
});

// ── Helpers ──
function isSupportedUrl(url) {
  return url && (url.startsWith("http://") || url.startsWith("https://"));
}

function setStatus(type, text) {
  statusDot.className = "status-dot " + type;
  statusText.textContent = text;
}

function renderState(state) {
  // 1. Metadata
  if (state.title) {
    videoTitle.textContent = state.title;
    videoUploader.textContent = state.uploader || "";
  }
  if (state.thumbnail) {
    videoThumb.src = state.thumbnail;
    videoThumb.classList.remove("hidden");
    thumbPlaceholder.classList.add("hidden");
  }
  if (state.duration) {
    durationBadge.textContent = state.duration;
    durationBadge.classList.remove("hidden");
  }

  // 2. Status & Buttons
  if (state.status === "loading_info") {
    setStatus("loading", "Analyzing video...");
    downloadAudioBtn.disabled = true;
    downloadVideoBtn.disabled = true;
  } else if (state.status === "downloading") {
    setStatus("loading", "Downloading...");
    downloadAudioBtn.disabled = true;
    downloadVideoBtn.disabled = true;
    progressSection.classList.remove("hidden");
    resultSection.classList.add("hidden");
    
    progressPercent.textContent = state.text || "0%";
    progressFill.style.width = state.percent + "%";
    progressDetails.textContent = state.details || "Processing...";
  } else if (state.status === "success") {
    setStatus("active", "Download finished");
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add("hidden");
    resultSection.classList.remove("hidden");
    resultFilePath.textContent = state.file || "";
    openFolderBtn.dataset.path = state.file;
  } else if (state.status === "error") {
    setStatus("error", state.errorMessage || "Error occurred");
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add("hidden");
  } else {
    // Idle
    setStatus("active", "Ready");
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    progressSection.classList.add("hidden");
  }
}

// ── Quality Selection ──
function setupToggleGroup(group, callback) {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle-btn");
    if (!btn) return;
    
    group.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    callback(btn.dataset.quality);
  });
}

setupToggleGroup(audioQualityGroup, (q) => selectedAudioQuality = q);
setupToggleGroup(videoQualityGroup, (q) => selectedVideoQuality = q);

// ── Actions ──
downloadAudioBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ 
    type: "start_download", 
    url: currentUrl, 
    format: "audio", 
    quality: selectedAudioQuality 
  });
});

downloadVideoBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ 
    type: "start_download", 
    url: currentUrl, 
    format: "video", 
    quality: selectedVideoQuality 
  });
});

cancelBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "cancel_download" });
});

openFolderBtn.addEventListener("click", () => {
  const path = openFolderBtn.dataset.path;
  if (path) chrome.runtime.sendMessage({ type: "open_folder", path: path });
});
