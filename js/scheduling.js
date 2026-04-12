// ============================================================
// SCHEDULE GENERATION
// ============================================================
function openScheduleModal(svcId) {
  const svc = getSvc(svcId);
  if (!svc || svc.stops.length < 2) { toast(t('toast.svc_needs_stops'), 'error'); return; }
  editingId = null;

  const routeProfile = buildRouteProfile(svc);
  window._helperRouteProfile = routeProfile;
  window._helperSvcId = svcId;
  window._helperOccExclude = getExistingOccupations(svcId, svcId);
  window._helperOccInclude = getExistingOccupations(null, svcId);

  const singleTrackCount = routeProfile.profile.filter(p => p.tracks === 1).length;
  const platformCount = routeProfile.platformProfile.length;
  const existingDeps = data.departures.filter(d => d.serviceId === svcId).length;

  openModal(t('modal.schedule', { name: svc.name }), `
    <div style="font-size:13px;color:var(--text-dim);margin-bottom:12px">
      Route: <strong>${esc(nodeName(svc.stops[0].nodeId))} → ${esc(nodeName(svc.stops[svc.stops.length-1].nodeId))}</strong>
      · ~${Math.round(routeProfile.totalTime)} min
      · ${singleTrackCount} single-track · ${platformCount} platforms
      ${existingDeps ? `· <strong>${existingDeps}</strong> existing dep.` : ''}
    </div>
    <div class="form-group" style="margin-bottom:8px">
      <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:13px;color:var(--text);">
        <input type="checkbox" id="sh-clear" checked onchange="refreshScheduleModal()">Clear existing departures for this service first</label></div>
    <div id="helper-timeline"></div>
    <div class="htabs">
      <div class="htab active" id="htab-freq" onclick="switchScheduleTab('freq')">${t('sch.frequency')}</div>
      <div class="htab" id="htab-explicit" onclick="switchScheduleTab('explicit')">${t('sch.explicit')}</div>
    </div>
    <div id="sched-tab-freq">
      <div class="form-row mt-8" style="max-width:400px">
        <div class="form-group" style="margin-bottom:8px"><label>${t('field.window_start')}</label><input type="time" id="sh-start" value="06:00" onchange="refreshScheduleModal()"></div>
        <div class="form-group" style="margin-bottom:8px"><label>${t('field.window_end')}</label><input type="time" id="sh-end" value="23:00" onchange="refreshScheduleModal()"></div>
      </div>
      <div id="helper-suggestions"></div>
      <div id="helper-free-list" class="mt-16"></div>
    </div>
    <div id="sched-tab-explicit" style="display:none">
      <div class="form-group"><label>Departure times (comma-separated, e.g. 06:00, 07:30, 09:15)</label>
        <textarea id="f-gTimes" rows="3" placeholder="06:00, 06:30, 07:00, 07:30..." oninput="checkExplicitConflicts()"></textarea></div>
      <div id="explicit-conflicts"></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">${t('btn.cancel')}</button>
     <button class="btn btn-primary" id="sched-apply-btn" onclick="applyScheduleModal('${svcId}')">${t('btn.apply')}</button>`);

  refreshScheduleModal();
}

function switchScheduleTab(tab) {
  document.getElementById('sched-tab-freq').style.display = tab === 'freq' ? '' : 'none';
  document.getElementById('sched-tab-explicit').style.display = tab === 'explicit' ? '' : 'none';
  document.getElementById('htab-freq').classList.toggle('active', tab === 'freq');
  document.getElementById('htab-explicit').classList.toggle('active', tab === 'explicit');
  window._schedTabMode = tab;
  // Update the apply button text
  document.getElementById('sched-apply-btn').style.display = tab === 'freq' ? 'none' : '';
}

function refreshScheduleModal() {
  const svcId = window._helperSvcId;
  const routeProfile = window._helperRouteProfile;
  if (!svcId || !routeProfile) return;

  const svc = getSvc(svcId);
  const myCategoryId = svc?.categoryId || null;

  const clearExisting = document.getElementById('sh-clear')?.checked ?? true;
  const existingOcc = clearExisting ? window._helperOccExclude : window._helperOccInclude;

  const slots = [];
  for (let t = 0; t < 1440; t++) {
    const conflicts = findConflictsForStartTime(t, routeProfile, existingOcc, myCategoryId);
    slots.push({ time: t, conflicts, free: conflicts.length === 0 });
  }
  window._helperSlots = slots;

  const freeCount = slots.filter(s => s.free).length;

  // Timeline bar
  let timelineHtml = '<strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">Availability Timeline (24h)</strong>';
  timelineHtml += '<div style="display:flex;height:24px;border-radius:4px;overflow:hidden;border:1px solid var(--border);margin:12px 0">';
  for (let block = 0; block < 96; block++) {
    const startM = block * 15;
    const blockSlots = slots.slice(startM, startM + 15);
    const freeInBlock = blockSlots.filter(s => s.free).length;
    const ratio = freeInBlock / 15;
    let color;
    if (ratio >= 0.8) color = 'var(--success)';
    else if (ratio >= 0.4) color = 'var(--warn)';
    else if (ratio > 0) color = '#c06030';
    else color = 'var(--danger)';
    const hour = Math.floor(startM / 60);
    const min = startM % 60;
    timelineHtml += `<div style="flex:1;background:${color};opacity:${ratio > 0 ? 0.4 + ratio * 0.6 : 0.3}" title="${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')} — ${freeInBlock}/15 min free"></div>`;
  }
  timelineHtml += '</div>';
  timelineHtml += '<div style="display:flex;font-size:9px;color:var(--text-muted);font-family:var(--font-mono)">';
  for (let h = 0; h < 24; h++) timelineHtml += `<div style="flex:1;text-align:center">${h}</div>`;
  timelineHtml += '</div>';
  timelineHtml += `<div style="font-size:11px;color:var(--text-muted);display:flex;gap:12px;margin-top:4px">
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--success);vertical-align:middle;margin-right:3px"></span>${t('sch.free')}</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--warn);vertical-align:middle;margin-right:3px"></span>${t('sch.partial')}</span>
    <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--danger);vertical-align:middle;margin-right:3px"></span>${t('sch.blocked')}</span>
  </div>`;

  const tlEl = document.getElementById('helper-timeline');
  if (tlEl) tlEl.innerHTML = timelineHtml;

  // Free slots
  let freeListHtml = `<strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">Free Slots (${freeCount} of 1440 minutes)</strong>`;
  freeListHtml += `<div class="mt-8" style="max-height:150px;overflow-y:auto;font-family:var(--font-mono);font-size:12px">`;
  let rangeStart = null;
  for (let t = 0; t <= 1440; t++) {
    const isFree = t < 1440 && slots[t].free;
    if (isFree && rangeStart === null) rangeStart = t;
    if (!isFree && rangeStart !== null) {
      const len = t - rangeStart;
      freeListHtml += `<span class="chip" style="margin:0 4px 4px 0;background:var(--success-dim);border-color:var(--success);color:var(--success)">${toTime(rangeStart)}–${toTime(t)} <span class="text-muted" style="margin-left:2px">${len}m</span></span>`;
      rangeStart = null;
    }
  }
  freeListHtml += '</div>';
  const flEl = document.getElementById('helper-free-list');
  if (flEl) flEl.innerHTML = freeListHtml;

  // Suggestions
  updateHelperSuggestions(svcId);

  // Also refresh explicit conflicts if that tab has content
  checkExplicitConflicts();
}

