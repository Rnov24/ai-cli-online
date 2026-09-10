import { useState } from 'react';
import type { ToolCall } from 'agy-online-shared';
import { CloseIcon, CheckIcon } from './icons';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

interface ParsedSubagent {
  Role?: string;
  role?: string;
  TypeName?: string;
  typeName?: string;
  Model?: string;
  model?: string;
  Prompt?: string;
  prompt?: string;
  Workspace?: string;
  workspace?: string;
}

function parseSubagents(subagentsArg: unknown): ParsedSubagent[] {
  if (!subagentsArg) return [];
  if (typeof subagentsArg === 'string') {
    try {
      let parsed = JSON.parse(subagentsArg);
      // Handle double-serialized JSON strings
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
      }
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  if (Array.isArray(subagentsArg)) {
    return subagentsArg;
  }
  if (typeof subagentsArg === 'object') {
    return [subagentsArg as ParsedSubagent];
  }
  return [];
}

function extractSubagentId(output?: string, args?: Record<string, unknown>): string | undefined {
  if (output) {
    const m = output.match(/["']?(?:conversationId|conversation_id|id)["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]+)/i);
    if (m) return m[1];
  }
  if (args) {
    if (typeof args.conversationId === 'string') return args.conversationId;
    if (typeof args.conversation_id === 'string') return args.conversation_id;
  }
  return undefined;
}

