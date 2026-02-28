import { useState, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  Code2,
  GitBranch,
  Wrench,
  BookOpen,
} from 'lucide-react';
import { Header } from './Header';
import { ScoreCard } from './ScoreCard';
import { RadarChart } from '../charts/RadarChart';
import { ScanInput } from './ScanInput';
import { IssueList } from './IssueList';
import { AiSummary } from './AiSummary';
import { Toast } from './Toast';
import { ProjectOverview } from './ProjectOverview';
import { RadarSkeleton, ScoreCardsSkeleton, SummarySkeleton, IssueListSkeleton } from './Skeleton';
import { ScanHistory, saveToHistory, loadHistory } from './ScanHistory';
import type { ScanRecord } from './ScanHistory';
import { TrendChart } from '../charts/TrendChart';
import { IssueHeatmap } from './IssueHeatmap';
import type { AnalysisResult, Dimension, Issue } from '../../types/analysis';

const DIMENSION_CONFIG: {
  key: Dimension;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  { key: 'security', label: '安全性', desc: '检测注入、XSS、硬编码密码等安全漏洞', icon: <ShieldCheck className="w-5 h-5" /> },
  { key: 'quality', label: '代码质量', desc: '未使用代码、空 catch、魔法数字等质量问题', icon: <Code2 className="w-5 h-5" /> },
  { key: 'complexity', label: '复杂度', desc: '圈复杂度分析，衡量分支嵌套深度', icon: <GitBranch className="w-5 h-5" /> },
  { key: 'maintainability', label: '可维护性', desc: '文件长度、函数体量，影响长期维护成本', icon: <Wrench className="w-5 h-5" /> },
  { key: 'standards', label: '规范性', desc: '命名规范、缩进风格、import 规则等一致性', icon: <BookOpen className="w-5 h-5" /> },
];

const MOCK_SCORES: Record<Dimension, number> = {
  security: 100,
  quality: 100,
  complexity: 100,
  maintainability: 100,
  standards: 100,
};

const STATUS_TEXTS = [
  '正在拉取远程代码...',
  '正在进行 AI 深度审计...',
];

const API_BASE = 'http://localhost:3001/api/v1';