function updateHelperSuggestions(svcId) {
  const slots = window._helperSlots;
  if (!slots) return;

  const wStart = toMin(document.getElementById('sh-start')?.value || '06:00');
  const wEnd = toMin(document.getElementById('sh-end')?.value || '23:00');

  const el = document.getElementById('helper-suggestions');
  if (!el) return;

  const clearExisting = document.getElementById('sh-clear')?.checked ?? true;
  const freqs = [10, 15, 20, 30, 60];
  let html = '<strong style="font-size:12px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em">Suggested Schedules</strong>';
  html += '<table class="schedule-table mt-8"><thead><tr><th>Freq.</th><th>Deps.</th><th>Best Start</th><th>Conflicts</th><th></th></tr></thead><tbody>';

  // Handle cross-midnight: if end < start, treat end as next day
  const effectiveEnd = wEnd <= wStart ? wEnd + 1440 : wEnd;

  for (const freq of freqs) {
    let bestOffset = 0, bestConflicts = Infinity, bestCount = 0;
    for (let offset = 0; offset < freq; offset++) {
      let conflicts = 0, count = 0;
      for (let t = wStart + offset; t <= effectiveEnd; t += freq) {
        const tMod = t % 1440;
        if (tMod >= 0 && tMod < 1440) { count++; if (!slots[tMod].free) conflicts++; }
      }
      if (conflicts < bestConflicts || (conflicts === bestConflicts && count > bestCount)) {
        bestConflicts = conflicts; bestOffset = offset; bestCount = count;
      }
    }

    const firstDep = wStart + bestOffset;
    const statusColor = bestConflicts === 0 ? 'var(--success)' : (bestConflicts <= 2 ? 'var(--warn)' : 'var(--danger)');
    const statusText = bestConflicts === 0 ? '✓ Clear' : `${bestConflicts} conflict${bestConflicts!==1?'s':''}`;

    html += `<tr>
      <td class="mono" style="font-weight:500">Every ${freq}m</td>
      <td class="mono">${bestCount}</td>
      <td class="mono" style="color:var(--warn)">${toTime(firstDep)}</td>
      <td style="color:${statusColor};font-weight:500">${statusText}</td>
      <td class="actions-cell"><button class="btn btn-sm btn-primary" onclick="applyFrequencySchedule('${svcId}',${firstDep},${effectiveEnd},${freq})">${t('btn.apply')}</button></td>
    </tr>`;
  }

  html += '</tbody></table>';
  el.innerHTML = html;
}

function checkExplicitConflicts() {
  const slots = window._helperSlots;
  const el = document.getElementById('explicit-conflicts');
  if (!slots || !el) return;

  const raw = document.getElementById('f-gTimes')?.value || '';
  const parts = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) { el.innerHTML = ''; return; }

  let html = '<div class="mt-8">';
  let validCount = 0, conflictCount = 0;
  for (const p of parts) {
    if (!/^\d{1,2}:\d{2}$/.test(p)) {
      html += `<span class="chip" style="margin:0 4px 4px 0;border-color:var(--danger);color:var(--danger)">${esc(p)} ✕ invalid</span>`;
      continue;
    }
    const t = toMin(p);
    const tMod = ((t % 1440) + 1440) % 1440;
    if (tMod >= 0 && tMod < 1440 && slots[tMod].free) {
      html += `<span class="chip" style="margin:0 4px 4px 0;background:var(--success-dim);border-color:var(--success);color:var(--success)">${esc(p)} ✓</span>`;
      validCount++;
    } else {
      html += `<span class="chip" style="margin:0 4px 4px 0;background:var(--danger-dim);border-color:var(--danger);color:var(--danger)">${esc(p)} ⚠ conflict</span>`;
      conflictCount++;
      validCount++;
    }
  }
  html += '</div>';
  if (validCount) {
    html += `<div class="text-dim mt-8" style="font-size:12px">${validCount} time${validCount!==1?'s':''} entered${conflictCount ? `, ${conflictCount} with conflicts` : ', all clear'}</div>`;
  }
  el.innerHTML = html;
}

