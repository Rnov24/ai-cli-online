import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AutoTaskModal } from './AutoTaskModal';
import { startTaskAuto, stopTaskAuto, getTaskAutoStatus } from '../api/taskAuto';

vi.mock('../api/taskAuto', () => ({
  startTaskAuto: vi.fn(),
  stopTaskAuto: vi.fn(),
  getTaskAutoStatus: vi.fn(),
}));

const mockStartTaskAuto = vi.mocked(startTaskAuto);
const mockStopTaskAuto = vi.mocked(stopTaskAuto);
const mockGetTaskAutoStatus = vi.mocked(getTaskAutoStatus);

describe('AutoTaskModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTaskAutoStatus.mockResolvedValue({ running: false });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(
      <AutoTaskModal
        isOpen={false}
        onClose={vi.fn()}
        sessionId="test-session"
        token="test-token"
      />
    );
    expect(screen.queryByTestId('auto-task-modal')).toBeNull();
  });

  it('renders modal with initial module input when open', async () => {
    render(
      <AutoTaskModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="test-session"
        token="test-token"
        initialTaskModule="auth-refactor"
        workspaceDir="/home/workspace"
      />
    );

    expect(screen.getByTestId('auto-task-modal')).toBeTruthy();
    expect(screen.getByText('AUTONOMOUS TASK LIFECYCLE')).toBeTruthy();

    const input = screen.getByLabelText('Task Module Directory') as HTMLInputElement;
    expect(input.value).toBe('/home/workspace/AiTasks/auth-refactor');
  });

  it('starts auto mode when start form is submitted', async () => {
    mockStartTaskAuto.mockResolvedValue({ ok: true });

    render(
      <AutoTaskModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="test-session"
        token="test-token"
        initialTaskModule="test-module"
      />
    );

    const form = screen.getByText('START AUTO LOOP').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockStartTaskAuto).toHaveBeenCalledWith(
        'test-token',
        'test-session',
        expect.objectContaining({
          taskDir: 'AiTasks/test-module',
          maxIterations: 20,
          timeoutMinutes: 30,
        })
      );
    });
  });

  it('displays running state telemetry when auto loop is active', async () => {
    mockGetTaskAutoStatus.mockResolvedValue({
      running: true,
      sessionName: 'session-123',
      taskDir: '/workspace/AiTasks/feature-x',
      maxIterations: 20,
      timeoutMinutes: 30,
      iterationCount: 4,
      elapsedSeconds: 154,
      signal: {
        step: 'check',
        result: 'PASS',
        next: 'exec',
        checkpoint: 'post-plan',
        iteration: 4,
        timestamp: '2026-09-08T18:00:00Z',
      },
    });

    render(
      <AutoTaskModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="test-session"
        token="test-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('RUNNING')).toBeTruthy();
      expect(screen.getByText('#4')).toBeTruthy();
      expect(screen.getByText('02:34')).toBeTruthy();
      expect(screen.getByText('CHECK')).toBeTruthy();
      expect(screen.getByText('STOP AUTO LOOP')).toBeTruthy();
    });
  });

  it('calls stopTaskAuto when STOP AUTO LOOP is clicked', async () => {
    mockGetTaskAutoStatus.mockResolvedValue({
      running: true,
      sessionName: 'session-123',
      taskDir: '/workspace/AiTasks/feature-x',
      maxIterations: 20,
      timeoutMinutes: 30,
      iterationCount: 1,
      elapsedSeconds: 30,
    });
    mockStopTaskAuto.mockResolvedValue({ ok: true });

    render(
      <AutoTaskModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId="test-session"
        token="test-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('STOP AUTO LOOP')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('STOP AUTO LOOP'));

    await waitFor(() => {
      expect(mockStopTaskAuto).toHaveBeenCalledWith('test-token', 'test-session');
    });
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <AutoTaskModal
        isOpen={true}
        onClose={onClose}
        sessionId="test-session"
        token="test-token"
      />
    );

    const closeBtn = screen.getByLabelText('Close dialog');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
