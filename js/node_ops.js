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

// ---- Split modal ----

function openSplitModal(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;

  const allSegs = data.segments.filter(s => s.nodeA === nodeId || s.nodeB === nodeId);
  const placements = {};
  for (const s of allSegs) placements[s.id] = 'left';
  const platPlace = {}, platNames = {};
  for (const p of (node.platforms || [])) { platPlace[p.id] = 'left'; platNames[p.id] = p.name; }

  const groups = computeStickyGroups(nodeId);
  const seg2g = {};
  for (let gi = 0; gi < groups.length; gi++)
    for (const sid of groups[gi].segIds) seg2g[sid] = gi;

  _splitState = {
    nodeId,
    left: { name: node.name, refCode: node.refCode || '', ogfNode: node.ogfNode || '',
            address: node.address || '', description: node.description || '' },
    right: { name: '', refCode: node.refCode || '', ogfNode: node.ogfNode || '',
             address: node.address || '', description: node.description || '' },
    segmentPlacements: placements,
    platformPlacements: platPlace,
    platformNames: platNames,
    newPlatforms: [],
    deletedPlatforms: new Set(),
    createISI: false,
    isiDistance: 0.1,
    stickyGroups: groups,
    ichSegs: allSegs.filter(s => isInterchange(s)).map(s => s.id),
    seg2group: seg2g
  };

  _openNodeOpsOverlay(
    esc(t('split.modal_title', { name: node.name })),
    'split-body',
    `<div id="split-error" style="flex:1;color:var(--danger);font-size:13px"></div>
     <button class="btn" onclick="_nodeOpsClose()">${t('btn.cancel')}</button>
     <button class="btn btn-primary" onclick="applySplit()">${t('split.apply_btn')}</button>`,
    { wide: true }
  );
  _renderSplitBody();
}

function _splitSyncInputs() {
  if (!_splitState) return;
  const s = _splitState;
  const v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  const fmap = { name: 'name', refCode: 'ref', ogfNode: 'ogf', address: 'addr', description: 'desc' };
  for (const [f, suf] of Object.entries(fmap)) {
    const lv = v('split-left-' + suf); if (lv !== undefined) s.left[f] = lv;
    const rv = v('split-right-' + suf); if (rv !== undefined) s.right[f] = rv;
  }
  const node = getNode(s.nodeId);
  for (const p of (node.platforms || [])) {
    if (s.deletedPlatforms.has(p.id)) continue;
    const pv = v('split-plat-' + p.id); if (pv !== undefined) s.platformNames[p.id] = pv;
  }
  for (const np of s.newPlatforms) {
    const nv = v('split-np-' + np.id); if (nv !== undefined) np.name = nv;
  }
  const cb = document.getElementById('split-isi-cb');
  if (cb) s.createISI = cb.checked;
  const dv = v('split-isi-dist');
  if (dv !== undefined) s.isiDistance = parseFloat(dv) || 0.1;
}

function _renderSplitBody() {
  const el = document.getElementById('split-body');
  if (el) el.innerHTML = _buildSplitHTML();
}

function _splitFieldInputs(side, vals) {
  const fields = [['name', t('field.name')], ['ref', t('field.ref_code')],
    ['ogf', t('field.ogf_node')], ['addr', t('field.address')], ['desc', t('field.description')]];
  const map = { name: 'name', ref: 'refCode', ogf: 'ogfNode', addr: 'address', desc: 'description' };
  return fields.map(([k, label]) =>
    `<div class="form-group" style="margin-bottom:8px"><label style="font-size:12px">${label}</label>
      <input type="text" id="split-${side}-${k}" value="${esc(vals[map[k]] || '')}"></div>`
  ).join('');
}

