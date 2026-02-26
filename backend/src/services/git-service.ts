import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const GITHUB_URL_RE = /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/;
const GIT_URL_RE = /^https?:\/\/[^/]+\/.*[\w.-]+(\.git)?$/;

/** 是否为 GitHub 地址（用于演示数据回退判断） */
export function isGitHubUrl(input: string): boolean {
  return GITHUB_URL_RE.test(input.trim());
}

/** 是否为任意 Git 远程仓库地址 */
export function isGitUrl(input: string): boolean {
  return GIT_URL_RE.test(input.trim());
}

export async function cloneRepo(url: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'repo-guardian-'));
  const cloneUrl = url.trim().replace(/\/$/, '');
  const gitUrl = cloneUrl.endsWith('.git') ? cloneUrl : `${cloneUrl}.git`;

  try {
    await execFileAsync('git', [
      'clone', '--depth', '1', gitUrl, tempDir,
    ], {
      timeout: 30_000,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',   // 禁止 git 弹出密码输入，防止进程卡死
        GIT_ASKPASS: '',             // 禁用外部密码助手
      },
    });
  } catch (err: unknown) {
    // 克隆失败时清理临时目录
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Authentication') || msg.includes('403') || msg.includes('401')) {
      throw new Error('克隆失败：需要认证，请在 URL 中附带 Access Token（如 http://token@host/repo）');
    }
    if (msg.includes('timed out') || msg.includes('ETIMEDOUT')) {
      throw new Error('克隆超时：请检查内网连接是否可达');
    }
    throw new Error(`克隆失败：${msg}`);
  }

  return tempDir;
}

export async function cleanupRepo(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}
