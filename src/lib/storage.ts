import type { AppSettings, ApplicationRow, ResumeVariant } from '@shared/types';

const SETTINGS_KEY = 'app_settings';
const PENDING_KEY = 'pending_captures';

const DEFAULTS: AppSettings = {
  sheet_id: null,
  sheet_name: null,
  resumes: [],
  default_resume_id: null,
  default_status: 'applied',
  last_synced_at: null,
};

export async function getSettings(): Promise<AppSettings> {
  const res = (await chrome.storage.local.get(SETTINGS_KEY)) as { [SETTINGS_KEY]?: AppSettings };
  return { ...DEFAULTS, ...(res[SETTINGS_KEY] ?? {}) };
}

export async function setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next: AppSettings = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

export async function addResume(
  data: Omit<ResumeVariant, 'id' | 'created_at'>,
): Promise<ResumeVariant> {
  const settings = await getSettings();
  const resume: ResumeVariant = {
    ...data,
    id: `${slugify(data.display_name) || 'resume'}-${randomSuffix()}`,
    created_at: new Date().toISOString(),
  };
  await setSettings({ resumes: [...settings.resumes, resume] });
  return resume;
}

export async function updateResume(id: string, patch: Partial<ResumeVariant>): Promise<void> {
  const settings = await getSettings();
  const resumes = settings.resumes.map((r) => (r.id === id ? { ...r, ...patch, id: r.id } : r));
  await setSettings({ resumes });
}

export async function deleteResume(id: string): Promise<void> {
  const settings = await getSettings();
  const resumes = settings.resumes.filter((r) => r.id !== id);
  const default_resume_id = settings.default_resume_id === id ? null : settings.default_resume_id;
  await setSettings({ resumes, default_resume_id });
}

export async function getPendingCaptures(): Promise<ApplicationRow[]> {
  const res = (await chrome.storage.local.get(PENDING_KEY)) as { [PENDING_KEY]?: ApplicationRow[] };
  return res[PENDING_KEY] ?? [];
}

export async function queuePendingCapture(row: ApplicationRow): Promise<void> {
  const current = await getPendingCaptures();
  if (current.some((r) => r.id === row.id)) return;
  await chrome.storage.local.set({ [PENDING_KEY]: [...current, row] });
}

export async function clearPendingCapture(id: string): Promise<void> {
  const current = await getPendingCaptures();
  await chrome.storage.local.set({ [PENDING_KEY]: current.filter((r) => r.id !== id) });
}
