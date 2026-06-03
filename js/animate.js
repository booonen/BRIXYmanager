// ============================================================
// ANIMATE — Phase 18 Session 1: Animated map tab
// ============================================================
// A dedicated Leaflet map showing live vehicle positions on top of a faded
// network. Default mode is "live" (1×, simMinute locked to wall-clock).
// Speed >1× switches to fast-forward mode (sim advances at speedMult sim-min
// per real-sec from the current sim time). "Now" snaps back to live.

let _animMap = null;
let _animTileLayer = null;
let _animLayers = { segments: null, landmarks: null, highlight: null, trains: null };

// Schematic view state — independent pan/zoom, separate from the editor's _schemState.
const _animSchem = {
  panX: 0, panY: 0, zoom: 1,
  bounds: null,             // {minX, minY, maxX, maxY} in world coords
  routeCache: new Map(),    // `${groupId}|${fromId}|${toId}` -> {cells, cumPx, totalPx}
  trainNodes: new Map(),    // depId -> SVG <circle>
  dragging: false,
  dragStart: null,
};

const _animState = {
  mode: 'live',             // 'live' | 'fast' | 'paused'
  prevMode: 'live',         // mode to restore when resuming from pause
  speedMult: 1,
  simMinute: 0,             // float minutes (sub-minute for smooth motion)
  simDate: '',              // 'YYYY-MM-DD'
  rafHandle: null,
  lastFrameWall: 0,
  activeCache: [],          // [{depId, groupId, kind:'dwell'|'move', ...}]
  markers: new Map(),       // depId -> L.circleMarker (geo view)
  cumDistCache: new Map(),  // `${segId}:${fromNodeId}` -> {coords, cum, totalKm}
  ready: false,             // initAnimatedMap has run
  tabActive: false,         // animated tab currently shown
  tilesOn: false,
  viewMode: 'geo',          // 'geo' | 'schem'
};

// ---- date/time helpers ----
function _animTodayLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _animTomorrow(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _animYesterday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function _animWallClockMinFloat() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000;
}

// ---- haversine + cumulative-distance memo ----
function _animHaversineKm(a, b) {
  const R = 6371;
  const lat1 = a[0] * Math.PI / 180, lat2 = b[0] * Math.PI / 180;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function _animCumDist(seg, fromNodeId) {
  const key = seg.id + ':' + fromNodeId;
  let entry = _animState.cumDistCache.get(key);
  if (entry) return entry;
  const coords = segmentCoordsDirected(seg, fromNodeId);
  if (!coords || coords.length < 2) {
    entry = { coords: coords || [], cum: [0], totalKm: 0 };
  } else {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + _animHaversineKm(coords[i - 1], coords[i]));
    entry = { coords, cum, totalKm: cum[cum.length - 1] };
  }
  _animState.cumDistCache.set(key, entry);
  return entry;
}

// Bearing in CSS-rotation space (0° = right/east, clockwise positive).
// Lat decreases as screen-y increases (north is up); lng → screen-x.
function _animLatLngBearing(a, b) {
  const dx = b[1] - a[1];
  const dy = a[0] - b[0];
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

// Returns { ll: [lat,lng], bearing: deg } at parameter t, smooth-paced via cumulative km.
function _animPositionOnSeg(seg, fromNodeId, t) {
  const { coords, cum, totalKm } = _animCumDist(seg, fromNodeId);
  if (!coords.length) return null;
  if (coords.length === 1 || totalKm === 0) return { ll: coords[0], bearing: 0 };
  const target = totalKm * Math.max(0, Math.min(1, t));
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= target) lo = mid; else hi = mid - 1;
  }
  let segFrom, segTo, ll;
  if (lo >= coords.length - 1) {
    segFrom = coords[Math.max(0, coords.length - 2)];
    segTo = coords[coords.length - 1];
    ll = coords[coords.length - 1];
  } else {
    segFrom = coords[lo];
    segTo = coords[lo + 1];
    const segLen = cum[lo + 1] - cum[lo];
    const u = segLen > 0 ? (target - cum[lo]) / segLen : 0;
    ll = [
      coords[lo][0] + (coords[lo + 1][0] - coords[lo][0]) * u,
      coords[lo][1] + (coords[lo + 1][1] - coords[lo][1]) * u,
    ];
  }
  return { ll, bearing: _animLatLngBearing(segFrom, segTo) };
}

// ---- active-set computation (today + yesterday-wrap) ----
// Default dwell minutes for terminus/origin lingering, using the standard
// cascade: stock.defaultDwell → mode.defaultDwellTime → DEFAULT_DWELL setting.
function _animTermDwellMin(svc, dep) {
  const stock = getStock((dep && dep.stockId) || svc.stockId);
  const cat = getCat(svc.categoryId);
  const sec = (stock && stock.defaultDwell) || (cat && cat.defaultDwellTime) || (typeof DEFAULT_DWELL === 'function' ? DEFAULT_DWELL() : 60);
  return sec / 60;
}

function _animDepActiveAt(dep, simMinute, simDate) {
  if (!dep || !dep.times || dep.times.length < 2) return null;
  const svc = getSvc(dep.serviceId); if (!svc) return null;
  const first = dep.times[0], last = dep.times[dep.times.length - 1];
  if (first.depart == null || last.arrive == null) return null;

  // Lingering windows: visible termDwell minutes before depart at origin,
  // and termDwell minutes after arrival at terminus. Clamp origin to 0 to
  // avoid negative-minute checks; tomorrow-wrap of origin lingering is rare
  // enough to skip in v1 (only fires for services starting at 00:00 sharp).
  const termDwell = _animTermDwellMin(svc, dep);
  const winStart = Math.max(0, first.depart - termDwell);
  const winEnd = last.arrive + termDwell;

  if (!svc.schedulePattern || patternMatchesDate(svc.schedulePattern, simDate)) {
    if (simMinute >= winStart && simMinute < winEnd) {
      return { dep, svc, effMin: simMinute };
    }
  }
  if (winEnd > 1440) {
    const yest = _animYesterday(simDate);
    if (!svc.schedulePattern || patternMatchesDate(svc.schedulePattern, yest)) {
      const eff = simMinute + 1440;
      if (eff >= winStart && eff < winEnd) {
        return { dep, svc, effMin: eff };
      }
    }
  }
  return null;
}

function _animFindStopState(dep, effMin) {
  const times = dep.times;
  const first = times[0], last = times[times.length - 1];

  // Lingering at origin (before service departs).
  if (first.depart != null && effMin < first.depart) {
    return { kind: 'dwell', nodeId: first.nodeId };
  }
  // Lingering at terminus (after service arrives).
  if (last.arrive != null && effMin >= last.arrive) {
    return { kind: 'dwell', nodeId: last.nodeId };
  }

  for (let i = 0; i < times.length; i++) {
    const cur = times[i];
    if (cur.arrive != null && cur.depart != null && cur.depart > cur.arrive
        && effMin >= cur.arrive && effMin < cur.depart) {
      return { kind: 'dwell', nodeId: cur.nodeId };
    }
    const next = times[i + 1];
    if (next && effMin < next.arrive) {
      const fromMin = (cur.depart != null) ? cur.depart : cur.arrive;
      const toMin = next.arrive;
      const span = toMin - fromMin;
      const t = span > 0 ? (effMin - fromMin) / span : 0;
      return {
        kind: 'move',
        fromNodeId: cur.nodeId,
        toNodeId: next.nodeId,
        t: Math.max(0, Math.min(1, t)),
      };
    }
  }
  return null;
}

function animBuildActive() {
  const out = [];
  const sm = _animState.simMinute;
  const sd = _animState.simDate;
  if (!sd || !data || !data.departures) { _animState.activeCache = out; return; }
  for (const dep of data.departures) {
    const a = _animDepActiveAt(dep, sm, sd);
    if (!a) continue;
    const state = _animFindStopState(dep, a.effMin);
    if (!state) continue;
    out.push({
      depId: dep.id,
      groupId: a.svc.groupId || null,
      effMin: a.effMin,
      ...state,
    });
  }
  _animState.activeCache = out;
}

// ---- network background (faded) ----
function _animLineColor(groupId) {
  const grp = groupId ? getGroup(groupId) : null;
  return grp?.color || '#888';
}

