"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AiMagicIcon, Comment01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2 } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { JobProviderActionId } from "@/lib/providers/job-provider-actions";
import { cn } from "@/lib/utils";

import { toneClass } from "../../../_components/workspace-resource-shared";

export type ProviderSourceFile = {
  id: string;
  displayName: string;
  sourcePath: string | null;
  resourceType: string | null;
  externalUrl: string | null;
};

export type ProviderActionAvailability = {
  id: JobProviderActionId;
  label: string;
  agentRunKind: string;
  visible: boolean;
  enabled: boolean;
  disabledReason?: string;
};

export type ProviderBackedJobFields = {
  externalProviderKind: string;
  externalJobId: string | null;
  externalTaskId: string | null;
  externalStatus: string | null;
  externalTitle: string | null;
  externalDueDate: string | null;
  externalTargetLocales: string[] | null;
  externalAssignedUsers: string[] | null;
  externalUrl: string | null;
  externalSyncState: string | null;
  externalProviderPayload: Record<string, unknown> | null;
  lastError: string | null;
  updatedAt: string;
  providerSourceFiles?: ProviderSourceFile[];
  providerActions?: ProviderActionAvailability[];
};

export type AgentRunRecord = {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
  completedAt: string | null;
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function agentRunTone(status: AgentRunRecord["status"]) {
  switch (status) {
    case "succeeded":
      return "safe";
    case "failed":
      return "risk";
    case "queued":
      return "watch";
    default:
      return "info";
  }
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-foreground/42">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-sm text-foreground/74">{value ?? "—"}</dd>
    </div>
  );
}

function actionIcon(actionId: JobProviderActionId) {
  switch (actionId) {
    case "leave_provider_comment":
      return Comment01Icon;
    case "push_approved_changes":
      return RefreshIcon;
    default:
      return AiMagicIcon;
  }
}

async function parseActionError(response: Response, fallback: string) {
  let error: string | undefined;

  try {
    const body = (await response.json()) as { error?: string; message?: string };
    error = body.message ?? body.error;
  } catch {
    error = undefined;
  }

  return error ? `${fallback}: ${error}` : `${fallback} (${response.status})`;
}

export function JobProviderDetailSection({
  job,
  jobId,
  organizationSlug,
}: {
  job: ProviderBackedJobFields;
  jobId: string;
  organizationSlug: string;
}) {
  const queryClient = useQueryClient();
  const jobQueryKey = ["job", organizationSlug, jobId] as const;
  const agentRunsQueryKey = ["job-agent-runs", organizationSlug, jobId] as const;

  const agentRunsQuery = useQuery({
    queryKey: agentRunsQueryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"][
        "agent-runs"
      ].$get({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load agent runs (${response.status})`);
      }

      const body = (await response.json()) as { agentRuns: AgentRunRecord[] };
      return body.agentRuns;
    },
  });

  const startAgentRun = useMutation({
    mutationFn: async (action: JobProviderActionId) => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"][
        "agent-runs"
      ].$post({
        param: { organizationSlug, jobId },
        json: { action },
      });

      if (!response.ok) {
        throw new Error(await parseActionError(response, "Failed to start agent run"));
      }

      const body = (await response.json()) as { agentRun: AgentRunRecord };
      return body.agentRun;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: agentRunsQueryKey }),
        queryClient.invalidateQueries({ queryKey: jobQueryKey }),
      ]);
      toast.success("Agent run queued");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start agent run");
    },
  });

  const visibleActions = (job.providerActions ?? []).filter((action) => action.visible);
  const sourceFiles = job.providerSourceFiles ?? [];

  return (
    <>
      <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
            Provider Details
          </TypographyH2>
          <Badge variant="outline" className="rounded-full capitalize">
            {job.externalProviderKind}
          </Badge>
        </div>
        <dl className="mt-3 divide-y divide-foreground/8">
          <DetailRow label="Provider title" value={job.externalTitle} />
          <DetailRow label="Provider status" value={job.externalStatus} />
          <DetailRow label="Sync state" value={job.externalSyncState} />
          <DetailRow label="Last sync" value={formatDate(job.updatedAt)} />
          <DetailRow label="Target locales" value={job.externalTargetLocales?.join(", ")} />
          <DetailRow label="Assignees" value={job.externalAssignedUsers?.join(", ")} />
          <DetailRow label="Deadline" value={formatDate(job.externalDueDate)} />
          <DetailRow label="External job ID" value={job.externalJobId} />
          <DetailRow label="External task ID" value={job.externalTaskId} />
          <DetailRow
            label="Provider link"
            value={
              job.externalUrl ? (
                <Link
                  href={job.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline decoration-foreground/24 underline-offset-4 hover:decoration-foreground/48"
                >
                  Open in {job.externalProviderKind}
                </Link>
              ) : (
                "—"
              )
            }
          />
          <DetailRow label="Raw error" value={job.lastError} />
        </dl>
      </section>

      <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
        <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
          Source Files
        </TypographyH2>
        {sourceFiles.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {sourceFiles.map((file) => (
              <li
                key={file.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/8 bg-foreground/3.5 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground/82">{file.displayName}</p>
                  {file.sourcePath ? (
                    <p className="text-xs text-foreground/48">{file.sourcePath}</p>
                  ) : null}
                </div>
                {file.externalUrl ? (
                  <Link
                    href={file.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-foreground/62 underline decoration-foreground/24 underline-offset-4 hover:text-foreground"
                  >
                    Open
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-foreground/48">
            No synced source files linked to this job.
          </p>
        )}
      </section>

      {visibleActions.length > 0 ? (
        <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
          <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
            Agent Actions
          </TypographyH2>
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleActions.map((action) => (
              <Button
                key={action.id}
                size="sm"
                variant={action.id === "push_approved_changes" ? "outline" : "default"}
                disabled={!action.enabled || startAgentRun.isPending}
                title={action.disabledReason}
                onClick={() => startAgentRun.mutate(action.id)}
              >
                <HugeiconsIcon icon={actionIcon(action.id)} strokeWidth={1.8} />
                {startAgentRun.isPending && startAgentRun.variables === action.id
                  ? "Starting..."
                  : action.label}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
        <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
          Agent Activity
        </TypographyH2>
        {agentRunsQuery.isLoading ? (
          <Skeleton className="mt-4 h-20 w-full bg-foreground/8" />
        ) : null}
        {agentRunsQuery.isError ? (
          <p className="mt-4 text-sm text-flame-100">
            {agentRunsQuery.error instanceof Error
              ? agentRunsQuery.error.message
              : "Unable to load agent runs"}
          </p>
        ) : null}
        {agentRunsQuery.data && agentRunsQuery.data.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {agentRunsQuery.data.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/8 bg-foreground/3.5 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize text-foreground/82">
                    {run.kind.replace("_", " ")}
                  </p>
                  <p className="text-xs text-foreground/48">Started {formatDate(run.createdAt)}</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("rounded-full capitalize", toneClass(agentRunTone(run.status)))}
                >
                  {run.status}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {agentRunsQuery.data && agentRunsQuery.data.length === 0 ? (
          <p className="mt-4 text-sm text-foreground/48">No agent runs yet.</p>
        ) : null}
      </section>
    </>
  );
}
