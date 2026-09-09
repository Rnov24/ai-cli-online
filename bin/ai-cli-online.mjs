#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const isWin = process.platform === 'win32';
const binaryName = isWin ? 'ai-cli-online.exe' : 'ai-cli-online';
const binaryPath = join(rootDir, 'bin', binaryName);

if (!existsSync(binaryPath)) {
  console.error(`Error: AGY Online binary not found at ${binaryPath}`);
  console.error('Please run "npm run build" to compile the binary first.');
  process.exit(1);
}

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error(`Failed to execute ${binaryPath}:`, err);
  process.exit(1);
});
