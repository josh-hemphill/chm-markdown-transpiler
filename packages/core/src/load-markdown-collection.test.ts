import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadMarkdownCollection } from "./load-markdown-collection.js";
import { prefixProject, resolveWorkspace } from "./workspace.js";

describe("loadMarkdownCollection", () => {
  it("builds pages and nav from a plain markdown folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "chm-md-markdown-"));
    await mkdir(join(root, "guides"), { recursive: true });
    await writeFile(join(root, "index.md"), "# Manual Docs\n\nWelcome.\n", "utf8");
    await writeFile(join(root, "guides", "intro.md"), "# Intro\n\nGuide intro.\n", "utf8");

    const project = await loadMarkdownCollection({ sourceDir: root, title: "Manual Docs" });
    expect(project.pages).toHaveLength(2);
    expect(project.pages.map((page) => page.route).sort()).toEqual(["guides/intro", "index"]);
    expect(project.nav.some((node) => node.link === "/guides/intro")).toBe(true);
    expect(project.siteMeta.title).toBe("Manual Docs");
  });

  it("prefixes markdown collection routes in a workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "chm-md-markdown-ws-"));
    const manualDir = join(root, "manual");
    await mkdir(manualDir, { recursive: true });
    await writeFile(join(manualDir, "page.md"), "# Page\n", "utf8");

    const manifestPath = join(root, "docs-workspace.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        title: "Mixed Workspace",
        collections: [{ id: "manual", title: "Manual", source: "./manual", kind: "markdown" }],
      }),
      "utf8",
    );

    const resolved = await resolveWorkspace({ manifestPath, lint: false });
    const collection = resolved.collections[0]!;
    expect(collection.project.pages[0]?.route).toBe("manual/page");
    expect(collection.project.nav[0]?.link).toBe("/manual/page");

    const prefixed = prefixProject(
      await loadMarkdownCollection({ sourceDir: manualDir, title: "Manual" }),
      "manual",
    );
    expect(prefixed.pages[0]?.route).toBe("manual/page");
  });
});