function _splitPlatCol(side, node) {
  const s = _splitState;
  const other = side === 'left' ? 'right' : 'left';
  const arrow = side === 'left' ? '\u2192' : '\u2190';
  let h = '';
  const plats = (node.platforms || []).filter(p =>
    !s.deletedPlatforms.has(p.id) && s.platformPlacements[p.id] === side);
  for (const p of plats) {
    h += `<div class="nops-plat-row">
      ${side === 'right' ? `<button class="btn btn-sm" onclick="_splitMovePlat('${p.id}','${other}')">${arrow}</button>` : ''}
      <input type="text" id="split-plat-${p.id}" value="${esc(s.platformNames[p.id] || p.name)}" style="flex:1">
      ${side === 'left' ? `<button class="btn btn-sm" onclick="_splitMovePlat('${p.id}','${other}')">${arrow}</button>` : ''}
      <button class="btn btn-sm btn-danger" onclick="_splitDeletePlat('${p.id}')">&#x2715;</button></div>`;
  }
  const newPlats = s.newPlatforms.filter(p => p.side === side);
  for (const p of newPlats) {
    h += `<div class="nops-plat-row">
      ${side === 'right' ? `<button class="btn btn-sm" onclick="_splitMoveNewPlat('${p.id}','${other}')">${arrow}</button>` : ''}
      <input type="text" id="split-np-${p.id}" value="${esc(p.name)}" style="flex:1">
      ${side === 'left' ? `<button class="btn btn-sm" onclick="_splitMoveNewPlat('${p.id}','${other}')">${arrow}</button>` : ''}
      <button class="btn btn-sm btn-danger" onclick="_splitDeleteNewPlat('${p.id}')">&#x2715;</button></div>`;
  }
  if (!plats.length && !newPlats.length) h += '<div class="text-dim" style="font-size:12px;padding:4px 0">(empty)</div>';
  h += `<button class="btn btn-sm" style="margin-top:4px" onclick="_splitAddPlat('${side}')">+ ${t('btn.add_platform')}</button>`;
  return h;
}

function _splitSegCol(side) {
  const s = _splitState;
  const other = side === 'left' ? 'right' : 'left';
  const arrow = side === 'left' ? '\u2192' : '\u2190';
  let h = '';

  for (let gi = 0; gi < s.stickyGroups.length; gi++) {
    const g = s.stickyGroups[gi];
    const gSide = s.segmentPlacements[g.segIds[0]] || 'left';
    if (gSide !== side) continue;

    if (g.segIds.length === 1) {
      const seg = getSeg(g.segIds[0]); if (!seg) continue;
      const oName = nodeName(_segOtherNode(seg, s.nodeId));
      const svcLabel = g.serviceIds.size ? ' <span class="text-dim" style="font-size:11px">(' +
        esc([...g.serviceIds].map(id => getSvc(id)?.name || '?').slice(0, 3).join(', ')) + ')</span>' : '';
      h += `<div class="nops-seg-row"><span style="flex:1">\u2194 ${esc(oName)}${svcLabel}</span>
        <button class="btn btn-sm" onclick="_splitMoveGroup(${gi},'${other}')">${arrow}</button></div>`;
    } else {
      const svcNames = [...g.serviceIds].map(id => getSvc(id)?.name || '?');
      const svcLabel = svcNames.length > 3 ? svcNames.slice(0, 3).join(', ') + '\u2026' : svcNames.join(', ');
      h += '<div class="nops-sticky-group">';
      h += `<div class="nops-sticky-hdr">${t('split.group_label', { n: gi + 1, services: esc(svcLabel) })}</div>`;
      for (const segId of g.segIds) {
        const seg = getSeg(segId); if (!seg) continue;
        h += `<div style="padding:2px 0 2px 8px;font-size:13px">\u2194 ${esc(nodeName(_segOtherNode(seg, s.nodeId)))}</div>`;
      }
      const moveLabel = side === 'left' ? t('split.move_group_right') : t('split.move_group_left');
      h += `<button class="btn btn-sm" style="margin-top:4px" onclick="_splitMoveGroup(${gi},'${other}')">${moveLabel}</button></div>`;
    }
  }

  for (const segId of s.ichSegs) {
    if (s.segmentPlacements[segId] !== side) continue;
    const seg = getSeg(segId); if (!seg) continue;
    const oName = nodeName(_segOtherNode(seg, s.nodeId));
    const label = (seg.interchangeType || 'ICH').toUpperCase();
    h += `<div class="nops-seg-row"><span style="flex:1">${label} \u2192 ${esc(oName)}</span>
      <button class="btn btn-sm" onclick="_splitMoveSeg('${segId}','${other}')">${arrow}</button></div>`;
  }

  if (!h) h = '<div class="text-dim" style="font-size:12px;padding:4px 0">(empty)</div>';
  return h;
}

