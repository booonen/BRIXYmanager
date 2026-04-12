// ============================================================
// L10N — Localization system
// ============================================================
// Loaded first. Provides t() for string lookup with {param} interpolation.
// Language files are JS in lang/ directory (e.g., lang/en.js) — thin wrappers
// around JSON data, loaded via <script> tags to avoid file:// CORS issues.
// Hierarchical keys: t('nav.nodes') → _strings[_lang].nav.nodes
// Plurals: use separate keys (toast.fetched_one, toast.fetched_other) — caller picks.
// Static HTML strings: elements with data-t="key" are hydrated by l10nHydrate().

let _lang = 'en';
let _strings = {};
let _availableLanguages = [{ code: 'en', name: 'English' }];

// Called by lang/*.js files to register their string data.
// Language files can include a "_stale" array listing dot-notation key paths
// where English has changed since the translation was last updated.
// When updating a stale translation, remove the key from the _stale array.
function registerLanguage(code, name, strings) {
  const stale = strings._stale || [];
  delete strings._stale;
  _strings[code] = strings;
  _strings[code]._staleKeys = stale;
  if (!_availableLanguages.find(l => l.code === code)) {
    _availableLanguages.push({ code, name });
  }
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

// Collect all dot-notation keys from a nested object
function _collectKeys(obj, prefix) {
  const keys = [];
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      keys.push(..._collectKeys(v, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}

// Check all loaded languages for missing keys (vs English) and stale markers.
// Returns { code: { name, missing: [...], stale: [...] } }
function checkLanguageCompleteness() {
  const enKeys = _strings.en ? _collectKeys(_strings.en, '') : [];
  const results = {};
  for (const lang of _availableLanguages) {
    if (lang.code === 'en') continue;
    const strs = _strings[lang.code];
    if (!strs) continue;
    const langKeys = _collectKeys(strs, '');
    const missing = enKeys.filter(k => !langKeys.includes(k));
    // Stale keys are tracked via _staleKeys set by registerLanguage
    const stale = strs._staleKeys || [];
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
