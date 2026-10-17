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
import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { QaFindingsTable, qaCheckLabel } from "@/components/qa/qa-findings-table";
import { QaFilter } from "@/components/qa/qa-filter";
import { QaNotice, QaRunStatus } from "@/components/qa/qa-status";
import { qaMessages as m } from "@/components/qa/qa.messages";
import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { translationQaCheckTypes } from "@/lib/qa/types";
import { createWorkspaceQaReportClient } from "@/lib/qa/qa-report-client";
import { useWorkspaceQaReports } from "@/lib/qa/use-workspace-qa-reports";
import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { QA_FILTER_ALL } from "@/components/qa/qa-filters-store";
import {
  QaWorkspaceUiStoreProvider,
  useQaWorkspaceUiStore,
} from "../store/qa-workspace-store-context";
import { qaWorkspaceMessages as messages } from "../qa-workspace.messages";
import { QaWorkspaceOverview } from "./qa-workspace-overview";
import { summarizeWorkspaceQa } from "./qa-workspace-summary";

export function QaWorkspacePageContent({
  organizationSlug,
  canPromoteFindings,
}: {
  organizationSlug: string;
  canPromoteFindings: boolean;
}) {
  return (
    <QaWorkspaceUiStoreProvider organizationSlug={organizationSlug}>
      <QaWorkspacePageContentView canPromoteFindings={canPromoteFindings} />
    </QaWorkspaceUiStoreProvider>
  );
}

