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
import Link from "next/link";
import type { ReactNode } from "react";
import { FormattedMessage } from "react-intl";

import { integrationRowMessages } from "./integration-row.messages";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH4, TypographyMuted } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

export type IntegrationRowAction = "connect" | "manage" | "coming-soon" | "view-only" | "open";

type IntegrationRowProps = {
  name: string;
  description: string;
  icon?: ReactNode;
  iconMuted?: boolean;
  action: IntegrationRowAction;
  href?: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onConnect?: () => void;
  isConnecting?: boolean;
  isLoading?: boolean;
  isLast?: boolean;
  children?: ReactNode;
};

export function IntegrationRowFrame({
  open,
  onOpenChange,
  highlighted,
  icon,
  iconMuted = false,
  name,
  description,
  nameExtra,
  action,
  showPanel,
  children,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  highlighted: boolean;
  icon?: ReactNode;
  iconMuted?: boolean;
  name: string;
  description: string;
  nameExtra?: ReactNode;
  action: ReactNode;
  showPanel: boolean;
  children?: ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Rows spacing="1u">
        <Item variant={highlighted ? "muted" : "outline"}>
          <ItemMedia variant="image">
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              width="full"
              height="full"
              background={iconMuted ? "muted" : "canvas"}
            >
              {icon}
            </Box>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {name}
              {nameExtra}
            </ItemTitle>
            <ItemDescription>{description}</ItemDescription>
          </ItemContent>
          <ItemActions>{action}</ItemActions>
        </Item>

        {showPanel ? (
          <CollapsibleContent>
            <Box background="muted" border="standard" borderRadius="large" padding="2u">
              {children}
            </Box>
          </CollapsibleContent>
        ) : null}
      </Rows>
    </Collapsible>
  );
}

export function IntegrationRow({
  name,
  description,
  icon,
  iconMuted = false,
  action,
  href,
  expanded = false,
  onExpandedChange,
  onConnect,
  isConnecting = false,
  isLoading = false,
  children,
}: IntegrationRowProps) {
  const showPanel = Boolean(action === "manage" && children);

  return (
    <IntegrationRowFrame
      open={expanded}
      onOpenChange={onExpandedChange}
      highlighted={expanded}
      icon={icon}
      iconMuted={iconMuted || action !== "manage"}
      name={name}
      description={description}
      showPanel={showPanel}
      action={
        isLoading && (action === "connect" || action === "manage") ? (
          <Skeleton className="h-8 w-[5.75rem]" aria-hidden />
        ) : action === "coming-soon" ? (
          <Button type="button" variant="outline" size="sm" disabled>
            <FormattedMessage {...integrationRowMessages.comingSoon} />
          </Button>
        ) : action === "open" && href ? (
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href={href} />}>
            <FormattedMessage {...integrationRowMessages.open} />
            <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" strokeWidth={2} />
          </Button>
        ) : action === "view-only" ? (
          <TypographyMuted>
            <FormattedMessage {...integrationRowMessages.adminsCanConnect} />
          </TypographyMuted>
        ) : action === "connect" ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onConnect}
            disabled={isConnecting}
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
  children,
}: CollapsibleIntegrationRowProps) {
  const showPanel = userIsAdmin || isConnected;

  return (
    <IntegrationRowFrame
      open={showPanel && expanded}
      onOpenChange={onExpandedChange}
      highlighted={expanded}
      icon={icon}
      iconMuted={!isConnected}
      name={name}
      description={description}
      showPanel={showPanel}
      action={
        isLoading && showPanel ? (
          <Skeleton className="h-8 w-[5.75rem]" aria-hidden />
        ) : showPanel ? (
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant={userIsAdmin && !isConnected ? "default" : "outline"}
                size="sm"
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
          <TypographyMuted>
            <FormattedMessage {...integrationRowMessages.adminsCanConnect} />
          </TypographyMuted>
        )
      }
    >
      {children}
    </IntegrationRowFrame>
  );
}

export function IntegrationCategoryLabel({ children }: { children: ReactNode }) {
  return <TypographyH4>{children}</TypographyH4>;
}

export function IntegrationCategoryCard({ children }: { children: ReactNode }) {
  return (
    <Box border="standard" borderRadius="standard" background="surface">
      {children}
    </Box>
  );
}
