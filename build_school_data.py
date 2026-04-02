#!/usr/bin/env python3
"""Build school data from CSV files and existing constants.js.

Reads CSV files, merges with existing school data, geocodes new schools,
looks up school colors from Wikipedia, and outputs updated parts/constants.js.

Usage:
    source source_me.sh && python3 build_school_data.py
"""

# Standard Library
import os
import re
import csv
import json
import time
import random
import subprocess

# PIP3 modules
import requests

# Conference full name -> abbreviation mapping
CONFERENCE_MAP = {
	"American Conference": "AAC",
	"Atlantic Coast Conference": "ACC",
	"Atlantic 10 Conference": "A-10",
	"Atlantic Sun Conference": "ASUN",
	"America East Conference": "America East",
	"Big 12 Conference": "Big 12",
	"Big East Conference": "Big East",
	"Big Sky Conference": "Big Sky",
	"Big South Conference": "Big South",
	"Big Ten Conference": "Big Ten",
	"Big West Conference": "Big West",
	"Coastal Athletic Association": "CAA",
	"Conference USA": "C-USA",
	"Horizon League": "Horizon",
	"Ivy League": "Ivy",
	"Metro Atlantic Athletic Conference": "MAAC",
	"Mid-American Conference": "MAC",
	"Mid-Eastern Athletic Conference": "MEAC",
	"Missouri Valley Conference": "MVC",
	"Mountain West Conference": "MWC",
	"NEC": "NEC",
	"Ohio Valley Conference": "OVC",
	"Pac-12 Conference": "Pac-12",
	"Patriot League": "Patriot",
	"Southeastern Conference": "SEC",
	"Southern Conference": "SoCon",
	"Southland Conference": "Southland",
	"Sun Belt Conference": "Sun Belt",
	"Southwestern Athletic Conference": "SWAC",
	"Summit League": "Summit",
	"West Coast Conference": "WCC",
	"Western Athletic Conference": "WAC",
}

# State -> hintRegion mapping (inverted from SUBREGIONS in constants.js)
STATE_TO_REGION = {}
SUBREGIONS = {
	"Northeast": ["ME","NH","VT","MA","RI","CT","NY","NJ","PA","MD","DE","DC"],
	"Southeast": ["VA","WV","NC","SC","GA","FL","AL","MS","TN","KY","LA","AR"],
	"Midwest": ["OH","IN","IL","MI","WI","MN","IA","MO","ND","SD","NE","KS"],
	"Southwest": ["TX","OK","NM","AZ"],
	"Mountain": ["CO","UT","WY","MT","ID","NV"],
	"Pacific": ["WA","OR","CA","HI"],
}
for region, states in SUBREGIONS.items():
	for state in states:
		STATE_TO_REGION[state] = region

# Manual coordinate overrides for tricky geocoding cases
COORD_OVERRIDES = {
	# City names that don't geocode well
	"Ole Miss": (34.3647, -89.5386),
	"Boston College": (42.3355, -71.1685),
	"Penn State": (40.7982, -77.8599),
	"Army / Army West Point": (41.3915, -73.9565),
	"Navy": (38.9834, -76.4891),
	"Air Force": (38.9983, -104.8614),
	"NJIT": (40.7424, -74.1793),
	"FIU": (25.7563, -80.3740),
	"LIU": (40.6892, -73.9857),
	"FGCU": (26.4631, -81.7732),
	"SIUE": (38.7907, -89.9969),
	"UIC": (41.8714, -87.6492),
	"IU Indy": (39.7737, -86.1753),
	"Purdue Fort Wayne": (41.1150, -85.1086),
	"UMBC": (39.2554, -76.7109),
	"UMass / Massachusetts": (42.3868, -72.5301),
	"UTRGV": (26.3058, -98.1740),
	"SEMO": (37.3112, -89.5599),
	"VCU": (37.5489, -77.4530),
	"USC Upstate": (34.9485, -81.9322),
	"Incarnate Word": (29.4618, -98.4686),
	"Saint Francis (PA)": (40.5035, -78.6380),
	"Queens (NC)": (35.1889, -80.8318),
	"UMass Lowell": (42.6535, -71.3243),
	"Cal Baptist": (33.9306, -117.4258),
	"Purdue": (40.4237, -86.9212),
	"UNLV": (36.1084, -115.1440),
	"Nevada": (39.5436, -119.8158),
	"Hawaii": (21.2969, -157.8171),
	"Stony Brook": (40.9126, -73.1234),
	"UT Arlington": (32.7299, -97.1140),
	"UT Martin": (36.3423, -88.8479),
	"SMU": (32.8413, -96.7833),
	"UCF": (28.6024, -81.2001),
	"UNCW": (34.2275, -77.8728),
	"UNC Asheville": (35.6132, -82.5665),
	"UNC Greensboro": (36.0688, -79.8103),
}