function extractRoleFromFallback(args?: Record<string, unknown>, prompt?: string): string | undefined {
  if (args) {
    const summary = args.toolSummary ?? args.toolAction ?? args.summary ?? args.action;
    if (typeof summary === 'string' && summary.trim()) {
      const cleaned = summary
        .replace(/^"|"$/g, '')
        .replace(/^Dispatch(ing)?\s*(executor\s*subagent\s*(for\s*)?)?/i, '')
        .trim();
      if (cleaned) return cleaned;
    }
  }
  if (prompt) {
    const match = prompt.match(/#\s*(Plan\s*\d+[:\s][^\r\n]+)/i);
    if (match) return match[1].trim();
  }
  return undefined;
}

function getToolCategory(name: string): string {
  switch (name) {
    case 'invoke_subagent': return 'SUBAGENT';
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
  if (tool.name === 'invoke_subagent') {
    const rawSubs =
      tool.args.Subagents ??
      tool.args.subagents ??
      tool.args.Subagent ??
      tool.args.subagent ??
      (typeof tool.args === 'object' && ('Model' in tool.args || 'model' in tool.args) ? [tool.args] : undefined);
    const subs = parseSubagents(rawSubs);
    let role = subs.length > 0 ? (subs[0].Role || subs[0].role) : undefined;
    if (!role || role === 'Subagent') {
      const fallback = extractRoleFromFallback(tool.args as Record<string, unknown>, subs[0]?.Prompt || subs[0]?.prompt);
      if (fallback) role = fallback;
    }
    return { target: role ? `DELEGATE // ${role}` : 'DELEGATE SUBAGENT' };
  }
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
  const [expanded, setExpanded] = useState(toolCall.status === 'running' || toolCall.name === 'invoke_subagent');
  const [outputExpanded, setOutputExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isSubagent = toolCall.name === 'invoke_subagent';
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

  const handleSeekSubagent = (subagentId?: string, role?: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('agy:seek-subagent', {
          detail: { id: subagentId, role },
        })
      );
    }
  };

  // Specialized Subagent Dispatch Card
  if (isSubagent) {
    const rawSubagents =
      toolCall.args?.Subagents ??
      toolCall.args?.subagents ??
      toolCall.args?.Subagent ??
      toolCall.args?.subagent ??
      (toolCall.args && typeof toolCall.args === 'object' && ('Model' in toolCall.args || 'model' in toolCall.args) ? [toolCall.args] : undefined);
    const subs = parseSubagents(rawSubagents);
    const subId = extractSubagentId(toolCall.output, toolCall.args as Record<string, unknown> | undefined);

    let firstRole = subs.length > 0 ? (subs[0].Role || subs[0].role) : undefined;
    if (!firstRole || firstRole === 'Subagent') {
      const fallback = extractRoleFromFallback(toolCall.args as Record<string, unknown> | undefined, subs[0]?.Prompt || subs[0]?.prompt);
      if (fallback) {
        firstRole = fallback;
      } else {
        firstRole = firstRole || 'Subagent';
      }
    }

    const effectiveSubs: ParsedSubagent[] = subs.length > 0 ? subs : [
      {
        Role: firstRole,
        Prompt: (typeof toolCall.args?.Prompt === 'string' ? toolCall.args.Prompt : undefined) ||
                (typeof toolCall.args?.prompt === 'string' ? toolCall.args.prompt : undefined) ||
                (typeof toolCall.args?.toolSummary === 'string' ? String(toolCall.args.toolSummary).replace(/^"|"$/g, '') : undefined),
        TypeName: typeof toolCall.args?.TypeName === 'string' ? toolCall.args.TypeName : undefined,
        Model: typeof toolCall.args?.Model === 'string' ? toolCall.args.Model : undefined,
      },
    ];
    return (
      <div
        data-testid="subagent-dispatch-card"
        style={{
          margin: '8px 0',
          borderRadius: '3px',
          border: '1px solid var(--border)',
          borderLeft: toolCall.status === 'error'
            ? '3px solid var(--accent-red)'
            : toolCall.status === 'running'
              ? '3px solid var(--accent-amber)'
              : '3px solid var(--accent-purple, #a78bfa)',
          backgroundColor: 'var(--bg-tertiary)',
          overflow: 'hidden',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          boxShadow: toolCall.status === 'running' ? '0 0 10px var(--accent-amber-glow)' : 'none',
        }}
      >
        {/* Header Bar */}
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
            <span
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: '2px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--accent-purple, #a78bfa)',
                fontWeight: 700,
                letterSpacing: '0.6px',
                flexShrink: 0,
              }}
            >
              SUBAGENT
            </span>
            <span
              style={{
                fontWeight: 700,
                color: 'var(--text-bright)',
                letterSpacing: '0.3px',
                flexShrink: 0,
              }}
            >
              /{firstRole}
            </span>
            {effectiveSubs.length > 1 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                (+{effectiveSubs.length - 1} more)
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {toolCall.status === 'running' && (
              <span className="tech-badge tech-badge--active" style={{ fontSize: '9px', padding: '1px 5px' }}>
                <span className="pulse-dot pulse-dot--executing" />
                RUNNING
              </span>
            )}
            {toolCall.status === 'success' && (
              <span className="tech-badge tech-badge--online" style={{ fontSize: '9px', padding: '1px 5px' }}>
                ● COMPLETE
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

        {/* Expanded Subagent Details */}
        {expanded && (
          <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-primary)' }}>
            {effectiveSubs.map((sub, idx) => {
              const role = sub.Role || sub.role || 'Subagent';
              const typeName = sub.TypeName || sub.typeName || 'self';
              const model = sub.Model || sub.model || 'inherit';
              const prompt = sub.Prompt || sub.prompt || '';
              const workspace = sub.Workspace || sub.workspace || 'share';

              return (
                <div
                  key={idx}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '3px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-secondary)',
                    marginBottom: idx < effectiveSubs.length - 1 ? '8px' : '0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>
                        {role}
                      </span>
                      <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '2px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--accent-cyan)' }}>
                        TYPE: {typeName}
                      </span>
                      <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '2px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        MODEL: {model}
                      </span>
                      <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '2px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        WS: {workspace}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSeekSubagent(subId, role);
                      }}
                      title="Seek and inspect subagent execution in Subagent Explorer"
                      style={{
                        background: 'none',
                        border: '1px solid var(--border)',
                        borderRadius: '3px',
                        color: 'var(--accent-cyan-bright)',
                        cursor: 'pointer',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                        padding: '2px 6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      [SEEK SUBAGENT]
                    </button>
                  </div>

                  {prompt && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '4px 6px', backgroundColor: 'var(--bg-primary)', borderRadius: '2px', border: '1px solid var(--border-subtle)' }}>
                      {prompt.length > 300 ? prompt.slice(0, 300) + '...' : prompt}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Subagent Output if present */}
            {toolCall.output && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.8px' }}>
                    // SUBAGENT OUTPUT
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
                  padding: '6px 8px',
                  borderRadius: '2px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontSize: '10px',
                  lineHeight: 1.4,
                  maxHeight: '160px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {toolCall.output}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Standard Tool Execution Card
  const outputLength = toolCall.output ? toolCall.output.length : 0;
  const isLongOutput = outputLength > 400 || (toolCall.output && toolCall.output.split('\n').length > 10);

  return (
    <div style={{
      margin: '8px 0',
      borderRadius: '3px',
      border: '1px solid var(--border)',
      borderLeft: toolCall.status === 'error'
        ? '3px solid var(--accent-red)'
        : toolCall.status === 'running'
          ? '3px solid var(--accent-amber)'
          : '3px solid var(--accent-cyan)' ,
      backgroundColor: 'var(--bg-tertiary)',
      overflow: 'hidden',
      fontSize: '11px',
      fontFamily: 'var(--font-mono)',
      boxShadow: toolCall.status === 'running' ? '0 0 10px var(--accent-amber-glow)' : 'none',
    }}>
      {/* Mecha Header Bar */}
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
                backgroundColor: 'var(--bg-primary)',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isLongOutput && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOutputExpanded(!outputExpanded);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-cyan-bright)',
                        cursor: 'pointer',
                        fontSize: '9px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {outputExpanded ? '[COLLAPSE]' : '[EXPAND]'}
                    </button>
                  )}
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
              </div>
              <pre style={{
                margin: 0,
                padding: '8px 10px',
                borderRadius: '2px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: toolCall.status === 'error' ? 'var(--accent-red)' : 'var(--text-primary)',
                fontSize: '11px',
                lineHeight: 1.5,
                maxHeight: outputExpanded ? '600px' : '260px',
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
