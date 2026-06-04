"use client";

import Link from "next/link";
import { ArrowLeft02Icon, LinkSquare02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TypographyH1, TypographyH2 } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/primitives/cn";
import type { TmsProviderLiveJobDetail } from "@/lib/providers/tms-provider-live";

import { toneClass } from "../../../_components/workspace-resource-shared";
import {
  JobDetailRow,
  ProviderCrowdinJobDetailRows,
} from "../../_components/provider-crowdin-job-detail-rows";
import {
  formatLocaleList,
  getCrowdinTargetLocales,
} from "../../_components/provider-crowdin-job-display";

function statusTone(status: TmsProviderLiveJobDetail["status"]) {
  switch (status) {
    case "succeeded":
      return "safe";
    case "failed":
      return "risk";
    case "queued":
    case "waiting_for_review":
      return "watch";
    default:
      return "info";
  }
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function formatJobKind(job: TmsProviderLiveJobDetail) {
  return job.kind.replace("_", " ");
}

export function ProviderLiveJobDetailContent({
  jobId,
  organizationSlug,
}: {
  jobId: string;
  organizationSlug: string;
}) {
  const queryClient = useQueryClient();
  const jobQueryKey = ["tms-provider-job", organizationSlug, jobId] as const;
  const jobQuery = useQuery({
    queryKey: jobQueryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].$get({
        param: { organizationSlug, encodedJobId: jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load provider job (${response.status})`);
      }

      const body = (await response.json()) as { job: TmsProviderLiveJobDetail };
      return body.job;
    },
  });

  const job = jobQuery.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button
            nativeButton={false}
            render={<Link href={`/org/${organizationSlug}/jobs`} />}
            variant="ghost"
            className="-ml-2 mb-2 text-foreground/54 hover:bg-foreground/6 hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={1.8} />
            Jobs
          </Button>
          <TypographyH1 className="wrap-break-word font-heading text-3xl font-semibold text-foreground md:text-4xl">
            {job?.externalTitle ?? jobId}
          </TypographyH1>
          <p className="mt-2 text-sm text-muted-foreground">
            Live task from {job?.externalProviderKind ?? "provider"} — agent workflows are not
            available in this phase.
          </p>
        </div>
        {job ? (
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <Badge
              variant="outline"
              className={cn("w-fit rounded-full capitalize", toneClass(statusTone(job.status)))}
            >
              {job.status}
            </Badge>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {job.externalUrl ? (
                <Button
                  nativeButton={false}
                  render={
                    <a href={job.externalUrl} target="_blank" rel="noreferrer noopener">
                      <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.8} />
                      Open in {job.externalProviderKind}
                    </a>
                  }
                  size="sm"
                  variant="outline"
                />
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={jobQuery.isFetching}
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: jobQueryKey });
                }}
              >
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
                {jobQuery.isFetching ? "Refreshing..." : "Refresh"}
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button size="sm" disabled>
                      Run with agent
                    </Button>
                  }
                />
                <TooltipContent>Agent workflows on provider tasks are coming soon.</TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : null}
      </div>

      {jobQuery.isLoading ? (
        <div className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
          <Skeleton className="h-5 w-48 bg-foreground/8" />
          <Skeleton className="mt-4 h-40 w-full bg-foreground/8" />
        </div>
      ) : null}

      {jobQuery.isError ? (
        <div className="rounded-lg border border-flame-300/20 bg-flame-300/8 p-5 text-sm text-flame-100">
          {jobQuery.error instanceof Error ? jobQuery.error.message : "Unable to load provider job"}
        </div>
      ) : null}

      {job ? (
        <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
          <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
            Provider task
          </TypographyH2>
          <dl className="mt-3 divide-y divide-foreground/8">
            <JobDetailRow label="Job ID" value={job.id} />
            <JobDetailRow label="Provider status" value={job.externalStatus} />
            {job.externalProviderKind !== "crowdin" ? (
              <JobDetailRow label="Kind" value={job.kind.replace("_", " ")} />
            ) : null}
            <JobDetailRow
              label="Assignees"
              value={
                job.externalAssignedUsers.length > 0 ? job.externalAssignedUsers.join(", ") : "—"
              }
            />
            {job.externalProviderKind === "crowdin" ? (
              <ProviderCrowdinJobDetailRows
                job={job}
                providerPayload={job.externalProviderPayload}
                organizationSlug={organizationSlug}
                formatJobKind={formatJobKind}
                formatDateTime={formatDate}
                descriptionQueryKey={jobQueryKey}
                showProviderLink={false}
              />
            ) : (
              <>
                <JobDetailRow label="Project" value={job.projectName ?? job.projectId} />
                <JobDetailRow
                  label="Target locales"
                  value={formatLocaleList(getCrowdinTargetLocales(null, job.externalTargetLocales))}
                />
                <JobDetailRow label="Due date" value={formatDate(job.externalDueDate)} />
                <JobDetailRow label="Last refreshed" value={formatDate(job.updatedAt)} />
                {job.externalUrl ? (
                  <JobDetailRow
                    label="Provider URL"
                    value={
                      <a
                        href={job.externalUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-foreground underline decoration-foreground/24 underline-offset-4 hover:decoration-foreground/48"
                      >
                        Open in {job.externalProviderKind}
                      </a>
                    }
                  />
                ) : null}
              </>
            )}
          </dl>
        </section>
      ) : null}
    </main>
  );
}
