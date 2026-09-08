import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PersonaSelectorModal } from './PersonaSelectorModal';
import {
  fetchPersonas,
  createCustomPersona,
  setSessionPersona,
  type PersonaDefinition,
} from '../api/personas';

vi.mock('../api/personas', () => ({
  fetchPersonas: vi.fn(),
  createCustomPersona: vi.fn(),
  setSessionPersona: vi.fn(),
}));

const mockFetchPersonas = vi.mocked(fetchPersonas);
const mockCreateCustomPersona = vi.mocked(createCustomPersona);
const mockSetSessionPersona = vi.mocked(setSessionPersona);

const mockPersonas: PersonaDefinition[] = [
  {
    id: 'coding-agent',
    name: 'Coding Agent',
    role: 'Autonomous Software Engineering',
    icon: 'code',
    color: 'var(--accent-blue)',
    description: 'Full software engineering lifecycle: planning and testing.',
    directive: 'You are operating as an Autonomous AI Coding Agent.',
    isPreset: true,
    tags: ['coding', 'plan', 'git'],
  },
  {
    id: 'agentic-assistant',
    name: 'Agentic Assistant',
    role: 'Personal Productivity',
    icon: 'robot',
    color: 'var(--accent-cyan)',
    description: 'Autonomous assistant for personal tasks and diagnostics.',
    directive: 'You are operating as an autonomous Agentic Assistant.',
    isPreset: true,
    tags: ['assistant', 'schedule'],
  },
  {
    id: 'architect',
    name: 'System Architect',
    role: 'System Architecture & Domain Modeling',
    icon: 'target',
    color: 'var(--accent-purple)',
    description: 'High-level system design and modular decoupling.',
    directive: 'You are operating as a Senior System Architect.',
    isPreset: true,
    tags: ['architecture', 'design'],
  },
];

describe('PersonaSelectorModal', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPersonas.mockResolvedValue({
      personas: mockPersonas,
      count: 3,
      activePersonaId: 'coding-agent',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal with preset personas when isOpen is true', async () => {
    render(
      <PersonaSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        activePersonaId="coding-agent"
        onSelectPersona={vi.fn()}
        token="test-tok"
      />
    );

    expect(screen.getByText('AGENT PERSONAS & OPERATIONAL ROLES')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Coding Agent')).toBeInTheDocument();
      expect(screen.getByText('Agentic Assistant')).toBeInTheDocument();
      expect(screen.getByText('System Architect')).toBeInTheDocument();
    });

    expect(screen.getByText('CURRENT')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <PersonaSelectorModal
        isOpen={false}
        onClose={vi.fn()}
        activePersonaId="coding-agent"
        onSelectPersona={vi.fn()}
        token="test-tok"
      />
    );
    expect(screen.queryByText('AGENT PERSONAS & OPERATIONAL ROLES')).not.toBeInTheDocument();
  });

  it('filters personas by search query', async () => {
    render(
      <PersonaSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        activePersonaId="coding-agent"
        onSelectPersona={vi.fn()}
        token="test-tok"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('System Architect')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/filter by name/i);
    fireEvent.change(searchInput, { target: { value: 'Architect' } });

    expect(screen.queryByText('Agentic Assistant')).not.toBeInTheDocument();
    expect(screen.getByText('System Architect')).toBeInTheDocument();
  });

  it('filters personas by category tabs', async () => {
    render(
      <PersonaSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        activePersonaId="coding-agent"
        onSelectPersona={vi.fn()}
        token="test-tok"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('System Architect')).toBeInTheDocument();
    });

    // Click ASSISTANT tab
    fireEvent.click(screen.getByRole('button', { name: /assistant/i }));

    expect(screen.queryByText('System Architect')).not.toBeInTheDocument();
    expect(screen.getByText('Agentic Assistant')).toBeInTheDocument();
  });

  it('toggles directive preview', async () => {
    render(
      <PersonaSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        activePersonaId="coding-agent"
        onSelectPersona={vi.fn()}
        token="test-tok"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('System Architect')).toBeInTheDocument();
    });

    expect(screen.queryByText(/You are operating as a Senior System Architect/)).not.toBeInTheDocument();

    const showDirectiveBtns = screen.getAllByText('▾ SHOW DIRECTIVE');
    fireEvent.click(showDirectiveBtns[2]); // System Architect

    expect(screen.getByText(/You are operating as a Senior System Architect/)).toBeInTheDocument();
  });

  it('activates a persona and calls callbacks', async () => {
    mockSetSessionPersona.mockResolvedValue({ ok: true, sessionName: 's1', personaId: 'architect' });
    const handleSelect = vi.fn();
    const handleClose = vi.fn();

    render(
      <PersonaSelectorModal
        isOpen={true}
        onClose={handleClose}
        activePersonaId="coding-agent"
        onSelectPersona={handleSelect}
        token="test-tok"
        sessionId="sess-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('System Architect')).toBeInTheDocument();
    });

    const activateBtns = screen.getAllByRole('button', { name: 'ACTIVATE PERSONA' });
    fireEvent.click(activateBtns[1]); // System Architect

    await waitFor(() => {
      expect(mockSetSessionPersona).toHaveBeenCalledWith('test-tok', 'sess-1', 'architect');
      expect(handleSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'architect' }));
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it('creates a custom persona via form', async () => {
    mockCreateCustomPersona.mockResolvedValue({
      id: 'tech-lead',
      name: 'Tech Lead',
      role: 'PR Reviews & Leadership',
      icon: 'robot',
      color: 'var(--accent-purple)',
      description: 'Lead engineering decisions',
      directive: 'Lead the team cleanly.',
      isPreset: false,
      tags: ['lead'],
    });

    render(
      <PersonaSelectorModal
        isOpen={true}
        onClose={vi.fn()}
        activePersonaId="coding-agent"
        onSelectPersona={vi.fn()}
        token="test-tok"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('CUSTOM PERSONA')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('CUSTOM PERSONA'));

    fireEvent.change(screen.getByPlaceholderText(/ID: e.g./i), { target: { value: 'tech-lead' } });
    fireEvent.change(screen.getByPlaceholderText(/Name: e.g./i), { target: { value: 'Tech Lead' } });
    fireEvent.change(screen.getByPlaceholderText(/Injected System Directive:/i), { target: { value: 'Lead the team cleanly.' } });

    fireEvent.click(screen.getByRole('button', { name: 'SAVE PERSONA' }));

    await waitFor(() => {
      expect(mockCreateCustomPersona).toHaveBeenCalledWith('test-tok', expect.objectContaining({
        id: 'tech-lead',
        name: 'Tech Lead',
        directive: 'Lead the team cleanly.',
      }));
    });
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <PersonaSelectorModal
        isOpen={true}
        onClose={onClose}
        activePersonaId="coding-agent"
        onSelectPersona={vi.fn()}
        token="test-tok"
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
