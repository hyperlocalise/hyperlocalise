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
  brandLogotypoDarkModeSvgSrc,
  brandLogotypoLightModeSvgSrc,
  brandLogotypoSvgSrcForSurface,
  type BrandLogomarkSurface,
} from "@/lib/brand/brand-assets";
import { cn } from "@/lib/primitives/cn";

const LOGOTYPO_WIDTH = 1246;
const LOGOTYPO_HEIGHT = 231;

type BrandLogotypoProps = Omit<ImageProps, "src" | "width" | "height"> & {
  /** When set, overrides theme-based logotypo selection. */
  surface?: BrandLogomarkSurface;
  width?: number;
  height?: number;
};

export function BrandLogotypo({
  surface,
  width = LOGOTYPO_WIDTH,
  height = LOGOTYPO_HEIGHT,
  className,
  ...props
}: BrandLogotypoProps) {
  if (surface) {
    return (
      <Image
        src={brandLogotypoSvgSrcForSurface(surface)}
        width={width}
        height={height}
        className={className}
        {...props}
      />
    );
  }

  // Render both variants and let the `.dark` class pick one, so SSR markup matches every
  // theme. Both load eagerly so a theme switch never shows a blank logotypo.
  return (
    <>
      <Image
        src={brandLogotypoLightModeSvgSrc}
        width={width}
        height={height}
        loading="eager"
        className={cn("dark:hidden", className)}
        {...props}
      />
      <Image
        src={brandLogotypoDarkModeSvgSrc}
        width={width}
        height={height}
        loading="eager"
        className={cn("not-dark:hidden", className)}
        {...props}
      />
    </>
  );
}
