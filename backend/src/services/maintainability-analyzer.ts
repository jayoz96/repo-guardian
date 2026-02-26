import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import type { DimensionResult, Issue } from '../types/analysis.js';

const CODE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.py', '.java',
  '.rb', '.go', '.rs', '.c', '.cpp', '.cs', '.php',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__',
  'target', '.gradle', '.idea', '.mvn', 'bin', 'out', '.settings',
]);

const MAX_FILE_LINES = 500;
const MAX_FUNCTION_LINES = 80;

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

export async function analyzeMaintainability(projectPath: string): Promise<DimensionResult> {
  try {
    const files = await collectFiles(projectPath);
    const issues: Issue[] = [];

    for (const filePath of files) {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const relativePath = relative(projectPath, filePath).replace(/\\/g, '/');

      // 检查文件过长
      if (lines.length > MAX_FILE_LINES) {
        issues.push({
          severity: 'warning',
          message: `[FileTooLong] 文件过长 (${lines.length} 行)，建议拆分模块`,
          file: relativePath,
          line: 1,
        });
      }

      // 检查长函数（简单启发式：连续缩进块）
      let blockStart = -1;
      let blockDepth = 0;
      for (let i = 0; i < lines.length; i++) {
        const indent = lines[i].search(/\S/);
        if (indent >= 2 && blockStart === -1) {
          blockStart = i;
          blockDepth = indent;
        } else if (indent < blockDepth && blockStart !== -1) {
          const blockLen = i - blockStart;
          if (blockLen > MAX_FUNCTION_LINES) {
            issues.push({
              severity: 'warning',
              message: `[LongCodeBlock] 代码块过长 (${blockLen} 行)，建议提取函数`,
              file: relativePath,
              line: blockStart + 1,
            });
          }
          blockStart = -1;
        }
      }
    }

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    const weighted = errorCount * 3 + warnCount;
    const score = Math.max(10, Math.round(100 / (1 + weighted / 50)));

    return { score, issues };
  } catch {
    return {
      score: 85,
      issues: [{ severity: 'info', message: '可维护性分析未能完成' }],
    };
  }
}
