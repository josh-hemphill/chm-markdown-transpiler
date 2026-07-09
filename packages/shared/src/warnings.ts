import type { ConversionWarning, WarningSummary } from "./types.js";

/** Aggregate conversion warnings by code. */
export function summarizeWarnings(warnings: ConversionWarning[]): WarningSummary {
  const byCode: Record<string, number> = {};
  for (const warning of warnings) {
    byCode[warning.code] = (byCode[warning.code] ?? 0) + 1;
  }
  return { byCode, total: warnings.length };
}

/** Count errors (missing-* warning codes). */
export function countErrors(warnings: ConversionWarning[]): number {
  return warnings.filter((warning) => warning.code.startsWith("missing-")).length;
}

/** Format top warning codes as a compact string. */
export function formatTopWarningCodes(summary: WarningSummary, limit = 3): string {
  const entries = Object.entries(summary.byCode)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([code, count]) => `${code}=${count}`).join(", ");
}

/** Filter warnings by code prefix. */
export function filterWarningsByCode(
  warnings: ConversionWarning[],
  codePrefix?: string,
): ConversionWarning[] {
  if (!codePrefix) {
    return warnings;
  }
  return warnings.filter((warning) => warning.code.startsWith(codePrefix));
}
