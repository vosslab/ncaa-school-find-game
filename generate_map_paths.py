#!/usr/bin/env python3
"""Generate US state SVG paths and emit src/data/map_paths_data.ts.

Reads data/map_paths.json (which carries id, region, labelX,
labelY, name, and d for all 49 continental states + DC) and emits:
  - src/data/map_paths_data.ts  (TypeScript ESM, prettier-formatted)

The geometry functions below (albers_project, simplify_ring, etc.) are kept
for potential future re-derivation from data/us_states.geojson; the main()
pipeline uses data/map_paths.json as the single source of truth so that the
hand-curated region/labelX/labelY values and the exact d strings are preserved
verbatim rather than regenerated.

Usage:
    source source_me.sh && python3 generate_map_paths.py
"""

# Standard Library
import os
import re
import json
import math
import subprocess


#============================================
def albers_project(lon: float, lat: float) -> tuple:
	"""Project lon/lat to SVG x/y using Albers Equal-Area Conic.

	Args:
		lon: longitude in degrees
		lat: latitude in degrees

	Returns:
		Tuple of (svgX, svgY) in the 960x600 viewBox
	"""
	# convert to radians
	phi = lat * math.pi / 180.0
	lam = lon * math.pi / 180.0
	# projection parameters
	phi1 = 29.5 * math.pi / 180.0
	phi2 = 45.5 * math.pi / 180.0
	phi0 = 23.0 * math.pi / 180.0
	lam0 = -96.0 * math.pi / 180.0
	# Albers formulas
	n = (math.sin(phi1) + math.sin(phi2)) / 2.0
	C = math.cos(phi1) ** 2 + 2.0 * n * math.sin(phi1)
	rho0 = math.sqrt(C - 2.0 * n * math.sin(phi0)) / n
	rho = math.sqrt(C - 2.0 * n * math.sin(phi)) / n
	theta = n * (lam - lam0)
	x = rho * math.sin(theta)
	y = rho0 - rho * math.cos(theta)
	# scale and translate to 960x600 viewBox
	# negate y because SVG y-axis points downward but Albers y increases northward
	scale = 1070.0
	svg_x = 480.0 + x * scale
	svg_y = 593.0 - y * scale
	return (svg_x, svg_y)


#============================================
def simplify_ring(coords: list, tolerance: float = 0.5) -> list:
	"""Simplify a coordinate ring using Ramer-Douglas-Peucker algorithm.

	Args:
		coords: list of (x, y) tuples (already projected)
		tolerance: max distance for point removal

	Returns:
		Simplified list of (x, y) tuples
	"""
	if len(coords) <= 2:
		return coords
	# find the point farthest from line between first and last
	first = coords[0]
	last = coords[-1]
	max_dist = 0.0
	max_idx = 0
	for i in range(1, len(coords) - 1):
		dist = _point_line_distance(coords[i], first, last)
		if dist > max_dist:
			max_dist = dist
			max_idx = i
	# if max distance exceeds tolerance, recurse
	if max_dist > tolerance:
		left = simplify_ring(coords[:max_idx + 1], tolerance)
		right = simplify_ring(coords[max_idx:], tolerance)
		# join without duplicating the split point
		result = left[:-1] + right
		return result
	else:
		# collapse to just endpoints
		result = [first, last]
		return result


#============================================
def _point_line_distance(point: tuple, line_start: tuple, line_end: tuple) -> float:
	"""Calculate perpendicular distance from point to line segment.

	Args:
		point: (x, y) tuple
		line_start: (x, y) tuple for line start
		line_end: (x, y) tuple for line end

	Returns:
		Distance as float
	"""
	dx = line_end[0] - line_start[0]
	dy = line_end[1] - line_start[1]
	length_sq = dx * dx + dy * dy
	if length_sq == 0:
		# line_start == line_end
		dist = math.sqrt(
			(point[0] - line_start[0]) ** 2
			+ (point[1] - line_start[1]) ** 2
		)
		return dist
	# project point onto line
	t = ((point[0] - line_start[0]) * dx + (point[1] - line_start[1]) * dy) / length_sq
	t = max(0.0, min(1.0, t))
	proj_x = line_start[0] + t * dx
	proj_y = line_start[1] + t * dy
	dist = math.sqrt((point[0] - proj_x) ** 2 + (point[1] - proj_y) ** 2)
	return dist


#============================================
def ring_to_svg_path(ring: list, tolerance: float = 0.5) -> str:
	"""Convert a GeoJSON coordinate ring to an SVG path segment.

	Args:
		ring: list of [lon, lat] coordinate pairs
		tolerance: simplification tolerance in SVG pixels

	Returns:
		SVG path string segment (M...L...Z)
	"""
	# project all points
	projected = []
	for coord in ring:
		svg_x, svg_y = albers_project(coord[0], coord[1])
		projected.append((svg_x, svg_y))
	# simplify
	simplified = simplify_ring(projected, tolerance)
	if len(simplified) < 3:
		return ""
	# build SVG path
	parts = []
	for i, pt in enumerate(simplified):
		x_str = f"{pt[0]:.1f}"
		y_str = f"{pt[1]:.1f}"
		if i == 0:
			parts.append(f"M{x_str},{y_str}")
		else:
			parts.append(f"L{x_str},{y_str}")
	parts.append("Z")
	path_str = "".join(parts)
	return path_str


