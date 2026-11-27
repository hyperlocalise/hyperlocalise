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
import { useState, type ReactNode } from "react";
import {
  FunnelSimpleIcon,
  MagnifyingGlassIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLocaleDisplayName } from "@/lib/i18n/locale-display-names.messages";
import { cn } from "@/lib/primitives/cn";
import {
  ISSUE_LIST_SORT_DIRECTIONS,
  ISSUE_LIST_SORT_FIELDS,
  ISSUE_LIST_VIEWS,
  ISSUE_PRIORITIES,
} from "@/lib/projects/issue-sheet/issue-list-constants";

import {
  getIssueAssigneeFilterMessage,
  getIssueListSortDirMessage,
  getIssueListSortMessage,
  getIssueListViewMessage,
  getIssueStatusFilterMessage,
  getIssueTypeFilterMessage,
  issueListFiltersBarMessages as messages,
} from "./issue-list-filters-bar.messages";
import {
  getActiveIssueFilterChips,
  ISSUE_ASSIGNEE_FILTERS,
  ISSUE_STATUS_FILTERS,
  ISSUE_TYPE_FILTERS,
  type IssueFilterChip,
  type IssueListUrlState,
} from "./issue-list-url-state";

type ProjectOption = { id: string; name: string };
type Option = { value: string; label: string };
type FilterKey = "status" | "issueType" | "priority" | "locale" | "assignee" | "projectId";

const ALL = "all";
const TOOL_CLASS =
  "size-7 rounded-full border border-border text-muted-foreground hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground";

function formatIssueFilterChipLabel(
  intl: ReturnType<typeof useIntl>,
  chip: IssueFilterChip,
): string {
  switch (chip.key) {
    case "status":
      return intl.formatMessage(messages.chipStatus, {
        value: intl.formatMessage(getIssueStatusFilterMessage(chip.value)),
      });
    case "issueType":
      return intl.formatMessage(messages.chipType, {
        value: intl.formatMessage(getIssueTypeFilterMessage(chip.value)),
      });
    case "priority":
      return intl.formatMessage(messages.chipPriority, { value: chip.value });
    case "locale":
      return intl.formatMessage(messages.chipLocale, { value: chip.value });
    case "assignee":
      return intl.formatMessage(messages.chipAssignee, {
        value: intl.formatMessage(getIssueAssigneeFilterMessage(chip.value)),
      });
    case "projectId":
      return intl.formatMessage(messages.chipProject, { value: chip.projectName });
    case "search":
      return intl.formatMessage(messages.chipSearch, { value: chip.value });
  }
}

/**
 * Linear-style list header: view pills on the left; search, filter and display as round icon
 * tools on the right; the filters in use as removable chips below.
 */
