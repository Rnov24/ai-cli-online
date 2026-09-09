import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { login } from '../api/auth';
import {
  getSavedAccounts,
  saveAccount,
  removeAccount,
  updateAccountName,
  computeTokenId,
  type AccountProfile,
} from '../utils/accountStorage';
import {
  UserIcon,
  KeyIcon,
  CloseIcon,
  PlusIcon,
  CheckIcon,
  EditIcon,
  TrashIcon,
  LogoutIcon,
} from './icons';

export interface AccountSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountSwitcherModal({ isOpen, onClose }: AccountSwitcherModalProps) {
  const currentToken = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);

  const [accounts, setAccounts] = useState<AccountProfile[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAccounts = () => {
    setAccounts(getSavedAccounts());
  };

  useEffect(() => {
    if (isOpen) {
      refreshAccounts();
      setIsAdding(false);
      setEditingId(null);
      setError(null);
      setNewToken('');
      setNewName('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentId = currentToken ? computeTokenId(currentToken) : null;

  const handleSwitchAccount = async (acc: AccountProfile) => {
    if (acc.token === currentToken) {
      onClose();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await login(acc.token);
      if (!res.ok) {
        setError(res.error || 'Authentication failed for selected account');
        setLoading(false);
        return;
      }
      saveAccount(acc.token, acc.name);
      setToken(acc.token);
      onClose();
    } catch {
      setError('Connection error. Server may be unreachable.');
      setLoading(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const tokenToSave = newToken.trim();
    if (!tokenToSave) {
      setError('Auth token is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await login(tokenToSave);
      if (!res.ok) {
        setError(res.error || 'Authentication failed with provided token');
        setLoading(false);
        return;
      }
      saveAccount(tokenToSave, newName.trim() || undefined);
      setToken(tokenToSave);
      onClose();
    } catch {
      setError('Failed to reach server. Please check connection.');
      setLoading(false);
    }
  };

  const handleStartRename = (acc: AccountProfile) => {
    setEditingId(acc.id);
    setEditName(acc.name);
  };

  const handleSaveRename = (id: string) => {
    if (editName.trim()) {
      updateAccountName(id, editName.trim());
      refreshAccounts();
    }
    setEditingId(null);
  };

  const handleDeleteAccount = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeAccount(id);
    refreshAccounts();
  };

  const handleLogout = () => {
    setToken(null);
    onClose();
  };

  return (
    <div className="cmd-palette-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="cmd-palette-modal"
        style={{ maxWidth: '480px', width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center' }}>
              <UserIcon size={16} />
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-bright)',
                letterSpacing: '0.6px',
              }}
            >
              SWITCH ACCOUNT / PROFILE
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
          {error && (
            <div
              role="alert"
              style={{
                marginBottom: '14px',
                padding: '8px 12px',
                backgroundColor: 'rgba(247, 118, 142, 0.12)',
                border: '1px solid rgba(247, 118, 142, 0.4)',
                borderRadius: '6px',
                color: 'var(--accent-red, #f7768e)',
                fontSize: '12px',
              }}
            >
              {error}
            </div>
          )}

          {/* Account list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {accounts.length === 0 && (
              <div
                style={{
                  padding: '16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '6px',
                }}
              >
                No saved account profiles found.
              </div>
            )}

            {accounts.map((acc) => {
              const isActive = acc.id === currentId || (currentToken && acc.token === currentToken);
              const isEditing = editingId === acc.id;

              return (
                <div
                  key={acc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    backgroundColor: isActive ? 'rgba(122, 162, 247, 0.08)' : 'var(--bg-secondary)',
                    border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border)'}`,
                    borderRadius: '8px',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: isActive ? 'var(--accent-blue)' : 'rgba(255, 255, 255, 0.05)',
                        color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontWeight: 600,
                        fontSize: '13px',
                      }}
                    >
                      {acc.name ? acc.name.charAt(0).toUpperCase() : 'A'}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(acc.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                            style={{
                              padding: '2px 6px',
                              fontSize: '13px',
                              backgroundColor: 'var(--bg-primary)',
                              border: '1px solid var(--accent-blue)',
                              borderRadius: '4px',
                              color: 'var(--text-bright)',
                              outline: 'none',
                              width: '100%',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(acc.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--accent-green)',
                              cursor: 'pointer',
                              padding: '4px',
                            }}
                          >
                            <CheckIcon size={14} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              color: 'var(--text-bright)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {acc.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStartRename(acc)}
                            title="Rename Profile"
                            aria-label={`Rename ${acc.name}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '2px',
                              opacity: 0.7,
                              display: 'inline-flex',
                            }}
                          >
                            <EditIcon size={12} />
                          </button>
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: '2px',
                        }}
                      >
                        <code>ID: {acc.id}</code>
                        {isActive && (
                          <span
                            style={{
                              backgroundColor: 'rgba(158, 206, 106, 0.2)',
                              color: 'var(--accent-green)',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 600,
                            }}
                          >
                            ACTIVE
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {!isActive && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleSwitchAccount(acc)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: 'var(--accent-blue)',
                          color: 'var(--bg-primary)',
                          border: 'none',
                          borderRadius: '5px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Switch
                      </button>
                    )}
                    <button
                      type="button"
                      title="Remove from saved accounts"
                      aria-label={`Remove ${acc.name}`}
                      onClick={(e) => handleDeleteAccount(acc.id, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '6px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.6,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--accent-red)';
                        e.currentTarget.style.opacity = '1';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.opacity = '0.6';
                      }}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add account form or toggle */}
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
            {!isAdding ? (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                style={{
                  width: '100%',
                  padding: '9px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px dashed var(--border)',
                  borderRadius: '6px',
                  color: 'var(--accent-blue)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <PlusIcon size={14} /> Add Another Account / Token
              </button>
            ) : (
              <form
                onSubmit={handleAddAccount}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ marginBottom: '10px' }}>
                  <label
                    htmlFor="new-token-input"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: 'var(--accent-blue)',
                      fontWeight: 600,
                      marginBottom: '4px',
                    }}
                  >
                    <KeyIcon size={11} /> Auth Token *
                  </label>
                  <input
                    id="new-token-input"
                    type="password"
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    placeholder="Enter token string"
                    autoFocus
                    required
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-bright)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label
                    htmlFor="new-name-input"
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                      marginBottom: '4px',
                    }}
                  >
                    Profile Label (Optional)
                  </label>
                  <input
                    id="new-name-input"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Work Laptop, VPS"
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-bright)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-secondary)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: 'var(--accent-blue)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'var(--bg-primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    {loading ? 'Connecting...' : 'Connect Profile'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-red)',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            <LogoutIcon size={14} /> Disconnect / Logout
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}
