import React, { useState, useEffect } from 'react';
import { PlanPanel } from './PlanPanel';
import { WorkspaceFilesPanel } from './WorkspaceFilesPanel';
import { GitHistoryPanel } from './GitHistoryPanel';
import type { SystemStatus } from 'ai-cli-online-shared';

interface ContextPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'agent' | 'tasks' | 'files' | 'git';
  onTabChange: (tab: 'agent' | 'tasks' | 'files' | 'git') => void;
  sessionId: string;
  token: string;
  systemStatus: SystemStatus | null;
  messageCount: number;
  toolCallCount: number;
  totalTokens: number;
  onExecuteCommand: (cmd: string) => void;
}

const AVAILABLE_TOOLS = [
  { name: 'run_command', desc: 'Shell / Terminal Execution' },
  { name: 'view_file', desc: 'Read File Chunk & Text' },
  { name: 'write_to_file', desc: 'Write & Create New Files' },
  { name: 'replace_file_content', desc: 'Exact Pattern Code Edit' },
  { name: 'grep_search', desc: 'Fast Ripgrep Regex Search' },
  { name: 'find_by_name', desc: 'Fuzzy File Search via FD' },
  { name: 'search_web', desc: 'Live Internet Search' },
  { name: 'read_url_content', desc: 'Fetch URL Content as Markdown' },
  { name: 'manage_task', desc: 'Background Process Lifecycle' },
  { name: 'schedule', desc: 'One-Shot Timer & Cron Daemon' },
];

export const ContextPanel = React.memo(function ContextPanel({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  sessionId,
  token,
  systemStatus,
  messageCount,
  toolCallCount,
  totalTokens,
  onExecuteCommand,
}: ContextPanelProps) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 1024);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!isOpen) return null;

  const panelContent = (
    <>
      {/* Panel Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)',
        height: '38px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-amber-bright)' }}>
            SYSTEM // CONTEXT
          </span>
          <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
            ACTIVE
          </span>
        </div>
        <button
          onClick={onClose}
          title="Collapse context panel"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            padding: '2px 4px',
          }}
        >
          ➔
        </button>
      </div>

      {/* Tabs bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        height: '32px',
        gap: '4px',
        flexShrink: 0,
      }}>
        {(['agent', 'tasks', 'files', 'git'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              style={{
                flex: 1,
                padding: '4px 0',
                fontSize: '10px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
                border: 'none',
                background: isActive ? 'var(--accent-amber-subtle)' : 'transparent',
                borderBottom: isActive ? '2px solid var(--accent-amber)' : '2px solid transparent',
                cursor: 'pointer',
                textAlign: 'center',
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                transition: 'all 0.15s ease',
              }}
            >
              {tab === 'agent' && 'AGENT'}
              {tab === 'tasks' && 'TASKS'}
              {tab === 'files' && 'FILES'}
              {tab === 'git' && 'GIT'}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {activeTab === 'agent' && (
          <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Agent Core Status Box */}
            <div style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '3px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  AGENT IDENTITY //
                </span>
                <span className="tech-badge tech-badge--online">
                  <span className="pulse-dot pulse-dot--online" /> ONLINE
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '4px' }}>
                Google Antigravity Engine
              </div>
              <div style={{ fontSize: '11px', color: 'var(--accent-cyan-bright)' }}>
                Model: Gemini 3.8 Flash (High)
              </div>
            </div>

            {/* Session Telemetry Readout */}
            <div style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '3px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-amber-bright)', marginBottom: '8px' }}>
                SESSION METRICS //
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontSize: '11px',
              }}>
                <div style={{ padding: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>TOTAL MESSAGES</div>
                  <div style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{messageCount}</div>
                </div>
                <div style={{ padding: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>TOOL CALLS</div>
                  <div style={{ color: 'var(--accent-cyan-bright)', fontWeight: 700 }}>{toolCallCount}</div>
                </div>
                <div style={{ padding: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>TOKENS BILLED</div>
                  <div style={{ color: 'var(--accent-amber-bright)', fontWeight: 700 }}>
                    {totalTokens > 0 ? `${(totalTokens / 1000).toFixed(1)}k` : '--'}
                  </div>
                </div>
                <div style={{ padding: '6px', backgroundColor: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '9px' }}>SESSION ID</div>
                  <div style={{ color: 'var(--text-bright)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sessionId}
                  </div>
                </div>
              </div>
            </div>

            {/* Runtime Telemetry (if available) */}
            {systemStatus && (
              <div style={{
                padding: '10px 12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  RUNTIME ENVIRONMENT //
                </div>
                <div style={{ fontSize: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>PID</span>
                    <span style={{ color: 'var(--text-bright)' }}>{systemStatus.server.pid}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Memory RSS</span>
                    <span style={{ color: 'var(--accent-green-bright)' }}>{systemStatus.server.memory.rssMb} MB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Platform</span>
                    <span style={{ color: 'var(--text-bright)' }}>
                      {systemStatus.platform.isTermux ? 'Android Termux' : `${systemStatus.platform.os}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Tmux Sessions</span>
                    <span style={{ color: 'var(--text-bright)' }}>{systemStatus.tmux.sessionsCount}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Available Autonomous Tools */}
            <div style={{
              padding: '10px 12px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: '3px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                AVAILABLE CAPABILITIES ({AVAILABLE_TOOLS.length}) //
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {AVAILABLE_TOOLS.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 6px',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderRadius: '2px',
                      fontSize: '10px',
                    }}
                  >
                    <span style={{ color: 'var(--accent-cyan-bright)', fontWeight: 600 }}>{t.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <PlanPanel
            sessionId={sessionId}
            token={token}
            connected={true}
            onSendToTerminal={onExecuteCommand}
          />
        )}

        {activeTab === 'files' && (
          <WorkspaceFilesPanel
            sessionId={sessionId}
            token={token}
          />
        )}

        {activeTab === 'git' && (
          <GitHistoryPanel
            sessionId={sessionId}
            token={token}
          />
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 600 }}>
        <div className="drawer-backdrop" onClick={onClose} />
        <aside
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            bottom: 0,
            width: 'min(360px, 90vw)',
            height: '100%',
            backgroundColor: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'var(--font-mono)',
            zIndex: 601,
            overflow: 'hidden',
            boxShadow: '-8px 0 30px rgba(0,0,0,0.7)',
            animation: 'slide-in-right 0.2s ease-out',
          }}
        >
          {panelContent}
        </aside>
      </div>
    );
  }

  return (
    <aside
      style={{
        width: '320px',
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        zIndex: 25,
        overflow: 'hidden',
      }}
    >
      {panelContent}
    </aside>
  );
});

ContextPanel.displayName = 'ContextPanel';
