import { describe, expect, it } from "vitest";
import type { ConversionWarning } from "./types.js";
import {
  countErrors,
  filterWarningsByCode,
  formatTopWarningCodes,
  summarizeWarnings,
} from "./warnings.js";

const sampleWarnings: ConversionWarning[] = [
  { code: "layout-table", message: "a" },
  { code: "layout-table", message: "b" },
  { code: "missing-asset", message: "c" },
];

describe("summarizeWarnings", () => {
  it("groups warnings by code", () => {
    const summary = summarizeWarnings(sampleWarnings);
    expect(summary.total).toBe(3);
    expect(summary.byCode["layout-table"]).toBe(2);
    expect(summary.byCode["missing-asset"]).toBe(1);
  });

  it("filters by code prefix", () => {
    expect(filterWarningsByCode(sampleWarnings, "layout").length).toBe(2);
    expect(countErrors(sampleWarnings)).toBe(1);
    expect(formatTopWarningCodes(summarizeWarnings(sampleWarnings))).toContain("layout-table=2");
  });
});
