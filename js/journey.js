// ============================================================
// JOURNEY PLANNER
// ============================================================
function initJourneyPlanner() {
  if (!document.getElementById('np-jpOrigin')) {
    // Only show one node per display name group
    const seenNames = {};
    const jpStationFilter = (n) => {
      if (!isPassengerStop(n)) return false;
      const dn = nodeDisplayName(n.id);
      if (seenNames[dn]) return false;
      seenNames[dn] = true;
      return true;
    };
    // Build the filter list fresh (seenNames needs to reset per picker creation)
    const jpFilter = n => isPassengerStop(n);
    createNodePicker({
      containerId: 'jp-origin-picker', pickerId: 'np-jpOrigin',
      placeholder: t('journey.origin'),
      filterFn: jpFilter, displayNameFn: nodeDisplayName,
      onEnterSelect: () => { const el = document.getElementById('np-jpDest-input'); if (el) { el.style.display = ''; el.focus(); } }
    });
    createNodePicker({
      containerId: 'jp-dest-picker', pickerId: 'np-jpDest',
      placeholder: t('journey.destination'),
      filterFn: jpFilter, displayNameFn: nodeDisplayName,
      onEnterSelect: () => jpSearch()
    });
    // Default JP date and time to now on first init only
    jpSetNow();
  }
}

