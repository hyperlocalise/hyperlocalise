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
import type * as React from "react";

import { cn } from "@/lib/primitives/cn";
import {
  type LayoutDivProps,
  type LayoutSpace,
  alignItemsClassNames,
  gapClassNames,
  justifyContentClassNames,
  spaceCssValues,
  withoutLayoutOverrides,
} from "@/components/ui/layout/tokens";

export type ColumnsAlign = keyof typeof justifyContentClassNames;
export type ColumnsAlignY = keyof typeof alignItemsClassNames;
export type ColumnsHeight = "unset" | "full";
export type ColumnsCollapseBelow = "small" | "medium" | "large";

export type ColumnsProps = LayoutDivProps & {
  spacing: LayoutSpace;
  align?: ColumnsAlign;
  alignY?: ColumnsAlignY;
  height?: ColumnsHeight;
  reversed?: boolean;
  collapseBelow?: ColumnsCollapseBelow;
};

const heightClassNames = {
  unset: undefined,
  full: "h-full",
} as const;

const collapseBelowClassNames = {
  small:
    "max-sm:flex-col max-sm:[&>[data-slot=column]]:w-full max-sm:[&>[data-slot=column]]:flex-none max-sm:[&>[data-slot=column]]:basis-auto",
  medium:
    "max-md:flex-col max-md:[&>[data-slot=column]]:w-full max-md:[&>[data-slot=column]]:flex-none max-md:[&>[data-slot=column]]:basis-auto",
  large:
    "max-lg:flex-col max-lg:[&>[data-slot=column]]:w-full max-lg:[&>[data-slot=column]]:flex-none max-lg:[&>[data-slot=column]]:basis-auto",
} as const;

function Columns({
  spacing,
  align = "start",
  alignY = "stretch",
  height = "unset",
  reversed = false,
  collapseBelow,
  ...props
}: ColumnsProps) {
  return (
    <div
      {...withoutLayoutOverrides(props)}
      data-slot="columns"
      className={cn(
        "flex w-full min-w-0",
        reversed ? "flex-row-reverse" : "flex-row",
        gapClassNames[spacing],
        justifyContentClassNames[align],
        alignItemsClassNames[alignY],
        heightClassNames[height],
        collapseBelow ? collapseBelowClassNames[collapseBelow] : undefined,
      )}
      style={{ "--layout-columns-gap": spaceCssValues[spacing] } as React.CSSProperties}
    />
  );
}

export { Columns };
