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
  justifyContentClassNames,
  withoutLayoutOverrides,
} from "@/components/ui/layout/tokens";

export type RowAlign = keyof typeof justifyContentClassNames;
export type RowAlignY = keyof typeof alignItemsClassNames;

export type RowProps = LayoutDivProps & {
  spacing: LayoutSpace;
  align?: RowAlign;
  alignY?: RowAlignY;
};

function Row({ spacing, align = "start", alignY = "stretch", ...props }: RowProps) {
  return (
    <div
      {...withoutLayoutOverrides(props)}
      data-slot="row"
      className={cn(
        "flex w-full min-w-0",
        gapClassNames[spacing],
        justifyContentClassNames[align],
        alignItemsClassNames[alignY],
      )}
    />
  );
}

export { Row };
