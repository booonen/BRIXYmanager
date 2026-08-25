// ============================================================
// BECKMAP CLASSIC — the original vision, fourth attempt
// ============================================================
// Shared-geometry corridors with automatic parallel-line fanning.
// Architecture (see BECKMAP_POSTMORTEM.md — this is the v1.5 retry with
// the missing insight):
//
//   A line set only ever changes AT A NODE — a station or a branching
//   junction — never mid-segment. So edges are atomic between "layout
//   nodes" (walking through waypoints, pass-through junctions, and
//   non-diverging unplaced stops), and every edge has a CONSTANT line
//   set along its entire length. Offsetting a constant-set polyline is
//   robust: no sections, no carry-forward, no renormalisation. All the
//   v1 killers (peel, 2+1, forks) become NODE-LOCAL connector geometry
//   — short strand-to-strand joins inside the station zone, which is
//   exactly what blobs exist to cover.
//
//   Tucking (§3.1) dies as a discrete graph pass: per-edge line orders
//   are propagated through corridors by BFS (orientation propagation),
//   never re-derived from traversal geometry.
//
// Layout is a pure data pass (postmortem §8.1); the renderer is a dumb
// consumer. The layout object is inspectable and the debug overlay is
// just another renderer for it (§8.9).
//
// Data lives in data.beckmapClassic — v3's data.beckmap is untouched,
// both maps coexist behind the Railmap style toggle.

const BMC_CELL = 24;
const BMC_LINEW = 5;
const BMC_GAP = 7;          // strand-to-strand spacing (perpendicular)
const BMC_CORNER = 11;      // corner rounding radius

const _bmcState = {
  active: false,
  initialized: false,
  viewX: 60, viewY: 60, zoom: 1,
  panning: null,            // {startX, startY, vx, vy}
  nodeDrag: null,           // {nodeId, gx, gy}
  sidebarDrag: null,        // {nodeId, ghostEl}
  debug: false,
  layout: null,             // cached layout
  hover: null,
};

function bmcData() {
  if (!data.beckmapClassic) data.beckmapClassic = {};
  const d = data.beckmapClassic;
  if (!d.stations) d.stations = {};     // { nodeId: {gx, gy} }
  if (!d.guides) d.guides = {};         // { edgeKey: [{gx,gy},...] }
  if (!d.lineOrder) d.lineOrder = {};   // { edgeKey: [groupId,...] }
  if (!d.labelDir) d.labelDir = {};     // { nodeId: 0..7 | 'auto' }
  return d;
}

// ------------------------------------------------------------
// Topology: physical graph restricted to line-carrying segments
// ------------------------------------------------------------

function _bmcLineSegSets() {
  // groupId -> Set(segId), and segId -> Set(groupId)
  const byLine = new Map(), bySeg = new Map();
  for (const g of data.serviceGroups) {
    const segs = lineSegments(g.id);
    byLine.set(g.id, segs);
    for (const sid of segs) {
      if (!bySeg.has(sid)) bySeg.set(sid, new Set());
      bySeg.get(sid).add(g.id);
    }
  }
  return { byLine, bySeg };
}

function _bmcSetKey(set) { return [...set].sort().join(','); }

// A line "stops" at a node if any of its services has a real (non-pass-through) stop there.
function _bmcStopMap() {
  const stops = new Map(); // groupId -> Set(nodeId)
  for (const svc of data.services) {
    if (!svc.groupId) continue;
    if (!stops.has(svc.groupId)) stops.set(svc.groupId, new Set());
    const set = stops.get(svc.groupId);
    for (const st of svc.stops) if (!st.passThrough) set.add(st.nodeId);
  }
  return stops;
}

// ------------------------------------------------------------
// Layout graph: nodes + constant-set edges
// ------------------------------------------------------------

