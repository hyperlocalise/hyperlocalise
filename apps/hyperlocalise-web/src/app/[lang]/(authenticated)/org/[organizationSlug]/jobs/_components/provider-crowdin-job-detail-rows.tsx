"use client";

import type { ReactNode } from "react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import {
  formatLocaleList,
  getCrowdinLanguageLabel,
  getCrowdinTargetLocales,
  getProviderPayloadNumber,
  getProviderPayloadString,
  getReadinessNumber,
  getReadinessWords,
  resolveCrowdinLocaleReadiness,
} from "./provider-crowdin-job-display";
import { ProviderJobDescriptionField } from "./provider-job-description-field";
import { providerCrowdinJobDetailRowsMessages } from "./provider-crowdin-job-detail-rows.messages";

function JobDetailRow({ label, value }: { label: string; value: ReactNode }) {
  const intl = useIntl();
  const emptyValue = intl.formatMessage(providerCrowdinJobDetailRowsMessages.emptyValue);

  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-sm text-subtle-foreground">
        {value ?? emptyValue}
      </dd>
    </div>
  );
}

function formatCrowdinTaskTypeLabel(
  providerPayload: Record<string, unknown> | null,
  intl: IntlShape,
) {
  switch (getProviderPayloadNumber(providerPayload, "type")) {
    case 0:
      return intl.formatMessage(providerCrowdinJobDetailRowsMessages.crowdinTypeTranslateOwn);
    case 1:
      return intl.formatMessage(providerCrowdinJobDetailRowsMessages.crowdinTypeProofreadOwn);
    case 2:
      return intl.formatMessage(providerCrowdinJobDetailRowsMessages.crowdinTypeTranslateVendor);
    case 3:
      return intl.formatMessage(providerCrowdinJobDetailRowsMessages.crowdinTypeProofreadVendor);
    default:
      return null;
  }
}

function formatLocalizedReadinessProgress(
  readiness: Record<string, unknown> | null,
  intl: IntlShape,
) {
  const translationProgress = getReadinessNumber(readiness, "translationProgress");
  const approvalProgress = getReadinessNumber(readiness, "approvalProgress");
  if (translationProgress === null && approvalProgress === null) return null;
  if (approvalProgress === null) {
    return intl.formatMessage(providerCrowdinJobDetailRowsMessages.translatedPercent, {
      percent: Math.round(translationProgress ?? 0),
    });
  }
  if (translationProgress === null) {
    return intl.formatMessage(providerCrowdinJobDetailRowsMessages.approvedPercent, {
      percent: Math.round(approvalProgress),
    });
  }
  return intl.formatMessage(providerCrowdinJobDetailRowsMessages.translatedAndApprovedPercent, {
    translatedPercent: Math.round(translationProgress),
    approvedPercent: Math.round(approvalProgress),
  });
}

function formatLocalizedWordsToDo(readiness: Record<string, unknown> | null, intl: IntlShape) {
  const words = getReadinessWords(readiness);
  const total = getReadinessNumber(words, "total");
  const translated = getReadinessNumber(words, "translated");
  const approved = getReadinessNumber(words, "approved");
  if (total === null) return null;
  const completed = translated ?? approved ?? 0;
  const remaining = Math.max(total - completed, 0);
  return intl.formatMessage(providerCrowdinJobDetailRowsMessages.wordsLeftOfTotal, {
    remaining,
    total,
  });
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
  const intl = useIntl();
  const isCrowdin = job.externalProviderKind === "crowdin";
  const crowdinTaskType = isCrowdin ? formatCrowdinTaskTypeLabel(providerPayload, intl) : null;
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
  const loadingProgress = intl.formatMessage(providerCrowdinJobDetailRowsMessages.loadingProgress);
  const crowdinProgress = localeReadinessLoading
    ? loadingProgress
    : formatLocalizedReadinessProgress(crowdinLocaleReadiness, intl);
  const crowdinWordsToDo = localeReadinessLoading
    ? null
    : formatLocalizedWordsToDo(crowdinLocaleReadiness, intl);
  const canEditProviderDescription =
    isCrowdin && job.id.startsWith("ext:") && Boolean(descriptionQueryKey?.length);

  return (
    <>
      <JobDetailRow
        label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.taskType)}
        value={crowdinTaskType ?? formatJobKind(job)}
      />
      {isCrowdin ? (
        <JobDetailRow
          label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.language)}
          value={
            crowdinLanguage ?? intl.formatMessage(providerCrowdinJobDetailRowsMessages.emptyValue)
          }
        />
      ) : null}
      <JobDetailRow
        label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.project)}
        value={
          job.projectName ??
          intl.formatMessage(providerCrowdinJobDetailRowsMessages.workspaceFallback)
        }
      />
      <JobDetailRow
        label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.targetLocales)}
        value={crowdinTargetLocales}
      />
      {isCrowdin ? (
        <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm text-muted-foreground">
            <FormattedMessage {...providerCrowdinJobDetailRowsMessages.description} />
          </dt>
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
        <JobDetailRow
          label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.progress)}
          value={crowdinProgress ?? loadingProgress}
        />
      ) : null}
      {crowdinWordsToDo ? (
        <JobDetailRow
          label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.wordsToDo)}
          value={crowdinWordsToDo}
        />
      ) : null}
      <JobDetailRow
        label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.dueDate)}
        value={formatDateTime(job.externalDueDate)}
      />
      {job.externalJobId ? (
        <JobDetailRow
          label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.externalJobId)}
          value={job.externalJobId}
        />
      ) : null}
      {showProviderLink && job.externalUrl ? (
        <JobDetailRow
          label={intl.formatMessage(providerCrowdinJobDetailRowsMessages.providerLink)}
          value={
            <a
              href={job.externalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-muted-foreground"
            >
              <FormattedMessage
                {...providerCrowdinJobDetailRowsMessages.openInProvider}
                values={{ provider: job.externalProviderKind }}
              />
            </a>
          }
        />
      ) : null}
      {extraRows}
    </>
  );
}

export { JobDetailRow };
