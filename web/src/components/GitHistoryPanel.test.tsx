import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

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

describe('GitHistoryPanel', () => {
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
    });
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
      expect(screen.getByText('Home Directory — Personal Space')).toBeInTheDocument();
    });
    expect(screen.getByText(/Agentic Assistant/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Switch to a Project Workspace/i })).toBeInTheDocument();
  });
});
