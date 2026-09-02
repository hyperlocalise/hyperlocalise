"use client";

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
import * as React from "react";

import { cn } from "@/lib/primitives/cn";

export const BRAND_THEMES = ["marketing", "product"] as const;

export type BrandTheme = (typeof BRAND_THEMES)[number];

const BrandThemeContext = React.createContext<BrandTheme | null>(null);

function BrandThemeProvider({
  theme,
  className,
  ...props
}: React.ComponentProps<"div"> & { theme: BrandTheme }) {
  return (
    <BrandThemeContext.Provider value={theme}>
      <div data-slot="brand-theme" data-brand-theme={theme} className={cn(className)} {...props} />
    </BrandThemeContext.Provider>
  );
}

function useBrandTheme() {
  const theme = React.useContext(BrandThemeContext);

  if (theme == null) {
    throw new Error("useBrandTheme must be used within a BrandThemeProvider.");
  }

  return theme;
}

export { BrandThemeProvider, useBrandTheme };
