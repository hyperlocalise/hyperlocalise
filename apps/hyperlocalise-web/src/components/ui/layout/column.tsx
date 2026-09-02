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
  COLUMNS_GAP_CUSTOM_PROPERTY,
  type LayoutDivProps,
  alignSelfClassNames,
  withoutLayoutOverrides,
} from "@/components/ui/layout/tokens";

export type ColumnWidth =
  | "fluid"
  | "content"
  | "containedContent"
  | "1/2"
  | "1/3"
  | "2/3"
  | "1/4"
  | "2/4"
  | "3/4"
  | "1/5"
  | "2/5"
  | "3/5"
  | "4/5"
  | "1/6"
  | "2/6"
  | "3/6"
  | "4/6"
  | "5/6"
  | "1/12"
  | "2/12"
  | "3/12"
  | "4/12"
  | "5/12"
  | "6/12"
  | "7/12"
  | "8/12"
  | "9/12"
  | "10/12"
  | "11/12";

export type ColumnAlignY = keyof typeof alignSelfClassNames;

export type ColumnProps = LayoutDivProps & {
  width?: ColumnWidth;
  alignY?: ColumnAlignY;
};

const namedWidthClassNames = {
  fluid: "min-w-0 flex-1",
  content: "w-auto shrink-0 grow-0",
  containedContent: "w-fit max-w-full shrink-0 grow-0",
} as const;

function isNamedWidth(width: ColumnWidth): width is keyof typeof namedWidthClassNames {
  return width === "fluid" || width === "content" || width === "containedContent";
}

function fractionalFlexBasis(width: ColumnWidth): string | undefined {
  if (isNamedWidth(width)) {
    return undefined;
  }

  const [numerator, denominator] = width.split("/").map(Number);
  const fraction = numerator / denominator;

  return `calc(${fraction * 100}% - var(${COLUMNS_GAP_CUSTOM_PROPERTY}) * ${1 - fraction})`;
}

function Column({ width = "fluid", alignY = "stretch", ...props }: ColumnProps) {
  const flexBasis = fractionalFlexBasis(width);

  return (
    <div
      {...withoutLayoutOverrides(props)}
      data-slot="column"
      data-width={width}
      className={cn(
        isNamedWidth(width) ? namedWidthClassNames[width] : "min-w-0 shrink-0 grow-0",
        alignSelfClassNames[alignY],
      )}
      style={flexBasis ? { flexBasis } : undefined}
    />
  );
}

export { Column };
