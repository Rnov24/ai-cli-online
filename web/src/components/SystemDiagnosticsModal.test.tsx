import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

// Mock system API
vi.mock('../api/system', () => ({
  fetchSystemStatus: vi.fn(),
  fetchProcessList: vi.fn(),
  fetchSystemLogs: vi.fn(),
}));

import { SystemDiagnosticsModal } from './SystemDiagnosticsModal';
import { fetchSystemStatus, fetchProcessList, fetchSystemLogs } from '../api/system';

const mockFetchSystemStatus = vi.mocked(fetchSystemStatus);
const mockFetchProcessList = vi.mocked(fetchProcessList);
const mockFetchSystemLogs = vi.mocked(fetchSystemLogs);

describe('SystemDiagnosticsModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSystemStatus.mockResolvedValue({
      server: {
        pid: 1234,
        uptime: 3600,
        memory: {
          rssMb: 14.2,
          heapUsedMb: 6.8,
          heapTotalMb: 12.0,
        },
        idle: false,
        activeConnections: 1,
      },
      tmux: {
        available: true,
        sessionsCount: 2,
      },
      agy: {
        available: true,
      },
      platform: {
        isTermux: false,
        os: 'linux',
        arch: 'x64',
        nodeVersion: 'go1.22',
      },
    });

    mockFetchProcessList.mockResolvedValue({
      ok: true,
      processes: [
        { sessionName: 'sess-dev-1', mode: 'tmux', cwd: '/workspace/project', connected: true },
      ],
    });

    mockFetchSystemLogs.mockResolvedValue({
      ok: true,
      logs: [
        { timestamp: '12:00:00', level: 'info', message: 'Server started cleanly on port 8080' },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SystemDiagnosticsModal token="tok" isOpen={false} onClose={mockOnClose} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders system status on health tab and switches tabs', async () => {
    render(
      <SystemDiagnosticsModal token="tok" isOpen={true} onClose={mockOnClose} />
    );

    await waitFor(() => {
      expect(screen.getByText(/SYSTEM DIAGNOSTICS & SUPERVISION/)).toBeInTheDocument();
    });

    // Check health metrics
    expect(screen.getByText('HEALTH & MEMORY')).toBeInTheDocument();
    expect(screen.getByText(/ACTIVE SESSIONS & PTYs/)).toBeInTheDocument();
    expect(screen.getByText(/SERVER LOGS/)).toBeInTheDocument();

    // Switch to processes tab
    fireEvent.click(screen.getByText(/ACTIVE SESSIONS & PTYs/));
    await waitFor(() => {
      expect(screen.getByText(/sess-dev-1/)).toBeInTheDocument();
    });

    // Switch to logs tab
    fireEvent.click(screen.getByText(/SERVER LOGS/));
    await waitFor(() => {
      expect(screen.getByText('Server started cleanly on port 8080')).toBeInTheDocument();
    });
  });

  it('closes on Escape key press and backdrop click', async () => {
    const { getByRole } = render(
      <SystemDiagnosticsModal token="tok" isOpen={true} onClose={mockOnClose} />
    );

    await waitFor(() => {
      expect(screen.getByText(/SYSTEM DIAGNOSTICS & SUPERVISION/)).toBeInTheDocument();
    });

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);

    // Backdrop click
    const dialog = getByRole('dialog');
    fireEvent.click(dialog);
    expect(mockOnClose).toHaveBeenCalledTimes(2);
  });
});
