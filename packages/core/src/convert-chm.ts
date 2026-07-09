import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractChm } from "@chm-md/extract";
import type {
  ConvertRunSummary,
  IndexSource,
  PhaseTiming,
  PipelinePhase,
  ProgressHandler,
  TocSource,
  WarningSummary,
} from "@chm-md/shared";
import { countErrors, summarizeWarnings } from "@chm-md/shared";
import { convertBundle, writeProject } from "./convert.js";
import {
  computeConvertCache,
  isConvertCacheHit,
  writeConvertCache,
} from "./convert-cache.js";
import type { TableChromeMode } from "./tables.js";

export interface ConvertChmOptions {
  sourcePath: string;
  outputDir: string;
  lint?: boolean;
  lintConfigPath?: string;
  lintFix?: boolean;
  tableChrome?: TableChromeMode;
  /** Force reconvert even when convert-cache.json matches. */
  force?: boolean;
  onProgress?: ProgressHandler;
  onPhaseStart?: (phase: PipelinePhase) => void;
  onPhaseEnd?: (phase: PipelinePhase, durationMs: number) => void;
  preferBinaryToc?: boolean;
  preferBinaryIndex?: boolean;
}

function countTreeNodes<T extends { children: T[] }>(nodes: T[]): number {
  return nodes.reduce((total, node) => total + 1 + countTreeNodes(node.children), 0);
}

function countNavLikeNodes(nodes: Array<{ children?: unknown[] }>): number {
  return nodes.reduce((total, node) => {
    const children = Array.isArray(node.children)
      ? (node.children as Array<{ children?: unknown[] }>)
      : [];
    return total + 1 + countNavLikeNodes(children);
  }, 0);
}

interface CachedProjectManifest {
  siteMeta?: { title?: string };
  pageCount?: number;
  assetCount?: number;
  downloadCount?: number;
  warningCount?: number;
  tocSource?: TocSource;
  indexSource?: IndexSource;
  extractWarningCount?: number;
}

async function loadCachedConvertSummary(
  options: ConvertChmOptions,
  convertHash: string,
  durationMs: number,
): Promise<ConvertRunSummary> {
  const emptyWarnings: WarningSummary = { byCode: {}, total: 0 };
  let pageCount = 0;
  let assetCount = 0;
  let downloadCount = 0;
  let warningTotal = 0;
  let tocSource: TocSource = "none";
  let indexSource: IndexSource = "none";
  let extractWarningCount = 0;
  let tocNodeCount = 0;
  let indexNodeCount = 0;

  try {
    const manifestRaw = await readFile(join(options.outputDir, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw) as CachedProjectManifest;
    pageCount = manifest.pageCount ?? 0;
    assetCount = manifest.assetCount ?? 0;
    downloadCount = manifest.downloadCount ?? 0;
    warningTotal = manifest.warningCount ?? 0;
    tocSource = manifest.tocSource ?? "none";
    indexSource = manifest.indexSource ?? "none";
    extractWarningCount = manifest.extractWarningCount ?? 0;
  } catch {
    // Fall through with zeros when manifest is incomplete.
  }

  try {
    const nav = JSON.parse(await readFile(join(options.outputDir, "nav.json"), "utf8")) as Array<{
      children?: unknown[];
    }>;
    tocNodeCount = countNavLikeNodes(nav);
  } catch {
    // Optional.
  }

  try {
    const index = JSON.parse(await readFile(join(options.outputDir, "index.json"), "utf8")) as unknown[];
    indexNodeCount = index.length;
  } catch {
    // Optional.
  }

  return {
    sourcePath: options.sourcePath,
    outputDir: options.outputDir,
    durationMs,
    timings: [],
    entryCount: 0,
    pageCount,
    assetCount,
    downloadCount,
    tocSource,
    indexSource,
    tocNodeCount,
    indexNodeCount,
    warnings: warningTotal > 0 ? { byCode: {}, total: warningTotal } : emptyWarnings,
    extractWarnings:
      extractWarningCount > 0 ? { byCode: {}, total: extractWarningCount } : emptyWarnings,
    errorCount: 0,
    cacheHit: true,
    convertHash,
  };
}

/** Extract a CHM file and convert it to a MarkdownProject on disk. */
export async function convertChm(options: ConvertChmOptions): Promise<ConvertRunSummary> {
  const startedAt = Date.now();
  const timings: PhaseTiming[] = [];
  const tableChrome = options.tableChrome ?? "strip";
  const lint = options.lint !== false;
  const lintFix = options.lintFix === true;
  const preferBinaryToc = options.preferBinaryToc === true;
  const preferBinaryIndex = options.preferBinaryIndex === true;

  const { hash, fingerprint } = await computeConvertCache({
    sourcePath: options.sourcePath,
    lint,
    lintFix,
    tableChrome,
    preferBinaryToc,
    preferBinaryIndex,
    lintConfigPath: options.lintConfigPath,
  });

  if (!options.force && (await isConvertCacheHit(options.outputDir, hash))) {
    return loadCachedConvertSummary(options, hash, Date.now() - startedAt);
  }

  const extractStartedAt = Date.now();
  options.onPhaseStart?.("extract");
  const { bundle, files } = await extractChm({
    sourcePath: options.sourcePath,
    preferBinaryToc,
    preferBinaryIndex,
    onProgress: options.onProgress,
  });
  const extractDurationMs = Date.now() - extractStartedAt;
  timings.push({ phase: "extract", durationMs: extractDurationMs });
  options.onPhaseEnd?.("extract", extractDurationMs);

  const convertStartedAt = Date.now();
  options.onPhaseStart?.("convert");
  const project = convertBundle({
    bundle,
    files,
    lint,
    lintConfigPath: options.lintConfigPath,
    lintFix,
    tableChrome,
    onProgress: options.onProgress,
  });
  const convertDurationMs = Date.now() - convertStartedAt;
  timings.push({ phase: "convert", durationMs: convertDurationMs });
  options.onPhaseEnd?.("convert", convertDurationMs);

  const writeStartedAt = Date.now();
  options.onPhaseStart?.("write");
  await writeProject({ project, files, outputDir: options.outputDir, bundle });
  await writeConvertCache(options.outputDir, { hash, fingerprint });
  const writeDurationMs = Date.now() - writeStartedAt;
  timings.push({ phase: "write", durationMs: writeDurationMs });
  options.onPhaseEnd?.("write", writeDurationMs);

  const allWarnings = [...bundle.extractWarnings, ...project.warnings];

  return {
    sourcePath: options.sourcePath,
    outputDir: options.outputDir,
    durationMs: Date.now() - startedAt,
    timings,
    entryCount: bundle.entries.length,
    pageCount: project.pages.length,
    assetCount: project.assets.length,
    downloadCount: project.downloads.length,
    tocSource: bundle.tocSource,
    indexSource: bundle.indexSource,
    tocNodeCount: countTreeNodes(bundle.toc),
    indexNodeCount: bundle.index.length,
    warnings: summarizeWarnings(allWarnings),
    extractWarnings: summarizeWarnings(bundle.extractWarnings),
    errorCount: countErrors(allWarnings),
    cacheHit: false,
    convertHash: hash,
  };
}
