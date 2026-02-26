import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { DimensionResult, Issue } from '../types/analysis.js';

const JAVA_EXT = '.java';
const MAX_FILES = 100;

interface QualityRule {
  id: string;
  severity: Issue['severity'];
  check: (line: string, lineNum: number, ctx: FileContext) => string | null;
}

interface FileContext {
  lines: string[];
  filePath: string;
}

/** Java 代码质量检查规则集（对标 PMD BestPractices + ErrorProne） */
const QUALITY_RULES: QualityRule[] = [
  {
    id: 'UnusedImport',
    severity: 'warning',
    check: (line, _ln, ctx) => {
      const m = line.match(/^\s*import\s+(?:static\s+)?([\w.]+\.(\w+))\s*;/);
      if (!m) return null;
      const className = m[2];
      const body = ctx.lines.filter((l) => !l.trimStart().startsWith('import ')).join('\n');
      if (!body.includes(className)) {
        return `未使用的 import: ${m[1]}`;
      }
      return null;
    },
  },
  {
    id: 'EmptyCatchBlock',
    severity: 'error',
    check: (line, lineNum, ctx) => {
      if (!/\bcatch\s*\(/.test(line)) return null;
      const next = lineNum < ctx.lines.length ? ctx.lines[lineNum].trim() : '';
      if (next === '}') return '空的 catch 块，异常被静默吞掉';
      return null;
    },
  },
  {
    id: 'SystemPrintln',
    severity: 'warning',
    check: (line) =>
      /System\.(out|err)\.(print|println)\s*\(/.test(line)
        ? '使用了 System.out/err，应替换为日志框架（如 SLF4J）'
        : null,
  },
  {
    id: 'HardcodedPassword',
    severity: 'error',
    check: (line) =>
      /(?:password|passwd|pwd|secret)\s*=\s*"[^"]+"/i.test(line)
        ? '疑似硬编码密码，应使用配置文件或环境变量'
        : null,
  },
  {
    id: 'MagicNumber',
    severity: 'info',
    check: (line) => {
      if (/^\s*(import|package|\/\/|\*|return|case|enum)\b/.test(line)) return null;
      if (/\bstatic\s+final\b/.test(line)) return null;
      if (/^\s*@/.test(line)) return null;
      // 只标记 4 位及以上的非常见数字
      const m = line.match(/[^.\w](\d{4,})[^.\d]/);
      if (m && !['1000', '1024', '2048', '4096', '8080', '3306', '8443', '6379', '5432', '27017'].includes(m[1])) {
        return `魔法数字 ${m[1]}，建议提取为命名常量`;
      }
      return null;
    },
  },
  {
    id: 'LongMethod',
    severity: 'warning',
    check: (line, lineNum, ctx) => {
      const methodMatch = line.match(/^\s*(?:public|private|protected)\s+(?:static\s+)?(?:\w+\s+)(\w+)\s*\(/);
      if (!methodMatch) return null;
      let braceCount = 0;
      let started = false;
      for (let i = lineNum - 1; i < ctx.lines.length; i++) {
        for (const ch of ctx.lines[i]) {
          if (ch === '{') { braceCount++; started = true; }
          if (ch === '}') braceCount--;
        }
        if (started && braceCount === 0) {
          const length = i - (lineNum - 1) + 1;
          if (length > 80) return `方法 "${methodMatch[1]}" 长度 ${length} 行，超过 80 行建议拆分`;
          return null;
        }
      }
      return null;
    },
  },
  {
    id: 'TodoComment',
    severity: 'info',
    check: (line) =>
      /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(line)
        ? '存在待处理的 TODO/FIXME 注释'
        : null,
  },
];

/** 递归收集 .java 文件 */
async function collectJavaFiles(dir: string, depth = 10): Promise<string[]> {
  const files: string[] = [];

  async function walk(d: string, level: number) {
    if (level <= 0 || files.length >= MAX_FILES) return;
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || ['node_modules','target','build','out','bin','.gradle','.idea','.mvn','.settings','vendor','dist'].includes(e.name)) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) {
        await walk(full, level - 1);
      } else if (e.name.endsWith(JAVA_EXT)) {
        files.push(full);
      }
      if (files.length >= MAX_FILES) return;
    }
  }

  await walk(dir, depth);
  return files;
}

function computeScore(issues: Issue[]): number {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.filter((i) => i.severity === 'warning').length;
  const weighted = errors * 3 + warns;
  return Math.max(10, Math.round(100 / (1 + weighted / 50)));
}

export async function runPmd(projectPath: string): Promise<DimensionResult> {
  const javaFiles = await collectJavaFiles(projectPath);

  if (javaFiles.length === 0) {
    return { score: 100, issues: [{ severity: 'info', message: '未发现 Java 文件' }] };
  }

  const issues: Issue[] = [];

  for (const filePath of javaFiles) {
    let content: string;
    try { content = await readFile(filePath, 'utf-8'); } catch { continue; }

    const lines = content.split('\n');
    const relPath = relative(projectPath, filePath).replace(/\\/g, '/');
    const ctx: FileContext = { lines, filePath: relPath };

    for (let i = 0; i < lines.length; i++) {
      for (const rule of QUALITY_RULES) {
        const msg = rule.check(lines[i], i + 1, ctx);
        if (msg) {
          issues.push({
            severity: rule.severity,
            message: `[${rule.id}] ${msg}`,
            file: relPath,
            line: i + 1,
          });
        }
      }
    }
  }

  return { score: computeScore(issues), issues };
}
