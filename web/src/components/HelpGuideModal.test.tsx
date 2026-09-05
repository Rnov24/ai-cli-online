import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { HelpGuideModal } from './ShortcutsModal';

describe('HelpGuideModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    render(<HelpGuideModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText(/FEATURE GUIDE & REFERENCE/i)).not.toBeInTheDocument();
  });

  it('renders quick start tab by default', () => {
    render(<HelpGuideModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/FEATURE GUIDE & REFERENCE/i)).toBeInTheDocument();
    expect(screen.getByText(/DUAL-PERSONA OPERATING ENGINE/i)).toBeInTheDocument();
    expect(screen.getByText(/HOME DIRECTORY \(~\)/i)).toBeInTheDocument();
    expect(screen.getByText(/MODE: AGENTIC ASSISTANT/i)).toBeInTheDocument();
  });

  it('switches to Slash Commands tab and filters commands', () => {
    render(<HelpGuideModal isOpen={true} onClose={vi.fn()} />);
    
    // Click on Slash Commands tab
    const tabBtn = screen.getByRole('button', { name: /SLASH COMMANDS DIRECTORY/i });
    fireEvent.click(tabBtn);

    // Filter input is present
    const searchInput = screen.getByPlaceholderText(/Filter slash commands/i);
    expect(searchInput).toBeInTheDocument();

    // Type filter
    fireEvent.change(searchInput, { target: { value: 'doctor' } });
    expect(screen.getAllByText('/doctor').length).toBeGreaterThan(0);
    expect(screen.queryByText('/review')).not.toBeInTheDocument();
  });

  it('triggers onInsertCommand when clicking insert button', () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();
    render(<HelpGuideModal isOpen={true} onClose={onClose} onInsertCommand={onInsert} initialTab="commands" />);

    // Find and click insert button
    const insertButtons = screen.getAllByRole('button', { name: /Insert/i });
    expect(insertButtons.length).toBeGreaterThan(0);
    fireEvent.click(insertButtons[0]);

    expect(onInsert).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('switches to Skills & Tools tab', () => {
    render(<HelpGuideModal isOpen={true} onClose={vi.fn()} initialTab="skills" />);
    expect(screen.getByText(/AI-CLI-TASK 13-SKILL LIFECYCLE ENGINE/i)).toBeInTheDocument();
    expect(screen.getByText(/CORE AUTONOMOUS AGENT TOOLS/i)).toBeInTheDocument();
  });

  it('switches to Keyboard Shortcuts tab', () => {
    render(<HelpGuideModal isOpen={true} onClose={vi.fn()} initialTab="shortcuts" />);
    expect(screen.getByText(/Open Supercharged Command Palette/i)).toBeInTheDocument();
    expect(screen.getByText(/Toggle Tasks & Plan Panel/i)).toBeInTheDocument();
  });
});
