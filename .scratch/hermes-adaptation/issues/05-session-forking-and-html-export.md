# 05: Session Turn Forking & Standalone HTML Export

**What to build:** Branching and exporting capabilities for development sessions. Users can fork a session from any historical assistant turn to explore alternative implementation paths without modifying the original session. Users can also export any session to a standalone, zero-dependency HTML file containing all rendered turns, markdown, and code blocks for offline sharing and audits.

**Blocked by:** 02: Stable Assistant Turn Anchors & Tri-Mode Presentation

**Status:** completed

- [x] Every settled turn anchor offers a "Fork Session" action that creates a new session cloned up to that turn boundary.
- [x] Forked session opens in a new tab or switches immediately with full history up to the fork point.
- [x] "Export Session" action generates a self-contained `.html` document with embedded styles, responsive layout, dark/light theme support, and offline readability.
- [x] Exported HTML strips internal tokens and secrets while faithfully preserving code blocks and tool logs.
- [x] Backend fork API executes efficiently without duplicating unchanged file artifacts on disk.
