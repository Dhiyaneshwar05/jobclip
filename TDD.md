# Job Capture Extension — Technical Design Document

**Author:** Dhiyanesh G
**Date:** 2026-04-30
**Status:** Draft — awaiting approval
**Target:** Chromium-based browsers (Chrome, Arc, Edge, Brave)

---

## 1. Purpose & Scope

A personal Chrome extension that captures job applications from the browser in one click, writes structured rows to a Google Sheet, and shows a dashboard for pattern analysis over time.

**In scope for V1:**
- Right-click / toolbar icon capture on the current tab
- Deterministic parsers for LinkedIn, Greenhouse, Lever, Ashby, Workday
- Generic fallback parser (JSON-LD + meta tags) for unknown sites
- Google Sheets as the data store
- Resume variant picker (user-registered list)
- Local dashboard page with 4-5 charts

**Explicitly out of scope (deferred):**
- AI-based extraction (you said no for now)
- Email parsing for status updates
- Auto status transitions
- Multi-device sync beyond what Sheets provides
- Safari / Firefox ports
- Follow-up reminder notifications

---

## 2. User Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. User on a job page (LinkedIn / Greenhouse / etc.)       │
│     ↓                                                        │
│  2. User clicks extension icon OR right-click → "Capture"   │
│     ↓                                                        │
│  3. Content script runs site-specific parser                │
│     ↓                                                        │
│  4. Popup opens with pre-filled fields (editable):          │
│       • Company, Role, Location, URL                        │
│       • Seniority, Years of Exp (min/max)                   │
│       • Work Mode (remote/hybrid/onsite)                    │
│       • Salary range (if found)                             │
│       • JD snippet (first 500 chars)                        │
│     ↓                                                        │
│  5. User picks resume variant + status (dropdown)           │
│     User adds optional notes                                 │
│     ↓                                                        │
│  6. Click "Save" → Background worker appends row to Sheet   │
│     ↓                                                        │
│  7. Toast: "Captured ✓ — 47 applications so far"            │
└─────────────────────────────────────────────────────────────┘
```

### Secondary flows

- **Update status of existing entry**: right-click on a stored URL → "Update status" → popup with current entry → change status → Save
- **Dashboard**: toolbar icon → "Open dashboard" menu item → opens extension page in new tab with charts
- **Settings**: toolbar icon → "Settings" → options page for resume registry, Sheet ID, Google auth

---

## 3. Architecture

### 3.1 Components

```
┌────────────────────────────────────────────────────────────────┐
│                    Chrome Extension (MV3)                       │
│                                                                 │
│  ┌─────────────────┐   ┌──────────────────┐   ┌─────────────┐ │
│  │ Content Scripts │   │  Service Worker  │   │   Popup     │ │
│  │                 │   │  (background.ts) │   │ (React+Vite)│ │
│  │ - linkedin.ts   │◄─►│                  │◄─►│             │ │
│  │ - greenhouse.ts │   │ - OAuth mgmt     │   │ - Fields UI │ │
│  │ - lever.ts      │   │ - Sheets API     │   │ - Resume pick│ │
│  │ - ashby.ts      │   │ - Context menu   │   │ - Status    │ │
│  │ - workday.ts    │   │ - Msg routing    │   │             │ │
│  │ - generic.ts    │   │                  │   │             │ │
│  └─────────────────┘   └──────────────────┘   └─────────────┘ │
│           ▲                      ▲                     ▲       │
│           │                      │                     │       │
│           └──────── chrome.runtime messages ───────────┘       │
│                                  │                             │
│  ┌────────────────────┐   ┌─────┴──────────┐                  │
│  │   Options Page     │   │   Dashboard    │                  │
│  │   (React+Vite)     │   │  (React+Vite)  │                  │
│  │                    │   │                │                  │
│  │ - Resume registry  │   │ - Recharts     │                  │
│  │ - Google auth      │   │ - Filters      │                  │
│  │ - Sheet ID config  │   │ - Export CSV   │                  │
│  └────────────────────┘   └────────────────┘                  │
└────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                ┌─────────────────────────────────┐
                │      Google Sheets API v4       │
                │    (OAuth2 via chrome.identity) │
                └─────────────────────────────────┘
                                  │
                                  ▼
                ┌─────────────────────────────────┐
                │   User's Google Sheet           │
                │   ┌─ applications (main tab)    │
                │   ├─ resumes (registry backup)  │
                │   └─ meta (schema version etc)  │
                └─────────────────────────────────┘
