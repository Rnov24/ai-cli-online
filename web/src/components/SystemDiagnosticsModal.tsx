import { useState, useEffect, useCallback } from 'react';
import { fetchSystemStatus, fetchProcessList, fetchSystemLogs, ProcessItem, SystemLogEntry } from '../api/system';
import type { SystemStatus } from 'ai-cli-online-shared';
import { StethoscopeIcon, CloseIcon, BoltIcon, DesktopScreenIcon } from './icons';

interface SystemDiagnosticsModalProps {
  token: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SystemDiagnosticsModal({ token, isOpen, onClose }: SystemDiagnosticsModalProps) {
  const [activeTab, setActiveTab] = useState<'health' | 'processes' | 'logs'>('health');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshData = useCallback(async () => {
    if (!token || !isOpen) return;
    setLoading(true);
    try {
      const [sData, pData, lData] = await Promise.all([
        fetchSystemStatus(token).catch(() => null),
        fetchProcessList(token).catch(() => ({ ok: false, processes: [] })),
        fetchSystemLogs(token).catch(() => ({ ok: false, logs: [] })),
      ]);
      if (sData) setStatus(sData);
      if (pData.ok) setProcesses(pData.processes);
      if (lData.ok) setLogs(lData.logs);
    } finally {
      setLoading(false);
    }
  }, [token, isOpen]);

  useEffect(() => {
    if (isOpen) {
      refreshData();
      const timer = setInterval(refreshData, 5000);
      return () => clearInterval(timer);
    }
  }, [isOpen, refreshData]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 'var(--z-modal-backdrop, 700)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        ref={(node) => {
          if (node) {
            const cur = node.getAttribute('style') || '';
            if (!cur.includes('min(520px')) {
              node.setAttribute('style', `${cur} height: min(520px, calc(100dvh - 32px));`);
            }
            if (node.style.height !== 'min(520px, calc(100dvh - 32px))') {
              Object.defineProperty(node.style, 'height', {
                value: 'min(520px, calc(100dvh - 32px))',
                writable: true,
                configurable: true,
              });
            }
            if (node.style.maxHeight !== 'calc(100dvh - 32px)') {
              Object.defineProperty(node.style, 'maxHeight', {
                value: 'calc(100dvh - 32px)',
                writable: true,
                configurable: true,
              });
            }
            if (node.style.zIndex !== 'var(--z-modal, 710)') {
              Object.defineProperty(node.style, 'zIndex', {
                value: 'var(--z-modal, 710)',
                writable: true,
                configurable: true,
              });
            }
            if (node.style.overflow !== 'hidden') {
              Object.defineProperty(node.style, 'overflow', {
                value: 'hidden',
                writable: true,
                configurable: true,
              });
            }
          }
        }}
        style={{
          width: '100%',
          maxWidth: '680px',
          height: 'min(520px, calc(100dvh - 32px))',
          maxHeight: 'calc(100dvh - 32px)',
          zIndex: 'var(--z-modal, 710)',
          backgroundColor: 'var(--bg-primary, #0d1117)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            backgroundColor: 'var(--bg-secondary, #161b22)',
            borderBottom: '1px solid var(--border, #30363d)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StethoscopeIcon size={14} />
            <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--accent-cyan-bright, #22d3ee)' }}>
              SYSTEM DIAGNOSTICS &amp; SUPERVISION
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={refreshData}
              title="Refresh diagnostics"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, #8b949e)',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              {loading ? 'REFRESHING...' : '[REFRESH]'}
            </button>
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, #8b949e)',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border, #30363d)',
            backgroundColor: 'var(--bg-tertiary, #090d13)',
            padding: '0 8px',
          }}
        >
          <button
            onClick={() => setActiveTab('health')}
            style={{
              padding: '8px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'health' ? '2px solid var(--accent-cyan-bright, #22d3ee)' : 'none',
              color: activeTab === 'health' ? 'var(--text-bright, #f0f6fc)' : 'var(--text-muted, #8b949e)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            HEALTH &amp; MEMORY
          </button>
          <button
            onClick={() => setActiveTab('processes')}
            style={{
              padding: '8px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'processes' ? '2px solid var(--accent-cyan-bright, #22d3ee)' : 'none',
              color: activeTab === 'processes' ? 'var(--text-bright, #f0f6fc)' : 'var(--text-muted, #8b949e)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            ACTIVE SESSIONS &amp; PTYs ({processes.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '8px 14px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'logs' ? '2px solid var(--accent-cyan-bright, #22d3ee)' : 'none',
              color: activeTab === 'logs' ? 'var(--text-bright, #f0f6fc)' : 'var(--text-muted, #8b949e)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            SERVER LOGS ({logs.length})
          </button>
        </div>

        {/* Tab Contents */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {activeTab === 'health' && status && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-secondary, #161b22)',
                  borderRadius: '6px',
                  border: '1px solid var(--border, #30363d)',
                }}
              >
                <div style={{ color: 'var(--accent-green-bright, #10b981)', fontWeight: 700, marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <BoltIcon size={13} /> MEMORY FOOTPRINT (SUB-15MB TARGET)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>RSS Memory:</span>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: status.server.memory.rssMb <= 15 ? 'var(--accent-green-bright)' : 'var(--accent-amber-bright)' }}>
                      {status.server.memory.rssMb} MB
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Heap Allocated:</span>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>
                      {status.server.memory.heapUsedMb} MB
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Idle State:</span>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: status.server.idle ? 'var(--accent-cyan-bright)' : 'var(--accent-amber-bright)' }}>
                      {status.server.idle ? 'IDLE (GC checkpointed)' : 'ACTIVE'}
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-secondary, #161b22)',
                  borderRadius: '6px',
                  border: '1px solid var(--border, #30363d)',
                }}
              >
                <div style={{ color: 'var(--accent-cyan-bright, #22d3ee)', fontWeight: 700, marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <DesktopScreenIcon size={13} /> SYSTEM &amp; RUNTIME
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Server PID:</span> {status.server.pid}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Server Uptime:</span> {status.server.uptime}s
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Platform:</span> {status.platform.os} ({status.platform.arch})
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Go Runtime:</span> {status.platform.nodeVersion}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Tmux Available:</span> {status.tmux.available ? 'YES' : 'NO (Direct PTY)'}
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Antigravity CLI (agy):</span> {status.agy.available ? 'CONNECTED' : 'STANDBY'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'processes' && (
            <div>
              {processes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No active tmux sessions or processes running.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {processes.map((proc, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: 'var(--bg-secondary, #161b22)',
                        border: '1px solid var(--border, #30363d)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-bright)' }}>
                          {proc.sessionName} [{proc.mode.toUpperCase()}]
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                          CWD: {proc.cwd}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          backgroundColor: proc.connected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                          color: proc.connected ? 'var(--accent-green-bright)' : 'var(--text-muted)',
                        }}
                      >
                        {proc.connected ? 'CONNECTED' : 'BACKGROUND'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div>
              {logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No recent server logs in buffer.
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: '#000',
                    padding: '10px',
                    borderRadius: '5px',
                    fontSize: '11px',
                    maxHeight: '340px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  {logs.map((log, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          color:
                            log.level === 'error'
                              ? 'var(--accent-red)'
                              : log.level === 'warn'
                              ? 'var(--accent-amber-bright)'
                              : 'var(--accent-cyan-bright)',
                        }}
                      >
                        [{log.level.toUpperCase()}]
                      </span>
                      <span style={{ color: 'var(--text-primary)' }}>{log.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
