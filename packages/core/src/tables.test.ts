import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
// @ts-expect-error joplin plugin has no types
import { gfm } from "@joplin/turndown-plugin-gfm";
import { classifyTable, collapseChromeStripWarnings, preprocessTables, processTable } from "./tables.js";

function turndownHtml(html: string, chromeMode: "strip" | "preserve" | "flatten" = "strip"): string {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const warnings: { code: string }[] = [];
  preprocessTables(document, "/test.html", warnings as never, chromeMode);
  const service = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  service.use(gfm);
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

  it("flattens spanned tables to simple HTML for GFM", () => {
    const { document } = parseHTML(
      "<table><tr><td rowspan='2'>A</td><td>B</td></tr><tr><td>C</td></tr></table>",
    );
    const result = processTable(document.querySelector("table")!);
    expect(result.kind).toBe("spanned");
    expect(result.warning?.code).toBe("table-span-flattened");
    expect(result.replacementHtml).toContain("<table>");
    expect(result.replacementHtml).not.toContain("rowspan");
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

  it("flattens chrome tables to GFM when mode is preserve", () => {
    const output = turndownHtml(
      '<table class="headerBar"><tr><td>Nav</td><td>Tools</td></tr></table>',
      "preserve",
    );
    expect(output).toContain("layout-table-flattened");
    expect(output).toContain("| Nav | Tools |");
    expect(output).not.toContain("<table");
    expect(output).not.toContain("bgcolor");
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

  it("flattens spanned tables to GFM pipes without presentation attrs", () => {
    const output = turndownHtml(
      "<table bgcolor='#ff0000'><tr><td colspan='2' style='color:red'>Wide</td></tr></table>",
    );
    expect(output).toContain("| Wide | Wide |");
    expect(output).toContain("table-span-flattened");
    expect(output).not.toContain("<table");
    expect(output).not.toContain("bgcolor");
  });

  it("flattens nested tables to sequential GFM tables", () => {
    const output = turndownHtml(
      "<table><tr><td><table><tr><td>inner</td></tr></table></td><td>outer</td></tr></table>",
    );
    expect(output).toContain("| inner |");
    expect(output).toContain("| outer |");
    expect(output).toContain("table-nested-flattened");
    expect(output).not.toContain("<table");
  });

  it("escapes pipe characters in simple table cells", () => {
    const output = turndownHtml(
      "<table><tr><th>Key</th></tr><tr><td>a|b</td></tr></table>",
    );
    expect(output).toMatch(/a\\|b|a\|b/);
  });
});