function jpSetNow() {
  const now = new Date();
  document.getElementById('jp-time').value =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  document.getElementById('jp-date').value =
    now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

function jpSwapStations() {
  const origEl = document.getElementById('np-jpOrigin');
  const destEl = document.getElementById('np-jpDest');
  if (!origEl || !destEl) return;
  const origId = origEl._npConfig?.selectedId;
  const destId = destEl._npConfig?.selectedId;
  nodePickerClear('np-jpOrigin');
  nodePickerClear('np-jpDest');
  if (destId) nodePickerSetValue('np-jpOrigin', destId);
  if (origId) nodePickerSetValue('np-jpDest', origId);
}

// ---- Schedule filtering ----
// Check if a departure runs on a given search date.
// Pattern lives on the SERVICE (not the departure). Uses patternMatchesDate() from core.js.
function jpDepartureRuns(dep, searchContext) {
  if (!searchContext?.date) return true; // No date selected = show all
  const svc = getSvc(dep.serviceId);
  return patternMatchesDate(svc?.schedulePattern, searchContext.date);
}

// ---- Connection Scan Algorithm ----
// A "connection" = one segment of a departure: board at station X, arrive at station Y.
// Pre-build all connections sorted by departure time for fast scanning.

function jpBuildConnections(searchContext) {
  const connections = [];
  for (const dep of data.departures) {
    if (!jpDepartureRuns(dep, searchContext)) continue;
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    const cat = getCat(svc.categoryId);
    const group = svc.groupId ? data.serviceGroups.find(g => g.id === svc.groupId) : null;
    const stock = getStock(dep.stockId || svc.stockId);

    // Find terminus (last station in this departure)
    let terminusName = '';
    for (let k = dep.times.length - 1; k >= 0; k--) {
      const tN = getNode(dep.times[k].nodeId);
      if (isPassengerStop(tN)) { terminusName = nodeDisplayName(tN.id); break; }
    }

    // Build connections between consecutive non-pass-through station stops
    let lastStationIdx = -1;
    for (let i = 0; i < dep.times.length; i++) {
      const node = getNode(dep.times[i].nodeId);
      if (!node || !isPassengerStop(node)) continue;
      const stop = svc.stops[i];
      if (stop?.passThrough) continue; // Can't board or alight at pass-through stops

      if (lastStationIdx >= 0) {
        const fromTime = dep.times[lastStationIdx];
        const toTime = dep.times[i];
        if (fromTime.depart != null && toTime.arrive != null) {
          const fromStop = svc.stops[lastStationIdx];
          const toStop = svc.stops[i];
          connections.push({
            depId: dep.id, svcId: svc.id, dep, svc,
            fromNodeId: fromTime.nodeId, toNodeId: toTime.nodeId,
            depart: fromTime.depart, arrive: toTime.arrive,
            fromPlatId: jpGetPlatAt(dep, svc, lastStationIdx),
            toPlatId: jpGetPlatAt(dep, svc, i),
            fromIdx: lastStationIdx, toIdx: i,
            catName: cat?.name || '', catAbbr: cat?.abbreviation || '',
            catColor: cat?.color || 'var(--text-dim)',
            groupName: group?.name || '', lineColor: group?.color || '', terminusName,
            stockName: stock?.name || '', svcName: svc.name,
            intermediateStops: jpCountIntermediateStops(dep, lastStationIdx, i)
          });
        }
      }
      lastStationIdx = i;
    }
  }
  // Sort by departure time
  connections.sort((a, b) => a.depart - b.depart);
  return connections;
}

// CSA: find the best journey from origin to dest departing at or after startTime
function jpCSASearch(originIds, destIds, startTime, connections) {
  // Accept single ID or array
  if (!Array.isArray(originIds)) originIds = [originIds];
  if (!Array.isArray(destIds)) destIds = [destIds];
  const destSet = new Set(destIds);

  const earliestArrival = {};
  const inConnection = {};
  const tripReachable = {};

  // Pre-compute interchange links (always available, no schedule)
  const interchanges = []; // { fromNodeId, toNodeId, walkMins, segId, interchangeType }
  for (const seg of data.segments) {
    if (!isInterchange(seg)) continue;
    const walkMins = seg.distance / WALKING_SPEED() * 60;
    interchanges.push({ fromNodeId: seg.nodeA, toNodeId: seg.nodeB, walkMins, segId: seg.id, interchangeType: seg.interchangeType });
    interchanges.push({ fromNodeId: seg.nodeB, toNodeId: seg.nodeA, walkMins, segId: seg.id, interchangeType: seg.interchangeType });
  }

  // Build interchange lookup by fromNodeId
  const ichByNode = {};
  for (const ich of interchanges) {
    if (!ichByNode[ich.fromNodeId]) ichByNode[ich.fromNodeId] = [];
    ichByNode[ich.fromNodeId].push(ich);
  }

  // Propagate through interchanges from a station
  function propagateInterchanges(nodeId) {
    const links = ichByNode[nodeId];
    if (!links) return;
    for (const ich of links) {
      const arrTime = earliestArrival[nodeId] + ich.walkMins;
      if (earliestArrival[ich.toNodeId] == null || arrTime < earliestArrival[ich.toNodeId]) {
        earliestArrival[ich.toNodeId] = arrTime;
        inConnection[ich.toNodeId] = {
          depId: '__walk_' + ich.segId, svcId: null, dep: null, svc: null,
          fromNodeId: nodeId, toNodeId: ich.toNodeId,
          depart: earliestArrival[nodeId], arrive: arrTime,
          fromPlatId: null, toPlatId: null,
          fromIdx: 0, toIdx: 0,
          catName: '', catAbbr: '', catColor: 'var(--text-muted)',
          groupName: '', lineColor: '', terminusName: nodeDisplayName(ich.toNodeId),
          stockName: '', svcName: '',
          intermediateStops: 0,
          isWalk: true, interchangeType: ich.interchangeType, walkMins: ich.walkMins
        };
        // Recursively propagate (in case of chained interchanges)
        propagateInterchanges(ich.toNodeId);
      }
    }
  }

  for (const oid of originIds) {
    earliestArrival[oid] = startTime;
    propagateInterchanges(oid);
  }

  // Binary search for first connection
  let lo = 0, hi = connections.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (connections[mid].depart < startTime) lo = mid + 1;
    else hi = mid;
  }

  for (let ci = lo; ci < connections.length; ci++) {
    const conn = connections[ci];

    // Early termination: best arrival at any dest node
    let bestDestArrival = null;
    for (const did of destIds) {
      if (earliestArrival[did] != null && (bestDestArrival == null || earliestArrival[did] < bestDestArrival)) {
        bestDestArrival = earliestArrival[did];
      }
    }
    if (bestDestArrival != null && conn.depart >= bestDestArrival) break;

    const arrivalAtFrom = earliestArrival[conn.fromNodeId];
    if (arrivalAtFrom == null) continue;

    const reachedVia = inConnection[conn.fromNodeId];
    let canBoard = false;

    if (tripReachable[conn.depId]) {
      canBoard = true;
    } else if (arrivalAtFrom <= conn.depart) {
      if (!reachedVia || reachedVia.depId === conn.depId) {
        canBoard = true;
      } else if (reachedVia.isWalk) {
        // Arrived via walking — no additional transfer time needed
        canBoard = true;
      } else {
        const samePlat = reachedVia.toPlatId && reachedVia.toPlatId === conn.fromPlatId;
        const xferTime = samePlat ? 0 : JP_TRANSFER_MIN_();
        canBoard = (arrivalAtFrom + xferTime <= conn.depart);
      }
    }

    if (!canBoard) continue;

    tripReachable[conn.depId] = true;

    const prevArr = earliestArrival[conn.toNodeId];
    const prevConn = inConnection[conn.toNodeId];
    // Prefer: earlier arrival, or same arrival but non-walk over walk
    const isBetter = prevArr == null || conn.arrive < prevArr ||
      (Math.abs(conn.arrive - prevArr) < 0.5 && prevConn?.isWalk && !conn.isWalk);
    if (isBetter) {
      earliestArrival[conn.toNodeId] = conn.arrive;
      inConnection[conn.toNodeId] = conn;
      propagateInterchanges(conn.toNodeId);
    }
  }

  // Reconstruct journey — find best dest node
  let bestDestNode = null, bestDestTime = Infinity;
  for (const did of destIds) {
    if (earliestArrival[did] != null && earliestArrival[did] < bestDestTime) {
      bestDestTime = earliestArrival[did]; bestDestNode = did;
    }
  }
  if (!bestDestNode) return null;

  const originSet = new Set(originIds);

  // Trace back from destination
  const legConnections = [];
  let currentNode = bestDestNode;
  while (!originSet.has(currentNode)) {
    const conn = inConnection[currentNode];
    if (!conn) return null;
    legConnections.unshift(conn);
    currentNode = conn.fromNodeId;
  }

  // Merge consecutive connections on the same departure into single legs
  const legs = [];
  let i = 0;
  while (i < legConnections.length) {
    const startConn = legConnections[i];

    // Walk legs are always standalone
    if (startConn.isWalk) {
      legs.push({
        svcId: null, depId: startConn.depId,
        svcName: '', groupName: '', lineColor: '', catName: '', catAbbr: '',
        catColor: 'var(--text-muted)',
        terminusName: startConn.terminusName, stockName: '',
        boardNodeId: startConn.fromNodeId, boardNodeName: nodeDisplayName(startConn.fromNodeId),
        alightNodeId: startConn.toNodeId, alightNodeName: nodeDisplayName(startConn.toNodeId),
        boardTime: startConn.depart, alightTime: startConn.arrive,
        boardPlatId: null, alightPlatId: null,
        boardPlatName: null, alightPlatName: null,
        intermediateStops: 0,
        dep: null, svc: null, boardIdx: 0, alightIdx: 0,
        isWalk: true, interchangeType: startConn.interchangeType,
        walkMins: startConn.walkMins
      });
      i++;
      continue;
    }

    let endConn = startConn;

    // Merge consecutive connections on same departure
    while (i + 1 < legConnections.length && legConnections[i + 1].depId === startConn.depId && !legConnections[i + 1].isWalk) {
      i++;
      endConn = legConnections[i];
    }

    const totalIntermediateStops = startConn.dep ? jpCountIntermediateStops(startConn.dep, startConn.fromIdx, endConn.toIdx) : 0;

    legs.push({
      svcId: startConn.svcId, depId: startConn.depId,
      svcName: startConn.svcName, groupName: startConn.groupName,
      lineColor: startConn.lineColor,
      catName: startConn.catName, catAbbr: startConn.catAbbr,
      catColor: startConn.catColor,
      terminusName: startConn.terminusName, stockName: startConn.stockName,
      boardNodeId: startConn.fromNodeId, boardNodeName: nodeDisplayName(startConn.fromNodeId),
      alightNodeId: endConn.toNodeId, alightNodeName: nodeDisplayName(endConn.toNodeId),
      boardTime: startConn.depart, alightTime: endConn.arrive,
      boardPlatId: startConn.fromPlatId, alightPlatId: endConn.toPlatId,
      boardPlatName: startConn.fromPlatId ? jpPlatName(startConn.fromNodeId, startConn.fromPlatId) : null,
      alightPlatName: endConn.toPlatId ? jpPlatName(endConn.toNodeId, endConn.toPlatId) : null,
      intermediateStops: totalIntermediateStops,
      dep: startConn.dep, svc: startConn.svc,
      boardIdx: startConn.fromIdx, alightIdx: endConn.toIdx
    });
    i++;
  }

  return {
    legs,
    depart: legs[0].boardTime,
    arrive: legs[legs.length - 1].alightTime
  };
}

