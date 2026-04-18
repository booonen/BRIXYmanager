// English — default language
// To create a new language: copy this file, rename it (e.g. mycustomlang.js),
// change the registerLanguage call, translate the strings, and add a <script> tag
// in railmanager.html before the init block.
registerLanguage('en', 'English', {
  "nav_section": {
    "network": "Network",
    "operations": "Operations",
    "views": "Views",
    "system": "System"
  },
  "nav": {
    "dashboard": "Dashboard",
    "nodes": "Nodes",
    "segments": "Segments",
    "modes": "Modes",
    "lines": "Lines",
    "services": "Services",
    "schedule": "Schedule",
    "stock": "Stock",
    "geomap": "Geomap",
    "railmap": "Railmap",
    "departures": "Departures",
    "journey": "Journey",
    "issues": "Issues",
    "settings": "Settings",
    "import_export": "Import / Export"
  },
  "dashboard": {
    "title": "Dashboard",
    "subtitle": "Network overview at a glance",
    "welcome_desc": "Start by adding nodes, connect them with segments, define services, and generate schedules.",
    "stat": {
      "nodes": "Nodes",
      "stations": "Stations",
      "bus_stops": "Bus Stops",
      "segments": "Segments",
      "track_km": "Track km",
      "stock": "Stock Types",
      "services": "Services",
      "departures": "Departures"
    },
    "btn": {
      "get_started": "Get Started"
    },
    "welcome": "Welcome to BRIXYmanager",
    "no_lines": "No lines defined yet.",
    "get_started": "Get Started →"
  },
  "nodes": {
    "title": "Nodes",
    "subtitle": "Stations, junctions, waypoints, depots and freight yards",
    "btn": {
      "update_coords": "Update Coords",
      "add": "+ Add Node",
      "add_platform": "+ Add Platform"
    },
    "label": {
      "ref_code_optional": "Ref. Code (optional)"
    },
    "placeholder": {
      "search": "Search nodes...",
      "eg_name": "e.g. Central Station",
      "eg_ref": "e.g. HTC",
      "eg_ogf_id": "e.g. 12345678",
      "eg_description": "e.g. Main terminus, opened 1923"
    },
    "tooltip": {
      "fetch_ogf": "Fetch coordinates from OGF for all nodes with OGF IDs",
      "schematic_defined": "Schematic defined",
      "ogf_linked": "OGF node linked"
    },
    "toast": {
      "ogf_fetched_one": "Fetched coordinates for 1 node",
      "ogf_fetched_other": "Fetched coordinates for {n} nodes",
      "ogf_none_found": "No coordinates found — check OGF node IDs",
      "ogf_error": "OGF API error: {msg}",
      "ogf_no_ids": "No nodes have OGF IDs",
      "ogf_fetching_one": "Fetching coordinates for 1 node...",
      "ogf_fetching_other": "Fetching coordinates for {n} nodes...",
      "updated": "Node updated",
      "added": "Node added",
      "deleted": "Node deleted",
      "no_coords": "No nodes have coordinates"
    },
    "modal": {
      "edit_title": "Edit Node",
      "add_title": "Add Node"
    },
    "confirm": {
      "delete": "Remove \"{name}\"?"
    },
    "th": {
      "platforms": "Platforms",
      "connections": "Conn.",
      "ogf": "OGF",
      "coords": "Coords",
      "schematic": "Sch."
    },
    "field": {
      "ogf_node": "OGF Node ID",
      "address": "Address",
      "platforms": "Platforms"
    },
    "empty": {
      "none": "No nodes yet",
      "none_desc": "Add stations, junctions, waypoints, depots and freight yards to build your network.",
      "no_further_connections": "No further connections from this node."
    },
    "msg": {
      "select_station": "Select a station."
    },
    "detail": {
      "view_departure_board": "View Departure Board",
      "connected_segments": "Connected Segments",
      "services_through": "Services Through This Node",
      "schedule_at": "Schedule at {name}",
      "departures_at": "Departures at {name}"
    }
  },
  "segments": {
    "title": "Segments",
    "subtitle": "Track connections between nodes",
    "btn": {
      "add": "+ Add Segment"
    },
    "label": {
      "split_segment": "Split {name} ({dist} km) by inserting a waypoint.",
      "to_node": "To {name}",
      "from_node": "From {name}"
    },
    "placeholder": {
      "search": "Search segments...",
      "eg_ref": "e.g. SEG-01",
      "eg_ogf_ways": "e.g. 12345, 67890",
      "eg_walk_dist": "e.g. 0.3",
      "eg_desc_interchange": "e.g. Underground passage between stations",
      "eg_desc_track": "e.g. Double-track mainline through river valley",
      "eg_waypoint": "e.g. Waypoint {a}/{b}",
      "eg_wp_ref": "e.g. WP-01"
    },
    "toast": {
      "way_fetch_ok": "Fetched {n} points ({km} km)",
      "way_fetch_stitch_gap": "Warning: {m}m gap between ways — check order",
      "way_fetch_none": "No geometry found for these way IDs",
      "way_fetch_error": "Way fetch failed: {msg}",
      "way_fetching": "Fetching way geometry...",
      "way_speed_conflict": "Ways have different max speeds — set manually",
      "snap_warn": "Endpoint \"{name}\" is {m}m from the nearest way — check way IDs",
      "way_fetch_missing": "Way IDs not found: {ids}",
      "select_both_nodes": "Select both nodes",
      "nodes_must_differ": "Nodes must be different",
      "walk_dist_positive": "Walking distance must be positive",
      "interchange_updated": "Interchange updated",
      "interchange_added": "Interchange added",
      "dist_positive": "Distance must be positive",
      "tracks_min_one": "Tracks must be at least 1",
      "speed_positive": "Speed must be positive",
      "updated": "Segment updated",
      "added": "Segment added",
      "deleted": "Segment deleted",
      "dist_range": "Distance must be between 0 and {max} km",
      "waypoint_inserted": "Waypoint \"{name}\" inserted — segment split into two"
    },
    "modal": {
      "edit_title": "Edit Segment",
      "add_title": "Add Segment",
      "insert_waypoint_title": "Insert Waypoint"
    },
    "confirm": {
      "delete": "Remove segment \"{name}\"?"
    },
    "th": {
      "from": "From",
      "to": "To",
      "tracks": "Tracks",
      "speed": "Speed",
      "distance": "Distance",
      "electrification": "Elec.",
      "traffic": "Traffic"
    },
    "field": {
      "ogf_way_ids": "OGF Way IDs",
      "allowed_modes": "Allowed Modes",
      "allowed_modes_help": "Leave all unchecked to allow all modes. Check specific modes to restrict this segment.",
      "auto_trim": "Trim geometry to endpoints",
      "no_track": "no track",
      "segment_type": "Segment Type",
      "from_node": "From Node",
      "to_node": "To Node",
      "tracks": "Tracks",
      "max_speed": "Max Speed (km/h)",
      "distance": "Distance (km)",
      "interchange_type": "Interchange Type",
      "walk_distance": "Walking Distance (km)",
      "waypoint_name": "Waypoint Name",
      "waypoint_ref": "Ref. Code",
      "waypoint_dist": "Distance from {a} (km)",
      "electrified": "Electrified"
    },
    "type": {
      "track": "Track segment",
      "walking": "Walking interchange",
      "osi": "OSI (Out of Station)",
      "isi": "ISI (In-Station)",
      "none": "None (regular track)",
      "track_short": "Track",
      "osi_short": "OSI",
      "isi_short": "ISI"
    },
    "empty": {
      "none": "No segments yet",
      "none_desc": "Connect nodes with track segments.",
      "no_services": "No services use this segment."
    },
    "detail": {
      "lines_on_segment": "Lines",
      "services_using": "Services Using This Segment",
      "trains_on_segment": "Trains on This Segment",
      "walk_time": "{n} min walk",
      "electrified": "Electrified",
      "not_electrified": "Not electrified",
      "track_info": "{n} tracks",
      "speed_info": "{n} km/h",
      "ogf_ways": "OGF: {n} ways, {pts} points"
    },
    "tooltip": {
      "insert_waypoint": "Insert a waypoint on this segment"
    }
  },
  "lines": {
    "title": "Lines",
    "subtitle": "Service lines with color coding and route coverage",
    "btn": {
      "add": "+ Add Line",
      "new_short": "+ New"
    },
    "label": {
      "services_count": "{n} services"
    },
    "placeholder": {
      "search": "Search lines...",
      "eg_name": "e.g. Northern Line",
      "eg_name_short": "Line name..."
    },
    "toast": {
      "updated": "Line updated",
      "added": "Line added",
      "deleted": "Line deleted",
      "created": "Line \"{name}\" created"
    },
    "modal": {
      "edit_title": "Edit Line",
      "add_title": "Add Line",
      "new_title": "New Line"
    },
    "confirm": {
      "delete": "Remove line \"{name}\"?"
    },
    "th": {
      "color": "Color",
      "services": "Services",
      "departures": "Departures",
      "stations": "Stations",
      "segments": "Segments"
    },
    "field": {
      "name": "Line Name",
      "color": "Color"
    },
    "empty": {
      "none": "No lines yet",
      "no_match": "No lines matching \"{q}\".",
      "no_services": "No services assigned to this line yet.",
      "no_segments": "No segments covered — add services with routes to this line."
    }
  },
  "modes": {
    "title": "Service Modes",
    "subtitle": "Define types of rail services",
    "btn": {
      "add": "+ Add Mode"
    },
    "placeholder": {
      "eg_name": "e.g. Intercity",
      "eg_abbr": "e.g. IC"
    },
    "toast": {
      "updated": "Mode updated",
      "added": "Mode added",
      "deleted": "Mode deleted",
      "accel_positive": "Acceleration must be positive"
    },
    "modal": {
      "edit_title": "Edit Mode",
      "add_title": "Add Mode"
    },
    "confirm": {
      "delete": "Remove mode \"{name}\"?"
    },
    "th": {
      "abbreviation": "Abbr.",
      "default_dwell": "Default Dwell",
      "plt_clearance": "Plt. Clearance",
      "priority": "Priority"
    },
    "field": {
      "name": "Name",
      "abbreviation": "Abbreviation",
      "default_dwell": "Default Dwell (seconds)",
      "plt_clearance": "Platform Clearance (minutes)",
      "priority": "Priority (higher = more important)",
      "infrastructure_type": "Infrastructure Type",
      "clearance_explainer": "Min. time between departures of this mode using the same platform."
    },
    "empty": {
      "none": "No modes yet",
      "none_desc": "Define service modes like Intercity, Commuter, Light Rail, etc."
    }
  },
  "stock": {
    "title": "Rolling Stock",
    "subtitle": "Train types and their properties",
    "btn": {
      "add": "+ Add Stock Type"
    },
    "placeholder": {
      "eg_name": "e.g. ICM, VIRM, Sprinter",
      "eg_code": "e.g. ICM",
      "eg_desc": "e.g. 3-car EMU, used on commuter routes"
    },
    "toast": {
      "maxspeed_positive": "Max speed must be positive",
      "updated": "Stock type updated",
      "added": "Stock type added",
      "deleted": "Stock type deleted"
    },
    "modal": {
      "edit_title": "Edit Stock Type",
      "add_title": "Add Stock Type"
    },
    "confirm": {
      "delete": "Remove stock type \"{name}\"?"
    },
    "th": {
      "acceleration": "Accel.",
      "max_speed": "Max Speed",
      "dwell": "Dwell",
      "traction": "Traction"
    },
    "field": {
      "name": "Name",
      "code": "Code",
      "acceleration": "Acceleration (m/s²)",
      "max_speed": "Max Speed (km/h)",
      "default_dwell": "Default Dwell (s)",
      "traction": "Traction",
      "description": "Description (optional)"
    },
    "empty": {
      "none": "No rolling stock yet"
    },
    "matrix": {
      "title": "Stock-Mode Compatibility Matrix",
      "desc": "Define which stock types are compatible with which service modes.",
      "header": "Stock \\ Mode",
      "typical_desc": "standard for this mode",
      "atypical_desc": "allowed but unusual",
      "disallowed_desc": "not permitted"
    }
  },
  "services": {
    "title": "Services",
    "subtitle": "Route templates defining train paths",
    "btn": {
      "add": "+ Add Service",
      "clear_route": "Clear Route"
    },
    "placeholder": {
      "search": "Search services...",
      "eg_name": "e.g. IC 201",
      "eg_desc": "e.g. Skips West station, runs express to Central Station"
    },
    "tooltip": {
      "reverse": "Create reversed copy",
      "duplicate": "Duplicate service",
      "clear_route": "Clear route",
      "remove_start": "Remove first stop",
      "remove_end": "Remove last stop",
      "mark_pass_through": "Mark as pass-through"
    },
    "toast": {
      "variant_created": "Created variant service: {name}",
      "min_two_stops": "At least 2 stops required",
      "updated": "Service updated",
      "added": "Service added",
      "deleted": "Service deleted",
      "reversed_created": "Created reversed service: {name}",
      "duplicated": "Duplicated: {name}",
      "svc_needs_stops": "Service needs at least 2 stops"
    },
    "modal": {
      "edit_title": "Edit Service",
      "add_title": "Add Service"
    },
    "confirm": {
      "delete": "Remove service \"{name}\"?"
    },
    "th": {
      "route": "Route",
      "line": "Line",
      "pattern": "Pattern",
      "mode": "Mode",
      "stock": "Stock",
      "stops": "Stops",
      "origin_dest": "Origin → Dest.",
      "frequency": "Freq."
    },
    "field": {
      "name": "Service Name",
      "mode": "Mode",
      "rolling_stock": "Rolling Stock",
      "line": "Line",
      "description": "Description (optional)",
      "route": "Route",
      "starting_node": "Starting Node",
      "dwell_s": "Dwell (s)",
      "pass": "Pass"
    },
    "route": {
      "prepend_before": "— Prepend before {name}… —",
      "extend_to": "— Extend route to… —"
    },
    "empty": {
      "none": "No services yet",
      "no_stops": "No stops yet. Pick a starting node below."
    },
    "detail": {
      "route_header": "Route",
      "departures_header": "Departures ({n})",
      "lines_header": "Lines"
    }
  },
  "schedule": {
    "title": "Schedule",
    "subtitle": "Generate and manage departures",
    "btn": {
      "recalc_all": "Recalculate All",
      "recalculate": "Recalculate",
      "gen": "Schedule",
      "edit_times": "Edit Times",
      "delete_orphans": "Delete All Orphaned Departures",
      "add_departures": "Add departures",
      "replace_schedule": "Replace schedule"
    },
    "label": {
      "all_services": "All Services",
      "orphaned_deps": "⚠ Orphaned ({n})",
      "availability_timeline": "Availability Timeline (24h)",
      "clear_existing": "Clear existing departures for this service first"
    },
    "placeholder": {
      "eg_times": "06:00, 06:30, 07:00, 07:30..."
    },
    "toast": {
      "invalid_time": "Invalid time: \"{time}\"",
      "deps_replaced": "Replaced {n} departure(s)",
      "deps_added": "Added {n} departure(s)",
      "recalc_done": "Recalculated {n} departure(s) — manual overrides preserved",
      "orphans_removed": "Removed {n} orphaned departures",
      "enter_times": "Enter at least one time",
      "dep_updated": "Departure updated — times cascaded",
      "dep_deleted": "Departure deleted"
    },
    "modal": {
      "title": "Schedule — {name}",
      "edit_dep_title": "Edit — {name}"
    },
    "confirm": {
      "delete_orphans": "Delete {n} orphaned departure(s)?",
      "recalc_all": "Recalculate all departures? Manual dwell overrides will be preserved, but all travel times will be re-derived from current segment and stock data.",
      "apply": "{action} for {name}: every {freq} min from {start} to {end}?"
    },
    "th": {
      "arrive": "Arr.",
      "depart": "Dep.",
      "service": "Service",
      "dep_time": "Dep. Time",
      "arrival": "Arrival",
      "best_start": "Best Start",
      "conflicts": "Conflicts",
      "service_id": "Service ID",
      "filter_service": "Filter by Service"
    },
    "field": {
      "stock_override": "Stock Override",
      "window_start": "Window Start",
      "window_end": "Window End",
      "explicit_times": "Departure times (comma-separated, e.g. 06:00, 07:30, 09:15)"
    },
    "frequency": "Frequency",
    "explicit": "Explicit Times",
    "free": "Free",
    "partial": "Partial",
    "blocked": "Blocked",
    "clear": "Clear",
    "free_slots": "Free Slots ({n} of 1440 minutes)",
    "conflicts_n_one": "1 conflict",
    "conflicts_n_other": "{n} conflicts",
    "stop_origin": "origin",
    "stop_terminus": "terminus",
    "stop_pass": "pass",
    "platform_override_note": "Overridden for this departure — preserved on recalculate",
    "platform_default_note": "Using service default",
    "dwell_override_note": "Manually overridden — preserved on recalculate",
    "dwell_default_note": "Default dwell time",
    "empty": {
      "no_services": "No services defined",
      "no_services_desc": "Create services first, then generate schedules.",
      "no_departures": "No departures to show.",
      "no_departures_gen": "No departures generated yet.",
      "no_scheduled": "No trains scheduled."
    }
  },
  "geomap": {
    "title": "Geomap",
    "subtitle": "Geographic view of the network",
    "btn": {
      "show_map_tiles": "Show map tiles"
    },
    "tooltip": {
      "fit_map": "Fit map to all nodes"
    },
    "missing_coords": "{n} nodes missing coordinates:",
    "view_node": "View Node",
    "departure_board": "Departure Board",
    "view_departures": "View Departures"
  },
  "departures": {
    "title": "Station Board",
    "subtitle": "View departures and arrivals at any station",
    "btn": {
      "departures": "Departures",
      "arrivals": "Arrivals"
    },
    "label": {
      "station": "Station",
      "board": "Board",
      "platform": "Platform",
      "all_platforms": "All platforms",
      "all_lines": "All lines",
      "platf": "Platf."
    },
    "empty": {
      "no_services_at_time": "No {mode} from {time}"
    },
    "board": {
      "header_departures": "DEPARTURES — {name}",
      "header_arrivals": "ARRIVALS — {name}",
      "col_time": "Time",
      "col_mode": "Mode",
      "col_destination": "Destination",
      "col_origin": "Origin",
      "col_line": "Line",
      "col_plt": "Plt.",
      "via": "via",
      "showing": "Showing {n} · from {time}",
      "search_station": "Search for a station..."
    },
    "edit": {
      "save_cascade": "Save & Cascade",
      "use_default_stock": "Use service default",
      "adjust_desc": "Adjust platforms and dwell times. Dwell changes cascade. Modified dwells (yellow border) are preserved when recalculating.",
      "skip_desc": "Skipping a stop creates a variant service. Platform overrides are per-departure only.",
      "col_station": "Station",
      "col_arrive": "Arrive",
      "col_depart": "Depart",
      "col_dwell": "Dwell",
      "col_platform": "Platform",
      "col_skip": "Skip"
    }
  },
  "journey": {
    "title": "Journey Planner",
    "subtitle": "Find routes between stations",
    "btn": {
      "earlier": "Earlier",
      "later": "Later"
    },
    "label": {
      "time": "Time",
      "date": "Date",
      "from": "From",
      "to": "To",
      "depart_after": "Depart after"
    },
    "origin": "Origin station...",
    "destination": "Destination station...",
    "tooltip": {
      "swap": "Swap"
    },
    "toast": {
      "select_origin_dest": "Select both origin and destination",
      "origin_dest_differ": "Origin and destination must be different"
    },
    "no_journeys": "No journeys found",
    "no_journeys_desc": "No route exists between these stations with the current schedule.",
    "direct": "Direct",
    "transfers_one": "1 transfer",
    "transfers_other": "{n} transfers",
    "no_intermediate": "No intermediate stops",
    "intermediate_one": "1 intermediate stop",
    "intermediate_other": "{n} intermediate stops",
    "transfer_within": "Transfer within station complex",
    "walk_to_station": "Walk to station",
    "transfer_time": "{label} · {min} min transfer",
    "plt": "Plt. {name}",
    "earlier": "← Earlier departures",
    "later": "Later departures →",
    "showing_results": "Showing {start}–{end}",
    "terminus": "Terminus",
    "detail": {
      "total_time": "Total: ~{n} min",
      "transfer": "Transfer",
      "towards": "{line} towards {terminus}",
      "leg_service": "Service",
      "leg_stock": "Stock",
      "leg_line": "Line",
      "leg_terminus": "Terminus"
    }
  },
  "issues": {
    "title": "Issues",
    "subtitle": "Scheduling conflicts, warnings and data quality checks",
    "btn": {
      "recheck": "Re-check"
    },
    "no_issues": "No issues detected",
    "no_issues_desc": "Network and schedule look clean.",
    "hidden_count": "({n} hidden by settings)",
    "click_to_fix": "click to fix",
    "section": {
      "conflicts": "Scheduling Conflicts ({n})",
      "warnings": "Warnings ({n})",
      "data_quality": "Data Quality ({n})"
    },
    "type": {
      "single_track_conflict": "Single Track Conflict",
      "platform_conflict": "Platform Conflict",
      "no_departures": "No Departures",
      "missing_platform": "Missing Platform",
      "no_mode": "No Mode",
      "orphan_departures": "Orphan Departures",
      "electrification_mismatch": "Electrification Mismatch",
      "infra_mismatch": "Infrastructure Mismatch",
      "disallowed_stock_mode": "Disallowed Stock-Mode",
      "no_stock_assigned": "No Stock Assigned",
      "invalid_platform_reference": "Invalid Platform Reference",
      "invalid_platform_override": "Invalid Platform Override",
      "ungrouped_service": "Ungrouped Service",
      "duplicate_name": "Duplicate Name",
      "duplicate_node_name": "Duplicate Node Name",
      "unlinked_station_group": "Unlinked Station Group",
      "duplicate_ref_code": "Duplicate Ref Code",
      "no_platforms": "No Platforms",
      "auto_generated_name": "Auto-generated Name",
      "incomplete_segment": "Incomplete Segment",
      "distance_mismatch": "Distance Mismatch",
      "mode_not_allowed": "Mode Not Allowed on Segment",
      "isolated_node": "Isolated Node",
      "waypoint_connection_count": "Waypoint Connection Count",
      "missing_ogf_node": "Missing OGF Node",
      "schematic_mismatch": "Schematic Mismatch",
      "departure_schematic_mismatch": "Departure Schematic Mismatch",
      "unassigned_platform": "Unassigned Platform",
      "unconnected_segment_track": "Unconnected Segment Track",
      "non_station_stop": "Non-Station Stop",
      "pass_through_terminus": "Pass-Through Terminus",
      "broken_route": "Broken Route",
      "missing_node": "Missing Node",
      "stale_departure": "Stale Departure",
      "duplicate_segment": "Duplicate Segment",
      "cross_cutoff_journey": "Cross-Cutoff Journey",
      "suspicious_segment": "Suspicious Segment",
      "segment_overlap": "Segment Overlap"
    },
    "desc": {
      "single_track_conflict": "{a} and {b} overlap on {from} — {to}",
      "platform_conflict": "{a} and {b} at {station} {platform}",
      "no_departures": "Service \"{name}\" has no generated departures",
      "missing_platform": "\"{name}\" stop at {station} has no platform assigned",
      "no_mode": "Service \"{name}\" has no mode assigned",
      "orphan_departures": "{n} departure(s) reference deleted services",
      "electrification_mismatch": "\"{name}\" uses electric stock \"{stock}\" on non-electrified segment {from} — {to}",
      "infra_mismatch": "\"{name}\" ({mode}, {modeInfra}) uses a {segInfra} segment {from} — {to}",
      "disallowed_stock_mode": "\"{name}\" uses {stock} on mode {mode}, which is marked as disallowed",
      "no_stock_assigned": "Service \"{name}\" has no rolling stock assigned",
      "invalid_platform_reference": "\"{name}\" references a removed platform at \"{station}\"",
      "invalid_platform_override": "Departure of \"{name}\" @ {time} overrides to a removed platform at \"{station}\"",
      "ungrouped_service": "Service \"{name}\" is not assigned to a line",
      "duplicate_name": "{n} services share the name \"{name}\"",
      "duplicate_node_name": "{n} nodes share the name \"{name}\"",
      "unlinked_station_group": "Stations grouped as \"{name}\" are not all connected by interchange segments",
      "duplicate_ref_code_nodes": "{n} nodes share the ref code \"{code}\"",
      "duplicate_ref_code_segs": "{n} segments share the ref code \"{code}\"",
      "no_platforms": "Station \"{name}\" has no platforms defined",
      "auto_generated_name": "Service \"{name}\" still has a placeholder name",
      "incomplete_segment": "{from} — {to} is missing: {problems}",
      "distance_mismatch": "{from} — {to}: stored distance ({stored} km) differs from OGF way geometry ({geo} km)",
      "mode_not_allowed": "\"{name}\" uses mode \"{mode}\" on {from} — {to}, which doesn't allow that mode",
      "isolated_node": "\"{name}\" has no segment connections",
      "waypoint_connection_count": "Waypoint \"{name}\" has {n} connection(s) (expected 2)",
      "missing_ogf_node": "\"{name}\" has no OGF node ID linked",
      "schematic_mismatch": "\"{name}\" uses {platform} at \"{station}\" but no track on that platform connects to the service's route",
      "departure_schematic_mismatch": "Departure of \"{name}\" @ {time} overrides to {platform} at \"{station}\" but no track connects",
      "unassigned_platform": "{platform} at \"{station}\" is not assigned to any track in the schematic",
      "unconnected_segment_track": "Track {n} of segment towards {label} is not connected to any track at \"{station}\"",
      "non_station_stop": "\"{name}\" has {type} \"{station}\" as a stopping point",
      "pass_through_terminus_origin": "\"{name}\" has origin \"{station}\" marked as pass-through",
      "pass_through_terminus_dest": "\"{name}\" has destination \"{station}\" marked as pass-through",
      "broken_route": "\"{name}\" has no segment between {from} and {to}",
      "missing_node": "\"{name}\" references a deleted node at stop {n}",
      "stale_departure": "A departure for \"{name}\" at {time} has {actual} time entries but the service has {expected} stops",
      "duplicate_segment": "{n} {type} segments connect {from} and {to}",
      "cross_cutoff_journey": "\"{name}\" @ {time} runs across the service day boundary ({cutoff})",
      "suspicious_segment": "{from} — {to}: near-identical path to another segment ({dist}m avg deviation)",
      "suspicious_chain": "{from} — {to}: path matches a chain of segments ({dist}m avg deviation): {chain}",
      "overlap_branching": "{segA} and {segB} share {dist}m of track after a common station",
      "overlap_mid": "{segA} and {segB} share {dist}m of track"
    },
    "detail": {
      "single_track_conflict": "{a_time} vs {b_time}",
      "platform_conflict": "{a_time} vs {b_time} ({clearance} min clearance required)",
      "no_departures": "Use the ⏱ Gen button to generate a schedule.",
      "missing_platform": "Stop {n} in the route.",
      "no_mode": "Assign a mode for proper classification.",
      "orphan_departures": "These will not appear in any schedule. Consider cleaning up.",
      "electrification_mismatch": "Electric trains cannot run on non-electrified track. Change the stock type or electrify the segment.",
      "infra_mismatch": "This mode's infrastructure type does not match the segment. Check the mode's infrastructure setting or change the segment type.",
      "disallowed_stock_mode": "Check the Stock–Mode matrix. Change the stock type or mode.",
      "no_stock_assigned": "Assign stock for accurate travel time calculations.",
      "invalid_platform_reference": "The assigned platform no longer exists. Update the service.",
      "invalid_platform_override": "The overridden platform no longer exists. Update the departure.",
      "ungrouped_service": "Assign a line for better organization and color coding.",
      "duplicate_name": "Consider giving them distinct names.",
      "duplicate_node_name": "This may cause confusion.",
      "unlinked_station_group": "Add ISI or OSI interchange segments between these stations or rename them to distinguish.",
      "duplicate_ref_code": "Ref codes should be unique.",
      "no_platforms": "Add platforms to enable platform assignments and conflict detection.",
      "auto_generated_name": "Consider giving it a proper name.",
      "incomplete_segment": "This may cause incorrect travel time calculations.",
      "distance_mismatch": "{pct}% difference. The stored distance is used for travel time calculations. Re-fetch or correct manually.",
      "mode_not_allowed": "Edit the segment's allowed modes or change the service's mode.",
      "isolated_node": "This node cannot be reached by any service.",
      "waypoint_connection_count": "Waypoints should connect exactly 2 segments.",
      "missing_ogf_node": "Add an OGF node reference for map integration.",
      "schematic_mismatch": "Check the platform assignment in the service editor.",
      "departure_schematic_mismatch": "Check the departure platform override or station schematic.",
      "unassigned_platform": "Edit the station schematic to assign this platform to a track.",
      "unconnected_segment_track": "Edit the schematic to connect this segment track.",
      "non_station_stop": "Stop {n} should be marked as pass-through.",
      "pass_through_terminus": "First and last stops should not be pass-through.",
      "broken_route": "Between stops {a} and {b}. The segment may have been deleted.",
      "missing_node": "This service needs its route repaired.",
      "stale_departure": "The service route was edited after this departure was generated. Recalculate to fix.",
      "duplicate_segment": "This may cause unpredictable routing. Remove the duplicate.",
      "cross_cutoff_journey": "Departs {dep_time}, arrives {arr_time}. This may affect weekly scheduling.",
      "suspicious_segment": "These segments have near-identical geometry. One may be a duplicate from a reverse or express route import.",
      "suspicious_chain": "This segment's path matches a chain of shorter segments. It may be a redundant express route that skips intermediate stations.",
      "segment_overlap": "These segments share physical track. Consider inserting a junction at the split point to enable proper conflict detection."
    },
    "verify_btn": "Mark as verified",
    "resolve": {
      "title": "Resolve Segment Overlap",
      "fix_btn": "Auto-fix",
      "proposed": "Proposed changes",
      "insert_junction": "Insert junction at {lat}, {lon}",
      "create_shared": "Create shared segment from {from} to junction ({dist}m)",
      "modify_seg": "Modify segment: {from} → {to} ({dist}m)",
      "update_services": "Update {n} service(s) to route through the new junction",
      "shared_label": "Shared track",
      "junction_label": "New junction",
      "apply": "Apply Fix",
      "success": "Overlap resolved. {n} service(s) rerouted.",
      "error": "Could not find the segments.",
      "no_geometry": "Both segments need way geometry to resolve.",
      "no_divergence": "Could not find a divergence point between these segments."
    },
    "hidden": {
      "summary": "{n} hidden issues",
      "show": "show",
      "hide": "hide",
      "edit_filters": "edit filters"
    }
  },
  "settings": {
    "title": "Settings",
    "subtitle": "System configuration and defaults",
    "label": {
      "individual_issue_types": "Individual Issue Types"
    },
    "placeholder": {
      "eg_system_name": "e.g. Central Railway Network"
    },
    "toast": {
      "theme_coming": "Light and system themes coming in a future update"
    },
    "field": {
      "system_name": "System Name",
      "colour_scheme": "Colour Scheme",
      "walking_speed": "Assumed Walking Speed (km/h)",
      "transfer_time": "Assumed Transfer Time (min)",
      "day_cutoff": "Day Cutoff",
      "default_plt_clearance": "Default Platform Clearance (min)",
      "default_accel": "Default Acceleration (m/s²)",
      "default_dwell_time": "Default Dwell Time (seconds)",
      "default_platforms": "Default Platforms (new stations)"
    },
    "tab_general": "General",
    "tab_defaults": "Defaults",
    "tab_issues": "Issues",
    "language_desc": "Interface language. Language files live in the lang/ folder.",
    "system_name_desc": "Shown in the header and browser tab. Included in JSON exports.",
    "strip_brackets": "Strip bracketed text from end of station names on public-facing views",
    "strip_brackets_example": "e.g. \"Central Station [Red Line]\" displays as \"Central Station\" on the departure board and journey planner.",
    "strip_brackets_desc": "e.g. \"Central Station [Red Line]\" displays as \"Central Station\" on the departure board and journey planner.",
    "jp_map_tiles": "Show map tiles on journey planner maps",
    "jp_map_tiles_desc": "When disabled, journey maps show a plain dark background without OGF tiles.",
    "new_system_desc": "Start fresh. You will be prompted to export your current data first.",
    "defaults_desc": "These values are used as fallbacks when no specific override is set on the relevant entity (stock, mode, segment, etc.).",
    "cutoff_desc": "Departures before this time count as the previous service day.",
    "clearance_desc": "Fallback for modes without a specific clearance.",
    "issues_desc": "Toggle which non-critical issue types are shown. High-severity issues (conflicts, broken routes) are always shown.",
    "dark": "Dark",
    "light": "Light",
    "system_pref": "System preference",
    "check_translations": "Check Translations",
    "show_low_severity": "Show low-severity issues"
  },
  "import_export": {
    "title": "Import / Export",
    "subtitle": "Import and export network data",
    "json_title": "JSON Save File",
    "json_desc": "Export the entire current system as a JSON file, or import a previously exported save file as a new system.",
    "ogf_title": "OGF Relation Import",
    "ogf_desc": "Import stations and segments from an OGF route relation.",
    "ogf_btn": "Import Relation",
    "csv_node_title": "CSV Node Import",
    "csv_node_desc": "Import stations and other nodes from a CSV or TSV file.",
    "csv_seg_title": "CSV Segment Import",
    "csv_seg_desc": "Import segments from a CSV or TSV file.",
    "csv_btn": "Import CSV",
    "saves_title": "Manage Saves",
    "saves_desc": "Rename, duplicate, or delete saved systems.",
    "manage_saves": "Open Save Manager",
    "coming_soon": "Coming in a future session",
    "csv": {
      "mode_nodes": "CSV Node Import",
      "mode_segments": "CSV Segment Import",
      "step_of": "Step {n} of {total}",
      "step_upload": "Upload File",
      "step_preview": "Preview Data",
      "step_assign": "Assign Columns",
      "step_defaults": "Import Defaults",
      "step_matching": "Match Nodes",
      "step_review": "Review & Confirm",
      "upload_desc": "Select a CSV or TSV file. No header row is expected — you will assign column meanings in the next step.",
      "or_paste": "Or paste your data",
      "paste_placeholder": "Paste tab-separated or comma-separated data here...",
      "use_pasted": "Use Pasted Data",
      "paste_empty": "Nothing to paste — enter some data first.",
      "detected": "Detected: {delim}, {rows} rows, {cols} columns",
      "delim_tab": "tab-separated",
      "delim_comma": "comma-separated",
      "col": "Col",
      "assign_desc": "Assign each column to a field. The first row of data is shown as a sample.",
      "default_type": "Default Node Type",
      "default_platforms": "Default Platform Count",
      "default_speed": "Default Max Speed (km/h)",
      "default_tracks": "Default Track Count",
      "default_elec": "Default Electrification",
      "no_defaults_needed": "All fields are mapped from columns — no defaults needed.",
      "btn_preview": "Build Preview",
      "btn_import": "Import {n} items",
      "review_count": "{n} items ready to import",
      "warn_no_name": "Missing name",
      "warn_dup_ogf": "Duplicate OGF ID",
      "warn_no_nodes": "No node matches",
      "warn_no_from": "No 'from' match",
      "warn_no_to": "No 'to' match",
      "warn_same_node": "Same from/to node",
      "warn_dup_ogf_match": "Multiple nodes share this OGF ID",
      "warn_dup_existing": "Duplicate of existing segment",
      "warn_dup_batch": "Duplicate within import batch",
      "warn_no_name_or_ogf": "No name or OGF ID — cannot identify",
      "warn_dup_ogf_existing": "OGF ID already exists: {name}",
      "nothing_to_import": "Nothing selected to import.",
      "fetching_ogf": "Fetching OGF data for {n} nodes...",
      "fetching_ways": "Fetching way geometry for {n} segments...",
      "import_success": "Imported {n} items successfully.",
      "match_desc": "Match the node names from your CSV to existing nodes. Ambiguous matches can be overridden.",
      "row": "Row",
      "from_input": "From (CSV)",
      "matched_node": "Matched Node",
      "to_input": "To (CSV)",
      "no_match": "No match found",
      "select_node": "— Select —",
      "disambig_suffix": "Disambiguation Suffix",
      "disambig_desc": "Appended in [brackets] to every imported node name. Useful when importing stations for a specific line.",
      "disambig_placeholder": "e.g. Metro, Piccadilly",
      "step_dedup": "Duplicates",
      "no_dupes": "No duplicates found — all clear.",
      "dedup_node_desc": "{n} imported node(s) conflict with existing data. Choose to skip (merge with existing) or disambiguate (rename to make distinct).",
      "dedup_seg_desc": "{n} imported segment(s) may be duplicates. Choose to skip or keep.",
      "importing": "Importing",
      "existing": "Existing",
      "conflict": "Conflict",
      "action": "Action",
      "dup_same_ogf": "Same OGF node ID",
      "dup_same_batch": "Duplicate in batch",
      "dup_same_endpoints": "Same endpoints",
      "dup_same_ways": "Same OGF way IDs",
      "action_skip": "Skip (merge)",
      "action_disambig": "Disambiguate",
      "action_keep": "Import anyway"
    },
    "rel": {
      "title": "OGF Relation Import",
      "step_config": "Configure",
      "step_stations": "Stations",
      "step_segments": "Segments",
      "step_warnings": "Warnings",
      "step_confirm": "Confirm",
      "relation_id": "Relation ID",
      "relation_id_placeholder": "e.g. 12345",
      "maxspeed_boundary": "Speed Boundary Handling",
      "maxspeed_default": "Use default speed everywhere",
      "maxspeed_waypoints": "Insert waypoints at speed changes",
      "disambig": "Disambiguation Suffix",
      "fetch_btn": "Fetch & Process",
      "fetching": "Fetching relation...",
      "no_id": "Enter a relation ID.",
      "fetch_error": "Relation fetch failed: {msg}",
      "snap_dist": "Snap",
      "station_count": "{n} stations found",
      "no_warnings": "No warnings — all clear.",
      "summary": "Import Summary",
      "importing_stations": "{n} stations to import",
      "importing_segments": "{n} segments to import",
      "warnings_count": "{n} warning(s)",
      "whats_left": "What's left to do manually",
      "manual_junctions": "Junctions (branching points)",
      "manual_tracks": "Variable track counts per segment",
      "manual_platforms": "Variable platform counts per station",
      "manual_services": "Services and express variants",
      "manual_lines": "Line assignment"
    },
    "btn": {
      "new_system": "+ New System",
      "import_json": "Import JSON",
      "export_json": "Export JSON"
    },
    "saves": {
      "title": "Save Manager",
      "col_system": "System",
      "col_modified": "Last Modified",
      "col_stats": "Stats",
      "no_saves": "No saves yet.",
      "active": "(active)",
      "storage": "Storage",
      "unnamed": "Unnamed System",
      "confirm_delete": "Delete save \"{name}\"? This cannot be undone.",
      "confirm_new": "Create a new system? Your current system will remain in the save manager.",
      "prompt_rename": "New name:",
      "json_file": "JSON file"
    },
    "toast": {
      "loaded": "Loaded: {name}",
      "save_deleted": "Save deleted",
      "save_duplicated": "Duplicated: {name}",
      "data_exported": "Data exported",
      "imported": "Imported as new save",
      "invalid_json": "Invalid JSON file",
      "new_system": "New system created"
    }
  },
  "common": {
    "btn": {
      "saves": "Saves",
      "search": "Search",
      "now": "Now",
      "today": "Today",
      "fit": "Fit",
      "swap": "Swap",
      "close": "Close",
      "save": "Save",
      "cancel": "Cancel",
      "back": "← Back",
      "next": "Next →",
      "confirm": "Confirm",
      "edit": "Edit",
      "delete": "Delete",
      "load": "Load",
      "rename": "Rename",
      "duplicate": "Dup",
      "reverse": "Rev",
      "apply": "Apply",
      "remove": "Remove"
    },
    "label": {
      "per_day": "/day",
      "code": "Code"
    },
    "select": "— Select —",
    "none_default": "— None —",
    "language": "Language",
    "placeholder": {
      "search": "Search..."
    },
    "tooltip": {
      "set_current_time": "Set to current time"
    },
    "toast": {
      "name_required": "Name is required"
    },
    "th": {
      "name": "Name",
      "ref": "Ref",
      "type": "Type",
      "description": "Description",
      "cat": "Cat.",
      "deps": "Deps."
    },
    "field": {
      "name": "Name",
      "ref_code": "Ref. Code",
      "type": "Type",
      "description": "Description (optional)"
    },
    "node_picker": {
      "search": "Search nodes...",
      "no_match": "No matching nodes"
    },
    "typical": "Typical",
    "atypical": "Atypical",
    "disallowed": "Disallowed",
    "none": "None",
    "none_line": "(none)",
    "not_set": "—",
    "duration_min": "{n} min",
    "duration_hm": "{h}h {m}m"
  },
  "railmap": {
    "btn": {
      "add_track": "+ Add Track",
      "create_schematic": "+ Create Schematic",
      "edit_schematic": "Edit Schematic"
    },
    "label": {
      "pick_start_node": "— Pick starting node —",
      "unplaced": "Unplaced",
      "junction_schematic": "Junction Schematic",
      "station_schematic": "Station Schematic",
      "waypoint_schematic": "Waypoint Schematic"
    },
    "tooltip": {
      "zoom_in": "Zoom in",
      "zoom_out": "Zoom out",
      "fit_all": "Fit all nodes"
    },
    "toast": {
      "saved": "Schematic saved"
    },
    "modal": {
      "title": "Schematic — {name}"
    },
    "th": {
      "direction": "Direction",
      "seg_towards": "Segment towards",
      "enter": "Enter",
      "exit": "Exit"
    },
    "northbound": "Northbound",
    "southbound": "Southbound",
    "eastbound": "Eastbound",
    "westbound": "Westbound",
    "assign_directions": "Assign each connected segment to a direction (max 2 directions per station).",
    "track_connections": "Each track connects to segments on one or more sides (or terminates).",
    "no_tracks": "No tracks defined.",
    "no_segs_side": "No segments on this side",
    "tracks_defined_one": "1 track defined",
    "tracks_defined_other": "{n} tracks defined",
    "segment_directions": "Segment Directions",
    "tracks_title": "Tracks",
    "save_schematic": "Save Schematic",
    "platforms": "Platforms",
    "empty": {
      "all_placed": "All stations placed!",
      "no_stations": "No stations defined."
    }
  },
  "l10n": {
    "toast": {
      "lang_not_found": "Language file not found: {code}",
      "no_other_langs": "No other languages loaded — only English is available."
    },
    "report_title": "Translation Report",
    "missing_keys": "{n} missing key(s)",
    "stale_keys": "{n} stale key(s) (English changed)",
    "fully_up_to_date": "Fully up to date!",
    "complete": "complete"
  },
  "pattern": {
    "daily": "Daily",
    "weekdays": "Weekdays",
    "weekends": "Weekends",
    "mon": "Mon",
    "tue": "Tue",
    "wed": "Wed",
    "thu": "Thu",
    "fri": "Fri",
    "sat": "Sat",
    "sun": "Sun",
    "excl": "excl. {dates}",
    "all_year": "All year",
    "schedule_pattern": "Schedule Pattern",
    "all_days": "All days",
    "add_date_range": "+ Add date range",
    "date_range_from": "From",
    "date_range_to": "To",
    "exclude_dates": "Exclude dates",
    "specific_dates": "Specific dates",
    "placeholder_mmdd": "MM-DD",
    "placeholder_exclude": "e.g. 12-25, 01-01",
    "placeholder_specific": "e.g. 03-01, 06-15"
  },
  "type": {
    "station": "station",
    "junction": "junction",
    "waypoint": "waypoint",
    "depot": "depot",
    "freight_yard": "freight yard",
    "bus_stop": "bus stop",
    "electric": "Electric",
    "diesel": "Diesel",
    "dual": "Dual"
  },
  "hint": {
    "title": "Filters",
    "node_name": "Node name",
    "ref_code": "Ref code",
    "node_type": "station, junction, waypoint, depot, freight_yard",
    "platform_count": "Platform count (e.g. 3+, 2-4)",
    "connections": "Segment connections (e.g. 3+)",
    "description": "Description text",
    "address": "Address text",
    "ogf": "Has OGF ID (yes/no)",
    "placed": "On railmap (yes/no)",
    "schematic": "Has schematic (yes/no)",
    "served_by_line": "Served by line name",
    "seg_type": "track, osi, isi",
    "track_count": "Track count (e.g. 2+)",
    "max_speed": "Max speed km/h (e.g. 120+)",
    "distance": "Distance km (e.g. 5-10)",
    "electrified": "Electrified (yes/no)",
    "service_count": "Service count (e.g. 3+)",
    "departure_count": "Departure count (e.g. 10+)",
    "station_count": "Station count (e.g. 5+)",
    "segment_count": "Segment count (e.g. 10+)",
    "line_name": "Line name",
    "mode_name": "Mode name or abbreviation",
    "stock_name": "Stock type name",
    "stop_count": "Stop count (e.g. 5+)",
    "stops_at": "Stops at station name",
    "route_km": "Route km (e.g. 50+)",
    "route_min": "Route minutes (e.g. 30+)"
  }
});
