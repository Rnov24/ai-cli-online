import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { fetchSkills, type SkillItem } from '../api/skills';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteCommand?: (cmd: string) => void;
  onOpenTasks?: () => void;
  onOpenFiles?: () => void;
  onOpenGit?: () => void;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
  onOpenHelp?: () => void;
}

interface CommandItem {
  id: string;
  category: 'SESSION' | 'SKILLS' | 'WORKSPACES' | 'PANELS' | 'SYSTEM';
  title: string;
  desc?: string;
  shortcut?: string;
  action: () => void;
}

type CategoryFilter = 'ALL' | 'SKILLS' | 'WORKSPACES' | 'PANELS' | 'SYSTEM';

export const CommandPalette = React.memo(function CommandPalette({
  isOpen,
  onClose,
  onExecuteCommand,
  onOpenTasks,
  onOpenFiles,
  onOpenGit,
  onOpenSettings,
  onOpenShortcuts,
  onOpenHelp,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const tabs = useStore((s) => s.tabs);
  const switchTab = useStore((s) => s.switchTab);
  const addTab = useStore((s) => s.addTab);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const theme = useStore((s) => s.theme);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const token = useStore((s) => s.token);
  const [discoveredSkills, setDiscoveredSkills] = useState<SkillItem[]>([]);

  useEffect(() => {
    if (isOpen && token) {
      fetchSkills(token)
        .then((res) => {
          setDiscoveredSkills(res.skills || []);
        })
        .catch(() => {});
    }
  }, [isOpen, token]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveCategory('ALL');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const runCommand = (cmd: string) => {
    if (onExecuteCommand) {
      onExecuteCommand(cmd);
    } else {
      window.dispatchEvent(new CustomEvent('agy:insert-command', { detail: { cmd } }));
    }
    onClose();
  };

  const openTabs = tabs.filter((t) => t.status === 'open');

  const items: CommandItem[] = useMemo(() => [
    // Help & Guide
    {
      id: 'open-help-guide',
      category: 'SYSTEM',
      title: 'Interactive Feature Guide & Help Hub',
      desc: 'Quick start guide, dual personas, slash command catalog, and keybindings',
      shortcut: '?',
      action: () => {
        if (onOpenHelp) onOpenHelp();
        else if (onOpenShortcuts) onOpenShortcuts();
        else window.dispatchEvent(new CustomEvent('agy:open-help-guide', { detail: { tab: 'quickstart' } }));
        onClose();
      },
    },

    // Session Management
    {
      id: 'new-session',
      category: 'SESSION',
      title: 'Initialize New Mission Session',
      desc: 'Create new active terminal & agent tab',
      shortcut: '⌘N',
      action: () => {
        addTab();
        onClose();
      },
    },
    ...openTabs.map((t) => ({
      id: `switch-session-${t.id}`,
      category: 'SESSION' as const,
      title: `Switch to Session: ${t.name}`,
      desc: `${t.terminalIds.length} active process${t.terminalIds.length !== 1 ? 'es' : ''}`,
      action: () => {
        switchTab(t.id);
        onClose();
      },
    })),

    // Workspaces & Personas
    {
      id: 'cmd-ws-list',
      category: 'WORKSPACES',
      title: '/workspace — Inspect Registered Workspaces',
      desc: 'Show personal home (~) and registered project workspaces',
      action: () => runCommand('/workspace'),
    },
    {
      id: 'cmd-ws-home',
      category: 'WORKSPACES',
      title: '/workspace home — Switch to Agentic Assistant',
      desc: 'Switch active session to Personal Home (~)',
      action: () => runCommand('/workspace home'),
    },

    // Assistant & System Operations
    {
      id: 'cmd-skills-manager',
      category: 'SKILLS',
      title: 'Skills & Capabilities Hub — Manage Workspace & Global Skills',
      desc: 'Inspect SKILL.md instructions, copy commands, and scaffold project skills',
      shortcut: '⌥S',
      action: () => {
        window.dispatchEvent(new CustomEvent('agy:open-skills-modal'));
        onClose();
      },
    },
    {
      id: 'cmd-goal',
      category: 'SKILLS',
      title: '/goal — Autonomous Long-Running Goal',
      desc: 'Execute persistent autonomous loop until objective is completed',
      action: () => runCommand('/goal '),
    },
    {
      id: 'cmd-auto',
      category: 'SKILLS',
      title: '/auto — Full 13-Skill Task Lifecycle Loop',
      desc: 'Autonomous task initialization, planning, execution, and verification',
      action: () => runCommand('/auto '),
    },
    {
      id: 'cmd-plan',
      category: 'SKILLS',
      title: '/plan — Implementation Planning',
      desc: 'Inspect codebase and draft structured implementation plan',
      action: () => runCommand('/plan '),
    },
    {
      id: 'cmd-verify',
      category: 'SKILLS',
      title: '/verify — Domain Verification & Testing',
      desc: 'Run domain-adapted verification test suite',
      action: () => runCommand('/verify '),
    },
    {
      id: 'cmd-exec',
      category: 'SKILLS',
      title: '/exec — Execute Approved Plan',
      desc: 'Autonomous code editing and implementation',
      action: () => runCommand('/exec '),
    },
    {
      id: 'cmd-check',
      category: 'SKILLS',
      title: '/check — Feasibility Checkpoint',
      desc: 'Inspect plan feasibility or post-exec acceptance',
      action: () => runCommand('/check '),
    },
    {
      id: 'cmd-review',
      category: 'SKILLS',
      title: '/review — Code Review & Diff Inspection',
      desc: 'Analyze changes, git diffs, and code security',
      action: () => runCommand('/review '),
    },
    {
      id: 'cmd-merge',
      category: 'SKILLS',
      title: '/merge — Merge Task Branch',
      desc: 'Merge completed task branch to main with validation',
      action: () => runCommand('/merge '),
    },
    {
      id: 'cmd-report',
      category: 'SKILLS',
      title: '/report — Task Completion Report',
      desc: 'Generate formal walkthrough and completion summary',
      action: () => runCommand('/report '),
    },
    {
      id: 'cmd-research',
      category: 'SKILLS',
      title: '/research — Research & Reference Gathering',
      desc: 'Collect external documentation, patterns, and web sources',
      action: () => runCommand('/research '),
    },
    {
      id: 'cmd-schedule',
      category: 'SKILLS',
      title: '/schedule — Schedule Task or Recurring Cron',
      desc: 'Set timers or recurring background tasks',
      action: () => runCommand('/schedule '),
    },
    {
      id: 'cmd-learn',
      category: 'SKILLS',
      title: '/learn — Save Behavioral Learning',
      desc: 'Save persistent instructions or agent patterns',
      action: () => runCommand('/learn '),
    },
    {
      id: 'cmd-doctor',
      category: 'SKILLS',
      title: '/doctor — Diagnostics & Health Check',
      desc: 'Inspect system dependencies, CLI environment, and services',
      action: () => runCommand('/doctor'),
    },
    {
      id: 'cmd-browser',
      category: 'SKILLS',
      title: '/browser — Browser Automation & Web Search',
      desc: 'Perform autonomous web scraping and research',
      action: () => runCommand('/browser '),
    },
    {
      id: 'cmd-model',
      category: 'SKILLS',
      title: '/model — Switch Active AI Model',
      desc: 'Select Gemini 3.8 or alternative language models',
      action: () => runCommand('/model '),
    },
    {
      id: 'cmd-mcp',
      category: 'SKILLS',
      title: '/mcp — Inspect MCP Server Status',
      desc: 'List connected tools and model context protocol servers',
      action: () => runCommand('/mcp'),
    },
    {
      id: 'cmd-clear',
      category: 'SKILLS',
      title: '/clear — Clear Conversation Timeline',
      desc: 'Purge local chat history and reset context',
      action: () => runCommand('/clear'),
    },
    ...discoveredSkills
      .filter((sk) => !['goal', 'auto', 'plan', 'verify', 'exec', 'check', 'review', 'merge', 'report', 'research', 'grill-me', 'schedule', 'learn', 'teamwork-preview', 'browser', 'doctor', 'diagnostics', 'agents', 'plugins', 'mcp', 'permissions', 'compress', 'clear', 'exit'].includes(sk.name))
      .map((sk) => ({
        id: `cmd-skill-${sk.scope}-${sk.name}`,
        category: 'SKILLS' as const,
        title: `/${sk.name} — ${sk.description}`,
        desc: `[${sk.scope.toUpperCase()}] ${sk.skillFile}`,
        action: () => runCommand(`/${sk.name} `),
      })),

    // Panels
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

    // System
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
      id: 'cmd-plugins-manager',
      category: 'SYSTEM',
      title: 'Antigravity Plugins — Manage Extensions & Toolkits',
      desc: 'Inspect installed plugins, components, and marketplace packages',
      shortcut: '⌥P',
      action: () => {
        window.dispatchEvent(new CustomEvent('agy:open-plugins-modal'));
        onClose();
      },
    },
    {
      id: 'cmd-switch-persona',
      category: 'SYSTEM',
      title: '/agents — Switch Agent Persona & Mindset',
      desc: 'Toggle between Architect, Auditor, Pair Programmer, SRE, and Assistant',
      shortcut: '⌥A',
      action: () => {
        window.dispatchEvent(new CustomEvent('agy:open-persona-modal'));
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
  ], [
    openTabs,
    theme,
    fontSize,
    addTab,
    switchTab,
    toggleTheme,
    setFontSize,
    onOpenHelp,
    onOpenShortcuts,
    onOpenTasks,
    onOpenFiles,
    onOpenGit,
    onOpenSettings,
  ]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (activeCategory !== 'ALL' && item.category !== activeCategory) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.desc && item.desc.toLowerCase().includes(q))
      );
    });
  }, [items, activeCategory, query]);

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

  if (!isOpen) return null;

  const categories: CategoryFilter[] = ['ALL', 'SKILLS', 'WORKSPACES', 'PANELS', 'SYSTEM'];

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
            placeholder="Type a command, session, skill (/goal, /plan), or panel..."
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

        {/* Category Filter Pills */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          backgroundColor: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
        }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginRight: '4px' }}>
            FILTER:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setSelectedIndex(0);
              }}
              style={{
                background: activeCategory === cat ? 'var(--accent-amber)' : 'var(--bg-primary)',
                color: activeCategory === cat ? '#000' : 'var(--text-secondary)',
                border: `1px solid ${activeCategory === cat ? 'var(--accent-amber)' : 'var(--border)'}`,
                borderRadius: '2px',
                padding: '2px 7px',
                fontSize: '9px',
                fontWeight: activeCategory === cat ? 700 : 500,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div style={{
          maxHeight: 'min(380px, calc(100dvh - 180px))',
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
              NO MATCHING COMMANDS FOUND IN &quot;{activeCategory}&quot;
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
                        color: item.category === 'SKILLS'
                          ? 'var(--accent-cyan-bright)'
                          : item.category === 'WORKSPACES'
                            ? '#c084fc'
                            : item.category === 'PANELS'
                              ? 'var(--accent-green-bright)'
                              : 'var(--text-muted)',
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
          <span>Navigate: ↑ ↓ · Execute: ⏎ · Filter: Click category</span>
          <span>AGY // COMMAND PALETTE</span>
        </div>
      </div>
    </div>
  );
});
