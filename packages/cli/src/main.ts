#!/usr/bin/env node
import { Command } from "commander";
import {
  convertChm,
  convertWorkspace,
  isMarkdownProjectDir,
  lintProject,
  resolveWorkspace,
  resolveWorkspaceManifestPath,
} from "@chm-md/core";
import { emitVitePress, emitVitePressWorkspace } from "@chm-md/emit-vitepress";
import type { PipelinePhase, ProgressEvent } from "@chm-md/shared";
import {
  formatDoctorReport,
  formatDoctorSummary,
  runDoctor,
} from "./doctor.js";
import { createCliLogger, formatDurationMs, resolveLogLevel } from "./logger.js";
import { printConvertSummary, printEmitSummary, writeRunReport } from "./reporting.js";
import { printLintSummary } from "./lint-reporting.js";

interface GlobalOptions {
  verbose?: boolean;
  debug?: boolean;
  quiet?: boolean;
}

interface ConvertLikeOptions {
  lint: boolean;
  markdownlintConfig?: string;
  fix?: boolean;
  tableChrome: string;
  force?: boolean;
  preferBinaryToc?: boolean;
  preferBinaryIndex?: boolean;
}

function parseTableChrome(
  logger: ReturnType<typeof createCliLogger>,
  value: string,
): "strip" | "preserve" | "flatten" | null {
  if (!["strip", "preserve", "flatten"].includes(value)) {
    logger.error(`Invalid --table-chrome mode: ${value}`);
    return null;
  }
  return value as "strip" | "preserve" | "flatten";
}

function buildConvertOptions(
  options: ConvertLikeOptions,
  onProgress?: (event: ProgressEvent) => void,
  logger?: ReturnType<typeof createCliLogger>,
) {
  const tableChrome = parseTableChrome(logger ?? createCliLogger({ level: "quiet" }), options.tableChrome);
  if (!tableChrome) {
    return null;
  }
  return {
    lint: options.lint,
    lintConfigPath: options.markdownlintConfig,
    lintFix: options.fix,
    tableChrome,
    force: options.force === true,
    preferBinaryToc: options.preferBinaryToc === true,
    preferBinaryIndex: options.preferBinaryIndex === true,
    onProgress,
    onPhaseStart: logger ? (phase: PipelinePhase) => logger.phaseStart(phase) : undefined,
    onPhaseEnd: logger
      ? (phase: PipelinePhase, durationMs: number) =>
          logger.phaseEnd(phase, formatDurationMs(durationMs))
      : undefined,
  };
}

const program = new Command();

program
  .name("chm-md")
  .description("Convert CHM archives to markdown projects and static sites")
  .version("0.1.0")
  .option("-v, --verbose", "Verbose output")
  .option("-d, --debug", "Debug output (implies --verbose)")
  .option("-q, --quiet", "Errors only")
  .hook("preAction", (thisCommand) => {
    const root = thisCommand.parent ?? thisCommand;
    const globals = root.opts<GlobalOptions>();
    if (globals.debug) {
      globals.verbose = true;
    }
  });

program
  .command("convert")
  .description("Convert a CHM file to a MarkdownProject directory")
  .argument("<chm>", "Path to the .chm file")
  .requiredOption("-o, --output <dir>", "Output project directory")
  .option("--no-lint", "Skip markdownlint post-pass")
  .option("--markdownlint-config <file>", "Markdownlint config file (JSON or YAML)")
  .option("--fix", "Apply markdownlint autofixes")
  .option("--table-chrome <mode>", "Chrome table policy: strip, preserve, or flatten", "strip")
  .option("--force", "Force reconvert even when convert-cache.json matches")
  .option("--prefer-binary-toc", "Prefer binary TOC over text .hhc when available")
  .option("--prefer-binary-index", "Prefer binary keyword index over text .hhk when available")
  .option("--report <file>", "Write JSON run summary to file")
  .action(async (chm: string, options: { output: string; lint: boolean; markdownlintConfig?: string; fix?: boolean; tableChrome: string; force?: boolean; preferBinaryToc?: boolean; preferBinaryIndex?: boolean; report?: string }, command) => {
    const globals = (command.parent ?? command).opts() as GlobalOptions;
    const logger = createCliLogger({ level: resolveLogLevel(globals) });
    const onProgress =
      globals.debug === true
        ? (event: ProgressEvent) => {
            const progress =
              event.current !== undefined && event.total !== undefined
                ? ` (${event.current}/${event.total})`
                : "";
            logger.debug(`[${event.phase}] ${event.message}${progress}`);
          }
        : undefined;

    try {
      const tableChrome = options.tableChrome as "strip" | "preserve" | "flatten";
      if (!["strip", "preserve", "flatten"].includes(tableChrome)) {
        logger.error(`Invalid --table-chrome mode: ${options.tableChrome}`);
        process.exitCode = 1;
        return;
      }

      const summary = await convertChm({
        sourcePath: chm,
        outputDir: options.output,
        lint: options.lint,
        lintConfigPath: options.markdownlintConfig,
        lintFix: options.fix,
        tableChrome,
        force: options.force === true,
        preferBinaryToc: options.preferBinaryToc === true,
        preferBinaryIndex: options.preferBinaryIndex === true,
        onProgress,
        onPhaseStart: (phase) => logger.phaseStart(phase),
        onPhaseEnd: (phase, durationMs) => logger.phaseEnd(phase, formatDurationMs(durationMs)),
      });

      printConvertSummary(logger, summary);

      if (options.report) {
        await writeRunReport(options.report, summary);
        logger.verbose(`Wrote run report -> ${options.report}`);
      }

      if (summary.errorCount > 0) {
        process.exitCode = 1;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`convert failed: ${message}`, error);
      process.exitCode = 1;
    }
  });

