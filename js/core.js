// ============================================================
// DATA MODEL
// ============================================================
let data = { nodes: [], segments: [], categories: [], services: [], serviceGroups: [], departures: [], rollingStock: [], stockModeMatrix: {}, settings: {} };
let editingId = null;

function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 6); }
function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

// ============================================================
// COLOR PALETTE
// ============================================================
const COLOR_PALETTE = [
  '#e53535', '#e06020', '#e8a000', '#b8c020', '#30b850',
  '#20c070', '#00b0b0', '#3070f0', '#6040f0', '#9030e0',
  '#d040a0', '#e03060', '#ff4040', '#ff8800', '#d0d020',
  '#20e080', '#00c8e8', '#4080ff', '#8060ff', '#c050f0',
  '#7090a8', '#506880', '#90b060', '#d08040', '#6098c8',
];

// Count how many times each color is already used across lines and modes
function colorUsage() {
  const usage = {};
  for (const c of COLOR_PALETTE) usage[c] = 0;
  for (const g of data.serviceGroups) { if (g.color && usage[g.color] !== undefined) usage[g.color]++; else if (g.color) usage[g.color] = 1; }
  return usage;
}

// Pick the least-used color as default
function suggestColor() {
  const usage = colorUsage();
  let best = COLOR_PALETTE[0], bestCount = Infinity;
  for (const c of COLOR_PALETTE) {
    if ((usage[c] || 0) < bestCount) { bestCount = usage[c] || 0; best = c; }
  }
  return best;
}

// Generate the palette HTML for a form, targeting a specific input ID
function colorPaletteHtml(inputId, currentColor) {
  const usage = colorUsage();
  return `<div class="color-picker-palette">${COLOR_PALETTE.map(c => {
    const isActive = c.toLowerCase() === (currentColor || '').toLowerCase();
    const count = usage[c] || 0;
    return `<div class="color-swatch ${isActive ? 'active' : ''}" style="background:${c}"
      onclick="document.getElementById('${inputId}').value='${c}';document.querySelectorAll('#${inputId}-palette .color-swatch').forEach(s=>s.classList.remove('active'));this.classList.add('active');"
      title="${c}${count ? ' (used '+count+'×)' : ' (unused)'}">${count ? `<span class="usage-dot">${count}</span>` : ''}</div>`;
  }).join('')}</div>`;
}

// ============================================================
// SETTINGS GETTERS
// ============================================================
function getSetting(key, fallback) { return data.settings?.[key] ?? fallback; }
function WALKING_SPEED() { return getSetting('walkingSpeed', 4.5); }
function JP_TRANSFER_MIN_() { return getSetting('transferTime', 5); }
function PLATFORM_CLEARANCE_MIN_() { return getSetting('platformClearance', 3); }
function DAY_CUTOFF_() { return getSetting('dayCutoff', 240); }
function DEFAULT_ACCEL() { return getSetting('defaultAcceleration', 1.0); }
function DEFAULT_DWELL() { return getSetting('defaultDwell', 60); }
function DEFAULT_SEG_TRACKS() { return getSetting('defaultSegTracks', 2); }
function DEFAULT_SEG_SPEED() { return getSetting('defaultSegSpeed', 120); }
function DEFAULT_SEG_ELEC() { return getSetting('defaultSegElec', true); }

// ============================================================
// LOOKUPS
// ============================================================
function stripDiacritics(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function getNode(id) { return data.nodes.find(n => n.id === id); }
function getSeg(id) { return data.segments.find(s => s.id === id); }
function getCat(id) { return data.categories.find(c => c.id === id); }
function getSvc(id) { return data.services.find(s => s.id === id); }
function getStock(id) { return data.rollingStock.find(s => s.id === id); }
function nodeName(id) { const n = getNode(id); return n ? n.name : '???'; }
function nodeDisplayName(id) {
  const n = getNode(id); if (!n) return '???';
  if (data.settings?.stripBrackets === false) return n.name;
  return n.name.replace(/\s*\[[^\]]*\]\s*$/, '').trim() || n.name;
}
// Get all passenger stop node IDs that share the same display name
function stationGroup(nodeId) {
  const displayName = nodeDisplayName(nodeId);
  return data.nodes.filter(n => isPassengerStop(n) && nodeDisplayName(n.id) === displayName).map(n => n.id);
}
// Build a map of displayName -> [nodeId, ...] for all passenger stops
function buildStationGroups() {
  const groups = {};
  for (const n of data.nodes) {
    if (!isPassengerStop(n)) continue;
    const dn = nodeDisplayName(n.id);
    if (!groups[dn]) groups[dn] = [];
    groups[dn].push(n.id);
  }
  return groups;
}
function platName(stationId, platId) {
  const n = getNode(stationId); if (!n?.platforms) return '—';
  const p = n.platforms.find(p => p.id === platId); return p ? p.name : '—';
}
// Short display name: strip "Platform " prefix and "[...]" bracketed text
function platDisplayName(name) {
  if (!name || name === '—') return name;
  return name.replace(/^[Pp]latform\s*/i, '').replace(/\s*\[.*?\]\s*/g, '').trim();
}
// Resolve effective platform for a departure at stop index i
// Checks departure-level overrides first, then falls back to service default
function depPlatId(dep, svc, i) {
  if (dep.platformOverrides && dep.platformOverrides[i]) return dep.platformOverrides[i];
  return svc.stops[i]?.platformId || null;
}
function depPlatName(dep, svc, i) {
  const pid = depPlatId(dep, svc, i);
  if (!pid) return '—';
  return platName(dep.times[i].nodeId, pid);
}
function nodeOpts(selectedId) {
  const sorted = [...data.nodes].sort((a, b) => a.name.localeCompare(b.name));
  return '<option value="">— Select —</option>' +
    sorted.map(n => `<option value="${n.id}" ${n.id===selectedId?'selected':''}>${esc(n.name)} (${n.type})</option>`).join('');
}

