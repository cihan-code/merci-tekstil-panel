# Intraday production and shared final plan

The Operasyon Planı tab accepts completed work, partial quantities and blockers
for a selected production job. Saving a report commits actual progress, then the
server evaluates all jobs together with Jev. Undo and preparation-rule decisions
also refresh the shared final plan. Plan overlays do not mutate DATA; a validated report also synchronizes the
selected job’s kanban stage on the server.

**Planı değerlendir** explicitly computes or reuses the server plan.
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

Native JSON/transport/filesystem failures also use Turkish public messages; existing
Turkish validation errors are preserved and no translation request is made.


## Product selection and capacity (2026-10-08)

Production Tracking's new-record form and edit dialog include **Ürün** with eight
stable product keys and `— Belirtilmedi —`. Choose it explicitly: customer/order
names do not determine a product, and existing records stay unspecified. Product
edits invalidate the complete shared plan and require **Planı değerlendir** again.

The API owns capacity configuration and all calculations. The browser validates
and displays the same actions/typed capacity that the daily agent receives; do
not duplicate rate tables here. Rows and **Günün planı** show today's ≈quantity,
remaining ≈quantity, estimated station completion, delivery risk and today's
product transitions. Missing product/quantity and blocked or uncertain queue load
have visible unavailable estimates. A +15% alternative never replaces the minimum
plan. Sewing estimates do not promise packing or final delivery.

Panel PDF printing retains the existing **A4 landscape** layout. The daily agent's
PDF remains portrait A4. Public panel wording does not mention the provider name.
Capacity does not modify report validation, stage synchronization, undo or memory;
no additional model request is made by the panel.

Validate with `node --test test/operations-ui.js`, all ten sync-harness scenarios
and synthetic browser checks of both product selectors and shared capacity output.

## Product recipes (2026-10-08)

Üretim Takip has two optional selects next to Baskı/Nakış: **Kordon (ilik için)**
and **Astar (kesim için)**, stored as `cord` / `lining` = `var`, `yok` or empty.
They only refine recipe notes; empty keeps a conditional note. User decision
2026-10-09: Kordon is shown only for Sweatshirt, Tam fermuarlı (kapüşon), Şort and
Eşofman (kemer); Astar only for Sweatshirt and Tam fermuarlı. A hidden field is saved
empty (new-record form and edit dialog, via the generic `showIf` field option).
`URETIM_CORD_PRODUCTS` / `URETIM_LINING_PRODUCTS` must match the API recipe's
`cord_part` / `lining`.

The server's final plan decisions may carry a `recipe` object (material need in
≈kg, product-specific steps, zipper/yaka-kol confirmations). The panel validates
its shape (malformed data marks the whole plan stale, like other decision fields)
and only renders text: job rows show `action` + all recipe notes; Günün planı
lines show `action` + steps and materials, and confirmations are listed once under
**Hazırlık teyitleri**. The print view reuses these sections in its existing
landscape layout. No recipe values or calculations live in the panel.
Tests: `node --test test/operations-ui.js` and the ten `test/sync-harness.js` scenarios.

## Dated expectations (2026-10-09)

Reports may say when work will finish ("kalanı pazartesi bitecek") or when delivery
is due. The API resolves the dates and returns `records[].expectations` (`upcoming`,
`due`, `overdue`, with ready Turkish `text`); the panel adds them to the job row note
and lists `due`/`overdue` in Günün planı under **Bugün beklenenler**. A stated
delivery date updates Tahmini Teslimat on the server; the saved-report message shows
`Tahmini teslimat: eski → yeni`, and the report history shows its expectations.
Undo restores the date. No dates are computed in the browser.

## Compact daily briefing (2026-10-18)

**Bugünün Yapılacakları** now shows a summary and cards in the exact existing final
priority order. Each card keeps ID/customer, quantity, stage, owner, due date,
short action and available capacity/risk. **Detayları Gör** is a native, keyboard
accessible disclosure with the full original action, report facts, notes, recipes,
preparation reminders and dated expectations. Nothing is silently dropped.
Critical cards have a colored border plus written overdue/risk labels; meaning
does not depend on color. Existing form/report/undo/stale/sync flows are untouched.

