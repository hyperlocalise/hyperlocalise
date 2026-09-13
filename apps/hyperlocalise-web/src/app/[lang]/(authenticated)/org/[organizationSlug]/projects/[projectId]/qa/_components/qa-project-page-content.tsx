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
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { readApiResponseError } from "@/lib/api-error";
import { translationQaCheckTypes, type TranslationQaCheckType } from "@/lib/qa/types";

import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { qaProjectMessages as messages } from "../qa-project.messages";

type QaReport = {
  id: string;
  status: string;
  trigger: "manual" | "scheduled";
  segmentCount: number;
  findingCount: number;
  errorCount: number;
  warningCount: number;
  completedAt: string | null;
  createdAt: string;
  summary: {
    byCheckType: Record<string, number>;
    bySeverity: Record<string, number>;
    byLocale: Record<string, number>;
  };
};

type QaFinding = {
  id: string;
  key: string;
  sourcePath: string | null;
  targetLocale: string;
  checkType: string;
  severity: "error" | "warning";
  message: string;
  sourceText: string;
  targetText: string;
  editorHref: string;
};

type QaListResponse = {
  reports: QaReport[];
  settings: {
    cadence: "off" | "daily";
    lastRunAt: string | null;
    canRun: boolean;
    canManageSchedule: boolean;
  };
};

type QaDetailResponse = {
  report: QaReport;
  findings: QaFinding[];
  total: number;
};

const FINDINGS_PAGE_SIZE = 100;

