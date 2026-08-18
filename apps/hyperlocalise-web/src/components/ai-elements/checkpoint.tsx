"use client";

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
import { Bookmark01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type HugeiconsProps } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/primitives/cn";
import type { ComponentProps, HTMLAttributes } from "react";

export type CheckpointProps = HTMLAttributes<HTMLDivElement>;

export const Checkpoint = ({ className, children, ...props }: CheckpointProps) => (
  <div
    className={cn("flex items-center gap-0.5 overflow-hidden text-muted-foreground", className)}
    {...props}
  >
    {children}
    <Separator />
  </div>
);

export type CheckpointIconProps = Omit<HugeiconsProps, "icon">;

export const CheckpointIcon = ({ className, children, ...props }: CheckpointIconProps) =>
  children ?? (
    <HugeiconsIcon icon={Bookmark01Icon} className={cn("size-4 shrink-0", className)} {...props} />
  );

export type CheckpointTriggerProps = ComponentProps<typeof Button> & {
  tooltip?: string;
};

export const CheckpointTrigger = ({
  children,
  variant = "ghost",
  size = "sm",
  tooltip,
  ...props
}: CheckpointTriggerProps) =>
  tooltip ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button size={size} type="button" variant={variant} {...props}>
            {children}
          </Button>
        }
      />
      <TooltipContent align="start" side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
    </Button>
  );
