# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-09

### Added

- `@chm-md/extract` — CHM extraction via chmlib-ts with text and binary TOC/index fallbacks
- `@chm-md/core` — HTML→Markdown conversion, MarkdownProject IR writer, markdownlint integration
- `@chm-md/emit-vitepress` — VitePress site emitter with local search
- `@chm-md/cli` — `chm-md` CLI (`convert`, `convert-workspace`, `emit`, `doctor`, `lint`)
- Multi-collection docs workspaces via `docs-workspace.json`
- Fidelity `doctor` command with CI `--summary` output
- Convert cache (`convert-cache.json`) for incremental reconverts

### Known limitations (v0.1)

- `/$FIftiMain` full-text search index is not extracted
- CHM keyword `index.json` is not merged into VitePress local search
- VitePress is the only supported emitter
- Complex or spanned tables may remain as HTML with warnings

[0.1.0]: https://github.com/josh-hemphill/chm-markdown-transpiler/releases/tag/v0.1.0