# Known school colors (primary, secondary) - manually curated
# Used when the school is not already in constants.js
KNOWN_SCHOOL_COLORS = {
	# FBS schools not in original 193
	"California": ("#003262", "#FDB515"),
	"Miami (Florida)": ("#F47321", "#005030"),
	"UConn": ("#000E2F", "#A2AAAD"),
	"Hawaii": ("#024731", "#000000"),
	"Jax State": ("#CC0000", "#A0A0A0"),
	"Delaware": ("#00539F", "#FFD200"),
	"Miami (Ohio)": ("#C3142D", "#FFFFFF"),
	"UMass / Massachusetts": ("#881C1C", "#000000"),
	"Navy": ("#00205B", "#C5B358"),
	"Nevada": ("#003366", "#82899A"),
	"UNLV": ("#CF0A2C", "#666666"),
	"ULM": ("#800000", "#D4A017"),
	"Kentucky": ("#0033A0", "#FFFFFF"),
	"Notre Dame": ("#0C2340", "#C99700"),
	"BYU": ("#002E5D", "#FFFFFF"),
	"West Virginia": ("#002855", "#EAAA00"),
	"UCLA": ("#2D68C4", "#F2A900"),
	"Pittsburgh": ("#003594", "#FFB81C"),
	"Virginia": ("#232D4B", "#F84C1E"),
	"Florida Atlantic": ("#003366", "#CC0000"),
	"Duke": ("#003087", "#FFFFFF"),
	"Akron": ("#041E42", "#A89968"),
	# FCS schools
	"Bryant": ("#000000", "#D4AF37"),
	"Albany": ("#461D7C", "#EAAA00"),
	"Maine": ("#003263", "#B0D7FF"),
	"New Hampshire": ("#003DA5", "#FFFFFF"),
	"Davidson": ("#CC0000", "#000000"),
	"Duquesne": ("#003366", "#CC0000"),
	"Fordham": ("#800000", "#FFFFFF"),
	"Dayton": ("#CE1141", "#004B8D"),
	"Rhode Island": ("#75B2DD", "#002147"),
	"Richmond": ("#990000", "#00205B"),
	"Stetson": ("#006747", "#FFFFFF"),
	"Austin Peay": ("#CC0000", "#FFFFFF"),
	"Eastern Kentucky": ("#861F41", "#FFFFFF"),
	"Central Arkansas": ("#4F2D7F", "#808080"),
	"North Alabama": ("#461D7C", "#FFFFFF"),
	"Butler": ("#13294B", "#FFFFFF"),
	"Georgetown": ("#041E42", "#808080"),
	"Villanova": ("#003366", "#FFFFFF"),
	"Eastern Washington": ("#A10022", "#000000"),
	"Idaho State": ("#FF6600", "#000000"),
	"Montana State": ("#003875", "#D4AF37"),
	"Northern Arizona": ("#003466", "#006340"),
	"Portland State": ("#154733", "#FFFFFF"),
	"Idaho": ("#B5985A", "#000000"),
	"Montana": ("#660033", "#808080"),
	"Northern Colorado": ("#013C65", "#F0CB00"),
	"Weber State": ("#4B2682", "#FFFFFF"),
	"Sacramento State": ("#043927", "#C4B581"),
	"Charleston Southern": ("#003087", "#BF9B30"),
	"Gardner-Webb": ("#CC0000", "#000000"),
	"Bethune-Cookman": ("#800000", "#F0AB00"),
	"Arkansas-Pine Bluff": ("#000000", "#F0AB00"),
	"Hawaii": ("#024731", "#000000"),
	"Texas A&M-Corpus Christi": ("#003DA5", "#006633"),
	"Presbyterian": ("#00205B", "#808080"),
	"Cal Poly": ("#1F4F2E", "#C5960C"),
	"UC Davis": ("#002855", "#DAAA00"),
	"Campbell": ("#F47920", "#000000"),
	"Elon": ("#800000", "#C5960C"),
	"Hampton": ("#003DA5", "#FFFFFF"),
	"Monmouth": ("#002D72", "#FFFFFF"),
	"North Carolina A&T": ("#004684", "#F0AB00"),
	"Stony Brook": ("#990000", "#A0A0A0"),
	"Towson": ("#FFB81C", "#000000"),
	"William & Mary": ("#115740", "#D4AF37"),
	"Robert Morris": ("#003366", "#CC0000"),
	"Youngstown State": ("#CC0000", "#FFFFFF"),
	"Brown": ("#4E3629", "#CC0000"),
	"Columbia": ("#1D4F91", "#FFFFFF"),
	"Cornell": ("#B31B1B", "#FFFFFF"),
	"Dartmouth": ("#00693E", "#FFFFFF"),
	"Harvard": ("#A51C30", "#000000"),
	"Princeton": ("#FF6600", "#000000"),
	"Penn": ("#011F5B", "#990000"),
	"Yale": ("#00356B", "#FFFFFF"),
	"Marist": ("#CC0000", "#FFFFFF"),
	"Merrimack": ("#002D72", "#DAA520"),
	"Sacred Heart": ("#CC0000", "#808080"),
	"Delaware State": ("#CC0000", "#003399"),
	"Howard": ("#003399", "#CC0000"),
	"Morgan State": ("#F47920", "#003399"),
	"Norfolk State": ("#007A33", "#D4AF37"),
	"North Carolina Central": ("#800000", "#808080"),
	"South Carolina State": ("#800000", "#003399"),
	"Drake": ("#004477", "#FFFFFF"),
	"Illinois State": ("#CE1141", "#FFFFFF"),
	"Indiana State": ("#003DA5", "#FFFFFF"),
	"Murray State": ("#002144", "#F0AB00"),
	"Southern Illinois": ("#800000", "#FFFFFF"),
	"Northern Iowa": ("#4B116F", "#F0AB00"),
	"Valparaiso": ("#613318", "#F0AB00"),
	"Central Connecticut": ("#003DA5", "#FFFFFF"),
	"LIU": ("#004C97", "#DAA520"),
	"Saint Francis (PA)": ("#990000", "#FFFFFF"),
	"Stonehill": ("#461D7C", "#FFFFFF"),
	"Wagner": ("#154734", "#FFFFFF"),
	"Eastern Illinois": ("#004B83", "#808080"),
	"Lindenwood": ("#000000", "#F0AB00"),
	"SEMO": ("#CC0000", "#000000"),
	"Tennessee State": ("#003399", "#FFFFFF"),
	"UT Martin": ("#FF6600", "#003366"),
	"Western Illinois": ("#4F2683", "#F0AB00"),
	"Tennessee Tech": ("#4F2683", "#F0AB00"),
	"Morehead State": ("#003399", "#F0AB00"),
	"Bucknell": ("#F47920", "#003366"),
	"Colgate": ("#800000", "#FFFFFF"),
	"Holy Cross": ("#602D89", "#FFFFFF"),
	"Lafayette": ("#800000", "#FFFFFF"),
	"Lehigh": ("#502D0E", "#FFFFFF"),
	"East Tennessee State": ("#041E42", "#F0AB00"),
	"Furman": ("#582C83", "#FFFFFF"),
	"Mercer": ("#F47920", "#000000"),
	"Samford": ("#003366", "#CC0000"),
	"The Citadel": ("#003DA5", "#FFFFFF"),
	"Chattanooga": ("#003399", "#F0AB00"),
	"VMI": ("#CC0000", "#F0AB00"),
	"Western Carolina": ("#592C88", "#C5960C"),
	"Wofford": ("#886B3D", "#000000"),
	"East Texas A&M": ("#003399", "#F0AB00"),
	"Houston Christian": ("#FF6600", "#003399"),
	"Lamar": ("#CC0000", "#FFFFFF"),
	"McNeese": ("#003DA5", "#F0AB00"),
	"Nicholls": ("#CC0000", "#808080"),
	"Northwestern State": ("#4F2683", "#F47920"),
	"Southeastern Louisiana": ("#046A38", "#F0AB00"),
	"Stephen F. Austin": ("#4F2683", "#FFFFFF"),
	"UTRGV": ("#003399", "#F47920"),
	"Incarnate Word": ("#CC0000", "#000000"),
	"Alabama A&M": ("#800000", "#FFFFFF"),
	"Alabama State": ("#000000", "#F0AB00"),
	"Alcorn State": ("#4F2683", "#F0AB00"),
	"Bethune-Cookman": ("#800000", "#F0AB00"),
	"Florida A&M": ("#F47920", "#046A38"),
	"Grambling State": ("#000000", "#F0AB00"),
	"Jackson State": ("#003399", "#FFFFFF"),
	"Mississippi Valley State": ("#006747", "#FFFFFF"),
	"Prairie View A&M": ("#4F2683", "#F0AB00"),
	"Southern": ("#003DA5", "#F0AB00"),
	"Texas Southern": ("#800000", "#808080"),
	"Arkansas-Pine Bluff": ("#000000", "#F0AB00"),
	"North Dakota State": ("#006340", "#F0AB00"),
	"South Dakota State": ("#003DA5", "#F0AB00"),
	"North Dakota": ("#009A44", "#FFFFFF"),
	"St. Thomas": ("#4F2683", "#808080"),
	"South Dakota": ("#CC0000", "#FFFFFF"),
	"San Diego": ("#002D62", "#87CEEB"),
	"Abilene Christian": ("#4F2683", "#FFFFFF"),
	"Tarleton State": ("#4F2683", "#FFFFFF"),
	"Southern Utah": ("#CC0000", "#003399"),
	"Utah Tech": ("#CC0000", "#003399"),
	# Non-football schools
	"NJIT": ("#CC0000", "#003399"),
	"Binghamton": ("#005943", "#FFFFFF"),
	"Vermont": ("#003300", "#F0AB00"),
	"UMBC": ("#000000", "#F0AB00"),
	"UMass Lowell": ("#003DA5", "#CC0000"),
	"Wichita State": ("#000000", "#F0AB00"),
	"George Mason": ("#006633", "#F0AB00"),
	"La Salle": ("#003399", "#F0AB00"),
	"Loyola Chicago": ("#800000", "#F0AB00"),
	"St. Bonaventure": ("#6C3B2A", "#FFFFFF"),
	"Saint Joseph's": ("#9E1B32", "#FFFFFF"),
	"Saint Louis": ("#003DA5", "#FFFFFF"),
	"George Washington": ("#033C5A", "#BF8B67"),
	"VCU": ("#000000", "#F0AB00"),
	"FGCU": ("#002D72", "#00A651"),
	"Jacksonville": ("#00583A", "#FFFFFF"),
	"Lipscomb": ("#461D7C", "#F0AB00"),
	"Queens (NC)": ("#002D72", "#808080"),
	"North Florida": ("#003399", "#808080"),
	"Bellarmine": ("#9E1B32", "#FFFFFF"),
	"Creighton": ("#005CA9", "#FFFFFF"),
	"DePaul": ("#003DA5", "#CC0000"),
	"Marquette": ("#003366", "#F0AB00"),
	"Providence": ("#000000", "#FFFFFF"),
	"St. John's": ("#CC0000", "#FFFFFF"),
	"Seton Hall": ("#003DA5", "#FFFFFF"),
	"Xavier": ("#003366", "#808080"),
	"High Point": ("#4F2683", "#000000"),
	"Longwood": ("#003DA5", "#FFFFFF"),
	"Radford": ("#CC0000", "#003366"),
	"UNC Asheville": ("#003DA5", "#FFFFFF"),
	"USC Upstate": ("#006340", "#000000"),
	"Winthrop": ("#660000", "#003366"),
	"Bakersfield": ("#003DA5", "#F0AB00"),
	"Cal State Fullerton": ("#003366", "#F47920"),
	"Long Beach State": ("#000000", "#F0AB00"),
	"Cal State Northridge / CSUN": ("#CC0000", "#000000"),
	"UC Irvine": ("#003DA5", "#F0AB00"),
	"UC Riverside": ("#003DA5", "#F0AB00"),
	"UC Santa Barbara": ("#003660", "#FEBC11"),
	"UC San Diego": ("#003366", "#C4960C"),
	"Charleston": ("#800000", "#C5960C"),
	"Drexel": ("#002D72", "#F0AB00"),
	"Hofstra": ("#002D72", "#F0AB00"),
	"Northeastern": ("#CC0000", "#000000"),
	"UNCW": ("#006666", "#D4AF37"),
	"Cleveland State": ("#006747", "#FFFFFF"),
	"IU Indy": ("#CC0000", "#C5960C"),
	"Northern Kentucky": ("#000000", "#F0AB00"),
	"Oakland": ("#000000", "#B59A57"),
	"Purdue Fort Wayne": ("#003366", "#CEB888"),
	"Detroit Mercy": ("#CC0000", "#003366"),
	"Green Bay": ("#006747", "#FFFFFF"),
	"Milwaukee": ("#000000", "#F0AB00"),
	"Wright State": ("#00664F", "#F0AB00"),
	"Canisius": ("#003399", "#F0AB00"),
	"Fairfield": ("#CC0000", "#FFFFFF"),
	"Iona": ("#800000", "#F0AB00"),
	"Manhattan": ("#006633", "#FFFFFF"),
	"Mount St. Mary's": ("#003399", "#FFFFFF"),
	"Niagara": ("#4F2683", "#FFFFFF"),
	"Quinnipiac": ("#003366", "#F0AB00"),
	"Rider": ("#9E1B32", "#808080"),
	"Saint Peter's": ("#003DA5", "#FFFFFF"),
	"Siena": ("#006633", "#F0AB00"),
	"Coppin State": ("#003DA5", "#F0AB00"),
	"Maryland Eastern Shore": ("#800000", "#808080"),
	"Belmont": ("#003366", "#CC0000"),
	"Bradley": ("#CC0000", "#FFFFFF"),
	"Evansville": ("#4F2683", "#F47920"),
	"UIC": ("#003366", "#CC0000"),
	"Grand Canyon": ("#4F2683", "#FFFFFF"),
	"Chicago State": ("#006633", "#FFFFFF"),
	"Fairleigh Dickinson": ("#042B68", "#FFFFFF"),
	"SIUE": ("#CC0000", "#000000"),
	"Southern Indiana": ("#CC0000", "#003DA5"),
	"Little Rock": ("#800000", "#808080"),
	"American": ("#003DA5", "#CC0000"),
	"Boston University": ("#CC0000", "#FFFFFF"),
	"Loyola": ("#00694E", "#808080"),
	"UNC Greensboro": ("#003366", "#F0AB00"),
	"Texas A&M-Corpus Christi": ("#003DA5", "#006633"),
	"New Orleans": ("#003DA5", "#808080"),
	"Oral Roberts": ("#003366", "#C4960C"),
	"Kansas City": ("#003DA5", "#F0AB00"),
	"Omaha": ("#000000", "#CC0000"),
	"Denver": ("#8B2332", "#C5960C"),
	"Loyola Marymount": ("#00205B", "#8B1A1A"),
	"Pepperdine": ("#003DA5", "#F47920"),
	"Saint Mary's": ("#CC0000", "#003366"),
	"Santa Clara": ("#9E1B32", "#FFFFFF"),
	"Seattle": ("#CC0000", "#FFFFFF"),
	"Portland": ("#4F2683", "#FFFFFF"),
	"San Francisco": ("#006633", "#F0AB00"),
	"Pacific": ("#F47920", "#000000"),
	"Gonzaga": ("#003366", "#CC0000"),
	"UT Arlington": ("#003DA5", "#F47920"),
	"Cal Baptist": ("#003366", "#C5960C"),
	"Utah Valley": ("#275D38", "#FFFFFF"),
}

