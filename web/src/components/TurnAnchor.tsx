import { useState, memo } from 'react';
import type { ChatMessage } from 'agy-online-shared';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { CheckIcon, BoltIcon } from './icons';

export type PresentationMode = 'worklog' | 'transparent' | 'final';
export type VerbosityMode = 'compact' | 'verbose' | 'minimal';

interface TurnAnchorProps {
  message: ChatMessage;
  turnIndex: number;
  isStreaming: boolean;
  globalMode?: PresentationMode;
  verbosityMode?: VerbosityMode;
  onForkTurn?: (message: ChatMessage) => void;
  onCopyContent?: (id: string, text: string) => void;
  isCopied?: boolean;
}

export const TurnAnchor = memo(function TurnAnchor({
  message,
  turnIndex,
  isStreaming,
  globalMode = 'transparent',
  verbosityMode,
  onForkTurn,
  onCopyContent,
  isCopied,
}: TurnAnchorProps) {
  // Local mode override per turn; defaults to global session mode or verbosity mode
  const [localMode, setLocalMode] = useState<PresentationMode | null>(null);
  const [worklogExpanded, setWorklogExpanded] = useState(false);

  // Map verbosityMode to presentationMode if provided: compact -> worklog, verbose -> transparent, minimal -> final
  const effectiveGlobalMode: PresentationMode = verbosityMode
    ? (verbosityMode === 'compact' ? 'worklog' : verbosityMode === 'minimal' ? 'final' : 'transparent')
    : globalMode;

  const activeMode = localMode || effectiveGlobalMode;
  const isSettled = message.status === 'done' || message.status === 'error';
  const toolCalls = message.toolCalls || [];
  const toolCount = toolCalls.length;
  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const subagentToolCalls = toolCalls.filter(
    (tc) => tc.name === 'invoke_subagent' || tc.name.toLowerCase().includes('subagent')
  );
  const hasSubagent = subagentToolCalls.length > 0;

  const runningTool = toolCalls.find((tc) => tc.status === 'running');
  const runningTarget = runningTool
    ? (runningTool.name === 'invoke_subagent'
        ? (runningTool.args?.toolSummary ? String(runningTool.args.toolSummary).replace(/^"|"$/g, '') : 'SUBAGENT')
        : runningTool.args?.CommandLine
        ? String(runningTool.args.CommandLine)
        : String(runningTool.args?.TargetFile || runningTool.args?.AbsolutePath || runningTool.args?.Query || ''))
    : '';

  const isAutoExpanded = worklogExpanded || (activeMode === 'worklog' && !!runningTool);

  const renderStreamingIndicator = (mode: PresentationMode) => {
    if (runningTool) {
      const isSubagent = runningTool.name === 'invoke_subagent';
      return (
        <div
          data-testid="executing-telemetry"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: isSubagent ? 'var(--accent-purple, #a78bfa)' : 'var(--accent-amber-bright)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span className="pulse-dot pulse-dot--executing" />
          <span>EXECUTING // {isSubagent ? 'DELEGATE SUBAGENT' : runningTool.name.toUpperCase()} {runningTarget ? `> ${runningTarget}` : ''}</span>
        </div>
      );
    }
    if (mode === 'final' || verbosityMode === 'minimal') {
      return (
        <div
          data-testid="streaming-minimal-telemetry"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--accent-cyan-bright)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span className="pulse-dot pulse-dot--executing" />
        </div>
      );
    }
    return (
      <div
        data-testid="streaming-telemetry"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'var(--accent-cyan-bright)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span className="pulse-dot pulse-dot--executing" />
        <span>STREAMING RESPONSE...</span>
      </div>
    );
  };

  return (
    <div
      className={`turn-anchor ${isSettled ? 'turn-anchor--settled' : 'turn-anchor--streaming'}`}
      style={{
        border: '1px solid var(--border)',
        borderRadius: '8px',
        backgroundColor: 'var(--bg-primary)',
        boxShadow: isSettled ? '0 1px 3px rgba(0,0,0,0.2)' : '0 0 0 1px var(--accent-cyan)',
        overflow: 'hidden',
        transition: 'border-color 0.2s ease',
      }}
    >
      {/* Anchor Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              color: 'var(--accent-cyan-bright)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              className={`pulse-dot ${
                message.status === 'streaming'
                  ? 'pulse-dot--executing'
                  : message.status === 'error'
                  ? 'pulse-dot--error'
                  : 'pulse-dot--online'
              }`}
              style={{ flexShrink: 0 }}
            />
            TURN #{turnIndex + 1} // AGY ASSISTANT
          </span>
          <span style={{ color: 'var(--text-muted)' }}>//</span>
          <span style={{ color: 'var(--text-muted)' }}>{timeStr}</span>
          {message.turnStatus && message.turnStatus !== 'completed' && (
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '3px',
                backgroundColor:
                  message.turnStatus === 'interrupted'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(245, 158, 11, 0.15)',
                color:
                  message.turnStatus === 'interrupted'
                    ? 'var(--accent-red)'
                    : 'var(--accent-amber)',
                border: `1px solid ${
                  message.turnStatus === 'interrupted'
                    ? 'var(--accent-red)'
                    : 'var(--accent-amber)'
                }`,
                textTransform: 'uppercase',
                fontWeight: 600,
                letterSpacing: '0.5px',
              }}
            >
              {message.turnStatus}
            </span>
          )}
          {hasSubagent && (
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '3px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--accent-purple, #a78bfa)',
                border: '1px solid var(--border)',
                fontWeight: 700,
                letterSpacing: '0.5px',
              }}
            >
              {subagentToolCalls.length} SUBAGENT{subagentToolCalls.length > 1 ? 'S' : ''}
            </span>
          )}
          {toolCount > 0 && (
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '3px',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--accent-cyan)',
                border: '1px solid var(--border)',
              }}
            >
              {toolCount} TOOLS
            </span>
          )}
        </div>

        {/* Turn Actions & Presentation Mode Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* Tri-Mode Presentation Segmented Control */}
          <div
            style={{
              display: 'inline-flex',
              borderRadius: '3px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              backgroundColor: 'var(--bg-primary)',
            }}
          >
            <button
              onClick={() => setLocalMode('worklog')}
              title="Worklog View: Collapsible telemetry trail"
              style={{
                background: activeMode === 'worklog' ? 'var(--bg-hover)' : 'transparent',
                color: activeMode === 'worklog' ? 'var(--accent-amber-bright)' : 'var(--text-muted)',
                border: 'none',
                padding: '2px 6px',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: activeMode === 'worklog' ? 700 : 400,
              }}
            >
              LOG
            </button>
            <button
              onClick={() => setLocalMode('transparent')}
              title="Transparent View: Full inline reasoning & execution stream"
              style={{
                background: activeMode === 'transparent' ? 'var(--bg-hover)' : 'transparent',
                color: activeMode === 'transparent' ? 'var(--accent-cyan-bright)' : 'var(--text-muted)',
                border: 'none',
                borderLeft: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                padding: '2px 6px',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: activeMode === 'transparent' ? 700 : 400,
              }}
            >
              STREAM
            </button>
            <button
              onClick={() => setLocalMode('final')}
              title="Final View: Clean response only"
              style={{
                background: activeMode === 'final' ? 'var(--bg-hover)' : 'transparent',
                color: activeMode === 'final' ? 'var(--text-bright)' : 'var(--text-muted)',
                border: 'none',
                padding: '2px 6px',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: activeMode === 'final' ? 700 : 400,
              }}
            >
              ANSWER
            </button>
          </div>

          {onForkTurn && isSettled && (
            <button
              onClick={() => onForkTurn(message)}
              title="Fork session from this turn"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              [FORK]
            </button>
          )}

          {message.content && onCopyContent && (
            <button
              onClick={() => onCopyContent(message.id, message.content)}
              title="Copy markdown content"
              style={{
                background: 'none',
                border: 'none',
                color: isCopied ? 'var(--accent-green-bright)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '9px',
                fontFamily: 'var(--font-mono)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              {isCopied ? <><CheckIcon size={11} /> COPIED</> : '[COPY]'}
            </button>
          )}
        </div>
      </div>

      {/* Anchor Body based on activeMode */}
      <div
        style={{
          padding: '12px 16px',
          fontSize: '12px',
          lineHeight: '1.6',
          color: 'var(--text-primary)',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {/* MODE: WORKLOG / COMPACT */}
        {activeMode === 'worklog' && (
          <div>
            <div
              onClick={() => setWorklogExpanded(!worklogExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                marginBottom: isAutoExpanded ? '10px' : '0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span style={{ color: 'var(--accent-cyan-bright)', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <BoltIcon size={12} /> WORKLOG SUMMARY
                </span>
                <span style={{ color: 'var(--text-muted)' }}>//</span>
                <span>{toolCount} tool calls</span>
                {hasSubagent && (
                  <span style={{ color: 'var(--accent-purple, #a78bfa)', fontWeight: 600 }}>
                    // {subagentToolCalls.length} DELEGATED
                  </span>
                )}
                {runningTool ? (
                  <span style={{ color: 'var(--accent-amber-bright)', display: 'inline-flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="pulse-dot pulse-dot--executing" />
                    <span>// EXECUTING {runningTool.name.toUpperCase()}</span>
                  </span>
                ) : message.status === 'streaming' ? (
                  <span style={{ color: 'var(--accent-cyan-bright)' }}>// streaming...</span>
                ) : null}
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>
                {isAutoExpanded ? '▲ HIDE DETAILS' : '▼ SHOW TRACE'}
              </span>
            </div>

            {/* Always surface Subagent Dispatch Cards even in compact worklog mode */}
            {!isAutoExpanded && subagentToolCalls.length > 0 && (
              <div style={{ margin: '8px 0' }}>
                {subagentToolCalls.map((tc) => (
                  <ToolCallCard key={tc.id || tc.name} toolCall={tc} />
                ))}
              </div>
            )}

            {isAutoExpanded && (
              <div style={{ marginTop: '8px' }}>
                {message.thinking && (
                  <ThinkingBlock
                    thinking={message.thinking}
                    isStreaming={isStreaming && message.status === 'streaming'}
                  />
                )}
                {toolCalls.length > 0 && (
                  <div style={{ margin: '6px 0 10px 0' }}>
                    {toolCalls.map((tc) => (
                      <ToolCallCard key={tc.id || tc.name} toolCall={tc} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {message.content ? (
              <div style={{ marginTop: '10px' }}>
                <MarkdownRenderer content={message.content} />
              </div>
            ) : message.status === 'streaming' ? (
              <div style={{ marginTop: '10px' }}>
                {renderStreamingIndicator('worklog')}
              </div>
            ) : null}
          </div>
        )}

        {/* MODE: TRANSPARENT STREAM / VERBOSE */}
        {activeMode === 'transparent' && (
          <div>
            {message.thinking && (
              <ThinkingBlock
                thinking={message.thinking}
                isStreaming={isStreaming && message.status === 'streaming'}
              />
            )}

            {toolCalls.length > 0 && (
              <div style={{ margin: '6px 0 10px 0' }}>
                {toolCalls.map((tc) => (
                  <ToolCallCard key={tc.id || tc.name} toolCall={tc} />
                ))}
              </div>
            )}

            {message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : message.status === 'streaming' ? (
              renderStreamingIndicator('transparent')
            ) : null}
          </div>
        )}

        {/* MODE: FINAL ANSWER ONLY / MINIMAL */}
        {activeMode === 'final' && (
          <div>
            {toolCalls.length > 0 && (
              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  marginBottom: '8px',
                }}
              >
                ℹ️ {toolCount} tool execution(s) completed (hidden in Answer mode)
              </div>
            )}
            {message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : message.status === 'streaming' ? (
              renderStreamingIndicator('final')
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});
