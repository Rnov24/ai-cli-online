import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PlanAnnotationRenderer } from './PlanAnnotationRenderer';
import type { PlanAnnotationRendererHandle } from './PlanAnnotationRenderer';
import { PlanFileBrowser } from './PlanFileBrowser';
import { useFileStream } from '../hooks/useFileStream';
import { registerFileStreamHandler, unregisterFileStreamHandler } from '../fileStreamBus';
import { fetchFiles } from '../api/files';
import type { FileEntry } from '../api/files';
import { fetchFileContent } from '../api/docs';
import { fetchWorkspaceMode } from '../api/workspaces';
import { useAdaptivePolling } from '../hooks/useAdaptivePolling';

interface PlanPanelProps {
  sessionId: string;
  token: string;
  connected: boolean;
  onRequestFileStream?: (path: string) => void;
  onSendToTerminal?: (text: string) => void;
}

/** Centered loading indicator with optional progress bar */
function CenteredLoading({ label, percent }: { label: string; percent?: number }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: 8,
    }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{label}</span>
      {percent != null && (
        <div style={{ width: 120, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            flex: 1, height: 4, backgroundColor: 'var(--border)', borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${percent}%`,
              backgroundColor: 'var(--accent-blue)',
              transition: 'width 0.2s',
            }} />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{percent}%</span>
        </div>
      )}
    </div>
  );
}

export function PlanPanel({ sessionId, token, connected, onRequestFileStream, onSendToTerminal }: PlanPanelProps) {
  // File stream hook
  const fileStream = useFileStream();

  // Plugin install prompt
  const [showPluginPrompt, setShowPluginPrompt] = useState(false);

  // Plan mode state — directory-based (AiTasks/ directory with multiple .md files)
  const [planDir, setPlanDir] = useState<string | null>(null);
  const [planSelectedFile, setPlanSelectedFile] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [mobileView, setMobileView] = useState<'browser' | 'editor'>('browser');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [planMarkdown, setPlanMarkdown] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  // When AiTasks/ directory is not found, show init guidance
  const [showInitGuide, setShowInitGuide] = useState(false);
  const [isHome, setIsHome] = useState(false);
  const planAnnotationRef = useRef<PlanAnnotationRendererHandle>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWorkspaceMode(token, sessionId)
      .then((wm) => {
        if (!cancelled && wm) {
          setIsHome(Boolean(wm.isHome));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, sessionId]);

  // Persist selected file to localStorage (global key — sessionId omitted so it persists across terminals)
  const planFileKey = 'plan-selected-file';
  const planFileSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!planSelectedFile) return;
    clearTimeout(planFileSaveRef.current);
    planFileSaveRef.current = setTimeout(() => {
      try { localStorage.setItem(planFileKey, planSelectedFile); } catch { /* full */ }
    }, 50);
    return () => clearTimeout(planFileSaveRef.current);
  }, [planSelectedFile]);

  // Auto-detect AiTasks/ directory on mount
  const planStreamedRef = useRef<string | null>(null);
  useEffect(() => {
    planStreamedRef.current = null;
    let cancelled = false;
    setPlanLoading(true);
    setShowInitGuide(false);
    (async () => {
      let home = '';
      try {
        const res = await fetchFiles(token, sessionId);
        if (cancelled) return;
        home = res.home || '';
        const aiTasksEntry = res.files.find((f: FileEntry) => f.name === 'AiTasks' && f.type === 'directory');
        if (aiTasksEntry) {
          const dirPath = res.cwd + '/AiTasks';
          setPlanDir(dirPath);
          // Restore previously selected file if path is under AiTasks/
          const savedFile = localStorage.getItem(planFileKey);
          if (savedFile && savedFile.startsWith(dirPath + '/')) {
            setPlanSelectedFile(savedFile);
          }
        } else {
          // AiTasks/ not found — show init guidance
          setPlanDir(null);
          setPlanSelectedFile(null);
          setShowInitGuide(true);
        }
      } catch {
        setPlanDir(null);
      } finally {
        if (!cancelled) setPlanLoading(false);
      }

      // Check if ai-cli-task plugin is installed in Antigravity by reading import_manifest.json
      try {
        if (cancelled) return;
        if (home) {
          const manifestFile = `${home}/.gemini/config/import_manifest.json`;
          const result = await fetchFileContent(token, sessionId, manifestFile, 0);
          if (!cancelled && result) {
            try {
              const parsed = JSON.parse(result.content);
              const imports = parsed.imports || [];
              const hasPlugin = imports.some((imp: { name?: string }) => imp.name === 'ai-cli-task');
              if (!hasPlugin) setShowPluginPrompt(true);
            } catch { setShowPluginPrompt(true); }
          } else {
            setShowPluginPrompt(true);
          }
        }
      } catch { /* ignore — file not accessible or doesn't exist */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  // Auto-detect AiTasks/ creation adaptively (pauses when tab is hidden)
  useAdaptivePolling(
    useCallback(async () => {
      if (!showInitGuide || !connected) return;
      try {
        const res = await fetchFiles(token, sessionId);
        const aiTasksEntry = res.files.find((f: FileEntry) => f.name === 'AiTasks' && f.type === 'directory');
        if (aiTasksEntry) {
          const dirPath = res.cwd + '/AiTasks';
          setPlanDir(dirPath);
          setShowInitGuide(false);
          const savedFile = localStorage.getItem(planFileKey);
          if (savedFile && savedFile.startsWith(dirPath + '/')) {
            setPlanSelectedFile(savedFile);
          }
        }
      } catch { /* ignore */ }
    }, [showInitGuide, connected, token, sessionId, planFileKey]),
    { intervalMs: 3000, backgroundIntervalMs: 0, enabled: Boolean(showInitGuide && connected) },
  );

  // Register file stream event bus handler
  useEffect(() => {
    registerFileStreamHandler(sessionId, fileStream.handleChunk, fileStream.handleControl);
    return () => unregisterFileStreamHandler(sessionId);
  }, [sessionId, fileStream.handleChunk, fileStream.handleControl]);

  // Request file stream once WS is connected and planSelectedFile is known
  useEffect(() => {
    if (!planSelectedFile || !connected) return;
    if (planStreamedRef.current === planSelectedFile && planMarkdown) return;
    planStreamedRef.current = planSelectedFile;
    fileStream.reset();
    fileStream.startStream('content');
    onRequestFileStream?.(planSelectedFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planSelectedFile, connected]);

  // When stream completes, capture the content and record mtime for polling
  const planMtimeRef = useRef(0);
  useEffect(() => {
    if (fileStream.state.status === 'complete' && planSelectedFile) {
      setPlanMarkdown(fileStream.state.content);

      planMtimeRef.current = Date.now();
    }
  }, [fileStream.state.status, fileStream.state.content, planSelectedFile]);

  // Poll for file changes adaptively (3s when visible, paused when hidden, uses 304 Not Modified)
  useAdaptivePolling(
    useCallback(async () => {
      if (!planSelectedFile || !connected || !planMarkdown || !planMtimeRef.current) return;
      try {
        const result = await fetchFileContent(token, sessionId, planSelectedFile, planMtimeRef.current);
        if (result) {
          // File changed — update content
          setPlanMarkdown(result.content);
          planMtimeRef.current = result.mtime;
        }
      } catch { /* ignore network errors */ }
    }, [planSelectedFile, connected, planMarkdown, token, sessionId]),
    { intervalMs: 3000, backgroundIntervalMs: 0, enabled: Boolean(planSelectedFile && connected && planMarkdown) },
  );

  // Plan scroll position memory: filePath → scrollTop
  const planScrollPositionsRef = useRef(new Map<string, number>());

  const savePlanScrollPosition = useCallback(() => {
    if (!planSelectedFile) return;
    const top = planAnnotationRef.current?.getScrollTop?.() ?? 0;
    if (top > 0) planScrollPositionsRef.current.set(planSelectedFile, top);
  }, [planSelectedFile]);

  // Restore plan scroll position after content renders
  useEffect(() => {
    if (!planSelectedFile || !planMarkdown) return;
    const saved = planScrollPositionsRef.current.get(planSelectedFile);
    if (saved != null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          planAnnotationRef.current?.setScrollTop?.(saved);
        });
      });
    }
  }, [planSelectedFile, planMarkdown]);

  // Switch file within AiTasks/ directory
  const handlePlanFileSelect = useCallback((fullPath: string) => {
    if (fullPath === planSelectedFile) {
      if (isMobile) setMobileView('editor');
      return;
    }
    savePlanScrollPosition();
    setPlanSelectedFile(fullPath);
    setPlanMarkdown('');
    planStreamedRef.current = null;
    if (isMobile) setMobileView('editor');
  }, [planSelectedFile, savePlanScrollPosition, isMobile]);

  // Handle file deletion — clear selection if deleted file is currently selected
  const handlePlanFileDelete = useCallback((fullPath: string) => {
    if (planSelectedFile && (planSelectedFile === fullPath || planSelectedFile.startsWith(fullPath + '/'))) {
      setPlanSelectedFile(null);
      setPlanMarkdown('');
      planStreamedRef.current = null;
      if (isMobile) setMobileView('browser');
    }
  }, [planSelectedFile, isMobile]);

  // Handle new file creation from PlanFileBrowser
  const handlePlanFileCreate = useCallback((fullPath: string) => {
    setPlanSelectedFile(fullPath);
    setPlanMarkdown('');
    planStreamedRef.current = null;
    if (isMobile) setMobileView('editor');
  }, [isMobile]);

  // Handle Save from annotation renderer — send directly to terminal
  const handlePlanSave = useCallback((summary: string) => {
    if (summary) onSendToTerminal?.(summary);
  }, [onSendToTerminal]);

  // Handle content saved from edit mode — update markdown + mtime
  const handleContentSaved = useCallback((newContent: string, mtime: number) => {
    setPlanMarkdown(newContent);
    planMtimeRef.current = mtime;
  }, []);

  // Handle close file — deselect current file (does NOT close the Plan panel)
  const handleCloseFile = useCallback(() => {
    savePlanScrollPosition();
    setPlanSelectedFile(null);
    setPlanMarkdown('');
    planStreamedRef.current = null;
    if (isMobile) setMobileView('browser');
  }, [savePlanScrollPosition, isMobile]);

  // Refresh current plan file
  const handlePlanRefresh = useCallback(() => {
    if (!planSelectedFile || !connected) return;
    planStreamedRef.current = null;
    setPlanMarkdown('');
    fileStream.reset();
    fileStream.startStream('content');
    onRequestFileStream?.(planSelectedFile);
    planStreamedRef.current = planSelectedFile;
  }, [planSelectedFile, connected, fileStream, onRequestFileStream]);

  // File browser width (resizable)
  const [fbWidth, setFbWidth] = useState(() => {
    const saved = localStorage.getItem(`plan-fb-width-${sessionId}`);
    if (saved) { const n = Number(saved); if (Number.isFinite(n) && n >= 60 && n <= 300) return n; }
    return 130;
  });
  const prevFbWidthRef = useRef(fbWidth);
  if (fbWidth !== prevFbWidthRef.current) {
    prevFbWidthRef.current = fbWidth;
    try { localStorage.setItem(`plan-fb-width-${sessionId}`, String(Math.round(fbWidth))); } catch { /* full */ }
  }

  const handleFbDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = fbWidth;
    document.body.classList.add('resizing-panes');
    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setFbWidth(Math.min(300, Math.max(60, startW + delta)));
    };
    const onMouseUp = () => {
      document.body.classList.remove('resizing-panes');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [fbWidth]);

  // Current task module detection from selected file
  const currentModule = useMemo((): { name: string; dir: string } | null => {
    if (!planDir || !planSelectedFile) return null;
    if (!planSelectedFile.startsWith(planDir + '/')) return null;
    const relative = planSelectedFile.substring(planDir.length + 1);
    const firstSlash = relative.indexOf('/');
    if (firstSlash < 0) return null;
    const moduleName = relative.substring(0, firstSlash);
    if (!moduleName || moduleName.startsWith('.')) return null;
    return { name: moduleName, dir: `${planDir}/${moduleName}` };
  }, [planDir, planSelectedFile]);

  const moduleDir = currentModule?.dir;

  // Task status polling (.index.json)
  const [taskMeta, setTaskMeta] = useState<{ status: string; phase: string; type: string; completed_steps: number; title: string } | null>(null);
  const taskMetaMtimeRef = useRef(0);
  useEffect(() => { setTaskMeta(null); taskMetaMtimeRef.current = 0; }, [moduleDir]);
  // Task status polling (.index.json) adaptively
  useAdaptivePolling(
    useCallback(async () => {
      if (!moduleDir || !connected) return;
      try {
        const result = await fetchFileContent(token, sessionId, `${moduleDir}/.index.json`, taskMetaMtimeRef.current || undefined);
        if (result) {
          taskMetaMtimeRef.current = result.mtime;
          try {
            const data = JSON.parse(result.content);
            setTaskMeta({ status: data.status || 'draft', phase: data.phase || '', type: data.type || '', completed_steps: data.completed_steps || 0, title: data.title || '' });
          } catch { /* invalid JSON */ }
        }
      } catch { /* file not found or error */ }
    }, [moduleDir, connected, token, sessionId]),
    { intervalMs: 3000, backgroundIntervalMs: 0, enabled: Boolean(moduleDir && connected) },
  );

  // Auto signal polling adaptively
  const [autoSignal, setAutoSignal] = useState<{ step: string; result: string; next: string; iteration?: number } | null>(null);
  useEffect(() => { setAutoSignal(null); }, [moduleDir]);
  useAdaptivePolling(
    useCallback(async () => {
      if (!moduleDir || !connected) return;
      try {
        const result = await fetchFileContent(token, sessionId, `${moduleDir}/.auto-signal`);
        if (result) {
          try {
            const data = JSON.parse(result.content);
            setAutoSignal({ step: data.step, result: data.result, next: data.next, iteration: data.iteration });
          } catch { setAutoSignal(null); }
        }
      } catch { setAutoSignal(null); }
    }, [moduleDir, connected, token, sessionId]),
    { intervalMs: 2000, backgroundIntervalMs: 0, enabled: Boolean(moduleDir && connected) },
  );

  // Auto start handler
  const handleAutoStart = useCallback(() => {
    if (!currentModule || !onSendToTerminal) return;
    onSendToTerminal(`/auto AiTasks/${currentModule.name}`);
  }, [currentModule, onSendToTerminal]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Plugin install prompt */}
      {showPluginPrompt && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          flexShrink: 0,
        }}>
          <span style={{ color: 'var(--accent-yellow)', flex: 1 }}>ai-cli-task plugin not installed in Antigravity</span>
          <button
            className="pane-btn"
            style={{ color: 'var(--accent-green)', fontSize: 11 }}
            onClick={() => {
              if (onSendToTerminal) {
                onSendToTerminal('agy plugin install ./ai-cli-task');
              }
              setShowPluginPrompt(false);
            }}
          >
            Install
          </button>
          <button
            className="pane-btn"
            style={{ fontSize: 11 }}
            onClick={() => setShowPluginPrompt(false)}
          >
            &times;
          </button>
        </div>
      )}

      {/* Mobile view switcher bar */}
      {isMobile && planDir && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          padding: '2px 8px',
          gap: '4px',
          flexShrink: 0,
        }}>
          <button
            className="mecha-btn"
            onClick={() => setMobileView('browser')}
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: mobileView === 'browser' ? 'var(--accent-amber-subtle)' : 'transparent',
              color: mobileView === 'browser' ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
              borderColor: mobileView === 'browser' ? 'var(--accent-amber)' : 'transparent',
            }}
          >
            📁 Files {planSelectedFile ? `(${planSelectedFile.split('/').pop()})` : ''}
          </button>
          <button
            className="mecha-btn"
            onClick={() => setMobileView('editor')}
            disabled={!planSelectedFile}
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: mobileView === 'editor' ? 'var(--accent-amber-subtle)' : 'transparent',
              color: mobileView === 'editor' ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
              borderColor: mobileView === 'editor' ? 'var(--accent-amber)' : 'transparent',
              opacity: planSelectedFile ? 1 : 0.4,
            }}
          >
            ✏️ Document
          </button>
        </div>
      )}

      {/* Body: file browser + divider + annotation editor */}
      <div className="plan-overlay-body">
        {/* File browser */}
        {planDir && (!isMobile || mobileView === 'browser') && (
          <>
            <div style={{ width: isMobile ? '100%' : fbWidth, flexShrink: 0, overflow: 'hidden', height: '100%' }}>
              <PlanFileBrowser
                sessionId={sessionId}
                token={token}
                planDir={planDir}
                selectedFile={planSelectedFile}
                onSelectFile={handlePlanFileSelect}
                onCreateFile={handlePlanFileCreate}
                onDeleteFile={handlePlanFileDelete}
              />
            </div>
            {!isMobile && (
              <div
                onMouseDown={handleFbDividerMouseDown}
                style={{
                  width: 2,
                  flexShrink: 0,
                  cursor: 'col-resize',
                  backgroundColor: 'var(--border)',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--accent-blue)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--border)'; }}
              />
            )}
          </>
        )}

        {/* Annotation editor */}
        {(!isMobile || mobileView === 'editor') && (
          <div className="plan-overlay-center" style={{ width: '100%', height: '100%' }}>
            {planLoading ? (
              <CenteredLoading label="Loading AiTasks/..." />
            ) : showInitGuide ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, padding: '0 20px', textAlign: 'center' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  marginBottom: '2px',
                }}>
                  📋
                </div>
                <span style={{ color: 'var(--text-bright)', fontSize: 14, fontWeight: 700 }}>
                  {isHome ? 'AiTasks/ Not Found in Home Directory' : 'AiTasks/ directory not found'}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, maxWidth: '420px', lineHeight: 1.5 }}>
                  {isHome ? (
                    <>
                      The Plan Panel is designed for module task lifecycles in project workspaces. In Home directory (Personal Assistant mode), task lifecycle tracking is inactive.
                    </>
                  ) : (
                    <>
                      Run <code style={{ color: 'var(--accent-blue)', backgroundColor: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 3 }}>/init &lt;name&gt;</code> in the terminal to create a task
                    </>
                  )}
                </span>
                {isHome && (
                  <button
                    className="mecha-btn mecha-btn--primary"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('agy:open-workspace-selector'));
                    }}
                    style={{
                      marginTop: '6px',
                      padding: '6px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    Switch to a Project Workspace
                  </button>
                )}
              </div>
            ) : planSelectedFile && (!planMarkdown && (fileStream.state.status === 'streaming' || fileStream.state.status === 'idle')) ? (
              <CenteredLoading label={`Loading ${planSelectedFile.split('/').pop()}...`} percent={fileStream.state.totalSize > 0 ? Math.round((fileStream.state.receivedBytes / fileStream.state.totalSize) * 100) : undefined} />
            ) : planSelectedFile ? (
              <PlanAnnotationRenderer
                ref={planAnnotationRef}
                markdown={planMarkdown}
                filePath={planSelectedFile}
                sessionId={sessionId}
                token={token}
                onExecute={handlePlanSave}
                onSend={onSendToTerminal}
                onRefresh={handlePlanRefresh}
                onClose={handleCloseFile}
                onContentSaved={handleContentSaved}
                readOnly={planSelectedFile.endsWith('/.index.json')}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, padding: '16px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic' }}>Select a file from the file list</span>
                {isMobile && (
                  <button
                    className="mecha-btn mecha-btn--cyan"
                    onClick={() => setMobileView('browser')}
                    style={{ padding: '6px 14px', fontSize: '11px', marginTop: '8px' }}
                  >
                    📁 Browse Files
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task status bar */}
      {currentModule && taskMeta && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px',
          backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border)',
          fontSize: 11, flexShrink: 0, minHeight: 22,
        }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }} title={taskMeta.title}>{currentModule.name}</span>
          <span style={{
            color: taskMeta.status === 'complete' ? 'var(--accent-green)'
              : taskMeta.status === 'executing' || taskMeta.status === 'review' ? 'var(--accent-blue)'
              : taskMeta.status === 'blocked' ? 'var(--accent-red)'
              : taskMeta.status === 'cancelled' ? 'var(--text-secondary)'
              : 'var(--accent-yellow)',
            fontWeight: 500,
          }}>{taskMeta.status}</span>
          {taskMeta.phase && <span style={{ color: 'var(--text-secondary)' }}>({taskMeta.phase})</span>}
          {autoSignal ? (
            <span style={{ color: 'var(--accent-yellow)' }}>
              {autoSignal.step}:{autoSignal.result} → {autoSignal.next}
              {autoSignal.iteration != null && ` #${autoSignal.iteration}`}
            </span>
          ) : (
            <button className="pane-btn" onClick={handleAutoStart}
              disabled={!connected || taskMeta.status === 'complete' || taskMeta.status === 'cancelled'}
              style={{ color: 'var(--accent-green)', fontWeight: 500, fontSize: 11,
                ...((!connected || taskMeta.status === 'complete' || taskMeta.status === 'cancelled') ? { opacity: 0.4 } : {}) }}
              title="Start auto mode for this task">
              Auto ▶
            </button>
          )}
          {taskMeta.completed_steps > 0 && (
            <span style={{ color: 'var(--text-secondary)', marginLeft: 'auto' }}>step {taskMeta.completed_steps}</span>
          )}
        </div>
      )}
    </div>
  );
}
