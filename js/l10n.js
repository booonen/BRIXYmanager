// ============================================================
// L10N — Localization system
// ============================================================
// Loaded first. Provides t() for string lookup with {param} interpolation.
// Language files are JS in lang/ (e.g. lang/en.js) — thin wrappers around JSON
// data, loaded via <script> tags to avoid file:// CORS issues.
// Hierarchical keys: t('nodes.btn.add') -> _strings[_lang].nodes.btn.add.
// Plurals: use separate keys (e.g. geomap.toast.ogf_fetched_one /
// ogf_fetched_other) — caller picks.
// Static HTML strings: elements with data-t="key" are hydrated by l10nHydrate().
//
// Stale detection is hash-based. Every English value is hashed (FNV-1a, 8 hex
// chars); translations stamp the hash they were written against and we compare
// at load time. No manual _stale array.

let _lang = 'en';
const _strings = {};                // code -> key tree
const _hashes = {};                 // code -> { flatKey: hash }
const _availableLanguages = [{ code: 'en', name: 'English' }];

// FNV-1a 32-bit. Matches the build-time hasher.
function l10nHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Called by lang/*.js files. `hashes` is a flat dotted-key -> 8-char hash map.
// For English it's the canonical source; for translations it records which
// English value each translation was written against.
function registerLanguage(code, name, strings, hashes) {
  _strings[code] = strings;
  _hashes[code] = hashes || {};
  if (!_availableLanguages.find(l => l.code === code)) {
    _availableLanguages.push({ code, name });
  }
}

function _resolveKey(obj, key) {
  if (!obj) return undefined;
  const parts = key.split('.');
  let val = obj;
  for (const p of parts) {
    val = val?.[p];
    if (val === undefined) return undefined;
  }
  return val;
}

// Translate a key with optional {param} interpolation.
const _missingKeys = new Set();
function t(key, params) {
  let val = _resolveKey(_strings[_lang], key);
  if (val === undefined) val = _resolveKey(_strings.en, key); // fallback
  if (val === undefined) {
    if (!_missingKeys.has(key)) { _missingKeys.add(key); console.warn(`[l10n] Missing key: "${key}"`); }
    return key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return val;
}

function setLanguage(code) {
  if (!_strings[code]) { toast(t('ie.toast.lang_not_found', { code }), 'error'); return; }
  _lang = code;
  data.settings = data.settings || {};
  data.settings.language = code;
  save();
  l10nHydrate();
  refreshAll();
}

// Flatten a nested tree into { dottedKey: leafValue }.
function _collectFlat(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) _collectFlat(v, full, out);
    else out[full] = v;
  }
  return out;
}

// Per-key status against English:
//   ok      — translated, stored hash matches the current English hash
//   stale   — translated but English has changed since (hash mismatch)
//   missing — no translation at all
// Returns { code: { name, total, ok, stale, missing, rows: [...] } }
function checkLanguageCompleteness() {
  const enFlat = _strings.en ? _collectFlat(_strings.en, '', {}) : {};
  const enHashes = _hashes.en || {};
  const results = {};
  for (const lang of _availableLanguages) {
    if (lang.code === 'en') continue;
    const trFlat = _strings[lang.code] ? _collectFlat(_strings[lang.code], '', {}) : {};
    const trHashes = _hashes[lang.code] || {};
    const rows = [];
    let ok = 0, stale = 0, missing = 0;
    for (const key of Object.keys(enFlat).sort()) {
      const en = enFlat[key];
      const tr = trFlat[key];
      const enH = enHashes[key] || l10nHash(en);
      const trH = trHashes[key];
      let status;
      if (tr === undefined) { status = 'missing'; missing++; }
      else if (trH !== enH) { status = 'stale'; stale++; }
      else { status = 'ok'; ok++; }
      rows.push({ key, en, tr, status, enHash: enH, trHash: trH });
    }
    results[lang.code] = {
      name: lang.name, total: Object.keys(enFlat).length,
      ok, stale, missing, rows,
    };
  }
  return results;
}

// Summary modal. The full editor is in l10n_editor.js.
function showLanguageReport() {
  const report = checkLanguageCompleteness();
  const codes = Object.keys(report);
  if (!codes.length) {
    toast(t('ie.toast.no_other_langs'), 'info');
    return;
  }
  let html = '';
  for (const code of codes) {
    const r = report[code];
    const pct = r.total ? Math.round(r.ok / r.total * 100) : 0;
    html += `<div style="margin-bottom:20px">
      <h3 style="font-size:14px;margin-bottom:8px">${esc(r.name)} (${code}) — ${pct}% complete</h3>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:10px">
        <span style="color:var(--success)">\u25cf ${r.ok} ok</span>
        &nbsp; <span style="color:var(--danger)">\u25cf ${r.stale} stale</span>
        &nbsp; <span style="color:var(--warn)">\u25cf ${r.missing} missing</span>
      </div>
      <button class="btn btn-sm btn-primary" onclick="openLanguageEditor('${esc(code)}')">Open Editor</button>
    </div>`;
  }
  openModal(t('l10n.report_title'), html, `<button class="btn" onclick="closeModal()">${t('common.close')}</button>`);
}

// Hydrate all elements with data-t attributes.
function l10nHydrate() {
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    const val = t(key);
    if (val !== key) el.textContent = val;
  });
  document.querySelectorAll('[data-t-placeholder]').forEach(el => {
    const key = el.getAttribute('data-t-placeholder');
    const val = t(key);
    if (val !== key) el.placeholder = val;
  });
  document.querySelectorAll('[data-t-title]').forEach(el => {
    const key = el.getAttribute('data-t-title');
    const val = t(key);
    if (val !== key) el.title = val;
  });
}
