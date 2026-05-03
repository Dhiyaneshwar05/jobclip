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
import { extractJobPostingLD, formatDescriptionLD } from '../utils/jsonld';

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

export const leverParser: Parser = {
  platform: 'lever',
  matches(_url, host) {
    return /(^|\.)lever\.co$/i.test(host);
  },
  parse(doc, url): ParsedJob {
    const job = emptyJob('lever', url, canonicalizeUrl(url));
    const ld = extractJobPostingLD(doc);

    const roleEl = first<HTMLElement>(doc, '.posting-headline h2', '.posting-header h2', 'h2');
    const role = textOf(roleEl) || ld?.title || '';
    if (role) {
      job.role = role;
      job.seniority = inferSeniority(role);
      job.confidence.role = 0.9;
    }

    const company = companyFromUrl(url);
    if (company) {
      job.company = company;
      job.confidence.company = 0.7;
    }

    const location = firstText(doc, '.posting-categories .location', '.sort-by-location');
    if (location) {
      job.location = location;
      job.confidence.location = 0.85;
    }

    const commitment = firstText(doc, '.posting-categories .commitment');
    const jdEl = first<HTMLElement>(doc, '.posting-content', '.content', '.section-wrapper');
    const jdText = textOf(jdEl) || (ld ? formatDescriptionLD(ld) : null) || '';
    if (jdText) {
      job.jd_snippet = snippet(jdText, 500);
    }

    const salaryHaystack = `${commitment} ${jdText}`;
    const sal = extractSalary(salaryHaystack);
    if (sal.min != null || sal.max != null) {
      job.salary_min = sal.min;
      job.salary_max = sal.max;
      job.salary_currency = sal.currency;
      job.salary_period = sal.period;
      job.confidence.salary = 0.65;
    }

    if (jdText) {
      const yrs = extractYears(jdText);
      job.years_min = yrs.min;
      job.years_max = yrs.max;
      if (yrs.min != null) job.confidence.years = 0.75;
    }

    const workplace = firstText(doc, '.posting-categories .workplaceTypes');
    job.work_mode = inferWorkMode(`${location} ${workplace}`, jdText);

    const skillRoot = jdEl ?? doc;
    job.required_skills = extractSkillsFromSection(skillRoot, REQUIRED_HEADING_PATTERNS).slice(0, 15);
    job.preferred_skills = extractSkillsFromSection(skillRoot, PREFERRED_HEADING_PATTERNS).slice(0, 15);

    return job;
  },
};
