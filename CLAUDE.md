# BRIXYmanager — CLAUDE.md

## What is this?

BRIXYmanager is a multi-file HTML/JS application for managing fictional railway networks, particularly aimed at those set in the OpenGeofiction (OGF) world. It is a personal tool built by Wib for their OGF project. It covers network topology, service scheduling, journey planning, departure boards, and schematic map visualization.

The app is split across `railmanager.html`, `styles.css`, 14 JS modules in `js/`, and language files in `lang/` (English + optional translations). Loaded with plain `<script>` tags — no build tools.

## Tech stack

- **Multi-file vanilla HTML/CSS/JS** — plain `<script>` tags, no React, no frameworks, no build tools
- **Persistence:** IndexedDB (multi-slot, 300ms debounced `flushSave()`)
- **Import/Export:** JSON files; `showSaveFilePicker` for Chrome/Edge
- **External dependencies (CDN only):**
  - Leaflet 1.9.4 (Geomap)
  - Google Fonts: DM Sans, JetBrains Mono, Fraunces, Hammersmith One
- **Desktop only** — mobile/tablet explicitly out of scope
- **UI reference:** NS (Dutch Railways) style

## Version system

**Format:** `release.phase.session.patch` (e.g., `0.11.4.0`)

- `0` = pre-release
- `11` = Phase 11 (Beckmap v2)
- `4` = Session 4 of this phase
- `0` = No patches yet

**On every version bump:**
1. Update the version string in the sidebar footer of `railmanager.html` (search for `<div style="padding:8px 16px;font-size:10px;` near the `</nav>` tag)
2. Prepend a new entry to `VERSION HISTORY.md` (newest entries at top)

**Current version:** 0.19.5.0

## Validation workflow

After every edit to any JS file, validate syntax across all modules:

```bash
for f in js/*.js lang/en.js; do node -e "new Function(require('fs').readFileSync('$f','utf8'))"; done
```

Always run this before presenting changes. A syntax error in any module means the app won't load at all.

## Data model

The core data object (`data`) contains:

| Collection | Key fields | Notes |
|---|---|---|
| `nodes[]` | id, name, type (`station`/`bus_stop`/`junction`/`depot`/`freight_yard`/`waypoint`), mapX, mapY, platforms[], ogfNode, refCode | mapX/mapY are Beckmap grid cell indices (integers, passenger stops only; junctions/waypoints/depots cleared on load). Waypoints are invisible routing helpers. bus_stop behaves like station for passenger operations but skips the station schematic editor. |
| `segments[]` | id, nodeA, nodeB, distance, maxSpeed, tracks, electrification, interchangeType (`osi`/`isi`/`road`/null) | null = track, `road` = road segment (no tracks/electrification), `osi`/`isi` = interchange. Helpers: `isInterchange(seg)`, `isRoad(seg)`, `isPassengerStop(node)`. |
| `categories[]` | id, name, defaultDwellTime, platformClearance, infrastructureType | Internal name for "modes" (e.g., Intercity, Regional). UI shows "Modes". `infrastructureType`: `'rail'` (default) or `'road'`. Issue detection warns on mode/segment mismatch. |
| `services[]` | id, name, categoryId, groupId, stockId, stops[], schedulePattern | stops: `{ nodeId, platformId, passThrough, dwell }`. groupId links to a line. schedulePattern: `{ days: [0..6], dateRanges: [{from,to}], excludeDates: ['MM-DD'] }` or null (= daily). 0=Mon…6=Sun. |
| `serviceGroups[]` | id, name, color, description | UI name = "Lines". Color determines line color on maps and chips. |
| `departures[]` | id, serviceId, startTime, times[], manualOverrides, platformOverrides, stockId | times: `{ nodeId, arrive, depart }`. Schedule pattern now lives on the service, not the departure. |
| `rollingStock[]` | id, name, maxSpeed, acceleration, traction, defaultDwell | |
| `stockModeMatrix` | `{ stockId: { modeId: 'normal'/'atypical'/'disallowed' } }` | |
| `settings` | systemName, theme, defaultPlatforms, walkingSpeed, ... | All constants use `getSetting()` getters. |
| `beckmap` | `{ version, lineStations, routeBends, segmentStyles, lineStyles, linePriority, segmentPriority, labelOverrides, labelWrap, markOverrides, stationGroups }` | Beckmap v3 data. `lineStations[groupId][nodeId] = {gx, gy}` — per-line station placement. `routeBends[groupId][edgeKey] = [{gx,gy}]` — bend overrides. `segmentStyles/lineStyles` — style overrides. `stationGroups[sgId] = {name, members}` — named station groups. `labelOverrides/labelWrap/markOverrides` — per-station visual overrides. `version = 3`. |