# Conference fallback colors when Wikipedia lookup fails
CONFERENCE_FALLBACK_COLORS = {
	"SEC": ("#502888", "#C8A864"),
	"Big Ten": ("#0B1560", "#A0A2A5"),
	"Big 12": ("#003DA5", "#EF3E42"),
	"ACC": ("#00337F", "#A0A2A5"),
	"AAC": ("#003B71", "#C8102E"),
	"MWC": ("#004990", "#FF6600"),
	"A-10": ("#002B5C", "#BEB9AB"),
	"WCC": ("#002855", "#C69214"),
	"MVC": ("#003366", "#CC0000"),
	"C-USA": ("#002147", "#C8102E"),
	"Sun Belt": ("#003DA5", "#FFC72C"),
	"MAC": ("#003366", "#84754E"),
	"CAA": ("#003DA5", "#FFB81C"),
	"Horizon": ("#003DA5", "#78BE20"),
	"America East": ("#003DA5", "#6CC24A"),
	"ASUN": ("#1D4289", "#FFC72C"),
	"Big East": ("#003DA5", "#A0A0A0"),
	"Big Sky": ("#002855", "#FFC72C"),
	"Big South": ("#003366", "#CC0000"),
	"Big West": ("#003DA5", "#00A86B"),
	"Ivy": ("#00693E", "#A0A0A0"),
	"MAAC": ("#002855", "#C8102E"),
	"MEAC": ("#003DA5", "#FFC72C"),
	"NEC": ("#002855", "#C8102E"),
	"OVC": ("#003366", "#FFC72C"),
	"Pac-12": ("#002147", "#FFC72C"),
	"Patriot": ("#003DA5", "#8C1515"),
	"SoCon": ("#003366", "#FFC72C"),
	"Southland": ("#003DA5", "#C8102E"),
	"SWAC": ("#003366", "#FFC72C"),
	"Summit": ("#003DA5", "#78BE20"),
	"WAC": ("#003366", "#FFD700"),
}


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
def strip_footnotes(text: str) -> str:
	"""Remove Wikipedia footnote markers like [q], [FB 3], [N 14], etc."""
	cleaned = re.sub(r'\[[\w\s]+\]', '', text).strip()
	return cleaned


