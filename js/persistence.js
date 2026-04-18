// ============================================================
// PERSISTENCE — IndexedDB multi-slot save system
// ============================================================
let _db = null;
let _activeSaveId = '';
let _saveDebounce = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('railmanager', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('registry')) db.createObjectStore('registry', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'id' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(store, obj) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(obj);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function saveSlotStats() {
  return { nodes: data.nodes.length, segments: data.segments.length, services: data.services.length, departures: data.departures.length };
}

function save() {
  if (!_activeSaveId) return;
  clearTimeout(_saveDebounce);
  _saveDebounce = setTimeout(() => flushSave(), 300);
}

async function flushSave() {
  if (!_db || !_activeSaveId) return;
  try {
    await dbPut('saves', { id: _activeSaveId, data: JSON.parse(JSON.stringify(data)) });
    await dbPut('registry', { id: _activeSaveId, name: data.settings?.systemName || t('import_export.saves.unnamed'), modified: new Date().toISOString(), stats: saveSlotStats() });
  } catch(e) { console.error('Save failed:', e); }
}

async function load() {
  await openDB();
  _activeSaveId = localStorage.getItem('railmanager:active') || '';
  if (_activeSaveId) {
    const slot = await dbGet('saves', _activeSaveId);
    if (slot?.data) data = { ...data, ...slot.data };
    migrateSegmentTracks();
  }
  if (!_activeSaveId) {
    _activeSaveId = uid();
    localStorage.setItem('railmanager:active', _activeSaveId);
    await flushSave();
  }
}

async function loadSlot(id) {
  await flushSave();
  data = { nodes: [], segments: [], categories: [], services: [], serviceGroups: [], departures: [], rollingStock: [], stockModeMatrix: {}, settings: {} };
  _activeSaveId = id;
  localStorage.setItem('railmanager:active', id);
  const slot = await dbGet('saves', id);
  if (slot?.data) data = { ...data, ...slot.data };
  migrateSegmentTracks();
  if (_map) { _map.remove(); _map = null; }
  refreshAll(); renderDashboard(); updateSystemName();
  toast(t('import_export.toast.loaded', { name: data.settings?.systemName || t('import_export.saves.unnamed') }), 'success');
}

async function deleteSlot(id) {
  const reg = await dbGetAll('registry');
  const entry = reg.find(r => r.id === id);
  if (!entry) return;
  appConfirm(t('import_export.saves.confirm_delete', { name: entry.name }), async () => {
    await dbDelete('saves', id);
    await dbDelete('registry', id);
    if (_activeSaveId === id) {
      const remaining = reg.filter(r => r.id !== id);
      if (remaining.length > 0) {
        await loadSlot(remaining[0].id);
      } else {
        data = { nodes: [], segments: [], categories: [], services: [], serviceGroups: [], departures: [], rollingStock: [], stockModeMatrix: {}, settings: {} };
        _activeSaveId = uid();
        localStorage.setItem('railmanager:active', _activeSaveId);
        await flushSave();
        refreshAll(); renderDashboard(); updateSystemName();
      }
    }
    toast(t('import_export.toast.save_deleted'), 'success');
  });
}

async function duplicateSlot(id) {
  const slot = await dbGet('saves', id);
  const regEntry = await dbGet('registry', id);
  if (!slot || !regEntry) return;
  const newId = uid();
  await dbPut('saves', { id: newId, data: slot.data });
  await dbPut('registry', { id: newId, name: regEntry.name + ' (copy)', modified: new Date().toISOString(), stats: regEntry.stats });
  toast(t('import_export.toast.save_duplicated', { name: regEntry.name }), 'success');
  openSaveManager();
}

async function renameSlot(id) {
  const entry = await dbGet('registry', id);
  if (!entry) return;
  appPrompt(t('import_export.saves.prompt_rename'), entry.name, async (newName) => {
    entry.name = newName;
    await dbPut('registry', entry);
    if (_activeSaveId === id) {
      data.settings = data.settings || {};
      data.settings.systemName = entry.name;
      save(); updateSystemName();
    }
    openSaveManager();
  });
}

async function exportData() {
  const jsonStr = JSON.stringify(data, null, 2);
  const sysName = stripDiacritics(data.settings?.systemName || 'railmanager').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'railmanager';
  const now = new Date();
  const ts = now.getFullYear().toString() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
  const defaultName = sysName + '-' + ts + '.json';
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: defaultName, types: [{ description: t('import_export.saves.json_file'), accept: { 'application/json': ['.json'] } }] });
      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      toast(t('import_export.toast.data_exported'), 'success');
      return;
    } catch(e) { if (e.name === 'AbortError') return; }
  }
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = defaultName; a.click(); URL.revokeObjectURL(a.href);
  toast(t('import_export.toast.data_exported'), 'success');
}

function importData() { document.getElementById('file-input').click(); }
function handleImport(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(ev) {
    try {
      const imported = JSON.parse(ev.target.result);
      delete imported.lines;
      const tempData = { nodes: [], segments: [], categories: [], services: [], serviceGroups: [], departures: [], rollingStock: [], stockModeMatrix: {}, settings: {}, ...imported };
      // Run migration on imported data before storing
      const prevData = data; data = tempData; migrateSegmentTracks(); data = prevData;
      const newId = uid();
      await dbPut('saves', { id: newId, data: tempData });
      await dbPut('registry', { id: newId, name: tempData.settings?.systemName || file.name.replace(/\.json$/i, ''), modified: new Date().toISOString(),
        stats: { nodes: tempData.nodes.length, segments: tempData.segments.length, services: tempData.services.length, departures: tempData.departures.length } });
      await flushSave();
      await loadSlot(newId);
      toast(t('import_export.toast.imported'), 'success');
    } catch(err) { toast(t('import_export.toast.invalid_json'), 'error'); }
  };
  reader.readAsText(file); e.target.value = '';
}

