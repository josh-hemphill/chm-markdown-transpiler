import type { LintProjectSummary } from "@chm-md/core";
import { formatTopWarningCodes } from "@chm-md/shared";
import type { CliLogger } from "./logger.js";
import { formatDurationMs } from "./logger.js";

/** Print a lint project summary to the CLI logger. */
export function printLintSummary(logger: CliLogger, summary: LintProjectSummary): void {
  logger.info(
    `Linted ${summary.projectDir} (${formatDurationMs(summary.durationMs)})`,
  );
  logger.info(`  pages: ${summary.pageCount}  fixed: ${summary.fixedCount}`);
  logger.info(
    `  markdownlint warnings: ${summary.warnings.total}  top: ${formatTopWarningCodes(summary.warnings)}`,
  );
}
