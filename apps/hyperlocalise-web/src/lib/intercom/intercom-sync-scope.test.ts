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
  buildIntercomImportScopeKey,
  encodeIntercomImportScopeCursor,
  intercomArticleInConfiguredCollections,
  intercomMappingMatchesTarget,
  readIntercomImportScopeCursor,
} from "./intercom-sync-scope";

describe("intercom sync scope", () => {
  it("treats collection order as the same import target", () => {
    expect(
      buildIntercomImportScopeKey({
        projectId: "project-1",
        helpCenterId: "hc-1",
        collectionIds: ["52", "38"],
      }),
    ).toBe(
      buildIntercomImportScopeKey({
        projectId: "project-1",
        helpCenterId: "hc-1",
        collectionIds: ["38", "52"],
      }),
    );
  });

  it("round-trips the stored import scope cursor", () => {
    const scopeKey = buildIntercomImportScopeKey({
      projectId: "project-1",
      helpCenterId: "hc-1",
      collectionIds: ["38"],
    });

    expect(readIntercomImportScopeCursor(encodeIntercomImportScopeCursor(scopeKey))).toBe(scopeKey);
    expect(readIntercomImportScopeCursor("next-page-token")).toBeNull();
  });

  it("keeps mappings only for the current project and Help Center", () => {
    expect(
      intercomMappingMatchesTarget(
        { projectId: "project-1", helpCenterId: "hc-1" },
        { projectId: "project-1", helpCenterId: "hc-1" },
      ),
    ).toBe(true);
    expect(
      intercomMappingMatchesTarget(
        { projectId: "project-1", helpCenterId: "hc-1" },
        { projectId: "project-2", helpCenterId: "hc-1" },
      ),
    ).toBe(false);
  });

  it("treats an empty collection filter as the whole Help Center", () => {
    expect(intercomArticleInConfiguredCollections([38], [])).toBe(true);
    expect(intercomArticleInConfiguredCollections([38], ["52"])).toBe(false);
    expect(intercomArticleInConfiguredCollections([52], ["52"])).toBe(true);
  });
});
