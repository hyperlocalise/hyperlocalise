"use client";

import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

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
  formatIssueFilterLabel,
  getActiveIssueFilterChips,
  ISSUE_ASSIGNEE_FILTERS,
  ISSUE_STATUS_FILTERS,
  ISSUE_TYPE_FILTERS,
  type IssueListUrlState,
} from "./issue-list-url-state";
import { WorkspaceFilterField, workspaceFilterTriggerClassName } from "./workspace-resource-shared";
import { ISSUE_PRIORITIES } from "@/lib/projects/issue-sheet/issue-list-query";

const viewOptions = [
  { value: "all_open", label: "All open" },
  { value: "my_work", label: "My work" },
  { value: "qa_triage", label: "QA triage" },
  { value: "source_context", label: "Source & context" },
] as const;

const sortOptions = [
  { value: "updated_at", label: "Updated" },
  { value: "created_at", label: "Created" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
] as const;

const sortDirOptions = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" },
] as const;

type ProjectOption = { id: string; name: string };

export function IssueListFiltersBar({
  state,
  searchDraft,
  onSearchDraftChange,
  onStateChange,
  onClearFilters,
  projects,
  searchPlaceholder = "Search title, description, or source path",
}: {
  state: IssueListUrlState;
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onStateChange: (patch: Partial<IssueListUrlState>) => void;
  onClearFilters: () => void;
  projects?: ProjectOption[];
  searchPlaceholder?: string;
}) {
  const projectNameById = Object.fromEntries(
    (projects ?? []).map((project) => [project.id, project.name]),
  );
  const chips = getActiveIssueFilterChips(state, {
    includeProject: Boolean(projects),
    projectNameById,
  });
  const hasActiveFilters = chips.length > 0;

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)_160px_140px]">
        <WorkspaceFilterField label="View">
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
              <SelectValue placeholder="View" />
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

        <WorkspaceFilterField label="Search">
          <Input
            value={searchDraft}
            onChange={(event) => onSearchDraftChange(event.currentTarget.value)}
            placeholder={searchPlaceholder}
          />
        </WorkspaceFilterField>

        <WorkspaceFilterField label="Sort by">
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
              <SelectValue placeholder="Sort" />
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

        <WorkspaceFilterField label="Order">
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
              <SelectValue placeholder="Order" />
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
        <WorkspaceFilterField label="Status">
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
                {state.status ? formatIssueFilterLabel(state.status) : "All statuses"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="All statuses">
                All statuses
              </SelectItem>
              {ISSUE_STATUS_FILTERS.map((status) => (
                <SelectItem key={status} value={status} label={formatIssueFilterLabel(status)}>
                  {formatIssueFilterLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        <WorkspaceFilterField label="Type">
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
                {state.issueType ? formatIssueFilterLabel(state.issueType) : "All types"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="All types">
                All types
              </SelectItem>
              {ISSUE_TYPE_FILTERS.map((type) => (
                <SelectItem key={type} value={type} label={formatIssueFilterLabel(type)}>
                  {formatIssueFilterLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        <WorkspaceFilterField label="Priority">
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
              <SelectValue>{state.priority ?? "All priorities"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="All priorities">
                All priorities
              </SelectItem>
              {ISSUE_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority} label={priority}>
                  {priority}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        <WorkspaceFilterField label="Locale">
          <Input
            defaultValue={state.locale ?? ""}
            key={state.locale ?? "locale-empty"}
            onBlur={(event) => {
              const value = event.currentTarget.value.trim();
              onStateChange({ locale: value || undefined });
            }}
            placeholder="e.g. de-DE"
          />
        </WorkspaceFilterField>

        <WorkspaceFilterField label="Assignee">
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
                {state.assignee === "me"
                  ? "Me"
                  : state.assignee === "unassigned"
                    ? "Unassigned"
                    : "Anyone"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" label="Anyone">
                Anyone
              </SelectItem>
              {ISSUE_ASSIGNEE_FILTERS.map((assignee) => (
                <SelectItem
                  key={assignee}
                  value={assignee}
                  label={assignee === "me" ? "Me" : "Unassigned"}
                >
                  {assignee === "me" ? "Me" : "Unassigned"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </WorkspaceFilterField>

        {projects ? (
          <WorkspaceFilterField label="Project">
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
                    : "All projects"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" label="All projects">
                  All projects
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
          {chips.map((chip) => (
            <Badge key={chip.key} variant="secondary" className="gap-1 rounded-full pr-1">
              <span>{chip.label}</span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted"
                aria-label={`Remove ${chip.label}`}
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
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
