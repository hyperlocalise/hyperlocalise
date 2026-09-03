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
import { ArrowDown01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode, Ref } from "react";
import { FormattedMessage } from "react-intl";

import { integrationRowMessages } from "./integration-row.messages";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Box } from "@/components/ui/layout/box";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Rows } from "@/components/ui/layout/rows";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH3 } from "@/components/ui/typography";
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

export function IntegrationRowFrame({
  open,
  onOpenChange,
  isLast = false,
  highlighted,
  hoverClassName,
  highlightClassName,
  icon,
  iconClassName,
  name,
  description,
  nameExtra,
  action,
  showPanel,
  panelClassName,
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  isLast?: boolean;
  highlighted: boolean;
  hoverClassName: string;
  highlightClassName: string;
  icon?: ReactNode;
  iconClassName: string;
  name: string;
  description: string;
  nameExtra?: ReactNode;
  action: ReactNode;
  showPanel: boolean;
  panelClassName: string;
  children?: ReactNode;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className={cn(!isLast && "border-b border-border")}
    >
      <div className={cn("transition-colors", hoverClassName, highlighted && highlightClassName)}>
        <Box paddingX="2u" paddingY="2u">
          <Columns spacing="2u" alignY="center">
            <Column width="content">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg border p-2 transition-colors",
                  iconClassName,
                )}
              >
                {icon}
              </div>
            </Column>
            <Column width="fluid">
              <Rows spacing="0.5u">
                <Box display="flex" flexWrap="wrap" alignItems="center" gap="1u">
                  <p className="text-base font-medium text-foreground">{name}</p>
                  {nameExtra}
                </Box>
                <p className="text-sm leading-6 text-muted-foreground">{description}</p>
              </Rows>
            </Column>
            <Column width="content">{action}</Column>
          </Columns>
        </Box>
      </div>

      {showPanel ? (
        <CollapsibleContent className={cn("border-t", panelClassName)}>
          <Box padding="2u">{children}</Box>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

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
  const showPanel = Boolean(action === "manage" && children);
  const activeStyle = actionStyles[action];
  const iconContainerClass = iconMuted
    ? "border-border bg-background text-foreground"
    : activeStyle.icon;

  return (
    <IntegrationRowFrame
      open={expanded}
      onOpenChange={onExpandedChange}
      isLast={isLast}
      highlighted={expanded}
      hoverClassName={activeStyle.row}
      highlightClassName={activeStyle.panel}
      icon={icon}
      iconClassName={iconContainerClass}
      name={name}
      description={description}
      showPanel={showPanel}
      panelClassName={activeStyle.panel}
      action={
        isLoading && (action === "connect" || action === "manage") ? (
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
            <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" strokeWidth={2} />
          </Button>
        ) : showPanel ? (
          <CollapsibleTrigger
            render={
              <Button type="button" variant="outline" size="sm">
                <FormattedMessage {...integrationRowMessages.manage} />
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                  strokeWidth={2}
                />
              </Button>
            }
          />
        ) : null
      }
    >
      {children}
    </IntegrationRowFrame>
  );
}

export const integrationConnectButtonClassName = actionStyles.connect.button!;

type CollapsibleIntegrationRowProps = {
  name: string;
  description: string;
  icon: ReactNode;
  isConnected: boolean;
  userIsAdmin: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  isLoading?: boolean;
  isLast?: boolean;
  children?: ReactNode;
};

export function CollapsibleIntegrationRow({
  name,
  description,
  icon,
  isConnected,
  userIsAdmin,
  expanded,
  onExpandedChange,
  isLoading = false,
  isLast = false,
  children,
}: CollapsibleIntegrationRowProps) {
  const showPanel = userIsAdmin || isConnected;

  return (
    <IntegrationRowFrame
      open={showPanel && expanded}
      onOpenChange={onExpandedChange}
      isLast={isLast}
      highlighted={expanded}
      hoverClassName="hover:bg-muted/20"
      highlightClassName="bg-muted/20"
      icon={icon}
      iconClassName={
        isConnected
          ? "border-border bg-muted text-foreground"
          : "border-border bg-muted/50 text-muted-foreground"
      }
      name={name}
      description={description}
      showPanel={showPanel}
      panelClassName="border-border bg-muted/20"
      action={
        isLoading && showPanel ? (
          <Skeleton className="h-8 w-[5.75rem] rounded-md" aria-hidden />
        ) : showPanel ? (
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={
                  userIsAdmin && !isConnected ? integrationConnectButtonClassName : undefined
                }
              >
                {userIsAdmin ? (
                  isConnected ? (
                    <FormattedMessage {...integrationRowMessages.manage} />
                  ) : (
                    <FormattedMessage {...integrationRowMessages.connect} />
                  )
                ) : (
                  <FormattedMessage {...integrationRowMessages.viewOnly} />
                )}
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                  strokeWidth={2}
                />
              </Button>
            }
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            <FormattedMessage {...integrationRowMessages.adminsCanConnect} />
          </span>
        )
      }
    >
      {children}
    </IntegrationRowFrame>
  );
}

export function IntegrationCategoryLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TypographyH3
      className={cn("pb-0 font-sans text-lg font-medium tracking-normal md:text-lg", className)}
    >
      {children}
    </TypographyH3>
  );
}

export function IntegrationCategoryCard({
  children,
  className,
  ref,
}: {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card text-card-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
