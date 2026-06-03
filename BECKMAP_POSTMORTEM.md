# Beckmap v1.5: A Rebuild Guide

**Status:** v1 was abandoned because its grid-plus-shared-segment-with-pixel-offsets architecture accumulated whack-a-mole bugs. v2 (gridless, per-line polylines) was scaffolded through Session 2 then abandoned because confidence was lost before its hardest problem (parallel routing UX) was prototyped.

**v1.5 is a clean-slate rebuild of v1's architecture** — same grid, same shared-segment model, same pixel-offset rendering — but informed by everything the first attempt taught us. The hypothesis is that v1's failures came from incremental discovery: bugs were found one at a time during testing and patched in isolation, with no overall theory of how the offset system should behave. Building it again from scratch, with the full bug catalogue in hand, may produce a coherent design where v1's accreted patches did not.

**If v1.5 also fails, v3 follows.** v3 is unspecified and may be y2-style (gridless per-line), y3-style (grid plus per-line), or something else. v1.5 is the last attempt at the original architecture before pivoting away from it.

**Purpose of this document:** equip the v1.5 rebuild with the v1 bug catalogue, the design goals that produced those bugs, the fixes that were tried, and the architectural questions v1 never explicitly answered. Read this before designing Session 1.

---

## 1. The Goal (unchanged across all attempts)

A highly customisable Beck-style schematic map editor that pulls topology from the scheduling app's data model (nodes, segments, services, lines/serviceGroups). The output should resemble the London Tube map: stations placed on a grid, lines following 45°-constrained paths, parallel lines fanned out where they share corridors, blob/tick/terminus station marks, clean labels, SVG export.

The non-negotiable visual feature — the one that has caused every single piece of pain — is **parallel lines through shared corridors**. Without it, this would have shipped months ago.

---

## 2. v1's Architecture (the thing v1.5 rebuilds)

**Data model:**
- Stations placed at integer grid coordinates (`mapX`, `mapY` as cell indices)
- 24px grid (`SCHEM_CELL`)
- Segments shared between lines — one geometric path per segment, multiple lines rendered on top via pixel offsets
- `mapGuides` on segments for custom routing bend points
- `mapLineOrder` on segments for per-segment line ordering

**Rendering pipeline:**
1. `schemBuildEdges()` walked through waypoints to merge multi-segment runs into single visual edges between stations
2. `schemComputeRoute()` / `schemRouteLeg()` produced grid-snapped 45° paths (diagonal-first, then orthogonal)
3. `schemOffsetPath()` took the resulting polyline and offset it perpendicularly for each parallel line
4. Cross-edge corridor detection (`stepLines` map) tried to identify when adjacent edges shared the same physical corridor so offsets stayed consistent
5. Carry-forward logic propagated offsets across edge boundaries when corridors were collinear and the connecting node was not a "blob"
6. `nodePixelOffsets` shifted tick/terminus stations away from centre to align with their offset line

**v1.5 will rebuild this same pipeline.** The decisions to question are *how* each step works, not whether each step exists.

---

## 3. The Recurring Bugs of v1 (the whack-a-mole list)

These are the bugs that came back over and over. **None of them were ever simultaneously solved.** Fixing one would surface or reintroduce another. Each entry below describes the symptom, the root cause, the fixes that were tried, and what v1.5 should consider differently.

### 3.1 Direction-dependent offset flipping ("tucking")

**Symptom:** Two lines sharing a corridor would render correctly when both edges traversed in the same canonical direction, but when one edge was traversed "backwards," its offsets would land on the wrong physical side, causing the lines to swap and weave through each other.

**Root cause:** `schemOffsetPath` computed perpendicular normals from the edge's actual traversal direction (`(dy, -dx)`). Two edges going opposite directions through the same cells got opposite normals. No amount of offset sign manipulation reliably handled all configurations.

