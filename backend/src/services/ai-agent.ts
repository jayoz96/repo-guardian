import type { AnalysisResult, Issue, Dimension } from '../types/analysis.js';

const DIMENSION_LABELS: Record<Dimension, string> = {
  security: '安全性',
  quality: '代码质量',
  complexity: '复杂度',
  maintainability: '可维护性',
  standards: '规范性',
};

/** 从 message 中提取规则 ID，如 [UnusedImport]、[LineLength] */
function extractRuleId(message: string): string {
  const m = message.match(/^\[(\w+)\]\s*/);
  return m ? m[1] : '';
}

/** 按规则+文件聚合去重，同类问题合并为一条 */
function deduplicateIssues(issues: Issue[]): Issue[] {
  // 按 ruleId + file 分组
  const groups = new Map<string, Issue[]>();
  const noRule: Issue[] = [];

  for (const issue of issues) {
    const ruleId = extractRuleId(issue.message);
    if (!ruleId || !issue.file) {
      noRule.push(issue);
      continue;
    }
    const key = `${ruleId}::${issue.file}`;
    const group = groups.get(key);
    if (group) group.push(issue);
    else groups.set(key, [issue]);
  }

  const result: Issue[] = [...noRule];

  for (const [, group] of groups) {
    if (group.length <= 1) {
      result.push(group[0]);
      continue;
    }

    // 合并：保留最高严重级别，列出所有行号
    const first = group[0];
    const ruleId = extractRuleId(first.message);
    const lines = group.map((i) => i.line).filter(Boolean) as number[];
    const linesSorted = [...new Set(lines)].sort((a, b) => a - b);
    const severityOrder = { error: 0, warning: 1, info: 2 };
    const worstSeverity = group.reduce((worst, i) =>
      severityOrder[i.severity] < severityOrder[worst] ? i.severity : worst,
      first.severity,
    );

    // 构建合并后的消息
    const linesStr = linesSorted.length > 5
      ? linesSorted.slice(0, 5).join(', ') + ` 等${linesSorted.length}处`
      : linesSorted.join(', ');

    result.push({
      severity: worstSeverity,
      message: `[${ruleId}] ${first.message.replace(/^\[\w+\]\s*/, '')}（共 ${group.length} 处：行 ${linesStr}）`,
      file: first.file,
      line: linesSorted[0],
    });
  }

  // ── 第二轮：跨文件聚合（仅针对产生通用 diff 的规则） ──
  const CROSS_FILE_RULES = new Set(['HighComplexity', 'MediumComplexity', 'FileTooLong', 'LongCodeBlock']);
  const crossGroups = new Map<string, Issue[]>();
  const kept: Issue[] = [];

  for (const issue of result) {
    const ruleId = extractRuleId(issue.message);
    if (ruleId && CROSS_FILE_RULES.has(ruleId)) {
      const group = crossGroups.get(ruleId);
      if (group) group.push(issue);
      else crossGroups.set(ruleId, [issue]);
    } else {
      kept.push(issue);
    }
  }

  for (const [ruleId, group] of crossGroups) {
    if (group.length <= 1) {
      kept.push(group[0]);
      continue;
    }

    const severityOrder = { error: 0, warning: 1, info: 2 };
    const worstSeverity = group.reduce((worst, i) =>
      severityOrder[i.severity] < severityOrder[worst] ? i.severity : worst,
      group[0].severity,
    );

    const files = group.map((i) => i.file).filter(Boolean) as string[];
    const uniqueFiles = [...new Set(files)];
    const filesStr = uniqueFiles.length > 3
      ? uniqueFiles.slice(0, 3).join(', ') + ` 等${uniqueFiles.length}个文件`
      : uniqueFiles.join(', ');

    kept.push({
      severity: worstSeverity,
      message: `[${ruleId}] ${group[0].message.replace(/^\[\w+\]\s*/, '').replace(/（共.*$/, '')}（共 ${group.length} 处：${filesStr}）`,
      file: uniqueFiles[0],
      line: group[0].line,
    });
  }

  result.length = 0;
  result.push(...kept);

  // 按严重程度排序
  result.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return (order[a.severity] ?? 2) - (order[b.severity] ?? 2);
  });

  return result;
}

