import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CONVERTER_VERSION } from "@chm-md/shared";
import { resolveLintConfig } from "./lint.js";
import type { TableChromeMode } from "./tables.js";

export const CONVERT_CACHE_FILENAME = "convert-cache.json";
export const CONVERT_CACHE_VERSION = 1;

export interface ConvertCacheSettings {
  lint: boolean;
  lintFix: boolean;
  tableChrome: TableChromeMode;
  preferBinaryToc: boolean;
  preferBinaryIndex: boolean;
  lintConfigPath?: string;
}

export interface ConvertCacheFingerprint {
  version: number;
  converterVersion: string;
  source: {
    path: string;
    size: number;
    mtimeMs: number;
    sha256: string;
  };
  settings: {
    lint: boolean;
    lintFix: boolean;
    tableChrome: TableChromeMode;
    preferBinaryToc: boolean;
    preferBinaryIndex: boolean;
    lintConfigSha256: string | null;
  };
}

export interface ConvertCacheRecord {
  hash: string;
  fingerprint: ConvertCacheFingerprint;
  createdAt: string;
}

export interface BuildConvertFingerprintOptions extends ConvertCacheSettings {
  sourcePath: string;
}

/** Stable JSON stringify with sorted object keys. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

/** SHA-256 hex digest of a file's contents. */
export async function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function hashTextSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function resolveLintConfigSha256(settings: ConvertCacheSettings): string | null {
  if (!settings.lint) {
    return null;
  }
  const config = resolveLintConfig(settings.lintConfigPath);
  return hashTextSha256(stableStringify(config));
}

/** Build a convert fingerprint from source file metadata and convert settings. */
export async function buildConvertFingerprint(
  options: BuildConvertFingerprintOptions,
): Promise<ConvertCacheFingerprint> {
  const sourcePath = resolve(options.sourcePath);
  const sourceStat = await stat(sourcePath);
  const sourceSha256 = await hashFileSha256(sourcePath);

  return {
    version: CONVERT_CACHE_VERSION,
    converterVersion: CONVERTER_VERSION,
    source: {
      path: sourcePath.replace(/\\/g, "/"),
      size: sourceStat.size,
      mtimeMs: Math.trunc(sourceStat.mtimeMs),
      sha256: sourceSha256,
    },
    settings: {
      lint: options.lint,
      lintFix: options.lintFix,
      tableChrome: options.tableChrome,
      preferBinaryToc: options.preferBinaryToc,
      preferBinaryIndex: options.preferBinaryIndex,
      lintConfigSha256: resolveLintConfigSha256(options),
    },
  };
}

/** Hash a convert fingerprint into a cache key. */
export function hashConvertFingerprint(fingerprint: ConvertCacheFingerprint): string {
  return hashTextSha256(stableStringify(fingerprint));
}

/** Build fingerprint + hash for a convert run. */
export async function computeConvertCache(
  options: BuildConvertFingerprintOptions,
): Promise<{ hash: string; fingerprint: ConvertCacheFingerprint }> {
  const fingerprint = await buildConvertFingerprint(options);
  return { hash: hashConvertFingerprint(fingerprint), fingerprint };
}

/** Read convert-cache.json from a project directory, if present. */
export async function readConvertCache(projectDir: string): Promise<ConvertCacheRecord | null> {
  const cachePath = join(projectDir, CONVERT_CACHE_FILENAME);
  if (!existsSync(cachePath)) {
    return null;
  }
  try {
    const raw = await readFile(cachePath, "utf8");
    return JSON.parse(raw) as ConvertCacheRecord;
  } catch {
    return null;
  }
}

/** Write convert-cache.json into a project directory. */
export async function writeConvertCache(
  projectDir: string,
  record: Omit<ConvertCacheRecord, "createdAt"> & { createdAt?: string },
): Promise<void> {
  const payload: ConvertCacheRecord = {
    hash: record.hash,
    fingerprint: record.fingerprint,
    createdAt: record.createdAt ?? new Date().toISOString(),
  };
  await writeFile(join(projectDir, CONVERT_CACHE_FILENAME), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/** True when an existing project can be reused for the given convert inputs. */
export async function isConvertCacheHit(
  projectDir: string,
  expectedHash: string,
): Promise<boolean> {
  if (!existsSync(join(projectDir, "manifest.json"))) {
    return false;
  }
  const existing = await readConvertCache(projectDir);
  return existing?.hash === expectedHash;
}