function _buildSplitHTML() {
  const s = _splitState;
  const node = getNode(s.nodeId);
  let h = '';
  // Fields
  h += '<div class="nops-cols"><div class="nops-col"><div class="nops-col-hdr">' + t('split.left_header') + '</div>';
  h += _splitFieldInputs('left', s.left);
  h += '</div><div class="nops-col"><div class="nops-col-hdr">' + t('split.right_header') + '</div>';
  h += _splitFieldInputs('right', s.right);
  h += '</div></div>';
  // Platforms
  h += '<div class="nops-sec-hdr">' + t('split.platforms_section') + '</div>';
  h += '<div class="nops-cols"><div class="nops-col">' + _splitPlatCol('left', node) + '</div>';
  h += '<div class="nops-col">' + _splitPlatCol('right', node) + '</div></div>';
  // Segments
  h += '<div class="nops-sec-hdr">' + t('split.segments_section') + '</div>';
  h += '<div class="nops-cols"><div class="nops-col">' + _splitSegCol('left') + '</div>';
  h += '<div class="nops-col">' + _splitSegCol('right') + '</div></div>';
  // Options
  h += '<div class="nops-sec-hdr">' + t('split.options_section') + '</div>';
  h += `<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
    <input type="checkbox" id="split-isi-cb" ${s.createISI ? 'checked' : ''}
      onchange="document.getElementById('split-isi-dist').disabled=!this.checked">
    ${t('split.create_isi')}</label>`;
  h += `<div style="margin-left:24px;display:flex;align-items:center;gap:6px">
    ${t('split.isi_distance')}
    <input type="number" id="split-isi-dist" value="${s.isiDistance}" step="0.01" min="0.01"
      style="width:80px" ${s.createISI ? '' : 'disabled'}> km</div>`;
  // Warnings
  const warnings = _splitComputeWarnings();
  if (warnings.length) {
    h += '<div class="nops-warnings">';
    for (const w of warnings) h += `<div style="color:var(--warn);font-size:13px">\u26A0 ${esc(w)}</div>`;
    h += '</div>';
  }
  return h;
}

// ---- Split interactions ----

function _splitMoveGroup(gi, toSide) {
  _splitSyncInputs();
  for (const sid of _splitState.stickyGroups[gi].segIds)
    _splitState.segmentPlacements[sid] = toSide;
  _renderSplitBody();
}

function _splitMoveSeg(segId, toSide) {
  _splitSyncInputs();
  _splitState.segmentPlacements[segId] = toSide;
  _renderSplitBody();
}

function _splitMovePlat(platId, toSide) {
  _splitSyncInputs();
  _splitState.platformPlacements[platId] = toSide;
  _renderSplitBody();
}

function _splitMoveNewPlat(platId, toSide) {
  _splitSyncInputs();
  const np = _splitState.newPlatforms.find(p => p.id === platId);
  if (np) np.side = toSide;
  _renderSplitBody();
}

function _splitAddPlat(side) {
  _splitSyncInputs();
  const count = _splitState.newPlatforms.length +
    Object.keys(_splitState.platformPlacements).length - _splitState.deletedPlatforms.size;
  _splitState.newPlatforms.push({ id: uid(), name: 'Platform ' + (count + 1), side });
  _renderSplitBody();
}

function _splitDeletePlat(platId) {
  _splitSyncInputs();
  const refs = data.services.filter(s => s.stops.some(st => st.platformId === platId));
  if (refs.length) {
    appConfirm(`This platform is referenced by ${refs.length} service stop(s). Delete anyway?`, () => {
      _splitState.deletedPlatforms.add(platId);
      _renderSplitBody();
    });
  } else {
    _splitState.deletedPlatforms.add(platId);
    _renderSplitBody();
  }
}

