import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { LoginForm } from './LoginForm';
import * as authApi from '../api/auth';
import * as accountStorage from '../utils/accountStorage';
import { useStore } from '../store';

vi.mock('../api/auth', () => ({
  login: vi.fn(),
  verify: vi.fn(),
}));

describe('LoginForm', () => {
  const mockSetToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    localStorage.clear();

    useStore.setState({
      setToken: mockSetToken,
      token: null,
    });

    vi.mocked(authApi.verify).mockResolvedValue({
      ok: true,
      auth_required: true,
      session_prefix: 'ai-cli-online-',
    });
    vi.mocked(authApi.login).mockResolvedValue({
      ok: true,
      session_prefix: 'ai-cli-online-',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders AGY Online title and inputs', async () => {
    render(<LoginForm />);

    expect(screen.getByText('AGY Online')).toBeDefined();
    expect(screen.getByPlaceholderText('Enter AUTH_TOKEN (leave blank if none set)')).toBeDefined();
    expect(screen.getByRole('button', { name: /Connect/i })).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('Password Protected')).toBeDefined();
    });
  });

  it('submits entered token and updates store on success', async () => {
    render(<LoginForm />);

    const input = screen.getByPlaceholderText('Enter AUTH_TOKEN (leave blank if none set)');
    fireEvent.change(input, { target: { value: 'secret-token' } });

    const submitBtn = screen.getByRole('button', { name: /Connect/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('secret-token');
      expect(mockSetToken).toHaveBeenCalledWith('secret-token');
    });
  });

  it('displays error message when login fails', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      ok: false,
      error: 'Invalid authentication token',
    });

    render(<LoginForm />);

    const input = screen.getByPlaceholderText('Enter AUTH_TOKEN (leave blank if none set)');
    fireEvent.change(input, { target: { value: 'wrong-token' } });

    const submitBtn = screen.getByRole('button', { name: /Connect/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
      expect(screen.getByText('Invalid authentication token')).toBeDefined();
      expect(mockSetToken).not.toHaveBeenCalled();
    });
  });

  it('renders saved accounts and connects when clicked', async () => {
    accountStorage.saveAccount('saved-token-123', 'My Server');

    render(<LoginForm />);

    await waitFor(() => {
      expect(screen.getByText('Saved Profiles')).toBeDefined();
      expect(screen.getByText('My Server')).toBeDefined();
    });

    const savedBtn = screen.getByText('My Server').closest('button')!;
    fireEvent.click(savedBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('saved-token-123');
      expect(mockSetToken).toHaveBeenCalledWith('saved-token-123');
    });
  });
});
