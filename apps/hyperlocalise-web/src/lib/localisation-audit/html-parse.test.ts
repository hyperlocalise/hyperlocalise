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

  it("extracts canonical, Open Graph, JSON-LD, dir, and accessibility samples", () => {
    const signals = parsePageSignals(`
      <html lang="fr-FR" dir="ltr">
        <head>
          <title>Tarifs</title>
          <link rel="canonical" href="https://example.com/fr/pricing" />
          <meta name="description" content="Plans en euros" />
          <meta property="og:title" content="Tarifs Hyperlocalise" />
          <meta property="og:description" content="Essayez gratuitement" />
          <meta property="og:locale" content="fr_FR" />
          <script type="application/ld+json">
            {"@type":"WebPage","inLanguage":"fr-FR","name":"Tarifs"}
          </script>
          <style>body { font-family: "Noto Sans", sans-serif; }</style>
        </head>
        <body>
          <h1>Nos tarifs</h1>
          <button>Commencer</button>
          <img src="/hero-fr.png" alt="Tableau de bord en français" />
          <a href="/de/pricing" aria-label="Deutsch">DE</a>
        </body>
      </html>
    `);

    expect(signals.canonical).toBe("https://example.com/fr/pricing");
    expect(signals.metaDescription).toBe("Plans en euros");
    expect(signals.ogTitle).toBe("Tarifs Hyperlocalise");
    expect(signals.ogDescription).toBe("Essayez gratuitement");
    expect(signals.ogLocale).toBe("fr_FR");
    expect(signals.dir).toBe("ltr");
    expect(signals.jsonLd).toEqual([{ type: "WebPage", inLanguage: "fr-FR" }]);
    expect(signals.headings).toEqual(["Nos tarifs"]);
    expect(signals.buttons).toEqual(["Commencer"]);
    expect(signals.altTexts).toEqual([{ alt: "Tableau de bord en français", src: "/hero-fr.png" }]);
    expect(signals.ariaLabels).toEqual(["Deutsch"]);
    expect(signals.fontFamilies).toContain("Noto Sans");
  });

  it("extracts word-break CSS and Western name form fields", () => {
    const signals = parsePageSignals(`
      <html lang="ko">
        <head>
          <style>
            body { font-family: "Malgun Gothic", sans-serif; word-break: break-all; }
            p { line-break: strict; }
          </style>
        </head>
        <body>
          <label>First name</label>
          <input name="last_name" placeholder="Last name" autocomplete="family-name" />
          <p>한국어 본문 □</p>
        </body>
      </html>
    `);

    expect(signals.wordBreakValues).toContain("break-all");
    expect(signals.lineBreakValues).toContain("strict");
    expect(signals.fontFamilies).toContain("Malgun Gothic");
    expect(signals.formFieldLabels).toEqual(
      expect.arrayContaining(["First name", "last_name", "Last name", "family-name"]),
    );
    expect(signals.textSample).toContain("한국어");
    expect(signals.textSample).toContain("□");
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
