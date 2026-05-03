export interface JobPostingLD {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  datePosted?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?:
    | { address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }
    | Array<{ address?: { addressLocality?: string; addressRegion?: string; addressCountry?: string } }>;
  baseSalary?: {
    currency?: string;
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string };
  };
  employmentType?: string;
  experienceRequirements?: string | { monthsOfExperience?: number };
  applicantLocationRequirements?: unknown;
  jobLocationType?: string;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function typeMatches(obj: { '@type'?: string | string[] }, target: string): boolean {
  const t = asArray(obj['@type']);
  return t.some((x) => typeof x === 'string' && x.toLowerCase() === target.toLowerCase());
}

export function extractJobPostingLD(doc: Document): JobPostingLD | null {
  const scripts = doc.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');
  for (const s of scripts) {
    const raw = s.textContent?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const nodes: unknown[] = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && '@graph' in parsed
          ? ((parsed as { '@graph': unknown[] })['@graph'] ?? [])
          : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const obj = node as JobPostingLD & { '@type'?: string | string[] };
        if (typeMatches(obj, 'JobPosting')) {
          return obj;
        }
      }
    } catch {
      /* skip malformed */
    }
  }
  return null;
}

export function formatLocationLD(ld: JobPostingLD): string | null {
  const locs = asArray(ld.jobLocation);
  if (!locs.length) return null;
  const parts: string[] = [];
  for (const loc of locs) {
    if (!loc || typeof loc !== 'object') continue;
    const addr = loc.address;
    if (!addr) continue;
    const bits = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
    if (bits.length) parts.push(bits.join(', '));
  }
  return parts.length ? parts.join(' / ') : null;
}

export function formatCompanyLD(ld: JobPostingLD): string | null {
  const org = ld.hiringOrganization;
  if (!org) return null;
  if (typeof org === 'string') return org;
  return org.name ?? null;
}

export function formatDescriptionLD(ld: JobPostingLD): string | null {
  if (!ld.description) return null;
  const stripped = ld.description
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || null;
}