// Renders just the segment lines, dimmed. No stations, no labels, no
// parallel-offset rendering — the focus is vehicles.
function renderAnimatedNetwork() {
  if (!_animMap || !_animLayers) return;
  if (_animLayers.segments) _animMap.removeLayer(_animLayers.segments);

  const segLineMap = {};
  for (const svc of data.services) {
    if (!svc.groupId) continue;
    const grp = getGroup(svc.groupId);
    if (!grp) continue;
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const seg = findSeg(svc.stops[i].nodeId, svc.stops[i + 1].nodeId);
      if (seg) {
        if (!segLineMap[seg.id]) segLineMap[seg.id] = [];
        if (!segLineMap[seg.id].find(g => g.id === grp.id)) segLineMap[seg.id].push(grp);
      }
    }
  }

  const segLines = [];
  for (const seg of data.segments) {
    if (isInterchange(seg)) continue;
    const coords = segmentCoords(seg);
    if (coords.length < 2) continue;
    const lines = segLineMap[seg.id] || [];
    if (lines.length === 0) {
      segLines.push(L.polyline(coords, { color: '#444', weight: 1.5, opacity: 0.35 }));
    } else if (lines.length === 1) {
      segLines.push(L.polyline(coords, { color: lines[0].color || '#888', weight: 2.5, opacity: 0.5 }));
    } else {
      // Multi-line corridor: stack faintly (no offset) — emphasis is on vehicles.
      lines.forEach(grp => {
        segLines.push(L.polyline(coords, { color: grp.color || '#888', weight: 2.5, opacity: 0.35 }));
      });
    }
  }
  _animLayers.segments = L.layerGroup(segLines).addTo(_animMap);
}

