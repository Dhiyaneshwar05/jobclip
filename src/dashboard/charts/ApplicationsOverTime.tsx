import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ApplicationRow } from '@shared/types';

function weekKey(d: Date): string {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() - day);
  return copy.toISOString().slice(0, 10);
}

export default function ApplicationsOverTime({ rows }: { rows: ApplicationRow[] }) {
  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (!r.applied_at) continue;
    const d = new Date(r.applied_at);
    if (Number.isNaN(d.getTime())) continue;
    const k = weekKey(d);
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  const data = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Applications over time</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
