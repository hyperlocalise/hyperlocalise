"use client";

import type { SVGProps } from "react";
import type { SimpleIcon } from "simple-icons";

import { cn } from "@/lib/primitives/cn";

type SimpleBrandIconProps = SVGProps<SVGSVGElement> & {
  icon: SimpleIcon;
  colored: boolean;
};

export function SimpleBrandIcon({ icon, colored, className, ...props }: SimpleBrandIconProps) {
  // GitHub's brand hex is near-black and disappears on dark surfaces.
  const useThemeForeground = colored && icon.slug === "github";

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
