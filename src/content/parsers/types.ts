import type { ParsedJob, Platform } from '@shared/types';

export interface Parser {
  platform: Platform;
  matches(url: string, host: string): boolean;
  parse(doc: Document, url: string): ParsedJob;
}

export function emptyConfidence() {
  return { company: 0, role: 0, location: 0, salary: 0, years: 0 };
}

export function emptyJob(platform: Platform, url: string, urlCanonical: string): ParsedJob {
  return {
    platform,
    url,
    url_canonical: urlCanonical,
    company: null,
    role: null,
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
    confidence: emptyConfidence(),
  };
}
