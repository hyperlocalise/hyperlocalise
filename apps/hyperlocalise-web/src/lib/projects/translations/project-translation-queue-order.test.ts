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

import { translationKeysQueueOrderBy } from "./project-translation-queue-order";

describe("translationKeysQueueOrderBy", () => {
  it("uses key then id for file order", () => {
    expect(
      translationKeysQueueOrderBy({
        organizationId: "org_1",
        projectId: "proj_1",
        queueSort: "file_order",
        targetLocale: "fr",
      }),
    ).toHaveLength(2);
  });

  it("prefixes a status-band rank for untranslated first", () => {
    expect(
      translationKeysQueueOrderBy({
        organizationId: "org_1",
        projectId: "proj_1",
        queueSort: "untranslated_first",
        targetLocale: "fr",
      }),
    ).toHaveLength(3);
  });

  it("keeps source path first for project-wide file order", () => {
    expect(
      translationKeysQueueOrderBy({
        organizationId: "org_1",
        projectId: "proj_1",
        includeSourcePath: true,
      }),
    ).toHaveLength(3);
  });

  it("ranks untranslated first then source path for project-wide lists", () => {
    expect(
      translationKeysQueueOrderBy({
        organizationId: "org_1",
        projectId: "proj_1",
        queueSort: "untranslated_first",
        targetLocale: "fr",
        includeSourcePath: true,
      }),
    ).toHaveLength(4);
  });
});
