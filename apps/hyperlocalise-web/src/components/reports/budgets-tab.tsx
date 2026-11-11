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

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { budgetsTabMessages as messages } from "./budgets-tab.messages";
import { formatUsd } from "./report-format";
import { DownloadCsvButton, ReportEmpty, ReportSectionState } from "./report-section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { budgetsQuery, useReportCsv, useBudgets, type ReportSettings } from "./reports-queries";
import { SetBudgetDialog } from "./set-budget-dialog";

type BudgetStatus = "on_track" | "over_80" | "forecast_over" | "over_budget";

const STATUS_MESSAGES = {
  on_track: messages.status_on_track,
  over_80: messages.status_over_80,
  forecast_over: messages.status_forecast_over,
  over_budget: messages.status_over_budget,
} satisfies Record<BudgetStatus, unknown>;

const STATUS_STYLES: Record<
  BudgetStatus,
  { bar: string; badge: "secondary" | "warning" | "destructive" }
> = {
  on_track: { bar: "bg-[var(--chart-1)]", badge: "secondary" },
  over_80: { bar: "bg-warning", badge: "warning" },
  forecast_over: { bar: "bg-destructive", badge: "destructive" },
  over_budget: { bar: "bg-destructive", badge: "destructive" },
};

export function BudgetsTab({
  organizationSlug,
  settings,
  projectId,
}: {
  organizationSlug: string;
  settings: ReportSettings;
  projectId: string | null;
}) {
  const intl = useIntl();
  const csv = useReportCsv(organizationSlug);
  const budgets = useBudgets(organizationSlug, projectId);
  const [editing, setEditing] = useState(false);
  const numeric = "text-right tabular-nums";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {settings.canManage ? (
          <Button variant="outline" onClick={() => setEditing(true)}>
            {intl.formatMessage(messages.setBudget)}
          </Button>
        ) : (
          <span />
        )}
        <DownloadCsvButton download={() => csv.section("budgets", budgetsQuery(projectId))} />
      </div>
      <ReportSectionState query={budgets}>
        {(data) => {
          const rows = data;
          if (rows.length === 0)
            return <ReportEmpty description={intl.formatMessage(messages.noBudgets)} />;
          return (
            <>
              <Table aria-label={intl.formatMessage(messages.tableLabel)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{intl.formatMessage(messages.projectColumn)}</TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.budgetColumn)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.spentColumn)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.toComeColumn)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.forecastColumn)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.remainingColumn)}
                    </TableHead>
                    <TableHead>{intl.formatMessage(messages.statusColumn)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const budget = Number(row.budgetUsd);
                    const share = budget > 0 ? Math.min(1, Number(row.forecastUsd) / budget) : 1;
                    const style = STATUS_STYLES[row.status];
                    return (
                      <TableRow key={row.projectId}>
                        <TableCell>{row.projectName}</TableCell>
                        <TableCell className={numeric}>{formatUsd(intl, row.budgetUsd)}</TableCell>
                        <TableCell className={numeric}>{formatUsd(intl, row.spentUsd)}</TableCell>
                        <TableCell className={numeric}>
                          {Number(row.stillToComeUsd) === 0 && row.incomplete
                            ? intl.formatMessage(messages.notPriced)
                            : formatUsd(intl, row.stillToComeUsd)}
                          {row.incomplete ? (
                            <span
                              title={intl.formatMessage(messages.incomplete)}
                              aria-label={intl.formatMessage(messages.incomplete)}
                            >
                              {" "}
                              *
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className={numeric}>
                          {formatUsd(intl, row.forecastUsd)}
                        </TableCell>
                        <TableCell className={numeric}>
                          {formatUsd(intl, row.remainingUsd)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className="h-2 w-28 overflow-hidden rounded-full bg-muted"
                            >
                              <span
                                className={cn("block h-full rounded-full", style.bar)}
                                style={{ width: `${Math.round(share * 100)}%` }}
                              />
                            </span>
                            <Badge variant={style.badge}>
                              {intl.formatMessage(STATUS_MESSAGES[row.status])}
                            </Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {rows.some((row) => row.incomplete) ? (
                <p className="text-[13px] text-muted-foreground">
                  * {intl.formatMessage(messages.incomplete)}
                </p>
              ) : null}
              <p className="text-[13px] text-muted-foreground">
                {intl.formatMessage(messages.note)}
              </p>
            </>
          );
        }}
      </ReportSectionState>
      {editing ? (
        <SetBudgetDialog
          organizationSlug={organizationSlug}
          settings={settings}
          projectId={projectId}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
