// ============================================================
// NODES
// ============================================================
const _nodePrefixMap = {
  name: n => n.name,
  ref: n => n.refCode,
  type: n => n.type,
  platforms: n => n.type === 'station' ? (n.platforms || []).length : null,
  desc: n => n.description,
  address: n => n.address,
  ogf: n => !!n.ogfNode,
  connections: n => connectedNodes(n.id).length,
  placed: n => n.mapX != null,
  schematic: n => !!(n.schematic && n.schematic.tracks && n.schematic.tracks.length > 0),
  line: n => {
    for (const svc of data.services) {
      if (svc.stops.some(st => st.nodeId === n.id)) {
        const g = getGroup(svc.groupId); if (g) return g.name;
      }
    }
    return '';
  }
};
function _nodeFreeText(n, q) {
  const qn = stripDiacritics(q);
  return stripDiacritics(n.name.toLowerCase()).includes(qn) || n.type.includes(q) || stripDiacritics((n.refCode||'').toLowerCase()).includes(qn) || stripDiacritics((n.description||'').toLowerCase()).includes(qn);
}
const _nodeSortDefs = {
  name: n => n.name, ref: n => n.refCode || '', type: n => n.type,
  platforms: n => n.type === 'station' ? (n.platforms || []).length : null,
  connections: n => connectedNodes(n.id).length
};

function renderNodes() {
  initSearchHints('node-search', 'nodes');
  const q = (document.getElementById('node-search')?.value || '');
  const parsed = parseSearchQuery(q);
  let list = data.nodes.filter(n => applySearchQuery(n, parsed, _nodePrefixMap, _nodeFreeText));
  list = applySortable(list, 'nodes', _nodeSortDefs) || list;
  if (!_sortState.nodes) list.sort((a, b) => a.name.localeCompare(b.name));
  const el = document.getElementById('nodes-list');
  detailMapDestroy('dm-node');
  document.getElementById('node-detail').innerHTML = '';

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">◉</div>
      <h3>${t('nodes.empty.title')}</h3><p>${t('nodes.empty.desc')}</p>
      <button class="btn btn-primary" onclick="openNodeModal()">+ Add Node</button></div>`;
    return;
  }
  el.innerHTML = `<table class="data-table"><thead><tr>
    ${sortableHeader('nodes','name',t('common.th.name'))}${sortableHeader('nodes','ref',t('common.th.ref'))}${sortableHeader('nodes','type',t('common.th.type'))}${sortableHeader('nodes','platforms',t('nodes.th.platforms'))}${sortableHeader('nodes','connections',t('nodes.th.connections'))}<th>${t("nodes.th.ogf")}</th><th>${t("nodes.th.coords")}</th><th>${t("nodes.th.schematic")}</th><th></th></tr></thead><tbody>` +
    list.map(n => {
      const conns = connectedNodes(n.id).length;
      const hasOgf = !!n.ogfNode;
      const hasSch = (n.type === 'station' || n.type === 'junction') && n.schematic && n.schematic.tracks && n.schematic.tracks.length > 0;
      return `<tr data-id="${n.id}">
      <td><strong class="clickable" onclick="showNodeDetail('${n.id}')">${esc(n.name)}</strong>${n.description ? `<div class="text-dim" style="font-size:11px;margin-top:1px">${esc(n.description)}</div>` : ''}</td>
      <td class="mono text-dim" style="font-size:11px">${esc(n.refCode || '—')}</td>
      <td><span class="type-badge type-${n.type}">${t('type.'+n.type)}</span></td>
      <td class="mono">${n.type === 'station' ? (n.platforms||[]).length : '—'}</td>
      <td class="mono">${conns}</td>
      <td style="text-align:center">${hasOgf ? '<span title="OGF node linked" style="color:var(--success)">✓</span>' : '<span class="text-muted">—</span>'}</td>
      <td style="text-align:center">${n.lat != null ? '<span title="' + n.lat.toFixed(5) + ', ' + n.lon.toFixed(5) + '" style="color:var(--success)">✓</span>' : '<span class="text-muted">—</span>'}</td>
      <td style="text-align:center">${(n.type==='station' || n.type==='junction') ? (hasSch ? '<span title="Schematic defined" style="color:var(--success)">✓</span>' : '<span class="text-muted">—</span>') : ''}</td>
      <td class="actions-cell">
        <button class="btn btn-sm" onclick="openNodeModal('${n.id}')">${t('common.edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteNode('${n.id}')">✕</button></td>
    </tr>`;
    }).join('') + '</tbody></table>';
}

function showNodeDetail(id) {
  const node = getNode(id);
  if (!node) return;
  highlightEntity(id);
  const el = document.getElementById('node-detail');

  // Find all departures through this node
  const deps = [];
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId);
    if (!svc) continue;
    for (let i = 0; i < dep.times.length; i++) {
      const t = dep.times[i];
      if (t.nodeId === id) {
        const stop = svc.stops[i];
        if (stop?.passThrough) continue; // Don't show pass-throughs
        const last = dep.times[dep.times.length - 1];
        const first = dep.times[0];
        deps.push({
          arrive: t.arrive, depart: t.depart,
          service: svc.name, svcId: svc.id,
          origin: nodeDisplayName(first.nodeId), destination: nodeDisplayName(last.nodeId),
          platform: depPlatName(dep, svc, i)
        });
      }
    }
  }
  deps.sort((a, b) => {
    const aT = (a.depart ?? a.arrive ?? 0), bT = (b.depart ?? b.arrive ?? 0);
    return (aT < DAY_CUTOFF_() ? aT + 1440 : aT) - (bT < DAY_CUTOFF_() ? bT + 1440 : bT);
  });

  // Connected segments (track + interchange)
  const conns = connectedNodes(id);
  const allConns = allConnectedSegments(id);
  const ichConns = allConns.filter(c => c.interchange === 'osi' || c.interchange === 'isi');

  let html = `<div class="detail-panel">
    <h3>${esc(node.name)} ${node.refCode ? `<span class="mono text-dim" style="font-size:12px;margin-left:4px">[${esc(node.refCode)}]</span>` : ''}
    <span class="type-badge type-${node.type}" style="font-size:10px">${t('type.'+node.type)}</span>
    <button class="close-detail" onclick="closeNodeDetail()">✕</button></h3>`;

  const ogfLink = node.ogfNode ? `<a href="https://opengeofiction.net/node/${esc(node.ogfNode)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">OGF ↗</a>` : '';
  const coordStr = (node.lat != null && node.lon != null) ? `<span class="mono" style="font-size:11px">${node.lat.toFixed(5)}, ${node.lon.toFixed(5)}</span>` : '';
  const infoParts = [node.address ? esc(node.address) : '', ogfLink, coordStr].filter(Boolean).join(' · ');
  if (infoParts) html += `<p class="text-dim mb-8" style="font-size:13px">${infoParts}</p>`;
  if (node.description) html += `<p class="text-dim mb-8" style="font-size:13px">${esc(node.description)}</p>`;

  // Link to departure board + Split/Merge
  if (isPassengerStop(node)) {
    const _canSplit = nodeCanSplit(id);
    const _mergeCands = nodeMergeCandidates(id);
    html += `<div class="mb-16"><button class="btn btn-sm" onclick="_departureStationId='${node.id}';setBoardMode('departures');switchTab('departures');document.querySelector('.content').scrollTop=0">\u25A4 ${t('nodes.detail.view_departure_board')}</button> <button class="btn btn-sm" ${_canSplit ? '' : 'disabled title="' + esc(t('nodes.split.btn_disabled_tooltip')) + '"'} onclick="openSplitModal('${id}')">\u2702 ${t('nodes.split.btn')}</button>${_mergeCands.length ? ` <button class="btn btn-sm" onclick="openMergeChooser('${id}')">\u21C4 ${t('nodes.merge.btn')}</button>` : ''}</div>`;
  }

  // Detail map
  const hasGeo = node.lat != null;
  // Find lines through this node for beckmap focus
  const nodeGroupIds = new Set();
  for (const svc of data.services) { if (svc.stops.some(st => st.nodeId === id) && svc.groupId) nodeGroupIds.add(svc.groupId); }
  const hasBeck = detailMapHasBeck(nodeGroupIds);
  html += detailMapContainerHTML('dm-node', hasGeo, hasBeck);

  // Segments
  html += `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('nav.segments')}</strong>`;
  if (conns.length || ichConns.length) {
    html += `<div class="mt-8">`;
    html += conns.map(c => {
      const seg = getSeg(c.segId);
      const road = isRoad(seg);
      const info = road ? `${seg.distance}km · ${seg.maxSpeed}km/h` : `${seg.distance}km · ${seg.maxSpeed}km/h`;
      const style = road
        ? 'background:#1a2a1a;border-color:#6cc070;color:#6cc070'
        : 'background:var(--accent-glow);border-color:var(--accent);color:var(--accent)';
      const typeLabel = road ? ' · Road' : '';
      return `<span class="chip clickable" style="margin:0 4px 4px 0;cursor:pointer;${style}" onclick="switchTab('segments');showSegmentDetail('${c.segId}')">${esc(nodeName(c.nodeId))}${typeLabel} · ${seg.distance}km · ${seg.maxSpeed}km/h</span>`;
    }).join('');
    html += ichConns.map(c => {
      const seg = data.segments.find(s => s.id === c.segId);
      const walkMins = seg ? Math.round(seg.distance / WALKING_SPEED() * 60) : '?';
      const label = seg?.interchangeType?.toUpperCase() || 'ICH';
      return `<span class="chip clickable" style="margin:0 4px 4px 0;cursor:pointer;background:${seg?.interchangeType==='osi'?'#2a1f3d':'#1f2a2a'};border-color:${seg?.interchangeType==='osi'?'#b08ae0':'#7ec8c8'};color:${seg?.interchangeType==='osi'?'#b08ae0':'#7ec8c8'}" onclick="switchTab('segments');showSegmentDetail('${c.segId}')">${esc(nodeName(c.nodeId))} · ${label} · ${walkMins} min</span>`;
    }).join('');
    html += '</div>';
  } else html += `<div class="text-dim mt-8" style="font-size:13px">${t('segments.empty.title')}</div>`;
  html += '</div>';

  html += '<div class="detail-map-clear"></div>';

  // Schematic (stations, junctions, waypoints)
  if ((node.type === 'station' || node.type === 'junction' || node.type === 'waypoint') && conns.length > 0) {
    const sch = node.schematic;
    html += `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('nodes.th.schematic')}</strong>`;
    if (sch && sch.tracks && sch.tracks.length > 0) {
      html += ` <span class="clickable" style="font-size:11px;color:var(--accent);cursor:pointer;margin-left:8px;text-transform:none;font-weight:400" onclick="openSchematicEditor('${id}')">Edit</span>`;
      html += schRenderSVG(node, sch, id);
    } else {
      html += `<div class="mt-8" style="font-size:13px"><span class="clickable" style="color:var(--accent);cursor:pointer" onclick="openSchematicEditor('${id}')">${t('nodes.btn.create_schematic')}</span></div>`;
    }
    html += `</div>`;
  }

  // Schedule
  html += `<div><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('nav.schedule')} (${deps.length})</strong>`;
  if (deps.length) {
    html += `<table class="schedule-table mt-8"><thead><tr><th>${t("departures.th.arrive")}</th><th>${t("departures.th.depart")}</th><th>${t("services.th.service")}</th><th>${t("departures.th.origin_dest")}</th><th>${t("nodes.th.platform")}</th></tr></thead><tbody>` +
      deps.map(d => `<tr>
        <td>${toTime(d.arrive)}</td>
        <td style="color:var(--warn)">${toTime(d.depart)}</td>
        <td><span class="clickable" onclick="showServiceDetail('${d.svcId}')">${esc(d.service)}</span></td>
        <td class="text-dim">${esc(d.origin)} → ${esc(d.destination)}</td>
        <td>${esc(d.platform)}</td>
      </tr>`).join('') + '</tbody></table>';
  } else html += `<div class="text-dim mt-8" style="font-size:13px">${t('segments.empty.no_scheduled_trains')}</div>`;
  html += '</div></div>';

  el.innerHTML = html;
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

  // Init detail map
  if (hasGeo) {
    // Find nearby passenger stops — BFS through junctions/waypoints, tracking segment paths
    const nearbyStops = []; // { node, pathSegs: [seg, ...] }
    const visited = new Set([id]);
    const bfsQueue = connectedNodes(id).map(c => ({ nodeId: c.nodeId, segId: c.segId, pathSegs: [c.segId] }));
    while (bfsQueue.length) {
      const { nodeId: nid, pathSegs } = bfsQueue.shift();
      if (visited.has(nid)) continue;
      visited.add(nid);
      const n = getNode(nid);
      if (!n) continue;
      if (isPassengerStop(n)) { nearbyStops.push({ node: n, pathSegs }); continue; }
      // Non-passenger node — look through it
      for (const c of connectedNodes(nid)) {
        if (!visited.has(c.nodeId)) bfsQueue.push({ nodeId: c.nodeId, segId: c.segId, pathSegs: [...pathSegs, c.segId] });
      }
    }
    const adjEntries = nearbyStops.filter(e => e.node.lat != null);
    detailMapInitGeo('dm-node', map => {
      _dmDrawBackground(map);
      // Highlight segments from focal node toward nearby stops
      for (const entry of adjEntries) {
        const adj = entry.node;
        if (node.lat == null) continue;
        // Find line color from services connecting these nodes
        const lineColors = data.services.filter(s => {
          const stops = s.stops.map(st => st.nodeId);
          return stops.includes(id) && stops.includes(adj.id);
        }).map(s => getGroup(s.groupId)?.color).filter(Boolean);
        // Concatenate segment geometries along the BFS path
        let coords = [];
        for (const segId of entry.pathSegs) {
          const seg = getSeg(segId);
          if (!seg) continue;
          const sc = segmentCoords(seg);
          if (!coords.length) { coords = [...sc]; }
          else {
            // Orient: if last coord of path is closer to sc's end, reverse sc
            const last = coords[coords.length - 1];
            const d0 = _ptDist(last, sc[0]);
            const dE = _ptDist(last, sc[sc.length - 1]);
            const oriented = dE < d0 ? [...sc].reverse() : sc;
            coords.push(...oriented.slice(1));
          }
        }
        if (coords.length < 2) coords = [[node.lat, node.lon], [adj.lat, adj.lon]];
        L.polyline(coords, { color: '#000', weight: 6, opacity: 0.8 }).addTo(map);
        L.polyline(coords, { color: '#fff', weight: 4, opacity: 0.95 }).addTo(map);
      }
      // Adjacent station dots + labels
      for (const entry of adjEntries) { _dmStationDot(map, entry.node, {}); _dmLabel(map, entry.node); }
      // Focal node (large, accent)
      _dmStationDot(map, node, { radius: 9, fill: '#ffc917', stroke: '#000', weight: 3 });
      _dmLabel(map, node);
      _dmFitNodes(map, [node], 14);
    });
    // Collect stops per-service WITH group ID for beckmap per-group edge filtering
    const nodeSvcStopsList = [];
    const nodeSvcNodeIds = new Set([id]);
    for (const svc of data.services) {
      if (svc.stops.some(st => st.nodeId === id)) {
        const stops = svc.stops.map(st => ({ nodeId: st.nodeId, passThrough: !!st.passThrough }));
        nodeSvcStopsList.push({ groupId: svc.groupId, stops });
        stops.forEach(nid => nodeSvcNodeIds.add(nid));
      }
    }
    if (hasBeck) detailMapSetBeck('dm-node', nodeGroupIds, nodeSvcNodeIds, 'service', nodeSvcStopsList, new Set([id]));
  } else if (hasBeck) {
    _detailMaps['dm-node'] = {};
    const nodeSvcStopsList2 = [];
    const nodeSvcNodeIds2 = new Set([id]);
    for (const svc of data.services) {
      if (svc.stops.some(st => st.nodeId === id)) {
        const stops = svc.stops.map(st => ({ nodeId: st.nodeId, passThrough: !!st.passThrough }));
        nodeSvcStopsList2.push({ groupId: svc.groupId, stops });
        stops.forEach(nid => nodeSvcNodeIds2.add(nid));
      }
    }
    detailMapSetBeck('dm-node', nodeGroupIds, nodeSvcNodeIds2, 'service', nodeSvcStopsList2, new Set([id]));
    const svgEl = document.getElementById('dm-node-beck');
    if (svgEl) renderMiniBeck(svgEl, { focusGroupIds: nodeGroupIds, focusNodeIds: nodeSvcNodeIds2, mode: 'service', svcStopsList: nodeSvcStopsList2, focusZoomNodeIds: new Set([id]) });
  }
}

function closeNodeDetail() { detailMapDestroy('dm-node'); document.getElementById('node-detail').innerHTML = ''; }

let _lastNodeType = 'station';

function openNodeModal(id, hField) {
  editingId = id || null;
  const n = id ? getNode(id) : null;
  const defaultPlatCount = getSetting('defaultPlatforms', 2);
  const defaultPlats = !n ? Array.from({length: defaultPlatCount}, (_, i) =>
    `<div class="flex items-center gap-8 mb-8">
      <input type="text" value="Platform ${i + 1}" class="plat-name" style="flex:1">
      <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`).join('') : '';
  const plats = n ? (n.platforms||[]).map(p =>
    `<div class="flex items-center gap-8 mb-8">
      <input type="text" value="${esc(p.name)}" class="plat-name" style="flex:1">
      <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`).join('') : defaultPlats;
  openModal(n ? t('nodes.modal.edit') : t('nodes.modal.add'), `
    <div class="form-row">
      <div class="form-group" style="flex:2"><label>${t('common.field.name')}</label><input type="text" id="f-name" value="${esc(n?.name||'')}" placeholder="e.g. Hemstein Centraal"></div>
      <div class="form-group" style="flex:1"><label>${t('common.field.ref_code')}</label><input type="text" id="f-ref" value="${esc(n?.refCode||'')}" placeholder="${t('nodes.placeholder.eg_ref')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>${t('common.field.type')}</label>
        <select id="f-type" onchange="document.getElementById('plat-sec').style.display=(this.value==='station')?'':'none'">
          ${['station','bus_stop','junction','waypoint','depot','freight_yard'].map(tp =>
            `<option value="${tp}" ${(n ? n.type : _lastNodeType)===tp?'selected':''}>${t('type.'+tp)}</option>`).join('')}
        </select></div>
      <div class="form-group"><label>${t('nodes.field.ogf_node')}</label><input type="text" id="f-ogf" value="${esc(n?.ogfNode||'')}" placeholder="${t('nodes.placeholder.eg_ogf_id')}" oninput="this.value=this.value.replace(/^node\\s+/i,'')"></div>
    </div>
    <div class="form-group"><label>${t('nodes.field.address')}</label><input type="text" id="f-addr" value="${esc(n?.address||'')}"></div>
    <div class="form-group"><label>${t('common.field.description')}</label><input type="text" id="f-ndesc" value="${esc(n?.description||'')}" placeholder="${t('nodes.placeholder.eg_description')}"></div>
    <div id="plat-sec" style="${(n ? n.type === 'station' : _lastNodeType==='station')?'':'display:none'}">
      <div class="form-group"><label>${t('nodes.field.platforms')}</label><div id="plat-list">${plats}</div>
        <button class="btn btn-sm mt-8" onclick="addPlatRow()">${t('nodes.btn.add_platform')}</button></div>
      ${n && n.type === 'station' && connectedNodes(n.id).length > 0 ? `<div class="form-group mt-8"><label>${t("nodes.schematic.station_title")}</label>
        <button class="btn btn-sm" onclick="closeModal();setTimeout(()=>openSchematicEditor('${n.id}'),100)">${n.schematic?.tracks?.length ? t('nodes.btn.edit_schematic') : t('nodes.btn.create_schematic')}</button>
        ${n.schematic?.tracks?.length ? `<span class="text-dim" style="font-size:12px;margin-left:8px">${n.schematic.tracks.length} track${n.schematic.tracks.length!==1?'s':''} defined</span>` : ''}
      </div>` : ''}
    </div>
    ${n && n.type === 'junction' && connectedNodes(n.id).length > 0 ? `<div class="form-group mt-8"><label>${t("nodes.schematic.junction_title")}</label>
      <button class="btn btn-sm" onclick="closeModal();setTimeout(()=>openSchematicEditor('${n.id}'),100)">${n.schematic?.tracks?.length ? t('nodes.btn.edit_schematic') : t('nodes.btn.create_schematic')}</button>
      ${n.schematic?.tracks?.length ? `<span class="text-dim" style="font-size:12px;margin-left:8px">${n.schematic.tracks.length} track${n.schematic.tracks.length!==1?'s':''} defined</span>` : ''}
    </div>` : ''}
    ${n && n.type === 'waypoint' && connectedNodes(n.id).length > 0 ? `<div class="form-group mt-8"><label>${t("nodes.schematic.waypoint_title")}</label>
      <button class="btn btn-sm" onclick="closeModal();setTimeout(()=>openSchematicEditor('${n.id}'),100)">${n.schematic?.tracks?.length ? t('nodes.btn.edit_schematic') : t('nodes.btn.create_schematic')}</button>
      ${n.schematic?.tracks?.length ? `<span class="text-dim" style="font-size:12px;margin-left:8px">${n.schematic.tracks.length} track${n.schematic.tracks.length!==1?'s':''} defined</span>` : ''}
    </div>` : ''}`,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveNode()">${n?t('common.save'):t('nodes.btn.add')}</button>`);
  if (hField) highlightField(hField);
}
function addPlatRow() {
  const list = document.getElementById('plat-list'); const num = list.children.length + 1;
  list.insertAdjacentHTML('beforeend', `<div class="flex items-center gap-8 mb-8">
    <input type="text" value="Platform ${num}" class="plat-name" style="flex:1">
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`);
}
function saveNode() {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { toast(t('nodes.toast.name_required'), 'error'); return; }
  const type = document.getElementById('f-type').value;
  _lastNodeType = type;
  const ogfNode = document.getElementById('f-ogf').value.trim();
  const address = document.getElementById('f-addr').value.trim();
  const refCode = document.getElementById('f-ref').value.trim();
  const description = document.getElementById('f-ndesc').value.trim();
  let platforms = [];
  if (type === 'station') {
    document.querySelectorAll('#plat-list .plat-name').forEach(inp => {
      const pn = inp.value.trim(); if (pn) platforms.push({ id: uid(), name: pn });
    });
  }
  if (editingId) {
    const node = getNode(editingId); const old = node.platforms || [];
    platforms = platforms.map(p => old.find(o => o.name === p.name) || p);
    const ogfChanged = ogfNode && ogfNode !== node.ogfNode;
    Object.assign(node, { name, type, ogfNode, address, refCode, description, platforms });
    // Clean up schematic: remove references to deleted platforms
    if (node.schematic?.tracks) {
      const validPlatIds = new Set(platforms.map(p => p.id));
      for (const trk of node.schematic.tracks) {
        trk.platformIds = (trk.platformIds || []).filter(pid => validPlatIds.has(pid));
      }
    }
    // Auto-fetch coordinates if OGF node changed or coords missing
    if (ogfNode && (ogfChanged || node.lat == null || node.lon == null)) {
      fetchOgfCoords([node]);
    }
    toast(t('nodes.toast.updated'), 'success');
  } else {
    const newNode = { id: uid(), name, type, ogfNode, address, refCode, description, platforms };
    data.nodes.push(newNode);
    if (ogfNode) fetchOgfCoords([newNode]);
    toast(t('nodes.toast.added'), 'success');
  }
  save(); closeModal(); renderNodes(); updateBadges();
}
function deleteNode(id) {
  const n = getNode(id);
  const segCount = data.segments.filter(s => s.nodeA === id || s.nodeB === id).length;
  const svcCount = data.services.filter(s => s.stops.some(st => st.nodeId === id)).length;
  let impact = '';
  if (segCount) impact += `\n• ${segCount} segment${segCount!==1?'s':''} will be removed`;
  if (svcCount) impact += `\n• ${svcCount} service${svcCount!==1?'s':''} will be affected`;
  appConfirm(t('nodes.confirm.delete', { name: n.name }) + (impact ? '\n' + impact : ''), () => {
    data.segments = data.segments.filter(s => s.nodeA !== id && s.nodeB !== id);
    data.services.forEach(s => { s.stops = s.stops.filter(st => st.nodeId !== id); });
    data.departures = data.departures.filter(d => { const svc = getSvc(d.serviceId); return svc && svc.stops.length >= 2; });
    data.nodes = data.nodes.filter(n => n.id !== id);
    save(); renderNodes(); updateBadges(); toast(t('nodes.toast.deleted'), 'success');
  });
}

