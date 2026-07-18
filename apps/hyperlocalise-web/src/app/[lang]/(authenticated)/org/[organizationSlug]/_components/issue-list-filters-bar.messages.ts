"use client";

import type { MessageDescriptor } from "react-intl";
import { defineMessages } from "react-intl";

import type {
  IssueAssigneeFilter,
  IssueStatusFilter,
  IssueTypeFilter,
} from "./issue-list-url-state";
import type {
  IssueListSortDirection,
  IssueListSortField,
  IssueListView,
} from "@/lib/projects/issue-sheet/issue-list-constants";

export const issueListFiltersBarMessages = defineMessages({
  viewLabel: {
    defaultMessage: "View",
    id: "DA8WP2BQhf",
    description: "Label for the issue list view preset filter",
  },
  searchLabel: {
    defaultMessage: "Search",
    id: "e60mrsiJjc",
    description: "Label for the issue list search field",
  },
  sortByLabel: {
    defaultMessage: "Sort by",
    id: "vvty9tJfmx",
    description: "Label for the issue list sort field select",
  },
  orderLabel: {
    defaultMessage: "Order",
    id: "zvLlcHy4sz",
    description: "Label for the issue list sort direction select",
  },
  statusLabel: {
    defaultMessage: "Status",
    id: "SJ4E3hZuLq",
    description: "Label for the issue list status filter",
  },
  typeLabel: {
    defaultMessage: "Type",
    id: "J4PtC/cy7o",
    description: "Label for the issue list type filter",
  },
  priorityLabel: {
    defaultMessage: "Priority",
    id: "8aMYTx5g7o",
    description: "Label for the issue list priority filter",
  },
  localeLabel: {
    defaultMessage: "Locale",
    id: "40qJqxVu6N",
    description: "Label for the issue list locale filter",
  },
  assigneeLabel: {
    defaultMessage: "Assignee",
    id: "1ctE4ledVd",
    description: "Label for the issue list assignee filter",
  },
  projectLabel: {
    defaultMessage: "Project",
    id: "3GD144jdIF",
    description: "Label for the issue list project filter",
  },
  searchPlaceholder: {
    defaultMessage: "Search title, description, or source path",
    id: "GPvLe8OXlJ",
    description: "Default placeholder for the issue list search input",
  },
  localePlaceholder: {
    defaultMessage: "e.g. de-DE",
    id: "xjcfJrUODP",
    description: "Placeholder example for the issue list locale filter input",
  },
  sortPlaceholder: {
    defaultMessage: "Sort",
    id: "nkAooS6hll",
    description: "Placeholder for the issue list sort field select",
  },
  viewAllOpen: {
    defaultMessage: "All open",
    id: "3H5mLoNldT",
    description: "Issue list view preset showing all open issues",
  },
  viewMyWork: {
    defaultMessage: "My work",
    id: "YhwlgG0Ruv",
    description: "Issue list view preset showing issues assigned to the current user",
  },
  viewQaTriage: {
    defaultMessage: "QA triage",
    id: "iaqmpRkx+y",
    description: "Issue list view preset for QA triage issues",
  },
  viewSourceContext: {
    defaultMessage: "Source & context",
    id: "p8Xes8vaYS",
    description: "Issue list view preset for source and context issues",
  },
  sortUpdated: {
    defaultMessage: "Updated",
    id: "VM6KwDP12J",
    description: "Issue list sort option by last updated time",
  },
  sortCreated: {
    defaultMessage: "Created",
    id: "f0NJ4uP7Ab",
    description: "Issue list sort option by created time",
  },
  sortPriority: {
    defaultMessage: "Priority",
    id: "ZrPoXNY4JN",
    description: "Issue list sort option by priority",
  },
  sortStatus: {
    defaultMessage: "Status",
    id: "rWt5vl0XvQ",
    description: "Issue list sort option by status",
  },
  sortDirAscending: {
    defaultMessage: "Ascending",
    id: "cp1XJQA8yT",
    description: "Issue list sort direction ascending",
  },
  sortDirDescending: {
    defaultMessage: "Descending",
    id: "O+Rhddgv8v",
    description: "Issue list sort direction descending",
  },
  allStatuses: {
    defaultMessage: "All statuses",
    id: "saCoDtXDDk",
    description: "Issue list status filter option to show every status",
  },
  allTypes: {
    defaultMessage: "All types",
    id: "Jn7HxCPE6L",
    description: "Issue list type filter option to show every issue type",
  },
  allPriorities: {
    defaultMessage: "All priorities",
    id: "9uLeJ8mf3J",
    description: "Issue list priority filter option to show every priority",
  },
  allProjects: {
    defaultMessage: "All projects",
    id: "ZwAUDRMMpe",
    description: "Issue list project filter option to show every project",
  },
  assigneeAnyone: {
    defaultMessage: "Anyone",
    id: "OEETeENwOg",
    description: "Issue list assignee filter option with no assignee restriction",
  },
  assigneeMe: {
    defaultMessage: "Me",
    id: "DLeFIpAeKp",
    description: "Issue list assignee filter option for the current user",
  },
  assigneeUnassigned: {
    defaultMessage: "Unassigned",
    id: "FPj5rPYXJV",
    description: "Issue list assignee filter option for issues with no assignee",
  },
  statusOpen: {
    defaultMessage: "Open",
    id: "5PgTvcChVL",
    description: "Issue status filter option when an issue is open",
  },
  statusInProgress: {
    defaultMessage: "In progress",
    id: "n8LjMOVBA2",
    description: "Issue status filter option when an issue is in progress",
  },
  statusResolved: {
    defaultMessage: "Resolved",
    id: "YsUGw6nQKk",
    description: "Issue status filter option when an issue is resolved",
  },
  statusWontFix: {
    defaultMessage: "Won’t fix",
    id: "8h06kh0ScV",
    description: "Issue status filter option when an issue will not be fixed",
  },
  typeGeneralQuestion: {
    defaultMessage: "General question",
    id: "zXGYAzrnoH",
    description: "Issue type filter option for a general question",
  },
  typeTranslationMistake: {
    defaultMessage: "Translation mistake",
    id: "eI8CB+a2hA",
    description: "Issue type filter option for a translation mistake",
  },
  typeContextRequest: {
    defaultMessage: "Context request",
    id: "DXhIxcX2oM",
    description: "Issue type filter option for a context request",
  },
  typeSourceMistake: {
    defaultMessage: "Source mistake",
    id: "nK8hDW3Eqt",
    description: "Issue type filter option for a source mistake",
  },
  typeGlossaryViolation: {
    defaultMessage: "Glossary violation",
    id: "QoBU315wiz",
    description: "Issue type filter option for a glossary violation",
  },
  typeQaFailure: {
    defaultMessage: "QA failure",
    id: "jHZ+SJ7q8T",
    description: "Issue type filter option for a QA failure",
  },
  chipStatus: {
    defaultMessage: "Status: {value}",
    id: "IvJHA03tAg",
    description: "Active issue filter chip showing the selected status",
  },
  chipType: {
    defaultMessage: "Type: {value}",
    id: "+26I9vlNu+",
    description: "Active issue filter chip showing the selected issue type",
  },
  chipPriority: {
    defaultMessage: "Priority: {value}",
    id: "KJHAVDuUjG",
    description: "Active issue filter chip showing the selected priority",
  },
  chipLocale: {
    defaultMessage: "Locale: {value}",
    id: "4zEqWvETM+",
    description: "Active issue filter chip showing the selected locale",
  },
  chipAssignee: {
    defaultMessage: "Assignee: {value}",
    id: "dU5kt+ggA7",
    description: "Active issue filter chip showing the selected assignee",
  },
  chipProject: {
    defaultMessage: "Project: {value}",
    id: "+1W0ppiYtZ",
    description: "Active issue filter chip showing the selected project",
  },
  chipSearch: {
    defaultMessage: "Search: {value}",
    id: "dgJxXLu6Bs",
    description: "Active issue filter chip showing the current search query",
  },
  removeChipAriaLabel: {
    defaultMessage: "Remove {label}",
    id: "3cr478PtNy",
    description: "Accessible label for removing an active issue filter chip",
  },
  clearFilters: {
    defaultMessage: "Clear filters",
    id: "07NPIW0cJ3",
    description: "Button that clears all active issue list filters",
  },
});

