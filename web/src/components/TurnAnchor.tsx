import { useState, memo } from 'react';
import type { ChatMessage } from 'ai-cli-online-shared';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallCard } from './ToolCallCard';
import { CheckIcon, BoltIcon } from './icons';

export type PresentationMode = 'worklog' | 'transparent' | 'final';

interface TurnAnchorProps {
  message: ChatMessage;
  turnIndex: number;
  isStreaming: boolean;
  globalMode?: PresentationMode;
  onForkTurn?: (message: ChatMessage) => void;
  onCopyContent?: (id: string, text: string) => void;
  isCopied?: boolean;
}

export const TurnAnchor = memo(function TurnAnchor({
  message,
  turnIndex,
  isStreaming,
  globalMode = 'transparent',
  onForkTurn,
  onCopyContent,
  isCopied,
}: TurnAnchorProps) {
  // Local mode override per turn; defaults to global session mode
  const [localMode, setLocalMode] = useState<PresentationMode | null>(null);
  const [worklogExpanded, setWorklogExpanded] = useState(false);

  const activeMode = localMode || globalMode;
  const isSettled = message.status === 'done' || message.status === 'error';
  const toolCalls = message.toolCalls || [];
  const toolCount = toolCalls.length;
  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

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
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(245, 158, 11, 0.2)',
                color:
                  message.turnStatus === 'interrupted'
                    ? 'var(--accent-red, #ef4444)'
                    : 'var(--accent-amber-bright, #f59e0b)',
                fontWeight: 600,
              }}
            >
              {message.turnStatus.toUpperCase()}
            </span>
          )}
        </div>

        {/* Turn Controls & Tri-Mode Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <div
            style={{
              display: 'inline-flex',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-tertiary, rgba(0,0,0,0.3))',
              padding: '1px',
              border: '1px solid var(--border)',
            }}
          >
            <button
              onClick={() => setLocalMode('worklog')}
              title="Compact Worklog view"
              style={{
                background: activeMode === 'worklog' ? 'var(--accent-cyan)' : 'transparent',
                color: activeMode === 'worklog' ? '#000' : 'var(--text-muted)',
                border: 'none',
                padding: '2px 6px',
                fontSize: '9px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: activeMode === 'worklog' ? 700 : 400,
              }}
            >
              WORKLOG
            </button>
            <button
              onClick={() => setLocalMode('transparent')}
              title="Transparent Stream view (tools + reasoning)"
              style={{
                background: activeMode === 'transparent' ? 'var(--accent-cyan)' : 'transparent',
                color: activeMode === 'transparent' ? '#000' : 'var(--text-muted)',
                border: 'none',
                padding: '2px 6px',
                fontSize: '9px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontWeight: activeMode === 'transparent' ? 700 : 400,
              }}
            >
              STREAM
            </button>
            <button
              onClick={() => setLocalMode('final')}
              title="Final Answer Only"
              style={{
                background: activeMode === 'final' ? 'var(--accent-cyan)' : 'transparent',
                color: activeMode === 'final' ? '#000' : 'var(--text-muted)',
                border: 'none',
                padding: '2px 6px',
                fontSize: '9px',
                borderRadius: '3px',
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
        {/* MODE: WORKLOG */}
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
                marginBottom: worklogExpanded ? '10px' : '0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent-cyan-bright)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <BoltIcon size={12} /> WORKLOG SUMMARY
                </span>
                <span style={{ color: 'var(--text-muted)' }}>//</span>
                <span>{toolCount} tool calls</span>
                {message.status === 'streaming' && (
                  <span style={{ color: 'var(--accent-amber-bright)' }}>// running...</span>
                )}
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                {worklogExpanded ? '▲ HIDE DETAILS' : '▼ SHOW TRACE'}
              </span>
            </div>

            {worklogExpanded && (
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
                      <ToolCallCard key={tc.id} toolCall={tc} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {message.content && (
              <div style={{ marginTop: '10px' }}>
                <MarkdownRenderer content={message.content} />
              </div>
            )}
          </div>
        )}

        {/* MODE: TRANSPARENT STREAM */}
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
                  <ToolCallCard key={tc.id} toolCall={tc} />
                ))}
              </div>
            )}

            {message.content ? (
              <MarkdownRenderer content={message.content} />
            ) : message.status === 'streaming' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--accent-amber-bright)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span className="pulse-dot pulse-dot--executing" />
                <span>Synthesizing response...</span>
              </div>
            ) : null}
          </div>
        )}

        {/* MODE: FINAL ANSWER ONLY */}
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--accent-amber-bright)',
                  fontSize: '11px',
                }}
              >
                <span className="pulse-dot pulse-dot--executing" />
                <span>Synthesizing response...</span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});
