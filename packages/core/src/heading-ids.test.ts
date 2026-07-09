import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { assignHeadingIds, postProcessMarkdown, slugifyHeading } from "./heading-ids.js";
import { defaultStyleProfile } from "./style-profile.js";

describe("assignHeadingIds", () => {
  it("preserves unique original ids", () => {
    const { document } = parseHTML(
      "<html><body><h2 id=\"details\">Details</h2></body></html>",
    );
    const { assignments } = assignHeadingIds(document);
    expect(assignments[0]?.id).toBe("details");
    expect(assignments[0]?.originalId).toBe("details");
  });

  it("suffixes duplicate heading ids", () => {
    const { document } = parseHTML(
      "<html><body><h2>Details</h2><h2>Details</h2></body></html>",
    );
    const { assignments } = assignHeadingIds(document);
    expect(assignments[0]?.id).toBe("details");
    expect(assignments[1]?.id).toBe("details-2");
  });

  it("rewrites same-page fragment links", () => {
    const { document } = parseHTML(
      "<html><body><h2 id=\"old\">Details</h2><a href=\"#old\">link</a></body></html>",
    );
    assignHeadingIds(document);
    const anchor = document.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("#old");
  });
});

describe("slugifyHeading", () => {
  it("slugifies punctuation", () => {
    expect(slugifyHeading("Hello, World!")).toBe("hello-world");
  });
});

describe("postProcessMarkdown", () => {
  it("ensures final newline when enabled", () => {
    const profile = defaultStyleProfile();
    const output = postProcessMarkdown("line", profile);
    expect(output.endsWith("\n")).toBe(true);
  });

  it("expands tabs when enabled", () => {
    const profile = { ...defaultStyleProfile(), expandTabs: true, tabWidth: 2 };
    expect(postProcessMarkdown("a\tb", profile)).toBe("a  b\n");
  });
});