// Service group lookups (relocated from Services section — used across modules)
function getGroup(id) { return data.serviceGroups.find(g => g.id === id); }
function groupName(id) { const g = getGroup(id); return g ? g.name : ''; }
function svcLineColor(svc) { const g = svc?.groupId ? getGroup(svc.groupId) : null; return g?.color || 'var(--text-dim)'; }
function contrastText(hex) {
  if (!hex || hex.startsWith('var(')) return '#fff';
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#000' : '#fff';
}

// ============================================================
// SEGMENT & NODE TYPE HELPERS
// ============================================================
function isInterchange(seg) { return seg.interchangeType === 'osi' || seg.interchangeType === 'isi'; }
function isRoad(seg) { return seg.interchangeType === 'road'; }
function isPassengerStop(node) { return node?.type === 'station' || node?.type === 'bus_stop'; }

// ============================================================
// CONNECTIVITY & TIME UTILITIES
// ============================================================
// Find all nodes connected to a given node via traversable segments (track + road, not interchanges)
function connectedNodes(nodeId) {
  const result = [];
  for (const s of data.segments) {
    if (isInterchange(s)) continue;
    if (s.nodeA === nodeId) result.push({ nodeId: s.nodeB, segId: s.id });
    if (s.nodeB === nodeId) result.push({ nodeId: s.nodeA, segId: s.id });
  }
  return result;
}

// Find traversable segment between two nodes (track or road, not interchanges)
function findSeg(a, b) {
  return data.segments.find(s => !isInterchange(s) && ((s.nodeA === a && s.nodeB === b) || (s.nodeB === a && s.nodeA === b)));
}
// Find ALL traversable segments between two nodes (for parallel segment support)
function findSegs(a, b) {
  return data.segments.filter(s => !isInterchange(s) && ((s.nodeA === a && s.nodeB === b) || (s.nodeB === a && s.nodeA === b)));
}
// Find the segment between two nodes that contains a specific trackId
function findSegByTrack(a, b, trackId) {
  if (!trackId) return findSeg(a, b);
  return data.segments.find(s => !isInterchange(s) &&
    ((s.nodeA === a && s.nodeB === b) || (s.nodeB === a && s.nodeA === b)) &&
    Array.isArray(s.tracks) && s.tracks.some(tk => tk.id === trackId)) || findSeg(a, b);
}
// Check if a mode (category) is allowed on a segment
function isModeAllowedOnSeg(seg, catId) {
  if (!seg || !catId) return true;
  if (!seg.allowedModes || !seg.allowedModes.length) return true; // Empty = all allowed
  return seg.allowedModes.includes(catId);
}

// Find ALL connections including interchanges (for node detail display)
function allConnectedSegments(nodeId) {
  const result = [];
  for (const s of data.segments) {
    if (s.nodeA === nodeId) result.push({ nodeId: s.nodeB, segId: s.id, interchange: s.interchangeType });
    if (s.nodeB === nodeId) result.push({ nodeId: s.nodeA, segId: s.id, interchange: s.interchangeType });
  }
  return result;
}

// ============================================================
// TRACK HELPERS
// ============================================================

// Backward-safe track count: works with both integer (legacy) and array (v16.3+)
function segTrackCount(seg) {
  if (!seg) return 1;
  if (Array.isArray(seg.tracks)) return seg.tracks.length;
  return seg.tracks || 1;
}