const QaWorkspacePageContentView = observer(function QaWorkspacePageContentView({
  canPromoteFindings,
}: {
  canPromoteFindings: boolean;
}) {
  const intl = useIntl();
  const { client } = useGoSvcClient();
  const api = useMemo(() => createWorkspaceQaReportClient(client), [client]);
  const pageStore = useQaWorkspaceUiStore();
  const organizationSlug = pageStore.organizationSlug;
  const locale = pageStore.locale;
  const checkType = pageStore.checkType;
  const projectId = pageStore.projectId;
  const severity = pageStore.severity;
  const status = pageStore.status;
  const tab = pageStore.tab;
  const filtered = pageStore.isFiltered;
  const reportsQuery = useWorkspaceQaReports(organizationSlug, { staleTime: 0 });
  const reports = reportsQuery.data?.reports ?? [];
  const summary = summarizeWorkspaceQa(reports);
  const reportsByProject = new Map(reports.map((row) => [row.projectId, row]));
  const showFindingsFor = (filter: { projectId?: string; locale?: string; checkType?: string }) => {
    pageStore.showFindingsFor(filter);
  };
  const failedReports = reports.filter((row) => row.report?.status === "failed");
  const selectedReport = reports.find((row) => row.projectId === projectId);
  const selectedFailedWithoutResults =
    selectedReport?.report?.status === "failed" && !selectedReport.lastSuccessfulAt;
  const lastCompletedByProject = Object.fromEntries(
    reports.map((row) => [row.projectId, row.lastSuccessfulAt]),
  );
  const revision = reports
    .map(
      (row) =>
        `${row.projectId}:${row.report?.id}:${row.report?.status}:${row.report?.completedAt}`,
    )
    .join("|");
  const findingsQuery = useInfiniteQuery({
    queryKey: [
      "workspace-qa-findings",
      organizationSlug,
      revision,
      locale,
      checkType,
      projectId,
      severity,
      status,
    ],
    enabled: reportsQuery.isSuccess,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.listFindings({
        param: { organizationSlug },
        query: {
          locale: locale === QA_FILTER_ALL ? undefined : locale,
          checkType: checkType === QA_FILTER_ALL ? undefined : checkType,
          projectId: projectId === QA_FILTER_ALL ? undefined : projectId,
          severity: severity === QA_FILTER_ALL ? undefined : severity,
          status,
          limit: "50",
          offset: String(pageParam),
        },
      }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.findings.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const findings = findingsQuery.data?.pages.flatMap((page) => page.findings) ?? [];
  const locales = [
    ...new Set(reports.flatMap((row) => Object.keys(row.report?.summary.byLocale ?? {}))),
  ].sort();
  const all = { value: "all", label: intl.formatMessage(m.all) };
  return (
    <WorkspacePageShell>
      <PageHeader icon={CheckCircleIcon} title={intl.formatMessage(messages.title)} />
      <p className="max-w-3xl text-sm text-muted-foreground">
        {intl.formatMessage(m.workspaceHelp)}
      </p>
      {reportsQuery.isError ? (
        <QaNotice
          message={intl.formatMessage(m.loadError)}
          onRetry={() => {
            void reportsQuery.refetch();
          }}
        />
      ) : null}
      {reportsQuery.isPending || reports.length ? (
        <QaWorkspaceOverview
          summary={summary}
          isLoading={reportsQuery.isPending}
          onSelectProject={(value) => showFindingsFor({ projectId: value })}
          onSelectLocale={(value) => showFindingsFor({ locale: value })}
          onSelectCheck={(value) => showFindingsFor({ checkType: value })}
        />
      ) : null}
      {failedReports.length ? (
        <section
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-balance text-sm font-semibold text-destructive">
              {intl.formatMessage(messages.failedProjects, { count: failedReports.length })}
            </h2>
            <p className="max-w-prose text-pretty text-sm text-muted-foreground">
              {intl.formatMessage(messages.failedProjectsHelp)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => pageStore.setTab("projects")}>
            {intl.formatMessage(messages.reviewProjects)}
          </Button>
        </section>
      ) : null}
      <Tabs
        value={tab}
        onValueChange={(value) => pageStore.setTab(String(value))}
        className="gap-6"
      >
        <TabsList variant="line">
          <TabsTrigger value="findings">{intl.formatMessage(m.findings)}</TabsTrigger>
          <TabsTrigger value="projects">{intl.formatMessage(m.projects)}</TabsTrigger>
        </TabsList>
        <TabsContent value="findings" className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-3">
            <QaFilter
              label={intl.formatMessage(m.projects)}
              value={projectId}
              onChange={(value) => pageStore.setProjectId(value)}
              options={[
                all,
                ...reports.map((row) => ({ value: row.projectId, label: row.projectName })),
              ]}
            />
            <QaFilter
              label={intl.formatMessage(m.language)}
              value={locale}
              onChange={(value) => pageStore.setLocale(value)}
              options={[all, ...locales.map((value) => ({ value, label: value }))]}
            />
            <QaFilter
              label={intl.formatMessage(m.check)}
              value={checkType}
              onChange={(value) => pageStore.setCheckType(value)}
              options={[
                all,
                ...translationQaCheckTypes.map((value) => ({
                  value,
                  label: qaCheckLabel(value, intl),
                })),
              ]}
            />
            <QaFilter
              label={intl.formatMessage(m.severity)}
              value={severity}
              onChange={(value) => pageStore.setSeverity(value)}
              options={[
                all,
                ...(["error", "warning"] as const).map((value) => ({
                  value,
                  label: intl.formatMessage(m[value]),
                })),
              ]}
            />
            <QaFilter
              label={intl.formatMessage(m.status)}
              value={status}
              onChange={(value) => pageStore.setStatus(value)}
              options={[
                all,
                ...(["open", "ignored", "resolved"] as const).map((value) => ({
                  value,
                  label: intl.formatMessage(m[value]),
                })),
              ]}
            />
          </div>
          {selectedReport?.report?.status === "failed" ? (
            <p className="text-pretty text-sm text-muted-foreground">
              {selectedReport.lastSuccessfulAt
                ? `${intl.formatMessage(messages.selectedProjectFailed)} ${intl.formatMessage(
                    m.lastCompleted,
                    {
                      date: intl.formatDate(selectedReport.lastSuccessfulAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    },
                  )}`
                : intl.formatMessage(m.failedNoResults)}
            </p>
          ) : null}
          {findingsQuery.isPending && reportsQuery.isSuccess ? (
            <Skeleton className="h-40 w-full" aria-label={intl.formatMessage(m.loading)} />
          ) : null}
          {findingsQuery.isError ? (
            <QaNotice
              message={intl.formatMessage(m.loadError)}
              onRetry={() => {
                void findingsQuery.refetch();
              }}
            />
          ) : null}
          {findingsQuery.isSuccess && !findings.length ? (
            <div className="flex items-center gap-3">
              {!selectedFailedWithoutResults ? (
                <p className="text-sm">{intl.formatMessage(filtered ? m.noMatches : m.clean)}</p>
              ) : null}
              {filtered ? (
                <Button variant="outline" size="sm" onClick={() => pageStore.clearFilters()}>
                  {intl.formatMessage(m.clearFilters)}
                </Button>
              ) : null}
            </div>
          ) : null}
          {findings.length ? (
            <QaFindingsTable
              key={`${projectId}-${locale}-${checkType}-${severity}-${status}`}
              organizationSlug={organizationSlug}
              findings={findings}
              total={findingsQuery.data?.pages[0]?.total ?? 0}
              shownCount={findings.length}
              canPromote={canPromoteFindings}
              promoteScope="workspace"
              lastCompletedByProject={lastCompletedByProject}
              hasMore={findingsQuery.hasNextPage}
              isLoadingMore={findingsQuery.isFetchingNextPage}
              onLoadMore={() => {
                void findingsQuery.fetchNextPage();
              }}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="projects" className="flex flex-col gap-4">
          {reportsQuery.isSuccess && !reports.length ? (
            <p className="text-sm">{intl.formatMessage(messages.empty)}</p>
          ) : null}
          {summary.projects
            .flatMap((project) => {
              const row = reportsByProject.get(project.projectId);
              return row ? [row] : [];
            })
            .map((row) => (
              <div
                key={row.projectId}
                className="flex flex-wrap items-start justify-between gap-4 border-b border-border py-4"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium">{row.projectName}</h3>
                    <Badge variant="outline">
                      {intl.formatMessage(
                        row.cadence === "daily" ? messages.daily : messages.manual,
                      )}
                    </Badge>
                  </div>
                  <QaRunStatus report={row.report ?? undefined} compact />
                  {row.report?.status === "failed" && row.lastSuccessfulAt ? (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {intl.formatMessage(m.lastCompleted, {
                        date: intl.formatDate(row.lastSuccessfulAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      })}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.lastSuccessfulAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => showFindingsFor({ projectId: row.projectId })}
                    >
                      {intl.formatMessage(messages.viewFindings)}
                    </Button>
                  ) : null}
                  <Button
                    nativeButton={false}
                    render={<Link href={buildProjectPath(organizationSlug, row.projectId, "qa")} />}
                    variant="outline"
                    size="sm"
                  >
                    {intl.formatMessage(messages.openProject)}
                  </Button>
                </div>
              </div>
            ))}
        </TabsContent>
      </Tabs>
    </WorkspacePageShell>
  );
});
