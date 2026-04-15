// ============================================================
// SETTINGS
// ============================================================
function renderSettings() {
  const el = document.getElementById('settings-content');
  const s = data.settings || {};

  // Update header and title
  updateSystemName();

  // All non-high issue types for toggle list
  const issueTypes = [
    { key: 'disallowed_stock_mode', sev: 'medium' },
    { key: 'duplicate_segment', sev: 'medium' },
    { key: 'invalid_platform_override', sev: 'medium' },
    { key: 'invalid_platform_reference', sev: 'medium' },
    { key: 'missing_platform', sev: 'medium' },
    { key: 'no_departures', sev: 'medium' },
    { key: 'no_mode', sev: 'medium' },
    { key: 'no_stock_assigned', sev: 'medium' },
    { key: 'non_station_stop', sev: 'medium' },
    { key: 'orphan_departures', sev: 'medium' },
    { key: 'pass_through_terminus', sev: 'medium' },
    { key: 'stale_departure', sev: 'medium' },
    { key: 'segment_overlap', sev: 'medium' },
    { key: 'suspicious_segment', sev: 'medium' },
    { key: 'waypoint_connection_count', sev: 'medium' },
    { key: 'auto_generated_name', sev: 'low' },
    { key: 'cross_cutoff_journey', sev: 'low' },
    { key: 'duplicate_name', sev: 'low' },
    { key: 'duplicate_node_name', sev: 'low' },
    { key: 'duplicate_ref_code', sev: 'low' },
    { key: 'incomplete_segment', sev: 'low' },
    { key: 'isolated_node', sev: 'low' },
    { key: 'missing_ogf_node', sev: 'low' },
    { key: 'no_platforms', sev: 'low' },
    { key: 'schematic_mismatch', sev: 'low' },
    { key: 'departure_schematic_mismatch', sev: 'low' },
    { key: 'unassigned_platform', sev: 'low' },
    { key: 'unconnected_segment_track', sev: 'low' },
    { key: 'ungrouped_service', sev: 'low' },
    { key: 'unlinked_station_group', sev: 'medium' },
  ];

  const hiddenIssues = s.hiddenIssueTypes || [];

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="btn btn-sm settings-tab active" data-stab="general" onclick="switchSettingsTab('general')">${t('settings.tab_general')}</button>
      <button class="btn btn-sm settings-tab" data-stab="defaults" onclick="switchSettingsTab('defaults')">${t('settings.tab_defaults')}</button>
      <button class="btn btn-sm settings-tab" data-stab="issues" onclick="switchSettingsTab('issues')">${t('settings.tab_issues')}</button>
    </div>

    <div id="stab-general" class="settings-section">
      <div class="form-group"><label>${t('field.system_name')}</label>
        <input type="text" id="set-name" value="${esc(s.systemName || '')}" placeholder="e.g. Hemstein Railway Network" onchange="saveSetting('systemName', this.value); updateSystemName()">
        <p class="text-dim" style="font-size:11px;margin-top:2px">${t('settings.system_name_desc')}</p>
      </div>
      <div class="form-group"><label>${t('field.colour_scheme')}</label>
        <select id="set-theme" onchange="saveSetting('theme', this.value); applyTheme()">
          <option value="dark" ${(s.theme||'dark')==='dark'?'selected':''}>${t('settings.dark')}</option>
          <option value="light" ${s.theme==='light'?'selected':''}>${t('settings.light')}</option>
          <option value="system" ${s.theme==='system'?'selected':''}>${t('settings.system_pref')}</option>
        </select>
      </div>
      <div class="form-group"><label>${t('label.language')}</label>
        <select id="set-language" onchange="setLanguage(this.value)">
          ${_availableLanguages.map(l => `<option value="${l.code}" ${l.code === _lang ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
        </select>
        <p class="text-dim" style="font-size:11px;margin-top:2px">${t('settings.language_desc')}</p>
        <button class="btn btn-sm mt-8" onclick="showLanguageReport()">${t('settings.check_translations')}</button>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:13px;color:var(--text);">
          <input type="checkbox" ${(s.stripBrackets ?? true) ? 'checked' : ''} onchange="saveSetting('stripBrackets', this.checked)">
          ${t('settings.strip_brackets')}</label>
        <p class="text-dim" style="font-size:11px;margin-top:2px">${t('settings.strip_brackets_desc')}</p>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:13px;color:var(--text);">
          <input type="checkbox" ${(s.jpMapTiles ?? true) ? 'checked' : ''} onchange="saveSetting('jpMapTiles', this.checked)">
          ${t('settings.jp_map_tiles')}</label>
        <p class="text-dim" style="font-size:11px;margin-top:2px">${t('settings.jp_map_tiles_desc')}</p>
      </div>
      <div class="form-group">
        <label style="font-size:13px;color:var(--text)">Default detail map view</label>
        <select onchange="saveSetting('defaultDetailMap', this.value)" style="width:200px">
          <option value="geo" ${(s.defaultDetailMap||'geo')==='geo'?'selected':''}>Geomap</option>
          <option value="beck" ${s.defaultDetailMap==='beck'?'selected':''}>Railmap</option>
        </select>
      </div>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:13px;color:var(--text);">
          <input type="checkbox" ${s.beckShowInfra ? 'checked' : ''} onchange="saveSetting('beckShowInfra', this.checked)">
          Show all infrastructure on Railmap</label>
        <p class="text-dim" style="font-size:11px;margin-top:2px">When enabled, all stations and segments are visible on the Railmap, even if not assigned to a service or line. Unassigned elements appear in grey.</p>
      </div>
      <div class="form-group" style="margin-top:24px">
        <button class="btn btn-danger" onclick="newSystem()">${t('btn.new_system')}</button>
        <p class="text-dim" style="font-size:11px;margin-top:4px">${t('settings.new_system_desc')}</p>
      </div>
    </div>

    <div id="stab-defaults" class="settings-section" style="display:none">
      <p class="text-dim" style="font-size:13px;margin-bottom:16px">${t('settings.defaults_desc')}</p>
      <div class="form-row">
        <div class="form-group"><label>${t('field.walking_speed')}</label>
          <input type="number" id="set-walk" value="${s.walkingSpeed ?? 4.5}" min="1" max="10" step="0.1" onchange="saveSetting('walkingSpeed', parseFloat(this.value))"></div>
        <div class="form-group"><label>${t('field.transfer_time')}</label>
          <input type="number" id="set-xfer" value="${s.transferTime ?? 5}" min="0" max="30" onchange="saveSetting('transferTime', parseInt(this.value))"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('field.day_cutoff')}</label>
          <input type="time" id="set-cutoff" value="${(() => { const c = s.dayCutoff ?? 240; return String(Math.floor(c/60)).padStart(2,'0') + ':' + String(c%60).padStart(2,'0'); })()}" onchange="saveSetting('dayCutoff', toMin(this.value))">
          <p class="text-dim" style="font-size:11px;margin-top:2px">${t('settings.cutoff_desc')}</p></div>
        <div class="form-group"><label>${t('field.default_plt_clearance')}</label>
          <input type="number" id="set-plcl" value="${s.platformClearance ?? 3}" min="0" max="30" onchange="saveSetting('platformClearance', parseInt(this.value))">
          <p class="text-dim" style="font-size:11px;margin-top:2px">${t('settings.clearance_desc')}</p></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>${t('field.default_accel')}</label>
          <input type="number" id="set-accel" value="${s.defaultAcceleration ?? 1.0}" min="0.1" max="5" step="0.1" onchange="saveSetting('defaultAcceleration', parseFloat(this.value))"></div>
        <div class="form-group"><label>${t('field.default_dwell_time')}</label>
          <input type="number" id="set-dwell" value="${s.defaultDwell ?? 60}" min="0" max="600" onchange="saveSetting('defaultDwell', parseInt(this.value))"></div>
        <div class="form-group"><label>${t('field.default_platforms')}</label>
          <input type="number" id="set-plats" value="${s.defaultPlatforms ?? 2}" min="0" max="20" onchange="saveSetting('defaultPlatforms', parseInt(this.value))"></div>
      </div>
    </div>

    <div id="stab-issues" class="settings-section" style="display:none">
      <p class="text-dim" style="font-size:13px;margin-bottom:12px">${t('settings.issues_desc')}</p>
      <div class="form-group mb-16">
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:500;font-size:13px;color:var(--text);">
          <input type="checkbox" id="set-lowsev" ${!(s.hideLowSeverity) ? 'checked' : ''} onchange="saveSetting('hideLowSeverity', !this.checked); renderSettings(); switchSettingsTab('issues')">
          ${t('settings.show_low_severity')}</label>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:12px">
        <strong style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">${t('label.individual_issue_types')}</strong>
        <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px 16px">
          ${issueTypes.map(it => {
            const isLow = it.sev === "low";
            const greyed = s.hideLowSeverity && isLow;
            const hidden = hiddenIssues.includes(it.key);
            const sevColor = it.sev === 'medium' ? 'var(--warn)' : 'var(--text-dim)';
            return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:4px 0;cursor:pointer;${greyed ? "opacity:0.4" : ""}">
              <input type="checkbox" ${!hidden ? 'checked' : ''} ${greyed ? 'disabled' : ''} onchange="toggleIssueType('${it.key}', !this.checked)">
              <span style="width:6px;height:6px;border-radius:50%;background:${sevColor};flex-shrink:0"></span>
              ${t("issue.type." + it.key)}</label>`;
          }).join('\n          ')}
        </div>
      </div>
    </div>`;
}

function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.settings-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('stab-' + tab).style.display = '';
  document.querySelector(`.settings-tab[data-stab="${tab}"]`)?.classList.add('active');
}

function saveSetting(key, value) {
  if (!data.settings) data.settings = {};
  data.settings[key] = value;
  save();
}

function toggleIssueType(type, hide) {
  if (!data.settings) data.settings = {};
  if (!data.settings.hiddenIssueTypes) data.settings.hiddenIssueTypes = [];
  if (hide && !data.settings.hiddenIssueTypes.includes(type)) {
    data.settings.hiddenIssueTypes.push(type);
  } else if (!hide) {
    data.settings.hiddenIssueTypes = data.settings.hiddenIssueTypes.filter(t => t !== type);
  }
  save();
}

function updateSystemName() {
  const name = data.settings?.systemName || '';
  const headerEl = document.getElementById('system-name-header');
  if (headerEl) headerEl.textContent = name ? '— ' + name : '';
  document.title = name ? `BRIXYmanager — ${name}` : 'BRIXYmanager';
  if (typeof updateSavesDropdownLabel === 'function') updateSavesDropdownLabel();
}

function applyTheme() {
  // Placeholder for future light/system theme support
  const theme = data.settings?.theme || 'dark';
  // For now, only dark is implemented
  if (theme !== 'dark') toast(t('toast.theme_coming'), 'info');
}

// ============================================================
// ISSUE DETECTION
// ============================================================

function showOverlapResolutionModal(segAId, segBId) {
  const segA = getSeg(segAId), segB = getSeg(segBId);
  if (!segA || !segB) { toast(t('resolve.error'), 'error'); return; }
  if (!segA.wayGeometry?.length || !segB.wayGeometry?.length) { toast(t('resolve.no_geometry'), 'error'); return; }

  const divergence = findDivergencePoint(segA, segB, 0.05);
  if (!divergence) { toast(t('resolve.no_divergence'), 'error'); return; }

  const proposal = buildOverlapResolution(segA, segB, divergence);
  const sharedName = nodeName(proposal.sharedNode);
  const farAName = nodeName(proposal.farNodeA);
  const farBName = nodeName(proposal.farNodeB);
  const sharedM = Math.round(proposal.sharedDist * 1000);

  const mapId = 'resolve-map-' + uid();
  const body = `
    <div style="margin-bottom:16px">
      <div id="${mapId}" style="height:280px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg)"></div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">${t('resolve.proposed')}</div>
      <ul style="font-size:13px;color:var(--text-dim);margin-left:16px;line-height:1.8">
        <li>${t('resolve.insert_junction', { lat: divergence.coord[0].toFixed(4), lon: divergence.coord[1].toFixed(4) })}</li>
        <li>${t('resolve.create_shared', { from: sharedName, dist: sharedM })}</li>
        <li>${t('resolve.modify_seg', { from: 'Junction', to: farAName, dist: Math.round(proposal.remainderADist * 1000) })}</li>
        <li>${t('resolve.modify_seg', { from: 'Junction', to: farBName, dist: Math.round(proposal.remainderBDist * 1000) })}</li>
        <li>${t('resolve.update_services', { n: proposal.affectedServices.length })}</li>
      </ul>
    </div>`;

  openModal(t('resolve.title'), body,
    `<button class="btn" onclick="closeModal()">${t('btn.cancel')}</button>
     <button class="btn btn-primary" onclick="_executeOverlapResolution('${segAId}','${segBId}')">${t('resolve.apply')}</button>`);

  // Render map after modal is open
  setTimeout(() => {
    const mapEl = document.getElementById(mapId);
    if (!mapEl) return;
    const map = L.map(mapEl, { zoomControl: true, attributionControl: false });
    if (data.settings?.jpMapTiles !== false) {
      L.tileLayer('https://tile.opengeofiction.net/ogf-carto/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    }

    // Draw original segments
    L.polyline(segA.wayGeometry, { color: '#e05555', weight: 4, opacity: 0.7, dashArray: '8,4' }).addTo(map).bindTooltip(sharedName + ' \u2014 ' + farAName);
    L.polyline(segB.wayGeometry, { color: '#5b8af5', weight: 4, opacity: 0.7, dashArray: '8,4' }).addTo(map).bindTooltip(sharedName + ' \u2014 ' + farBName);

    // Draw proposed segments
    L.polyline(proposal.sharedGeo, { color: '#55c07a', weight: 5, opacity: 1 }).addTo(map).bindTooltip(t('resolve.shared_label'));
    L.polyline(proposal.remainderA, { color: '#e05555', weight: 3, opacity: 1 }).addTo(map);
    L.polyline(proposal.remainderB, { color: '#5b8af5', weight: 3, opacity: 1 }).addTo(map);

    // Mark junction point
    L.circleMarker(divergence.coord, { radius: 7, fillColor: '#ffc917', color: '#333', weight: 2, fillOpacity: 1 }).addTo(map).bindTooltip(t('resolve.junction_label'));

    // Mark endpoints
    const endNodes = [proposal.sharedNode, proposal.farNodeA, proposal.farNodeB].map(getNode).filter(n => n?.lat);
    for (const n of endNodes) {
      L.circleMarker([n.lat, n.lon], { radius: 5, fillColor: '#fff', color: '#333', weight: 2, fillOpacity: 1 }).addTo(map);
    }

    // Fit bounds
    const allCoords = [...segA.wayGeometry, ...segB.wayGeometry];
    map.fitBounds(L.latLngBounds(allCoords), { padding: [30, 30] });
  }, 150);
}

function _executeOverlapResolution(segAId, segBId) {
  const segA = getSeg(segAId), segB = getSeg(segBId);
  if (!segA || !segB) return;

  const divergence = findDivergencePoint(segA, segB, 0.05);
  if (!divergence) return;

  const proposal = buildOverlapResolution(segA, segB, divergence);
  const result = applyOverlapResolution(proposal);

  closeModal();
  refreshAll();
  toast(t('resolve.success', { n: result.servicesUpdated }), 'success');
}

function verifySegment(segId) {
  if (!data.settings.verifiedSegments) data.settings.verifiedSegments = [];
  if (!data.settings.verifiedSegments.includes(segId)) {
    data.settings.verifiedSegments.push(segId);
    save();
  }
  runIssueDetection();
}

function runIssueDetection() {
  const issues = []; // { severity: 'high'|'medium'|'low', type, desc, detail }

  // ---- HIGH: Scheduling conflicts (per-track) ----
  const segOcc = {}, platOcc = {};
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc || dep.times.length < 2) continue;
    for (let i = 0; i < dep.times.length - 1; i++) {
      const from = dep.times[i], to = dep.times[i + 1];
      if (from.depart == null || to.arrive == null) continue;
      const nextStop = svc.stops[i+1];
      const stopTrackId = nextStop?.trackId || null;
      const seg = findSegByTrack(from.nodeId, to.nodeId, stopTrackId);
      if (!seg) continue;
      const tc = segTrackCount(seg);
      const trackId = stopTrackId || (tc === 1 && Array.isArray(seg.tracks) && seg.tracks[0] ? seg.tracks[0].id : null);
      if (trackId) {
        const occKey = `${seg.id}::${trackId}`;
        if (!segOcc[occKey]) segOcc[occKey] = [];
        segOcc[occKey].push({ depId: dep.id, svcId: dep.serviceId, enter: from.depart, exit: to.arrive, segId: seg.id, trackId });
      }
    }
    for (let i = 0; i < dep.times.length; i++) {
      const t = dep.times[i], stop = svc.stops[i];
      const effectivePlat = depPlatId(dep, svc, i);
      if (!effectivePlat || stop?.passThrough) continue;
      const arr = t.arrive ?? t.depart, dept = t.depart ?? t.arrive;
      if (arr == null || dept == null) continue;
      const key = `${t.nodeId}::${effectivePlat}`;
      if (!platOcc[key]) platOcc[key] = [];
      platOcc[key].push({ depId: dep.id, svcId: dep.serviceId, arrive: arr, depart: dept, categoryId: svc.categoryId });
    }
  }
  for (const [occKey, occs] of Object.entries(segOcc)) {
    const [segId, trackId] = occKey.split('::');
    const seg = getSeg(segId);
    const tkName = seg && Array.isArray(seg.tracks) ? seg.tracks.find(tk => tk.id === trackId)?.name : null;
    for (let i = 0; i < occs.length; i++) for (let j = i + 1; j < occs.length; j++) {
      const a = occs[i], b = occs[j];
      if (!patternsOverlap(getSvc(a.svcId)?.schedulePattern, getSvc(b.svcId)?.schedulePattern)) continue;
      if (a.enter < b.exit && b.enter < a.exit)
        issues.push({ severity: 'high', type: t('issue.type.single_track_conflict'), typeKey: 'single_track_conflict',
          desc: t('issue.desc.single_track_conflict', { a: getSvc(a.svcId)?.name||'?', b: getSvc(b.svcId)?.name||'?', from: nodeName(seg.nodeA), to: nodeName(seg.nodeB) }) + (tkName ? ' (' + tkName + ')' : ''),
          detail: t('issue.detail.single_track_conflict', { a_time: toTime(a.enter)+'–'+toTime(a.exit), b_time: toTime(b.enter)+'–'+toTime(b.exit) }),
          action: `setSearchValue('segment-search','');switchTab('segments');showSegmentDetail('${segId}')` });
    }
  }
  for (const [key, occs] of Object.entries(platOcc)) {
    const [stId, plId] = key.split('::');
    for (let i = 0; i < occs.length; i++) for (let j = i + 1; j < occs.length; j++) {
      const a = occs[i], b = occs[j];
      // Pattern overlap check: skip if services never run on the same day
      if (!patternsOverlap(getSvc(a.svcId)?.schedulePattern, getSvc(b.svcId)?.schedulePattern)) continue;
      // Per-mode clearance: take the highest of both modes' clearance values
      const aClearance = getCat(a.categoryId)?.platformClearance ?? PLATFORM_CLEARANCE_MIN_();
      const bClearance = getCat(b.categoryId)?.platformClearance ?? PLATFORM_CLEARANCE_MIN_();
      const clearance = Math.max(aClearance, bClearance);
      const aEnd = a.depart + clearance;
      const bEnd = b.depart + clearance;
      if (a.arrive < bEnd && b.arrive < aEnd)
        issues.push({ severity: 'high', type: t('issue.type.platform_conflict'), typeKey: 'platform_conflict',
          desc: t('issue.desc.platform_conflict', { a: getSvc(a.svcId)?.name||'?', b: getSvc(b.svcId)?.name||'?', station: nodeName(stId), platform: platName(stId, plId) }),
          detail: t('issue.detail.platform_conflict', { a_time: toTime(a.arrive)+'–'+toTime(a.depart), b_time: toTime(b.arrive)+'–'+toTime(b.depart), clearance }),
          action: `setSearchValue('node-search','');switchTab('nodes');showNodeDetail('${stId}')` });
    }
  }

  // ---- MEDIUM: Operational warnings ----

  for (const svc of data.services) {
    if (!data.departures.some(d => d.serviceId === svc.id)) {
      issues.push({ severity: 'medium', type: t('issue.type.no_departures'), typeKey: 'no_departures',
        desc: t('issue.desc.no_departures', { name: svc.name }),
        detail: t('issue.detail.no_departures'),
        action: `openScheduleModal('${svc.id}')` });
    }
  }

  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length; i++) {
      const stop = svc.stops[i];
      if (stop.passThrough) continue;
      const node = getNode(stop.nodeId);
      if (isPassengerStop(node) && (node.platforms||[]).length > 0 && !stop.platformId) {
        issues.push({ severity: 'medium', type: t('issue.type.missing_platform'), typeKey: 'missing_platform',
          desc: t('issue.desc.missing_platform', { name: svc.name, station: node.name }),
          detail: t('issue.detail.missing_platform', { n: i+1 }),
          action: `openServiceModal('${svc.id}')` });
      }
    }
  }

  for (const svc of data.services) {
    if (!svc.categoryId || !getCat(svc.categoryId)) {
      issues.push({ severity: 'medium', type: t('issue.type.no_mode'), typeKey: 'no_mode',
        desc: t('issue.desc.no_mode', { name: svc.name }),
        detail: t('issue.detail.no_mode'),
        action: `openServiceModal('${svc.id}','f-svcMode')` });
    }
  }

  const orphanDeps = data.departures.filter(d => !getSvc(d.serviceId));
  if (orphanDeps.length) {
    issues.push({ severity: 'medium', type: t('issue.type.orphan_departures'), typeKey: 'orphan_departures',
      desc: t('issue.desc.orphan_departures', { n: orphanDeps.length }),
      detail: t('issue.detail.orphan_departures'),
      action: `switchTab('schedule');setTimeout(()=>{const s=document.getElementById('sch-filter');if(s){s.value='__orphaned__';renderSchTable();}},100)` });
  }

  for (const svc of data.services) {
    const stock = getStock(svc.stockId);
    if (!stock || stock.traction !== 'electric') continue;
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const seg = findSeg(svc.stops[i].nodeId, svc.stops[i+1].nodeId);
      if (seg && !seg.electrification && !isRoad(seg)) {
        issues.push({ severity: 'high', type: t('issue.type.electrification_mismatch'), typeKey: 'electrification_mismatch',
          desc: t('issue.desc.electrification_mismatch', { name: svc.name, stock: stock.name, from: nodeName(seg.nodeA), to: nodeName(seg.nodeB) }),
          detail: t('issue.detail.electrification_mismatch'),
          action: `openServiceModal('${svc.id}')` });
        break;
      }
    }
  }

  // Mode-infrastructure mismatch: rail mode on road segment or road mode on track segment
  for (const svc of data.services) {
    const cat = getCat(svc.categoryId);
    if (!cat) continue;
    const modeInfra = cat.infrastructureType || 'rail';
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const seg = findSegByTrack(svc.stops[i].nodeId, svc.stops[i+1].nodeId, svc.stops[i+1]?.trackId);
      if (!seg) continue;
      const segInfra = isRoad(seg) ? 'road' : 'rail';
      if (modeInfra !== segInfra) {
        issues.push({ severity: 'medium', type: t('issue.type.infra_mismatch'), typeKey: 'infra_mismatch',
          desc: t('issue.desc.infra_mismatch', { name: svc.name, mode: cat.name, modeInfra, segInfra, from: nodeName(seg.nodeA), to: nodeName(seg.nodeB) }),
          detail: t('issue.detail.infra_mismatch'),
          action: `openServiceModal('${svc.id}')` });
        break;
      }
    }
  }

  // Mode-segment allowedModes mismatch
  for (const svc of data.services) {
    if (!svc.categoryId) continue;
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const seg = findSegByTrack(svc.stops[i].nodeId, svc.stops[i+1].nodeId, svc.stops[i+1]?.trackId);
      if (!seg || !seg.allowedModes?.length) continue;
      if (!seg.allowedModes.includes(svc.categoryId)) {
        const cat = getCat(svc.categoryId);
        issues.push({ severity: 'medium', type: t('issue.type.mode_not_allowed'), typeKey: 'mode_not_allowed',
          desc: t('issue.desc.mode_not_allowed', { name: svc.name, mode: cat?.name || '?', from: nodeName(seg.nodeA), to: nodeName(seg.nodeB) }),
          detail: t('issue.detail.mode_not_allowed'),
          action: `setSearchValue('segment-search','');switchTab('segments');showSegmentDetail('${seg.id}')` });
        break;
      }
    }
  }

  for (const svc of data.services) {
    const stock = getStock(svc.stockId);
    const cat = getCat(svc.categoryId);
    if (!stock || !cat) continue;
    const matVal = getMatrixValue(stock.id, cat.id);
    if (matVal === 'disallowed') {
      issues.push({ severity: 'medium', type: t('issue.type.disallowed_stock_mode'), typeKey: 'disallowed_stock_mode',
        desc: t('issue.desc.disallowed_stock_mode', { name: svc.name, stock: stock.name, mode: cat.name }),
        detail: t('issue.detail.disallowed_stock_mode'),
        action: `openServiceModal('${svc.id}')` });
    }
  }

  if (data.rollingStock.length > 0) {
    for (const svc of data.services) {
      if (!svc.stockId || !getStock(svc.stockId)) {
        issues.push({ severity: 'medium', type: t('issue.type.no_stock_assigned'), typeKey: 'no_stock_assigned',
          desc: t('issue.desc.no_stock_assigned', { name: svc.name }),
          detail: t('issue.detail.no_stock_assigned'),
          action: `openServiceModal('${svc.id}','f-svcStock')` });
      }
    }
  }

  // Stale platform references (platform was removed or renamed, but ID still referenced)
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length; i++) {
      const stop = svc.stops[i];
      if (!stop.platformId || stop.passThrough) continue;
      const node = getNode(stop.nodeId);
      if (!node) continue;
      const plat = (node.platforms || []).find(p => p.id === stop.platformId);
      if (!plat) {
        issues.push({ severity: 'medium', type: t('issue.type.invalid_platform_reference'), typeKey: 'invalid_platform_reference',
          desc: t('issue.desc.invalid_platform_reference', { name: svc.name, station: node.name }),
          detail: t('issue.detail.invalid_platform_reference'),
          action: `openServiceModal('${svc.id}')` });
      }
    }
  }
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    const overrides = dep.platformOverrides || {};
    for (const [idxStr, platId] of Object.entries(overrides)) {
      if (!platId) continue;
      const i = parseInt(idxStr);
      const stop = svc.stops[i]; if (!stop) continue;
      const node = getNode(stop.nodeId); if (!node) continue;
      const plat = (node.platforms || []).find(p => p.id === platId);
      if (!plat) {
        issues.push({ severity: 'medium', type: t('issue.type.invalid_platform_override'), typeKey: 'invalid_platform_override',
          desc: t('issue.desc.invalid_platform_override', { name: svc.name, time: toTime(dep.startTime), station: node.name }),
          detail: t('issue.detail.invalid_platform_override'),
          action: `openDepEditModal('${dep.id}')` });
      }
    }
  }

  for (const svc of data.services) {
    if (!svc.groupId || !getGroup(svc.groupId)) {
      issues.push({ severity: 'low', type: t('issue.type.ungrouped_service'), typeKey: 'ungrouped_service',
        desc: t('issue.desc.ungrouped_service', { name: svc.name }),
        detail: t('issue.detail.ungrouped_service'),
        action: `openServiceModal('${svc.id}')` });
    }
  }

  // ---- LOW: Data quality ----

  const svcNames = {};
  for (const svc of data.services) {
    const key = svc.name.toLowerCase().trim();
    if (!svcNames[key]) svcNames[key] = [];
    svcNames[key].push(svc);
  }
  for (const [key, svcs] of Object.entries(svcNames)) {
    if (svcs.length > 1) {
      issues.push({ severity: 'low', type: t('issue.type.duplicate_name'), typeKey: 'duplicate_name',
        desc: t('issue.desc.duplicate_name', { n: svcs.length, name: svcs[0].name }),
        detail: t('issue.detail.duplicate_name'),
        action: `switchTab('services');setSearchValue('service-search','name:${svcs[0].name.replace(/'/g,"\\'")}');renderServices();highlightEntity('${svcs[0].id}')` });
    }
  }

  const nodeNamesMap = {};
  for (const n of data.nodes) {
    const key = n.name.toLowerCase().trim();
    if (!nodeNamesMap[key]) nodeNamesMap[key] = [];
    nodeNamesMap[key].push(n);
  }
  for (const [key, nodes] of Object.entries(nodeNamesMap)) {
    if (nodes.length > 1) {
      issues.push({ severity: 'low', type: t('issue.type.duplicate_node_name'), typeKey: 'duplicate_node_name',
        desc: t('issue.desc.duplicate_node_name', { n: nodes.length, name: nodes[0].name }),
        detail: t('issue.detail.duplicate_node_name'),
        action: `switchTab('nodes');setSearchValue('node-search','name:${nodes[0].name.replace(/'/g,"\\'")}');renderNodes();highlightEntity('${nodes[0].id}')` });
    }
  }

  // Stations sharing a display name (after bracket strip) but not interchange-connected
  if (data.settings?.stripBrackets !== false) {
    const groups = buildStationGroups();
    for (const [dn, nodeIds] of Object.entries(groups)) {
      if (nodeIds.length < 2) continue;
      // Check if all nodes are reachable from each other via ISI or OSI paths
      for (let i = 1; i < nodeIds.length; i++) {
        const hasInterchange = nodeIds.slice(0, i).some(prev =>
          data.segments.some(s => (s.interchangeType === 'isi' || s.interchangeType === 'osi') &&
            ((s.nodeA === nodeIds[i] && s.nodeB === prev) || (s.nodeB === nodeIds[i] && s.nodeA === prev)))
        );
        if (!hasInterchange) {
          const missingA = nodeIds[i];
          const missingB = nodeIds.slice(0, i).find(prev =>
            !data.segments.some(s => (s.interchangeType === 'isi' || s.interchangeType === 'osi') &&
              ((s.nodeA === missingA && s.nodeB === prev) || (s.nodeB === missingA && s.nodeA === prev)))
          ) || nodeIds[0];
          issues.push({ severity: 'medium', type: t('issue.type.unlinked_station_group'), typeKey: 'unlinked_station_group',
            desc: t('issue.desc.unlinked_station_group', { name: dn }),
            detail: t('issue.detail.unlinked_station_group'),
            action: `openSegmentModal();setTimeout(()=>{document.getElementById('f-sType').value='osi';document.getElementById('f-sType').dispatchEvent(new Event('change'));setTimeout(()=>{document.getElementById('btn-ich-isi').click();nodePickerSetValue('np-segA','${missingA}');nodePickerSetValue('np-segB','${missingB}');},80)},80)` });
          break;
        }
      }
    }
  }

  // Duplicate REF codes
  const nodeRefs = {};
  for (const n of data.nodes) {
    if (!n.refCode) continue;
    const key = n.refCode.toLowerCase().trim();
    if (!nodeRefs[key]) nodeRefs[key] = [];
    nodeRefs[key].push(n);
  }
  for (const [key, nodes] of Object.entries(nodeRefs)) {
    if (nodes.length > 1) {
      // Skip if all nodes in this group are ISI-connected (same station complex)
      const allISI = nodes.every((n, i) => {
        if (i === 0) return true;
        return nodes.slice(0, i).some(prev =>
          data.segments.some(s => s.interchangeType === 'isi' &&
            ((s.nodeA === n.id && s.nodeB === prev.id) || (s.nodeB === n.id && s.nodeA === prev.id)))
        );
      });
      if (allISI) continue;
      issues.push({ severity: 'low', type: t('issue.type.duplicate_ref_code'), typeKey: 'duplicate_ref_code',
        desc: t('issue.desc.duplicate_ref_code_nodes', { n: nodes.length, code: nodes[0].refCode }),
        detail: t('issue.detail.duplicate_ref_code'),
        action: `switchTab('nodes');setSearchValue('node-search','ref:${nodes[0].refCode.replace(/'/g,"\\'")}');renderNodes();highlightEntity('${nodes[0].id}')` });
    }
  }
  const segRefs = {};
  for (const s of data.segments) {
    if (!s.refCode) continue;
    const key = s.refCode.toLowerCase().trim();
    if (!segRefs[key]) segRefs[key] = [];
    segRefs[key].push(s);
  }
  for (const [key, segs] of Object.entries(segRefs)) {
    if (segs.length > 1) {
      issues.push({ severity: 'low', type: t('issue.type.duplicate_ref_code'), typeKey: 'duplicate_ref_code',
        desc: t('issue.desc.duplicate_ref_code_segs', { n: segs.length, code: segs[0].refCode }),
        detail: t('issue.detail.duplicate_ref_code'),
        action: `setSearchValue('segment-search','');switchTab('segments');showSegmentDetail('${segs[0].id}')` });
    }
  }

  for (const n of data.nodes) {
    if (isPassengerStop(n) && (!n.platforms || n.platforms.length === 0)) {
      issues.push({ severity: 'low', type: t('issue.type.no_platforms'), typeKey: 'no_platforms',
        desc: t('issue.desc.no_platforms', { name: n.name }),
        detail: t('issue.detail.no_platforms'),
        action: `openNodeModal('${n.id}','plat-list')` });
    }
  }

  for (const svc of data.services) {
    if (/\(rev\)|\(var\)|\(copy\)/.test(svc.name)) {
      issues.push({ severity: 'low', type: t('issue.type.auto_generated_name'), typeKey: 'auto_generated_name',
        desc: t('issue.desc.auto_generated_name', { name: svc.name }),
        detail: t('issue.detail.auto_generated_name'),
        action: `openServiceModal('${svc.id}')` });
    }
  }

  for (const s of data.segments) {
    if (isInterchange(s)) continue; // Interchanges don't need tracks/speed
    const problems = [];
    if (!s.distance || s.distance <= 0) problems.push('distance');
    if (!s.maxSpeed || s.maxSpeed <= 0) problems.push('max speed');
    if (!isRoad(s) && segTrackCount(s) <= 0) problems.push('track count');
    if (problems.length) {
      issues.push({ severity: 'low', type: t('issue.type.incomplete_segment'), typeKey: 'incomplete_segment',
        desc: t('issue.desc.incomplete_segment', { from: nodeName(s.nodeA), to: nodeName(s.nodeB), problems: problems.join(', ') }),
        detail: t('issue.detail.incomplete_segment'),
        action: `openSegmentModal('${s.id}')` });
    }
    // Distance mismatch: stored distance vs way geometry distance
    if (s.wayGeometry && s.wayGeometry.length >= 2 && s.distance > 0) {
      const geoDist = haversineDistance(s.wayGeometry);
      const diff = Math.abs(geoDist - s.distance);
      const pct = diff / geoDist * 100;
      if (pct > 15 && diff > 0.2) {
        issues.push({ severity: 'low', type: t('issue.type.distance_mismatch'), typeKey: 'distance_mismatch',
          desc: t('issue.desc.distance_mismatch', { from: nodeName(s.nodeA), to: nodeName(s.nodeB), stored: s.distance, geo: geoDist }),
          detail: t('issue.detail.distance_mismatch', { pct: Math.round(pct) }),
          action: `setSearchValue('segment-search','');switchTab('segments');showSegmentDetail('${s.id}')` });
      }
    }
  }

  for (const n of data.nodes) {
    if (connectedNodes(n.id).length === 0) {
      issues.push({ severity: 'low', type: t('issue.type.isolated_node'), typeKey: 'isolated_node',
        desc: t('issue.desc.isolated_node', { name: n.name }),
        detail: t('issue.detail.isolated_node'),
        action: `setSearchValue('node-search','');switchTab('nodes');showNodeDetail('${n.id}')` });
    }
    if (n.type === 'waypoint') {
      const conns = connectedNodes(n.id).length;
      if (conns !== 2) {
        issues.push({ severity: 'medium', type: t('issue.type.waypoint_connection_count'), typeKey: 'waypoint_connection_count',
          desc: t('issue.desc.waypoint_connection_count', { name: n.name, n: conns }),
          detail: t('issue.detail.waypoint_connection_count'),
          action: `setSearchValue('node-search','');switchTab('nodes');showNodeDetail('${n.id}')` });
      }
    }
    if (!n.ogfNode && n.lat == null) {
      issues.push({ severity: 'low', type: t('issue.type.missing_ogf_node'), typeKey: 'missing_ogf_node',
        desc: t('issue.desc.missing_ogf_node', { name: n.name }),
        detail: t('issue.detail.missing_ogf_node'),
        action: `openNodeModal('${n.id}','f-ogf')` });
    }
  }

  // ---- SANITY CHECKS (data integrity) ----

  // Schematic: platform assignment doesn't match track connections
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length; i++) {
      const stop = svc.stops[i];
      if (stop.passThrough || !stop.platformId) continue;
      const node = getNode(stop.nodeId);
      if (!node || !node.schematic || !node.schematic.tracks.length) continue;

      const prevNodeId = i > 0 ? svc.stops[i - 1].nodeId : null;
      const nextNodeId = i < svc.stops.length - 1 ? svc.stops[i + 1].nodeId : null;
      const arrSeg = prevNodeId ? findSeg(prevNodeId, stop.nodeId) : null;
      const depSeg = nextNodeId ? findSeg(stop.nodeId, nextNodeId) : null;

      // Find tracks that serve this platform (new: platformIds array)
      const platTracks = node.schematic.tracks.filter(t => (t.platformIds || []).includes(stop.platformId));
      if (!platTracks.length) continue;

      // Check if any of those tracks connect to the arriving/departing segments (track-aware)
      const arrTrackId = stop.trackId || null;
      const depTrackId = (i < svc.stops.length - 1) ? svc.stops[i + 1]?.trackId : null;
      const valid = platTracks.some(trk => {
        const tConns = ['A','B','C','D'].flatMap(s => (trk['side'+s]||[]));
        // Check arriving segment+track
        const arrOk = !arrSeg || tConns.some(c => c.segId === arrSeg.id && (!arrTrackId || !c.trackId || c.trackId === arrTrackId));
        // Check departing segment+track
        const depOk = !depSeg || tConns.some(c => c.segId === depSeg.id && (!depTrackId || !c.trackId || c.trackId === depTrackId));
        return arrOk && depOk;
      });

      if (!valid) {
        const platName = (node.platforms || []).find(p => p.id === stop.platformId)?.name || '?';
        issues.push({ severity: 'medium', type: t('issue.type.schematic_mismatch'), typeKey: 'schematic_mismatch',
          desc: t('issue.desc.schematic_mismatch', { name: svc.name, platform: platName, station: node.name }),
          detail: t('issue.detail.schematic_mismatch'),
          action: `openServiceModal('${svc.id}')` });
      }
    }
  }

  // Schematic: per-departure platform override doesn't match track connections
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    const overrides = dep.platformOverrides || {};
    for (const [idxStr, platId] of Object.entries(overrides)) {
      const i = parseInt(idxStr);
      if (!platId) continue;
      const stop = svc.stops[i]; if (!stop || stop.passThrough) continue;
      // Skip if same as service default (already checked above)
      if (platId === stop.platformId) continue;
      const node = getNode(stop.nodeId);
      if (!node || !node.schematic?.tracks?.length) continue;

      const prevNodeId = i > 0 ? svc.stops[i - 1].nodeId : null;
      const nextNodeId = i < svc.stops.length - 1 ? svc.stops[i + 1].nodeId : null;
      const arrSeg = prevNodeId ? findSeg(prevNodeId, stop.nodeId) : null;
      const depSeg = nextNodeId ? findSeg(stop.nodeId, nextNodeId) : null;

      const platTracks = node.schematic.tracks.filter(t => (t.platformIds || []).includes(platId));
      if (!platTracks.length) continue;

      const arrTrackId2 = stop.trackId || null;
      const depTrackId2 = (i < svc.stops.length - 1) ? svc.stops[i + 1]?.trackId : null;
      const valid = platTracks.some(trk => {
        const tConns = ['A','B','C','D'].flatMap(s => (trk['side'+s]||[]));
        const arrOk = !arrSeg || tConns.some(c => c.segId === arrSeg.id && (!arrTrackId2 || !c.trackId || c.trackId === arrTrackId2));
        const depOk = !depSeg || tConns.some(c => c.segId === depSeg.id && (!depTrackId2 || !c.trackId || c.trackId === depTrackId2));
        return arrOk && depOk;
      });

      if (!valid) {
        const platName = (node.platforms || []).find(p => p.id === platId)?.name || '?';
        issues.push({ severity: 'medium', type: t('issue.type.departure_schematic_mismatch'), typeKey: 'departure_schematic_mismatch',
          desc: t('issue.desc.departure_schematic_mismatch', { name: svc.name, time: toTime(dep.startTime), platform: platName, station: node.name }),
          detail: t('issue.detail.departure_schematic_mismatch'),
          action: `openDepEditModal('${dep.id}')` });
      }
    }
  }

  // Schematic: platform not assigned to any track
  for (const node of data.nodes) {
    if (node.type !== 'station' || !node.schematic?.tracks?.length) continue;
    for (const plat of (node.platforms || [])) {
      const assigned = node.schematic.tracks.some(t => (t.platformIds || []).includes(plat.id));
      if (!assigned) {
        issues.push({ severity: 'low', type: t('issue.type.unassigned_platform'), typeKey: 'unassigned_platform',
          desc: t('issue.desc.unassigned_platform', { platform: plat.name, station: node.name }),
          detail: t('issue.detail.unassigned_platform'),
          action: `openSchematicEditor('${node.id}')` });
      }
    }
  }

  // Schematic: segment track not connected to any station/junction track
  for (const node of data.nodes) {
    if (!node.schematic?.tracks?.length) continue;
    const conns = connectedNodes(node.id);
    for (const conn of conns) {
      const seg = getSeg(conn.segId);
      if (!seg) continue;
      const segTracks = Array.isArray(seg.tracks) ? seg.tracks : [];
      if (!segTracks.length) continue;
      // Collect all connected segment trackIds across all station tracks
      const connectedTrackIds = new Set();
      for (const trk of node.schematic.tracks) {
        for (const key of ['sideA','sideB','sideC','sideD']) {
          for (const c of (trk[key] || [])) {
            if (c.segId === conn.segId && c.trackId) connectedTrackIds.add(c.trackId);
          }
        }
      }
      for (const tk of segTracks) {
        if (!connectedTrackIds.has(tk.id)) {
          const segLabel = nodeName(seg.nodeA === node.id ? seg.nodeB : seg.nodeA);
          issues.push({ severity: 'low', type: t('issue.type.unconnected_segment_track'), typeKey: 'unconnected_segment_track',
            desc: t('issue.desc.unconnected_segment_track', { n: tk.name, label: segLabel, station: node.name }),
            detail: t('issue.detail.unconnected_segment_track'),
            action: `openSchematicEditor('${node.id}')` });
        }
      }
    }
  }

  // Non-station nodes not marked as pass-through in services
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length; i++) {
      const stop = svc.stops[i];
      const node = getNode(stop.nodeId);
      if (node && !isPassengerStop(node) && node.type !== 'waypoint' && !stop.passThrough) {
        issues.push({ severity: 'medium', type: t('issue.type.non_station_stop'), typeKey: 'non_station_stop',
          desc: t('issue.desc.non_station_stop', { name: svc.name, type: t('type.'+node.type), station: node.name }),
          detail: t('issue.detail.non_station_stop', { n: i+1 }),
          action: `openServiceModal('${svc.id}')` });
      }
    }
  }

  // Terminus stations marked as pass-through
  for (const svc of data.services) {
    if (svc.stops.length < 2) continue;
    const first = svc.stops[0], last = svc.stops[svc.stops.length - 1];
    if (first.passThrough) {
      issues.push({ severity: 'medium', type: t('issue.type.pass_through_terminus'), typeKey: 'pass_through_terminus',
        desc: t('issue.desc.pass_through_terminus_origin', { name: svc.name, station: nodeName(first.nodeId) }),
        detail: t('issue.detail.pass_through_terminus'),
        action: `openServiceModal('${svc.id}')` });
    }
    if (last.passThrough) {
      issues.push({ severity: 'medium', type: t('issue.type.pass_through_terminus'), typeKey: 'pass_through_terminus',
        desc: t('issue.desc.pass_through_terminus_dest', { name: svc.name, station: nodeName(last.nodeId) }),
        detail: t('issue.detail.pass_through_terminus'),
        action: `openServiceModal('${svc.id}')` });
    }
  }

  // Discontinuous routes (missing segments between adjacent stops)
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const seg = findSeg(svc.stops[i].nodeId, svc.stops[i+1].nodeId);
      if (!seg) {
        issues.push({ severity: 'high', type: t('issue.type.broken_route'), typeKey: 'broken_route',
          desc: t('issue.desc.broken_route', { name: svc.name, from: nodeName(svc.stops[i].nodeId), to: nodeName(svc.stops[i+1].nodeId) }),
          detail: t('issue.detail.broken_route', { a: i+1, b: i+2 }),
          action: `openServiceModal('${svc.id}')` });
      }
    }
  }

  // Service stops referencing deleted nodes
  for (const svc of data.services) {
    for (let i = 0; i < svc.stops.length; i++) {
      if (!getNode(svc.stops[i].nodeId)) {
        issues.push({ severity: 'high', type: t('issue.type.missing_node'), typeKey: 'missing_node',
          desc: t('issue.desc.missing_node', { name: svc.name, n: i+1 }),
          detail: t('issue.detail.missing_node'),
          action: `openServiceModal('${svc.id}')` });
        break;
      }
    }
  }

  // Stale departures (time count doesn't match service stop count)
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId);
    if (!svc) continue;
    if (dep.times.length !== svc.stops.length) {
      issues.push({ severity: 'medium', type: t('issue.type.stale_departure'), typeKey: 'stale_departure',
        desc: t('issue.desc.stale_departure', { name: svc.name, time: toTime(dep.startTime), actual: dep.times.length, expected: svc.stops.length }),
        detail: t('issue.detail.stale_departure'),
        action: `recalcSvcAndRefresh('${svc.id}')` });
    }
  }

  // Duplicate segments (same node pair connected twice within same type)
  const segPairs = {};
  for (const s of data.segments) {
    const typeKey = s.interchangeType || 'track';
    const key = [s.nodeA, s.nodeB].sort().join('::') + '::' + typeKey;
    if (!segPairs[key]) segPairs[key] = [];
    segPairs[key].push(s);
  }
  for (const [key, segs] of Object.entries(segPairs)) {
    if (segs.length > 1) {
      // Don't flag parallel segments that have different allowedModes (intentionally parallel)
      const allSameOrEmpty = segs.every(s => !s.allowedModes?.length) ||
        (segs.every(s => s.allowedModes?.length) && segs.every(s => JSON.stringify(s.allowedModes?.sort()) === JSON.stringify(segs[0].allowedModes?.sort())));
      if (allSameOrEmpty) {
        issues.push({ severity: 'medium', type: t('issue.type.duplicate_segment'), typeKey: 'duplicate_segment',
          desc: t('issue.desc.duplicate_segment', { n: segs.length, type: segs[0].interchangeType ? segs[0].interchangeType.toUpperCase() : t('seg.type_track_display'), from: nodeName(segs[0].nodeA), to: nodeName(segs[0].nodeB) }),
          detail: t('issue.detail.duplicate_segment'),
          action: `setSearchValue('segment-search','');switchTab('segments');showSegmentDetail('${segs[0].id}')` });
      }
    }
  }

  // Shared state for suspicious segment + overlap detection
  const _suspFlagged = new Set();

  // Suspicious segments: near-identical geometry (same endpoints OR chain match)
  {
    const verified = data.settings?.verifiedSegments || [];
    const geoSegs = data.segments.filter(s => !isInterchange(s) && s.wayGeometry?.length >= 2);
    const THRESHOLD = 0.05; // 50m average distance = suspicious

    function _modesCompatible(sA, sB) {
      const modesA = (sA.allowedModes || []).slice().sort().join(',');
      const modesB = (sB.allowedModes || []).slice().sort().join(',');
      return !modesA || !modesB || modesA === modesB;
    }

    // Case 1: Same endpoints, near-identical geometry
    const pairGroups = {};
    for (const s of geoSegs) {
      const key = [s.nodeA, s.nodeB].sort().join('::');
      if (!pairGroups[key]) pairGroups[key] = [];
      pairGroups[key].push(s);
    }
    for (const [, segs] of Object.entries(pairGroups)) {
      if (segs.length < 2) continue;
      for (let a = 0; a < segs.length; a++) {
        for (let b = a + 1; b < segs.length; b++) {
          const sA = segs[a], sB = segs[b];
          if (verified.includes(sA.id) || verified.includes(sB.id)) continue;
          if (!_modesCompatible(sA, sB)) continue;
          const sim = polylineSimilarity(sA.wayGeometry, sB.wayGeometry);
          if (sim < THRESHOLD) {
            const avgM = Math.round(sim * 1000);
            const fk = [sA.id, sB.id].sort().join('::');
            if (_suspFlagged.has(fk)) continue;
            _suspFlagged.add(fk);
            issues.push({ severity: 'medium', type: t('issue.type.suspicious_segment'), typeKey: 'suspicious_segment',
              desc: t('issue.desc.suspicious_segment', { from: nodeName(sA.nodeA), to: nodeName(sA.nodeB), dist: avgM }),
              detail: t('issue.detail.suspicious_segment'),
              action: `switchTab('segments');showSegmentDetail('${sA.id}')`,
              extraActions: `<button class="btn btn-sm" style="margin-top:4px" onclick="event.stopPropagation();verifySegment('${sA.id}');verifySegment('${sB.id}')">${t('issue.verify_btn')}</button>`
            });
          }
        }
      }
    }

    // Case 2: Segment A→Z matches a chain A→...→Z (express covering existing stops)
    // Build adjacency from segments with geometry
    const adj = {};
    for (const s of geoSegs) {
      if (!adj[s.nodeA]) adj[s.nodeA] = [];
      if (!adj[s.nodeB]) adj[s.nodeB] = [];
      adj[s.nodeA].push(s);
      adj[s.nodeB].push(s);
    }
    for (const seg of geoSegs) {
      if (verified.includes(seg.id)) continue;
      // BFS from seg.nodeA to seg.nodeB, max 8 hops, avoiding seg itself
      const target = seg.nodeB;
      const queue = [{ node: seg.nodeA, path: [], geom: [] }];
      const visited = new Set([seg.nodeA]);
      let foundChain = null;
      while (queue.length && !foundChain) {
        const { node, path, geom } = queue.shift();
        if (path.length > 8) continue;
        for (const s of (adj[node] || [])) {
          if (s.id === seg.id) continue; // don't use the segment itself
          if (!_modesCompatible(seg, s)) continue;
          const next = s.nodeA === node ? s.nodeB : s.nodeA;
          if (visited.has(next)) continue;
          const newPath = [...path, { seg: s, from: node, to: next }];
          // Orient this sub-segment's geometry correctly
          const subGeo = s.nodeA === node ? [...(s.wayGeometry||[])] : [...(s.wayGeometry||[])].reverse();
          const newGeom = geom.length ? [...geom, ...subGeo.slice(1)] : [...subGeo];
          if (next === target && newPath.length >= 2) {
            foundChain = { path: newPath, geom: newGeom };
            break;
          }
          visited.add(next);
          queue.push({ node: next, path: newPath, geom: newGeom });
        }
      }
      if (foundChain) {
        // Only flag if this segment covers roughly the same ground as the whole chain.
        // An express segment A→Z ≈ total distance of chain A→B→...→Z.
        // A short segment like B→C is much shorter than its chain B→A→...→C, so it gets filtered.
        const segDist = seg.distance || haversineDistance(seg.wayGeometry);
        const chainTotalDist = foundChain.path.reduce((sum, e) => sum + (e.seg.distance || 0), 0);
        if (chainTotalDist > 0 && segDist < chainTotalDist * 0.7) foundChain = null;
      }
      if (foundChain) {
        const sim = polylineSimilarity(seg.wayGeometry, foundChain.geom);
        if (sim < THRESHOLD) {
          const avgM = Math.round(sim * 1000);
          const chainIds = foundChain.path.map(e => e.seg.id);
          const fk = [seg.id, ...chainIds].sort().join('::');
          if (_suspFlagged.has(fk)) continue;
          _suspFlagged.add(fk);
          // Also suppress pairwise overlap checks between the express segment and each chain segment
          for (const cid of chainIds) _suspFlagged.add([seg.id, cid].sort().join('::'));
          const chainNames = foundChain.path.map(e => nodeName(e.from) + ' \u2192 ' + nodeName(e.to)).join(', ');
          issues.push({ severity: 'medium', type: t('issue.type.suspicious_segment'), typeKey: 'suspicious_segment',
            desc: t('issue.desc.suspicious_chain', { from: nodeName(seg.nodeA), to: nodeName(seg.nodeB), dist: avgM, chain: chainNames }),
            detail: t('issue.detail.suspicious_chain'),
            action: `switchTab('segments');showSegmentDetail('${seg.id}')`,
            extraActions: `<button class="btn btn-sm" style="margin-top:4px" onclick="event.stopPropagation();verifySegment('${seg.id}')">${t('issue.verify_btn')}</button>`
          });
        }
      }
    }
  }

  // Partial segment overlap (shared track without shared infrastructure)
  {
    const SNAP_THRESHOLD = 0.05;  // 50m
    const GRACE = 0.1;            // 100m from endpoints
    const MIN_OVERLAP = 0.1;      // 100m of shared track to flag
    const overlapVerified = data.settings?.verifiedSegments || [];
    const overlapGeoSegs = data.segments.filter(s => !isInterchange(s) && s.wayGeometry?.length >= 2);

    // Pre-compute bounding boxes (0.001° padding ≈ 110m)
    const bboxes = new Map();
    for (const s of overlapGeoSegs) bboxes.set(s.id, _segBBox(s.wayGeometry, 0.001));

    // Compare all pairs with overlapping bounding boxes
    for (let i = 0; i < overlapGeoSegs.length; i++) {
      const sA = overlapGeoSegs[i];
      if (overlapVerified.includes(sA.id)) continue;
      const bbA = bboxes.get(sA.id);

      for (let j = i + 1; j < overlapGeoSegs.length; j++) {
        const sB = overlapGeoSegs[j];
        if (overlapVerified.includes(sB.id)) continue;

        // Skip pairs already flagged by same-endpoint or chain checks
        const pairKey = [sA.id, sB.id].sort().join('::');
        if (_suspFlagged.has(pairKey)) continue;

        // Skip if same endpoints (already handled by Case 1 above)
        const endpointsA = [sA.nodeA, sA.nodeB].sort().join('::');
        const endpointsB = [sB.nodeA, sB.nodeB].sort().join('::');
        if (endpointsA === endpointsB) continue;

        // Skip if different modes (intentionally parallel)
        const modesA = (sA.allowedModes || []).slice().sort().join(',');
        const modesB = (sB.allowedModes || []).slice().sort().join(',');
        if (modesA && modesB && modesA !== modesB) continue;

        // Bounding box pre-filter
        if (!_bboxOverlap(bbA, bboxes.get(sB.id))) continue;

        // Check overlap in both directions, take the larger value
        const overlapAB = findOverlapLength(sA.wayGeometry, sB.wayGeometry, SNAP_THRESHOLD, GRACE);
        const overlapBA = findOverlapLength(sB.wayGeometry, sA.wayGeometry, SNAP_THRESHOLD, GRACE);
        const overlapKm = Math.max(overlapAB, overlapBA);

        if (overlapKm >= MIN_OVERLAP) {
          const overlapM = Math.round(overlapKm * 1000);
          const sharedEndpoint = (sA.nodeA === sB.nodeA || sA.nodeA === sB.nodeB ||
                                  sA.nodeB === sB.nodeA || sA.nodeB === sB.nodeB);
          const descKey = sharedEndpoint ? 'issue.desc.overlap_branching' : 'issue.desc.overlap_mid';
          const fixBtn = sharedEndpoint
            ? `<button class="btn btn-sm btn-primary" style="margin-top:4px;margin-right:4px" onclick="event.stopPropagation();showOverlapResolutionModal('${sA.id}','${sB.id}')">${t('resolve.fix_btn')}</button>`
            : '';
          issues.push({ severity: 'medium', type: t('issue.type.segment_overlap'), typeKey: 'segment_overlap',
            desc: t(descKey, { segA: nodeName(sA.nodeA) + ' \u2014 ' + nodeName(sA.nodeB), segB: nodeName(sB.nodeA) + ' \u2014 ' + nodeName(sB.nodeB), dist: overlapM }),
            detail: t('issue.detail.segment_overlap'),
            action: `switchTab('segments');showSegmentDetail('${sA.id}')`,
            extraActions: fixBtn + `<button class="btn btn-sm" style="margin-top:4px" onclick="event.stopPropagation();verifySegment('${sA.id}');verifySegment('${sB.id}')">${t('issue.verify_btn')}</button>`
          });
        }
      }
    }
  }

  // Cross-cutoff journey warning
  {
    for (const dep of data.departures) {
      const svc = getSvc(dep.serviceId); if (!svc) continue;
      const firstTime = dep.times[0]?.depart;
      const lastTime = dep.times[dep.times.length - 1]?.arrive;
      if (firstTime == null || lastTime == null) continue;
      // Check if journey starts before cutoff and ends after, or starts after and ends past next cutoff
      const firstAdj = firstTime < DAY_CUTOFF_() ? firstTime + 1440 : firstTime;
      const lastAdj = lastTime < DAY_CUTOFF_() ? lastTime + 1440 : lastTime;
      if (lastAdj < firstAdj) {
        // Journey wraps across day boundary (arrives before departure in adjusted time = crosses cutoff)
        issues.push({ severity: 'low', type: t('issue.type.cross_cutoff_journey'), typeKey: 'cross_cutoff_journey',
          desc: t('issue.desc.cross_cutoff_journey', { name: svc.name, time: toTime(firstTime), cutoff: toTime(DAY_CUTOFF_()) }),
          detail: t('issue.detail.cross_cutoff_journey', { dep_time: toTime(firstTime), arr_time: toTime(lastTime) }),
          action: `showTrainSchedule('${dep.id}')` });
      }
    }
  }

  // ---- Filter based on settings ----
  const hiddenTypes = data.settings?.hiddenIssueTypes || [];
  const hideLow = data.settings?.hideLowSeverity || false;
  const filtered = issues.filter(i => {
    if (i.severity === 'high') return true; // always show
    if (hiddenTypes.includes(i.typeKey)) return false;
    if (hideLow && i.severity === 'low') return false;
    return true;
  });

  // ---- Render ----
  const highCount = filtered.filter(i => i.severity === 'high').length;
  const medCount = filtered.filter(i => i.severity === 'medium').length;
  const lowCount = filtered.filter(i => i.severity === 'low').length;
  const totalHidden = issues.length - filtered.length;

  document.getElementById('badge-issues').textContent = filtered.length;
  document.getElementById('badge-issues').style.color = highCount > 0 ? 'var(--danger)' : (medCount > 0 ? 'var(--warn)' : 'var(--text-muted)');

  const el = document.getElementById('issues-list');

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon" style="color:var(--success)">✓</div>
      <h3>${t('issue.no_issues')}</h3><p>${t('issue.no_issues_desc')}${totalHidden ? ' ' + t('issue.hidden_count', { n: totalHidden }) : ''}</p></div>`;
    return;
  }

  function renderIssueItem(i) {
    const clickAttr = i.action ? ` onclick="${i.action.replace(/"/g,'&quot;')}" style="cursor:pointer"` : '';
    return `<div class="issue-item severity-${i.severity}"${clickAttr}>
      <div class="issue-type">${esc(i.type)}${i.action ? ` <span style="font-size:9px;opacity:0.6">\u2192 ${t('issue.click_to_fix')}</span>` : ''}</div>
      <div class="issue-desc">${esc(i.desc)}</div>
      <div class="issue-detail">${esc(i.detail)}</div>
      ${i.extraActions || ''}
    </div>`;
  }

  let html = '';

  if (highCount) {
    html += `<div class="issue-section-header">${t('issue.section.conflicts', { n: highCount })}</div>`;
    html += filtered.filter(i => i.severity === 'high').map(renderIssueItem).join('');
  }

  if (medCount) {
    html += `<div class="issue-section-header">${t('issue.section.warnings', { n: medCount })}</div>`;
    html += filtered.filter(i => i.severity === 'medium').map(renderIssueItem).join('');
  }

  if (lowCount) {
    html += `<div class="issue-section-header">${t('issue.section.data_quality', { n: lowCount })}</div>`;
    html += filtered.filter(i => i.severity === 'low').map(renderIssueItem).join('');
  }

  if (totalHidden) {
    const hiddenIssues = issues.filter(i => !filtered.includes(i));
    // Group hidden issues by type
    const hiddenByType = {};
    for (const i of hiddenIssues) {
      if (!hiddenByType[i.typeKey]) hiddenByType[i.typeKey] = [];
      hiddenByType[i.typeKey].push(i);
    }
    html += `<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
      <div class="clickable" style="font-size:12px;color:var(--text-muted);cursor:pointer" onclick="const el=document.getElementById('hidden-issues-list');el.style.display=el.style.display==='none'?'':'none'">
        ${t('issue_hidden.summary', { n: totalHidden })} · <span style="color:var(--accent)">${t('issue_hidden.show')} / ${t('issue_hidden.hide')}</span> · <span class="clickable" style="color:var(--accent)" onclick="event.stopPropagation();switchTab('settings');switchSettingsTab('issues')">${t('issue_hidden.edit_filters')}</span>
      </div>
      <div id="hidden-issues-list" style="display:none;margin-top:8px;opacity:0.6">
        ${Object.entries(hiddenByType).map(([type, items]) => `
          <div style="margin-bottom:8px">
            <div class="clickable" style="font-size:11px;font-weight:600;color:var(--text-dim);cursor:pointer;padding:4px 0" onclick="const el=this.nextElementSibling;el.style.display=el.style.display==='none'?'':'none'">
              ${esc(type)} <span class="mono" style="font-size:10px;color:var(--text-muted)">(${items.length})</span> <span style="opacity:0.4;font-size:9px">▾</span>
            </div>
            <div style="display:none">
              ${items.map(i => renderIssueItem(i)).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  }

  el.innerHTML = html;
}

