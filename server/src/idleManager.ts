import { checkpointDb } from './db.js';

let activeConnectionsCount = 0;
let lastActivityTime = Date.now();
let isIdleState = false;
let idleTimer: NodeJS.Timeout | null = null;

// Idle threshold in milliseconds (default: 60s of no active connections or HTTP requests)
const IDLE_THRESHOLD_MS = 60_000;

export function recordActivity(): void {
  lastActivityTime = Date.now();
  if (isIdleState) {
    wakeFromIdle();
  }
}

export function onConnectionCountChange(count: number): void {
  activeConnectionsCount = count;
  lastActivityTime = Date.now();
  if (count > 0 && isIdleState) {
    wakeFromIdle();
  } else if (count === 0 && !isIdleState) {
    scheduleIdleCheck();
  }
}

function scheduleIdleCheck(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    checkIdleTransition();
  }, IDLE_THRESHOLD_MS);
}

function checkIdleTransition(): void {
  const elapsed = Date.now() - lastActivityTime;
  if (activeConnectionsCount === 0 && elapsed >= IDLE_THRESHOLD_MS && !isIdleState) {
    enterIdle();
  }
}

function enterIdle(): void {
  isIdleState = true;
  console.log('[idle] No active clients. Entering idle power-save mode...');
  
  // 1. Commit and checkpoint SQLite WAL to disk
  checkpointDb();

  // 2. Suggest Garbage Collection if exposed via --expose-gc
  if (typeof global.gc === 'function') {
    try {
      global.gc();
      const mem = process.memoryUsage();
      console.log(`[idle] GC triggered. RSS: ${Math.round(mem.rss / 1024 / 1024)}MB, Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
    } catch { /* ignore */ }
  }
}

function wakeFromIdle(): void {
  isIdleState = false;
  console.log('[idle] Activity detected. Resuming active mode.');
}

export function isIdle(): boolean {
  return isIdleState;
}

export function getActiveConnectionsCount(): number {
  return activeConnectionsCount;
}

export function startIdleMonitoring(): void {
  // Periodic background check every 60s
  setInterval(() => {
    checkIdleTransition();
  }, IDLE_THRESHOLD_MS).unref();
}
