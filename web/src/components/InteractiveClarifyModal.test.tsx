import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { InteractiveClarifyModal } from './InteractiveClarifyModal';
import type { ToolCall } from 'agy-online-shared';

describe('InteractiveClarifyModal', () => {
  const mockOnSubmit = vi.fn();
  const mockOnDismiss = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders multi-question schema and submits selected options', () => {
    const toolCall: ToolCall = {
      id: 'call-1',
      name: 'ask_question',
      status: 'running',
      args: {
        questions: [
          {
            question: 'Which architecture pattern do you prefer?',
            options: ['Clean Architecture', 'Monolith', 'Microservices'],
            is_multi_select: false,
          },
          {
            question: 'Which test libraries should be included?',
            options: ['Vitest', 'Playwright', 'Jest'],
            is_multi_select: true,
          },
        ],
      },
    };

    render(
      <InteractiveClarifyModal
        toolCall={toolCall}
        onSubmit={mockOnSubmit}
        onDismiss={mockOnDismiss}
      />
    );

    expect(screen.getByText('Which architecture pattern do you prefer?')).toBeInTheDocument();
    expect(screen.getByText('Clean Architecture')).toBeInTheDocument();
    expect(screen.getByText('Which test libraries should be included?')).toBeInTheDocument();

    // Select single option for question 0
    fireEvent.click(screen.getByText('Clean Architecture'));

    // Select multi options for question 1
    fireEvent.click(screen.getByText('Vitest'));
    fireEvent.click(screen.getByText('Playwright'));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT ANSWER' }));

    expect(mockOnSubmit).toHaveBeenCalledWith(
      'For "Which architecture pattern do you prefer?": Clean Architecture\nFor "Which test libraries should be included?": Vitest, Playwright'
    );
    expect(mockOnDismiss).toHaveBeenCalled();
  });

  it('renders single-question schema and submits selected answer', () => {
    const toolCall: ToolCall = {
      id: 'call-2',
      name: 'ask_question',
      status: 'running',
      args: {
        question: 'Should we proceed with database migration?',
        options: ['Yes, run migration', 'No, skip for now'],
      },
    };

    render(
      <InteractiveClarifyModal
        toolCall={toolCall}
        onSubmit={mockOnSubmit}
        onDismiss={mockOnDismiss}
      />
    );

    expect(screen.getByText('Should we proceed with database migration?')).toBeInTheDocument();
    expect(screen.getByText('Yes, run migration')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Yes, run migration'));
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT ANSWER' }));

    expect(mockOnSubmit).toHaveBeenCalledWith('For "Should we proceed with database migration?": Yes, run migration');
    expect(mockOnDismiss).toHaveBeenCalled();
  });

  it('submits custom input on pressing Enter', () => {
    const toolCall: ToolCall = {
      id: 'call-3',
      name: 'ask_question',
      status: 'running',
      args: {
        question: 'Which branch to merge?',
        options: ['main', 'develop'],
      },
    };

    render(
      <InteractiveClarifyModal
        toolCall={toolCall}
        onSubmit={mockOnSubmit}
        onDismiss={mockOnDismiss}
      />
    );

    const input = screen.getByPlaceholderText(/Type instruction or custom choice/);
    fireEvent.change(input, { target: { value: 'feature/login-oauth' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(mockOnSubmit).toHaveBeenCalledWith('feature/login-oauth');
    expect(mockOnDismiss).toHaveBeenCalled();
  });

  it('dismisses modal on pressing Escape key and backdrop click', () => {
    const toolCall: ToolCall = {
      id: 'call-4',
      name: 'ask_question',
      status: 'running',
      args: {
        question: 'Any questions?',
        options: ['No'],
      },
    };

    const { getByRole } = render(
      <InteractiveClarifyModal
        toolCall={toolCall}
        onSubmit={mockOnSubmit}
        onDismiss={mockOnDismiss}
      />
    );

    // Escape key
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);

    // Backdrop click
    const dialog = getByRole('dialog');
    fireEvent.click(dialog);
    expect(mockOnDismiss).toHaveBeenCalledTimes(2);
  });

  it('renders permission approval modal with command preview and Allow/Deny actions', () => {
    const toolCall: ToolCall = {
      id: 'call-perm-1',
      name: 'ask_permission',
      status: 'running',
      args: {
        CommandLine: 'rm -rf ./temp-cache',
        cwd: '/workspace',
      },
    };

    render(
      <InteractiveClarifyModal
        toolCall={toolCall}
        onSubmit={mockOnSubmit}
        onDismiss={mockOnDismiss}
      />
    );

    expect(screen.getByText('SECURITY // TOOL APPROVAL REQUEST')).toBeInTheDocument();
    expect(screen.getByText('rm -rf ./temp-cache')).toBeInTheDocument();

    const allowBtn = screen.getByRole('button', { name: 'ALLOW' });
    const denyBtn = screen.getByRole('button', { name: 'DENY' });
    expect(allowBtn).toBeInTheDocument();
    expect(denyBtn).toBeInTheDocument();

    fireEvent.click(allowBtn);
    expect(mockOnSubmit).toHaveBeenCalledWith('Allow permission');
    expect(mockOnDismiss).toHaveBeenCalled();
  });
});
