import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteCommand?: (cmd: string) => void;
  onOpenTasks?: () => void;
  onOpenFiles?: () => void;
  onOpenGit?: () => void;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
}

interface CommandItem {
  id: string;
  category: string;
  title: string;
  desc?: string;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onExecuteCommand,
  onOpenTasks,
  onOpenFiles,
  onOpenGit,
  onOpenSettings,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const tabs = useStore((s) => s.tabs);
  const switchTab = useStore((s) => s.switchTab);
  const addTab = useStore((s) => s.addTab);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const theme = useStore((s) => s.theme);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const openTabs = tabs.filter((t) => t.status === 'open');

  const items: CommandItem[] = [
    {
      id: 'new-session',
      category: 'SESSION',
      title: 'Initialize New Session',
      desc: 'Create new active terminal & agent tab',
      shortcut: '⌘N',
      action: () => {
        addTab();
        onClose();
      },
    },
    ...openTabs.map((t) => ({
      id: `switch-session-${t.id}`,
      category: 'NAVIGATION',
      title: `Switch to Session: ${t.name}`,
      desc: `${t.terminalIds.length} active process${t.terminalIds.length !== 1 ? 'es' : ''}`,
      action: () => {
        switchTab(t.id);
        onClose();
      },
    })),
    {
      id: 'cmd-goal',
      category: 'AGENT SKILL',
      title: '/goal — Autonomous Long-Running Goal',
      desc: 'Execute autonomous loop until goal is achieved',
      action: () => {
        onExecuteCommand?.('/goal ');
        onClose();
      },
    },
    {
      id: 'cmd-auto',
      category: 'AGENT SKILL',
      title: '/auto — Full 13-Skill Task Lifecycle Loop',
      desc: 'Autonomous task initialization, planning, execution and verification',
      action: () => {
        onExecuteCommand?.('/auto ');
        onClose();
      },
    },
    {
      id: 'cmd-plan',
      category: 'AGENT SKILL',
      title: '/plan — Generate Implementation Plan',
      desc: 'Step-by-step implementation planning for current module',
      action: () => {
        onExecuteCommand?.('/plan ');
        onClose();
      },
    },
    {
      id: 'cmd-verify',
      category: 'AGENT SKILL',
      title: '/verify — Domain Verification & Testing',
      desc: 'Run domain-adapted verification procedures and tests',
      action: () => {
        onExecuteCommand?.('/verify ');
        onClose();
      },
    },
    {
      id: 'cmd-check',
      category: 'AGENT SKILL',
      title: '/check — Feasibility Checkpoint',
      desc: 'Inspect plan feasibility or post-exec acceptance',
      action: () => {
        onExecuteCommand?.('/check ');
        onClose();
      },
    },
    {
      id: 'cmd-merge',
      category: 'AGENT SKILL',
      title: '/merge — Merge Task Branch',
      desc: 'Merge completed task branch to main with validation',
      action: () => {
        onExecuteCommand?.('/merge ');
        onClose();
      },
    },
    {
      id: 'toggle-tasks',
      category: 'PANELS',
      title: 'Open Tasks & Plan Panel',
      desc: 'Inspect task lifecycle, modules, and annotations',
      shortcut: '⌥T',
      action: () => {
        onOpenTasks?.();
        onClose();
      },
    },
    {
      id: 'toggle-files',
      category: 'PANELS',
      title: 'Open Workspace Files Panel',
      desc: 'Explore filesystem and view workspace files',
      shortcut: '⌥F',
      action: () => {
        onOpenFiles?.();
        onClose();
      },
    },
    {
      id: 'toggle-git',
      category: 'PANELS',
      title: 'Open Git History Panel',
      desc: 'Visualize commit branch graph and diffs',
      shortcut: '⌥G',
      action: () => {
        onOpenGit?.();
        onClose();
      },
    },
    {
      id: 'toggle-theme',
      category: 'SYSTEM',
      title: `Toggle Theme [Current: ${theme.toUpperCase()}]`,
      desc: 'Switch between Mecha Dark and Industrial Light',
      action: () => {
        toggleTheme();
        onClose();
      },
    },
    {
      id: 'increase-font',
      category: 'SYSTEM',
      title: 'Increase Font Size (A+)',
      desc: `Current size: ${fontSize}px`,
      action: () => {
        setFontSize(fontSize + 1);
        onClose();
      },
    },
    {
      id: 'decrease-font',
      category: 'SYSTEM',
      title: 'Decrease Font Size (A−)',
      desc: `Current size: ${fontSize}px`,
      action: () => {
        setFontSize(Math.max(10, fontSize - 1));
        onClose();
      },
    },
    {
      id: 'open-settings',
      category: 'SYSTEM',
      title: 'System Settings',
      desc: 'Configure telemetry, models, and interface parameters',
      action: () => {
        onOpenSettings?.();
        onClose();
      },
    },
    {
      id: 'open-shortcuts',
      category: 'SYSTEM',
      title: 'Keyboard Shortcuts Reference',
      desc: 'View all keyboard shortcuts and key bindings',
      shortcut: '?',
      action: () => {
        onOpenShortcuts?.();
        onClose();
      },
    },
  ];

  const filtered = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase()) ||
      (item.desc && item.desc.toLowerCase().includes(query.toLowerCase())),
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" onClick={(e) => e.stopPropagation()}>
        {/* Palette Search Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-primary)',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            color: 'var(--accent-amber-bright)',
            fontWeight: 700,
          }}>
            &gt;
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands, sessions, skills, panels..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--text-bright)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
            }}
          />
          <span
            onClick={onClose}
            title="Close palette"
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              padding: '3px 6px',
              borderRadius: '2px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            ESC ✕
          </span>
        </div>

        {/* Results List */}
        <div style={{
          maxHeight: 'min(380px, calc(100dvh - 160px))',
          overflowY: 'auto',
          padding: '6px',
          backgroundColor: 'var(--bg-secondary)',
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: '24px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-muted)',
            }}>
              NO MATCHING COMMANDS FOUND
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--accent-amber)' : '2px solid transparent',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--accent-cyan-bright)',
                        letterSpacing: '0.5px',
                        fontWeight: 700,
                      }}>
                        [{item.category}]
                      </span>
                      <span style={{
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? 'var(--text-bright)' : 'var(--text-primary)',
                      }}>
                        {item.title}
                      </span>
                    </div>
                    {item.desc && (
                      <div style={{
                        fontSize: '10px',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {item.desc}
                      </div>
                    )}
                  </div>
                  {item.shortcut && (
                    <span style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      padding: '1px 5px',
                      borderRadius: '2px',
                      marginLeft: '8px',
                      flexShrink: 0,
                    }}>
                      {item.shortcut}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-primary)',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
        }}>
          <span>Navigate: ↑ ↓ · Execute: ⏎</span>
          <span>AGY // COMMAND PALETTE</span>
        </div>
      </div>
    </div>
  );
}
