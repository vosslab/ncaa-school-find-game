## 2026-03-26

### Additions and New Features

- Added hover tooltip on map dots: hovering an unanswered dot shows the current question school name (not the dot identity) in an SVG tooltip near the cursor. Acts as a reminder of what you are looking for. Uses event delegation on the `school-dots` group with `mouseover`/`mouseout` handlers. Tooltip auto-flips to avoid viewBox edges.
- Enhanced dot hover CSS: unanswered dots now show a white stroke outline on hover in addition to the radius growth, using `stroke` and `stroke-width` transitions.
- Restored Seterra-style school list sidebar on the left side of the game screen. Shows all schools sorted alphabetically. Current question is highlighted in blue with a left border accent. Answered schools show strikethrough text with a colored dot matching the school color. Sidebar auto-scrolls to the current question.
- Added `initSidebar()` function in `parts/game_ui.js` to build the alphabetically sorted school list on game start.
- Reimplemented `updateRemainingList()` in `parts/game_ui.js` (was a no-op) to update sidebar state on each question: highlights current, marks answered with strikethrough and school color dot.

### Behavior or Interface Changes

- Game screen layout changed from single-column map to flexbox row: 200px sidebar (left) + map (right, flex-grow). Sidebar hidden on screens narrower than 768px.
- Added `<div class="game-body">` wrapper around sidebar and map in `parts/body.html` for the flex layout.

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