### Internal vs. UI naming

| Internal | UI | Notes |
|---|---|---|
| `serviceGroups` / `groupId` | "Lines" | Keep internal names in code |
| `categories` / `categoryId` | "Modes" | Keep internal names in code |

## Architecture overview

The app is split across these files, loaded by `railmanager.html` via plain `<script>` tags:

| File | Contents |
|---|---|
| `railmanager.html` | HTML shell + init IIFE (kicks off load, renders first tab) |
| `styles.css` | All CSS |
| `lang/en.js` | English UI strings (l10n system) |
| `js/l10n.js` | Translation system (`t()` function, language loading) |
| `js/core.js` | Data model, lookups (`getNode`, `getSeg`, etc.), `getSetting()` getters, physics (`calcSegmentTime`), color palette, search parser, sort system |
| `js/persistence.js` | IndexedDB (`openDB`, `flushSave`, `load`), save/load manager, import/export, `newSystem()` |
| `js/ui.js` | Toast, modal, `appConfirm`/`appPrompt`, nav (`switchTab`, `refreshAll`), node picker, OGF fetch, `highlightEntity`/`highlightField` |
| `js/entities.js` | Nodes CRUD, station schematic editor, segments CRUD, lines, modes, rolling stock, stock-mode matrix, services CRUD |
| `js/scheduling.js` | Schedule generation (frequency/explicit), recalculation, conflict detection, departure editing, schedule view |
| `js/departures.js` | Departure/arrival board |
| `js/journey.js` | Journey planner (CSA algorithm) + JP map |
| `js/node_ops.js` | Node split & merge (sticky segment groups, per-side platform editing, optional ISI creation, merge chooser/preview, beckmap + station group migration) |
| `js/import.js` | CSV parsing, OGF relation import engine, fuzzy node matching, polyline similarity/overlap detection, divergence point detection, overlap auto-resolution |
| `js/views.js` | Settings panel, issue detection (~35 issue types), geomap (Leaflet + OGF tiles), dashboard, Import/Export tab + CSV/relation import wizards |
| `js/beckmap.js` | Railmap SVG schematic |
| `js/animate.js` | Animated tab — sim clock, geo + schem views, vehicle interaction, busyness heatmap, route highlight |
| `js/palette.js` | Ctrl+K command palette — actions, tab nav, fuzzy entity search across lines/services/stations/nodes/segments |

### Station importance (THI)

**Raw:** `rawTHI = 0.5·log10(1+traffic) + 2.0·lineCount + 1.5·max(0,degree-2) + 3.5·terminus`, pooled per `nodeDisplayName`. **Final:** `THI = rawTHI + spatial`, where the per-pair contribution is `sign(rawA − rawB) × min(rawA, rawB) × (1 − d/R) × THI_SPATIAL_ALPHA` — lateral inhibition scaled to the weaker station's raw, so a tiny station can never lose more than a small absolute amount per neighbor regardless of how strong that neighbor is. A safety floor caps total suppression at `THI_SPATIAL_FLOOR × rawTHI` (25% of raw), so no station drops near zero. Zero-sum per pair under normal conditions. Defaults: `THI_RADIUS_KM = 15`, `THI_SPATIAL_ALPHA = 0.15`, `THI_SPATIAL_FLOOR = 0.25`. Defined in `js/core.js` (`computeTHI`, `thiByDisplayName`, `thiByNodeMap`, `thiForNode`, `thiForDisplayName`); each entry exposes `thi`, `rawThi`, `spatial` (post-floor), `traffic`, `lines`, `degree`, `terminus`. Cached; `bumpTHIVersion()` invalidates. Bumped from `save()`, `load()`, and `loadSlot()` in `js/persistence.js`.

