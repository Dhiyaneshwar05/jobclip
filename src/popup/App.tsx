import { useEffect, useState } from 'react';
import type {
  ApplicationRow,
  ApplicationStatus,
  ParsedJob,
  ResumeVariant,
  Seniority,
  WorkMode,
} from '@shared/types';
import { SCHEMA_VERSION } from '@shared/types';
import type { Message } from '@shared/messaging';
import { sendMessage } from '@shared/messaging';
import { makeApplicationId } from '@shared/id';
import { getSettings } from '@lib/storage';
import { canonicalizeUrl } from '../content/utils/extract';
import CaptureForm from './components/CaptureForm';

type UIState =
  | { kind: 'loading' }
  | { kind: 'setup-needed' }
  | {
      kind: 'ready';
      job: ParsedJob;
      resumes: ResumeVariant[];
      defaultResumeId: string | null;
      defaultStatus: ApplicationStatus;
      duplicate: ApplicationRow | null;
    }
  | { kind: 'saved'; message: string }
  | { kind: 'error'; message: string };

function minimalJobFromTab(url: string, title: string): ParsedJob {
  return {
    platform: 'other',
    url,
    url_canonical: canonicalizeUrl(url),
    company: null,
    role: title || null,
    location: null,
    work_mode: 'unknown',
    seniority: 'unknown',
    years_min: null,
    years_max: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    jd_snippet: null,
    required_skills: [],
    preferred_skills: [],
    confidence: { company: 0, role: 0.3, location: 0, salary: 0, years: 0 },
  };
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

function sendParseRequest(tabId: number): Promise<ParsedJob | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'PARSE_ACTIVE_TAB' } satisfies Message, (response) => {
      if (chrome.runtime.lastError || !response || (response as Message).type !== 'PARSE_RESULT') {
        resolve(null);
        return;
      }
      resolve((response as Extract<Message, { type: 'PARSE_RESULT' }>).job);
    });
  });
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await sendMessage<Message>({ type: 'ENSURE_CONTENT_SCRIPT', tabId });
  } catch {
    /* injection may fail on restricted URLs; fine */
  }
}

async function parseTabWithTimeout(
  tabId: number,
  url: string,
  title: string,
  ms: number,
): Promise<ParsedJob> {
  const quickTry = await Promise.race<ParsedJob | null>([
    sendParseRequest(tabId),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
  if (quickTry) return quickTry;

  await ensureContentScript(tabId);
  const retry = await Promise.race<ParsedJob | null>([
    sendParseRequest(tabId),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
  if (retry) return retry;

  return minimalJobFromTab(url, title);
}

export default function App() {
  const [state, setState] = useState<UIState>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const tab = await getActiveTab();
        const settings = await getSettings();

        if (!settings.sheet_id) {
          setState({ kind: 'setup-needed' });
          return;
        }

        if (!tab?.url || !tab.id) {
          setState({ kind: 'error', message: 'No active tab' });
          return;
        }

        const job = await parseTabWithTimeout(tab.id, tab.url, tab.title ?? '', 900);
        const dupRes = await sendMessage<Message>({
          type: 'CHECK_DUPLICATE',
          urlCanonical: job.url_canonical,
        }).catch(() => ({ type: 'CHECK_DUPLICATE_RESULT', duplicate: null }) as Message);

        const duplicate =
          dupRes.type === 'CHECK_DUPLICATE_RESULT' ? dupRes.duplicate : null;

        setState({
          kind: 'ready',
          job,
          resumes: settings.resumes,
          defaultResumeId: settings.default_resume_id,
          defaultStatus: settings.default_status,
          duplicate,
        });
      } catch (err) {
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    })();
  }, []);

  async function handleSave(form: {
    company: string;
    role: string;
    location: string;
    work_mode: WorkMode;
    seniority: Seniority;
    years_min: number | null;
    years_max: number | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_currency: string | null;
    salary_period: ApplicationRow['salary_period'];
    resume_used: string;
    status: ApplicationStatus;
    notes: string;
    required_skills: string;
    preferred_skills: string;
    jd_snippet: string;
  }) {
    if (state.kind !== 'ready') return;
    setSubmitting(true);
    try {
      const now = new Date();
      const id = await makeApplicationId(state.job.url_canonical, now);

      const row: ApplicationRow = {
        id,
        captured_at: now.toISOString(),
        applied_at: now.toISOString().slice(0, 10),
        url: state.job.url,
        url_canonical: state.job.url_canonical,
        platform: state.job.platform,
        company: form.company,
        role: form.role,
        location: form.location,
        work_mode: form.work_mode,
        seniority: form.seniority,
        years_min: form.years_min,
        years_max: form.years_max,
        salary_min: form.salary_min,
        salary_max: form.salary_max,
        salary_currency: form.salary_currency,
        salary_period: form.salary_period,
        jd_snippet: form.jd_snippet,
        required_skills: form.required_skills,
        preferred_skills: form.preferred_skills,
        resume_used: form.resume_used,
        status: form.status,
        status_updated_at: now.toISOString(),
        notes: form.notes,
        source: 'toolbar',
        schema_version: SCHEMA_VERSION,
      };

      const res = await sendMessage<Message>({ type: 'CAPTURE_SAVE', row });
      if (res.type === 'CAPTURE_SAVE_RESULT' && res.success) {
        setState({ kind: 'saved', message: 'Captured to your tracker' });
        setTimeout(() => window.close(), 1500);
      } else if (res.type === 'CAPTURE_SAVE_RESULT') {
        setState({ kind: 'error', message: res.error ?? 'Save failed' });
      }
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateStatusOfDuplicate(dup: ApplicationRow, status: ApplicationStatus) {
    setSubmitting(true);
    const res = await sendMessage<Message>({ type: 'UPDATE_STATUS', id: dup.id, status });
    if (res.type === 'UPDATE_STATUS_RESULT' && res.success) {
      setState({ kind: 'saved', message: `Status updated to ${status}` });
      setTimeout(() => window.close(), 1500);
    } else if (res.type === 'UPDATE_STATUS_RESULT') {
      setState({ kind: 'error', message: res.error ?? 'Update failed' });
    }
    setSubmitting(false);
  }

  if (state.kind === 'loading') {
    return (
      <div className="p-5 text-sm text-gray-600">
        Loading capture form…
      </div>
    );
  }

  if (state.kind === 'setup-needed') {
    return (
      <div className="p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Finish setup first</h2>
        <p className="text-gray-600 text-sm">
          Connect your Google account and pick a tracker sheet before capturing.
        </p>
        <button
          className="w-full bg-brand-600 text-white rounded-md py-2 font-medium hover:bg-brand-700"
          onClick={() => {
            chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html') });
            window.close();
          }}
        >
          Open settings
        </button>
      </div>
    );
  }

  if (state.kind === 'saved') {
    return (
      <div className="p-5 flex flex-col items-center justify-center min-h-[500px] space-y-2">
        <div className="h-10 w-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">
          ✓
        </div>
        <p className="text-gray-900 font-medium">{state.message}</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="p-5 space-y-3">
        <h2 className="font-semibold text-red-700">Something went wrong</h2>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{state.message}</p>
        <button
          className="text-sm text-brand-600 underline"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <CaptureForm
      job={state.job}
      resumes={state.resumes}
      defaultResumeId={state.defaultResumeId}
      defaultStatus={state.defaultStatus}
      duplicate={state.duplicate}
      onSave={handleSave}
      onUpdateDuplicateStatus={handleUpdateStatusOfDuplicate}
      submitting={submitting}
    />
  );
}
