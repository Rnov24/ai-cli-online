import { useStore } from '../store';
import {
  TaskPulseIcon,
  FolderIcon,
  GitBranchIcon,
  SettingsIcon,
  HelpIcon,
  LogoutIcon,
  CloseIcon,
  PuzzleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ActivityIcon,
  TabsIcon,
  BoltIcon,
  RobotIcon,
  GlobeIcon,
} from './icons';

interface NavigationRailProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activePanel: 'chat' | 'agent' | 'tasks' | 'files' | 'git';
  onSelectPanel: (panel: 'chat' | 'agent' | 'tasks' | 'files' | 'git') => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onOpenHelp?: () => void;
}

export function NavigationRail({
  expanded,
  onToggleExpanded,
  mobileOpen,
  onCloseMobile,
  activePanel,
  onSelectPanel,
  onOpenSettings,
  onOpenShortcuts,
  onOpenHelp,
}: NavigationRailProps) {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setToken = useStore((s) => s.setToken);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

  const openTabs = tabs.filter((t) => t.status === 'open');
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handlePanelClick = (panel: 'chat' | 'tasks' | 'files' | 'git') => {
    onSelectPanel(panel);
    if (mobileOpen) onCloseMobile();
  };

  const isExpanded = mobileOpen || expanded;

  const content = (
    <aside
      style={{
        width: mobileOpen ? '100%' : (expanded ? '200px' : '52px'),
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        overflowX: 'hidden',
        userSelect: 'none',
        fontFamily: 'var(--font-mono)',
        zIndex: 30,
      }}
    >
      {/* Top section: Brand / Toggle + Command links */}
      <div>
        {/* Rail Top Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isExpanded ? 'space-between' : 'center',
          padding: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          height: '40px',
        }}>
          {isExpanded && (
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--accent-amber-bright)',
              letterSpacing: '1px',
            }}>
              NAV // COMMAND
            </span>
          )}
          {mobileOpen ? (
            <button
              onClick={onCloseMobile}
              title="Close Navigation"
              aria-label="Close navigation"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '15px',
                padding: '4px',
                minWidth: '36px',
                minHeight: '36px',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseIcon size={14} />
            </button>
          ) : (
              <button
                onClick={onToggleExpanded}
                title={expanded ? 'Collapse Rail' : 'Expand Rail'}
                aria-label={expanded ? 'Collapse Rail' : 'Expand Rail'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {expanded ? <ChevronLeftIcon size={12} /> : <ChevronRightIcon size={12} />}
              </button>
          )}
        </div>

        {/* Current Active Mission Item */}
        <div
          onClick={() => handlePanelClick('chat')}
          title={activeTab ? `Active Mission: ${activeTab.name}` : 'Mission Console'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: mobileOpen ? '12px 14px' : (isExpanded ? '10px 12px' : '10px 0'),
            minHeight: mobileOpen ? '46px' : 'auto',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            cursor: 'pointer',
            backgroundColor: activePanel === 'chat' ? 'var(--accent-amber-subtle)' : 'transparent',
            borderLeft: activePanel === 'chat' ? '3px solid var(--accent-amber)' : '3px solid transparent',
            borderBottom: '1px solid var(--border-subtle)',
            transition: 'all 0.15s ease',
          }}
        >
          <ActivityIcon
            size={14}
            color={activePanel === 'chat' ? 'var(--accent-amber-bright)' : 'var(--text-secondary)'}
          />
          {isExpanded && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 700,
                color: activePanel === 'chat' ? 'var(--text-bright)' : 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {activeTab ? activeTab.name : 'MISSION'}
              </div>
              <div style={{ fontSize: '9px', color: 'var(--accent-green)', letterSpacing: '0.4px' }}>
                ACTIVE PROCESS
              </div>
            </div>
          )}
        </div>

        {/* Command Nav Section */}
        <div style={{ padding: '8px 4px' }}>
          {isExpanded && (
            <div style={{
              fontSize: '9px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              padding: '4px 8px 6px 8px',
              letterSpacing: '1px',
            }}>
              OPERATIONS //
            </div>
          )}

          {/* Sessions List Trigger */}
          <button
            onClick={() => {
              toggleSidebar();
              if (mobileOpen) onCloseMobile();
            }}
            title={`Session History (${openTabs.length} active)`}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
              minHeight: mobileOpen ? '42px' : 'auto',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              borderRadius: '2px',
              border: 'none',
              background: sidebarOpen ? 'var(--accent-amber-subtle)' : 'transparent',
              color: sidebarOpen ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: '3px',
              transition: 'all 0.15s ease',
            }}
          >
            <TabsIcon
              size={14}
              color={sidebarOpen ? 'var(--accent-amber-bright)' : 'var(--text-secondary)'}
            />
            {isExpanded && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '11px', fontWeight: 600 }}>SESSIONS</span>
                <span style={{
                  fontSize: '9px',
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '1px 5px',
                  borderRadius: '2px',
                  border: '1px solid var(--border)',
                }}>
                  {openTabs.length}
                </span>
              </div>
            )}
          </button>

          {/* Tasks & Plan Panel */}
          <button
            onClick={() => handlePanelClick('tasks')}
            title="Tasks & Plan Lifecycle Panel (⌥T)"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
              minHeight: mobileOpen ? '42px' : 'auto',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              borderRadius: '2px',
              border: 'none',
              background: activePanel === 'tasks' ? 'var(--accent-amber-subtle)' : 'transparent',
              color: activePanel === 'tasks' ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: '3px',
              transition: 'all 0.15s ease',
            }}
          >
            <TaskPulseIcon size={14} />
            {isExpanded && (
              <span style={{ fontSize: '11px', fontWeight: 600 }}>TASKS &amp; PLAN</span>
            )}
          </button>

          {/* Workspace Files */}
          <button
            onClick={() => handlePanelClick('files')}
            title="Workspace Files Explorer (⌥F)"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
              minHeight: mobileOpen ? '42px' : 'auto',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              borderRadius: '2px',
              border: 'none',
              background: activePanel === 'files' ? 'var(--accent-cyan-subtle)' : 'transparent',
              color: activePanel === 'files' ? 'var(--accent-cyan-bright)' : 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: '3px',
              transition: 'all 0.15s ease',
            }}
          >
            <FolderIcon size={14} />
            {isExpanded && (
              <span style={{ fontSize: '11px', fontWeight: 600 }}>FILES</span>
            )}
          </button>

          {/* Git History Visualizer */}
          <button
            onClick={() => handlePanelClick('git')}
            title="Git Branch History & Diffs (⌥G)"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
              minHeight: mobileOpen ? '42px' : 'auto',
              justifyContent: isExpanded ? 'flex-start' : 'center',
              borderRadius: '2px',
              border: 'none',
              background: activePanel === 'git' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
              color: activePanel === 'git' ? 'var(--accent-green-bright)' : 'var(--text-secondary)',
              cursor: 'pointer',
              marginBottom: '3px',
              transition: 'all 0.15s ease',
            }}
          >
            <GitBranchIcon size={14} />
            {isExpanded && (
              <span style={{ fontSize: '11px', fontWeight: 600 }}>GIT GRAPH</span>
            )}
          </button>
        </div>
      </div>

      {/* Bottom section: System, Settings, Shortcuts, Logout */}
      <div style={{
        padding: '8px 4px',
        borderTop: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--bg-primary)',
      }}>
        {isExpanded && (
          <div style={{
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            padding: '2px 8px 6px 8px',
            letterSpacing: '1px',
          }}>
            SYSTEM //
          </div>
        )}

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('agy:open-skills-modal'));
            if (mobileOpen) onCloseMobile();
          }}
          title="Skills & Capabilities Hub (⌥S)"
          aria-label="Open skills hub"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
            minHeight: mobileOpen ? '42px' : 'auto',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            borderRadius: '2px',
            border: 'none',
            background: 'transparent',
            color: 'var(--accent-purple)',
            cursor: 'pointer',
            marginBottom: '2px',
            transition: 'all 0.15s ease',
          }}
        >
          <PuzzleIcon size={14} />
          {isExpanded && <span style={{ fontSize: '11px' }}>SKILLS HUB</span>}
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('agy:open-plugins-modal'));
            if (mobileOpen) onCloseMobile();
          }}
          title="Plugin Management (⌥P)"
          aria-label="Open plugin management"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
            minHeight: mobileOpen ? '42px' : 'auto',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            borderRadius: '2px',
            border: 'none',
            background: 'transparent',
            color: 'var(--accent-cyan-bright)',
            cursor: 'pointer',
            marginBottom: '2px',
            transition: 'all 0.15s ease',
          }}
        >
          <BoltIcon size={14} />
          {isExpanded && <span style={{ fontSize: '11px' }}>PLUGINS</span>}
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('agy:open-persona-modal'));
            if (mobileOpen) onCloseMobile();
          }}
          title="Agent Personas & Mindsets (⌥M)"
          aria-label="Open personas modal"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
            minHeight: mobileOpen ? '42px' : 'auto',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            borderRadius: '2px',
            border: 'none',
            background: 'transparent',
            color: 'var(--accent-green-bright)',
            cursor: 'pointer',
            marginBottom: '2px',
            transition: 'all 0.15s ease',
          }}
        >
          <RobotIcon size={14} />
          {isExpanded && <span style={{ fontSize: '11px' }}>PERSONAS</span>}
        </button>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent('agy:open-tunnel-modal'));
            if (mobileOpen) onCloseMobile();
          }}
          title="Cloudflare Remote Ingress Tunnel"
          aria-label="Open cloudflare remote ingress tunnel"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
            minHeight: mobileOpen ? '42px' : 'auto',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            borderRadius: '2px',
            border: 'none',
            background: 'transparent',
            color: 'var(--accent-cyan-bright)',
            cursor: 'pointer',
            marginBottom: '2px',
            transition: 'all 0.15s ease',
          }}
        >
          <GlobeIcon size={14} />
          {isExpanded && <span style={{ fontSize: '11px' }}>TUNNEL</span>}
        </button>

        <button
          onClick={onOpenSettings}
          title="System Settings"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
            minHeight: mobileOpen ? '42px' : 'auto',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            borderRadius: '2px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            marginBottom: '2px',
            transition: 'all 0.15s ease',
          }}
        >
          <SettingsIcon size={14} />
          {isExpanded && <span style={{ fontSize: '11px' }}>SETTINGS</span>}
        </button>

        <button
          onClick={() => {
            if (onOpenHelp) onOpenHelp();
            else onOpenShortcuts();
            if (mobileOpen) onCloseMobile();
          }}
          title="Interactive Feature Guide & Keyboard Shortcuts (?)"
          aria-label="Open help and guide"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
            minHeight: mobileOpen ? '42px' : 'auto',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            borderRadius: '2px',
            border: 'none',
            background: 'transparent',
            color: 'var(--accent-amber-bright)',
            cursor: 'pointer',
            marginBottom: '2px',
            transition: 'all 0.15s ease',
          }}
        >
          <HelpIcon size={14} />
          {isExpanded && <span style={{ fontSize: '11px', fontWeight: 600 }}>HELP &amp; GUIDE</span>}
        </button>

        <button
          onClick={() => {
            if (window.confirm('Disconnect and logout? Tmux background sessions will remain preserved.')) {
              setToken(null);
            }
          }}
          title="Disconnect Session"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: mobileOpen ? '10px 14px' : (isExpanded ? '6px 10px' : '8px 0'),
            minHeight: mobileOpen ? '42px' : 'auto',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            borderRadius: '2px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <LogoutIcon size={14} />
          {isExpanded && <span style={{ fontSize: '11px' }}>LOGOUT</span>}
        </button>
      </div>
    </aside>
  );

  // Desktop rail
  if (!mobileOpen) {
    return (
      <div className="desktop-only" style={{ height: '100%' }}>
        {content}
      </div>
    );
  }

  // Mobile drawer with overlay
  return (
    <div className="mobile-only">
      <div className="drawer-backdrop" onClick={onCloseMobile} />
      <div style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 600,
        width: 'min(280px, 85vw)',
        animation: 'slide-in-left 0.2s ease-out',
        boxShadow: '8px 0 30px rgba(0,0,0,0.7)',
      }}>
        {content}
      </div>
    </div>
  );
}
