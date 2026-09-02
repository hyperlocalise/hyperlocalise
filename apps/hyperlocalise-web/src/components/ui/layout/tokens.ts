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

export type LayoutDivProps = Omit<React.ComponentProps<"div">, "className" | "style">;

export function withoutLayoutOverrides<T extends object>(props: T): T {
  const {
    className: _className,
    style: _style,
    ...rest
  } = props as T & {
    className?: unknown;
    style?: unknown;
  };
  return rest as T;
}

export const layoutSpaces = [
  "0",
  "0.5u",
  "1u",
  "1.5u",
  "2u",
  "3u",
  "4u",
  "6u",
  "8u",
  "12u",
] as const;

export type LayoutSpace = (typeof layoutSpaces)[number];

export const COLUMNS_GAP_CUSTOM_PROPERTY = "--layout-columns-gap";

export const spaceCssValues = {
  "0": "0px",
  "0.5u": "0.25rem",
  "1u": "0.5rem",
  "1.5u": "0.75rem",
  "2u": "1rem",
  "3u": "1.5rem",
  "4u": "2rem",
  "6u": "3rem",
  "8u": "4rem",
  "12u": "6rem",
} as const satisfies Record<LayoutSpace, string>;

export const gapClassNames = {
  "0": "gap-0",
  "0.5u": "gap-1",
  "1u": "gap-2",
  "1.5u": "gap-3",
  "2u": "gap-4",
  "3u": "gap-6",
  "4u": "gap-8",
  "6u": "gap-12",
  "8u": "gap-16",
  "12u": "gap-24",
} as const satisfies Record<LayoutSpace, string>;

export const gapXClassNames = {
  "0": "gap-x-0",
  "0.5u": "gap-x-1",
  "1u": "gap-x-2",
  "1.5u": "gap-x-3",
  "2u": "gap-x-4",
  "3u": "gap-x-6",
  "4u": "gap-x-8",
  "6u": "gap-x-12",
  "8u": "gap-x-16",
  "12u": "gap-x-24",
} as const satisfies Record<LayoutSpace, string>;

export const gapYClassNames = {
  "0": "gap-y-0",
  "0.5u": "gap-y-1",
  "1u": "gap-y-2",
  "1.5u": "gap-y-3",
  "2u": "gap-y-4",
  "3u": "gap-y-6",
  "4u": "gap-y-8",
  "6u": "gap-y-12",
  "8u": "gap-y-16",
  "12u": "gap-y-24",
} as const satisfies Record<LayoutSpace, string>;

export const paddingClassNames = {
  "0": "p-0",
  "0.5u": "p-1",
  "1u": "p-2",
  "1.5u": "p-3",
  "2u": "p-4",
  "3u": "p-6",
  "4u": "p-8",
  "6u": "p-12",
  "8u": "p-16",
  "12u": "p-24",
} as const satisfies Record<LayoutSpace, string>;

export const paddingXClassNames = {
  "0": "px-0",
  "0.5u": "px-1",
  "1u": "px-2",
  "1.5u": "px-3",
  "2u": "px-4",
  "3u": "px-6",
  "4u": "px-8",
  "6u": "px-12",
  "8u": "px-16",
  "12u": "px-24",
} as const satisfies Record<LayoutSpace, string>;

export const paddingYClassNames = {
  "0": "py-0",
  "0.5u": "py-1",
  "1u": "py-2",
  "1.5u": "py-3",
  "2u": "py-4",
  "3u": "py-6",
  "4u": "py-8",
  "6u": "py-12",
  "8u": "py-16",
  "12u": "py-24",
} as const satisfies Record<LayoutSpace, string>;

export const paddingTopClassNames = {
  "0": "pt-0",
  "0.5u": "pt-1",
  "1u": "pt-2",
  "1.5u": "pt-3",
  "2u": "pt-4",
  "3u": "pt-6",
  "4u": "pt-8",
  "6u": "pt-12",
  "8u": "pt-16",
  "12u": "pt-24",
} as const satisfies Record<LayoutSpace, string>;

export const paddingBottomClassNames = {
  "0": "pb-0",
  "0.5u": "pb-1",
  "1u": "pb-2",
  "1.5u": "pb-3",
  "2u": "pb-4",
  "3u": "pb-6",
  "4u": "pb-8",
  "6u": "pb-12",
  "8u": "pb-16",
  "12u": "pb-24",
} as const satisfies Record<LayoutSpace, string>;

export const paddingStartClassNames = {
  "0": "ps-0",
  "0.5u": "ps-1",
  "1u": "ps-2",
  "1.5u": "ps-3",
  "2u": "ps-4",
  "3u": "ps-6",
  "4u": "ps-8",
  "6u": "ps-12",
  "8u": "ps-16",
  "12u": "ps-24",
} as const satisfies Record<LayoutSpace, string>;

export const paddingEndClassNames = {
  "0": "pe-0",
  "0.5u": "pe-1",
  "1u": "pe-2",
  "1.5u": "pe-3",
  "2u": "pe-4",
  "3u": "pe-6",
  "4u": "pe-8",
  "6u": "pe-12",
  "8u": "pe-16",
  "12u": "pe-24",
} as const satisfies Record<LayoutSpace, string>;

export const alignItemsClassNames = {
  stretch: "items-stretch",
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
} as const;

export const justifyContentClassNames = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  spaceBetween: "justify-between",
  spaceAround: "justify-around",
} as const;

export const alignSelfClassNames = {
  stretch: "self-stretch",
  start: "self-start",
  center: "self-center",
  end: "self-end",
  baseline: "self-baseline",
} as const;

export const justifyItemsClassNames = {
  stretch: "justify-items-stretch",
  start: "justify-items-start",
  center: "justify-items-center",
  end: "justify-items-end",
} as const;