export function IssueListToolbar({
  state,
  searchDraft,
  onSearchDraftChange,
  onStateChange,
  onClearFilters,
  projects,
  locales = [],
  searchPlaceholder,
}: {
  state: IssueListUrlState;
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onStateChange: (patch: Partial<IssueListUrlState>) => void;
  onClearFilters: () => void;
  projects?: ProjectOption[];
  locales?: string[];
  searchPlaceholder?: string;
}) {
  const intl = useIntl();
  const [searchOpen, setSearchOpen] = useState(false);
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? intl.formatMessage(messages.searchPlaceholder);
  const searchLabel = intl.formatMessage(messages.searchLabel);
  const filterLabel = intl.formatMessage(messages.filterButton);
  const displayLabel = intl.formatMessage(messages.displayAction);
  const projectNameById = Object.fromEntries(
    (projects ?? []).map((project) => [project.id, project.name]),
  );
  const chips = getActiveIssueFilterChips(state, {
    includeProject: Boolean(projects),
    projectNameById,
  });
  const filterChipCount = chips.filter((chip) => chip.key !== "search").length;
  const searchVisible = searchOpen || searchDraft !== "";

  const viewOptions = ISSUE_LIST_VIEWS.map((value) => ({
    value,
    label: intl.formatMessage(getIssueListViewMessage(value)),
  }));
  const sortOptions = ISSUE_LIST_SORT_FIELDS.map((value) => ({
    value,
    label: intl.formatMessage(getIssueListSortMessage(value)),
  }));
  const sortDirOptions = ISSUE_LIST_SORT_DIRECTIONS.map((value) => ({
    value,
    label: intl.formatMessage(getIssueListSortDirMessage(value)),
  }));
  const localeOptions = [...new Set([...locales, ...(state.locale ? [state.locale] : [])])];
  const fields: { key: FilterKey; label: string; value: string; options: Option[] }[] = [
    {
      key: "status",
      label: intl.formatMessage(messages.statusLabel),
      value: state.status ?? ALL,
      options: [
        { value: ALL, label: intl.formatMessage(messages.allStatuses) },
        ...ISSUE_STATUS_FILTERS.map((value) => ({
          value,
          label: intl.formatMessage(getIssueStatusFilterMessage(value)),
        })),
      ],
    },
    {
      key: "issueType",
      label: intl.formatMessage(messages.typeLabel),
      value: state.issueType ?? ALL,
      options: [
        { value: ALL, label: intl.formatMessage(messages.allTypes) },
        ...ISSUE_TYPE_FILTERS.map((value) => ({
          value,
          label: intl.formatMessage(getIssueTypeFilterMessage(value)),
        })),
      ],
    },
    {
      key: "priority",
      label: intl.formatMessage(messages.priorityLabel),
      value: state.priority ?? ALL,
      options: [
        { value: ALL, label: intl.formatMessage(messages.allPriorities) },
        ...ISSUE_PRIORITIES.map((value) => ({ value, label: value })),
      ],
    },
    ...(localeOptions.length
      ? [
          {
            key: "locale" as const,
            label: intl.formatMessage(messages.localeLabel),
            value: state.locale ?? ALL,
            options: [
              { value: ALL, label: intl.formatMessage(messages.allLocales) },
              ...localeOptions.map((value) => ({
                value,
                label: formatLocaleDisplayName(intl, value),
              })),
            ],
          },
        ]
      : []),
    {
      key: "assignee",
      label: intl.formatMessage(messages.assigneeLabel),
      value: state.assignee ?? ALL,
      options: [
        { value: ALL, label: intl.formatMessage(messages.assigneeAnyone) },
        ...ISSUE_ASSIGNEE_FILTERS.map((value) => ({
          value,
          label: intl.formatMessage(getIssueAssigneeFilterMessage(value)),
        })),
      ],
    },
    ...(projects
      ? [
          {
            key: "projectId" as const,
            label: intl.formatMessage(messages.projectLabel),
            value: state.projectId ?? ALL,
            options: [
              { value: ALL, label: intl.formatMessage(messages.allProjects) },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div
          role="radiogroup"
          aria-label={intl.formatMessage(messages.viewLabel)}
          className="flex flex-wrap items-center gap-1.5"
        >
          {viewOptions.map((option) => {
            const on = state.view === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (!on) onStateChange({ view: option.value });
                }}
                className={cn(
                  "h-7 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  on
                    ? "border-transparent bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="ms-auto flex items-center gap-1.5">
          {searchVisible ? (
            <Input
              autoFocus={searchOpen && searchDraft === ""}
              value={searchDraft}
              onChange={(event) => onSearchDraftChange(event.currentTarget.value)}
              onBlur={() => {
                if (searchDraft === "") setSearchOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  onSearchDraftChange("");
                  setSearchOpen(false);
                }
              }}
              placeholder={resolvedSearchPlaceholder}
              aria-label={searchLabel}
              className="h-7 w-56 rounded-full text-sm md:w-72"
            />
          ) : (
            <Tool label={searchLabel}>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={TOOL_CLASS}
                aria-label={searchLabel}
                onClick={() => setSearchOpen(true)}
              >
                <MagnifyingGlassIcon />
              </Button>
            </Tool>
          )}

          <DropdownMenu>
            <Tool label={filterLabel}>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={cn(TOOL_CLASS, "relative", filterChipCount > 0 && "text-foreground")}
                    aria-label={filterLabel}
                  />
                }
              >
                <FunnelSimpleIcon />
                {filterChipCount > 0 ? (
                  <span
                    aria-hidden
                    className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-primary"
                  />
                ) : null}
              </DropdownMenuTrigger>
            </Tool>
            <DropdownMenuContent align="end" className="w-52">
              {fields.map((field) => (
                <DropdownMenuSub key={field.key}>
                  <DropdownMenuSubTrigger>{field.label}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-80">
                    <DropdownMenuRadioGroup
                      value={field.value}
                      onValueChange={(value) => {
                        const next = String(value);
                        onStateChange({ [field.key]: next === ALL ? undefined : next });
                      }}
                    >
                      {field.options.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <Tool label={displayLabel}>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className={TOOL_CLASS}
                    aria-label={displayLabel}
                  />
                }
              >
                <SlidersHorizontalIcon />
              </PopoverTrigger>
            </Tool>
            <PopoverContent align="end" className="w-84 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-muted-foreground">
                  <FormattedMessage {...messages.sortByLabel} />
                </span>
                <Select
                  value={state.sort}
                  items={sortOptions}
                  onValueChange={(value) =>
                    onStateChange({ sort: (value ?? "status") as IssueListUrlState["sort"] })
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-28"
                    aria-label={intl.formatMessage(messages.sortByLabel)}
                  >
                    <SelectValue placeholder={intl.formatMessage(messages.sortPlaceholder)} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={state.sortDir}
                  items={sortDirOptions}
                  onValueChange={(value) =>
                    onStateChange({ sortDir: (value ?? "asc") as IssueListUrlState["sortDir"] })
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-auto"
                    aria-label={intl.formatMessage(messages.orderLabel)}
                  >
                    <SelectValue placeholder={intl.formatMessage(messages.orderLabel)} />
                  </SelectTrigger>
                  <SelectContent>
                    {sortDirOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => {
            const label = formatIssueFilterChipLabel(intl, chip);
            return (
              <span
                key={chip.key}
                className="inline-flex h-6 max-w-72 items-center gap-1.5 rounded-md bg-muted ps-2 pe-0.5 text-xs text-foreground"
              >
                <span className="truncate">{label}</span>
                <button
                  type="button"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  aria-label={intl.formatMessage(messages.removeChipAriaLabel, { label })}
                  onClick={() => {
                    if (chip.key === "search") {
                      onSearchDraftChange("");
                    }
                    onStateChange({ [chip.key]: chip.key === "search" ? "" : undefined });
                  }}
                >
                  <XIcon aria-hidden className="size-3" />
                </button>
              </span>
            );
          })}
          <button
            type="button"
            onClick={onClearFilters}
            className="ms-auto text-xs text-muted-foreground hover:text-foreground"
          >
            <FormattedMessage {...messages.clearFilters} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** An icon tool with a tooltip; the wrapper span lets menu and popover triggers keep their own render. */
function Tool({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
