#!/usr/bin/env node
// Migrate lang/en.js and lang/hs.js to the new per-tab key grouping.
// Writes new en.js + hs.js in place, plus an _aliases map so old call sites
// keep resolving until step 2b rewrites them.
//
// Run from repo root: node tools/migrate-l10n.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ---------- load source language files ----------
// Always read from the git HEAD version, so repeated runs are idempotent and
// don't accumulate alias blocks into the "captured" source.
const { execSync } = require('child_process');
const captured = {};
global.registerLanguage = (code, name, strings) => {
  captured[code] = { name, strings };
};
global.registerAliases = () => {}; // stub: aliases from a previous migration are ignored
eval(execSync('git -C ' + ROOT + ' show HEAD:lang/en.js', { encoding: 'utf8' }));
eval(execSync('git -C ' + ROOT + ' show HEAD:lang/hs.js', { encoding: 'utf8' }));

// ---------- utilities ----------
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function flatten(obj, prefix, out) {
  out = out || {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const full = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) flatten(v, full, out);
    else out[full] = v;
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [key, val] of Object.entries(flat)) {
    const parts = key.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  return out;
}

// ---------- mapping rules ----------
// Keys marked with `null` are dropped (dead or deduplicated).
// Keys mapped to a new path are renamed.
// Keys absent from MAP default to the TOP_RENAME rule for their top-level group.
// Unknown top-level groups are kept unchanged.

const DROP = new Set([
  'app.name',             // hardcoded as "BRIXYmanager" in views.js, never looked up
  'btn.dup_short',        // exact duplicate of btn.duplicate
]);

// Explicit per-key overrides (applied before TOP_RENAME).
const OVERRIDE = {
  // Pre-existing bug: views.js looks up dashboard.welcome_desc but it's defined as btn.welcome_desc.
  'btn.welcome_desc': 'dashboard.welcome_desc',

  // Stat cards on dashboard.
  'btn.stat_bus_stops':  'dashboard.stat.bus_stops',
  'btn.stat_departures': 'dashboard.stat.departures',
  'btn.stat_nodes':      'dashboard.stat.nodes',
  'btn.stat_segments':   'dashboard.stat.segments',
  'btn.stat_services':   'dashboard.stat.services',
  'btn.stat_stations':   'dashboard.stat.stations',
  'btn.stat_stock':      'dashboard.stat.stock',
  'btn.stat_track_km':   'dashboard.stat.track_km',
  'btn.get_started':     'dashboard.btn.get_started',

  // csv.from_match and csv.to_match both say "Matched Node" → unify
  'csv.from_match': 'import_export.csv.matched_node',
  'csv.to_match':   'import_export.csv.matched_node',

  // msg.select_station is nodes-scoped
  'msg.select_station': 'nodes.msg.select_station',

  // Merge duplicates — old keys alias to the canonical new key.
  'placeholder.origin_station':      'journey.origin',
  'placeholder.destination_station': 'journey.destination',
  'matrix.typical':                  'common.typical',
  'matrix.atypical':                 'common.atypical',
  'matrix.disallowed':               'common.disallowed',
};

