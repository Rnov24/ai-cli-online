import type { ChatMessage } from 'agy-online-shared';

export function exportSessionToHtml(sessionName: string, messages: ChatMessage[]): void {
  const renderedDate = new Date().toLocaleString();
  const turnsCount = messages.filter((m) => m.role === 'assistant').length;

  const escapeHtml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const messagesHtml = messages
    .map((msg, index) => {
      const isUser = msg.role === 'user';
      const roleName = isUser ? 'COMMAND // OPERATOR' : 'TURN // AGY ASSISTANT';
      const roleColor = isUser ? '#f59e0b' : '#06b6d4';
      const timeStr = new Date(msg.timestamp).toLocaleTimeString();

      let toolsHtml = '';
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        toolsHtml = `
          <div class="tool-calls-box">
            <div class="tool-calls-header">⚡ Tool Executions (${msg.toolCalls.length})</div>
            ${msg.toolCalls
              .map(
                (tc) => `
              <div class="tool-item">
                <div class="tool-name">▶ ${escapeHtml(tc.name)} [${tc.status}]</div>
                ${tc.output ? `<pre class="tool-output">${escapeHtml(tc.output.slice(0, 2000))}</pre>` : ''}
              </div>
            `,
              )
              .join('')}
          </div>
        `;
      }

      let thinkingHtml = '';
      if (msg.thinking) {
        thinkingHtml = `
          <details class="thinking-details">
            <summary>Thinking &amp; Reasoning Process</summary>
            <div class="thinking-body">${escapeHtml(msg.thinking)}</div>
          </details>
        `;
      }

      return `
        <div class="message-card ${isUser ? 'user-card' : 'assistant-card'}">
          <div class="message-header">
            <span class="role-badge" style="color: ${roleColor};">#${index + 1} ${roleName}</span>
            <span class="timestamp">${timeStr}</span>
          </div>
          <div class="message-body">
            ${thinkingHtml}
            ${toolsHtml}
            <div class="content-text">${escapeHtml(msg.content)}</div>
          </div>
        </div>
      `;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AGY Online Session - ${escapeHtml(sessionName)}</title>
  <style>
    :root {
      --bg: #090d13;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #e5e7eb;
      --text-muted: #9ca3af;
      --accent-cyan: #06b6d4;
      --accent-amber: #f59e0b;
      --accent-green: #10b981;
      --font: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "JetBrains Mono", monospace;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.5;
      margin: 0;
      padding: 24px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 18px;
      color: var(--accent-cyan);
      margin: 0 0 8px 0;
    }
    .meta {
      font-size: 12px;
      color: var(--text-muted);
    }
    .message-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .message-header {
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--border);
      padding: 6px 12px;
      display: flex;
      justify-content: space-between;
      font-size: 11px;
    }
    .role-badge {
      font-weight: 700;
    }
    .timestamp {
      color: var(--text-muted);
    }
    .message-body {
      padding: 12px 16px;
      font-size: 13px;
    }
    .content-text {
      white-space: pre-wrap;
      word-break: break-word;
    }
    .thinking-details {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 12px;
      color: var(--text-muted);
    }
    .tool-calls-box {
      background: rgba(6, 182, 212, 0.05);
      border: 1px solid rgba(6, 182, 212, 0.2);
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 12px;
    }
    .tool-calls-header {
      font-weight: 700;
      color: var(--accent-cyan);
      font-size: 11px;
      margin-bottom: 6px;
    }
    .tool-item {
      margin-top: 6px;
    }
    .tool-name {
      font-size: 11px;
      color: var(--accent-green);
    }
    .tool-output {
      background: #000;
      padding: 6px;
      border-radius: 4px;
      font-size: 11px;
      color: var(--text-muted);
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>AGY Online Session Export // ${escapeHtml(sessionName)}</h1>
      <div class="meta">Exported: ${renderedDate} | Assistant Turns: ${turnsCount} | Total Messages: ${messages.length}</div>
    </header>
    <main>
      ${messagesHtml}
    </main>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agy-session-${sessionName.replace(/[^a-z0-9_-]/gi, '_')}-${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
