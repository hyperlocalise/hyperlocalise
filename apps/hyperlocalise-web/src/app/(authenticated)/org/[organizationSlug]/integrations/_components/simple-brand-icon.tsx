"use client";

import type { SVGProps } from "react";
import type { SimpleIcon } from "simple-icons";

import { cn } from "@/lib/utils";

type SimpleBrandIconProps = SVGProps<SVGSVGElement> & {
  icon: SimpleIcon;
  colored: boolean;
};

export function SimpleBrandIcon({ icon, colored, className, ...props }: SimpleBrandIconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={cn("size-5", !colored && "grayscale saturate-0", className)}
      fill={`#${icon.hex}`}
      {...props}
    >
      <path d={icon.path} />
    </svg>
  );
}
