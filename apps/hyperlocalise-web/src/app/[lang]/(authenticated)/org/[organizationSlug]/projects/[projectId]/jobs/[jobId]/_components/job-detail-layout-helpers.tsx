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
import {
  Clock01Icon,
  File01Icon,
  LanguageSquareIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import type { IntlShape } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";
import { getTmsProviderBranding } from "@/lib/providers/shared/tms-provider-branding";
import type { TmsProviderLiveJobDetail } from "@/lib/providers/jobs/tms-provider-live";

import { getJobStatusMessage } from "../../../../../jobs/_components/jobs-page-view.messages";
import { toneClass } from "../../../../../_components/workspace-resource-shared";
import {
  formatLocaleList,
  formatReadinessProgress,
  formatWordsToDo,
  getReadinessNumber,
  resolveProviderLocaleReadiness,
  resolveProviderTargetLocales,
  resolveProviderTaskLanguageLabel,
  resolveProviderTaskTypeLabel,
} from "../../../../../jobs/_components/provider-tms-job-display";

import { jobDetailLayoutHelpersMessages as messages } from "./job-detail-layout-helpers.messages";
import { formatJobDetailDate, isProviderBackedJob, type JobDetailRecord } from "./job-detail-types";
import type { JobDetailViewMetric, JobDetailViewProperty } from "./job-detail-view";

export type JobDetailTaskLayoutInput = {
  externalAssignedUsers: string[] | null;
  externalDueDate: string | null;
  externalJobId: string | null;
  externalProviderKind: string | null;
  externalProviderPayload: Record<string, unknown> | null;
  externalStatus: string | null;
  externalTargetLocales: string[] | null;
  externalTaskId: string | null;
  id: string;
  kind: string;
  localeReadinessLoading?: boolean;
  localeReadinessOverride?: Record<string, unknown> | null;
  projectId: string | null;
  projectName: string | null;
  sourceFilesMetric?: string | null;
  status: JobDetailRecord["status"];
  title: string | null;
  updatedAt: string;
};

function statusTone(status: JobDetailRecord["status"]) {
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

function formatJobKind(kind: string) {
  return kind.replaceAll("_", " ");
}

function formatProviderKind(kind: string | null | undefined) {
  return getTmsProviderBranding(kind).name;
}

function resolveTaskLocaleReadiness(input: JobDetailTaskLayoutInput) {
  if (input.localeReadinessOverride) {
    return input.localeReadinessOverride;
  }

  return resolveProviderLocaleReadiness(input.externalProviderKind, input.externalProviderPayload);
}

function getProgressValue(readiness: Record<string, unknown> | null) {
  const translationProgress = getReadinessNumber(readiness, "translationProgress");
  const approvalProgress = getReadinessNumber(readiness, "approvalProgress");
  return Math.max(0, Math.min(100, Math.round(translationProgress ?? approvalProgress ?? 0)));
}

function getInputPayloadString(job: JobDetailRecord, key: string) {
  if (typeof job.inputPayload !== "object" || !job.inputPayload || !(key in job.inputPayload)) {
    return null;
  }

  const value = (job.inputPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function jobDetailTaskTitle(input: JobDetailTaskLayoutInput) {
  return input.title ?? input.id;
}

export function jobDetailTaskMetrics(
  input: JobDetailTaskLayoutInput,
  intl: IntlShape,
): JobDetailViewMetric[] {
  const providerKind = input.externalProviderKind;
  const payload = input.externalProviderPayload;
  const readiness = resolveTaskLocaleReadiness(input);
  const wordsToDo = formatWordsToDo(readiness);
  const taskLabel = providerKind
    ? intl.formatMessage(messages.providerTaskMetric, {
        providerName: formatProviderKind(providerKind),
      })
    : intl.formatMessage(messages.nativeTaskMetric, {
        kind: formatJobKind(input.kind),
      });

  return [
    {
      icon: Task01Icon,
      label: taskLabel,
    },
    {
      icon: LanguageSquareIcon,
      label:
        resolveProviderTaskLanguageLabel(providerKind, payload) ??
        formatLocaleList(
          resolveProviderTargetLocales(providerKind, payload, input.externalTargetLocales ?? []),
        ) ??
        intl.formatMessage(messages.emptyValue),
    },
    {
      icon: File01Icon,
      label:
        (input.localeReadinessLoading ? intl.formatMessage(messages.loadingProgress) : wordsToDo) ??
        input.sourceFilesMetric ??
        intl.formatMessage(messages.sourceFilesLinked),
    },
    {
      icon: Clock01Icon,
      label: intl.formatMessage(messages.updatedAt, {
        date: formatJobDetailDate(input.updatedAt),
      }),
    },
  ];
}

export function jobDetailTaskProperties(
  input: JobDetailTaskLayoutInput,
  intl: IntlShape,
): {
  properties: JobDetailViewProperty[];
  secondaryProperties: JobDetailViewProperty[];
} {
  const payload = input.externalProviderPayload;
  const readiness = resolveTaskLocaleReadiness(input);
  const hasReadiness = readiness !== null;
  const progress = hasReadiness ? getProgressValue(readiness) : null;
  const progressLabel = input.localeReadinessLoading
    ? intl.formatMessage(messages.loadingProgress)
    : hasReadiness && progress !== null
      ? (formatReadinessProgress(readiness) ??
        intl.formatMessage(messages.percentTranslated, { progress }))
      : null;
  const providerName = formatProviderKind(input.externalProviderKind);
  const targetLocales = formatLocaleList(
    resolveProviderTargetLocales(
      input.externalProviderKind,
      payload,
      input.externalTargetLocales ?? [],
    ),
  );
  const taskType =
    resolveProviderTaskTypeLabel(input.externalProviderKind, payload, formatJobKind(input.kind)) ??
    formatJobKind(input.kind);
  const wordsToDo = formatWordsToDo(readiness);
  const emptyValue = intl.formatMessage(messages.emptyValue);

  const properties: JobDetailViewProperty[] = [
    {
      label: intl.formatMessage(messages.labelStatus),
      value: (
        <Badge
          variant="outline"
          className={cn("rounded-full", toneClass(statusTone(input.status)))}
        >
          {intl.formatMessage(getJobStatusMessage(input.status))}
        </Badge>
      ),
    },
    {
      label: intl.formatMessage(messages.labelProgress),
      value:
        progressLabel ??
        (input.externalStatus
          ? intl.formatMessage(messages.providerStatus, { status: input.externalStatus })
          : intl.formatMessage(getJobStatusMessage(input.status))),
    },
    { label: intl.formatMessage(messages.labelProvider), value: providerName },
    { label: intl.formatMessage(messages.labelTaskType), value: taskType },
    { label: intl.formatMessage(messages.labelTargetLocales), value: targetLocales },
    {
      label: intl.formatMessage(messages.labelAssignees),
      value:
        input.externalAssignedUsers && input.externalAssignedUsers.length > 0
          ? input.externalAssignedUsers.join(", ")
          : null,
    },
    {
      label: intl.formatMessage(messages.labelDueDate),
      value: formatJobDetailDate(input.externalDueDate),
    },
  ];

  if (wordsToDo) {
    properties.push({
      label: intl.formatMessage(messages.labelWordsToDo),
      value: wordsToDo,
    });
  }

  const secondaryProperties: JobDetailViewProperty[] = [
    {
      label: intl.formatMessage(messages.labelProject),
      value: input.projectName ?? input.projectId ?? emptyValue,
    },
    {
      label: intl.formatMessage(messages.labelLanguage),
      value: resolveProviderTaskLanguageLabel(input.externalProviderKind, payload) ?? emptyValue,
    },
    {
      label: intl.formatMessage(messages.labelExternalJobId),
      value: input.externalJobId,
    },
    {
      label: intl.formatMessage(messages.labelExternalTaskId),
      value: input.externalTaskId,
    },
  ];

  return { properties, secondaryProperties };
}

export function jobDetailTaskLayoutFromRecord(
  job: JobDetailRecord,
  intl: IntlShape,
): {
  input: JobDetailTaskLayoutInput;
  metrics: JobDetailViewMetric[];
  properties: JobDetailViewProperty[];
  secondaryProperties: JobDetailViewProperty[];
  title: string;
} {
  const sourcePath = getInputPayloadString(job, "sourceFileId");
  const input: JobDetailTaskLayoutInput = {
    id: job.id,
    title: job.externalTitle ?? sourcePath ?? job.id,
    status: job.status,
    updatedAt: job.updatedAt,
    externalProviderKind: job.externalProviderKind,
    externalStatus: job.externalStatus,
    externalDueDate: job.externalDueDate,
    externalTargetLocales: job.externalTargetLocales,
    externalAssignedUsers: job.externalAssignedUsers,
    externalJobId: job.externalJobId,
    externalTaskId: job.externalTaskId,
    externalProviderPayload: job.externalProviderPayload,
    projectId: job.projectId,
    projectName: job.projectName,
    kind: job.kind,
    sourceFilesMetric:
      sourcePath ??
      (isProviderBackedJob(job) ? null : intl.formatMessage(messages.sourceFilesLinked)),
  };

  const { properties, secondaryProperties } = jobDetailTaskProperties(input, intl);

  return {
    input,
    title: jobDetailTaskTitle(input),
    metrics: jobDetailTaskMetrics(input, intl),
    properties,
    secondaryProperties,
  };
}

export function jobDetailTaskLayoutFromLiveJob(
  job: TmsProviderLiveJobDetail,
  intl: IntlShape,
  options?: {
    localeReadinessLoading?: boolean;
    localeReadinessOverride?: Record<string, unknown> | null;
  },
): {
  input: JobDetailTaskLayoutInput;
  metrics: JobDetailViewMetric[];
  properties: JobDetailViewProperty[];
  secondaryProperties: JobDetailViewProperty[];
  title: string;
} {
  const input: JobDetailTaskLayoutInput = {
    id: job.id,
    title: job.externalTitle,
    status: job.status,
    updatedAt: job.updatedAt,
    externalProviderKind: job.externalProviderKind,
    externalStatus: job.externalStatus,
    externalDueDate: job.externalDueDate,
    externalTargetLocales: job.externalTargetLocales,
    externalAssignedUsers: job.externalAssignedUsers,
    externalJobId: job.externalJobId,
    externalTaskId: job.externalTaskId,
    externalProviderPayload: job.externalProviderPayload,
    projectId: job.projectId,
    projectName: job.projectName,
    kind: job.kind,
    localeReadinessLoading: options?.localeReadinessLoading,
    localeReadinessOverride: options?.localeReadinessOverride,
  };

  const { properties, secondaryProperties } = jobDetailTaskProperties(input, intl);

  return {
    input,
    title: jobDetailTaskTitle(input),
    metrics: jobDetailTaskMetrics(input, intl),
    properties,
    secondaryProperties,
  };
}
