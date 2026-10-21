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

import { selectAgentTranslatableFiles } from "./translate-locale-with-agent-dialog";

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
