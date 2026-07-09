import { describe, expect, it } from "vitest";
import type { ChmBundle } from "@chm-md/shared";
import { countErrors, summarizeWarnings } from "@chm-md/shared";
import { convertBundle } from "./convert.js";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const syntheticBundle: ChmBundle = {
  sourcePath: "synthetic.chm",
  system: { title: "Sample Help" },
  entries: [
    { path: "/topics/intro.html", size: 1, compressed: false, kind: "html" },
    { path: "/topics/details.html", size: 1, compressed: false, kind: "html" },
  ],
  toc: [
    {
      name: "Introduction",
      local: "/topics/intro.html",
      children: [{ name: "Details", local: "/topics/details.html", children: [] }],
    },
  ],
  index: [{ name: "overview", local: "/topics/intro.html", children: [] }],
  tocSource: "hhc",
  indexSource: "hhk",
  extractWarnings: [{ code: "toc-cross-check", message: "cross check" }],
};

const syntheticFiles = new Map<string, Uint8Array>([
  ["/topics/intro.html", encode("<html><head><title>Intro</title></head><body><h1>Intro</h1></body></html>")],
  ["/topics/details.html", encode("<html><head><title>Details</title></head><body><h1>Details</h1></body></html>")],
]);

/** Build the same summary fields convertChm derives from bundle + project. */
function buildConvertSummary(bundle: ChmBundle, project: ReturnType<typeof convertBundle>) {
  const allWarnings = [...bundle.extractWarnings, ...project.warnings];
  return {
    entryCount: bundle.entries.length,
    pageCount: project.pages.length,
    assetCount: project.assets.length,
    downloadCount: project.downloads.length,
    tocSource: bundle.tocSource,
    indexSource: bundle.indexSource,
    tocNodeCount: 2,
    indexNodeCount: bundle.index.length,
    warnings: summarizeWarnings(allWarnings),
    extractWarnings: summarizeWarnings(bundle.extractWarnings),
    errorCount: countErrors(allWarnings),
  };
}

describe("convert run summary", () => {
  it("derives expected counts from a synthetic bundle", () => {
    const project = convertBundle({
      bundle: syntheticBundle,
      files: syntheticFiles,
      lint: false,
    });
    const summary = buildConvertSummary(syntheticBundle, project);

    expect(summary.pageCount).toBe(2);
    expect(summary.entryCount).toBe(2);
    expect(summary.tocSource).toBe("hhc");
    expect(summary.indexNodeCount).toBe(1);
    expect(summary.extractWarnings.total).toBe(1);
    expect(summary.errorCount).toBe(0);
  });
});