// Owner lookup: top-level group → { oldTail → newFull }
const OWNERS = {
  field: {
    // Common form fields
    name:                 'common.field.name',
    ref_code:             'common.field.ref_code',
    type:                 'common.field.type',
    description:          'common.field.description',
    // Nodes
    ogf_node:             'nodes.field.ogf_node',
    address:              'nodes.field.address',
    platforms:            'nodes.field.platforms',
    // Segments
    ogf_way_ids:          'segments.field.ogf_way_ids',
    allowed_modes:        'segments.field.allowed_modes',
    allowed_modes_help:   'segments.field.allowed_modes_help',
    auto_trim:            'segments.field.auto_trim',
    no_track_assigned:    'segments.field.no_track',
    segment_type:         'segments.field.segment_type',
    from_node:            'segments.field.from_node',
    to_node:              'segments.field.to_node',
    tracks:               'segments.field.tracks',
    max_speed:            'segments.field.max_speed',
    distance:             'segments.field.distance',
    interchange_type:     'segments.field.interchange_type',
    walk_distance:        'segments.field.walk_distance',
    electrified_label:    'segments.field.electrified',
    waypoint_name:        'segments.field.waypoint_name',
    waypoint_ref:         'segments.field.waypoint_ref',
    waypoint_dist:        'segments.field.waypoint_dist',
    // Lines
    line_name:            'lines.field.name',
    color:                'lines.field.color',
    // Modes
    mode_name:            'modes.field.name',
    abbreviation:         'modes.field.abbreviation',
    default_dwell:        'modes.field.default_dwell',
    plt_clearance:        'modes.field.plt_clearance',
    priority:             'modes.field.priority',
    infrastructure_type:  'modes.field.infrastructure_type',
    clearance_explainer:  'modes.field.clearance_explainer',
    // Stock
    stock_name:           'stock.field.name',
    stock_code:           'stock.field.code',
    acceleration:         'stock.field.acceleration',
    stock_max_speed:      'stock.field.max_speed',
    stock_dwell:          'stock.field.default_dwell',
    stock_traction:       'stock.field.traction',
    stock_desc:           'stock.field.description',
    // Services
    service_name:         'services.field.name',
    service_desc:         'services.field.description',
    mode:                 'services.field.mode',
    rolling_stock:        'services.field.rolling_stock',
    line:                 'services.field.line',
    route:                'services.field.route',
    starting_node:        'services.field.starting_node',
    dwell_s:              'services.field.dwell_s',
    pass:                 'services.field.pass',
    // Schedule
    window_start:         'schedule.field.window_start',
    window_end:           'schedule.field.window_end',
    explicit_times:       'schedule.field.explicit_times',
    stock_override:       'schedule.field.stock_override',
    // Settings
    system_name:          'settings.field.system_name',
    colour_scheme:        'settings.field.colour_scheme',
    walking_speed:        'settings.field.walking_speed',
    transfer_time:        'settings.field.transfer_time',
    day_cutoff:           'settings.field.day_cutoff',
    default_plt_clearance:'settings.field.default_plt_clearance',
    default_accel:        'settings.field.default_accel',
    default_dwell_time:   'settings.field.default_dwell_time',
    default_platforms:    'settings.field.default_platforms',
  },

  th: {
    // Common
    name:         'common.th.name',
    ref:          'common.th.ref',
    type:         'common.th.type',
    description:  'common.th.description',
    deps:         'common.th.deps',
    // Nodes
    platforms:    'nodes.th.platforms',
    connections:  'nodes.th.connections',
    ogf:          'nodes.th.ogf',
    coords:       'nodes.th.coords',
    schematic:    'nodes.th.schematic',
    // Segments
    from:         'segments.th.from',
    to:           'segments.th.to',
    tracks:       'segments.th.tracks',
    speed:        'segments.th.speed',
    distance:     'segments.th.distance',
    electrification: 'segments.th.electrification',
    traffic:      'segments.th.traffic',
    // Lines
    color:        'lines.th.color',
    services:     'lines.th.services',
    departures:   'lines.th.departures',
    stations:     'lines.th.stations',
    segments:     'lines.th.segments',
    // Modes
    abbreviation: 'modes.th.abbreviation',
    default_dwell:'modes.th.default_dwell',
    plt_clearance:'modes.th.plt_clearance',
    priority:     'modes.th.priority',
    // Stock
    acceleration: 'stock.th.acceleration',
    max_speed:    'stock.th.max_speed',
    dwell:        'stock.th.dwell',
    traction:     'stock.th.traction',
    // Services
    mode:         'services.th.mode',
    stock:        'services.th.stock',
    stops:        'services.th.stops',
    route:        'services.th.route',
    pattern:      'services.th.pattern',
    line:         'services.th.line',
    origin_dest:  'services.th.origin_dest',
    frequency:    'services.th.frequency',
    // Schedule
    dep_time:     'schedule.th.dep_time',
    arrival:      'schedule.th.arrival',
    arrive:       'schedule.th.arrive',
    depart:       'schedule.th.depart',
    best_start:   'schedule.th.best_start',
    conflicts:    'schedule.th.conflicts',
    service_id:   'schedule.th.service_id',
    service:      'schedule.th.service',
    filter_service:'schedule.th.filter_service',
    // Railmap schematic
    direction:    'railmap.th.direction',
    seg_towards:  'railmap.th.seg_towards',
    enter:        'railmap.th.enter',
    exit:         'railmap.th.exit',
    // Misc
    cat:          'common.th.cat',
  },

  label: {
    // Common
    select_default:     'common.select',
    none_default:       'common.none_default',
    language:           'common.language',
    code:               'common.label.code',
    per_day:            'common.label.per_day',
    // Nodes
    ref_code_optional:  'nodes.label.ref_code_optional',
    // Segments
    split_segment:      'segments.label.split_segment',
    from_node_label:    'segments.label.from_node',
    to_node_label:      'segments.label.to_node',
    // Lines
    services_count:     'lines.label.services_count',
    // Schedule
    orphaned_deps:      'schedule.label.orphaned_deps',
    availability_timeline: 'schedule.label.availability_timeline',
    clear_existing:     'schedule.label.clear_existing',
    all_services:       'schedule.label.all_services',
    // Departures board
    station:            'departures.label.station',
    platform:           'departures.label.platform',
    platf:              'departures.label.platf',
    board:              'departures.label.board',
    all_platforms:      'departures.label.all_platforms',
    all_lines:          'departures.label.all_lines',
    // Journey
    depart_after:       'journey.label.depart_after',
    from:               'journey.label.from',
    to:                 'journey.label.to',
    date:               'journey.label.date',
    time:               'journey.label.time',
    // Railmap
    pick_start_node:    'railmap.label.pick_start_node',
    unplaced:           'railmap.label.unplaced',
    junction_schematic: 'railmap.label.junction_schematic',
    station_schematic:  'railmap.label.station_schematic',
    waypoint_schematic: 'railmap.label.waypoint_schematic',
    // Settings
    individual_issue_types: 'settings.label.individual_issue_types',
  },

  placeholder: {
    // Common
    search:             'common.placeholder.search',
    // Nodes
    search_nodes:       'nodes.placeholder.search',
    eg_station:         'nodes.placeholder.eg_name',
    eg_ref:             'nodes.placeholder.eg_ref',
    eg_ogf_id:          'nodes.placeholder.eg_ogf_id',
    eg_description:     'nodes.placeholder.eg_description',
    // Segments
    search_segments:    'segments.placeholder.search',
    eg_seg_ref:         'segments.placeholder.eg_ref',
    eg_ogf_ways:        'segments.placeholder.eg_ogf_ways',
    eg_walk_dist:       'segments.placeholder.eg_walk_dist',
    eg_seg_desc_interchange: 'segments.placeholder.eg_desc_interchange',
    eg_seg_desc_track:  'segments.placeholder.eg_desc_track',
    eg_waypoint:        'segments.placeholder.eg_waypoint',
    eg_wp_ref:          'segments.placeholder.eg_wp_ref',
    // Lines
    search_lines:       'lines.placeholder.search',
    eg_line:            'lines.placeholder.eg_name',
    eg_line_name:       'lines.placeholder.eg_name_short',
    // Modes
    eg_mode:            'modes.placeholder.eg_name',
    eg_mode_abbr:       'modes.placeholder.eg_abbr',
    // Stock
    eg_stock_name:      'stock.placeholder.eg_name',
    eg_stock_code:      'stock.placeholder.eg_code',
    eg_stock_desc:      'stock.placeholder.eg_desc',
    // Services
    search_services:    'services.placeholder.search',
    eg_service:         'services.placeholder.eg_name',
    eg_service_desc:    'services.placeholder.eg_desc',
    // Schedule
    eg_times:           'schedule.placeholder.eg_times',
    // Settings
    eg_system_name:     'settings.placeholder.eg_system_name',
  },

  toast: {
    // Common
    name_required:         'common.toast.name_required',
    // l10n
    lang_not_found:        'l10n.toast.lang_not_found',
    no_other_langs:        'l10n.toast.no_other_langs',
    // Import/Export + save manager
    data_exported:         'import_export.toast.data_exported',
    duplicated:            'import_export.toast.save_duplicated',
    imported:              'import_export.toast.imported',
    invalid_json:          'import_export.toast.invalid_json',
    loaded:                'import_export.toast.loaded',
    new_system:            'import_export.toast.new_system',
    save_deleted:          'import_export.toast.save_deleted',
    // Settings
    theme_coming:          'settings.toast.theme_coming',
    // Nodes
    no_coords:             'nodes.toast.no_coords',
    node_added:            'nodes.toast.added',
    node_deleted:          'nodes.toast.deleted',
    node_updated:          'nodes.toast.updated',
    ogf_error:             'nodes.toast.ogf_error',
    ogf_fetched_one:       'nodes.toast.ogf_fetched_one',
    ogf_fetched_other:     'nodes.toast.ogf_fetched_other',
    ogf_fetching_one:      'nodes.toast.ogf_fetching_one',
    ogf_fetching_other:    'nodes.toast.ogf_fetching_other',
    ogf_no_ids:            'nodes.toast.ogf_no_ids',
    ogf_none_found:        'nodes.toast.ogf_none_found',
    // Segments (+ way-fetching lives here since it's segment geometry)
    dist_positive:         'segments.toast.dist_positive',
    dist_range:            'segments.toast.dist_range',
    interchange_added:     'segments.toast.interchange_added',
    interchange_updated:   'segments.toast.interchange_updated',
    nodes_must_differ:     'segments.toast.nodes_must_differ',
    segment_added:         'segments.toast.added',
    segment_deleted:       'segments.toast.deleted',
    segment_updated:       'segments.toast.updated',
    select_both_nodes:     'segments.toast.select_both_nodes',
    snap_warn:             'segments.toast.snap_warn',
    speed_positive:        'segments.toast.speed_positive',
    tracks_min_one:        'segments.toast.tracks_min_one',
    walk_dist_positive:    'segments.toast.walk_dist_positive',
    way_fetch_error:       'segments.toast.way_fetch_error',
    way_fetch_missing:     'segments.toast.way_fetch_missing',
    way_fetch_none:        'segments.toast.way_fetch_none',
    way_fetch_ok:          'segments.toast.way_fetch_ok',
    way_fetch_stitch_gap:  'segments.toast.way_fetch_stitch_gap',
    way_fetching:          'segments.toast.way_fetching',
    way_speed_conflict:    'segments.toast.way_speed_conflict',
    waypoint_inserted:     'segments.toast.waypoint_inserted',
    // Lines
    line_added:            'lines.toast.added',
    line_created:          'lines.toast.created',
    line_deleted:          'lines.toast.deleted',
    line_updated:          'lines.toast.updated',
    // Modes
    accel_positive:        'modes.toast.accel_positive',
    mode_added:            'modes.toast.added',
    mode_deleted:          'modes.toast.deleted',
    mode_updated:          'modes.toast.updated',
    // Stock
    maxspeed_positive:     'stock.toast.maxspeed_positive',
    stock_added:           'stock.toast.added',
    stock_deleted:         'stock.toast.deleted',
    stock_updated:         'stock.toast.updated',
    // Services
    min_two_stops:         'services.toast.min_two_stops',
    reversed_created:      'services.toast.reversed_created',
    service_added:         'services.toast.added',
    service_deleted:       'services.toast.deleted',
    service_duplicated:    'services.toast.duplicated',
    service_updated:       'services.toast.updated',
    svc_needs_stops:       'services.toast.svc_needs_stops',
    variant_created:       'services.toast.variant_created',
    // Schedule
    dep_deleted:           'schedule.toast.dep_deleted',
    dep_updated:           'schedule.toast.dep_updated',
    deps_added:            'schedule.toast.deps_added',
    deps_replaced:         'schedule.toast.deps_replaced',
    enter_times:           'schedule.toast.enter_times',
    invalid_time:          'schedule.toast.invalid_time',
    orphans_removed:       'schedule.toast.orphans_removed',
    recalc_done:           'schedule.toast.recalc_done',
    // Railmap
    schematic_saved:       'railmap.toast.saved',
    // Journey
    origin_dest_differ:    'journey.toast.origin_dest_differ',
    select_origin_dest:    'journey.toast.select_origin_dest',
  },

  modal: {
    edit_node:       'nodes.modal.edit_title',
    add_node:        'nodes.modal.add_title',
    edit_segment:    'segments.modal.edit_title',
    add_segment:     'segments.modal.add_title',
    insert_waypoint: 'segments.modal.insert_waypoint_title',
    edit_line:       'lines.modal.edit_title',
    add_line:        'lines.modal.add_title',
    new_line:        'lines.modal.new_title',
    edit_mode:       'modes.modal.edit_title',
    add_mode:        'modes.modal.add_title',
    edit_stock:      'stock.modal.edit_title',
    add_stock:       'stock.modal.add_title',
    edit_service:    'services.modal.edit_title',
    add_service:     'services.modal.add_title',
    schematic:       'railmap.modal.title',
    schedule:        'schedule.modal.title',
    edit_dep:        'schedule.modal.edit_dep_title',
  },

  confirm: {
    delete_node:    'nodes.confirm.delete',
    delete_segment: 'segments.confirm.delete',
    delete_line:    'lines.confirm.delete',
    delete_mode:    'modes.confirm.delete',
    delete_stock:   'stock.confirm.delete',
    delete_service: 'services.confirm.delete',
    delete_orphans: 'schedule.confirm.delete_orphans',
    recalc_all:     'schedule.confirm.recalc_all',
    apply_schedule: 'schedule.confirm.apply',
  },

  empty: {
    no_nodes:                    'nodes.empty.none',
    no_nodes_desc:               'nodes.empty.none_desc',
    no_further_connections:      'nodes.empty.no_further_connections',
    no_segments:                 'segments.empty.none',
    no_segments_desc:            'segments.empty.none_desc',
    no_seg_services:             'segments.empty.no_services',
    no_lines:                    'lines.empty.none',
    no_lines_match:              'lines.empty.no_match',
    no_line_services:            'lines.empty.no_services',
    no_line_segments:            'lines.empty.no_segments',
    no_modes:                    'modes.empty.none',
    no_modes_desc:               'modes.empty.none_desc',
    no_stock:                    'stock.empty.none',
    no_services:                 'services.empty.none',
    no_stops:                    'services.empty.no_stops',
    no_departures:               'schedule.empty.no_departures',
    no_departures_gen:           'schedule.empty.no_departures_gen',
    no_scheduled_trains:         'schedule.empty.no_scheduled',
    no_services_schedule:        'schedule.empty.no_services',
    no_services_schedule_desc:   'schedule.empty.no_services_desc',
    no_services_at_time:         'departures.empty.no_services_at_time',
    no_stations_defined:         'railmap.empty.no_stations',
    all_placed:                  'railmap.empty.all_placed',
  },

  seg: {
    track_segment:       'segments.type.track',
    walking_interchange: 'segments.type.walking',
    osi:                 'segments.type.osi',
    isi:                 'segments.type.isi',
    none:                'segments.type.none',
    prepend_before:      'services.route.prepend_before',
    extend_to:           'services.route.extend_to',
    type_track_display:  'segments.type.track_short',
    type_osi_display:    'segments.type.osi_short',
    type_isi_display:    'segments.type.isi_short',
  },

  tooltip: {
    fetch_ogf:          'nodes.tooltip.fetch_ogf',
    ogf_linked:         'nodes.tooltip.ogf_linked',
    schematic_defined:  'nodes.tooltip.schematic_defined',
    fit_map:            'geomap.tooltip.fit_map',
    fit_all_nodes:      'railmap.tooltip.fit_all',
    zoom_in:            'railmap.tooltip.zoom_in',
    zoom_out:           'railmap.tooltip.zoom_out',
    set_current_time:   'common.tooltip.set_current_time',
    swap_stations:      'journey.tooltip.swap',
    reverse_service:    'services.tooltip.reverse',
    duplicate_service:  'services.tooltip.duplicate',
  },

  btn: {
    // Common
    apply:            'common.btn.apply',
    back:             'common.btn.back',
    cancel:           'common.btn.cancel',
    close:            'common.btn.close',
    confirm:          'common.btn.confirm',
    delete:           'common.btn.delete',
    duplicate:        'common.btn.duplicate',
    edit:             'common.btn.edit',
    fit:              'common.btn.fit',
    load:             'common.btn.load',
    next:             'common.btn.next',
    now:              'common.btn.now',
    remove:           'common.btn.remove',
    rename:           'common.btn.rename',
    reverse:          'common.btn.reverse',
    save:             'common.btn.save',
    saves:            'common.btn.saves',
    search:           'common.btn.search',
    swap:             'common.btn.swap',
    today:            'common.btn.today',
    // Per-tab
    add_departures:   'schedule.btn.add_departures',
    add_line:         'lines.btn.add',
    add_mode:         'modes.btn.add',
    add_node:         'nodes.btn.add',
    add_platform:     'nodes.btn.add_platform',
    add_segment:      'segments.btn.add',
    add_service:      'services.btn.add',
    add_stock:        'stock.btn.add',
    add_track:        'railmap.btn.add_track',
    arrivals:         'departures.btn.arrivals',
    clear_route:      'services.btn.clear_route',
    create_schematic: 'railmap.btn.create_schematic',
    delete_orphans:   'schedule.btn.delete_orphans',
    departures:       'departures.btn.departures',
    earlier:          'journey.btn.earlier',
    edit_schematic:   'railmap.btn.edit_schematic',
    edit_times:       'schedule.btn.edit_times',
    export_json:      'import_export.btn.export_json',
    gen_schedule:     'schedule.btn.gen',
    import_json:      'import_export.btn.import_json',
    later:            'journey.btn.later',
    new_line_short:   'lines.btn.new_short',
    new_system:       'import_export.btn.new_system',
    recalc_all:       'schedule.btn.recalc_all',
    recalculate:      'schedule.btn.recalculate',
    recheck:          'issues.btn.recheck',
    replace_schedule: 'schedule.btn.replace_schedule',
    show_map_tiles:   'geomap.btn.show_map_tiles',
    update_coords:    'nodes.btn.update_coords',
  },
};

