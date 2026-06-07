"use client";

import * as React from "react";
import { cn } from "@/lib/primitives/cn";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-5 items-center rounded-lg bg-muted-foreground/10 px-1.5 font-mono text-[10px] font-medium text-muted-foreground select-none",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
