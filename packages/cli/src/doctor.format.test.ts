import { describe, expect, it } from "vitest";
import type { ConversionWarning } from "@chm-md/shared";
import {
  formatDoctorReport,
  formatDoctorSummary,
  formatWarningHistogram,
  selectDoctorWarnings,
  type DoctorReport,
} from "./doctor.js";

const sampleReport: DoctorReport = {
  target: "sample.chm",
  targetType: "chm",
  summary: {
    entryCount: 10,
    pageCount: 5,
    assetCount: 2,
    downloadCount: 0,
    tocSource: "hhc",
    indexSource: "hhk",
    warningCount: 4,
    errorCount: 1,
    warningCodes: {
      "layout-table": 2,
      "missing-asset": 1,
      "note-table": 1,
    },
  },
  warnings: [
    { code: "layout-table", message: "layout a", sourcePath: "/a.html" },
    { code: "layout-table", message: "layout b", sourcePath: "/b.html" },
    { code: "note-table", message: "note", sourcePath: "/c.html" },
    { code: "missing-asset", message: "missing", sourcePath: "/d.html" },
  ],
  errors: [{ code: "missing-asset", message: "missing", sourcePath: "/d.html" }],
};

describe("doctor formatting", () => {
  it("filters warnings by code prefix", () => {
    const filtered = selectDoctorWarnings(sampleReport.warnings, { codePrefix: "layout" });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((warning) => warning.code.startsWith("layout"))).toBe(true);
  });

  it("renders warning histogram sorted by count", () => {
    const histogram = formatWarningHistogram(sampleReport.warnings);
    expect(histogram[0]).toContain("layout-table: 2");
  });

  it("groups warnings by code with one example", () => {
    const text = formatDoctorReport(sampleReport, { groupByCode: true, limit: 0 });
    expect(text).toContain("[layout-table] x2");
    expect(text).toContain("Warning histogram:");
  });

  it("formats one-line summary", () => {
    const summary = formatDoctorSummary(sampleReport);
    expect(summary).toContain("warnings=4");
    expect(summary).toContain("errors=1");
    expect(summary).toContain("layout-table=2");
  });
});
