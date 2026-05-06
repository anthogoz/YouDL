// ── DOM Elements ──
const tabCard = document.getElementById("tabCard");
const tabTitle = document.getElementById("tabTitle");
const tabUrl = document.getElementById("tabUrl");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const downloadAudioBtn = document.getElementById("downloadAudioBtn");
const btnAudioLabel = document.getElementById("btnAudioLabel");
const downloadVideoBtn = document.getElementById("downloadVideoBtn");
const btnVideoLabel = document.getElementById("btnVideoLabel");

const progressContainer = document.getElementById("progressContainer");
const progressText = document.getElementById("progressText");
const progressDetail = document.getElementById("progressDetail");
const progressBar = document.getElementById("progressBar");
const stopBtn = document.getElementById("stopBtn");

const responseBox = document.getElementById("responseBox");
const resultTitle = document.getElementById("resultTitle");
const filePath = document.getElementById("filePath");
const openFolderBtn = document.getElementById("openFolderBtn");

// ── Current tab data ──
let currentTabUrl = null;

// ── Helpers ──
function setStatus(state, text) {
  statusDot.className = "status-indicator " + state;
  statusText.textContent = text;
}

function showResult(type, html, details = null) {
  responseBox.classList.remove("hidden", "success-result", "error-result");
  responseBox.classList.add(type === "success" ? "success-result" : "error-result");
  
  resultTitle.innerHTML = html;
  
  if (details && type === "success") {
    filePath.textContent = details.file || "";
    filePath.style.display = "block";
    openFolderBtn.classList.remove("hidden");
    openFolderBtn.dataset.path = details.file;
  } else {
    filePath.style.display = "none";
    openFolderBtn.classList.add("hidden");
  }
}

function isSupportedUrl(url) {
  return url && (url.startsWith("http://") || url.startsWith("https://"));
}

// ── Detect current tab on popup open ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs || tabs.length === 0) {
    tabTitle.textContent = "No active tab";
    return;
  }

  const tab = tabs[0];
  const url = tab.url || "";
  const title = tab.title || "Untitled";

  tabTitle.textContent = title;
  tabUrl.textContent = url;

  if (isSupportedUrl(url)) {
    currentTabUrl = url;
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    setStatus("", "Ready to download");
  } else {
    tabTitle.textContent = "⚠️ Unsupported webpage";
    setStatus("error", "Open a site with media content");
  }
  
  // Interroger l'arrière-plan pour restaurer l'état
  chrome.runtime.sendMessage({ type: "get_state" }, (state) => {
    if (state && state.status !== "idle") {
      renderState(state);
    }
  });
});

// ── State Management ──
function renderState(state) {
  if (state.status === "downloading") {
    setStatus("loading", "Downloading...");
    downloadAudioBtn.disabled = true;
    downloadVideoBtn.disabled = true;
    
    if (state.format === "audio") {
      btnAudioLabel.textContent = "In progress...";
    } else {
      btnVideoLabel.textContent = "In progress...";
    }
    
    responseBox.classList.add("hidden");
    progressContainer.classList.remove("hidden");
    progressBar.style.width = state.percent + "%";
    progressText.textContent = state.text || (state.percent + "%");
    progressDetail.textContent = state.details;
    
  } else if (state.status === "success") {
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    btnAudioLabel.textContent = "Download Audio";
    btnVideoLabel.textContent = "Download Video";
    
    setStatus("success", "Finished ✓");
    progressContainer.classList.add("hidden");
    showResult("success", `✅ <strong>${state.title}</strong>`, { file: state.file });
    
  } else if (state.status === "error") {
    downloadAudioBtn.disabled = false;
    downloadVideoBtn.disabled = false;
    btnAudioLabel.textContent = "Download Audio";
    btnVideoLabel.textContent = "Download Video";
    
    setStatus("error", "Failed");
    progressContainer.classList.add("hidden");
    showResult("error", "❌ " + (state.errorMessage || "Unknown error"));
  }
}

// Écouter les mises à jour en direct depuis l'arrière-plan
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "state_update") {
    renderState(message.state);
  }
});

// ── Download Action ──
function doDownload(format) {
  if (!currentTabUrl) return;

  chrome.runtime.sendMessage({ type: "start_download", url: currentTabUrl, format: format });
  
  renderState({
    status: "downloading",
    percent: 0,
    text: "Starting...",
    details: "--",
    format: format
  });
}

downloadAudioBtn.addEventListener("click", () => doDownload("audio"));
downloadVideoBtn.addEventListener("click", () => doDownload("video"));

stopBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "cancel_download" });
});

openFolderBtn.addEventListener("click", () => {
  const path = openFolderBtn.dataset.path;
  if (!path) return;
  chrome.runtime.sendMessage({ type: "open_folder", path: path });
});
