import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DimensionResult, Issue } from '../types/analysis.js';

const execFileAsync = promisify(execFile);

interface EslintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line: number;
}

interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

function mapSeverity(level: number): Issue['severity'] {
  if (level === 2) return 'error';
  if (level === 1) return 'warning';
  return 'info';
}

function isStyleRule(ruleId: string | null): boolean {
  if (!ruleId) return false;
  const stylePatterns = [
    'indent', 'semi', 'quotes', 'comma', 'spacing',
    'brace-style', 'eol-last', 'no-trailing-spaces',
    'max-len', 'padded-blocks', 'key-spacing',
  ];
  return stylePatterns.some((p) => ruleId.includes(p));
}

function parseResults(results: EslintFileResult[]): {
  qualityIssues: Issue[];
  standardsIssues: Issue[];
} {
  const qualityIssues: Issue[] = [];
  const standardsIssues: Issue[] = [];

  for (const file of results) {
    for (const msg of file.messages) {
      const issue: Issue = {
        severity: mapSeverity(msg.severity),
        message: msg.ruleId ? `[${msg.ruleId}] ${msg.message}` : msg.message,
        file: file.filePath,
        line: msg.line,
      };

      if (isStyleRule(msg.ruleId)) {
        standardsIssues.push(issue);
      } else {
        qualityIssues.push(issue);
      }
    }
  }

  return { qualityIssues, standardsIssues };
}

function computeScore(issues: Issue[]): number {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  return Math.max(0, 100 - errorCount * 10 - warnCount * 3);
}

function fallbackResult(message: string): {
  quality: DimensionResult;
  standards: DimensionResult;
} {
  const issue: Issue = { severity: 'info', message };
  return {
    quality: { score: 100, issues: [issue] },
    standards: { score: 100, issues: [issue] },
  };
}

export async function runEslint(projectPath: string): Promise<{
  quality: DimensionResult;
  standards: DimensionResult;
}> {
  try {
    let stdout = '';
    try {
      const result = await execFileAsync('eslint', [
        '--format', 'json',
        projectPath,
      ], { timeout: 120_000 });
      stdout = result.stdout;
    } catch (execErr: unknown) {
      // eslint exits with code 1 when it finds issues — that's normal
      if (
        execErr instanceof Error &&
        'stdout' in execErr &&
        typeof (execErr as { stdout: unknown }).stdout === 'string'
      ) {
        stdout = (execErr as { stdout: string }).stdout;
      } else {
        throw execErr;
      }
    }

    const results: EslintFileResult[] = JSON.parse(stdout);
    const { qualityIssues, standardsIssues } = parseResults(results);

    return {
      quality: { score: computeScore(qualityIssues), issues: qualityIssues },
      standards: { score: computeScore(standardsIssues), issues: standardsIssues },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('ENOENT') || message.includes('not found')) {
      return fallbackResult('eslint is not installed — quality scan skipped');
    }

    return fallbackResult(`eslint execution failed: ${message}`);
  }
}