// ---- vehicle markers ----
function _animRenderTrains() {
  if (!_animMap || !_animLayers || !_animLayers.trains) return;
  if (!_animState.tabActive) return;

  const seen = new Set();
  for (const a of _animState.activeCache) {
    let ll = null, bearing = 0;
    if (a.kind === 'dwell') {
      const n = getNode(a.nodeId);
      if (n && n.lat != null && n.lon != null) ll = [n.lat, n.lon];
    } else if (a.kind === 'move') {
      const seg = findSeg(a.fromNodeId, a.toNodeId);
      if (seg) {
        const r = _animPositionOnSeg(seg, a.fromNodeId, a.t);
        if (r) { ll = r.ll; bearing = r.bearing; }
      }
    }
    if (!ll) continue;
    seen.add(a.depId);
    let m = _animState.markers.get(a.depId);
    const color = _animLineColor(a.groupId);
    const isDwell = (a.kind === 'dwell');
    if (!m) {
      const icon = L.divIcon({
        html: _animVehicleIconHTML(color, isDwell, bearing),
        className: 'anim-vehicle-icon',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      m = L.marker(ll, { icon, interactive: true, keyboard: false });
      m._depId = a.depId;
      m._isDwell = isDwell;
      m._color = color;
      m._bearing = bearing;
      // Bind popup once with placeholder content. Leaflet's default click
      // handler toggles the popup; popupopen fills in fresh content. Avoids
      // the re-open bug from our previous custom click handler fighting
      // Leaflet's internal popup-toggle.
      m.bindPopup('', { className: 'map-popup', maxWidth: 280, autoPan: false });
      m.on('popupopen', () => {
        m.setPopupContent(_animVehiclePopupHTML(m._depId));
        _animOpenPopupDepId = m._depId;
        _animLastPopupRefresh = performance.now();
        _animHighlightGeoRoute(m._depId);
      });
      m.on('popupclose', () => {
        if (_animOpenPopupDepId === m._depId) {
          _animOpenPopupDepId = null;
          _animHighlightGeoRoute(null);
        }
      });
      m.bindTooltip('', {
        sticky: true, direction: 'top', offset: [0, -10], opacity: 0.95,
        className: 'anim-vehicle-tooltip',
      });
      m.on('mouseover', () => { try { m.setTooltipContent(_animVehicleTooltipHTML(m._depId)); } catch (e) {} });
      m.addTo(_animLayers.trains);
      _animState.markers.set(a.depId, m);
    } else {
      m.setLatLng(ll);
      const colorChanged = m._color !== color;
      const stateChanged = m._isDwell !== isDwell;
      if (colorChanged || stateChanged) {
        // Rebuild icon — state or color swap touches multiple SVG attrs at once.
        m.setIcon(L.divIcon({
          html: _animVehicleIconHTML(color, isDwell, bearing),
          className: 'anim-vehicle-icon',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }));
        m._color = color;
        m._isDwell = isDwell;
        m._bearing = bearing;
      } else if (!isDwell && Math.abs((m._bearing || 0) - bearing) > 1) {
        // Just rotation: tweak the polygon's transform via direct DOM access.
        const el = m.getElement && m.getElement();
        if (el) {
          const poly = el.querySelector('polygon');
          if (poly) poly.setAttribute('transform', `rotate(${bearing.toFixed(1)})`);
        }
        m._bearing = bearing;
      }
    }
  }
  for (const [id, m] of _animState.markers) {
    if (!seen.has(id)) {
      _animLayers.trains.removeLayer(m);
      _animState.markers.delete(id);
    }
  }
}

// SVG icon HTML for a geo vehicle marker. Triangle for moving (rotated to bearing),
// circle for dwelling. Same visual mass for both shapes — at-a-glance size match.
function _animVehicleIconHTML(color, isDwell, bearing) {
  if (isDwell) {
    return `<svg width="26" height="26" viewBox="-13 -13 26 26"><circle cx="0" cy="0" r="9" fill="${color}" stroke="#fff" stroke-width="2.5"/></svg>`;
  }
  return `<svg width="26" height="26" viewBox="-13 -13 26 26"><polygon points="12,0 -6,-9 -6,9" fill="${color}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" transform="rotate(${(bearing || 0).toFixed(1)})"/></svg>`;
}

// Past route is rendered at full opacity in a desaturated version of the
// line color, so it's always visible and doesn't visually overlap the
// network. Future route stays at the bright original color, slightly
// translucent so the network can hint through.
const _ANIM_HIGHLIGHT_OPACITY_PAST = 1.0;
const _ANIM_HIGHLIGHT_OPACITY_FUTURE = 0.9;
const _ANIM_HIGHLIGHT_DESAT = 0.55;  // 0 = no change, 1 = fully gray

// Mix a hex color toward its perceived-grayscale equivalent. Returns hex.
function _animDesaturate(hex) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  const h = (hex.length === 4) ? ('#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]) : hex;
  if (h.length < 7) return hex;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  const lum = 0.3 * r + 0.59 * g + 0.11 * b;
  const mix = _ANIM_HIGHLIGHT_DESAT;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = clamp(r + (lum - r) * mix);
  const ng = clamp(g + (lum - g) * mix);
  const nb = clamp(b + (lum - b) * mix);
  return '#' + [nr, ng, nb].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Resolve a dep's current progress into the route — what physical-segment
// index it's on (or dwelling at), the t along that segment, and the effective
// minute (with yesterday-wrap baked in). Used by both geo and schem highlighters.
function _animTrainProgressIn(dep, depId) {
  const active = _animState.activeCache.find(a => a.depId === depId);
  if (!active) return { idx: -1, t: 0, kind: null, effMin: null };
  if (active.kind === 'move') {
    for (let k = 0; k < dep.times.length - 1; k++) {
      if (dep.times[k].nodeId === active.fromNodeId && dep.times[k + 1].nodeId === active.toNodeId) {
        return { idx: k, t: active.t || 0, kind: 'move', effMin: active.effMin };
      }
    }
    return { idx: -1, t: 0, kind: 'move', effMin: active.effMin };
  }
  for (let k = 0; k < dep.times.length; k++) {
    if (dep.times[k].nodeId === active.nodeId) return { idx: k, t: 0, kind: 'dwell', effMin: active.effMin };
  }
  return { idx: -1, t: 0, kind: 'dwell', effMin: active.effMin };
}

// Split a geomap segment's directed coords at parameter t along its
// cumulative-haversine length. Returns { past, future } as [lat,lng] arrays.
function _animSplitGeoCoordsAtT(seg, fromNodeId, t) {
  const { coords, cum, totalKm } = _animCumDist(seg, fromNodeId);
  if (!coords.length) return null;
  const tt = Math.max(0, Math.min(1, t));
  if (tt <= 0) return { past: [], future: coords.slice() };
  if (tt >= 1) return { past: coords.slice(), future: [] };
  const target = totalKm * tt;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= target) lo = mid; else hi = mid - 1;
  }
  if (lo >= coords.length - 1) return { past: coords.slice(), future: [] };
  const segLen = cum[lo + 1] - cum[lo];
  const u = segLen > 0 ? (target - cum[lo]) / segLen : 0;
  const splitPoint = [
    coords[lo][0] + (coords[lo + 1][0] - coords[lo][0]) * u,
    coords[lo][1] + (coords[lo + 1][1] - coords[lo][1]) * u,
  ];
  return {
    past: coords.slice(0, lo + 1).concat([splitPoint]),
    future: [splitPoint].concat(coords.slice(lo + 1)),
  };
}

// Highlight a service's full route on the geomap, with past portion desaturated.
// Re-rendered at the same 4 Hz cadence as the popup so the past/future boundary
// keeps pace with the moving vehicle.
function _animHighlightGeoRoute(depId) {
  if (!_animLayers || !_animLayers.highlight) return;
  _animLayers.highlight.clearLayers();
  if (!depId) return;
  const dep = data.departures.find(d => d.id === depId);
  if (!dep) return;
  const svc = getSvc(dep.serviceId); if (!svc) return;
  const grp = svc.groupId ? getGroup(svc.groupId) : null;
  const color = grp?.color || '#fff';

  const prog = _animTrainProgressIn(dep, depId);
  const futureColor = color;
  const pastColor = _animDesaturate(color);

  const drawLine = (coords, c, opacity) => {
    if (!coords || coords.length < 2) return;
    L.polyline(coords, {
      color: c, weight: 7, opacity, lineCap: 'round', lineJoin: 'round', interactive: false,
    }).addTo(_animLayers.highlight);
  };

  for (let i = 0; i < svc.stops.length - 1; i++) {
    const seg = findSeg(svc.stops[i].nodeId, svc.stops[i + 1].nodeId);
    if (!seg) continue;
    const coords = segmentCoordsDirected(seg, svc.stops[i].nodeId);
    if (!coords || coords.length < 2) continue;

    let isPast = false, isFuture = false, isCurrent = false;
    if (prog.idx < 0) isFuture = true;
    else if (prog.kind === 'move') {
      if (i < prog.idx) isPast = true;
      else if (i > prog.idx) isFuture = true;
      else isCurrent = true;
    } else {
      if (i < prog.idx) isPast = true;
      else isFuture = true;
    }

    if (isCurrent) {
      const split = _animSplitGeoCoordsAtT(seg, svc.stops[i].nodeId, prog.t);
      if (split) {
        drawLine(split.past, pastColor, _ANIM_HIGHLIGHT_OPACITY_PAST);
        drawLine(split.future, futureColor, _ANIM_HIGHLIGHT_OPACITY_FUTURE);
      } else {
        drawLine(coords, futureColor, _ANIM_HIGHLIGHT_OPACITY_FUTURE);
      }
    } else if (isPast) {
      drawLine(coords, pastColor, _ANIM_HIGHLIGHT_OPACITY_PAST);
    } else {
      drawLine(coords, futureColor, _ANIM_HIGHLIGHT_OPACITY_FUTURE);
    }
  }
}

function _animClearTrains() {
  if (_animLayers && _animLayers.trains) _animLayers.trains.clearLayers();
  _animState.markers.clear();
}

// ---- vehicle interaction (click → popup, hover → tooltip) ----
// Tracks which vehicle's popup is currently open so animTick can refresh
// its content as state advances (phase transitions, ETA countdown).
let _animOpenPopupDepId = null;
let _animLastPopupRefresh = 0;

// Snapshot the current state of a dep for popup/tooltip rendering. The
// "next station" reported here SKIPS pass-through stops, so a train on
// approach to a non-stopping station correctly shows the next actual stop.
// Returns { dep, svc, grp, phase, currentNodeId, nextNodeId, eventTime,
// segFromIdx, sm } or null.
function _animVehicleInfo(depId) {
  const dep = data.departures.find(d => d.id === depId);
  if (!dep) return null;
  const svc = getSvc(dep.serviceId); if (!svc) return null;
  const grp = svc.groupId ? getGroup(svc.groupId) : null;
  const active = _animState.activeCache.find(a => a.depId === depId);
  const sm = _animState.simMinute;
  let phase = 'unknown', currentNodeId = null, nextNodeId = null, eventTime = null, segFromIdx = -1;

  if (active) {
    if (active.kind === 'move') {
      phase = 'move';
      currentNodeId = active.fromNodeId;
      // Find the segment in dep.times so we know our position in the route.
      for (let i = 0; i < dep.times.length - 1; i++) {
        if (dep.times[i].nodeId === active.fromNodeId && dep.times[i + 1].nodeId === active.toNodeId) {
          segFromIdx = i;
          break;
        }
      }
      // User-facing "next station" is the next NON-pass-through stop. The
      // train still physically traverses any pass-through nodes in between.
      if (segFromIdx >= 0) {
        let nextIdx = segFromIdx + 1;
        while (nextIdx < dep.times.length && svc.stops[nextIdx]?.passThrough) nextIdx++;
        if (nextIdx < dep.times.length) {
          nextNodeId = dep.times[nextIdx].nodeId;
          eventTime = dep.times[nextIdx].arrive;
        } else {
          // Fallback: no more non-PT stops ahead — use the immediate target.
          nextNodeId = active.toNodeId;
          eventTime = dep.times[segFromIdx + 1]?.arrive;
        }
      }
    } else if (active.kind === 'dwell') {
      currentNodeId = active.nodeId;
      // Find the times[] entry; distinguish origin-lingering vs terminus-lingering vs mid-route dwell.
      for (let i = 0; i < dep.times.length; i++) {
        if (dep.times[i].nodeId !== active.nodeId) continue;
        const tt = dep.times[i];
        segFromIdx = i;
        if (i === 0 && tt.arrive == null && tt.depart != null && sm < tt.depart) {
          phase = 'origin'; eventTime = tt.depart;
        } else if (i === dep.times.length - 1 && tt.depart == null && tt.arrive != null && sm >= tt.arrive) {
          phase = 'terminus'; eventTime = tt.arrive;
        } else {
          phase = 'dwell'; eventTime = tt.depart != null ? tt.depart : tt.arrive;
        }
        break;
      }
    }
  }
  return { dep, svc, grp, phase, currentNodeId, nextNodeId, eventTime, segFromIdx, sm };
}

// Build the list of upcoming non-PT stops with arrival times. Caps at 5 entries
// total; if the route is longer, shows the first 4 + the terminus separated by
// an ellipsis row so the user always sees both the immediate horizon and the end.
function _animUpcomingStops(dep, svc, segFromIdx, phase) {
  const out = [];
  // Where to start scanning from:
  //   - move: next stop after the current segment's "from" index
  //   - dwell/origin: include the current dwell node? No — it's the current state.
  //     Skip ahead.
  //   - terminus: nothing upcoming.
  if (segFromIdx < 0 || phase === 'terminus') return out;
  const remaining = [];
  for (let i = segFromIdx + 1; i < dep.times.length; i++) {
    if (svc.stops[i]?.passThrough) continue;
    const tt = dep.times[i];
    remaining.push({ nodeId: tt.nodeId, time: tt.arrive ?? tt.depart, isTerminus: i === dep.times.length - 1 });
  }
  if (remaining.length <= 5) return remaining;
  return [
    ...remaining.slice(0, 4),
    { ellipsis: true, hidden: remaining.length - 5 },
    remaining[remaining.length - 1],
  ];
}

function _animVehiclePopupHTML(depId) {
  const info = _animVehicleInfo(depId);
  if (!info) return '<div style="padding:6px 4px;font-size:11px;color:var(--text-dim)">Vehicle info unavailable</div>';
  const { dep, svc, grp, phase, currentNodeId, nextNodeId, eventTime, segFromIdx, sm } = info;
  const lineColor = grp?.color || '#888';
  const lineName = grp?.name || '—';
  const origin = nodeDisplayName(dep.times[0].nodeId);
  const dest = nodeDisplayName(dep.times[dep.times.length - 1].nodeId);
  const fmtDelta = (m) => { const v = Math.max(0, Math.round(m)); return v === 0 ? 'now' : v + ' min'; };

  let stateHtml = '';
  if (phase === 'move' && nextNodeId && eventTime != null) {
    stateHtml = `<div style="font-size:12px;font-weight:500">Next: ${esc(nodeDisplayName(nextNodeId))} · ${toTime(eventTime)} <span style="color:var(--text-dim);font-weight:400">(${fmtDelta(eventTime - sm)})</span></div>`;
  } else if (phase === 'dwell' && currentNodeId && eventTime != null) {
    stateHtml = `<div style="font-size:12px;font-weight:500">At ${esc(nodeDisplayName(currentNodeId))} · departs ${toTime(eventTime)} <span style="color:var(--text-dim);font-weight:400">(${fmtDelta(eventTime - sm)})</span></div>`;
  } else if (phase === 'origin' && currentNodeId && eventTime != null) {
    stateHtml = `<div style="font-size:12px;font-weight:500">Boarding at ${esc(nodeDisplayName(currentNodeId))} · departs ${toTime(eventTime)} <span style="color:var(--text-dim);font-weight:400">(${fmtDelta(eventTime - sm)})</span></div>`;
  } else if (phase === 'terminus' && currentNodeId && eventTime != null) {
    stateHtml = `<div style="font-size:12px;font-weight:500">Arrived at ${esc(nodeDisplayName(currentNodeId))} @ ${toTime(eventTime)}</div>`;
  }

  // Stock line
  const stock = getStock((dep && dep.stockId) || svc.stockId);
  const stockHtml = stock ? `<div style="font-size:11px;color:var(--text-dim);margin-top:4px">${esc(stock.name)}${stock.maxSpeed ? ' · ' + stock.maxSpeed + ' km/h' : ''}${stock.traction ? ' · ' + esc(stock.traction) : ''}</div>` : '';

  // Upcoming stops
  const upcoming = _animUpcomingStops(dep, svc, segFromIdx, phase);
  let upcomingHtml = '';
  if (upcoming.length) {
    const rows = upcoming.map(u => {
      if (u.ellipsis) {
        return `<div style="font-size:11px;color:var(--text-muted);margin:2px 0;text-align:center">··· ${u.hidden} more ···</div>`;
      }
      const label = `${esc(nodeDisplayName(u.nodeId))}${u.isTerminus ? ' <span style="color:var(--text-muted);font-size:10px">terminus</span>' : ''}`;
      return `<div style="display:flex;justify-content:space-between;font-size:11px;margin:2px 0;gap:8px">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
        <span class="mono" style="color:var(--text-dim);flex-shrink:0">${u.time != null ? toTime(u.time) : '—'}</span>
      </div>`;
    }).join('');
    upcomingHtml = `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px">
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:3px">Upcoming</div>
      ${rows}
    </div>`;
  }

  return `<div style="min-width:220px;max-width:260px;font-family:var(--font-body)">
    <div style="font-weight:700;font-size:13px;margin-bottom:6px">${esc(svc.name)}</div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${lineColor};flex-shrink:0"></span>
      <span style="font-size:11px;color:var(--text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(lineName)} · ${esc(origin)} → ${esc(dest)}</span>
    </div>
    ${stateHtml}
    ${stockHtml}
    ${upcomingHtml}
    <div style="margin-top:10px"><a href="#" onclick="event.preventDefault();_animMap.closePopup();switchTab('services');showServiceDetail('${svc.id}')" style="font-size:11px;color:var(--accent);text-decoration:none">View service →</a></div>
  </div>`;
}

function _animVehicleTooltipHTML(depId) {
  const info = _animVehicleInfo(depId);
  if (!info) return '';
  const { svc, phase, currentNodeId, nextNodeId, eventTime, sm } = info;
  let line2 = '';
  if (phase === 'move' && nextNodeId && eventTime != null) {
    const eta = Math.max(0, Math.round(eventTime - sm));
    line2 = `→ ${esc(nodeDisplayName(nextNodeId))} <span style="opacity:0.6">(${eta} min)</span>`;
  } else if (phase === 'dwell' && currentNodeId) {
    line2 = `at ${esc(nodeDisplayName(currentNodeId))}`;
  } else if (phase === 'origin' && currentNodeId) {
    line2 = `boarding at ${esc(nodeDisplayName(currentNodeId))}`;
  } else if (phase === 'terminus' && currentNodeId) {
    line2 = `arrived at ${esc(nodeDisplayName(currentNodeId))}`;
  }
  return `<div style="font-size:11px;line-height:1.35"><strong>${esc(svc.name)}</strong>${line2 ? '<br>' + line2 : ''}</div>`;
}

// Refresh the open popup's content periodically so the state line, ETA
// countdown, and upcoming list keep up with sim time as the train moves.
// Throttled to 4 Hz (250ms) — fast enough that the countdown feels live,
// slow enough to avoid DOM thrash while the user reads.
function _animMaybeUpdateOpenPopup(now) {
  if (now - _animLastPopupRefresh < 250) return;
  let touched = false;
  // Geo Leaflet popup
  if (_animOpenPopupDepId != null) {
    const m = _animState.markers.get(_animOpenPopupDepId);
    if (!m || !m.isPopupOpen || !m.isPopupOpen()) {
      _animOpenPopupDepId = null;
      _animHighlightGeoRoute(null);
    } else {
      m.setPopupContent(_animVehiclePopupHTML(_animOpenPopupDepId));
      _animHighlightGeoRoute(_animOpenPopupDepId);
      touched = true;
    }
  }
  // Schem free-floating popup
  if (_animSchemPopupEl && _animSchemPopupEl.style.display === 'block') {
    const depId = _animSchemPopupEl.dataset?.depId;
    if (depId) {
      _animSchemPopupEl.innerHTML = _animVehiclePopupHTML(depId);
      _animHighlightSchemRoute(depId);
      touched = true;
    }
  }
  if (touched) _animLastPopupRefresh = now;
}

// ---- scrubber busyness heatmap ----
// Per-5-min buckets across the day (288 buckets). Each bucket counts how
// many departures are mid-route at that 5-min slot, filtered by the chosen
// simDate's schedulePattern (so the heatmap reflects what would actually run
// today). Rendered as a linear-gradient on the slider track: red = empty,
// green = busy. Cached per (simDate); invalidated on data change.
let _animBusynessCache = null;

function _animGetBusyness() {
  const date = _animState.simDate;
  if (_animBusynessCache && _animBusynessCache.date === date) return _animBusynessCache.buckets;

  const buckets = new Uint16Array(288);
  if (!data || !data.departures) {
    _animBusynessCache = { date, buckets };
    return buckets;
  }
  const yest = _animYesterday(date);

  for (const dep of data.departures) {
    if (!dep.times || dep.times.length < 2) continue;
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    const start = dep.times[0].depart;
    const end = dep.times[dep.times.length - 1].arrive;
    if (start == null || end == null) continue;

    if (!svc.schedulePattern || patternMatchesDate(svc.schedulePattern, date)) {
      const cap = Math.min(end, 1440);
      for (let m = Math.floor(start); m < cap; m++) buckets[Math.floor(m / 5)]++;
    }
    if (end > 1440) {
      if (!svc.schedulePattern || patternMatchesDate(svc.schedulePattern, yest)) {
        for (let m = Math.max(1440, Math.floor(start)); m < end; m++) buckets[Math.floor((m - 1440) / 5)]++;
      }
    }
  }

  _animBusynessCache = { date, buckets };
  return buckets;
}

function _animRenderBusyness() {
  const scr = document.getElementById('anim-scrubber');
  if (!scr) return;
  const buckets = _animGetBusyness();
  let max = 0;
  for (let i = 0; i < buckets.length; i++) if (buckets[i] > max) max = buckets[i];
  if (max === 0) { scr.style.background = 'var(--bg-input)'; return; }
  const stops = [];
  for (let i = 0; i < 288; i++) {
    const t = buckets[i] / max;
    // Hue 0 (red) → 120 (green). Sat/lightness fixed for consistent contrast on dark bg.
    const hue = Math.round(t * 120);
    const color = `hsl(${hue},65%,45%)`;
    const pct = ((i + 0.5) / 288 * 100).toFixed(2);
    stops.push(`${color} ${pct}%`);
  }
  scr.style.background = `linear-gradient(to right, ${stops.join(',')})`;
}

// ---- landmarks ----
// Picks the top landmarks by THI (defined in core.js) so junctions and termini
// reliably outrank through-stops on busy corridors. Tooltip shows name + score.
function _renderLandmarks() {
  if (!_animLayers || !_animLayers.landmarks) return;
  _animLayers.landmarks.clearLayers();
  if (typeof computeTHI !== 'function') return;

  const ranked = computeTHI();
  if (!ranked.length) return;

  const passengerStations = data.nodes.filter(n => isPassengerStop(n) && n.lat != null && n.lon != null).length;
  // Pure percentage with a small floor — no upper bound, so dense networks
  // (1000+ stations) light up many anchors instead of capping at a constant.
  const limit = Math.max(5, Math.ceil(passengerStations * 0.15));
  const landmarks = ranked.slice(0, limit);

  for (const lm of landmarks) {
    const dot = L.circleMarker([lm.node.lat, lm.node.lon], {
      radius: 3,
      fillColor: '#fff',
      fillOpacity: 0.9,
      color: '#1a1c25',
      weight: 1.5,
      interactive: false,
    });
    dot.bindTooltip(lm.dn, {
      permanent: true,
      direction: 'right',
      offset: [6, 0],
      className: 'anim-landmark-label',
    });
    dot.addTo(_animLayers.landmarks);
  }
}

function _animUpdateClockDisplay() {
  const el = document.getElementById('anim-time-display');
  if (el) {
    const m = ((Math.floor(_animState.simMinute) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    let tag = '';
    if (_animState.mode === 'fast') tag = ' ' + _animState.speedMult + '×';
    else if (_animState.mode === 'paused') tag = ' ⏸';
    el.textContent = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + tag;
  }
  const scr = document.getElementById('anim-scrubber');
  if (scr && document.activeElement !== scr) {
    scr.value = String(((Math.floor(_animState.simMinute) % 1440) + 1440) % 1440);
  }
  const dateEl = document.getElementById('anim-date');
  if (dateEl && document.activeElement !== dateEl && _animState.simDate) {
    dateEl.value = _animState.simDate;
  }
}

function _animUpdatePlayPauseButton() {
  const btn = document.getElementById('anim-play-pause');
  if (!btn) return;
  if (_animState.mode === 'paused') {
    btn.textContent = '▶';
    btn.title = 'Play';
  } else {
    btn.textContent = '⏸';
    btn.title = 'Pause';
  }
}

function animTick(now) {
  _animState.rafHandle = null;

  const wall = now || performance.now();
  const dt = Math.min(Math.max((wall - _animState.lastFrameWall) / 1000, 0), 0.5);
  _animState.lastFrameWall = wall;

  // Detect tab visibility (panel gets/loses 'active' class via switchTab).
  const panel = document.getElementById('panel-animated');
  const isActive = !!(panel && panel.classList.contains('active'));
  _animState.tabActive = isActive;

  if (_animState.mode === 'live') {
    const prevDate = _animState.simDate;
    _animState.simMinute = _animWallClockMinFloat();
    _animState.simDate = _animTodayLocal();
    if (prevDate !== _animState.simDate) _animRenderBusyness();
  } else if (_animState.mode === 'fast') {
    _animState.simMinute += dt * _animState.speedMult / 60;
    while (_animState.simMinute >= 1440) {
      _animState.simMinute -= 1440;
      _animState.simDate = _animTomorrow(_animState.simDate);
      _animRenderBusyness();
    }
  }
  // mode === 'paused': simMinute frozen; do nothing.

  // Per-frame rebuild so vehicle positions update smoothly between sim minutes
  // (and so deps entering/leaving the active set appear at the right instant).
  // Only does work when the tab is visible.
  if (isActive) {
    animBuildActive();
    _animUpdateClockDisplay();
    if (_animState.viewMode === 'schem') _animSchemRenderTrains();
    else _animRenderTrains();
    _animMaybeUpdateOpenPopup(wall);
  }

  _animState.rafHandle = requestAnimationFrame(animTick);
}

function _animStartLoop() {
  if (_animState.rafHandle != null) return;
  _animState.lastFrameWall = performance.now();
  _animState.rafHandle = requestAnimationFrame(animTick);
}

// ---- public setters ----
function animSetSpeed(n) {
  if (typeof n === 'string') n = parseInt(n, 10);
  if (!Number.isFinite(n) || n < 1) return;
  const prevMode = _animState.mode;
  if (prevMode === 'paused') {
    // Stay paused; record what the resume target should be.
    _animState.speedMult = n;
    _animState.prevMode = (n === 1) ? 'live' : 'fast';
  } else if (n === 1) {
    _animState.speedMult = 1;
    _animState.mode = 'live';
    if (prevMode !== 'live') {
      _animState.simMinute = _animWallClockMinFloat();
      _animState.simDate = _animTodayLocal();
    }
  } else {
    if (prevMode === 'live') {
      _animState.simMinute = _animWallClockMinFloat();
      _animState.simDate = _animTodayLocal();
    }
    _animState.speedMult = n;
    _animState.mode = 'fast';
  }
  if (_animState.tabActive) {
    animBuildActive();
    _animUpdateClockDisplay();
    _animUpdatePlayPauseButton();
    _animRenderTrains();
  }
}

function animSetNow() {
  _animState.mode = 'live';
  _animState.prevMode = 'live';
  _animState.speedMult = 1;
  _animState.simMinute = _animWallClockMinFloat();
  _animState.simDate = _animTodayLocal();
  const sel = document.getElementById('anim-speed');
  if (sel) sel.value = '1';
  if (_animState.tabActive) {
    animBuildActive();
    _animUpdateClockDisplay();
    _animUpdatePlayPauseButton();
    _animRenderTrains();
  }
}

function animPause() {
  if (_animState.mode === 'paused') return;
  _animState.prevMode = _animState.mode;
  _animState.mode = 'paused';
  _animUpdateClockDisplay();
  _animUpdatePlayPauseButton();
}

function animPlay() {
  if (_animState.mode !== 'paused') return;
  // Resume into the prior mode. Live snaps back to wall-clock; fast stays
  // anchored at the paused-at simMinute and advances from there.
  if (_animState.prevMode === 'live' || _animState.speedMult === 1) {
    _animState.mode = 'live';
    _animState.simMinute = _animWallClockMinFloat();
    _animState.simDate = _animTodayLocal();
  } else {
    _animState.mode = 'fast';
  }
  if (_animState.tabActive) {
    animBuildActive();
    _animUpdateClockDisplay();
    _animUpdatePlayPauseButton();
    _animRenderTrains();
  }
}

function animTogglePlayPause() {
  if (_animState.mode === 'paused') animPlay();
  else animPause();
}

// Scrubber input (drag the day timeline). Setting a specific moment is
// implicitly an "I want to look at THIS time" gesture, so we drop into
// paused mode if currently live (live keeps auto-tracking, which would
// fight the scrub). Fast mode keeps its anchor at the new simMinute and
// continues advancing — like rewinding/fast-forwarding a video.
function animScrubberInput(val) {
  const min = parseInt(val, 10);
  if (!Number.isFinite(min) || min < 0 || min > 1439) return;
  if (_animState.mode === 'live') {
    _animState.prevMode = 'live';
    _animState.mode = 'paused';
  }
  _animState.simMinute = min;
  if (_animState.tabActive) {
    animBuildActive();
    _animUpdateClockDisplay();
    _animUpdatePlayPauseButton();
    _animRenderTrains();
  }
}

// Date input. Picking a non-today date drops live mode (live auto-tracks
// today's wall-clock date) but otherwise leaves play state alone — so
// you can preview e.g. a Wednesday's schedule on a Tuesday by picking the
// Wednesday date and scrubbing through the day. `schedulePattern` (days,
// dateRanges, specificDates, excludeDates) is evaluated against this date.
function animSetDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return;
  if (_animState.mode === 'live') {
    _animState.prevMode = 'live';
    _animState.mode = 'paused';
  }
  _animState.simDate = dateStr;
  _animRenderBusyness();
  if (_animState.tabActive) {
    animBuildActive();
    _animUpdateClockDisplay();
    _animUpdatePlayPauseButton();
    _animRenderTrains();
  }
}

function animFitBounds() {
  if (_animState.viewMode === 'schem') { _animSchemFitBounds(); return; }
  if (!_animMap) return;
  const coords = data.nodes.filter(n => n.lat != null && n.lon != null).map(n => [n.lat, n.lon]);
  if (coords.length === 0) { toast(t('toast.no_coords'), 'error'); return; }
  if (coords.length === 1) { _animMap.setView(coords[0], 14); return; }
  _animMap.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
}

function animToggleTiles() {
  if (!_animMap) return;
  const checked = document.getElementById('anim-tiles-toggle')?.checked;
  _animState.tilesOn = !!checked;
  if (checked && _animTileLayer) _animTileLayer.addTo(_animMap);
  else if (_animTileLayer) _animMap.removeLayer(_animTileLayer);
}

// ---- map init / lifecycle ----
function initAnimatedMap() {
  const container = document.getElementById('animated-map');
  if (!container) return;
  if (_animMap) { _animMap.remove(); _animMap = null; }

  _animMap = L.map('animated-map', {
    zoomControl: true,
    attributionControl: false,
  }).setView([0, 0], 3);

  _animTileLayer = L.tileLayer('https://tile.opengeofiction.net/ogf-carto/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenGeofiction',
  });
  if (_animState.tilesOn) _animTileLayer.addTo(_animMap);

  _animLayers.segments = null;
  _animLayers.landmarks = L.layerGroup().addTo(_animMap);
  _animLayers.highlight = L.layerGroup().addTo(_animMap);
  _animLayers.trains = L.layerGroup().addTo(_animMap);
  _animState.markers.clear();
  _animState.cumDistCache.clear();
  _animState.ready = true;

  renderAnimatedNetwork();
  _renderLandmarks();
  _animRenderSchemFull();
  _animSchemAttachEvents();
  _animRenderBusyness();

  // Initial fit to network bounds.
  const coords = data.nodes.filter(n => n.lat != null && n.lon != null).map(n => [n.lat, n.lon]);
  if (coords.length >= 2) _animMap.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
  else if (coords.length === 1) _animMap.setView(coords[0], 14);

  animOnTabShow();
  _animStartLoop();
}

// Called by switchTab when the animated tab is opened (after first init).
function animOnTabShow() {
  _animState.tabActive = true;
  // Snap live mode to current wall-clock when re-entering.
  if (_animState.mode === 'live') {
    _animState.simMinute = _animWallClockMinFloat();
    _animState.simDate = _animTodayLocal();
  }
  animBuildActive();
  _animUpdateClockDisplay();
  _animUpdatePlayPauseButton();
  if (_animState.viewMode === 'schem') {
    if (!_animSchem.bounds) _animSchemFitBounds();
    _animSchemRenderTrains();
  } else {
    if (_animMap) setTimeout(() => _animMap.invalidateSize(), 0);
    _animRenderTrains();
  }
}

// ---- hooks called by other modules ----
function animOnDataChange() {
  _animState.cumDistCache.clear();
  _animSchem.routeCache.clear();
  _animSchem.bounds = null;
  _animBusynessCache = null;
  if (_animState.ready) {
    renderAnimatedNetwork();
    _renderLandmarks();
    _animRenderSchemFull();
    _animRenderBusyness();
    if (_animState.tabActive) {
      animBuildActive();
      if (_animState.viewMode === 'schem') _animSchemRenderTrains();
      else _animRenderTrains();
    }
  }
}

// ============================================================
// SCHEMATIC VIEW — drawn from data.beckmap.lineStations into our own SVG.
// Independent pan/zoom (separate from the editor's _schemState). Reuses the
// sim clock + active-set + popup HTML from the geo path so the same vehicle
// state is rendered on a different layout.
// ============================================================

function _animSchemBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ls = data.beckmap?.lineStations || {};
  for (const gid in ls) {
    for (const nid in ls[gid]) {
      const c = ls[gid][nid];
      const x = c.gx * SCHEM_CELL, y = c.gy * SCHEM_CELL;
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

function _animSchemUpdateTransform() {
  const vp = document.getElementById('animated-schem-vp');
  if (!vp) return;
  vp.setAttribute('transform', `translate(${_animSchem.panX} ${_animSchem.panY}) scale(${_animSchem.zoom})`);
}

function _animSchemFitBounds() {
  const svg = document.getElementById('animated-schem');
  if (!svg) return;
  const bounds = _animSchemBounds();
  if (!bounds) return;
  const w = svg.clientWidth || 800;
  const h = svg.clientHeight || 600;
  const PAD = 60;
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const zoomX = (w - 2 * PAD) / bw;
  const zoomY = (h - 2 * PAD) / bh;
  _animSchem.zoom = Math.min(Math.max(zoomX, 0.1), Math.max(zoomY, 0.1), 4);
  _animSchem.panX = w / 2 - (bounds.minX + bw / 2) * _animSchem.zoom;
  _animSchem.panY = h / 2 - (bounds.minY + bh / 2) * _animSchem.zoom;
  _animSchem.bounds = bounds;
  _animSchemUpdateTransform();
}

// Render the full styled schematic by reusing the editor's renderSchematic
// pipeline — same routes, station marks, blobs, ISI/OSI, labels, segment
// styles, mode-driven defaults. We render at world coords (zoom=1, view=0,0)
// into our base <g>, then apply our independent pan/zoom via the parent
// vp transform. Edit-only state (selections, drag handles, debug) is cleared
// for the duration so no editor chrome leaks into the animated view.
function _animRenderSchemFull() {
  const baseG = document.getElementById('animated-schem-base');
  const animSvg = document.getElementById('animated-schem');
  if (!baseG || !animSvg || typeof renderSchematic !== 'function' || typeof _schemState === 'undefined') return;

  const w = animSvg.clientWidth || 1200;
  const h = animSvg.clientHeight || 800;

  const saved = _schemState;
  // Shallow clone, force read-only render parameters.
  _schemState = Object.assign({}, saved, {
    zoom: 1, viewX: 0, viewY: 0,
    debug: false,
    selectedRoute: null, selectedLine: null,
    selectedStation: null, selectedConn: null,
    bendEditing: false, bendDrag: null,
    lsDrag: null, sidebarDrag: null, ghostPos: null,
  });
  try {
    renderSchematic(baseG, { w, h }, { noGrid: true });
  } finally {
    _schemState = saved;
  }
}

// Cached cell-route + cumulative pixel distance for a line edge.
function _animSchemRouteEntry(groupId, fromNodeId, toNodeId) {
  const key = `${groupId}|${fromNodeId}|${toNodeId}`;
  if (_animSchem.routeCache.has(key)) return _animSchem.routeCache.get(key);
  const ls = data.beckmap?.lineStations?.[groupId];
  if (!ls) { _animSchem.routeCache.set(key, null); return null; }
  const from = ls[fromNodeId], to = ls[toNodeId];
  if (!from || !to) { _animSchem.routeCache.set(key, null); return null; }
  let cells;
  if (typeof schemRouteWithBends === 'function' && typeof schemEdgeKey === 'function' && typeof schemGetBends === 'function') {
    const ek = schemEdgeKey(fromNodeId, toNodeId);
    const bends = schemGetBends(groupId, ek);
    const canonical = ek.split('|');
    const reversed = fromNodeId !== canonical[0];
    const orderedBends = (bends && reversed) ? [...bends].reverse() : bends;
    cells = schemRouteWithBends(from, to, orderedBends);
  } else if (typeof schemRouteLeg === 'function') {
    cells = schemRouteLeg(from.gx, from.gy, to.gx, to.gy);
  } else {
    cells = [from, to];
  }
  if (!cells || cells.length < 2) { _animSchem.routeCache.set(key, null); return null; }
  const cum = [0];
  for (let i = 1; i < cells.length; i++) {
    const dx = (cells[i].gx - cells[i - 1].gx) * SCHEM_CELL;
    const dy = (cells[i].gy - cells[i - 1].gy) * SCHEM_CELL;
    cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const entry = { cells, cum, totalPx: cum[cum.length - 1] };
  _animSchem.routeCache.set(key, entry);
  return entry;
}

function _animSchemCellAngle(a, b) {
  const dx = b.gx - a.gx, dy = b.gy - a.gy;
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function _animPositionOnSchemSeg(groupId, fromNodeId, toNodeId, t) {
  const entry = _animSchemRouteEntry(groupId, fromNodeId, toNodeId);
  if (!entry) return null;
  if (entry.totalPx === 0) {
    return { x: entry.cells[0].gx * SCHEM_CELL, y: entry.cells[0].gy * SCHEM_CELL, angle: 0 };
  }
  const target = entry.totalPx * Math.max(0, Math.min(1, t));
  let lo = 0, hi = entry.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (entry.cum[mid] <= target) lo = mid; else hi = mid - 1;
  }
  let cellA, cellB, x, y;
  if (lo >= entry.cells.length - 1) {
    cellA = entry.cells[Math.max(0, entry.cells.length - 2)];
    cellB = entry.cells[entry.cells.length - 1];
    x = cellB.gx * SCHEM_CELL;
    y = cellB.gy * SCHEM_CELL;
  } else {
    cellA = entry.cells[lo];
    cellB = entry.cells[lo + 1];
    const segLen = entry.cum[lo + 1] - entry.cum[lo];
    const u = segLen > 0 ? (target - entry.cum[lo]) / segLen : 0;
    x = (cellA.gx + (cellB.gx - cellA.gx) * u) * SCHEM_CELL;
    y = (cellA.gy + (cellB.gy - cellA.gy) * u) * SCHEM_CELL;
  }
  return { x, y, angle: _animSchemCellAngle(cellA, cellB) };
}

// Walk a dep.times chain to find the surrounding placed stations bracketing a
// non-placed node (junction / waypoint / pass-through). Returns either a
// world-coord position interpolated along the placed leg, or the cell of the
// nearest placed neighbour if there's only one side.
function _animSchemMovePos(a, ls) {
  const dep = data.departures.find(d => d.id === a.depId);
  if (!dep) return null;
  // Find current physical segment index in dep.times.
  let i = -1;
  for (let k = 0; k < dep.times.length - 1; k++) {
    if (dep.times[k].nodeId === a.fromNodeId && dep.times[k + 1].nodeId === a.toNodeId) { i = k; break; }
  }
  if (i < 0) return null;
  // Walk back from i to the last placed station; walk forward from i+1 to the next placed station.
  let iA = i;
  while (iA >= 0 && !ls[dep.times[iA].nodeId]) iA--;
  let iB = i + 1;
  while (iB < dep.times.length && !ls[dep.times[iB].nodeId]) iB++;
  if (iA < 0 && iB >= dep.times.length) return null;
  if (iA < 0) {
    const c = ls[dep.times[iB].nodeId];
    return { x: c.gx * SCHEM_CELL, y: c.gy * SCHEM_CELL };
  }
  if (iB >= dep.times.length) {
    const c = ls[dep.times[iA].nodeId];
    return { x: c.gx * SCHEM_CELL, y: c.gy * SCHEM_CELL };
  }
  const placedFromId = dep.times[iA].nodeId;
  const placedToId = dep.times[iB].nodeId;
  if (placedFromId === placedToId) {
    const c = ls[placedFromId];
    return { x: c.gx * SCHEM_CELL, y: c.gy * SCHEM_CELL };
  }
  const fromTime = dep.times[iA].depart;
  const toTime = dep.times[iB].arrive;
  if (fromTime == null || toTime == null) {
    const c = ls[placedFromId];
    return { x: c.gx * SCHEM_CELL, y: c.gy * SCHEM_CELL };
  }
  const span = toTime - fromTime;
  const tLeg = span > 0 ? Math.max(0, Math.min(1, (a.effMin - fromTime) / span)) : 0;
  return _animPositionOnSchemSeg(a.groupId, placedFromId, placedToId, tLeg);
}

// Dwell at a non-placed node (junction with explicit dwell, etc.) — fall back
// to the nearest placed neighbour so the train doesn't disappear.
function _animSchemDwellPos(a, ls) {
  const dep = data.departures.find(d => d.id === a.depId);
  if (!dep) return null;
  let i = -1;
  for (let k = 0; k < dep.times.length; k++) {
    if (dep.times[k].nodeId === a.nodeId) { i = k; break; }
  }
  if (i < 0) return null;
  let iA = i;
  while (iA >= 0 && !ls[dep.times[iA].nodeId]) iA--;
  if (iA >= 0) {
    const c = ls[dep.times[iA].nodeId];
    return { x: c.gx * SCHEM_CELL, y: c.gy * SCHEM_CELL };
  }
  let iB = i + 1;
  while (iB < dep.times.length && !ls[dep.times[iB].nodeId]) iB++;
  if (iB < dep.times.length) {
    const c = ls[dep.times[iB].nodeId];
    return { x: c.gx * SCHEM_CELL, y: c.gy * SCHEM_CELL };
  }
  return null;
}

function _animSchemRenderTrains() {
  const layer = document.getElementById('animated-schem-trains');
  if (!layer) return;
  if (!_animState.tabActive || _animState.viewMode !== 'schem') return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const seen = new Set();
  for (const a of _animState.activeCache) {
    if (!a.groupId) continue;
    const ls = data.beckmap?.lineStations?.[a.groupId];
    if (!ls) continue;
    let pos = null;
    if (a.kind === 'dwell') {
      if (ls[a.nodeId]) pos = { x: ls[a.nodeId].gx * SCHEM_CELL, y: ls[a.nodeId].gy * SCHEM_CELL, angle: 0 };
      else pos = _animSchemDwellPos(a, ls);
    } else if (a.kind === 'move') {
      pos = _animSchemMovePos(a, ls);
    }
    if (!pos) continue;
    seen.add(a.depId);
    let g = _animSchem.trainNodes.get(a.depId);
    const color = _animLineColor(a.groupId);
    const isDwell = (a.kind === 'dwell');
    const angle = pos.angle || 0;
    if (!g) {
      // Each train is a <g> with both circle and polygon — one shown, one hidden.
      // Cheap visibility-toggle on state change, no element swap.
      g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'anim-schem-train');
      g.dataset.depId = a.depId;
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', '0'); circle.setAttribute('cy', '0');
      circle.setAttribute('r', '9');
      circle.setAttribute('fill', color); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '2.5');
      circle.style.display = isDwell ? '' : 'none';
      g.appendChild(circle);
      const poly = document.createElementNS(SVG_NS, 'polygon');
      poly.setAttribute('points', '12,0 -6,-9 -6,9');
      poly.setAttribute('fill', color); poly.setAttribute('stroke', '#fff'); poly.setAttribute('stroke-width', '2.5');
      poly.setAttribute('stroke-linejoin', 'round');
      poly.style.display = isDwell ? 'none' : '';
      g.appendChild(poly);
      g.addEventListener('click', _animSchemOnTrainClick);
      g.addEventListener('mouseenter', _animSchemOnTrainHover);
      g.addEventListener('mousemove', _animSchemOnTrainHover);
      g.addEventListener('mouseleave', _animSchemOnTrainOut);
      layer.appendChild(g);
      _animSchem.trainNodes.set(a.depId, g);
      g._color = color;
      g._isDwell = isDwell;
    } else {
      if (g._color !== color) {
        const circle = g.firstChild;
        const poly = g.lastChild;
        if (circle) circle.setAttribute('fill', color);
        if (poly) poly.setAttribute('fill', color);
        g._color = color;
      }
      if (g._isDwell !== isDwell) {
        const circle = g.firstChild;
        const poly = g.lastChild;
        if (circle) circle.style.display = isDwell ? '' : 'none';
        if (poly) poly.style.display = isDwell ? 'none' : '';
        g._isDwell = isDwell;
      }
    }
    const xform = isDwell
      ? `translate(${pos.x},${pos.y})`
      : `translate(${pos.x},${pos.y}) rotate(${angle.toFixed(1)})`;
    g.setAttribute('transform', xform);
  }
  for (const [id, node] of _animSchem.trainNodes) {
    if (!seen.has(id)) {
      node.remove();
      _animSchem.trainNodes.delete(id);
    }
  }
}

// Split a cell-route entry at parameter t. Returns { past, future } as cell arrays.
function _animSplitSchemCellsAtT(entry, t) {
  const { cells, cum, totalPx } = entry;
  if (!cells || cells.length < 2) return null;
  const tt = Math.max(0, Math.min(1, t));
  if (tt <= 0) return { past: [], future: cells.slice() };
  if (tt >= 1) return { past: cells.slice(), future: [] };
  const target = totalPx * tt;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= target) lo = mid; else hi = mid - 1;
  }
  if (lo >= cells.length - 1) return { past: cells.slice(), future: [] };
  const segLen = cum[lo + 1] - cum[lo];
  const u = segLen > 0 ? (target - cum[lo]) / segLen : 0;
  const a = cells[lo], b = cells[lo + 1];
  const splitCell = { gx: a.gx + (b.gx - a.gx) * u, gy: a.gy + (b.gy - a.gy) * u };
  return {
    past: cells.slice(0, lo + 1).concat([splitCell]),
    future: [splitCell].concat(cells.slice(lo + 1)),
  };
}

