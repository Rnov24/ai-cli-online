import { useState, useEffect, useMemo } from 'react';
import {
  fetchPlugins,
  installPlugin,
  uninstallPlugin,
  togglePlugin,
  type PluginItem,
} from '../api/plugins';
import {
  PuzzleIcon,
  CloseIcon,
  SearchIcon,
  PlusIcon,
  TrashIcon,
  CodeIcon,
  BoltIcon,
} from './icons';

export interface PluginsModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | null;
  onSendToTerminal?: (cmd: string) => void;
}

export function PluginsModal({
  isOpen,
  onClose,
  token,
  onSendToTerminal,
}: PluginsModalProps) {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Install card state
  const [showInstallCard, setShowInstallCard] = useState<boolean>(false);
  const [installTarget, setInstallTarget] = useState<string>('');
  const [installLoading, setInstallLoading] = useState<boolean>(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);

  // Per-plugin action states
  const [actionLoading, setActionLoading] = useState<{ [name: string]: boolean }>({});
  const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPlugins = () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    fetchPlugins(token)
      .then((data) => {
        setPlugins(data.plugins || []);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load plugins');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !token) return;
    loadPlugins();
    setConfirmUninstall(null);
    setShowInstallCard(false);
    setInstallError(null);
    setInstallSuccess(null);
    setActionMessage(null);
  }, [isOpen, token]);

  const filteredPlugins = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return plugins;

    return plugins.filter((p) => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchDesc = p.description ? p.description.toLowerCase().includes(q) : false;
      const matchAuthor = p.author ? p.author.toLowerCase().includes(q) : false;
      const matchComp = p.components.some((c) => c.toLowerCase().includes(q));
      return matchName || matchDesc || matchAuthor || matchComp;
    });
  }, [plugins, searchQuery]);

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !installTarget.trim() || installLoading) return;

    setInstallLoading(true);
    setInstallError(null);
    setInstallSuccess(null);

    try {
      const res = await installPlugin(token, installTarget.trim());
      setInstallSuccess(res.message || 'Plugin installed successfully');
      setInstallTarget('');
      loadPlugins();
      window.dispatchEvent(new CustomEvent('agy:refresh-skills'));
    } catch (err: any) {
      setInstallError(err.message || 'Failed to install plugin');
    } finally {
      setInstallLoading(false);
    }
  };

  const handleToggle = async (plugin: PluginItem) => {
    if (!token || actionLoading[plugin.name]) return;

    setActionLoading((prev) => ({ ...prev, [plugin.name]: true }));
    setActionMessage(null);

    try {
      const newEnabled = !plugin.enabled;
      await togglePlugin(token, plugin.name, newEnabled);
      setPlugins((prev) =>
        prev.map((p) => (p.name === plugin.name ? { ...p, enabled: newEnabled } : p))
      );
      setActionMessage({
        type: 'success',
        text: `Plugin ${plugin.name} ${newEnabled ? 'enabled' : 'disabled'}`,
      });
      window.dispatchEvent(new CustomEvent('agy:refresh-skills'));
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || `Failed to toggle plugin ${plugin.name}`,
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [plugin.name]: false }));
    }
  };

  const handleUninstall = async (pluginName: string) => {
    if (!token || actionLoading[pluginName]) return;

    if (confirmUninstall !== pluginName) {
      setConfirmUninstall(pluginName);
      return;
    }

    setActionLoading((prev) => ({ ...prev, [pluginName]: true }));
    setActionMessage(null);
    setConfirmUninstall(null);

    try {
      await uninstallPlugin(token, pluginName);
      setPlugins((prev) => prev.filter((p) => p.name !== pluginName));
      setActionMessage({
        type: 'success',
        text: `Plugin ${pluginName} uninstalled successfully`,
      });
      window.dispatchEvent(new CustomEvent('agy:refresh-skills'));
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || `Failed to uninstall plugin ${pluginName}`,
      });
    } finally {
      setActionLoading((prev) => ({ ...prev, [pluginName]: false }));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Antigravity Plugins & Extensions"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 'var(--z-modal-backdrop, 1000)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          width: 'min(780px, calc(100vw - 24px))',
          maxHeight: 'min(680px, calc(100dvh - 32px))',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          zIndex: 'var(--z-modal, 1001)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-elevated, #161b26)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <PuzzleIcon size={18} color="var(--accent-cyan, #00f0ff)" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  color: 'var(--text-primary)',
                }}
              >
                ANTIGRAVITY PLUGINS
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(0, 240, 255, 0.15)',
                  color: 'var(--accent-cyan, #00f0ff)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: 600,
                }}
              >
                {plugins.length} INSTALLED
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #64748b)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Toolbar */}
        <div
          style={{
            padding: '10px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'var(--bg-surface)',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '4px 10px',
              flex: 1,
              minWidth: '180px',
            }}
          >
            <SearchIcon size={12} color="var(--text-muted, #64748b)" />
            <input
              type="text"
              placeholder="Search plugins, commands, skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
                width: '100%',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted, #64748b)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <CloseIcon size={10} />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowInstallCard((prev) => !prev)}
            style={{
              padding: '5px 12px',
              backgroundColor: showInstallCard
                ? 'var(--accent-blue, #3b82f6)'
                : 'rgba(59, 130, 246, 0.15)',
              border: '1px solid var(--accent-blue, #3b82f6)',
              borderRadius: '4px',
              color: showInstallCard ? '#ffffff' : 'var(--accent-blue, #3b82f6)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {showInstallCard ? <CloseIcon size={12} /> : <PlusIcon size={12} />}
            <span>{showInstallCard ? 'CANCEL INSTALL' : 'INSTALL PLUGIN'}</span>
          </button>

          <button
            onClick={loadPlugins}
            disabled={loading}
            title="Refresh plugins list"
            style={{
              padding: '5px 10px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-muted, #64748b)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '11px',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '...' : 'REFRESH'}
          </button>
        </div>

        {/* Inline Install Card */}
        {showInstallCard && (
          <div
            style={{
              padding: '14px 18px',
              backgroundColor: 'rgba(59, 130, 246, 0.05)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-blue, #3b82f6)' }}>
              INSTALL PLUGIN FROM MARKETPLACE OR LOCAL PATH
            </div>
            <form onSubmit={handleInstall} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Target: e.g. ai-cli-task or ./ai-cli-task"
                value={installTarget}
                onChange={(e) => setInstallTarget(e.target.value)}
                disabled={installLoading}
                style={{
                  flex: 1,
                  minWidth: '220px',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="submit"
                disabled={installLoading || !installTarget.trim()}
                style={{
                  padding: '6px 14px',
                  backgroundColor: 'var(--accent-blue, #3b82f6)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: installLoading || !installTarget.trim() ? 'not-allowed' : 'pointer',
                  opacity: installLoading || !installTarget.trim() ? 0.6 : 1,
                }}
              >
                {installLoading ? 'INSTALLING...' : 'INSTALL'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted, #64748b)' }}>QUICK INSTALL:</span>
              <button
                type="button"
                onClick={() => setInstallTarget('ai-cli-task')}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '3px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                ai-cli-task (Task Lifecycle)
              </button>
            </div>

            {installError && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: 'var(--accent-red, #ef4444)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {installError}
              </div>
            )}

            {installSuccess && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: 'var(--accent-green, #22c55e)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {installSuccess}
              </div>
            )}
          </div>
        )}

        {/* Global Action Message */}
        {actionMessage && (
          <div
            style={{
              padding: '8px 18px',
              backgroundColor:
                actionMessage.type === 'success'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : 'rgba(239, 68, 68, 0.15)',
              borderBottom: '1px solid var(--border-color)',
              color:
                actionMessage.type === 'success'
                  ? 'var(--accent-green, #22c55e)'
                  : 'var(--accent-red, #ef4444)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono, monospace)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <CloseIcon size={10} />
            </button>
          </div>
        )}

        {/* Plugins List */}
        <div
          style={{
            padding: '16px 18px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {loading && plugins.length === 0 ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              Loading Antigravity plugins...
            </div>
          ) : error ? (
            <div
              style={{
                padding: '16px',
                borderRadius: '6px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--accent-red, #ef4444)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {error}
            </div>
          ) : filteredPlugins.length === 0 ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {searchQuery ? `No plugins matching "${searchQuery}"` : 'No Antigravity plugins installed.'}
            </div>
          ) : (
            filteredPlugins.map((plugin) => {
              const isActioning = actionLoading[plugin.name] || false;
              const isConfirming = confirmUninstall === plugin.name;

              return (
                <div
                  key={plugin.name}
                  data-testid={`plugin-card-${plugin.name}`}
                  style={{
                    backgroundColor: 'var(--bg-elevated, #161b26)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    opacity: plugin.enabled ? 1 : 0.65,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {plugin.name}
                      </span>

                      {plugin.version && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            backgroundColor: 'var(--badge-overlay-bg)',
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          v{plugin.version}
                        </span>
                      )}

                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor:
                            plugin.source === 'antigravity'
                              ? 'rgba(0, 240, 255, 0.12)'
                              : 'rgba(148, 163, 184, 0.12)',
                          color:
                            plugin.source === 'antigravity'
                              ? 'var(--accent-cyan, #00f0ff)'
                              : 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {plugin.source}
                      </span>

                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: plugin.enabled
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: plugin.enabled
                            ? 'var(--accent-green, #22c55e)'
                            : 'var(--accent-red, #ef4444)',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontWeight: 600,
                        }}
                      >
                        {plugin.enabled ? 'ENABLED' : 'DISABLED'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Toggle Enable/Disable */}
                      <button
                        onClick={() => handleToggle(plugin)}
                        disabled={isActioning}
                        style={{
                          padding: '3px 8px',
                          fontSize: '10px',
                          borderRadius: '3px',
                          border: '1px solid var(--border-color)',
                          backgroundColor: plugin.enabled
                            ? 'rgba(239, 68, 68, 0.1)'
                            : 'rgba(34, 197, 94, 0.1)',
                          color: plugin.enabled
                            ? 'var(--accent-red, #ef4444)'
                            : 'var(--accent-green, #22c55e)',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontWeight: 600,
                          cursor: isActioning ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {plugin.enabled ? 'DISABLE' : 'ENABLE'}
                      </button>

                      {/* Uninstall Button */}
                      <button
                        onClick={() => handleUninstall(plugin.name)}
                        disabled={isActioning}
                        style={{
                          padding: '3px 8px',
                          fontSize: '10px',
                          borderRadius: '3px',
                          border: isConfirming
                            ? '1px solid var(--accent-red, #ef4444)'
                            : '1px solid var(--border-color)',
                          backgroundColor: isConfirming
                            ? 'var(--accent-red, #ef4444)'
                            : 'transparent',
                          color: isConfirming ? '#ffffff' : 'var(--text-muted, #64748b)',
                          fontFamily: 'var(--font-mono, monospace)',
                          cursor: isActioning ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <TrashIcon size={10} />
                        <span>{isConfirming ? 'CONFIRM?' : 'UNINSTALL'}</span>
                      </button>

                      {/* Terminal CLI Command */}
                      {onSendToTerminal && (
                        <button
                          onClick={() => onSendToTerminal(`agy plugin list`)}
                          title="Run 'agy plugin list' in active terminal"
                          style={{
                            padding: '3px 8px',
                            fontSize: '10px',
                            borderRadius: '3px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'transparent',
                            color: 'var(--accent-cyan, #00f0ff)',
                            fontFamily: 'var(--font-mono, monospace)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <BoltIcon size={10} />
                          <span>CLI</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {plugin.description && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.4',
                      }}
                    >
                      {plugin.description}
                    </div>
                  )}

                  {/* Components and Details */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      marginTop: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: 'var(--text-muted, #64748b)',
                    }}
                  >
                    {plugin.author && <span>by {plugin.author}</span>}

                    {plugin.hasSkills && (
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          color: 'var(--accent-blue, #3b82f6)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <PuzzleIcon size={10} />
                        {plugin.skillsCount > 0 ? `${plugin.skillsCount} skills` : 'skills'}
                      </span>
                    )}

                    {plugin.hasCommands && (
                      <span
                        style={{
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(168, 85, 247, 0.1)',
                          color: 'var(--accent-purple, #a855f7)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <CodeIcon size={10} />
                        commands
                      </span>
                    )}

                    <span style={{ marginLeft: 'auto', opacity: 0.6 }}>{plugin.path}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