function applyFrequencySchedule(svcId, firstDep, endTime, freq) {
  const svc = getSvc(svcId); if (!svc) return;
  const clearExisting = document.getElementById('sh-clear')?.checked;
  const action = clearExisting ? t('btn.replace_schedule') : t('btn.add_departures');
  appConfirm(t('confirm.apply_schedule', { action, name: svc.name, freq, start: toTime(firstDep), end: toTime(endTime) }), () => {
    if (clearExisting) data.departures = data.departures.filter(d => d.serviceId !== svcId);
    let count = 0;
    for (let tm = firstDep; tm <= endTime; tm += freq) {
      const tMod = tm % 1440;
      const dep = makeDep(svc, tMod); if (dep) { data.departures.push(dep); count++; }
    }
    save(); closeModal(); renderServices();
    toast(clearExisting ? t('toast.deps_replaced', { n: count }) : t('toast.deps_added', { n: count }), 'success');
  });
}

function applyScheduleModal(svcId) {
  // This is called from the Explicit Times tab's Apply button
  const svc = getSvc(svcId); if (!svc) return;
  const raw = document.getElementById('f-gTimes')?.value || '';
  const parts = raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const times = [];
  for (const p of parts) {
    if (/^\d{1,2}:\d{2}$/.test(p)) times.push(toMin(p));
    else { toast(`Invalid time: "${p}"`, 'error'); return; }
  }
  if (!times.length) { toast(t('toast.enter_times'), 'error'); return; }

  const clearExisting = document.getElementById('sh-clear')?.checked;
  if (clearExisting) data.departures = data.departures.filter(d => d.serviceId !== svcId);

  times.sort((a, b) => a - b);
  let count = 0;
  for (const t of times) {
    const dep = makeDep(svc, t); if (dep) { data.departures.push(dep); count++; }
  }
  save(); closeModal(); renderServices();
  toast(`${clearExisting ? 'Replaced with' : 'Added'} ${count} departure${count!==1?'s':''}`, 'success');
}

// Dwell time for a stop in minutes. Pass-through stops use explicit dwell if set, else 0.
// Non-pass-through stops use explicit dwell if set, else default cascade.
function stopDwellMin(stop, defDwell) {
  if (stop.passThrough) return stop.dwell ? stop.dwell / 60 : 0;
  return (stop.dwell ?? defDwell) / 60;
}

function makeDep(svc, startMin) {
  const cat = getCat(svc.categoryId);
  const stock = getStock(svc.stockId);
  const defDwell = stock ? stock.defaultDwell : (cat ? cat.defaultDwellTime : DEFAULT_DWELL());
  const times = []; let t = startMin;
  for (let i = 0; i < svc.stops.length; i++) {
    const stop = svc.stops[i];
    if (i === 0) { times.push({ nodeId: stop.nodeId, arrive: null, depart: t }); }
    else if (i === svc.stops.length - 1) { times.push({ nodeId: stop.nodeId, arrive: t, depart: null }); }
    else {
      const dwell = stopDwellMin(stop, defDwell);
      times.push({ nodeId: stop.nodeId, arrive: t, depart: t + dwell }); t += dwell;
    }
    if (i < svc.stops.length - 1) t += travelTimeInContext(svc.stops, i, stock);
  }
  return {
    id: uid(), serviceId: svc.id, startTime: startMin, times,
    manualOverrides: {},
    platformOverrides: {},
    stockId: null
  };
}

// ============================================================
// SCHEDULE RECALCULATION
// ============================================================
function recalculateDeparture(depId) {
  const dep = data.departures.find(d => d.id === depId);
  if (!dep) return false;
  const svc = getSvc(dep.serviceId);
  if (!svc) return false;

  const manual = dep.manualOverrides || {};
  const manualDwells = manual.dwell || {};

  const stock = resolveStock(svc, dep);
  const cat = getCat(svc.categoryId);
  const defDwell = stock ? stock.defaultDwell : (cat ? cat.defaultDwellTime : DEFAULT_DWELL());

  let t = dep.startTime;
  const newTimes = [];

  for (let i = 0; i < svc.stops.length; i++) {
    const stop = svc.stops[i];
    if (i === 0) {
      newTimes.push({ nodeId: stop.nodeId, arrive: null, depart: t });
    } else if (i === svc.stops.length - 1) {
      newTimes.push({ nodeId: stop.nodeId, arrive: t, depart: null });
    } else {
      let dwellSec;
      if (i in manualDwells) {
        dwellSec = manualDwells[i];
      } else {
        dwellSec = stop.passThrough ? (stop.dwell || 0) : (stop.dwell ?? defDwell);
      }
      const dwellMin = dwellSec / 60;
      newTimes.push({ nodeId: stop.nodeId, arrive: t, depart: t + dwellMin });
      t += dwellMin;
    }
    if (i < svc.stops.length - 1) {
      t += travelTimeInContext(svc.stops, i, stock);
    }
  }

  dep.times = newTimes;
  return true;
}

function recalculateService(svcId) {
  const deps = data.departures.filter(d => d.serviceId === svcId);
  let count = 0;
  for (const dep of deps) {
    if (recalculateDeparture(dep.id)) count++;
  }
  save();
  return count;
}

function recalculateAll() {
  let count = 0;
  for (const dep of data.departures) {
    if (recalculateDeparture(dep.id)) count++;
  }
  save();
  return count;
}

function recalcSvcAndRefresh(svcId) {
  const count = recalculateService(svcId);
  showServiceDetail(svcId);
  toast(`Recalculated ${count} departure${count!==1?'s':''} — manual overrides preserved`, 'success');
}

function recalcAllAndRefresh() {
  appConfirm(t('confirm.recalc_all'), () => {
    const count = recalculateAll();
    renderSchedule();
    toast(t('toast.recalc_done', { n: count }), 'success');
  });
}

