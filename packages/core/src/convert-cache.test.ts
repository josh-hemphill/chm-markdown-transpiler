import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONVERT_CACHE_FILENAME,
  hashConvertFingerprint,
  isConvertCacheHit,
  readConvertCache,
  stableStringify,
  writeConvertCache,
  type ConvertCacheFingerprint,
} from "./convert-cache.js";

describe("convert cache", () => {
  it("stableStringify sorts object keys", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("hashes fingerprints deterministically", () => {
    const fingerprint: ConvertCacheFingerprint = {
      version: 1,
      converterVersion: "0.1.0",
      source: {
        path: "/tmp/sample.chm",
        size: 10,
        mtimeMs: 100,
        sha256: "abc",
      },
      settings: {
        lint: false,
        lintFix: false,
        tableChrome: "strip",
        preferBinaryToc: false,
        preferBinaryIndex: false,
        lintConfigSha256: null,
      },
    };

    const first = hashConvertFingerprint(fingerprint);
    const second = hashConvertFingerprint({ ...fingerprint });
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("detects cache hits and misses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chm-md-cache-"));
    await writeFile(join(dir, "manifest.json"), "{}", "utf8");

    const fingerprint: ConvertCacheFingerprint = {
      version: 1,
      converterVersion: "0.1.0",
      source: {
        path: "/tmp/sample.chm",
        size: 10,
        mtimeMs: 100,
        sha256: createHash("sha256").update("x").digest("hex"),
      },
      settings: {
        lint: false,
        lintFix: false,
        tableChrome: "strip",
        preferBinaryToc: false,
        preferBinaryIndex: false,
        lintConfigSha256: null,
      },
    };
    const hash = hashConvertFingerprint(fingerprint);
    await writeConvertCache(dir, { hash, fingerprint });

    expect(await isConvertCacheHit(dir, hash)).toBe(true);
    expect(await isConvertCacheHit(dir, "different")).toBe(false);

    const loaded = await readConvertCache(dir);
    expect(loaded?.hash).toBe(hash);
    expect(CONVERT_CACHE_FILENAME).toBe("convert-cache.json");
  });

  it("misses when manifest is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chm-md-cache-miss-"));
    await mkdir(dir, { recursive: true });
    expect(await isConvertCacheHit(dir, "anything")).toBe(false);
  });
});
