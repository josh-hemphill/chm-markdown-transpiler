import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertChm, loadProject } from "./index.js";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = join(rootDir, "fixtures", "PowerCollections.chm");

describe("loadProject", () => {
  it(
    "round-trips frontmatter and asset/download sidecars",
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), "chm-md-load-"));
      await convertChm({ sourcePath: fixturePath, outputDir, lint: false });

      const loaded = await loadProject(outputDir);
      expect(loaded.pages.length).toBeGreaterThan(0);

      const withTitle = loaded.pages.find((page) => page.frontmatter.title);
      expect(withTitle).toBeTruthy();
      expect(withTitle?.frontmatter.sourcePath).toBeTruthy();
      expect(withTitle?.frontmatter.chmTopic).toBeTruthy();
      expect(loaded.assets.length).toBeGreaterThan(0);
      expect(loaded.pages.some((page) => page.assetRefs.length > 0 || page.body.includes("/assets/"))).toBe(
        true,
      );
    },
    120_000,
  );

  it("loads a minimal project with YAML frontmatter", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "chm-md-minimal-"));
    await mkdir(join(projectDir, "pages"), { recursive: true });
    await writeFile(
      join(projectDir, "manifest.json"),
      JSON.stringify({
        siteMeta: {
          title: "Minimal",
          sourceChm: "minimal.chm",
          convertedAt: "2026-01-01",
          converterVersion: "0.1.0",
        },
      }),
      "utf8",
    );
    await writeFile(join(projectDir, "nav.json"), "[]", "utf8");
    await writeFile(join(projectDir, "index.json"), "[]", "utf8");
    await writeFile(join(projectDir, "warnings.json"), "[]", "utf8");
    await writeFile(
      join(projectDir, "assets.json"),
      JSON.stringify([
        { sourcePath: "/img.png", projectPath: "/assets/img.png", kind: "image" },
      ]),
      "utf8",
    );
    await writeFile(
      join(projectDir, "downloads.json"),
      JSON.stringify([
        { sourcePath: "/file.zip", projectPath: "/downloads/file.zip", fileName: "file.zip" },
      ]),
      "utf8",
    );
    await writeFile(
      join(projectDir, "pages", "index.md"),
      `---
title: "Hello"
sourcePath: "/hello.html"
chmTopic: "/hello.html"
---
# Hello

![icon](/assets/img.png)
`,
      "utf8",
    );

    const loaded = await loadProject(projectDir);
    expect(loaded.pages[0]?.frontmatter.title).toBe("Hello");
    expect(loaded.pages[0]?.frontmatter.sourcePath).toBe("/hello.html");
    expect(loaded.assets).toHaveLength(1);
    expect(loaded.downloads).toHaveLength(1);
    expect(loaded.pages[0]?.assetRefs).toContain("/assets/img.png");
  });
});
