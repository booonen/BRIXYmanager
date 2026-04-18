// ============================================================
// DEPARTURE / ARRIVAL BOARD
// ============================================================
let boardMode = 'departures'; // 'departures' or 'arrivals'

function setBoardMode(mode) {
  boardMode = mode;
  document.getElementById('btn-dep-mode').style.background = mode === 'departures' ? 'var(--accent)' : '';
  document.getElementById('btn-dep-mode').style.borderColor = mode === 'departures' ? 'var(--accent)' : '';
  document.getElementById('btn-dep-mode').style.color = mode === 'departures' ? '#fff' : '';
  document.getElementById('btn-arr-mode').style.background = mode === 'arrivals' ? 'var(--accent)' : '';
  document.getElementById('btn-arr-mode').style.borderColor = mode === 'arrivals' ? 'var(--accent)' : '';
  document.getElementById('btn-arr-mode').style.color = mode === 'arrivals' ? '#fff' : '';
  renderDepartures();
}

let _departureStationId = '';

function populateStationSelect() {
  const prev = _departureStationId;
  createNodePicker({
    containerId: 'departure-station-picker', pickerId: 'np-dep-station',
    placeholder: t('departures.board.search_station'),
    filterFn: n => isPassengerStop(n),
    displayNameFn: nodeDisplayName,
    onSelect: function(nodeId) {
      _departureStationId = nodeId || '';
      boardUpdatePlatforms();
      renderDepartures();
    },
    selectedId: prev || null
  });
  // Default time and date to now if not already set
  const timeEl = document.getElementById('board-time');
  const dateEl = document.getElementById('board-date');
  if ((timeEl && !timeEl.value) || (dateEl && !dateEl.value)) boardSetNow();
}

function boardSetNow() {
  const now = new Date();
  document.getElementById('board-time').value =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  document.getElementById('board-date').value =
    now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  renderDepartures();
}

function boardUpdatePlatforms() {
  const sel = document.getElementById('board-platform');
  if (!sel) return;
  sel.innerHTML = `<option value="">${t('departures.label.all_platforms')}</option>`;
  const group = stationGroup(_departureStationId);
  for (const nid of group) {
    const node = getNode(nid);
    if (node && node.platforms && node.platforms.length) {
      for (const p of node.platforms) {
        sel.innerHTML += `<option value="${p.id}">${esc(p.name)}</option>`;
      }
    }
  }
}

