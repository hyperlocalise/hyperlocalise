"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { AiMagicIcon, Comment01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { MarkdownDescriptionPreview } from "@/components/markdown-description-editor/markdown-description-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2 } from "@/components/ui/typography";
import { agentRunHasReviewableProposals } from "@/lib/providers/agent-runs/agent-run-proposals";
import type { JobProviderActionId } from "@/lib/providers/jobs/job-provider-actions";
import { cn } from "@/lib/primitives/cn";

import { toneClass } from "../../../../../_components/workspace-resource-shared";

import {
  countGlossaryMatchesInUsage,
  parseGlossaryUsageFromOutputSummary,
} from "@/lib/translation/agent-run-glossary";
import {
  countTranslationMemoryMatchesInUsage,
  parseTranslationMemoryUsageFromOutputSummary,
} from "@/lib/translation/agent-run-translation-memory";

import {
  formatLocaleList,
  getCrowdinLanguageLabel,
  getCrowdinTargetLocales,
  getProviderPayloadString,
} from "../../../../../jobs/_components/provider-crowdin-job-display";

import {
  formatJobDetailDate,
  type AgentRunRecord,
  type ProviderActionAvailability,
  type ProviderBackedJobFields,
} from "./job-detail-types";
import { jobProviderDetailSectionViewMessages as messages } from "./job-provider-detail-section-view.messages";

export type JobProviderExternalLinkRenderer = (props: { href: string; label: string }) => ReactNode;

export type JobProviderSourceFilesRenderer = (props: {
  job: ProviderBackedJobFields;
  organizationSlug: string;
  projectId: string;
}) => ReactNode;

export type JobProviderQaFindingsRenderer = (props: {
  agentRuns?: AgentRunRecord[];
  agentRunsLoading: boolean;
  job: ProviderBackedJobFields;
  jobId: string;
  organizationSlug: string;
  projectId: string | null;
}) => ReactNode;

export type JobProviderDiffReviewRenderer = (props: {
  agentRuns?: AgentRunRecord[];
  agentRunsLoading: boolean;
  jobId: string;
  organizationSlug: string;
}) => ReactNode;

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const intl = useIntl();

  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-sm text-subtle-foreground">
        {value ?? intl.formatMessage(messages.emptyValue)}
      </dd>
    </div>
  );
}

function actionIcon(actionId: JobProviderActionId) {
  switch (actionId) {
    case "leave_provider_comment":
      return Comment01Icon;
    case "push_approved_changes":
      return RefreshIcon;
    default:
      return AiMagicIcon;
  }
}

function agentRunTone(status: AgentRunRecord["status"]) {
  switch (status) {
    case "succeeded":
      return "safe";
    case "failed":
      return "risk";
    case "queued":
      return "watch";
    default:
      return "info";
  }
}

function defaultRenderExternalLink({
  href,
  label,
}: Parameters<JobProviderExternalLinkRenderer>[0]) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground underline decoration-border underline-offset-4 hover:decoration-muted-foreground"
    >
      {label}
    </Link>
  );
}