Consumers: Animated tab landmark selection (`js/animate.js`), Geomap label collision (`js/views.js` `placeLabels`), Departure Board "via" rank (`js/departures.js` `jpBoardVia`), Beckmap most-wanted tiebreaker (`js/beckmap.js` sidebar sort), node detail badge (`js/entities.js` `showNodeDetail`).

### Key helper functions

- `getNode(id)`, `getSeg(id)`, `getSvc(id)`, `getGroup(id)`, `getCat(id)`, `getStock(id)` — lookups
- `findSeg(nodeA, nodeB)` — find first traversable segment between two nodes
- `findSegs(nodeA, nodeB)` — find ALL traversable segments (parallel segment support)
- `findSegByTrack(nodeA, nodeB, trackId)` — find the segment containing a specific track
- `segTrackCount(seg)` — backward-safe track count (array or integer)
- `segmentCoords(seg)` / `segmentCoordsDirected(seg, fromNodeId)` — way geometry or straight-line fallback
- `isModeAllowedOnSeg(seg, catId)` — mode whitelist check
- `platDisplayName(name)` — strip "Platform " prefix + "[bracketed]" text
- `connectedNodes(nodeId)` — adjacent nodes via segments
- `nodeDisplayName(id)` — name with trailing `[brackets]` stripped per settings
- `stationGroup(nodeId)` — returns all station node IDs sharing the same display name
- `buildStationGroups()` — returns map of displayName → [nodeId, ...] for all stations
- `contrastText(hexColor)` — returns black/white for readable text on colored bg
- `stripDiacritics(str)` — for accent-insensitive search
- `toTime(minutes)` — format minutes as HH:MM

## Physics

- Default acceleration: 1 m/s² (stock-specific override)
- `calcSegmentTime(distKm, maxSpeedKmh, entrySpeedKmh, exitSpeedKmh, accel)` — accel/cruise/decel phases
- Effective speed = `min(segment maxSpeed, stock maxSpeed)`
- Dwell cascade: stock `defaultDwell` → mode `defaultDwellTime` → 60s fallback
- Pass-through speed handling is context-aware (junction nodes auto-pass-through)

## Roadmap

See `ROADMAP.md` for the full human-readable roadmap. Summary below for quick reference.

### Completed
- **Phases 1–8:** Core app (nodes, segments, modes, lines, services, scheduling, journey planner, settings, issues, geomap, departure boards, station schematics, waypoints, station grouping, rolling stock)
- **Phase 8 — Geomap:** Complete (Leaflet + OGF tiles, Beck-style parallel offsets, label collision, ISI/OSI rendering)
- **Phase 9 — Beckmap v1:** Built and scrapped due to grid-based offset parallelization issues
- **Phase 10 — Modularization, l10n & QoL:** Complete (Split into ~9 JS modules, l10n system, legacy removal, prefix search, column sorting, issue link highlighting)

