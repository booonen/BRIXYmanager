// ============================================================
// L10N — Localization system
// ============================================================
// Loaded first. Provides t() for string lookup with {param} interpolation.
// Language files are JS in lang/ directory (e.g., lang/en.js) — thin wrappers
// around JSON data, loaded via <script> tags to avoid file:// CORS issues.
// Hierarchical keys: t('nav.nodes') → _strings[_lang].nav.nodes
// Plurals: use separate keys (toast.fetched_one, toast.fetched_other) — caller picks.
// Static HTML strings: elements with data-t="key" are hydrated by l10nHydrate().
//
// Staleness detection:
// English is the source of truth. Every leaf string in en is hashed (djb2 → base36).
// Each translation file stamps `_hashes` — a flat { "dot.key": hash } map recording
// the English hash the translator worked against. If the current English hash for a
// key differs from the stored one, the translation is stale. No manual bookkeeping —
// any edit to an English string auto-invalidates dependent translations.
//
// Legacy: the older `_stale` array (explicit list of stale key paths) is still
// accepted for translation files that haven't been migrated to hashes yet.

let _lang = 'en';
let _strings = {};
// Per-language metadata kept out of _strings so it doesn't leak into key walks.
// Shape: { [code]: { name, hashes: {key: hash} | null, staleKeys: [key, ...] } }
let _meta = {};
let _availableLanguages = [{ code: 'en', name: 'English' }];
// Old-key → new-key aliases. Used during key-restructure migrations so that
// call sites referencing old key paths keep resolving while the codebase
// transitions. Registered via registerAliases(). Empty when no migration
// is in-flight.
let _aliases = {};

// djb2 → unsigned 32-bit → base36. ~6-7 char hashes, plenty for staleness detection.
function _hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0; // h * 33 + c
  }
  return (h >>> 0).toString(36);
}

// Walk a nested strings object and return { "dot.key": hash } for every string leaf.
// Keys starting with _ are treated as metadata and skipped.
function _computeHashes(obj, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const full = prefix ? prefix + '.' + k : k;
    if (typeof v === 'string') {
      out[full] = _hashString(v);
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      Object.assign(out, _computeHashes(v, full));
    }
  }
  return out;
}

// Called by lang/*.js files to register their string data.
// Metadata keys recognised on the payload:
//   _hashes: { "dot.key": "hashstr" } — English hash each key was translated against
//   _stale:  ["dot.key", ...]          — legacy explicit stale list (still honoured)
// For English, hashes are computed live from the strings themselves.
function registerLanguage(code, name, strings) {
  const storedHashes = strings._hashes || null;
  const staleKeys = strings._stale || [];
  delete strings._hashes;
  delete strings._stale;
  _strings[code] = strings;
  _meta[code] = {
    name,
    hashes: code === 'en' ? _computeHashes(strings) : storedHashes,
    staleKeys,
  };
  if (!_availableLanguages.find(l => l.code === code)) {
    _availableLanguages.push({ code, name });
  }
}

// Register old-key → new-key aliases. Call after all registerLanguage() calls.
// During a migration, old call sites like t('btn.saves') still resolve after
// the key has been moved to common.btn.saves, without editing every call site.
function registerAliases(map) {
  Object.assign(_aliases, map || {});
}

// Resolve a dot-notation key in an object: resolve(obj, 'nav.nodes') → obj.nav.nodes
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

