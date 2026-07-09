import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import type {
  ConversionWarning,
  DocCollectionEntry,
  DocCollectionKind,
  DocsWorkspace,
  IndexEntry,
  MarkdownProject,
  NavNode,
  ResolvedCollection,
  ResolvedWorkspace,
} from "@chm-md/shared";
import { CONVERTER_VERSION } from "@chm-md/shared";
import { convertChm } from "./convert-chm.js";
import type { ConvertChmOptions } from "./convert-chm.js";
import { loadProject } from "./load-project.js";

const WORKSPACE_MANIFEST_NAME = "docs-workspace.json";

export interface ResolveWorkspaceOptions extends Omit<ConvertChmOptions, "sourcePath" | "outputDir"> {
  manifestPath: string;
  stagingDir?: string;
}

/** Resolve workspace manifest path from a file or directory target. */
export function resolveWorkspaceManifestPath(target: string): string | null {
  const resolved = resolve(target);
  if (resolved.toLowerCase().endsWith(".json")) {
    return existsSync(resolved) ? resolved : null;
  }
  const nested = join(resolved, WORKSPACE_MANIFEST_NAME);
  if (existsSync(nested)) {
    return nested;
  }
  return null;
}

/** True when target is a MarkdownProject directory. */
export function isMarkdownProjectDir(target: string): boolean {
  return existsSync(join(resolve(target), "manifest.json"));
}

/** Load and validate a docs workspace manifest. */
export async function loadWorkspaceManifest(manifestPath: string): Promise<DocsWorkspace> {
  const raw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as DocsWorkspace;
  if (!manifest.title || !Array.isArray(manifest.collections) || manifest.collections.length === 0) {
    throw new Error("Workspace manifest must include title and at least one collection");
  }
  for (const entry of manifest.collections) {
    if (!entry.id || !entry.title || !entry.source) {
      throw new Error("Each collection requires id, title, and source");
    }
    const sourcePath = resolveSourcePath(manifestPath, entry.source);
    const kind = inferCollectionKind(entry);
    if (kind === "chm" && !existsSync(sourcePath)) {
      throw new Error(`Collection ${entry.id}: CHM not found at ${sourcePath}`);
    }
    if (kind === "project" && !isMarkdownProjectDir(sourcePath)) {
      throw new Error(`Collection ${entry.id}: MarkdownProject not found at ${sourcePath}`);
    }
  }
  return manifest;
}

function inferCollectionKind(entry: DocCollectionEntry): DocCollectionKind {
  if (entry.kind) {
    return entry.kind;
  }
  return entry.source.toLowerCase().endsWith(".chm") ? "chm" : "project";
}

function resolveSourcePath(manifestPath: string, source: string): string {
  const base = dirname(manifestPath);
  return isAbsolute(source) ? source : resolve(base, source);
}

function prefixRoute(route: string, prefix: string): string {
  const normalized = route.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized || normalized === "index") {
    return prefix;
  }
  return `${prefix}/${normalized}`;
}

function prefixLink(link: string | undefined, prefix: string): string | undefined {
  if (!link) {
    return undefined;
  }
  if (link.startsWith("http://") || link.startsWith("https://") || link.startsWith("mailto:")) {
    return link;
  }
  const trimmed = link.replace(/^\/+/, "");
  return `/${prefixRoute(trimmed, prefix)}`;
}

function prefixNav(nodes: NavNode[], prefix: string): NavNode[] {
  return nodes.map((node) => ({
    text: node.text,
    link: prefixLink(node.link, prefix),
    children: node.children ? prefixNav(node.children, prefix) : undefined,
  }));
}

function prefixIndex(entries: IndexEntry[], prefix: string): IndexEntry[] {
  return entries.map((entry) => ({
    ...entry,
    pageRoute: entry.pageRoute ? prefixRoute(entry.pageRoute, prefix) : undefined,
  }));
}

function rewriteAssetPathInBody(body: string, prefix: string): string {
  return body
    .replace(/(\]\(\/assets\/)/g, `](/assets/${prefix}/`)
    .replace(/(\]\(\/downloads\/)/g, `](/downloads/${prefix}/`);
}

