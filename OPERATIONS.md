# Intraday feedback UI

`assets/operations.js` and `assets/operations.css` extend **Operasyon Planı**.
The extension reads the authenticated API's separate production journal and
overlays plan rows without writing `DATA`, local storage or `/api/paneldata`.

Select a production record, describe today's actual work and explicitly state
the total remaining count for partial work. Ambiguous reports require clarification.
Saved events appear in **Bildirim geçmişi** and can be undone. **Üretim hafızası**
shows source evidence and allows accepting or disabling preparation reminders.

The API must expose `/api/agent/operations` before this panel is published. An
unavailable or unsupported snapshot disables reporting and displays an error.
Unsaved panel changes prevent reporting until cloud sync finishes. Changes to
the record invalidate the old report's plan and require confirmation of its state.

Run `node --test test/operations-ui.js` for overlay, staleness and retry checks.
Run `node test/sync-harness.js SCENARIO` for each existing sync scenario: `normal`,
`poll-race`, `save-during-response`, `net-fail`, `stale-autoheal`, `real-conflict`,
`schema-422`, `quota`. Desktop and mobile preview use synthetic records; verify
the real configured extraction separately after deploying the backend.
