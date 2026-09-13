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
import Image, { type ImageProps } from "next/image";
import { useTheme } from "next-themes";

import {
  brandLogomarkSrcForSurface,
  brandLogomarkSrcForTheme,
  type BrandLogomarkSurface,
} from "@/lib/brand/brand-assets";

type BrandLogomarkProps = Omit<ImageProps, "src"> & {
  /** When set, overrides theme-based logomark selection. */
  surface?: BrandLogomarkSurface;
};

export function BrandLogomark({ surface, ...props }: BrandLogomarkProps) {
  const { resolvedTheme } = useTheme();
  const src = surface
    ? brandLogomarkSrcForSurface(surface)
    : brandLogomarkSrcForTheme(resolvedTheme);

  return <Image src={src} {...props} />;
}
