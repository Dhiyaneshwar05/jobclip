import {
  APPLICATION_COLUMNS,
  RESUME_COLUMNS,
  SCHEMA_VERSION,
  SHEET_TABS,
  type ApplicationRow,
  type ApplicationStatus,
  type ResumeVariant,
} from '@shared/types';
import { UnauthorizedError } from './auth';
import { resumeToSheetValues, rowToSheetValues, sheetValuesToRow } from './schema';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

interface SheetMeta {
  spreadsheetId: string;
  properties: { title: string };
  sheets: Array<{ properties: { sheetId: number; title: string } }>;
}

async function fetchAuthed(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401) throw new UnauthorizedError();
  return res;
}

async function assertOk(res: Response, context: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${context}: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }
}

async function getSheetMeta(token: string, sheetId: string): Promise<SheetMeta> {
  const res = await fetchAuthed(
    token,
    `${SHEETS_BASE}/${sheetId}?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title)`,
  );
  await assertOk(res, 'get sheet meta');
  return (await res.json()) as SheetMeta;
}

async function appendValues(
  token: string,
  sheetId: string,
  range: string,
  values: unknown[][],
): Promise<void> {
  const res = await fetchAuthed(
    token,
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values }) },
  );
  await assertOk(res, `append to ${range}`);
}

async function putValues(
  token: string,
  sheetId: string,
  range: string,
  values: unknown[][],
): Promise<void> {
  const res = await fetchAuthed(
    token,
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify({ values }) },
  );
  await assertOk(res, `put ${range}`);
}

async function getValues(token: string, sheetId: string, range: string): Promise<string[][]> {
  const res = await fetchAuthed(
    token,
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}`,
  );
  if (res.status === 400) return [];
  await assertOk(res, `get ${range}`);
  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

async function clearValues(token: string, sheetId: string, range: string): Promise<void> {
  const res = await fetchAuthed(
    token,
    `${SHEETS_BASE}/${sheetId}/values/${encodeURIComponent(range)}:clear`,
    { method: 'POST', body: '{}' },
  );
  await assertOk(res, `clear ${range}`);
}

async function addTab(token: string, sheetId: string, title: string): Promise<void> {
  const res = await fetchAuthed(token, `${SHEETS_BASE}/${sheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  });
  await assertOk(res, `add tab ${title}`);
}

export async function createTrackerSheet(
  token: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const res = await fetchAuthed(token, SHEETS_BASE, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: name },
      sheets: [
        { properties: { title: SHEET_TABS.applications } },
        { properties: { title: SHEET_TABS.resumes } },
        { properties: { title: SHEET_TABS.meta } },
      ],
    }),
  });
  await assertOk(res, 'create sheet');
  const data = (await res.json()) as { spreadsheetId: string; properties: { title: string } };
  const id = data.spreadsheetId;

  await putValues(token, id, `${SHEET_TABS.applications}!A1:Z1`, [APPLICATION_COLUMNS as string[]]);
  await putValues(token, id, `${SHEET_TABS.resumes}!A1:Z1`, [RESUME_COLUMNS as string[]]);
  await putValues(token, id, `${SHEET_TABS.meta}!A1:C2`, [
    ['schema_version', 'last_reconciled_at', 'app_version'],
    [SCHEMA_VERSION, new Date().toISOString(), '0.1.0'],
  ]);

  return { id, name: data.properties.title };
}

export async function validateAndPrepareSheet(
  token: string,
  sheetId: string,
): Promise<{ ok: boolean; name: string; missingTabs: string[] }> {
  const meta = await getSheetMeta(token, sheetId);
  const existing = new Set(meta.sheets.map((s) => s.properties.title));
  const required = [SHEET_TABS.applications, SHEET_TABS.resumes, SHEET_TABS.meta];
  const missing = required.filter((t) => !existing.has(t));

  for (const tab of missing) {
    await addTab(token, sheetId, tab);
    if (tab === SHEET_TABS.applications) {
      await putValues(token, sheetId, `${tab}!A1:Z1`, [APPLICATION_COLUMNS as string[]]);
    } else if (tab === SHEET_TABS.resumes) {
      await putValues(token, sheetId, `${tab}!A1:Z1`, [RESUME_COLUMNS as string[]]);
    } else if (tab === SHEET_TABS.meta) {
      await putValues(token, sheetId, `${tab}!A1:C2`, [
        ['schema_version', 'last_reconciled_at', 'app_version'],
        [SCHEMA_VERSION, new Date().toISOString(), '0.1.0'],
      ]);
    }
  }

  const appHeaders = await getValues(token, sheetId, `${SHEET_TABS.applications}!A1:Z1`);
  if (!appHeaders.length || appHeaders[0].length === 0) {
    await putValues(token, sheetId, `${SHEET_TABS.applications}!A1:Z1`, [APPLICATION_COLUMNS as string[]]);
  }

  return { ok: true, name: meta.properties.title, missingTabs: missing };
}

export async function appendApplication(
  token: string,
  sheetId: string,
  row: ApplicationRow,
): Promise<void> {
  await appendValues(token, sheetId, `${SHEET_TABS.applications}!A:Z`, [rowToSheetValues(row)]);
}

export async function listApplications(token: string, sheetId: string): Promise<ApplicationRow[]> {
  const values = await getValues(token, sheetId, `${SHEET_TABS.applications}!A:Z`);
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map((r) => sheetValuesToRow(r, headers));
}

export async function findByUrlCanonical(
  token: string,
  sheetId: string,
  urlCanonical: string,
): Promise<ApplicationRow | null> {
  const rows = await listApplications(token, sheetId);
  return rows.find((r) => r.url_canonical === urlCanonical) ?? null;
}

export async function updateApplicationStatus(
  token: string,
  sheetId: string,
  id: string,
  status: ApplicationStatus,
  statusUpdatedAt: string,
  notes?: string,
): Promise<void> {
  const values = await getValues(token, sheetId, `${SHEET_TABS.applications}!A:Z`);
  if (values.length < 2) throw new Error('Sheet empty');
  const headers = values[0];
  const idIdx = headers.indexOf('id');
  const statusIdx = headers.indexOf('status');
  const statusTsIdx = headers.indexOf('status_updated_at');
  const notesIdx = headers.indexOf('notes');
  if (idIdx < 0 || statusIdx < 0 || statusTsIdx < 0) throw new Error('Sheet missing required columns');

  for (let i = 1; i < values.length; i++) {
    if (values[i][idIdx] === id) {
      const row = [...values[i]];
      row[statusIdx] = status;
      row[statusTsIdx] = statusUpdatedAt;
      if (notes != null && notesIdx >= 0) row[notesIdx] = notes;
      const sheetRow = i + 1;
      await putValues(token, sheetId, `${SHEET_TABS.applications}!A${sheetRow}:Z${sheetRow}`, [row]);
      return;
    }
  }
  throw new Error(`Application ${id} not found`);
}

export async function syncResumes(
  token: string,
  sheetId: string,
  resumes: ResumeVariant[],
): Promise<void> {
  await clearValues(token, sheetId, `${SHEET_TABS.resumes}!A2:Z`);
  if (resumes.length === 0) {
    await putValues(token, sheetId, `${SHEET_TABS.resumes}!A1:Z1`, [RESUME_COLUMNS as string[]]);
    return;
  }
  await putValues(
    token,
    sheetId,
    `${SHEET_TABS.resumes}!A1:Z${resumes.length + 1}`,
    [RESUME_COLUMNS as string[], ...resumes.map(resumeToSheetValues)],
  );
}
