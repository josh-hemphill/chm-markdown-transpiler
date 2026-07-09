# CHM Markdown Transpiler

[CI](https://github.com/josh-hemphill/chm-markdown-transpiler/actions/workflows/ci.yml)
[npm version](https://www.npmjs.com/package/@chm-md/cli)
[license](https://github.com/josh-hemphill/chm-markdown-transpiler/blob/main/LICENSE)
[node](https://www.npmjs.com/package/@chm-md/cli)

TypeScript toolchain for converting Microsoft CHM help archives into metadata-rich Markdown projects and hostable static sites.

## Install

```bash
npm i -g @chm-md/cli

# or run without installing
npx @chm-md/cli convert ./help.chm -o ./out-project
```

Requires **Node.js ≥ 24**.

## Stack

- **CHM extraction**: `[chmlib-ts](https://github.com/dmihal/chmlib-ts)` (LGPL-2.1 port of chmlib)
- **HTML → Markdown**: Turndown + GFM tables plugin
- **Site IR**: neutral `MarkdownProject` format with nav/index/warnings sidecars
- **Emitter**: VitePress (first emitter; more can be added later)



## License note

This project is LGPL-2.1 because it depends on `chmlib-ts`, which is LGPL-2.1. Dynamic linking via npm is the intended usage.

## Packages


| Package                  | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| `@chm-md/shared`         | Shared types and path utilities             |
| `@chm-md/extract`        | CHM extraction wrapper around `chmlib-ts`   |
| `@chm-md/core`           | HTML→Markdown conversion and project writer |
| `@chm-md/emit-vitepress` | VitePress site emitter                      |
| `@chm-md/cli`            | `chm-md` command-line interface             |




## CLI

From a git checkout:

```bash
pnpm install
pnpm build

# Convert CHM to MarkdownProject
pnpm chm-md convert ./fixtures/PowerCollections.chm -o ./out-project

# Emit VitePress site
pnpm chm-md emit vitepress ./out-project -o ./site

# Multi-doc workspace (CHM + MarkdownProject mix)
pnpm chm-md convert-workspace ./fixtures/example-docs-workspace.json -o ./staging
pnpm chm-md emit vitepress ./fixtures/example-docs-workspace.json -o ./site

# Re-lint / fix existing project
pnpm chm-md lint ./out-project --fix

# Fidelity report
pnpm chm-md doctor ./out-project
pnpm chm-md doctor ./fixtures/example-docs-workspace.json --summary
```



### Global flags


| Flag              | Effect                                         |
| ----------------- | ---------------------------------------------- |
| `-q`, `--quiet`   | Errors only                                    |
| `-v`, `--verbose` | Phase timings, toc/index sources, extra detail |
| `-d`, `--debug`   | Verbose plus progress events and error stacks  |




### Command flags


| Command             | Flag                                            | Purpose                                                   |
| ------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `convert`           | `--table-chrome <mode>`                         | Chrome table policy: `strip`, `preserve`, `flatten`       |
| `convert`           | `--prefer-binary-toc`                           | Prefer binary TOC over text `.hhc`                        |
| `convert`           | `--prefer-binary-index`                         | Prefer binary keyword index over text `.hhk`              |
| `convert`           | `--markdownlint-config <file>`                  | User markdownlint config (JSON/YAML)                      |
| `convert`           | `--fix`                                         | Apply markdownlint autofixes                              |
| `convert`           | `--report <file>`                               | Write `ConvertRunSummary` JSON                            |
| `convert`           | `--no-lint`                                     | Skip markdownlint and style profile                       |
| `convert`           | `--force`                                       | Force reconvert even when `convert-cache.json` matches    |
| `convert-workspace` | `--prefer-binary-toc` / `--prefer-binary-index` | Binary TOC/index for CHM entries                          |
| `convert-workspace` | `--force`                                       | Force reconvert of CHM workspace entries                  |
| `lint`              | `--markdownlint-config <file>`                  | User markdownlint config                                  |
| `lint`              | `--fix`                                         | Apply autofixes in place                                  |
| `lint`              | `--report <file>`                               | Write lint summary JSON                                   |
| `emit`              | `--workspace <file>`                            | Workspace manifest for multi-doc emit                     |
| `emit`              | `--prefer-binary-toc` / `--prefer-binary-index` | Binary TOC/index for CHM workspace entries                |
| `emit`              | `--table-chrome <mode>`                         | Chrome table policy when converting CHM workspace entries |
| `emit`              | `--markdownlint-config <file>`                  | Markdownlint config for CHM workspace entries             |
| `emit`              | `--fix`                                         | Autofix CHM workspace entries during emit                 |
| `emit`              | `--no-lint`                                     | Skip lint when converting CHM workspace entries           |
| `emit`              | `--force`                                       | Force reconvert of CHM workspace entries                  |
| `emit`              | `--report <file>`                               | Write `EmitRunSummary` JSON                               |
| `doctor`            | `--json`                                        | Full JSON report                                          |
| `doctor`            | `--summary`                                     | One-line CI summary                                       |
| `doctor`            | `--code <prefix>`                               | Filter warnings by code prefix                            |
| `doctor`            | `--limit <n>`                                   | Cap listed warnings (`0` = all)                           |
| `doctor`            | `--group-by-code`                               | Group warnings with counts                                |


See [docs/cli-debugging.md](docs/cli-debugging.md) for debugging workflows and exit codes.
See [docs/multi-doc.md](docs/multi-doc.md) for workspace manifests and local search.

## Programmatic usage

```ts
import { convertChm } from "@chm-md/core";
import { emitVitePress } from "@chm-md/emit-vitepress";

await convertChm({ sourcePath: "./help.chm", outputDir: "./out-project" });
await emitVitePress({ projectDir: "./out-project", outputDir: "./site" });
```



## Limitations (v0.1)

- `/$FIftiMain` full-text search index is not extracted
- CHM keyword `index.json` is not merged into VitePress local search
- VitePress is the only supported emitter
- Complex or spanned tables may remain as HTML with warnings



## Development

```bash
pnpm test
pnpm typecheck
```



## Pipeline

```text
.chm -> @chm-md/extract -> ChmBundle
ChmBundle -> @chm-md/core -> MarkdownProject
MarkdownProject -> @chm-md/emit-vitepress -> VitePress site
```