// ============================================================
// STATION SCHEMATIC EDITOR
// ============================================================
function openSchematicEditor(nodeId) {
  const node = getNode(nodeId); if (!node) return;
  const conns = connectedNodes(nodeId);
  const segIds = conns.map(c => c.segId);

  const sch = node.schematic ? JSON.parse(JSON.stringify(node.schematic)) : { sides: { a: [], b: [] }, tracks: [] };

  // Ensure sides C/D exist
  if (!sch.sides.c) sch.sides.c = [];
  if (!sch.sides.d) sch.sides.d = [];

  // Ensure all connected segments are assigned to a side
  const allSides = ['a', 'b', 'c', 'd'];
  const assigned = new Set(allSides.flatMap(s => sch.sides[s] || []));
  for (const sid of segIds) {
    if (!assigned.has(sid)) sch.sides.a.push(sid);
  }
  // Remove stale segments
  for (const s of allSides) {
    sch.sides[s] = (sch.sides[s] || []).filter(sid => segIds.includes(sid));
  }

  window._schNode = node;
  window._schData = sch;
  schRenderModal(nodeId);
}

function schSegLabel(segId, nodeId) {
  const seg = getSeg(segId); if (!seg) return '?';
  return nodeName(seg.nodeA === nodeId ? seg.nodeB : seg.nodeA);
}

function schRenderModal(nodeId) {
  const node = window._schNode;
  const sch = window._schData;
  const segIds = connectedNodes(nodeId).map(c => c.segId);
  const platforms = node.platforms || [];

  const SIDE_NAMES = { a: t('nodes.schematic.northbound'), b: t('nodes.schematic.southbound'), c: t('nodes.schematic.eastbound'), d: t('nodes.schematic.westbound') };
  const allSides = ['a', 'b', 'c', 'd'];

  // Determine which directions are in use (max 2)
  const usedSides = allSides.filter(s => (sch.sides[s]||[]).length > 0);
  // Available options: currently used sides + unused sides (up to 2 total active)
  const availableSides = usedSides.length < 2 ? allSides : usedSides;

  // Sides table
  let sidesHtml = `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted)">${t('nodes.schematic.segment_directions')}</strong>
    <p class="text-dim" style="font-size:12px;margin:4px 0 8px">${t('nodes.schematic.assign_directions')}</p>
    <table class="schedule-table"><thead><tr><th>${t("services.th.seg_towards")}</th><th>${t("services.th.direction")}</th></tr></thead><tbody>`;
  for (const sid of segIds) {
    const currentSide = allSides.find(s => (sch.sides[s]||[]).includes(sid)) || usedSides[0] || 'a';
    sidesHtml += `<tr><td>${esc(schSegLabel(sid, nodeId))}</td>
      <td><select onchange="schMoveSide('${sid}', this.value)">
        ${availableSides.map(s => `<option value="${s}" ${currentSide === s ? 'selected' : ''}>${SIDE_NAMES[s]}</option>`).join('')}
      </select></td></tr>`;
  }
  sidesHtml += `</tbody></table></div>`;

  // Tracks table — only show the active (used) sides
  const activeSides = usedSides;
  let tracksHtml = `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted)">${t('nodes.schematic.tracks_title')}</strong>
    <p class="text-dim" style="font-size:12px;margin:4px 0 8px">${t('nodes.schematic.track_connections')}</p>`;

  if (sch.tracks.length) {
    tracksHtml += `<div style="overflow-x:auto">`;
    for (let ti = 0; ti < sch.tracks.length; ti++) {
      const trk = sch.tracks[ti];
      const cols = Math.min(activeSides.length, 2);
      tracksHtml += `<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <input type="text" value="${esc(trk.name)}" style="width:100px;font-size:13px;padding:4px 8px;font-weight:600" onchange="window._schData.tracks[${ti}].name=this.value">
          <button class="btn btn-sm btn-danger" onclick="window._schData.tracks.splice(${ti},1);schRenderModal('${nodeId}')" style="margin-left:auto">\u2715 Remove</button>
        </div>`;
      // Render connection checkboxes for all active sides in rows of 2
      for (let si = 0; si < activeSides.length; si += 2) {
        const batch = activeSides.slice(si, si + 2);
        tracksHtml += `<div style="display:grid;grid-template-columns:${'1fr '.repeat(batch.length).trim()};gap:8px;${si > 0 ? 'margin-top:8px' : ''}">`;
        for (const s of batch) {
          const sideKey = 'side' + s.toUpperCase();
          tracksHtml += `<div><label style="font-size:11px;text-transform:uppercase;color:var(--text-muted)">${SIDE_NAMES[s]} connections</label>
            ${schMultiSegSelect(sch.sides[s], trk[sideKey] || [], ti, sideKey, nodeId)}</div>`;
        }
        tracksHtml += `</div>`;
      }
      if (platforms.length) {
        tracksHtml += `<div style="margin-top:8px"><label style="font-size:11px;text-transform:uppercase;color:var(--text-muted)">Platforms</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
            ${platforms.map(p => {
              const checked = trk.platformIds.includes(p.id);
              return `<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="schTogglePlatform(${ti},'${p.id}',this.checked)">${esc(p.name)}</label>`;
            }).join('')}
          </div>
        </div>`;
      }
      tracksHtml += `</div>`;
    }
    tracksHtml += `</div>`;
  } else {
    tracksHtml += `<div class="text-dim" style="font-size:13px">t('nodes.schematic.no_tracks')</div>`;
  }
  tracksHtml += `<button class="btn btn-sm mt-8" onclick="schAddTrack('${nodeId}')">${t('nodes.btn.add_track')}</button></div>`;

  openModal(t('nodes.modal.schematic', { name: node.name }), sidesHtml + tracksHtml,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="schSave('${nodeId}')">${t("nodes.schematic.save_schematic")}</button>`);
}

function schMultiSegSelect(sideSegs, selected, trackIdx, sideKey, nodeId) {
  if (!sideSegs.length) return '<span class="text-dim" style="font-size:12px">No segments on this side</span>';
  let html = '';
  for (const sid of sideSegs) {
    const seg = getSeg(sid);
    const trkArr = Array.isArray(seg?.tracks) ? seg.tracks : [];
    const label = schSegLabel(sid, nodeId);
    if (trkArr.length <= 1) {
      const tid = trkArr[0]?.id || '';
      const checked = (selected || []).some(s => s.segId === sid);
      html += `<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;margin-top:2px">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="schToggleSeg(${trackIdx},'${sideKey}','${sid}','${tid}',this.checked)">${esc(label)}</label>`;
    } else {
      for (const tk of trkArr) {
        const checked = (selected || []).some(s => s.segId === sid && s.trackId === tk.id);
        html += `<label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;margin-top:2px">
          <input type="checkbox" ${checked ? 'checked' : ''} onchange="schToggleSeg(${trackIdx},'${sideKey}','${sid}','${tk.id}',this.checked)">${esc(label)} <span class="text-muted" style="font-size:10px">${esc(tk.name)}</span></label>`;
      }
    }
  }
  return html;
}

function schToggleSeg(trackIdx, sideKey, segId, trackId, checked) {
  const trk = window._schData.tracks[trackIdx];
  if (!trk[sideKey]) trk[sideKey] = [];
  if (checked) {
    if (!trk[sideKey].some(s => s.segId === segId && s.trackId === trackId)) {
      trk[sideKey].push({ segId, trackId });
    }
  } else {
    trk[sideKey] = trk[sideKey].filter(s => !(s.segId === segId && s.trackId === trackId));
  }
}

function schTogglePlatform(trackIdx, platId, checked) {
  const sch = window._schData;
  if (checked) {
    // Remove from any other track first (single-track-per-platform)
    for (let i = 0; i < sch.tracks.length; i++) {
      if (i !== trackIdx) {
        sch.tracks[i].platformIds = (sch.tracks[i].platformIds || []).filter(p => p !== platId);
      }
    }
  }
  const trk = sch.tracks[trackIdx];
  if (!trk.platformIds) trk.platformIds = [];
  if (checked && !trk.platformIds.includes(platId)) trk.platformIds.push(platId);
  if (!checked) trk.platformIds = trk.platformIds.filter(p => p !== platId);
  // Re-render to reflect changes on other tracks
  if (checked) schRenderModal(window._schNode.id);
}

function schMoveSide(segId, side) {
  const sch = window._schData;
  for (const s of ['a','b','c','d']) sch.sides[s] = (sch.sides[s]||[]).filter(x => x !== segId);
  sch.sides[side].push(segId);
  schRenderModal(window._schNode.id);
}

function schAddTrack(nodeId) {
  const sch = window._schData;
  const num = sch.tracks.length + 1;
  sch.tracks.push({ id: uid(), name: `Track ${num}`, sideA: [], sideB: [], platformIds: [] });
  schRenderModal(nodeId);
}

function schSave(nodeId) {
  const node = getNode(nodeId); if (!node) return;
  const sch = window._schData;
  delete sch._hasExtraSides;
  node.schematic = sch;
  save(); closeModal(); showNodeDetail(nodeId);
  toast(t('nodes.toast.schematic_saved'), 'success');
}

function schRenderSVG(node, sch, nodeId) {
  const tracks = sch.tracks || [];
  if (!tracks.length) return '';

  // Layout constants
  const TRACK_SPACING = 48;
  const TRACK_LEN = 300;
  const BRANCH_ZONE = 80;
  const STUB_LEN = 30;
  const SEG_TRACK_GAP = 4;
  const MARGIN_T = 40, MARGIN_B = 25;

  // Determine which 2 directions are used, and which goes left vs right
  // Left preference: West > North > South. The other goes right.
  const LEFT_PREF = ['d', 'a', 'b', 'c']; // preference order for left side
  const usedDirs = ['a','b','c','d'].filter(s => (sch.sides?.[s] || []).length > 0);
  let leftDir = usedDirs.find(d => LEFT_PREF.indexOf(d) <= LEFT_PREF.indexOf(usedDirs.find(x => x !== d))) || usedDirs[0];
  let rightDir = usedDirs.find(d => d !== leftDir) || null;
  // If only one direction, put it on the left
  const sideASegs = sch.sides?.[leftDir] || [];
  const sideBSegs = rightDir ? (sch.sides?.[rightDir] || []) : [];

  const SIDE_NAMES = { a: t('nodes.schematic.northbound'), b: t('nodes.schematic.southbound'), c: t('nodes.schematic.eastbound'), d: t('nodes.schematic.westbound') };
  const leftLabel = SIDE_NAMES[leftDir] || '';
  const rightLabel = rightDir ? (SIDE_NAMES[rightDir] || '') : '';

  // Calculate margins based on longest label
  const segLabel = (sid) => { const s = getSeg(sid); return s ? nodeName(s.nodeA === nodeId ? s.nodeB : s.nodeA) : '?'; };
  const maxLabelA = sideASegs.reduce((max, sid) => Math.max(max, segLabel(sid).length), 0);
  const maxLabelB = sideBSegs.reduce((max, sid) => Math.max(max, segLabel(sid).length), 0);
  const MARGIN_L = Math.max(100, maxLabelA * 7 + 50);
  const MARGIN_R = Math.max(100, maxLabelB * 7 + 50);

  // For multi-track segments, determine how many tracks each segment has
  const segTrackCountById = (sid) => segTrackCount(getSeg(sid));

  // Build platform regions — platforms on different tracks get stacked side-by-side, not overlapping
  // First, collect which track index each platform is on
  const platTrackMap = {}; // platId -> trackIdx
  for (let ti = 0; ti < tracks.length; ti++) {
    for (const pid of (tracks[ti].platformIds || [])) {
      platTrackMap[pid] = ti;
    }
  }

  // Filter to only valid platforms (still exist in node.platforms)
  const validPlatIds = new Set((node.platforms || []).map(p => p.id));

  // Group platforms by track for side-by-side layout
  const platsByTrack = {}; // trackIdx -> [{ id, name }]
  for (const [pid, ti] of Object.entries(platTrackMap)) {
    if (!validPlatIds.has(pid)) continue;
    if (!platsByTrack[ti]) platsByTrack[ti] = [];
    const pName = (node.platforms || []).find(p => p.id === pid)?.name || '?';
    platsByTrack[ti].push({ id: pid, name: pName });
  }

  // Calculate total width needed for platform regions on each track
  const PLAT_MIN_WIDTH = 100;
  let maxPlatsOnTrack = 1;
  for (const plats of Object.values(platsByTrack)) {
    maxPlatsOnTrack = Math.max(maxPlatsOnTrack, plats.length);
  }
  const effectiveTrackLen = Math.max(TRACK_LEN, maxPlatsOnTrack * (PLAT_MIN_WIDTH + 10));

  const totalW = MARGIN_L + STUB_LEN + BRANCH_ZONE + effectiveTrackLen + BRANCH_ZONE + STUB_LEN + MARGIN_R;
  const totalH = MARGIN_T + tracks.length * TRACK_SPACING + MARGIN_B;

  // Base Y position for each track
  const trackY = {};
  tracks.forEach((trk, i) => { trackY[trk.id] = MARGIN_T + i * TRACK_SPACING + 20; });

  // Segment Y positions on each side
  const segYPos = (segs) => {
    const map = {};
    for (const sid of segs) {
      const usedBy = tracks.filter(t => {
        const allTrkSegs = ['A','B','C','D'].flatMap(s => {
          const v = t['side' + s]; return Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : x.segId) : (v ? [typeof v === 'string' ? v : v.segId] : []);
        });
        return allTrkSegs.includes(sid);
      });
      if (usedBy.length) {
        const ys = usedBy.map(t => trackY[t.id]);
        map[sid] = ys.reduce((a, b) => a + b, 0) / ys.length;
      }
    }
    const sorted = Object.entries(map).sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][1] - sorted[i - 1][1] < 18) sorted[i][1] = sorted[i - 1][1] + 18;
    }
    const result = {};
    for (const [sid, y] of sorted) result[sid] = y;
    return result;
  };

  const sideAYMap = segYPos(sideASegs);
  const sideBYMap = segYPos(sideBSegs);

  // X coordinates
  const xStubA = MARGIN_L;
  const xBranchA = MARGIN_L + STUB_LEN;
  const xTrackStart = xBranchA + BRANCH_ZONE;
  const xTrackEnd = xTrackStart + effectiveTrackLen;
  const xBranchB = xTrackEnd;
  const xStubB = xBranchB + BRANCH_ZONE;

  let svg = `<div class="mt-8" style="overflow-x:auto"><svg width="${totalW}" height="${totalH}" style="font-family:var(--font-mono);background:var(--bg);border:1px solid var(--border);border-radius:var(--radius)">`;

  // Compass direction labels at top corners
  if (leftLabel) svg += `<text x="8" y="14" fill="var(--text-muted)" font-size="9" opacity="0.5" text-anchor="start">◁ ${leftLabel}</text>`;
  if (rightLabel) svg += `<text x="${totalW - 8}" y="14" fill="var(--text-muted)" font-size="9" opacity="0.5" text-anchor="end">${rightLabel} ▷</text>`;

  // Draw segment stubs + labels on Side A
  for (const sid of sideASegs) {
    const seg = getSeg(sid);
    const label = seg ? nodeName(seg.nodeA === nodeId ? seg.nodeB : seg.nodeA) : '?';
    const y = sideAYMap[sid] || MARGIN_T + 20;
    const nTracks = segTrackCountById(sid);
    // Draw multi-track stub lines
    for (let t = 0; t < nTracks; t++) {
      const offset = (t - (nTracks - 1) / 2) * SEG_TRACK_GAP;
      svg += `<line x1="${xStubA}" y1="${y + offset}" x2="${xBranchA}" y2="${y + offset}" stroke="var(--text)" stroke-width="2" opacity="0.5"/>`;
    }
    svg += `<text x="${xStubA - 6}" y="${y + 4}" fill="var(--text-dim)" font-size="10" text-anchor="end">← ${esc(label)}</text>`;
  }

  // Draw segment stubs + labels on Side B
  for (const sid of sideBSegs) {
    const seg = getSeg(sid);
    const label = seg ? nodeName(seg.nodeA === nodeId ? seg.nodeB : seg.nodeA) : '?';
    const y = sideBYMap[sid] || MARGIN_T + 20;
    const nTracks = segTrackCountById(sid);
    for (let t = 0; t < nTracks; t++) {
      const offset = (t - (nTracks - 1) / 2) * SEG_TRACK_GAP;
      svg += `<line x1="${xStubB}" y1="${y + offset}" x2="${xStubB + STUB_LEN}" y2="${y + offset}" stroke="var(--text)" stroke-width="2" opacity="0.5"/>`;
    }
    svg += `<text x="${xStubB + STUB_LEN + 6}" y="${y + 4}" fill="var(--text-dim)" font-size="10" text-anchor="start">${esc(label)} →</text>`;
  }

  // Draw platform rectangles (side by side per track)
  for (const [tiStr, plats] of Object.entries(platsByTrack)) {
    const ti = parseInt(tiStr);
    const y = MARGIN_T + ti * TRACK_SPACING + 20;
    const platWidth = (effectiveTrackLen - (plats.length - 1) * 8) / plats.length;
    for (let pi = 0; pi < plats.length; pi++) {
      const px = xTrackStart + pi * (platWidth + 8);
      svg += `<rect x="${px}" y="${y - 16}" width="${platWidth}" height="32" rx="4" fill="var(--accent)" opacity="0.08" stroke="var(--accent)" stroke-width="1" stroke-opacity="0.4"/>`;
      svg += `<text x="${px + platWidth / 2}" y="${y - 20}" fill="var(--accent)" font-size="10" text-anchor="middle" opacity="0.9">${esc(plats[pi].name)}</text>`;
    }
  }

  // Draw tracks
  for (let ti = 0; ti < tracks.length; ti++) {
    const trk = tracks[ti];
    const y = trackY[trk.id];
    // Get track connections for the left and right directions (now {segId, trackNum} objects)
    const getTrkConns = (dir) => {
      if (!dir) return [];
      const key = 'side' + dir.toUpperCase();
      const val = trk[key];
      if (!Array.isArray(val)) return [];
      return val.map(v => typeof v === 'string' ? { segId: v, trackNum: 1 } : v);
    };
    const sideAConns = getTrkConns(leftDir);
    const sideBConns = getTrkConns(rightDir);
    const isTermA = sideAConns.length === 0;
    const isTermB = sideBConns.length === 0;

    // Main track line
    const lineStartX = isTermA ? xTrackStart + 14 : xTrackStart;
    const lineEndX = isTermB ? xTrackEnd - 14 : xTrackEnd;
    svg += `<line x1="${lineStartX}" y1="${y}" x2="${lineEndX}" y2="${y}" stroke="var(--text)" stroke-width="3"/>`;

    // Track name label (below track)
    svg += `<text x="${xTrackStart + effectiveTrackLen / 2}" y="${y + 16}" fill="var(--text-muted)" font-size="9" text-anchor="middle">${esc(trk.name)}</text>`;

    // Terminus bumpers
    if (isTermA) {
      svg += `<line x1="${xTrackStart + 14}" y1="${y - 7}" x2="${xTrackStart + 14}" y2="${y + 7}" stroke="var(--text)" stroke-width="4"/>`;
    }
    if (isTermB) {
      svg += `<line x1="${xTrackEnd - 14}" y1="${y - 7}" x2="${xTrackEnd - 14}" y2="${y + 7}" stroke="var(--text)" stroke-width="4"/>`;
    }

    // Branch lines to Side A segment tracks
    for (const conn of sideAConns) {
      const segY = sideAYMap[conn.segId] || y;
      const cSeg = getSeg(conn.segId);
      const nTracks = segTrackCount(cSeg);
      const tIdx = Array.isArray(cSeg?.tracks) ? cSeg.tracks.findIndex(tk => tk.id === conn.trackId) : 0;
      const offset = (Math.max(0, tIdx) - (nTracks - 1) / 2) * SEG_TRACK_GAP;
      svg += `<line x1="${xBranchA}" y1="${segY + offset}" x2="${xTrackStart}" y2="${y}" stroke="var(--text)" stroke-width="2" opacity="0.5"/>`;
    }

    // Branch lines to Side B segment tracks
    for (const conn of sideBConns) {
      const segY = sideBYMap[conn.segId] || y;
      const cSeg = getSeg(conn.segId);
      const nTracks = segTrackCount(cSeg);
      const tIdx = Array.isArray(cSeg?.tracks) ? cSeg.tracks.findIndex(tk => tk.id === conn.trackId) : 0;
      const offset = (Math.max(0, tIdx) - (nTracks - 1) / 2) * SEG_TRACK_GAP;
      svg += `<line x1="${xTrackEnd}" y1="${y}" x2="${xStubB}" y2="${segY + offset}" stroke="var(--text)" stroke-width="2" opacity="0.5"/>`;
    }
  }

  svg += `</svg></div>`;
  return svg;
}

