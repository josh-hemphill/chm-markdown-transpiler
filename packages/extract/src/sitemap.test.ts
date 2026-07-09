import { describe, expect, it } from "vitest";
import {
  countSitemapNodes,
  maxSitemapDepth,
  parseSitemap,
} from "./sitemap.js";

const nestedSitemap = `<!DOCTYPE HTML>
<HTML><BODY>
<UL>
  <LI><OBJECT type="text/sitemap">
    <param name="Name" value="Root">
    <param name="Local" value="index.html">
  </OBJECT></LI>
  <UL>
    <LI><OBJECT type="text/sitemap">
      <param name="Name" value="Child">
      <param name="Local" value="child.html">
    </OBJECT></LI>
    <UL>
      <LI><OBJECT type="text/sitemap">
        <param name="Name" value="Grandchild">
        <param name="Local" value="grandchild.html">
      </OBJECT></LI>
    </UL>
  </UL>
</UL>
</BODY></HTML>`;

describe("parseSitemap", () => {
  it("parses sibling UL nesting as children", () => {
    const tree = parseSitemap(nestedSitemap);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("Root");
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.name).toBe("Child");
    expect(tree[0]?.children[0]?.children[0]?.name).toBe("Grandchild");
    expect(maxSitemapDepth(tree)).toBeGreaterThan(2);
    expect(countSitemapNodes(tree)).toBe(3);
  });
});
