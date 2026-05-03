import type { ApplicationRow, ApplicationStatus, ParsedJob } from './types';

export type Message =
  | { type: 'PARSE_ACTIVE_TAB' }
  | { type: 'PARSE_RESULT'; job: ParsedJob }
  | { type: 'CAPTURE_SAVE'; row: ApplicationRow }
  | { type: 'CAPTURE_SAVE_RESULT'; success: boolean; error?: string; duplicateOf?: string }
  | { type: 'CHECK_DUPLICATE'; urlCanonical: string }
  | { type: 'CHECK_DUPLICATE_RESULT'; duplicate: ApplicationRow | null }
  | { type: 'UPDATE_STATUS'; id: string; status: ApplicationStatus; notes?: string }
  | { type: 'UPDATE_STATUS_RESULT'; success: boolean; error?: string }
  | { type: 'LIST_APPLICATIONS' }
  | { type: 'LIST_APPLICATIONS_RESULT'; rows: ApplicationRow[]; error?: string }
  | { type: 'SETUP_SHEET'; existingId?: string }
  | { type: 'SETUP_SHEET_RESULT'; success: boolean; sheetId?: string; sheetName?: string; error?: string }
  | { type: 'SIGN_IN' }
  | { type: 'SIGN_IN_RESULT'; success: boolean; email?: string; error?: string }
  | { type: 'SIGN_OUT' }
  | { type: 'OPEN_DASHBOARD' }
  | { type: 'OPEN_SHEET' }
  | { type: 'ENSURE_CONTENT_SCRIPT'; tabId: number }
  | { type: 'ENSURE_CONTENT_SCRIPT_RESULT'; success: boolean };

export async function sendMessage<R = unknown>(msg: Message): Promise<R> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as R);
    });
  });
}

export async function sendTabMessage<R = unknown>(tabId: number, msg: Message): Promise<R> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as R);
    });
  });
}
