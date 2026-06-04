"use client";

import type { ReactNode } from "react";

import {
  formatLocaleList,
  formatReadinessProgress,
  formatWordsToDo,
  getCrowdinFileCount,
  getCrowdinLanguageLabel,
  getCrowdinLocaleReadiness,
  getCrowdinTargetLocales,
  getCrowdinTaskTypeLabel,
  getProviderPayloadString,
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

export function ProviderCrowdinJobDetailRows<J extends CrowdinJobDetailSource>({
  job,
  providerPayload,
  organizationSlug,
  formatJobKind,
  formatDateTime,
  descriptionQueryKey,
  showProviderLink = true,
  extraRows,
}: {
  job: J;
  providerPayload: Record<string, unknown> | null;
  organizationSlug: string;
  formatJobKind: (job: J) => string;
  formatDateTime: (value: string | null | undefined) => string;
  descriptionQueryKey?: readonly unknown[];
  showProviderLink?: boolean;
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
  const crowdinFileCount = isCrowdin ? getCrowdinFileCount(providerPayload) : null;
  const crowdinLocaleReadiness = isCrowdin ? getCrowdinLocaleReadiness(providerPayload) : null;
  const crowdinProgress = formatReadinessProgress(crowdinLocaleReadiness);
  const crowdinWordsToDo = formatWordsToDo(crowdinLocaleReadiness);
  const canEditDescription =
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
            {canEditDescription && descriptionQueryKey ? (
              <ProviderJobDescriptionField
                organizationSlug={organizationSlug}
                encodedJobId={job.id}
                description={crowdinDescription ?? ""}
                editable
                queryKey={descriptionQueryKey}
              />
            ) : (
              <ProviderJobDescriptionField
                organizationSlug={organizationSlug}
                encodedJobId={job.id}
                description={crowdinDescription ?? ""}
                editable={false}
                queryKey={descriptionQueryKey ?? []}
              />
            )}
          </dd>
        </div>
      ) : null}
      {crowdinFileCount !== null ? (
        <JobDetailRow
          label="Resources"
          value={`${crowdinFileCount} file${crowdinFileCount === 1 ? "" : "s"}`}
        />
      ) : null}
      {crowdinProgress ? <JobDetailRow label="Progress" value={crowdinProgress} /> : null}
      {crowdinWordsToDo ? <JobDetailRow label="Words to do" value={crowdinWordsToDo} /> : null}
      <JobDetailRow label="Due date" value={formatDateTime(job.externalDueDate)} />
      <JobDetailRow label="Last sync" value={formatDateTime(job.updatedAt)} />
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
