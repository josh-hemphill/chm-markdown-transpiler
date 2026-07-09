import { describe, expect, it } from "vitest";
import { buildStyleProfile, defaultLintConfig } from "./style-profile.js";
import { postProcessMarkdown } from "./heading-ids.js";

describe("buildStyleProfile", () => {
  it("enables tab expansion when MD010 is on", () => {
    const profile = buildStyleProfile({ ...defaultLintConfig(), MD010: true });
    expect(profile.expandTabs).toBe(true);
  });

  it("disables tab expansion when MD010 is off", () => {
    const profile = buildStyleProfile({ ...defaultLintConfig(), MD010: false });
    expect(profile.expandTabs).toBe(false);
  });

  it("demotes duplicate H1 when MD025 is enabled", () => {
    const profile = buildStyleProfile(defaultLintConfig());
    const output = postProcessMarkdown("# Title\n\nBody", profile, {
      title: "Title",
      demoteH1: true,
    });
    expect(output).toMatch(/^## Title/m);
  });
});
