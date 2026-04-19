// ============================================================
// L10N EDITOR — in-app translation editor
// ============================================================
// Full-screen overlay opened from Settings -> Check Translations -> Open Editor.
// Visually distinct from the main app: different background, serif headings,
// mono grid — so the translator knows they've stepped outside the program
// proper. Runs entirely in-browser; no server. "Download .js" emits an updated
// language file the translator can send to the maintainer.

let _leState = null;  // { code, rows: [...], filter, search }

function openLanguageEditor(code) {
  if (typeof closeModal === 'function') closeModal();
  const report = checkLanguageCompleteness();
  const r = report[code];
  if (!r) { toast('Language not loaded: ' + code, 'error'); return; }

  _leState = {
    code,
    name: r.name,
    rows: r.rows.slice(),   // { key, en, tr, status, enHash, trHash }
    edits: {},              // key -> new translation string
    filter: 'all',          // all | missing | stale | ok
    search: '',
  };
  _leRender();
}

function closeLanguageEditor() {
  const el = document.getElementById('l10n-editor-overlay');
  if (el) el.remove();
  _leState = null;
}

function _leRender() {
  let overlay = document.getElementById('l10n-editor-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'l10n-editor-overlay';
    document.body.appendChild(overlay);
  }
  const s = _leState;
  const counts = { all: s.rows.length, missing: 0, stale: 0, ok: 0 };
  for (const row of s.rows) counts[_leStatus(row)]++;

  const filtered = s.rows.filter(row => {
    const status = _leStatus(row);
    if (s.filter !== 'all' && status !== s.filter) return false;
    if (s.search) {
      const q = s.search.toLowerCase();
      if (!row.key.toLowerCase().includes(q) &&
          !(row.en || '').toLowerCase().includes(q) &&
          !(_leGetValue(row) || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  overlay.innerHTML = `
    <div class="le-chrome">
      <div class="le-header">
        <div class="le-brand">
          <span class="le-brand-mark">\u273f</span>
          <span>Translation Editor</span>
          <span class="le-brand-lang">${esc(s.name)} <span class="le-code">(${esc(s.code)})</span></span>
        </div>
        <div class="le-header-actions">
          <button class="le-btn le-btn-primary" onclick="leDownload()">Download .js</button>
          <button class="le-btn" onclick="closeLanguageEditor()">Close</button>
        </div>
      </div>
      <div class="le-toolbar">
        <div class="le-filters">
          ${['all','missing','stale','ok'].map(f => `
            <button class="le-chip${s.filter === f ? ' le-chip-active' : ''} le-chip-${f}"
              onclick="leSetFilter('${f}')">
              <span class="le-chip-dot"></span>${f} <span class="le-chip-count">${counts[f]}</span>
            </button>`).join('')}
        </div>
        <input class="le-search" type="search" placeholder="Search keys, English, translation..."
          value="${esc(s.search)}" oninput="leSetSearch(this.value)">
      </div>
      <div class="le-grid-wrap">
        <table class="le-grid">
          <thead><tr>
            <th class="le-th-status"></th>
            <th class="le-th-key">Key</th>
            <th class="le-th-en">English</th>
            <th class="le-th-tr">Translation</th>
            <th class="le-th-hash">Hash</th>
          </tr></thead>
          <tbody>
            ${filtered.map(row => _leRowHtml(row)).join('')}
            ${filtered.length === 0 ? `<tr><td colspan="5" class="le-empty">No rows match.</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <div class="le-footer">
        <span class="le-footer-note">Edits stay in this browser until you Download.
          Changed cells re-stamp their hash automatically.</span>
      </div>
    </div>
  `;
}

function _leStatus(row) {
  const s = _leState;
  const edited = s.edits[row.key];
  const curVal = edited !== undefined ? edited : row.tr;
  if (curVal === undefined || curVal === '') return 'missing';
  // If edited, it becomes ok (current en hash is stamped).
  if (edited !== undefined) return 'ok';
  return row.status;
}
function _leGetValue(row) {
  const s = _leState;
  const edited = s.edits[row.key];
  return edited !== undefined ? edited : (row.tr || '');
}
function _leGetHash(row) {
  const s = _leState;
  const edited = s.edits[row.key];
  if (edited !== undefined) return row.enHash;            // freshly stamped
  return row.trHash || '';
}

function _leRowHtml(row) {
  const val = _leGetValue(row);
  const status = _leStatus(row);
  const hash = _leGetHash(row);
  return `<tr class="le-row le-row-${status}">
    <td class="le-cell-status"><span class="le-dot le-dot-${status}" title="${status}"></span></td>
    <td class="le-cell-key">${esc(row.key)}</td>
    <td class="le-cell-en">${esc(row.en)}</td>
    <td class="le-cell-tr">
      <textarea class="le-input" rows="1"
        oninput="leEdit('${esc(row.key)}', this.value); leAutosize(this)"
        onblur="leFinalize('${esc(row.key)}')">${esc(val)}</textarea>
    </td>
    <td class="le-cell-hash"><code>${esc(hash)}</code>
      ${row.trHash && row.trHash !== row.enHash && _leState.edits[row.key] === undefined
        ? `<br><code class="le-hash-old">was ${esc(row.trHash)}</code>` : ''}</td>
  </tr>`;
}

function leAutosize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 220) + 'px';
}

function leEdit(key, value) {
  if (!_leState) return;
  _leState.edits[key] = value;
  // No re-render — we just patched the textarea live. Counts update on filter change.
}
function leFinalize(key) {
  if (!_leState) return;
  _leRenderCounts();
}
function _leRenderCounts() {
  // Just update the chip counts, don't redraw the grid (would lose focus/caret).
  const s = _leState;
  const counts = { all: s.rows.length, missing: 0, stale: 0, ok: 0 };
  for (const row of s.rows) counts[_leStatus(row)]++;
  document.querySelectorAll('.le-chip').forEach(btn => {
    const m = btn.className.match(/le-chip-(all|missing|stale|ok)/);
    if (!m) return;
    const count = btn.querySelector('.le-chip-count');
    if (count) count.textContent = counts[m[1]];
  });
}
function leSetFilter(f) { _leState.filter = f; _leRender(); }
function leSetSearch(q) { _leState.search = q; _leRender(); }

// Emit a downloadable .js file with current edits applied.
function leDownload() {
  const s = _leState;
  const strings = {};
  const hashes = {};

  // Start from current translations, overlay edits, skip empties.
  for (const row of s.rows) {
    const val = _leGetValue(row);
    if (!val) continue;
    const edited = s.edits[row.key] !== undefined;
    _leSetNested(strings, row.key, val);
    hashes[row.key] = edited ? row.enHash : (row.trHash || row.enHash);
  }

  const header = `// ${s.name}.
// Hashes stamp which English value each translation was written against;
// mismatches with the current English hash are shown as "stale" in the
// translation editor (Settings -> Check Translations -> Open Editor).
`;
  const js = header + `registerLanguage(${JSON.stringify(s.code)}, ${JSON.stringify(s.name)}, ${_leSerialize(strings, 2)}, ${_leSerializeHashes(hashes)});\n`;

  const blob = new Blob([js], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = s.code + '.js';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Downloaded ' + s.code + '.js', 'success');
}

function _leSetNested(obj, dotted, val) {
  const parts = dotted.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in o) || typeof o[p] !== 'object' || Array.isArray(o[p])) o[p] = {};
    o = o[p];
  }
  o[parts[parts.length - 1]] = val;
}
function _leSerialize(obj, indent) {
  const pad = ' '.repeat(indent);
  const entries = Object.entries(obj);
  if (!entries.length) return '{}';
  const parts = entries.map(([k, v]) => {
    const kEsc = JSON.stringify(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return `${pad}${kEsc}: ${_leSerialize(v, indent + 2)}`;
    }
    return `${pad}${kEsc}: ${JSON.stringify(v)}`;
  });
  return '{\n' + parts.join(',\n') + '\n' + ' '.repeat(indent - 2) + '}';
}
function _leSerializeHashes(h) {
  const keys = Object.keys(h).sort();
  const pad = '  ';
  return '{\n' + keys.map(k => `${pad}${JSON.stringify(k)}: ${JSON.stringify(h[k])}`).join(',\n') + '\n}';
}