// Migrate segment tracks from integer to named objects, and schematic trackNum → trackId
function migrateSegmentTracks() {
  // Step 1: Convert segment tracks from integer to array
  for (const seg of data.segments) {
    if (Array.isArray(seg.tracks)) continue; // Already migrated
    const n = seg.tracks || 0;
    if (isInterchange(seg) || isRoad(seg) || n <= 0) {
      seg.tracks = [];
    } else {
      seg.tracks = Array.from({ length: n }, (_, i) => ({ id: uid(), name: 'Track ' + (i + 1) }));
    }
  }
  // Step 2: Migrate schematic sideA/sideB entries from trackNum to trackId
  for (const node of data.nodes) {
    if (!node.schematic?.tracks) continue;
    for (const trk of node.schematic.tracks) {
      for (const side of ['sideA', 'sideB']) {
        if (!trk[side]) continue;
        trk[side] = trk[side].map(c => {
          // Already migrated (has trackId)
          if (c.trackId) return c;
          // Legacy string entry
          if (typeof c === 'string') {
            const seg = getSeg(c);
            return { segId: c, trackId: seg?.tracks?.[0]?.id || null };
          }
          // Legacy { segId, trackNum } entry
          const seg = getSeg(c.segId);
          const idx = (c.trackNum || 1) - 1; // trackNum is 1-based
          return { segId: c.segId, trackId: seg?.tracks?.[idx]?.id || seg?.tracks?.[0]?.id || null };
        });
      }
    }
    // Step 3: Clean up cross-wired connections (segment on wrong side)
    const sides = node.schematic.sides || {};
    const sideASet = new Set(sides.a || []);
    const sideBSet = new Set(sides.b || []);
    const sideCSet = new Set(sides.c || []);
    const sideDSet = new Set(sides.d || []);
    for (const trk of node.schematic.tracks) {
      if (trk.sideA) trk.sideA = trk.sideA.filter(c => sideASet.has(c.segId));
      if (trk.sideB) trk.sideB = trk.sideB.filter(c => sideBSet.has(c.segId));
      if (trk.sideC) trk.sideC = trk.sideC.filter(c => sideCSet.has(c.segId));
      if (trk.sideD) trk.sideD = trk.sideD.filter(c => sideDSet.has(c.segId));
    }
  }
}

// ============================================================
// GEOMETRY HELPERS
// ============================================================

// Haversine distance: sum pairwise great-circle distances through coords array
// coords: [[lat,lon], ...], returns km rounded to 2dp
function haversineDistance(coords) {
  const R = 6371;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lon1] = coords[i];
    const [lat2, lon2] = coords[i + 1];
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return Math.round(total * 100) / 100;
}

// Return coordinates for a segment: wayGeometry if available, else straight line from nodes
function segmentCoords(seg) {
  if (seg.wayGeometry && seg.wayGeometry.length >= 2) return seg.wayGeometry;
  const nA = getNode(seg.nodeA), nB = getNode(seg.nodeB);
  if (nA && nA.lat != null && nB && nB.lat != null) return [[nA.lat, nA.lon], [nB.lat, nB.lon]];
  return [];
}

// Return coordinates directed from a specific node (reversed if fromNodeId is nodeB)
function segmentCoordsDirected(seg, fromNodeId) {
  const coords = segmentCoords(seg);
  if (fromNodeId === seg.nodeB) return [...coords].reverse();
  return coords;
}

function toMin(str) { const [h, m] = str.split(':').map(Number); return h * 60 + (m || 0); }
function toTime(mins) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60) % 24; const m = Math.floor(mins % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// ============================================================
// SCHEDULE PATTERN HELPERS
// ============================================================
// Pattern lives on the SERVICE: { days, dateRanges, excludeDates, specificDates }
// days: [0..6] (0=Mon…6=Sun). dateRanges: [{from,to}] in MM-DD. specificDates: ['MM-DD'].
// null/undefined pattern = daily, all year.

const _DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const _MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // max days per month (Feb=29 for leap)

function isoWeekday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return (d.getDay() + 6) % 7;
}

function mmddFromDate(dateStr) { return dateStr.slice(5); }

function mmddInRange(mmdd, from, to) {
  if (from <= to) return mmdd >= from && mmdd <= to;
  return mmdd >= from || mmdd <= to; // year-boundary wrap
}

function isValidMMDD(str) {
  if (!/^\d{2}-\d{2}$/.test(str)) return false;
  const mm = parseInt(str.slice(0, 2), 10), dd = parseInt(str.slice(3), 10);
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > _MONTH_DAYS[mm - 1]) return false;
  return true;
}

