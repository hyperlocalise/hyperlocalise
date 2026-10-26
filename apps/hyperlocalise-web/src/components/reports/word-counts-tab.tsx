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

import { REPORT_UNITS, type ReportUnit } from "@/lib/reporting/report-units";

import { MatchBandTable, visibleBands } from "./match-band-table";
import { formatCount, unitLabel } from "./report-format";
import { DownloadCsvButton, ReportPager, ReportSectionState } from "./report-section";
import { reportsPageMessages as pageMessages } from "./reports-page.messages";
import {
  reportDownloadUrl,
  useWordCounts,
  wordCountsQuery,
  type SectionInput,
} from "./reports-queries";
import type { ReportsUrlState } from "./reports-url-state";
import { SegmentedSwitch } from "./segmented-switch";
import { wordCountsTabMessages as messages } from "./word-counts-tab.messages";

type WordCountRow = NonNullable<ReturnType<typeof useWordCounts>["data"]>["rows"][number];

export function UnitSwitch({
  value,
  onChange,
}: {
  value: ReportUnit;
  onChange: (unit: ReportUnit) => void;
}) {
  const intl = useIntl();
  return (
    <SegmentedSwitch
      label={intl.formatMessage(pageMessages.unitLabel)}
      value={value}
      options={REPORT_UNITS.map((unit) => ({ value: unit, label: unitLabel(intl, unit) }))}
      onChange={onChange}
    />
  );
}

export function WordCountsTab({
  input,
  onChange,
}: {
  input: SectionInput;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const counts = useWordCounts(input);
  const { state } = input;
  const taskName = (row: WordCountRow) =>
    row.jobId === null
      ? intl.formatMessage(messages.noTask)
      : (row.jobTitle ?? intl.formatMessage(messages.deletedTask));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <SegmentedSwitch
            label={intl.formatMessage(messages.whichWords)}
            value={state.mode}
            options={[
              { value: "arrived", label: intl.formatMessage(messages.arrived) },
              { value: "finished", label: intl.formatMessage(messages.finished) },
            ]}
            onChange={(mode) => onChange({ mode })}
          />
          <UnitSwitch value={state.unit} onChange={(unit) => onChange({ unit })} />
          <SegmentedSwitch
            label={intl.formatMessage(messages.groupBy)}
            value={state.groupBy}
            options={[
              { value: "project", label: intl.formatMessage(messages.byProject) },
              { value: "task", label: intl.formatMessage(messages.byTask) },
            ]}
            onChange={(groupBy) => onChange({ groupBy })}
          />
        </div>
        <DownloadCsvButton
          href={reportDownloadUrl(input.organizationSlug, "words", wordCountsQuery(input))}
        />
      </div>
      <ReportSectionState
        query={counts}
        isEmpty={(data) => data.rows.length === 0}
        skeletonHeight={320}
      >
        {(data) => {
          // Labels follow the counts on screen, which stay while the next ones load.
          const byTask = data.groupBy === "task";
          const unitName = unitLabel(intl, data.unit);
          return (
            <>
              <p className="text-[13px] text-muted-foreground">
                {intl.formatMessage(
                  data.mode === "arrived" ? messages.arrivedNote : messages.finishedNote,
                  { unit: unitName },
                )}{" "}
                {data.unit === "characters" || data.unit === "characters_with_spaces"
                  ? intl.formatMessage(messages.charactersNote)
                  : null}
              </p>
              <MatchBandTable
                label={intl.formatMessage(messages.tableLabel)}
                rows={data.rows}
                rowKey={(row) => `${row.jobId ?? ""}:${row.projectId}:${row.targetLocale}`}
                bands={visibleBands(data.bandTotals)}
                leading={[
                  byTask
                    ? {
                        key: "task",
                        header: intl.formatMessage(messages.taskColumn),
                        cell: taskName,
                      }
                    : {
                        key: "project",
                        header: intl.formatMessage(messages.projectColumn),
                        cell: (row) => row.projectName ?? row.projectId,
                      },
                  {
                    key: "language",
                    header: intl.formatMessage(messages.languageColumn),
                    cell: (row) => row.targetLocale,
                    muted: true,
                  },
                ]}
                trailing={[
                  {
                    key: "total",
                    header: intl.formatMessage(messages.totalColumn),
                    cell: (row) => formatCount(intl, row.total),
                    numeric: true,
                  },
                ]}
                totals={{ bands: data.bandTotals, trailing: [formatCount(intl, data.total)] }}
              />
              {data.uncounted > 0 && data.unit !== "strings" ? (
                <p className="text-[13px] text-muted-foreground">
                  {intl.formatMessage(pageMessages.notCounted, { count: data.uncounted })}
                </p>
              ) : null}
              {byTask ? (
                <ReportPager
                  page={data.page}
                  pageSize={data.pageSize}
                  total={data.groupCount}
                  onPage={(page) => onChange({ page })}
                />
              ) : null}
            </>
          );
        }}
      </ReportSectionState>
    </div>
  );
}
