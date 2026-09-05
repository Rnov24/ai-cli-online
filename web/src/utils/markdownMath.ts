import { marked } from 'marked';
import katex from 'katex';

/**
 * Escapes HTML characters for safe raw fallback display.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render display LaTeX formula into a styled, responsive wrapper.
 */
export function renderMathBlock(tex: string): string {
  try {
    const rendered = katex.renderToString(tex, {
      displayMode: true,
      throwOnError: false,
    });
    return `<div class="katex-block-wrapper"><div class="katex-display-container">${rendered}</div></div>`;
  } catch (err) {
    console.warn('[MarkdownMath] Failed to render LaTeX display block:', err);
    return `<div class="katex-block-wrapper katex-block-error"><pre class="katex-raw-tex"><code>${escapeHtml(tex)}</code></pre></div>`;
  }
}

/**
 * Render inline LaTeX formula with baseline alignment.
 */
export function renderMathInline(tex: string): string {
  try {
    const rendered = katex.renderToString(tex, {
      displayMode: false,
      throwOnError: false,
    });
    return `<span class="katex-inline">${rendered}</span>`;
  } catch (err) {
    console.warn('[MarkdownMath] Failed to render LaTeX inline formula:', err);
    return `<code class="katex-inline-raw">${escapeHtml(tex)}</code>`;
  }
}

let isMathSetup = false;

/**
 * Register mathBlock and mathInline extensions into marked.
 */
export function setupMarkedMath(markedInstance: typeof marked = marked): void {
  if (isMathSetup) return;
  isMathSetup = true;

  markedInstance.use({
    extensions: [
      {
        name: 'mathBlock',
        level: 'block',
        start(src: string) {
          const idxDollar = src.indexOf('$$');
          const idxBracket = src.indexOf('\\[');
          if (idxDollar === -1) return idxBracket;
          if (idxBracket === -1) return idxDollar;
          return Math.min(idxDollar, idxBracket);
        },
        tokenizer(src: string) {
          const matchDollar = /^\$\$([\s\S]+?)\$\$/.exec(src);
          if (matchDollar) {
            return {
              type: 'mathBlock',
              raw: matchDollar[0],
              text: matchDollar[1].trim(),
            };
          }
          const matchBracket = /^\\\[([\s\S]+?)\\\]/.exec(src);
          if (matchBracket) {
            return {
              type: 'mathBlock',
              raw: matchBracket[0],
              text: matchBracket[1].trim(),
            };
          }
        },
        renderer(token) {
          const text = (token as { text?: string }).text ?? '';
          return renderMathBlock(text) + '\n';
        },
      },
      {
        name: 'mathInline',
        level: 'inline',
        start(src: string) {
          const idxDollar = src.indexOf('$');
          const idxParen = src.indexOf('\\(');
          if (idxDollar === -1) return idxParen;
          if (idxParen === -1) return idxDollar;
          return Math.min(idxDollar, idxParen);
        },
        tokenizer(src: string) {
          // Explicit \( ... \) math
          const matchParen = /^\\\(([\s\S]+?)\\\)/.exec(src);
          if (matchParen) {
            return {
              type: 'mathInline',
              raw: matchParen[0],
              text: matchParen[1].trim(),
            };
          }

          // Inline $ ... $ math
          // - Cannot start with a space or digit followed by word/punct/space (e.g. $100 or $20.00)
          // - Cannot end with a space
          // - Cannot contain backticks ` (which belongs to inline code)
          // - Cannot cross newlines
          const matchDollar = /^\$(?!\s)(?!\d+(?:[.,]\d+)?(?:\b|[.,\s]|$))([^`$\n]+?)(?<!\s)\$/.exec(src);
          if (matchDollar) {
            const content = matchDollar[1].trim();
            if (content) {
              return {
                type: 'mathInline',
                raw: matchDollar[0],
                text: content,
              };
            }
          }
        },
        renderer(token) {
          const text = (token as { text?: string }).text ?? '';
          return renderMathInline(text);
        },
      },
    ],
  });
}
