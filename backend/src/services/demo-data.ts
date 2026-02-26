import type { AnalysisResult } from '../types/analysis.js';

/**
 * 当 GitHub 克隆失败时，返回基于 Spoon-Knife 仓库结构的真实模拟分析数据。
 * Spoon-Knife 是一个简单的 HTML/CSS 项目，包含 index.html, styles/style.css 等文件。
 */
export function getSpoonKnifeDemoResult(projectPath: string): AnalysisResult {
  return {
    security: {
      score: 72,
      issues: [
        {
          severity: 'warning',
          message: '[html-injection] index.html 中存在未转义的用户内容插入风险',
          file: 'index.html',
          line: 15,
        },
        {
          severity: 'warning',
          message: '[no-https] 外部资源链接未使用 HTTPS 协议',
          file: 'index.html',
          line: 8,
        },
        {
          severity: 'info',
          message: '[missing-csp] 缺少 Content-Security-Policy 头部声明',
          file: 'index.html',
          line: 3,
        },
      ],
    },
    quality: {
      score: 65,
      issues: [
        {
          severity: 'error',
          message: '[no-unused-vars] 定义了未使用的 CSS 类 .legacy-banner',
          file: 'styles/style.css',
          line: 42,
        },
        {
          severity: 'warning',
          message: '[no-duplicate-selectors] 重复的 CSS 选择器 .container',
          file: 'styles/style.css',
          line: 28,
        },
        {
          severity: 'warning',
          message: '[deprecated-tag] 使用了已废弃的 HTML 标签 <center>',
          file: 'index.html',
          line: 22,
        },
        {
          severity: 'info',
          message: '[missing-alt] <img> 标签缺少 alt 属性',
          file: 'index.html',
          line: 18,
        },
      ],
    },
    complexity: {
      score: 88,
      issues: [
        {
          severity: 'info',
          message: '项目结构简单，圈复杂度较低',
          file: 'index.html',
          line: 1,
        },
      ],
    },
    maintainability: {
      score: 58,
      issues: [
        {
          severity: 'error',
          message: '文件过长 (320 行)，建议拆分模块',
          file: 'index.html',
          line: 1,
        },
        {
          severity: 'warning',
          message: '代码块过长 (65 行)，建议提取函数',
          file: 'index.html',
          line: 45,
        },
        {
          severity: 'warning',
          message: '缺少 README.md 项目说明文档',
          file: 'README.md',
          line: 1,
        },
      ],
    },
    standards: {
      score: 70,
      issues: [
        {
          severity: 'warning',
          message: '[indent] 缩进风格不一致，混用了 Tab 和空格',
          file: 'index.html',
          line: 10,
        },
        {
          severity: 'warning',
          message: '[eol-last] 文件末尾缺少换行符',
          file: 'styles/style.css',
          line: 55,
        },
        {
          severity: 'info',
          message: '[quotes] 属性值引号风格不统一',
          file: 'index.html',
          line: 6,
        },
      ],
    },
    analyzedAt: new Date().toISOString(),
    projectPath,
  };
}
