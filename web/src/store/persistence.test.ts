import { describe, it, expect, beforeEach } from 'vitest';
import { getTabsKey, persistTabs, loadTabs, TABS_KEY } from './persistence';
import type { PersistableFields } from './types';

describe('persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates deterministic token-namespaced tabs key', () => {
    expect(getTabsKey(null)).toBe(TABS_KEY);
    expect(getTabsKey('')).toBe(TABS_KEY);
    const key1 = getTabsKey('token-123');
    const key2 = getTabsKey('token-123');
    const key3 = getTabsKey('token-456');

    expect(key1).toMatch(/^ai-cli-online-tabs-[0-9a-f]{8}$/);
    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it('persists tabs under namespaced key and fallback key', () => {
    const mockState: PersistableFields = {
      activeTabId: 'tab1',
      nextId: 2,
      nextSplitId: 2,
      nextTabId: 2,
      tabs: [
        {
          id: 'tab1',
          name: 'Main',
          status: 'open',
          terminalIds: ['term-1'],
          layout: null,
          createdAt: 1000,
        },
      ],
    };

    persistTabs(mockState, 'user-token');

    const namespacedKey = getTabsKey('user-token');
    const namespacedRaw = localStorage.getItem(namespacedKey);
    expect(namespacedRaw).not.toBeNull();
    const parsed = JSON.parse(namespacedRaw!);
    expect(parsed.tabs[0].name).toBe('Main');

    const fallbackRaw = localStorage.getItem(TABS_KEY);
    expect(fallbackRaw).not.toBeNull();
  });

  it('loads tabs for specific token when available', () => {
    const stateA: PersistableFields = {
      activeTabId: 'tab-a',
      nextId: 2,
      nextSplitId: 2,
      nextTabId: 2,
      tabs: [
        {
          id: 'tab-a',
          name: 'Account A Tab',
          status: 'open',
          terminalIds: ['t1'],
          layout: null,
          createdAt: 1000,
        },
      ],
    };
    const stateB: PersistableFields = {
      activeTabId: 'tab-b',
      nextId: 2,
      nextSplitId: 2,
      nextTabId: 2,
      tabs: [
        {
          id: 'tab-b',
          name: 'Account B Tab',
          status: 'open',
          terminalIds: ['t2'],
          layout: null,
          createdAt: 2000,
        },
      ],
    };

    persistTabs(stateA, 'token-a');
    persistTabs(stateB, 'token-b');

    const loadedA = loadTabs('token-a');
    expect(loadedA?.tabs[0].name).toBe('Account A Tab');

    const loadedB = loadTabs('token-b');
    expect(loadedB?.tabs[0].name).toBe('Account B Tab');
  });

  it('falls back to global TABS_KEY if token key not found', () => {
    localStorage.setItem(
      TABS_KEY,
      JSON.stringify({
        version: 2,
        activeTabId: 'default-tab',
        nextId: 2,
        nextSplitId: 2,
        nextTabId: 2,
        tabs: [{ id: 'default-tab', name: 'Global', status: 'open', terminalIds: [], layout: null, createdAt: 1 }],
      }),
    );

    const loaded = loadTabs('brand-new-token');
    expect(loaded?.tabs[0].name).toBe('Global');
  });
});
