import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { ScanRecord } from '../dashboard/ScanHistory';

interface TrendChartProps {
  history: ScanRecord[];
}

const LINES = [
  { key: 'security', name: '安全性', color: '#ff7a7a' },
  { key: 'quality', name: '代码质量', color: '#5b9aff' },
  { key: 'complexity', name: '复杂度', color: '#ffa94d' },
  { key: 'maintainability', name: '可维护性', color: '#3ee8a5' },
  { key: 'standards', name: '规范性', color: '#c084fc' },
  { key: 'avgScore', name: '均分', color: '#22d3ee' },
] as const;

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-bg-secondary/95 backdrop-blur border border-dark-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-dark-text-muted text-xs mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs font-mono" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export function TrendChart({ history }: TrendChartProps) {
  const data = history
    .filter((r) => r.scores)
    .slice()
    .reverse()
    .map((r) => ({
      time: r.time.replace(/\d{4}\//, ''),
      ...r.scores,
      avgScore: r.avgScore,
    }));

  if (data.length < 2) return null;

  return (
    <div className="rounded-xl border border-dark-border bg-dark-bg-secondary p-5">
      <h2 className="text-base font-medium text-dark-text-secondary mb-3 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan inline-block" />
        趋势追踪
      </h2>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334766" strokeOpacity={0.4} />
            <XAxis dataKey="time" tick={{ fill: '#7b91ad', fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: '#7b91ad', fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: '#b4c5dc' }}
              iconType="circle"
              iconSize={8}
            />
            {LINES.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={l.key === 'avgScore' ? 2 : 1.5}
                strokeDasharray={l.key === 'avgScore' ? '6 3' : undefined}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
