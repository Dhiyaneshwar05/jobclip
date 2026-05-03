import type { ParsedJob } from '@shared/types';
import type { Message } from '@shared/messaging';
import type { Parser } from './parsers/types';
import { linkedinParser } from './parsers/linkedin';
import { greenhouseParser } from './parsers/greenhouse';
import { leverParser } from './parsers/lever';
import { ashbyParser } from './parsers/ashby';
import { workdayParser } from './parsers/workday';
import { genericParser } from './parsers/generic';

const SITE_PARSERS: Parser[] = [
  linkedinParser,
  greenhouseParser,
  leverParser,
  ashbyParser,
  workdayParser,
];

export function dispatch(url: string, doc: Document): ParsedJob {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  for (const p of SITE_PARSERS) {
    if (p.matches(url, host)) {
      try {
        return p.parse(doc, url);
      } catch (err) {
        console.warn(`[job-capture] ${p.platform} parser failed, falling back to generic`, err);
        break;
      }
    }
  }
  return genericParser.parse(doc, url);
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    if (msg.type === 'PARSE_ACTIVE_TAB') {
      try {
        const job = dispatch(window.location.href, document);
        sendResponse({ type: 'PARSE_RESULT', job } satisfies Message);
      } catch (err) {
        console.error('[job-capture] dispatch error', err);
        sendResponse({
          type: 'PARSE_RESULT',
          job: genericParser.parse(document, window.location.href),
        } satisfies Message);
      }
      return true;
    }
    return false;
  });
}
