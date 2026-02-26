import { useState, useMemo } from 'react';
import {
  FolderTree, FileCode2, Layers, Hammer, Hash, FileText,
  Globe, Database, ChevronDown, ChevronRight, Boxes, X, Search,
} from 'lucide-react';
import type { ProjectOverview as OverviewType } from '../../types/analysis';

interface Props {
  overview: OverviewType;
}

type TableInfo = OverviewType['dbTables'][number];

/** 简单模糊匹配：将 query 拆成字符，按顺序匹配 target */
function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true;
  const t = target.toLowerCase();
  const q = query.toLowerCase();
  // 先尝试子串匹配
  if (t.includes(q)) return true;
  // 再尝试字符顺序模糊匹配
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const found = t.indexOf(q[qi], ti);
    if (found < 0) return false;
    ti = found + 1;
  }
  return true;
}

const EXT_COLORS: Record<string, string> = {
  '.java': 'bg-orange-500', '.ts': 'bg-blue-500', '.tsx': 'bg-blue-400',
  '.js': 'bg-yellow-500', '.jsx': 'bg-yellow-400', '.py': 'bg-green-500',
  '.vue': 'bg-emerald-500', '.go': 'bg-cyan-500', '.xml': 'bg-purple-400',
  '.json': 'bg-slate-400', '.css': 'bg-pink-400', '.html': 'bg-red-400',
  '.sql': 'bg-indigo-400', '.md': 'bg-gray-400',
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-score-green bg-score-green/15',
  POST: 'text-accent-cyan bg-accent-cyan/15',
  PUT: 'text-score-yellow bg-score-yellow/15',
  DELETE: 'text-score-red bg-score-red/15',
  PATCH: 'text-purple-400 bg-purple-400/15',
  ANY: 'text-dark-text-secondary bg-dark-bg-tertiary',
};

function formatLines(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}