function _splitDeleteNewPlat(platId) {
  _splitSyncInputs();
  _splitState.newPlatforms = _splitState.newPlatforms.filter(p => p.id !== platId);
  _renderSplitBody();
}

// ---- Split warnings & validation ----

function _splitComputeWarnings() {
  const s = _splitState;
  const w = [];
  const rightPlats = Object.values(s.platformPlacements).filter(v => v === 'right').length
    + s.newPlatforms.filter(p => p.side === 'right').length;
  const rightSegs = Object.values(s.segmentPlacements).filter(v => v === 'right').length;

  const platSide = {};
  for (const [pid, side] of Object.entries(s.platformPlacements)) {
    if (!s.deletedPlatforms.has(pid)) platSide[pid] = side;
  }
  for (const np of s.newPlatforms) platSide[np.id] = np.side;

  let repointed = 0, unassigned = 0;
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length; i++) {
      if (svc.stops[i].nodeId !== s.nodeId) continue;
      let side = null;
      if (i > 0) {
        const seg = findSegByTrack(svc.stops[i - 1].nodeId, s.nodeId, svc.stops[i]?.trackId);
        if (seg && s.segmentPlacements[seg.id]) side = s.segmentPlacements[seg.id];
      }
      if (side === null && i < svc.stops.length - 1) {
        const seg = findSegByTrack(s.nodeId, svc.stops[i + 1].nodeId, svc.stops[i + 1]?.trackId);
        if (seg && s.segmentPlacements[seg.id]) side = s.segmentPlacements[seg.id];
      }
      if (side === null) side = 'left';
      if (side === 'right') repointed++;
      const pid = svc.stops[i].platformId;
      if (pid && platSide[pid] && platSide[pid] !== side) unassigned++;
    }
  }

  let beckCount = 0;
  if (data.beckmap?.lineStations) {
    for (const sm of Object.values(data.beckmap.lineStations)) { if (sm[s.nodeId]) beckCount++; }
  }

  if (rightPlats > 0) w.push(t('split.warning_platforms_moved', { n: rightPlats }));
  if (unassigned > 0) w.push(t('split.warning_stops_unassigned', { n: unassigned }));
  if (rightSegs > 0) w.push(t('split.warning_segments_moved', { n: rightSegs }));
  if (repointed > 0) w.push(t('split.warning_services_repointed', { n: repointed }));
  if (beckCount > 0) w.push(t('split.warning_beckmap_migrated', { n: beckCount }));
  return w;
}

function _splitValidate() {
  const s = _splitState;
  if (!s.left.name.trim() || !s.right.name.trim()) return t('split.err_name_required');
  if (s.left.name.trim() === s.right.name.trim()) return t('split.err_names_same');
  const hasRight = Object.values(s.segmentPlacements).some(v => v === 'right')
    || Object.values(s.platformPlacements).some(v => v === 'right')
    || s.newPlatforms.some(p => p.side === 'right');
  if (!hasRight) return t('split.err_nothing_split');
  if (s.createISI && s.isiDistance <= 0) return t('split.err_isi_distance');
  return null;
}

// ---- Apply split ----

