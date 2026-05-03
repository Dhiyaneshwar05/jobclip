import { useEffect, useState } from 'react';
import type { AppSettings, ApplicationStatus, ResumeVariant } from '@shared/types';
import type { Message } from '@shared/messaging';
import { sendMessage } from '@shared/messaging';
import {
  addResume,
  deleteResume,
  getSettings,
  setSettings,
  updateResume,
} from '@lib/storage';

const STATUSES: ApplicationStatus[] = [
  'saved',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
  'ghosted',
];

export default function App() {
  const [settings, setLocalSettings] = useState<AppSettings | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetIdInput, setSheetIdInput] = useState('');
  const [newResume, setNewResume] = useState({ display_name: '', file_hint: '', active: true });

  useEffect(() => {
    void (async () => {
      const s = await getSettings();
      setLocalSettings(s);
    })();
  }, []);

  async function reload() {
    setLocalSettings(await getSettings());
  }

  async function handleSignIn() {
    setBusy('signin');
    setError(null);
    const res = await sendMessage<Message>({ type: 'SIGN_IN' });
    if (res.type === 'SIGN_IN_RESULT') {
      if (res.success) setEmail(res.email ?? 'signed in');
      else setError(res.error ?? 'Sign-in failed');
    }
    setBusy(null);
  }

  async function handleSignOut() {
    await sendMessage<Message>({ type: 'SIGN_OUT' }).catch(() => undefined);
    setEmail(null);
  }

  async function handleCreateSheet() {
    setBusy('create-sheet');
    setError(null);
    const res = await sendMessage<Message>({ type: 'SETUP_SHEET' });
    if (res.type === 'SETUP_SHEET_RESULT') {
      if (res.success) await reload();
      else setError(res.error ?? 'Create failed');
    }
    setBusy(null);
  }

  async function handleUseExisting() {
    if (!sheetIdInput.trim()) return;
    setBusy('use-existing');
    setError(null);
    const id = extractSheetId(sheetIdInput.trim());
    const res = await sendMessage<Message>({ type: 'SETUP_SHEET', existingId: id });
    if (res.type === 'SETUP_SHEET_RESULT') {
      if (res.success) {
        setSheetIdInput('');
        await reload();
      } else setError(res.error ?? 'Link failed');
    }
    setBusy(null);
  }

  async function handleAddResume() {
    if (!newResume.display_name.trim()) return;
    await addResume(newResume);
    setNewResume({ display_name: '', file_hint: '', active: true });
    await reload();
  }

  async function handleToggleActive(r: ResumeVariant) {
    await updateResume(r.id, { active: !r.active });
    await reload();
  }

  async function handleDeleteResume(id: string) {
    await deleteResume(id);
    await reload();
  }

  async function handleSetDefaultResume(id: string) {
    await setSettings({ default_resume_id: id || null });
    await reload();
  }

  async function handleSetDefaultStatus(status: ApplicationStatus) {
    await setSettings({ default_status: status });
    await reload();
  }

  function openDashboard() {
    void sendMessage({ type: 'OPEN_DASHBOARD' });
  }

  if (!settings) return <div className="p-8 text-gray-600">Loading…</div>;

  const sheetUrl = settings.sheet_id
    ? `https://docs.google.com/spreadsheets/d/${settings.sheet_id}`
    : null;

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Job Capture</h1>
        <p className="text-sm text-gray-600">Personal job-application tracker settings.</p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Google account</h2>
        {email ? (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">Signed in as {email}</div>
            <button onClick={handleSignOut} className="text-sm text-gray-600 hover:text-gray-900 underline">
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            disabled={busy === 'signin'}
            className="bg-brand-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {busy === 'signin' ? 'Signing in…' : 'Sign in with Google'}
          </button>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Tracker sheet</h2>
        {sheetUrl ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-900 font-medium">{settings.sheet_name}</div>
              <a href={sheetUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 underline">
                Open in Google Sheets
              </a>
            </div>
            <button
              onClick={() => setLocalSettings({ ...settings, sheet_id: null, sheet_name: null })}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleCreateSheet}
              disabled={busy === 'create-sheet'}
              className="bg-brand-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
            >
              {busy === 'create-sheet' ? 'Creating…' : 'Create new tracker'}
            </button>
            <div className="text-xs text-gray-500">— or —</div>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                placeholder="Paste Sheet URL or ID"
                value={sheetIdInput}
                onChange={(e) => setSheetIdInput(e.target.value)}
              />
              <button
                onClick={handleUseExisting}
                disabled={busy === 'use-existing' || !sheetIdInput.trim()}
                className="bg-gray-900 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                Use existing
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Resume variants</h2>
        {settings.resumes.length === 0 ? (
          <p className="text-sm text-gray-600">No resumes yet. Add your variants below.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b border-gray-200">
                <th className="py-1.5">Name</th>
                <th className="py-1.5">File hint</th>
                <th className="py-1.5">Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {settings.resumes.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-900">{r.display_name}</td>
                  <td className="py-2 text-gray-600">{r.file_hint || '—'}</td>
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={() => handleToggleActive(r)}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => handleDeleteResume(r.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="pt-2 border-t border-gray-100 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-600">Display name</label>
            <input
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              value={newResume.display_name}
              onChange={(e) => setNewResume({ ...newResume, display_name: e.target.value })}
              placeholder="AI-heavy v3 (Apr 2026)"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-600">File hint (optional)</label>
            <input
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
              value={newResume.file_hint}
              onChange={(e) => setNewResume({ ...newResume, file_hint: e.target.value })}
              placeholder="DhiyaneshG_AI_v3.pdf"
            />
          </div>
          <label className="flex items-center gap-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={newResume.active}
              onChange={(e) => setNewResume({ ...newResume, active: e.target.checked })}
            />
            Active
          </label>
          <button
            onClick={handleAddResume}
            disabled={!newResume.display_name.trim()}
            className="bg-brand-600 text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Preferences</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-600">Default resume</label>
            <select
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              value={settings.default_resume_id ?? ''}
              onChange={(e) => handleSetDefaultResume(e.target.value)}
            >
              <option value="">No default</option>
              {settings.resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600">Default status on capture</label>
            <select
              className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              value={settings.default_status}
              onChange={(e) => handleSetDefaultStatus(e.target.value as ApplicationStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-2">Dashboard</h2>
        <button
          onClick={openDashboard}
          className="bg-gray-900 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-800"
        >
          Open dashboard
        </button>
      </section>
    </div>
  );
}

function extractSheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : input;
}
