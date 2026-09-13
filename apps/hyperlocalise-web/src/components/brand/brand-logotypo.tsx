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
  brandLogotypoSvgSrcForSurface,
  brandLogotypoSvgSrcForTheme,
  type BrandLogomarkSurface,
} from "@/lib/brand/brand-assets";

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
  ...props
}: BrandLogotypoProps) {
  const { resolvedTheme } = useTheme();
  const src = surface
    ? brandLogotypoSvgSrcForSurface(surface)
    : brandLogotypoSvgSrcForTheme(resolvedTheme);

  return <Image src={src} width={width} height={height} {...props} />;
}
