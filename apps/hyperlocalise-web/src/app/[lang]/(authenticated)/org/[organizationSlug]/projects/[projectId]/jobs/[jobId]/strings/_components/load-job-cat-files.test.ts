import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import {
  PROJECT_FILES_FETCH_LIMIT,
  resolveJobCatTargetFromStoredFileId,
} from "./load-job-cat-files";

function createFile(overrides: Partial<ProjectFileRecord> = {}): ProjectFileRecord {
  return {
    origin: "repository",
    sourcePath: "locales/en.json",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-06-01T00:00:00.000Z",
    storedFileId: "file_en",
    metadata: {},
    filename: "en.json",
    byteSize: 128,
    provider: null,
    latestJob: null,
    ...overrides,
  };
}

describe("resolveJobCatTargetFromStoredFileId", () => {
  it("returns the matching file when present", () => {
    const files = [createFile({ storedFileId: "file_en", sourcePath: "locales/en.json" })];

    expect(resolveJobCatTargetFromStoredFileId(files, "file_en")).toEqual({
      status: "found",
      file: files[0],
    });
  });

  it("returns not_found when the file is absent and the list is below the fetch limit", () => {
    expect(resolveJobCatTargetFromStoredFileId([createFile()], "file_missing")).toEqual({
      status: "not_found",
      reference: "file_missing",
    });
  });

  it("returns list_truncated when the file is absent and the list hit the fetch limit", () => {
    const files = Array.from({ length: PROJECT_FILES_FETCH_LIMIT }, (_, index) =>
      createFile({ storedFileId: `file_${index}`, sourcePath: `locales/${index}.json` }),
    );

    expect(resolveJobCatTargetFromStoredFileId(files, "file_missing")).toEqual({
      status: "list_truncated",
      reference: "file_missing",
      fetchedCount: PROJECT_FILES_FETCH_LIMIT,
    });
  });
});