function patternMatchesDate(pattern, dateStr) {
  if (!pattern || !dateStr) return true;
  const mmdd = mmddFromDate(dateStr);

  // Exclude dates — checked first, overrides everything
  if (pattern.excludeDates && pattern.excludeDates.includes(mmdd)) return false;

  // Specific dates — if this date is explicitly listed, it runs (bypass days/ranges)
  if (pattern.specificDates && pattern.specificDates.length > 0) {
    if (pattern.specificDates.includes(mmdd)) return true;
  }

  // Days filter — empty array means "no days" (service only runs via specificDates)
  if (pattern.days) {
    if (pattern.days.length === 0) return false;
    if (pattern.days.length < 7 && !pattern.days.includes(isoWeekday(dateStr))) return false;
  }

  // Date ranges filter
  if (pattern.dateRanges && pattern.dateRanges.length > 0) {
    if (!pattern.dateRanges.some(r => mmddInRange(mmdd, r.from, r.to))) return false;
  }

  return true;
}

function patternsOverlap(patA, patB) {
  if (!patA || !patB) return true;

  // If either has specificDates, conservatively assume overlap (could match any date)
  if ((patA.specificDates && patA.specificDates.length > 0) ||
      (patB.specificDates && patB.specificDates.length > 0)) return true;

  // Days overlap
  const daysA = (patA.days && patA.days.length > 0 && patA.days.length < 7) ? patA.days : null;
  const daysB = (patB.days && patB.days.length > 0 && patB.days.length < 7) ? patB.days : null;
  // Empty days array = no days at all (never runs by day) — no overlap unless specificDates (handled above)
  if (patA.days && patA.days.length === 0) return false;
  if (patB.days && patB.days.length === 0) return false;
  if (daysA && daysB && !daysA.some(d => daysB.includes(d))) return false;

  // Date ranges overlap
  const rangesA = (patA.dateRanges && patA.dateRanges.length > 0) ? patA.dateRanges : null;
  const rangesB = (patB.dateRanges && patB.dateRanges.length > 0) ? patB.dateRanges : null;
  if (rangesA && rangesB) {
    let any = false;
    for (const a of rangesA) {
      for (const b of rangesB) { if (_rangesOverlap(a.from, a.to, b.from, b.to)) { any = true; break; } }
      if (any) break;
    }
    if (!any) return false;
  }

  return true;
}

function _rangesOverlap(aFrom, aTo, bFrom, bTo) {
  const aWraps = aFrom > aTo, bWraps = bFrom > bTo;
  if (aWraps || bWraps) return true;
  return !(aTo < bFrom || bTo < aFrom);
}

function describePattern(pattern) {
  if (!pattern) return t('pattern.daily');
  const parts = [];

  // Days
  if (pattern.days && pattern.days.length > 0 && pattern.days.length < 7) {
    const sorted = [...pattern.days].sort((a, b) => a - b);
    if (sorted.length === 5 && sorted.join(',') === '0,1,2,3,4') parts.push(t('pattern.weekdays'));
    else if (sorted.length === 2 && sorted.join(',') === '5,6') parts.push(t('pattern.weekends'));
    else parts.push(_describeDays(sorted));
  } else if (pattern.days && pattern.days.length === 0) {
    // No days — service runs only on specific dates
  } else {
    parts.push(t('pattern.daily'));
  }

  // Date ranges
  if (pattern.dateRanges && pattern.dateRanges.length > 0) {
    parts.push(pattern.dateRanges.map(r => _formatMMDD(r.from) + '–' + _formatMMDD(r.to)).join(', '));
  }

  // Specific dates
  if (pattern.specificDates && pattern.specificDates.length > 0) {
    parts.push(pattern.specificDates.map(_formatMMDD).join(', '));
  }

  // Exclude dates
  if (pattern.excludeDates && pattern.excludeDates.length > 0) {
    parts.push(t('pattern.excl', { dates: pattern.excludeDates.map(_formatMMDD).join(', ') }));
  }

  return parts.length ? parts.join(' · ') : t('pattern.daily');
}

function _describeDays(sorted) {
  const runs = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === prev + 1) { prev = sorted[i]; continue; }
    runs.push(start === prev
      ? t('pattern.' + _DAY_NAMES[start].toLowerCase())
      : t('pattern.' + _DAY_NAMES[start].toLowerCase()) + '–' + t('pattern.' + _DAY_NAMES[prev].toLowerCase()));
    if (i < sorted.length) { start = sorted[i]; prev = sorted[i]; }
  }
  return runs.join(', ');
}

function _formatMMDD(mmdd) {
  const [mm, dd] = mmdd.split('-');
  const monthIdx = parseInt(mm, 10) - 1;
  const day = parseInt(dd, 10);
  return (_MONTH_NAMES[monthIdx] || mm) + ' ' + day;
}

