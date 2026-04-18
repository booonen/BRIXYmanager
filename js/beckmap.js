// ============================================================
// RAILMAP (SVG) — v3: grid + per-line stations, derived routes
// ============================================================
const SCHEM_CELL = 10;

const SCHEM_STYLES = ['full', 'punched', 'dashed', 'double', 'dotted', 'arrows', 'hidden'];

let _schemState = {
  viewX: 0, viewY: 0, zoom: 1,
  dragging: false, dragStartX: 0, dragStartY: 0, viewStartX: 0, viewStartY: 0,
  lsDrag: null,       // { groupId, nodeId, startGx, startGy }
  sidebarDrag: null,  // { groupId, nodeId }
  ghostPos: null,     // { x, y } pixel
  debug: false,
  selectedRoute: null, // { groupId, edgeKey, fromId, toId }
  selectedLine: null,  // groupId — line context menu
  selectedStation: null, // { nodeId, groupId } — station context menu
  selectedConn: null,    // { edgeKey, segId, fromNid, toNid, type } — ISI/OSI context menu
  bendEditing: false,  // bend editing sub-mode
  bendDrag: null,      // { bendIdx }
  initialized: false
};

// ---- Initialization ----

function initSchematic() {
  if (_schemState.initialized) return;
  _schemState.initialized = true;
  schemMigrateData();

  const wrap = document.getElementById('schem-canvas-wrap');
  const svg = document.getElementById('schem-svg');
  if (!wrap || !svg) return;

  wrap.addEventListener('pointerdown', e => {
    if (e.button === 2) return;
    if (_schemState.sidebarDrag || _schemState.lsDrag) return;

    const wRect = wrap.getBoundingClientRect();
    const wx = (e.clientX - wRect.left - _schemState.viewX) / _schemState.zoom;
    const wy = (e.clientY - wRect.top - _schemState.viewY) / _schemState.zoom;

    // Priority 0: guide hit target (SVG-based, when in bend editing mode)
    if (_schemState.bendEditing && (_schemState.selectedRoute || _schemState.selectedConn)) {
      const guideTarget = e.target.closest('.schem-guide-hit');
      if (guideTarget) {
        // Determine which group/edgeKey to use for bends
        const bendGroupId = _schemState.selectedRoute ? _schemState.selectedRoute.groupId : 'isiosi';
        const bendEdgeKey = _schemState.selectedRoute ? _schemState.selectedRoute.edgeKey : _schemState.selectedConn.edgeKey;
        const bi = guideTarget.dataset.bi;
        const isLesser = guideTarget.dataset.lesser === '1';
        const gx = parseInt(guideTarget.dataset.gx), gy = parseInt(guideTarget.dataset.gy);

        if (bi != null && !isLesser) {
          // Existing explicit bend — start drag
          _schemState.bendDrag = { bendIdx: parseInt(bi) };
          wrap.style.cursor = 'grabbing';
        } else {
          // Creation dot or auto-vertex — promote to bend (no drag)
          schemAddBend(bendGroupId, bendEdgeKey, gx, gy);
          save();
        }
        renderSchematic();
        e.preventDefault();
        return;
      }
      // In bend mode but didn't click a guide — allow panning
      _schemState.dragging = true;
      _schemState.dragStartX = e.clientX;
      _schemState.dragStartY = e.clientY;
      _schemState.viewStartX = _schemState.viewX;
      _schemState.viewStartY = _schemState.viewY;
      wrap.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    // Priority 0b: bend handle drag (when a route is selected but not in edit mode)
    if (_schemState.selectedRoute && !_schemState.bendEditing) {
      const bh = schemHitTestBend(wx, wy);
      if (bh != null) {
        _schemState.bendDrag = { bendIdx: bh };
        wrap.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
    }

    // Priority 1: station mark (specific line-station or infra station)
    const markTarget = e.target.closest('.schem-mark-hit');
    if (markTarget) {
      const gid = markTarget.dataset.gid, nid = markTarget.dataset.nid;
      const pos = gid === '__infra__' ? data.beckmap.infraStations?.[nid] : data.beckmap.lineStations?.[gid]?.[nid];
      if (pos) {
        _schemState.selectedRoute = null;
        _schemState.lsDrag = { groupId: gid, nodeId: nid, startGx: pos.gx, startGy: pos.gy };
        _schemState.ghostPos = { x: pos.gx * SCHEM_CELL, y: pos.gy * SCHEM_CELL };
        wrap.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
    }
    // Priority 2: label (pick closest line-station at that node)
    // SVG tspan doesn't always support closest() — walk up manually
    let labelTarget = e.target.closest?.('.schem-label-hit') || null;
    if (!labelTarget && e.target.tagName === 'tspan') labelTarget = e.target.parentElement?.closest?.('.schem-label-hit') || e.target.parentElement;
    if (labelTarget && !labelTarget.classList?.contains('schem-label-hit')) labelTarget = null;
    if (labelTarget) {
      const nid = labelTarget.dataset.nid;
      const gid = labelTarget.dataset.gid;
      const ls = data.beckmap.lineStations || {};
      // Use the gid from the label if available, otherwise pick right-most
      let best = null;
      if (gid && ls[gid]?.[nid]) {
        const pos = ls[gid][nid];
        best = { groupId: gid, nodeId: nid, gx: pos.gx, gy: pos.gy };
      } else {
        for (const g in ls) {
          const pos = ls[g]?.[nid];
          if (pos && (!best || pos.gx > best.gx || (pos.gx === best.gx && pos.gy < best.gy))) {
            best = { groupId: g, nodeId: nid, gx: pos.gx, gy: pos.gy };
          }
        }
      }
      if (best) {
        _schemState.selectedRoute = null;
        _schemState.lsDrag = { groupId: best.groupId, nodeId: best.nodeId, startGx: best.gx, startGy: best.gy };
        _schemState.ghostPos = { x: best.gx * SCHEM_CELL, y: best.gy * SCHEM_CELL };
        wrap.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
    }

    // Priority 2.5: ISI/OSI connector click
    const connTarget = e.target.closest('.schem-conn-hit');
    if (connTarget) {
      _schemState.selectedConn = {
        edgeKey: connTarget.dataset.ek,
        segId: connTarget.dataset.sid,
        fromNid: connTarget.dataset.fn,
        toNid: connTarget.dataset.tn,
        type: connTarget.dataset.tp
      };
      _schemState.selectedRoute = null;
      _schemState.selectedLine = null;
      _schemState.selectedStation = null;
      _schemState.bendEditing = false;
      renderSchematic(); renderSchemSidebar();
      e.preventDefault();
      return;
    }

    // Priority 3: click on a line route to select it
    const hitRoute = schemHitTestRoute(wx, wy);
    if (hitRoute) {
      _schemState.selectedRoute = hitRoute;
      _schemState.selectedLine = null;
      _schemState.selectedStation = null;
      _schemState.bendEditing = false;
      renderSchematic(); renderSchemSidebar();
      e.preventDefault();
      return;
    }

    // Deselect if clicking empty space (but NOT bend editing — only exit via button/E)
    if (_schemState.selectedRoute || _schemState.selectedLine || _schemState.selectedStation || _schemState.selectedConn) {
      _schemState.selectedRoute = null;
      _schemState.selectedLine = null;
      _schemState.selectedStation = null;
      _schemState.selectedConn = null;
      _schemState.bendEditing = false;
      renderSchematic(); renderSchemSidebar();
      e.preventDefault();
      return;
    }

    _schemState.dragging = true;
    _schemState.dragStartX = e.clientX;
    _schemState.dragStartY = e.clientY;
    _schemState.viewStartX = _schemState.viewX;
    _schemState.viewStartY = _schemState.viewY;
    wrap.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('pointermove', e => {
    const wrap = document.getElementById('schem-canvas-wrap');
    if (_schemState.dragging) {
      _schemState.viewX = _schemState.viewStartX + (e.clientX - _schemState.dragStartX);
      _schemState.viewY = _schemState.viewStartY + (e.clientY - _schemState.dragStartY);
      renderSchematic();
      return;
    }
    if (_schemState.bendDrag && (_schemState.selectedRoute || _schemState.selectedConn)) {
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const wx = (e.clientX - rect.left - _schemState.viewX) / _schemState.zoom;
      const wy = (e.clientY - rect.top - _schemState.viewY) / _schemState.zoom;
      const snapped = schemGridSnap(wx, wy);
      const bendGroupId = _schemState.selectedRoute ? _schemState.selectedRoute.groupId : 'isiosi';
      const bendEdgeKey = _schemState.selectedRoute ? _schemState.selectedRoute.edgeKey : _schemState.selectedConn.edgeKey;
      const bends = data.beckmap.routeBends?.[bendGroupId]?.[bendEdgeKey];
      if (bends && bends[_schemState.bendDrag.bendIdx]) {
        bends[_schemState.bendDrag.bendIdx] = { gx: snapped.gx, gy: snapped.gy };
        _schemState.bendDrag._moved = true;
        renderSchematic();
      }
      return;
    }
    if (_schemState.lsDrag || _schemState.sidebarDrag) {
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const wx = (e.clientX - rect.left - _schemState.viewX) / _schemState.zoom;
      const wy = (e.clientY - rect.top - _schemState.viewY) / _schemState.zoom;
      const snapped = schemGridSnap(wx, wy);
      // For lsDrag: track offset from station to avoid jump-to-cursor on label drag
      if (_schemState.lsDrag) {
        if (!_schemState.lsDrag._hasOffset) {
          // First move: compute offset from cursor to station center
          const stX = _schemState.lsDrag.startGx * SCHEM_CELL;
          const stY = _schemState.lsDrag.startGy * SCHEM_CELL;
          _schemState.lsDrag._offsetX = stX - wx;
          _schemState.lsDrag._offsetY = stY - wy;
          _schemState.lsDrag._hasOffset = true;
        }
        // Apply offset so station follows relative to grab point
        const adjWx = wx + _schemState.lsDrag._offsetX;
        const adjWy = wy + _schemState.lsDrag._offsetY;
        const adjSnapped = schemGridSnap(adjWx, adjWy);
        // Don't update ghost until we've actually moved to a new cell
        if (adjSnapped.gx === _schemState.lsDrag.startGx && adjSnapped.gy === _schemState.lsDrag.startGy) return;
        _schemState.ghostPos = { x: adjSnapped.px, y: adjSnapped.py };
      } else {
        _schemState.ghostPos = { x: snapped.px, y: snapped.py };
      }
      const sidebar = document.getElementById('schem-sidebar');
      if (sidebar && _schemState.lsDrag) {
        const sbRect = sidebar.getBoundingClientRect();
        const over = e.clientX >= sbRect.left && e.clientX <= sbRect.right && e.clientY >= sbRect.top && e.clientY <= sbRect.bottom;
        sidebar.style.outline = over ? '2px dashed var(--accent)' : '';
        sidebar.style.outlineOffset = over ? '-2px' : '';
      }
      renderSchematic();
    }
  });

  window.addEventListener('pointerup', e => {
    const wrap = document.getElementById('schem-canvas-wrap');
    if (_schemState.bendDrag) {
      // Only clean bends if the user actually dragged (moved the bend)
      if (_schemState.bendDrag._moved) {
        const cgid = _schemState.selectedRoute ? _schemState.selectedRoute.groupId : 'isiosi';
        const cek = _schemState.selectedRoute ? _schemState.selectedRoute.edgeKey : _schemState.selectedConn?.edgeKey;
        if (cek) schemCleanBends(cgid, cek);
      }
      save();
      _schemState.bendDrag = null;
      if (wrap) wrap.style.cursor = '';
      renderSchematic();
      return;
    }
    if (_schemState.dragging) {
      _schemState.dragging = false;
      if (wrap) wrap.style.cursor = '';
      return;
    }
    if (_schemState.lsDrag) {
      const sidebar = document.getElementById('schem-sidebar');
      if (sidebar) { sidebar.style.outline = ''; sidebar.style.outlineOffset = ''; }
      const g = _schemState.ghostPos;
      const { groupId, nodeId } = _schemState.lsDrag;
      if (sidebar && sidebar.style.display !== 'none') {
        const sbRect = sidebar.getBoundingClientRect();
        if (e.clientX >= sbRect.left && e.clientX <= sbRect.right && e.clientY >= sbRect.top && e.clientY <= sbRect.bottom) {
          if (groupId === '__infra__') { if (data.beckmap.infraStations) delete data.beckmap.infraStations[nodeId]; }
          else if (data.beckmap.lineStations?.[groupId]) delete data.beckmap.lineStations[groupId][nodeId];
          save();
          _schemState.lsDrag = null; _schemState.ghostPos = null;
          if (wrap) wrap.style.cursor = '';
          renderSchematic(); renderSchemSidebar();
          return;
        }
      }
      if (g) {
        const newGx = Math.round(g.x / SCHEM_CELL), newGy = Math.round(g.y / SCHEM_CELL);
        // If didn't move from start position, open station context menu
        if (newGx === _schemState.lsDrag.startGx && newGy === _schemState.lsDrag.startGy) {
          _schemState.selectedStation = { nodeId, groupId };
          _schemState.selectedRoute = null;
          _schemState.selectedLine = null;
          _schemState.bendEditing = false;
        } else {
          if (groupId === '__infra__') {
            if (!data.beckmap.infraStations) data.beckmap.infraStations = {};
            data.beckmap.infraStations[nodeId] = { gx: newGx, gy: newGy };
          } else {
            data.beckmap.lineStations[groupId][nodeId] = { gx: newGx, gy: newGy };
          }
          save();
        }
      }
      _schemState.lsDrag = null; _schemState.ghostPos = null;
      if (wrap) wrap.style.cursor = '';
      renderSchematic(); renderSchemSidebar();
      return;
    }
    if (_schemState.sidebarDrag) {
      const g = _schemState.ghostPos;
      if (g && wrap) {
        const rect = wrap.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const { groupId, nodeId } = _schemState.sidebarDrag;
          const gx = Math.round(g.x / SCHEM_CELL), gy = Math.round(g.y / SCHEM_CELL);
          if (groupId === '__infra__') {
            // Unassigned station — store in infraStations
            if (!data.beckmap.infraStations) data.beckmap.infraStations = {};
            data.beckmap.infraStations[nodeId] = { gx, gy };
          } else {
            if (!data.beckmap.lineStations[groupId]) data.beckmap.lineStations[groupId] = {};
            data.beckmap.lineStations[groupId][nodeId] = { gx, gy };
            schemAutoJoinGroup(groupId, nodeId);
          }
          save();
        }
      }
      _schemState.sidebarDrag = null; _schemState.ghostPos = null;
      if (wrap) wrap.style.cursor = '';
      renderSchematic(); renderSchemSidebar();
      return;
    }
  });

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const oldZoom = _schemState.zoom;
    _schemState.zoom = Math.max(0.05, Math.min(20, oldZoom * factor));
    const ratio = _schemState.zoom / oldZoom;
    _schemState.viewX = mx - ratio * (mx - _schemState.viewX);
    _schemState.viewY = my - ratio * (my - _schemState.viewY);
    renderSchematic();
  }, { passive: false });

  // Right-click: remove bend point
  wrap.addEventListener('contextmenu', e => {
    if (!_schemState.selectedRoute && !_schemState.selectedConn) return;
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    const wx = (e.clientX - rect.left - _schemState.viewX) / _schemState.zoom;
    const wy = (e.clientY - rect.top - _schemState.viewY) / _schemState.zoom;
    const bh = schemHitTestBend(wx, wy);
    if (bh == null) return;
    const rcGid = _schemState.selectedRoute ? _schemState.selectedRoute.groupId : 'isiosi';
    const rcEk = _schemState.selectedRoute ? _schemState.selectedRoute.edgeKey : _schemState.selectedConn.edgeKey;
    const bends = data.beckmap.routeBends?.[rcGid]?.[rcEk];
    if (bends) {
      bends.splice(bh, 1);
      schemCleanBends(rcGid, rcEk);
      save();
      renderSchematic();
    }
  });

  // Key handlers on document so they work regardless of focus
  document.addEventListener('keydown', e => {
    // Only handle when the railmap tab is active
    const panel = document.getElementById('panel-schematic');
    if (!panel || !panel.classList.contains('active')) return;
    // Don't intercept if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

    if (e.key === 'Escape') {
      if (_schemState.bendEditing) { _schemState.bendEditing = false; }
      else if (_schemState.selectedRoute) { _schemState.selectedRoute = null; _schemState.bendEditing = false; }
      else if (_schemState.selectedLine) { _schemState.selectedLine = null; }
      else if (_schemState.selectedStation) { _schemState.selectedStation = null; }
      else if (_schemState.selectedConn) { _schemState.selectedConn = null; }
      else return;
      renderSchematic(); renderSchemSidebar();
    }
    if ((e.key === 'e' || e.key === 'E') && (_schemState.selectedRoute || _schemState.selectedConn)) {
      _schemState.bendEditing = !_schemState.bendEditing;
      renderSchematic(); renderSchemSidebar();
    }
  });

  wrap.addEventListener('mousemove', e => {
    const rect = wrap.getBoundingClientRect();
    const wx = (e.clientX - rect.left - _schemState.viewX) / _schemState.zoom;
    const wy = (e.clientY - rect.top - _schemState.viewY) / _schemState.zoom;
    const gx = Math.round(wx / SCHEM_CELL), gy = Math.round(wy / SCHEM_CELL);
    const coordEl = document.getElementById('schem-coords');
    if (coordEl) coordEl.textContent = `${gx}, ${gy}`;
  });

  const rect = wrap.getBoundingClientRect();
  _schemState.viewX = rect.width / 2;
  _schemState.viewY = rect.height / 2;

  const panel = document.getElementById('schem-edge-panel');
  if (panel) panel.style.display = 'none';

  renderSchemSidebar();
  renderSchematic();

  // Auto-fit on first open if there are placed stations
  if (schemAllPlacedPositions().length) schemFitAll();
}

// ---- Coordinate helpers ----

function schemGridToPixel(gx, gy) { return { x: gx * SCHEM_CELL, y: gy * SCHEM_CELL }; }
function schemWorldToScreen(wx, wy) {
  return { x: _schemState.viewX + wx * _schemState.zoom, y: _schemState.viewY + wy * _schemState.zoom };
}
function schemScreenToWorld(sx, sy) {
  return { x: (sx - _schemState.viewX) / _schemState.zoom, y: (sy - _schemState.viewY) / _schemState.zoom };
}
function schemGridSnap(wx, wy) {
  const gx = Math.round(wx / SCHEM_CELL), gy = Math.round(wy / SCHEM_CELL);
  return { gx, gy, px: gx * SCHEM_CELL, py: gy * SCHEM_CELL };
}
function schemPointToSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
  if (lenSq < 0.01) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2);
}

// ---- Zoom / fit ----

function schemZoom(factor) {
  const wrap = document.getElementById('schem-canvas-wrap');
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const cx = rect.width / 2, cy = rect.height / 2;
  const oldZoom = _schemState.zoom;
  _schemState.zoom = Math.max(0.05, Math.min(20, oldZoom * factor));
  const ratio = _schemState.zoom / oldZoom;
  _schemState.viewX = cx - ratio * (cx - _schemState.viewX);
  _schemState.viewY = cy - ratio * (cy - _schemState.viewY);
  renderSchematic();
}

function schemFitAll() {
  const allPos = schemAllPlacedPositions();
  if (!allPos.length) return;
  const wrap = document.getElementById('schem-canvas-wrap');
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const PAD = 80;
  const xs = allPos.map(p => p.gx * SCHEM_CELL), ys = allPos.map(p => p.gy * SCHEM_CELL);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  _schemState.zoom = Math.max(0.05, Math.min(20, Math.min(
    (rect.width - PAD * 2) / spanX, (rect.height - PAD * 2) / spanY
  )));
  _schemState.viewX = rect.width / 2 - ((minX + maxX) / 2) * _schemState.zoom;
  _schemState.viewY = rect.height / 2 - ((minY + maxY) / 2) * _schemState.zoom;
  renderSchematic();
}

// ---- Reset ----

function schemResetMap() {
  appConfirm('Reset the railmap? This clears all line-station placements and route bends.', () => {
    data.beckmap = { version: 3, lineStations: {}, routeBends: {} };
    _schemState.selectedRoute = null;
    _schemState.bendDrag = null;
    save();
    renderSchemSidebar();
    renderSchematic();
  });
}

// ---- Bend management ----

function schemEdgeKey(nodeIdA, nodeIdB) {
  return nodeIdA < nodeIdB ? `${nodeIdA}|${nodeIdB}` : `${nodeIdB}|${nodeIdA}`;
}

function schemGetBends(groupId, edgeKey) {
  return data.beckmap.routeBends?.[groupId]?.[edgeKey] || null;
}

// Get from/to positions and correctly-ordered bends for a selected route.
// Bends are stored in canonical key order — this reverses them if the
// selected route's service direction disagrees.
function schemResolveEdge(groupId, edgeKey, fromId, toId) {
  const ls = data.beckmap.lineStations?.[groupId];
  if (!ls) return null;
  const from = ls[fromId], to = ls[toId];
  if (!from || !to) return null;
  const bends = schemGetBends(groupId, edgeKey);
  const canonical = edgeKey.split('|');
  const reversed = fromId !== canonical[0];
  const orderedBends = (bends && reversed) ? [...bends].reverse() : bends;
  return { from, to, bends: orderedBends, rawBends: bends, reversed };
}

function schemAddBend(groupId, edgeKey, gx, gy) {
  if (!data.beckmap.routeBends) data.beckmap.routeBends = {};
  if (!data.beckmap.routeBends[groupId]) data.beckmap.routeBends[groupId] = {};
  if (!data.beckmap.routeBends[groupId][edgeKey]) data.beckmap.routeBends[groupId][edgeKey] = [];
  const bends = data.beckmap.routeBends[groupId][edgeKey];

  // Don't add duplicate at same position
  if (bends.some(b => b.gx === gx && b.gy === gy)) return;

  // Get endpoints in the correct order (matching how schemRouteWithBends will use them).
  // The edgeKey is canonical (sorted), bends are stored in that key's direction.
  // Use the FULL route (from→bends→to) to find where the new point falls.
  const ls = data.beckmap.lineStations?.[groupId];
  const parts = edgeKey.split('|');
  const from = ls?.[parts[0]], to = ls?.[parts[1]];
  if (!from || !to) { bends.push({ gx, gy }); return; }

  // Build the full cell-level route to walk along and find closest cell
  const route = schemRouteWithBends(from, to, bends.length ? bends : null);

  // Find which cell in the route is closest to the new point
  let bestCellIdx = 0, bestDist = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = Math.abs(route[i].gx - gx) + Math.abs(route[i].gy - gy);
    if (d < bestDist) { bestDist = d; bestCellIdx = i; }
  }

  // Now find which waypoint segment that cell falls in.
  // Walk the route segment by segment (from→bend0, bend0→bend1, ..., bendN→to)
  // and count cells to map bestCellIdx to the correct waypoint segment.
  const waypoints = [from, ...bends, to];
  let cellCount = 0;
  let insertIdx = bends.length; // default: before 'to'
  for (let w = 0; w < waypoints.length - 1; w++) {
    const leg = schemRouteLeg(waypoints[w].gx, waypoints[w].gy, waypoints[w + 1].gx, waypoints[w + 1].gy);
    const legCells = (w === 0) ? leg.length : leg.length - 1; // first leg includes start, rest skip it
    if (bestCellIdx < cellCount + legCells) {
      insertIdx = w;
      break;
    }
    cellCount += legCells;
  }

  bends.splice(insertIdx, 0, { gx, gy });
}

