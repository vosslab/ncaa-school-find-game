#!/usr/bin/env python3
"""Capture baseline parity fixtures from current game data files.

Reads parts/constants.js (NCAA_SCHOOLS, DIFFICULTY_TIERS, SUBREGIONS) and
parts/map_data.js (US_STATE_PATHS) and writes canonical JSON snapshots under
baseline/.  Also copies generate_debug_map.py HTML outputs into
baseline/debug_map/.  Playwright smoke screenshots go into baseline/smoke/ when
Playwright is available; the step is skipped gracefully when it is not.

Usage:
    source source_me.sh && python3 tests/capture_baseline.py
"""

import os
import re
import json
import shutil
import subprocess

#============================================
def get_repo_root() -> str:
	"""Return the absolute path to the repository root."""
	result = subprocess.run(
		["git", "rev-parse", "--show-toplevel"],
		capture_output=True, text=True, check=True
	)
	repo_root = result.stdout.strip()
	return repo_root

#============================================
def read_file(path: str) -> str:
	"""Read and return the contents of a text file."""
	with open(path, "r", encoding="utf-8") as fh:
		content = fh.read()
	return content

#============================================
def parse_schools(js_content: str) -> list:
	"""Extract all school objects from the NCAA_SCHOOLS array in constants.js.

	Each school object has the fields: name, shortName, mascot, conference,
	subdivision, city, state, lat, lon, colorPrimary, colorSecondary,
	colorSwap (bool, default False), hintRegion.

	Returns:
		List of dicts, one per school, with sorted keys.
	"""
	# Extract the NCAA_SCHOOLS array body
	start_marker = "var NCAA_SCHOOLS = ["
	start_idx = js_content.find(start_marker)
	if start_idx == -1:
		raise ValueError("Could not find 'var NCAA_SCHOOLS = [' in constants.js")
	# Find the matching ]; by scanning for the first ]; after the array start
	array_body_start = start_idx + len(start_marker)
	# Locate the closing ];
	end_idx = js_content.find("];", array_body_start)
	if end_idx == -1:
		raise ValueError("Could not find closing ''];' for NCAA_SCHOOLS")
	array_body = js_content[array_body_start:end_idx]

	schools = []
	# Each school is one { ... } block (no nested braces in school objects)
	block_pattern = re.compile(r'\{[^{}]+\}', re.DOTALL)
	for block_match in block_pattern.finditer(array_body):
		block = block_match.group(0)
		# Only process blocks that have shortName (school entries)
		if 'shortName:' not in block:
			continue

		# Helper to extract a quoted string field value
		def get_str(field: str, text: str) -> str:
			m = re.search(rf'{field}:\s*"([^"]*)"', text)
			return m.group(1) if m else ""

		# Helper to extract a numeric field value
		def get_num(field: str, text: str) -> float:
			m = re.search(rf'{field}:\s*([\d.-]+)', text)
			return float(m.group(1)) if m else 0.0

		short_name = get_str("shortName", block)
		if not short_name:
			continue

		# colorSwap is an optional boolean flag
		color_swap = "colorSwap: true" in block or "colorSwap:true" in block

		school = {
			"city": get_str("city", block),
			"colorPrimary": get_str("colorPrimary", block),
			"colorSecondary": get_str("colorSecondary", block),
			"colorSwap": color_swap,
			"conference": get_str("conference", block),
			"hintRegion": get_str("hintRegion", block),
			"lat": get_num("lat", block),
			"lon": get_num("lon", block),
			"mascot": get_str("mascot", block),
			"name": get_str("name", block),
			"shortName": short_name,
			"state": get_str("state", block),
			"subdivision": get_str("subdivision", block),
		}
		schools.append(school)

	return schools

