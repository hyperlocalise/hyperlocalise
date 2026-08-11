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

export const PROJECT_OVERVIEW_TRIAGE_LIMIT = 5;

export type ProjectOverviewTriageKind = "review" | "failed" | "guidance" | "job";

export type ProjectOverviewTriageItem = {
  id: string;
  kind: ProjectOverviewTriageKind;
  job?: ApiJob;
};

function triageRank(kind: ProjectOverviewTriageKind) {
  switch (kind) {
    case "review":
      return 0;
    case "failed":
      return 1;
    case "guidance":
      return 2;
    case "job":
      return 3;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function buildProjectOverviewTriageItems(input: {
  jobs: readonly ApiJob[];
  isNative: boolean;
  hasTranslationGuidance: boolean;
  limit?: number;
}): ProjectOverviewTriageItem[] {
  const limit = input.limit ?? PROJECT_OVERVIEW_TRIAGE_LIMIT;
  const items: ProjectOverviewTriageItem[] = [];

  const reviewJobs = input.jobs.filter((job) => job.status === "waiting_for_review");
  const failedJobs = input.jobs.filter((job) => job.status === "failed");
  const otherJobs = input.jobs.filter((job) => job.status === "queued" || job.status === "running");

  for (const job of reviewJobs) {
    items.push({
      id: `review:${job.id}`,
      kind: "review",
      job,
    });
  }

  for (const job of failedJobs) {
    items.push({
      id: `failed:${job.id}`,
      kind: "failed",
      job,
    });
  }

  if (input.isNative && !input.hasTranslationGuidance) {
    items.push({
      id: "guidance:missing",
      kind: "guidance",
    });
  }

  for (const job of otherJobs) {
    items.push({
      id: `job:${job.id}`,
      kind: "job",
      job,
    });
  }

  return items
    .toSorted((left, right) => triageRank(left.kind) - triageRank(right.kind))
    .slice(0, limit);
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

export function projectOverviewMeshTone(triageCount: number): "action" | "calm" {
  return triageCount > 0 ? "action" : "calm";
}
