# 03: Interactive Tool Approvals & Clarify Question Dialogs

**What to build:** An interactive approval and clarification bridge that intercepts agent questions (`ask_question`) and permission requests (`ask_permission`). Instead of stalling headless or running risky operations blindly, the web UI displays a dedicated modal: either an interactive multiple-choice selector for clarifying questions or an approval prompt for dangerous commands (e.g. bash commands, file overwrites) with Allow/Deny actions.

**Blocked by:** 02: Stable Assistant Turn Anchors & Tri-Mode Presentation

**Status:** completed

- [x] Antigravity agent `ask_question` events render an interactive modal with clickable options, custom response input, and submission buttons.
- [x] Dangerous tool executions trigger a clear approval modal displaying command preview, affected paths, and Allow/Deny controls.
- [x] User decision is posted via backend bridge and piped to the waiting agent session within the active turn.
- [x] Timed-out or cancelled prompts handle cleanly without hanging the background terminal session.
- [x] Modals are keyboard-accessible (Enter to submit, Escape to dismiss/deny) and mobile-responsive.
