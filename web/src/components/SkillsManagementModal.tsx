import { useState, useEffect, useMemo } from 'react';
import {
  fetchSkills,
  fetchSkillContent,
  scaffoldSkill,
  type SkillItem,
} from '../api/skills';
import {
  PuzzleIcon,
  CloseIcon,
  SearchIcon,
  PlusIcon,
  CopyIcon,
  CheckIcon,
  CodeIcon,
  BoltIcon,
  FolderIcon,
  HomeIcon,
} from './icons';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface SkillsManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  cwd?: string;
  token: string | null;
  onExecuteSkill?: (cmd: string) => void;
}

export function SkillsManagementModal({
  isOpen,
  onClose,
  cwd,
  token,
  onExecuteSkill,
}: SkillsManagementModalProps) {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [isHome, setIsHome] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeScope, setActiveScope] = useState<'all' | 'workspace' | 'global' | 'builtin'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedName, setCopiedName] = useState<string | null>(null);

  // Inspector state
  const [inspectingSkill, setInspectingSkill] = useState<SkillItem | null>(null);
  const [inspectContent, setInspectContent] = useState<string | null>(null);
  const [inspectLoading, setInspectLoading] = useState<boolean>(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectCopied, setInspectCopied] = useState<boolean>(false);

  // Scaffolding form state
  const [showScaffold, setShowScaffold] = useState<boolean>(false);
  const [scaffoldName, setScaffoldName] = useState<string>('');
  const [scaffoldDesc, setScaffoldDesc] = useState<string>('');
  const [scaffoldScope, setScaffoldScope] = useState<'workspace' | 'global'>('workspace');
  const [scaffoldLoading, setScaffoldLoading] = useState<boolean>(false);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !token) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchSkills(token, cwd)
      .then((data) => {
        if (isMounted) {
          setSkills(data.skills || []);
          setWorkspacePath(data.workspacePath || '');
          setIsHome(data.isHome ?? false);
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          setError(err.message || 'Failed to load skills');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, token, cwd]);

  const counts = useMemo(() => {
    return {
      all: skills.length,
      workspace: skills.filter((s) => s.scope === 'workspace').length,
      global: skills.filter((s) => s.scope === 'global').length,
      builtin: skills.filter((s) => s.scope === 'builtin').length,
    };
  }, [skills]);

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (activeScope !== 'all' && skill.scope !== activeScope) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = skill.name.toLowerCase().includes(q);
        const matchesDesc = skill.description.toLowerCase().includes(q);
        const matchesTags = skill.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
        return matchesName || matchesDesc || matchesTags;
      }
      return true;
    });
  }, [skills, activeScope, searchQuery]);

  const handleCopyCmd = (skillName: string) => {
    const cmd = `/${skillName}`;
    navigator.clipboard?.writeText(cmd);
    setCopiedName(skillName);
    setTimeout(() => setCopiedName(null), 1500);
  };

  const handleInspect = async (skill: SkillItem) => {
    setInspectingSkill(skill);
    setInspectLoading(true);
    setInspectContent(null);
    setInspectError(null);
    setInspectCopied(false);

    if (!token) {
      setInspectError('Authentication token missing');
      setInspectLoading(false);
      return;
    }

    try {
      const data = await fetchSkillContent(token, skill.skillFile);
      setInspectContent(data.content);
    } catch (err: any) {
      setInspectError(err.message || 'Failed to fetch skill content');
    } finally {
      setInspectLoading(false);
    }
  };

  const handleRunSkill = (skillName: string) => {
    if (onExecuteSkill) {
      onExecuteSkill(`/${skillName} `);
      onClose();
    }
  };

  const handleScaffoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const trimmedName = scaffoldName.trim();
    if (!trimmedName) {
      setScaffoldError('Skill name is required');
      return;
    }

    setScaffoldLoading(true);
    setScaffoldError(null);

    try {
      const created = await scaffoldSkill(token, {
        name: trimmedName,
        description: scaffoldDesc.trim(),
        scope: scaffoldScope,
        cwd,
      });
      setSkills((prev) => [created, ...prev]);
      setShowScaffold(false);
      setScaffoldName('');
      setScaffoldDesc('');
      handleInspect(created);
    } catch (err: any) {
      setScaffoldError(err.message || 'Failed to scaffold skill');
    } finally {
      setScaffoldLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Skills Management Modal">
      <div
        className="cmd-palette-modal"
        style={{
          maxWidth: '820px',
          width: '95vw',
          height: 'min(640px, calc(100dvh - 40px))',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-primary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--accent-purple)', display: 'inline-flex', alignItems: 'center' }}>
              <PuzzleIcon size={16} />
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--text-bright)',
                letterSpacing: '0.8px',
              }}
            >
              SKILLS &amp; CAPABILITIES HUB
            </span>
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                borderRadius: '3px',
                backgroundColor: isHome ? 'rgba(167, 139, 250, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                color: isHome ? 'var(--accent-purple)' : 'var(--accent-cyan)',
                border: `1px solid ${isHome ? 'rgba(167, 139, 250, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {isHome ? <HomeIcon size={11} /> : <FolderIcon size={11} />}
              {isHome ? 'PERSONAL HOME' : workspacePath ? workspacePath.split('/').pop() || 'WORKSPACE' : 'WORKSPACE'}
            </span>
          </div>

          <button
            onClick={onClose}
            aria-label="Close skills modal"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              minWidth: '32px',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
            }}
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* Toolbar: Scope tabs & Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '10px 16px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          {/* Scope pills */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: 'ALL', count: counts.all },
                { id: 'workspace', label: 'PROJECT', count: counts.workspace },
                { id: 'global', label: 'GLOBAL', count: counts.global },
                { id: 'builtin', label: 'BUILT-IN', count: counts.builtin },
              ] as const
            ).map((tab) => {
              const active = activeScope === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveScope(tab.id)}
                  style={{
                    background: active ? 'var(--accent-purple)' : 'var(--bg-primary)',
                    color: active ? 'var(--btn-contrast-text)' : 'var(--text-secondary)',
                    border: '1px solid ' + (active ? 'var(--accent-purple)' : 'var(--border)'),
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      opacity: 0.85,
                      background: active ? 'rgba(0,0,0,0.2)' : 'var(--border)',
                      padding: '0 4px',
                      borderRadius: '8px',
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search and Scaffold actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px', justifyContent: 'flex-end' }}>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                flex: 1,
                maxWidth: '260px',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: '8px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                }}
              >
                <SearchIcon size={12} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                style={{
                  width: '100%',
                  padding: '5px 8px 5px 26px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            <button
              onClick={() => setShowScaffold(!showScaffold)}
              style={{
                background: showScaffold ? 'var(--accent-amber-bright)' : 'var(--bg-primary)',
                color: showScaffold ? 'var(--btn-contrast-text)' : 'var(--accent-cyan)',
                border: '1px solid ' + (showScaffold ? 'var(--accent-amber-bright)' : 'var(--border)'),
                borderRadius: '4px',
                padding: '5px 10px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
              }}
            >
              <PlusIcon size={12} />
              <span>{showScaffold ? 'Close Form' : '+ New Skill'}</span>
            </button>
          </div>
        </div>

        {/* Inline Scaffolding Form */}
        {showScaffold && (
          <form
            onSubmit={handleScaffoldSubmit}
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--bg-tertiary)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              SCAFFOLD NEW SKILL (SKILL.MD)
            </div>

            {scaffoldError && (
              <div
                style={{
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--accent-red)',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                {scaffoldError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  NAME (e.g. deploy-staging, run-benchmark)
                </label>
                <input
                  type="text"
                  value={scaffoldName}
                  onChange={(e) => setScaffoldName(e.target.value)}
                  placeholder="skill-name"
                  required
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ width: '160px' }}>
                <label style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  SCOPE / TARGET
                </label>
                <select
                  value={scaffoldScope}
                  onChange={(e) => setScaffoldScope(e.target.value as 'workspace' | 'global')}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                >
                  <option value="workspace">Project (.agents/skills)</option>
                  <option value="global">Global (~/.agents/skills)</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                DESCRIPTION &amp; PURPOSE
              </label>
              <input
                type="text"
                value={scaffoldDesc}
                onChange={(e) => setScaffoldDesc(e.target.value)}
                placeholder="Brief description of when Antigravity should use this skill"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowScaffold(false)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={scaffoldLoading}
                style={{
                  background: 'var(--accent-cyan)',
                  border: 'none',
                  color: 'var(--btn-contrast-text)',
                  borderRadius: '4px',
                  padding: '5px 14px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  cursor: scaffoldLoading ? 'wait' : 'pointer',
                }}
              >
                {scaffoldLoading ? 'Creating...' : 'Create Skill'}
              </button>
            </div>
          </form>
        )}

        {/* Main Body: List + Inspector Split */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* Skills List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {loading ? (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                Scanning workspace and global skills...
              </div>
            ) : error ? (
              <div style={{ padding: '20px', color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                Error: {error}
              </div>
            ) : filteredSkills.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                No skills matching the selected criteria.
              </div>
            ) : (
              filteredSkills.map((skill) => {
                const isWorkspace = skill.scope === 'workspace';
                const isGlobal = skill.scope === 'global';

                const scopeBadgeColor = isWorkspace
                  ? 'var(--accent-cyan)'
                  : isGlobal
                  ? 'var(--accent-purple)'
                  : 'var(--accent-green)';

                const scopeBg = isWorkspace
                  ? 'rgba(56, 189, 248, 0.1)'
                  : isGlobal
                  ? 'rgba(167, 139, 250, 0.1)'
                  : 'rgba(34, 197, 94, 0.1)';

                const isInspecting = inspectingSkill?.name === skill.name && inspectingSkill?.scope === skill.scope;

                return (
                  <div
                    key={`${skill.scope}-${skill.name}`}
                    style={{
                      backgroundColor: isInspecting ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                      border: `1px solid ${isInspecting ? scopeBadgeColor : 'var(--border)'}`,
                      borderRadius: '6px',
                      padding: '10px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--text-bright)',
                          }}
                        >
                          /{skill.name}
                        </span>

                        <span
                          style={{
                            fontSize: '9px',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            color: scopeBadgeColor,
                            backgroundColor: scopeBg,
                            border: `1px solid ${scopeBadgeColor}`,
                            textTransform: 'uppercase',
                          }}
                        >
                          {skill.scope}
                        </span>

                        {skill.hasScripts && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontFamily: 'var(--font-mono)',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              color: 'var(--accent-amber-bright)',
                              backgroundColor: 'rgba(245, 158, 11, 0.1)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                            }}
                          >
                            scripts/
                          </span>
                        )}

                        {skill.hasResources && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontFamily: 'var(--font-mono)',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              color: 'var(--text-secondary)',
                              backgroundColor: 'var(--bg-secondary)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            resources/
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleCopyCmd(skill.name)}
                          title="Copy slash command"
                          style={{
                            background: 'none',
                            border: '1px solid var(--border)',
                            borderRadius: '3px',
                            color: copiedName === skill.name ? 'var(--accent-green)' : 'var(--text-secondary)',
                            padding: '3px 6px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {copiedName === skill.name ? <CheckIcon size={10} /> : <CopyIcon size={10} />}
                          <span>{copiedName === skill.name ? 'COPIED' : 'COPY'}</span>
                        </button>

                        <button
                          onClick={() => handleInspect(skill)}
                          title="Inspect SKILL.md instructions"
                          style={{
                            background: isInspecting ? scopeBg : 'none',
                            border: `1px solid ${isInspecting ? scopeBadgeColor : 'var(--border)'}`,
                            borderRadius: '3px',
                            color: isInspecting ? scopeBadgeColor : 'var(--text-primary)',
                            padding: '3px 8px',
                            fontSize: '10px',
                            fontFamily: 'var(--font-mono)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <CodeIcon size={11} />
                          <span>INSPECT</span>
                        </button>

                        {onExecuteSkill && (
                          <button
                            onClick={() => handleRunSkill(skill.name)}
                            title="Execute / insert command into chat"
                            style={{
                              background: 'var(--accent-purple)',
                              border: 'none',
                              borderRadius: '3px',
                              color: 'var(--btn-contrast-text)',
                              padding: '3px 8px',
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <BoltIcon size={10} />
                            <span>RUN</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                      }}
                    >
                      {skill.description}
                    </div>

                    <div
                      style={{
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {skill.skillFile}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Inspector Side Drawer */}
          {inspectingSkill && (
            <div
              style={{
                width: '380px',
                maxWidth: '50%',
                borderLeft: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Drawer Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                  <CodeIcon size={12} color="var(--accent-purple)" />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-bright)',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                    }}
                  >
                    /{inspectingSkill.name} (SKILL.md)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={() => {
                      if (inspectContent) {
                        navigator.clipboard?.writeText(inspectContent);
                        setInspectCopied(true);
                        setTimeout(() => setInspectCopied(false), 1500);
                      }
                    }}
                    title="Copy SKILL.md markdown"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: inspectCopied ? 'var(--accent-green)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '3px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {inspectCopied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                  </button>

                  <button
                    onClick={() => setInspectingSkill(null)}
                    title="Close preview"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '3px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
              </div>

              {/* Drawer Content */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.5,
                }}
              >
                {inspectLoading ? (
                  <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
                    Loading instructions...
                  </div>
                ) : inspectError ? (
                  <div style={{ color: 'var(--accent-red)', padding: '10px' }}>
                    {inspectError}
                  </div>
                ) : inspectContent ? (
                  <MarkdownRenderer content={inspectContent} />
                ) : (
                  <div style={{ color: 'var(--text-secondary)' }}>No content found.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
