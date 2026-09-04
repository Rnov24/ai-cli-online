import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { useStore } from '../store';
import type { ChatMessage, ToolCall } from 'ai-cli-online-shared';

interface AiChatViewProps {
  sessionId: string;
  token: string;
  externalCommand?: { cmd: string; id: number };
  onStatsChange?: (stats: { messageCount: number; toolCallCount: number; totalTokens: number }) => void;
}

const SLASH_COMMANDS = [
  { cmd: '/goal', desc: 'Autonomous long-running goal loop until achieved' },
  { cmd: '/auto', desc: 'Autonomous 13-skill task lifecycle loop' },
  { cmd: '/plan', desc: 'Step-by-step implementation planning' },
  { cmd: '/check', desc: 'Feasibility check (post-plan / mid / post-exec)' },
  { cmd: '/verify', desc: 'Run domain-adapted verification tests' },
  { cmd: '/exec', desc: 'Execute approved implementation plan' },
  { cmd: '/merge', desc: 'Merge task branch into main with validation' },
  { cmd: '/report', desc: 'Generate structured task completion report' },
  { cmd: '/research', desc: 'Collect and index external references & docs' },
  { cmd: '/grill-me', desc: 'Interactive alignment interview to refine plan' },
  { cmd: '/model', desc: 'Select model for current session' },
  { cmd: '/clear', desc: 'Purge conversation timeline and reset session' },
];

const STARTER_OPERATIONS = [
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

  const filteredCommands = SLASH_COMMANDS.filter(
    (sc) => sc.cmd.toLowerCase().includes(slashFilter) || sc.desc.toLowerCase().includes(slashFilter),
  );

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
        throw new Error(`HTTP ${res.status}`);
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
        setAgentState('ERROR');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    `> [!WARNING]\n> Request dispatched to session. Monitor Plan and Git timeline for background updates.`,
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
          gap: '14px',
          padding: '14px 16px 36px 16px',
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
                color: 'var(--accent-amber-bright)',
                letterSpacing: '1px',
              }}>
                AUTONOMOUS SYSTEM READY
              </span>
            </div>

            <h1 style={{
              fontSize: '22px',
              color: 'var(--text-bright)',
              marginBottom: '8px',
              fontWeight: 700,
              letterSpacing: '1px',
            }}>
              AGY // COMMAND CONSOLE
            </h1>
            <p style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginBottom: '28px',
              lineHeight: 1.6,
              maxWidth: '520px',
            }}>
              Autonomous agent command terminal for Google Antigravity. Initialize a task lifecycle, execute long-running goals, or inspect codebase architecture.
            </p>

            {/* Quick Operational Triggers Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px',
              width: '100%',
              textAlign: 'left',
              boxSizing: 'border-box',
            }}>
              {STARTER_OPERATIONS.map((op) => (
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
                  padding: '12px 16px',
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

      {/* Quick Skill Chips Strip */}
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

      {/* Command Console Input Dock */}
      <div style={{
        position: 'relative',
        padding: '10px 14px',
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
            maxHeight: 'min(200px, 35vh)',
            overflowY: 'auto',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.6), 0 0 10px var(--accent-amber-glow)',
            zIndex: 100,
          }}>
            <div style={{
              padding: '4px 8px',
              backgroundColor: 'var(--bg-primary)',
              borderBottom: '1px solid var(--border)',
              fontSize: '9px',
              color: 'var(--accent-amber-bright)',
              fontWeight: 700,
              letterSpacing: '0.8px',
            }}>
              // AVAILABLE SLASH COMMANDS
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
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: 'var(--accent-amber-bright)',
                  fontSize: '12px',
                }}>
                  {sc.cmd}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  {sc.desc}
                </span>
              </div>
            ))}
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
            <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>/commands</span>
              <span>·</span>
              <span>↑↓ history</span>
              <span>·</span>
              <span>Shift+⏎ newline</span>
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
