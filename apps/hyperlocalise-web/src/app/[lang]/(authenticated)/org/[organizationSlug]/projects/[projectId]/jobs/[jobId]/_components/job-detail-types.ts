import type { JobProviderActionId } from "@/lib/providers/jobs/job-provider-actions";

export type JobDetailRecord = {
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
  externalProviderKind: string | null;
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
  linkedJobId: string | null;
  providerSourceFiles?: Array<{
    id: string;
    displayName: string;
    sourcePath: string | null;
    resourceType: string | null;
    externalUrl: string | null;
  }>;
  providerActions?: Array<{
    id: JobProviderActionId;
    label: string;
    agentRunKind: string;
    visible: boolean;
    enabled: boolean;
    disabledReason?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

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
  inputSnapshot: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  changedItems: Record<string, unknown>[];
  warnings: string[];
  createdAt: string;
  completedAt: string | null;
};

export function isProviderBackedJob(
  job: JobDetailRecord,
): job is JobDetailRecord & { externalProviderKind: string } {
  return Boolean(job.externalProviderKind);
}

export function jobDetailStatusTone(status: JobDetailRecord["status"]) {
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

export function formatJobDetailKind(job: Pick<JobDetailRecord, "kind" | "type">) {
  if (job.kind === "translation" && job.type) {
    return `translation · ${job.type}`;
  }

  return job.kind.replace("_", " ");
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatJobDetailDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

export function canRunAgentOnNativeFileJob(job: JobDetailRecord) {
  return (
    !isProviderBackedJob(job) &&
    job.kind === "translation" &&
    job.type === "file" &&
    (job.status === "succeeded" || job.status === "failed")
  );
}

export function canRetryJob(job: JobDetailRecord) {
  return job.kind === "translation" && (job.status === "queued" || job.status === "failed");
}

export function canMarkJobFailed(job: JobDetailRecord) {
  return job.status === "queued" || job.status === "running";
}

export function buildJobsListHref(organizationSlug: string, projectId: string) {
  return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs`;
}