// ============================================================
// NETWORK MAP (Leaflet)
// ============================================================
let _map = null;
let _mapTileLayer = null;
let _mapLayers = { stations: null, labels: null, segments: null };

function initMap() {
  const container = document.getElementById('network-map');
  if (!container) return;

  // Destroy previous map if exists
  if (_map) { _map.remove(); _map = null; }

  _map = L.map('network-map', {
    zoomControl: true,
    attributionControl: false
  }).setView([0, 0], 3);

  // OGF tile layer
  _mapTileLayer = L.tileLayer('https://tile.opengeofiction.net/ogf-carto/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenGeofiction'
  }).addTo(_map);

  // Re-render on zoom to recalculate parallel line offsets
  _map.on('zoomend', () => renderMapContent(true));

  renderMapContent();
}

function toggleMapTiles() {
  if (!_map) return;
  const checked = document.getElementById('map-tiles-toggle')?.checked;
  if (checked && _mapTileLayer) {
    _mapTileLayer.addTo(_map);
  } else if (_mapTileLayer) {
    _map.removeLayer(_mapTileLayer);
  }
}

function mapFitBounds() {
  if (!_map) return;
  const coords = data.nodes.filter(n => n.lat != null && n.lon != null).map(n => [n.lat, n.lon]);
  if (coords.length === 0) { toast(t('toast.no_coords'), 'error'); return; }
  if (coords.length === 1) { _map.setView(coords[0], 14); return; }
  _map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
}

