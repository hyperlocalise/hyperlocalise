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
import { SITE_URL } from "@/lib/seo/site-url";

export const BRAND_LOGO_PATH = "/images/logo";

export const brandLogomarkDarkModePngSrc = `${BRAND_LOGO_PATH}/logomark-dark-mode.png`;
export const brandLogomarkLightModePngSrc = `${BRAND_LOGO_PATH}/logomark-light-mode.png`;
export const brandLogomarkDarkModeSvgSrc = `${BRAND_LOGO_PATH}/logomark-dark-mode.svg`;
export const brandLogomarkLightModeSvgSrc = `${BRAND_LOGO_PATH}/logomark-light-mode.svg`;

export const brandLogomarkDarkModeSrc = brandLogomarkDarkModeSvgSrc;
export const brandLogomarkLightModeSrc = brandLogomarkLightModeSvgSrc;
export const brandLogotypoDarkModeSrc = `${BRAND_LOGO_PATH}/logotypo-dark-mode.png`;
export const brandLogotypoLightModeSrc = `${BRAND_LOGO_PATH}/logotypo-light-mode.png`;
export const brandLogotypoDarkModeSvgSrc = `${BRAND_LOGO_PATH}/logotypo-dark-mode.svg`;
export const brandLogotypoLightModeSvgSrc = `${BRAND_LOGO_PATH}/logotypo-light-mode.svg`;

/** Canonical logotypo SVG (dark-mode variant). */
export const brandLogotypoSvgSrc = brandLogotypoDarkModeSvgSrc;

/** Canonical logomark asset (dark-mode variant). */
export const brandLogomarkSrc = brandLogomarkDarkModeSrc;

export const brandLogomarkAbsoluteUrl = `${SITE_URL}${brandLogomarkSrc}`;

/** SVG viewBox dimensions used for lockup optical alignment. */
export const BRAND_LOGOMARK_VIEWBOX_SIZE = 264;
export const BRAND_LOGOTYPO_VIEWBOX_HEIGHT = 231;

/** Ink bounds in each asset's viewBox (see public/images/logo/*.svg). */
export const BRAND_LOGOMARK_INK_TOP = 51.909;
export const BRAND_LOGOMARK_INK_BOTTOM = 211.438;
export const BRAND_LOGOTYPO_INK_TOP = 0;
export const BRAND_LOGOTYPO_INK_BOTTOM = 231;

/** `translateY` for the logomark so its ink top lines up with the logotypo ink top. */
export function brandLockupMarkTranslateYPx(markSize: number, typHeight: number): number {
  const typInkPx = (BRAND_LOGOTYPO_INK_TOP / BRAND_LOGOTYPO_VIEWBOX_HEIGHT) * typHeight;
  const markInkPx = (BRAND_LOGOMARK_INK_TOP / BRAND_LOGOMARK_VIEWBOX_SIZE) * markSize;
  return typInkPx - markInkPx;
}

export function brandLockupInkHeightPx(markSize: number, typHeight: number): number {
  const markInkPx =
    ((BRAND_LOGOMARK_INK_BOTTOM - BRAND_LOGOMARK_INK_TOP) / BRAND_LOGOMARK_VIEWBOX_SIZE) * markSize;
  const typInkPx =
    ((BRAND_LOGOTYPO_INK_BOTTOM - BRAND_LOGOTYPO_INK_TOP) / BRAND_LOGOTYPO_VIEWBOX_HEIGHT) *
    typHeight;
  return Math.max(markInkPx, typInkPx);
}

/** Layout box for the lockup so flex `items-center` matches visible ink, not SVG padding. */
export function brandLockupLayoutHeightPx(markSize: number, typHeight: number): number {
  const markTranslateY = brandLockupMarkTranslateYPx(markSize, typHeight);
  const markLiftPadding = markTranslateY < 0 ? -markTranslateY : 0;
  return markLiftPadding + brandLockupInkHeightPx(markSize, typHeight);
}

export type BrandLogomarkSurface = "default" | "light" | "dark";

/**
 * `light` / `dark` refer to the UI background the mark sits on (not the asset filename).
 * Filenames follow theme naming: dark-mode asset for dark UI, light-mode asset for light UI.
 */
export function brandLogomarkSrcForSurface(surface: BrandLogomarkSurface): string {
  switch (surface) {
    case "light":
      return brandLogomarkLightModeSvgSrc;
    case "dark":
      return brandLogomarkDarkModeSvgSrc;
    default:
      return brandLogomarkSrc;
  }
}

export function brandLogomarkSrcForTheme(resolvedTheme: string | undefined): string {
  if (resolvedTheme === "dark") {
    return brandLogomarkDarkModeSvgSrc;
  }
  if (resolvedTheme === "light") {
    return brandLogomarkLightModeSvgSrc;
  }
  return brandLogomarkSrc;
}

export function brandLogotypoSvgSrcForSurface(surface: BrandLogomarkSurface): string {
  switch (surface) {
    case "light":
      return brandLogotypoLightModeSvgSrc;
    case "dark":
      return brandLogotypoDarkModeSvgSrc;
    default:
      return brandLogotypoSvgSrc;
  }
}

export function brandLogotypoSvgSrcForTheme(resolvedTheme: string | undefined): string {
  if (resolvedTheme === "dark") {
    return brandLogotypoDarkModeSvgSrc;
  }
  if (resolvedTheme === "light") {
    return brandLogotypoLightModeSvgSrc;
  }
  return brandLogotypoSvgSrc;
}
