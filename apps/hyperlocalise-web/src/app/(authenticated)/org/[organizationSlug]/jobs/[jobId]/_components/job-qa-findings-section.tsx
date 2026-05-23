"use client";

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
import type { JobProviderActionId } from "@/lib/providers/job-provider-actions";
import type { ProviderQaFinding, ProviderQaSeverity } from "@/lib/providers/provider-job-qa/types";
import { cn } from "@/lib/utils";

import { toneClass, type Tone } from "../../../_components/workspace-resource-shared";

import type { AgentRunRecord, ProviderActionAvailability } from "./job-provider-detail-section";
import {
  attachFindingIds,
  buildProjectFilesHref,
  collectFilterOptions,
  filterFindings,
  formatCheckTypeLabel,
  groupFindings,
  isQaChecksAgentRun,
  parseQaReportFromOutputSummary,
  type QaFindingGroupBy,
  type QaFindingWithId,
} from "./job-qa-findings-model";

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

function QaSummaryChips({
  summary,
}: {
  summary: { total: number; bySeverity: Record<string, number> };
}) {
  const entries: Array<{ label: string; count: number; tone: Tone }> = [
    { label: "Total", count: summary.total, tone: "info" },
    {
      label: "Errors",
      count: summary.bySeverity.error ?? 0,
      tone: "risk",
    },
    {
      label: "Warnings",
      count: summary.bySeverity.warning ?? 0,
      tone: "watch",
    },
    {
      label: "Info",
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
          {entry.label}: {entry.count}
        </Badge>
      ))}
    </div>
  );
}

