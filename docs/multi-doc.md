# Multi-doc workspace

A **docs workspace** combines multiple CHM sources and/or existing `MarkdownProject` directories into one VitePress site. Each collection is exposed under its own URL prefix.

## Manifest

Create `docs-workspace.json` next to your sources (or pass the file path directly):

```json
{
  "title": "Company Docs",
  "description": "Internal help sites",
  "collections": [
    {
      "id": "powercollections",
      "title": "PowerCollections",
      "source": "./fixtures/PowerCollections.chm"
    },
    {
      "id": "legacy-api",
      "title": "Legacy API",
      "source": "./out/legacy-project"
    }
  ]
}
```

| Field | Description |
|---|---|
| `id` | URL-safe slug; default route prefix |
| `title` | Collection label in nav and landing pages |
| `source` | Path to `.chm` file or `MarkdownProject` directory (relative to manifest) |
| `kind` | Optional `chm` or `project`; inferred from extension when omitted |
| `routePrefix` | Optional URL prefix; defaults to `id` |

## CLI

Convert only CHM entries into a staging directory (useful for CI caching):

```bash
chm-md convert-workspace ./docs-workspace.json -o ./staging
```

Emit a combined VitePress site (converts CHM entries on demand):

```bash
chm-md emit vitepress ./docs-workspace.json -o ./site
```

You can also point at a directory containing `docs-workspace.json`, or pass `--workspace <file>` explicitly.

Convert flags (`--table-chrome`, `--markdownlint-config`, `--fix`, `--no-lint`, `--force`) apply when resolving CHM workspace entries during emit.

## Convert cache

Each successful convert writes `convert-cache.json` next to `manifest.json`. The hash covers:

- CHM file contents (SHA-256) plus size/mtime
- Converter version
- Convert settings (`lint`, `lintFix`, `tableChrome`, binary TOC/index prefs)
- Resolved markdownlint config content (when lint is enabled)

If the hash matches on a later convert to the same output directory, conversion is skipped. Use `--force` to rebuild anyway.

```bash
chm-md convert ./help.chm -o ./out-project
chm-md convert ./help.chm -o ./out-project          # cache hit
chm-md convert ./help.chm -o ./out-project --force  # rebuild
```

## Site layout

- `docs/index.md` — workspace landing with links to each collection
- `docs/{prefix}/index.md` — per-collection landing linking to the default topic
- `docs/{prefix}/**/*.md` — collection pages with prefixed routes
- `docs/public/assets/{prefix}/**` — namespaced assets

Top navigation lists Home plus one entry per collection. Sidebars use VitePress multi-sidebar keys (`"/{prefix}/": [...]`).

## Local search

Both single-project and workspace emits enable VitePress built-in local search (MiniSearch):

```ts
search: {
  provider: "local",
  options: { detailedView: true },
}
```

VitePress indexes markdown page content. CHM keyword data in `index.json` is not merged into search in v1.

## Asset collisions

When two collections would write the same destination under `docs/public`, the first copy wins and an `asset-collision` warning is emitted.