// Top-level group renames (applied to tail after OVERRIDE/OWNERS miss).
// Returns the new full key, or null to drop.
const TOP_RENAME = {
  app:         null,  // handled by DROP
  nav:         t => `nav.${t}`,
  nav_section: t => `nav_section.${t}`,
  page:        t => `${t}.title`,         // page.nodes → nodes.title
  subtitle:    t => `${t}.subtitle`,      // subtitle.nodes → nodes.subtitle
  common:      t => `common.${t}`,
  type:        t => `type.${t}`,
  pattern:     t => `pattern.${t}`,
  hint:        t => `hint.${t}`,
  l10n:        t => `l10n.${t}`,
  dashboard:   t => `dashboard.${t}`,
  settings:    t => `settings.${t}`,
  geomap:      t => `geomap.${t}`,
  msg:         t => `common.msg.${t}`,
  // Detail views fold into their owning tab
  node_detail: t => `nodes.detail.${t}`,
  seg_detail:  t => `segments.detail.${t}`,
  svc_detail:  t => `services.detail.${t}`,
  // Schematic editor = Railmap tab
  schematic:   t => `railmap.${t}`,
  // Schedule sub-group
  sch:         t => `schedule.${t}`,
  // Departures
  dep_board:   t => `departures.board.${t}`,
  dep_edit:    t => `departures.edit.${t}`,
  // Journey planner
  jp:          t => `journey.${t}`,
  jp_detail:   t => `journey.detail.${t}`,
  // Issues
  issue:       t => `issues.${t}`,
  issue_hidden:t => `issues.hidden.${t}`,
  resolve:     t => `issues.resolve.${t}`,
  // Stock matrix
  matrix:      t => `stock.matrix.${t}`,
  // Import/Export
  ie:          t => `import_export.${t}`,
  csv:         t => `import_export.csv.${t}`,
  rel:         t => `import_export.rel.${t}`,
  save_mgr:    t => `import_export.saves.${t}`,
  // Widgets
  node_picker: t => `common.node_picker.${t}`,
};

