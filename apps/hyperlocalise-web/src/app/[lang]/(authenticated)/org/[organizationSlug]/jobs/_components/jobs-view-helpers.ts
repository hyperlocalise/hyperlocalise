import { parseProviderJobId } from "@/lib/providers/tms-provider-resource-id";

export type JobsViewMode = "row" | "kanban";

export const JOBS_VIEW_MODE_STORAGE_KEY = "project-jobs-view-mode:v1";

export const kanbanStatusColumns = [
  "queued",
  "running",
  "waiting_for_review",
  "succeeded",
  "failed",
  "cancelled",
] as const;

type JobCatTarget = {
  id: string;
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
  type: "string" | "file" | null;
  externalProviderKind: string | null;
  externalTargetLocales: string[] | null;
  reviewTargetLocale: string | null;
  inputPayload: unknown;
};

function getInputPayloadString(job: JobCatTarget, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return null;
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readJobsViewMode(): JobsViewMode {
  if (typeof window === "undefined") {
    return "row";
  }

  try {
    const stored = window.localStorage.getItem(JOBS_VIEW_MODE_STORAGE_KEY);
    if (stored === "row" || stored === "kanban") {
      return stored;
    }
  } catch {
    return "row";
  }

  return "row";
}

export function writeJobsViewMode(mode: JobsViewMode) {
  try {
    window.localStorage.setItem(JOBS_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
}

export function buildJobDetailHref(
  organizationSlug: string,
  projectId: string | null | undefined,
  jobId: string,
) {
  if (!projectId) {
    return null;
  }

  return `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
}

export function canOpenJobCat(job: JobCatTarget) {
  if (job.kind !== "translation" && job.kind !== "review") {
    return false;
  }

  if (job.externalProviderKind || parseProviderJobId(job.id)) {
    return true;
  }

  return job.kind === "translation" && job.type === "file";
}

export function buildJobCatHref(
  organizationSlug: string,
  projectId: string | null | undefined,
  job: JobCatTarget,
) {
  if (!projectId || !canOpenJobCat(job)) {
    return null;
  }

  const params = new URLSearchParams();
  const targetLocale = job.externalTargetLocales?.[0] ?? job.reviewTargetLocale;
  if (targetLocale) {
    params.set("targetLocale", targetLocale);
  }

  const sourcePath = getInputPayloadString(job, "sourceFileId");
  if (sourcePath) {
    params.set("sourcePath", sourcePath);
  }

  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(job.id)}/strings`;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
