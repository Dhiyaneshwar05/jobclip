import { describe, expect, it } from 'vitest';
import {
  canonicalizeUrl,
  extractSalary,
  extractYears,
  inferSeniority,
  inferWorkMode,
} from '../src/content/utils/extract';

describe('extractSalary', () => {
  it('parses USD range with k suffix', () => {
    const r = extractSalary('The salary range is $120k - $180k per year.');
    expect(r.min).toBe(120_000);
    expect(r.max).toBe(180_000);
    expect(r.currency).toBe('USD');
    expect(r.period).toBe('year');
  });

  it('parses USD range with commas', () => {
    const r = extractSalary('Compensation: $150,000 - $200,000 annually');
    expect(r.min).toBe(150_000);
    expect(r.max).toBe(200_000);
    expect(r.period).toBe('year');
  });

  it('parses INR LPA', () => {
    const r = extractSalary('CTC: 20 - 35 LPA');
    expect(r.min).toBe(2_000_000);
    expect(r.max).toBe(3_500_000);
    expect(r.currency).toBe('INR');
    expect(r.period).toBe('year');
  });

  it('parses GBP', () => {
    const r = extractSalary('£80,000 - £100,000 per year');
    expect(r.min).toBe(80_000);
    expect(r.max).toBe(100_000);
    expect(r.currency).toBe('GBP');
  });

  it('returns nulls when no salary mentioned', () => {
    const r = extractSalary('We value great engineers.');
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
  });

  it('parses hourly', () => {
    const r = extractSalary('$40/hr');
    expect(r.min).toBe(40);
    expect(r.period).toBe('hour');
  });
});

describe('extractYears', () => {
  it('parses range', () => {
    const r = extractYears('5-8 years of experience');
    expect(r.min).toBe(5);
    expect(r.max).toBe(8);
  });

  it('parses N+ years', () => {
    const r = extractYears('7+ years of experience');
    expect(r.min).toBe(7);
    expect(r.max).toBeNull();
  });

  it('parses minimum N years', () => {
    const r = extractYears('Minimum 3 years of experience in AI');
    expect(r.min).toBe(3);
    expect(r.max).toBeNull();
  });

  it('parses single year mention', () => {
    const r = extractYears('5 years of relevant experience');
    expect(r.min).toBe(5);
    expect(r.max).toBe(5);
  });

  it('returns nulls when absent', () => {
    const r = extractYears('We love great engineers');
    expect(r.min).toBeNull();
    expect(r.max).toBeNull();
  });
});

describe('inferSeniority', () => {
  it('picks up Senior', () => {
    expect(inferSeniority('Senior Software Engineer')).toBe('senior');
    expect(inferSeniority('Sr. Backend Engineer')).toBe('senior');
  });
  it('picks up Staff', () => {
    expect(inferSeniority('Staff Software Engineer')).toBe('staff');
    expect(inferSeniority('Lead Engineer')).toBe('staff');
  });
  it('picks up Principal', () => {
    expect(inferSeniority('Principal Engineer')).toBe('principal');
  });
  it('picks up Intern', () => {
    expect(inferSeniority('Software Engineering Intern')).toBe('intern');
  });
  it('picks up Junior', () => {
    expect(inferSeniority('Junior Developer')).toBe('junior');
    expect(inferSeniority('Jr. Engineer')).toBe('junior');
  });
  it('defaults to mid for plain titles', () => {
    expect(inferSeniority('Software Engineer')).toBe('mid');
  });
  it('returns unknown for empty', () => {
    expect(inferSeniority('')).toBe('unknown');
  });
});

describe('inferWorkMode', () => {
  it('detects remote', () => {
    expect(inferWorkMode('Remote - US', 'Work from anywhere')).toBe('remote');
  });
  it('detects hybrid over others', () => {
    expect(inferWorkMode('San Francisco, CA', 'We work hybrid 3 days/week')).toBe('hybrid');
  });
  it('detects onsite', () => {
    expect(inferWorkMode('New York, NY', 'This is an in-office role')).toBe('onsite');
  });
  it('returns unknown with no signals', () => {
    expect(inferWorkMode('San Francisco, CA', 'We build great products')).toBe('unknown');
  });
});

describe('canonicalizeUrl', () => {
  it('strips utm params', () => {
    const u = canonicalizeUrl('https://example.com/jobs/123?utm_source=linkedin&utm_medium=share');
    expect(u).toBe('https://example.com/jobs/123');
  });

  it('strips greenhouse gh_src', () => {
    const u = canonicalizeUrl('https://boards.greenhouse.io/foo/jobs/1?gh_src=abc&gh_jid=123');
    expect(u).toBe('https://boards.greenhouse.io/foo/jobs/1');
  });

  it('strips hash', () => {
    const u = canonicalizeUrl('https://example.com/jobs/123#section');
    expect(u).toBe('https://example.com/jobs/123');
  });

  it('keeps non-tracking query params', () => {
    const u = canonicalizeUrl('https://example.com/jobs/123?id=456&utm_source=x');
    expect(u).toBe('https://example.com/jobs/123?id=456');
  });

  it('is idempotent', () => {
    const once = canonicalizeUrl('https://example.com/a/?utm_source=x');
    const twice = canonicalizeUrl(once);
    expect(once).toBe(twice);
  });
});
