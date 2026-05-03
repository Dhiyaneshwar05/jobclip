import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { ApplicationRow } from '@shared/types';

const COLORS = ['#4f46e5', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#64748b'];

export default function PlatformBreakdown({ rows }: { rows: ApplicationRow[] }) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.platform, (counts.get(r.platform) ?? 0) + 1);
  }
  const data = Array.from(counts.entries()).map(([platform, value]) => ({ platform, value }));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Platform breakdown</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="platform" outerRadius={70} label={{ fontSize: 10 }}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
