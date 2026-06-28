# Install

Setting up this repo makes the game buildable locally and the test suite runnable.
It requires both a Python environment (for data generators and pytest) and a
Node.js environment (for TypeScript compilation, linting, and Playwright tests).

## Requirements

- Python 3.12
- Node.js 18 or later
- npm (ships with Node.js)

## Install steps

Clone the repo and run from the repo root.

### Python dependencies

```bash
pip install -r pip_requirements.txt
pip install -r pip_requirements-dev.txt
```

### Node.js dependencies

```bash
./devel/setup_typescript.sh
```

This runs `npm install` against `package.json` and installs TypeScript, ESLint,
Prettier, esbuild, tsx, and Playwright as dev dependencies.

### Playwright browsers (optional)

Required only to run browser smoke tests:

```bash
./devel/setup_playwright.sh
```

This installs Chromium and Firefox for Playwright.

## Verify install

Run the full codebase check gate (typecheck, lint, format-check, and node tests):

```bash
./check_codebase.sh
```

All steps should show `[PASS]` in the summary. A zero exit code confirms a
working install.

## Known gaps

- Minimum Node.js version is listed as 18+; the exact lower bound is not
  tested in CI. Verify on the target machine if using a version below 20.
