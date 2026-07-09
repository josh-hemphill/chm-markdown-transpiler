import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { convertChm } from "@chm-md/core";
import { emitVitePress } from "@chm-md/emit-vitepress";
import { runDoctor } from "@chm-md/cli";
import { ensurePowerCollectionsFixture } from "./ensure-fixture.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

describe("end-to-end chm pipeline", () => {
  it(
    "converts a real CHM, emits vitepress, and produces doctor report",
    async () => {
      const chmPath = await ensurePowerCollectionsFixture();
      const projectDir = await mkdtemp(join(tmpdir(), "chm-md-e2e-project-"));
      const siteDir = await mkdtemp(join(tmpdir(), "chm-md-e2e-site-"));

      const first = await convertChm({ sourcePath: chmPath, outputDir: projectDir, lint: false });
      expect(first.cacheHit).toBe(false);
      expect(first.convertHash).toBeTruthy();
      expect(existsSync(join(projectDir, "convert-cache.json"))).toBe(true);

      const cached = await convertChm({ sourcePath: chmPath, outputDir: projectDir, lint: false });
      expect(cached.cacheHit).toBe(true);
      expect(cached.convertHash).toBe(first.convertHash);

      const forced = await convertChm({
        sourcePath: chmPath,
        outputDir: projectDir,
        lint: false,
        force: true,
      });
      expect(forced.cacheHit).toBe(false);
      expect(forced.convertHash).toBe(first.convertHash);

      await emitVitePress({ projectDir, outputDir: siteDir });

      const report = await runDoctor(projectDir);
      expect(report.summary.pageCount).toBeGreaterThan(0);
      expect(report.summary.tocSource).toBe("hhc");
      expect(report.summary.tableWarnings?.["layout-table-stripped"]).toBeGreaterThan(0);

      const indexMd = await import("node:fs/promises").then((fs) =>
        fs.readFile(join(siteDir, "docs", "index.md"), "utf8"),
      );
      expect(indexMd).not.toContain("layout: home");

      const configTs = await import("node:fs/promises").then((fs) =>
        fs.readFile(join(siteDir, "docs", ".vitepress", "config.ts"), "utf8"),
      );
      expect(configTs).toContain("nav:");
      expect(configTs).toContain('"Home"');
      expect(configTs).toContain('"Default topic"');
      expect(configTs).toContain('provider: "local"');
      const navBlock = configTs.slice(configTs.indexOf("nav:"), configTs.indexOf("sidebar:"));
      expect(navBlock).not.toContain('"items"');
    },
    120_000,
  );
});
