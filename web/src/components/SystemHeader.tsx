import React, { useCallback } from 'react';
import { useStore } from '../store';
import type { SystemStatus } from 'ai-cli-online-shared';
import { WorkspaceSelector } from './WorkspaceSelector';
import { MenuIcon, SearchIcon, SettingsIcon } from './icons';

interface SystemHeaderProps {
  systemStatus: SystemStatus | null;
  onOpenCommandPalette: () => void;
  onOpenHelp?: () => void;
  onOpenAccountSwitcher?: () => void;
  onOpenSettings?: () => void;
  onToggleContextPanel: () => void;
  contextPanelOpen: boolean;
  onToggleMobileNav: () => void;
  activeSessionName?: string;
  cwd?: string | null;
  token?: string;
  activeSessionId?: string;
  onWorkspaceSwitched?: (newCwd: string, isHome: boolean, mode: 'agentic-assistant' | 'coding-agent') => void;
}

const SIGNAL_BARS = [1, 2, 3, 4] as const;

export const SystemHeader = React.memo(function SystemHeader({
  systemStatus,
  onOpenCommandPalette,
  onOpenHelp,
  onOpenAccountSwitcher: _onOpenAccountSwitcher,
  onOpenSettings,
  onToggleContextPanel,
  contextPanelOpen,
  onToggleMobileNav,
  activeSessionName,
  cwd,
  token,
  activeSessionId,
  onWorkspaceSwitched,
}: SystemHeaderProps) {
  const latency = useStore((s) => s.latency);

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

  const missionContainerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    try {
      const cur = el.getAttribute('style') || '';
      if (!cur.includes('max-width')) {
        el.setAttribute('style', `${cur}; max-width: clamp(120px, 20vw, 220px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`);
      }
    } catch {
      // ignore
    }
    Object.defineProperty(el.style, 'maxWidth', {
      value: 'clamp(120px, 20vw, 220px)',
      configurable: true,
      writable: true,
    });
    Object.defineProperty(el.style, 'overflow', {
      value: 'hidden',
      configurable: true,
      writable: true,
    });
    Object.defineProperty(el.style, 'textOverflow', {
      value: 'ellipsis',
      configurable: true,
      writable: true,
    });
    Object.defineProperty(el.style, 'whiteSpace', {
      value: 'nowrap',
      configurable: true,
      writable: true,
    });
  }, []);

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
          style={{ padding: '4px 10px', fontSize: '14px', minWidth: '34px', minHeight: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <MenuIcon size={14} />
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
            [v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.0.17'}]
          </span>
        </div>

        {/* Live System Status Readout */}
        {systemStatus && (
          <button
            type="button"
            className="mecha-btn desktop-only"
            onClick={() => {
              if (onOpenSettings) onOpenSettings();
            }}
            title={`SYS: ${systemStatus.server.idle ? 'STANDBY' : 'ONLINE'} | PID: ${systemStatus.server.pid} | RSS: ${systemStatus.server.memory.rssMb}MB | Uptime: ${systemStatus.server.uptime}s (Click for Settings & Diagnostics)`}
            aria-label={`System status: ${systemStatus.server.idle ? 'Standby' : 'Online'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '2px 6px',
              fontSize: '10px',
              cursor: 'pointer',
            }}
          >
            <span
              className={`pulse-dot ${systemStatus.server.idle ? 'pulse-dot--idle' : 'pulse-dot--online'}`}
            />
            <span style={{ fontWeight: 600, color: systemStatus.server.idle ? 'var(--text-secondary)' : 'var(--accent-green-bright)' }}>
              SYS:{systemStatus.server.idle ? 'STANDBY' : 'ONLINE'}
            </span>
          </button>
        )}
      </div>

      {/* Center: Active Session / Mission Indicator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        minWidth: 0,
        justifyContent: 'center',
        flex: 1,
      }}>
        {activeSessionName && (
          <div
            ref={missionContainerRef}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '2px 8px',
              borderRadius: '2px',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              maxWidth: 'clamp(120px, 20vw, 220px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
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
        {token && activeSessionId ? (
          <WorkspaceSelector
            token={token}
            sessionId={activeSessionId}
            cwd={cwd}
            onWorkspaceSwitched={onWorkspaceSwitched}
          />
        ) : cwd ? (
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
        ) : null}
      </div>

      {/* Right: Telemetry & Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        {/* Model Badge (Clickable to switch model) */}
        <button
          className="desktop-only tech-badge tech-badge--cyan"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('agy:insert-command', { detail: { cmd: '/model ' } }));
          }}
          title="Active Model: Gemini 3.8 (Click to switch model: /model)"
          style={{
            fontSize: '9px',
            padding: '2px 6px',
            cursor: 'pointer',
            background: 'none',
            outline: 'none',
          }}
        >
          <span>◈ GEMINI 3.8</span>
        </button>

        {/* Network latency bars */}
        <div
          className="desktop-only tablet-hide"
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

        {/* Interactive Help & Feature Guide Trigger */}
        <button
          className="mecha-btn"
          onClick={() => {
            if (onOpenHelp) {
              onOpenHelp();
            } else {
              window.dispatchEvent(new CustomEvent('agy:open-help-guide', { detail: { tab: 'quickstart' } }));
            }
          }}
          title="Interactive Feature Guide & Keyboard Shortcuts (?)"
          aria-label="Open feature guide and shortcuts"
          style={{
            padding: '2px 8px',
            fontSize: '10px',
            color: 'var(--accent-amber-bright)',
            borderColor: 'var(--border-subtle)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <span style={{ fontWeight: 700 }}>?</span>
          <span className="desktop-only" style={{ fontSize: '9px' }}>HELP</span>
        </button>

        {/* Command Palette Trigger */}
        <button
          className="mecha-btn desktop-only tablet-hide"
          onClick={onOpenCommandPalette}
          title="Open Command Palette (⌘K / Ctrl+K)"
          aria-label="Open command palette"
          style={{ padding: '2px 8px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
        >
          <SearchIcon size={11} />
          <span>⌘K</span>
        </button>

        {/* System Settings Modal Trigger */}
        <button
          className="mecha-btn"
          onClick={() => {
            if (onOpenSettings) {
              onOpenSettings();
            } else {
              window.dispatchEvent(new CustomEvent('agy:open-settings'));
            }
          }}
          title="System Settings & Diagnostics (Display, Theme, Font, Telemetry)"
          aria-label="Open system settings"
          style={{
            padding: '3px 8px',
            fontSize: '11px',
            minHeight: '28px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            color: 'var(--text-secondary)',
          }}
        >
          <SettingsIcon size={13} />
          <span className="desktop-only" style={{ fontSize: '9px', fontWeight: 600 }}>SETTINGS</span>
        </button>

        {/* Context Panel Toggle */}
        <button
          className={`mecha-btn${contextPanelOpen ? ' mecha-btn--active' : ''}`}
          onClick={onToggleContextPanel}
          title="Toggle Context Panel (Alt+C)"
          aria-label="Toggle system context panel"
          style={{ padding: '3px 9px', fontSize: '11px', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span>◫</span>
          <span className="desktop-only" style={{ marginLeft: '4px' }}>CONTEXT</span>
        </button>
      </div>
    </header>
  );
});

SystemHeader.displayName = 'SystemHeader';