```

### 3.2 Tech stack

| Layer | Choice | Why |
|---|---|---|
| Extension format | Manifest V3 | Chrome requires it; future-proof |
| Language | TypeScript | Type safety on parser contracts matters here |
| Build | Vite + `@crxjs/vite-plugin` | Fast HMR, handles MV3 quirks |
| UI framework | React 18 + Tailwind | Fast to iterate popup/dashboard |
| Charts | Recharts | Declarative, small, enough for our needs |
| Storage (local) | `chrome.storage.local` | Resume registry, cached last-capture, settings |
| Storage (cloud) | Google Sheets API v4 | User requested Sheets |
| Auth | `chrome.identity.getAuthToken` | Native Chrome OAuth, zero-config for Arc/Chrome |
| Parsers | Hand-written DOM selectors + JSON-LD | Deterministic as requested |
| Testing | Vitest + happy-dom | Unit test parsers against saved HTML fixtures |

### 3.3 Directory layout

```
job-capture/
├── TDD.md                          (this doc)
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── manifest.config.ts              (typed MV3 manifest)
├── tailwind.config.ts
├── .gitignore
├── src/
│   ├── background/
│   │   └── index.ts                (service worker entry)
│   ├── content/
│   │   ├── index.ts                (dispatcher — picks right parser)
│   │   ├── parsers/
│   │   │   ├── types.ts            (ParsedJob interface)
│   │   │   ├── linkedin.ts
│   │   │   ├── greenhouse.ts
│   │   │   ├── lever.ts
│   │   │   ├── ashby.ts
│   │   │   ├── workday.ts
│   │   │   └── generic.ts          (JSON-LD + OpenGraph fallback)
│   │   └── utils/
│   │       ├── extract.ts          (helpers: text, regex for salary/years)
│   │       └── jsonld.ts           (JSON-LD JobPosting extractor)
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── components/
│   │       ├── CaptureForm.tsx
│   │       ├── ResumePicker.tsx
│   │       └── StatusPicker.tsx
│   ├── options/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx                 (settings, resume registry)
│   ├── dashboard/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── charts/
│   │       ├── ApplicationsOverTime.tsx
│   │       ├── StatusFunnel.tsx
│   │       ├── ResumePerformance.tsx
│   │       ├── PlatformBreakdown.tsx
│   │       └── TopCompanies.tsx
│   ├── lib/
│   │   ├── sheets.ts               (Google Sheets API wrapper)
│   │   ├── auth.ts                 (OAuth token mgmt)
│   │   ├── storage.ts              (chrome.storage wrapper)
│   │   ├── schema.ts               (row schema, Zod validators)
│   │   └── messaging.ts            (typed message passing)
│   └── shared/
│       └── types.ts                (cross-cutting types)
├── public/
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
└── tests/
    ├── fixtures/
    │   ├── linkedin-swe.html
    │   ├── greenhouse-anthropic.html
    │   ├── lever-sample.html
    │   ├── ashby-sample.html
    │   └── workday-sample.html
    └── parsers/
        ├── linkedin.test.ts
        ├── greenhouse.test.ts
        ├── lever.test.ts
        ├── ashby.test.ts
        └── workday.test.ts
