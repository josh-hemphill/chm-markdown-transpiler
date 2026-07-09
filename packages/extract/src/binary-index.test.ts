import { describe, expect, it } from "vitest";
import { parseBinaryIndex } from "./binary-index.js";

describe("parseBinaryIndex", () => {
  it("returns unsupported warning when keyword index files are missing", () => {
    const result = parseBinaryIndex(new Map());
    expect(result.index).toEqual([]);
    expect(result.warnings[0]?.code).toBe("binary-index-unsupported");
  });

  it("returns unsupported warning when btree header is invalid", () => {
    const files = new Map<string, Uint8Array>([
      ["/$WWKeywordLinks/BTree", new Uint8Array(8)],
      ["/$WWKeywordLinks/Data", new Uint8Array(16)],
      ["/$WWKeywordLinks/Map", new Uint8Array(16)],
    ]);
    const result = parseBinaryIndex(files);
    expect(result.index).toEqual([]);
    expect(result.warnings[0]?.code).toBe("binary-index-unsupported");
    expect(result.warnings[0]?.message).toContain("BTree header too small");
  });
});
