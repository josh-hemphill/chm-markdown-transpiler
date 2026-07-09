import { describe, expect, it } from "vitest";
import { decodeChmText } from "./decode.js";

describe("decodeChmText", () => {
  it("decodes utf-8 html", () => {
    const html = "<html><head><meta charset='utf-8'></head><body>Hello</body></html>";
    const bytes = new TextEncoder().encode(html);
    expect(decodeChmText(bytes)).toContain("Hello");
  });
});