export function JobProviderDetailSectionView({
  agentRuns,
  agentRunsError,
  agentRunsLoading = false,
  job,
  jobId,
  onStartAgentRun,
  organizationSlug,
  pendingActionId,
  projectId,
  renderDiffReview,
  renderExternalLink = defaultRenderExternalLink,
  renderQaFindings,
  renderSourceFiles,
  showAgentActions = true,
  showProviderMetadata = true,
}: {
  agentRuns?: AgentRunRecord[];
  agentRunsError?: unknown;
  agentRunsLoading?: boolean;
  job: ProviderBackedJobFields;
  jobId: string;
  onStartAgentRun?: (actionId: JobProviderActionId) => void;
  organizationSlug: string;
  pendingActionId?: JobProviderActionId | null;
  projectId: string | null;
  renderDiffReview?: JobProviderDiffReviewRenderer;
  renderExternalLink?: JobProviderExternalLinkRenderer;
  renderQaFindings?: JobProviderQaFindingsRenderer;
  renderSourceFiles?: JobProviderSourceFilesRenderer;
  showAgentActions?: boolean;
  showProviderMetadata?: boolean;
}) {
  const intl = useIntl();
  const visibleActions = (job.providerActions ?? []).filter(
    (action) => action.visible && action.id !== "translate_with_agent",
  );
  const crowdinDescription =
    getProviderPayloadString(job.externalProviderPayload, "description")?.trim() ?? "";
  const [sourceFilesExpanded, setSourceFilesExpanded] = useState(false);

  return (
    <>
      {showProviderMetadata ? (
        <section className="rounded-lg border border-border bg-muted p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
              <FormattedMessage {...messages.providerDetailsHeading} />
            </TypographyH2>
            <Badge variant="outline" className="rounded-full capitalize">
              {job.externalProviderKind}
            </Badge>
          </div>
          <dl className="mt-3 divide-y divide-border">
            <DetailRow
              label={intl.formatMessage(messages.labelProviderTitle)}
              value={job.externalTitle}
            />
            <DetailRow
              label={intl.formatMessage(messages.labelProviderStatus)}
              value={job.externalStatus}
            />
            {job.externalProviderKind === "crowdin" ? (
              <>
                <DetailRow
                  label={intl.formatMessage(messages.labelLanguage)}
                  value={
                    getCrowdinLanguageLabel(job.externalProviderPayload) ??
                    intl.formatMessage(messages.emptyValue)
                  }
                />
                <DetailRow
                  label={intl.formatMessage(messages.labelTargetLocales)}
                  value={formatLocaleList(
                    getCrowdinTargetLocales(
                      job.externalProviderPayload,
                      job.externalTargetLocales ?? [],
                    ),
                  )}
                />
                <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-sm text-muted-foreground">
                    <FormattedMessage {...messages.labelDescription} />
                  </dt>
                  <dd className="min-w-0 text-sm text-subtle-foreground">
                    {crowdinDescription ? (
                      <MarkdownDescriptionPreview
                        value={crowdinDescription}
                        className="border-border bg-transparent"
                      />
                    ) : (
                      intl.formatMessage(messages.emptyValue)
                    )}
                  </dd>
                </div>
              </>
            ) : (
              <DetailRow
                label={intl.formatMessage(messages.labelTargetLocales)}
                value={job.externalTargetLocales?.join(", ")}
              />
            )}
            <DetailRow
              label={intl.formatMessage(messages.labelAssignees)}
              value={job.externalAssignedUsers?.join(", ")}
            />
            <DetailRow
              label={intl.formatMessage(messages.labelDeadline)}
              value={formatJobDetailDate(job.externalDueDate)}
            />
            <DetailRow
              label={intl.formatMessage(messages.labelExternalJobId)}
              value={job.externalJobId}
            />
            <DetailRow
              label={intl.formatMessage(messages.labelExternalTaskId)}
              value={job.externalTaskId}
            />
            <DetailRow
              label={intl.formatMessage(messages.labelProviderLink)}
              value={
                job.externalUrl
                  ? renderExternalLink({
                      href: job.externalUrl,
                      label: intl.formatMessage(messages.openInProvider, {
                        providerKind: job.externalProviderKind,
                      }),
                    })
                  : intl.formatMessage(messages.emptyValue)
              }
            />
            <DetailRow label={intl.formatMessage(messages.labelRawError)} value={job.lastError} />
          </dl>
        </section>
      ) : null}

      {projectId && renderSourceFiles ? (
        <section className="rounded-lg border border-border bg-muted p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
              <FormattedMessage {...messages.sourceFilesHeading} />
            </TypographyH2>
            {!sourceFilesExpanded ? (
              <Button size="sm" variant="outline" onClick={() => setSourceFilesExpanded(true)}>
                <FormattedMessage {...messages.showSourceFiles} />
              </Button>
            ) : null}
          </div>
          {sourceFilesExpanded ? (
            renderSourceFiles({ job, organizationSlug, projectId })
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              <FormattedMessage {...messages.sourceFilesCollapsedHint} />
            </p>
          )}
        </section>
      ) : null}

      {showAgentActions && visibleActions.length > 0 ? (
        <section className="rounded-lg border border-border bg-muted p-5">
          <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
            <FormattedMessage {...messages.agentActionsHeading} />
          </TypographyH2>
          <div className="mt-4 flex flex-wrap gap-2">
            {visibleActions.map((action: ProviderActionAvailability) => (
              <Button
                key={action.id}
                size="sm"
                variant={action.id === "push_approved_changes" ? "outline" : "default"}
                disabled={!action.enabled || Boolean(pendingActionId) || !onStartAgentRun}
                title={action.disabledReason}
                onClick={() => onStartAgentRun?.(action.id)}
              >
                <HugeiconsIcon icon={actionIcon(action.id)} strokeWidth={1.8} />
                {pendingActionId === action.id ? (
                  <FormattedMessage {...messages.starting} />
                ) : (
                  action.label
                )}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {renderQaFindings
        ? renderQaFindings({
            agentRuns,
            agentRunsLoading,
            job,
            jobId,
            organizationSlug,
            projectId,
          })
        : null}

      {renderDiffReview
        ? renderDiffReview({
            agentRuns,
            agentRunsLoading,
            jobId,
            organizationSlug,
          })
        : null}

      <section className="rounded-lg border border-border bg-muted p-5">
        <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
          <FormattedMessage {...messages.agentActivityHeading} />
        </TypographyH2>
        {agentRunsLoading ? <Skeleton className="mt-4 h-20 w-full bg-skeleton" /> : null}
        {agentRunsError ? (
          <p className="mt-4 text-sm text-flame-100">
            {agentRunsError instanceof Error ? (
              agentRunsError.message
            ) : (
              <FormattedMessage {...messages.unableToLoadAgentRuns} />
            )}
          </p>
        ) : null}
        {agentRuns && agentRuns.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {agentRuns.map((run) => {
              const hasProposals = agentRunHasReviewableProposals({
                kind: run.kind,
                status: run.status,
                changedItems: run.changedItems,
              });
              const proposedCount =
                typeof run.outputSummary.proposedCount === "number"
                  ? run.outputSummary.proposedCount
                  : run.changedItems.length;
              const translationMemoryUsage = parseTranslationMemoryUsageFromOutputSummary(
                run.outputSummary,
              );
              const translationMemoryMatchCount =
                countTranslationMemoryMatchesInUsage(translationMemoryUsage);
              const glossaryUsage = parseGlossaryUsageFromOutputSummary(run.outputSummary);
              const glossaryMatchCount = countGlossaryMatchesInUsage(glossaryUsage);

              return (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted.5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize text-foreground">
                      {run.kind.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        intl.formatMessage(messages.startedAt, {
                          date: formatJobDetailDate(run.createdAt),
                        }),
                        hasProposals
                          ? intl.formatMessage(messages.proposalsCount, {
                              count: proposedCount,
                            })
                          : null,
                        translationMemoryMatchCount > 0
                          ? intl.formatMessage(messages.tmMatchesCount, {
                              count: translationMemoryMatchCount,
                            })
                          : null,
                        glossaryMatchCount > 0
                          ? intl.formatMessage(messages.glossaryMatchesCount, {
                              count: glossaryMatchCount,
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {hasProposals ? (
                      <Badge variant="outline" className="rounded-full">
                        <FormattedMessage {...messages.reviewProposals} />
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      className={cn("rounded-full capitalize", toneClass(agentRunTone(run.status)))}
                    >
                      {run.status}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {agentRuns && agentRuns.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <FormattedMessage {...messages.noAgentRunsYet} />
          </p>
        ) : null}
      </section>
    </>
  );
}
