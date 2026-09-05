# 04: Composer Pending Intent Queue & Mid-Flight Steering

**What to build:** Dynamic prompt queueing and mid-stream steering when the assistant is actively executing. The chat composer adapts while a turn is active, allowing the user to either queue the next instruction (auto-dispatched when the current turn finishes) or inject a steering directive directly into the running agent context to course-correct immediately.

**Blocked by:** 02: Stable Assistant Turn Anchors & Tri-Mode Presentation

**Status:** completed

- [x] While an agent turn is running, the composer action bar provides Queue and Steer buttons alongside Stop.
- [x] "Queue" places the message into a visual pending queue list visible above the composer, with edit and delete controls.
- [x] When the active turn completes, the next queued message is automatically dispatched into the session.
- [x] "Steer" injects guidance into the active session without aborting the entire turn context.
- [x] Pending queue state is preserved across page reloads in SQLite.
