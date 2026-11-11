"use client";
/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useId } from "react";
import { useIntl, type MessageDescriptor } from "react-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CatRevisionActorKind } from "@/lib/go-svc/go-svc-cat-revisions.types";

import { contentEditorActivityFiltersMessages as messages } from "./content-editor-activity-filters.messages";

const ANY = "any";
const HOUR_MS = 60 * 60 * 1000;

const ACTOR_OPTIONS: { value: CatRevisionActorKind; label: MessageDescriptor }[] = [
  { value: "user", label: messages.actorUser },
  { value: "agent", label: messages.actorAgent },
  { value: "api_key", label: messages.actorApiKey },
  { value: "system", label: messages.actorSystem },
];

const EVENT_GROUPS = {
  translation: { label: messages.eventTranslation, types: ["string_segment_translation_updated"] },
  review: {
    label: messages.eventReview,
    types: ["string_segment_approved", "string_segment_status_changed"],
  },
  comment: { label: messages.eventComment, types: ["string_segment_commented"] },
  lockHide: {
    label: messages.eventLockHide,
    types: [
      "string_segment_locked",
      "string_segment_unlocked",
      "string_segment_hidden",
      "string_segment_unhidden",
    ],
  },
  file: { label: messages.eventFile, types: ["file_uploaded", "file_translations_imported"] },
} as const;
type EventGroup = keyof typeof EVENT_GROUPS;

const DATE_OPTIONS = {
  day: { label: messages.lastDay, hours: 24 },
  week: { label: messages.lastWeek, hours: 24 * 7 },
  month: { label: messages.lastMonth, hours: 24 * 30 },
} as const;
type DateRange = keyof typeof DATE_OPTIONS;

export type ActivityFilters = {
  actorKind?: CatRevisionActorKind;
  eventGroup?: EventGroup;
  dateRange?: DateRange;
  /** Start of `dateRange`, fixed when it was chosen so the query stays stable. */
  since?: string;
};

/** The activity-log query fields for the chosen filters. */
export function activityFilterQuery(filters: ActivityFilters) {
  return {
    actorKind: filters.actorKind,
    eventTypes: filters.eventGroup ? EVENT_GROUPS[filters.eventGroup].types.join(",") : undefined,
    since: filters.since,
  };
}

export function ActivityFilterBar({
  filters,
  onChange,
  showFileEvents = false,
}: {
  filters: ActivityFilters;
  onChange: (filters: ActivityFilters) => void;
  showFileEvents?: boolean;
}) {
  const intl = useIntl();
  const id = useId();
  const eventGroups = (Object.keys(EVENT_GROUPS) as EventGroup[]).filter(
    (group) => showFileEvents || group !== "file",
  );
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <FilterSelect
        id={`${id}-actor`}
        label={intl.formatMessage(messages.actorLabel)}
        value={filters.actorKind}
        anyLabel={intl.formatMessage(messages.anyActor)}
        items={ACTOR_OPTIONS.map((option) => ({
          value: option.value,
          label: intl.formatMessage(option.label),
        }))}
        onValueChange={(value) =>
          onChange({ ...filters, actorKind: value as CatRevisionActorKind | undefined })
        }
      />
      <FilterSelect
        id={`${id}-event`}
        label={intl.formatMessage(messages.eventLabel)}
        value={filters.eventGroup}
        anyLabel={intl.formatMessage(messages.anyEvent)}
        items={eventGroups.map((group) => ({
          value: group,
          label: intl.formatMessage(EVENT_GROUPS[group].label),
        }))}
        onValueChange={(value) =>
          onChange({ ...filters, eventGroup: value as EventGroup | undefined })
        }
      />
      <FilterSelect
        id={`${id}-date`}
        label={intl.formatMessage(messages.dateLabel)}
        value={filters.dateRange}
        anyLabel={intl.formatMessage(messages.anyTime)}
        items={(Object.keys(DATE_OPTIONS) as DateRange[]).map((range) => ({
          value: range,
          label: intl.formatMessage(DATE_OPTIONS[range].label),
        }))}
        onValueChange={(value) => {
          const dateRange = value as DateRange | undefined;
          onChange({
            ...filters,
            dateRange,
            since: dateRange
              ? new Date(Date.now() - DATE_OPTIONS[dateRange].hours * HOUR_MS).toISOString()
              : undefined,
          });
        }}
      />
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  anyLabel,
  items,
  onValueChange,
}: {
  id: string;
  label: string;
  value?: string;
  anyLabel: string;
  items: { value: string; label: string }[];
  onValueChange: (value: string | undefined) => void;
}) {
  const labels = new Map(items.map((item) => [item.value, item.label]));
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onValueChange(!next || next === ANY ? undefined : String(next))}
      >
        <SelectTrigger id={id} size="sm" className="w-full min-w-0">
          <SelectValue>{(current: string) => labels.get(current) ?? anyLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{anyLabel}</SelectItem>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
