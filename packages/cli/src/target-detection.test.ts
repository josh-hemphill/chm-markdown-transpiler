import { describe, expect, it } from "vitest";
import {
  isMarkdownProjectDir,
  resolveWorkspaceManifestPath,
  WORKSPACE_MANIFEST_NAME,
} from "@chm-md/core";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("cli target detection", () => {
  it("distinguishes workspace manifest from project directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "chm-md-cli-target-"));
    const projectDir = join(root, "project");
    await mkdir(join(projectDir, "pages"), { recursive: true });
    await writeFile(join(projectDir, "manifest.json"), "{}", "utf8");

    const manifestPath = join(root, WORKSPACE_MANIFEST_NAME);
    await writeFile(
      manifestPath,
      JSON.stringify({
        title: "Workspace",
        collections: [{ id: "a", title: "A", source: "./project" }],
      }),
      "utf8",
    );

    expect(isMarkdownProjectDir(projectDir)).toBe(true);
    expect(resolveWorkspaceManifestPath(projectDir)).toBeNull();
    expect(resolveWorkspaceManifestPath(root)).toBe(manifestPath);
    expect(resolveWorkspaceManifestPath(manifestPath)).toBe(manifestPath);
  });
});