function bmcComputeLayout() {
  const d = bmcData();
  const { bySeg } = _bmcLineSegSets();
  const stopMap = _bmcStopMap();

  // Adjacency over line-carrying, non-interchange segments
  const adj = new Map(); // nodeId -> [{segId, other, lines:Set}]
  for (const seg of data.segments) {
    if (isInterchange(seg)) continue;
    const lines = bySeg.get(seg.id);
    if (!lines || !lines.size) continue;
    if (!adj.has(seg.nodeA)) adj.set(seg.nodeA, []);
    if (!adj.has(seg.nodeB)) adj.set(seg.nodeB, []);
    adj.get(seg.nodeA).push({ segId: seg.id, other: seg.nodeB, lines });
    adj.get(seg.nodeB).push({ segId: seg.id, other: seg.nodeA, lines });
  }

  // Layout nodes: placed stations, or any point where the corridor
  // topology changes (degree != 2, or the line set differs between the
  // two sides). Everything else is walked through.
  const isLayoutNode = (nid) => {
    if (d.stations[nid]) return true;
    const a = adj.get(nid) || [];
    if (a.length !== 2) return true;
    return _bmcSetKey(a[0].lines) !== _bmcSetKey(a[1].lines);
  };

  // Walk out edges from every layout node
  const edges = [];
  const seen = new Set();
  for (const [nid, list] of adj) {
    if (!isLayoutNode(nid)) continue;
    for (const start of list) {
      let prevSeg = start.segId, cur = start.other;
      const path = [start.segId];
      let lines = new Set(start.lines);
      let guard = 0;
      while (!isLayoutNode(cur) && guard++ < 2000) {
        const nxt = (adj.get(cur) || []).find(x => x.segId !== prevSeg);
        if (!nxt) break;
        path.push(nxt.segId);
        for (const g of [...lines]) if (!nxt.lines.has(g)) lines.delete(g);
        prevSeg = nxt.segId; cur = nxt.other;
      }
      if (cur === nid && path.length < 2) continue; // degenerate self loop
      if (!lines.size) continue;
      const key = [nid, cur].sort().join('~') + '~' + [...path].sort().join('.');
      if (seen.has(key)) continue;
      seen.add(key);
      // canonical endpoints: a = smaller id
      const [a, b] = nid <= cur ? [nid, cur] : [cur, nid];
      edges.push({ key, a, b, path, lines, orderedLines: null, cells: null, pts: null, strands: null });
    }
  }

  // Node index
  const nodeIds = new Set();
  for (const e of edges) { nodeIds.add(e.a); nodeIds.add(e.b); }
  const nodes = new Map();
  for (const nid of nodeIds) {
    nodes.set(nid, {
      id: nid,
      node: getNode(nid),
      placed: !!d.stations[nid],
      pos: d.stations[nid] ? { gx: d.stations[nid].gx, gy: d.stations[nid].gy } : null,
      edges: [],
    });
  }
  for (const e of edges) { nodes.get(e.a).edges.push(e); nodes.get(e.b).edges.push(e); }

  // Auto-position unplaced layout nodes (forks, diverging unplaced stops):
  // relax toward the mean of positioned neighbours, then grid-snap.
  for (let iter = 0; iter < 24; iter++) {
    let moved = false;
    for (const n of nodes.values()) {
      if (n.placed || n.pos) continue;
      const neigh = n.edges.map(e => nodes.get(e.a === n.id ? e.b : e.a)).filter(m => m.pos);
      if (neigh.length < 1) continue;
      const mx = neigh.reduce((s, m) => s + m.pos.gx, 0) / neigh.length;
      const my = neigh.reduce((s, m) => s + m.pos.gy, 0) / neigh.length;
      n.pos = { gx: mx, gy: my, auto: true };
      moved = true;
    }
    if (!moved) break;
  }
  for (const n of nodes.values()) {
    if (n.pos && n.pos.auto) {
      n.pos.gx = Math.round(n.pos.gx); n.pos.gy = Math.round(n.pos.gy);
      // avoid landing exactly on a neighbour
      const clash = () => n.edges.some(e => {
        const m = nodes.get(e.a === n.id ? e.b : e.a);
        return m.pos && !m.pos.auto && m.pos.gx === n.pos.gx && m.pos.gy === n.pos.gy;
      });
      if (clash()) n.pos.gx += 1;
      if (clash()) n.pos.gy += 1;
    }
  }

  // Drop edges without two positioned endpoints
  const live = edges.filter(e => nodes.get(e.a).pos && nodes.get(e.b).pos);

  // ---- Ordered lines per edge: identity-stable base + orientation propagation ----
  const globalIdx = new Map(data.serviceGroups.map((g, i) => [g.id, i]));
  const baseOrder = (e) => {
    const ov = d.lineOrder[e.key];
    const arr = [...e.lines];
    if (ov) {
      const pos = new Map(ov.map((g, i) => [g, i]));
      arr.sort((x, y) => (pos.has(x) ? pos.get(x) : 99 + globalIdx.get(x)) - (pos.has(y) ? pos.get(y) : 99 + globalIdx.get(y)));
    } else {
      arr.sort((x, y) => (globalIdx.get(x) ?? 0) - (globalIdx.get(y) ?? 0));
    }
    return arr;
  };

  // Through-pairs: at ANY node, two incident edges carrying the identical
  // line set act as a continuing corridor — pair them for propagation.
  // (Covers plain through-stations AND corridors passing through
  // interchanges, which is what caused v1's crossings at big stations.)
  const throughPairs = (n) => {
    const groups = new Map();
    const nodeEdges = n.edges.filter(e => live.includes(e));
    for (const e of nodeEdges) {
      const k = _bmcSetKey(e.lines);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    const pairs = [];
    for (const arr of groups.values()) if (arr.length === 2) pairs.push(arr);
    return pairs;
  };

  // Direction of an edge's first route step away from a node (for fork ordering)
  const posOf = (nid) => nodes.get(nid).pos;
  const edgeDirFrom = (e, nid) => {
    // approximate with straight direction toward the other endpoint
    const p1 = posOf(nid), p2 = posOf(e.a === nid ? e.b : e.a);
    if (!p1 || !p2) return null;
    const dx = p2.gx - p1.gx, dy = p2.gy - p1.gy;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / l, y: dy / l };
  };

  // Fork angular seeding: at nodes where an edge's lines fan out to
  // different continuation edges, order the lines by the angle of their
  // continuation so the fan never self-crosses.
  const visited = new Set();
  const seedQueue = [];
  for (const n of nodes.values()) {
    const nodeEdges = n.edges.filter(e => live.includes(e));
    if (nodeEdges.length < 3) continue;
    for (const e of nodeEdges) {
      if (e.orderedLines || e.lines.size < 2) continue;
      // continuation angle per line
      const arrive = edgeDirFrom(e, n.id); // direction from n toward e's far end = REVERSE of travel into n
      if (!arrive) continue;
      const into = { x: -arrive.x, y: -arrive.y }; // travelling into n
      const conts = new Map();
      let distinct = new Set();
      for (const g of e.lines) {
        const e2 = nodeEdges.find(x => x !== e && x.lines.has(g));
        if (!e2) { conts.set(g, null); continue; }
        const w = edgeDirFrom(e2, n.id);
        if (!w) { conts.set(g, null); continue; }
        // signed angle of continuation relative to travel direction:
        // positive cross = right of travel in screen coords (y down)
        const ang = Math.atan2(into.x * w.y - into.y * w.x, into.x * w.x + into.y * w.y);
        conts.set(g, ang);
        distinct.add(e2.key);
      }
      if (distinct.size < 2) continue; // no real fan-out through this edge
      const arr = [...e.lines];
      arr.sort((x, y) => {
        const ax = conts.get(x), ay = conts.get(y);
        if (ax == null && ay == null) return (globalIdx.get(x) ?? 0) - (globalIdx.get(y) ?? 0);
        if (ax == null) return 0;
        if (ay == null) return 0;
        return ax - ay; // most-left continuation first
      });
      // arr is left-to-right in the frame travelling INTO n.
      // Convert to the edge's canonical a→b frame:
      e.orderedLines = (e.b === n.id) ? arr : [...arr].reverse();
      visited.add(e.key);
      seedQueue.push(e);
    }
  }

  // BFS orientation propagation from the seeds (then any unvisited edges).
  // orderedLines is expressed in the edge's canonical travel frame
  // (a → b, left-to-right).
  const propagate = (root) => {
    const queue = [root];
    while (queue.length) {
      const e1 = queue.shift();
      for (const endNode of [e1.a, e1.b]) {
        const n = nodes.get(endNode);
        for (const pair of throughPairs(n)) {
          if (pair[0].key !== e1.key && pair[1].key !== e1.key) continue;
          const e2 = pair[0].key === e1.key ? pair[1] : pair[0];
          if (!e2 || visited.has(e2.key)) continue;
          const arrOrder = (e1.b === endNode) ? e1.orderedLines : [...e1.orderedLines].reverse();
          e2.orderedLines = (e2.a === endNode) ? arrOrder.filter(g => e2.lines.has(g))
                                               : [...arrOrder].reverse().filter(g => e2.lines.has(g));
          visited.add(e2.key);
          queue.push(e2);
        }
      }
    }
  };
  for (const s of seedQueue) propagate(s);
  for (const root of live) {
    if (visited.has(root.key)) continue;
    root.orderedLines = baseOrder(root);
    visited.add(root.key);
    propagate(root);
  }
  for (const e of live) if (!e.orderedLines) e.orderedLines = baseOrder(e);

  // ---- Geometry: route cells, pixel paths, strand polylines ----
  for (const e of live) {
    const pa = nodes.get(e.a).pos, pb = nodes.get(e.b).pos;
    const guides = d.guides[e.key] || [];
    // Bend near the quieter endpoint: if b is busier than a, route the
    // leg REVERSED (diag-first from b) so the straight tail lands at b's
    // side and the bend sits near a.
    const degA = nodes.get(e.a).edges.length, degB = nodes.get(e.b).edges.length;
    let cells = [];
    let from = { gx: pa.gx, gy: pa.gy };
    const targets = [...guides, { gx: pb.gx, gy: pb.gy }];
    const lastIdx = targets.length - 1;
    targets.forEach((tgt, ti) => {
      let leg;
      const flipBend = (ti === lastIdx && !guides.length && degB > degA);
      if (flipBend) {
        leg = bmcRouteLeg(tgt.gx, tgt.gy, from.gx, from.gy).reverse();
      } else {
        leg = bmcRouteLeg(from.gx, from.gy, tgt.gx, tgt.gy);
      }
      if (cells.length) leg.shift();
      cells = cells.concat(leg);
      from = tgt;
    });
    // collapse collinear runs into bend-only points
    e.cells = cells;
    e.pts = _bmcCompressPts(cells.map(c => ({ x: c.gx * BMC_CELL, y: c.gy * BMC_CELL })));
    // strands
    const k = e.orderedLines.length;
    e.strands = {};
    e.orderedLines.forEach((gid, i) => {
      const off = (i - (k - 1) / 2) * BMC_GAP;
      e.strands[gid] = _bmcOffsetPolyline(e.pts, off);
    });
  }

  // ---- Node info: strand endpoints, connectors, marks ----
  const nodeInfos = new Map();
  for (const n of nodes.values()) {
    if (!n.pos) continue;
    const liveEdges = n.edges.filter(e => live.includes(e));
    if (!liveEdges.length) continue;
    const info = { id: n.id, node: n.node, pos: n.pos, placed: n.placed, edges: liveEdges, ends: new Map(), connectors: [] };
    // strand endpoints at this node, per edge per line
    for (const e of liveEdges) {
      const atA = e.a === n.id;
      for (const gid of e.orderedLines) {
        const s = e.strands[gid];
        const P = atA ? s[0] : s[s.length - 1];
        const Q = atA ? s[1] : s[s.length - 2]; // next point inward
        info.ends.set(e.key + '|' + gid, { P, Q, edge: e, gid });
      }
    }
    nodeInfos.set(n.id, info);
  }

  // connectors: for each line at each node, join its strand endpoints
  for (const info of nodeInfos.values()) {
    const byLine = new Map();
    for (const end of info.ends.values()) {
      if (!byLine.has(end.gid)) byLine.set(end.gid, []);
      byLine.get(end.gid).push(end);
    }
    for (const [gid, ends] of byLine) {
      if (ends.length < 2) continue;
      // pair greedily by nearest endpoints (a line rarely has >2 here)
      const pool = [...ends];
      while (pool.length >= 2) {
        const e1 = pool.shift();
        let bi = 0, bd = Infinity;
        for (let i = 0; i < pool.length; i++) {
          const dd = _bmcDist(e1.P, pool[i].P);
          if (dd < bd) { bd = dd; bi = i; }
        }
        const e2 = pool.splice(bi, 1)[0];
        if (bd < 0.5) continue; // already meeting
        info.connectors.push({ gid, from: e1, to: e2 });
      }
    }
  }

  const layout = { edges: live, nodes, nodeInfos, stopMap };
  _bmcState.layout = layout;
  return layout;
}

