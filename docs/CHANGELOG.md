## 2026-04-02

### Additions and New Features

- **Expanded school database from 193 to 361 schools**: Added all NCAA Division I schools across FBS (136), FCS (126), and non-football (99) subdivisions. New schools sourced from three CSV files (`ncaa_schools-FBS.csv`, `ncaa_schools-FCS.csv`, `ncaa_schools-NonFB.csv`).
- **Subdivision-based difficulty tiers**: Replaced conference-based tiers (Power/Mid-Major/All) with five subdivision-based tiers: Major Conferences (68), FBS (136), FCS (126), Non-Football (99), and All Division I (361). FBS includes Major Conferences as a subset.
- **`build_school_data.py` data pipeline**: New Python script that parses CSV files, merges with existing school data, geocodes new schools via Nominatim API, assigns school colors from a curated manual database, and outputs `parts/constants.js`. Caches geocoding results in `school_coordinates_cache.json` and colors in `school_colors_cache.json`.
- Added `subdivision` field to all school objects in `NCAA_SCHOOLS` array with values "FBS", "FCS", or "Non-football".
- Added `DIFFICULTY_TIERS` data structure with `type` field ("conference", "subdivision", or "all") for flexible filtering.
- Added 15+ new conference abbreviations for FCS and non-football conferences: ASUN, America East, Big East, Big Sky, Big South, Big West, Ivy, MAAC, MEAC, NEC, OVC, Pac-12, Patriot, SoCon, Southland, SWAC, Summit, WAC.

### Behavior or Interface Changes

- Setup screen now shows 5 radio buttons (was 3): Major Conferences, FBS Schools, FCS Schools, Non-Football Schools, All Division I.
- `getSchoolsForTier()` replaces `getConferencesForTier()` in `parts/init.js` for subdivision-aware filtering.
- `startGame()` in `parts/game_state.js` now receives a pre-filtered school array instead of filtering internally by conference.
- `CONFERENCE_TIERS` replaced by `DIFFICULTY_TIERS` throughout codebase (constants.js, init.js, generate_debug_map.py).
- Debug maps now generate per-tier: Major Conferences, FBS, FCS, Non-Football, All Division I, and All Schools.

### Fixes and Maintenance

- Updated `generate_debug_map.py` to parse `DIFFICULTY_TIERS` format and extract `subdivision` field from school objects.
- Fixed pyflakes warnings: removed unused imports (`sys`, `math`) and non-placeholder f-string.

## 2026-03-29

### Fixes and Maintenance

- Replaced template README.md with project-specific content: overview, quick start, documentation links, testing command, and maintainer info.

## 2026-03-26

### Additions and New Features

- **Conference tier system**: Replaced individual conference checkboxes (SEC, Big Ten, Big 12, ACC) with tier-based radio buttons: "Power Conferences (68 schools)" and "Mid-Major Conferences (125 schools)". Added `CONFERENCE_TIERS` data structure in `parts/constants.js`. Dynamic school count display updates based on selection.
- **125 mid-major schools added**: Expanded `NCAA_SCHOOLS` array with schools from 10 mid-major conferences (AAC, MWC, A-10, WCC, MVC, C-USA, Sun Belt, MAC, CAA, Horizon). Total schools now 193. Each entry has full data: name, shortName, mascot, conference, city, state, lat/lon, colors, hintRegion.
- **Dark/light mode**: Added theme support with system preference detection via `prefers-color-scheme`. Manual toggle button (moon icon) on setup screen and game topbar cycles light/dark/system. All hardcoded colors converted to CSS custom properties. Preference saved in localStorage.
- **Streak indicator**: Tracks consecutive first-attempt correct answers. Shows "Nx streak" in topbar when streak >= 3. Best streak displayed on results screen.
- **Per-question time tracking**: Each question records elapsed time from display to answer. Results table now shows actual time per question (e.g. "3.2s") instead of "-".
- **Best score persistence**: Saves best score percentage per tier in localStorage. Results screen shows "New Best!" or previous best score.
- **Share results (Wordle-style)**: "Copy Results" button on results screen generates emoji grid (green/yellow/orange/red squares per school) with score summary and copies to clipboard.
- **State abbreviation labels**: Toggle checkbox ("Show states") renders 2-letter state abbreviations at centroid positions on the map. Default OFF. Preference saved in localStorage. Added `labelX`/`labelY` centroid coordinates to all 49 entries in `parts/map_data.js`.
- **Mobile school list drawer**: Collapsible bottom drawer replaces hidden sidebar on screens narrower than 768px. Compact tag-style layout. Slide-up toggle with handle bar.
- **Touch target optimization**: On touch devices, dot hit area radius increases from 12 to 18 and visible dot from 6 to 7 for easier tapping.
- **Screen transition animations**: CSS fade-in animation (300ms) on screen transitions between setup, game, and results.
- **ARIA accessibility**: Added `role="img"` and `aria-label` on map SVG, `aria-live="polite"` on feedback panel, `role="button"` and `aria-label` on dot groups, `tabindex="0"` for keyboard navigation, `:focus-visible` outline on dots.
- **App meta tags**: Added description, theme-color, apple-mobile-web-app-capable, and inline SVG favicon to `parts/head.html`.
- **Region hint pulsing**: Region hint dots now pulse with animation (`@keyframes pulse-hint`) and stronger glow (`stdDeviation` 3 to 5) for better visibility.
- Added hover tooltip on map dots: hovering an unanswered dot shows the current question school name (not the dot identity) in an SVG tooltip near the cursor. Acts as a reminder of what you are looking for. Uses event delegation on the `school-dots` group with `mouseover`/`mouseout` handlers. Tooltip auto-flips to avoid viewBox edges.
- Enhanced dot hover CSS: unanswered dots now show a white stroke outline on hover in addition to the radius growth, using `stroke` and `stroke-width` transitions.
- Restored Seterra-style school list sidebar on the left side of the game screen. Shows all schools sorted alphabetically. Current question is highlighted in blue with a left border accent. Answered schools show strikethrough text with a colored dot matching the school color. Sidebar auto-scrolls to the current question.
- Added `initSidebar()` function in `parts/game_ui.js` to build the alphabetically sorted school list on game start.
- Reimplemented `updateRemainingList()` in `parts/game_ui.js` (was a no-op) to update sidebar state on each question: highlights current, marks answered with strikethrough and school color dot.

