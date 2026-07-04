"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/primitives/cn";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

export type Icon = ComponentProps<typeof HugeiconsIcon>["icon"];
export type Tone = "safe" | "watch" | "risk" | "info";

export function WorkspacePageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mx-auto flex w-full max-w-6xl flex-col gap-6", className)}>
      {children}
    </main>
  );
}

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
  icon,
  label,
  title,
  description,
  descriptionDetail,
  statusLabel,
  actions,
}: {
  icon: Icon;
  label?: string;
  title: string;
  description: string;
  descriptionDetail?: string;
  statusLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {label ? (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground antialiased">
            <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4 shrink-0" />
            <span>{label}</span>
          </div>
        ) : null}
        <TypographyH1
          className={cn(
            "font-sans text-2xl font-medium text-foreground md:text-2xl",
            label ? "mt-2" : "flex items-center gap-2",
          )}
        >
          {label ? (
            title
          ) : (
            <>
              <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-5 shrink-0" />
              {title}
            </>
          )}
        </TypographyH1>
        <TypographyP className="mt-2 text-pretty text-sm leading-6 text-muted-foreground">
          {description}
        </TypographyP>
        {descriptionDetail ? (
          <TypographyP className="mt-1.5 text-pretty text-sm leading-6 text-muted-foreground">
            {descriptionDetail}
          </TypographyP>
        ) : null}
      </div>
      {statusLabel || actions ? (
        <div className="flex flex-wrap items-center gap-2">
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
    </section>
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
            <TypographyP className="text-sm text-muted-foreground">{metric.label}</TypographyP>
            <div className="mt-3 flex items-end justify-between gap-4">
              <TypographyP className="font-heading text-3xl font-medium text-foreground">
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
  return (
    <div className="h-2 overflow-hidden rounded-full bg-skeleton" aria-label={`${value}% complete`}>
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
          <HugeiconsIcon
            icon={icon}
            strokeWidth={1.8}
            className="mt-1 size-5 text-muted-foreground"
          />
        </div>
      </CardHeader>
      <Separator className="bg-skeleton" />
      <CardContent className="px-0 pb-3">{children}</CardContent>
    </Card>
  );
}
