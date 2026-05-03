import { useMemo, useState } from 'react';
import type {
  ApplicationRow,
  ApplicationStatus,
  ParsedJob,
  ResumeVariant,
  Seniority,
  WorkMode,
} from '@shared/types';
import { sendMessage } from '@shared/messaging';

interface FormState {
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
}

interface Props {
  job: ParsedJob;
  resumes: ResumeVariant[];
  defaultResumeId: string | null;
  defaultStatus: ApplicationStatus;
  duplicate: ApplicationRow | null;
  submitting: boolean;
  onSave: (form: FormState) => Promise<void>;
  onUpdateDuplicateStatus: (dup: ApplicationRow, status: ApplicationStatus) => Promise<void>;
}

const WORK_MODES: WorkMode[] = ['remote', 'hybrid', 'onsite', 'unknown'];
const SENIORITIES: Seniority[] = [
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
  'unknown',
];
const STATUSES: ApplicationStatus[] = [
  'saved',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
  'ghosted',
];

function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
  period: ApplicationRow['salary_period'],
): string {
  if (min == null && max == null) return '';
  const cur = currency ? `${currency} ` : '';
  const per = period ? `/${period}` : '';
  const fmt = (n: number) => {
    if (n >= 1000) return `${Math.round(n / 1000)}k`;
    return String(n);
  };
  if (min != null && max != null && min !== max) return `${cur}${fmt(min)}–${fmt(max)}${per}`;
  const v = min ?? max!;
  return `${cur}${fmt(v)}${per}`;
}

function lowConfClass(conf: number): string {
  return conf < 0.6 ? 'border-l-4 border-yellow-400 pl-2' : '';
}

export default function CaptureForm(props: Props) {
  const { job, resumes, defaultResumeId, defaultStatus, duplicate, submitting } = props;

  const activeResumes = useMemo(() => resumes.filter((r) => r.active), [resumes]);
  const initialResume =
    defaultResumeId && activeResumes.some((r) => r.id === defaultResumeId)
      ? defaultResumeId
      : (activeResumes[0]?.id ?? '');

  const [form, setForm] = useState<FormState>({
    company: job.company ?? '',
    role: job.role ?? '',
    location: job.location ?? '',
    work_mode: job.work_mode,
    seniority: job.seniority,
    years_min: job.years_min,
    years_max: job.years_max,
    salary_min: job.salary_min,
    salary_max: job.salary_max,
    salary_currency: job.salary_currency,
    salary_period: job.salary_period,
    resume_used: initialResume,
    status: defaultStatus,
    notes: '',
    required_skills: job.required_skills.join(', '),
    preferred_skills: job.preferred_skills.join(', '),
    jd_snippet: job.jd_snippet ?? '',
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canSave = form.company.trim() && form.role.trim() && form.resume_used;

  if (duplicate) {
    return (
      <div className="p-4 space-y-3">
        <div className="bg-yellow-50 border border-yellow-300 rounded-md p-3 text-sm">
          <div className="font-medium text-yellow-900">
            Already captured on {duplicate.applied_at}
          </div>
          <div className="text-gray-700 mt-1">
            {duplicate.company} · {duplicate.role}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Current status: <span className="font-medium">{duplicate.status}</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gray-700">Update status to</label>
          <div className="flex flex-wrap gap-2">
            {STATUSES.filter((s) => s !== duplicate.status).map((s) => (
              <button
                key={s}
                disabled={submitting}
                onClick={() => props.onUpdateDuplicateStatus(duplicate, s)}
                className="text-xs px-2 py-1 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-gray-900">Capture Job</h1>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
          {job.platform}
        </span>
      </div>

      <div className={`space-y-1 ${lowConfClass(job.confidence.company)}`}>
        <label className="text-xs text-gray-600">Company *</label>
        <input
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
          value={form.company}
          onChange={(e) => update('company', e.target.value)}
        />
      </div>

      <div className={`space-y-1 ${lowConfClass(job.confidence.role)}`}>
        <label className="text-xs text-gray-600">Role *</label>
        <input
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
          value={form.role}
          onChange={(e) => update('role', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={`space-y-1 ${lowConfClass(job.confidence.location)}`}>
          <label className="text-xs text-gray-600">Location</label>
          <input
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-brand-500"
            value={form.location}
            onChange={(e) => update('location', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Work mode</label>
          <select
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            value={form.work_mode}
            onChange={(e) => update('work_mode', e.target.value as WorkMode)}
          >
            {WORK_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className={`space-y-1 ${lowConfClass(job.confidence.years)}`}>
          <label className="text-xs text-gray-600">Years exp (min–max)</label>
          <div className="flex gap-1">
            <input
              type="number"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              value={form.years_min ?? ''}
              onChange={(e) =>
                update('years_min', e.target.value === '' ? null : Number(e.target.value))
              }
            />
            <input
              type="number"
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              value={form.years_max ?? ''}
              onChange={(e) =>
                update('years_max', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Seniority</label>
          <select
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            value={form.seniority}
            onChange={(e) => update('seniority', e.target.value as Seniority)}
          >
            {SENIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(form.salary_min != null || form.salary_max != null) && (
        <div className={`space-y-1 ${lowConfClass(job.confidence.salary)}`}>
          <label className="text-xs text-gray-600">Salary (parsed)</label>
          <div className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-md px-2 py-1.5">
            {formatSalary(form.salary_min, form.salary_max, form.salary_currency, form.salary_period) ||
              '—'}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-gray-600">Resume used *</label>
        <select
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
          value={form.resume_used}
          onChange={(e) => update('resume_used', e.target.value)}
        >
          {activeResumes.length === 0 && <option value="">No resumes registered — add in settings</option>}
          {activeResumes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.display_name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-600">Status</label>
        <select
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
          value={form.status}
          onChange={(e) => update('status', e.target.value as ApplicationStatus)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-600">Notes</label>
        <textarea
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm resize-none"
          rows={2}
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={() => window.close()}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          onClick={() => void props.onSave(form)}
          disabled={!canSave || submitting}
          className="bg-brand-600 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
        <button
          onClick={() => void sendMessage({ type: 'OPEN_SHEET' })}
          className="text-gray-600 hover:text-brand-600"
        >
          Open sheet
        </button>
        <button
          onClick={() => void sendMessage({ type: 'OPEN_DASHBOARD' })}
          className="text-gray-600 hover:text-brand-600"
        >
          Dashboard
        </button>
        <button
          onClick={() => chrome.runtime.openOptionsPage?.()}
          className="text-gray-600 hover:text-brand-600"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
