"use client";

import type { ReactNode } from "react";
import { ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";
import { FormattedMessage } from "react-intl";

import { integrationRowMessages } from "./integration-row.messages";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/primitives/cn";

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
  isLoading?: boolean;
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
    icon: "border-border bg-muted/50 text-muted-foreground",
    row: "hover:bg-muted/20",
    panel: "border-border bg-muted/20",
    button: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
  },
  manage: {
    icon: "border-border bg-muted text-foreground",
    row: "hover:bg-muted/20",
    panel: "border-border bg-muted/20",
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
  isLoading = false,
  isLast = false,
  children,
}: IntegrationRowProps) {
  const showPanel = action === "manage" && children;
  const activeStyle = actionStyles[action];
  const iconContainerClass = iconMuted
    ? "border-border bg-background text-foreground"
    : activeStyle.icon;

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
          expanded && activeStyle.panel,
        )}
      >
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg border p-2 transition-colors",
            iconContainerClass,
          )}
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-foreground">{name}</p>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <div className="shrink-0">
          {isLoading && (action === "connect" || action === "manage") ? (
            <Skeleton className="h-8 w-[5.75rem] rounded-md" aria-hidden />
          ) : action === "coming-soon" ? (
            <Button type="button" variant="outline" size="sm" disabled>
              <FormattedMessage {...integrationRowMessages.comingSoon} />
            </Button>
          ) : action === "view-only" ? (
            <span className="text-sm text-muted-foreground">
              <FormattedMessage {...integrationRowMessages.adminsCanConnect} />
            </span>
          ) : action === "connect" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onConnect}
              disabled={isConnecting}
              className={activeStyle.button}
            >
              {isConnecting ? (
                <FormattedMessage {...integrationRowMessages.connecting} />
              ) : (
                <FormattedMessage {...integrationRowMessages.connect} />
              )}
              <ArrowUpRightIcon className="size-3.5" strokeWidth={2} />
            </Button>
          ) : showPanel ? (
            <CollapsibleTrigger
              render={
                <Button type="button" variant="outline" size="sm">
                  <FormattedMessage {...integrationRowMessages.manage} />
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

export const integrationConnectButtonClassName = actionStyles.connect.button!;

export function IntegrationCategoryLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase md:text-sm",
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function IntegrationCategoryCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
      {children}
    </div>
  );
}
