export type Severity = 'error' | 'warning' | 'info';

export type Dimension =
  | 'security'
  | 'quality'
  | 'complexity'
  | 'maintainability'
  | 'standards';

export interface Issue {
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  fixSuggestion?: string;
  diffSnippet?: string;
}

export interface DimensionResult {
  score: number;
  issues: Issue[];
}

export type DepNodeType = 'controller' | 'service' | 'mapper' | 'table';
export interface DepNode { id: string; type: DepNodeType; }
export interface DepEdge { source: string; target: string; }
export interface DependencyGraph { nodes: DepNode[]; edges: DepEdge[]; }

export interface ProjectOverview {
  description?: string;
  name: string;
  language: string;
  buildTool: string;
  totalFiles: number;
  totalLines: number;
  fileBreakdown: { ext: string; count: number }[];
  topDirs: string[];
  apis: { method: string; path: string; file: string; desc: string; tables?: string[] }[];
  dbTables: { name: string; comment: string; fields: { name: string; type: string; comment: string }[] }[];
  dependencies: { name: string; version: string }[];
  frameworks: string[];
  dependencyGraph?: DependencyGraph;
}

export interface AnalysisResult {
  security: DimensionResult;
  quality: DimensionResult;
  complexity: DimensionResult;
  maintainability: DimensionResult;
  standards: DimensionResult;
  analyzedAt: string;
  projectPath: string;
  summary?: string;
  overview?: ProjectOverview;
}
