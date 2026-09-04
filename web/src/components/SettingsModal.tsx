import { useStore } from '../store';
import type { SystemStatus } from 'ai-cli-online-shared';

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
  const setToken = useStore((s) => s.setToken);

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
            <span style={{ color: 'var(--accent-amber-bright)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              ⚙
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
            ✕
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
                style={{ padding: '4px 12px' }}
              >
                {theme === 'dark' ? '🌙 MECHA DARK' : '☀ INDUSTRIAL LIGHT'}
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
                  style={{ minWidth: '32px', minHeight: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  A−
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
                  style={{ minWidth: '32px', minHeight: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  A+
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
            </div>
          )}

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
              color: 'var(--accent-red)',
              marginBottom: '10px',
            }}>
              SESSION CONTROL //
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
              >
                ⎋ DISCONNECT
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
