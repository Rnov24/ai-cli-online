import React from 'react';
import { useStore } from '../store';
import type { SystemStatus } from 'ai-cli-online-shared';

interface SystemHeaderProps {
  systemStatus: SystemStatus | null;
  onOpenCommandPalette: () => void;
  onToggleContextPanel: () => void;
  contextPanelOpen: boolean;
  onToggleMobileNav: () => void;
  activeSessionName?: string;
  cwd?: string | null;
}

const SIGNAL_BARS = [1, 2, 3, 4] as const;

export const SystemHeader = React.memo(function SystemHeader({
  systemStatus,
  onOpenCommandPalette,
  onToggleContextPanel,
  contextPanelOpen,
  onToggleMobileNav,
  activeSessionName,
  cwd,
}: SystemHeaderProps) {
  const latency = useStore((s) => s.latency);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);

  let latencyColor = 'var(--accent-green)';
  let latencyBars = 4;
  if (latency !== null) {
    if (latency >= 300) {
      latencyColor = 'var(--accent-red)';
      latencyBars = 1;
    } else if (latency >= 150) {
      latencyColor = 'var(--accent-amber)';
      latencyBars = 2;
    } else if (latency >= 50) {
      latencyColor = 'var(--accent-yellow)';
      latencyBars = 3;
    }
  }

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 12px',
      backgroundColor: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      height: '38px',
      flexShrink: 0,
      gap: '8px',
      fontFamily: 'var(--font-mono)',
      userSelect: 'none',
      zIndex: 20,
    }}>
      {/* Left: Hamburger (mobile) + Brand + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <button
          className="mecha-btn mobile-only"
          onClick={onToggleMobileNav}
          title="Toggle Navigation Menu"
          aria-label="Toggle navigation drawer"
          style={{ padding: '3px 8px', fontSize: '12px' }}
        >
          ☰
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--text-bright)',
            letterSpacing: '1px',
          }}>
            AGY //
          </span>
          <span className="tech-badge tech-badge--active desktop-only" style={{ fontSize: '9px', padding: '1px 5px' }}>
            COMMAND
          </span>
          <span className="desktop-only" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
            [v{__APP_VERSION__}]
          </span>
        </div>

        {/* Live System Status Readout */}
        {systemStatus && (
          <div
            className="desktop-only"
            title={`PID: ${systemStatus.server.pid} | Uptime: ${systemStatus.server.uptime}s | Heap: ${systemStatus.server.memory.heapUsedMb}MB / RSS: ${systemStatus.server.memory.rssMb}MB`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 7px',
              borderRadius: '2px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-primary)',
              fontSize: '10px',
              color: systemStatus.server.idle ? 'var(--text-secondary)' : 'var(--accent-green-bright)',
            }}
          >
            <span
              className={`pulse-dot ${systemStatus.server.idle ? 'pulse-dot--idle' : 'pulse-dot--online'}`}
            />
            <span>SYS:{systemStatus.server.idle ? 'STANDBY' : 'ONLINE'}</span>
            <span style={{ color: 'var(--text-muted)' }}>//</span>
            <span style={{ color: 'var(--text-secondary)' }}>{systemStatus.server.memory.rssMb}MB</span>
            <span style={{ color: 'var(--text-muted)' }}>//</span>
            <span style={{ color: 'var(--text-muted)' }}>PID:{systemStatus.server.pid}</span>
          </div>
        )}
      </div>

      {/* Center: Active Session / Mission Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        overflow: 'hidden',
        minWidth: 0,
        justifyContent: 'center',
        flex: 1,
      }}>
        {activeSessionName && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 8px',
            borderRadius: '2px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            maxWidth: '280px',
            overflow: 'hidden',
            minWidth: 0,
          }}>
            <span className="desktop-only" style={{ color: 'var(--accent-amber-bright)', fontSize: '10px', fontWeight: 700 }}>
              MISSION //
            </span>
            <span style={{
              color: 'var(--text-bright)',
              fontSize: '11px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}>
              {activeSessionName}
            </span>
          </div>
        )}
        {cwd && (
          <span
            className="desktop-only"
            title={cwd}
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              maxWidth: '220px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cwd}
          </span>
        )}
      </div>

      {/* Right: Telemetry & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {/* Model Badge */}
        <div className="desktop-only tech-badge tech-badge--cyan" style={{ fontSize: '9px', padding: '2px 6px' }}>
          <span>◈ GEMINI 3.8</span>
        </div>

        {/* Network latency bars */}
        <div
          className="desktop-only"
          title={latency !== null ? `Latency: ${latency}ms` : 'Measuring latency...'}
          style={{
            display: 'inline-flex',
            alignItems: 'end',
            gap: '1.5px',
            padding: '2px 6px',
            borderRadius: '2px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            height: '22px',
          }}
        >
          {SIGNAL_BARS.map((i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: '2px',
                height: `${3 + i * 2.5}px`,
                backgroundColor: i <= latencyBars ? latencyColor : 'var(--border)',
                borderRadius: '1px',
              }}
            />
          ))}
          <span style={{ fontSize: '9px', color: latencyColor, marginLeft: '4px', fontWeight: 600 }}>
            {latency !== null ? `${latency}ms` : '--'}
          </span>
        </div>

        {/* Command Palette Trigger */}
        <button
          className="mecha-btn desktop-only"
          onClick={onOpenCommandPalette}
          title="Open Command Palette (⌘K / Ctrl+K)"
          style={{ padding: '2px 8px', fontSize: '10px' }}
        >
          <span>⌘K</span>
        </button>

        {/* Font size adjustment */}
        <div className="desktop-only" style={{
          display: 'inline-flex',
          alignItems: 'center',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '2px',
          padding: '1px 3px',
        }}>
          <button
            onClick={() => setFontSize(Math.max(10, fontSize - 1))}
            disabled={fontSize <= 10}
            title="Decrease font size"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '9px',
              padding: '0 3px',
            }}
          >
            A−
          </button>
          <span style={{ fontSize: '10px', color: 'var(--text-primary)', minWidth: '16px', textAlign: 'center' }}>
            {fontSize}
          </span>
          <button
            onClick={() => setFontSize(Math.min(24, fontSize + 1))}
            disabled={fontSize >= 24}
            title="Increase font size"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '9px',
              padding: '0 3px',
            }}
          >
            A+
          </button>
        </div>

        {/* Theme Switcher */}
        <button
          className="mecha-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Industrial Light' : 'Mecha Dark'} mode`}
          aria-label="Toggle theme"
          style={{ padding: '2px 6px', fontSize: '11px' }}
        >
          {theme === 'dark' ? '☀' : '🌙'}
        </button>

        {/* Context Panel Toggle */}
        <button
          className={`mecha-btn${contextPanelOpen ? ' mecha-btn--active' : ''}`}
          onClick={onToggleContextPanel}
          title="Toggle Context Panel (Alt+C)"
          aria-label="Toggle system context panel"
          style={{ padding: '2px 8px', fontSize: '10px' }}
        >
          <span>◫</span>
          <span className="desktop-only" style={{ marginLeft: '4px' }}>CONTEXT</span>
        </button>
      </div>
    </header>
  );
});

SystemHeader.displayName = 'SystemHeader';
