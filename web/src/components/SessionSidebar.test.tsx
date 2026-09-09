import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { SessionSidebar } from './SessionSidebar';
import { fetchConversations, fetchConversationMessages } from '../api/conversations';
import { fetchSubagents, SubagentItem } from '../api/subagents';

const mockToggleSidebar = vi.fn();
const mockAddTab = vi.fn();
const mockSwitchTab = vi.fn();
const mockCloseTab = vi.fn();
const mockFetchSessions = vi.fn();

const sampleTabs = [
  {
    id: 'tab-1',
    name: 'Workspace Alpha',
    status: 'open',
    sessionStatus: 'ACTIVE',
    terminalIds: ['term-1', 'term-2'],
    createdAt: 1700000000000,
    updatedAt: 1700000010000,
  },
  {
    id: 'tab-2',
    name: 'Workspace Beta',
    status: 'open',
    sessionStatus: 'IDLE',
    terminalIds: ['term-3'],
    createdAt: 1700000020000,
    updatedAt: 1700000030000,
  },
];

vi.mock('../store', () => ({
  useStore: vi.fn((selector: (s: any) => any) =>
    selector({
      sidebarOpen: true,
      toggleSidebar: mockToggleSidebar,
      tabs: sampleTabs,
      activeTabId: 'tab-1',
      addTab: mockAddTab,
      switchTab: mockSwitchTab,
      closeTab: mockCloseTab,
      reopenTab: vi.fn(),
      deleteTab: vi.fn(),
      renameTab: vi.fn(),
      fetchSessions: mockFetchSessions,
      serverSessions: [],
      tabsLoading: false,
      token: 'test-token',
    })
  ),
}));

