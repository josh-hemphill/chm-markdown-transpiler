import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { extractChm } from "@chm-md/extract";
import { convertBundle, loadWorkspaceManifest, resolveWorkspaceManifestPath } from "@chm-md/core";
import type { ConversionWarning, IndexSource, TocSource } from "@chm-md/shared";
import {
  countErrors,
  filterWarningsByCode,
  formatTopWarningCodes,
  summarizeWarnings,
} from "@chm-md/shared";

export interface DoctorCollectionReport {
  id: string;
  target: string;
  targetType: "chm" | "project";
  summary: DoctorReport["summary"];
  warnings: ConversionWarning[];
  errors: ConversionWarning[];
}

export interface DoctorReport {
  target: string;
  targetType: "chm" | "project" | "workspace";
  summary: {
    entryCount?: number;
    pageCount?: number;
    assetCount?: number;
    downloadCount?: number;
    collectionCount?: number;
    tocSource?: TocSource;
    indexSource?: IndexSource;
    warningCount: number;
    errorCount: number;
    tableWarnings?: Record<string, number>;
    warningCodes?: Record<string, number>;
  };
  collections?: DoctorCollectionReport[];
  warnings: ConversionWarning[];
  errors: ConversionWarning[];
}

export interface DoctorFormatOptions {
  codePrefix?: string;
  limit?: number;
  groupByCode?: boolean;
  verbose?: boolean;
}

const TABLE_WARNING_CODES = [
  "layout-table-stripped",
  "layout-table-preserved",
  "layout-table",
  "complex-table",
  "note-table",
  "table-html-fallback",
];

const DEFAULT_WARNING_LIMIT = 20;

function summarizeTableWarnings(warnings: ConversionWarning[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const code of TABLE_WARNING_CODES) {
    counts[code] = 0;
  }
  for (const warning of warnings) {
    if (TABLE_WARNING_CODES.includes(warning.code)) {
      counts[warning.code] = (counts[warning.code] ?? 0) + 1;
    }
  }
  return counts;
}

function formatWarningLine(warning: ConversionWarning): string {
  const location = warning.sourcePath ? ` (${warning.sourcePath})` : "";
  return `  - [${warning.code}] ${warning.message}${location}`;
}

function mergeTableWarnings(
  left: Record<string, number>,
  right: Record<string, number>,
): Record<string, number> {
  const merged = { ...left };
  for (const code of TABLE_WARNING_CODES) {
    merged[code] = (merged[code] ?? 0) + (right[code] ?? 0);
  }
  return merged;
}

/** Filter and cap warnings for display. */
export function selectDoctorWarnings(
  warnings: ConversionWarning[],
  options: DoctorFormatOptions = {},
): ConversionWarning[] {
  const filtered = filterWarningsByCode(warnings, options.codePrefix);
  const limit = options.limit ?? DEFAULT_WARNING_LIMIT;
  if (limit === 0) {
    return filtered;
  }
  return filtered.slice(0, limit);
}

/** Build a histogram of all warning codes. */
export function formatWarningHistogram(warnings: ConversionWarning[]): string[] {
  const summary = summarizeWarnings(warnings);
  const entries = Object.entries(summary.byCode).sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) {
    return ["  (none)"];
  }
  return entries.map(([code, count]) => `  ${code}: ${count}`);
}

/** One-line CI-friendly doctor summary. */
export function formatDoctorSummary(report: DoctorReport): string {
  const parts = [
    `target=${report.target}`,
    `type=${report.targetType}`,
    `pages=${report.summary.pageCount ?? "n/a"}`,
    `warnings=${report.summary.warningCount}`,
    `errors=${report.summary.errorCount}`,
    `top=${formatTopWarningCodes(summarizeWarnings(report.warnings))}`,
  ];
  if (report.summary.collectionCount !== undefined) {
    parts.push(`collections=${report.summary.collectionCount}`);
  }
  if (report.summary.tocSource) {
    parts.push(`toc=${report.summary.tocSource}`);
  }
  if (report.summary.indexSource) {
    parts.push(`index=${report.summary.indexSource}`);
  }
  return parts.join(" ");
}

