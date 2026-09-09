import { useState, useEffect, useMemo } from 'react';
import type { ToolCall } from 'agy-online-shared';
import { ShieldIcon, HelpIcon, CloseIcon } from './icons';

interface InteractiveClarifyModalProps {
  toolCall: ToolCall;
  onSubmit: (response: string) => void;
  onDismiss: () => void;
}

interface QuestionItem {
  question: string;
  options: string[];
  is_multi_select?: boolean;
}

export function InteractiveClarifyModal({
  toolCall,
  onSubmit,
  onDismiss,
}: InteractiveClarifyModalProps) {
  const isQuestion = toolCall.name === 'ask_question';
  const isPermission = toolCall.name === 'ask_permission' || toolCall.name.includes('permission');

  // Parse parameters with dual-schema support (multi questions array OR single question+options)
  const questions: QuestionItem[] = useMemo(() => {
    if (Array.isArray(toolCall.args?.questions) && toolCall.args.questions.length > 0) {
      return toolCall.args.questions.map((q: any) => ({
        question: typeof q.question === 'string' ? q.question : String(q.title || q.prompt || 'Question'),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        is_multi_select: Boolean(q.is_multi_select),
      }));
    }
    if (typeof toolCall.args?.question === 'string') {
      const opts = Array.isArray(toolCall.args.options) ? toolCall.args.options.map(String) : [];
      return [{
        question: toolCall.args.question,
        options: opts,
        is_multi_select: Boolean(toolCall.args.is_multi_select),
      }];
    }
    return [];
  }, [toolCall.args]);

  const [selectedOptions, setSelectedOptions] = useState<Record<number, string[]>>({});
  const [customText, setCustomText] = useState('');

  // Global Escape keydown listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  const toggleOption = (qIdx: number, opt: string, isMulti?: boolean) => {
    setSelectedOptions((prev) => {
      const current = prev[qIdx] || [];
      if (isMulti) {
        if (current.includes(opt)) {
          return { ...prev, [qIdx]: current.filter((o) => o !== opt) };
        } else {
          return { ...prev, [qIdx]: [...current, opt] };
        }
      } else {
        return { ...prev, [qIdx]: [opt] };
      }
    });
  };

  const handleSendQuestionResponse = () => {
    const parts: string[] = [];
    questions.forEach((q, idx) => {
      const chosen = selectedOptions[idx] || [];
      if (chosen.length > 0) {
        parts.push(`For "${q.question}": ${chosen.join(', ')}`);
      }
    });
    if (customText.trim()) {
      parts.push(customText.trim());
    }
    const finalResp = parts.join('\n') || customText.trim() || 'Approved / Proceed';
    onSubmit(finalResp);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isPermission ? 'Security Tool Approval Request' : 'Assistant Clarification Required'}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onDismiss();
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            backgroundColor: isPermission
              ? 'rgba(239, 68, 68, 0.15)'
              : 'rgba(6, 182, 212, 0.15)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              {isPermission ? <ShieldIcon size={14} color="var(--accent-red)" /> : <HelpIcon size={14} color="var(--accent-cyan)" />}
            </span>
            <span
              style={{
                fontWeight: 700,
                fontSize: '12px',
                color: isPermission ? 'var(--accent-red, #ef4444)' : 'var(--accent-cyan-bright, #22d3ee)',
              }}
            >
              {isPermission ? 'SECURITY // TOOL APPROVAL REQUEST' : 'ASSISTANT // CLARIFICATION REQUIRED'}
            </span>
          </div>
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #8b949e)',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
          {isQuestion && questions.length > 0 ? (
            questions.map((q, qIdx) => (
              <div key={qIdx} style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-bright, #f0f6fc)',
                    marginBottom: '8px',
                  }}
                >
                  {q.question}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {q.options?.map((opt, oIdx) => {
                    const isSelected = (selectedOptions[qIdx] || []).includes(opt);
                    return (
                      <div
                        key={oIdx}
                        onClick={() => toggleOption(qIdx, opt, q.is_multi_select)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '5px',
                          border: `1px solid ${
                            isSelected ? 'var(--accent-cyan-bright, #22d3ee)' : 'var(--border)'
                          }`,
                          backgroundColor: isSelected
                            ? 'rgba(6, 182, 212, 0.1)'
                            : 'var(--bg-secondary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                          color: isSelected
                            ? 'var(--accent-cyan-bright, #22d3ee)'
                            : 'var(--text-primary, #c9d1d9)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>{isSelected ? '◉' : '○'}</span>
                        <span>{opt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : isPermission ? (
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-bright, #f0f6fc)', marginBottom: '8px' }}>
                The assistant is requesting permission to execute:
              </div>
              {Boolean(toolCall.args?.CommandLine || toolCall.args?.command) && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>COMMAND:</div>
                  <pre
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      padding: '8px 10px',
                      borderRadius: '5px',
                      fontSize: '12px',
                      color: 'var(--accent-amber-bright, #f59e0b)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {String(toolCall.args?.CommandLine || toolCall.args?.command)}
                  </pre>
                </div>
              )}
              <pre
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  padding: '10px',
                  borderRadius: '5px',
                  fontSize: '11px',
                  color: 'var(--accent-amber-bright, #f59e0b)',
                  overflowX: 'auto',
                  maxHeight: '200px',
                }}
              >
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted, #8b949e)' }}>
              {JSON.stringify(toolCall.args)}
            </div>
          )}

          {/* Custom Clarification Text Box */}
          <div style={{ marginTop: '12px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--text-muted, #8b949e)',
                marginBottom: '4px',
              }}
            >
              Additional response / custom input (optional):
            </label>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (isPermission) {
                    onSubmit(customText.trim() ? `Allow: ${customText.trim()}` : 'Allow permission');
                    onDismiss();
                  } else {
                    handleSendQuestionResponse();
                    onDismiss();
                  }
                }
              }}
              placeholder="Type instruction or custom choice... (Press Enter to submit)"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-bright, #f0f6fc)',
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border)',
          }}
        >
          {isPermission ? (
            <>
              <button
                onClick={() => {
                  onSubmit('Deny permission');
                  onDismiss();
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: '1px solid var(--accent-red, #ef4444)',
                  backgroundColor: 'transparent',
                  color: 'var(--accent-red, #ef4444)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                DENY
              </button>
              <button
                onClick={() => {
                  onSubmit('Allow permission');
                  onDismiss();
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'var(--accent-green-bright, #10b981)',
                  color: 'var(--btn-contrast-text)',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                ALLOW
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onDismiss}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted, #8b949e)',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                SKIP
              </button>
              <button
                onClick={() => {
                  handleSendQuestionResponse();
                  onDismiss();
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'var(--accent-cyan-bright, #22d3ee)',
                  color: 'var(--btn-contrast-text)',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                SUBMIT ANSWER
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