#============================================
def parse_tiers(js_content: str) -> list:
	"""Extract all tier definitions from DIFFICULTY_TIERS in constants.js.

	Returns:
		List of dicts with keys: name, type, values.
	"""
	start_marker = "var DIFFICULTY_TIERS = ["
	start_idx = js_content.find(start_marker)
	if start_idx == -1:
		raise ValueError("Could not find 'var DIFFICULTY_TIERS = [' in constants.js")
	array_body_start = start_idx + len(start_marker)
	end_idx = js_content.find("];", array_body_start)
	if end_idx == -1:
		raise ValueError("Could not find closing ''];' for DIFFICULTY_TIERS")
	array_body = js_content[array_body_start:end_idx]

	tiers = []
	# Each tier is a single-line or short object: { name: "...", type: "...", values: [...] }
	tier_pattern = re.compile(
		r'\{\s*name:\s*"([^"]+)".*?type:\s*"([^"]+)".*?values:\s*\[([^\]]*)\]',
		re.DOTALL
	)
	for m in tier_pattern.finditer(array_body):
		tier_name = m.group(1)
		tier_type = m.group(2)
		values_str = m.group(3)
		# Extract quoted string values from the values array
		values = re.findall(r'"([^"]+)"', values_str)
		tiers.append({
			"name": tier_name,
			"type": tier_type,
			"values": values,
		})
	return tiers

#============================================
def parse_subregions(js_content: str) -> dict:
	"""Extract SUBREGIONS mapping from constants.js.

	Returns:
		Dict mapping region name -> list of state abbreviations.
	"""
	start_marker = "var SUBREGIONS = {"
	start_idx = js_content.find(start_marker)
	if start_idx == -1:
		raise ValueError("Could not find 'var SUBREGIONS = {' in constants.js")
	body_start = start_idx + len(start_marker)
	end_idx = js_content.find("};", body_start)
	if end_idx == -1:
		raise ValueError("Could not find closing '};' for SUBREGIONS")
	body = js_content[body_start:end_idx]

	subregions = {}
	# Each line: "RegionName": ["ST","ST",...],
	line_pattern = re.compile(r'"([^"]+)":\s*\[([^\]]*)\]')
	for m in line_pattern.finditer(body):
		region = m.group(1)
		states_str = m.group(2)
		states = re.findall(r'"([^"]+)"', states_str)
		subregions[region] = states
	return subregions

#============================================
def parse_state_paths(js_content: str) -> list:
	"""Extract all state path objects from US_STATE_PATHS in map_data.js.

	Returns:
		List of dicts with keys: id, labelX, labelY, name, region, d.
	"""
	start_marker = "var US_STATE_PATHS = ["
	start_idx = js_content.find(start_marker)
	if start_idx == -1:
		raise ValueError("Could not find 'var US_STATE_PATHS = [' in map_data.js")
	array_body_start = start_idx + len(start_marker)
	end_idx = js_content.find("];", array_body_start)
	if end_idx == -1:
		raise ValueError("Could not find closing ''];' for US_STATE_PATHS")
	array_body = js_content[array_body_start:end_idx]

	state_paths = []
	# Each state is one { ... } block
	block_pattern = re.compile(r'\{[^{}]+\}', re.DOTALL)
	for block_match in block_pattern.finditer(array_body):
		block = block_match.group(0)
		if 'id:' not in block:
			continue

		def get_str(field: str, text: str) -> str:
			# Use \b word boundary so 'd:' does not match 'id:' substring
			m = re.search(rf'\b{field}:\s*"([^"]*)"', text)
			return m.group(1) if m else ""

		def get_num(field: str, text: str) -> float:
			m = re.search(rf'\b{field}:\s*([\d.-]+)', text)
			return float(m.group(1)) if m else 0.0

		state_id = get_str("id", block)
		if not state_id:
			continue

		state_paths.append({
			"d": get_str("d", block),
			"id": state_id,
			"labelX": get_num("labelX", block),
			"labelY": get_num("labelY", block),
			"name": get_str("name", block),
			"region": get_str("region", block),
		})

	return state_paths

#============================================
def write_json(path: str, data: object) -> None:
	"""Write data as formatted JSON to path, creating parent dirs as needed."""
	os.makedirs(os.path.dirname(path), exist_ok=True)
	with open(path, "w", encoding="utf-8") as fh:
		json.dump(data, fh, indent=2, sort_keys=True, ensure_ascii=True)
		# Ensure trailing newline
		fh.write("\n")

