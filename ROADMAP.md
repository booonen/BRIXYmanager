# BRIXYmanager — Roadmap

## Completed

| Phase | Name | Summary |
|-------|------|---------|
| 1–7 | Core App | Nodes, segments, modes, lines, services, scheduling, journey planner, settings, issue detection, departure boards, station schematics, waypoints, station grouping, rolling stock |
| 8 | Geomap | Leaflet + OGF tiles, Beck-style parallel offsets, label collision, ISI/OSI rendering |
| 9 | Beckmap v1 | Built and scrapped — grid-based offset parallelization caused cascading bugs |
| 10 | Modularization, l10n & QoL | Split into ~9 JS modules, localization support, prefix search, column sorting, issue highlighting |
| 11 | Beckmap v1.5 | Attempted rebuild of v1 with global layout precompute. Same offset bugs returned. Abandoned. |
| 12 | Beckmap v3 | Per-line station placement, derived routes, named groups, 7 styles, SVG export, OGF import. Complete. |
| 13 | Weekly/Yearly Scheduling | Schedule patterns on services (days + date ranges + excludes). Pattern-aware JP, departure board, conflict detection. |
| 14 | Buses | Road segments, bus_stop node type, mode infrastructure types (rail/road), mode-infrastructure mismatch detection. |
| 15 | Detail View Maps | Embedded geomaps + mini beckmap in entity detail views and JP. JP journey simplification. |

---

## Completed (continued)

### Phase 12 — Beckmap v3 ✅ Complete (v0.12.0.0 → v0.12.9.1)
Grid + per-line station placement. No shared geometry. No offset math. Each line-station placed independently on a 10px grid; routes derived on render. Named station groups with full UI. 7 segment styles. SVG export. OGF geo import. London Tube dataset (379 stations, 13 lines). See `BECKMAP_POSTMORTEM.md` for why v1/v1.5/v2 failed.

| Session | Scope | Status |
|---------|-------|--------|
| 0. Foundation | Strip offset code, per-line route storage + rendering, migration | ✅ Done (v0.12.0.0) |
| 1. Per-line stations | Per-line station placement, sidebar, derived routes | ✅ Done (v0.12.2.0) |
| 2. Bend editing | Segment selection, bend points, styles, context menus | ✅ Done (v0.12.4.0) |
| 3. Marks + Labels | Tick/terminus, ISI/OSI, label auto-positioning, station menu | ✅ Done (v0.12.5.0+) |
| 4. Complex Topology | Circular, branches, crossings, rect blobs, named groups | ✅ Done (v0.12.8.0) |
| 5. Polish | Mode styles, SVG export, perf cache, debug, OGF import, finetuning | ✅ Done (v0.12.9.1) |

---

### Phase 13 — Weekly/Yearly Scheduling ✅ Complete (v0.13.1.0)
Schedule patterns on services. Combinable weekly days (0=Mon...6=Sun) + yearly date ranges (MM-DD from/to) + exclude dates. Pattern editor in service form with live preview. Date inputs in JP and departure board. Pattern-aware conflict detection and issue detection. Pattern badges on service table, detail view, and schedule view.

---

### Phase 14 — Buses ✅ Complete (v0.14.1.0)
Road-based public transport. `interchangeType: 'road'` for road segments (no tracks/electrification). New `bus_stop` node type (passenger operations + beckmap, no station schematic editor). `infrastructureType` field on modes (rail/road). Mode-infrastructure mismatch detection. Sticky form defaults for segment type and node type. `isInterchange()`, `isRoad()`, `isPassengerStop()` helpers replace raw type checks across all modules.

---

### Phase 15 — Detail View Maps ✅ Complete (v0.15.1.0)
Embedded interactive maps in all entity detail views (node, segment, line, service) and Journey Planner results. Geomap (Leaflet) and mini Beckmap (cloned SVG with focus/dim/zoom) switchable via tabs with default preference setting. Expandable map frames. Per-service edge highlighting with per-group path matching. Label collision detection on geomaps. JP journey post-processing: redundant transfer elimination (later service serves earlier boarding point) and OSI walk elimination (service also stops at walk origin/destination). Walk-only journey filtering. Quality-based journey comparison (fewer OSIs > fewer transfers > later departure).

---

### Phase 16 — Segment Upgrade ✅ Complete (v0.16.1.0 → v0.16.7.0)
Major overhaul of the segment model across 7 sessions. OGF way geometry for realistic geomap rendering with auto-stitch, Douglas-Peucker simplification, and auto-trim to endpoints. Named tracks (`[{id, name}]`) replacing integer count, with per-track service routing and conflict detection. Parallel segments with per-segment `allowedModes` whitelist. Auto-trim geometry snapping with reusable geometric primitives.

| Session | Scope | Status |
|---------|-------|--------|
| 1. Way fetch | OGF way IDs, Overpass fetch, auto-stitch, auto-distance, maxspeed extraction | ✅ Done |
| 2. Way rendering | All geomaps use way geometry, per-vertex parallel offset | ✅ Done |
| 3. Named tracks | Integer→array migration, track list editor, schematic trackId | ✅ Done |
| 4. Track selection | Route builder per-track dropdown, trackId on stops, platform auto-select | ✅ Done |
| 5. Per-track conflicts | Occupancy keys segId::trackId, track-aware schedule + issues | ✅ Done |
| 6. Parallel segments | findSegs, allowedModes whitelist, mode-not-allowed issue, relaxed duplicate detection | ✅ Done |
| 7. Auto-trim | Point-to-polyline snap, polyline slice, trim checkbox, snap warnings | ✅ Done |

---

