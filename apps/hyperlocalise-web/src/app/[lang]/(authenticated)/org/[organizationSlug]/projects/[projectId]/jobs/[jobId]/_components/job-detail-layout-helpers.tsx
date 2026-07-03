"use client";

import {
  Clock01Icon,
  File01Icon,
  LanguageSquareIcon,
  Task01Icon,
} from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";
import { getTmsProviderBranding } from "@/lib/providers/tms-provider-branding";
import type { TmsProviderLiveJobDetail } from "@/lib/providers/tms-provider-live";

import { formatJobStatusLabel } from "../../../../../jobs/_components/jobs-page-view";
import { toneClass } from "../../../../../_components/workspace-resource-shared";
import {
  formatLocaleList,
  formatReadinessProgress,
  formatWordsToDo,
  getCrowdinLanguageLabel,
  getCrowdinTargetLocales,
  getCrowdinTaskTypeLabel,
  getReadinessNumber,
  resolveCrowdinLocaleReadiness,
} from "../../../../../jobs/_components/provider-crowdin-job-display";

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

  return resolveCrowdinLocaleReadiness(input.externalProviderPayload);
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

export function jobDetailTaskMetrics(input: JobDetailTaskLayoutInput): JobDetailViewMetric[] {
  const providerKind = input.externalProviderKind;
  const payload = input.externalProviderPayload;
  const readiness = resolveTaskLocaleReadiness(input);
  const wordsToDo = formatWordsToDo(readiness);
  const taskLabel = providerKind
    ? `${formatProviderKind(providerKind)} task`
    : `${formatJobKind(input.kind)} task`;

  return [
    {
      icon: Task01Icon,
      label: taskLabel,
    },
    {
      icon: LanguageSquareIcon,
      label:
        getCrowdinLanguageLabel(payload) ??
        formatLocaleList(getCrowdinTargetLocales(payload, input.externalTargetLocales ?? [])) ??
        "—",
    },
    {
      icon: File01Icon,
      label:
        (input.localeReadinessLoading ? "Loading progress..." : wordsToDo) ??
        input.sourceFilesMetric ??
        "Source files linked",
    },
    {
      icon: Clock01Icon,
      label: `Updated ${formatJobDetailDate(input.updatedAt)}`,
    },
  ];
}

export function jobDetailTaskProperties(input: JobDetailTaskLayoutInput): {
  properties: JobDetailViewProperty[];
  secondaryProperties: JobDetailViewProperty[];
} {
  const payload = input.externalProviderPayload;
  const readiness = resolveTaskLocaleReadiness(input);
  const hasReadiness = readiness !== null;
  const progress = hasReadiness ? getProgressValue(readiness) : null;
  const progressLabel = input.localeReadinessLoading
    ? "Loading progress..."
    : hasReadiness && progress !== null
      ? (formatReadinessProgress(readiness) ?? `${progress}% translated`)
      : null;
  const providerName = formatProviderKind(input.externalProviderKind);
  const targetLocales = formatLocaleList(
    getCrowdinTargetLocales(payload, input.externalTargetLocales ?? []),
  );
  const taskType = getCrowdinTaskTypeLabel(payload) ?? formatJobKind(input.kind);
  const wordsToDo = formatWordsToDo(readiness);

  const properties: JobDetailViewProperty[] = [
    {
      label: "Status",
      value: (
        <Badge
          variant="outline"
          className={cn("rounded-full", toneClass(statusTone(input.status)))}
        >
          {formatJobStatusLabel(input.status)}
        </Badge>
      ),
    },
    {
      label: "Progress",
      value:
        progressLabel ??
        (input.externalStatus
          ? `Provider status: ${input.externalStatus}`
          : formatJobStatusLabel(input.status)),
    },
    { label: "Provider", value: providerName },
    { label: "Task type", value: taskType },
    { label: "Target locales", value: targetLocales },
    {
      label: "Assignees",
      value:
        input.externalAssignedUsers && input.externalAssignedUsers.length > 0
          ? input.externalAssignedUsers.join(", ")
          : null,
    },
    { label: "Due date", value: formatJobDetailDate(input.externalDueDate) },
  ];

  if (wordsToDo) {
    properties.push({ label: "Words to do", value: wordsToDo });
  }

  const secondaryProperties: JobDetailViewProperty[] = [
    { label: "Project", value: input.projectName ?? input.projectId ?? "—" },
    {
      label: "Language",
      value: getCrowdinLanguageLabel(payload) ?? "—",
    },
    { label: "External job ID", value: input.externalJobId },
    { label: "External task ID", value: input.externalTaskId },
  ];

  return { properties, secondaryProperties };
}

export function jobDetailTaskLayoutFromRecord(job: JobDetailRecord): {
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
    sourceFilesMetric: sourcePath ?? (isProviderBackedJob(job) ? null : "Source files linked"),
  };

  const { properties, secondaryProperties } = jobDetailTaskProperties(input);

  return {
    input,
    title: jobDetailTaskTitle(input),
    metrics: jobDetailTaskMetrics(input),
    properties,
    secondaryProperties,
  };
}

export function jobDetailTaskLayoutFromLiveJob(
  job: TmsProviderLiveJobDetail,
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

  const { properties, secondaryProperties } = jobDetailTaskProperties(input);

  return {
    input,
    title: jobDetailTaskTitle(input),
    metrics: jobDetailTaskMetrics(input),
    properties,
    secondaryProperties,
  };
}