// Clean up bends: remove duplicates, endpoint-coincident, and collinear (straight-path) bends.
// Does NOT re-sort — preserves user ordering.
function schemCleanBends(groupId, edgeKey) {
  const bends = data.beckmap.routeBends?.[groupId]?.[edgeKey];
  if (!bends || !bends.length) return;
  const ls = data.beckmap.lineStations?.[groupId];
  const parts = edgeKey.split('|');
  const from = ls?.[parts[0]], to = ls?.[parts[1]];

  // Remove consecutive duplicates (same cell)
  for (let i = bends.length - 1; i > 0; i--) {
    if (bends[i].gx === bends[i - 1].gx && bends[i].gy === bends[i - 1].gy) bends.splice(i, 1);
  }
  // Remove bends that coincide with endpoints
  if (from) { while (bends.length && bends[0].gx === from.gx && bends[0].gy === from.gy) bends.shift(); }
  if (to) { while (bends.length && bends[bends.length - 1].gx === to.gx && bends[bends.length - 1].gy === to.gy) bends.pop(); }

  // Remove bends on a straight line between their neighbours (collinear)
  if (from && to) {
    let changed = true;
    while (changed) {
      changed = false;
      const all = [from, ...bends, to];
      for (let i = 1; i < all.length - 1; i++) {
        const prev = all[i - 1], cur = all[i], next = all[i + 1];
        const dx1 = cur.gx - prev.gx, dy1 = cur.gy - prev.gy;
        const dx2 = next.gx - cur.gx, dy2 = next.gy - cur.gy;
        // True collinearity: cross product is zero (not just same quadrant)
        const cross = dx1 * dy2 - dy1 * dx2;
        if (cross === 0 && Math.sign(dx1) === Math.sign(dx2) && Math.sign(dy1) === Math.sign(dy2)) {
          bends.splice(i - 1, 1);
          changed = true;
          break;
        }
      }
    }
  }

  if (bends.length === 0) delete data.beckmap.routeBends[groupId][edgeKey];
}

// ---- Hit testing ----

// Hit test: find which line-edge route the click is near.
// Returns { groupId, edgeKey, fromId, toId, segIdx } or null.
function schemHitTestRoute(wx, wy) {
  const tol = 8 / _schemState.zoom;
  let best = null, bestDist = Infinity;

  for (const group of data.serviceGroups) {
    const ls = data.beckmap.lineStations?.[group.id];
    if (!ls) continue;
    const edgeList = schemCollectEdges(group.id);
    for (const edge of edgeList) {
      const resolved = schemResolveEdge(group.id, edge.key, edge.fromId, edge.toId);
      if (!resolved) continue;
      const cells = schemRouteWithBends(resolved.from, resolved.to, resolved.bends);
      for (let i = 0; i < cells.length - 1; i++) {
        const ax = cells[i].gx * SCHEM_CELL, ay = cells[i].gy * SCHEM_CELL;
        const bx = cells[i + 1].gx * SCHEM_CELL, by = cells[i + 1].gy * SCHEM_CELL;
        const d = schemPointToSegDist(wx, wy, ax, ay, bx, by);
        if (d < tol && d < bestDist) {
          bestDist = d;
          best = { groupId: group.id, edgeKey: edge.key, fromId: edge.fromId, toId: edge.toId, segIdx: i };
        }
      }
    }
  }
  return best;
}

// Hit test: find which bend handle the click is near. Returns index or null.
function schemHitTestBend(wx, wy) {
  const sel = _schemState.selectedRoute;
  if (!sel) return null;
  const bends = schemGetBends(sel.groupId, sel.edgeKey);
  if (!bends || !bends.length) return null;
  const tol = 8 / _schemState.zoom;
  for (let i = 0; i < bends.length; i++) {
    const d = Math.sqrt((wx - bends[i].gx * SCHEM_CELL) ** 2 + (wy - bends[i].gy * SCHEM_CELL) ** 2);
    if (d < tol) return i;
  }
  return null;
}

// Collect unique edges for a line (same logic as schemDeriveRoutes but returns edge metadata).
function schemCollectEdges(groupId) {
  const ls = data.beckmap.lineStations?.[groupId];
  if (!ls) return [];
  const services = data.services.filter(s => s.groupId === groupId);
  // Stations stopped at by ANY service (same logic as schemDeriveRoutes)
  const stoppedByAny = new Set();
  for (const svc of services) {
    for (const st of svc.stops) {
      if (!st.passThrough) { const n = getNode(st.nodeId); if (n && isPassengerStop(n)) stoppedByAny.add(st.nodeId); }
    }
  }
  const edgeSet = new Set();
  const edges = [];
  for (const svc of services) {
    const relevantStops = svc.stops.filter(st => {
      const n = getNode(st.nodeId);
      return n && isPassengerStop(n) && stoppedByAny.has(st.nodeId);
    });
    const placed = relevantStops.filter(st => ls[st.nodeId]).map(st => st.nodeId);
    for (let i = 0; i < placed.length - 1; i++) {
      const key = schemEdgeKey(placed[i], placed[i + 1]);
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ key, fromId: placed[i], toId: placed[i + 1] });
    }
  }
  return edges;
}

// Route between two positions, optionally through bend points.
function schemRouteWithBends(from, to, bends) {
  if (!bends || !bends.length) return schemRouteLeg(from.gx, from.gy, to.gx, to.gy);
  const waypoints = [from, ...bends, to];
  const cells = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const leg = schemRouteLeg(waypoints[i].gx, waypoints[i].gy, waypoints[i + 1].gx, waypoints[i + 1].gy);
    if (i > 0) leg.shift(); // avoid duplicate at junction
    cells.push(...leg);
  }
  return cells;
}

// ---- Data queries ----

function schemAllPlacedPositions() {
  const result = [];
  const ls = data.beckmap.lineStations;
  if (ls) for (const gid in ls) for (const nid in ls[gid]) result.push({ groupId: gid, nodeId: nid, ...ls[gid][nid] });
  const infra = data.beckmap.infraStations;
  if (infra) for (const nid in infra) result.push({ groupId: '__infra__', nodeId: nid, ...infra[nid] });
  return result;
}

// Derive routes for a line from ALL its services (handles branching).
// Collects unique station-pair edges across all services, routes each once.
// Returns array of cell-arrays: [[{gx,gy},...], ...]
function schemDeriveRoutes(groupId) {
  const ls = data.beckmap.lineStations?.[groupId];
  if (!ls) return [];
  const services = data.services.filter(s => s.groupId === groupId);
  if (!services.length) return [];

  // Build the set of stations that are stopped at (non-passThrough) by ANY service on this line.
  // A station only needs to be skipped if EVERY service skips it.
  const stoppedByAny = new Set();
  for (const svc of services) {
    for (const st of svc.stops) {
      if (!st.passThrough) {
        const n = getNode(st.nodeId);
        if (n && isPassengerStop(n)) stoppedByAny.add(st.nodeId);
      }
    }
  }

  // Collect unique edges between adjacent placed stations.
  // Use the "stopped by any" set to determine which stops count — if ANY service stops there, it's real.
  const edgeSet = new Set();
  const edges = [];
  for (const svc of services) {
    // Filter stops: include if the station is stopped at by ANY service (not just this one)
    const relevantStops = svc.stops.filter(st => {
      const n = getNode(st.nodeId);
      if (!n || !isPassengerStop(n)) return false;
      return stoppedByAny.has(st.nodeId); // only skip if ALL services skip it
    });
    for (let i = 0; i < relevantStops.length - 1; i++) {
      const aPlaced = !!ls[relevantStops[i].nodeId];
      const bPlaced = !!ls[relevantStops[i + 1].nodeId];
      if (aPlaced && bPlaced) {
        const a = relevantStops[i].nodeId, b = relevantStops[i + 1].nodeId;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        edges.push({ fromId: a, toId: b });
      }
    }
  }
  const filteredEdges = edges;

  // Route each unique edge once (using bends if defined).
  // Route in service order (edge.fromId → edge.toId).
  // Bends are stored in canonical key order — reverse them if service order differs.
  const routes = [];
  for (const edge of filteredEdges) {
    const key = schemEdgeKey(edge.fromId, edge.toId);
    const from = ls[edge.fromId], to = ls[edge.toId];
    if (!from || !to) continue;
    const bends = schemGetBends(groupId, key);
    // If service direction disagrees with canonical, reverse the bends
    const canonical = key.split('|');
    const reversed = edge.fromId !== canonical[0];
    const orderedBends = (bends && reversed) ? [...bends].reverse() : bends;
    const cells = schemRouteWithBends(from, to, orderedBends);
    if (cells.length >= 2) routes.push({ cells, edgeKey: key });
  }
  return routes;
}

// Build visual station groups for interchange blobs.
// ---- Station Groups (named groups) ----

// Auto-generate default groups from placement rules.
// Called once when stationGroups is empty or needs rebuilding.
function schemAutoGenerateGroups() {
  const ls = data.beckmap.lineStations || {};
  if (!data.beckmap.stationGroups) data.beckmap.stationGroups = {};

  // Collect all placed line-station keys
  const allKeys = [];
  const keyData = {};
  for (const gid in ls) for (const nid in ls[gid]) {
    const k = `${gid}|${nid}`;
    allKeys.push(k);
    keyData[k] = { groupId: gid, nodeId: nid };
  }
  if (!allKeys.length) return;

  // Union-find for default grouping
  const parent = {};
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (const k of allKeys) parent[k] = k;

  const byNodeId = {};
  for (const k of allKeys) { const nid = keyData[k].nodeId; if (!byNodeId[nid]) byNodeId[nid] = []; byNodeId[nid].push(k); }

  // Rule 1: same nodeId different lines
  for (const nid in byNodeId) { const keys = byNodeId[nid]; for (let i = 1; i < keys.length; i++) union(keys[0], keys[i]); }
  // Rule 2: same display name
  const byName = {};
  for (const k of allKeys) { const dn = nodeDisplayName(keyData[k].nodeId); if (!byName[dn]) byName[dn] = []; byName[dn].push(k); }
  for (const dn in byName) { const keys = byName[dn]; for (let i = 1; i < keys.length; i++) union(keys[0], keys[i]); }
  // Rule 3: ISI/OSI
  for (const seg of data.segments) {
    if (!isInterchange(seg)) continue;
    const ka = byNodeId[seg.nodeA], kb = byNodeId[seg.nodeB];
    if (ka?.length && kb?.length) union(ka[0], kb[0]);
  }

  // Collect groups with 2+ members
  const groups = {};
  for (const k of allKeys) {
    const root = find(k);
    if (!groups[root]) groups[root] = [];
    groups[root].push(k);
  }

  // Already-assigned keys (in existing groups)
  const assigned = new Set();
  for (const gid in data.beckmap.stationGroups) {
    for (const m of data.beckmap.stationGroups[gid].members) assigned.add(m);
  }

  for (const root in groups) {
    if (groups[root].length < 2) continue;
    // Skip if all members already assigned
    const unassigned = groups[root].filter(k => !assigned.has(k));
    if (unassigned.length < 2) continue;
    // Create a new group
    const firstNid = keyData[groups[root][0]].nodeId;
    const name = nodeDisplayName(firstNid);
    const id = 'sg_' + uid();
    data.beckmap.stationGroups[id] = { name, members: groups[root] };
    groups[root].forEach(k => assigned.add(k));
  }
}

// Add a line-station to the best matching group (auto-join on placement).
function schemAutoJoinGroup(gid, nid) {
  const lsKey = `${gid}|${nid}`;
  if (!data.beckmap.stationGroups) data.beckmap.stationGroups = {};
  const groups = data.beckmap.stationGroups;
  // Already in a group?
  for (const sgId in groups) {
    if (groups[sgId].members.includes(lsKey)) return;
  }
  // Find a matching group: same nodeId, same display name, or ISI/OSI connected
  const dn = nodeDisplayName(nid);
  for (const sgId in groups) {
    for (const mk of groups[sgId].members) {
      const [mGid, mNid] = mk.split('|');
      if (mNid === nid || nodeDisplayName(mNid) === dn) {
        groups[sgId].members.push(lsKey);
        return;
      }
      // ISI/OSI connection
      for (const seg of data.segments) {
        if (!isInterchange(seg)) continue;
        if ((seg.nodeA === nid && seg.nodeB === mNid) || (seg.nodeB === nid && seg.nodeA === mNid)) {
          groups[sgId].members.push(lsKey);
          return;
        }
      }
    }
  }
  // No existing group found — check for ungrouped placed line-stations that match
  const ls = data.beckmap.lineStations || {};
  for (const gid2 in ls) {
    for (const nid2 in ls[gid2]) {
      if (gid2 === gid && nid2 === nid) continue; // skip self
      const otherKey = `${gid2}|${nid2}`;
      if (schemGetGroup(otherKey)) continue; // already in a group
      // Check match: same nodeId, same display name, or ISI/OSI
      let match = (nid2 === nid) || (nodeDisplayName(nid2) === dn);
      if (!match) {
        for (const seg of data.segments) {
          if (!isInterchange(seg)) continue;
          if ((seg.nodeA === nid && seg.nodeB === nid2) || (seg.nodeB === nid && seg.nodeA === nid2)) { match = true; break; }
        }
      }
      if (match) {
        // Create a new group with both
        const id = 'sg_' + uid();
        groups[id] = { name: nodeDisplayName(nid), members: [otherKey, lsKey] };
        return;
      }
    }
  }
}

// Remove a line-station from its group.
function schemRemoveFromGroup(lsKey) {
  const groups = data.beckmap.stationGroups || {};
  for (const sgId in groups) {
    const idx = groups[sgId].members.indexOf(lsKey);
    if (idx >= 0) {
      groups[sgId].members.splice(idx, 1);
      // Remove empty or single-member groups
      if (groups[sgId].members.length < 2) delete groups[sgId];
      return sgId;
    }
  }
  return null;
}

// Move a line-station to a specific group.
function schemMoveToGroup(lsKey, targetGroupId) {
  schemRemoveFromGroup(lsKey);
  if (targetGroupId === 'solo') return; // ungrouped
  const groups = data.beckmap.stationGroups;
  if (!groups[targetGroupId]) return;
  groups[targetGroupId].members.push(lsKey);
}

// Create a new group with a line-station as its first member.
function schemCreateGroup(lsKey) {
  schemRemoveFromGroup(lsKey);
  const [gid, nid] = lsKey.split('|');
  const name = nodeDisplayName(nid);
  const id = 'sg_' + uid();
  if (!data.beckmap.stationGroups) data.beckmap.stationGroups = {};
  data.beckmap.stationGroups[id] = { name, members: [lsKey] };
  return id;
}

// Find which group a line-station belongs to. Returns groupId or null.
function schemGetGroup(lsKey) {
  const groups = data.beckmap.stationGroups || {};
  for (const sgId in groups) {
    if (groups[sgId].members.includes(lsKey)) return sgId;
  }
  return null;
}

// Read stationGroups and return interchange data.
// Returns [{ groupId, nodeIds: [nid,...], positions: [{gx, gy, groupId, nodeId}, ...] }, ...]
function schemFindInterchanges() {
  const ls = data.beckmap.lineStations || {};
  const groups = data.beckmap.stationGroups || {};
  const result = [];
  for (const sgId in groups) {
    const positions = [];
    const nodeIds = new Set();
    for (const lsKey of groups[sgId].members) {
      const [gid, nid] = lsKey.split('|');
      const pos = ls[gid]?.[nid];
      if (pos) {
        positions.push({ ...pos, groupId: gid, nodeId: nid });
        nodeIds.add(nid);
      }
    }
    if (positions.length >= 2) {
      result.push({ groupId: sgId, nodeIds: [...nodeIds], positions });
    }
  }
  return result;
}

// ---- Mark detection ----