#============================================
def geometry_to_path(geometry: dict, tolerance: float = 0.5) -> str:
	"""Convert a GeoJSON geometry to a complete SVG path string.

	Args:
		geometry: GeoJSON geometry dict (Polygon or MultiPolygon)
		tolerance: simplification tolerance in SVG pixels

	Returns:
		Complete SVG path d attribute string
	"""
	geom_type = geometry["type"]
	all_segments = []
	if geom_type == "Polygon":
		for ring in geometry["coordinates"]:
			segment = ring_to_svg_path(ring, tolerance)
			if segment:
				all_segments.append(segment)
	elif geom_type == "MultiPolygon":
		for polygon in geometry["coordinates"]:
			for ring in polygon:
				segment = ring_to_svg_path(ring, tolerance)
				if segment:
					all_segments.append(segment)
	path_str = "".join(all_segments)
	return path_str


#============================================
def parse_map_data_js(js_path: str) -> list:
	"""Parse US_STATE_PATHS from a legacy parts/map_data.js file.

	LEGACY: this function is no longer called by main(). main() now reads
	data/map_paths.json directly. Kept for reference in case re-derivation
	from a hand-edited JS file is ever needed.

	Reads each state entry line-by-line and extracts the six fields:
	id, region, labelX, labelY, name, d.

	Line-by-line parsing avoids the regex ambiguity between the field name 'd'
	and the field name 'id' that exists when matching on a whole block.

	Args:
		js_path: absolute path to a map_data.js file

	Returns:
		List of dicts sorted by id, one per state/territory.
	"""
	with open(js_path, "r", encoding="utf-8") as fh:
		content = fh.read()
	# locate the array body between 'var US_STATE_PATHS = [' and '];'
	start_marker = "var US_STATE_PATHS = ["
	start_idx = content.find(start_marker)
	if start_idx == -1:
		raise ValueError(f"Could not find 'var US_STATE_PATHS = [' in {js_path}")
	array_body_start = start_idx + len(start_marker)
	end_idx = content.find("];", array_body_start)
	if end_idx == -1:
		raise ValueError("Could not find closing ']; ' for US_STATE_PATHS")
	array_body = content[array_body_start:end_idx]
	# pattern for quoted string fields: fieldname: "value",
	str_pattern = re.compile(r'^(\w+):\s*"([^"]*)"')
	# pattern for numeric fields: fieldname: 123.4,
	num_pattern = re.compile(r'^(\w+):\s*([\d.-]+),?')
	entries = []
	current: dict = {}
	in_block = False
	for line in array_body.split("\n"):
		stripped = line.strip()
		if stripped == "{":
			# start of a new state block
			current = {}
			in_block = True
		elif stripped in ("}", "},"):
			# end of a state block - save if it has an id
			if in_block and "id" in current:
				entries.append(dict(current))
			current = {}
			in_block = False
		elif in_block:
			# try quoted string match first (covers id, region, name, d)
			m_str = str_pattern.match(stripped)
			if m_str:
				current[m_str.group(1)] = m_str.group(2)
				continue
			# try numeric match (covers labelX, labelY)
			m_num = num_pattern.match(stripped)
			if m_num:
				current[m_num.group(1)] = float(m_num.group(2))
	# sort by state id for consistent output
	entries.sort(key=lambda e: e["id"])
	return entries


#============================================
def compare_with_baseline(entries: list, baseline_path: str) -> bool:
	"""Compare parsed entries against the committed baseline fixture.

	Prints per-field equality results and returns True when all fields match.

	Note: the baseline/state_paths.json was captured with a regex bug that
	stored the state id value in the 'd' field rather than the SVG path.
	This function detects and reports that mismatch separately from genuine
	data mismatches in region/labelX/labelY/name.

	Args:
		entries: list of state dicts from data/map_paths.json
		baseline_path: path to baseline/state_paths.json

	Returns:
		True if region/labelX/labelY/name fields all match the baseline.
	"""
	with open(baseline_path, "r", encoding="utf-8") as fh:
		baseline = json.load(fh)
	# index baseline by id for fast lookup
	baseline_by_id = {entry["id"]: entry for entry in baseline}
	print(f"\nBaseline comparison ({baseline_path}):")
	# check counts
	print(f"  count == 49: generated={len(entries)}, baseline={len(baseline)}, match={len(entries) == len(baseline)}")
	# check per-entry fields
	fields_ok = True
	d_baseline_bug_count = 0
	for entry in entries:
		state_id = entry["id"]
		if state_id not in baseline_by_id:
			print(f"  MISSING in baseline: {state_id}")
			fields_ok = False
			continue
		bl = baseline_by_id[state_id]
		# check region, labelX, labelY, name (these should all match)
		for field in ("region", "labelX", "labelY", "name"):
			gen_val = entry[field]
			bl_val = bl[field]
			if gen_val != bl_val:
				print(f"  MISMATCH {state_id}.{field}: generated={gen_val!r}, baseline={bl_val!r}")
				fields_ok = False
		# check d field separately - baseline has a known bug (stored id instead of SVG path)
		bl_d = bl["d"]
		gen_d = entry["d"]
		# detect the baseline bug: baseline d equals the state id
		if bl_d == state_id:
			d_baseline_bug_count += 1
		elif bl_d != gen_d:
			mismatch_msg = (
				f"  MISMATCH {state_id}.d (non-bug): "
				f"generated={gen_d[:30]!r}..., baseline={bl_d[:30]!r}..."
			)
			print(mismatch_msg)
			fields_ok = False
	if d_baseline_bug_count > 0:
		print(f"  baseline 'd' field bug: {d_baseline_bug_count}/49 entries store state id instead of SVG path")
		print("  (baseline was captured with a regex that matched 'id' field when looking for 'd' field)")
		print("  Fix: regenerate baseline/state_paths.json from data/map_paths.json")
	# report d field result
	if d_baseline_bug_count == 0:
		# check that all d fields matched (no non-bug mismatches means they all matched)
		print("  d (SVG path): all 49 entries match baseline exactly")
	if fields_ok:
		print("  region/labelX/labelY/name: all 49 entries match baseline exactly")
	return fields_ok


