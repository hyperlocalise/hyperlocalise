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
import type { SVGProps } from "react";
import type { SimpleIcon } from "simple-icons";

import { cn } from "@/lib/primitives/cn";

type SimpleBrandIconProps = SVGProps<SVGSVGElement> & {
  icon: SimpleIcon;
  colored: boolean;
};

function isNearBlackBrandHex(hex: string) {
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) {
    return false;
  }

  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  // Relative luminance; Notion/GitHub brand fills are near-black and vanish on dark UI.
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 40;
}

export function SimpleBrandIcon({ icon, colored, className, ...props }: SimpleBrandIconProps) {
  const useThemeForeground = colored && isNearBlackBrandHex(icon.hex);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={cn("size-5", useThemeForeground && "fill-foreground", className)}
      fill={useThemeForeground ? undefined : colored ? `#${icon.hex}` : "currentColor"}
      opacity={colored ? 1 : 0.72}
      {...props}
    >
      <path d={icon.path} />
    </svg>
  );
}
