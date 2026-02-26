import { useState } from 'react';
import {
  ChevronDown, ChevronRight, AlertTriangle, AlertCircle,
  Info, Code2, Lightbulb, Wrench,
} from 'lucide-react';
import { DiffViewer } from './DiffViewer';
import type { Issue, Dimension } from '../../types/analysis';

interface IssueListProps {
  issues: { dimension: Dimension; label: string; items: Issue[] }[];
  onFix?: (issue: Issue) => void;
  fixingFile?: string | null;
}

const SEVERITY_CONFIG = {
  error: { icon: AlertCircle, badge: 'bg-score-red text-white', label: '高风险' },
  warning: { icon: AlertTriangle, badge: 'bg-score-yellow/90 text-black', label: '中风险' },
  info: { icon: Info, badge: 'bg-accent-cyan/80 text-black', label: '提示' },
};

const INITIAL_SHOW = 8;

/* ── 单条 Issue ── */
function IssueItem({ issue, onViewDiff, onFix, fixing }: {
  issue: Issue;
  onViewDiff: (issue: Issue) => void;
  onFix?: (issue: Issue) => void;
  fixing?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.info;
  const hasDetail = !!(issue.diffSnippet || issue.fixSuggestion);

  return (
    <div className="rounded-lg border border-dark-border overflow-hidden">
      {/* 主行：左侧信息 + 右侧操作按钮 */}
      <div
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`flex items-center justify-between px-4 py-3.5 ${hasDetail ? 'cursor-pointer hover:bg-slate-800' : ''} transition-colors`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {hasDetail ? (
            expanded
              ? <ChevronDown className="w-4 h-4 text-dark-text-muted shrink-0" />
              : <ChevronRight className="w-4 h-4 text-dark-text-muted shrink-0" />
          ) : <div className="w-4 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {issue.file && (
                <span className="text-accent-cyan font-mono text-sm">
                  {issue.file}{issue.line ? `:${issue.line}` : ''}
                </span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded font-bold shrink-0 ${config.badge}`}>
                {config.label}
              </span>
            </div>
            <p className="text-dark-text-secondary text-sm mt-1.5">{issue.message}</p>
          </div>
        </div>

        {/* 右侧：一键修复按钮，始终可见 */}
        {onFix && issue.diffSnippet && issue.file && (
          <button
            onClick={(e) => { e.stopPropagation(); onFix(issue); }}
            disabled={fixing}
            className="flex items-center gap-1.5 px-3 py-1.5 ml-3 rounded-md bg-score-green/20 text-score-green text-xs font-medium hover:bg-score-green/30 transition-colors disabled:opacity-40 shrink-0"
          >
            <Wrench className="w-3.5 h-3.5" />
            {fixing ? '修复中...' : '一键修复'}
          </button>
        )}
      </div>

      {/* 展开区：AI 建议 + Diff 预览 */}
      {expanded && hasDetail && (
        <div className="border-t border-dark-border px-4 py-3 bg-slate-900/50 space-y-2">
          {issue.fixSuggestion && (
            <div className="flex items-center gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-accent-cyan shrink-0" />
              <span className="text-accent-cyan text-xs font-medium">
                AI 建议：{issue.fixSuggestion}
              </span>
            </div>
          )}
          {issue.diffSnippet && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewDiff(issue); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent-blue/20 text-accent-blue text-xs font-medium hover:bg-accent-blue/30 transition-colors"
            >
              <Code2 className="w-3.5 h-3.5" />
              查看修复示例
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 维度分组 ── */
function DimensionGroup({ label, items, onViewDiff, onFix, fixingFile }: {
  label: string;
  items: Issue[];
  onViewDiff: (issue: Issue) => void;
  onFix?: (issue: Issue) => void;
  fixingFile?: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const fileIssues = items.filter((i) => i.file);
  if (fileIssues.length === 0) return null;

  const sorted = [...fileIssues].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });

  const errorCount = fileIssues.filter((i) => i.severity === 'error').length;
  const warnCount = fileIssues.filter((i) => i.severity === 'warning').length;
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_SHOW);
  const hasMore = sorted.length > INITIAL_SHOW;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-dark-text-muted" />
          : <ChevronRight className="w-4 h-4 text-dark-text-muted" />}
        <span className="text-sm font-medium text-dark-text">{label}</span>
        <span className="text-xs text-dark-text-muted">
          ({fileIssues.length} 项
          {errorCount > 0 && <span className="text-score-red ml-1">{errorCount} 高风险</span>}
          {warnCount > 0 && <span className="text-score-yellow ml-1">{warnCount} 中风险</span>})
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 ml-6 mt-1">
          {visible.map((issue, i) => (
            <IssueItem
              key={`${issue.file}-${issue.line}-${i}`}
              issue={issue}
              onViewDiff={onViewDiff}
              onFix={onFix}
              fixing={fixingFile === issue.file}
            />
          ))}
          {hasMore && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-accent-blue hover:underline py-1 text-left"
            >
              展开剩余 {sorted.length - INITIAL_SHOW} 项...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 主组件 ── */
export function IssueList({ issues, onFix, fixingFile }: IssueListProps) {
  const [diffIssue, setDiffIssue] = useState<Issue | null>(null);

  const totalFileIssues = issues.reduce(
    (sum, g) => sum + g.items.filter((i) => i.file).length, 0,
  );

  if (totalFileIssues === 0) {
    return (
      <div className="text-dark-text-muted text-sm py-4 text-center">
        未发现问题，代码健康状况良好
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 max-h-[700px] overflow-y-auto pr-1">
        {issues.map((g) => (
          <DimensionGroup
            key={g.dimension}
            label={g.label}
            items={g.items}
            onViewDiff={setDiffIssue}
            onFix={onFix}
            fixingFile={fixingFile}
          />
        ))}
      </div>
      {diffIssue && (
        <DiffViewer issue={diffIssue} onClose={() => setDiffIssue(null)} />
      )}
    </>
  );
}
