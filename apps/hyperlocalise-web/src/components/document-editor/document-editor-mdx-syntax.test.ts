/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  commonIndent,
  dedentLines,
  findJsxClosingTag,
  indentLines,
  readBalancedBraces,
  readJsxOpenTag,
} from "./document-editor-mdx-syntax";

describe("readBalancedBraces", () => {
  it("returns the index past a nested object", () => {
    const src = "{a:{b:1}} trailing";
    expect(readBalancedBraces(src, 0)).toBe(9);
    expect(src.slice(0, 9)).toBe("{a:{b:1}}");
  });

  it("ignores braces inside quoted strings", () => {
    const src = `{title:"{not a close}", more:{ok:true}}`;
    expect(readBalancedBraces(src, 0)).toBe(src.length);
  });

  it("skips escaped quotes inside strings", () => {
    const src = `{tip:"say \\"hi\\"}"}`;
    expect(readBalancedBraces(src, 0)).toBe(src.length);
  });

  it("returns null for missing open braces or unclosed input", () => {
    expect(readBalancedBraces("not-an-object", 0)).toBeNull();
    expect(readBalancedBraces("{a:{b:1}", 0)).toBeNull();
  });
});

describe("readJsxOpenTag and findJsxClosingTag", () => {
  it("reads a self-closing tag with a brace expression", () => {
    const src = `<Card title="A" href={links.a} />`;
    expect(readJsxOpenTag(src)).toEqual({
      name: "Card",
      raw: src,
      selfClosing: true,
      end: src.length,
    });
  });

  it("finds the matching close when the same tag is nested", () => {
    const src = `<Tabs>
  <Tabs>
    Inner
  </Tabs>
</Tabs>`;
    const open = readJsxOpenTag(src);
    expect(open?.name).toBe("Tabs");
    expect(findJsxClosingTag(src, "Tabs", open!.end)).toEqual({
      start: src.lastIndexOf("</Tabs>"),
      end: src.length,
    });
  });

  it("returns null for a missing or mismatched close", () => {
    const src = `<Note title="Hi">Hello`;
    const open = readJsxOpenTag(src);
    expect(findJsxClosingTag(src, "Note", open!.end)).toBeNull();
    expect(findJsxClosingTag("<Note>Hi</Notes>", "Note", 6)).toBeNull();
  });
});

describe("indent helpers", () => {
  it("dedents and reindents callout bodies using the shortest indent", () => {
    const body = "  Body with **bold**.\n\n    - item\n";
    const indent = commonIndent(body);
    expect(indent).toBe("  ");
    expect(dedentLines(body, indent)).toBe("Body with **bold**.\n\n  - item\n");
    expect(indentLines("Body with **bold**.\n\n  - item\n", indent)).toBe(body);
  });

  it("leaves unindented text unchanged", () => {
    expect(commonIndent("Hello\n\nWorld")).toBe("");
    expect(dedentLines("Hello", "")).toBe("Hello");
    expect(indentLines("Hello", "")).toBe("Hello");
  });
});