// Per-vertex perpendicular offset for polylines (parallel line rendering)
// coords: [[lat,lon],...], offsetPx: pixels, map: Leaflet map
function _polylineOffset(coords, offsetPx, map) {
  if (!offsetPx || coords.length < 2) return coords;
  const pts = coords.map(c => map.latLngToLayerPoint(c));
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    // Average perpendicular direction from incoming + outgoing segments
    let px = 0, py = 0, count = 0;
    if (i > 0) {
      const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      px += -dy/len; py += dx/len; count++;
    }
    if (i < pts.length - 1) {
      const dx = pts[i+1].x - pts[i].x, dy = pts[i+1].y - pts[i].y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      px += -dy/len; py += dx/len; count++;
    }
    px /= count; py /= count;
    // Normalize the averaged perpendicular
    const pLen = Math.sqrt(px*px + py*py) || 1;
    out.push(map.layerPointToLatLng(L.point(pts[i].x + px/pLen*offsetPx, pts[i].y + py/pLen*offsetPx)));
  }
  return out;
}

function renderMapContent(skipFit) {
  if (!_map) return;

  // Clear existing layers
  Object.values(_mapLayers).forEach(lg => { if (lg) _map.removeLayer(lg); });

  const stationMarkers = [];
  const labelMarkers = [];
  const segmentLines = [];

  // ---- Segments ----
  // Build a map of segment -> lines (service groups) for coloring
  const segLineMap = {};
  for (const svc of data.services) {
    if (!svc.groupId) continue;
    const grp = getGroup(svc.groupId);
    if (!grp) continue;
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const seg = findSeg(svc.stops[i].nodeId, svc.stops[i + 1].nodeId);
      if (seg) {
        if (!segLineMap[seg.id]) segLineMap[seg.id] = [];
        if (!segLineMap[seg.id].find(g => g.id === grp.id)) {
          segLineMap[seg.id].push(grp);
        }
      }
    }
  }

  for (const seg of data.segments) {
    const nA = getNode(seg.nodeA), nB = getNode(seg.nodeB);
    if (!nA || !nB || nA.lat == null || nB.lat == null) continue;

    // Interchange segments: alternating black/white dashed line
    if (isInterchange(seg)) {
      const coords = [[nA.lat, nA.lon], [nB.lat, nB.lon]];
      const lineWeight = 5;
      segmentLines.push(L.polyline(coords, { color: '#000000', weight: lineWeight, opacity: 0.9, dashArray: '6,6' }));
      segmentLines.push(L.polyline(coords, { color: '#ffffff', weight: lineWeight, opacity: 0.9, dashArray: '6,6', dashOffset: '6' }));
      continue;
    }

    const lines = segLineMap[seg.id] || [];
    const lineWeight = 5;

    const segCoords = segmentCoords(seg);
    if (segCoords.length < 2) continue;

    if (lines.length === 0) {
      // No line assigned — draw in dim grey
      segmentLines.push(L.polyline(segCoords, { color: '#555', weight: 2, opacity: 0.4 }));
    } else if (lines.length === 1) {
      // Single line — draw with that line's color
      segmentLines.push(L.polyline(segCoords, { color: lines[0].color || '#888', weight: lineWeight, opacity: 0.95 }));
    } else {
      // Multiple lines — per-vertex perpendicular offset along way geometry
      const offsetStep = lineWeight + 1;
      const totalWidth = (lines.length - 1) * offsetStep;
      lines.forEach((grp, idx) => {
        const off = -totalWidth / 2 + idx * offsetStep;
        const offsetCoords = _polylineOffset(segCoords, off, _map);
        segmentLines.push(L.polyline(offsetCoords, { color: grp.color || '#888', weight: lineWeight, opacity: 0.95 }));
      });
    }
  }

  // ---- Station dots ----
  for (const n of data.nodes) {
    if (n.lat == null || n.lon == null) continue;
    if (!isPassengerStop(n)) continue;

    const dn = esc(nodeDisplayName(n.id));
    const nid = n.id;
    const popupHtml = `<div style="font-family:var(--font-body);min-width:160px">
      <div style="font-weight:700;font-size:14px;margin-bottom:8px">${dn}</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <a href="#" onclick="event.preventDefault();_map.closePopup();switchTab('nodes');showNodeDetail('${nid}')" style="color:var(--accent);font-size:12px;text-decoration:none">◉ ${t('geomap.view_node')}</a>
        <a href="#" onclick="event.preventDefault();_map.closePopup();_departureStationId='${nid}';setBoardMode('departures');switchTab('departures')" style="color:var(--accent);font-size:12px;text-decoration:none">▤ ${t('geomap.departure_board')}</a>
        <a href="#" onclick="event.preventDefault();_map.closePopup();switchTab('journey');setTimeout(()=>nodePickerSetValue('np-jpOrigin','${nid}'),200)" style="color:var(--accent);font-size:12px;text-decoration:none">⇄ Journey from here</a>
        <a href="#" onclick="event.preventDefault();_map.closePopup();switchTab('journey');setTimeout(()=>nodePickerSetValue('np-jpDest','${nid}'),200)" style="color:var(--accent);font-size:12px;text-decoration:none">⇄ Journey to here</a>
      </div>
    </div>`;

    const marker = L.circleMarker([n.lat, n.lon], {
      radius: 6,
      fillColor: '#ffffff',
      fillOpacity: 1,
      color: '#222222',
      weight: 2.5
    }).bindPopup(popupHtml, { className: 'map-popup' });
    stationMarkers.push(marker);

    // Store label data for collision detection
    labelMarkers.push({ node: n, popupHtml, dn });
  }

  // Non-station nodes: no visible dots (junctions/waypoints are just routing points)

  // Add layers in order: segments below, then stations
  _mapLayers.segments = L.layerGroup(segmentLines).addTo(_map);
  _mapLayers.stations = L.layerGroup(stationMarkers).addTo(_map);

  // ---- Label collision detection & placement ----
  placeLabels(labelMarkers);

  // Show warning for nodes missing coordinates
  const missingCoords = data.nodes.filter(n => n.lat == null || n.lon == null);
  const warningEl = document.getElementById('map-warnings');
  if (warningEl) {
    if (missingCoords.length > 0) {
      const names = missingCoords.slice(0, 5).map(n => n.name).join(', ');
      const more = missingCoords.length > 5 ? ` and ${missingCoords.length - 5} more` : '';
      warningEl.innerHTML = `<div style="padding:8px 12px;background:var(--warn-dim);border:1px solid var(--warn);border-radius:var(--radius-sm);font-size:12px;color:var(--warn)">
        ⚠ ${t('geomap.missing_coords', { n: missingCoords.length })}: ${esc(names)}${more}.
        ${missingCoords.some(n => n.ogfNode) ? `<span class="clickable" style="color:var(--accent);margin-left:8px" onclick="fetchAllOgfCoords().then(()=>{if(document.querySelector('.nav-item.active')?.dataset?.tab==='map')renderMapContent()})">Fetch from OGF</span>` : ''}
      </div>`;
    } else {
      warningEl.innerHTML = '';
    }
  }

  // Auto-fit if we have coords (skip on zoom re-render)
  if (!skipFit) mapFitBounds();
}

