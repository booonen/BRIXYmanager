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
function runIssueDetection() {
  const issues = []; // { severity: 'high'|'medium'|'low', type, desc, detail }

  // ---- HIGH: Scheduling conflicts ----
  const segOcc = {}, platOcc = {};
  for (const dep of data.departures) {
    const svc = getSvc(dep.serviceId); if (!svc || dep.times.length < 2) continue;
    for (let i = 0; i < dep.times.length - 1; i++) {
      const from = dep.times[i], to = dep.times[i + 1];
      if (from.depart == null || to.arrive == null) continue;
      const seg = findSeg(from.nodeId, to.nodeId);
      if (seg && seg.tracks === 1) {
        if (!segOcc[seg.id]) segOcc[seg.id] = [];
        segOcc[seg.id].push({ depId: dep.id, svcId: dep.serviceId, enter: from.depart, exit: to.arrive });
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
  for (const [segId, occs] of Object.entries(segOcc)) {
    const seg = getSeg(segId);
    for (let i = 0; i < occs.length; i++) for (let j = i + 1; j < occs.length; j++) {
      const a = occs[i], b = occs[j];
      // Pattern overlap check: skip if services never run on the same day
      if (!patternsOverlap(getSvc(a.svcId)?.schedulePattern, getSvc(b.svcId)?.schedulePattern)) continue;
      if (a.enter < b.exit && b.enter < a.exit)
        issues.push({ severity: 'high', type: t('issue.type.single_track_conflict'), typeKey: 'single_track_conflict',
          desc: t('issue.desc.single_track_conflict', { a: getSvc(a.svcId)?.name||'?', b: getSvc(b.svcId)?.name||'?', from: nodeName(seg.nodeA), to: nodeName(seg.nodeB) }),
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
      const seg = findSeg(svc.stops[i].nodeId, svc.stops[i+1].nodeId);
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
    if (!isRoad(s) && (!s.tracks || s.tracks <= 0)) problems.push('track count');
    if (problems.length) {
      issues.push({ severity: 'low', type: t('issue.type.incomplete_segment'), typeKey: 'incomplete_segment',
        desc: t('issue.desc.incomplete_segment', { from: nodeName(s.nodeA), to: nodeName(s.nodeB), problems: problems.join(', ') }),
        detail: t('issue.detail.incomplete_segment'),
        action: `openSegmentModal('${s.id}')` });
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
    if (!n.ogfNode) {
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

      // Check if any of those tracks connect to the arriving/departing segments
      const valid = platTracks.some(t => {
        const tSegs = ['A','B','C','D'].flatMap(s => (t['side'+s]||[]).map(x => typeof x === 'string' ? x : x.segId));
        const arrOk = !arrSeg || tSegs.includes(arrSeg.id);
        const depOk = !depSeg || tSegs.includes(depSeg.id);
        return arrOk && depOk;
      });

      if (!valid) {
        const platName = (node.platforms || []).find(p => p.id === stop.platformId)?.name || '?';
        issues.push({ severity: 'low', type: t('issue.type.schematic_mismatch'), typeKey: 'schematic_mismatch',
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

      const valid = platTracks.some(t => {
        const tSegs = ['A','B','C','D'].flatMap(s => (t['side'+s]||[]).map(x => typeof x === 'string' ? x : x.segId));
        const arrOk = !arrSeg || tSegs.includes(arrSeg.id);
        const depOk = !depSeg || tSegs.includes(depSeg.id);
        return arrOk && depOk;
      });

      if (!valid) {
        const platName = (node.platforms || []).find(p => p.id === platId)?.name || '?';
        issues.push({ severity: 'low', type: t('issue.type.departure_schematic_mismatch'), typeKey: 'departure_schematic_mismatch',
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
      const nTracks = seg.tracks || 1;
      // Collect all segment track connections across all station tracks
      const connectedSegTracks = new Set();
      for (const trk of node.schematic.tracks) {
        for (const key of ['sideA','sideB','sideC','sideD']) {
          for (const c of (trk[key] || [])) {
            const cObj = typeof c === 'string' ? { segId: c, trackNum: 1 } : c;
            if (cObj.segId === conn.segId) connectedSegTracks.add(cObj.trackNum);
          }
        }
      }
      for (let tn = 1; tn <= nTracks; tn++) {
        if (!connectedSegTracks.has(tn)) {
          const segLabel = nodeName(seg.nodeA === node.id ? seg.nodeB : seg.nodeA);
          issues.push({ severity: 'low', type: t('issue.type.unconnected_segment_track'), typeKey: 'unconnected_segment_track',
            desc: t('issue.desc.unconnected_segment_track', { n: tn, label: segLabel, station: node.name }),
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
      issues.push({ severity: 'medium', type: t('issue.type.duplicate_segment'), typeKey: 'duplicate_segment',
        desc: t('issue.desc.duplicate_segment', { n: segs.length, type: segs[0].interchangeType ? segs[0].interchangeType.toUpperCase() : t('seg.type_track_display'), from: nodeName(segs[0].nodeA), to: nodeName(segs[0].nodeB) }),
        detail: t('issue.detail.duplicate_segment'),
        action: `setSearchValue('segment-search','');switchTab('segments');showSegmentDetail('${segs[0].id}')` });
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

    if (lines.length === 0) {
      // No line assigned — draw in dim grey
      const polyline = L.polyline([[nA.lat, nA.lon], [nB.lat, nB.lon]], {
        color: '#555', weight: 2, opacity: 0.4
      });
      segmentLines.push(polyline);
    } else if (lines.length === 1) {
      // Single line — draw with that line's color
      const polyline = L.polyline([[nA.lat, nA.lon], [nB.lat, nB.lon]], {
        color: lines[0].color || '#888', weight: lineWeight, opacity: 0.95
      });
      segmentLines.push(polyline);
    } else {
      // Multiple lines — Beck-style parallel offset using perpendicular displacement
      const pA = _map.latLngToLayerPoint([nA.lat, nA.lon]);
      const pB = _map.latLngToLayerPoint([nB.lat, nB.lon]);
      const dx = pB.x - pA.x, dy = pB.y - pA.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = -dy / len, py = dx / len;
      const offsetStep = lineWeight + 1; // gap between parallel lines
      const totalWidth = (lines.length - 1) * offsetStep;

      lines.forEach((grp, idx) => {
        const off = -totalWidth / 2 + idx * offsetStep;
        const oA = _map.layerPointToLatLng(L.point(pA.x + px * off, pA.y + py * off));
        const oB = _map.layerPointToLatLng(L.point(pB.x + px * off, pB.y + py * off));
        const polyline = L.polyline([[oA.lat, oA.lng], [oB.lat, oB.lng]], {
          color: grp.color || '#888', weight: lineWeight, opacity: 0.95
        });
        segmentLines.push(polyline);
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
    const nA = getNode(seg.nodeA), nB = getNode(seg.nodeB);
    if (!nA || !nB || nA.lat == null || nB.lat == null) continue;
    L.polyline([[nA.lat, nA.lon], [nB.lat, nB.lon]], { color: '#555', weight: 3, opacity: 1 }).addTo(map);
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
          if (ls) for (const nid of Object.keys(ls)) focusLabelNodes.add(nid);
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
          const paxStops = entry.stops.filter(nid => { const n = getNode(nid); return n && isPassengerStop(n); });
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
