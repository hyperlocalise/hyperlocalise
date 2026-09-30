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
import { useMemo, useState } from "react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { QaFindingsTable } from "@/components/qa/qa-findings-table";
import { buildProjectPath } from "@/components/app-shell/navigation-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { translationQaCheckTypes, type TranslationQaCheckType } from "@/lib/qa/types";
import { createWorkspaceQaReportClient } from "@/lib/qa/qa-report-client";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { qaWorkspaceMessages as messages } from "../qa-workspace.messages";

const FINDINGS_PAGE_SIZE = 50;

type WorkspaceQaRow = {
  projectId: string;
  projectName: string;
  cadence: "off" | "daily";
  lastRunAt: string | null;
  report: {
    status: "queued" | "running" | "succeeded" | "failed";
    findingCount: number;
    errorCount: number;
    warningCount: number;
    completedAt: string | null;
    summary: {
      byCheckType: Record<string, number>;
      byLocale: Record<string, number>;
    };
  } | null;
};

type WorkspaceFinding = {
  id: string;
  runId: string;
  projectId: string;
  projectName: string;
  key: string;
  targetLocale: string;
  checkType: string;
  severity: "error" | "warning";
  message: string;
  sourceText: string;
  targetText: string;
  editorHref: string;
};

export function QaWorkspacePageContent({
  organizationSlug,
  canPromoteFindings,
}: {
  organizationSlug: string;
  canPromoteFindings: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client: goSvcClient } = useGoSvcClient();
  const workspaceQaReportClient = useMemo(
    () => createWorkspaceQaReportClient(goSvcClient),
    [goSvcClient],
  );
  const [locale, setLocale] = useState("all");
  const [checkType, setCheckType] = useState("all");
  const [projectId, setProjectId] = useState("all");

  const reportsQuery = useQuery({
    queryKey: ["workspace-qa-reports", organizationSlug],
    queryFn: async () => {
      try {
        const response = await workspaceQaReportClient.listReports({
          param: { organizationSlug },
        });
        return response as { reports: WorkspaceQaRow[] };
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.loadError)), {
          cause: error,
        });
      }
    },
    refetchInterval: (queryState) =>
      queryState.state.data?.reports.some(
        (row) => row.report?.status === "running" || row.report?.status === "queued",
      )
        ? 2000
        : false,
  });

  const findingsQuery = useInfiniteQuery({
    queryKey: ["workspace-qa-findings", organizationSlug, locale, checkType, projectId],
    queryFn: async ({ pageParam }) => {
      try {
        const response = await workspaceQaReportClient.listFindings({
          param: { organizationSlug },
          query: {
            locale: locale === "all" ? undefined : locale,
            checkType: isQaCheckType(checkType) ? checkType : undefined,
            projectId: projectId === "all" ? undefined : projectId,
            limit: String(FINDINGS_PAGE_SIZE),
            offset: String(pageParam),
          },
        });
        return response as {
          findings: WorkspaceFinding[];
          total: number;
        };
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, intl.formatMessage(messages.loadError)), {
          cause: error,
        });
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.findings.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });

  const reports = reportsQuery.data?.reports ?? [];
  const findings = findingsQuery.data?.pages.flatMap((page) => page.findings) ?? [];
  const findingsTotal = findingsQuery.data?.pages[0]?.total ?? 0;

  const localeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of reports) {
      for (const key of Object.keys(row.report?.summary.byLocale ?? {})) {
        values.add(key);
      }
    }
    return [...values].sort();
  }, [reports]);

  const invalidateFindings = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace-qa-findings", organizationSlug] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-qa-reports", organizationSlug] }),
    ]);
  };

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={CheckmarkCircle02Icon}
        title={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description)}
      />

      <section className="flex flex-col gap-3">
        <TypographyP size="small" weight="medium">
          <FormattedMessage {...messages.portfolioTitle} />
        </TypographyP>
        {reportsQuery.isError ? (
          <TypographyP tone="subtle">{intl.formatMessage(messages.loadError)}</TypographyP>
        ) : null}
        {reports.length === 0 && reportsQuery.isSuccess ? (
          <TypographyP tone="subtle">{intl.formatMessage(messages.empty)}</TypographyP>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((row) => (
            <Card key={row.projectId} className="rounded-2xl border-border bg-muted py-0 ring-0">
              <CardHeader className="px-5 pt-5 pb-0">
                <CardTitle className="text-base font-medium">{row.projectName}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-5 pt-3 pb-5">
                <TypographyP size="small" tone="subtle">
                  {workspaceQaHeadline(intl, row.report)}
                </TypographyP>
                {row.report?.status === "succeeded" ? (
                  <>
                    <TypographyP size="xsmall" tone="subtle">
                      {intl.formatMessage(messages.counts, {
                        errors: row.report.errorCount,
                        warnings: row.report.warningCount,
                      })}
                    </TypographyP>
                    <QaSummaryChips
                      byLocale={row.report.summary.byLocale}
                      byCheckType={row.report.summary.byCheckType}
                    />
                  </>
                ) : null}
                {row.lastRunAt ? (
                  <TypographyP size="xsmall" tone="subtle">
                    {intl.formatMessage(messages.lastRun, {
                      date: intl.formatDate(row.lastRunAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </TypographyP>
                ) : null}
                <TypographyP size="xsmall" tone="subtle">
                  <FormattedMessage
                    {...(row.cadence === "daily" ? messages.daily : messages.manual)}
                  />
                </TypographyP>
                <Button
                  nativeButton={false}
                  render={<Link href={buildProjectPath(organizationSlug, row.projectId, "qa")} />}
                  variant="outline"
                  size="sm"
                  className="w-fit rounded-full"
                >
                  <FormattedMessage {...messages.openProject} />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <TypographyP size="small" weight="medium">
            <FormattedMessage {...messages.findingsQueueTitle} />
          </TypographyP>
          <TypographyP size="xsmall" tone="subtle">
            <FormattedMessage {...messages.findingsQueueDescription} />
          </TypographyP>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select
            value={projectId}
            onValueChange={(value) => {
              if (value) {
                setProjectId(value);
              }
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder={intl.formatMessage(messages.allProjects)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={intl.formatMessage(messages.allProjects)}>
                {intl.formatMessage(messages.allProjects)}
              </SelectItem>
              {reports.map((row) => (
                <SelectItem key={row.projectId} value={row.projectId} label={row.projectName}>
                  {row.projectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={locale}
            onValueChange={(value) => {
              if (value) {
                setLocale(value);
              }
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={intl.formatMessage(messages.allLocales)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={intl.formatMessage(messages.allLocales)}>
                {intl.formatMessage(messages.allLocales)}
              </SelectItem>
              {localeOptions.map((value) => (
                <SelectItem key={value} value={value} label={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={checkType}
            onValueChange={(value) => {
              if (value) {
                setCheckType(value);
              }
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder={intl.formatMessage(messages.allChecks)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={intl.formatMessage(messages.allChecks)}>
                {intl.formatMessage(messages.allChecks)}
              </SelectItem>
              {translationQaCheckTypes.map((value) => (
                <SelectItem key={value} value={value} label={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {findingsQuery.isSuccess && findings.length === 0 ? (
          <TypographyP tone="subtle">{intl.formatMessage(messages.noFindings)}</TypographyP>
        ) : null}

        {findings.length > 0 ? (
          <QaFindingsTable
            organizationSlug={organizationSlug}
            findings={findings}
            total={findingsTotal}
            shownCount={findings.length}
            canPromote={canPromoteFindings}
            promoteScope="workspace"
            hasMore={findingsQuery.hasNextPage}
            isLoadingMore={findingsQuery.isFetchingNextPage}
            onLoadMore={() => {
              void findingsQuery.fetchNextPage();
            }}
            onPromoted={invalidateFindings}
          />
        ) : null}
      </section>
    </WorkspacePageShell>
  );
}

function QaSummaryChips({
  byLocale,
  byCheckType,
}: {
  byLocale: Record<string, number>;
  byCheckType: Record<string, number>;
}) {
  const localeEntries = Object.entries(byLocale)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const checkEntries = Object.entries(byCheckType)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  if (localeEntries.length === 0 && checkEntries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {localeEntries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {localeEntries.map(([locale, count]) => (
            <Badge key={locale} variant="outline" className="rounded-full font-normal">
              {locale} · {count}
            </Badge>
          ))}
        </div>
      ) : null}
      {checkEntries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {checkEntries.map(([check, count]) => (
            <Badge key={check} variant="secondary" className="rounded-full font-normal">
              {check} · {count}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isQaCheckType(value: string): value is TranslationQaCheckType {
  return (translationQaCheckTypes as readonly string[]).includes(value);
}

function workspaceQaHeadline(intl: ReturnType<typeof useIntl>, report: WorkspaceQaRow["report"]) {
  if (!report) {
    return intl.formatMessage(messages.neverRun);
  }
  if (report.status === "failed") {
    return intl.formatMessage(messages.failed);
  }
  if (report.status === "running" || report.status === "queued") {
    return intl.formatMessage(messages.running);
  }
  return intl.formatMessage(messages.findings, { count: report.findingCount });
}