// Build a cache of route data for mark detection. Call once per render.
// Returns { lineRoutes: { groupId: [{cells, edgeKey},...] }, stationInfo: { "gid|nid": {mark, dir} } }
function schemBuildMarkCache() {
  const ls = data.beckmap.lineStations || {};
  const lineRoutes = {};
  const stationInfo = {};

  // Build set of nodeIds that have VISIBLE ISI/OSI connections (always blob)
  // Only counts if: not hidden, AND both endpoints are placed on the map
  const isiOsiNodes = new Set();
  const allPlacedNids = new Set();
  for (const gid in ls) for (const nid in ls[gid]) allPlacedNids.add(nid);
  for (const seg of data.segments) {
    if (!isInterchange(seg)) continue;
    const ek = `${seg.interchangeType}:${seg.id}`;
    const connStyle = data.beckmap.segmentStyles?.['isiosi']?.[ek] || 'full';
    if (connStyle === 'hidden') continue;
    if (!allPlacedNids.has(seg.nodeA) || !allPlacedNids.has(seg.nodeB)) continue;
    isiOsiNodes.add(seg.nodeA); isiOsiNodes.add(seg.nodeB);
  }

  // Build set of line-station keys that are in interchange groups (always blob)
  const interchangeKeys = new Set();
  const ics = _renderCache.interchanges || schemFindInterchanges();
  for (const ic of ics) {
    for (const pos of ic.positions) interchangeKeys.add(`${pos.groupId}|${pos.nodeId}`);
  }

  for (const group of data.serviceGroups) {
    const routes = _renderCache.routes[group.id] || [];
    lineRoutes[group.id] = routes;

    const positions = ls[group.id];
    if (!positions) continue;

    for (const nid in positions) {
      const key = `${group.id}|${nid}`;
      const pos = positions[nid];

      // Inside interchange blob: no individual mark needed
      if (interchangeKeys.has(key)) {
        stationInfo[key] = { mark: 'interchange' };
        continue;
      }

      // Station with ISI/OSI connection: always blob
      if (isiOsiNodes.has(nid)) {
        stationInfo[key] = { mark: 'blob_override' };
        continue;
      }

      // Count how many route edges this station appears in. Collect approach directions.
      let edgeCount = 0;
      const approaches = []; // [{dx, dy}] — direction FROM the station toward each edge interior
      for (const route of routes) {
        const cells = route.cells;
        if (cells.length < 2) continue;
        const first = cells[0], last = cells[cells.length - 1];
        const isFirst = first.gx === pos.gx && first.gy === pos.gy;
        const isLast = last.gx === pos.gx && last.gy === pos.gy;
        if (isFirst) {
          edgeCount++;
          approaches.push({ dx: cells[1].gx - pos.gx, dy: cells[1].gy - pos.gy });
        }
        if (isLast) {
          edgeCount++;
          const prev = cells[cells.length - 2];
          approaches.push({ dx: prev.gx - pos.gx, dy: prev.gy - pos.gy });
        }
      }

      if (edgeCount >= 2) {
        // Through-station. Pick the approach with the longest straight run for the tick.
        // Average the approach directions to get the "line direction" at this station.
        // Check if this is a corner (approaches not collinear)
        let isCorner = false, shiftDx = 0, shiftDy = 0;
        let lineDir;
        if (approaches.length >= 2) {
          const a0 = approaches[0], a1 = approaches[1];
          if (Math.sign(a0.dx) !== -Math.sign(a1.dx) || Math.sign(a0.dy) !== -Math.sign(a1.dy)) {
            isCorner = true;
            // Pick the longer/more-axis-aligned approach for the tick
            // Prefer orthogonal over diagonal
            const score = (a) => (a.dx === 0 || a.dy === 0) ? 1 : 0;
            const bestApproach = score(a0) >= score(a1) ? a0 : a1;
            const otherApproach = bestApproach === a0 ? a1 : a0;
            lineDir = { dx: Math.sign(bestApproach.dx), dy: Math.sign(bestApproach.dy) };
            // Shift along the chosen approach direction
            shiftDx = Math.sign(bestApproach.dx) * 0.5;
            shiftDy = Math.sign(bestApproach.dy) * 0.5;
          }
        }
        if (!lineDir) {
          // Straight through: average approaches
          const avgDx = approaches.reduce((s, a) => s + Math.sign(a.dx), 0);
          const avgDy = approaches.reduce((s, a) => s + Math.sign(a.dy), 0);
          lineDir = { dx: Math.sign(avgDx || approaches[0].dx), dy: Math.sign(avgDy || approaches[0].dy) };
        }
        stationInfo[key] = { mark: 'tick', lineDir, shift: { dx: shiftDx, dy: shiftDy }, isCorner };
      } else if (edgeCount === 1) {
        // Terminus
        const a = approaches[0];
        stationInfo[key] = { mark: 'terminus', lineDir: { dx: Math.sign(a.dx), dy: Math.sign(a.dy) } };
      } else {
        stationInfo[key] = { mark: 'simple' };
      }
    }
  }
  return { lineRoutes, stationInfo };
}

// Find ISI/OSI segments where both endpoints have placed line-stations
// and are NOT in the same visual group (grouped stations hide their connector).
function schemFindISIOSI() {
  // Build set of grouped pairs to skip
  const groupedPairs = new Set();
  const interchanges = _renderCache.interchanges || schemFindInterchanges();
  for (const ic of interchanges) {
    for (let i = 0; i < ic.nodeIds.length; i++) {
      for (let j = i + 1; j < ic.nodeIds.length; j++) {
        const key = ic.nodeIds[i] < ic.nodeIds[j] ? `${ic.nodeIds[i]}|${ic.nodeIds[j]}` : `${ic.nodeIds[j]}|${ic.nodeIds[i]}`;
        groupedPairs.add(key);
      }
    }
  }
  const ls = data.beckmap.lineStations || {};
  const result = [];
  // Build nodeId → list of placed positions
  const nodePositions = {};
  for (const gid in ls) for (const nid in ls[gid]) {
    if (!nodePositions[nid]) nodePositions[nid] = [];
    nodePositions[nid].push(ls[gid][nid]);
  }
  for (const seg of data.segments) {
    if (!isInterchange(seg)) continue;
    const posA = nodePositions[seg.nodeA], posB = nodePositions[seg.nodeB];
    if (!posA || !posB) continue;
    // Skip if both endpoints are in the same visual group
    const pairKey = seg.nodeA < seg.nodeB ? `${seg.nodeA}|${seg.nodeB}` : `${seg.nodeB}|${seg.nodeA}`;
    if (groupedPairs.has(pairKey)) continue;
    // Centroid of each station's line-stations
    const cx = arr => arr.reduce((s, p) => s + p.gx, 0) / arr.length;
    const cy = arr => arr.reduce((s, p) => s + p.gy, 0) / arr.length;
    result.push({
      fromGx: cx(posA), fromGy: cy(posA),
      toGx: cx(posB), toGy: cy(posB),
      fromNid: seg.nodeA, toNid: seg.nodeB,
      type: seg.interchangeType,
      segId: seg.id,
      edgeKey: `${seg.interchangeType}:${seg.id}`
    });
  }
  return result;
}

// Build an SVG path string from route cells with rounded corners at bends.
// `r` is the rounding radius in screen pixels (0 = sharp corners).
function schemSmoothPath(cells, r) {
  if (!cells || cells.length < 2) return '';
  const pts = cells.map(c => schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL));
  if (r <= 0 || pts.length < 3) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    // Check if this is a bend (direction change)
    const dx1 = cur.x - prev.x, dy1 = cur.y - prev.y;
    const dx2 = next.x - cur.x, dy2 = next.y - cur.y;
    if (Math.abs(dx1 * dy2 - dy1 * dx2) < 0.01) {
      // Collinear — no bend, just line through
      d += ` L${cur.x.toFixed(1)},${cur.y.toFixed(1)}`;
    } else {
      // Bend: pull the corner toward a smooth curve
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
      const cr = Math.min(r, len1 * 0.4, len2 * 0.4); // don't overshoot
      const ax = cur.x - (dx1 / len1) * cr, ay = cur.y - (dy1 / len1) * cr;
      const bx = cur.x + (dx2 / len2) * cr, by = cur.y + (dy2 / len2) * cr;
      d += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${cur.x.toFixed(1)},${cur.y.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
    }
  }
  d += ` L${pts[pts.length - 1].x.toFixed(1)},${pts[pts.length - 1].y.toFixed(1)}`;
  return d;
}

// ---- Routing ----

function schemRouteLeg(fromGx, fromGy, toGx, toGy) {
  const dx = toGx - fromGx, dy = toGy - fromGy;
  if (dx === 0 && dy === 0) return [{ gx: fromGx, gy: fromGy }];
  const absDx = Math.abs(dx), absDy = Math.abs(dy);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const diagSteps = Math.min(absDx, absDy);
  const cells = [];
  let cx = fromGx, cy = fromGy;
  cells.push({ gx: cx, gy: cy });
  for (let i = 0; i < diagSteps; i++) { cx += sx; cy += sy; cells.push({ gx: cx, gy: cy }); }
  for (let i = 0; i < absDx - diagSteps; i++) { cx += sx; cells.push({ gx: cx, gy: cy }); }
  for (let i = 0; i < absDy - diagSteps; i++) { cy += sy; cells.push({ gx: cx, gy: cy }); }
  return cells;
}

// ---- Styles ----

function schemGetStyle(groupId, edgeKey) {
  // Cascade: segment override → line override → mode default → 'full'
  if (data.beckmap.segmentStyles?.[groupId]?.[edgeKey]) return data.beckmap.segmentStyles[groupId][edgeKey];
  if (data.beckmap.lineStyles?.[groupId]) return data.beckmap.lineStyles[groupId];
  // Mode default: find the line's primary mode via its longest service
  const svcs = data.services.filter(s => s.groupId === groupId);
  if (svcs.length) {
    const longest = svcs.reduce((a, b) => a.stops.length >= b.stops.length ? a : b);
    const cat = getCat(longest.categoryId);
    if (cat?.defaultMapStyle) return cat.defaultMapStyle;
  }
  return 'full';
}

function schemSetSegmentStyle(groupId, edgeKey, style) {
  if (!data.beckmap.segmentStyles) data.beckmap.segmentStyles = {};
  if (!data.beckmap.segmentStyles[groupId]) data.beckmap.segmentStyles[groupId] = {};
  if (style === 'full' || !style) delete data.beckmap.segmentStyles[groupId][edgeKey];
  else data.beckmap.segmentStyles[groupId][edgeKey] = style;
  save(); renderSchematic();
}

function schemSetLineStyle(groupId, style) {
  if (!data.beckmap.lineStyles) data.beckmap.lineStyles = {};
  if (style === 'full' || !style) delete data.beckmap.lineStyles[groupId];
  else data.beckmap.lineStyles[groupId] = style;
  save(); renderSchematic();
}

function schemToggleLineFilter(groupId, checked) {
  if (!_schemState._lineFilter) _schemState._lineFilter = new Set();
  // Remove the dummy __none__ marker if present
  _schemState._lineFilter.delete('__none__');
  if (checked) {
    _schemState._lineFilter.add(groupId);
    // If all lines are now checked, clear the set (= show all)
    if (_schemState._lineFilter.size >= data.serviceGroups.length) _schemState._lineFilter = new Set();
  } else {
    // If currently showing all (empty set), populate with all EXCEPT this one
    if (_schemState._lineFilter.size === 0) {
      for (const g of data.serviceGroups) _schemState._lineFilter.add(g.id);
    }
    _schemState._lineFilter.delete(groupId);
    // If none left, set dummy so nothing shows
    if (_schemState._lineFilter.size === 0) _schemState._lineFilter.add('__none__');
  }
  renderSchemSidebar();
}

function schemSetLinePriority(groupId, pri) {
  if (!data.beckmap.linePriority) data.beckmap.linePriority = {};
  if (pri === 0) delete data.beckmap.linePriority[groupId];
  else data.beckmap.linePriority[groupId] = pri;
  save(); renderSchematic(); renderSchemSidebar();
}

function schemSetSegmentPriority(groupId, edgeKey, pri) {
  if (!data.beckmap.segmentPriority) data.beckmap.segmentPriority = {};
  if (!data.beckmap.segmentPriority[groupId]) data.beckmap.segmentPriority[groupId] = {};
  if (pri === 0) delete data.beckmap.segmentPriority[groupId][edgeKey];
  else data.beckmap.segmentPriority[groupId][edgeKey] = pri;
  if (!Object.keys(data.beckmap.segmentPriority[groupId]).length) delete data.beckmap.segmentPriority[groupId];
  save(); renderSchematic(); renderSchemSidebar();
}

// Apply SVG style attrs for a line path. Returns attrs string.
// Returns extra SVG attrs for styled line paths.
// 'punched' and 'double' are handled separately in the render loop (multi-pass).
function schemStyleAttrs(style, lineWidth) {
  const u = Math.max(3, lineWidth);
  switch (style) {
    case 'dashed': return `stroke-dasharray="${(u * 2).toFixed(1)} ${(u * 1.8).toFixed(1)}" stroke-linecap="butt"`;
    case 'hidden': return `opacity="0"`;
    default: return '';
  }
}

// Hit test creation dots: cells along current selected route that aren't waypoints.
function schemHitTestCreationDot(wx, wy) {
  const sel = _schemState.selectedRoute;
  if (!sel) return null;
  const ls = data.beckmap.lineStations?.[sel.groupId];
  if (!ls) return null;
  const resolved = schemResolveEdge(sel.groupId, sel.edgeKey, sel.fromId, sel.toId);
  if (!resolved) return null;
  const { from, to, bends: ordBends } = resolved;
  const bends = ordBends || [];
  const waypoints = [from, ...bends, to];
  const wpSet = new Set(waypoints.map(w => `${w.gx},${w.gy}`));

  const cells = schemRouteWithBends(from, to, bends.length ? bends : null);
  const tol = 6 / _schemState.zoom;
  for (const c of cells) {
    if (wpSet.has(`${c.gx},${c.gy}`)) continue; // skip waypoints
    const d = Math.sqrt((wx - c.gx * SCHEM_CELL) ** 2 + (wy - c.gy * SCHEM_CELL) ** 2);
    if (d < tol) return c;
  }
  return null;
}

// ---- Sidebar (context menus + station list) ----