function formatGroupedWarnings(
  warnings: ConversionWarning[],
  options: DoctorFormatOptions,
): string[] {
  const summary = summarizeWarnings(warnings);
  const entries = Object.entries(summary.byCode).sort((left, right) => right[1] - left[1]);
  const lines: string[] = [];

  for (const [code, count] of entries) {
    const examples = warnings.filter((warning) => warning.code === code);
    const example = examples[0];
    if (!example) {
      continue;
    }
    lines.push(`  [${code}] x${count}`);
    lines.push(formatWarningLine(example));
    if (options.verbose && examples.length > 1) {
      for (const extra of examples.slice(1)) {
        lines.push(formatWarningLine(extra));
      }
    }
  }

  return lines;
}

async function doctorChm(chmPath: string): Promise<DoctorReport> {
  const { bundle, files } = await extractChm({ sourcePath: chmPath });
  const project = convertBundle({ bundle, files, lint: true });
  const allWarnings = [...bundle.extractWarnings, ...project.warnings];
  const errors = allWarnings.filter((warning) => warning.code.startsWith("missing-"));
  const warningSummary = summarizeWarnings(allWarnings);

  return {
    target: chmPath,
    targetType: "chm",
    summary: {
      entryCount: bundle.entries.length,
      pageCount: project.pages.length,
      assetCount: project.assets.length,
      downloadCount: project.downloads.length,
      tocSource: bundle.tocSource,
      indexSource: bundle.indexSource,
      warningCount: allWarnings.length,
      errorCount: errors.length,
      tableWarnings: summarizeTableWarnings(project.warnings),
      warningCodes: warningSummary.byCode,
    },
    warnings: allWarnings,
    errors,
  };
}

interface ProjectManifest {
  pageCount: number;
  assetCount: number;
  downloadCount: number;
  warningCount: number;
  tocSource?: TocSource;
  indexSource?: IndexSource;
  layoutWarnings?: Record<string, number>;
}

async function doctorProject(projectDir: string): Promise<DoctorReport> {
  const warningsPath = join(projectDir, "warnings.json");
  const manifestPath = join(projectDir, "manifest.json");
  const warnings = existsSync(warningsPath)
    ? (JSON.parse(await readFile(warningsPath, "utf8")) as ConversionWarning[])
    : [];

  let manifest: ProjectManifest | null = null;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ProjectManifest;
  }

  const errors = warnings.filter((warning) => warning.code.startsWith("missing-"));
  const warningSummary = summarizeWarnings(warnings);

  return {
    target: projectDir,
    targetType: "project",
    summary: {
      pageCount: manifest?.pageCount,
      assetCount: manifest?.assetCount,
      downloadCount: manifest?.downloadCount,
      tocSource: manifest?.tocSource,
      indexSource: manifest?.indexSource,
      warningCount: warnings.length,
      errorCount: countErrors(warnings),
      tableWarnings: manifest?.layoutWarnings ?? summarizeTableWarnings(warnings),
      warningCodes: warningSummary.byCode,
    },
    warnings,
    errors,
  };
}

async function doctorWorkspace(manifestPath: string): Promise<DoctorReport> {
  const manifest = await loadWorkspaceManifest(manifestPath);
  const collectionReports: DoctorCollectionReport[] = [];

  for (const entry of manifest.collections) {
    const sourcePath = isAbsolute(entry.source)
      ? entry.source
      : resolve(dirname(manifestPath), entry.source);
    const isChm = entry.kind === "chm" || entry.source.toLowerCase().endsWith(".chm");
    const report = isChm ? await doctorChm(sourcePath) : await doctorProject(sourcePath);

    collectionReports.push({
      id: entry.id,
      target: report.target,
      targetType: report.targetType as "chm" | "project",
      summary: report.summary,
      warnings: report.warnings,
      errors: report.errors,
    });
  }

  const warnings = collectionReports.flatMap((report) => report.warnings);
  const errors = collectionReports.flatMap((report) => report.errors);
  const warningSummary = summarizeWarnings(warnings);

  let tableWarnings = summarizeTableWarnings(warnings);
  let pageCount = 0;
  let assetCount = 0;
  let downloadCount = 0;

  for (const report of collectionReports) {
    pageCount += report.summary.pageCount ?? 0;
    assetCount += report.summary.assetCount ?? 0;
    downloadCount += report.summary.downloadCount ?? 0;
    if (report.summary.tableWarnings) {
      tableWarnings = mergeTableWarnings(tableWarnings, report.summary.tableWarnings);
    }
  }

  return {
    target: manifestPath,
    targetType: "workspace",
    summary: {
      collectionCount: collectionReports.length,
      pageCount,
      assetCount,
      downloadCount,
      warningCount: warnings.length,
      errorCount: errors.length,
      tableWarnings,
      warningCodes: warningSummary.byCode,
    },
    collections: collectionReports,
    warnings,
    errors,
  };
}

