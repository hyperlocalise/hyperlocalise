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

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type * as React from "react";
import { DayPicker } from "react-day-picker";
import { useIntl } from "react-intl";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { calendarMessages as messages } from "./calendar.messages";

/**
 * A month calendar for picking days (react-day-picker), in the app's styles, with its names and
 * what screen readers hear in the viewer's language. Pass `timeZone` when the days are not the
 * viewer's own, such as Reports' UTC days.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  timeZone,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const intl = useIntl();
  const longDate = (date: Date) =>
    intl.formatDate(date, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    });
  return (
    <DayPicker
      lang={intl.locale}
      showOutsideDays={showOutsideDays}
      timeZone={timeZone}
      className={cn("w-fit text-sm", className)}
      formatters={{
        formatCaption: (month) =>
          intl.formatDate(month, { month: "long", year: "numeric", timeZone }),
        formatWeekdayName: (day) => intl.formatDate(day, { weekday: "short", timeZone }),
      }}
      labels={{
        labelPrevious: () => intl.formatMessage(messages.previousMonth),
        labelNext: () => intl.formatMessage(messages.nextMonth),
        labelGrid: (month) => intl.formatDate(month, { month: "long", year: "numeric", timeZone }),
        labelWeekday: (day) => intl.formatDate(day, { weekday: "long", timeZone }),
        labelDayButton: (day, modifiers) => {
          const date = longDate(day);
          const named = modifiers.today ? intl.formatMessage(messages.today, { date }) : date;
          return modifiers.selected
            ? intl.formatMessage(messages.selected, { date: named })
            : named;
        },
      }}
      classNames={{
        root: "relative",
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-2",
        month_caption: "flex h-8 items-center justify-center font-medium",
        caption_label: "text-sm",
        nav: "absolute inset-x-0 top-0 z-10 flex items-center justify-between",
        // At the first or last month allowed the arrows are only marked aria-disabled.
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "aria-disabled:pointer-events-none aria-disabled:opacity-40",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "aria-disabled:pointer-events-none aria-disabled:opacity-40",
        ),
        month_grid: "border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-xs font-normal text-muted-foreground",
        week: "mt-1 flex",
        day: "relative size-8 p-0 text-center",
        day_button:
          "inline-flex size-8 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none",
        selected: "bg-accent text-accent-foreground first:rounded-s-md last:rounded-e-md",
        range_start:
          "rounded-s-md bg-primary text-primary-foreground [&>button]:hover:bg-primary/80",
        range_middle: "rounded-none bg-accent text-accent-foreground",
        range_end: "rounded-e-md bg-primary text-primary-foreground [&>button]:hover:bg-primary/80",
        today: "font-semibold",
        outside: "text-muted-foreground",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <CaretLeftIcon aria-hidden className="size-4" />
          ) : (
            <CaretRightIcon aria-hidden className="size-4" />
          ),
      }}
      {...props}
    />
  );
}

export { Calendar };