function renderSchemSidebar() {
  const listEl = document.getElementById('schem-sidebar-list');
  const filterEl = document.getElementById('schem-sidebar-filter');
  if (!listEl || !filterEl) return;

  // Context menus take priority over the station list
  if (_schemState.selectedRoute || _schemState.selectedLine || _schemState.selectedStation || _schemState.selectedConn) {
    // Blur any focused input so keyboard shortcuts (E key) work immediately
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') document.activeElement.blur();
  }
  if (_schemState.selectedRoute) { schemRenderSegmentMenu(listEl); return; }
  if (_schemState.selectedLine) { schemRenderLineMenu(listEl); return; }
  if (_schemState.selectedStation) { schemRenderStationMenu(listEl); return; }
  if (_schemState.selectedConn) { schemRenderConnMenu(listEl); return; }

  // Default: unplaced station list
  const q = stripDiacritics((document.getElementById('schem-sidebar-search')?.value || '').toLowerCase());

  // Line filter checkboxes
  if (!_schemState._lineFilter) _schemState._lineFilter = new Set(); // empty = all
  const lineFilterSet = _schemState._lineFilter;
  const allSelected = lineFilterSet.size === 0;
  let filterHtml = `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-bottom:2px">`;
  filterHtml += `<input type="checkbox" ${allSelected ? 'checked' : ''} onchange="if(this.checked){_schemState._lineFilter=new Set();}else{_schemState._lineFilter=new Set(['__none__']);}renderSchemSidebar()"/>`;
  filterHtml += `<span style="font-weight:600">${t('departures.label.all_lines')}</span></label>`;
  for (const g of data.serviceGroups) {
    const checked = allSelected ? true : lineFilterSet.has(g.id);
    const fg = contrastText(g.color || '#888');
    filterHtml += `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;margin-bottom:1px">`;
    filterHtml += `<input type="checkbox" ${checked ? 'checked' : ''} onchange="schemToggleLineFilter('${g.id}',this.checked)"/>`;
    filterHtml += `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${g.color || '#888'};flex-shrink:0"></span>`;
    filterHtml += `<span>${esc(g.name)}</span></label>`;
  }
  filterEl.innerHTML = filterHtml;

  const placed = data.beckmap.lineStations || {};
  let html = '';
  let anyItems = false;

  // First pass: collect all items per line + build top-wanted list across all lines
  const allTopWanted = []; // { nodeId, name, score, groupId, groupName, groupColor }
  const perLineHtml = [];

  for (const group of data.serviceGroups) {
    if (lineFilterSet.size > 0 && !lineFilterSet.has(group.id)) continue;
    const stationIds = new Set();
    const adjMap = {};
    for (const svc of data.services) {
      if (svc.groupId !== group.id) continue;
      const stops = svc.stops.filter(s => !s.passThrough);
      for (let i = 0; i < stops.length; i++) {
        const n = getNode(stops[i].nodeId);
        if (n && isPassengerStop(n)) {
          stationIds.add(stops[i].nodeId);
          if (!adjMap[stops[i].nodeId]) adjMap[stops[i].nodeId] = new Set();
          if (i > 0) adjMap[stops[i].nodeId].add(stops[i - 1].nodeId);
          if (i < stops.length - 1) adjMap[stops[i].nodeId].add(stops[i + 1].nodeId);
        }
      }
    }
    const items = [];
    for (const nid of stationIds) {
      if (placed[group.id]?.[nid]) continue;
      const name = nodeDisplayName(nid);
      if (q && !stripDiacritics(name.toLowerCase()).includes(q)) continue;
      let score = 0;
      const adj = adjMap[nid];
      if (adj) for (const adjId of adj) { if (placed[group.id]?.[adjId]) score++; }
      const dn = nodeDisplayName(nid);
      let groupBoost = false;
      for (const gid2 in placed) {
        for (const nid2 in placed[gid2]) {
          const sameNodeDiffLine = nid2 === nid && gid2 !== group.id;
          const sameNameDiffNode = nid2 !== nid && nodeDisplayName(nid2) === dn;
          if (sameNodeDiffLine || sameNameDiffNode) { score++; groupBoost = true; break; }
        }
        if (groupBoost) break;
      }
      items.push({ nodeId: nid, name, score });
      if (score > 0) {
        allTopWanted.push({ nodeId: nid, name, score, groupId: group.id, groupName: group.name, groupColor: group.color || '#888' });
      }
    }
    if (!items.length) continue;
    anyItems = true;
    items.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    let lineHtml = '';
    const fg = contrastText(group.color || '#888');
    lineHtml += `<div class="schem-sidebar-section" style="background:${group.color || '#888'};color:${fg};padding:4px 10px;margin-top:4px;border-radius:4px;font-size:11px;font-weight:700">${esc(group.name)}</div>`;
    for (const item of items) {
      lineHtml += `<div class="schem-sidebar-item${item.score > 0 ? ' schem-wanted' : ''}" data-gid="${group.id}" data-nid="${item.nodeId}">
        <span class="schem-sb-name" title="${esc(item.name)}">${esc(item.name)}</span>
        ${item.score > 0 ? `<span class="schem-sb-score">${item.score}</span>` : ''}
      </div>`;
    }
    perLineHtml.push(lineHtml);
  }

  // Render "Suggested" section at top (top 5 most-wanted across all lines)
  if (allTopWanted.length) {
    // Deduplicate by nodeId+groupId, sort by score desc
    const seen = new Set();
    const deduped = [];
    allTopWanted.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    for (const tw of allTopWanted) {
      const key = `${tw.groupId}|${tw.nodeId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(tw);
    }
    const top = deduped.slice(0, 5);
    html += `<div class="schem-sidebar-section">Suggested</div>`;
    for (const tw of top) {
      const fg = contrastText(tw.groupColor);
      html += `<div class="schem-sidebar-item schem-wanted" data-gid="${tw.groupId}" data-nid="${tw.nodeId}">
        <span class="schem-sb-name" title="${esc(tw.name)}">${esc(tw.name)}</span>
        <span style="font-size:8px;padding:1px 5px;border-radius:6px;background:${tw.groupColor};color:${fg};white-space:nowrap;flex-shrink:0">${esc(tw.groupName)}</span>
        <span class="schem-sb-score">${tw.score}</span>
      </div>`;
    }
  }

  // Render per-line sections
  for (const lh of perLineHtml) html += lh;

  // "Unassigned" section — stations not served by any line (infrastructure mode)
  if (getSetting('beckShowInfra', false)) {
    const servedNids = new Set();
    for (const svc of data.services) for (const st of svc.stops) servedNids.add(st.nodeId);
    const unassigned = data.nodes.filter(n => {
      if (!isPassengerStop(n)) return false;
      if (servedNids.has(n.id)) return false;
      if (q && !stripDiacritics(n.name.toLowerCase()).includes(q)) return false;
      return true;
    });
    if (unassigned.length) {
      // Build set of all placed infra + line nodeIds for scoring
      const allPlacedForInfra = new Set();
      for (const gid in (data.beckmap.lineStations || {})) for (const nid in data.beckmap.lineStations[gid]) allPlacedForInfra.add(nid);
      for (const nid in (data.beckmap.infraStations || {})) allPlacedForInfra.add(nid);

      // Score: each connected segment = +1, each placed neighbour = +1 extra
      const infraItems = unassigned.map(n => {
        if (allPlacedForInfra.has(n.id)) return null; // already placed
        let score = 0;
        for (const seg of data.segments) {
          if (seg.interchangeType === 'isi' || seg.interchangeType === 'osi') continue;
          if (seg.nodeA === n.id || seg.nodeB === n.id) {
            score++; // +1 per connected segment
            const other = seg.nodeA === n.id ? seg.nodeB : seg.nodeA;
            if (allPlacedForInfra.has(other)) score++; // +1 extra if neighbour is placed
          }
        }
        return { node: n, score };
      }).filter(Boolean);

      anyItems = anyItems || infraItems.length > 0;

      // Split into wanted and rest
      const infraWanted = infraItems.filter(i => i.score > 0).sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name));
      const infraRest = infraItems.filter(i => i.score === 0).sort((a, b) => a.node.name.localeCompare(b.node.name));

      if (infraWanted.length) {
        html += `<div class="schem-sidebar-section" style="background:#777;color:#fff;padding:4px 10px;margin-top:4px;border-radius:4px;font-size:11px;font-weight:700">Unassigned — Suggested</div>`;
        for (const item of infraWanted) {
          html += `<div class="schem-sidebar-item schem-wanted" data-gid="__infra__" data-nid="${item.node.id}">
            <span class="schem-sb-name" title="${esc(item.node.name)}">${esc(nodeDisplayName(item.node.id))}</span>
            <span class="schem-sb-score">${item.score}</span>
          </div>`;
        }
      }
      if (infraRest.length) {
        html += `<div class="schem-sidebar-section" style="background:#777;color:#fff;padding:4px 10px;margin-top:4px;border-radius:4px;font-size:11px;font-weight:700">Unassigned</div>`;
        for (const item of infraRest) {
          html += `<div class="schem-sidebar-item" data-gid="__infra__" data-nid="${item.node.id}">
            <span class="schem-sb-name" title="${esc(item.node.name)}">${esc(nodeDisplayName(item.node.id))}</span>
          </div>`;
        }
      }
    }
  }

  if (!anyItems) {
    html = `<div style="padding:16px 12px;text-align:center;color:var(--text-muted);font-size:12px">${data.serviceGroups.length ? 'All line-stations placed' : 'No lines with stations defined'}</div>`;
  }
  // Hidden segments list
  const hiddenSegs = [];
  const segStyles = data.beckmap.segmentStyles || {};
  const lineStylesD = data.beckmap.lineStyles || {};
  for (const gid in segStyles) {
    for (const ek in segStyles[gid]) {
      if (segStyles[gid][ek] === 'hidden') {
        const g = getGroup(gid);
        const parts = ek.split('|');
        const nA = getNode(parts[0]), nB = getNode(parts[1]);
        if (g && nA && nB) hiddenSegs.push({ gid, ek, line: g.name, from: nodeDisplayName(nA.id), to: nodeDisplayName(nB.id), color: g.color });
      }
    }
  }
  // Also find hidden ISI/OSI connectors
  const isiOsiStyles = segStyles['isiosi'] || {};
  for (const ek in isiOsiStyles) {
    if (isiOsiStyles[ek] === 'hidden') {
      // Parse edgeKey: "isi:segId" or "osi:segId"
      const segId = ek.split(':')[1];
      const seg = getSeg(segId);
      if (seg) {
        const nA = getNode(seg.nodeA), nB = getNode(seg.nodeB);
        if (nA && nB) hiddenSegs.push({ gid: 'isiosi', ek, line: seg.interchangeType.toUpperCase(), from: nodeDisplayName(nA.id), to: nodeDisplayName(nB.id), color: '#666' });
      }
    }
  }

  // Also find hidden lines (entire line hidden via lineStyles)
  for (const gid in lineStylesD) {
    if (lineStylesD[gid] === 'hidden') {
      const g = getGroup(gid);
      if (g) hiddenSegs.push({ gid, ek: null, line: g.name, from: '(entire line)', to: '', color: g.color, isLine: true });
    }
  }

  if (hiddenSegs.length) {
    html += `<div class="schem-sidebar-section" style="margin-top:12px">Hidden Segments</div>`;
    for (const h of hiddenSegs) {
      const showFn = h.isLine ? `schemSetLineStyle('${h.gid}','full')` : h.gid === 'isiosi' ? `schemSetConnStyle('${h.ek}','full')` : `schemSetSegmentStyle('${h.gid}','${h.ek}','full')`;
      html += `<div class="schem-sidebar-item" style="font-size:10px;opacity:0.7">`;
      html += `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${h.color};flex-shrink:0"></span>`;
      html += `<span class="schem-sb-name">${esc(h.from)} \u2194 ${esc(h.to)} <span style="opacity:0.5">${esc(h.line)}</span></span>`;
      html += `<button onclick="${showFn};renderSchemSidebar()" style="font-size:9px;padding:1px 4px;border:1px solid var(--border);border-radius:3px;background:none;color:var(--text-muted);cursor:pointer">Show</button>`;
      html += `</div>`;
    }
  }

  // Unassigned segments list (infra mode only)
  if (getSetting('beckShowInfra', false)) {
    const servedSegs = new Set();
    for (const svc of data.services) {
      for (let i = 0; i < svc.stops.length - 1; i++) {
        const s = findSeg(svc.stops[i].nodeId, svc.stops[i + 1].nodeId);
        if (s) servedSegs.add(s.id);
      }
    }
    const unassignedSegs = data.segments.filter(s => !s.interchangeType && !servedSegs.has(s.id));
    if (unassignedSegs.length) {
      html += `<div class="schem-sidebar-section" style="margin-top:12px">Unassigned Segments (${unassignedSegs.length})</div>`;
      for (const s of unassignedSegs.slice(0, 20)) { // show first 20
        const nA = getNode(s.nodeA), nB = getNode(s.nodeB);
        if (!nA || !nB) continue;
        html += `<div class="schem-sidebar-item" style="font-size:10px;opacity:0.6">`;
        html += `<span class="schem-sb-name">${esc(nodeDisplayName(nA.id))} \u2194 ${esc(nodeDisplayName(nB.id))}</span>`;
        html += `</div>`;
      }
      if (unassignedSegs.length > 20) html += `<div style="padding:4px 12px;font-size:10px;color:var(--text-muted)">...and ${unassignedSegs.length - 20} more</div>`;
    }
  }

  listEl.innerHTML = html;
  listEl.querySelectorAll('.schem-sidebar-item').forEach(el => {
    el.addEventListener('pointerdown', e => {
      const gid = el.dataset.gid, nid = el.dataset.nid;
      if (!gid || !nid) return;
      _schemState.sidebarDrag = { groupId: gid, nodeId: nid };
      _schemState.ghostPos = null;
      e.preventDefault();
    });
  });
}

// ---- Context menus ----

function schemRenderSegmentMenu(el) {
  const sel = _schemState.selectedRoute;
  const group = getGroup(sel.groupId);
  if (!group) return;
  const fromN = getNode(sel.fromId), toN = getNode(sel.toId);
  const fromName = fromN ? esc(nodeDisplayName(fromN.id)) : '?';
  const toName = toN ? esc(nodeDisplayName(toN.id)) : '?';
  const fg = contrastText(group.color || '#888');
  const curStyle = schemGetStyle(sel.groupId, sel.edgeKey);

  let html = `<div style="padding:10px 12px">`;
  html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">`;
  html += `<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${group.color || '#888'}"></span>`;
  html += `<span style="font-size:13px;font-weight:700">${fromName} \u2194 ${toName}</span>`;
  html += `</div>`;
  html += `<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${esc(group.name)}</div>`;

  // Segment Style
  html += `<div class="schem-ctx-section">Segment Style</div>`;
  html += `<div style="padding:2px 8px;margin-bottom:8px">`;
  for (const s of SCHEM_STYLES) {
    const active = curStyle === s ? ' active' : '';
    html += `<span class="schem-ctx-style${active}" onclick="schemSetSegmentStyle('${sel.groupId}','${sel.edgeKey}','${s}');renderSchemSidebar()">${s}</span>`;
  }
  html += `</div>`;

  // Bend Points
  html += `<button class="schem-ctx-btn${_schemState.bendEditing ? ' active' : ''}" onclick="_schemState.bendEditing=!_schemState.bendEditing;renderSchematic();renderSchemSidebar()">`;
  html += `${_schemState.bendEditing ? '\u25C9' : '\u25CB'} Bend Points${_schemState.bendEditing ? ' (editing)' : ''} <span style="float:right;opacity:0.5;font-size:10px">E</span></button>`;

  // Segment Priority
  const curSegPri = data.beckmap.segmentPriority?.[sel.groupId]?.[sel.edgeKey] || 0;
  html += `<div style="display:flex;align-items:center;gap:4px;padding:2px 8px;font-size:11px;margin-top:4px">`;
  html += `<span style="color:var(--text-muted)">Z-order:</span>`;
  html += `<button class="schem-ctx-btn" style="width:24px;padding:2px;text-align:center" onclick="schemSetSegmentPriority('${sel.groupId}','${sel.edgeKey}',${curSegPri - 1})">\u25BC</button>`;
  html += `<span style="min-width:16px;text-align:center">${curSegPri}</span>`;
  html += `<button class="schem-ctx-btn" style="width:24px;padding:2px;text-align:center" onclick="schemSetSegmentPriority('${sel.groupId}','${sel.edgeKey}',${curSegPri + 1})">\u25B2</button>`;
  html += `</div>`;

  // Show Line
  html += `<button class="schem-ctx-btn" onclick="_schemState.selectedLine='${sel.groupId}';_schemState.selectedRoute=null;_schemState.bendEditing=false;renderSchematic();renderSchemSidebar()">\u25B6 Show Line</button>`;

  // Close
  html += `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px">`;
  html += `<button class="schem-ctx-btn" onclick="_schemState.selectedRoute=null;_schemState.bendEditing=false;renderSchematic();renderSchemSidebar()" style="color:var(--text-muted)">\u2715 Close</button>`;
  html += `</div></div>`;
  el.innerHTML = html;
}

function schemRenderLineMenu(el) {
  const gid = _schemState.selectedLine;
  const group = getGroup(gid);
  if (!group) return;
  const fg = contrastText(group.color || '#888');
  const curStyle = data.beckmap.lineStyles?.[gid] || 'full';

  let html = `<div style="padding:10px 12px">`;
  html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">`;
  html += `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${group.color || '#888'}"></span>`;
  html += `<span style="font-size:13px;font-weight:700">${esc(group.name)}</span>`;
  html += `</div>`;

  // Line Style
  html += `<div class="schem-ctx-section">Default Line Style</div>`;
  html += `<div style="padding:2px 8px;margin-bottom:8px">`;
  for (const s of SCHEM_STYLES) {
    const active = curStyle === s ? ' active' : '';
    html += `<span class="schem-ctx-style${active}" onclick="schemSetLineStyle('${gid}','${s}');renderSchemSidebar()">${s}</span>`;
  }
  html += `</div>`;

  // Render Priority
  const curPri = data.beckmap.linePriority?.[gid] || 0;
  html += `<div class="schem-ctx-section">Render Priority</div>`;
  html += `<div style="padding:2px 8px;margin-bottom:8px;display:flex;align-items:center;gap:6px;font-size:11px">`;
  html += `<button class="schem-ctx-btn" style="width:28px;padding:4px;text-align:center" onclick="schemSetLinePriority('${gid}',${curPri - 1})">\u25BC</button>`;
  html += `<span style="min-width:20px;text-align:center">${curPri}</span>`;
  html += `<button class="schem-ctx-btn" style="width:28px;padding:4px;text-align:center" onclick="schemSetLinePriority('${gid}',${curPri + 1})">\u25B2</button>`;
  html += `<span style="color:var(--text-muted)">Higher = on top</span>`;
  html += `</div>`;

  // Back / Close
  html += `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px">`;
  html += `<button class="schem-ctx-btn" onclick="_schemState.selectedLine=null;renderSchematic();renderSchemSidebar()" style="color:var(--text-muted)">\u2715 Close</button>`;
  html += `</div></div>`;
  el.innerHTML = html;
}

