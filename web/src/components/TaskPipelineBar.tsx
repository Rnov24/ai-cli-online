import { useState } from 'react';

interface TaskPipelineBarProps {
  currentModule?: string;
  onRunSkill: (command: string) => void;
}

const STEPS = [
  { id: 'init', num: '01', label: 'INIT', cmd: '/init' },
  { id: 'plan', num: '02', label: 'PLAN', cmd: '/plan' },
  { id: 'check', num: '03', label: 'CHECK', cmd: '/check' },
  { id: 'exec', num: '04', label: 'EXEC', cmd: '/exec' },
  { id: 'verify', num: '05', label: 'VERIFY', cmd: '/verify' },
  { id: 'merge', num: '06', label: 'MERGE', cmd: '/merge' },
  { id: 'report', num: '07', label: 'REPORT', cmd: '/report' },
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
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 12px',
      backgroundColor: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      gap: '10px',
      overflowX: 'auto',
      whiteSpace: 'nowrap',
      fontSize: '10px',
      fontFamily: 'var(--font-mono)',
      flexShrink: 0,
      userSelect: 'none',
    }}>
      {/* Module Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: 'var(--accent-amber-bright)', fontWeight: 700, fontSize: '9px', letterSpacing: '0.6px' }}>
          MODULE //
        </span>
        <input
          type="text"
          value={moduleInput}
          onChange={(e) => setModuleInput(e.target.value)}
          placeholder="module-name"
          style={{
            padding: '2px 6px',
            borderRadius: '2px',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-bright)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            width: '120px',
            outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-amber)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
        />
      </div>

      {/* Stepper Pipeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', overflowX: 'auto' }}>
        {STEPS.map((step, i) => (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
            <button
              className="mecha-btn"
              onClick={() => handleStepClick(step.cmd)}
              title={`Execute ${step.cmd}`}
              style={{
                padding: '2px 6px',
                fontSize: '9px',
                gap: '4px',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{step.num}</span>
              <span style={{ color: 'var(--text-primary)' }}>{step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span style={{ color: 'var(--text-muted)', margin: '0 2px', fontSize: '9px' }}>
                ➔
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Autonomous Loop Button */}
      <button
        className="mecha-btn mecha-btn--primary"
        onClick={() => handleStepClick('/auto')}
        title="Trigger full autonomous task loop (/auto)"
        style={{
          padding: '3px 10px',
          fontSize: '10px',
          letterSpacing: '0.6px',
        }}
      >
        <span>⚡</span>
        <span>AUTO // LOOP</span>
      </button>
    </div>
  );
}
