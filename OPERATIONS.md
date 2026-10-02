# Intraday production and shared final plan

The Operasyon Planı tab accepts completed work, partial quantities and blockers
for a selected production job. Saving a report commits actual progress, then the
server evaluates all jobs together with Jev. Undo and preparation-rule decisions
also refresh the shared final plan. Panel DATA is never changed by plan overlays.

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
assets. Run `node --test test/operations-ui.js` and the eight scenarios in
`test/sync-harness.js`. Browser QA uses synthetic data on desktop and mobile.