function bmcRouteLeg(fromGx, fromGy, toGx, toGy) {
  const dx = toGx - fromGx, dy = toGy - fromGy;
  if (dx === 0 && dy === 0) return [{ gx: fromGx, gy: fromGy }];
  const absDx = Math.abs(dx), absDy = Math.abs(dy);
  const sx = Math.sign(dx), sy = Math.sign(dy);
  const diag = Math.min(absDx, absDy);
  const cells = [{ gx: fromGx, gy: fromGy }];
  let cx = fromGx, cy = fromGy;
  for (let i = 0; i < diag; i++) { cx += sx; cy += sy; cells.push({ gx: cx, gy: cy }); }
  for (let i = 0; i < absDx - diag; i++) { cx += sx; cells.push({ gx: cx, gy: cy }); }
  for (let i = 0; i < absDy - diag; i++) { cy += sy; cells.push({ gx: cx, gy: cy }); }
  return cells;
}

function _bmcCompressPts(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 0.01) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function _bmcDist(p, q) { const dx = p.x - q.x, dy = p.y - q.y; return Math.sqrt(dx * dx + dy * dy); }

// Perpendicular offset of a polyline with mitered joins.
// Positive d = right of travel; negative = left (screen coords, y down).
function _bmcOffsetPolyline(pts, d) {
  if (pts.length < 2) return pts.map(p => ({ x: p.x, y: p.y }));
  if (Math.abs(d) < 0.001) return pts.map(p => ({ x: p.x, y: p.y }));
  const normals = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    normals.push({ x: -dy / len, y: dx / len }); // right of travel (y down)
  }
  const out = [];
  out.push({ x: pts[0].x + normals[0].x * d, y: pts[0].y + normals[0].y * d });
  for (let i = 1; i < pts.length - 1; i++) {
    const n1 = normals[i - 1], n2 = normals[i];
    let mx = n1.x + n2.x, my = n1.y + n2.y;
    const mlen = Math.sqrt(mx * mx + my * my);
    if (mlen < 0.001) { // 180° reversal — fall back to segment normal
      out.push({ x: pts[i].x + n2.x * d, y: pts[i].y + n2.y * d });
      continue;
    }
    mx /= mlen; my /= mlen;
    const cos = mx * n1.x + my * n1.y;
    const scale = d / Math.max(cos, 0.25); // miter limit
    out.push({ x: pts[i].x + mx * scale, y: pts[i].y + my * scale });
  }
  const nl = normals[normals.length - 1];
  out.push({ x: pts[pts.length - 1].x + nl.x * d, y: pts[pts.length - 1].y + nl.y * d });
  return out;
}

