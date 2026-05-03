import type { Seniority, WorkMode, SalaryPeriod } from '@shared/types';

export function normalizeText(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').trim();
}

export function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  return normalizeText(el.textContent);
}

export function first<T extends Element>(doc: ParentNode, ...selectors: string[]): T | null {
  for (const sel of selectors) {
    const el = doc.querySelector<T>(sel);
    if (el) return el;
  }
  return null;
}

export function firstText(doc: ParentNode, ...selectors: string[]): string {
  return textOf(first(doc, ...selectors));
}

export interface SalaryParsed {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
}

const CURRENCY_MAP: Record<string, string> = {
  $: 'USD',
  'US$': 'USD',
  USD: 'USD',
  '£': 'GBP',
  GBP: 'GBP',
  '€': 'EUR',
  EUR: 'EUR',
  '₹': 'INR',
  INR: 'INR',
  Rs: 'INR',
  '¥': 'JPY',
  JPY: 'JPY',
  CAD: 'CAD',
  'C$': 'CAD',
  AUD: 'AUD',
  'A$': 'AUD',
  CHF: 'CHF',
  SGD: 'SGD',
  'S$': 'SGD',
};

function parseAmount(s: string): number | null {
  const cleaned = s.replace(/[,\s]/g, '');
  const m = cleaned.match(/^(\d+(?:\.\d+)?)([kKmMlL])?$/);
  if (!m) return null;
  const base = parseFloat(m[1]);
  const suffix = m[2]?.toLowerCase();
  if (suffix === 'k') return Math.round(base * 1_000);
  if (suffix === 'm') return Math.round(base * 1_000_000);
  if (suffix === 'l') return Math.round(base * 100_000); // Indian lakh
  return Math.round(base);
}