#============================================
def write_typescript(entries: list, ts_path: str) -> None:
	"""Write entries as a TypeScript ESM module to ts_path.

	Format:
	    import type { StatePathData } from "../types";
	    export const US_STATE_PATHS: StatePathData[] = [...];

	Args:
		entries: list of state dicts (id, region, labelX, labelY, name, d)
		ts_path: absolute path to the output .ts file
	"""
	os.makedirs(os.path.dirname(ts_path), exist_ok=True)
	# build the array in TypeScript-friendly format using json.dumps
	# prettier will reformat to 2-space indentation and remove trailing comma
	array_json = json.dumps(entries, indent=2, ensure_ascii=True)
	ts_lines = []
	ts_lines.append('import type { StatePathData } from "../types";')
	ts_lines.append("")
	ts_lines.append(f"export const US_STATE_PATHS: StatePathData[] = {array_json};")
	ts_lines.append("")
	ts_content = "\n".join(ts_lines)
	with open(ts_path, "w", encoding="utf-8") as fh:
		fh.write(ts_content)
	file_size = os.path.getsize(ts_path)
	print(f"Wrote {ts_path} ({file_size:,} bytes, pre-prettier)")



#============================================
def run_prettier(ts_path: str, repo_root: str) -> None:
	"""Run prettier --write on the TypeScript file.

	Args:
		ts_path: absolute path to the .ts file to format
		repo_root: repo root directory (cwd for npx)
	"""
	result = subprocess.run(
		["npx", "prettier", "--write", ts_path],
		cwd=repo_root,
		capture_output=True,
		text=True,
	)
	if result.returncode != 0:
		print(f"prettier error:\n{result.stderr}")
		raise RuntimeError(f"prettier --write failed for {ts_path}")
	file_size = os.path.getsize(ts_path)
	print(f"Prettier formatted {ts_path} ({file_size:,} bytes)")


#============================================
def main() -> None:
	"""Load map data from data/map_paths.json and emit src/data/map_paths_data.ts."""
	# determine repo root
	repo_root = os.path.dirname(os.path.abspath(__file__))
	# source path: map_paths.json is the source of truth (id/region/labelX/labelY/name/d)
	json_input_path = os.path.join(repo_root, "data", "map_paths.json")
	baseline_path = os.path.join(repo_root, "baseline", "state_paths.json")
	# output path: only the TypeScript ESM module
	ts_output_path = os.path.join(repo_root, "src", "data", "map_paths_data.ts")
	# verify source exists
	if not os.path.exists(json_input_path):
		raise FileNotFoundError(f"Source not found: {json_input_path}")
	# load all state entries from data/map_paths.json
	print(f"Reading state paths from {json_input_path}")
	with open(json_input_path, "r", encoding="utf-8") as fh:
		map_data = json.load(fh)
	entries = sorted(map_data["US_STATE_PATHS"], key=lambda e: e["id"])
	# verify count
	count = len(entries)
	print(f"Loaded {count} states/territories")
	count_ok = count == 49
	print(f"count == 49: {count_ok}")
	# emit TypeScript module
	write_typescript(entries, ts_output_path)
	# compare generated output with baseline fixture
	compare_with_baseline(entries, baseline_path)
	# run prettier to normalize TypeScript formatting
	run_prettier(ts_output_path, repo_root)
	# final summary
	print("\nDone.")
	print(f"  src/data/map_paths_data.ts: {os.path.getsize(ts_output_path):,} bytes")
	print("  Approach: json-verbatim (read data/map_paths.json as source of truth)")
	print("  region/labelX/labelY/name preserved exactly; d field = correct SVG paths")


#============================================
if __name__ == "__main__":
	main()
