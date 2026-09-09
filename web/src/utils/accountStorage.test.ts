import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeTokenId,
  getSavedAccounts,
  saveAccount,
  removeAccount,
  updateAccountName,
  getActiveAccount,
  ACCOUNTS_STORAGE_KEY,
} from './accountStorage';

describe('accountStorage utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('computes deterministic short token ids', () => {
    expect(computeTokenId('default')).toBe('default');
    expect(computeTokenId('')).toBe('default');
    const id1 = computeTokenId('my-secret-token-123');
    const id2 = computeTokenId('my-secret-token-123');
    expect(id1).toBe(id2);
    expect(id1.length).toBe(8);
  });

  it('saves and retrieves accounts from localStorage', () => {
    expect(getSavedAccounts()).toEqual([]);

    const profile1 = saveAccount('token-a', 'Work VPS');
    expect(profile1.name).toBe('Work VPS');
    expect(profile1.token).toBe('token-a');

    const accounts = getSavedAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0].token).toBe('token-a');
    expect(accounts[0].name).toBe('Work VPS');
  });

  it('updates existing account on re-saving same token', () => {
    saveAccount('secret-tok', 'Initial Name');
    const updated = saveAccount('secret-tok', 'Updated Name');
    expect(updated.name).toBe('Updated Name');

    const accounts = getSavedAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0].name).toBe('Updated Name');
  });

  it('removes accounts and updates account name', () => {
    const acc1 = saveAccount('tok-1', 'Profile 1');
    const acc2 = saveAccount('tok-2', 'Profile 2');
    expect(getSavedAccounts().length).toBe(2);

    updateAccountName(acc1.id, 'Renamed Profile 1');
    expect(getSavedAccounts().find((a) => a.id === acc1.id)?.name).toBe('Renamed Profile 1');

    removeAccount(acc2.id);
    expect(getSavedAccounts().length).toBe(1);
    expect(getSavedAccounts().find((a) => a.id === acc2.id)).toBeUndefined();
  });

  it('retrieves active account with fallback', () => {
    expect(getActiveAccount(null)).toBeNull();

    const synthetic = getActiveAccount('unsaved-token');
    expect(synthetic).not.toBeNull();
    expect(synthetic?.token).toBe('unsaved-token');

    saveAccount('saved-token', 'Known Account');
    const active = getActiveAccount('saved-token');
    expect(active?.name).toBe('Known Account');
  });
});
