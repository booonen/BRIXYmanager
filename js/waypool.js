// ============================================================
// SYSTEM WAY POOL — cached OGF way geometry + graph routing
// ============================================================
// The pool is the set of OGF ways that make up a system (entered once in
// Settings as way IDs and/or relation IDs). Its geometry is fetched ONCE
// from Overpass and cached per save slot in IndexedDB (never inside the
// exported JSON — it is derivable). New segments then get their geometry
// with no network call: both endpoints snap onto the pool and a
// shortest-path search through the pool's way graph yields exactly the
// ways and sub-polyline between them, through junctions and branches.

let _wayPool = null;       // { id, fetchedAt, ways: { [wayId]: { coords, nodes, tags } }, relations: { [relId]: [wayId] } }
let _wayPoolGraph = null;  // lazily built from _wayPool

const WAYPOOL_SNAP_WARN_KM = 0.05;

function wayPoolReady() {
  return !!(_wayPool && _wayPool.ways && Object.keys(_wayPool.ways).length);
}

// "12345, 67890, r4321, relation 99, way 55" → { ways, relations }
function wayPoolParseIds(text) {
  const norm = String(text || '')
    .replace(/\b(?:relation|rel|r)\s*[:#]?\s*(\d+)/gi, ' r$1 ')
    .replace(/\b(?:way|w)\s*[:#]?\s*(\d+)/gi, ' $1 ');
  const ways = [], relations = [];
  for (const tok of norm.split(/[,\s;]+/)) {
    const s = tok.trim();
    if (!s) continue;
    let m;
    if ((m = s.match(/^r(\d+)$/i))) relations.push(parseInt(m[1]));
    else if ((m = s.match(/^(\d+)$/))) ways.push(parseInt(m[1]));
  }
  return { ways: [...new Set(ways)], relations: [...new Set(relations)] };
}

async function _wayPoolOverpass(query) {
  const resp = await fetch(OGF_OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(query)
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  return json.elements || [];
}

function _wayPoolIsPlatform(tags) {
  return tags.highway === 'platform' || tags.railway === 'platform' || tags.public_transport === 'platform';
}

// Overpass `out geom` returns both node refs and coordinates; node refs
// give exact topology (shared nodes = connected ways). Fall back to a
// coordinate identity if refs are ever missing.
function _wayPoolEntry(el) {
  const coords = el.geometry.map(p => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5]);
  const nodes = (el.nodes && el.nodes.length === el.geometry.length)
    ? el.nodes.map(String)
    : coords.map(c => c[0].toFixed(5) + ',' + c[1].toFixed(5));
  return { coords, nodes, tags: el.tags || {} };
}

async function wayPoolFetch() {
  const parsed = wayPoolParseIds(getSetting('wayPoolIds', ''));
  if (!parsed.ways.length && !parsed.relations.length) { toast(t('toast.waypool_no_ids'), 'error'); return false; }
  toast(t('toast.waypool_fetching'), 'info');
  const ways = {}, relations = {};
  try {
    // explicit way IDs, chunked to keep each Overpass query modest
    for (let i = 0; i < parsed.ways.length; i += 300) {
      const chunk = parsed.ways.slice(i, i + 300);
      const els = await _wayPoolOverpass(`[out:json];(${chunk.map(id => `way(${id});`).join('')});out geom;`);
      for (const el of els) if (el.type === 'way' && el.geometry?.length) ways[String(el.id)] = _wayPoolEntry(el);
    }
    // relation members: track ways only (railway=* / highway=*, never platforms)
    for (const rid of parsed.relations) {
      const els = await _wayPoolOverpass(`[out:json];relation(${rid});way(r);out geom;`);
      const members = [];
      for (const el of els) {
        if (el.type !== 'way' || !el.geometry?.length) continue;
        const tags = el.tags || {};
        if (_wayPoolIsPlatform(tags) || (!tags.railway && !tags.highway)) continue;
        ways[String(el.id)] = _wayPoolEntry(el);
        members.push(el.id);
      }
      relations[String(rid)] = members;
    }
  } catch (err) {
    console.error('Way pool fetch error:', err);
    toast(t('toast.way_fetch_error', { msg: err.message }), 'error');
    return false;
  }
  const missing = parsed.ways.filter(id => !ways[String(id)]);
  if (missing.length) toast(t('toast.way_fetch_missing', { ids: missing.join(', ') }), 'error');
  const emptyRels = parsed.relations.filter(id => !(relations[String(id)] || []).length);
  if (emptyRels.length) toast(t('toast.waypool_rel_empty', { ids: emptyRels.join(', ') }), 'error');
  if (!Object.keys(ways).length) { toast(t('toast.waypool_none'), 'error'); return false; }
  _wayPool = { id: _activeSaveId, fetchedAt: new Date().toISOString(), ways, relations };
  _wayPoolGraph = null;
  await wayPoolPersist();
  toast(t('toast.waypool_fetched', { ways: Object.keys(ways).length }), 'success');
  return true;
}

// ---- persistence (own IndexedDB store, keyed by save slot) ----

async function wayPoolPersist() {
  if (!_db || !_activeSaveId || !_wayPool) return;
  _wayPool.id = _activeSaveId;
  try { await dbPut('waypool', _wayPool); } catch (e) { console.error('Way pool save failed:', e); }
}

async function wayPoolLoad() {
  _wayPool = null;
  _wayPoolGraph = null;
  if (!_db || !_activeSaveId) return;
  try {
    const rec = await dbGet('waypool', _activeSaveId);
    if (rec && rec.ways) _wayPool = rec;
  } catch (e) { /* store may not exist on a very old DB — treated as empty */ }
}

async function wayPoolClear() {
  _wayPool = null;
  _wayPoolGraph = null;
  if (_db && _activeSaveId) { try { await dbDelete('waypool', _activeSaveId); } catch (e) {} }
}

// ---- graph + routing ----

function _wayPoolGetGraph() {
  if (_wayPoolGraph) return _wayPoolGraph;
  const adj = new Map();      // nodeRef -> [{ to, len, way }]
  const coordOf = new Map();  // nodeRef -> [lat, lon]
  const addEdge = (a, b, len, way) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, len, way }); };
  for (const [wid, w] of Object.entries(_wayPool.ways)) {
    for (let i = 0; i < w.nodes.length; i++) coordOf.set(w.nodes[i], w.coords[i]);
    for (let i = 0; i < w.nodes.length - 1; i++) {
      const len = _ptDist(w.coords[i], w.coords[i + 1]);
      addEdge(w.nodes[i], w.nodes[i + 1], len, wid);
      addEdge(w.nodes[i + 1], w.nodes[i], len, wid);
    }
  }
  _wayPoolGraph = { adj, coordOf };
  return _wayPoolGraph;
}

// nearest position on any pool way: { way, edgeIdx, t, point, dist }
function _wayPoolSnap(pt) {
  let best = null;
  for (const [wid, w] of Object.entries(_wayPool.ways)) {
    for (let i = 0; i < w.coords.length - 1; i++) {
      const pr = _projectToEdge(pt, w.coords[i], w.coords[i + 1]);
      if (!best || pr.dist < best.dist) best = { way: wid, edgeIdx: i, t: pr.t, point: pr.point, dist: pr.dist };
    }
  }
  return best;
}

// Shortest path through the pool between two [lat,lon] points. Returns
// { coords, wayIds, distKm, maxSpeed, speedsConflict, snapA, snapB } or null.
function wayPoolRoute(ptA, ptB) {
  if (!wayPoolReady()) return null;
  const g = _wayPoolGetGraph();
  const sA = _wayPoolSnap(ptA), sB = _wayPoolSnap(ptB);
  if (!sA || !sB) return null;

  // virtual endpoint vertices spliced into their snapped way edges
  const extra = new Map();
  const addX = (a, b, len, way) => { if (!extra.has(a)) extra.set(a, []); extra.get(a).push({ to: b, len, way }); };
  const splice = (name, s) => {
    const w = _wayPool.ways[s.way];
    const n0 = w.nodes[s.edgeIdx], n1 = w.nodes[s.edgeIdx + 1];
    const l0 = _ptDist(w.coords[s.edgeIdx], s.point), l1 = _ptDist(s.point, w.coords[s.edgeIdx + 1]);
    addX(name, n0, l0, s.way); addX(n0, name, l0, s.way);
    addX(name, n1, l1, s.way); addX(n1, name, l1, s.way);
  };
  splice('@A', sA);
  splice('@B', sB);
  if (sA.way === sB.way && sA.edgeIdx === sB.edgeIdx) {
    const l = _ptDist(sA.point, sB.point);
    addX('@A', '@B', l, sA.way); addX('@B', '@A', l, sA.way);
  }
  const neighbors = (v) => [...(g.adj.get(v) || []), ...(extra.get(v) || [])];

  // Dijkstra (binary heap)
  const heap = [[0, '@A']];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  const dist = new Map([['@A', 0]]), prev = new Map(), done = new Set();
  while (heap.length) {
    const [d, v] = pop();
    if (done.has(v)) continue;
    done.add(v);
    if (v === '@B') break;
    for (const e of neighbors(v)) {
      const nd = d + e.len;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { from: v, way: e.way }); push([nd, e.to]); }
    }
  }
  if (!dist.has('@B')) return null;

  const verts = [], waysUsed = [];
  let cur = '@B';
  while (cur !== '@A') { const p = prev.get(cur); verts.push(cur); waysUsed.push(p.way); cur = p.from; }
  verts.push('@A');
  verts.reverse(); waysUsed.reverse();
  const coords = verts.map(v => v === '@A' ? sA.point : v === '@B' ? sB.point : g.coordOf.get(v));
  const wayIds = [...new Set(waysUsed)].map(Number);
  const speeds = [...new Set(wayIds.map(id => parseInt(_wayPool.ways[String(id)]?.tags?.maxspeed)).filter(s => s > 0))];
  return {
    coords: _simplifyCoords(coords, 0.00005),
    wayIds,
    distKm: dist.get('@B'),
    maxSpeed: speeds.length === 1 ? speeds[0] : null,
    speedsConflict: speeds.length > 1,
    snapA: sA, snapB: sB,
  };
}

