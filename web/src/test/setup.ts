import '@testing-library/jest-dom/vitest';

// Safe localStorage mock for Node 22+ experimental localStorage
try {
  let hasWorking = false;
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      localStorage.getItem('__test__');
      hasWorking = true;
    }
  } catch {
    hasWorking = false;
  }
  if (!hasWorking) {
    const map = new Map<string, string>();
    const memStorage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, val: string) => { map.set(key, String(val)); },
      removeItem: (key: string) => { map.delete(key); },
      clear: () => { map.clear(); },
      get length() { return map.size; },
      key: (i: number) => Array.from(map.keys())[i] ?? null,
    };
    Object.defineProperty(globalThis, 'localStorage', { value: memStorage, configurable: true, writable: true });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', { value: memStorage, configurable: true, writable: true });
    }
  }
} catch {
  // ignore
}
