import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SystemHeader } from './SystemHeader';

// Mock zustand store
const mockStoreState = {
  latency: 35,
};

vi.mock('../store', () => ({
  useStore: vi.fn((selector: (s: any) => any) => selector(mockStoreState)),
}));

// Mock WorkspaceSelector to keep test focused
vi.mock('./WorkspaceSelector', () => ({
  WorkspaceSelector: () => <div data-testid="workspace-selector">Workspace</div>,
}));

describe('SystemHeader', () => {
  const mockSystemStatus = {
    server: {
      idle: false,
      pid: 4321,
      uptime: 1800,
      memory: {
        rssMb: 14.5,
        heapUsedMb: 6.2,
        heapTotalMb: 10.0,
      },
      activeConnections: 1,
    },
    tmux: {
      available: true,
      sessionsCount: 1,
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
  };

  const defaultProps = {
    systemStatus: mockSystemStatus,
    onOpenCommandPalette: vi.fn(),
    onOpenHelp: vi.fn(),
    onOpenSettings: vi.fn(),
    onToggleContextPanel: vi.fn(),
    contextPanelOpen: false,
    onToggleMobileNav: vi.fn(),
    activeSessionName: 'Test-Session',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the compact status button (SYS:ONLINE)', () => {
    render(<SystemHeader {...defaultProps} />);
    const statusBtn = screen.getByRole('button', { name: /System status: Online/i });
    expect(statusBtn).toBeInTheDocument();
    expect(screen.getByText(/SYS:ONLINE/i)).toBeInTheDocument();
  });

  it('renders compact status button with SYS:STANDBY when idle', () => {
    const idleStatus = {
      ...mockSystemStatus,
      server: { ...mockSystemStatus.server, idle: true },
    };
    render(<SystemHeader {...defaultProps} systemStatus={idleStatus} />);
    const statusBtn = screen.getByRole('button', { name: /System status: Standby/i });
    expect(statusBtn).toBeInTheDocument();
    expect(screen.getByText(/SYS:STANDBY/i)).toBeInTheDocument();
  });

  it('does not render font stepper buttons (A− and A+ are null)', () => {
    render(<SystemHeader {...defaultProps} />);
    expect(screen.queryByText('A−')).toBeNull();
    expect(screen.queryByText('A+')).toBeNull();
  });

  it('renders Settings button (SETTINGS) and clicking it calls onOpenSettings', () => {
    const onOpenSettings = vi.fn();
    render(<SystemHeader {...defaultProps} onOpenSettings={onOpenSettings} />);
    const settingsBtn = screen.getByRole('button', { name: /Open system settings/i });
    expect(settingsBtn).toBeInTheDocument();
    expect(screen.getByText('SETTINGS')).toBeInTheDocument();

    fireEvent.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenSettings when clicking the compact status button', () => {
    const onOpenSettings = vi.fn();
    render(<SystemHeader {...defaultProps} onOpenSettings={onOpenSettings} />);
    const statusBtn = screen.getByRole('button', { name: /System status: Online/i });
    fireEvent.click(statusBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('renders Context panel toggle button and clicking it calls onToggleContextPanel', () => {
    const onToggleContextPanel = vi.fn();
    render(<SystemHeader {...defaultProps} onToggleContextPanel={onToggleContextPanel} />);
    const contextBtn = screen.getByRole('button', { name: /Toggle system context panel/i });
    expect(contextBtn).toBeInTheDocument();

    fireEvent.click(contextBtn);
    expect(onToggleContextPanel).toHaveBeenCalledTimes(1);
  });
});
