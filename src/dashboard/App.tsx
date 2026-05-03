import { useEffect, useMemo, useState } from 'react';
import type {
  ApplicationRow,
  ApplicationStatus,
  Platform,
  ResumeVariant,
} from '@shared/types';
import type { Message } from '@shared/messaging';
import { sendMessage } from '@shared/messaging';
import { getSettings } from '@lib/storage';
import { APPLICATION_COLUMNS } from '@shared/types';
import { rowToSheetValues } from '@lib/schema';
import ApplicationsOverTime from './charts/ApplicationsOverTime';
import StatusFunnel from './charts/StatusFunnel';
import ResumePerformance from './charts/ResumePerformance';
import PlatformBreakdown from './charts/PlatformBreakdown';
import TopCompanies from './charts/TopCompanies';

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

const PLATFORMS: Platform[] = ['linkedin', 'greenhouse', 'lever', 'ashby', 'workday', 'other'];

type DateRange = '7' | '30' | '90' | 'all';

export default function App() {
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [resumes, setResumes] = useState<ResumeVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [statusFilter, setStatusFilter] = useState<Set<ApplicationStatus>>(new Set());
  const [platformFilter, setPlatformFilter] = useState<Set<Platform>>(new Set());
  const [resumeFilter, setResumeFilter] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    const [settings, res] = await Promise.all([
      getSettings(),
      sendMessage<Message>({ type: 'LIST_APPLICATIONS' }),
    ]);
    setResumes(settings.resumes);
    if (res.type === 'LIST_APPLICATIONS_RESULT') {
      if (res.error) setError(res.error);
      setRows(res.rows);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const cutoff = dateRangeCutoff(dateRange);
    return rows.filter((r) => {
      if (cutoff && r.applied_at) {
        const d = new Date(r.applied_at);
        if (!Number.isNaN(d.getTime()) && d.getTime() < cutoff) return false;
      }
      if (statusFilter.size > 0 && !statusFilter.has(r.status)) return false;
      if (platformFilter.size > 0 && !platformFilter.has(r.platform)) return false;
      if (resumeFilter.size > 0 && !resumeFilter.has(r.resume_used || 'unknown')) return false;
      return true;
    });
  }, [rows, dateRange, statusFilter, platformFilter, resumeFilter]);

  function toggle<T>(set: Set<T>, value: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  async function handleStatusChange(row: ApplicationRow, status: ApplicationStatus) {
    const res = await sendMessage<Message>({ type: 'UPDATE_STATUS', id: row.id, status });
    if (res.type === 'UPDATE_STATUS_RESULT' && res.success) {
      await load();
    } else if (res.type === 'UPDATE_STATUS_RESULT') {
      setError(res.error ?? 'Update failed');
    }
  }

  function exportCsv() {
    if (!filtered.length) return;
    const header = APPLICATION_COLUMNS.join(',');
    const body = filtered
      .map((r) =>
        rowToSheetValues(r)
          .map((cell) => {
            const s = String(cell);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(','),
      )
      .join('\n');
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-8 text-gray-600">Loading…</div>;

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Job Applications Dashboard</h1>
          <p className="text-sm text-gray-600">
            {rows?.length ?? 0} total · {filtered.length} shown
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="bg-gray-900 text-white rounded-md px-3 py-1.5 text-sm font-medium hover:bg-gray-800"
          >
            Export CSV
          </button>
          <button
            onClick={() => void load()}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm hover:bg-white"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Range</span>
            <div className="flex rounded-md border border-gray-300 overflow-hidden">
              {(['7', '30', '90', 'all'] as DateRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-2 py-1 text-xs ${dateRange === r ? 'bg-brand-600 text-white' : 'bg-white text-gray-700'}`}
                >
                  {r === 'all' ? 'All' : `${r}d`}
                </button>
              ))}
            </div>
          </div>
          <FilterChips
            label="Status"
            values={STATUSES}
            selected={statusFilter}
            onToggle={(v) => toggle(statusFilter, v, setStatusFilter)}
          />
          <FilterChips
            label="Platform"
            values={PLATFORMS}
            selected={platformFilter}
            onToggle={(v) => toggle(platformFilter, v, setPlatformFilter)}
          />
          <FilterChips
            label="Resume"
            values={resumes.map((r) => r.id)}
            labels={new Map(resumes.map((r) => [r.id, r.display_name]))}
            selected={resumeFilter}
            onToggle={(v) => toggle(resumeFilter, v, setResumeFilter)}
          />
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-600">
          No applications match the current filters.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ApplicationsOverTime rows={filtered} />
            <StatusFunnel rows={filtered} />
            <ResumePerformance rows={filtered} resumes={resumes} />
            <PlatformBreakdown rows={filtered} />
          </div>
          <TopCompanies rows={filtered} />

          <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">Applied</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Platform</th>
                  <th className="px-3 py-2">Resume</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice()
                  .sort((a, b) => (b.applied_at ?? '').localeCompare(a.applied_at ?? ''))
                  .map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-600">{r.applied_at}</td>
                      <td className="px-3 py-2 text-gray-900">
                        <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                          {r.company}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.role}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs capitalize">{r.platform}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">
                        {resumes.find((x) => x.id === r.resume_used)?.display_name ?? r.resume_used}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={r.status}
                          onChange={(e) =>
                            void handleStatusChange(r, e.target.value as ApplicationStatus)
                          }
                          className="text-xs border border-gray-300 rounded px-1 py-0.5"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{r.notes}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function FilterChips<T extends string>({
  label,
  values,
  labels,
  selected,
  onToggle,
}: {
  label: string;
  values: T[];
  labels?: Map<T, string>;
  selected: Set<T>;
  onToggle: (v: T) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs text-gray-600 mr-1">{label}</span>
      {values.map((v) => (
        <button
          key={v}
          onClick={() => onToggle(v)}
          className={`text-xs px-2 py-0.5 rounded-full border ${
            selected.has(v)
              ? 'bg-brand-600 border-brand-600 text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {labels?.get(v) ?? v}
        </button>
      ))}
    </div>
  );
}

function dateRangeCutoff(range: DateRange): number | null {
  if (range === 'all') return null;
  const days = parseInt(range, 10);
  return Date.now() - days * 24 * 60 * 60 * 1000;
}
