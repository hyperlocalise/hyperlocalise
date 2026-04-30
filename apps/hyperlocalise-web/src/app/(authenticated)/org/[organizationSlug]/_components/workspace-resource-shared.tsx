"use client";

import type { ComponentProps, ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type Icon = ComponentProps<typeof HugeiconsIcon>["icon"];
export type Tone = "safe" | "watch" | "risk" | "info";

export function toneClass(tone: Tone) {
  switch (tone) {
    case "safe":
      return "border-grove-300/25 bg-grove-300/10 text-grove-300";
    case "watch":
      return "border-bud-500/25 bg-bud-500/10 text-bud-300";
    case "risk":
      return "border-flame-700/25 bg-flame-700/10 text-flame-100";
    default:
      return "border-dew-500/25 bg-dew-500/10 text-dew-100";
  }
}

export function PageHeader({
  icon,
  label,
  title,
  description,
  statusLabel,
}: {
  icon: Icon;
  label: string;
  title: string;
  description: string;
  statusLabel?: string;
}) {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-white/48">
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="size-4" />
          <span>{label}</span>
        </div>
        <h1 className="mt-2 font-heading text-2xl font-medium text-white">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-white/52">{description}</p>
      </div>
      {statusLabel ? (
        <Badge
          variant="outline"
          className="h-8 w-fit rounded-lg border-white/10 bg-white/4 text-white/64"
        >
          {statusLabel}
        </Badge>
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
          className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0"
        >
          <CardContent className="px-4 py-4">
            <p className="text-sm text-white/52">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="font-heading text-3xl font-medium text-white">{metric.value}</p>
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
    <div className="h-2 overflow-hidden rounded-full bg-white/8" aria-label={`${value}% complete`}>
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
    <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
      <CardHeader className="px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl text-white">{title}</CardTitle>
            <CardDescription className="mt-1 text-white/48">{description}</CardDescription>
          </div>
          <HugeiconsIcon icon={icon} strokeWidth={1.8} className="mt-1 size-5 text-white/42" />
        </div>
      </CardHeader>
      <Separator className="bg-white/8" />
      <CardContent className="px-0 pb-3">{children}</CardContent>
    </Card>
  );
}
