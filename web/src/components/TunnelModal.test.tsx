import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TunnelModal } from './TunnelModal';
import {
  fetchTunnelStatus,
  startTunnel,
  stopTunnel,
  installTunnel,
  type TunnelStatus,
} from '../api/tunnel';

vi.mock('../api/tunnel', () => ({
  fetchTunnelStatus: vi.fn(),
  startTunnel: vi.fn(),
  stopTunnel: vi.fn(),
  installTunnel: vi.fn(),
}));

const mockFetchTunnelStatus = vi.mocked(fetchTunnelStatus);
const mockStartTunnel = vi.mocked(startTunnel);
const mockStopTunnel = vi.mocked(stopTunnel);
const mockInstallTunnel = vi.mocked(installTunnel);

const uninstalledStatus: TunnelStatus = {
  installed: false,
  running: false,
  mode: 'none',
  logs: [],
};

const stoppedStatus: TunnelStatus = {
  installed: true,
  running: false,
  mode: 'none',
  binPath: '/home/user/.agy-online/bin/cloudflared',
  version: 'cloudflared version 2024.2.0',
  logs: [],
};

const runningQuickStatus: TunnelStatus = {
  installed: true,
  running: true,
  mode: 'quick',
  url: 'https://test-subdomain-12345.trycloudflare.com',
  pid: 98765,
  binPath: '/home/user/.agy-online/bin/cloudflared',
  version: 'cloudflared version 2024.2.0',
  port: 3001,
  startedAt: 1700000000000,
  logs: [
    '2026-09-09T22:00:00Z INF Starting cloudflared tunnel',
    '2026-09-09T22:00:02Z INF Your quick Tunnel has been created! Visit https://test-subdomain-12345.trycloudflare.com',
  ],
};

describe('TunnelModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders uninstalled state and triggers installTunnel on button click', async () => {
    mockFetchTunnelStatus.mockResolvedValueOnce(uninstalledStatus);
    mockInstallTunnel.mockResolvedValueOnce(stoppedStatus);

    render(<TunnelModal isOpen={true} onClose={vi.fn()} token="test-token" />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/○ UNINSTALLED/i)).toBeInTheDocument();
    expect(screen.getByText(/CLOUDFLARED NOT INSTALLED/i)).toBeInTheDocument();

    const installBtn = screen.getByRole('button', { name: /INSTALL CLOUDFLARED/i });
    expect(installBtn).toBeInTheDocument();

    fireEvent.click(installBtn);

    await waitFor(() => {
      expect(mockInstallTunnel).toHaveBeenCalledWith('test-token');
    });
  });

  it('renders stopped state and starts quick tunnel', async () => {
    mockFetchTunnelStatus.mockResolvedValueOnce(stoppedStatus);
    mockStartTunnel.mockResolvedValueOnce(runningQuickStatus);

    render(<TunnelModal isOpen={true} onClose={vi.fn()} token="test-token" />);

    expect(await screen.findByText(/○ STOPPED/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^QUICK TUNNEL/i })).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /START QUICK TUNNEL/i });
    expect(startBtn).toBeInTheDocument();

    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockStartTunnel).toHaveBeenCalledWith('test-token', {
        mode: 'quick',
        port: expect.any(Number),
      });
    });
  });

  it('renders running state with active URL, copy button, and stop button', async () => {
    mockFetchTunnelStatus.mockResolvedValueOnce(runningQuickStatus);
    mockStopTunnel.mockResolvedValueOnce(stoppedStatus);

    // Mock clipboard API
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<TunnelModal isOpen={true} onClose={vi.fn()} token="test-token" />);

    expect(await screen.findByText(/● ACTIVE/i)).toBeInTheDocument();
    expect(screen.getByText('https://test-subdomain-12345.trycloudflare.com')).toBeInTheDocument();

    // Test copy URL
    const copyBtn = screen.getByRole('button', { name: /Copy Public URL/i });
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('https://test-subdomain-12345.trycloudflare.com');

    // Test stop tunnel
    const stopBtn = screen.getByRole('button', { name: /STOP TUNNEL/i });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockStopTunnel).toHaveBeenCalledWith('test-token');
    });
  });

  it('switches to named tunnel mode and validates token input', async () => {
    mockFetchTunnelStatus.mockResolvedValueOnce(stoppedStatus);

    render(<TunnelModal isOpen={true} onClose={vi.fn()} token="test-token" />);

    expect(await screen.findByText(/○ STOPPED/i)).toBeInTheDocument();

    const namedModeBtn = screen.getByRole('button', { name: /^NAMED TUNNEL/i });
    fireEvent.click(namedModeBtn);

    expect(screen.getByText(/Cloudflare Zero Trust Tunnel Token:/i)).toBeInTheDocument();
    const tokenInput = screen.getByPlaceholderText('eyJhIjoi...');

    // When token is empty, start button is disabled
    const startBtn = screen.getByRole('button', { name: /START NAMED TUNNEL/i });
    expect(startBtn).toBeDisabled();

    // Type token
    fireEvent.change(tokenInput, { target: { value: 'my-secret-tunnel-token' } });
    expect(startBtn).not.toBeDisabled();
  });

  it('closes on Close button click and Escape key', async () => {
    mockFetchTunnelStatus.mockResolvedValueOnce(stoppedStatus);
    const onClose = vi.fn();

    render(<TunnelModal isOpen={true} onClose={onClose} token="test-token" />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    // Click close icon
    const closeBtn = screen.getByRole('button', { name: /Close modal/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