// Post-process: eliminate unnecessary transfers and walks.
// 1. If a later service also stops at an earlier boarding point → merge, skip intermediate legs.
// 2. If a walk connects two transit legs and the later service also stops at the walk's origin → skip the walk.
function jpSimplifyJourney(journey) {
  if (!journey.legs || journey.legs.length < 2) return;

  let changed = true;
  while (changed) {
    changed = false;

    // Pass 1: Eliminate unnecessary walks (OSI/ISI between transit legs)
    for (let i = 0; i < journey.legs.length; i++) {
      const walk = journey.legs[i];
      if (!walk.isWalk) continue;

      // Find transit leg AFTER the walk
      const nextTransit = journey.legs[i + 1];
      if (!nextTransit || nextTransit.isWalk || !nextTransit.dep?.times || !nextTransit.svc?.stops) continue;

      // Does the next transit's departure also stop at the walk's ORIGIN (before its current board point)?
      const walkOrigin = walk.boardNodeId;
      for (let k = 0; k < nextTransit.boardIdx; k++) {
        const stop = nextTransit.svc.stops[k];
        if (stop?.passThrough) continue;
        if (nextTransit.dep.times[k].nodeId === walkOrigin) {
          const depTime = nextTransit.dep.times[k].depart;
          if (depTime != null && depTime >= walk.boardTime) {
            // Board next service at walk origin instead — remove walk, update board point
            journey.legs[i + 1] = { ...nextTransit, boardNodeId: walkOrigin, boardNodeName: nodeDisplayName(walkOrigin),
              boardTime: depTime, boardIdx: k, intermediateStops: nextTransit.alightIdx - k - 1 };
            journey.legs.splice(i, 1); // remove walk
            changed = true; break;
          }
          break;
        }
      }
      if (changed) break;

      // Also check: does the PREVIOUS transit's departure also stop at the walk's DESTINATION?
      if (i > 0) {
        const prevTransit = journey.legs[i - 1];
        if (prevTransit && !prevTransit.isWalk && prevTransit.dep?.times && prevTransit.svc?.stops) {
          const walkDest = walk.alightNodeId;
          for (let k = prevTransit.alightIdx + 1; k < prevTransit.dep.times.length; k++) {
            const stop = prevTransit.svc.stops[k];
            if (stop?.passThrough) continue;
            if (prevTransit.dep.times[k].nodeId === walkDest) {
              const arrTime = prevTransit.dep.times[k].arrive;
              if (arrTime != null) {
                // Alight previous service at walk destination instead — remove walk, update alight point
                journey.legs[i - 1] = { ...prevTransit, alightNodeId: walkDest, alightNodeName: nodeDisplayName(walkDest),
                  alightTime: arrTime, alightIdx: k, intermediateStops: k - prevTransit.boardIdx - 1 };
                journey.legs.splice(i, 1);
                changed = true; break;
              }
              break;
            }
          }
          if (changed) break;
        }
      }
    }
    if (changed) { journey.depart = journey.legs[0].boardTime; journey.arrive = journey.legs[journey.legs.length - 1].alightTime; continue; }

    // Pass 2: Merge redundant transit legs (later service stops at earlier board point)
    const transitIdxs = [];
    for (let i = 0; i < journey.legs.length; i++) { if (!journey.legs[i].isWalk) transitIdxs.push(i); }
    if (transitIdxs.length < 2) break;

    for (let ti = 0; ti < transitIdxs.length - 1; ti++) {
      const idxA = transitIdxs[ti];
      for (let tj = ti + 1; tj < transitIdxs.length; tj++) {
        const idxB = transitIdxs[tj];
        const legA = journey.legs[idxA];
        const legB = journey.legs[idxB];
        if (!legB.dep?.times || !legB.svc?.stops) continue;
        const targetNid = legA.boardNodeId;
        let foundIdx = -1;
        for (let k = 0; k < legB.boardIdx; k++) {
          const stop = legB.svc.stops[k];
          if (stop?.passThrough) continue;
          if (legB.dep.times[k].nodeId === targetNid) {
            const depTime = legB.dep.times[k].depart;
            if (depTime != null && depTime >= legA.boardTime) foundIdx = k;
            break;
          }
        }
        if (foundIdx < 0) continue;
        const mergedLeg = { ...legB, boardNodeId: targetNid, boardNodeName: nodeDisplayName(targetNid),
          boardTime: legB.dep.times[foundIdx].depart, boardIdx: foundIdx, intermediateStops: legB.alightIdx - foundIdx - 1 };
        journey.legs.splice(idxA, idxB - idxA + 1, mergedLeg);
        journey.depart = journey.legs[0].boardTime;
        journey.arrive = journey.legs[journey.legs.length - 1].alightTime;
        changed = true; break;
      }
      if (changed) break;
    }
  }
}

