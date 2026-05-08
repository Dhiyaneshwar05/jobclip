# jobclip

> One-click capture of job postings from **LinkedIn, Greenhouse, Lever, Ashby, and Workday** straight into your own Google Sheet — with a local dashboard for pattern analysis.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285f4.svg)](manifest.config.ts)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](package.json)

---

## 🎬 Demo

### Capture flow — one click on a LinkedIn job page

<p align="center">
  <img src="docs/images/popup-linkedin.png" alt="jobclip popup capturing an AI Engineer role at Teradata from LinkedIn — company, role, location, work-mode, seniority, resume variant, and status all pre-filled" width="460"/>
</p>

> Popup opens on the active tab. Company, role, location, work-mode, and seniority are pre-filled by the site-specific parser. You pick a resume variant + status and hit save — a row lands in your Google Sheet.

---

### Dashboard — applications over time, resume performance, platform mix

<p align="center">
  <img src="docs/images/dashboard.png" alt="jobclip dashboard overview: applications over time, status funnel, resume performance, platform breakdown" width="900"/>
</p>

<p align="center">
  <img src="docs/images/dashboard-applications-table.png" alt="Top-10 companies chart and applications table showing per-row status, resume used, and notes" width="900"/>
</p>

> Everything is a React + Recharts view against your Google Sheet. Filter by date range, status, platform, or resume; export to CSV when you want to slice offline.

---

### Filter-aware views — zoom into one resume variant

<p align="center">
  <img src="docs/images/dashboard-filters.png" alt="Dashboard filtered to the rejected status — only one matching row shown, all charts re-aggregate" width="900"/>
</p>

> Every filter pill updates the Sheet query and re-aggregates the charts live. The row counter at the top reflects the current filter set.

---

### Options page — sign-in, tracker Sheet, resume registry

<p align="center">
  <img src="docs/images/options.png" alt="Options page: Google sign-in, active tracker Sheet, resume variants registry with AI-Heavy and FDE-Heavy variants, default preferences" width="560"/>
</p>

> Sign in with Google, create (or point to) a tracker Sheet in your Drive, register your resume variants, and pick sane defaults. All state lives in `chrome.storage` and your Drive — no servers.

---

## Why I built this

I was job-hunting and tired of manually copy-pasting role, company, location, comp, and JD links into a spreadsheet — while also losing track of which resume variant I sent where. **jobclip** is a personal MV3 extension that does the boring work in one click and lets me spend my attention on the actual interviews.

Along the way it was a good excuse to ship a non-trivial Chrome extension end-to-end: MV3 service workers, site-specific DOM parsers, JSON-LD fallbacks, OAuth via `chrome.identity`, and a React dashboard backed entirely by the user's own Google Drive (no servers of my own).

---

## Features

- **One-click capture** from the toolbar icon, right-click menu, or `Cmd/Ctrl+Shift+J`.
- **Site-aware parsers** for LinkedIn, Greenhouse, Lever, Ashby, Workday — plus a generic JSON-LD / OpenGraph fallback for anything else.
- **Auto-extracted fields**: company, role, location, salary (USD/INR/GBP), years of experience, skills.
- **Resume variant picker** — register your resumes once, tag each application with the version you sent.
- **Status tracking** — Applied, Phone Screen, Onsite, Offer, Rejected, etc.; update later without leaving the site.
- **Google Sheets as the store** — data lives in *your* Drive. Dedup by URL, three tabs (`applications`, `resumes`, `meta`).
- **Local dashboard** with five Recharts views: applications over time, status funnel, resume performance, platform breakdown, top companies.
- **CSV export** for offline analysis.
- **No backend, no telemetry.**

---

## Tech stack

| Layer | Tools |
|---|---|
| Extension | Chrome Manifest V3, `@crxjs/vite-plugin` |
| Frontend | React 18, TypeScript 5, Tailwind CSS, Recharts |
| Build | Vite 5, PostCSS, Autoprefixer |
| Storage | `chrome.storage`, Google Sheets API v4 via `chrome.identity` OAuth |
| Validation | Zod |
| Tests | Vitest + happy-dom, HTML fixtures per parser |

---

## Architecture

