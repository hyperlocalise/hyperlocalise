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
  readIntercomPushSourcePaths,
  selectIntercomPushMappings,
} from "./push-intercom-translations";

describe("readIntercomPushSourcePaths", () => {
  it("returns undefined when the snapshot omits sourcePaths", () => {
    expect(readIntercomPushSourcePaths({ operation: "push_approved" })).toBeUndefined();
    expect(readIntercomPushSourcePaths(null)).toBeUndefined();
  });

  it("keeps only non-empty string paths", () => {
    expect(
      readIntercomPushSourcePaths({
        operation: "push_approved",
        sourcePaths: ["intercom/help/a.md", "", 12, "intercom/help/b.md"],
      }),
    ).toEqual(["intercom/help/a.md", "intercom/help/b.md"]);
  });
});

describe("selectIntercomPushMappings", () => {
  const mappings = [
    { sourcePath: "intercom/help/a.md", articleId: "1" },
    { sourcePath: "intercom/help/b.md", articleId: "2" },
    { sourcePath: "intercom/help/c.md", articleId: "3" },
  ];

  it("returns every mapping when sourcePaths are omitted", () => {
    expect(selectIntercomPushMappings(mappings)).toEqual(mappings);
  });

  it("keeps only selected paths and ignores unknown paths", () => {
    expect(
      selectIntercomPushMappings(mappings, ["intercom/help/c.md", "intercom/help/missing.md"]),
    ).toEqual([{ sourcePath: "intercom/help/c.md", articleId: "3" }]);
  });
});
