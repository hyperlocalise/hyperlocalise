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

import type { IntlShape } from "react-intl";
import { useIntl } from "react-intl";

import type { PostEditBucket } from "@/lib/go-svc/go-svc-reports-api";

import { contributorsTabMessages as messages } from "./contributors-tab.messages";
import { formatCount, formatDuration, formatShare, formatUsd, unitLabel } from "./report-format";
import {
  DownloadCsvButton,
  ReportEmpty,
  ReportSection,
  ReportSectionState,
} from "./report-section";
import { ReportStatCard, ReportStatCards, ReportStatCardsSkeleton } from "./report-stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import {
  contributorsQuery,
  useContributors,
  useReportCsv,
  type SectionInput,
} from "./reports-queries";
import type { ReportsUrlState } from "./reports-url-state";
import { UnitSwitch } from "./word-counts-tab";

/** Post-edit bands, the lightest edit first; "" is work with no given text to compare. */
export const POST_EDIT_BUCKETS: readonly PostEditBucket[] = [
  "100",
  "95-99",
  "85-94",
  "75-84",
  "50-74",
  "new",
  "",
];

const POST_EDIT_MESSAGES = {
  "100": messages.postEdit_100,
  "95-99": messages["postEdit_95-99"],
  "85-94": messages["postEdit_85-94"],
  "75-84": messages["postEdit_75-84"],
  "50-74": messages["postEdit_50-74"],
  new: messages.postEdit_new,
  "": messages.postEdit_none,
} as const satisfies Record<PostEditBucket, unknown>;

export function postEditBandLabel(intl: IntlShape, bucket: PostEditBucket) {
  return intl.formatMessage(POST_EDIT_MESSAGES[bucket]);
}

/** Units a person changed so much the given text matches under 75%: heavy edits and rewrites. */
function heavilyEdited(bands: Partial<Record<PostEditBucket, number>>) {
  return (bands["50-74"] ?? 0) + (bands.new ?? 0);
}

/**
 * The Contributors tab: each person's finished work, how much of it they kept or rewrote, the
 * time they logged and what it cost. Members without billing access see only their own row.
 */
export function ContributorsTab({
  input,
  onChange,
}: {
  input: SectionInput;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const csv = useReportCsv(input.organizationSlug);
  const contributors = useContributors(input);
  const numeric = "text-right tabular-nums";
  const data = contributors.data;
  return (
    <div className="flex flex-col gap-4">
      {contributors.isPending && !data ? (
        <ReportStatCardsSkeleton count={3} />
      ) : data ? (
        <ReportStatCards>
          <ReportStatCard
            label={intl.formatMessage(messages.people)}
            value={formatCount(intl, data.totals.people)}
          />
          <ReportStatCard
            label={intl.formatMessage(messages.finished)}
            value={formatCount(intl, data.totals.finished)}
            detail={
              data.totals.finished > 0
                ? intl.formatMessage(messages.unchangedDetail, {
                    share: formatShare(intl, data.totals.unchanged / data.totals.finished),
                  })
                : unitLabel(intl, data.unit)
            }
          />
          {data.financial ? (
            <ReportStatCard
              label={intl.formatMessage(messages.spent)}
              value={formatUsd(intl, data.totals.spentUsd)}
              detail={
                data.totals.unpriced > 0
                  ? intl.formatMessage(messages.unpricedDetail, { count: data.totals.unpriced })
                  : undefined
              }
            />
          ) : null}
        </ReportStatCards>
      ) : null}
      {data && !data.financial ? (
        <p className="text-[13px] text-muted-foreground">
          {intl.formatMessage(messages.ownWorkOnly)}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UnitSwitch value={input.state.unit} onChange={(unit) => onChange({ unit })} />
        <DownloadCsvButton download={() => csv.section("contributors", contributorsQuery(input))} />
      </div>
      <ReportSectionState query={contributors}>
        {(report) =>
          report.rows.length === 0 ? (
            <ReportEmpty description={intl.formatMessage(messages.noContributors)} />
          ) : (
            <>
              <Table aria-label={intl.formatMessage(messages.tableLabel)}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{intl.formatMessage(messages.personColumn)}</TableHead>
                    <TableHead>{intl.formatMessage(messages.languagesColumn)}</TableHead>
                    <TableHead className={numeric}>
                      {intl.formatMessage(messages.finishedColumn)}
                    </TableHead>
                    <TableHead className={numeric}>
                      {intl.formatMessage(messages.unchangedColumn)}
                    </TableHead>
                    <TableHead className={numeric}>
                      {intl.formatMessage(messages.heavyEditColumn)}
                    </TableHead>
                    <TableHead className={numeric}>
                      {intl.formatMessage(messages.timeColumn)}
                    </TableHead>
                    {report.financial ? (
                      <TableHead className={numeric}>
                        {intl.formatMessage(messages.spentColumn)}
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        {row.person ?? intl.formatMessage(messages.removedMember)}
                      </TableCell>
                      <TableCell>{row.languages.join(", ")}</TableCell>
                      <TableCell className={numeric}>{formatCount(intl, row.finished)}</TableCell>
                      <TableCell className={numeric}>{formatCount(intl, row.unchanged)}</TableCell>
                      <TableCell className={numeric}>
                        {formatCount(intl, heavilyEdited(row.postEditBands))}
                      </TableCell>
                      <TableCell className={numeric}>{formatDuration(intl, row.minutes)}</TableCell>
                      {report.financial ? (
                        <TableCell className={numeric}>{formatUsd(intl, row.spentUsd)}</TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {report.totals.finished > 0 ? (
                <ReportSection
                  title={intl.formatMessage(messages.postEditTitle)}
                  description={intl.formatMessage(messages.postEditDetail, {
                    unit: unitLabel(intl, report.unit),
                  })}
                >
                  <PostEditBandsTable
                    bands={report.totals.postEditBands}
                    total={report.totals.finished}
                  />
                </ReportSection>
              ) : null}
            </>
          )
        }
      </ReportSectionState>
    </div>
  );
}

/** Finished units by post-edit band, with each band's share; bands with none are left out. */
export function PostEditBandsTable({
  bands,
  total,
}: {
  bands: Partial<Record<PostEditBucket, number>>;
  total: number;
}) {
  const intl = useIntl();
  const numeric = "text-right tabular-nums";
  const shown = POST_EDIT_BUCKETS.filter((bucket) => (bands[bucket] ?? 0) > 0);
  return (
    <Table aria-label={intl.formatMessage(messages.postEditTableLabel)}>
      <TableHeader>
        <TableRow>
          <TableHead>{intl.formatMessage(messages.bandColumn)}</TableHead>
          <TableHead className={numeric}>{intl.formatMessage(messages.unitsColumn)}</TableHead>
          <TableHead className={numeric}>{intl.formatMessage(messages.shareColumn)}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.map((bucket) => (
          <TableRow key={bucket || "none"}>
            <TableCell>{postEditBandLabel(intl, bucket)}</TableCell>
            <TableCell className={numeric}>{formatCount(intl, bands[bucket] ?? 0)}</TableCell>
            <TableCell className={numeric}>
              {formatShare(intl, total > 0 ? (bands[bucket] ?? 0) / total : null)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