function renderDepartures() {
  const sid = _departureStationId;
  const board = document.getElementById('departures-board');
  if (!sid) { board.innerHTML = `<div class="text-dim mt-16" style="font-size:13px;">${t('nodes.msg.select_station')}</div>`; return; }
  const station = getNode(sid);
  const isArr = boardMode === 'arrivals';

  // Expand to station group (all nodes sharing same display name)
  const sidGroup = new Set(stationGroup(sid));

  // Get board time and platform filter
  const timeEl = document.getElementById('board-time');
  const boardTimeStr = timeEl?.value || '00:00';
  const boardTime = toMin(boardTimeStr);
  const platFilter = document.getElementById('board-platform')?.value || '';
  const BOARD_LIMIT = platFilter ? 10 : 20;

  // Find transfer hub stations (stations served by 2+ services) for via selection
  const stationServiceCount = {};
  for (const svc of data.services) {
    const seen = new Set();
    for (const stop of svc.stops) {
      const node = getNode(stop.nodeId);
      if (isPassengerStop(node) && !stop.passThrough && !seen.has(stop.nodeId)) {
        stationServiceCount[stop.nodeId] = (stationServiceCount[stop.nodeId] || 0) + 1;
        seen.add(stop.nodeId);
      }
    }
  }

  const entries = [];
  const boardDate = document.getElementById('board-date')?.value || '';

  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    // Schedule pattern filter: skip if departure's service doesn't run on selected date
    if (boardDate && !patternMatchesDate(svc.schedulePattern, boardDate)) continue;
    for (let i = 0; i < dep.times.length; i++) {
      const t = dep.times[i];
      if (!sidGroup.has(t.nodeId)) continue;
      const stop = svc.stops[i];
      if (stop?.passThrough) continue;

      // Platform filter
      if (platFilter) {
        const thisPlatId = jpGetPlatAt(dep, svc, i);
        if (thisPlatId !== platFilter) continue;
      }

      // Service day: 04:00–27:59 (times before 04:00 count as previous day, shown as 24:xx–27:xx)

      if (isArr) {
        if (t.arrive == null) continue;
        const sortTime = t.arrive < DAY_CUTOFF_() ? t.arrive + 1440 : t.arrive;
        const boardSortTime = boardTime < DAY_CUTOFF_() ? boardTime + 1440 : boardTime;
        if (sortTime < boardSortTime) continue;
        const first = dep.times[0];
        const cat = getCat(svc.categoryId);
        const via = jpBoardVia(dep, svc, 0, i, sid, stationServiceCount);
        const grp = getGroup(svc.groupId);
        entries.push({ time: t.arrive, sortTime, origin: nodeDisplayName(first.nodeId), service: svc.name,
          platform: depPlatName(dep, svc, i), via,
          catAbbr: cat?.abbreviation || cat?.name || '—',
          catColor: cat?.color || 'var(--text-dim)',
          lineColor: grp?.color || '',
          lineName: grp?.name || '',
          depId: dep.id, svcId: svc.id });
      } else {
        if (t.depart == null) continue;
        const sortTime = t.depart < DAY_CUTOFF_() ? t.depart + 1440 : t.depart;
        const boardSortTime = boardTime < DAY_CUTOFF_() ? boardTime + 1440 : boardTime;
        if (sortTime < boardSortTime) continue;
        const last = dep.times[dep.times.length - 1];
        const cat = getCat(svc.categoryId);
        const via = jpBoardVia(dep, svc, i, dep.times.length - 1, sid, stationServiceCount);
        const grp = getGroup(svc.groupId);
        entries.push({ time: t.depart, sortTime, destination: nodeDisplayName(last.nodeId), service: svc.name,
          platform: depPlatName(dep, svc, i), via,
          catAbbr: cat?.abbreviation || cat?.name || '—',
          catColor: cat?.color || 'var(--text-dim)',
          lineColor: grp?.color || '',
          lineName: grp?.name || '',
          depId: dep.id, svcId: svc.id });
      }
    }
  }
  entries.sort((a, b) => a.sortTime - b.sortTime);

  // Limit to BOARD_LIMIT
  const visible = entries.slice(0, BOARD_LIMIT);
  const totalCount = entries.length;

  if (!visible.length) {
    const platName = platFilter ? (() => { const n = getNode(sid); const p = (n?.platforms||[]).find(x=>x.id===platFilter); return p ? platDisplayName(p.name) : 'selected platform'; })() : '';
    board.innerHTML = `<div class="text-dim mt-16" style="font-size:13px;">${t('departures.empty.no_services_at_time', { mode: isArr ? t('departures.btn.arrivals').toLowerCase() : t('departures.btn.departures').toLowerCase(), time: toTime(boardTime) })}</div>`;
    return;
  }

  const headerLabel = isArr ? t('departures.btn.arrivals').toUpperCase() : t('departures.btn.departures').toUpperCase();
  const dirLabel = isArr ? t('departures.board.col_origin') : t('departures.board.col_destination');
  const platLabel = platFilter ? (() => { const n = getNode(sid); const p = (n?.platforms||[]).find(x=>x.id===platFilter); return p ? ' · ' + esc(platDisplayName(p.name)) : ''; })() : '';

  board.innerHTML = `<div class="departure-board">
    <div class="departure-board-header"><h3>${headerLabel} — ${esc(nodeDisplayName(sid)).toUpperCase()}${platLabel}</h3>
      <span style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">${t('departures.board.showing', { n: visible.length + (totalCount > BOARD_LIMIT ? ' / ' + totalCount : ''), time: toTime(boardTime) })}</span></div>
    <div class="departure-row departure-row-header"><div>${t('departures.board.col_time')}</div><div>${t('departures.board.col_mode')}</div><div>${dirLabel}</div><div>${t('departures.board.col_line')}</div><div>${t('departures.board.col_plt')}</div></div>
    ${visible.map(d => {
      const platDisplay = platDisplayName(d.platform);
      return `<div class="departure-row" onclick="showTrainSchedule('${d.depId}')">
      <div class="dep-time">${toTime(d.time)}</div>
      <div style="font-size:12px;color:var(--text-dim)">${esc(d.catAbbr)}</div>
      <div class="dep-destination">${esc(d.destination || d.origin)}${d.via.length ? `<div style="font-size:12px;color:var(--text-dim);margin-top:2px">${t('departures.board.via')} ${d.via.map(v => esc(v)).join(', ')}</div>` : ''}</div>
      <div>${d.lineColor ? `<span class="dep-line" style="background:${d.lineColor};color:${contrastText(d.lineColor)}">${esc(d.lineName)}</span>` : `<span class="dep-line" style="background:var(--bg-input);color:var(--text-dim)">${esc(d.lineName || '—')}</span>`}</div>
      <div class="dep-platform">${esc(platDisplay)}</div>
    </div>`;
    }).join('')}</div>`;
}

