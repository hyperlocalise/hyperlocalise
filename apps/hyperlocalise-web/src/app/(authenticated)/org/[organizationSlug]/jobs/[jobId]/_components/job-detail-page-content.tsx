"use client";

import Link from "next/link";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client-instance";
import { cn } from "@/lib/utils";

import { toneClass } from "../../../_components/workspace-resource-shared";
import { TypographyH1, TypographyH2 } from "@/components/ui/typography";

type JobDetail = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  createdByUserId: string | null;
  ownerUserId: string | null;
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
  type: "string" | "file" | null;
  status: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  inputPayload: unknown;
  outcomeKind: string | null;
  outcomePayload: unknown;
  lastError: string | null;
  workflowRunId: string | null;
  interactionId: string | null;
  contextSnapshot: unknown;
  reviewCriteria: string | null;
  reviewTargetLocale: string | null;
  reviewConfig: unknown;
  syncConnectorKind: string | null;
  syncDirection: string | null;
  syncExternalIdentifiers: unknown;
  assetType: string | null;
  assetOperation: string | null;
  assetConfig: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function statusTone(status: JobDetail["status"]) {
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

function formatKind(job: JobDetail) {
  if (job.kind === "translation" && job.type) {
    return `translation · ${job.type}`;
  }

  return job.kind.replace("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-foreground/8 bg-foreground/[0.035] p-4 text-xs leading-6 text-foreground/72">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-foreground/42">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground/74">{value || "—"}</dd>
    </div>
  );
}

export function JobDetailPageContent({
  jobId,
  organizationSlug,
}: {
  jobId: string;
  organizationSlug: string;
}) {
  const jobQuery = useQuery({
    queryKey: ["job", organizationSlug, jobId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$get({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load job (${response.status})`);
      }

      const body = (await response.json()) as { job: JobDetail };
      return body.job;
    },
  });

  const job = jobQuery.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button
            render={<Link href={`/org/${organizationSlug}/jobs`} />}
            variant="ghost"
            className="-ml-2 mb-2 text-foreground/54 hover:bg-foreground/6 hover:text-foreground"
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={1.8} />
            Jobs
          </Button>
          <TypographyH1 className="break-words font-heading text-3xl font-semibold text-foreground md:text-4xl">
            {job?.id ?? jobId}
          </TypographyH1>
        </div>
        {job ? (
          <Badge
            variant="outline"
            className={cn("w-fit rounded-full capitalize", toneClass(statusTone(job.status)))}
          >
            {job.status}
          </Badge>
        ) : null}
      </div>

      {jobQuery.isLoading ? (
        <div className="rounded-lg border border-foreground/8 bg-foreground/[0.025] p-5">
          <Skeleton className="h-5 w-48 bg-foreground/8" />
          <Skeleton className="mt-4 h-40 w-full bg-foreground/8" />
        </div>
      ) : null}

      {jobQuery.isError ? (
        <div className="rounded-lg border border-flame-300/20 bg-flame-300/8 p-5 text-sm text-flame-100">
          {jobQuery.error instanceof Error ? jobQuery.error.message : "Unable to load job"}
        </div>
      ) : null}

      {job ? (
        <>
          <section className="rounded-lg border border-foreground/8 bg-foreground/[0.025] p-5">
            <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
              Overview
            </TypographyH2>
            <dl className="mt-3 divide-y divide-foreground/8">
              <DetailRow label="Kind" value={formatKind(job)} />
              <DetailRow label="Project" value={job.projectName ?? job.projectId ?? "Workspace"} />
              <DetailRow label="Interaction" value={job.interactionId} />
              <DetailRow label="Workflow run" value={job.workflowRunId} />
              <DetailRow label="Created" value={formatDate(job.createdAt)} />
              <DetailRow label="Updated" value={formatDate(job.updatedAt)} />
              <DetailRow label="Completed" value={formatDate(job.completedAt)} />
              <DetailRow label="Last error" value={job.lastError} />
            </dl>
          </section>

          {job.kind === "review" || job.kind === "sync" || job.kind === "asset_management" ? (
            <section className="rounded-lg border border-foreground/8 bg-foreground/[0.025] p-5">
              <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
                Kind Details
              </TypographyH2>
              <dl className="mt-3 divide-y divide-foreground/8">
                {job.kind === "review" ? (
                  <>
                    <DetailRow label="Criteria" value={job.reviewCriteria} />
                    <DetailRow label="Target locale" value={job.reviewTargetLocale} />
                  </>
                ) : null}
                {job.kind === "sync" ? (
                  <>
                    <DetailRow label="Connector" value={job.syncConnectorKind} />
                    <DetailRow label="Direction" value={job.syncDirection} />
                  </>
                ) : null}
                {job.kind === "asset_management" ? (
                  <>
                    <DetailRow label="Asset type" value={job.assetType} />
                    <DetailRow label="Operation" value={job.assetOperation} />
                  </>
                ) : null}
              </dl>
            </section>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-foreground/8 bg-foreground/[0.025] p-5">
              <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
                Input
              </TypographyH2>
              <div className="mt-4">
                <JsonBlock value={job.inputPayload} />
              </div>
            </div>
            <div className="rounded-lg border border-foreground/8 bg-foreground/[0.025] p-5">
              <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
                Output
              </TypographyH2>
              <div className="mt-4">
                <JsonBlock value={job.outcomePayload} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-foreground/8 bg-foreground/[0.025] p-5">
            <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
              Context Snapshot
            </TypographyH2>
            <div className="mt-4">
              <JsonBlock value={job.contextSnapshot} />
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