```

---

## 4. Data Schema

### 4.1 Google Sheet — `applications` tab

| Column | Type | Example | Notes |
|---|---|---|---|
| `id` | string | `app_20260430_a1b2c3` | Deterministic from URL hash — dedup key |
| `captured_at` | ISO datetime | `2026-04-30T14:22:13+05:30` | When user clicked capture |
| `applied_at` | ISO date | `2026-04-30` | User-editable; defaults to capture date |
| `url` | string | `https://...` | Original job URL |
| `url_canonical` | string | `https://...` | Normalized (strip tracking params) |
| `platform` | enum | `linkedin` | `linkedin\|greenhouse\|lever\|ashby\|workday\|other` |
| `company` | string | `Anthropic` | |
| `role` | string | `AI Engineer` | |
| `location` | string | `San Francisco, CA` | Raw as displayed |
| `work_mode` | enum | `remote` | `remote\|hybrid\|onsite\|unknown` |
| `seniority` | enum | `senior` | `intern\|junior\|mid\|senior\|staff\|principal\|unknown` — inferred from title regex |
| `years_min` | int\|null | `5` | Parsed from JD if found |
| `years_max` | int\|null | `8` | |
| `salary_min` | int\|null | `180000` | Normalized to USD if `salary_currency` is USD; else raw |
| `salary_max` | int\|null | `240000` | |
| `salary_currency` | string\|null | `USD` | |
| `salary_period` | enum\|null | `year` | `year\|month\|hour` |
| `jd_snippet` | string | first ~500 chars | Trimmed JD for later analysis |
| `required_skills` | string | `Python, PyTorch, LLM` | Comma-sep; parsed from bullet lists |
| `preferred_skills` | string | `Rust, Kubernetes` | From "nice to have" / "preferred" sections |
| `resume_used` | string | `resume-v3-ai-heavy` | From user's registered resumes |
| `status` | enum | `applied` | `saved\|applied\|screening\|interviewing\|offer\|rejected\|withdrawn\|ghosted` |
| `status_updated_at` | ISO datetime | | Auto-updated on status change |
| `notes` | string | `referred by X` | User free-text |
| `source` | string | `toolbar` | `toolbar\|context-menu\|manual` |
| `schema_version` | int | `1` | Bump when we change columns |

### 4.2 `resumes` tab (mirror of `chrome.storage.local`)

| Column | Type | Example |
|---|---|---|
| `id` | string | `resume-v3-ai-heavy` |
| `display_name` | string | `AI-heavy v3 (Apr 2026)` |
| `file_hint` | string | `DhiyaneshG_AI_v3.pdf` (optional — for your records) |
| `active` | bool | `true` |
| `created_at` | ISO date | `2026-04-15` |

### 4.3 `meta` tab

Single-row config:
| `schema_version` | `last_reconciled_at` | `app_version` |

### 4.4 Dedup logic

- `id = sha256(url_canonical).slice(0, 12)` prefixed with `app_<YYYYMMDD>_`
- On capture, extension reads last 500 rows, checks if `url_canonical` exists
  - If yes: show "Already captured on <date> — update status?" instead of new row
  - If no: append

---

## 5. Parsers

### 5.1 Parser contract

```typescript
// src/content/parsers/types.ts
export interface ParsedJob {
  platform: Platform;
  url: string;
  url_canonical: string;
  company: string | null;
  role: string | null;
  location: string | null;
  work_mode: WorkMode;
  seniority: Seniority;
  years_min: number | null;
  years_max: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: SalaryPeriod | null;
  jd_snippet: string | null;
  required_skills: string[];
  preferred_skills: string[];
  confidence: {
    // 0-1 per field — lets popup highlight low-confidence fields
    company: number;
    role: number;
    location: number;
    salary: number;
    years: number;
  };
}

export interface Parser {
  platform: Platform;
  matches(url: string): boolean;
  parse(doc: Document, url: string): ParsedJob;
}
```

### 5.2 Parser strategy per platform

**LinkedIn** (`linkedin.ts`)
- URL match: `linkedin.com/jobs/view/` or `linkedin.com/jobs/collections/`
- Role: `.top-card-layout__title` or `h1.jobs-unified-top-card__job-title`
- Company: `.topcard__org-name-link` or `.jobs-unified-top-card__company-name a`
- Location: `.topcard__flavor--bullet` or `.jobs-unified-top-card__bullet`
- JD: `.description__text` or `#job-details`
- Work mode: regex on location text and JD (`Remote`, `Hybrid`, `On-site`)
- Caveat: LinkedIn uses heavy JS; parser waits for `document.readyState === 'complete'` + 300ms debounce. If selectors fail, falls back to `generic.ts`.

**Greenhouse** (`greenhouse.ts`)
- URL match: `boards.greenhouse.io/*` or `job-boards.greenhouse.io/*`
- Has clean semantic HTML:
  - Role: `.app-title` or `h1.section-header--large`
  - Company: `.company-name` or from URL path `/<company>/jobs/...`
  - Location: `.location`
  - JD: `#content`
- Very reliable; 95%+ confidence expected

**Lever** (`lever.ts`)
- URL match: `jobs.lever.co/*`
- Role: `.posting-headline h2`
- Company: from URL `jobs.lever.co/<company>`
- Location: `.posting-categories .location`
- Commitment: `.posting-categories .commitment` (full-time/contract)
- JD: `.posting-content`

