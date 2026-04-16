// ============================================================
// NODE SPLIT & MERGE OPERATIONS
// ============================================================
let _splitState = null;
let _mergeState = null;
let _nodeOpsMouseDown = null;

// ---- Overlay helpers ----

function _nodeOpsClose() {
  const ov = document.getElementById('node-ops-overlay');
  if (ov) ov.remove();
  _splitState = null;
  _mergeState = null;
}

function _openNodeOpsOverlay(title, bodyId, footerHtml, opts) {
  _nodeOpsClose();
  const ov = document.createElement('div');
  ov.id = 'node-ops-overlay';
  ov.className = 'modal-overlay open';
  ov.onmousedown = e => { _nodeOpsMouseDown = e.target; };
  ov.onclick = e => {
    if (e.target === ov && _nodeOpsMouseDown === ov) _nodeOpsClose();
    _nodeOpsMouseDown = null;
  };
  const w = opts?.wide ? 'width:900px;' : '';
  ov.innerHTML = `<div class="modal" style="${w}max-width:95vw">
    <div class="modal-header"><h2>${title}</h2>
      <button class="close-btn" onclick="_nodeOpsClose()">&#x2715;</button></div>
    <div class="modal-body" id="${bodyId}"></div>
    <div class="modal-footer" id="${bodyId}-footer">${footerHtml}</div></div>`;
  document.body.appendChild(ov);
}

// ---- Helpers ----

function _segOtherNode(seg, nodeId) {
  return seg.nodeA === nodeId ? seg.nodeB : seg.nodeA;
}

// ---- Sticky groups (union-find) ----

function computeStickyGroups(nodeId) {
  const trackSegs = data.segments.filter(s =>
    (s.nodeA === nodeId || s.nodeB === nodeId) && !isInterchange(s));
  if (!trackSegs.length) return [];

  const usage = {};
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const a = svc.stops[i].nodeId, b = svc.stops[i + 1].nodeId;
      if (a !== nodeId && b !== nodeId) continue;
      const seg = findSegByTrack(a, b, svc.stops[i + 1]?.trackId);
      if (seg && !isInterchange(seg)) {
        (usage[seg.id] || (usage[seg.id] = new Set())).add(svc.id);
      }
    }
  }

  const par = {}, rnk = {};
  for (const s of trackSegs) { par[s.id] = s.id; rnk[s.id] = 0; }
  const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (rnk[ra] < rnk[rb]) par[ra] = rb;
    else if (rnk[ra] > rnk[rb]) par[rb] = ra;
    else { par[rb] = ra; rnk[ra]++; }
  };

  const svcToSegs = {};
  for (const [segId, svcIds] of Object.entries(usage)) {
    for (const svcId of svcIds) {
      (svcToSegs[svcId] || (svcToSegs[svcId] = [])).push(segId);
    }
  }
  for (const segIds of Object.values(svcToSegs)) {
    for (let i = 1; i < segIds.length; i++) union(segIds[0], segIds[i]);
  }

  const groups = {};
  for (const s of trackSegs) {
    const root = find(s.id);
    if (!groups[root]) groups[root] = { segIds: [], serviceIds: new Set() };
    groups[root].segIds.push(s.id);
    if (usage[s.id]) for (const sid of usage[s.id]) groups[root].serviceIds.add(sid);
  }
  return Object.values(groups);
}

function nodeCanSplit(nodeId) {
  const groups = computeStickyGroups(nodeId);
  const tc = data.segments.filter(s =>
    (s.nodeA === nodeId || s.nodeB === nodeId) && !isInterchange(s)).length;
  if (tc === 0) return true;
  if (groups.length <= 1 && (groups[0]?.segIds.length || 0) === tc) return false;
  return true;
}

// ---- Merge candidates ----

function nodeMergeCandidates(nodeId) {
  const node = getNode(nodeId);
  if (!node || !isPassengerStop(node)) return [];
  const myDN = nodeDisplayName(nodeId);
  const isiConn = new Set();
  const ichType = {};
  for (const seg of data.segments) {
    if (!isInterchange(seg)) continue;
    if (seg.nodeA === nodeId) { isiConn.add(seg.nodeB); ichType[seg.nodeB] = seg.interchangeType; }
    else if (seg.nodeB === nodeId) { isiConn.add(seg.nodeA); ichType[seg.nodeA] = seg.interchangeType; }
  }
  const res = [];
  for (const o of data.nodes) {
    if (o.id === nodeId || o.type !== node.type) continue;
    const sameName = data.settings?.stripBrackets !== false && nodeDisplayName(o.id) === myDN;
    const ichConn = isiConn.has(o.id);
    if (sameName || ichConn) {
      res.push({ node: o, reason: ichConn ? (ichType[o.id] || 'isi') : 'same_name' });
    }
  }
  return res;
}

function canMerge(thisId, targetId) {
  for (const seg of data.segments) {
    if (isInterchange(seg)) continue;
    const ep = [seg.nodeA, seg.nodeB].sort();
    const mp = [thisId, targetId].sort();
    if (ep[0] === mp[0] && ep[1] === mp[1])
      return { ok: false, reason: t('merge.abort_self_loop') };
  }
  return { ok: true };
}
