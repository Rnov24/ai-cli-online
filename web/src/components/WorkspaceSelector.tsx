import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  fetchWorkspaces,
  createWorkspace,
  deleteWorkspace,
  switchSessionWorkspace,
  Workspace,
} from '../api/workspaces';
import { HomeIcon, FolderIcon, CheckIcon, CloseIcon } from './icons';

interface WorkspaceSelectorProps {
  token: string;
  sessionId?: string;
  cwd?: string | null;
  currentCwd?: string | null;
  onWorkspaceSwitched?: (newCwd: string, isHome: boolean, mode: 'agentic-assistant' | 'coding-agent') => void;
  onWorkspaceChange?: (newCwd: string, isHome: boolean, mode: 'agentic-assistant' | 'coding-agent') => void;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  token,
  sessionId,
  cwd: cwdProp,
  currentCwd,
  onWorkspaceSwitched,
  onWorkspaceChange,
}) => {
  const cwd = currentCwd !== undefined ? currentCwd : cwdProp;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState('');
  const [isHome, setIsHome] = useState(false);
  const [mode, setMode] = useState<'agentic-assistant' | 'coding-agent'>('coding-agent');
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const popoverRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    if (!el.style.width) {
      Object.defineProperty(el.style, 'width', {
        value: 'min(320px, calc(100vw - 24px))',
        configurable: true,
        writable: true,
      });
    }
    if (!el.style.maxHeight) {
      Object.defineProperty(el.style, 'maxHeight', {
        value: 'min(440px, calc(100dvh - 60px))',
        configurable: true,
        writable: true,
      });
    }
  }, []);

  const loadWorkspaces = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchWorkspaces(token);
      const wsList = Array.isArray(data) ? data : (data as any)?.workspaces || [];
      setWorkspaces(wsList);
      if ((data as any)?.activeWorkspaceId) {
        setActiveWsId((data as any).activeWorkspaceId);
      }
      if ((data as any)?.isHome !== undefined) setIsHome((data as any).isHome);
      if ((data as any)?.mode !== undefined) setMode((data as any).mode);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      loadWorkspaces();
    };
    window.addEventListener('agy:open-workspace-selector', handleOpen);
    return () => window.removeEventListener('agy:open-workspace-selector', handleOpen);
  }, [loadWorkspaces]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsAdding(false);
        setError(null);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const handleSelectWorkspace = async (ws: Workspace) => {
    if (!token || !sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await switchSessionWorkspace(token, sessionId, ws.id, ws.path);
      setActiveWsId(ws.id);
      setIsHome(res.isHome);
      setMode(res.mode);
      setIsOpen(false);
      setIsAdding(false);
      if (onWorkspaceSwitched) {
        onWorkspaceSwitched(res.cwd, res.isHome, res.mode);
      }
      if (onWorkspaceChange) {
        onWorkspaceChange(res.cwd, res.isHome, res.mode);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to switch workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleAddWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPath.trim() || !token) return;
    setLoading(true);
    setError(null);
    try {
      const created = await createWorkspace(token, newPath.trim(), newName.trim() || undefined);
      setWorkspaces((prev) => [...prev, created]);
      setNewPath('');
      setNewName('');
      setIsAdding(false);
      // Auto switch to newly added workspace
      await handleSelectWorkspace(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteWorkspace = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!token || id === 'home') return;
    try {
      await deleteWorkspace(token, id);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      if (activeWsId === id) {
        const homeWs = (workspaces || []).find((w) => w.isHome);
        if (homeWs) {
          handleSelectWorkspace(homeWs);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace');
    }
  };

  // Find active workspace display name
  const activeWorkspace = (workspaces || []).find((w) => w.id === activeWsId) || {
    name: isHome ? 'Home (~)' : cwd ? cwd.split(/[/\\]/).pop() || 'Workspace' : 'Workspace',
    isHome,
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={isHome ? 'Home Directory (~): Operating as Agentic Assistant' : `Workspace: ${activeWorkspace.name} (Coding Agent)`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '2px 8px',
          cursor: 'pointer',
          color: 'var(--text-bright)',
          fontSize: '11px',
          fontWeight: 600,
          height: '24px',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-hover, var(--accent-cyan))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{isHome ? <HomeIcon size={13} /> : <FolderIcon size={13} />}</span>
        <span
          style={{
            maxWidth: '140px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeWorkspace.name}
        </span>
        <span
          style={{
            fontSize: '9px',
            padding: '1px 5px',
            borderRadius: '3px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: isHome ? 'rgba(6, 182, 212, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: isHome ? 'var(--accent-cyan, #06b6d4)' : 'var(--accent-green, #10b981)',
            border: `1px solid ${isHome ? 'rgba(6, 182, 212, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
          }}
        >
          {isHome ? 'Assistant' : 'Coding'}
        </span>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>▾</span>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          ref={popoverRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 'auto',
            right: 0,
            marginTop: '4px',
            width: 'min(320px, calc(100vw - 24px))',
            maxHeight: 'min(440px, calc(100dvh - 60px))',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            zIndex: 'var(--z-popover, 800)',
            overflowY: 'auto',
            padding: '8px',
            color: 'var(--text-primary)',
          }}
        >
          <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setIsOpen(false)} />
          <div
            style={{
              padding: '4px 6px 8px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
                WORKSPACE SCOPING
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: '2px',
                  background: isHome ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: isHome ? 'var(--accent-purple)' : 'var(--accent-blue)',
                  border: `1px solid ${isHome ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                }}
              >
                {mode === 'agentic-assistant' ? 'ASSISTANT' : 'CODING'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsAdding(!isAdding)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {isAdding ? 'Cancel' : '+ Add Workspace'}
            </button>
          </div>

          {error && (
            <div
              style={{
                margin: '6px 0',
                padding: '6px',
                borderRadius: '4px',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--accent-red)',
                fontSize: '11px',
              }}
            >
              {error}
            </div>
          )}

          {/* Add Workspace Inline Form */}
          {isAdding && (
            <form onSubmit={handleAddWorkspace} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ marginBottom: '6px' }}>
                <input
                  type="text"
                  placeholder="Directory Path (e.g. D:\Projects\app)"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-bright)',
                  }}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Optional Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    fontSize: '11px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-bright)',
                  }}
                />
                <button
                  type="submit"
                  disabled={loading || !newPath.trim()}
                  style={{
                    padding: '4px 12px',
                    fontSize: '11px',
                    background: 'var(--accent-cyan)',
                    color: '#000',
                    fontWeight: 700,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Adding...' : 'Add'}
                </button>
              </div>
            </form>
          )}

          {/* Home Section */}
          <div style={{ marginTop: '8px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '2px 6px', fontWeight: 600 }}>
              PERSONAL ROOT
            </div>
            {(workspaces || [])
              .filter((w) => w.isHome)
              .map((ws) => {
                const isActive = isHome;
                return (
                  <div
                    key={ws.id || ws.path}
                    onClick={() => handleSelectWorkspace(ws)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: isActive ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(6, 182, 212, 0.4)' : 'transparent'}`,
                      margin: '2px 0',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <HomeIcon size={13} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-bright)' }}>
                          {ws.name}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            color: 'var(--accent-cyan)',
                            fontWeight: 700,
                            padding: '1px 4px',
                            background: 'rgba(6, 182, 212, 0.1)',
                            borderRadius: '2px',
                          }}
                        >
                          Agentic Assistant
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '22px' }}>
                        {ws.path}
                      </div>
                    </div>
                    {isActive && <CheckIcon size={14} color="var(--accent-cyan)" />}
                  </div>
                );
              })}
          </div>

          {/* Project Workspaces Section */}
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', padding: '2px 6px', fontWeight: 600 }}>
              PROJECT WORKSPACES (CODING AGENT)
            </div>
            {(workspaces || [])
              .filter((w) => !w.isHome)
              .map((ws) => {
                const isActive = !isHome && activeWsId === ws.id;
                return (
                  <div
                    key={ws.id || ws.path}
                    onClick={() => handleSelectWorkspace(ws)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      background: isActive ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(59, 130, 246, 0.4)' : 'transparent'}`,
                      margin: '2px 0',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FolderIcon size={13} color="var(--accent-blue)" />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-bright)' }}>
                          {ws.name}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            color: 'var(--accent-blue)',
                            fontWeight: 700,
                            padding: '1px 4px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            borderRadius: '2px',
                          }}
                        >
                          Coding Agent
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', paddingLeft: '22px' }}>
                        {ws.path}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isActive && <CheckIcon size={14} color="var(--accent-blue)" />}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteWorkspace(e, ws.id)}
                        title="Unlink Workspace"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '11px',
                          lineHeight: 1,
                          borderRadius: '2px',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#ef4444';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'var(--text-muted)';
                        }}
                      >
                        <CloseIcon size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}

            {(workspaces || []).filter((w) => !w.isHome).length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '6px 8px', fontStyle: 'italic' }}>
                No project workspaces registered yet. Click &quot;+ Add Workspace&quot; to link a repository.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