#============================================
def parse_existing_schools(js_content: str) -> dict:
	"""Extract school objects from existing constants.js content.

	Returns a dict keyed by shortName for easy lookup.
	"""
	schools = {}
	# Find all { ... } blocks that contain shortName
	block_pattern = re.compile(r'\{[^{}]+\}', re.DOTALL)
	for block_match in block_pattern.finditer(js_content):
		block = block_match.group(0)
		if 'shortName:' not in block:
			continue

		def get_field(name: str, text: str) -> str:
			m = re.search(rf'{name}:\s*"([^"]+)"', text)
			return m.group(1) if m else ""

		def get_num(name: str, text: str) -> float:
			m = re.search(rf'{name}:\s*([\d.-]+)', text)
			return float(m.group(1)) if m else 0.0

		short_name = get_field("shortName", block)
		if not short_name:
			continue

		has_swap = "colorSwap: true" in block or "colorSwap:true" in block
		schools[short_name] = {
			"name": get_field("name", block),
			"shortName": short_name,
			"mascot": get_field("mascot", block),
			"conference": get_field("conference", block),
			"city": get_field("city", block),
			"state": get_field("state", block),
			"lat": get_num("lat", block),
			"lon": get_num("lon", block),
			"colorPrimary": get_field("colorPrimary", block),
			"colorSecondary": get_field("colorSecondary", block),
			"colorSwap": has_swap,
			"hintRegion": get_field("hintRegion", block),
		}
	return schools


