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
"use client";

import { useIntl } from "react-intl";

import { describeChange } from "@/lib/reporting/report-period";

import { costsTabMessages as messages } from "./costs-tab.messages";
import { formatChange, formatUsd } from "./report-format";
import { DownloadCsvButton, ReportEmpty, ReportSectionState } from "./report-section";
import { ReportStatCard, ReportStatCards, ReportStatCardsSkeleton } from "./report-stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import { costsQuery, useReportCsv, useCosts, type SectionInput } from "./reports-queries";

/** AI charged outside any project, shown as its own row when there is any. */
function hasOutsideProjects(data: { outsideProjects: { aiUsd: string } | null }) {
  return Number(data.outsideProjects?.aiUsd ?? 0) > 0;
}

export function CostsTab({ input }: { input: SectionInput }) {
  const intl = useIntl();
  const csv = useReportCsv(input.organizationSlug);
  const costs = useCosts(input);
  const numeric = "text-right tabular-nums";
  return (
    <div className="flex flex-col gap-4">
      {costs.isPending && !costs.data ? (
        <ReportStatCardsSkeleton count={3} />
      ) : costs.data ? (
        <ReportStatCards>
          <ReportStatCard
            label={intl.formatMessage(messages.totalSpent)}
            value={formatUsd(intl, costs.data.totals.totalUsd)}
            change={formatChange(
              intl,
              describeChange({
                current: Number(costs.data.totals.totalUsd),
                previous: Number(costs.data.previousTotalUsd),
                hasEarlierData: costs.data.period.hasEarlierData,
              }),
              costs.data.period.days,
              (amount) => formatUsd(intl, amount.toFixed(8)),
            )}
          />
          <ReportStatCard
            label={intl.formatMessage(messages.people)}
            value={formatUsd(intl, costs.data.totals.peopleUsd)}
            detail={intl.formatMessage(messages.peopleDetail)}
          />
          <ReportStatCard
            label={intl.formatMessage(messages.ai)}
            value={formatUsd(intl, costs.data.totals.aiUsd)}
            detail={intl.formatMessage(messages.aiDetail)}
          />
        </ReportStatCards>
      ) : null}
      <div className="flex justify-end">
        <DownloadCsvButton download={() => csv.section("costs", costsQuery(input))} />
      </div>
      <ReportSectionState query={costs}>
        {(data) => (
          <>
            {data.rows.length === 0 && !hasOutsideProjects(data) ? (
              <ReportEmpty description={intl.formatMessage(messages.noCosts)} />
            ) : (
              <Table aria-label={intl.formatMessage(messages.tableLabel)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{intl.formatMessage(messages.projectColumn)}</TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.people)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.aiOnTasks)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.aiOutsideTasks)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.totalColumn)}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.projectId}>
                      <TableCell>{row.projectName}</TableCell>
                      <TableCell className={numeric}>{formatUsd(intl, row.peopleUsd)}</TableCell>
                      <TableCell className={numeric}>{formatUsd(intl, row.aiOnTasksUsd)}</TableCell>
                      <TableCell className={numeric}>
                        {formatUsd(intl, row.aiOutsideTasksUsd)}
                      </TableCell>
                      <TableCell className={numeric}>{formatUsd(intl, row.totalUsd)}</TableCell>
                    </TableRow>
                  ))}
                  {data.outsideProjects && hasOutsideProjects(data) ? (
                    <TableRow>
                      <TableCell className="text-muted-foreground">
                        {intl.formatMessage(messages.outsideProjects)}
                      </TableCell>
                      <TableCell className={numeric}>{formatUsd(intl, null)}</TableCell>
                      <TableCell className={numeric}>
                        {formatUsd(intl, data.outsideProjects.aiOnTasksUsd)}
                      </TableCell>
                      <TableCell className={numeric}>
                        {formatUsd(intl, data.outsideProjects.aiOutsideTasksUsd)}
                      </TableCell>
                      <TableCell className={numeric}>
                        {formatUsd(intl, data.outsideProjects.aiUsd)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>{intl.formatMessage(pageMessages.total)}</TableCell>
                    <TableCell className={numeric}>
                      {formatUsd(intl, data.totals.peopleUsd)}
                    </TableCell>
                    <TableCell className={numeric}>
                      {formatUsd(intl, data.totals.aiOnTasksUsd)}
                    </TableCell>
                    <TableCell className={numeric}>
                      {formatUsd(intl, data.totals.aiOutsideTasksUsd)}
                    </TableCell>
                    <TableCell className={numeric}>
                      {formatUsd(intl, data.totals.totalUsd)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
            <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
              {data.totals.aiUsd === null ? (
                <p>{intl.formatMessage(messages.aiByLanguage)}</p>
              ) : null}
              {data.unpriced > 0 ? (
                <p>{intl.formatMessage(messages.unpriced, { count: data.unpriced })}</p>
              ) : null}
              {data.pendingAi > 0 ? (
                <p>{intl.formatMessage(messages.pendingAi, { count: data.pendingAi })}</p>
              ) : null}
            </div>
          </>
        )}
      </ReportSectionState>
    </div>
  );
}