// Translate a key with optional {param} interpolation
// t('nav.nodes') → "Nodes"
// t('toast.fetched', { n: 5 }) → "Fetched coordinates for 5 nodes"
const _missingKeys = new Set();
function t(key, params) {
  let val = _resolveKey(_strings[_lang], key);
  if (val === undefined) val = _resolveKey(_strings.en, key); // fallback to English
  if (val === undefined && _aliases[key]) {
    // Transitional: try the aliased new key if direct lookup failed.
    const aliased = _aliases[key];
    val = _resolveKey(_strings[_lang], aliased);
    if (val === undefined) val = _resolveKey(_strings.en, aliased);
  }
  if (val === undefined) {
    if (!_missingKeys.has(key)) { _missingKeys.add(key); console.warn(`[l10n] Missing key: "${key}"`); }
    return key; // fallback to raw key
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return val;
}

// Set language, persist to settings, re-render UI
function setLanguage(code) {
  if (!_strings[code]) { toast(t('toast.lang_not_found', { code }), 'error'); return; }
  _lang = code;
  data.settings = data.settings || {};
  data.settings.language = code;
  save();
  l10nHydrate();
  refreshAll();
}

// Collect all dot-notation keys from a nested object. Skips _-prefixed metadata.
function _collectKeys(obj, prefix) {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const full = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(..._collectKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

// Check all loaded languages for missing and stale keys (vs English).
// Returns { code: { name, missing: [...], stale: [...] } }
// Staleness is detected by hash mismatch against the current English hashes.
// Falls back to the legacy _stale array for translation files without _hashes.
function checkLanguageCompleteness() {
  const enHashes = _meta.en?.hashes || {};
  const enKeys = Object.keys(enHashes);
  const results = {};
  for (const lang of _availableLanguages) {
    if (lang.code === 'en') continue;
    const strs = _strings[lang.code];
    const meta = _meta[lang.code];
    if (!strs || !meta) continue;
    const langKeys = _collectKeys(strs, '');
    const langKeySet = new Set(langKeys);
    const missing = enKeys.filter(k => !langKeySet.has(k));
    let stale;
    if (meta.hashes) {
      // Hash-based: compare stored English hash to current. Mismatch = stale.
      // Skip keys that aren't translated (already counted as missing) and keys
      // translated but never stamped (unknown staleness — don't flag).
      const missingSet = new Set(missing);
      stale = enKeys.filter(k => {
        if (missingSet.has(k)) return false;
        const storedHash = meta.hashes[k];
        if (!storedHash) return false;
        return storedHash !== enHashes[k];
      });
    } else {
      stale = meta.staleKeys || [];
    }
    results[lang.code] = { name: lang.name, missing, stale };
  }
  return results;
}

// Render the language completeness report as a modal
function showLanguageReport() {
  const report = checkLanguageCompleteness();
  const codes = Object.keys(report);
  if (!codes.length) {
    toast(t('toast.no_other_langs'), 'info');
    return;
  }
  let html = '';
  for (const code of codes) {
    const r = report[code];
    const total = _strings.en ? _collectKeys(_strings.en, '').length : 0;
    const translated = total - r.missing.length;
    const pct = total ? Math.round(translated / total * 100) : 0;
    html += `<div style="margin-bottom:16px">
      <h3 style="font-size:14px;margin-bottom:8px">${esc(r.name)} (${code}) — ${pct}% complete</h3>`;
    if (r.missing.length) {
      html += `<details><summary style="cursor:pointer;font-size:12px;color:var(--warn);margin-bottom:4px">${r.missing.length} missing key${r.missing.length !== 1 ? 's' : ''}</summary>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);max-height:200px;overflow-y:auto;padding:8px;background:var(--bg-input);border-radius:var(--radius-sm);margin-top:4px">${r.missing.map(k => esc(k)).join('<br>')}</div></details>`;
    }
    if (r.stale.length) {
      html += `<details><summary style="cursor:pointer;font-size:12px;color:var(--danger);margin-bottom:4px">${r.stale.length} stale key${r.stale.length !== 1 ? 's' : ''} (English changed)</summary>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);max-height:200px;overflow-y:auto;padding:8px;background:var(--bg-input);border-radius:var(--radius-sm);margin-top:4px">${r.stale.map(k => esc(k)).join('<br>')}</div></details>`;
    }
    if (!r.missing.length && !r.stale.length) {
      html += `<div style="font-size:12px;color:var(--success)">Fully up to date!</div>`;
    }
    html += `</div>`;
  }
  openModal(t('l10n.report_title'), html, `<button class="btn" onclick="closeModal()">${t('btn.close')}</button>`);
}

// Hydrate all elements with data-t attributes
function l10nHydrate() {
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    const val = t(key);
    if (val !== key) el.textContent = val; // only update if translation found
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
