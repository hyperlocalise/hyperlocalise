"use client";

import { useMemo } from "react";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import { jobDetailTaskLayoutFromRecord } from "./job-detail-layout-helpers";
import { isProviderBackedJob, type JobDetailRecord } from "./job-detail-types";
import { JobSourceFilesPanel } from "./tms/job-source-files-panel";

function getInputPayloadString(job: JobDetailRecord, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return null;
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getInputPayloadStringArray(job: JobDetailRecord, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return [];
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function isNativeFileTranslationJob(job: JobDetailRecord) {
  return (
    !isProviderBackedJob(job) &&
    job.kind === "translation" &&
    job.type === "file" &&
    Boolean(getInputPayloadString(job, "sourceFileId"))
  );
}

/** @deprecated Use jobDetailTaskLayoutFromRecord */
export function nativeJobDetailTitle(job: JobDetailRecord) {
  return jobDetailTaskLayoutFromRecord(job).title;
}

/** @deprecated Use jobDetailTaskLayoutFromRecord */
export function nativeJobDetailMetrics(job: JobDetailRecord) {
  return jobDetailTaskLayoutFromRecord(job).metrics;
}

/** @deprecated Use jobDetailTaskLayoutFromRecord */
export function nativeJobDetailProperties(job: JobDetailRecord) {
  const layout = jobDetailTaskLayoutFromRecord(job);
  return {
    properties: layout.properties,
    secondaryProperties: layout.secondaryProperties,
  };
}

export { jobDetailTaskLayoutFromRecord };

export function buildNativeJobFileRecord(job: JobDetailRecord): ProjectFileRecord | null {
  const sourcePath = getInputPayloadString(job, "sourceFileId");
  if (!sourcePath) {
    return null;
  }

  const filename = sourcePath.split("/").filter(Boolean).at(-1) ?? sourcePath;

  return {
    origin: "repository",
    sourcePath,
    sourceHash: null,
    commitSha: null,
    workflowRunId: job.workflowRunId,
    uploadedAt: job.createdAt,
    storedFileId: sourcePath,
    metadata: {},
    filename,
    byteSize: null,
    provider: null,
    latestJob: {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      type: job.type ?? "file",
    },
  };
}

export function NativeJobSourceFilesSection({
  organizationSlug,
  projectId,
  job,
}: {
  organizationSlug: string;
  projectId: string;
  job: JobDetailRecord;
}) {
  const file = useMemo(() => buildNativeJobFileRecord(job), [job]);
  const targetLocales = getInputPayloadStringArray(job, "targetLocales");
  const highlightLocale = targetLocales[0] ?? null;

  if (!file) {
    return null;
  }

  return (
    <JobSourceFilesPanel
      organizationSlug={organizationSlug}
      projectId={projectId}
      encodedJobId={job.id}
      files={[file]}
      highlightLocale={highlightLocale}
      emptyMessage="No source file linked to this job."
    />
  );
}