// Rounded-corner SVG path from polyline points
function _bmcRoundedPath(pts, r) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let dstr = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1], c = pts[i], n = pts[i + 1];
    const d1 = _bmcDist(p, c), d2 = _bmcDist(c, n);
    const rr = Math.min(r, d1 * 0.45, d2 * 0.45);
    if (rr < 0.5) { dstr += ` L${c.x.toFixed(1)},${c.y.toFixed(1)}`; continue; }
    const ax = c.x - (c.x - p.x) / d1 * rr, ay = c.y - (c.y - p.y) / d1 * rr;
    const bx = c.x + (n.x - c.x) / d2 * rr, by = c.y + (n.y - c.y) / d2 * rr;
    dstr += ` L${ax.toFixed(1)},${ay.toFixed(1)} Q${c.x.toFixed(1)},${c.y.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  const last = pts[pts.length - 1];
  dstr += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
  return dstr;
}

function _bmcLineIntersect(P1, d1, P2, d2) {
  const det = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(det) < 0.0001) return null;
  const t = ((P2.x - P1.x) * d2.y - (P2.y - P1.y) * d2.x) / det;
  return { x: P1.x + d1.x * t, y: P1.y + d1.y * t };
}

// ------------------------------------------------------------
// Rendering
// ------------------------------------------------------------

function bmcRender() {
  const svg = document.getElementById('bmc-svg');
  if (!svg) return;
  const layout = bmcComputeLayout();
  const d = bmcData();
  const groupColor = (gid) => getGroup(gid)?.color || '#888';

  let out = '';
  // world-space group with view transform
  out += `<g transform="translate(${_bmcState.viewX},${_bmcState.viewY}) scale(${_bmcState.zoom})">`;

  // grid dots (light)
  if (_bmcState.zoom > 0.45) {
    const wrap = document.getElementById('bmc-canvas-wrap');
    const W = wrap ? wrap.clientWidth : 1200, H = wrap ? wrap.clientHeight : 800;
    const x0 = Math.floor((-_bmcState.viewX / _bmcState.zoom) / BMC_CELL) - 1;
    const y0 = Math.floor((-_bmcState.viewY / _bmcState.zoom) / BMC_CELL) - 1;
    const x1 = Math.ceil((W - _bmcState.viewX) / _bmcState.zoom / BMC_CELL) + 1;
    const y1 = Math.ceil((H - _bmcState.viewY) / _bmcState.zoom / BMC_CELL) + 1;
    if ((x1 - x0) * (y1 - y0) < 12000) {
      for (let gx = x0; gx <= x1; gx++)
        for (let gy = y0; gy <= y1; gy++)
          out += `<circle cx="${gx * BMC_CELL}" cy="${gy * BMC_CELL}" r="0.8" fill="#dfe4ea"/>`;
    }
  }

  // strands
  for (const e of layout.edges) {
    for (const gid of e.orderedLines) {
      out += `<path d="${_bmcRoundedPath(e.strands[gid], BMC_CORNER)}" fill="none" stroke="${groupColor(gid)}" stroke-width="${BMC_LINEW}" stroke-linecap="round" data-bmc-edge="${e.key}"/>`;
    }
  }

  // connectors
  for (const info of layout.nodeInfos.values()) {
    const c = { x: info.pos.gx * BMC_CELL, y: info.pos.gy * BMC_CELL };
    for (const conn of info.connectors) {
      const { from, to, gid } = conn;
      // direction of each strand's end segment, pointing INTO the node zone
      const d1 = { x: from.P.x - from.Q.x, y: from.P.y - from.Q.y };
      const d2 = { x: to.P.x - to.Q.x, y: to.P.y - to.Q.y };
      const X = _bmcLineIntersect(from.P, d1, to.P, d2);
      let path;
      if (X && _bmcDist(X, c) < BMC_CELL * 1.6 &&
          (X.x - from.P.x) * d1.x + (X.y - from.P.y) * d1.y > -0.01 &&
          (X.x - to.P.x) * d2.x + (X.y - to.P.y) * d2.y > -0.01) {
        path = _bmcRoundedPath([from.P, X, to.P], BMC_CORNER);
      } else {
        // gentle curve through the node zone
        const mx = (from.P.x + to.P.x) / 2, my = (from.P.y + to.P.y) / 2;
        const cx2 = mx + (c.x - mx) * 0.3, cy2 = my + (c.y - my) * 0.3;
        path = `M${from.P.x.toFixed(1)},${from.P.y.toFixed(1)} Q${cx2.toFixed(1)},${cy2.toFixed(1)} ${to.P.x.toFixed(1)},${to.P.y.toFixed(1)}`;
      }
      out += `<path d="${path}" fill="none" stroke="${groupColor(gid)}" stroke-width="${BMC_LINEW}" stroke-linecap="round"/>`;
    }
  }

  // marks + labels
  const labelBoxes = [];
  for (const info of layout.nodeInfos.values()) {
    out += _bmcDrawMark(info, layout, labelBoxes);
  }

  // debug overlay
  if (_bmcState.debug) out += _bmcDebugOverlay(layout);

  out += '</g>';
  svg.innerHTML = out;
  _bmcRenderSidebar();
}

function _bmcMarkKind(info, layout) {
  if (!info.placed) return 'none'; // auto-positioned fork points are invisible
  const deg = info.edges.length;
  const union = new Set();
  for (const e of info.edges) for (const g of e.lines) union.add(g);
  if (deg === 1) return union.size === 1 ? 'terminus' : 'blob';
  if (deg === 2 && _bmcSetKey(info.edges[0].lines) === _bmcSetKey(info.edges[1].lines)) return 'tick';
  return 'blob';
}

function _bmcDrawMark(info, layout, labelBoxes) {
  const kind = _bmcMarkKind(info, layout);
  if (kind === 'none') return '';
  const c = { x: info.pos.gx * BMC_CELL, y: info.pos.gy * BMC_CELL };
  let out = '';
  const union = new Set();
  for (const e of info.edges) for (const g of e.lines) union.add(g);
  const kmax = Math.max(...info.edges.map(e => e.orderedLines.length));
  const halfSpan = ((kmax - 1) / 2) * BMC_GAP + BMC_LINEW / 2;

  if (kind === 'blob') {
    const r = Math.min(halfSpan + 5.5, BMC_CELL * 0.95);
    out += `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#fff" stroke="#0f1a3c" stroke-width="2.6" data-bmc-node="${info.id}" style="cursor:grab"/>`;
  } else if (kind === 'terminus') {
    // T-bar perpendicular to the single edge's end direction
    const e = info.edges[0];
    const gid = e.orderedLines[0];
    const end = info.ends.get(e.key + '|' + gid);
    if (end) {
      const dx = end.P.x - end.Q.x, dy = end.P.y - end.Q.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const half = halfSpan + 5;
      out += `<line x1="${(c.x - nx * half).toFixed(1)}" y1="${(c.y - ny * half).toFixed(1)}" x2="${(c.x + nx * half).toFixed(1)}" y2="${(c.y + ny * half).toFixed(1)}" stroke="${getGroup(gid)?.color || '#888'}" stroke-width="${BMC_LINEW + 1}" stroke-linecap="butt" data-bmc-node="${info.id}" style="cursor:grab"/>`;
      // invisible grab target
      out += `<circle cx="${c.x}" cy="${c.y}" r="10" fill="transparent" data-bmc-node="${info.id}" style="cursor:grab"/>`;
    }
  } else if (kind === 'tick') {
    // ticks only for lines that actually stop here, drawn from the
    // line's strand position outward (postmortem decision #4)
    const e = info.edges[0];
    const k = e.orderedLines.length;
    let drewAny = false;
    e.orderedLines.forEach((gid, i) => {
      const stopsHere = layout.stopMap.get(gid)?.has(info.id);
      if (!stopsHere) return;
      const end = info.ends.get(e.key + '|' + gid);
      if (!end) return;
      const dx = end.P.x - end.Q.x, dy = end.P.y - end.Q.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      let nx = -dy / len, ny = dx / len; // perpendicular
      // outward = away from corridor centre; centre line goes "left" (negative side)
      const off = (i - (k - 1) / 2);
      const sgn = off > 0 ? 1 : (off < 0 ? -1 : -1);
      // determine which perpendicular side is outward relative to centreline
      const toCentre = { x: c.x - end.P.x, y: c.y - end.P.y };
      if ((nx * toCentre.x + ny * toCentre.y) * sgn > 0 === (off !== 0)) { /* keep */ }
      if (off !== 0) {
        // outward = direction from centreline to this strand
        const ox = end.P.x - c.x, oy = end.P.y - c.y;
        const olen = Math.sqrt(ox * ox + oy * oy) || 1;
        nx = ox / olen; ny = oy / olen;
      } else {
        nx = -Math.abs(nx) || -0.0001; ny = ny; // centre strand: pick left-ish consistently
      }
      const t1 = { x: end.P.x + nx * (BMC_LINEW / 2), y: end.P.y + ny * (BMC_LINEW / 2) };
      const t2 = { x: end.P.x + nx * (BMC_LINEW / 2 + BMC_GAP * 0.9), y: end.P.y + ny * (BMC_LINEW / 2 + BMC_GAP * 0.9) };
      out += `<line x1="${t1.x.toFixed(1)}" y1="${t1.y.toFixed(1)}" x2="${t2.x.toFixed(1)}" y2="${t2.y.toFixed(1)}" stroke="${getGroup(gid)?.color || '#888'}" stroke-width="${BMC_LINEW - 1}" data-bmc-node="${info.id}"/>`;
      drewAny = true;
    });
    // grab target regardless
    out += `<circle cx="${c.x}" cy="${c.y}" r="10" fill="transparent" data-bmc-node="${info.id}" style="cursor:grab"/>`;
    if (!drewAny) {
      // no line stops here — tiny hollow dot so the station stays findable
      out += `<circle cx="${c.x}" cy="${c.y}" r="2.4" fill="#fff" stroke="#9aa4b0" stroke-width="1.2" data-bmc-node="${info.id}" style="cursor:grab"/>`;
    }
  }

  // label
  if (info.placed && info.node) {
    out += _bmcDrawLabel(info, kind, labelBoxes);
  }
  return out;
}

