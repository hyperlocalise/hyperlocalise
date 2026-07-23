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
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AiMagicIcon,
  Comment01Icon,
  Search01Icon,
  ShieldEnergyIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH2 } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import type { JobProviderActionId } from "@/lib/providers/jobs/job-provider-actions";
import type { ProviderQaFinding, ProviderQaSeverity } from "@/lib/providers/provider-job-qa/types";
import type { ProviderReviewThread } from "@/lib/providers/provider-job-review/types";
import { cn } from "@/lib/primitives/cn";

import { toneClass, type Tone } from "../../../../../_components/workspace-resource-shared";

import type { AgentRunRecord, ProviderActionAvailability } from "./job-provider-detail-section";
import {
  attachFindingIds,
  buildProjectFilesHref,
  collectFilterOptions,
  filterFindings,
  formatCheckTypeLabel,
  formatProviderCommentWriteBackLabel,
  groupFindings,
  formatReviewAuthorLabel,
  formatReviewThreadKindLabel,
  formatReviewThreadStateLabel,
  indexProviderCommentWriteBackFromAgentRuns,
  isProviderCommentWriteBackComplete,
  isProviderReviewFindingsAgentRun,
  isReviewWithAgentRun,
  parseProviderReviewReportFromOutputSummary,
  parseQaReportFromOutputSummary,
  type ProviderCommentWriteBackStatus,
  type QaFindingGroupBy,
  type QaFindingWithId,
} from "./job-qa-findings-model";
import { jobQaFindingsSectionMessages as messages } from "./job-qa-findings-section.messages";

function reviewThreadStateTone(state: ProviderReviewThread["state"]): Tone {
  switch (state) {
    case "open":
      return "watch";
    case "resolved":
      return "safe";
    default:
      return "info";
  }
}

function severityTone(severity: ProviderQaSeverity): Tone {
  switch (severity) {
    case "error":
      return "risk";
    case "warning":
      return "watch";
    default:
      return "info";
  }
}

function parseActionError(response: Response, fallback: string) {
  return response
    .json()
    .then((body: { error?: string; message?: string }) => body.message ?? body.error)
    .catch(() => null)
    .then((error) => (error ? `${fallback}: ${error}` : `${fallback} (${response.status})`));
}

function ProviderReviewSummaryChips({
  summary,
}: {
  summary: { total: number; open: number; resolved: number };
}) {
  const intl = useIntl();
  const entries: Array<{ label: string; count: number; tone: Tone }> = [
    { label: intl.formatMessage(messages.threads), count: summary.total, tone: "info" },
    { label: intl.formatMessage(messages.open), count: summary.open, tone: "watch" },
    { label: intl.formatMessage(messages.resolved), count: summary.resolved, tone: "safe" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map((entry) => (
        <Badge
          key={entry.label}
          variant="outline"
          className={cn("rounded-full capitalize", toneClass(entry.tone))}
        >
          <FormattedMessage
            {...messages.summaryChip}
            values={{ label: entry.label, count: entry.count }}
          />
        </Badge>
      ))}
    </div>
  );
}

