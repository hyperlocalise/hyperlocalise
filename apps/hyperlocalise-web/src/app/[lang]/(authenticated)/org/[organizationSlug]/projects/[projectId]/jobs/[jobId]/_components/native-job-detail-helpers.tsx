"use client";

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
import { useMemo } from "react";
import { useIntl, type IntlShape } from "react-intl";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import { jobDetailTaskLayoutFromRecord } from "./job-detail-layout-helpers";
import { nativeJobDetailHelpersMessages as messages } from "./native-job-detail-helpers.messages";
import { isProviderBackedJob, type JobDetailRecord } from "./job-detail-types";
import { JobSourceFilesPanel } from "./tms/job-source-files-panel";
import { nativeJobToProjectFileRecord } from "./tms/job-source-file-mappers";
import { resolveDefaultJobCatQueueFilter } from "@/lib/projects/job-cat-routing";

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
export function nativeJobDetailTitle(job: JobDetailRecord, intl: IntlShape) {
  return jobDetailTaskLayoutFromRecord(job, intl).title;
}

/** @deprecated Use jobDetailTaskLayoutFromRecord */
export function nativeJobDetailMetrics(job: JobDetailRecord, intl: IntlShape) {
  return jobDetailTaskLayoutFromRecord(job, intl).metrics;
}

/** @deprecated Use jobDetailTaskLayoutFromRecord */
export function nativeJobDetailProperties(job: JobDetailRecord, intl: IntlShape) {
  const layout = jobDetailTaskLayoutFromRecord(job, intl);
  return {
    properties: layout.properties,
    secondaryProperties: layout.secondaryProperties,
  };
}

export { jobDetailTaskLayoutFromRecord };

export function buildNativeJobFileRecord(job: JobDetailRecord): ProjectFileRecord | null {
  return nativeJobToProjectFileRecord(job);
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
  const intl = useIntl();
  const file = useMemo(() => buildNativeJobFileRecord(job), [job]);
  const targetLocales = getInputPayloadStringArray(job, "targetLocales");
  const highlightLocale = targetLocales[0] ?? null;
  const queueFilter = resolveDefaultJobCatQueueFilter(job);

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
      queueFilter={queueFilter}
      emptyMessage={intl.formatMessage(messages.noSourceFileLinked)}
    />
  );
}
