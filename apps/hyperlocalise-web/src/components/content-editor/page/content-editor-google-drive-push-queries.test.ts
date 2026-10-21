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

import { isGoogleDriveSourcePath } from "@/lib/google-drive/constants";

import {
  contentEditorGoogleDriveIngestQueryKey,
  defaultSelectedGoogleDrivePushSourcePaths,
  fetchContentEditorGoogleDriveIngestCandidates,
  googleDriveFileTitleFromSourcePath,
  type ContentEditorGoogleDrivePushFile,
} from "./content-editor-google-drive-push-queries";

const files: ContentEditorGoogleDrivePushFile[] = [
  {
    driveFileId: "1",
    sourcePath: "google-drive/Campaigns/briefs/overview.docx",
    status: "active",
    eligibleLocaleCount: 1,
    targetLocaleCount: 2,
    eligibleLocales: ["vi-VN"],
    lastPushedAt: null,
    lastError: null,
  },
  {
    driveFileId: "2",
    sourcePath: "google-drive/Campaigns/decks/kickoff.pptx",
    status: "active",
    eligibleLocaleCount: 0,
    targetLocaleCount: 2,
    eligibleLocales: [],
    lastPushedAt: null,
    lastError: null,
  },
];

describe("defaultSelectedGoogleDrivePushSourcePaths", () => {
  it("checks the open file when it is mapped", () => {
    expect(
      defaultSelectedGoogleDrivePushSourcePaths(
        files,
        "google-drive/Campaigns/briefs/overview.docx",
      ),
    ).toEqual(["google-drive/Campaigns/briefs/overview.docx"]);
  });

  it("selects nothing when the open path is missing", () => {
    expect(defaultSelectedGoogleDrivePushSourcePaths(files, null)).toEqual([]);
    expect(
      defaultSelectedGoogleDrivePushSourcePaths(files, "google-drive/Campaigns/missing.docx"),
    ).toEqual([]);
  });
});

describe("googleDriveFileTitleFromSourcePath", () => {
  it("uses the filename", () => {
    expect(googleDriveFileTitleFromSourcePath("google-drive/Campaigns/briefs/overview.docx")).toBe(
      "overview.docx",
    );
  });
});

describe("fetchContentEditorGoogleDriveIngestCandidates", () => {
  it("hides ingest unless a Drive file is open", async () => {
    expect(isGoogleDriveSourcePath("google-drive/Campaigns/briefs/overview.docx")).toBe(true);
    expect(isGoogleDriveSourcePath("intercom/help/open.md")).toBe(false);
    await expect(
      fetchContentEditorGoogleDriveIngestCandidates({
        organizationSlug: "acme",
        projectId: "proj",
        sourcePath: null,
      }),
    ).resolves.toEqual([]);
    await expect(
      fetchContentEditorGoogleDriveIngestCandidates({
        organizationSlug: "acme",
        projectId: "proj",
        sourcePath: "intercom/help/open.md",
      }),
    ).resolves.toEqual([]);
  });

  it("scopes the ingest query to the open file", () => {
    expect(contentEditorGoogleDriveIngestQueryKey("acme", "proj")).toEqual([
      "content-editor-google-drive-ingest",
      "acme",
      "proj",
    ]);
    expect(
      contentEditorGoogleDriveIngestQueryKey(
        "acme",
        "proj",
        "google-drive/Campaigns/briefs/overview.docx",
      ),
    ).toEqual([
      "content-editor-google-drive-ingest",
      "acme",
      "proj",
      "google-drive/Campaigns/briefs/overview.docx",
    ]);
  });
});