export function extractSalary(text: string): SalaryParsed {
  if (!text) return { min: null, max: null, currency: null, period: null };
  const t = text.replace(/\s+/g, ' ');

  const isLPA = /\bLPA\b|lakhs? per annum|per annum.*lakh/i.test(t);
  const period: SalaryPeriod | null = /\/\s*hr|per hour|hourly/i.test(t)
    ? 'hour'
    : /\/\s*mo|per month|monthly/i.test(t)
      ? 'month'
      : /\/\s*yr|\/\s*year|per year|annually|annual|yearly|per annum|LPA/i.test(t)
        ? 'year'
        : null;

  const currencyTokens = Object.keys(CURRENCY_MAP).sort((a, b) => b.length - a.length);
  let currency: string | null = null;
  for (const tok of currencyTokens) {
    const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^A-Za-z])${escaped}([^A-Za-z]|$)`).test(t)) {
      currency = CURRENCY_MAP[tok];
      break;
    }
  }

  const rangeRe =
    /([\$£€¥₹]|US\$|C\$|A\$|S\$|USD|GBP|EUR|INR|JPY|CAD|AUD|CHF|SGD|Rs\.?)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+)([kKmMlL])?\s*(?:-|–|to|—)\s*([\$£€¥₹]|US\$|C\$|A\$|S\$|USD|GBP|EUR|INR|JPY|CAD|AUD|CHF|SGD|Rs\.?)?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+)([kKmMlL])?/;
  const singleRe =
    /([\$£€¥₹]|US\$|C\$|A\$|S\$|USD|GBP|EUR|INR|JPY|CAD|AUD|CHF|SGD|Rs\.?)\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?|\d+)([kKmMlL])?/;

  const rangeM = t.match(rangeRe);
  if (rangeM) {
    const min = parseAmount((rangeM[2] ?? '') + (rangeM[3] ?? ''));
    const max = parseAmount((rangeM[5] ?? '') + (rangeM[6] ?? ''));
    if (isLPA && min != null && max != null) {
      return { min: min * 100_000, max: max * 100_000, currency: 'INR', period: 'year' };
    }
    return { min, max, currency, period };
  }

  const singleM = t.match(singleRe);
  if (singleM) {
    const amt = parseAmount((singleM[2] ?? '') + (singleM[3] ?? ''));
    return { min: amt, max: amt, currency: currency ?? CURRENCY_MAP[singleM[1]] ?? null, period };
  }

  return { min: null, max: null, currency, period };
}

export interface YearsParsed {
  min: number | null;
  max: number | null;
}

export function extractYears(text: string): YearsParsed {
  if (!text) return { min: null, max: null };
  const t = text.replace(/\s+/g, ' ');

  const rangeRe = /(\d{1,2})\s*(?:-|–|to|—)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i;
  const rangeM = t.match(rangeRe);
  if (rangeM) {
    return { min: parseInt(rangeM[1], 10), max: parseInt(rangeM[2], 10) };
  }

  const plusRe =
    /(?:minimum|at least|min\.?|>=?)\s*(\d{1,2})\+?\s*(?:years?|yrs?)|(\d{1,2})\+\s*(?:years?|yrs?)/i;
  const plusM = t.match(plusRe);
  if (plusM) {
    const n = parseInt(plusM[1] ?? plusM[2], 10);
    return { min: n, max: null };
  }

  const singleRe = /(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s+)?(?:relevant\s+)?experience/i;
  const singleM = t.match(singleRe);
  if (singleM) {
    const n = parseInt(singleM[1], 10);
    return { min: n, max: n };
  }

  return { min: null, max: null };
}

export function inferSeniority(title: string | null | undefined): Seniority {
  if (!title) return 'unknown';
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b/.test(t)) return 'intern';
  if (/\bprincipal\b/.test(t)) return 'principal';
  if (/\bdistinguished\b|\bfellow\b/.test(t)) return 'principal';
  if (/\bstaff\b/.test(t)) return 'staff';
  if (/\bsenior\b|\bsr\.?\b|\bsnr\b/.test(t)) return 'senior';
  if (/\blead\b/.test(t)) return 'staff';
  if (/\bjunior\b|\bjr\.?\b|\bassociate\b|\bentry\b/.test(t)) return 'junior';
  if (/\b(i{1,3}|iv|v|l[1-9])\b/i.test(title)) {
    if (/\biii\b|\biv\b|\bv\b|\bl[4-9]\b/i.test(title)) return 'senior';
    if (/\bii\b|\bl3\b/i.test(title)) return 'mid';
    if (/\bi\b|\bl[12]\b/i.test(title)) return 'junior';
  }
  return 'mid';
}

export function inferWorkMode(locationText: string, jdText: string): WorkMode {
  const combined = `${locationText} ${jdText}`.toLowerCase();
  const remoteScore =
    (combined.match(/\bremote\b/g)?.length ?? 0) + (combined.match(/\bwork from home\b|\bwfh\b/g)?.length ?? 0);
  const hybridScore = combined.match(/\bhybrid\b/g)?.length ?? 0;
  const onsiteScore =
    (combined.match(/\bon[- ]?site\b/g)?.length ?? 0) + (combined.match(/\bin[- ]?office\b/g)?.length ?? 0);

  if (hybridScore > 0) return 'hybrid';
  if (remoteScore > 0 && onsiteScore === 0) return 'remote';
  if (onsiteScore > 0 && remoteScore === 0) return 'onsite';
  if (remoteScore > onsiteScore) return 'remote';
  if (onsiteScore > remoteScore) return 'onsite';
  return 'unknown';
}

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gh_src',
  'gh_jid',
  'ref',
  'refId',
  'src',
  'source',
  'trk',
  'trkCampaign',
  'lipi',
  'li_fat_id',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'lang',
  'hl',
]);

export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    const keep = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (!TRACKING_PARAMS.has(k) && !k.toLowerCase().startsWith('utm_')) {
        keep.append(k, v);
      }
    }
    u.search = keep.toString() ? `?${keep.toString()}` : '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export function extractSkillsFromSection(doc: ParentNode, headingPatterns: RegExp[]): string[] {
  const headings = Array.from(doc.querySelectorAll('h2, h3, h4, strong, b'));
  for (const h of headings) {
    const text = normalizeText(h.textContent);
    if (headingPatterns.some((r) => r.test(text))) {
      const items: string[] = [];
      let next = h.nextElementSibling;
      let count = 0;
      while (next && count < 5) {
        if (next.tagName === 'UL' || next.tagName === 'OL') {
          const lis = next.querySelectorAll('li');
          lis.forEach((li) => {
            const t = normalizeText(li.textContent);
            if (t && t.length < 200) items.push(t);
          });
          break;
        }
        if (/^H[1-6]$/.test(next.tagName)) break;
        next = next.nextElementSibling;
        count++;
      }
      if (items.length) return items;
    }
  }
  return [];
}

export const REQUIRED_HEADING_PATTERNS: RegExp[] = [
  /\brequired\b/i,
  /\brequirements\b/i,
  /\bqualifications\b/i,
  /\bmust[- ]have\b/i,
  /\bwhat you'll need\b/i,
  /\bwhat you bring\b/i,
  /\bwho you are\b/i,
  /\bbasic qualifications\b/i,
  /\bminimum (qualifications|requirements)\b/i,
];

export const PREFERRED_HEADING_PATTERNS: RegExp[] = [
  /\bpreferred\b/i,
  /\bnice[- ]to[- ]have\b/i,
  /\bnice to have\b/i,
  /\bbonus\b/i,
  /\bbonus points\b/i,
  /\bplus\b/i,
  /\bdesired\b/i,
  /\beven better if\b/i,
  /\bicing on the cake\b/i,
  /\bgreat to have\b/i,
];

export function snippet(text: string, max = 500): string {
  const norm = normalizeText(text);
  if (norm.length <= max) return norm;
  return norm.slice(0, max).replace(/\s+\S*$/, '') + '…';
}
