import type { ChmTocNode, ConversionWarning } from "@chm-md/shared";
import { normalizeChmPath } from "@chm-md/shared";

const TOCIDX_PATH = "/#TOCIDX";
const TOPICS_PATH = "/#TOPICS";
const STRINGS_PATH = "/#STRINGS";
const URLTBL_PATH = "/#URLTBL";
const URLSTR_PATH = "/#URLSTR";

interface TocIdxStruct {
  offset: number;
  flags: number;
  topicsIndex: number;
  parentOffset: number;
  nextOffset: number;
  firstChildOffset: number;
  isBook: boolean;
}

interface TopicRecord {
  title: string;
  local?: string;
  inContents: boolean;
}

/** Parse binary CHM TOC from internal meta files. */
export function parseBinaryToc(files: Map<string, Uint8Array>): ChmTocNode[] {
  const tocIdx = files.get(TOCIDX_PATH);
  const topics = files.get(TOPICS_PATH);
  const strings = files.get(STRINGS_PATH);
  const urlTbl = files.get(URLTBL_PATH);
  const urlStr = files.get(URLSTR_PATH);

  if (!tocIdx || !topics || !strings || !urlTbl || !urlStr) {
    return [];
  }

  const header = readTocIdxHeader(tocIdx);
  const structs = readTocIdxStructs(tocIdx, header);
  const topicRecords = readTopicRecords(topics, strings, urlTbl, urlStr);
  return buildTocTree(structs, topicRecords);
}

export function parseBinaryTocWithWarnings(
  files: Map<string, Uint8Array>,
): { toc: ChmTocNode[]; warnings: ConversionWarning[] } {
  const warnings: ConversionWarning[] = [];
  if (!files.get(TOCIDX_PATH)) {
    warnings.push({
      code: "missing-binary-toc",
      message: "Binary TOC requested but /#TOCIDX is missing",
    });
    return { toc: [], warnings };
  }
  return { toc: parseBinaryToc(files), warnings };
}

function readTocIdxHeader(data: Uint8Array): {
  structRegionEnd: number;
} {
  const structListOffset = readUint32(data, 0xc);
  return { structRegionEnd: structListOffset };
}

function readTocIdxStructs(data: Uint8Array, header: { structRegionEnd: number }): TocIdxStruct[] {
  const structs: TocIdxStruct[] = [];
  let offset = 0x1000;

  while (offset < header.structRegionEnd && offset + 20 <= data.length) {
    const flags = readUint32(data, offset + 4);
    const isBook = (flags & 0x4) !== 0;
    const size = isBook ? 28 : 20;
    if (offset + size > data.length) {
      break;
    }

    structs.push({
      offset,
      flags,
      topicsIndex: readUint32(data, offset + 8),
      parentOffset: readUint32(data, offset + 0xc),
      nextOffset: readUint32(data, offset + 0x10),
      firstChildOffset: isBook ? readUint32(data, offset + 0x14) : 0,
      isBook,
    });

    offset += size;
  }

  return structs;
}

function readTopicRecords(
  topics: Uint8Array,
  strings: Uint8Array,
  urlTbl: Uint8Array,
  urlStr: Uint8Array,
): TopicRecord[] {
  const records: TopicRecord[] = [];
  const entryCount = Math.floor(topics.length / 16);

  for (let index = 0; index < entryCount; index += 1) {
    const offset = index * 16;
    const titleOffset = readUint32(topics, offset + 4);
    const urlTblOffset = readUint32(topics, offset + 8);
    const contentsFlag = readUint16(topics, offset + 0xc);
    const inContents = contentsFlag === 6;

    const title =
      titleOffset === 0xffff_ffff ? "" : readNullTerminatedString(strings, titleOffset);
    let local: string | undefined;
    if (urlTblOffset !== 0xffff_ffff) {
      const localRaw = resolveLocalFromUrlTbl(urlTbl, urlStr, urlTblOffset);
      if (localRaw) {
        local = normalizeChmPath(localRaw.startsWith("/") ? localRaw : `/${localRaw}`);
      }
    }

    records.push({ title, local, inContents });
  }

  return records;
}

function resolveLocalFromUrlTbl(
  urlTbl: Uint8Array,
  urlStr: Uint8Array,
  urlTblOffset: number,
): string | undefined {
  const blockIndex = Math.floor(urlTblOffset / 4096);
  const inBlockOffset = urlTblOffset % 4096;
  const entryIndex = Math.floor(inBlockOffset / 12);
  const entryOffset = blockIndex * 4096 + entryIndex * 12;
  if (entryOffset + 12 > urlTbl.length) {
    return undefined;
  }

  const urlStrOffset = readUint32(urlTbl, entryOffset + 8);
  if (urlStrOffset >= urlStr.length) {
    return undefined;
  }

  return readNullTerminatedString(urlStr, urlStrOffset + 8);
}

function buildTocTree(structs: TocIdxStruct[], topics: TopicRecord[]): ChmTocNode[] {
  const nodeByOffset = new Map<number, ChmTocNode>();

  for (const struct of structs) {
    const topic = topics[struct.topicsIndex];
    if (!topic?.inContents) {
      continue;
    }

    const node: ChmTocNode = {
      name: topic.title || `topic-${struct.topicsIndex}`,
      children: [],
    };
    if (topic.local) {
      node.local = topic.local;
    }
    nodeByOffset.set(struct.offset, node);
  }

  const roots: ChmTocNode[] = [];

  for (const struct of structs) {
    const node = nodeByOffset.get(struct.offset);
    if (!node) {
      continue;
    }

    if (struct.parentOffset === 0 || !nodeByOffset.has(struct.parentOffset)) {
      roots.push(node);
      continue;
    }

    const parent = nodeByOffset.get(struct.parentOffset);
    parent?.children.push(node);
  }

  return roots;
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

export function countTocNodes(nodes: ChmTocNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countTocNodes(node.children), 0);
}

export function maxTocDepth(nodes: ChmTocNode[], depth = 0): number {
  if (nodes.length === 0) {
    return depth;
  }
  return Math.max(...nodes.map((node) => maxTocDepth(node.children, depth + 1)), depth + 1);
}
