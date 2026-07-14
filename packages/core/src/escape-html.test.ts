import { describe, expect, it } from "vitest";
import { escapeMarkdownProse } from "./escape-html.js";

describe("escapeMarkdownProse", () => {
  it("escapes generics in prose with markdown backslashes", () => {
    expect(escapeMarkdownProse("Triple<TFirst, TSecond>")).toBe("Triple\\<TFirst, TSecond\\>");
  });

  it("normalizes existing html entities to markdown escapes", () => {
    expect(escapeMarkdownProse("Triple&lt;TFirst&gt;")).toBe("Triple\\<TFirst\\>");
  });

  it("escapes bare square brackets in prose", () => {
    expect(escapeMarkdownProse("See [SerializableAttribute] above")).toBe(
      "See \\[SerializableAttribute\\] above",
    );
  });

  it("preserves real markdown links while escaping label brackets", () => {
    expect(escapeMarkdownProse("[Wintellect.PowerCollections](/html/N-Wintellect.PowerCollections)")).toBe(
      "[Wintellect.PowerCollections](/html/N-Wintellect.PowerCollections)",
    );
    expect(escapeMarkdownProse("[Foo[Bar]](/x)")).toBe("[Foo\\[Bar\\]](/x)");
    expect(escapeMarkdownProse("[Triple<T>](/x)")).toBe("[Triple\\<T\\>](/x)");
  });

  it("preserves image links", () => {
    expect(escapeMarkdownProse("![logo](/assets/logo.png)")).toBe("![logo](/assets/logo.png)");
  });

  it("leaves fenced code unchanged", () => {
    const input = "Text\n\n```csharp\nList<string>\n[Serializable]\n```\n";
    expect(escapeMarkdownProse(input)).toBe(input);
  });

  it("leaves inline code unchanged", () => {
    expect(escapeMarkdownProse("Use `List<string>` here")).toBe("Use `List<string>` here");
    expect(escapeMarkdownProse("Generic `Triple<TFirst, TSecond>` type")).toBe(
      "Generic `Triple<TFirst, TSecond>` type",
    );
  });

  it("leaves html table blocks unchanged", () => {
    const input = "<table><tr><td>A<T> [x]</td></tr></table>";
    expect(escapeMarkdownProse(input)).toBe(input);
  });
});
