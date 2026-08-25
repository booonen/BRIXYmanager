// ============================================================
// COMMAND PALETTE (Ctrl+K)
// ============================================================
// Spotlight-style modal: single free-text query, ranked results across
// actions, tabs, lines, services, stations, other nodes, segments.

const _palette = {
  open: false,
  query: '',
  selected: 0,
  results: [],
  initialized: false,
};

// Category priority — lower number = higher rank.
const _PALETTE_CAT_ORDER = ['pinned', 'recent', 'action', 'tab', 'line', 'service', 'station', 'node', 'segment'];

const _PALETTE_TABS = [
  { id: 'dashboard', icon: '◫', key: 'nav.dashboard' },
  { id: 'nodes', icon: '◉', key: 'nav.nodes' },
  { id: 'segments', icon: '─', key: 'nav.segments' },
  { id: 'modes', icon: '◆', key: 'nav.modes' },
  { id: 'lines', icon: '≡', key: 'nav.lines' },
  { id: 'services', icon: '▷', key: 'nav.services' },
  { id: 'schedule', icon: '◷', key: 'nav.schedule' },
  { id: 'stock', icon: '🚃', key: 'nav.stock' },
  { id: 'map', icon: '🗺', key: 'nav.geomap' },
  { id: 'schematic', icon: '⬡', key: 'nav.railmap' },
  { id: 'animated', icon: '▶', key: 'nav.animated' },
  { id: 'departures', icon: '▤', key: 'nav.departures' },
  { id: 'journey', icon: '⇄', key: 'nav.journey' },
  { id: 'issues', icon: '⚠', key: 'nav.issues' },
  { id: 'settings', icon: '⚙', key: 'nav.settings' },
  { id: 'import-export', icon: '⇅', key: 'nav.import_export' },
];

function _paletteActions() {
  return [
    { id: 'new-node', icon: '+', label: t('pal.new_node'), run: () => { switchTab('nodes'); openNodeModal(); } },
    { id: 'new-segment', icon: '+', label: t('pal.new_segment'), run: () => { switchTab('segments'); openSegmentModal(); } },
    { id: 'new-service', icon: '+', label: t('pal.new_service'), run: () => { switchTab('services'); openServiceModal(); } },
    { id: 'new-line', icon: '+', label: t('pal.new_line'), run: () => { switchTab('lines'); openLineModal(); } },
    { id: 'new-mode', icon: '+', label: t('pal.new_mode'), run: () => { switchTab('modes'); openCategoryModal(); } },
    { id: 'new-stock', icon: '+', label: t('pal.new_stock'), run: () => { switchTab('stock'); openStockModal(); } },
    { id: 'save', icon: '💾', label: t('pal.save'), run: () => { flushSave(); toast(t('pal.saved'), 'success'); } },
    { id: 'new-system', icon: '✦', label: t('pal.new_system'), run: () => { newSystem(); } },
  ];
}

// ---- Scoring ----

// Returns { score, hits } where score is 0 if no match. Higher = better.
// Word boundaries: start of string, after space/dash/slash/_/( etc.
function _paletteScore(label, q) {
  if (!q) return { score: 1, hits: [] };
  const ls = stripDiacritics(label).toLowerCase();
  const qs = stripDiacritics(q).toLowerCase().trim();
  if (!qs) return { score: 1, hits: [] };

  // Exact prefix on full string
  if (ls.startsWith(qs)) return { score: 1000 - (ls.length - qs.length), hits: [[0, qs.length]] };

  // Word-start match anywhere in string
  let bestWordStart = -1;
  for (let i = 0; i < ls.length; i++) {
    if (i === 0 || /[\s\-_/().,]/.test(ls[i - 1])) {
      if (ls.substr(i, qs.length) === qs) { bestWordStart = i; break; }
    }
  }
  if (bestWordStart >= 0) return { score: 700 - bestWordStart, hits: [[bestWordStart, qs.length]] };

  // Substring match
  const idx = ls.indexOf(qs);
  if (idx >= 0) return { score: 400 - idx, hits: [[idx, qs.length]] };

  // Multi-token: split query on whitespace, every token must appear
  const tokens = qs.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const hits = [];
    let total = 0;
    for (const tok of tokens) {
      const pos = ls.indexOf(tok);
      if (pos < 0) return { score: 0, hits: [] };
      hits.push([pos, tok.length]);
      total += 200 - pos;
    }
    return { score: total, hits };
  }
  return { score: 0, hits: [] };
}

// ---- Build candidate set ----

