import { describe, expect, it } from "vitest";
import type { ChmBundle } from "@chm-md/shared";
import { convertBundle } from "./convert.js";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

const syntheticBundle: ChmBundle = {
  sourcePath: "synthetic.chm",
  system: {
    title: "Sample Help",
    defaultTopic: "/topics/intro.html",
    tocFile: "/toc.hhc",
    indexFile: "/index.hhk",
  },
  entries: [
    { path: "/topics/intro.html", size: 1, compressed: false, kind: "html" },
    { path: "/topics/details.html", size: 1, compressed: false, kind: "html" },
    { path: "/images/logo.png", size: 1, compressed: false, kind: "image" },
    { path: "/files/guide.pdf", size: 1, compressed: false, kind: "download" },
    { path: "/toc.hhc", size: 1, compressed: false, kind: "meta" },
    { path: "/index.hhk", size: 1, compressed: false, kind: "meta" },
  ],
  toc: [
    {
      name: "Introduction",
      local: "/topics/intro.html",
      children: [
        {
          name: "Details",
          local: "/topics/details.html",
          children: [],
        },
      ],
    },
  ],
  index: [
    {
      name: "overview",
      local: "/topics/intro.html",
      children: [],
    },
  ],
  tocSource: "hhc",
  indexSource: "hhk",
  extractWarnings: [],
};

const syntheticFiles = new Map<string, Uint8Array>([
  [
    "/topics/intro.html",
    encode(`<!DOCTYPE html>
<html>
<head><title>Introduction</title><link rel="stylesheet" href="../styles/help.css"></head>
<body>
<!-- legacy init -->
<script>window.__CHM = true;</script>
<h1>Introduction</h1>
<p>See <a href="details.html">details</a> and <img src="../images/logo.png" alt="logo"></p>
<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>1</td></tr></table>
</body>
</html>`),
  ],
  [
    "/topics/details.html",
    encode(`<!DOCTYPE html><html><head><title>Details</title></head><body><h1 id="details">Details</h1><p>Back to <a href="intro.html">intro</a>. Download <a href="../files/guide.pdf">guide</a>.</p></body></html>`),
  ],
  ["/images/logo.png", encode("PNG")],
  ["/files/guide.pdf", encode("%PDF")],
]);

describe("convertBundle", () => {
  it("converts html topics with metadata, links, and assets", () => {
    const project = convertBundle({
      bundle: syntheticBundle,
      files: syntheticFiles,
      lint: false,
    });

    expect(project.siteMeta.title).toBe("Sample Help");
    expect(project.pages).toHaveLength(2);
    expect(project.assets).toHaveLength(1);
    expect(project.downloads).toHaveLength(1);
    expect(project.nav[0]?.text).toBe("Introduction");
    expect(project.index[0]?.keyword).toBe("overview");

    const intro = project.pages.find((page) => page.route === "topics/intro");
    expect(intro?.body).toContain("title: \"Introduction\"");
    expect(intro?.body).toContain("sourcePath: \"/topics/intro.html\"");
    expect(intro?.body).toContain("/topics/details");
    expect(intro?.body).toContain("/assets/images/logo.png");
    expect(intro?.body).toContain("| Name | Value |");
    expect(intro?.body).not.toContain("css:");
    expect(intro?.body).not.toContain("<!-- legacy init -->");
    expect(intro?.body).not.toContain("window.__CHM");
  });
});
