import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { fetchSkills, type SkillItem } from '../api/skills';
import {
  RocketIcon,
  BoltIcon,
  PuzzleIcon,
  KeyboardIcon,
  CloseIcon,
  HomeIcon,
  FolderIcon,
} from './icons';

export type HelpGuideTab = 'guide' | 'quickstart' | 'commands' | 'skills' | 'shortcuts';

export interface HelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HelpGuideTab;
  onInsertCommand?: (cmd: string) => void;
}

export type ShortcutsModalProps = HelpGuideModalProps;

interface ShortcutEntry {
  key: string;
  desc: string;
  category: string;
}

interface CommandGuideEntry {
  cmd: string;
  name: string;
  desc: string;
  persona: 'assistant' | 'coding' | 'common' | 'system';
  syntax: string;
  example: string;
}

const COMMAND_CATALOG: CommandGuideEntry[] = [
  // Autonomous & Core
  {
    cmd: '/goal',
    name: 'Autonomous Goal Loop',
    desc: 'Runs persistent autonomous execution loop until goal is completely achieved',
    persona: 'common',
    syntax: '/goal <objective description>',
    example: '/goal audit and harden websocket authentication',
  },
  {
    cmd: '/workspace',
    name: 'Workspace Registry & Switcher',
    desc: 'Lists registered workspaces or hops current session to another workspace',
    persona: 'common',
    syntax: '/workspace [list | <name|path>]',
    example: '/workspace ai-cli-online',
  },
  {
    cmd: '/model',
    name: 'Model Selection & Quota',
    desc: 'Inspects available AI models, active quota, rate limits, and switches models',
    persona: 'common',
    syntax: '/model [model-id]',
    example: '/model gemini-2.5-pro',
  },
  {
    cmd: '/mcp',
    name: 'Model Context Protocol (MCP)',
    desc: 'Inspects registered MCP servers, active tools, and client status',
    persona: 'common',
    syntax: '/mcp [status | list]',
    example: '/mcp status',
  },
  {
    cmd: '/clear',
    name: 'Clear Session Timeline',
    desc: 'Purges conversation events and resets chat session token count',
    persona: 'common',
    syntax: '/clear',
    example: '/clear',
  },
  {
    cmd: '/compress',
    name: 'Compress Context',
    desc: 'Prunes conversation history and condenses context to conserve tokens',
    persona: 'common',
    syntax: '/compress',
    example: '/compress',
  },

  // Agentic Assistant (Home ~ Mode)
  {
    cmd: '/schedule',
    name: 'Task Scheduler & Cron',
    desc: 'Configures background timers or recurring cron triggers for automation',
    persona: 'assistant',
    syntax: '/schedule <duration | cron> <instruction>',
    example: '/schedule 10m check system health report',
  },
  {
    cmd: '/doctor',
    name: 'System Health Check & Diagnostics',
    desc: 'Runs deep diagnostics on environment, network, tools, and running services',
    persona: 'assistant',
    syntax: '/doctor',
    example: '/doctor',
  },
  {
    cmd: '/browser',
    name: 'Browser Automation & Search',
    desc: 'Performs live web browsing, URL fetching, and online research',
    persona: 'assistant',
    syntax: '/browser <query or url>',
    example: '/browser search latest go 1.27 release notes',
  },
  {
    cmd: '/learn',
    name: 'Persistent Learning Memory',
    desc: 'Saves behavioral corrections and user preferences to long-term memory',
    persona: 'assistant',
    syntax: '/learn <guideline or rule>',
    example: '/learn always prefer pure Go libraries with 0 CGO',
  },

  // Coding Agent & Task Lifecycle (Project Workspaces)
  {
    cmd: '/auto',
    name: 'Autonomous 13-Skill Task Lifecycle',
    desc: 'Executes the full automated cycle: init -> plan -> research -> check -> exec -> verify -> merge -> report',
    persona: 'coding',
    syntax: '/auto <module-name>',
    example: '/auto auth-flow',
  },
  {
    cmd: '/plan',
    name: 'Step-by-Step Implementation Planning',
    desc: 'Inspects codebase architecture and drafts a structured implementation plan',
    persona: 'coding',
    syntax: '/plan <feature or refactor objective>',
    example: '/plan add sqlite migration support',
  },
  {
    cmd: '/verify',
    name: 'Domain-Adapted Verification Tests',
    desc: 'Runs test suites, linters, and verification procedures for the current task',
    persona: 'coding',
    syntax: '/verify [module-name]',
    example: '/verify auth-flow',
  },
  {
    cmd: '/exec',
    name: 'Execute Implementation Plan',
    desc: 'Executes an approved task plan step-by-step with automated checkpoints',
    persona: 'coding',
    syntax: '/exec [module-name]',
    example: '/exec auth-flow',
  },
  {
    cmd: '/review',
    name: 'Code Review & Diff Visualizer',
    desc: 'Reviews uncommitted code changes and staged diffs with automated feedback',
    persona: 'coding',
    syntax: '/review',
    example: '/review',
  },
  {
    cmd: '/check',
    name: 'Task Feasibility Checkpoint',
    desc: 'Assesses plan feasibility, test coverage, and pre/post execution risks',
    persona: 'coding',
    syntax: '/check [module-name]',
    example: '/check auth-flow',
  },
  {
    cmd: '/merge',
    name: 'Merge Task Branch',
    desc: 'Merges completed task branch into main with pre-merge validation checks',
    persona: 'coding',
    syntax: '/merge <module-name>',
    example: '/merge auth-flow',
  },
  {
    cmd: '/research',
    name: 'Collect External Documentation',
    desc: 'Collects external libraries, schemas, and specifications into references',
    persona: 'coding',
    syntax: '/research <topic or library>',
    example: '/research modernc.org/sqlite',
  },
  {
    cmd: '/grill-me',
    name: 'Interactive Alignment Interview',
    desc: 'Initiates a Q&A interview to grill and refine ambiguous requirements',
    persona: 'coding',
    syntax: '/grill-me [topic]',
    example: '/grill-me database schema design',
  },

  // System & Multi-Agent
  {
    cmd: '/agents',
    name: 'Agent Roster & Switcher',
    desc: 'Lists available subagents and switches the active primary agent persona',
    persona: 'system',
    syntax: '/agents [list | <name>]',
    example: '/agents list',
  },
  {
    cmd: '/plugins',
    name: 'Plugin Management',
    desc: 'Manages Antigravity plugins and import manifests',
    persona: 'system',
    syntax: '/plugins [list | install <path>]',
    example: '/plugins list',
  },
  {
    cmd: '/permissions',
    name: 'Tool Execution Permissions',
    desc: 'Reviews and configures permissions for running shell commands and editing files',
    persona: 'system',
    syntax: '/permissions',
    example: '/permissions',
  },
  {
    cmd: '/teamwork-preview',
    name: 'Autonomous Multi-Agent Teamwork',
    desc: 'Coordinates multiple subagents collaborating concurrently on a shared goal',
    persona: 'system',
    syntax: '/teamwork-preview <objective>',
    example: '/teamwork-preview refactor frontend and backend concurrently',
  },
  {
    cmd: '/exit',
    name: 'Exit Session',
    desc: 'Terminates active session process cleanly',
    persona: 'system',
    syntax: '/exit',
    example: '/exit',
  },
];

