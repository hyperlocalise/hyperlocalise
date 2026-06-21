import { describe, expect, it } from "vite-plus/test";

import {
  canOpenProviderJobCat,
  getProjectWorkspaceCapabilities,
} from "./workspace-resource-capabilities";

describe("getProjectWorkspaceCapabilities", () => {
  it("returns native capabilities for workspace projects", () => {
    expect(getProjectWorkspaceCapabilities({ projectId: "project_abc123" })).toEqual({
      source: "native",
      isProviderProject: false,
      canUploadFiles: true,
      canEditProjectSettings: true,
      canDeleteProject: true,
      canSyncProviderJobs: false,
    });
  });

  it("returns provider capabilities for encoded project ids", () => {
    expect(getProjectWorkspaceCapabilities({ projectId: "ext:crowdin:902807" })).toEqual({
      source: "external_tms",
      isProviderProject: true,
      canUploadFiles: false,
      canEditProjectSettings: false,
      canDeleteProject: false,
      canSyncProviderJobs: true,
    });
  });
});

describe("canOpenProviderJobCat", () => {
  it("allows provider translation and review jobs only", () => {
    expect(
      canOpenProviderJobCat({
        id: "ext:crowdin:project-1:job-1",
        kind: "translation",
        externalProviderKind: "crowdin",
      }),
    ).toBe(true);
    expect(
      canOpenProviderJobCat({
        id: "ext:crowdin:project-1:job-1",
        kind: "review",
        externalProviderKind: "crowdin",
      }),
    ).toBe(true);
    expect(
      canOpenProviderJobCat({
        id: "ext:crowdin:project-1:job-1",
        kind: "sync",
        externalProviderKind: "crowdin",
      }),
    ).toBe(false);
    expect(
      canOpenProviderJobCat({
        id: "job_native",
        kind: "translation",
        externalProviderKind: null,
      }),
    ).toBe(false);
  });
});
