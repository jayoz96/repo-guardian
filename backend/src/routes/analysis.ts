import { Router } from 'express';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runSemgrep } from '../services/semgrep-analyzer.js';
import { runEslint } from '../services/eslint-analyzer.js';
import { runCheckstyle } from '../services/checkstyle-analyzer.js';
import { runPmd } from '../services/pmd-analyzer.js';
import { analyzeComplexity } from '../services/complexity-analyzer.js';
import { analyzeMaintainability } from '../services/maintainability-analyzer.js';
import { enrichWithAI } from '../services/ai-agent.js';
import { applyFix } from '../services/auto-fixer.js';
import { collectOverview } from '../services/project-overview.js';
import { isGitHubUrl, isGitUrl, cloneRepo, cleanupRepo } from '../services/git-service.js';
import { getSpoonKnifeDemoResult } from '../services/demo-data.js';
import type { AnalysisResult, DimensionResult } from '../types/analysis.js';

/** 递归检测项目主要语言（Java vs JS/TS） */
async function detectLanguage(dir: string, depth = 10): Promise<'java' | 'js'> {
  let javaCount = 0;
  let jsCount = 0;

  const SKIP = new Set([
    'node_modules', '.git', 'dist', 'target', 'build', 'out',
    'bin', '.gradle', '.idea', '.mvn', '__pycache__', 'vendor',
  ]);

  async function walk(d: string, level: number) {
    if (level <= 0) return;
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) {
        await walk(full, level - 1);
      } else if (e.name.endsWith('.java')) {
        javaCount++;
      } else if (/\.(js|ts|jsx|tsx)$/.test(e.name)) {
        jsCount++;
      } else if (e.name === 'pom.xml' || e.name === 'build.gradle') {
        // 构建文件是 Java 项目的强信号
        javaCount += 50;
      }
      if (javaCount + jsCount > 200) return;
    }
  }

  await walk(dir, depth);
  return javaCount > jsCount ? 'java' : 'js';
}

const router = Router();

router.post('/analyze', async (req, res) => {
  const { projectPath } = req.body as { projectPath?: string };

  if (!projectPath || typeof projectPath !== 'string') {
    res.status(400).json({ error: 'projectPath is required' });
    return;
  }

  let localPath = projectPath.trim();
  let clonedDir: string | null = null;

  try {
    // 如果是 Git 远程仓库链接，先克隆到临时目录
    if (isGitUrl(localPath)) {
      try {
        clonedDir = await cloneRepo(localPath);
        localPath = clonedDir;
      } catch (cloneErr) {
        // 克隆失败：仅 GitHub 地址回退演示数据，其他透传具体错误
        if (isGitHubUrl(projectPath)) {
          const cloneLang = await detectLanguage(localPath).catch(() => 'js' as const);
          const demoResult = enrichWithAI(getSpoonKnifeDemoResult(projectPath), cloneLang);
          res.json(demoResult);
          return;
        }
        throw cloneErr;
      }
    }

    // 自动检测项目语言，选择对应的分析工具链
    const lang = await detectLanguage(localPath);

    let qualityResult: DimensionResult;
    let standardsResult: DimensionResult;

    const [securityResult, complexityResult, maintainabilityResult, overview] =
      await Promise.all([
        runSemgrep(localPath),
        analyzeComplexity(localPath),
        analyzeMaintainability(localPath),
        collectOverview(localPath),
      ]);

    if (lang === 'java') {
      // Java 项目：Checkstyle（规范性） + PMD（代码质量）
      const [checkstyleResult, pmdResult] = await Promise.all([
        runCheckstyle(localPath),
        runPmd(localPath),
      ]);
      standardsResult = checkstyleResult;
      qualityResult = pmdResult;
    } else {
      // JS/TS 项目：ESLint
      const eslintResult = await runEslint(localPath);
      qualityResult = eslintResult.quality;
      standardsResult = eslintResult.standards;
    }

    let result: AnalysisResult = {
      security: securityResult,
      quality: qualityResult,
      complexity: complexityResult,
      maintainability: maintainabilityResult,
      standards: standardsResult,
      analyzedAt: new Date().toISOString(),
      projectPath,
      overview,
    };

    // 检测分析工具是否实际可用（全部100分且只有info级别说明工具未安装）
    const allTrivial = [result.security, result.quality, result.standards]
      .every((d) => d.score === 100 && d.issues.every((i) => i.severity === 'info'));

    if (allTrivial && isGitHubUrl(projectPath)) {
      // 工具不可用，回退到演示数据
      const demoResult = enrichWithAI(getSpoonKnifeDemoResult(projectPath), lang);
      res.json(demoResult);
      return;
    }

    // AI 智能体注入修复建议和体检总结
    result = enrichWithAI(result, lang);

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Analysis failed: ${message}` });
  } finally {
    if (clonedDir) {
      cleanupRepo(clonedDir);
    }
  }
});

/** 自动修复端点：应用 AI 建议的代码修复 */
router.post('/fix', async (req, res) => {
  const { projectPath, file, line, diffSnippet } = req.body as {
    projectPath?: string;
    file?: string;
    line?: number;
    diffSnippet?: string;
  };

  if (!projectPath || !file || !line || !diffSnippet) {
    res.status(400).json({ error: '缺少必要参数：projectPath, file, line, diffSnippet' });
    return;
  }

  try {
    const result = await applyFix({ projectPath, file, line, diffSnippet });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `修复失败：${message}` });
  }
});

export default router;
