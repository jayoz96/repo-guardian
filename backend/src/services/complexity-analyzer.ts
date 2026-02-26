import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import type { DimensionResult, Issue } from '../types/analysis.js';

const CODE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java',
  '.rb', '.go', '.rs', '.c', '.cpp', '.cs', '.php',
]);

const BRANCH_PATTERNS = [
  /\bif\s*\(/g,
  /\belse\s+if\s*\(/g,
  /\bwhile\s*\(/g,
  /\bfor\s*\(/g,
  /\bcase\s+/g,
  /\bcatch\s*\(/g,
  /\?\?/g,
  /\?\./g,
  /&&/g,
  /\|\|/g,
];

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__',
  'target', '.gradle', '.idea', '.mvn', 'bin', 'out', '.settings',
]);

async function collectFiles(dir: string, depth = 10): Promise<string[]> {
  if (depth <= 0) return [];
  const files: string[] = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(full, depth - 1));
    } else if (CODE_EXTS.has(extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

function computeComplexity(content: string): number {
  let complexity = 1;
  for (const pattern of BRANCH_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) complexity += matches.length;
  }
  return complexity;
}

const HIGH_COMPLEXITY = 25;
const MEDIUM_COMPLEXITY = 15;

export async function analyzeComplexity(projectPath: string): Promise<DimensionResult> {
  try {
    const files = await collectFiles(projectPath);
    const issues: Issue[] = [];

    for (const filePath of files) {
      const content = await readFile(filePath, 'utf-8');
      const relativePath = relative(projectPath, filePath).replace(/\\/g, '/');
      const complexity = computeComplexity(content);

      if (complexity >= HIGH_COMPLEXITY) {
        issues.push({
          severity: 'error',
          message: `[HighComplexity] 圈复杂度过高 (${complexity})，建议拆分函数`,
          file: relativePath,
          line: 1,
        });
      } else if (complexity >= MEDIUM_COMPLEXITY) {
        issues.push({
          severity: 'warning',
          message: `[MediumComplexity] 圈复杂度偏高 (${complexity})，建议关注`,
          file: relativePath,
          line: 1,
        });
      }
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    const weighted = errorCount * 2 + warnCount;
    const score = Math.max(10, Math.round(100 / (1 + weighted / 70)));

    return { score, issues };
  } catch {
    return {
      score: 80,
      issues: [{ severity: 'info', message: '复杂度分析未能完成' }],
    };
  }
}