// Label collision detection: greedily place labels by importance, skip overlaps
function placeLabels(labelData) {
  if (!_map || !labelData.length) return;
  if (_mapLayers.labels) _map.removeLayer(_mapLayers.labels);

  // Score by daily train volume (departures + terminating arrivals, not pass-through)
  // Group station nodes so grouped stations pool their traffic
  const stationTraffic = {};
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc) continue;
    for (let i = 0; i < dep.times.length; i++) {
      const stop = svc.stops[i];
      if (!stop || stop.passThrough) continue;
      const node = getNode(dep.times[i].nodeId);
      if (!node || !isPassengerStop(node)) continue;
      const dn = nodeDisplayName(node.id);
      stationTraffic[dn] = (stationTraffic[dn] || 0) + 1;
    }
  }

  const scored = labelData.map(ld => ({
    ...ld,
    score: stationTraffic[ld.dn] || 0,
    pt: _map.latLngToContainerPoint([ld.node.lat, ld.node.lon])
  })).sort((a, b) => b.score - a.score);

  const LABEL_H = 16;
  const CHAR_W = 6.5;
  const OFFSET_X = 10;
  const PADDING = 3;
  const DOT_R = 8; // approximate dot radius in pixels

  const placed = []; // array of { x, y, w, h } rectangles
  const visibleLabels = [];

  function makeRect(pt, textW, side) {
    if (side === 'right') {
      return { x: pt.x + OFFSET_X - PADDING, y: pt.y - LABEL_H / 2 - PADDING, w: textW + PADDING * 2, h: LABEL_H + PADDING * 2 };
    } else {
      return { x: pt.x - OFFSET_X - textW - PADDING, y: pt.y - LABEL_H / 2 - PADDING, w: textW + PADDING * 2, h: LABEL_H + PADDING * 2 };
    }
  }

  function overlapsAny(rect) {
    return placed.some(p =>
      rect.x < p.x + p.w && rect.x + rect.w > p.x &&
      rect.y < p.y + p.h && rect.y + rect.h > p.y
    );
  }

  for (const ld of scored) {
    const textW = ld.dn.length * CHAR_W + 10;

    // Try right side first, then left side
    const rectR = makeRect(ld.pt, textW, 'right');
    const rectL = makeRect(ld.pt, textW, 'left');
    let chosenRect = null;
    let side = 'right';

    if (!overlapsAny(rectR)) {
      chosenRect = rectR;
      side = 'right';
    } else if (!overlapsAny(rectL)) {
      chosenRect = rectL;
      side = 'left';
    }

    if (chosenRect) {
      placed.push(chosenRect);
      const anchorX = side === 'right' ? -OFFSET_X : OFFSET_X + textW;
      const label = L.marker([ld.node.lat, ld.node.lon], {
        icon: L.divIcon({
          className: 'map-station-label',
          html: `<span>${esc(ld.dn)}</span>`,
          iconSize: null,
          iconAnchor: [anchorX, 6]
        }),
        interactive: true
      });
      label.on('click', () => {
        if (_mapLayers.stations) {
          _mapLayers.stations.eachLayer(m => {
            if (m.getLatLng && m.getLatLng().lat === ld.node.lat && m.getLatLng().lng === ld.node.lon) {
              m.openPopup();
            }
          });
        }
      });
      visibleLabels.push(label);
    }
  }

  _mapLayers.labels = L.layerGroup(visibleLabels).addTo(_map);
}

// ============================================================
// DETAIL VIEW MAPS
// ============================================================
// Embeddable Leaflet geomaps in entity detail panels. Follows the JP inline map pattern.

const _detailMaps = {};

function detailMapDestroy(containerId) {
  const entry = _detailMaps[containerId];
  if (!entry) return;
  if (entry.leaflet) { try { entry.leaflet.remove(); } catch(e) {} }
  delete _detailMaps[containerId];
}

function detailMapContainerHTML(containerId, hasGeo, hasBeck) {
  if (!hasGeo && !hasBeck) return '';
  const pref = data.settings?.defaultDetailMap || 'geo';
  const showGeo = hasGeo && (!hasBeck || pref === 'geo');
  const showBeck = hasBeck && (!hasGeo || pref === 'beck');
  const tabBtns = (hasGeo && hasBeck ? `
    <button class="${showGeo ? 'active' : ''}" onclick="detailMapToggle('${containerId}','geo')">Geomap</button>
    <button class="${showBeck ? 'active' : ''}" onclick="detailMapToggle('${containerId}','beck')">Railmap</button>` : '') +
    `<button class="dm-expand-btn" onclick="detailMapExpand('${containerId}')" title="Expand">⤢</button>`;
  const tabs = `<div class="detail-map-tabs">${tabBtns}</div>`;
  const h = hasGeo && hasBeck ? 'calc(100% - 28px)' : '100%';
  return `<div class="detail-map-wrap">
    ${tabs}
    <div id="${containerId}" style="width:100%;height:${h};${showGeo ? '' : 'display:none;'}border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border);background:var(--bg)"></div>
    <svg id="${containerId}-beck" style="width:100%;height:${h};${showBeck ? '' : 'display:none;'}border-radius:var(--radius-sm);border:1px solid var(--border);background:#fff"></svg>
  </div>`;
}

