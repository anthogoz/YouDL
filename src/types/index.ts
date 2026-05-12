// ── Download State ──

export type DownloadStatus = 'idle' | 'loading_info' | 'downloading' | 'success' | 'error';

export type FormatType = 'audio' | 'video';

export type AudioQuality = 'best' | '128';

export type VideoQuality = 'best' | '1080' | '720';

export interface DownloadState {
  status: DownloadStatus;
  percent: number;
  details: string;
  text: string;
  title: string;
  thumbnail: string;
  duration: string;
  uploader: string;
  file: string;
  filepath: string;
  errorMessage: string;
  format: FormatType;
  quality: string;
}

// ── Native Host Messages ──

export interface NativeProgress {
  status: 'progress';
  percent: number;
  size?: string;
  speed?: string;
  eta?: string;
}

export interface NativeInfo {
  status: 'info';
  text: string;
}

export interface NativeSuccess {
  status: 'ok';
  title?: string;
  file?: string;
  filepath?: string;
  reply?: string;
  received?: string;
  detail?: string;
}

export interface NativeError {
  status: 'error';
  detail?: string;
}

export interface NativeInfoResult {
  status: 'info_result';
  title: string;
  thumbnail: string;
  duration: string;
  uploader: string;
}

export interface NativeServeFile {
  status: 'serve_ready';
  url: string;
  port: number;
}

export interface NativeTrimProgress {
  status: 'trim_progress';
  percent: number;
}

export interface NativeTrimOk {
  status: 'trim_ok';
  file: string;
}

export interface NativeTrimError {
  status: 'trim_error';
  detail: string;
}

export type NativeMessage =
  | NativeProgress
  | NativeInfo
  | NativeSuccess
  | NativeError
  | NativeInfoResult
  | NativeServeFile
  | NativeTrimProgress
  | NativeTrimOk
  | NativeTrimError
  | { status: 'waveform_ready'; imagePath: string }
  | { status: 'waveform_error'; detail: string }
  | { status: 'pick_folder_result'; path: string }
  | { status: 'pick_folder_cancelled' }
  | { status: 'pick_file_result'; path: string }
  | { status: 'pick_file_cancelled' };

// ── Extension Messages (popup ↔ background) ──

export type ExtensionMessage =
  | { type: 'get_state' }
  | { type: 'fetch_info'; url: string }
  | { type: 'start_download'; url: string; format: FormatType; quality: string; customPath?: string }
  | { type: 'cancel_download' }
  | { type: 'open_folder'; path: string }
  | { type: 'state_update'; state: DownloadState }
  | { type: 'serve_file'; filePath: string }
  | { type: 'serve_file_ready'; url: string }
  | { type: 'trim_video'; inputPath: string; startTime: number; endTime: number }
  | { type: 'trim_progress'; percent: number }
  | { type: 'trim_complete'; outputPath: string }
  | { type: 'trim_error'; detail: string }
  | { type: 'stop_server' }
  | { type: 'get_waveform'; filePath: string }
  | { type: 'waveform_ready'; url: string }
  | { type: 'waveform_error'; detail: string }
  | { type: 'pick_folder' }
  | { type: 'pick_folder_result'; path: string }
  | { type: 'pick_file' }
  | { type: 'pick_file_result'; path: string };
