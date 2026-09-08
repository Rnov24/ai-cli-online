import { useState } from 'react';
import { BoltIcon, ChevronRightIcon } from './icons';

interface TaskPipelineBarProps {
  currentModule?: string;
  onRunSkill: (command: string) => void;
}

const STEPS = [
  { id: 'init', num: '01', label: 'INIT', cmd: '/init', title: 'Initialize task module & branch (/init)' },
  { id: 'plan', num: '02', label: 'PLAN', cmd: '/plan', title: 'Step-by-step implementation planning (/plan)' },
  { id: 'research', num: '03', label: 'RES', cmd: '/research', title: 'Research external references (/research)' },
  { id: 'check', num: '04', label: 'CHK', cmd: '/check', title: 'Check feasibility (/check)' },
  { id: 'exec', num: '05', label: 'EXEC', cmd: '/exec', title: 'Execute implementation plan (/exec)' },
  { id: 'verify', num: '06', label: 'VRFY', cmd: '/verify', title: 'Run domain-adapted tests (/verify)' },
  { id: 'merge', num: '07', label: 'MRG', cmd: '/merge', title: 'Merge task branch to main (/merge)' },
  { id: 'report', num: '08', label: 'REPT', cmd: '/report', title: 'Generate completion report (/report)' },
];

export function TaskPipelineBar({ currentModule = '', onRunSkill }: TaskPipelineBarProps) {
  const [moduleInput, setModuleInput] = useState(currentModule);

  const handleStepClick = (cmd: string) => {
    const target = moduleInput.trim();
    if (target) {
      onRunSkill(`${cmd} ${target}`);
    } else {
      onRunSkill(cmd);
    }
  };

  return (
    <div
      data-testid="task-pipeline-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '3px 8px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        gap: '8px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
        userSelect: 'none',
        minWidth: 0,
      }}
    >
      {/* Module Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
        <span style={{ color: 'var(--accent-amber-bright)', fontWeight: 700, fontSize: '9px', letterSpacing: '0.6px', whiteSpace: 'nowrap' }}>
          MODULE //
        </span>
        <input
          type="text"
          value={moduleInput}
          onChange={(e) => setModuleInput(e.target.value)}
          placeholder="module-name"
          aria-label="Target task module name"
          style={{
            padding: '2px 6px',
            borderRadius: '2px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-bright)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            width: '100px',
            maxWidth: '130px',
            outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-amber)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        />
      </div>

      {/* Stepper Pipeline */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          flex: '1 1 auto',
          minWidth: 0,
          padding: '1px 0',
        }}
      >
        {STEPS.map((step, i) => (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              className="mecha-btn"
              onClick={() => handleStepClick(step.cmd)}
              title={step.title}
              aria-label={step.title}
              style={{
                padding: '2px 5px',
                fontSize: '9px',
                gap: '3px',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{step.num}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <ChevronRightIcon
                size={8}
                style={{
                  color: 'var(--text-muted)',
                  margin: '0 1px',
                  opacity: 0.6,
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Quick Actions & Autonomous Loop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <button
          className="mecha-btn"
          onClick={() => onRunSkill('/list')}
          title="Query active task modules status (/list)"
          aria-label="Query task status"
          style={{
            padding: '2px 6px',
            fontSize: '9px',
            color: 'var(--text-secondary)',
          }}
        >
          LIST
        </button>
        <button
          className="mecha-btn"
          onClick={() => handleStepClick('/cancel')}
          title="Cancel current task module (/cancel)"
          aria-label="Cancel task"
          style={{
            padding: '2px 6px',
            fontSize: '9px',
            color: 'var(--text-muted)',
          }}
        >
          CANCEL
        </button>
        <button
          className="mecha-btn mecha-btn--primary"
          onClick={() => handleStepClick('/auto')}
          title="Trigger full autonomous task loop (/auto)"
          aria-label="Trigger autonomous task loop"
          style={{
            padding: '3px 8px',
            fontSize: '10px',
            letterSpacing: '0.6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <BoltIcon size={11} />
          <span>AUTO // LOOP</span>
        </button>
      </div>
    </div>
  );
}