const _BMC_LABEL_DIRS = [
  { dx: 1, dy: 0, anchor: 'start', vy: 0.35 },   // E
  { dx: 1, dy: 1, anchor: 'start', vy: 0.9 },    // SE
  { dx: 0, dy: 1, anchor: 'middle', vy: 1.1 },   // S
  { dx: -1, dy: 1, anchor: 'end', vy: 0.9 },     // SW
  { dx: -1, dy: 0, anchor: 'end', vy: 0.35 },    // W
  { dx: -1, dy: -1, anchor: 'end', vy: -0.3 },   // NW
  { dx: 0, dy: -1, anchor: 'middle', vy: -0.6 }, // N
  { dx: 1, dy: -1, anchor: 'start', vy: -0.3 },  // NE
];

function _bmcDrawLabel(info, kind, labelBoxes) {
  const name = nodeDisplayName(info.id);
  if (!name) return '';
  const c = { x: info.pos.gx * BMC_CELL, y: info.pos.gy * BMC_CELL };
  const d = bmcData();
  const override = d.labelDir[info.id];
  const layout = _bmcState.layout;

  // score candidate directions by how many route cells sit where the
  // label would go (any edge's route, not just this station's)
  const cellSet = layout._cellSet || (layout._cellSet = (() => {
    const s = new Set();
    for (const e of layout.edges) for (const cc of e.cells) s.add(cc.gx + ',' + cc.gy);
    return s;
  })());
  const kmax2 = Math.max(...info.edges.map(e => e.orderedLines.length));
  const spanCells = Math.ceil(((kmax2 - 1) / 2 * BMC_GAP + 14) / BMC_CELL);
  const scoreDir = (i) => {
    const di2 = _BMC_LABEL_DIRS[i];
    let s = 0;
    for (let step = 1; step <= 3; step++) {
      const gx = info.pos.gx + di2.dx * (spanCells + step - 1);
      const gy = info.pos.gy + di2.dy * (spanCells + step - 1);
      for (let ox = -1; ox <= 1; ox++)
        if (cellSet.has((gx + (di2.dx === 0 ? ox : 0)) + ',' + (gy + (di2.dy === 0 ? ox : 0)))) s += (4 - step);
      if (cellSet.has(gx + ',' + gy)) s += (4 - step);
    }
    return s;
  };
  const prefs = [0, 4, 2, 6, 1, 7, 3, 5];
  const dirOrder = override != null && override !== 'auto' ? [override] :
    prefs.slice().sort((x, y) => scoreDir(x) - scoreDir(y) || prefs.indexOf(x) - prefs.indexOf(y));
  const di = _BMC_LABEL_DIRS[dirOrder[0]];
  const halfSpanPx = (kmax2 - 1) / 2 * BMC_GAP;
  const gap = (kind === 'blob' ? BMC_CELL * 0.55 : BMC_CELL * 0.35) + halfSpanPx + 5;
  const lx = c.x + di.dx * gap;
  const ly = c.y + di.dy * gap + di.vy * 8;
  const weight = kind === 'blob' ? '700' : '400';
  const esc2 = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  // naive two-line wrap for long names
  const words = name.split(' ');
  if (name.length > 14 && words.length > 1) {
    let l1 = '', l2 = '';
    for (const w of words) { if ((l1 + ' ' + w).trim().length <= Math.ceil(name.length / 2)) l1 = (l1 + ' ' + w).trim(); else l2 = (l2 + ' ' + w).trim(); }
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${di.anchor}" font-family="'Hammersmith One',sans-serif" font-size="11" font-weight="${weight}" fill="#0f1a3c" pointer-events="none"><tspan x="${lx.toFixed(1)}" dy="0">${esc2(l1)}</tspan><tspan x="${lx.toFixed(1)}" dy="11">${esc2(l2)}</tspan></text>`;
  }
  return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${di.anchor}" font-family="'Hammersmith One',sans-serif" font-size="11" font-weight="${weight}" fill="#0f1a3c" pointer-events="none">${esc2(name)}</text>`;
}

