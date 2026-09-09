import { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from './store';
import { LoginForm } from './components/LoginForm';
import { SplitPaneContainer } from './components/SplitPaneContainer';
import { SessionSidebar } from './components/SessionSidebar';
import { TabBar } from './components/TabBar';
import { SystemHeader } from './components/SystemHeader';
import { NavigationRail } from './components/NavigationRail';
import { ContextPanel } from './components/ContextPanel';
import { CommandPalette } from './components/CommandPalette';
import { ShortcutsModal, HelpGuideTab } from './components/ShortcutsModal';
import { SettingsModal } from './components/SettingsModal';
import { AutoTaskModal } from './components/AutoTaskModal';
import { AccountSwitcherModal } from './components/AccountSwitcherModal';
import { fetchSystemStatus } from './api/system';
import { fetchCwd } from './api/files';
import { useAdaptivePolling } from './hooks/useAdaptivePolling';
import type { SystemStatus } from 'agy-online-shared';

function getInitialToken(): string | null {
  return localStorage.getItem('agy-online-token') || localStorage.getItem('ai-cli-online-token');
}

function App() {
  const token = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const addTab = useStore((s) => s.addTab);
  const tabsLoading = useStore((s) => s.tabsLoading);
  const theme = useStore((s) => s.theme);

  const [authChecking, setAuthChecking] = useState(true);

  // Layout states
  const [railExpanded, setRailExpanded] = useState<boolean>(() => {
    return localStorage.getItem('agy-rail-expanded') === 'true';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextTab, setContextTab] = useState<'agent' | 'tasks' | 'files' | 'git'>('agent');

  // Modals
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [autoTaskModalOpen, setAutoTaskModalOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [autoTaskModule, setAutoTaskModule] = useState('');
  const [helpGuideTab, setHelpGuideTab] = useState<HelpGuideTab>('quickstart');

  const handleOpenHelp = useCallback((tab: HelpGuideTab = 'quickstart') => {
    setHelpGuideTab(tab);
    setShortcutsModalOpen(true);
  }, []);

  useEffect(() => {
    const onHelpEvent = (e: Event) => {
      const custom = e as CustomEvent<{ tab?: HelpGuideTab }>;
      handleOpenHelp(custom.detail?.tab || 'quickstart');
    };
    window.addEventListener('agy:open-help-guide', onHelpEvent);
    return () => window.removeEventListener('agy:open-help-guide', onHelpEvent);
  }, [handleOpenHelp]);

  useEffect(() => {
    const onAutoTaskEvent = (e: Event) => {
      const custom = e as CustomEvent<{ module?: string }>;
      setAutoTaskModule(custom.detail?.module || '');
      setAutoTaskModalOpen(true);
    };
    window.addEventListener('agy:open-auto-task', onAutoTaskEvent);
    return () => window.removeEventListener('agy:open-auto-task', onAutoTaskEvent);
  }, []);

  useEffect(() => {
    const onAccountSwitcherEvent = () => {
      setAccountSwitcherOpen(true);
    };
    window.addEventListener('agy:open-account-switcher', onAccountSwitcherEvent);
    return () => window.removeEventListener('agy:open-account-switcher', onAccountSwitcherEvent);
  }, []);

  useEffect(() => {
    const onOpenSettingsEvent = () => {
      setSettingsModalOpen(true);
    };
    window.addEventListener('agy:open-settings', onOpenSettingsEvent);
    return () => window.removeEventListener('agy:open-settings', onOpenSettingsEvent);
  }, []);

  // Active session details
  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId]);
  const primaryTerminalId = activeTab?.terminalIds[0] || 'default';
  const [cwd, setCwd] = useState<string | null>(null);

  // Session stats (for ContextPanel telemetry)
  const [sessionStats] = useState({
    messageCount: 0,
    toolCallCount: 0,
    totalTokens: 0,
  });

  const toggleRailExpanded = useCallback(() => {
    setRailExpanded((prev) => {
      const next = !prev;
      localStorage.setItem('agy-rail-expanded', String(next));
      return next;
    });
  }, []);

  // Initialize token from localStorage or auto-detect open access
  useEffect(() => {
    const initAuth = async () => {
      const saved = getInitialToken();
      if (saved) {
        setToken(saved);
        setAuthChecking(false);
        return;
      }

      try {
        const res = await fetch('/api/auth/verify');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated || data.authRequired === false) {
            setToken('default');
            setAuthChecking(false);
            return;
          }
        }
      } catch {
        // network issue, proceed to login form
      }

      setAuthChecking(false);
    };

    initAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-create first tab after login
  useEffect(() => {
    if (token && !tabsLoading && tabs.filter((t) => t.status === 'open').length === 0) {
      addTab('Mission-01');
    }
  }, [token, tabsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // System status monitoring (memory, idle state, PID) adaptively polled
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  useAdaptivePolling(
    useCallback(async () => {
      if (!token) return;
      try {
        const s = await fetchSystemStatus(token);
        setSystemStatus(s);
      } catch {
        // ignore
      }
    }, [token]),
    { intervalMs: 10000, backgroundIntervalMs: 0, enabled: Boolean(token) },
  );

  // Poll CWD for active session
  useAdaptivePolling(
    useCallback(async () => {
      if (!token || !primaryTerminalId) return;
      try {
        const dir = await fetchCwd(token, primaryTerminalId);
        setCwd(dir);
      } catch {
        // ignore
      }
    }, [token, primaryTerminalId]),
    { intervalMs: 5000, backgroundIntervalMs: 0, enabled: Boolean(token && primaryTerminalId) },
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement;

      // Cmd+K / Ctrl+K: Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Cmd+N / Ctrl+N: New Session
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !isInput) {
        e.preventDefault();
        addTab();
        return;
      }

      // Alt+C: Toggle Context Panel
      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setContextPanelOpen((prev) => !prev);
        return;
      }

      // Alt+T: Open Tasks
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setContextTab('tasks');
        setContextPanelOpen(true);
        return;
      }

      // Alt+A: Open Autonomous Task Lifecycle Loop Modal
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setAutoTaskModalOpen(true);
        return;
      }

      // Alt+F: Open Files
      if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setContextTab('files');
        setContextPanelOpen(true);
        return;
      }

      // Alt+G: Open Git
      if (e.altKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setContextTab('git');
        setContextPanelOpen(true);
        return;
      }

      // Alt+S: Open Skills & Capabilities Hub
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('agy:open-skills-modal'));
        return;
      }

      // Alt+P: Open Antigravity Plugins Manager
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('agy:open-plugins-modal'));
        return;
      }

      // Alt+M: Switch Agent Persona & Mindset
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('agy:open-persona-modal'));
        return;
      }

      // Question mark: Open Shortcuts (when not typing)
      if (e.key === '?' && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleOpenHelp('shortcuts');
        return;
      }

      // Esc: Close any active modal
      if (e.key === 'Escape') {
        if (accountSwitcherOpen) {
          setAccountSwitcherOpen(false);
          return;
        }
        if (autoTaskModalOpen) {
          setAutoTaskModalOpen(false);
          return;
        }
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (shortcutsModalOpen) {
          setShortcutsModalOpen(false);
          return;
        }
        if (settingsModalOpen) {
          setSettingsModalOpen(false);
          return;
        }
        if (mobileNavOpen) {
          setMobileNavOpen(false);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    accountSwitcherOpen,
    autoTaskModalOpen,
    commandPaletteOpen,
    shortcutsModalOpen,
    settingsModalOpen,
    mobileNavOpen,
    addTab,
    handleOpenHelp,
  ]);

  const handleSelectPanel = (panel: 'chat' | 'agent' | 'tasks' | 'files' | 'git') => {
    if (panel === 'chat') {
      // Focus chat
      return;
    }
    setContextTab(panel);
    setContextPanelOpen(true);
  };

  if (authChecking) {
    return null;
  }

  if (!token) {
    return <LoginForm />;
  }

  return (
    <div
      data-theme={theme}
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-base)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Mecha System Telemetry Header */}
      <SystemHeader
        systemStatus={systemStatus}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenHelp={() => handleOpenHelp('quickstart')}
        onOpenAccountSwitcher={() => setAccountSwitcherOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onToggleContextPanel={() => setContextPanelOpen(!contextPanelOpen)}
        contextPanelOpen={contextPanelOpen}
        onToggleMobileNav={() => setMobileNavOpen(true)}
        activeSessionName={activeTab ? activeTab.name : undefined}
        cwd={cwd}
        token={token || undefined}
        activeSessionId={primaryTerminalId}
        onWorkspaceSwitched={(newCwd) => setCwd(newCwd)}
      />

      {/* Main Workspace Frame: Navigation Rail + Central Split Workspace + Context Panel */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Left Collapsible Navigation Rail */}
        <NavigationRail
          expanded={railExpanded}
          onToggleExpanded={toggleRailExpanded}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          activePanel={contextPanelOpen ? contextTab : 'chat'}
          onSelectPanel={handleSelectPanel}
          onOpenSettings={() => setSettingsModalOpen(true)}
          onOpenShortcuts={() => handleOpenHelp('shortcuts')}
          onOpenHelp={() => handleOpenHelp('quickstart')}
        />

        {/* Primary Left Navigation & Session Management Sidebar */}
        <SessionSidebar />

        {/* Central Command Stream / Terminal Split Container */}
        <main style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <SplitPaneContainer />
        </main>

        {/* Right Collapsible System Context Panel */}
        <ContextPanel
          isOpen={contextPanelOpen}
          onClose={() => setContextPanelOpen(false)}
          activeTab={contextTab}
          onTabChange={setContextTab}
          sessionId={primaryTerminalId}
          token={token}
          systemStatus={systemStatus}
          messageCount={sessionStats.messageCount}
          toolCallCount={sessionStats.toolCallCount}
          totalTokens={sessionStats.totalTokens}
          onExecuteCommand={() => {}}
        />
      </div>

      {/* Tab bar at bottom */}
      <TabBar />

      {/* Command Palette (⌘K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenTasks={() => {
          setContextTab('tasks');
          setContextPanelOpen(true);
        }}
        onOpenFiles={() => {
          setContextTab('files');
          setContextPanelOpen(true);
        }}
        onOpenGit={() => {
          setContextTab('git');
          setContextPanelOpen(true);
        }}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onOpenShortcuts={() => handleOpenHelp('shortcuts')}
        onOpenHelp={() => handleOpenHelp('quickstart')}
      />

      {/* Interactive Feature Guide & Keyboard Shortcuts Modal (?) */}
      <ShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
        initialTab={helpGuideTab}
        onInsertCommand={(cmd) => {
          window.dispatchEvent(new CustomEvent('agy:insert-command', { detail: { cmd } }));
        }}
      />

      {/* System Settings Modal (⚙) */}
      <SettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        systemStatus={systemStatus}
      />

      {/* Account Profile Switcher Modal */}
      <AccountSwitcherModal
        isOpen={accountSwitcherOpen}
        onClose={() => setAccountSwitcherOpen(false)}
      />

      {/* Autonomous Task Loop Modal (⚡) */}
      <AutoTaskModal
        isOpen={autoTaskModalOpen}
        onClose={() => setAutoTaskModalOpen(false)}
        sessionId={primaryTerminalId}
        token={token || ''}
        initialTaskModule={autoTaskModule}
        workspaceDir={cwd || undefined}
      />
    </div>
  );
}

export default App;
