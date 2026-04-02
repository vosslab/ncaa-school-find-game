#!/usr/bin/env python3
"""Generate a debug HTML map showing all school dots with their two-color scheme.

Reads parts/constants.js for school data and parts/map_data.js for state paths,
then produces debug_map.html with all dots pre-rendered in their final colors.

Usage:
    source source_me.sh && python3 generate_debug_map.py
"""

import os
import re
import math
import subprocess

#============================================
def get_repo_root() -> str:
	"""Get the repository root directory."""
	result = subprocess.run(
		["git", "rev-parse", "--show-toplevel"],
		capture_output=True, text=True, check=True
	)
	repo_root = result.stdout.strip()
	return repo_root

#============================================
def parse_schools(js_content: str) -> list:
	"""Extract school objects from constants.js content."""
	schools = []
	# Split into individual school blocks (each { ... } entry)
	# Find all blocks between { and },
	block_pattern = re.compile(r'\{[^{}]+\}', re.DOTALL)
	for block_match in block_pattern.finditer(js_content):
		block = block_match.group(0)
		# Only process blocks that have shortName (school entries)
		if 'shortName:' not in block:
			continue
		# Extract fields
		def get_field(name: str, text: str) -> str:
			m = re.search(rf'{name}:\s*"([^"]+)"', text)
			return m.group(1) if m else ""
		def get_num(name: str, text: str) -> float:
			m = re.search(rf'{name}:\s*([\d.-]+)', text)
			return float(m.group(1)) if m else 0.0
		short_name = get_field("shortName", block)
		if not short_name:
			continue
		# Check for colorSwap flag
		has_swap = "colorSwap: true" in block or "colorSwap:true" in block
		schools.append({
			"name": get_field("name", block),
			"shortName": short_name,
			"conference": get_field("conference", block),
			"subdivision": get_field("subdivision", block),
			"lat": get_num("lat", block),
			"lon": get_num("lon", block),
			"colorPrimary": get_field("colorPrimary", block),
			"colorSecondary": get_field("colorSecondary", block),
			"colorSwap": has_swap,
		})
	return schools

#============================================
def parse_state_paths(js_content: str) -> list:
	"""Extract state SVG paths from map_data.js content."""
	states = []
	pattern = re.compile(
		r'id:\s*"([^"]+)".*?region:\s*"([^"]*)".*?d:\s*"([^"]+)"',
		re.DOTALL
	)
	for match in pattern.finditer(js_content):
		states.append({
			"id": match.group(1),
			"region": match.group(2),
			"d": match.group(3),
		})
	return states

#============================================
def albers_projection(lat: float, lon: float) -> tuple:
	"""Albers Equal-Area Conic projection matching the game's map_projection.js."""
	# Configuration matching ALBERS_CONFIG
	phi1 = 29.5 * math.pi / 180
	phi2 = 45.5 * math.pi / 180
	phi0 = 23.0 * math.pi / 180
	lam0 = -96.0 * math.pi / 180
	scale = 1070
	translate_x = 480
	translate_y = 593

	# Convert to radians
	phi = lat * math.pi / 180
	lam = lon * math.pi / 180

	# Albers formula
	n = (math.sin(phi1) + math.sin(phi2)) / 2
	c = math.cos(phi1) ** 2 + 2 * n * math.sin(phi1)
	rho0 = math.sqrt(c - 2 * n * math.sin(phi0)) / n
	rho = math.sqrt(c - 2 * n * math.sin(phi)) / n
	theta = n * (lam - lam0)

	x = rho * math.sin(theta)
	y = rho0 - rho * math.cos(theta)

	# Scale and translate to SVG coordinates
	svg_x = translate_x + x * scale
	svg_y = translate_y - y * scale
	return (svg_x, svg_y)

