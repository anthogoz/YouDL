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

export type NativeMessage =
  | NativeProgress
  | NativeInfo
  | NativeSuccess
  | NativeError
  | NativeInfoResult;

// ── Extension Messages (popup ↔ background) ──

export type ExtensionMessage =
  | { type: 'get_state' }
  | { type: 'fetch_info'; url: string }
  | { type: 'start_download'; url: string; format: FormatType; quality: string }
  | { type: 'cancel_download' }
  | { type: 'open_folder'; path: string }
  | { type: 'state_update'; state: DownloadState };