export function QaProjectPageContent({
  organizationSlug,
  projectId,
}: {
  organizationSlug: string;
  projectId: string;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState("all");
  const [checkType, setCheckType] = useState("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const listKey = ["project-qa-reports", organizationSlug, projectId];

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "qa-reports"
      ].$get({ param: { organizationSlug, projectId } });
      if (response.status === 400) {
        throw Object.assign(new Error("unsupported"), { code: "unsupported" });
      }
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadError));
      }
      return (await response.json()) as QaListResponse;
    },
    refetchInterval: (query) =>
      query.state.data?.reports.some(
        (report) => report.status === "running" || report.status === "queued",
      )
        ? 2000
        : false,
  });

  const latestId = listQuery.data?.reports[0]?.id;
  const activeRunId = selectedRunId ?? latestId;
  const detailQuery = useInfiniteQuery({
    queryKey: [...listKey, activeRunId, locale, checkType],
    enabled: Boolean(activeRunId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "qa-reports"
      ][":runId"].$get({
        param: { organizationSlug, projectId, runId: activeRunId! },
        query: {
          locale: locale === "all" ? undefined : locale,
          checkType: isQaCheckType(checkType) ? checkType : undefined,
          limit: FINDINGS_PAGE_SIZE,
          offset: pageParam,
        },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadError));
      }
      return (await response.json()) as QaDetailResponse;
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.findings.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
  const findings = detailQuery.data?.pages.flatMap((page) => page.findings) ?? [];
  const findingsTotal = detailQuery.data?.pages[0]?.total ?? 0;

  const runMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "qa-reports"
      ].$post({ param: { organizationSlug, projectId } });
      if (!response.ok) {
        throw await readApiResponseError(response, intl.formatMessage(messages.runError));
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.runStarted));
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.runError));
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (cadence: "off" | "daily") => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects[":projectId"][
        "qa-reports"
      ].settings.$patch({
        param: { organizationSlug, projectId },
        json: { cadence },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadError));
      }
      return response.json();
    },
    onSuccess: async () => {
      toast.success(intl.formatMessage(messages.scheduleSaved));
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const reports = listQuery.data?.reports ?? [];
  const selectedReport = reports.find((report) => report.id === activeRunId) ?? reports[0];
  const locales = useMemo(
    () => Object.keys(selectedReport?.summary.byLocale ?? {}),
    [selectedReport],
  );
  const settings = listQuery.data?.settings;
  const unsupported = isUnsupportedQaError(listQuery.error);
  const scanInProgress = reports.some(
    (report) => report.status === "running" || report.status === "queued",
  );

  return (
    <ProjectPageShell>
      <ProjectSectionHeader
        icon={CheckmarkCircle02Icon}
        section={intl.formatMessage(messages.title)}
        description={intl.formatMessage(messages.description)}
        actions={
          settings?.canRun ? (
            <Button
              size="sm"
              className="rounded-full"
              disabled={runMutation.isPending || scanInProgress}
              onClick={() => runMutation.mutate()}
            >
              <FormattedMessage
                {...(runMutation.isPending || scanInProgress ? messages.running : messages.run)}
              />
            </Button>
          ) : null
        }
      />

      {unsupported ? (
        <TypographyP tone="subtle">{intl.formatMessage(messages.unsupported)}</TypographyP>
      ) : null}

      {settings ? (
        <label className="flex items-center gap-3 text-sm">
          <Switch
            checked={settings.cadence === "daily"}
            disabled={!settings.canManageSchedule || scheduleMutation.isPending}
            onCheckedChange={(checked) => scheduleMutation.mutate(checked ? "daily" : "off")}
          />
          <span>
            <FormattedMessage {...messages.schedule} />
            <TypographyP size="xsmall" tone="subtle">
              <FormattedMessage {...messages.scheduleHelp} />
            </TypographyP>
          </span>
        </label>
      ) : null}

      {selectedReport ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Metric
            label={intl.formatMessage(messages.segments)}
            value={String(selectedReport.segmentCount)}
          />
          <Metric
            label={intl.formatMessage(messages.errors)}
            value={String(selectedReport.errorCount)}
          />
          <Metric
            label={intl.formatMessage(messages.warnings)}
            value={String(selectedReport.warningCount)}
          />
          <Metric
            label={intl.formatMessage(messages.lastRun)}
            value={
              selectedReport.completedAt
                ? intl.formatDate(selectedReport.completedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"
            }
          />
        </div>
      ) : listQuery.isSuccess && !unsupported ? (
        <TypographyP tone="subtle">{intl.formatMessage(messages.empty)}</TypographyP>
      ) : null}

      {reports.length > 0 ? (
        <div className="flex flex-col gap-2">
          <TypographyP size="small" weight="medium">
            <FormattedMessage {...messages.history} />
          </TypographyP>
          <div className="flex flex-wrap gap-2">
            {reports.map((report) => {
              const selected = report.id === selectedReport?.id;
              return (
                <Button
                  key={report.id}
                  type="button"
                  size="sm"
                  variant={selected ? "secondary" : "outline"}
                  className="rounded-full"
                  onClick={() => setSelectedRunId(report.id)}
                >
                  {intl.formatDate(report.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {" · "}
                  {intl.formatMessage(
                    report.trigger === "scheduled"
                      ? messages.triggerScheduled
                      : messages.triggerManual,
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selectedReport ? (
        <div className="flex flex-wrap gap-3">
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
              {locales.map((value) => (
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
      ) : null}

      {detailQuery.isSuccess && findings.length === 0 ? (
        <TypographyP tone="subtle">
          {intl.formatMessage(
            selectedReport?.status === "running" || selectedReport?.status === "queued"
              ? messages.scanInProgress
              : messages.noFindings,
          )}
        </TypographyP>
      ) : null}

      {findings.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{intl.formatMessage(messages.key)}</th>
                  <th className="px-3 py-2 font-medium">{intl.formatMessage(messages.locale)}</th>
                  <th className="px-3 py-2 font-medium">{intl.formatMessage(messages.check)}</th>
                  <th className="px-3 py-2 font-medium">{intl.formatMessage(messages.source)}</th>
                  <th className="px-3 py-2 font-medium">{intl.formatMessage(messages.target)}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {findings.map((finding) => (
                  <tr key={finding.id} className="border-t border-border">
                    <td className="px-3 py-2 align-top font-medium">{finding.key}</td>
                    <td className="px-3 py-2 align-top">{finding.targetLocale}</td>
                    <td className="px-3 py-2 align-top">
                      <Badge variant={finding.severity === "error" ? "destructive" : "warning"}>
                        {finding.checkType}
                      </Badge>
                      <TypographyP size="xsmall" tone="subtle">
                        {finding.message}
                      </TypographyP>
                    </td>
                    <td className="max-w-56 px-3 py-2 align-top break-words">
                      {finding.sourceText}
                    </td>
                    <td className="max-w-56 px-3 py-2 align-top break-words">
                      {finding.targetText}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Button
                        nativeButton={false}
                        render={<Link href={finding.editorHref} />}
                        variant="ghost"
                        size="sm"
                      >
                        <FormattedMessage {...messages.openEditor} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TypographyP size="xsmall" tone="subtle">
              {intl.formatMessage(messages.findingsShown, {
                shown: findings.length,
                total: findingsTotal,
              })}
            </TypographyP>
            {detailQuery.hasNextPage ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={detailQuery.isFetchingNextPage}
                onClick={() => {
                  void detailQuery.fetchNextPage();
                }}
              >
                <FormattedMessage
                  {...(detailQuery.isFetchingNextPage ? messages.loadingMore : messages.loadMore)}
                />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ProjectPageShell>
  );
}

function isQaCheckType(value: string): value is TranslationQaCheckType {
  return (translationQaCheckTypes as readonly string[]).includes(value);
}

function isUnsupportedQaError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "unsupported";
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-xl border-border bg-muted py-0 ring-0">
      <CardContent className="px-4 py-4">
        <TypographyP size="xsmall" tone="subtle">
          {label}
        </TypographyP>
        <TypographyP size="small" weight="medium">
          {value}
        </TypographyP>
      </CardContent>
    </Card>
  );
}
