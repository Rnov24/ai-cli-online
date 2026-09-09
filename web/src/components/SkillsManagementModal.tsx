import { useState, useEffect, useMemo, useRef } from 'react';
import {
  fetchSkills,
  fetchSkillContent,
  scaffoldSkill,
  searchSkills,
  installSkill,
  deleteSkill,
  syncSkills,
  type SkillItem,
  type RemoteSkillItem,
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
  TrashIcon,
  SyncIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from './icons';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface SkillsManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  cwd?: string;
  token: string | null;
  onExecuteSkill?: (cmd: string) => void;
}

const POPULAR_CATEGORIES = [
  'Anti-Slop',
  'React',
  'Git',
  'Testing',
  'Review',
  'PRD',
  'DevOps',
];

interface PaginationToolbarProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newPageSize: number) => void;
}

function PaginationToolbar({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: PaginationToolbarProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = total === 0 ? 0 : Math.min(total, page * pageSize);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 16px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        minHeight: '44px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          {total === 0 ? 'SHOWING 0 OF 0 SKILLS' : `SHOWING ${start}-${end} OF ${total} SKILLS`}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>|</span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontWeight: 500,
          }}
        >
          PAGE {page} OF {totalPages}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <select
          value={pageSize}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
          }}
          aria-label="Items per page"
          style={{
            padding: '4px 8px',
            height: '32px',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value={10}>10 / page</option>
          <option value={15}>15 / page</option>
          <option value={25}>25 / page</option>
          <option value={50}>50 / page</option>
        </select>

        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            height: '32px',
            minHeight: '32px',
            backgroundColor: page <= 1 ? 'transparent' : 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: page <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
            opacity: page <= 1 ? 0.5 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          <ChevronLeftIcon size={12} />
          <span>PREV</span>
        </button>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            height: '32px',
            minHeight: '32px',
            backgroundColor: page >= totalPages ? 'transparent' : 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 700,
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            opacity: page >= totalPages ? 0.5 : 1,
            transition: 'all 0.15s ease',
          }}
        >
          <span>NEXT</span>
          <ChevronRightIcon size={12} />
        </button>
      </div>
    </div>
  );
}