function applySplit() {
  _splitSyncInputs();
  const err = _splitValidate();
  if (err) { const el = document.getElementById('split-error'); if (el) el.textContent = err; return; }

  const s = _splitState;
  const orig = getNode(s.nodeId);

  // 1. Build platformToSide
  const platSide = {};
  for (const [pid, side] of Object.entries(s.platformPlacements)) {
    if (!s.deletedPlatforms.has(pid)) platSide[pid] = side;
  }
  for (const np of s.newPlatforms) platSide[np.id] = np.side;

  // 2. Precompute service stop decisions BEFORE modifying segments
  const stopDecs = [];
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length; i++) {
      if (svc.stops[i].nodeId !== s.nodeId) continue;
      let side = null;
      if (i > 0) {
        const seg = findSegByTrack(svc.stops[i - 1].nodeId, s.nodeId, svc.stops[i]?.trackId);
        if (seg && s.segmentPlacements[seg.id]) side = s.segmentPlacements[seg.id];
      }
      if (side === null && i < svc.stops.length - 1) {
        const seg = findSegByTrack(s.nodeId, svc.stops[i + 1].nodeId, svc.stops[i + 1]?.trackId);
        if (seg && s.segmentPlacements[seg.id]) side = s.segmentPlacements[seg.id];
      }
      if (side === null) side = 'left';
      stopDecs.push({ svc, idx: i, side });
    }
  }

  // 3. Create right node
  const rightNode = {
    id: uid(), name: s.right.name.trim(), type: orig.type,
    ogfNode: s.right.ogfNode.trim(), refCode: s.right.refCode.trim(),
    address: s.right.address.trim(), description: s.right.description.trim(),
    platforms: [], lat: orig.lat, lon: orig.lon
  };
  data.nodes.push(rightNode);

  // 4. Update left node fields
  Object.assign(orig, {
    name: s.left.name.trim(), ogfNode: s.left.ogfNode.trim(),
    refCode: s.left.refCode.trim(), address: s.left.address.trim(),
    description: s.left.description.trim()
  });

  // 5. Partition platforms
  const leftPlats = [], rightPlats = [];
  for (const p of (orig.platforms || [])) {
    if (s.deletedPlatforms.has(p.id)) continue;
    const pn = s.platformNames[p.id] || p.name;
    (s.platformPlacements[p.id] === 'right' ? rightPlats : leftPlats).push({ id: p.id, name: pn });
  }
  for (const np of s.newPlatforms) {
    (np.side === 'right' ? rightPlats : leftPlats).push({ id: np.id, name: np.name });
  }
  orig.platforms = leftPlats;
  rightNode.platforms = rightPlats;

  // 6. Clean up deleted platform refs
  for (const pid of s.deletedPlatforms) {
    for (const svc of data.services) {
      for (const st of svc.stops) { if (st.platformId === pid) st.platformId = null; }
    }
    for (const dep of data.departures) {
      if (dep.platformOverrides) {
        for (const [idx, dpid] of Object.entries(dep.platformOverrides)) {
          if (dpid === pid) delete dep.platformOverrides[idx];
        }
      }
    }
  }

  // 7. Partition segments
  for (const [segId, side] of Object.entries(s.segmentPlacements)) {
    if (side !== 'right') continue;
    const seg = getSeg(segId);
    if (!seg) continue;
    if (seg.nodeA === orig.id) seg.nodeA = rightNode.id;
    else if (seg.nodeB === orig.id) seg.nodeB = rightNode.id;
  }

  // 8. Apply service stop decisions
  for (const dec of stopDecs) {
    if (dec.side === 'right') {
      dec.svc.stops[dec.idx].nodeId = rightNode.id;
      const pid = dec.svc.stops[dec.idx].platformId;
      if (pid && platSide[pid] !== 'right') dec.svc.stops[dec.idx].platformId = null;
    } else {
      const pid = dec.svc.stops[dec.idx].platformId;
      if (pid && platSide[pid] !== 'left') dec.svc.stops[dec.idx].platformId = null;
    }
  }

  // 9. Update departures
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId);
    if (!svc) continue;
    for (let i = 0; i < dep.times.length; i++) {
      if (dep.times[i].nodeId === orig.id && svc.stops[i]?.nodeId === rightNode.id) {
        dep.times[i].nodeId = rightNode.id;
      }
    }
    if (dep.platformOverrides) {
      for (const [idx, dpid] of Object.entries(dep.platformOverrides)) {
        if (!dpid || !platSide[dpid]) continue;
        const stopNid = svc.stops[parseInt(idx)]?.nodeId;
        const expected = stopNid === rightNode.id ? 'right' : 'left';
        if (platSide[dpid] !== expected) delete dep.platformOverrides[idx];
      }
    }
  }

  // 10. Wipe schematic on original
  delete orig.schematic;

  // 11. Migrate beckmap lineStations
  if (data.beckmap?.lineStations) {
    for (const [gid, sm] of Object.entries(data.beckmap.lineStations)) {
      if (!sm[orig.id]) continue;
      const lineSvcs = data.services.filter(sv => sv.groupId === gid);
      let rc = 0, lc = 0;
      for (const sv of lineSvcs) {
        for (const st of sv.stops) {
          if (st.nodeId === rightNode.id) { rc++; break; }
          if (st.nodeId === orig.id) { lc++; break; }
        }
      }
      if (rc > 0 && lc > 0) {
        sm[rightNode.id] = { ...sm[orig.id] };
      } else if (rc > lc) {
        sm[rightNode.id] = sm[orig.id];
        delete sm[orig.id];
      }
    }
  }

  // 12. Create ISI segment if requested
  if (s.createISI) {
    data.segments.push({
      id: uid(), nodeA: orig.id, nodeB: rightNode.id,
      tracks: [], maxSpeed: 0, distance: s.isiDistance,
      electrification: false, refCode: '', description: '',
      interchangeType: 'isi', ogfWayIds: [], wayGeometry: null, allowedModes: []
    });
  }

  const origId = orig.id;
  _nodeOpsClose();
  save(); refreshAll();
  toast(t('toast.split_done', { name: rightNode.name }), 'success');
  setTimeout(() => showNodeDetail(origId), 150);
}

