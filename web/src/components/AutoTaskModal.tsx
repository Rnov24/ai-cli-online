import { useState, useEffect, useCallback } from 'react';
import { BoltIcon, CloseIcon, AlertTriangleIcon } from './icons';
import { startTaskAuto, stopTaskAuto, getTaskAutoStatus } from '../api/taskAuto';
import type { TaskAutoStatus } from '../api/taskAuto';
import { useAdaptivePolling } from '../hooks/useAdaptivePolling';

interface AutoTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  token: string;
  initialTaskModule?: string;
  workspaceDir?: string;
}

export function AutoTaskModal({
  isOpen,
  onClose,
  sessionId,
  token,
  initialTaskModule = '',
  workspaceDir = '',
}: AutoTaskModalProps) {
  const [taskDirInput, setTaskDirInput] = useState('');
  const [maxIterations, setMaxIterations] = useState(20);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);
  const [status, setStatus] = useState<TaskAutoStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize input path from initialTaskModule or workspaceDir
  useEffect(() => {
    if (isOpen) {
      if (initialTaskModule) {
        if (initialTaskModule.startsWith('/') || initialTaskModule.startsWith('\\')) {
          setTaskDirInput(initialTaskModule);
        } else if (workspaceDir) {
          setTaskDirInput(`${workspaceDir}/AiTasks/${initialTaskModule}`);
        } else {
          setTaskDirInput(`AiTasks/${initialTaskModule}`);
        }
      } else if (workspaceDir) {
        setTaskDirInput(`${workspaceDir}/AiTasks/task-name`);
      } else {
        setTaskDirInput('AiTasks/');
      }
      setError(null);
    }
  }, [isOpen, initialTaskModule, workspaceDir]);

  // Poll status when open
  const pollStatus = useCallback(async () => {
    if (!sessionId || !token) return;
    try {
      const st = await getTaskAutoStatus(token, sessionId);
      setStatus(st);
    } catch {
      // ignore poll errors
    }
  }, [token, sessionId]);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      pollStatus().finally(() => setLoading(false));
    }
  }, [isOpen, pollStatus]);

  useAdaptivePolling(pollStatus, {
    intervalMs: 2000,
    backgroundIntervalMs: 0,
    enabled: isOpen,
  });

  // Keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDirInput.trim()) {
      setError('Please provide a task directory');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      await startTaskAuto(token, sessionId, {
        taskDir: taskDirInput.trim(),
        maxIterations,
        timeoutMinutes,
      });
      await pollStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    setError(null);
    try {
      await stopTaskAuto(token, sessionId);
      await pollStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const isRunning = Boolean(status?.running);
  const elapsedSecs = status?.elapsedSeconds ?? 0;
  const elapsedMinutes = Math.floor(elapsedSecs / 60);
  const elapsedRemainderSecs = elapsedSecs % 60;
  const formattedElapsed = `${String(elapsedMinutes).padStart(2, '0')}:${String(elapsedRemainderSecs).padStart(2, '0')}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-task-modal-title"
      data-testid="auto-task-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            backgroundColor: 'var(--bg-primary)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BoltIcon size={16} color="var(--accent-amber-bright)" />
            <span
              id="auto-task-modal-title"
              style={{
                color: 'var(--text-bright)',
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '0.6px',
              }}
            >
              AUTONOMOUS TASK LIFECYCLE
            </span>
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '2px',
                fontSize: '10px',
                fontWeight: 600,
                backgroundColor: isRunning ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                color: isRunning ? 'var(--accent-green)' : 'var(--accent-yellow)',
                border: isRunning ? '1px solid var(--accent-green)' : '1px solid var(--border)',
              }}
            >
              {isRunning ? 'RUNNING' : 'CONFIG'}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="pane-btn"
            style={{
              padding: '4px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid var(--accent-red)',
                borderRadius: '3px',
                color: 'var(--accent-red)',
                fontSize: '11px',
              }}
            >
              <AlertTriangleIcon size={14} color="var(--accent-red)" />
              <span style={{ flex: 1 }}>{error}</span>
            </div>
          )}

          {/* Running State Live Telemetry */}
          {isRunning ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '14px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>TARGET TASK DIRECTORY:</span>
                <span style={{ color: 'var(--text-bright)', fontWeight: 600, fontSize: '11px' }}>
                  {status?.taskDir}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>ITERATION</div>
                  <div style={{ color: 'var(--accent-amber-bright)', fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                    #{status?.iterationCount ?? 0} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/ {status?.maxIterations}</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>ELAPSED</div>
                  <div style={{ color: 'var(--text-bright)', fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                    {formattedElapsed} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/ {status?.timeoutMinutes}m</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>CURRENT STEP</div>
                  <div style={{ color: 'var(--accent-blue)', fontWeight: 700, fontSize: '14px', marginTop: '2px' }}>
                    {status?.signal?.step?.toUpperCase() || 'START'}
                  </div>
                </div>
              </div>

              {status?.signal && (
                <div
                  style={{
                    padding: '8px 10px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '2px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ color: 'var(--accent-yellow)', fontWeight: 600 }}>LATEST SIGNAL: </span>
                  <span>{status.signal.step}</span> : <span style={{ color: 'var(--accent-green)' }}>{status.signal.result}</span> → <span style={{ color: 'var(--accent-blue)' }}>{status.signal.next}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={actionLoading}
                  className="mecha-btn"
                  style={{
                    padding: '6px 14px',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid var(--accent-red)',
                    color: 'var(--accent-red)',
                    fontWeight: 600,
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {actionLoading ? 'STOPPING...' : 'STOP AUTO LOOP'}
                </button>
              </div>
            </div>
          ) : (
            /* Configure & Launch Form */
            <form onSubmit={handleStart} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label
                  htmlFor="task-dir-input"
                  style={{
                    display: 'block',
                    marginBottom: '4px',
                    color: 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  TASK MODULE DIRECTORY
                </label>
                <input
                  id="task-dir-input"
                  type="text"
                  value={taskDirInput}
                  onChange={(e) => setTaskDirInput(e.target.value)}
                  placeholder="/workspace/AiTasks/module-name or AiTasks/module-name"
                  aria-label="Task Module Directory"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-bright)',
                    borderRadius: '2px',
                    outline: 'none',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                  Path to task module root containing .target.md or initialized with /init.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label
                    htmlFor="max-iterations-input"
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    MAX ITERATIONS
                  </label>
                  <input
                    id="max-iterations-input"
                    type="number"
                    min={1}
                    max={100}
                    value={maxIterations}
                    onChange={(e) => setMaxIterations(Math.max(1, parseInt(e.target.value) || 1))}
                    aria-label="Max Iterations"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-bright)',
                      borderRadius: '2px',
                      outline: 'none',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                    Default: 20 cycles
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="timeout-minutes-input"
                    style={{
                      display: 'block',
                      marginBottom: '4px',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    TIMEOUT (MINUTES)
                  </label>
                  <input
                    id="timeout-minutes-input"
                    type="number"
                    min={5}
                    max={180}
                    value={timeoutMinutes}
                    onChange={(e) => setTimeoutMinutes(Math.max(5, parseInt(e.target.value) || 5))}
                    aria-label="Timeout in Minutes"
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-bright)',
                      borderRadius: '2px',
                      outline: 'none',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                    Default: 30 minutes
                  </span>
                </div>
              </div>

              {/* Instructions Callout */}
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '3px',
                  color: 'var(--text-secondary)',
                  fontSize: '11px',
                  lineHeight: '1.4',
                }}
              >
                Auto mode launches an autonomous session looping through:
                <strong style={{ color: 'var(--accent-amber-bright)' }}> plan → verify → check → exec → merge → report</strong>.
                The Go daemon monitors progress and gracefully stops via <code>.auto-stop</code> on iteration limit or timeout.
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="mecha-btn"
                  style={{ padding: '6px 12px' }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || loading}
                  className="mecha-btn mecha-btn--primary"
                  style={{
                    padding: '6px 16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: actionLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  <BoltIcon size={12} />
                  <span>{actionLoading ? 'STARTING...' : 'START AUTO LOOP'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
