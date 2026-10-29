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

import { LogTimeDialog } from "./log-time-dialog";
import { formatChange, formatDuration, stepLabel, taskStepLabel } from "./report-format";
import { DownloadCsvButton, ReportEmpty, ReportPager, ReportSectionState } from "./report-section";
import { ReportStatCard, ReportStatCards, ReportStatCardsSkeleton } from "./report-stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import {
  loggedTimeQuery,
  reportDownloadUrl,
  useLoggedTime,
  type ReportSettings,
  type SectionInput,
} from "./reports-queries";
import type { ReportsUrlState } from "./reports-url-state";
import { timeTabMessages as messages } from "./time-tab.messages";

export function TimeTab({
  input,
  settings,
  onChange,
}: {
  input: SectionInput;
  settings: ReportSettings;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const time = useLoggedTime(input);
  const [logging, setLogging] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {time.isPending && !time.data ? (
        <ReportStatCardsSkeleton count={3} />
      ) : time.data ? (
        <ReportStatCards>
          <ReportStatCard
            label={intl.formatMessage(messages.timeLogged)}
            value={formatDuration(intl, time.data.logged.totals.minutes)}
            change={formatChange(
              intl,
              describeChange({
                current: time.data.logged.totals.minutes,
                previous: time.data.logged.previousMinutes,
                hasEarlierData: time.data.period.hasEarlierData,
              }),
              time.data.period.days,
              (minutes) => formatDuration(intl, minutes),
            )}
          />
          <ReportStatCard
            label={intl.formatMessage(messages.peopleWhoLogged)}
            value={intl.formatNumber(time.data.logged.totals.people)}
            detail={intl.formatMessage(messages.acrossTasks, {
              count: time.data.logged.totals.tasks,
            })}
          />
          {/* Automated time is workspace activity, shown with the rest of Reports to billing roles. */}
          {time.data.automated ? (
            <ReportStatCard
              label={intl.formatMessage(messages.automatedTime)}
              value={formatDuration(
                intl,
                (time.data.automated.taskRuns.milliseconds +
                  time.data.automated.workflowSteps.reduce(
                    (sum, row) => sum + row.milliseconds,
                    0,
                  )) /
                  60_000,
              )}
              detail={[
                intl.formatMessage(messages.runs, {
                  count:
                    time.data.automated.taskRuns.runs +
                    time.data.automated.workflowSteps.reduce((sum, row) => sum + row.runs, 0),
                }),
                input.state.jobId || input.state.targetLocale
                  ? intl.formatMessage(messages.automatedFiltersNote)
                  : null,
              ]
                .filter(Boolean)
                .join(". ")}
            />
          ) : null}
        </ReportStatCards>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {settings.canLogTime ? (
          <Button onClick={() => setLogging(true)}>{intl.formatMessage(messages.logTime)}</Button>
        ) : (
          <span />
        )}
        <DownloadCsvButton
          href={reportDownloadUrl(input.organizationSlug, "time", loggedTimeQuery(input))}
        />
      </div>
      <ReportSectionState query={time}>
        {(data) =>
          data.logged.rows.length === 0 ? (
            <ReportEmpty description={intl.formatMessage(messages.noTime)} />
          ) : (
            <>
              <Table aria-label={intl.formatMessage(messages.tableLabel)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{intl.formatMessage(messages.taskColumn)}</TableHead>
                    <TableHead>{intl.formatMessage(messages.taskStepColumn)}</TableHead>
                    <TableHead>{intl.formatMessage(messages.costedAsColumn)}</TableHead>
                    <TableHead>{intl.formatMessage(messages.languageColumn)}</TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.timeColumn)}
                    </TableHead>
                    <TableHead className="text-right">
                      {intl.formatMessage(messages.peopleColumn)}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logged.rows.map((row) => (
                    <TableRow key={`${row.jobId}:${row.step}:${row.targetLocale}`}>
                      <TableCell>
                        {row.jobTitle ?? intl.formatMessage(messages.deletedTask)}
                      </TableCell>
                      <TableCell>{taskStepLabel(intl, row.taskStep)}</TableCell>
                      <TableCell>{stepLabel(intl, row.step)}</TableCell>
                      <TableCell className="text-muted-foreground">{row.targetLocale}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(intl, row.minutes)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {intl.formatNumber(row.people)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ReportPager
                page={data.logged.page}
                pageSize={data.logged.pageSize}
                total={data.logged.rowCount}
                onPage={(page) => onChange({ page })}
              />
            </>
          )
        }
      </ReportSectionState>
      {logging ? (
        <LogTimeDialog
          organizationSlug={input.organizationSlug}
          settings={settings}
          projectId={input.state.projectId}
          onClose={() => setLogging(false)}
        />
      ) : null}
    </div>
  );
}
