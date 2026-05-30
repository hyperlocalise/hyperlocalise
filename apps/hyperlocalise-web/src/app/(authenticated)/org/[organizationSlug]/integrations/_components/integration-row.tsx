"use client";

import type { ReactNode } from "react";
import { ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type IntegrationRowAction = "connect" | "manage" | "coming-soon" | "view-only";

type IntegrationRowProps = {
  name: string;
  description: string;
  icon?: ReactNode;
  iconMuted?: boolean;
  action: IntegrationRowAction;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onConnect?: () => void;
  isConnecting?: boolean;
  isLast?: boolean;
  children?: ReactNode;
};

export function IntegrationRow({
  name,
  description,
  icon,
  iconMuted = false,
  action,
  expanded = false,
  onExpandedChange,
  onConnect,
  isConnecting = false,
  isLast = false,
  children,
}: IntegrationRowProps) {
  const showPanel = action === "manage" && children;

  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className={cn(!isLast && "border-b border-border")}
    >
      <div className="flex items-center gap-4 px-5 py-4">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted p-2",
            iconMuted && "grayscale saturate-0",
          )}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-foreground">{name}</p>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <div className="shrink-0">
          {action === "coming-soon" ? (
            <Button type="button" variant="outline" size="sm" disabled>
              Coming soon
            </Button>
          ) : action === "view-only" ? (
            <span className="text-sm text-muted-foreground">Admins can connect</span>
          ) : action === "connect" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onConnect}
              disabled={isConnecting}
            >
              {isConnecting ? "Connecting..." : "Connect"}
              <ArrowUpRightIcon className="size-3.5" strokeWidth={2} />
            </Button>
          ) : showPanel ? (
            <CollapsibleTrigger
              render={
                <Button type="button" variant="outline" size="sm">
                  Manage
                  <ChevronDownIcon
                    className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                    strokeWidth={2}
                  />
                </Button>
              }
            />
          ) : null}
        </div>
      </div>

      {showPanel ? (
        <CollapsibleContent className="border-t border-border bg-muted/20 px-5 py-5">
          {children}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

export function IntegrationCategoryLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function IntegrationCategoryCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
      {children}
    </div>
  );
}
