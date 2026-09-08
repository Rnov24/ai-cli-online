import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TurnAnchor, PresentationMode } from './TurnAnchor';
import { InteractiveClarifyModal } from './InteractiveClarifyModal';
import { SystemDiagnosticsModal } from './SystemDiagnosticsModal';
import {
  RobotIcon,
  LaptopIcon,
  ClipboardIcon,
  BoltIcon,
  TargetIcon,
  StethoscopeIcon,
  DownloadIcon,
  TrashIcon,
  CodeIcon,
  ShieldIcon,
  CloseIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
} from './icons';
import { fetchSessionJournal, TurnJournalItem } from '../api/journal';
import { exportSessionToHtml } from '../utils/exportHtml';
import { useStore } from '../store';
import type { ChatMessage, ToolCall } from 'ai-cli-online-shared';
import {
  fetchWorkspaceMode,
  fetchWorkspaces,
  switchSessionWorkspace,
  createWorkspace,
  WorkspaceModePayload,
} from '../api/workspaces';
import { fetchSkills, type SkillItem } from '../api/skills';
import { SkillsManagementModal } from './SkillsManagementModal';
import { fetchPlugins } from '../api/plugins';
import { PluginsModal } from './PluginsModal';
import { fetchPersonas, setSessionPersona, type PersonaDefinition } from '../api/personas';
import { PersonaSelectorModal } from './PersonaSelectorModal';

// Ensure localStorage has a working fallback in test/jsdom/opaque-origin environments under Node 22+
try {
  let hasWorkingStorage = false;
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      localStorage.getItem('__test__');
      hasWorkingStorage = true;
    }
  } catch {
    hasWorkingStorage = false;
  }

  if (!hasWorkingStorage) {
    const map = new Map<string, string>();
    const memStorage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, val: string) => { map.set(key, String(val)); },
      removeItem: (key: string) => { map.delete(key); },
      clear: () => { map.clear(); },
      get length() { return map.size; },
      key: (i: number) => Array.from(map.keys())[i] ?? null,
    };
    if (typeof globalThis !== 'undefined') {
      try {
        Object.defineProperty(globalThis, 'localStorage', { value: memStorage, configurable: true, writable: true });
      } catch {}
    }
    if (typeof window !== 'undefined') {
      try {
        Object.defineProperty(window, 'localStorage', { value: memStorage, configurable: true, writable: true });
      } catch {}
    }
  }
} catch {}

const safeRequestAnimationFrame = (callback: FrameRequestCallback): number => {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(Date.now()), 16) as unknown as number;
};

const safeCancelAnimationFrame = (handle: number) => {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(handle);
  } else {
    clearTimeout(handle);
  }
};

interface AiChatViewProps {
  sessionId: string;
  token: string;
  externalCommand?: { cmd: string; id: number };
  onStatsChange?: (stats: { messageCount: number; toolCallCount: number; totalTokens: number }) => void;
}

interface SlashCommandItem {
  cmd: string;
  desc: string;
  category: 'assistant' | 'coding' | 'common';
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  // Common & Discovery
  { cmd: '/help', desc: 'Open Interactive Feature Guide & Help Hub', category: 'common' },
  { cmd: '/goal', desc: 'Autonomous long-running goal loop until achieved', category: 'common' },
  { cmd: '/workspace', desc: 'List, inspect, or switch project workspaces', category: 'common' },
  { cmd: '/model', desc: 'Select model for current session', category: 'common' },
  { cmd: '/clear', desc: 'Purge conversation timeline and reset session', category: 'common' },
  { cmd: '/compress', desc: 'Prune and compress conversation context', category: 'common' },
  { cmd: '/export', desc: 'Export full session to standalone offline HTML', category: 'common' },
  { cmd: '/mcp', desc: 'Inspect MCP server status and tools', category: 'common' },
  { cmd: '/plugins', desc: 'Manage Antigravity CLI plugins', category: 'common' },

  // Assistant & System (High Priority in Home)
  { cmd: '/schedule', desc: 'Set a timer or recurring cron schedule', category: 'assistant' },
  { cmd: '/learn', desc: 'Save behavioral learning or persistent memory', category: 'assistant' },
  { cmd: '/doctor', desc: 'Run system diagnostics and health check', category: 'assistant' },
  { cmd: '/diagnostics', desc: 'Open System Health & Process Supervision Modal', category: 'assistant' },
  { cmd: '/browser', desc: 'Browser automation and web search', category: 'assistant' },
  { cmd: '/agents', desc: 'List and switch available agents & personas', category: 'assistant' },

  // Coding & Lifecycle (High Priority in Project Workspaces)
  { cmd: '/plan', desc: 'Step-by-step implementation planning', category: 'coding' },
  { cmd: '/verify', desc: 'Run domain-adapted verification tests', category: 'coding' },
  { cmd: '/exec', desc: 'Execute approved implementation plan', category: 'coding' },
  { cmd: '/review', desc: 'Review code changes and diffs', category: 'coding' },
  { cmd: '/auto', desc: 'Autonomous 13-skill task lifecycle loop', category: 'coding' },
  { cmd: '/check', desc: 'Feasibility check (post-plan / mid / post-exec)', category: 'coding' },
  { cmd: '/merge', desc: 'Merge task branch into main with validation', category: 'coding' },
  { cmd: '/report', desc: 'Generate structured task completion report', category: 'coding' },
  { cmd: '/research', desc: 'Collect and index external references & docs', category: 'coding' },
  { cmd: '/grill-me', desc: 'Interactive alignment interview to refine plan', category: 'coding' },
  { cmd: '/skills', desc: 'Inspect active task skills and tools', category: 'coding' },
  { cmd: '/init', desc: 'Initialize task module and worktree branch', category: 'coding' },
  { cmd: '/summarize', desc: 'Regenerate context summary for module', category: 'coding' },
  { cmd: '/teamwork-preview', desc: 'Autonomous multi-agent coordination', category: 'coding' },
];

const PROJECT_STARTER_OPERATIONS = [
  {
    code: 'OP-01',
    cmd: '/goal ',
    label: 'AUTONOMOUS GOAL',
    desc: 'Run persistent autonomous execution loop until goal is complete',
    accent: 'var(--accent-amber-bright)',
  },
  {
    code: 'OP-02',
    cmd: '/auto ',
    label: 'TASK LIFECYCLE',
    desc: 'Execute 13-skill Antigravity task lifecycle loop for target module',
    accent: 'var(--accent-cyan-bright)',
  },
  {
    code: 'OP-03',
    cmd: '/plan ',
    label: 'IMPLEMENTATION PLAN',
    desc: 'Inspect repository architecture and draft formal execution plan',
    accent: 'var(--accent-green-bright)',
  },
  {
    code: 'OP-04',
    cmd: '/verify ',
    label: 'DOMAIN VERIFICATION',
    desc: 'Execute unit, integration, and security verification tests',
    accent: 'var(--accent-yellow)',
  },
];

const HOME_STARTER_OPERATIONS = [
  {
    code: 'OP-01',
    cmd: '/goal ',
    label: 'AUTONOMOUS OBJECTIVE',
    desc: 'Run persistent autonomous execution loop for personal workflows or tasks',
    accent: '#c084fc',
  },
  {
    code: 'OP-02',
    cmd: '/schedule ',
    label: 'TASK SCHEDULER',
    desc: 'Set up timers or recurring cron triggers for system automation',
    accent: 'var(--accent-cyan-bright)',
  },
  {
    code: 'OP-03',
    cmd: '/doctor ',
    label: 'SYSTEM HEALTH CHECK',
    desc: 'Inspect environment diagnostics, network tools, and running services',
    accent: 'var(--accent-green-bright)',
  },
  {
    code: 'OP-04',
    cmd: '/workspace ',
    label: 'SWITCH WORKSPACE',
    desc: 'Switch active session to a registered project repository',
    accent: 'var(--accent-amber-bright)',
  },
];

type AgentState = 'IDLE' | 'THINKING' | 'EXECUTING' | 'COMPLETED' | 'ERROR';

