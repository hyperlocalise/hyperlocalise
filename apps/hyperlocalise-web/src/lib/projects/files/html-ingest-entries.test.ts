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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import {
  applyHtmlIngestEntryKeys,
  extractHtmlIngestEntries,
  htmlCliPrefillsFromPathEntries,
  htmlCompletedPathKeysFromLock,
  isHashedHtmlEntryKey,
  isHtmlTranslationSourcePath,
  legacyHtmlSegmentKey,
  rewriteHashedHtmlSegmentKey,
  rewriteHashedHtmlSegmentKeys,
  utf8FromStoredFileContent,
} from "./html-ingest-entries";

const formattingFixture = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../../../tests/html/formatting-test.html",
  ),
  "utf8",
);

describe("extractHtmlIngestEntries", () => {
  it("assigns dotted tag-path keys like markdown slots", () => {
    const got = extractHtmlIngestEntries(`<html><head><title>Page Title</title></head><body>
<h1>Welcome</h1>
<p>First</p>
<p>Second</p>
<img alt="A red cat">
<table><tr><th>Name</th><td>Value</td></tr></table>
</body></html>`);

    expect(got).toMatchObject({
      "html.body.h1": "Welcome",
      "html.body.p": "First",
      "html.body.p.2": "Second",
      "html.body.img.alt": "A red cat",
      "html.body.table.tr.th": "Name",
      "html.body.table.tr.td": "Value",
    });
    expect(got["html.head.title"]).toBeUndefined();
  });

  it("extracts the formatting fixture with table and list paths", () => {
    const got = extractHtmlIngestEntries(formattingFixture);
    expect(got["html.body.h1"]).toBe("HTML Formatting Test");
    expect(got["html.body.p"]).toContain("This page tests ");
    expect(got["html.body.p.strong"]).toContain("tables");
    expect(got["html.body.p.strong.2"]).toContain("bullet lists");
    expect(got["html.body.p"]).not.toContain("<strong>");
    expect(got["tables"]).toBeUndefined();
    expect(got["html.body.table.thead.tr.th"]).toBe("ID");
    expect(got["html.body.ul.li"]).toBe("First bullet item");
    expect(got["html.body.ul.li.ul.li"]).toBe("Nested bullet item A");
    expect(Object.keys(got).some((key) => isHashedHtmlEntryKey(key))).toBe(false);
  });

  it("splits inline tags into path keys", () => {
    const got = extractHtmlIngestEntries("<p>Hello <strong>world</strong>!</p>");
    expect(got["html.p"]).toContain("Hello ");
    expect(got["html.p.strong"]).toContain("world");
    expect(got["html.p"]).not.toContain("<strong>");
    expect(got["html.p.strong"]).not.toContain("<strong>");
  });

  it("splits a paragraph with multiple inline tags into path keys", () => {
    const html =
      "<p>This page tests <strong>tables</strong>, <strong>bullet lists</strong>, numbered lists, and basic HTML styling.</p>";
    const got = extractHtmlIngestEntries(html);
    expect(got["html.p"]).toContain("This page tests ");
    expect(got["html.p.strong"]).toContain("tables");
    expect(got["html.p.strong.2"]).toContain("bullet lists");
    expect(got["html.p.2"]).toContain("numbered lists, and basic HTML styling.");
    expect(got["html.p"]).not.toContain("<strong>");
  });

  it("keeps paragraphs after a script that contains comparisons", () => {
    const got = extractHtmlIngestEntries(
      "<p>Before</p><script>if (a < b) { return a; }</script><p>After</p>",
    );
    expect(got).toMatchObject({
      "html.p": "Before",
      "html.p.2": "After",
    });
  });

  it("decodes named and numeric alt entities", () => {
    expect(extractHtmlIngestEntries(`<img alt="caf&eacute; &#233;">`)["html.img.alt"]).toBe(
      "café é",
    );
  });

  it("folds inline tags when requested", () => {
    const got = extractHtmlIngestEntries("<p>Hello <strong>world</strong>!</p>", {
      foldInline: true,
    });
    expect(Object.keys(got)).toEqual(["html.p"]);
    expect(got["html.p"]).toContain("Hello ");
    expect(got["html.p"]).toContain("world");
    expect(got["html.p"]).not.toContain("<strong>");
  });

  it("skips pre, script, style, and punctuation-only chunks", () => {
    const got = extractHtmlIngestEntries(
      "<p>Keep</p><pre>code</pre><style>p{}</style><script>x</script><p>!!!</p><p>After</p>",
    );
    expect(got).toEqual({
      "html.p": "Keep",
      "html.p.2": "After",
    });
  });
});

