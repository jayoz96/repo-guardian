import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import type { DependencyGraph as GraphType, DepNodeType } from '../../types/analysis';

interface Props {
  graph: GraphType;
  onClose: () => void;
}

const COLUMNS: DepNodeType[] = ['controller', 'service', 'mapper', 'table'];
const COL_LABELS: Record<DepNodeType, string> = {
  controller: 'Controller', service: 'Service', mapper: 'Mapper', table: 'Table',
};
const COL_COLORS: Record<DepNodeType, { fill: string; stroke: string; text: string }> = {
  controller: { fill: '#3b82f6', stroke: '#60a5fa', text: '#dbeafe' },
  service:    { fill: '#22c55e', stroke: '#4ade80', text: '#dcfce7' },
  mapper:     { fill: '#f97316', stroke: '#fb923c', text: '#ffedd5' },
  table:      { fill: '#a855f7', stroke: '#c084fc', text: '#f3e8ff' },
};

const NODE_W = 140;
const NODE_H = 32;
const COL_GAP = 220;
const ROW_GAP = 52;
const PAD_X = 80;
const PAD_Y = 60;

export function DependencyGraph({ graph, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const layout = useMemo(() => {
    // Group nodes by column
    const groups: Record<DepNodeType, string[]> = { controller: [], service: [], mapper: [], table: [] };
    for (const n of graph.nodes) groups[n.type].push(n.id);

    // Position each node
    const pos = new Map<string, { x: number; y: number; type: DepNodeType }>();
    for (let ci = 0; ci < COLUMNS.length; ci++) {
      const col = COLUMNS[ci];
      const ids = groups[col];
      for (let ri = 0; ri < ids.length; ri++) {
        pos.set(ids[ri], { x: PAD_X + ci * COL_GAP, y: PAD_Y + ri * ROW_GAP, type: col });
      }
    }

    const maxRows = Math.max(...COLUMNS.map((c) => groups[c].length), 1);
    const svgW = PAD_X * 2 + (COLUMNS.length - 1) * COL_GAP + NODE_W;
    const svgH = PAD_Y * 2 + (maxRows - 1) * ROW_GAP + NODE_H;
    return { pos, svgW, svgH };
  }, [graph]);

  // Build adjacency for highlight
  const related = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    const edgeSet = new Set<string>();
    for (const e of graph.edges) {
      if (e.source === selected || e.target === selected) {
        set.add(e.source);
        set.add(e.target);
        edgeSet.add(`${e.source}->${e.target}`);
      }
    }
    return { nodes: set, edges: edgeSet };
  }, [selected, graph.edges]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-dark-bg-secondary border border-accent-cyan/30 rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h3 className="text-base font-bold text-dark-text">架构依赖图</h3>
          <button onClick={onClose} className="text-dark-text-muted hover:text-dark-text transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SVG */}
        <div className="flex-1 overflow-auto p-4">
          <svg
            width={layout.svgW}
            height={layout.svgH}
            className="mx-auto"
            onClick={() => setSelected(null)}
          >
            {/* Arrow marker */}
            <defs>
              <marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
              </marker>
            </defs>

            {/* Column labels */}
            {COLUMNS.map((col, ci) => (
              <text
                key={col}
                x={PAD_X + ci * COL_GAP + NODE_W / 2}
                y={24}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize={13}
                fontWeight={600}
              >
                {COL_LABELS[col]}
              </text>
            ))}

            {/* Edges */}
            {graph.edges.map((e, i) => {
              const s = layout.pos.get(e.source);
              const t = layout.pos.get(e.target);
              if (!s || !t) return null;
              const x1 = s.x + NODE_W;
              const y1 = s.y + NODE_H / 2;
              const x2 = t.x;
              const y2 = t.y + NODE_H / 2;
              const cx1 = x1 + (x2 - x1) * 0.4;
              const cx2 = x1 + (x2 - x1) * 0.6;
              const key = `${e.source}->${e.target}`;
              const dimmed = related && !related.edges.has(key);
              return (
                <path
                  key={i}
                  d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
                  fill="none"
                  stroke={dimmed ? '#334155' : '#64748b'}
                  strokeWidth={dimmed ? 1 : 1.5}
                  markerEnd="url(#arrow)"
                  opacity={dimmed ? 0.15 : 0.8}
                />
              );
            })}

            {/* Nodes */}
            {graph.nodes.map((n) => {
              const p = layout.pos.get(n.id);
              if (!p) return null;
              const c = COL_COLORS[n.type];
              const dimmed = related && !related.nodes.has(n.id);
              const isSelected = selected === n.id;
              const label = n.id.length > 16 ? n.id.slice(0, 15) + '…' : n.id;
              return (
                <g
                  key={n.id}
                  opacity={dimmed ? 0.15 : 1}
                  className="cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setSelected(selected === n.id ? null : n.id); }}
                >
                  <rect
                    x={p.x} y={p.y}
                    width={NODE_W} height={NODE_H}
                    rx={6}
                    fill={isSelected ? c.fill : `${c.fill}33`}
                    stroke={isSelected ? c.stroke : `${c.stroke}88`}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  <text
                    x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isSelected ? '#fff' : c.text}
                    fontSize={11}
                    fontFamily="monospace"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-dark-border flex gap-4 text-xs text-dark-text-muted">
          {COLUMNS.map((col) => {
            const count = graph.nodes.filter((n) => n.type === col).length;
            return count > 0 ? (
              <span key={col} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COL_COLORS[col].fill }} />
                {COL_LABELS[col]} ({count})
              </span>
            ) : null;
          })}
        </div>
      </div>
    </div>
  );
}