// ============================================================
// SCHEDULING HELPER
// ============================================================
// Analyzes existing traffic on a service's route and finds conflict-free start times.

function buildRouteProfile(svc) {
  // Build the time offset profile: for each segment in the route,
  // when does the train enter/exit relative to start time = 0
  const stock = getStock(svc.stockId);
  const cat = getCat(svc.categoryId);
  const defDwell = stock ? stock.defaultDwell : (cat ? cat.defaultDwellTime : DEFAULT_DWELL());
  const profile = []; // [{segId, enterOffset, exitOffset, tracks}]
  const platformProfile = []; // [{nodeId, platformId, arriveOffset, departOffset}]
  let t = 0;

  for (let i = 0; i < svc.stops.length; i++) {
    const stop = svc.stops[i];
    if (i === 0) {
      // Platform at origin
      if (stop.platformId) {
        platformProfile.push({ nodeId: stop.nodeId, platformId: stop.platformId, arriveOffset: t, departOffset: t });
      }
    } else if (i === svc.stops.length - 1) {
      // Platform at terminus
      if (stop.platformId) {
        platformProfile.push({ nodeId: stop.nodeId, platformId: stop.platformId, arriveOffset: t, departOffset: t });
      }
    } else {
      const dwellMin = stopDwellMin(stop, defDwell);
      if (stop.platformId && !stop.passThrough) {
        platformProfile.push({ nodeId: stop.nodeId, platformId: stop.platformId, arriveOffset: t, departOffset: t + dwellMin });
      }
      t += dwellMin;
    }

    if (i < svc.stops.length - 1) {
      const seg = findSeg(stop.nodeId, svc.stops[i+1].nodeId);
      if (seg) {
        const travel = travelTimeInContext(svc.stops, i, stock);
        profile.push({
          segId: seg.id, enterOffset: t, exitOffset: t + travel,
          tracks: seg.tracks, nodeA: seg.nodeA, nodeB: seg.nodeB
        });
        t += travel;
      }
    }
  }

  return { profile, platformProfile, totalTime: t };
}

function getExistingOccupations(svcIdToExclude, forSvcId) {
  // Build occupation maps for all single-track segments and all platforms
  // If forSvcId is provided, only include departures from services whose patterns overlap
  const segOcc = {}; // segId -> [{enter, exit}]
  const platOcc = {}; // "nodeId::platId" -> [{arrive, depart}]
  const forPat = forSvcId ? getSvc(forSvcId)?.schedulePattern : undefined;

  for (const dep of data.departures) {
    if (dep.serviceId === svcIdToExclude) continue;
    const svc = getSvc(dep.serviceId);
    if (!svc || dep.times.length < 2) continue;
    // Pattern overlap filter: skip departures from services that never run on the same day
    if (forPat !== undefined && !patternsOverlap(forPat, svc.schedulePattern)) continue;

    for (let i = 0; i < dep.times.length - 1; i++) {
      const from = dep.times[i], to = dep.times[i+1];
      if (from.depart == null || to.arrive == null) continue;
      const seg = findSeg(from.nodeId, to.nodeId);
      if (seg && seg.tracks === 1) {
        if (!segOcc[seg.id]) segOcc[seg.id] = [];
        segOcc[seg.id].push({ enter: from.depart, exit: to.arrive });
      }
    }

    for (let i = 0; i < dep.times.length; i++) {
      const t = dep.times[i];
      const effectivePlat = depPlatId(dep, svc, i);
      const stop = svc.stops[i];
      if (!effectivePlat || stop?.passThrough) continue;
      const arr = t.arrive ?? t.depart, dept = t.depart ?? t.arrive;
      if (arr == null || dept == null) continue;
      const key = `${t.nodeId}::${effectivePlat}`;
      if (!platOcc[key]) platOcc[key] = [];
      platOcc[key].push({ arrive: arr, depart: dept, categoryId: svc.categoryId });
    }
  }
  return { segOcc, platOcc };
}

function findConflictsForStartTime(startMin, routeProfile, existingOcc, myCategoryId) {
  const conflicts = [];

  // Check single-track segments
  for (const rp of routeProfile.profile) {
    if (rp.tracks > 1) continue;
    const enter = startMin + rp.enterOffset;
    const exit = startMin + rp.exitOffset;
    const occs = existingOcc.segOcc[rp.segId] || [];
    for (const occ of occs) {
      if (enter < occ.exit && occ.enter < exit) {
        conflicts.push({ type: 'track', segId: rp.segId, nodeA: rp.nodeA, nodeB: rp.nodeB,
          myEnter: enter, myExit: exit, theirEnter: occ.enter, theirExit: occ.exit });
        break;
      }
    }
  }

  // Check platforms (with per-mode clearance)
  const myClearance = getCat(myCategoryId)?.platformClearance ?? PLATFORM_CLEARANCE_MIN_();
  for (const pp of routeProfile.platformProfile) {
    const arr = startMin + pp.arriveOffset;
    const dep = startMin + pp.departOffset;
    const key = `${pp.nodeId}::${pp.platformId}`;
    const occs = existingOcc.platOcc[key] || [];
    for (const occ of occs) {
      const occClearance = getCat(occ.categoryId)?.platformClearance ?? PLATFORM_CLEARANCE_MIN_();
      const clearance = Math.max(myClearance, occClearance);
      const occEnd = occ.depart + clearance;
      const myEnd = dep + clearance;
      if (arr < occEnd && occ.arrive < myEnd) {
        conflicts.push({ type: 'platform', nodeId: pp.nodeId, platformId: pp.platformId });
        break;
      }
    }
  }

  return conflicts;
}

