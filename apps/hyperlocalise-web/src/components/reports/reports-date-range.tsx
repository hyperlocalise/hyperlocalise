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

import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { REPORT_PRESET_DAYS } from "@/lib/reporting/report-period";

import { reportsPageMessages as messages } from "./reports-page.messages";
import { reportDates, type ReportSettings } from "./reports-queries";
import type { ReportsPreset, ReportsUrlState } from "./reports-url-state";

type Intl = ReturnType<typeof useIntl>;

const PRESETS: readonly ReportsPreset[] = [
  ...REPORT_PRESET_DAYS.map((days) => String(days) as ReportsPreset),
  "month",
  "last_month",
  "quarter",
  "all",
];

function presetLabel(intl: Intl, preset: ReportsPreset) {
  switch (preset) {
    case "month":
      return intl.formatMessage(messages.presetMonth);
    case "last_month":
      return intl.formatMessage(messages.presetLastMonth);
    case "quarter":
      return intl.formatMessage(messages.presetQuarter);
    case "all":
      return intl.formatMessage(messages.presetAll);
    default:
      return intl.formatMessage(messages.presetLastDays, { days: Number(preset) });
  }
}

/** A UTC day as the calendar's date, and back. */
const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (date: Date) => date.toISOString().slice(0, 10);

/** The dates a report covers, shortened where they share a month or year. */
function formatRange(intl: Intl, from: string, to: string) {
  return intl.formatDateTimeRange(toDate(from), toDate(to), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The dates filter: one button naming the range, which opens the ready-made ranges beside a
 * calendar. A ready-made range moves with today; dates picked on the calendar (the first day,
 * then the last) or typed are fixed. Days are UTC, from the day Reports started to today.
 */
export function ReportsDateRange({
  state,
  settings,
  onChange,
}: {
  state: ReportsUrlState;
  settings: Pick<ReportSettings, "today" | "startedDay">;
  onChange: (change: Partial<ReportsUrlState>) => void;
}) {
  const intl = useIntl();
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const [open, setOpen] = useState(false);
  // The first day picked on the calendar, until the last is picked.
  const [pickedFrom, setPickedFrom] = useState<string | null>(null);
  const dates = reportDates(state, settings.today, settings.startedDay);
  const range = formatRange(intl, dates.from, dates.to);
  const first =
    settings.startedDay && settings.startedDay < settings.today
      ? settings.startedDay
      : settings.today;
  const applyCustom = (from: string, to: string) =>
    onChange(from <= to ? { range: "custom", from, to } : { range: "custom", from: to, to: from });

  return (
    <Field className="w-auto">
      <FieldLabel id={labelId}>{intl.formatMessage(messages.dates)}</FieldLabel>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setPickedFrom(null);
        }}
      >
        <PopoverTrigger
          render={
            // Named by the label and the range it shows.
            <Button
              variant="outline"
              aria-labelledby={`${labelId} ${valueId}`}
              className="justify-start font-normal"
            />
          }
        >
          <CalendarBlankIcon aria-hidden />
          <span id={valueId} className="tabular-nums">
            {state.range === "custom"
              ? range
              : intl.formatMessage(messages.presetRange, {
                  preset: presetLabel(intl, state.range),
                  range,
                })}
          </span>
          <CaretDownIcon aria-hidden className="text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1rem)] gap-0 p-0">
          <div className="flex flex-col sm:flex-row">
            <ul
              aria-label={intl.formatMessage(messages.readyRanges)}
              className="flex flex-wrap gap-1 border-b p-2 sm:w-44 sm:flex-col sm:flex-nowrap sm:border-e sm:border-b-0"
            >
              {PRESETS.map((preset) => (
                <li key={preset}>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={state.range === preset}
                    className="w-full justify-start font-normal aria-pressed:bg-muted aria-pressed:font-medium"
                    onClick={() => {
                      onChange({ range: preset });
                      setOpen(false);
                    }}
                  >
                    {presetLabel(intl, preset)}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 p-3">
              <div className="flex gap-2">
                <DateField
                  label={intl.formatMessage(messages.from)}
                  value={dates.from}
                  min={first}
                  max={settings.today}
                  onChange={(from) => applyCustom(from, dates.to)}
                />
                <DateField
                  label={intl.formatMessage(messages.to)}
                  value={dates.to}
                  min={first}
                  max={settings.today}
                  onChange={(to) => applyCustom(dates.from, to)}
                />
              </div>
              <Calendar
                mode="range"
                timeZone="UTC"
                weekStartsOn={1}
                numberOfMonths={2}
                // The range's last month on the right.
                defaultMonth={toDate(`${dates.to.slice(0, 7)}-01`)}
                startMonth={toDate(first)}
                endMonth={toDate(settings.today)}
                disabled={[{ before: toDate(first) }, { after: toDate(settings.today) }]}
                selected={
                  pickedFrom
                    ? { from: toDate(pickedFrom), to: undefined }
                    : { from: toDate(dates.from), to: toDate(dates.to) }
                }
                onSelect={(_range, day) => {
                  const picked = toDay(day);
                  if (!pickedFrom) {
                    setPickedFrom(picked);
                    return;
                  }
                  applyCustom(pickedFrom, picked);
                  setPickedFrom(null);
                  setOpen(false);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {intl.formatMessage(pickedFrom ? messages.pickLastDay : messages.pickFirstDay)}
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  // Typing a date passes through dates out of range (a year starts 0002), so the field keeps
  // what is typed and only a whole date in range reaches the report.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const inRange = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= min && day <= max;
  return (
    <Field className="w-auto">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="date"
        value={draft}
        min={min}
        max={max}
        className="w-40"
        onChange={(event) => {
          setDraft(event.target.value);
          if (inRange(event.target.value)) onChange(event.target.value);
        }}
        onBlur={() => setDraft(value)}
      />
    </Field>
  );
}