// route between two nodes; { error: 'nolatlon' | 'noroute' } when impossible
function wayPoolRouteForNodes(nA, nB) {
  if (!nA || !nB || nA.lat == null || nB.lat == null || nA.lon == null || nB.lon == null) return { error: 'nolatlon' };
  const r = wayPoolRoute([nA.lat, nA.lon], [nB.lat, nB.lon]);
  return r || { error: 'noroute' };
}

// ---- bulk apply ----

function wayPoolApplyToSegments(overwrite) {
  if (!wayPoolReady()) { toast(t('toast.waypool_not_ready'), 'error'); return; }
  const run = () => {
    let applied = 0, skipped = 0;
    const warnings = [];
    for (const seg of data.segments) {
      if (isInterchange(seg)) continue;
      if (!overwrite && seg.wayGeometry?.length) continue;
      const nA = getNode(seg.nodeA), nB = getNode(seg.nodeB);
      const label = `${nodeName(seg.nodeA)} — ${nodeName(seg.nodeB)}`;
      const r = wayPoolRouteForNodes(nA, nB);
      if (r.error) {
        skipped++;
        warnings.push(`${label}: ${t(r.error === 'noroute' ? 'waypool.warn_no_route' : 'waypool.warn_no_latlon')}`);
        continue;
      }
      if (r.snapA.dist > WAYPOOL_SNAP_WARN_KM) warnings.push(t('toast.snap_warn', { name: nA.name, m: Math.round(r.snapA.dist * 1000) }));
      if (r.snapB.dist > WAYPOOL_SNAP_WARN_KM) warnings.push(t('toast.snap_warn', { name: nB.name, m: Math.round(r.snapB.dist * 1000) }));
      seg.wayGeometry = r.coords;
      seg.ogfWayIds = r.wayIds;
      if (!(seg.distance > 0)) seg.distance = haversineDistance(r.coords);
      applied++;
    }
    save();
    if (typeof renderSegments === 'function') renderSegments();
    const body = `<p style="font-size:13px;margin-bottom:12px">${t('settings.waypool_result', { n: applied, skipped })}</p>` +
      (warnings.length ? `<div style="font-size:12px;color:var(--text-dim);max-height:260px;overflow:auto"><strong>${t('settings.waypool_warnings')}</strong><ul style="margin:6px 0 0 16px;line-height:1.7">${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '');
    openModal(t('settings.waypool_result_title'), body, `<button class="btn btn-primary" onclick="closeModal()">${t('btn.close')}</button>`);
  };
  if (overwrite) appConfirm(t('confirm.waypool_overwrite'), run); else run();
}

// ---- settings UI ----

function wayPoolStatusText() {
  if (!wayPoolReady()) return t('settings.waypool_empty');
  const ways = Object.keys(_wayPool.ways).length;
  const pts = Object.values(_wayPool.ways).reduce((s, w) => s + w.coords.length, 0);
  const rels = Object.keys(_wayPool.relations || {}).length;
  const when = _wayPool.fetchedAt ? new Date(_wayPool.fetchedAt).toLocaleString() : '?';
  return t('settings.waypool_status', { ways, pts, rels, when });
}

function renderWayPoolSettings(s) {
  return `
    <div id="stab-ogf" class="settings-section" style="display:none">
      <p class="text-dim" style="font-size:13px;margin-bottom:16px">${t('settings.waypool_desc')}</p>
      <div class="form-group"><label>${t('field.waypool_ids')}</label>
        <textarea id="set-waypool" rows="4" placeholder="${t('placeholder.eg_waypool')}" onchange="saveSetting('wayPoolIds', this.value)">${esc(s.wayPoolIds || '')}</textarea>
        <p class="text-dim" style="font-size:11px;margin-top:2px">${t('settings.waypool_ids_hint')}</p>
      </div>
      <div class="flex gap-8" style="align-items:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="wayPoolFetchFromSettings()">${t('settings.waypool_fetch')}</button>
        <button class="btn" onclick="wayPoolClearFromSettings()">${t('settings.waypool_clear')}</button>
        <span id="waypool-status" class="text-dim" style="font-size:12px">${wayPoolStatusText()}</span>
      </div>
      <div class="form-group" style="margin-top:16px">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:13px;color:var(--text);">
          <input type="checkbox" ${(s.wayPoolAuto ?? true) ? 'checked' : ''} onchange="saveSetting('wayPoolAuto', this.checked)">
          ${t('settings.waypool_auto')}</label>
        <p class="text-dim" style="font-size:11px;margin-top:2px">${t('settings.waypool_auto_desc')}</p>
      </div>
      <div class="form-group" style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
        <div class="flex gap-8" style="flex-wrap:wrap">
          <button class="btn" onclick="wayPoolApplyToSegments(false)">${t('settings.waypool_apply')}</button>
          <button class="btn" onclick="wayPoolApplyToSegments(true)">${t('settings.waypool_apply_all')}</button>
        </div>
        <p class="text-dim" style="font-size:11px;margin-top:4px">${t('settings.waypool_apply_desc')}</p>
      </div>
    </div>`;
}

async function wayPoolFetchFromSettings() {
  const ta = document.getElementById('set-waypool');
  if (ta) saveSetting('wayPoolIds', ta.value);
  await wayPoolFetch();
  const st = document.getElementById('waypool-status');
  if (st) st.textContent = wayPoolStatusText();
}

async function wayPoolClearFromSettings() {
  await wayPoolClear();
  const st = document.getElementById('waypool-status');
  if (st) st.textContent = wayPoolStatusText();
  toast(t('toast.waypool_cleared'), 'info');
}
