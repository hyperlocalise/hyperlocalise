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

import { selectedMailchimpResourceIds, shouldImportMailchimpResource } from "./import-scope";

describe("shouldImportMailchimpResource", () => {
  it("imports every item when both selections are empty", () => {
    expect(
      shouldImportMailchimpResource({
        resourceId: "campaign-1",
        selectedIds: new Set(),
        selectedOtherIds: new Set(),
      }),
    ).toBe(true);
  });

  it("imports only selected campaigns when templates are selected", () => {
    const campaigns = selectedMailchimpResourceIds([]);
    const templates = selectedMailchimpResourceIds(["10000141"]);
    expect(
      shouldImportMailchimpResource({
        resourceId: "campaign-1",
        selectedIds: campaigns,
        selectedOtherIds: templates,
      }),
    ).toBe(false);
    expect(
      shouldImportMailchimpResource({
        resourceId: "10000141",
        selectedIds: templates,
        selectedOtherIds: campaigns,
      }),
    ).toBe(true);
    expect(
      shouldImportMailchimpResource({
        resourceId: "10000142",
        selectedIds: templates,
        selectedOtherIds: campaigns,
      }),
    ).toBe(false);
  });

  it("imports only selected templates when campaigns are selected", () => {
    const campaigns = selectedMailchimpResourceIds(["campaign-1"]);
    const templates = selectedMailchimpResourceIds([]);
    expect(
      shouldImportMailchimpResource({
        resourceId: "campaign-1",
        selectedIds: campaigns,
        selectedOtherIds: templates,
      }),
    ).toBe(true);
    expect(
      shouldImportMailchimpResource({
        resourceId: "10000141",
        selectedIds: templates,
        selectedOtherIds: campaigns,
      }),
    ).toBe(false);
  });
});
