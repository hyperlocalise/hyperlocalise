"use client";

import type { ReactNode } from "react";

import {
  formatLocaleList,
  formatReadinessProgress,
  formatWordsToDo,
  getCrowdinLanguageLabel,
  getCrowdinTargetLocales,
  getCrowdinTaskTypeLabel,
  getProviderPayloadString,
  resolveCrowdinLocaleReadiness,
} from "./provider-crowdin-job-display";
import { ProviderJobDescriptionField } from "./provider-job-description-field";

function JobDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-foreground/42">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-sm text-foreground/74">{value ?? "—"}</dd>
    </div>
  );
}

export type CrowdinJobDetailSource = {
  id: string;
  externalProviderKind?: string | null;
  externalTargetLocales?: string[] | null;
  externalStatus?: string | null;
  status?: string | null;
  projectName?: string | null;
  externalDueDate?: string | null;
  updatedAt?: string | null;
  externalJobId?: string | null;
  externalUrl?: string | null;
  kind?: string | null;
  type?: string | null;
};

export type ProviderJobDescriptionFieldRenderer = (props: {
  organizationSlug: string;
  encodedJobId: string;
  description: string;
  editable: boolean;
  queryKey: readonly unknown[];
}) => ReactNode;

const renderProviderJobDescriptionField: ProviderJobDescriptionFieldRenderer = (props) => (
  <ProviderJobDescriptionField {...props} />
);

export function ProviderCrowdinJobDetailRows<J extends CrowdinJobDetailSource>({
  job,
  providerPayload,
  organizationSlug,
  formatJobKind,
  formatDateTime,
  descriptionQueryKey,
  canEditDescription,
  showProviderLink = true,
  localeReadinessLoading = false,
  localeReadinessOverride,
  renderDescriptionField = renderProviderJobDescriptionField,
  extraRows,
}: {
  job: J;
  providerPayload: Record<string, unknown> | null;
  organizationSlug: string;
  formatJobKind: (job: J) => string;
  formatDateTime: (value: string | null | undefined) => string;
  descriptionQueryKey?: readonly unknown[];
  canEditDescription?: boolean;
  showProviderLink?: boolean;
  localeReadinessLoading?: boolean;
  localeReadinessOverride?: Record<string, unknown> | null;
  renderDescriptionField?: ProviderJobDescriptionFieldRenderer;
  extraRows?: ReactNode;
}) {
  const isCrowdin = job.externalProviderKind === "crowdin";
  const crowdinTaskType = isCrowdin ? getCrowdinTaskTypeLabel(providerPayload) : null;
  const crowdinLanguage = isCrowdin ? getCrowdinLanguageLabel(providerPayload) : null;
  const crowdinTargetLocales = isCrowdin
    ? formatLocaleList(getCrowdinTargetLocales(providerPayload, job.externalTargetLocales ?? []))
    : formatLocaleList(job.externalTargetLocales ?? []);
  const crowdinDescription = isCrowdin
    ? getProviderPayloadString(providerPayload, "description")
    : null;
  const crowdinLocaleReadiness = isCrowdin
    ? (localeReadinessOverride ?? resolveCrowdinLocaleReadiness(providerPayload))
    : null;
  const crowdinProgress = localeReadinessLoading
    ? "Loading progress..."
    : formatReadinessProgress(crowdinLocaleReadiness);
  const crowdinWordsToDo = localeReadinessLoading ? null : formatWordsToDo(crowdinLocaleReadiness);
  const canEditProviderDescription =
    isCrowdin && job.id.startsWith("ext:") && Boolean(descriptionQueryKey?.length);

  return (
    <>
      <JobDetailRow label="Task type" value={crowdinTaskType ?? formatJobKind(job)} />
      {isCrowdin ? <JobDetailRow label="Language" value={crowdinLanguage ?? "—"} /> : null}
      <JobDetailRow label="Project" value={job.projectName ?? "Workspace"} />
      <JobDetailRow label="Target locales" value={crowdinTargetLocales} />
      {isCrowdin ? (
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm text-foreground/42">Description</dt>
          <dd className="min-w-0">
            {renderDescriptionField({
              organizationSlug,
              encodedJobId: job.id,
              description: crowdinDescription ?? "",
              editable: Boolean(
                canEditDescription && canEditProviderDescription && descriptionQueryKey,
              ),
              queryKey: descriptionQueryKey ?? [],
            })}
          </dd>
        </div>
      ) : null}
      {crowdinProgress || localeReadinessLoading ? (
        <JobDetailRow label="Progress" value={crowdinProgress ?? "Loading progress..."} />
      ) : null}
      {crowdinWordsToDo ? <JobDetailRow label="Words to do" value={crowdinWordsToDo} /> : null}
      <JobDetailRow label="Due date" value={formatDateTime(job.externalDueDate)} />
      {job.externalJobId ? (
        <JobDetailRow label="External job ID" value={job.externalJobId} />
      ) : null}
      {showProviderLink && job.externalUrl ? (
        <JobDetailRow
          label="Provider link"
          value={
            <a
              href={job.externalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground underline decoration-foreground/24 underline-offset-4 hover:decoration-foreground/48"
            >
              Open in {job.externalProviderKind}
            </a>
          }
        />
      ) : null}
      {extraRows}
    </>
  );
}

export { JobDetailRow };