// ============================================================
// PHYSICS-BASED TRAVEL TIME
// ============================================================
// Calculates time to traverse a segment given entry/exit speeds and stock properties.
// entrySpeed and exitSpeed are in km/h (0 = stopped at station)
// accel is in m/s² (defaults to 1.0 if no stock specified)
// stockMaxSpeed is the rolling stock's own speed limit in km/h

function calcSegmentTime(distKm, maxSpeedKmh, entrySpeedKmh, exitSpeedKmh, accel) {
  const a = accel || DEFAULT_ACCEL();
  // Convert everything to m and m/s
  const dist = distKm * 1000;
  const vMax = maxSpeedKmh / 3.6;
  const vEntry = Math.min(entrySpeedKmh / 3.6, vMax);
  const vExit = Math.min(exitSpeedKmh / 3.6, vMax);

  // Distance to accelerate from vEntry to vMax
  // v² = u² + 2as → s = (v² - u²) / (2a)
  const dAccel = (vMax * vMax - vEntry * vEntry) / (2 * a);
  // Distance to decelerate from vMax to vExit
  const dDecel = (vMax * vMax - vExit * vExit) / (2 * a);

  let totalTime;

  if (dAccel + dDecel <= dist) {
    // Train reaches max speed: accel phase + cruise phase + decel phase
    const tAccel = (vMax - vEntry) / a;
    const tDecel = (vMax - vExit) / a;
    const dCruise = dist - dAccel - dDecel;
    const tCruise = dCruise / vMax;
    totalTime = tAccel + tCruise + tDecel;
  } else {
    // Train never reaches max speed — find peak velocity
    const vPeakSq = (2 * a * dist + vEntry * vEntry + vExit * vExit) / 2;
    if (vPeakSq < 0) return dist / 1 / 60; // fallback
    const vPeak = Math.sqrt(vPeakSq);
    const tAccel = (vPeak - vEntry) / a;
    const tDecel = (vPeak - vExit) / a;
    totalTime = tAccel + tDecel;
  }

  return totalTime / 60; // return minutes
}

// Resolve the effective stock for a service (or departure override)
function resolveStock(svc, dep) {
  const stockId = dep?.stockId || svc?.stockId;
  return stockId ? getStock(stockId) : null;
}

// Get effective max speed: min of segment max and stock max (if stock assigned)
function effectiveMaxSpeed(segMaxSpeed, stock) {
  if (stock && stock.maxSpeed) return Math.min(segMaxSpeed, stock.maxSpeed);
  return segMaxSpeed;
}

// Simple wrapper: assumes starting from stop and ending at stop
// Optional stock parameter for stock-aware display calculations
function travelTime(a, b, stock) {
  const seg = findSeg(a, b);
  if (!seg) return 5;
  const spd = effectiveMaxSpeed(seg.maxSpeed, stock);
  const accel = stock ? stock.acceleration : DEFAULT_ACCEL();
  return calcSegmentTime(seg.distance, spd, 0, 0, accel);
}

// Context-aware version used during schedule generation.
// Looks at whether train stops or passes through at from/to nodes,
// and what the adjacent segment speeds are.
// Optional stock parameter for stock-specific physics.
function travelTimeInContext(stops, segIdx, stock) {
  const fromStop = stops[segIdx];
  const toStop = stops[segIdx + 1];
  const seg = findSegByTrack(fromStop.nodeId, toStop.nodeId, toStop?.trackId);
  if (!seg) return 5;

  const accel = stock ? stock.acceleration : DEFAULT_ACCEL();
  const segSpeed = effectiveMaxSpeed(seg.maxSpeed, stock);

  const fromFlowing = fromStop.passThrough && !fromStop.dwell;
  const toFlowing = toStop.passThrough && !toStop.dwell;

  let entrySpeed = 0;
  if (fromFlowing && segIdx > 0) {
    const prevSeg = findSegByTrack(stops[segIdx - 1].nodeId, fromStop.nodeId, fromStop?.trackId);
    const prevSpeed = prevSeg ? effectiveMaxSpeed(prevSeg.maxSpeed, stock) : segSpeed;
    entrySpeed = Math.min(segSpeed, prevSpeed);
  }

  let exitSpeed = 0;
  if (toFlowing && segIdx + 2 < stops.length) {
    const nextSeg = findSegByTrack(toStop.nodeId, stops[segIdx + 2].nodeId, stops[segIdx + 2]?.trackId);
    const nextSpeed = nextSeg ? effectiveMaxSpeed(nextSeg.maxSpeed, stock) : segSpeed;
    exitSpeed = Math.min(segSpeed, nextSpeed);
  }

  return calcSegmentTime(seg.distance, segSpeed, entrySpeed, exitSpeed, accel);
}