#============================================
def jitter_overlapping(coords: list, min_spacing: float = 10.0,
		max_drift: float = 12.0) -> list:
	"""Push apart dots that are too close, capped by max drift from original."""
	import random
	random.seed(42)
	# Save originals
	orig = [(x, y) for x, y in coords]
	for _pass in range(15):
		moved = False
		for i in range(len(coords)):
			for j in range(i + 1, len(coords)):
				dx = coords[j][0] - coords[i][0]
				dy = coords[j][1] - coords[i][1]
				dist = math.sqrt(dx * dx + dy * dy)
				if dist < min_spacing:
					if dist > 0.1:
						angle = math.atan2(dy, dx)
					else:
						angle = random.random() * math.pi * 2
					push = (min_spacing - dist) / 2 + 1
					coords[i] = (
						coords[i][0] - math.cos(angle) * push,
						coords[i][1] - math.sin(angle) * push,
					)
					coords[j] = (
						coords[j][0] + math.cos(angle) * push,
						coords[j][1] + math.sin(angle) * push,
					)
					moved = True
		# Clamp to max_drift from original
		for c in range(len(coords)):
			cdx = coords[c][0] - orig[c][0]
			cdy = coords[c][1] - orig[c][1]
			cdist = math.sqrt(cdx * cdx + cdy * cdy)
			if cdist > max_drift:
				scale = max_drift / cdist
				coords[c] = (
					orig[c][0] + cdx * scale,
					orig[c][1] + cdy * scale,
				)
		if not moved:
			break
	return coords

#============================================
def make_half_dot_svg(x: float, y: float, r: float,
		color1: str, color2: str, label: str, idx: int) -> str:
	"""Generate SVG for a half-and-half split circle dot.

	Left half = color1 (primary), right half = color2 (secondary).
	Uses two arc paths for clean rendering.
	"""
	# Two semicircle arcs
	# Left half (top to bottom, going left)
	left_path = (
		f"M {x},{y - r} "
		f"A {r},{r} 0 0,0 {x},{y + r} "
		f"Z"
	)
	# Right half (top to bottom, going right)
	right_path = (
		f"M {x},{y - r} "
		f"A {r},{r} 0 0,1 {x},{y + r} "
		f"Z"
	)

	svg = ""
	svg += f'<g class="debug-dot" data-index="{idx}">\n'
	svg += f'  <path d="{left_path}" fill="{color1}" />\n'
	svg += f'  <path d="{right_path}" fill="{color2}" />\n'
	# Thin outline for definition
	svg += f'  <circle cx="{x}" cy="{y}" r="{r}" '
	svg += f'fill="none" stroke="#333" stroke-width="0.5" />\n'
	# Tooltip text
	svg += f'  <title>{label}</title>\n'
	svg += f'</g>\n'
	return svg

#============================================
def generate_debug_html(schools: list, state_paths: list,
		coords: list, tier_name: str) -> str:
	"""Build a complete debug HTML page with the map and all dots."""
	html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n'
	html += '<meta charset="UTF-8">\n'
	html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
	html += f'<title>Debug Map - {tier_name} ({len(schools)} schools)</title>\n'
	html += '<style>\n'
	html += 'body { margin: 0; background: #1a1a2e; display: flex; '
	html += 'flex-direction: column; align-items: center; font-family: sans-serif; }\n'
	html += 'h1 { color: #e0e0e0; margin: 20px 0 5px; font-size: 20px; }\n'
	html += 'p.info { color: #aaa; margin: 0 0 10px; font-size: 14px; }\n'
	html += 'svg { max-width: 95vw; max-height: 80vh; }\n'
	html += '.debug-dot:hover { opacity: 0.7; cursor: pointer; }\n'
	# Light mode version
	html += '.map-light { background: #d4dae0; }\n'
	html += '.map-dark { background: #2a3040; }\n'
	html += '</style>\n</head>\n<body>\n'

	# Region color maps for subtle tinting
	light_region_colors = {
		"Northeast": "#dde4e8", "Southeast": "#e6ddd8",
		"Midwest": "#dde6d8", "Southwest": "#e8ddd4",
		"Mountain": "#d8dde6", "Pacific": "#e0d8e4",
	}
	dark_region_colors = {
		"Northeast": "#363e48", "Southeast": "#443a36",
		"Midwest": "#364436", "Southwest": "#483e34",
		"Mountain": "#363848", "Pacific": "#403648",
	}

	# Generate two maps: dark and light
	for theme, default_fill, state_stroke, map_class, bg_label, region_colors in [
		("dark", "#3a4050", "#4a5060", "map-dark", "Dark Mode", dark_region_colors),
		("light", "#e8e0d4", "#c8c0b4", "map-light", "Light Mode", light_region_colors),
	]:
		html += f'<h1>{tier_name} - {bg_label} ({len(schools)} schools)</h1>\n'
		html += f'<p class="info">Hover dots for school names</p>\n'
		html += f'<svg viewBox="0 0 960 600" class="{map_class}" '
		html += 'preserveAspectRatio="xMidYMid meet" '
		html += f'width="960" height="600">\n'

		# State paths with region-based fills
		html += '<g id="states">\n'
		for state in state_paths:
			# Use region color if available, otherwise default fill
			region = state.get("region", "")
			fill = region_colors.get(region, default_fill)
			html += f'  <path d="{state["d"]}" fill="{fill}" '
			html += f'stroke="{state_stroke}" stroke-width="1.0" '
			html += 'stroke-linejoin="round" />\n'
		html += '</g>\n'

		# School dots
		html += '<g id="dots">\n'
		for i, school in enumerate(schools):
			x, y = coords[i]
			label = f'{school["shortName"]} ({school["conference"]})'
			# Respect colorSwap flag for neighbor distinction
			if school.get("colorSwap"):
				c1 = school["colorSecondary"]
				c2 = school["colorPrimary"]
			else:
				c1 = school["colorPrimary"]
				c2 = school["colorSecondary"]
			dot_svg = make_half_dot_svg(
				x, y, 6,
				c1, c2,
				label, i
			)
			html += dot_svg
		html += '</g>\n'
		html += '</svg>\n'

	html += '</body>\n</html>\n'
	return html