// ============================================================
// INDIVIDUAL TRAIN SCHEDULE (NS-style)
// ============================================================
function showTrainSchedule(depId) {
  const dep = data.departures.find(d => d.id === depId); if (!dep) return;
  const svc = getSvc(dep.serviceId); if (!svc) return;
  const cat = getCat(svc.categoryId);
  const first = dep.times[0], last = dep.times[dep.times.length - 1];
  const totalMin = (last.arrive ?? last.depart) - (first.depart ?? first.arrive);
  const stopsCount = svc.stops.filter(s => !s.passThrough).length - 2; // intermediate stops only

  let stopsHtml = '';
  for (let i = 0; i < dep.times.length; i++) {
    const t = dep.times[i];
    const stop = svc.stops[i];
    const node = getNode(t.nodeId);
    const isFirst = i === 0;
    const isLast = i === dep.times.length - 1;

    // Skip pass-throughs entirely — they're not visible stops
    if (stop?.passThrough && !isFirst && !isLast) continue;

    const isStation = isPassengerStop(node);
    const platform = depPlatName(dep, svc, i);

    // Timeline dot style
    const dotClass = (isFirst || isLast) ? 'background:var(--accent);' : 'background:var(--text-dim);';

    stopsHtml += `<div style="display:grid;grid-template-columns:60px 60px 24px 1fr auto;align-items:center;padding:${isFirst||isLast?'10':'6'}px 0;${isFirst||isLast?'font-weight:600':''}">
      <div class="mono" style="font-size:13px;color:var(--text-dim);text-align:right;padding-right:8px">${t.arrive != null ? toTime(t.arrive) : ''}</div>
      <div class="mono" style="font-size:13px;color:var(--warn);text-align:right;padding-right:8px">${t.depart != null ? toTime(t.depart) : ''}</div>
      <div style="display:flex;justify-content:center"><div style="width:10px;height:10px;border-radius:50%;${dotClass}flex-shrink:0"></div></div>
      <div style="padding-left:8px;font-size:${isFirst||isLast?'14':'13'}px">
        ${esc(node ? nodeDisplayName(node.id) : '???')}
      </div>
      <div class="mono" style="font-size:12px;color:var(--accent);padding-left:8px">${platform !== '—' ? esc(platform) : ''}</div>
    </div>`;

    // Line between stops — find the next non-pass-through stop for segment info
    if (!isLast) {
      // Accumulate distance/segments to the next visible stop
      let nextVisIdx = i + 1;
      while (nextVisIdx < dep.times.length - 1 && svc.stops[nextVisIdx]?.passThrough) nextVisIdx++;
      let totalDist = 0, minSpeed = Infinity;
      for (let j = i; j < nextVisIdx; j++) {
        const seg = findSeg(dep.times[j].nodeId, dep.times[j+1]?.nodeId);
        if (seg) { totalDist += seg.distance; minSpeed = Math.min(minSpeed, seg.maxSpeed); }
      }
      if (minSpeed === Infinity) minSpeed = 0;
      stopsHtml += `<div style="display:grid;grid-template-columns:60px 60px 24px 1fr;align-items:center;padding:2px 0">
        <div></div><div></div>
        <div style="display:flex;justify-content:center"><div style="width:2px;height:16px;background:var(--border)"></div></div>
        <div style="padding-left:8px;font-size:11px;color:var(--text-muted)">${totalDist.toFixed(1)}km${nextVisIdx - i > 1 ? ` (${nextVisIdx - i} segments)` : ''}</div>
      </div>`;
    }
  }

  const catChip = cat ? `<span class="chip" style="margin-left:8px"><span class="dot" style="background:${svcLineColor(svc)}"></span>${esc(cat.name)}</span>` : '';
  const effStock = resolveStock(svc, dep);
  const stockChip = effStock ? `<span class="chip" style="margin-left:4px">${effStock.traction==='electric'?'⚡':effStock.traction==='diesel'?'⛽':'⚡⛽'} ${esc(effStock.code||effStock.name)}</span>` : '';
  const grp = getGroup(svc.groupId);
  const lineChip = grp ? `<span class="chip" style="margin-left:4px"><span class="dot" style="background:${grp.color||'var(--text-muted)'}"></span>${esc(grp.name)}</span>` : '';

  openModal(`${svc.name}`, `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="font-size:13px;color:var(--text-dim)">${esc(nodeDisplayName(first.nodeId))} → ${esc(nodeDisplayName(last.nodeId))}</span>
      ${catChip}${stockChip}${lineChip}
    </div>
    <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <span class="chip">Total: ~${Math.round(totalMin)} min</span>
      <span class="chip">${stopsCount} intermediate stop${stopsCount!==1?'s':''}</span>
    </div>
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px 8px;background:var(--bg-input)">
      <div style="display:grid;grid-template-columns:60px 60px 24px 1fr auto;padding:0 0 6px;border-bottom:1px solid var(--border);margin-bottom:4px">
        <div class="text-muted" style="font-size:10px;text-align:right;padding-right:8px;text-transform:uppercase;letter-spacing:0.04em">Arr.</div>
        <div class="text-muted" style="font-size:10px;text-align:right;padding-right:8px;text-transform:uppercase;letter-spacing:0.04em">Dep.</div>
        <div></div>
        <div class="text-muted" style="font-size:10px;padding-left:8px;text-transform:uppercase;letter-spacing:0.04em">Station</div>
        <div class="text-muted" style="font-size:10px;padding-left:8px;text-transform:uppercase;letter-spacing:0.04em">Platf.</div>
      </div>
      ${stopsHtml}
    </div>`,
    `<button class="btn" onclick="closeModal()">${t('btn.close')}</button>
     <button class="btn" onclick="closeModal();openDepEditModal('${depId}')">${t('btn.edit_times')}</button>`);
}