describe("html key shape helpers", () => {
  it("recognizes HTML source paths including .htm", () => {
    expect(isHtmlTranslationSourcePath("pages/home.html")).toBe(true);
    expect(isHtmlTranslationSourcePath("pages/home.HTM")).toBe(true);
    expect(isHtmlTranslationSourcePath("locales/en.json")).toBe(false);
  });

  it("matches hashed keys including occurrence and SRX suffixes", () => {
    expect(isHashedHtmlEntryKey("html.0123456789abcdef")).toBe(true);
    expect(isHashedHtmlEntryKey("html.0123456789abcdef.2")).toBe(true);
    expect(isHashedHtmlEntryKey("html.0123456789abcdef#srx.0")).toBe(true);
    expect(isHashedHtmlEntryKey("html.0123456789abcdef.2#srx.1")).toBe(true);
    expect(isHashedHtmlEntryKey("html.p")).toBe(false);
    expect(isHashedHtmlEntryKey("html.body.p")).toBe(false);
    expect(isHashedHtmlEntryKey("html.0123456789abcde")).toBe(false);
  });
});

describe("htmlCompletedPathKeysFromLock", () => {
  it("maps a folded CLI hash onto split path keys", () => {
    const html = "<p>Hello <strong>world</strong>!</p>";
    const folded = extractHtmlIngestEntries(html, { foldInline: true });
    const hash = legacyHtmlSegmentKey(folded["html.p"] ?? "", new Map());
    expect(htmlCompletedPathKeysFromLock(html, [hash])).toEqual(["html.p", "html.p.strong"]);
  });

  it("strips #srx suffixes and occurrence suffixes before mapping", () => {
    const html = "<p>Same</p><div>Same</div>";
    const occurrences = new Map<string, number>();
    const first = legacyHtmlSegmentKey("Same", occurrences);
    const second = legacyHtmlSegmentKey("Same", occurrences);
    expect(htmlCompletedPathKeysFromLock(html, [`${first}#srx.0`])).toEqual(["html.p"]);
    expect(htmlCompletedPathKeysFromLock(html, [second])).toEqual(["html.div"]);
  });
});

describe("htmlCliPrefillsFromPathEntries", () => {
  it("converts complete path-key prefills into a folded CLI hash", () => {
    const html = "<p>Hello <strong>world</strong>!</p>";
    const folded = extractHtmlIngestEntries(html, { foldInline: true });
    const hash = legacyHtmlSegmentKey(folded["html.p"] ?? "", new Map());
    const prefills = htmlCliPrefillsFromPathEntries(html, {
      "html.p": "Bonjour ",
      "html.p.strong": "monde",
    });
    expect(Object.keys(prefills)).toEqual([hash]);
    expect(prefills[hash]).toContain("Bonjour ");
    expect(prefills[hash]).toContain("monde");
  });

  it("omits a folded unit when any child path key is missing", () => {
    expect(
      htmlCliPrefillsFromPathEntries("<p>Hello <strong>world</strong>!</p>", {
        "html.p.strong": "monde",
      }),
    ).toEqual({});
  });

  it("keeps occurrence suffixes when only a later duplicate block is prefilled", () => {
    const html = "<p>Same</p><div>Same</div>";
    const occurrences = new Map<string, number>();
    const first = legacyHtmlSegmentKey("Same", occurrences);
    const second = legacyHtmlSegmentKey("Same", occurrences);
    const prefills = htmlCliPrefillsFromPathEntries(html, { "html.div": "Même" });
    expect(prefills[first]).toBeUndefined();
    expect(prefills[second]).toBe("Même");
  });
});

describe("utf8FromStoredFileContent", () => {
  it("decodes strings, bytes, and serialized Node buffers without Buffer", () => {
    expect(utf8FromStoredFileContent("<p>Hello</p>")).toBe("<p>Hello</p>");
    expect(utf8FromStoredFileContent(new TextEncoder().encode("<p>Hello</p>"))).toBe(
      "<p>Hello</p>",
    );
    expect(utf8FromStoredFileContent({ type: "Buffer", data: [60, 112, 62] })).toBe("<p>");
  });

  it("decodes ArrayBuffer views and drops unknown payloads", () => {
    const bytes = new TextEncoder().encode("<p>Hi</p>");
    expect(utf8FromStoredFileContent(bytes.buffer)).toBe("<p>Hi</p>");
    expect(utf8FromStoredFileContent(new DataView(bytes.buffer))).toBe("<p>Hi</p>");
    expect(utf8FromStoredFileContent({ not: "bytes" })).toBe("");
    expect(utf8FromStoredFileContent(null)).toBe("");
  });
});

