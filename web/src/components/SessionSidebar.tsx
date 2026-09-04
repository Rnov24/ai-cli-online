import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useStore } from '../store';
import type { SessionStatus } from '../types';

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return 'just now';
  const diff = Math.max(0, Date.now() - timestamp);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function renderStatusBadge(status?: SessionStatus) {
  switch (status) {
    case 'RUNNING':
      return (
        <span className="tech-badge tech-badge--active" style={{ fontSize: '9px', padding: '1px 5px' }}>
          <span className="pulse-dot pulse-dot--executing" />
          RUNNING
        </span>
      );
    case 'ACTIVE':
      return (
        <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
          ● ACTIVE
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
          ✓ DONE
        </span>
      );
    case 'ERROR':
      return (
        <span className="tech-badge tech-badge--danger" style={{ fontSize: '9px', padding: '1px 5px' }}>
          ✕ ERROR
        </span>
      );
    case 'WAITING':
      return (
        <span className="tech-badge tech-badge--cyan" style={{ fontSize: '9px', padding: '1px 5px' }}>
          ⏳ WAITING
        </span>
      );
    case 'ARCHIVED':
      return (
        <span className="tech-badge" style={{ fontSize: '9px', padding: '1px 5px', color: 'var(--text-muted)' }}>
          ▪ ARCHIVED
        </span>
      );
    default:
      return (
        <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
          ○ IDLE
        </span>
      );
  }
}

interface SessionCardProps {
  tabId: string;
  isCurrent: boolean;
  onSelect: () => void;
}

function SessionCard({ tabId, isCurrent, onSelect }: SessionCardProps) {
  const tab = useStore((s) => s.tabs.find((t) => t.id === tabId));
  const closeTab = useStore((s) => s.closeTab);
  const reopenTab = useStore((s) => s.reopenTab);
  const deleteTab = useStore((s) => s.deleteTab);
  const renameTab = useStore((s) => s.renameTab);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (!tab) return null;

  const isOpen = tab.status === 'open';

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(tab.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 20);
  };

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tab.name) {
      renameTab(tabId, trimmed);
    }
    setEditing(false);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleReopen = (e: React.MouseEvent) => {
    e.stopPropagation();
    reopenTab(tabId);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete session "${tab.name}"? All associated background tasks will be closed.`)) return;
    await deleteTab(tabId);
  };

  return (
    <div
      onClick={onSelect}
      style={{
        padding: '10px 12px',
        margin: '3px 6px',
        borderRadius: '3px',
        cursor: 'pointer',
        border: isCurrent ? '1px solid var(--border-active)' : '1px solid var(--border)',
        borderLeft: isCurrent ? '3px solid var(--accent-amber)' : '3px solid transparent',
        backgroundColor: isCurrent ? 'var(--accent-amber-subtle)' : 'var(--bg-primary)',
        boxShadow: isCurrent ? '0 0 10px var(--accent-amber-glow)' : 'none',
        transition: 'all 0.15s ease',
        opacity: isOpen ? 1 : 0.6,
        fontFamily: 'var(--font-mono)',
      }}
      onMouseEnter={(e) => {
        if (!isCurrent) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        if (!isCurrent) e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
      }}
    >
      {/* Top row: Session ID & Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '9px',
            fontWeight: 700,
            color: isCurrent ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
            letterSpacing: '0.6px',
          }}>
            {tab.id.toUpperCase()}
          </span>
          {isCurrent && (
            <span style={{
              fontSize: '8px',
              fontWeight: 700,
              backgroundColor: 'var(--accent-amber)',
              color: '#000',
              padding: '0 4px',
              borderRadius: '2px',
            }}>
              CURRENT
            </span>
          )}
        </div>
        <div>
          {renderStatusBadge(isCurrent ? 'ACTIVE' : tab.sessionStatus)}
        </div>
      </div>

      {/* Center: Title / Rename input */}
      <div style={{ margin: '4px 0' }}>
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setEditing(false);
            }}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--accent-amber)',
              color: 'var(--text-bright)',
              borderRadius: '2px',
              padding: '2px 6px',
              fontSize: '12px',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <div
            onDoubleClick={startRename}
            style={{
              color: isCurrent ? 'var(--text-bright)' : 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: isCurrent ? 700 : 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={tab.name}
          >
            {tab.name}
          </div>
        )}
      </div>

      {/* Bottom row: Time, message count, and actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: '6px',
        paddingTop: '4px',
        borderTop: '1px dashed var(--border-subtle)',
        fontSize: '9px',
        color: 'var(--text-muted)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{formatRelativeTime(tab.updatedAt || tab.createdAt)}</span>
          {tab.messageCount !== undefined && tab.messageCount > 0 && (
            <>
              <span>·</span>
              <span>{tab.messageCount} msgs</span>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={startRename}
            title="Rename session"
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '9px',
              padding: '3px 6px',
              minHeight: '24px',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            [RENAME]
          </button>

          {isOpen ? (
            <button
              onClick={handleClose}
              title="Close session"
              style={{
                background: 'none',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '2px',
                color: 'var(--accent-red)',
                cursor: 'pointer',
                fontSize: '9px',
                padding: '3px 6px',
                minHeight: '24px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              [ARCHIVE]
            </button>
          ) : (
            <button
              onClick={handleReopen}
              title="Reopen session"
              style={{
                background: 'none',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '2px',
                color: 'var(--accent-green-bright)',
                cursor: 'pointer',
                fontSize: '9px',
                padding: '3px 6px',
                minHeight: '24px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              [REOPEN]
            </button>
          )}

          <button
            onClick={handleDelete}
            title="Permanently delete session"
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '2px 6px',
              minHeight: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// Component for orphaned server tmux sessions
function OrphanedSessionItem({ sessionId, active, createdAt }: {
  sessionId: string;
  active: boolean;
  createdAt: number;
}) {
  const addTerminal = useStore((s) => s.addTerminal);
  const killServerSession = useStore((s) => s.killServerSession);

  const handleClick = () => {
    addTerminal('horizontal', sessionId);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete tmux session "${sessionId}"?`)) return;
    killServerSession(sessionId);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '6px 10px',
        margin: '2px 6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: '2px',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-primary)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          backgroundColor: active ? 'var(--accent-green-bright)' : 'var(--text-muted)',
          flexShrink: 0,
        }} />
        <span style={{ color: 'var(--text-bright)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sessionId}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
          {formatRelativeTime(createdAt)}
        </span>
      </div>

      <button
        className="mecha-btn mecha-btn--danger"
        onClick={handleDelete}
        style={{ padding: '1px 5px', fontSize: '9px' }}
        title="Kill tmux process"
      >
        ×
      </button>
    </div>
  );
}