function detailMapToggle(containerId, mode) {
  const geoEl = document.getElementById(containerId);
  const beckEl = document.getElementById(containerId + '-beck');
  if (!geoEl || !beckEl) return;
  geoEl.style.display = mode === 'geo' ? '' : 'none';
  beckEl.style.display = mode === 'beck' ? '' : 'none';
  // Update tab buttons
  const tabs = geoEl.closest('.detail-map-wrap')?.querySelector('.detail-map-tabs');
  if (tabs) {
    tabs.children[0].classList.toggle('active', mode === 'geo');
    tabs.children[1].classList.toggle('active', mode === 'beck');
  }
  // Leaflet needs invalidateSize + re-fit when shown (container may have been display:none)
  const entry = _detailMaps[containerId];
  if (mode === 'geo' && entry?.leaflet) {
    setTimeout(() => {
      entry.leaflet.invalidateSize();
      if (entry.fitFn) entry.fitFn();
    }, 50);
  }
  // Render beckmap on first switch
  if (mode === 'beck' && entry?.beckRenderFn) { entry.beckRenderFn(); entry.beckRenderFn = null; }
}

function detailMapExpand(containerId) {
  const wrap = document.getElementById(containerId)?.closest('.detail-map-wrap');
  if (!wrap) return;
  wrap.classList.toggle('detail-map-expanded');
  // Re-fit leaflet if visible
  const entry = _detailMaps[containerId];
  if (entry?.leaflet) setTimeout(() => { entry.leaflet.invalidateSize(); if (entry.fitFn) entry.fitFn(); }, 100);
  // Scroll expanded map into view
  setTimeout(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function detailMapHasBeck(groupIds) {
  if (!data.beckmap?.lineStations) return false;
  if (!groupIds || groupIds.size === 0) {
    return Object.values(data.beckmap.lineStations).some(ls => Object.keys(ls).length > 0);
  }
  for (const gid of groupIds) {
    if (data.beckmap.lineStations[gid] && Object.keys(data.beckmap.lineStations[gid]).length > 0) return true;
  }
  return false;
}

function detailMapSetBeck(containerId, focusGroupIds, focusNodeIds, mode, svcStopsList, focusZoomNodeIds) {
  const entry = _detailMaps[containerId] || (_detailMaps[containerId] = {});
  const renderFn = () => {
    const svgEl = document.getElementById(containerId + '-beck');
    if (svgEl) renderMiniBeck(svgEl, { focusGroupIds, focusNodeIds, mode, svcStopsList, focusZoomNodeIds });
  };
  // If beckmap is the default view (or only view), render now; otherwise defer
  const beckEl = document.getElementById(containerId + '-beck');
  if (beckEl && beckEl.style.display !== 'none') {
    setTimeout(renderFn, 100);
  } else {
    entry.beckRenderFn = renderFn;
  }
}

function detailMapInitGeo(containerId, renderFn) {
  detailMapDestroy(containerId);
  const el = document.getElementById(containerId);
  if (!el) return;
  const map = L.map(el, { zoomControl: true, attributionControl: false }).setView([0, 0], 3);
  if (data.settings?.jpMapTiles !== false) {
    L.tileLayer('https://tile.opengeofiction.net/ogf-carto/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  }
  _detailMaps[containerId] = { leaflet: map };
  map.on('zoomend moveend', () => _dmPlaceLabels(map));
  setTimeout(() => {
    map.invalidateSize();
    renderFn(map);
    // Defer label placement until after fitBounds has settled the viewport
    map.whenReady(() => setTimeout(() => _dmPlaceLabels(map), 50));
  }, 100);
}

function _dmDrawBackground(map, excludeSegIds) {
  const skip = excludeSegIds ? new Set(excludeSegIds) : null;
  for (const seg of data.segments) {
    if (isInterchange(seg)) continue;
    if (skip && skip.has(seg.id)) continue;
    const coords = segmentCoords(seg);
    if (coords.length < 2) continue;
    L.polyline(coords, { color: '#555', weight: 3, opacity: 1 }).addTo(map);
  }
}

function _dmStationDot(map, node, opts) {
  if (!node || node.lat == null) return;
  const r = opts?.radius || 6;
  const fill = opts?.fill || '#fff';
  const stroke = opts?.stroke || '#222';
  const w = opts?.weight || 2;
  L.circleMarker([node.lat, node.lon], { radius: r, fillColor: fill, color: stroke, weight: w, fillOpacity: 1 }).addTo(map);
}

function _dmLabel(map, node) {
  if (!node || node.lat == null) return;
  if (!map._dmLabelNodes) map._dmLabelNodes = [];
  map._dmLabelNodes.push(node);
}

function _dmPlaceLabels(map) {
  const labels = map._dmLabelNodes || [];
  if (!labels.length) return;

  // Remove previous label layer
  if (map._dmLabelLayer) { map.removeLayer(map._dmLabelLayer); map._dmLabelLayer = null; }

  const LABEL_H = 16, CHAR_W = 6.5, OFFSET_X = 10, PADDING = 3;
  const placed = [];
  const markers = [];

  function makeRect(pt, textW, side) {
    return side === 'right'
      ? { x: pt.x + OFFSET_X - PADDING, y: pt.y - LABEL_H / 2 - PADDING, w: textW + PADDING * 2, h: LABEL_H + PADDING * 2 }
      : { x: pt.x - OFFSET_X - textW - PADDING, y: pt.y - LABEL_H / 2 - PADDING, w: textW + PADDING * 2, h: LABEL_H + PADDING * 2 };
  }
  function overlaps(rect) {
    return placed.some(p => rect.x < p.x + p.w && rect.x + rect.w > p.x && rect.y < p.y + p.h && rect.y + rect.h > p.y);
  }

  for (const node of labels) {
    const dn = nodeDisplayName(node.id);
    const pt = map.latLngToLayerPoint([node.lat, node.lon]);
    const textW = dn.length * CHAR_W + 10;
    const rectR = makeRect(pt, textW, 'right');
    const rectL = makeRect(pt, textW, 'left');
    let chosenRect = null, side = 'right';
    if (!overlaps(rectR)) { chosenRect = rectR; side = 'right'; }
    else if (!overlaps(rectL)) { chosenRect = rectL; side = 'left'; }
    if (chosenRect) {
      placed.push(chosenRect);
      const anchorX = side === 'right' ? -OFFSET_X : OFFSET_X + textW;
      markers.push(L.marker([node.lat, node.lon], {
        icon: L.divIcon({ className: 'map-station-label', html: `<span>${esc(dn)}</span>`, iconSize: null, iconAnchor: [anchorX, 6] }),
        interactive: false
      }));
    }
  }
  map._dmLabelLayer = L.layerGroup(markers).addTo(map);
}

function _dmFitNodes(map, nodes, maxZoom) {
  const coords = nodes.filter(n => n && n.lat != null).map(n => [n.lat, n.lon]);
  if (coords.length === 0) return;
  const doFit = () => {
    map.invalidateSize();
    if (coords.length === 1) { map.setView(coords[0], maxZoom || 14); }
    else { map.fitBounds(L.latLngBounds(coords), { padding: [30, 30], maxZoom: maxZoom || 18 }); }
  };
  // Store fit function for re-use on toggle
  for (const [cid, entry] of Object.entries(_detailMaps)) {
    if (entry.leaflet === map) { entry.fitFn = doFit; break; }
  }
  doFit();
  setTimeout(doFit, 200);
}

// ---- Mini Beckmap (read-only) ----
// Clones the live beckmap SVG into two layers: dimmed background + focus overlay.
// mode: 'node' | 'segment' | 'line' (determines what gets highlighted)
function renderMiniBeck(svgEl, options) {
  if (!svgEl) return;
  const focusGroups = options?.focusGroupIds || new Set();
  const focusNodes = options?.focusNodeIds || new Set();
  const mode = options?.mode || 'line';

  // Ensure the beckmap has been rendered at least once
  const srcSvg = document.getElementById('schem-svg');
  if (!srcSvg) return;
  if (!srcSvg.innerHTML.trim() && typeof renderSchematic === 'function') renderSchematic();
  if (!srcSvg.innerHTML.trim()) { svgEl.innerHTML = ''; return; }

  // Compute viewBox from focus positions
  const allPos = typeof schemAllPlacedPositions === 'function' ? schemAllPlacedPositions() : [];
  if (!allPos.length) return;

  // Determine zoom area — focusZoomNodeIds zooms to specific nodes, otherwise zoom to focus
  const zoomNodes = options?.focusZoomNodeIds || focusNodes;
  let focusPos = allPos;
  if (zoomNodes.size > 0) {
    const fp = allPos.filter(p => zoomNodes.has(p.nodeId));
    if (fp.length > 0) focusPos = fp;
  } else if (focusGroups.size > 0) {
    const fp = allPos.filter(p => focusGroups.has(p.groupId));
    if (fp.length > 0) focusPos = fp;
  }

  // Use world coordinates (grid * SCHEM_CELL) then apply current viewport transform
  // This ensures the viewBox matches the cloned SVG's coordinate space
  const z = _schemState.zoom, vx = _schemState.viewX, vy = _schemState.viewY;
  const screenPts = focusPos.map(p => ({ x: vx + p.gx * SCHEM_CELL * z, y: vy + p.gy * SCHEM_CELL * z }));
  const xs = screenPts.map(p => p.x), ys = screenPts.map(p => p.y);
  const PAD = 40 * z; // scale padding with zoom
  const minSize = (zoomNodes !== focusNodes && zoomNodes.size <= 2) ? 250 * z : 150 * z;
  const vbW = Math.max((Math.max(...xs) - Math.min(...xs)) + PAD * 2, minSize);
  const vbH = Math.max((Math.max(...ys) - Math.min(...ys)) + PAD * 2, minSize);
  const vbX = (Math.min(...xs) + Math.max(...xs)) / 2 - vbW / 2;
  const vbY = (Math.min(...ys) + Math.max(...ys)) / 2 - vbH / 2;

  // Single-layer approach: one copy of SVG, dim non-focus elements inline
  const hasFocus = focusGroups.size > 0 || focusNodes.size > 0;
  const content = srcSvg.innerHTML;
  svgEl.innerHTML = `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="white"/>${content}`;
  svgEl.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);

  // Clean up: remove grid, interactive elements, cursors
  svgEl.querySelectorAll('.schem-grid-dot, .schem-crosshair').forEach(el => el.remove());
  svgEl.querySelectorAll('.schem-ic-dot').forEach(el => el.remove());
  svgEl.querySelectorAll('[style*="cursor"]').forEach(el => { el.style.cursor = 'inherit'; });
  svgEl.querySelectorAll('[class*="-hit"]').forEach(el => { el.style.pointerEvents = 'none'; });
  svgEl.querySelectorAll('.schem-dimmed').forEach(el => el.classList.remove('schem-dimmed'));

  // Single-layer dimming: mark non-focus elements with reduced opacity
  if (hasFocus) {
    const DIM_STYLE = 'opacity:0.35';
    // Dim routes by recoloring to grey (uniform treatment regardless of original color)
    function dimElement(el) {
      el.setAttribute('style', (el.getAttribute('style') || '') + ';' + DIM_STYLE);
      // Recolor strokes/fills to grey for uniform fading
      const recolor = e => {
        const s = e.getAttribute('stroke');
        if (s && s !== 'none' && s !== 'transparent' && s !== '#000' && s !== '#fff' && s !== 'white' && s !== 'black') e.setAttribute('stroke', '#bbb');
        const f = e.getAttribute('fill');
        if (e.tagName === 'text') e.setAttribute('fill', '#aaa');
        else if (f && f !== 'none' && f !== '#fff' && f !== 'white' && f !== '#000' && f !== 'black' && f !== 'transparent') e.setAttribute('fill', '#bbb');
      };
      recolor(el);
      el.querySelectorAll('path, line, circle, text, rect').forEach(recolor);
    }

    // Build set of node IDs: focusMarkNodes for marks, focusLabelNodes for labels
    const focusMarkNodes = new Set(focusNodes);
    const labelSeed = options?.focusLabelNodeIds || focusNodes;
    const focusLabelNodes = new Set(labelSeed);
    if (mode === 'line' || mode === 'service') {
      if (mode === 'line') {
        for (const gid of focusGroups) {
          const ls = data.beckmap?.lineStations?.[gid];
          if (ls) for (const nid of Object.keys(ls)) {
            focusLabelNodes.add(nid);
            focusMarkNodes.add(nid);
          }
        }
      }
      if (typeof schemFindInterchanges === 'function') {
        for (const ic of schemFindInterchanges()) {
          if (ic.nodeIds?.some(nid => focusLabelNodes.has(nid))) ic.nodeIds.forEach(nid => focusLabelNodes.add(nid));
        }
      }
      const focusDisplayNames = new Set();
      for (const nid of focusLabelNodes) focusDisplayNames.add(nodeDisplayName(nid));
      for (const n of data.nodes) { if (focusDisplayNames.has(nodeDisplayName(n.id))) focusLabelNodes.add(n.id); }
    }

    // Compute valid path `d` strings per group for segment/service modes
    const validEdgeKeys = new Set();
    const svcPairsByGroup = {};
    const validPathsByGroup = {};
    if ((mode === 'segment' || mode === 'service') && typeof schemCollectEdges === 'function') {
      if (mode === 'service' && options?.svcStopsList) {
        for (const entry of options.svcStopsList) {
          const gid = entry.groupId; if (!gid) continue;
          if (!svcPairsByGroup[gid]) svcPairsByGroup[gid] = new Set();
          // stops may be plain nodeId strings or {nodeId, passThrough} objects
          const stopNodes = entry.stops.map(s => typeof s === 'string' ? { nodeId: s, passThrough: false } : s);
          const paxStops = stopNodes.filter(st => { const n = getNode(st.nodeId); return n && isPassengerStop(n) && !st.passThrough; }).map(st => st.nodeId);
          for (let i = 0; i < paxStops.length - 1; i++) {
            svcPairsByGroup[gid].add(paxStops[i] + '|' + paxStops[i+1]);
            svcPairsByGroup[gid].add(paxStops[i+1] + '|' + paxStops[i]);
          }
        }
      }
      const focusNodeArr = [...focusNodes];
      for (const gid of focusGroups) {
        const edges = schemCollectEdges(gid);
        const groupPairs = svcPairsByGroup[gid];
        for (const e of edges) {
          const ek = e.key;
          if (mode === 'segment') {
            if (focusNodeArr.length === 2 && ((e.fromId === focusNodeArr[0] && e.toId === focusNodeArr[1]) || (e.fromId === focusNodeArr[1] && e.toId === focusNodeArr[0]))) validEdgeKeys.add(ek);
          } else if (groupPairs?.size > 0) {
            if (groupPairs.has(e.fromId + '|' + e.toId)) validEdgeKeys.add(ek);
          } else {
            if (focusNodes.has(e.fromId) && focusNodes.has(e.toId)) validEdgeKeys.add(ek);
          }
        }
      }
      if (validEdgeKeys.size > 0) {
        for (const gid of focusGroups) {
          const groupPairs = svcPairsByGroup[gid];
          const routes = typeof schemDeriveRoutes === 'function' ? schemDeriveRoutes(gid) : [];
          const groupValidDs = new Set();
          for (const route of routes) {
            const ek = route.edgeKey || route.key;
            if (!validEdgeKeys.has(ek)) continue;
            const [a, b] = ek.split('|');
            if (groupPairs && !groupPairs.has(a + '|' + b) && !groupPairs.has(b + '|' + a)) continue;
            const cornerR = SCHEM_CELL * _schemState.zoom * 0.35;
            const d = schemSmoothPath(route.cells, cornerR);
            if (d) groupValidDs.add(d);
          }
          if (groupValidDs.size > 0) validPathsByGroup[gid] = groupValidDs;
        }
      }
    }
    const hasEdgeFilter = Object.keys(validPathsByGroup).length > 0;

    // Dim non-focus routes
    svgEl.querySelectorAll('[data-gid]').forEach(el => {
      if (el.hasAttribute('data-nid')) return;
      const gid = el.getAttribute('data-gid');
      let isFocus = focusGroups.has(gid);
      if (isFocus && hasEdgeFilter && el.tagName !== 'text') {
        const groupDs = validPathsByGroup[gid];
        if (!groupDs) { isFocus = false; }
        else {
          const pathEls = el.tagName === 'path' ? [el] : [...el.querySelectorAll('path')];
          if (!pathEls.some(p => groupDs.has(p.getAttribute('d')))) isFocus = false;
        }
      }
      if (!isFocus) dimElement(el);
    });

    // Dim non-focus marks + labels (marks use focusMarkNodes, labels use focusLabelNodes)
    svgEl.querySelectorAll('[data-nid]').forEach(el => {
      const nid = el.getAttribute('data-nid');
      const isLabel = el.tagName === 'text' || !!el.querySelector('text');
      const checkSet = isLabel ? focusLabelNodes : focusMarkNodes;
      if (!checkSet.has(nid)) {
        const dn = nodeDisplayName(nid);
        let nameMatch = false;
        for (const fid of checkSet) { if (nodeDisplayName(fid) === dn) { nameMatch = true; break; } }
        if (nameMatch) { checkSet.add(nid); return; }
        dimElement(el);
      }
    });

    // Dim non-focus interchange blobs (use mark set, not label set)
    svgEl.querySelectorAll('[data-ic-nids]').forEach(el => {
      const nids = el.getAttribute('data-ic-nids').split(',');
      if (!nids.some(nid => focusMarkNodes.has(nid))) dimElement(el);
    });

    // Dim non-focus ISI/OSI connectors
    svgEl.querySelectorAll('[data-fn]').forEach(el => {
      const fn = el.getAttribute('data-fn'), tn = el.getAttribute('data-tn');
      if (!focusLabelNodes.has(fn) && !focusLabelNodes.has(tn)) dimElement(el);
    });

    // Promote focused elements to top of SVG (later = rendered on top)
    const focusedEls = [...svgEl.querySelectorAll('[data-gid], [data-nid], [data-ic-nids], [data-fn]')]
      .filter(el => !el.style.cssText.includes('opacity'));
    for (const el of focusedEls) svgEl.appendChild(el);

    // Highlight the zoom-focus station with a gold ring
    if (options?.focusZoomNodeIds) {
      for (const nid of options.focusZoomNodeIds) {
        for (const p of allPos) {
          if (p.nodeId !== nid) continue;
          const sp = schemWorldToScreen(p.gx * SCHEM_CELL, p.gy * SCHEM_CELL);
          const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          ring.setAttribute('cx', sp.x); ring.setAttribute('cy', sp.y); ring.setAttribute('r', z * 10);
          ring.setAttribute('fill', '#ffc917'); ring.setAttribute('stroke', '#ffc917');
          ring.setAttribute('stroke-width', z * 2.5); ring.setAttribute('opacity', '0.7');
          svgEl.appendChild(ring);
        }
      }
    }
  }

  _miniBeckPanZoom(svgEl, vbW, vbH, vbX, vbY);
}

function _miniBeckPanZoom(svgEl, W, H, x0, y0) {
  const vb = { x: x0 || 0, y: y0 || 0, w: W, h: H };
  let drag = null, cachedRect = null;

  // Use a controller to track and remove old listeners when re-initialized
  if (svgEl._mbCleanup) svgEl._mbCleanup();
  const ac = new AbortController();
  svgEl._mbCleanup = () => ac.abort();

  svgEl.addEventListener('wheel', e => {
    e.preventDefault();
    if (!cachedRect) cachedRect = svgEl.getBoundingClientRect();
    if (!cachedRect.width) return;
    const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const mx = (e.clientX - cachedRect.left) / cachedRect.width * vb.w + vb.x;
    const my = (e.clientY - cachedRect.top) / cachedRect.height * vb.h + vb.y;
    vb.x = mx - (mx - vb.x) * factor;
    vb.y = my - (my - vb.y) * factor;
    vb.w *= factor; vb.h *= factor;
    svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }, { passive: false, signal: ac.signal });

  svgEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    cachedRect = svgEl.getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, ox: vb.x, oy: vb.y };
    svgEl.style.cursor = 'grabbing';
    e.preventDefault();
  }, { signal: ac.signal });

  svgEl.addEventListener('mousemove', e => {
    if (!drag || !cachedRect?.width) return;
    vb.x = drag.ox - (e.clientX - drag.sx) / cachedRect.width * vb.w;
    vb.y = drag.oy - (e.clientY - drag.sy) / cachedRect.height * vb.h;
    svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  }, { signal: ac.signal });

  svgEl.addEventListener('mouseup', () => {
    if (drag) { drag = null; svgEl.style.cursor = 'grab'; }
  }, { signal: ac.signal });

  svgEl.addEventListener('mouseleave', () => {
    if (drag) { drag = null; svgEl.style.cursor = 'grab'; }
  }, { signal: ac.signal });

  svgEl.style.cursor = 'grab';
}

