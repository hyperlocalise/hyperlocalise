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
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

describe("root layout cacheComponents boundary", () => {
  it("sets document lang from the request locale on the root html element", () => {
    const layoutSource = readFileSync(
      path.join(import.meta.dirname, "../../app/layout.tsx"),
      "utf8",
    );
    const htmlSource = readFileSync(path.join(import.meta.dirname, "root-html.tsx"), "utf8");

    expect(layoutSource).toMatch(/export default async function RootLayout/);
    expect(layoutSource).toMatch(/\bgetAppLocale\b/);
    expect(layoutSource).toMatch(/\bappLocaleToBcp47Tag\b/);
    expect(layoutSource).not.toMatch(/\bgetInitialAuth\b|\bwithAuth\b/);
    expect(htmlSource).toMatch(/<html lang=\{htmlLang\}/);
    expect(htmlSource).not.toMatch(/<html lang=\{DEFAULT_APP_LOCALE\}/);
  });

  it("validates locale route params without request I/O in the locale layout", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "../../app/[lang]/layout.tsx"),
      "utf8",
    );

    expect(source).toMatch(/export default async function LocaleLayout/);
    expect(source).not.toMatch(/\bLocaleDocumentLangScript\b/);
    expect(source).not.toMatch(/\bheaders\s*\(|\bcookies\s*\(/);
  });

  it("resolves request locale inside the root Suspense boundary", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "root-layout-providers.tsx"),
      "utf8",
    );

    expect(source).toMatch(/\bgetAppLocale\b/);
    expect(source).toMatch(/<Suspense fallback={<RootLayoutProvidersFallback/);
  });

  it("defaults the color theme to light", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "root-layout-providers.tsx"),
      "utf8",
    );

    expect(source).toMatch(/defaultTheme="light"/);
    expect(source).not.toMatch(/defaultTheme="dark"/);
    expect(source).not.toMatch(/\bforcedTheme\b/);
  });

  it("keeps the root Suspense fallback free of route children", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "root-layout-providers.tsx"),
      "utf8",
    );
    const fallbackFn = source.match(/function RootLayoutProvidersFallback\([\s\S]*?\n\}/)?.[0];

    expect(source).toContain("<Suspense fallback={<RootLayoutProvidersFallback />}>");
    expect(fallbackFn).toBeDefined();
    expect(fallbackFn).not.toContain("{children}");
  });
});
