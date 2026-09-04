import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import systemRouter from './system';

vi.mock('../tmux.js', () => ({
  isTmuxAvailable: vi.fn(() => true),
  isAgyAvailable: vi.fn(() => true),
  listSessions: vi.fn(async () => []),
}));

vi.mock('../idleManager.js', () => ({
  isIdle: vi.fn(() => false),
  getActiveConnectionsCount: vi.fn(() => 1),
}));

vi.mock('../pidManager.js', () => ({
  isTermux: vi.fn(() => true),
}));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(systemRouter);
  return app;
}

describe('GET /api/system/status', () => {
  it('returns comprehensive system status including memory and platform', async () => {
    const app = createApp();
    const res = await request(app).get('/api/system/status');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('server');
    expect(res.body.server).toHaveProperty('pid');
    expect(res.body.server).toHaveProperty('uptime');
    expect(res.body.server.memory).toHaveProperty('rssMb');
    expect(res.body.server.idle).toBe(false);
    expect(res.body.server.activeConnections).toBe(1);

    expect(res.body.tmux.available).toBe(true);
    expect(res.body.agy.available).toBe(true);
    expect(res.body.platform.isTermux).toBe(true);
  });
});
