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
import { defineMessages } from "react-intl";

export const jobsKanbanBoardMessages = defineMessages({
  details: {
    defaultMessage: "Details",
    id: "TotmChYda4",
    description: "Button or link to open the job detail page",
  },
  openEditor: {
    defaultMessage: "Open Editor",
    id: "r1LA5pAcBV",
    description: "Button or link to open the job Content Editor",
  },
  workspaceFallback: {
    defaultMessage: "Workspace",
    id: "mYcDqMLO3I",
    description: "Fallback project badge when a kanban job has no project name",
  },
  dueMeta: {
    defaultMessage: "Due {due}",
    id: "kPJq84MgiE",
    description: "Relative due date on a kanban job card",
  },
  noJobs: {
    defaultMessage: "No jobs",
    id: "O3GC76fqH9",
    description: "Empty state inside a kanban column with no jobs",
  },
  otherColumn: {
    defaultMessage: "Other",
    id: "XpdC3tQD4o",
    description: "Kanban column label for jobs with an unrecognized status",
  },
  loadingBoardAriaLabel: {
    defaultMessage: "Loading jobs board",
    id: "6fRdYraA0j",
    description: "Accessible label while the kanban board skeleton is shown",
  },
  kindWithTaskId: {
    defaultMessage: "{kind} · {taskId}",
    id: "H0Rnoert6W",
    description: "Job kind and task identifier shown under the kanban card title",
  },
  columnAriaLabel: {
    defaultMessage: "{status}, {count, plural, one {# job} other {# jobs}}",
    id: "HnN7Y1Kod7",
    description: "Accessible label for a kanban column with its job count",
  },
  collapseColumn: {
    defaultMessage: "Collapse {status} column",
    id: "Ce+Nk9+zQq",
    description: "Accessible label for the button that collapses a kanban column",
  },
  expandColumn: {
    defaultMessage: "Expand {status} column",
    id: "glq4HgwVfm",
    description: "Accessible label for the collapsed kanban column rail",
  },
  showMore: {
    defaultMessage: "Show {count} more",
    id: "3x/TR5Dx/U",
    description: "Button at the bottom of a kanban column that reveals hidden older jobs",
  },
  openJob: {
    defaultMessage: "Open job {name}",
    id: "2d92l/sm+5",
    description: "Accessible label for the link that covers a kanban job card",
  },
  moreLocales: {
    defaultMessage: "+{count}",
    id: "FUr8tWqfQs",
    description: "Chip showing how many more target locales a kanban job card has",
  },
  moreAssignees: {
    defaultMessage: "+{count}",
    id: "EpcpRJ0HL9",
    description: "Avatar showing how many more assignees a kanban job card has",
  },
  overdueMeta: {
    defaultMessage: "Overdue, was due {due}",
    id: "6PGWQNvIwm",
    description: "Tooltip on a kanban job card due chip when the job is past its due date",
  },
});