```mermaid
flowchart LR
    subgraph Browser["🌐 Browser tab (job page)"]
        CS["content script<br/><sub>LinkedIn · Greenhouse · Lever · Ashby · Workday · JSON-LD fallback</sub>"]
    end

    subgraph Extension["🧩 jobclip extension (MV3)"]
        POP["popup (React)<br/><sub>field review · resume picker · status</sub>"]
        BG["background service worker<br/><sub>OAuth · Sheets API · dedup</sub>"]
        OPT["options page<br/><sub>resume registry · tracker Sheet · prefs</sub>"]
        DSH["dashboard (React + Recharts)<br/><sub>5 charts · filters · CSV export</sub>"]
        ST[("chrome.storage<br/><sub>resumes · settings · cache</sub>")]
    end

    subgraph Google["☁️ Your Google account"]
        GS[("Google Sheet<br/><sub>applications · resumes · meta</sub>")]
    end

    CS -- "parsed fields" --> POP
    POP -- "save" --> BG
    BG -- "OAuth (chrome.identity)<br/>Sheets API v4" --> GS
    OPT <--> ST
    OPT -- "create / link tracker" --> GS
    DSH -- "read rows" --> GS
    BG <--> ST

    classDef primary fill:#4f46e5,stroke:#312e81,color:#fff
    classDef storage fill:#0f766e,stroke:#064e3b,color:#fff
    classDef ui fill:#1e293b,stroke:#475569,color:#e2e8f0
    class CS,BG primary
    class ST,GS storage
    class POP,OPT,DSH ui
```

### Data flow — capture to dashboard

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant P as Job page
    participant CS as Content script
    participant POP as Popup
    participant BG as Background SW
    participant GS as Google Sheets
    participant D as Dashboard

    U->>POP: Click toolbar icon<br/>(or Cmd/Ctrl+Shift+J)
    POP->>CS: Request parse
    CS->>P: Site-specific parser + JSON-LD fallback
    P-->>CS: DOM / meta / JSON-LD
    CS-->>POP: Parsed fields (company, role, salary, …)
    U->>POP: Pick resume variant + status, save
    POP->>BG: save(jobPayload)
    BG->>GS: OAuth via chrome.identity
    BG->>GS: Dedup by URL, append row
    GS-->>BG: Row index
    BG-->>POP: ✓ Saved
    U->>D: Open dashboard
    D->>GS: Read applications sheet
    GS-->>D: Rows
    D-->>U: Charts + filters
```

Full design doc: [TDD.md](TDD.md).

---

## Setup

### 1. Create a Google Cloud OAuth client

The extension uses `chrome.identity` to talk to Google Sheets. You need your own OAuth client because Chrome extensions are per-install.

1. Go to <https://console.cloud.google.com/>. Create a new project (e.g., `jobclip`).
2. **APIs & Services → Library** → enable **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → External → add yourself as a test user. Scopes: `.../auth/spreadsheets` and `.../auth/drive.file`.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → *Chrome Extension* type.
5. Copy the **Client ID** (ends with `.apps.googleusercontent.com`).

### 2. Wire the Client ID

Replace `REPLACE_WITH_YOUR_OAUTH_CLIENT_ID.apps.googleusercontent.com` in:

- [`src/lib/config.ts`](src/lib/config.ts)
- [`manifest.config.ts`](manifest.config.ts) (if referenced there)

### 3. Build and load the extension

```bash
npm install
npm run build
```

Then in Chrome / Arc:

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → pick the `dist/` folder.
3. Copy the extension ID and paste it into your Google Cloud OAuth client's **Item ID** field.

### 4. First-run

Click the jobclip icon → **Sign in with Google** → **Create new tracker** (or paste an existing Sheet URL) → add your resume variants. Ready.

---

## Development

```bash
npm run dev          # vite dev with HMR — reload extension after bg/content-script changes
npm run build        # production build → dist/
npm run test         # vitest: parser + extractor suites
npm run typecheck    # tsc --noEmit
```

### Adding a new platform

1. Save a representative HTML page to `tests/fixtures/<platform>-sample.html`.
2. Write a failing test in `tests/parsers.test.ts`.
3. Implement `src/content/parsers/<platform>.ts` following `greenhouse.ts`.
4. Register it in `src/content/index.ts` (`SITE_PARSERS` array).
5. Add the URL pattern to `manifest.config.ts` → `content_scripts.matches` and `host_permissions`.
6. Rebuild, reload.

---

## Privacy

- All data lives in **your** Google account and local `chrome.storage`. No external servers, no telemetry.
- Your OAuth client is your own — don't share the client ID publicly if you ever publish this extension.

---

## Known limitations

- **LinkedIn** selectors drift when LinkedIn ships DOM changes. Low-confidence fields are highlighted yellow in the popup — verify before saving. When breakage happens: save a fresh fixture, update selectors, rebuild.
- **Workday** is multi-tenant; DOM varies per employer. Most tenants embed JSON-LD (parser uses it first); DOM fallback is best-effort.
- **Dedup** is URL-based. If a posting moves URLs, you may get duplicate rows — filter by company+role in the dashboard.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).