#============================================
def parse_csv_files(repo_root: str) -> list:
	"""Read all three CSV files and return a list of school dicts."""
	csv_files = [
		("ncaa_schools-FBS.csv", "FBS"),
		("ncaa_schools-FCS.csv", "FCS"),
		("ncaa_schools-NonFB.csv", "Non-football"),
	]
	all_schools = []
	for filename, subdivision in csv_files:
		filepath = os.path.join(repo_root, filename)
		with open(filepath, "r", encoding="utf-8") as f:
			reader = csv.DictReader(f)
			for row in reader:
				# Clean footnote markers from all fields
				school_name = strip_footnotes(row["School"])
				common_name = strip_footnotes(row["Common name"])
				nickname = strip_footnotes(row["Nickname"])
				city = strip_footnotes(row["City"])
				state = strip_footnotes(row["State"])
				conference_full = strip_footnotes(row["Primary"])
				# Map conference name to abbreviation
				conference = CONFERENCE_MAP.get(conference_full, conference_full)
				if conference == conference_full and conference_full not in CONFERENCE_MAP.values():
					print(f"  WARNING: Unknown conference: '{conference_full}' for {common_name}")
				all_schools.append({
					"fullName": school_name,
					"commonName": common_name,
					"nickname": nickname,
					"city": city,
					"state": state,
					"subdivision": subdivision,
					"conference": conference,
				})
		print(f"Read {filename}: found schools for {subdivision}")
	print(f"Total CSV schools: {len(all_schools)}")
	return all_schools


#============================================
def load_cache(cache_path: str) -> dict:
	"""Load a JSON cache file, returning empty dict if missing."""
	if os.path.exists(cache_path):
		with open(cache_path, "r") as f:
			cache = json.load(f)
		return cache
	return {}


#============================================
def save_cache(cache_path: str, cache: dict) -> None:
	"""Save a dict to a JSON cache file."""
	with open(cache_path, "w") as f:
		json.dump(cache, f, indent="\t", sort_keys=True)


