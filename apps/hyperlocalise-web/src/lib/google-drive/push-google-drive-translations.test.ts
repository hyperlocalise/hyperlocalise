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

import {
  readGoogleDrivePushSourcePaths,
  selectGoogleDrivePushMappings,
} from "./push-google-drive-translations";

describe("readGoogleDrivePushSourcePaths", () => {
  it("returns undefined when the snapshot omits sourcePaths", () => {
    expect(readGoogleDrivePushSourcePaths({ operation: "push_approved" })).toBeUndefined();
    expect(readGoogleDrivePushSourcePaths(null)).toBeUndefined();
  });

  it("keeps non-empty string paths", () => {
    expect(
      readGoogleDrivePushSourcePaths({
        sourcePaths: [
          "google-drive/folder/overview.docx",
          "",
          12,
          "google-drive/folder/kickoff.pptx",
        ],
      }),
    ).toEqual(["google-drive/folder/overview.docx", "google-drive/folder/kickoff.pptx"]);
  });
});

describe("selectGoogleDrivePushMappings", () => {
  it("returns every mapping when sourcePaths are omitted", () => {
    const mappings = [
      { sourcePath: "google-drive/folder/overview.docx" },
      { sourcePath: "google-drive/folder/kickoff.pptx" },
    ];
    expect(selectGoogleDrivePushMappings(mappings)).toEqual(mappings);
  });

  it("keeps only the listed paths", () => {
    expect(
      selectGoogleDrivePushMappings(
        [
          { sourcePath: "google-drive/folder/overview.docx" },
          { sourcePath: "google-drive/folder/kickoff.pptx" },
        ],
        ["google-drive/folder/overview.docx"],
      ),
    ).toEqual([{ sourcePath: "google-drive/folder/overview.docx" }]);
  });
});
