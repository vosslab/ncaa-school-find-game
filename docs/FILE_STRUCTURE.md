# File structure

## Top-level layout

```text
ncaa-school-find-game/
+- src/                   TypeScript ESM source modules and static assets
+- data/                  Raw CSV inputs, geojson, and cache files
+- dist/                  Built GitHub Pages artifact (generated, git-ignored)
+- tests/                 Python pytest suite, Node unit tests, Playwright specs
+- baseline/              Committed snapshots for parity checks
+- devel/                 Developer tooling: setup, changelog, version scripts
+- tools/                 Utility scripts (PDF export, package-pin sync)
+- docs/                  Project documentation
+- node_modules/          npm packages (git-ignored)
+- build_github_pages.sh  Canonical production build (tsc + esbuild)
+- run_web_server.sh      Local preview server (builds then serves dist/)
+- build_school_data.py   Data generator: CSV -> src/data/schools_data.ts
+- generate_map_paths.py  Data generator: map_paths.json -> src/data/map_paths_data.ts
+- generate_debug_map.py  Debug tool: data/*.json -> debug_map_*.html
+- check_codebase.sh      Full codebase verification script
+- source_me.sh           Shell bootstrap for Python environment
+- package.json           npm manifest (esbuild, tsc, playwright, eslint)
+- tsconfig.json          TypeScript compiler config (strict ESM, es2020, noEmit)
+- playwright.config.ts   Playwright test config
+- eslint.config.js       ESLint config
+- pip_requirements.txt   Python runtime dependencies
+- pip_requirements-dev.txt  Python dev/test dependencies
+- Brewfile               Homebrew package list
+- VERSION                Version string (synced with package.json)
+- REPO_TYPE              Repo type marker: typescript
+- README.md              Project overview and quick-start
+- AGENTS.md              Agent instructions and workflow guardrails
+- CLAUDE.md              Claude Code project instructions
+- LICENSE.LGPL_v3        License file
```

## Key subtrees

### src/ - TypeScript source

```text
src/
+- main.ts              Entry point; registers DOMContentLoaded -> initApp()
+- init.ts              App bootstrap and DOM event wiring
+- game_play.ts         Per-question loop and click event handlers
+- game_ui.ts           All DOM/SVG rendering functions
+- game_state.ts        Mutable game state singleton and scoring logic
+- constants.ts         Tier-filter helpers; re-exports SUBREGIONS
+- data_loader.ts       Re-export hub for src/data/ modules
+- map_projection.ts    Albers Equal-Area Conic projection
+- dom_utils.ts         Typed DOM element lookup helpers (getElement, findElement)
+- types.ts             Shared interfaces and string-union types
+- index.html           Game markup (all screens; loads dist/main.js as ESM)
+- style.css            Game styles
`- data/
   +- schools_data.ts   Generated: NCAA_SCHOOLS, DIFFICULTY_TIERS, SUBREGIONS
   `- map_paths_data.ts Generated: US_STATE_PATHS
```

### data/ - Raw inputs and caches

```text
data/
+- ncaa_schools-FBS.csv          FBS school records (source CSV)
+- ncaa_schools-FCS.csv          FCS school records
+- ncaa_schools-NonFB.csv        Non-football school records
+- ncaa_schools.ods               Master ODS spreadsheet
+- us_states.geojson             US state geometries (raw GeoJSON)
+- map_paths.json                Hand-curated state SVG paths with regions and labels
+- schools.json                  JSON mirror of src/data/schools_data.ts (generated)
+- school_coordinates_cache.json  Geocoding cache (lat/lon per school)
`- school_colors_cache.json      Wikipedia color cache (primary/secondary per school)
```

### tests/ - Test suite

```text
tests/
+- test_*.py            Python pytest hygiene checks (ASCII, imports, shebangs, links, etc.)
+- test_*.mjs           Node unit tests (game logic, data parity)
+- playwright/
|  +- smoke.spec.ts     Browser smoke tests (setup screen, tier selection, gameplay)
|  `- best_score.spec.ts  Browser tests for best-score persistence
+- conftest.py          Pytest configuration; excludes e2e/ and playwright/
+- file_utils.py        Shared helper: get_repo_root() using git rev-parse
+- check_ascii_compliance.py  Single-file ASCII check helper
+- fix_ascii_compliance.py   Single-file ASCII fix helper
+- fix_whitespace.py         Single-file whitespace fix helper
+- TESTS_README.md           Python test suite overview
`- TESTS_TYPESCRIPT_README.md  TypeScript and Node test overview
```

### baseline/ - Committed snapshots

```text
baseline/
+- schools.json        Reference school list for parity checks
+- tiers.json          Reference tier list
+- subregions.json     Reference subregion map
+- state_paths.json    Reference state path list
+- debug_map/          Reference debug map HTML files
`- smoke/              Reference screenshot PNGs from Playwright smoke run
```

