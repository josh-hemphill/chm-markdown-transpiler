import type { ConversionWarning } from "@chm-md/shared";

export type TableKind =
  | "simple-data"
  | "spanned"
  | "nested"
  | "layout-chrome"
  | "header-only-note";

export type TableChromeMode = "strip" | "preserve" | "flatten";

export type TableWarningAction = "stripped" | "preserved-html" | "blockquote" | "gfm";

const CHROME_CLASS_PATTERNS = [
  /headerbar/i,
  /header_bar/i,
  /lightweight_/i,
  /\bnav\b/i,
  /topnav/i,
  /breadcrumb/i,
  /toolbar/i,
];

const COLLAPSED_SAMPLE_PATH_LIMIT = 5;

export interface TableProcessResult {
  kind: TableKind;
  warning?: ConversionWarning;
  /** When set, replaces the table node before Turndown. */
  replacementHtml?: string;
}

/** Classify an HTML table for conversion strategy. */
export function classifyTable(table: Element): TableKind {
  if (table.querySelector("table")) {
    return "nested";
  }

  const rows = [...table.querySelectorAll("tr")];
  if (rows.length === 0) {
    return "layout-chrome";
  }

  const hasSpan = table.querySelector("[colspan],[rowspan]");
  if (hasSpan) {
    return "spanned";
  }

  if (isChromeTable(table)) {
    return "layout-chrome";
  }

  if (isHeaderOnlyNoteTable(table, rows)) {
    return "header-only-note";
  }

  const headerCells = table.querySelectorAll("th");
  const bodyRows = rows.filter((row) => row.querySelector("td"));
  if (headerCells.length > 0 && bodyRows.length > 0) {
    return "simple-data";
  }

  if (headerCells.length === 0 && rows.length > 0) {
    return "layout-chrome";
  }

  return "simple-data";
}

function isChromeTable(table: Element): boolean {
  const className = table.getAttribute("class") ?? "";
  const id = table.getAttribute("id") ?? "";
  const haystack = `${className} ${id}`;
  return CHROME_CLASS_PATTERNS.some((pattern) => pattern.test(haystack));
}

function classifyReason(table: Element, kind: TableKind): string {
  if (kind === "spanned") {
    return "colspan-or-rowspan";
  }
  if (kind === "nested") {
    return "nested-table";
  }
  if (isChromeTable(table)) {
    const className = table.getAttribute("class")?.trim();
    return className ? `chrome-class:${className.split(/\s+/)[0]}` : "chrome-class";
  }
  if (table.querySelectorAll("th").length === 0) {
    return "no-th-rows";
  }
  if (table.querySelectorAll("tr").length === 0) {
    return "empty-table";
  }
  return "layout-structure";
}

function tableClassName(table: Element): string | undefined {
  const className = table.getAttribute("class")?.trim();
  return className ? className.split(/\s+/)[0] : undefined;
}

function buildTableWarningDetails(
  table: Element,
  kind: TableKind,
  action: TableWarningAction,
  reason: string,
): Record<string, unknown> {
  return {
    kind,
    action,
    reason,
    className: tableClassName(table),
    outerHtmlPreview: table.outerHTML.slice(0, 200),
  };
}

function isHeaderOnlyNoteTable(table: Element, rows: Element[]): boolean {
  if (rows.length !== 1) {
    return false;
  }

  const row = rows[0];
  if (!row) {
    return false;
  }

  const thCells = [...row.querySelectorAll("th")];
  const tdCells = [...row.querySelectorAll("td")];

  if (thCells.length >= 1 && tdCells.length === 0) {
    return true;
  }

  if (tdCells.length === 1 && thCells.length === 0) {
    const text = tdCells[0]?.textContent?.trim() ?? "";
    const hasBoldOnly =
      tdCells[0]?.querySelector("b, strong") !== null &&
      (tdCells[0]?.textContent?.trim().length ?? 0) > 0;
    return text.length > 0 && hasBoldOnly;
  }

  return false;
}

function extractNoteText(table: Element): string {
  const row = table.querySelector("tr");
  if (!row) {
    return table.textContent?.trim() ?? "";
  }

  const cells = [...row.querySelectorAll("th, td")];
  return cells
    .map((cell) => cell.textContent?.trim() ?? "")
    .filter((text) => text.length > 0)
    .join(" ");
}

function extractFlattenedText(table: Element): string {
  const paragraphs = [...table.querySelectorAll("td, th")]
    .map((cell) => cell.textContent?.trim() ?? "")
    .filter((text) => text.length > 0);
  return paragraphs.join("\n\n");
}

function isChromeOnlyContent(table: Element): boolean {
  const text = table.textContent?.replace(/\s+/g, "").trim() ?? "";
  if (text.length === 0) {
    return true;
  }
  return isChromeTable(table) && !table.querySelector("th");
}

