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
  isBrazeListItemArchived,
  selectedBrazeResourceIds,
  shouldImportBrazeDraftVariation,
  shouldListAllBrazeResources,
} from "./import-braze-campaigns";

describe("braze campaign import helpers", () => {
  it("lists the whole account only when no IDs are selected", () => {
    expect(shouldListAllBrazeResources([])).toBe(true);
    expect(shouldListAllBrazeResources(["  "])).toBe(true);
    expect(shouldListAllBrazeResources(["camp-1"])).toBe(false);
    expect(selectedBrazeResourceIds([" camp-1 ", "", "camp-1"])).toEqual(["camp-1"]);
  });

  it("skips archived list items", () => {
    expect(isBrazeListItemArchived({ archived: true })).toBe(true);
    expect(isBrazeListItemArchived({ is_archived: true })).toBe(true);
    expect(isBrazeListItemArchived({ archived: false, is_archived: false })).toBe(false);
  });

  it("imports drafts and post-launch drafts with a source map", () => {
    expect(
      shouldImportBrazeDraftVariation({
        isDraft: false,
        postLaunchDraft: false,
        sourceMap: { hello: "Hi" },
      }),
    ).toBe(false);
    expect(
      shouldImportBrazeDraftVariation({
        isDraft: true,
        postLaunchDraft: false,
        sourceMap: {},
      }),
    ).toBe(false);
    expect(
      shouldImportBrazeDraftVariation({
        isDraft: false,
        postLaunchDraft: true,
        sourceMap: { hello: "Hi" },
      }),
    ).toBe(true);
    expect(
      shouldImportBrazeDraftVariation({
        isDraft: true,
        postLaunchDraft: false,
        sourceMap: { hello: "Hi" },
      }),
    ).toBe(true);
  });
});
