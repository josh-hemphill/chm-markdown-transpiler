import { describe, expect, it } from "vitest";
import { defaultLintConfig, lintMarkdown } from "./lint.js";

describe("lintMarkdown", () => {
  it("reports violations with default config", () => {
    const result = lintMarkdown({
      markdown: "# Title\n\n# Another Title\n",
      sourcePath: "/test.html",
      config: defaultLintConfig(),
    });
    expect(result.warnings.some((warning) => warning.code === "markdownlint-MD025")).toBe(true);
  });

  it("respects custom config that disables a rule", () => {
    const result = lintMarkdown({
      markdown: "# Title\n\n# Another Title\n",
      config: { ...defaultLintConfig(), MD025: false },
    });
    expect(result.warnings.some((warning) => warning.code === "markdownlint-MD025")).toBe(false);
  });

  it("ignores MD001 by default", () => {
    const result = lintMarkdown({
      markdown: "# Title\n\n### Skipped level\n",
      config: defaultLintConfig(),
    });
    expect(result.warnings.some((warning) => warning.code === "markdownlint-MD001")).toBe(false);
  });

  it("applies autofix for trailing spaces", () => {
    const result = lintMarkdown({
      markdown: "line with spaces   \n",
      config: defaultLintConfig(),
      fix: true,
    });
    expect(result.fixed).toBe(true);
    expect(result.markdown).not.toMatch(/ +$/m);
  });
});
