# Phase 16 Sessions 4-6 — Testing Checklist

## Session 16.4 — Track Selection in Route Builder

### Extend to dropdown
- [x] Create/edit a service. At the "Extend to" dropdown, pick a destination via a **single-track segment** — should show one option, no track label (auto-assigns trackId silently)
- [x] Pick a destination via a **multi-track segment** — should show one option per track: "NodeName (type) via Track 1 · 3.01km", "NodeName (type) via Track 2 · 3.01km"
- [x] **Prepend** dropdown (top of route) should also show per-track options

### Segment info between stops
- [x] After extending via a multi-track segment, the segment info line between stops should show the track name: "A — B · Track 1 · 3.01km · 120km/h · ~1.5min"
- [x] Single-track segments should NOT show a track label (would be redundant)

### trackId persistence
- [x] Save a service with track-assigned stops, close and reopen — trackId should persist (track names visible in segment info)
- [x] Edit an **old service** (created before 16.4) — should load fine with no trackId (shows no track label, behaves like before)

### Platform auto-select
- [ ] Add a stop at a station **with a schematic** where only one platform connects to the incoming track — platform should auto-select
- [ ] Add a stop at a station **without a schematic** — should auto-select only if the station has exactly one platform (existing behaviour)
- [ ] Add a stop at a station with **multiple eligible platforms** — should leave platform unselected (user picks)

### Edge cases
- [x] First stop (starting node) — no trackId needed, should work normally
- [x] Waypoints/junctions — should auto-set pass-through as before, no track confusion
- [x] Loop routes (returning to a previously visited node) — should still work

---

## Session 16.5 — Per-Track Conflict Detection

### Setup
Create a test scenario with:
- A single-track segment (A — B, 1 track)
- A dual-track segment (B — C, 2 tracks: "Up", "Down")
- Two services: Svc1 (A→B→C) and Svc2 (C→B→A)

### Single-track conflicts (existing behaviour, now track-aware)
- [ ] Generate departures for both services at overlapping times on the single-track segment A—B — **should** flag a conflict
- [ ] Conflict issue message should include the track name if available

### Multi-track, same track
- [ ] Both services use Track "Up" on B—C at overlapping times — **should** flag a conflict
- [ ] Issue message should mention "Track Up"

### Multi-track, different tracks
- [ ] Svc1 uses "Up", Svc2 uses "Down" on B—C at overlapping times — should **NOT** conflict

### Unassigned tracks (backward compat)
- [ ] Old departures without trackId on multi-track segments — should be **skipped** in conflict detection (no false positives)

### Schedule modal
- [ ] Open schedule modal for a service — "single-track segments" count should be correct
- [ ] Free time slots should correctly exclude conflicted per-track windows

---

## Session 16.6 — Parallel Segments + Mode Restrictions

### Allowed Modes form
- [ ] Open segment editor for a track segment — should see "Allowed Modes" section with checkboxes for each defined mode
- [ ] Leave all unchecked, save — `allowedModes` should be empty (all modes allowed)
- [ ] Check "Intercity" only, save, reopen — "Intercity" should be checked, others unchecked
- [ ] Help text visible: "Leave all unchecked to allow all modes..."

### Allowed Modes in detail view
- [ ] Segment with `allowedModes` set — detail view should show mode name chips
- [ ] Segment with no restrictions — no extra chips shown

### Parallel segments (duplicate issue relaxed)
- [ ] Create two segments between the same node pair, **both with no allowedModes** — should flag "Duplicate Segment" issue
- [ ] Create two segments between the same node pair, **with different allowedModes** (e.g., one for Intercity, one for Regional) — should **NOT** flag duplicate
- [ ] Create two segments with **identical allowedModes** — **should** flag duplicate

### Mode Not Allowed issue
- [ ] Create a segment restricted to "Intercity" only. Create a "Regional" service that uses it — should flag "Mode Not Allowed on Segment" issue
- [ ] Same segment, "Intercity" service — should **NOT** flag any issue
- [ ] Unrestricted segment (no allowedModes) — any mode should pass without issue

### Core helpers
- [ ] `findSegs(a, b)` — if you have parallel segments, verify both appear in the route builder dropdown as separate destination options (this will become the two-step flow in a future polish pass)

---

## General regression checks
- [ ] Load existing data — no errors, all existing services/departures intact
- [ ] Export → Import — all new fields survive the round-trip
- [ ] Issue detection page loads without errors, shows correct issue counts
- [ ] Geomap renders correctly (way geometry still works)
- [ ] Beckmap renders correctly
- [ ] Journey planner works
- [ ] Departure board works