// Sequential search: find N best journeys by stepping forward
function jpSearchSequential(originIds, destIds, startTime, count, searchContext) {
  // Accept single ID or array
  if (!Array.isArray(originIds)) originIds = [originIds];
  if (!Array.isArray(destIds)) destIds = [destIds];
  const connections = jpBuildConnections(searchContext);
  const journeys = [];
  let searchFrom = startTime;
  let wrapped = false;
  let attempts = 0;

  while (journeys.length < count && attempts < 300) {
    attempts++;

    let best = jpCSASearch(originIds, destIds, searchFrom, connections);

    if (!best) {
      if (!wrapped) {
        wrapped = true;
        searchFrom = 0;
        continue;
      }
      break;
    }

    // If we wrapped and this departure is at or after original start, we've looped a full day
    if (wrapped && best.depart >= startTime) break;

    // Journey quality: fewer OSIs > fewer transfers > later departure
    function jpQuality(j) {
      if (!j.legs) return { osis: 0, transfers: j.legs?.length || 0, depart: j.depart };
      const osis = j.legs.filter(l => l.isWalk && l.interchangeType === 'osi').length;
      const transfers = Math.max(0, j.legs.filter(l => !l.isWalk).length - 1);
      return { osis, transfers, depart: j.depart };
    }
    function jpBetterQuality(a, b) {
      const qa = jpQuality(a), qb = jpQuality(b);
      if (qa.osis !== qb.osis) return qa.osis < qb.osis;
      if (qa.transfers !== qb.transfers) return qa.transfers < qb.transfers;
      return qa.depart > qb.depart; // later departure = less waiting
    }

    // Dupe check — if same depart+arrive exists, replace if better quality
    const dupeIdx = journeys.findIndex(j =>
      Math.abs(j.depart - best.depart) < 0.5 && Math.abs(j.arrive - best.arrive) < 0.5
    );
    if (dupeIdx >= 0) {
      if (jpBetterQuality(best, journeys[dupeIdx])) journeys[dupeIdx] = best;
      searchFrom = best.depart + 1;
      continue;
    }

    // "Sleep in" optimization: if a later departure arrives at the same time,
    // prefer the one with better quality (fewer OSIs, fewer transfers, later departure).
    let peekFrom = best.depart + 1;
    let peekAttempts = 0;
    while (peekAttempts < 100) {
      peekAttempts++;
      if (peekFrom >= 1440) break;
      const peek = jpCSASearch(originIds, destIds, peekFrom, connections);
      if (!peek) break;
      if (Math.abs(peek.arrive - best.arrive) < 0.5) {
        if (jpBetterQuality(peek, best)) best = peek;
        peekFrom = peek.depart + 1;
      } else {
        break;
      }
    }

    jpSimplifyJourney(best);
    journeys.push(best);
    searchFrom = best.depart + 1;

    // If we've gone past midnight, wrap
    if (searchFrom >= 1440 && !wrapped) {
      wrapped = true;
      searchFrom = 0;
    }
  }
  return journeys;
}

function jpGetPlatAt(dep, svc, stopIdx) {
  const override = (dep.platformOverrides || {})[stopIdx];
  if (override) return override;
  return svc.stops[stopIdx]?.platformId || null;
}

function jpPlatName(nodeId, platId) {
  const node = getNode(nodeId);
  if (!node) return '';
  const plat = (node.platforms || []).find(p => p.id === platId);
  return plat ? platDisplayName(plat.name) : '';
}

function jpCountIntermediateStops(dep, fromIdx, toIdx) {
  let count = 0;
  const svc = getSvc(dep.serviceId);
  for (let i = fromIdx + 1; i < toIdx; i++) {
    const node = getNode(dep.times[i].nodeId);
    const stop = svc?.stops[i];
    if (isPassengerStop(node) && stop && !stop.passThrough) count++;
  }
  return count;
}

