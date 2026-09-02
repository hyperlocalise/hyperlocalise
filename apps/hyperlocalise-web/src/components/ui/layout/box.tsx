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
  gapClassNames,
  paddingBottomClassNames,
  paddingClassNames,
  paddingEndClassNames,
  paddingStartClassNames,
  paddingTopClassNames,
  paddingXClassNames,
  paddingYClassNames,
  alignItemsClassNames,
  justifyContentClassNames,
  withoutLayoutOverrides,
} from "@/components/ui/layout/tokens";

const displayClassNames = {
  block: "block",
  flex: "flex",
  "inline-flex": "inline-flex",
  grid: "grid",
  none: "hidden",
} as const;

const flexDirectionClassNames = {
  row: "flex-row",
  column: "flex-col",
  "row-reverse": "flex-row-reverse",
  "column-reverse": "flex-col-reverse",
} as const;

const flexWrapClassNames = {
  nowrap: "flex-nowrap",
  wrap: "flex-wrap",
} as const;

const widthClassNames = {
  auto: "w-auto",
  full: "w-full",
} as const;

const heightClassNames = {
  auto: "h-auto",
  full: "h-full",
} as const;

const backgroundClassNames = {
  canvas: "bg-background",
  surface: "bg-card",
  muted: "bg-muted",
  transparent: "bg-transparent",
} as const;

const borderClassNames = {
  none: "border-0",
  standard: "border border-border",
} as const;

const borderRadiusClassNames = {
  none: "rounded-none",
  standard: "rounded-md",
  large: "rounded-2xl",
  full: "rounded-full",
} as const;

export type BoxDisplay = keyof typeof displayClassNames;
export type BoxFlexDirection = keyof typeof flexDirectionClassNames;
export type BoxFlexWrap = keyof typeof flexWrapClassNames;
export type BoxAlignItems = keyof typeof alignItemsClassNames;
export type BoxJustifyContent = keyof typeof justifyContentClassNames;
export type BoxSize = keyof typeof widthClassNames;
export type BoxBackground = keyof typeof backgroundClassNames;
export type BoxBorder = keyof typeof borderClassNames;
export type BoxBorderRadius = keyof typeof borderRadiusClassNames;

export type BoxProps = LayoutDivProps & {
  padding?: LayoutSpace;
  paddingX?: LayoutSpace;
  paddingY?: LayoutSpace;
  paddingTop?: LayoutSpace;
  paddingBottom?: LayoutSpace;
  paddingStart?: LayoutSpace;
  paddingEnd?: LayoutSpace;
  display?: BoxDisplay;
  flexDirection?: BoxFlexDirection;
  flexWrap?: BoxFlexWrap;
  alignItems?: BoxAlignItems;
  justifyContent?: BoxJustifyContent;
  gap?: LayoutSpace;
  width?: BoxSize;
  height?: BoxSize;
  background?: BoxBackground;
  border?: BoxBorder;
  borderRadius?: BoxBorderRadius;
};

function Box({
  padding,
  paddingX,
  paddingY,
  paddingTop,
  paddingBottom,
  paddingStart,
  paddingEnd,
  display,
  flexDirection,
  flexWrap,
  alignItems,
  justifyContent,
  gap,
  width,
  height,
  background,
  border,
  borderRadius,
  ...props
}: BoxProps) {
  return (
    <div
      {...withoutLayoutOverrides(props)}
      data-slot="box"
      className={cn(
        display ? displayClassNames[display] : undefined,
        flexDirection ? flexDirectionClassNames[flexDirection] : undefined,
        flexWrap ? flexWrapClassNames[flexWrap] : undefined,
        alignItems ? alignItemsClassNames[alignItems] : undefined,
        justifyContent ? justifyContentClassNames[justifyContent] : undefined,
        gap ? gapClassNames[gap] : undefined,
        padding ? paddingClassNames[padding] : undefined,
        paddingX ? paddingXClassNames[paddingX] : undefined,
        paddingY ? paddingYClassNames[paddingY] : undefined,
        paddingTop ? paddingTopClassNames[paddingTop] : undefined,
        paddingBottom ? paddingBottomClassNames[paddingBottom] : undefined,
        paddingStart ? paddingStartClassNames[paddingStart] : undefined,
        paddingEnd ? paddingEndClassNames[paddingEnd] : undefined,
        width ? widthClassNames[width] : undefined,
        height ? heightClassNames[height] : undefined,
        background ? backgroundClassNames[background] : undefined,
        border ? borderClassNames[border] : undefined,
        borderRadius ? borderRadiusClassNames[borderRadius] : undefined,
      )}
    />
  );
}

export { Box };
