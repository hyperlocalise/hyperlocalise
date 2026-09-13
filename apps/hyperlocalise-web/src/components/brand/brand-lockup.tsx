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
import {
  brandLockupInkHeightPx,
  brandLockupLayoutHeightPx,
  brandLockupMarkTranslateYPx,
  type BrandLogomarkSurface,
} from "@/lib/brand/brand-assets";
import { cn } from "@/lib/primitives/cn";

import { BrandLogomark } from "./brand-logomark";
import { BrandLogotypo } from "./brand-logotypo";

type BrandLockupProps = {
  logoAlt: string;
  markSize?: number;
  typHeight?: number;
  className?: string;
  markClassName?: string;
  typClassName?: string;
  surface?: BrandLogomarkSurface;
};

export function BrandLockup({
  logoAlt,
  markSize = 28,
  typHeight,
  className,
  markClassName,
  typClassName,
  surface,
}: BrandLockupProps) {
  const resolvedTypHeight = typHeight ?? Math.round(markSize * 0.72);
  const markTranslateY = brandLockupMarkTranslateYPx(markSize, resolvedTypHeight);
  const markLiftPadding = markTranslateY < 0 ? -markTranslateY : 0;
  const inkHeightPx = brandLockupInkHeightPx(markSize, resolvedTypHeight);
  const layoutHeightPx = brandLockupLayoutHeightPx(markSize, resolvedTypHeight);

  return (
    <div
      className={cn("inline-flex min-w-0 flex-col overflow-visible", className)}
      style={{
        boxSizing: "border-box",
        height: layoutHeightPx,
        paddingTop: markLiftPadding > 0 ? markLiftPadding : undefined,
      }}
    >
      <div
        className="flex min-w-0 items-start gap-2 overflow-visible"
        style={{ height: inkHeightPx }}
      >
        <BrandLogomark
          surface={surface}
          width={markSize}
          height={markSize}
          sizes={`${markSize}px`}
          alt={logoAlt}
          style={
            markTranslateY !== 0 ? { transform: `translateY(${markTranslateY}px)` } : undefined
          }
          className={cn("block shrink-0 object-contain object-top", markClassName)}
        />
        <BrandLogotypo
          surface={surface}
          alt=""
          aria-hidden
          sizes="128px"
          style={{ height: resolvedTypHeight }}
          className={cn(
            "block w-auto max-w-[10rem] shrink min-w-0 object-contain object-left object-top",
            typClassName,
          )}
        />
      </div>
    </div>
  );
}