function _paletteBuild(q) {
  const out = [];

  // Pinned + recent entities — surfaced on empty query only
  if ((!q || !q.trim()) && typeof pinList === 'function') {
    const pins = pinList();
    const recents = recentList().filter(r => !pins.some(p => p.kind === r.kind && p.id === r.id)).slice(0, 6);
    const push = (r, cat, score) => {
      const k = _ENTITY_KINDS[r.kind];
      out.push({ cat, icon: k.icon, label: k.nameOf(r.id) || '?', secondary: '', score, hits: [],
        run: () => gotoEntity(r.kind, r.id) });
    };
    pins.forEach((p, i) => push(p, 'pinned', 1000 - i));
    recents.forEach((r, i) => push(r, 'recent', 1000 - i));
  }

  // Actions
  for (const a of _paletteActions()) {
    const sc = _paletteScore(a.label, q);
    if (sc.score > 0) out.push({ cat: 'action', icon: a.icon, label: a.label, secondary: '', score: sc.score, hits: sc.hits, run: a.run });
  }

  // Tabs
  for (const tab of _PALETTE_TABS) {
    const lbl = t('pal.goto_prefix') + t(tab.key);
    const sc = _paletteScore(lbl, q);
    if (sc.score > 0) {
      out.push({ cat: 'tab', icon: tab.icon, label: lbl, secondary: '', score: sc.score, hits: sc.hits, run: () => switchTab(tab.id) });
    }
  }

  // Lines
  for (const g of (data.serviceGroups || [])) {
    const sc = _paletteScore(g.name, q);
    if (sc.score > 0) {
      const svcCount = (data.services || []).filter(s => s.groupId === g.id).length;
      out.push({
        cat: 'line', icon: '', label: g.name,
        secondary: svcCount === 1 ? t('pal.services_one') : t('pal.services_other', { n: svcCount }),
        color: g.color,
        score: sc.score, hits: sc.hits,
        run: () => { switchTab('lines'); showLineDetail(g.id); },
      });
    }
  }

  // Services
  for (const svc of (data.services || [])) {
    const sc = _paletteScore(svc.name, q);
    if (sc.score > 0) {
      const grp = getGroup(svc.groupId);
      out.push({
        cat: 'service', icon: '▷', label: svc.name,
        secondary: grp ? grp.name : '',
        color: grp ? grp.color : null,
        score: sc.score, hits: sc.hits,
        run: () => { switchTab('services'); showServiceDetail(svc.id); },
      });
    }
  }

  // Stations (passenger stops + bus stops)
  for (const n of (data.nodes || [])) {
    if (!isPassengerStop(n)) continue;
    const sc = _paletteScore(n.name, q);
    if (sc.score > 0) {
      out.push({
        cat: 'station', icon: n.type === 'bus_stop' ? '◎' : '◉', label: n.name,
        secondary: (n.platforms || []).length ? ((n.platforms || []).length === 1 ? t('pal.platforms_one') : t('pal.platforms_other', { n: (n.platforms || []).length })) : (t('type.' + n.type) || n.type),
        score: sc.score, hits: sc.hits,
        run: () => { switchTab('nodes'); showNodeDetail(n.id); },
      });
    }
  }

  // Other nodes (junctions, depots, freight yards, waypoints)
  for (const n of (data.nodes || [])) {
    if (isPassengerStop(n)) continue;
    const sc = _paletteScore(n.name, q);
    if (sc.score > 0) {
      out.push({
        cat: 'node', icon: n.type === 'junction' ? '◇' : (n.type === 'depot' ? '◰' : (n.type === 'freight_yard' ? '◫' : '·')),
        label: n.name,
        secondary: t('type.' + n.type) || n.type,
        score: sc.score, hits: sc.hits,
        run: () => { switchTab('nodes'); showNodeDetail(n.id); },
      });
    }
  }

  // Segments
  for (const seg of (data.segments || [])) {
    const a = getNode(seg.nodeA), b = getNode(seg.nodeB);
    if (!a || !b) continue;
    const segLabel = `${a.name} – ${b.name}`;
    const sc = _paletteScore(segLabel, q);
    if (sc.score > 0) {
      const kind = isInterchange(seg) ? (seg.interchangeType ? seg.interchangeType.toUpperCase() : t('pal.kind_interchange')) : (isRoad(seg) ? t('pal.kind_road') : t('pal.kind_track'));
      out.push({
        cat: 'segment', icon: isInterchange(seg) ? '⇆' : (isRoad(seg) ? '═' : '─'),
        label: segLabel,
        secondary: seg.distance != null ? `${seg.distance.toFixed ? seg.distance.toFixed(1) : seg.distance} km · ${kind}` : kind,
        score: sc.score, hits: sc.hits,
        run: () => { switchTab('segments'); showSegmentDetail(seg.id); },
      });
    }
  }

  // Sort: category priority first, then score desc, then label asc.
  out.sort((x, y) => {
    const cx = _PALETTE_CAT_ORDER.indexOf(x.cat), cy = _PALETTE_CAT_ORDER.indexOf(y.cat);
    if (cx !== cy) return cx - cy;
    if (x.score !== y.score) return y.score - x.score;
    return x.label.localeCompare(y.label);
  });

  // Cap to 60 to keep DOM responsive on huge datasets
  return out.slice(0, 60);
}

