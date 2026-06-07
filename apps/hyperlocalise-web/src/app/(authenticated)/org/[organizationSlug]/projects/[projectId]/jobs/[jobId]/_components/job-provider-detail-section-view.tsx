"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AiMagicIcon, Comment01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { MarkdownDescriptionPreview } from "@/components/markdown-description-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2 } from "@/components/ui/typography";
import { agentRunHasReviewableProposals } from "@/lib/providers/agent-runs/agent-run-proposals";
import type { JobProviderActionId } from "@/lib/providers/job-provider-actions";
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
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-foreground/42">{label}</dt>
      <dd className="min-w-0 wrap-break-word text-sm text-foreground/74">{value ?? "—"}</dd>
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
      className="text-foreground underline decoration-foreground/24 underline-offset-4 hover:decoration-foreground/48"
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
}) {
  const visibleActions = (job.providerActions ?? []).filter((action) => action.visible);
  const crowdinDescription =
    getProviderPayloadString(job.externalProviderPayload, "description")?.trim() ?? "";

  return (
    <>
      <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
            Provider Details
          </TypographyH2>
          <Badge variant="outline" className="rounded-full capitalize">
            {job.externalProviderKind}
          </Badge>
        </div>
        <dl className="mt-3 divide-y divide-foreground/8">
          <DetailRow label="Provider title" value={job.externalTitle} />
          <DetailRow label="Provider status" value={job.externalStatus} />
          <DetailRow label="Sync state" value={job.externalSyncState} />
          <DetailRow label="Last sync" value={formatJobDetailDate(job.updatedAt)} />
          {job.externalProviderKind === "crowdin" ? (
            <>
              <DetailRow
                label="Language"
                value={getCrowdinLanguageLabel(job.externalProviderPayload) ?? "—"}
              />
              <DetailRow
                label="Target locales"
                value={formatLocaleList(
                  getCrowdinTargetLocales(
                    job.externalProviderPayload,
                    job.externalTargetLocales ?? [],
                  ),
                )}
              />
              <div className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-sm text-foreground/42">Description</dt>
                <dd className="min-w-0 text-sm text-foreground/74">
                  {crowdinDescription ? (
                    <MarkdownDescriptionPreview
                      value={crowdinDescription}
                      className="border-foreground/8 bg-transparent"
                    />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </>
          ) : (
            <DetailRow label="Target locales" value={job.externalTargetLocales?.join(", ")} />
          )}
          <DetailRow label="Assignees" value={job.externalAssignedUsers?.join(", ")} />
          <DetailRow label="Deadline" value={formatJobDetailDate(job.externalDueDate)} />
          <DetailRow label="External job ID" value={job.externalJobId} />
          <DetailRow label="External task ID" value={job.externalTaskId} />
          <DetailRow
            label="Provider link"
            value={
              job.externalUrl
                ? renderExternalLink({
                    href: job.externalUrl,
                    label: `Open in ${job.externalProviderKind}`,
                  })
                : "—"
            }
          />
          <DetailRow label="Raw error" value={job.lastError} />
        </dl>
      </section>

      {projectId && renderSourceFiles
        ? renderSourceFiles({ job, organizationSlug, projectId })
        : null}

      {visibleActions.length > 0 ? (
        <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
          <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
            Agent Actions
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
                {pendingActionId === action.id ? "Starting..." : action.label}
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

      <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
        <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
          Agent Activity
        </TypographyH2>
        {agentRunsLoading ? <Skeleton className="mt-4 h-20 w-full bg-foreground/8" /> : null}
        {agentRunsError ? (
          <p className="mt-4 text-sm text-flame-100">
            {agentRunsError instanceof Error ? agentRunsError.message : "Unable to load agent runs"}
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
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/8 bg-foreground/3.5 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize text-foreground/82">
                      {run.kind.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs text-foreground/48">
                      Started {formatJobDetailDate(run.createdAt)}
                      {hasProposals ? ` · ${proposedCount} proposals` : null}
                      {translationMemoryMatchCount > 0
                        ? ` · ${translationMemoryMatchCount} TM match${translationMemoryMatchCount === 1 ? "" : "es"}`
                        : null}
                      {glossaryMatchCount > 0
                        ? ` · ${glossaryMatchCount} glossary match${glossaryMatchCount === 1 ? "" : "es"}`
                        : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {hasProposals ? (
                      <Badge variant="outline" className="rounded-full">
                        Review proposals
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
          <p className="mt-4 text-sm text-foreground/48">No agent runs yet.</p>
        ) : null}
      </section>
    </>
  );
}
