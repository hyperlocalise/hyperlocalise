/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import {
  canOpenNativeJobCat,
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
      canSyncProviderJobs: false,
    });
  });

  it("returns read-only capabilities for synced external projects", () => {
    expect(
      getProjectWorkspaceCapabilities({
        projectId: "project_abc123",
        source: "external_tms",
      }),
    ).toEqual({
      source: "external_tms",
      isProviderProject: false,
      canUploadFiles: false,
      canEditProjectSettings: false,
      canDeleteProject: false,
      canSyncProviderJobs: false,
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

describe("canOpenNativeJobCat", () => {
  it("allows native file translation jobs with a source file id", () => {
    expect(
      canOpenNativeJobCat({
        id: "job_native",
        kind: "translation",
        type: "file",
        externalProviderKind: null,
        inputPayload: {
          sourceFileId: "file_home_json",
          targetLocales: ["fr-FR"],
        },
      }),
    ).toBe(true);
  });

  it("rejects provider jobs and non-file translation jobs", () => {
    expect(
      canOpenNativeJobCat({
        id: "ext:crowdin:project-1:job-1",
        kind: "translation",
        type: "file",
        externalProviderKind: "crowdin",
        inputPayload: { sourceFileId: "locales/en.json" },
      }),
    ).toBe(false);
    expect(
      canOpenNativeJobCat({
        id: "job_native",
        kind: "translation",
        type: "string",
        externalProviderKind: null,
        inputPayload: { sourceFileId: "file_home_json" },
      }),
    ).toBe(false);
  });
});
