import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractChm } from "./extract.js";
import { countTocNodes, maxTocDepth, parseBinaryToc } from "./binary-toc.js";
import { countSitemapNodes, maxSitemapDepth, parseSitemap } from "./sitemap.js";
import { decodeChmText } from "./decode.js";

const rootDir = fileURLToPath(new URL("../../..", import.meta.url));
const fixturePath = join(rootDir, "fixtures", "PowerCollections.chm");

describe("parseBinaryToc", () => {
  it("matches text TOC coverage on PowerCollections", async () => {
    const { bundle, files } = await extractChm({ sourcePath: fixturePath });
    const hhcPath = bundle.entries.find((entry) => entry.path.endsWith(".hhc"))?.path;
    const hhcHtml = hhcPath ? decodeChmText(files.get(hhcPath)!) : "";
    const textToc = parseSitemap(hhcHtml);
    const binaryToc = parseBinaryToc(files);

    const textCount = countSitemapNodes(textToc);
    const binaryCount = countTocNodes(binaryToc);

    expect(binaryCount).toBeGreaterThan(100);
    expect(textCount).toBeGreaterThan(100);
    expect(Math.abs(binaryCount - textCount)).toBeLessThan(textCount * 0.1);
    expect(maxTocDepth(binaryToc)).toBeGreaterThan(2);
    expect(maxSitemapDepth(textToc)).toBeGreaterThan(2);
  });
});
