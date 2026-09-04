#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const require = createRequire(import.meta.url);
const pkg = require(join(rootDir, 'package.json'));

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args[0] : 'start';

function getRunDir() {
  const base = process.env.RUN_DIR || 
               process.env.XDG_RUNTIME_DIR || 
               (process.env.HOME ? join(process.env.HOME, '.ai-cli-online', 'run') : join(rootDir, 'server', 'data', 'run'));
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true, mode: 0o700 });
  }
  return base;
}

function getLogDir() {
  const base = process.env.HOME ? join(process.env.HOME, '.ai-cli-online', 'logs') : join(rootDir, 'server', 'data', 'logs');
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true, mode: 0o700 });
  }
  return base;
}

function readPid(name = 'server') {
  const p = join(getRunDir(), `${name}.pid`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function isTermux() {
  return Boolean(
    process.env.TERMUX_VERSION ||
    (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) ||
    (process.env.HOME && process.env.HOME.includes('com.termux'))
  );
}

// --version
if (args.includes('--version') || args.includes('-v')) {
  console.log(pkg.version);
  process.exit(0);
}

// --help
if (args.includes('--help') || args.includes('-h') || command === 'help') {
  console.log(`
ai-cli-online v${pkg.version} — Web Terminal for Google Antigravity CLI (agy)

Usage:
  ai-cli-online [start]    Start the server in foreground
  ai-cli-online start -d   Start the server in background daemon mode
  ai-cli-online stop       Stop running server daemon
  ai-cli-online restart    Restart the server
  ai-cli-online status     Show status of server, tmux, and agy
  ai-cli-online install-boot Install auto-start on device boot (Termux:Boot or systemd)

Options:
  -d, --daemon             Run in background as a daemon
  -p, --port <port>        Override server port (default: 3001)
  --version, -v            Show version
  --help, -h               Show this help

Environment variables (or server/.env):
  PORT                     Server port (default: 3001)
  HOST                     Bind address (default: 0.0.0.0)
  AUTH_TOKEN               Authentication token
  DEFAULT_WORKING_DIR      Default working directory
  START_COMMAND            Optional start command (e.g. agy)
  NODE_OPTIONS             Node.js options (default: --expose-gc --max-old-space-size=256)

More info: ${pkg.homepage || 'https://github.com/huacheng/ai-cli-online'}
`.trim());
  process.exit(0);
}

// Check Node.js version
const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
if (nodeVersion < 18) {
  console.error(`Error: Node.js >= 18 is required (current: ${process.versions.node})`);
  process.exit(1);
}

// Command: status
if (command === 'status') {
  const info = readPid('server');
  console.log('='.repeat(40));
  console.log(`  AGY Online Service Status (v${pkg.version})`);
  console.log('='.repeat(40));
  console.log(`  Platform:   ${isTermux() ? 'Android (Termux)' : process.platform} (${process.arch})`);

  let tmuxOk = false;
  try {
    execFileSync('tmux', ['-V'], { stdio: 'pipe' });
    tmuxOk = true;
  } catch { /* ignore */ }
  console.log(`  tmux:       ${tmuxOk ? 'Available' : 'NOT INSTALLED'}`);

  let agyOk = false;
  try {
    execFileSync('agy', ['--version'], { stdio: 'pipe' });
    agyOk = true;
  } catch { /* ignore */ }
  console.log(`  Antigravity: ${agyOk ? 'Available' : 'NOT IN PATH'}`);

  if (info && isPidAlive(info.pid)) {
    const uptimeSec = Math.round((Date.now() - info.startedAt) / 1000);
    console.log(`  Web Server: RUNNING (PID: ${info.pid})`);
    console.log(`  Port:       ${info.port || 3001}`);
    console.log(`  Uptime:     ${uptimeSec}s`);
    console.log(`  PID File:   ${join(getRunDir(), 'server.pid')}`);
  } else {
    console.log(`  Web Server: STOPPED`);
  }
  console.log('='.repeat(40));
  process.exit(0);
}

// Command: stop
if (command === 'stop') {
  const info = readPid('server');
  if (!info || !isPidAlive(info.pid)) {
    console.log('AGY Online server is not running.');
    const pidFile = join(getRunDir(), 'server.pid');
    if (existsSync(pidFile)) unlinkSync(pidFile);
    process.exit(0);
  }

  console.log(`Stopping AGY Online server (PID: ${info.pid})...`);
  try {
    process.kill(info.pid, 'SIGTERM');
  } catch (err) {
    console.error(`Failed to send SIGTERM:`, err.message);
  }

  // Wait for exit
  let attempts = 0;
  while (isPidAlive(info.pid) && attempts < 20) {
    execFileSync('sleep', ['0.25']);
    attempts++;
  }

  if (isPidAlive(info.pid)) {
    console.log('Force killing process...');
    try {
      process.kill(info.pid, 'SIGKILL');
    } catch { /* ignore */ }
  }

  const pidFile = join(getRunDir(), 'server.pid');
  if (existsSync(pidFile)) {
    try { unlinkSync(pidFile); } catch { /* ignore */ }
  }
  console.log('AGY Online server stopped.');
  process.exit(0);
}

// Command: restart
if (command === 'restart') {
  const info = readPid('server');
  if (info && isPidAlive(info.pid)) {
    console.log(`Stopping running server (PID: ${info.pid})...`);
    try { process.kill(info.pid, 'SIGTERM'); } catch { /* ignore */ }
    let attempts = 0;
    while (isPidAlive(info.pid) && attempts < 20) {
      execFileSync('sleep', ['0.25']);
      attempts++;
    }
  }
  // Proceed to start
}

// Command: install-boot
if (command === 'install-boot') {
  if (isTermux()) {
    const installer = join(rootDir, 'scripts', 'install-termux-boot.sh');
    if (existsSync(installer)) {
      execFileSync('bash', [installer], { stdio: 'inherit' });
    } else {
      console.error(`Error: Installer not found at ${installer}`);
      process.exit(1);
    }
  } else {
    console.log('Detected Linux system (non-Termux). Running systemd service installer...');
    const installer = join(rootDir, 'install-service.sh');
    if (existsSync(installer)) {
      execFileSync('bash', [installer], { stdio: 'inherit' });
    } else {
      console.error(`Error: Service installer not found at ${installer}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

// Command: start
// Check if already running
const existing = readPid('server');
if (existing && isPidAlive(existing.pid)) {
  console.log(`AGY Online server is already running (PID: ${existing.pid}).`);
  console.log(`Run "ai-cli-online status" or "ai-cli-online stop"`);
  process.exit(0);
}

// Check tmux
try {
  execFileSync('tmux', ['-V'], { stdio: 'pipe' });
} catch {
  console.error('Error: tmux is not installed.');
  console.error('Install it with: pkg install tmux (Termux) or sudo apt install tmux (Ubuntu)');
  process.exit(1);
}

// Check agy
try {
  execFileSync('agy', ['--version'], { stdio: 'pipe' });
} catch {
  console.warn('Warning: Google Antigravity CLI (agy) was not found in PATH.');
  console.warn('Please ensure agy is installed and added to PATH for full functionality.');
}

// Check if built
const serverEntry = join(rootDir, 'server', 'dist', 'index.js');
if (!existsSync(serverEntry)) {
  console.error('Error: Server not built. Run "npm run build" first.');
  process.exit(1);
}

// Parse port option if provided
let portArg = null;
const portIdx = args.findIndex((a) => a === '-p' || a === '--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  portArg = args[portIdx + 1];
}

const isDaemon = args.includes('-d') || args.includes('--daemon');

const nodeFlags = [
  '--expose-gc',
  '--max-old-space-size=256',
];

const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --expose-gc --max-old-space-size=256`.trim(),
};
if (portArg) {
  env.PORT = portArg;
}

if (isDaemon) {
  const logFile = join(getLogDir(), 'ai-cli-online.log');
  const out = openSync(logFile, 'a');
  const err = openSync(logFile, 'a');

  const child = spawn(process.execPath, [...nodeFlags, serverEntry], {
    cwd: join(rootDir, 'server'),
    detached: true,
    stdio: ['ignore', out, err],
    env,
  });

  child.unref();

  console.log(`AGY Online server started in daemon mode (PID: ${child.pid})`);
  console.log(`Logs: ${logFile}`);
  console.log(`Check status: ai-cli-online status`);
  process.exit(0);
} else {
  // Foreground execution
  const child = spawn(process.execPath, [...nodeFlags, serverEntry], {
    cwd: join(rootDir, 'server'),
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      child.kill(sig);
    });
  }
}
