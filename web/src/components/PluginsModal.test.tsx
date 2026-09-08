import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PluginsModal } from './PluginsModal';
import {
  fetchPlugins,
  installPlugin,
  uninstallPlugin,
  togglePlugin,
  type PluginItem,
} from '../api/plugins';

vi.mock('../api/plugins', () => ({
  fetchPlugins: vi.fn(),
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
  togglePlugin: vi.fn(),
}));

const mockFetchPlugins = vi.mocked(fetchPlugins);
const mockInstallPlugin = vi.mocked(installPlugin);
const mockUninstallPlugin = vi.mocked(uninstallPlugin);
const mockTogglePlugin = vi.mocked(togglePlugin);

const mockPlugins: PluginItem[] = [
  {
    name: 'ai-cli-task',
    version: '0.3.6',
    description: 'Task lifecycle management for Antigravity CLI',
    author: 'huacheng',
    source: 'antigravity',
    importedAt: '2026-09-03T17:51:23Z',
    components: ['skills', 'commands'],
    enabled: true,
    path: '/home/.gemini/config/plugins/ai-cli-task',
    hasSkills: true,
    hasCommands: true,
    skillsCount: 15,
  },
  {
    name: 'linter-tools',
    version: '1.0.0',
    description: 'Autonomous linting and formatting extension',
    author: 'dev-team',
    source: 'local',
    components: ['skills'],
    enabled: false,
    path: '/home/.gemini/config/plugins/linter-tools',
    hasSkills: true,
    hasCommands: false,
    skillsCount: 3,
  },
];

describe('PluginsModal', { timeout: 35000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPlugins.mockResolvedValue({
      plugins: mockPlugins,
      count: 2,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal with installed plugins when isOpen is true', async () => {
    render(<PluginsModal isOpen={true} onClose={vi.fn()} token="test-tok" />);

    expect(screen.getByText('ANTIGRAVITY PLUGINS')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('ai-cli-task')).toBeInTheDocument();
      expect(screen.getByText('linter-tools')).toBeInTheDocument();
    });

    expect(screen.getByText('2 INSTALLED')).toBeInTheDocument();
    expect(screen.getByText('v0.3.6')).toBeInTheDocument();
    expect(screen.getByText('15 skills')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<PluginsModal isOpen={false} onClose={vi.fn()} token="test-tok" />);
    expect(screen.queryByText('ANTIGRAVITY PLUGINS')).not.toBeInTheDocument();
  });

  it('filters plugins by search query', async () => {
    render(<PluginsModal isOpen={true} onClose={vi.fn()} token="test-tok" />);

    await waitFor(() => {
      expect(screen.getByText('ai-cli-task')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search plugins/i);
    fireEvent.change(searchInput, { target: { value: 'linter' } });

    expect(screen.queryByText('ai-cli-task')).not.toBeInTheDocument();
    expect(screen.getByText('linter-tools')).toBeInTheDocument();
  });

  it('toggles plugin enable/disable state', async () => {
    mockTogglePlugin.mockResolvedValue({ ok: true, message: 'Plugin disabled' });

    render(<PluginsModal isOpen={true} onClose={vi.fn()} token="test-tok" />);

    await waitFor(() => {
      expect(screen.getByText('ai-cli-task')).toBeInTheDocument();
    });

    const disableBtn = screen.getByRole('button', { name: 'DISABLE' });
    fireEvent.click(disableBtn);

    await waitFor(() => {
      expect(mockTogglePlugin).toHaveBeenCalledWith('test-tok', 'ai-cli-task', false);
    });
  });

  it('installs a new plugin via install form', async () => {
    mockInstallPlugin.mockResolvedValue({ ok: true, message: 'Plugin installed successfully' });

    render(<PluginsModal isOpen={true} onClose={vi.fn()} token="test-tok" />);

    await waitFor(() => {
      expect(screen.getByText('INSTALL PLUGIN')).toBeInTheDocument();
    });

    // Open install card
    fireEvent.click(screen.getByText('INSTALL PLUGIN'));

    const targetInput = screen.getByPlaceholderText(/Target: e.g./i);
    fireEvent.change(targetInput, { target: { value: 'new-plugin' } });

    const submitBtn = screen.getByRole('button', { name: 'INSTALL' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockInstallPlugin).toHaveBeenCalledWith('test-tok', 'new-plugin');
      expect(screen.getByText('Plugin installed successfully')).toBeInTheDocument();
    });
  });

  it('requires confirmation before uninstalling a plugin', async () => {
    mockUninstallPlugin.mockResolvedValue({ ok: true, message: 'Uninstalled' });

    render(<PluginsModal isOpen={true} onClose={vi.fn()} token="test-tok" />);

    await waitFor(() => {
      expect(screen.getByText('ai-cli-task')).toBeInTheDocument();
    });

    const uninstallBtns = screen.getAllByRole('button', { name: /UNINSTALL/i });
    fireEvent.click(uninstallBtns[0]);

    // Should now ask to confirm
    expect(screen.getByRole('button', { name: /CONFIRM\?/i })).toBeInTheDocument();
    expect(mockUninstallPlugin).not.toHaveBeenCalled();

    // Click confirm
    fireEvent.click(screen.getByRole('button', { name: /CONFIRM\?/i }));

    await waitFor(() => {
      expect(mockUninstallPlugin).toHaveBeenCalledWith('test-tok', 'ai-cli-task');
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const handleClose = vi.fn();
    render(<PluginsModal isOpen={true} onClose={handleClose} token="test-tok" />);

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(<PluginsModal isOpen={true} onClose={handleClose} token="test-tok" />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