/** Apply route prefix to a loaded MarkdownProject. */
export function prefixProject(project: MarkdownProject, prefix: string): MarkdownProject {
  const defaultTopic = project.siteMeta.defaultTopic
    ? `/${prefixRoute(
        project.siteMeta.defaultTopic.replace(/^\//, "").replace(/\.(html?|xhtml)$/i, ""),
        prefix,
      )}`
    : undefined;

  return {
    ...project,
    siteMeta: {
      ...project.siteMeta,
      defaultTopic,
    },
    pages: project.pages.map((page) => ({
      ...page,
      route: prefixRoute(page.route, prefix),
      markdownPath: `pages/${prefixRoute(page.markdownPath.replace(/^pages\//, ""), prefix)}`,
      body: rewriteAssetPathInBody(page.body, prefix),
      assetRefs: page.assetRefs.map((ref) =>
        ref.startsWith("/assets/") ? `/assets/${prefix}${ref.slice("/assets".length)}` : ref,
      ),
    })),
    nav: prefixNav(project.nav, prefix),
    index: prefixIndex(project.index, prefix),
  };
}

/** Convert CHM entries in a workspace to MarkdownProjects under stagingDir. */
export async function convertWorkspace(
  manifestPath: string,
  stagingDir: string,
  options: Omit<ConvertChmOptions, "sourcePath" | "outputDir"> = {},
): Promise<DocsWorkspace> {
  const manifest = await loadWorkspaceManifest(manifestPath);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(stagingDir, { recursive: true });

  const updatedCollections: DocCollectionEntry[] = [];
  for (const entry of manifest.collections) {
    const kind = inferCollectionKind(entry);
    if (kind === "chm") {
      const sourcePath = resolveSourcePath(manifestPath, entry.source);
      const outputDir = join(stagingDir, entry.id);
      await convertChm({ ...options, sourcePath, outputDir });
      updatedCollections.push({
        ...entry,
        kind: "project",
        source: outputDir,
      });
      continue;
    }
    updatedCollections.push({ ...entry, kind: "project" });
  }

  return {
    ...manifest,
    collections: updatedCollections,
  };
}

/** Resolve all collections in a workspace to prefixed MarkdownProjects. */
export async function resolveWorkspace(options: ResolveWorkspaceOptions): Promise<ResolvedWorkspace> {
  const manifest = await loadWorkspaceManifest(options.manifestPath);
  const warnings: ConversionWarning[] = [];
  const collections: ResolvedCollection[] = [];
  const stagingDir =
    options.stagingDir ?? join(dirname(options.manifestPath), ".chm-md-staging");

  for (const entry of manifest.collections) {
    const kind = inferCollectionKind(entry);
    const prefix = entry.routePrefix ?? entry.id;
    let projectDir: string;

    if (kind === "chm") {
      const sourcePath = resolveSourcePath(options.manifestPath, entry.source);
      projectDir = join(stagingDir, entry.id);
      const { mkdir } = await import("node:fs/promises");
      await mkdir(projectDir, { recursive: true });
      const summary = await convertChm({
        ...options,
        sourcePath,
        outputDir: projectDir,
      });
      if (summary.errorCount > 0) {
        warnings.push({
          code: "workspace-convert-errors",
          message: `Collection ${entry.id} converted with ${summary.errorCount} errors`,
          sourcePath,
        });
      }
    } else {
      projectDir = resolveSourcePath(options.manifestPath, entry.source);
    }

    const loaded = await loadProject(projectDir);
    const prefixed = prefixProject(loaded, prefix);
    warnings.push(...loaded.warnings);

    collections.push({
      id: entry.id,
      title: entry.title,
      prefix,
      projectDir,
      project: prefixed,
    });
  }

  return {
    manifest,
    siteMeta: {
      title: manifest.title,
      description: manifest.description,
      convertedAt: new Date().toISOString(),
      converterVersion: CONVERTER_VERSION,
    },
    collections,
    warnings,
  };
}

export { WORKSPACE_MANIFEST_NAME };