function preserveAsHtmlBlock(table: Element): string {
  return `<div data-chm-html-block="table">${table.outerHTML}</div>`;
}

/** Process a table element and decide how to represent it in markdown. */
export function processTable(
  table: Element,
  sourcePath?: string,
  chromeMode: TableChromeMode = "strip",
): TableProcessResult {
  const kind = classifyTable(table);
  const reason = classifyReason(table, kind);

  if (kind === "simple-data") {
    return { kind };
  }

  if (kind === "header-only-note") {
    const noteText = extractNoteText(table);
    return {
      kind,
      replacementHtml: `<blockquote><p>${escapeHtml(noteText)}</p></blockquote>`,
      warning: {
        code: "note-table",
        message: "Single-row emphasis table converted to blockquote note",
        sourcePath,
        details: buildTableWarningDetails(table, kind, "blockquote", reason),
      },
    };
  }

  if (kind === "layout-chrome") {
    if (chromeMode === "preserve") {
      return {
        kind,
        replacementHtml: preserveAsHtmlBlock(table),
        warning: {
          code: "layout-table-preserved",
          message: "Layout/chrome table preserved as HTML block",
          sourcePath,
          details: buildTableWarningDetails(table, kind, "preserved-html", reason),
        },
      };
    }

    if (chromeMode === "flatten") {
      const flattened = extractFlattenedText(table);
      return {
        kind,
        replacementHtml: flattened
          ? flattened
              .split("\n\n")
              .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
              .join("")
          : "",
        warning: {
          code: "layout-table-stripped",
          message: "Layout/chrome table flattened to paragraphs",
          sourcePath,
          details: buildTableWarningDetails(table, kind, "stripped", `${reason}:flatten`),
        },
      };
    }

    if (isChromeOnlyContent(table)) {
      return {
        kind,
        replacementHtml: "",
        warning: {
          code: "layout-table-stripped",
          message: "Layout/chrome table stripped from content",
          sourcePath,
          details: buildTableWarningDetails(table, kind, "stripped", reason),
        },
      };
    }
  }

  const warningCode =
    kind === "spanned"
      ? "table-html-fallback"
      : kind === "nested"
        ? "complex-table"
        : "layout-table-preserved";

  const warningMessage =
    kind === "spanned"
      ? "Table with colspan/rowspan preserved as HTML block"
      : kind === "nested"
        ? "Nested table preserved as HTML block"
        : "Layout table preserved as HTML block";

  return {
    kind,
    replacementHtml: preserveAsHtmlBlock(table),
    warning: {
      code: warningCode,
      message: warningMessage,
      sourcePath,
      details: buildTableWarningDetails(table, kind, "preserved-html", reason),
    },
  };
}

/** Collapse identical layout-table-stripped warnings into summary entries. */
export function collapseChromeStripWarnings(warnings: ConversionWarning[]): ConversionWarning[] {
  const collapsed: ConversionWarning[] = [];
  const stripGroups = new Map<string, ConversionWarning[]>();

  for (const warning of warnings) {
    if (warning.code !== "layout-table-stripped") {
      collapsed.push(warning);
      continue;
    }

    const reason = String(warning.details?.reason ?? "unknown");
    const className = String(warning.details?.className ?? "");
    const key = `${reason}|${className}`;
    const group = stripGroups.get(key) ?? [];
    group.push(warning);
    stripGroups.set(key, group);
  }

  for (const group of stripGroups.values()) {
    if (group.length === 1) {
      collapsed.push(group[0]!);
      continue;
    }

    const first = group[0]!;
    const samplePaths = group
      .map((warning) => warning.sourcePath)
      .filter((path): path is string => Boolean(path))
      .slice(0, COLLAPSED_SAMPLE_PATH_LIMIT);

    collapsed.push({
      code: "layout-table-stripped",
      message: `Layout/chrome tables stripped from ${group.length} pages`,
      details: {
        ...first.details,
        count: group.length,
        samplePaths,
      },
    });
  }

  return collapsed;
}

/** Apply table preprocessing to all tables in a document. */
export function preprocessTables(
  document: Document,
  sourcePath: string,
  warnings: ConversionWarning[],
  chromeMode: TableChromeMode = "strip",
): void {
  for (const table of document.querySelectorAll("table")) {
    const result = processTable(table, sourcePath, chromeMode);
    if (result.warning) {
      warnings.push(result.warning);
    }

    if (result.replacementHtml === undefined) {
      continue;
    }

    if (result.replacementHtml === "") {
      table.remove();
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.innerHTML = result.replacementHtml;
    const replacement = wrapper.firstElementChild ?? wrapper;
    table.replaceWith(replacement);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
