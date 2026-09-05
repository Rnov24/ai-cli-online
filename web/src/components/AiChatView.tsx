import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { useStore } from '../store';
import type { ChatMessage, ToolCall } from 'ai-cli-online-shared';
import {
  fetchWorkspaceMode,
  fetchWorkspaces,
  switchSessionWorkspace,
  createWorkspace,
  WorkspaceModePayload,
} from '../api/workspaces';

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
  { cmd: '/mcp', desc: 'Inspect MCP server status and tools', category: 'common' },
  { cmd: '/plugins', desc: 'Manage Antigravity CLI plugins', category: 'common' },

  // Assistant & System (High Priority in Home)
  { cmd: '/schedule', desc: 'Set a timer or recurring cron schedule', category: 'assistant' },
  { cmd: '/learn', desc: 'Save behavioral learning or persistent memory', category: 'assistant' },
  { cmd: '/doctor', desc: 'Run system diagnostics and health check', category: 'assistant' },
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
    } catch {
      // ignore
    }
  }, [token, sessionId]);

  useEffect(() => {
    refreshWorkspaceMode();
  }, [refreshWorkspaceMode]);

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

  // Synchronize when switching active session
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
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
  }, [sessionId]);

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

  const filteredCommands = useMemo(() => {
    const matched = SLASH_COMMANDS.filter(
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
  }, [slashFilter, isHome]);

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

    // Interactive Help & Feature Guide
    if (text === '/help' || text === '/guide') {
      window.dispatchEvent(new CustomEvent('agy:open-help-guide', { detail: { tab: 'quickstart' } }));
      const helpText = [
        '### 💡 AGY Online — Help & Feature Guide',
        '',
        'The interactive **Help & Feature Guide** modal has been opened. You can also press **`?`** or click **`[? HELP]`** in the header anytime.',
        '',
        '#### ⚡ Dual Persona Operational Modes:',
        '- **🏠 Personal Home (`~`)**: *🤖 Agentic Assistant* — Runs daily assistant tasks, timers, diagnostics, and workspace routing (`/goal`, `/schedule`, `/learn`, `/doctor`, `/workspace`).',
        '- **💻 Project Workspaces**: *⚡ Coding Agent* — Full software engineering lifecycle with the 13-skill task pipeline (`/plan`, `/verify`, `/exec`, `/review`, `/auto`, `/merge`, `/report`).',
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

    // Active Skills Reference
    if (text === '/skills') {
      window.dispatchEvent(new CustomEvent('agy:open-help-guide', { detail: { tab: 'skills' } }));
      const skillsText = [
        '### ⚡ Active `ai-cli-task` Lifecycle Skills & Autonomous Tools',
        '',
        '1. **/auto `<module>`**: Autonomous 13-skill loop (plan → research → check → verify → exec → merge → report)',
        '2. **/plan `<module>`**: Architecture and step-by-step implementation plan',
        '3. **/research `<module>`**: External references and dependency gathering',
        '4. **/check `<module>`**: Feasibility validation before code modifications',
        '5. **/verify `<module>`**: Execute domain-adapted tests (unit, build, integration)',
        '6. **/exec `<module>`**: Execute approved implementation plan',
        '7. **/review `<module>`**: Review diffs, security, and changes',
        '8. **/merge `<module>`**: Merge isolated worktree branch to main',
        '9. **/report `<module>`**: Generate formal task completion report',
        '10. **/init `<module>`**: Initialize task module and branch',
        '11. **/cancel `<module>`**: Cancel task & clean worktree',
        '12. **/list**: Query status of all task modules',
        '13. **/annotate `<file>` `<ann>`**: Process Plan panel annotations',
        '14. **/summarize `<module>`**: Regenerate context summary',
        '',
        '*Click **[? HELP]** in header to inspect the complete Skills & Tools reference.*',
      ].join('\n');

      const sysMsg: ChatMessage = {
        id: `cmd_sys_${Date.now()}`,
        role: 'assistant',
        content: skillsText,
        timestamp: Date.now(),
        status: 'done',
      };
      setMessages((prev) => [...prev, sysMsg]);
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
          `**Personal Home (\`~\`)**: \`${wsData.home}\` — *🤖 Agentic Assistant*`,
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

            if (data.event === 'chunk' && data.delta) {
              setAgentState('EXECUTING');
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + data.delta } : m,
                ),
              );
            } else if (data.event === 'thinking' && data.thinking) {
              setAgentState('THINKING');
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, thinking: (m.thinking || '') + data.thinking }
                    : m,
                ),
              );
            } else if (data.event === 'tool' && data.tool_call) {
              setAgentState('EXECUTING');
              const tc: ToolCall = {
                id: data.tool_call.id || `tool_${Date.now()}`,
                name: data.tool_call.name,
                args: data.tool_call.args || {},
                output: data.tool_call.output,
                status: data.tool_call.status || 'running',
              };
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) return m;
                  const currentTools = m.toolCalls || [];
                  const existingIndex = currentTools.findIndex((t) => t.id === tc.id);
                  if (existingIndex >= 0) {
                    const updated = [...currentTools];
                    updated[existingIndex] = tc;
                    return { ...m, toolCalls: updated };
                  }
                  return { ...m, toolCalls: [...currentTools, tc] };
                }),
              );
            } else if (data.event === 'error') {
              setAgentState('ERROR');
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
              setAgentState('COMPLETED');
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: data.full_response || m.content || 'Completed.',
                        status: 'done',
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
            }
          } catch {
            // parse error on incomplete SSE chunk
          }
        }
      }
    } catch (err: unknown) {
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
          <span style={{ color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>
            COMMAND STREAM //
          </span>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '2px',
              letterSpacing: '0.5px',
              backgroundColor: isHome ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: isHome ? '#c084fc' : '#60a5fa',
              border: `1px solid ${isHome ? 'rgba(168, 85, 247, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0,
            }}
            title={isHome ? 'Home Persona: General Agentic Assistant' : 'Workspace Persona: Autonomous Coding Agent'}
          >
            {isHome ? '🤖 ASSISTANT' : '💻 CODING AGENT'}
          </span>
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', flexShrink: 0 }}>
          <span>EVENTS: {messages.length}</span>
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
              }}
            >
              [RESET]
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
                color: isHome ? '#c084fc' : 'var(--accent-amber-bright)',
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
          messages.map((msg) => {
            const isUser = msg.role === 'user';
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
                  margin: '0 auto',
                  minWidth: 0,
                  boxSizing: 'border-box',
                  border: '1px solid var(--border)',
                  borderRadius: '3px',
                  backgroundColor: isUser ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                  overflow: 'hidden',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                }}
              >
                {/* Event Header Banner */}
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
                    {isUser ? (
                      <span style={{ fontWeight: 700, color: 'var(--accent-amber-bright)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        COMMAND // OPERATOR
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontWeight: 700,
                        color: 'var(--accent-cyan-bright)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        <span className="pulse-dot pulse-dot--online" style={{ flexShrink: 0 }} />
                        AGY // AUTONOMOUS AGENT
                      </span>
                    )}
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>//</span>
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{timeStr}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {isUser ? (
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
                    ) : (
                      msg.content && (
                        <button
                          onClick={() => copyMessageContent(msg.id, msg.content)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: copiedMessageId === msg.id ? 'var(--accent-green-bright)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {copiedMessageId === msg.id ? '✓ COPIED' : '[COPY]'}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Event Body Content */}
                <div style={{
                  padding: isMobile ? '8px 10px' : '12px 16px',
                  fontSize: '12px',
                  lineHeight: '1.6',
                  color: 'var(--text-primary)',
                  minWidth: 0,
                  maxWidth: '100%',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                  boxSizing: 'border-box',
                }}>
                  {/* Thinking block if available */}
                  {msg.thinking && (
                    <ThinkingBlock
                      thinking={msg.thinking}
                      isStreaming={msg.status === 'streaming'}
                    />
                  )}

                  {/* Tool execution cards if any */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div style={{ margin: '6px 0 10px 0', minWidth: 0, maxWidth: '100%' }}>
                      {msg.toolCalls.map((tc) => (
                        <ToolCallCard key={tc.id} toolCall={tc} />
                      ))}
                    </div>
                  )}

                  {/* Markdown or Plain Text Content */}
                  {isUser ? (
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      color: 'var(--text-bright)',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                      minWidth: 0,
                    }}>
                      <span style={{ color: 'var(--accent-amber-bright)', marginRight: '6px', fontWeight: 700 }}>
                        &gt;
                      </span>
                      {msg.content}
                    </div>
                  ) : msg.content ? (
                    <div style={{ minWidth: 0, maxWidth: '100%', overflowWrap: 'anywhere' }}>
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  ) : msg.status === 'streaming' ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--accent-amber-bright)',
                      fontSize: '11px',
                    }}>
                      <span className="pulse-dot pulse-dot--executing" />
                      <span>Synthesizing response...</span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
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
            style={{ padding: '3px 8px', fontSize: '10px', minHeight: '26px' }}
          >
            agy ▶
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
            style={{ padding: '3px 8px', fontSize: '10px', minHeight: '26px' }}
          >
            📋 PASTE
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
                    color: sc.category === 'coding' ? 'var(--accent-cyan-bright)' : sc.category === 'assistant' ? '#c084fc' : 'var(--accent-amber-bright)',
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

        {/* Command Console Dock Box */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
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
            marginTop: '4px',
            paddingTop: '4px',
            borderTop: '1px dashed var(--border-subtle)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
              {isStreaming ? (
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
    </div>
  );
}
