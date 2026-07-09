import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ChmEnumerateFlags, ChmFile } from "chmlib-ts";
import { chmReaderFromFile } from "chmlib-ts/reader";
import { parseSystemInfo } from "chmlib-ts/system";
import type { ChmBundle, ChmBundleEntry, ChmIndexNode, ChmTocNode, ConversionWarning, IndexSource, ProgressHandler, TocSource } from "@chm-md/shared";
import { classifyChmPath, normalizeChmPath } from "@chm-md/shared";
import { parseBinaryIndex } from "./binary-index.js";
import { countTocNodes, maxTocDepth, parseBinaryToc } from "./binary-toc.js";
import { decodeChmText, discoverIndexPath, discoverTocPath } from "./decode.js";
import {
  countSitemapNodes,
  mapSitemapToIndex,
  mapSitemapToToc,
  maxSitemapDepth,
  parseSitemap,
} from "./sitemap.js";

export interface ExtractChmOptions {
  sourcePath: string;
  outputDir?: string;
  preferBinaryToc?: boolean;
  preferBinaryIndex?: boolean;
  onProgress?: ProgressHandler;
}

export interface ExtractChmResult {
  bundle: ChmBundle;
  files: Map<string, Uint8Array>;
}

async function readEntryText(
  chm: ChmFile,
  path: string,
  files: Map<string, Uint8Array>,
): Promise<string | undefined> {
  const cached = files.get(path);
  if (cached) {
    return decodeChmText(cached);
  }

  const entry = await chm.resolve(path);
  if (!entry || entry.length === 0n) {
    return undefined;
  }

  const data = await chm.retrieve(entry);
  files.set(path, data);
  return decodeChmText(data);
}

function resolveToc(
  files: Map<string, Uint8Array>,
  tocPath: string | undefined,
  tocHtml: string | undefined,
  preferBinary: boolean,
  extractWarnings: ConversionWarning[],
): { toc: ChmTocNode[]; tocSource: TocSource } {
  const textToc = tocHtml ? mapSitemapToToc(parseSitemap(tocHtml)) : [];
  const binaryToc = parseBinaryToc(files);

  if (preferBinary && binaryToc.length > 0) {
    return { toc: binaryToc, tocSource: "binary" };
  }

  if (textToc.length > 0) {
    if (binaryToc.length > 0) {
      const textCount = countSitemapNodes(parseSitemap(tocHtml ?? ""));
      const binaryCount = countTocNodes(binaryToc);
      if (binaryCount > textCount * 2) {
        extractWarnings.push({
          code: "toc-cross-check",
          message: `Text TOC node count (${textCount}) is much smaller than binary TOC (${binaryCount})`,
          details: { tocPath, textCount, binaryCount },
        });
      }
    }
    return { toc: textToc, tocSource: "hhc" };
  }

  if (binaryToc.length > 0) {
    return { toc: binaryToc, tocSource: "binary" };
  }

  extractWarnings.push({
    code: "missing-toc",
    message: "No text or binary table of contents could be parsed",
    details: { tocPath },
  });
  return { toc: [], tocSource: "none" };
}

function resolveIndex(
  files: Map<string, Uint8Array>,
  indexPath: string | undefined,
  indexHtml: string | undefined,
  preferBinary: boolean,
  extractWarnings: ConversionWarning[],
): { index: ChmIndexNode[]; indexSource: IndexSource; warnings: ConversionWarning[] } {
  const textIndex = indexHtml ? mapSitemapToIndex(parseSitemap(indexHtml)) : [];
  const binaryResult = parseBinaryIndex(files);

  if (preferBinary && binaryResult.index.length > 0) {
    return {
      index: binaryResult.index,
      indexSource: "binary",
      warnings: binaryResult.warnings,
    };
  }

  if (textIndex.length > 0) {
    return { index: textIndex, indexSource: "hhk", warnings: [] };
  }

  if (binaryResult.index.length > 0) {
    return {
      index: binaryResult.index,
      indexSource: "binary",
      warnings: binaryResult.warnings,
    };
  }

  extractWarnings.push({
    code: "missing-index",
    message: "No text or binary keyword index could be parsed",
    details: { indexPath },
  });

  return {
    index: [],
    indexSource: "none",
    warnings: binaryResult.warnings,
  };
}

