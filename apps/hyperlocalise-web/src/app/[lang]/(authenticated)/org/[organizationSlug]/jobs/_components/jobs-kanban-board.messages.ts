"use client";

import type { MessageDescriptor } from "react-intl";
import { defineMessages } from "react-intl";

import { getJobStatusMessage } from "./jobs-page-view.messages";
import type { KanbanStatus } from "./jobs-view-helpers";

export const jobsKanbanBoardMessages = defineMessages({
  details: {
    defaultMessage: "Details",
    id: "TotmChYda4",
    description: "Button or link to open the job detail page",
  },
  viewStrings: {
    defaultMessage: "View strings",
    id: "21nIG8nStI",
    description: "Button or link to open the job CAT workspace",
  },
  workspaceFallback: {
    defaultMessage: "Workspace",
    id: "mYcDqMLO3I",
    description: "Fallback project badge when a kanban job has no project name",
  },
  dueSyncedMeta: {
    defaultMessage: "Due {due} · Synced {synced}",
    id: "WL/j4jcqMB",
    description: "Relative due date and last sync time on a kanban job card",
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
});

export function getKanbanStatusMessage(status: KanbanStatus): MessageDescriptor {
  return getJobStatusMessage(status);
}