### devel/ - Developer tooling

```text
devel/
+- setup_typescript.sh   Install npm packages and configure the TypeScript environment
+- setup_playwright.sh   Install Playwright browsers
+- dist_clean.sh         Remove dist/
+- bump_version.py       Increment VERSION and package.json
+- rotate_changelog.py   Rotate docs/CHANGELOG.md into archive files
+- commit_changelog.py   Draft a commit message from changelog additions
+- query_changelog.py    Search the changelog by date, keyword, or category
+- changelog_lib.py      Shared parser/serializer for changelog scripts
+- html_to_pdf.mjs       Export HTML to PDF via Playwright
`- DEVEL_README.md       Developer workflow notes
```

## Generated artifacts

| Artifact | Generator | Git-ignored |
| --- | --- | --- |
| `src/data/schools_data.ts` | `build_school_data.py` | NO (committed) |
| `src/data/map_paths_data.ts` | `generate_map_paths.py` | NO (committed) |
| `data/schools.json` | `build_school_data.py` | NO (committed) |
| `dist/` | `build_github_pages.sh` | YES |
| `dist/main.js`, `dist/main.js.map` | esbuild (via build script) | YES |
| `dist/index.html`, `dist/style.css` | copied by build script | YES |
| `debug_map_*.html` (repo root) | `generate_debug_map.py` | YES (untracked) |
| `node_modules/` | npm install | YES |
| `test-results/` | Playwright | YES |

## Documentation map

All docs live under `docs/`. Root-level docs are `README.md` and `AGENTS.md`.

| File | Purpose |
| --- | --- |
| [docs/CHANGELOG.md](CHANGELOG.md) | Chronological record of changes |
| [docs/CODE_ARCHITECTURE.md](CODE_ARCHITECTURE.md) | System design, modules, data flow |
| [docs/FILE_STRUCTURE.md](FILE_STRUCTURE.md) | This file; directory map |
| [docs/USAGE.md](USAGE.md) | How to run, build, and regenerate data |
| [docs/PLAYWRIGHT_USAGE.md](PLAYWRIGHT_USAGE.md) | Playwright test commands and config |
| [docs/TYPESCRIPT_STYLE.md](TYPESCRIPT_STYLE.md) | TypeScript coding conventions |
| [docs/REPO_STYLE.md](REPO_STYLE.md) | Repo-wide conventions and naming |
| [docs/PYTHON_STYLE.md](PYTHON_STYLE.md) | Python coding conventions |
| [docs/MARKDOWN_STYLE.md](MARKDOWN_STYLE.md) | Markdown writing rules |
| [docs/PYTEST_STYLE.md](PYTEST_STYLE.md) | Pytest conventions and failure triage |
| [docs/AUTHORS.md](AUTHORS.md) | Maintainer information |

## Where to add new work

| Work type | Location |
| --- | --- |
| Game TypeScript logic | `src/game_play.ts`, `src/game_state.ts`, or `src/game_ui.ts` |
| New TypeScript types or interfaces | `src/types.ts` |
| DOM event wiring | `src/init.ts` |
| Shared DOM helpers | `src/dom_utils.ts` |
| School or tier data | `data/ncaa_schools-*.csv`, then re-run `build_school_data.py` |
| Map geometry | `data/map_paths.json`, then re-run `generate_map_paths.py` |
| Python pytest tests | `tests/test_*.py` |
| Node unit tests | `tests/test_*.mjs` |
| Playwright browser tests | `tests/playwright/` |
| Developer tooling | `devel/` |
| Documentation | `docs/` (SCREAMING_SNAKE_CASE filenames) |
