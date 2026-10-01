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

describe("root layout server render", () => {
  it("does not enable cache components", () => {
    const source = readFileSync(path.join(import.meta.dirname, "../../../next.config.ts"), "utf8");

    expect(source).not.toMatch(/\bcacheComponents\s*:/);
    expect(source).not.toMatch(/\bpartialPrefetching\s*:/);
  });

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

  it("resolves locale and auth while rendering the root providers", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "root-layout-providers.tsx"),
      "utf8",
    );

    expect(source).toMatch(/export async function RootLayoutProviders/);
    expect(source).toMatch(/\bgetAppLocale\b/);
    expect(source).toMatch(/\bwithAuth\b/);
    expect(source).toMatch(/\{children\}/);
    expect(source).not.toMatch(/<Suspense/);
  });

  it("awaits the locale param in the locale layout", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "../../app/[lang]/layout.tsx"),
      "utf8",
    );

    expect(source).toMatch(/export default async function LocaleLayout/);
    expect(source).toMatch(/await params/);
    expect(source).not.toMatch(/\bLocaleDocumentLangScript\b/);
    expect(source).toMatch(/return children/);
    expect(source).not.toMatch(/<Suspense/);
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
});