/** 基于问题关键词生成10字以内极简修复建议 */
function generateFixSuggestion(issue: Issue): string {
  const msg = issue.message.toLowerCase();

  // 安全类
  if (msg.includes('injection') || msg.includes('inject')) return '参数化查询防注入';
  if (msg.includes('xss') || msg.includes('cross-site')) return '转义用户输入';
  if (msg.includes('eval')) return '移除eval调用';
  if (msg.includes('hardcoded') || msg.includes('硬编码') || msg.includes('password') || msg.includes('secret')) return '使用环境变量';
  if (msg.includes('http') && !msg.includes('https')) return '启用HTTPS';
  if (msg.includes('cors')) return '限制CORS来源';
  if (msg.includes('csrf')) return '添加CSRF令牌';
  if (msg.includes('sql')) return '使用预编译语句';

  // Java 质量类
  if (msg.includes('未使用的 import') || msg.includes('unusedimport')) return '删除无用import';
  if (msg.includes('空的 catch') || msg.includes('emptycatch')) return '添加异常处理逻辑';
  if (msg.includes('system.out') || msg.includes('system.err')) return '替换为SLF4J日志';
  if (msg.includes('魔法数字') || msg.includes('magicnumber')) return '提取为命名常量';
  if (msg.includes('方法') && msg.includes('拆分')) return '拆分为子方法';

  // Java 规范类
  if (msg.includes('通配符') || msg.includes('star import')) return '改为具名import';
  if (msg.includes('javadoc')) return '补充Javadoc注释';
  if (msg.includes('pascalcase') || msg.includes('类名')) return '修正类名命名';
  if (msg.includes('upper_snake') || msg.includes('常量')) return '修正常量命名';
  if (msg.includes('tab') && msg.includes('缩进')) return '替换Tab为空格';
  if (msg.includes('行长度') || msg.includes('linelength')) return '拆分过长行';
  if (msg.includes('花括号') || msg.includes('bracestyle')) return '花括号放同一行';
  if (msg.includes('空代码块') || msg.includes('emptyblock')) return '删除或补充逻辑';

  // JS/TS 质量类
  if (msg.includes('unused') || msg.includes('no-unused')) return '删除未使用代码';
  if (msg.includes('any')) return '添加具体类型';
  if (msg.includes('console')) return '移除调试日志';
  if (msg.includes('todo') || msg.includes('fixme')) return '处理待办事项';
  if (msg.includes('duplicate') || msg.includes('重复')) return '提取公共函数';

  // 复杂度类
  if (msg.includes('复杂度') || msg.includes('complexity')) return '拆分为小函数';
  if (msg.includes('过长') || msg.includes('too long')) return '拆分模块';
  if (msg.includes('代码块')) return '提取子函数';

  // 规范类
  if (msg.includes('indent') || msg.includes('缩进')) return '统一缩进风格';
  if (msg.includes('semi')) return '统一分号规则';
  if (msg.includes('quotes') || msg.includes('引号')) return '统一引号风格';
  if (msg.includes('spacing') || msg.includes('space') || msg.includes('空格')) return '修正空格格式';

  // 通用
  if (issue.severity === 'error') return '修复此错误';
  if (issue.severity === 'warning') return '建议优化此处';
  return '检查并改进';
}

