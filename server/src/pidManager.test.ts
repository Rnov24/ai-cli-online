import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerPid, readPid, removePid, isPidRunning } from './pidManager';

describe('pidManager', () => {
  const component = 'test-comp';

  beforeEach(() => {
    removePid(component);
  });

  afterEach(() => {
    removePid(component);
  });

  it('registers and reads pid information correctly', () => {
    registerPid(component, { port: 9999 });
    const info = readPid(component);

    expect(info).not.toBeNull();
    expect(info?.name).toBe(component);
    expect(info?.pid).toBe(process.pid);
    expect(info?.port).toBe(9999);
  });

  it('removes pid file cleanly', () => {
    registerPid(component);
    expect(readPid(component)).not.toBeNull();

    removePid(component);
    expect(readPid(component)).toBeNull();
  });

  it('correctly identifies current process as running', () => {
    expect(isPidRunning(process.pid)).toBe(true);
    expect(isPidRunning(-1)).toBe(false);
    expect(isPidRunning(99999999)).toBe(false);
  });
});
