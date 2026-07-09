import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDoctorSummary, runDoctor } from "./doctor.js";

async function writeMinimalProject(dir: string): Promise<void> {
  await mkdir(join(dir, "pages"), { recursive: true });
  await writeFile(
    join(dir, "manifest.json"),
    JSON.stringify({
      siteMeta: { title: "Alpha" },
      pageCount: 1,
      assetCount: 0,
      downloadCount: 0,
      warningCount: 1,
    }),
    "utf8",
  );
  await writeFile(join(dir, "nav.json"), "[]", "utf8");
  await writeFile(join(dir, "index.json"), "[]", "utf8");
  await writeFile(
    join(dir, "warnings.json"),
    JSON.stringify([{ code: "note-table", message: "note", sourcePath: "/a.html" }]),
    "utf8",
  );
  await writeFile(join(dir, "pages", "index.md"), "# Index\n", "utf8");
}

describe("doctor workspace", () => {
  it("aggregates collection reports for a workspace manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "chm-md-doctor-ws-"));
    const alphaDir = join(root, "alpha-project");
    const betaDir = join(root, "beta-project");
    await writeMinimalProject(alphaDir);
    await writeMinimalProject(betaDir);

    const manifestPath = join(root, "docs-workspace.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        title: "Workspace",
        collections: [
          { id: "alpha", title: "Alpha", source: "./alpha-project", kind: "project" },
          { id: "beta", title: "Beta", source: "./beta-project", kind: "project" },
        ],
      }),
      "utf8",
    );

    const report = await runDoctor(manifestPath);
    expect(report.targetType).toBe("workspace");
    expect(report.summary.collectionCount).toBe(2);
    expect(report.summary.warningCount).toBe(2);
    expect(report.collections).toHaveLength(2);

    const summary = formatDoctorSummary(report);
    expect(summary).toContain("type=workspace");
    expect(summary).toContain("collections=2");
  });
});
