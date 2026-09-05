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
  it("does not read request data in the root layout module", () => {
    const source = readFileSync(path.join(import.meta.dirname, "../../app/layout.tsx"), "utf8");

    expect(source).toMatch(/export default function RootLayout/);
    expect(source).not.toMatch(/\bgetAppLocale\b|\bgetInitialAuth\b|\bwithAuth\b/);
    expect(source).not.toMatch(/\bheaders\s*\(|\bcookies\s*\(/);
  });

  it("resolves document lang outside the root layout module", () => {
    const source = readFileSync(path.join(import.meta.dirname, "root-html.tsx"), "utf8");

    expect(source).toMatch(/\bgetAppLocale\b/);
    expect(source).toMatch(/<html lang=\{locale\}/);
  });

  it("keeps the root Suspense fallback free of route children", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "root-layout-providers.tsx"),
      "utf8",
    );
    const fallbackFn = source.match(
      /function RootLayoutProvidersFallback\([\s\S]*?\n\}/,
    )?.[0];

    expect(source).toContain(
      "<Suspense fallback={<RootLayoutProvidersFallback locale={locale} />}>",
    );
    expect(fallbackFn).toBeDefined();
    expect(fallbackFn).not.toContain("{children}");
  });
});
