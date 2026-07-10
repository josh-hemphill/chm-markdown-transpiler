# MarkdownProject IR

The `MarkdownProject` intermediate representation is emitter-agnostic. A converted project directory contains:

- `manifest.json` — site metadata and counts
- `convert-cache.json` — fingerprint hash of source CHM + convert settings (skip rebuild when unchanged)
- `nav.json` — sidebar-ready TOC tree
- `index.json` — keyword index entries
- `warnings.json` — fidelity issues encountered during conversion
- `assets.json` — asset metadata (`MarkdownAsset[]`)
- `downloads.json` — download metadata (`MarkdownDownload[]`)
- `pages/**/*.md` — markdown topics with YAML frontmatter
- `assets/**` — images, CSS, fonts, scripts
- `downloads/**` — non-content binaries

## Docs workspace

A `docs-workspace.json` manifest lists multiple collections (CHM files and/or `MarkdownProject` directories) for multi-doc VitePress emit. See [multi-doc.md](multi-doc.md).

```ts
interface DocCollectionEntry {
  id: string;
  title: string;
  source: string;
  kind?: "chm" | "project" | "markdown";
  routePrefix?: string;
}

interface DocsWorkspace {
  title: string;
  description?: string;
  collections: DocCollectionEntry[];
}
```

Frontmatter fields per page:

- `title`
- `sourcePath`
- `chmTopic`
- `keywords`
- `css`
- `originalIds`
- `headingIds`
- `outboundLinks`
