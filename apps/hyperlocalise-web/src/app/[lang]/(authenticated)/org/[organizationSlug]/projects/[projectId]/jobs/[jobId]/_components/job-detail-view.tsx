"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH1, TypographyH4 } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import {
  defaultRenderBackLink,
  defaultRenderError,
  type JobDetailBackLinkRenderer,
  type JobDetailErrorRenderer,
} from "./job-detail-shared";
import { buildJobsListHref } from "./job-detail-types";

export type JobDetailViewMetric = {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  label: string;
};

export type JobDetailViewProperty = {
  label: string;
  value: ReactNode;
};

function MetricItem({ icon, label }: JobDetailViewMetric) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <HugeiconsIcon
        icon={icon}
        strokeWidth={1.8}
        className="size-4 shrink-0 text-muted-foreground"
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

function CompactPropertyRow({ label, value }: JobDetailViewProperty) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-sm leading-5 text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

function PropertiesCard({
  properties,
  secondaryProperties = [],
}: {
  properties: JobDetailViewProperty[];
  secondaryProperties?: JobDetailViewProperty[];
}) {
  const [showMore, setShowMore] = useState(false);
  const hasSecondary = secondaryProperties.length > 0;

  return (
    <section className="rounded-lg border border-border bg-card p-5 xl:sticky xl:top-5">
      <TypographyH4>Properties</TypographyH4>
      {hasSecondary ? (
        <Collapsible open={showMore} onOpenChange={setShowMore}>
          <dl className="mt-5">
            {properties.map((property) => (
              <CompactPropertyRow key={property.label} {...property} />
            ))}
            <CollapsibleContent>
              {secondaryProperties.map((property) => (
                <CompactPropertyRow key={property.label} {...property} />
              ))}
            </CollapsibleContent>
          </dl>
          <CollapsibleTrigger
            className="mt-3 inline-flex items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground focus-visible:text-foreground"
            aria-label={
              showMore ? "Hide secondary task properties" : "Show secondary task properties"
            }
          >
            {showMore ? "Show less" : "Show more"}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              strokeWidth={1.8}
              className={cn("size-4 transition-transform", showMore && "rotate-180")}
            />
          </CollapsibleTrigger>
        </Collapsible>
      ) : (
        <dl className="mt-5">
          {properties.map((property) => (
            <CompactPropertyRow key={property.label} {...property} />
          ))}
        </dl>
      )}
    </section>
  );
}

export function JobDetailView({
  buildJobsListHref: buildJobsListHrefProp = buildJobsListHref,
  error,
  headerActions,
  isLoading,
  jobId,
  metrics = [],
  organizationSlug,
  projectId,
  properties,
  renderBackLink = defaultRenderBackLink,
  renderError = defaultRenderError,
  renderMain,
  secondaryProperties = [],
  title,
}: {
  buildJobsListHref?: typeof buildJobsListHref;
  error?: unknown;
  headerActions?: ReactNode;
  isLoading: boolean;
  jobId: string;
  metrics?: JobDetailViewMetric[];
  organizationSlug: string;
  projectId: string;
  properties: JobDetailViewProperty[];
  renderBackLink?: JobDetailBackLinkRenderer;
  renderError?: JobDetailErrorRenderer;
  renderMain?: () => ReactNode;
  secondaryProperties?: JobDetailViewProperty[];
  title?: string;
}) {
  const jobsListHref = buildJobsListHrefProp(organizationSlug, projectId);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {renderBackLink({ href: jobsListHref, children: "Jobs" })}
          <TypographyH1>{title ?? jobId}</TypographyH1>
          {metrics.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              {metrics.map((metric) => (
                <MetricItem key={metric.label} {...metric} />
              ))}
            </div>
          ) : null}
        </div>
        {headerActions ? (
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex flex-wrap gap-2 sm:justify-end">{headerActions}</div>
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      ) : null}

      {error ? renderError({ error }) : null}

      {!isLoading && !error ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-5">{renderMain?.()}</div>
          <aside className="flex min-w-0 flex-col gap-5">
            <PropertiesCard properties={properties} secondaryProperties={secondaryProperties} />
          </aside>
        </div>
      ) : null}
    </main>
  );
}
