import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorkspace } from "@chm-md/core";
import {
  buildTopNav,
  buildWorkspaceSidebar,
  buildWorkspaceTopNav,
  emitVitePress,
  emitVitePressWorkspace,
  navToSidebar,
} from "./emit.js";
import type { MarkdownProject, ResolvedWorkspace } from "@chm-md/shared";

function renderIndexPage(project: MarkdownProject): string {
  const defaultRoute = project.siteMeta.defaultTopic
    ? project.siteMeta.defaultTopic.replace(/^\//, "").replace(/\.(html?|xhtml)$/i, "")
    : "index";
  const title = project.siteMeta.title ?? "Documentation";
  return `# ${title}\n\nConverted from ${project.siteMeta.sourceChm}.\n\n[Open default topic](/${defaultRoute})\n`;
}

async function writeMinimalProject(dir: string, id: string): Promise<void> {
  await mkdir(join(dir, "pages", "topics"), { recursive: true });
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      siteMeta: {
        title: `${id} Docs`,
        sourceChm: `${id}.chm`,
        defaultTopic: "/topics/intro.html",
        convertedAt: "2026-01-01",
        converterVersion: "0.1.0",
      },
    }),
    "utf8",
  );
  await writeFile(
    join(dir, "nav.json"),
    JSON.stringify([{ text: "Intro", link: "/topics/intro" }]),
    "utf8",
  );
  await writeFile(join(dir, "index.json"), JSON.stringify([]), "utf8");
  await writeFile(join(dir, "warnings.json"), JSON.stringify([]), "utf8");
  await writeFile(join(dir, "pages", "topics", "intro.md"), "# Intro\n", "utf8");
}

describe("emit helpers", () => {
  const project: MarkdownProject = {
    siteMeta: {
      title: "Sample Help",
      sourceChm: "sample.chm",
      defaultTopic: "/topics/intro.html",
      convertedAt: "2026-01-01",
      converterVersion: "0.1.0",
    },
    pages: [],
    assets: [],
    downloads: [],
    nav: [
      {
        text: "Root",
        link: "/topics/intro",
        children: [{ text: "Child", link: "/topics/child" }],
      },
    ],
    index: [],
    warnings: [],
  };

  it("renders a doc-layout index without home layout", () => {
    const index = renderIndexPage(project);
    expect(index).toContain("# Sample Help");
    expect(index).not.toContain("layout: home");
  });

  it("includes parent links in sidebar groups", () => {
    const sidebar = navToSidebar(project.nav) as Array<Record<string, unknown>>;
    expect(sidebar[0]?.link).toBe("/topics/intro");
    expect(sidebar[0]?.items).toBeDefined();
    expect(sidebar[0]?.collapsed).toBe(true);
  });

  it("builds a minimal top nav without the full TOC tree", () => {
    const nav = buildTopNav(project) as Array<{ text: string; link: string }>;
    expect(nav).toEqual([
      { text: "Home", link: "/" },
      { text: "Default topic", link: "/topics/intro" },
    ]);
  });
});

describe("emit vitepress config", () => {
  it("includes local search in single-project emit", async () => {
    const root = await mkdtemp(join(tmpdir(), "chm-md-emit-"));
    const projectDir = join(root, "project");
    const outputDir = join(root, "site");
    await writeMinimalProject(projectDir, "sample");
    await emitVitePress({ projectDir, outputDir });

    const config = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(outputDir, "docs", ".vitepress", "config.ts"), "utf8"),
    );
    expect(config).toContain('provider: "local"');
    expect(config).toContain("detailedView: true");

    const themeIndex = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(outputDir, "docs", ".vitepress", "theme", "index.ts"), "utf8"),
    );
    expect(themeIndex).toContain("DefaultTheme");

    const customCss = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(outputDir, "docs", ".vitepress", "theme", "custom.css"), "utf8"),
    );
    expect(customCss).toContain(".VPNavBarTitle .title");

    const pnpmWorkspace = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(outputDir, "pnpm-workspace.yaml"), "utf8"),
    );
    expect(pnpmWorkspace).toContain("esbuild: true");
  });

  it("writes multi-sidebar keys for workspace emit", async () => {
    const root = await mkdtemp(join(tmpdir(), "chm-md-emit-ws-"));
    const alphaDir = join(root, "alpha");
    const betaDir = join(root, "beta");
    await writeMinimalProject(alphaDir, "alpha");
    await writeMinimalProject(betaDir, "beta");

    const manifestPath = join(root, "docs-workspace.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        title: "Workspace",
        collections: [
          { id: "alpha", title: "Alpha", source: "./alpha" },
          { id: "beta", title: "Beta", source: "./beta" },
        ],
      }),
      "utf8",
    );

    const resolved = await resolveWorkspace({ manifestPath, lint: false });
    const workspace: ResolvedWorkspace = resolved;
    const sidebar = buildWorkspaceSidebar(workspace);
    expect(sidebar["/alpha/"]).toBeDefined();
    expect(sidebar["/beta/"]).toBeDefined();

    const topNav = buildWorkspaceTopNav(workspace) as Array<{ text: string; link: string }>;
    expect(topNav.map((item) => item.text)).toEqual(["Home", "Alpha", "Beta"]);

    const outputDir = join(root, "site");
    const summary = await emitVitePressWorkspace({ workspace: resolved, outputDir });
    expect(summary.collectionCount).toBe(2);

    const config = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(outputDir, "docs", ".vitepress", "config.ts"), "utf8"),
    );
    expect(config).toContain('"/alpha/"');
    expect(config).toContain('"/beta/"');
    expect(config).toContain('provider: "local"');

    const alphaPage = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(outputDir, "docs", "alpha", "topics", "intro.md"), "utf8"),
    );
    expect(alphaPage).toContain("# Intro");
  });

  it("emits a workspace with a markdown collection", async () => {
    const root = await mkdtemp(join(tmpdir(), "chm-md-emit-markdown-"));
    const manualDir = join(root, "manual");
    await mkdir(manualDir, { recursive: true });
    await writeFile(join(manualDir, "page.md"), "# Manual Page\n", "utf8");

    const manifestPath = join(root, "docs-workspace.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        title: "Workspace",
        collections: [{ id: "manual", title: "Manual", source: "./manual", kind: "markdown" }],
      }),
      "utf8",
    );

    const resolved = await resolveWorkspace({ manifestPath, lint: false });
    const outputDir = join(root, "site");
    await emitVitePressWorkspace({ workspace: resolved, outputDir });

    const config = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(outputDir, "docs", ".vitepress", "config.ts"), "utf8"),
    );
    expect(config).toContain('"/manual/"');

    const page = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(outputDir, "docs", "manual", "page.md"), "utf8"),
    );
    expect(page).toContain("# Manual Page");
  });
});
