import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ApplicationRow, ResumeVariant } from '@shared/types';

export default function ResumePerformance({
  rows,
  resumes,
}: {
  rows: ApplicationRow[];
  resumes: ResumeVariant[];
}) {
  const resumeMap = new Map(resumes.map((r) => [r.id, r.display_name]));

  const byResume = new Map<string, { applied: number; screening: number; interviewing: number; offer: number; rejected: number }>();
  for (const r of rows) {
    const key = r.resume_used || 'unknown';
    if (!byResume.has(key)) {
      byResume.set(key, { applied: 0, screening: 0, interviewing: 0, offer: 0, rejected: 0 });
    }
    const b = byResume.get(key)!;
    if (r.status === 'applied' || r.status === 'saved') b.applied++;
    else if (r.status === 'screening') b.screening++;
    else if (r.status === 'interviewing') b.interviewing++;
    else if (r.status === 'offer') b.offer++;
    else if (r.status === 'rejected') b.rejected++;
  }

  const data = Array.from(byResume.entries()).map(([id, counts]) => ({
    resume: resumeMap.get(id) ?? id,
    ...counts,
  }));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Resume performance</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="resume" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="applied" stackId="a" fill="#c7d2fe" />
            <Bar dataKey="screening" stackId="a" fill="#a5b4fc" />
            <Bar dataKey="interviewing" stackId="a" fill="#818cf8" />
            <Bar dataKey="offer" stackId="a" fill="#22c55e" />
            <Bar dataKey="rejected" stackId="a" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
