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
import { useEffect, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { CheckCircleIcon, ClockCounterClockwiseIcon, GearIcon } from "@phosphor-icons/react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QaFindingsTable } from "@/components/qa/qa-findings-table";
import { QaFindingFilterBar } from "@/components/qa/qa-filter";
import { QaNotice, QaRunStatus } from "@/components/qa/qa-status";
import { qaMessages as m } from "@/components/qa/qa.messages";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { createProjectQaReportClient } from "@/lib/qa/qa-report-client";
import { workspaceQaReportsQueryKey } from "@/lib/qa/use-workspace-qa-reports";
import type { QaCheckPolicy } from "@/lib/qa/qa-policy";
import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { QA_FILTER_ALL } from "@/components/qa/qa-filters-store";
import { QaProjectUiStoreProvider, useQaProjectUiStore } from "../store/qa-project-store-context";
import { qaProjectMessages as messages } from "../qa-project.messages";
import type { QaCadence } from "../store/qa-project-ui-store";
import { QaProjectOverview } from "./qa-project-overview";
import { QaProjectSettingsDialog } from "./qa-project-settings-dialog";
import { QaScanPicker } from "./qa-scan-picker";

const PAGE_SIZE = 100;
type QaScanStartErrorCode = "qa_scan_in_progress" | "qa_scan_start_failed";

class QaScanStartError extends Error {
  constructor(readonly code: QaScanStartErrorCode) {
    super("Could not start QA scan");
    this.name = "QaScanStartError";
  }
}

export function QaProjectPageContent({
  organizationSlug,
  projectId,
  canPromoteFindings,
}: {
  organizationSlug: string;
  projectId: string;
  canPromoteFindings: boolean;
}) {
  return (
    <QaProjectUiStoreProvider organizationSlug={organizationSlug} projectId={projectId}>
      <QaProjectPageContentView canPromoteFindings={canPromoteFindings} />
    </QaProjectUiStoreProvider>
  );
}

const QaProjectPageContentView = observer(function QaProjectPageContentView({
  canPromoteFindings,
}: {
  canPromoteFindings: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client } = useGoSvcClient();
  const api = useMemo(() => createProjectQaReportClient(client), [client]);
  const pageStore = useQaProjectUiStore();
  const organizationSlug = pageStore.organizationSlug;
  const projectId = pageStore.projectId;
  const locale = pageStore.locale;
  const checkType = pageStore.checkType;
  const severity = pageStore.severity;
  const status = pageStore.status;
  const selectedRunId = pageStore.selectedRunId;
  const listKey = ["project-qa-reports", organizationSlug, projectId];
  const param = { organizationSlug, projectId };
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => api.listReports({ param }),
    refetchInterval: (query) =>
      query.state.data?.reports.some((report) => ["running", "queued"].includes(report.status))
        ? 2000
        : false,
  });
  const reports = list.data?.reports ?? [];
  const report = reports.find((row) => row.id === selectedRunId) ?? reports[0];
  const isLatestReport = report?.id === reports[0]?.id;
  const lastSuccessfulFromList =
    isLatestReport && report?.status === "failed"
      ? reports.find((row) => row.status === "succeeded")
      : undefined;
  const lastSuccessful = useQuery({
    queryKey: [...listKey, "last-successful", report?.id],
    queryFn: () => api.getLastSuccessful({ param, beforeRunId: report!.id }),
    enabled: Boolean(report?.status === "failed" && isLatestReport && !lastSuccessfulFromList),
  });
  const lastSuccessfulReport =
    isLatestReport && report?.status === "failed"
      ? (lastSuccessfulFromList ?? lastSuccessful.data ?? null)
      : null;
  const running = reports.some((row) => ["running", "queued"].includes(row.status));
  const latestRevision = reports[0] ? `${reports[0].id}:${reports[0].status}` : null;
  useEffect(() => {
    if (!latestRevision) return;
    void queryClient.invalidateQueries({ queryKey: workspaceQaReportsQueryKey(organizationSlug) });
  }, [latestRevision, organizationSlug, queryClient]);
  const settings = list.data?.settings;
  const detail = useInfiniteQuery({
    // A changed run state creates a fresh result query, including the final
    // transition to succeeded. Never leave a cached running snapshot visible.
    queryKey: [
      ...listKey,
      report?.id,
      report?.status,
      report?.completedAt,
      locale,
      checkType,
      severity,
      status,
    ],
    enabled: Boolean(report && report.status === "succeeded"),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.getRun({
        param: { ...param, runId: report!.id },
        query: {
          locale: locale === QA_FILTER_ALL ? undefined : locale,
          checkType: checkType === QA_FILTER_ALL ? undefined : checkType,
          severity: severity === QA_FILTER_ALL ? undefined : severity,
          status,
          limit: String(PAGE_SIZE),
          offset: String(pageParam),
        },
      }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.findings.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const findings = detail.data?.pages.flatMap((page) => page.findings) ?? [];
  const start = useMutation({
    mutationFn: async () => {
      const response = await api.startScan({ param });
      if (!response.ok) {
        throw new QaScanStartError(
          response.status === 409 ? "qa_scan_in_progress" : "qa_scan_start_failed",
        );
      }
      return response.json();
    },
    onSuccess: async () => {
      pageStore.resetAfterScanStart();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({ queryKey: workspaceQaReportsQueryKey(organizationSlug) }),
      ]);
    },
    onError: async (error) => {
      if (error instanceof QaScanStartError && error.code === "qa_scan_in_progress") {
        await queryClient.invalidateQueries({ queryKey: listKey });
      }
    },
  });
  const settingsMutation = useMutation({
    mutationFn: (json: { cadence?: QaCadence; checks?: QaCheckPolicy }) =>
      api.updateSettings({ param, json }),
    onSuccess: async () => {
      pageStore.closeSettings();
      toast.success(intl.formatMessage(m.policySaved));
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
  const canReview =
    canPromoteFindings &&
    report?.status === "succeeded" &&
    report.id === reports.find((row) => row.status === "succeeded")?.id;
  const filtered = pageStore.isFiltered;
  const unsupported =
    list.error instanceof GoSvcClientError && list.error.code === "qa_scan_not_supported";
  const viewingOlderScan = Boolean(report && reports[0] && report.id !== reports[0].id);
  return (
    <ProjectPageShell>
      <ProjectSectionHeader
        icon={CheckCircleIcon}
        section={intl.formatMessage(messages.title)}
        actions={
          list.isSuccess ? (
            <div className="flex flex-wrap items-center gap-2">
              <QaScanPicker
                reports={reports}
                selectedId={report?.id}
                onSelect={(runId) => pageStore.selectRun(runId, reports[0]?.id)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  settingsMutation.reset();
                  pageStore.openSettings();
                }}
              >
                <GearIcon data-icon="inline-start" />
                {intl.formatMessage(messages.openSettings)}
              </Button>
              {settings?.canRun ? (
                <Button
                  size="sm"
                  disabled={running || start.isPending}
                  onClick={() => start.mutate()}
                >
                  {intl.formatMessage(running || start.isPending ? messages.running : messages.run)}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
      {list.isPending ? (
        <Skeleton className="h-24 w-full" aria-label={intl.formatMessage(m.loading)} />
      ) : null}
      {list.isError ? (
        <QaNotice
          message={intl.formatMessage(unsupported ? messages.unsupported : m.loadError)}
          onRetry={
            unsupported
              ? undefined
              : () => {
                  void list.refetch();
                }
          }
        />
      ) : null}
      {start.isError ? (
        <QaNotice
          message={intl.formatMessage(
            start.error instanceof QaScanStartError && start.error.code === "qa_scan_in_progress"
              ? messages.runInProgress
              : messages.runError,
          )}
          onRetry={
            start.error instanceof QaScanStartError && start.error.code === "qa_scan_in_progress"
              ? undefined
              : () => start.mutate()
          }
        />
      ) : null}
      {viewingOlderScan && report ? (
        <Alert className="border-warning/40 bg-warning/10">
          <ClockCounterClockwiseIcon />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-foreground">
            <span>
              {intl.formatMessage(messages.olderScanBanner, {
                date: intl.formatDate(report.completedAt ?? report.createdAt, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </span>
            <Button variant="outline" size="sm" onClick={() => pageStore.selectLatestRun()}>
              {intl.formatMessage(m.latest)}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {list.isSuccess && report?.status === "succeeded" ? (
        <QaProjectOverview
          report={report}
          reports={reports}
          cadence={settings?.cadence}
          onSelectLocale={(value) => pageStore.showFindingsFor({ locale: value })}
          onSelectCheck={(value) => pageStore.showFindingsFor({ checkType: value })}
          onSelectRun={(runId) => pageStore.selectRun(runId, reports[0]?.id)}
        />
      ) : null}
      {list.isSuccess ? (
        <section className="flex flex-col gap-5">
          {report?.status === "succeeded" ? null : (
            <QaRunStatus
              report={report}
              onRetry={settings?.canRun && !running ? () => start.mutate() : undefined}
              isRetrying={start.isPending}
              lastSuccessfulAt={lastSuccessfulReport?.completedAt}
              lastSuccessfulAction={
                lastSuccessfulReport ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pageStore.selectRun(lastSuccessfulReport.id, reports[0]?.id)}
                  >
                    {intl.formatMessage(messages.viewLastCompleted)}
                  </Button>
                ) : null
              }
            />
          )}
          {report?.status === "succeeded" ? (
            <>
              <QaRunStatus report={report} />
              <QaFindingFilterBar
                values={{ locale, checkType, severity, status }}
                locales={Object.keys(report.summary.byLocale)}
                total={detail.data?.pages[0]?.total}
                isFiltered={filtered}
                onChange={(key, value) => {
                  if (key !== "projectId") pageStore.setFilter(key, value);
                }}
                onClear={() => pageStore.clearFindingFilters()}
              />
              {detail.isPending ? (
                <Skeleton className="h-40 w-full" aria-label={intl.formatMessage(m.loading)} />
              ) : null}
              {detail.isError ? (
                <QaNotice
                  message={intl.formatMessage(m.loadError)}
                  onRetry={() => {
                    void detail.refetch();
                  }}
                />
              ) : null}
              {detail.isSuccess && findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {intl.formatMessage(
                    report.findingCount === 0 && !filtered ? m.clean : m.noMatches,
                  )}
                </p>
              ) : null}
              {findings.length ? (
                <QaFindingsTable
                  key={`${report.id}-${locale}-${checkType}-${severity}-${status}`}
                  organizationSlug={organizationSlug}
                  projectId={projectId}
                  findings={findings}
                  total={detail.data?.pages[0]?.total ?? 0}
                  shownCount={findings.length}
                  canPromote={canReview}
                  promoteScope="project"
                  hasMore={detail.hasNextPage}
                  isLoadingMore={detail.isFetchingNextPage}
                  onLoadMore={() => {
                    void detail.fetchNextPage();
                  }}
                />
              ) : null}
              <p className="text-xs text-muted-foreground">{intl.formatMessage(m.snapshot)}</p>
            </>
          ) : null}
        </section>
      ) : null}
      <QaProjectSettingsDialog
        settings={settings}
        isSaving={settingsMutation.isPending}
        isError={settingsMutation.isError}
        onSave={(json) => settingsMutation.mutate(json)}
      />
    </ProjectPageShell>
  );
});
