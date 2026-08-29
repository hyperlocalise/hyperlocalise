/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { ProjectFileContentEditorQueueFilter } from "@/api/routes/project/project.schema";
import { projectFileCatQueueFilterSchema } from "@/api/routes/project/project.schema";
import {
  canOpenNativeJobContentEditor,
  canOpenProviderJobContentEditor,
} from "@/lib/projects/workspace-resource-capabilities";
import { resolveJobProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

export const jobContentEditorQueueFilterParam = "queueFilter";
export const jobCatSearchParam = "search";

export type JobContentEditorTarget = {
  id: string;
  kind: "translation" | "research" | "review" | "proofread" | "sync" | "asset_management";
  type: "string" | "file" | null;
  status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  externalProviderKind: string | null;
  externalTargetLocales: string[] | null;
  reviewTargetLocale: string | null;
  inputPayload: unknown;
};

export type JobContentEditorQueueFilterContext = {
  kind?: JobContentEditorTarget["kind"];
  status?: JobContentEditorTarget["status"];
};

export function resolveDefaultJobContentEditorQueueFilter(
  job: JobContentEditorQueueFilterContext,
): ProjectFileContentEditorQueueFilter {
  if (job.kind === "review" || job.kind === "proofread" || job.status === "waiting_for_review") {
    return "needs_review";
  }

  if (job.kind === "translation" || job.kind === undefined) {
    return "untranslated";
  }

  return "all";
}

export function parseJobContentEditorQueueFilterParam(
  value: string | undefined,
): ProjectFileContentEditorQueueFilter | undefined {
  if (!value) {
    return undefined;
  }

  const result = projectFileCatQueueFilterSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

function getInputPayloadString(job: JobContentEditorTarget, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return null;
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getInputPayloadStringArray(job: JobContentEditorTarget, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return [];
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function canOpenJobContentEditor(job: JobContentEditorTarget) {
  return canOpenProviderJobContentEditor(job) || canOpenNativeJobContentEditor(job);
}

export function buildJobContentEditorHref(
  organizationSlug: string,
  projectId: string | null | undefined,
  job: JobContentEditorTarget,
) {
  const resolvedProjectId = resolveJobProjectId(projectId, job.id);
  if (!resolvedProjectId || !canOpenJobContentEditor(job)) {
    return null;
  }

  const params = new URLSearchParams();
  const isProviderJob = canOpenProviderJobContentEditor(job);

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

  const queueFilter = resolveDefaultJobContentEditorQueueFilter(job);
  if (queueFilter !== "all") {
    params.set(jobContentEditorQueueFilterParam, queueFilter);
  }

  const base = `/org/${organizationSlug}/projects/${encodeURIComponent(resolvedProjectId)}/jobs/${encodeURIComponent(job.id)}/strings`;
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}
