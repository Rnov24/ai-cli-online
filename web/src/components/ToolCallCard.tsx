import { useState } from 'react';
import type { ToolCall } from 'ai-cli-online-shared';
import { CloseIcon, CheckIcon } from './icons';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

function getToolCategory(name: string): string {
  switch (name) {
    case 'run_command': return 'TERMINAL';
    case 'view_file':
    case 'read_url_content': return 'READ';
    case 'write_to_file':
    case 'replace_file_content': return 'FILESYSTEM';
    case 'grep_search':
    case 'find_by_name':
    case 'search_web': return 'SEARCH';
    case 'manage_task':
    case 'schedule': return 'PROCESS';
    default: return 'TOOL';
  }
}

function getTargetInfo(tool: ToolCall): { target?: string; detail?: string } {
  if (!tool.args) return {};
  if (tool.name === 'run_command' && tool.args.CommandLine) {
    return { target: String(tool.args.CommandLine) };
  }
  if ((tool.name === 'view_file' || tool.name === 'write_to_file' || tool.name === 'replace_file_content')) {
    const file = tool.args.TargetFile || tool.args.AbsolutePath;
    return {
      target: file ? String(file).split('/').pop() : undefined,
      detail: file ? String(file) : undefined,
    };
  }
  if ((tool.name === 'grep_search' || tool.name === 'search_web') && tool.args.Query) {
    return { target: String(tool.args.Query) };
  }
  return {};
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(toolCall.status === 'running');
  const [copied, setCopied] = useState(false);

  const category = getToolCategory(toolCall.name);
  const targetInfo = getTargetInfo(toolCall);
  const isTerminal = toolCall.name === 'run_command';
  const isFileOp = toolCall.name === 'write_to_file' || toolCall.name === 'replace_file_content';

  const copyOutput = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toolCall.output) {
      navigator.clipboard.writeText(toolCall.output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div style={{
      margin: '8px 0',
      borderRadius: '3px',
      border: '1px solid var(--border)',
      borderLeft: toolCall.status === 'error'
        ? '3px solid var(--accent-red)'
        : toolCall.status === 'running'
          ? '3px solid var(--accent-amber)'
          : '3px solid var(--accent-cyan)',
      backgroundColor: 'var(--bg-tertiary)',
      overflow: 'hidden',
      fontSize: '11px',
      fontFamily: 'var(--font-mono)',
      boxShadow: toolCall.status === 'running' ? '0 0 10px var(--accent-amber-glow)' : 'none',
    }}>
      {/* Mecha Header Bar: ┌ TOOL EXECUTION ─── ● DONE ┐ */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          cursor: 'pointer',
          userSelect: 'none',
          backgroundColor: expanded ? 'var(--bg-hover)' : 'var(--bg-secondary)',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          transition: 'background-color 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <span style={{
            fontSize: '9px',
            padding: '1px 5px',
            borderRadius: '2px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--accent-cyan-bright)',
            fontWeight: 700,
            letterSpacing: '0.6px',
            flexShrink: 0,
          }}>
            {category}
          </span>
          <span style={{
            fontWeight: 700,
            color: 'var(--text-bright)',
            letterSpacing: '0.3px',
            flexShrink: 0,
          }}>
            {toolCall.name}
          </span>
          {targetInfo.target && (
            <span style={{
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
            }}>
              &gt; {targetInfo.target}
            </span>
          )}
        </div>

        {/* Status indicator on right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {toolCall.status === 'running' && (
            <span className="tech-badge tech-badge--active" style={{ fontSize: '9px', padding: '1px 5px' }}>
              <span className="pulse-dot pulse-dot--executing" />
              RUNNING
            </span>
          )}
          {toolCall.status === 'success' && (
            <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
              ● DONE
            </span>
          )}
          {toolCall.status === 'error' && (
            <span className="tech-badge tech-badge--danger" style={{ fontSize: '9px', padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
              <CloseIcon size={11} /> FAILED
            </span>
          )}
          <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '2px' }}>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Expanded Details Body */}
      {expanded && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: 'var(--bg-primary)',
          fontSize: '11px',
        }}>
          {/* File operation indicator */}
          {isFileOp && targetInfo.detail && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '6px',
              padding: '4px 8px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '2px',
            }}>
              <span style={{ color: 'var(--accent-amber-bright)', fontWeight: 600 }}>
                TARGET: {targetInfo.detail}
              </span>
            </div>
          )}

          {/* Parameters block */}
          {toolCall.args && Object.keys(toolCall.args).length > 0 && !isTerminal && (
            <div style={{ marginBottom: '8px' }}>
              <div style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                marginBottom: '3px',
                fontWeight: 700,
                letterSpacing: '0.8px',
              }}>
                // PARAMETERS
              </div>
              <pre style={{
                margin: 0,
                padding: '6px 8px',
                borderRadius: '2px',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                maxWidth: '100%',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'var(--font-mono)',
              }}>
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Terminal command execution view */}
          {isTerminal && toolCall.args?.CommandLine && (
            <div style={{ marginBottom: '8px', maxWidth: '100%' }}>
              <div style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                marginBottom: '3px',
                fontWeight: 700,
                letterSpacing: '0.8px',
              }}>
                // COMMAND LINE
              </div>
              <div style={{
                padding: '6px 10px',
                borderRadius: '2px',
                backgroundColor: '#050608',
                border: '1px solid var(--border)',
                color: 'var(--accent-green-bright)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                maxWidth: '100%',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}>
                $ {String(toolCall.args.CommandLine)}
              </div>
            </div>
          )}

          {/* Telemetry Output View */}
          {toolCall.output ? (
            <div style={{ maxWidth: '100%' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '3px',
              }}>
                <span style={{
                  fontSize: '9px',
                  color: 'var(--text-muted)',
                  fontWeight: 700,
                  letterSpacing: '0.8px',
                }}>
                  // TELEMETRY OUTPUT
                </span>
                <button
                  onClick={copyOutput}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copied ? 'var(--accent-green-bright)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '9px',
                    fontFamily: 'var(--font-mono)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                  }}
                >
                  {copied ? <><CheckIcon size={11} /> COPIED</> : '[COPY]'}
                </button>
              </div>
              <pre style={{
                margin: 0,
                padding: '8px 10px',
                borderRadius: '2px',
                backgroundColor: '#050608',
                border: '1px solid var(--border)',
                color: toolCall.status === 'error' ? 'var(--accent-red)' : 'var(--text-primary)',
                fontSize: '11px',
                lineHeight: 1.5,
                maxHeight: '260px',
                maxWidth: '100%',
                overflowY: 'auto',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'var(--font-mono)',
              }}>
                {toolCall.output}
              </pre>
            </div>
          ) : (
            toolCall.status === 'running' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px',
                color: 'var(--accent-amber-bright)',
                fontSize: '11px',
              }}>
                <span className="pulse-dot pulse-dot--executing" />
                <span>Executing process in background...</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
