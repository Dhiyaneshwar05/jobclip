import type { ParsedJob } from '@shared/types';
import type { Parser } from './types';
import { emptyJob } from './types';
import {
  canonicalizeUrl,
  extractSalary,
  extractSkillsFromSection,
  extractYears,
  first,
  firstText,
  inferSeniority,
  inferWorkMode,
  PREFERRED_HEADING_PATTERNS,
  REQUIRED_HEADING_PATTERNS,
  snippet,
  textOf,
} from '../utils/extract';
import { extractJobPostingLD, formatCompanyLD, formatDescriptionLD, formatLocationLD } from '../utils/jsonld';

function companyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 1) {
      return parts[0]
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const greenhouseParser: Parser = {
  platform: 'greenhouse',
  matches(_url, host) {
    return /(^|\.)greenhouse\.io$/i.test(host);
  },
  parse(doc, url): ParsedJob {
    const job = emptyJob('greenhouse', url, canonicalizeUrl(url));
    const ld = extractJobPostingLD(doc);

    const roleEl = first<HTMLElement>(doc, '.app-title', 'h1.section-header--large', 'h1');
    const role = textOf(roleEl) || ld?.title || '';
    if (role) {
      job.role = role;
      job.seniority = inferSeniority(role);
      job.confidence.role = 0.95;
    }

    const companyLD = ld ? formatCompanyLD(ld) : null;
    const companyDom = firstText(doc, '.company-name', '.employer-info .name');
    const company = companyDom || companyLD || companyFromUrl(url);
    if (company) {
      job.company = company;
      job.confidence.company = companyDom ? 0.95 : companyLD ? 0.9 : 0.6;
    }

    const locationLD = ld ? formatLocationLD(ld) : null;
    const locationDom = firstText(doc, '.location', '.job-location');
    const location = locationDom || locationLD;
    if (location) {
      job.location = location;
      job.confidence.location = 0.9;
    }

    const jdEl = first<HTMLElement>(doc, '#content', '.job-post', '.job-description');
    const jdText = textOf(jdEl) || (ld ? formatDescriptionLD(ld) : null) || '';
    if (jdText) {
      job.jd_snippet = snippet(jdText, 500);
    }

    const salaryFromLD = ld?.baseSalary?.value;
    if (salaryFromLD) {
      job.salary_min = salaryFromLD.minValue ?? salaryFromLD.value ?? null;
      job.salary_max = salaryFromLD.maxValue ?? salaryFromLD.value ?? null;
      job.salary_currency = ld?.baseSalary?.currency ?? null;
      const unit = salaryFromLD.unitText?.toUpperCase();
      job.salary_period =
        unit === 'HOUR' ? 'hour' : unit === 'MONTH' ? 'month' : unit === 'YEAR' ? 'year' : null;
      job.confidence.salary = 0.95;
    } else if (jdText) {
      const sal = extractSalary(jdText);
      if (sal.min != null || sal.max != null) {
        job.salary_min = sal.min;
        job.salary_max = sal.max;
        job.salary_currency = sal.currency;
        job.salary_period = sal.period;
        job.confidence.salary = 0.6;
      }
    }

    if (jdText) {
      const yrs = extractYears(jdText);
      job.years_min = yrs.min;
      job.years_max = yrs.max;
      if (yrs.min != null) job.confidence.years = 0.8;
    }

    job.work_mode = inferWorkMode(location ?? '', jdText);

    const skillRoot = jdEl ?? doc;
    job.required_skills = extractSkillsFromSection(skillRoot, REQUIRED_HEADING_PATTERNS).slice(0, 15);
    job.preferred_skills = extractSkillsFromSection(skillRoot, PREFERRED_HEADING_PATTERNS).slice(0, 15);

    return job;
  },
};
