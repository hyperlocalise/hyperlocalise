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

import { selectInScopeIterableMappings } from "./discover-scope";

describe("selectInScopeIterableMappings", () => {
  const mappings = [
    { sourceId: "1", resourceKind: "email" as const },
    { sourceId: "2", resourceKind: "in_app" as const },
    { sourceId: "welcome", resourceKind: "snippet" as const },
  ];

  it("returns all mappings when filters are empty", () => {
    expect(selectInScopeIterableMappings(mappings, {})).toEqual(mappings);
  });

  it("filters templates and snippets independently", () => {
    expect(
      selectInScopeIterableMappings(mappings, {
        templateIds: ["2"],
        snippetIds: ["welcome"],
      }).map((row) => row.sourceId),
    ).toEqual(["2", "welcome"]);
  });
});
