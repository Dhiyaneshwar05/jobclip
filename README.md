# jobclip

Personal Chrome/Arc extension that captures job applications to Google Sheets with one click.

## What it does

- Click the toolbar icon (or `Cmd+Shift+J`) on a job page — popup opens with company, role, location, salary, years, and skills pre-filled from the page.
- Pick your resume variant + status, hit Save. A row lands in your Google Sheet.
- Supported natively: **LinkedIn, Greenhouse, Lever, Ashby, Workday**. Everything else falls back to a generic JSON-LD / OpenGraph parser.
- Dashboard shows applications over time, status funnel, resume performance, platform breakdown, and top companies.

---

## One-time setup

### 1. Create a Google Cloud OAuth client

The extension uses `chrome.identity` to talk to Google Sheets. Chrome requires a per-install OAuth client ID.

1. Go to <https://console.cloud.google.com/>. Create a new project (e.g., `jobclip`).
2. **APIs & Services → Library** → enable **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: `jobclip (personal)`
   - User support email: your email
   - Developer contact: your email
   - Scopes: add `.../auth/spreadsheets` and `.../auth/drive.file`
   - Test users: add your own Google email
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Chrome extension**
   - Name: `jobclip`
   - Item ID: (you'll fill this in after loading the extension — see step 3 below)
5. Copy the **Client ID** (ends with `.apps.googleusercontent.com`).

### 2. Wire the Client ID into the extension

Edit [`src/lib/config.ts`](src/lib/config.ts) — replace `REPLACE_WITH_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com` with your actual client ID.

### 3. Build and load

```bash
npm install
npm run build
```

Load the unpacked extension:
1. Open `chrome://extensions` (or `arc://extensions`) and enable **Developer mode** (top right).
2. Click **Load unpacked** and pick the `dist/` folder.
3. Note the extension ID (long string). Paste it into your Google Cloud OAuth client's **Item ID** field.

### 4. First-run setup

1. Click the jobclip icon — the options page opens automatically.
2. **Sign in with Google**.
3. **Create new tracker** — creates a Google Sheet titled `Job Applications Tracker - YYYY-MM-DD` in your Drive. (Or paste an existing Sheet URL/ID to reuse one.)
4. **Add your resume variants** — you'll pick one at capture time.

You're ready to capture.

---

## Development

```bash
npm run dev          # vite dev with HMR — reload extension to pick up bg/content script changes
npm run build        # production build to dist/
npm run test         # run vitest parser + extractor suite
npm run typecheck    # tsc --noEmit
```

## Adding a new platform

When a site falls to the generic parser and produces bad results:

1. Save a representative HTML page to `tests/fixtures/<platform>-sample.html`.
2. Write a failing test in `tests/parsers.test.ts`.
3. Implement `src/content/parsers/<platform>.ts` following the pattern in `greenhouse.ts`.
4. Register it in `src/content/index.ts` (`SITE_PARSERS` array).
5. Add the URL pattern to `manifest.config.ts` → `content_scripts.matches` and `host_permissions`.
6. Rebuild, reload the extension.

## Data schema

See [`TDD.md`](TDD.md) §4. The Sheet has three tabs: `applications` (main), `resumes` (registry mirror), `meta` (schema version).

## Privacy

- All data lives in **your** Google account and local `chrome.storage`. There are no servers.
- OAuth client ID is personal — don't publish this extension publicly.
- No telemetry.

## Limitations

- LinkedIn selectors change occasionally. Low-confidence fields are highlighted in yellow — double-check before saving. File a new fixture under `tests/fixtures/` and update selectors when LinkedIn ships DOM changes.
- Workday is multi-tenant and DOM varies by employer. Most tenants embed JSON-LD which the parser uses first; the DOM fallback is best-effort.
- Dedup is URL-based. If a posting moves URLs you may get duplicate rows — filter by company+role in the dashboard.
