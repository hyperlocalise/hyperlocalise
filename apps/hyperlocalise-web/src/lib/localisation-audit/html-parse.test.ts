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

import { parsePageSignals } from "./html-parse";

describe("parsePageSignals", () => {
  it("extracts lang, title, hreflang, anchors, and visible text", () => {
    const signals = parsePageSignals(`
      <html lang=" fr-FR ">
        <head>
          <title>  Pricing &amp; Plans  </title>
          <link rel="alternate stylesheet" href="/theme.css" />
          <link rel="alternate" hreflang="en" href="https://example.com/en" />
          <link rel="alternate" hreflang=" x-default " href=" https://example.com/ " />
          <script>window.__SECRET__ = "skip me"</script>
          <style>.hidden { color: red }</style>
        </head>
        <body>
          <p>Hello   world</p>
          <a href=" /pricing ">View   pricing</a>
          <noscript>enable JS</noscript>
        </body>
      </html>
    `);

    expect(signals.htmlLang).toBe("fr-FR");
    expect(signals.title).toBe("Pricing & Plans");
    expect(signals.hreflang).toEqual([
      { locale: "en", href: "https://example.com/en" },
      { locale: "x-default", href: "https://example.com/" },
    ]);
    expect(signals.anchors).toEqual([{ href: "/pricing", text: "View pricing" }]);
    expect(signals.textSample).toContain("Hello world");
    expect(signals.textSample).toContain("View pricing");
    expect(signals.textSample).not.toContain("__SECRET__");
    expect(signals.textSample).not.toContain("enable JS");
    expect(signals.textSample).not.toContain("color: red");
  });

  it("truncates long text samples with an ellipsis", () => {
    const longText = "word ".repeat(1_200);
    const signals = parsePageSignals(`<html><body><p>${longText}</p></body></html>`);

    expect(signals.textSample.length).toBe(4_001);
    expect(signals.textSample.endsWith("…")).toBe(true);
  });

  it("caps collected anchors and ignores anchors without href", () => {
    const links = Array.from(
      { length: 85 },
      (_, index) => `<a href="/p/${index}">P${index}</a>`,
    ).join("");
    const signals = parsePageSignals(`<html><body>${links}<a>no href</a></body></html>`);

    expect(signals.anchors).toHaveLength(80);
    expect(signals.anchors[0]).toEqual({ href: "/p/0", text: "P0" });
    expect(signals.anchors[79]).toEqual({ href: "/p/79", text: "P79" });
  });
});
