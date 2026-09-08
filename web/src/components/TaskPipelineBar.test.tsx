import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TaskPipelineBar } from './TaskPipelineBar';

describe('TaskPipelineBar Component', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders all 8 sequential lifecycle steps', () => {
    const onRunSkill = vi.fn();
    render(<TaskPipelineBar onRunSkill={onRunSkill} />);

    expect(screen.getByText('INIT')).toBeInTheDocument();
    expect(screen.getByText('PLAN')).toBeInTheDocument();
    expect(screen.getByText('RES')).toBeInTheDocument();
    expect(screen.getByText('CHK')).toBeInTheDocument();
    expect(screen.getByText('EXEC')).toBeInTheDocument();
    expect(screen.getByText('VRFY')).toBeInTheDocument();
    expect(screen.getByText('MRG')).toBeInTheDocument();
    expect(screen.getByText('REPT')).toBeInTheDocument();
  });

  it('renders quick action buttons: LIST, CANCEL, and AUTO // LOOP', () => {
    const onRunSkill = vi.fn();
    render(<TaskPipelineBar onRunSkill={onRunSkill} />);

    expect(screen.getByRole('button', { name: /query task status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel task/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trigger autonomous task loop/i })).toBeInTheDocument();
  });

  it('runs bare commands when module input is empty', () => {
    const onRunSkill = vi.fn();
    render(<TaskPipelineBar onRunSkill={onRunSkill} />);

    const initBtn = screen.getByRole('button', { name: /initialize task module/i });
    fireEvent.click(initBtn);
    expect(onRunSkill).toHaveBeenCalledWith('/init');

    const resBtn = screen.getByRole('button', { name: /research external references/i });
    fireEvent.click(resBtn);
    expect(onRunSkill).toHaveBeenCalledWith('/research');

    const listBtn = screen.getByRole('button', { name: /query task status/i });
    fireEvent.click(listBtn);
    expect(onRunSkill).toHaveBeenCalledWith('/list');
  });

  it('runs parameterized commands when module name is typed', () => {
    const onRunSkill = vi.fn();
    render(<TaskPipelineBar currentModule="auth-flow" onRunSkill={onRunSkill} />);

    const planBtn = screen.getByRole('button', { name: /step-by-step implementation planning/i });
    fireEvent.click(planBtn);
    expect(onRunSkill).toHaveBeenCalledWith('/plan auth-flow');

    const autoBtn = screen.getByRole('button', { name: /trigger autonomous task loop/i });
    fireEvent.click(autoBtn);
    expect(onRunSkill).toHaveBeenCalledWith('/auto auth-flow');

    const cancelBtn = screen.getByRole('button', { name: /cancel task/i });
    fireEvent.click(cancelBtn);
    expect(onRunSkill).toHaveBeenCalledWith('/cancel auth-flow');
  });

  it('updates module name on input change', () => {
    const onRunSkill = vi.fn();
    render(<TaskPipelineBar onRunSkill={onRunSkill} />);

    const input = screen.getByLabelText(/target task module name/i);
    fireEvent.change(input, { target: { value: 'payment-v2' } });

    const execBtn = screen.getByRole('button', { name: /execute implementation plan/i });
    fireEvent.click(execBtn);
    expect(onRunSkill).toHaveBeenCalledWith('/exec payment-v2');
  });

  it('contains no raw emojis in rendered output (antislop verification)', () => {
    const onRunSkill = vi.fn();
    const { container } = render(<TaskPipelineBar onRunSkill={onRunSkill} />);

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(container.textContent || '')).toBe(false);
  });

  it('synchronizes module input when currentModule prop updates', () => {
    const onRunSkill = vi.fn();
    const { rerender } = render(<TaskPipelineBar currentModule="initial-task" onRunSkill={onRunSkill} />);

    const input = screen.getByLabelText(/target task module name/i) as HTMLInputElement;
    expect(input.value).toBe('initial-task');

    rerender(<TaskPipelineBar currentModule="switched-task" onRunSkill={onRunSkill} />);
    expect(input.value).toBe('switched-task');
  });

  it('triggers auto loop when Enter key is pressed in module input', () => {
    const onRunSkill = vi.fn();
    const onOpenAutoModal = vi.fn();
    render(
      <TaskPipelineBar
        currentModule=""
        onRunSkill={onRunSkill}
        onOpenAutoModal={onOpenAutoModal}
      />
    );

    const input = screen.getByLabelText(/target task module name/i);
    fireEvent.change(input, { target: { value: 'hotfix-42' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRunSkill).toHaveBeenCalledWith('/auto hotfix-42');
    expect(onOpenAutoModal).toHaveBeenCalledWith('hotfix-42');
  });

  it('dispatches agy:open-auto-task custom event when onOpenAutoModal is omitted', () => {
    const onRunSkill = vi.fn();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(<TaskPipelineBar currentModule="auth-v3" onRunSkill={onRunSkill} />);

    const autoBtn = screen.getByRole('button', { name: /trigger autonomous task loop/i });
    fireEvent.click(autoBtn);

    expect(onRunSkill).toHaveBeenCalledWith('/auto auth-v3');
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'agy:open-auto-task',
        detail: { module: 'auth-v3' },
      })
    );
  });

  it('provides toolbar and group ARIA roles for accessibility', () => {
    const onRunSkill = vi.fn();
    render(<TaskPipelineBar onRunSkill={onRunSkill} />);

    expect(screen.getByRole('toolbar', { name: /task lifecycle pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /lifecycle steps/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /task quick actions/i })).toBeInTheDocument();
  });
});
