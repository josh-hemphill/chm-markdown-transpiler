import { describe, expect, it } from "vitest";
import {
  chmTopicToRoute,
  classifyChmPath,
  normalizeChmPath,
  resolveChmHref,
  routeToMarkdownPath,
} from "./paths.js";

describe("normalizeChmPath", () => {
  it("normalizes backslashes and leading slashes", () => {
    expect(normalizeChmPath("\\topics\\intro.html")).toBe("/topics/intro.html");
    expect(normalizeChmPath("topics/intro.html")).toBe("/topics/intro.html");
  });
});

describe("classifyChmPath", () => {
  it("classifies common CHM entry kinds", () => {
    expect(classifyChmPath("/index.html", false)).toBe("html");
    expect(classifyChmPath("/styles/help.css", false)).toBe("css");
    expect(classifyChmPath("/images/logo.png", false)).toBe("image");
    expect(classifyChmPath("/files/manual.pdf", false)).toBe("download");
    expect(classifyChmPath("/toc.hhc", false)).toBe("meta");
    expect(classifyChmPath("/index.hhk", false)).toBe("meta");
    expect(classifyChmPath("/::DataSpace/Storage/MSCompressed/Content", false)).toBe("meta");
    expect(classifyChmPath("/topics/", true)).toBe("directory");
  });
});

describe("chmTopicToRoute", () => {
  it("maps html topics to markdown routes", () => {
    expect(chmTopicToRoute("/index.html")).toBe("index");
    expect(chmTopicToRoute("/topics/getting-started.html")).toBe("topics/getting-started");
    expect(routeToMarkdownPath("topics/getting-started")).toBe("pages/topics/getting-started.md");
  });
});

describe("resolveChmHref", () => {
  it("resolves relative topic links", () => {
    expect(resolveChmHref("/topics/a.html", "../images/logo.png")).toBe("/images/logo.png");
    expect(resolveChmHref("/topics/a.html", "b.html#section")).toBe("/topics/b.html#section");
  });
});
