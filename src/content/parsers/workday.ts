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

function companyFromHost(host: string): string | null {
  const parts = host.split('.');
  if (parts.length >= 3 && /myworkdayjobs/i.test(host)) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return null;
}

export const workdayParser: Parser = {
  platform: 'workday',
  matches(_url, host) {
    return /\.myworkdayjobs\.com$/i.test(host);
  },
  parse(doc, url): ParsedJob {
    const job = emptyJob('workday', url, canonicalizeUrl(url));
    const ld = extractJobPostingLD(doc);
    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      /* ignore */
    }

    if (ld) {
      if (ld.title) {
        job.role = ld.title;
        job.seniority = inferSeniority(ld.title);
        job.confidence.role = 0.95;
      }
      const company = formatCompanyLD(ld);
      if (company) {
        job.company = company;
        job.confidence.company = 0.95;
      }
      const loc = formatLocationLD(ld);
      if (loc) {
        job.location = loc;
        job.confidence.location = 0.95;
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
        job.confidence.salary = 0.95;
      }
    }

    if (!job.role) {
      const role = firstText(doc, '[data-automation-id="jobPostingHeader"]', 'h1', 'h2');
      if (role) {
        job.role = role;
        job.seniority = inferSeniority(role);
        job.confidence.role = 0.7;
      }
    }

    if (!job.company) {
      const company = companyFromHost(host);
      if (company) {
        job.company = company;
        job.confidence.company = 0.5;
      }
    }

    if (!job.location) {
      const loc = firstText(
        doc,
        '[data-automation-id="locations"]',
        '[data-automation-id="jobPostingLocation"]',
      );
      if (loc) {
        job.location = loc;
        job.confidence.location = 0.7;
      }
    }

    const jdEl = first<HTMLElement>(
      doc,
      '[data-automation-id="jobPostingDescription"]',
      '[data-automation-id="jobDescription"]',
      'main',
    );
    const jdText = textOf(jdEl);
    if (!job.jd_snippet && jdText) job.jd_snippet = snippet(jdText, 500);

    if (job.salary_min == null && jdText) {
      const sal = extractSalary(jdText);
      if (sal.min != null || sal.max != null) {
        job.salary_min = sal.min;
        job.salary_max = sal.max;
        job.salary_currency = sal.currency;
        job.salary_period = sal.period;
        job.confidence.salary = 0.5;
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