/** Extract a CHM archive into a ChmBundle and file map. */
export async function extractChm(options: ExtractChmOptions): Promise<ExtractChmResult> {
  const chm = await ChmFile.open(chmReaderFromFile(options.sourcePath));
  const files = new Map<string, Uint8Array>();
  const entries: ChmBundleEntry[] = [];
  const extractWarnings: ConversionWarning[] = [];

  try {
    for await (const entry of chm.enumerate(ChmEnumerateFlags.All)) {
      const path = normalizeChmPath(entry.path);
      const isDirectory = entry.length === 0n;
      const kind = classifyChmPath(path, isDirectory);

      entries.push({
        path,
        size: Number(entry.length),
        compressed: entry.space === 1,
        kind,
      });

      if (!isDirectory && entry.length > 0n) {
        const data = await chm.retrieve(entry);
        files.set(path, data);
      }
    }

    options.onProgress?.({
      phase: "extract",
      message: `enumerated ${entries.length} entries`,
      current: entries.length,
    });

    const systemRaw = await chm.getSystemRaw();
    const systemInfo = systemRaw ? parseSystemInfo(systemRaw) : {};
    const system = {
      tocFile: systemInfo.tocFile ? normalizeChmPath(systemInfo.tocFile) : undefined,
      indexFile: systemInfo.indexFile ? normalizeChmPath(systemInfo.indexFile) : undefined,
      defaultTopic: systemInfo.defaultTopic
        ? normalizeChmPath(systemInfo.defaultTopic)
        : undefined,
      title: systemInfo.title,
      defaultWindow: systemInfo.defaultWindow,
      compiledFile: systemInfo.compiledFile,
      binaryToc: systemInfo.binaryToc,
      binaryIndex: systemInfo.binaryIndex,
      compilerVersion: systemInfo.compilerVersion,
      defaultFont: systemInfo.defaultFont,
    };

    const tocPath = discoverTocPath(entries, system.tocFile);
    const tocHtml = tocPath ? await readEntryText(chm, tocPath, files) : undefined;
    const { toc, tocSource } = resolveToc(
      files,
      tocPath,
      tocHtml,
      options.preferBinaryToc === true,
      extractWarnings,
    );

    const indexPath = discoverIndexPath(entries, system.indexFile);
    const indexHtml = indexPath ? await readEntryText(chm, indexPath, files) : undefined;
    const indexResult = resolveIndex(
      files,
      indexPath,
      indexHtml,
      options.preferBinaryIndex === true,
      extractWarnings,
    );
    extractWarnings.push(...indexResult.warnings);

    options.onProgress?.({
      phase: "extract",
      message: `parsed toc (${tocSource}, ${countTocNodes(toc)} nodes) and index (${indexResult.indexSource}, ${indexResult.index.length} roots)`,
    });

    const bundle: ChmBundle = {
      sourcePath: options.sourcePath,
      system,
      entries,
      toc,
      index: indexResult.index,
      tocSource,
      indexSource: indexResult.indexSource,
      extractWarnings,
    };

    if (options.outputDir) {
      await writeExtractOutput(options.outputDir, bundle, files);
    }

    return { bundle, files };
  } finally {
    chm.close();
  }
}

async function writeExtractOutput(
  outputDir: string,
  bundle: ChmBundle,
  files: Map<string, Uint8Array>,
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, "bundle.json"), JSON.stringify(bundle, null, 2), "utf8");

  for (const [path, data] of files) {
    const relative = path.replace(/^\//, "");
    const target = join(outputDir, "raw", relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }
}

export { decodeChmText } from "./decode.js";
export {
  countSitemapNodes,
  countTocNodes,
  maxSitemapDepth,
  maxTocDepth,
  parseBinaryToc,
  parseSitemap,
};
