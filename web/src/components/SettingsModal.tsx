import { useState, useEffect } from 'react';
import { useStore } from '../store';
import type { SystemStatus } from 'agy-online-shared';
import { SettingsIcon, CloseIcon, MoonIcon, SunIcon, LogoutIcon, MinusIcon, PlusIcon, UserIcon, GlobeIcon } from './icons';
import { fetchAgyProfiles } from '../api/agyProfiles';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemStatus: SystemStatus | null;
}

export function SettingsModal({ isOpen, onClose, systemStatus }: SettingsModalProps) {
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const token = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);

  const [activeAgyProfile, setActiveAgyProfile] = useState<string>('default');

  useEffect(() => {
    if (isOpen) {
      fetchAgyProfiles(token || undefined)
        .then((res) => {
          if (res && res.current) {
            setActiveAgyProfile(res.current);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, token]);

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-amber-bright)', display: 'inline-flex', alignItems: 'center' }}>
              <SettingsIcon size={14} />
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-bright)',
              letterSpacing: '0.8px',
            }}>
              SYSTEM CONFIGURATION &amp; DIAGNOSTICS
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '15px',
              minWidth: '32px',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '16px',
          maxHeight: 'min(480px, calc(100dvh - 120px))',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          {/* Theme & Display */}
          <div style={{
            padding: '12px',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
          }}>
            <div style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--accent-amber-bright)',
              marginBottom: '10px',
            }}>
              DISPLAY &amp; APPEARANCE //
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  Active Color Theme
                </div>
                <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  Mecha Dark (#08090B) or Industrial Lab Light
                </div>
              </div>
              <button
                className="mecha-btn"
                onClick={toggleTheme}
                style={{ padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {theme === 'dark' ? <><MoonIcon size={12} /> MECHA DARK</> : <><SunIcon size={12} /> INDUSTRIAL LIGHT</>}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  Terminal &amp; Workspace Font Size
                </div>
                <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  Scales editor and telemetry readout font
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="mecha-btn"
                  onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                  disabled={fontSize <= 10}
                  aria-label="Decrease font size"
                  title="Decrease font size"
                  style={{ minWidth: '32px', minHeight: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <MinusIcon size={12} />
                </button>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-bright)',
                  minWidth: '28px',
                  textAlign: 'center',
                }}>
                  {fontSize}px
                </span>
                <button
                  className="mecha-btn"
                  onClick={() => setFontSize(Math.min(24, fontSize + 1))}
                  disabled={fontSize >= 24}
                  aria-label="Increase font size"
                  title="Increase font size"
                  style={{ minWidth: '32px', minHeight: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <PlusIcon size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* System Telemetry & Diagnostics */}
          {systemStatus && (
            <div style={{
              padding: '12px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '3px',
            }}>
              <div style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: 'var(--accent-cyan-bright)',
                marginBottom: '10px',
              }}>
                HOST RUNTIME TELEMETRY //
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
              }}>
                <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '9px' }}>PROCESS PID</span>
                  <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{systemStatus.server.pid}</span>
                </div>
                <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '9px' }}>UPTIME</span>
                  <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{Math.floor(systemStatus.server.uptime / 60)}m {systemStatus.server.uptime % 60}s</span>
                </div>
                <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '9px' }}>RSS MEMORY</span>
                  <span style={{ color: 'var(--accent-green-bright)', fontWeight: 700 }}>{systemStatus.server.memory.rssMb} MB</span>
                </div>
                <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '9px' }}>TMUX SESSIONS</span>
                  <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>{systemStatus.tmux.sessionsCount} ACTIVE</span>
                </div>
                <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '9px' }}>PLATFORM</span>
                  <span style={{ color: 'var(--text-bright)', fontWeight: 700 }}>
                    {systemStatus.platform.isTermux ? 'Android (Termux)' : `${systemStatus.platform.os} (${systemStatus.platform.arch})`}
                  </span>
                </div>
                <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '2px' }}>
                  <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '9px' }}>IDLE STATE</span>
                  <span style={{ color: systemStatus.server.idle ? 'var(--accent-amber-bright)' : 'var(--accent-green-bright)', fontWeight: 700 }}>
                    {systemStatus.server.idle ? 'LOW-POWER STANDBY' : 'ONLINE ACTIVE'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  className="mecha-btn"
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent('agy:open-diagnostics'));
                  }}
                  style={{ fontSize: '10px', padding: '3px 8px', color: 'var(--accent-cyan-bright)' }}
                >
                  OPEN ADVANCED PROCESS DIAGNOSTICS →
                </button>
              </div>
            </div>
          )}

          {/* Cloudflare Tunnel Remote Ingress */}
          <div style={{
            padding: '12px',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
          }}>
            <div style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--accent-cyan-bright)',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <GlobeIcon size={12} />
              CLOUDFLARE TUNNEL &amp; REMOTE INGRESS //
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  Encrypted Remote Edge Ingress
                </div>
                <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  Connect from mobile or outside networks without port forwarding or public IP addresses.
                </div>
              </div>
              <button
                className="mecha-btn"
                onClick={() => {
                  onClose();
                  window.dispatchEvent(new CustomEvent('agy:open-tunnel-modal'));
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan-bright)' }}
              >
                <GlobeIcon size={12} /> CONFIGURE TUNNEL →
              </button>
            </div>
          </div>

          {/* Authentication & Session Reset */}
          <div style={{
            padding: '12px',
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
          }}>
            <div style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: 'var(--accent-blue)',
              marginBottom: '10px',
            }}>
              GOOGLE ANTIGRAVITY IDENTITY &amp; ACCOUNTS //
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>Active Google Identity:</span>
                  <span style={{
                    color: 'var(--accent-blue)',
                    fontWeight: 700,
                    backgroundColor: 'rgba(122, 162, 247, 0.1)',
                    padding: '1px 6px',
                    borderRadius: '3px',
                  }}>
                    {activeAgyProfile}
                  </span>
                </div>
                <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  Manage OAuth tokens, switch Google accounts, or launch the Auth Helper.
                </div>
              </div>
              <button
                className="mecha-btn"
                onClick={() => {
                  onClose();
                  window.dispatchEvent(new CustomEvent('agy:open-account-switcher'));
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-blue)' }}
              >
                <UserIcon size={12} /> SWITCH / ACCOUNTS
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                  Disconnect Active Session
                </div>
                <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  Clears local token. Tmux sessions remain preserved on server.
                </div>
              </div>
              <button
                className="mecha-btn mecha-btn--danger"
                onClick={() => {
                  if (window.confirm('Disconnect and logout? Tmux background sessions will remain preserved.')) {
                    setToken(null);
                    onClose();
                  }
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <LogoutIcon size={12} /> DISCONNECT
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-primary)',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
        }}>
          <span>AGY ONLINE // v{__APP_VERSION__}</span>
          <span>PRESS [ESC] TO CLOSE</span>
        </div>
      </div>
    </div>
  );
}
