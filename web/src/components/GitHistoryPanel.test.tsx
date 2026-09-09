import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

// Mock zustand store
vi.mock('../store', () => ({
  useStore: vi.fn((selector: (s: any) => any) => selector({ fontSize: 14 })),
}));

// Mock git API
vi.mock('../api/git', () => ({
  fetchGitLog: vi.fn(),
  fetchGitDiff: vi.fn(),
  fetchGitBranches: vi.fn().mockResolvedValue({ current: 'master', branches: ['master'] }),
}));

vi.mock('../api/workspaces', () => ({
  fetchWorkspaceMode: vi.fn().mockResolvedValue({ isHome: false, mode: 'coding-agent', cwd: '/work/proj', workspaceName: 'proj' }),
}));

import { GitHistoryPanel } from './GitHistoryPanel';
import { fetchGitLog } from '../api/git';
import { fetchWorkspaceMode } from '../api/workspaces';

const mockFetchGitLog = vi.mocked(fetchGitLog);
const mockFetchWorkspaceMode = vi.mocked(fetchWorkspaceMode);

describe('GitHistoryPanel', { timeout: 35000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWorkspaceMode.mockResolvedValue({ isHome: false, mode: 'coding-agent', cwd: '/work/proj', workspaceName: 'proj' });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loading state', () => {
    // Never resolve so it stays loading
    mockFetchGitLog.mockReturnValue(new Promise(() => {}));

    render(<GitHistoryPanel sessionId="t1" token="test-token" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders commits list', async () => {
    mockFetchGitLog.mockResolvedValue({
      commits: [
        {
          hash: 'abc123abc123abc123abc123abc123abc123abc123',
          shortHash: 'abc123a',
          parents: ['def456def456def456def456def456def456def456'],
          refs: [{ type: 'head', name: 'master' }],
          message: 'Fix login bug',
          author: 'Alice',
          date: new Date().toISOString(),
          files: [{ path: 'src/auth.ts', additions: 5, deletions: 2 }],
        },
      ],
      hasMore: false,
    });

    render(<GitHistoryPanel sessionId="t1" token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
    }, { timeout: 10000 });
    expect(screen.getByText('abc123a')).toBeInTheDocument();
    // Author and time are now combined in a single compact span
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it('renders empty state', async () => {
    mockFetchGitLog.mockResolvedValue({
      commits: [],
      hasMore: false,
    });

    render(<GitHistoryPanel sessionId="t1" token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('No commits found')).toBeInTheDocument();
    });
  });

  it('renders error state', async () => {
    mockFetchGitLog.mockRejectedValue(new Error('Network error'));

    render(<GitHistoryPanel sessionId="t1" token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders non-git repo error', async () => {
    mockFetchGitLog.mockResolvedValue({
      commits: [],
      hasMore: false,
      error: 'Not a git repository',
    });

    render(<GitHistoryPanel sessionId="t1" token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('Not a git repository')).toBeInTheDocument();
    });
  });

  it('renders Home directory graceful guard when in home', async () => {
    mockFetchWorkspaceMode.mockResolvedValueOnce({
      isHome: true,
      mode: 'agentic-assistant',
      cwd: '/home/user',
      workspaceName: '~',
    });
    mockFetchGitLog.mockResolvedValue({
      commits: [],
      hasMore: false,
    });

    render(<GitHistoryPanel sessionId="t1" token="test-token" />);

    await waitFor(() => {
      expect(screen.getByText('Home Directory: Personal Space')).toBeInTheDocument();
    });
    expect(screen.getByText(/Agentic Assistant/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Switch to a Project Workspace/i })).toBeInTheDocument();
  });

  it('dispatches search query with commit message query (q) or file query', async () => {
    mockFetchGitLog.mockResolvedValue({
      commits: [],
      hasMore: false,
    });

    render(<GitHistoryPanel sessionId="t1" token="test-token" />);
    const searchInput = screen.getByRole('textbox', { name: /filter commits or files/i });

    // Type a keyword search (commit message search)
    fireEvent.change(searchInput, { target: { value: 'feature login' } });

    await waitFor(() => {
      expect(mockFetchGitLog).toHaveBeenCalledWith('t1', 'test-token', expect.objectContaining({
        q: 'feature login',
      }));
    });

    // Type a file path search
    fireEvent.change(searchInput, { target: { value: 'src/main.ts' } });

    await waitFor(() => {
      expect(mockFetchGitLog).toHaveBeenCalledWith('t1', 'test-token', expect.objectContaining({
        file: 'src/main.ts',
      }));
    });
  });

  it('renders clear button and clears search on click and escape key', async () => {
    mockFetchGitLog.mockResolvedValue({
      commits: [],
      hasMore: false,
    });

    render(<GitHistoryPanel sessionId="t1" token="test-token" />);
    const searchInput = screen.getByRole('textbox', { name: /filter commits or files/i });

    fireEvent.change(searchInput, { target: { value: 'custom query' } });
    await waitFor(() => {
      expect(screen.getByText('No commits matching "custom query"')).toBeInTheDocument();
    });

    // Clear via search input clear button
    const clearBtn = screen.getByRole('button', { name: /clear search input/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
    });

    // Type again and clear via empty-state Clear search button
    fireEvent.change(searchInput, { target: { value: 'empty clear' } });
    await waitFor(() => {
      expect(screen.getByText('No commits matching "empty clear"')).toBeInTheDocument();
    });
    const emptyClearBtn = screen.getByRole('button', { name: /^clear search$/i });
    fireEvent.click(emptyClearBtn);
    expect(searchInput).toHaveValue('');

    // Type again and clear via Escape
    fireEvent.change(searchInput, { target: { value: 'escape test' } });
    expect(searchInput).toHaveValue('escape test');
    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(searchInput).toHaveValue('');
  });
});