// ---------- apply mapping ----------
const enFlat = flatten(captured.en.strings);
const hsFlat = flatten(captured.hs.strings);

function migrate(oldKey) {
  if (DROP.has(oldKey)) return null;
  if (oldKey in OVERRIDE) return OVERRIDE[oldKey];
  const [top, ...rest] = oldKey.split('.');
  const tail = rest.join('.');
  if (OWNERS[top] && tail in OWNERS[top]) return OWNERS[top][tail];
  if (top in TOP_RENAME) {
    const rule = TOP_RENAME[top];
    return rule === null ? null : rule(tail);
  }
  // Unknown top-level group — pass through unchanged and flag.
  console.error(`[migrate] no rule for top-level group "${top}" (key "${oldKey}") — kept as-is`);
  return oldKey;
}

// Build old→new map for all English keys
const renameMap = {};
const unmappedBuckets = {};
for (const oldKey of Object.keys(enFlat)) {
  const newKey = migrate(oldKey);
  renameMap[oldKey] = newKey;
  if (newKey === oldKey) {
    // pass-through (likely unmapped); group by top-level for reporting
    const top = oldKey.split('.')[0];
    unmappedBuckets[top] = (unmappedBuckets[top] || 0) + 1;
  }
}

// Surface what's still unmapped so we can add owner tables iteratively.
console.error('\n== unmapped top-level groups (need owner tables) ==');
const sorted = Object.entries(unmappedBuckets).sort((a, b) => b[1] - a[1]);
for (const [k, n] of sorted) console.error(`  ${k}: ${n}`);
console.error(`\ntotal dropped: ${Object.values(renameMap).filter(v => v === null).length}`);
console.error(`total renamed: ${Object.values(renameMap).filter((v, i) => v !== null && v !== Object.keys(renameMap)[i]).length}`);
console.error(`total unchanged: ${Object.values(renameMap).filter((v, i) => v === Object.keys(renameMap)[i]).length}`);
console.error(`total: ${Object.keys(renameMap).length}`);