function _bmcDebugOverlay(layout) {
  let out = '';
  for (const e of layout.edges) {
    const mid = e.pts[Math.floor(e.pts.length / 2)];
    const names = e.orderedLines.map(g => getGroup(g)?.name || '?').join(' | ');
    out += `<text x="${mid.x}" y="${mid.y - 10}" font-size="8" fill="#c0392f" text-anchor="middle" pointer-events="none">${names}</text>`;
  }
  for (const info of layout.nodeInfos.values()) {
    const c = { x: info.pos.gx * BMC_CELL, y: info.pos.gy * BMC_CELL };
    out += `<text x="${c.x + 4}" y="${c.y - 14}" font-size="7" fill="#2e7dd1" pointer-events="none">${info.pos.gx},${info.pos.gy}${info.pos.auto ? ' (auto)' : ''} d${info.edges.length}</text>`;
    for (const conn of info.connectors) {
      out += `<circle cx="${conn.from.P.x}" cy="${conn.from.P.y}" r="2" fill="none" stroke="#c0392f" stroke-width="0.8"/>`;
      out += `<circle cx="${conn.to.P.x}" cy="${conn.to.P.y}" r="2" fill="none" stroke="#c0392f" stroke-width="0.8"/>`;
    }
  }
  return out;
}

// ------------------------------------------------------------
// Sidebar (classic mode takes over the schematic sidebar list)
// ------------------------------------------------------------

