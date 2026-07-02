import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import {
  createNativeJobDetail,
  createProviderBackedJobDetail,
} from "../../_components/job-detail.fixture";
import {
  PROJECT_FILES_FETCH_LIMIT,
  mapSyncedProviderSourceFiles,
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

describe("mapSyncedProviderSourceFiles", () => {
  it("maps synced provider source files to project file records", () => {
    const job = createProviderBackedJobDetail({
      providerSourceFiles: [
        {
          id: "42",
          displayName: "messages.po",
          sourcePath: "locales/messages.po",
          resourceType: "file",
          externalUrl: null,
        },
        {
          id: "99",
          displayName: "missing-path",
          sourcePath: null,
          resourceType: "file",
          externalUrl: null,
        },
      ],
    });

    const files = mapSyncedProviderSourceFiles({
      job,
      projectId: "ext:crowdin:902807",
    });

    expect(files).toHaveLength(1);
    expect(files[0]?.sourcePath).toBe("locales/messages.po");
    expect(files[0]?.provider?.kind).toBe("crowdin");
    expect(files[0]?.provider?.externalProjectId).toBe("902807");
  });

  it("returns an empty list when the job has no provider kind", () => {
    const files = mapSyncedProviderSourceFiles({
      job: createNativeJobDetail({ externalProviderKind: null, providerSourceFiles: [] }),
      projectId: "project_1",
    });

    expect(files).toEqual([]);
  });
});