export function Dashboard() {
  const [analysisData, setAnalysisData] = useState<AnalysisResult | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [fixingFile, setFixingFile] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [history, setHistory] = useState<ScanRecord[]>(loadHistory);
  const [issueView, setIssueView] = useState<'list' | 'heatmap'>('list');
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const lastPathRef = useRef('');

  const handleScan = useCallback(async (path: string) => {
    setScanning(true);
    setError('');
    setAnalysisData(undefined);

    // 动态切换状态文字
    let idx = 0;
    setStatusText(STATUS_TEXTS[0]);
    timerRef.current = setInterval(() => {
      idx = (idx + 1) % STATUS_TEXTS.length;
      setStatusText(STATUS_TEXTS[idx]);
    }, 3000);

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: path }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `请求失败 (${res.status})`);
      }

      const result: AnalysisResult = await res.json();
      setAnalysisData(result);

      // 保存扫描历史
      const dims = [result.security, result.quality, result.complexity, result.maintainability, result.standards];
      const avg = Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
      saveToHistory({
        path,
        time: new Date().toLocaleString('zh-CN'),
        avgScore: avg,
        scores: {
          security: result.security.score,
          quality: result.quality.score,
          complexity: result.complexity.score,
          maintainability: result.maintainability.score,
          standards: result.standards.score,
        },
      });
      setHistory(loadHistory());
      lastPathRef.current = path;
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败');
    } finally {
      setScanning(false);
      clearInterval(timerRef.current);
    }
  }, []);

  const handleFix = useCallback(async (issue: Issue) => {
    if (!issue.file || !issue.diffSnippet || !lastPathRef.current) return;
    setFixingFile(issue.file);
    try {
      const res = await fetch(`${API_BASE}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: lastPathRef.current,
          file: issue.file,
          line: issue.line,
          diffSnippet: issue.diffSnippet,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: `已修复 ${issue.file}`, type: 'success' });
      } else {
        setToast({ message: data.message || '修复失败', type: 'error' });
      }
    } catch {
      setToast({ message: '修复请求失败', type: 'error' });
    } finally {
      setFixingFile(null);
    }
  }, []);

  const scores = analysisData
    ? DIMENSION_CONFIG.map((d) => ({ ...d, score: analysisData[d.key].score, issueCount: analysisData[d.key].issues.length }))
    : DIMENSION_CONFIG.map((d) => ({ ...d, score: MOCK_SCORES[d.key], issueCount: 0 }));

  const issueGroups = analysisData
    ? DIMENSION_CONFIG.map((d) => ({
        dimension: d.key,
        label: d.label,
        items: analysisData[d.key].issues,
      }))
    : [];

  return (
    <div className="min-h-screen flex flex-col bg-dark-bg">
      <Header scanning={scanning} />

      <main className="flex-1 p-6 space-y-6">
        {/* 扫描输入 + 历史 */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <ScanInput onScan={handleScan} scanning={scanning} statusText={statusText} />
          </div>
          <ScanHistory onSelect={(p) => handleScan(p)} />
        </div>

        {error && (
          <div className="rounded-lg bg-score-red/10 border border-score-red/30 px-4 py-3 text-score-red text-sm">
            {error}
          </div>
        )}

        {/* 雷达图 + 评分卡片 */}
        {scanning ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <RadarSkeleton />
            <ScoreCardsSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-dark-border bg-dark-bg-secondary p-5 min-h-[400px] relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-accent-cyan/[0.03] to-accent-blue/[0.03] pointer-events-none" />
              <h2 className="text-base font-medium mb-2 text-dark-text-secondary flex items-center gap-2 relative">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan inline-block" />
                五维健康雷达
              </h2>
              <div className="h-[360px] relative">
                <RadarChart data={analysisData} />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {scores.map((item, i) => (
                <ScoreCard
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  desc={item.desc}
                  score={item.score}
                  issueCount={item.issueCount}
                  index={i}
                />
              ))}
            </div>
          </div>
        )}

        {/* 趋势追踪 */}
        {!scanning && <TrendChart history={history} />}

        {/* 项目概览 */}
        {analysisData?.overview && (
          <ProjectOverview overview={analysisData.overview} />
        )}

        {/* AI 体检总结 */}
        {scanning ? (
          <SummarySkeleton />
        ) : analysisData?.summary ? (
          <AiSummary summary={analysisData.summary} />
        ) : null}

        {/* 问题列表 */}
        {scanning ? (
          <IssueListSkeleton />
        ) : (
          <div className="rounded-xl bg-dark-bg-secondary border border-dark-border p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-medium text-dark-text-secondary">
                问题列表
              </h2>
              {issueGroups.length > 0 && (
                <div className="flex gap-1 bg-dark-bg-tertiary rounded-lg p-0.5">
                  <button
                    onClick={() => setIssueView('list')}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${issueView === 'list' ? 'bg-dark-bg-secondary text-dark-text' : 'text-dark-text-muted hover:text-dark-text'}`}
                  >
                    列表
                  </button>
                  <button
                    onClick={() => setIssueView('heatmap')}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${issueView === 'heatmap' ? 'bg-dark-bg-secondary text-dark-text' : 'text-dark-text-muted hover:text-dark-text'}`}
                  >
                    热力图
                  </button>
                </div>
              )}
            </div>
            {issueGroups.length > 0 ? (
              issueView === 'list'
                ? <IssueList issues={issueGroups} onFix={handleFix} fixingFile={fixingFile} />
                : <IssueHeatmap issues={issueGroups} />
            ) : (
              <p className="text-dark-text-muted text-sm">
                点击"开始扫描"以分析代码库健康状况
              </p>
            )}
          </div>
        )}
      </main>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}