function _bmcRenderSidebar() {
  if (!_bmcState.active) return;
  const el = document.getElementById('schem-sidebar-list');
  if (!el) return;
  const d = bmcData();
  const q = (document.getElementById('schem-sidebar-search')?.value || '').toLowerCase();
  const placedSet = new Set(Object.keys(d.stations));
  const unplaced = data.nodes.filter(n => isPassengerStop(n) && !placedSet.has(n.id));
  // most-wanted: how many neighbouring placed stations
  const score = (n) => connectedNodes(n.id).filter(id => placedSet.has(id)).length;
  const list = unplaced
    .filter(n => !q || stripDiacritics(n.name.toLowerCase()).includes(stripDiacritics(q)))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, 400);
  let html = `<div style="padding:6px 12px;font-size:10px;color:var(--text-muted)">${t('bmc.sidebar_hint')}</div>`;
  for (const n of list) {
    const sc = score(n);
    html += `<div class="schem-sidebar-item" data-bmc-sb="${n.id}" style="padding:5px 12px;font-size:12px;cursor:grab;display:flex;justify-content:space-between;align-items:center">
      <span class="schem-sb-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.name)}</span>
      ${sc ? `<span class="schem-sb-score" style="font-size:10px;color:var(--accent)">${sc}</span>` : ''}
    </div>`;
  }
  if (!list.length) html += `<div style="padding:8px 12px;font-size:11px;color:var(--text-muted)">${t('bmc.all_placed')}</div>`;
  el.innerHTML = html;
  el.querySelectorAll('[data-bmc-sb]').forEach(item => {
    item.addEventListener('pointerdown', (ev) => _bmcSidebarDragStart(ev, item.dataset.bmcSb));
  });
}

// ------------------------------------------------------------
// Interaction
// ------------------------------------------------------------

function _bmcScreenToWorld(sx, sy) {
  const svg = document.getElementById('bmc-svg');
  const rect = svg.getBoundingClientRect();
  return {
    x: (sx - rect.left - _bmcState.viewX) / _bmcState.zoom,
    y: (sy - rect.top - _bmcState.viewY) / _bmcState.zoom,
  };
}

function _bmcAttachEvents() {
  const svg = document.getElementById('bmc-svg');
  if (!svg || svg._bmcEvents) return;
  svg._bmcEvents = true;

  svg.addEventListener('pointerdown', (ev) => {
    const nodeEl = ev.target.closest && ev.target.closest('[data-bmc-node]');
    if (nodeEl && ev.button === 0) {
      const nid = nodeEl.getAttribute('data-bmc-node');
      const st = bmcData().stations[nid];
      if (st) {
        _bmcState.nodeDrag = { nodeId: nid, gx: st.gx, gy: st.gy };
        svg.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
    }
    if (ev.button === 0) {
      _bmcState.panning = { startX: ev.clientX, startY: ev.clientY, vx: _bmcState.viewX, vy: _bmcState.viewY };
      svg.setPointerCapture(ev.pointerId);
    }
  });

  svg.addEventListener('pointermove', (ev) => {
    if (_bmcState.nodeDrag) {
      const w = _bmcScreenToWorld(ev.clientX, ev.clientY);
      const gx = Math.round(w.x / BMC_CELL), gy = Math.round(w.y / BMC_CELL);
      const nd = _bmcState.nodeDrag;
      if (gx !== nd.gx || gy !== nd.gy) {
        nd.gx = gx; nd.gy = gy;
        bmcData().stations[nd.nodeId] = { gx, gy };
        bmcRender();
      }
      return;
    }
    if (_bmcState.panning) {
      const p = _bmcState.panning;
      _bmcState.viewX = p.vx + (ev.clientX - p.startX);
      _bmcState.viewY = p.vy + (ev.clientY - p.startY);
      bmcRender();
    }
  });

  const endDrag = (ev) => {
    if (_bmcState.nodeDrag) { save(); _bmcState.nodeDrag = null; bmcRender(); }
    _bmcState.panning = null;
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.15 : 0.87;
    const rect = svg.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    const nz = Math.max(0.15, Math.min(4, _bmcState.zoom * factor));
    _bmcState.viewX = mx - (mx - _bmcState.viewX) * (nz / _bmcState.zoom);
    _bmcState.viewY = my - (my - _bmcState.viewY) * (nz / _bmcState.zoom);
    _bmcState.zoom = nz;
    bmcRender();
  }, { passive: false });

  // right-click a station: unplace
  svg.addEventListener('contextmenu', (ev) => {
    const nodeEl = ev.target.closest && ev.target.closest('[data-bmc-node]');
    if (nodeEl) {
      ev.preventDefault();
      const nid = nodeEl.getAttribute('data-bmc-node');
      delete bmcData().stations[nid];
      save(); bmcRender();
      toast(t('bmc.unplaced_toast', { name: nodeDisplayName(nid) }), 'info');
    }
  });

  // drop from sidebar
  document.addEventListener('pointermove', (ev) => {
    const sd = _bmcState.sidebarDrag;
    if (!sd) return;
    sd.ghostEl.style.left = (ev.clientX + 10) + 'px';
    sd.ghostEl.style.top = (ev.clientY + 6) + 'px';
  });
  document.addEventListener('pointerup', (ev) => {
    const sd = _bmcState.sidebarDrag;
    if (!sd) return;
    _bmcState.sidebarDrag = null;
    sd.ghostEl.remove();
    const svgEl = document.getElementById('bmc-svg');
    const rect = svgEl.getBoundingClientRect();
    if (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
      const w = _bmcScreenToWorld(ev.clientX, ev.clientY);
      bmcData().stations[sd.nodeId] = { gx: Math.round(w.x / BMC_CELL), gy: Math.round(w.y / BMC_CELL) };
      save(); bmcRender();
    }
  });
}

function _bmcSidebarDragStart(ev, nodeId) {
  ev.preventDefault();
  const ghost = document.createElement('div');
  ghost.textContent = nodeDisplayName(nodeId);
  ghost.style.cssText = 'position:fixed;z-index:3000;background:var(--bg-raised);border:1px solid var(--accent);border-radius:4px;padding:3px 8px;font-size:12px;pointer-events:none;color:var(--text)';
  ghost.style.left = (ev.clientX + 10) + 'px';
  ghost.style.top = (ev.clientY + 6) + 'px';
  document.body.appendChild(ghost);
  _bmcState.sidebarDrag = { nodeId, ghostEl: ghost };
}