// Highlight a service's full route on the schematic with past/future split.
// Walks dep.times for placed stops (skipping junctions/waypoints/non-placed
// pass-throughs); for the placed leg containing the train, splits the cells
// at tLeg in time-space (using effMin against placed-from depart and placed-to
// arrive — the same math `_animSchemMovePos` uses for vehicle position).
function _animHighlightSchemRoute(depId) {
  const layer = document.getElementById('animated-schem-highlight');
  if (!layer) return;
  layer.innerHTML = '';
  if (!depId) return;
  const dep = data.departures.find(d => d.id === depId);
  if (!dep) return;
  const svc = getSvc(dep.serviceId);
  if (!svc || !svc.groupId) return;
  const grp = getGroup(svc.groupId);
  const color = grp?.color || '#000';
  const ls = data.beckmap?.lineStations?.[svc.groupId];
  if (!ls) return;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const prog = _animTrainProgressIn(dep, depId);
  const futureColor = color;
  const pastColor = _animDesaturate(color);

  const placedIdx = [];
  for (let i = 0; i < dep.times.length; i++) {
    if (ls[dep.times[i].nodeId]) placedIdx.push(i);
  }

  const renderPath = (cells, c, opacity) => {
    if (!cells || cells.length < 2) return;
    const d = (typeof schemSmoothPath === 'function') ? schemSmoothPath(cells, 8) : null;
    if (!d) return;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', c);
    path.setAttribute('stroke-width', '8');
    path.setAttribute('stroke-opacity', String(opacity));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.style.pointerEvents = 'none';
    layer.appendChild(path);
  };

  for (let p = 0; p < placedIdx.length - 1; p++) {
    const idxA = placedIdx[p], idxB = placedIdx[p + 1];
    const fromId = dep.times[idxA].nodeId, toId = dep.times[idxB].nodeId;
    if (fromId === toId) continue;
    const entry = _animSchemRouteEntry(svc.groupId, fromId, toId);
    if (!entry || !entry.cells || entry.cells.length < 2) continue;

    let isPast = false, isFuture = false, isCurrent = false;
    if (prog.idx < 0) isFuture = true;
    else if (prog.kind === 'move') {
      if (prog.idx < idxA) isFuture = true;
      else if (prog.idx >= idxB) isPast = true;
      else isCurrent = true;
    } else {
      if (prog.idx <= idxA) isFuture = true;
      else if (prog.idx >= idxB) isPast = true;
      else isCurrent = true;
    }

    if (isCurrent) {
      const fromTime = dep.times[idxA].depart;
      const toTime = dep.times[idxB].arrive;
      let tLeg = 0;
      if (fromTime != null && toTime != null && prog.effMin != null) {
        const span = toTime - fromTime;
        tLeg = span > 0 ? Math.max(0, Math.min(1, (prog.effMin - fromTime) / span)) : 0;
      }
      const split = _animSplitSchemCellsAtT(entry, tLeg);
      if (split) {
        renderPath(split.past, pastColor, _ANIM_HIGHLIGHT_OPACITY_PAST);
        renderPath(split.future, futureColor, _ANIM_HIGHLIGHT_OPACITY_FUTURE);
      } else {
        renderPath(entry.cells, futureColor, _ANIM_HIGHLIGHT_OPACITY_FUTURE);
      }
    } else if (isPast) {
      renderPath(entry.cells, pastColor, _ANIM_HIGHLIGHT_OPACITY_PAST);
    } else {
      renderPath(entry.cells, futureColor, _ANIM_HIGHLIGHT_OPACITY_FUTURE);
    }
  }
}