**Things that were tried and didn't fully work:**
- **Canonical normalization:** force all directions to a "canonical" form (e.g. always rightward for horizontals). Broke at left turns where the canonical normal pointed the wrong way relative to the actual path's turn direction.
- **Normal flipping (`normalsAgree`):** check whether the edge's actual normal agrees with a canonical normal, flip the offset if not. Worked for some configurations, broke peeling.
- **Reverse sort order for non-canonical edges:** instead of negating offset values, mirror the position indices. Worked for the simple cases verified mathematically, still broke 2+1 corridors after a peel.

**For v1.5 to consider:** the tucking bug exists because "which side of the line is line N on" is computed locally per edge, but needs to be globally consistent across the corridor. A possible v1.5 approach: compute side-of-line *globally* before any rendering happens, store it as a property of the (line, corridor) pair, then render each edge by looking up the precomputed side. The renderer never asks "which way is this edge facing." It only asks "which side of this corridor is this line on, globally."

### 3.2 The peeling problem (THE killer)

**Symptom:** A 3-line straight corridor (red, green, blue) renders correctly. Red and green peel off at a station; blue continues straight. The continuing blue line resets to the centre instead of staying on its 3-line offset position. In some configurations, the remaining 2-line section weaves as the offsets recompute.

**Root cause:** Offsets are *indexed* — line `n` of `m` lines gets offset `(n - (m-1)/2) * lineSW`. When the line count changes mid-corridor, the indices renormalise. Blue at index 2 of 3 has a different offset than blue at index 0 of 1.

**Things that were tried and didn't fully work:**
- **Section grouping:** group consecutive cell-steps with the same set of lines into "sections," compute offsets per section, then stitch sections together with `schemLineIntersect` at the boundaries.
- **Cross-edge carry-forward:** when an edge starts where the previous edge ended and is collinear, inherit the previous edge's offset for the first section. Did *not* carry across "blobs" (interchange stations).
- **Within-edge carry-forward:** when transitioning between sections within the same edge, if the corridors are collinear and the previous offset was nonzero, inherit it.
- **Removing the `Math.abs(offset) < 0.01` guard** from carry-forward — `0.0` is a meaningful position (the centre line of a 3-corridor) and skipping it caused recentering.

**Status at strip:** still broken. Carry-forward bled into sections it shouldn't, and didn't propagate when it should. The fundamental problem: there is no clean rule for "should this offset carry?" — it depends on the *set* of lines in adjacent sections, not just collinearity.

**For v1.5 to consider:** v1's offset model was *symmetric* (lines are spread symmetrically around the corridor centreline). This is what caused the renormalisation: when one line peels off, the centreline of the remaining lines shifts, so all remaining lines visibly shift too. A possible v1.5 approach: use **anchored offsets** instead of symmetric ones. Pick a side of the corridor (say, "always left of the canonical direction") and stack lines outward from that anchor. When a line peels off, the remaining lines don't move — their positions were never relative to the corridor centre, only to the anchor. The downside: corridors are no longer visually centred on their geometric path. Whether this matters aesthetically is a question for Wib.

Alternatively, do the corridor-aware analysis once, *globally*, before rendering. Determine for each line and each cell-step, "what is this line's offset slot here?" — and require it to be stable across cell-steps wherever the line is present. Peeling happens when the *other* lines stop being there, not when this line's slot changes.

### 3.3 Three-way and asymmetric corridors (2+1, 3+1)

**Symptom:** A corridor where one edge has 2 lines and an adjacent edge has 1 line (which is one of the 2). The 1-line section should align with that line's position in the 2-line section, but doesn't.

**Root cause:** Same as 3.2. The single-line edge defaults to offset 0 (centre), but the matching line in the 2-line edge is offset by ±lineSW/2.

**For v1.5 to consider:** same as 3.2. If offsets are anchored or globally precomputed, the single-line section knows its line should still be at "slot 1 of 2" because that's its position in the corridor, even though the corridor only has one line *in this section*.

### 3.4 Junction blockiness