/** 生成模拟 Diff 片段（根据语言生成对应代码） */
function generateDiffSnippet(issue: Issue, lang: 'java' | 'js'): string {
  const msg = issue.message.toLowerCase();
  const file = issue.file ?? 'unknown';
  const line = issue.line ?? 1;

  // ── Java 质量规则 ──
  if (msg.includes('未使用的 import')) {
    const importLine = issue.message.match(/import:\s*([\w.]+)/)?.[1] ?? 'com.example.Unused';
    if (lang === 'java') {
      return [
        `--- a/${file}`, `+++ b/${file}`,
        `@@ -${line},1 +${line},1 @@`,
        `- import ${importLine};`,
        `+ // 已删除未使用的 import: ${importLine}`,
      ].join('\n');
    }
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},1 @@`,
      `- import { ${importLine.split('.').pop()} } from '${importLine}';`,
      `+ // 已删除未使用的 import: ${importLine.split('.').pop()}`,
    ].join('\n');
  }
  if (msg.includes('空的 catch')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},3 +${line},4 @@`,
      `  } catch (Exception e) {`,
      `- }`,
      `+ log.error("操作失败", e);`,
      `+ }`,
    ].join('\n');
  }
  if (msg.includes('system.out') || msg.includes('system.err')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},1 @@`,
      `- System.out.println(data);`,
      `+ log.info("data={}", data);`,
    ].join('\n');
  }
  if (msg.includes('硬编码密码') || msg.includes('hardcodedpassword')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},1 @@`,
      `- String password = "admin123";`,
      `+ String password = System.getenv("DB_PASSWORD");`,
    ].join('\n');
  }
  if (msg.includes('通配符') || msg.includes('star import')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},2 @@`,
      `- import java.util.*;`,
      `+ import java.util.List;`,
      `+ import java.util.Map;`,
    ].join('\n');
  }
  if (msg.includes('javadoc')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},4 @@`,
      `+ /**`,
      `+  * TODO: 补充类/接口说明`,
      `+  */`,
      `  public class Example {`,
    ].join('\n');
  }
  if (msg.includes('tab') && msg.includes('缩进')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},1 @@`,
      `-\tprivate int value;`,
      `+    private int value;`,
    ].join('\n');
  }
  if (msg.includes('行长度') || msg.includes('linelength')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},2 @@`,
      `- public void processUserRequestWithValidationAndLogging(String input, Logger logger, Config config) {`,
      `+ public void processUserRequest(`,
      `+     String input, Logger logger, Config config) {`,
    ].join('\n');
  }
  if (msg.includes('魔法数字') || msg.includes('magicnumber')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},2 @@`,
      `- if (retryCount > 3) {`,
      `+ private static final int MAX_RETRIES = 3;`,
      `+ if (retryCount > MAX_RETRIES) {`,
    ].join('\n');
  }
  if (msg.includes('空代码块') || msg.includes('emptyblock')) {
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},1 @@`,
      `- if (condition) {}`,
      `+ if (condition) { /* no-op: 条件暂不处理 */ }`,
    ].join('\n');
  }

  if (msg.includes('eval')) {
    if (lang === 'java') {
      return [
        `--- a/${file}`, `+++ b/${file}`,
        `@@ -${line},1 +${line},1 @@`,
        `- Object result = engine.eval(userInput);`,
        `+ Object result = safeParse(userInput);`,
      ].join('\n');
    }
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},1 @@`,
      `- const result = eval(userInput);`,
      `+ const result = safeEvaluate(userInput);`,
    ].join('\n');
  }
  if (msg.includes('console')) {
    if (lang === 'java') {
      return [
        `--- a/${file}`, `+++ b/${file}`,
        `@@ -${line},1 +${line},1 @@`,
        `- System.out.println(debugData);`,
        `+ log.debug("debugData={}", debugData);`,
      ].join('\n');
    }
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},0 @@`,
      `- console.log(debugData);`,
    ].join('\n');
  }
  if (msg.includes('unused') || msg.includes('no-unused')) {
    if (lang === 'java') {
      return [
        `--- a/${file}`, `+++ b/${file}`,
        `@@ -${line},1 +${line},0 @@`,
        `- private String unusedField;`,
      ].join('\n');
    }
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},1 +${line},0 @@`,
      `- const unusedVar = getValue();`,
    ].join('\n');
  }
  if (msg.includes('复杂度') || msg.includes('complexity')) {
    if (lang === 'java') {
      return [
        `--- a/${file}`, `+++ b/${file}`,
        `@@ -${line},5 +${line},7 @@`,
        `- public void handleAll() {`,
        `-     // ... 大量分支逻辑 ...`,
        `- }`,
        `+ public void parseInput() { /* ... */ }`,
        `+ public void validate() { /* ... */ }`,
        `+ public void execute() { /* ... */ }`,
      ].join('\n');
    }
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -${line},5 +${line},7 @@`,
      `- function doEverything() {`,
      `-   // ... 大量逻辑 ...`,
      `- }`,
      `+ function parseInput() { /* ... */ }`,
      `+ function validate() { /* ... */ }`,
      `+ function execute() { /* ... */ }`,
    ].join('\n');
  }
  if (msg.includes('过长')) {
    if (lang === 'java') {
      return [
        `--- a/${file}`, `+++ b/${file}`,
        `@@ -1,1 +1,1 @@`,
        `- // 建议将此类拆分为多个职责单一的类`,
        `+ // 已拆分为 ${file.replace(/\.\w+$/, '')}Helper 等子类`,
      ].join('\n');
    }
    return [
      `--- a/${file}`, `+++ b/${file}`,
      `@@ -1,1 +1,1 @@`,
      `- // 建议将此文件拆分为多个模块`,
      `+ // 已拆分为 ${file.replace(/\.\w+$/, '')}-utils 等子模块`,
    ].join('\n');
  }

  // 通用 diff
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${line},1 +${line},1 @@`,
    `- // TODO: 需要修复的代码`,
    `+ // FIXED: 已按建议修复`,
  ].join('\n');
}