export function SkillsManagementModal({
  isOpen,
  onClose,
  cwd,
  token,
  onExecuteSkill,
}: SkillsManagementModalProps) {
  const [activeView, setActiveView] = useState<'installed' | 'explore'>('installed');
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [isHome, setIsHome] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [installedPage, setInstalledPage] = useState<number>(1);
  const [installedPageSize, setInstalledPageSize] = useState<number>(15);

  const [explorePage, setExplorePage] = useState<number>(1);
  const [explorePageSize, setExplorePageSize] = useState<number>(10);

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

  // Explore / Registry state
  const [exploreQuery, setExploreQuery] = useState<string>('');
  const [remoteSkills, setRemoteSkills] = useState<RemoteSkillItem[]>([]);
  const [exploreLoading, setExploreLoading] = useState<boolean>(false);
  const [exploreError, setExploreError] = useState<string | null>(null);
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);

  // Manual installer state
  const [manualSource, setManualSource] = useState<string>('');
  const [manualScope, setManualScope] = useState<'workspace' | 'global'>('workspace');
  const [manualLoading, setManualLoading] = useState<boolean>(false);
  const [manualError, setManualError] = useState<string | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState<boolean>(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  // Toast / feedback banner
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const bannerTimerRef = useRef<any>(null);

  const showBanner = (type: 'success' | 'error' | 'info', text: string) => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBannerMsg({ type, text });
    bannerTimerRef.current = setTimeout(() => setBannerMsg(null), 5000);
  };

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  // Listen to open events from CommandPalette
  useEffect(() => {
    const handleOpenEvent = (e: any) => {
      if (e.detail?.view === 'explore' || e.detail?.view === 'installed') {
        setActiveView(e.detail.view);
      }
    };
    window.addEventListener('agy:open-skills-modal', handleOpenEvent);
    return () => window.removeEventListener('agy:open-skills-modal', handleOpenEvent);
  }, []);



  // Load installed skills
  const loadSkills = () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchSkills(token, cwd)
      .then((data) => {
        setSkills(data.skills || []);
        setWorkspacePath(data.workspacePath || '');
        setIsHome(data.isHome ?? false);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load skills');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isOpen && token) {
      loadSkills();
    }
  }, [isOpen, token, cwd]);

  // Debounced search on explore query
  useEffect(() => {
    if (!isOpen || activeView !== 'explore' || !token) return;

    setExploreLoading(true);
    setExploreError(null);

    const timer = setTimeout(() => {
      searchSkills(token, exploreQuery, 20)
        .then((res) => {
          setRemoteSkills(res.skills || []);
          setExploreLoading(false);
        })
        .catch((err: any) => {
          setExploreError(err.message || 'Failed to query skills registry');
          setExploreLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [isOpen, activeView, exploreQuery, token]);

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

  // Reset pagination on filter / query changes
  useEffect(() => {
    setInstalledPage(1);
  }, [activeScope, searchQuery]);

  useEffect(() => {
    setExplorePage(1);
  }, [exploreQuery]);

  // Clamp pagination if total items shrink
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredSkills.length / installedPageSize));
    if (installedPage > maxPage) {
      setInstalledPage(maxPage);
    }
  }, [filteredSkills.length, installedPageSize, installedPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(remoteSkills.length / explorePageSize));
    if (explorePage > maxPage) {
      setExplorePage(maxPage);
    }
  }, [remoteSkills.length, explorePageSize, explorePage]);

  const totalInstalled = filteredSkills.length;
  const totalInstalledPages = Math.max(1, Math.ceil(totalInstalled / installedPageSize));
  const paginatedSkills = useMemo(() => {
    const start = (installedPage - 1) * installedPageSize;
    return filteredSkills.slice(start, start + installedPageSize);
  }, [filteredSkills, installedPage, installedPageSize]);

  const totalExplore = remoteSkills.length;
  const totalExplorePages = Math.max(1, Math.ceil(totalExplore / explorePageSize));
  const paginatedRemoteSkills = useMemo(() => {
    const start = (explorePage - 1) * explorePageSize;
    return remoteSkills.slice(start, start + explorePageSize);
  }, [remoteSkills, explorePage, explorePageSize]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isInput) {
        if (e.key === '[') {
          e.preventDefault();
          if (activeView === 'installed') {
            setInstalledPage((p) => Math.max(1, p - 1));
          } else {
            setExplorePage((p) => Math.max(1, p - 1));
          }
        } else if (e.key === ']') {
          e.preventDefault();
          if (activeView === 'installed') {
            setInstalledPage((p) => Math.min(totalInstalledPages, p + 1));
          } else {
            setExplorePage((p) => Math.min(totalExplorePages, p + 1));
          }
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, activeView, totalInstalledPages, totalExplorePages]);

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
      showBanner('success', `Created skill /${created.name}`);
      handleInspect(created);
    } catch (err: any) {
      setScaffoldError(err.message || 'Failed to scaffold skill');
    } finally {
      setScaffoldLoading(false);
    }
  };

  const handleInstallRemote = async (remote: RemoteSkillItem) => {
    if (!token) return;
    setInstallingSkillId(remote.id);
    try {
      const installed = await installSkill(token, {
        source: remote.source,
        skillName: remote.skillId || remote.name,
        scope: 'workspace',
        cwd,
      });
      setSkills((prev) => [installed, ...prev]);
      showBanner('success', `Installed /${installed.name} from ${remote.source}`);
    } catch (err: any) {
      showBanner('error', `Failed to install /${remote.name}: ${err.message}`);
    } finally {
      setInstallingSkillId(null);
    }
  };

  const handleManualInstallSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const src = manualSource.trim();
    if (!src) {
      setManualError('Source repository or package slug is required');
      return;
    }

    setManualLoading(true);
    setManualError(null);

    try {
      const installed = await installSkill(token, {
        source: src,
        scope: manualScope,
        cwd,
      });
      setSkills((prev) => [installed, ...prev]);
      setManualSource('');
      showBanner('success', `Installed /${installed.name} from ${src}`);
      setActiveView('installed');
      handleInspect(installed);
    } catch (err: any) {
      setManualError(err.message || 'Failed to install skill');
    } finally {
      setManualLoading(false);
    }
  };

  const handleDeleteSkill = async (skill: SkillItem) => {
    if (!token) return;
    if (skill.scope === 'builtin') return;

    if (!window.confirm(`Are you sure you want to uninstall /${skill.name}?`)) {
      return;
    }

    setDeletingName(skill.name);
    try {
      await deleteSkill(token, skill.name, skill.scope, cwd);
      setSkills((prev) => prev.filter((s) => !(s.name === skill.name && s.scope === skill.scope)));
      if (inspectingSkill?.name === skill.name && inspectingSkill?.scope === skill.scope) {
        setInspectingSkill(null);
      }
      showBanner('success', `Uninstalled /${skill.name}`);
    } catch (err: any) {
      showBanner('error', `Failed to delete /${skill.name}: ${err.message}`);
    } finally {
      setDeletingName(null);
    }
  };

  const handleSync = async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const res = await syncSkills(token, cwd);
      let msg = `Synced ${res.synced} skills from skills-lock.json`;
      if (res.restored && res.restored.length > 0) {
        msg += ` (${res.restored.length} restored: ${res.restored.join(', ')})`;
      }
      showBanner('success', msg);
      loadSkills();
    } catch (err: any) {
      showBanner('error', `Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Skills Management Modal">
      <div
        className="cmd-palette-modal"
        style={{
          maxWidth: '860px',
          width: '95vw',
          height: 'min(660px, calc(100dvh - 40px))',
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* View switcher tabs in header */}
            <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '4px', padding: '2px', border: '1px solid var(--border)' }}>
              <button
                onClick={() => setActiveView('installed')}
                style={{
                  background: activeView === 'installed' ? 'var(--accent-purple)' : 'transparent',
                  color: activeView === 'installed' ? 'var(--btn-contrast-text)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: activeView === 'installed' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span>INSTALLED</span>
                <span style={{ fontSize: '10px', opacity: 0.85 }}>({skills.length})</span>
              </button>
              <button
                onClick={() => setActiveView('explore')}
                style={{
                  background: activeView === 'explore' ? 'var(--accent-purple)' : 'transparent',
                  color: activeView === 'explore' ? 'var(--btn-contrast-text)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: activeView === 'explore' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <span>EXPLORE SKILLS.SH</span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 4px',
                    borderRadius: '3px',
                    background: activeView === 'explore' ? 'rgba(0,0,0,0.25)' : 'rgba(56, 189, 248, 0.2)',
                    color: activeView === 'explore' ? '#fff' : 'var(--accent-cyan)',
                  }}
                >
                  600k+
                </span>
              </button>
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
        </div>

        {/* Feedback / Notification Banner */}
        {bannerMsg && (
          <div
            style={{
              padding: '8px 16px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor:
                bannerMsg.type === 'success'
                  ? 'rgba(34, 197, 94, 0.12)'
                  : bannerMsg.type === 'error'
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(56, 189, 248, 0.12)',
              color:
                bannerMsg.type === 'success'
                  ? 'var(--accent-green)'
                  : bannerMsg.type === 'error'
                  ? 'var(--accent-red)'
                  : 'var(--accent-cyan)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span>{bannerMsg.text}</span>
            <button
              onClick={() => setBannerMsg(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }}
            >
              <CloseIcon size={11} />
            </button>
          </div>
        )}

        {/* INSTALLED VIEW CONTENT */}
        {activeView === 'installed' && (
          <>
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

              {/* Actions: Search, Sync, New Skill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px', justifyContent: 'flex-end' }}>
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                    maxWidth: '240px',
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
                  onClick={handleSync}
                  disabled={syncing}
                  title="Reconcile and restore skills from skills-lock.json"
                  style={{
                    background: 'var(--bg-primary)',
                    color: 'var(--accent-purple)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    cursor: syncing ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <SyncIcon size={12} />
                  <span>{syncing ? 'SYNCING...' : 'SYNC'}</span>
                </button>

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
                  {showScaffold ? <CloseIcon size={12} /> : <PlusIcon size={12} />}
                  <span>{showScaffold ? 'Close Form' : 'New Skill'}</span>
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
                  paginatedSkills.map((skill) => {
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

                            {skill.scope !== 'builtin' && (
                              <button
                                onClick={() => handleDeleteSkill(skill)}
                                disabled={deletingName === skill.name}
                                title="Uninstall skill"
                                style={{
                                  background: 'none',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  borderRadius: '3px',
                                  color: 'var(--accent-red)',
                                  padding: '3px 6px',
                                  fontSize: '10px',
                                  fontFamily: 'var(--font-mono)',
                                  cursor: deletingName === skill.name ? 'wait' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <TrashIcon size={10} />
                                <span>{deletingName === skill.name ? 'DELETING...' : 'UNINSTALL'}</span>
                              </button>
                            )}

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

            <PaginationToolbar
              page={installedPage}
              pageSize={installedPageSize}
              total={totalInstalled}
              totalPages={totalInstalledPages}
              onPageChange={setInstalledPage}
              onPageSizeChange={(newSize) => {
                setInstalledPageSize(newSize);
                setInstalledPage(1);
              }}
            />
          </>
        )}

        {/* EXPLORE SKILLS.SH VIEW CONTENT */}
        {activeView === 'explore' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Search and Category Bar */}
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    flex: 1,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: '10px',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <SearchIcon size={14} />
                  </span>
                  <input
                    type="text"
                    value={exploreQuery}
                    onChange={(e) => setExploreQuery(e.target.value)}
                    placeholder="Search 600k+ community skills (e.g. anti-slop, testing, react, prd)..."
                    style={{
                      width: '100%',
                      padding: '7px 10px 7px 32px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  {exploreQuery && (
                    <button
                      onClick={() => setExploreQuery('')}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      <CloseIcon size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Category Chips */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                  POPULAR:
                </span>
                {POPULAR_CATEGORIES.map((cat) => {
                  const isSelected = exploreQuery.toLowerCase() === cat.toLowerCase();
                  return (
                    <button
                      key={cat}
                      onClick={() => setExploreQuery(cat.toLowerCase())}
                      style={{
                        background: isSelected ? 'rgba(167, 139, 250, 0.25)' : 'var(--bg-primary)',
                        color: isSelected ? 'var(--accent-purple)' : 'var(--text-secondary)',
                        border: `1px solid ${isSelected ? 'var(--accent-purple)' : 'var(--border)'}`,
                        borderRadius: '12px',
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        cursor: 'pointer',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Direct Manual Installer Section */}
            <form
              onSubmit={handleManualInstallSubmit}
              style={{
                padding: '10px 16px',
                backgroundColor: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                DIRECT INSTALL:
              </span>
              <input
                type="text"
                value={manualSource}
                onChange={(e) => setManualSource(e.target.value)}
                placeholder="owner/repo or package slug (e.g. vercel-labs/agent-skills)"
                style={{
                  flex: 1,
                  minWidth: '220px',
                  padding: '5px 8px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
              <select
                value={manualScope}
                onChange={(e) => setManualScope(e.target.value as 'workspace' | 'global')}
                style={{
                  padding: '5px 8px',
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
              <button
                type="submit"
                disabled={manualLoading}
                style={{
                  background: 'var(--accent-cyan)',
                  border: 'none',
                  color: 'var(--btn-contrast-text)',
                  borderRadius: '4px',
                  padding: '5px 12px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  cursor: manualLoading ? 'wait' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {manualLoading ? 'INSTALLING...' : 'INSTALL FROM GITHUB / SKILLS.SH'}
              </button>
              {manualError && (
                <div style={{ width: '100%', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--accent-red)' }}>
                  {manualError}
                </div>
              )}
            </form>

            {/* Remote Search Results List */}
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
              {exploreLoading ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  Querying skills.sh registry...
                </div>
              ) : exploreError ? (
                <div style={{ padding: '20px', color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  Error querying registry: {exploreError}
                </div>
              ) : remoteSkills.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                  No skills found on skills.sh for &ldquo;{exploreQuery}&rdquo;.
                </div>
              ) : (
                paginatedRemoteSkills.map((remote) => {
                  const isInstalled = skills.some((s) => s.name.toLowerCase() === (remote.skillId || remote.name).toLowerCase());
                  const isInstalling = installingSkillId === remote.id;

                  return (
                    <div
                      key={remote.id || remote.name}
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: 'var(--text-bright)',
                            }}
                          >
                            /{remote.name || remote.skillId}
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontFamily: 'var(--font-mono)',
                              color: 'var(--accent-cyan)',
                              backgroundColor: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                            }}
                          >
                            {remote.source}
                          </span>
                          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            {remote.installs.toLocaleString()} installs
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          <a
                            href={`https://skills.sh/${remote.id}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
                            onMouseOver={(e) => ((e.target as HTMLElement).style.textDecoration = 'underline')}
                            onMouseOut={(e) => ((e.target as HTMLElement).style.textDecoration = 'none')}
                          >
                            https://skills.sh/{remote.id} ↗
                          </a>
                        </div>
                      </div>

                      <div>
                        {isInstalled ? (
                          <button
                            disabled
                            style={{
                              background: 'rgba(34, 197, 94, 0.15)',
                              border: '1px solid var(--accent-green)',
                              borderRadius: '4px',
                              color: 'var(--accent-green)',
                              padding: '5px 12px',
                              fontSize: '11px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'default',
                            }}
                          >
                            <CheckIcon size={12} />
                            <span>INSTALLED</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleInstallRemote(remote)}
                            disabled={isInstalling}
                            style={{
                              background: 'var(--accent-purple)',
                              border: 'none',
                              borderRadius: '4px',
                              color: 'var(--btn-contrast-text)',
                              padding: '5px 14px',
                              fontSize: '11px',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              cursor: isInstalling ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span>{isInstalling ? 'INSTALLING...' : 'INSTALL'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <PaginationToolbar
              page={explorePage}
              pageSize={explorePageSize}
              total={totalExplore}
              totalPages={totalExplorePages}
              onPageChange={setExplorePage}
              onPageSizeChange={(newSize) => {
                setExplorePageSize(newSize);
                setExplorePage(1);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
