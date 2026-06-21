import {
  buildOrgJobHref,
  formatJobPathSegment,
  formatProjectPathSegment,
} from "@/lib/projects/routing/resource-path-id";
import {
  canOpenNativeJobCat,
  canOpenProviderJobCat,
} from "@/lib/projects/workspace-resource-capabilities";

export type JobCatTarget = {
  id: string;
  kind: "translation" | "research" | "review" | "sync" | "asset_management";
  type: "string" | "file" | null;
  externalProviderKind: string | null;
  externalJobId?: string | null;
  externalTargetLocales: string[] | null;
  reviewTargetLocale: string | null;
  inputPayload: unknown;
  projectSource?: "native" | "external_tms" | null;
  externalProjectId?: string | null;
};

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
  if (!projectId || !canOpenJobCat(job)) {
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

  const base = buildOrgJobHref(
    organizationSlug,
    formatProjectPathSegment({
      id: projectId,
      source: job.projectSource,
      externalProjectId: job.externalProjectId,
    }),
    formatJobPathSegment({
      id: job.id,
      externalProviderKind: job.externalProviderKind,
      externalJobId: job.externalJobId,
    }),
    "strings",
  );
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
