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

import {
  brandLogomarkDarkModeSrc,
  brandLogomarkLightModeSrc,
  brandLogomarkSrcForSurface,
  type BrandLogomarkSurface,
} from "@/lib/brand/brand-assets";
import { cn } from "@/lib/primitives/cn";

type BrandLogomarkProps = Omit<ImageProps, "src"> & {
  /** When set, overrides theme-based logomark selection. */
  surface?: BrandLogomarkSurface;
};

export function BrandLogomark({ surface, className, ...props }: BrandLogomarkProps) {
  if (surface) {
    return <Image src={brandLogomarkSrcForSurface(surface)} className={className} {...props} />;
  }

  // Render both variants and let the `.dark` class pick one, so SSR markup matches every
  // theme. Both load eagerly so a theme switch never shows a blank mark.
  return (
    <>
      <Image
        src={brandLogomarkLightModeSrc}
        loading="eager"
        className={cn("dark:hidden", className)}
        {...props}
      />
      <Image
        src={brandLogomarkDarkModeSrc}
        loading="eager"
        className={cn("not-dark:hidden", className)}
        {...props}
      />
    </>
  );
}
