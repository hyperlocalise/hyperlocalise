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
  buildProjectOverviewJobItems,
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

describe("buildProjectOverviewJobItems", () => {
  it("orders jobs by most recently updated", () => {
    const items = buildProjectOverviewJobItems({
      jobs: [
        job({
          id: "running",
          status: "running",
          updatedAt: "2026-07-02T00:00:08.000Z",
        }),
        job({
          id: "failed",
          status: "failed",
          updatedAt: "2026-07-02T00:00:10.000Z",
        }),
        job({
          id: "review",
          status: "waiting_for_review",
          updatedAt: "2026-07-02T00:00:09.000Z",
        }),
        job({
          id: "succeeded",
          status: "succeeded",
          updatedAt: "2026-07-02T00:00:11.000Z",
        }),
      ],
      isNative: true,
      hasTranslationGuidance: true,
      limit: 10,
    });

    expect(items.map((item) => item.job?.id)).toEqual(["succeeded", "failed", "review", "running"]);
  });

  it("appends missing guidance when there is room under the cap", () => {
    const items = buildProjectOverviewJobItems({
      jobs: [job({ id: "failed", status: "failed" })],
      isNative: true,
      hasTranslationGuidance: false,
      limit: 5,
    });

    expect(items.map((item) => item.kind)).toEqual(["failed", "guidance"]);
  });

  it("omits guidance when set or when the project is not native", () => {
    expect(
      buildProjectOverviewJobItems({
        jobs: [],
        isNative: true,
        hasTranslationGuidance: true,
      }),
    ).toEqual([]);

    expect(
      buildProjectOverviewJobItems({
        jobs: [],
        isNative: false,
        hasTranslationGuidance: false,
      }),
    ).toEqual([]);
  });

  it("caps the number of recent jobs shown", () => {
    const items = buildProjectOverviewJobItems({
      jobs: [
        job({ id: "job-1", status: "running", updatedAt: "2026-07-02T00:00:10.000Z" }),
        job({ id: "job-2", status: "queued", updatedAt: "2026-07-02T00:00:09.000Z" }),
        job({ id: "job-3", status: "failed", updatedAt: "2026-07-02T00:00:08.000Z" }),
      ],
      isNative: true,
      hasTranslationGuidance: true,
      limit: 2,
    });

    expect(items.map((item) => item.job?.id)).toEqual(["job-1", "job-2"]);
  });
});

describe("formatProjectLocaleRoute", () => {
  it("formats source and target preview", () => {
    expect(formatProjectLocaleRoute("en-US", ["fr-FR", "de-DE"])).toBe("en-US → fr-FR, de-DE");
    expect(formatProjectLocaleRoute(null, [])).toBe("—");
  });
});

describe("projectOverviewMeshTone", () => {
  it("uses action tone when recent jobs exist", () => {
    expect(projectOverviewMeshTone(2)).toBe("action");
    expect(projectOverviewMeshTone(0)).toBe("calm");
  });
});
