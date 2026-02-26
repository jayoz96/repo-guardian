import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

interface ScoreCardProps {
  icon: ReactNode;
  label: string;
  desc?: string;
  score: number;
  maxScore?: number;
  issueCount?: number;
  index?: number;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-score-green';
  if (score >= 50) return 'text-score-yellow';
  return 'text-score-red';
}

function getBarColor(score: number): string {
  if (score >= 80) return 'bg-score-green';
  if (score >= 50) return 'bg-score-yellow';
  return 'bg-score-red';
}

function getGlowColor(score: number): string {
  if (score >= 80) return 'shadow-score-green/20';
  if (score >= 50) return 'shadow-score-yellow/20';
  return 'shadow-score-red/20';
}

function getBorderColor(score: number): string {
  if (score >= 80) return 'border-l-score-green';
  if (score >= 50) return 'border-l-score-yellow';
  return 'border-l-score-red';
}

function getIconBg(score: number): string {
  if (score >= 80) return 'bg-score-green/10';
  if (score >= 50) return 'bg-score-yellow/10';
  return 'bg-score-red/10';
}

export function ScoreCard({ icon, label, desc, score, maxScore = 100, issueCount, index = 0 }: ScoreCardProps) {
  const pct = Math.round((score / maxScore) * 100);
  const [barWidth, setBarWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), index * 80);
    const t2 = setTimeout(() => setBarWidth(pct), index * 80 + 150);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [pct, index]);

  return (
    <div
      className={`flex items-center gap-3.5 p-3.5 rounded-xl bg-dark-bg-secondary border border-dark-border border-l-4 ${getBorderColor(pct)} hover:shadow-lg ${getGlowColor(pct)} transition-all duration-300 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
      style={{ transitionProperty: 'opacity, transform, box-shadow' }}
    >
      <div className={`shrink-0 w-9 h-9 rounded-lg ${getIconBg(pct)} flex items-center justify-center ${getScoreColor(pct)}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm text-dark-text font-medium">{label}</span>
          <div className="flex items-center gap-2">
            {issueCount != null && issueCount > 0 && (
              <span className="text-xs text-dark-text-muted px-1.5 py-0.5 rounded bg-dark-bg-tertiary">{issueCount} 项</span>
            )}
            <span className={`text-lg font-bold tabular-nums font-mono ${getScoreColor(pct)}`}>
              {pct}
            </span>
          </div>
        </div>
        {desc && (
          <p className="text-[11px] text-dark-text-muted mb-1.5 leading-relaxed">{desc}</p>
        )}
        <div className="h-1.5 rounded-full bg-dark-bg-tertiary overflow-hidden">
          <div
            className={`h-full rounded-full ${getBarColor(pct)}`}
            style={{ width: `${barWidth}%`, transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
          />
        </div>
      </div>
    </div>
  );
}