#============================================
def geocode_school(common_name: str, city: str, state: str,
		coord_cache: dict) -> tuple:
	"""Geocode a school by city/state using Nominatim API.

	Returns (lat, lon) tuple. Uses cache to avoid repeated API calls.
	"""
	# Check manual overrides first
	if common_name in COORD_OVERRIDES:
		return COORD_OVERRIDES[common_name]

	# Check cache
	cache_key = f"{common_name}|{city}|{state}"
	if cache_key in coord_cache:
		cached = coord_cache[cache_key]
		return (cached["lat"], cached["lon"])

	# Query Nominatim
	url = "https://nominatim.openstreetmap.org/search"
	# Try with city and state first
	params = {
		"q": f"{city}, {state}, USA",
		"format": "json",
		"limit": 1,
	}
	headers = {
		"User-Agent": "ncaa-school-find-game/1.0 (educational project)",
	}
	# Rate limit per PYTHON_STYLE.md
	time.sleep(random.random())

	response = requests.get(url, params=params, headers=headers)
	results = response.json()

	if results:
		lat = float(results[0]["lat"])
		lon = float(results[0]["lon"])
		coord_cache[cache_key] = {"lat": lat, "lon": lon}
		print(f"  Geocoded {common_name}: {lat:.4f}, {lon:.4f}")
		return (lat, lon)

	# Fallback: try with school name directly
	params["q"] = f"{common_name} University, {state}, USA"
	time.sleep(random.random())
	response = requests.get(url, params=params, headers=headers)
	results = response.json()

	if results:
		lat = float(results[0]["lat"])
		lon = float(results[0]["lon"])
		coord_cache[cache_key] = {"lat": lat, "lon": lon}
		print(f"  Geocoded {common_name} (fallback): {lat:.4f}, {lon:.4f}")
		return (lat, lon)

	print(f"  FAILED to geocode: {common_name} ({city}, {state})")
	return (0.0, 0.0)


#============================================
def is_usable_color(hex_code: str) -> bool:
	"""Check if a hex color is usable (not white, near-white, or near-black)."""
	hex_code = hex_code.upper().lstrip("#")
	# Skip pure white, near-white, and common template colors
	skip_colors = {
		"FFFFFF", "FEFEFE", "FDFDFD", "F8F8F8", "F0F0F0",
		"EEEEEE", "E0E0E0", "D0D0D0", "C0C0C0",
		"000000",
	}
	if hex_code in skip_colors:
		return False
	# Skip very light colors (all channels > 0xE0)
	r = int(hex_code[0:2], 16)
	g = int(hex_code[2:4], 16)
	b = int(hex_code[4:6], 16)
	if r > 224 and g > 224 and b > 224:
		return False
	return True


#============================================
def lookup_school_colors(common_name: str, nickname: str,
		color_cache: dict) -> tuple:
	"""Look up school colors from Wikipedia.

	Searches for the school's athletics Wikipedia page and extracts
	hex color codes from the wikitext infobox color fields.

	Returns (primary_hex, secondary_hex) tuple.
	"""
	# Check manual overrides first (most reliable)
	# Normalize en-dashes and special chars for matching
	normalized_name = common_name.replace("\u2013", "-").replace("\u2018", "'")
	normalized_name = normalized_name.replace("\u02BB", "").replace("'", "")
	if common_name in KNOWN_SCHOOL_COLORS:
		colors = KNOWN_SCHOOL_COLORS[common_name]
		color_cache[common_name] = {"primary": colors[0], "secondary": colors[1]}
		return colors
	if normalized_name in KNOWN_SCHOOL_COLORS:
		colors = KNOWN_SCHOOL_COLORS[normalized_name]
		color_cache[common_name] = {"primary": colors[0], "secondary": colors[1]}
		return colors

	# Check cache
	if common_name in color_cache:
		cached = color_cache[common_name]
		# Re-validate cached colors (may have been bad from earlier run)
		if is_usable_color(cached["primary"]):
			return (cached["primary"], cached["secondary"])

	url = "https://en.wikipedia.org/w/api.php"
	headers = {
		"User-Agent": "ncaa-school-find-game/1.0 (educational project)",
	}

	# Try multiple page title patterns for athletics pages
	page_attempts = [
		f"{common_name} {nickname}",
		f"{common_name} {nickname} football",
		f"{common_name} {nickname} men's basketball",
	]

	wikitext = ""
	for page_title in page_attempts:
		params = {
			"action": "parse",
			"page": page_title,
			"prop": "wikitext",
			"format": "json",
			"redirects": 1,
		}
		time.sleep(random.random())
		response = requests.get(url, params=params, headers=headers)
		data = response.json()
		if "error" not in data:
			wikitext = data.get("parse", {}).get("wikitext", {}).get("*", "")
			break

	# If direct page names failed, try search
	if not wikitext:
		params = {
			"action": "query",
			"list": "search",
			"srsearch": f"{common_name} {nickname} athletics",
			"format": "json",
			"srlimit": 3,
		}
		time.sleep(random.random())
		response = requests.get(url, params=params, headers=headers)
		data = response.json()
		search_results = data.get("query", {}).get("search", [])
		if not search_results:
			print(f"  No Wikipedia page found for {common_name}")
			return ("", "")

		# Try first result that looks like an athletics page
		for result in search_results:
			page_title = result["title"]
			params = {
				"action": "parse",
				"page": page_title,
				"prop": "wikitext",
				"format": "json",
				"redirects": 1,
			}
			time.sleep(random.random())
			response = requests.get(url, params=params, headers=headers)
			data = response.json()
			if "error" not in data:
				wikitext = data.get("parse", {}).get("wikitext", {}).get("*", "")
				if wikitext:
					break

	if not wikitext:
		print(f"  No Wikipedia content for {common_name}")
		return ("", "")

	# Strategy 1: Look for color= or colors= fields in the infobox
	# These fields specifically contain the school colors
	color_field = re.search(
		r'\|\s*colors?\s*=\s*([^\n|]+)',
		wikitext[:8000], re.IGNORECASE
	)
	hex_colors = []
	if color_field:
		color_text = color_field.group(1)
		# Extract hex codes from the color field
		hex_pattern = re.compile(r'#([0-9A-Fa-f]{6})\b')
		raw_colors = hex_pattern.findall(color_text)
		hex_colors = [c for c in raw_colors if is_usable_color(c)]

	# Strategy 2: If no colors in color field, scan broader infobox
	if not hex_colors:
		# Look in first 5000 chars for hex codes near color-related keywords
		hex_pattern = re.compile(r'#([0-9A-Fa-f]{6})\b')
		raw_colors = hex_pattern.findall(wikitext[:5000])
		hex_colors = [c for c in raw_colors if is_usable_color(c)]

	if len(hex_colors) >= 2:
		primary = f"#{hex_colors[0].upper()}"
		secondary = f"#{hex_colors[1].upper()}"
		color_cache[common_name] = {"primary": primary, "secondary": secondary}
		print(f"  Colors for {common_name}: {primary}, {secondary}")
		return (primary, secondary)
	elif len(hex_colors) == 1:
		primary = f"#{hex_colors[0].upper()}"
		secondary = "#A0A0A0"
		color_cache[common_name] = {"primary": primary, "secondary": secondary}
		print(f"  Colors for {common_name}: {primary} (1 found, gray secondary)")
		return (primary, secondary)

	print(f"  No colors found for {common_name}")
	return ("", "")


