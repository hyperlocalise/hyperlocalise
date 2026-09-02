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
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BrandThemeProvider, useBrandTheme } from "./brand-theme";
import { TypographyH1 } from "./typography";

function ThemeProbe() {
  const theme = useBrandTheme();
  return React.createElement("span", { "data-theme": theme }, theme);
}

describe("BrandThemeProvider", () => {
  it("marks the subtree as the marketing theme", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        BrandThemeProvider,
        { theme: "marketing" },
        React.createElement(TypographyH1, {}, "Ship globally"),
      ),
    );

    expect(markup).toContain('data-slot="brand-theme"');
    expect(markup).toContain('data-brand-theme="marketing"');
    expect(markup).toContain("font-heading");
    expect(markup).toContain("Ship globally");
  });

  it("marks the subtree as the product theme", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        BrandThemeProvider,
        { theme: "product" },
        React.createElement(ThemeProbe),
      ),
    );

    expect(markup).toContain('data-brand-theme="product"');
    expect(markup).toContain('data-theme="product"');
    expect(markup).toContain("product</span>");
  });

  it("throws when useBrandTheme is used outside a provider", () => {
    expect(() => renderToStaticMarkup(React.createElement(ThemeProbe))).toThrow(
      "useBrandTheme must be used within a BrandThemeProvider.",
    );
  });
});
