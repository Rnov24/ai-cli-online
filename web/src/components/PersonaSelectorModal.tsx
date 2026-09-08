import { useState, useEffect, useMemo } from 'react';
import {
  fetchPersonas,
  createCustomPersona,
  setSessionPersona,
  type PersonaDefinition,
} from '../api/personas';
import {
  RobotIcon,
  LaptopIcon,
  CloseIcon,
  SearchIcon,
  PlusIcon,
  CheckIcon,
  CodeIcon,
  TargetIcon,
  ShieldIcon,
  BoltIcon,
} from './icons';

export interface PersonaSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePersonaId: string;
  onSelectPersona: (persona: PersonaDefinition) => void;
  token: string | null;
  sessionId?: string;
}

export function PersonaSelectorModal({
  isOpen,
  onClose,
  activePersonaId,
  onSelectPersona,
  token,
  sessionId,
}: PersonaSelectorModalProps) {
  const [personas, setPersonas] = useState<PersonaDefinition[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<'all' | 'coding' | 'assistant' | 'custom'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedDirectiveId, setExpandedDirectiveId] = useState<string | null>(null);

  // Custom persona form state
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [createId, setCreateId] = useState<string>('');
  const [createName, setCreateName] = useState<string>('');
  const [createRole, setCreateRole] = useState<string>('');
  const [createIcon, setCreateIcon] = useState<string>('robot');
  const [createColor, setCreateColor] = useState<string>('var(--accent-blue, #3b82f6)');
  const [createDesc, setCreateDesc] = useState<string>('');
  const [createDirective, setCreateDirective] = useState<string>('');
  const [createTags, setCreateTags] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [switchLoadingId, setSwitchLoadingId] = useState<string | null>(null);

  const loadPersonas = () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    fetchPersonas(token, sessionId)
      .then((data) => {
        setPersonas(data.personas || []);
        setLoading(false);
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load personas');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (!isOpen || !token) return;
    loadPersonas();
    setShowCreateForm(false);
    setCreateError(null);
  }, [isOpen, token, sessionId]);

  const filteredPersonas = useMemo(() => {
    return personas.filter((p) => {
      // Category filter
      if (activeCategory === 'coding') {
        const isCoding = p.id === 'coding-agent' || p.id === 'architect' || p.id === 'pair-programmer' || p.id === 'sre' || p.tags?.includes('coding');
        if (!isCoding) return false;
      } else if (activeCategory === 'assistant') {
        const isAssistant = p.id === 'agentic-assistant' || p.id === 'auditor' || p.tags?.includes('assistant');
        if (!isAssistant) return false;
      } else if (activeCategory === 'custom') {
        if (p.isPreset) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchRole = p.role.toLowerCase().includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        const matchTags = p.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
        return matchName || matchRole || matchDesc || matchTags;
      }

      return true;
    });
  }, [personas, activeCategory, searchQuery]);

  const handleActivate = async (persona: PersonaDefinition) => {
    if (!token) return;

    if (sessionId) {
      setSwitchLoadingId(persona.id);
      try {
        await setSessionPersona(token, sessionId, persona.id);
      } catch (err) {
        console.warn('Failed to persist session persona:', err);
      } finally {
        setSwitchLoadingId(null);
      }
    }

    onSelectPersona(persona);
    onClose();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || createLoading) return;

    if (!createId.trim() || !createName.trim() || !createDirective.trim()) {
      setCreateError('ID, Name, and Directive are required.');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    const tagsArray = createTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      const created = await createCustomPersona(token, {
        id: createId.trim().toLowerCase(),
        name: createName.trim(),
        role: createRole.trim() || 'Custom AI Persona',
        icon: createIcon,
        color: createColor,
        description: createDesc.trim(),
        directive: createDirective.trim(),
        tags: tagsArray,
      });

      setPersonas((prev) => [...prev, created]);
      setShowCreateForm(false);
      setCreateId('');
      setCreateName('');
      setCreateRole('');
      setCreateDesc('');
      setCreateDirective('');
      setCreateTags('');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create persona');
    } finally {
      setCreateLoading(false);
    }
  };

  const renderPersonaIcon = (icon: string, color: string) => {
    switch (icon) {
      case 'code':
        return <CodeIcon size={16} color={color} />;
      case 'target':
      case 'compass':
        return <TargetIcon size={16} color={color} />;
      case 'shield':
        return <ShieldIcon size={16} color={color} />;
      case 'laptop':
        return <LaptopIcon size={16} color={color} />;
      case 'terminal':
        return <BoltIcon size={16} color={color} />;
      case 'robot':
      default:
        return <RobotIcon size={16} color={color} />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agent Personas & Operational Roles"
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
          width: 'min(840px, calc(100vw - 24px))',
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
            backgroundColor: 'var(--bg-surface, #161b26)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <RobotIcon size={18} color="var(--accent-purple, #a855f7)" />
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
                AGENT PERSONAS & OPERATIONAL ROLES
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(168, 85, 247, 0.15)',
                  color: 'var(--accent-purple, #a855f7)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontWeight: 600,
                }}
              >
                {personas.length} AVAILABLE
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
          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-input)', padding: '2px', borderRadius: '4px' }}>
            {(['all', 'coding', 'assistant', 'custom'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '3px',
                  border: 'none',
                  backgroundColor: activeCategory === cat ? 'var(--bg-elevated, #161b26)' : 'transparent',
                  color: activeCategory === cat ? 'var(--accent-cyan, #00f0ff)' : 'var(--text-muted, #64748b)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search Box */}
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
              minWidth: '160px',
            }}
          >
            <SearchIcon size={12} color="var(--text-muted, #64748b)" />
            <input
              type="text"
              placeholder="Filter by name, role, tags..."
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
            onClick={() => setShowCreateForm((prev) => !prev)}
            style={{
              padding: '5px 12px',
              backgroundColor: showCreateForm
                ? 'var(--accent-purple, #a855f7)'
                : 'rgba(168, 85, 247, 0.15)',
              border: '1px solid var(--accent-purple, #a855f7)',
              borderRadius: '4px',
              color: showCreateForm ? '#ffffff' : 'var(--accent-purple, #a855f7)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {showCreateForm ? <CloseIcon size={12} /> : <PlusIcon size={12} />}
            <span>{showCreateForm ? 'CANCEL' : 'CUSTOM PERSONA'}</span>
          </button>
        </div>

        {/* Custom Persona Creation Form */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateSubmit}
            style={{
              padding: '16px 18px',
              backgroundColor: 'rgba(168, 85, 247, 0.05)',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-purple, #a855f7)' }}>
              CREATE SPECIALIZED AGENT PERSONA
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
              <input
                type="text"
                placeholder="ID: e.g. tech-lead (slug)"
                value={createId}
                onChange={(e) => setCreateId(e.target.value)}
                required
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="text"
                placeholder="Name: e.g. Technical Lead"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                required
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="text"
                placeholder="Role: e.g. Architectural PR Guidance"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-primary)',
                }}
              />
              <select
                value={createIcon}
                onChange={(e) => setCreateIcon(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="robot">Icon: Robot</option>
                <option value="laptop">Icon: Terminal/Laptop</option>
                <option value="bolt">Icon: Bolt</option>
                <option value="target">Icon: Target</option>
                <option value="stethoscope">Icon: Stethoscope</option>
                <option value="shield">Icon: Shield</option>
                <option value="clipboard">Icon: Clipboard</option>
              </select>
              <input
                type="text"
                placeholder="Color: e.g. #a855f7"
                value={createColor}
                onChange={(e) => setCreateColor(e.target.value)}
                style={{
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <input
              type="text"
              placeholder="Description: short explanation of persona mindset"
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '6px 10px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-primary)',
              }}
            />

            <textarea
              placeholder="Injected System Directive: prompt instructions defining persona behavioral rules and priorities..."
              value={createDirective}
              onChange={(e) => setCreateDirective(e.target.value)}
              required
              rows={4}
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                padding: '8px 10px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-primary)',
                resize: 'vertical',
              }}
            />

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Tags: comma-separated (e.g. lead, review, design)"
                value={createTags}
                onChange={(e) => setCreateTags(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '200px',
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
                disabled={createLoading}
                style={{
                  padding: '6px 16px',
                  backgroundColor: 'var(--accent-purple, #a855f7)',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: createLoading ? 'not-allowed' : 'pointer',
                  opacity: createLoading ? 0.6 : 1,
                }}
              >
                {createLoading ? 'SAVING...' : 'SAVE PERSONA'}
              </button>
            </div>

            {createError && (
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  color: 'var(--accent-red, #ef4444)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {createError}
              </div>
            )}
          </form>
        )}

        {/* Personas Grid */}
        <div
          style={{
            padding: '16px 18px',
            overflowY: 'auto',
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '12px',
            alignContent: 'start',
          }}
        >
          {loading && personas.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '40px 0',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              Loading agent personas...
            </div>
          ) : error ? (
            <div
              style={{
                gridColumn: '1 / -1',
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
          ) : filteredPersonas.length === 0 ? (
            <div
              style={{
                gridColumn: '1 / -1',
                padding: '40px 0',
                textAlign: 'center',
                color: 'var(--text-muted, #64748b)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              No personas found matching your search.
            </div>
          ) : (
            filteredPersonas.map((persona) => {
              const isActive = persona.id === activePersonaId;
              const isExpanded = expandedDirectiveId === persona.id;
              const isSwitching = switchLoadingId === persona.id;

              return (
                <div
                  key={persona.id}
                  data-testid={`persona-card-${persona.id}`}
                  style={{
                    backgroundColor: 'var(--bg-elevated, #161b26)',
                    border: isActive
                      ? '1px solid var(--accent-cyan, #00f0ff)'
                      : '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: isActive ? '0 0 12px rgba(0, 240, 255, 0.15)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Header Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--bg-input, rgba(255, 255, 255, 0.05))',
                          border: `1px solid ${persona.color || 'var(--accent-blue, #3b82f6)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {renderPersonaIcon(persona.icon, persona.color || 'var(--accent-blue, #3b82f6)')}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              fontFamily: 'var(--font-mono, monospace)',
                            }}
                          >
                            {persona.name}
                          </span>
                          <span
                            style={{
                              fontSize: '9px',
                              padding: '1px 4px',
                              borderRadius: '2px',
                              backgroundColor: persona.isPreset
                                ? 'rgba(59, 130, 246, 0.12)'
                                : 'rgba(168, 85, 247, 0.12)',
                              color: persona.isPreset
                                ? 'var(--accent-blue, #3b82f6)'
                                : 'var(--accent-purple, #a855f7)',
                              fontFamily: 'var(--font-mono, monospace)',
                              fontWeight: 600,
                            }}
                          >
                            {persona.isPreset ? 'PRESET' : 'CUSTOM'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                          {persona.role}
                        </div>
                      </div>
                    </div>

                    {isActive && (
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '2px 6px',
                          borderRadius: '3px',
                          backgroundColor: 'rgba(0, 240, 255, 0.15)',
                          color: 'var(--accent-cyan, #00f0ff)',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontWeight: 700,
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {persona.description}
                  </div>

                  {/* Tags */}
                  {persona.tags && persona.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {persona.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: '9px',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: 'var(--bg-input, rgba(255, 255, 255, 0.05))',
                            border: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))',
                            color: 'var(--text-muted, #64748b)',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Directive Preview */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono, monospace)',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        maxHeight: '120px',
                        overflowY: 'auto',
                      }}
                    >
                      {persona.directive}
                    </div>
                  )}

                  {/* Card Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '4px' }}>
                    <button
                      onClick={() => setExpandedDirectiveId((prev) => (prev === persona.id ? null : persona.id))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted, #64748b)',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono, monospace)',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      {isExpanded ? '▴ HIDE DIRECTIVE' : '▾ SHOW DIRECTIVE'}
                    </button>

                    <button
                      onClick={() => handleActivate(persona)}
                      disabled={isActive || isSwitching}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '4px',
                        border: isActive
                          ? '1px solid var(--accent-cyan, #00f0ff)'
                          : '1px solid var(--border-color)',
                        backgroundColor: isActive
                          ? 'rgba(0, 240, 255, 0.15)'
                          : 'var(--bg-surface)',
                        color: isActive ? 'var(--accent-cyan, #00f0ff)' : 'var(--text-primary)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: isActive || isSwitching ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive && !isSwitching) {
                          e.currentTarget.style.borderColor = 'var(--accent-cyan, #00f0ff)';
                          e.currentTarget.style.color = 'var(--accent-cyan, #00f0ff)';
                          e.currentTarget.style.backgroundColor = 'rgba(0, 240, 255, 0.12)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive && !isSwitching) {
                          e.currentTarget.style.borderColor = 'var(--border-color, #232a3b)';
                          e.currentTarget.style.color = 'var(--text-primary, #e2e8f0)';
                          e.currentTarget.style.backgroundColor = 'var(--bg-input, #0f1219)';
                        }
                      }}
                    >
                      {isActive ? (
                        <>
                          <CheckIcon size={10} color="var(--accent-cyan, #00f0ff)" />
                          <span>CURRENT</span>
                        </>
                      ) : (
                        <span>{isSwitching ? 'ACTIVATING...' : 'ACTIVATE PERSONA'}</span>
                      )}
                    </button>
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
