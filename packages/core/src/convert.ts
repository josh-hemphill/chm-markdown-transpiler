import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import TurndownService from "turndown";
// @ts-expect-error joplin plugin has no types
import { gfm } from "@joplin/turndown-plugin-gfm";
import { parseHTML } from "linkedom";
import type { ChmBundle, ChmIndexNode, ChmTocNode, ConversionWarning, MarkdownAsset, MarkdownDownload, MarkdownPage, MarkdownProject, NavNode, PageFrontmatter, PageLinkRef, SiteMeta } from "@chm-md/shared";
import {
  CONVERTER_VERSION,
  chmTopicToRoute,
  classifyChmPath,
  normalizeChmPath,
  resolveChmHref,
  routeToMarkdownPath,
  toDiskPath,
} from "@chm-md/shared";
import { decodeChmText } from "@chm-md/extract";
import type { Configuration } from "markdownlint";
import type { HeadingIdEntry, ProgressHandler } from "@chm-md/shared";
import { neutralizeJavascriptLinks, preprocessCodeSnippets } from "./code-snippets.js";
import { escapeMarkdownProse } from "./escape-html.js";
import { assignHeadingIds, postProcessMarkdown } from "./heading-ids.js";
import { buildStyleProfile, defaultStyleProfile, lintMarkdown, resolveLintConfig } from "./lint.js";
import { collapseChromeStripWarnings, preprocessTables, type TableChromeMode } from "./tables.js";

export interface ConvertOptions {
  bundle: ChmBundle;
  files: Map<string, Uint8Array>;
  lint?: boolean;
  lintConfig?: Configuration;
  lintConfigPath?: string;
  lintFix?: boolean;
  tableChrome?: TableChromeMode;
  onProgress?: ProgressHandler;
}

function createTurndown(profile: ReturnType<typeof defaultStyleProfile>): TurndownService {
  const service = new TurndownService({
    headingStyle: profile.headingStyle,
    codeBlockStyle: profile.codeBlockStyle,
    bulletListMarker: profile.bulletListMarker,
    emDelimiter: profile.emDelimiter,
    strongDelimiter: profile.strongDelimiter,
  });
  service.use(gfm);
  service.addRule("headingWithId", {
    filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
    replacement(content, node) {
      const element = node as Element;
      const id = element.getAttribute("id");
      const level = Number.parseInt(element.tagName.charAt(1), 10);
      const hashes = "#".repeat(level);
      const suffix = id ? ` {#${id}}` : "";
      return `\n\n${hashes} ${content}${suffix}\n\n`;
    },
  });
  service.addRule("chmHtmlBlock", {
    filter: (node) =>
      node.nodeName === "DIV" &&
      (node as Element).getAttribute("data-chm-html-block") === "table",
    replacement: (_content, node) => `\n\n${(node as Element).innerHTML}\n\n`,
  });
  return service;
}

function extractLinkedStyles(document: Document): string[] {
  const styles = new Set<string>();
  for (const link of document.querySelectorAll("link[rel='stylesheet'], link[rel='Stylesheet']")) {
    const href = link.getAttribute("href");
    if (href) {
      styles.add(href);
    }
  }
  return [...styles];
}

