import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchTunnelStatus,
  startTunnel,
  stopTunnel,
  installTunnel,
  type TunnelStatus,
  type StartTunnelOptions,
} from '../api/tunnel';
import { GlobeIcon, CloseIcon, RefreshCwIcon, ExternalLinkIcon, CopyIcon, CheckIcon } from './icons';

interface TunnelModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}

export const TunnelModal: React.FC<TunnelModalProps> = ({ isOpen, onClose, token }) => {
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Form states for starting tunnel
  const [mode, setMode] = useState<'quick' | 'token'>('quick');
  const [tunnelToken, setTunnelToken] = useState<string>('');
  const [targetPort, setTargetPort] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.location.port) {
      const p = parseInt(window.location.port, 10);
      if (!isNaN(p) && p > 0) return p;
    }
    return 3001;
  });
  const [showLogs, setShowLogs] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      const s = await fetchTunnelStatus(token);
      setStatus(s);
      if (s.running && !showLogs && s.logs && s.logs.length > 0) {
        // keep logs accessible
      }
    } catch (err: any) {
      // Don't override user action error with poll network glitch
    }
  }, [token, showLogs]);

  // Initial load when opened
  useEffect(() => {
    if (isOpen) {
      setActionError(null);
      setLoading(true);
      loadStatus().finally(() => setLoading(false));
    }
  }, [isOpen, loadStatus]);

  // Auto-poll when modal is open and tunnel is running or during transition
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      loadStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, [isOpen, loadStatus]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (showLogs && logsEndRef.current && typeof logsEndRef.current.scrollIntoView === 'function') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [showLogs, status?.logs]);

  // Keyboard navigation: Escape closes modal
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

  const handleStart = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const opts: StartTunnelOptions = {
        mode,
        port: targetPort,
      };
      if (mode === 'token' && tunnelToken.trim()) {
        opts.token = tunnelToken.trim();
      }
      const s = await startTunnel(token, opts);
      setStatus(s);
      setShowLogs(true);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to start tunnel');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const s = await stopTunnel(token);
      setStatus(s);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to stop tunnel');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInstall = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      const s = await installTunnel(token);
      setStatus(s);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to install cloudflared');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (!status?.url) return;
    navigator.clipboard.writeText(status.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const isRunning = Boolean(status?.running);
  const isInstalled = Boolean(status?.installed);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tunnel-modal-title"
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
          maxWidth: '680px',
          maxHeight: '90vh',
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
        {/* Header */}
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
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '2px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--accent-cyan-bright)',
                border: '1px solid var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <GlobeIcon size={13} />
              INGRESS
            </span>
            <span
              id="tunnel-modal-title"
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-bright)',
                letterSpacing: '0.8px',
              }}
            >
              CLOUDFLARE TUNNEL
            </span>

            {/* Status indicator */}
            {!isInstalled ? (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  padding: '1px 6px',
                  borderRadius: '2px',
                }}
              >
                ○ UNINSTALLED
              </span>
            ) : isRunning ? (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--accent-green-bright)',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '1px 6px',
                  borderRadius: '2px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span className="pulse-dot pulse-dot--online" />
                ● ACTIVE
              </span>
            ) : (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  padding: '1px 6px',
                  borderRadius: '2px',
                }}
              >
                ○ STOPPED
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => {
                setLoading(true);
                loadStatus().finally(() => setLoading(false));
              }}
              title="Refresh status"
              aria-label="Refresh status"
              disabled={loading || actionLoading}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <RefreshCwIcon size={12} className={loading ? 'spin' : ''} />
            </button>
            <button
              onClick={onClose}
              title="Close modal"
              aria-label="Close modal"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px',
                minWidth: '28px',
                minHeight: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Action or Runtime Error Display */}
          {(actionError || status?.error) && (
            <div
              style={{
                padding: '10px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid var(--accent-red)',
                borderRadius: '3px',
                color: 'var(--accent-red)',
                fontSize: '11px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontWeight: 700 }}>INGRESS ALERT //</span>
              <span>{actionError || status?.error}</span>
            </div>
          )}

          {/* STATE 1: Uninstalled */}
          {!isInstalled ? (
            <div
              style={{
                padding: '20px 16px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-amber-bright)' }}>
                  CLOUDFLARED NOT INSTALLED
                </span>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  Cloudflare Tunnel creates an encrypted, high-performance reverse proxy from your machine to Cloudflare's global edge network. This gives you secure remote access to AGY Online from mobile devices, tablets, and remote workstations without requiring port forwarding, router changes, or a public IP address.
                </p>
              </div>

              <div
                style={{
                  padding: '10px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                Clicking install downloads the official standalone <code>cloudflared</code> binary directly from Cloudflare's GitHub releases into <code>~/.agy-online/bin/cloudflared</code>.
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handleInstall}
                  disabled={actionLoading}
                  className="mecha-btn mecha-btn--primary"
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 700,
                    minHeight: '36px',
                  }}
                >
                  {actionLoading ? 'INSTALLING CLOUDFLARED...' : 'INSTALL CLOUDFLARED (1-CLICK)'}
                </button>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  or run in terminal: <code>pkg install cloudflared</code>
                </span>
              </div>
            </div>
          ) : isRunning ? (
            /* STATE 2: Active / Running */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Active Hero Box */}
              <div
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '3px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-green-bright)', letterSpacing: '0.8px' }}>
                    LIVE PUBLIC INGRESS URL
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    TARGET: localhost:{status?.port || targetPort}
                  </span>
                </div>

                {status?.url ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: '3px',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--accent-cyan-bright)',
                        wordBreak: 'break-all',
                        userSelect: 'all',
                      }}
                    >
                      {status.url}
                    </span>
                    <button
                      onClick={handleCopyUrl}
                      className="mecha-btn"
                      title="Copy Public URL"
                      aria-label="Copy Public URL"
                      style={{
                        padding: '6px 10px',
                        fontSize: '11px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                      }}
                    >
                      {copied ? <CheckIcon size={12} color="var(--accent-green-bright)" /> : <CopyIcon size={12} />}
                      <span>{copied ? 'COPIED' : 'COPY'}</span>
                    </button>
                    <a
                      href={status.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mecha-btn mecha-btn--primary"
                      title="Open Ingress in New Tab"
                      style={{
                        padding: '6px 10px',
                        fontSize: '11px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        textDecoration: 'none',
                        flexShrink: 0,
                      }}
                    >
                      <ExternalLinkIcon size={12} />
                      <span>OPEN ↗</span>
                    </a>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '3px',
                      color: 'var(--accent-amber-bright)',
                      fontSize: '12px',
                    }}
                  >
                    <span className="pulse-dot pulse-dot--executing" />
                    <span>Establishing Cloudflare edge connection... parsing ingress URL...</span>
                  </div>
                )}

                {/* Mobile remote instructions */}
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '2px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.5',
                  }}
                >
                  <strong style={{ color: 'var(--text-bright)' }}>Mobile & Remote Access: </strong>
                  Open the URL above in any mobile browser or tablet to access your active AGY sessions, AI chat, and task pipelines from anywhere with full biometric or token authentication.
                </div>
              </div>

              {/* Telemetry Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>MODE</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-bright)' }}>
                    {status?.mode === 'quick' ? 'QUICK (trycloudflare)' : 'TOKEN (Zero Trust)'}
                  </span>
                </div>

                <div
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>PID</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-bright)' }}>
                    {status?.pid || '--'}
                  </span>
                </div>

                <div
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>BINARY</span>
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={status?.binPath}
                  >
                    {status?.binPath ? status.binPath.split('/').pop() : 'cloudflared'}
                  </span>
                </div>
              </div>

              {/* Stop Tunnel Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="mecha-btn"
                  style={{
                    borderColor: 'rgba(239, 68, 68, 0.4)',
                    color: 'var(--accent-red)',
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {actionLoading ? 'STOPPING...' : 'STOP TUNNEL'}
                </button>
              </div>
            </div>
          ) : (
            /* STATE 3: Stopped / Ready to Launch */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}
            >
              {/* Ingress Mode Switcher */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.8px' }}>
                  INGRESS MODE //
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setMode('quick')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      borderRadius: '3px',
                      border: '1px solid',
                      borderColor: mode === 'quick' ? 'var(--accent-cyan)' : 'var(--border)',
                      backgroundColor: mode === 'quick' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                      color: mode === 'quick' ? 'var(--accent-cyan-bright)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    QUICK TUNNEL (trycloudflare)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('token')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      borderRadius: '3px',
                      border: '1px solid',
                      borderColor: mode === 'token' ? 'var(--accent-amber)' : 'var(--border)',
                      backgroundColor: mode === 'token' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                      color: mode === 'token' ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    NAMED TUNNEL (Cloudflare Zero Trust)
                  </button>
                </div>
              </div>

              {/* Mode Details & Inputs */}
              {mode === 'quick' ? (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    Quick tunnels generate a temporary, encrypted <code>https://*.trycloudflare.com</code> URL immediately without requiring a Cloudflare account or DNS configuration.
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Local Service Port:
                    </label>
                    <input
                      type="number"
                      value={targetPort}
                      onChange={(e) => setTargetPort(parseInt(e.target.value, 10) || 3001)}
                      style={{
                        width: '90px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-bright)',
                        borderRadius: '2px',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    Named tunnels connect to your Cloudflare Zero Trust account and route your custom domain directly to this machine.
                  </span>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Cloudflare Zero Trust Tunnel Token:
                    </label>
                    <input
                      type="password"
                      placeholder="eyJhIjoi..."
                      value={tunnelToken}
                      onChange={(e) => setTunnelToken(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-bright)',
                        borderRadius: '2px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Local Service Port:
                    </label>
                    <input
                      type="number"
                      value={targetPort}
                      onChange={(e) => setTargetPort(parseInt(e.target.value, 10) || 3001)}
                      style={{
                        width: '90px',
                        padding: '4px 8px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-bright)',
                        borderRadius: '2px',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Start Action Button */}
              <button
                onClick={handleStart}
                disabled={actionLoading || (mode === 'token' && !tunnelToken.trim())}
                className="mecha-btn mecha-btn--primary"
                style={{
                  padding: '10px 16px',
                  fontSize: '12px',
                  fontWeight: 700,
                  minHeight: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <GlobeIcon size={14} />
                <span>
                  {actionLoading
                    ? 'INITIALIZING CLOUDFLARE TUNNEL...'
                    : mode === 'quick'
                    ? 'START QUICK TUNNEL (trycloudflare)'
                    : 'START NAMED TUNNEL'}
                </span>
              </button>
            </div>
          )}

          {/* Collapsible Process Logs Section */}
          {isInstalled && status?.logs && status.logs.length > 0 && (
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: '3px',
                overflow: 'hidden',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              <button
                type="button"
                onClick={() => setShowLogs(!showLogs)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '10px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span>PROCESS TELEMETRY LOGS ({status.logs.length} LINES)</span>
                <span>{showLogs ? '▲ HIDE' : '▼ SHOW'}</span>
              </button>

              {showLogs && (
                <div
                  style={{
                    backgroundColor: '#050608',
                    padding: '10px 12px',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    borderTop: '1px solid var(--border)',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    color: '#a3e635',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {status.logs.map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '10px',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}
        >
          <span className="desktop-only">
            CLI: <code>./bin/agy-online tunnel [status|start|stop]</code>
          </span>
          <button
            onClick={onClose}
            className="mecha-btn"
            style={{
              padding: '4px 12px',
              fontSize: '11px',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