// ---- Render ----

const _PALETTE_CAT_LABELS = {
  pinned: 'pal.cat_pinned', recent: 'pal.cat_recent',
  action: 'pal.cat_action', tab: 'pal.cat_tab', line: 'pal.cat_line',
  service: 'pal.cat_service', station: 'pal.cat_station', node: 'pal.cat_node', segment: 'pal.cat_segment',
};

function _paletteEscapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function _paletteHighlight(label, hits) {
  if (!hits || !hits.length) return _paletteEscapeHtml(label);
  // Merge overlapping hits; render with <mark>
  const sorted = hits.slice().sort((a, b) => a[0] - b[0]);
  let out = '', cur = 0;
  for (const [start, len] of sorted) {
    if (start < cur) continue;
    out += _paletteEscapeHtml(label.substring(cur, start));
    out += `<mark>${_paletteEscapeHtml(label.substr(start, len))}</mark>`;
    cur = start + len;
  }
  out += _paletteEscapeHtml(label.substring(cur));
  return out;
}

function _paletteRenderResults() {
  const list = document.getElementById('palette-results');
  if (!list) return;
  const r = _palette.results;
  if (!r.length) {
    list.innerHTML = `<div class="palette-empty">${_palette.query ? t('pal.no_results') : t('pal.empty_hint')}</div>`;
    return;
  }
  let html = '';
  let lastCat = null;
  r.forEach((row, i) => {
    if (row.cat !== lastCat) {
      html += `<div class="palette-section">${_PALETTE_CAT_LABELS[row.cat] ? t(_PALETTE_CAT_LABELS[row.cat]) : row.cat}</div>`;
      lastCat = row.cat;
    }
    const colorChip = row.color ? `<span class="palette-color" style="background:${row.color}"></span>` : '';
    const iconHtml = row.icon ? `<span class="palette-icon">${_paletteEscapeHtml(row.icon)}</span>` : (row.color ? '' : '<span class="palette-icon"></span>');
    html += `<div class="palette-row${i === _palette.selected ? ' selected' : ''}" data-idx="${i}">
      ${colorChip}${iconHtml}
      <span class="palette-label">${_paletteHighlight(row.label, row.hits)}</span>
      <span class="palette-secondary">${_paletteEscapeHtml(row.secondary || '')}</span>
    </div>`;
  });
  list.innerHTML = html;

  // Scroll selected into view
  const sel = list.querySelector('.palette-row.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

// ---- Open / close / activate ----

function paletteOpen() {
  if (_palette.open) return;
  _palette.open = true;
  _palette.query = '';
  _palette.selected = 0;
  _palette.results = _paletteBuild('');
  const overlay = document.getElementById('palette-overlay');
  const input = document.getElementById('palette-input');
  if (!overlay || !input) return;
  overlay.classList.add('open');
  input.value = '';
  _paletteRenderResults();
  setTimeout(() => input.focus(), 10);
}

function paletteClose() {
  if (!_palette.open) return;
  _palette.open = false;
  const overlay = document.getElementById('palette-overlay');
  if (overlay) overlay.classList.remove('open');
  const input = document.getElementById('palette-input');
  if (input) input.blur();
}

function paletteToggle() {
  if (_palette.open) paletteClose(); else paletteOpen();
}

function _paletteActivate(idx) {
  const row = _palette.results[idx];
  if (!row) return;
  paletteClose();
  try { row.run(); } catch (e) { console.error('Palette action failed:', e); }
}

// ---- Init ----

function paletteInit() {
  if (_palette.initialized) return;
  _palette.initialized = true;

  const input = document.getElementById('palette-input');
  const overlay = document.getElementById('palette-overlay');
  const list = document.getElementById('palette-results');
  if (!input || !overlay || !list) return;

  input.addEventListener('input', () => {
    _palette.query = input.value;
    _palette.selected = 0;
    _palette.results = _paletteBuild(_palette.query);
    _paletteRenderResults();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); paletteClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (_palette.results.length) { _palette.selected = (_palette.selected + 1) % _palette.results.length; _paletteRenderResults(); } return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (_palette.results.length) { _palette.selected = (_palette.selected - 1 + _palette.results.length) % _palette.results.length; _paletteRenderResults(); } return; }
    if (e.key === 'Enter') { e.preventDefault(); _paletteActivate(_palette.selected); return; }
  });

  list.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.palette-row');
    if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    if (Number.isFinite(idx) && idx !== _palette.selected) {
      _palette.selected = idx;
      _paletteRenderResults();
    }
  });

  list.addEventListener('click', (e) => {
    const row = e.target.closest('.palette-row');
    if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    if (Number.isFinite(idx)) _paletteActivate(idx);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) paletteClose();
  });

  // Global hotkey
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      paletteToggle();
    }
  });
}