export function AiChatView({ sessionId, token, externalCommand, onStatsChange }: AiChatViewProps) {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const renameTab = useStore((s) => s.renameTab);
  const updateTabSessionMeta = useStore((s) => s.updateTabSessionMeta);
  const addTab = useStore((s) => s.addTab);
  const switchTab = useStore((s) => s.switchTab);

  const [globalPresentationMode, setGlobalPresentationMode] = useState<PresentationMode>('transparent');
  const [interruptedTurn, setInterruptedTurn] = useState<TurnJournalItem | null>(null);
  const [activeClarifyToolCall, setActiveClarifyToolCall] = useState<ToolCall | null>(null);
  const [pendingQueue, setPendingQueue] = useState<string[]>([]);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showPluginsModal, setShowPluginsModal] = useState(false);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [activePersona, setActivePersona] = useState<PersonaDefinition | null>(null);
  const [discoveredSkills, setDiscoveredSkills] = useState<SkillItem[]>([]);


  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`chat-messages-${sessionId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore parse error
      }
    }
    return [];
  });

  const [conversationId, setConversationId] = useState<string>(() => {
    return localStorage.getItem(`chat-conversation-${sessionId}`) || '';
  });

  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>('IDLE');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyPointer, setHistoryPointer] = useState<number>(-1);
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceModePayload | null>(null);

  const refreshWorkspaceMode = useCallback(async () => {
    if (!token || !sessionId) return;
    try {
      const modeData = await fetchWorkspaceMode(token, sessionId);
      setWorkspaceMode(modeData);
      fetchSkills(token, modeData.cwd)
        .then((res) => setDiscoveredSkills(res.skills || []))
        .catch(() => {});
    } catch {
      // ignore
    }
  }, [token, sessionId]);

  useEffect(() => {
    refreshWorkspaceMode();
  }, [refreshWorkspaceMode]);

  useEffect(() => {
    const handleOpenSkills = () => setShowSkillsModal(true);
    const handleOpenPlugins = () => setShowPluginsModal(true);
    const handleOpenPersona = () => setShowPersonaModal(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setShowSkillsModal((prev) => !prev);
      } else if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowPluginsModal((prev) => !prev);
      } else if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setShowPersonaModal((prev) => !prev);
      }
    };
    window.addEventListener('agy:open-skills-modal', handleOpenSkills);
    window.addEventListener('agy:open-plugins-modal', handleOpenPlugins);
    window.addEventListener('agy:open-persona-modal', handleOpenPersona);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('agy:open-skills-modal', handleOpenSkills);
      window.removeEventListener('agy:open-plugins-modal', handleOpenPlugins);
      window.removeEventListener('agy:open-persona-modal', handleOpenPersona);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastExecutedCmdIdRef = useRef<number>(0);
  const currentSessionIdRef = useRef<string>(sessionId);
  const isAtBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const pendingDeltaRef = useRef<string>('');
  const rafFlushTimerRef = useRef<number | null>(null);

  const flushPendingDeltas = useCallback((targetAssistantId: string) => {
    if (rafFlushTimerRef.current !== null) {
      safeCancelAnimationFrame(rafFlushTimerRef.current);
      rafFlushTimerRef.current = null;
    }
    const deltaToFlush = pendingDeltaRef.current;
    if (!deltaToFlush) return;
    pendingDeltaRef.current = '';
    setMessages((prev) =>
      prev.map((m) =>
        m.id === targetAssistantId
          ? { ...m, content: m.content + deltaToFlush }
          : m,
      ),
    );
  }, []);

  useEffect(() => {
    return () => {
      if (rafFlushTimerRef.current !== null) {
        safeCancelAnimationFrame(rafFlushTimerRef.current);
        rafFlushTimerRef.current = null;
      }
    };
  }, []);

  // Synchronize when switching active session
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
    if (rafFlushTimerRef.current !== null) {
      safeCancelAnimationFrame(rafFlushTimerRef.current);
      rafFlushTimerRef.current = null;
    }
    pendingDeltaRef.current = '';
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setAgentState('IDLE');

    const saved = localStorage.getItem(`chat-messages-${sessionId}`);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }

    const savedConv = localStorage.getItem(`chat-conversation-${sessionId}`) || '';
    setConversationId(savedConv);
    setInterruptedTurn(null);
    setActiveClarifyToolCall(null);
    const savedQueue = localStorage.getItem(`chat-pending-queue-${sessionId}`);
    if (savedQueue) {
      try {
        setPendingQueue(JSON.parse(savedQueue));
      } catch {
        setPendingQueue([]);
      }
    } else {
      setPendingQueue([]);
    }

    // Check server turn journal for crash recovery / interrupted turns
    if (token && sessionId) {
      fetchSessionJournal(token, sessionId)
        .then((res) => {
          if (res.ok && res.turns) {
            const interrupted = res.turns.find((t) => t.status === 'interrupted');
            if (interrupted) {
              setInterruptedTurn(interrupted);
            }
            // Restore from journal if local storage is empty
            if (!saved && res.turns.length > 0) {
              const restored: ChatMessage[] = [];
              res.turns.forEach((turn) => {
                restored.push({
                  id: `usr_${turn.id}`,
                  role: 'user',
                  content: turn.prompt,
                  timestamp: turn.createdAt,
                  status: 'done',
                });
                let parsedTools: ToolCall[] = [];
                try {
                  parsedTools = JSON.parse(turn.toolCalls);
                } catch {}
                restored.push({
                  id: turn.id,
                  turnId: turn.id,
                  role: 'assistant',
                  content: turn.fullResponse || (turn.status === 'interrupted' ? '> [!WARNING]\n> Turn interrupted unexpectedly.' : ''),
                  timestamp: turn.updatedAt || turn.createdAt,
                  status: turn.status === 'completed' ? 'done' : turn.status === 'interrupted' ? 'done' : 'error',
                  turnStatus: turn.status,
                  toolCalls: parsedTools,
                });
              });
              setMessages(restored);
            }
          }
        })
        .catch(() => {});
    }

    // Initial scroll to bottom on session load
    const timer = setTimeout(() => {
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
        isAtBottomRef.current = true;
        setShowJumpToLatest(false);
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [sessionId, token]);

  const scrollToBottom = useCallback((smooth = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'end',
      });
    } else if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
    isAtBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 70;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setShowJumpToLatest(false);
    }
  }, []);

  // Compute stats and notify parent
  const totalToolCalls = useMemo(() => {
    return messages.reduce((acc, m) => acc + (m.toolCalls ? m.toolCalls.length : 0), 0);
  }, [messages]);

  useEffect(() => {
    onStatsChange?.({
      messageCount: messages.length,
      toolCallCount: totalToolCalls,
      totalTokens,
    });
  }, [messages.length, totalToolCalls, totalTokens, onStatsChange]);

  useEffect(() => {
    try {
      localStorage.setItem(`chat-messages-${sessionId}`, JSON.stringify(messages));
    } catch {
      // quota exceeded
    }

    if (isAtBottomRef.current) {
      const raf = requestAnimationFrame(() => {
        scrollToBottom(false);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, scrollToBottom, sessionId]);

  // Handle external commands from TaskPipelineBar, PlanPanel, etc.
  useEffect(() => {
    if (externalCommand && externalCommand.id !== lastExecutedCmdIdRef.current) {
      lastExecutedCmdIdRef.current = externalCommand.id;
      handleSendMessage(externalCommand.cmd);
    }
  }, [externalCommand]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    // Auto-grow textarea up to 140px max
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;

    if (val.startsWith('/')) {
      setShowSlashMenu(true);
      setSlashFilter(val.slice(1).toLowerCase());
      setSelectedSlashIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  };

  const isHome = workspaceMode?.isHome ?? false;

  useEffect(() => {
    if (!token) return;
    fetchPersonas(token, sessionId)
      .then((data) => {
        if (data.activePersonaId) {
          const matched = data.personas.find((p) => p.id === data.activePersonaId);
          if (matched) {
            setActivePersona(matched);
            return;
          }
        }
        const defaultId = isHome ? 'agentic-assistant' : 'coding-agent';
        const def = data.personas.find((p) => p.id === defaultId);
        if (def) setActivePersona(def);
      })
      .catch(() => {});
  }, [sessionId, token, isHome]);

  const mergedCommands = useMemo(() => {
    const list: SlashCommandItem[] = [];
    const seen = new Set<string>();

    // Discovered skills from active workspace or global plugins
    for (const sk of discoveredSkills) {
      const cmd = `/${sk.name}`;
      if (!seen.has(cmd)) {
        seen.add(cmd);
        list.push({
          cmd,
          desc: `[${sk.scope.toUpperCase()}] ${sk.description}`,
          category: sk.scope === 'workspace' ? 'coding' : 'common',
        });
      }
    }

    // Static builtin slash commands
    for (const sc of SLASH_COMMANDS) {
      if (!seen.has(sc.cmd)) {
        seen.add(sc.cmd);
        list.push(sc);
      }
    }

    return list;
  }, [discoveredSkills]);

  const filteredCommands = useMemo(() => {
    const matched = mergedCommands.filter(
      (sc) =>
        sc.cmd.toLowerCase().includes(slashFilter) ||
        sc.desc.toLowerCase().includes(slashFilter),
    );

    return matched.sort((a, b) => {
      const aWeight = isHome
        ? a.category === 'assistant'
          ? 3
          : a.category === 'common'
            ? 2
            : 1
        : a.category === 'coding'
          ? 3
          : a.category === 'common'
            ? 2
            : 1;

      const bWeight = isHome
        ? b.category === 'assistant'
          ? 3
          : b.category === 'common'
            ? 2
            : 1
        : b.category === 'coding'
          ? 3
          : b.category === 'common'
            ? 2
            : 1;

      return bWeight - aWeight;
    });
  }, [slashFilter, isHome, mergedCommands]);

  const selectSlashCommand = (cmd: string) => {
    setInputText(cmd + ' ');
    setShowSlashMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const copyMessageContent = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleForkTurn = (turnMessage: ChatMessage) => {
    const turnIdx = messages.findIndex((m) => m.id === turnMessage.id);
    if (turnIdx < 0) return;
    const forkedHistory = messages.slice(0, turnIdx + 1);
    const curTab = tabs.find((t) => t.id === activeTabId || t.terminalIds.includes(sessionId));
    const newTabName = `${curTab ? curTab.name : 'Session'} (Fork)`;
    const newTabId = addTab(newTabName);
    const newTab = useStore.getState().tabs.find((t) => t.id === newTabId);
    const newSessId = newTab?.terminalIds[0] || newTabId;
    try {
      localStorage.setItem(`chat-messages-${newSessId}`, JSON.stringify(forkedHistory));
    } catch {}
    switchTab(newTabId);
  };

  const handleExportSession = () => {
    const curTab = tabs.find((t) => t.id === activeTabId || t.terminalIds.includes(sessionId));
    exportSessionToHtml(curTab?.name || sessionId, messages);
  };

  const handleQueue = () => {
    const text = inputText.trim();
    if (!text) return;
    setPendingQueue((prev) => {
      const next = [...prev, text];
      try {
        localStorage.setItem(`chat-pending-queue-${sessionId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleRemoveQueued = (index: number) => {
    setPendingQueue((prev) => {
      const next = prev.filter((_, i) => i !== index);
      try {
        localStorage.setItem(`chat-pending-queue-${sessionId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleClearQueue = () => {
    setPendingQueue([]);
    try {
      localStorage.removeItem(`chat-pending-queue-${sessionId}`);
    } catch {}
  };

  const handleSteer = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);

    try {
      await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/chat/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}

    setTimeout(() => {
      handleSendMessage(`[STEER]: ${text}`);
    }, 150);
  };

  const handleStop = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setAgentState('IDLE');

    try {
      await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/chat/stop`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // ignore
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || isStreaming) return;

    if (text === '/clear') {
      setMessages([]);
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setTotalTokens(0);
      setAgentState('IDLE');
      localStorage.removeItem(`chat-messages-${sessionId}`);
      localStorage.removeItem(`chat-conversation-${sessionId}`);
      setConversationId('');
      const curTab = tabs.find((t) => t.id === activeTabId || t.terminalIds.includes(sessionId));
      if (curTab) {
        updateTabSessionMeta(curTab.id, { messageCount: 0, sessionStatus: 'IDLE', updatedAt: Date.now() });
      }
      return;
    }

    if (text === '/export') {
      handleExportSession();
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    if (text === '/diagnostics' || text === '/health') {
      setShowDiagnosticsModal(true);
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // Interactive Help & Feature Guide
    if (text === '/help' || text === '/guide') {
      window.dispatchEvent(new CustomEvent('agy:open-help-guide', { detail: { tab: 'quickstart' } }));
      const helpText = [
        '### 💡 AGY Online: Help & Feature Guide',
        '',
        'The interactive **Help & Feature Guide** modal has been opened. You can also press **`?`** or click **`[? HELP]`** in the header anytime.',
        '',
        '#### ⚡ Dual Persona Operational Modes:',
        '- **🏠 Personal Home (`~`)**: *🤖 Agentic Assistant*. Runs daily assistant tasks, timers, diagnostics, and workspace routing (`/goal`, `/schedule`, `/learn`, `/doctor`, `/workspace`).',
        '- **💻 Project Workspaces**: *⚡ Coding Agent*. Full software engineering lifecycle with the 13-skill task pipeline (`/plan`, `/verify`, `/exec`, `/review`, `/auto`, `/merge`, `/report`).',
        '',
        '#### ⌨️ Essential Keyboard Shortcuts:',
        '- `⌘K` / `Ctrl+K`: Global Command Palette with category filters (`SKILLS`, `WORKSPACES`, `PANELS`, `SYSTEM`)',
        '- `Alt+1` .. `Alt+5`: Rapidly switch between active sessions',
        '- `Alt+C`: Toggle Context Panel (tasks, files, git graph)',
        '- `?`: Open Help & Feature Guide Hub',
        '',
        '*Type `/` in the console below to filter and trigger any of the 24 Antigravity slash commands.*',
      ].join('\n');

      const sysMsg: ChatMessage = {
        id: `cmd_sys_${Date.now()}`,
        role: 'assistant',
        content: helpText,
        timestamp: Date.now(),
        status: 'done',
      };
      setMessages((prev) => [...prev, sysMsg]);
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // Active Skills Reference & Management Hub
    if (text === '/skills' || text === '/skills list') {
      setShowSkillsModal(true);
      window.dispatchEvent(new CustomEvent('agy:open-skills-modal'));

      const workspaceSkills = discoveredSkills.filter((s) => s.scope === 'workspace');
      const globalSkills = discoveredSkills.filter((s) => s.scope === 'global');
      const builtinSkills = discoveredSkills.filter((s) => s.scope === 'builtin');

      const lines: string[] = [
        '### 🧩 Active Antigravity Skills & Capabilities Hub',
        '',
        `*Discovered **${discoveredSkills.length}** total skills across workspace, plugins, and built-in systems.*`,
        '',
      ];

      if (workspaceSkills.length > 0) {
        lines.push('#### 📁 Project / Workspace Skills (`.agents/skills`)');
        for (const s of workspaceSkills) {
          lines.push(`- **\`/${s.name}\`**: ${s.description}`);
        }
        lines.push('');
      }

      if (globalSkills.length > 0) {
        lines.push('#### 🌐 Global & Plugin Skills (`~/.gemini/config/plugins`, `~/.agents/skills`)');
        for (const s of globalSkills) {
          lines.push(`- **\`/${s.name}\`**: ${s.description}`);
        }
        lines.push('');
      }

      if (builtinSkills.length > 0) {
        lines.push('#### ⚙️ Built-In AGY Skills');
        for (const s of builtinSkills) {
          lines.push(`- **\`/${s.name}\`**: ${s.description}`);
        }
        lines.push('');
      }

      lines.push('*The Skills & Capabilities Hub modal is now open. Press **⌥S** or click any skill to inspect instructions or run.*');

      const sysMsg: ChatMessage = {
        id: `cmd_sys_${Date.now()}`,
        role: 'assistant',
        content: lines.join('\n'),
        timestamp: Date.now(),
        status: 'done',
      };
      setMessages((prev) => [...prev, sysMsg]);
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // Antigravity Plugins & Extensions Manager
    if (text === '/plugins' || text === '/plugins list') {
      setShowPluginsModal(true);
      window.dispatchEvent(new CustomEvent('agy:open-plugins-modal'));

      try {
        const plugData = await fetchPlugins(token);
        const lines: string[] = [
          '### 🧩 Antigravity Plugins & Extensions',
          '',
          `*Loaded **${plugData.count}** installed plugins.*`,
          '',
        ];
        if (plugData.plugins && plugData.plugins.length > 0) {
          for (const p of plugData.plugins) {
            const comps = p.components?.length ? p.components.join(', ') : 'none';
            lines.push(`- **\`${p.name}\`** ${p.version ? `(v${p.version})` : ''}: ${p.description || 'No description'} [${p.enabled ? 'ENABLED' : 'DISABLED'}]`);
            lines.push(`  - Components: \`${comps}\` | Source: \`${p.source}\``);
          }
        } else {
          lines.push('*No plugins currently installed. Use the Plugins Manager modal to install extensions.*');
        }
        lines.push('');
        lines.push('*The Plugins modal is now open. Press **⌥P** or run `/plugins` anytime to install, toggle, or inspect extensions.*');

        const sysMsg: ChatMessage = {
          id: `cmd_sys_${Date.now()}`,
          role: 'assistant',
          content: lines.join('\n'),
          timestamp: Date.now(),
          status: 'done',
        };
        setMessages((prev) => [...prev, sysMsg]);
      } catch (err: any) {
        const errMsg: ChatMessage = {
          id: `cmd_sys_${Date.now()}`,
          role: 'assistant',
          content: `### 🧩 Antigravity Plugins\n\nThe Plugins modal is now open.\n\n*Error fetching plugins list: ${err.message}*`,
          timestamp: Date.now(),
          status: 'done',
        };
        setMessages((prev) => [...prev, errMsg]);
      }

      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // Ticket PER-003: Multi-Persona System & Agent Customization
    if (text === '/agents' || text === '/agents list') {
      setShowPersonaModal(true);
      window.dispatchEvent(new CustomEvent('agy:open-persona-modal'));

      try {
        const pData = await fetchPersonas(token, sessionId);
        const lines: string[] = [
          '### 🤖 Antigravity Agent Personas & Mindsets',
          '',
          `*Loaded **${pData.count}** available personas. Currently active: **${activePersona ? activePersona.name : (isHome ? 'Agentic Assistant' : 'Coding Agent')}**.*`,
          '',
        ];
        for (const p of pData.personas) {
          const isCur = activePersona ? p.id === activePersona.id : (isHome ? p.id === 'agentic-assistant' : p.id === 'coding-agent');
          lines.push(`- **\`${p.name}\`** (\`${p.id}\`) ${isCur ? '*(ACTIVE)*' : ''}: ${p.role}`);
          lines.push(`  - ${p.description}`);
        }
        lines.push('');
        lines.push('*Type `/agent <id>` to switch instantly, click the persona badge in the header, or press **⌥A**.*');

        const sysMsg: ChatMessage = {
          id: `cmd_sys_${Date.now()}`,
          role: 'assistant',
          content: lines.join('\n'),
          timestamp: Date.now(),
          status: 'done',
        };
        setMessages((prev) => [...prev, sysMsg]);
      } catch (err: any) {
        const errMsg: ChatMessage = {
          id: `cmd_sys_${Date.now()}`,
          role: 'assistant',
          content: `### 🤖 Antigravity Agent Personas\n\nThe Persona Selector modal is now open.\n\n*Error fetching personas: ${err.message}*`,
          timestamp: Date.now(),
          status: 'done',
        };
        setMessages((prev) => [...prev, errMsg]);
      }

      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    if (text.startsWith('/agent ') && text.trim().length > 7) {
      const requestedId = text.substring(7).trim().toLowerCase();
      try {
        const pData = await fetchPersonas(token, sessionId);
        const matched = pData.personas.find((p) => p.id.toLowerCase() === requestedId || p.name.toLowerCase() === requestedId);
        if (matched) {
          setActivePersona(matched);
          await setSessionPersona(token, sessionId, matched.id);
          const sysMsg: ChatMessage = {
            id: `cmd_sys_${Date.now()}`,
            role: 'assistant',
            content: `**[PERSONA SWITCH]** Active agent persona set to **${matched.name}** (\`${matched.id}\`).\n\n> *${matched.role}*: ${matched.description}`,
            timestamp: Date.now(),
            status: 'done',
          };
          setMessages((prev) => [...prev, sysMsg]);
        } else {
          const sysMsg: ChatMessage = {
            id: `cmd_sys_${Date.now()}`,
            role: 'assistant',
            content: `Unknown persona: \`${requestedId}\`. Type \`/agents\` to see available personas.`,
            timestamp: Date.now(),
            status: 'done',
          };
          setMessages((prev) => [...prev, sysMsg]);
        }
      } catch {
        // ignore error
      }
      setInputText('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      return;
    }

    // Ticket CHAT-002: /workspace slash command
    if (text === '/workspace' || text === '/workspace list') {
      try {
        const wsData = await fetchWorkspaces(token);
        const listText = [
          '### 📁 Workspace Registry & Agent Mode',
          '',
          `**Personal Home (\`~\`)**: \`${wsData.home}\` (*🤖 Agentic Assistant*)`,
          '',
          '**Registered Project Workspaces**:',
          ...wsData.workspaces
            .filter((w) => !w.isHome)
            .map((w) => `- **${w.name}**: \`${w.path}\` ${w.id === wsData.activeWorkspaceId ? '*(Active)*' : ''}`),
          '',
          '---',
          '*To switch workspace, type `/workspace <name|path>` or select from the header dropdown.*',
        ].join('\n');

        const sysMsg: ChatMessage = {
          id: `cmd_sys_${Date.now()}`,
          role: 'assistant',
          content: listText,
          timestamp: Date.now(),
          status: 'done',
        };
        setMessages((prev) => [...prev, sysMsg]);
        setInputText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        return;
      } catch (err: unknown) {
        const errMsg: ChatMessage = {
          id: `cmd_err_${Date.now()}`,
          role: 'assistant',
          content: `> [!WARNING]\n> Failed to query workspaces: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
          status: 'done',
        };
        setMessages((prev) => [...prev, errMsg]);
        setInputText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        return;
      }
    }

    if (text.startsWith('/workspace ')) {
      const target = text.slice(11).trim();
      if (target) {
        try {
          const wsData = await fetchWorkspaces(token);
          let match = wsData.workspaces.find(
            (w) =>
              w.name.toLowerCase() === target.toLowerCase() ||
              w.id.toLowerCase() === target.toLowerCase() ||
              w.path.toLowerCase() === target.toLowerCase(),
          );
          if (target.toLowerCase() === 'home' || target === '~') {
            match = wsData.workspaces.find((w) => w.isHome);
          }

          if (match) {
            const res = await switchSessionWorkspace(token, sessionId, match.id, match.path);
            setWorkspaceMode(res);
            const sysMsg: ChatMessage = {
              id: `cmd_sys_${Date.now()}`,
              role: 'assistant',
              content: `Switched workspace to **${match.name}** (\`${res.cwd}\`). Active Agent Mode: **${res.mode === 'agentic-assistant' ? '🤖 Agentic Assistant' : '💻 Coding Agent'}**.`,
              timestamp: Date.now(),
              status: 'done',
            };
            setMessages((prev) => [...prev, sysMsg]);
            setInputText('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            return;
          } else {
            const created = await createWorkspace(token, target);
            const res = await switchSessionWorkspace(token, sessionId, created.id, created.path);
            setWorkspaceMode(res);
            const sysMsg: ChatMessage = {
              id: `cmd_sys_${Date.now()}`,
              role: 'assistant',
              content: `Created and switched to workspace **${created.name}** (\`${res.cwd}\`). Active Agent Mode: **${res.mode === 'agentic-assistant' ? '🤖 Agentic Assistant' : '💻 Coding Agent'}**.`,
              timestamp: Date.now(),
              status: 'done',
            };
            setMessages((prev) => [...prev, sysMsg]);
            setInputText('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
            return;
          }
        } catch (err: unknown) {
          const errMsg: ChatMessage = {
            id: `cmd_err_${Date.now()}`,
            role: 'assistant',
            content: `> [!WARNING]\n> Failed to switch workspace: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: Date.now(),
            status: 'done',
          };
          setMessages((prev) => [...prev, errMsg]);
          setInputText('');
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
          return;
        }
      }
    }

    // Save to command history
    setCommandHistory((prev) => [text, ...prev.filter((c) => c !== text)].slice(0, 50));
    setHistoryPointer(-1);

    // Auto-generate session title from first prompt if default name
    const curTab = tabs.find((t) => t.id === activeTabId || t.terminalIds.includes(sessionId));
    if (curTab) {
      const isDefaultName = /^(Session-\d+|Tab \d+|Mission-\d+|Default)$/i.test(curTab.name.trim());
      if (isDefaultName) {
        let clean = text.replace(/^\/[a-z-]+\s*/i, '').trim();
        if (clean.length > 0) {
          clean = clean.replace(/[?.!:]+$/, '');
          const words = clean.split(/\s+/).slice(0, 4);
          const generatedTitle = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          if (generatedTitle) {
            renameTab(curTab.id, generatedTitle.slice(0, 30));
          }
        }
      }
      updateTabSessionMeta(curTab.id, {
        sessionStatus: 'RUNNING',
        messageCount: messages.length + 2,
        updatedAt: Date.now(),
      });
    }

    const userMsg: ChatMessage = {
      id: `cmd_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'done',
    };

    const assistantId = `resp_${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
      toolCalls: [],
    };

    setMessages((prev) => [...prev, userMsg, initialAssistantMsg]);
    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setShowSlashMenu(false);
    setIsStreaming(true);
    setAgentState('THINKING');

    const sessionAtStart = sessionId;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: text,
          conversationId: conversationId || undefined,
          personaId: activePersona?.id,
        }),
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        let errDetail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson.error) errDetail = `${errDetail}: ${errJson.error}`;
        } catch {
          // ignore json parse error
        }
        throw new Error(errDetail);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // Session isolation check
        if (currentSessionIdRef.current !== sessionAtStart) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.conversation_id) {
              setConversationId(data.conversation_id);
              localStorage.setItem(`chat-conversation-${sessionAtStart}`, data.conversation_id);
            }

            if (data.tokens_total && data.tokens_total > 0) {
              setTotalTokens(data.tokens_total);
            }

            if (currentSessionIdRef.current !== sessionAtStart) return;

            if (data.event === 'turn_init' && data.turn_id) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, turnId: data.turn_id, turnStatus: 'submitted' } : m,
                ),
              );
            } else if (data.event === 'chunk' && data.delta) {
              setAgentState('EXECUTING');
              pendingDeltaRef.current += data.delta;

              if (rafFlushTimerRef.current === null) {
                rafFlushTimerRef.current = safeRequestAnimationFrame(() => {
                  rafFlushTimerRef.current = null;
                  const deltaToFlush = pendingDeltaRef.current;
                  if (!deltaToFlush) return;
                  pendingDeltaRef.current = '';
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: m.content + deltaToFlush, turnStatus: 'running' }
                        : m,
                    ),
                  );
                });
              }
            } else if (data.event === 'thinking' && data.thinking) {
              flushPendingDeltas(assistantId);
              setAgentState('THINKING');
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, thinking: (m.thinking || '') + data.thinking, turnStatus: 'running' }
                    : m,
                ),
              );
            } else if (data.event === 'tool' && data.tool_call) {
              flushPendingDeltas(assistantId);
              setAgentState('EXECUTING');
              const tc: ToolCall = {
                id: data.tool_call.id || `tool_${Date.now()}`,
                name: data.tool_call.name,
                args: data.tool_call.args || {},
                output: data.tool_call.output,
                status: data.tool_call.status || 'running',
              };

              // Intercept clarify or approval requests
              if (
                (tc.name === 'ask_question' || tc.name === 'ask_permission' || tc.name.includes('permission')) &&
                tc.status === 'running'
              ) {
                setActiveClarifyToolCall(tc);
              }

              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const currentTools = m.toolCalls || [];
                  const existingIndex = currentTools.findIndex((t) => t.id === tc.id);
                  if (existingIndex >= 0) {
                    const updated = [...currentTools];
                    updated[existingIndex] = tc;
                    return { ...m, toolCalls: updated, turnStatus: 'running' };
                  }
                  return { ...m, toolCalls: [...currentTools, tc], turnStatus: 'running' };
                }),
              );
            } else if (data.event === 'error') {
              flushPendingDeltas(assistantId);
              setAgentState('ERROR');
              setActiveClarifyToolCall(null);
              const errContent =
                data.error ||
                data.full_response ||
                'An error occurred during AGY execution.';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content
                          ? `${m.content}\n\n> [!CAUTION]\n> **Execution Error**: ${errContent}`
                          : `> [!CAUTION]\n> **Execution Error**: ${errContent}`,
                        status: 'done',
                        turnStatus: 'error',
                      }
                    : m,
                ),
              );
              if (curTab) {
                updateTabSessionMeta(curTab.id, {
                  sessionStatus: 'ERROR',
                  updatedAt: Date.now(),
                });
              }
            } else if (data.event === 'done') {
              flushPendingDeltas(assistantId);
              setAgentState('COMPLETED');
              setActiveClarifyToolCall(null);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: data.full_response || m.content || 'Completed.',
                        status: 'done',
                        turnStatus: 'completed',
                      }
                    : m,
                ),
              );
              if (curTab) {
                updateTabSessionMeta(curTab.id, {
                  sessionStatus: 'COMPLETED',
                  messageCount: messages.length + 2,
                  updatedAt: Date.now(),
                });
              }

              // Auto-dispatch next prompt from pending queue if present
              setPendingQueue((curQueue) => {
                if (curQueue.length > 0) {
                  const [nextPrompt, ...rest] = curQueue;
                  try {
                    localStorage.setItem(`chat-pending-queue-${sessionId}`, JSON.stringify(rest));
                  } catch {}
                  setTimeout(() => {
                    handleSendMessage(nextPrompt);
                  }, 250);
                  return rest;
                }
                return curQueue;
              });
            }
          } catch {
            // parse error on incomplete SSE chunk
          }
        }
      }
      flushPendingDeltas(assistantId);
    } catch (err: unknown) {
      flushPendingDeltas(assistantId);
      if ((err as Error).name !== 'AbortError') {
        const errorMsg = (err as Error).message || 'Failed to connect to AGY service.';
        setAgentState('ERROR');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `> [!CAUTION]\n> **Chat Stream Error**: ${errorMsg}\n>\n> Unable to stream response from AGY CLI. Please verify that the server is running and \`agy\` is accessible.`,
                  status: 'done',
                }
              : m,
          ),
        );
        if (curTab) {
          updateTabSessionMeta(curTab.id, { sessionStatus: 'ERROR', updatedAt: Date.now() });
        }
      }
    } finally {
      flushPendingDeltas(assistantId);
      if (currentSessionIdRef.current === sessionAtStart) {
        setIsStreaming(false);
        abortControllerRef.current = null;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, status: 'done' } : m)),
        );
        setTimeout(() => setAgentState('IDLE'), 2000);
      }
    }
  };

  // Listen for global command injection (from HelpGuideModal, CommandPalette, SystemHeader, etc.)
  useEffect(() => {
    const handleInsert = (e: Event) => {
      const custom = e as CustomEvent<{ cmd: string; autoSend?: boolean }>;
      if (!custom.detail?.cmd) return;
      if (custom.detail.autoSend) {
        handleSendMessage(custom.detail.cmd);
      } else {
        setInputText(custom.detail.cmd);
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.focus();
        }
      }
    };
    window.addEventListener('agy:insert-command', handleInsert);
    return () => window.removeEventListener('agy:insert-command', handleInsert);
  }, [handleSendMessage]);

  // Listen for conversation resume/new from SessionSidebar or History Browser
  useEffect(() => {
    const handleResume = (e: Event) => {
      const custom = e as CustomEvent<{ targetSessionId?: string; conversationId: string; messages: ChatMessage[] }>;
      if (custom.detail?.targetSessionId && custom.detail.targetSessionId !== sessionId) return;
      if (!custom.detail?.conversationId) return;

      setConversationId(custom.detail.conversationId);
      localStorage.setItem(`chat-conversation-${sessionId}`, custom.detail.conversationId);

      if (Array.isArray(custom.detail.messages)) {
        setMessages(custom.detail.messages);
        localStorage.setItem(`chat-messages-${sessionId}`, JSON.stringify(custom.detail.messages));
      }
      setInterruptedTurn(null);
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50);
    };

    const handleNew = (e: Event) => {
      const custom = e as CustomEvent<{ targetSessionId?: string }>;
      if (custom.detail?.targetSessionId && custom.detail.targetSessionId !== sessionId) return;

      setConversationId('');
      localStorage.removeItem(`chat-conversation-${sessionId}`);
      setMessages([]);
      localStorage.removeItem(`chat-messages-${sessionId}`);
      setInterruptedTurn(null);
    };

    window.addEventListener('agy:resume-conversation', handleResume);
    window.addEventListener('agy:new-conversation', handleNew);
    return () => {
      window.removeEventListener('agy:resume-conversation', handleResume);
      window.removeEventListener('agy:new-conversation', handleNew);
    };
  }, [sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSlashIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSlashIndex(
          (prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSlashCommand(filteredCommands[selectedSlashIndex].cmd);
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashMenu(false);
        return;
      }
    }

    // Command history navigation with Arrow Up/Down when at start of input
    if (e.key === 'ArrowUp' && (inputText === '' || historyPointer >= 0)) {
      if (commandHistory.length > 0) {
        e.preventDefault();
        const nextPtr = Math.min(commandHistory.length - 1, historyPointer + 1);
        setHistoryPointer(nextPtr);
        setInputText(commandHistory[nextPtr]);
        return;
      }
    } else if (e.key === 'ArrowDown' && historyPointer >= 0) {
      e.preventDefault();
      const nextPtr = historyPointer - 1;
      setHistoryPointer(nextPtr);
      setInputText(nextPtr >= 0 ? commandHistory[nextPtr] : '');
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      minHeight: 0,
      minWidth: 0,
      backgroundColor: 'var(--bg-base)',
      overflow: 'hidden',
      position: 'relative',
      fontFamily: 'var(--font-mono)',
    }}>
      {/* Agent Status Bar / Command Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        minHeight: '28px',
        flexShrink: 0,
        fontSize: '10px',
        gap: '8px',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexShrink: 1 }}>
          <span className="mobile-hide" style={{ color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            COMMAND STREAM //
          </span>
          <button
            type="button"
            onClick={() => setShowPersonaModal(true)}
            data-testid="header-persona-badge"
            style={{
              fontSize: '9px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '2px',
              letterSpacing: '0.5px',
              backgroundColor: activePersona?.color
                ? 'var(--badge-overlay-bg)'
                : isHome ? 'var(--accent-purple-subtle, rgba(168, 85, 247, 0.15))' : 'rgba(59, 130, 246, 0.15)',
              color: activePersona ? activePersona.color : (isHome ? 'var(--accent-purple)' : 'var(--accent-blue)'),
              border: `1px solid ${activePersona?.color || (isHome ? 'var(--accent-purple)' : 'var(--accent-blue)')}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
              cursor: 'pointer',
            }}
            title={`Active Persona: ${activePersona?.name || (isHome ? 'Agentic Assistant' : 'Coding Agent')} (Click or press ⌥A to switch)`}
          >
            <span>
              {activePersona?.icon === 'code' ? (
                <CodeIcon size={13} />
              ) : activePersona?.icon === 'shield' ? (
                <ShieldIcon size={13} />
              ) : activePersona?.icon === 'target' || activePersona?.icon === 'compass' ? (
                <TargetIcon size={13} />
              ) : activePersona?.icon === 'laptop' ? (
                <LaptopIcon size={13} />
              ) : (
                <RobotIcon size={13} />
              )}
            </span>
            <span className="mobile-hide">
              {activePersona ? ` ${activePersona.name.toUpperCase()}` : (isHome ? ' ASSISTANT' : ' CODING AGENT')}
            </span>
          </button>
          <span className={`tech-badge ${
            agentState === 'EXECUTING'
              ? 'tech-badge--active'
              : agentState === 'THINKING'
                ? 'tech-badge--cyan'
                : agentState === 'ERROR'
                  ? 'tech-badge--danger'
                  : 'tech-badge--online'
          }`}>
            <span className={`pulse-dot ${
              agentState === 'EXECUTING' || agentState === 'THINKING'
                ? 'pulse-dot--executing'
                : 'pulse-dot--online'
            }`} />
            {agentState}
          </span>

          {conversationId && (
            <span
              style={{
                fontSize: '9px',
                color: 'var(--accent-amber-bright)',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '2px',
                padding: '1px 5px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
              title={`Active AGY Conversation: ${conversationId}\nClick to copy ID`}
              onClick={() => {
                navigator.clipboard.writeText(conversationId);
              }}
            >
              <span className="mobile-hide" style={{ opacity: 0.6 }}>CID:</span>
              <span style={{ fontWeight: 700 }}>{conversationId.slice(0, 8)}</span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', flexShrink: 0 }}>
          {/* Tri-Mode Presentation Selector */}
          <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
            {(['worklog', 'transparent', 'final'] as PresentationMode[]).map((mode) => (
              <button
                key={mode}
                data-testid={`mode-${mode}`}
                aria-label={`presentation-mode-${mode}`}
                onClick={() => setGlobalPresentationMode(mode)}
                title={`Switch presentation mode to ${mode}`}
                style={{
                  background: globalPresentationMode === mode ? 'var(--bg-tertiary)' : 'transparent',
                  color: globalPresentationMode === mode ? 'var(--accent-cyan-bright)' : 'var(--text-muted)',
                  border: 'none',
                  padding: '2px 6px',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  fontWeight: globalPresentationMode === mode ? 700 : 400,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <span>{mode === 'worklog' ? <ClipboardIcon size={11} /> : mode === 'transparent' ? <BoltIcon size={11} /> : <TargetIcon size={11} />}</span>
                <span className="mobile-hide">{mode === 'worklog' ? 'LOG' : mode === 'transparent' ? 'STREAM' : 'FINAL'}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowDiagnosticsModal(true)}
            title="Open System Diagnostics & Process Supervision"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <StethoscopeIcon size={12} />
            <span className="mobile-hide">DIAG</span>
          </button>

          <button
            onClick={handleExportSession}
            title="Export session to standalone HTML"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <DownloadIcon size={12} />
            <span className="mobile-hide">EXPORT</span>
          </button>

          <span title={`${messages.length} events`}>
            <span className="mobile-hide">EVENTS: </span>{messages.length}
          </span>
          <span className="desktop-only">TOOLS: {totalToolCalls}</span>
          {totalTokens > 0 && <span className="desktop-only">TOKENS: {(totalTokens / 1000).toFixed(1)}k</span>}
          {messages.length > 0 && (
            <button
              onClick={() => handleSendMessage('/clear')}
              title="Clear session events"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <TrashIcon size={12} />
              <span className="mobile-hide">RESET</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Command Stream / Agent Timeline */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          minWidth: 0,
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
        }}
      >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? '10px' : '14px',
          padding: isMobile ? '8px 8px 36px 8px' : '14px 16px 36px 16px',
          minHeight: '100%',
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100%',
        }}>
          {messages.length === 0 ? (
            /* Empty State: Mecha Command Launch Center */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              maxWidth: '720px',
              margin: '0 auto',
              textAlign: 'center',
              padding: '20px 14px 36px 14px',
              boxSizing: 'border-box',
            }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 12px',
              borderRadius: '3px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-secondary)',
              marginBottom: '14px',
            }}>
              <span className="pulse-dot pulse-dot--online" />
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                color: isHome ? 'var(--accent-purple)' : 'var(--accent-amber-bright)',
                letterSpacing: '1px',
              }}>
                {isHome ? 'PERSONAL ASSISTANT READY' : 'AUTONOMOUS SYSTEM READY'}
              </span>
            </div>

            <h1 style={{
              fontSize: isMobile ? '18px' : '22px',
              color: 'var(--text-bright)',
              marginBottom: '8px',
              fontWeight: 700,
              letterSpacing: '1px',
            }}>
              {isHome ? 'AGY // ASSISTANT CONSOLE' : 'AGY // COMMAND CONSOLE'}
            </h1>
            <p style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginBottom: isMobile ? '18px' : '28px',
              lineHeight: 1.6,
              maxWidth: '520px',
            }}>
              {isHome
                ? 'Personal agentic assistant for Google Antigravity. Manage personal workflows, schedule automations, query tools, or switch to a coding project.'
                : 'Autonomous agent command terminal for Google Antigravity. Initialize a task lifecycle, execute long-running goals, or inspect codebase architecture.'}
            </p>

            {/* Quick Operational Triggers Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: isMobile ? '8px' : '10px',
              width: '100%',
              textAlign: 'left',
              boxSizing: 'border-box',
            }}>
              {(isHome ? HOME_STARTER_OPERATIONS : PROJECT_STARTER_OPERATIONS).map((op) => (
                <div
                  key={op.code}
                  onClick={() => {
                    setInputText(op.cmd);
                    textareaRef.current?.focus();
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '3px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = op.accent;
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: op.accent }}>
                      [{op.code}]
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {op.cmd.trim()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-bright)', marginBottom: '4px' }}>
                    {op.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    {op.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Ticket 01: Crash Recovery Interrupted Turn Banner */}
            {interruptedTurn && (
              <div
                style={{
                  width: '100%',
                  maxWidth: 'min(100%, 960px)',
                  margin: '0 auto 12px auto',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ color: 'var(--accent-red, #ef4444)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangleIcon size={12} />
                    <span>TURN INTERRUPTED</span>
                  </span>
                  <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    "{interruptedTurn.prompt}"
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setInputText(interruptedTurn.prompt);
                      setInterruptedTurn(null);
                      textareaRef.current?.focus();
                    }}
                    style={{
                      background: 'var(--accent-amber-bright, #f59e0b)',
                      color: '#000',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '10px',
                    }}
                  >
                    RETRY PROMPT
                  </button>
                  <button
                    onClick={() => setInterruptedTurn(null)}
                    style={{
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '10px',
                    }}
                  >
                    DISMISS
                  </button>
                </div>
              </div>
            )}

            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              if (!isUser) {
                const turnIndex = messages.slice(0, idx + 1).filter((m) => m.role === 'assistant').length - 1;
                return (
                  <div
                    key={msg.id}
                    style={{
                      width: '100%',
                      maxWidth: 'min(100%, 960px)',
                      margin: '0 auto 12px auto',
                      boxSizing: 'border-box',
                    }}
                  >
                    <TurnAnchor
                      message={msg}
                      turnIndex={turnIndex >= 0 ? turnIndex : 0}
                      isStreaming={isStreaming && msg.status === 'streaming'}
                      globalMode={globalPresentationMode}
                      onForkTurn={handleForkTurn}
                      onCopyContent={copyMessageContent}
                      isCopied={copiedMessageId === msg.id}
                    />
                  </div>
                );
              }

              const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    maxWidth: 'min(100%, 960px)',
                    margin: '0 auto 12px auto',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-secondary)',
                    overflow: 'hidden',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 12px',
                    backgroundColor: 'var(--bg-primary)',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '10px',
                    gap: '8px',
                    minWidth: 0,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent-amber-bright)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        COMMAND // OPERATOR
                      </span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>//</span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{timeStr}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => {
                          setInputText(msg.content);
                          textareaRef.current?.focus();
                        }}
                        title="Edit and resend"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        [EDIT]
                      </button>
                    </div>
                  </div>

                  <div style={{
                    padding: isMobile ? '8px 10px' : '12px 16px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-bright)',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}>
                    <span style={{ color: 'var(--accent-amber-bright)', marginRight: '6px', fontWeight: 700 }}>
                      &gt;
                    </span>
                    {msg.content}
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={messagesEndRef} style={{ height: '1px', flexShrink: 0 }} />
        </div>
      </div>

      {/* Floating Jump to Latest Button */}
      {showJumpToLatest && (
        <button
          onClick={() => scrollToBottom(true)}
          className="jump-latest-btn"
          title="Jump to latest events"
        >
          <span className="pulse-dot pulse-dot--executing" />
          <span>↓ NEW ACTIVITY</span>
        </button>
      )}

      {/* Quick Skill Chips Strip (Scrollable) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '5px 14px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        fontSize: '10px',
      }}>
        <span style={{ color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.8px' }}>
          SKILLS //
        </span>
        {['/goal', '/auto', '/plan', '/check', '/verify', '/exec', '/merge', '/report', '/research', '/clear'].map(
          (cmd) => (
            <button
              key={cmd}
              onClick={() => selectSlashCommand(cmd)}
              style={{
                padding: '2px 7px',
                borderRadius: '2px',
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--accent-cyan-bright)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-amber)';
                e.currentTarget.style.color = 'var(--accent-amber-bright)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--accent-cyan-bright)';
              }}
            >
              {cmd}
            </button>
          ),
        )}
      </div>

      {/* Mobile Touch Quick-Keys Toolbar (Touch-friendly terminal & command navigation) */}
      {isMobile && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 10px',
          backgroundColor: 'var(--bg-tertiary)',
          borderTop: '1px solid var(--border)',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          userSelect: 'none',
        }}>
          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent-amber-bright)', marginRight: '2px' }}>
            KEYS //
          </span>
          <button
            className="mecha-btn"
            onClick={() => {
              setShowSlashMenu(false);
              if (inputText) setInputText('');
            }}
            title="Escape / Clear Input"
            style={{ padding: '3px 8px', fontSize: '10px', minHeight: '26px' }}
          >
            ESC
          </button>
          <button
            className="mecha-btn"
            onClick={() => {
              if (showSlashMenu && filteredCommands.length > 0) {
                selectSlashCommand(filteredCommands[selectedSlashIndex].cmd);
              } else if (inputText.startsWith('/')) {
                setShowSlashMenu(true);
              }
            }}
            title="Tab / Autocomplete"
            style={{ padding: '3px 8px', fontSize: '10px', minHeight: '26px' }}
          >
            TAB
          </button>
          <button
            className="mecha-btn mecha-btn--danger"
            onClick={() => {
              if (isStreaming) handleStop();
              else setInputText('');
            }}
            title="Abort stream or cancel"
            style={{ padding: '3px 8px', fontSize: '10px', minHeight: '26px' }}
          >
            ^C
          </button>
          <button
            className="mecha-btn"
            onClick={() => {
              if (commandHistory.length > 0) {
                const nextPtr = Math.min(commandHistory.length - 1, historyPointer + 1);
                setHistoryPointer(nextPtr);
                setInputText(commandHistory[nextPtr]);
              }
            }}
            title="Previous command"
            style={{ padding: '3px 9px', fontSize: '11px', minHeight: '26px' }}
          >
            ▲
          </button>
          <button
            className="mecha-btn"
            onClick={() => {
              if (historyPointer >= 0) {
                const nextPtr = historyPointer - 1;
                setHistoryPointer(nextPtr);
                setInputText(nextPtr >= 0 ? commandHistory[nextPtr] : '');
              }
            }}
            title="Next command"
            style={{ padding: '3px 9px', fontSize: '11px', minHeight: '26px' }}
          >
            ▼
          </button>
          <button
            className="mecha-btn mecha-btn--cyan"
            onClick={() => {
              if (!inputText.startsWith('agy ')) {
                setInputText('agy ' + inputText);
              }
              textareaRef.current?.focus();
            }}
            title="Prepend agy CLI"
            style={{ padding: '3px 8px', fontSize: '10px', minHeight: '26px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
          >
            <span>agy</span>
            <ChevronRightIcon size={9} />
          </button>
          <button
            className="mecha-btn"
            onClick={() => {
              setInputText('/');
              setShowSlashMenu(true);
              setSlashFilter('');
              textareaRef.current?.focus();
            }}
            title="Insert slash command"
            style={{ padding: '3px 8px', fontSize: '11px', minHeight: '26px' }}
          >
            /
          </button>
          <button
            className="mecha-btn"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text) setInputText((prev) => prev + text);
              } catch {
                // clipboard read permission denied
              }
            }}
            title="Paste from clipboard"
            style={{ padding: '3px 8px', fontSize: '10px', minHeight: '26px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <ClipboardIcon size={12} />
            <span>PASTE</span>
          </button>
        </div>
      )}

      {/* Command Console Input Dock */}
      <div style={{
        position: 'relative',
        padding: isMobile ? '6px 8px' : '10px 14px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Slash Command Autocomplete Popover */}
        {showSlashMenu && filteredCommands.length > 0 && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: '14px',
            right: '14px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-active)',
            borderRadius: '3px',
            maxHeight: 'min(240px, 40vh)',
            overflowY: 'auto',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.6), 0 0 10px var(--accent-amber-glow)',
            zIndex: 100,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              backgroundColor: 'var(--bg-primary)',
              borderBottom: '1px solid var(--border)',
              fontSize: '9px',
              color: 'var(--accent-amber-bright)',
              fontWeight: 700,
              letterSpacing: '0.8px',
            }}>
              <span>// AVAILABLE SLASH COMMANDS ({filteredCommands.length})</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Mode: {isHome ? 'Agentic Assistant' : 'Coding Agent'}</span>
            </div>
            {filteredCommands.map((sc, i) => (
              <div
                key={sc.cmd}
                onClick={() => selectSlashCommand(sc.cmd)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: isMobile ? '8px 10px' : '6px 10px',
                  cursor: 'pointer',
                  backgroundColor: i === selectedSlashIndex ? 'var(--accent-amber-subtle)' : 'transparent',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '8px',
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: sc.category === 'coding' ? 'var(--accent-cyan-bright)' : sc.category === 'assistant' ? 'var(--accent-purple)' : 'var(--accent-amber-bright)',
                    fontWeight: 700,
                  }}>
                    {sc.category.toUpperCase()}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: 'var(--accent-amber-bright)',
                    fontSize: '12px',
                  }}>
                    {sc.cmd}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  {sc.desc}
                </span>
              </div>
            ))}
            <div style={{
              padding: '3px 8px',
              backgroundColor: 'var(--bg-primary)',
              fontSize: '9px',
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border-subtle)',
              textAlign: 'right',
            }}>
              ↑↓ navigate · Tab/Enter choose · Esc dismiss
            </div>
          </div>
        )}

        {/* Pending Intent Queue Drawer */}
        {pendingQueue.length > 0 && (
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderBottom: 'none',
              borderRadius: '4px 4px 0 0',
              padding: '6px 10px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--accent-amber-bright)', fontWeight: 700 }}>PENDING QUEUE</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  ({pendingQueue.length} {pendingQueue.length === 1 ? 'prompt' : 'prompts'} queued to dispatch)
                </span>
              </div>
              <button
                onClick={handleClearQueue}
                title="Clear all queued prompts"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '9px',
                }}
              >
                [CLEAR ALL]
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '100px', overflowY: 'auto' }}>
              {pendingQueue.map((prompt, qIdx) => (
                <div
                  key={qIdx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '3px 6px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '3px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--accent-cyan-bright)', fontSize: '10px', flexShrink: 0 }}>
                    #{qIdx + 1}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--text-primary)',
                      fontSize: '11px',
                    }}
                  >
                    {prompt}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      onClick={() => {
                        setInputText(prompt);
                        handleRemoveQueued(qIdx);
                        textareaRef.current?.focus();
                      }}
                      title="Edit this prompt"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: '9px',
                      }}
                    >
                      [EDIT]
                    </button>
                    <button
                      onClick={() => handleRemoveQueued(qIdx)}
                      title="Remove from queue"
                      aria-label="Remove from queue"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-red)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1px',
                      }}
                    >
                      <CloseIcon size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Command Console Dock Box */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: pendingQueue.length > 0 ? '0 0 3px 3px' : '3px',
          padding: '8px 10px',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          maxWidth: '100%',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
            <span style={{
              color: 'var(--accent-amber-bright)',
              fontSize: '14px',
              fontWeight: 700,
              userSelect: 'none',
              lineHeight: '1.3',
              flexShrink: 0,
            }}>
              &gt;
            </span>
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={isMobile ? "Ask AGY or enter /command..." : "Ask AGY anything, or enter /command... (Enter to send, Shift+Enter for newline)"}
              rows={1}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text-bright)',
                fontSize: '13px',
                lineHeight: '1.4',
                resize: 'none',
                maxHeight: '140px',
                fontFamily: 'var(--font-mono)',
                minHeight: '22px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Console Dock Footer: Hints on left, Action Buttons on right */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            marginTop: '4px',
            paddingTop: '4px',
            borderTop: '1px dashed var(--border-subtle)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setInputText('/');
                  setShowSlashMenu(true);
                  setSlashFilter('');
                  setSelectedSlashIndex(0);
                  textareaRef.current?.focus();
                }}
                title="Browse slash commands (/)"
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '2px',
                  color: 'var(--accent-amber-bright)',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                [/] COMMANDS
              </button>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('agy:open-help-guide', { detail: { tab: 'quickstart' } }));
                }}
                title="Open Interactive Help & Feature Guide (?)"
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: '2px',
                  color: 'var(--accent-cyan-bright)',
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                ? GUIDE
              </button>
              <span className="desktop-only" style={{ color: 'var(--text-muted)' }}>·</span>
              <span className="desktop-only">↑↓ history</span>
              <span className="desktop-only">·</span>
              <span className="desktop-only">Shift+⏎ newline</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
              {isStreaming ? (
                <>
                  {inputText.trim() && (
                    <>
                      <button
                        type="button"
                        className="mecha-btn"
                        onClick={handleQueue}
                        title="Add prompt to pending queue"
                        style={{
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          borderColor: 'var(--accent-amber)',
                          color: 'var(--accent-amber-bright)',
                          padding: '5px 10px',
                          minHeight: '30px',
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        + QUEUE
                      </button>
                      <button
                        type="button"
                        className="mecha-btn"
                        onClick={handleSteer}
                        title="Steer agent mid-flight with this guidance"
                        style={{
                          backgroundColor: 'rgba(6, 182, 212, 0.15)',
                          borderColor: 'var(--accent-cyan)',
                          color: 'var(--accent-cyan-bright)',
                          padding: '5px 10px',
                          minHeight: '30px',
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <BoltIcon size={12} />
                        <span>STEER</span>
                      </button>
                    </>
                  )}
                  <button
                    className="mecha-btn mecha-btn--danger"
                    onClick={handleStop}
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      borderColor: 'var(--accent-red)',
                      color: 'var(--accent-red)',
                      padding: '5px 12px',
                      minHeight: '30px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      fontSize: '11px',
                    }}
                  >
                    ■ ABORT
                  </button>
                </>
              ) : (
                <button
                  className="mecha-btn mecha-btn--primary"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim()}
                  style={{
                    padding: '5px 14px',
                    minHeight: '30px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: '11px',
                    opacity: inputText.trim() ? 1 : 0.4,
                    cursor: inputText.trim() ? 'pointer' : 'default',
                  }}
                >
                  TRANSMIT ⏎
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Tool Clarify / Approval Dialog */}
      {activeClarifyToolCall && (
        <InteractiveClarifyModal
          toolCall={activeClarifyToolCall}
          onSubmit={(response) => {
            setActiveClarifyToolCall(null);
            handleSendMessage(response);
          }}
          onDismiss={() => setActiveClarifyToolCall(null)}
        />
      )}

      {/* System Health Diagnostics & Process Supervision Modal */}
      <SystemDiagnosticsModal
        token={token}
        isOpen={showDiagnosticsModal}
        onClose={() => setShowDiagnosticsModal(false)}
      />

      {/* Skills Management & Capabilities Hub Modal */}
      <SkillsManagementModal
        isOpen={showSkillsModal}
        onClose={() => setShowSkillsModal(false)}
        cwd={workspaceMode?.cwd}
        token={token}
        onExecuteSkill={(cmd) => {
          setInputText(cmd);
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.focus();
          }
        }}
      />

      {/* Antigravity Plugins & Extensions Modal */}
      <PluginsModal
        isOpen={showPluginsModal}
        onClose={() => setShowPluginsModal(false)}
        token={token}
      />

      {/* Agent Personas & Operational Roles Modal */}
      <PersonaSelectorModal
        isOpen={showPersonaModal}
        onClose={() => setShowPersonaModal(false)}
        activePersonaId={activePersona?.id || (isHome ? 'agentic-assistant' : 'coding-agent')}
        onSelectPersona={(p) => setActivePersona(p)}
        token={token}
        sessionId={sessionId}
      />
    </div>
  );
}