// ============================================================
// SEGMENTS
// ============================================================
const _segPrefixMap = {
  type: s => s.interchangeType || 'track',
  tracks: s => s.interchangeType ? null : segTrackCount(s),
  speed: s => s.interchangeType ? null : s.maxSpeed,
  dist: s => s.distance,
  elec: s => s.interchangeType ? null : !!s.electrification,
  ref: s => s.refCode,
  desc: s => s.description,
  node: s => nodeName(s.nodeA) + ' ' + nodeName(s.nodeB)
};
function _segFreeText(s, q) {
  const qn = stripDiacritics(q);
  return stripDiacritics(nodeName(s.nodeA).toLowerCase()).includes(qn) || stripDiacritics(nodeName(s.nodeB).toLowerCase()).includes(qn) || stripDiacritics((s.refCode||'').toLowerCase()).includes(qn) || stripDiacritics((s.description||'').toLowerCase()).includes(qn);
}
function _segTraffic(s) {
  if (s.interchangeType) return null;
  let count = 0;
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    for (let i = 0; i < dep.times.length - 1; i++) {
      const from = dep.times[i].nodeId, to = dep.times[i+1].nodeId;
      if ((from === s.nodeA && to === s.nodeB) || (from === s.nodeB && to === s.nodeA)) { count++; break; }
    }
  }
  return count;
}
const _segSortDefs = {
  from: s => nodeName(s.nodeA), to: s => nodeName(s.nodeB),
  tracks: s => s.interchangeType ? null : segTrackCount(s),
  speed: s => s.interchangeType ? null : s.maxSpeed,
  distance: s => s.distance || 0,
  traffic: s => _segTraffic(s)
};

function renderSegments() {
  initSearchHints('segment-search', 'segments');
  const q = (document.getElementById('segment-search')?.value || '');
  const parsed = parseSearchQuery(q);
  let list = data.segments.filter(s => applySearchQuery(s, parsed, _segPrefixMap, _segFreeText));
  list = applySortable(list, 'segments', _segSortDefs);
  const el = document.getElementById('segments-list');
  detailMapDestroy('dm-seg');
  document.getElementById('segment-detail').innerHTML = '';

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">─</div>
      <h3>${t('segments.empty.title')}</h3><p>${t('segments.empty.desc')}</p>
      <button class="btn btn-primary" onclick="openSegmentModal()">+ Add Segment</button></div>`;
    return;
  }
  el.innerHTML = `<table class="data-table"><thead><tr>
    ${sortableHeader('segments','from',t('segments.th.from'))}${sortableHeader('segments','to',t('segments.th.to'))}<th>${t('common.th.type')}</th>${sortableHeader('segments','tracks',t('segments.th.tracks'))}${sortableHeader('segments','speed',t('segments.th.speed'))}${sortableHeader('segments','distance',t('segments.th.distance'))}<th>${t("segments.th.electrification")}</th>${sortableHeader('segments','traffic',t('segments.th.traffic'))}<th></th></tr></thead><tbody>` +
    list.map(s => {
      const ich = isInterchange(s);
      const road = isRoad(s);
      // Count departures using this segment (track + road, not interchanges)
      let traffic = 0;
      if (!ich) {
        for (const dep of data.departures) {
          const svc = getSvc(dep.serviceId); if (!svc) continue;
          for (let i = 0; i < dep.times.length - 1; i++) {
            const from = dep.times[i].nodeId, to = dep.times[i+1].nodeId;
            if ((from === s.nodeA && to === s.nodeB) || (from === s.nodeB && to === s.nodeA)) { traffic++; break; }
          }
        }
      }
      const walkMins = ich ? Math.round(s.distance / WALKING_SPEED() * 60) : 0;
      const typeChip = ich
        ? `<span class="chip" style="font-size:10px;background:${s.interchangeType==='osi'?'#2a1f3d':'#1f2a2a'};color:${s.interchangeType==='osi'?'#b08ae0':'#7ec8c8'}">${s.interchangeType.toUpperCase()}</span>`
        : road
        ? `<span class="chip" style="font-size:10px;background:#3d2a1f;color:#e0a860">ROAD</span>`
        : `<span class="chip" style="font-size:10px;background:var(--accent-glow);color:var(--accent)">${t('segments.seg.type_track_display')}</span>`;
      return `<tr data-id="${s.id}">
      <td><strong class="clickable" onclick="showSegmentDetail('${s.id}')">${esc(nodeName(s.nodeA))}</strong></td>
      <td><strong class="clickable" onclick="showSegmentDetail('${s.id}')">${esc(nodeName(s.nodeB))}</strong></td>
      <td>${typeChip}</td>
      <td class="mono">${ich || road ? '—' : segTrackCount(s)}</td>
      <td class="mono">${ich ? t('segments.detail.walk_time', { n: walkMins }) : s.maxSpeed + ' km/h'}</td>
      <td class="mono">${s.distance} km</td>
      <td>${ich || road ? '—' : (s.electrification?'⚡ '+t('segments.detail.electrified'):t('segments.detail.not_electrified'))}</td>
      <td class="mono">${ich ? '—' : traffic+t('common.per_day')}</td>
      <td class="actions-cell">
        <button class="btn btn-sm" onclick="openSegmentModal('${s.id}')">${t('common.edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSegment('${s.id}')">✕</button></td>
    </tr>`;
    }).join('') + '</tbody></table>';
}

function showSegmentDetail(segId) {
  const seg = data.segments.find(s => s.id === segId); if (!seg) return;
  highlightEntity(segId);
  const el = document.getElementById('segment-detail');
  if (isInterchange(seg)) {
    // Interchange segment detail
    const walkMins = Math.round(seg.distance / WALKING_SPEED() * 60);
    el.innerHTML = `<div class="detail-panel">
      <h3>${esc(nodeName(seg.nodeA))} — ${esc(nodeName(seg.nodeB))}
        <span class="chip" style="font-size:10px;background:${seg.interchangeType==='osi'?'#2a1f3d':'#1f2a2a'};color:${seg.interchangeType==='osi'?'#b08ae0':'#7ec8c8'};margin-left:8px">${seg.interchangeType.toUpperCase()}</span>
        <button class="close-detail" onclick="closeSegmentDetail()">✕</button></h3>
      ${seg.description ? `<p class="text-dim mb-8" style="font-size:13px">${esc(seg.description)}</p>` : ''}
      <div class="flex gap-8 mb-16" style="flex-wrap:wrap">
        <span class="chip">${seg.distance} km</span>
        <span class="chip">${t('segments.detail.walk_time', { n: walkMins })}</span>
        <span class="chip">${seg.interchangeType === 'osi' ? t('segments.seg.osi') : t('segments.seg.isi')}</span>
      </div></div>`;
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    return;
  }

  // Track / Road segment detail

  // Find all departures traversing this segment
  const trains = [];
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    for (let i = 0; i < dep.times.length - 1; i++) {
      const from = dep.times[i], to = dep.times[i+1];
      if ((from.nodeId === seg.nodeA && to.nodeId === seg.nodeB) ||
          (from.nodeId === seg.nodeB && to.nodeId === seg.nodeA)) {
        const first = dep.times[0], last = dep.times[dep.times.length - 1];
        const cat = getCat(svc.categoryId);
        const stopTrackId = svc.stops[i+1]?.trackId || null;
        const tkName = stopTrackId && Array.isArray(seg.tracks) ? seg.tracks.find(tk => tk.id === stopTrackId)?.name : null;
        trains.push({
          depId: dep.id, svcId: svc.id, service: svc.name,
          enter: from.depart, exit: to.arrive,
          direction: `${nodeName(from.nodeId)} → ${nodeName(to.nodeId)}`,
          route: `${nodeName(first.nodeId)} → ${nodeName(last.nodeId)}`,
          catAbbr: cat?.abbreviation || cat?.name || '',
          catColor: svcLineColor(svc),
          trackName: tkName
        });
      }
    }
  }
  trains.sort((a, b) => {
    const aT = a.enter ?? 0, bT = b.enter ?? 0;
    return (aT < DAY_CUTOFF_() ? aT + 1440 : aT) - (bT < DAY_CUTOFF_() ? bT + 1440 : bT);
  });

  const travelMins = travelTime(seg.nodeA, seg.nodeB).toFixed(1);
  const nA = getNode(seg.nodeA), nB = getNode(seg.nodeB);

  // Compute lines using this segment (needed for map + display)
  const segLineIds = new Set();
  for (const svc of data.services) {
    if (!svc.groupId || !getGroup(svc.groupId)) continue;
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const s = findSeg(svc.stops[i].nodeId, svc.stops[i + 1].nodeId);
      if (s && s.id === seg.id) { segLineIds.add(svc.groupId); break; }
    }
  }

  const road = isRoad(seg);
  let html = `<div class="detail-panel">
    <h3>${esc(nodeName(seg.nodeA))} — ${esc(nodeName(seg.nodeB))} ${seg.refCode ? `<span class="mono text-dim" style="font-size:12px;margin-left:4px">[${esc(seg.refCode)}]</span>` : ''}
    ${road ? '<span class="chip" style="font-size:10px;background:#3d2a1f;color:#e0a860;margin-left:8px">ROAD</span>' : ''}
    <button class="close-detail" onclick="closeSegmentDetail()">✕</button></h3>
    ${seg.description ? `<p class="text-dim mb-8" style="font-size:13px">${esc(seg.description)}</p>` : ''}
    <div class="flex gap-8 mb-16" style="flex-wrap:wrap">
      ${road ? '' : `<span class="chip" title="${Array.isArray(seg.tracks) ? seg.tracks.map(tk => tk.name).join(', ') : ''}">${segTrackCount(seg)} track${segTrackCount(seg)>1?'s':''}</span>`}
      ${!road && Array.isArray(seg.tracks) && seg.tracks.length > 0 ? seg.tracks.map(tk => `<span class="chip" style="font-size:10px">${esc(tk.name)}</span>`).join('') : ''}
      <span class="chip">${seg.maxSpeed} km/h</span>
      <span class="chip">${seg.distance} km</span>
      <span class="chip">~${travelMins} min</span>
      ${road ? '' : `<span class="chip">${seg.electrification?'⚡ '+t('segments.detail.electrified'):t('segments.detail.not_electrified')}</span>`}
      ${seg.ogfWayIds?.length ? `<span class="chip" title="${esc(seg.ogfWayIds.join(', '))}">${t('segments.detail.ogf_ways', { n: seg.ogfWayIds.length, pts: seg.wayGeometry?.length || 0 })}</span>` : ''}
      ${seg.allowedModes?.length ? seg.allowedModes.map(mid => { const c = getCat(mid); return c ? `<span class="chip" style="font-size:10px">${esc(c.name)}</span>` : ''; }).join('') : ''}
    </div>
    ${detailMapContainerHTML('dm-seg', nA?.lat != null && nB?.lat != null, detailMapHasBeck(segLineIds))}
    <button class="btn btn-sm mb-16" onclick="promptInsertWaypoint('${segId}')" title="${t('nodes.tooltip.insert_waypoint')}">✂ ${t('nodes.modal.insert_waypoint')}</button>`;
  if (segLineIds.size) {
    const segLines = [...segLineIds].map(gid => getGroup(gid)).filter(Boolean);
    html += `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('nav.lines')}</strong>
      <div class="flex gap-8 mt-8" style="flex-wrap:wrap">
      ${segLines.map(g => `<span class="chip clickable" onclick="switchTab('lines');showLineDetail('${g.id}')"><span class="dot" style="background:${g.color||'var(--text-muted)'}"></span>${esc(g.name)}</span>`).join('')}
      </div></div>`;
  }

  html += '<div class="detail-map-clear"></div>';
  html += `<strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('segments.detail.services_using')}</strong>`;

  // Collect unique services that traverse this segment
  const svcSet = new Map();
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const a = svc.stops[i].nodeId, b = svc.stops[i+1].nodeId;
      if ((a === seg.nodeA && b === seg.nodeB) || (a === seg.nodeB && b === seg.nodeA)) {
        if (!svcSet.has(svc.id)) {
          const cat = getCat(svc.categoryId);
          const depCount = data.departures.filter(d => d.serviceId === svc.id).length;
          const stopTkId = svc.stops[i+1]?.trackId;
          const tkName = stopTkId && Array.isArray(seg.tracks) ? seg.tracks.find(tk => tk.id === stopTkId)?.name : null;
          svcSet.set(svc.id, { svc, cat, depCount,
            direction: `${nodeName(a)} → ${nodeName(b)}`,
            route: `${nodeName(svc.stops[0].nodeId)} → ${nodeName(svc.stops[svc.stops.length-1].nodeId)}`,
            trackName: tkName
          });
        }
      }
    }
  }

  const hasMultiTrack = segTrackCount(seg) > 1;
  if (svcSet.size) {
    html += `<table class="schedule-table mt-8 mb-16"><thead><tr><th>Service</th><th>Cat.</th>${hasMultiTrack ? '<th>Track</th>' : ''}<th>${t("services.th.route")}</th><th>${t("services.th.direction")}</th><th>${t("departures.th.depart")}</th></tr></thead><tbody>` +
      Array.from(svcSet.values()).map(s => `<tr>
        <td><span class="clickable" onclick="showServiceDetail('${s.svc.id}')">${esc(s.svc.name)}</span></td>
        <td>${s.cat ? `<span class="chip" style="font-size:10px"><span class="dot" style="background:${svcLineColor(s.svc)}"></span>${esc(s.cat.abbreviation||s.cat.name)}</span>` : '—'}</td>
        ${hasMultiTrack ? `<td class="mono" style="font-size:11px">${s.trackName ? esc(s.trackName) : '—'}</td>` : ''}
        <td class="text-dim" style="font-size:12px">${esc(s.route)}</td>
        <td class="text-dim" style="font-size:12px">${esc(s.direction)}</td>
        <td class="mono">${s.depCount}</td>
      </tr>`).join('') + '</tbody></table>';
  } else html += '<div class="text-dim mt-8 mb-16" style="font-size:13px">No services use this segment.</div>';

  html += `<strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">Trains on this segment (${trains.length})</strong>`;

  if (trains.length) {
    html += `<table class="schedule-table mt-8"><thead><tr><th>Enter</th><th>Exit</th><th>Cat.</th><th>Service</th>${hasMultiTrack ? '<th>Track</th>' : ''}<th>${t("services.th.direction")}</th><th>${t("services.th.route")}</th></tr></thead><tbody>` +
      trains.map(t => `<tr>
        <td style="color:var(--warn)">${toTime(t.enter)}</td>
        <td>${toTime(t.exit)}</td>
        <td><span class="chip" style="font-size:10px"><span class="dot" style="background:${t.catColor}"></span>${esc(t.catAbbr)}</span></td>
        <td><span class="clickable" onclick="showServiceDetail('${t.svcId}')">${esc(t.service)}</span></td>
        ${hasMultiTrack ? `<td class="mono" style="font-size:11px">${t.trackName ? esc(t.trackName) : '—'}</td>` : ''}
        <td class="text-dim">${esc(t.direction)}</td>
        <td class="text-dim" style="font-size:11px">${esc(t.route)}</td>
      </tr>`).join('') + '</tbody></table>';
  } else html += '<div class="text-dim mt-8" style="font-size:13px">No trains scheduled.</div>';
  html += '</div>';

  el.innerHTML = html;
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

  // Init detail map for track/road segments
  if (nA?.lat != null && nB?.lat != null) {
    const segLines = [...segLineIds].map(gid => getGroup(gid)).filter(Boolean);
    const segColor = segLines.length ? segLines[0].color : '#ffc917';
    const _seg = seg, _segA = nA, _segB = nB, _segColor = segColor || '#ffc917', _segId = seg.id;
    detailMapInitGeo('dm-seg', map => {
      _dmDrawBackground(map, [_segId]);
      L.polyline(segmentCoords(_seg), { color: _segColor, weight: 6, opacity: 1 }).addTo(map);
      _dmStationDot(map, _segA, { radius: 8, fill: '#fff', stroke: '#222', weight: 3 });
      _dmStationDot(map, _segB, { radius: 8, fill: '#fff', stroke: '#222', weight: 3 });
      _dmLabel(map, _segA); _dmLabel(map, _segB);
      _dmFitNodes(map, [_segA, _segB], 15);
    });
    if (detailMapHasBeck(segLineIds)) detailMapSetBeck('dm-seg', segLineIds, new Set([seg.nodeA, seg.nodeB]), 'segment');
  } else if (detailMapHasBeck(segLineIds)) {
    _detailMaps['dm-seg'] = {};
    detailMapSetBeck('dm-seg', segLineIds, new Set([seg.nodeA, seg.nodeB]), 'segment');
    const svgEl = document.getElementById('dm-seg-beck');
    if (svgEl) renderMiniBeck(svgEl, { focusGroupIds: segLineIds, focusNodeIds: new Set([seg.nodeA, seg.nodeB]), mode: 'segment' });
  }
}