// ============================================================
// IMPORT / EXPORT
// ============================================================
function renderImportExport() {
  const el = document.getElementById('import-export-content');
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:800px">
      <div class="ie-card">
        <h3>${t('ie.json_title')}</h3>
        <p class="text-dim" style="font-size:13px;margin:8px 0 16px">${t('ie.json_desc')}</p>
        <div class="flex gap-8">
          <button class="btn" onclick="importData()">↑ ${t('btn.import_json')}</button>
          <button class="btn" onclick="exportData()">↓ ${t('btn.export_json')}</button>
        </div>
      </div>
      <div class="ie-card">
        <h3>${t('ie.ogf_title')}</h3>
        <p class="text-dim" style="font-size:13px;margin:8px 0 16px">${t('ie.ogf_desc')}</p>
        <button class="btn" onclick="startRelationImport()">${t('ie.ogf_btn')}</button>
      </div>
      <div class="ie-card">
        <h3>${t('ie.csv_node_title')}</h3>
        <p class="text-dim" style="font-size:13px;margin:8px 0 16px">${t('ie.csv_node_desc')}</p>
        <button class="btn" onclick="startCSVNodeImport()">${t('ie.csv_btn')}</button>
      </div>
      <div class="ie-card">
        <h3>${t('ie.csv_seg_title')}</h3>
        <p class="text-dim" style="font-size:13px;margin:8px 0 16px">${t('ie.csv_seg_desc')}</p>
        <button class="btn" onclick="startCSVSegmentImport()">${t('ie.csv_btn')}</button>
      </div>
      <div class="ie-card">
        <h3>${t('ie.saves_title')}</h3>
        <p class="text-dim" style="font-size:13px;margin:8px 0 16px">${t('ie.saves_desc')}</p>
        <button class="btn" onclick="openSaveManager()">${t('ie.manage_saves')}</button>
      </div>
    </div>`;
}

// ============================================================
// OGF RELATION IMPORT WIZARD
// ============================================================
window._relImportState = null;

function startRelationImport() {
  window._relImportState = {
    step: 1,
    config: {
      relationId: '', defaultMaxSpeed: 120, maxspeedBoundary: 'default',
      allowedModes: [], defaultPlatformCount: getSetting('defaultPlatforms', 2),
      defaultTrackCount: 2, disambiguationSuffix: ''
    },
    raw: null, stations: [], segments: [], warnings: []
  };
  document.getElementById('sidebar').classList.add('sidebar-locked');
  _relRenderStep(1);
}

function _relCancel() {
  window._relImportState = null;
  document.getElementById('sidebar').classList.remove('sidebar-locked');
  renderImportExport();
}

function _relRenderStep(n) {
  _relImportState.step = n;
  const el = document.getElementById('import-export-content');
  const s = _relImportState;
  const totalSteps = 5;

  const header = (step, title) => {
    return `<div class="csv-wizard-header">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <h2 style="font-family:var(--font-display);font-size:22px;font-weight:600;margin-bottom:2px">${t('rel.title')}</h2>
          <div class="text-dim" style="font-size:13px">${t('csv.step_of', { n: step, total: totalSteps })}: ${title}</div>
        </div>
        <button class="btn" onclick="_relCancel()">${t('btn.cancel')}</button>
      </div>
      <div class="csv-step-bar">${Array.from({length: totalSteps}, (_, i) =>
        `<div class="csv-step-dot${i + 1 <= step ? ' active' : ''}${i + 1 === step ? ' current' : ''}"></div>`
      ).join('<div class="csv-step-line"></div>')}</div>
    </div>`;
  };

  // ---- Step 1: Config ----
  if (n === 1) {
    const c = s.config;
    let modesHtml = '';
    if (data.categories.length) {
      modesHtml = `<div class="form-group"><label>${t('field.allowed_modes')}</label>
        <p class="text-dim" style="font-size:12px;margin-bottom:6px">${t('field.allowed_modes_help')}</p>`;
      for (const cat of data.categories) {
        const checked = c.allowedModes.includes(cat.id) ? 'checked' : '';
        modesHtml += `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-bottom:4px">
          <input type="checkbox" ${checked} onchange="_relToggleMode('${cat.id}',this.checked)"> ${esc(cat.name)}</label>`;
      }
      modesHtml += `</div>`;
    }
    el.innerHTML = header(1, t('rel.step_config')) + `
      <div style="margin-top:20px;max-width:500px">
        <div class="form-group"><label>${t('rel.relation_id')}</label>
          <input type="text" id="rel-id" value="${esc(c.relationId)}" placeholder="${t('rel.relation_id_placeholder')}"
            onchange="_relImportState.config.relationId=this.value.trim()"></div>
        <div class="form-row">
          <div class="form-group"><label>${t('csv.default_speed')}</label>
            <input type="number" min="1" max="500" value="${c.defaultMaxSpeed}"
              onchange="_relImportState.config.defaultMaxSpeed=parseInt(this.value)||120"></div>
          <div class="form-group"><label>${t('csv.default_tracks')}</label>
            <input type="number" min="1" max="20" value="${c.defaultTrackCount}"
              onchange="_relImportState.config.defaultTrackCount=parseInt(this.value)||2"></div>
        </div>
        <div class="form-group"><label>${t('csv.default_platforms')}</label>
          <input type="number" min="0" max="50" value="${c.defaultPlatformCount}"
            onchange="_relImportState.config.defaultPlatformCount=parseInt(this.value)||0"></div>
        <div class="form-group"><label>${t('rel.maxspeed_boundary')}</label>
          <select onchange="_relImportState.config.maxspeedBoundary=this.value">
            <option value="default" ${c.maxspeedBoundary === 'default' ? 'selected' : ''}>${t('rel.maxspeed_default')}</option>
            <option value="waypoints" ${c.maxspeedBoundary === 'waypoints' ? 'selected' : ''}>${t('rel.maxspeed_waypoints')}</option>
          </select></div>
        <div class="form-group"><label>${t('rel.disambig')}</label>
          <p class="text-dim" style="font-size:12px;margin-bottom:6px">${t('csv.disambig_desc')}</p>
          <input type="text" value="${esc(c.disambiguationSuffix)}" placeholder="${t('csv.disambig_placeholder')}"
            onchange="_relImportState.config.disambiguationSuffix=this.value.trim()"></div>
        ${modesHtml}
        <button class="btn btn-primary" onclick="_relFetchAndProcess()" id="rel-fetch-btn">${t('rel.fetch_btn')}</button>
      </div>`;
    return;
  }

  // ---- Step 2: Station Review ----
  if (n === 2) {
    const stations = s.stations;
    let table = `<table class="data-table csv-preview-table"><thead><tr>
      <th></th><th>${t('field.name')}</th><th>${t('field.type')}</th><th>OGF ID</th>
      <th>${t('rel.snap_dist')}</th><th></th></tr></thead><tbody>`;
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      if (st._isWaypoint) continue; // hide auto-generated waypoints
      const snapM = Math.round((st._snap?.dist || 0) * 1000);
      const snapWarn = snapM > 50 ? ` style="color:var(--warn)"` : '';
      const dupWarn = st._dupType ? ` style="background:var(--warn-dim)"` : '';
      const dupLabel = st._dupType === 'ogf' ? t('csv.warn_dup_ogf_existing', { name: st._dupExistingName })
        : st._dupType === 'batch' ? t('csv.warn_dup_ogf') : '';
      table += `<tr${dupWarn}>
        <td><input type="checkbox" ${st._include !== false ? 'checked' : ''} onchange="_relImportState.stations[${i}]._include=this.checked"></td>
        <td><input type="text" value="${esc(st.name)}" onchange="_relImportState.stations[${i}].name=this.value.trim()" style="width:180px;font-size:12px"></td>
        <td>${esc(st.type)}</td>
        <td class="mono" style="font-size:11px">${esc(st.ogfNode)}</td>
        <td class="mono"${snapWarn}>${snapM}m</td>
        <td class="text-dim" style="font-size:11px">${dupLabel}</td>
      </tr>`;
    }
    table += `</tbody></table>`;
    const count = stations.filter(st => st._include !== false && !st._isWaypoint).length;
    el.innerHTML = header(2, t('rel.step_stations')) + `
      <div style="margin-top:20px">
        <div class="text-dim" style="margin-bottom:8px">${t('rel.station_count', { n: count })}</div>
        <div style="overflow-x:auto;max-height:400px;overflow-y:auto">${table}</div>
        <div class="flex gap-8" style="margin-top:16px">
          <button class="btn" onclick="_relRenderStep(1)">${t('btn.back')}</button>
          <button class="btn btn-primary" onclick="_relRenderStep(3)">${t('btn.next')}</button>
        </div>
      </div>`;
    return;
  }

  // ---- Step 3: Segment Review ----
  if (n === 3) {
    const segs = s.segments;
    let table = `<table class="data-table csv-preview-table"><thead><tr>
      <th></th><th>${t('field.from_node')}</th><th>${t('field.to_node')}</th>
      <th>${t('field.distance')}</th><th>${t('field.max_speed')}</th><th></th>
    </tr></thead><tbody>`;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const stA = s.stations.find(st => st.id === seg.nodeA) || getNode(seg.nodeA);
      const stB = s.stations.find(st => st.id === seg.nodeB) || getNode(seg.nodeB);
      const fromName = stA ? (stA.name || nodeDisplayName?.(stA.id) || stA.id) : '?';
      const toName = stB ? (stB.name || nodeDisplayName?.(stB.id) || stB.id) : '?';
      const dupWarn = seg._dupType ? ` style="background:var(--warn-dim)"` : '';
      table += `<tr${dupWarn}>
        <td><input type="checkbox" ${seg._include !== false ? 'checked' : ''} onchange="_relImportState.segments[${i}]._include=this.checked"></td>
        <td>${esc(fromName)}</td><td>${esc(toName)}</td>
        <td class="mono">${seg.distance}</td>
        <td><input type="number" value="${seg.maxSpeed}" min="1" max="500" onchange="_relImportState.segments[${i}].maxSpeed=parseInt(this.value)||120" style="width:70px;font-size:12px"></td>
        <td class="text-dim" style="font-size:11px">${seg._dupType ? t('csv.warn_dup_existing') : ''}</td>
      </tr>`;
    }
    table += `</tbody></table>`;
    const count = segs.filter(sg => sg._include !== false).length;
    el.innerHTML = header(3, t('rel.step_segments')) + `
      <div style="margin-top:20px">
        <div class="text-dim" style="margin-bottom:8px">${t('csv.review_count', { n: count })}</div>
        <div style="overflow-x:auto;max-height:400px;overflow-y:auto">${table}</div>
        <div class="flex gap-8" style="margin-top:16px">
          <button class="btn" onclick="_relRenderStep(2)">${t('btn.back')}</button>
          <button class="btn btn-primary" onclick="_relRenderStep(4)">${t('btn.next')}</button>
        </div>
      </div>`;
    return;
  }

  // ---- Step 4: Warnings ----
  if (n === 4) {
    const w = s.warnings;
    let html = `<div style="margin-top:20px">`;
    if (!w.length) {
      html += `<p class="text-dim">${t('rel.no_warnings')}</p>`;
    } else {
      const grouped = {};
      for (const warn of w) {
        if (!grouped[warn.type]) grouped[warn.type] = [];
        grouped[warn.type].push(warn);
      }
      for (const [type, items] of Object.entries(grouped)) {
        html += `<div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;color:var(--warn);margin-bottom:4px">${esc(type)} (${items.length})</div>`;
        for (const item of items) {
          html += `<div class="text-dim" style="font-size:12px;margin-left:12px;margin-bottom:2px">${esc(item.message)}</div>`;
        }
        html += `</div>`;
      }
    }
    html += `<div class="flex gap-8" style="margin-top:16px">
      <button class="btn" onclick="_relRenderStep(3)">${t('btn.back')}</button>
      <button class="btn btn-primary" onclick="_relRenderStep(5)">${t('btn.next')}</button>
    </div></div>`;
    el.innerHTML = header(4, t('rel.step_warnings')) + html;
    return;
  }

  // ---- Step 5: Confirm ----
  if (n === 5) {
    const stCount = s.stations.filter(st => st._include !== false).length;
    const sgCount = s.segments.filter(sg => sg._include !== false).length;
    el.innerHTML = header(5, t('rel.step_confirm')) + `
      <div style="margin-top:20px;max-width:500px">
        <div class="ie-card" style="margin-bottom:20px">
          <div style="font-size:16px;font-weight:600;margin-bottom:8px">${t('rel.summary')}</div>
          <div>${t('rel.importing_stations', { n: stCount })}</div>
          <div>${t('rel.importing_segments', { n: sgCount })}</div>
          ${s.warnings.length ? `<div style="color:var(--warn)">${t('rel.warnings_count', { n: s.warnings.length })}</div>` : ''}
        </div>
        <div class="ie-card" style="margin-bottom:20px">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">${t('rel.whats_left')}</div>
          <ul class="text-dim" style="font-size:12px;margin-left:16px;line-height:1.8">
            <li>${t('rel.manual_junctions')}</li>
            <li>${t('rel.manual_tracks')}</li>
            <li>${t('rel.manual_platforms')}</li>
            <li>${t('rel.manual_services')}</li>
            <li>${t('rel.manual_lines')}</li>
          </ul>
        </div>
        <div class="flex gap-8">
          <button class="btn" onclick="_relRenderStep(4)">${t('btn.back')}</button>
          <button class="btn btn-primary" onclick="_relConfirmImport()">${t('csv.btn_import', { n: stCount + sgCount })}</button>
        </div>
      </div>`;
    return;
  }
}

function _relToggleMode(catId, checked) {
  const modes = _relImportState.config.allowedModes;
  if (checked && !modes.includes(catId)) modes.push(catId);
  else if (!checked) { const idx = modes.indexOf(catId); if (idx >= 0) modes.splice(idx, 1); }
}

async function _relFetchAndProcess() {
  const s = _relImportState;
  const c = s.config;
  const relId = c.relationId.replace(/\D/g, '');
  if (!relId) { toast(t('rel.no_id'), 'error'); return; }

  const btn = document.getElementById('rel-fetch-btn');
  if (btn) { btn.disabled = true; btn.textContent = t('rel.fetching'); }

  try {
    toast(t('rel.fetching'), 'info');
    s.raw = await fetchRelationFull(relId);
    console.log('[Relation Import] Raw fetch result:', s.raw);
    console.log(`[Relation Import] ${s.raw.ways.length} ways, ${s.raw.stops.length} stops, ${s.raw.warnings.length} warnings`);
    const result = processRelationImport(c, s.raw);
    console.log('[Relation Import] Processed:', result.stations.length, 'stations,', result.segments.length, 'segments,', result.warnings.length, 'warnings');
    s.stations = result.stations;
    s.segments = result.segments;
    s.warnings = result.warnings;
    _relRenderStep(2);
  } catch (err) {
    console.error('Relation import failed:', err);
    toast(t('rel.fetch_error', { msg: err.message }), 'error');
    if (btn) { btn.disabled = false; btn.textContent = t('rel.fetch_btn'); }
  }
}

let _relImporting = false;
async function _relConfirmImport() {
  if (_relImporting) return;
  _relImporting = true;
  const s = _relImportState;

  const stationsToImport = s.stations.filter(st => st._include !== false);
  const segmentsToImport = s.segments.filter(sg => sg._include !== false);

  // Clean temp properties
  for (const st of stationsToImport) {
    delete st._snap; delete st._include; delete st._dupType;
    delete st._dupExistingName; delete st._disambig; delete st._isWaypoint;
  }
  for (const sg of segmentsToImport) {
    delete sg._include; delete sg._dupType;
    // Remap segment nodeA/nodeB if their station was excluded
    // (segments referencing excluded stations should have been unchecked too)
  }

  data.nodes.push(...stationsToImport);
  data.segments.push(...segmentsToImport);

  save();
  document.getElementById('sidebar').classList.remove('sidebar-locked');
  window._relImportState = null;
  _relImporting = false;
  refreshAll();
  toast(t('csv.import_success', { n: stationsToImport.length + segmentsToImport.length }), 'success');
  renderImportExport();
}

// ============================================================
// CSV IMPORT WIZARDS
// ============================================================
window._csvImportState = null;

const CSV_NODE_FIELDS = [
  { key: 'skip', label: '(skip)' },
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'ogfNode', label: 'OGF Node ID' },
  { key: 'refCode', label: 'Ref Code' },
  { key: 'address', label: 'Address' },
  { key: 'description', label: 'Description' },
  { key: 'platforms', label: 'Platforms (pipe-separated)' }
];

const CSV_SEG_FIELDS = [
  { key: 'skip', label: '(skip)' },
  { key: 'fromNode', label: 'From Node' },
  { key: 'toNode', label: 'To Node' },
  { key: 'distance', label: 'Distance (km)' },
  { key: 'maxSpeed', label: 'Max Speed (km/h)' },
  { key: 'trackCount', label: 'Track Count' },
  { key: 'electrification', label: 'Electrified (true/false)' },
  { key: 'refCode', label: 'Ref Code' },
  { key: 'description', label: 'Description' },
  { key: 'ogfWayIds', label: 'OGF Way IDs' }
];

function startCSVNodeImport() { _csvInit('nodes'); }
function startCSVSegmentImport() { _csvInit('segments'); }

function _csvInit(mode) {
  window._csvImportState = {
    mode, step: 1,
    file: { name: '', raw: '', delimiter: ',', rows: [] },
    columnMap: {},
    defaults: mode === 'nodes'
      ? { type: 'station', platformCount: getSetting('defaultPlatforms', 2) }
      : { maxSpeed: 120, trackCount: 2, electrification: true, allowedModes: [] },
    preview: [],
    nodeMatches: {},
    warnings: []
  };
  document.getElementById('sidebar').classList.add('sidebar-locked');
  _csvRenderStep(1);
}

function _csvCancel() {
  window._csvImportState = null;
  document.getElementById('sidebar').classList.remove('sidebar-locked');
  renderImportExport();
}

