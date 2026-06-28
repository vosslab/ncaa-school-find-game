## Style guides

- docs/REPO_STYLE.md
- docs/PYTHON_STYLE.md
- docs/TYPESCRIPT_STYLE.md
- docs/MARKDOWN_STYLE.md
- docs/PYTEST_STYLE.md
- docs/E2E_TESTS.md
- docs/PLAYWRIGHT_USAGE.md
- docs/CODE_ARCHITECTURE.md
- docs/FILE_STRUCTURE.md
- docs/INSTALL.md
- docs/USAGE.md

## Workflow

- Document all edits in docs/CHANGELOG.md.
- When in doubt, implement the changes the user asked for rather than waiting for a response; the user is not the best reader and will likely miss your request and then be confused why it was not implemented or fixed.
- Run focused tests on changed code; docs changes do not require tests.
- Tests in tests/ support `-k`: `pytest tests/ -k changed_file.py`.

## Python environment

- Run Python as `source source_me.sh && python3` (Python 3.12 only).
- Use Bash semantics for agent shell commands, not Zsh; `source_me.sh` targets Bash (agent runtime only, not a repo script requirement).
- macOS Homebrew Python 3.12 modules: `/opt/homebrew/lib/python3.12/site-packages/`.
