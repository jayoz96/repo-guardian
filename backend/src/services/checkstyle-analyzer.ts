import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { DimensionResult, Issue } from '../types/analysis.js';

const JAVA_EXT = '.java';
const MAX_FILES = 100;

interface StyleRule {
  id: string;
  check: (line: string, lineNum: number, ctx: FileContext) => string | null;
}

interface FileContext {
  lines: string[];
  filePath: string;
}

/** Java 编码规范检查规则集（对标 Google Java Style） */
const STYLE_RULES: StyleRule[] = [
  {
    id: 'LineLength',
    check: (line) =>
      line.length > 150 ? `行长度 ${line.length} 超过 150 字符限制` : null,
  },
  {
    id: 'TabCharacter',
    check: (line) =>
      line.includes('\t') ? '使用了 Tab 缩进，应使用空格' : null,
  },
  // TrailingWhitespace 已移除：噪音过大，对代码质量影响极小
  {
    id: 'NamingConvention',
    check: (line) => {
      const classMatch = line.match(/^\s*(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+([A-Za-z_]\w*)/);
      if (classMatch && !/^[A-Z][a-zA-Z0-9]*$/.test(classMatch[1])) {
        return `类名 "${classMatch[1]}" 应使用 PascalCase`;
      }
      const constMatch = line.match(/^\s*(?:public|private|protected)?\s*static\s+final\s+\w+\s+([a-zA-Z_]\w*)\s*=/);
      if (constMatch && !/^[A-Z][A-Z0-9_]*$/.test(constMatch[1])) {
        return `常量 "${constMatch[1]}" 应使用 UPPER_SNAKE_CASE`;
      }
      return null;
    },
  },
  {
    id: 'BraceStyle',
    check: (line) => {
      const trimmed = line.trim();
      if (trimmed === '{' && !line.match(/^\s{0,4}\{/)) return null;
      if (/^\s*(if|else|for|while|do|try|catch|finally|switch)\b/.test(trimmed)) {
        if (trimmed.endsWith(')') || trimmed.endsWith(') ')) {
          return '左花括号应与语句在同一行（K&R 风格）';
        }
      }
      return null;
    },
  },
  {
    id: 'StarImport',
    check: (line) =>
      /^\s*import\s+[\w.]+\.\*\s*;/.test(line) ? '避免使用通配符 import（star import）' : null,
  },
  {
    id: 'MissingJavadoc',
    check: (line, lineNum, ctx) => {
      if (/^\s*public\s+(class|interface|enum)\s/.test(line)) {
        const prev = lineNum > 1 ? ctx.lines[lineNum - 2].trim() : '';
        if (!prev.endsWith('*/') && !prev.startsWith('//')) {
          return '公共类/接口缺少 Javadoc 注释';
        }
      }
      return null;
    },
  },
  {
    id: 'EmptyBlock',
    check: (line) =>
      /\{\s*\}/.test(line) && /\b(if|else|for|while|try|catch)\b/.test(line)
        ? '空代码块，应添加注释说明或删除'
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
  return Math.max(10, Math.round(100 / (1 + weighted / 120)));
}

export async function runCheckstyle(projectPath: string): Promise<DimensionResult> {
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
      for (const rule of STYLE_RULES) {
        const msg = rule.check(lines[i], i + 1, ctx);
        if (msg) {
          issues.push({
            severity: rule.id === 'NamingConvention' ? 'error' : rule.id === 'MissingJavadoc' ? 'info' : 'warning',
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