// Pick up to 4 "via" stations for the departure/arrival board.
// 1: First next stop (immediate direction)
// 2: First useful transfer hub (unlocks new destinations not reachable from viewer's station)
// 3-4: Additional transfer hubs, spread out, preferring more connections
// Fallback: fill with intermediate stations spread across route
function jpBoardVia(dep, svc, fromIdx, toIdx, excludeNodeId, hubCounts) {
  // Collect candidate stations on this route (excluding origin/destination)
  const candidates = [];
  for (let i = fromIdx + 1; i < toIdx; i++) {
    const t = dep.times[i];
    const node = getNode(t.nodeId);
    const stop = svc.stops[i];
    if (!node || !isPassengerStop(node)) continue;
    if (stop?.passThrough) continue;
    if (t.nodeId === excludeNodeId) continue;
    candidates.push({ nodeId: t.nodeId, name: nodeDisplayName(t.nodeId), position: i });
  }

  if (candidates.length === 0) return [];
  if (candidates.length <= 4) return candidates.map(c => c.name);

  // Build set of destinations reachable from the viewing station group (by display name)
  const viewerGroup = stationGroup(excludeNodeId);
  const viewerDestNames = new Set();
  for (const s of data.services) {
    let passesViewer = false;
    for (const stop of s.stops) {
      if (viewerGroup.includes(stop.nodeId) && !stop.passThrough) { passesViewer = true; break; }
    }
    if (!passesViewer) continue;
    for (const stop of s.stops) {
      if (!stop.passThrough) viewerDestNames.add(nodeDisplayName(stop.nodeId));
    }
  }

  // For each candidate, compute "new destinations" — display names reachable from that
  // candidate's station group that are NOT already reachable from the viewer
  const candidateNewDests = {};
  for (const c of candidates) {
    const cGroup = stationGroup(c.nodeId);
    const newDests = new Set();
    for (const s of data.services) {
      let passesCandidate = false;
      for (const stop of s.stops) {
        if (cGroup.includes(stop.nodeId) && !stop.passThrough) { passesCandidate = true; break; }
      }
      if (!passesCandidate) continue;
      for (const stop of s.stops) {
        const dn = nodeDisplayName(stop.nodeId);
        if (!stop.passThrough && !viewerDestNames.has(dn) && dn !== nodeDisplayName(c.nodeId)) {
          newDests.add(dn);
        }
      }
    }
    candidateNewDests[c.nodeId] = newDests.size;
  }

  const selected = [];
  const usedIds = new Set();

  // Slot 1: First next stop
  const firstStop = candidates[0];
  selected.push(firstStop);
  usedIds.add(firstStop.nodeId);

  // Slot 2: First transfer hub (earliest station with newDests > 0)
  const firstHub = candidates.find(c => !usedIds.has(c.nodeId) && candidateNewDests[c.nodeId] > 0);
  if (firstHub) { selected.push(firstHub); usedIds.add(firstHub.nodeId); }

  // Slots 3-4: Additional hubs with most new destinations, spread out
  const remainingHubs = candidates
    .filter(c => !usedIds.has(c.nodeId) && candidateNewDests[c.nodeId] > 0)
    .sort((a, b) => candidateNewDests[b.nodeId] - candidateNewDests[a.nodeId]);

  // Pick up to 2 more, preferring spread
  if (remainingHubs.length > 0) {
    // Prefer one from the later part of the route
    const midPoint = (candidates[0].position + candidates[candidates.length - 1].position) / 2;
    const laterHub = remainingHubs.find(c => c.position > midPoint) || remainingHubs[0];
    if (laterHub) { selected.push(laterHub); usedIds.add(laterHub.nodeId); }

    const moreHubs = remainingHubs.filter(c => !usedIds.has(c.nodeId));
    if (moreHubs.length > 0 && selected.length < 4) {
      selected.push(moreHubs[0]);
      usedIds.add(moreHubs[0].nodeId);
    }
  }

  // Fallback: fill remaining slots with spread-out intermediate stations
  if (selected.length < 4) {
    const remaining = candidates.filter(c => !usedIds.has(c.nodeId));
    if (remaining.length > 0) {
      // Pick evenly spread
      const needed = 4 - selected.length;
      const step = remaining.length / (needed + 1);
      for (let i = 0; i < needed && i * step < remaining.length; i++) {
        const pick = remaining[Math.min(Math.floor((i + 1) * step), remaining.length - 1)];
        if (pick && !usedIds.has(pick.nodeId)) {
          selected.push(pick);
          usedIds.add(pick.nodeId);
        }
      }
    }
  }

  // Sort by route position for display
  selected.sort((a, b) => a.position - b.position);
  return selected.map(c => c.name);
}