function schemRenderStationMenu(el) {
  const { nodeId: nid, groupId: selGid } = _schemState.selectedStation;
  const node = getNode(nid);
  if (!node) return;
  const selGroup = getGroup(selGid);
  const lsKey = `${selGid}|${nid}`;
  const myGroupId = schemGetGroup(lsKey);
  let groupLabelKey = lsKey;
  if (myGroupId) groupLabelKey = `group:${myGroupId}|${nodeDisplayName(nid)}`;
  const groupLabelKeyEsc = groupLabelKey.replace(/'/g, "\\'");
  const labelOv = data.beckmap.labelOverrides?.[groupLabelKey] || 'auto';
  const ls = data.beckmap.lineStations || {};

  let html = `<div style="padding:10px 12px">`;
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:2px">${esc(node.name)}</div>`;
  if (selGroup) {
    const fg = contrastText(selGroup.color || '#888');
    html += `<div style="margin-bottom:10px"><span style="font-size:10px;padding:2px 8px;border-radius:8px;background:${selGroup.color || '#888'};color:${fg}">${esc(selGroup.name)}</span></div>`;
  }

  // ---- Label Direction (3x3 grid + Off) ----
  html += `<div class="schem-ctx-section">Label Direction</div>`;
  html += `<div style="padding:2px 8px;margin-bottom:4px">`;
  const grid = [
    ['nw', 'n', 'ne'],
    ['w', 'auto', 'e'],
    ['sw', 's', 'se']
  ];
  const arrows = { nw: '\u2196', n: '\u2191', ne: '\u2197', w: '\u2190', auto: '\u25C9', e: '\u2192', sw: '\u2199', s: '\u2193', se: '\u2198' };
  html += `<div style="display:inline-grid;grid-template-columns:repeat(3,28px);gap:2px">`;
  for (const row of grid) {
    for (const d of row) {
      const active = (labelOv === d || (labelOv === 'auto' && d === 'auto')) ? ' active' : '';
      const title = d === 'auto' ? 'Auto' : d.toUpperCase();
      html += `<span class="schem-ctx-style${active}" style="text-align:center;padding:4px 0" onclick="schemSetLabelOverride('${groupLabelKeyEsc}','${d}')" title="${title}">${arrows[d]}</span>`;
    }
  }
  html += `</div>`;
  // Off checkbox
  html += `<label style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11px;cursor:pointer">`;
  html += `<input type="checkbox" ${labelOv === 'none' ? 'checked' : ''} onchange="schemSetLabelOverride('${groupLabelKeyEsc}',this.checked?'none':'auto')"/>`;
  html += `<span>Hide label</span></label>`;
  const wrapKey = groupLabelKey;
  const wrapKeyEsc = groupLabelKeyEsc;
  const wrapVal = data.beckmap.labelWrap?.[wrapKey] || 'auto'; // 'auto' | 'single' | 'split'
  html += `<div style="display:flex;gap:2px;margin-top:3px">`;
  for (const w of ['auto', 'single', 'split']) {
    const active = wrapVal === w ? ' active' : '';
    const label = w === 'auto' ? 'Auto' : w === 'single' ? '1 line' : '2 lines';
    html += `<span class="schem-ctx-style${active}" style="font-size:10px;padding:2px 6px" onclick="schemSetLabelWrap('${wrapKeyEsc}','${w}')">${label}</span>`;
  }
  html += `</div>`;
  html += `</div>`;

  // ---- Mark Type (only for stations that default to tick) ----
  const markInfo = schemBuildMarkCache().stationInfo[lsKey];
  if (markInfo && (markInfo.mark === 'tick' || markInfo.mark === 'terminus')) {
    const curMark = data.beckmap.markOverrides?.[lsKey] || 'auto';
    html += `<div class="schem-ctx-section">Station Mark</div>`;
    html += `<div style="padding:2px 8px;margin-bottom:8px;display:flex;gap:2px">`;
    for (const m of ['auto', 'blob']) {
      const active = curMark === m ? ' active' : '';
      const label = m === 'auto' ? `Auto (${markInfo.mark})` : 'Blob';
      html += `<span class="schem-ctx-style${active}" onclick="schemSetMarkOverride('${lsKey}','${m}')">${label}</span>`;
    }
    html += `</div>`;
  }

  // ---- Station Group (named groups) ----
  const myGroup = myGroupId ? data.beckmap.stationGroups[myGroupId] : null;

  // Build candidate nodeIds this station could group with (same name, ISI/OSI, same nodeId)
  const candidateNids = new Set();
  const myDisplayName = nodeDisplayName(nid);
  for (const n of data.nodes) {
    if (n.id === nid || !isPassengerStop(n)) continue;
    if (nodeDisplayName(n.id) === myDisplayName) candidateNids.add(n.id);
  }
  for (const seg of data.segments) {
    if (!isInterchange(seg)) continue;
    if (seg.nodeA === nid) candidateNids.add(seg.nodeB);
    if (seg.nodeB === nid) candidateNids.add(seg.nodeA);
  }
  candidateNids.add(nid); // same nodeId on different lines

  // Check if an lsKey is a valid candidate (shares relationship with this station)
  const isValidCandidate = (ck) => {
    const [cg, cn] = ck.split('|');
    return candidateNids.has(cn);
  };

  // Check if this station can move to a group (shares relationship with at least one member)
  const canJoinGroup = (sgId) => {
    const sg = data.beckmap.stationGroups[sgId];
    if (!sg) return false;
    return sg.members.some(mk => { const [mg, mn] = mk.split('|'); return candidateNids.has(mn); });
  };

  // Build group name with line info for disambiguation
  const groupLabel = (sg) => {
    const lines = new Set();
    for (const mk of sg.members) { const g = getGroup(mk.split('|')[0]); if (g) lines.add(g.name); }
    return esc(sg.name) + (lines.size ? ` <span style="opacity:0.5">(${[...lines].map(l => esc(l)).join(', ')})</span>` : '');
  };

  // Collect nearby unassigned candidates
  const myMemberSet = new Set(myGroup?.members || []);
  const addCandidates = [];
  for (const cnid of candidateNids) {
    for (const gid2 in ls) {
      if (!ls[gid2][cnid]) continue;
      const ck = `${gid2}|${cnid}`;
      if (ck === lsKey || myMemberSet.has(ck)) continue;
      if (!ls[gid2][cnid]) continue;
      const cNode = getNode(cnid);
      const cLine = getGroup(gid2);
      if (!cNode) continue;
      const label = esc(cNode.name) + (cLine ? ` <span style="opacity:0.5">[${esc(cLine.name)}]</span>` : '');
      addCandidates.push({ lsKey: ck, label });
    }
  }

  // Collect valid groups to move to
  const validMoveGroups = [];
  for (const sgId in data.beckmap.stationGroups) {
    if (sgId === myGroupId) continue;
    if (canJoinGroup(sgId)) validMoveGroups.push(sgId);
  }

  // Only show section if there's something to show
  const hasContent = myGroup || addCandidates.length || validMoveGroups.length;
  if (hasContent) {
    html += `<div class="schem-ctx-section">Station Group</div>`;
    html += `<div style="padding:4px 8px;margin-bottom:8px;font-size:11px">`;

    if (myGroup) {
      // Group header with line badges
      const groupLines = new Set();
      for (const mk of myGroup.members) { const g = getGroup(mk.split('|')[0]); if (g) groupLines.add(g); }
      html += `<div style="margin-bottom:6px">`;
      html += `<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:2px">${esc(myGroup.name)}</div>`;
      if (groupLines.size) {
        html += `<div style="display:flex;gap:3px;flex-wrap:wrap">`;
        for (const gl of groupLines) {
          const fg = contrastText(gl.color || '#888');
          html += `<span style="font-size:8px;padding:1px 5px;border-radius:6px;background:${gl.color || '#888'};color:${fg}">${esc(gl.name)}</span>`;
        }
        html += `</div>`;
      }
      html += `</div>`;

      // Member list
      for (const mk of myGroup.members) {
        const [mGid, mNid] = mk.split('|');
        const mNode = getNode(mNid);
        const mLine = getGroup(mGid);
        if (!mNode) continue;
        const isSelf = mk === lsKey;
        html += `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px${isSelf ? ';font-weight:600' : ';opacity:0.7'}">`;
        html += `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${mLine?.color || '#888'};flex-shrink:0"></span>`;
        html += `<span style="flex:1">${esc(mNode.name)}</span>`;
        if (myGroup.members.length > 2 || !isSelf) {
          html += `<button onclick="schemRemoveFromGroup('${mk}');save();renderSchematic();renderSchemSidebar()" style="font-size:9px;padding:0 4px;border:1px solid var(--border);border-radius:3px;background:none;color:var(--text-muted);cursor:pointer">\u2715</button>`;
        }
        html += `</div>`;
      }

      // Move dropdown (only if there are valid targets)
      if (validMoveGroups.length) {
        html += `<div style="margin-top:6px">`;
        html += `<select onchange="if(this.value==='new'){schemCreateGroup('${lsKey}');save();renderSchematic();renderSchemSidebar();}else if(this.value==='solo'){schemRemoveFromGroup('${lsKey}');save();renderSchematic();renderSchemSidebar();}else if(this.value){schemMoveToGroup('${lsKey}',this.value);save();renderSchematic();renderSchemSidebar();}" style="font-size:11px;padding:2px 4px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:3px;width:100%">`;
        html += `<option value="">Move this station...</option>`;
        html += `<option value="solo">Ungrouped</option>`;
        html += `<option value="new">New Group</option>`;
        for (const sgId of validMoveGroups) {
          html += `<option value="${sgId}">${esc(data.beckmap.stationGroups[sgId].name)}</option>`;
        }
        html += `</select></div>`;
      } else {
        // Just show leave option
        html += `<div style="margin-top:4px"><button class="schem-ctx-btn" onclick="schemRemoveFromGroup('${lsKey}');save();renderSchematic();renderSchemSidebar()" style="font-size:10px;color:var(--text-muted)">Leave group</button></div>`;
      }
    } else if (validMoveGroups.length || addCandidates.length) {
      html += `<div style="color:var(--text-muted);margin-bottom:4px">Not in a group</div>`;
      if (validMoveGroups.length) {
        html += `<select onchange="if(this.value==='new'){schemCreateGroup('${lsKey}');save();renderSchematic();renderSchemSidebar();}else if(this.value){schemMoveToGroup('${lsKey}',this.value);save();renderSchematic();renderSchemSidebar();}" style="font-size:11px;padding:2px 4px;background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:3px;width:100%">`;
        html += `<option value="">Join group...</option>`;
        for (const sgId of validMoveGroups) {
          html += `<option value="${sgId}">${esc(data.beckmap.stationGroups[sgId].name)}</option>`;
        }
        html += `</select>`;
      }
    }

    // Nearby candidates
    if (addCandidates.length) {
      html += `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px">`;
      html += `<div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Nearby:</div>`;
      for (const ac of addCandidates) {
        html += `<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">`;
        html += `<span style="flex:1">${ac.label}</span>`;
        html += `<button onclick="schemAddToGroupOf('${lsKey}','${ac.lsKey}');save();renderSchematic();renderSchemSidebar()" style="font-size:9px;padding:1px 6px;border:1px solid var(--border);border-radius:3px;background:none;color:var(--text-muted);cursor:pointer">Add</button>`;
        html += `</div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  // Close
  html += `<div style="border-top:1px solid var(--border);padding-top:8px">`;
  html += `<button class="schem-ctx-btn" onclick="schemDeselectAll()" style="color:var(--text-muted)">\u2715 Close</button>`;
  html += `</div></div>`;
  el.innerHTML = html;
}

function schemRenderConnMenu(el) {
  const conn = _schemState.selectedConn;
  if (!conn) return;
  const fromNode = getNode(conn.fromNid), toNode = getNode(conn.toNid);
  const fromName = fromNode ? esc(nodeDisplayName(fromNode.id)) : '?';
  const toName = toNode ? esc(nodeDisplayName(toNode.id)) : '?';
  const typeLabel = conn.type === 'isi' ? 'In-Station Interchange' : 'Out-of-Station Interchange';
  const curStyle = data.beckmap.segmentStyles?.['isiosi']?.[conn.edgeKey] || 'full';

  let html = `<div style="padding:10px 12px">`;
  html += `<div style="font-size:13px;font-weight:700;margin-bottom:2px">${fromName} \u2194 ${toName}</div>`;
  html += `<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">${typeLabel}</div>`;

  // Style
  html += `<div class="schem-ctx-section">Connector Style</div>`;
  html += `<div style="padding:2px 8px;margin-bottom:8px">`;
  for (const s of ['full', 'hidden']) {
    const active = curStyle === s ? ' active' : '';
    html += `<span class="schem-ctx-style${active}" onclick="schemSetConnStyle('${conn.edgeKey}','${s}')">${s}</span>`;
  }
  html += `</div>`;

  // Bend Points
  html += `<button class="schem-ctx-btn${_schemState.bendEditing ? ' active' : ''}" onclick="_schemState.bendEditing=!_schemState.bendEditing;renderSchematic();renderSchemSidebar()">`;
  html += `${_schemState.bendEditing ? '\u25C9' : '\u25CB'} Bend Points${_schemState.bendEditing ? ' (editing)' : ''} <span style="float:right;opacity:0.5;font-size:10px">E</span></button>`;

  // Close
  html += `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:8px">`;
  html += `<button class="schem-ctx-btn" onclick="schemDeselectAll()" style="color:var(--text-muted)">\u2715 Close</button>`;
  html += `</div></div>`;
  el.innerHTML = html;
}

function schemSetConnStyle(edgeKey, style) {
  if (!data.beckmap.segmentStyles) data.beckmap.segmentStyles = {};
  if (!data.beckmap.segmentStyles['isiosi']) data.beckmap.segmentStyles['isiosi'] = {};
  if (style === 'full') delete data.beckmap.segmentStyles['isiosi'][edgeKey];
  else data.beckmap.segmentStyles['isiosi'][edgeKey] = style;
  save(); renderSchematic(); renderSchemSidebar();
}

function schemDeselectAll() {
  _schemState.selectedStation = null;
  _schemState.selectedRoute = null;
  _schemState.selectedLine = null;
  _schemState.selectedConn = null;
  _schemState.bendEditing = false;
  renderSchematic(); renderSchemSidebar();
}

function schemSetLabelOverride(nodeId, dir) {
  if (!data.beckmap.labelOverrides) data.beckmap.labelOverrides = {};
  if (dir === 'auto') delete data.beckmap.labelOverrides[nodeId];
  else data.beckmap.labelOverrides[nodeId] = dir;
  save(); renderSchematic(); renderSchemSidebar();
}

function schemSetLabelWrap(key, mode) {
  if (!data.beckmap.labelWrap) data.beckmap.labelWrap = {};
  if (mode === 'auto') delete data.beckmap.labelWrap[key];
  else data.beckmap.labelWrap[key] = mode;
  save(); renderSchematic(); renderSchemSidebar();
}

function schemSetMarkOverride(lsKey, mark) {
  if (!data.beckmap.markOverrides) data.beckmap.markOverrides = {};
  if (mark === 'auto') delete data.beckmap.markOverrides[lsKey];
  else data.beckmap.markOverrides[lsKey] = mark;
  save(); renderSchematic(); renderSchemSidebar();
}

// Add a candidate lsKey to the same group as the target lsKey.
// If target has no group, create one with both.
function schemAddToGroupOf(targetLsKey, candidateLsKey) {
  let groupId = schemGetGroup(targetLsKey);
  if (!groupId) {
    // Create new group with the target
    groupId = schemCreateGroup(targetLsKey);
  }
  schemRemoveFromGroup(candidateLsKey); // remove from any existing group
  data.beckmap.stationGroups[groupId].members.push(candidateLsKey);
}

// ---- Rendering ----

// Remove line-stations that are no longer served by any service on that line.
function schemCleanOrphanedStations() {
  const ls = data.beckmap.lineStations;
  if (!ls) return;
  let changed = false;
  for (const gid in ls) {
    // Find all station nodeIds still served by this line's services
    const served = new Set();
    for (const svc of data.services) {
      if (svc.groupId !== gid) continue;
      for (const stop of svc.stops) served.add(stop.nodeId);
    }
    for (const nid in ls[gid]) {
      if (!served.has(nid)) { delete ls[gid][nid]; changed = true; }
    }
    // Remove empty line entries
    if (!Object.keys(ls[gid]).length) { delete ls[gid]; changed = true; }
  }
  // Clean up orphaned bend points
  const bends = data.beckmap.routeBends;
  if (bends) {
    for (const gid in bends) {
      if (gid === 'isiosi') continue; // ISI/OSI bends handled separately
      for (const ek in bends[gid]) {
        const parts = ek.split('|');
        if (parts.length === 2) {
          const hasA = !!ls[gid]?.[parts[0]], hasB = !!ls[gid]?.[parts[1]];
          if (!hasA || !hasB) { delete bends[gid][ek]; changed = true; }
        }
      }
      if (!Object.keys(bends[gid]).length) { delete bends[gid]; changed = true; }
    }
  }
  if (changed) save();
}

// Render cache — computed once per render, used by multiple subsystems
let _renderCache = {};

function renderSchematic() {
  schemCleanOrphanedStations();
  // Build render cache
  _renderCache = { interchanges: schemFindInterchanges(), routes: {} };
  for (const group of data.serviceGroups) _renderCache.routes[group.id] = schemDeriveRoutes(group.id);

  const svg = document.getElementById('schem-svg');
  if (!svg) return;
  const wrap = document.getElementById('schem-canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  let svgContent = '';
  const isDragging = !!(_schemState.lsDrag || _schemState.sidebarDrag);

  // ---- Grid ----
  const gridMinZoom = isDragging ? 0.3 : 0.6;
  if (_schemState.zoom > gridMinZoom) {
    const wl = -_schemState.viewX / _schemState.zoom;
    const wt = -_schemState.viewY / _schemState.zoom;
    const wr = (w - _schemState.viewX) / _schemState.zoom;
    const wb = (h - _schemState.viewY) / _schemState.zoom;
    const sc = Math.floor(wl / SCHEM_CELL), ec = Math.ceil(wr / SCHEM_CELL);
    const sr = Math.floor(wt / SCHEM_CELL), er = Math.ceil(wb / SCHEM_CELL);
    const cellCount = (ec - sc) * (er - sr);
    if (isDragging) {
      // Grid lines while dragging — skip every Nth cell if too many
      const step = cellCount > 50000 ? 5 : cellCount > 20000 ? 2 : 1;
      svgContent += `<g stroke="#aac" stroke-width="1">`;
      for (let c = sc; c <= ec; c += step) {
        const sx = _schemState.viewX + c * SCHEM_CELL * _schemState.zoom;
        svgContent += `<line x1="${sx.toFixed(1)}" y1="0" x2="${sx.toFixed(1)}" y2="${h}"/>`;
      }
      for (let r = sr; r <= er; r += step) {
        const sy = _schemState.viewY + r * SCHEM_CELL * _schemState.zoom;
        svgContent += `<line x1="0" y1="${sy.toFixed(1)}" x2="${w}" y2="${sy.toFixed(1)}"/>`;
      }
      svgContent += '</g>';
    } else if (!isDragging && cellCount < 10000) {
      svgContent += '<g opacity="0.18">';
      for (let c = sc; c <= ec; c++) for (let r = sr; r <= er; r++) {
        const sp = schemWorldToScreen(c * SCHEM_CELL, r * SCHEM_CELL);
        svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="0.8" fill="#bbb"/>`;
      }
      svgContent += '</g>';
    }
  }

  // ---- Origin crosshair ----
  const o = schemWorldToScreen(0, 0);
  svgContent += `<g opacity="0.15"><line x1="${o.x - 12}" y1="${o.y}" x2="${o.x + 12}" y2="${o.y}" stroke="#999" stroke-width="1"/><line x1="${o.x}" y1="${o.y - 12}" x2="${o.x}" y2="${o.y + 12}" stroke="#999" stroke-width="1"/></g>`;

  // ---- Infrastructure segments (grey, behind line routes) ----
  const lineWidth = Math.max(3, _schemState.zoom * 5.5);
  if (getSetting('beckShowInfra', false)) {
    const ls = data.beckmap.lineStations || {};
    const infraSt = data.beckmap.infraStations || {};
    // Collect all placed station nodeIds across all lines + infra
    const allPlacedNids = new Set();
    const nidToPos = {};
    for (const gid in ls) for (const nid in ls[gid]) {
      allPlacedNids.add(nid);
      if (!nidToPos[nid]) nidToPos[nid] = ls[gid][nid];
    }
    for (const nid in infraSt) {
      allPlacedNids.add(nid);
      if (!nidToPos[nid]) nidToPos[nid] = infraSt[nid];
    }
    // Also include unassigned stations that have beckmap positions but no line
    // (these would need their own placement — for now, infra mode only shows placed stations)

    // Collect edges covered by line routes
    const coveredEdges = new Set();
    for (const group of data.serviceGroups) {
      const routes = _renderCache.routes[group.id] || [];
      for (const route of routes) {
        if (route.edgeKey) coveredEdges.add(route.edgeKey);
      }
    }
    // Draw grey segments for track/road connections between placed stations NOT covered by any line
    const infraWidth = lineWidth * 0.6;
    const drawnInfra = new Set();
    for (const seg of data.segments) {
      if (seg.interchangeType === 'isi' || seg.interchangeType === 'osi') continue; // skip interchanges
      if (!allPlacedNids.has(seg.nodeA) || !allPlacedNids.has(seg.nodeB)) continue;
      const ek = schemEdgeKey(seg.nodeA, seg.nodeB);
      if (drawnInfra.has(ek)) continue;
      if (coveredEdges.has(ek)) continue; // already covered by a line route
      drawnInfra.add(ek);
      const from = nidToPos[seg.nodeA], to = nidToPos[seg.nodeB];
      if (!from || !to) continue;
      const bends = schemGetBends('infra', ek);
      const cells = schemRouteWithBends(from, to, bends);
      const cornerR = SCHEM_CELL * _schemState.zoom * 0.35;
      const d = schemSmoothPath(cells, cornerR);
      const isRoad = seg.interchangeType === 'road';
      const style = isRoad ? `stroke-dasharray="${lineWidth * 1.5} ${lineWidth}"` : '';
      svgContent += `<path d="${d}" stroke="#bbb" stroke-width="${infraWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" ${style}/>`;
    }
  }

  // ---- Line routes ----
  const selKey = _schemState.selectedRoute?.edgeKey;
  const selGid = _schemState.selectedRoute?.groupId;

  const hasSel = !!(_schemState.selectedRoute || _schemState.selectedLine || _schemState.selectedStation || _schemState.selectedConn);
  // Build set of node IDs involved with the current selection (for dimming)
  const involvedNodes = new Set();
  if (_schemState.selectedRoute) {
    involvedNodes.add(_schemState.selectedRoute.fromId);
    involvedNodes.add(_schemState.selectedRoute.toId);
  }
  if (_schemState.selectedLine) {
    const sls = data.beckmap.lineStations?.[_schemState.selectedLine];
    if (sls) for (const nid in sls) involvedNodes.add(nid);
  }
  const selectedLsKey = _schemState.selectedStation ? `${_schemState.selectedStation.groupId}|${_schemState.selectedStation.nodeId}` : null;
  if (_schemState.selectedStation) {
    involvedNodes.add(_schemState.selectedStation.nodeId);
  }

  // Collect all route segments, sort by priority (line priority + segment priority)
  const linePri = data.beckmap.linePriority || {};
  const segPri = data.beckmap.segmentPriority || {};
  const allRouteSegs = [];
  for (const group of data.serviceGroups) {
    const routes = _renderCache.routes[group.id] || [];
    for (const route of routes) {
      const lp = linePri[group.id] || 0;
      const sp = segPri[group.id]?.[route.edgeKey] || 0;
      allRouteSegs.push({ group, route, priority: lp + sp });
    }
  }
  allRouteSegs.sort((a, b) => a.priority - b.priority);

  let _doubleInners = [];
  let _lastPriority = allRouteSegs.length ? allRouteSegs[0].priority : 0;

  for (const rs of allRouteSegs) {
    const { group, route, priority } = rs;
    // When priority level changes, flush deferred double-struck inners
    if (priority !== _lastPriority && _doubleInners.length) {
      for (const di of _doubleInners) svgContent += `<path d="${di.d}" stroke="#fff" stroke-width="${di.lineWidth * 0.45}" stroke-linecap="round" stroke-linejoin="round" fill="none"${di.dimAttr}/>`;
      _doubleInners = [];
    }
    _lastPriority = priority;
    const color = group.color || '#888';
      if (route.cells.length < 2) continue;
      const style = schemGetStyle(group.id, route.edgeKey);
      if (style === 'hidden') continue;
      const cornerR = SCHEM_CELL * _schemState.zoom * 0.35;
      const d = schemSmoothPath(route.cells, cornerR);
      // Dim non-selected routes when something is selected
      const isSelected = (_schemState.selectedRoute?.groupId === group.id && _schemState.selectedRoute?.edgeKey === route.edgeKey)
        || (_schemState.selectedLine === group.id);
      const dimAttr = (hasSel && !isSelected) ? ' class="schem-dimmed"' : '';
      const gidAttr = ` data-gid="${group.id}"`;
      if (style === 'double') {
        // Double: just outer for now, inner deferred
        svgContent += `<path d="${d}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none"${gidAttr}${dimAttr}/>`;
        _doubleInners.push({ d, lineWidth, dimAttr });
      } else if (style === 'punched') {
        const u = Math.max(3, lineWidth);
        const da = `${(u * 2).toFixed(1)} ${(u * 1.8).toFixed(1)}`;
        svgContent += `<g${gidAttr}${dimAttr}><path d="${d}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
        svgContent += `<path d="${d}" stroke="#fff" stroke-width="${lineWidth * 0.45}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
        svgContent += `<path d="${d}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="butt" stroke-linejoin="round" fill="none" stroke-dasharray="${da}"/></g>`;
      } else if (style === 'dotted') {
        // Dotted: outlined + square blocks (like punched but with blocks)
        const blockSize = Math.max(2, lineWidth * 0.8);
        const da = `${blockSize.toFixed(1)} ${blockSize.toFixed(1)}`;
        // 1. Solid outlined base (colour outer, white inner)
        svgContent += `<g${gidAttr}${dimAttr}><path d="${d}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
        svgContent += `<path d="${d}" stroke="#fff" stroke-width="${lineWidth * 0.45}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
        // 2. Square-blocked overlay
        svgContent += `<path d="${d}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="butt" stroke-linejoin="round" fill="none" stroke-dasharray="${da}"/></g>`;
      } else if (style === 'arrows') {
        // Arrows: solid line + directional chevrons along the path
        svgContent += `<path d="${d}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none"${gidAttr}${dimAttr}/>`;
        // Draw chevrons at regular intervals, skipping near edges
        const cells = route.cells;
        const interval = Math.max(3, Math.round(4));
        const chevSize = lineWidth * 0.7;
        const edgeMargin = 2; // skip this many cells from start/end
        for (let ci = Math.max(interval, edgeMargin); ci < cells.length - edgeMargin; ci += interval) {
          const cur = cells[ci], prev = cells[ci - 1];
          const dx = cur.gx - prev.gx, dy = cur.gy - prev.gy;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          // Direction unit vector
          const ux = dx / len, uy = dy / len;
          // Perpendicular
          const px = -uy, py = ux;
          const sp = schemWorldToScreen(cur.gx * SCHEM_CELL, cur.gy * SCHEM_CELL);
          const cs = chevSize * _schemState.zoom;
          // Two lines forming a > shape pointing in travel direction
          const pw = Math.min(cs, lineWidth * 0.45); // perpendicular extent clamped to line width
          const tipX = sp.x + ux * cs * 0.4, tipY = sp.y + uy * cs * 0.4;
          const lx = sp.x - ux * cs * 0.4 + px * pw, ly = sp.y - uy * cs * 0.4 + py * pw;
          const rx = sp.x - ux * cs * 0.4 - px * pw, ry = sp.y - uy * cs * 0.4 - py * pw;
          svgContent += `<path d="M${lx.toFixed(1)},${ly.toFixed(1)} L${tipX.toFixed(1)},${tipY.toFixed(1)} L${rx.toFixed(1)},${ry.toFixed(1)}" stroke="#fff" stroke-width="${Math.max(1.5, _schemState.zoom * 1.5)}" stroke-linecap="round" stroke-linejoin="round" fill="none" pointer-events="none"${dimAttr ? ' opacity="0.2"' : ''}/>`;
        }
      } else {
        const styleAttr = schemStyleAttrs(style, lineWidth);
        svgContent += `<path d="${d}" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round" fill="none" ${styleAttr}${gidAttr}${dimAttr}/>`;
      }
  }

  // Flush remaining double-struck white inners from last priority batch
  if (_doubleInners.length) {
    for (const di of _doubleInners) svgContent += `<path d="${di.d}" stroke="#fff" stroke-width="${di.lineWidth * 0.45}" stroke-linecap="round" stroke-linejoin="round" fill="none"${di.dimAttr}/>`;
  }

  // ---- Build mark cache (tick/terminus/interchange/simple for each line-station) ----
  const markCache = schemBuildMarkCache();
  const sw = _schemState.zoom * 2;

  // ---- Detect hidden stations (all edges hidden → hide the map-node) ----
  const hiddenLsKeys = new Set(); // "gid|nid" keys where all edges are hidden
  const lsData = data.beckmap.lineStations || {};
  for (const gid in lsData) {
    const edges = schemCollectEdges(gid);
    for (const nid in lsData[gid]) {
      // Find all edges this station participates in
      const myEdges = edges.filter(e => e.fromId === nid || e.toId === nid);
      if (myEdges.length > 0 && myEdges.every(e => schemGetStyle(gid, e.key) === 'hidden')) {
        hiddenLsKeys.add(`${gid}|${nid}`);
      }
    }
  }

  // ---- ISI/OSI connectors (behind blobs, 45°-routed, dotted, clickable) ----
  const isiOsi = schemFindISIOSI();
  const dotW = Math.max(1.5, _schemState.zoom * 2);
  const dotGap = Math.max(3, _schemState.zoom * 4);
  for (const conn of isiOsi) {
    // Check style (hidden = skip)
    const connStyle = data.beckmap.segmentStyles?.['isiosi']?.[conn.edgeKey] || 'full';
    if (connStyle === 'hidden') continue;

    // Route through bends if defined, otherwise diagonal-first
    const fgx = Math.round(conn.fromGx), fgy = Math.round(conn.fromGy);
    const tgx = Math.round(conn.toGx), tgy = Math.round(conn.toGy);
    const connBends = schemGetBends('isiosi', conn.edgeKey);
    const from = { gx: fgx, gy: fgy }, to = { gx: tgx, gy: tgy };
    const leg = schemRouteWithBends(from, to, connBends);
    const d = leg.map((c, i) => {
      const sp = schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL);
      return `${i === 0 ? 'M' : 'L'}${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
    }).join(' ');
    const isSelConn = _schemState.selectedConn?.edgeKey === conn.edgeKey;
    const dimConn = hasSel && !isSelConn && !involvedNodes.has(conn.fromNid) && !involvedNodes.has(conn.toNid);
    // Invisible fat hit target for clicking
    svgContent += `<path class="schem-conn-hit" data-ek="${conn.edgeKey}" data-sid="${conn.segId}" data-fn="${conn.fromNid}" data-tn="${conn.toNid}" data-tp="${conn.type}" d="${d}" stroke="transparent" stroke-width="${Math.max(8, lineWidth)}" fill="none" style="cursor:pointer"/>`;
    // Visible dotted line
    svgContent += `<path d="${d}" stroke="#000" stroke-width="${dotW}" stroke-dasharray="0.1 ${dotGap.toFixed(1)}" stroke-linecap="square" fill="none" pointer-events="none"${dimConn ? ' class="schem-dimmed"' : ''}/>`;
    // Selection glow
    if (isSelConn) {
      svgContent += `<path d="${d}" stroke="#5b8af5" stroke-width="${dotW * 3}" stroke-linecap="round" fill="none" opacity="0.25" pointer-events="none"/>`;
    }
  }
  // Store for bend editing
  _schemState._lastIsiOsi = isiOsi;

  // ---- Interchange blobs ----
  const interchanges = _renderCache.interchanges;
  for (const ic of interchanges) {
    const dimIc = hasSel && !ic.nodeIds.some(nid => involvedNodes.has(nid));
    const icNids = ic.nodeIds ? ic.nodeIds.join(',') : '';
    if (dimIc) svgContent += '<g class="schem-dimmed">';
    svgContent += `<g data-ic-nids="${icNids}">${schemDrawInterchange(ic, sw, lineWidth)}</g>`;
    if (dimIc) svgContent += '</g>';
  }

  // Build sets of nodeIds in interchange blobs (for mark/label logic)
  const icNodeSet = new Set();
  for (const ic of interchanges) {
    for (const nid of ic.nodeIds) icNodeSet.add(nid);
  }

  const ls = data.beckmap.lineStations || {};
  const markR = _schemState.zoom * 3.5;
  const fontSize = _schemState.zoom * 7.5;
  const tickLen = _schemState.zoom * 2;

  // Collect visible line-stations and group by node (skip hidden)
  const byNode = {};
  for (const gid in ls) for (const nid in ls[gid]) {
    if (_schemState.lsDrag && _schemState.lsDrag.groupId === gid && _schemState.lsDrag.nodeId === nid) continue;
    if (hiddenLsKeys.has(`${gid}|${nid}`)) continue;
    if (!byNode[nid]) byNode[nid] = [];
    byNode[nid].push({ gid, ...ls[gid][nid] });
  }
  // Include infra stations (if infra mode enabled)
  if (getSetting('beckShowInfra', false)) {
    const infraSt = data.beckmap.infraStations || {};
    for (const nid in infraSt) {
      if (byNode[nid]) continue; // already has line-station entries
      if (_schemState.lsDrag && _schemState.lsDrag.groupId === '__infra__' && _schemState.lsDrag.nodeId === nid) continue;
      byNode[nid] = [{ gid: '__infra__', ...infraSt[nid] }];
    }
  }

  // ---- Labels (auto-positioned, 8-direction with collision) ----
  // Pre-build occupied points from route cells (as circles, not boxes — tighter collision)
  const routePoints = []; // [{x, y, r}] — screen coords + radius
  const cellPx = SCHEM_CELL * _schemState.zoom;
  const routeR = lineWidth * 0.6; // effective radius of a route line
  for (const group of data.serviceGroups) {
    const routes = markCache.lineRoutes[group.id] || [];
    for (const route of routes) {
      // Sample every 2nd cell for performance on large maps
      for (let ci = 0; ci < route.cells.length; ci += 2) {
        const c = route.cells[ci];
        const sp = schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL);
        routePoints.push({ x: sp.x, y: sp.y, r: routeR });
      }
    }
  }
  // ISI/OSI connector cells
  const isiOsiData = _schemState._lastIsiOsi || [];
  for (const conn of isiOsiData) {
    const fgx = Math.round(conn.fromGx), fgy = Math.round(conn.fromGy);
    const tgx = Math.round(conn.toGx), tgy = Math.round(conn.toGy);
    const connBends = schemGetBends('isiosi', conn.edgeKey);
    const leg = schemRouteWithBends({ gx: fgx, gy: fgy }, { gx: tgx, gy: tgy }, connBends);
    for (let ci = 0; ci < leg.length; ci += 2) {
      const sp = schemWorldToScreen(leg[ci].gx * SCHEM_CELL, leg[ci].gy * SCHEM_CELL);
      routePoints.push({ x: sp.x, y: sp.y, r: routeR * 0.5 });
    }
  }
  // Station marks as circles
  const stationPoints = []; // [{x, y, r, nid}]
  for (const nid in byNode) {
    for (const cell of byNode[nid]) {
      const sp = schemWorldToScreen(cell.gx * SCHEM_CELL, cell.gy * SCHEM_CELL);
      const blobR = icNodeSet.has(nid) ? SCHEM_CELL * _schemState.zoom * 0.5 : markR;
      stationPoints.push({ x: sp.x, y: sp.y, r: blobR, nid });
    }
  }

  const labelBoxes = []; // placed label boxes
  const charW = fontSize * 0.55;
  const labelOverrides = data.beckmap.labelOverrides || {};

  // Direction offsets for 8 directions
  const dirOffsets = {
    e:  { mx: 1,    my: 0,    anchor: 'start' },
    ne: { mx: 0.7,  my: -0.7, anchor: 'start' },
    n:  { mx: 0,    my: -1,   anchor: 'middle' },
    nw: { mx: -0.7, my: -0.7, anchor: 'end' },
    w:  { mx: -1,   my: 0,    anchor: 'end' },
    sw: { mx: -0.7, my: 0.7,  anchor: 'end' },
    s:  { mx: 0,    my: 1,    anchor: 'middle' },
    se: { mx: 0.7,  my: 0.7,  anchor: 'start' },
  };
  const dirPref = ['e', 'ne', 'se', 'n', 's', 'nw', 'sw', 'w']; // preference order

  // Build map: line-station key → group ID (for dedup and label key)
  const lsToGroupRoot = {};
  for (const ic of interchanges) {
    const root = ic.groupId; // named group ID
    for (const pos of ic.positions) lsToGroupRoot[`${pos.groupId}|${pos.nodeId}`] = root;
  }
  const labeledGroupNames = new Set(); // "groupRoot|displayName"

  // Build label entries: one per unique (group, displayName) or per ungrouped line-station.
  // For grouped entries, collect ALL cells from the entire interchange group.
  const labelEntries = [];

  // Pre-build: groupId → all positions in that group
  const groupAllPositions = {};
  for (const ic of interchanges) {
    groupAllPositions[ic.groupId] = ic.positions.map(p => ({ gid: p.groupId, nid: p.nodeId, gx: p.gx, gy: p.gy }));
  }

  const processedLsKeys = new Set(); // track which line-stations have been handled
  for (const nid in byNode) {
    const allCells = byNode[nid];
    for (const c of allCells) {
      const lsk = `${c.gid}|${nid}`;
      if (processedLsKeys.has(lsk)) continue;
      processedLsKeys.add(lsk);

      const root = lsToGroupRoot[lsk];
      if (root) {
        // Grouped: one label per (group, displayName), positioned from ALL group cells
        const dispName = nodeDisplayName(nid);
        const labelKey = `${root}|${dispName}`;
        if (labeledGroupNames.has(labelKey)) continue;
        labeledGroupNames.add(labelKey);
        // Only use cells from nodes sharing this display name (not the whole group)
        const allGroupCells = (groupAllPositions[root] || [c]).filter(gc => gc.nid ? nodeDisplayName(gc.nid) === dispName : true);
        labelEntries.push({ nid, gid: c.gid, cells: allGroupCells.length ? allGroupCells : [c] });
      } else {
        // Ungrouped: own label
        labelEntries.push({ nid, gid: c.gid, cells: [c] });
      }
    }
  }

  for (const entry of labelEntries) {
    const nid = entry.nid;
    const cells = entry.cells;
    // Check label override — try group key, then line-station key, then nodeId
    const entryLsKey = cells[0]?.gid ? `${cells[0].gid}|${nid}` : nid;
    const root = lsToGroupRoot[entryLsKey];
    // Also check stationGroups directly (for groups with only 1 placed member, not in interchanges)
    const directGroupId = root || schemGetGroup(entryLsKey);
    let override = 'auto';
    if (directGroupId) {
      const dispNameForKey = nodeDisplayName(nid);
      override = labelOverrides[`group:${directGroupId}|${dispNameForKey}`] || labelOverrides[`group:${directGroupId}`] || labelOverrides[entryLsKey] || 'auto';
    } else {
      override = labelOverrides[entryLsKey] || labelOverrides[nid] || 'auto';
    }
    if (override === 'none') continue;

    const node = getNode(nid);
    if (!node) continue;
    const rawName = nodeDisplayName(node.id);
    const name = esc(rawName);
    // Check noWrap setting (uses same key as label override)
    const noWrapKey = directGroupId ? `group:${directGroupId}|${nodeDisplayName(nid)}` : entryLsKey;
    const wrapData = data.beckmap.labelWrap || {};
    const wrapMode = wrapData[noWrapKey] || 'auto'; // 'auto' | 'single' | 'split'

    // Split on spaces and hyphens. Hyphen stays attached to the word before it.
    const words = [];
    let buf = '';
    for (let ci = 0; ci < rawName.length; ci++) {
      const ch = rawName[ci];
      if (ch === '-') {
        buf += '-';
        words.push(buf);
        buf = '';
      } else if (ch === ' ') {
        if (buf) { words.push(buf); buf = ''; }
      } else {
        buf += ch;
      }
    }
    if (buf) words.push(buf);

    // Join words back: add space only where previous word doesn't end with hyphen
    const joinWords = (arr) => arr.reduce((s, w, i) => i === 0 ? w : s + (s.endsWith('-') ? '' : ' ') + w, '');

    let wrapLines;
    const canSplit = words.length >= 2;
    const shouldAutoSplit = canSplit && rawName.length > 10;

    const doSplit = () => {
      let bestSplit = 1, bestDiff = Infinity;
      for (let s = 1; s < words.length; s++) {
        const diff = Math.abs(joinWords(words.slice(0, s)).length - joinWords(words.slice(s)).length);
        if (diff < bestDiff) { bestDiff = diff; bestSplit = s; }
      }
      return [joinWords(words.slice(0, bestSplit)), joinWords(words.slice(bestSplit))];
    };

    if (wrapMode === 'single') {
      wrapLines = [rawName];
    } else if (wrapMode === 'split' && canSplit) {
      wrapLines = doSplit();
    } else if (wrapMode === 'auto' && shouldAutoSplit) {
      wrapLines = doSplit();
    } else {
      wrapLines = [rawName];
    }
    const textW = Math.max(...wrapLines.map(l => l.length)) * charW;
    const textH = fontSize * wrapLines.length * 1.15;
    const dimLabel = (hasSel && !involvedNodes.has(nid));

    // Centroid of all line-station cells for this node
    const cxVal = cells.reduce((s, c) => s + c.gx, 0) / cells.length;
    const cyVal = cells.reduce((s, c) => s + c.gy, 0) / cells.length;
    const sp = schemWorldToScreen(cxVal * SCHEM_CELL, cyVal * SCHEM_CELL);

    const hasBlob = icNodeSet.has(nid);
    // Check if any line-station at this node is a terminus (needs more pad for T-bar)
    const isTerminus = cells.some(c => {
      const info = markCache.stationInfo[`${c.gid}|${nid}`];
      return info?.mark === 'terminus';
    });
    const isBlobOverride = cells.some(c => {
      const mo = data.beckmap.markOverrides?.[`${c.gid}|${nid}`];
      return mo === 'blob';
    });
    const blobOverrideR = Math.max(4, _schemState.zoom * 5);
    const pad = hasBlob ? SCHEM_CELL * _schemState.zoom * 0.7 : isBlobOverride ? blobOverrideR + fontSize * 0.2 : isTerminus ? tickLen * 3.5 : markR + fontSize * 0.3;

    // For multi-node stations, return centroid of all cells tied for outermost in chosen direction
    const outerCell = (dir) => {
      const d = dirOffsets[dir];
      let bestScore = -Infinity;
      for (const c of cells) {
        const score = c.gx * d.mx + c.gy * d.my;
        if (score > bestScore) bestScore = score;
      }
      // Collect all cells with the best score (tied for outermost)
      const tied = cells.filter(c => Math.abs(c.gx * d.mx + c.gy * d.my - bestScore) < 0.01);
      // Return centroid of tied cells
      const avgGx = tied.reduce((s, c) => s + c.gx, 0) / tied.length;
      const avgGy = tied.reduce((s, c) => s + c.gy, 0) / tied.length;
      return { gx: avgGx, gy: avgGy };
    };

    // Check if this station has a corner tick shift
    let cornerShiftX = 0, cornerShiftY = 0;
    if (cells.length === 1 && cells[0].gid) {
      const info = markCache.stationInfo[`${cells[0].gid}|${nid}`];
      if (info?.shift) {
        cornerShiftX = info.shift.dx * SCHEM_CELL * _schemState.zoom;
        cornerShiftY = info.shift.dy * SCHEM_CELL * _schemState.zoom;
      }
    }

    const makeCandidate = (dir) => {
      const d = dirOffsets[dir];
      const oc = outerCell(dir);
      const osp = schemWorldToScreen(oc.gx * SCHEM_CELL, oc.gy * SCHEM_CELL);
      osp.x += cornerShiftX;
      osp.y += cornerShiftY;
      const x = osp.x + d.mx * pad;
      // Vertical anchoring: SVG text y = baseline of first line
      // textH = total height of all lines. fontSize = single line height.
      let yAdj;
      if (dir === 'n' || dir === 'nw' || dir === 'ne') {
        // Text above: last line baseline at pad edge → first baseline = -textH + fontSize
        yAdj = -textH + fontSize;
      } else if (dir === 's' || dir === 'sw' || dir === 'se') {
        // Text below: first baseline just below pad
        yAdj = fontSize;
      } else {
        // E/W: vertically centered. First baseline positioned so the midpoint of
        // all lines aligns with the station. lineH = fontSize * 1.15.
        const nLines = wrapLines.length;
        const lineH = fontSize * 1.15;
        yAdj = -((nLines - 1) * lineH) / 2 + fontSize * 0.35;
      }
      const y = osp.y + d.my * pad + yAdj;
      return { x, y, anchor: d.anchor, dir };
    };

    const scoreCandidate = (cand) => {
      const bx = cand.anchor === 'end' ? cand.x - textW : cand.anchor === 'middle' ? cand.x - textW / 2 : cand.x;
      const by = cand.y - fontSize; // baseline to top of first line
      const bw = textW, bh = textH;
      const box = { x: bx, y: by, w: bw, h: bh };
      let score = 0;

      // Overlap with placed labels (box vs box)
      for (const lb of labelBoxes) {
        if (box.x < lb.x + lb.w && box.x + box.w > lb.x && box.y < lb.y + lb.h && box.y + box.h > lb.y) {
          // Proportional penalty based on overlap area
          const ox = Math.min(box.x + bw, lb.x + lb.w) - Math.max(box.x, lb.x);
          const oy = Math.min(box.y + bh, lb.y + lb.h) - Math.max(box.y, lb.y);
          score += 8 + (ox * oy) / (bw * bh) * 20; // base + proportional
        }
      }

      // Overlap with route lines (point-in-box proximity)
      for (const rp of routePoints) {
        // Check if route point is near the label box
        const cx = Math.max(box.x, Math.min(rp.x, box.x + bw));
        const cy = Math.max(box.y, Math.min(rp.y, box.y + bh));
        const dist = Math.sqrt((rp.x - cx) ** 2 + (rp.y - cy) ** 2);
        if (dist < rp.r + 2) score += 3; // inside or touching
        else if (dist < rp.r + cellPx * 0.3) score += 1; // close proximity
      }

      // Overlap with other station marks (not own station)
      for (const stp of stationPoints) {
        if (stp.nid === nid) continue; // skip own station
        const cx = Math.max(box.x, Math.min(stp.x, box.x + bw));
        const cy = Math.max(box.y, Math.min(stp.y, box.y + bh));
        const dist = Math.sqrt((stp.x - cx) ** 2 + (stp.y - cy) ** 2);
        if (dist < stp.r + 2) score += 12;
      }

      return { ...cand, _box: box, _score: score };
    };

    // Find line direction at this station for perpendicular preference
    let lineDir = null;
    // Try mark cache first (tick/terminus stations have lineDir)
    for (const c of cells) {
      const info = markCache.stationInfo[`${c.gid}|${nid}`];
      if (info?.lineDir) { lineDir = info.lineDir; break; }
    }
    // Fallback: compute from routes passing through any cell of this station
    if (!lineDir) {
      for (const c of cells) {
        const routes = _renderCache.routes[c.gid] || [];
        for (const route of routes) {
          if (!route.cells) continue;
          for (let ri = 0; ri < route.cells.length; ri++) {
            if (route.cells[ri].gx === c.gx && route.cells[ri].gy === c.gy) {
              const prev = route.cells[ri - 1], next = route.cells[ri + 1];
              if (next) { lineDir = { dx: Math.sign(next.gx - c.gx), dy: Math.sign(next.gy - c.gy) }; }
              else if (prev) { lineDir = { dx: Math.sign(c.gx - prev.gx), dy: Math.sign(c.gy - prev.gy) }; }
              break;
            }
          }
          if (lineDir) break;
        }
        if (lineDir) break;
      }
    }

    let best;
    if (override && override !== 'auto' && dirOffsets[override]) {
      best = scoreCandidate(makeCandidate(override));
    } else {
      // Auto: try all 8, pick best. Prefer directions perpendicular to the line.
      let bestScore = Infinity;
      for (let pi = 0; pi < dirPref.length; pi++) {
        const dir = dirPref[pi];
        const cand = scoreCandidate(makeCandidate(dir));
        let total = cand._score + pi * 0.5;
        if (lineDir) {
          const d = dirOffsets[dir];
          const ldLen = Math.sqrt(lineDir.dx * lineDir.dx + lineDir.dy * lineDir.dy) || 1;
          const dmLen = Math.sqrt(d.mx * d.mx + d.my * d.my) || 1;
          const dot = Math.abs((d.mx * lineDir.dx + d.my * lineDir.dy) / (ldLen * dmLen));
          total += dot * 20;
        }
        if (total < bestScore) { bestScore = total; best = cand; }
      }
    }

    if (best._box) labelBoxes.push(best._box);
    entry._bestDir = best.dir; // store for tick orientation

    const labelCls = dimLabel ? 'schem-label-hit schem-dimmed' : 'schem-label-hit';
    const lineH = fontSize * 1.15;
    const yOffset = wrapLines.length > 1 ? -lineH * 0.25 : 0;
    svgContent += `<text class="${labelCls}" data-nid="${nid}" data-gid="${entry.gid}" x="${best.x}" y="${best.y + yOffset}" text-anchor="${best.anchor}" font-family="'Hammersmith One',sans-serif" font-size="${fontSize}" fill="#003082" font-weight="700" style="cursor:grab">`;
    for (let li = 0; li < wrapLines.length; li++) {
      if (li === 0) svgContent += `<tspan>${esc(wrapLines[li])}</tspan>`;
      else svgContent += `<tspan x="${best.x}" dy="${lineH}">${esc(wrapLines[li])}</tspan>`;
    }
    svgContent += `</text>`;
  }

  // ---- Station marks ON TOP ----
  for (const gid in ls) {
    for (const nid in ls[gid]) {
      if (_schemState.lsDrag && _schemState.lsDrag.groupId === gid && _schemState.lsDrag.nodeId === nid) continue;
      if (hiddenLsKeys.has(`${gid}|${nid}`)) continue;
      const pos = ls[gid][nid];
      const sp = schemWorldToScreen(pos.gx * SCHEM_CELL, pos.gy * SCHEM_CELL);
      let info = markCache.stationInfo[`${gid}|${nid}`] || { mark: 'simple' };
      // Apply mark override (tick→blob)
      const markOv = data.beckmap.markOverrides?.[`${gid}|${nid}`];
      if (markOv === 'blob' && (info.mark === 'tick' || info.mark === 'terminus')) info = { mark: 'blob_override' };
      const thisLsKey = `${gid}|${nid}`;
      const dimMark = selectedLsKey ? (thisLsKey !== selectedLsKey) : (hasSel && !involvedNodes.has(nid));
      const dimAttr = dimMark ? ' opacity="0.2"' : '';
      const group = getGroup(gid);
      const color = group?.color || '#888';

      const tickSW = Math.max(2, _schemState.zoom * 2.5);
      if (info.mark === 'interchange') {
        const r = markR * 0.5;
        svgContent += `<circle class="schem-mark-hit schem-ic-dot" data-gid="${gid}" data-nid="${nid}" cx="${sp.x}" cy="${sp.y}" r="${r}" fill="#fff" stroke="#000" stroke-width="${sw * 0.5}" style="cursor:grab;opacity:0"/>`;
      } else if (info.mark === 'tick' && info.lineDir) {
        // Compute perpendicular direction, choosing side toward the label
        const ld = info.lineDir;
        // Two perpendicular options: (dy, -dx) and (-dy, dx)
        const p1 = { dx: Math.sign(ld.dy), dy: -Math.sign(ld.dx) };
        const p2 = { dx: -Math.sign(ld.dy), dy: Math.sign(ld.dx) };
        // Find label position for this station to pick the closer side
        const labelEntry = labelEntries.find(le => le.nid === nid);
        let perpDir = p1;
        if (labelEntry && labelEntry._bestDir) {
          const lDir = dirOffsets[labelEntry._bestDir];
          if (lDir) {
            const dot1 = p1.dx * lDir.mx + p1.dy * lDir.my;
            const dot2 = p2.dx * lDir.mx + p2.dy * lDir.my;
            perpDir = dot2 > dot1 ? p2 : p1;
          }
        }
        // Apply corner shift
        const shift = info.shift || { dx: 0, dy: 0 };
        const cellShift = SCHEM_CELL * _schemState.zoom;
        const cx = sp.x + shift.dx * cellShift;
        const cy = sp.y + shift.dy * cellShift;
        // For diagonal perps, scale offset by 1/√2 so tick starts at line edge
        const isDiag = perpDir.dx !== 0 && perpDir.dy !== 0;
        const half = lineWidth * 0.5 * (isDiag ? 0.707 : 1);
        const ox = perpDir.dx * half, oy = perpDir.dy * half;
        const tl = tickLen * (isDiag ? 0.707 : 1);
        const pdx = perpDir.dx * tl, pdy = perpDir.dy * tl;
        svgContent += `<line class="schem-mark-hit" data-gid="${gid}" data-nid="${nid}" x1="${cx + ox}" y1="${cy + oy}" x2="${cx + ox + pdx}" y2="${cy + oy + pdy}" stroke="${color}" stroke-width="${tickSW}" stroke-linecap="butt" style="cursor:grab"${dimAttr}/>`;
      } else if (info.mark === 'terminus' && info.lineDir) {
        // Terminus: T-bar perpendicular to the approaching line, both sides.
        // Also cover the round linecap with a white mask + coloured T-bar.
        const ld = info.lineDir;
        const perpDx = Math.sign(ld.dy), perpDy = -Math.sign(ld.dx);
        const isDiagT = Math.abs(ld.dx) + Math.abs(ld.dy) > 1;
        const tLen = (isDiagT ? tickLen * 2 : tickLen * 3);
        const tSW = Math.max(lineWidth * 0.6, tickSW); // thick enough to mask round cap
        const pdx = perpDx * tLen, pdy = perpDy * tLen;
        // White mask over round cap
        svgContent += `<line x1="${sp.x}" y1="${sp.y}" x2="${sp.x - ld.dx * lineWidth * 0.6}" y2="${sp.y - ld.dy * lineWidth * 0.6}" stroke="#fff" stroke-width="${lineWidth + 2}" stroke-linecap="butt"/>`;
        // T-bar
        svgContent += `<line class="schem-mark-hit" data-gid="${gid}" data-nid="${nid}" x1="${sp.x - pdx}" y1="${sp.y - pdy}" x2="${sp.x + pdx}" y2="${sp.y + pdy}" stroke="${color}" stroke-width="${tSW}" stroke-linecap="butt" style="cursor:grab"${dimAttr}/>`;
      } else if (info.mark === 'blob_override') {
        // Tick overridden to blob: same size as single-cell grouped station blob
        const blobR = Math.max(4, _schemState.zoom * 5);
        svgContent += `<circle class="schem-mark-hit" data-gid="${gid}" data-nid="${nid}" cx="${sp.x}" cy="${sp.y}" r="${blobR}" fill="#fff" stroke="#000" stroke-width="${sw}" style="cursor:grab"${dimAttr}/>`;
      } else {
        // Simple: white circle
        svgContent += `<circle class="schem-mark-hit" data-gid="${gid}" data-nid="${nid}" cx="${sp.x}" cy="${sp.y}" r="${markR}" fill="#fff" stroke="#000" stroke-width="${sw}" style="cursor:grab"${dimAttr}/>`;
      }
    }
  }

  // ---- Infra station marks (grey, for unassigned stations in byNode) ----
  if (getSetting('beckShowInfra', false)) {
    const infraSt = data.beckmap.infraStations || {};
    for (const nid in infraSt) {
      // Only draw if not already drawn by a line
      let alreadyDrawn = false;
      for (const gid in (data.beckmap.lineStations || {})) { if (data.beckmap.lineStations[gid]?.[nid]) { alreadyDrawn = true; break; } }
      if (alreadyDrawn) continue;
      if (_schemState.lsDrag && _schemState.lsDrag.groupId === '__infra__' && _schemState.lsDrag.nodeId === nid) continue;
      const pos = infraSt[nid];
      const sp = schemWorldToScreen(pos.gx * SCHEM_CELL, pos.gy * SCHEM_CELL);
      svgContent += `<circle class="schem-mark-hit" data-gid="__infra__" data-nid="${nid}" cx="${sp.x}" cy="${sp.y}" r="${markR}" fill="#fff" stroke="#999" stroke-width="${sw}" style="cursor:grab"/>`;
    }
  }

  // ---- Bend editing overlay ----
  if (_schemState.bendEditing && _schemState.selectedRoute) {
    const sel = _schemState.selectedRoute;
    const sls = data.beckmap.lineStations?.[sel.groupId];
    if (sls) {
      const resolved = schemResolveEdge(sel.groupId, sel.edgeKey, sel.fromId, sel.toId);
      if (resolved) {
        const { from, to } = resolved;
        // Read live bends in correct order (includes drag updates)
        const rawBends = schemGetBends(sel.groupId, sel.edgeKey) || [];
        const canonical = sel.edgeKey.split('|');
        const isReversed = sel.fromId !== canonical[0];
        const bends = isReversed ? [...rawBends].reverse() : rawBends;
        const route = schemRouteWithBends(from, to, bends.length ? bends : null);

        const endSet = new Set([`${from.gx},${from.gy}`, `${to.gx},${to.gy}`]);
        const bendSet = new Set(bends.map(b => `${b.gx},${b.gy}`));

        // Detect direction-change vertices (not every route cell, only actual bends)
        const vertexSet = new Set();
        for (let i = 1; i < route.length - 1; i++) {
          const dx1 = route[i].gx - route[i - 1].gx, dy1 = route[i].gy - route[i - 1].gy;
          const dx2 = route[i + 1].gx - route[i].gx, dy2 = route[i + 1].gy - route[i].gy;
          if (Math.sign(dx1) !== Math.sign(dx2) || Math.sign(dy1) !== Math.sign(dy2)) {
            vertexSet.add(`${route[i].gx},${route[i].gy}`);
          }
        }

        // All cells along the route (for creation dots)
        const allCells = new Set();
        for (let i = 0; i < route.length - 1; i++) {
          const a = route[i], b = route[i + 1];
          const dx = b.gx - a.gx, dy = b.gy - a.gy;
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          if (steps === 0) continue;
          const sx = dx / steps, sy = dy / steps;
          for (let s = 0; s <= steps; s++) {
            allCells.add(`${Math.round(a.gx + sx * s)},${Math.round(a.gy + sy * s)}`);
          }
        }

        const bigR = Math.max(2, _schemState.zoom * 2.8);
        const midR = Math.max(1.5, _schemState.zoom * 2);
        const smallR = Math.max(1, _schemState.zoom * 1.2);
        const hitR = Math.max(6, _schemState.zoom * 6);

        // Layer 1: creation dots (smallest, 50% opacity)
        for (const key of allCells) {
          if (endSet.has(key) || bendSet.has(key) || vertexSet.has(key)) continue;
          const [cx, cy] = key.split(',').map(Number);
          const sp = schemWorldToScreen(cx * SCHEM_CELL, cy * SCHEM_CELL);
          svgContent += `<circle class="schem-guide-hit" data-lesser="1" data-gx="${cx}" data-gy="${cy}" cx="${sp.x}" cy="${sp.y}" r="${hitR}" fill="transparent" style="cursor:pointer"/>`;
          svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${smallR}" fill="#fff" stroke="#bbb" stroke-width="0.8" pointer-events="none" opacity="0.5"/>`;
        }

        // Layer 2: auto-vertex direction changes — same size as explicit bends
        for (const key of vertexSet) {
          if (endSet.has(key) || bendSet.has(key)) continue;
          const [cx, cy] = key.split(',').map(Number);
          const sp = schemWorldToScreen(cx * SCHEM_CELL, cy * SCHEM_CELL);
          svgContent += `<circle class="schem-guide-hit" data-gx="${cx}" data-gy="${cy}" cx="${sp.x}" cy="${sp.y}" r="${hitR}" fill="transparent" style="cursor:grab"/>`;
          svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${bigR}" fill="#fff" stroke="#888" stroke-width="1.5" pointer-events="none"/>`;
        }

        // Layer 3: explicit bend points
        // Map display index to canonical storage index for drag operations
        for (let i = 0; i < bends.length; i++) {
          const b = bends[i];
          const canonIdx = isReversed ? (rawBends.length - 1 - i) : i;
          const isDrag = _schemState.bendDrag?.bendIdx === canonIdx;
          const sp = schemWorldToScreen(b.gx * SCHEM_CELL, b.gy * SCHEM_CELL);
          svgContent += `<circle class="schem-guide-hit" data-bi="${canonIdx}" cx="${sp.x}" cy="${sp.y}" r="${hitR}" fill="transparent" style="cursor:grab"/>`;
          svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${bigR}" fill="${isDrag ? '#5b8af5' : '#fff'}" stroke="${isDrag ? '#3d6ad8' : '#555'}" stroke-width="1.5" pointer-events="none"/>`;
        }

        // Layer 4: station endpoints
        for (const key of endSet) {
          const [cx, cy] = key.split(',').map(Number);
          const sp = schemWorldToScreen(cx * SCHEM_CELL, cy * SCHEM_CELL);
          svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${bigR}" fill="#fff" stroke="#333" stroke-width="1.5" pointer-events="none"/>`;
        }
      }
    }
  }

  // ---- ISI/OSI bend editing overlay ----
  if (_schemState.bendEditing && _schemState.selectedConn) {
    const conn = _schemState.selectedConn;
    const connInfo = isiOsi.find(c => c.edgeKey === conn.edgeKey);
    if (connInfo) {
      const fgx = Math.round(connInfo.fromGx), fgy = Math.round(connInfo.fromGy);
      const tgx = Math.round(connInfo.toGx), tgy = Math.round(connInfo.toGy);
      const from = { gx: fgx, gy: fgy }, to = { gx: tgx, gy: tgy };
      const bends = schemGetBends('isiosi', conn.edgeKey) || [];
      const route = schemRouteWithBends(from, to, bends.length ? bends : null);

      const endSet = new Set([`${fgx},${fgy}`, `${tgx},${tgy}`]);
      const bendSet = new Set(bends.map(b => `${b.gx},${b.gy}`));
      const vertexSet = new Set();
      for (let i = 1; i < route.length - 1; i++) {
        const dx1 = route[i].gx - route[i - 1].gx, dy1 = route[i].gy - route[i - 1].gy;
        const dx2 = route[i + 1].gx - route[i].gx, dy2 = route[i + 1].gy - route[i].gy;
        if (Math.sign(dx1) !== Math.sign(dx2) || Math.sign(dy1) !== Math.sign(dy2)) {
          vertexSet.add(`${route[i].gx},${route[i].gy}`);
        }
      }
      const allCells = new Set();
      for (let i = 0; i < route.length - 1; i++) {
        const a = route[i], b = route[i + 1];
        const dx = b.gx - a.gx, dy = b.gy - a.gy;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        if (steps === 0) continue;
        const sx = dx / steps, sy = dy / steps;
        for (let s = 0; s <= steps; s++) allCells.add(`${Math.round(a.gx + sx * s)},${Math.round(a.gy + sy * s)}`);
      }
      const bigR = Math.max(2, _schemState.zoom * 2.8);
      const smallR = Math.max(1, _schemState.zoom * 1.2);
      const hitR = Math.max(6, _schemState.zoom * 6);
      for (const key of allCells) {
        if (endSet.has(key) || bendSet.has(key) || vertexSet.has(key)) continue;
        const [cx, cy] = key.split(',').map(Number);
        const sp = schemWorldToScreen(cx * SCHEM_CELL, cy * SCHEM_CELL);
        svgContent += `<circle class="schem-guide-hit" data-lesser="1" data-gx="${cx}" data-gy="${cy}" cx="${sp.x}" cy="${sp.y}" r="${hitR}" fill="transparent" style="cursor:pointer"/>`;
        svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${smallR}" fill="#fff" stroke="#bbb" stroke-width="0.8" pointer-events="none" opacity="0.5"/>`;
      }
      for (const key of vertexSet) {
        if (endSet.has(key) || bendSet.has(key)) continue;
        const [cx, cy] = key.split(',').map(Number);
        const sp = schemWorldToScreen(cx * SCHEM_CELL, cy * SCHEM_CELL);
        svgContent += `<circle class="schem-guide-hit" data-gx="${cx}" data-gy="${cy}" cx="${sp.x}" cy="${sp.y}" r="${hitR}" fill="transparent" style="cursor:grab"/>`;
        svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${bigR}" fill="#fff" stroke="#888" stroke-width="1.5" pointer-events="none"/>`;
      }
      for (let i = 0; i < bends.length; i++) {
        const b = bends[i];
        const isDrag = _schemState.bendDrag?.bendIdx === i;
        const sp = schemWorldToScreen(b.gx * SCHEM_CELL, b.gy * SCHEM_CELL);
        svgContent += `<circle class="schem-guide-hit" data-bi="${i}" cx="${sp.x}" cy="${sp.y}" r="${hitR}" fill="transparent" style="cursor:grab"/>`;
        svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${bigR}" fill="${isDrag ? '#5b8af5' : '#fff'}" stroke="${isDrag ? '#3d6ad8' : '#555'}" stroke-width="1.5" pointer-events="none"/>`;
      }
      for (const key of endSet) {
        const [cx, cy] = key.split(',').map(Number);
        const sp = schemWorldToScreen(cx * SCHEM_CELL, cy * SCHEM_CELL);
        svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${bigR}" fill="#fff" stroke="#333" stroke-width="1.5" pointer-events="none"/>`;
      }
    }
  }

  // ---- Drag ghost ----
  if (isDragging && _schemState.ghostPos) {
    const g = _schemState.ghostPos;
    const sp = schemWorldToScreen(g.x, g.y);
    const drag = _schemState.lsDrag || _schemState.sidebarDrag;
    const node = getNode(drag.nodeId);
    svgContent += `<g opacity="0.6">`;
    svgContent += `<circle cx="${sp.x}" cy="${sp.y}" r="${markR}" fill="#fff" stroke="#000" stroke-width="${sw}"/>`;
    if (node) {
      const name = esc(nodeDisplayName(node.id));
      svgContent += `<text x="${sp.x + markR + fontSize * 0.4}" y="${sp.y + fontSize * 0.35}" font-family="'Hammersmith One',sans-serif" font-size="${fontSize}" fill="#003082" font-weight="700">${name}</text>`;
    }
    svgContent += `</g>`;
  }

  // ---- Debug ----
  if (_schemState.debug) svgContent += schemDrawDebug();

  svg.innerHTML = svgContent;
}

// Draw interchange blob. Returns '' if all cells overlap (simple station).
// Rectangular fills → rounded rect. Otherwise → thick-stroke path with 45° routing.
// Find 4 cells that form the corners of a rectangle (axis-aligned or 45°-rotated).
// Returns { type, corners, inside, leftover, minGx/maxGx/minGy/maxGy } or null.
function schemFindRectSubset(cells) {
  if (cells.length < 4) return null;

  // Try all combinations of 4 cells to find rectangle corners
  const tryRect = (c0, c1, c2, c3) => {
    const pts = [c0, c1, c2, c3];
    // Sort by gx then gy to get consistent ordering
    pts.sort((a, b) => a.gx - b.gx || a.gy - b.gy);
    // Axis-aligned: check if they form 2 distinct x values and 2 distinct y values
    const xs = new Set(pts.map(p => p.gx)), ys = new Set(pts.map(p => p.gy));
    if (xs.size === 2 && ys.size === 2) {
      const [x0, x1] = [...xs].sort((a, b) => a - b);
      const [y0, y1] = [...ys].sort((a, b) => a - b);
      // Verify all 4 corners exist
      const has = (gx, gy) => pts.some(p => p.gx === gx && p.gy === gy);
      if (has(x0, y0) && has(x1, y0) && has(x0, y1) && has(x1, y1)) {
        const inside = cells.filter(c => c.gx >= x0 && c.gx <= x1 && c.gy >= y0 && c.gy <= y1);
        const leftover = cells.filter(c => c.gx < x0 || c.gx > x1 || c.gy < y0 || c.gy > y1);
        return { type: 'axis', minGx: x0, maxGx: x1, minGy: y0, maxGy: y1, inside, leftover };
      }
    }
    // 45°-rotated: check in rotated coords u=gx+gy, v=gx-gy
    const rpts = pts.map(p => ({ u: p.gx + p.gy, v: p.gx - p.gy, gx: p.gx, gy: p.gy }));
    const us = new Set(rpts.map(p => p.u)), vs = new Set(rpts.map(p => p.v));
    if (us.size === 2 && vs.size === 2) {
      const [u0, u1] = [...us].sort((a, b) => a - b);
      const [v0, v1] = [...vs].sort((a, b) => a - b);
      const hasR = (u, v) => rpts.some(p => p.u === u && p.v === v);
      if (hasR(u0, v0) && hasR(u1, v0) && hasR(u0, v1) && hasR(u1, v1)) {
        const corners = [
          { gx: (u0 + v0) / 2, gy: (u0 - v0) / 2 },
          { gx: (u1 + v0) / 2, gy: (u1 - v0) / 2 },
          { gx: (u1 + v1) / 2, gy: (u1 - v1) / 2 },
          { gx: (u0 + v1) / 2, gy: (u0 - v1) / 2 }
        ];
        // Inside = cells whose rotated coords fall within the diamond
        const inside = cells.filter(c => {
          const u = c.gx + c.gy, v = c.gx - c.gy;
          return u >= u0 && u <= u1 && v >= v0 && v <= v1;
        });
        const leftover = cells.filter(c => {
          const u = c.gx + c.gy, v = c.gx - c.gy;
          return u < u0 || u > u1 || v < v0 || v > v1;
        });
        return { type: 'diamond', corners, inside, leftover };
      }
    }
    return null;
  };

  // Try to find the LARGEST rectangle first. Check all 4-cell combos, pick the one
  // with the most interior cells (largest area).
  let best = null, bestArea = 0;
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      for (let k = j + 1; k < cells.length; k++) {
        for (let l = k + 1; l < cells.length; l++) {
          const r = tryRect(cells[i], cells[j], cells[k], cells[l]);
          if (r && r.inside.length > bestArea) { best = r; bestArea = r.inside.length; }
        }
      }
    }
  }
  return best;
}

function schemDrawInterchange(ic, sw, lineWidth) {
  if (ic.positions.length < 2) return '';

  // Deduplicate overlapping cells
  const unique = [];
  const seen = new Set();
  for (const p of ic.positions) {
    const key = `${p.gx},${p.gy}`;
    if (!seen.has(key)) { seen.add(key); unique.push(p); }
  }
  if (unique.length < 2) {
    // All cells overlap — draw a single blob circle at that position
    const sp = schemWorldToScreen(unique[0].gx * SCHEM_CELL, unique[0].gy * SCHEM_CELL);
    const r = Math.max(4, _schemState.zoom * 5);
    return `<circle cx="${sp.x}" cy="${sp.y}" r="${r}" fill="#fff" stroke="#000" stroke-width="${sw}"/>`;
  }

  const pad = 0.55;

  // Try to find 4 cells that form the corners of a rectangle (axis-aligned or 45°-rotated).
  // If found, draw the rectangle + any leftover cells as path extensions.
  const rectResult = schemFindRectSubset(unique);

  if (rectResult) {
    let s = '';
    const blobW = lineWidth * 1.6;

    // Build extension paths
    const extPaths = [];
    for (const lo of rectResult.leftover) {
      let nearest = rectResult.inside[0], bestD = Infinity;
      for (const ri of rectResult.inside) {
        const d = Math.abs(ri.gx - lo.gx) + Math.abs(ri.gy - lo.gy);
        if (d < bestD) { bestD = d; nearest = ri; }
      }
      const leg = schemRouteLeg(nearest.gx, nearest.gy, lo.gx, lo.gy);
      extPaths.push(leg.map((c, i) => {
        const sp = schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL);
        return `${i === 0 ? 'M' : 'L'}${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
      }).join(' '));
    }

    // Build rect shape string
    let rectSvg = '', rectFill = '';
    if (rectResult.type === 'axis') {
      const tl = schemWorldToScreen((rectResult.minGx - pad) * SCHEM_CELL, (rectResult.minGy - pad) * SCHEM_CELL);
      const br = schemWorldToScreen((rectResult.maxGx + pad) * SCHEM_CELL, (rectResult.maxGy + pad) * SCHEM_CELL);
      const w = br.x - tl.x, h = br.y - tl.y;
      const rx = Math.min(w, h) * 0.35;
      rectSvg = `<rect x="${tl.x}" y="${tl.y}" width="${w}" height="${h}" rx="${rx}"`;
    } else {
      const cxAvg = rectResult.corners.reduce((s, p) => s + p.gx, 0) / 4;
      const cyAvg = rectResult.corners.reduce((s, p) => s + p.gy, 0) / 4;
      const pts = rectResult.corners.map(c => {
        const dx = c.gx - cxAvg, dy = c.gy - cyAvg;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        return schemWorldToScreen((c.gx + dx / len * pad) * SCHEM_CELL, (c.gy + dy / len * pad) * SCHEM_CELL);
      });
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
      rectSvg = `<path d="${d}" stroke-linejoin="round"`;
    }

    const outerW = blobW + sw * 2;
    const innerW = blobW;
    // The visible border of a path blob = (outerW - innerW) / 2 = sw
    // The rect needs the same: stroke = sw, but inset by half the path blob width

    // Pass 1: ALL black outlines
    for (const ep of extPaths) {
      s += `<path d="${ep}" stroke="#000" stroke-width="${outerW}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    }
    s += `${rectSvg} fill="#000" stroke="#000" stroke-width="${sw}"/>`;

    // Pass 2: ALL white fills on top — merges seamlessly
    for (const ep of extPaths) {
      s += `<path d="${ep}" stroke="#fff" stroke-width="${innerW}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    }
    s += `${rectSvg} fill="#fff" stroke="none"/>`;

    return s;
  }

  // Path-based blob: order cells via nearest-neighbor chain, route with 45°
  const blobW = lineWidth * 1.6;
  const cells = [...unique];
  cells.sort((a, b) => a.gx - b.gx || a.gy - b.gy);
  const ordered = [cells.splice(0, 1)[0]];
  while (cells.length) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const d = Math.abs(cells[i].gx - last.gx) + Math.abs(cells[i].gy - last.gy);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    ordered.push(cells.splice(bestIdx, 1)[0]);
  }

  const routeCells = [ordered[0]];
  for (let i = 0; i < ordered.length - 1; i++) {
    const leg = schemRouteLeg(ordered[i].gx, ordered[i].gy, ordered[i + 1].gx, ordered[i + 1].gy);
    for (let j = 1; j < leg.length; j++) routeCells.push(leg[j]);
  }

  // Per-segment pinching: only pinch between node pairs with 1+ full cell gap between them.
  // Adjacent nodes (distance 1 cell) get full width.
  const nodeSet = new Set(unique.map(c => `${c.gx},${c.gy}`));
  const pinchW = blobW * 0.25;
  const lobeR = (blobW + sw * 2) / 2;
  const lobeInnerR = blobW / 2;

  // Build per-leg segments between consecutive ordered nodes
  const legs = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const leg = schemRouteLeg(ordered[i].gx, ordered[i].gy, ordered[i + 1].gx, ordered[i + 1].gy);
    // Check if there's a gap: any intermediate cell (not first/last) that isn't a node
    const hasGap = leg.length > 2 && leg.slice(1, -1).some(c => !nodeSet.has(`${c.gx},${c.gy}`));
    legs.push({ cells: leg, pinch: hasGap });
  }

  const anyPinch = legs.some(l => l.pinch);
  let s = '';

  if (anyPinch) {
    // Pass 1: ALL black outlines
    for (const c of unique) {
      const sp = schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL);
      s += `<circle cx="${sp.x}" cy="${sp.y}" r="${lobeR}" fill="#000"/>`;
    }
    for (const leg of legs) {
      const w = leg.pinch ? (pinchW + sw * 2) : (blobW + sw * 2);
      const pathD = leg.cells.map((c, i) => {
        const sp = schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL);
        return `${i === 0 ? 'M' : 'L'}${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
      }).join(' ');
      s += `<path d="${pathD}" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    }
    // Pass 2: ALL white fills
    for (const c of unique) {
      const sp = schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL);
      s += `<circle cx="${sp.x}" cy="${sp.y}" r="${lobeInnerR}" fill="#fff"/>`;
    }
    for (const leg of legs) {
      const w = leg.pinch ? pinchW : blobW;
      const pathD = leg.cells.map((c, i) => {
        const sp = schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL);
        return `${i === 0 ? 'M' : 'L'}${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
      }).join(' ');
      s += `<path d="${pathD}" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    }
  } else {
    // No pinching needed — uniform width blob
    const pathD = routeCells.map((c, i) => {
      const sp = schemWorldToScreen(c.gx * SCHEM_CELL, c.gy * SCHEM_CELL);
      return `${i === 0 ? 'M' : 'L'}${sp.x.toFixed(1)},${sp.y.toFixed(1)}`;
    }).join(' ');
    s += `<path d="${pathD}" stroke="#000" stroke-width="${blobW + sw * 2}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    s += `<path d="${pathD}" stroke="#fff" stroke-width="${blobW}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  }
  return s;
}

// ---- Debug overlay ----

function schemDrawDebug() {
  let s = '';
  const fontSize = Math.max(6, _schemState.zoom * 5);
  const fs = fontSize * 0.65;
  const ls = data.beckmap.lineStations || {};

  // Line-station positions + lsKey
  for (const gid in ls) for (const nid in ls[gid]) {
    const pos = ls[gid][nid];
    const sp = schemWorldToScreen(pos.gx * SCHEM_CELL, pos.gy * SCHEM_CELL);
    const g = getGroup(gid);
    const grp = schemGetGroup(`${gid}|${nid}`);
    s += `<text x="${sp.x}" y="${sp.y + fontSize * 2.5}" font-family="'JetBrains Mono',monospace" font-size="${fs}" fill="#999" text-anchor="middle">(${pos.gx},${pos.gy}) ${esc(g?.name || '?')}${grp ? ' G:' + grp.slice(0, 6) : ''}</text>`;
  }

  // Route edge keys + cell counts
  for (const group of data.serviceGroups) {
    const routes = _renderCache.routes[group.id] || [];
    for (const route of routes) {
      if (!route.cells || route.cells.length < 2) continue;
      const mid = route.cells[Math.floor(route.cells.length / 2)];
      const sp = schemWorldToScreen(mid.gx * SCHEM_CELL, mid.gy * SCHEM_CELL);
      s += `<text x="${sp.x}" y="${sp.y - 8}" font-family="'JetBrains Mono',monospace" font-size="${fs}" fill="#e53535" text-anchor="middle" opacity="0.7">${esc(group.name)} [${route.edgeKey?.slice(0, 12) || '?'}] (${route.cells.length})</text>`;
    }
  }

  // Interchange group IDs
  for (const ic of _renderCache.interchanges || []) {
    const cx = ic.positions.reduce((s, p) => s + p.gx, 0) / ic.positions.length;
    const cy = ic.positions.reduce((s, p) => s + p.gy, 0) / ic.positions.length;
    const sp = schemWorldToScreen(cx * SCHEM_CELL, cy * SCHEM_CELL);
    s += `<text x="${sp.x}" y="${sp.y - fontSize * 1.5}" font-family="'JetBrains Mono',monospace" font-size="${fs}" fill="#5b8af5" text-anchor="middle" opacity="0.8">${ic.groupId?.slice(0, 8) || '?'} (${ic.positions.length})</text>`;
  }

  return s;
}

// ---- Migration ----

function schemMigrateData() {
  if (!data.beckmap) data.beckmap = {};
  if (data.beckmap.lineStations && data.beckmap.version === 3) {
    if (!data.beckmap.routeBends) data.beckmap.routeBends = {};
    if (!data.beckmap.segmentStyles) data.beckmap.segmentStyles = {};
    if (!data.beckmap.lineStyles) data.beckmap.lineStyles = {};
    if (!data.beckmap.labelOverrides) data.beckmap.labelOverrides = {};
    if (!data.beckmap.labelWrap) {
      // Migrate old labelNoWrap → labelWrap
      if (data.beckmap.labelNoWrap) {
        data.beckmap.labelWrap = {};
        for (const k in data.beckmap.labelNoWrap) { if (data.beckmap.labelNoWrap[k]) data.beckmap.labelWrap[k] = 'single'; }
        delete data.beckmap.labelNoWrap;
      } else {
        data.beckmap.labelWrap = {};
      }
    }
    if (!data.beckmap.markOverrides) data.beckmap.markOverrides = {};
    // Migrate from groupOverrides to stationGroups
    if (!data.beckmap.stationGroups) {
      data.beckmap.stationGroups = {};
      schemAutoGenerateGroups();
      delete data.beckmap.groupOverrides;
      save();
    }
    return;
  }
  delete data.beckmap.guides;
  delete data.beckmap.lineOrder;
  delete data.beckmap.lineRoutes;
  delete data.beckmap.stationCells;
  for (const n of data.nodes) {
    if (n.mapX != null) { n.mapX = undefined; n.mapY = undefined; }
  }
  data.beckmap.lineStations = {};
  data.beckmap.routeBends = {};
  data.beckmap.segmentStyles = {};
  data.beckmap.lineStyles = {};
  data.beckmap.labelOverrides = {};
  data.beckmap.groupOverrides = {};
  data.beckmap.version = 3;
  save();
}

// ---- SVG Export ----

function schemExportSVG() {
  const svg = document.getElementById('schem-svg');
  if (!svg) return;

  // Temporarily disable debug, render clean
  const wasDebug = _schemState.debug;
  _schemState.debug = false;
  renderSchematic();

  // Compute bounding box of all placed content
  const allPos = schemAllPlacedPositions();
  if (!allPos.length) { toast('No stations placed', 'error'); _schemState.debug = wasDebug; renderSchematic(); return; }

  const PAD = 40;
  const xs = allPos.map(p => p.gx * SCHEM_CELL), ys = allPos.map(p => p.gy * SCHEM_CELL);
  const minX = Math.min(...xs) - PAD, maxX = Math.max(...xs) + PAD;
  const minY = Math.min(...ys) - PAD, maxY = Math.max(...ys) + PAD;
  const w = (maxX - minX) * _schemState.zoom;
  const h = (maxY - minY) * _schemState.zoom;

  // Build standalone SVG
  const vx = _schemState.viewX + minX * _schemState.zoom;
  const vy = _schemState.viewY + minY * _schemState.zoom;
  let content = svg.innerHTML;
  // Remove grid dots and crosshair (first two <g> and <g opacity="0.15"> elements)
  content = content.replace(/<g opacity="0\.18">[\s\S]*?<\/g>/, '');
  content = content.replace(/<g opacity="0\.15">[\s\S]*?<\/g>/, '');

  const svgStr = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${w} ${h}" width="${w}" height="${h}">
<style>@import url('https://fonts.googleapis.com/css2?family=Hammersmith+One&amp;display=swap');</style>
<rect x="${vx}" y="${vy}" width="${w}" height="${h}" fill="#fff"/>
${content}
</svg>`;

  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.settings?.systemName || 'railmap'}-schematic.svg`;
  a.click();
  URL.revokeObjectURL(url);

  _schemState.debug = wasDebug;
  renderSchematic();
  toast('SVG exported', 'success');
}

// ---- OGF Geo Import ----

function schemImportOGF() {
  // Find all stations with lat/lon
  const geoNodes = data.nodes.filter(n => isPassengerStop(n) && n.lat != null && n.lon != null);
  if (!geoNodes.length) { toast('No stations have OGF coordinates', 'error'); return; }

  appConfirm(`Import ${geoNodes.length} station(s) from OGF coordinates? This will place all line-stations at relative grid positions based on their geographic locations.`, () => {
    // Compute bounding box of geo coords
    const lats = geoNodes.map(n => n.lat), lons = geoNodes.map(n => n.lon);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const spanLat = maxLat - minLat || 1, spanLon = maxLon - minLon || 1;

    // Map to grid: fit into ~100x100 area, lat inverted (north=up=low gy)
    const gridSize = 100;
    const scale = gridSize / Math.max(spanLat, spanLon);

    const ls = data.beckmap.lineStations;
    for (const n of geoNodes) {
      const gx = Math.round((n.lon - minLon) * scale);
      const gy = Math.round((maxLat - n.lat) * scale); // invert lat
      // Place for all lines that serve this node
      for (const svc of data.services) {
        if (!svc.stops.some(st => st.nodeId === n.id)) continue;
        if (!ls[svc.groupId]) ls[svc.groupId] = {};
        if (!ls[svc.groupId][n.id]) {
          ls[svc.groupId][n.id] = { gx, gy };
          schemAutoJoinGroup(svc.groupId, n.id);
        }
      }
    }

    schemAutoGenerateGroups();
    save();
    renderSchemSidebar();
    renderSchematic();
    schemFitAll();
    toast(`Imported ${geoNodes.length} stations from OGF data`, 'success');
  });
}
