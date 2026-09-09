import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AccountSwitcherModal } from './AccountSwitcherModal';
import * as authApi from '../api/auth';
import * as accountStorage from '../utils/accountStorage';
import { useStore } from '../store';

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  verify: vi.fn(),
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
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<AccountSwitcherModal isOpen={false} onClose={mockOnClose} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal and saved accounts when isOpen is true', () => {
    accountStorage.saveAccount('current-token-123', 'Active Profile');
    accountStorage.saveAccount('other-token-456', 'Work VPS');

    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('SWITCH ACCOUNT / PROFILE')).toBeDefined();
    expect(screen.getByText('Active Profile')).toBeDefined();
    expect(screen.getByText('Work VPS')).toBeDefined();
    expect(screen.getByText('ACTIVE')).toBeDefined();
  });

  it('switches to selected account', async () => {
    accountStorage.saveAccount('current-token-123', 'Active Profile');
    accountStorage.saveAccount('other-token-456', 'Work VPS');

    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    const switchBtn = screen.getByRole('button', { name: 'Switch' });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('other-token-456');
      expect(mockSetToken).toHaveBeenCalledWith('other-token-456');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('allows renaming an account', async () => {
    accountStorage.saveAccount('test-token', 'Old Name');

    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    const renameBtn = screen.getByLabelText('Rename Old Name');
    fireEvent.click(renameBtn);

    const input = screen.getByDisplayValue('Old Name');
    fireEvent.change(input, { target: { value: 'New Custom Name' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('New Custom Name')).toBeDefined();
    });
  });

  it('allows removing an account', async () => {
    accountStorage.saveAccount('to-delete', 'Temporary Account');

    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Temporary Account')).toBeDefined();

    const deleteBtn = screen.getByLabelText('Remove Temporary Account');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByText('Temporary Account')).toBeNull();
    });
  });

  it('allows adding and connecting a new account token', async () => {
    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    const addToggleBtn = screen.getByRole('button', { name: /Add Another Account/i });
    fireEvent.click(addToggleBtn);

    const tokenInput = screen.getByPlaceholderText('Enter token string');
    const nameInput = screen.getByPlaceholderText('e.g. Work Laptop, VPS');

    fireEvent.change(tokenInput, { target: { value: 'new-shiny-token' } });
    fireEvent.change(nameInput, { target: { value: 'Staging Server' } });

    const submitBtn = screen.getByRole('button', { name: 'Connect Profile' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('new-shiny-token');
      expect(mockSetToken).toHaveBeenCalledWith('new-shiny-token');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('handles disconnect / logout', () => {
    render(<AccountSwitcherModal isOpen={true} onClose={mockOnClose} />);

    const logoutBtn = screen.getByRole('button', { name: /Disconnect \/ Logout/i });
    fireEvent.click(logoutBtn);

    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(mockOnClose).toHaveBeenCalled();
  });
});
