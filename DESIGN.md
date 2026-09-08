# Design Direction: AGY Online

> **Brand & Design Specification for AGY Online (`ai-cli-online`)**  
> Formulated for the `antislop` design filter.

---

## 1. Identity & Persona

- **Product**: Browser-based development workstation and persistent terminal runner for the Google Antigravity CLI (`agy`).
- **Audience**: Autonomous AI agent developers, software engineers, DevOps practitioners, and Termux/mobile power users.
- **Mood & Tone**: High-precision industrial workstation, avionics telemetry cockpit, utilitarian, austere, focused.
- **Dials (antislop)**:
  - **ENERGY**: **2 (Balanced)** — Serious developer workstation; high-contrast legibility without cartoonish decoration.
  - **RHYTHM**: **2 (Structured Modular)** — Multi-pane technical split tree, fixed command headers, data tables, and collapsible inspection drawers.
  - **MOTION**: **1 (Calm)** — 0.15s state transitions only; no bouncing, floating, or unnecessary animation loops.

---

## 2. Color Palette & Semantics

AGY Online employs an **Industrial Telemetry & Cockpit Palette**. Decorative AI gradients, pastel blocks, and floating neon orbs are strictly prohibited.

### Dark Theme (Default)
- **Canvas Base (`--bg-base`, `--bg-primary`)**: `#08090b` (near-black, low-reflective)
- **Secondary Surfaces (`--bg-secondary`, `--bg-surface`)**: `#0d0f12` (header bars, rails, sidebars)
- **Primary Cards & Editor (`--bg-tertiary`, `--bg-card`)**: `#121519` (terminal container, chat card, modal background)
- **Elevated Popovers (`--bg-elevated`)**: `#171b20` (context menus, dropdowns, command palette)
- **Borders (`--border`, `--border-color`)**: `#252a31` (1px precision divider)
- **Strong Borders (`--border-strong`)**: `#363c46`
- **Text Readout (`--text-primary`)**: `#e8ebef` (WCAG AA compliant, high-legibility readout)
- **Text Bright (`--text-bright`)**: `#ffffff` (active highlights, focus headings)
- **Text Secondary / Telemetry (`--text-secondary`)**: `#8b939e` (PID, memory, branch, stats)
- **Text Muted (`--text-muted`)**: `#555d68` (timestamps, subtle placeholders)

### Light Theme (Workstation Lab Mode)
- **Canvas Base (`--bg-base`, `--bg-primary`)**: `#f0f2f5` (soft lab grey)
- **Secondary Surfaces (`--bg-secondary`, `--bg-surface`)**: `#ffffff` (white clean surfaces)
- **Cards & Inputs (`--bg-card`, `--bg-input`)**: `#ffffff` / `#f0f2f5`
- **Borders (`--border`, `--border-color`)**: `#cbd5e1`
- **Text (`--text-primary`, `--text-bright`)**: `#0f172a` / `#020617`

### Functional Accent Colors (Max 1 primary accent + semantic indicators)
- **Amber (`--accent-amber`: `#f59e0b`, bright: `#fbbf24`)**: Primary active state, execution indicator, focus border, command run trigger.
- **Cyan (`--accent-cyan`: `#06b6d4`, bright: `#22d3ee`)**: Persona indicator, session badge, telemetry link.
- **Emerald (`--accent-green`: `#10b981`)**: Connected status, daemon alive, test pass.
- **Crimson (`--accent-red`: `#ef4444`)**: Error state, process kill, disconnect warning.

---

## 3. Typography & Information Density

- **Monospace Primary**: `JetBrains Mono`, `IBM Plex Mono`, Menlo, monospace.
  - Used for code, terminals, telemetry, labels, keyboard shortcut chips, slash commands, and buttons.
- **Sans Secondary**: System font stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`).
  - Used for extended prose, markdown documentation, and help articles.
- **Capitalization**: Restrained technical uppercase for short status pills and section dividers (`SESSION`, `PLUGINS`, `DIRECTIVE`, `STAGED`), strictly avoiding extreme letter spacing or oversized headers.
- **Punctuation**: No em dashes. Use commas, colons, parentheses, or periods.

---

## 4. Components & Geometry

- **Border Radius**: Small, disciplined geometry (3px to 6px). **Pill-shaped containers, pill cards, and pill inputs are prohibited.**
- **Elevation & Shadows**: Flat technical surfaces with 1px hairline borders. Soft floating shadows are avoided; elevation is marked by surface tint (`--bg-secondary` vs `--bg-elevated`).
- **Icons**: Unified stroke-based SVG icons (12px, 14px, 16px). Emojis as UI icons are replaced with SVG symbols.
- **Interactive Controls**:
  - Every button has an explicit hover/active state and direct keyboard access (`Enter`, `Space`, `Escape`).
  - Dead buttons or decorative dummy controls are forbidden.
  - Interactive states must provide immediate visual feedback.

---

## 5. Mobile & Viewport Resilience

- Minimum touch target: 44px on touch viewports.
- Responsive breakpoints:
  - Mobile: <= 768px (virtual quick-keys bar, collapsed sidebars, touch overlays).
  - Tablet / Compact: 769px - 1024px (auto-stacked secondary panels).
  - Desktop: > 1024px (multi-pane split tree with draggable resizers).
- No horizontal scrollbars outside code blocks or terminal viewports.
