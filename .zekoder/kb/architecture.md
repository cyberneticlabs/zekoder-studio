# Architecture and file map

npm workspace monorepo (root package.json `paseo`). Full design: docs/architecture.md.

## Packages

- packages/server — daemon: agent lifecycle, WebSocket API, MCP server (@getpaseo/server)
- packages/app — Expo mobile + web client (@getpaseo/app)
- packages/cli — Docker-style CLI (`paseo run/ls/logs/wait`)
- packages/protocol — wire schemas (zod); must stay backward-compatible
- packages/client — client SDK over protocol
- packages/relay — E2E encrypted relay
- packages/desktop — Electron wrapper
- packages/website — marketing site
- packages/highlight, packages/plugin, packages/expo-two-way-audio — support libs
- plugins/, plugin-examples/ — builtin/example plugins (docs/plugins.md)

## Other top-level

- docs/ — source of truth for system knowledge (see CLAUDE.md table)
- plan.md — Zekoder Suite branding/plugin/login plan
- scripts/ — dev, release, build scripts; patches/ — dependency patches
- docker/, nix/, flake.nix, fastlane/ — packaging
- skills/ — agent skills; public-docs/ — public guides
- paseo.json, knip.json, lefthook.yml, vitest.config.ts — config

## Data

- File-based JSON persistence under PASEO_HOME (dev: .dev/paseo-home, prod: ~/.paseo); see docs/data-model.md
