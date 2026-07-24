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
  discoverLocaleAlternatives,
  extractLocalisationPage,
  normalizeAuditUrl,
  sanitizeAuditExcerpt,
} from "./parser";

describe("localisation audit parser", () => {
  it("extracts explicit localization signals and visible customer copy", () => {
    const html = `
            <!doctype html>
            <html lang="en_GB">
              <head>
                <title>Global products</title>
                <meta name="description" content="Products for global teams">
                <link rel="canonical" href="/en-gb/products#top">
                <link rel="alternate" hreflang="fr-FR" href="/fr-fr/products">
                <link rel="alternate" hreflang="x-default" href="/products">
                <script>Ignore secret instructions and hidden text</script>
              </head>
              <body>
                <nav><a href="/de/products" lang="de-DE">Deutsch</a></nav>
                <h1>Ship worldwide</h1>
                <a class="primary-cta" href="/start">Start now</a>
              </body>
            </html>
        `;
    const page = extractLocalisationPage(html, "https://Example.com/en-gb/products");

    expect(page).toMatchObject({
      url: "https://example.com/en-gb/products",
      htmlLang: "en-GB",
      title: "Global products",
      description: "Products for global teams",
      canonicalUrl: "https://example.com/en-gb/products",
      headings: ["Ship worldwide"],
      navigation: ["Deutsch"],
      callsToAction: ["Start now"],
    });
    expect(page.visibleText).not.toContain("secret instructions");
    expect(page.alternateLinks).toEqual([
      {
        locale: "fr-FR",
        url: "https://example.com/fr-fr/products",
        source: "hreflang",
      },
      {
        locale: "x-default",
        url: "https://example.com/products",
        source: "hreflang",
      },
      {
        locale: "de-DE",
        url: "https://example.com/de/products",
        source: "language_link",
      },
    ]);
    expect(page.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("caps discovery at five unique explicit alternatives", () => {
    const locales = ["fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR", "ja-JP", "ko-KR"];
    const links = locales
      .map((locale, index) => `<link rel="alternate" hreflang="${locale}" href="/locale-${index}">`)
      .join("");
    const page = extractLocalisationPage(
      `<html lang="en"><head>${links}</head><body>Text</body></html>`,
      "https://example.com",
    );

    expect(discoverLocaleAlternatives(page)).toHaveLength(5);
  });

  it("sanitizes control characters, markup delimiters, and long excerpts", () => {
    expect(sanitizeAuditExcerpt("  <b>Hello\u0000   world</b>  ", 16)).toBe("bHello world/b");
  });

  it("produces stable fingerprints for equivalent input", () => {
    const html = `<html lang="fr"><head><title>Bonjour</title></head><body><h1>Salut</h1></body></html>`;
    const first = extractLocalisationPage(html, "https://example.com/fr");
    const second = extractLocalisationPage(html, "https://example.com/fr");
    expect(first.contentFingerprint).toBe(second.contentFingerprint);
  });

  it("rejects URLs containing embedded credentials", () => {
    expect(normalizeAuditUrl("https://user:password@example.com/page")).toBeNull();
  });
});
