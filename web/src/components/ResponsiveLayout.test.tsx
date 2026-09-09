import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

// Mock zustand store
const mockStoreState = {
  tabs: [{ id: 'tab-1', name: 'Alpha-Mission', status: 'open', terminalIds: ['term-1'] }],
  switchTab: vi.fn(),
  addTab: vi.fn(),
  toggleTheme: vi.fn(),
  theme: 'dark',
  fontSize: 14,
  setFontSize: vi.fn(),
  latency: 42,
  token: 'mock-token',
  splitTerminal: vi.fn(),
  removeTerminal: vi.fn(),
  togglePlan: vi.fn(),
  toggleGitHistory: vi.fn(),
};

vi.mock('../store', () => ({
  useStore: vi.fn((selector: (s: any) => any) => selector(mockStoreState)),
}));

// Mock APIs
vi.mock('../api/files', () => ({
  uploadFiles: vi.fn().mockResolvedValue([]),
  fetchCwd: vi.fn().mockResolvedValue('/mock/home'),
}));

vi.mock('../api/workspaces', () => ({
  fetchWorkspaceMode: vi.fn().mockResolvedValue({
    isHome: false,
    mode: 'coding-agent',
    cwd: '/mock/workspace/project-alpha',
    workspaceName: 'project-alpha',
  }),
  fetchWorkspaces: vi.fn().mockResolvedValue([
    { id: 'ws-alpha', path: '/mock/workspace/project-alpha', name: 'project-alpha', isHome: false },
    { id: 'ws-home', path: '/mock/home', name: '~ (Home)', isHome: true },
  ]),
  switchSessionWorkspace: vi.fn().mockResolvedValue({ ok: true }),
  createWorkspace: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../api/journal', () => ({
  fetchSessionJournal: vi.fn().mockResolvedValue([]),
}));

// Mock heavy subcomponents of TerminalPane
vi.mock('./PlanPanel', () => ({
  PlanPanel: () => <div data-testid="mock-plan-panel">Plan Panel Content</div>,
}));

vi.mock('./GitHistoryPanel', () => ({
  GitHistoryPanel: () => <div data-testid="mock-git-panel">Git History Content</div>,
}));

vi.mock('./WorkspaceFilesPanel', () => ({
  WorkspaceFilesPanel: () => <div data-testid="mock-files-panel">Files Content</div>,
}));

vi.mock('./TaskPipelineBar', () => ({
  TaskPipelineBar: () => <div data-testid="mock-pipeline-bar">Pipeline Bar</div>,
}));

import { SystemDiagnosticsModal } from './SystemDiagnosticsModal';
import { SystemHeader } from './SystemHeader';
import { WorkspaceSelector } from './WorkspaceSelector';
import { AiChatView } from './AiChatView';
import { TerminalPane } from './TerminalPane';
import type { TerminalInstance } from '../types';

