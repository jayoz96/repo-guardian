import { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Issue, Dimension } from '../../types/analysis';

interface HeatmapProps {
  issues: { dimension: Dimension; label: string; items: Issue[] }[];
  onLocateIssue?: (file: string) => void;
}

interface TreeNode {
  name: string;
  value: number;
  errorRatio: number;
  children?: TreeNode[];
}

interface Rect extends TreeNode {
  x: number; y: number; w: number; h: number;
}

/* ── squarified treemap layout ── */
function squarify(items: TreeNode[], x: number, y: number, w: number, h: number): Rect[] {
  if (!items.length) return [];
  const total = items.reduce((s, n) => s + n.value, 0);
  if (total === 0) return [];

  const rects: Rect[] = [];
  let cx = x, cy = y, cw = w, ch = h;

  for (const item of items) {
    const ratio = item.value / total;
    if (cw >= ch) {
      const iw = cw * ratio;
      rects.push({ ...item, x: cx, y: cy, w: iw, h: ch });
      cx += iw;
      cw -= iw;
    } else {
      const ih = ch * ratio;
      rects.push({ ...item, x: cx, y: cy, w: cw, h: ih });
      cy += ih;
      ch -= ih;
    }
  }
  return rects;
}

function errorColor(ratio: number): string {
  const r = Math.round(60 + ratio * 195);
  const g = Math.round(200 - ratio * 160);
  const b = Math.round(120 - ratio * 80);
  return `rgb(${r},${g},${b})`;
}

/* ── aggregate issues into directory tree ── */
function buildTree(issues: HeatmapProps['issues']): TreeNode[] {
  const dirMap = new Map<string, { total: number; errors: number; files: Map<string, { total: number; errors: number }> }>();

  for (const group of issues) {
    for (const issue of group.items) {
      if (!issue.file) continue;
      const parts = issue.file.replace(/\\/g, '/').split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      const fileName = parts[parts.length - 1];

      if (!dirMap.has(dir)) dirMap.set(dir, { total: 0, errors: 0, files: new Map() });
      const d = dirMap.get(dir)!;
      d.total++;
      if (issue.severity === 'error') d.errors++;

      if (!d.files.has(fileName)) d.files.set(fileName, { total: 0, errors: 0 });
      const f = d.files.get(fileName)!;
      f.total++;
      if (issue.severity === 'error') f.errors++;
    }
  }

  return [...dirMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, d]) => ({
      name,
      value: d.total,
      errorRatio: d.total > 0 ? d.errors / d.total : 0,
      children: [...d.files.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([fn, f]) => ({
          name: fn,
          value: f.total,
          errorRatio: f.total > 0 ? f.errors / f.total : 0,
        })),
    }));
}

const W = 800, H = 320;

export function IssueHeatmap({ issues, onLocateIssue }: HeatmapProps) {
  const [drillDir, setDrillDir] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(issues), [issues]);

  const nodes = drillDir
    ? tree.find((n) => n.name === drillDir)?.children ?? []
    : tree;

  const rects = squarify(nodes, 0, 0, W, H);

  if (tree.length === 0) return null;

  return (
    <div>
      {drillDir && (
        <button
          onClick={() => setDrillDir(null)}
          className="flex items-center gap-1 text-xs text-accent-cyan hover:underline mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> 返回目录视图
        </button>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ maxHeight: 320 }}>
        {rects.map((r, i) => (
          <g
            key={i}
            onClick={() => {
              if (!drillDir && r.children?.length) setDrillDir(r.name);
              else if (drillDir && onLocateIssue) onLocateIssue(`${drillDir}/${r.name}`);
            }}
            className="cursor-pointer"
          >
            <rect
              x={r.x + 1} y={r.y + 1}
              width={Math.max(r.w - 2, 0)} height={Math.max(r.h - 2, 0)}
              rx={4}
              fill={errorColor(r.errorRatio)}
              fillOpacity={0.7}
              stroke="#1e293b"
              strokeWidth={1.5}
            />
            {r.w > 50 && r.h > 28 && (
              <>
                <text
                  x={r.x + r.w / 2} y={r.y + r.h / 2 - 6}
                  textAnchor="middle" fill="#fff" fontSize={11} fontWeight={500}
                >
                  {r.name.length > r.w / 7 ? r.name.slice(-Math.floor(r.w / 7)) : r.name}
                </text>
                <text
                  x={r.x + r.w / 2} y={r.y + r.h / 2 + 10}
                  textAnchor="middle" fill="#ffffffcc" fontSize={10}
                >
                  {r.value} 问题
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