// ============================================================
// DEPARTURE EDITING — dwell-focused with cascading
// ============================================================
function openDepEditModal(depId) {
  const dep = data.departures.find(d => d.id === depId); if (!dep) return;
  const svc = getSvc(dep.serviceId); if (!svc) return;
  editingId = depId;
  const overrides = dep.platformOverrides || {};
  const manualDwells = (dep.manualOverrides || {}).dwell || {};

  let stopsHtml = dep.times.map((t, i) => {
    const stop = svc.stops[i];
    const nname = nodeDisplayName(t.nodeId);
    const node = getNode(t.nodeId);
    const isFirst = i === 0, isLast = i === dep.times.length - 1;
    const isStation = isPassengerStop(node);
    const dwellMin = (t.arrive != null && t.depart != null) ? (t.depart - t.arrive) : 0;
    const dwellSec = Math.round(dwellMin * 60);
    const isManualDwell = (i in manualDwells);

    // Platform: use override if exists, else service default
    const servicePlat = stop?.platformId ?? '';
    const currentPlat = overrides[i] ?? servicePlat;
    const isManualPlat = (i in overrides) && overrides[i] !== servicePlat;
    const platOpts = isStation ? (node.platforms||[]).map(p =>
      `<option value="${p.id}" ${p.id===currentPlat?'selected':''}>${esc(p.name)}</option>`).join('') : '';

    return `<div style="display:grid;grid-template-columns:24px 1fr 90px 90px 100px 80px 50px;align-items:center;gap:4px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px" data-dep-idx="${i}">
      <span class="mono text-muted" style="text-align:center">${i+1}</span>
      <span><strong>${esc(nname)}</strong>${stop?.passThrough?' <span class="text-muted" style="font-size:11px">(pass)</span>':''}</span>
      <div class="mono text-dim" style="font-size:12px;text-align:right">${t.arrive!=null?toTime(t.arrive):'—'}</div>
      <div class="mono" style="font-size:12px;text-align:right;color:var(--warn)">${t.depart!=null?toTime(t.depart):'—'}</div>
      <div>${isStation && !stop?.passThrough ? `<select class="dep-plat-sel" data-idx="${i}" style="font-size:11px;padding:3px 6px;width:95px;${isManualPlat?'border-color:var(--warn)':''}" title="${isManualPlat?'Overridden for this departure — preserved on recalculate':'Using service default'}"><option value="">—</option>${platOpts}</select>` : ''}</div>
      <div>${(!isFirst && !isLast && (!stop?.passThrough || node?.type === 'waypoint')) ? `<input type="number" class="dep-dwell-input" value="${dwellSec}" min="0" style="width:70px;font-size:12px;padding:3px 6px;${isManualDwell?'border-color:var(--warn)':''}" data-idx="${i}" title="${isManualDwell?'Manually overridden — preserved on recalculate':'Default dwell time'}">` : `<span class="text-muted" style="font-size:11px">${isFirst?t('sch.stop_origin'):isLast?t('sch.stop_terminus'):t('sch.stop_pass')}</span>`}</div>
      <div>${(!isFirst && !isLast && isStation) ? `<label style="font-size:11px;color:var(--text-dim);display:flex;align-items:center;gap:3px;cursor:pointer" title="Skip this stop (creates variant service)">
        <input type="checkbox" class="dep-skip-cb" data-idx="${i}" ${stop?.passThrough?'checked':''}>${t('dep_edit.col_skip')}</label>` : ''}</div>
    </div>`;
  }).join('');

  openModal(t('modal.edit_dep', { name: svc.name + ' @ ' + toTime(dep.startTime) }), `
    <div class="flex gap-8 items-center mb-16" style="flex-wrap:wrap">
      <div class="form-group" style="margin-bottom:0"><label>${t('field.stock_override')}</label>
        <select id="dep-stock-override" style="font-size:12px;padding:5px 8px;width:200px">
          <option value="">${t('dep_edit.use_default_stock')}${svc.stockId && getStock(svc.stockId) ? ' ('+esc(getStock(svc.stockId).name)+')' : ''}</option>
          ${data.rollingStock.map(st => `<option value="${st.id}" ${dep.stockId===st.id?'selected':''}>${esc(st.name)}${st.code?' ['+esc(st.code)+']':''}</option>`).join('')}
        </select></div>
    </div>
    <p style="font-size:13px;color:var(--text-dim);margin-bottom:12px">
      ${t('dep_edit.adjust_desc')}</p>
    <div style="display:grid;grid-template-columns:24px 1fr 90px 90px 100px 80px 50px;gap:4px;padding:4px 0;border-bottom:1px solid var(--border);margin-bottom:4px">
      <div></div><div class="text-muted" style="font-size:10px;text-transform:uppercase">${t('dep_edit.col_station')}</div>
      <div class="text-muted" style="font-size:10px;text-transform:uppercase;text-align:right">${t('dep_edit.col_arrive')}</div>
      <div class="text-muted" style="font-size:10px;text-transform:uppercase;text-align:right">${t('dep_edit.col_depart')}</div>
      <div class="text-muted" style="font-size:10px;text-transform:uppercase">${t('dep_edit.col_platform')}</div>
      <div class="text-muted" style="font-size:10px;text-transform:uppercase">${t('dep_edit.col_dwell')}</div>
      <div></div>
    </div>
    <div id="dep-edit-stops">${stopsHtml}</div>
    <p class="text-dim mt-8" style="font-size:11px">${t('dep_edit.skip_desc')}</p>`,
    `<button class="btn" onclick="closeModal()">${t('btn.cancel')}</button>
     <button class="btn btn-primary" onclick="saveDepEdit('${depId}')">${t('dep_edit.save_cascade')}</button>`);
}

