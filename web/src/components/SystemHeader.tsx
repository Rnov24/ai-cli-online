import React, { useCallback } from 'react';
import { useStore } from '../store';
import type { SystemStatus } from 'ai-cli-online-shared';
import { WorkspaceSelector } from './WorkspaceSelector';
import { MenuIcon, SearchIcon, SunIcon, MoonIcon } from './icons';

interface SystemHeaderProps {
  systemStatus: SystemStatus | null;
  onOpenCommandPalette: () => void;
  onOpenHelp?: () => void;
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
            <span className="tablet-hide" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span className="tablet-hide" style={{ color: 'var(--text-muted)' }}>//</span>
              <span className="tablet-hide" style={{ color: 'var(--text-secondary)' }}>{systemStatus.server.memory.rssMb}MB</span>
              <span className="tablet-hide" style={{ color: 'var(--text-muted)' }}>//</span>
              <span className="tablet-hide" style={{ color: 'var(--text-muted)' }}>PID:{systemStatus.server.pid}</span>
            </span>
          </div>
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

        {/* Font size adjustment */}
        <div className="desktop-only tablet-hide" style={{
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
          style={{ padding: '3px 8px', fontSize: '12px', minWidth: '32px', minHeight: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {theme === 'dark' ? <SunIcon size={13} /> : <MoonIcon size={13} />}
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
