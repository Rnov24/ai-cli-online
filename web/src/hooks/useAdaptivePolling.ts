import { useEffect, useRef } from 'react';

interface AdaptivePollingOptions {
  /** Normal interval in milliseconds when tab is visible (default: 3000ms) */
  intervalMs?: number;
  /** Background interval in milliseconds when tab is hidden (default: 0 = pause) */
  backgroundIntervalMs?: number;
  /** Whether polling is currently enabled (default: true) */
  enabled?: boolean;
}

/**
 * An adaptive polling hook that pauses or slows down timers when the browser
 * tab is hidden or device screen is off, saving battery and CPU on mobile/idle VPS.
 * Triggers an immediate refresh when the tab becomes visible again.
 */
export function useAdaptivePolling(
  callback: () => void | Promise<void>,
  options: AdaptivePollingOptions = {},
) {
  const {
    intervalMs = 3000,
    backgroundIntervalMs = 0,
    enabled = true,
  } = options;

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    let timer: number | null = null;
    let isCancelled = false;

    const runPoll = async () => {
      if (isCancelled) return;
      try {
        await callbackRef.current();
      } catch { /* ignore error in polling */ }
    };

    const setupTimer = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }

      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const delay = isHidden ? backgroundIntervalMs : intervalMs;

      if (delay > 0) {
        timer = window.setInterval(runPoll, delay);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Immediate refresh when tab becomes active again
        runPoll();
      }
      setupTimer();
    };

    // Initial poll and setup
    runPoll();
    setupTimer();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      isCancelled = true;
      if (timer !== null) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [intervalMs, backgroundIntervalMs, enabled]);
}
