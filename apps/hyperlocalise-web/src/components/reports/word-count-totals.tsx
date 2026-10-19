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
import { useQuery } from "@tanstack/react-query";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WordVolumeRow } from "@/lib/reporting/word-count-report";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { reportingFetch } from "./reports-workspace";
import { wordCountReportMessages as messages } from "./word-count-reports.messages";

const NUMBER_COLUMNS = [
  "analysedWords",
  "analysedSegments",
  "completedWords",
  "completedSegments",
] as const;

/** Words per project and language, or per task and language, for the Reports filters. */
export function WordCountTotals({
  base,
  filters,
}: {
  base: string;
  filters: { from: string; to: string; projectId: string; targetLocale: string; step: string };
}) {
  const intl = useIntl();
  const [groupBy, setGroupBy] = useState<"project" | "job">("project");
  const params = new URLSearchParams({
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    groupBy,
  });
  const csvParams = new URLSearchParams(params);
  csvParams.set("format", "csv");
  const query = useQuery({
    queryKey: ["reports", base, "word-counts", params.toString()],
    queryFn: () =>
      reportingFetch<{ wordCounts: { rows: WordVolumeRow[] } }>(`${base}/word-counts?${params}`),
  });
  const rows = query.data?.wordCounts.rows ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-balance text-lg font-medium">
            {intl.formatMessage(messages.totalsTitle)}
          </h2>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            {intl.formatMessage(messages.totalsHelp)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={groupBy} onValueChange={(value) => setGroupBy(value as "project" | "job")}>
            <TabsList>
              <TabsTrigger value="project">
                {intl.formatMessage(messages.groupByProject)}
              </TabsTrigger>
              <TabsTrigger value="job">{intl.formatMessage(messages.groupByJob)}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            render={<a href={`${base}/word-counts?${csvParams}`} />}
            variant="outline"
            size="sm"
          >
            {intl.formatMessage(messages.downloadCsv)}
          </Button>
        </div>
      </div>
      {query.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {intl.formatMessage(messages.loadError)}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{intl.formatMessage(messages.noTotals)}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{intl.formatMessage(messages.project)}</TableHead>
              {groupBy === "job" ? (
                <TableHead>{intl.formatMessage(messages.task)}</TableHead>
              ) : null}
              <TableHead>{intl.formatMessage(messages.language)}</TableHead>
              {NUMBER_COLUMNS.map((key) => (
                <TableHead key={key} className="text-right">
                  {intl.formatMessage(messages[key])}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.projectId}:${row.jobId}:${row.targetLocale}`}>
                <TableCell>{row.projectName ?? row.projectId ?? "—"}</TableCell>
                {groupBy === "job" ? <TableCell>{row.jobTitle ?? "—"}</TableCell> : null}
                <TableCell>{row.targetLocale}</TableCell>
                {NUMBER_COLUMNS.map((column) => (
                  <TableCell key={column} className="text-right tabular-nums">
                    {intl.formatNumber(row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