#============================================
def run_debug_map(repo_root: str) -> None:
	"""Run generate_debug_map.py and copy outputs into baseline/debug_map/.

	The script is run via 'source source_me.sh && python3 generate_debug_map.py'
	which matches the project's Python execution convention.
	"""
	print("\n--- Running generate_debug_map.py ---")
	source_me = os.path.join(repo_root, "source_me.sh")
	gen_script = os.path.join(repo_root, "generate_debug_map.py")
	# Run from repo_root so the script finds parts/ and writes files there
	result = subprocess.run(
		["bash", "-c", f"source {source_me} && python3 {gen_script}"],
		capture_output=False,
		cwd=repo_root,
	)
	if result.returncode != 0:
		print(f"WARNING: generate_debug_map.py exited with code {result.returncode}")

	# Copy all debug_map_*.html files from repo root into baseline/debug_map/
	debug_map_dir = os.path.join(repo_root, "baseline", "debug_map")
	os.makedirs(debug_map_dir, exist_ok=True)
	copied = 0
	for filename in os.listdir(repo_root):
		if filename.startswith("debug_map_") and filename.endswith(".html"):
			src = os.path.join(repo_root, filename)
			dst = os.path.join(debug_map_dir, filename)
			shutil.copy2(src, dst)
			copied += 1
			print(f"  Copied {filename} -> baseline/debug_map/")
	print(f"  Total debug map files copied: {copied}")

#============================================
def run_playwright_smoke(repo_root: str) -> None:
	"""Attempt to capture Playwright smoke screenshots into baseline/smoke/.

	Requires that ncaa_school_find_game.html exists (built by build_game.sh).
	If Playwright is not available or fails, prints SKIPPED with the exact error.
	"""
	print("\n--- Playwright smoke screenshots ---")

	# Ensure the single-file HTML exists first
	single_file = os.path.join(repo_root, "ncaa_school_find_game.html")
	if not os.path.exists(single_file):
		print("  ncaa_school_find_game.html not found; running build_game.sh ...")
		build_script = os.path.join(repo_root, "build_game.sh")
		result = subprocess.run(
			["bash", build_script],
			capture_output=False,
			cwd=repo_root,
		)
		if result.returncode != 0:
			print("  SKIPPED: build_game.sh failed, cannot run Playwright smoke")
			return
	if not os.path.exists(single_file):
		print("  SKIPPED: ncaa_school_find_game.html still missing after build")
		return

	smoke_dir = os.path.join(repo_root, "baseline", "smoke")
	os.makedirs(smoke_dir, exist_ok=True)

	# Check whether npx playwright is available
	check = subprocess.run(
		["npx", "playwright", "--version"],
		capture_output=True, text=True,
		cwd=repo_root,
	)
	if check.returncode != 0:
		print(f"  SKIPPED: 'npx playwright --version' failed")
		print(f"  stdout: {check.stdout.strip()}")
		print(f"  stderr: {check.stderr.strip()}")
		return

	print(f"  Playwright version: {check.stdout.strip()}")

	# Build a tiny Playwright script to capture the setup screen and one question
	script_path = os.path.join(repo_root, "_temp_smoke_capture.mjs")
	file_url = f"file://{single_file}"
	script_content = f"""
import {{ chromium }} from 'playwright';
import path from 'path';

const SMOKE_DIR = {json.dumps(smoke_dir)};
const FILE_URL = {json.dumps(file_url)};

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({{ width: 1280, height: 800 }});

// 1. Setup screen
await page.goto(FILE_URL);
await page.waitForLoadState('networkidle');
await page.screenshot({{ path: path.join(SMOKE_DIR, 'setup_screen.png') }});
console.log('Captured setup_screen.png');

// 2. Click Start on the first (default) tier and capture one question
const startBtn = page.locator('#start-btn, button:has-text("Start")');
if (await startBtn.count() > 0) {{
	await startBtn.first().click();
	await page.waitForTimeout(800);
	await page.screenshot({{ path: path.join(SMOKE_DIR, 'question_tier1.png') }});
	console.log('Captured question_tier1.png');
}} else {{
	console.log('WARNING: could not find Start button');
}}

// 3. One screenshot per remaining tier (tiers 2-5) via the setup screen
const tier_names = ['FBS', 'FCS', 'Non-Football', 'All Division I'];
for (let i = 0; i < tier_names.length; i++) {{
	await page.goto(FILE_URL);
	await page.waitForLoadState('networkidle');
	// Select the tier radio by index (0-based; index 0 = Major Conferences already done)
	const radios = page.locator('input[type="radio"]');
	if (await radios.count() > i + 1) {{
		await radios.nth(i + 1).click();
	}}
	const btn = page.locator('#start-btn, button:has-text("Start")');
	if (await btn.count() > 0) {{
		await btn.first().click();
		await page.waitForTimeout(800);
		const safe_name = tier_names[i].toLowerCase().replace(/ /g, '_');
		await page.screenshot({{ path: path.join(SMOKE_DIR, `question_${{safe_name}}.png`) }});
		console.log(`Captured question_${{safe_name}}.png`);
	}}
}}

await browser.close();
console.log('Playwright smoke capture complete.');
"""
	with open(script_path, "w", encoding="utf-8") as fh:
		fh.write(script_content)

	print("  Running Playwright smoke capture script ...")
	run_result = subprocess.run(
		["node", script_path],
		capture_output=True, text=True,
		cwd=repo_root,
	)
	print(run_result.stdout)
	if run_result.returncode != 0:
		print(f"  SKIPPED: Playwright script failed (exit code {run_result.returncode})")
		print(f"  stderr: {run_result.stderr.strip()}")
	else:
		print(f"  Playwright smoke screenshots written to baseline/smoke/")

	# Clean up temp script
	if os.path.exists(script_path):
		os.remove(script_path)

