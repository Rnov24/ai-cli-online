import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

// Ensure localStorage fallback
const map = new Map<string, string>();
const memStorage = {
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, val: string) => { map.set(key, String(val)); },
  removeItem: (key: string) => { map.delete(key); },
  clear: () => { map.clear(); },
  get length() { return map.size; },
  key: (i: number) => Array.from(map.keys())[i] ?? null,
};
try {
  Object.defineProperty(globalThis, 'localStorage', { value: memStorage, configurable: true, writable: true });
} catch {}
try {
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: memStorage, configurable: true, writable: true });
  }
} catch {}

// Mock zustand store
vi.mock('../store', () => ({
  useStore: vi.fn((selector: (s: any) => any) => selector({ fontSize: 13, latency: 20 })),
}));

// Mock API modules
vi.mock('../api/files', () => ({
  fetchFiles: vi.fn(),
  touchFile: vi.fn(),
  mkdirPath: vi.fn(),
  deleteItem: vi.fn(),
}));

vi.mock('../api/docs', () => ({
  fetchFileContent: vi.fn(),
  saveFileContent: vi.fn(),
}));

vi.mock('../api/workspaces', () => ({
  fetchWorkspaceMode: vi.fn().mockResolvedValue({ isHome: false, mode: 'coding-agent', cwd: '/workspace', workspaceName: 'workspace' }),
}));

vi.mock('../api/plugins', () => ({
  fetchPlugins: vi.fn().mockResolvedValue({ plugins: [{ name: 'ai-cli-task', enabled: true }] }),
}));

import { PlanPanel } from './PlanPanel';
import { fetchFiles } from '../api/files';
import { fetchFileContent } from '../api/docs';
import { fetchWorkspaceMode } from '../api/workspaces';

const mockFetchFiles = vi.mocked(fetchFiles);
const mockFetchFileContent = vi.mocked(fetchFileContent);
const mockFetchWorkspaceMode = vi.mocked(fetchWorkspaceMode);

describe('PlanPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFetchWorkspaceMode.mockResolvedValue({
      isHome: false,
      mode: 'coding-agent',
      cwd: '/workspace',
      workspaceName: 'workspace',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders init guide when AiTasks directory is not found', async () => {
    mockFetchFiles.mockResolvedValue({
      cwd: '/workspace',
      home: '/home/user',
      files: [
        { name: 'src', type: 'directory' },
        { name: 'package.json', type: 'file', size: 100, mtime: 1 },
      ],
      truncated: false,
    });

    render(<PlanPanel sessionId="t1" token="token-123" connected={true} />);

    await waitFor(() => {
      expect(screen.getByText('AiTasks/ directory not found')).toBeInTheDocument();
    });
    expect(screen.getByText(/\/init/)).toBeInTheDocument();
  });

  it('detects AiTasks directory and loads pre-selected plan file via fetchFileContent', async () => {
    const filePath = '/workspace/AiTasks/task-login/.plan.md';
    localStorage.setItem('plan-selected-file', filePath);

    mockFetchFiles.mockResolvedValue({
      cwd: '/workspace',
      home: '/home/user',
      files: [
        { name: 'AiTasks', type: 'directory' },
      ],
      truncated: false,
    });

    mockFetchFileContent.mockImplementation(async (_token, _session, path) => {
      if (path === filePath) {
        return { content: '# Login Feature Implementation Plan\n\n- [ ] Step 1', mtime: 1000, size: 50 };
      }
      if (path.endsWith('.index.json')) {
        return {
          content: JSON.stringify({ status: 'executing', phase: 'plan', title: 'Login Feature' }),
          mtime: 1000,
          size: 50,
        };
      }
      return null;
    });

    render(<PlanPanel sessionId="t1" token="token-123" connected={true} />);

    await waitFor(() => {
      expect(screen.getByText('.plan.md')).toBeInTheDocument();
    });

    // Content from PlanAnnotationRenderer
    await waitFor(() => {
      expect(screen.getByText(/Login Feature Implementation Plan/)).toBeInTheDocument();
    });

    // Task status bar shows module name and status
    expect(screen.getByText('task-login')).toBeInTheDocument();
    expect(screen.getByText('executing')).toBeInTheDocument();
  });

  it('renders retry button and error message when file loading fails, then recovers on retry', async () => {
    const filePath = '/workspace/AiTasks/task-login/.plan.md';
    localStorage.setItem('plan-selected-file', filePath);

    mockFetchFiles.mockResolvedValue({
      cwd: '/workspace',
      home: '/home/user',
      files: [{ name: 'AiTasks', type: 'directory' }],
      truncated: false,
    });

    let recovered = false;
    mockFetchFileContent.mockImplementation(async (_token, _session, path) => {
      if (path === filePath) {
        if (!recovered) {
          throw new Error('Network connection timeout');
        }
        return {
          content: '## Recovered Plan Content',
          mtime: 2000,
          size: 30,
        };
      }
      return null;
    });

    render(<PlanPanel sessionId="t1" token="token-123" connected={true} />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load .plan.md')).toBeInTheDocument();
    });
    expect(screen.getByText('Network connection timeout')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    expect(retryBtn).toBeInTheDocument();

    // Recover on retry
    recovered = true;
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Recovered Plan Content/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Failed to load .plan.md')).not.toBeInTheDocument();
  });

  it('refreshes plan file content when refresh button is clicked', async () => {
    const filePath = '/workspace/AiTasks/task-login/.plan.md';
    localStorage.setItem('plan-selected-file', filePath);

    mockFetchFiles.mockResolvedValue({
      cwd: '/workspace',
      home: '/home/user',
      files: [{ name: 'AiTasks', type: 'directory' }],
      truncated: false,
    });

    let refreshed = false;
    mockFetchFileContent.mockImplementation(async (_token, _session, path) => {
      if (path === filePath) {
        return {
          content: refreshed ? 'Updated Plan v2' : 'Initial Plan v1',
          mtime: refreshed ? 2000 : 1000,
          size: 20,
        };
      }
      return null;
    });

    render(<PlanPanel sessionId="t1" token="token-123" connected={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Initial Plan v1/)).toBeInTheDocument();
    });

    const refreshBtn = screen.getByTitle('Refresh current file');
    expect(refreshBtn).toBeInTheDocument();

    refreshed = true;
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/Updated Plan v2/)).toBeInTheDocument();
    });
  });
});
