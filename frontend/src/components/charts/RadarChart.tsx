import { useEffect, useState } from 'react';
import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { AnalysisResult, Dimension } from '../../types/analysis';

interface RadarChartProps {
  data?: AnalysisResult;
}

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: 'security', label: '安全性' },
  { key: 'quality', label: '代码质量' },
  { key: 'complexity', label: '复杂度' },
  { key: 'maintainability', label: '可维护性' },
  { key: 'standards', label: '规范性' },
];

function getScoreColor(score: number): string {
  if (score >= 80) return '#3ee8a5';
  if (score >= 50) return '#fcc737';
  return '#ff7a7a';
}

function buildChartData(data?: AnalysisResult) {
  return DIMENSIONS.map(({ key, label }) => ({
    dimension: label,
    score: data ? data[key].score : 100,
    issues: data ? data[key].issues.length : 0,
    fullMark: 100,
  }));
}

/** Custom axis tick: label + score */
function CustomTick(props: any) {
  const { x, y, payload, chartData } = props;
  const item = chartData?.find((d: any) => d.dimension === payload.value);
  const score = item?.score ?? 0;
  const color = score > 0 ? getScoreColor(score) : '#7b91ad';

  // Offset label outward a bit
  const cx = props.cx ?? 0;
  const cy = props.cy ?? 0;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const nudge = 18;
  const nx = dist > 0 ? x + (dx / dist) * nudge : x;
  const ny = dist > 0 ? y + (dy / dist) * nudge : y;

  return (
    <g>
      <text
        x={nx}
        y={ny - 8}
        textAnchor="middle"
        fill="#b4c5dc"
        fontSize={13}
        fontWeight={500}
      >
        {payload.value}
      </text>
      {score > 0 && (
        <text
          x={nx}
          y={ny + 10}
          textAnchor="middle"
          fill={color}
          fontSize={15}
          fontWeight={700}
          fontFamily="monospace"
        >
          {score}
        </text>
      )}
    </g>
  );
}

/** Custom tooltip */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-dark-bg-secondary/95 backdrop-blur border border-dark-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-dark-text text-sm font-medium">{d.dimension}</p>
      <p className="text-sm font-mono" style={{ color: getScoreColor(d.score) }}>
        得分: {d.score}
      </p>
      {d.issues > 0 && (
        <p className="text-dark-text-muted text-xs">{d.issues} 个问题</p>
      )}
    </div>
  );
}

/** Custom radar dots with glow */
function CustomDot(props: any) {
  const { cx, cy, payload } = props;
  if (!cx || !cy || !payload?.score) return null;
  const color = getScoreColor(payload.score);
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.15} />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} opacity={0.9} />
    </g>
  );
}

export function RadarChart({ data }: RadarChartProps) {
  const chartData = buildChartData(data);
  const hasData = !!data;

  // Animate in
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    if (hasData) {
      setAnimated(false);
      const t = requestAnimationFrame(() => setAnimated(true));
      return () => cancelAnimationFrame(t);
    }
    setAnimated(false);
  }, [hasData]);

  // Overall score
  const avgScore = hasData
    ? Math.round(DIMENSIONS.reduce((s, d) => s + data[d.key].score, 0) / DIMENSIONS.length)
    : 100;

  return (
    <div className="relative w-full h-full">
      {/* SVG gradient defs */}
      <svg width={0} height={0} className="absolute">
        <defs>
          <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#36e4b0" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#5b9aff" stopOpacity={0.08} />
          </radialGradient>
          <filter id="radarGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="68%" data={chartData}>
          <PolarGrid stroke="#334766" strokeOpacity={0.6} />
          <PolarAngleAxis
            dataKey="dimension"
            tick={<CustomTick chartData={chartData} />}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name="得分"
            dataKey="score"
            stroke={hasData ? '#36e4b0' : '#5b9aff'}
            fill="url(#radarGradient)"
            fillOpacity={hasData ? (animated ? 1 : 0.05) : 0.15}
            strokeWidth={hasData ? 2.5 : 1.5}
            filter={hasData ? 'url(#radarGlow)' : undefined}
            dot={<CustomDot />}
            isAnimationActive={true}
            animationDuration={800}
            animationEasing="ease-out"
          />
          {hasData && <Tooltip content={<CustomTooltip />} />}
        </RechartsRadarChart>
      </ResponsiveContainer>

      {/* Center overall score */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center">
          <span
            className="text-4xl font-black tabular-nums leading-none"
            style={{ color: getScoreColor(avgScore) }}
          >
            {avgScore}
          </span>
          <span className="text-xs text-dark-text-muted mt-1">综合评分</span>
        </div>
      </div>
    </div>
  );
}
