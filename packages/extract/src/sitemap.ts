import type { ChmIndexNode, ChmTocNode } from "@chm-md/shared";
import { normalizeChmPath } from "@chm-md/shared";

export interface SitemapNode {
  name: string;
  local?: string;
  children: SitemapNode[];
}

/** Parse CHM .hhc / .hhk sitemap HTML with sibling-UL nesting. */
export function parseSitemap(html: string): SitemapNode[] {
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const content = bodyMatch?.[1] ?? html;
  const rootUl = findFirstUl(content);
  if (!rootUl) {
    return [];
  }
  return parseUlChildren(rootUl.inner);
}

function findFirstUl(html: string): { inner: string; end: number } | null {
  const open = /<ul\b[^>]*>/i.exec(html);
  if (!open || open.index === undefined) {
    return null;
  }
  const start = open.index + open[0].length;
  const inner = extractBalancedTagContent(html, start, "ul");
  if (!inner) {
    return null;
  }
  return { inner: inner.content, end: inner.end };
}

function extractBalancedTagContent(
  html: string,
  start: number,
  tag: string,
): { content: string; end: number } | null {
  let depth = 1;
  let index = start;
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");

  while (index < html.length && depth > 0) {
    openRe.lastIndex = index;
    closeRe.lastIndex = index;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);

    if (!nextClose) {
      return null;
    }

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      index = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return { content: html.slice(start, nextClose.index), end: nextClose.index + nextClose[0].length };
    }
    index = nextClose.index + nextClose[0].length;
  }

  return null;
}

function parseUlChildren(ulInner: string): SitemapNode[] {
  const nodes: SitemapNode[] = [];
  let pos = 0;

  while (pos < ulInner.length) {
    const slice = ulInner.slice(pos);
    const liOpen = /<li\b[^>]*>/i.exec(slice);
    if (!liOpen || liOpen.index === undefined) {
      break;
    }

    const liStart = pos + liOpen.index + liOpen[0].length;
    const liContent = extractBalancedTagContent(ulInner, liStart, "li");
    if (!liContent) {
      break;
    }

    const entry = parseListItem(liContent.content);
    pos = liContent.end;

    const afterLi = ulInner.slice(pos);
    const siblingUl = /^\s*<ul\b/i.test(afterLi) ? findFirstUl(afterLi) : null;
    if (siblingUl) {
      entry.children = parseUlChildren(siblingUl.inner);
      pos += siblingUl.end;
    }

    nodes.push(entry);
  }

  return nodes;
}

function parseListItem(liInner: string): SitemapNode {
  const objectMatch =
    /<object\b[^>]*type\s*=\s*["']text\/sitemap["'][^>]*>([\s\S]*?)<\/object>/i.exec(liInner);
  let name = "";
  let local: string | undefined;

  if (objectMatch?.[1]) {
    const objectBody = objectMatch[1];
    name = extractParam(objectBody, "name") ?? "";
    local = extractParam(objectBody, "local");
  }

  const node: SitemapNode = { name, children: [] };
  if (local) {
    node.local = normalizeChmPath(local.startsWith("/") ? local : `/${local}`);
  }
  return node;
}

function extractParam(objectBody: string, paramName: string): string | undefined {
  const re = new RegExp(
    `<param\\b[^>]*name\\s*=\\s*["']${paramName}["'][^>]*value\\s*=\\s*["']([^"']*)["']`,
    "i",
  );
  const match = re.exec(objectBody);
  if (match?.[1]) {
    return decodeEntities(match[1].trim());
  }

  const reAlt = new RegExp(
    `<param\\b[^>]*value\\s*=\\s*["']([^"']*)["'][^>]*name\\s*=\\s*["']${paramName}["']`,
    "i",
  );
  const alt = reAlt.exec(objectBody);
  return alt?.[1] ? decodeEntities(alt[1].trim()) : undefined;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

export function mapSitemapToToc(nodes: SitemapNode[]): ChmTocNode[] {
  return nodes.map((node) => ({
    name: node.name,
    local: node.local,
    children: mapSitemapToToc(node.children),
  }));
}

export function mapSitemapToIndex(nodes: SitemapNode[]): ChmIndexNode[] {
  return nodes.map((node) => ({
    name: node.name,
    local: node.local,
    children: mapSitemapToIndex(node.children),
  }));
}

export function countSitemapNodes(nodes: SitemapNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countSitemapNodes(node.children), 0);
}

export function maxSitemapDepth(nodes: SitemapNode[], depth = 0): number {
  if (nodes.length === 0) {
    return depth;
  }
  return Math.max(...nodes.map((node) => maxSitemapDepth(node.children, depth + 1)), depth + 1);
}