**Ashby** (`ashby.ts`)
- URL match: `jobs.ashbyhq.com/*` or `ashbyhq.com/jobs/*`
- Mostly React-rendered; reliable JSON-LD JobPosting embedded in `<script type="application/ld+json">` → prefer that path
- DOM fallback: `h1` for role, logo alt text for company, specific data-testid attrs

**Workday** (`workday.ts`) — hardest
- URL match: `*.myworkdayjobs.com/*` or `*.wd1.myworkdayjobs.com/*`
- React SPA, much heavier DOM. Approach:
  1. Try JSON-LD first (Workday does embed it on most tenants)
  2. Fallback: `[data-automation-id="jobPostingHeader"]` (role), `[data-automation-id="locations"]`, etc.
- Confidence will be lower here; popup will flag fields for user review

**Generic** (`generic.ts`) — the "IDR approach" you mentioned
- Runs when no other parser matches
- Strategy (in order):
  1. **JSON-LD JobPosting** — look for `<script type="application/ld+json">` with `@type: JobPosting`. Extracts `title`, `hiringOrganization.name`, `jobLocation`, `baseSalary`, `description`, `experienceRequirements`. This alone covers ~40% of ATSs.
  2. **OpenGraph + Twitter cards** — `og:title`, `og:site_name`
  3. **Heuristic DOM scan** — first `h1` for role, scan for `<title>` patterns like `"Role at Company"` or `"Role | Company"`
  4. **Meta description** for JD snippet
- All fields get low confidence by default → user reviews in popup

### 5.3 Shared utilities (`extract.ts`)

- `extractSalary(text)` — regex matches for `$120k-$180k`, `$120,000 - $180,000`, `USD 120,000-180,000/year`, `₹20 LPA - ₹35 LPA`, `£80,000`. Returns `{min, max, currency, period}`.
- `extractYears(text)` — matches `5+ years`, `3-5 years`, `minimum 7 years of experience`. Returns `{min, max}`.
- `inferSeniority(title)` — regex on title: `Intern` → intern, `Senior|Sr\.` → senior, `Staff` → staff, `Principal` → principal, `Lead` → staff (debatable but practical), `Junior|Jr\.|I$|L2` → junior, else `mid`.
- `inferWorkMode(locationText, jdText)` — keyword scan
- `canonicalizeUrl(url)` — strip `utm_*`, `gh_src`, `ref`, `lang`, etc. Keep path + essential query params.

### 5.4 Adding a new parser ("IDR approach")

When user hits a site that falls to generic and produces bad results:

1. Save the page HTML to `tests/fixtures/<platform>-<slug>.html`
2. Write selectors in `tests/parsers/<platform>.test.ts` (red)
3. Implement `src/content/parsers/<platform>.ts` (green)
4. Register in `src/content/index.ts` dispatcher
5. Add URL pattern to `manifest.config.ts` `content_scripts.matches`

Documented in `README.md` as "Adding a platform".

---

## 6. Google Sheets Integration

### 6.1 Auth

- Uses `chrome.identity.getAuthToken({ interactive: true })` — user signs in once with their Google account
- Scopes: `https://www.googleapis.com/auth/spreadsheets` (read+write to sheets user has access to) and `https://www.googleapis.com/auth/drive.file` (create new sheet if user clicks "Create tracker")
- OAuth client ID is registered in `manifest.json`. Requires a Google Cloud Console project (one-time setup by you, documented in README).
- Token is cached by Chrome; refresh happens silently

### 6.2 First-run UX

On install → options page opens:

1. "Sign in with Google" → OAuth flow
2. Two options:
   - **Create a new tracker sheet** → calls Drive API to create `Job Applications Tracker - <date>`, bootstraps three tabs with headers
   - **Use an existing sheet** → user pastes Sheet URL or ID; extension validates and (if needed) appends missing headers non-destructively
3. "Register your resume variants" → add 1-N entries (name + optional filename hint)
4. Done → extension icon becomes active

### 6.3 Write path

- Service worker holds auth token
- On capture save: `POST /v4/spreadsheets/{id}/values/applications!A:Z:append` with `valueInputOption=USER_ENTERED`
- Errors: retry once on 401 (refresh token), show toast on permanent failure, queue to `chrome.storage.local` `pending_captures` for retry

### 6.4 Read path (dashboard)