vi.mock('../api/conversations', () => ({
  fetchConversations: vi.fn(),
  fetchConversationMessages: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('../api/subagents', () => ({
  fetchSubagents: vi.fn(),
}));

const mockFetchConversations = vi.mocked(fetchConversations);
const mockFetchConversationMessages = vi.mocked(fetchConversationMessages);
const mockFetchSubagents = vi.mocked(fetchSubagents);

const sampleConversations = [
  {
    id: 'conv-12345678-abcd',
    title: 'Implement Authentication Provider',
    preview: 'Created auth slice and tokens',
    createdAt: 1700000000000,
    updatedAt: 1700000010000,
    turnCount: 4,
  },
  {
    id: 'conv-87654321-wxyz',
    title: 'Fix SQLite WAL Checkpoint',
    preview: 'Added passive checkpointing',
    createdAt: 1700000020000,
    updatedAt: 1700000030000,
    turnCount: 2,
  },
];

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
  },
];

describe('SessionSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 });

    mockFetchConversations.mockResolvedValue({
      ok: true,
      conversations: sampleConversations,
      count: sampleConversations.length,
    });

    mockFetchSubagents.mockResolvedValue({
      ok: true,
      subagents: sampleSubagents,
      count: sampleSubagents.length,
    });

    mockFetchConversationMessages.mockResolvedValue({
      ok: true,
      conversationId: 'conv-12345678-abcd',
      title: 'Implement Authentication Provider',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders telemetry header with title and counts for each view mode', async () => {
    render(<SessionSidebar />);

    // Default view: conversations / history
    expect(screen.getByText('SESSIONS // HISTORY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ NEW CHAT' })).toBeInTheDocument();

    // Switch to SUBAGENTS view
    fireEvent.click(screen.getByTestId('sidebar-tab-subagents'));
    await waitFor(() => {
      expect(screen.getByText('SESSIONS // SUBAGENTS')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '+ EXPLORE' })).toBeInTheDocument();

    // Switch to TABS / WORKSPACES view
    fireEvent.click(screen.getByTestId('sidebar-tab-tabs'));
    expect(screen.getByText('SESSIONS // WORKSPACES')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ NEW TAB' })).toBeInTheDocument();
  });

  it('switches views when clicking segmented tab buttons', async () => {
    render(<SessionSidebar />);

    // Click SUBAGENTS segment
    fireEvent.click(screen.getByTestId('sidebar-tab-subagents'));
    await waitFor(() => {
      expect(screen.getByText('/Stream Executor')).toBeInTheDocument();
      expect(screen.getByText('/Code Reviewer')).toBeInTheDocument();
    });

    // Click TABS segment
    fireEvent.click(screen.getByTestId('sidebar-tab-tabs'));
    expect(screen.getByText('Workspace Alpha')).toBeInTheDocument();
    expect(screen.getByText('Workspace Beta')).toBeInTheDocument();
  });

  it('filters conversations by search query', async () => {
    render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByText('Implement Authentication Provider')).toBeInTheDocument();
      expect(screen.getByText('Fix SQLite WAL Checkpoint')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Filter history/i);
    fireEvent.change(searchInput, { target: { value: 'Authentication' } });

    expect(screen.getByText('Implement Authentication Provider')).toBeInTheDocument();
    expect(screen.queryByText('Fix SQLite WAL Checkpoint')).not.toBeInTheDocument();
  });

  it('filters subagents by status pills (ALL, RUNNING, DONE, ERROR)', async () => {
    render(<SessionSidebar />);

    fireEvent.click(screen.getByTestId('sidebar-tab-subagents'));
    await waitFor(() => {
      expect(screen.getByText('/Stream Executor')).toBeInTheDocument();
    });

    // Filter RUNNING
    fireEvent.click(screen.getByTestId('filter-status-running'));
    expect(screen.getByText('/Stream Executor')).toBeInTheDocument();
    expect(screen.queryByText('/Code Reviewer')).not.toBeInTheDocument();
    expect(screen.queryByText('/Database Migrator')).not.toBeInTheDocument();

    // Filter DONE
    fireEvent.click(screen.getByTestId('filter-status-done'));
    expect(screen.queryByText('/Stream Executor')).not.toBeInTheDocument();
    expect(screen.getByText('/Code Reviewer')).toBeInTheDocument();
    expect(screen.queryByText('/Database Migrator')).not.toBeInTheDocument();

    // Filter ERROR
    fireEvent.click(screen.getByTestId('filter-status-error'));
    expect(screen.queryByText('/Stream Executor')).not.toBeInTheDocument();
    expect(screen.queryByText('/Code Reviewer')).not.toBeInTheDocument();
    expect(screen.getByText('/Database Migrator')).toBeInTheDocument();

    // Filter ALL
    fireEvent.click(screen.getByTestId('filter-status-all'));
    expect(screen.getByText('/Stream Executor')).toBeInTheDocument();
    expect(screen.getByText('/Code Reviewer')).toBeInTheDocument();
    expect(screen.getByText('/Database Migrator')).toBeInTheDocument();
  });

  it('dispatches agy:resume-conversation when clicking conversation card', async () => {
    const resumeHandler = vi.fn();
    window.addEventListener('agy:resume-conversation', resumeHandler);

    render(<SessionSidebar />);

    await waitFor(() => {
      expect(screen.getByText('Implement Authentication Provider')).toBeInTheDocument();
    });

    const card = screen.getByTestId('conversation-card-conv-12345678-abcd');
    fireEvent.click(card);

    await waitFor(() => {
      expect(mockFetchConversationMessages).toHaveBeenCalledWith('test-token', 'conv-12345678-abcd');
      expect(resumeHandler).toHaveBeenCalled();
    });

    const eventDetail = resumeHandler.mock.calls[0][0].detail;
    expect(eventDetail.conversationId).toBe('conv-12345678-abcd');

    window.removeEventListener('agy:resume-conversation', resumeHandler);
  });

  it('dispatches agy:new-conversation when clicking + NEW CHAT', () => {
    const newHandler = vi.fn();
    window.addEventListener('agy:new-conversation', newHandler);

    render(<SessionSidebar />);

    const newChatBtn = screen.getByRole('button', { name: '+ NEW CHAT' });
    fireEvent.click(newChatBtn);

    expect(newHandler).toHaveBeenCalled();
    window.removeEventListener('agy:new-conversation', newHandler);
  });

  it('dispatches agy:seek-subagent when clicking inspect on subagent card', async () => {
    const seekHandler = vi.fn();
    window.addEventListener('agy:seek-subagent', seekHandler);

    render(<SessionSidebar />);

    fireEvent.click(screen.getByTestId('sidebar-tab-subagents'));
    await waitFor(() => {
      expect(screen.getByText('/Stream Executor')).toBeInTheDocument();
    });

    const inspectButtons = screen.getAllByText('[INSPECT ↗]');
    fireEvent.click(inspectButtons[0]);

    expect(seekHandler).toHaveBeenCalled();
    const eventDetail = seekHandler.mock.calls[0][0].detail;
    expect(eventDetail.id).toBe('subagent-1');

    window.removeEventListener('agy:seek-subagent', seekHandler);
  });

  it('applies standardized --z-drawer tokens and closes on Escape', () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 });

    render(<SessionSidebar />);

    const backdrop = screen.getByTestId('sidebar-drawer-container');
    expect(backdrop.style.zIndex).toBe('var(--z-drawer-backdrop)');

    const drawerAside = screen.getByTestId('session-sidebar-drawer');
    expect(drawerAside.style.zIndex).toBe('var(--z-drawer)');

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockToggleSidebar).toHaveBeenCalled();
  });
});
