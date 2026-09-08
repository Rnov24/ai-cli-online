import { useState, useEffect, useCallback } from 'react';
import { fetchFiles, downloadFile, deleteItem, touchFile, mkdirPath } from '../api/files';
import type { FileEntry } from '../api/files';
import { fetchFileContent, saveFileContent } from '../api/docs';
import { MarkdownRenderer } from './MarkdownRenderer';
import { FolderIcon, FileIcon, SaveIcon, CheckIcon, EditIcon, CloseIcon } from './icons';

interface WorkspaceFilesPanelProps {
  sessionId: string;
  token: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspaceFilesPanel({ sessionId, token }: WorkspaceFilesPanelProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetchFiles(token, sessionId, path || undefined);
      setEntries(res.files || []);
      setCurrentPath(path);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [token, sessionId]);

  useEffect(() => {
    loadDirectory('');
  }, [loadDirectory]);

  const handleOpenItem = async (entry: FileEntry) => {
    if (entry.type === 'directory') {
      const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      loadDirectory(nextPath);
      setSelectedFile(null);
      setFileContent(null);
    } else {
      const fullFilePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      setSelectedFile(fullFilePath);
      setContentLoading(true);
      setIsEditing(false);
      try {
        const res = await fetchFileContent(token, sessionId, fullFilePath);
        const content = res ? res.content : '';
        setFileContent(content);
        setEditContent(content);
      } catch (err) {
        const errContent = `// Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`;
        setFileContent(errContent);
        setEditContent(errContent);
      } finally {
        setContentLoading(false);
      }
    }
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    setActionError(null);
    try {
      await saveFileContent(token, sessionId, selectedFile, editContent);
      setFileContent(editContent);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      setIsEditing(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    loadDirectory(parts.join('/'));
    setSelectedFile(null);
    setFileContent(null);
  };

  const handleNewFile = async () => {
    const name = window.prompt('Enter new file name:');
    if (!name) return;
    const target = currentPath ? `${currentPath}/${name}` : name;
    try {
      await touchFile(token, sessionId, target);
      loadDirectory(currentPath);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create file');
    }
  };

  const handleNewFolder = async () => {
    const name = window.prompt('Enter new directory name:');
    if (!name) return;
    const target = currentPath ? `${currentPath}/${name}` : name;
    try {
      await mkdirPath(token, sessionId, target);
      loadDirectory(currentPath);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  };

  const handleDelete = async (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    try {
      await deleteItem(token, sessionId, itemPath);
      if (selectedFile === itemPath) {
        setSelectedFile(null);
        setFileContent(null);
      }
      loadDirectory(currentPath);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleDownload = async (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const itemPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    try {
      await downloadFile(token, sessionId, itemPath);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to download');
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--bg-primary)',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Top Header & Breadcrumb */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 10px',
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        fontSize: '12px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
          {currentPath && (
            <button
              onClick={handleGoUp}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--accent-blue)',
                padding: '0 4px',
                fontSize: '12px',
              }}
            >
              ⮤ Up
            </button>
          )}
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            color: 'var(--text-bright)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <FolderIcon size={13} color="var(--accent-blue)" /> /{currentPath}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={handleNewFile}
            title="Create file"
            style={{
              padding: isMobile ? '5px 8px' : '2px 6px',
              minHeight: isMobile ? '28px' : 'auto',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            + File
          </button>
          <button
            onClick={handleNewFolder}
            title="Create directory"
            style={{
              padding: isMobile ? '5px 8px' : '2px 6px',
              minHeight: isMobile ? '28px' : 'auto',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '11px',
            }}
          >
            + Folder
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{
          padding: '4px 10px',
          backgroundColor: 'rgba(244, 71, 71, 0.15)',
          color: 'var(--accent-red)',
          fontSize: '11px',
          borderBottom: '1px solid var(--border)',
        }}>
          {actionError}
        </div>
      )}

      {/* Main Split: File List (left/top) + File Preview (right/bottom) */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* File List */}
        {(!isMobile || !selectedFile) && (
          <div style={{
            flex: (!isMobile && selectedFile) ? '0 0 40%' : '1 1 auto',
            overflowY: 'auto',
            borderBottom: (!isMobile && selectedFile) ? '1px solid var(--border)' : 'none',
          }}>
            {loading ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Loading files...
              </div>
            ) : entries.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Empty directory
              </div>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.name}
                  onClick={() => handleOpenItem(entry)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: isMobile ? '8px 12px' : '6px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    backgroundColor: selectedFile?.endsWith(entry.name) ? 'var(--bg-hover)' : 'transparent',
                    fontSize: '12px',
                    fontFamily: "'JetBrains Mono', monospace",
                    transition: 'background-color 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!selectedFile?.endsWith(entry.name)) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!selectedFile?.endsWith(entry.name)) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span>{entry.type === 'directory' ? <FolderIcon size={13} color="var(--accent-blue)" /> : <FileIcon size={13} />}</span>
                    <span style={{
                      color: entry.type === 'directory' ? 'var(--accent-blue)' : 'var(--text-bright)',
                      fontWeight: entry.type === 'directory' ? 600 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {entry.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                      {entry.type === 'file' ? formatBytes(entry.size) : ''}
                    </span>
                    {entry.type === 'file' && (
                      <button
                        onClick={(e) => handleDownload(entry, e)}
                        title="Download file"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: isMobile ? '6px 8px' : '3px 6px',
                          minWidth: isMobile ? '30px' : '24px',
                          minHeight: isMobile ? '30px' : '24px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        ↓
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(entry, e)}
                      title="Delete"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-red)',
                        cursor: 'pointer',
                        fontSize: '11px',
                        padding: isMobile ? '6px 8px' : '3px 6px',
                        minWidth: isMobile ? '30px' : '24px',
                        minHeight: isMobile ? '30px' : '24px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.7,
                      }}
                    >
                      <CloseIcon size={11} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* File Preview */}
        {selectedFile && (
          <div style={{
            flex: isMobile ? '1 1 100%' : '1 1 60%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'var(--bg-primary)',
            height: '100%',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <FileIcon size={12} />
                <span>{selectedFile.split('/').pop()}</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isEditing ? (
                  <>
                    <button
                      className="mecha-btn"
                      onClick={handleSaveFile}
                      disabled={isSaving}
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        backgroundColor: 'var(--accent-green-bright, #10b981)',
                        color: '#000',
                        fontWeight: 700,
                      }}
                    >
                      {isSaving ? 'Saving...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><SaveIcon size={11} /> Save</span>}
                    </button>
                    <button
                      className="mecha-btn"
                      onClick={() => { setEditContent(fileContent || ''); setIsEditing(false); }}
                      style={{ padding: '2px 8px', fontSize: '10px' }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {saveSuccess && (
                      <span style={{ color: 'var(--accent-green-bright)', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <CheckIcon size={11} /> Saved
                      </span>
                    )}
                    <button
                      className="mecha-btn"
                      onClick={() => setIsEditing(true)}
                      style={{
                        padding: '2px 8px',
                        fontSize: '10px',
                        color: 'var(--accent-cyan-bright)',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <EditIcon size={11} /> Edit
                      </span>
                    </button>
                  </>
                )}
                <button
                  className="mecha-btn"
                  onClick={() => { setSelectedFile(null); setFileContent(null); setIsEditing(false); }}
                  style={{ padding: '2px 8px', fontSize: '10px' }}
                >
                  {isMobile ? '← Back' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><CloseIcon size={11} /> Close</span>}
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', height: 'calc(100% - 40px)' }}>
              {contentLoading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Loading content...</div>
              ) : isEditing ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  spellCheck={false}
                  style={{
                    width: '100%',
                    height: '100%',
                    minHeight: '280px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-bright)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    lineHeight: '1.5',
                    padding: '8px',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    resize: 'none',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              ) : fileContent != null ? (
                selectedFile.endsWith('.md') ? (
                  <MarkdownRenderer content={fileContent} />
                ) : (
                  <MarkdownRenderer content={`\`\`\`${selectedFile.split('.').pop() || 'text'}\n${fileContent}\n\`\`\``} />
                )
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
