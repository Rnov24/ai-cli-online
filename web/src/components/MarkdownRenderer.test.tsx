import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownRenderer } from './MarkdownRenderer';

// Mock zustand store
vi.mock('../store', () => ({
  useStore: vi.fn((selector: (s: any) => any) => selector({ theme: 'dark', fontSize: 14 })),
}));

// Mock mermaid hook
vi.mock('../hooks/useMermaidRender', () => ({
  useMermaidRender: vi.fn(),
}));

describe('MarkdownRenderer', () => {
  it('renders unordered lists with ul and li hierarchy', () => {
    const md = `
- Item 1
- Item 2
- Item 3
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const ul = container.querySelector('ul');
    expect(ul).toBeTruthy();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Item 1');
    expect(items[1].textContent).toContain('Item 2');
    expect(items[2].textContent).toContain('Item 3');
  });

  it('renders ordered/numbered lists with ol and li elements', () => {
    const md = `
1. Step One
2. Step Two
3. Step Three
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const ol = container.querySelector('ol');
    expect(ol).toBeTruthy();
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Step One');
    expect(items[1].textContent).toContain('Step Two');
  });

  it('renders multi-level nested lists accurately', () => {
    const md = `
- Root 1
  - Child 1.1
    - Grandchild 1.1.1
- Root 2
  1. Ordered child 2.1
  2. Ordered child 2.2
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const rootUl = container.querySelector('ul');
    expect(rootUl).toBeTruthy();

    // Check nested ul
    const nestedUl = rootUl?.querySelector('ul');
    expect(nestedUl).toBeTruthy();
    expect(nestedUl?.textContent).toContain('Child 1.1');

    // Check deep nested ul
    const deepUl = nestedUl?.querySelector('ul');
    expect(deepUl).toBeTruthy();
    expect(deepUl?.textContent).toContain('Grandchild 1.1.1');

    // Check nested ol
    const nestedOl = container.querySelector('ol');
    expect(nestedOl).toBeTruthy();
    expect(nestedOl?.textContent).toContain('Ordered child 2.1');
  });

  it('renders GFM task list items with checkboxes', () => {
    const md = `
- [x] Completed task
- [ ] Pending task
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it('renders display math blocks with KaTeX', () => {
    const md = `
$$
E = mc^2
$$
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const mathBlock = container.querySelector('.katex-block-wrapper');
    expect(mathBlock).toBeTruthy();
    expect(mathBlock?.querySelector('.katex-display')).toBeTruthy();
  });

  it('renders bracket display math \\[ ... \\] with KaTeX', () => {
    const md = `
\\[
\\int_0^1 x^2 dx = \\frac{1}{3}
\\]
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const mathBlock = container.querySelector('.katex-block-wrapper');
    expect(mathBlock).toBeTruthy();
    expect(mathBlock?.querySelector('.katex-display')).toBeTruthy();
  });

  it('renders inline math $...$ and \\(...\\) with KaTeX', () => {
    const md = `The formula $a^2 + b^2 = c^2$ and \\(x + y = z\\) are fundamental.`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const inlineMath = container.querySelectorAll('.katex-inline');
    expect(inlineMath.length).toBe(2);
  });

  it('does not confuse currency or shell syntax with LaTeX math', () => {
    const md = `Price is $100 and discount is $20. Variable is \`$HOME\`.`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const inlineMath = container.querySelectorAll('.katex-inline');
    expect(inlineMath.length).toBe(0);
    expect(container.textContent).toContain('$100');
    expect(container.textContent).toContain('$20');
  });

  it('renders ```math code fences directly as KaTeX display blocks', () => {
    const md = `
\`\`\`math
\\sum_{i=1}^n i = \\frac{n(n+1)}{2}
\`\`\`
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const mathBlock = container.querySelector('.katex-block-wrapper');
    expect(mathBlock).toBeTruthy();
    expect(mathBlock?.querySelector('.katex-display')).toBeTruthy();
  });

  it('renders ```latex code blocks with Prism syntax highlighting', () => {
    const md = `
\`\`\`latex
\\documentclass{article}
\\begin{document}
Hello LaTeX!
\\end{document}
\`\`\`
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const codeWrapper = container.querySelector('.code-block-wrapper');
    expect(codeWrapper).toBeTruthy();
    expect(container.querySelector('.language-latex')).toBeTruthy();
    expect(container.textContent).toContain('Hello LaTeX!');
  });

  it('renders code line numbers and preserves line indentation', () => {
    const md = `
\`\`\`typescript
function test() {
  const a = 1;
    const b = 2;
  return a + b;
}
\`\`\`
`;
    const { container } = render(<MarkdownRenderer content={md} />);
    const lines = container.querySelectorAll('.code-line');
    expect(lines.length).toBe(5);
    const lineTexts = container.querySelectorAll('.line-text');
    expect(lineTexts.length).toBe(5);
    // Preserves indentation spaces
    expect(lineTexts[2].textContent).toContain('    const b = 2;');
  });
  it('sanitizes malicious onclick attributes from markdown input', () => {
    const md = '<span onclick="window.evil=true">test</span>';
    const { container } = render(<MarkdownRenderer content={md} />);
    expect(container.querySelector('span')?.getAttribute('onclick')).toBeNull();
  });

  it('copies code block content on copy button click via event delegation', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const md = `\`\`\`javascript
const x = 42;
\`\`\``;
    const { container } = render(<MarkdownRenderer content={md} />);
    const copyBtn = container.querySelector('.code-copy-btn') as HTMLButtonElement;
    expect(copyBtn).toBeTruthy();

    copyBtn.click();
    expect(writeTextMock).toHaveBeenCalledWith('const x = 42;');
  });
});
