import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { WorkspaceFilesPanel } from './WorkspaceFilesPanel';
import * as filesApi from '../api/files';
import * as docsApi from '../api/docs';

vi.mock('../api/files', () => ({
  fetchFiles: vi.fn(),
  downloadFile: vi.fn(),
  deleteItem: vi.fn(),
  touchFile: vi.fn(),
  mkdirPath: vi.fn(),
}));

vi.mock('../api/docs', () => ({
  fetchFileContent: vi.fn(),
  saveFileContent: vi.fn(),
}));

vi.mock('../hooks/useAdaptivePolling', () => ({
  useAdaptivePolling: vi.fn(),
}));

vi.mock('./MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown-preview">{content}</div>,
}));

describe('WorkspaceFilesPanel Component', () => {
  const mockToken = 'mock-token';
  const mockSessionId = 'mock-sess-1';

  const mockFiles = [
    { name: 'src', type: 'directory' as const, size: 0, modifiedAt: '2026-09-08T12:00:00Z' },
    { name: 'package.json', type: 'file' as const, size: 1024, modifiedAt: '2026-09-08T12:00:00Z' },
    { name: 'README.md', type: 'file' as const, size: 2048, modifiedAt: '2026-09-08T12:00:00Z' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(filesApi.fetchFiles).mockResolvedValue({
      files: mockFiles,
      truncated: false,
      cwd: '/workspace',
      home: '/home',
    });
    vi.mocked(docsApi.fetchFileContent).mockResolvedValue({
      content: '{"name": "test-app"}',
      encoding: 'utf-8',
    });
    vi.mocked(docsApi.saveFileContent).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders directory contents and breadcrumb navigation', async () => {
    render(<WorkspaceFilesPanel token={mockToken} sessionId={mockSessionId} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
      expect(screen.getByText('package.json')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    expect(screen.getByRole('navigation', { name: /breadcrumbs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /root directory/i })).toBeInTheDocument();
  });

  it('navigates into subdirectory and updates breadcrumb segments', async () => {
    render(<WorkspaceFilesPanel token={mockToken} sessionId={mockSessionId} />);

    await waitFor(() => {
      expect(screen.getByText('src')).toBeInTheDocument();
    });

    vi.mocked(filesApi.fetchFiles).mockResolvedValueOnce({
      files: [{ name: 'index.ts', type: 'file', size: 512, modifiedAt: '2026-09-08T12:00:00Z' }],
      truncated: false,
      cwd: '/workspace/src',
      home: '/home',
    });

    fireEvent.click(screen.getByText('src'));

    await waitFor(() => {
      expect(filesApi.fetchFiles).toHaveBeenCalledWith(mockToken, mockSessionId, 'src');
      expect(screen.getByRole('button', { name: /navigate to src/i })).toBeInTheDocument();
      expect(screen.getByText('index.ts')).toBeInTheDocument();
    });

    // Navigate back to root via breadcrumb
    vi.mocked(filesApi.fetchFiles).mockResolvedValueOnce({
      files: mockFiles,
      truncated: false,
      cwd: '/workspace',
      home: '/home',
    });

    fireEvent.click(screen.getByRole('button', { name: /root directory/i }));

    await waitFor(() => {
      expect(filesApi.fetchFiles).toHaveBeenCalledWith(mockToken, mockSessionId, undefined);
    });
  });

  it('filters files in real-time by search query and clears filter', async () => {
    render(<WorkspaceFilesPanel token={mockToken} sessionId={mockSessionId} />);

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });

    const filterInput = screen.getByLabelText(/filter files in current directory/i);
    fireEvent.change(filterInput, { target: { value: 'pkg' } });

    // package.json matches, README.md does not
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();

    // Type query with 0 matches
    fireEvent.change(filterInput, { target: { value: 'nonexistent' } });
    expect(screen.getByText(/no files matching "nonexistent"/i)).toBeInTheDocument();

    // Click "Clear filter" button
    const clearBtns = screen.getAllByRole('button', { name: /clear filter/i });
    fireEvent.click(clearBtns[0]);
    expect(screen.getByText('package.json')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('opens file preview and saves modifications via Ctrl+S shortcut', async () => {
    render(<WorkspaceFilesPanel token={mockToken} sessionId={mockSessionId} />);

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('package.json'));

    await waitFor(() => {
      expect(docsApi.fetchFileContent).toHaveBeenCalledWith(mockToken, mockSessionId, 'package.json');
    });

    // Enter edit mode
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    const textarea = screen.getByRole('textbox', { name: /file content editor/i }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('{"name": "test-app"}');

    // Modify text
    fireEvent.change(textarea, { target: { value: '{"name": "updated-app"}' } });

    // Trigger Ctrl+S
    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });

    await waitFor(() => {
      expect(docsApi.saveFileContent).toHaveBeenCalledWith(
        mockToken,
        mockSessionId,
        'package.json',
        '{"name": "updated-app"}'
      );
    });
  });

  it('reverts content and exits edit mode on Escape key', async () => {
    render(<WorkspaceFilesPanel token={mockToken} sessionId={mockSessionId} />);

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('package.json'));

    await waitFor(() => {
      expect(docsApi.fetchFileContent).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    const textarea = screen.getByRole('textbox', { name: /file content editor/i }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'temporary unsaved changes' } });

    // Press Escape
    fireEvent.keyDown(textarea, { key: 'Escape' });

    // Should exit edit mode
    expect(screen.queryByRole('textbox', { name: /file content editor/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('dismisses file preview on Escape key when not editing', async () => {
    render(<WorkspaceFilesPanel token={mockToken} sessionId={mockSessionId} />);

    await waitFor(() => {
      expect(screen.getByText('package.json')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('package.json'));

    await waitFor(() => {
      expect(screen.getByText('Close')).toBeInTheDocument();
    });

    // Fire global Escape keydown
    fireEvent.keyDown(window, { key: 'Escape' });

    // Preview should be closed
    await waitFor(() => {
      expect(screen.queryByText('Close')).not.toBeInTheDocument();
    });
  });
});