### Completed (continued)
- **Phase 12 — Beckmap v3:** Complete. Grid + per-line station placement. No shared geometry. No offset math. Each line-station placed independently; routes derived on render. Named station groups, 7 segment styles, bend editing, tick/terminus/blob marks, ISI/OSI connectors, SVG export, OGF geo import, mode-driven styles. See `BECKMAP_POSTMORTEM.md` for why v1/v1.5/v2 failed.
- **Phase 13 — Weekly/Yearly Scheduling:** Complete. `schedulePattern` on services (days + date ranges + excludes). Pattern-aware JP, departure board, and conflict detection.
- **Phase 14 — Buses:** Complete. Road segments (`interchangeType: 'road'`), `bus_stop` node type, `infrastructureType` on modes (rail/road), mode-infrastructure mismatch detection.
- **Phase 15 — Detail View Maps:** Complete. Embedded geomaps + mini beckmap in all entity detail views (node, segment, line, service) and JP. Toggle with default preference setting. Expandable map frames. JP journey simplification (redundant transfer + OSI elimination).
- **Phase 16 — Segment Upgrade:** Complete. OGF way geometry (fetch, stitch, render, auto-trim), named tracks (migration, track list editor, schematic trackId), per-track service routing + conflict detection, parallel segments with allowedModes whitelist, auto-trim with snap-and-slice primitives.
- **Phase 17 — Infrastructure Import:** Complete. Import/Export tab with saves dropdown. CSV node/segment import (headerless column assignment, fuzzy/OGF node matching, dedup review with disambiguation). OGF relation import (Overpass API, way stitching, station snapping, maxspeed waypoints). Suspicious segment + segment overlap detection with auto-fix (junction insertion + service rerouting). Batch way geometry fetching. Reverse service track/platform assignment. Route builder track reassignment.
- **Phase 18 — Animated Map:** Complete. New "Animated" tab with sim clock (live/fast/paused), per-frame deterministic position interpolation along `dep.times[]`, vehicle markers (triangle when moving, circle when dwelling, line color, white outline). Two views toggled in the header: **Geo** (Leaflet, faded segments, top-THI landmarks) and **Schem** (renderSchematic-powered, full editor styling — segment styles, ticks/termini, blobs, ISI/OSI, labels — independent pan/zoom, route highlight on click). Shared controls: HH:MM scrubber with 5-min red→green busyness heatmap (filtered by `simDate`'s schedulePattern, including yesterday-wrap), date picker, 1×/10×/60×/300× speed, ⏸/▶ pause-resume, "Now" snap-to-live, fit-to-bounds. Vehicle interaction: click → popup (service + line + origin→terminus + current state with live ETA + stock + next 5 stops + terminus, refreshed at 4 Hz, follows the marker as it moves) AND highlight of the service's full route on the active view; hover → tooltip (next stop ETA). Junctions/waypoints/pass-throughs are handled by walking `dep.times[]` to surrounding placed stations and interpolating the schem position in time-space across the placed leg. THI was hoisted to a first-class core helper during this phase (formula `0.5·log10(1+traffic) + 2·lines + 1.5·max(0,degree-2) + 3.5·terminus + spatial`, with lateral-inhibition spatial competition); adopted by geomap labels, departure-board "via" rank, beckmap most-wanted tiebreaker, and the new sortable Nodes column. **Deferred** (re-visit later): GIF/WebM export (rendering pipeline was unsatisfying).

### Upcoming
- **Phase 19 — Light Tools & QoL** (sketched: Cmd+K, recent/pinned, network reach, timetable book export, Gantt time viz, bulk-edit, search predicates, legacy cleanup — see ROADMAP.md)
- **Phase 20 — Undo/Redo**
- **Phase 21 — Time & Operators** (historical dates, closed stations, Marey diagram, operators + ticketing)
- **DLC — Disruptions** (always last)

#### Beckmap v3 Session Plan
| Session | Scope | Status |
|---|---|---|
| 0. Foundation | Strip v1.5 offset code, per-line route storage + rendering, migration | ✅ Done (v0.12.0.0) |
| 1. Per-line stations | Per-line station placement, sidebar per-line entries, derived routes | ✅ Done (v0.12.2.0) |
| 2. Bend editing | Segment selection, bend points, segment/line styles, context menus | ✅ Done (v0.12.4.0) |
| 3. Marks + Labels | Tick/terminus marks, ISI/OSI connectors, label auto-positioning, station context menu | ✅ Done (v0.12.5.0+) |
| 4. Complex Topology | Circular lines, dense hubs, branches, crossings, rectangle blob detection, named station groups | ✅ Done (v0.12.8.0) |
| 5. Polish | Mode-driven styles, SVG export, performance cache, debug overlay, OGF geo import | ✅ Done (v0.12.9.0) |

**History:** v1 (grid + shared segments + pixel offsets, scrapped), v2 (gridless per-line, abandoned), v1.5 (v1 rebuilt with global layout precompute, abandoned). All three failed because shared geometry + offset math cannot cleanly handle corridor transitions. v3 eliminates shared geometry entirely.

## Beckmap v3 — Architecture

### Historical context
**v1 (scrapped):** Grid (24px), shared segments, pixel-space offset rendering. Cascading bugs: tucking, peeling, asymmetric corridors.

**v2 (abandoned):** Gridless, per-line polylines. Too hard to use without grid snapping.

**v1.5 (abandoned):** Same as v1 but with global layout precompute. Same bugs returned — the architecture itself is the problem.

**v3 (current):** Grid (10px) + per-line station placement. Each line-station is placed independently. Routes derived by connecting consecutive placed stops. No shared geometry, no offset math, no station anchors.

### The v3 approach
**Per-line station placement, derived routes, no shared geometry.**

- **10px grid:** `SCHEM_CELL = 10`. Each line-station placed at integer grid cell indices.
- **Per-line stations:** `data.beckmap.lineStations[groupId][nodeId] = {gx, gy}`. Each line places its own station cell independently. Parallelism = place on adjacent cells.
- **Derived routes:** `schemDeriveRoute(groupId)` connects consecutive placed stops via diagonal-first 45° routing. No stored routes — computed on render.
- **No `node.mapX/mapY`:** The beckmap does not use station anchor positions. Each line-station is its own placement.
- **Interchange marks:** Named station groups (`data.beckmap.stationGroups`) with 2+ placed members get interchange blobs. Rectangle detection for 4-corner groups. Pinched blobs between non-adjacent nodes. ISI/OSI-connected stations auto-blob.
- **Station marks:** Tick (perpendicular bar, through-stations), terminus (T-bar, line ends), blob (white circle, interchanges/overrides). Corner ticks shift off bend points.
- **Segment styles:** 7 styles: full, punched, dashed, double (two-pass z-aware), dotted (square blocks), arrows (directional chevrons), hidden.
- **Sidebar:** Multi-select line filter (collapsible checkboxes). "Suggested" top-5 section. Per-line station sections. Context menus for segments, lines, stations, ISI/OSI connectors.
- **Labels:** 8-direction auto-positioning with perpendicular preference, route/label/station collision detection, word-wrap (auto/single/split with hyphen support), per-display-name overrides in groups.

### Beckmap data model

Data structure: `data.beckmap` contains:
- `version` — migration version marker (3 for v3)
- `lineStations` — `{ [groupId]: { [nodeId]: {gx, gy} } }` — per-line station placements
- `infraStations` — `{ [nodeId]: {gx, gy} }` — unplaced/infrastructure station placements (not assigned to any line)
- `routeBends` — `{ [groupId]: { [edgeKey]: [{gx,gy},...] } }` — bend point overrides per edge
- `segmentStyles` — `{ [groupId]: { [edgeKey]: style } }` — per-segment style overrides (`full|punched|dashed|double|dotted|arrows|hidden`)
- `lineStyles` — `{ [groupId]: style }` — per-line default style
- `linePriority` — `{ [groupId]: number }` — render z-order per line (higher = on top)
- `segmentPriority` — `{ [groupId]: { [edgeKey]: number } }` — render z-order per segment
- `stationGroups` — `{ [sgId]: { name, members: [lsKey,...] } }` — named station groups for interchange blobs
- `labelOverrides` — `{ [key]: direction }` — label direction overrides (8 directions, 'auto', or 'none')
- `labelWrap` — `{ [key]: 'auto'|'single'|'split' }` — label word-wrap mode
- `markOverrides` — `{ [lsKey]: 'blob' }` — force tick stations to render as blobs

### Key Beckmap functions (current)

- `schemMigrateData()` — migration from v1.5/v2, initializes all v3 data structures
- `schemGridToPixel(gx, gy)` — grid cell indices → pixel coordinates
- `schemGridSnap(wx, wy)` — screen pixels → snapped grid cell + pixel position
- `schemRouteLeg(fromGx, fromGy, toGx, toGy)` — 45° diagonal-first routing, returns `[{gx,gy},...]`
- `schemRouteWithBends(from, to, bends)` — route through optional bend points
- `schemSmoothPath(cells, r)` — convert cell route to SVG path with bezier-curved corners
- `schemDeriveRoutes(groupId)` — derive all edge routes for a line (deduped, bend-aware)
- `schemCollectEdges(groupId)` — collect unique station-pair edges from services
- `schemFindInterchanges()` — read named station groups, return groups with 2+ placed members
- `schemAutoGenerateGroups()` — auto-create groups from same-nodeId, same-name, ISI/OSI rules
- `schemAutoJoinGroup(gid, nid)` — auto-join matching group on station placement
- `schemBuildMarkCache()` — pre-compute tick/terminus/interchange marks for all line-stations
- `schemFindISIOSI()` — find visible ISI/OSI connectors (not grouped, not hidden)
- `schemFindRectSubset(cells)` — detect 4-corner rectangles (axis-aligned or 45°-rotated) for blob shapes
- `schemGetStyle(groupId, edgeKey)` — resolve style cascade: segment → line → mode default → 'full'
- `renderSchematic()` — SVG render with performance cache, z-ordered routes, two-pass double-struck, marks, labels, blobs, ISI/OSI, bend editing
- `renderSchemSidebar()` — multi-select line filter, suggested stations, per-line sections, context menus (segment/line/station/ISI-OSI)
- `schemExportSVG()` — export standalone SVG with embedded font
- `schemImportOGF()` — import station positions from OGF geo coordinates

## Development conventions

- **One feature per session** to avoid scope creep. Sessions end with testable deliverables.
- **Edit files in place** using targeted edits. The app is now multi-file (Phase 10+).
- **Validate JS syntax** with Node.js `new Function()` before presenting.
- **Update version number** in both the sidebar footer and VERSION_HISTORY.md.
- **Present the file for download** after completing changes — don't forget this step.
- **Explicit feedback loops** between sessions. Wib tests immediately with specific feedback.
- **Design before build** for complex features. Flag scope as "too big for a patch" when appropriate.
- **No legacy migration code** beyond what already exists — beta data won't be used by actual users.
- **Prep data model fields early** (like `schedulePattern`, `beckmap.guides`, `beckmap.lineOrder`) to avoid future migrations.
- **Test data:** Wib uses a large dataset for stress testing. It is not the Hemstein sample dataset.

## Style reference

- **App UI:** Dark theme, NS (Dutch Railways) inspired
- **Beckmap:** White background, London Tube map style. Reference: tennessine.co.uk
- **Fonts:** DM Sans (body), Fraunces (display headings), JetBrains Mono (data/tables), Hammersmith One (Beckmap labels)
- **Line colors:** From `COLOR_PALETTE` array, auto-suggested to minimize reuse

## Glossary

### Network concepts

- **Node:** Any point in the network. Has a type: station, junction, waypoint, depot, or freight yard. Junctions are branching points with no public stop. Waypoints are invisible routing helpers (for passing loops, speed changes, etc.). Depots and freight yards are non-passenger facilities.
- **Segment:** A direct connection between two nodes. Has distance, max speed, track count, and electrification. Never connects more than two nodes — use waypoints to break longer stretches. Can also be an interchange segment (ISI/OSI).
- **ISI (In-Station Interchange):** A walking connection between two stations within the same physical station complex (e.g., two platforms in one building). Shows as a checkerboard pattern on the Geomap.
- **OSI (Out-of-Station Interchange):** A walking connection between two nearby but separate stations (e.g., across a street). Also shows as a checkerboard pattern.
- **Station group:** A set of stations that share the same display name (after stripping trailing `[bracketed]` suffixes). For example, "Green Park [Piccadilly Line]" and "Green Park [Victoria Line]" both display as "Green Park" and are grouped together. The journey planner treats grouped stations as interchangeable origin/destination options. Built by `buildStationGroups()` using `nodeDisplayName()`. This is distinct from ISI/OSI — Bank and Monument are linked by an OSI segment but are *not* a station group (different names).
- **Platform:** A named stopping position within a station (e.g., "Platform 1", "Track 3a"). Defined on the node. Services and departures can be assigned to specific platforms.

### Operations concepts

- **Mode (internally "category"):** A classification of rail service (e.g., Intercity, Regional, Metro). Each mode has default dwell time and platform clearance. Stored as `categories[]` in the data model but shown as "Modes" in the UI.
- **Line (internally "service group"):** A named, colored grouping of services that share a corridor (e.g., "Northern Line", "IC 200"). Stored as `serviceGroups[]` with a `color` property. Defines the line color everywhere: maps, chips, schedule views.
- **Service:** A specific route pattern — an ordered list of stops (nodes) with optional platform assignments and pass-through flags. Multiple services can belong to one line. A service like "IC 200 Amsterdam–Rotterdam" defines the stopping pattern.
- **Departure:** A single instance of a service at a specific start time. Contains computed arrival/departure times at each stop. Can have manual overrides for dwell times, platform assignments, and rolling stock.
- **Schedule pattern:** How often a departure runs (daily, weekly, yearly). Stored on departures as `schedulePattern`, prepped for Phase 12 but currently always "daily".
- **Pass-through:** A flag on a service stop indicating the train passes without stopping. Affects physics (no deceleration/acceleration penalty) and display (no dwell time, no platform needed).
- **Dwell time:** How long a train waits at a station. Cascades: departure manual override → stock default → mode default → 60s fallback.
- **Rolling stock:** A type of train with specific max speed, acceleration, traction type, and default dwell. Services and departures can reference stock for accurate physics.
- **Stock-mode matrix:** Defines compatibility between rolling stock and modes. Values: normal, atypical (surfaced inline as info), disallowed (raises an issue).

### Beckmap concepts

- **Beckmap:** The schematic railway map module, named after Harry Beck (designer of the London Tube map). Uses stylized geometry rather than geographic accuracy.
- **Placed / Unplaced:** A station is "placed" when it has mapX/mapY coordinates on the Beckmap canvas. Unplaced stations appear in the sidebar for dragging onto the canvas.
- **Most-wanted score:** The sidebar ranks unplaced stations by how many visual edges would become drawable if that station were placed next. Higher score = more useful to place.
- **Edge:** A visual connection between two placed stations on the Beckmap. Resolves through waypoints transparently — if A connects to B via waypoint W, the edge shows A→B directly.
- **Grid (Beckmap):** 24px cell grid for station placement and routing. Stations placed at integer cell indices (`mapX`/`mapY`). Enables alignment snapping and consistent routing.
- **Corridor:** An area where multiple lines run parallel between the same stations. In v1.5, corridors share the same geometric path; each line is rendered with a perpendicular pixel offset to fan them out visually.
- **Offset rendering:** The technique of rendering multiple lines through a shared corridor by offsetting each line perpendicularly from the corridor centreline. Creates the characteristic "fanned" appearance of parallel routes.
- **Mark type:** How a station renders on the Beckmap. Circle = interchange (multiple lines diverge). Tick = through station (single line or all lines continue together). Terminus = end of line.

### Map & rendering concepts

- **Geomap:** The geographically accurate Leaflet map using OGF tile data. Shows stations, segments, and line-colored routes with Beck-style parallel offsets.
- **OGF (OpenGeofiction):** A collaborative fictional world-building project. BRIXYmanager uses OGF's Overpass API for coordinate fetching and OGF tile servers for map backgrounds.
- **World coordinates:** The Beckmap's internal coordinate system (pixel floats). Origin at (0, 0). Stations store positions as `mapX`/`mapY` in world coordinates.
- **Screen coordinates:** Pixel positions on the actual SVG canvas, after applying pan (viewX/viewY) and zoom. Converted by `schemWorldToScreen()`.

### Scheduling & journey planner concepts

- **CSA (Connection Scan Algorithm):** The journey planner algorithm. Does a single linear scan of all departures sorted by time. O(C) complexity per query where C = number of connections.
- **Transfer time:** Minimum 5 minutes between connections. Same-platform transfers are exempt from this minimum.
- **Platform clearance:** Minimum time between two trains using the same platform. Per-mode configurable. Raises a "Platform Conflict" issue if violated.
- **Conflict detection:** Checks for single-track segment overlaps and platform clearance violations. Used both in issue detection and during schedule generation.

### Operations terminology (our workflow)

- **Session:** A focused development sprint targeting one feature area (e.g., "Session 2: Scaffold"). Produces a `.0` version bump. Sessions have clear deliverables and are tested before moving on.
- **Patch:** A smaller fix or refinement within a session (e.g., "widen snap beams"). Bumps the last digit (`.1`, `.2`, etc.). Patches respond to testing feedback.
- **Phase:** A major feature area in the roadmap (e.g., "Phase 10: Modularization"). Contains multiple sessions. Bumps the second digit.
- **Release:** A milestone version (the first digit). Currently `0` (pre-release).
- **Strip:** Removing obsolete code to prepare for a rebuild (what Session 1 did to the Beckmap).
- **Scaffold:** Building the foundational structure for new features before implementing the features themselves.