// Stop here on first run — we want to see the unmapped buckets before
// committing to apply. Pass --apply to actually write files.
if (!process.argv.includes('--apply')) {
  console.error('\n(dry run — pass --apply to write files)');
  process.exit(0);
}

// ---------- apply: rewrite en.js and hs.js ----------

// Build new-flat maps, alias map (old → new), and fresh hashes.
const newEnFlat = {};
const aliases = {};
for (const [oldKey, val] of Object.entries(enFlat)) {
  const newKey = renameMap[oldKey];
  if (newKey === null) continue;      // dropped
  newEnFlat[newKey] = val;            // duplicates collapse; values are identical by construction
  if (newKey !== oldKey) aliases[oldKey] = newKey;
}

// For hs: apply the same rename, but only to keys hs actually translates.
// Also remap its _hashes map (hash values unchanged — stayed aligned because
// we're renaming paths, not editing English values).
const oldHsHashes = captured.hs.strings._hashes || {};
const newHsFlat = {};
const newHsHashes = {};
for (const [oldKey, val] of Object.entries(hsFlat)) {
  const newKey = renameMap[oldKey];
  if (!newKey) continue; // dropped
  newHsFlat[newKey] = val;
  if (oldHsHashes[oldKey]) newHsHashes[newKey] = oldHsHashes[oldKey];
}

