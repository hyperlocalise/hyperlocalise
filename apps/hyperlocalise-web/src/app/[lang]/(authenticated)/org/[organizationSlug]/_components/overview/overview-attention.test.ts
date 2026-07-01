import { describe, expect, it } from "vite-plus/test";

import type { ProjectFileRecord } from "@/api/routes/project/project.schema";

import {
  computeProjectPendingActionCount,
  countFilesNeedingAttention,
  fileNeedsAttention,
  formatPendingActionCount,
  isActiveJobStatus,
  selectFilesNeedingAttention,
  selectOngoingJobs,
} from "./overview-attention";

function createFile(
  localeReadiness: Record<string, string>,
  sourcePath = "path/file.json",
): ProjectFileRecord {
  return {
    origin: "provider",
    sourcePath,
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    uploadedAt: "2026-01-01T00:00:00.000Z",
    storedFileId: null,
    metadata: {},
    filename: "file.json",
    byteSize: 100,
    provider: {
      kind: "crowdin",
      resourceType: "file",
      externalProjectId: "1",
      externalResourceId: "1",
      externalUrl: null,
      syncState: "changed",
      sourceLocale: "en",
      targetLocales: ["fr"],
      localeReadiness,
      revision: null,
      format: "json",
      lastSyncedAt: null,
    },
    latestJob: null,
  };
}

describe("overview-attention", () => {
  it("detects files that need attention", () => {
    expect(fileNeedsAttention(createFile({ fr: "ready" }))).toBe(false);
    expect(fileNeedsAttention(createFile({ fr: "missing" }))).toBe(true);
    expect(fileNeedsAttention(createFile({ fr: "changed" }))).toBe(true);
    expect(fileNeedsAttention(createFile({ fr: "stale" }))).toBe(true);
  });

  it("counts pending actions from jobs and files", () => {
    const files = [
      createFile({ fr: "missing" }, "a.json"),
      createFile({ fr: "changed" }, "b.json"),
      createFile({ fr: "ready" }, "c.json"),
    ];

    expect(computeProjectPendingActionCount({ openJobCount: 2 }, files)).toBe(4);
  });

  it("formats large pending counts", () => {
    expect(formatPendingActionCount(12)).toBe("9+");
    expect(formatPendingActionCount(3)).toBe("3");
  });

  it("selects active jobs by recency", () => {
    const jobs = [
      { id: "old", status: "running" as const, updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", status: "queued" as const, updatedAt: "2026-03-01T00:00:00.000Z" },
      { id: "done", status: "succeeded" as const, updatedAt: "2026-03-02T00:00:00.000Z" },
    ];

    expect(selectOngoingJobs(jobs).map((job) => job.id)).toEqual(["new", "old"]);
    expect(isActiveJobStatus("succeeded")).toBe(false);
  });

  it("selects files needing attention", () => {
    const files = [
      createFile({ fr: "ready" }, "ready.json"),
      createFile({ fr: "missing" }, "missing.json"),
    ];

    expect(countFilesNeedingAttention(files)).toBe(1);
    expect(selectFilesNeedingAttention(files).map((file) => file.sourcePath)).toEqual([
      "missing.json",
    ]);
  });
});
