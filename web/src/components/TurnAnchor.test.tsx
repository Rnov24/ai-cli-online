import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TurnAnchor } from './TurnAnchor';
import type { ChatMessage } from 'agy-online-shared';

describe('TurnAnchor', () => {
  afterEach(() => {
    cleanup();
  });

  const baseMessage: ChatMessage = {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    timestamp: 1700000000000,
    status: 'streaming',
    turnStatus: 'running',
    toolCalls: [],
  };

  it('does not render "Synthesizing response..." placeholder during streaming', () => {
    const { container } = render(
      <TurnAnchor
        message={baseMessage}
        turnIndex={0}
        isStreaming={true}
        globalMode="transparent"
      />
    );

    expect(container.textContent).not.toContain('Synthesizing response...');
  });

  it('renders active tool execution telemetry when tool is running', () => {
    const runningMessage: ChatMessage = {
      ...baseMessage,
      toolCalls: [
        {
          id: 'tc-1',
          name: 'run_command',
          args: { CommandLine: 'go test -v ./...' },
          status: 'running',
        },
      ],
    };

    render(
      <TurnAnchor
        message={runningMessage}
        turnIndex={0}
        isStreaming={true}
        globalMode="transparent"
      />
    );

    const executingIndicator = screen.getByTestId('executing-telemetry');
    expect(executingIndicator).toBeInTheDocument();
    expect(executingIndicator.textContent).toContain('EXECUTING // RUN_COMMAND');
    expect(executingIndicator.textContent).toContain('go test -v ./...');
  });

  it('renders streaming response telemetry when streaming content and no tool running', () => {
    render(
      <TurnAnchor
        message={baseMessage}
        turnIndex={0}
        isStreaming={true}
        globalMode="transparent"
      />
    );

    const streamingIndicator = screen.getByTestId('streaming-telemetry');
    expect(streamingIndicator).toBeInTheDocument();
    expect(streamingIndicator.textContent).toContain('STREAMING RESPONSE...');
  });

  it('respects verbosityMode prop (minimal vs verbose vs compact)', () => {
    // In minimal mode with streaming empty message: subtle pulse dot, no text
    const { container, rerender } = render(
      <TurnAnchor
        message={baseMessage}
        turnIndex={0}
        isStreaming={true}
        verbosityMode="minimal"
      />
    );

    const minimalTelemetry = screen.getByTestId('streaming-minimal-telemetry');
    expect(minimalTelemetry).toBeInTheDocument();
    expect(minimalTelemetry.textContent).not.toContain('STREAMING RESPONSE...');

    // In verbose mode: full streaming response text
    rerender(
      <TurnAnchor
        message={baseMessage}
        turnIndex={0}
        isStreaming={true}
        verbosityMode="verbose"
      />
    );
    expect(screen.getByTestId('streaming-telemetry')).toBeInTheDocument();
    expect(screen.getByText('STREAMING RESPONSE...')).toBeInTheDocument();

    // In compact mode: worklog summary rendered
    rerender(
      <TurnAnchor
        message={baseMessage}
        turnIndex={0}
        isStreaming={true}
        verbosityMode="compact"
      />
    );
    expect(screen.getByText(/WORKLOG SUMMARY/)).toBeInTheDocument();
  });
});