/** Produce a fidelity report for a CHM file, project directory, or workspace manifest. */
export async function runDoctor(target: string): Promise<DoctorReport> {
  const workspacePath = resolveWorkspaceManifestPath(target);
  if (workspacePath) {
    return doctorWorkspace(workspacePath);
  }
  if (target.toLowerCase().endsWith(".chm")) {
    return doctorChm(target);
  }
  return doctorProject(target);
}

export function formatDoctorReport(
  report: DoctorReport,
  options: DoctorFormatOptions = {},
): string {
  const lines = [
    `Doctor report for ${report.target} (${report.targetType})`,
    `  entries: ${report.summary.entryCount ?? "n/a"}`,
    `  pages: ${report.summary.pageCount ?? "n/a"}`,
    `  assets: ${report.summary.assetCount ?? "n/a"}`,
    `  downloads: ${report.summary.downloadCount ?? "n/a"}`,
    `  collections: ${report.summary.collectionCount ?? "n/a"}`,
    `  tocSource: ${report.summary.tocSource ?? "n/a"}`,
    `  indexSource: ${report.summary.indexSource ?? "n/a"}`,
    `  warnings: ${report.summary.warningCount}`,
    `  errors: ${report.summary.errorCount}`,
  ];

  if (report.summary.tableWarnings) {
    const tableSummary = Object.entries(report.summary.tableWarnings)
      .filter(([, count]) => count > 0)
      .map(([code, count]) => `${code}=${count}`)
      .join(", ");
    lines.push(`  tableWarnings: ${tableSummary.length > 0 ? tableSummary : "none"}`);
  }

  if (report.collections && report.collections.length > 0) {
    lines.push("", "Collections:");
    for (const collection of report.collections) {
      lines.push(
        `  - ${collection.id}: warnings=${collection.summary.warningCount} errors=${collection.summary.errorCount} pages=${collection.summary.pageCount ?? "n/a"}`,
      );
    }
  }

  lines.push("", "Warning histogram:");
  lines.push(...formatWarningHistogram(report.warnings));

  const nonErrorWarnings = report.warnings.filter(
    (warning) => !warning.code.startsWith("missing-"),
  );
  const displayErrors = selectDoctorWarnings(report.errors, options);
  const displayWarnings = selectDoctorWarnings(nonErrorWarnings, options);

  if (report.errors.length > 0) {
    lines.push("", "Errors:");
    if (options.groupByCode) {
      lines.push(...formatGroupedWarnings(report.errors, options));
    } else {
      for (const error of displayErrors) {
        lines.push(formatWarningLine(error));
      }
      const errorLimit = options.limit ?? DEFAULT_WARNING_LIMIT;
      if (errorLimit !== 0 && report.errors.length > displayErrors.length) {
        lines.push(`  ... and ${report.errors.length - displayErrors.length} more`);
      }
    }
  }

  if (nonErrorWarnings.length > 0) {
    lines.push("", "Warnings:");
    if (options.groupByCode) {
      lines.push(...formatGroupedWarnings(nonErrorWarnings, options));
    } else {
      for (const warning of displayWarnings) {
        lines.push(formatWarningLine(warning));
      }
      const warningLimit = options.limit ?? DEFAULT_WARNING_LIMIT;
      if (warningLimit !== 0 && nonErrorWarnings.length > displayWarnings.length) {
        lines.push(`  ... and ${nonErrorWarnings.length - displayWarnings.length} more`);
      }
    }
  }

  return lines.join("\n");
}
