import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ToolCallCard } from './ToolCallCard';
import type { ToolCall } from 'agy-online-shared';

describe('ToolCallCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders subagent dispatch card for invoke_subagent tool call with stringified arguments', () => {
    const toolCall: ToolCall = {
      id: 'tool_1',
      name: 'invoke_subagent',
      args: {
        Subagents: '[{"Model":"inherit","Prompt":"test prompt","Role":"Code Auditor"}]',
      },
      output: `Created the following subagents:
{
  "conversationId": "sub-12345"
}`,
      status: 'success',
    };

    render(<ToolCallCard toolCall={toolCall} />);

    expect(screen.getByTestId('subagent-dispatch-card')).toBeInTheDocument();
    expect(screen.getByText('SUBAGENT')).toBeInTheDocument();
    expect(screen.getByText('/Code Auditor')).toBeInTheDocument();
    expect(screen.getByText('test prompt')).toBeInTheDocument();
    expect(screen.getByText('[SEEK SUBAGENT]')).toBeInTheDocument();
  });

  it('extracts role from toolSummary when Role is omitted in Subagents argument', () => {
    const toolCall: ToolCall = {
      id: 'tool_2',
      name: 'invoke_subagent',
      args: {
        Subagents: '[{"Prompt":"do stuff"}]',
        toolSummary: '"Dispatch executor subagent for Plan 041"',
      },
      output: `Created the following subagents:
{
  "conversationId": "sub-67890"
}`,
      status: 'success',
    };

    render(<ToolCallCard toolCall={toolCall} />);

    expect(screen.getByText('/Plan 041')).toBeInTheDocument();
  });

  it('dispatches agy:seek-subagent custom event with conversationId on click', () => {
    const toolCall: ToolCall = {
      id: 'tool_3',
      name: 'invoke_subagent',
      args: {
        Subagents: '[{"Model":"inherit","Prompt":"test prompt","Role":"Code Auditor"}]',
      },
      output: `Created the following subagents:
{
  "conversationId": "sub-12345"
}`,
      status: 'success',
    };

    const handler = vi.fn();
    window.addEventListener('agy:seek-subagent', handler);

    render(<ToolCallCard toolCall={toolCall} />);

    const seekBtn = screen.getByText('[SEEK SUBAGENT]');
    fireEvent.click(seekBtn);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail?.id).toBe('sub-12345');

    window.removeEventListener('agy:seek-subagent', handler);
  });
});
