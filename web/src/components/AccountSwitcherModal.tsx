import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { login } from '../api/auth';
import {
  fetchAgyProfiles,
  switchAgyProfile,
  saveCurrentAgyProfile,
  importAgyProfile,
  renameAgyProfile,
  deleteAgyProfile,
  startAgyAuth,
  submitAgyAuthCode,
  cancelAgyAuth,
  type AgyProfile,
} from '../api/agyProfiles';
import {
  getSavedAccounts,
  saveAccount,
  removeAccount,
  computeTokenId,
  type AccountProfile,
} from '../utils/accountStorage';
import {
  UserIcon,
  CloseIcon,
  PlusIcon,
  CheckIcon,
  EditIcon,
  TrashIcon,
  LogoutIcon,
  CopyIcon,
  RefreshCwIcon,
  TerminalWindowIcon,
} from './icons';

export interface AccountSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AccountSwitcherModal({ isOpen, onClose }: AccountSwitcherModalProps) {
  const currentToken = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);

  // AGY Profiles State
  const [agyProfiles, setAgyProfiles] = useState<AgyProfile[]>([]);
  const [activeAgyProfile, setActiveAgyProfile] = useState<string>('default');
  const [agyLoading, setAgyLoading] = useState(false);
  const [agyError, setAgyError] = useState<string | null>(null);
  const [agySuccess, setAgySuccess] = useState<string | null>(null);

  // Inline Rename State
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Quick Save Current Profile
  const [saveCurrentName, setSaveCurrentName] = useState('');
  const [isSavingCurrent, setIsSavingCurrent] = useState(false);

  // Auth Helper & Add Profile State
  const [activeTab, setActiveTab] = useState<'oauth' | 'paste' | null>('oauth');
  const [newProfileName, setNewProfileName] = useState('');
  const [authFlowId, setAuthFlowId] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [terminalCommand, setTerminalCommand] = useState<string | null>(null);
  const [rawTokenInput, setRawTokenInput] = useState('');
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Web Workspace Token Profiles State
  const [showWebAccounts, setShowWebAccounts] = useState(false);
  const [webAccounts, setWebAccounts] = useState<AccountProfile[]>([]);
  const [newWebToken, setNewWebToken] = useState('');
  const [newWebName, setNewWebName] = useState('');
  const [isAddingWeb, setIsAddingWeb] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  const loadAgyProfiles = useCallback(async () => {
    setAgyLoading(true);
    setAgyError(null);
    try {
      const data = await fetchAgyProfiles(currentToken || undefined);
      setAgyProfiles(data.profiles || []);
      setActiveAgyProfile(data.current || 'default');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load Antigravity profiles';
      setAgyError(msg);
    } finally {
      setAgyLoading(false);
    }
  }, [currentToken]);

  const refreshWebAccounts = () => {
    setWebAccounts(getSavedAccounts());
  };

  useEffect(() => {
    if (isOpen) {
      loadAgyProfiles();
      refreshWebAccounts();
      setAgyError(null);
      setAgySuccess(null);
      setWebError(null);
      setEditingProfile(null);
      setActiveTab('oauth');
      setAuthFlowId(null);
      setAuthUrl(null);
      setAuthCodeInput('');
      setTerminalCommand(null);
      setRawTokenInput('');
      setNewProfileName('');
      setSaveCurrentName('');
      setIsSavingCurrent(false);
    }
  }, [isOpen, loadAgyProfiles]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (authFlowId) {
          cancelAgyAuth(authFlowId, currentToken || undefined).catch(() => {});
        }
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, authFlowId, currentToken]);

  if (!isOpen) return null;

  const handleSwitchProfile = async (name: string) => {
    if (name === activeAgyProfile) return;
    setAgyLoading(true);
    setAgyError(null);
    try {
      await switchAgyProfile(name, currentToken || undefined);
      setAgySuccess(`Active Google identity switched to "${name}"`);
      await loadAgyProfiles();
    } catch (err: unknown) {
      setAgyError(err instanceof Error ? err.message : 'Failed to switch profile');
    } finally {
      setAgyLoading(false);
    }
  };

  const handleSaveCurrent = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = saveCurrentName.trim();
    if (!name) {
      setAgyError('Profile name is required');
      return;
    }
    setAgyLoading(true);
    setAgyError(null);
    try {
      await saveCurrentAgyProfile(name, currentToken || undefined);
      setAgySuccess(`Current Google credentials saved as profile "${name}"`);
      setSaveCurrentName('');
      setIsSavingCurrent(false);
      await loadAgyProfiles();
    } catch (err: unknown) {
      setAgyError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setAgyLoading(false);
    }
  };

  const handleRenameProfile = async (oldName: string) => {
    const newName = renameInput.trim();
    if (!newName || newName === oldName) {
      setEditingProfile(null);
      return;
    }
    setAgyLoading(true);
    setAgyError(null);
    try {
      await renameAgyProfile(oldName, newName, currentToken || undefined);
      setAgySuccess(`Renamed profile "${oldName}" to "${newName}"`);
      setEditingProfile(null);
      await loadAgyProfiles();
    } catch (err: unknown) {
      setAgyError(err instanceof Error ? err.message : 'Failed to rename profile');
    } finally {
      setAgyLoading(false);
    }
  };

  const handleDeleteProfile = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (name === activeAgyProfile) return;
    if (!window.confirm(`Delete Google profile "${name}"? This removes saved credentials on disk.`)) {
      return;
    }
    setAgyLoading(true);
    setAgyError(null);
    try {
      await deleteAgyProfile(name, currentToken || undefined);
      setAgySuccess(`Deleted profile "${name}"`);
      await loadAgyProfiles();
    } catch (err: unknown) {
      setAgyError(err instanceof Error ? err.message : 'Failed to delete profile');
    } finally {
      setAgyLoading(false);
    }
  };

  // Auth Helper: Start OAuth Flow
  const handleStartAuthFlow = async () => {
    const name = newProfileName.trim();
    if (!name) {
      setAgyError('Please enter a profile name first (e.g. work, personal)');
      return;
    }
    setSubmittingAuth(true);
    setAgyError(null);
    setAuthUrl(null);
    setTerminalCommand(null);
    try {
      const resp = await startAgyAuth(name, currentToken || undefined);
      if (resp.flowId) {
        setAuthFlowId(resp.flowId);
      }
      if (resp.authUrl) {
        setAuthUrl(resp.authUrl);
      }
      if (resp.manualTerminalCommand) {
        setTerminalCommand(resp.manualTerminalCommand);
      }
      if (resp.message && !resp.authUrl) {
        setAgyError(resp.message);
      }
    } catch (err: unknown) {
      setAgyError(err instanceof Error ? err.message : 'Failed to start Google Auth helper');
    } finally {
      setSubmittingAuth(false);
    }
  };

  // Auth Helper: Open OAuth URL
  const handleOpenAuthUrl = () => {
    if (!authUrl) return;
    window.open(authUrl, '_blank', 'noopener,noreferrer');
  };

  // Auth Helper: Copy OAuth URL
  const handleCopyAuthUrl = async () => {
    if (!authUrl) return;
    try {
      await navigator.clipboard.writeText(authUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // ignore
    }
  };

  // Auth Helper: Paste Code from Clipboard
  const handlePasteCodeFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setAuthCodeInput(text.trim());
      }
    } catch {
      // clipboard access not granted
    }
  };

  // Auth Helper: Submit Code
  const handleSubmitAuthCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authFlowId) {
      setAgyError('No active authentication session. Please click Generate Link first.');
      return;
    }
    const code = authCodeInput.trim();
    if (!code) {
      setAgyError('Please paste the authorization code from Google.');
      return;
    }

    setSubmittingAuth(true);
    setAgyError(null);
    try {
      await submitAgyAuthCode(authFlowId, newProfileName.trim(), code, currentToken || undefined);
      setAgySuccess(`Successfully authenticated and activated Google profile "${newProfileName.trim()}"!`);
      setActiveTab(null);
      setAuthFlowId(null);
      setAuthUrl(null);
      setAuthCodeInput('');
      setNewProfileName('');
      await loadAgyProfiles();
    } catch (err: unknown) {
      setAgyError(err instanceof Error ? err.message : 'Failed to complete Google authentication');
    } finally {
      setSubmittingAuth(false);
    }
  };

  // Direct Token Paste Submit
  const handleImportToken = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProfileName.trim();
    const token = rawTokenInput.trim();
    if (!name) {
      setAgyError('Profile name is required');
      return;
    }
    if (!token) {
      setAgyError('Token content cannot be empty');
      return;
    }

    setSubmittingAuth(true);
    setAgyError(null);
    try {
      await importAgyProfile(name, token, currentToken || undefined);
      setAgySuccess(`Imported and activated Google profile "${name}"!`);
      setActiveTab(null);
      setRawTokenInput('');
      setNewProfileName('');
      await loadAgyProfiles();
    } catch (err: unknown) {
      setAgyError(err instanceof Error ? err.message : 'Failed to import token');
    } finally {
      setSubmittingAuth(false);
    }
  };

  // Web Workspace Token Handlers
  const currentWebId = currentToken ? computeTokenId(currentToken) : null;

  const handleSwitchWebAccount = async (acc: AccountProfile) => {
    if (acc.token === currentToken) return;
    setWebError(null);
    try {
      const res = await login(acc.token);
      if (!res.ok) {
        setWebError(res.error || 'Authentication failed');
        return;
      }
      saveAccount(acc.token, acc.name);
      setToken(acc.token);
      refreshWebAccounts();
    } catch {
      setWebError('Server connection error');
    }
  };

  const handleAddWebAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = newWebToken.trim();
    if (!token) return;
    setWebError(null);
    try {
      const res = await login(token);
      if (!res.ok) {
        setWebError(res.error || 'Authentication failed');
        return;
      }
      saveAccount(token, newWebName.trim() || undefined);
      setToken(token);
      setNewWebToken('');
      setNewWebName('');
      setIsAddingWeb(false);
      refreshWebAccounts();
    } catch {
      setWebError('Server connection error');
    }
  };

  return (
    <div className="cmd-palette-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="cmd-palette-modal"
        style={{
          maxWidth: '560px',
          width: '92%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
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
              GOOGLE ANTIGRAVITY (AGY) ACCOUNTS //
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

        {/* Scrollable Body */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {/* Notifications */}
          {agyError && (
            <div
              role="alert"
              style={{
                marginBottom: '12px',
                padding: '8px 12px',
                backgroundColor: 'rgba(247, 118, 142, 0.12)',
                border: '1px solid rgba(247, 118, 142, 0.4)',
                borderRadius: '4px',
                color: 'var(--accent-red, #f7768e)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {agyError}
            </div>
          )}
          {agySuccess && (
            <div
              style={{
                marginBottom: '12px',
                padding: '8px 12px',
                backgroundColor: 'rgba(158, 206, 106, 0.12)',
                border: '1px solid rgba(158, 206, 106, 0.4)',
                borderRadius: '4px',
                color: 'var(--accent-green, #9ece6a)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ✔ {agySuccess}
            </div>
          )}

          {/* Active Google Identity Callout */}
          <div
            style={{
              padding: '12px',
              backgroundColor: 'rgba(122, 162, 247, 0.08)',
              border: '1px solid var(--accent-blue)',
              borderRadius: '6px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-blue)',
                  letterSpacing: '0.8px',
                  fontWeight: 700,
                  marginBottom: '2px',
                }}
              >
                ◈ ACTIVE GOOGLE IDENTITY
              </div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--text-bright)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {activeAgyProfile}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Used by Google Antigravity CLI (<code>agy</code>) for AI turns and model requests.
              </div>
            </div>
            <button
              type="button"
              onClick={loadAgyProfiles}
              title="Refresh profiles"
              aria-label="Refresh profiles"
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              <RefreshCwIcon size={14} />
            </button>
          </div>

          {/* Saved Profiles List */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                letterSpacing: '0.5px',
                marginBottom: '8px',
              }}
            >
              SAVED ACCOUNTS & CREDENTIALS ({agyProfiles.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {agyProfiles.map((p) => {
                const isActive = p.name === activeAgyProfile;
                const isEditing = editingProfile === p.name;

                return (
                  <div
                    key={p.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: isActive ? 'rgba(122, 162, 247, 0.05)' : 'var(--bg-secondary)',
                      border: `1px solid ${isActive ? 'var(--accent-blue)' : 'var(--border)'}`,
                      borderRadius: '6px',
                      gap: '10px',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="text"
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameProfile(p.name);
                              if (e.key === 'Escape') setEditingProfile(null);
                            }}
                            autoFocus
                            style={{
                              padding: '3px 6px',
                              fontSize: '13px',
                              fontFamily: 'var(--font-mono)',
                              backgroundColor: 'var(--bg-primary)',
                              border: '1px solid var(--accent-blue)',
                              borderRadius: '4px',
                              color: 'var(--text-bright)',
                              outline: 'none',
                              width: '180px',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameProfile(p.name)}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              fontSize: '13px',
                              color: 'var(--text-bright)',
                            }}
                          >
                            {p.name}
                          </span>
                          {isActive && (
                            <span
                              style={{
                                backgroundColor: 'rgba(158, 206, 106, 0.15)',
                                color: 'var(--accent-green)',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                              }}
                            >
                              ACTIVE
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProfile(p.name);
                              setRenameInput(p.name);
                            }}
                            title="Rename Profile"
                            aria-label={`Rename ${p.name}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '2px',
                              opacity: 0.6,
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
                          fontFamily: 'var(--font-mono)',
                          marginTop: '2px',
                        }}
                      >
                        Updated: {p.updatedAt ? new Date(p.updatedAt).toLocaleString() : 'N/A'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {!isActive ? (
                        <button
                          type="button"
                          disabled={agyLoading}
                          onClick={() => handleSwitchProfile(p.name)}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: 'var(--accent-blue)',
                            color: 'var(--bg-primary)',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: agyLoading ? 'not-allowed' : 'pointer',
                          }}
                        >
                          SWITCH
                        </button>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--accent-green)',
                            marginRight: '4px',
                          }}
                        >
                          ✓ Selected
                        </span>
                      )}

                      {!isActive && (
                        <button
                          type="button"
                          title="Delete profile"
                          aria-label={`Delete ${p.name}`}
                          onClick={(e) => handleDeleteProfile(p.name, e)}
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
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Save Current Profile Form */}
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              marginBottom: '16px',
            }}
          >
            {!isSavingCurrent ? (
              <button
                type="button"
                onClick={() => setIsSavingCurrent(true)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-blue)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <PlusIcon size={13} /> Save Current Active Account as New Named Profile
              </button>
            ) : (
              <form onSubmit={handleSaveCurrent}>
                <div
                  style={{
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-bright)',
                    fontWeight: 600,
                    marginBottom: '6px',
                  }}
                >
                  SAVE CURRENT GOOGLE ACCOUNT AS:
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={saveCurrentName}
                    onChange={(e) => setSaveCurrentName(e.target.value)}
                    placeholder="e.g. personal, work-laptop"
                    autoFocus
                    required
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-bright)',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsSavingCurrent(false);
                      setSaveCurrentName('');
                    }}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={agyLoading}
                    style={{
                      padding: '5px 12px',
                      backgroundColor: 'var(--accent-blue)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'var(--bg-primary)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: agyLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Save
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Add New Google Account / Auth Helper */}
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-secondary)',
              padding: '12px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: activeTab ? '12px' : '0',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: 'var(--text-bright)',
                  letterSpacing: '0.6px',
                }}
              >
                CONNECT NEW GOOGLE ACCOUNT
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('oauth')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: activeTab === 'oauth' ? 'var(--accent-blue)' : 'var(--bg-primary)',
                    color: activeTab === 'oauth' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  OAuth Link Helper
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: activeTab === 'paste' ? 'var(--accent-blue)' : 'var(--bg-primary)',
                    color: activeTab === 'paste' ? 'var(--bg-primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Direct Token Paste
                </button>
              </div>
            </div>

            {/* TAB: OAuth Link Helper */}
            {activeTab === 'oauth' && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  The Auth Helper launches Google OAuth, lets you click the sign-in link directly, and paste the authorization code to register the profile.
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}
                  >
                    1. PROFILE NAME
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      placeholder="e.g. enterprise-work, secondary-gmail"
                      disabled={Boolean(authUrl)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        color: 'var(--text-bright)',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        outline: 'none',
                      }}
                    />
                    {!authUrl && (
                      <button
                        type="button"
                        onClick={handleStartAuthFlow}
                        disabled={submittingAuth || !newProfileName.trim()}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--accent-blue)',
                          border: 'none',
                          borderRadius: '4px',
                          color: 'var(--bg-primary)',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          cursor: submittingAuth || !newProfileName.trim() ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {submittingAuth ? 'Generating Link...' : 'Generate Google Auth Link'}
                      </button>
                    )}
                  </div>
                </div>

                {authUrl && (
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--accent-blue)',
                      borderRadius: '4px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-blue)',
                        fontWeight: 700,
                        marginBottom: '8px',
                      }}
                    >
                      2. AUTHORIZE WITH GOOGLE
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <button
                        type="button"
                        onClick={handleOpenAuthUrl}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          backgroundColor: 'var(--accent-blue)',
                          color: 'var(--bg-primary)',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        ↗ Open Google Sign-In Page
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyAuthUrl}
                        title="Copy Auth URL"
                        style={{
                          padding: '8px 12px',
                          backgroundColor: 'transparent',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CopyIcon size={13} /> {copiedUrl ? 'Copied!' : 'Copy Link'}
                      </button>
                    </div>

                    <div
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        marginBottom: '10px',
                        wordBreak: 'break-all',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      <div style={{ color: 'var(--text-secondary)', marginBottom: '4px', fontSize: '10px', fontWeight: 600 }}>
                        CLICKABLE AUTHORIZATION LINK:
                      </div>
                      <a
                        href={authUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}
                      >
                        {authUrl}
                      </a>
                    </div>

                    <form onSubmit={handleSubmitAuthCode}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-secondary)',
                          marginBottom: '4px',
                          fontWeight: 600,
                        }}
                      >
                        3. PASTE AUTHORIZATION CODE
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                        <input
                          type="text"
                          value={authCodeInput}
                          onChange={(e) => setAuthCodeInput(e.target.value)}
                          placeholder="Paste authorization code from Google"
                          required
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text-bright)',
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={handlePasteCodeFromClipboard}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                          }}
                        >
                          Paste
                        </button>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (authFlowId) cancelAgyAuth(authFlowId, currentToken || undefined).catch(() => {});
                            setAuthUrl(null);
                            setAuthFlowId(null);
                            setAuthCodeInput('');
                          }}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingAuth || !authCodeInput.trim()}
                          style={{
                            padding: '5px 14px',
                            backgroundColor: 'var(--accent-green, #9ece6a)',
                            color: 'var(--bg-primary)',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            cursor: submittingAuth || !authCodeInput.trim() ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {submittingAuth ? 'Verifying...' : 'Complete Sign-In & Activate'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {terminalCommand && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '8px 10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                      <TerminalWindowIcon size={12} />
                      <span>Terminal command fallback:</span>
                    </div>
                    <code>{terminalCommand}</code>
                  </div>
                )}
              </div>
            )}

            {/* TAB: Direct Token Paste */}
            {activeTab === 'paste' && (
              <form onSubmit={handleImportToken} style={{ marginTop: '8px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}
                  >
                    PROFILE NAME *
                  </label>
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="e.g. work, vertex-account"
                    required
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-bright)',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      marginBottom: '4px',
                      fontWeight: 600,
                    }}
                  >
                    OAUTH TOKEN JSON OR ACCESS TOKEN (ya29...) *
                  </label>
                  <textarea
                    rows={4}
                    value={rawTokenInput}
                    onChange={(e) => setRawTokenInput(e.target.value)}
                    placeholder='Paste {"token":{"access_token":"ya29..."}} or raw ya29... token string'
                    required
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-bright)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      outline: 'none',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(null);
                      setRawTokenInput('');
                    }}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingAuth || !newProfileName.trim() || !rawTokenInput.trim()}
                    style={{
                      padding: '5px 14px',
                      backgroundColor: 'var(--accent-blue)',
                      color: 'var(--bg-primary)',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      cursor: submittingAuth ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submittingAuth ? 'Importing...' : 'Import & Activate Profile'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Secondary Collapsible: Web Workspace Access Tokens */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <button
              type="button"
              onClick={() => setShowWebAccounts(!showWebAccounts)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>WORKSPACE WEB ACCESS TOKENS ({webAccounts.length}) //</span>
              <span>{showWebAccounts ? '▲ Collapse' : '▼ Expand'}</span>
            </button>

            {showWebAccounts && (
              <div style={{ marginTop: '10px' }}>
                {webError && (
                  <div
                    style={{
                      marginBottom: '8px',
                      padding: '6px 10px',
                      backgroundColor: 'rgba(247, 118, 142, 0.12)',
                      border: '1px solid rgba(247, 118, 142, 0.4)',
                      borderRadius: '4px',
                      color: 'var(--accent-red)',
                      fontSize: '11px',
                    }}
                  >
                    {webError}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                  {webAccounts.map((acc) => {
                    const isCur = acc.id === currentWebId || (currentToken && acc.token === currentToken);
                    return (
                      <div
                        key={acc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          backgroundColor: isCur ? 'rgba(122, 162, 247, 0.05)' : 'var(--bg-secondary)',
                          border: `1px solid ${isCur ? 'var(--accent-blue)' : 'var(--border)'}`,
                          borderRadius: '4px',
                        }}
                      >
                        <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{acc.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                            ID: {acc.id}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {!isCur ? (
                            <button
                              type="button"
                              onClick={() => handleSwitchWebAccount(acc)}
                              style={{
                                padding: '3px 8px',
                                backgroundColor: 'var(--accent-blue)',
                                color: 'var(--bg-primary)',
                                border: 'none',
                                borderRadius: '3px',
                                fontSize: '10px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              USE
                            </button>
                          ) : (
                            <span style={{ fontSize: '10px', color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                              Active Web Token
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              removeAccount(acc.id);
                              refreshWebAccounts();
                            }}
                            title="Remove"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: '2px',
                            }}
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isAddingWeb ? (
                  <button
                    type="button"
                    onClick={() => setIsAddingWeb(true)}
                    style={{
                      width: '100%',
                      padding: '6px',
                      backgroundColor: 'transparent',
                      border: '1px dashed var(--border)',
                      borderRadius: '4px',
                      color: 'var(--accent-blue)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                    }}
                  >
                    + Add Web Access Token
                  </button>
                ) : (
                  <form onSubmit={handleAddWebAccount} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input
                      type="password"
                      value={newWebToken}
                      onChange={(e) => setNewWebToken(e.target.value)}
                      placeholder="Enter web token string"
                      required
                      style={{
                        padding: '5px 8px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        color: 'var(--text-bright)',
                        fontSize: '11px',
                        outline: 'none',
                      }}
                    />
                    <input
                      type="text"
                      value={newWebName}
                      onChange={(e) => setNewWebName(e.target.value)}
                      placeholder="Label (optional)"
                      style={{
                        padding: '5px 8px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        color: 'var(--text-bright)',
                        fontSize: '11px',
                        outline: 'none',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setIsAddingWeb(false)}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          color: 'var(--text-secondary)',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        style={{
                          padding: '4px 10px',
                          backgroundColor: 'var(--accent-blue)',
                          color: 'var(--bg-primary)',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Connect
                      </button>
                    </div>
                  </form>
                )}
              </div>
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
            onClick={() => {
              setToken(null);
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-red)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            <LogoutIcon size={13} /> Disconnect Web Session
          </button>
          <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
            Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}
