import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DimensionResult, Issue } from '../types/analysis.js';

const execFileAsync = promisify(execFile);

interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number };
  extra: {
    message: string;
    severity: string;
  };
}

interface SemgrepOutput {
  results: SemgrepFinding[];
}

function mapSeverity(severity: string): Issue['severity'] {
  switch (severity.toUpperCase()) {
    case 'ERROR':
      return 'error';
    case 'WARNING':
      return 'warning';
    default:
      return 'info';
  }
}

export async function runSemgrep(projectPath: string): Promise<DimensionResult> {
  try {
    const { stdout } = await execFileAsync('semgrep', [
      '--json',
      '--config',
      'auto',
      projectPath,
    ], { timeout: 120_000 });

    const output: SemgrepOutput = JSON.parse(stdout);
    const issues: Issue[] = output.results.map((r) => ({
      severity: mapSeverity(r.extra.severity),
      message: `[${r.check_id}] ${r.extra.message}`,
      file: r.path,
      line: r.start.line,
    }));

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warnCount = issues.filter((i) => i.severity === 'warning').length;
    const score = Math.max(0, 100 - errorCount * 15 - warnCount * 5);

    return { score, issues };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('ENOENT') || message.includes('not found')) {
      return {
        score: 100,
        issues: [{
          severity: 'info',
          message: 'semgrep is not installed — security scan skipped',
        }],
      };
    }

    return {
      score: 50,
      issues: [{
        severity: 'warning',
        message: `semgrep execution failed: ${message}`,
      }],
    };
  }
}