#============================================
def main() -> None:
	"""Parse game data files and write baseline parity fixtures."""
	repo_root = get_repo_root()
	print(f"Repo root: {repo_root}")

	# Source file paths
	constants_path = os.path.join(repo_root, "parts", "constants.js")
	map_data_path = os.path.join(repo_root, "parts", "map_data.js")

	# Read source files
	print("\n--- Reading source files ---")
	constants_content = read_file(constants_path)
	map_data_content = read_file(map_data_path)
	print(f"  Read {len(constants_content):,} bytes from parts/constants.js")
	print(f"  Read {len(map_data_content):,} bytes from parts/map_data.js")

	# Parse data structures
	print("\n--- Parsing data ---")
	schools = parse_schools(constants_content)
	tiers = parse_tiers(constants_content)
	subregions = parse_subregions(constants_content)
	state_paths = parse_state_paths(map_data_content)

	# Print element counts (verification output required by the plan)
	print(f"  Schools parsed:   {len(schools)}")
	print(f"  Tiers parsed:     {len(tiers)}")
	print(f"  Subregion keys:   {len(subregions)}")
	print(f"  State paths:      {len(state_paths)}")

	# Report tier names and sizes for a quick sanity check
	for tier in tiers:
		print(f"    Tier '{tier['name']}': type={tier['type']}, values={tier['values']}")

	# Write baseline JSON fixtures
	print("\n--- Writing baseline JSON fixtures ---")
	baseline_dir = os.path.join(repo_root, "baseline")
	os.makedirs(baseline_dir, exist_ok=True)

	schools_path = os.path.join(baseline_dir, "schools.json")
	tiers_path = os.path.join(baseline_dir, "tiers.json")
	subregions_path = os.path.join(baseline_dir, "subregions.json")
	state_paths_path = os.path.join(baseline_dir, "state_paths.json")

	write_json(schools_path, schools)
	print(f"  Wrote baseline/schools.json ({len(schools)} entries)")

	write_json(tiers_path, tiers)
	print(f"  Wrote baseline/tiers.json ({len(tiers)} entries)")

	write_json(subregions_path, subregions)
	print(f"  Wrote baseline/subregions.json ({len(subregions)} keys)")

	write_json(state_paths_path, state_paths)
	print(f"  Wrote baseline/state_paths.json ({len(state_paths)} entries)")

	# Run generate_debug_map.py and collect HTML outputs
	run_debug_map(repo_root)

	# Attempt Playwright smoke screenshots
	run_playwright_smoke(repo_root)

	print("\n--- Summary ---")
	print(f"  baseline/schools.json:    {len(schools)} schools")
	print(f"  baseline/tiers.json:      {len(tiers)} tiers")
	print(f"  baseline/subregions.json: {len(subregions)} region keys")
	print(f"  baseline/state_paths.json:{len(state_paths)} state paths")

	# List what ended up in baseline/
	print("\nbaseline/ contents:")
	for entry in sorted(os.listdir(baseline_dir)):
		entry_path = os.path.join(baseline_dir, entry)
		if os.path.isdir(entry_path):
			sub_entries = sorted(os.listdir(entry_path))
			print(f"  {entry}/ ({len(sub_entries)} files)")
			for sub in sub_entries:
				print(f"    {sub}")
		else:
			size = os.path.getsize(entry_path)
			print(f"  {entry} ({size:,} bytes)")


#============================================
if __name__ == "__main__":
	main()
