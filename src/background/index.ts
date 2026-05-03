import type { Message } from '@shared/messaging';
import {
  getCurrentUserEmail,
  getAuthToken,
  signOut as authSignOut,
  withAuthRetry,
} from '@lib/auth';
import {
  appendApplication,
  createTrackerSheet,
  findByUrlCanonical,
  listApplications,
  syncResumes,
  updateApplicationStatus,
  validateAndPrepareSheet,
} from '@lib/sheets';
import {
  clearPendingCapture,
  getPendingCaptures,
  getSettings,
  queuePendingCapture,
  setSettings,
} from '@lib/storage';

const CONTEXT_MENU_ID = 'job-capture-save';

function openOptions(): void {
  const url = chrome.runtime.getURL('src/options/index.html');
  chrome.tabs.create({ url }).catch(() => undefined);
}

function ensureContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Capture job application',
      contexts: ['page', 'link', 'selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  ensureContextMenu();
  const settings = await getSettings();
  if (!settings.sheet_id) {
    openOptions();
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  const openPopup = (chrome.action as unknown as { openPopup?: () => Promise<void> }).openPopup;
  if (typeof openPopup === 'function') {
    openPopup.call(chrome.action).catch(() => undefined);
  }
});

type Reply = (msg: Message) => void;

function getContentScriptFiles(): string[] {
  const manifest = chrome.runtime.getManifest() as chrome.runtime.ManifestV3;
  const cs = manifest.content_scripts?.[0];
  return cs?.js ?? [];
}

async function handleEnsureContentScript(
  msg: Extract<Message, { type: 'ENSURE_CONTENT_SCRIPT' }>,
  reply: Reply,
) {
  try {
    const files = getContentScriptFiles();
    if (files.length === 0) {
      reply({ type: 'ENSURE_CONTENT_SCRIPT_RESULT', success: false });
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: msg.tabId },
      files,
    });
    reply({ type: 'ENSURE_CONTENT_SCRIPT_RESULT', success: true });
  } catch (err) {
    console.warn('[job-capture] content script injection failed', err);
    reply({ type: 'ENSURE_CONTENT_SCRIPT_RESULT', success: false });
  }
}

