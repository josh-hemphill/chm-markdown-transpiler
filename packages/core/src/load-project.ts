import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type {
  ChmFileKind,
  MarkdownAsset,
  MarkdownDownload,
  MarkdownPage,
  MarkdownProject,
  PageFrontmatter,
} from "@chm-md/shared";

export interface LoadedProject extends MarkdownProject {
  projectDir: string;
}

async function readProjectFile(projectDir: string, filename: string): Promise<string> {
  try {
    return await readFile(join(projectDir, filename), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load MarkdownProject at ${projectDir}: missing ${filename} (${message})`);
  }
}

function parseFrontmatter(data: Record<string, unknown>): PageFrontmatter {
  return {
    title: typeof data.title === "string" ? data.title : undefined,
    sourcePath: typeof data.sourcePath === "string" ? data.sourcePath : "",
    chmTopic: typeof data.chmTopic === "string" ? data.chmTopic : "",
    keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : undefined,
    css: Array.isArray(data.css) ? (data.css as string[]) : undefined,
    originalIds: Array.isArray(data.originalIds) ? (data.originalIds as string[]) : undefined,
    headingIds: Array.isArray(data.headingIds)
      ? (data.headingIds as PageFrontmatter["headingIds"])
      : undefined,
    outboundLinks: Array.isArray(data.outboundLinks)
      ? (data.outboundLinks as PageFrontmatter["outboundLinks"])
      : undefined,
  };
}

function extractAssetRefs(body: string): string[] {
  const refs = new Set<string>();
  const assetPattern = /\]\((\/assets\/[^)]+)\)/g;
  for (const match of body.matchAll(assetPattern)) {
    refs.add(match[1] ?? "");
  }
  return [...refs].filter((ref) => ref.length > 0);
}

async function loadJsonSidecar<T>(projectDir: string, filename: string): Promise<T | null> {
  const path = join(projectDir, filename);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function synthesizeAssetsFromDisk(projectDir: string): Promise<MarkdownAsset[]> {
  const assetsDir = join(projectDir, "assets");
  if (!existsSync(assetsDir)) {
    return [];
  }

  const assets: MarkdownAsset[] = [];
  async function walk(dir: string, prefix = ""): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relative);
        continue;
      }
      const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
      const kind: ChmFileKind =
        ext === "css"
          ? "css"
          : ext === "js"
            ? "script"
            : ["png", "gif", "jpg", "jpeg", "svg", "webp", "ico"].includes(ext)
              ? "image"
              : ["woff", "woff2", "ttf", "eot"].includes(ext)
                ? "font"
                : "download";
      assets.push({
        sourcePath: relative,
        projectPath: `/assets/${relative.replace(/\\/g, "/")}`,
        kind,
      });
    }
  }
  await walk(assetsDir);
  return assets;
}

async function synthesizeDownloadsFromDisk(projectDir: string): Promise<MarkdownDownload[]> {
  const downloadsDir = join(projectDir, "downloads");
  if (!existsSync(downloadsDir)) {
    return [];
  }

  const downloads: MarkdownDownload[] = [];
  async function walk(dir: string, prefix = ""): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relative);
        continue;
      }
      const normalized = relative.replace(/\\/g, "/");
      downloads.push({
        sourcePath: normalized,
        projectPath: `/downloads/${normalized}`,
        fileName: entry.name,
      });
    }
  }
  await walk(downloadsDir);
  return downloads;
}

/** Load a MarkdownProject IR from a project directory on disk. */
export async function loadProject(projectDir: string): Promise<LoadedProject> {
  const [manifestRaw, navRaw, indexRaw, warningsRaw] = await Promise.all([
    readProjectFile(projectDir, "manifest.json"),
    readProjectFile(projectDir, "nav.json"),
    readProjectFile(projectDir, "index.json"),
    readProjectFile(projectDir, "warnings.json"),
  ]);

  const manifest = JSON.parse(manifestRaw) as { siteMeta: MarkdownProject["siteMeta"] };
  const nav = JSON.parse(navRaw) as MarkdownProject["nav"];
  const index = JSON.parse(indexRaw) as MarkdownProject["index"];
  const warnings = JSON.parse(warningsRaw) as MarkdownProject["warnings"];

  const pagesDir = join(projectDir, "pages");
  if (!existsSync(pagesDir)) {
    throw new Error(`Failed to load MarkdownProject at ${projectDir}: missing pages/ directory`);
  }

  const pages: MarkdownPage[] = [];

  async function walk(dir: string, prefix = ""): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, relative);
        continue;
      }
      if (!entry.name.endsWith(".md")) {
        continue;
      }
      const raw = await readFile(fullPath, "utf8");
      const parsed = matter(raw);
      const frontmatter = parseFrontmatter(parsed.data as Record<string, unknown>);
      const route = relative.replace(/\.md$/i, "").replace(/\\/g, "/");
      pages.push({
        route: route === "index" ? "index" : route,
        markdownPath: `pages/${relative.replace(/\\/g, "/")}`,
        body: raw,
        frontmatter,
        assetRefs: extractAssetRefs(raw),
      });
    }
  }

  await walk(pagesDir);

  const assets =
    (await loadJsonSidecar<MarkdownAsset[]>(projectDir, "assets.json")) ??
    (await synthesizeAssetsFromDisk(projectDir));
  const downloads =
    (await loadJsonSidecar<MarkdownDownload[]>(projectDir, "downloads.json")) ??
    (await synthesizeDownloadsFromDisk(projectDir));

  return {
    projectDir,
    siteMeta: manifest.siteMeta,
    pages,
    assets,
    downloads,
    nav,
    index,
    warnings,
  };
}
