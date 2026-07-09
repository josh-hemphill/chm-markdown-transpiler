import { writeFile } from "node:fs/promises";
import type { ConvertRunSummary, DocsWorkspace, EmitRunSummary } from "@chm-md/shared";
import type { LintProjectSummary } from "@chm-md/core";
import { formatTopWarningCodes } from "@chm-md/shared";
import type { CliLogger } from "./logger.js";
import { formatDurationMs } from "./logger.js";

/** Print a convert run summary to the CLI logger. */
export function printConvertSummary(logger: CliLogger, summary: ConvertRunSummary): void {
  const basename = summary.sourcePath.replace(/\\/g, "/").split("/").pop() ?? summary.sourcePath;
  if (summary.cacheHit) {
    logger.info(
      `Reused cached convert for ${basename} -> ${summary.outputDir} (${formatDurationMs(summary.durationMs)})`,
    );
  } else {
    logger.info(
      `Converted ${basename} -> ${summary.outputDir} (${formatDurationMs(summary.durationMs)})`,
    );
  }
  logger.info(
    `  entries: ${summary.entryCount}  pages: ${summary.pageCount}  assets: ${summary.assetCount}  downloads: ${summary.downloadCount}`,
  );
  logger.verbose(
    `  toc: ${summary.tocSource} (${summary.tocNodeCount} nodes)  index: ${summary.indexSource} (${summary.indexNodeCount} roots)`,
  );
  if (summary.convertHash) {
    logger.verbose(`  convert-hash: ${summary.convertHash.slice(0, 12)}…`);
  }
  logger.info(
    `  warnings: ${summary.warnings.total}  top: ${formatTopWarningCodes(summary.warnings)}`,
  );
  if (summary.extractWarnings.total > 0) {
    logger.verbose(
      `  extract warnings: ${summary.extractWarnings.total}  top: ${formatTopWarningCodes(summary.extractWarnings)}`,
    );
  }
  for (const timing of summary.timings) {
    logger.verbose(`  ${timing.phase}: ${formatDurationMs(timing.durationMs)}`);
  }
}

/** Print an emit run summary to the CLI logger. */
export function printEmitSummary(logger: CliLogger, summary: EmitRunSummary): void {
  logger.info(
    `Emitted ${summary.emitter} site -> ${summary.outputDir} (${formatDurationMs(summary.durationMs)})`,
  );
  const collections =
    summary.collectionCount !== undefined ? `  collections: ${summary.collectionCount}  ` : "  ";
  logger.info(`${collections}pages: ${summary.pageCount}  nav nodes: ${summary.navNodeCount}`);
}

/** Write a JSON run report to disk. */
export async function writeRunReport(
  path: string,
  report: ConvertRunSummary | EmitRunSummary | LintProjectSummary | DocsWorkspace,
): Promise<void> {
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