function renderBoardMap() {
  const mapEl = document.getElementById('departures-map');
  if (!mapEl) return;
  detailMapDestroy('dm-board');
  const sid = _departureStationId;
  if (!sid) { mapEl.innerHTML = ''; return; }
  const station = getNode(sid);
  if (!station || station.lat == null) { mapEl.innerHTML = ''; return; }

  // Find all lines through this station group
  const sidGroup = new Set(stationGroup(sid));
  const lineColors = new Map();
  for (const svc of data.services) {
    if (!svc.groupId) continue;
    if (svc.stops.some(st => sidGroup.has(st.nodeId))) {
      const grp = getGroup(svc.groupId);
      if (grp) lineColors.set(svc.groupId, grp.color);
    }
  }

  // Collect segments for highlighted lines
  const highlightSegs = new Map(); // segId -> color
  for (const svc of data.services) {
    if (!lineColors.has(svc.groupId)) continue;
    const color = lineColors.get(svc.groupId);
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const s = findSeg(svc.stops[i].nodeId, svc.stops[i+1].nodeId);
      if (s && !highlightSegs.has(s.id)) highlightSegs.set(s.id, color);
    }
  }

  mapEl.innerHTML = detailMapContainerHTML('dm-board', true);
  detailMapInitGeo('dm-board', map => {
    _dmDrawBackground(map, [...highlightSegs.keys()]);
    // Draw highlighted line segments
    for (const [segId, color] of highlightSegs) {
      const s = getSeg(segId); if (!s) continue;
      const coords = segmentCoords(s);
      if (coords.length < 2) continue;
      L.polyline(coords, { color: '#000', weight: 6, opacity: 0.8 }).addTo(map);
      L.polyline(coords, { color, weight: 4, opacity: 1 }).addTo(map);
    }
    // Station dots for nearby passenger stops
    const nearby = new Set();
    for (const nid of sidGroup) {
      for (const c of connectedNodes(nid)) {
        const n = getNode(c.nodeId);
        if (isPassengerStop(n) && n.lat != null && !sidGroup.has(n.id)) nearby.add(n);
      }
    }
    for (const n of nearby) { _dmStationDot(map, n, {}); _dmLabel(map, n); }
    // Focal station (large, accent)
    _dmStationDot(map, station, { radius: 9, fill: '#ffc917', stroke: '#000', weight: 3 });
    _dmLabel(map, station);
    _dmFitNodes(map, [station, ...nearby]);
  });
}
