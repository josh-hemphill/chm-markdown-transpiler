import type { ChmIndexNode, ConversionWarning } from "@chm-md/shared";

const KEYWORD_BTREE_PATH = "/$WWKeywordLinks/BTree";
const KEYWORD_DATA_PATH = "/$WWKeywordLinks/Data";
const KEYWORD_MAP_PATH = "/$WWKeywordLinks/Map";

/** Parse binary CHM keyword index when .hhk is unavailable. */
export function parseBinaryIndex(files: Map<string, Uint8Array>): {
  index: ChmIndexNode[];
  warnings: ConversionWarning[];
} {
  const btree = files.get(KEYWORD_BTREE_PATH);
  const data = files.get(KEYWORD_DATA_PATH);
  const map = files.get(KEYWORD_MAP_PATH);

  if (!btree || !data || !map) {
    return {
      index: [],
      warnings: [
        {
          code: "binary-index-unsupported",
          message: "Binary keyword index files are missing; cannot parse $WWKeywordLinks",
        },
      ],
    };
  }

  try {
    const entries = parseKeywordBTree(btree, data, map);
    return {
      index: entries.map((entry) => ({
        name: entry.keyword,
        local: entry.local,
        children: [],
      })),
      warnings: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      index: [],
      warnings: [
        {
          code: "binary-index-unsupported",
          message: `Binary keyword index parsing failed: ${message}`,
        },
      ],
    };
  }
}

interface KeywordEntry {
  keyword: string;
  local?: string;
}

function parseKeywordBTree(
  btree: Uint8Array,
  data: Uint8Array,
  map: Uint8Array,
): KeywordEntry[] {
  const headerSize = 0x4c;
  if (btree.length < headerSize) {
    throw new Error("BTree header too small");
  }

  const blockSize = readUint32(btree, 0x10);
  const rootBlock = readUint32(btree, 0x1c);
  const entries: KeywordEntry[] = [];
  walkBTreeBlock(btree, data, map, blockSize, rootBlock, entries);
  return entries;
}

function walkBTreeBlock(
  btree: Uint8Array,
  data: Uint8Array,
  map: Uint8Array,
  blockSize: number,
  blockIndex: number,
  entries: KeywordEntry[],
): void {
  const offset = blockIndex * blockSize;
  if (offset + 8 > btree.length) {
    return;
  }

  const freeSpace = readUint16(btree, offset + 2);
  const blockEnd = offset + blockSize - freeSpace;
  let pos = offset + 8;

  while (pos + 12 <= blockEnd) {
    const keyOffset = readUint32(btree, pos);
    const dataOffset = readUint32(btree, pos + 4);
    const childBlock = readUint32(btree, pos + 8);
    pos += 12;

    if (keyOffset > 0) {
      const keyword = readMapString(map, keyOffset);
      const local = readDataLocal(data, dataOffset);
      if (keyword.length > 0) {
        entries.push({ keyword, local });
      }
    }

    if (childBlock !== 0xffff_ffff && childBlock !== 0) {
      walkBTreeBlock(btree, data, map, blockSize, childBlock, entries);
    }
  }
}

function readMapString(map: Uint8Array, offset: number): string {
  return readNullTerminatedString(map, offset);
}

function readDataLocal(data: Uint8Array, offset: number): string | undefined {
  if (offset + 4 > data.length) {
    return undefined;
  }
  const urlOffset = readUint32(data, offset);
  if (urlOffset === 0 || urlOffset >= data.length) {
    return undefined;
  }
  const local = readNullTerminatedString(data, urlOffset);
  return local.length > 0 ? local : undefined;
}

function readUint32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true);
}

function readUint16(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset + offset, 2).getUint16(0, true);
}

function readNullTerminatedString(data: Uint8Array, offset: number): string {
  if (offset >= data.length) {
    return "";
  }
  let end = offset;
  while (end < data.length && data[end] !== 0) {
    end += 1;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(data.subarray(offset, end));
}