// ============================================================
// PREFIX SEARCH
// ============================================================
// Parses "type:station platforms:3+ some text" into structured query.
// Supports: OR via " / " separator, NOT via "-" prefix on filters.
// "type:station / type:junction" → OR between two filters
// "-type:waypoint" → exclude waypoints
// Returns { groups: [[filter, ...], ...], freeText: string }
// Each group is ANDed internally; groups are ORed with each other.
const _numericPrefixes = new Set(['platforms','tracks','speed','dist','connections','services','deps','stations','segments','stops','length','duration']);

function _parseToken(tok) {
  const negated = tok.startsWith('-');
  const clean = negated ? tok.substring(1) : tok;
  const m = clean.match(/^([a-z]+):(.+)$/i);
  if (!m) return null;
  const key = m[1].toLowerCase();
  const raw = m[2];
  const rangeMatch = raw.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  const gteMatch = raw.match(/^(\d+(?:\.\d+)?)\+$/);
  const lteMatch = raw.match(/^(\d+(?:\.\d+)?)-$/);
  const exactNum = raw.match(/^(\d+(?:\.\d+)?)$/);
  let filter;
  if (rangeMatch) {
    filter = { key, op: 'range', min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]), raw };
  } else if (gteMatch) {
    filter = { key, op: 'gte', value: parseFloat(gteMatch[1]), raw };
  } else if (lteMatch) {
    filter = { key, op: 'lte', value: parseFloat(lteMatch[1]), raw };
  } else if (exactNum && _numericPrefixes.has(key)) {
    filter = { key, op: 'eq', value: parseFloat(exactNum[1]), raw };
  } else {
    const lower = raw.toLowerCase();
    if (lower === 'yes' || lower === 'true') {
      filter = { key, op: 'bool', value: true, raw };
    } else if (lower === 'no' || lower === 'false') {
      filter = { key, op: 'bool', value: false, raw };
    } else {
      filter = { key, op: 'str', value: lower, raw };
    }
  }
  if (negated) filter.negated = true;
  return filter;
}

function parseSearchQuery(query) {
  // Split on " / " for OR groups
  const orParts = query.split(/\s+\/\s+/);
  const groups = [];
  let freeWords = [];
  for (const part of orParts) {
    const tokens = part.trim().split(/\s+/);
    const filters = [];
    for (const tok of tokens) {
      const f = _parseToken(tok);
      if (f) filters.push(f);
      else if (tok) freeWords.push(tok);
    }
    if (filters.length) groups.push(filters);
  }
  return { groups, freeText: freeWords.join(' ').toLowerCase() };
}

// Match a single filter against a value. Null/undefined → no match (for numeric/string) or false (for bool).
function matchesPrefix(val, prefix) {
  const isNull = val === undefined || val === null;
  let result;
  switch (prefix.op) {
    case 'str': result = !isNull && stripDiacritics(String(val).toLowerCase()).includes(stripDiacritics(prefix.value)); break;
    case 'bool': result = isNull ? !prefix.value : !!val === prefix.value; break;
    case 'eq': result = !isNull && Number(val) === prefix.value; break;
    case 'gte': result = !isNull && Number(val) >= prefix.value; break;
    case 'lte': result = !isNull && Number(val) <= prefix.value; break;
    case 'range': result = !isNull && Number(val) >= prefix.min && Number(val) <= prefix.max; break;
    default: result = true;
  }
  return prefix.negated ? !result : result;
}

// Apply parsed query against an entity using a prefix map.
// prefixMap: { key: fn(entity) → value to match }
// freeTextFn: fn(entity, freeText) → bool (fallback for non-prefixed text)
function applySearchQuery(entity, parsed, prefixMap, freeTextFn) {
  // Groups are ORed; within each group, filters are ANDed
  if (parsed.groups.length) {
    const groupMatch = parsed.groups.some(group => {
      return group.every(p => {
        const getter = prefixMap[p.key];
        if (!getter) return true; // unknown prefix — skip
        return matchesPrefix(getter(entity), p);
      });
    });
    if (!groupMatch) return false;
  }
  // Free text must also match (if any)
  if (parsed.freeText && freeTextFn) {
    if (!freeTextFn(entity, parsed.freeText)) return false;
  }
  return true;
}

