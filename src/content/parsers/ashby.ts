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

export const ashbyParser: Parser = {
  platform: 'ashby',
  matches(_url, host) {
    return /ashbyhq\.com$/i.test(host);
  },
  parse(doc, url): ParsedJob {
    const job = emptyJob('ashby', url, canonicalizeUrl(url));
    const ld = extractJobPostingLD(doc);

    if (ld) {
      if (ld.title) {
        job.role = ld.title;
        job.seniority = inferSeniority(ld.title);
        job.confidence.role = 1.0;
      }
      const company = formatCompanyLD(ld);
      if (company) {
        job.company = company;
        job.confidence.company = 1.0;
      }
      const loc = formatLocationLD(ld);
      if (loc) {
        job.location = loc;
        job.confidence.location = 1.0;
      }
      const desc = formatDescriptionLD(ld);
      if (desc) job.jd_snippet = snippet(desc, 500);

      const salV = ld.baseSalary?.value;
      if (salV) {
        job.salary_min = salV.minValue ?? salV.value ?? null;
        job.salary_max = salV.maxValue ?? salV.value ?? null;
        job.salary_currency = ld.baseSalary?.currency ?? null;
        const unit = salV.unitText?.toUpperCase();
        job.salary_period =
          unit === 'HOUR' ? 'hour' : unit === 'MONTH' ? 'month' : unit === 'YEAR' ? 'year' : null;
        job.confidence.salary = 1.0;
      }
    }

    if (!job.role) {
      const roleEl = first<HTMLElement>(doc, 'h1', '[class*="PostingTitle"]');
      const role = textOf(roleEl);
      if (role) {
        job.role = role;
        job.seniority = inferSeniority(role);
        job.confidence.role = 0.7;
      }
    }

    if (!job.company) {
      const company =
        firstText(doc, '[class*="CompanyName"]', '[data-testid="company-name"]') ||
        companyFromUrl(url);
      if (company) {
        job.company = company;
        job.confidence.company = 0.5;
      }
    }

    if (!job.location) {
      const loc = firstText(doc, '[class*="Location"]', '[data-testid="location"]');
      if (loc) {
        job.location = loc;
        job.confidence.location = 0.6;
      }
    }

    const jdEl = first<HTMLElement>(doc, '[class*="description"]', '[class*="PostingBody"]', 'main');
    const jdText = textOf(jdEl);
    if (!job.jd_snippet && jdText) job.jd_snippet = snippet(jdText, 500);

    if (job.salary_min == null && jdText) {
      const sal = extractSalary(jdText);
      if (sal.min != null || sal.max != null) {
        job.salary_min = sal.min;
        job.salary_max = sal.max;
        job.salary_currency = sal.currency;
        job.salary_period = sal.period;
        job.confidence.salary = 0.55;
      }
    }

    if (jdText) {
      const yrs = extractYears(jdText);
      job.years_min = yrs.min;
      job.years_max = yrs.max;
      if (yrs.min != null) job.confidence.years = 0.7;
    }

    job.work_mode = inferWorkMode(job.location ?? '', jdText);

    const skillRoot = jdEl ?? doc;
    job.required_skills = extractSkillsFromSection(skillRoot, REQUIRED_HEADING_PATTERNS).slice(0, 15);
    job.preferred_skills = extractSkillsFromSection(skillRoot, PREFERRED_HEADING_PATTERNS).slice(0, 15);

    return job;
  },
};