// Schem popup + tooltip (free HTML overlays, since we're not in Leaflet here).
let _animSchemPopupEl = null;
let _animSchemTooltipEl = null;

function _animSchemEnsurePopup() {
  if (_animSchemPopupEl) return _animSchemPopupEl;
  const p = document.createElement('div');
  p.className = 'anim-schem-popup map-popup';
  p.style.cssText = 'position:fixed;background:var(--bg-raised);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;box-shadow:var(--shadow-lg);z-index:1500;display:none;max-width:280px;font-family:var(--font-body);font-size:13px';
  document.body.appendChild(p);
  document.addEventListener('mousedown', (ev) => {
    if (p.style.display === 'block' && !p.contains(ev.target) && !ev.target.closest?.('.anim-schem-train')) {
      p.style.display = 'none';
      _animHighlightSchemRoute(null);
    }
  });
  _animSchemPopupEl = p;
  return p;
}

function _animSchemEnsureTooltip() {
  if (_animSchemTooltipEl) return _animSchemTooltipEl;
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;background:rgba(20,22,30,0.94);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 9px;box-shadow:var(--shadow);z-index:1400;display:none;pointer-events:none;font-family:var(--font-body);font-size:11px';
  document.body.appendChild(t);
  _animSchemTooltipEl = t;
  return t;
}