program
  .command("convert-workspace")
  .description("Convert CHM entries in a workspace manifest to MarkdownProject staging dirs")
  .argument("<workspace>", "Path to docs-workspace.json or directory containing it")
  .requiredOption("-o, --output <dir>", "Staging directory for converted projects")
  .option("--no-lint", "Skip markdownlint post-pass")
  .option("--markdownlint-config <file>", "Markdownlint config file (JSON or YAML)")
  .option("--fix", "Apply markdownlint autofixes")
  .option("--table-chrome <mode>", "Chrome table policy: strip, preserve, or flatten", "strip")
  .option("--force", "Force reconvert even when convert-cache.json matches")
  .option("--prefer-binary-toc", "Prefer binary TOC over text .hhc when available")
  .option("--prefer-binary-index", "Prefer binary keyword index over text .hhk when available")
  .option("--report <file>", "Write JSON workspace manifest summary to file")
  .action(async (workspace: string, options: ConvertLikeOptions & { output: string; report?: string }, command) => {
    const globals = (command.parent ?? command).opts() as GlobalOptions;
    const logger = createCliLogger({ level: resolveLogLevel(globals) });
    const onProgress =
      globals.debug === true
        ? (event: ProgressEvent) => {
            const progress =
              event.current !== undefined && event.total !== undefined
                ? ` (${event.current}/${event.total})`
                : "";
            logger.debug(`[${event.phase}] ${event.message}${progress}`);
          }
        : undefined;

    const manifestPath = resolveWorkspaceManifestPath(workspace);
    if (!manifestPath) {
      logger.error(`Workspace manifest not found for target: ${workspace}`);
      process.exitCode = 1;
      return;
    }

    const convertOptions = buildConvertOptions(options, onProgress, logger);
    if (!convertOptions) {
      process.exitCode = 1;
      return;
    }

    try {
      logger.phaseStart("convert");
      const startedAt = Date.now();
      const manifest = await convertWorkspace(manifestPath, options.output, convertOptions);
      logger.phaseEnd("convert", formatDurationMs(Date.now() - startedAt));
      logger.info(`Converted workspace CHM entries -> ${options.output}`);
      logger.info(`  collections: ${manifest.collections.length}`);

      if (options.report) {
        await writeRunReport(options.report, manifest);
        logger.verbose(`Wrote workspace report -> ${options.report}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`convert-workspace failed: ${message}`, error);
      process.exitCode = 1;
    }
  });

program
  .command("emit")
  .description("Emit a static site from a MarkdownProject directory or workspace manifest")
  .argument("<emitter>", "Emitter name (vitepress)")
  .argument("[target]", "MarkdownProject directory, workspace JSON, or directory containing docs-workspace.json")
  .requiredOption("-o, --output <dir>", "Output site directory")
  .option("--workspace <file>", "Workspace manifest path (alternative to positional target)")
  .option("--no-lint", "Skip markdownlint when converting CHM workspace entries")
  .option("--markdownlint-config <file>", "Markdownlint config for CHM workspace entries")
  .option("--fix", "Apply markdownlint autofixes for CHM workspace entries")
  .option("--table-chrome <mode>", "Chrome table policy for CHM workspace entries", "strip")
  .option("--force", "Force reconvert of CHM workspace entries even when convert-cache.json matches")
  .option("--prefer-binary-toc", "Prefer binary TOC over text .hhc for CHM workspace entries")
  .option("--prefer-binary-index", "Prefer binary keyword index over text .hhk for CHM workspace entries")
  .option("--report <file>", "Write JSON run summary to file")
  .action(async (
    emitter: string,
    target: string | undefined,
    options: ConvertLikeOptions & { output: string; workspace?: string; report?: string },
    command,
  ) => {
    const globals = (command.parent ?? command).opts() as GlobalOptions;
    const logger = createCliLogger({ level: resolveLogLevel(globals) });

    if (emitter !== "vitepress") {
      logger.error(`Unsupported emitter: ${emitter}`);
      process.exitCode = 1;
      return;
    }

    const emitTarget = options.workspace ?? target;
    if (!emitTarget) {
      logger.error("Emit target required: pass a project directory or workspace manifest");
      process.exitCode = 1;
      return;
    }

    try {
      logger.phaseStart("emit");
      const workspacePath = resolveWorkspaceManifestPath(emitTarget);
      if (workspacePath) {
        const onProgress =
          globals.debug === true
            ? (event: ProgressEvent) => {
                const progress =
                  event.current !== undefined && event.total !== undefined
                    ? ` (${event.current}/${event.total})`
                    : "";
                logger.debug(`[${event.phase}] ${event.message}${progress}`);
              }
            : undefined;
        const convertOptions = buildConvertOptions(options, onProgress, logger);
        if (!convertOptions) {
          process.exitCode = 1;
          return;
        }

        const resolved = await resolveWorkspace({
          manifestPath: workspacePath,
          ...convertOptions,
        });
        const summary = await emitVitePressWorkspace({
          workspace: resolved,
          outputDir: options.output,
          workspaceManifestPath: workspacePath,
          onWarning: (warning) => logger.verbose(`${warning.code}: ${warning.message}`),
        });
        logger.phaseEnd("emit", formatDurationMs(summary.durationMs));
        printEmitSummary(logger, summary);
        if (options.report) {
          await writeRunReport(options.report, summary);
          logger.verbose(`Wrote run report -> ${options.report}`);
        }
        return;
      }

      if (!isMarkdownProjectDir(emitTarget)) {
        logger.error(`Target is neither a MarkdownProject nor a workspace manifest: ${emitTarget}`);
        process.exitCode = 1;
        return;
      }

      const summary = await emitVitePress({
        projectDir: emitTarget,
        outputDir: options.output,
        onWarning: (warning) => logger.verbose(`${warning.code}: ${warning.message}`),
      });
      logger.phaseEnd("emit", formatDurationMs(summary.durationMs));
      printEmitSummary(logger, summary);

      if (options.report) {
        await writeRunReport(options.report, summary);
        logger.verbose(`Wrote run report -> ${options.report}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`emit failed: ${message}`, error);
      process.exitCode = 1;
    }
  });

program
  .command("doctor")
  .description("Report fidelity warnings for a CHM file, project directory, or workspace manifest")
  .argument("<target>", "Path to .chm, MarkdownProject directory, or docs-workspace.json")
  .option("--json", "Output JSON report")
  .option("--summary", "One-line summary output")
  .option("--code <prefix>", "Filter warnings by code prefix")
  .option("--limit <n>", "Cap listed warnings (0 = all)", "20")
  .option("--group-by-code", "Group warnings by code with counts")
  .action(
    async (
      target: string,
      options: {
        json?: boolean;
        summary?: boolean;
        code?: string;
        limit?: string;
        groupByCode?: boolean;
      },
      command,
    ) => {
      const globals = (command.parent ?? command).opts() as GlobalOptions;
      const logger = createCliLogger({ level: resolveLogLevel(globals) });

      try {
        const report = await runDoctor(target);
        const limit = options.limit === undefined ? 20 : Number.parseInt(options.limit, 10);
        const formatOptions = {
          codePrefix: options.code,
          limit: Number.isNaN(limit) ? 20 : limit,
          groupByCode: options.groupByCode,
          verbose: globals.verbose,
        };

        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else if (options.summary) {
          console.log(formatDoctorSummary(report));
        } else {
          console.log(formatDoctorReport(report, formatOptions));
        }

        if (report.summary.errorCount > 0) {
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`doctor failed: ${message}`, error);
        process.exitCode = 1;
      }
    },
  );

program
  .command("lint")
  .description("Re-lint a MarkdownProject directory with optional autofix")
  .argument("<project>", "Path to MarkdownProject directory")
  .option("--markdownlint-config <file>", "Markdownlint config file (JSON or YAML)")
  .option("--fix", "Apply markdownlint autofixes")
  .option("--report <file>", "Write JSON lint summary to file")
  .action(
    async (
      project: string,
      options: { markdownlintConfig?: string; fix?: boolean; report?: string },
      command,
    ) => {
      const globals = (command.parent ?? command).opts() as GlobalOptions;
      const logger = createCliLogger({ level: resolveLogLevel(globals) });

      try {
        const summary = await lintProject({
          projectDir: project,
          configPath: options.markdownlintConfig,
          fix: options.fix,
        });
        printLintSummary(logger, summary);

        if (options.report) {
          await writeRunReport(options.report, summary);
          logger.verbose(`Wrote lint report -> ${options.report}`);
        }

        if (summary.warnings.total > 0) {
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`lint failed: ${message}`, error);
        process.exitCode = 1;
      }
    },
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
