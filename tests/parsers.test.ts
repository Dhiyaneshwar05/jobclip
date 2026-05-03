import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Window } from 'happy-dom';
import { greenhouseParser } from '../src/content/parsers/greenhouse';
import { genericParser } from '../src/content/parsers/generic';

function parseHtml(html: string): Document {
  const window = new Window();
  const doc = window.document;
  doc.open();
  doc.write(html);
  doc.close();
  return doc as unknown as Document;
}

function docFromFixture(file: string): Document {
  const html = readFileSync(join(__dirname, 'fixtures', file), 'utf-8');
  return parseHtml(html);
}

describe('greenhouseParser', () => {
  it('parses a Greenhouse job posting from JSON-LD + DOM', () => {
    const doc = docFromFixture('greenhouse-sample.html');
    const url = 'https://boards.greenhouse.io/anthropic/jobs/123456';
    const job = greenhouseParser.parse(doc, url);

    expect(job.platform).toBe('greenhouse');
    expect(job.role).toBe('Senior AI Engineer');
    expect(job.company).toBe('Anthropic');
    expect(job.location).toBe('San Francisco, CA');
    expect(job.seniority).toBe('senior');
    expect(job.salary_min).toBe(200000);
    expect(job.salary_max).toBe(280000);
    expect(job.salary_currency).toBe('USD');
    expect(job.salary_period).toBe('year');
    expect(job.years_min).toBe(5);
    expect(job.url_canonical).toBe(url);
    expect(job.confidence.role).toBeGreaterThanOrEqual(0.9);
    expect(job.required_skills.length).toBeGreaterThan(0);
    expect(job.preferred_skills.length).toBeGreaterThan(0);
  });
});

describe('genericParser', () => {
  it('parses a page with JSON-LD JobPosting', () => {
    const doc = docFromFixture('greenhouse-sample.html');
    const job = genericParser.parse(doc, 'https://example.com/jobs/abc');
    expect(job.role).toBe('Senior AI Engineer');
    expect(job.company).toBe('Anthropic');
    expect(job.salary_min).toBe(200000);
  });

  it('falls back to document title', () => {
    const doc = parseHtml(
      '<html><head><title>Data Scientist at OpenAI</title></head><body><h1>Data Scientist</h1></body></html>',
    );
    const job = genericParser.parse(doc, 'https://example.com/job/xyz');
    expect(job.role).toContain('Data Scientist');
    expect(job.company).toContain('OpenAI');
  });
});
