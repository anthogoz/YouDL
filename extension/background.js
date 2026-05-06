const HOST_NAME = "com.typebeat.downloader";

let nativePort = null;
let downloadState = {
  status: "idle", // idle, downloading, success, error
  percent: 0,
  details: "",
  text: "",
  title: "",
  file: "",
  errorMessage: "",
  format: ""
};

// Listen for connections from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get_state") {
    sendResponse(downloadState);
    return true;
  }
  
  if (message.type === "start_download") {
    startDownload(message.url, message.format);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === "cancel_download") {
    if (nativePort) {
      nativePort.disconnect();
      nativePort = null;
    }
    if (downloadState.status === "downloading") {
      downloadState.status = "error";
      downloadState.errorMessage = "Download cancelled";
      broadcastState();
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === "open_folder") {
    if (!nativePort) {
      nativePort = chrome.runtime.connectNative(HOST_NAME);
    }
    nativePort.postMessage({ action: "open_folder", path: message.path });
    sendResponse({ success: true });
    return true;
  }
});

function broadcastState() {
  chrome.runtime.sendMessage({ type: "state_update", state: downloadState }).catch(() => {
    // Popup might be closed, ignore error
  });
}

function startDownload(url, format) {
  if (downloadState.status === "downloading") return;
  
  downloadState = {
    status: "downloading",
    percent: 0,
    details: "--",
    text: "Starting...",
    title: "",
    file: "",
    errorMessage: "",
    format: format
  };
  broadcastState();

  if (!nativePort) {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    
    nativePort.onMessage.addListener((response) => {
      if (response.status === "progress") {
        downloadState.status = "downloading";
        downloadState.percent = response.percent;
        
        const details = [];
        if (response.size) details.push(response.size);
        if (response.speed) details.push(response.speed);
        if (response.eta) details.push("ETA: " + response.eta);
        
        downloadState.details = details.join(" • ");
        downloadState.text = response.percent + "%";
        broadcastState();
        
      } else if (response.status === "info") {
        downloadState.status = "downloading";
        // Truncate text if it's too long
        downloadState.text = response.text.length > 50 ? response.text.substring(0, 47) + "..." : response.text;
        downloadState.details = "Processing...";
        broadcastState();
        
      } else if (response.status === "ok" && response.file) { // Download response
        downloadState.status = "success";
        downloadState.title = response.title;
        downloadState.file = response.file;
        broadcastState();
        
      } else if (response.status === "error") {
        downloadState.status = "error";
        downloadState.errorMessage = response.detail || "Unknown error";
        broadcastState();
      }
    });

    nativePort.onDisconnect.addListener(() => {
      console.error("Native port disconnected:", chrome.runtime.lastError);
      nativePort = null;
      if (downloadState.status === "downloading") {
        downloadState.status = "error";
        downloadState.errorMessage = "Native host disconnected";
        broadcastState();
      }
    });
  }

  nativePort.postMessage({ action: "download", url: url, format: format });
}
