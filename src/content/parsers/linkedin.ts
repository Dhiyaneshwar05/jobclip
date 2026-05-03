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

const TOP_CARD_SELECTORS = [
  '.job-details-jobs-unified-top-card__container--two-pane',
  '.jobs-search__job-details--container',
  '.jobs-details__main-content',
  '.job-view-layout',
  '.jobs-unified-top-card',
];

function findJobTopCard(doc: Document): HTMLElement | null {
  for (const sel of TOP_CARD_SELECTORS) {
    const el = doc.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

const COMPANY_SELECTORS = [
  '.job-details-jobs-unified-top-card__company-name a',
  '.job-details-jobs-unified-top-card__company-name',
  '.jobs-unified-top-card__company-name a',
  '.jobs-unified-top-card__company-name',
  '.topcard__org-name-link',
  '.topcard__flavor--metadata a',
  'a[data-test-app-aware-link][href*="/company/"]',
  'a[href*="/company/"]',
];

function findLinkedInCompany(scope: ParentNode): string | null {
  for (const sel of COMPANY_SELECTORS) {
    const el = scope.querySelector<HTMLElement>(sel);
    const text = el?.textContent?.trim();
    if (text && text.length > 0 && text.length < 120 && !/^follow$|^see all$/i.test(text)) {
      return text.replace(/\s+/g, ' ');
    }
  }
  return null;
}

function findLinkedInLocation(scope: ParentNode): string | null {
  const domSelectors = [
    '.job-details-jobs-unified-top-card__primary-description-container',
    '.job-details-jobs-unified-top-card__tertiary-description-container',
    '.jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__workplace-type',
    '.topcard__flavor--bullet',
  ];
  for (const sel of domSelectors) {
    const el = scope.querySelector<HTMLElement>(sel);
    const raw = el?.textContent?.replace(/\s+/g, ' ').trim();
    if (!raw) continue;
    const parts = raw.split('·').map((p) => p.trim()).filter(Boolean);
    const locationPart = parts.find((p) =>
      /,|remote|hybrid|on[- ]site|india|united states|canada|uk|germany/i.test(p),
    );
    if (locationPart) return locationPart;
    if (parts[0] && parts[0].length < 120) return parts[0];
    if (raw.length < 120) return raw;
  }
  return null;
}

function linkedinCanonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith('linkedin.com')) {
      const collectionJobId =
        u.searchParams.get('currentJobId') ?? u.searchParams.get('jobId');
      if (collectionJobId && /^\d+$/.test(collectionJobId)) {
        return `https://www.linkedin.com/jobs/view/${collectionJobId}`;
      }
      const viewMatch = u.pathname.match(/\/jobs\/view\/(\d+)/);
      if (viewMatch) {
        return `https://www.linkedin.com/jobs/view/${viewMatch[1]}`;
      }
    }
  } catch {
    /* fall through */
  }
  return canonicalizeUrl(raw);
}

function isJobSelected(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/jobs/view/')) return true;
    const jobId = u.searchParams.get('currentJobId') ?? u.searchParams.get('jobId');
    return !!jobId && /^\d+$/.test(jobId);
  } catch {
    return false;
  }
}

export const linkedinParser: Parser = {
  platform: 'linkedin',
  matches(url, host) {
    return /(^|\.)linkedin\.com$/i.test(host) && /\/jobs\/(view|collections|search)/.test(url);
  },
  parse(doc, url): ParsedJob {
    const job = emptyJob('linkedin', url, linkedinCanonicalUrl(url));

    if (!isJobSelected(url)) {
      job.role = null;
      job.company = null;
      job.jd_snippet = 'No specific job selected — click a job card on LinkedIn, then capture.';
      return job;
    }

    const topCard = findJobTopCard(doc);
    const scope: ParentNode = topCard ?? doc;

    const roleEl = first<HTMLElement>(
      scope,
      'h1.jobs-unified-top-card__job-title',
      'h1.job-details-jobs-unified-top-card__job-title',
      '.job-details-jobs-unified-top-card__job-title',
      '.top-card-layout__title',
      'h1.topcard__title',
    );
    const role = textOf(roleEl);
    if (role) {
      job.role = role;
      job.seniority = inferSeniority(role);
      job.confidence.role = 0.9;
    }

    const company = findLinkedInCompany(scope);
    if (company) {
      job.company = company;
      job.confidence.company = 0.85;
    }

    const location = findLinkedInLocation(scope);
    if (location) {
      job.location = location;
      job.confidence.location = 0.8;
    }

    const jdEl = first<HTMLElement>(doc, '#job-details', '.description__text', '.jobs-description-content__text');
    const jdText = textOf(jdEl);
    if (jdText) {
      job.jd_snippet = snippet(jdText, 500);
    }

    const salaryText = firstText(
      doc,
      '.jobs-unified-top-card__job-insight--highlight',
      '.compensation__salary-range',
      '.salary',
    );
    const searchSalary = salaryText || jdText;
    if (searchSalary) {
      const sal = extractSalary(searchSalary);
      if (sal.min != null || sal.max != null) {
        job.salary_min = sal.min;
        job.salary_max = sal.max;
        job.salary_currency = sal.currency;
        job.salary_period = sal.period;
        job.confidence.salary = salaryText ? 0.85 : 0.5;
      }
    }

    if (jdText) {
      const yrs = extractYears(jdText);
      job.years_min = yrs.min;
      job.years_max = yrs.max;
      if (yrs.min != null) job.confidence.years = 0.7;
    }

    const fitLevelText = firstText(doc, '.job-details-fit-level-preferences');
    job.work_mode = inferWorkMode(`${location ?? ''} ${fitLevelText}`, jdText);

    if (jdEl) {
      job.required_skills = extractSkillsFromSection(jdEl, REQUIRED_HEADING_PATTERNS).slice(0, 10);
      job.preferred_skills = extractSkillsFromSection(jdEl, PREFERRED_HEADING_PATTERNS).slice(0, 10);
    }

    return job;
  },
};
