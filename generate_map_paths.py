#!/usr/bin/env python3
"""Generate US state SVG paths from GeoJSON using Albers Equal-Area Conic projection."""

# Standard Library
import os
import json
import math

# FIPS code to state abbreviation mapping (continental US + DC only)
FIPS_TO_ABBR = {
	"01": "AL", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
	"09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA",
	"16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS",
	"21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA",
	"26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
	"31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
	"36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK",
	"41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
	"47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA",
	"53": "WA", "54": "WV", "55": "WI", "56": "WY",
}

# State abbreviation to full name
ABBR_TO_NAME = {
	"AL": "Alabama", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
	"CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
	"FL": "Florida", "GA": "Georgia", "ID": "Idaho", "IL": "Illinois",
	"IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky",
	"LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts",
	"MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
	"MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire",
	"NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
	"NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
	"OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
	"SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee",
	"TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia",
	"WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}


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
def main():
	"""Load GeoJSON, project to Albers, write map_data.js."""
	# determine repo root
	repo_root = os.path.dirname(os.path.abspath(__file__))
	geojson_path = os.path.join(repo_root, "us_states.geojson")
	output_path = os.path.join(repo_root, "parts", "map_data.js")
	# load GeoJSON
	with open(geojson_path, "r") as f:
		geojson = json.load(f)
	# process each feature
	state_entries = []
	for feature in geojson["features"]:
		fips = feature["id"]
		# skip non-continental states
		if fips not in FIPS_TO_ABBR:
			continue
		abbr = FIPS_TO_ABBR[fips]
		name = ABBR_TO_NAME[abbr]
		# convert geometry to SVG path
		path_d = geometry_to_path(feature["geometry"], tolerance=0.5)
		if not path_d:
			print(f"WARNING: empty path for {abbr} ({name})")
			continue
		state_entries.append({
			"id": abbr,
			"name": name,
			"d": path_d,
		})
	# sort by abbreviation
	state_entries.sort(key=lambda e: e["id"])
	# verify count
	print(f"Generated paths for {len(state_entries)} states")
	# build output JavaScript
	lines = []
	lines.append(
		"/* map_data.js - US State SVG Path Strings (Albers projection) */"
	)
	lines.append(
		"/* State boundary paths are pre-projected using "
		"Albers Equal-Area Conic projection */"
	)
	lines.append(
		"/* matching ALBERS_CONFIG in map_projection.js for 960x600 viewBox */"
	)
	lines.append("")
	lines.append("var US_STATE_PATHS = [")
	for i, entry in enumerate(state_entries):
		# determine trailing comma
		comma = "," if i < len(state_entries) - 1 else ""
		lines.append("\t{")
		lines.append(f'\t\tid: "{entry["id"]}",')
		lines.append(f'\t\tname: "{entry["name"]}",')
		lines.append(f'\t\td: "{entry["d"]}"')
		lines.append(f"\t}}{comma}")
	lines.append("];")
	lines.append("")
	# write output
	output_text = "\n".join(lines)
	with open(output_path, "w") as f:
		f.write(output_text)
	# report file size
	file_size = os.path.getsize(output_path)
	print(f"Wrote {output_path} ({file_size:,} bytes)")


#============================================
if __name__ == "__main__":
	main()