function saveDepEdit(depId) {
  const dep = data.departures.find(d => d.id === depId); if (!dep) return;
  const svc = getSvc(dep.serviceId); if (!svc) return;

  // Save stock override
  const stockOverrideVal = document.getElementById('dep-stock-override')?.value || '';
  dep.stockId = stockOverrideVal || null;

  // Resolve effective stock for this departure
  const stock = resolveStock(svc, dep);
  const cat = getCat(svc.categoryId);
  const defDwell = stock ? stock.defaultDwell : (cat ? cat.defaultDwellTime : DEFAULT_DWELL());

  // Save platform overrides — only store if different from service default
  const platSels = document.querySelectorAll('.dep-plat-sel');
  const platOverrides = {};
  platSels.forEach(sel => {
    const idx = parseInt(sel.dataset.idx);
    const val = sel.value;
    const servicePlat = svc.stops[idx]?.platformId ?? '';
    // Store override if a value is selected AND it differs from service default
    // Also store if service has no default but user picked one (that's still an override)
    if (val && val !== servicePlat) {
      platOverrides[idx] = val;
    } else if (val && val === servicePlat) {
      // Matches service default — no override needed
    } else if (!val && servicePlat) {
      // User cleared the platform — override to "none"
      platOverrides[idx] = '';
    }
  });
  dep.platformOverrides = platOverrides;

  // Check for skipped stops
  const skipCbs = document.querySelectorAll('.dep-skip-cb');
  const skippedIdxs = [];
  skipCbs.forEach(cb => { if (cb.checked) skippedIdxs.push(parseInt(cb.dataset.idx)); });

  // Check if any stops need to be newly skipped (weren't pass-through before)
  const newlySkipped = skippedIdxs.filter(idx => !svc.stops[idx]?.passThrough);

  // Check if any stops were unskipped (were pass-through, now unchecked)
  const newlyUnskipped = [];
  skipCbs.forEach(cb => {
    const idx = parseInt(cb.dataset.idx);
    if (!cb.checked && svc.stops[idx]?.passThrough) newlyUnskipped.push(idx);
  });

  if (newlySkipped.length > 0 || newlyUnskipped.length > 0) {
    // Create a variant service with the modified stop pattern
    const variant = JSON.parse(JSON.stringify(svc));
    variant.id = uid();
    variant.name = svc.name + ' (var)';

    // Apply skips: mark newly skipped stops as pass-through (keep them in route for segment continuity)
    if (newlySkipped.length) {
      const skippedNames = newlySkipped.map(idx => nodeName(svc.stops[idx]?.nodeId)).filter(n => n !== '???');
      variant.description = `Skips ${skippedNames.join(', ')}`;
      for (const idx of newlySkipped) {
        if (variant.stops[idx]) {
          variant.stops[idx].passThrough = true;
          variant.stops[idx].platformId = null;
          variant.stops[idx].dwell = null;
        }
      }
    }
    // Apply unskips: mark previously pass-through stops as regular stops
    if (newlyUnskipped.length) {
      for (const idx of newlyUnskipped) {
        if (variant.stops[idx]) variant.stops[idx].passThrough = false;
      }
      const unskippedNames = newlyUnskipped.map(idx => nodeName(svc.stops[idx]?.nodeId)).filter(n => n !== '???');
      const desc = `Now stops at ${unskippedNames.join(', ')}`;
      variant.description = variant.description ? variant.description + '; ' + desc : desc;
    }

    // Apply platform overrides from the edit modal
    const platSels2 = document.querySelectorAll('.dep-plat-sel');
    platSels2.forEach(sel => {
      const idx = parseInt(sel.dataset.idx);
      if (newlySkipped.includes(idx)) return;
      if (sel.value && variant.stops[idx]) variant.stops[idx].platformId = sel.value;
    });

    data.services.push(variant);

    // Re-assign this departure to the variant
    dep.serviceId = variant.id;

    // Recalculate times from the start time using stock
    const variantStock = resolveStock(variant, dep);
    const newTimes = [];
    let t = dep.startTime;
    for (let i = 0; i < variant.stops.length; i++) {
      const stop = variant.stops[i];
      if (i === 0) { newTimes.push({ nodeId: stop.nodeId, arrive: null, depart: t }); }
      else if (i === variant.stops.length - 1) { newTimes.push({ nodeId: stop.nodeId, arrive: t, depart: null }); }
      else {
        const dwell = stopDwellMin(stop, defDwell);
        newTimes.push({ nodeId: stop.nodeId, arrive: t, depart: t + dwell }); t += dwell;
      }
      if (i < variant.stops.length - 1) t += travelTimeInContext(variant.stops, i, variantStock);
    }
    dep.times = newTimes;
    save(); closeModal(); renderServices(); updateBadges();
    toast(`Created variant service: ${variant.name}`, 'success');
    return;
  }

  // Normal case: just update dwell times and cascade
  const dwellInputs = document.querySelectorAll('.dep-dwell-input');
  const dwellMap = {};
  dwellInputs.forEach(inp => { dwellMap[parseInt(inp.dataset.idx)] = parseInt(inp.value) || 0; });

  // Track manual dwell overrides: compare against defaults
  if (!dep.manualOverrides) dep.manualOverrides = {};
  const manualDwells = {};
  dwellInputs.forEach(inp => {
    const idx = parseInt(inp.dataset.idx);
    const sec = parseInt(inp.value) || 0;
    const stop = svc.stops[idx];
    const defaultDwellSec = stop?.dwell ?? defDwell;
    if (sec !== defaultDwellSec) {
      manualDwells[idx] = sec;
    }
  });
  dep.manualOverrides.dwell = Object.keys(manualDwells).length ? manualDwells : undefined;
  // Track stock override
  if (dep.stockId) {
    dep.manualOverrides.stockId = dep.stockId;
  } else {
    delete dep.manualOverrides.stockId;
  }
  // Track platform overrides
  if (Object.keys(dep.platformOverrides || {}).length) {
    dep.manualOverrides.platforms = dep.platformOverrides;
  } else {
    delete dep.manualOverrides.platforms;
  }

  // Recalculate all times from the first departure using stock
  let t = dep.times[0].depart;
  for (let i = 0; i < dep.times.length; i++) {
    const stop = svc.stops[i];
    if (i === 0) {
      dep.times[i].arrive = null;
      dep.times[i].depart = t;
    } else if (i === dep.times.length - 1) {
      dep.times[i].arrive = t;
      dep.times[i].depart = null;
    } else {
      dep.times[i].arrive = t;
      const dwellSec = (i in dwellMap) ? dwellMap[i] : (stop.passThrough ? (stop.dwell || 0) : (stop.dwell ?? defDwell));
      const dwellMin = dwellSec / 60;
      dep.times[i].depart = t + dwellMin;
      t += dwellMin;
    }
    if (i < dep.times.length - 1) {
      t += travelTimeInContext(svc.stops, i, stock);
    }
  }

  dep.startTime = dep.times[0].depart;
  save(); closeModal();
  const activeSvcDetail = document.getElementById('service-detail');
  if (activeSvcDetail?.innerHTML) showServiceDetail(svc.id);
  toast(t('toast.dep_updated'), 'success');
}

