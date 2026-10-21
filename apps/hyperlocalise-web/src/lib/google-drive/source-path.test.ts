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

import { buildGoogleDriveSourcePath, relativePathFromGoogleDriveSourcePath } from "./source-path";

describe("relativePathFromGoogleDriveSourcePath", () => {
  it("returns nested folders under the connected root", () => {
    const sourcePath = buildGoogleDriveSourcePath({
      rootFolderId: "campaigns-root",
      relativePath: "briefs",
      fileName: "overview.docx",
    });
    expect(relativePathFromGoogleDriveSourcePath(sourcePath, "campaigns-root")).toBe("briefs");
  });

  it("returns empty when the file sits on the connected root", () => {
    const sourcePath = buildGoogleDriveSourcePath({
      rootFolderId: "campaigns-root",
      relativePath: "",
      fileName: "overview.docx",
    });
    expect(relativePathFromGoogleDriveSourcePath(sourcePath, "campaigns-root")).toBe("");
  });

  it("returns empty when the root does not match", () => {
    expect(
      relativePathFromGoogleDriveSourcePath(
        "google-drive/campaigns-root/briefs/overview.docx",
        "other-root",
      ),
    ).toBe("");
  });
});
