import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { AiChatView } from './AiChatView';
import { PlanPanel } from './PlanPanel';
import { GitHistoryPanel } from './GitHistoryPanel';
import { DownloadPopup } from './DownloadPopup';
import { uploadFiles, fetchCwd } from '../api/files';
import { usePanelResize } from '../hooks/usePanelResize';
import { useAdaptivePolling } from '../hooks/useAdaptivePolling';
import { TaskPipelineBar } from './TaskPipelineBar';
import { WorkspaceFilesPanel } from './WorkspaceFilesPanel';
import { FolderIcon, TaskPulseIcon, GitBranchIcon, CloseIcon } from './icons';

import type { TerminalInstance } from '../types';

interface TerminalPaneProps {
  terminal: TerminalInstance;
  canClose: boolean;
}

// Ensure localStorage has a working fallback in test/jsdom/opaque-origin environments under Node 22+
try {
  let hasWorkingStorage = false;
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      localStorage.getItem('__test__');
      hasWorkingStorage = true;
    }
  } catch {
    hasWorkingStorage = false;
  }

  if (!hasWorkingStorage) {
    const map = new Map<string, string>();
    const memStorage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, val: string) => { map.set(key, String(val)); },
      removeItem: (key: string) => { map.delete(key); },
      clear: () => { map.clear(); },
      get length() { return map.size; },
      key: (i: number) => Array.from(map.keys())[i] ?? null,
    };
    if (typeof globalThis !== 'undefined') {
      try {
        Object.defineProperty(globalThis, 'localStorage', { value: memStorage, configurable: true, writable: true });
      } catch {}
    }
    if (typeof window !== 'undefined') {
      try {
        Object.defineProperty(window, 'localStorage', { value: memStorage, configurable: true, writable: true });
      } catch {}
    }
  }
} catch {}