const SHORTCUTS: ShortcutEntry[] = [
  { key: '⌘K / Ctrl+K', desc: 'Open Supercharged Command Palette', category: 'GLOBAL' },
  { key: '⌘N / Ctrl+N', desc: 'Initialize New Session Tab', category: 'GLOBAL' },
  { key: '?', desc: 'Open Help & Feature Guide Hub', category: 'GLOBAL' },
  { key: 'Esc', desc: 'Dismiss Popovers / Stop Streaming / Close Modal', category: 'GLOBAL' },
  { key: 'Enter', desc: 'Transmit Command to Agent', category: 'COMMAND CONSOLE' },
  { key: 'Shift+Enter', desc: 'Insert Newline in Command Console', category: 'COMMAND CONSOLE' },
  { key: '↑ / ↓', desc: 'Navigate Command History / Slash Autocomplete', category: 'COMMAND CONSOLE' },
  { key: 'Tab', desc: 'Accept Autocomplete Suggestion', category: 'COMMAND CONSOLE' },
  { key: '⌥T / Alt+T', desc: 'Toggle Tasks & Plan Panel', category: 'PANELS' },
  { key: '⌥F / Alt+F', desc: 'Toggle Workspace Files Explorer', category: 'PANELS' },
  { key: '⌥G / Alt+G', desc: 'Toggle Git History & Diff Graph', category: 'PANELS' },
  { key: '⌥C / Alt+C', desc: 'Toggle System Context Panel', category: 'PANELS' },
];

