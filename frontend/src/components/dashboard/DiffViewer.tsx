import { useState } from 'react';
import { X, FileCode2 } from 'lucide-react';
import type { Issue } from '../../types/analysis';

interface DiffViewerProps {
  issue: Issue;
  onClose: () => void;
}

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'header';
  content: string;
  lineNum?: number;
}

/** 将 unified diff 字符串解析为结构化行 */
function parseDiff(raw: string): DiffLine[] {
  return raw.split('\n').map((line) => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return { type: 'header', content: line };
    }
    if (line.startsWith('@@')) {
      return { type: 'header', content: line };
    }
    if (line.startsWith('+')) {
      return { type: 'added', content: line.slice(1) };
    }
    if (line.startsWith('-')) {
      return { type: 'removed', content: line.slice(1) };
    }
    return { type: 'context', content: line };
  });
}

/** 将解析后的 diff 拆分为左侧（原始）和右侧（修复）行 */
function splitSides(lines: DiffLine[]): { left: DiffLine[]; right: DiffLine[] } {
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];

  // 先收集连续的 removed/added 块，再配对
  const contentLines = lines.filter((l) => l.type !== 'header');
  let i = 0;
  while (i < contentLines.length) {
    const line = contentLines[i];
    if (line.type === 'removed') {
      // 收集连续 removed
      const removedBlock: DiffLine[] = [];
      while (i < contentLines.length && contentLines[i].type === 'removed') {
        removedBlock.push(contentLines[i]);
        i++;
      }
      // 收集紧跟的 added
      const addedBlock: DiffLine[] = [];
      while (i < contentLines.length && contentLines[i].type === 'added') {
        addedBlock.push(contentLines[i]);
        i++;
      }
      // 配对输出
      const maxLen = Math.max(removedBlock.length, addedBlock.length);
      for (let j = 0; j < maxLen; j++) {
        left.push(removedBlock[j] ?? { type: 'context', content: '' });
        right.push(addedBlock[j] ?? { type: 'context', content: '' });
      }
      // 纯删除（无 added）时右侧显示提示
      if (addedBlock.length === 0 && removedBlock.length > 0) {
        right[right.length - removedBlock.length] = { type: 'added', content: '（已删除，无需替换）' };
      }
    } else if (line.type === 'added') {
      left.push({ type: 'context', content: '' });
      right.push(line);
      i++;
    } else {
      left.push(line);
      right.push(line);
      i++;
    }
  }
  return { left, right };
}

/** 简易关键词语法高亮（支持 Java + JS/TS） */
function highlightSyntax(code: string): string {
  // 先提取字符串和注释，用占位符替换，避免后续正则冲突
  const tokens: string[] = [];
  let escaped = code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 提取注释
  escaped = escaped.replace(/\/\/.*/g, (m) => {
    tokens.push(`<span class="diff-comment">${m}</span>`);
    return `\x00${tokens.length - 1}\x00`;
  });

  // 提取字符串
  escaped = escaped.replace(/(["'`])(?:(?!\1).)*?\1/g, (m) => {
    tokens.push(`<span class="diff-string">${m}</span>`);
    return `\x00${tokens.length - 1}\x00`;
  });

  // 关键词高亮
  escaped = escaped.replace(/\b(const|let|var|function|return|if|else|for|while|import|export|class|new|this|typeof|async|await|public|private|protected|static|final|void|int|long|double|float|boolean|String|throws|throw|try|catch|interface|extends|implements|package|abstract|synchronized|volatile|transient|enum|super|instanceof)\b/g,
    '<span class="diff-keyword">$1</span>');

  escaped = escaped.replace(/\b(true|false|null|undefined|NaN|System|log|Logger)\b/g,
    '<span class="diff-builtin">$1</span>');

  // 还原占位符
  escaped = escaped.replace(/\x00(\d+)\x00/g, (_, i) => tokens[Number(i)]);

  return escaped;
}

/** 单侧代码面板 */
function CodePanel({ title, lines, side }: {
  title: string;
  lines: DiffLine[];
  side: 'left' | 'right';
}) {
  const bgMap = {
    removed: 'bg-score-red/15',
    added: 'bg-score-green/15',
    context: '',
    header: '',
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-3 py-2 text-xs font-medium text-dark-text-secondary bg-dark-bg-tertiary border-b border-dark-border">
        {title}
      </div>
      <div className="flex-1 overflow-auto font-mono text-sm leading-6">
        {lines.map((line, i) => {
          const highlight = side === 'left' ? (line.type === 'removed' ? bgMap.removed : '') :
                            (line.type === 'added' ? bgMap.added : '');
          return (
            <div key={i} className={`flex ${highlight}`}>
              <span className="w-8 shrink-0 text-right pr-2 text-dark-text-muted select-none border-r border-dark-border">
                {line.content ? i + 1 : ''}
              </span>
              <span
                className="pl-2 whitespace-pre"
                dangerouslySetInnerHTML={{ __html: line.content ? highlightSyntax(line.content) : '&nbsp;' }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DiffViewer({ issue, onClose }: DiffViewerProps) {
  const diffLines = parseDiff(issue.diffSnippet ?? '');
  const { left, right } = splitSides(diffLines);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[96vw] max-w-[90vw] h-[85vh] flex flex-col rounded-xl bg-dark-bg-secondary border border-dark-border shadow-2xl overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-dark-bg-tertiary border-b border-dark-border">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode2 className="w-4 h-4 text-accent-cyan shrink-0" />
            <span className="text-sm font-medium text-dark-text font-mono">
              {issue.file}{issue.line ? `:${issue.line}` : ''}
            </span>
            {issue.message && (
              <span className="text-xs text-dark-text-muted truncate ml-2">
                {issue.message.length > 80 ? issue.message.slice(0, 80) + '...' : issue.message}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-dark-border transition-colors shrink-0 ml-2">
            <X className="w-4 h-4 text-dark-text-muted" />
          </button>
        </div>

        {/* AI 建议条 */}
        {issue.fixSuggestion && (
          <div className="px-4 py-2 bg-accent-cyan/10 border-b border-dark-border text-xs text-accent-cyan">
            💡 AI 修复建议：{issue.fixSuggestion}
          </div>
        )}

        {/* 左右对比面板 */}
        <div className="flex-1 flex overflow-hidden divide-x divide-dark-border min-h-0">
          <CodePanel title="原始代码 (Current Code)" lines={left} side="left" />
          <CodePanel title="AI 修复建议 (Proposed Fix)" lines={right} side="right" />
        </div>
      </div>
    </div>
  );
}
