import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SubagentsModal } from './SubagentsModal';
import { fetchSubagents, SubagentItem } from '../api/subagents';

vi.mock('../api/subagents', () => ({
  fetchSubagents: vi.fn(),
  fetchSubagent: vi.fn(),
}));

const mockFetchSubagents = vi.mocked(fetchSubagents);

const sampleSubagents: SubagentItem[] = [
  {
    id: 'subagent-1',
    parentId: 'parent-1',
    role: 'Stream Executor',
    typeName: 'self',
    model: 'inherit',
    prompt: 'Execute stream verbosity implementation plan.',
    status: 'running',
    createdAt: 1700000000000,
    updatedAt: 1700000010000,
    logUri: '/brain/subagent-1/transcript.jsonl',
    worktreeUri: '/worktrees/subagent-stream-1',
    toolCount: 5,
    report: undefined,
  },
  {
    id: 'subagent-2',
    parentId: 'parent-1',
    role: 'Code Reviewer',
    typeName: 'research',
    model: 'flash',
    prompt: 'Review diff and check for anti-patterns.',
    status: 'done',
    createdAt: 1700000020000,
    updatedAt: 1700000030000,
    logUri: '/brain/subagent-2/transcript.jsonl',
    worktreeUri: undefined,
    toolCount: 12,
    report: 'STATUS: COMPLETE\nSTEPS: review passed\nFILES CHANGED: none',
  },
  {
    id: 'subagent-3',
    parentId: 'parent-1',
    role: 'Database Migrator',
    typeName: 'self',
    model: 'inherit',
    prompt: 'Run sqlite migration and verify indexes.',
    status: 'error',
    createdAt: 1700000040000,
    updatedAt: 1700000050000,
    logUri: '/brain/subagent-3/transcript.jsonl',
    worktreeUri: undefined,
    toolCount: 2,
    report: 'STATUS: STOPPED\nSTOPPED BECAUSE: lock timeout',
  },
];

describe('SubagentsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSubagents.mockResolvedValue({
      ok: true,
      subagents: sampleSubagents,
      count: sampleSubagents.length,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders subagent cards and counts accurately', async () => {
    render(
      <SubagentsModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('SUBAGENT EXPLORER')).toBeInTheDocument();
      expect(screen.getByText('3 SUBAGENTS INDEXED')).toBeInTheDocument();
    });

    expect(screen.getByText('/Stream Executor')).toBeInTheDocument();
    expect(screen.getByText('/Code Reviewer')).toBeInTheDocument();
    expect(screen.getByText('/Database Migrator')).toBeInTheDocument();
    expect(screen.getByText('5 tools executed')).toBeInTheDocument();
  });

  it('filters subagents by status pills (ALL, RUNNING, DONE)', async () => {
    render(
      <SubagentsModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('filter-running')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('filter-running'));

    await waitFor(() => {
      expect(mockFetchSubagents).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ status: 'running' })
      );
    });

    fireEvent.click(screen.getByTestId('filter-done'));

    await waitFor(() => {
      expect(mockFetchSubagents).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ status: 'done' })
      );
    });
  });

  it('filters subagents by search input', async () => {
    render(
      <SubagentsModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
      />
    );

    const searchInput = screen.getByPlaceholderText('Search subagents by role, task, or ID...');
    fireEvent.change(searchInput, { target: { value: 'Reviewer' } });

    await waitFor(() => {
      expect(mockFetchSubagents).toHaveBeenCalledWith(
        'test-token',
        expect.objectContaining({ query: 'Reviewer' })
      );
    });
  });

  it('inspects subagent details and renders prompt and report', async () => {
    render(
      <SubagentsModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
        initialSubagentId="subagent-2"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('subagent-inspection-drawer')).toBeInTheDocument();
    });

    const drawer = screen.getByTestId('subagent-inspection-drawer');
    expect(drawer).toBeInTheDocument();
    expect(drawer.textContent).toContain('Review diff and check for anti-patterns.');
    expect(drawer.textContent).toContain('STATUS: COMPLETE');
    expect(screen.getByText('// EXECUTION REPORT')).toBeInTheDocument();
  });

  it('dismisses modal on Escape key', async () => {
    const handleClose = vi.fn();
    render(
      <SubagentsModal
        isOpen={true}
        onClose={handleClose}
        token="test-token"
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
