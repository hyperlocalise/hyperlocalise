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
import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MatchAnalysisRow, WordCountTotals } from "@/lib/reporting/word-count-report";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { reportMessages } from "./reports.messages";
import { reportingFetch } from "./reports-workspace";
import { wordCountReportMessages as messages } from "./word-count-reports.messages";

const NUMBER_COLUMNS = [
  "analysedWords",
  "analysedSegments",
  "completedWords",
  "completedSegments",
] as const;

function addUp(rows: WordCountTotals[]): WordCountTotals {
  return rows.reduce(
    (sum, row) => ({
      analysedWords: sum.analysedWords + row.analysedWords,
      analysedSegments: sum.analysedSegments + row.analysedSegments,
      completedWords: sum.completedWords + row.completedWords,
      completedSegments: sum.completedSegments + row.completedSegments,
    }),
    { analysedWords: 0, analysedSegments: 0, completedWords: 0, completedSegments: 0 },
  );
}

/** A task's words by match band, per language and step, with a total for each. */
export function MatchAnalysisTable({ base, jobId }: { base: string; jobId: string }) {
  const intl = useIntl();
  const url = `${base}/tasks/${encodeURIComponent(jobId)}/match-analysis`;
  const query = useQuery({
    queryKey: ["reports", base, jobId, "match-analysis"],
    queryFn: () => reportingFetch<{ matchAnalysis: { rows: MatchAnalysisRow[] } }>(url),
  });
  const rows = query.data?.matchAnalysis.rows ?? [];
  const groups = new Map<string, MatchAnalysisRow[]>();
  for (const row of rows) {
    const key = `${row.targetLocale}\u0000${row.step}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const bandLabel = (bucket: string) =>
    bucket in reportMessages
      ? intl.formatMessage(reportMessages[bucket as keyof typeof reportMessages])
      : bucket;
  const stepLabel = (step: string) =>
    step in reportMessages
      ? intl.formatMessage(reportMessages[step as keyof typeof reportMessages])
      : step;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-balance text-lg font-medium">
            {intl.formatMessage(messages.matchAnalysisTitle)}
          </h2>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            {intl.formatMessage(messages.matchAnalysisHelp)}
          </p>
        </div>
        {rows.length > 0 ? (
          <Button
            nativeButton={false}
            render={<a href={`${url}?format=csv`} />}
            variant="outline"
            size="sm"
          >
            {intl.formatMessage(messages.downloadCsv)}
          </Button>
        ) : null}
      </div>
      {query.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {intl.formatMessage(messages.loadError)}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{intl.formatMessage(messages.noAnalysis)}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{intl.formatMessage(messages.language)}</TableHead>
              <TableHead>{intl.formatMessage(messages.band)}</TableHead>
              {NUMBER_COLUMNS.map((key) => (
                <TableHead key={key} className="text-right">
                  {intl.formatMessage(messages[key])}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...groups.entries()].map(([key, groupRows]) => {
              const totals = addUp(groupRows);
              const heading = `${groupRows[0].targetLocale} · ${stepLabel(groupRows[0].step)}`;
              return (
                <Fragment key={key}>
                  {groupRows.map((row) => (
                    <TableRow key={row.bucket}>
                      <TableCell className="text-muted-foreground">{heading}</TableCell>
                      <TableCell>{bandLabel(row.bucket)}</TableCell>
                      {NUMBER_COLUMNS.map((column) => (
                        <TableCell key={column} className="text-right tabular-nums">
                          {intl.formatNumber(row[column])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell>{heading}</TableCell>
                    <TableCell>{intl.formatMessage(messages.total)}</TableCell>
                    {NUMBER_COLUMNS.map((column) => (
                      <TableCell key={column} className="text-right tabular-nums">
                        {intl.formatNumber(totals[column])}
                      </TableCell>
                    ))}
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
