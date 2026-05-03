export type Platform =
  | 'linkedin'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'other';

export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';

export type Seniority =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal'
  | 'unknown';

export type SalaryPeriod = 'year' | 'month' | 'hour';

export type ApplicationStatus =
  | 'saved'
  | 'applied'
  | 'screening'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'ghosted';

export type CaptureSource = 'toolbar' | 'context-menu' | 'manual';

export interface FieldConfidence {
  company: number;
  role: number;
  location: number;
  salary: number;
  years: number;
}

export interface ParsedJob {
  platform: Platform;
  url: string;
  url_canonical: string;
  company: string | null;
  role: string | null;
  location: string | null;
  work_mode: WorkMode;
  seniority: Seniority;
  years_min: number | null;
  years_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  jd_snippet: string | null;
  required_skills: string[];
  preferred_skills: string[];
  confidence: FieldConfidence;
}

export interface ResumeVariant {
  id: string;
  display_name: string;
  file_hint: string;
  active: boolean;
  created_at: string;
}

export interface ApplicationRow {
  id: string;
  captured_at: string;
  applied_at: string;
  url: string;
  url_canonical: string;
  platform: Platform;
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
  salary_period: SalaryPeriod | null;
  jd_snippet: string;
  required_skills: string;
  preferred_skills: string;
  resume_used: string;
  status: ApplicationStatus;
  status_updated_at: string;
  notes: string;
  source: CaptureSource;
  schema_version: number;
}

export interface AppSettings {
  sheet_id: string | null;
  sheet_name: string | null;
  resumes: ResumeVariant[];
  default_resume_id: string | null;
  default_status: ApplicationStatus;
  last_synced_at: string | null;
}

export const SCHEMA_VERSION = 1;

export const SHEET_TABS = {
  applications: 'applications',
  resumes: 'resumes',
  meta: 'meta',
} as const;

export const APPLICATION_COLUMNS: (keyof ApplicationRow)[] = [
  'id',
  'captured_at',
  'applied_at',
  'url',
  'url_canonical',
  'platform',
  'company',
  'role',
  'location',
  'work_mode',
  'seniority',
  'years_min',
  'years_max',
  'salary_min',
  'salary_max',
  'salary_currency',
  'salary_period',
  'jd_snippet',
  'required_skills',
  'preferred_skills',
  'resume_used',
  'status',
  'status_updated_at',
  'notes',
  'source',
  'schema_version',
];

export const RESUME_COLUMNS: (keyof ResumeVariant)[] = [
  'id',
  'display_name',
  'file_hint',
  'active',
  'created_at',
];