const LIFECYCLE_SKILLS = [
  { name: 'init', desc: 'Initialize task module directory and isolated git branch' },
  { name: 'plan', desc: 'Inspect architecture and create step-by-step task plan' },
  { name: 'research', desc: 'Query docs, specifications, and external library references' },
  { name: 'check', desc: 'Feasibility checkpoint (post-plan, mid-execution, post-exec)' },
  { name: 'exec', desc: 'Step-by-step autonomous execution of approved plan' },
  { name: 'verify', desc: 'Execute domain-adapted unit, integration, and security tests' },
  { name: 'merge', desc: 'Merge task branch to main with validation and safety checks' },
  { name: 'report', desc: 'Compile structured task completion report' },
  { name: 'auto', desc: 'Autonomous full lifecycle loop combining all stages' },
  { name: 'cancel', desc: 'Cancel task and perform clean rollback if needed' },
  { name: 'list', desc: 'Query status of all active and completed task modules' },
  { name: 'annotate', desc: 'Process and apply Plan panel interactive annotations' },
  { name: 'summarize', desc: 'Regenerate concise task context summary' },
];

const normalizeTab = (tab?: HelpGuideTab): 'guide' | 'commands' | 'skills' | 'shortcuts' => {
  if (tab === 'quickstart') return 'guide';
  return tab || 'guide';
};

