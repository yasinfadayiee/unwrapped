# CLAUDE.md

## Low token usage

- Never read heavy or generated paths: `node_modules/`, `.next/`, `dist/`, `build/`, `*.lock`, `*.min.js`, `*.log` (also blocked in `.claude/settings.json`).
- Keep reads minimal: open only the files the task needs, and only the relevant parts.
- Run build and tests only once, at the end of a task.
- Run at most one thread at a time, and ask before starting a new one.
