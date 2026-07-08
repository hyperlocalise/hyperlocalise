import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import { dedupeLiveFilesBySourcePath } from "@/lib/providers/jobs/tms-provider-live-file-dedupe";

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unknown size";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${Number((bytes / 1024 ** unitIndex).toFixed(1))} ${units[unitIndex]}`;
}

export function dedupeProjectFilesBySourcePath(files: ProjectFileRecord[]): ProjectFileRecord[] {
  return dedupeLiveFilesBySourcePath(files);
}
