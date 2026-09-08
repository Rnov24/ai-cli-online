import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useStore } from '../store';
import type { SessionStatus } from '../types';
import {
  fetchConversations,
  fetchConversationMessages,
  deleteConversation,
  ConversationSummary,
} from '../api/conversations';
import { useAdaptivePolling } from '../hooks/useAdaptivePolling';
import {
  CheckIcon,
  CloseIcon,
  HourglassIcon,
  EditIcon,
  TrashIcon,
  CopyIcon,
  ScrollIcon,
  TabsIcon,
  ChevronRightIcon,
} from './icons';

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
        <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          <CheckIcon size={10} /> DONE
        </span>
      );
    case 'ERROR':
      return (
        <span className="tech-badge tech-badge--danger" style={{ fontSize: '9px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          <CloseIcon size={10} /> ERROR
        </span>
      );
    case 'WAITING':
      return (
        <span className="tech-badge tech-badge--cyan" style={{ fontSize: '9px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          <HourglassIcon size={10} /> WAITING
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div
      className={`session-card ${isCurrent ? 'session-card--active' : ''}`}
      onClick={onSelect}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        margin: '3px 8px',
        borderRadius: '3px',
        border: isCurrent ? '1px solid var(--accent-amber-bright)' : '1px solid var(--border)',
        backgroundColor: isCurrent ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-primary)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          {renderStatusBadge(tab.sessionStatus)}
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {formatRelativeTime(tab.updatedAt || tab.createdAt)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
          {isOpen ? (
            <>
              <button
                className="session-card-btn"
                onClick={startRename}
                title="Rename session"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: '1px 4px',
                }}
              >
                <EditIcon size={11} />
              </button>
              <button
                className="session-card-btn"
                onClick={() => closeTab(tabId)}
                title="Archive / close session"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  padding: '1px 4px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </>
          ) : (
            <>
              <button
                className="session-card-btn"
                onClick={() => reopenTab(tabId)}
                title="Reopen archived session"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-amber-bright)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: '1px 4px',
                }}
              >
                ↺
              </button>
              <button
                className="session-card-btn session-card-btn--danger"
                onClick={() => deleteTab(tabId)}
                title="Permanently remove"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-red)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  padding: '1px 4px',
                }}
              >
                <TrashIcon size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              fontSize: '11px',
              fontFamily: 'inherit',
              padding: '1px 4px',
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--accent-amber)',
              borderRadius: '2px',
              color: 'var(--text-bright)',
              outline: 'none',
            }}
          />
        ) : (
          <span
            style={{
              fontSize: '11px',
              fontWeight: isCurrent ? 700 : 500,
              color: isCurrent ? 'var(--accent-amber-bright)' : 'var(--text-bright)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.name}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
        <span>ID: {tab.id}</span>
        <span>{tab.terminalIds.length} pane{tab.terminalIds.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}

interface OrphanedSessionItemProps {
  sessionId: string;
  active: boolean;
  createdAt: number;
}

function OrphanedSessionItem({ sessionId, active, createdAt }: OrphanedSessionItemProps) {
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        margin: '2px 8px',
        backgroundColor: 'var(--bg-primary)',
        border: '1px dashed var(--border)',
        borderRadius: '3px',
        fontSize: '10px',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: active ? 'var(--accent-green)' : 'var(--text-muted)' }}>●</span>
          <span style={{ fontWeight: 600, color: 'var(--text-bright)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            tmux: {sessionId}
          </span>
        </div>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
          Created {formatRelativeTime(createdAt)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          className="mecha-btn mecha-btn--primary"
          onClick={handleClick}
          style={{ fontSize: '9px', padding: '1px 6px' }}
          title="Attach to workspace tab"
        >
          Attach
        </button>
        <button
          onClick={handleDelete}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent-red)',
            cursor: 'pointer',
            fontSize: '11px',
            padding: '1px 4px',
          }}
          title="Kill tmux process"
        >
          ×
        </button>
      </div>
    </div>
  );
}

interface ConversationCardProps {
  conv: ConversationSummary;
  isActive: boolean;
  isResuming: boolean;
  onSelect: () => void;
  onCopyCli: () => void;
  onDelete: () => void;
}

