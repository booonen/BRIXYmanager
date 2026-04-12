// ============================================================
// OGF COORDINATE FETCHING
// ============================================================
const OGF_OVERPASS_URL = 'https://overpass.opengeofiction.net/api/interpreter';

async function fetchOgfCoords(nodes) {
  const toFetch = nodes.filter(n => n.ogfNode);
  if (!toFetch.length) return;

  // Build Overpass query: union of node(id) statements
  const ids = toFetch.map(n => `node(${n.ogfNode});`).join('');
  const query = `[out:json];(${ids});out;`;

  try {
    const resp = await fetch(OGF_OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();

    let updated = 0;
    for (const el of (json.elements || [])) {
      if (el.type !== 'node' || el.lat == null || el.lon == null) continue;
      // Match back to our nodes by ogfNode ID
      const matches = toFetch.filter(n => String(n.ogfNode) === String(el.id));
      for (const node of matches) {
        node.lat = el.lat;
        node.lon = el.lon;
        updated++;
      }
    }

    if (updated > 0) {
      save();
      toast(updated === 1 ? t('toast.ogf_fetched_one') : t('toast.ogf_fetched_other', { n: updated }), 'success');
      // Refresh current view if on nodes tab
      const activeTab = document.querySelector('.nav-item.active')?.dataset?.tab;
      if (activeTab === 'nodes') renderNodes();
    } else {
      toast(t('toast.ogf_none_found'), 'error');
    }
  } catch (err) {
    console.error('OGF fetch error:', err);
    toast(t('toast.ogf_error', { msg: err.message }), 'error');
  }
}

async function fetchAllOgfCoords() {
  const nodes = data.nodes.filter(n => n.ogfNode);
  if (!nodes.length) { toast(t('toast.ogf_no_ids'), 'error'); return; }
  toast(nodes.length === 1 ? t('toast.ogf_fetching_one') : t('toast.ogf_fetching_other', { n: nodes.length }), 'success');
  await fetchOgfCoords(nodes);
}

// ============================================================
// TOAST & MODAL
// ============================================================
function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  c.appendChild(t); setTimeout(() => t.remove(), 3000);
}
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); editingId = null; }
let _modalMouseDownTarget = null;
function closeModalOnOverlay(e) {
  // Only close if both mousedown and mouseup (click) landed on the overlay itself
  if (e.target === e.currentTarget && _modalMouseDownTarget === e.currentTarget) closeModal();
  _modalMouseDownTarget = null;
}

