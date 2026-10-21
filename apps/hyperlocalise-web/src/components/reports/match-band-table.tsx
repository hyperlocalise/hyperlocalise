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

import type { ReactNode } from "react";
import { useIntl } from "react-intl";

import { cn } from "@/lib/primitives/cn";
import { MATCH_BUCKETS, type MatchBucket } from "@/lib/reporting/word-analysis";

import { bandLabel, formatCount } from "./report-format";
import { reportsPageMessages as messages } from "./reports-page.messages";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";

export type BandCounts = Partial<Record<MatchBucket, number>>;

export type BandTableColumn<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Numbers are right-aligned. */
  numeric?: boolean;
  muted?: boolean;
};

/**
 * The bands shown as columns: all but "not matched", which appears only when some work has it.
 */
export function visibleBands(totals: BandCounts): MatchBucket[] {
  return MATCH_BUCKETS.filter((bucket) => bucket !== "unavailable" || (totals[bucket] ?? 0) > 0);
}

/**
 * Units by match band, one column per band, with leading columns that say what each row is
 * (project, task, language) and trailing ones that add to it (total, cost).
 */
export function MatchBandTable<Row extends { bands: BandCounts }>({
  label,
  rows,
  rowKey,
  leading,
  trailing,
  totals,
  bands,
  beforeRows,
}: {
  label: string;
  rows: Row[];
  rowKey: (row: Row) => string;
  leading: BandTableColumn<Row>[];
  trailing: BandTableColumn<Row>[];
  /** The total row: band totals and one cell per trailing column. */
  totals?: { bands: BandCounts; trailing: ReactNode[] };
  bands: MatchBucket[];
  /** A row above the data, such as the share of each band a rate card pays. */
  beforeRows?: { label: string; bands: Partial<Record<MatchBucket, ReactNode>> };
}) {
  const intl = useIntl();
  const numeric = "text-right tabular-nums";
  return (
    <Table aria-label={label}>
      <TableHeader>
        <TableRow>
          {leading.map((column) => (
            <TableHead key={column.key}>{column.header}</TableHead>
          ))}
          {bands.map((bucket) => (
            <TableHead key={bucket} className="text-right">
              {bandLabel(intl, bucket)}
            </TableHead>
          ))}
          {trailing.map((column) => (
            <TableHead key={column.key} className={cn(column.numeric && "text-right")}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {beforeRows ? (
          <TableRow>
            <TableCell className="text-muted-foreground" colSpan={leading.length}>
              {beforeRows.label}
            </TableCell>
            {bands.map((bucket) => (
              <TableCell key={bucket} className={cn(numeric, "text-muted-foreground")}>
                {beforeRows.bands[bucket] ?? "—"}
              </TableCell>
            ))}
            {trailing.map((column) => (
              <TableCell key={column.key} />
            ))}
          </TableRow>
        ) : null}
        {rows.map((row) => (
          <TableRow key={rowKey(row)}>
            {leading.map((column) => (
              <TableCell
                key={column.key}
                className={cn(column.muted && "text-muted-foreground", column.numeric && numeric)}
              >
                {column.cell(row)}
              </TableCell>
            ))}
            {bands.map((bucket) => (
              <TableCell key={bucket} className={numeric}>
                {formatCount(intl, row.bands[bucket] ?? 0)}
              </TableCell>
            ))}
            {trailing.map((column) => (
              <TableCell
                key={column.key}
                className={cn(column.muted && "text-muted-foreground", column.numeric && numeric)}
              >
                {column.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {totals ? (
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell colSpan={leading.length}>{intl.formatMessage(messages.total)}</TableCell>
            {bands.map((bucket) => (
              <TableCell key={bucket} className={numeric}>
                {formatCount(intl, totals.bands[bucket] ?? 0)}
              </TableCell>
            ))}
            {trailing.map((column, index) => (
              <TableCell key={column.key} className={cn(column.numeric && numeric)}>
                {totals.trailing[index] ?? null}
              </TableCell>
            ))}
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
