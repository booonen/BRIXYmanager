// ============================================================
// IMPORT ENGINE — CSV parsing, OGF relation import, fuzzy matching
// ============================================================

// ---- CSV Parser ----
function parseCSV(raw) {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return { delimiter: ',', rows: [] };
  // Auto-detect delimiter: count tabs vs commas in first line
  const tabCount = (lines[0].match(/\t/g) || []).length;
  const commaCount = (lines[0].match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';
  const rows = lines.map(line => _csvSplitLine(line, delimiter));
  return { delimiter, rows };
}

function _csvSplitLine(line, delim) {
  const fields = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { fields.push(current.trim()); current = ''; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ---- Fuzzy Node Matcher ----
function fuzzyMatchNode(name) {
  if (!name || !name.trim()) return [];
  const q = stripDiacritics(name.trim().toLowerCase());
  const results = [];
  for (const n of data.nodes) {
    const dn = nodeDisplayName(n.id);
    const dnNorm = stripDiacritics(dn.toLowerCase());
    const fullNorm = stripDiacritics(n.name.toLowerCase());
    if (fullNorm === q || dnNorm === q) {
      results.push({ node: n, score: 100, method: 'exact' });
    } else if (fullNorm.startsWith(q) || dnNorm.startsWith(q)) {
      results.push({ node: n, score: 75, method: 'prefix' });
    } else if (fullNorm.includes(q) || dnNorm.includes(q)) {
      results.push({ node: n, score: 50, method: 'substring' });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ---- OGF Node ID Matcher ----
function matchNodeByOgfId(rawInput) {
  if (!rawInput || !rawInput.trim()) return [];
  const ogfId = rawInput.trim().replace(/^node\s+/i, '');
  if (!/^\d+$/.test(ogfId)) return [];
  const matches = data.nodes.filter(n => String(n.ogfNode) === ogfId);
  return matches.map(n => ({ node: n, score: 100, method: 'ogf' }));
}

// ---- Polyline Similarity ----
// Compare two polylines by sampling points along one and snapping to the other.
// Returns average distance in km. Lower = more similar.
function polylineSimilarity(coordsA, coordsB) {
  if (!coordsA?.length || !coordsB?.length) return Infinity;
  const samples = Math.min(10, coordsA.length);
  const step = Math.max(1, Math.floor(coordsA.length / samples));
  let totalDist = 0, count = 0;
  for (let i = 0; i < coordsA.length; i += step) {
    const snap = _snapToPolyline(coordsA[i], coordsB);
    totalDist += snap.dist;
    count++;
  }
  return count > 0 ? totalDist / count : Infinity;
}

// ---- Cumulative Distance along a polyline ----
function _cumulativeDist(coords) {
  const d = [0];
  for (let i = 1; i < coords.length; i++) {
    d.push(d[i - 1] + _ptDist(coords[i - 1], coords[i]));
  }
  return d;
}

// ---- Bounding Box helpers ----
function _segBBox(coords, paddingDeg) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of coords) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  const p = paddingDeg || 0;
  return { minLat: minLat - p, maxLat: maxLat + p, minLon: minLon - p, maxLon: maxLon + p };
}

function _bboxOverlap(a, b) {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat &&
         a.minLon <= b.maxLon && a.maxLon >= b.minLon;
}

// ---- Partial Overlap Detection ----
// Finds how much of coordsA's track (in km) overlaps with coordsB,
// excluding graceKm from endpoints on both polylines.
// snapThresholdKm: max snap distance to count as "on the same track" (e.g. 0.05 = 50m).
// graceKm: distance from endpoints to exclude (e.g. 0.1 = 100m).
function findOverlapLength(coordsA, coordsB, snapThresholdKm, graceKm) {
  if (!coordsA || coordsA.length < 2 || !coordsB || coordsB.length < 2) return 0;

  const cumA = _cumulativeDist(coordsA);
  const cumB = _cumulativeDist(coordsB);
  const totalA = cumA[cumA.length - 1];
  const totalB = cumB[cumB.length - 1];

  // Skip if either segment is shorter than 2x grace (entirely within grace zone)
  if (totalA < graceKm * 2 || totalB < graceKm * 2) return 0;

  let overlapKm = 0;
  for (let i = 1; i < coordsA.length; i++) {
    const distFromStartA = cumA[i];
    const distFromEndA = totalA - distFromStartA;
    // Skip A's grace zones
    if (distFromStartA < graceKm || distFromEndA < graceKm) continue;

    const snap = _snapToPolyline(coordsA[i], coordsB);
    if (snap.dist >= snapThresholdKm) continue;

    // Check B's grace zone at the snap point
    const snapDistB = cumB[snap.edgeIdx] + snap.t * (cumB[snap.edgeIdx + 1] - cumB[snap.edgeIdx]);
    const distFromEndB = totalB - snapDistB;
    if (snapDistB < graceKm || distFromEndB < graceKm) continue;

    // This point is in overlap — add the step distance
    overlapKm += cumA[i] - cumA[i - 1];
  }

  return overlapKm;
}

// ---- Divergence Point Detection ----
// Given two segments sharing an endpoint, find where their parallel paths diverge.
// Tolerates initial divergence near the shared node (e.g. parallel roads leaving
// a station in slightly different directions before running side by side).
function findDivergencePoint(segA, segB, snapThresholdKm) {
  const sharedNode = segA.nodeA === segB.nodeA || segA.nodeA === segB.nodeB ? segA.nodeA
    : segA.nodeB === segB.nodeA || segA.nodeB === segB.nodeB ? segA.nodeB : null;
  if (!sharedNode) return null;

  // Orient both polylines so they start from the shared endpoint
  let geoA = [...segA.wayGeometry];
  let geoB = [...segB.wayGeometry];
  const sharedN = getNode(sharedNode);
  if (!sharedN || sharedN.lat == null) return null;

  if (segA.nodeB === sharedNode) geoA.reverse();
  if (segB.nodeB === sharedNode) geoB.reverse();

  // Walk along geoA, snap to geoB.
  // Allow initial divergence — paths may converge into parallel after the station.
  let lastSharedIdx = 0;
  let foundProximity = false;
  const cumA = _cumulativeDist(geoA);
  for (let i = 1; i < geoA.length; i++) {
    if (cumA[i] < 0.01) { lastSharedIdx = i; continue; }
    const snap = _snapToPolyline(geoA[i], geoB);
    if (snap.dist < snapThresholdKm) {
      lastSharedIdx = i;
      foundProximity = true;
    } else if (foundProximity) {
      break;
    }
  }

  if (!foundProximity) return null;

  const coord = geoA[lastSharedIdx];
  return {
    coord,
    sharedNode,
    distFromShared: cumA[lastSharedIdx],
    orientedA: geoA,
    orientedB: geoB
  };
}

// ---- Build Overlap Resolution Proposal ----
// Returns a proposal object describing what the fix will do.
function buildOverlapResolution(segA, segB, divergence) {
  const junctionCoord = divergence.coord;
  const sharedNode = divergence.sharedNode;

  // Snap the divergence point to both segments' wayGeometry to get split indices
  const snapA = _snapToPolyline(junctionCoord, segA.wayGeometry);
  const snapB = _snapToPolyline(junctionCoord, segB.wayGeometry);

  // Determine which endpoint is the shared one and which is the "far" one
  const farNodeA = segA.nodeA === sharedNode ? segA.nodeB : segA.nodeA;
  const farNodeB = segB.nodeA === sharedNode ? segB.nodeB : segB.nodeA;

  // Slice geometries
  const snapSharedA = _snapToPolyline(
    [getNode(sharedNode).lat, getNode(sharedNode).lon], segA.wayGeometry);
  const snapFarA = _snapToPolyline(
    [getNode(farNodeA).lat, getNode(farNodeA).lon], segA.wayGeometry);
  const snapSharedB = _snapToPolyline(
    [getNode(sharedNode).lat, getNode(sharedNode).lon], segB.wayGeometry);
  const snapFarB = _snapToPolyline(
    [getNode(farNodeB).lat, getNode(farNodeB).lon], segB.wayGeometry);

  // Shared portion: from shared endpoint to junction
  let sharedGeo = _slicePolyline(segA.wayGeometry, snapSharedA, snapA);
  // Orient shared→junction
  const dStart = _ptDist(sharedGeo[0], [getNode(sharedNode).lat, getNode(sharedNode).lon]);
  const dEnd = _ptDist(sharedGeo[sharedGeo.length - 1], [getNode(sharedNode).lat, getNode(sharedNode).lon]);
  if (dEnd < dStart) sharedGeo.reverse();

  // Remainder A: junction to far end of A
  let remainderA = _slicePolyline(segA.wayGeometry, snapA, snapFarA);
  const drA0 = _ptDist(remainderA[0], junctionCoord);
  const drAE = _ptDist(remainderA[remainderA.length - 1], junctionCoord);
  if (drAE < drA0) remainderA.reverse();

  // Remainder B: junction to far end of B
  let remainderB = _slicePolyline(segB.wayGeometry, snapB, snapFarB);
  const drB0 = _ptDist(remainderB[0], junctionCoord);
  const drBE = _ptDist(remainderB[remainderB.length - 1], junctionCoord);
  if (drBE < drB0) remainderB.reverse();

  // Find affected services (consecutive stops through either original segment's endpoints)
  const affectedServices = [];
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const a = svc.stops[i].nodeId, b = svc.stops[i + 1].nodeId;
      if ((a === sharedNode && b === farNodeA) || (b === sharedNode && a === farNodeA) ||
          (a === sharedNode && b === farNodeB) || (b === sharedNode && a === farNodeB)) {
        if (!affectedServices.includes(svc.id)) affectedServices.push(svc.id);
      }
    }
  }

  return {
    segA, segB, sharedNode, farNodeA, farNodeB,
    junctionCoord,
    sharedGeo,
    remainderA, remainderB,
    sharedDist: haversineDistance(sharedGeo),
    remainderADist: haversineDistance(remainderA),
    remainderBDist: haversineDistance(remainderB),
    affectedServices
  };
}

// ---- Apply Overlap Resolution ----
function applyOverlapResolution(proposal) {
  const { segA, segB, sharedNode, farNodeA, farNodeB, junctionCoord,
    sharedGeo, remainderA, remainderB, sharedDist, remainderADist, remainderBDist } = proposal;

  // 1. Create junction node at divergence point
  const sharedName = nodeName(sharedNode);
  const farAName = nodeName(farNodeA);
  const farBName = nodeName(farNodeB);
  const junctionName = `${sharedName} / ${farAName} / ${farBName} Jn`;
  const junction = {
    id: uid(), name: junctionName, type: 'junction', ogfNode: '',
    refCode: '', address: '', description: `Junction where ${sharedName}\u2014${farAName} and ${sharedName}\u2014${farBName} diverge`,
    platforms: [], lat: junctionCoord[0], lon: junctionCoord[1]
  };
  data.nodes.push(junction);

  // 2. Create shared segment (sharedNode → junction)
  const sharedIsRoad = isRoad(segA);
  const sharedSeg = {
    id: uid(), nodeA: sharedNode, nodeB: junction.id,
    tracks: sharedIsRoad ? [] : segA.tracks.map(t => ({ id: uid(), name: t.name })),
    maxSpeed: segA.maxSpeed, distance: Math.round(sharedDist * 100) / 100,
    electrification: sharedIsRoad ? false : segA.electrification, refCode: '', description: '',
    interchangeType: segA.interchangeType, ogfWayIds: [], wayGeometry: sharedGeo,
    allowedModes: [...(segA.allowedModes || []), ...(segB.allowedModes || [])]
      .filter((v, i, a) => a.indexOf(v) === i) // unique
  };
  // Anchor geometry endpoints
  sharedSeg.wayGeometry[0] = [getNode(sharedNode).lat, getNode(sharedNode).lon];
  sharedSeg.wayGeometry[sharedSeg.wayGeometry.length - 1] = [junction.lat, junction.lon];
  data.segments.push(sharedSeg);

  // 3. Modify segment A: becomes junction → farNodeA
  segA.nodeA = junction.id;
  segA.nodeB = farNodeA;
  segA.wayGeometry = remainderA;
  segA.wayGeometry[0] = [junction.lat, junction.lon];
  segA.wayGeometry[segA.wayGeometry.length - 1] = [getNode(farNodeA).lat, getNode(farNodeA).lon];
  segA.distance = Math.round(remainderADist * 100) / 100;

  // 4. Modify segment B: becomes junction → farNodeB
  segB.nodeA = junction.id;
  segB.nodeB = farNodeB;
  segB.wayGeometry = remainderB;
  segB.wayGeometry[0] = [junction.lat, junction.lon];
  segB.wayGeometry[segB.wayGeometry.length - 1] = [getNode(farNodeB).lat, getNode(farNodeB).lon];
  segB.distance = Math.round(remainderBDist * 100) / 100;

  // 5. Update services: insert junction as pass-through
  let servicesUpdated = 0;
  for (const svc of data.services) {
    let modified = false;
    for (let i = svc.stops.length - 2; i >= 0; i--) {
      const a = svc.stops[i].nodeId, b = svc.stops[i + 1].nodeId;
      const needsJunction =
        (a === sharedNode && (b === farNodeA || b === farNodeB)) ||
        (b === sharedNode && (a === farNodeA || a === farNodeB));
      if (needsJunction) {
        // Insert junction as pass-through after the shared endpoint
        const insertIdx = (a === sharedNode) ? i + 1 : i + 1;
        // Determine correct position: junction goes between shared node and far node
        const junctionStop = { nodeId: junction.id, platformId: null, dwell: 0, passThrough: true };
        if (a === sharedNode) {
          svc.stops.splice(i + 1, 0, junctionStop);
        } else {
          svc.stops.splice(i + 1, 0, junctionStop);
        }
        modified = true;
      }
    }
    if (modified) servicesUpdated++;
  }

  // 6. Mark both original segments as verified (suppress future overlap warnings)
  if (!data.settings.verifiedSegments) data.settings.verifiedSegments = [];
  // The original segment IDs are now the remainder segments — no need to verify

  save();
  return { junctionId: junction.id, sharedSegId: sharedSeg.id, servicesUpdated };
}

// ============================================================
// OGF RELATION IMPORT ENGINE
// ============================================================

async function fetchRelationFull(relationId) {
  // Use Overpass (same server the app already uses) to avoid CORS issues with the direct OSM API.
  // Query: get the relation body (member list), its way members with geometry, and stop nodes.
  // Use named set so node(r.rel) queries the relation, not the ways
  const query = `[out:json];relation(${relationId})->.rel;.rel out body;way(r.rel);out geom;node(r.rel);out;`;
  const resp = await fetch(OGF_OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();

  const elements = json.elements || [];

  // Find the relation element (has member list with roles)
  const rel = elements.find(e => e.type === 'relation');
  if (!rel) throw new Error('No relation found in response');

  // Build lookup of way and node elements
  const wayEls = {}, nodeEls = {};
  for (const e of elements) {
    if (e.type === 'way') wayEls[String(e.id)] = e;
    else if (e.type === 'node') nodeEls[String(e.id)] = e;
  }

  // Walk the relation member list to get ordered ways and stop nodes
  // Only keep ways with NO role — by convention, these are the track ways.
  // Ways with any role (stop, platform, etc.) are non-track members.
  const wayMembers = [], stopMembers = [];
  for (const m of (rel.members || [])) {
    const role = (m.role || '').trim();
    if (m.type === 'way' && !role) wayMembers.push(String(m.ref));
    else if (m.type === 'node' && (role === 'stop' || role === 'stop_entry_only' || role === 'stop_exit_only')) {
      stopMembers.push({ ref: String(m.ref), role });
    }
  }

  // Resolve ways: keep only those tagged railway=* or highway=*
  const ways = [];
  for (const wayId of wayMembers) {
    const w = wayEls[wayId];
    if (!w) continue;
    const tags = w.tags || {};
    if (!tags.railway && !tags.highway) continue;
    const coords = (w.geometry || []).map(p => [
      Math.round(p.lat * 1e5) / 1e5,
      Math.round(p.lon * 1e5) / 1e5
    ]);
    if (coords.length >= 2) ways.push({ id: wayId, coords, tags });
  }

  // Resolve stop nodes
  const stops = [];
  const seenStopIds = new Set();
  for (const sm of stopMembers) {
    const n = nodeEls[sm.ref];
    if (!n || n.lat == null) continue;
    if (seenStopIds.has(sm.ref)) continue;
    seenStopIds.add(sm.ref);
    const tags = n.tags || {};
    stops.push({
      ogfId: sm.ref, lat: n.lat, lon: n.lon, role: sm.role,
      tags, name: tags.name || '', ref: tags.ref || ''
    });
  }

  const relTags = rel.tags || {};
  const warnings = [];
  if (stopMembers.length !== seenStopIds.size) {
    warnings.push({ type: 'duplicate_stops', message: 'Duplicate stop IDs detected \u2014 likely a bidirectional relation.' });
  }

  return { ways, stops, warnings, relName: relTags.name || `Relation ${relationId}` };
}

function processRelationImport(config, rawData) {
  const { ways, stops, warnings: fetchWarnings } = rawData;
  const warnings = [...fetchWarnings];

  // 1. Stitch ways into a single polyline using a cache-based approach
  const wayCache = {};
  for (const w of ways) {
    wayCache[w.id] = { coords: w.coords, tags: w.tags };
  }
  const stitchResult = stitchWayGeometry(ways.map(w => w.id), wayCache);
  if (!stitchResult?.coords?.length) {
    return { stations: [], segments: [], warnings: [{ type: 'no_geometry', message: 'No geometry could be stitched from the relation ways.' }] };
  }
  const polyline = stitchResult.coords;
  if (stitchResult.gaps?.length) {
    for (const g of stitchResult.gaps) {
      const loc = g.lat != null ? ` near ${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}` : '';
      warnings.push({ type: 'stitch_gap', message: `${g.distM}m gap between ways${loc} \u2014 check way coverage.` });
    }
  }

  // 2. Create station objects + snap to polyline
  const stations = [];
  for (const stop of stops) {
    const snapResult = _snapToPolyline([stop.lat, stop.lon], polyline);

    // Detect type from railway tag
    const railwayTag = stop.tags.railway || '';
    let nodeType = 'station';
    if (railwayTag === 'halt' || railwayTag === 'tram_stop') nodeType = 'station';
    else if (stop.tags.highway === 'bus_stop') nodeType = 'bus_stop';

    let name = stop.name;

    const platforms = [];
    if (nodeType !== 'bus_stop') {
      for (let i = 1; i <= config.defaultPlatformCount; i++) platforms.push({ id: uid(), name: `Platform ${i}` });
    }

    if (snapResult.dist > 0.05) {
      warnings.push({ type: 'snap_distance', message: `"${name || stop.ogfId}" is ${Math.round(snapResult.dist * 1000)}m from the nearest way.`, ogfId: stop.ogfId });
    }

    // Check for existing node with same OGF ID
    let dupType = null, dupExistingName = '', existingId = null;
    const existingNode = data.nodes.find(n => String(n.ogfNode) === stop.ogfId);
    if (existingNode) {
      dupType = 'ogf'; dupExistingName = existingNode.name || existingNode.id;
      existingId = existingNode.id;
    } else if (stations.some(s => s.ogfNode === stop.ogfId)) {
      dupType = 'batch'; dupExistingName = stations.find(s => s.ogfNode === stop.ogfId)?.name || '';
    }

    stations.push({
      id: uid(), name: name || '', type: nodeType, ogfNode: stop.ogfId,
      refCode: stop.ref, address: '', description: '', platforms,
      lat: stop.lat, lon: stop.lon,
      _snap: snapResult,
      _include: !existingId, // skip by default if existing node found
      _dupType: dupType, _dupExistingName: dupExistingName,
      _existingId: existingId // existing model node ID to use for segments
    });
  }

  // 3. Sort stations by snap position along the polyline
  stations.sort((a, b) => {
    if (a._snap.edgeIdx !== b._snap.edgeIdx) return a._snap.edgeIdx - b._snap.edgeIdx;
    return a._snap.t - b._snap.t;
  });

  // 4. Generate segments between consecutive station pairs
  const segments = [];
  // Build maps for maxspeed, infrastructure type, and way ID lookup per polyline edge
  const waySpeedMap = _buildWaySpeedMap(ways, polyline);
  const wayInfraMap = _buildWayInfraMap(ways, polyline);
  const wayIdMap = _buildWayIdMap(ways, polyline);

  for (let i = 0; i < stations.length - 1; i++) {
    const stA = stations[i], stB = stations[i + 1];
    let coords = _slicePolyline(polyline, stA._snap, stB._snap);
    // Orient A→B
    const d0A = _ptDist(coords[0], [stA.lat, stA.lon]);
    const d0B = _ptDist(coords[0], [stB.lat, stB.lon]);
    if (d0B < d0A) coords.reverse();

    // Track distance from trimmed geometry
    const distance = haversineDistance(coords);

    // Anchor endpoints to station positions
    coords[0] = [stA.lat, stA.lon];
    coords[coords.length - 1] = [stB.lat, stB.lon];

    // Resolve maxspeed, infrastructure type and OGF way IDs from underlying ways
    const minEdge = Math.min(stA._snap.edgeIdx, stB._snap.edgeIdx);
    const maxEdge = Math.max(stA._snap.edgeIdx, stB._snap.edgeIdx);
    const midEdge = Math.floor((stA._snap.edgeIdx + stB._snap.edgeIdx) / 2);
    const waySpeed = waySpeedMap[midEdge];
    const maxSpeed = waySpeed > 0 ? waySpeed : config.defaultMaxSpeed;
    const segInfra = wayInfraMap[midEdge] || 'rail';
    const isRoadSeg = segInfra === 'road';
    const segWayIdSet = new Set();
    for (let e = minEdge; e <= maxEdge; e++) {
      const wids = wayIdMap[e];
      if (wids) for (const wid of wids) segWayIdSet.add(wid);
    }
    const ogfWayIds = [...segWayIdSet].map(id => parseInt(id)).filter(n => n > 0);

    const tracks = [];
    if (!isRoadSeg) {
      for (let tk = 1; tk <= config.defaultTrackCount; tk++) tracks.push({ id: uid(), name: `Track ${tk}` });
    }

    // Use existing node IDs for duplicates, new IDs for fresh stations
    const nodeAId = stA._existingId || stA.id;
    const nodeBId = stB._existingId || stB.id;

    // Dedup against existing segments using resolved IDs
    let dupType = null;
    const existingDup = data.segments.some(seg =>
      !isInterchange(seg) && (
        (seg.nodeA === nodeAId && seg.nodeB === nodeBId) ||
        (seg.nodeA === nodeBId && seg.nodeB === nodeAId)
      )
    );
    if (existingDup) dupType = 'pair';

    segments.push({
      id: uid(), nodeA: nodeAId, nodeB: nodeBId,
      tracks, maxSpeed, distance: Math.round(distance * 100) / 100,
      electrification: isRoadSeg ? false : true, refCode: '', description: '',
      interchangeType: isRoadSeg ? 'road' : null, ogfWayIds, wayGeometry: coords,
      allowedModes: [...config.allowedModes],
      _include: !dupType, // skip by default if duplicate found
      _dupType: dupType
    });
  }

  // 5. Maxspeed waypoint insertion (if enabled)
  if (config.maxspeedBoundary === 'waypoints') {
    _insertSpeedWaypoints(stations, segments, ways, polyline, waySpeedMap, wayInfraMap, wayIdMap, config);
  }

  return { stations, segments, warnings };
}

function _buildWaySpeedMap(ways, polyline) {
  // Map each edge of the polyline to a maxspeed value from the nearest way
  const speedMap = {};
  for (const w of ways) {
    const ms = _parseMaxspeed(w.tags.maxspeed);
    if (ms <= 0) continue;
    // Find which polyline edges this way covers by matching start/end coords
    const wFirst = w.coords[0], wLast = w.coords[w.coords.length - 1];
    for (let e = 0; e < polyline.length - 1; e++) {
      const p = polyline[e];
      if ((Math.abs(p[0] - wFirst[0]) < 0.0001 && Math.abs(p[1] - wFirst[1]) < 0.0001) ||
          (Math.abs(p[0] - wLast[0]) < 0.0001 && Math.abs(p[1] - wLast[1]) < 0.0001)) {
        // Tag edges near this way's endpoints
        for (let j = Math.max(0, e - w.coords.length); j <= Math.min(polyline.length - 2, e + w.coords.length); j++) {
          if (!speedMap[j]) speedMap[j] = ms;
        }
        break;
      }
    }
  }
  return speedMap;
}

function _buildWayInfraMap(ways, polyline) {
  // Map each edge of the polyline to an infrastructure type ('rail' or 'road')
  const infraMap = {};
  for (const w of ways) {
    const infra = w.tags.railway ? 'rail' : (w.tags.highway ? 'road' : null);
    if (!infra) continue;
    const wFirst = w.coords[0], wLast = w.coords[w.coords.length - 1];
    for (let e = 0; e < polyline.length - 1; e++) {
      const p = polyline[e];
      if ((Math.abs(p[0] - wFirst[0]) < 0.0001 && Math.abs(p[1] - wFirst[1]) < 0.0001) ||
          (Math.abs(p[0] - wLast[0]) < 0.0001 && Math.abs(p[1] - wLast[1]) < 0.0001)) {
        for (let j = Math.max(0, e - w.coords.length); j <= Math.min(polyline.length - 2, e + w.coords.length); j++) {
          if (!infraMap[j]) infraMap[j] = infra;
        }
        break;
      }
    }
  }
  return infraMap;
}

function _buildWayIdMap(ways, polyline) {
  // Map each edge of the polyline to the OGF way IDs that cover it
  const idMap = {};
  for (const w of ways) {
    const wFirst = w.coords[0], wLast = w.coords[w.coords.length - 1];
    for (let e = 0; e < polyline.length - 1; e++) {
      const p = polyline[e];
      if ((Math.abs(p[0] - wFirst[0]) < 0.0001 && Math.abs(p[1] - wFirst[1]) < 0.0001) ||
          (Math.abs(p[0] - wLast[0]) < 0.0001 && Math.abs(p[1] - wLast[1]) < 0.0001)) {
        for (let j = Math.max(0, e - w.coords.length); j <= Math.min(polyline.length - 2, e + w.coords.length); j++) {
          if (!idMap[j]) idMap[j] = [];
          if (!idMap[j].includes(w.id)) idMap[j].push(w.id);
        }
        break;
      }
    }
  }
  return idMap;
}

function _parseMaxspeed(val) {
  if (!val) return 0;
  const mph = val.match(/^(\d+)\s*mph$/i);
  if (mph) return Math.round(parseInt(mph[1]) * 1.60934);
  const num = parseInt(val);
  return num > 0 ? num : 0;
}

function _insertSpeedWaypoints(stations, segments, ways, polyline, waySpeedMap, wayInfraMap, wayIdMap, config) {
  // Find edges where speed changes and insert waypoints
  const speedChanges = [];
  let prevSpeed = 0;
  for (let e = 0; e < polyline.length - 1; e++) {
    const speed = waySpeedMap[e] || config.defaultMaxSpeed;
    if (prevSpeed > 0 && speed !== prevSpeed) {
      speedChanges.push({ edgeIdx: e, fromSpeed: prevSpeed, toSpeed: speed, coord: polyline[e] });
    }
    prevSpeed = speed;
  }
  if (!speedChanges.length) return;

  // Process segments in reverse to avoid index shifting issues
  for (let si = segments.length - 1; si >= 0; si--) {
    const seg = segments[si];
    const stA = stations.find(s => s.id === seg.nodeA);
    const stB = stations.find(s => s.id === seg.nodeB);
    if (!stA || !stB) continue;

    const minEdge = Math.min(stA._snap.edgeIdx, stB._snap.edgeIdx);
    const maxEdge = Math.max(stA._snap.edgeIdx, stB._snap.edgeIdx);

    // Find speed changes within this segment's edge range
    const changesInSeg = speedChanges.filter(sc => sc.edgeIdx > minEdge && sc.edgeIdx < maxEdge);
    if (!changesInSeg.length) continue;

    // Insert waypoints at each speed change
    let prevNodeId = seg.nodeA;
    const newSegs = [];
    const allPoints = [stA, ...changesInSeg.map((sc, idx) => {
      const wpName = `WP-${stA.name || 'seg'}-${stB.name || 'seg'}-${idx + 1}`;
      const wp = {
        id: uid(), name: wpName, type: 'waypoint', ogfNode: '',
        refCode: '', address: '',
        description: `Speed change: ${sc.fromSpeed} → ${sc.toSpeed} km/h`,
        platforms: [], lat: sc.coord[0], lon: sc.coord[1],
        _snap: { edgeIdx: sc.edgeIdx, t: 0, dist: 0, point: sc.coord },
        _include: true, _dupType: null, _dupExistingName: '',
        _isWaypoint: true
      };
      stations.push(wp);
      return wp;
    }), stB];

    // Remove the original segment and create sub-segments
    segments.splice(si, 1);
    for (let j = 0; j < allPoints.length - 1; j++) {
      const pA = allPoints[j], pB = allPoints[j + 1];
      let coords = _slicePolyline(polyline, pA._snap, pB._snap);
      const d0A = _ptDist(coords[0], [pA.lat, pA.lon]);
      const d0B = _ptDist(coords[0], [pB.lat, pB.lon]);
      if (d0B < d0A) coords.reverse();
      const dist = haversineDistance(coords);
      coords[0] = [pA.lat, pA.lon];
      coords[coords.length - 1] = [pB.lat, pB.lon];

      const subMinEdge = Math.min(pA._snap.edgeIdx, pB._snap.edgeIdx);
      const subMaxEdge = Math.max(pA._snap.edgeIdx, pB._snap.edgeIdx);
      const midEdge = Math.floor((pA._snap.edgeIdx + pB._snap.edgeIdx) / 2);
      const speed = waySpeedMap[midEdge] || config.defaultMaxSpeed;
      const subInfra = wayInfraMap[midEdge] || 'rail';
      const subIsRoad = subInfra === 'road';
      const subWayIdSet = new Set();
      for (let e = subMinEdge; e <= subMaxEdge; e++) {
        const wids = wayIdMap[e];
        if (wids) for (const wid of wids) subWayIdSet.add(wid);
      }
      const subOgfWayIds = [...subWayIdSet].map(id => parseInt(id)).filter(n => n > 0);

      const tracks = [];
      if (!subIsRoad) {
        for (let tk = 1; tk <= config.defaultTrackCount; tk++) tracks.push({ id: uid(), name: `Track ${tk}` });
      }

      segments.splice(si + j, 0, {
        id: uid(), nodeA: pA.id, nodeB: pB.id,
        tracks, maxSpeed: speed, distance: Math.round(dist * 100) / 100,
        electrification: subIsRoad ? false : true, refCode: '', description: '',
        interchangeType: subIsRoad ? 'road' : null, ogfWayIds: subOgfWayIds, wayGeometry: coords,
        allowedModes: [...config.allowedModes],
        _include: true, _dupType: null
      });
    }
  }
}
