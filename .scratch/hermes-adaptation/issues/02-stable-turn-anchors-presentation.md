# 02: Stable Assistant Turn Anchors & Tri-Mode Presentation

**What to build:** A stable turn anchor container for each assistant turn with three distinct presentation modes: Compact Worklog (collapsible badge summarizing steps, tool count, and duration), Transparent Stream (live chronological trace of reasoning, tool calls, and outputs), and Final Answer Only (clean markdown response with tool executions hidden). Completed turns enter a settled state to eliminate DOM re-render jitter.

**Blocked by:** 01: Write-Ahead Turn Journal & Crash Recovery

**Status:** completed

- [x] Each assistant turn renders within a stable turn anchor component that maintains layout stability during streaming.
- [x] User can toggle between Compact Worklog, Transparent Stream, and Final Answer Only per turn and globally in session preferences.
- [x] Settled state freezes completed turns to prevent DOM layout shifts when navigating or scrolling history.
- [x] Mobile view defaults to Compact Worklog to preserve vertical screen real estate.
- [x] Unit and end-to-end tests verify mode transitions and state settlement across streaming NDJSON events.