### Behavior or Interface Changes

- **Setup screen**: Conference selection changed from individual conference checkboxes to tier radio buttons. Subtitle changed from "Find the school on the map!" to "How well do you know NCAA school locations?". Inline validation replaces `alert()` for empty selection.
- **Map visual overhaul**: State fill changed from sage green (`#b8c5b9`) to warm parchment (`#e8e0d4`), stroke from `#e0e8e0` to `#c8c0b4`, stroke-width from 0.8 to 1.0. Dot default radius 5 to 6, hover 7 to 8, answered 6 to 7. Initial dot color `#999` to `#888`.
- **Topbar redesign**: School name pill changed from dark-on-dark (`bg:#222` on `#3c4257` bar) to white pill on dark bar for contrast. Score and progress split into separate labeled elements ("3 of 16" and "Score: 82%") instead of pipe-separated "0/16 | 0%".
- **Feedback panel moved**: Repositioned from bottom-right corner to top-center of map for visibility.
- **Results screen**: Performance-based heading ("Perfect!" / "Great Job!" / etc.). Total score shown with max context (e.g. "52400 / 68000"). Results summary grid expanded to 4 columns with Best Streak stat.
- **`getDotColor()` now theme-aware**: Reads CSS `--state-fill` variable for WCAG contrast checking instead of hardcoded hex value.
- Game screen layout changed from single-column map to flexbox row: 200px sidebar (left) + map (right, flex-grow). Sidebar hidden on screens narrower than 768px (now replaced by mobile drawer).
- Added `<div class="game-body">` wrapper around sidebar and map in `parts/body.html` for the flex layout.

### Fixes and Maintenance

- Removed `#next-button { display: none !important; }` CSS hack -- inline style already handles hiding.
- Converted all hardcoded color values in `parts/style.css` to CSS custom properties for theme support.

## 2026-03-25

### Additions and New Features

- Added `parts/map_projection.js` with Albers Equal-Area Conic projection function for continental US, converting lat/lon (decimal degrees) to SVG coordinates fitting a 960x600 viewBox. Uses standard D3 Albers USA parameters (phi1=29.5, phi2=45.5, center at 23 degrees/-96 degrees).
- Replaced placeholder SVG paths in `parts/map_data.js` with real state boundary data generated from GeoJSON (PublicaMundi/MappingAPI) projected through Albers Equal-Area Conic. Paths are simplified with Ramer-Douglas-Peucker (tolerance 0.5px) to keep file under 28KB. Covers 48 continental states plus DC.
- Added `generate_map_paths.py` script that downloads US states GeoJSON, applies Albers projection, simplifies paths, and writes `parts/map_data.js`.

### Fixes and Maintenance

- Fixed Y-axis inversion in both `parts/map_projection.js` and `generate_map_paths.py`: Albers projection y increases northward but SVG y increases downward, so the formula now uses `translateY - y * scale` instead of `translateY + y * scale`. Updated `translateY` from 250 to 593 to re-center the map within the 960x600 viewBox.

