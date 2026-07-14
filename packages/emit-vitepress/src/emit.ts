import { cp, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { loadProject, type LoadedProject } from "@chm-md/core";
import type {
  ConversionWarning,
  EmitRunSummary,
  MarkdownProject,
  NavNode,
  ResolvedWorkspace,
} from "@chm-md/shared";

export type { LoadedProject } from "@chm-md/core";

export interface EmitVitePressOptions {
  projectDir: string;
  outputDir: string;
  onWarning?: (warning: ConversionWarning) => void;
}

export interface EmitVitePressWorkspaceOptions {
  workspace: ResolvedWorkspace;
  outputDir: string;
  workspaceManifestPath?: string;
  onWarning?: (warning: ConversionWarning) => void;
}

const LOCAL_SEARCH_CONFIG = `    search: {
      provider: "local",
      options: {
        detailedView: true,
      },
    },`;

/** Map project nav tree to VitePress sidebar items. */
export function navToSidebar(nodes: NavNode[]): unknown[] {
  return nodes.map((node) => {
    if (node.children && node.children.length > 0) {
      return {
        text: node.text,
        link: node.link ?? undefined,
        collapsed: true,
        items: navToSidebar(node.children),
      };
    }
    return {
      text: node.text,
      link: node.link ?? undefined,
    };
  });
}

/** Minimal top nav: home + default topic only (full TOC lives in the sidebar). */
export function buildTopNav(project: MarkdownProject): unknown[] {
  const defaultRoute = project.siteMeta.defaultTopic
    ? project.siteMeta.defaultTopic.replace(/^\//, "").replace(/\.(html?|xhtml)$/i, "")
    : undefined;

  const nav: Array<{ text: string; link: string }> = [{ text: "Home", link: "/" }];
  if (defaultRoute) {
    nav.push({ text: "Default topic", link: `/${defaultRoute}` });
  }
  return nav;
}

/** Top nav for a multi-collection workspace. */
export function buildWorkspaceTopNav(workspace: ResolvedWorkspace): unknown[] {
  const nav: Array<{ text: string; link: string }> = [{ text: "Home", link: "/" }];
  for (const collection of workspace.collections) {
    const defaultRoute = collection.project.siteMeta.defaultTopic
      ? collection.project.siteMeta.defaultTopic
          .replace(/^\//, "")
          .replace(/\.(html?|xhtml)$/i, "")
      : collection.prefix;
    nav.push({
      text: collection.title,
      link: `/${defaultRoute}`,
    });
  }
  return nav;
}

/** Multi-sidebar map keyed by collection path prefix. */
export function buildWorkspaceSidebar(workspace: ResolvedWorkspace): Record<string, unknown[]> {
  const sidebar: Record<string, unknown[]> = {};
  for (const collection of workspace.collections) {
    sidebar[`/${collection.prefix}/`] = navToSidebar(collection.project.nav);
  }
  return sidebar;
}

function renderConfig(project: MarkdownProject): string {
  const sidebar = JSON.stringify(navToSidebar(project.nav), null, 2);
  const nav = JSON.stringify(buildTopNav(project), null, 2);
  const title = project.siteMeta.title ?? "CHM Documentation";
  const description = `Converted from ${project.siteMeta.sourceChm}`;

  return `import { defineConfig } from "vitepress";

export default defineConfig({
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description)},
  themeConfig: {
    nav: ${nav},
    sidebar: ${sidebar},
    aside: true,
${LOCAL_SEARCH_CONFIG}
  },
});
`;
}

function renderWorkspaceConfig(workspace: ResolvedWorkspace): string {
  const nav = JSON.stringify(buildWorkspaceTopNav(workspace), null, 2);
  const sidebar = JSON.stringify(buildWorkspaceSidebar(workspace), null, 2);
  const title = workspace.siteMeta.title;
  const description = workspace.siteMeta.description ?? "Multi-collection documentation workspace";

  return `import { defineConfig } from "vitepress";

export default defineConfig({
  title: ${JSON.stringify(title)},
  description: ${JSON.stringify(description)},
  themeConfig: {
    nav: ${nav},
    sidebar: ${sidebar},
    aside: true,
${LOCAL_SEARCH_CONFIG}
  },
});
`;
}

function renderPnpmWorkspaceYaml(): string {
  return "allowBuilds:\n  esbuild: true\n";
}

function renderThemeIndex(): string {
  return `import DefaultTheme from 'vitepress/theme'
import './custom.css'

export default {
  extends: DefaultTheme,
}
`;
}

function renderCustomCss(): string {
  return `.VPNavBarTitle .title {
  max-width: min(28rem, 40vw);
  white-space: normal;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
`;
}

async function writeVitePressTheme(vitepressDir: string): Promise<void> {
  const themeDir = join(vitepressDir, "theme");
  await mkdir(themeDir, { recursive: true });
  await writeFile(join(themeDir, "index.ts"), renderThemeIndex(), "utf8");
  await writeFile(join(themeDir, "custom.css"), renderCustomCss(), "utf8");
}

function renderPackageJson(title: string): string {
  return JSON.stringify(
    {
      name: "chm-vitepress-site",
      private: true,
      type: "module",
      scripts: {
        dev: "vitepress dev docs",
        build: "vitepress build docs",
        preview: "vitepress preview docs",
      },
      devDependencies: {
        vitepress: "^1.6.3",
      },
    },
    null,
    2,
  );
}

function renderIndexPage(project: MarkdownProject): string {
  const defaultRoute = project.siteMeta.defaultTopic
    ? project.siteMeta.defaultTopic.replace(/^\//, "").replace(/\.(html?|xhtml)$/i, "")
    : "index";
  const title = project.siteMeta.title ?? "Documentation";
  const source = project.siteMeta.sourceChm;

  return `# ${title}

Converted from ${source}.

[Open default topic](/${defaultRoute})
`;
}

function renderWorkspaceIndexPage(workspace: ResolvedWorkspace): string {
  const lines = [
    `# ${workspace.siteMeta.title}`,
    "",
    workspace.siteMeta.description ?? "Documentation collections in this workspace.",
    "",
    "## Collections",
    "",
  ];

  for (const collection of workspace.collections) {
    const defaultRoute = collection.project.siteMeta.defaultTopic
      ? collection.project.siteMeta.defaultTopic
          .replace(/^\//, "")
          .replace(/\.(html?|xhtml)$/i, "")
      : collection.prefix;
    lines.push(`- [${collection.title}](/${defaultRoute})`);
  }

  return `${lines.join("\n")}\n`;
}

function renderCollectionIndexPage(collection: ResolvedWorkspace["collections"][number]): string {
  const defaultRoute = collection.project.siteMeta.defaultTopic
    ? collection.project.siteMeta.defaultTopic
        .replace(/^\//, "")
        .replace(/\.(html?|xhtml)$/i, "")
    : "index";

  return `# ${collection.title}

[Open default topic](/${defaultRoute})
`;
}

function countNavNodes(nodes: NavNode[]): number {
  return nodes.reduce(
    (total, node) => total + 1 + (node.children ? countNavNodes(node.children) : 0),
    0,
  );
}

async function walkFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

async function copyPrefixedTree(
  sourceDir: string,
  publicDir: string,
  bucket: "assets" | "downloads",
  prefix: string,
  seen: Map<string, string>,
  warnings: ConversionWarning[],
): Promise<void> {
  let files: string[];
  try {
    await stat(sourceDir);
    files = await walkFiles(sourceDir);
  } catch {
    return;
  }

  for (const filePath of files) {
    const relativePath = relative(sourceDir, filePath).replace(/\\/g, "/");
    const destKey = prefix ? `${bucket}/${prefix}/${relativePath}` : `${bucket}/${relativePath}`;
    const existing = seen.get(destKey);
    if (existing) {
      warnings.push({
        code: "asset-collision",
        message: `Skipped ${destKey}; already written by ${existing}`,
        sourcePath: filePath,
      });
      continue;
    }

    const target = prefix
      ? join(publicDir, bucket, prefix, relativePath)
      : join(publicDir, bucket, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await cp(filePath, target, { force: true });
    seen.set(destKey, prefix || bucket);
  }
}

async function writeProjectPages(docsDir: string, project: MarkdownProject): Promise<void> {
  for (const page of project.pages) {
    const target = join(docsDir, `${page.route}.md`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, page.body, "utf8");
  }
}

/** Emit a VitePress site from a MarkdownProject directory. */
export async function emitVitePress(options: EmitVitePressOptions): Promise<EmitRunSummary> {
  const startedAt = Date.now();
  const project = await loadProject(options.projectDir);
  const docsDir = join(options.outputDir, "docs");
  const vitepressDir = join(docsDir, ".vitepress");
  const publicDir = join(docsDir, "public");

  await mkdir(vitepressDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  await writeFile(
    join(options.outputDir, "package.json"),
    renderPackageJson(project.siteMeta.title ?? "CHM Documentation"),
    "utf8",
  );
  await writeFile(join(options.outputDir, "pnpm-workspace.yaml"), renderPnpmWorkspaceYaml(), "utf8");
  await writeFile(join(vitepressDir, "config.ts"), renderConfig(project), "utf8");
  await writeVitePressTheme(vitepressDir);
  await writeFile(join(docsDir, "index.md"), renderIndexPage(project), "utf8");
  await writeProjectPages(docsDir, project);

  const seen = new Map<string, string>();
  const warnings: ConversionWarning[] = [];
  await copyPrefixedTree(
    join(options.projectDir, "assets"),
    publicDir,
    "assets",
    "",
    seen,
    warnings,
  );
  await copyPrefixedTree(
    join(options.projectDir, "downloads"),
    publicDir,
    "downloads",
    "",
    seen,
    warnings,
  );

  if (warnings.length > 0) {
    for (const warning of warnings) {
      options.onWarning?.(warning);
    }
    if (!options.onWarning) {
      console.warn(
        warnings.map((warning) => `${warning.code}: ${warning.message}`).join("\n"),
      );
    }
  }

  return {
    emitter: "vitepress",
    projectDir: options.projectDir,
    outputDir: options.outputDir,
    durationMs: Date.now() - startedAt,
    pageCount: project.pages.length,
    navNodeCount: countNavNodes(project.nav),
  };
}

/** Emit a VitePress site from a resolved multi-collection workspace. */
export async function emitVitePressWorkspace(
  options: EmitVitePressWorkspaceOptions,
): Promise<EmitRunSummary> {
  const startedAt = Date.now();
  const { workspace } = options;
  const docsDir = join(options.outputDir, "docs");
  const vitepressDir = join(docsDir, ".vitepress");
  const publicDir = join(docsDir, "public");

  await mkdir(vitepressDir, { recursive: true });
  await mkdir(publicDir, { recursive: true });

  await writeFile(
    join(options.outputDir, "package.json"),
    renderPackageJson(workspace.siteMeta.title),
    "utf8",
  );
  await writeFile(join(options.outputDir, "pnpm-workspace.yaml"), renderPnpmWorkspaceYaml(), "utf8");
  await writeFile(join(vitepressDir, "config.ts"), renderWorkspaceConfig(workspace), "utf8");
  await writeVitePressTheme(vitepressDir);
  await writeFile(join(docsDir, "index.md"), renderWorkspaceIndexPage(workspace), "utf8");

  let pageCount = 0;
  let navNodeCount = 0;
  const seen = new Map<string, string>();
  const warnings: ConversionWarning[] = [...workspace.warnings];

  for (const collection of workspace.collections) {
    const collectionIndexPath = join(docsDir, collection.prefix, "index.md");
    await mkdir(dirname(collectionIndexPath), { recursive: true });
    await writeFile(collectionIndexPath, renderCollectionIndexPage(collection), "utf8");
    await writeProjectPages(docsDir, collection.project);
    pageCount += collection.project.pages.length;
    navNodeCount += countNavNodes(collection.project.nav);

    await copyPrefixedTree(
      join(collection.projectDir, "assets"),
      publicDir,
      "assets",
      collection.prefix,
      seen,
      warnings,
    );
    await copyPrefixedTree(
      join(collection.projectDir, "downloads"),
      publicDir,
      "downloads",
      collection.prefix,
      seen,
      warnings,
    );
  }

  if (warnings.length > 0) {
    const collisionWarnings = warnings.filter((warning) => warning.code === "asset-collision");
    for (const warning of collisionWarnings) {
      options.onWarning?.(warning);
    }
    if (!options.onWarning && collisionWarnings.length > 0) {
      console.warn(
        collisionWarnings.map((warning) => `${warning.code}: ${warning.message}`).join("\n"),
      );
    }
  }

  const manifestPath = options.workspaceManifestPath;
  const projectDir = manifestPath
    ? dirname(manifestPath)
    : dirname(options.workspace.collections[0]?.projectDir ?? options.outputDir);

  return {
    emitter: "vitepress",
    projectDir,
    outputDir: options.outputDir,
    durationMs: Date.now() - startedAt,
    pageCount,
    navNodeCount,
    collectionCount: workspace.collections.length,
  };
}