function _animSchemOnTrainClick(e) {
  e.stopPropagation();
  const depId = e.currentTarget?.dataset?.depId;
  if (!depId) return;
  const popup = _animSchemEnsurePopup();
  popup.dataset.depId = depId;
  popup.innerHTML = _animVehiclePopupHTML(depId);
  popup.style.display = 'block';
  const x = e.clientX + 14, y = e.clientY + 14;
  popup.style.left = Math.min(x, window.innerWidth - 290) + 'px';
  popup.style.top = Math.min(y, window.innerHeight - 240) + 'px';
  _animHighlightSchemRoute(depId);
}

function _animSchemOnTrainHover(e) {
  const depId = e.currentTarget?.dataset?.depId;
  if (!depId) return;
  const t = _animSchemEnsureTooltip();
  t.innerHTML = _animVehicleTooltipHTML(depId);
  t.style.display = 'block';
  t.style.left = (e.clientX + 12) + 'px';
  t.style.top = (e.clientY - 30) + 'px';
}
function _animSchemOnTrainOut() {
  if (_animSchemTooltipEl) _animSchemTooltipEl.style.display = 'none';
}

// Schem pan/zoom — drag to pan, wheel to zoom (anchored at cursor).
function _animSchemOnMouseDown(e) {
  if (e.button !== 0) return;
  // Don't intercept clicks on train circles
  if (e.target?.classList?.contains?.('anim-schem-train')) return;
  _animSchem.dragging = true;
  _animSchem.dragStart = { x: e.clientX, y: e.clientY, panX: _animSchem.panX, panY: _animSchem.panY };
  document.getElementById('animated-schem')?.classList.add('dragging');
}
function _animSchemOnMouseMove(e) {
  if (!_animSchem.dragging) return;
  _animSchem.panX = _animSchem.dragStart.panX + (e.clientX - _animSchem.dragStart.x);
  _animSchem.panY = _animSchem.dragStart.panY + (e.clientY - _animSchem.dragStart.y);
  _animSchemUpdateTransform();
}
function _animSchemOnMouseUp() {
  _animSchem.dragging = false;
  document.getElementById('animated-schem')?.classList.remove('dragging');
}
function _animSchemOnWheel(e) {
  e.preventDefault();
  const svg = document.getElementById('animated-schem');
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const newZoom = Math.max(0.1, Math.min(20, _animSchem.zoom * factor));
  _animSchem.panX = cx - (cx - _animSchem.panX) * (newZoom / _animSchem.zoom);
  _animSchem.panY = cy - (cy - _animSchem.panY) * (newZoom / _animSchem.zoom);
  _animSchem.zoom = newZoom;
  _animSchemUpdateTransform();
}

