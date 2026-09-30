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

const REQUEST_DATA_RE =
  /\bgetAppLocale\b|\bgetInitialAuth\b|\bwithAuth\b|\bheaders\s*\(|\bcookies\s*\(/;

function readSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dirname, relativePath), "utf8");
}

describe("root layout cacheComponents boundary", () => {
  it("does not read request data in the root layout module", () => {
    const source = readSource("../../app/layout.tsx");

    expect(source).toMatch(/export default function RootLayout/);
    expect(source).not.toMatch(REQUEST_DATA_RE);
  });

  it("does not read request data in root providers", () => {
    expect(readSource("root-layout-providers.tsx")).not.toMatch(REQUEST_DATA_RE);
    expect(readSource("root-html.tsx")).not.toMatch(REQUEST_DATA_RE);
  });

  it("uses a static document lang in the root html shell", () => {
    const source = readSource("root-html.tsx");

    expect(source).toMatch(/\bDEFAULT_APP_LOCALE\b/);
    expect(source).toMatch(/<html lang=\{DEFAULT_APP_LOCALE\}/);
  });

  it("derives the locale layout from static route params", () => {
    const source = readSource("../../app/[lang]/layout.tsx");

    expect(source).toMatch(/export function generateStaticParams/);
    expect(source).toMatch(/\bLocaleDocumentLangScript\b/);
    expect(source).toMatch(/<I18nProvider locale=\{locale\}>/);
    expect(source).not.toMatch(REQUEST_DATA_RE);
  });

  it("keeps marketing layouts free of request data", () => {
    const source = readSource("../../app/[lang]/(marketing)/layout.tsx");

    expect(source).toMatch(/<AuthKitProvider>/);
    expect(source).not.toMatch(/initialAuth=/);
    expect(source).not.toMatch(REQUEST_DATA_RE);
  });

  it("seeds auth from the request in the authenticated layout", () => {
    expect(readSource("../../app/[lang]/(authenticated)/layout.tsx")).toMatch(
      /<RequestAuthProvider>/,
    );
  });

  it("resolves request locale for routes outside /[lang]", () => {
    expect(readSource("../../app/auth/layout.tsx")).toMatch(/<RequestLocaleProvider>/);
    expect(readSource("../../app/crowdin-app/layout.tsx")).toMatch(/<RequestLocaleProvider>/);
  });

  it("keeps request provider Suspense fallbacks free of route children", () => {
    for (const file of ["request-auth-provider.tsx", "request-locale-provider.tsx"]) {
      expect(readSource(file)).toContain("<Suspense fallback={null}>");
    }
  });

  it("defaults the color theme to light", () => {
    const source = readSource("root-layout-providers.tsx");

    expect(source).toMatch(/defaultTheme="light"/);
    expect(source).not.toMatch(/defaultTheme="dark"/);
    expect(source).not.toMatch(/\bforcedTheme\b/);
  });
});
