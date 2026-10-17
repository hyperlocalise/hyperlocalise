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
// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { isFullHtmlDocument, serializeDesignModeDocument } from "./content-editor-html-design-mode";

describe("isFullHtmlDocument", () => {
  it("detects doctype and html roots", () => {
    expect(isFullHtmlDocument("<!DOCTYPE html><html><body></body></html>")).toBe(true);
    expect(isFullHtmlDocument("<html><body></body></html>")).toBe(true);
    expect(isFullHtmlDocument("<table><tr><td>Cell</td></tr></table>")).toBe(false);
    expect(isFullHtmlDocument("<p>Fragment</p>")).toBe(false);
  });

  it("ignores leading comments before doctype or html", () => {
    expect(isFullHtmlDocument("<!-- generated --><!DOCTYPE html><html><body></body></html>")).toBe(
      true,
    );
    expect(isFullHtmlDocument("<!-- note --><html><body></body></html>")).toBe(true);
    expect(isFullHtmlDocument("<!-- note --><p>Fragment</p>")).toBe(false);
  });
});

describe("serializeDesignModeDocument", () => {
  it("serializes body innerHTML for fragments", () => {
    document.body.innerHTML = "<p>Hello</p>";
    expect(serializeDesignModeDocument(document, false)).toBe("<p>Hello</p>");
  });

  it("includes head content for fragments parsed outside the body", () => {
    const doc = document.implementation.createHTMLDocument("");
    doc.head.innerHTML = "<style>.x{color:red}</style>";
    doc.body.innerHTML = "<p>Hi</p>";
    expect(serializeDesignModeDocument(doc, false)).toBe("<style>.x{color:red}</style><p>Hi</p>");
  });

  it("serializes documentElement for full documents", () => {
    const doc = document.implementation.createHTMLDocument("Title");
    doc.body.innerHTML = "<p>Full</p>";
    const serialized = serializeDesignModeDocument(doc, true);
    expect(serialized).toContain("<html");
    expect(serialized).toContain("<p>Full</p>");
  });

  it("preserves system-only doctypes", () => {
    const doc = new DOMParser().parseFromString(
      '<!DOCTYPE html SYSTEM "about:legacy-compat"><html><head></head><body><p>Legacy</p></body></html>',
      "text/html",
    );
    const serialized = serializeDesignModeDocument(doc, true);
    expect(serialized.startsWith('<!DOCTYPE html SYSTEM "about:legacy-compat">')).toBe(true);
  });
});