// ---- Merge modals ----

function openMergeChooser(nodeId) {
  const candidates = nodeMergeCandidates(nodeId);
  if (!candidates.length) return;
  _mergeState = { thisId: nodeId };
  let body = '';
  for (const c of candidates) {
    const rk = c.reason === 'osi' ? 'merge.chooser_reason_osi'
      : c.reason === 'isi' ? 'merge.chooser_reason_isi' : 'merge.chooser_reason_same_name';
    body += `<label style="display:block;padding:8px 4px;cursor:pointer">
      <input type="radio" name="merge-target" value="${c.node.id}" style="margin-right:8px">
      ${esc(c.node.name)} <span class="text-dim" style="font-size:12px">(${t(rk)})</span></label>`;
  }
  _openNodeOpsOverlay(esc(t('merge.chooser_title')), 'merge-chooser-body',
    `<button class="btn" onclick="_nodeOpsClose()">${t('btn.cancel')}</button>
     <button class="btn btn-primary" onclick="_mergeChooserContinue()">${t('merge.chooser_continue')}</button>`, {});
  document.getElementById('merge-chooser-body').innerHTML = body;
}

function _mergeChooserContinue() {
  const sel = document.querySelector('#node-ops-overlay input[name="merge-target"]:checked');
  if (!sel) { toast(t('merge.chooser_no_candidates'), 'error'); return; }
  openMergePreview(_mergeState.thisId, sel.value);
}