function bmcFitAll() {
  const layout = _bmcState.layout || bmcComputeLayout();
  const pts = [];
  for (const n of layout.nodes.values()) if (n.pos) pts.push(n.pos);
  if (!pts.length) return;
  const wrap = document.getElementById('bmc-canvas-wrap');
  const W = wrap ? wrap.clientWidth : 1200, H = wrap ? wrap.clientHeight : 800;
  const xs = pts.map(p => p.gx * BMC_CELL), ys = pts.map(p => p.gy * BMC_CELL);
  const minX = Math.min(...xs) - 80, maxX = Math.max(...xs) + 80;
  const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 60;
  const z = Math.max(0.15, Math.min(2.5, Math.min(W / (maxX - minX || 1), H / (maxY - minY || 1))));
  _bmcState.zoom = z;
  _bmcState.viewX = (W - (minX + maxX) * z) / 2;
  _bmcState.viewY = (H - (minY + maxY) * z) / 2;
  bmcRender();
}

function bmcZoom(f) {
  const wrap = document.getElementById('bmc-canvas-wrap');
  const W = wrap ? wrap.clientWidth : 1200, H = wrap ? wrap.clientHeight : 800;
  const nz = Math.max(0.15, Math.min(4, _bmcState.zoom * f));
  _bmcState.viewX = W / 2 - (W / 2 - _bmcState.viewX) * (nz / _bmcState.zoom);
  _bmcState.viewY = H / 2 - (H / 2 - _bmcState.viewY) * (nz / _bmcState.zoom);
  _bmcState.zoom = nz;
  bmcRender();
}

// ------------------------------------------------------------
// Activation + style toggle
// ------------------------------------------------------------

function bmcEnsureDom() {
  if (document.getElementById('bmc-svg')) return;
  const wrap = document.getElementById('schem-canvas-wrap');
  if (!wrap) return;
  wrap.id = wrap.id; // no-op, keep reference name
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'bmc-svg';
  svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;background:#fff;touch-action:none';
  wrap.insertBefore(svg, wrap.firstChild.nextSibling);
  wrap.setAttribute('data-bmc-wrap', '1');
  // give the wrap an alias id for size queries
  const alias = document.createElement('div');
  alias.style.display = 'none';
  wrap.id = 'schem-canvas-wrap';
  // classic HUD
  const hud = document.createElement('div');
  hud.id = 'bmc-hud';
  hud.style.cssText = 'position:absolute;top:12px;right:12px;display:none;flex-direction:column;gap:4px;z-index:11';
  hud.innerHTML = `
    <button class="schem-btn" onclick="bmcZoom(1.25)" title="${t('bmc.zoom_in')}">+</button>
    <button class="schem-btn" onclick="bmcZoom(0.8)" title="${t('bmc.zoom_out')}">−</button>
    <button class="schem-btn" onclick="bmcFitAll()" title="${t('bmc.fit')}">⊞</button>
    <button class="schem-btn" onclick="_bmcState.debug=!_bmcState.debug;bmcRender()" title="${t('bmc.debug')}" style="font-size:9px">DBG</button>
    <button class="schem-btn" onclick="bmcToggleStyle()" title="${t('bmc.toggle_to_v3')}" style="font-size:8px">V3</button>`;
  wrap.appendChild(hud);
  // toggle button in the v3 HUD
  const v3hud = document.getElementById('schem-hud');
  if (v3hud && !document.getElementById('bmc-toggle-btn')) {
    const btn = document.createElement('button');
    btn.id = 'bmc-toggle-btn';
    btn.className = 'schem-btn';
    btn.title = t('bmc.toggle_to_classic');
    btn.style.fontSize = '8px';
    btn.textContent = 'CLA';
    btn.onclick = bmcToggleStyle;
    v3hud.appendChild(btn);
  }
}

function bmcActivate() {
  bmcEnsureDom();
  _bmcState.active = true;
  const v3svg = document.getElementById('schem-svg');
  const v3hud = document.getElementById('schem-hud');
  const svg = document.getElementById('bmc-svg');
  const hud = document.getElementById('bmc-hud');
  if (v3svg) v3svg.style.display = 'none';
  if (v3hud) v3hud.style.display = 'none';
  if (svg) svg.style.display = '';
  if (hud) hud.style.display = 'flex';
  const edgePanel = document.getElementById('schem-edge-panel');
  if (edgePanel) edgePanel.style.display = 'none';
  _bmcAttachEvents();
  if (!_bmcState.initialized) {
    _bmcState.initialized = true;
    bmcRender();
    bmcFitAll();
  } else {
    bmcRender();
  }
}

function bmcDeactivate() {
  _bmcState.active = false;
  const v3svg = document.getElementById('schem-svg');
  const v3hud = document.getElementById('schem-hud');
  const svg = document.getElementById('bmc-svg');
  const hud = document.getElementById('bmc-hud');
  if (svg) svg.style.display = 'none';
  if (hud) hud.style.display = 'none';
  if (v3svg) v3svg.style.display = '';
  if (v3hud) v3hud.style.display = 'flex';
}

function bmcToggleStyle() {
  const cur = data.settings?.railmapStyle || 'v3';
  const next = cur === 'classic' ? 'v3' : 'classic';
  data.settings.railmapStyle = next;
  save();
  if (next === 'classic') bmcActivate();
  else { bmcDeactivate(); if (typeof renderSchemSidebar === 'function') renderSchemSidebar(); if (typeof renderSchematic === 'function') renderSchematic(); }
  toast(next === 'classic' ? t('bmc.now_classic') : t('bmc.now_v3'), 'info');
}

// Hook: called from switchTab when the schematic tab is shown
function bmcOnTabShow() {
  bmcEnsureDom();
  if ((data.settings?.railmapStyle || 'v3') === 'classic') bmcActivate();
  else bmcDeactivate();
}