function delDep(id) {
  data.departures = data.departures.filter(d => d.id !== id);
  save(); toast(t('toast.dep_deleted'), 'success');
}

// ============================================================
// SCHEDULE VIEW
// ============================================================
function renderSchedule() {
  const c = document.getElementById('schedule-content');
  if (!data.services.length && !data.departures.length) {
    c.innerHTML = `<div class="empty-state"><div class="empty-icon">◷</div><h3>${t('empty.no_services_schedule')}</h3><p>${t('empty.no_services_schedule_desc')}</p></div>`;
    return;
  }
  const orphanCount = data.departures.filter(d => !getSvc(d.serviceId)).length;
  c.innerHTML = `<div class="form-group" style="max-width:300px;"><label>${t('th.filter_service')}</label>
    <select id="sch-filter" onchange="renderSchTable()"><option value="">${t('label.all_services')}</option>
    ${data.services.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
    ${orphanCount ? `<option value="__orphaned__">${t('label.orphaned_deps', { n: orphanCount })}</option>` : ''}
    </select></div>
    <div id="sch-table"></div>`;
  renderSchTable();
}

function renderSchTable() {
  const fid = document.getElementById('sch-filter')?.value || '';
  let deps;
  const isOrphan = fid === '__orphaned__';
  if (isOrphan) {
    deps = data.departures.filter(d => !getSvc(d.serviceId));
  } else if (fid) {
    deps = data.departures.filter(d => d.serviceId === fid);
  } else {
    deps = [...data.departures];
  }
  deps.sort((a, b) => {
    return (a.startTime < DAY_CUTOFF_() ? a.startTime + 1440 : a.startTime) - (b.startTime < DAY_CUTOFF_() ? b.startTime + 1440 : b.startTime);
  });
  const el = document.getElementById('sch-table');
  if (!deps.length) {
    el.innerHTML = `<div class="text-dim mt-16" style="font-size:13px;">${t('empty.no_departures')}</div>`;
    return;
  }

  if (isOrphan) {
    el.innerHTML = `<p style="font-size:13px;color:var(--warn);margin-bottom:12px">These departures reference services that no longer exist.</p>
      <button class="btn btn-sm btn-danger mb-16" onclick="cleanOrphans()">${t('btn.delete_orphans')}</button>
      <table class="schedule-table"><thead><tr><th>${t('th.depart')}</th><th>${t('th.service_id')}</th><th>${t('th.stops')}</th><th></th></tr></thead><tbody>` +
      deps.map(d => {
        const first = d.times[0], last = d.times[d.times.length - 1];
        return `<tr>
          <td style="color:var(--warn)">${toTime(first?.depart??first?.arrive)}</td>
          <td class="mono text-dim" style="font-size:11px">${esc(d.serviceId.substring(0,12))}…</td>
          <td class="text-dim">${d.times.length} stops</td>
          <td class="actions-cell"><button class="btn btn-sm btn-danger" onclick="delDep('${d.id}');renderSchTable()">✕</button></td>
        </tr>`;
      }).join('') + '</tbody></table>';
    return;
  }

  el.innerHTML = `<table class="schedule-table"><thead><tr><th>${t('th.depart')}</th><th>${t('th.service')}</th><th>${t('th.pattern')}</th><th>${t('th.route')}</th><th>${t('th.arrival')}</th><th></th></tr></thead><tbody>` +
    deps.map(d => {
      const svc = getSvc(d.serviceId); if (!svc) return '';
      const first = d.times[0], last = d.times[d.times.length - 1];
      return `<tr>
        <td style="color:var(--warn);font-weight:500">${toTime(first.depart??first.arrive)}</td>
        <td><span class="clickable" onclick="showServiceDetail('${svc.id}')">${esc(svc.name)}</span></td>
        <td class="pattern-cell">${esc(describePattern(svc.schedulePattern))}</td>
        <td class="text-dim">${esc(nodeDisplayName(first.nodeId))} → ${esc(nodeDisplayName(last.nodeId))}</td>
        <td>${toTime(last.arrive??last.depart)}</td>
        <td class="actions-cell">
          <button class="btn btn-sm" onclick="openDepEditModal('${d.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="delDep('${d.id}');renderSchTable()">✕</button></td>
      </tr>`;
    }).join('') + '</tbody></table>';
}

function cleanOrphans() {
  const count = data.departures.filter(d => !getSvc(d.serviceId)).length;
  appConfirm(t('confirm.delete_orphans', { n: count }), () => {
    data.departures = data.departures.filter(d => getSvc(d.serviceId));
    save(); renderSchedule(); toast(t('toast.orphans_removed', { n: count }), 'success');
  });
}