function _csvStepHeader(stepNum, totalSteps, title) {
  const s = _csvImportState;
  const modeLabel = s.mode === 'nodes' ? t('csv.mode_nodes') : t('csv.mode_segments');
  return `<div class="csv-wizard-header">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div>
        <h2 style="font-family:var(--font-display);font-size:22px;font-weight:600;margin-bottom:2px">${modeLabel}</h2>
        <div class="text-dim" style="font-size:13px">${t('csv.step_of', { n: stepNum, total: totalSteps })}: ${title}</div>
      </div>
      <button class="btn" onclick="_csvCancel()">${t('btn.cancel')}</button>
    </div>
    <div class="csv-step-bar">${Array.from({length: totalSteps}, (_, i) =>
      `<div class="csv-step-dot${i + 1 <= stepNum ? ' active' : ''}${i + 1 === stepNum ? ' current' : ''}"></div>`
    ).join('<div class="csv-step-line"></div>')}</div>
  </div>`;
}

function _csvRenderStep(n) {
  _csvImportState.step = n;
  const el = document.getElementById('import-export-content');
  const s = _csvImportState;
  const totalSteps = s.mode === 'nodes' ? 6 : 7;

  if (n === 1) {
    el.innerHTML = _csvStepHeader(1, totalSteps, t('csv.step_upload')) + `
      <div class="ie-card" style="max-width:500px;margin-top:20px">
        <p style="margin-bottom:16px">${t('csv.upload_desc')}</p>
        <input type="file" accept=".csv,.tsv,.txt" onchange="_csvHandleFile(event)" style="font-size:13px">
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <label style="font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.04em;display:block;margin-bottom:5px">${t('csv.or_paste')}</label>
          <textarea id="csv-paste-area" placeholder="${t('csv.paste_placeholder')}" style="width:100%;height:120px;font-family:var(--font-mono);font-size:12px;resize:vertical"></textarea>
          <button class="btn" style="margin-top:8px" onclick="_csvHandlePaste()">${t('csv.use_pasted')}</button>
        </div>
      </div>`;
    return;
  }

  if (n === 2) {
    const rows = s.file.rows;
    const delimLabel = s.file.delimiter === '\t' ? t('csv.delim_tab') : t('csv.delim_comma');
    let table = `<table class="data-table csv-preview-table"><thead><tr>`;
    const colCount = rows[0]?.length || 0;
    for (let c = 0; c < colCount; c++) table += `<th>${t('csv.col')} ${c + 1}</th>`;
    table += `</tr></thead><tbody>`;
    for (let r = 0; r < Math.min(rows.length, 5); r++) {
      table += `<tr>${rows[r].map(v => `<td>${esc(v)}</td>`).join('')}</tr>`;
    }
    table += `</tbody></table>`;
    el.innerHTML = _csvStepHeader(2, totalSteps, t('csv.step_preview')) + `
      <div style="margin-top:20px">
        <div class="text-dim" style="margin-bottom:8px">${t('csv.detected', { delim: delimLabel, rows: rows.length, cols: colCount })}</div>
        <div style="overflow-x:auto">${table}</div>
        <div class="flex gap-8" style="margin-top:16px">
          <button class="btn" onclick="_csvRenderStep(1)">${t('btn.back')}</button>
          <button class="btn btn-primary" onclick="_csvRenderStep(3)">${t('btn.next')}</button>
        </div>
      </div>`;
    return;
  }

  if (n === 3) {
    const fields = s.mode === 'nodes' ? CSV_NODE_FIELDS : CSV_SEG_FIELDS;
    const colCount = s.file.rows[0]?.length || 0;
    const firstRow = s.file.rows[0] || [];
    // Auto-assign columns if not yet mapped
    if (Object.keys(s.columnMap).length === 0) {
      for (let c = 0; c < colCount; c++) s.columnMap[c] = 'skip';
    }
    let html = `<div style="margin-top:20px;max-width:700px">`;
    html += `<p class="text-dim" style="margin-bottom:12px">${t('csv.assign_desc')}</p>`;
    for (let c = 0; c < colCount; c++) {
      const sample = firstRow[c] || '';
      html += `<div class="csv-assign-row">
        <div class="csv-assign-label">${t('csv.col')} ${c + 1}</div>
        <div class="csv-assign-sample mono">${esc(sample.length > 30 ? sample.slice(0, 30) + '...' : sample)}</div>
        <select onchange="_csvImportState.columnMap[${c}]=this.value" class="csv-assign-select">
          ${fields.map(f => `<option value="${f.key}" ${s.columnMap[c] === f.key ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>`;
    }
    html += `<div class="flex gap-8" style="margin-top:16px">
      <button class="btn" onclick="_csvRenderStep(2)">${t('btn.back')}</button>
      <button class="btn btn-primary" onclick="_csvRenderStep(4)">${t('btn.next')}</button>
    </div></div>`;
    el.innerHTML = _csvStepHeader(3, totalSteps, t('csv.step_assign')) + html;
    return;
  }

  if (s.mode === 'nodes') _csvRenderNodeStep(n, totalSteps);
  else _csvRenderSegStep(n, totalSteps);
}

function _csvHandleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const raw = ev.target.result;
    const parsed = parseCSV(raw);
    _csvImportState.file = { name: file.name, raw, delimiter: parsed.delimiter, rows: parsed.rows };
    _csvImportState.columnMap = {};
    _csvRenderStep(2);
  };
  reader.readAsText(file);
}

function _csvHandlePaste() {
  const raw = (document.getElementById('csv-paste-area')?.value || '').trim();
  if (!raw) { toast(t('csv.paste_empty'), 'error'); return; }
  const parsed = parseCSV(raw);
  _csvImportState.file = { name: 'pasted data', raw, delimiter: parsed.delimiter, rows: parsed.rows };
  _csvImportState.columnMap = {};
  _csvRenderStep(2);
}

// ---- Node Import Steps 4-6 ----
function _csvRenderNodeStep(n, totalSteps) {
  const el = document.getElementById('import-export-content');
  const s = _csvImportState;

  if (n === 4) {
    // Defaults step
    const hasTypeCol = Object.values(s.columnMap).includes('type');
    let html = `<div style="margin-top:20px;max-width:500px">`;
    if (!hasTypeCol) {
      html += `<div class="form-group"><label>${t('csv.default_type')}</label>
        <select id="csv-def-type" onchange="_csvImportState.defaults.type=this.value">
          <option value="station" ${s.defaults.type === 'station' ? 'selected' : ''}>Station</option>
          <option value="bus_stop" ${s.defaults.type === 'bus_stop' ? 'selected' : ''}>Bus Stop</option>
          <option value="junction" ${s.defaults.type === 'junction' ? 'selected' : ''}>Junction</option>
          <option value="waypoint" ${s.defaults.type === 'waypoint' ? 'selected' : ''}>Waypoint</option>
          <option value="depot" ${s.defaults.type === 'depot' ? 'selected' : ''}>Depot</option>
          <option value="freight_yard" ${s.defaults.type === 'freight_yard' ? 'selected' : ''}>Freight Yard</option>
        </select></div>`;
    }
    const hasPlatCol = Object.values(s.columnMap).includes('platforms');
    if (!hasPlatCol) {
      html += `<div class="form-group"><label>${t('csv.default_platforms')}</label>
        <input type="number" min="0" max="50" value="${s.defaults.platformCount}" onchange="_csvImportState.defaults.platformCount=parseInt(this.value)||0"></div>`;
    }
    html += `<div class="flex gap-8" style="margin-top:16px">
      <button class="btn" onclick="_csvRenderStep(3)">${t('btn.back')}</button>
      <button class="btn btn-primary" onclick="_csvBuildNodePreview()">${t('csv.btn_preview')}</button>
    </div></div>`;
    el.innerHTML = _csvStepHeader(4, totalSteps, t('csv.step_defaults')) + html;
    return;
  }

  if (n === 5) {
    // Dedup review step — show only items with conflicts
    const nodes = s.preview;
    const dupes = nodes.map((nd, i) => ({ nd, i })).filter(({ nd }) => nd._dupType);
    if (!dupes.length) {
      el.innerHTML = _csvStepHeader(5, totalSteps, t('csv.step_dedup')) + `
        <div style="margin-top:20px">
          <p class="text-dim">${t('csv.no_dupes')}</p>
          <div class="flex gap-8" style="margin-top:16px">
            <button class="btn" onclick="_csvRenderStep(4)">${t('btn.back')}</button>
            <button class="btn btn-primary" onclick="_csvRenderStep(6)">${t('btn.next')}</button>
          </div>
        </div>`;
      return;
    }
    let html = `<div style="margin-top:20px">
      <p class="text-dim" style="margin-bottom:12px">${t('csv.dedup_node_desc', { n: dupes.length })}</p>
      <div style="overflow-x:auto;max-height:450px;overflow-y:auto">
      <table class="data-table csv-preview-table"><thead><tr>
        <th>${t('csv.importing')}</th><th>${t('csv.existing')}</th><th>${t('csv.conflict')}</th><th>${t('csv.action')}</th>
      </tr></thead><tbody>`;
    for (const { nd, i } of dupes) {
      const existName = nd._dupExistingName || '';
      html += `<tr>
        <td>${esc(nd.name || '')} <span class="mono text-dim" style="font-size:11px">${esc(nd.ogfNode || '')}</span></td>
        <td>${esc(existName)}</td>
        <td class="text-dim" style="font-size:11px">${nd._dupType === 'ogf' ? t('csv.dup_same_ogf') : t('csv.dup_same_batch')}</td>
        <td style="white-space:nowrap">
          <select onchange="_csvNodeDedupAction(${i},this.value)" class="csv-match-select">
            <option value="skip" ${nd._include === false ? 'selected' : ''}>${t('csv.action_skip')}</option>
            <option value="disambig" ${nd._include !== false ? 'selected' : ''}>${t('csv.action_disambig')}</option>
          </select>
          ${nd._include !== false ? `<input type="text" value="${esc(nd._disambig || '')}" placeholder="${t('csv.disambig_placeholder')}"
            onchange="_csvNodeSetDisambig(${i},this.value)" style="width:120px;margin-left:6px;font-size:12px">` : ''}
        </td>
      </tr>`;
    }
    html += `</tbody></table></div>
      <div class="flex gap-8" style="margin-top:16px">
        <button class="btn" onclick="_csvRenderStep(4)">${t('btn.back')}</button>
        <button class="btn btn-primary" onclick="_csvApplyNodeDedup();_csvRenderStep(6)">${t('btn.next')}</button>
      </div></div>`;
    el.innerHTML = _csvStepHeader(5, totalSteps, t('csv.step_dedup')) + html;
    return;
  }

  if (n === 6) {
    // Final review
    const nodes = s.preview;
    let table = `<table class="data-table csv-preview-table"><thead><tr>
      <th></th><th>${t('field.name')}</th><th>${t('field.type')}</th><th>${t('field.ogf_node')}</th>
      <th>${t('field.platforms')}</th><th></th></tr></thead><tbody>`;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      const warn = nd._warn ? ` style="background:var(--warn-dim)"` : '';
      table += `<tr${warn}>
        <td><input type="checkbox" ${nd._include !== false ? 'checked' : ''} onchange="_csvImportState.preview[${i}]._include=this.checked"></td>
        <td>${esc(nd.name || '')}</td><td>${esc(nd.type)}</td><td class="mono">${esc(nd.ogfNode || '')}</td>
        <td>${nd.platforms.length}</td>
        <td class="text-dim" style="font-size:11px">${nd._warn || ''}</td>
      </tr>`;
    }
    table += `</tbody></table>`;
    const count = nodes.filter(nd => nd._include !== false).length;
    el.innerHTML = _csvStepHeader(6, totalSteps, t('csv.step_review')) + `
      <div style="margin-top:20px">
        <div class="text-dim" style="margin-bottom:8px">${t('csv.review_count', { n: count })}</div>
        <div style="overflow-x:auto;max-height:400px;overflow-y:auto">${table}</div>
        <div class="flex gap-8" style="margin-top:16px">
          <button class="btn" onclick="_csvRenderStep(5)">${t('btn.back')}</button>
          <button class="btn btn-primary" onclick="_csvConfirmNodeImport()">${t('csv.btn_import', { n: count })}</button>
        </div>
      </div>`;
    return;
  }
}

function _csvBuildNodePreview() {
  const s = _csvImportState;
  const fieldCol = _csvFieldCol();
  const nodes = [];
  for (const row of s.file.rows) {
    const name = fieldCol.name != null ? (row[fieldCol.name] || '').trim() : '';
    const typeRaw = fieldCol.type != null ? (row[fieldCol.type] || '').trim().toLowerCase() : '';
    const validTypes = ['station', 'bus_stop', 'junction', 'waypoint', 'depot', 'freight_yard'];
    const type = validTypes.includes(typeRaw) ? typeRaw : s.defaults.type;
    const ogfNode = fieldCol.ogfNode != null ? (row[fieldCol.ogfNode] || '').trim().replace(/^node\s+/i, '') : '';
    const refCode = fieldCol.refCode != null ? (row[fieldCol.refCode] || '').trim() : '';
    const address = fieldCol.address != null ? (row[fieldCol.address] || '').trim() : '';
    const description = fieldCol.description != null ? (row[fieldCol.description] || '').trim() : '';
    const platRaw = fieldCol.platforms != null ? (row[fieldCol.platforms] || '').trim() : '';

    let platforms = [];
    if (platRaw) {
      platforms = platRaw.split('|').map(p => ({ id: uid(), name: p.trim() })).filter(p => p.name);
    } else if (type === 'station' || type === 'bus_stop') {
      const count = s.defaults.platformCount || 0;
      for (let i = 1; i <= count; i++) platforms.push({ id: uid(), name: `Platform ${i}` });
    }

    let warn = '', include = true, dupType = null, dupExistingName = '';
    if (!name && !ogfNode) { warn = t('csv.warn_no_name_or_ogf'); include = false; }
    else if (!name) warn = t('csv.warn_no_name');
    // Dedup: tag conflicts for the dedup review step (don't auto-exclude)
    if (ogfNode) {
      const existingNode = data.nodes.find(n => String(n.ogfNode) === ogfNode);
      if (existingNode) {
        dupType = 'ogf'; dupExistingName = existingNode.name || existingNode.id;
      } else if (nodes.some(n => n.ogfNode === ogfNode)) {
        dupType = 'batch'; dupExistingName = nodes.find(n => n.ogfNode === ogfNode)?.name || '';
      }
    }

    nodes.push({
      id: uid(), name, type, ogfNode, refCode, address, description, platforms,
      _include: include, _warn: warn,
      _dupType: dupType, _dupExistingName: dupExistingName, _disambig: ''
    });
  }
  s.preview = nodes;
  _csvRenderStep(5);
}

function _csvNodeDedupAction(idx, action) {
  const nd = _csvImportState.preview[idx];
  if (action === 'skip') { nd._include = false; nd._disambig = ''; }
  else { nd._include = true; }
  _csvRenderStep(5);
}

function _csvNodeSetDisambig(idx, val) {
  _csvImportState.preview[idx]._disambig = val.trim();
}

function _csvApplyNodeDedup() {
  for (const nd of _csvImportState.preview) {
    if (nd._dupType && nd._include !== false && nd._disambig) {
      // Apply per-node disambiguation: strip existing suffix and add new one
      nd.name = nd.name.replace(/\s*\[[^\]]*\]\s*$/, '') + ' [' + nd._disambig + ']';
    }
  }
}

let _csvImporting = false;
async function _csvConfirmNodeImport() {
  if (_csvImporting) return;
  _csvImporting = true;
  const s = _csvImportState;
  const toImport = s.preview.filter(n => n._include !== false);
  if (!toImport.length) { toast(t('csv.nothing_to_import'), 'error'); _csvImporting = false; return; }

  // Clean temp properties and push
  for (const n of toImport) { delete n._include; delete n._warn; }
  data.nodes.push(...toImport);

  // Fetch OGF data for nodes with OGF IDs
  const withOgf = toImport.filter(n => n.ogfNode);
  if (withOgf.length) {
    toast(t('csv.fetching_ogf', { n: withOgf.length }), 'info');
    await fetchOgfCoords(withOgf, { updateTags: true });
  }

  save();
  document.getElementById('sidebar').classList.remove('sidebar-locked');
  window._csvImportState = null;
  _csvImporting = false;
  refreshAll();
  toast(t('csv.import_success', { n: toImport.length }), 'success');
  renderImportExport();
}

// ---- Segment Import Steps 4-7 ----
function _csvRenderSegStep(n, totalSteps) {
  const el = document.getElementById('import-export-content');
  const s = _csvImportState;

  if (n === 4) {
    // Node matching step
    _csvBuildSegNodeMatches();
    const matches = s.nodeMatches;
    const rows = s.file.rows;
    const fieldCol = _csvFieldCol();

    let html = `<div style="margin-top:20px">
      <p class="text-dim" style="margin-bottom:12px">${t('csv.match_desc')}</p>
      <div style="overflow-x:auto;max-height:450px;overflow-y:auto">
      <table class="data-table csv-preview-table"><thead><tr>
        <th>${t('csv.row')}</th><th>${t('csv.from_input')}</th><th>${t('csv.from_match')}</th>
        <th>${t('csv.to_input')}</th><th>${t('csv.to_match')}</th></tr></thead><tbody>`;

    for (let i = 0; i < rows.length; i++) {
      const m = matches[i] || {};
      const fm = m.from || [];
      const tm = m.to || [];
      const fromWarn = m.fromWarn ? `<div class="text-dim" style="font-size:10px;color:var(--warn)">${m.fromWarn}</div>` : '';
      const toWarn = m.toWarn ? `<div class="text-dim" style="font-size:10px;color:var(--warn)">${m.toWarn}</div>` : '';

      html += `<tr>
        <td class="mono">${i + 1}</td>
        <td>${esc(m.fromInput || '')}${fromWarn}</td>
        <td>${_csvMatchSelect(i, 'from', fm)}</td>
        <td>${esc(m.toInput || '')}${toWarn}</td>
        <td>${_csvMatchSelect(i, 'to', tm)}</td>
      </tr>`;
    }
    html += `</tbody></table></div>
      <div class="flex gap-8" style="margin-top:16px">
        <button class="btn" onclick="_csvRenderStep(3)">${t('btn.back')}</button>
        <button class="btn btn-primary" onclick="_csvRenderStep(5)">${t('btn.next')}</button>
      </div></div>`;
    el.innerHTML = _csvStepHeader(4, totalSteps, t('csv.step_matching')) + html;
    return;
  }

  if (n === 5) {
    // Defaults step
    let html = `<div style="margin-top:20px;max-width:500px">`;
    const hasSpeed = Object.values(s.columnMap).includes('maxSpeed');
    const hasTracks = Object.values(s.columnMap).includes('trackCount');
    const hasElec = Object.values(s.columnMap).includes('electrification');
    if (!hasSpeed) {
      html += `<div class="form-group"><label>${t('csv.default_speed')}</label>
        <input type="number" min="1" max="500" value="${s.defaults.maxSpeed}" onchange="_csvImportState.defaults.maxSpeed=parseInt(this.value)||120"></div>`;
    }
    if (!hasTracks) {
      html += `<div class="form-group"><label>${t('csv.default_tracks')}</label>
        <input type="number" min="1" max="20" value="${s.defaults.trackCount}" onchange="_csvImportState.defaults.trackCount=parseInt(this.value)||2"></div>`;
    }
    if (!hasElec) {
      html += `<div class="form-group"><label>${t('csv.default_elec')}</label>
        <select onchange="_csvImportState.defaults.electrification=this.value==='true'">
          <option value="true" ${s.defaults.electrification ? 'selected' : ''}>${t('seg_detail.electrified')}</option>
          <option value="false" ${!s.defaults.electrification ? 'selected' : ''}>${t('seg_detail.not_electrified')}</option>
        </select></div>`;
    }
    // Allowed modes — always shown (no CSV column for this)
    if (data.categories.length) {
      html += `<div class="form-group"><label>${t('field.allowed_modes')}</label>
        <p class="text-dim" style="font-size:12px;margin-bottom:6px">${t('field.allowed_modes_help')}</p>`;
      for (const cat of data.categories) {
        const checked = s.defaults.allowedModes.includes(cat.id) ? 'checked' : '';
        html += `<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-bottom:4px">
          <input type="checkbox" ${checked} onchange="_csvToggleAllowedMode('${cat.id}',this.checked)"> ${esc(cat.name)}</label>`;
      }
      html += `</div>`;
    }
    html += `<div class="flex gap-8" style="margin-top:16px">
      <button class="btn" onclick="_csvRenderStep(4)">${t('btn.back')}</button>
      <button class="btn btn-primary" onclick="_csvBuildSegPreview()">${t('csv.btn_preview')}</button>
    </div></div>`;
    el.innerHTML = _csvStepHeader(5, totalSteps, t('csv.step_defaults')) + html;
    return;
  }

  if (n === 6) {
    // Dedup review step
    const segs = s.preview;
    const dupes = segs.map((seg, i) => ({ seg, i })).filter(({ seg }) => seg._dupType);
    if (!dupes.length) {
      el.innerHTML = _csvStepHeader(6, totalSteps, t('csv.step_dedup')) + `
        <div style="margin-top:20px">
          <p class="text-dim">${t('csv.no_dupes')}</p>
          <div class="flex gap-8" style="margin-top:16px">
            <button class="btn" onclick="_csvRenderStep(5)">${t('btn.back')}</button>
            <button class="btn btn-primary" onclick="_csvRenderStep(7)">${t('btn.next')}</button>
          </div>
        </div>`;
      return;
    }
    let html = `<div style="margin-top:20px">
      <p class="text-dim" style="margin-bottom:12px">${t('csv.dedup_seg_desc', { n: dupes.length })}</p>
      <div style="overflow-x:auto;max-height:450px;overflow-y:auto">
      <table class="data-table csv-preview-table"><thead><tr>
        <th>${t('csv.importing')}</th><th>${t('csv.conflict')}</th><th>${t('csv.action')}</th>
      </tr></thead><tbody>`;
    for (const { seg, i } of dupes) {
      const fromName = getNode(seg.nodeA) ? nodeDisplayName(seg.nodeA) : '?';
      const toName = getNode(seg.nodeB) ? nodeDisplayName(seg.nodeB) : '?';
      const typeLabel = seg._dupType === 'pair' ? t('csv.dup_same_endpoints')
        : seg._dupType === 'ways' ? t('csv.dup_same_ways')
        : t('csv.dup_same_batch');
      html += `<tr>
        <td>${esc(fromName)} \u2192 ${esc(toName)}</td>
        <td class="text-dim" style="font-size:11px">${typeLabel}</td>
        <td>
          <select onchange="_csvImportState.preview[${i}]._include=this.value==='keep'" class="csv-match-select">
            <option value="skip" ${seg._include === false ? 'selected' : ''}>${t('csv.action_skip')}</option>
            <option value="keep" ${seg._include !== false ? 'selected' : ''}>${t('csv.action_keep')}</option>
          </select>
        </td>
      </tr>`;
    }
    html += `</tbody></table></div>
      <div class="flex gap-8" style="margin-top:16px">
        <button class="btn" onclick="_csvRenderStep(5)">${t('btn.back')}</button>
        <button class="btn btn-primary" onclick="_csvRenderStep(7)">${t('btn.next')}</button>
      </div></div>`;
    el.innerHTML = _csvStepHeader(6, totalSteps, t('csv.step_dedup')) + html;
    return;
  }

  if (n === 7) {
    // Final review
    const segs = s.preview;
    let table = `<table class="data-table csv-preview-table"><thead><tr>
      <th></th><th>${t('field.from_node')}</th><th>${t('field.to_node')}</th>
      <th>${t('field.distance')}</th><th>${t('field.max_speed')}</th><th>${t('field.tracks')}</th><th></th>
    </tr></thead><tbody>`;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const warn = (seg._warn || seg._dupType) ? ` style="background:var(--warn-dim)"` : '';
      const fromName = getNode(seg.nodeA) ? nodeDisplayName(seg.nodeA) : '?';
      const toName = getNode(seg.nodeB) ? nodeDisplayName(seg.nodeB) : '?';
      table += `<tr${warn}>
        <td><input type="checkbox" ${seg._include !== false ? 'checked' : ''} onchange="_csvImportState.preview[${i}]._include=this.checked"></td>
        <td>${esc(fromName)}</td><td>${esc(toName)}</td>
        <td class="mono">${seg.distance}</td><td class="mono">${seg.maxSpeed}</td>
        <td class="mono">${seg.tracks.length}</td>
        <td class="text-dim" style="font-size:11px">${seg._warn || ''}</td>
      </tr>`;
    }
    table += `</tbody></table>`;
    const count = segs.filter(s => s._include !== false).length;
    el.innerHTML = _csvStepHeader(7, totalSteps, t('csv.step_review')) + `
      <div style="margin-top:20px">
        <div class="text-dim" style="margin-bottom:8px">${t('csv.review_count', { n: count })}</div>
        <div style="overflow-x:auto;max-height:400px;overflow-y:auto">${table}</div>
        <div class="flex gap-8" style="margin-top:16px">
          <button class="btn" onclick="_csvRenderStep(6)">${t('btn.back')}</button>
          <button class="btn btn-primary" onclick="_csvConfirmSegImport()">${t('csv.btn_import', { n: count })}</button>
        </div>
      </div>`;
    return;
  }
}

function _csvFieldCol() {
  const fieldCol = {};
  for (const [col, field] of Object.entries(_csvImportState.columnMap)) {
    if (field !== 'skip') fieldCol[field] = parseInt(col);
  }
  return fieldCol;
}

function _csvResolveEndpoint(row, fieldCol, direction) {
  // Single column: try OGF ID match first, fall back to fuzzy name match
  const key = direction === 'from' ? 'fromNode' : 'toNode';
  if (fieldCol[key] == null) return { input: '', matches: [], mode: 'none' };
  const raw = (row[fieldCol[key]] || '').trim();
  if (!raw) return { input: '', matches: [], mode: 'none' };
  // If it looks like an OGF ID (digits, or "node 12345"), try OGF match first
  const ogfMatches = matchNodeByOgfId(raw);
  if (ogfMatches.length) return { input: raw, matches: ogfMatches, mode: 'ogf' };
  // Fall back to fuzzy name match
  return { input: raw, matches: fuzzyMatchNode(raw).slice(0, 3), mode: 'name' };
}

function _csvBuildSegNodeMatches() {
  const s = _csvImportState;
  const fieldCol = _csvFieldCol();
  if (!s.nodeMatches || !Object.keys(s.nodeMatches).length) {
    s.nodeMatches = {};
    for (let i = 0; i < s.file.rows.length; i++) {
      const row = s.file.rows[i];
      const fromRes = _csvResolveEndpoint(row, fieldCol, 'from');
      const toRes = _csvResolveEndpoint(row, fieldCol, 'to');

      const fromWarn = fromRes.mode === 'ogf' && fromRes.matches.length > 1 ? t('csv.warn_dup_ogf_match') : '';
      const toWarn = toRes.mode === 'ogf' && toRes.matches.length > 1 ? t('csv.warn_dup_ogf_match') : '';

      s.nodeMatches[i] = {
        from: fromRes.matches, to: toRes.matches,
        fromInput: fromRes.input, toInput: toRes.input,
        fromMode: fromRes.mode, toMode: toRes.mode,
        fromWarn, toWarn,
        fromSelected: null, toSelected: null
      };
      // Auto-select exact/unique matches
      if (s.nodeMatches[i].from.length === 1 && s.nodeMatches[i].from[0].score === 100) {
        s.nodeMatches[i].fromSelected = s.nodeMatches[i].from[0].node.id;
      }
      if (s.nodeMatches[i].to.length === 1 && s.nodeMatches[i].to[0].score === 100) {
        s.nodeMatches[i].toSelected = s.nodeMatches[i].to[0].node.id;
      }
    }
  }
}

function _csvMatchSelect(rowIdx, direction, matches) {
  const s = _csvImportState;
  const entry = s.nodeMatches[rowIdx];
  const selected = direction === 'from' ? entry?.fromSelected : entry?.toSelected;
  if (!matches.length) return `<span class="csv-match-none">${t('csv.no_match')}</span>`;
  let html = `<select onchange="_csvImportState.nodeMatches[${rowIdx}].${direction}Selected=this.value||null" class="csv-match-select">`;
  html += `<option value="">${t('csv.select_node')}</option>`;
  for (const m of matches) {
    const label = `${nodeDisplayName(m.node.id)} (${m.method})`;
    html += `<option value="${m.node.id}" ${selected === m.node.id ? 'selected' : ''}>${esc(label)}</option>`;
  }
  html += `</select>`;
  return html;
}

function _csvSetMatch(rowIdx, direction, nodeId) {
  const s = _csvImportState;
  if (direction === 'from') s.nodeMatches[rowIdx].fromSelected = nodeId || null;
  else s.nodeMatches[rowIdx].toSelected = nodeId || null;
}

function _csvToggleAllowedMode(catId, checked) {
  const modes = _csvImportState.defaults.allowedModes;
  if (checked && !modes.includes(catId)) modes.push(catId);
  else if (!checked) {
    const idx = modes.indexOf(catId);
    if (idx >= 0) modes.splice(idx, 1);
  }
}

function _csvBuildSegPreview() {
  const s = _csvImportState;
  const fieldCol = _csvFieldCol();
  const segs = [];
  const seenPairs = new Set();

  for (let i = 0; i < s.file.rows.length; i++) {
    const row = s.file.rows[i];
    const match = s.nodeMatches[i];
    const fromId = match?.fromSelected;
    const toId = match?.toSelected;

    const distRaw = fieldCol.distance != null ? parseFloat(row[fieldCol.distance]) : 0;
    const distance = isNaN(distRaw) || distRaw <= 0 ? 0 : Math.round(distRaw * 100) / 100;
    const speedRaw = fieldCol.maxSpeed != null ? parseInt(row[fieldCol.maxSpeed]) : 0;
    const maxSpeed = speedRaw > 0 ? speedRaw : s.defaults.maxSpeed;
    const trackRaw = fieldCol.trackCount != null ? parseInt(row[fieldCol.trackCount]) : 0;
    const trackCount = trackRaw > 0 ? trackRaw : s.defaults.trackCount;
    const elecRaw = fieldCol.electrification != null ? (row[fieldCol.electrification] || '').trim().toLowerCase() : '';
    const electrification = elecRaw ? (elecRaw === 'true' || elecRaw === 'yes' || elecRaw === '1') : s.defaults.electrification;
    const refCode = fieldCol.refCode != null ? (row[fieldCol.refCode] || '').trim() : '';
    const description = fieldCol.description != null ? (row[fieldCol.description] || '').trim() : '';
    const ogfWayRaw = fieldCol.ogfWayIds != null ? (row[fieldCol.ogfWayIds] || '').trim() : '';
    const ogfWayIds = ogfWayRaw ? ogfWayRaw.replace(/\bway\s+/gi, '').split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => n > 0) : [];

    const tracks = [];
    for (let tk = 1; tk <= trackCount; tk++) tracks.push({ id: uid(), name: `Track ${tk}` });

    let warn = '', include = true, dupType = null;
    if (!fromId && !toId) { warn = t('csv.warn_no_nodes'); include = false; }
    else if (!fromId) { warn = t('csv.warn_no_from'); include = false; }
    else if (!toId) { warn = t('csv.warn_no_to'); include = false; }
    else if (fromId === toId) { warn = t('csv.warn_same_node'); include = false; }

    // Duplicate tagging for the dedup review step
    if (fromId && toId && fromId !== toId) {
      const pairKey = [fromId, toId].sort().join('|');
      const existingPairDup = data.segments.some(seg =>
        !isInterchange(seg) && (
          (seg.nodeA === fromId && seg.nodeB === toId) ||
          (seg.nodeA === toId && seg.nodeB === fromId)
        )
      );
      const wayKey = ogfWayIds.length ? [...ogfWayIds].sort().join(',') : '';
      const existingWayDup = wayKey && data.segments.some(seg =>
        seg.ogfWayIds?.length && [...seg.ogfWayIds].sort().join(',') === wayKey
      );
      if (existingPairDup) dupType = 'pair';
      else if (existingWayDup) dupType = 'ways';
      else if (seenPairs.has(pairKey)) dupType = 'batch';
      if (dupType) include = false; // default to skip, user can override in dedup step
      seenPairs.add(pairKey);
    }

    segs.push({
      id: uid(), nodeA: fromId || '', nodeB: toId || '',
      tracks, maxSpeed, distance, electrification,
      refCode, description, interchangeType: null,
      ogfWayIds, wayGeometry: null,
      allowedModes: [...s.defaults.allowedModes],
      _include: include, _warn: warn, _dupType: dupType
    });
  }
  s.preview = segs;
  _csvRenderStep(6);
}

async function _csvConfirmSegImport() {
  if (_csvImporting) return;
  _csvImporting = true;
  const s = _csvImportState;
  const toImport = s.preview.filter(seg => seg._include !== false);
  if (!toImport.length) { toast(t('csv.nothing_to_import'), 'error'); _csvImporting = false; return; }

  for (const seg of toImport) { delete seg._include; delete seg._warn; }
  data.segments.push(...toImport);

  // Fetch way geometry for segments with OGF Way IDs — single batch API call
  const withWays = toImport.filter(seg => seg.ogfWayIds?.length);
  if (withWays.length) {
    toast(t('csv.fetching_ways', { n: withWays.length }), 'info');
    try {
      const allWayIds = withWays.flatMap(seg => seg.ogfWayIds);
      const wayCache = await fetchWayGeometryBatch(allWayIds);

      for (const seg of withWays) {
        const result = stitchWayGeometry(seg.ogfWayIds, wayCache);
        if (!result?.coords?.length) continue;
        let coords = result.coords;
        const nA = getNode(seg.nodeA), nB = getNode(seg.nodeB);

        // Auto-trim to endpoints if both nodes have coordinates
        if (nA?.lat != null && nB?.lat != null) {
          const snapA = _snapToPolyline([nA.lat, nA.lon], coords);
          const snapB = _snapToPolyline([nB.lat, nB.lon], coords);
          if (snapA.dist > 0.05) toast(t('toast.snap_warn', { name: nA.name, m: Math.round(snapA.dist * 1000) }), 'error');
          if (snapB.dist > 0.05) toast(t('toast.snap_warn', { name: nB.name, m: Math.round(snapB.dist * 1000) }), 'error');
          coords = _slicePolyline(coords, snapA, snapB);

          // _slicePolyline orders by polyline direction, not by A/B.
          // Orient so coords[0] is near nodeA and coords[last] is near nodeB.
          const d0A = _ptDist(coords[0], [nA.lat, nA.lon]);
          const d0B = _ptDist(coords[0], [nB.lat, nB.lon]);
          if (d0B < d0A) coords.reverse();

          // Compute track distance from trimmed geometry before anchoring
          if (!seg.distance || seg.distance <= 0) seg.distance = haversineDistance(coords);

          // Anchor geometry endpoints to actual node positions
          coords[0] = [nA.lat, nA.lon];
          coords[coords.length - 1] = [nB.lat, nB.lon];
        } else {
          // No trim possible — set node positions from way endpoints
          // and compute distance from full geometry
          if (!seg.distance || seg.distance <= 0) seg.distance = haversineDistance(coords);
          if (nA && nA.lat == null) { nA.lat = coords[0][0]; nA.lon = coords[0][1]; }
          if (nB && nB.lat == null) { nB.lat = coords[coords.length - 1][0]; nB.lon = coords[coords.length - 1][1]; }
        }

        seg.wayGeometry = coords;
        if (result.maxSpeed && seg.maxSpeed === s.defaults.maxSpeed) seg.maxSpeed = result.maxSpeed;
      }
    } catch (err) {
      console.error('Batch way fetch failed:', err);
      toast(t('toast.way_fetch_error', { msg: err.message }), 'error');
    }
  }

  save();
  document.getElementById('sidebar').classList.remove('sidebar-locked');
  window._csvImportState = null;
  _csvImporting = false;
  refreshAll();
  toast(t('csv.import_success', { n: toImport.length }), 'success');
  renderImportExport();
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard() {
  const totalKm = data.segments.reduce((s, seg) => s + (seg.distance || 0), 0);
  document.getElementById('dashboard-stats').innerHTML = [
    [t('btn.stat_nodes'), data.nodes.length], [t('btn.stat_stations'), data.nodes.filter(n => n.type === 'station').length],
    [t('btn.stat_bus_stops'), data.nodes.filter(n => n.type === 'bus_stop').length],
    [t('btn.stat_segments'), data.segments.length], [t('btn.stat_track_km'), totalKm.toFixed(1)],
    [t('btn.stat_stock'), data.rollingStock.length], [t('btn.stat_services'), data.services.length],
    [t('btn.stat_departures'), data.departures.length],
  ].map(([l, v]) => `<div class="stat-card"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`).join('');

  let content = '';
  if (!data.nodes.length) {
    content = `<div class="empty-state" style="padding:40px"><h3>${t('dashboard.welcome')}</h3>
      <p>${t('dashboard.welcome_desc')}</p>
      <button class="btn btn-primary" onclick="switchTab('nodes')">${t('dashboard.get_started')}</button></div>`;
  } else {
    content = `<h3 style="font-family:var(--font-display);font-size:16px;margin-bottom:12px;">${t('nav.lines')}</h3>`;
    if (data.serviceGroups.length) content += `<div class="flex gap-8" style="flex-wrap:wrap">` + data.serviceGroups.map(g => {
      const svcCount = data.services.filter(s => s.groupId === g.id).length;
      const segCount = lineSegments(g.id).size;
      const bg = g.color || 'var(--bg-input)';
      const fg = g.color ? contrastText(g.color) : 'var(--text-dim)';
      return `<span class="clickable" style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:var(--radius-sm);background:${bg};color:${fg};font-weight:700;font-size:13px;font-family:var(--font-mono);cursor:pointer;margin:0 0 6px 0" onclick="switchTab('lines');showLineDetail('${g.id}')">${esc(g.name)}<span style="font-weight:400;font-size:11px;opacity:0.8">${svcCount} svc · ${segCount} seg</span></span>`;
    }).join('') + `</div>`;
    else content += `<div class="text-dim" style="font-size:13px;">${t('dashboard.no_lines')}</div>`;
  }
  document.getElementById('dashboard-content').innerHTML = content;
}