export function ShortcutsModal({
  isOpen,
  onClose,
  initialTab = 'guide',
  onInsertCommand,
}: HelpGuideModalProps) {
  const [activeTab, setActiveTab] = useState<'guide' | 'commands' | 'skills' | 'shortcuts'>(() => normalizeTab(initialTab));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'assistant' | 'coding' | 'common' | 'system'>('all');
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
      setActiveTab(normalizeTab(initialTab));
      setSearchQuery('');
      setSelectedCategory('all');
    }
  }, [isOpen, initialTab]);

  const filteredCommands = useMemo(() => {
    return COMMAND_CATALOG.filter((cmd) => {
      const matchCat = selectedCategory === 'all' || cmd.persona === selectedCategory;
      const matchQuery =
        !searchQuery.trim() ||
        cmd.cmd.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.desc.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [searchQuery, selectedCategory]);

  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)));

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div
        className="cmd-palette-modal"
        style={{
          maxWidth: '780px',
          width: '95vw',
          maxHeight: 'min(620px, 90vh)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-active, #f59e0b)',
          borderRadius: '4px',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.8), 0 0 15px rgba(245, 158, 11, 0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Brand & Tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-amber-bright)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              [?]
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-bright)',
                letterSpacing: '0.8px',
              }}
            >
              AGY ONLINE // FEATURE GUIDE &amp; REFERENCE
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close guide"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '15px',
              minWidth: '30px',
              minHeight: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Tab Navigation Strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border)',
            padding: '0 12px',
            gap: '6px',
            flexShrink: 0,
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'guide', label: 'QUICK START & PERSONAS', icon: <RocketIcon size={13} /> },
            { id: 'commands', label: 'SLASH COMMANDS DIRECTORY', icon: <BoltIcon size={13} /> },
            { id: 'skills', label: 'SKILLS & TOOLS', icon: <PuzzleIcon size={13} /> },
            { id: 'shortcuts', label: 'KEYBOARD SHORTCUTS', icon: <KeyboardIcon size={13} /> },
          ].map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  padding: '8px 12px',
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 500,
                  fontFamily: 'var(--font-mono)',
                  color: isActive ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
                  border: 'none',
                  background: 'none',
                  borderBottom: isActive ? '2px solid var(--accent-amber)' : '2px solid transparent',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content View Container */}
        <div
          style={{
            padding: '16px',
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          {/* TAB 1: QUICK START & DUAL PERSONA */}
          {activeTab === 'guide' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Persona Comparison Grid */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-amber-bright)', marginBottom: '8px', letterSpacing: '0.8px' }}>
                  // DUAL-PERSONA OPERATING ENGINE
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  {/* Home Persona Card */}
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderLeft: '4px solid var(--accent-purple)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <HomeIcon size={16} color="var(--accent-purple)" />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-purple)' }}>
                        HOME DIRECTORY (~)
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--accent-purple)', fontWeight: 700, marginBottom: '8px' }}>
                      MODE: AGENTIC ASSISTANT
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '8px' }}>
                      Operates as your personal executive assistant and systems orchestrator. Ideal for automation, scheduling recurring cron routines, system health checks, and web research.
                    </p>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      <strong>Primary Tools:</strong> <code>/goal</code>, <code>/schedule</code>, <code>/doctor</code>, <code>/browser</code>, <code>/workspace</code>
                    </div>
                  </div>

                  {/* Project Workspace Persona Card */}
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderLeft: '4px solid var(--accent-blue)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <FolderIcon size={16} color="var(--accent-blue)" />
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-blue)' }}>
                        PROJECT WORKSPACE
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--accent-blue)', fontWeight: 700, marginBottom: '8px' }}>
                      MODE: CODING AGENT
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '8px' }}>
                      Operates as a senior software pair programmer. Automatically hooks into Git branches, task lifecycles, and code inspection engines.
                    </p>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      <strong>Primary Tools:</strong> <code>/auto</code>, <code>/plan</code>, <code>/verify</code>, <code>/exec</code>, <code>/merge</code>, <code>/review</code>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fast Switching Guide */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '4px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-cyan-bright)', marginBottom: '6px' }}>
                  // FAST WORKSPACE SWITCHING
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  Switch anytime using the <strong>Workspace Selector</strong> dropdown in the top header (with 🏠 and 📁 icons) or type <code>/workspace &lt;name|path&gt;</code> in the chat console. Switching reconfigures the shell directory, changes the active agent persona, and swaps git/task visualizers seamlessly.
                </p>
              </div>

              {/* Core Features Overview */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-amber-bright)', marginBottom: '8px', letterSpacing: '0.8px' }}>
                  // BUILT-IN WORKSPACE PANELS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '2px' }}>
                      ⌁ Tasks &amp; Plan Panel (⌥T)
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      Interactive plan annotation editor and 13-skill task lifecycle manager.
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '2px' }}>
                      ◇ Workspace Files (⌥F)
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      Explore files, view inline syntax previews, and upload/download archives.
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '2px' }}>
                      🌿 Git Branch Graph (⌥G)
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      Git Graph visualizer with Bézier curves, branch lane nodes, and diff previews.
                    </div>
                  </div>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '3px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '2px' }}>
                      ◫ System Context (⌥C)
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      Runtime telemetry, RSS memory monitoring, model metrics, and active tools.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SLASH COMMANDS DIRECTORY */}
          {activeTab === 'commands' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Search & Category Filter Bar */}
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Filter slash commands by name, keyword, or syntax..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: '1 1 200px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    color: 'var(--text-bright)',
                    outline: 'none',
                  }}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {(['all', 'assistant', 'coding', 'common', 'system'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: '4px 8px',
                        fontSize: '9px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        textTransform: 'uppercase',
                        backgroundColor: selectedCategory === cat ? 'var(--accent-amber-bright)' : 'var(--bg-primary)',
                        color: selectedCategory === cat ? 'var(--btn-contrast-text)' : 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Commands List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filteredCommands.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                    No slash commands match &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  filteredCommands.map((item) => (
                    <div
                      key={item.cmd}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '3px',
                        gap: '10px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-amber-bright)', fontFamily: 'var(--font-mono)' }}>
                            {item.cmd}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-bright)' }}>
                            {item.name}
                          </span>
                          <span
                            style={{
                              fontSize: '8px',
                              fontWeight: 700,
                              padding: '1px 4px',
                              borderRadius: '2px',
                              textTransform: 'uppercase',
                              backgroundColor:
                                item.persona === 'assistant'
                                  ? 'rgba(168, 85, 247, 0.15)'
                                  : item.persona === 'coding'
                                  ? 'rgba(59, 130, 246, 0.15)'
                                  : 'rgba(245, 158, 11, 0.15)',
                              color:
                                item.persona === 'assistant'
                                  ? 'var(--accent-purple)'
                                  : item.persona === 'coding'
                                  ? 'var(--accent-blue)'
                                  : 'var(--accent-amber-bright)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            {item.persona}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                          {item.desc}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          Example: <code>{item.example}</code>
                        </div>
                      </div>

                      {onInsertCommand && (
                        <button
                          className="mecha-btn"
                          onClick={() => {
                            onInsertCommand(`${item.cmd} `);
                            onClose();
                          }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '10px',
                            fontWeight: 600,
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title={`Insert ${item.cmd} into chat`}
                        >
                          <span>Insert</span>
                          <span>↵</span>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SKILLS & TOOLS REFERENCE */}
          {activeTab === 'skills' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Hub Launch Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--accent-purple)',
                  borderRadius: '4px',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>
                    SKILLS &amp; CAPABILITIES MANAGEMENT HUB
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Inspect full SKILL.md runbooks, discover workspace-specific skills, or scaffold new project skills.
                  </div>
                </div>
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('agy:open-skills-modal'));
                    onClose();
                  }}
                  style={{
                    backgroundColor: 'var(--accent-purple)',
                    color: 'var(--btn-contrast-text)',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <PuzzleIcon size={12} />
                  <span>OPEN SKILLS MANAGER (⌥S)</span>
                </button>
              </div>

              {/* Workspace-Scoped Skills */}
              {discoveredSkills.filter((s) => s.scope === 'workspace').length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan-bright)', marginBottom: '8px', letterSpacing: '0.8px' }}>
                    // ACTIVE WORKSPACE-SCOPED SKILLS (.agents/skills)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                    {discoveredSkills
                      .filter((s) => s.scope === 'workspace')
                      .map((sk) => (
                        <div
                          key={sk.name}
                          style={{
                            padding: '8px 10px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            borderRadius: '3px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-cyan-bright)', fontFamily: 'var(--font-mono)' }}>
                              /{sk.name}
                            </span>
                            <span style={{ fontSize: '9px', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)', padding: '0 4px', borderRadius: '2px' }}>
                              PROJECT
                            </span>
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {sk.description}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ai-cli-task Lifecycle */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-amber-bright)', marginBottom: '8px', letterSpacing: '0.8px' }}>
                  // AI-CLI-TASK 13-SKILL LIFECYCLE ENGINE
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                  {LIFECYCLE_SKILLS.map((sk) => (
                    <div
                      key={sk.name}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '3px',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-cyan-bright)', marginBottom: '2px', fontFamily: 'var(--font-mono)' }}>
                        /{sk.name}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {sk.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Native Antigravity Autonomous Tools */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-amber-bright)', marginBottom: '8px', letterSpacing: '0.8px' }}>
                  // CORE AUTONOMOUS AGENT TOOLS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                  {[
                    { tool: 'run_command', desc: 'Shell & command-line execution with PTY relay' },
                    { tool: 'view_file', desc: 'Precise line-ranged reading of local repository files' },
                    { tool: 'write_to_file', desc: 'Create new project files and brain artifacts' },
                    { tool: 'replace_file_content', desc: 'Exact surgical code pattern edits and replacements' },
                    { tool: 'grep_search', desc: 'High-speed ripgrep search matching exact patterns' },
                    { tool: 'find_by_name', desc: 'Fast fuzzy file discovery via fd globbing' },
                    { tool: 'search_web', desc: 'Live internet search queries with URL citations' },
                    { tool: 'read_url_content', desc: 'Fetch web pages converted directly to Markdown' },
                    { tool: 'schedule', desc: 'One-shot timer and recurring cron background daemon' },
                    { tool: 'manage_task', desc: 'Process lifecycle control (status, kill, send_input)' },
                  ].map((t) => (
                    <div
                      key={t.tool}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '3px',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-green-bright)', marginBottom: '2px', fontFamily: 'var(--font-mono)' }}>
                        {t.tool}()
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                        {t.desc}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: KEYBOARD SHORTCUTS MATRIX */}
          {activeTab === 'shortcuts' && (
            <div>
              {categories.map((cat) => (
                <div key={cat} style={{ marginBottom: '14px' }}>
                  <div
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-cyan-bright)',
                      fontWeight: 700,
                      letterSpacing: '0.8px',
                      marginBottom: '6px',
                      borderBottom: '1px dashed var(--border)',
                      paddingBottom: '3px',
                    }}
                  >
                    // {cat}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {SHORTCUTS.filter((s) => s.category === cat).map((s) => (
                      <div
                        key={s.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: '3px',
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--border)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {s.desc}
                        </span>
                        <kbd
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--accent-amber-bright)',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border)',
                            borderRadius: '3px',
                          }}
                        >
                          {s.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span>TIP: PRESS [?] AT ANY TIME TO OPEN THIS GUIDE</span>
          <span>PRESS [ESC] TO CLOSE</span>
        </div>
      </div>
    </div>
  );
}

export const HelpGuideModal = ShortcutsModal;