function closeSegmentDetail() { detailMapDestroy('dm-seg'); document.getElementById('segment-detail').innerHTML = ''; }

// Sticky segment defaults — remembered per segment type
let _lastSegType = ''; // '' = track, 'road', 'osi'
const _lastSegDefaults = {
  track: { trackCount: 2, maxSpeed: '', electrification: true, refCode: '' },
  road: { maxSpeed: '', refCode: '' },
  interchange: { ichType: 'osi' }
};

function addSegTrackRow() {
  const list = document.getElementById('seg-track-list'); const num = list.children.length + 1;
  list.insertAdjacentHTML('beforeend', `<div class="flex items-center gap-8 mb-4">
    <input type="text" value="Track ${num}" class="seg-track-name" style="flex:1">
    <button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`);
}
function segTypeChanged(val) {
  const trackFields = document.getElementById('seg-track-fields');
  const ichFields = document.getElementById('seg-interchange-fields');
  const tracksGroup = document.getElementById('seg-tracks-group');
  const elecGroup = document.getElementById('seg-elec-group');
  if (val === 'osi') {
    trackFields.style.display = 'none';
    ichFields.style.display = '';
  } else {
    trackFields.style.display = '';
    ichFields.style.display = 'none';
    // Road: hide tracks + electrification; Track: show all
    tracksGroup.style.display = val === 'road' ? 'none' : '';
    elecGroup.style.display = val === 'road' ? 'none' : '';
  }
}

