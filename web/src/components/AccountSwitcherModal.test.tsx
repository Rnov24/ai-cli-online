import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AccountSwitcherModal } from './AccountSwitcherModal';
import * as authApi from '../api/auth';
import * as agyApi from '../api/agyProfiles';
import * as accountStorage from '../utils/accountStorage';
import { useStore } from '../store';

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('../api/agyProfiles', () => ({
  fetchAgyProfiles: vi.fn(),
  switchAgyProfile: vi.fn(),
  saveCurrentAgyProfile: vi.fn(),
  importAgyProfile: vi.fn(),
  renameAgyProfile: vi.fn(),
  deleteAgyProfile: vi.fn(),
  startAgyAuth: vi.fn(),
  submitAgyAuthCode: vi.fn(),
  cancelAgyAuth: vi.fn(),
}));

describe('AccountSwitcherModal', () => {
  const mockSetToken = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    localStorage.clear();

    useStore.setState({
      setToken: mockSetToken,
      token: 'current-token-123',
    });

    vi.mocked(authApi.login).mockResolvedValue({
      ok: true,
      session_prefix: 'ai-cli-online-',
    });

    vi.mocked(agyApi.fetchAgyProfiles).mockResolvedValue({
      current: 'default',
      profiles: [
        { name: 'default', isActive: true, updatedAt: 1700000000000, hasToken: true },
        { name: 'work-corp', isActive: false, updatedAt: 1700000100000, hasToken: true },
      ],
    });

    vi.mocked(agyApi.switchAgyProfile).mockResolvedValue({ ok: true, current: 'work-corp' });
    vi.mocked(agyApi.saveCurrentAgyProfile).mockResolvedValue({ ok: true, current: 'personal' });
    vi.mocked(agyApi.renameAgyProfile).mockResolvedValue({ ok: true });
    vi.mocked(agyApi.deleteAgyProfile).mockResolvedValue({ ok: true });
    vi.mocked(agyApi.startAgyAuth).mockResolvedValue({
      flowId: 'flow-test-123',
      profileName: 'new-account',
      authUrl: 'https://accounts.google.com/o/oauth2/auth?test=1',
      manualTerminalCommand: 'bash scripts/agy-profile.sh add new-account',
    });
    vi.mocked(agyApi.submitAgyAuthCode).mockResolvedValue({ ok: true, current: 'new-account' });
    vi.mocked(agyApi.importAgyProfile).mockResolvedValue({ ok: true, current: 'pasted-profile' });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<AccountSwitcherModal isOpen={false} onClose={mockOnClose} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Google Antigravity header and active profile when isOpen is true', async () => {
    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText(/GOOGLE ANTIGRAVITY \(AGY\) ACCOUNTS \/\//i)).toBeDefined();
    expect(screen.getByText(/◈ ACTIVE GOOGLE IDENTITY/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('work-corp')).toBeDefined();
      expect(screen.getByText('ACTIVE')).toBeDefined();
    });
  });

  it('switches Google Antigravity profile when clicking SWITCH', async () => {
    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('work-corp')).toBeDefined();
    });

    const switchBtn = screen.getByRole('button', { name: 'SWITCH' });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(agyApi.switchAgyProfile).toHaveBeenCalledWith('work-corp', 'current-token-123');
    });
  });

  it('allows quick saving the current active account as a named profile', async () => {
    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    await waitFor(() => {
      expect(screen.getByText('work-corp')).toBeDefined();
    });

    const openSaveBtn = screen.getByRole('button', { name: /Save Current Active Account as New Named Profile/i });
    fireEvent.click(openSaveBtn);

    const input = screen.getByPlaceholderText('e.g. personal, work-laptop');
    fireEvent.change(input, { target: { value: 'personal' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(agyApi.saveCurrentAgyProfile).toHaveBeenCalledWith('personal', 'current-token-123');
    });
  });

  it('handles the Google Auth Helper flow with link generation and code submission', async () => {
    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    // Open OAuth Link Helper tab
    const oauthTabBtn = screen.getByRole('button', { name: 'OAuth Link Helper' });
    fireEvent.click(oauthTabBtn);

    const nameInput = screen.getByPlaceholderText('e.g. enterprise-work, secondary-gmail');
    fireEvent.change(nameInput, { target: { value: 'new-account' } });

    const genLinkBtn = screen.getByRole('button', { name: 'Generate Google Auth Link' });
    fireEvent.click(genLinkBtn);

    await waitFor(() => {
      expect(agyApi.startAgyAuth).toHaveBeenCalledWith('new-account', 'current-token-123');
      expect(screen.getByRole('button', { name: /Open Google Sign-In Page/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Copy Link/i })).toBeDefined();
    });

    // Enter authorization code
    const codeInput = screen.getByPlaceholderText('Paste authorization code from Google');
    fireEvent.change(codeInput, { target: { value: '4/0AZV...' } });

    const completeBtn = screen.getByRole('button', { name: 'Complete Sign-In & Activate' });
    fireEvent.click(completeBtn);

    await waitFor(() => {
      expect(agyApi.submitAgyAuthCode).toHaveBeenCalledWith('flow-test-123', 'new-account', '4/0AZV...', 'current-token-123');
    });
  });

  it('handles Direct Token Paste tab', async () => {
    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    const pasteTabBtn = screen.getByRole('button', { name: 'Direct Token Paste' });
    fireEvent.click(pasteTabBtn);

    const nameInput = screen.getByPlaceholderText('e.g. work, vertex-account');
    const tokenTextarea = screen.getByPlaceholderText(/Paste \{"token":\{"access_token":"ya29\.\.\."\}\}/i);

    fireEvent.change(nameInput, { target: { value: 'pasted-profile' } });
    fireEvent.change(tokenTextarea, { target: { value: '{"token":{"access_token":"ya29.xyz"}}' } });

    const importBtn = screen.getByRole('button', { name: 'Import & Activate Profile' });
    fireEvent.click(importBtn);

    await waitFor(() => {
      expect(agyApi.importAgyProfile).toHaveBeenCalledWith('pasted-profile', '{"token":{"access_token":"ya29.xyz"}}', 'current-token-123');
    });
  });

  it('handles disconnecting web session from footer', () => {
    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    const logoutBtn = screen.getByRole('button', { name: /Disconnect Web Session/i });
    fireEvent.click(logoutBtn);

    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(mockOnClose).toHaveBeenCalled();
  });
});