async function handleCaptureSave(msg: Extract<Message, { type: 'CAPTURE_SAVE' }>, reply: Reply) {
  try {
    const settings = await getSettings();
    if (!settings.sheet_id) {
      reply({ type: 'CAPTURE_SAVE_RESULT', success: false, error: 'No sheet configured' });
      return;
    }
    await withAuthRetry((token) => appendApplication(token, settings.sheet_id!, msg.row));
    await setSettings({ last_synced_at: new Date().toISOString() });
    reply({ type: 'CAPTURE_SAVE_RESULT', success: true });
    await flushPending();
  } catch (err) {
    console.error('[job-capture] capture save failed', err);
    await queuePendingCapture(msg.row).catch(() => undefined);
    reply({
      type: 'CAPTURE_SAVE_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleCheckDuplicate(
  msg: Extract<Message, { type: 'CHECK_DUPLICATE' }>,
  reply: Reply,
) {
  try {
    const settings = await getSettings();
    if (!settings.sheet_id) {
      reply({ type: 'CHECK_DUPLICATE_RESULT', duplicate: null });
      return;
    }
    const dup = await withAuthRetry((token) =>
      findByUrlCanonical(token, settings.sheet_id!, msg.urlCanonical),
    );
    reply({ type: 'CHECK_DUPLICATE_RESULT', duplicate: dup });
  } catch (err) {
    console.warn('[job-capture] duplicate check failed', err);
    reply({ type: 'CHECK_DUPLICATE_RESULT', duplicate: null });
  }
}

async function handleUpdateStatus(
  msg: Extract<Message, { type: 'UPDATE_STATUS' }>,
  reply: Reply,
) {
  try {
    const settings = await getSettings();
    if (!settings.sheet_id) {
      reply({ type: 'UPDATE_STATUS_RESULT', success: false, error: 'No sheet configured' });
      return;
    }
    await withAuthRetry((token) =>
      updateApplicationStatus(
        token,
        settings.sheet_id!,
        msg.id,
        msg.status,
        new Date().toISOString(),
        msg.notes,
      ),
    );
    reply({ type: 'UPDATE_STATUS_RESULT', success: true });
  } catch (err) {
    reply({
      type: 'UPDATE_STATUS_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleList(reply: Reply) {
  try {
    const settings = await getSettings();
    if (!settings.sheet_id) {
      reply({ type: 'LIST_APPLICATIONS_RESULT', rows: [], error: 'No sheet configured' });
      return;
    }
    const rows = await withAuthRetry((token) => listApplications(token, settings.sheet_id!));
    reply({ type: 'LIST_APPLICATIONS_RESULT', rows });
  } catch (err) {
    reply({
      type: 'LIST_APPLICATIONS_RESULT',
      rows: [],
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleSetupSheet(
  msg: Extract<Message, { type: 'SETUP_SHEET' }>,
  reply: Reply,
) {
  try {
    if (msg.existingId) {
      const res = await withAuthRetry((token) => validateAndPrepareSheet(token, msg.existingId!));
      await setSettings({ sheet_id: msg.existingId, sheet_name: res.name });
      reply({ type: 'SETUP_SHEET_RESULT', success: true, sheetId: msg.existingId, sheetName: res.name });
    } else {
      const name = `Job Applications Tracker - ${new Date().toISOString().slice(0, 10)}`;
      const created = await withAuthRetry((token) => createTrackerSheet(token, name));
      await setSettings({ sheet_id: created.id, sheet_name: created.name });
      reply({ type: 'SETUP_SHEET_RESULT', success: true, sheetId: created.id, sheetName: created.name });
    }
  } catch (err) {
    reply({
      type: 'SETUP_SHEET_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleSignIn(reply: Reply) {
  try {
    const token = await getAuthToken(true);
    const email = await getCurrentUserEmail(token);
    reply({ type: 'SIGN_IN_RESULT', success: true, email: email ?? undefined });
  } catch (err) {
    reply({
      type: 'SIGN_IN_RESULT',
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function flushPending(): Promise<void> {
  const pending = await getPendingCaptures();
  if (pending.length === 0) return;
  const settings = await getSettings();
  if (!settings.sheet_id) return;
  for (const row of pending) {
    try {
      await withAuthRetry((token) => appendApplication(token, settings.sheet_id!, row));
      await clearPendingCapture(row.id);
    } catch (err) {
      console.warn('[job-capture] flush pending failed, will retry later', err);
      return;
    }
  }
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  const reply = sendResponse as Reply;
  switch (msg.type) {
    case 'CAPTURE_SAVE':
      handleCaptureSave(msg, reply);
      return true;
    case 'CHECK_DUPLICATE':
      handleCheckDuplicate(msg, reply);
      return true;
    case 'UPDATE_STATUS':
      handleUpdateStatus(msg, reply);
      return true;
    case 'LIST_APPLICATIONS':
      handleList(reply);
      return true;
    case 'SETUP_SHEET':
      handleSetupSheet(msg, reply);
      return true;
    case 'SIGN_IN':
      handleSignIn(reply);
      return true;
    case 'SIGN_OUT':
      authSignOut().then(() => undefined);
      return false;
    case 'OPEN_DASHBOARD':
      chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/index.html') });
      return false;
    case 'OPEN_SHEET':
      getSettings().then((s) => {
        if (s.sheet_id) {
          chrome.tabs.create({ url: `https://docs.google.com/spreadsheets/d/${s.sheet_id}` });
        }
      });
      return false;
    case 'ENSURE_CONTENT_SCRIPT':
      handleEnsureContentScript(msg, reply);
      return true;
    default:
      return false;
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.app_settings) return;
  const newVal = changes.app_settings.newValue as
    | { sheet_id: string | null; resumes: unknown[] }
    | undefined;
  const oldVal = changes.app_settings.oldValue as { resumes: unknown[] } | undefined;
  if (!newVal?.sheet_id) return;
  const newResumes = JSON.stringify(newVal.resumes ?? []);
  const oldResumes = JSON.stringify(oldVal?.resumes ?? []);
  if (newResumes !== oldResumes) {
    try {
      const settings = await getSettings();
      await withAuthRetry((token) => syncResumes(token, settings.sheet_id!, settings.resumes));
    } catch (err) {
      console.warn('[job-capture] resume sync failed', err);
    }
  }
});
