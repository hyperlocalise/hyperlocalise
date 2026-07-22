"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { WorkspaceFilterField, workspaceFilterTriggerClassName } from "./workspace-resource-shared";

type ProjectOption = { id: string; name: string };

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

export function IssueListFiltersBar({
  state,
  searchDraft,
  onSearchDraftChange,
  onStateChange,
  onClearFilters,
  projects,
  searchPlaceholder,
}: {
  state: IssueListUrlState;
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onStateChange: (patch: Partial<IssueListUrlState>) => void;
  onClearFilters: () => void;
  projects?: ProjectOption[];
  searchPlaceholder?: string;
}) {
  const intl = useIntl();
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? intl.formatMessage(messages.searchPlaceholder);
  const projectNameById = Object.fromEntries(
    (projects ?? []).map((project) => [project.id, project.name]),
  );
  const chips = getActiveIssueFilterChips(state, {
    includeProject: Boolean(projects),
    projectNameById,
  });
  const hasActiveFilters = chips.length > 0;

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

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)_160px_140px]">
        <WorkspaceFilterField label={intl.formatMessage(messages.viewLabel)}>
          <Select
            value={state.view}
            items={viewOptions}
            onValueChange={(value) =>
              onStateChange({
                view: (value ?? "all_open") as IssueListUrlState["view"],
              })
            }
          >
            <SelectTrigger className={workspaceFilterTriggerClassName}>
              <SelectValue placeholder={intl.formatMessage(messages.viewLabel)} />
            </SelectTrigger>
            <SelectContent>
              {viewOptions.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        <WorkspaceFilterField label={intl.formatMessage(messages.searchLabel)}>
          <Input
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.currentTarget.value)}
            placeholder={resolvedSearchPlaceholder}
          />
        </WorkspaceFilterField>

        <WorkspaceFilterField label={intl.formatMessage(messages.sortByLabel)}>
          <Select
            value={state.sort}
            items={sortOptions}
            onValueChange={(value) =>
              onStateChange({
                sort: (value ?? "updated_at") as IssueListUrlState["sort"],
              })
            }
          >
            <SelectTrigger className={workspaceFilterTriggerClassName}>
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
        </WorkspaceFilterField>

        <WorkspaceFilterField label={intl.formatMessage(messages.orderLabel)}>
          <Select
            value={state.sortDir}
            items={sortDirOptions}
            onValueChange={(value) =>
              onStateChange({
                sortDir: (value ?? "desc") as IssueListUrlState["sortDir"],
              })
            }
          >
            <SelectTrigger className={workspaceFilterTriggerClassName}>
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
        </WorkspaceFilterField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <WorkspaceFilterField label={intl.formatMessage(messages.statusLabel)}>
          <Select
            value={state.status ?? "all"}
            onValueChange={(value) =>
              onStateChange({
                status:
                  value && value !== "all"
                    ? (value as NonNullable<IssueListUrlState["status"]>)
                    : undefined,
              })
            }
          >
            <SelectTrigger className={workspaceFilterTriggerClassName}>
              <SelectValue>
                {state.status
                  ? intl.formatMessage(getIssueStatusFilterMessage(state.status))
                  : intl.formatMessage(messages.allStatuses)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={intl.formatMessage(messages.allStatuses)}>
                <FormattedMessage {...messages.allStatuses} />
              </SelectItem>
              {ISSUE_STATUS_FILTERS.map((status) => {
                const label = intl.formatMessage(getIssueStatusFilterMessage(status));
                return (
                  <SelectItem key={status} value={status} label={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        <WorkspaceFilterField label={intl.formatMessage(messages.typeLabel)}>
          <Select
            value={state.issueType ?? "all"}
            onValueChange={(value) =>
              onStateChange({
                issueType:
                  value && value !== "all"
                    ? (value as NonNullable<IssueListUrlState["issueType"]>)
                    : undefined,
              })
            }
          >
            <SelectTrigger className={workspaceFilterTriggerClassName}>
              <SelectValue>
                {state.issueType
                  ? intl.formatMessage(getIssueTypeFilterMessage(state.issueType))
                  : intl.formatMessage(messages.allTypes)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={intl.formatMessage(messages.allTypes)}>
                <FormattedMessage {...messages.allTypes} />
              </SelectItem>
              {ISSUE_TYPE_FILTERS.map((type) => {
                const label = intl.formatMessage(getIssueTypeFilterMessage(type));
                return (
                  <SelectItem key={type} value={type} label={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        <WorkspaceFilterField label={intl.formatMessage(messages.priorityLabel)}>
          <Select
            value={state.priority ?? "all"}
            onValueChange={(value) =>
              onStateChange({
                priority:
                  value && value !== "all"
                    ? (value as NonNullable<IssueListUrlState["priority"]>)
                    : undefined,
              })
            }
          >
            <SelectTrigger className={workspaceFilterTriggerClassName}>
              <SelectValue>
                {state.priority ?? intl.formatMessage(messages.allPriorities)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={intl.formatMessage(messages.allPriorities)}>
                <FormattedMessage {...messages.allPriorities} />
              </SelectItem>
              {ISSUE_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority} label={priority}>
                  {priority}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        <WorkspaceFilterField label={intl.formatMessage(messages.localeLabel)}>
          <Input
            defaultValue={state.locale ?? ""}
            key={state.locale ?? "locale-empty"}
            onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              onStateChange({ locale: value || undefined });
            }}
            placeholder={intl.formatMessage(messages.localePlaceholder)}
          />
        </WorkspaceFilterField>

        <WorkspaceFilterField label={intl.formatMessage(messages.assigneeLabel)}>
          <Select
            value={state.assignee ?? "all"}
            onValueChange={(value) =>
              onStateChange({
                assignee:
                  value && value !== "all"
                    ? (value as NonNullable<IssueListUrlState["assignee"]>)
                    : undefined,
              })
            }
          >
            <SelectTrigger className={workspaceFilterTriggerClassName}>
              <SelectValue>
                {state.assignee
                  ? intl.formatMessage(getIssueAssigneeFilterMessage(state.assignee))
                  : intl.formatMessage(messages.assigneeAnyone)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label={intl.formatMessage(messages.assigneeAnyone)}>
                <FormattedMessage {...messages.assigneeAnyone} />
              </SelectItem>
              {ISSUE_ASSIGNEE_FILTERS.map((assignee) => {
                const label = intl.formatMessage(getIssueAssigneeFilterMessage(assignee));
                return (
                  <SelectItem key={assignee} value={assignee} label={label}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        {projects ? (
          <WorkspaceFilterField label={intl.formatMessage(messages.projectLabel)}>
            <Select
              value={state.projectId ?? "all"}
              onValueChange={(value) =>
                onStateChange({
                  projectId: value && value !== "all" ? value : undefined,
                })
              }
            >
              <SelectTrigger className={workspaceFilterTriggerClassName}>
                <SelectValue>
                  {state.projectId
                    ? (projectNameById[state.projectId] ?? state.projectId)
                    : intl.formatMessage(messages.allProjects)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" label={intl.formatMessage(messages.allProjects)}>
                  <FormattedMessage {...messages.allProjects} />
                </SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id} label={project.name}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </WorkspaceFilterField>
        ) : null}
      </div>

      {hasActiveFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => {
            const label = formatIssueFilterChipLabel(intl, chip);
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
                    }
                    onStateChange({ [chip.key]: chip.key === "search" ? "" : undefined });
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