#============================================
def merge_school_data(csv_schools: list, existing_schools: dict,
		coord_cache: dict, color_cache: dict) -> list:
	"""Merge CSV data with existing school data.

	Preserves existing lat/lon, colors, hintRegion for known schools.
	Geocodes and looks up colors for new schools.
	"""
	merged = []
	matched_count = 0
	new_count = 0

	# Build a set of all conference fallback color values for detection
	fallback_primaries = set()
	for colors in CONFERENCE_FALLBACK_COLORS.values():
		fallback_primaries.add(colors[0])

	for csv_school in csv_schools:
		common_name = csv_school["commonName"]
		# Check if this school exists in current constants.js
		existing = existing_schools.get(common_name)

		if existing:
			# Preserve existing data, add subdivision
			school = dict(existing)
			school["subdivision"] = csv_school["subdivision"]
			# Update conference from CSV (may be more current)
			school["conference"] = csv_school["conference"]
			# Check if colors are conference fallbacks; if so, try Wikipedia
			if school["colorPrimary"] in fallback_primaries:
				primary, secondary = lookup_school_colors(
					common_name, csv_school["nickname"], color_cache
				)
				if primary:
					school["colorPrimary"] = primary
					school["colorSecondary"] = secondary
			matched_count += 1
		else:
			# New school - need to geocode and look up colors
			lat, lon = geocode_school(
				common_name, csv_school["city"],
				csv_school["state"], coord_cache
			)

			# Look up colors from Wikipedia
			primary, secondary = lookup_school_colors(
				common_name, csv_school["nickname"], color_cache
			)
			# Fall back to conference colors if lookup failed
			if not primary:
				fallback = CONFERENCE_FALLBACK_COLORS.get(
					csv_school["conference"], ("#666666", "#999999")
				)
				primary = fallback[0]
				secondary = fallback[1]

			# Assign hint region from state
			hint_region = STATE_TO_REGION.get(csv_school["state"], "")
			if not hint_region:
				print(f"  WARNING: No region for state '{csv_school['state']}' ({common_name})")

			school = {
				"name": csv_school["fullName"],
				"shortName": common_name,
				"mascot": csv_school["nickname"],
				"conference": csv_school["conference"],
				"subdivision": csv_school["subdivision"],
				"city": csv_school["city"],
				"state": csv_school["state"],
				"lat": lat,
				"lon": lon,
				"colorPrimary": primary,
				"colorSecondary": secondary,
				"colorSwap": False,
				"hintRegion": hint_region,
			}
			new_count += 1

		merged.append(school)

	print(f"Matched {matched_count} existing schools, added {new_count} new schools")
	return merged


#============================================
def format_school_js(school: dict) -> str:
	"""Format a single school object as a JavaScript object literal."""
	lines = []
	lines.append("\t{")
	lines.append(f'\t\tname: "{school["name"]}",')
	lines.append(f'\t\tshortName: "{school["shortName"]}",')
	lines.append(f'\t\tmascot: "{school["mascot"]}",')
	lines.append(f'\t\tconference: "{school["conference"]}",')
	lines.append(f'\t\tsubdivision: "{school["subdivision"]}",')
	lines.append(f'\t\tcity: "{school["city"]}",')
	lines.append(f'\t\tstate: "{school["state"]}",')
	lines.append(f'\t\tlat: {school["lat"]:.4f},')
	lines.append(f'\t\tlon: {school["lon"]:.4f},')
	lines.append(f'\t\tcolorPrimary: "{school["colorPrimary"]}",')
	lines.append(f'\t\tcolorSecondary: "{school["colorSecondary"]}",')
	if school.get("colorSwap"):
		lines.append("\t\tcolorSwap: true,")
	lines.append(f'\t\thintRegion: "{school["hintRegion"]}",')
	lines.append("\t},")
	result = "\n".join(lines)
	return result


