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
  normalizeText,
  PREFERRED_HEADING_PATTERNS,
  REQUIRED_HEADING_PATTERNS,
  snippet,
  textOf,
} from '../utils/extract';
import { extractJobPostingLD, formatCompanyLD, formatDescriptionLD, formatLocationLD } from '../utils/jsonld';

function parseTitle(raw: string): { role: string | null; company: string | null } {
  const title = normalizeText(raw);
  if (!title) return { role: null, company: null };
  const separators = [' at ', ' @ ', ' | ', ' - ', ' — ', ' – ', ' :: '];
  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx > 0 && idx < title.length - sep.length) {
      return {
        role: title.slice(0, idx).trim(),
        company: title.slice(idx + sep.length).trim(),
      };
    }
  }
  return { role: title, company: null };
}

function metaContent(doc: Document, property: string): string {
  const el = doc.querySelector<HTMLMetaElement>(`meta[property="${property}"], meta[name="${property}"]`);
  return el?.content?.trim() ?? '';
}

export const genericParser: Parser = {
  platform: 'other',
  matches() {
    return true;
  },
  parse(doc, url): ParsedJob {
    const job = emptyJob('other', url, canonicalizeUrl(url));
    const ld = extractJobPostingLD(doc);

    if (ld) {
      if (ld.title) {
        job.role = ld.title;
        job.seniority = inferSeniority(ld.title);
        job.confidence.role = 0.9;
      }
      const company = formatCompanyLD(ld);
      if (company) {
        job.company = company;
        job.confidence.company = 0.9;
      }
      const loc = formatLocationLD(ld);
      if (loc) {
        job.location = loc;
        job.confidence.location = 0.9;
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
        job.confidence.salary = 0.9;
      }
    }

    if (!job.role || !job.company) {
      const ogTitle = metaContent(doc, 'og:title');
      const ogSite = metaContent(doc, 'og:site_name');
      const docTitle = doc.title;
      const titleSource = ogTitle || docTitle;
      const parsed = parseTitle(titleSource);
      if (!job.role && parsed.role) {
        job.role = parsed.role;
        job.seniority = inferSeniority(parsed.role);
        job.confidence.role = Math.max(job.confidence.role, 0.5);
      }
      if (!job.company) {
        const company = ogSite || parsed.company;
        if (company) {
          job.company = company;
          job.confidence.company = Math.max(job.confidence.company, ogSite ? 0.55 : 0.45);
        }
      }
    }

    if (!job.role) {
      const h1 = firstText(doc, 'h1');
      if (h1) {
        job.role = h1;
        job.seniority = inferSeniority(h1);
        job.confidence.role = 0.35;
      }
    }

    if (!job.jd_snippet) {
      const metaDesc = metaContent(doc, 'description') || metaContent(doc, 'og:description');
      if (metaDesc) job.jd_snippet = snippet(metaDesc, 500);
      else {
        const main = first<HTMLElement>(doc, 'main', 'article', 'body');
        const txt = textOf(main);
        if (txt) job.jd_snippet = snippet(txt, 500);
      }
    }

    const jdText = job.jd_snippet ?? '';
    if (job.salary_min == null) {
      const sal = extractSalary(jdText);
      if (sal.min != null || sal.max != null) {
        job.salary_min = sal.min;
        job.salary_max = sal.max;
        job.salary_currency = sal.currency;
        job.salary_period = sal.period;
        job.confidence.salary = 0.4;
      }
    }

    if (jdText) {
      const yrs = extractYears(jdText);
      job.years_min = yrs.min;
      job.years_max = yrs.max;
      if (yrs.min != null) job.confidence.years = 0.5;
    }

    job.work_mode = inferWorkMode(job.location ?? '', jdText);

    const jdContainer = first<HTMLElement>(doc, 'main', 'article', 'body');
    if (jdContainer) {
      job.required_skills = extractSkillsFromSection(jdContainer, REQUIRED_HEADING_PATTERNS).slice(0, 15);
      job.preferred_skills = extractSkillsFromSection(jdContainer, PREFERRED_HEADING_PATTERNS).slice(0, 15);
    }

    return job;
  },
};