function _animSchemAttachEvents() {
  const svg = document.getElementById('animated-schem');
  if (!svg || svg._animEventsAttached) return;
  svg.addEventListener('mousedown', _animSchemOnMouseDown);
  document.addEventListener('mousemove', _animSchemOnMouseMove);
  document.addEventListener('mouseup', _animSchemOnMouseUp);
  svg.addEventListener('wheel', _animSchemOnWheel, { passive: false });
  svg._animEventsAttached = true;
}

// View toggle.
function animSetView(mode) {
  if (mode !== 'geo' && mode !== 'schem') return;
  if (_animState.viewMode === mode) return;
  _animState.viewMode = mode;

  const mapEl = document.getElementById('animated-map');
  const schemEl = document.getElementById('animated-schem');
  const tilesLabel = document.getElementById('anim-tiles-label');
  const geoBtn = document.getElementById('anim-view-geo');
  const schemBtn = document.getElementById('anim-view-schem');

  if (mode === 'geo') {
    if (mapEl) mapEl.style.display = '';
    if (schemEl) schemEl.style.display = 'none';
    if (tilesLabel) tilesLabel.style.display = '';
    geoBtn?.classList.add('active');
    schemBtn?.classList.remove('active');
    if (_animMap) setTimeout(() => _animMap.invalidateSize(), 0);
  } else {
    if (mapEl) mapEl.style.display = 'none';
    if (schemEl) schemEl.style.display = '';
    if (tilesLabel) tilesLabel.style.display = 'none';
    geoBtn?.classList.remove('active');
    schemBtn?.classList.add('active');
    _animSchemAttachEvents();
    _animRenderSchemFull();
    if (!_animSchem.bounds) _animSchemFitBounds();
    else _animSchemUpdateTransform();
  }

  if (_animSchemPopupEl) _animSchemPopupEl.style.display = 'none';
  if (_animSchemTooltipEl) _animSchemTooltipEl.style.display = 'none';
  _animHighlightGeoRoute(null);
  _animHighlightSchemRoute(null);
  if (_animMap && _animMap.closePopup) _animMap.closePopup();

  if (_animState.tabActive) {
    animBuildActive();
    if (mode === 'geo') _animRenderTrains();
    else _animSchemRenderTrains();
  }
}

// Bootstrap: initial sim time so the clock display shows something sensible
// even before the tab is first opened.
_animState.simDate = _animTodayLocal();
_animState.simMinute = _animWallClockMinFloat();
