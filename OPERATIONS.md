# Intraday production and shared final plan

The Operasyon Planı tab accepts completed work, partial quantities and blockers
for a selected production job. Saving a report commits actual progress, then the
server evaluates all jobs together with Jev. Undo and preparation-rule decisions
also refresh the shared final plan. Plan overlays do not mutate DATA; a validated report also synchronizes the
selected job’s kanban stage on the server.

**Jev ile planı değerlendir** explicitly computes or reuses the server plan.
Ordinary Yenile only reads the stored snapshot and makes no model call. The daily
agent reads this same plan. Rows and today's actions show the same final actions,
relative priorities, deferrals and confirmations. Delivered work remains completed.

Save pending panel edits before evaluation or reporting. If any job's quantities,
stage, dates, owner, notes or decoration changes, the complete global plan becomes
stale. Refresh and evaluate again; changed actual progress may require a new
report. Incomplete/malformed decisions never apply partially. Provider failure is
labeled as a rule plan, preserving valid reported progress and accepted reminders.

Three distinct jobs reporting the same supported obstacle suggest a preparation
rule. Accept it to include its reminder in future planning. This is application
memory, not model training or automatic capacity estimation. An accepted reminder
does not prove a current blocker.

TypeSafe credentials belong only on the API server. Existing Merci authentication
is reused; no provider key is sent to the browser. Deploy the API before these
assets. Run `node --test test/operations-ui.js` and the ten scenarios in
`test/sync-harness.js`. Browser QA uses synthetic data on desktop and mobile.

## Kanban updates and undo

A saved report applies the server-computed revision stage, forward or backward,
and shows `Aşama: Kesimde → Baskı/Nakışta` when it changes. Partial work retains
its current stage. Delivery is valid; delivered records with report history remain
selectable so their reports can be undone.

Server responses carry canonical panel data and the new cloud token. The existing
`adoptCloudSnapshot` flow updates DATA/local storage when clean. It sends no second
whole-data save: the server already patched the single status through CAS. If a
new local edit arrives while the response is being read, adoption is refused;
unsaved data and the old token stay intact, and normal conflict handling prevents
a stale save from erasing the server stage. Never force adoption or call saveData
again just for this server patch. Older responses cannot replace newer cloud data.

Basis checks accept a documented stage-only transition during the short refresh
gap, while still checking quantities, decoration, dates, names and planning inputs.
Undo restores the remaining revision or original stage. If the stage was manually
changed, the server preserves it and the UI explains that it was not overwritten.
`kanban-sync` and `kanban-race` extend the September data-loss regression harness.

## Optional counts and Turkish clarification (2026-10-02)

Operation stages are authoritative for reports. Counts never block saving or
trigger clarification: no order-quantity comparison, even for missing/invalid
quantity or a reported 260 versus ordered 250. `partial.remaining` may be null;
explicit positive integer counts remain informational and legacy counted events
are still read. Invalid optional counts normalize to null, never reject an event.
The interpreter omits order quantity and never calculates a remainder.

Both `260 adet Kesim yapıldı ama kapşon astarı henüz kesilmedi` and the same report
without `260 adet` mean partial cutting, no remaining count, and the exact source
reason. Actions say `Kesim: kalanı tamamla` plus that reason instead of a null count.
Python accepts count-free partial events; panel, shared Jev actions and daily
notes preserve the reason without inventing quantities.

**Applied default:** partial or in-progress work moves kanban to that operation’s
stage (partial cutting -> `Kesimde`), including backward moves. With multiple
active unfinished operations, the earliest active stage is used. Blocked or
not-started-only reports preserve the current stage. Existing CAS, manual-change
protection, undo and evidence-based preparation-rule memory remain in place.

Clarification is only for unclear/contradictory actual operations, questions,
future intent or explicitly another day, never quantities. Only controlled
Turkish clarification messages reach the UI; unexpected model wording/language
uses a general Turkish operation question, with no translation call or retry.
Evidence/reason remain exact source substrings. Dispatch still does not complete
work. Haiku remains one attempt, 1500 output tokens, 45 seconds per interpretation.
Ordinary reads, stage synchronization and optional-count handling add no calls.
Daily warning-and-send behavior and `40 4 * * 1-6` schedule are unchanged.