export function ProjectOverview({ overview }: Props) {
  const maxCount = Math.max(...overview.fileBreakdown.map((f) => f.count), 1);
  const [apisExpanded, setApisExpanded] = useState(false);
  const [tablesExpanded, setTablesExpanded] = useState(false);
  const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null);
  const [apiSearch, setApiSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  const filteredApis = useMemo(() => {
    if (!apiSearch) return overview.apis;
    return overview.apis.filter((a) =>
      fuzzyMatch(a.method, apiSearch) ||
      fuzzyMatch(a.path, apiSearch) ||
      fuzzyMatch(a.desc, apiSearch) ||
      fuzzyMatch(a.file, apiSearch) ||
      (a.tables?.some((t) => fuzzyMatch(t, apiSearch)) ?? false)
    );
  }, [overview.apis, apiSearch]);

  const filteredTables = useMemo(() => {
    if (!tableSearch) return overview.dbTables;
    return overview.dbTables.filter((t) =>
      fuzzyMatch(t.name, tableSearch) ||
      fuzzyMatch(t.comment, tableSearch) ||
      t.fields.some((f) => fuzzyMatch(f.name, tableSearch) || fuzzyMatch(f.comment, tableSearch))
    );
  }, [overview.dbTables, tableSearch]);

  return (
    <div className="rounded-xl bg-dark-bg-secondary border border-dark-border p-5 space-y-5">
      <h2 className="text-base font-medium text-dark-text-secondary flex items-center gap-2">
        <Layers className="w-4 h-4 text-accent-cyan" />
        项目概览
      </h2>

      {/* 基本信息 + 技术栈 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-3">
          <SectionLabel text="基本信息" />
          <div className="grid grid-cols-2 gap-3">
            <InfoItem icon={<FolderTree className="w-3.5 h-3.5" />} label="项目名称" value={overview.name} />
            <InfoItem icon={<FileCode2 className="w-3.5 h-3.5" />} label="主要语言" value={overview.language} />
            <InfoItem icon={<Hammer className="w-3.5 h-3.5" />} label="构建工具" value={overview.buildTool} />
            <InfoItem icon={<Hash className="w-3.5 h-3.5" />} label="代码文件" value={`${overview.totalFiles} 个`} />
            <InfoItem icon={<FileText className="w-3.5 h-3.5" />} label="代码行数" value={formatLines(overview.totalLines)} />
          </div>
        </div>

        {/* 技术框架标签 */}
        {overview.frameworks.length > 0 && (
          <div className="space-y-3">
            <SectionLabel text="技术框架" />
            <div className="flex flex-wrap gap-2">
              {overview.frameworks.map((fw) => (
                <span key={fw} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-cyan/10 border border-accent-cyan/20 text-accent-cyan text-xs font-medium">
                  <Boxes className="w-3 h-3" />
                  {fw}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 文件类型分布 + 目录结构 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {overview.fileBreakdown.length > 0 && (
          <div>
            <SectionLabel text="文件类型分布" />
            <div className="space-y-1.5 mt-2">
              {overview.fileBreakdown.map((f) => (
                <div key={f.ext} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-right text-dark-text-muted font-mono">{f.ext}</span>
                  <div className="flex-1 h-4 bg-dark-bg-tertiary rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${EXT_COLORS[f.ext] ?? 'bg-slate-500'}`}
                      style={{ width: `${(f.count / maxCount) * 100}%`, minWidth: '4px' }}
                    />
                  </div>
                  <span className="w-8 text-dark-text-secondary tabular-nums">{f.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {overview.topDirs.length > 0 && (
          <div>
            <SectionLabel text="顶层目录" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {overview.topDirs.map((d) => (
                <span key={d} className="px-2 py-0.5 rounded bg-dark-bg-tertiary text-dark-text-secondary text-xs font-mono">
                  {d}/
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* API 端点 */}
      {overview.apis.length > 0 && (
        <div>
          <button
            onClick={() => setApisExpanded(!apisExpanded)}
            className="flex items-center gap-1.5 text-sm text-dark-text-muted hover:text-dark-text-secondary transition-colors mb-2 font-medium"
          >
            {apisExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Globe className="w-3.5 h-3.5" />
            <span>API 端点</span>
            <span className="ml-1 px-1.5 py-0.5 rounded bg-dark-bg-tertiary text-[10px] tabular-nums">{overview.apis.length}</span>
          </button>
          {apisExpanded && (
            <div className="ml-5 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-text-muted" />
                <input
                  type="text"
                  value={apiSearch}
                  onChange={(e) => setApiSearch(e.target.value)}
                  placeholder="搜索接口路径、方法、描述、表名..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-dark-bg-tertiary border border-dark-border text-dark-text text-xs placeholder:text-dark-text-muted focus:outline-none focus:border-accent-cyan/50"
                />
              </div>
              {filteredApis.length === 0 ? (
                <p className="text-dark-text-muted text-xs py-3 text-center">无匹配结果</p>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredApis.map((api, i) => (
                    <div key={i} className="flex flex-col gap-0.5 py-1.5 px-3 rounded-lg bg-dark-bg-tertiary/40">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-bold shrink-0 ${METHOD_COLORS[api.method] ?? METHOD_COLORS.ANY}`}>
                          {api.method}
                        </span>
                        <span className="text-dark-text font-mono text-sm">{api.path}</span>
                        <span className="text-dark-text-muted truncate ml-auto text-[11px]">{api.file}</span>
                      </div>
                      {api.desc && (
                        <p className="text-dark-text-secondary text-xs ml-[52px] leading-relaxed">{api.desc}</p>
                      )}
                      {api.tables && api.tables.length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-[52px] mt-0.5">
                          {api.tables.map((t) => {
                            const tableInfo = overview.dbTables.find((db) => db.name === t)
                              ?? { name: t, comment: '', fields: [] };
                            return (
                              <button
                                key={t}
                                onClick={() => setSelectedTable(tableInfo)}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-mono hover:bg-purple-500/25 hover:border-purple-500/40 cursor-pointer transition-colors"
                              >
                                <Database className="w-2.5 h-2.5" />
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 数据库表 */}
      {overview.dbTables.length > 0 && (
        <div>
          <button
            onClick={() => setTablesExpanded(!tablesExpanded)}
            className="flex items-center gap-1.5 text-sm text-dark-text-muted hover:text-dark-text-secondary transition-colors mb-2 font-medium"
          >
            {tablesExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Database className="w-3.5 h-3.5" />
            <span>数据库表</span>
            <span className="ml-1 px-1.5 py-0.5 rounded bg-dark-bg-tertiary text-[10px] tabular-nums">{overview.dbTables.length}</span>
          </button>
          {tablesExpanded && (
            <div className="ml-5 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-text-muted" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="搜索表名、字段名、注释..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-dark-bg-tertiary border border-dark-border text-dark-text text-xs placeholder:text-dark-text-muted focus:outline-none focus:border-purple-400/50"
                />
              </div>
              {filteredTables.length === 0 ? (
                <p className="text-dark-text-muted text-xs py-3 text-center">无匹配结果</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {filteredTables.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setSelectedTable(t)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-mono hover:bg-purple-500/25 hover:border-purple-500/40 transition-colors cursor-pointer"
                    >
                      <Database className="w-3 h-3" />
                      {t.name}
                      {t.fields.length > 0 && (
                        <span className="text-purple-400/60 text-[10px] ml-0.5">({t.fields.length})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 表字段弹窗 */}
      {selectedTable && (
        <TableFieldModal table={selectedTable} onClose={() => setSelectedTable(null)} />
      )}
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <p className="text-sm text-dark-text-muted font-medium">{text}</p>;
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-dark-text-muted">{icon}</span>
      <div>
        <p className="text-[11px] text-dark-text-muted leading-none mb-0.5">{label}</p>
        <p className="text-sm text-dark-text font-medium">{value}</p>
      </div>
    </div>
  );
}

function TableFieldModal({ table, onClose }: { table: TableInfo; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-dark-bg-secondary border border-purple-500/30 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            <h3 className="text-base font-bold text-dark-text font-mono">{table.name}</h3>
            {table.comment && (
              <span className="text-dark-text-secondary text-sm ml-2">{table.comment}</span>
            )}
          </div>
          <button onClick={onClose} className="text-dark-text-muted hover:text-dark-text transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 字段列表 */}
        <div className="overflow-y-auto flex-1 p-5">
          {table.fields.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-dark-text-muted text-xs border-b border-dark-border">
                  <th className="text-left pb-2 pr-4 font-medium">字段名</th>
                  <th className="text-left pb-2 pr-4 font-medium">类型</th>
                  <th className="text-left pb-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {table.fields.map((field, i) => (
                  <tr key={i} className="border-b border-dark-border/50 hover:bg-dark-bg-tertiary/30">
                    <td className="py-2 pr-4 font-mono text-purple-300">{field.name}</td>
                    <td className="py-2 pr-4 font-mono text-dark-text-secondary text-xs">{field.type}</td>
                    <td className="py-2 text-dark-text-secondary">{field.comment || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-dark-text-muted text-sm text-center py-8">
              该表来自 MyBatis XML 映射，暂无字段详情
            </p>
          )}
        </div>

        {/* 底部统计 */}
        <div className="px-5 py-3 border-t border-dark-border text-dark-text-muted text-xs">
          共 {table.fields.length} 个字段
        </div>
      </div>
    </div>
  );
}