// ---------- serialize a nested object as pretty JSON ----------
// Produces canonical JSON.stringify output with 2-space indent.
function serializeTree(obj) {
  return JSON.stringify(obj, null, 2);
}

// ---------- write new en.js ----------
const newEnTree = unflatten(newEnFlat);
const enBody = serializeTree(newEnTree);
const enHeader = `// English — default language
// To create a new language: copy this file, rename it (e.g. mycustomlang.js),
// change the registerLanguage call, translate the strings, and add a <script> tag
// in railmanager.html before the init block.
`;
const aliasEntries = Object.keys(aliases).sort()
  .map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(aliases[k])}`)
  .join(',\n');
const aliasBlock = `
// Transitional old-key → new-key aliases. Removed in a later commit once all
// call sites have been updated to use the new keys. See tools/migrate-l10n.js.
registerAliases({
${aliasEntries}
});
`;
fs.writeFileSync(path.join(ROOT, 'lang/en.js'),
  enHeader + `registerLanguage('en', 'English', ${enBody});\n` + aliasBlock);

// ---------- write new hs.js ----------
const newHsTree = unflatten(newHsFlat);
const hsBody = serializeTree(newHsTree);
// Append _hashes at the bottom of the object as a separate property.
// Insert before the closing brace by parsing+reserializing.
const hashLines = Object.keys(newHsHashes).sort()
  .map(k => `    ${JSON.stringify(k)}: ${JSON.stringify(newHsHashes[k])}`)
  .join(',\n');
// Splice hashes into the JSON body: insert `,"_hashes":{...}` before final `}`.
const hsBodyWithHashes = hsBody.replace(/\n\}$/, `,\n  "_hashes": {\n${hashLines}\n  }\n}`);
const hsHeader = `// Hemsteiner
// To create a new language: copy this file, rename it (e.g. mycustomlang.js),
// change the registerLanguage call, translate the strings, and add a <script> tag
// in railmanager.html before the init block.
`;
fs.writeFileSync(path.join(ROOT, 'lang/hs.js'),
  hsHeader + `registerLanguage('hs', 'Hemsteiner', ${hsBodyWithHashes});\n`);

console.error('\nwrote lang/en.js (' + Object.keys(newEnFlat).length + ' keys, '
  + Object.keys(aliases).length + ' aliases)');
console.error('wrote lang/hs.js (' + Object.keys(newHsFlat).length + ' keys, '
  + Object.keys(newHsHashes).length + ' hashes)');
