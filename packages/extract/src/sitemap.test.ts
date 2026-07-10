import { describe, expect, it } from "vitest";
import {
  countSitemapNodes,
  maxSitemapDepth,
  parseIndexSitemap,
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

const unclosedLiSitemap = `<html><body><ul>
  <li><object type="text/sitemap">
    <param name="Name" value="Root">
    <param name="Local" value="welcome.htm">
  </object>
  <ul>
    <li><object type="text/sitemap">
      <param name="Name" value="Child">
      <param name="Local" value="child.htm">
    </object>
    <li><object type="text/sitemap">
      <param name="Name" value="Sibling">
      <param name="Local" value="sibling.htm">
    </object>
  </ul>
</ul></body></html>`;

const multiKeywordIndex = `<html><body><ul>
  <li><object type="text/sitemap">
    <param name="Name" value="Keyword A">
    <param name="Name" value="Keyword B">
    <param name="Local" value="topic/b.htm">
    <param name="Name" value="Keyword C">
    <param name="Local" value="topic/c.htm">
  </object>
</ul></body></html>`;

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

  it("parses HHC-style sitemaps without closing li tags", () => {
    const tree = parseSitemap(unclosedLiSitemap);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("Root");
    expect(tree[0]?.children.map((node) => node.name)).toEqual(["Child", "Sibling"]);
  });
});

describe("parseIndexSitemap", () => {
  it("expands multi-keyword HHK objects into separate entries", () => {
    const entries = parseIndexSitemap(multiKeywordIndex);
    expect(entries.map((entry) => entry.name)).toEqual(["Keyword A", "Keyword B", "Keyword C"]);
    expect(entries[1]?.local).toBe("/topic/b.htm");
    expect(entries[2]?.local).toBe("/topic/c.htm");
    expect(entries[0]?.local).toBeUndefined();
  });
});