### Phase 17 — Infrastructure Import ✅ Complete (v0.17.1.0 → v0.17.4.1)
Bulk infrastructure creation from OGF relations and CSV files. Reuses Phase 16's snap-and-slice primitives. v0.17.4.x added Node Split & Merge (restored in v0.19.5.0 after the June upload clobbered the PR) plus relation importer enhancements: multi-relation batch import, optional service creation, cross-relation + proximity dedup, verified segments, divergence detection upgrades.

- **OGF relation import:** Fetch route relation, filter way/stop members, stitch ways, snap stations to polyline, generate segments between consecutive stops. Maxspeed parsing with optional waypoint splitting at speed boundaries.
- **CSV import:** Upload CSV, map columns to BRIXY fields (nodes and segments separately), preview, bulk-create. Segments reference nodes by name or ref code.
- **Pre-import config:** Default speed, platform/track counts, disambiguation suffix, allowed modes.
- **Post-import review:** Station dedup (same OGF node), segment dedup (same endpoints + path), snap distance warnings. Nothing touches data until user confirms.

Infra only — services, lines, and schedules remain manual.

---

### Phase 18 — Animated Map ✅ Complete (v0.18.1.0 → v0.18.4.3)
Animated visualization of trains moving through the network over time. New "Animated" tab with sim clock (live/fast/paused), deterministic position interpolation, vehicle markers, Geo (Leaflet) + Schem (renderSchematic) views, busyness heatmap scrubber, vehicle popups with live ETA, route highlight. THI hoisted to a first-class core helper during this phase. **Deferred:** GIF/WebM export (rendering pipeline was unsatisfying).

---

### Phase 19 — Light Tools & QoL 🔨 In progress (v0.19.1.0 → )
A grab-bag phase of small, high-value additions and tools. Sketched during the v0.17.3.1 / 0.17.3.2 polish work. Sessions are independent; can be reordered or trimmed freely.

**Done so far:** Session 1 legacy cleanup (v0.19.1.0), Session 2 Ctrl+K command palette (v0.19.2.0), Session 3 detail-into-table accordion (v0.19.3.0), Session 4 keyboard nav in entity tables (v0.19.4.0), Session 5 restoration of the lost PR work (v0.19.5.0). Struck-through items below are done.

**Top bar / navigation**
- ~~Recent + pinned entities, surfaced near the saves dropdown~~ ✅ v0.19.6.0
- ~~Recent saves with last-opened time on the dropdown~~ ✅ v0.19.6.0

**Search & navigation**
- ~~Cmd+K command palette~~ ✅ v0.19.2.0
- Broader keyboard shortcuts (catalogue current ones, fill gaps)
- ~~Keyboard arrow nav in entity tables~~ ✅ v0.19.4.0
- ~~Detail-view-into-table~~ ✅ v0.19.3.0
- ~~Search predicates~~ ✅ already shipped pre-Phase-19 (`mode:`, `line:`, `stops:3+`, ranges, negation, OR groups on all four entity tables) — this sketch predated the implementation

**Bulk operations**
- ~~Multi-select + bulk-edit on services~~ ✅ v0.19.7.0 (segments/nodes deferred; pattern is reusable)

**Visualization**
- ~~Network reach analysis~~ ✅ v0.19.8.0 (Reach mode in the Journey Planner: one-to-all CSA, banded map + station chips)
- Gantt-style time visualization for segment / node usage (one row per track or platform, X-axis = time of day)
- Timetable book export (HTML / PDF per-line departure tables)

**Issue detection** *(deferred from v0.17.3.2 if not picked up earlier)*
- Additional checks as discovered during use

**Legacy cleanup**
- ~~Strip `data.lines` / audit `schemMigrateData()` / TODO-FIXME sweep~~ ✅ v0.19.1.0
- Fix hardcoded strings + missing `t()` keys found in the v0.19.5.x review (palette l10n, ~7 broken key references, `lang/hs.js` catch-up)

Probably 6–8 sessions if all in scope. Trim freely.

---

### Phase 20 — Undo/Redo
Transaction log + UI for reverting accidental changes. Architecturally non-trivial because of immediate IndexedDB persistence — pulled out of Phase 19 to give it dedicated focus.

---

### Phase 21 — Time & Operators
**Historical dates**
- Station / line opening + closing dates (e.g. "show me my network as of 1985")
- Closed / abandoned stations rendered greyed-out on geomap
- Pairs naturally with Phase 18's animation infrastructure (time axis already exists)

**Marey diagram**
- Time-distance string chart per line. The "real" time-based visualization, complementing Phase 19's segment/node Gantt.

**Operators + ticketing**
- New `operators[]` entity grouping lines by operating company
- Per-operator branding (logo, color, livery)
- Ticket pricing, fare calculation in the journey planner

---

### DLC — Disruptions
Disruption modeling and rerouting. Always the last phase regardless of what gets added to the roadmap above it.

---

## Considered but out of scope

Decisions made during Phase 19 brainstorming (2026-05-01) about features that will *not* be built into BRIXYmanager:

- **GTFS export** — deferred indefinitely. Real value is sharing networks with collaborators, but Wib's worldbuilding is single-user. Revisit if collaboration becomes a thing.
- **Demand modeling** — would require ingesting OGF population/landuse data BRIXY doesn't track. Lives in a separate OGF utility program Wib is building, which BRIXY may consume read-only output from later.
- **Fleet allocation / crew rosters** — operationally cool but not the worldbuilder's tool. Firmly out.
- **Track gauge per segment** — already covered functionally by the segment-mode allowedModes restrictor.
- **Print stylesheet** — current app layout reads fine.
- **Tutorials / empty-state guidance / first-run experience** — power-user tool, no hand-holding.
