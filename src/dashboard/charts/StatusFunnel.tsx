import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from 'recharts';
import type { ApplicationRow, ApplicationStatus } from '@shared/types';

const ORDER: ApplicationStatus[] = [
  'saved',
  'applied',
  'screening',
  'interviewing',
  'offer',
];

export default function StatusFunnel({ rows }: { rows: ApplicationRow[] }) {
  const counts = new Map<ApplicationStatus, number>();
  for (const r of rows) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }

  const applied = counts.get('applied') ?? 0;
  const data = ORDER.map((status) => {
    const count = counts.get(status) ?? 0;
    const pct = applied > 0 && status !== 'applied' && status !== 'saved'
      ? `${Math.round((count / applied) * 100)}%`
      : '';
    return { status, count, pct };
  });

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Status funnel</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="status" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#6366f1">
              <LabelList dataKey="pct" position="top" fontSize={10} fill="#6b7280" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
