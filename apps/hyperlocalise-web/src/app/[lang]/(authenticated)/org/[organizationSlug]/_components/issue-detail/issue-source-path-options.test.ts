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

import { buildIssueSourcePathOptions, filenameFromSourcePath } from "./issue-source-path-options";

describe("issue-source-path-options", () => {
  it("uses the last path segment as the filename", () => {
    expect(filenameFromSourcePath("messages/home.json")).toBe("home.json");
    expect(filenameFromSourcePath("home.json")).toBe("home.json");
  });

  it("dedupes files, sorts by path, and keeps a missing current path", () => {
    expect(
      buildIssueSourcePathOptions(
        [
          { sourcePath: "messages/checkout.json", filename: "checkout.json" },
          { sourcePath: "messages/home.json" },
          { sourcePath: "messages/home.json", filename: "home.json" },
          { sourcePath: "  " },
        ],
        "legacy/old.json",
      ),
    ).toEqual([
      { sourcePath: "legacy/old.json", filename: "old.json" },
      { sourcePath: "messages/checkout.json", filename: "checkout.json" },
      { sourcePath: "messages/home.json", filename: "home.json" },
    ]);
  });
});
