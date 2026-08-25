# BRIXYmanager — Version History

## v0.19.8.0 — Phase 19 Session 8: Network reach
The Journey Planner tab gets a second mode: **Network reach** — "everything I can get to from here within N minutes", riding the existing CSA machinery.

**UI.** A Journey / Network reach tab switcher above the JP form. In reach mode the To picker and swap button hide and a "Within (min)" input (default 60, clamped 5–720) appears; From, Date, and Depart-after are shared with journey mode. Search dispatches by mode via `jpGo()`.

**Algorithm.** `jpReachAll(originIds, startTime, maxMin, searchContext)` — a one-to-all variant of `jpCSASearch`: same `jpBuildConnections` array (so schedule-pattern filtering by the chosen date applies), same transfer semantics (5-min minimum, same-platform exempt, stay-on-trip via `tripReachable`), same ISI/OSI walk propagation, but no destination and a hard cutoff at `startTime + maxMin` (the connection scan also early-exits once departures pass the cutoff). Returns earliest arrival per node. Origin expands to its station group.

**Results.** Aggregated per display name (station-group best arrival), split into four equal time bands (e.g. ≤15 / ≤30 / ≤45 / ≤60 for a 60-min window) with a green→red band palette:
- Summary line ("X of Y stations reachable within N min from Origin") + band legend.
- **Reach map** (Leaflet + OGF tiles): banded circle markers for reached stations with arrival tooltips, small grey dots for unreached stations, an accent-ringed origin marker, auto-fit bounds. Honors the `jpMapTiles` setting.
- **Band sections** below the map: clickable station chips (arrival time + "+Nm") that jump to the node detail via `gotoEntity`.
- Reached stations without coordinates are counted in a footnote and appear in the list only.

Reachability is schedule-based by design — a connected segment with no service on it does not make a station reachable (verified in the smoke test).

## v0.19.7.0 — Phase 19 Session 7: Bulk edit on services
Multi-select + bulk operations on the Services table.

- **Checkbox column** (new first column) on every service row; the header checkbox selects/deselects *the currently filtered list*, so search + select-all composes ("`mode:regional` → select all → set stock"). Selection lives in an in-memory `Set`, survives re-renders and searches, and silently drops ids that stop existing.
- **Bulk bar** appears above the table whenever something is selected: "N selected", three apply-on-change dropdowns — **Set line** (incl. "— No line —"), **Set mode**, **Set stock** (incl. "— No stock —") — plus **Delete** and **Clear selection**. Field updates match single-edit semantics (departure times are not auto-recalculated on stock change — same as editing one service; use ↻ Recalculate as usual).
- **Bulk delete** confirms once with both counts ("Delete N selected services? M departure(s) will be removed with them.") and cascades departures exactly like single delete.
- Checkbox cells stop row-expansion clicks; the accordion, keyboard nav, and group-header rows all account for the new column (colspans bumped).
- `renderServices`'s filter predicate was extracted to `_svcFilteredList()` so select-all and the table share one definition of "what's visible".

Segments/nodes bulk edit deferred — the roadmap said "extends if scope allows"; services was the high-value one, and the pattern (checkbox column + `_bulkSel` + bar) is reusable if the need appears.

## v0.19.6.0 — Phase 19 Session 6: Recent + Pinned entities
**Recent tracking.** Expanding any entity detail row (nodes, segments, lines, services) records it as recently viewed — hooked once in `expandDetailRow`, so clicks, palette jumps, and keyboard nav all count; silent restores after re-render don't. Stored in `localStorage` per save slot (`railmanager:recent:<saveId>`, capped at 12) — deliberately *not* in the save blob: it's a UI convenience, shouldn't churn saves, and stays off the save→re-render path.

**Pinning.** Every detail header gets a ☆ star next to the close button; recent-dropdown rows get one on hover. Pinned entities (`railmanager:pins:<saveId>`, capped 12) surface above recents everywhere and never age out.

**Surfaces.**
- **Topbar "☆ Recent" dropdown** next to Saves: ★ Pinned section on top, ◴ Recent below with relative timestamps (`relTime` — just now / Nm / Nh / Nd ago). Rows navigate via the new `gotoEntity(kind, id)`.
- **Ctrl+K palette:** on an empty query, Pinned and Recent sections now lead the list (before Actions/Go to), in true recency order. Typing anything switches to normal search — recents don't pollute query results.
- **Saves dropdown:** each slot now shows "opened Xh ago" (timestamps in a `railmanager:opened` localStorage map, kept out of the registry so `flushSave`'s registry writes can't clobber them; stamped on boot, slot load, and new-system).

**`gotoEntity(kind, id)`** ([js/ui.js](js/ui.js)) is the new shared navigate-to-detail helper: clears the tab's search (so the row exists), switches tab, and — unlike calling `showXxxDetail` directly — never toggles an already-open row closed (it scrolls to it instead). Grown for recents but reusable by the palette and issue actions later.

**Roadmap note.** The other Session 6 candidate — search predicates (`mode:`, `line:`, `stops:3+` etc.) — turned out to be **already fully implemented** across all four entity tables (numeric ops, ranges, negation, OR groups, hint dropdowns); the roadmap sketch predated the implementation. Struck through in ROADMAP.md.

## v0.19.5.1 — Fix: departure edit modal crashed on open (`t` shadowing)
Two locals named `t` shadowed the global `t()` translation function in [js/scheduling.js](js/scheduling.js):

- `openDepEditModal`'s stop-row builder was `dep.times.map((t, i) => …)`, so the `t('sch.stop_origin')` / `t('sch.stop_terminus')` / `t('sch.stop_pass')` / `t('dep_edit.col_skip')` calls inside the template called the *time entry object* as a function. The first stop always hits the origin label, so the modal threw a `TypeError` before `openModal()` ran — **the "Edit times" button (train schedule + schedule view) has been dead since these labels were localized.** Param renamed to `tm`.
- `saveDepEdit`'s time-cascade accumulator was `let t = dep.times[0].depart`, so the success toast at the end (`toast(t('toast.dep_updated'))`) threw after saving — data was persisted, but the user got a console error instead of confirmation. Renamed to `tm`.

Verified in-browser: modal opens with all stop rows, save completes with its toast, no console errors. Note for the future: locals named `t` anywhere in these modules are a trap — several more exist that currently contain no `t()` calls (e.g. [js/departures.js](js/departures.js), [js/journey.js](js/journey.js) map callbacks).