## 2026-02-25

### Fixes and Maintenance

- Fixed `devel/commit_changelog.py` to detect staged (`git add`) changelog changes by falling back to `git diff --cached` when the unstaged diff is empty.

## 2026-02-22

- Updated `docs/REPO_STYLE.md` to require consistent section headings for each changelog day block (`Added`, `Changed`, `Fixed`, `Failures`, `Decisions`) and to keep empty sections with `- None.`.
- Updated `docs/REPO_STYLE.md` section names for changelog day blocks to `Additions`, `Updates`, `Removals`, `Failures`, and `Validations`.
- Updated `docs/REPO_STYLE.md` changelog day template to also require `Fixes` and `Decisions` sections.
- Updated `docs/REPO_STYLE.md` changelog policy language: empty categories are optional, every entry must be categorized, entries are never removed (only rephrased), and day category names are now the six longer labels.

## 2026-02-20

- Added `tests/test_init_files.py` to enforce surface-level `__init__.py` style rules from `docs/PYTHON_STYLE.md`, including checks for non-docstring implementation, imports, exports/maps, global assignments, and `__version__` assignments.
- Scoped `tests/test_init_files.py` to analyze only substantial `__init__.py` files and write violations to `report_init.txt` with stale report cleanup at test startup.
- Updated `propagate_style_guides.py` and `.gitignore` to include `test_init_files.py`.
- Simplified gitignore management to require `report_*.txt` and clean up legacy per-report entries in `propagate_style_guides.py`.
- Updated `tests/test_init_files.py` so the no-`__init__.py` case reports pass instead of skip.
- Updated `propagate_style_guides.py` to skip propagating `source_me.sh` into repositories that are already present on `PATH` (for example `junk-drawer`).
- Optimized `tests/test_pyflakes_code_lint.py` to run `pyflakes` once per pytest session and reuse indexed results for per-file tests, preserving one-dot-per-file output while reducing runtime overhead.
- Updated `docs/REPO_STYLE.md` to clarify that changelog entries should capture notable failures and key implementation choices, not only successful changes.

## 2026-02-19

- Added `tests/test_import_dot.py` to fail on relative from-import statements such as `from . import x` and `from .module import x`.
- Updated `propagate_style_guides.py` so `test_import_dot.py` is included in propagated test scripts.
- Updated `tests/test_import_star.py` and `tests/test_import_dot.py` to write per-test report files (`report_import_star.txt` and `report_import_dot.txt`), remove stale reports at test start, and include report paths in assertion failures.
- Renamed `tests/test_import_requirements.py` output to `report_import_requirements.txt` (from `report_imports.txt`) while preserving existing report generation and stale-file cleanup behavior.
- Added import report files to `.gitignore` and `propagate_style_guides.py` required ignore entries: `report_import_star.txt`, `report_import_dot.txt`, and `report_import_requirements.txt`.
- Restored per-file parametrized execution in `tests/test_import_star.py` and `tests/test_import_dot.py` so pytest shows one dot/failure per scanned file while still writing per-test report files.

## 2026-02-16

- Fixed false positives in `tests/test_shebangs.py` where Rust inner attributes (`#![...]`) were misidentified as shebangs, causing `.rs` files to be flagged under `shebang_not_executable`.

## 2026-02-14

- Trimmed `propagate_style_guides.py` to stop editing existing `AGENTS.md` files in target repositories while keeping a no-overwrite bootstrap copy when `AGENTS.md` is missing.
- Added a no-overwrite style file category in `propagate_style_guides.py` so `AGENTS.md` and `docs/AUTHORS.md` are copied only when absent and never updated in-place.
- Updated `propagate_style_guides.py` style destination routing so `CLAUDE.md` is propagated with overwrite to repo root while standard style guides continue to copy into `docs/`.
- Refactored `propagate_style_guides.py` file lists to explicit `(source_name, target_path)` mappings for overwrite and no-overwrite categories, removing special-case destination branching.
- Simplified `propagate_style_guides.py` file lists again to target-relative paths only, deriving source filenames from basename while preserving overwrite/no-overwrite behavior.
- Updated `propagate_style_guides.py` default source lookup/help text to use `<base>/starter_repo_template` instead of `<base>/junk-drawer`.
- Clarified in `README.md` that only `README.md` and `docs/CHANGELOG.md` are repo-specific, while other files are intended to remain generic template infrastructure.
- Standardized `README.md` with a concise infrastructure-focused overview, curated `docs/` links, and a verifiable quick-start test command.
- Updated `AGENTS.md` to direct AI agents to run commands with `bash -lc` (not Zsh) so `source_me.sh` works with expected shell semantics.