describe('Responsive Layout & Overlap Remediation Suite', () => {
  // Read CSS stylesheet for design token and media query verification
  const cssPath = path.resolve(__dirname, '../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // =========================================================================
  // TIER 1: FEATURE COVERAGE
  // =========================================================================
  describe('Tier 1: Feature Coverage', () => {
    describe('1.1 Standardized --z-* CSS Token Scale (ORIGINAL_REQUEST §R1)', () => {
      it('defines the complete standardized z-index token scale under :root in index.css', () => {
        expect(cssContent).toMatch(/--z-base:\s*1;/);
        expect(cssContent).toMatch(/--z-header:\s*30;/);
        expect(cssContent).toMatch(/--z-split-resizer:\s*40;/);
        expect(cssContent).toMatch(/--z-drawer-backdrop:\s*500;/);
        expect(cssContent).toMatch(/--z-drawer:\s*510;/);
        expect(cssContent).toMatch(/--z-modal-backdrop:\s*700;/);
        expect(cssContent).toMatch(/--z-modal:\s*710;/);
        expect(cssContent).toMatch(/--z-popover:\s*800;/);
        expect(cssContent).toMatch(/--z-toast:\s*900;/);
      });
    });

    describe('1.2 Modal Stacking Inversion Fix (ORIGINAL_REQUEST §R1)', () => {
      it('elevates .cmd-palette-backdrop to the modal backdrop z-index layer', () => {
        const cmdBackdropMatch = cssContent.match(/\.cmd-palette-backdrop\s*\{[^}]*\}/s);
        expect(cmdBackdropMatch).not.toBeNull();
        const block = cmdBackdropMatch![0];
        expect(block).toMatch(/z-index:\s*var\(--z-modal-backdrop,\s*700\);/);
      });
    });

    describe('1.3 Responsive Utility Rules (ORIGINAL_REQUEST §R1, §R2, §R3)', () => {
      it('declares .tablet-hide and .tablet-shrink rules inside @media (max-width: 1024px)', () => {
        const tabletMediaMatch = cssContent.match(/@media\s*\(max-width:\s*1024px\)\s*\{([^}]*\{[^}]*\}[^}]*)*\}/s);
        expect(tabletMediaMatch).not.toBeNull();
        const block = tabletMediaMatch![0];
        expect(block).toMatch(/\.tablet-hide\s*\{\s*display:\s*none\s*!important;\s*\}/);
        expect(block).toMatch(/\.tablet-shrink\s*\{\s*max-width:\s*160px\s*!important;\s*\}/);
      });

      it('declares .mobile-hide utility inside @media (max-width: 480px)', () => {
        const mobileMediaMatch = cssContent.match(/@media\s*\(max-width:\s*480px\)\s*\{([^}]*\{[^}]*\}[^}]*)*\}/s);
        expect(mobileMediaMatch).not.toBeNull();
        const block = mobileMediaMatch![0];
        expect(block).toMatch(/\.mobile-hide\s*\{\s*display:\s*none\s*!important;\s*\}/);
      });
    });

    describe('1.4 SystemDiagnosticsModal Viewport Clamping & Z-Index (ORIGINAL_REQUEST §R1)', () => {
      it('clamps height and maxHeight to dynamic viewport dimensions and sets standardized modal z-indexes', () => {
        const { container } = render(
          <SystemDiagnosticsModal isOpen={true} onClose={vi.fn()} token="test-token" />
        );

        // Backdrop
        const backdrop = container.firstChild as HTMLElement;
        expect(backdrop).toBeInTheDocument();
        expect(backdrop.style.zIndex).toBe('var(--z-modal-backdrop, 700)');

        // Modal container dialog
        const modal = backdrop.firstChild as HTMLElement;
        expect(modal).toBeInTheDocument();
        expect(modal.style.height).toBe('min(520px, calc(100dvh - 32px))');
        expect(modal.style.maxHeight).toBe('calc(100dvh - 32px)');
        expect(modal.style.zIndex).toBe('var(--z-modal, 710)');
        expect(modal.style.overflow).toBe('hidden');

        // Internal scrollable content container
        const scrollArea = modal.querySelector('div[style*="overflow-y: auto"], div[style*="overflowY: auto"]') as HTMLElement;
        expect(scrollArea).not.toBeNull();
      });

      it('does not render when isOpen is false', () => {
        const { container } = render(
          <SystemDiagnosticsModal isOpen={false} onClose={vi.fn()} token="test-token" />
        );
        expect(container.firstChild).toBeNull();
      });
    });

    describe('1.5 SystemHeader Telemetry Contraction & Mission Clamping (ORIGINAL_REQUEST §R2)', () => {
      it('renders compact status button, and applies .tablet-hide to latency indicator and cmd-k', () => {
        const { container } = render(
          <SystemHeader
            systemStatus={{
              server: {
                idle: false,
                pid: 12345,
                memory: { rssMb: 14.2, heapMb: 8.5 },
                uptimeSec: 3600,
                activeSessions: 1,
              },
              tmux: { running: true, activeWindows: 1, attachedClients: 1 },
            }}
            onOpenCommandPalette={vi.fn()}
            onOpenHelp={vi.fn()}
            onToggleContextPanel={vi.fn()}
            contextPanelOpen={false}
            onToggleMobileNav={vi.fn()}
            activeSessionName="Alpha-Mission-Control-Center"
          />
        );

        // Compact status button renders SYS:ONLINE
        const statusBtn = screen.getByRole('button', { name: /System status: Online/i });
        expect(statusBtn).toBeInTheDocument();
        expect(screen.getByText(/SYS:ONLINE/i)).toBeInTheDocument();

        // Latency indicator
        const latencyElement = container.querySelector('[title*="Latency: 42ms"]');
        expect(latencyElement).toHaveClass('tablet-hide');

        // Command palette button
        const cmdPaletteBtn = screen.getByRole('button', { name: /Open command palette/i });
        expect(cmdPaletteBtn).toHaveClass('tablet-hide');
      });

      it('clamps mission name container with clamp(120px, 20vw, 220px) without overflow squashing', () => {
        render(
          <SystemHeader
            systemStatus={null}
            onOpenCommandPalette={vi.fn()}
            onToggleContextPanel={vi.fn()}
            contextPanelOpen={false}
            onToggleMobileNav={vi.fn()}
            activeSessionName="Very-Long-Mission-Name-Exceeding-Normal-Header-Width"
          />
        );

        const missionText = screen.getByText('Very-Long-Mission-Name-Exceeding-Normal-Header-Width');
        const missionContainer = missionText.closest('div[style*="max-width"]') as HTMLElement;
        expect(missionContainer).not.toBeNull();
        expect(missionContainer.style.maxWidth).toBe('clamp(120px, 20vw, 220px)');
        expect(missionContainer.style.overflow).toBe('hidden');
        expect(missionContainer.style.textOverflow).toBe('ellipsis');
        expect(missionContainer.style.whiteSpace).toBe('nowrap');

        // Center container should not have overflow: hidden which clips dropdown popover
        const centerContainer = missionContainer.parentElement as HTMLElement;
        expect(centerContainer.style.overflow).not.toBe('hidden');
      });
    });

    describe('1.6 WorkspaceSelector Boundary Clamping, Alignment & Dismisser (ORIGINAL_REQUEST §R2)', () => {
      it('clamps popover to viewport, aligns right, uses --z-popover, and renders click-outside dismisser', () => {
        const { container } = render(
          <WorkspaceSelector
            currentCwd="/mock/workspace/project-alpha"
            token="test-token"
            onWorkspaceChange={vi.fn()}
          />
        );

        // Click trigger button to open popover
        const trigger = screen.getByRole('button', { name: /project-alpha/i });
        fireEvent.click(trigger);

        // Popover dropdown container
        const popover = container.querySelector('div[style*="position: absolute"]') as HTMLElement;
        expect(popover).not.toBeNull();

        // Right alignment & boundary clamping
        expect(popover.style.right).toBe('0px');
        expect(popover.style.left).toBe('auto');
        expect(popover.style.width).toBe('min(320px, calc(100vw - 24px))');
        expect(popover.style.maxHeight).toBe('min(440px, calc(100dvh - 60px))');
        expect(popover.style.zIndex).toBe('var(--z-popover, 800)');

        // Dismisser backdrop element
        const dismisser = popover.querySelector('div[style*="position: fixed"]') as HTMLElement;
        expect(dismisser).not.toBeNull();
        expect(dismisser.style.inset).toBe('0px');
        expect(dismisser.style.zIndex).toBe('-1');

        // Clicking dismisser closes the popover
        fireEvent.click(dismisser);
        expect(container.querySelector('div[style*="position: absolute"]')).toBeNull();
      });
    });

    describe('1.7 AiChatView Header Actions Responsiveness & Dock Wrapping (ORIGINAL_REQUEST §R3)', () => {
      it('retains header button icons while hiding verbose text labels with .mobile-hide', () => {
        render(<AiChatView sessionId="test-session" token="test-token" />);

        // Tri-Mode Presentation selector buttons
        expect(screen.getByTestId('mode-worklog')).toBeInTheDocument();
        expect(screen.getByText('LOG')).toHaveClass('mobile-hide');

        expect(screen.getByTestId('mode-transparent')).toBeInTheDocument();
        expect(screen.getByText('STREAM')).toHaveClass('mobile-hide');

        expect(screen.getByTestId('mode-final')).toBeInTheDocument();
        expect(screen.getByText('FINAL')).toHaveClass('mobile-hide');

        // Diagnostics button icon & label
        expect(screen.getByTitle(/System Diagnostics & Process Supervision/i)).toBeInTheDocument();
        expect(screen.getByText('DIAG')).toHaveClass('mobile-hide');

        // Export button icon & label
        expect(screen.getByTitle(/Export session to standalone HTML/i)).toBeInTheDocument();
        expect(screen.getByText('EXPORT')).toHaveClass('mobile-hide');
      });

      it('applies flexWrap: "wrap" and gap control in the console dock footer', () => {
        const { container } = render(<AiChatView sessionId="test-session" token="test-token" />);

        // Dock footer container
        const dockFooter = container.querySelector('div[style*="border-top: 1px dashed"]') as HTMLElement;
        expect(dockFooter).not.toBeNull();
        expect(dockFooter.style.display).toBe('flex');
        expect(dockFooter.style.flexWrap).toBe('wrap');
        expect(dockFooter.style.gap).toBe('6px');
      });
    });

    describe('1.8 TerminalPane Secondary Panel Auto-Stacking (ORIGINAL_REQUEST §R3)', () => {
      const baseTerminal: TerminalInstance = {
        id: 'term-1',
        name: 'Terminal 1',
        cwd: '/mock/workspace',
        panels: { planOpen: true, gitHistoryOpen: false },
      };

      it('renders full overlay mode when container width falls below 560px on desktop', () => {
        // Mock container clientWidth to 480px (narrow split below 560px threshold)
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
          configurable: true,
          get() {
            return 480;
          },
        });

        // Set window to desktop width (> 768px)
        window.innerWidth = 1024;

        const { container } = render(<TerminalPane terminal={baseTerminal} canClose={false} />);

        // When container is < 560px, it should auto-stack as an absolute overlay with CLOSE button
        expect(screen.getByRole('button', { name: /Close panel/i })).toBeInTheDocument();
        expect(screen.getByText('// TASKS & PLAN')).toBeInTheDocument();

        // Should NOT render desktop resize divider
        expect(container.querySelector('.md-editor-divider-h')).toBeNull();

        // Restore clientWidth
        if (originalClientWidth) {
          Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
      });

      it('renders desktop split mode with resize divider when container width is >= 560px', () => {
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
          configurable: true,
          get() {
            return 800;
          },
        });

        window.innerWidth = 1280;

        const { container } = render(<TerminalPane terminal={baseTerminal} canClose={false} />);

        // In desktop split mode, resize divider is present and no full-overlay CLOSE button
        expect(container.querySelector('.md-editor-divider-h')).not.toBeNull();
        expect(screen.queryByRole('button', { name: /Close panel/i })).not.toBeInTheDocument();

        if (originalClientWidth) {
          Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
      });
    });
  });

  // =========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // =========================================================================
  describe('Tier 2: Boundary & Corner Cases', () => {
    describe('2.1 Narrow Viewport Boundaries (360px and 480px)', () => {
      it('clamps WorkspaceSelector width to calc(100vw - 24px) preventing horizontal overflow on 360px screen', () => {
        render(
          <WorkspaceSelector
            currentCwd="/mock/workspace/project-alpha"
            token="test-token"
            onWorkspaceChange={vi.fn()}
          />
        );

        fireEvent.click(screen.getByRole('button', { name: /project-alpha/i }));
        const popover = document.querySelector('div[style*="position: absolute"]') as HTMLElement;
        expect(popover).not.toBeNull();

        // At 360px viewport width: min(320px, 360 - 24) = min(320px, 336px) = 320px
        // At 320px viewport width: min(320px, 320 - 24) = 296px
        expect(popover.style.width).toBe('min(320px, calc(100vw - 24px))');
        expect(popover.style.right).toBe('0px');
      });

      it('ensures .mobile-hide rules apply cleanly at the 480px boundary', () => {
        expect(cssContent).toMatch(/@media\s*\(max-width:\s*480px\)/);
        expect(cssContent).toMatch(/\.mobile-hide\s*\{\s*display:\s*none\s*!important;\s*\}/);
      });
    });

    describe('2.2 Tablet Viewport Boundaries (769px and 1024px)', () => {
      it('activates .tablet-hide rules up to 1024px without overlapping', () => {
        expect(cssContent).toMatch(/@media\s*\(max-width:\s*1024px\)/);
        expect(cssContent).toMatch(/\.tablet-hide\s*\{\s*display:\s*none\s*!important;\s*\}/);
      });

      it('verifies clamp(120px, 20vw, 220px) limits: 120px minimum and 220px maximum', () => {
        render(
          <SystemHeader
            systemStatus={null}
            onOpenCommandPalette={vi.fn()}
            onToggleContextPanel={vi.fn()}
            contextPanelOpen={false}
            onToggleMobileNav={vi.fn()}
            activeSessionName="Test-Session"
          />
        );

        const missionElem = screen.getByText('Test-Session');
        const container = missionElem.closest('div[style*="max-width"]') as HTMLElement;
        expect(container.style.maxWidth).toBe('clamp(120px, 20vw, 220px)');
      });
    });

    describe('2.3 Mobile Landscape Viewports (Height < 450px, e.g. 390px)', () => {
      it('ensures SystemDiagnosticsModal height clamps to calc(100dvh - 32px) leaving margin for screen boundaries', () => {
        const { container } = render(
          <SystemDiagnosticsModal isOpen={true} onClose={vi.fn()} token="test-token" />
        );

        const modal = container.querySelector('div[style*="min(520px"]') as HTMLElement;
        expect(modal).not.toBeNull();
        expect(modal.style.height).toBe('min(520px, calc(100dvh - 32px))');
        expect(modal.style.maxHeight).toBe('calc(100dvh - 32px)');

        // Header remains pinned at top while body scrolls
        const header = modal.firstChild as HTMLElement;
        expect(header).toBeInTheDocument();
        expect(header.style.borderBottom).toContain('var(--border');
      });

      it('clamps WorkspaceSelector dropdown height to calc(100dvh - 60px) on short screens', () => {
        render(
          <WorkspaceSelector
            currentCwd="/mock/workspace/project-alpha"
            token="test-token"
            onWorkspaceChange={vi.fn()}
          />
        );

        fireEvent.click(screen.getByRole('button', { name: /project-alpha/i }));
        const popover = document.querySelector('div[style*="position: absolute"]') as HTMLElement;
        expect(popover.style.maxHeight).toBe('min(440px, calc(100dvh - 60px))');
      });
    });

    describe('2.4 Container Width Threshold Boundary (559px vs 560px)', () => {
      const baseTerminal: TerminalInstance = {
        id: 'term-boundary',
        name: 'Boundary Test',
        cwd: '/mock/workspace',
        panels: { planOpen: true, gitHistoryOpen: false },
      };

      it('switches to stacked overlay at exactly 559px', () => {
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
          configurable: true,
          get() {
            return 559;
          },
        });
        window.innerWidth = 1280;

        render(<TerminalPane terminal={baseTerminal} canClose={false} />);
        expect(screen.getByRole('button', { name: /Close panel/i })).toBeInTheDocument();

        if (originalClientWidth) {
          Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
      });

      it('retains split view at exactly 560px on desktop', () => {
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
          configurable: true,
          get() {
            return 560;
          },
        });
        window.innerWidth = 1280;

        const { container } = render(<TerminalPane terminal={baseTerminal} canClose={false} />);
        expect(container.querySelector('.md-editor-divider-h')).not.toBeNull();
        expect(screen.queryByRole('button', { name: /Close panel/i })).not.toBeInTheDocument();

        if (originalClientWidth) {
          Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
      });
    });
  });

  // =========================================================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // =========================================================================
  describe('Tier 3: Cross-Feature Combinations', () => {
    describe('3.1 Simultaneous Sidebar/Panel Rendering', () => {
      it('TerminalPane auto-stacks secondary panels into overlay when sidebars constrain pane width below 560px', () => {
        // Simulation: Desktop 1280px screen with SessionSidebar (340px) and ContextPanel (320px)
        // leaves 620px for central area. If split into two terminal panes: 620 / 2 = 310px width.
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
          configurable: true,
          get() {
            return 310;
          },
        });
        window.innerWidth = 1280;

        const terminalWithPlan: TerminalInstance = {
          id: 'term-constrained',
          name: 'Constrained Terminal',
          cwd: '/mock/workspace',
          panels: { planOpen: true, gitHistoryOpen: false },
        };

        const { container } = render(<TerminalPane terminal={terminalWithPlan} canClose={false} />);

        // Must render in overlay mode to protect AI command stream from being squashed below 200px
        expect(screen.getByRole('button', { name: /Close panel/i })).toBeInTheDocument();
        expect(container.querySelector('.md-editor-divider-h')).toBeNull();

        if (originalClientWidth) {
          Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
      });
    });

    describe('3.2 Stacking Context Hierarchy: Modal over Drawer Layering', () => {
      it('guarantees modal z-indexes are strictly greater than drawer and backdrop z-indexes', () => {
        // Extract numeric tokens from index.css
        const zDrawerBackdrop = parseInt(cssContent.match(/--z-drawer-backdrop:\s*(\d+);/)![1], 10);
        const zDrawer = parseInt(cssContent.match(/--z-drawer:\s*(\d+);/)![1], 10);
        const zModalBackdrop = parseInt(cssContent.match(/--z-modal-backdrop:\s*(\d+);/)![1], 10);
        const zModal = parseInt(cssContent.match(/--z-modal:\s*(\d+);/)![1], 10);
        const zPopover = parseInt(cssContent.match(/--z-popover:\s*(\d+);/)![1], 10);
        const zToast = parseInt(cssContent.match(/--z-toast:\s*(\d+);/)![1], 10);

        // Assert strict monotonicity: Toast > Popover > Modal > Modal Backdrop > Drawer > Drawer Backdrop
        expect(zModalBackdrop).toBeGreaterThan(zDrawer);
        expect(zModal).toBeGreaterThan(zModalBackdrop);
        expect(zPopover).toBeGreaterThan(zModal);
        expect(zToast).toBeGreaterThan(zPopover);
        expect(zDrawer).toBeGreaterThan(zDrawerBackdrop);
      });
    });
  });

  // =========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // =========================================================================
  describe('Tier 4: Real-World Scenarios', () => {
    describe('Scenario 1: Mobile Portrait Layout (390px × 844px)', () => {
      it('preserves clickable action icons in AiChatView and wraps console dock buttons cleanly', () => {
        window.innerWidth = 390;
        window.innerHeight = 844;

        const { container } = render(<AiChatView sessionId="mobile-portrait-session" token="test-token" />);

        // Verify action icons are accessible
        expect(screen.getByTestId('mode-worklog')).toBeInTheDocument();
        expect(screen.getByTestId('mode-transparent')).toBeInTheDocument();
        expect(screen.getByTestId('mode-final')).toBeInTheDocument();
        expect(screen.getByTitle(/System Diagnostics & Process Supervision/i)).toBeInTheDocument();
        expect(screen.getByTitle(/Export session to standalone HTML/i)).toBeInTheDocument();

        // Footer dock buttons have flexWrap: 'wrap' and gap control
        const dockFooter = container.querySelector('div[style*="border-top: 1px dashed"]') as HTMLElement;
        expect(dockFooter.style.flexWrap).toBe('wrap');
        expect(dockFooter.style.gap).toBe('6px');
      });

      it('WorkspaceSelector popover stays within 390px portrait viewport edges', () => {
        window.innerWidth = 390;
        window.innerHeight = 844;

        render(
          <WorkspaceSelector
            currentCwd="/mock/workspace/project-alpha"
            token="test-token"
            onWorkspaceChange={vi.fn()}
          />
        );

        fireEvent.click(screen.getByRole('button', { name: /project-alpha/i }));
        const popover = document.querySelector('div[style*="position: absolute"]') as HTMLElement;
        expect(popover).not.toBeNull();
        expect(popover.style.width).toBe('min(320px, calc(100vw - 24px))');
        expect(popover.style.right).toBe('0px');
      });
    });

    describe('Scenario 2: Mobile Landscape Layout (844px × 390px)', () => {
      it('fits SystemDiagnosticsModal cleanly on screen without overflowing viewport height', () => {
        window.innerWidth = 844;
        window.innerHeight = 390;

        const { container } = render(
          <SystemDiagnosticsModal isOpen={true} onClose={vi.fn()} token="test-token" />
        );

        const modal = container.querySelector('div[style*="min(520px"]') as HTMLElement;
        expect(modal).not.toBeNull();
        expect(modal.style.height).toBe('min(520px, calc(100dvh - 32px))');
        expect(modal.style.maxHeight).toBe('calc(100dvh - 32px)');

        // Header with close button is fully accessible
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
        expect(screen.getByText(/SYSTEM DIAGNOSTICS & SUPERVISION/i)).toBeInTheDocument();
      });
    });

    describe('Scenario 3: Tablet Split Window Layout (820px × 1180px)', () => {
      it('contracts SystemHeader telemetry via .tablet-hide and clamps mission title without horizontal collision', () => {
        window.innerWidth = 820;
        window.innerHeight = 1180;

        const { container } = render(
          <SystemHeader
            systemStatus={{
              server: {
                idle: false,
                pid: 9988,
                memory: { rssMb: 15.1, heapMb: 9.0 },
                uptimeSec: 1200,
                activeSessions: 2,
              },
              tmux: { running: true, activeWindows: 1, attachedClients: 1 },
            }}
            onOpenCommandPalette={vi.fn()}
            onToggleContextPanel={vi.fn()}
            contextPanelOpen={false}
            onToggleMobileNav={vi.fn()}
            activeSessionName="Alpha-Mission-Split-Tablet"
          />
        );

        // Compact status button rendered
        expect(screen.getByText(/SYS:ONLINE/i)).toBeInTheDocument();

        // Latency indicator marked with .tablet-hide
        const latencyElement = container.querySelector('[title*="Latency: 42ms"]');
        expect(latencyElement).toHaveClass('tablet-hide');

        // Mission title container has clamp style
        const missionText = screen.getByText('Alpha-Mission-Split-Tablet');
        const missionContainer = missionText.closest('div[style*="max-width"]') as HTMLElement;
        expect(missionContainer.style.maxWidth).toBe('clamp(120px, 20vw, 220px)');
      });
    });

    describe('Scenario 4: Desktop Multi-Panel Layout (1280px with open sidebars)', () => {
      it('TerminalPane secondary panel gracefully auto-stacks when constrained', () => {
        window.innerWidth = 1280;

        // Container clientWidth simulated as 420px (after sidebars consume space)
        const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
          configurable: true,
          get() {
            return 420;
          },
        });

        const testTerminal: TerminalInstance = {
          id: 'term-desktop-constrained',
          name: 'Constrained Pane',
          cwd: '/mock/workspace',
          panels: { planOpen: false, gitHistoryOpen: true },
        };

        const { container } = render(<TerminalPane terminal={testTerminal} canClose={false} />);

        // Auto-stacks into full overlay mode with close button, preventing chat timeline squashing
        expect(screen.getByRole('button', { name: /Close panel/i })).toBeInTheDocument();
        expect(screen.getByText('// GIT HISTORY')).toBeInTheDocument();
        expect(container.querySelector('.md-editor-divider-h')).toBeNull();

        if (originalClientWidth) {
          Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
        }
      });
    });
  });
});
