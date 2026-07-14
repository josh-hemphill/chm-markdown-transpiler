# CLI debugging

This guide covers the `chm-md` CLI flags and artifacts used to debug CHM conversion fidelity without reading library internals.

## Global flags

These flags apply before any subcommand:

```bash
chm-md [-v|--verbose] [-d|--debug] [-q|--quiet] <command>
```

| Flag | Effect |
|---|---|
| `-q`, `--quiet` | Errors only; success summary suppressed |
| default | Phase lines plus final summary |
| `-v`, `--verbose` | Per-phase timings, toc/index sources, extract warning breakdown |
| `-d`, `--debug` | Verbose plus stderr stacks on error and per-topic progress events |

`--debug` implies `--verbose`.

## Warning counts

After `convert`, warning totals are available without re-running the pipeline:

- `manifest.json` → `warningCount` (convert-phase warnings)
- `warnings.json` → full warning list with codes and source paths
- `chm-md doctor <project> --summary` → one-line `warnings=N` summary

## Markdownlint config and style-aware convert

When lint is enabled (default), `convert` derives a `MarkdownStyleProfile` from the markdownlint config and shapes output before lint runs:

- Turndown options (heading style, list markers, emphasis)
- Post-process: expand tabs, trim trailing spaces, ensure final newline, demote duplicate H1
- Unique heading ids as `## Title {#id}` with `headingIds` in frontmatter

```bash
# Custom style config during convert
pnpm chm-md convert ./file.chm -o ./out --markdownlint-config ./.markdownlint.yaml

# Apply autofixes during convert
pnpm chm-md convert ./file.chm -o ./out --fix

# Re-lint an existing project without re-extracting
pnpm chm-md lint ./out-project --markdownlint-config ./.markdownlint.yaml --fix
```

`chm-md lint` exits with code `1` when markdownlint warnings remain (useful as a CI style gate). Only rules with autofix support are fixed automatically; structural issues (e.g. MD001 heading jumps) may remain.

Example config (`.markdownlint.yaml`):

```yaml
default: true
MD001: false
MD013: false
MD033: false
MD041: false
MD010: true
MD025: true
```

## Chrome table policy

MSDN-style header/nav tables often produce many `layout-table-stripped` warnings. By default identical strips are collapsed into one summary warning with `details.count` and `details.samplePaths`.

```bash
# Default: strip chrome tables
pnpm chm-md convert ./file.chm -o ./out

# Keep chrome tables as HTML blocks
pnpm chm-md convert ./file.chm -o ./out --table-chrome preserve

# Flatten chrome cell text into paragraphs
pnpm chm-md convert ./file.chm -o ./out --table-chrome flatten

# Filter table warnings in doctor
pnpm chm-md doctor ./out-project --code layout-table-stripped --group-by-code
```

Warning codes:

| Code | Meaning |
|---|---|
| `layout-table-stripped` | Chrome/layout table removed or flattened to paragraphs |
| `layout-table-flattened` | Layout table flattened to GFM pipe table |
| `note-table` | Single-row note converted to blockquote |
| `table-span-flattened` | Spanned table flattened to GFM pipe table |
| `table-nested-flattened` | Nested table flattened to sequential GFM tables |

- `headingIds`
- `outboundLinks`

## Binary TOC / index CLI flags

When text `.hhc` / `.hhk` files are missing or unreliable, prefer binary meta fallbacks:

```bash
pnpm chm-md convert ./file.chm -o ./out --prefer-binary-toc
pnpm chm-md convert ./file.chm -o ./out --prefer-binary-index
```

These flags also apply to `convert-workspace` and workspace `emit` when converting CHM entries.

## Workspace doctor

`doctor` accepts a `docs-workspace.json` path (or a directory containing one) and aggregates per-collection warnings:

```bash
pnpm chm-md doctor ./docs-workspace.json --summary
```

## Typical workflow

```bash
# Quick fidelity scan
pnpm chm-md -v doctor ./fixtures/PowerCollections.chm

# Full conversion with progress
pnpm chm-md -d convert ./fixtures/PowerCollections.chm -o ./out-project

# Filter doctor output to table warnings
pnpm chm-md doctor ./out-project --code layout-table-stripped --group-by-code

# CI-friendly one-liner
pnpm chm-md doctor ./out-project --summary
```

## `convert` output

Normal mode prints phase lines and a summary block:

```text
extracting…
converting HTML…
writing project…
Converted PowerCollections.chm -> ./out-project (8.4s)
  entries: 964  pages: 830  assets: 133  downloads: 0
  warnings: 1  top: layout-table-stripped=1
```

Verbose mode adds toc/index sources and per-phase timings.

### `--report <file>`

Writes a full `ConvertRunSummary` JSON artifact (timings, counts, warning histogram). Useful for CI artifacts and bug reports.

`convert` exits with code `1` when `errorCount > 0` (warnings whose code starts with `missing-`).

## `emit` output

```bash
pnpm chm-md emit vitepress ./out-project -o ./site --report ./emit.json
```

Prints page and nav node counts. `--report` writes `EmitRunSummary` JSON.

## `doctor` output

| Flag | Purpose |
|---|---|
| `--json` | Full structured report |
| `--summary` | One-line counts for CI |
| `--code <prefix>` | Filter warnings (e.g. `table`, `missing-`) |
| `--limit <n>` | Cap listed warnings (default `20`; `0` = all) |
| `--group-by-code` | Group by code with one example per group |

Text output includes a warning histogram (all codes), then separate **Errors** and **Warnings** sections.

`doctor` exits with code `1` when `errorCount > 0`.

## Project artifacts

After `convert`, inspect these files in the output directory:

| File | Contents |
|---|---|
| `manifest.json` | Page/asset counts, `warningCount`, toc/index sources, table warning tallies |
| `warnings.json` | All conversion warnings with codes and source paths |
| `assets.json` | Asset metadata for round-trip reload |
| `downloads.json` | Download metadata for round-trip reload |
| `nav.json` | Sidebar navigation tree |
| `index.json` | Keyword index entries |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success; no missing-* errors in doctor/convert |
| `1` | Command failure or fidelity errors (`missing-*` warnings) |