const viewMessages = {
  all_open: issueListFiltersBarMessages.viewAllOpen,
  my_work: issueListFiltersBarMessages.viewMyWork,
  qa_triage: issueListFiltersBarMessages.viewQaTriage,
  source_context: issueListFiltersBarMessages.viewSourceContext,
} as const satisfies Record<IssueListView, MessageDescriptor>;

const sortMessages = {
  updated_at: issueListFiltersBarMessages.sortUpdated,
  created_at: issueListFiltersBarMessages.sortCreated,
  priority: issueListFiltersBarMessages.sortPriority,
  status: issueListFiltersBarMessages.sortStatus,
} as const satisfies Record<IssueListSortField, MessageDescriptor>;

const sortDirMessages = {
  asc: issueListFiltersBarMessages.sortDirAscending,
  desc: issueListFiltersBarMessages.sortDirDescending,
} as const satisfies Record<IssueListSortDirection, MessageDescriptor>;

const statusMessages = {
  open: issueListFiltersBarMessages.statusOpen,
  in_progress: issueListFiltersBarMessages.statusInProgress,
  resolved: issueListFiltersBarMessages.statusResolved,
  wont_fix: issueListFiltersBarMessages.statusWontFix,
} as const satisfies Record<IssueStatusFilter, MessageDescriptor>;

const typeMessages = {
  general_question: issueListFiltersBarMessages.typeGeneralQuestion,
  translation_mistake: issueListFiltersBarMessages.typeTranslationMistake,
  context_request: issueListFiltersBarMessages.typeContextRequest,
  source_mistake: issueListFiltersBarMessages.typeSourceMistake,
  glossary_violation: issueListFiltersBarMessages.typeGlossaryViolation,
  qa_failure: issueListFiltersBarMessages.typeQaFailure,
} as const satisfies Record<IssueTypeFilter, MessageDescriptor>;

const assigneeMessages = {
  me: issueListFiltersBarMessages.assigneeMe,
  unassigned: issueListFiltersBarMessages.assigneeUnassigned,
} as const satisfies Record<IssueAssigneeFilter, MessageDescriptor>;

export function getIssueListViewMessage(view: IssueListView): MessageDescriptor {
  return viewMessages[view];
}

export function getIssueListSortMessage(sort: IssueListSortField): MessageDescriptor {
  return sortMessages[sort];
}

export function getIssueListSortDirMessage(sortDir: IssueListSortDirection): MessageDescriptor {
  return sortDirMessages[sortDir];
}

export function getIssueStatusFilterMessage(status: IssueStatusFilter): MessageDescriptor {
  return statusMessages[status];
}

export function getIssueTypeFilterMessage(type: IssueTypeFilter): MessageDescriptor {
  return typeMessages[type];
}

export function getIssueAssigneeFilterMessage(assignee: IssueAssigneeFilter): MessageDescriptor {
  return assigneeMessages[assignee];
}
