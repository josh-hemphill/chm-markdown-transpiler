import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractChm } from "./extract.js";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = join(rootDir, "fixtures", "PowerCollections.chm");

describe("extractChm", () => {
  it("extracts bundle metadata from a real CHM", async () => {
    const result = await extractChm({ sourcePath: fixturePath });
    expect(result.bundle.entries.length).toBeGreaterThan(0);
    expect(result.bundle.system.title).toBeTruthy();
    expect(result.bundle.toc.length).toBeGreaterThan(0);
    expect(result.files.size).toBeGreaterThan(0);
  });
});