function ProviderReviewThreadRow({
  thread,
  organizationSlug,
  projectId,
}: {
  thread: ProviderReviewThread;
  organizationSlug: string;
  projectId: string | null;
}) {
  const primaryComment = thread.comments[0];
  const body = primaryComment?.body ?? thread.subject ?? "";
  const authorLabel = formatReviewAuthorLabel(thread.author ?? primaryComment?.author);
  const contentHref =
    projectId && thread.item
      ? buildProjectFilesHref({
          organizationSlug,
          projectId,
          key: thread.item.key,
          locale: thread.item.locale ?? thread.locale ?? undefined,
        })
      : null;
  const providerUrl = thread.providerContext.providerUrl;

  return (
    <li className="rounded-md border border-border bg-muted.5 px-3 py-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "rounded-full capitalize",
              toneClass(reviewThreadStateTone(thread.state)),
            )}
          >
            {formatReviewThreadStateLabel(thread.state)}
          </Badge>
          <Badge variant="outline" className="rounded-full capitalize text-subtle-foreground">
            {formatReviewThreadKindLabel(thread.kind)}
          </Badge>
          {thread.locale ? (
            <Badge variant="outline" className="rounded-full text-subtle-foreground">
              {thread.locale}
            </Badge>
          ) : null}
          {thread.issueType ? (
            <Badge variant="outline" className="rounded-full text-subtle-foreground">
              {thread.issueType.replaceAll("_", " ")}
            </Badge>
          ) : null}
        </div>
        {body ? <p className="text-sm text-foreground">{body}</p> : null}
        {thread.comments.length > 1 ? (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage
              {...messages.commentsInThread}
              values={{ count: thread.comments.length }}
            />
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {authorLabel ? <span>{authorLabel}</span> : null}
          {thread.createdAt ? <span>{thread.createdAt}</span> : null}
          {thread.item?.key ? <span className="font-mono">{thread.item.key}</span> : null}
          {contentHref ? (
            <Link
              href={contentHref}
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-muted-foreground"
            >
              <FormattedMessage {...messages.viewInProjectFiles} />
            </Link>
          ) : null}
          {providerUrl ? (
            <Link
              href={providerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline decoration-border underline-offset-4 hover:decoration-muted-foreground"
            >
              <FormattedMessage {...messages.openInTms} />
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function QaSummaryChips({
  summary,
}: {
  summary: { total: number; bySeverity: Record<string, number> };
}) {
  const intl = useIntl();
  const entries: Array<{ label: string; count: number; tone: Tone }> = [
    { label: intl.formatMessage(messages.total), count: summary.total, tone: "info" },
    {
      label: intl.formatMessage(messages.errors),
      count: summary.bySeverity.error ?? 0,
      tone: "risk",
    },
    {
      label: intl.formatMessage(messages.warnings),
      count: summary.bySeverity.warning ?? 0,
      tone: "watch",
    },
    {
      label: intl.formatMessage(messages.info),
      count: summary.bySeverity.info ?? 0,
      tone: "info",
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {entries.map((entry) => (
        <Badge
          key={entry.label}
          variant="outline"
          className={cn("rounded-full capitalize", toneClass(entry.tone))}
        >
          <FormattedMessage
            {...messages.summaryChip}
            values={{ label: entry.label, count: entry.count }}
          />
        </Badge>
      ))}
    </div>
  );
}

function writeBackTone(status: ProviderCommentWriteBackStatus["status"]): Tone {
  switch (status) {
    case "posted":
      return "safe";
    case "skipped":
      return "info";
    default:
      return "risk";
  }
}

function FindingRow({
  finding,
  selected,
  onToggle,
  organizationSlug,
  projectId,
  externalUrl,
  writeBack,
}: {
  finding: QaFindingWithId;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  organizationSlug: string;
  projectId: string | null;
  externalUrl: string | null;
  writeBack?: ProviderCommentWriteBackStatus;
}) {
  const intl = useIntl();
  const writeBackLabel = formatProviderCommentWriteBackLabel(writeBack, intl);
  const writeBackComplete = isProviderCommentWriteBackComplete(writeBack);
  const commentProviderUrl = writeBack?.providerUrl ?? null;

  const contentHref = projectId
    ? buildProjectFilesHref({
        organizationSlug,
        projectId,
        key: finding.item.key,
        locale: finding.item.locale,
      })
    : null;

  return (
    <li className="rounded-md border border-border bg-muted.5 px-3 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <label className="mt-0.5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
            checked={selected}
            disabled={writeBackComplete}
            title={
              writeBackComplete ? intl.formatMessage(messages.findingAlreadyHasComment) : undefined
            }
            onChange={(event) => onToggle(finding.id, event.currentTarget.checked)}
          />
        </label>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn("rounded-full capitalize", toneClass(severityTone(finding.severity)))}
            >
              {finding.severity}
            </Badge>
            <Badge variant="outline" className="rounded-full capitalize text-subtle-foreground">
              {formatCheckTypeLabel(finding.checkType)}
            </Badge>
            {finding.item.locale ? (
              <Badge variant="outline" className="rounded-full text-subtle-foreground">
                {finding.item.locale}
              </Badge>
            ) : null}
            {finding.item.field ? (
              <Badge variant="outline" className="rounded-full capitalize text-subtle-foreground">
                {finding.item.field}
              </Badge>
            ) : null}
            {typeof finding.confidence === "number" ? (
              <Badge variant="outline" className="rounded-full text-subtle-foreground">
                <FormattedMessage
                  {...messages.confidencePercent}
                  values={{ percent: Math.round(finding.confidence * 100) }}
                />
              </Badge>
            ) : null}
            {writeBackLabel && writeBack ? (
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full capitalize",
                  toneClass(writeBackTone(writeBack.status)),
                )}
              >
                {writeBackLabel}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-foreground">{finding.message}</p>
          {finding.suggestedFix ? (
            <p className="text-xs text-muted-foreground">{finding.suggestedFix}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-mono text-muted-foreground">{finding.item.key}</span>
            {contentHref ? (
              <Link
                href={contentHref}
                className="text-foreground underline decoration-border underline-offset-4 hover:decoration-muted-foreground"
              >
                <FormattedMessage {...messages.viewInProjectFiles} />
              </Link>
            ) : null}
            {externalUrl ? (
              <Link
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline decoration-border underline-offset-4 hover:decoration-muted-foreground"
              >
                <FormattedMessage {...messages.openInTms} />
              </Link>
            ) : null}
            {commentProviderUrl ? (
              <Link
                href={commentProviderUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline decoration-border underline-offset-4 hover:decoration-muted-foreground"
              >
                <FormattedMessage {...messages.viewProviderComment} />
              </Link>
            ) : null}
            {writeBack?.status === "failed" ? (
              <span
                className="text-muted-foreground"
                title={writeBack.message?.trim() || undefined}
              >
                <FormattedMessage {...messages.couldNotPostComment} />
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function JobQaFindingsSection({
  jobId,
  organizationSlug,
  projectId,
  externalUrl,
  agentRuns,
  agentRunsLoading,
  providerActions,
  onAgentRunStarted,
}: {
  jobId: string;
  organizationSlug: string;
  projectId: string | null;
  externalUrl: string | null;
  agentRuns: AgentRunRecord[] | undefined;
  agentRunsLoading: boolean;
  providerActions: ProviderActionAvailability[];
  onAgentRunStarted: () => Promise<void>;
}) {
  const intl = useIntl();
  const [groupBy, setGroupBy] = useState<QaFindingGroupBy>("severity");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [localeFilter, setLocaleFilter] = useState("all");
  const [checkTypeFilter, setCheckTypeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inlineReport, setInlineReport] = useState<{
    findings: ProviderQaFinding[];
    summary: { total: number; bySeverity: Record<string, number> };
    pullRunId: string;
  } | null>(null);

  const latestQaRun = useMemo(() => {
    if (!agentRuns) {
      return null;
    }

    return (
      agentRuns.find(
        (run) => isProviderReviewFindingsAgentRun(run.inputSnapshot) && run.status === "succeeded",
      ) ?? null
    );
  }, [agentRuns]);

  const latestReviewAgentRun = useMemo(() => {
    if (!agentRuns) {
      return null;
    }

    return (
      agentRuns.find(
        (run) => isReviewWithAgentRun(run.inputSnapshot) && run.status === "succeeded",
      ) ?? null
    );
  }, [agentRuns]);

  const providerReviewReport = useMemo(
    () => parseProviderReviewReportFromOutputSummary(latestReviewAgentRun?.outputSummary),
    [latestReviewAgentRun],
  );

  const activeQaRun = useMemo(() => {
    if (!agentRuns) {
      return null;
    }

    return (
      agentRuns.find(
        (run) =>
          isProviderReviewFindingsAgentRun(run.inputSnapshot) &&
          (run.status === "queued" || run.status === "running"),
      ) ?? null
    );
  }, [agentRuns]);

  const report = useMemo(() => {
    if (inlineReport) {
      return inlineReport;
    }

    const parsed = parseQaReportFromOutputSummary(latestQaRun?.outputSummary);
    if (!parsed) {
      return null;
    }

    const pullRunId = latestQaRun?.outputSummary?.pullRunId;

    return {
      findings: parsed.findings,
      summary: parsed.summary,
      pullRunId: typeof pullRunId === "string" ? pullRunId : "",
    };
  }, [inlineReport, latestQaRun]);

  const findingsWithIds = useMemo(
    () => (report ? attachFindingIds(report.findings) : []),
    [report],
  );

  const writeBackByFindingId = useMemo(
    () => indexProviderCommentWriteBackFromAgentRuns(agentRuns ?? []),
    [agentRuns],
  );

  const filterOptions = useMemo(() => collectFilterOptions(findingsWithIds), [findingsWithIds]);

  const filteredFindings = useMemo(
    () =>
      filterFindings(findingsWithIds, {
        severity: severityFilter,
        locale: localeFilter,
        checkType: checkTypeFilter,
        search: searchQuery,
      }),
    [findingsWithIds, severityFilter, localeFilter, checkTypeFilter, searchQuery],
  );

  const groupedFindings = useMemo(
    () => groupFindings(filteredFindings, groupBy, intl),
    [filteredFindings, groupBy, intl],
  );

  const selectedFindings = useMemo(
    () => findingsWithIds.filter((finding) => selectedIds.has(finding.id)),
    [findingsWithIds, selectedIds],
  );

  const commentableSelectedFindings = useMemo(
    () =>
      selectedFindings.filter(
        (finding) => !isProviderCommentWriteBackComplete(writeBackByFindingId.get(finding.id)),
      ),
    [selectedFindings, writeBackByFindingId],
  );

  const runQaChecksAction = providerActions.find((action) => action.id === "run_qa_checks");
  const fixQaAction = providerActions.find((action) => action.id === "fix_qa_issues");
  const commentAction = providerActions.find((action) => action.id === "leave_provider_comment");

  const runSyncQa = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].qa.$post({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(
          await parseActionError(response, intl.formatMessage(messages.failedToRunQaChecks)),
        );
      }

      const body = (await response.json()) as {
        qaReport: {
          findings: ProviderQaFinding[];
          summary: { total: number; bySeverity: Record<string, number> };
          pullRunId: string;
        };
      };

      return body.qaReport;
    },
    onSuccess: (qaReport) => {
      setInlineReport(qaReport);
      setSelectedIds(new Set());
      toast.success(
        intl.formatMessage(messages.qaChecksFinished, { count: qaReport.summary.total }),
      );
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.failedToRunQaChecks),
      );
    },
  });

  const startAgentAction = useMutation({
    mutationFn: async (input: {
      action: JobProviderActionId;
      selectedFindings?: ProviderQaFinding[];
    }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"][
        "agent-runs"
      ].$post({
        param: { organizationSlug, jobId },
        json: {
          action: input.action,
          ...(input.selectedFindings && input.selectedFindings.length > 0
            ? { selectedFindings: input.selectedFindings }
            : {}),
        },
      });

      if (!response.ok) {
        throw new Error(
          await parseActionError(response, intl.formatMessage(messages.failedToStartAgentRun)),
        );
      }

      return response.json();
    },
    onSuccess: async () => {
      setSelectedIds(new Set());
      await onAgentRunStarted();
      toast.success(intl.formatMessage(messages.agentRunQueued));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : intl.formatMessage(messages.failedToStartAgentRun),
      );
    },
  });

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = new Set(findingsWithIds.map((finding) => finding.id));
      const next = new Set(
        [...current].filter(
          (id) =>
            valid.has(id) && !isProviderCommentWriteBackComplete(writeBackByFindingId.get(id)),
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [findingsWithIds, writeBackByFindingId]);

  function toggleFinding(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function toggleGroup(findings: QaFindingWithId[], checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const finding of findings) {
        if (checked) {
          next.add(finding.id);
        } else {
          next.delete(finding.id);
        }
      }
      return next;
    });
  }

  const filteredCount = filteredFindings.length;
  const activeFilterCount = [severityFilter, localeFilter, checkTypeFilter].filter(
    (value) => value !== "all",
  ).length;

  return (
    <section className="rounded-lg border border-border bg-muted p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
            <FormattedMessage {...messages.reviewFindingsHeading} />
          </TypographyH2>
          <p className="mt-1 text-sm text-muted-foreground">
            <FormattedMessage {...messages.reviewFindingsDescription} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {runQaChecksAction?.visible ? (
            <Button
              size="sm"
              variant="outline"
              disabled={
                !runQaChecksAction.enabled || runSyncQa.isPending || startAgentAction.isPending
              }
              title={runQaChecksAction.disabledReason}
              onClick={() => runSyncQa.mutate()}
            >
              {runSyncQa.isPending ? (
                <FormattedMessage {...messages.running} />
              ) : (
                <FormattedMessage {...messages.runChecksNow} />
              )}
            </Button>
          ) : null}
          {fixQaAction?.visible ? (
            <Button
              size="sm"
              disabled={
                !fixQaAction.enabled || selectedFindings.length === 0 || startAgentAction.isPending
              }
              title={
                selectedFindings.length === 0
                  ? intl.formatMessage(messages.selectAtLeastOneFinding)
                  : fixQaAction.disabledReason
              }
              onClick={() =>
                startAgentAction.mutate({
                  action: "fix_qa_issues",
                  selectedFindings,
                })
              }
            >
              <HugeiconsIcon icon={AiMagicIcon} strokeWidth={1.8} />
              <FormattedMessage
                {...messages.fixSelected}
                values={{ count: selectedFindings.length }}
              />
            </Button>
          ) : null}
          {commentAction?.visible ? (
            <Button
              size="sm"
              variant="outline"
              disabled={
                !commentAction.enabled ||
                commentableSelectedFindings.length === 0 ||
                startAgentAction.isPending
              }
              title={
                !commentAction.enabled
                  ? commentAction.disabledReason
                  : commentableSelectedFindings.length === 0
                    ? selectedFindings.length > 0
                      ? intl.formatMessage(messages.selectedAlreadyHaveComments)
                      : intl.formatMessage(messages.selectAtLeastOneFinding)
                    : undefined
              }
              onClick={() =>
                startAgentAction.mutate({
                  action: "leave_provider_comment",
                  selectedFindings: commentableSelectedFindings,
                })
              }
            >
              <HugeiconsIcon icon={Comment01Icon} strokeWidth={1.8} />
              <FormattedMessage
                {...messages.commentOnSelected}
                values={{ count: commentableSelectedFindings.length }}
              />
            </Button>
          ) : null}
        </div>
      </div>

      {agentRunsLoading ? <Skeleton className="mt-4 h-24 w-full bg-skeleton" /> : null}

      {activeQaRun ? (
        <p className="mt-4 rounded-md border border-bud-500/20 bg-bud-500/8 px-3 py-2 text-sm text-bud-300">
          {activeQaRun.inputSnapshot?.action === "review_with_agent" ? (
            <FormattedMessage {...messages.agentReviewRunning} />
          ) : (
            <FormattedMessage {...messages.qaChecksRunning} />
          )}
        </p>
      ) : null}

      {providerReviewReport && providerReviewReport.summary.total > 0 ? (
        <div className="mt-4 space-y-3 rounded-md border border-border bg-muted px-4 py-4">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              <FormattedMessage {...messages.providerReviewThreadsHeading} />
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <FormattedMessage {...messages.providerReviewThreadsDescription} />
            </p>
          </div>
          <ProviderReviewSummaryChips summary={providerReviewReport.summary} />
          <ul className="space-y-2">
            {providerReviewReport.threads.map((thread) => (
              <ProviderReviewThreadRow
                key={thread.threadId}
                thread={thread}
                organizationSlug={organizationSlug}
                projectId={projectId}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {report && report.summary.total > 0 ? (
        <div className="mt-4 space-y-4">
          <QaSummaryChips summary={report.summary} />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative md:col-span-2">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={1.8}
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder={intl.formatMessage(messages.searchPlaceholder)}
                className="pl-9"
              />
            </div>
            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={intl.formatMessage(messages.severityPlaceholder)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <FormattedMessage {...messages.allSeverities} />
                </SelectItem>
                <SelectItem value="error">
                  <FormattedMessage {...messages.errors} />
                </SelectItem>
                <SelectItem value="warning">
                  <FormattedMessage {...messages.warnings} />
                </SelectItem>
                <SelectItem value="info">
                  <FormattedMessage {...messages.info} />
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={localeFilter} onValueChange={(value) => setLocaleFilter(value ?? "all")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={intl.formatMessage(messages.localePlaceholder)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <FormattedMessage {...messages.allLocales} />
                </SelectItem>
                {filterOptions.locales.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {locale}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={checkTypeFilter}
              onValueChange={(value) => setCheckTypeFilter(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={intl.formatMessage(messages.checkTypePlaceholder)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <FormattedMessage {...messages.allCheckTypes} />
                </SelectItem>
                {filterOptions.checkTypes.map((checkType) => (
                  <SelectItem key={checkType} value={checkType}>
                    {formatCheckTypeLabel(checkType)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Select
              value={groupBy}
              onValueChange={(value) => setGroupBy(value as QaFindingGroupBy)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder={intl.formatMessage(messages.groupByPlaceholder)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="severity">
                  <FormattedMessage {...messages.groupBySeverity} />
                </SelectItem>
                <SelectItem value="locale">
                  <FormattedMessage {...messages.groupByLocale} />
                </SelectItem>
                <SelectItem value="checkType">
                  <FormattedMessage {...messages.groupByCheckType} />
                </SelectItem>
                <SelectItem value="key">
                  <FormattedMessage {...messages.groupByKey} />
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {activeFilterCount > 0 || searchQuery.trim() ? (
                <FormattedMessage
                  {...messages.showingCountWithFilters}
                  values={{
                    filteredCount,
                    totalCount: findingsWithIds.length,
                    filtersCount: activeFilterCount + (searchQuery.trim() ? 1 : 0),
                  }}
                />
              ) : (
                <FormattedMessage
                  {...messages.showingCount}
                  values={{
                    filteredCount,
                    totalCount: findingsWithIds.length,
                  }}
                />
              )}
            </p>
          </div>

          {filteredCount > 0 ? (
            <div className="space-y-4">
              {groupedFindings.map((group) => {
                const groupSelected = group.findings.every((finding) =>
                  selectedIds.has(finding.id),
                );

                return (
                  <div key={group.key} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium capitalize text-foreground">
                          {group.label}
                        </h3>
                        <Badge variant="outline" className="rounded-full text-muted-foreground">
                          {group.findings.length}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => toggleGroup(group.findings, !groupSelected)}
                      >
                        <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.8} />
                        {groupSelected ? (
                          <FormattedMessage {...messages.deselectGroup} />
                        ) : (
                          <FormattedMessage {...messages.selectGroup} />
                        )}
                      </Button>
                    </div>
                    <ul className="space-y-2">
                      {group.findings.map((finding) => (
                        <FindingRow
                          key={finding.id}
                          finding={finding}
                          selected={selectedIds.has(finding.id)}
                          onToggle={toggleFinding}
                          organizationSlug={organizationSlug}
                          projectId={projectId}
                          externalUrl={externalUrl}
                          writeBack={writeBackByFindingId.get(finding.id)}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              <FormattedMessage
                {...messages.noFindingsMatchFiltersWithClear}
                values={{
                  clear: (chunks) => (
                    <button
                      type="button"
                      className="underline decoration-border underline-offset-4 hover:text-foreground"
                      onClick={() => {
                        setSeverityFilter("all");
                        setLocaleFilter("all");
                        setCheckTypeFilter("all");
                        setSearchQuery("");
                      }}
                    >
                      {chunks}
                    </button>
                  ),
                }}
              />
            </p>
          )}
        </div>
      ) : null}

      {!agentRunsLoading && !report && !activeQaRun ? (
        <Empty className="mt-4 border border-dashed border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={ShieldEnergyIcon} strokeWidth={1.8} />
            </EmptyMedia>
            <EmptyTitle>
              <FormattedMessage {...messages.noQaFindingsYetTitle} />
            </EmptyTitle>
            <EmptyDescription>
              <FormattedMessage {...messages.noQaFindingsYetDescription} />
            </EmptyDescription>
          </EmptyHeader>
          {runQaChecksAction?.visible && runQaChecksAction.enabled ? (
            <Button size="sm" disabled={runSyncQa.isPending} onClick={() => runSyncQa.mutate()}>
              {runSyncQa.isPending ? (
                <FormattedMessage {...messages.running} />
              ) : (
                <FormattedMessage {...messages.runQaChecks} />
              )}
            </Button>
          ) : null}
        </Empty>
      ) : null}

      {!agentRunsLoading && report && report.summary.total === 0 ? (
        <Empty className="mt-4 border border-dashed border-grove-300/20 bg-grove-300/5">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.8} />
            </EmptyMedia>
            <EmptyTitle>
              <FormattedMessage {...messages.noIssuesFoundTitle} />
            </EmptyTitle>
            <EmptyDescription>
              <FormattedMessage {...messages.noIssuesFoundDescription} />
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </section>
  );
}