- `GET /v4/spreadsheets/{id}/values/applications!A:Z`
- Cache response in `chrome.storage.local` for 60s to reduce quota burn
- Quota: 300 reads/min per user — we're nowhere near that

---

## 7. UI Designs

### 7.1 Popup (400×550 px)

```
┌──────────────────────────────────────────┐
│  Capture Job                       [×]   │
├──────────────────────────────────────────┤
│  Platform: LinkedIn  ✓ Parsed            │
│                                          │
│  Company *                               │
│  ┌────────────────────────────────────┐  │
│  │ Anthropic                          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Role *                                  │
│  ┌────────────────────────────────────┐  │
│  │ Senior AI Engineer                 │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Location          Work Mode             │
│  ┌──────────────┐  ┌──────────────┐      │
│  │ SF, CA       │  │ Hybrid    ▾  │      │
│  └──────────────┘  └──────────────┘      │
│                                          │
│  Years Exp        Seniority              │
│  ┌──────────────┐  ┌──────────────┐      │
│  │ 5 - 8        │  │ Senior    ▾  │      │
│  └──────────────┘  └──────────────┘      │
│                                          │
│  Salary (optional)                       │
│  ┌────────────────────────────────────┐  │
│  │ $180k - $240k USD/yr               │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Resume used *                           │
│  ┌────────────────────────────────────┐  │
│  │ AI-heavy v3 (Apr 2026)           ▾ │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Status                                  │
│  ┌────────────────────────────────────┐  │
│  │ Applied                           ▾│  │
│  └────────────────────────────────────┘  │
│                                          │
│  Notes                                   │
│  ┌────────────────────────────────────┐  │
│  │ Referred by Ananya                 │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ⚠ Already captured on Apr 12 — update?  │  (dedup warning if applicable)
│                                          │
│        [ Cancel ]      [ Save ]          │
└──────────────────────────────────────────┘
```

Low-confidence fields (<0.6) get a subtle yellow border; user knows to double-check.

### 7.2 Options page

- Google account status (signed in as X, [Disconnect])
- Sheet: `📄 Job Applications Tracker - 2026-04-30` [Change] [Open]
- Resume registry — table with add/edit/delete/set-active
- Default status (saved/applied)
- Default resume — convenience pre-pick for popup
- Export — "Download CSV of last sync"

### 7.3 Dashboard

Single page with 5 tiles:

1. **Applications over time** (line chart, weekly bins, last 12 weeks)
2. **Status funnel** (applied → screening → interviewing → offer, bar chart with counts + conversion %)
3. **Resume performance** (stacked bar: per resume, response rate)
4. **Platform breakdown** (pie: LinkedIn vs Greenhouse vs Lever vs Workday vs other)
5. **Top 10 companies** (horizontal bar — useful to spot mass-apply patterns)

Plus a filterable table below with all rows, sortable, with status-update action per row.

Filters (top bar): date range, status, platform, resume.

---

## 8. Permissions (manifest)

```json
{
  "permissions": [
    "storage",
    "contextMenus",
    "identity",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://*.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://*.ashbyhq.com/*",
    "https://*.myworkdayjobs.com/*",
    "https://sheets.googleapis.com/*",
    "https://www.googleapis.com/*"
  ],
  "oauth2": {
    "client_id": "<GOOGLE_CLIENT_ID>.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file"
    ]
  }
}
```

For the generic parser on unknown sites: we inject the content script on-demand via `chrome.scripting.executeScript` when the user clicks the toolbar icon, using `activeTab` permission — no blanket host permission needed.

---

## 9. Privacy & Security

- All data lives in user's own Google account and local `chrome.storage` — nothing hits my servers (there are no servers)
- OAuth client ID is per-install; user creates their own in Google Cloud Console (documented setup)
- No analytics, no telemetry
- JD snippet capped at 500 chars — enough for analysis, small enough to not be a copyright concern
- README calls out: "don't publish this extension publicly; it's a personal tool"

---

## 10. Testing Strategy