// Search filter hint definitions per table (l10n keys for descriptions)
const _searchHints = {
  nodes: [
    { prefix: 'name:', descKey: 'hint.node_name' },
    { prefix: 'ref:', descKey: 'hint.ref_code' },
    { prefix: 'type:', descKey: 'hint.node_type' },
    { prefix: 'platforms:', descKey: 'hint.platform_count' },
    { prefix: 'connections:', descKey: 'hint.connections' },
    { prefix: 'desc:', descKey: 'hint.description' },
    { prefix: 'address:', descKey: 'hint.address' },
    { prefix: 'ogf:', descKey: 'hint.ogf' },
    { prefix: 'placed:', descKey: 'hint.placed' },
    { prefix: 'schematic:', descKey: 'hint.schematic' },
    { prefix: 'line:', descKey: 'hint.served_by_line' },
  ],
  segments: [
    { prefix: 'type:', descKey: 'hint.seg_type' },
    { prefix: 'tracks:', descKey: 'hint.track_count' },
    { prefix: 'speed:', descKey: 'hint.max_speed' },
    { prefix: 'dist:', descKey: 'hint.distance' },
    { prefix: 'elec:', descKey: 'hint.electrified' },
    { prefix: 'ref:', descKey: 'hint.ref_code' },
    { prefix: 'desc:', descKey: 'hint.description' },
    { prefix: 'node:', descKey: 'hint.node_name' },
  ],
  lines: [
    { prefix: 'services:', descKey: 'hint.service_count' },
    { prefix: 'deps:', descKey: 'hint.departure_count' },
    { prefix: 'stations:', descKey: 'hint.station_count' },
    { prefix: 'segments:', descKey: 'hint.segment_count' },
  ],
  services: [
    { prefix: 'line:', descKey: 'hint.line_name' },
    { prefix: 'mode:', descKey: 'hint.mode_name' },
    { prefix: 'stock:', descKey: 'hint.stock_name' },
    { prefix: 'stops:', descKey: 'hint.stop_count' },
    { prefix: 'stop:', descKey: 'hint.stops_at' },
    { prefix: 'deps:', descKey: 'hint.departure_count' },
    { prefix: 'desc:', descKey: 'hint.description' },
    { prefix: 'length:', descKey: 'hint.route_km' },
    { prefix: 'duration:', descKey: 'hint.route_min' },
  ]
};

// Render search hints dropdown into a search-bar container
function initSearchHints(inputId, tableId) {
  const input = document.getElementById(inputId);
  if (!input || !_searchHints[tableId]) return;
  const bar = input.closest('.search-bar');
  if (!bar) return;
  if (bar.querySelector('.search-hints')) return; // already initialized
  const hints = _searchHints[tableId];
  const dd = document.createElement('div');
  dd.className = 'search-hints';
  bar.style.position = 'relative';
  bar.appendChild(dd);

  // Tag overlay for visual styling of recognized prefixes
  let overlay = bar.querySelector('.search-tag-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'search-tag-overlay';
    bar.appendChild(overlay);
  }

  function updateTagOverlay() {
    const val = input.value;
    if (!val) { overlay.innerHTML = ''; return; }
    // Build overlay HTML: recognized prefix:value pairs get tag styling
    let html = '';
    const tokens = val.split(/(\s+)/); // preserve whitespace
    for (const tok of tokens) {
      if (/\s+/.test(tok)) { html += tok; continue; }
      const m = tok.match(/^(-?)([a-z]+:)(.*)$/i);
      if (m) {
        html += `<span class="search-tag">${esc(m[1]+m[2])}</span>${esc(m[3])}`;
      } else {
        html += esc(tok);
      }
    }
    overlay.innerHTML = html;
  }

  function selectHint(prefix) {
    const val = input.value.trim();
    const tokens = val.split(/\s+/);
    const lastToken = tokens.pop() || '';
    if (!lastToken.includes(':') && lastToken) tokens.push(prefix);
    else { if (lastToken) tokens.push(lastToken); tokens.push(prefix); }
    input.value = tokens.join(' ');
    input.focus();
    dd.classList.remove('open');
    updateTagOverlay();
  }

  function renderHints(filterText) {
    const ft = filterText.toLowerCase();
    const filtered = ft ? hints.filter(h => h.prefix.startsWith(ft) || h.prefix.includes(ft)) : hints;
    if (!filtered.length) { dd.classList.remove('open'); return; }
    dd.innerHTML = `<div class="hint-section">${t('hint.title')}</div>` +
      filtered.map((h, i) => `<div class="hint-item${i === 0 ? ' hint-active' : ''}" data-prefix="${h.prefix}"><span class="hint-prefix">${h.prefix}</span><span class="hint-desc">${t(h.descKey)}</span></div>`).join('');
    dd.classList.add('open');
  }

  input.addEventListener('focus', () => {
    const val = input.value.trim();
    if (!val || (!val.includes(':') && !val.includes(' '))) renderHints(val);
  });
  input.addEventListener('input', () => {
    const val = input.value.trim();
    const lastToken = val.split(/\s+/).pop() || '';
    if (!lastToken.includes(':') && lastToken.length > 0) renderHints(lastToken);
    else if (!val) renderHints('');
    else dd.classList.remove('open');
    updateTagOverlay();
  });
  input.addEventListener('keydown', e => {
    // Enter: select first hint if hints are visible, otherwise trigger search
    if (e.key === 'Enter' && dd.classList.contains('open')) {
      const first = dd.querySelector('.hint-item');
      if (first) { e.preventDefault(); selectHint(first.dataset.prefix); }
    }
    // Backspace: if cursor is right after a prefix tag (e.g. "type:"), remove the whole tag
    if (e.key === 'Backspace') {
      const pos = input.selectionStart;
      const val = input.value;
      // Check if we're at the end of a prefix:value token and the cursor is right after the colon or at the end of the token
      const before = val.substring(0, pos);
      const tagMatch = before.match(/(?:^|\s)(-?[a-z]+:)$/i);
      if (tagMatch) {
        e.preventDefault();
        const tagStart = pos - tagMatch[1].length;
        // Also remove leading space if present
        const actualStart = tagStart > 0 && val[tagStart-1] === ' ' ? tagStart - 1 : tagStart;
        input.value = val.substring(0, actualStart) + val.substring(pos);
        input.selectionStart = input.selectionEnd = actualStart;
        input.dispatchEvent(new Event('input'));
      }
    }
  });
  input.addEventListener('blur', () => { setTimeout(() => dd.classList.remove('open'), 150); });
  dd.addEventListener('click', e => {
    const item = e.target.closest('.hint-item');
    if (item) selectHint(item.dataset.prefix);
  });
  // Initial overlay render
  updateTagOverlay();
}

