/** Escape markdown-sensitive characters in prose while preserving code, HTML, and real links. */
export function escapeMarkdownProse(markdown: string): string {
  const segments = splitMarkdownSegments(markdown);
  return segments
    .map((segment) =>
      segment.type === "prose" ? escapeProseContent(segment.content) : segment.content,
    )
    .join("");
}

/** @deprecated Prefer escapeMarkdownProse. */
export function escapeAngleBracketsInProse(markdown: string): string {
  return escapeMarkdownProse(markdown);
}

/**
 * Escape prose while preserving markdown links/images:
 * - Outside links: escape < > [ ]
 * - Inside link labels: escape < > [ ]
 * - Leave destinations intact
 */
function escapeProseContent(prose: string): string {
  const links = findMarkdownLinks(prose);
  if (links.length === 0) {
    return escapeBareProse(prose);
  }

  let output = "";
  let lastIndex = 0;
  for (const link of links) {
    output += escapeBareProse(prose.slice(lastIndex, link.start));
    output += `${link.prefix}[${escapeLinkLabel(link.label)}]${link.destination}`;
    lastIndex = link.end;
  }
  output += escapeBareProse(prose.slice(lastIndex));
  return output;
}

interface MarkdownLinkMatch {
  start: number;
  end: number;
  prefix: string;
  label: string;
  destination: string;
}

/** Find inline links/images by scanning for ](url) / ][ref] and matching the opening [. */
function findMarkdownLinks(prose: string): MarkdownLinkMatch[] {
  const links: MarkdownLinkMatch[] = [];
  let index = 0;

  while (index < prose.length) {
    const closeBracket = prose.indexOf("]", index);
    if (closeBracket === -1) {
      break;
    }

    const next = prose[closeBracket + 1];
    if (next !== "(" && next !== "[") {
      index = closeBracket + 1;
      continue;
    }

    const destination = readDestination(prose, closeBracket + 1);
    if (!destination) {
      index = closeBracket + 1;
      continue;
    }

    const openBracket = findMatchingOpenBracket(prose, closeBracket);
    if (openBracket === -1) {
      index = closeBracket + 1;
      continue;
    }

    const prefix = openBracket > 0 && prose[openBracket - 1] === "!" ? "!" : "";
    const start = openBracket - (prefix ? 1 : 0);
    links.push({
      start,
      end: destination.end,
      prefix,
      label: prose.slice(openBracket + 1, closeBracket),
      destination: prose.slice(closeBracket + 1, destination.end),
    });
    index = destination.end;
  }

  return links;
}

function readDestination(
  prose: string,
  start: number,
): { end: number } | null {
  const opener = prose[start];
  if (opener === "(") {
    let depth = 0;
    for (let i = start; i < prose.length; i++) {
      const char = prose[i];
      if (char === "\n") {
        return null;
      }
      if (char === "(") {
        depth += 1;
        continue;
      }
      if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          return { end: i + 1 };
        }
      }
    }
    return null;
  }

  if (opener === "[") {
    const close = prose.indexOf("]", start + 1);
    if (close === -1 || prose.slice(start, close).includes("\n")) {
      return null;
    }
    return { end: close + 1 };
  }

  return null;
}

function findMatchingOpenBracket(prose: string, closeIndex: number): number {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i--) {
    const char = prose[i];
    if (char === "]" && !isEscaped(prose, i)) {
      depth += 1;
      continue;
    }
    if (char === "[" && !isEscaped(prose, i)) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function escapeBareProse(text: string): string {
  return escapeAngles(text)
    .replace(/(?<!\\)\[/g, "\\[")
    .replace(/(?<!\\)\]/g, "\\]");
}

function escapeLinkLabel(label: string): string {
  return escapeAngles(label)
    .replace(/(?<!\\)\[/g, "\\[")
    .replace(/(?<!\\)\]/g, "\\]");
}

/** Use markdown escapes so VitePress/Vue does not double-encode HTML entities. */
function escapeAngles(text: string): string {
  return text
    .replace(/(?<!\\)</g, "\\<")
    .replace(/(?<!\\)>/g, "\\>")
    .replace(/&lt;/g, "\\<")
    .replace(/&gt;/g, "\\>")
    .replace(/&amp;lt;/g, "\\<")
    .replace(/&amp;gt;/g, "\\>");
}

type SegmentType = "prose" | "fenced-code" | "html-block";

interface MarkdownSegment {
  type: SegmentType;
  content: string;
}

function splitMarkdownSegments(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let index = 0;

  while (index < markdown.length) {
    if (markdown.startsWith("```", index)) {
      const fenceEnd = markdown.indexOf("```", index + 3);
      if (fenceEnd === -1) {
        segments.push({ type: "prose", content: markdown.slice(index) });
        break;
      }
      segments.push({
        type: "fenced-code",
        content: markdown.slice(index, fenceEnd + 3),
      });
      index = fenceEnd + 3;
      continue;
    }

    const htmlStart = findHtmlBlockStart(markdown, index);
    if (htmlStart === index) {
      const htmlEnd = findHtmlBlockEnd(markdown, index);
      segments.push({
        type: "html-block",
        content: markdown.slice(index, htmlEnd),
      });
      index = htmlEnd;
      continue;
    }

    const nextFence = markdown.indexOf("```", index);
    const nextHtml = findHtmlBlockStart(markdown, index);
    const nextSpecial = Math.min(
      nextFence === -1 ? Number.POSITIVE_INFINITY : nextFence,
      nextHtml === -1 ? Number.POSITIVE_INFINITY : nextHtml,
    );
    const proseEnd = nextSpecial === Number.POSITIVE_INFINITY ? markdown.length : nextSpecial;
    segments.push({ type: "prose", content: markdown.slice(index, proseEnd) });
    index = proseEnd;
  }

  return segments;
}

function findHtmlBlockStart(markdown: string, fromIndex: number): number {
  const match = /<(table|div|span|p|ul|ol|li|pre|blockquote)\b/i.exec(markdown.slice(fromIndex));
  if (!match || match.index === undefined) {
    return -1;
  }
  return fromIndex + match.index;
}

function findHtmlBlockEnd(markdown: string, startIndex: number): number {
  const openTagMatch = /^<([a-z0-9]+)\b[^>]*>/i.exec(markdown.slice(startIndex));
  if (!openTagMatch) {
    return markdown.length;
  }

  const tagName = openTagMatch[1]?.toLowerCase();
  if (!tagName) {
    return markdown.length;
  }

  const openPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const closePattern = new RegExp(`</${tagName}>`, "gi");
  let depth = 0;
  let cursor = startIndex;

  while (cursor < markdown.length) {
    openPattern.lastIndex = cursor;
    closePattern.lastIndex = cursor;
    const nextOpen = openPattern.exec(markdown);
    const nextClose = closePattern.exec(markdown);

    if (!nextClose) {
      return markdown.length;
    }

    if (nextOpen && nextOpen.index <= nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth -= 1;
    cursor = nextClose.index + nextClose[0].length;
    if (depth <= 0) {
      return cursor;
    }
  }

  return markdown.length;
}
