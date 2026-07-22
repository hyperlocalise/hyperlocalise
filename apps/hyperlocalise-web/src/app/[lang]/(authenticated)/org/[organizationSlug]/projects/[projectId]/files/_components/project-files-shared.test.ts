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

import { dedupeProjectFilesBySourcePath } from "./project-files-shared";

function projectFile(sourcePath: string, externalResourceId: string): ProjectFileRecord {
  return {
    origin: "provider",
    sourcePath,
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    storedFileId: null,
    metadata: {},
    filename: sourcePath.split("/").at(-1) ?? sourcePath,
    byteSize: null,
    provider: {
      kind: "phrase",
      resourceType: "file",
      externalProjectId: "proj-1",
      externalResourceId,
      externalUrl: null,
      syncState: "synced",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      localeReadiness: {},
      revision: null,
      format: "json",
      lastSyncedAt: null,
    },
    latestJob: null,
  };
}

describe("dedupeProjectFilesBySourcePath", () => {
  it("removes duplicate source paths before rendering the file tree", () => {
    const path = "service/specialty/en/long-term-care-clinician.md";
    const files = dedupeProjectFilesBySourcePath([
      projectFile(path, "upload-1"),
      projectFile(path, "upload-2"),
    ]);

    expect(files).toHaveLength(1);
    expect(files[0]?.sourcePath).toBe(path);
  });
});
