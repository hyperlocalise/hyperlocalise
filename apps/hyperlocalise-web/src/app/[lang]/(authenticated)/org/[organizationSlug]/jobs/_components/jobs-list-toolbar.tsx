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
import type { ReactNode } from "react";
import { Cancel01Icon, FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  WorkspaceFilterField,
  workspaceFilterTriggerClassName,
} from "../../_components/workspace-resource-shared";
import { getJobsStatusFilterMessage, jobsPageViewMessages } from "./jobs-page-view.messages";
import {
  getActiveJobsFilterChips,
  JOBS_LIST_STATUS_FILTERS,
  type JobsListFilterChip,
  type JobsListStatusFilter,
} from "./jobs-list-url-state";
import { jobsListToolbarMessages as messages } from "./jobs-list-toolbar.messages";

function formatJobsFilterChipLabel(
  intl: ReturnType<typeof useIntl>,
  chip: JobsListFilterChip,
): string {
  if (chip.key === "status") {
    return intl.formatMessage(messages.chipStatus, {
      value: intl.formatMessage(getJobsStatusFilterMessage(chip.value)),
    });
  }
  return intl.formatMessage(messages.chipSearch, { value: chip.value });
}

export function JobsListToolbar({
  searchDraft,
  onSearchDraftChange,
  statusFilter,
  onStatusFilterChange,
  onClearFilters,
  trailing,
}: {
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  statusFilter: JobsListStatusFilter;
  onStatusFilterChange: (status: JobsListStatusFilter) => void;
  onClearFilters: () => void;
  trailing?: ReactNode;
}) {
  const intl = useIntl();
  const chips = getActiveJobsFilterChips({
    search: searchDraft,
    status: statusFilter,
  });
  const hasActiveFilters = chips.length > 0;
  const filterChipCount = chips.filter((chip) => chip.key !== "search").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchDraft}
          onChange={(event) => onSearchDraftChange(event.currentTarget.value)}
          placeholder={intl.formatMessage(jobsPageViewMessages.filterSearchPlaceholder)}
          className="h-9 min-w-[12rem] flex-1 md:max-w-md"
          aria-label={intl.formatMessage(messages.searchLabel)}
        />

        <Popover>
          <PopoverTrigger
            render={<Button type="button" variant="outline" size="sm" className="gap-1.5" />}
          >
            <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-3.5" />
            {filterChipCount > 0 ? (
              <FormattedMessage
                {...messages.filterButtonWithCount}
                values={{ count: filterChipCount }}
              />
            ) : (
              <FormattedMessage {...messages.filterButton} />
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[18rem] gap-3 p-3">
            <PopoverHeader className="px-1">
              <PopoverTitle className="text-sm font-medium">
                <FormattedMessage {...messages.filterPopoverTitle} />
              </PopoverTitle>
            </PopoverHeader>
            <WorkspaceFilterField label={intl.formatMessage(messages.statusLabel)}>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  onStatusFilterChange((value ?? "all") as JobsListStatusFilter)
                }
              >
                <SelectTrigger className={workspaceFilterTriggerClassName}>
                  <SelectValue>
                    {intl.formatMessage(getJobsStatusFilterMessage(statusFilter))}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {JOBS_LIST_STATUS_FILTERS.map((status) => {
                    const label = intl.formatMessage(getJobsStatusFilterMessage(status));
                    return (
                      <SelectItem key={status} value={status} label={label}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </WorkspaceFilterField>
          </PopoverContent>
        </Popover>

        {trailing}
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => {
            const label = formatJobsFilterChipLabel(intl, chip);
            return (
              <Badge key={chip.key} variant="secondary" className="gap-1 rounded-full pe-1">
                <span>{label}</span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  aria-label={intl.formatMessage(messages.removeChipAriaLabel, { label })}
                  onClick={() => {
                    if (chip.key === "search") {
                      onSearchDraftChange("");
                      return;
                    }
                    onStatusFilterChange("all");
                  }}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                </button>
              </Badge>
            );
          })}
          <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
            <FormattedMessage {...messages.clearFilters} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
