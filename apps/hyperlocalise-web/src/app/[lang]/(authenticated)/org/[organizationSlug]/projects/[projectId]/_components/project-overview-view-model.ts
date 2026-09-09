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
import type { ApiJob } from "../../../jobs/_components/jobs-page-view";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

export const PROJECT_OVERVIEW_JOBS_LIMIT = 5;

export type ProjectOverviewJobKind =
  | "review"
  | "failed"
  | "running"
  | "queued"
  | "succeeded"
  | "cancelled"
  | "guidance";

export type ProjectOverviewJobItem = {
  id: string;
  kind: ProjectOverviewJobKind;
  job?: ApiJob;
};

function projectOverviewJobKindFromStatus(status: ApiJob["status"]): ProjectOverviewJobKind {
  switch (status) {
    case "waiting_for_review":
      return "review";
    case "failed":
      return "failed";
    case "running":
      return "running";
    case "queued":
      return "queued";
    case "succeeded":
      return "succeeded";
    case "cancelled":
      return "cancelled";
    default:
      return assertNever(status);
  }
}

export function buildProjectOverviewJobItems(input: {
  jobs: readonly ApiJob[];
  isNative: boolean;
  hasTranslationGuidance: boolean;
  limit?: number;
}): ProjectOverviewJobItem[] {
  const limit = input.limit ?? PROJECT_OVERVIEW_JOBS_LIMIT;
  const items: ProjectOverviewJobItem[] = input.jobs
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map((job) => ({
      id: `job:${job.id}`,
      kind: projectOverviewJobKindFromStatus(job.status),
      job,
    }));

  if (input.isNative && !input.hasTranslationGuidance && items.length < limit) {
    items.push({
      id: "guidance:missing",
      kind: "guidance",
    });
  }

  return items;
}

export function formatProjectLocaleRoute(
  sourceLocale: string | null,
  targetLocales: readonly string[],
) {
  const source = sourceLocale?.trim() || "—";
  if (targetLocales.length === 0) {
    return source;
  }

  const preview = targetLocales.slice(0, 4).join(", ");
  const suffix = targetLocales.length > 4 ? ` +${targetLocales.length - 4}` : "";
  return `${source} → ${preview}${suffix}`;
}

export function projectOverviewMeshTone(jobCount: number): "action" | "calm" {
  return jobCount > 0 ? "action" : "calm";
}