- **Unit tests** for each parser against saved HTML fixtures (`tests/fixtures/*.html`) — one happy case and 1-2 edge cases per platform
- **Unit tests** for `extractSalary`, `extractYears`, `canonicalizeUrl`, `inferSeniority` — these are pure regex logic, critical to get right
- **Manual E2E** (can't practically automate without Puppeteer and real accounts): checklist in `tests/E2E_CHECKLIST.md` of 10 scenarios (capture on LinkedIn, dedup, update status, etc.) to run before each release
- Target: parsers pass with ≥0.8 average confidence on fixture set

---

## 11. Build & Install

**Dev workflow:**
```bash
pnpm install
pnpm dev        # Vite watches + rebuilds to dist/
```
Then in Arc/Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `dist/`.

**Prod build:**
```bash
pnpm build
pnpm zip        # creates job-capture-v0.1.0.zip for personal install / sideload
```

No Chrome Web Store publishing planned (personal use).

---

## 12. Phased Delivery Plan

### Phase 0 — Scaffold (30 min)
- Vite + CRX plugin + React + Tailwind + TS
- Empty popup, options, background shells
- Manifest with icons, stubbed OAuth client ID
- Load in Arc, confirm it shows up

**Checkpoint:** Extension loads, icon visible.

### Phase 1 — Sheets integration + manual capture (1-2 evenings)
- Google OAuth wiring
- Options page: sign-in, sheet creation/picker, resume registry
- Popup: manual-entry form (no parser yet, just URL auto-filled)
- Save to Sheet, dedup check, toast
- E2E: can capture a row manually on any page

**Checkpoint:** You can actually start tracking TODAY with this.

### Phase 2 — Deterministic parsers (2 evenings)
- Parser dispatcher + contract
- LinkedIn, Greenhouse, Lever, Ashby parsers
- Workday parser (best-effort, JSON-LD-first)
- Generic fallback (JSON-LD + OG + heuristic)
- Shared extractors: salary, years, seniority, work mode, canonical URL
- Test fixtures + Vitest suite

**Checkpoint:** Popup opens pre-filled on known sites.

### Phase 3 — Dashboard (1-2 evenings)
- Dashboard page, extension-internal
- 5 charts (Recharts)
- Filter bar, table, status-update action
- CSV export

**Checkpoint:** You can see patterns in your application history.

### Phase 4 — Polish (half evening)
- Error handling & retry queue for Sheets writes
- Loading/empty states
- Keyboard shortcut (`Cmd+Shift+J` opens popup)
- README with setup + "add a new platform" guide

**Checkpoint:** Ready for daily use.

**Deferred (future phases):**
- AI fallback parser (when you're ready)
- Status update via right-click on saved URLs
- Email parsing for auto-status-updates
- Follow-up cadence reminders

---

## 13. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| LinkedIn DOM changes | Low-confidence signal flags it; generic fallback keeps you moving; fixture test suite catches regressions quickly |
| Workday multi-tenant variance | Start with JSON-LD-first; accept that some Workday tenants need a manual pass; IDR approach adds tenant-specific parser |
| OAuth client ID exposure | Personal use only; README explicit about not publishing |
| Sheet row limit (10M cells) | Not a concern at personal scale — 10k applications × 27 columns = 270k cells |
| Schema evolution | `schema_version` column + `meta` tab; migrations logic in `lib/sheets.ts` on app start |

**Open questions for you before I start:**
1. **Sheet location**: create a fresh `Job Applications Tracker` sheet in your Drive, or point to one you already have?
2. **Resume variants**: give me the rough names now, or add them in options after install? (can go either way — I'll ship the UI either way)
3. **Google Cloud Console OAuth setup**: you'll need to create a project and OAuth client ID. I'll provide step-by-step in the README. Is that fine, or do you want me to skip OAuth for V1 and just export to CSV locally? (trade-off: no Sheets until OAuth is set up, but you can install and use the extension immediately)
4. **Directory location**: I've drafted at `/Users/devrev/Dnesh_personal/job-capture/`. Move or rename?
5. **Keyboard shortcut**: `Cmd+Shift+J` okay, or prefer something else?

---

## 14. Success Criteria

V1 is done when:
- [ ] I can click the toolbar icon on a LinkedIn/Greenhouse/Lever/Ashby/Workday job page, see 80%+ of fields pre-filled correctly, pick a resume, hit Save, and see a new row in my Sheet in under 10 seconds
- [ ] Re-capturing the same URL shows a "already captured" warning
- [ ] Dashboard loads my latest data and renders all 5 charts
- [ ] Adding a new ATS platform takes <1 hour (fixture + parser + test + dispatcher entry)
- [ ] Zero data leaves my local machine or my Google account

---

*Awaiting your review. Once approved, Phase 0 + Phase 1 go first — you'll have a working capture tool before Phase 2 parsers land.*
