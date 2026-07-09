import { describe, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import type { ConversionWarning } from "@chm-md/shared";
import { neutralizeJavascriptLinks, preprocessCodeSnippets } from "./code-snippets.js";

describe("preprocessCodeSnippets", () => {
  it("converts MSDN tabbed snippets into labeled code blocks", () => {
    const { document } = parseHTML(`<!DOCTYPE html><html><body>
      <div class="CodeSnippetContainer">
        <div class="CodeSnippetContainerTabs">
          <div class="CodeSnippetContainerTabFirst CSharpTab" id="CSharpTabId">
            <a href="javascript:setActiveTab('CodeSnippetContainerCode','CSharpCode','CSharpTabId');" title="C#">C#</a>
          </div>
        </div>
        <div class="CodeSnippetContainerCodeCollection">
          <div class="CodeSnippetContainerCode CSharpCode">
            <pre class="libCScode">public struct Triple&lt;TFirst&gt;</pre>
          </div>
          <div class="CodeSnippetContainerCode VisualBasicCode">
            <pre class="libCScode">Public Structure Triple(Of TFirst)</pre>
          </div>
        </div>
      </div>
    </body></html>`);

    preprocessCodeSnippets(document);

    expect(document.querySelector(".CodeSnippetContainer")).toBeNull();
    expect(document.querySelector("a[href^='javascript:']")).toBeNull();
    expect(document.body?.textContent).toContain("C#");
    expect(document.body?.textContent).toContain("VB");
    expect(document.body?.innerHTML).toContain("language-csharp");
    expect(document.body?.innerHTML).toContain("Triple&lt;TFirst&gt;");
  });
});

describe("neutralizeJavascriptLinks", () => {
  it("replaces leftover javascript: anchors with plain text", () => {
    const { document } = parseHTML(
      `<!DOCTYPE html><html><body><a href="javascript:void(0)" title="C#">C#</a></body></html>`,
    );
    const warnings: ConversionWarning[] = [];
    neutralizeJavascriptLinks(document, "/test.html", warnings);

    expect(document.querySelector("a")).toBeNull();
    expect(document.body?.textContent).toBe("C#");
    expect(warnings[0]?.code).toBe("script-link-neutralized");
  });
});
