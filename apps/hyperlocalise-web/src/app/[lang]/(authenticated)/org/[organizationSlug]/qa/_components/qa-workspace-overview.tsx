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
  qaFindingsChartConfig,
  qaSeverityChartConfig,
} from "@/components/qa/qa-overview-cards";
import { qaOverviewMessages as overviewMessages } from "@/components/qa/qa-overview.messages";

import { qaWorkspaceMessages as messages } from "../qa-workspace.messages";
import type { QaWorkspaceSummary } from "./qa-workspace-summary";

export function QaWorkspaceOverview({
  summary,
  isLoading,
  onSelectLocale,
  onSelectCheck,
  onSelectProject,
}: {
  summary: QaWorkspaceSummary;
  isLoading: boolean;
  onSelectLocale: (locale: string) => void;
  onSelectCheck: (checkType: string) => void;
  onSelectProject: (projectId: string) => void;
}) {
  const intl = useIntl();
  const { stateCounts } = summary;
  const projectStateDetail = [
    stateCounts.failed
      ? intl.formatMessage(messages.stateFailed, { count: stateCounts.failed })
      : null,
    stateCounts.running
      ? intl.formatMessage(messages.stateRunning, { count: stateCounts.running })
      : null,
    stateCounts.not_scanned
      ? intl.formatMessage(messages.stateNotScanned, { count: stateCounts.not_scanned })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const acrossProjects = intl.formatMessage(messages.acrossProjects, {
    count: stateCounts.scanned,
  });
  const projectsWithFindings = summary.projects.filter(
    (project) => project.state === "scanned" && project.errors + project.warnings > 0,
  );
  const hasChartData = Boolean(
    projectsWithFindings.length || summary.locales.length || summary.checks.length,
  );
  const emptyText = intl.formatMessage(messages.chartEmpty);

  return (
    <QaOverviewTray
      needsAction={summary.errors > 0 || stateCounts.failed > 0}
      isLoading={isLoading}
      hint={hasChartData ? intl.formatMessage(messages.chartHint) : undefined}
      metrics={
        <>
          <QaMetricCard
            label={intl.formatMessage(overviewMessages.errorsMetric)}
            value={intl.formatNumber(summary.errors)}
            detail={acrossProjects}
            emphasis={summary.errors > 0 ? "risk" : undefined}
            change={summary.errorsChange}
          />
          <QaMetricCard
            label={intl.formatMessage(overviewMessages.warningsMetric)}
            value={intl.formatNumber(summary.warnings)}
            detail={acrossProjects}
            emphasis={summary.warnings > 0 ? "watch" : undefined}
            change={summary.warningsChange}
          />
          <QaMetricCard
            label={intl.formatMessage(overviewMessages.segmentsMetric)}
            value={intl.formatNumber(summary.segments)}
            detail={intl.formatMessage(messages.latestScansDetail)}
          />
          <QaMetricCard
            label={intl.formatMessage(messages.projectsMetric)}
            value={intl.formatMessage(messages.projectsScannedValue, {
              scanned: stateCounts.scanned,
              total: summary.projectCount,
            })}
            detail={projectStateDetail || intl.formatMessage(messages.allProjectsScanned)}
            emphasis={stateCounts.failed > 0 ? "risk" : undefined}
          />
        </>
      }
      charts={
        <>
          <QaBarChartCard
            title={intl.formatMessage(messages.byProjectTitle)}
            series={qaSeverityChartConfig(intl)}
            total={projectsWithFindings.length}
            emptyText={emptyText}
            onSelect={onSelectProject}
            rows={projectsWithFindings.slice(0, QA_OVERVIEW_MAX_CHART_ROWS).map((project) => ({
              id: project.projectId,
              label: project.projectName,
              errors: project.errors,
              warnings: project.warnings,
            }))}
          />
          <QaBarChartCard
            title={intl.formatMessage(overviewMessages.byLanguageTitle)}
            series={qaFindingsChartConfig(intl, "var(--chart-1)")}
            total={summary.locales.length}
            emptyText={emptyText}
            onSelect={onSelectLocale}
            rows={summary.locales.slice(0, QA_OVERVIEW_MAX_CHART_ROWS).map((row) => ({
              id: row.value,
              label: row.value,
              findings: row.findings,
            }))}
          />
          <QaBarChartCard
            title={intl.formatMessage(overviewMessages.byCheckTitle)}
            series={qaFindingsChartConfig(intl, "var(--chart-4)")}
            total={summary.checks.length}
            emptyText={emptyText}
            onSelect={onSelectCheck}
            rows={summary.checks.slice(0, QA_OVERVIEW_MAX_CHART_ROWS).map((row) => ({
              id: row.value,
              label: qaCheckLabel(row.value, intl),
              findings: row.findings,
            }))}
          />
        </>
      }
    />
  );
}
