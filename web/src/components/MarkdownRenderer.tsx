import { useMemo, useRef } from 'react';
import { marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import { useStore } from '../store';
import { useMermaidRender } from '../hooks/useMermaidRender';

import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-latex';
import { setupMarkedMath, renderMathBlock } from '../utils/markdownMath';

// Initialize KaTeX math extensions for marked parser
setupMarkedMath(marked);

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function normalizeLang(lang: string): string {
  const l = (lang || '').toLowerCase().trim();
  switch (l) {
    case 'ts': case 'typescript': return 'typescript';
    case 'js': case 'javascript': return 'javascript';
    case 'tsx': return 'tsx';
    case 'jsx': return 'jsx';
    case 'golang': case 'go': return 'go';
    case 'py': case 'python': return 'python';
    case 'sh': case 'bash': case 'shell': case 'zsh': return 'bash';
    case 'yml': case 'yaml': return 'yaml';
    case 'json': return 'json';
    case 'md': case 'markdown': return 'markdown';
    case 'diff': case 'patch': return 'diff';
    case 'sql': return 'sql';
    case 'html': case 'xml': case 'svg': return 'markup';
    case 'css': return 'css';
    case 'mermaid': return 'mermaid';
    case 'latex': case 'tex': return 'latex';
    case 'math': return 'math';
    default: return l || 'text';
  }
}

function processAlerts(md: string): string {
  const alertRegex = />\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n((?:>.*(?:\n|$))*)/gi;
  return md.replace(alertRegex, (_match, type, content) => {
    const cleanType = type.toUpperCase();
    const cleanContent = content
      .split('\n')
      .map((line: string) => line.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    return `<div class="gh-alert gh-alert-${cleanType.toLowerCase()}"><div class="gh-alert-title">${cleanType}</div><div class="gh-alert-content">\n\n${cleanContent}\n\n</div></div>\n\n`;
  });
}

function addLineNumbers(html: string): string {
  const lines = html.split('\n');
  if (lines.length <= 1) return html;
  return lines
    .map((line, i) => `<span class="code-line"><span class="line-num">${i + 1}</span><span class="line-text">${line || ' '}</span></span>`)
    .join('\n');
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const theme = useStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content) return '';

    const processed = processAlerts(content);
    const renderer = new marked.Renderer();

    renderer.code = function (token: Tokens.Code) {
      const language = normalizeLang(token.lang || '');

      // Leave mermaid for hook to render
      if (language === 'mermaid') {
        return `<pre><code class="language-mermaid">${token.text}</code></pre>`;
      }

      // Render math code fence blocks directly via KaTeX
      if (language === 'math') {
        return renderMathBlock(token.text);
      }

      let highlighted = token.text;
      if (Prism.languages[language]) {
        try {
          highlighted = Prism.highlight(token.text, Prism.languages[language], language);
        } catch {
          highlighted = token.text;
        }
      }

      const lineCount = token.text.split('\n').length;
      const numberedHtml = lineCount > 2 ? addLineNumbers(highlighted) : highlighted;
      const encodedCode = encodeURIComponent(token.text);

      return `
        <div class="code-block-wrapper" data-code="${encodedCode}">
          <div class="code-block-header">
            <div class="code-block-meta">
              <span class="code-dots"><i></i><i></i><i></i></span>
              <span class="code-block-lang">${language || 'text'}</span>
              <span class="code-block-lines">// ${lineCount}L</span>
            </div>
            <button class="code-copy-btn" onclick="
              const text = decodeURIComponent(this.closest('.code-block-wrapper').getAttribute('data-code'));
              navigator.clipboard.writeText(text);
              this.textContent = '✓ COPIED';
              this.classList.add('copied');
              setTimeout(() => { this.textContent = '[COPY]'; this.classList.remove('copied'); }, 2000);
            ">[COPY]</button>
          </div>
          <pre class="language-${language}"><code class="language-${language}">${numberedHtml}</code></pre>
        </div>
      `;
    };

    const raw = marked.parse(processed, {
      gfm: true,
      breaks: true,
      renderer,
      async: false,
    }) as string;

    return DOMPurify.sanitize(raw, {
      ADD_TAGS: ['button', 'span', 'div'],
      ADD_ATTR: ['onclick', 'data-code', 'class', 'style', 'aria-hidden'],
    });
  }, [content]);

  // Live Mermaid diagrams rendering
  useMermaidRender(containerRef, html, theme);

  return (
    <div
      ref={containerRef}
      className={`markdown-body-rich ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
