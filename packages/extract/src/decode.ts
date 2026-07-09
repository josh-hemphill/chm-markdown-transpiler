import iconv from "iconv-lite";
import type { ChmBundleEntry } from "@chm-md/shared";
import { normalizeChmPath } from "@chm-md/shared";
const WINDOWS_1252 = "win1252";

/** Decode CHM text bytes using charset hints from HTML when available. */
export function decodeChmText(data: Uint8Array, charsetHint?: string): string {
  const charset = charsetHint?.toLowerCase() ?? detectCharset(data);
  if (charset === "utf-8" || charset === "utf8") {
    return new TextDecoder("utf-8", { fatal: false }).decode(data);
  }
  if (iconv.encodingExists(charset)) {
    return iconv.decode(Buffer.from(data), charset);
  }
  return iconv.decode(Buffer.from(data), WINDOWS_1252);
}

function detectCharset(data: Uint8Array): string {
  const sample = new TextDecoder("latin1").decode(data.subarray(0, Math.min(data.length, 4096)));
  const metaMatch = sample.match(/charset\s*=\s*["']?([a-zA-Z0-9_-]+)/i);
  if (metaMatch?.[1]) {
    return metaMatch[1].toLowerCase();
  }
  return WINDOWS_1252;
}

function discoverTocPath(entries: ChmBundleEntry[], systemToc?: string): string | undefined {  if (systemToc) {
    return normalizeChmPath(systemToc);
  }
  const hhc = entries.find((entry) => entry.path.toLowerCase().endsWith(".hhc"));
  return hhc?.path;
}

function discoverIndexPath(entries: ChmBundleEntry[], systemIndex?: string): string | undefined {
  if (systemIndex) {
    return normalizeChmPath(systemIndex);
  }
  const hhk = entries.find((entry) => entry.path.toLowerCase().endsWith(".hhk"));
  return hhk?.path;
}

export interface ExtractOptions {
  sourcePath: string;
}

export { decodeChmText as decodeText };
export { discoverTocPath, discoverIndexPath };