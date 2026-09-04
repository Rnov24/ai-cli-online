import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdaptivePolling } from './useAdaptivePolling';

describe('useAdaptivePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs initial poll on mount and then on interval', () => {
    const fn = vi.fn();
    renderHook(() => useAdaptivePolling(fn, { intervalMs: 1000 }));

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('pauses polling when tab is hidden and backgroundIntervalMs is 0', () => {
    const fn = vi.fn();
    renderHook(() => useAdaptivePolling(fn, { intervalMs: 1000, backgroundIntervalMs: 0 }));

    expect(fn).toHaveBeenCalledTimes(1);

    // Simulate tab hidden
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    vi.advanceTimersByTime(5000);
    // Should NOT have run additional times while hidden
    expect(fn).toHaveBeenCalledTimes(1);

    // Simulate tab visible again
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Should immediately poll upon visible
    expect(fn).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
