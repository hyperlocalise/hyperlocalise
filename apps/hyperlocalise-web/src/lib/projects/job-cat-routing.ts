import type { ProjectFileCatQueueFilter } from "@/api/routes/project/project.schema";
import { projectFileCatQueueFilterSchema } from "@/api/routes/project/project.schema";
import {
  canOpenNativeJobCat,
  canOpenProviderJobCat,
} from "@/lib/projects/workspace-resource-capabilities";
import { resolveJobProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

export const jobCatQueueFilterParam = "queueFilter";

export type JobCatTarget = {
  id: string;
  kind: "translation" | "research" | "review" | "proofread" | "sync" | "asset_management";
  type: "string" | "file" | null;
  status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  externalProviderKind: string | null;
  externalTargetLocales: string[] | null;
  reviewTargetLocale: string | null;
  inputPayload: unknown;
};

export type JobCatQueueFilterContext = {
  kind?: JobCatTarget["kind"];
  status?: JobCatTarget["status"];
};

export function resolveDefaultJobCatQueueFilter(
  job: JobCatQueueFilterContext,
): ProjectFileCatQueueFilter {
  if (job.kind === "review" || job.kind === "proofread" || job.status === "waiting_for_review") {
    return "needs_review";
  }

  if (job.kind === "translation" || job.kind === undefined) {
    return "untranslated";
  }

  return "all";
}

export function parseJobCatQueueFilterParam(
  value: string | undefined,
): ProjectFileCatQueueFilter | undefined {
  if (!value) {
    return undefined;
  }

  const result = projectFileCatQueueFilterSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function getInputPayloadString(job: JobCatTarget, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return null;
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getInputPayloadStringArray(job: JobCatTarget, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return [];
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function canOpenJobCat(job: JobCatTarget) {
  return canOpenProviderJobCat(job) || canOpenNativeJobCat(job);
}

export function buildJobCatHref(
  organizationSlug: string,
  projectId: string | null | undefined,
  job: JobCatTarget,
) {
  const resolvedProjectId = resolveJobProjectId(projectId, job.id);
  if (!resolvedProjectId || !canOpenJobCat(job)) {
    return null;
  }

  const params = new URLSearchParams();
  const isProviderJob = canOpenProviderJobCat(job);

  if (isProviderJob) {
    const targetLocale = job.externalTargetLocales?.[0] ?? job.reviewTargetLocale;
    if (targetLocale) {
      params.set("targetLocale", targetLocale);
    }

    const sourcePath = getInputPayloadString(job, "sourceFileId");
    if (sourcePath) {
      params.set("sourcePath", sourcePath);
    }
  } else {
    const storedFileId = getInputPayloadString(job, "sourceFileId");
    if (storedFileId) {
      params.set("storedFileId", storedFileId);
    }

    const targetLocale = getInputPayloadStringArray(job, "targetLocales")[0];
    if (targetLocale) {
      params.set("targetLocale", targetLocale);
    }
  }

  const queueFilter = resolveDefaultJobCatQueueFilter(job);
  if (queueFilter !== "all") {
    params.set(jobCatQueueFilterParam, queueFilter);
  }

  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(resolvedProjectId)}/jobs/${encodeURIComponent(job.id)}/strings`;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
