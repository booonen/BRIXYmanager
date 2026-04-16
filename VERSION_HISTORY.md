## 0.17.4.0 — Node Split & Merge
- Added ability to split a station or bus_stop node into two separate nodes.
- Segments with shared service usage are grouped as "sticky groups" that move together,
  preventing accidental service breakage.
- Segments with no service usage can be moved freely.
- Platforms can be moved, renamed, added, or removed per side.
- Optional ISI segment creation between the two halves.
- Added ability to merge two nodes of the same type that share a display name or
  are connected by ISI/OSI.
- Direct track segments between the two nodes abort the merge.
- Direct ISI segments are automatically removed during merge.
- Platforms retained with [1]/[2] suffixes. Schematic tracks appended.
- Beckmap placements and station groups migrated correctly in both operations.