export function SessionSidebar() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const addTab = useStore((s) => s.addTab);
  const switchTab = useStore((s) => s.switchTab);
  const fetchSessions = useStore((s) => s.fetchSessions);
  const serverSessions = useStore((s) => (sidebarOpen ? s.serverSessions : []));
  const tabsLoading = useStore((s) => s.tabsLoading);

  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1024);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Poll server sessions when open
  useEffect(() => {
    if (!sidebarOpen) return;
    fetchSessions();
    const interval = setInterval(fetchSessions, 6000);
    return () => clearInterval(interval);
  }, [sidebarOpen, fetchSessions]);

  // Find orphaned tmux sessions
  const allTabTerminalIds = useMemo(() => new Set(tabs.flatMap((t) => t.terminalIds)), [tabs]);
  const orphanedSessions = useMemo(
    () => serverSessions.filter((s) => !allTabTerminalIds.has(s.sessionId)),
    [serverSessions, allTabTerminalIds],
  );

  // Search filter across titles, IDs, and cached chat text
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return tabs;
    const q = searchQuery.toLowerCase().trim();
    return tabs.filter((t) => {
      if (t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)) return true;
      const primaryTerm = t.terminalIds[0];
      if (primaryTerm) {
        const raw = localStorage.getItem(`chat-messages-${primaryTerm}`);
        if (raw && raw.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [tabs, searchQuery]);

  const activeTab = useMemo(
    () => filteredTabs.find((t) => t.id === activeTabId && t.status === 'open'),
    [filteredTabs, activeTabId],
  );

  const otherOpenTabs = useMemo(() => {
    return filteredTabs
      .filter((t) => t.status === 'open' && t.id !== activeTabId)
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  }, [filteredTabs, activeTabId]);

  const closedTabs = useMemo(() => {
    return filteredTabs
      .filter((t) => t.status === 'closed')
      .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  }, [filteredTabs]);

  const handleCreateNewSession = () => {
    addTab();
    if (isMobile) toggleSidebar();
  };

  const handleSelectSession = (id: string) => {
    switchTab(id);
    if (isMobile) toggleSidebar();
  };

  const panelContent = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      backgroundColor: 'var(--bg-secondary)',
      fontFamily: 'var(--font-mono)',
      userSelect: 'none',
      overflow: 'hidden',
    }}>
      {/* Panel Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
        height: '40px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-amber-bright)', letterSpacing: '1px' }}>
            SESSIONS // HISTORY
          </span>
          <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
            {tabs.filter((t) => t.status === 'open').length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="mecha-btn mecha-btn--primary"
            onClick={handleCreateNewSession}
            title="Create brand new session (+)"
            style={{ padding: '2px 8px', fontSize: '10px' }}
          >
            + NEW
          </button>
          <button
            onClick={toggleSidebar}
            title="Close sessions panel"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Session Search Input */}
      <div style={{
        padding: '8px 10px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 8px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
        }}>
          <span style={{ color: 'var(--accent-amber-bright)', fontSize: '11px', fontWeight: 700 }}>
            &gt;
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions & content..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-bright)',
              fontSize: '11px',
              fontFamily: 'inherit',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '10px',
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Session List Stream */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {/* Active Session */}
        {activeTab && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{
              padding: '4px 12px',
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--accent-amber-bright)',
              letterSpacing: '0.8px',
            }}>
              ● ACTIVE SESSION
            </div>
            <SessionCard
              key={activeTab.id}
              tabId={activeTab.id}
              isCurrent={true}
              onSelect={() => handleSelectSession(activeTab.id)}
            />
          </div>
        )}

        {/* Other Active Sessions */}
        {otherOpenTabs.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{
              padding: '4px 12px',
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.8px',
            }}>
              // RECENT SESSIONS ({otherOpenTabs.length})
            </div>
            {otherOpenTabs.map((t) => (
              <SessionCard
                key={t.id}
                tabId={t.id}
                isCurrent={false}
                onSelect={() => handleSelectSession(t.id)}
              />
            ))}
          </div>
        )}

        {/* Closed / Archived Sessions */}
        {closedTabs.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{
              padding: '4px 12px',
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.8px',
            }}>
              // ARCHIVED SESSIONS ({closedTabs.length})
            </div>
            {closedTabs.map((t) => (
              <SessionCard
                key={t.id}
                tabId={t.id}
                isCurrent={false}
                onSelect={() => handleSelectSession(t.id)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {filteredTabs.length === 0 && (
          <div style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '11px',
          }}>
            {searchQuery ? `No sessions matching "${searchQuery}"` : 'No sessions available.'}
          </div>
        )}

        {/* Orphaned Server TMUX Sessions */}
        {!tabsLoading && orphanedSessions.length > 0 && (
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
            <div style={{
              padding: '4px 12px',
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--accent-yellow)',
              letterSpacing: '0.8px',
            }}>
              // ORPHANED TMUX SESSIONS ({orphanedSessions.length})
            </div>
            {orphanedSessions.map((s) => (
              <OrphanedSessionItem
                key={s.sessionId}
                sessionId={s.sessionId}
                active={s.active}
                createdAt={s.createdAt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    if (!sidebarOpen) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 600 }}>
        <div className="drawer-backdrop" onClick={toggleSidebar} />
        <aside
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            width: 'min(320px, 85vw)',
            height: '100%',
            backgroundColor: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'var(--font-mono)',
            zIndex: 601,
            overflow: 'hidden',
            boxShadow: '8px 0 30px rgba(0,0,0,0.7)',
            animation: 'slide-in-left 0.2s ease-out',
          }}
        >
          {panelContent}
        </aside>
      </div>
    );
  }

  return (
    <aside
      className="session-sidebar"
      style={{
        width: sidebarOpen ? 320 : 0,
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: sidebarOpen ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        fontFamily: 'var(--font-mono)',
        zIndex: 25,
      }}
    >
      {panelContent}
    </aside>
  );
}
