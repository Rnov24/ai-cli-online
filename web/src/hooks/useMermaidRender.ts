import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import DOMPurify from 'dompurify';

/** Lazy-load mermaid from CDN to avoid npm dependency conflicts */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mermaidPromise: Promise<any> | null = null;
let currentMermaidTheme: 'dark' | 'light' = 'dark';

const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
  'https://unpkg.com/mermaid@11/dist/mermaid.esm.min.mjs',
];

const DARK_THEME_VARS = {
  primaryColor: '#38bdf8',
  primaryTextColor: '#ffffff',
  primaryBorderColor: '#363c46',
  lineColor: '#8b939e',
  secondaryColor: '#a855f7',
  tertiaryColor: '#121519',
  background: '#08090b',
  mainBkg: '#121519',
  nodeBorder: '#363c46',
  clusterBkg: '#0d0f12',
  titleColor: '#e8ebef',
  edgeLabelBackground: '#121519',
  // Gantt-specific
  gridColor: '#252a31',
  doneTaskBkgColor: '#10b981',
  doneTaskBorderColor: '#059669',
  activeTaskBkgColor: '#f59e0b',
  activeTaskBorderColor: '#fbbf24',
  critBkgColor: '#ef4444',
  critBorderColor: '#dc2626',
  taskBkgColor: '#171b20',
  taskBorderColor: '#252a31',
  taskTextColor: '#e8ebef',
  taskTextDarkColor: '#08090b',
  sectionBkgColor: '#0d0f12',
  sectionBkgColor2: '#121519',
  altSectionBkgColor: '#0d0f12',
  todayLineColor: '#f59e0b',
};

const LIGHT_THEME_VARS = {
  primaryColor: '#0284c7',
  primaryTextColor: '#020617',
  primaryBorderColor: '#94a3b8',
  lineColor: '#475569',
  secondaryColor: '#7c3aed',
  tertiaryColor: '#f8fafc',
  background: '#ffffff',
  mainBkg: '#f8fafc',
  nodeBorder: '#94a3b8',
  clusterBkg: '#f0f2f5',
  titleColor: '#0f172a',
  edgeLabelBackground: '#ffffff',
  // Gantt-specific
  gridColor: '#cbd5e1',
  doneTaskBkgColor: '#059669',
  doneTaskBorderColor: '#047857',
  activeTaskBkgColor: '#d97706',
  activeTaskBorderColor: '#b45309',
  critBkgColor: '#dc2626',
  critBorderColor: '#b91c1c',
  taskBkgColor: '#ffffff',
  taskBorderColor: '#cbd5e1',
  taskTextColor: '#0f172a',
  taskTextDarkColor: '#ffffff',
  sectionBkgColor: '#f0f2f5',
  sectionBkgColor2: '#f8fafc',
  altSectionBkgColor: '#f0f2f5',
  todayLineColor: '#d97706',
};

const GANTT_CONFIG = {
  titleTopMargin: 15,
  barHeight: 24,
  barGap: 6,
  topPadding: 40,
  numberSectionStyles: 4,
  useWidth: 800,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configureMermaid(mermaid: any, theme: 'dark' | 'light') {
  currentMermaidTheme = theme;
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    themeVariables: theme === 'dark' ? DARK_THEME_VARS : LIGHT_THEME_VARS,
    gantt: GANTT_CONFIG,
  });
  return mermaid;
}

export function loadMermaid(theme: 'dark' | 'light' = 'dark') {
  if (mermaidPromise) {
    // Re-configure theme if changed
    if (currentMermaidTheme !== theme) {
      return mermaidPromise.then((mermaid) => configureMermaid(mermaid, theme));
    }
    return mermaidPromise;
  }
  mermaidPromise = (async () => {
    for (const url of CDN_URLS) {
      try {
        const mod = await import(/* @vite-ignore */ url);
        return configureMermaid(mod.default, theme);
      } catch (e) {
        console.warn(`[mermaid] CDN failed: ${url}`, e);
      }
    }
    // All CDNs failed — reset so next call retries
    mermaidPromise = null;
    throw new Error('All mermaid CDN sources failed');
  })();
  return mermaidPromise;
}

let idCounter = 0;

/** Render mermaid/gantt code blocks inside a container element.
 *  Re-renders existing diagrams when theme changes. */
export function useMermaidRender(
  containerRef: RefObject<HTMLElement | null>,
  dependency: unknown,
  theme: 'dark' | 'light' = 'dark',
) {
  const prevThemeRef = useRef(theme);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const themeChanged = prevThemeRef.current !== theme;
    prevThemeRef.current = theme;

    // Find new code blocks to render
    const codeBlocks = el.querySelectorAll<HTMLElement>(
      'code.language-mermaid, code.language-gantt'
    );
    // Find existing diagrams that need re-rendering on theme change
    const existingDiagrams = themeChanged
      ? el.querySelectorAll<HTMLElement>('.mermaid-diagram[data-mermaid-source]')
      : [];

    if (codeBlocks.length === 0 && existingDiagrams.length === 0) return;

    let cancelled = false;

    (async () => {
      let mermaid;
      try {
        mermaid = await loadMermaid(theme);
      } catch (e) {
        console.error('[mermaid] Failed to load library:', e);
        if (cancelled) return;
        for (const codeEl of codeBlocks) {
          const pre = codeEl.parentElement;
          if (!pre || pre.tagName !== 'PRE') continue;
          pre.classList.add('mermaid-error');
          const errDiv = document.createElement('div');
          errDiv.className = 'mermaid-error__msg';
          errDiv.textContent = 'Failed to load Mermaid library';
          pre.appendChild(errDiv);
        }
        return;
      }
      if (cancelled) return;

      // Re-render existing diagrams with new theme
      for (const wrapper of existingDiagrams) {
        if (cancelled) break;
        const definition = wrapper.getAttribute('data-mermaid-source');
        if (!definition) continue;

        const id = `mermaid-${++idCounter}`;
        try {
          const { svg } = await mermaid.render(id, definition);
          if (cancelled) break;
          // SVG is sanitized via DOMPurify before DOM insertion — safe against XSS
          wrapper.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] });
        } catch {
          // Keep existing diagram on re-render failure
        }
      }

      // Render new code blocks
      for (const codeEl of codeBlocks) {
        if (cancelled) break;
        const pre = codeEl.parentElement;
        if (!pre || pre.tagName !== 'PRE') continue;

        const definition = codeEl.textContent || '';
        if (!definition.trim()) continue;

        const id = `mermaid-${++idCounter}`;
        try {
          const { svg } = await mermaid.render(id, definition);
          if (cancelled) break;

          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-diagram';
          wrapper.setAttribute('data-mermaid-source', definition);
          // SVG is sanitized via DOMPurify before DOM insertion — safe against XSS
          wrapper.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['foreignObject'] });
          pre.replaceWith(wrapper);
        } catch {
          if (cancelled) break;
          pre.classList.add('mermaid-error');
          const errSpan = document.createElement('div');
          errSpan.className = 'mermaid-error__msg';
          errSpan.textContent = 'Mermaid syntax error';
          pre.appendChild(errSpan);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [dependency, theme]); // eslint-disable-line react-hooks/exhaustive-deps
}