function extractOriginalIds(document: Document): string[] {
  const ids: string[] = [];
  for (const element of document.querySelectorAll("[id]")) {
    const id = element.getAttribute("id");
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

function extractTitle(document: Document): string | undefined {
  const title = document.querySelector("title")?.textContent?.trim();
  if (title) {
    return title;
  }
  const h1 = document.querySelector("h1")?.textContent?.trim();
  return h1 || undefined;
}

function rewriteAssetHref(
  href: string,
  topicPath: string,
  assets: Map<string, MarkdownAsset>,
  downloads: Map<string, MarkdownDownload>,
  warnings: ConversionWarning[],
): string {
  const resolved = resolveChmHref(topicPath, href);
  if (resolved.startsWith("#") || resolved.includes("://") || resolved.startsWith("mailto:")) {
    return href;
  }

  const [pathPart] = resolved.split("#", 2);
  const normalized = normalizeChmPath(pathPart ?? resolved);
  const kind = classifyChmPath(normalized, false);

  if (kind === "image" || kind === "css" || kind === "font" || kind === "script") {
    const asset = assets.get(normalized);
    if (asset) {
      return asset.projectPath;
    }
    warnings.push({
      code: "missing-asset",
      message: `Referenced asset not found in archive: ${normalized}`,
      sourcePath: topicPath,
    });
    return href;
  }

  if (kind === "download" || kind === "binary") {
    const download = downloads.get(normalized);
    if (download) {
      return download.projectPath;
    }
  }

  return href;
}

function rewriteTopicHref(
  href: string,
  topicPath: string,
  topicRoutes: Map<string, string>,
  outboundLinks: PageLinkRef[],
  topicFragmentMaps: Map<string, Map<string, string>>,
): string {
  const resolved = resolveChmHref(topicPath, href);
  if (resolved.startsWith("#") || resolved.includes("://") || resolved.startsWith("mailto:")) {
    if (resolved.startsWith("#")) {
      const fragment = resolved.slice(1);
      const localMap = topicFragmentMaps.get(topicPath);
      const mapped = localMap?.get(fragment);
      if (mapped && mapped !== fragment) {
        return `#${mapped}`;
      }
    }
    return href;
  }

  const [pathPart, fragment] = resolved.split("#", 2);
  const normalized = normalizeChmPath(pathPart ?? resolved);
  const route = topicRoutes.get(normalized);
  if (!route) {
    outboundLinks.push({ href, text: href });
    return href;
  }

  let resolvedFragment = fragment;
  if (fragment) {
    const destMap = topicFragmentMaps.get(normalized);
    const mapped = destMap?.get(fragment);
    if (mapped) {
      resolvedFragment = mapped;
    }
  }

  const rewritten = resolvedFragment ? `/${route}#${resolvedFragment}` : `/${route}`;
  outboundLinks.push({ href, rewritten, text: href });
  return rewritten;
}

function buildTopicFragmentMaps(
  htmlTopics: string[],
  files: Map<string, Uint8Array>,
): Map<string, Map<string, string>> {
  const maps = new Map<string, Map<string, string>>();
  for (const topicPath of htmlTopics) {
    const fileData = files.get(topicPath);
    if (!fileData) {
      continue;
    }
    const html = decodeChmText(fileData);
    const { document } = parseHTML(html);
    const { fragmentMap } = assignHeadingIds(document);
    maps.set(topicPath, fragmentMap);
  }
  return maps;
}

function preprocessHtml(
  html: string,
  topicPath: string,
  assets: Map<string, MarkdownAsset>,
  downloads: Map<string, MarkdownDownload>,
  topicRoutes: Map<string, string>,
  topicFragmentMaps: Map<string, Map<string, string>>,
  warnings: ConversionWarning[],
  tableChrome: TableChromeMode = "strip",
): {
  html: string;
  css: string[];
  originalIds: string[];
  headingIds: HeadingIdEntry[];
  title?: string;
  outboundLinks: PageLinkRef[];
} {
  const { document } = parseHTML(html);
  const outboundLinks: PageLinkRef[] = [];
  const css = extractLinkedStyles(document);
  const { assignments: headingIds, fragmentMap } = assignHeadingIds(document);
  topicFragmentMaps.set(topicPath, fragmentMap);
  const originalIds = extractOriginalIds(document);
  const title = extractTitle(document);

  preprocessCodeSnippets(document);
  neutralizeJavascriptLinks(document, topicPath, warnings);

  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (!href) {
      continue;
    }
    const resolved = resolveChmHref(topicPath, href);
    const [pathPart] = resolved.split("#", 2);
    const normalized = normalizeChmPath(pathPart ?? resolved);
    const kind = classifyChmPath(normalized, false);

    if (kind === "html") {
      anchor.setAttribute(
        "href",
        rewriteTopicHref(href, topicPath, topicRoutes, outboundLinks, topicFragmentMaps),
      );
      continue;
    }

    anchor.setAttribute(
      "href",
      rewriteAssetHref(href, topicPath, assets, downloads, warnings),
    );
  }

  for (const image of document.querySelectorAll("img[src]")) {
    const src = image.getAttribute("src");
    if (!src) {
      continue;
    }
    image.setAttribute(
      "src",
      rewriteAssetHref(src, topicPath, assets, downloads, warnings),
    );
  }

  preprocessTables(document, topicPath, warnings, tableChrome);

  const body = document.body;
  const contentHtml = body ? body.innerHTML : document.documentElement.innerHTML;
  return { html: contentHtml, css, originalIds, headingIds, title, outboundLinks };
}

function htmlToMarkdown(html: string, turndown: TurndownService): string {
  return turndown.turndown(html).trim();
}

function serializeFrontmatter(frontmatter: PageFrontmatter): string {
  const lines: string[] = ["---"];
  if (frontmatter.title) {
    lines.push(`title: ${JSON.stringify(frontmatter.title)}`);
  }
  lines.push(`sourcePath: ${JSON.stringify(frontmatter.sourcePath)}`);
  lines.push(`chmTopic: ${JSON.stringify(frontmatter.chmTopic)}`);
  if (frontmatter.keywords?.length) {
    lines.push(`keywords: ${JSON.stringify(frontmatter.keywords)}`);
  }
  if (frontmatter.css?.length) {
    lines.push(`css: ${JSON.stringify(frontmatter.css)}`);
  }
  if (frontmatter.originalIds?.length) {
    lines.push(`originalIds: ${JSON.stringify(frontmatter.originalIds)}`);
  }
  if (frontmatter.headingIds?.length) {
    lines.push(`headingIds: ${JSON.stringify(frontmatter.headingIds)}`);
  }
  if (frontmatter.outboundLinks?.length) {
    lines.push(`outboundLinks: ${JSON.stringify(frontmatter.outboundLinks)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function buildAssetsAndDownloads(
  bundle: ChmBundle,
  files: Map<string, Uint8Array>,
): { assets: MarkdownAsset[]; downloads: MarkdownDownload[] } {
  const assets: MarkdownAsset[] = [];
  const downloads: MarkdownDownload[] = [];

  for (const entry of bundle.entries) {
    if (
      entry.kind === "directory" ||
      entry.kind === "meta" ||
      entry.kind === "binary" ||
      entry.size === 0
    ) {
      continue;
    }

    const relative = entry.path.replace(/^\//, "");

    if (entry.kind === "image" || entry.kind === "css" || entry.kind === "font" || entry.kind === "script") {
      assets.push({
        sourcePath: entry.path,
        projectPath: `/assets/${relative}`,
        kind: entry.kind,
      });
      continue;
    }

    if (entry.kind === "download") {
      const fileName = relative.split("/").pop() ?? relative;
      downloads.push({
        sourcePath: entry.path,
        projectPath: `/downloads/${relative}`,
        fileName,
      });
    }
  }

  void files;
  return { assets, downloads };
}

function collectHtmlTopics(bundle: ChmBundle): string[] {
  return bundle.entries
    .filter((entry) => entry.kind === "html" && entry.size > 0)
    .map((entry) => entry.path);
}

function mapTocToNav(nodes: ChmTocNode[], topicRoutes: Map<string, string>): NavNode[] {
  return nodes.map((node) => {
    const navNode: NavNode = { text: node.name };
    if (node.local) {
      const route = topicRoutes.get(normalizeChmPath(node.local));
      if (route) {
        navNode.link = `/${route}`;
      }
    }
    if (node.children.length > 0) {
      navNode.children = mapTocToNav(node.children, topicRoutes);
    }
    return navNode;
  });
}

function flattenIndex(
  nodes: ChmIndexNode[],
  topicRoutes: Map<string, string>,
): { keyword: string; pageRoute?: string }[] {
  const entries: { keyword: string; pageRoute?: string }[] = [];
  for (const node of nodes) {
    const entry: { keyword: string; pageRoute?: string } = { keyword: node.name };
    if (node.local) {
      entry.pageRoute = topicRoutes.get(normalizeChmPath(node.local));
    }
    entries.push(entry);
    if (node.children.length > 0) {
      entries.push(...flattenIndex(node.children, topicRoutes));
    }
  }
  return entries;
}

function collectKeywordsForTopic(topicPath: string, bundle: ChmBundle): string[] {
  const normalized = normalizeChmPath(topicPath);
  const keywords: string[] = [];

  const walk = (nodes: ChmTocNode[]): void => {
    for (const node of nodes) {
      if (node.local && normalizeChmPath(node.local) === normalized) {
        keywords.push(node.name);
      }
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(bundle.index);
  return keywords;
}

/** Convert an extracted CHM bundle into a MarkdownProject IR. */
export function convertBundle(options: ConvertOptions): MarkdownProject {
  const warnings: ConversionWarning[] = [];
  const htmlTopics = collectHtmlTopics(options.bundle);
  const topicRoutes = new Map<string, string>(
    htmlTopics.map((topic) => [topic, chmTopicToRoute(topic)]),
  );

  const { assets, downloads } = buildAssetsAndDownloads(options.bundle, options.files);
  const assetMap = new Map(assets.map((asset) => [asset.sourcePath, asset]));
  const downloadMap = new Map(downloads.map((item) => [item.sourcePath, item]));

  const lintEnabled = options.lint !== false;
  const lintConfig = lintEnabled
    ? (options.lintConfig ?? resolveLintConfig(options.lintConfigPath))
    : undefined;
  const styleProfile = lintConfig ? buildStyleProfile(lintConfig) : defaultStyleProfile();
  const topicFragmentMaps = buildTopicFragmentMaps(htmlTopics, options.files);
  const tableChrome = options.tableChrome ?? "strip";
  const turndown = createTurndown(styleProfile);
  const pages: MarkdownPage[] = [];
  const progressInterval = 50;

  for (const [index, topicPath] of htmlTopics.entries()) {
    const fileData = options.files.get(topicPath);
    if (!fileData) {
      warnings.push({
        code: "missing-topic",
        message: `HTML topic listed but no file data available: ${topicPath}`,
        sourcePath: topicPath,
      });
      continue;
    }

    const html = decodeChmText(fileData);
    const route = topicRoutes.get(topicPath) ?? chmTopicToRoute(topicPath);
    const processed = preprocessHtml(
      html,
      topicPath,
      assetMap,
      downloadMap,
      topicRoutes,
      topicFragmentMaps,
      warnings,
      tableChrome,
    );
    let markdownBody = htmlToMarkdown(processed.html, turndown);
    markdownBody = postProcessMarkdown(markdownBody, styleProfile, {
      title: processed.title,
      demoteH1: lintEnabled,
    });
    markdownBody = escapeMarkdownProse(markdownBody);
    const frontmatter: PageFrontmatter = {
      title: processed.title,
      sourcePath: topicPath,
      chmTopic: topicPath,
      keywords: collectKeywordsForTopic(topicPath, options.bundle),
      css: processed.css,
      originalIds: processed.originalIds,
      headingIds: processed.headingIds,
      outboundLinks: processed.outboundLinks,
    };

    let body = `${serializeFrontmatter(frontmatter)}\n\n${markdownBody}`;
    if (lintEnabled && lintConfig) {
      const lintResult = lintMarkdown({
        markdown: body,
        sourcePath: topicPath,
        config: lintConfig,
        fix: options.lintFix === true,
      });
      body = lintResult.markdown;
      warnings.push(...lintResult.warnings);
    }

    pages.push({
      route,
      markdownPath: routeToMarkdownPath(route),
      body,
      frontmatter,
      assetRefs: [...assetMap.values()]
        .filter((asset) => processed.html.includes(asset.projectPath))
        .map((asset) => asset.projectPath),
    });

    if (
      options.onProgress &&
      (index === 0 ||
        (index + 1) % progressInterval === 0 ||
        index === htmlTopics.length - 1)
    ) {
      options.onProgress({
        phase: "convert",
        message: `converting ${topicPath}`,
        current: index + 1,
        total: htmlTopics.length,
      });
    }
  }

  const siteMeta: SiteMeta = {
    title: options.bundle.system.title,
    defaultTopic: options.bundle.system.defaultTopic,
    sourceChm: options.bundle.sourcePath,
    convertedAt: new Date().toISOString(),
    converterVersion: CONVERTER_VERSION,
  };

  const collapsedWarnings = collapseChromeStripWarnings(warnings);

  return {
    siteMeta,
    pages,
    assets,
    downloads,
    nav: mapTocToNav(options.bundle.toc, topicRoutes),
    index: flattenIndex(options.bundle.index, topicRoutes),
    warnings: collapsedWarnings,
  };
}

export interface WriteProjectOptions {
  project: MarkdownProject;
  files: Map<string, Uint8Array>;
  outputDir: string;
  bundle?: ChmBundle;
}

/** Write a MarkdownProject IR and binary assets to disk. */
export async function writeProject(options: WriteProjectOptions): Promise<void> {
  const { project, files, outputDir } = options;
  await mkdir(outputDir, { recursive: true });

  await writeFile(
    join(outputDir, "manifest.json"),
    JSON.stringify(
      {
        siteMeta: project.siteMeta,
        pageCount: project.pages.length,
        assetCount: project.assets.length,
        downloadCount: project.downloads.length,
        warningCount: project.warnings.length,
        tocSource: options.bundle?.tocSource,
        indexSource: options.bundle?.indexSource,
        extractWarningCount: options.bundle?.extractWarnings.length ?? 0,
        tableWarnings: countWarningsByPrefix(project.warnings, "table"),
        layoutWarnings: countWarningCodes(project.warnings, [
          "layout-table-stripped",
          "layout-table-preserved",
          "complex-table",
          "note-table",
          "table-html-fallback",
        ]),
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(join(outputDir, "nav.json"), JSON.stringify(project.nav, null, 2), "utf8");
  await writeFile(join(outputDir, "index.json"), JSON.stringify(project.index, null, 2), "utf8");
  await writeFile(
    join(outputDir, "warnings.json"),
    JSON.stringify(project.warnings, null, 2),
    "utf8",
  );
  await writeFile(join(outputDir, "assets.json"), JSON.stringify(project.assets, null, 2), "utf8");
  await writeFile(
    join(outputDir, "downloads.json"),
    JSON.stringify(project.downloads, null, 2),
    "utf8",
  );

  for (const page of project.pages) {
    const target = join(outputDir, page.markdownPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, page.body, "utf8");
  }

  for (const asset of project.assets) {
    const data = files.get(asset.sourcePath);
    if (!data) {
      continue;
    }
    const diskPath = toDiskPath(asset.projectPath);
    const target = join(outputDir, diskPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  for (const download of project.downloads) {
    const data = files.get(download.sourcePath);
    if (!data) {
      continue;
    }
    const diskPath = toDiskPath(download.projectPath);
    const target = join(outputDir, diskPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }
}

function countWarningCodes(warnings: ConversionWarning[], codes: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const code of codes) {
    counts[code] = 0;
  }
  for (const warning of warnings) {
    if (codes.includes(warning.code)) {
      counts[warning.code] = (counts[warning.code] ?? 0) + 1;
    }
  }
  return counts;
}

function countWarningsByPrefix(warnings: ConversionWarning[], prefix: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const warning of warnings) {
    if (!warning.code.includes(prefix)) {
      continue;
    }
    counts[warning.code] = (counts[warning.code] ?? 0) + 1;
  }
  return counts;
}

export { lintMarkdown, resolveLintConfig, loadMarkdownlintConfig, buildStyleProfile } from "./lint.js";
export { lintProject } from "./lint-project.js";
export type { LintMarkdownOptions, LintMarkdownResult } from "./lint.js";
export type { LintProjectSummary } from "./lint-project.js";