#============================================
def generate_constants_js(schools: list) -> str:
	"""Generate the full parts/constants.js file content."""
	output = ""
	output += "// NCAA Division I Schools - generated by build_school_data.py\n\n"
	output += "var NCAA_SCHOOLS = [\n"

	# Group schools by subdivision, then by conference
	subdivisions = ["FBS", "FCS", "Non-football"]
	for subdiv in subdivisions:
		subdiv_schools = [s for s in schools if s["subdivision"] == subdiv]
		# Group by conference
		conferences = {}
		for school in subdiv_schools:
			conf = school["conference"]
			if conf not in conferences:
				conferences[conf] = []
			conferences[conf].append(school)

		# Sort conferences alphabetically
		sorted_confs = sorted(conferences.keys())
		for conf in sorted_confs:
			conf_schools = sorted(conferences[conf], key=lambda s: s["shortName"])
			output += f"\t// {subdiv} - {conf} ({len(conf_schools)} schools)\n"
			for school in conf_schools:
				output += format_school_js(school) + "\n"
			output += "\n"

	output += "];\n\n"

	# Difficulty tiers
	output += "// Difficulty tier definitions for the setup screen\n"
	output += "var DIFFICULTY_TIERS = [\n"
	output += '\t{ name: "Major Conferences", type: "conference", '
	output += 'values: ["SEC", "Big Ten", "Big 12", "ACC"] },\n'
	output += '\t{ name: "FBS", type: "subdivision", values: ["FBS"] },\n'
	output += '\t{ name: "FCS", type: "subdivision", values: ["FCS"] },\n'
	output += '\t{ name: "Non-Football", type: "subdivision", '
	output += 'values: ["Non-football"] },\n'
	output += '\t{ name: "All Division I", type: "all", values: [] },\n'
	output += "];\n\n"

	# SUBREGIONS (preserved as-is)
	output += "var SUBREGIONS = {\n"
	for region, states in SUBREGIONS.items():
		state_str = ",".join(f'"{s}"' for s in states)
		output += f'\t"{region}": [{state_str}],\n'
	output += "};\n"

	return output


#============================================
def main():
	"""Main entry point."""
	repo_root = get_repo_root()
	print(f"Repo root: {repo_root}")

	# Paths
	constants_path = os.path.join(repo_root, "parts", "constants.js")
	coord_cache_path = os.path.join(repo_root, "school_coordinates_cache.json")
	color_cache_path = os.path.join(repo_root, "school_colors_cache.json")

	# Step 1: Parse existing schools from constants.js
	print("\n=== Parsing existing constants.js ===")
	with open(constants_path, "r") as f:
		js_content = f.read()
	existing_schools = parse_existing_schools(js_content)
	print(f"Found {len(existing_schools)} existing schools")

	# Step 2: Parse CSV files
	print("\n=== Parsing CSV files ===")
	csv_schools = parse_csv_files(repo_root)

	# Step 3: Load caches
	coord_cache = load_cache(coord_cache_path)
	color_cache = load_cache(color_cache_path)
	print(f"Loaded {len(coord_cache)} cached coordinates")
	print(f"Loaded {len(color_cache)} cached colors")

	# Step 4: Merge data (geocode and color-lookup new schools)
	print("\n=== Merging school data ===")
	merged_schools = merge_school_data(
		csv_schools, existing_schools, coord_cache, color_cache
	)

	# Save caches after all lookups
	save_cache(coord_cache_path, coord_cache)
	save_cache(color_cache_path, color_cache)
	print(f"Saved {len(coord_cache)} cached coordinates")
	print(f"Saved {len(color_cache)} cached colors")

	# Step 5: Generate output
	print("\n=== Generating constants.js ===")
	js_output = generate_constants_js(merged_schools)

	# Write output
	with open(constants_path, "w") as f:
		f.write(js_output)
	print(f"Wrote {constants_path}")

	# Summary
	print("\n=== Summary ===")
	fbs_count = len([s for s in merged_schools if s["subdivision"] == "FBS"])
	fcs_count = len([s for s in merged_schools if s["subdivision"] == "FCS"])
	nfb_count = len([s for s in merged_schools if s["subdivision"] == "Non-football"])
	print(f"FBS: {fbs_count} schools")
	print(f"FCS: {fcs_count} schools")
	print(f"Non-football: {nfb_count} schools")
	print(f"Total: {len(merged_schools)} schools")

	# Check for zero coordinates
	zero_coords = [s for s in merged_schools if s["lat"] == 0.0 and s["lon"] == 0.0]
	if zero_coords:
		print(f"\nWARNING: {len(zero_coords)} schools with zero coordinates:")
		for s in zero_coords:
			print(f"  {s['shortName']} ({s['city']}, {s['state']})")


#============================================
if __name__ == "__main__":
	main()