// Set a search input value programmatically and update tag overlay
function setSearchValue(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  // Trigger tag overlay update
  const bar = input.closest('.search-bar');
  const overlay = bar?.querySelector('.search-tag-overlay');
  if (overlay) {
    const val = input.value;
    if (!val) { overlay.innerHTML = ''; }
    else {
      let html = '';
      const tokens = val.split(/(\s+)/);
      for (const tok of tokens) {
        if (/\s+/.test(tok)) { html += tok; continue; }
        const m = tok.match(/^(-?)([a-z]+:)(.*)$/i);
        if (m) html += `<span class="search-tag">${esc(m[1]+m[2])}</span>${esc(m[3])}`;
        else html += esc(tok);
      }
      overlay.innerHTML = html;
    }
  }
}

// ============================================================
// COLUMN SORTING
// ============================================================
let _sortState = {}; // { tableId: { column, direction: 'asc'|'desc'|null } }

function sortableHeader(tableId, column, label) {
  const st = _sortState[tableId];
  const active = st?.column === column;
  const arrow = active ? (st.direction === 'asc' ? ' ▲' : ' ▼') : '';
  return `<th class="sortable-th" onclick="toggleSort('${tableId}','${column}')">${label}${arrow}</th>`;
}

function toggleSort(tableId, column) {
  const st = _sortState[tableId];
  if (!st || st.column !== column) {
    _sortState[tableId] = { column, direction: 'asc' };
  } else if (st.direction === 'asc') {
    _sortState[tableId] = { column, direction: 'desc' };
  } else {
    _sortState[tableId] = null; // back to default
  }
  // Re-render the appropriate tab
  const renders = { nodes: renderNodes, segments: renderSegments, lines: renderLines, modes: renderCategories, stock: renderStock, services: renderServices };
  if (renders[tableId]) renders[tableId]();
}

// Sort a list based on current sort state. sortDefs maps column → accessor fn.
function applySortable(list, tableId, sortDefs) {
  const st = _sortState[tableId];
  if (!st || !st.column || !sortDefs[st.column]) return list;
  const accessor = sortDefs[st.column];
  const dir = st.direction === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    let va = accessor(a), vb = accessor(b);
    // Treat '—', '', NaN, and null/undefined as non-applicable → sort to bottom
    const naA = va == null || va === '—' || va === '' || (typeof va === 'number' && isNaN(va));
    const naB = vb == null || vb === '—' || vb === '' || (typeof vb === 'number' && isNaN(vb));
    if (naA && naB) return 0;
    if (naA) return 1;
    if (naB) return -1;
    if (vb == null) return -1;
    if (typeof va === 'string') return dir * va.localeCompare(vb);
    return dir * (va - vb);
  });
}
