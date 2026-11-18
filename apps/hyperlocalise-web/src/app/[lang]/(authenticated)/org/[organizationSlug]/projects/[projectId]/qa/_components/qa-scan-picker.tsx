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

import { qaMessages as m } from "@/components/qa/qa.messages";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProjectQaReport } from "@/lib/qa/qa-report-client";

import { qaProjectMessages as messages } from "../qa-project.messages";

/** The one place to switch between scans. The latest scan is listed first. */
export function QaScanPicker({
  reports,
  selectedId,
  onSelect,
}: {
  reports: ProjectQaReport[];
  selectedId: string | undefined;
  onSelect: (runId: string) => void;
}) {
  const intl = useIntl();
  const selected = reports.find((row) => row.id === selectedId);
  const formatDate = (row: ProjectQaReport) =>
    intl.formatDate(row.completedAt ?? row.createdAt, { dateStyle: "medium", timeStyle: "short" });
  const summary = (row: ProjectQaReport) => {
    if (row.status === "failed") return intl.formatMessage(messages.scanOptionFailed);
    if (row.status !== "succeeded") return intl.formatMessage(messages.scanOptionRunning);
    return [
      intl.formatMessage(m.summaryErrors, { count: row.errorCount }),
      intl.formatMessage(m.summaryWarnings, { count: row.warningCount }),
    ].join(" · ");
  };
  if (!reports.length) return null;
  return (
    <Select
      value={selectedId ?? null}
      onValueChange={(next) => {
        if (next) onSelect(next);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={intl.formatMessage(messages.scanPicker)}
        className="w-fit"
      >
        <SelectValue>
          {selected
            ? intl.formatMessage(messages.scanPickerValue, { date: formatDate(selected) })
            : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {reports.map((row, index) => {
            const label = intl.formatMessage(
              index === 0 ? messages.scanOptionLatest : messages.scanOption,
              { date: formatDate(row), summary: summary(row) },
            );
            return (
              <SelectItem key={row.id} value={row.id} label={label}>
                {label}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
