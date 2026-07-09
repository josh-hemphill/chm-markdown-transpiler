import type { ConversionWarning } from "@chm-md/shared";

const LANGUAGE_CLASS_MAP: Record<string, { label: string; fence: string }> = {
  csharpcode: { label: "C#", fence: "csharp" },
  visualbasiccode: { label: "VB", fence: "vb" },
  managedcpluspluscode: { label: "C++", fence: "cpp" },
  fsharpcode: { label: "F#", fence: "fsharp" },
  jscriptcode: { label: "JScript", fence: "javascript" },
};

/** Convert MSDN CodeSnippetContainer tabs into labeled fenced code blocks. */
export function preprocessCodeSnippets(document: Document): void {
  for (const container of [...document.querySelectorAll(".CodeSnippetContainer")]) {
    const blocks: string[] = [];

    for (const codeDiv of container.querySelectorAll(".CodeSnippetContainerCode")) {
      const className = (codeDiv.getAttribute("class") ?? "").toLowerCase();
      const languageKey = Object.keys(LANGUAGE_CLASS_MAP).find((key) => className.includes(key));
      const language = languageKey ? LANGUAGE_CLASS_MAP[languageKey] : undefined;
      const pre = codeDiv.querySelector("pre");
      const codeHtml = pre?.innerHTML ?? codeDiv.innerHTML;
      const codeText = htmlToPlainCode(codeHtml).trim();
      if (!codeText) {
        continue;
      }

      const label = language?.label ?? "Code";
      const fence = language?.fence ?? "text";
      blocks.push(
        `<p><strong>${escapeHtml(label)}</strong></p><pre><code class="language-${fence}">${escapeHtml(codeText)}</code></pre>`,
      );
    }

    if (blocks.length === 0) {
      container.remove();
      continue;
    }

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-chm-code-snippets", "true");
    wrapper.innerHTML = blocks.join("\n");
    container.replaceWith(wrapper);
  }
}

/** Replace javascript: anchors with plain text labels. */
export function neutralizeJavascriptLinks(
  document: Document,
  sourcePath: string,
  warnings: ConversionWarning[],
): void {
  for (const anchor of [...document.querySelectorAll("a[href]")]) {
    const href = anchor.getAttribute("href") ?? "";
    if (!/^javascript:/i.test(href)) {
      continue;
    }

    const label = anchor.textContent?.trim() || anchor.getAttribute("title") || "script";
    const span = document.createElement("span");
    span.textContent = label;
    span.setAttribute("data-chm-script-link", "true");
    anchor.replaceWith(span);

    warnings.push({
      code: "script-link-neutralized",
      message: `Neutralized javascript: link "${label}"`,
      sourcePath,
      details: { href: href.slice(0, 120), label },
    });
  }
}

function htmlToPlainCode(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\u00a0/g, " ");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