function jpSearch() {
  // Clean up any existing JP maps
  for (const [k, jpd] of Object.entries(_jpMaps)) { if (jpd.map) jpd.map.remove(); }
  for (const k of Object.keys(_jpMaps)) delete _jpMaps[k];
  for (const k of Object.keys(_jpBeckRendered)) delete _jpBeckRendered[k];

  const originId = nodePickerGetValue('np-jpOrigin');
  const destId = nodePickerGetValue('np-jpDest');
  if (!originId || !destId) { toast(t('journey.toast.select_origin_dest'), 'error'); return; }

  // Expand to station groups
  const originGroup = stationGroup(originId);
  const destGroup = stationGroup(destId);

  // Check no overlap between origin and dest groups
  if (originGroup.some(id => destGroup.includes(id))) { toast(t('journey.toast.origin_dest_differ'), 'error'); return; }

  const timeStr = document.getElementById('jp-time').value || '08:00';
  const startTime = toMin(timeStr);
  const el = document.getElementById('jp-results');
  el.innerHTML = '<div class="text-dim" style="padding:20px;text-align:center">Searching...</div>';
  setTimeout(() => {
    const jpDateStr = document.getElementById('jp-date')?.value || '';
    const searchContext = {
      dayOfWeek: jpDateStr ? isoWeekday(jpDateStr) : null,
      date: jpDateStr || null
    };
    window._jpOriginGroup = originGroup;
    window._jpDestGroup = destGroup;
    window._jpOriginId = originId;
    window._jpDestId = destId;
    window._jpStartTime = startTime;
    window._jpSearchContext = searchContext;
    window._jpAllJourneys = [];
    window._jpPageStart = 0;
    jpLoadMore(startTime, true);
  }, 10);
}

function jpLoadMore(fromTime, isInitial) {
  const { _jpOriginGroup: oGroup, _jpDestGroup: dGroup, _jpSearchContext: ctx } = window;
  const journeys = jpSearchSequential(oGroup, dGroup, fromTime, 5, ctx);
  if (isInitial) {
    window._jpAllJourneys = journeys;
  } else {
    for (const j of journeys) {
      const isDupe = window._jpAllJourneys.some(e =>
        Math.abs(e.depart - j.depart) < 0.5 && Math.abs(e.arrive - j.arrive) < 0.5
      );
      if (!isDupe) window._jpAllJourneys.push(j);
    }
  }
  jpRenderPage();
}

function jpRenderPage() {
  // Filter out walk-only journeys (pure OSI/ISI with no transit)
  const journeys = (window._jpAllJourneys || []).filter(j => !j.legs || !j.legs.every(l => l.isWalk));
  const start = window._jpPageStart || 0;
  const pageSize = 5;
  const visible = journeys.slice(start, start + pageSize);
  const hasPrev = start > 0;
  const hasNext = start + pageSize < journeys.length || journeys.length > 0;
  jpRenderResults(visible, hasPrev, hasNext, start, journeys.length);
}

function jpPageEarlier() {
  window._jpPageStart = Math.max(0, (window._jpPageStart || 0) - 5);
  jpRenderPage();
}

function jpPageLater() {
  const start = (window._jpPageStart || 0) + 5;
  if (start >= window._jpAllJourneys.length) {
    const lastJ = window._jpAllJourneys[window._jpAllJourneys.length - 1];
    if (lastJ) {
      window._jpPageStart = start;
      jpLoadMore(lastJ.depart + 1, false);
      return;
    }
  }
  window._jpPageStart = start;
  jpRenderPage();
}