function FindingRow({
  finding,
  selected,
  onToggle,
  organizationSlug,
  projectId,
  externalUrl,
}: {
  finding: QaFindingWithId;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  organizationSlug: string;
  projectId: string | null;
  externalUrl: string | null;
}) {
  const contentHref = projectId
    ? buildProjectFilesHref({
        organizationSlug,
        projectId,
        key: finding.item.key,
        locale: finding.item.locale,
      })
    : null;

  return (
    <li className="rounded-md border border-foreground/8 bg-foreground/3.5 px-3 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <label className="mt-0.5 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="size-4 rounded border-foreground/20 accent-foreground"
            checked={selected}
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
            <Badge variant="outline" className="rounded-full capitalize text-foreground/62">
              {formatCheckTypeLabel(finding.checkType)}
            </Badge>
            {finding.item.locale ? (
              <Badge variant="outline" className="rounded-full text-foreground/62">
                {finding.item.locale}
              </Badge>
            ) : null}
            {finding.item.field ? (
              <Badge variant="outline" className="rounded-full capitalize text-foreground/62">
                {finding.item.field}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-foreground/82">{finding.message}</p>
          {finding.suggestedFix ? (
            <p className="text-xs text-foreground/48">{finding.suggestedFix}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-mono text-foreground/54">{finding.item.key}</span>
            {contentHref ? (
              <Link
                href={contentHref}
                className="text-foreground underline decoration-foreground/24 underline-offset-4 hover:decoration-foreground/48"
              >
                View in project files
              </Link>
            ) : null}
            {externalUrl ? (
              <Link
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline decoration-foreground/24 underline-offset-4 hover:decoration-foreground/48"
              >
                Open in TMS
              </Link>
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
        (run) => isQaChecksAgentRun(run.inputSnapshot) && run.status === "succeeded",
      ) ?? null
    );
  }, [agentRuns]);

  const activeQaRun = useMemo(() => {
    if (!agentRuns) {
      return null;
    }

    return (
      agentRuns.find(
        (run) =>
          isQaChecksAgentRun(run.inputSnapshot) &&
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
    () => groupFindings(filteredFindings, groupBy),
    [filteredFindings, groupBy],
  );

  const selectedFindings = useMemo(
    () => findingsWithIds.filter((finding) => selectedIds.has(finding.id)),
    [findingsWithIds, selectedIds],
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
        throw new Error(await parseActionError(response, "Failed to run QA checks"));
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
      toast.success(`QA checks finished with ${qaReport.summary.total} findings`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to run QA checks");
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
        throw new Error(await parseActionError(response, "Failed to start agent run"));
      }

      return response.json();
    },
    onSuccess: async () => {
      setSelectedIds(new Set());
      await onAgentRunStarted();
      toast.success("Agent run queued");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to start agent run");
    },
  });

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = new Set(findingsWithIds.map((finding) => finding.id));
      const next = new Set([...current].filter((id) => valid.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [findingsWithIds]);

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
    <section className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <TypographyH2 className="font-heading text-lg font-medium text-foreground md:text-lg">
            QA Findings
          </TypographyH2>
          <p className="mt-1 text-sm text-foreground/48">
            Review issues from the latest QA run, filter by locale or check type, and act on
            selected findings.
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
              {runSyncQa.isPending ? "Running..." : "Run checks now"}
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
                  ? "Select at least one finding"
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
              Fix selected ({selectedFindings.length})
            </Button>
          ) : null}
          {commentAction?.visible ? (
            <Button
              size="sm"
              variant="outline"
              disabled={
                !commentAction.enabled ||
                selectedFindings.length === 0 ||
                startAgentAction.isPending
              }
              title={
                selectedFindings.length === 0
                  ? "Select at least one finding"
                  : commentAction.disabledReason
              }
              onClick={() =>
                startAgentAction.mutate({
                  action: "leave_provider_comment",
                  selectedFindings,
                })
              }
            >
              <HugeiconsIcon icon={Comment01Icon} strokeWidth={1.8} />
              Comment on selected
            </Button>
          ) : null}
        </div>
      </div>

      {agentRunsLoading ? <Skeleton className="mt-4 h-24 w-full bg-foreground/8" /> : null}

      {activeQaRun ? (
        <p className="mt-4 rounded-md border border-bud-500/20 bg-bud-500/8 px-3 py-2 text-sm text-bud-300">
          QA checks are running. Results will refresh when the agent run completes.
        </p>
      ) : null}

      {report ? (
        <div className="mt-4 space-y-4">
          <QaSummaryChips summary={report.summary} />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative md:col-span-2">
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={1.8}
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground/40"
              />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                placeholder="Search key, message, or string id"
                className="pl-9"
              />
            </div>
            <Select
              value={severityFilter}
              onValueChange={(value) => setSeverityFilter(value ?? "all")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="error">Errors</SelectItem>
                <SelectItem value="warning">Warnings</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={localeFilter} onValueChange={(value) => setLocaleFilter(value ?? "all")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Locale" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locales</SelectItem>
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
                <SelectValue placeholder="Check type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All check types</SelectItem>
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
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="severity">Group by severity</SelectItem>
                <SelectItem value="locale">Group by locale</SelectItem>
                <SelectItem value="checkType">Group by check type</SelectItem>
                <SelectItem value="key">Group by key</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-foreground/48">
              Showing {filteredCount} of {findingsWithIds.length}
              {activeFilterCount > 0 || searchQuery.trim()
                ? ` · ${activeFilterCount + (searchQuery.trim() ? 1 : 0)} filters active`
                : ""}
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
                        <h3 className="text-sm font-medium capitalize text-foreground/82">
                          {group.label}
                        </h3>
                        <Badge variant="outline" className="rounded-full text-foreground/54">
                          {group.findings.length}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-foreground/54"
                        onClick={() => toggleGroup(group.findings, !groupSelected)}
                      >
                        <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.8} />
                        {groupSelected ? "Deselect group" : "Select group"}
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
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-foreground/48">
              No findings match the current filters.{" "}
              <button
                type="button"
                className="underline decoration-foreground/24 underline-offset-4 hover:text-foreground"
                onClick={() => {
                  setSeverityFilter("all");
                  setLocaleFilter("all");
                  setCheckTypeFilter("all");
                  setSearchQuery("");
                }}
              >
                Clear filters
              </button>
            </p>
          )}
        </div>
      ) : null}

      {!agentRunsLoading && !report && !activeQaRun ? (
        <Empty className="mt-4 border border-dashed border-foreground/12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={ShieldEnergyIcon} strokeWidth={1.8} />
            </EmptyMedia>
            <EmptyTitle>No QA findings yet</EmptyTitle>
            <EmptyDescription>
              Run QA checks on this TMS job to surface placeholder, ICU, glossary, and translation
              issues here. When checks pass, this section will show a clear no-issues state.
            </EmptyDescription>
          </EmptyHeader>
          {runQaChecksAction?.visible && runQaChecksAction.enabled ? (
            <Button size="sm" disabled={runSyncQa.isPending} onClick={() => runSyncQa.mutate()}>
              {runSyncQa.isPending ? "Running..." : "Run QA checks"}
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
            <EmptyTitle>No issues found</EmptyTitle>
            <EmptyDescription>
              The latest QA run completed without findings. Re-run checks after content changes to
              refresh this view.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </section>
  );
}
