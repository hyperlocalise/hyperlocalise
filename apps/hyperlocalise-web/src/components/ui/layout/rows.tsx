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
  withoutLayoutOverrides,
} from "@/components/ui/layout/tokens";

export type RowsAlign = "start" | "center" | "end" | "stretch";

export type RowsProps = LayoutDivProps & {
  spacing: LayoutSpace;
  align?: RowsAlign;
};

function Rows({ spacing, align = "stretch", ...props }: RowsProps) {
  return (
    <div
      {...withoutLayoutOverrides(props)}
      data-slot="rows"
      className={cn("flex flex-col", gapClassNames[spacing], alignItemsClassNames[align])}
    />
  );
}

export { Rows };
