import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface FixRequest {
  projectPath: string;
  file: string;
  line: number;
  diffSnippet: string;
}

interface FixResult {
  success: boolean;
  file: string;
  message: string;
}

/**
 * 从 unified diff 中提取要删除的行和要添加的行
 */
function parseDiffActions(diff: string): { removals: string[]; additions: string[] } {
  const removals: string[] = [];
  const additions: string[] = [];

  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue;
    if (line.startsWith('-')) removals.push(line.slice(1));
    else if (line.startsWith('+')) additions.push(line.slice(1));
  }

  return { removals, additions };
}

/**
 * 对单个文件应用 AI 生成的修复
 */
export async function applyFix(req: FixRequest): Promise<FixResult> {
  const filePath = join(req.projectPath, req.file);

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const { removals, additions } = parseDiffActions(req.diffSnippet);

    // 定位修复起始行（0-indexed）
    const startIdx = Math.max(0, req.line - 1);

    // 查找并替换匹配的行
    let matchIdx = -1;
    if (removals.length > 0) {
      // 在起始行附近搜索匹配（容忍 ±5 行偏移）
      for (let offset = 0; offset <= 5; offset++) {
        for (const dir of [0, -1, 1]) {
          const idx = startIdx + offset * (dir || 1);
          if (idx < 0 || idx >= lines.length) continue;
          if (lines[idx].trim() === removals[0].trim()) {
            matchIdx = idx;
            break;
          }
        }
        if (matchIdx >= 0) break;
      }
    }

    let newLines: string[];

    if (matchIdx >= 0) {
      // 精确替换：删除旧行，插入新行
      const removeCount = removals.length;
      newLines = [
        ...lines.slice(0, matchIdx),
        ...additions,
        ...lines.slice(matchIdx + removeCount),
      ];
    } else if (additions.length > 0 && removals.length === 0) {
      // 纯新增行
      newLines = [
        ...lines.slice(0, startIdx),
        ...additions,
        ...lines.slice(startIdx),
      ];
    } else {
      // 无法精确匹配时，在目标行做行级替换
      const removeCount = Math.min(removals.length, lines.length - startIdx);
      newLines = [
        ...lines.slice(0, startIdx),
        ...additions,
        ...lines.slice(startIdx + removeCount),
      ];
    }

    await writeFile(filePath, newLines.join('\n'), 'utf-8');

    return {
      success: true,
      file: req.file,
      message: `已修复 ${req.file}:${req.line}`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      file: req.file,
      message: `修复失败：${msg}`,
    };
  }
}
