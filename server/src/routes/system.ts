import { Router } from 'express';
import os from 'os';
import { isIdle, getActiveConnectionsCount } from '../idleManager.js';
import { isTmuxAvailable, isAgyAvailable, listSessions } from '../tmux.js';
import { isTermux } from '../pidManager.js';
import type { SystemStatus } from 'ai-cli-online-shared';

const router = Router();

router.get('/api/system/status', async (_req, res) => {
  const mem = process.memoryUsage();
  let sessionsCount = 0;
  try {
    const sessions = await listSessions();
    sessionsCount = sessions.length;
  } catch { /* ignore */ }

  const status: SystemStatus = {
    server: {
      pid: process.pid,
      uptime: Math.round(process.uptime()),
      memory: {
        rssMb: Math.round(mem.rss / (1024 * 1024) * 10) / 10,
        heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024) * 10) / 10,
        heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024) * 10) / 10,
      },
      idle: isIdle(),
      activeConnections: getActiveConnectionsCount(),
    },
    tmux: {
      available: isTmuxAvailable(),
      sessionsCount,
    },
    agy: {
      available: isAgyAvailable(),
    },
    platform: {
      isTermux: isTermux(),
      os: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
    },
  };

  res.json(status);
});

export default router;