## v0.19.5.0 — Phase 19 Session 5: Restore work lost in the June 3rd upload
**What happened.** The 2026-06-03 "Add files via upload" commit synced the local working copy (v0.19.4.2) over the GitHub repo — but the local copy never contained the two April PRs that were merged on GitHub (#2: relation importer enhancements, #3: v0.17.4 Node Split & Merge). The upload silently reverted all of their changes. `js/node_ops.js` survived on disk only because uploads don't delete files; its `<script>` tag, its UI entry points, and its 47 `split.*`/`merge.*` translation keys were all gone, and `js/import.js` was reverted byte-for-byte to its pre-PR state.

**Restored by three-way merge** (base = pre-PR main, ours = v0.19.4.2, theirs = the PR #3 merge commit `af703b8`):

- **Node Split & Merge (v0.17.4.x)** — `js/node_ops.js` re-wired: `<script>` tag back in `railmanager.html`, ✂ Split / ⇄ Merge buttons back in the node detail view, all `split.*` / `merge.*` / `toast.split_done` / `toast.merge_done*` keys back in `lang/en.js`, `.nops-*` styles back in `styles.css`. The post-apply `showNodeDetail` calls were adapted for the v0.19.3.0 detail accordion (guarded so they don't toggle the freshly-restored row closed).
- **Relation importer enhancements (PR #2)** — `js/import.js` restored to the PR state: polyline densification before divergence walk, divergence-orientation fix via coordinate proximity, parallel-segment divergence handling, speed-waypoint insertion helpers, interpolated departure times when overlap resolution inserts a junction. `js/views.js`: multi-relation batch import (IDs textarea, per-relation section headers), optional service creation from relation stop sequences (new wizard step 4), cross-relation + proximity dedup with reset-and-rerun after name edits, verified-segments review section on the Issues tab with un-verify.
- **Auto-schedule custom frequency** — inline custom-frequency row in the suggestions table (`js/scheduling.js`).
- **Localization pass** — the PR's `t()` wiring for previously hardcoded strings across `js/entities.js`, `js/views.js`, `js/journey.js`, `js/scheduling.js`, plus all its `lang/en.js` keys.
- **Misc PR fixes** — bus stop detail no longer lists road segments twice (interchange chips filter on `osi`/`isi` only); platforms are station-only again (`bus_stop` drops the platform editor); road segments hide electrification/tracks in the segment modal; way geometry is preserved on segment save even when no OGF way IDs are entered; overlap/suspicious-segment issue checks skip cross-infrastructure (road vs. rail) pairs.

**Fixed while restoring** (bugs in the PR code itself): the relation import service-creation dropdowns iterated `data.stock`/`data.lines`, which don't exist — corrected to `data.rollingStock`/`data.serviceGroups`; the duplicate `isInterchange` local in `openSegmentModal` was consolidated into the PR's `segTypeVal` (unshadowing the global `isInterchange()` helper).

**Housekeeping.** The stranded `VERSION_HISTORY.md` (created by PR #3 next to the real "VERSION HISTORY.md") was folded into this file as the v0.17.4.x entry below and deleted. Local-side changes from 0.18/0.19 were preserved throughout the merge (accordion refresh path, THI label scoring, new issue checks, removed step-2 Back button, stripped import diagnostics).

## v0.19.4.2 — Animated geomap: trains no longer travel backwards on flipped-geometry segments
**Bug.** For some segments, animated trains crossed the segment in reverse — visible on the Northbound Line 2 in Wib's `zemruthiserk` save, where trains crossing between Şehitali [Line 2] and Şehitali [Line 1] glided in the wrong direction.

**Root cause.** `segmentCoordsDirected(seg, fromNodeId)` in [js/core.js](js/core.js) assumed `seg.wayGeometry` was always stored in the `nodeA → nodeB` direction and reversed only when `fromNodeId === seg.nodeB`. But OGF way-import sometimes stores geometry in the opposite orientation — for the offending segment (`moq8tbifw4q6bu`), `nodeA = L1`, `nodeB = L2`, but the geometry's first point sat at L2 and last point at L1. Asking "from L2" returned the reversed array, which started near L1 — backwards.

**Fix.** `segmentCoordsDirected` now orients by which endpoint of the way geometry is geographically closer to the requested `fromNode`, using the existing `_ptDist` haversine helper. If the geometry's first point is farther from `fromNode` than its last point, reverse — otherwise return as-is. Falls back to the old nominal-nodeA/nodeB logic only when `fromNode` has no coordinates (e.g. an unplaced junction). Behavior on normal segments where geometry already runs nodeA→nodeB is unchanged.

This affects both directions of any service traversing such a segment (the bug also rendered the Southbound L2 wrong in the same spot, just less noticeable). Same helper is used by all other geomap renderers (service detail, line detail, route highlight) so this also silently corrects any other place the orientation was being trusted.

## v0.19.4.1 — Palette → keyboard nav handoff fix
Arrow nav didn't work immediately after navigating via the Ctrl+K palette: the palette input kept keyboard focus after the palette closed, and the kb-nav listener's `isInput && !isOwnSearch → return` guard correctly skipped the arrow keys. Fixed by blurring the palette input on close — focus returns to body, kb-nav listener fires normally on the next arrow press.

## v0.19.4.0 — Phase 19 Session 4: Keyboard nav in entity tables
Arrow-key navigation through the four entity tables (Nodes, Segments, Lines, Services). The accordion just got faster — scan rows with the keyboard, expand only what you want.

**Bindings (active on the 4 entity tabs only):**
- **↓ / ↑** — move the highlight to the next/previous row. Wraps around at the ends. Skips inline detail rows. Smooth-scrolls the highlighted row into view at `block: 'nearest'` so it doesn't jump the page.
- **Enter** — toggle expansion of the highlighted row (calls the same `showXxxDetail` path that a click would).
- **Esc** — if a detail is open, close it. Otherwise, if a row is highlighted, clear the highlight.

**Activation rules.** The listener is global (`document.addEventListener('keydown', …)`) but no-ops when:
- The Ctrl+K palette is open (palette has its own arrow-key handling)
- A modal overlay is open
- The active tab isn't one of the 4 entity tabs
- Focus is on any input/textarea/contentEditable *except* the active tab's own search bar

**Search-bar interplay.** When the user is typing in the entity tab's search bar, ↓/↑ still work — the search bar keeps focus, and the highlight just moves through the filtered results. Enter from the search bar expands the highlighted row (so the workflow is: search → ↓ a few times → Enter, all without leaving the keyboard).

**Visual.** New `.kb-highlighted` row state — `accent-glow` background tint plus a 2px `accent-dim` left border (via `box-shadow: inset`). Distinct from the heavier `.expanded` styling (solid accent border + bg-hover). When both classes are on the same row (you've expanded the highlighted row), the expanded's solid border wins on the first cell while the kb-glow still tints the rest, so both states are visible.

**State preservation.** `_kbNav = { nodes, segments, lines, services }` — one highlighted entity ID per tab. Each entity's `render*()` calls `_kbRestoreAfterRender(kind)` after rebuilding the table, re-applying the `.kb-highlighted` class to the surviving row (or clearing the state if the entity got filtered out). Mirrors the `_detailExpanded` restore pattern.

**Click sync.** When a user clicks a row (via the existing `onclick` → `expandDetailRow`), the highlight state is updated to match — so click-then-arrow-key works naturally without a "where am I?" surprise.

## v0.19.3.4 — Schedule table now scrolls horizontally
v0.19.3.3 successfully kept the wide schedule table from stretching the data table — but the wide table itself was still being clipped instead of scrolling. The clipping happened at `.dc-body` (the collapsible's content wrapper), which has `overflow: hidden` for its open/close height animation. Wide content was hitting that hidden overflow before it could reach `.detail-content`'s `overflow-x: auto`.

**Fix.** `.dc-body` now switches to `overflow-y: visible; overflow-x: auto;` *after* the open animation completes — gets a horizontal scrollbar inside the collapsible itself for wide content like the per-stop schedule. Restored back to `overflow: hidden` before the close animation so the height clip still works correctly. Both inline-via-JS for runtime toggles, and via CSS `.detail-collapsible.open .dc-body` rules so collapsibles that initial-render in the open state (e.g. small services with ≤ 6 deps) get the scroll behavior immediately without needing a manual toggle.

## v0.19.3.3 — Service detail width fix, take 2
The previous attempt (v0.19.3.2 — `display: block` on the detail row) backfired: browsers don't reliably treat a `display: block` `<tr>` inside a `<tbody>` as a full-width block. Instead the cell collapsed to roughly one data column's width, squishing the entire detail content.

**Correct fix.** Capture the table's natural rendered width via `table.getBoundingClientRect().width` *just before* inserting the detail row (after clearing any prior detail), then lock the new `.detail-content` to that exact width via inline `max-width` + `width`. The cell still participates in normal table layout, but its content has an explicit hard cap, so the colspan cell's content's max-content width never exceeds the data table's natural width — no column-width pressure from inside. The wide schedule table inside scrolls horizontally via `overflow-x: auto` on `.detail-content.open` (vertical stays `visible` so embedded maps still grow).

CSS reverted to the pre-v0.19.3.2 detail-row styling. JS-side change is ~5 lines in `expandDetailRow`.

**Known limitation:** the locked width doesn't auto-update on window resize. If the user resizes after expanding, the detail content stays at the original width until they collapse + re-expand. ResizeObserver-based auto-update earmarked for a follow-up if it becomes annoying.

## v0.19.3.2 — Service detail width attempt (superseded by 0.19.3.3)

## v0.19.3.1 — Detail row scrolls to top
Tiny follow-up. The post-expand `scrollIntoView` was using `block: 'nearest'`, which scrolls the row to whichever edge is closest — when reaching a row from above (e.g. arriving via Ctrl+K), the row landed at the bottom of the viewport with the inline detail still cut off below the fold. Switched to `block: 'start'` so the row pins to the top and the detail expansion is visible without further scrolling. Smooth-scrolled, only on user-triggered open (silent restore + collapse don't scroll).

## v0.19.3.0 — Phase 19 Session 3: Detail-Into-Table Accordion
Long-standing wishlist landed. Clicking a row in the **Nodes**, **Segments**, **Lines**, or **Services** table now expands the detail view inline as an accordion row directly below the clicked row, instead of rendering it in a separate panel below the table. Single-expand per tab — opening a different row collapses the previous one immediately. Clicking the same row again toggles it closed. The whole row is the click target now (previously only the entity name was clickable); action buttons (Edit / Delete / Duplicate / etc.) keep working via `event.stopPropagation()`.

**Animation.** Open: the inline content's `max-height` transitions from `0` to its measured `scrollHeight` over 260ms with a custom cubic-bezier easing, then snaps to `none` so future content (e.g. embedded Leaflet maps) can grow freely. Close: reverse — pin to current `scrollHeight`, transition to `0`, remove the row. The expanded data row gets a subtle accent-colored left border + hover-state background for selection feedback.

**Sub-collapsibles for bulky tables.** Inside the detail rows, the heavyweight tables that can be huge for busy entities — Service detail's per-stop departure timetable, Segment detail's "Trains on this segment" log, Node detail's full schedule of departures through the station — are now wrapped in their own animated `<details>`-style collapsible blocks (`detailCollapsibleHTML`). Each has a clickable header with a rotating caret, the section title, and a count chip (e.g. "Departures · 24"). The collapsibles default open if the count is small (≤ 6 for service deps, ≤ 8 for node sched, ≤ 10 for seg trains) and closed otherwise — keeps the inline detail row at a reasonable height even on a 200-departure-per-day major hub.

**State preservation across re-renders.** Each entity tab tracks `_detailExpanded[kind]` — the ID of the currently-expanded row. When the table re-renders (sort change, search filter), the previously-open row is silently re-expanded in its new table position with the animation suppressed (no jarring re-open flash). If the entity got filtered out of the new list, the detail collapses cleanly. The `highlightEntity` row-pulse animation also no-ops during silent restore so the table doesn't flash on every keystroke.

**Implementation:** New helpers in [js/entities.js](js/entities.js) — `expandDetailRow`, `collapseDetailRow`, `_detailRestoreAfterRender`, `_detailRowClickGuard`, `detailCollapsibleHTML`, `_detailToggleCollapsible`. Each `showXxxDetail(id)` was rewritten to build its full HTML string and pass it to `expandDetailRow(kind, id, listId, html, mapInitFn)` instead of writing to a static `<div id="xxx-detail">`. The map-init logic was lifted into the `afterRender` callback that runs once the expand animation completes — Leaflet then measures correct dimensions instead of the 0-height pre-animation state. Each `closeXxxDetail()` now delegates to `collapseDetailRow(kind, listId)`. The static `<div id="node-detail">`, `<div id="segment-detail">`, `<div id="line-detail">`, `<div id="service-detail">` elements removed from [railmanager.html](railmanager.html) — fully replaced.

**CSS:** New `.detail-row`, `.detail-content`, `.detail-collapsible`, `.dc-toggle/caret/title/sub/body/inner`, `.row-clickable`, `.row-clickable.expanded` blocks in [styles.css](styles.css). The pre-existing `.detail-panel` styling is suppressed when nested inside `.detail-content` (no double background/border) so the inline detail looks like part of the table, not a floating panel inside a row.

**Click safety:** `_detailRowClickGuard(event)` checks `event.target.closest('button, a, input, select, textarea, label, .chip.clickable, .clickable')` — clicks on any interactive descendant skip the row-toggle. All chip/inline-button onclicks throughout the detail HTML add `event.stopPropagation()` defensively to prevent re-toggling the parent row when navigating between entities.

**Out of scope:** Detail views on tabs without first-class detail logic (Modes, Stock, Schedule, Departures, Journey) — they remain table-only.

## v0.19.2.0 — Phase 19 Session 2: Ctrl+K Command Palette
First app-wide hotkey: **Ctrl+K** (Cmd+K on Mac) opens a Spotlight-style centered modal with a single search input. One free-text query searches across actions, tabs, lines, services, stations, other nodes, and segments — no prefix predicates, just type what you want. Esc closes; click outside closes; Ctrl+K toggles. Arrow keys navigate, Enter activates, mouse hover updates selection.

**Ranking.** Results are grouped by category in priority order: **Actions → Go to → Lines → Services → Stations → Nodes → Segments**. Within each category, results sort by score (exact prefix beats word-start match beats substring match), then by name. Multi-token queries split on whitespace and require every token to appear somewhere in the candidate label.

**Actions** (8): Create new node / segment / service / line / mode / rolling stock, Save current system, New system. Each action runs its existing `openXxxModal()` entry point after switching to the relevant tab — same code paths as clicking the "+" button on the entity tab. "Save current system" calls `flushSave()` and toasts. "New system" defers to the existing `newSystem()` confirm flow.

**Tabs** (16): Every nav item — Dashboard, Nodes, Segments, Modes, Lines, Services, Schedule, Rolling Stock, Geomap, Railmap, Animated, Departures, Journey Planner, Issues, Settings, Import / Export. Labelled "Go to X" so they read naturally as commands.

**Entity coverage:**
- **Lines** — every `serviceGroup`, secondary text shows the service count, color chip rendered inline.
- **Services** — every `service`, secondary text shows the parent line name, color chip from the parent line.
- **Stations** — every passenger stop + bus stop. Secondary text shows platform count or node type. Bus stops use ◎ icon, regular stations use ◉.
- **Nodes (other)** — junctions, depots, freight yards, waypoints. Secondary text shows the type. Folded under their own "Nodes" section, ranked below stations.
- **Segments** — every segment, labelled "A – B" using endpoint node names. Secondary text shows distance and kind (track / road / osi / isi). Lazily ranked last because they don't have first-class names.

**Match highlighting.** Matched substrings within the result label render as `<mark>` chips (transparent background, accent-color text, bold). Multi-token queries highlight every token's first hit.

**UI consistency.** The palette overlay reuses the existing `--bg-raised`, `--border`, `--accent-glow`, and `--shadow-lg` design tokens. The selected-row chevron is a 2px left border in `--accent`, matching the active nav-item style. Footer shows `↑↓ navigate · ↵ open · Ctrl+K toggle` keyboard hint chips.

**Implementation.** New file `js/palette.js` (~250 lines): state object, scoring function (`_paletteScore`), candidate builder (`_paletteBuild`), HTML render (`_paletteRenderResults`), open/close/toggle controls, init wiring with global `keydown` listener for Ctrl+K. Result list is capped at 60 rows for big-dataset responsiveness. New CSS block in [styles.css](styles.css). Module count 12 → 13.

**Out of scope for Session 2** (Phase 19 follow-ups):
- **Recent + pinned** — separate session, will surface here as a "Recent" header at the top when the query is empty.
- **Localization** — palette text is hardcoded English for now; can add `t()` lookups later.
- **Modes / Rolling Stock entities** — they're table-only with no detail view (clicking a mode goes nowhere meaningful). The "Go to Modes" / "Go to Stock" tabs cover navigation; the "Create new mode/stock" actions cover creation.

## v0.19.1.0 — Phase 19 Session 1: Legacy Cleanup
First small cleanup pass under Phase 19 (Light Tools & QoL). Three concrete items from the roadmap's "Legacy cleanup" bullet list.

**`schemMigrateData()` audited.** Stripped dead v1/v1.5/v2 migration paths and very-early-v3 internal renames. Removed: `delete data.beckmap.guides/lineOrder/lineRoutes/stationCells` (v1.5 + v2 fields gone since Phase 12), the `n.mapX/mapY` undefining loop (v1/v1.5 only — Beckmap v3 uses `lineStations`, not node anchor coords), `data.beckmap.groupOverrides = {}` initialization (replaced by `stationGroups` long ago), the `labelNoWrap → labelWrap` migration, and the `groupOverrides → stationGroups` migration. Function went from ~40 lines with two divergent code paths (fast-path-for-v3 + fallback-for-anything-else) to a single linear init pass: ensure each substructure exists, ensure `version === 3`, save if anything changed. New init-time path also kicks `schemAutoGenerateGroups()` once for brand-new systems with no `stationGroups` yet, matching prior behavior.

**Broken `placed:` search predicate fixed.** [js/entities.js](js/entities.js) line 13 had `placed: n => n.mapX != null` — but Beckmap v3 stopped using `node.mapX/mapY` back in Phase 12, so the predicate has been silently returning `false` for every node since v0.12.0.0 (despite the lang strings still advertising it as "On railmap (yes/no)"). Rewired to check `data.beckmap.lineStations[*][n.id]` (placed on at least one line) OR `data.beckmap.infraStations[n.id]` (placed as unassigned infrastructure). The hint string and predicate registration were correct — only the actual lookup was stale.

**`data.lines` doc reference dropped.** [CLAUDE.md](CLAUDE.md) had a legacy entry in the "Internal vs. UI naming" table for `data.lines` saying "Removal of stripping code earmarked for Phase 10". The stripping was actually removed under v0.10.x already (per VERSION HISTORY); the row was just stale. Deleted.

**TODO/FIXME sweep — clean.** Audit found zero `TODO`/`FIXME`/`XXX`/`HACK` markers in any module. The only hit was the roadmap line itself saying "do a sweep". Nothing to do.

**Not touched.** [js/core.js](js/core.js)'s `migrateSegmentTracks()` and its legacy-track-format handling (string entries, `trackNum` entries) were left alone — they're inside a one-shot migration function that only runs when something actually needs migrating, and they're free safety net for old exports.

## v0.18.4.3 — Re-Open Popup Fix + True Desaturation
**Bug: re-opening a vehicle popup didn't work after the first close.** The custom `_animOnVehicleClick` handler called `m.bindPopup(content).openPopup()` on every click, which fought Leaflet's internal popup-toggle handler that's installed by `bindPopup` itself — both ran on each click, racing to bind/open/toggle. Switched to: bind the popup ONCE at marker creation with placeholder content, set fresh content in the `popupopen` event handler. Click toggles the popup (Leaflet's default), open fills in current state, close clears highlight + state. `_animOnVehicleClick` deleted (unused).

**Past-route shows in desaturated full opacity** instead of the previous fade-via-low-opacity. Past was at opacity 0.18 — visually transparent — which let the network underneath bleed through. Now past is rendered with `_animDesaturate(color)` (mix 55% toward perceived-grayscale luminance) at opacity 1.0, so it's always visible and doesn't visually overlap with anything beneath. Future stays at the bright color at opacity 0.9.

The desat helper handles 3- and 6-digit hex; falls back to the original color for `hsl()` / `rgb()` / named values.

## v0.18.4.2 — Bigger Chevrons + Past-Route Desaturation
**Chevron sized to match the dwell circle.** Triangle points went from `8,0 -4,-6 -4,6` (12 px wide) to `12,0 -6,-9 -6,9` (18 px wide × 18 tall) — same visual mass as the dwell circle (r=9 → 18 px diameter). Geo SVG icon viewBox/dimensions widened to 26×26 with iconAnchor `[13, 13]` so the chevron fits without stroke clipping. Schem polygon points updated to match.

**Past-route desaturation on highlight.** When a vehicle is selected, the route segments the train has already traversed render at low opacity (0.18) and the segments yet to come render at the regular 0.85. Lets you see the train's progress along its route at a glance.

- Current segment (the one the train is currently traversing) is split at the train's t-position. The "past half" of that segment is desaturated, the "future half" is bright. New `_animSplitGeoCoordsAtT` and `_animSplitSchemCellsAtT` helpers do the cumulative-distance split (so the cut lands at the same world-coord position the vehicle marker sits on).
- Schem split uses *placed-leg time-space* — the train can be physically between, say, a junction and a station, but the highlight splits the placed-leg cell-route at the corresponding t. Junctions/waypoints/pass-throughs are handled identically to vehicle positioning.
- New shared helper `_animTrainProgressIn(dep, depId)` returns `{idx, t, kind, effMin}` for the train's current physical-segment index in `dep.times`, used by both highlight functions.

**Highlight tracks the train.** `_animMaybeUpdateOpenPopup` (the 4 Hz popup refresh tick) now also re-renders the highlight, so the past/future boundary moves with the train as it advances. Highlight is cleared when the popup closes (via the same tick when it detects `m.isPopupOpen()` is false).

## v0.18.4.1 — Sidebar: "Animated" After "Railmap"
Reordered the Views section in the left nav so the visual surfaces flow geographic → schematic → live: **Geomap**, **Railmap**, **Animated**. The Animated tab sits last as the consumer of both layouts (it can be flipped between Geo and Schem views internally) rather than between the two static map types.

## v0.18.4.0 — Phase 18 Closeout: Direction Chevrons + Service Route Highlight + Roadmap Update
**Direction chevrons.** Vehicles now show as a triangle pointing along their direction of travel when moving, and a circle when dwelling — at-a-glance you can see which way every train is heading. Both views.

- **Geo:** swapped `L.circleMarker` for `L.marker` + `L.divIcon` containing inline SVG. `_animPositionOnSeg` now returns `{ll, bearing}` — bearing is the CSS-rotation angle for the *current sub-segment* of way geometry (so the triangle orients to the actual local tangent on curved corridors, not just the overall A→B direction). Color/state changes rebuild the icon via `setIcon`; angle-only updates poke the polygon's `transform` directly via `marker.getElement().querySelector` (no `setIcon` thrash per frame).
- **Schem:** each train is now a `<g>` containing both a `<circle>` and `<polygon>`, one shown via `display`, the other hidden. Visibility toggle on dwell/move state change (no element swap), parent `<g>`'s `transform="translate(x,y) rotate(angle)"` for position + rotation in one attribute write. `_animPositionOnSchemSeg` returns `{x, y, angle}` from the cell-route's current sub-segment.

**Click vehicle → highlight its full service route.** The selected service's path is overlaid in the line color (bold, semi-transparent, rounded caps) on whichever view is active. Cleared when the popup closes, when you switch views, or when you click another vehicle (which re-highlights to the new selection).

- **Geo** uses a new `_animLayers.highlight` `L.layerGroup` between landmarks and trains. `_animHighlightGeoRoute(depId)` walks `svc.stops`, finds each segment via `findSeg`, and adds `L.polyline` overlays (weight 7, opacity 0.9) using `segmentCoordsDirected`.
- **Schem** uses a new `<g id="animated-schem-highlight">` between base and trains. `_animHighlightSchemRoute(depId)` walks `dep.times`, collects placed stops in order, and renders the cell-route between each consecutive pair via `_animSchemRouteEntry` + `schemSmoothPath` (weight 8, opacity 0.85).

**Roadmap closeout.** [CLAUDE.md](CLAUDE.md): Phase 18 moved from Upcoming to Completed with a full feature summary; current version bumped to 0.18.4.0; module table updated to include `js/animate.js`; module count 10 → 12.

This closes Phase 18. Next phase: Phase 19 — Light Tools & QoL.

## v0.18.2.2 — Schem Trains Handle Junctions / Waypoints / Pass-Throughs
**Bug.** Trains disappeared whenever their current physical segment ended at a junction, waypoint, or non-placed pass-through stop. `lineStations` only stores placed passenger stations, so when `_animPositionOnSchemSeg` tried to look up the cell for a junction nodeId it got `undefined` and returned null, dropping the train from the schem view.

**Fix.** New `_animSchemMovePos(active, ls)` walks `dep.times` to find the surrounding placed stations bracketing the train's current physical segment. The "schem leg" is `placed-iA → placed-iB`; t along the leg is computed in time-space using `effMin` against `dep.times[iA].depart` / `dep.times[iB].arrive`. Trains glide smoothly across junctions and waypoints because the position is interpolated along the WHOLE placed-leg, not the narrower physical segment that ends at an unplaced node.

**Active cache** now also stores `effMin` per entry (already used by the geo popup info; trivially exposed for the schem position math).

**Dwell at unplaced node.** New `_animSchemDwellPos(active, ls)` falls back to the nearest placed neighbour (previous, then next) when a service has explicit dwell at a junction or non-placed node — train sits visibly at the nearest placed station rather than vanishing for the dwell duration.

## v0.18.2.1 — Schem View Reuses the Editor's Render Pipeline
**Replaced the simplified custom schem renderer with `renderSchematic()` itself.** The 0.18.2.0 schem view was a hand-rolled re-draw — colored line paths and a few landmark dots — which lost the editor's Beck-style polish (segment styles, ticks/terminus marks, blob interchanges, ISI/OSI connectors, label collision-avoidance, mode-driven defaults). The animated schem view now renders through the exact same pipeline that produces the editor's view and the SVG export, so the curated styling carries over verbatim.

**Refactor.** `renderSchematic` in [js/beckmap.js](js/beckmap.js) now accepts three optional parameters: `target` (SVG or G element to receive content; defaults to `#schem-svg`), `wrapDim` (`{w, h}` in px; defaults to the editor's wrap-element dimensions), and `opts.noGrid` (skip the editor grid for read-only embeddings). Existing editor calls (zero-arg) are unchanged.

**`_animRenderSchemFull()`** in animate.js shallow-clones `_schemState` with `zoom: 1`, `viewX: 0`, `viewY: 0`, all selections / drag-state / debug cleared, and calls `renderSchematic(baseG, {w,h}, {noGrid: true})`. The render writes world-coord content into our `<g id="animated-schem-base">`. `_schemState` is restored in a `finally`. The animated tab's independent pan/zoom (via `transform` on `#animated-schem-vp`) wraps both the rendered base and the trains layer.

**Trains layer is a sibling under the same vp transform**, so vehicles pan/zoom together with the network. They render after the rendered base so they're on top.

**White background** on `#animated-schem` to preserve the Beck-style aesthetic. The dark theme stays on the surrounding header and scrubber.

**Removed:** the now-unused `renderAnimatedSchemNetwork()`, `_renderSchemLandmarks()`, `_animCellsToPath()` helpers and their CSS classes (`.anim-schem-label`, `.anim-schem-station-dot`).

## v0.18.2.0 — Phase 18 Session 2: Schematic View on the Animated Tab
**View toggle.** New `Geo / Schem` segmented control on the left of the Animated header. Switches between the existing Leaflet geographic view and a new SVG schematic view drawn from `data.beckmap.lineStations`. Same sim clock, same active-set, same scrubber/date/speed/pause/play controls — just a different layout and different paths to follow.

**Schem rendering.** New `<svg id="animated-schem">` next to `#animated-map`, with three z-ordered groups: network paths, landmark labels, vehicles. Lines use `schemDeriveRoutes(groupId)` from beckmap.js for cell paths, rendered via `schemSmoothPath` (rounded corners) when available, fallback to straight cell-to-cell. Faded stroke (opacity 0.55) to match the geo view's "vehicles, not network" aesthetic.

**Schem landmarks.** Top-THI station picks (same `computeTHI()` function as geo) projected onto the schematic by finding any line that has the station placed in `lineStations`. Mono-font label burned next to a small white dot. Skips stations that aren't placed anywhere in the beckmap.

**Schem train positions.** New `_animPositionOnSchemSeg(groupId, fromNodeId, toNodeId, t)` walks the cell-route between two consecutive line-stations by cumulative pixel distance. Cached per `(groupId, fromId, toId)` in `_animSchem.routeCache`. Bend overrides from the editor (`schemGetBends`) are honored, with direction-aware reversal so cells run in the train's travel direction. Vehicles render as `<circle>` elements; same 8 px / 10 px dwell sizing and white outline as the geo view, for visual consistency.

**Click + hover popups in schem mode.** Free-floating `<div>` overlays (since we're not inside a Leaflet map). Reuse `_animVehiclePopupHTML` and `_animVehicleTooltipHTML` so the content is identical to the geo view. Live-refresh of the popup content extends the existing `_animMaybeUpdateOpenPopup` 4 Hz cadence to also cover the schem popup. Click-outside dismisses.

**Schem pan/zoom.** Independent state (`_animSchem.panX/panY/zoom`), separate from the editor's `_schemState`. Drag-to-pan, wheel-to-zoom anchored at cursor. Initial fit to bounds of all `lineStations`. Pan/zoom applied via `transform="translate scale"` on the viewport `<g>`, so we don't recompute coordinates per frame.

**Tile toggle hidden in schem mode** (it's geo-only — there are no tiles to show). Restored when switching back. Open popups are dismissed on view switch to prevent stale references.

**Files touched:** `js/animate.js` (adds ~330 lines for the schem path + integration), `railmanager.html` (toggle buttons + svg container), `styles.css` (toggle styling, schem container, label/dot/train classes).

**Limitations / follow-ups:** Stations not placed in any line's `lineStations` (i.e., never dragged onto the beckmap editor) won't show vehicles passing through them on the schem view — the position math has nothing to anchor to. Pan/zoom state isn't persisted across page reloads. No keyboard pan/zoom yet.

## v0.18.3.12 — Speed Dropdown Compacted
**Two issues conspired** to make the speed select abnormally wide and push the rest of the controls off-screen:

1. **Label was too long.** The option text "1× (live)" was the longest in the dropdown, and `<select>` widget width on Chromium-derived browsers tracks the longest option's content. Renamed to plain "Live" (the trailing "1×" was redundant — the dropdown's other options already encode the speed multiplier explicitly).
2. **`.btn` class set `display: inline-flex` on the select**, which on native form controls produces unpredictable intrinsic widths. Pinned `#anim-speed { display: inline-block; width: 78px; flex-shrink: 0 }` so the select renders at a fixed slim width regardless of option content.

The header controls cluster now stays compact; the title block + scrubber row should breathe again.

## v0.18.3.11 — Animated Tab: Busyness Heatmap + Header Overflow Fix
**Busyness heatmap on the scrubber.** The slider track now shows a per-5-minute heatmap of how many departures are mid-route at each time-of-day, filtered by the chosen `simDate`'s `schedulePattern`. Linear gradient: hue rotates from `0° (red)` for empty 5-min buckets to `120° (green)` for the busiest bucket of the day, normalized per-day. Yesterday-wrap is included — late-night services bleeding into early morning count toward the dawn buckets. Cached by `simDate`; invalidated by data change. Slider track grows from 4 px → 8 px so the colors are readable at a glance.

**Header overflow fix.** Speed select had no inline `style` overriding the slim padding rule, but its width still pushed the controls off-screen on narrow viewports because the title block (h1 + subtitle) held its full natural width. Now `.anim-header > div:first-child` gets `min-width: 0; overflow: hidden`, with `white-space: nowrap; text-overflow: ellipsis` on the h1 and subtitle — title block shrinks gracefully so the controls always stay visible. Speed select pinned to `min-width: 92px` so its rendered width is predictable instead of varying with selected option.

**Implementation.** New `_animGetBusyness()` builds a `Uint16Array(288)` per-day. `_animRenderBusyness()` builds a 288-stop linear-gradient and assigns `scr.style.background`. Triggered from `initAnimatedMap`, `animSetDate`, `animOnDataChange`, and `animTick` on midnight rollover. Inline padding override removed from `<select id="anim-speed">` so the global `.anim-header select` rule applies.

## v0.18.3.10 — Animated Tab: Layout Fixes
**"Show map tiles" stays on one line.** Header controls now have `flex-shrink: 0` and `white-space: nowrap` so the checkbox label can't get squeezed and split into multiple lines when the row is space-constrained.

**Date input gets a compact fixed width.** `<input type="date">` was rendering at native browser width (~180–220 px on Windows due to spinner + dropdown chrome), which dominated the scrubber row. Pinned to `width: 140px; flex-shrink: 0`. The scrubber gets `min-width: 0` defensively so it can take all remaining space as the row scales.

## v0.18.3.9 — Animated Tab: Date Picker + Slimmer Controls
**Date picker.** New `<input type="date">` at the start of the scrubber row. Picking a non-today date drops live mode into paused (live auto-tracks today's wall-clock date — the two would fight). Otherwise the play state is left alone, so you can preview e.g. a Wednesday's schedule on a Tuesday by picking the Wednesday date and scrubbing through the day. `schedulePattern` (days/dateRanges/specificDates/excludeDates) is evaluated against the chosen date by `_animDepActiveAt`'s existing `patternMatchesDate` calls.

**Header controls slimmed down.** Time chip, play-pause, speed dropdown, Now button, tiles toggle, and Fit button all now share `padding: 3px 10px` and a unified slim height — single-line bar instead of the previous chunky look. Border-radius drops to `--radius-sm` for tighter visual rhythm.

**Date input style.** Mono font, dark `color-scheme` so the calendar picker UI matches the rest of the app on supporting browsers.

## v0.18.3.8 — Animated Tab: Pause + Scrubber
**Pause/resume.** New `⏸` / `▶` button between the clock and the speed dropdown. Adds a third mode `paused` to `_animState.mode`; when paused the rAF loop keeps running (so render & popup updates still flow) but `simMinute` is frozen. Resume restores the mode active before the pause: live → snap back to wall-clock; fast → continue advancing at the chosen speed from the paused-at moment. The clock display tags paused state with a ` ⏸` suffix.

**Day scrubber.** Range slider spanning 00:00 → 23:59 in 1-minute steps, rendered just below the header bar with mono-font endpoints. Dragging it sets `simMinute` directly. If currently in live mode, the scrub drops into paused (you've explicitly chosen a moment to look at, so live's auto-tracking would fight you); fast mode stays in fast and continues advancing from the new anchor — like rewinding a video. The slider position auto-syncs every frame from `simMinute`, so live and fast playback drag the thumb in real time.

**Mode-aware speed dropdown.** Changing speed while paused stays paused but records the resume target (so hitting ▶ later picks the right resume mode). Live and fast modes work as before.

**State surface preserved.** `animSetNow()` always wins → snaps to live + 1× regardless of pause state. All four state-change paths (`animPause`, `animPlay`, `animSetSpeed`, `animScrubberInput`) call the helpers `_animUpdateClockDisplay` and `_animUpdatePlayPauseButton` to keep the UI consistent.

## v0.18.3.7 — Removed GIF / WebM Export
**Reverted the export feature** (introduced in 0.18.3.4–0.18.3.6). The dom-to-image / html2canvas snapshot path was producing visually unsatisfying frames (label drift, low fidelity, inconsistent rendering across panes). To revisit later — likely with a different strategy (vector-only canvas rendering, or a Leaflet-aware library, or driving headless Chromium externally).

**Removed:**
- `<script>` tags for `gif.js` and `dom-to-image-more` in [railmanager.html](railmanager.html)
- The "⬇ Export" button on the Animated tab header
- All export functions in [js/animate.js](js/animate.js) (`animOpenExportModal`, `animStartExport`, `_animDoExport`, `_animSetupWebM`, `_animDrawClockOverlay`, `_animRoundRect`, `_animDelay`, `_animEnsureGifWorker`, `_animGifWorkerBlobUrl`)
- `anim.export` and `tooltip.export_anim` l10n keys

The animated tab itself, vehicle interaction, popups, landmarks, and THI work are all unchanged.

## v0.18.3.6 — Export: Snapshot Lib Swap, Hide Controls, Bigger Default
**Snapshot library: `html2canvas` → `dom-to-image-more`.** The old library mistranslates Leaflet's CSS transforms on the tooltip and marker panes, which caused station labels to drift right of their dots in the captured frames. `dom-to-image-more` serializes the DOM through an SVG `<foreignObject>`, preserving all CSS transforms natively, so labels and the network now line up exactly as on screen. CDN swap in [railmanager.html](railmanager.html) — html2canvas removed.

**Zoom controls excluded.** New `filter` callback on the snapshot rejects any `.leaflet-control-container` / `.leaflet-control` descendant, so the `+` / `−` zoom buttons (and any other Leaflet controls) don't appear in exported frames.

**Default width 960 → 1280 px.** More detail at the cost of a moderate file-size bump. Range expanded to `320–2560 px` for users who want larger or smaller.

## v0.18.3.5 — GIF Worker Fix for `file://`
**Bug.** `Export failed: Failed to construct 'Worker': Script at '…/gif.worker.js' cannot be accessed from origin 'null'.` When BRIXY runs from `file://` (the normal case for a single-page app), the page's origin is `null`, and the browser refuses to spawn a Web Worker from any cross-origin URL — even a public CDN.

**Fix.** New `_animEnsureGifWorker()` fetches the worker source from jsDelivr once per session (CORS allowed for the request itself), wraps the source text in a `Blob`, and creates a `blob:` URL via `URL.createObjectURL`. Blob URLs share the page's origin, so the Worker constructor accepts them. The blob URL is cached so the second export skips the fetch. `_animDoExport` `await`s the helper before constructing the `GIF` encoder.

WebM export is unaffected (it uses `MediaRecorder`, not Workers).

## v0.18.3.4 — Animated Tab: GIF / WebM Export
**Export button** in the Animated tab header opens a modal with:
- **Sim time range** (`from` / `to`, defaults to current sim time + 1 hour). Wrap past midnight is handled — `to < from` interpreted as next-day end.
- **Output duration** (default 10s) and **FPS** (5/10/15/20/30, default 10). Sim range is condensed proportionally into the chosen duration.
- **Width** (default 960 px) — height derived from current viewport aspect ratio.
- **Format** — GIF or WebM (browser-dependent for WebM via `MediaRecorder`).
- **Live clock overlay** — bottom-right `HH:MM` chip burned into the frame.
- **Fit to bounds** — auto-fits the map before recording so the network is centered.

**Pipeline.** Live rAF loop pauses, `_animState.mode` flips to `fast`, tiles disable temporarily (CORS taint blocks canvas reads), each of `durSec × fps` frames is rendered by setting `simMinute` deterministically, building the active set, painting trains, and snapshotting the `#animated-map` element with `html2canvas`. Frames are scaled to the target width and composed onto a buffer canvas with the optional clock overlay before being added to the encoder.

**GIF** uses `gif.js` (CDN, MIT). 2 web workers, quality 10. Worker script is fetched from the same jsDelivr CDN.

**WebM** uses `MediaRecorder` over `canvas.captureStream(fps)`. Picks `vp9` if supported, falls back to `vp8`, then to default WebM codec. Smaller files than GIF for the same quality.

Progress bar updates per frame during capture, then per-percent during GIF encoding. State is fully restored after export (sim time, mode, speed, tiles).

**New CDN deps** in `railmanager.html`: `gif.js@0.2.0` and `html2canvas@1.4.1`, both via jsDelivr.

**Filename:** `{system_name}-YYYYMMDD-HHMM.{gif|webm}`.

## v0.18.3.3 — THI Spatial: Less Aggressive, Floor Guarantees No Zero
**Reformulated the per-pair transfer.** Was `(rawA − rawB) × w × α` (gap-based, unbounded suppression of weak stations). Now `sign(rawA − rawB) × min(rawA, rawB) × w × α` (scaled to the weaker station's raw, so per-pair loss is bounded as a fraction of the loser's own size). A small station next to a giant can lose at most `weak.raw × w × α` per pair regardless of the gap.

**Hard floor.** Adjusted THI is clamped to `max(rawThi × THI_SPATIAL_FLOOR, rawThi + spatial)` with `THI_SPATIAL_FLOOR = 0.25`. No station ever drops below 25% of its raw value, even when surrounded by many strong neighbors. Floor breaks zero-sum only at the edges.

**Tuning.** `THI_SPATIAL_ALPHA` lowered from 0.25 → 0.15. Combined with the new formula and the floor, this is much gentler than the previous version that was driving stations to zero.

**Invariant preserved.** Each cache entry's `spatial` is the *effective* adjustment (post-floor), so `thi == rawThi + spatial` still holds for downstream display. The node-detail tooltip and the Nodes-tab THI column transparently reflect the new values.

## v0.18.3.2 — THI Spatial Competition
**Lateral inhibition added to THI.** After computing raw THI per station group, a second pass adjusts each score by its neighbors within `THI_RADIUS_KM` (default 15 km). The adjustment is `Σ over neighbors of (rawTHI(self) − rawTHI(other)) × (1 − d/R) × THI_SPATIAL_ALPHA` (default α = 0.25). Linear distance falloff: a neighbor 0 km away contributes the full gap, a neighbor at the radius edge contributes nothing.

**Effect.** A station that's the regional anchor (highest raw THI nearby) gains; a station living in the shadow of a stronger neighbor loses. The mechanism is **zero-sum per pair** — total system THI is conserved, so this never inflates or deflates global scores, only redistributes them. Slightly-important stations in sparse regions rise where they wouldn't on raw traffic+topology alone, and clusters of equally-important stations next to a dominant hub get correctly de-prioritized.

**Tie-breaking.** Two stations with identical raw scores can now be split apart on adjusted THI when one sits near a third stronger station and the other doesn't. Exactly the disambiguator we wanted.

**Each `thiByNodeMap()` entry now exposes** `thi` (final), `rawThi`, and `spatial` separately, so the node-detail tooltip breakdown shows e.g. `traffic 200, lines 2, degree 2, spatial −0.83` and the chip's `title` reveals `Total Hub Importance (raw 5.30) — …`. The sortable Nodes column reflects final THI.

**Performance.** O(N²) over passenger stations, but with the radius cutoff and lazy caching (only rebuilt on data change) this is negligible at typical network scales (~tens of ms for 500 stations).

## v0.18.3.1 — Vehicle Popup: Live Updates + Pass-Through Fix + More Info
**Live popup updates.** While a vehicle popup is open, its content refreshes at 4 Hz (every 250 ms) so the state line, ETA countdown, and upcoming list keep pace with sim time as the train moves. Tracked via `_animOpenPopupDepId` set on `popupopen` / cleared on `popupclose`. `_animMaybeUpdateOpenPopup(now)` runs from `animTick` when the tab is visible — no work otherwise. Uses `setPopupContent` so Leaflet doesn't tear down the popup, just swaps innerHTML.

**Pass-through stations no longer show up as "next station".** The popup and tooltip now report the next *non-pass-through* stop, with arrival time computed from that stop's actual entry in `dep.times[]`. The position interpolation is unchanged — the train still physically slides through pass-through nodes, but the user-facing label correctly skips to the next station the train actually stops at. `_animVehicleInfo` walks forward from the current segment index, skipping any `svc.stops[i].passThrough` entries.

**Richer popup content:**
- **Rolling stock line** — name + max speed + traction (e.g. `EMU 350 · 200 km/h · electric`). Uses the existing `dep.stockId || svc.stockId` cascade so per-departure overrides work.
- **Upcoming stops list** — next non-pass-through stops with arrival times. Up to 5 entries; if the route is longer, shows the first 4 + an `··· N more ···` separator + the terminus, so you always see both the immediate horizon and the line endpoint.
- **Terminus annotated** — last stop in the upcoming list is tagged `terminus` in muted text.

`_animUpcomingStops(dep, svc, segFromIdx, phase)` builds the list. Returns `[]` when phase is `terminus` (nothing left).

## v0.18.3.0 — Phase 18 Session 3 Pt 1: Vehicle Interaction + Dwell Visual
**Click a vehicle → popup.** Service name, line color chip + line name, origin → terminus, current state with live ETA, and a "View service →" link that jumps to the service detail tab. The popup follows the marker as it moves (Leaflet `bindPopup`), so the "next stop in N min" countdown is meaningful while you read.

**Hover a vehicle → tooltip.** Compact two-liner: service name + current phase. `→ NextStation (3 min)` while moving, `at StationName` while dwelling, etc. Sticky tooltip follows the cursor; updates on every mouseover so it never goes stale across long hovers.

**Phase detection.** New `_animVehicleInfo(depId)` helper distinguishes four phases: `move` (between stops), `dwell` (mid-route stop), `origin` (boarding window before depart), `terminus` (lingering after arrival). Each phase produces appropriately-worded popup/tooltip text.

**Dwell visual.** Marker grows from radius 8 → 10 and outline weight 2.5 → 3 when the vehicle is at a station (any of `dwell`/`origin`/`terminus`). Reads cleanly as "parked" vs "in motion" without resorting to colors or icons.

**Implementation:** [js/animate.js](js/animate.js) gets four new functions (`_animVehicleInfo`, `_animVehiclePopupHTML`, `_animVehicleTooltipHTML`, `_animOnVehicleClick`) and `_animRenderTrains` switches markers to `interactive: true` with click + hover handlers. Each marker carries its `_depId` and `_isDwell` state so updates are O(1). Popup reuses the existing `.map-popup` class for visual consistency with the geomap.

**Deferred to 0.18.3.x:** time scrubber, GIF export, parallel-offset matching of vehicle positions on multi-line corridors.

## v0.18.1.6 — THI Sortable Column + Uncapped Landmarks
**Sortable THI column on the Nodes tab.** New column between Connections and OGF, showing each passenger stop's score to 2 decimals (or `—` for non-passenger nodes). Click the header to sort asc/desc/off, same pattern as every other sortable column. Drives debugging — you can now scan the whole network ranked by THI without opening node detail one-by-one.

**Uncapped animated landmarks.** Removed the `min(40, …)` ceiling. Limit is now just `max(5, ceil(passengerStations × 0.15))`, so a 1000-station network shows ~150 anchors instead of capping at 40. Small networks still floor at 5.

## v0.18.1.5 — THI Tuning + Animated Tab Polish
**Termini boosted.** THI's terminus weight raised from `2.0` → `3.5` so a quiet single-line terminus reliably beats a 2-line through-stop on a busy corridor. Multi-line junctions still rank highest, which matches the network reality, but a sparse line endpoint now lands on the map where it belongs.

**More landmarks.** Limit on the Animated tab landmark layer relaxed from `min(25, ceil(N·0.12))` → `min(40, ceil(N·0.15))`. Dense networks (200+ passenger stations) now show 30–40 anchors instead of 24–25, while smaller networks scale proportionally.

**Cleaner landmark labels.** Removed the `· 9.85` THI suffix from animated-map tooltips — it's a debugging detail that doesn't belong on a live operations view. Score remains visible on the node detail header chip and via console for anyone who wants it.

## v0.18.1.4 — THI as Cross-Cutting Helper
**Hoisted THI to a first-class core helper.** Moved the formula and computation out of `js/animate.js` into [js/core.js](js/core.js) under a "STATION IMPORTANCE — THI" section. New API: `computeTHI()` (sorted array), `thiByDisplayName()` / `thiByNodeMap()` (Maps), `thiForNode(id)` / `thiForDisplayName(dn)` (numeric lookups). Cached and lazy-built; `bumpTHIVersion()` invalidates.

**Update triggers.** `bumpTHIVersion()` is now called from `save()`, `load()`, and `loadSlot()` in [js/persistence.js](js/persistence.js) alongside `animOnDataChange()`. Any user-visible data mutation (edit/add/delete a node, segment, line, mode, service, stock, departure, slot switch, JSON import) bumps the version; the THI cache rebuilds on next access. `recalculateAll`/`recalculateService`/`recalculateDeparture` call `save()` themselves so they're covered too.

**Adopted in three more places:**
- **Geomap label collision** ([js/views.js](js/views.js) `placeLabels`) — replaced raw `stationTraffic[dn]` with `thiByDisplayName().get(dn)?.thi`. Greedy placement now favors junctions and termini, fixing the "busy corridor hogs all labels" failure.
- **Departure Board "via" selection** ([js/departures.js](js/departures.js) `jpBoardVia`) — slots 3–4 (additional hubs) now sort by THI within the existing "unlocks new destinations for the viewer" filter, with `candidateNewDests` as tiebreaker. Slots 1–2 (next stop, first useful hub by route order) are unchanged.
- **Beckmap most-wanted sidebar** ([js/beckmap.js](js/beckmap.js)) — both the per-line and "Suggested" sorts now use THI as a tiebreaker between equal placement scores, so important stations float up when several would yield the same number of newly-drawable edges.

**Visible THI:**
- **Node detail header** — passenger stops show a `THI 9.85` chip next to the type badge. Hover for the breakdown (`traffic / lines / degree / terminus`).
- **Animated landmark tooltip** — name now suffixed with `· 9.85` so the score is readable on the live map.

CLAUDE.md updated with a "Station importance (THI)" section under the architecture overview, documenting the formula, consumers, and invalidation triggers.

## v0.18.1.3 — Animated Tab: THI-Based Landmarks
**THI (Total Hub Importance)** lands as a real metric for picking landmark stations on the Animated tab. Replaces the pure-daily-traffic ranking that was letting through-stops on busy corridors dominate while leaving important junctions unlabeled.

**Formula** (`_animComputeTHI` in [js/animate.js](js/animate.js)) — pooled per `nodeDisplayName` so multi-node stations sum correctly:

```
THI = 0.5 · log10(1 + traffic)        // dampened: a busy single line can't dominate
    + 2.0 · uniqueLineCount           // interchange hubs win
    + 1.5 · max(0, networkDegree - 2) // branching points get a junction bonus
    + 2.0 · (hasTerminus ? 1 : 0)     // line endpoints are navigationally salient
```

- **traffic** = daily train calls (existing metric, log-dampened so a 1000-call corridor doesn't drown a 5-call interchange)
- **uniqueLineCount** = distinct `serviceGroup`s calling here (a 4-line interchange ranks well above any single-line stop, regardless of traffic)
- **networkDegree** = unique connected stations via `connectedNodes()` from any group member (a topological junction at degree 4 gets +3, a normal degree-2 through-stop gets 0)
- **hasTerminus** = any departure starts or ends here

Top ~12% of passenger stations (clamped 5–25) by THI become landmarks. Tooltip still shows just the station name; the breakdown (traffic / lines / degree / terminus) is on each computed entry for future tooling.

**Background:** searched all 9 prior chat transcripts mentioning THI — every hit was the same one-line ROADMAP earmark ("THI (Total Hub Importance) ranking for station picker sorting"). No formula was ever discussed. Designed from scratch around the failure mode reported on the live tab.

## v0.18.1.2 — Animated Tab: Terminus Lingering
**Origin + terminus dwell:** Services no longer pop in/out exactly at `dep.times[0].depart` / `dep.times[last].arrive`. The active window is now extended by a default-dwell pad on each end, so a vehicle is visible at its origin station for `termDwell` minutes before it departs and at its terminus station for `termDwell` minutes after it arrives. The pad uses the standard dwell cascade — `stock.defaultDwell → mode.defaultDwellTime → DEFAULT_DWELL` setting — converted to minutes.

**Implementation:** New `_animTermDwellMin(svc, dep)` helper. `_animDepActiveAt` now uses `[max(0, first.depart - termDwell), last.arrive + termDwell)` instead of `[first.depart, last.arrive)`. `_animFindStopState` returns a `dwell` state at the first/last node when `effMin` falls in those pad regions. Yesterday-wrap trigger is now `winEnd > 1440` (so a 23:55 arrival with a 5min dwell still shows at 00:00 today). Origin-lingering at literal 00:00 services is clamped (no tomorrow-wrap in v1).

## v0.18.1.1 — Animated Tab Polish
**Full-screen layout:** The Animated tab now anchors to the viewport via `position: fixed` (top:56px from the app header, left:220px from the sidebar) so it fills the available area exactly with no scrolling. Header bar is `flex-shrink:0`, map gets `flex:1` for the rest. The `.content` overflow is bypassed entirely for this tab.

**Landmark stations:** Added a sparse layer of orientation anchors. Daily train traffic per station group is computed (same metric the geomap label system uses), then the top 5–25 (≈12% of passenger stations, capped) are rendered as small white dots with permanent line-style labels (mono font, dark chip with border). Sits between the network and the vehicle markers in z-order. Reuses `nodeDisplayName` so grouped stations pool their traffic and show under one name.

**Sub-second vehicle updates:** Removed the integer-minute cache stamp — `animBuildActive()` now runs every animation frame (gated on the tab being visible). Vehicle positions advance smoothly with sub-minute precision in live mode and at sub-real-second cadence in 60×/300×, instead of teleporting once per sim-minute. The per-segment cumulative-distance memo (`cumDistCache`) still survives across frames; only the active-set reconstruction becomes per-frame.

## v0.18.1.0 — Phase 18 Session 1: Animated Tab
**New "Animated" tab** between Geomap and Railmap in the sidebar. Dedicated Leaflet map showing live vehicle positions across the network, driven by `dep.times[]` so all the existing physics-aware timing (stock acceleration, mode dwell, pass-through handling, schedule patterns) applies for free.

**Live by default.** Speed dropdown defaults to "1× (live)" — sim time is locked to wall-clock with sub-minute precision, so the map shows the actual current state of the network. Selecting 10× / 60× / 300× anchors to the current wall-clock moment and fast-forwards from there. The "Now" button snaps back to live. Header clock shows `HH:MM` (with `60×` etc. suffix in fast-forward mode).

**Vehicles, not stations.** Trains render as prominent 8px circle markers with a 2.5px white outline filled in their line color — visible on any background. The network behind them renders faintly: thin colored polylines per line (no station dots, no labels, no parallel-offset rendering, no interchange dashing). The geomap remains the place for full network detail. Map tiles default off and can be toggled on.

**Position interpolation** walks `segmentCoordsDirected` way geometry by cumulative haversine distance with binary search — smooth pacing even on long curved corridors with unevenly-spaced vertices. Sub-minute precision in the sim clock means animation appears continuous rather than stepped.

**Day rollover + yesterday-wrap.** Sim time wraps at midnight (`simDate` advances). Services whose `times[last].arrive > 1440` (overnight runs) are kept active when their start was on the prior date, so 02:00 sim-time correctly shows trains still running from yesterday's late departures.

**New module:** `js/animate.js` (~330 lines, `anim*` prefix). Separate Leaflet map (`_animMap`) — does not share state with the geomap. `animOnDataChange()` called from `save()`, `load()`, and `loadSlot()` invalidates the active-set cache and the per-segment cumulative-distance memo. `ui.js` `switchTab` calls `initAnimatedMap()` on first open; subsequent opens call `animOnTabShow()`.

**Known limitations (later sessions):** No GIF export yet. No tooltips / click-to-highlight on vehicles. No date picker (sim is always today; fast-forward can roll into tomorrow). No direction-arrow icons (circles only). No beckmap animation.

## v0.17.4.0 / v0.17.4.1 — Node Split & Merge (PR #3, restored in v0.19.5.0)
*This entry was originally stranded in a separate `VERSION_HISTORY.md` file created by the PR; folded in here during the v0.19.5.0 restoration. The feature was merged on GitHub 2026-04-17, silently reverted by the 2026-06-03 upload, and restored in v0.19.5.0.*

- Added ability to split a station or bus_stop node into two separate nodes.
- Segments with shared service usage are grouped as "sticky groups" that move together, preventing accidental service breakage.
- Segments with no service usage can be moved freely.
- Platforms can be moved, renamed, added, or removed per side.
- Optional ISI segment creation between the two halves.
- Added ability to merge two nodes of the same type that share a display name or are connected by ISI/OSI.
- Direct track segments between the two nodes abort the merge.
- Direct ISI segments are automatically removed during merge.
- Platforms retained with [1]/[2] suffixes. Schematic tracks appended.
- Beckmap placements and station groups migrated correctly in both operations.
- v0.17.4.1: fixed overlap resolution for roads; skip cross-type overlap checks; bus stop detail no longer shows road segments twice.

## v0.17.3.2 — Three New Issue Checks
**Issue: Schedule Never Runs** (medium) — fires when a service's `schedulePattern` has an empty `days` array AND no `specificDates` (or every specific date is also in `excludeDates`). Catches schedule patterns that have been edited into a state where no date will ever match. Action: opens the service editor.

**Issue: Junction with 2 Connections** (low) — fires when a `junction` node has exactly 2 segment connections. Junctions are for branching points; a 2-connection junction is functionally a waypoint. Action: opens the node detail view to convert.

**Issue: Suspicious Dwell Length** (medium) — fires when a non-terminal, non-pass-through stop has an effective dwell > 15 minutes (using the standard cascade: stop.dwell ?? stock.defaultDwell ?? mode.defaultDwellTime ?? system default). Catches data-entry errors. One issue per service. Action: opens the service editor.

**Roadmap update:** Sketched Phase 19 (light tools & QoL: Cmd+K command palette, recent/pinned entities, network reach analysis, Gantt time visualization, timetable book export, bulk-edit, search predicates, legacy cleanup), Phase 20 (Undo/Redo), and Phase 21 (historical opening/closing dates, closed/abandoned stations, Marey diagram, operators + ticketing). Added "Considered but out of scope" section to ROADMAP.md.

## v0.17.3.1 — Phase 17 Polish Patch
**Relation import wizard fixes:** `_relFetchAndProcess` now resets `_relImportState` (raw, stations, segments, warnings) at entry, so a failed fetch or retry never displays stale data from a previous attempt. Removed three leftover `console.log('[Relation Import] ...')` debug calls. Dropped the "Back" button at the station review step (step 2) — going back discarded fetched data and forced a re-fetch, which was confusing more than useful. Steps 3–5 retain their back buttons.

**Empty catch logging:** `try { map.fitBounds(...) } catch(e) {}` in `js/journey.js` and `try { entry.leaflet.remove() } catch(e) {}` in `js/views.js` now log a `console.warn` instead of swallowing errors silently. Both are still defensive against known Leaflet edge cases — the suppression stays, but now we hear about real issues.

**Bus/rail terminology audit:** Spot-checked `lang/en.js` and HTML fallbacks for rail-only strings showing in bus/road UI surfaces. Updated tab subtitles ("Track connections between nodes" → "Connections between nodes"; "Define types of rail services" → "Define types of services"; "Train types" → "Rolling stock types"; "Route templates defining train paths" → "Route templates defining service paths"). Updated empty-state text and the CSV import default-electrification label to clarify rail-only scope. The bulk of Phase 14's disambiguation (electrification mismatch, segment form, track conflict detection, mode/infrastructure mismatch) was verified clean.

## v0.17.3.0 — Phase 17 Session 3: OGF Relation Import + Suspicious Segments + Polish
**OGF Relation Import wizard:** 5-step inline wizard to import stations and segments from an OGF route relation via Overpass API. Filters for track ways (empty role only), stop-role nodes. Stitches ways into a polyline, snaps stations, generates segments between consecutive stops. Dedup-aware: existing nodes/segments auto-excluded, segments reference existing node IDs.

**Config form:** Relation ID, default max speed, default track/platform counts, maxspeed boundary handling (use default everywhere or auto-insert waypoints at speed changes), allowed modes, and disambiguation suffix.

**Station review:** Editable names, snap distance display (highlighted >50m), OGF ID dedup detection. **Segment review:** Editable max speed, distance from trimmed geometry, endpoint-pair dedup. **Warnings step:** Grouped by type (snap distance, stitch gaps with coordinates, duplicate stops). **Confirm step:** Summary counts + post-import manual checklist.

**Maxspeed parsing:** Accepts integer km/h and `N mph` (converted). Speed boundary waypoints auto-inserted when enabled, named `WP-{from}-{to}-{n}` with descriptive speed-change text.

**Issue: Suspicious Segment** — detects near-identical geometry between segments sharing endpoints, and express segments whose path matches a chain of shorter segments (A→Z matching A→B→...→Z). Chain detection uses BFS (max 8 hops), flags only the longer segment, shows the matching chain in the description. "Mark as verified" button per-segment to suppress.

**Issue: Segment Overlap** — detects partial track sharing between any two segments (shared or different endpoints). 50m snap threshold, 100m grace zone from endpoints. Bounding-box pre-filtered. Distinguishes branching (shared endpoint) from mid-segment overlap. "Auto-fix" button for shared-endpoint cases opens a modal with a Leaflet map showing both segments and the proposed junction insertion. Apply fix creates junction, splits both segments, reroutes affected services with pass-through junction stops.

**Reverse service improvements:** Track assignment now correctly maps to the opposite track on 2-track segments for all legs. Platform assignment maps to opposite platform on 2-platform stations. Schematic-based auto-assignment fallback for complex cases.

**Track reassignment in route builder:** Multi-track segments now show a dropdown in the segment info row between stops, allowing track changes without rebuilding the route.

**Bug fixes:** Mini beckmap pass-through station highlighting (edge pairs now exclude pass-through stops). Line detail station blobs no longer fade. Geomap node detail paths follow wayGeometry through junctions/waypoints. JP beckmap skips pass-through station marks. Beckmap label orientation apostrophe fix. "Missing OGF node" issue skips nodes with coordinates.

## v0.17.2.0 — Phase 17 Session 2: CSV Import
**CSV Node Import wizard:** 5-step inline wizard to import stations and other nodes from CSV/TSV files. No headers assumed — user assigns column meanings via dropdowns. Supports Name, Type, OGF Node ID, Ref Code, Address, Description, and pipe-separated Platforms columns. Defaults for unmapped fields (type, platform count). Auto-fetches OGF coordinates and tags (name, ref) for nodes with OGF IDs after import.

**CSV Segment Import wizard:** 6-step inline wizard to import segments. Fuzzy node matching (exact, case-insensitive, prefix, substring) maps From/To name columns to existing nodes with confidence-ranked dropdown overrides. Supports Distance, Max Speed, Track Count, Electrification, Ref Code, Description, and OGF Way IDs columns.

**Shared wizard framework:** Step progress bar, sidebar lock during import, cancel-to-return. Both wizards share the file upload, data preview, and column assignment steps.

**Extended `fetchOgfCoords()`:** New `{ updateTags: true }` option populates node name and ref code from OGF tags when empty. Backward-compatible.

## v0.17.1.0 — Phase 17 Session 1: Import/Export Tab + Saves Dropdown
**New Import/Export tab:** Centralized hub for all import and export operations. Four cards: JSON import/export (functional), OGF Relation Import (placeholder), CSV Node Import (placeholder), CSV Segment Import (placeholder). Accessible via new sidebar nav item under System.

**Saves dropdown:** The header saves button is now a dropdown showing the active save name. Click to expand and quick-switch between saves. "New System" option at the bottom. Full save management (rename, delete, duplicate) accessible via "Manage saves..." link on the Import/Export tab.

**New js/import.js module:** Scaffold for Phase 17 import engines. Contains CSV parser with auto-delimiter detection and quoted field support, plus fuzzy node matching for future CSV segment imports.

## v0.16.7.0 — Phase 16 Session 7: Auto-Trim
Way geometry is now automatically trimmed to the segment's actual endpoints when OGF ways extend beyond them.

**Geometric primitives:** `_projectToEdge(p, a, b)` projects a point onto a line segment with clamped parameter. `_snapToPolyline(point, coords)` finds the nearest position on a polyline. `_slicePolyline(coords, snapA, snapB)` extracts the portion between two snap results. These are reusable for Phase 17's relation import.

**Auto-trim in segment form:** New "Trim geometry to endpoints" checkbox (default on) below the OGF Way IDs field. When enabled, fetched way geometry is snapped to the endpoint nodes' coordinates and sliced. Distance is recalculated from the trimmed geometry. If an endpoint is >50m from the nearest way, a warning toast fires.

**Backward compatible:** Unchecking auto-trim preserves the existing full-way behaviour. Segments with no endpoint coordinates skip trimming gracefully.

## v0.16.6.1 — Phase 16 Polish
**Segment detail view:** Services and trains tables show a Track column for multi-track segments. Track names shown as individual chips in the detail header.

**Platform display names:** New `platDisplayName()` strips both "Platform " prefix and "[bracketed]" text. Used in departure board and journey planner — so "Platform 1 [Up]" displays as "1" while the full name remains in service/schedule editors.

**Route builder redesign:** Segment info between stops no longer shows redundant terminal node names. Track name shown prominently in accent color. Multi-track segments without a track assignment show "no track" warning. Arrow (↓) replaces the old pipe character.

**Track-platform schematic mismatch:** The existing schematic mismatch issue detection is now track-aware. If a service arrives at a station via a segment track that doesn't connect to its assigned platform per the schematic, the issue fires. Works for both service-level and departure-level platform assignments.

## v0.16.6.0 — Phase 16 Sessions 4-6: Track Selection, Per-Track Conflicts, Parallel Segments

**Session 4 — Track Selection in Route Builder:**
Service stops now carry `trackId`. The "Extend to" dropdown shows per-track options for multi-track segments (e.g., "Keernaghaan via Track 1 [South] · 3.01km"). Single-track segments auto-assign. Segment info between stops shows which track is used. Platform auto-selection based on schematic connections (if a schematic exists and only one platform connects to the incoming track).

**Session 5 — Per-Track Conflict Detection:**
Occupancy keys changed from `segId` to `segId::trackId`. Two trains on different tracks of the same segment no longer conflict. Single-track segments auto-resolve trackId. Route profiles carry `trackId` and `trackCount`. Issue detection shows track names in conflict messages. Multi-track segments with no track assignment are skipped (no false positives).

**Session 6 — Parallel Segments + Mode Restrictions:**
New `findSegs(a, b)` returns all traversable segments between two nodes (parallel segment support). `isModeAllowedOnSeg(seg, catId)` helper for mode checking. Segments gain `allowedModes` whitelist (empty = all allowed). Segment form shows mode checkboxes with help text. Detail view shows allowed mode chips. Duplicate segment issue relaxed: parallel segments with different `allowedModes` are not flagged. New "Mode Not Allowed on Segment" issue when a service uses a segment that restricts its mode.

## v0.16.3.0 — Phase 16 Session 3: Named Tracks
Segments now store tracks as named objects (`[{id, name}, ...]`) instead of an integer count.

**Data migration:** `migrateSegmentTracks()` converts integer tracks to named arrays on load/import. Schematic references migrated from `{segId, trackNum}` to `{segId, trackId}`. Idempotent — safe to run on already-migrated data.

**Segment form:** Numeric track input replaced with a track list editor (name inputs + add/remove buttons), matching the platform editor pattern. Track IDs preserved across edits for schematic stability.

**Global helper:** `segTrackCount(seg)` in core.js — backward-safe count that works with both integer (legacy) and array formats. Replaces the local schematic-only helper.

**Schematic editor:** All `trackNum` references converted to `trackId`. Track names shown in connection checkboxes. Offset calculations use array index lookup.

**Issue detection + scheduling:** All `seg.tracks === 1` checks updated to use `segTrackCount()`. Unconnected track validation iterates track objects by ID. Route profiles use `trackCount` field.

## v0.16.2.0 — Phase 16 Session 2: Way Geometry Rendering
All geomaps now render segments using OGF way geometry instead of straight lines.

**Main geomap:** Single-line and no-line segments use `segmentCoords()` for curved rendering. Multi-line parallel offset upgraded from 2-point perpendicular to per-vertex offset along the full way geometry via `_polylineOffset()`.

**Detail maps:** Segment, node, line, service, and departure board detail maps all use way geometry. Service and node maps use `segmentCoordsDirected()` for correct route direction.

**Background network:** `_dmDrawBackground()` renders all background segments with way geometry.

**Journey planner:** `jpBuildLegCoords()` traces through segment geometries between consecutive stops instead of connecting node positions with straight lines. Background network uses way geometry.

## v0.16.1.0 — Phase 16 Session 1: OGF Way Geometry
OGF way integration for segments. Segments can now store OGF way IDs and fetched geometry for realistic geomap rendering (rendering wired in 16.2).

**OGF Way IDs field:** New text input + Fetch button on the segment form (track and road segments). Enter comma-separated OGF way IDs, click Fetch to pull geometry from the OGF Overpass API. Auto-stitches multi-way geometry (detects direction, reverses as needed, removes duplicate junction points). Warns if stitch gap exceeds 500m.

**Auto-distance:** Fetched way geometry auto-fills the distance field via haversine calculation. Replaces manual distance entry for segments with OGF ways.

**New helpers:** `haversineDistance(coords)` — pairwise great-circle distance sum. `segmentCoords(seg)` — returns way geometry or straight-line fallback. `segmentCoordsDirected(seg, fromNodeId)` — directional variant for journey legs.

**Detail view:** OGF chip shows way count and point count when a segment has fetched geometry.

## v0.15.1.0 — Phase 15: Detail View Maps
Embedded interactive maps in entity detail views and Journey Planner.

**Geomap insets:** Leaflet maps in node, segment, line, and service detail views. Background network in grey, focal entity highlighted with colored routes and station dots. Label collision detection with zoom-aware re-placement. Nodes show nearby passenger stops (BFS through junctions/waypoints). Segments show both endpoints. Lines/services show full route extent. Respects JP map tiles setting.

**Mini Beckmap insets:** Read-only SVG clone of the live beckmap with focus dimming (non-focus elements recolored to grey at reduced opacity). Per-group path matching prevents cross-line highlighting. Per-service edge filtering using consecutive passenger stop pairs. Focused elements promoted to top z-order. Gold ring highlight for focal station in node view. Pan and zoom via mouse drag/wheel.

**Toggle and expand:** Geomap/Railmap tab bar when both views available. Default preference setting in Settings. Expandable map frames (square aspect, viewport-height sized). Auto-scroll on expand. Leaflet re-fits bounds on toggle from hidden state.

**JP Beckmap:** Railmap tab on each JP result. Service legs sliced to board→alight range. Intermediate station marks shown without labels.

**JP journey simplification:**
- Redundant transfer elimination: if a later service also stops at an earlier boarding point, merge legs (e.g., A→B→C becomes A→C when C's train serves A).
- OSI walk elimination: if the next service also stops at the walk's origin, board there instead; if the previous service continues to the walk's destination, alight there instead.
- Walk-only journey filtering at display time.
- Quality-based journey comparison: fewer OSIs > fewer transfers > later departure.

**Data reload:** `refreshAll()` flushes stale beckmap SVG, detail maps, and render cache on file load/import.

## v0.14.1.0 — Phase 14: Buses
Road-based public transport support for BRIXYmanager.

**Road segments:** New "road" option in the segment type dropdown (Track / Road / Walking interchange). Road segments store distance + maxSpeed only — tracks and electrification hidden. `interchangeType: 'road'` in data model. Amber ROAD chip in segment table. Full segment detail view with services and traffic. Sticky per-type segment defaults (tracks, maxSpeed, electrification remembered separately for track vs road vs interchange; distance never pre-filled).

**Bus stop node type:** New `bus_stop` type in node dropdown. Behaves like station for all passenger operations (JP, departure board, service stops, beckmap placement, platforms/bays). Excluded from station schematic editor (track layout diagrams). Connectable to rail stations via OSI/ISI. Sticky node type default.

**Mode infrastructure type:** New `infrastructureType` field on modes/categories: `rail` (default) or `road`. Dropdown in mode edit form.

**Issue detection:** New "Infrastructure Mismatch" warning (medium severity) when a rail-mode service traverses road segments or vice versa. Electrification check skips road segments. Incomplete segment check validates distance/speed for roads but not tracks.

**Helpers:** `isInterchange(seg)`, `isRoad(seg)`, `isPassengerStop(node)` in core.js. All `!!interchangeType` and `type === 'station'` checks replaced with helpers across all modules (~35 callsites). Beckmap station grouping, ISI/OSI connectors, and geomap rendering all updated.

**Lines:** Description field added to line edit modal, line table, and line detail view.

**Other fixes:** Segment form node filter (track: no bus stops; road: bus stops + junctions + waypoints; interchange: passenger stops). Route builder auto-pass-through includes bus stops as stopping nodes. Route builder scrolls modal to bottom after adding stop. JP date/time only defaults to now on first init.

## v0.13.1.2 — Phase 13 Patch: UI Polish
- Services table group headers now span the correct column count.
- All `.chip` elements use body font (DM Sans) globally.
- Merged "Now" and "Today" into a single "Now" button on both JP and departure board (sets both date and time).
- Date and time inputs are `required` — no blank state possible.
- Date inputs styled identically to time inputs (dark theme, same border/radius/font).
- JP defaults to current date and time on load (was hardcoded to 08:00).
- Date field shown before time field in both JP and departure board.

## v0.13.1.1 — Phase 13 Patch: Testing Feedback
- **Specific dates:** New `specificDates` field — services can run on exact dates (e.g., Mar 1, Jun 15) without hacky single-day ranges. Bypasses day/range filters; still respects excludes.
- **Empty days allowed:** Deselecting all 7 days no longer errors — service runs only via specificDates/dateRanges.
- **MM-DD validation:** Rejects invalid months (>12) and days (>max for month). Feb 30, month 13 no longer accepted.
- **Dedicated Pattern column:** Services and Schedule tables now have a separate Pattern column instead of inline chips.
- **Always show pattern:** "Daily" shown for all services, not just those with explicit patterns.
- **Font fix:** Pattern column uses body font (DM Sans), not display font (Fraunces).
- **Default date to today:** JP and departure board date inputs default to today's date on init. No blank date state.

## v0.13.1.0 — Phase 13: Weekly/Yearly Scheduling
Schedule patterns on services: define which days and date ranges a service operates.

**Core data model:** `schedulePattern` field on services (not departures). Combinable weekly days (0=Mon...6=Sun) + yearly date ranges (MM-DD from/to, year-agnostic) + exclude dates. Null = daily, all year. Backward-compatible with existing data.

**Service form:** Pattern editor with 7 day-of-week toggle buttons, date range from/to inputs with add/remove, exclude dates text field. Live preview using `describePattern()`. Consecutive-day abbreviation (Mon-Fri, Sat-Sun). Pattern badges on service table and detail view.

**Journey planner:** Date input alongside time input. Populates `searchContext` with ISO weekday + full date. `jpDepartureRuns()` rewritten to read pattern from service via `patternMatchesDate()`.

**Departure board:** Date input with Today button. Filters departures by service schedule pattern when date is set. Empty date = show all (backward-compatible).

**Pattern-aware conflict detection:** `getExistingOccupations()` accepts `forSvcId` parameter — skips departures from services whose patterns don't overlap via `patternsOverlap()`. Issue detection (single-track + platform conflicts) also pattern-aware. Year-boundary range handling.

**Schedule view:** Pattern badge chips on service names in the departures table.

## v0.12.9.1 — Phase Complete: Beckmap v3 Finetuning
Extensive finetuning pass while building the London Underground map. Major improvements across all systems:

**Station groups:** Named group system with full UI (create/move/remove members, add candidates). Auto-join on placement. Per-display-name label overrides within groups. Pinched blobs between non-adjacent nodes. Rectangle detection for 4-corner groups.

**Marks & labels:** Perpendicular-aware label auto-positioning (normalized dot product, 20pt penalty). Corner tick shift with label following. Label centering between tied outermost cells. Per-display-name independent direction/wrap/hide controls. Three-way wrap (auto/single/split) with hyphen splitting. ISI/OSI visible → blob.

**Rendering:** Smooth bezier corners on routes. Double-struck z-level-aware two-pass rendering. Dotted style (outlined square blocks). Arrows style (directional chevrons). Per-segment z-order. Collapsible line filter with multi-select checkboxes. Suggested stations section.

**Bend editing:** Cross-product collinearity check (fixes false removals). No cleanup on click-to-create (only on drag). Orphaned bend cleanup when stations removed.

**Other:** Auto-fit on first open. Label drag offset tracking. Adjacency-aware segment rendering. Auto-platform selection. Focus blur on context menu. London Tube + DLR + Overground dataset (379 stations, 13 lines).

## v0.12.9.0 — Session 5: Polish
**Performance cache:**
- `_renderCache` computed once per render: `interchanges` + `routes[groupId]`. All render subsystems read from cache instead of recomputing (was 3× for interchanges, 4× for routes per render).

**Mode-driven line styles:**
- `defaultMapStyle` field on categories (modes): `full|dashed|punched|double|hidden`
- Style cascade: segment override → line override → **mode default** → `full`
- UI: "Map Style" dropdown in the mode/category edit form

**SVG export:**
- SVG button in HUD toolbar
- Exports standalone SVG with proper viewBox, white background, embedded Hammersmith One font
- Strips grid dots and debug overlay
- Downloads as `{systemName}-schematic.svg`

**Debug overlay improvements:**
- Shows group IDs (truncated) next to interchange blobs
- Shows edge keys on routes
- Shows group membership on each line-station
- Uses render cache for routes

**OGF-based geo import:**
- GEO button in HUD toolbar
- Projects all stations with `lat`/`lon` data to relative grid positions
- Maps geo bounding box to ~100×100 grid area (lat inverted for north-up)
- Places all line-stations, auto-joins groups, auto-generates groups
- Fit-to-screen after import

## v0.12.8.0 — Named Station Groups
Complete rewrite of the station grouping system from exclusion-based union-find to explicit named groups.

**Data model:** `data.beckmap.stationGroups[groupId] = { name, members: [lsKey, ...] }`. Each line-station in at most one group. Replaces `groupOverrides`/`excludeFromGroup`.

**Auto-generation:** `schemAutoGenerateGroups()` creates default groups from rules (same nodeId, same display name, ISI/OSI connected). Runs on migration from old format.

**Auto-join:** New line-stations placed from sidebar auto-join matching groups (same nodeId or same display name).

**Station menu rewrite:**
- Shows group name + member list with remove buttons
- "Move to" dropdown: move to another group, ungrouped, or new group
- "Nearby stations" section: candidates (same name/ISI/OSI/same node) with Add button
- No more checkbox-based exclusion system

**schemFindInterchanges simplified:** Reads `stationGroups` directly. No union-find.

**Helper functions:** `schemGetGroup(lsKey)`, `schemRemoveFromGroup(lsKey)`, `schemMoveToGroup(lsKey, groupId)`, `schemCreateGroup(lsKey)`, `schemAddToGroupOf(target, candidate)`.

**Migration:** On load, if `stationGroups` doesn't exist, auto-generates from current placements and deletes old `groupOverrides`.

## v0.12.7.0 — ISI/OSI as segment styles
- **Clickable ISI/OSI connectors:** Fat invisible hit target on each connector. Click to select and open context menu.
- **ISI/OSI context menu:** Style picker (full/hidden), bend points toggle (E key), close button. Stored under `segmentStyles['isiosi'][edgeKey]`.
- **ISI/OSI bendpoints:** Full bend editing (same system as line segments). Stored in `routeBends['isiosi'][edgeKey]`. Creation dots, drag, right-click removal all work.
- **ISI/OSI styles:** `full` (dotted, default) or `hidden`. Hidden connectors appear in the sidebar hidden segments list with a Show button.
- **Selection glow:** Selected ISI/OSI connector gets a blue glow.
- **`selectedConn` state:** New selection type for ISI/OSI connectors. Integrated into hasSel, deselect, Escape, E key, bend drag, bend cleanup, right-click removal.
- **Hidden segments list:** Now includes hidden ISI/OSI connectors (with type label).

## v0.12.6.0 — Patch: Corners, terminus, labels, grid, wanted
- **Corner ticks fixed:** At bend stations, the tick now shifts along the more axis-aligned approach and uses THAT approach's perpendicular (not the averaged direction). No more rotated-looking ticks at corners.
- **Terminus covers round cap:** White mask drawn over the round linecap, then the T-bar on top. No more + shape. T-bar stroke thicker (at least 60% of line width).
- **Terminus label padding:** Labels near terminus stations get extra padding for the wider T-bar.
- **Grouped label drag fixed:** SVG `<tspan>` click handling improved — manually walks up from tspan to parent text element when `closest()` fails on SVG elements.
- **Wanted scoring fixed:** Same-nodeId-different-line now counts (was blocked by `nid2 !== nid` check). Both same-node and same-displayname matches boost the score.
- **Grid during drag:** Removed cell count limit entirely — uses stepped grid lines (every 2nd or 5th cell) when zoomed out far. Always shows during drag.

## v0.12.5.9 — Patch: Diagonal ticks, terminus size, label anchoring, grid
- **Diagonal tick connection:** Perpendicular offset and tick length scaled by 1/√2 for diagonal directions, so ticks start at the actual line edge on diagonals.
- **Corner tick shift increased:** 0.5→0.8 cells along the approach, more visible offset from bend.
- **Terminus T-bar bigger:** 3× tick length (axis-aligned) or 2× (diagonal). Much more visible.
- **Label anchoring fixed properly:** N/NW/NE: last line baseline at pad edge (text fully above). S/SW/SE: first baseline below pad (text fully below). E/W: vertically centered on station.
- **Drag grid restored:** Cell count limit raised from 20k to 50k (larger maps were exceeding the old limit).

## v0.12.5.8 — Patch: Tick rendering, terminus, labels, station menu
- **Ticks point toward label:** Mark cache stores line direction; rendering computes perpendicular at render time, choosing the side with higher dot product against the label's direction. Ticks face toward the label.
- **Corner ticks shift off bend:** When a station is at a corner (non-collinear approaches), the tick shifts 0.5 cells along one approach to sit on the straight section.
- **Terminus T-bar restored:** Terminus stations get a perpendicular bar extending both sides (1.5× tick length) in the line's colour.
- **Label click routes to correct node:** Labels now carry `data-gid`. Clicking a label opens the specific line-station's menu, not a random one at that nodeId.
- **Station selection highlights only selected line-station:** Uses `selectedLsKey` (`gid|nid`) for dimming — other line-stations at the same model-node dim properly.
- **Label anchoring fixed:** N/NW/NE: text baseline at pad edge (text above). S/SW/SE: text shifted down (text below). E/W: vertically centered.

## v0.12.5.7 — Patch: Tick detection fix + grouped label positioning
- **Tick detection fixed (for real):** Routes are per-edge (station pair), so a through-station always appears at the start/end of its edge routes — never in the middle. New logic counts how many edges a station appears in: 2+ edges = tick (through-station), 1 edge = terminus (blob), 0 = simple. Through-stations now correctly get ticks.
- **Grouped label positioning:** Labels for grouped stations now use ALL cells from the entire interchange group (not just cells from one nodeId). Positioned relative to the full blob extent.

## v0.12.5.6 — Patch: Tick detection + per-line-station label overrides
- **Tick detection fixed:** Interchange marks only applied when the group has 2+ unique grid positions. Same-name stations at the same cell (overlapping) are now treated as simple/tick/terminus — not interchange. Through-stations correctly get ticks now.
- **Label overrides per line-station:** `labelOverrides` now keyed by `gid|nid` (line-station key) instead of just `nid`. Ungrouped line-stations at the same model-node have independent label direction/visibility. Falls back to nodeId-level override for compatibility.
- **Station menu uses line-station key:** Label direction picker and hide checkbox operate on the selected line-station, not the whole node.

## v0.12.5.5 — Patch: Mark detection fix, ungrouped labels
- **Mark detection uses line-station keys:** `interchangeKeys` set built from `gid|nid` keys in interchange positions (not just nodeIds). Ungrouped line-stations at a shared nodeId now correctly get tick/terminus marks instead of all being forced into interchange marks.
- **Terminus restored:** First/last route cell → `'terminus'` (renders as white circle blob). Through-stations → `'tick'` (perpendicular bar). Only truly ungrouped through-stations get ticks.
- **Ungrouped labels:** Line-stations at the same nodeId that are in different groups (or ungrouped) each get their own label. Previously only one label per nodeId.
- **Station menu `checked` fix:** `isChecked` properly computed from `excludeSet` — no more ReferenceError.

## v0.12.5.4 — Patch: Ticks, grouping, labels
- **Ticks truly one-sided and smaller:** `tickLen = max(2, zoom * 2)` — small protrusion from line edge outward. Termini get T-bar at 2× tick length.
- **ISI/OSI dots:** `stroke-dasharray="0.1 gap"` with round linecap produces true dots (not dashes).
- **Grouping rewrite (line-station keys):** Union-find now operates on `gid|nid` keys, not just `nodeId`. Same-model-node on different lines CAN be ungrouped by excluding the line-station key.
- **Station menu shows same-node-different-line candidates:** Grouping section lists line-station candidates for same model-node (with line name in brackets) alongside same-name and ISI/OSI candidates.
- **Label vertical anchoring:** N/NW/NE directions anchor at bottom of text. E/W anchor at center. S/SW/SE anchor at top. Multi-line labels centered properly.

**Remaining for next session:**
- ISI/OSI as segment styles (hide/show toggle, bendpoints)
- Label wrap toggle per station
- Hidden lines in hidden segments list
- Auto-hide nodes when all segments hidden
- Tick/blob toggle on station menu

## v0.12.5.3 — Patch: Tick size, per-line-station menu, labels, hidden segments
- **Ticks shrunk:** 0.35 cell units, one-sided only (starts at line edge, extends outward). Classic tube map proportions.
- **Termini:** T-bar extending both sides, 2× tick length.
- **Station menu per-line-station:** Clicking a station dot without dragging opens the context menu showing that specific line's chip. `selectedStation` is now `{nodeId, groupId}`.
- **Labels word-wrapped:** Names >10 chars with 2+ words split into two lines at the balanced midpoint. Uses `<tspan>` for multi-line SVG text. Text width uses longest wrapped line for collision scoring.
- **Label collision improved:** Route overlap penalty raised to 15 (from 5). TextH accounts for multi-line. Horizontal lines now strongly push labels N/S.
- **Sidebar wanted scoring:** Stations that share a display name with an already-placed station also count toward the "wanted" score (so bracket variants appear in Suggested).
- **Hidden segments list:** Bottom of the default sidebar shows any hidden segments with a "Show" button to restore them.
- **Station selection dimming:** Selecting a station dims everything else (routes, blobs, other stations).
- **`schemDeselectAll()`:** Utility to clear all selections, used by Close buttons.

## v0.12.5.2 — Patch: Ticks, termini, station menu, labels, orphan cleanup
**Tick marks fixed:**
- Tick now extends both sides of the line (classic tube map perpendicular bar), 1 full cell width
- Length increased from 0.6 to 1.0 cell units for clear visibility
- Uses butt linecap for sharp ends

**Terminus marks:**
- T-shaped perpendicular bar at line ends (same rendering as ticks but at first/last route cell)
- Direction computed from the approaching/departing cell
- Falls back to white circle if no route direction available

**Station context menu rebuilt:**
- Shows line chips for which lines the node is placed on
- Label direction: 3x3 arrow grid (NW/N/NE/W/Auto/E/SW/S/SE) with Unicode arrows, Auto in center. Separate "Hide label" checkbox below.
- Station grouping: per-node checkboxes for each candidate station. Shows connection type (same name, ISI, OSI). User can uncheck to exclude specific stations from grouping.
- `excludeFromGroup` stored in `groupOverrides[nodeId]` — respected by union-find in `schemFindInterchanges`
- No more `disableAutoGroup` toggle — replaced by per-candidate checkboxes

**Station selection dimming:** Selecting a station now dims all other stations, lines, and blobs (like segment/line selection).

**Label collision improved:** Route/station overlap penalty increased from 5→15. Labels on horizontal lines now strongly prefer N/S placement.

**Orphan cleanup:** `schemCleanOrphanedStations()` runs at the start of each render. Removes line-stations whose node is no longer served by any service on that line.

## v0.12.5.1 — Patch: Session 3 fixes + Station Context Menu
**Bug fixes:**
- **ISI/OSI connectors:** Now zoom-scaled dotted lines (round cap, `dasharray = dotW dotGap` scaled by zoom). Routed through 45° diagonal-first paths.
- **Tick direction:** Uses cur→next direction (not prev→next which cancels at bends). Perpendicular bar now correctly crosses the line.
- **Label collision:** Checks overlap against route cell boxes AND station marks, not just other labels. 8-direction candidates (N/NE/E/SE/S/SW/W/NW) with preference scoring. For multi-node stations, starts label from the outermost node in the chosen direction.
- **Label dedup in groups:** Same display name within the same interchange group → only one label shown. Different display names (e.g. Bank + Monument) → each gets its own label.
- **Double class attribute fix:** Labels no longer emit two `class=` attributes when dimmed.

**Station context menu (click a station without dragging):**
- **Label Direction:** 8-direction picker (N/NE/E/SE/S/SW/W/NW) + Auto + Off. Stored in `data.beckmap.labelOverrides[nodeId]`.
- **Station Grouping:**
  - "Disable auto-grouping" checkbox: prevents this station from grouping with same-name stations.
  - "Group with ISI" checkbox: opts this station into grouping with ISI-connected stations (default: off).
  - "Group with OSI" checkbox: opts this station into grouping with OSI-connected stations (default: off).
  - Shows connected station names for ISI/OSI options.
  - Stored in `data.beckmap.groupOverrides[nodeId]`.

**Interchange grouping rewrite (`schemFindInterchanges`):**
- Union-find algorithm groups stations by: same nodeId different lines (always), same display name (unless disableAutoGroup), ISI-connected (if includeISI), OSI-connected (if includeOSI).
- Groups can now span multiple nodeIds.
- ISI/OSI connectors hidden when both endpoints are in the same visual group.

## v0.12.5.0 — Session 3: Marks + Labels + ISI/OSI
- **Station mark types:** Four distinct marks based on route topology:
  - **Tick:** Through-stations get a one-sided perpendicular bar in the line's colour, extending from the station cell in the perpendicular direction.
  - **Terminus:** No extra mark — the line's round stroke-linecap serves as the visual terminus. Transparent hit target remains for dragging.
  - **Interchange:** Inside interchange blobs, small hidden dots (hover-visible, unchanged).
  - **Simple:** White circle for stations not yet on any route.
- **`schemBuildMarkCache()`:** Pre-computes mark type and tick direction for every line-station. Runs once per render. Detects direction changes from route cell neighbours.
- **ISI/OSI connectors:** `schemFindISIOSI()` finds interchange segments where both endpoints are placed. Renders as black dotted lines between station centroids. Dimmed when uninvolved with selection.
- **Label auto-positioning:** 4-direction algorithm (E, W, N, S). Each candidate scored by overlap with already-placed labels. East preferred (lowest penalty). Labels use `text-anchor` for proper alignment in all directions. Centroid-based positioning for multi-line stations.

## v0.12.4.4 — Patch: Station dimming, bend fixes
- **Uninvolved stations fade:** When a segment or line is selected, stations not at the segment's endpoints (or not on the selected line) dim to 20% — labels, marks, and interchange blobs.
- **Bend cleanup simplified:** No more re-sorting. Preserves user ordering. Only removes consecutive duplicates and endpoint-coincident bends.
- **Bend insertion fixed:** Uses `schemPointToSegDist` to find which leg of the route (between consecutive waypoints) the new point is closest to, then inserts at that segment index. No longer depends on distance from a canonical start endpoint.
- **Auto-vertices full size:** Direction-change points now render at the same `bigR` size as explicit bends.
- **E key fixed:** Panel ID corrected from `panel-railmap` to `panel-schematic`.

## v0.12.4.3 — Patch: Selection fade, E key fix, bend cleanup
- **Selection fade:** Non-selected routes dim to 20% opacity (CSS `schem-dimmed`) when a segment or line is selected. Replaces the broken pulse/glow.
- **E key fixed:** Panel ID was `panel-schematic`, not `panel-railmap`. Keydown now fires correctly.
- **Creation dots 50% opacity:** Lesser guide dots render at 0.5 opacity to clearly distinguish from real bend points.
- **Auto-vertex detection fixed:** Only actual direction changes shown as mid-size guides (checks direction sign change between consecutive cells), not every route cell.
- **Bend cleanup improved:** Re-sorts bends by Manhattan distance from start after drag. Iterative collinear removal (restarts after each mutation to catch cascading removals). Handles duplicates and endpoint-coincident bends.
- **Bend insertion fixed:** Uses path-walking distance along the live route (not Euclidean from arbitrary endpoint).

## v0.12.4.2 — Patch: Bend editing polish
- **Smaller bend indicators:** Explicit bends (`zoom * 2.8`) < station marks (`zoom * 3.5`). Auto-vertices (`zoom * 2`) < explicit. Creation dots (`zoom * 1.2`) smallest. Hit areas stay large for usability.
- **Pulsing coloured glow selection:** Selected segment now has a bright pulsing glow in the line's colour (CSS `schem-glow` animation). Replaces the subtle white marching dashes.
- **E shortcut fixed:** Key handler moved from canvas element to `document` so it fires regardless of focus. Ignores when typing in inputs.
- **Bend cleanup:** `schemCleanBends()` runs after every bend drag and removal. Merges consecutive duplicate positions, removes bends at endpoints, removes bends on straight sections (same direction as neighbors).
- **Bend insertion order fixed:** Uses path-walking distance along the current route instead of Euclidean from an arbitrary start. Bends now insert at the correct position.
- **Auto-show new bends:** Route is recomputed every render, so dragging a bend that creates a new direction change automatically shows the new auto-vertex in the overlay.
- **Punched style fixed:** Solid outlined base visible through dash gaps (colour outer + white inner, then full-colour dashed overlay on top).
- **Pan in bend mode:** Non-guide clicks now pan the map instead of being absorbed.

## v0.12.4.1 — Patch: Style, selection, and bend editing fixes
- **Selection highlight:** Dark shadow + coloured marching dashes instead of white-on-white. Visible on the white background.
- **Punched style fixed:** Now renders correctly: solid outlined base (colour outer, white inner), then solid dashed overlay fills in the dash segments. The outline shows through the gaps.
- **Bend editing rewritten with SVG hit targets:** Three tiers of guide points rendered as SVG circles with large transparent hit areas (per reference implementation). Clicking a lesser dot or auto-vertex promotes it to an explicit bend and immediately starts dragging. Much more responsive than world-space hit testing.
- **Auto-bend vertices shown:** Direction-change points along the route are now visible as medium-sized white circles. Previously only explicit bends were shown.
- **All intermediate cells shown:** Every cell along straight route sections gets a small creation dot.
- **Panning in bend mode:** Non-guide clicks now start panning instead of being absorbed. Can pan while editing bends.
- **Right-click bend removal** still works as before.

## v0.12.4.0 — Session 3: Segment Menus, Styles & Bend Editing UX
- **Sidebar context menus:** Selecting a segment replaces the sidebar station list with a context menu. Escape or "Close" returns to the station list.
- **Segment context menu:** Three options: Segment Style, Bend Points (toggle with E key), Show Line.
- **Line context menu:** Reached via "Show Line" from a segment. Shows default line style picker.
- **Station context menu:** Stub placeholder (coming soon).
- **Segment styles:** `full`, `punched`, `dashed`, `double`, `hidden`. Per-segment overrides stored in `data.beckmap.segmentStyles[groupId][edgeKey]`. Falls back to line default then `full`.
- **Line styles:** Default style per line in `data.beckmap.lineStyles[groupId]`.
- **Double-struck rendering:** Two-pass: thick outer stroke + white inner stroke.
- **Animated selection highlight:** Marching dashes (white, semi-transparent) on the selected segment. CSS `schem-march` keyframe animation.
- **Bend editing mode:** Press E or click "Bend Points" to enter. All route cells shown: large white circles at station endpoints, large blue circles at explicit bend points (draggable), small grey creation dots at intermediate cells (click to add bend). Right-click a bend to remove.
- **Creation dot hit testing:** `schemHitTestCreationDot()` finds clickable intermediate cells.

## v0.12.3.0 — Session 2: Bend Insertion
- **Route selection:** Click on a line's rendered route to select it (highlighted with a thick translucent overlay). Escape or click empty space to deselect.
- **Bend points:** Click on a selected route to insert a bend point (grid-snapped, blue handle). Drag bend handles to move them. Right-click a bend handle to remove it.
- **`data.beckmap.routeBends[groupId][edgeKey]`:** Stores per-line per-edge bend overrides as `[{gx, gy}, ...]`. Routes through bends use diagonal-first legs between consecutive waypoints.
- **`schemRouteWithBends()`:** Routes from→bends→to using chained `schemRouteLeg()` calls.
- **`schemHitTestRoute()`:** Finds the nearest line-edge route segment to a click position.
- **`schemHitTestBend()`:** Finds the nearest bend handle to a click position.
- **`schemCollectEdges()`:** Extracts unique station-pair edges per line (shared with `schemDeriveRoutes`).
- **`schemEdgeKey()`:** Canonical direction-independent key for edge/bend storage.
- **Reset clears routeBends.**
- **Migration initializes routeBends.**
- **Nub size halved** inside interchange blobs.

## v0.12.2.2 — Patch: Interaction + visual fixes
- **Labels draggable:** Station labels now have `cursor:grab` and start a drag on the right-most line-station at that node. Station marks take priority over labels in hit testing.
- **Interchange blob 45° routing:** Blob path between cells uses diagonal-first routing (same as line routes), producing proper angled capsules.
- **Overlapping cells = simple station:** If all line-stations at a node occupy the same cell, no interchange blob is drawn — just a normal station mark.
- **Inner dots hidden in blobs:** Line-station marks inside interchange blobs are invisible by default, visible on hover (CSS transition).
- **Line width adjusted:** `zoom * 5.5` (was `zoom * 7`) — between the two previous values.
- **Terminus marks:** Same size as regular marks (uniform).

## v0.12.2.1 — Patch: Visual polish (all feedback items)
- **White station marks:** All line-station dots are white with black outline (no line colour).
- **Angled interchange blobs:** Thick-stroke path through cells produces angled capsules for diagonal pairs, V-shapes for V arrangements — not bounding-box rects. White fill, thin black outline.
- **Branched lines fixed:** `schemDeriveRoutes()` iterates ALL services per line (deduped by cell hash), not just the longest. Multiple physical routes render separately.
- **Labels:** Positioned at right-most cell of each interchange with more padding from the mark/blob edge.
- **Sidebar grouped by line:** Colour headers per line, stations listed underneath. No per-item line chips.
- **Lines thicker + zoom-scaled:** `lineWidth = max(3, zoom * 7)` — no upper clamp. Lines grow with zoom just like station marks.
- **Termini:** Same size as regular station marks (no thick distinction).
- **One label per station:** Drawn once per nodeId at the right-most placed cell, not per line-station.

## v0.12.2.0 — Session 1 (rethink): Per-Line Station Placement
Complete rethink of the Beckmap v3 model. Instead of one station anchor with auto-expanded blobs, each line-station is placed independently on the grid.

**Data model:**
- `data.beckmap.lineStations[groupId][nodeId] = {gx, gy}` — each line-station placed individually
- No `node.mapX/mapY` on the beckmap — dropped entirely
- No `lineRoutes` or `stationCells` — routes derived on render from placed line-stations
- `data.beckmap.version = 3`

**Sidebar:** Shows per-line station entries ("Station Name [Line]" with colour chip). Each is independently draggable onto the canvas. Suggested section scores by adjacency to already-placed stops on the same line.

**Rendering:**
- Routes derived per line: connect consecutive placed stops with diagonal-first 45° routing
- Line-station marks: filled circles in line colour (larger for termini)
- Interchange marks: rounded-rect blobs auto-drawn around any station with 2+ placed line-stations
- Labels drawn once per station (first placed line wins)

**Stripped:** All of Session 1's offset routing, blob expansion, stationCells, auto-routing triggers, schemExpandStationCells, schemOccupiedCells, schemOffsetRoute, schemRegenerateRoutes.

## v0.12.1.0 — Session 1: Parallel Lines + Station Blobs
- **Auto-routing on placement:** Placing a station from the sidebar or moving a station now triggers `schemRegenerateRoutes()`, which auto-generates routes for any line that has 2+ placed stations but no existing route.
- **Adjacency-aware offset:** When auto-routing, if a line's base route overlaps cells already occupied by another line, it auto-offsets perpendicular by 1 cell (tries ±1, ±2, ... up to ±5). Parallel lines land on adjacent cells automatically.
- **Station blobs:** Stations with multiple cells (from `data.beckmap.stationCells`) render as rounded-rectangle blobs instead of circles. Blob bounds computed from all station cells with half-cell padding.
- **Auto-expand stationCells:** When a line is routed through a cell adjacent to a station anchor, that cell is automatically added to the station's blob footprint via `schemExpandStationCells()`.
- **Blob-aware labels:** Station labels position relative to blob bounds (offset from right edge), not just the anchor point.
- **Single-cell stations:** Still render as circles (unchanged from v3 Session 0).
- **Reset map button (RST):** Added in v0.12.0.0 patch.
- **Drag grid enhancement:** Grid lines shown while dragging stations, with increased visibility.

## v0.12.0.0 — Session 0: Beckmap v3 Foundation (grid + per-line polylines)
Complete architecture change from v1.5 (shared geometry + offset math) to v3 (per-line grid cells, no shared geometry, no offset math). Each line owns its own route as a sequence of grid cells stored in `data.beckmap.lineRoutes[groupId]`. Parallelism is a property of the data, not the rendering.

**Stripped:**
- All offset math (`schemOffsetPolyline`, `schemComputeLayout` corridor/offset system)
- Shared-geometry rendering pipeline (cell-step decomposition, corridor detection, slot assignment)
- `schemComputeRoute`/`schemComputeRouteLeg` (replaced with per-line `schemRouteLeg`)
- Guide points system (`data.beckmap.guides`, edge selection, guide editing handlers)
- Edge panel in current form (`schemRenderEdgePanel`, `schemResetGuides`)
- Hit testing for edges and guides

**Added:**
- `SCHEM_CELL = 10` (was 24) — finer grid for per-line cell placement
- `data.beckmap.lineRoutes[groupId]` — array of branches, each an ordered `{gx, gy}` cell sequence
- `data.beckmap.stationCells[nodeId]` — station blob cell footprint (manual control)
- `data.beckmap.version = 3` — migration version marker
- `schemRouteLeg()` — 45-degree grid routing returning cell arrays (not pixels)
- `schemAutoRouteLine(groupId)` — derives branches from services, generates cell routes
- `schemAutoRouteAll()` — batch auto-route for all lines
- `schemUpdateStationInRoutes()` — updates line routes when station moves
- `schemUpdateStationCells()` — updates blob cells when station moves
- `schemUnplaceStation()` — clean removal of station from map
- Migration from v1.5: scales positions (×2.4), auto-generates lineRoutes, initializes stationCells

**Kept:**
- Zoom/pan system, coordinate helpers
- Sidebar (search, filter, most-wanted scoring, drag-from-sidebar)
- `schemBuildEdges()` with junction transparency (for topology queries)
- `schemEdgeLineColors()`, `schemEdgeLinesForPair()` (topology)
- `schemStationMark()` detection logic
- Debug overlay (adapted for v3)
- Station drag with grid snapping

## v0.11.7.1 — Final v1.5 build (abandoned — pivoting to v3)
v1.5 (grid + shared segments + pixel offsets) abandoned after Session 3. Offset math still produced cascading issues at partially shared corridors and peeling points, despite global layout precompute. The fundamental problem: perpendicular offset math on shared geometry cannot represent topological corridor transitions cleanly. Pivoting to v3: grid + per-line cells (no shared geometry, no offset math).

## v0.11.7.1 — Patch: Per-Cell-Step Offsets, Selection Fix, Handle UX
- **Removed Phase 2b offset stabilization:** Offsets are now computed purely per cell-step. Each cell-step independently determines how many lines share it and assigns symmetric slots. Partially shared corridors (where lines diverge mid-route) now offset correctly on the shared section and re-center on the solo sections.
- **Edge selection highlights only the selected edge:** Previously highlighted all occurrences of the line across all edges. Now re-renders only the selected edge's route using its specific cell-step offsets.
- **Guide handle UX overhaul:** White circles at every route point (stations + guide points). Guide points distinguished with blue accent stroke. Smaller blue midpoint dots between consecutive route points for easier guide creation.
- **Layout exposes `cellOffsets`:** `schemComputeLayout()` now returns `cellOffsets` map for use by selected-edge rendering.

## v0.11.7.0 — Session: Route Editing with Guide Points (Beckmap v1.5)
- **Guide points:** Per-edge visual routing waypoints stored in `data.beckmap.guides`. Routes through guides using diagonal-first algorithm between consecutive pairs. Independent of the physical network model.
- **`schemComputeRoute` upgraded:** Now accepts optional `guides` array. Routes: station → guide1 → guide2 → ... → station. Extracted `schemComputeRouteLeg` for individual segment routing.
- **Edge selection:** Click on a rendered edge to select it. Selected edge highlighted at full opacity; others dimmed to 25%. Click empty space or Esc to deselect.
- **Edge panel (`schem-edge-panel`):** Shows station pair, line chips with colors, guide count, "Edit route" / "Done" / "Reset" buttons.
- **Guide editing mode:** Click on selected edge's path to add guide at nearest grid intersection. Drag guide handles (diamonds) to move, grid-snapped. Right-click guide to delete.
- **Guide insertion ordering:** New guides inserted at correct position along the route based on distance from canonical start station.
- **Hit testing:** `schemHitTestEdge()` finds closest edge route within tolerance. `schemHitTestGuide()` finds guide handles. Layout cached in `_schemState.lastLayout` for hit testing.
- **`schemEdgeGuideKey()`:** Direction-independent key for guide storage (`fromId|toId` sorted).

## v0.11.6.2 — Patch: Stable Offsets + Peeling Lines on Outer Edges
- **Center-first slot assignment:** Lines sorted by longevity (total cell-step appearances). Longest-lived lines get center slots (0), shorter-lived get outer slots (±1, ±2...). Peeling lines naturally sit on corridor edges.
- **Stable positions on peel:** Each line keeps its slot from the WIDEST cell-step on its edge. When a neighbor peels off, remaining lines maintain their positions — no renormalization shift. May leave a gap at the outer edge where the peeled line was.

## v0.11.6.1 — Patch: Cell-Step Level Corridor Detection
- **Cell-step decomposition:** `schemEnumerateCellSteps()` breaks routes into individual grid-to-grid transitions. `schemCellStepKey()` generates canonical direction-independent keys for each cell transition.
- **Partially shared corridors:** Layout pass now detects which lines share each individual cell-step, not just whole edges. Two lines sharing part of a route (e.g., a diagonal section before diverging) now correctly render as parallel through the shared cells and alone on their diverging sections.
- **Rendering runs:** Lines are rendered as runs of consecutive cell-steps with the same offset. When the corridor width changes (line joins/peels), a new run starts. Each run is one SVG path.
- **Debug overlay updated:** Shows red dots with line count on shared cell-steps.

## v0.11.6.0 — Session: Layout Pass + Parallel Offset Rendering (Beckmap v1.5)
- **Global layout pass:** `schemComputeLayout(edges)` precomputes offset slot assignments for all lines on all edges before any rendering. The renderer is a dumb consumer of precomputed data — it never computes which side a line should be on.
- **Symmetric offset slots:** Lines on shared corridors are spread symmetrically around the centerline. For N lines, slot offsets are `(i - (N-1)/2)` where i=0..N-1. Pixel offset = slotOffset × (lineWidth + 1).
- **Canonical direction:** Each edge's route is computed in a canonical direction (smaller node ID → larger), preventing the v1 tucking bug (§3.1) where opposite-direction traversals flipped perpendicular normals.
- **`schemOffsetPolyline()`:** Offsets a screen-space polyline perpendicular by N pixels. Handles straight segments and bent routes with miter intersection at bends.
- **Multi-line rendering:** Each line on an edge is rendered as its own SVG path at its precomputed offset. Grey placeholder for unattributed edges.
- **Screen-space offsets:** Line gaps are consistent regardless of zoom level (offset computed in screen space after world→screen conversion).
- **Debug overlay updated:** Shows slot assignments per edge (line name + slot offset) and line count.

## v0.11.5.2 — Patch: Edge Line Attribution Fixes
- **Per-line segment map via `lineSegments()`:** Replaced custom walk logic with the proven `lineSegments()` from entities.js for determining which segments each line uses.
- **`.every()` segment check:** A line must use ALL segments in an edge's path to be colored on it (was `.some()`). Prevents lines from bleeding onto wrong junction branches via shared leg segments.
- **Segment-path dedup:** Edges are now deduped by their segment set, not by station pair. Two distinct routes between the same stations (direct vs via junction) are separate edges with independent coloring.

## v0.11.5.1 — Patch: Full Junction Transparency
- **Forking walk at branching junctions:** `schemBuildEdges()` now forks the walk at junctions with 3+ exits, producing station-to-station edges that pass through branching junctions. Junctions are never edge endpoints.
- **Junction positions cleared:** Migration now clears `mapX`/`mapY` on all non-station nodes (junctions, waypoints, depots, freight yards). Only stations are placeable on the beckmap.
- **Consistent forking in scoring and mark detection:** `schemNodeWantedScore()` and `schemStationMark()` updated with the same forking walk logic.

## v0.11.5.0 — Session: Fresh Start + Grid Foundation (Beckmap v1.5)
- **Fresh beckmap.js** — complete rewrite from scratch for v1.5 architecture (grid + shared segments + global layout pass). V2's free-form code entirely replaced.
- **24px grid system** — `SCHEM_CELL = 24` constant. Stations placed at integer grid cell indices (`mapX`/`mapY`). Grid dot rendering at intersections (zoom > 0.4, capped at 10k dots).
- **Grid-snapped station placement** — drag from sidebar or move existing stations; positions snap to nearest grid intersection.
- **Junction transparency** — `schemBuildEdges()` now walks through junctions (not just waypoints), making junctions corridor-transparent per postmortem §3.4.
- **45° grid routing** — `schemComputeRoute()` computes two-leg grid-aligned paths (diagonal-first, then straight) for each edge.
- **Single-line edge rendering** — edges render as colored polylines using the first line's color. Multi-line offset rendering deferred to Session 2.
- **Debug overlay** — DBG toggle button in HUD shows line names at edge midpoints and grid coordinates at stations.
- **V2→grid migration** — `schemMigrateData()` converts v2 pixel-float positions to grid cell integers, clears incompatible v2 lineRoutes, initializes v1.5 data structures (`data.beckmap.guides`, `data.beckmap.lineOrder`).
- **Ported infrastructure** — sidebar with search/filter/scoring, zoom/pan, coordinate display, edge resolution, station mark detection, label/mark drawing (two-pass for correct z-order).

## v0.11.4.1 — Patch: Angle Snapping for Bend Points
- **Angle snapping:** Bend points now snap to the nearest position where both incoming and outgoing sub-segments are valid cardinal/diagonal angles (45° multiples). Computes intersections of 8-direction rays from both neighboring points and picks the closest to the cursor.
- **`schemSnapBendPoint(wx, wy, prevPt, nextPt)`:** New function that finds the optimal snapped position given the cursor and the two adjacent points in the polyline.

## v0.11.4.0 — Session: Bend Point Editing & Angle Validation (Beckmap v2)
- **Line selection:** Click on a rendered line path to select it. Selected line is highlighted; other lines dim to 25% opacity. Click empty space or Esc to deselect.
- **Line info panel:** Selected line shows a panel in the sidebar with color chip, name, edge/bend counts, and an "Edit bends" button.
- **Bend point adding:** In edit mode, click on the selected line's path to insert a new bend point at that position.
- **Bend point dragging:** Drag bend handles to reshape the line path. Free-form movement (no snapping — validated on save per design spec).
- **Bend point deletion:** Right-click a bend handle to remove it.
- **Angle validation on exit:** Exiting bend edit mode validates all sub-segments for cardinal/diagonal angles (45° multiples), acute angles at bends (<90°), and minimum sub-segment length (15 units). Shows warning toast with count.
- **Hit testing infrastructure:** `schemHitTestLine()` finds closest line path within tolerance; `schemHitTestBend()` finds closest bend handle. `schemScreenToWorld()` helper added.
- **Keyboard support:** Esc exits bend editing or deselects line.

## v0.11.3.2 — Patch: Label Hit Priority
- **Two-pass node rendering:** Labels are now rendered before station marks in the SVG, so circles always sit on top of labels in z-order. Labels remain clickable (drag their node), but when a label overlaps another node's circle, the circle wins the click. Split `schemDrawNode()` into `schemDrawLabel()` and `schemDrawMark()` with separate render passes.

## v0.11.3.1 — Patch: Label Click-Through, Dashboard l10n
- **Label pointer-events fix:** Station and junction labels on the Beckmap now have `pointer-events="none"`, so clicking near a label no longer drags the wrong node — clicks pass through to the actual station circle underneath
- **Dashboard stat labels fixed:** Corrected 7 broken `t('dashboard.stat_*')` calls to `t('btn.stat_*')` matching the actual keys in the language file

## v0.11.3.0 — Session: Single-Line Routing (Beckmap v2)
- **Per-line polyline routing:** Each line (serviceGroup) now gets its own polyline data stored in `data.beckmap.lineRoutes`, keyed by line ID with an array of edge routes
- **Auto-route generation:** `schemBuildLineRoutes()` computes which visual edges each line uses (via `lineSegments()` and `schemBuildEdges()`) and creates straight-line routes between placed stations
- **Line rendering:** Replaced placeholder grey edges with proper colored SVG `<path>` elements per line, using `stroke-linecap="round"` and `stroke-linejoin="round"` for tube map style
- **Line width scaling:** Width scales with zoom (`zoom * 4`, clamped 3–12px) for consistent appearance at all zoom levels
- **Regeneration triggers:** Routes auto-rebuild when stations are placed, moved, or unplaced, and on initial load/tab switch
- **Bend point preservation:** Regeneration preserves intermediate bend points (future-proofing for Session 4) while updating endpoints to current station positions

## v0.10.8.10 — Patch: Issue System Fixes
- **Issue filtering fixed for l10n:** Issue types now use stable internal keys (`typeKey`) instead of translated display names for filtering. Hidden issue settings work correctly regardless of active language.
- **Settings stays on Issues tab:** Toggling "Show low-severity issues" no longer jumps back to General tab
- **Low-severity toggle greying:** When "Show low-severity" is unchecked, individual low-severity issue checkboxes are greyed out and disabled (but preserve their checked state)
- **Issue clickthroughs clear search:** Clicking an issue that navigates to a tab now clears any existing search filter first, then scrolls to the entity
- **Issue clickthroughs use setSearchValue:** Search filters set by issue clicks now properly update the tag overlay styling
- **setSearchValue() utility:** New global function that sets a search input value and updates the tag overlay in sync

## v0.10.8.9 — Patch: Filter Tag Styling, Enter Key, Dep/Day
- **Filter tag styling:** Recognized prefixes (e.g., `type:`) shown with accent-colored background in the search input via overlay
- **Backspace removes whole tag:** When cursor is right after a prefix colon, backspace removes the entire prefix in one go
- **Enter selects first hint:** Pressing Enter while filter hints are visible selects and fills the first matching prefix
- **First hint highlighted:** The first matching hint in the dropdown has a subtle active background
- **Services dep column:** Now shows "29/day" format instead of bare number; shows "—" when zero
- **Issue clickthroughs:** Duplicate Name (services) and Duplicate Node Name now use `name:` prefix filter; Duplicate Ref Code already uses `ref:` from previous patch

## v0.10.8.8 — Patch: Search Overhaul, Sort Fixes, Roadmap
- **Search: OR logic** via ` / ` separator (e.g., `type:station / type:junction`)
- **Search: NOT logic** via `-` prefix (e.g., `-type:waypoint`)
- **Search: Boolean** triggers changed to yes/no/true/false (dropped y/n to avoid conflicts)
- **Search: Null handling** — ISI/OSI segments return null for tracks/speed/elec (not 0). Platforms return null for non-stations. These don't match numeric filters.
- **Search: Segments** merged from:/to: into `node:` (bidirectional)
- **Search: Services** mode filter now searches abbreviation too
- **Search hints** localized via l10n keys (`hint.*`). Hints now filter as you type (type "sch" → shows schematic: hint).
- **Sorting** — Added Traffic column sorting for segments. Fixed all remaining broken sort columns.
- **Issue clickthroughs** — Duplicate ref code issue now uses `ref:` prefix filter
- **Roadmap** — Added Phase 13: Detail View Maps (standalone mini-phase). Animated Map → Phase 14, Segment Upgrade → Phase 15.
- **Memory** — Added rule: all user-facing text must go through l10n module

## v0.10.8.7 — Patch: Sorting Fixes, Search Hints, Issue L10n, Legacy Cleanup
- **Sorting fixes:** Non-applicable values (junctions with no platforms) now sort to bottom instead of top. Fixed segments and lines tables not sorting at all (missing applySortable calls). Added Stations/Segments sortable columns to lines table. Added Platform Clearance sortable column to modes table.
- **Search filter hints:** Discord-style dropdown appears when clicking an empty search box, showing available filter prefixes with descriptions. Implemented for nodes, segments, lines, and services tabs.
- **Issue detection l10n:** Wired all 33 issue type names to t() calls. Wired issue section headers and "click to fix" text. Issue type names, section headers now translatable.
- **Legacy cleanup:** Removed schemMigrateData() grid-to-pixel migration from beckmap.js. Removed schematic track format migration (sideA/B/C/D, platformId→platformIds) from entities.js.
- **CLAUDE.md:** Updated to reflect multi-file architecture.

## v0.10.8.6 — Patch: Confirm Messages + Button Styling
- Improved all delete confirmation messages to use "Remove {name}?" format with entity name always visible
- Delete confirmations now show impact info (e.g., "• 5 services will be unassigned from this line")
- Fixed remove-step button styling in service route editor (added appearance:none, padding, hover background)
- Marked 6 changed confirm keys as stale in hs.js

## v0.10.8.5 — Patch: Route Step Buttons + Informative Delete Confirmations
- Fixed route stop ✕ buttons using wrong CSS class (`remove-stop` → `remove-step`) — now properly styled
- Delete confirmations now show entity name and impact summary:
  - Nodes: shows count of segments and services that will be affected
  - Segments: shows node names and count of services routing through it
  - Lines: shows name and count of services that will be unassigned
  - Modes: shows name and count of services using this mode
  - Stock: shows name and count of services using this stock type
  - Services: shows name and count of departures that will be removed

## v0.10.8.4 — Patch: Button Fix + In-App Confirmation System
- Fixed delete button regression: restored ✕ icons on all table delete buttons, close-detail buttons, platform remove buttons, and route stop buttons (20 instances in entities.js)
- Built in-app confirmation dialog system (`appConfirm`, `appPrompt` in ui.js) replacing all browser `confirm()` and `prompt()` calls
- Confirmation dialogs render as dark overlays at z-index above modals, non-clickthrough (only Cancel/Confirm buttons dismiss)
- Replaced all 12 `confirm()` calls (entities.js: 7, scheduling.js: 3, persistence.js: 2) with `appConfirm`
- Replaced 1 `prompt()` call (persistence.js: renameSlot) with `appPrompt`
- No browser dialog calls remain in the codebase

## v0.10.8.3 — Patch: Issue Detection L10n + Misc Strings
- Added ~110 new string keys to `lang/en.js` (now 602 total keys):
  - All 33 issue types with type names, description templates, and detail/advice text
  - Issue section headers (Scheduling Conflicts, Warnings, Data Quality)
  - Missing scheduling toasts (deps added/replaced, recalc done, variant created, orphans removed, invalid time)
  - Missing label strings (clear existing, availability timeline, code, station/junction schematic, etc.)
  - Missing tooltip strings (OGF linked, schematic defined, insert waypoint, duplicate/reverse service)
  - Missing button strings (replace schedule, add departures)
  - Missing message string (select station)
- Mirrored all new keys to `lang/hs.js` with `//new` comments for easy identification
- Issue keys use `{param}` interpolation for dynamic content (entity names, times, counts)
- Note: issue strings are defined in en.js but NOT yet wired into views.js with t() calls — that wiring is the next step

## v0.10.8.2 — Patch: Complete L10n Wiring
- Wired ~197 remaining template-embedded strings to t() calls across all JS files
- entities.js: 145 replacements (table headers, form labels, button text, placeholders, empty states, type labels, schematic directions)
- views.js: 27 replacements (settings labels, descriptions, dashboard text)
- scheduling.js: 17 replacements (tab labels, field labels, legend, empty states)
- journey.js: 6 replacements (empty states, transfer labels)
- beckmap.js: 2 replacements (sidebar empty states)
- All en.js keys are now actively wired — translations will take effect across the full UI

## v0.10.8.1 — Patch: Translation Completeness Checker
- Added "Check Translations" button in Settings (General tab, below language picker)
- Opens a report modal showing missing keys and stale translations for each loaded language vs English
- Language files can declare a `_stale` array of dot-notation key paths for keys where English has changed
- When a stale translation is updated, remove the key from `_stale` to clear the flag
- Convention: when editing an English key, add it to `_stale` in other language files

## v0.10.8.0 — Phase 10 Session 8: QoL Features
- **Prefix search queries:** Generic parser in core.js (`parseSearchQuery`, `matchesPrefix`, `applySearchQuery`). Multiple prefixes with AND logic. Numeric operators: exact, N+, N-, N-M range. Wired into nodes (11 prefixes: name, ref, type, platforms, desc, address, ogf, connections, placed, schematic, line), segments (7: type, tracks, speed, dist, elec, ref, desc), lines (4: services, deps, stations, segments), services (9: line, mode, stock, stops, stop, deps, desc, length, duration). Free text still works as before.
- **Column header sorting:** `sortableHeader()` and `applySortable()` in core.js. Three-state toggle (asc/desc/default). Applied to nodes (5 cols), segments (5 cols), lines (3 cols), modes (3 cols), stock (3 cols), services (3 cols). Services return to grouped-by-line view when unsorted.
- **Issue field highlighting:** `highlightField()` in ui.js. Modal openers accept optional field ID parameter. Pulsing border animation on target form group. Wired to 4 issue types: No Platforms, Missing OGF Node, No Mode, No Stock Assigned. More can be added incrementally.
- Also fixed remaining hardcoded modal titles (6 more converted to t() calls)

## v0.10.7.0 — Phase 10 Session 7: L10n Completion + Legacy Cleanup
- Expanded `lang/en.js` from ~120 to ~300+ string keys covering all app sections
- Converted all toast messages (~54), confirm dialogs (~7), and modal titles (~12) across entities.js, scheduling.js, journey.js, views.js to `t()` calls
- String keys prepared for remaining template-embedded strings (table headers, form labels, button text, empty states) — wiring continues incrementally
- Legacy cleanup: removed `delete data.lines` from persistence.js (3 occurrences)

## v0.10.6.0 — Phase 10 Session 6: L10n Infrastructure + First Pass
- Created `js/l10n.js` — translation system with `t()` function, `{param}` interpolation, `data-t` hydration
- Created `lang/en.json` — first pass ~120 English string keys (hierarchical, one per line)
- Created `lang/index.json` — language registry for the settings picker
- Added `data-t` attributes to all static HTML text (nav labels, page headers, subtitles, buttons, form labels, placeholders, tooltips)
- Updated `persistence.js` — all toast messages, save manager UI, and confirm dialogs now use `t()` calls
- Updated `ui.js` — OGF fetching toasts and node picker empty state use `t()` calls
- Added language picker dropdown to Settings panel (General tab)
- Updated init sequence: loads English, then user's preferred language, hydrates static strings
- Session 7 will complete string extraction across entities, scheduling, departures, journey, views, beckmap

## v0.10.5.0 — Phase 10 Session 5: Final Split — Split Complete
- Extracted journey planner + JP map to `js/journey.js` (~769 lines)
- Extracted settings, issue detection, geomap, dashboard to `js/views.js` (~1,132 lines)
- Extracted railmap/beckmap to `js/beckmap.js` (~770 lines)
- `railmanager.html` is now a 244-line HTML shell with script tags and a 1-line init IIFE
- **Modularization complete:** 9 JS files + 1 CSS file + HTML shell

## v0.10.4.0 — Phase 10 Session 4: Scheduling + Departures
- Extracted scheduling system to `js/scheduling.js` (~891 lines): schedule generation, recalculation, conflict detection, train schedule view, departure editing, schedule table
- Extracted departure board to `js/departures.js` (~284 lines): departure/arrival board with via-station picking
- Script load order: `core → persistence → ui → entities → scheduling → departures → inline`

## v0.10.3.0 — Phase 10 Session 3: Entity CRUD Module
- Extracted all entity CRUD code to `js/entities.js` (~1,935 lines, 8 sections, ~82 functions)
- Sections: Nodes, Station Schematic Editor, Segments, Lines, Categories, Rolling Stock, Stock-Mode Matrix, Services (CRUD only)
- Schedule generation/recalculation/departure editing remain in inline script for Session 4
- Script load order: `core.js → persistence.js → ui.js → entities.js → inline`

## v0.10.2.0 — Phase 10 Session 2: Persistence + UI Infrastructure + Rebrand
- Extracted persistence layer to `js/persistence.js` (18 functions + `newSystem()` relocated from Settings)
- Extracted UI infrastructure to `js/ui.js` (OGF fetching, toast/modal, nav, node search picker)
- Rebranded from "Rail Manager" to "BRIXYmanager" (header, title, dashboard, document title)
- Script load order: `core.js → persistence.js → ui.js → inline`

## v0.10.1.0 — Phase 10 Session 1: CSS Extraction + Core Module
- Extracted all CSS (~450 lines) to `styles.css`
- Created `js/core.js` with foundational utilities: data model, color palette, lookups, settings getters, connectivity/time utils, physics engine
- Relocated `getSetting()` and 9 derivative functions from Journey Planner section to core (used everywhere)
- Relocated `getGroup()`, `groupName()`, `svcLineColor()`, `contrastText()` from Services section to core
- Removed dead legacy constants: `JP_TRANSFER_MIN`, `PLATFORM_CLEARANCE_MIN`; replaced 3 raw `DAY_CUTOFF` usages with `DAY_CUTOFF_()` calls
- `railmanager.html` now references `styles.css` and `js/core.js` via external tags; first step of multi-file modularization

## v0.9.2.3 — Session 2 Patch: Square Bracket Station Grouping
- Station grouping now uses `[brackets]` instead of `(parentheses)` for suffix stripping
- Only matches brackets at the end of the station name (mid-name brackets are preserved)
- Setting renamed from `stripParentheses` to `stripBrackets`
- Updated settings UI label and example text
- Fixed CLAUDE.md: removed stale categories→modes shim claim, corrected VERSION HISTORY filename

## v0.9.2.2 — Session 2 Patch: Wider Beams + Sticky Snaps
- Beam half-width doubled to 2× blob radius (full beam = 2 blob diameters), fixing too-tight snap zones
- Sticky beam behavior: once snapped to a beam, moving out of range doesn't break the snap — only moving out of the beam width does. Enables long straight sections beyond initial range limits
- `activeSnaps` tracked on `_schemState` across frames; cleared on drop

## v0.9.2.1 — Session 2 Patch: Improved Snap Behavior
- Snap beams now have limited range: 400px for connected stations, 150px for unconnected
- Beam width = 2× blob radius (perpendicular tolerance matches visual station size)
- Connected stations are preferred via scoring (lower score = better snap candidate)
- Connectivity resolved through waypoint chains so connected stations are detected correctly
- Eliminated infinite-range snaps that caused distant stations to interfere

## v0.9.2.0 — Session 2: Scaffold
- **Alignment snapping system**: when dragging a station, blue dashed guide lines appear showing horizontal, vertical, and diagonal (45°) alignment with existing placed stations
- Snap threshold of 8 world-pixels; multi-axis intersection snapping (e.g. horizontal with station A + diagonal with station B → snaps to their intersection)
- `schemAlignSnap()` checks all 4 axes (H/V/diag↘/diag↗) against every placed station, picks closest per axis, intersects the two best
- `schemLineLineIntersect()` utility for finding intersection of two infinite lines
- `snapLines` added to `_schemState` for rendering snap guides during drag
- Snap lines cleared on drop (both place and unplace paths)
- **Data model prep**: `data.beckmap` object initialized on load via `schemMigrateData()`, containing `lineRoutes: {}` structure for future per-line polyline storage

## v0.9.1.1 — Session 1 Patch: Version Label
- Added version number display at the bottom of the app-wide sidebar nav

## v0.9.1.0 — Session 1: Strip (Beckmap v2 Rebuild)
- **Gutted the entire Beckmap offset/grid rendering engine (~1,136 lines removed)**
- Removed: `SCHEM_CELL`, grid snapping, `schemGridToPixel()`, `schemCellOccupied()`
- Removed: `schemOffsetPath()` — the parallel offset engine
- Removed: `schemLineIntersect()` — offset miter helper
- Removed: `schemComputeRoute()` / `schemRouteLeg()` — grid-based 45° auto-routing
- Removed: entire corridor detection system (stepLines, canonNormal, expandRoute, section grouping, carry-forward logic)
- Removed: `renderSchemEdgePanel()` / `schemSwapLineOrder()` — edge panel with guide editing and line ordering
- Removed: all guide drag logic (promote, right-click remove, keyboard E toggle)
- Removed: grid dot rendering, `nodePixelOffsets` computation
- Removed: complex `schemDrawNode()` with tick/terminus/offset-aware marks
- Added: `schemMigrateData()` — converts legacy grid coords (mapX/mapY as integers) to pixel coords, strips `mapGuides`/`mapLineOrder` from segments
- Added: `schemWorldToScreen()` — clean world-to-screen coordinate transform
- Simplified `schemDrawNode()` — all stations render as circles with right-side labels
- Placeholder edge rendering — thin straight lines between connected placed nodes (30% opacity)
- Kept: SVG canvas, pan/zoom, HUD buttons, sidebar with search/filter/most-wanted, drag-from-sidebar, drag-to-sidebar removal, `schemBuildEdges()`, `schemStationMark()`, `schemPointToSegDist()`

---

*Phases 1–8: completed prior to version tracking. See project memory for historical context.*