/** 生成整体体检总结 */
function generateSummary(result: AnalysisResult): string {
  const dimensions: Dimension[] = [
    'security', 'quality', 'complexity',
    'maintainability', 'standards',
  ];

  const scores = dimensions.map((d) => result[d].score);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  const totalIssues = dimensions.reduce(
    (sum, d) => sum + result[d].issues.length, 0,
  );
  const errorCount = dimensions.reduce(
    (sum, d) => sum + result[d].issues.filter((i) => i.severity === 'error').length, 0,
  );

  let grade: string;
  if (avg >= 90) grade = 'A（优秀）';
  else if (avg >= 80) grade = 'B（良好）';
  else if (avg >= 60) grade = 'C（一般）';
  else grade = 'D（需改进）';

  const weakest = dimensions.reduce((min, d) =>
    result[d].score < result[min].score ? d : min,
  );

  const parts = [
    `📊 综合健康评分：${avg} 分（${grade}）`,
    `📋 共发现 ${totalIssues} 个问题，其中 ${errorCount} 个高风险`,
  ];

  for (const d of dimensions) {
    const s = result[d].score;
    const icon = s >= 80 ? '✅' : s >= 60 ? '⚠️' : '❌';
    parts.push(`${icon} ${DIMENSION_LABELS[d]}：${s} 分`);
  }

  parts.push(
    '',
    `🔍 最薄弱环节：${DIMENSION_LABELS[weakest]}（${result[weakest].score} 分）`,
    `💡 建议优先处理${DIMENSION_LABELS[weakest]}相关问题以提升整体代码健康度。`,
  );

  return parts.join('\n');
}

/** 为分析结果注入 AI 建议并生成总结 */
export function enrichWithAI(result: AnalysisResult, lang: 'java' | 'js' = 'js'): AnalysisResult {
  const dimensions: Dimension[] = [
    'security', 'quality', 'complexity',
    'maintainability', 'standards',
  ];

  for (const dim of dimensions) {
    // 先去重聚合，再注入 AI 建议
    const deduped = deduplicateIssues(result[dim].issues);
    result[dim].issues = deduped.map((issue) => ({
      ...issue,
      fixSuggestion: generateFixSuggestion(issue),
      diffSnippet: issue.file ? generateDiffSnippet(issue, lang) : undefined,
    }));
  }

  result.summary = generateSummary(result);
  return result;
}
