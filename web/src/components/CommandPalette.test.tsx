import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Mock zustand store
vi.mock('../store', () => ({
  useStore: vi.fn((selector: (s: any) => any) =>
    selector({
      tabs: [{ id: 'tab-1', name: 'Mission-Alpha', status: 'open', terminalIds: ['t1'] }],
      switchTab: vi.fn(),
      addTab: vi.fn(),
      toggleTheme: vi.fn(),
      theme: 'dark',
      fontSize: 14,
      setFontSize: vi.fn(),
    })
  ),
}));

import { CommandPalette } from './CommandPalette';

describe('CommandPalette', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    render(<CommandPalette isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/Type a command/i)).not.toBeInTheDocument();
  });

  it('renders search input and category filters when isOpen is true', () => {
    render(<CommandPalette isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ALL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SKILLS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WORKSPACES' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PANELS' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SYSTEM' })).toBeInTheDocument();
  });

  it('filters items by category pill', () => {
    render(<CommandPalette isOpen={true} onClose={vi.fn()} />);

    // Click on WORKSPACES category
    const wsBtn = screen.getByRole('button', { name: 'WORKSPACES' });
    fireEvent.click(wsBtn);

    expect(screen.getByText(/\/workspace — Inspect Registered Workspaces/i)).toBeInTheDocument();
    expect(screen.getByText(/\/workspace home — Switch to Agentic Assistant/i)).toBeInTheDocument();
    // Non-workspace items should not appear in this category
    expect(screen.queryByText(/Toggle Theme/i)).not.toBeInTheDocument();
  });

  it('executes command action on click', () => {
    const onExecute = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette isOpen={true} onClose={onClose} onExecuteCommand={onExecute} />);

    // Find and click /goal command
    const goalItem = screen.getByText(/\/goal — Autonomous Long-Running Goal/i);
    fireEvent.click(goalItem);

    expect(onExecute).toHaveBeenCalledWith('/goal ');
    expect(onClose).toHaveBeenCalled();
  });
});