export const TerminalPane = memo(function TerminalPane({ terminal, canClose }: TerminalPaneProps) {
  const splitTerminal = useStore((s) => s.splitTerminal);
  const removeTerminal = useStore((s) => s.removeTerminal);
  const token = useStore((s) => s.token);
  const togglePlan = useStore((s) => s.togglePlan);
  const toggleGitHistory = useStore((s) => s.toggleGitHistory);
  const { planOpen, gitHistoryOpen } = terminal.panels;

  const [filesOpen, setFilesOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') return window.innerWidth;
    return 1024;
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const outerRef = useRef<HTMLDivElement>(null);
  const topRowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const container = topRowRef.current;
    if (!container) return;

    const updateWidth = () => {
      if (topRowRef.current) {
        const measured = topRowRef.current.clientWidth;
        if (measured > 0) {
          setContainerWidth(measured);
        } else if (typeof window !== 'undefined' && window.innerWidth > 0) {
          setContainerWidth(window.innerWidth);
        }
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect && typeof entry.contentRect.width === 'number') {
            setContainerWidth(entry.contentRect.width);
          } else if (entry.target) {
            const w = (entry.target as HTMLElement).clientWidth;
            if (w > 0) setContainerWidth(w);
          }
        }
      });
      observer.observe(container);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  const isStackedOverlay = isMobile || (containerWidth > 0 && containerWidth < 560);

  // Panel resize hook
  const [planWidthPercent, handlePlanDividerMouseDown] = usePanelResize(
    `plan-width-${terminal.id}`, 50,
    { containerRef: topRowRef, axis: 'x', min: 20, max: 80, bodyClass: 'resizing-panes' },
  );

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Download popup state
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);

  // CWD state
  const [cwd, setCwd] = useState<string | null>(null);
  const [externalCommand, setExternalCommand] = useState<{ cmd: string; id: number } | undefined>();

  useAdaptivePolling(
    useCallback(async () => {
      if (!token) return;
      try {
        const dir = await fetchCwd(token, terminal.id);
        setCwd(dir);
      } catch {
        // ignore errors
      }
    }, [token, terminal.id]),
    { intervalMs: 5000, backgroundIntervalMs: 0, enabled: Boolean(token) },
  );

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !token) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      await uploadFiles(token, terminal.id, Array.from(files), (percent) => {
        setUploadProgress(percent);
      });
    } catch {
      // ignore
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [token, terminal.id]);

  const handleSplit = useCallback((direction: 'horizontal' | 'vertical') => {
    splitTerminal(terminal.id, direction);
  }, [splitTerminal, terminal.id]);

  const handleCloseDownload = useCallback(() => setShowDownloadPopup(false), []);

  return (
    <div ref={outerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, minHeight: 0 }}>
      {/* Mecha Pane Title Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '2px 8px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        height: isMobile ? '32px' : '28px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <span className="pulse-dot pulse-dot--online" />
          <span style={{ fontWeight: 700, color: 'var(--text-bright)', flexShrink: 0, letterSpacing: '0.4px' }}>
            PROCESS // {terminal.id}
          </span>
          {cwd && (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                direction: 'rtl',
                textAlign: 'left',
                minWidth: 0,
              }}
              title={cwd}
            >
              {cwd}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
          <button
            className="mecha-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={uploading ? { color: 'var(--accent-amber-bright)', padding: '2px 6px', fontSize: '10px' } : { padding: '2px 6px', fontSize: '10px' }}
            title={uploading ? `Uploading ${uploadProgress}%` : 'Upload files'}
            aria-label="Upload files"
          >
            {uploading ? `${uploadProgress}%` : <><span>↑</span><span className="desktop-only" style={{ marginLeft: '3px' }}>Upload</span></>}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="mecha-btn"
              onClick={() => setShowDownloadPopup(true)}
              title="Download files"
              aria-label="Download files"
              style={{ padding: '2px 6px', fontSize: '10px' }}
            >
              <span>↓</span><span className="desktop-only" style={{ marginLeft: '3px' }}>Download</span>
            </button>
            {showDownloadPopup && token && (
              <DownloadPopup
                token={token}
                sessionId={terminal.id}
                onClose={handleCloseDownload}
              />
            )}
          </div>
          <button
            className={`mecha-btn${filesOpen ? ' mecha-btn--active' : ''}`}
            onClick={() => setFilesOpen((prev) => !prev)}
            title="Toggle Workspace Files"
            aria-label="Toggle Files Explorer"
            style={{ padding: '2px 6px', fontSize: '10px' }}
          >
            <FolderIcon size={12} /><span className="desktop-only" style={{ marginLeft: '3px' }}>Files</span>
          </button>
          <button
            className={`mecha-btn${planOpen ? ' mecha-btn--active' : ''}`}
            onClick={() => togglePlan(terminal.id)}
            title="Toggle Task & Plan Panel"
            aria-label="Toggle Task annotation panel"
            style={{ padding: '2px 6px', fontSize: '10px' }}
          >
            <TaskPulseIcon size={12} /><span className="desktop-only" style={{ marginLeft: '3px' }}>Tasks</span>
          </button>
          <button
            className={`mecha-btn${gitHistoryOpen ? ' mecha-btn--active' : ''}`}
            onClick={() => toggleGitHistory(terminal.id)}
            title="Toggle Git History Panel"
            aria-label="Toggle Git history panel"
            style={{ padding: '2px 6px', fontSize: '10px' }}
          >
            <GitBranchIcon size={12} /><span className="desktop-only" style={{ marginLeft: '3px' }}>Git</span>
          </button>
          <button
            className="mecha-btn desktop-only"
            onClick={() => handleSplit('horizontal')}
            title="Split pane horizontally"
            aria-label="Split horizontal"
            style={{ padding: '2px 5px', fontSize: '10px' }}
          >
            ◫
          </button>
          <button
            className="mecha-btn desktop-only"
            onClick={() => handleSplit('vertical')}
            title="Split pane vertically"
            aria-label="Split vertical"
            style={{ padding: '2px 5px', fontSize: '10px' }}
          >
            ◫v
          </button>
          {canClose && (
            <button
              className="mecha-btn mecha-btn--danger"
              onClick={() => removeTerminal(terminal.id)}
              title="Close this split pane"
              aria-label="Close pane"
              style={{ padding: '2px 5px', fontSize: '10px' }}
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Main area: Files/Plan/Git (left/overlay) | Native AI Command Stream (center/right) */}
      <div ref={topRowRef} style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden', minHeight: 0, position: 'relative' }}>
        {/* Mobile / Narrow Container Overlay for Secondary Panels */}
        {isStackedOverlay && (filesOpen || planOpen || gitHistoryOpen) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 10px',
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              flexShrink: 0,
            }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-amber-bright)' }}>
                {filesOpen ? '// WORKSPACE FILES' : planOpen ? '// TASKS & PLAN' : '// GIT HISTORY'}
              </span>
              <button
                className="mecha-btn"
                onClick={() => {
                  if (filesOpen) setFilesOpen(false);
                  else if (planOpen) togglePlan(terminal.id);
                  else if (gitHistoryOpen) toggleGitHistory(terminal.id);
                }}
                style={{ padding: '4px 10px', fontSize: '11px', minHeight: '28px' }}
                aria-label="Close panel"
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <CloseIcon size={12} /> CLOSE
                </span>
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {filesOpen && (
                <WorkspaceFilesPanel
                  sessionId={terminal.id}
                  token={token || ''}
                />
              )}
              {planOpen && !filesOpen && (
                <PlanPanel
                  sessionId={terminal.id}
                  token={token || ''}
                  connected={true}
                  onSendToTerminal={(cmd) => setExternalCommand({ cmd, id: Date.now() })}
                />
              )}
              {gitHistoryOpen && !filesOpen && !planOpen && (
                <GitHistoryPanel
                  sessionId={terminal.id}
                  token={token || ''}
                />
              )}
            </div>
          </div>
        )}

        {/* Desktop Split for Secondary Panels */}
        {!isStackedOverlay && (filesOpen || planOpen || gitHistoryOpen) && (
          <>
            <div style={{ width: `${planWidthPercent}%`, minWidth: 220, flexShrink: 0, overflow: 'hidden' }}>
              {filesOpen && (
                <WorkspaceFilesPanel
                  sessionId={terminal.id}
                  token={token || ''}
                />
              )}
              {planOpen && !filesOpen && (
                <PlanPanel
                  sessionId={terminal.id}
                  token={token || ''}
                  connected={true}
                  onSendToTerminal={(cmd) => setExternalCommand({ cmd, id: Date.now() })}
                />
              )}
              {gitHistoryOpen && !filesOpen && !planOpen && (
                <GitHistoryPanel
                  sessionId={terminal.id}
                  token={token || ''}
                />
              )}
            </div>
            <div
              className="md-editor-divider-h"
              onMouseDown={handlePlanDividerMouseDown}
              style={{
                width: '3px',
                flexShrink: 0,
                cursor: 'col-resize',
                backgroundColor: 'var(--border)',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--accent-amber)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--border)'; }}
            />
          </>
        )}

        {/* Central Pure AI Command Timeline with Task Pipeline Bar */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="desktop-only">
            <TaskPipelineBar
              onRunSkill={(cmd) => setExternalCommand({ cmd, id: Date.now() })}
            />
          </div>
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <AiChatView
              sessionId={terminal.id}
              token={token || ''}
              externalCommand={externalCommand}
            />
          </div>
        </div>
      </div>
    </div>
  );
});
