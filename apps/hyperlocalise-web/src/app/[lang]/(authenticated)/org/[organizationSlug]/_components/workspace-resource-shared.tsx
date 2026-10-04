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
import type { ComponentProps, ReactNode } from "react";
import { useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { workspaceResourceSharedMessages as messages } from "./workspace-resource-shared.messages";
import { createElement } from "react";
import { type Icon } from "@phosphor-icons/react";

export type { Icon };

export type Tone = "safe" | "watch" | "risk" | "info";

type WorkspacePageShellProps = ComponentProps<"main">;

export function WorkspacePageShell({ children, className, ...props }: WorkspacePageShellProps) {
  return (
    <main className={cn("flex w-full flex-col gap-4", className)} {...props}>
      {children}
    </main>
  );
}

export function WorkspaceResourceSection({
  title,
  count,
  headerActions,
  children,
}: {
  title: string;
  count?: number;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium text-foreground">
          {title}
          {count === undefined ? null : (
            <span className="ml-2 font-normal tabular-nums text-muted-foreground">{count}</span>
          )}
        </h2>
        {headerActions ? <div className="min-w-0 sm:max-w-sm">{headerActions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function WorkspaceResourceListFrame({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border", className)} {...props}>
      {children}
    </div>
  );
}

export function WorkspaceResourceEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-8">
      <div className="space-y-1">
        <TypographyP size="small" weight="medium" tone="content">
          {title}
        </TypographyP>
        {description ? (
          <TypographyP className="max-w-lg text-pretty" size="small" tone="subtle">
            {description}
          </TypographyP>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export const workspaceResourceRowClassName =
  "grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_7rem_8rem] md:items-center";

export function WorkspaceFilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export const workspaceFilterTriggerClassName =
  "h-9 min-h-9 w-full border-border bg-transparent px-3 text-sm data-[size=default]:h-9";

export function toneClass(tone: Tone) {
  switch (tone) {
    case "safe":
      return "border-grove-700/25 bg-grove-100 text-grove-900 dark:border-grove-500/30 dark:bg-grove-100 dark:text-grove-900";
    case "watch":
      return "border-warning/25 bg-warning/10 text-warning-foreground dark:border-warning/30 dark:bg-warning/20 dark:text-warning-foreground";
    case "risk":
      return "border-destructive/25 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/20 dark:text-destructive";
    default:
      return "border-blue-700/25 bg-blue-100 text-blue-1000 dark:border-blue-600/30 dark:bg-blue-100 dark:text-blue-900";
  }
}

export function PageHeader({
  title,
  statusLabel,
  actions,
  children,
}: {
  icon: Icon;
  label?: string;
  title: string;
  statusLabel?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const hasToolbar = Boolean(children || statusLabel || actions);

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {hasToolbar ? (
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:items-center",
            children ? "sm:justify-between" : "sm:justify-end",
          )}
        >
          {children ? <div className="min-w-0 flex-1">{children}</div> : null}
          {statusLabel || actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              {statusLabel ? (
                <Badge
                  variant="outline"
                  className="h-8 w-fit rounded-lg border-border bg-muted text-subtle-foreground"
                >
                  {statusLabel}
                </Badge>
              ) : null}
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function MetricsGrid({
  metrics,
}: {
  metrics: readonly { label: string; value: string; detail: string; tone: Tone }[];
}) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {metrics.map((metric) => (
        <Card
          key={metric.label}
          className="rounded-lg border border-border bg-muted py-0 text-foreground ring-0"
        >
          <CardContent className="px-4 py-4">
            <TypographyP size="small" tone="subtle">
              {metric.label}
            </TypographyP>
            <div className="mt-3 flex items-end justify-between gap-4">
              <TypographyP className="font-heading text-3xl" weight="medium" tone="content">
                {metric.value}
              </TypographyP>
              <Badge variant="outline" className={cn("rounded-full", toneClass(metric.tone))}>
                {metric.detail}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function ProgressBar({ value, tone }: { value: number; tone: Tone }) {
  const intl = useIntl();

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-skeleton"
      aria-label={intl.formatMessage(messages.progressComplete, { value })}
    >
      <div
        className={cn(
          "h-full rounded-full",
          tone === "safe" && "bg-grove-300",
          tone === "watch" && "bg-bud-500",
          tone === "risk" && "bg-flame-700",
          tone === "info" && "bg-dew-500",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function ResourceCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: Icon;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-lg border border-border bg-muted py-0 text-foreground ring-0">
      <CardHeader className="px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-foreground">{title}</CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">{description}</CardDescription>
          </div>
          {createElement(icon, { className: "mt-1 size-5 text-muted-foreground" })}
        </div>
      </CardHeader>
      <Separator className="bg-skeleton" />
      <CardContent className="px-0 pb-3">{children}</CardContent>
    </Card>
  );
}