function jpRenderResults(visible, hasPrev, hasNext, start, total) {
  const el = document.getElementById('jp-results');
  if (!visible.length && start === 0) {
    el.innerHTML = `<div class="empty-state mt-16"><div class="empty-icon">⇄</div>
      <h3>${t('journey.no_journeys')}</h3><p>${t('journey.no_journeys_desc')}</p></div>`;
    return;
  }

  let html = `<div class="mt-16" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">Showing ${start+1}–${start+visible.length}</strong>
    <div class="flex gap-8">
      ${hasPrev ? `<button class="btn btn-sm" onclick="jpPageEarlier()">← ${t('journey.btn.earlier')}</button>` : ''}
      ${hasNext ? `<button class="btn btn-sm" onclick="jpPageLater()">${t('journey.btn.later')} →</button>` : ''}
    </div>
  </div>`;

  for (let ji = 0; ji < visible.length; ji++) {
    const journey = visible[ji];
    const jIdx = start + ji;
    const duration = journey.arrive - journey.depart;
    const transfers = journey.legs.length - 1;
    const durationStr = duration < 60 ? `${Math.round(duration)} min` : `${Math.floor(duration / 60)}h ${Math.round(duration % 60)}m`;

    html += `<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px">`;
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <div>
        <span class="mono" style="font-size:18px;color:var(--warn)">${toTime(journey.depart)}</span>
        <span class="text-muted" style="margin:0 8px">→</span>
        <span class="mono" style="font-size:18px">${toTime(journey.arrive)}</span>
      </div>
      <div style="text-align:right">
        <span style="font-size:14px;font-weight:600">${durationStr}</span>
        <span class="text-muted" style="margin-left:8px;font-size:12px">${transfers === 0 ? t('journey.direct') : transfers === 1 ? t('journey.transfers_one') : t('journey.transfers_other', { n: transfers })}</span>
      </div>
    </div>`;

    // Side-by-side: route on left, map on right
    html += `<div style="display:flex;gap:16px">`;
    html += `<div style="flex:1;min-width:0;position:relative;padding-left:20px">`;
    for (let li = 0; li < journey.legs.length; li++) {
      const leg = journey.legs[li];
      const legDur = leg.alightTime - leg.boardTime;
      const legDurStr = legDur < 60 ? `${Math.round(legDur)} min` : `${Math.floor(legDur/60)}h ${Math.round(legDur%60)}m`;
      const legId = `jp-leg-${jIdx}-${li}`;
      const displayName = leg.groupName || leg.catName;
      const stopsText = leg.intermediateStops === 0 ? t('journey.no_intermediate') :
        leg.intermediateStops === 1 ? t('journey.intermediate_one') : `${leg.intermediateStops} intermediate stops`;

      // Board — skip for walk legs UNLESS it's the first leg (no previous alight to show origin)
      if (!leg.isWalk || li === 0) {
        html += `<div style="display:flex;align-items:start;gap:12px;position:relative">
          <div style="position:absolute;left:-20px;top:4px;width:12px;height:12px;border-radius:50%;background:${leg.isWalk ? 'var(--text-muted)' : (leg.lineColor || leg.catColor)};border:2px solid var(--bg-raised);z-index:1"></div>
          <div style="flex:1;display:flex;justify-content:space-between;align-items:baseline">
            <div><span class="mono" style="font-size:13px;color:var(--warn);margin-right:8px">${toTime(leg.boardTime)}</span><strong style="font-size:13px">${esc(leg.boardNodeName)}</strong></div>
            ${leg.boardPlatName ? `<span class="text-muted" style="font-size:12px">Plt. ${esc(leg.boardPlatName)}</span>` : ''}
          </div>
        </div>`;
      }

      // Walk legs render as a transfer block
      if (leg.isWalk) {
        const nextLeg = li < journey.legs.length - 1 ? journey.legs[li + 1] : null;
        const totalTransferTime = nextLeg ? Math.round(nextLeg.boardTime - leg.boardTime) : Math.round(leg.walkMins);
        const walkLabel = leg.interchangeType === 'isi' ? t('journey.transfer_within') : t('journey.walk_to_station');

        html += `<div style="padding:6px 0;position:relative">
          <div style="position:absolute;left:-15px;top:0;bottom:0;width:2px;background:var(--text-muted);border-left:2px dotted var(--text-muted);opacity:0.4"></div>
          <div style="margin-left:4px;font-size:11px;color:var(--text-muted)">
            ${walkLabel} · ${totalTransferTime} min transfer
          </div>
        </div>`;

        // Show alight if this is the last leg (no next service board to show destination)
        if (li === journey.legs.length - 1) {
          html += `<div style="display:flex;align-items:start;gap:12px;position:relative">
            <div style="position:absolute;left:-20px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--text-muted);border:2px solid var(--bg-raised);z-index:1"></div>
            <div style="flex:1;display:flex;justify-content:space-between;align-items:baseline">
              <div><span class="mono" style="font-size:13px;margin-right:8px">${toTime(leg.alightTime)}</span><strong style="font-size:13px">${esc(leg.alightNodeName)}</strong></div>
            </div>
          </div>`;
        }
        continue;
      }

      // Normal service leg rendering
      {
        // Service bar
        html += `<div style="position:relative;padding:6px 0">
          <div style="position:absolute;left:-15px;top:0;bottom:0;width:2px;background:${leg.lineColor || leg.catColor}"></div>
          <div style="margin-left:4px;cursor:pointer" onclick="document.getElementById('${legId}').style.display=document.getElementById('${legId}').style.display==='none'?'':'none'">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="chip" style="font-size:10px"><span class="dot" style="background:${leg.lineColor || leg.catColor}"></span>${esc(leg.catAbbr || leg.catName)}</span>
              <span style="font-size:12px">${t('journey.detail.towards', { line: esc(displayName), terminus: esc(leg.terminusName) })}</span>
            </div>
            <div class="text-muted" style="font-size:11px;margin-top:2px">${legDurStr} · ${stopsText} <span style="opacity:0.5">▾</span></div>
          </div>
          <div id="${legId}" style="display:none;margin-top:8px;padding:10px 12px;background:var(--bg);border-radius:var(--radius);border:1px solid var(--border);font-size:12px">
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin-bottom:8px">
              <span class="text-muted">${t('journey.detail.leg_service')}</span><span>${esc(leg.svcName)}</span>
              ${leg.stockName ? `<span class="text-muted">${t('journey.detail.leg_stock')}</span><span>${esc(leg.stockName)}</span>` : ''}
              ${leg.groupName ? `<span class="text-muted">${t('journey.detail.leg_line')}</span><span>${esc(leg.groupName)}</span>` : ''}
              <span class="text-muted">${t('journey.detail.leg_terminus')}</span><span>${esc(leg.terminusName)}</span>
            </div>
            ${leg.intermediateStops > 0 ? jpRenderIntermediateStops(leg) : ''}
          </div>
        </div>`;
      }

      // Alight
      html += `<div style="display:flex;align-items:start;gap:12px;position:relative">
        <div style="position:absolute;left:-20px;top:4px;width:12px;height:12px;border-radius:50%;background:${leg.lineColor || leg.catColor};border:2px solid var(--bg-raised);z-index:1"></div>
        <div style="flex:1;display:flex;justify-content:space-between;align-items:baseline">
          <div><span class="mono" style="font-size:13px;margin-right:8px">${toTime(leg.alightTime)}</span><strong style="font-size:13px">${esc(leg.alightNodeName)}</strong></div>
          ${leg.alightPlatName ? `<span class="text-muted" style="font-size:12px">Plt. ${esc(leg.alightPlatName)}</span>` : ''}
        </div>
      </div>`;

      // Transfer (between service legs, not before walk legs)
      if (li < journey.legs.length - 1) {
        const nextLeg = journey.legs[li + 1];
        if (nextLeg.isWalk) {
          // Walk leg follows — it will render its own transfer block
        } else {
          const waitTime = Math.round(nextLeg.boardTime - leg.alightTime);
          if (waitTime > 0) {
            html += `<div style="padding:8px 0;position:relative">
              <div style="position:absolute;left:-15px;top:0;bottom:0;width:2px;background:var(--border);border-left:2px dashed var(--text-muted);opacity:0.3"></div>
              <div style="margin-left:4px;font-size:11px;color:var(--text-muted)">${waitTime} min · ${t('journey.detail.transfer')}</div>
            </div>`;
          }
        }
      }
    }
    html += `</div>
      <div style="width:350px;flex-shrink:0">
        <div class="detail-map-tabs">
          <button class="${(data.settings?.defaultDetailMap||'geo')==='geo'?'active':''}" onclick="jpMapToggle(${jIdx},'geo')">Geomap</button>
          <button class="${data.settings?.defaultDetailMap==='beck'?'active':''}" onclick="jpMapToggle(${jIdx},'beck')">Railmap</button>
        </div>
        <div id="jp-map-${jIdx}" style="width:100%;height:322px;${(data.settings?.defaultDetailMap||'geo')==='geo'?'':'display:none;'}border-radius:0 0 var(--radius) var(--radius);overflow:hidden;border:1px solid var(--border);border-top:0;background:var(--bg)"></div>
        <svg id="jp-beck-${jIdx}" style="width:100%;height:322px;${data.settings?.defaultDetailMap==='beck'?'':'display:none;'}border-radius:0 0 var(--radius) var(--radius);border:1px solid var(--border);border-top:0;background:#fff"></svg>
      </div>
    </div></div>`;
  }

  html += `<div style="display:flex;justify-content:center;gap:8px;margin-top:12px">
    ${hasPrev ? `<button class="btn" onclick="jpPageEarlier()">${t('journey.earlier')}</button>` : ''}
    ${hasNext ? `<button class="btn" onclick="jpPageLater()">${t('journey.later')}</button>` : ''}
  </div>`;

  el.innerHTML = html;

  // Initialize maps for each visible journey
  setTimeout(() => {
    for (let ji = 0; ji < visible.length; ji++) {
      const jIdx = start + ji;
      const container = document.getElementById(`jp-map-${jIdx}`);
      if (container && !_jpMaps[jIdx]) {
        jpInitMap(jIdx, container);
      }
      // Render beckmap if it's the default view
      if (data.settings?.defaultDetailMap === 'beck' && !_jpBeckRendered[jIdx]) {
        jpRenderBeckMap(jIdx);
        _jpBeckRendered[jIdx] = true;
      }
    }
  }, 50);
}

function jpRenderIntermediateStops(leg) {
  if (!leg.dep || !leg.svc) return '';
  let html = '<div style="font-size:11px;color:var(--text-dim)">';
  for (let i = leg.boardIdx + 1; i < leg.alightIdx; i++) {
    const t = leg.dep.times[i];
    const node = getNode(t.nodeId);
    if (!node || !isPassengerStop(node)) continue;
    const stop = leg.svc.stops[i];
    if (stop?.passThrough) continue;
    html += `<div style="padding:2px 0"><span class="mono" style="margin-right:6px">${toTime(t.arrive)}</span>${esc(nodeDisplayName(t.nodeId))}</div>`;
  }
  html += '</div>';
  return html;
}

// ============================================================
// JOURNEY PLANNER MAP
// ============================================================
const _jpMaps = {}; // jIdx -> { map, layers, journey }
const _jpBeckRendered = {}; // jIdx -> true if beckmap already rendered

function jpMapToggle(jIdx, mode) {
  const geoEl = document.getElementById('jp-map-' + jIdx);
  const beckEl = document.getElementById('jp-beck-' + jIdx);
  if (!geoEl || !beckEl) return;
  geoEl.style.display = mode === 'geo' ? '' : 'none';
  beckEl.style.display = mode === 'beck' ? '' : 'none';
  // Update tab buttons
  const wrap = geoEl.parentElement;
  if (wrap) {
    const tabs = wrap.querySelector('.detail-map-tabs');
    if (tabs) { tabs.children[0].classList.toggle('active', mode === 'geo'); tabs.children[1].classList.toggle('active', mode === 'beck'); }
  }
  if (mode === 'geo' && _jpMaps[jIdx]?.map) setTimeout(() => { _jpMaps[jIdx].map.invalidateSize(); if (_jpMaps[jIdx].fitFn) _jpMaps[jIdx].fitFn(); }, 50);
  if (mode === 'beck' && !_jpBeckRendered[jIdx]) { jpRenderBeckMap(jIdx); _jpBeckRendered[jIdx] = true; }
}

function jpRenderBeckMap(jIdx) {
  const journey = window._jpAllJourneys?.[jIdx];
  if (!journey) return;
  const svgEl = document.getElementById('jp-beck-' + jIdx);
  if (!svgEl) return;

  // Collect focus groups and stop lists from journey legs
  const focusGroupIds = new Set();
  const focusNodeIds = new Set();
  const focusLabelNodeIds = new Set(); // only board/alight/transfer points get labels
  const svcStopsList = [];
  for (const leg of journey.legs) {
    focusLabelNodeIds.add(leg.boardNodeId);
    focusLabelNodeIds.add(leg.alightNodeId);
    focusNodeIds.add(leg.boardNodeId);
    focusNodeIds.add(leg.alightNodeId);
    if (leg.isWalk) continue;
    if (leg.svc?.groupId) focusGroupIds.add(leg.svc.groupId);
    if (leg.dep?.times && leg.boardIdx != null && leg.alightIdx != null) {
      const svc = leg.svc;
      const depTimes = leg.dep.times.slice(leg.boardIdx, leg.alightIdx + 1);
      // Build stops with passThrough info from the service definition
      const stops = depTimes.map(t => {
        const svcStop = svc?.stops?.find(st => st.nodeId === t.nodeId);
        return { nodeId: t.nodeId, passThrough: !!svcStop?.passThrough };
      });
      // Stopped-at stations get marks (skip pass-throughs)
      for (const st of stops) { if (!st.passThrough) focusNodeIds.add(st.nodeId); }
      svcStopsList.push({ groupId: svc?.groupId, stops });
    }
  }

  renderMiniBeck(svgEl, { focusGroupIds, focusNodeIds, focusLabelNodeIds, mode: 'service', svcStopsList });
}

function jpInitMap(jIdx, container) {
  const journey = window._jpAllJourneys?.[jIdx];
  if (!journey) return;

  const map = L.map(container, { zoomControl: true, attributionControl: false }).setView([0, 0], 3);
  if (data.settings?.jpMapTiles !== false) {
    L.tileLayer('https://tile.opengeofiction.net/ogf-carto/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);
  }

  const jpMapData = { map, layers: {}, journey };
  _jpMaps[jIdx] = jpMapData;

  // Defer rendering to let container get its dimensions
  setTimeout(() => { map.invalidateSize(); jpRenderMapRoute(jIdx); }, 100);
}

function jpBuildLegCoords(leg) {
  // Trace through dep.times from boardIdx to alightIdx using segment geometry
  const coords = [];
  if (leg.dep && leg.dep.times) {
    for (let i = leg.boardIdx; i <= leg.alightIdx; i++) {
      if (i > leg.boardIdx) {
        // Add segment geometry between consecutive stops
        const fromId = leg.dep.times[i - 1].nodeId;
        const toId = leg.dep.times[i].nodeId;
        const seg = findSeg(fromId, toId);
        if (seg) {
          const sc = segmentCoordsDirected(seg, fromId);
          // Skip first point (duplicate of previous endpoint)
          for (let j = (coords.length ? 1 : 0); j < sc.length; j++) coords.push(sc[j]);
          continue;
        }
      }
      // Fallback: just add node position
      const n = getNode(leg.dep.times[i].nodeId);
      if (n && n.lat != null && n.lon != null) coords.push([n.lat, n.lon]);
    }
  } else {
    // Walk leg — straight line between board and alight
    const bN = getNode(leg.boardNodeId), aN = getNode(leg.alightNodeId);
    if (bN?.lat != null) coords.push([bN.lat, bN.lon]);
    if (aN?.lat != null) coords.push([aN.lat, aN.lon]);
  }
  return coords;
}

function jpRenderMapRoute(jIdx) {
  const jpd = _jpMaps[jIdx]; if (!jpd) return;
  const { map, journey } = jpd;

  // Clear old layers
  Object.values(jpd.layers).forEach(l => map.removeLayer(l));
  jpd.layers = {};

  // Draw all non-interchange segments in black as network context
  const bgLines = [];
  for (const seg of data.segments) {
    if (isInterchange(seg)) continue;
    const coords = segmentCoords(seg);
    if (coords.length < 2) continue;
    bgLines.push(L.polyline(coords, { color: '#333', weight: 3, opacity: 1 }));
  }
  jpd.layers.bg = L.layerGroup(bgLines).addTo(map);

  // Draw journey legs in their line colors
  const legLines = [];
  for (let li = 0; li < journey.legs.length; li++) {
    const leg = journey.legs[li];
    const coords = jpBuildLegCoords(leg);
    if (coords.length < 2) continue;

    if (leg.isWalk) {
      legLines.push(L.polyline(coords, { color: '#000', weight: 5, opacity: 0.8, dashArray: '6,6' }));
      legLines.push(L.polyline(coords, { color: '#fff', weight: 5, opacity: 0.8, dashArray: '6,6', dashOffset: '6' }));
    } else {
      const color = leg.lineColor || leg.catColor || '#fff';
      legLines.push(L.polyline(coords, { color, weight: 6, opacity: 1 }));
    }
  }
  jpd.layers.legs = L.layerGroup(legLines).addTo(map);

  // Station dots and labels for board/alight points (on top of everything)
  const dots = [];
  const labels = [];
  const seenNodes = new Set();
  for (const leg of journey.legs) {
    if (leg.isWalk) continue;
    for (const nid of [leg.boardNodeId, leg.alightNodeId]) {
      if (seenNodes.has(nid)) continue;
      seenNodes.add(nid);
      const n = getNode(nid);
      if (!n || n.lat == null) continue;
      dots.push(L.circleMarker([n.lat, n.lon], { radius: 7, fillColor: '#fff', fillOpacity: 1, color: '#111', weight: 2.5 }));
      labels.push(L.marker([n.lat, n.lon], {
        icon: L.divIcon({
          className: 'map-station-label',
          html: `<span>${esc(nodeDisplayName(n.id))}</span>`,
          iconSize: null,
          iconAnchor: [-10, 6]
        }),
        interactive: false
      }));
    }
  }

  jpd.layers.dots = L.layerGroup(dots).addTo(map);
  jpd.layers.labels = L.layerGroup(labels).addTo(map);

  // Fit bounds + store for re-fit on toggle
  const allCoords = journey.legs.flatMap(l => jpBuildLegCoords(l)).filter(c => c && c.length === 2 && isFinite(c[0]) && isFinite(c[1]));
  const doFit = () => {
    map.invalidateSize();
    if (allCoords.length >= 2) {
      try { map.fitBounds(L.latLngBounds(allCoords), { padding: [30, 30] }); } catch(e) {}
    } else if (allCoords.length === 1) {
      map.setView(allCoords[0], 13);
    }
  };
  doFit();
  if (_jpMaps[jIdx]) _jpMaps[jIdx].fitFn = doFit;
}