The API's versioned, dated/state-hashed `snapshot.briefing` is checked against
validated final decisions. A malformed briefing affects only presentation;
valid decisions are retained. Older servers retain a local view of the same
existing rows. Owner filters affect visible cards, not planning. PDF printing
remains A4 landscape but uses a compact repeated-header table; the daily agent's
portrait PDF consumes the same items. Provider names remain absent in panel text.

Run `node --test test/operations-ui.js` and all ten sync scenarios. Browser QA must
check desktop/mobile, keyboard disclosure, all detail text, priority and capacity
matching, no horizontal overflow, and the full landscape print output. No email
is sent and no production data is written by the presentation change.

## Personal session instead of the fixed API key (2026-11-20)

The panel repository is public, so `index.html` and `stok.html` no longer carry the
server `API_KEY`. They call the legacy routes (`/api/paneldata`, `/api/stokdata`,
materials, agent, SDR) with the personal session `Authorization: Bearer …`.
`assets/session.js` reads it from the same `sessionStorage` record as
`assets/uretim.js` (`merci.production.session`, scoped to the API address).
Without a session the page shows a personal login dialog before any request. A 401
clears the session and asks again; unsaved panel or sample data stays marked unsaved
and is sent after login, never reloaded away. `index.html` keeps its own panel login
after the personal one; its Çıkış also clears the personal session.

Release order: 1) the API, which accepts Bearer on legacy routes; 2) this panel;
3) rotate `API_KEY` on Render, because the old value is in the public git history;
4) give the new key to server-to-server clients: Finans Ajanı (`PANEL_API_KEY`),
the daily briefing (`MERCI_API_KEY`) and any Excel link to `/api/costtemplates`.
Deploying the panel before the API locks everyone out of panel data.

Tests: `node --test test/operations-ui.js test/uretim-ui.test.js test/panel-oturum.test.js`
and all twelve `test/sync-harness.js` scenarios (new: `oturumsuz-acilis`, `oturum-dustu`).

## Inline size correction and folded upload form (2026-11-20)

"Elle düzelt" opens a small En/Boy editor inside the measurement row. The ratio
lock is on when the design ratio is known (automatic measurement or the server's
vector content box). "Kaydet" sends `PATCH /api/siparis/uygulamalar/:id` with
`{width_mm, height_mm, elleTeyit: true}`; the server stores the size for the
signed-in person and closes that confirmation. The old placement section (flat
library, product preview file, pixel reference) is gone; its API routes stay for
the CLI tools. The upload form folds behind "Dosya ekle" and shows only the
fields of the chosen type (Görünüm: Ön/Arka/Kol; Desen: Uygulama and Konum).
Every design source shows a stated vector state; the panel keeps polling while a
source has no server row yet. Opening a draft with applications that were never
measured runs `otomatik-olc?degisen=1` once.

Release order: the API first (it accepts `elleTeyit`, `gorunum=kol` and repairs
missing vector records), then this panel.

Tests: `node --test test/operations-ui.js test/uretim-ui.test.js test/uretim-olcu-sade.test.js test/panel-oturum.test.js`
and all `test/sync-harness.js` scenarios.

## Pattern choice and sleeve measurement context (2026-11-20)

Draft product headings show a compact **Kalıp** selector only when the server
returns multiple `kalipAdaylari`. Changing it sends only `{kalipId}` via
`PATCH /api/siparis/satirlar/:id`, then reloads the version and its measurement
confirmations. A failed change restores the previous selection. Measurement rows
show `measure_source.flatAd` / `refBeden` (or the selected candidate) and the
server's `summary`, falling back to stated `sleeveMethod` / `scaleFrom` text.
No measurement or sleeve scale is calculated in the panel.

Deploy API commit `3090066` before these assets. Validation: the four panel test
files above (99 tests), all twelve sync scenarios, and synthetic dark browser
checks at 1440 / 390 px, including expanded correction and upload forms without
horizontal overflow. G39 screenshots stay outside the public repository.
