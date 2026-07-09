# Fidelity: Tables and TOC/Index

## Table handling

During HTML preprocessing, each `<table>` is classified:

| Kind | Behavior | Warning code |
|---|---|---|
| `simple-data` | Convert to GFM pipe table via Turndown | none |
| `spanned` | Preserve HTML block | `table-html-fallback` |
| `nested` | Preserve HTML block | `complex-table` |
| `layout-chrome` | Strip, flatten, or preserve HTML (MSDN nav/header bars) | `layout-table-stripped` / `layout-table-preserved` |
| `header-only-note` | Convert single header/emphasis row to blockquote | `note-table` |

## TOC / index sources

`ChmBundle` records how navigation was resolved:

| Field | Values |
|---|---|
| `tocSource` | `hhc` (text `.hhc`), `binary` (`/#TOCIDX` chain), `none` |
| `indexSource` | `hhk` (text `.hhk`), `binary` (`/$WWKeywordLinks`), `none` |

Precedence:

1. Text sitemap (`.hhc` / `.hhk`) when present — uses sibling-`<UL>` nesting parser
2. Binary meta fallback when text is missing or `preferBinaryToc` / `preferBinaryIndex` is set

## Meta paths (not exported)

| Prefix | Role |
|---|---|
| `::DataSpace` | LZX compression plumbing — used by `chmlib-ts`, not written to disk |
| `/#SYSTEM`, `/#TOPICS`, `/#TOCIDX`, `/#URL*` | Binary navigation and strings |
| `/$WWKeywordLinks` | Binary keyword index BTree |
| `/$FIftiMain` | Full-text search index (deferred) |
