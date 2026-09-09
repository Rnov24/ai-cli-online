import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchSubagents, type SubagentItem } from '../api/subagents';
import { CloseIcon } from './icons';

interface SubagentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  initialSubagentId?: string;
  parentId?: string;
  onOpenConversation?: (conversationId: string) => void;
}

export function SubagentsModal({
  isOpen,
  onClose,
  token,
  initialSubagentId,
  parentId,
  onOpenConversation,
}: SubagentsModalProps) {
  const [subagents, setSubagents] = useState<SubagentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'done' | 'error'>('all');
  const [selectedSubagentId, setSelectedSubagentId] = useState<string | null>(initialSubagentId || null);
  const [copiedId, setCopiedId] = useState(false);

  const loadSubagents = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSubagents(token, {
        parentId,
        status: statusFilter,
        query: searchQuery,
      });
      setSubagents(res.subagents || []);
      if (initialSubagentId && !selectedSubagentId) {
        setSelectedSubagentId(initialSubagentId);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load subagents');
    } finally {
      setLoading(false);
    }
  }, [token, parentId, statusFilter, searchQuery, initialSubagentId, selectedSubagentId]);

  useEffect(() => {
    if (isOpen) {
      loadSubagents();
      if (initialSubagentId) {
        setSelectedSubagentId(initialSubagentId);
      }
    }
  }, [isOpen, loadSubagents, initialSubagentId]);

  // Keyboard navigation & dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const selectedSubagent = useMemo(() => {
    return subagents.find((s) => s.id === selectedSubagentId) || null;
  }, [subagents, selectedSubagentId]);

  const copySubagentId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subagent-explorer-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1080px',
          maxHeight: '90vh',
          height: '840px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-strong, #363c46)',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '2px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--accent-purple, #a78bfa)',
                fontWeight: 700,
                letterSpacing: '0.8px',
              }}
            >
              TELEMETRY
            </span>
            <span
              id="subagent-explorer-title"
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-bright)',
                letterSpacing: '0.5px',
              }}
            >
              SUBAGENT EXPLORER
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>//</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              {subagents.length} SUBAGENTS INDEXED
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '36px',
              minWidth: '36px',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          {/* Search Input */}
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subagents by role, task, or ID..."
              aria-label="Search subagents"
              style={{
                width: '100%',
                padding: '8px 10px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Status Filter Buttons */}
          <div
            style={{
              display: 'inline-flex',
              borderRadius: '3px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              backgroundColor: 'var(--bg-primary)',
            }}
          >
            {(['all', 'running', 'done', 'error'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                data-testid={`filter-${st}`}
                style={{
                  background: statusFilter === st ? 'var(--bg-hover)' : 'transparent',
                  color:
                    statusFilter === st
                      ? 'var(--accent-amber-bright)'
                      : 'var(--text-muted)',
                  border: 'none',
                  borderRight: st !== 'error' ? '1px solid var(--border)' : 'none',
                  padding: '8px 12px',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  fontWeight: statusFilter === st ? 700 : 400,
                  textTransform: 'uppercase',
                  minHeight: '44px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {st === 'running' && <span className="pulse-dot pulse-dot--executing" />}
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Main Body: Subagents List + Detail Inspection Drawer */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            overflow: 'hidden',
            flexDirection: 'row',
          }}
          className="subagents-modal-body"
        >
          {/* Subagent List Column */}
          <div
            style={{
              flex: selectedSubagent ? '0 0 420px' : '1',
              borderRight: selectedSubagent ? '1px solid var(--border)' : 'none',
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backgroundColor: 'var(--bg-primary)',
            }}
          >
            {loading && subagents.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '24px',
                  color: 'var(--accent-cyan-bright)',
                  fontSize: '12px',
                  justifyContent: 'center',
                }}
              >
                <span className="pulse-dot pulse-dot--executing" />
                <span>INDEXING BRAIN CONVERSATIONS...</span>
              </div>
            ) : error ? (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--accent-red)',
                  borderRadius: '3px',
                  color: 'var(--accent-red)',
                  fontSize: '11px',
                }}
              >
                Error: {error}
              </div>
            ) : subagents.length === 0 ? (
              <div
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '11px',
                }}
              >
                No subagents found matching filters.
              </div>
            ) : (
              subagents.map((sub) => {
                const isSelected = sub.id === selectedSubagentId;
                const dateStr = new Date(sub.updatedAt || sub.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <div
                    key={sub.id}
                    data-testid={`subagent-card-${sub.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSubagentId(sub.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedSubagentId(sub.id);
                      }
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '3px',
                      border: isSelected
                        ? '1px solid var(--accent-amber-bright)'
                        : '1px solid var(--border)',
                      borderLeft:
                        sub.status === 'error'
                          ? '3px solid var(--accent-red)'
                          : sub.status === 'running'
                            ? '3px solid var(--accent-amber)'
                            : '3px solid var(--accent-cyan)',
                      backgroundColor: isSelected
                        ? 'var(--bg-secondary)'
                        : 'var(--bg-tertiary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: 'var(--text-bright)',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          /{sub.role}
                        </span>
                        <span
                          style={{
                            fontSize: '9px',
                            padding: '1px 4px',
                            borderRadius: '2px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border)',
                            color: 'var(--accent-cyan)',
                          }}
                        >
                          {sub.typeName}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <div style={{ flexShrink: 0 }}>
                        {sub.status === 'running' && (
                          <span className="tech-badge tech-badge--active" style={{ fontSize: '9px', padding: '1px 5px' }}>
                            <span className="pulse-dot pulse-dot--executing" />
                            RUNNING
                          </span>
                        )}
                        {sub.status === 'done' && (
                          <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
                            ● COMPLETE
                          </span>
                        )}
                        {sub.status === 'error' && (
                          <span className="tech-badge tech-badge--danger" style={{ fontSize: '9px', padding: '1px 5px' }}>
                            ● STOPPED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Task summary prompt snippet */}
                    {sub.prompt && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {sub.prompt}
                      </div>
                    )}

                    {/* Footer telemetry */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        paddingTop: '2px',
                        borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.05))',
                      }}
                    >
                      <span>{sub.toolCount} tools executed</span>
                      <span>{dateStr}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Subagent Detail Inspection Drawer */}
          {selectedSubagent && (
            <div
              data-testid="subagent-inspection-drawer"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                backgroundColor: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Drawer Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '10px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-bright)' }}>
                      /{selectedSubagent.role}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '2px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        color: 'var(--accent-purple, #a78bfa)',
                      }}
                    >
                      {selectedSubagent.typeName}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '2px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      MODEL: {selectedSubagent.model}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>ID: {selectedSubagent.id}</span>
                    <button
                      onClick={() => copySubagentId(selectedSubagent.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: copiedId ? 'var(--accent-green-bright)' : 'var(--accent-cyan-bright)',
                        cursor: 'pointer',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        padding: 0,
                      }}
                    >
                      {copiedId ? '[COPIED]' : '[COPY ID]'}
                    </button>
                    {onOpenConversation && (
                      <button
                        onClick={() => {
                          onOpenConversation(selectedSubagent.id);
                          onClose();
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-cyan-bright)',
                          cursor: 'pointer',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          padding: 0,
                        }}
                      >
                        [OPEN IN CHAT ↗]
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  {selectedSubagent.status === 'running' && (
                    <span className="tech-badge tech-badge--active" style={{ fontSize: '10px', padding: '2px 8px' }}>
                      <span className="pulse-dot pulse-dot--executing" />
                      RUNNING
                    </span>
                  )}
                  {selectedSubagent.status === 'done' && (
                    <span className="tech-badge tech-badge--online" style={{ fontSize: '10px', padding: '2px 8px' }}>
                      ● COMPLETE
                    </span>
                  )}
                  {selectedSubagent.status === 'error' && (
                    <span className="tech-badge tech-badge--danger" style={{ fontSize: '10px', padding: '2px 8px' }}>
                      ● STOPPED
                    </span>
                  )}
                </div>
              </div>

              {/* Worktree path */}
              {selectedSubagent.worktreeUri && (
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                    // WORKTREE URI
                  </div>
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRadius: '2px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      fontSize: '10px',
                      color: 'var(--accent-cyan-bright)',
                      wordBreak: 'break-all',
                    }}
                  >
                    {selectedSubagent.worktreeUri}
                  </div>
                </div>
              )}

              {/* Task Prompt Instructions */}
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                  // TASK INSTRUCTIONS & PROMPT
                </div>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '2px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    lineHeight: 1.5,
                    maxHeight: '220px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--text-primary)',
                  }}
                >
                  {selectedSubagent.prompt || 'No prompt instructions available.'}
                </div>
              </div>

              {/* Execution Completion Report */}
              {selectedSubagent.report && (
                <div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                    // EXECUTION REPORT
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '10px 12px',
                      borderRadius: '2px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      fontSize: '11px',
                      lineHeight: 1.5,
                      maxHeight: '320px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: 'var(--accent-green-bright)',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {selectedSubagent.report}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