async function getStorageEstimate() {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    return { used: est.usage || 0, quota: est.quota || 0 };
  }
  return { used: 0, quota: 0 };
}

async function openSaveManager() {
  const reg = await dbGetAll('registry');
  const est = await getStorageEstimate();
  const usedMB = (est.used / 1024 / 1024).toFixed(1);
  const quotaMB = (est.quota / 1024 / 1024).toFixed(0);
  const rows = reg.sort((a, b) => new Date(b.modified) - new Date(a.modified)).map(r => {
    const isActive = r.id === _activeSaveId;
    const mod = r.modified ? new Date(r.modified).toLocaleString() : '—';
    const st = r.stats || {};
    return `<tr style="${isActive ? 'background:var(--accent-glow)' : ''}">
      <td><strong>${esc(r.name)}</strong>${isActive ? ` <span style="font-size:10px;color:var(--accent)">${t('import_export.saves.active')}</span>` : ''}</td>
      <td class="text-dim" style="font-size:12px">${mod}</td>
      <td class="mono" style="font-size:12px">${st.nodes||0}n · ${st.services||0}s · ${st.departures||0}d</td>
      <td class="actions-cell" style="white-space:nowrap">
        ${!isActive ? `<button class="btn btn-sm" onclick="closeModal();loadSlot('${r.id}')">${t('common.btn.load')}</button>` : ''}
        <button class="btn btn-sm" onclick="renameSlot('${r.id}')">${t('common.btn.rename')}</button>
        <button class="btn btn-sm" onclick="duplicateSlot('${r.id}')">${t('common.btn.duplicate')}</button>
        ${!isActive ? `<button class="btn btn-sm btn-danger" onclick="deleteSlot('${r.id}');setTimeout(openSaveManager,200)">✕</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  openModal(t('import_export.saves.title'), `
    <table class="data-table"><thead><tr><th>${t('import_export.saves.col_system')}</th><th>${t('import_export.saves.col_modified')}</th><th>${t('import_export.saves.col_stats')}</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="text-dim">${t('import_export.saves.no_saves')}</td></tr>`}</tbody></table>
    <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
      <div class="flex gap-8">
        <button class="btn btn-sm btn-primary" onclick="closeModal();newSystem()">${t('import_export.btn.new_system')}</button>
        <button class="btn btn-sm" onclick="closeModal();importData()">↑ ${t('import_export.btn.import_json')}</button>
        <button class="btn btn-sm" onclick="closeModal();exportData()">↓ ${t('import_export.btn.export_json')}</button>
      </div>
      <span class="text-dim" style="font-size:11px">${t('import_export.saves.storage')}: ${usedMB} MB${quotaMB > 0 ? ' / ' + quotaMB + ' MB' : ''}</span>
    </div>`,
    `<button class="btn" onclick="closeModal()">${t('common.btn.close')}</button>`);
}

// ---- Saves Dropdown ----
function toggleSavesDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('saves-dropdown-menu');
  if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
  renderSavesDropdown();
  menu.classList.add('open');
}

async function renderSavesDropdown() {
  const menu = document.getElementById('saves-dropdown-menu');
  if (!menu) return;
  const reg = await dbGetAll('registry');
  reg.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  let html = '';
  for (const r of reg) {
    const isActive = r.id === _activeSaveId;
    const st = r.stats || {};
    html += `<div class="saves-dropdown-item${isActive ? ' active' : ''}" onclick="${isActive ? '' : `closeSavesDropdown();loadSlot('${r.id}')`}" ${isActive ? 'style="cursor:default"' : ''}>
      <div style="font-weight:${isActive ? '600' : '400'}">${isActive ? '● ' : ''}${esc(r.name)}</div>
      <div style="font-size:11px;color:var(--text-muted)">${st.nodes||0}n · ${st.services||0}s · ${st.departures||0}d</div>
    </div>`;
  }
  html += `<div class="saves-dropdown-divider"></div>`;
  html += `<div class="saves-dropdown-item" onclick="closeSavesDropdown();newSystem()"><span style="color:var(--accent)">+ ${t('import_export.btn.new_system')}</span></div>`;
  menu.innerHTML = html;
}

function closeSavesDropdown() {
  const menu = document.getElementById('saves-dropdown-menu');
  if (menu) menu.classList.remove('open');
}

function updateSavesDropdownLabel() {
  const el = document.getElementById('saves-dropdown-label');
  if (el) el.textContent = data.settings?.systemName || t('common.btn.saves');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const dd = document.getElementById('saves-dropdown');
  if (dd && !dd.contains(e.target)) closeSavesDropdown();
});

// Relocated from Settings — fundamentally a persistence operation
async function newSystem() {
  appConfirm(t('import_export.saves.confirm_new'), async () => {
    await flushSave();
    data = { nodes: [], segments: [], categories: [], services: [], serviceGroups: [], departures: [], rollingStock: [], stockModeMatrix: {}, settings: {} };
    _activeSaveId = uid();
    localStorage.setItem('railmanager:active', _activeSaveId);
    await flushSave();
    if (_map) { _map.remove(); _map = null; }
    updateSystemName();
    switchTab('dashboard');
    toast(t('import_export.toast.new_system'), 'success');
  });
}
