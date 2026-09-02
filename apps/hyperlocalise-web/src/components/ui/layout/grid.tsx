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
import { cn } from "@/lib/primitives/cn";
import {
  type LayoutDivProps,
  type LayoutSpace,
  alignItemsClassNames,
  gapClassNames,
  gapXClassNames,
  gapYClassNames,
  justifyItemsClassNames,
  withoutLayoutOverrides,
} from "@/components/ui/layout/tokens";

export type GridColumns = 1 | 2 | 3 | 4 | 5 | 6;
export type GridAlign = keyof typeof justifyItemsClassNames;
export type GridAlignY = "stretch" | "start" | "center" | "end";

export type GridProps = LayoutDivProps & {
  columns: GridColumns;
  spacing?: LayoutSpace;
  spacingX?: LayoutSpace;
  spacingY?: LayoutSpace;
  alignX?: GridAlign;
  alignY?: GridAlignY;
};

const columnsClassNames = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
} as const;

function Grid({
  columns,
  spacing,
  spacingX,
  spacingY,
  alignX = "stretch",
  alignY = "stretch",
  ...props
}: GridProps) {
  return (
    <div
      {...withoutLayoutOverrides(props)}
      data-slot="grid"
      className={cn(
        "grid w-full min-w-0",
        columnsClassNames[columns],
        spacing ? gapClassNames[spacing] : undefined,
        spacingX ? gapXClassNames[spacingX] : undefined,
        spacingY ? gapYClassNames[spacingY] : undefined,
        justifyItemsClassNames[alignX],
        alignItemsClassNames[alignY],
      )}
    />
  );
}

export { Grid };
