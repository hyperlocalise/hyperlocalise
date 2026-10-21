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

import { useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { describeChange } from "@/lib/reporting/report-period";

import { AddExpenseDialog } from "./add-expense-dialog";
import { costsTabMessages as messages } from "./costs-tab.messages";
import { formatChange, formatUsd } from "./report-format";
import { DownloadCsvButton, ReportEmpty, ReportSectionState } from "./report-section";
import { ReportStatCard, ReportStatCards, ReportStatCardsSkeleton } from "./report-stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import {
  costsQuery,
  reportDownloadUrl,
  useCosts,
  type ReportSettings,
  type SectionInput,
} from "./reports-queries";

export function CostsTab({ input, settings }: { input: SectionInput; settings: ReportSettings }) {
  const intl = useIntl();
  const costs = useCosts(input);
  const [adding, setAdding] = useState(false);
  const numeric = "text-right tabular-nums";
  return (
    <div className="flex flex-col gap-4">
      {costs.isPending && !costs.data ? (
        <ReportStatCardsSkeleton count={4} />
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
          <ReportStatCard
            label={intl.formatMessage(messages.expenses)}
            value={formatUsd(intl, costs.data.totals.expensesUsd)}
            detail={intl.formatMessage(messages.expensesDetail)}
          />
        </ReportStatCards>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {settings.canManage ? (
          <Button variant="outline" onClick={() => setAdding(true)}>
            {intl.formatMessage(messages.addExpense)}
          </Button>
        ) : (
          <span />
        )}
        <DownloadCsvButton
          href={reportDownloadUrl(input.organizationSlug, "costs", costsQuery(input))}
        />
      </div>
      <ReportSectionState query={costs}>
        {(data) => (
          <>
            {data.rows.length === 0 ? (
              <ReportEmpty description={intl.formatMessage(messages.noCosts)} />
            ) : (
              <Table aria-label={intl.formatMessage(messages.tableLabel)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{intl.formatMessage(messages.projectColumn)}</TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.people)}
                    </TableHead>
                    <TableHead className="text-right">{intl.formatMessage(messages.ai)}</TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.expenses)}
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
                      <TableCell className={numeric}>{formatUsd(intl, row.aiUsd)}</TableCell>
                      <TableCell className={numeric}>{formatUsd(intl, row.expensesUsd)}</TableCell>
                      <TableCell className={numeric}>{formatUsd(intl, row.totalUsd)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>{intl.formatMessage(pageMessages.total)}</TableCell>
                    <TableCell className={numeric}>
                      {formatUsd(intl, data.totals.peopleUsd)}
                    </TableCell>
                    <TableCell className={numeric}>{formatUsd(intl, data.totals.aiUsd)}</TableCell>
                    <TableCell className={numeric}>
                      {formatUsd(intl, data.totals.expensesUsd)}
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
      {adding ? (
        <AddExpenseDialog
          organizationSlug={input.organizationSlug}
          settings={settings}
          projectId={input.state.projectId}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}