function openMergePreview(thisId, targetId) {
  const thisNode = getNode(thisId), targetNode = getNode(targetId);
  if (!thisNode || !targetNode) return;
  _mergeState = { thisId, targetId };
  const check = canMerge(thisId, targetId);

  // Summary counts
  const targetSegs = data.segments.filter(s => s.nodeA === targetId || s.nodeB === targetId);
  const directISI = data.segments.filter(s => isInterchange(s) &&
    ((s.nodeA === thisId && s.nodeB === targetId) || (s.nodeB === thisId && s.nodeA === targetId)));
  const segsToMigrate = targetSegs.length - directISI.length;
  const svcsAffected = data.services.filter(s => s.stops.some(st => st.nodeId === targetId)).length;
  let beckCount = 0;
  if (data.beckmap?.lineStations) {
    for (const sm of Object.values(data.beckmap.lineStations)) { if (sm[targetId]) beckCount++; }
  }
  const targetHasSchem = !!(targetNode.schematic?.tracks?.length);

  // Fields comparison (only show differing fields)
  const fields = [
    { key: 'name', label: t('merge.field_name') },
    { key: 'refCode', label: t('merge.field_ref') },
    { key: 'ogfNode', label: t('merge.field_ogf') },
    { key: 'address', label: t('merge.field_address') },
    { key: 'description', label: t('merge.field_description') }
  ];
  const visFields = fields.filter(f => (thisNode[f.key] || '') !== (targetNode[f.key] || ''));

  let body = '';
  if (visFields.length) {
    body += `<div class="nops-sec-hdr">${t('merge.fields_section')}</div>`;
    body += `<table class="nops-merge-tbl"><thead><tr><th></th><th>${esc(thisNode.name)}</th><th>${esc(targetNode.name)}</th></tr></thead><tbody>`;
    for (const f of visFields) {
      const tv = thisNode[f.key] || '', xv = targetNode[f.key] || '';
      body += `<tr><td style="font-weight:600;white-space:nowrap">${f.label}</td>
        <td><label><input type="radio" name="mf-${f.key}" value="this" checked> ${tv ? esc(tv) : '<span class="text-dim">(empty)</span>'}</label>
          <input type="text" id="mf-this-${f.key}" value="${esc(tv)}" style="width:100%;margin-top:4px"
            oninput="document.querySelector('input[name=mf-${f.key}][value=this]').checked=true"></td>
        <td><label><input type="radio" name="mf-${f.key}" value="target"> ${xv ? esc(xv) : '<span class="text-dim">(empty)</span>'}</label>
          <input type="text" id="mf-target-${f.key}" value="${esc(xv)}" style="width:100%;margin-top:4px"
            oninput="document.querySelector('input[name=mf-${f.key}][value=target]').checked=true"></td></tr>`;
    }
    body += '</tbody></table>';
  }

  // Info sections
  body += `<div class="nops-sec-hdr">${t('merge.platforms_section')}</div>`;
  body += `<div class="text-dim" style="font-size:13px">${t('merge.platforms_desc')}</div>`;
  const allPlats = [...(thisNode.platforms || []).map(p => p.name + ' [1]'),
    ...(targetNode.platforms || []).map(p => p.name + ' [2]')];
  if (allPlats.length) body += '<div style="margin:4px 0 8px;font-size:13px">' + allPlats.map(n => esc(n)).join(', ') + '</div>';

  body += `<div class="nops-sec-hdr">${t('merge.segments_section')}</div>`;
  if (segsToMigrate > 0) body += `<div class="text-dim" style="font-size:13px">${t('merge.segments_desc', { n: segsToMigrate })}</div>`;
  if (directISI.length) body += `<div style="font-size:13px;color:var(--warn)">${t('merge.isi_removal_note', { n: directISI.length })}</div>`;

  if (svcsAffected > 0) {
    body += `<div class="nops-sec-hdr">${t('merge.services_section')}</div>`;
    body += `<div class="text-dim" style="font-size:13px">${t('merge.services_desc', { n: svcsAffected })}</div>`;
  }
  if (targetHasSchem) {
    body += `<div class="nops-sec-hdr">${t('merge.schematic_section')}</div>`;
    body += `<div class="text-dim" style="font-size:13px">${t('merge.schematic_desc')}</div>`;
  }
  if (beckCount > 0) {
    body += `<div class="nops-sec-hdr">${t('merge.beckmap_section')}</div>`;
    body += `<div class="text-dim" style="font-size:13px">${t('merge.beckmap_desc', { n: beckCount })}</div>`;
  }
  if (!check.ok) {
    body += `<div style="margin-top:12px;padding:12px;background:var(--danger-dim);border:1px solid var(--danger);border-radius:var(--radius);color:var(--danger);font-size:13px">${esc(check.reason)}</div>`;
  }

  _openNodeOpsOverlay(esc(t('merge.preview_title', { 'this': thisNode.name, target: targetNode.name })),
    'merge-preview-body',
    `<div id="merge-error" style="flex:1;color:var(--danger);font-size:13px"></div>
     <button class="btn" onclick="_nodeOpsClose()">${t('btn.cancel')}</button>
     <button class="btn btn-primary" ${check.ok ? '' : 'disabled'} onclick="applyMerge()">${t('merge.apply_btn')}</button>`, {});
  document.getElementById('merge-preview-body').innerHTML = body;
}