function ConversationCard({
  conv,
  isActive,
  isResuming,
  onSelect,
  onCopyCli,
  onDelete,
}: ConversationCardProps) {
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(conv.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  return (
    <div
      className="conversation-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        margin: '4px 8px',
        borderRadius: '3px',
        border: isActive ? '1px solid var(--accent-amber-bright)' : '1px solid var(--border)',
        backgroundColor: isActive ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-primary)',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Top Metadata Row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
          {isActive ? (
            <span className="tech-badge tech-badge--active" style={{ fontSize: '9px', padding: '1px 5px' }}>
              <span className="pulse-dot pulse-dot--executing" />
              ACTIVE
            </span>
          ) : (
            <span className="tech-badge tech-badge--cyan" style={{ fontSize: '9px', padding: '1px 5px' }}>
              {conv.turnCount} {conv.turnCount === 1 ? 'turn' : 'turns'}
            </span>
          )}
          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            {formatRelativeTime(conv.updatedAt)}
          </span>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete this conversation history"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '11px',
            padding: '0 4px',
            lineHeight: 1,
            opacity: 0.6,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent-red)';
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.opacity = '0.6';
          }}
        >
          <TrashIcon size={11} />
        </button>
      </div>

      {/* Title & Preview */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: isActive ? 'var(--accent-amber-bright)' : 'var(--text-bright)',
            lineHeight: 1.35,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {conv.title}
        </div>

        {conv.preview && (
          <div
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {conv.preview}
          </div>
        )}
      </div>

      {/* ID & Action Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '2px',
          paddingTop: '6px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          gap: '6px',
        }}
      >
        <div
          onClick={handleCopyId}
          title={`Click to copy full ID: ${conv.id}`}
          style={{
            fontSize: '9px',
            color: copiedId ? 'var(--accent-green)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <span>ID: {conv.id.slice(0, 8)}...</span>
          <span style={{ fontSize: '9px', display: 'inline-flex', alignItems: 'center' }}>{copiedId ? <CheckIcon size={10} /> : <CopyIcon size={10} />}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            className="mecha-btn"
            onClick={(e) => {
              e.stopPropagation();
              onCopyCli();
            }}
            title="Copy 'agy --conversation <id>' CLI command"
            style={{ fontSize: '9px', padding: '2px 6px' }}
          >
            &gt;_ CLI
          </button>
          <button
            className="mecha-btn mecha-btn--primary"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            disabled={isResuming}
            title="Resume conversation in Chat view"
            style={{ fontSize: '9px', padding: '2px 8px', fontWeight: 700 }}
          >
            {isResuming ? 'LOADING...' : isActive ? 'CONTINUE' : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <ChevronRightIcon size={9} />
                <span>RESUME</span>
              </span>
            )}
          </button>
        </div>
      </div>
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
  const token = useStore((s) => s.token);

  // Tab View Mode: 'conversations' (AGY Brain History) vs 'tabs' (Workspace Panes)
  const [activeView, setActiveView] = useState<'conversations' | 'tabs'>('conversations');

  // Conversations state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [resumingConvId, setResumingConvId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1024);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Fetch AGY CLI Brain Conversations
  const loadConversations = useCallback(async () => {
    if (!token) return;
    setLoadingConversations(true);
    try {
      const res = await fetchConversations(token);
      if (res.ok && res.conversations) {
        setConversations(res.conversations);
      }
    } catch {
      // ignore
    } finally {
      setLoadingConversations(false);
    }
  }, [token]);

  // Load conversations and server sessions whenever the sidebar opens
  useEffect(() => {
    if (!sidebarOpen) return;
    loadConversations();
    fetchSessions();
  }, [sidebarOpen, loadConversations, fetchSessions]);

  useAdaptivePolling(fetchSessions, {
    intervalMs: 10000,
    backgroundIntervalMs: 0,
    enabled: sidebarOpen,
  });

  // Current active tab and active terminal
  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId && t.status === 'open'),
    [tabs, activeTabId],
  );
  const activeTerminalId = activeTab?.terminalIds[0] || 'default';

  // Read the active conversation ID from localStorage
  const activeConversationId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(`chat-conversation-${activeTerminalId}`) || '';
  }, [activeTerminalId, sidebarOpen]);

  // Handle Resuming a conversation in the AI Chat View
  const handleResumeConversation = async (conv: ConversationSummary) => {
    if (!token) return;
    setResumingConvId(conv.id);
    try {
      const res = await fetchConversationMessages(token, conv.id);
      if (res.ok && Array.isArray(res.messages)) {
        window.dispatchEvent(
          new CustomEvent('agy:resume-conversation', {
            detail: {
              targetSessionId: activeTerminalId,
              conversationId: conv.id,
              messages: res.messages,
            },
          }),
        );
        showToast(`Resumed: ${conv.title.slice(0, 30)}...`);
        if (isMobile) {
          toggleSidebar();
        }
      } else {
        showToast('Failed to load conversation history');
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || 'Failed to resume'}`);
    } finally {
      setResumingConvId(null);
    }
  };

  // Start a fresh new conversation
  const handleStartNewConversation = () => {
    window.dispatchEvent(
      new CustomEvent('agy:new-conversation', {
        detail: {
          targetSessionId: activeTerminalId,
        },
      }),
    );
    showToast('Started fresh new conversation');
    if (isMobile) {
      toggleSidebar();
    }
  };

  // Copy CLI resume command
  const handleCopyCliCommand = (convId: string) => {
    const cmd = `agy --conversation ${convId}`;
    navigator.clipboard.writeText(cmd);
    showToast(`Copied: ${cmd}`);
  };

  // Delete conversation
  const handleDeleteConversation = async (conv: ConversationSummary) => {
    if (!token) return;
    const ok = window.confirm(`Delete conversation "${conv.title}"?\n\nThis removes the history in ~/.gemini/antigravity-cli/brain/${conv.id}`);
    if (!ok) return;

    try {
      await deleteConversation(token, conv.id);
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      showToast('Conversation deleted');
    } catch (err: any) {
      showToast(`Delete failed: ${err?.message}`);
    }
  };

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.preview && c.preview.toLowerCase().includes(q)),
    );
  }, [conversations, searchQuery]);

  // Find orphaned tmux sessions
  const allTabTerminalIds = useMemo(() => new Set(tabs.flatMap((t) => t.terminalIds)), [tabs]);
  const orphanedSessions = useMemo(
    () => serverSessions.filter((s) => !allTabTerminalIds.has(s.sessionId)),
    [serverSessions, allTabTerminalIds],
  );

  // Search filter across tabs
  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return tabs;
    const q = searchQuery.toLowerCase().trim();
    return tabs.filter((t) => {
      if (t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [tabs, searchQuery]);

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

  const handleCreateNewTab = () => {
    addTab();
    if (isMobile) toggleSidebar();
  };

  const handleSelectTab = (id: string) => {
    switchTab(id);
    if (isMobile) toggleSidebar();
  };

  const panelContent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        backgroundColor: 'var(--bg-secondary)',
        fontFamily: 'var(--font-mono)',
        userSelect: 'none',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: '45px',
            left: '10px',
            right: '10px',
            zIndex: 100,
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--accent-amber-bright)',
            border: '1px solid var(--accent-amber)',
            padding: '6px 10px',
            borderRadius: '3px',
            fontSize: '10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Panel Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border)',
          height: '42px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-amber-bright)', letterSpacing: '1px' }}>
            {activeView === 'conversations' ? 'AGY HISTORY' : 'WORKSPACES'}
          </span>
          <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
            {activeView === 'conversations' ? conversations.length : tabs.filter((t) => t.status === 'open').length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {activeView === 'conversations' ? (
            <button
              className="mecha-btn mecha-btn--primary"
              onClick={handleStartNewConversation}
              title="Start a fresh conversation (+)"
              style={{ padding: '2px 8px', fontSize: '10px' }}
            >
              + NEW CHAT
            </button>
          ) : (
            <button
              className="mecha-btn mecha-btn--primary"
              onClick={handleCreateNewTab}
              title="Create brand new workspace tab (+)"
              style={{ padding: '2px 8px', fontSize: '10px' }}
            >
              + NEW TAB
            </button>
          )}

          <button
            onClick={loadConversations}
            title="Refresh history from ~/.gemini/antigravity-cli/brain"
            style={{
              background: 'none',
              border: 'none',
              color: loadingConversations ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '12px',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ↻
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

      {/* View Switcher Pills */}
      <div
        style={{
          display: 'flex',
          padding: '4px 8px',
          backgroundColor: 'var(--bg-base)',
          borderBottom: '1px solid var(--border)',
          gap: '4px',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setActiveView('conversations')}
          style={{
            flex: 1,
            padding: '4px 6px',
            fontSize: '10px',
            fontFamily: 'inherit',
            fontWeight: activeView === 'conversations' ? 700 : 500,
            color: activeView === 'conversations' ? 'var(--accent-amber-bright)' : 'var(--text-muted)',
            backgroundColor: activeView === 'conversations' ? 'var(--bg-secondary)' : 'transparent',
            border: activeView === 'conversations' ? '1px solid var(--border)' : '1px solid transparent',
            borderRadius: '3px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <ScrollIcon size={12} /> AGY Conversations ({conversations.length})
          </span>
        </button>
        <button
          onClick={() => setActiveView('tabs')}
          style={{
            flex: 1,
            padding: '4px 6px',
            fontSize: '10px',
            fontFamily: 'inherit',
            fontWeight: activeView === 'tabs' ? 700 : 500,
            color: activeView === 'tabs' ? 'var(--accent-amber-bright)' : 'var(--text-muted)',
            backgroundColor: activeView === 'tabs' ? 'var(--bg-secondary)' : 'transparent',
            border: activeView === 'tabs' ? '1px solid var(--border)' : '1px solid transparent',
            borderRadius: '3px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <TabsIcon size={12} /> Panes & Tabs ({tabs.filter((t) => t.status === 'open').length})
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div
        style={{
          padding: '6px 10px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
          }}
        >
          <span style={{ color: 'var(--accent-amber-bright)', fontSize: '11px', fontWeight: 700 }}>&gt;</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeView === 'conversations' ? 'Search conversations & prompts...' : 'Search workspace tabs...'}
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

      {/* Main Content Stream */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {activeView === 'conversations' ? (
          <>
            {/* Conversations List */}
            {filteredConversations.length > 0 ? (
              filteredConversations.map((c) => (
                <ConversationCard
                  key={c.id}
                  conv={c}
                  isActive={activeConversationId === c.id}
                  isResuming={resumingConvId === c.id}
                  onSelect={() => handleResumeConversation(c)}
                  onCopyCli={() => handleCopyCliCommand(c.id)}
                  onDelete={() => handleDeleteConversation(c)}
                />
              ))
            ) : (
              <div
                style={{
                  padding: '30px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span>
                  {searchQuery
                    ? `No conversations matching "${searchQuery}"`
                    : loadingConversations
                      ? 'Loading AGY conversations from brain...'
                      : 'No AGY conversations found in ~/.gemini/antigravity-cli/brain'}
                </span>
                {!searchQuery && (
                  <button
                    className="mecha-btn mecha-btn--primary"
                    onClick={handleStartNewConversation}
                    style={{ fontSize: '10px', padding: '4px 12px' }}
                  >
                    + Start New Conversation
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Active Tab */}
            {activeTab && (
              <div style={{ marginBottom: '10px' }}>
                <div
                  style={{
                    padding: '4px 12px',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: 'var(--accent-amber-bright)',
                    letterSpacing: '0.8px',
                  }}
                >
                  ● ACTIVE TAB
                </div>
                <SessionCard
                  key={activeTab.id}
                  tabId={activeTab.id}
                  isCurrent={true}
                  onSelect={() => handleSelectTab(activeTab.id)}
                />
              </div>
            )}

            {/* Other Active Tabs */}
            {otherOpenTabs.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div
                  style={{
                    padding: '4px 12px',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.8px',
                  }}
                >
                  // OPEN TABS ({otherOpenTabs.length})
                </div>
                {otherOpenTabs.map((t) => (
                  <SessionCard
                    key={t.id}
                    tabId={t.id}
                    isCurrent={false}
                    onSelect={() => handleSelectTab(t.id)}
                  />
                ))}
              </div>
            )}

            {/* Closed Tabs */}
            {closedTabs.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <div
                  style={{
                    padding: '4px 12px',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.8px',
                  }}
                >
                  // ARCHIVED TABS ({closedTabs.length})
                </div>
                {closedTabs.map((t) => (
                  <SessionCard
                    key={t.id}
                    tabId={t.id}
                    isCurrent={false}
                    onSelect={() => handleSelectTab(t.id)}
                  />
                ))}
              </div>
            )}

            {/* Orphaned Server TMUX Sessions */}
            {!tabsLoading && orphanedSessions.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                <div
                  style={{
                    padding: '4px 12px',
                    fontSize: '9px',
                    fontWeight: 700,
                    color: 'var(--accent-yellow)',
                    letterSpacing: '0.8px',
                  }}
                >
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
          </>
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
            width: 'min(360px, 90vw)',
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
        width: sidebarOpen ? 340 : 0,
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
