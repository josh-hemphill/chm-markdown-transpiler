import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isMarkdownProjectDir,
  loadWorkspaceManifest,
  prefixProject,
  resolveWorkspaceManifestPath,
} from "./workspace.js";
import type { MarkdownProject } from "@chm-md/shared";

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

describe("workspace manifest", () => {
  it("loads manifest and infers project kind", async () => {
    const root = await mkdtemp(join(tmpdir(), "chm-md-workspace-"));
    const projectDir = join(root, "alpha-project");
    await writeMinimalProject(projectDir, "alpha");

    const manifestPath = join(root, "docs-workspace.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        title: "Test Workspace",
        collections: [{ id: "alpha", title: "Alpha", source: "./alpha-project" }],
      }),
      "utf8",
    );

    const manifest = await loadWorkspaceManifest(manifestPath);
    expect(manifest.collections[0]?.id).toBe("alpha");
    expect(resolveWorkspaceManifestPath(root)).toBe(manifestPath);
    expect(isMarkdownProjectDir(projectDir)).toBe(true);
  });

  it("prefixes routes, nav links, and index entries", () => {
    const project: MarkdownProject = {
      siteMeta: {
        title: "Sample",
        sourceChm: "sample.chm",
        defaultTopic: "/topics/intro.html",
        convertedAt: "2026-01-01",
        converterVersion: "0.1.0",
      },
      pages: [
        {
          route: "topics/intro",
          markdownPath: "pages/topics/intro.md",
          body: "![x](/assets/img.png)",
          frontmatter: { sourcePath: "", chmTopic: "" },
          assetRefs: ["/assets/img.png"],
        },
      ],
      assets: [],
      downloads: [],
      nav: [{ text: "Intro", link: "/topics/intro" }],
      index: [{ keyword: "intro", pageRoute: "topics/intro" }],
      warnings: [],
    };

    const prefixed = prefixProject(project, "alpha");
    expect(prefixed.pages[0]?.route).toBe("alpha/topics/intro");
    expect(prefixed.pages[0]?.body).toContain("](/assets/alpha/");
    expect(prefixed.nav[0]?.link).toBe("/alpha/topics/intro");
    expect(prefixed.index[0]?.pageRoute).toBe("alpha/topics/intro");
    expect(prefixed.siteMeta.defaultTopic).toBe("/alpha/topics/intro");
  });
});
