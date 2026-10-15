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
import {
  readBrowserLocalStorageItem,
  writeBrowserLocalStorageItem,
} from "@/lib/primitives/browser-local-storage/browser-local-storage";
import {
  buildJobContentEditorHref,
  canOpenJobContentEditor,
  type JobContentEditorTarget,
} from "@/lib/projects/job-content-editor-routing";
import { resolveJobProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

export type JobsViewMode = "row" | "kanban";

export const JOBS_VIEW_MODE_STORAGE_KEY = "project-jobs-view-mode:v1";

export const kanbanStatusColumns = [
  "queued",
  "running",
  "waiting_for_review",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type KanbanStatus = (typeof kanbanStatusColumns)[number];

export function isKanbanStatus(status: string): status is KanbanStatus {
  return (kanbanStatusColumns as readonly string[]).includes(status);
}

export const boardStatusColumns = [
  "queued",
  "running",
  "waiting_for_review",
  "failed",
  "succeeded",
  "cancelled",
] as const satisfies readonly KanbanStatus[];

const terminalBoardStatuses = new Set<KanbanStatus>(["succeeded", "cancelled"]);

export function isTerminalBoardStatus(status: KanbanStatus) {
  return terminalBoardStatuses.has(status);
}

type BoardSortableJob = {
  externalDueDate: string | null;
  updatedAt: string;
  completedAt: string | null;
};

function toTimestamp(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function compareRecentFirst(a: BoardSortableJob, b: BoardSortableJob) {
  const aTime = toTimestamp(a.completedAt) ?? toTimestamp(a.updatedAt) ?? 0;
  const bTime = toTimestamp(b.completedAt) ?? toTimestamp(b.updatedAt) ?? 0;
  return bTime - aTime;
}

function compareDueSoonestFirst(a: BoardSortableJob, b: BoardSortableJob) {
  const aDue = toTimestamp(a.externalDueDate);
  const bDue = toTimestamp(b.externalDueDate);
  if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;
  if (aDue !== null && bDue === null) return -1;
  if (aDue === null && bDue !== null) return 1;
  return compareRecentFirst(a, b);
}

/** Open work is ordered by due date; closed and failed work by most recent activity. */
export function sortBoardJobs<T extends BoardSortableJob>(status: KanbanStatus, jobs: T[]): T[] {
  const byRecency = isTerminalBoardStatus(status) || status === "failed";
  return jobs.toSorted(byRecency ? compareRecentFirst : compareDueSoonestFirst);
}

export type DueUrgency = "overdue" | "soon" | "upcoming";

const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export function getDueUrgency(dueDate: string | null, now = Date.now()): DueUrgency | null {
  const due = toTimestamp(dueDate);
  if (due === null) return null;
  if (due < now) return "overdue";
  if (due - now <= DUE_SOON_WINDOW_MS) return "soon";
  return "upcoming";
}

export { buildJobContentEditorHref, canOpenJobContentEditor, type JobContentEditorTarget };

export function readJobsViewMode(): JobsViewMode {
  const stored = readBrowserLocalStorageItem(JOBS_VIEW_MODE_STORAGE_KEY);
  if (stored === "row" || stored === "kanban") {
    return stored;
  }

  return "kanban";
}

export function writeJobsViewMode(mode: JobsViewMode) {
  writeBrowserLocalStorageItem(JOBS_VIEW_MODE_STORAGE_KEY, mode);
}

export function buildJobDetailHref(
  organizationSlug: string,
  projectId: string | null | undefined,
  jobId: string,
) {
  const resolvedProjectId = resolveJobProjectId(projectId, jobId);
  if (!resolvedProjectId) {
    return null;
  }

  return `/org/${organizationSlug}/projects/${encodeURIComponent(resolvedProjectId)}/jobs/${encodeURIComponent(jobId)}`;
}
