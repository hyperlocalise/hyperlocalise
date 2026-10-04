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
import { useIntl } from "react-intl";

import { qaCheckLabel } from "@/components/qa/qa-findings-table";
import {
  QA_OVERVIEW_MAX_CHART_ROWS,
  QaBarChartCard,
  QaMetricCard,
  QaOverviewTray,
  QaTrendChartCard,
  qaFindingsChartConfig,
} from "@/components/qa/qa-overview-cards";
import { qaOverviewMessages as overviewMessages } from "@/components/qa/qa-overview.messages";
import type { ProjectQaReport } from "@/lib/qa/qa-report-client";

import { qaProjectMessages as messages } from "../qa-project.messages";

const TREND_SCAN_COUNT = 10;

function breakdown(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([, findings]) => findings > 0)
    .toSorted(([a, x], [b, y]) => y - x || a.localeCompare(b));
}

export function QaProjectOverview({
  report,
  reports,
  cadence,
  onSelectLocale,
  onSelectCheck,
  onSelectRun,
}: {
  report: ProjectQaReport;
  reports: ProjectQaReport[];
  cadence: "off" | "daily" | undefined;
  onSelectLocale: (locale: string) => void;
  onSelectCheck: (checkType: string) => void;
  onSelectRun: (runId: string) => void;
}) {
  const intl = useIntl();
  const locales = breakdown(report.summary.byLocale);
  const checks = breakdown(report.summary.byCheckType);
  const trend = reports
    .filter((row) => row.status === "succeeded")
    .slice(0, TREND_SCAN_COUNT)
    .toReversed()
    .map((row) => ({
      id: row.id,
      label: intl.formatDate(row.completedAt ?? row.createdAt, { month: "short", day: "numeric" }),
      errors: row.errorCount,
      warnings: row.warningCount,
    }));
  const selectedIndex = reports.findIndex((row) => row.id === report.id);
  const previous =
    selectedIndex === -1
      ? undefined
      : reports.slice(selectedIndex + 1).find((row) => row.status === "succeeded");
  const selectedScan = intl.formatMessage(messages.selectedScanDetail);

  return (
    <QaOverviewTray
      needsAction={report.errorCount > 0}
      hint={
        locales.length || checks.length || trend.length > 1
          ? intl.formatMessage(messages.chartHint)
          : undefined
      }
      metrics={
        <>
          <QaMetricCard
            label={intl.formatMessage(overviewMessages.errorsMetric)}
            value={intl.formatNumber(report.errorCount)}
            detail={selectedScan}
            emphasis={report.errorCount > 0 ? "risk" : undefined}
            change={previous ? report.errorCount - previous.errorCount : undefined}
          />
          <QaMetricCard
            label={intl.formatMessage(overviewMessages.warningsMetric)}
            value={intl.formatNumber(report.warningCount)}
            detail={intl.formatMessage(messages.languagesWithFindings, { count: locales.length })}
            emphasis={report.warningCount > 0 ? "watch" : undefined}
            change={previous ? report.warningCount - previous.warningCount : undefined}
          />
          <QaMetricCard
            label={intl.formatMessage(overviewMessages.segmentsMetric)}
            value={intl.formatNumber(report.segmentCount)}
            detail={selectedScan}
          />
          <QaMetricCard
            label={intl.formatMessage(messages.lastCheckedMetric)}
            value={intl.formatDate(report.completedAt ?? report.createdAt, {
              month: "short",
              day: "numeric",
            })}
            detail={intl.formatMessage(
              cadence === "daily" ? messages.scansDaily : messages.scansManual,
            )}
          />
        </>
      }
      charts={
        <>
          <QaTrendChartCard rows={trend} selectedId={report.id} onSelect={onSelectRun} />
          <QaBarChartCard
            title={intl.formatMessage(overviewMessages.byLanguageTitle)}
            series={qaFindingsChartConfig(intl, "var(--chart-1)")}
            total={locales.length}
            onSelect={onSelectLocale}
            rows={locales.slice(0, QA_OVERVIEW_MAX_CHART_ROWS).map(([value, findings]) => ({
              id: value,
              label: value,
              findings,
            }))}
          />
          <QaBarChartCard
            title={intl.formatMessage(overviewMessages.byCheckTitle)}
            series={qaFindingsChartConfig(intl, "var(--chart-4)")}
            total={checks.length}
            onSelect={onSelectCheck}
            rows={checks.slice(0, QA_OVERVIEW_MAX_CHART_ROWS).map(([value, findings]) => ({
              id: value,
              label: qaCheckLabel(value, intl),
              findings,
            }))}
          />
        </>
      }
    />
  );
}
