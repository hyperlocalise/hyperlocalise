import { buildJobCatHref, canOpenJobCat, type JobCatTarget } from "@/lib/projects/job-cat-routing";
import { resolveJobProjectId } from "@/lib/providers/tms-provider-resource-id";

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

export { buildJobCatHref, canOpenJobCat, type JobCatTarget };

export function readJobsViewMode(): JobsViewMode {
  if (typeof window === "undefined") {
    return "kanban";
  }

  try {
    const stored = window.localStorage.getItem(JOBS_VIEW_MODE_STORAGE_KEY);
    if (stored === "row" || stored === "kanban") {
      return stored;
    }
  } catch {
    return "kanban";
  }

  return "kanban";
}

export function writeJobsViewMode(mode: JobsViewMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(JOBS_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
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
