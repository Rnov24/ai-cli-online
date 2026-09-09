export interface AccountProfile {
  id: string;
  name: string;
  token: string;
  lastUsed: number;
}

export const ACCOUNTS_STORAGE_KEY = 'agy-online-accounts';
export const LEGACY_ACCOUNTS_STORAGE_KEY = 'ai-cli-online-accounts';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

export function computeTokenId(token: string): string {
  if (!token || token === 'default') return 'default';
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash) + token.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

export function getSavedAccounts(): AccountProfile[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    let raw = storage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) {
      raw = storage.getItem(LEGACY_ACCOUNTS_STORAGE_KEY);
      if (raw) {
        try { storage.setItem(ACCOUNTS_STORAGE_KEY, raw); } catch { /* ignore */ }
      }
    }
    if (!raw) return [];
    const accounts = JSON.parse(raw);
    if (!Array.isArray(accounts)) return [];
    return accounts.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  } catch {
    return [];
  }
}

export function saveAccount(token: string, name?: string): AccountProfile {
  const id = computeTokenId(token);
  const accounts = getSavedAccounts();
  const existingIndex = accounts.findIndex((a) => a.id === id || a.token === token);

  const defaultName = token === 'default' ? 'Default' : `Account ${id.slice(0, 4)}`;
  const now = Date.now();

  let profile: AccountProfile;

  if (existingIndex >= 0) {
    profile = {
      ...accounts[existingIndex],
      id,
      token,
      name: name?.trim() || accounts[existingIndex].name || defaultName,
      lastUsed: now,
    };
    accounts[existingIndex] = profile;
  } else {
    profile = {
      id,
      name: name?.trim() || defaultName,
      token,
      lastUsed: now,
    };
    accounts.push(profile);
  }

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch {
      // ignore
    }
  }

  return profile;
}

export function removeAccount(id: string): void {
  const storage = getStorage();
  if (!storage) return;

  const accounts = getSavedAccounts().filter((a) => a.id !== id);
  try {
    storage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

export function updateAccountName(id: string, name: string): void {
  const storage = getStorage();
  if (!storage) return;

  const accounts = getSavedAccounts();
  const target = accounts.find((a) => a.id === id);
  if (target) {
    target.name = name.trim() || target.name;
    try {
      storage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
    } catch {
      // ignore
    }
  }
}

export function getActiveAccount(token: string | null): AccountProfile | null {
  if (!token) return null;
  const accounts = getSavedAccounts();
  const match = accounts.find((a) => a.token === token || a.id === computeTokenId(token));
  if (match) return match;

  const id = computeTokenId(token);
  return {
    id,
    name: token === 'default' ? 'Default' : `Account ${id.slice(0, 4)}`,
    token,
    lastUsed: Date.now(),
  };
}
