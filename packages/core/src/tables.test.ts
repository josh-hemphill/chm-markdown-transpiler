import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
// @ts-expect-error joplin plugin has no types
import { gfm } from "@joplin/turndown-plugin-gfm";
import { classifyTable, collapseChromeStripWarnings, preprocessTables, processTable } from "./tables.js";

function turndownHtml(html: string): string {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const warnings: { code: string }[] = [];
  preprocessTables(document, "/test.html", warnings as never);
  const service = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  service.use(gfm);
  service.addRule("chmHtmlBlock", {
    filter: (node) =>
      node.nodeName === "DIV" &&
      (node as Element).getAttribute("data-chm-html-block") === "table",
    replacement: (_content, node) => `\n\n${(node as Element).innerHTML}\n\n`,
  });
  const bodyHtml = document.body?.innerHTML ?? html;
  const markdown = turndown(service, bodyHtml);
  return `${markdown}\n${JSON.stringify(warnings.map((w) => w.code))}`;
}

function turndown(service: TurndownService, html: string): string {
  return service.turndown(html).trim();
}

describe("classifyTable", () => {
  it("classifies a simple data table", () => {
    const { document } = parseHTML(
      "<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>",
    );
    const table = document.querySelector("table")!;
    expect(classifyTable(table)).toBe("simple-data");
  });

  it("classifies spanned tables", () => {
    const { document } = parseHTML(
      "<table><tr><td colspan='2'>Wide</td></tr><tr><td>A</td><td>B</td></tr></table>",
    );
    expect(classifyTable(document.querySelector("table")!)).toBe("spanned");
  });

  it("classifies nested tables", () => {
    const { document } = parseHTML(
      "<table><tr><td><table><tr><td>inner</td></tr></table></td></tr></table>",
    );
    expect(classifyTable(document.querySelector("table")!)).toBe("nested");
  });

  it("classifies chrome layout tables", () => {
    const { document } = parseHTML(
      '<table class="headerBar"><tr><td>Nav</td><td>Tools</td></tr></table>',
    );
    expect(classifyTable(document.querySelector("table")!)).toBe("layout-chrome");
  });

  it("classifies header-only note tables", () => {
    const { document } = parseHTML(
      "<table><tr><th>Important: read before continuing</th></tr></table>",
    );
    expect(classifyTable(document.querySelector("table")!)).toBe("header-only-note");
  });
});

describe("processTable", () => {
  it("converts header-only note tables to blockquote", () => {
    const { document } = parseHTML(
      "<table><tr><th>Note: check dependencies</th></tr></table>",
    );
    const table = document.querySelector("table")!;
    const result = processTable(table);
    expect(result.kind).toBe("header-only-note");
    expect(result.warning?.code).toBe("note-table");
    expect(result.replacementHtml).toContain("blockquote");
    expect(result.replacementHtml).toContain("Note: check dependencies");
  });

  it("preserves spanned tables as HTML", () => {
    const { document } = parseHTML(
      "<table><tr><td rowspan='2'>A</td><td>B</td></tr><tr><td>C</td></tr></table>",
    );
    const result = processTable(document.querySelector("table")!);
    expect(result.kind).toBe("spanned");
    expect(result.warning?.code).toBe("table-html-fallback");
    expect(result.replacementHtml).toContain("<table");
  });
});

describe("preprocessTables integration", () => {
  it("renders simple tables as GFM pipes", () => {
    const output = turndownHtml(
      "<table><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>1</td></tr></table>",
    );
    expect(output).toContain("| Name | Value |");
    expect(output).toContain("| Alpha |");
    expect(output).toContain("[]");
  });

  it("strips chrome tables and warns layout-table-stripped", () => {
    const output = turndownHtml(
      '<p>Before</p><table class="headerBar"><tr><td>Nav slice</td></tr></table><p>After</p>',
    );
    expect(output).toContain("Before");
    expect(output).toContain("After");
    expect(output).not.toContain("| Nav slice |");
    expect(output).toContain("layout-table-stripped");
  });

  it("preserves chrome tables when mode is preserve", () => {
    const { document } = parseHTML(
      '<!DOCTYPE html><html><body><table class="headerBar"><tr><td>Nav</td></tr></table></body></html>',
    );
    const warnings: { code: string }[] = [];
    preprocessTables(document, "/test.html", warnings as never, "preserve");
    expect(warnings[0]?.code).toBe("layout-table-preserved");
    expect(document.body?.innerHTML).toContain("<table");
  });

  it("flattens chrome tables when mode is flatten", () => {
    const { document } = parseHTML(
      '<!DOCTYPE html><html><body><table class="headerBar"><tr><td>Nav slice</td></tr></table></body></html>',
    );
    const warnings: { code: string }[] = [];
    preprocessTables(document, "/test.html", warnings as never, "flatten");
    expect(warnings[0]?.code).toBe("layout-table-stripped");
    expect(document.body?.textContent).toContain("Nav slice");
    expect(document.querySelector("table")).toBeNull();
  });

  it("collapses identical chrome strip warnings", () => {
    const collapsed = collapseChromeStripWarnings([
      {
        code: "layout-table-stripped",
        message: "a",
        sourcePath: "/a.html",
        details: { reason: "chrome-class:headerBar", className: "headerBar" },
      },
      {
        code: "layout-table-stripped",
        message: "b",
        sourcePath: "/b.html",
        details: { reason: "chrome-class:headerBar", className: "headerBar" },
      },
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]?.details?.count).toBe(2);
  });

  it("keeps spanned tables as HTML in markdown", () => {
    const output = turndownHtml(
      "<table><tr><td colspan='2'>Wide</td></tr></table>",
    );
    expect(output).toContain("<table");
    expect(output).toContain("table-html-fallback");
  });

  it("escapes pipe characters in simple table cells", () => {
    const output = turndownHtml(
      "<table><tr><th>Key</th></tr><tr><td>a|b</td></tr></table>",
    );
    expect(output).toMatch(/a\\|b|a\|b/);
  });
});
