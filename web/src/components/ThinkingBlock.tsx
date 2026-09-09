import { useState } from 'react';

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
}

export function ThinkingBlock({ thinking, isStreaming }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  if (!thinking) return null;

  return (
    <div style={{
      margin: '8px 0',
      borderRadius: '3px',
      border: '1px solid var(--border)',
      backgroundColor: 'var(--bg-tertiary)',
      overflow: 'hidden',
      fontSize: '11px',
      fontFamily: 'var(--font-mono)',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          textAlign: 'left',
          userSelect: 'none',
          backgroundColor: expanded ? 'var(--bg-hover)' : 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <span style={{
            fontSize: '9px',
            padding: '1px 5px',
            borderRadius: '2px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--accent-amber-bright)',
            fontWeight: 700,
            letterSpacing: '0.6px',
            flexShrink: 0,
          }}>
            REASONING
          </span>
          <span style={{
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {isStreaming ? `REASONING // ${thinking.length} CHARS` : `REASONING TRACE // ${thinking.length} CHARS`}
          </span>
          {isStreaming && (
            <span className="pulse-dot pulse-dot--executing" style={{ flexShrink: 0 }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', flexShrink: 0 }}>
          <span style={{ color: 'var(--text-muted)' }}>{thinking.length} chars</span>
          <span>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border)',
          fontSize: '11px',
          lineHeight: '1.6',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-primary)',
          maxHeight: '260px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: 'var(--font-mono)',
        }}>
          {thinking}
        </div>
      )}
    </div>
  );
}
