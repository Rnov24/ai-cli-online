import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { TMUX_SOCKET_PATH } from './tmux.js';

const execFile = promisify(execFileCb);

export function getRunDir(): string {
  const base = process.env.RUN_DIR || 
               process.env.XDG_RUNTIME_DIR || 
               (process.env.HOME ? join(process.env.HOME, '.ai-cli-online', 'run') : join(process.cwd(), 'data', 'run'));
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true, mode: 0o700 });
  }
  return base;
}

export function isTermux(): boolean {
  return Boolean(
    process.env.TERMUX_VERSION ||
    (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) ||
    (process.env.HOME && process.env.HOME.includes('com.termux'))
  );
}

export function isPidRunning(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    return error.code === 'EPERM'; // Process exists but belongs to another user
  }
}

export interface PidInfo {
  pid: number;
  name: string;
  startedAt: number;
  port?: number;
}

export function registerPid(component: string, info: Partial<PidInfo> = {}): void {
  const runDir = getRunDir();
  const filePath = join(runDir, `${component}.pid`);
  const data: PidInfo = {
    pid: process.pid,
    name: component,
    startedAt: Date.now(),
    ...info,
  };
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function readPid(component: string): PidInfo | null {
  const runDir = getRunDir();
  const filePath = join(runDir, `${component}.pid`);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as PidInfo;
    return parsed;
  } catch {
    return null;
  }
}

export function removePid(component: string): void {
  const runDir = getRunDir();
  const filePath = join(runDir, `${component}.pid`);
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch { /* ignore */ }
  }
}

/** Query running tmux server PID */
export async function getTmuxPid(): Promise<number | null> {
  try {
    const { stdout } = await execFile('tmux', ['-S', TMUX_SOCKET_PATH, 'display-message', '-p', '#{pid}'], { timeout: 3000 });
    const pid = parseInt(stdout.trim(), 10);
    if (!isNaN(pid) && isPidRunning(pid)) {
      return pid;
    }
  } catch { /* tmux might not be running yet */ }
  return null;
}

/** Clean up stale PID files on startup */
export function cleanupStalePids(): void {
  const components = ['server', 'tmux', 'daemon'];
  for (const comp of components) {
    const info = readPid(comp);
    if (info && !isPidRunning(info.pid)) {
      console.log(`[pid] Cleaning up stale PID file for ${comp} (PID ${info.pid})`);
      removePid(comp);
    }
  }
}