function highlightEntity(id) {
  setTimeout(() => {
    const row = document.querySelector(`tr[data-id="${id}"]`);
    if (row) {
      row.classList.remove('issue-highlight');
      void row.offsetWidth; // force reflow to restart animation
      row.classList.add('issue-highlight');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, 120);
}

// ============================================================
// IN-APP CONFIRM / PROMPT — replaces browser confirm() and prompt()
// ============================================================
// These render as overlays at z-index above modals. Non-clickthrough:
// only the Cancel/Confirm buttons dismiss them.

function appConfirm(message, onYes) {
  const id = 'app-confirm-overlay';
  if (document.getElementById(id)) document.getElementById(id).remove();
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:24px;max-width:440px;width:90%">
    <div style="font-size:14px;color:var(--text);margin-bottom:20px;line-height:1.6;white-space:pre-line">${esc(message)}</div>
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn" id="app-confirm-no">${t('btn.cancel')}</button>
      <button class="btn btn-primary" id="app-confirm-yes">${t('btn.confirm')}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  document.getElementById('app-confirm-yes').onclick = () => { overlay.remove(); if (onYes) onYes(); };
  document.getElementById('app-confirm-no').onclick = () => { overlay.remove(); };
  document.getElementById('app-confirm-yes').focus();
}

function appPrompt(message, defaultValue, onSubmit) {
  const id = 'app-confirm-overlay';
  if (document.getElementById(id)) document.getElementById(id).remove();
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `<div style="background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:24px;max-width:440px;width:90%">
    <div style="font-size:14px;color:var(--text);margin-bottom:12px;line-height:1.6">${esc(message)}</div>
    <input type="text" id="app-prompt-input" value="${esc(defaultValue || '')}" style="width:100%;margin-bottom:20px">
    <div style="display:flex;justify-content:flex-end;gap:8px">
      <button class="btn" id="app-prompt-cancel">${t('btn.cancel')}</button>
      <button class="btn btn-primary" id="app-prompt-ok">${t('btn.confirm')}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const input = document.getElementById('app-prompt-input');
  input.focus();
  input.select();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('app-prompt-ok').click(); if (e.key === 'Escape') document.getElementById('app-prompt-cancel').click(); });
  document.getElementById('app-prompt-ok').onclick = () => { const val = input.value; overlay.remove(); if (onSubmit && val && val.trim()) onSubmit(val.trim()); };
  document.getElementById('app-prompt-cancel').onclick = () => { overlay.remove(); };
}

// Highlight a specific form field in an open modal
function highlightField(fieldId) {
  setTimeout(() => {
    const el = document.getElementById(fieldId) || document.querySelector(`[data-field="${fieldId}"]`);
    if (!el) return;
    const group = el.closest('.form-group') || el;
    group.classList.remove('field-highlight');
    void group.offsetWidth;
    group.classList.add('field-highlight');
    group.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 200);
}

// ============================================================
// NAV
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`panel-${tab}`).classList.add('active');
  document.querySelector(`.nav-item[data-tab="${tab}"]`)?.classList.add('active');
  // Clear detail panels when switching
  ['node-detail','segment-detail','service-detail','line-detail'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '';
  });
  const renders = {
    dashboard: renderDashboard, nodes: renderNodes, segments: renderSegments,
    lines: renderLines, modes: renderCategories, stock: renderStock, services: renderServices,
    schedule: renderSchedule,
    map: () => { if (!_map) initMap(); else { _map.invalidateSize(); renderMapContent(false); } },
    schematic: () => { initSchematic(); renderSchematic(); },
    departures: () => { populateStationSelect(); renderDepartures(); },
    journey: initJourneyPlanner,
    issues: runIssueDetection,
    settings: renderSettings
  };
  if (renders[tab]) renders[tab]();
}
function updateBadges() {
  document.getElementById('badge-nodes').textContent = data.nodes.length;
  document.getElementById('badge-segments').textContent = data.segments.length;
  document.getElementById('badge-lines').textContent = data.serviceGroups.length;
  document.getElementById('badge-modes').textContent = data.categories.length;
  document.getElementById('badge-stock').textContent = data.rollingStock.length;
  document.getElementById('badge-services').textContent = data.services.length;
  // Auto-refresh issues badge
  if (typeof runIssueDetection === 'function') runIssueDetection();
}
function refreshAll() {
  updateBadges();
  // Flush stale beckmap SVG and detail maps on data reload
  const schemSvg = document.getElementById('schem-svg');
  if (schemSvg) schemSvg.innerHTML = '';
  if (typeof _detailMaps !== 'undefined') for (const k of Object.keys(_detailMaps)) detailMapDestroy(k);
  if (typeof _renderCache !== 'undefined') _renderCache = {};
  const a = document.querySelector('.nav-item.active'); if (a) switchTab(a.dataset.tab);
}

// ============================================================
// NODE SEARCH PICKER — reusable autocomplete for node selection
// ============================================================

// Creates a searchable node picker inside a container element.
// Options: { containerId, pickerId, placeholder, filterFn, onSelect, selectedId, showExtra }
// filterFn(node) → bool: optional filter (e.g. stations only)
// onSelect(nodeId) → called when a node is picked
// showExtra(node) → optional extra text shown after type (e.g. segment info)
function createNodePicker(opts) {
  const container = document.getElementById(opts.containerId);
  if (!container) return;
  const id = opts.pickerId || ('np-' + uid());
  const filterFn = opts.filterFn || (() => true);
  const placeholder = opts.placeholder || t('node_picker.search');

  container.innerHTML = `<div class="node-picker" id="${id}">
    <div id="${id}-selected" style="display:none" class="np-selected" tabindex="0"
      onclick="nodePickerClear('${id}')"
      onkeydown="if(event.key!=='Tab'){nodePickerClear('${id}');event.preventDefault()}"
      onfocus="this.style.borderColor='var(--border-focus)'"
      onblur="this.style.borderColor=''">>
      <span id="${id}-sel-text"></span>
      <span class="np-clear" title="Clear">✕</span>
    </div>
    <input type="text" id="${id}-input" placeholder="${esc(placeholder)}"
      onfocus="nodePickerOpen('${id}')"
      oninput="nodePickerFilter('${id}')"
      autocomplete="off">
    <div class="np-dropdown" id="${id}-dropdown"></div>
  </div>`;

  // Store config on the DOM element
  const el = document.getElementById(id);
  el._npConfig = {
    filterFn, onSelect: opts.onSelect, onEnterSelect: opts.onEnterSelect,
    showExtra: opts.showExtra,
    displayNameFn: opts.displayNameFn || null,
    selectedId: null, highlighted: -1
  };

  // Keyboard navigation
  const input = document.getElementById(`${id}-input`);
  input.addEventListener('keydown', e => {
    const dd = document.getElementById(`${id}-dropdown`);
    const items = dd.querySelectorAll('.np-item');
    const cfg = el._npConfig;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); cfg.highlighted = Math.min(cfg.highlighted + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('highlighted', i === cfg.highlighted));
      if (items[cfg.highlighted]) items[cfg.highlighted].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); cfg.highlighted = Math.max(cfg.highlighted - 1, 0);
      items.forEach((it, i) => it.classList.toggle('highlighted', i === cfg.highlighted));
      if (items[cfg.highlighted]) items[cfg.highlighted].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cfg.highlighted >= 0 && items[cfg.highlighted]) items[cfg.highlighted].click();
      else if (items.length > 0) items[0].click();
      if (cfg.onEnterSelect) setTimeout(() => cfg.onEnterSelect(), 50);
    } else if (e.key === 'Escape') {
      dd.classList.remove('open'); input.blur();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function handler(e) {
    if (!document.getElementById(id)) { document.removeEventListener('click', handler); return; }
    if (!document.getElementById(id).contains(e.target)) {
      document.getElementById(`${id}-dropdown`)?.classList.remove('open');
    }
  });

  // If we have a pre-selected value, show it
  if (opts.selectedId) {
    nodePickerSetValue(id, opts.selectedId);
  }
}

function nodePickerOpen(id) {
  const el = document.getElementById(id); if (!el) return;
  const input = document.getElementById(`${id}-input`);
  input.value = '';
  el._npConfig.highlighted = -1;
  nodePickerFilter(id);
  document.getElementById(`${id}-dropdown`).classList.add('open');
}

function nodePickerFilter(id) {
  const el = document.getElementById(id); if (!el) return;
  const cfg = el._npConfig;
  const dnFn = cfg.displayNameFn;
  const q = (document.getElementById(`${id}-input`)?.value || '').toLowerCase();
  const dd = document.getElementById(`${id}-dropdown`);

  // Reset any stateful dedup in filterFn by re-running it fresh
  // filterFn may be a closure with a seen-set; we need to get a fresh list each time
  const allFiltered = data.nodes.filter(n => cfg.filterFn(n));

  // If displayNameFn is set, deduplicate by display name (fresh each filter call)
  let nodes;
  if (dnFn) {
    const seen = {};
    nodes = [];
    for (const n of allFiltered) {
      const dn = dnFn(n.id);
      if (seen[dn]) continue;
      seen[dn] = true;
      nodes.push(n);
    }
  } else {
    nodes = allFiltered;
  }

  nodes = nodes.filter(n => {
      const searchName = dnFn ? dnFn(n.id) : n.name;
      const qn = stripDiacritics(q);
      return !q || stripDiacritics(searchName.toLowerCase()).includes(qn) || stripDiacritics(n.name.toLowerCase()).includes(qn) || n.type.includes(q) || stripDiacritics((n.refCode||'').toLowerCase()).includes(qn);
    })
    .sort((a, b) => (dnFn ? dnFn(a.id) : a.name).localeCompare(dnFn ? dnFn(b.id) : b.name));

  if (!nodes.length) {
    dd.innerHTML = `<div class="np-empty">${t('node_picker.no_match')}</div>`;
  } else {
    dd.innerHTML = nodes.map(n => {
      const displayName = dnFn ? dnFn(n.id) : n.name;
      const extra = cfg.showExtra ? cfg.showExtra(n) : '';
      return `<div class="np-item" data-node-id="${n.id}" onclick="nodePickerSelect('${id}','${n.id}')">
        <div class="np-info">
          <div class="np-name">${esc(displayName)}${n.refCode ? ` <span style="color:var(--text-muted);font-size:11px">[${esc(n.refCode)}]</span>` : ''}</div>
          <div class="np-type">${t('type.'+n.type)}${extra ? ' · ' + extra : ''}</div>
        </div>
      </div>`;
    }).join('');
  }
  cfg.highlighted = -1;
}

function nodePickerSelect(id, nodeId) {
  const el = document.getElementById(id); if (!el) return;
  const cfg = el._npConfig;
  cfg.selectedId = nodeId;
  document.getElementById(`${id}-dropdown`).classList.remove('open');

  const node = getNode(nodeId);
  const selDiv = document.getElementById(`${id}-selected`);
  const inputEl = document.getElementById(`${id}-input`);
  if (node) {
    const displayName = cfg.displayNameFn ? cfg.displayNameFn(node.id) : node.name;
    document.getElementById(`${id}-sel-text`).innerHTML = `<strong>${esc(displayName)}</strong> <span class="text-muted" style="font-size:11px">${t('type.'+node.type)}</span>`;
    selDiv.style.display = 'flex';
    inputEl.style.display = 'none';
  }

  if (cfg.onSelect) cfg.onSelect(nodeId);
}

function nodePickerClear(id) {
  const el = document.getElementById(id); if (!el) return;
  const cfg = el._npConfig;
  cfg.selectedId = null;
  document.getElementById(`${id}-selected`).style.display = 'none';
  const inputEl = document.getElementById(`${id}-input`);
  inputEl.style.display = '';
  inputEl.value = '';
  inputEl.focus();
  if (cfg.onSelect) cfg.onSelect('');
}

function nodePickerSetValue(id, nodeId) {
  if (!nodeId) { nodePickerClear(id); return; }
  const el = document.getElementById(id); if (!el) return;
  const cfg = el._npConfig;
  cfg.selectedId = nodeId;
  const node = getNode(nodeId);
  const selDiv = document.getElementById(`${id}-selected`);
  const inputEl = document.getElementById(`${id}-input`);
  if (node && selDiv) {
    const displayName = cfg.displayNameFn ? cfg.displayNameFn(node.id) : node.name;
    document.getElementById(`${id}-sel-text`).innerHTML = `<strong>${esc(displayName)}</strong> <span class="text-muted" style="font-size:11px">${t('type.'+node.type)}</span>`;
    selDiv.style.display = 'flex';
    inputEl.style.display = 'none';
  }
}

function nodePickerGetValue(id) {
  const el = document.getElementById(id); if (!el) return '';
  return el._npConfig.selectedId || '';
}

// Convenience: creates a simple node picker that fires a callback,
// used in route builder where we immediately add the stop.
function createNodePickerInline(containerId, pickerId, placeholder, filterFn, onSelect, showExtra) {
  createNodePicker({ containerId, pickerId, placeholder, filterFn, onSelect, showExtra });
}
