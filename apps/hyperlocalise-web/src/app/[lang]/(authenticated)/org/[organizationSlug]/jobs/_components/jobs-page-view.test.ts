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

import { getJobName, taskDetailSummary, type ApiJob } from "./jobs-page-view";

function createJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: "job_native",
    projectId: "project-1",
    createdByUserId: null,
    kind: "translation",
    type: "file",
    status: "running",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T01:00:00.000Z",
    completedAt: null,
    workflowRunId: null,
    lastError: null,
    inputPayload: { sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a" },
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
    ...overrides,
  };
}

describe("getJobName", () => {
  it("prefers metadata.title over the stored file id", () => {
    expect(
      getJobName(
        createJob({
          inputPayload: {
            sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
            metadata: { title: "messages.json · 2026-07-31 22:11" },
          },
        }),
      ),
    ).toBe("messages.json · 2026-07-31 22:11");
  });

  it("uses the original filename when title is missing", () => {
    expect(
      getJobName(
        createJob({
          sourceFilename: "brief.docx",
          sourcePath: "docs/brief.docx",
        }),
      ),
    ).toBe("docs/brief.docx");
  });

  it("does not show a Vercel Blob storage key or stored file id", () => {
    expect(
      getJobName(
        createJob({
          inputPayload: {
            sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
            metadata: {
              sourceFilename: "organizations/org_1/workspace/files/file_abc/home.json",
            },
          },
        }),
      ),
    ).toBe("home.json");
  });
});

describe("taskDetailSummary", () => {
  it("appends the stored failure reason for failed jobs", () => {
    const summary = taskDetailSummary(
      createJob({
        assigneeType: "agent",
        status: "failed",
        lastError: "translating the json file failed. This is usually temporary — try again.",
        inputPayload: {
          sourceFileId: "file_abc",
          targetLocales: ["ja-JP", "ko-KR"],
        },
        outcomePayload: {
          failedLocales: ["ja-JP"],
        },
      }),
    );

    expect(summary).toContain(
      "Translating the json file failed. This is usually temporary — try again.",
    );
    expect(summary).toContain("Unfinished: ja-JP");
  });

  it("does not append failure details for human-assigned jobs", () => {
    const summary = taskDetailSummary(
      createJob({
        assigneeType: "user",
        status: "failed",
        lastError: "Marked failed by user",
        inputPayload: {
          sourceFileId: "file_abc",
          targetLocales: ["ja-JP"],
        },
      }),
    );

    expect(summary).not.toContain("Marked failed by user");
  });
});