**Symptom:** At a Y-shaped fork (a junction node where one corridor splits into two), the offsets converging from different angles produced visual blocks/gaps rather than a clean fork.

**Root cause:** Junctions terminate edges in `schemBuildEdges`. Each edge's offset calculation runs independently, and there's no mechanism to make offsets meet smoothly at the fork point.

**For v1.5 to consider:** junctions need to be transparent to corridor walking, the same way waypoints are. A line passing through a junction should treat it as a routing waypoint, not an edge endpoint. This is a behaviour change in `schemBuildEdges` and was earmarked but never built in v1.

### 3.5 Section transition geometry at bends

**Symptom:** At corridor boundaries that coincided with bends in the route, the section endpoints didn't connect cleanly — gaps, miters going the wrong way, or lines visibly missing the meeting point.

**Root cause:** `schemLineIntersect` (used for collinear-section intersections) returns null for parallel lines, and the bend-with-section-change case needed both the intersection math AND the bend's actual direction change.

**For v1.5 to consider:** the intersection math was layered on top of section grouping as an afterthought. v1.5 should design the section→section transition geometry as a first-class concept up front, with explicit handling for: (a) collinear sections (just continue), (b) sections meeting at a bend (miter), (c) sections with different line counts meeting (one of the harder cases), and (d) sections meeting at a junction or blob (reset, no continuation).

### 3.6 `mapLineOrder` not feeding into rendering

**Symptom:** The per-segment line ordering UI (swap arrows in the edge panel) updated the data, but didn't actually change rendering — only the tick rendering on `schemDrawNode` read it.

**Root cause:** `getCellStepInfo` sorted lines by global alphabetical `lineOrder`. The per-segment override was only consulted by the station mark renderer, not the offset corridor calculation.

**For v1.5 to consider:** decide up front whether line ordering is global, per-corridor, or per-segment. v1 wanted per-segment but built it inconsistently. A coherent answer is needed before any UI is built — and the rendering code needs to respect that single source of truth.

### 3.7 Mark rendering with offsets