describe("applyHtmlIngestEntryKeys", () => {
  it("replaces hashed sandbox keys with tag-path keys", () => {
    const html = "<html><body><h1>Welcome</h1><p>Hello world.</p></body></html>";
    const hashedTitle = legacyHtmlSegmentKey("Welcome", new Map());
    const hashedBody = legacyHtmlSegmentKey("Hello world.", new Map());

    expect(
      applyHtmlIngestEntryKeys("pages/home.html", html, {
        [hashedTitle]: "Welcome",
        [hashedBody]: "Hello world.",
      }),
    ).toEqual({
      "html.body.h1": "Welcome",
      "html.body.p": "Hello world.",
    });
  });

  it("leaves non-HTML payloads unchanged", () => {
    expect(applyHtmlIngestEntryKeys("locales/en.json", "{}", { "hello.title": "Hi" })).toEqual({
      "hello.title": "Hi",
    });
  });

  it("leaves the payload unchanged when source text is empty or has no extractable keys", () => {
    expect(applyHtmlIngestEntryKeys("pages/home.html", "", { "html.p": "Hi" })).toEqual({
      "html.p": "Hi",
    });
    expect(
      applyHtmlIngestEntryKeys("pages/home.html", "<html></html>", { "html.p": "Hi" }),
    ).toEqual({ "html.p": "Hi" });
  });

  it("returns extracted source text for hashed keys without SRX, not payload translations", () => {
    const html = "<html><body><p>Hello world.</p></body></html>";
    const hashed = legacyHtmlSegmentKey("Hello world.", new Map());
    expect(
      applyHtmlIngestEntryKeys("pages/home.html", html, {
        [hashed]: "Bonjour le monde.",
      }),
    ).toEqual({
      "html.body.p": "Hello world.",
    });
  });

  it("remaps hashed SRX payload keys onto tag paths and keeps translated values", () => {
    const html = "<html><body><p>Hello world.</p></body></html>";
    const hashed = legacyHtmlSegmentKey("Hello world.", new Map());
    expect(
      applyHtmlIngestEntryKeys("pages/home.html", html, {
        [`${hashed}#srx.0`]: "Bonjour",
        [`${hashed}#srx.1`]: "le monde.",
        leftover: "keep",
      }),
    ).toEqual({
      "html.body.p#srx.0": "Bonjour",
      "html.body.p#srx.1": "le monde.",
      leftover: "keep",
    });
  });

  it("keeps unmatched hashed SRX keys so a missing mapping cannot drop translations", () => {
    const unknown = "html.0123456789abcdef#srx.0";
    expect(
      applyHtmlIngestEntryKeys("pages/home.html", "<html><body><p>Hello world.</p></body></html>", {
        [unknown]: "Bonjour",
      }),
    ).toEqual({
      [unknown]: "Bonjour",
    });
  });
});

describe("rewriteHashedHtmlSegmentKeys", () => {
  it("rewrites a hashed key by stored hash or source text fallback", () => {
    const html = "<html><body><h1>Welcome</h1><p>Hello world.</p></body></html>";
    const hashedTitle = legacyHtmlSegmentKey("Welcome", new Map());
    expect(rewriteHashedHtmlSegmentKey(html, hashedTitle, "Welcome")).toBe("html.body.h1");
    expect(rewriteHashedHtmlSegmentKey(html, "html.deadbeefdeadbeef", "Hello world.")).toBe(
      "html.body.p",
    );
    expect(rewriteHashedHtmlSegmentKey(html, "html.deadbeefdeadbeef", "Missing")).toBe(
      "html.deadbeefdeadbeef",
    );
  });

  it("does not assign the same path key to two hashed segments", () => {
    const html = "<p>Hello</p>";
    const hashed = legacyHtmlSegmentKey("Hello", new Map());
    expect(
      rewriteHashedHtmlSegmentKeys(html, [
        { key: hashed, sourceText: "Hello" },
        { key: "html.deadbeefdeadbeef", sourceText: "Hello" },
      ]),
    ).toEqual(["html.p", "html.deadbeefdeadbeef"]);
  });
});