#============================================
def main():
	"""Main entry point."""
	repo_root = get_repo_root()

	# Read source files
	constants_path = os.path.join(repo_root, "parts", "constants.js")
	map_data_path = os.path.join(repo_root, "parts", "map_data.js")

	with open(constants_path, "r") as f:
		constants_content = f.read()
	with open(map_data_path, "r") as f:
		map_data_content = f.read()

	# Parse data
	all_schools = parse_schools(constants_content)
	state_paths = parse_state_paths(map_data_content)
	print(f"Parsed {len(all_schools)} schools and {len(state_paths)} states")

	# Parse tier definitions from the DIFFICULTY_TIERS section
	tiers_start = constants_content.find("var DIFFICULTY_TIERS")
	tiers_section = constants_content[tiers_start:]
	# Find the closing ];
	tiers_end = tiers_section.find("];") + 2
	tiers_section = tiers_section[:tiers_end]
	tier_pattern = re.compile(
		r'name:\s*"([^"]+)".*?type:\s*"([^"]+)".*?values:\s*\[([^\]]*)\]',
		re.DOTALL
	)
	tiers = []
	for match in tier_pattern.finditer(tiers_section):
		tier_name = match.group(1)
		tier_type = match.group(2)
		values_str = match.group(3)
		values = re.findall(r'"([^"]+)"', values_str)
		tiers.append({"name": tier_name, "type": tier_type, "values": values})

	# Generate debug maps for each tier and for all schools
	for tier in tiers:
		# Filter schools based on tier type
		if tier["type"] == "all":
			tier_schools = list(all_schools)
		elif tier["type"] == "conference":
			tier_schools = [
				s for s in all_schools
				if s["conference"] in tier["values"]
			]
		elif tier["type"] == "subdivision":
			tier_schools = [
				s for s in all_schools
				if s.get("subdivision", "") in tier["values"]
			]
		else:
			tier_schools = []

		# Project coordinates
		raw_coords = [
			albers_projection(s["lat"], s["lon"])
			for s in tier_schools
		]
		coords = jitter_overlapping(raw_coords)

		# Generate HTML
		debug_html = generate_debug_html(
			tier_schools, state_paths, coords, tier["name"]
		)

		# Write output
		safe_name = tier["name"].lower().replace(" ", "_")
		output_path = os.path.join(repo_root, f"debug_map_{safe_name}.html")
		with open(output_path, "w") as f:
			f.write(debug_html)
		print(f"Wrote {output_path} ({len(tier_schools)} schools)")

	# Also generate an all-schools map
	raw_coords = [
		albers_projection(s["lat"], s["lon"])
		for s in all_schools
	]
	coords = jitter_overlapping(raw_coords)
	debug_html = generate_debug_html(
		all_schools, state_paths, coords, "All Schools"
	)
	output_path = os.path.join(repo_root, "debug_map_all_schools.html")
	with open(output_path, "w") as f:
		f.write(debug_html)
	print(f"Wrote {output_path} ({len(all_schools)} schools)")


#============================================
if __name__ == "__main__":
	main()
