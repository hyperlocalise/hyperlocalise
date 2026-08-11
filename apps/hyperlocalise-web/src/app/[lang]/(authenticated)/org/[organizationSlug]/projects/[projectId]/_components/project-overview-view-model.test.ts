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
import { describe, expect, it } from "vite-plus/test";

import type { ApiJob } from "../../../jobs/_components/jobs-page-view";
import {
  buildProjectOverviewTriageItems,
  formatProjectLocaleRoute,
  projectOverviewMeshTone,
} from "./project-overview-view-model";

function job(partial: Partial<ApiJob> & Pick<ApiJob, "id" | "status">): ApiJob {
  return {
    projectId: "project_1",
    createdByUserId: "user_1",
    kind: "translation",
    type: "file",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    workflowRunId: null,
    lastError: null,
    inputPayload: null,
    outcomeKind: null,
    outcomePayload: null,
    reviewCriteria: null,
    reviewTargetLocale: null,
    syncConnectorKind: null,
    syncDirection: null,
    assetType: null,
    assetOperation: null,
    externalProviderKind: null,
    externalTaskId: null,
    externalStatus: null,
    externalTitle: null,
    externalDueDate: null,
    externalTargetLocales: null,
    externalAssignedUsers: null,
    externalSyncState: null,
    ...partial,
  };
}

describe("buildProjectOverviewTriageItems", () => {
  it("orders review, failed, missing guidance, then other jobs", () => {
    const items = buildProjectOverviewTriageItems({
      jobs: [
        job({ id: "running", status: "running" }),
        job({ id: "failed", status: "failed" }),
        job({ id: "review", status: "waiting_for_review" }),
      ],
      isNative: true,
      hasTranslationGuidance: false,
      limit: 10,
    });

    expect(items.map((item) => item.kind)).toEqual(["review", "failed", "guidance", "job"]);
  });

  it("omits guidance when set or when the project is not native", () => {
    expect(
      buildProjectOverviewTriageItems({
        jobs: [],
        isNative: true,
        hasTranslationGuidance: true,
      }),
    ).toEqual([]);

    expect(
      buildProjectOverviewTriageItems({
        jobs: [],
        isNative: false,
        hasTranslationGuidance: false,
      }),
    ).toEqual([]);
  });

  it("does not include file-based triage items", () => {
    const items = buildProjectOverviewTriageItems({
      jobs: [job({ id: "review", status: "waiting_for_review" })],
      isNative: true,
      hasTranslationGuidance: true,
    });

    expect(items.every((item) => item.kind !== ("file" as string))).toBe(true);
  });

  it("keeps older review jobs ahead of newer in-progress work when capping", () => {
    const items = buildProjectOverviewTriageItems({
      jobs: [
        job({
          id: "running-new",
          status: "running",
          updatedAt: "2026-07-02T00:00:10.000Z",
        }),
        job({
          id: "queued-new",
          status: "queued",
          updatedAt: "2026-07-02T00:00:09.000Z",
        }),
        job({
          id: "running-2",
          status: "running",
          updatedAt: "2026-07-02T00:00:08.000Z",
        }),
        job({
          id: "queued-2",
          status: "queued",
          updatedAt: "2026-07-02T00:00:07.000Z",
        }),
        job({
          id: "running-3",
          status: "running",
          updatedAt: "2026-07-02T00:00:06.000Z",
        }),
        job({
          id: "review-old",
          status: "waiting_for_review",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
        job({
          id: "failed-old",
          status: "failed",
          updatedAt: "2026-07-01T00:00:01.000Z",
        }),
      ],
      isNative: true,
      hasTranslationGuidance: true,
      limit: 5,
    });

    expect(items.map((item) => item.job?.id)).toEqual([
      "review-old",
      "failed-old",
      "running-new",
      "queued-new",
      "running-2",
    ]);
  });
});

describe("formatProjectLocaleRoute", () => {
  it("formats source and target preview", () => {
    expect(formatProjectLocaleRoute("en-US", ["fr-FR", "de-DE"])).toBe("en-US → fr-FR, de-DE");
    expect(formatProjectLocaleRoute(null, [])).toBe("—");
  });
});

describe("projectOverviewMeshTone", () => {
  it("uses action tone when triage items exist", () => {
    expect(projectOverviewMeshTone(2)).toBe("action");
    expect(projectOverviewMeshTone(0)).toBe("calm");
  });
});
