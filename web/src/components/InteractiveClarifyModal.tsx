import { useState } from 'react';
import type { ToolCall } from 'ai-cli-online-shared';
import { ShieldIcon, HelpIcon, CloseIcon } from './icons';

interface InteractiveClarifyModalProps {
  toolCall: ToolCall;
  onSubmit: (response: string) => void;
  onDismiss: () => void;
}

export function InteractiveClarifyModal({
  toolCall,
  onSubmit,
  onDismiss,
}: InteractiveClarifyModalProps) {
  const isQuestion = toolCall.name === 'ask_question';
  const isPermission = toolCall.name === 'ask_permission' || toolCall.name.includes('permission');

  // Parse parameters
  const questions = (toolCall.args?.questions as Array<{
    question: string;
    options: string[];
    is_multi_select?: boolean;
  }>) || [];

  const [selectedOptions, setSelectedOptions] = useState<Record<number, string[]>>({});
  const [customText, setCustomText] = useState('');

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
              <pre
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  padding: '10px',
                  borderRadius: '5px',
                  fontSize: '11px',
                  color: 'var(--accent-amber-bright, #f59e0b)',
                  overflowX: 'auto',
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
              placeholder="Type instruction or custom choice..."
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
