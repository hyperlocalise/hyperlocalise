import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

export type OverviewJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "waiting_for_review"
  | "cancelled";

const ACTIVE_JOB_STATUSES = new Set<OverviewJobStatus>([
  "queued",
  "running",
  "waiting_for_review",
  "failed",
]);

export function isActiveJobStatus(status: OverviewJobStatus) {
  return ACTIVE_JOB_STATUSES.has(status);
}

export function fileNeedsAttention(file: ProjectFileRecord) {
  const readiness = file.provider?.localeReadiness ?? {};
  return Object.values(readiness).some(
    (value) => value === "missing" || value === "stale" || value === "changed",
  );
}

export function countFilesNeedingAttention(files: readonly ProjectFileRecord[]) {
  return files.filter(fileNeedsAttention).length;
}

export function computeProjectPendingActionCount(
  project: {
    openJobCount: number;
    lastSyncErrorAt: string | null;
  },
  files: readonly ProjectFileRecord[],
) {
  let count = 0;

  if (project.openJobCount > 0) {
    count += project.openJobCount;
  }

  if (project.lastSyncErrorAt) {
    count += 1;
  }

  count += countFilesNeedingAttention(files);

  return count;
}

export function formatPendingActionCount(count: number) {
  if (count > 9) {
    return "9+";
  }

  return String(count);
}

export function selectOngoingJobs<T extends { status: OverviewJobStatus; updatedAt: string }>(
  jobs: readonly T[],
  limit = 2,
) {
  return [...jobs]
    .filter((job) => isActiveJobStatus(job.status))
    .toSorted(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )
    .slice(0, limit);
}

export function selectFilesNeedingAttention(files: readonly ProjectFileRecord[], limit = 2) {
  return files.filter(fileNeedsAttention).slice(0, limit);
}
