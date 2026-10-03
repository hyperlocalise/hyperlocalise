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
import { useMemo, useState } from "react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { QaFindingsTable, qaCheckLabel } from "@/components/qa/qa-findings-table";
import { QaFilter } from "@/components/qa/qa-filter";
import { QaNotice, QaRunStatus } from "@/components/qa/qa-status";
import { qaMessages as m } from "@/components/qa/qa.messages";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import { GoSvcClientError } from "@/lib/go-svc/go-svc-client";
import { createProjectQaReportClient } from "@/lib/qa/qa-report-client";
import { DEFAULT_QA_POLICY, type QaCheckPolicy } from "@/lib/qa/qa-policy";
import { translationQaCheckTypes, type TranslationQaCheckType } from "@/lib/qa/types";
import { ProjectPageShell, ProjectSectionHeader } from "../../_components/project-page-shell";
import { qaProjectMessages as messages } from "../qa-project.messages";

const PAGE_SIZE = 100;
export function QaProjectPageContent({
  organizationSlug,
  projectId,
  canPromoteFindings,
}: {
  organizationSlug: string;
  projectId: string;
  canPromoteFindings: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const { client } = useGoSvcClient();
  const api = useMemo(() => createProjectQaReportClient(client), [client]);
  const [tab, setTab] = useState("findings");
  const [locale, setLocale] = useState("all");
  const [checkType, setCheckType] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("open");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [draftPolicy, setDraftPolicy] = useState<QaCheckPolicy | null>(null);
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
  const running = reports.some((row) => ["running", "queued"].includes(row.status));
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
          locale: locale === "all" ? undefined : locale,
          checkType: checkType === "all" ? undefined : checkType,
          severity: severity === "all" ? undefined : severity,
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
      if (!response.ok) throw new Error("scan_failed");
      return response.json();
    },
    onSuccess: async () => {
      setSelectedRunId(null);
      setTab("findings");
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
  const settingsMutation = useMutation({
    mutationFn: (json: { cadence?: "off" | "daily"; checks?: QaCheckPolicy }) =>
      api.updateSettings({ param, json }),
    onSuccess: async () => {
      setDraftPolicy(null);
      await queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
  const policy = draftPolicy ?? settings?.checks ?? DEFAULT_QA_POLICY;
  const updateRule = (
    check: TranslationQaCheckType,
    change: Partial<QaCheckPolicy[TranslationQaCheckType]>,
  ) => {
    setDraftPolicy({ ...policy, [check]: { ...policy[check], ...change } });
  };
  const canReview =
    canPromoteFindings &&
    report?.status === "succeeded" &&
    report.id === reports.find((row) => row.status === "succeeded")?.id;
  const all = { value: "all", label: intl.formatMessage(m.all) };
  const filtered =
    locale !== "all" || checkType !== "all" || severity !== "all" || status !== "all";
  const resetFilters = () => {
    setLocale("all");
    setCheckType("all");
    setSeverity("all");
    setStatus("all");
  };
  const unsupported =
    list.error instanceof GoSvcClientError && list.error.code === "qa_scan_not_supported";
  return (
    <ProjectPageShell>
      <ProjectSectionHeader
        icon={CheckmarkCircle02Icon}
        section={intl.formatMessage(messages.title)}
        actions={
          settings?.canRun ? (
            <Button size="sm" disabled={running || start.isPending} onClick={() => start.mutate()}>
              {intl.formatMessage(running || start.isPending ? messages.running : messages.run)}
            </Button>
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
        <QaNotice message={intl.formatMessage(messages.runError)} onRetry={() => start.mutate()} />
      ) : null}
      {list.isSuccess ? (
        <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="gap-6">
          <TabsList variant="line">
            <TabsTrigger value="findings">{intl.formatMessage(m.findings)}</TabsTrigger>
            <TabsTrigger value="settings">{intl.formatMessage(m.settings)}</TabsTrigger>
            <TabsTrigger value="history">{intl.formatMessage(m.history)}</TabsTrigger>
          </TabsList>
          <TabsContent value="findings" className="flex flex-col gap-5">
            {selectedRunId && report?.id !== reports[0]?.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm">{intl.formatMessage(m.older)}</p>
                <Button variant="outline" size="sm" onClick={() => setSelectedRunId(null)}>
                  {intl.formatMessage(m.latest)}
                </Button>
              </div>
            ) : null}
            <QaRunStatus
              report={report}
              onRetry={settings?.canRun && !running ? () => start.mutate() : undefined}
            />
            {report?.status === "succeeded" ? (
              <>
                <p className="text-xs text-muted-foreground">{intl.formatMessage(m.snapshot)}</p>
                <div className="flex flex-wrap items-end gap-3">
                  <QaFilter
                    label={intl.formatMessage(m.language)}
                    value={locale}
                    onChange={setLocale}
                    options={[
                      all,
                      ...Object.keys(report.summary.byLocale).map((value) => ({
                        value,
                        label: value,
                      })),
                    ]}
                  />
                  <QaFilter
                    label={intl.formatMessage(m.check)}
                    value={checkType}
                    onChange={setCheckType}
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
                    onChange={setSeverity}
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
                    onChange={setStatus}
                    options={[
                      all,
                      ...(["open", "ignored", "resolved"] as const).map((value) => ({
                        value,
                        label: intl.formatMessage(m[value]),
                      })),
                    ]}
                  />
                </div>
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
                  <div className="flex items-center gap-3">
                    <p className="text-sm">
                      {intl.formatMessage(
                        report.findingCount === 0 && !filtered ? m.clean : m.noMatches,
                      )}
                    </p>
                    {filtered ? (
                      <Button variant="outline" size="sm" onClick={resetFilters}>
                        {intl.formatMessage(m.clearFilters)}
                      </Button>
                    ) : null}
                  </div>
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
              </>
            ) : null}
          </TabsContent>
          <TabsContent value="settings" className="flex flex-col gap-6">
            <Field>
              <FieldLabel htmlFor="qa-daily">{intl.formatMessage(messages.schedule)}</FieldLabel>
              <Switch
                id="qa-daily"
                checked={settings?.cadence === "daily"}
                disabled={!settings?.canManageSchedule || settingsMutation.isPending}
                onCheckedChange={(checked) =>
                  settingsMutation.mutate({ cadence: checked ? "daily" : "off" })
                }
              />
              <FieldDescription>{intl.formatMessage(messages.scheduleHelp)}</FieldDescription>
            </Field>
            {settingsMutation.isError ? (
              <QaNotice message={intl.formatMessage(m.policyError)} />
            ) : null}
            <div className="flex max-w-2xl flex-col gap-3">
              <h3 className="text-sm font-medium">{intl.formatMessage(m.coverage)}</h3>
              <p className="text-sm text-muted-foreground">{intl.formatMessage(m.coverageHelp)}</p>
              <p className="text-xs text-muted-foreground">
                {intl.formatMessage(m.warningBehavior)}
              </p>
              <p className="text-xs text-muted-foreground">{intl.formatMessage(m.errorBehavior)}</p>
              <div className="flex flex-col divide-y divide-border">
                {translationQaCheckTypes.map((check) => (
                  <div
                    key={check}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <Field className="w-auto">
                      <FieldLabel htmlFor={`qa-rule-${check}`}>
                        {qaCheckLabel(check, intl)}
                      </FieldLabel>
                      <Switch
                        id={`qa-rule-${check}`}
                        checked={policy[check].enabled}
                        disabled={!settings?.canManageSchedule || settingsMutation.isPending}
                        aria-label={intl.formatMessage(m.enableCheck, {
                          check: qaCheckLabel(check, intl),
                        })}
                        onCheckedChange={(enabled) => updateRule(check, { enabled })}
                      />
                    </Field>
                    <QaFilter
                      label={intl.formatMessage(m.severity)}
                      value={policy[check].severity}
                      onChange={(severity) =>
                        updateRule(check, { severity: severity as "error" | "warning" })
                      }
                      options={(["error", "warning"] as const).map((value) => ({
                        value,
                        label: intl.formatMessage(m[value]),
                      }))}
                    />
                  </div>
                ))}
              </div>
              <Button
                className="w-fit"
                size="sm"
                disabled={
                  !draftPolicy || settingsMutation.isPending || !settings?.canManageSchedule
                }
                onClick={() => settingsMutation.mutate({ checks: policy })}
              >
                {intl.formatMessage(m.savePolicy)}
              </Button>
              {settingsMutation.isSuccess && !draftPolicy ? (
                <p className="text-sm">{intl.formatMessage(m.policySaved)}</p>
              ) : null}
            </div>
          </TabsContent>
          <TabsContent value="history" className="flex flex-col gap-3">
            {reports.length === 0 ? <QaNotice message={intl.formatMessage(m.notScanned)} /> : null}
            {reports.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-sm">
                    {intl.formatDate(row.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {intl.formatMessage(
                      row.trigger === "scheduled"
                        ? messages.triggerScheduled
                        : messages.triggerManual,
                    )}
                  </p>
                  <QaRunStatus report={row} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedRunId(row.id);
                    resetFilters();
                    setTab("findings");
                  }}
                >
                  {intl.formatMessage(m.findings)}
                </Button>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      ) : null}
    </ProjectPageShell>
  );
}
