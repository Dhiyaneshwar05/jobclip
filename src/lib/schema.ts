import { z } from 'zod';
import {
  APPLICATION_COLUMNS,
  RESUME_COLUMNS,
  SCHEMA_VERSION,
  type ApplicationRow,
  type ResumeVariant,
} from '@shared/types';

export const PlatformSchema = z.enum([
  'linkedin',
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'other',
]);
export const WorkModeSchema = z.enum(['remote', 'hybrid', 'onsite', 'unknown']);
export const SenioritySchema = z.enum([
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'principal',
  'unknown',
]);
export const SalaryPeriodSchema = z.enum(['year', 'month', 'hour']);
export const StatusSchema = z.enum([
  'saved',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
  'ghosted',
]);
export const SourceSchema = z.enum(['toolbar', 'context-menu', 'manual']);

export const ApplicationRowSchema = z.object({
  id: z.string(),
  captured_at: z.string(),
  applied_at: z.string(),
  url: z.string(),
  url_canonical: z.string(),
  platform: PlatformSchema,
  company: z.string(),
  role: z.string(),
  location: z.string(),
  work_mode: WorkModeSchema,
  seniority: SenioritySchema,
  years_min: z.number().nullable(),
  years_max: z.number().nullable(),
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_currency: z.string().nullable(),
  salary_period: SalaryPeriodSchema.nullable(),
  jd_snippet: z.string(),
  required_skills: z.string(),
  preferred_skills: z.string(),
  resume_used: z.string(),
  status: StatusSchema,
  status_updated_at: z.string(),
  notes: z.string(),
  source: SourceSchema,
  schema_version: z.number(),
});

export const ResumeVariantSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  file_hint: z.string(),
  active: z.boolean(),
  created_at: z.string(),
});

export const AppSettingsSchema = z.object({
  sheet_id: z.string().nullable(),
  sheet_name: z.string().nullable(),
  resumes: z.array(ResumeVariantSchema),
  default_resume_id: z.string().nullable(),
  default_status: StatusSchema,
  last_synced_at: z.string().nullable(),
});

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v);
}

export function rowToSheetValues(row: ApplicationRow): string[] {
  return APPLICATION_COLUMNS.map((col) => cellToString(row[col]));
}

export function resumeToSheetValues(r: ResumeVariant): string[] {
  return RESUME_COLUMNS.map((col) => cellToString(r[col]));
}

function parseNumberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  return s === '' ? null : s;
}

export function sheetValuesToRow(values: unknown[], headers: string[]): ApplicationRow {
  const get = (col: string): unknown => {
    const idx = headers.indexOf(col);
    return idx >= 0 ? values[idx] : undefined;
  };

  const raw: ApplicationRow = {
    id: String(get('id') ?? ''),
    captured_at: String(get('captured_at') ?? ''),
    applied_at: String(get('applied_at') ?? ''),
    url: String(get('url') ?? ''),
    url_canonical: String(get('url_canonical') ?? ''),
    platform: (get('platform') as ApplicationRow['platform']) || 'other',
    company: String(get('company') ?? ''),
    role: String(get('role') ?? ''),
    location: String(get('location') ?? ''),
    work_mode: (get('work_mode') as ApplicationRow['work_mode']) || 'unknown',
    seniority: (get('seniority') as ApplicationRow['seniority']) || 'unknown',
    years_min: parseNumberOrNull(get('years_min')),
    years_max: parseNumberOrNull(get('years_max')),
    salary_min: parseNumberOrNull(get('salary_min')),
    salary_max: parseNumberOrNull(get('salary_max')),
    salary_currency: parseStringOrNull(get('salary_currency')),
    salary_period: (parseStringOrNull(get('salary_period')) as ApplicationRow['salary_period']) ?? null,
    jd_snippet: String(get('jd_snippet') ?? ''),
    required_skills: String(get('required_skills') ?? ''),
    preferred_skills: String(get('preferred_skills') ?? ''),
    resume_used: String(get('resume_used') ?? ''),
    status: (get('status') as ApplicationRow['status']) || 'applied',
    status_updated_at: String(get('status_updated_at') ?? ''),
    notes: String(get('notes') ?? ''),
    source: (get('source') as ApplicationRow['source']) || 'toolbar',
    schema_version: parseNumberOrNull(get('schema_version')) ?? SCHEMA_VERSION,
  };
  return raw;
}
