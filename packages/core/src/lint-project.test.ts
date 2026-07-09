import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lintProject } from "./lint-project.js";

describe("lintProject", () => {
  it("relints pages and updates warnings.json", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "chm-md-lint-"));
    await mkdir(join(projectDir, "pages"), { recursive: true });
    await writeFile(
      join(projectDir, "manifest.json"),
      JSON.stringify({ siteMeta: { title: "Lint" }, warningCount: 0 }),
      "utf8",
    );
    await writeFile(join(projectDir, "warnings.json"), "[]", "utf8");
    await writeFile(
      join(projectDir, "pages", "bad.md"),
      `---
sourcePath: "/bad.html"
chmTopic: "/bad.html"
---
# Title

Trailing spaces   
`,
      "utf8",
    );

    const summary = await lintProject({ projectDir, fix: true });
    expect(summary.pageCount).toBe(1);
    expect(summary.fixedCount).toBeGreaterThanOrEqual(0);

    const rewritten = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(projectDir, "pages", "bad.md"), "utf8"),
    );
    expect(rewritten).toContain("sourcePath:");
    expect(rewritten.endsWith("\n")).toBe(true);
  });
});
