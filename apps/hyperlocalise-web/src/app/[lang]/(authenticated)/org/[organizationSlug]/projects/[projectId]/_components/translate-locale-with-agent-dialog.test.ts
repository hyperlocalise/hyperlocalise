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

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import {
  fetchAllProjectFiles,
  queueAgentTranslationJobs,
  selectAgentTranslatableFiles,
} from "./translate-locale-with-agent-dialog";

function projectFile(overrides: Partial<ProjectFileRecord>): ProjectFileRecord {
  return {
    origin: "repository",
    sourcePath: "messages/en.json",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-10-01T00:00:00.000Z",
    storedFileId: "stored-1",
    metadata: {},
    filename: "en.json",
    byteSize: 10,
    provider: null,
    latestJob: null,
    ...overrides,
  };
}

describe("selectAgentTranslatableFiles", () => {
  it("keeps native stored files with a supported format", () => {
    expect(
      selectAgentTranslatableFiles([
        projectFile({ storedFileId: "json-file" }),
        projectFile({ storedFileId: null }),
        projectFile({ storedFileId: "unsupported", sourcePath: "build/app.exe" }),
        projectFile({
          storedFileId: "provider-file",
          provider: {
            kind: "crowdin",
            resourceType: "file",
            externalProjectId: "1",
            externalResourceId: "2",
            externalUrl: null,
            syncState: "synced",
            sourceLocale: "en",
            targetLocales: ["fr"],
            localeReadiness: {},
            revision: null,
            format: null,
            lastSyncedAt: null,
          },
        }),
      ]),
    ).toEqual([{ storedFileId: "json-file", fileFormat: "json" }]);
  });
});

describe("fetchAllProjectFiles", () => {
  it("pages until the endpoint returns a short page", async () => {
    const all = Array.from({ length: 1_250 }, (_, index) =>
      projectFile({ storedFileId: `file-${index}` }),
    );
    const requests: Array<{ limit: number; offset: number }> = [];

    const files = await fetchAllProjectFiles(async (page) => {
      requests.push(page);
      return all.slice(page.offset, page.offset + page.limit);
    });

    expect(files).toHaveLength(1_250);
    expect(requests).toEqual([
      { limit: 1_000, offset: 0 },
      { limit: 1_000, offset: 1_000 },
    ]);
  });
});

describe("queueAgentTranslationJobs", () => {
  it("keeps queuing and counts created jobs when a request throws", async () => {
    const attempted: number[] = [];

    const result = await queueAgentTranslationJobs(
      [1, 2, 3, 4, 5],
      async (item) => {
        attempted.push(item);
        if (item === 2) {
          throw new Error("Network down");
        }
        return { ok: true };
      },
      "Failed",
    );

    expect(attempted.toSorted((left, right) => left - right)).toEqual([1, 2, 3, 4, 5]);
    expect(result).toEqual({ createdCount: 4, totalCount: 5, errorMessage: "Network down" });
  });
});
