# Fidelity: Tables and TOC/Index

## Table handling

During HTML preprocessing, each `<table>` is classified:

| Kind | Behavior | Warning code |
|---|---|---|
| `simple-data` | Convert to GFM pipe table via Turndown | none |
| `spanned` | Lossily flatten colspan/rowspan into a rectangular grid, then GFM pipe table | `table-span-flattened` |
| `nested` | Unwrap inner tables into sequential GFM pipe tables | `table-nested-flattened` |
| `layout-chrome` | Strip empty chrome, flatten contentful chrome to GFM or paragraphs (MSDN nav/header bars) | `layout-table-stripped` / `layout-table-flattened` |
| `header-only-note` | Convert single header/emphasis row to blockquote | `note-table` |

Spanned and nested tables no longer fall back to preserved HTML blocks. Presentation attributes such as `bgcolor`, `style`, and `class` are dropped during flattening.

Page frontmatter no longer includes linked CHM stylesheets (`css:`), so original CHM CSS cannot restyle the emitted VitePress site.

## TOC / index sources

`ChmBundle` records how navigation was resolved:

| Field | Values |
|---|---|
| `tocSource` | `hhc` (text `.hhc`), `binary` (`/#TOCIDX` chain), `none` |
| `indexSource` | `hhk` (text `.hhk`), `binary` (`/$WWKeywordLinks`), `none` |

Precedence:

1. Text sitemap (`.hhc` / `.hhk`) when present — sibling-`<UL>` nesting parser with support for unclosed `<li>` tags and multi-keyword HHK objects
2. Binary meta fallback when text is missing or `preferBinaryToc` / `preferBinaryIndex` is set

Some older HHC compilers (for example Agilent/Keysight SCPI help) omit `</li>` closers and pack multiple `Name`/`Local` params into one HHK `<object>`. Those variants are handled by the text parser. CHMs that only ship full-text search (`/$FIftiMain`) without `.hhk` or `/$WWKeywordLinks` still report `indexSource: "none"`.

## Meta paths (not exported)

| Prefix | Role |
|---|---|
| `::DataSpace` | LZX compression plumbing — used by `chmlib-ts`, not written to disk |
| `/#SYSTEM`, `/#TOPICS`, `/#TOCIDX`, `/#URL*` | Binary navigation and strings |
| `/$WWKeywordLinks` | Binary keyword index BTree |
| `/$FIftiMain` | Full-text search index (deferred) |