function openSegmentModal(id, hField) {
  editingId = id || null;
  const s = id ? getSeg(id) : null;
  // Determine type for the dropdown
  const segTypeVal = s ? (s.interchangeType || '') : _lastSegType;
  const isInterchange = s ? (s.interchangeType || '') : _lastSegType;
  // Resolve defaults: editing uses segment values, new uses sticky per-type defaults
  const td = _lastSegDefaults.track;
  const rd = _lastSegDefaults.road;
  const id_ = _lastSegDefaults.interchange;
  const defTrackCount = s ? segTrackCount(s) : (td.trackCount ?? 2);
  const defTrackRows = s && Array.isArray(s.tracks) ? s.tracks.map(tk =>
    `<div class="flex items-center gap-8 mb-4"><input type="text" value="${esc(tk.name)}" class="seg-track-name" style="flex:1" data-tid="${esc(tk.id)}"><button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`).join('')
    : Array.from({length: defTrackCount}, (_, i) =>
    `<div class="flex items-center gap-8 mb-4"><input type="text" value="Track ${i+1}" class="seg-track-name" style="flex:1"><button class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">✕</button></div>`).join('');
  const defSpeed = s?.maxSpeed ?? (segTypeVal === 'road' ? rd.maxSpeed : td.maxSpeed) ?? '';
  const defElec = s ? s.electrification : td.electrification;
  const defRef = s?.refCode ?? (segTypeVal === 'road' ? rd.refCode : td.refCode) ?? '';
  const defIchType = s?.interchangeType ?? id_.ichType ?? 'osi';
  openModal(s ? t('segments.modal.edit') : t('segments.modal.add'), `
    <div class="form-group"><label>${t('segments.field.segment_type')}</label>
      <select id="f-sType" onchange="segTypeChanged(this.value)">
        <option value="" ${!isInterchange?'selected':''}>${t('segments.seg.track_segment')}</option>
        <option value="road" ${isInterchange==='road'?'selected':''}>${t('segments.seg.road_segment')}</option>
        <option value="osi" ${isInterchange==='osi'||isInterchange==='isi'?'selected':''}>${t('segments.seg.walking_interchange')}</option>
      </select></div>
    <div class="form-row">
      <div class="form-group"><label>${t('segments.field.from_node')}</label><div id="seg-node-a-picker"></div></div>
      <div class="form-group"><label>${t('segments.field.to_node')}</label><div id="seg-node-b-picker"></div></div>
    </div>
    <div id="seg-track-fields" style="${isInterchange==='osi'||isInterchange==='isi'?'display:none':''}">
      <div class="form-row">
        <div class="form-group"><label>${t('segments.field.max_speed')}</label><input type="number" id="f-sSp" value="${defSpeed}" min="1"></div>
        <div class="form-group"><label>${t('segments.field.distance')}</label><input type="number" id="f-sDi" value="${s?.distance||''}" min="0.1" step="0.1"></div>
      </div>
      <div class="form-row">
        <div class="form-group" id="seg-elec-group" style="${segTypeVal === 'road' ? 'display:none' : ''}">
          <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:13px;color:var(--text);">
            <input type="checkbox" id="f-sEl" ${defElec?'checked':''}>${t('segments.field.electrified')}</label>
        </div>
        <div class="form-group"><label>${t('common.field.ref_code')}</label><input type="text" id="f-sRef" value="${esc(s ? (s.refCode||'') : defRef)}" placeholder="${t('segments.placeholder.eg_ref')}"></div>
      </div>
      <div class="form-group">
        <label>${t('segments.field.ogf_way_ids')}</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="f-sOgfWays" value="${esc(s?.ogfWayIds?.length ? s.ogfWayIds.join(', ') : '')}" placeholder="${t('segments.placeholder.eg_ogf_ways')}" style="flex:1" oninput="this.value=this.value.replace(/\\bway\\s*/gi,'')">
          <button type="button" class="btn btn-sm" onclick="fetchSegWayGeometry()">Fetch</button>
        </div>
        <p class="text-dim" style="font-size:11px;margin-top:4px" id="seg-way-status">${s?.wayGeometry?.length ? t('segments.detail.ogf_ways', { n: s.ogfWayIds?.length || '?', pts: s.wayGeometry.length }) : ''}</p>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);margin-top:6px;cursor:pointer;text-transform:none;font-weight:400">
          <input type="checkbox" id="f-sAutoTrim" checked>${t('segments.field.auto_trim')}</label>
      </div>
      ${data.categories.length ? `<div class="form-group">
        <label>${t('segments.field.allowed_modes')}</label>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${data.categories.map(c => {
          const checked = s?.allowedModes?.length ? s.allowedModes.includes(c.id) : false;
          return `<label style="font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer">
            <input type="checkbox" class="seg-allowed-mode" value="${c.id}" ${checked?'checked':''}>${esc(c.name)}</label>`;
        }).join('')}</div>
        <p class="text-dim" style="font-size:11px;margin-top:4px">${t('segments.field.allowed_modes_help')}</p>
      </div>` : ''}
      <div class="form-group" id="seg-tracks-group" style="${segTypeVal === 'road' ? 'display:none' : ''}">
        <label>${t('segments.field.tracks')}</label>
        <div id="seg-track-list">${segTypeVal === 'road' ? '' : defTrackRows}</div>
        <button type="button" class="btn btn-sm mt-4" onclick="addSegTrackRow()">+ ${t('nodes.btn.add_track')}</button>
      </div>
    </div>
    <div id="seg-interchange-fields" style="${isInterchange==='osi'||isInterchange==='isi'?'':'display:none'}">
      <div class="form-group"><label>${t('segments.field.interchange_type')}</label>
        <div class="flex gap-4">
          <button class="btn btn-sm" id="btn-ich-osi" onclick="document.getElementById('f-sIchType').value='osi';document.getElementById('btn-ich-osi').style.cssText='background:var(--accent);border-color:var(--accent);color:#fff';document.getElementById('btn-ich-isi').style.cssText=''" style="${!isInterchange||isInterchange==='osi'?'background:var(--accent);border-color:var(--accent);color:#fff':''}">${t('segments.seg.osi')}</button>
          <button class="btn btn-sm" id="btn-ich-isi" onclick="document.getElementById('f-sIchType').value='isi';document.getElementById('btn-ich-isi').style.cssText='background:var(--accent);border-color:var(--accent);color:#fff';document.getElementById('btn-ich-osi').style.cssText=''" style="${isInterchange==='isi'?'background:var(--accent);border-color:var(--accent);color:#fff':''}">${t('segments.seg.isi')}</button>
        </div>
        <input type="hidden" id="f-sIchType" value="${s?.interchangeType || defIchType}">
      </div>
      <div class="form-group"><label>${t('segments.field.walk_distance')}</label><input type="number" id="f-sIDi" value="${isInterchange ? (s?.distance||'') : ''}" min="0.01" step="0.01" placeholder="${t('segments.placeholder.eg_walk_dist')}"></div>
      <p class="text-dim" style="font-size:12px;margin-top:4px">Walking time: <strong id="walk-time-label">—</strong></p>
    </div>
    <div class="form-group"><label>${t('common.field.description')}</label><input type="text" id="f-sDesc" value="${esc(s?.description||'')}" placeholder="${isInterchange ? 'e.g. Underground passage between stations' : 'e.g. Double-track mainline through river valley'}"></div>`,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveSegment()">${s?t('common.save'):t('segments.btn.add')}</button>`);
  if (hField) highlightField(hField);
  segTypeChanged(document.getElementById('f-sType').value);

  // Init way geometry temp state (preserve existing if editing)
  window._segWayGeometry = s?.wayGeometry || null;

  // Walk time calculator
  const walkInput = document.getElementById('f-sIDi');
  if (walkInput) {
    const updateWalk = () => {
      const d = parseFloat(walkInput.value);
      const label = document.getElementById('walk-time-label');
      if (d > 0 && label) { const mins = Math.round(d / WALKING_SPEED() * 60); label.textContent = mins + ' min'; }
      else if (label) label.textContent = '—';
    };
    walkInput.addEventListener('input', updateWalk);
    updateWalk();
  }

  const segEnterA = () => { const el = document.getElementById('np-segB-input'); if (el) { el.style.display = ''; el.focus(); } };
  const segEnterB = () => { const el = document.getElementById('np-segB-input'); if (el) el.blur(); };
  const trackFilter = n => n.type !== 'bus_stop';
  const roadFilter = n => n.type === 'bus_stop' || n.type === 'junction' || n.type === 'waypoint';
  const ichFilter = n => isPassengerStop(n);
  const getFilter = (type) => type === 'osi' || type === 'isi' ? ichFilter : type === 'road' ? roadFilter : trackFilter;
  createNodePicker({ containerId: 'seg-node-a-picker', pickerId: 'np-segA', placeholder: 'Search nodes...', selectedId: s?.nodeA || null,
    filterFn: getFilter(segTypeVal), onEnterSelect: segEnterA });
  createNodePicker({ containerId: 'seg-node-b-picker', pickerId: 'np-segB', placeholder: 'Search nodes...', selectedId: s?.nodeB || null,
    filterFn: getFilter(segTypeVal), onEnterSelect: segEnterB });

  // Recreate pickers when segment type changes
  const typeSelect = document.getElementById('f-sType');
  typeSelect.addEventListener('change', () => {
    const prevA = nodePickerGetValue('np-segA'), prevB = nodePickerGetValue('np-segB');
    createNodePicker({ containerId: 'seg-node-a-picker', pickerId: 'np-segA', placeholder: 'Search nodes...', selectedId: prevA || null,
      filterFn: getFilter(typeSelect.value), onEnterSelect: segEnterA });
    createNodePicker({ containerId: 'seg-node-b-picker', pickerId: 'np-segB', placeholder: 'Search nodes...', selectedId: prevB || null,
      filterFn: getFilter(typeSelect.value), onEnterSelect: segEnterB });
  });
}
async function fetchSegWayGeometry() {
  const raw = (document.getElementById('f-sOgfWays')?.value || '').replace(/\bway\s+/gi, '');
  const ids = raw.split(/[,\n\s]+/).map(s => parseInt(s.trim())).filter(n => n > 0);
  if (!ids.length) { toast(t('segments.toast.way_fetch_none'), 'error'); return false; }
  toast(t('segments.toast.way_fetching'), 'success');
  try {
    const result = await fetchWayGeometry(ids);
    if (!result || !result.coords?.length) { toast(t('segments.toast.way_fetch_none'), 'error'); return false; }
    let coords = result.coords;

    // Auto-trim: snap endpoints to polyline and slice
    const autoTrim = document.getElementById('f-sAutoTrim')?.checked;
    if (autoTrim) {
      const nAId = nodePickerGetValue('np-segA'), nBId = nodePickerGetValue('np-segB');
      const nA = nAId ? getNode(nAId) : null, nB = nBId ? getNode(nBId) : null;
      if (nA?.lat != null && nB?.lat != null) {
        const snapA = _snapToPolyline([nA.lat, nA.lon], coords);
        const snapB = _snapToPolyline([nB.lat, nB.lon], coords);
        // Warn if snap distance > 50m
        if (snapA.dist > 0.05) toast(t('segments.toast.snap_warn', { name: nA.name, m: Math.round(snapA.dist * 1000) }), 'error');
        if (snapB.dist > 0.05) toast(t('segments.toast.snap_warn', { name: nB.name, m: Math.round(snapB.dist * 1000) }), 'error');
        coords = _slicePolyline(coords, snapA, snapB);
      }
    }

    window._segWayGeometry = coords;
    // Auto-fill distance and speed only if empty (preserve user-entered values)
    const km = haversineDistance(coords);
    const distInput = document.getElementById('f-sDi');
    if (distInput && !parseFloat(distInput.value)) distInput.value = km;
    if (result.maxSpeed) {
      const speedInput = document.getElementById('f-sSp');
      if (speedInput && !parseInt(speedInput.value)) speedInput.value = result.maxSpeed;
    }
    if (result.speedsConflict) {
      toast(t('segments.toast.way_speed_conflict'), 'error');
    }
    // Update status label
    const status = document.getElementById('seg-way-status');
    if (status) status.textContent = t('segments.toast.way_fetch_ok', { n: coords.length, km });
    toast(t('segments.toast.way_fetch_ok', { n: coords.length, km }), 'success');
    return true;
  } catch (err) {
    console.error('Way fetch error:', err);
    toast(t('segments.toast.way_fetch_error', { msg: err.message }), 'error');
    return false;
  }
}
async function saveSegment() {
  const nodeA = nodePickerGetValue('np-segA'), nodeB = nodePickerGetValue('np-segB');
  if (!nodeA || !nodeB) { toast(t('nodes.toast.select_both_nodes'), 'error'); return; }
  if (nodeA === nodeB) { toast(t('nodes.toast.nodes_must_differ'), 'error'); return; }
  const segType = document.getElementById('f-sType').value;
  _lastSegType = segType;
  const description = document.getElementById('f-sDesc').value.trim();

  // Collect allowed modes (empty = all allowed)
  const allowedModes = [];
  document.querySelectorAll('.seg-allowed-mode:checked').forEach(cb => allowedModes.push(cb.value));

  // Auto-fetch way geometry if IDs present but not yet fetched
  if (segType !== 'osi') {
    const wayRaw = (document.getElementById('f-sOgfWays')?.value || '').replace(/\bway\s+/gi, '');
    const hasWayIds = wayRaw.split(/[,\n\s]+/).some(s => parseInt(s.trim()) > 0);
    if (hasWayIds && !window._segWayGeometry) {
      await fetchSegWayGeometry();
    }
  }

  if (segType === 'osi') {
    // Interchange segment
    const distance = parseFloat(document.getElementById('f-sIDi').value) || 0;
    if (distance <= 0) { toast(t('nodes.toast.walk_dist_positive'), 'error'); return; }
    const ichType = document.getElementById('f-sIchType')?.value || 'osi';
    _lastSegDefaults.interchange.ichType = ichType;
    const existing = editingId ? getSeg(editingId) : null;
    const obj = { nodeA, nodeB, distance, interchangeType: ichType, tracks: existing?.tracks || [], maxSpeed: existing?.maxSpeed || 0, electrification: existing?.electrification || false, refCode: existing?.refCode || '', description };
    if (editingId) { Object.assign(getSeg(editingId), obj); toast(t('nodes.toast.interchange_updated'), 'success'); }
    else { data.segments.push({ id: uid(), ...obj }); toast(t('nodes.toast.interchange_added'), 'success'); }
  } else if (segType === 'road') {
    // Road segment
    const maxSpeed = parseInt(document.getElementById('f-sSp').value) || 50;
    const distance = parseFloat(document.getElementById('f-sDi').value) || 0;
    if (distance <= 0) { toast(t('segments.toast.dist_positive'), 'error'); return; }
    if (maxSpeed < 1) { toast(t('segments.toast.speed_positive'), 'error'); return; }
    const refCode = document.getElementById('f-sRef').value.trim();
    _lastSegDefaults.road.maxSpeed = maxSpeed;
    _lastSegDefaults.road.refCode = refCode;
    const ogfWayIds = (document.getElementById('f-sOgfWays')?.value || '').replace(/\bway\s+/gi, '').split(/[,\n\s]+/).map(s => parseInt(s.trim())).filter(n => n > 0);
    const wayGeometry = window._segWayGeometry || (editingId ? getSeg(editingId)?.wayGeometry : null) || null;
    const obj = { nodeA, nodeB, tracks: [], maxSpeed, distance, electrification: false, refCode, description, interchangeType: 'road', ogfWayIds, wayGeometry, allowedModes };
    if (editingId) { Object.assign(getSeg(editingId), obj); toast(t('segments.toast.updated'), 'success'); }
    else { data.segments.push({ id: uid(), ...obj }); toast(t('segments.toast.added'), 'success'); }
  } else {
    // Track segment — collect named tracks from list editor
    const existing = editingId ? getSeg(editingId) : null;
    const tracks = [];
    document.querySelectorAll('#seg-track-list .seg-track-name').forEach((inp, idx) => {
      const name = inp.value.trim(); if (!name) return;
      const tid = inp.dataset.tid || (existing?.tracks?.[idx]?.id) || uid();
      tracks.push({ id: tid, name });
    });
    if (tracks.length < 1) { toast(t('segments.toast.tracks_min_one'), 'error'); return; }
    const maxSpeed = parseInt(document.getElementById('f-sSp').value) || 120;
    const distance = parseFloat(document.getElementById('f-sDi').value) || 0;
    if (distance <= 0) { toast(t('segments.toast.dist_positive'), 'error'); return; }
    if (maxSpeed < 1) { toast(t('segments.toast.speed_positive'), 'error'); return; }
    const electrification = document.getElementById('f-sEl').checked;
    const refCode = document.getElementById('f-sRef').value.trim();
    _lastSegDefaults.track = { trackCount: tracks.length, maxSpeed, electrification, refCode };
    const ogfWayIds = (document.getElementById('f-sOgfWays')?.value || '').replace(/\bway\s+/gi, '').split(/[,\n\s]+/).map(s => parseInt(s.trim())).filter(n => n > 0);
    const wayGeometry = window._segWayGeometry || (editingId ? getSeg(editingId)?.wayGeometry : null) || null;
    const obj = { nodeA, nodeB, tracks, maxSpeed, distance, electrification, refCode, description, interchangeType: null, ogfWayIds, wayGeometry, allowedModes };
    if (editingId) { Object.assign(getSeg(editingId), obj); toast(t('segments.toast.updated'), 'success'); }
    else { data.segments.push({ id: uid(), ...obj }); toast(t('segments.toast.added'), 'success'); }
  }
  save(); closeModal(); renderSegments(); updateBadges();
}
function deleteSegment(id) {
  const seg = getSeg(id);
  const segName = seg ? nodeName(seg.nodeA) + ' \u2014 ' + nodeName(seg.nodeB) : '?';
  const svcCount = data.services.filter(s => {
    for (let i = 0; i < s.stops.length - 1; i++) { const fs = findSeg(s.stops[i].nodeId, s.stops[i+1].nodeId); if (fs && fs.id === id) return true; } return false;
  }).length;
  let impact = '';
  if (svcCount) impact += `\n• ${svcCount} service${svcCount!==1?'s':''} route through this segment`;
  appConfirm(t('segments.confirm.delete', { name: segName }) + (impact ? '\n' + impact : ''), () => {
    data.segments = data.segments.filter(s => s.id !== id);
    save(); renderSegments(); updateBadges(); toast(t('segments.toast.deleted'), 'success');
  });
}

function promptInsertWaypoint(segId) {
  const seg = getSeg(segId); if (!seg) return;
  editingId = null;
  const nodeAName = nodeName(seg.nodeA), nodeBName = nodeName(seg.nodeB);
  openModal(t('nodes.modal.insert_waypoint'), `
    <p style="font-size:13px;color:var(--text-dim);margin-bottom:16px;">
      Split <strong>${esc(nodeAName)} — ${esc(nodeBName)}</strong> (${seg.distance} km) by inserting a waypoint.</p>
    <div class="form-row">
      <div class="form-group"><label>${t('nodes.field.waypoint_name')}</label><input type="text" id="f-wpName" value="" placeholder="e.g. Waypoint ${esc(nodeAName)}/${esc(nodeBName)}"></div>
      <div class="form-group"><label>Ref. Code (optional)</label><input type="text" id="f-wpRef" value="" placeholder="${t('nodes.placeholder.eg_wp_ref')}"></div>
    </div>
    <div class="form-group"><label>Distance from ${esc(nodeAName)} (km)</label>
      <input type="range" id="f-wpSlider" min="0.1" max="${(seg.distance - 0.1).toFixed(1)}" step="0.1" value="${(seg.distance / 2).toFixed(1)}"
        oninput="document.getElementById('f-wpDist').value=this.value;document.getElementById('wp-remainder').textContent=(${seg.distance}-this.value).toFixed(1)"
        style="width:100%">
      <div class="form-row mt-8">
        <div class="form-group"><label>From ${esc(nodeAName)}</label>
          <input type="number" id="f-wpDist" min="0.1" max="${(seg.distance - 0.1).toFixed(1)}" step="0.1" value="${(seg.distance / 2).toFixed(1)}"
            oninput="document.getElementById('f-wpSlider').value=this.value;document.getElementById('wp-remainder').textContent=(${seg.distance}-this.value).toFixed(1)"></div>
        <div class="form-group"><label>To ${esc(nodeBName)}</label>
          <div style="padding:8px 0;font-family:var(--font-mono);font-size:14px"><span id="wp-remainder">${(seg.distance / 2).toFixed(1)}</span> km</div></div>
      </div>
    </div>`,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="insertWaypoint('${segId}')">✂ Insert</button>`);
}

function insertWaypoint(segId) {
  const seg = getSeg(segId); if (!seg) return;
  const name = document.getElementById('f-wpName').value.trim() ||
    `WP ${nodeName(seg.nodeA)}/${nodeName(seg.nodeB)}`;
  const refCode = document.getElementById('f-wpRef').value.trim();
  const dist = parseFloat(document.getElementById('f-wpDist').value);
  if (!dist || dist <= 0 || dist >= seg.distance) {
    toast(t('segments.toast.dist_range', { max: seg.distance }), 'error'); return;
  }

  // 1. Create the waypoint node
  const wpId = uid();
  data.nodes.push({ id: wpId, name, type: 'waypoint', ogfNode: '', address: '',
    refCode, description: '', platforms: [] });

  // 2. Remember original segment properties for the copy
  const origNodeB = seg.nodeB;
  const origDistance = seg.distance;
  const remainDist = parseFloat((origDistance - dist).toFixed(2));

  // 3. Mutate original segment: shorten it, point to waypoint
  seg.nodeB = wpId;
  seg.distance = parseFloat(dist.toFixed(2));

  // 4. Create new segment (copy of original properties) for waypoint → original destination
  const newSegId = uid();
  data.segments.push({
    id: newSegId, nodeA: wpId, nodeB: origNodeB,
    tracks: Array.isArray(seg.tracks) ? seg.tracks.map(tk => ({ id: uid(), name: tk.name })) : [], maxSpeed: seg.maxSpeed, distance: remainDist,
    electrification: seg.electrification, interchangeType: seg.interchangeType,
    refCode: '', description: ''
  });

  // 5. Update service routes: any service traversing the original segment gets the waypoint inserted
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const thisNode = svc.stops[i].nodeId;
      const nextNode = svc.stops[i + 1].nodeId;
      // The original segment went nodeA→origNodeB. After mutation it goes nodeA→wpId.
      // So we need to find routes that had [seg.nodeA, origNodeB] adjacent.
      if ((thisNode === seg.nodeA && nextNode === origNodeB) ||
          (thisNode === origNodeB && nextNode === seg.nodeA)) {
        // Insert waypoint between these two stops as pass-through
        const wpStop = { nodeId: wpId, platformId: null, dwell: null, passThrough: true };
        svc.stops.splice(i + 1, 0, wpStop);
        // Skip over the newly inserted stop to avoid re-processing
        i++;
      }
    }
  }

  // 7. Update departures: insert waypoint time entries for affected departures
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    // Find where the waypoint was inserted in the service's stops
    for (let i = 0; i < dep.times.length - 1; i++) {
      const thisNode = dep.times[i].nodeId;
      const nextNode = dep.times[i + 1].nodeId;
      if ((thisNode === seg.nodeA && nextNode === origNodeB) ||
          (thisNode === origNodeB && nextNode === seg.nodeA)) {
        // Interpolate time for the waypoint based on distance proportion
        const ratio = dist / origDistance;
        const tFrom = dep.times[i].depart ?? dep.times[i].arrive;
        const tTo = dep.times[i + 1].arrive;
        if (tFrom != null && tTo != null) {
          const wpTime = tFrom + (tTo - tFrom) * ratio;
          dep.times.splice(i + 1, 0, {
            nodeId: wpId, arrive: wpTime, depart: wpTime,
            platformId: null, dwell: 0
          });
        }
        i++; // skip inserted entry
      }
    }
  }

  save(); closeModal(); renderSegments(); renderNodes(); updateBadges();
  toast(t('nodes.toast.waypoint_inserted', { name }), 'success');
  showSegmentDetail(segId);
}

// ============================================================
// LINES (backed by data.serviceGroups with color)
// ============================================================

// Derive which segments a line covers based on its member services' routes
function lineSegments(groupId) {
  const segIds = new Set();
  for (const svc of data.services) {
    if (svc.groupId !== groupId) continue;
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const s = findSeg(svc.stops[i].nodeId, svc.stops[i + 1].nodeId);
      if (s) segIds.add(s.id);
    }
  }
  return segIds;
}

const _linePrefixMap = {
  services: g => data.services.filter(s => s.groupId === g.id).length,
  deps: g => data.departures.filter(d => { const s = getSvc(d.serviceId); return s && s.groupId === g.id; }).length,
  stations: g => { const set = new Set(); data.services.filter(s => s.groupId === g.id).forEach(s => s.stops.forEach(st => { const n = getNode(st.nodeId); if (isPassengerStop(n) && !st.passThrough) set.add(nodeDisplayName(n.id)); })); return set.size; },
  segments: g => lineSegments(g.id).size
};
const _lineSortDefs = {
  name: g => g.name,
  services: g => data.services.filter(s => s.groupId === g.id).length,
  departures: g => data.departures.filter(d => { const s = getSvc(d.serviceId); return s && s.groupId === g.id; }).length,
  stations: g => { const set = new Set(); data.services.filter(s => s.groupId === g.id).forEach(s => s.stops.forEach(st => { const n = getNode(st.nodeId); if (isPassengerStop(n) && !st.passThrough) set.add(nodeDisplayName(n.id)); })); return set.size; },
  segments: g => lineSegments(g.id).size
};

function renderLines() {
  initSearchHints('line-search', 'lines');
  const el = document.getElementById('lines-list');
  const q = (document.getElementById('line-search')?.value || '');
  const parsed = parseSearchQuery(q);
  let list = data.serviceGroups.filter(g =>
    applySearchQuery(g, parsed, _linePrefixMap, (g, ft) => stripDiacritics(g.name.toLowerCase()).includes(stripDiacritics(ft)))
  );
  list = applySortable(list, 'lines', _lineSortDefs);

  detailMapDestroy('dm-line');
  document.getElementById('line-detail').innerHTML = '';

  if (!list.length && !data.serviceGroups.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">≡</div><h3>${t('lines.empty.title')}</h3>
      <p>Lines group services that share a route corridor, like the Northern Line or IC 200 Series.</p>
      <button class="btn btn-primary" onclick="openLineModal()">+ Add Line</button></div>`;
    return;
  }

  if (!list.length) {
    el.innerHTML = `<div class="text-dim mt-16">${t('lines.empty.no_match', { q })}</div>`;
    return;
  }

  el.innerHTML = `<table class="data-table"><thead><tr>${sortableHeader('lines','name',t('lines.th.line'))}<th>${t("lines.th.color")}</th>${sortableHeader('lines','services',t('lines.th.services'))}${sortableHeader('lines','departures',t('departures.th.departures'))}${sortableHeader('lines','stations',t('lines.th.stations'))}${sortableHeader('lines','segments',t('lines.th.segments'))}<th></th></tr></thead><tbody>` +
    list.map(g => {
      const lineSvcs = data.services.filter(s => s.groupId === g.id);
      const svcCount = lineSvcs.length;
      const segCount = lineSegments(g.id).size;
      const depCount = lineSvcs.reduce((sum, s) => sum + data.departures.filter(d => d.serviceId === s.id).length, 0);
      const stationSet = new Set();
      for (const s of lineSvcs) { for (const st of s.stops) { const n = getNode(st.nodeId); if (isPassengerStop(n) && !st.passThrough) stationSet.add(nodeDisplayName(n.id)); } }
      return `<tr data-id="${g.id}">
        <td><strong class="clickable" onclick="showLineDetail('${g.id}')">${esc(g.name)}</strong>${g.description ? `<div class="text-muted" style="font-size:11px;margin-top:1px">${esc(g.description)}</div>` : ''}</td>
        <td><span class="chip"><span class="dot" style="background:${g.color||'var(--text-muted)'}"></span>${g.color||'none'}</span></td>
        <td class="mono">${svcCount}</td>
        <td class="mono">${depCount}</td>
        <td class="mono">${stationSet.size}</td>
        <td class="mono">${segCount}</td>
        <td class="actions-cell">
          <button class="btn btn-sm" onclick="openLineModal('${g.id}')">${t('common.edit')}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteLine('${g.id}')">✕</button></td>
      </tr>`;
    }).join('') + '</tbody></table>';
}

function showLineDetail(id) {
  const g = getGroup(id); if (!g) return;
  highlightEntity(id);
  const el = document.getElementById('line-detail');
  const svcs = data.services.filter(s => s.groupId === id);
  const segIds = lineSegments(id);

  let html = `<div class="detail-panel">
    <h3><span class="dot" style="background:${g.color||'var(--text-muted)'};width:12px;height:12px;display:inline-block;border-radius:50%;margin-right:8px"></span>${esc(g.name)}
    <button class="close-detail" onclick="closeLineDetail()">✕</button></h3>
    ${g.description ? `<p class="text-dim mb-8" style="font-size:13px">${esc(g.description)}</p>` : ''}`;

  // Map — collect stations on this line with geo data
  const lineStationNodes = new Set();
  for (const s of svcs) { for (const st of s.stops) { const n = getNode(st.nodeId); if (isPassengerStop(n) && n.lat != null) lineStationNodes.add(n); } }
  const lineHasGeo = lineStationNodes.size > 0;
  const lineGroupSet = new Set([id]);
  const lineBeck = detailMapHasBeck(lineGroupSet);
  html += detailMapContainerHTML('dm-line', lineHasGeo, lineBeck);

  // Services
  html += `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">Services (${svcs.length})</strong>`;
  if (svcs.length) {
    html += `<div class="flex gap-8 mt-8" style="flex-wrap:wrap">
      ${svcs.map(s => {
        const cat = getCat(s.categoryId);
        const route = s.stops.length ? `${nodeDisplayName(s.stops[0].nodeId)} → ${nodeDisplayName(s.stops[s.stops.length-1].nodeId)}` : '';
        return `<span class="chip clickable" onclick="switchTab('services');showServiceDetail('${s.id}')">
          ${cat ? `<span class="dot" style="background:${svcLineColor(s)}"></span>` : ''}${esc(s.name)}${route ? ` <span class="text-muted" style="font-size:11px;margin-left:4px">${esc(route)}</span>` : ''}
        </span>`;
      }).join('')}
    </div>`;
  } else {
    html += `<div class="text-dim mt-8" style="font-size:13px">${t('lines.empty.no_services')}</div>`;
  }
  html += `</div>`;

  // Derived segments
  html += `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">Route coverage (${segIds.size} segments)</strong>`;
  if (segIds.size) {
    const segs = [...segIds].map(sid => getSeg(sid)).filter(Boolean);
    html += `<div class="flex gap-8 mt-8" style="flex-wrap:wrap">
      ${segs.map(s => `<span class="chip clickable" onclick="switchTab('segments');showSegmentDetail('${s.id}')">${esc(nodeName(s.nodeA))} — ${esc(nodeName(s.nodeB))} <span class="text-muted" style="font-size:11px">${s.distance}km</span></span>`).join('')}
    </div>`;
  } else {
    html += `<div class="text-dim mt-8" style="font-size:13px">${t('lines.empty.no_segments')}</div>`;
  }
  html += `<div class="detail-map-clear"></div></div></div>`;

  el.innerHTML = html;
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

  if (lineHasGeo) {
    const lineColor = g.color || '#888';
    const _segIds = segIds;
    detailMapInitGeo('dm-line', map => {
      _dmDrawBackground(map, [..._segIds]);
      // Draw line segments highlighted
      for (const sid of _segIds) {
        const s = getSeg(sid); if (!s) continue;
        const coords = segmentCoords(s);
        if (coords.length < 2) continue;
        L.polyline(coords, { color: '#000', weight: 6, opacity: 0.8 }).addTo(map);
        L.polyline(coords, { color: lineColor, weight: 4, opacity: 1 }).addTo(map);
      }
      // Station dots + labels
      for (const n of lineStationNodes) { _dmStationDot(map, n, {}); _dmLabel(map, n); }
      _dmFitNodes(map, [...lineStationNodes]);
    });
    if (lineBeck) detailMapSetBeck('dm-line', lineGroupSet);
  } else if (lineBeck) {
    _detailMaps['dm-line'] = {};
    detailMapSetBeck('dm-line', lineGroupSet);
    const svgEl = document.getElementById('dm-line-beck');
    if (svgEl) renderMiniBeck(svgEl, { focusGroupIds: lineGroupSet });
  }
}

function closeLineDetail() { detailMapDestroy('dm-line'); document.getElementById('line-detail').innerHTML = ''; }

function openLineModal(id) {
  editingId = id || null;
  const g = id ? getGroup(id) : null;
  const lineColor = g?.color || '#8899aa';
  openModal(g ? t('lines.modal.edit') : t('lines.modal.add'), `
    <div class="form-row">
      <div class="form-group"><label>${t('common.field.name')}</label><input type="text" id="f-lN" value="${esc(g?.name||'')}" placeholder="${t('lines.placeholder.eg_line')}"></div>
      <div class="form-group"><label>${t('common.field.color')}</label><input type="text" id="f-lC" value="${esc(lineColor)}" oninput="document.querySelectorAll('#f-lC-palette .color-swatch').forEach(s=>s.classList.toggle('active',s.title.startsWith(this.value)))">
        <div id="f-lC-palette">${colorPaletteHtml('f-lC', lineColor)}</div></div>
    </div>
    <div class="form-group"><label>${t('common.field.description')}</label>
      <input type="text" id="f-lD" value="${esc(g?.description||'')}" placeholder="e.g. Intercity service between Hemstein and Zaalkirk"></div>`,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveLine()">${g?'Save':'Add Line'}</button>`);
}

function saveLine() {
  const name = document.getElementById('f-lN').value.trim();
  if (!name) { toast(t('nodes.toast.name_required'), 'error'); return; }
  const color = document.getElementById('f-lC').value.trim() || '#5b8af5';
  const description = document.getElementById('f-lD')?.value?.trim() || '';
  if (editingId) {
    Object.assign(getGroup(editingId), { name, color, description });
    toast(t('lines.toast.updated'), 'success');
  } else {
    data.serviceGroups.push({ id: uid(), name, color, description });
    toast(t('lines.toast.added'), 'success');
  }
  save(); closeModal(); renderLines(); renderServices(); updateBadges();
}

function deleteLine(id) {
  const g = getGroup(id);
  const svcCount = data.services.filter(s => s.groupId === id).length;
  let impact = '';
  if (svcCount) impact += `\n• ${svcCount} service${svcCount!==1?'s':''} will be unassigned from this line`;
  appConfirm(t('lines.confirm.delete', { name: g?.name || '?' }) + (impact ? '\n' + impact : ''), () => {
    data.services.forEach(s => { if (s.groupId === id) s.groupId = null; });
    data.serviceGroups = data.serviceGroups.filter(g => g.id !== id);
    save(); renderLines(); renderServices(); updateBadges(); toast(t('lines.toast.deleted'), 'success');
  });
}

// ============================================================
// CATEGORIES
// ============================================================
function renderCategories() {
  const el = document.getElementById('modes-list');
  if (!data.categories.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">◆</div><h3>${t('modes.empty.title')}</h3>
      <p>Define service modes like Intercity, Commuter, Light Rail, etc.</p>
      <button class="btn btn-primary" onclick="openCategoryModal()">+ Add Mode</button></div>`;
    return;
  }
  const modeList = applySortable(data.categories, 'modes', { name: c => c.name, dwell: c => c.defaultDwellTime || 0, clearance: c => c.platformClearance ?? PLATFORM_CLEARANCE_MIN_(), priority: c => c.priority || 0 }) || data.categories;
  el.innerHTML = `<table class="data-table"><thead><tr>${sortableHeader('modes','name',t('common.th.name'))}<th>${t('modes.th.abbreviation')}</th>${sortableHeader('modes','dwell',t('modes.th.default_dwell'))}${sortableHeader('modes','clearance',t('modes.th.plt_clearance'))}${sortableHeader('modes','priority',t('modes.th.priority'))}<th></th></tr></thead><tbody>` +
    modeList.map(c => `<tr>
      <td><strong>${esc(c.name)}</strong></td>
      <td class="mono">${esc(c.abbreviation||'')}</td>
      <td class="mono">${c.defaultDwellTime||0}s</td>
      <td class="mono">${c.platformClearance ?? PLATFORM_CLEARANCE_MIN_()} min</td>
      <td class="mono">${c.priority||0}</td>
      <td class="actions-cell">
        <button class="btn btn-sm" onclick="openCategoryModal('${c.id}')">${t('common.edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCat('${c.id}')">✕</button></td>
    </tr>`).join('') + '</tbody></table>';
}
function openCategoryModal(id) {
  editingId = id || null; const c = id ? getCat(id) : null;
  openModal(c ? t('modes.modal.edit') : t('modes.modal.add'), `
    <div class="form-row">
      <div class="form-group"><label>${t('common.field.name')}</label><input type="text" id="f-cN" value="${esc(c?.name||'')}" placeholder="${t('modes.placeholder.eg_mode')}"></div>
      <div class="form-group"><label>${t('modes.field.abbreviation')}</label><input type="text" id="f-cA" value="${esc(c?.abbreviation||'')}" placeholder="${t('modes.placeholder.eg_abbr')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>${t('modes.field.default_dwell')}</label><input type="number" id="f-cD" value="${c?.defaultDwellTime||60}" min="0"></div>
      <div class="form-group"><label>${t('modes.field.plt_clearance')}</label><input type="number" id="f-cPC" value="${c?.platformClearance ?? 3}" min="0" max="30">
        <p class="text-dim" style="font-size:11px;margin-top:2px">Min. time between this mode departing and next train arriving at same platform.</p></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>${t('modes.field.priority')}</label><input type="number" id="f-cP" value="${c?.priority||0}" min="0"></div>
      <div class="form-group"><label>Map Style</label><select id="f-cMS">
        ${['full','dashed','punched','double','hidden'].map(s => `<option value="${s}"${(c?.defaultMapStyle||'full')===s?' selected':''}>${s}</option>`).join('')}
      </select></div>
    </div>
    <div class="form-group"><label>${t('segments.field.infrastructure_type')}</label><select id="f-cIT">
      <option value="rail"${(c?.infrastructureType||'rail')==='rail'?' selected':''}>Rail</option>
      <option value="road"${c?.infrastructureType==='road'?' selected':''}>Road</option>
    </select></div>`,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveCat()">${c?t('common.save'):t('modes.btn.add')}</button>`);
}
function saveCat() {
  const name = document.getElementById('f-cN').value.trim();
  if (!name) { toast(t('nodes.toast.name_required'), 'error'); return; }
  const abbreviation = document.getElementById('f-cA').value.trim();
  const color = editingId ? (getCat(editingId)?.color || '#5b8af5') : '#5b8af5';
  const defaultDwellTime = parseInt(document.getElementById('f-cD').value) || 60;
  const platformClearance = parseInt(document.getElementById('f-cPC').value) ?? 3;
  const priority = parseInt(document.getElementById('f-cP').value) || 0;
  const defaultMapStyle = document.getElementById('f-cMS').value || 'full';
  const infrastructureType = document.getElementById('f-cIT').value || 'rail';
  if (editingId) { Object.assign(getCat(editingId), { name, abbreviation, defaultDwellTime, platformClearance, priority, defaultMapStyle, infrastructureType }); toast(t('modes.toast.updated'), 'success'); }
  else { data.categories.push({ id: uid(), name, abbreviation, color, defaultDwellTime, platformClearance, priority, defaultMapStyle, infrastructureType }); toast(t('modes.toast.added'), 'success'); }
  save(); closeModal(); renderCategories(); updateBadges();
}
function deleteCat(id) {
  const cat = getCat(id);
  const svcCount = data.services.filter(s => s.categoryId === id).length;
  let impact = '';
  if (svcCount) impact += `\n• ${svcCount} service${svcCount!==1?'s':''} use this mode`;
  appConfirm(t('modes.confirm.delete', { name: cat?.name || '?' }) + (impact ? '\n' + impact : ''), () => {
    data.categories = data.categories.filter(c => c.id !== id); save(); renderCategories(); updateBadges(); toast(t('modes.toast.deleted'), 'success');
  });
}

// ============================================================
// ROLLING STOCK
// ============================================================
function renderStock() {
  const el = document.getElementById('stock-list');
  if (!data.rollingStock.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🚃</div><h3>${t('stock.empty.title')}</h3>
      <p>Define train types with their performance characteristics.</p>
      <button class="btn btn-primary" onclick="openStockModal()">+ Add Stock Type</button></div>`;
    document.getElementById('stock-matrix').innerHTML = '';
    return;
  }
  const stockList = applySortable(data.rollingStock, 'stock', { name: s => s.name, speed: s => s.maxSpeed, accel: s => s.acceleration }) || data.rollingStock;
  el.innerHTML = `<table class="data-table"><thead><tr>
    ${sortableHeader('stock','name',t('common.th.name'))}${sortableHeader('stock','accel',t('stock.th.acceleration'))}${sortableHeader('stock','speed',t('stock.th.max_speed'))}<th>${t("stock.th.dwell")}</th><th>${t("stock.th.traction")}</th><th>${t("common.th.description")}</th><th></th></tr></thead><tbody>` +
    stockList.map(s => `<tr>
      <td><strong>${esc(s.name)}</strong>${s.code ? ` <span class="mono text-muted" style="font-size:11px">[${esc(s.code)}]</span>` : ''}</td>
      <td class="mono">${s.acceleration} m/s²</td>
      <td class="mono">${s.maxSpeed} km/h</td>
      <td class="mono">${s.defaultDwell}s</td>
      <td>${s.traction === 'electric' ? '⚡ ' + t('type.electric')||'Electric' : s.traction === 'diesel' ? '⛽ ' + t('type.diesel')||'Diesel' : '⚡⛽ ' + t('type.dual')||'Dual'}</td>
      <td class="text-dim" style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.description||'—')}</td>
      <td class="actions-cell">
        <button class="btn btn-sm" onclick="openStockModal('${s.id}')">${t('common.edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="deleteStock('${s.id}')">✕</button></td>
    </tr>`).join('') + '</tbody></table>';

  // Render matrix below the table
  renderStockModeMatrix();
}

function openStockModal(id) {
  editingId = id || null;
  const s = id ? getStock(id) : null;
  openModal(s ? t('stock.modal.edit') : t('stock.modal.add'), `
    <div class="form-row">
      <div class="form-group" style="flex:2"><label>${t('common.field.name')}</label>
        <input type="text" id="f-stN" value="${esc(s?.name||'')}" placeholder="${t('stock.placeholder.eg_name')}"></div>
      <div class="form-group" style="flex:1"><label>Code</label>
        <input type="text" id="f-stCode" value="${esc(s?.code||'')}" placeholder="${t('stock.placeholder.eg_code')}"></div>
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>${t('stock.field.acceleration')}</label>
        <input type="number" id="f-stAcc" value="${s?.acceleration??1.0}" min="0.1" max="5" step="0.1"></div>
      <div class="form-group"><label>${t('segments.field.max_speed')}</label>
        <input type="number" id="f-stSpd" value="${s?.maxSpeed??160}" min="10" max="400"></div>
      <div class="form-group"><label>${t('stock.field.dwell')}</label>
        <input type="number" id="f-stDwell" value="${s?.defaultDwell??60}" min="0"></div>
    </div>
    <div class="form-group"><label>${t('stock.field.traction')}</label>
      <select id="f-stTrac">
        <option value="electric" ${s?.traction==='electric'||!s?'selected':''}>⚡ Electric</option>
        <option value="diesel" ${s?.traction==='diesel'?'selected':''}>⛽ Diesel</option>
        <option value="dual" ${s?.traction==='dual'?'selected':''}>⚡⛽ Dual (electric + diesel)</option>
      </select></div>
    <div class="form-group"><label>${t('common.field.description')}</label>
      <input type="text" id="f-stDesc" value="${esc(s?.description||'')}" placeholder="${t('stock.placeholder.eg_desc')}"></div>`,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveStock()">${s?t('common.save'):t('stock.btn.add')}</button>`);
}

function saveStock() {
  const name = document.getElementById('f-stN').value.trim();
  if (!name) { toast(t('nodes.toast.name_required'), 'error'); return; }
  const code = document.getElementById('f-stCode').value.trim();
  const acceleration = parseFloat(document.getElementById('f-stAcc').value) || 1.0;
  const maxSpeed = parseInt(document.getElementById('f-stSpd').value) || 160;
  const defaultDwell = parseInt(document.getElementById('f-stDwell').value) || 60;
  const traction = document.getElementById('f-stTrac').value;
  const description = document.getElementById('f-stDesc').value.trim();
  if (acceleration <= 0) { toast(t('stock.toast.accel_positive'), 'error'); return; }
  if (maxSpeed <= 0) { toast(t('stock.toast.maxspeed_positive'), 'error'); return; }

  if (editingId) {
    Object.assign(getStock(editingId), { name, code, acceleration, maxSpeed, defaultDwell, traction, description });
    toast(t('stock.toast.updated'), 'success');
  } else {
    data.rollingStock.push({ id: uid(), name, code, acceleration, maxSpeed, defaultDwell, traction, description });
    toast(t('stock.toast.added'), 'success');
  }
  save(); closeModal(); renderStock(); updateBadges();
}

function deleteStock(id) {
  const s = getStock(id);
  const svcCount = data.services.filter(sv => sv.stockId === id).length;
  let impact = '';
  if (svcCount) impact += `\n• ${svcCount} service${svcCount!==1?'s':''} use this stock type`;
  appConfirm(t('stock.confirm.delete', { name: s.name }) + (impact ? '\n' + impact : ''), () => {
    data.rollingStock = data.rollingStock.filter(s => s.id !== id);
    for (const key of Object.keys(data.stockModeMatrix)) {
      if (key.startsWith(id + '::') || key.endsWith('::' + id)) delete data.stockModeMatrix[key];
    }
    save(); renderStock(); updateBadges(); toast(t('stock.toast.deleted'), 'success');
  });
}

// ============================================================
// STOCK-MODE COMPATIBILITY MATRIX
// ============================================================
// Matrix stored as data.stockModeMatrix = { "stockId::modeId": "typical"|"atypical"|"disallowed" }
// Default (no entry) = not assigned

function getMatrixValue(stockId, modeId) {
  return data.stockModeMatrix[`${stockId}::${modeId}`] || '';
}

function renderStockModeMatrix() {
  const el = document.getElementById('stock-matrix');
  if (!data.rollingStock.length || !data.categories.length) {
    el.innerHTML = data.rollingStock.length ?
      '<div class="text-dim mt-16" style="font-size:13px">Add service modes to configure the compatibility matrix.</div>' : '';
    return;
  }

  let html = `<div style="margin-top:32px">
    <div class="page-header" style="margin-bottom:16px"><div>
      <h2 style="font-family:var(--font-display);font-size:18px;font-weight:600">${t('stock.matrix.title')}</h2>
      <div class="subtitle">${t('stock.matrix.desc')}</div>
    </div></div>
    <div style="overflow-x:auto">
    <table class="data-table" style="min-width:auto">
      <thead><tr><th style="min-width:120px">${t('stock.matrix.header')}</th>`;

  for (const cat of data.categories) {
    html += `<th style="text-align:center;min-width:90px"><span class="chip" style="font-size:10px">${esc(cat.abbreviation || cat.name)}</span></th>`;
  }
  html += '</tr></thead><tbody>';

  for (const stock of data.rollingStock) {
    html += `<tr><td><strong style="font-size:13px">${esc(stock.name)}</strong>${stock.traction === 'electric' ? ' ⚡' : stock.traction === 'diesel' ? ' ⛽' : ' ⚡⛽'}</td>`;
    for (const cat of data.categories) {
      const val = getMatrixValue(stock.id, cat.id);
      html += `<td style="text-align:center;padding:6px 4px">
        <select class="matrix-sel" data-stock="${stock.id}" data-mode="${cat.id}"
          onchange="setMatrixValue('${stock.id}','${cat.id}',this.value)"
          style="font-size:11px;padding:3px 6px;width:85px;text-align:center;
            background:${val==='typical'?'var(--success-dim)':val==='atypical'?'var(--warn-dim)':val==='disallowed'?'var(--danger-dim)':'var(--bg-input)'};
            color:${val==='typical'?'var(--success)':val==='atypical'?'var(--warn)':val==='disallowed'?'var(--danger)':'var(--text-dim)'};
            border-color:${val==='typical'?'var(--success)':val==='atypical'?'var(--warn)':val==='disallowed'?'var(--danger)':'var(--border)'}">
          <option value="" ${!val?'selected':''}>—</option>
          <option value="typical" ${val==='typical'?'selected':''}>✓ ${t('stock.matrix.typical')}</option>
          <option value="atypical" ${val==='atypical'?'selected':''}>~ ${t('stock.matrix.atypical')}</option>
          <option value="disallowed" ${val==='disallowed'?'selected':''}>✕ ${t('stock.matrix.disallowed')}</option>
        </select></td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';

  // Legend
  html += `<div class="flex gap-8 mt-8" style="flex-wrap:wrap;font-size:12px;color:var(--text-dim)">
    <span><strong style="color:var(--success)">✓ ${t('stock.matrix.typical')}</strong> — ${t('stock.matrix.typical_desc')}</span>
    <span><strong style="color:var(--warn)">~ ${t('stock.matrix.atypical')}</strong> — ${t('stock.matrix.atypical_desc')}</span>
    <span><strong style="color:var(--danger)">✕ ${t('stock.matrix.disallowed')}</strong> — ${t('stock.matrix.disallowed_desc')}</span>
  </div></div>`;

  el.innerHTML = html;
}

function setMatrixValue(stockId, modeId, value) {
  const key = `${stockId}::${modeId}`;
  if (value) {
    data.stockModeMatrix[key] = value;
  } else {
    delete data.stockModeMatrix[key];
  }
  save();
  // Re-render just the changed select's styling without full re-render
  const sel = document.querySelector(`.matrix-sel[data-stock="${stockId}"][data-mode="${modeId}"]`);
  if (sel) {
    const val = value;
    sel.style.background = val==='typical'?'var(--success-dim)':val==='atypical'?'var(--warn-dim)':val==='disallowed'?'var(--danger-dim)':'var(--bg-input)';
    sel.style.color = val==='typical'?'var(--success)':val==='atypical'?'var(--warn)':val==='disallowed'?'var(--danger)':'var(--text-dim)';
    sel.style.borderColor = val==='typical'?'var(--success)':val==='atypical'?'var(--warn)':val==='disallowed'?'var(--danger)':'var(--border)';
  }
}

// ============================================================
// SERVICES — with smart route builder and service groups
// ============================================================
const _svcPrefixMap = {
  line: s => groupName(s.groupId),
  mode: s => { const c = getCat(s.categoryId); return c ? (c.name + ' ' + (c.abbreviation || '')) : ''; },
  stock: s => { const st = getStock(s.stockId); return st ? st.name : ''; },
  stops: s => s.stops.length,
  stop: s => s.stops.map(st => nodeName(st.nodeId)).join(' '),
  deps: s => data.departures.filter(d => d.serviceId === s.id).length,
  desc: s => s.description,
  length: s => { let d = 0; for (let i = 0; i < s.stops.length - 1; i++) { const seg = findSegByTrack(s.stops[i].nodeId, s.stops[i+1].nodeId, s.stops[i+1]?.trackId); if (seg) d += seg.distance; } return Math.round(d * 10) / 10; },
  duration: s => { let t = 0; for (let i = 0; i < s.stops.length - 1; i++) { const seg = findSegByTrack(s.stops[i].nodeId, s.stops[i+1].nodeId, s.stops[i+1]?.trackId); if (seg) t += calcSegmentTime(seg.distance, seg.maxSpeed, 0, 0, DEFAULT_ACCEL()); } return Math.round(t); }
};
const _svcSortDefs = {
  name: s => s.name,
  stops: s => s.stops.length,
  departures: s => data.departures.filter(d => d.serviceId === s.id).length
};

function renderServices() {
  initSearchHints('service-search', 'services');
  const q = (document.getElementById('service-search')?.value || '');
  const parsed = parseSearchQuery(q);
  const list = data.services.filter(s =>
    applySearchQuery(s, parsed, _svcPrefixMap, (s, ft) => {
      const qn = stripDiacritics(ft);
      const gn = groupName(s.groupId).toLowerCase();
      return stripDiacritics(s.name.toLowerCase()).includes(qn) || stripDiacritics(gn).includes(qn);
    })
  );
  const el = document.getElementById('services-list');
  detailMapDestroy('dm-svc');
  document.getElementById('service-detail').innerHTML = '';

  if (!list.length && !data.services.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">▷</div><h3>${t('services.empty.title')}</h3>
      <p>Define route templates with stops and platforms.</p>
      <button class="btn btn-primary" onclick="openServiceModal()">+ Add Service</button></div>`;
    return;
  }

  // When sorted, render as flat list; when unsorted, group by line
  const isSorted = !!_sortState.services;
  const sortedList = isSorted ? applySortable(list, 'services', _svcSortDefs) : list;

  // Group services by groupId for display (only when unsorted)
  const grouped = {};
  const ungrouped = [];
  if (!isSorted) {
    for (const s of list) {
      if (s.groupId && getGroup(s.groupId)) {
        if (!grouped[s.groupId]) grouped[s.groupId] = [];
        grouped[s.groupId].push(s);
      } else {
        ungrouped.push(s);
      }
    }
  }

  let html = '';

  // Render lines filter chips if any exist
  if (data.serviceGroups.length) {
    html += `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('nav.lines')}</strong>
      <div class="flex gap-8 mt-8" style="flex-wrap:wrap">
      ${data.serviceGroups.map(g => {
        const count = data.services.filter(s => s.groupId === g.id).length;
        return `<span class="chip" style="cursor:pointer" onclick="document.getElementById('service-search').value='${esc(g.name)}';renderServices()">
          <span class="dot" style="background:${g.color||'var(--text-muted)'}"></span>${esc(g.name)} <span class="mono text-muted" style="margin-left:4px">${count}</span>
        </span>`;
      }).join('')}
      </div></div>`;
  }

  // Build table
  html += `<table class="data-table"><thead><tr>${sortableHeader('services','name',t('services.th.service'))}<th>${t("lines.th.line")}</th><th>${t("modes.th.mode")}</th><th>${t("stock.th.stock")}</th>${sortableHeader('services','stops',t('services.th.stops'))}<th>${t("services.th.route")}</th>${sortableHeader('services','departures',t('departures.th.departures'))}<th>${t('services.th.pattern')}</th><th></th></tr></thead><tbody>`;

  if (isSorted) {
    // Flat sorted list (no grouping)
    html += sortedList.map(s => svcTableRow(s)).join('');
  } else {
    // Render grouped services with group headers
    for (const [gid, svcs] of Object.entries(grouped)) {
      const g = getGroup(gid);
      html += `<tr><td colspan="9" style="background:var(--bg-input);padding:6px 12px;font-size:12px;font-weight:600;color:var(--text-dim)">
        <span class="dot" style="background:${g?.color||'var(--text-muted)'};margin-right:6px"></span>${esc(g?.name || '?')} (${svcs.length} services)</td></tr>`;
      html += svcs.map(s => svcTableRow(s)).join('');
    }

    // Ungrouped
    if (ungrouped.length && Object.keys(grouped).length) {
      html += `<tr><td colspan="9" style="background:var(--bg-input);padding:6px 12px;font-size:12px;font-weight:600;color:var(--text-dim)">
        Ungrouped (${ungrouped.length})</td></tr>`;
    }
    html += ungrouped.map(s => svcTableRow(s)).join('');
  }
  html += '</tbody></table>';

  el.innerHTML = html;
}

function svcTableRow(s) {
  const cat = getCat(s.categoryId);
  const stock = getStock(s.stockId);
  const stops = (s.stops||[]).filter(st => !st.passThrough);
  const route = s.stops.length ? `${nodeName(s.stops[0].nodeId)} → ${nodeName(s.stops[s.stops.length-1].nodeId)}` : '—';
  const depC = data.departures.filter(d => d.serviceId === s.id).length;
  const grp = getGroup(s.groupId);
  const desc = s.description ? `<div class="text-muted" style="font-size:11px;margin-top:2px">${esc(s.description)}</div>` : '';
  return `<tr data-id="${s.id}">
    <td><strong class="clickable" onclick="showServiceDetail('${s.id}')">${esc(s.name)}</strong>${desc}</td>
    <td class="text-dim" style="font-size:12px">${grp ? `<span class="chip clickable" onclick="event.stopPropagation();switchTab('lines');showLineDetail('${grp.id}')"><span class="dot" style="background:${grp.color||'var(--text-muted)'}"></span>${esc(grp.name)}</span>` : '—'}</td>
    <td>${cat ? `<span class="chip"><span class="dot" style="background:${svcLineColor(s)}"></span>${esc(cat.abbreviation||cat.name)}</span>` : '—'}</td>
    <td class="text-dim" style="font-size:12px">${stock ? esc(stock.code||stock.name) : '—'}</td>
    <td class="mono">${stops.length}</td>
    <td class="text-dim" style="font-size:12px">${esc(route)}</td>
    <td class="mono">${depC || '—'}</td>
    <td class="pattern-cell">${esc(describePattern(s.schedulePattern))}</td>
    <td class="actions-cell">
      <button class="btn btn-sm" onclick="openServiceModal('${s.id}')">${t('common.edit')}</button>
      <button class="btn btn-sm" onclick="duplicateService('${s.id}')" title="${t('services.tooltip.duplicate')}">${t("common.dup_short")}</button>
      <button class="btn btn-sm" onclick="reverseService('${s.id}')" title="${t('services.tooltip.reverse')}">${t("common.reverse")}</button>
      <button class="btn btn-sm" onclick="openScheduleModal('${s.id}')">${t("services.btn.gen_schedule")}</button>
      <button class="btn btn-sm btn-danger" onclick="deleteSvc('${s.id}')">✕</button></td>
  </tr>`;
}

function openGroupModal(id) {
  editingId = id || null;
  const g = id ? getGroup(id) : null;
  const lineColor = g?.color || '#8899aa';
  openModal(g ? t('lines.modal.edit') : t('lines.modal.new'), `
    <div class="form-row">
      <div class="form-group"><label>${t('lines.field.name')}</label>
        <input type="text" id="f-grpN" value="${esc(g?.name||'')}" placeholder="${t('lines.placeholder.eg_line')}"></div>
      <div class="form-group"><label>${t('common.field.color')}</label><input type="text" id="f-grpC" value="${esc(lineColor)}" oninput="document.querySelectorAll('#f-grpC-palette .color-swatch').forEach(s=>s.classList.toggle('active',s.title.startsWith(this.value)))">
        <div id="f-grpC-palette">${colorPaletteHtml('f-grpC', lineColor)}</div></div>
    </div>
    <div class="form-group"><label>${t('common.field.description')}</label>
      <input type="text" id="f-grpD" value="${esc(g?.description||'')}" placeholder="e.g. Intercity service between Hemstein and Zaalkirk"></div>`,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveGroup()">${g?'Save':'Create'}</button>`);
}
function saveGroup() {
  const name = document.getElementById('f-grpN').value.trim();
  if (!name) { toast(t('nodes.toast.name_required'), 'error'); return; }
  const color = document.getElementById('f-grpC')?.value?.trim() || '#8899aa';
  const description = document.getElementById('f-grpD')?.value?.trim() || '';
  if (editingId) {
    Object.assign(getGroup(editingId), { name, color, description });
    toast(t('lines.toast.updated'), 'success');
  } else {
    data.serviceGroups.push({ id: uid(), name, color, description });
    toast(t('lines.toast.created'), 'success');
  }
  save(); closeModal(); renderServices(); renderLines(); updateBadges();
}
function deleteGroup(id) {
  const g = getGroup(id);
  const svcCount = data.services.filter(s => s.groupId === id).length;
  let impact = '';
  if (svcCount) impact += `\n• ${svcCount} service${svcCount!==1?'s':''} will be unassigned`;
  appConfirm(t('lines.confirm.delete', { name: g?.name || '?' }) + (impact ? '\n' + impact : ''), () => {
    data.services.forEach(s => { if (s.groupId === id) s.groupId = null; });
    data.serviceGroups = data.serviceGroups.filter(g => g.id !== id);
    save(); closeModal(); renderServices(); renderLines(); updateBadges(); toast(t('lines.toast.deleted'), 'success');
  });
}
function quickCreateGroup() {
  // Show an inline input next to the line select
  const container = document.getElementById('f-svG').parentElement;
  if (document.getElementById('inline-grp-create')) return;
  const div = document.createElement('div');
  div.id = 'inline-grp-create';
  div.className = 'flex gap-4 items-center mt-8';
  div.innerHTML = `<input type="text" id="f-inlineGrp" placeholder="${t('lines.placeholder.eg_line_name')}" style="flex:1;font-size:12px;padding:5px 8px">
    <button class="btn btn-sm btn-primary" onclick="finishQuickGroup()">Add</button>
    <button class="btn btn-sm" onclick="document.getElementById('inline-grp-create').remove()">✕</button>`;
  container.appendChild(div);
  document.getElementById('f-inlineGrp').focus();
  document.getElementById('f-inlineGrp').addEventListener('keydown', e => { if (e.key === 'Enter') finishQuickGroup(); });
}
function finishQuickGroup() {
  const name = document.getElementById('f-inlineGrp')?.value?.trim();
  if (!name) { toast(t('nodes.toast.name_required'), 'error'); return; }
  const g = { id: uid(), name, color: '#8899aa' };
  data.serviceGroups.push(g);
  save();
  const sel = document.getElementById('f-svG');
  if (sel) {
    sel.innerHTML += `<option value="${g.id}">${esc(g.name)}</option>`;
    sel.value = g.id;
  }
  document.getElementById('inline-grp-create')?.remove();
  toast(t('lines.toast.created', { name }), 'success');
}

function showServiceDetail(svcId) {
  const svc = getSvc(svcId); if (!svc) return;
  // Switch to services tab if not there
  const panel = document.getElementById('panel-services');
  if (!panel.classList.contains('active')) switchTab('services');
  highlightEntity(svcId);

  const cat = getCat(svc.categoryId);
  const grp = getGroup(svc.groupId);
  const stock = getStock(svc.stockId);
  const deps = data.departures.filter(d => d.serviceId === svcId).sort((a, b) => {
    return (a.startTime < DAY_CUTOFF_() ? a.startTime + 1440 : a.startTime) - (b.startTime < DAY_CUTOFF_() ? b.startTime + 1440 : b.startTime);
  });
  const el = document.getElementById('service-detail');

  let html = `<div class="detail-panel">
    <h3>${esc(svc.name)} ${cat ? `<span class="chip"><span class="dot" style="background:${svcLineColor(svc)}"></span>${esc(cat.name)}</span>` : ''}
    ${stock ? `<span class="chip" style="margin-left:4px">${stock.traction==='electric'?'⚡':stock.traction==='diesel'?'⛽':'⚡⛽'} ${esc(stock.code||stock.name)}</span>` : ''}
    ${grp ? `<span class="chip clickable" style="margin-left:4px;cursor:pointer" onclick="event.stopPropagation();switchTab('lines');showLineDetail('${grp.id}')"><span class="dot" style="background:${grp.color||'var(--text-muted)'}"></span>${esc(grp.name)}</span>` : ''}
    <span class="chip" style="margin-left:4px;font-size:11px">${esc(describePattern(svc.schedulePattern))}</span>
    <button class="close-detail" onclick="closeServiceDetail()">✕</button></h3>`;

  // Map
  const svcStopNodes = svc.stops.map(st => getNode(st.nodeId)).filter(n => n && n.lat != null);
  const svcHasGeo = svcStopNodes.length > 0;
  const svcGroupSet = svc.groupId ? new Set([svc.groupId]) : new Set();
  const svcBeck = detailMapHasBeck(svcGroupSet);
  html += detailMapContainerHTML('dm-svc', svcHasGeo, svcBeck);

  html += '<div class="detail-map-clear"></div>';

  // Route overview
  html += `<div class="mb-16"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('services.th.route')}</strong>
    <div class="mt-8">` + svc.stops.map((st, i) => {
      const n = getNode(st.nodeId);
      const label = n ? n.name : '???';
      const plat = st.platformId ? ` [${platName(st.nodeId, st.platformId)}]` : '';
      const pass = st.passThrough ? ' <span class="text-muted">(pass)</span>' : '';
      const dwell = (!st.passThrough && st.dwell) ? ` <span class="text-muted">${st.dwell}s</span>` : '';
      let segInfo = '';
      if (i < svc.stops.length - 1) {
        const seg = findSegByTrack(st.nodeId, svc.stops[i+1].nodeId, svc.stops[i+1]?.trackId);
        if (seg) segInfo = `<div style="padding:2px 0 2px 16px;font-size:11px;color:var(--text-muted)">│ ${seg.distance}km · ${seg.maxSpeed}km/h · ~${(calcSegmentTime(seg.distance, seg.maxSpeed, 0, 0, DEFAULT_ACCEL())).toFixed(1)}min</div>`;
      }
      return `<div style="font-size:13px"><span class="mono text-muted" style="margin-right:6px">${i+1}.</span><strong>${esc(label)}</strong>${plat}${pass}${dwell}</div>${segInfo}`;
    }).join('') + '</div></div>';

  // Departures table with edit buttons
  html += `<div class="flex items-center" style="justify-content:space-between"><strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('departures.th.departures')} (${deps.length})</strong>
    ${deps.length ? `<button class="btn btn-sm" onclick="recalcSvcAndRefresh('${svcId}')">↻ ${t('common.recalculate')}</button>` : ''}</div>`;
  if (deps.length) {
    html += `<table class="schedule-table mt-8"><thead><tr><th>${t('schedule.th.dep_time')}</th>`;
    svc.stops.forEach((st, i) => {
      html += `<th>${esc(nodeName(st.nodeId).substring(0, 12))}</th>`;
    });
    html += `<th></th></tr></thead><tbody>`;
    for (const dep of deps) {
      html += `<tr><td style="color:var(--warn);font-weight:500">${toTime(dep.startTime)}</td>`;
      dep.times.forEach(t => {
        const arr = toTime(t.arrive);
        const dept = toTime(t.depart);
        const display = t.arrive != null && t.depart != null ? `${arr}/${dept}` : (t.depart != null ? dept : arr);
        html += `<td>${display}</td>`;
      });
      html += `<td class="actions-cell">
        <button class="btn btn-sm" onclick="openDepEditModal('${dep.id}')">${t('common.edit')}</button>
        <button class="btn btn-sm btn-danger" onclick="delDep('${dep.id}');showServiceDetail('${svcId}')">✕</button></td></tr>`;
    }
    html += '</tbody></table>';
  } else html += '<div class="text-dim mt-8" style="font-size:13px">No departures generated yet.</div>';
  html += '</div>';

  el.innerHTML = html;
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

  if (svcHasGeo) {
    const svcColor = grp?.color || '#ffc917';
    detailMapInitGeo('dm-svc', map => {
      _dmDrawBackground(map);
      // Draw service route
      for (let i = 0; i < svc.stops.length - 1; i++) {
        const seg = findSegByTrack(svc.stops[i].nodeId, svc.stops[i+1].nodeId, svc.stops[i+1]?.trackId);
        const coords = seg ? segmentCoordsDirected(seg, svc.stops[i].nodeId) : (() => {
          const a = getNode(svc.stops[i].nodeId), b = getNode(svc.stops[i+1].nodeId);
          return (a?.lat != null && b?.lat != null) ? [[a.lat, a.lon], [b.lat, b.lon]] : [];
        })();
        if (coords.length < 2) continue;
        L.polyline(coords, { color: '#000', weight: 6, opacity: 0.8 }).addTo(map);
        L.polyline(coords, { color: svcColor, weight: 4, opacity: 1 }).addTo(map);
      }
      // Stop dots + labels
      for (let i = 0; i < svc.stops.length; i++) {
        const n = getNode(svc.stops[i].nodeId);
        if (!n || n.lat == null) continue;
        const isTerminus = i === 0 || i === svc.stops.length - 1;
        const isPass = svc.stops[i].passThrough;
        if (isPass) {
          _dmStationDot(map, n, { radius: 3, fill: '#999', stroke: '#555', weight: 1 });
        } else {
          _dmStationDot(map, n, { radius: isTerminus ? 8 : 6 });
          _dmLabel(map, n);
        }
      }
      _dmFitNodes(map, svcStopNodes);
    });
    const svcNodeSet = new Set(svc.stops.map(st => st.nodeId));
    const svcStopsList = [{ groupId: svc.groupId, stops: svc.stops.map(st => ({ nodeId: st.nodeId, passThrough: !!st.passThrough })) }];
    if (svcBeck) detailMapSetBeck('dm-svc', svcGroupSet, svcNodeSet, 'service', svcStopsList);
  } else if (svcBeck) {
    _detailMaps['dm-svc'] = {};
    const svcNodeSet2 = new Set(svc.stops.map(st => st.nodeId));
    const svcStopsList2 = [{ groupId: svc.groupId, stops: svc.stops.map(st => ({ nodeId: st.nodeId, passThrough: !!st.passThrough })) }];
    detailMapSetBeck('dm-svc', svcGroupSet, svcNodeSet2, 'service', svcStopsList2);
    const svgEl = document.getElementById('dm-svc-beck');
    if (svgEl) renderMiniBeck(svgEl, { focusGroupIds: svcGroupSet, focusNodeIds: svcNodeSet2, mode: 'service', svcStopsList: svcStopsList2 });
  }
}

function closeServiceDetail() { detailMapDestroy('dm-svc'); document.getElementById('service-detail').innerHTML = ''; }

// ---- Schedule pattern editor ----

function buildPatternEditor(pat) {
  const days = pat?.days ? pat.days : [0,1,2,3,4,5,6];
  const ranges = pat?.dateRanges || [];
  const specifics = pat?.specificDates || [];
  const excludes = pat?.excludeDates || [];

  const dayBtns = _DAY_NAMES.map((name, i) => {
    const active = days.includes(i);
    return `<button type="button" class="pattern-day-btn${active ? ' active' : ''}" data-day="${i}" onclick="togglePatternDay(this)">${t('pattern.' + name.toLowerCase())}</button>`;
  }).join('');

  let rangeRows = '';
  for (let r = 0; r < ranges.length; r++) {
    rangeRows += _patternRangeRow(r, ranges[r].from, ranges[r].to);
  }

  const preview = describePattern(pat);

  return `<div class="form-group" id="pattern-editor">
    <label>${t('schedule.pattern.schedule_pattern')}</label>
    <div class="pattern-preview text-dim mb-8" id="pattern-preview" style="font-size:12px">${esc(preview)}</div>
    <div class="pattern-days mb-8">${dayBtns}</div>
    <div id="pattern-ranges">${rangeRows}</div>
    <button type="button" class="btn btn-sm mb-8" onclick="addPatternRange()">${t('schedule.pattern.add_date_range')}</button>
    <div class="form-group" style="margin-bottom:4px">
      <label style="font-size:11px;text-transform:none;font-weight:400;color:var(--text-dim)">${t('schedule.pattern.specific_dates')}</label>
      <input type="text" id="f-patSpecific" value="${esc(specifics.join(', '))}" placeholder="${t('schedule.pattern.placeholder_specific')}" oninput="updatePatternPreview()">
    </div>
    <div class="form-group" style="margin-bottom:0">
      <label style="font-size:11px;text-transform:none;font-weight:400;color:var(--text-dim)">${t('schedule.pattern.exclude_dates')}</label>
      <input type="text" id="f-patExcl" value="${esc(excludes.join(', '))}" placeholder="${t('schedule.pattern.placeholder_exclude')}" oninput="updatePatternPreview()">
    </div>
  </div>`;
}

function _patternRangeRow(idx, from, to) {
  return `<div class="pattern-range-row flex gap-8 items-center mb-4" data-range="${idx}">
    <span style="font-size:11px;color:var(--text-dim)">${t('schedule.pattern.date_range_from')}</span>
    <input type="text" class="pat-range-from" value="${esc(from || '')}" placeholder="${t('schedule.pattern.placeholder_mmdd')}" style="width:70px;font-size:13px" oninput="updatePatternPreview()">
    <span style="font-size:11px;color:var(--text-dim)">${t('schedule.pattern.date_range_to')}</span>
    <input type="text" class="pat-range-to" value="${esc(to || '')}" placeholder="${t('schedule.pattern.placeholder_mmdd')}" style="width:70px;font-size:13px" oninput="updatePatternPreview()">
    <button type="button" class="btn btn-sm" onclick="removePatternRange(this)" style="padding:2px 8px">×</button>
  </div>`;
}

function togglePatternDay(btn) {
  btn.classList.toggle('active');
  updatePatternPreview();
}

function addPatternRange() {
  const container = document.getElementById('pattern-ranges');
  if (!container) return;
  const idx = container.children.length;
  container.insertAdjacentHTML('beforeend', _patternRangeRow(idx, '', ''));
  updatePatternPreview();
}

function removePatternRange(btn) {
  btn.closest('.pattern-range-row').remove();
  updatePatternPreview();
}

function _parseMMDDList(str) {
  if (!str) return [];
  return str.split(/[,;]\s*/).map(d => d.trim()).filter(isValidMMDD);
}

function readPatternFromForm() {
  const dayBtns = document.querySelectorAll('.pattern-day-btn');
  const activeDays = [];
  dayBtns.forEach(btn => { if (btn.classList.contains('active')) activeDays.push(parseInt(btn.dataset.day)); });

  // Date ranges — validate both ends
  const rangeRows = document.querySelectorAll('.pattern-range-row');
  const dateRanges = [];
  for (const row of rangeRows) {
    const from = row.querySelector('.pat-range-from')?.value.trim();
    const to = row.querySelector('.pat-range-to')?.value.trim();
    if (from && to && isValidMMDD(from) && isValidMMDD(to)) dateRanges.push({ from, to });
  }

  // Specific dates + Exclude dates — validated via isValidMMDD
  const specificDates = _parseMMDDList(document.getElementById('f-patSpecific')?.value);
  const excludeDates = _parseMMDDList(document.getElementById('f-patExcl')?.value);

  // Build pattern (null if all defaults = all 7 days, no ranges, no specifics, no excludes)
  const allDays = activeDays.length === 7;
  if (allDays && !dateRanges.length && !specificDates.length && !excludeDates.length) return null;

  const pat = {};
  if (!allDays) pat.days = activeDays.sort((a, b) => a - b);
  if (dateRanges.length) pat.dateRanges = dateRanges;
  if (specificDates.length) pat.specificDates = specificDates;
  if (excludeDates.length) pat.excludeDates = excludeDates;
  return pat;
}

function updatePatternPreview() {
  const pat = readPatternFromForm();
  const el = document.getElementById('pattern-preview');
  if (el) el.textContent = describePattern(pat);
}

// ---- Smart route builder ----
// The service modal now uses a step-by-step approach:
// Pick starting node → pick next connected node (via segment) → repeat

function openServiceModal(id, hField) {
  editingId = id || null;
  const s = id ? getSvc(id) : null;
  const catOpts = data.categories.map(c =>
    `<option value="${c.id}" ${s?.categoryId===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  const grpOpts = data.serviceGroups.map(g =>
    `<option value="${g.id}" ${s?.groupId===g.id?'selected':''}>${esc(g.name)}</option>`).join('');

  // Build route state from existing stops
  window._routeStops = s ? JSON.parse(JSON.stringify(s.stops)) : [];
  window._svcEditStockId = s?.stockId || '';

  openModal(s ? t('services.modal.edit') : t('services.modal.add'), `
    <div class="form-row">
      <div class="form-group"><label>${t('services.field.name')}</label><input type="text" id="f-svN" value="${esc(s?.name||'')}" placeholder="${t('services.placeholder.eg_service')}"></div>
      <div class="form-group"><label>${t('services.field.mode')}</label><select id="f-svC" onchange="rebuildStockOpts()"><option value="">${t('common.select')}</option>${catOpts}</select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>${t('services.field.rolling_stock')}</label><select id="f-svSt"></select></div>
      <div class="form-group"><label>${t('services.field.line')}</label>
        <div class="flex gap-8 items-center">
          <select id="f-svG" style="flex:1"><option value="">${t('common.none')}</option>${grpOpts}</select>
          <button class="btn btn-sm" type="button" onclick="quickCreateGroup()">${t("lines.btn.new_short")}</button>
        </div></div>
    </div>
    <div class="form-group"><label>${t('common.field.description')}</label>
      <input type="text" id="f-svDesc" value="${esc(s?.description||'')}" placeholder="e.g. Skips Almere, runs express to Lelystad"></div>
    ${buildPatternEditor(s?.schedulePattern)}
    <div class="form-group">
      <label>${t('services.field.route')}</label>
      <div id="route-add-prev" class="mb-8"></div>
      <div id="route-builder"></div>
      <div id="route-add-next" class="mt-8"></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">${t('common.cancel')}</button>
     <button class="btn btn-primary" onclick="saveSvc()">${s?t('common.save'):t('services.btn.add')}</button>`);

  rebuildStockOpts();
  renderRouteBuilder();
  if (hField) highlightField(hField);
}

// Rebuild the stock dropdown based on currently selected mode, using the matrix
function rebuildStockOpts() {
  const sel = document.getElementById('f-svSt'); if (!sel) return;
  const modeId = document.getElementById('f-svC')?.value || '';
  const currentStockId = window._svcEditStockId || '';

  // Categorize stock by matrix value
  const typical = [], atypical = [], unassigned = [];
  for (const st of data.rollingStock) {
    const matVal = modeId ? getMatrixValue(st.id, modeId) : '';
    if (matVal === 'disallowed') continue; // hide disallowed
    if (matVal === 'typical') typical.push(st);
    else if (matVal === 'atypical') atypical.push(st);
    else unassigned.push(st);
  }

  let html = `<option value="">${t('common.none')}</option>`;
  const makeOpt = (st, prefix) =>
    `<option value="${st.id}" ${st.id===currentStockId?'selected':''}>${prefix}${esc(st.name)}${st.code?' ['+esc(st.code)+']':''}  (${st.traction}, ${st.acceleration}m/s², ${st.maxSpeed}km/h)</option>`;

  if (typical.length) {
    html += `<optgroup label="Typical">` + typical.map(st => makeOpt(st, '✓ ')).join('') + '</optgroup>';
  }
  if (atypical.length) {
    html += `<optgroup label="Atypical">` + atypical.map(st => makeOpt(st, '⚠ ')).join('') + '</optgroup>';
  }
  if (unassigned.length) {
    const label = (typical.length || atypical.length) ? 'Other' : 'Available';
    html += `<optgroup label="${label}">` + unassigned.map(st => makeOpt(st, '')).join('') + '</optgroup>';
  }

  sel.innerHTML = html;
  // Preserve selection — if the current stock was disallowed, it'll be gone and that's intentional
  if (currentStockId) sel.value = currentStockId;
}

// Keep track of stock selection changes for rebuild persistence
document.addEventListener('change', function(e) {
  if (e.target.id === 'f-svSt') window._svcEditStockId = e.target.value;
});

function renderRouteBuilder() {
  const container = document.getElementById('route-builder');
  const addContainer = document.getElementById('route-add-next');
  const prependContainer = document.getElementById('route-add-prev');
  const stops = window._routeStops;

  if (prependContainer) prependContainer.innerHTML = '';

  if (!stops.length) {
    container.innerHTML = `<div class="text-dim" style="font-size:13px">${t('services.empty.no_stops')}</div>`;
    const sorted = [...data.nodes].sort((a, b) => a.name.localeCompare(b.name));
    addContainer.innerHTML = `<div class="form-group"><label>${t('services.field.starting_node')}</label>
      <select onchange="addRouteStop(this.value);this.value='';">
        <option value="">${t('common.pick_start_node')}</option>
        ${sorted.map(n => `<option value="${n.id}">${esc(n.name)} (${t('type.'+n.type)})</option>`).join('')}
      </select></div>`;
    return;
  }

  // Prepend at start: show nodes connected to the first stop
  if (prependContainer && stops.length >= 1) {
    const firstNodeId = stops[0].nodeId;
    const connToFirst = connectedNodes(firstNodeId).filter(c => {
      if (stops.length >= 2 && c.nodeId === stops[1].nodeId) return false;
      return true;
    });
    if (connToFirst.length) {
      prependContainer.innerHTML = `<select onchange="prependRouteStop(this.value);this.value='';" style="width:100%">
        <option value="">— Prepend before ${esc(nodeName(firstNodeId))}… —</option>
        ${_routeTrackOptions(connToFirst)}
      </select>`;
    }
  }

  let html = '';
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const node = getNode(stop.nodeId);
    const isStation = isPassengerStop(node);
    const platOpts = isStation ? (node.platforms||[]).map(p =>
      `<option value="${p.id}" ${stop.platformId===p.id?'selected':''}>${esc(p.name)}</option>`).join('') : '';

    const isWaypoint = node?.type === 'waypoint';

    html += `<div class="route-step">
      <span class="step-num">${i+1}</span>
      <div class="step-body">
        <div class="step-node-label">${esc(node?.name||'???')}
          <span class="step-type">${node?.type||''}</span></div>
        ${isStation ? `<div class="step-controls mt-8">
          <select onchange="window._routeStops[${i}].platformId=this.value" style="width:120px">
            <option value="">${t('common.platf')}</option>${platOpts}</select>
          <input type="number" value="${stop.dwell||''}" placeholder="Dwell(s)" min="0" style="width:80px"
            onchange="window._routeStops[${i}].dwell=parseInt(this.value)||null">
          <label style="font-size:11px;color:var(--text-dim);display:flex;align-items:center;gap:3px">
            <input type="checkbox" ${stop.passThrough?'checked':''}
              onchange="window._routeStops[${i}].passThrough=this.checked"> Pass</label>
        </div>` : isWaypoint ? `<div class="step-controls mt-8">
          <input type="number" value="${stop.dwell||''}" placeholder="Dwell(s)" min="0" style="width:80px"
            onchange="window._routeStops[${i}].dwell=parseInt(this.value)||null">
          <span class="text-muted" style="font-size:11px">hold time</span>
        </div>` : ''}
      </div>
      ${(() => {
        const isFirst = i === 0;
        const isLast = i === stops.length - 1;
        if (isFirst && stops.length <= 1) return `<button class="remove-step" onclick="clearRoute()" title="${t('nodes.tooltip.clear_route')}">✕</button>`;
        if (isFirst) return `<button class="remove-step" onclick="removeRouteStopFront()" title="${t('nodes.tooltip.remove_start')}">✕</button>`;
        if (isLast) return `<button class="remove-step" onclick="removeRouteStopEnd()" title="${t('nodes.tooltip.remove_end')}">✕</button>`;
        return `<button class="remove-step" onclick="passRouteStop(${i})" title="${t('nodes.tooltip.mark_pass_through')}">✕</button>`;
      })()}
    </div>`;

    // Show segment info between stops (track-focused, with reassignment dropdown)
    if (i < stops.length - 1) {
      const nextStop = stops[i+1];
      const allSegs = findSegs(stop.nodeId, nextStop.nodeId).filter(s => !isInterchange(s));
      const seg = nextStop.trackId ? findSegByTrack(stop.nodeId, nextStop.nodeId, nextStop.trackId) : allSegs[0];
      if (seg) {
        const trkArr = Array.isArray(seg.tracks) ? seg.tracks : [];
        let trackLabel;
        if (trkArr.length <= 1) {
          const tkName = trkArr[0]?.name;
          trackLabel = tkName ? `<span style="color:var(--accent);font-weight:500">${esc(tkName)}</span>` : '';
        } else {
          // Dropdown to reassign track
          trackLabel = `<select onchange="window._routeStops[${i+1}].trackId=this.value;renderRouteBuilder()" style="font-size:11px;padding:1px 4px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--accent);font-weight:500">`;
          trackLabel += `<option value="" ${!nextStop.trackId ? 'selected' : ''}>${t('segments.field.no_track_assigned')}</option>`;
          for (const tk of trkArr) {
            trackLabel += `<option value="${tk.id}" ${nextStop.trackId === tk.id ? 'selected' : ''}>${esc(tk.name)}</option>`;
          }
          trackLabel += `</select>`;
        }
        html += `<div class="route-step" style="border:none;padding:2px 0 2px 4px;">
          <span class="step-num" style="font-size:10px;opacity:0.4">↓</span>
          <div style="font-size:11px">${trackLabel}${trackLabel ? ' · ' : ''}${seg.distance}km · ${seg.maxSpeed}km/h · <span class="text-muted">~${calcSegmentTime(seg.distance, seg.maxSpeed, 0, 0, DEFAULT_ACCEL()).toFixed(1)}min</span></div>
        </div>`;
      }
    }
  }
  container.innerHTML = html;

  // Show next node options (connected to last stop)
  const lastNodeId = stops[stops.length - 1].nodeId;
  const connected = connectedNodes(lastNodeId).filter(c => {
    // Don't offer going back to the immediately previous node (but allow loops otherwise)
    if (stops.length >= 2 && c.nodeId === stops[stops.length - 2].nodeId) return false;
    return true;
  });

  if (connected.length) {
    addContainer.innerHTML = `<select onchange="addRouteStop(this.value);this.value='';" style="width:100%">
      <option value="">${t('segments.seg.extend_to')}</option>
      ${_routeTrackOptions(connected)}
    </select>`;
  } else {
    addContainer.innerHTML = `<div class="text-dim" style="font-size:12px">${t('nodes.empty.no_further_connections')}</div>`;
  }
}

// Build dropdown options with per-track entries for multi-track segments
// Filters out segments that don't allow the current service's mode
function _routeTrackOptions(connections) {
  const currentModeId = document.getElementById('f-svC')?.value || '';
  const opts = [];
  for (const c of connections) {
    const seg = getSeg(c.segId);
    // Skip segments that restrict this mode
    if (currentModeId && seg?.allowedModes?.length && !seg.allowedModes.includes(currentModeId)) continue;
    const n = getNode(c.nodeId);
    const nLabel = esc(n?.name || '???');
    const nType = n?.type ? t('type.' + n.type) : '?';
    const trkArr = Array.isArray(seg?.tracks) ? seg.tracks : [];
    if (trkArr.length <= 1) {
      // Single-track or no tracks: one option, auto-assign track
      const tid = trkArr[0]?.id || '';
      opts.push(`<option value="${c.nodeId}::${c.segId}::${tid}">${nLabel} (${nType}) via ${seg.distance}km</option>`);
    } else {
      // Multi-track: one option per track
      for (const tk of trkArr) {
        opts.push(`<option value="${c.nodeId}::${c.segId}::${tk.id}">${nLabel} (${nType}) via ${esc(tk.name)} · ${seg.distance}km</option>`);
      }
    }
  }
  return opts.join('');
}

// Find eligible platforms based on schematic connection to incoming track
function _autoSelectPlatform(node, segId, trackId) {
  if (!node || !isPassengerStop(node)) return null;
  const plats = node.platforms || [];
  if (plats.length === 1) return plats[0].id;
  if (!node.schematic?.tracks?.length || !segId || !trackId) return null;
  // Find station tracks connected to this segment track, collect their platforms
  const eligible = new Set();
  for (const trk of node.schematic.tracks) {
    for (const side of ['sideA', 'sideB', 'sideC', 'sideD']) {
      for (const c of (trk[side] || [])) {
        if (c.segId === segId && c.trackId === trackId) {
          for (const pid of (trk.platformIds || [])) eligible.add(pid);
        }
      }
    }
  }
  if (eligible.size === 1) return [...eligible][0];
  return null; // Multiple or none — let user choose
}

function addRouteStop(encoded) {
  if (!encoded) return;
  const [nodeId, segId, trackId] = encoded.split('::');
  const node = getNode(nodeId);
  const autoPass = node && !isPassengerStop(node);
  const autoPlatform = _autoSelectPlatform(node, segId, trackId);
  window._routeStops.push({ nodeId, platformId: autoPlatform, dwell: null, passThrough: autoPass, trackId: trackId || null });
  renderRouteBuilder();
  const modalBody = document.querySelector('.modal-body');
  if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
}
function prependRouteStop(encoded) {
  if (!encoded) return;
  const [nodeId, segId, trackId] = encoded.split('::');
  const node = getNode(nodeId);
  const autoPass = node && !isPassengerStop(node);
  const autoPlatform = _autoSelectPlatform(node, segId, trackId);
  window._routeStops.unshift({ nodeId, platformId: autoPlatform, dwell: null, passThrough: autoPass, trackId: trackId || null });
  renderRouteBuilder();
}
function removeRouteStop(idx) {
  // Legacy: trim from this index onward
  window._routeStops = window._routeStops.slice(0, idx);
  renderRouteBuilder();
}
function removeRouteStopFront() {
  // Remove the first stop, keep the rest
  window._routeStops = window._routeStops.slice(1);
  renderRouteBuilder();
}
function removeRouteStopEnd() {
  // Remove the last stop
  window._routeStops = window._routeStops.slice(0, -1);
  renderRouteBuilder();
}
function passRouteStop(idx) {
  // Mark a middle stop as pass-through instead of removing it
  if (window._routeStops[idx]) {
    window._routeStops[idx].passThrough = true;
    window._routeStops[idx].platformId = null;
    window._routeStops[idx].dwell = null;
    renderRouteBuilder();
  }
}
function clearRoute() {
  window._routeStops = [];
  renderRouteBuilder();
}

function saveSvc() {
  const name = document.getElementById('f-svN').value.trim();
  if (!name) { toast(t('nodes.toast.name_required'), 'error'); return; }
  const categoryId = document.getElementById('f-svC').value;
  const stockId = document.getElementById('f-svSt').value || null;
  const groupId = document.getElementById('f-svG').value || null;
  const description = document.getElementById('f-svDesc').value.trim();
  const stops = window._routeStops;
  if (stops.length < 2) { toast(t('services.toast.min_two_stops'), 'error'); return; }

  const schedulePattern = readPatternFromForm();

  if (editingId) {
    Object.assign(getSvc(editingId), { name, categoryId, stockId, groupId, description, stops, schedulePattern });
    toast(t('services.toast.updated'), 'success');
  } else {
    data.services.push({ id: uid(), name, categoryId, stockId, groupId, description, stops, schedulePattern });
    toast(t('services.toast.added'), 'success');
  }
  save(); closeModal(); renderServices(); updateBadges();
}

function reverseService(id) {
  const svc = getSvc(id); if (!svc) return;
  const reversed = JSON.parse(JSON.stringify(svc));
  reversed.id = uid();
  reversed.name = svc.name + ' (rev)';
  reversed.stops = reversed.stops.slice().reverse();

  // Track assignment: trackId lives on the DESTINATION stop of each segment.
  // Original A→B→C→D: stops[1].trackId = A→B track, stops[2] = B→C, stops[3] = C→D.
  // Reversed D→C→B→A: leg 0 (D→C) needs opposite of C→D track = stops[3].trackId.
  // Leg i destination in reversed needs opposite of original stops[len-1-i].trackId.
  for (let i = 0; i < reversed.stops.length - 1; i++) {
    const revDest = reversed.stops[i + 1]; // destination of this leg in reversed
    const origIdx = svc.stops.length - 1 - i; // original stop that held this leg's track
    const origTrackId = origIdx >= 1 ? svc.stops[origIdx]?.trackId : null;

    const segs = findSegs(reversed.stops[i].nodeId, revDest.nodeId).filter(s => !isInterchange(s));
    if (segs.length === 1) {
      const trkArr = Array.isArray(segs[0].tracks) ? segs[0].tracks : [];
      if (trkArr.length === 2 && origTrackId) {
        const opposite = trkArr.find(tk => tk.id !== origTrackId);
        revDest.trackId = opposite ? opposite.id : trkArr[0].id;
      } else if (trkArr.length === 1) {
        revDest.trackId = trkArr[0].id;
      } else {
        revDest.trackId = null;
      }
    } else {
      revDest.trackId = null;
    }
  }

  // Platform assignment
  for (let i = 0; i < reversed.stops.length; i++) {
    const stop = reversed.stops[i];
    const origStop = svc.stops[svc.stops.length - 1 - i];
    const node = getNode(stop.nodeId);
    if (node && isPassengerStop(node)) {
      const plats = node.platforms || [];
      if (plats.length === 2 && origStop.platformId) {
        const opposite = plats.find(p => p.id !== origStop.platformId);
        stop.platformId = opposite ? opposite.id : null;
      } else if (plats.length === 1) {
        stop.platformId = plats[0].id;
      } else {
        const nextStop = i < reversed.stops.length - 1 ? reversed.stops[i + 1] : null;
        const seg = nextStop ? findSegByTrack(stop.nodeId, nextStop.nodeId, nextStop.trackId) : null;
        stop.platformId = seg ? (_autoSelectPlatform(node, seg.id, nextStop?.trackId) || null) : null;
      }
    } else {
      stop.platformId = null;
    }
  }

  data.services.push(reversed);
  save(); renderServices(); updateBadges();
  toast(t('services.toast.reversed_created', { name: reversed.name }), 'success');
}

function duplicateService(id) {
  const svc = getSvc(id); if (!svc) return;
  const dup = JSON.parse(JSON.stringify(svc));
  dup.id = uid();
  dup.name = svc.name + ' (copy)';
  data.services.push(dup);
  save(); renderServices(); updateBadges();
  toast(t('services.toast.duplicated', { name: dup.name }), 'success');
}

function deleteSvc(id) {
  const svc = getSvc(id);
  const depCount = data.departures.filter(d => d.serviceId === id).length;
  let impact = '';
  if (depCount) impact += `\n• ${depCount} departure${depCount!==1?'s':''} will be removed`;
  appConfirm(t('services.confirm.delete', { name: svc?.name || '?' }) + (impact ? '\n' + impact : ''), () => {
    data.services = data.services.filter(s => s.id !== id);
    data.departures = data.departures.filter(d => d.serviceId !== id);
    save(); renderServices(); updateBadges(); toast(t('services.toast.deleted'), 'success');
  });
}
