import { describe, expect, it } from "vite-plus/test";

import type { ApiJob } from "./jobs-page-view";
import {
  buildJobCatHref,
  buildJobDetailHref,
  canOpenJobCat,
  isKanbanStatus,
  readJobsViewMode,
  writeJobsViewMode,
} from "./jobs-view-helpers";

function createJob(overrides: Partial<ApiJob> = {}): ApiJob {
  return {
    id: "ext:crowdin:project-1:job-1",
    projectId: "ext:crowdin:project-1",
    createdByUserId: null,
    kind: "translation",
    type: "file",
    status: "running",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T01:00:00.000Z",
    completedAt: null,
    workflowRunId: null,
    lastError: null,
    inputPayload: { sourceFileId: "locales/en.json" },
    outcomeKind: null,
    outcomePayload: null,
    reviewCriteria: null,
    reviewTargetLocale: null,
    syncConnectorKind: null,
    syncDirection: null,
    assetType: null,
    assetOperation: null,
    externalProviderKind: "crowdin",
    externalTaskId: "CR-1204",
    externalStatus: "in_progress",
    externalTitle: "Translate homepage",
    externalDueDate: "2026-06-10T00:00:00.000Z",
    externalTargetLocales: ["fr-FR"],
    externalAssignedUsers: ["Mina"],
    externalSyncState: "synced",
    ...overrides,
  };
}

describe("jobs-view-helpers", () => {
  it("builds project job detail hrefs", () => {
    expect(buildJobDetailHref("acme", "project-1", "job-1")).toBe(
      "/org/acme/projects/project-1/jobs/job-1",
    );
    expect(buildJobDetailHref("acme", "ext:crowdin:902807", "ext:crowdin:902807:2001")).toBe(
      "/org/acme/projects/902807/jobs/2001",
    );
    expect(buildJobDetailHref("acme", null, "job-1")).toBeNull();
  });

  it("allows CAT for provider-backed translation and review jobs", () => {
    expect(canOpenJobCat(createJob())).toBe(true);
    expect(canOpenJobCat(createJob({ kind: "review" }))).toBe(true);
    expect(canOpenJobCat(createJob({ kind: "sync" }))).toBe(false);
  });

  it("allows CAT for native file translation jobs", () => {
    expect(
      canOpenJobCat(
        createJob({
          externalProviderKind: null,
          id: "job_native",
          externalTargetLocales: null,
          inputPayload: {
            sourceFileId: "file_home_json",
            targetLocales: ["fr-FR"],
          },
        }),
      ),
    ).toBe(true);
  });

  it("builds provider CAT hrefs with locale and source path when available", () => {
    expect(buildJobCatHref("acme", "ext:crowdin:project-1", createJob())).toBe(
      "/org/acme/projects/project-1/jobs/job-1/strings?targetLocale=fr-FR&sourcePath=locales%2Fen.json",
    );
    expect(buildJobCatHref("acme", null, createJob())).toBeNull();
    expect(buildJobCatHref("acme", "project-1", createJob({ kind: "sync" }))).toBeNull();
  });

  it("builds native CAT hrefs with stored file id and target locale", () => {
    expect(
      buildJobCatHref(
        "acme",
        "project-1",
        createJob({
          externalProviderKind: null,
          id: "job_native",
          externalTargetLocales: null,
          inputPayload: {
            sourceFileId: "file_home_json",
            targetLocales: ["fr-FR"],
          },
        }),
      ),
    ).toBe(
      "/org/acme/projects/project-1/jobs/job_native/strings?storedFileId=file_home_json&targetLocale=fr-FR",
    );
  });

  it("identifies known kanban statuses", () => {
    expect(isKanbanStatus("running")).toBe(true);
    expect(isKanbanStatus("unknown_status")).toBe(false);
  });

  it("persists project jobs view mode in local storage", () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      expect(readJobsViewMode()).toBe("row");
      writeJobsViewMode("kanban");
      expect(readJobsViewMode()).toBe("kanban");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
