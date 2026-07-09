import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  countTocNodes,
  extractChm,
  maxTocDepth,
  parseBinaryToc,
} from "./extract.js";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = join(rootDir, "fixtures", "PowerCollections.chm");

describe("PowerCollections sitemap and binary TOC", () => {
  it("parses deeply nested text TOC from .hhc", async () => {
    const { bundle } = await extractChm({ sourcePath: fixturePath });
    expect(bundle.tocSource).toBe("hhc");
    expect(countTocNodes(bundle.toc)).toBeGreaterThan(100);
    expect(maxTocDepth(bundle.toc)).toBeGreaterThan(2);

    const namespace = bundle.toc.find((node) =>
      node.name.includes("Wintellect.PowerCollections Namespace"),
    );
    expect(namespace?.children.length).toBeGreaterThan(0);
    const algorithms = namespace?.children.find((node) => node.name === "Algorithms Class");
    expect(algorithms?.children.some((node) => node.name === "Algorithms Members")).toBe(true);
  });

  it("parses binary TOC with comparable coverage", async () => {
    const { bundle, files } = await extractChm({
      sourcePath: fixturePath,
      preferBinaryToc: true,
    });
    expect(bundle.tocSource).toBe("binary");
    const binaryToc = parseBinaryToc(files);
    expect(countTocNodes(binaryToc)).toBeGreaterThan(100);
    expect(maxTocDepth(binaryToc)).toBeGreaterThan(2);
  });

  it("keeps HHK index entries with locals", async () => {
    const { bundle } = await extractChm({ sourcePath: fixturePath });
    expect(bundle.indexSource).toBe("hhk");
    expect(bundle.index.length).toBeGreaterThan(10);
    expect(bundle.index.some((entry) => entry.local !== undefined)).toBe(true);
  });
});
