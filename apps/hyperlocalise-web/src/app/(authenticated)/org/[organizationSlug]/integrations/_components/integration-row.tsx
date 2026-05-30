"use client";

import type { ReactNode } from "react";
import { ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { TypographyH2 } from "@/components/ui/typography";

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

const actionStyles: Record<
  IntegrationRowAction,
  {
    icon: string;
    row: string;
    panel: string;
    button?: string;
  }
> = {
  "coming-soon": {
    icon: "border-border bg-muted text-muted-foreground",
    row: "hover:bg-muted/20",
    panel: "border-border bg-muted/20",
  },
  "view-only": {
    icon: "border-border bg-muted text-muted-foreground",
    row: "hover:bg-muted/20",
    panel: "border-border bg-muted/20",
  },
  connect: {
    icon: "border-primary/30 bg-primary/10 text-primary",
    row: "hover:bg-primary/5",
    panel: "border-primary/20 bg-primary/5",
    button: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
  },
  manage: {
    icon: "border-secondary bg-secondary text-secondary-foreground",
    row: "hover:bg-secondary/60",
    panel: "border-border bg-secondary/40",
    button: "aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
  },
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
  const activeStyle = iconMuted ? actionStyles["coming-soon"] : actionStyles[action];

  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className={cn(!isLast && "border-b border-border")}
    >
      <div
        className={cn(
          "flex items-center gap-4 px-5 py-4 transition-colors",
          activeStyle.row,
          expanded && !iconMuted && activeStyle.panel,
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border p-2 transition-colors",
            activeStyle.icon,
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
              className={activeStyle.button}
            >
              {isConnecting ? "Connecting..." : "Connect"}
              <ArrowUpRightIcon className="size-3.5" strokeWidth={2} />
            </Button>
          ) : showPanel ? (
            <CollapsibleTrigger
              render={
                <Button type="button" variant="outline" size="sm" className={activeStyle.button}>
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
        <CollapsibleContent className={cn("border-t px-5 py-5", activeStyle.panel)}>
          {children}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

export function IntegrationCategoryLabel({ children }: { children: ReactNode }) {
  return (
    <TypographyH2 className="text-xs md:text-sm font-medium tracking-[0.12em] text-muted-foreground uppercase">
      {children}
    </TypographyH2>
  );
}

export function IntegrationCategoryCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
      {children}
    </div>
  );
}