**Symptom:** Multi-coloured ticks for stations on parallel-line corridors initially rendered offset *along* the line direction (each tick at a different position along the line) instead of *perpendicular* to it (all ticks at the same point along the line, each in their own line's colour, on the appropriate parallel offset).

**Root cause:** Confusion between the perpendicular axis (where parallel lines sit) and the parallel axis (along the line of travel). Eventually fixed, but the fix coupled tick rendering to the same offset calculation that was buggy elsewhere.

**For v1.5 to consider:** ticks need to know each line's offset position at the station to draw correctly. This means the offset system must be queryable from outside the renderer — given (line, station), return the line's pixel offset at that station. v1 didn't have this as a clean interface; it computed offsets inline during rendering and shared the results via `nodePixelOffsets` as a side effect. v1.5 should expose offsets as a function, not a side effect.

### 3.8 Station position shifting for ticks/termini

**Symptom:** A tick station's position needs to shift away from centre so the tick lands on its actual line, not on the corridor centreline. This worked for some cases but depended entirely on the carry-forward fixes — when carry-forward was wrong, the station shifted by the wrong amount.

**Root cause:** `nodePixelOffsets` averages all line offsets at a cell, which is correct only when the carry-forward is correct.

**For v1.5 to consider:** if 3.2 (peeling/carry-forward) is solved cleanly, this falls out for free. The deeper question: should the station mark sit on the corridor centreline (and the ticks reach out to each line), or should it sit at one specific line's position (and the other lines pass beside it)? v1 chose the former for blobs and the latter for ticks — that asymmetry needs to be intentional in v1.5.

---

## 4. The "Why It All Compounded" Pattern

Every fix in v1 had to satisfy this matrix:

| Configuration | Same direction | Opposite direction |
|---|---|---|
| Equal width corridor (2+2, 3+3) | usually OK | tucking risk |
| Asymmetric corridor (2+1, 3+1) | carry-forward needed | both problems compound |
| Peel (3 → 2) | carry-forward needed | same |
| Bend with section change | intersection geometry | both problems compound |
| Junction | blocky at fork | both problems compound |

A fix that addressed cell (1,1) might break (2,1). A fix for (2,2) might re-break (1,1). The matrix was never fully green at the same time.

The reason: **all the failure modes are topological, not geometric.** They're about how the *set* of lines through a corridor changes from edge to edge, and how the offset *index* of a given line should be preserved across those changes. v1 tried to solve this with local geometric reasoning at each cell-step. The geometry kept fighting back.

**v1.5's central design challenge:** find a way to make the topology explicit *before* rendering happens. Walk the entire corridor graph once, decide each line's offset slot at each cell-step, store it, then render each edge by looking up the precomputed slots. The renderer becomes a dumb consumer of an already-solved layout problem. v1's renderer was trying to *solve* the layout problem one cell at a time, and there was always a context it didn't have.

This is the most important architectural shift v1.5 should consider. v1 conflated "layout" and "rendering." v1.5 should separate them.

---

## 5. What v2 Discovered (relevant to v1.5 even though v1.5 isn't v2)

v2 was a different architecture (gridless, per-line polylines), but the *insight* that drove v2 is still valid and v1.5 should be aware of it: **the failure modes in §3 are caused by lines sharing geometry.** Multiple lines pointing at the same polyline and asking it "where am I drawn?" creates the topology problems v1 hit.

v2 solved this by giving each line its own geometry (no sharing). v1.5 keeps shared geometry but needs another way to make multi-line rendering coherent. The §4 suggestion — decouple layout from rendering, solve layout globally before drawing anything — is one way. There are others:

- **Phantom per-line polylines.** Segments are still shared in the data model, but at render time, generate a per-line polyline by offsetting the shared segment's path. Each line then "owns" its own rendered polyline for the duration of the render pass. This is essentially what v1 did inline; doing it as a clean precomputation phase might make it tractable.
- **Global corridor pass.** Walk the whole graph once, identify every corridor (a maximal sequence of cells where the same set of lines runs in the same direction), assign offset slots to each line within each corridor, and propagate slots across corridor boundaries by line identity (not by position index). Render each cell-step by looking up its corridor and asking each line for its slot.
- **Anchored, not symmetric, offsets.** As mentioned in §3.2 — pick a side and stack outward, so peeling doesn't shift remaining lines.

These aren't mutually exclusive. A v1.5 design might combine all three.

What v2 did *not* discover, and what v1.5 still has to figure out, is: how do the user-facing interactions (drag a station, drag a guide point, swap line order) work in a world where layout is precomputed? Every interaction invalidates the layout and triggers a recompute. That's fine if the recompute is fast and coherent. v1's recomputes weren't coherent because layout was never a thing in the first place — bugs accumulated invisibly across edits.

---

## 6. What's Currently in the File

The project file is at `railmanager (75).html`, which is the v1 baseline (the version before the v0.9.1.0 strip). v1.5 starts here.

**v1 code currently present:**
- `SCHEM_CELL = 24` constant
- `_schemState`: viewX/viewY/zoom, dragging, nodeDrag, sidebarDrag, ghostPos, guideDrag, guideEditMode, selectedEdgeIdx, lastEdges
- `schemGridToPixel()`, `schemCellOccupied()`
- `schemBuildEdges()` — walks through waypoints to merge multi-segment runs
- `schemEdgeLineColors()`, `schemEdgeLines()`, `schemNodeLines()` — topology queries
- `schemStationMark()` — returns 'circle', 'tick', or 'terminus' based on placed visual neighbours and which lines diverge
- `schemComputeRoute()` / `schemRouteLeg()` — grid-based 45° routing, diagonal-first
- `schemLineIntersect()` — infinite line intersection helper for offset miters
- `schemOffsetPath()` — pixel-space parallel offset with miter handling
- `schemPointToSegDist()` — distance from point to line segment
- `renderSchematic()` — the giant render function with all the corridor/section/carry-forward logic
- `schemDrawNode()` — complex with tick/terminus/circle marks, multi-coloured ticks at parallel offsets, label placement
- `renderSchemEdgePanel()` — edge panel with line ordering swap UI and guide editing toggle
- `schemSwapLineOrder()` — per-segment `mapLineOrder` manipulation
- Guide drag pointer event handlers (promote, right-click remove, keyboard E toggle)
- Drag-from-sidebar, drag-to-sidebar removal

**v1.5's options for handling this code:**
- **Strip first, rebuild.** Start with the v0.9.1.0 strip state (the "Beckmap v2 Session 1" baseline that gutted ~1,136 lines of grid+offset engine) and rebuild from scratch with the new design. Downside: throws away working scaffolding.
- **Refactor in place.** Keep the existing code, identify which functions need to be replaced and which can stay, and rewrite incrementally. Downside: risk of leaving v1's bad assumptions in unrefactored code.
- **Parallel rebuild.** Build v1.5's new layout-and-render functions alongside v1's existing ones, switch over at the end. Downside: temporary code bloat.

Wib's call which to pursue. The middle option is probably most pragmatic, but it requires discipline about what counts as "v1 code we're keeping" vs "v1 code that's tainted by the bug context."

---

## 7. Decisions Made Along The Way (don't relitigate)

These were settled in earlier sessions and should not be reopened in v1.5 unless there's a strong reason:

1. **Junctions are invisible by default,** appearing only on hover or when one of their connected segments is selected.
2. **Waypoints are completely invisible** on the railmap. They exist for routing but contribute nothing visually except to merge multi-segment runs.
3. **Multi-line termini default to a blob** (interchange endpoint), not a multi-coloured T-bar.
4. **Multi-coloured ticks at one station** are at the *same point along the line*, each drawn from its own parallel-offset position outward. Not stacked, not side-by-side along the line direction.
5. **Tick orientation** follows the perpendicular of the edge direction at the station. For 135° corner stations, the tick aligns with the orthogonal edge.
6. **Segment data must not be polluted** with railmap-only fields. v1 broke this rule (`mapGuides`, `mapLineOrder` were stored on segments). This was tolerable but ugly. v1.5 can either preserve it for migration ease or move railmap data to `data.beckmap` — it's a judgement call now that v2 has shown the cleaner namespace works.
7. **The scheduling app's data model is sacred.** The railmap reads from it but never writes to it.
8. **"Schematic" is reserved** for the station platform editor; map features use "Geomap" / "Railmap".
9. **Hammersmith One** is the chosen font (loaded from Google Fonts). Tube-map style: white background, dark text (`#003082`), bold labels.
10. **Mode line styles:** solid, dashed, dotted, punched, double — driven by the line's mode (category). Polish, not core.
11. **Each session ends with a testable deliverable.** Smaller sessions = catch issues before they compound. This was the response to v1's whack-a-mole pattern and it should hold for v1.5.
12. **Junctions should behave like waypoints for corridor purposes** so lines can pass through them without breaking corridor continuity. v1 earmarked this and never built it. v1.5 should commit to building it from the start.

---

## 8. Recommendations for v1.5

These are the lessons cashed in. Strong recommendations from the v1 experience, not commandments — v1.5 should consider each one explicitly during Session 1 design and either adopt it or knowingly reject it.

1. **Separate layout from rendering.** v1's renderer tried to compute parallel-line positions one cell-step at a time using local geometric reasoning. This was the source of nearly every bug. v1.5 should run a layout pass first that produces a complete `(line, cell-step) → pixel offset` map, and then render by looking up that map. Bugs become reproducible because the layout is inspectable as data.

2. **Prototype the hardest case in Session 1 or 2, not Session 5.** v1's parallel-line rendering was built late in the v1 session sequence, on top of a lot of foundation that turned out to be wrong. v1.5 should build a minimal end-to-end test of "two lines that share a corridor and then peel apart" as the first or second deliverable. If it doesn't work, the design is wrong and we need to know before building stations and labels and modals on top of it.

3. **Decide global vs local offset reasoning up front.** This is the biggest open question for v1.5. v1 was implicitly local (compute as you render). The recommendation is to go global (precompute the layout map). Whichever you pick, pick it explicitly in Session 1, not by accident in Session 5.

4. **Decide symmetric vs anchored offsets up front.** v1 was symmetric (lines spread around a centreline). This is what caused the renormalisation bug in §3.2. Anchored offsets (lines stack from one side of the corridor) avoid that bug at the cost of corridors not being visually centred. There's also a third option: **identity-stable offsets** — each line's slot in a corridor is determined by some stable property of the line (its name, its index in `data.serviceGroups`, its colour) rather than by counting how many other lines are present. This way two lines will always be in the same slot regardless of who else is in the corridor.

5. **Make junctions corridor-transparent from the start.** v1 left this for later and it caused the junction blockiness bug. `schemBuildEdges` should walk through junctions the way it walks through waypoints. Build it in Session 1.

6. **Validate angles on save, not during edit.** Free dragging during edit, snap-to-grid on commit, validation as a separate pass. This was in v1 and worked.

7. **Don't let station marks share state with the corridor renderer.** v1's tick rendering depended on `nodePixelOffsets` which depended on the corridor offset calculation which was buggy. Station marks should *consume* a clean layout API (give me line L's offset at station S), not share intermediate state with the renderer. If you separate layout from rendering as recommended in (1), this falls out naturally — station marks query the layout map, same as the renderer.

8. **Write the failure-mode test dataset before writing the renderer.** A tiny test dataset that contains:
   - A 3-line corridor that peels to 2
   - A 2+1 join (one edge has 2 lines, an adjacent edge has 1 of them)
   - A Y-junction with parallel inputs
   - An L-bend with a multi-line corridor
   - A station served by lines with different terminus behaviour
   - A corridor where one edge is traversed backwards relative to its neighbour (to catch the tucking bug)

   If the v1.5 renderer doesn't handle all six, it isn't ready for the real dataset. v1's bugs were found by Wib during testing rather than caught up front, and the iteration cost of finding them serially was enormous.

9. **Add a debug overlay in Session 1.** v1 had no way to visualise the geometry primitives (cells, line directions, intersection points, computed offset slots). Bugs were diagnosed by squinting at screenshots. v1.5 should have a debug toggle from day one that shows: cell boundaries, line ID labels at each cell, computed offset slot for each line at each cell, bend points, station positions, corridor boundaries. If the layout pass produces an inspectable data structure (per recommendation 1), the debug overlay is just a renderer for that data structure.

10. **The test dataset is not Hemstein.** Wib is building a new large dataset. v1.5 should be tested against both the failure-mode dataset (small, surgical) and the new large dataset (stress test). Don't only test on the new big one — its failures will be hard to attribute to specific bugs.

11. **Be willing to fail fast.** v1.5 is a retry, not a forced success. If after Sessions 1 and 2 (the parallel-routing prototype and the layout pass) it's clear that the same bugs are coming back, that's the signal to stop and pivot to v3 — not to push on through Sessions 3–8 hoping it'll work out. The test dataset from recommendation 8 is the falsification criterion: if the prototype doesn't pass it cleanly, the architecture is wrong.

---

## 9. Things That Worked in v1 and Should Be Kept

Don't throw these out in v1.5:

- **`schemBuildEdges`** — the waypoint-walking logic is correct and well-tested. Extend it to walk junctions too.
- **`schemStationMark`** — the blob/tick/terminus detection logic (placed visual neighbours, line divergence per neighbour) is sound. Multi-line terminus → blob is a good default.
- **`schemEdgeLines` / `schemNodeLines`** — clean topology queries.
- **`schemComputeRoute` / `schemRouteLeg`** — the 45° diagonal-first routing logic.
- **`schemPointToSegDist`** — utility, no problems.
- **The session structure** (1. Strip, 2. Scaffold, 3. Single-line routing, 4. Bend editing, 5. Parallel routing, 6. Complex stations, 7. Labels, 8. Polish) — but with parallel routing prototyped early as a probe (recommendation 2).
- **The sidebar** — search, filter, most-wanted scoring, drag-from-sidebar, drag-to-sidebar removal. All kept.
- **Pan/zoom and SVG canvas chrome** — never been a problem.
- **Hammersmith One font and the visual style decisions.**
- **Persistent state in `_schemState`** — fine as a single state object.
- **Per-segment line ordering UI** (the swap arrows) — the UI was good, the bug was that the data didn't feed into rendering. Keep the UI, fix the data flow.
- **Guide point editing UX** (drag to reshape, E to toggle, right-click to remove) — kept working in v1, can be ported.

---

## 10. Open Questions for v1.5 Kickoff

These should be answered (or explicitly deferred) in Session 1's design discussion before any code is written:

1. **Global vs local layout?** Recommendation is global (see §4 and §8.1). Confirm or reject.

2. **Symmetric vs anchored vs identity-stable offsets?** Recommendation is identity-stable (see §8.4). Confirm or reject.

3. **What is a "corridor" formally?** v1 used cell-step decomposition with `stepLines` as the closest thing to a corridor concept. v1.5 needs an explicit definition: a corridor is *what*, exactly? A maximal sequence of cell-steps where the same set of lines runs in the same direction? Including or excluding stations? Including or excluding bends?

4. **What is the layout pass's output data structure?** A map from `(line, cell-step)` to pixel offset? A list of corridor objects with line slot assignments? Both? Whatever it is, it's the API between layout and rendering and it needs to be designed.

5. **How are edits invalidated?** Drag a station → which corridors need re-layout? All of them? Just adjacent ones? Recompute always vs incremental?

6. **Strip-first or refactor-in-place?** See §6.

7. **Cell size:** keep 24px? Smaller cells give finer control but more cells to manage. Larger cells give cleaner Beck-style aesthetic but less flexibility.

8. **Where does railmap data live?** On segments (v1) or under `data.beckmap` (v2)? Migration path matters either way.

9. **Is `mapLineOrder` per-corridor, per-segment, or global?** v1 wanted per-segment, built it inconsistently. Pick one.

10. **Are line styles (dashed/dotted/punched) part of v1.5 from the start, or polish?** They were polish in v1 and never built.

11. **Is SVG export part of v1.5 from the start, or polish?** Same answer.

12. **Does v1.5 need to read v2 state files?** If a project file is in v2's state (gridless float coords, `data.beckmap.lineRoutes` empty), the migration needs to convert it back to grid ints. Easy enough but worth flagging.

---

## Summary in one paragraph

Beckmap v1 failed because its renderer tried to solve the parallel-line layout problem one cell-step at a time, using local geometric reasoning that had no access to the topological context it needed. The set of lines in a corridor changed from cell-step to cell-step, and a given line's offset slot needed to be preserved across those changes, but v1 had no mechanism for that — it computed offsets locally and then bolted on carry-forward heuristics that bled into wrong sections, didn't propagate when needed, and broke at every bend, peel, and direction reversal. v1.5 is a rebuild of the same architecture (grid + shared segments + pixel offsets) with the central insight that **layout should be a separate pass from rendering**: walk the graph once, assign each line a stable offset slot at each cell-step, store the result as inspectable data, then render the result by lookup. Combined with identity-stable offset assignment, junction-transparent corridor walking, and a failure-mode test dataset built before the renderer, v1.5 is the last attempt at v1's architecture before pivoting to v3 if it also fails.
