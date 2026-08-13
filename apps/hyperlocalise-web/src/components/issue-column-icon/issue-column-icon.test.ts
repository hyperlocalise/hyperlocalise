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
import { Tag01Icon } from "@hugeicons/core-free-icons";

import { resolveIssueSheetColumnIcon } from "./issue-column-icon";

describe("resolveIssueSheetColumnIcon", () => {
  it("returns the tag icon for null and unknown ids", () => {
    expect(resolveIssueSheetColumnIcon(null)).toBe(Tag01Icon);
    expect(resolveIssueSheetColumnIcon("not-an-icon")).toBe(Tag01Icon);
  });

  it("returns the mapped icon for a known id", () => {
    const calendar = resolveIssueSheetColumnIcon("calendar");
    expect(calendar).not.toBe(Tag01Icon);
    expect(resolveIssueSheetColumnIcon("calendar")).toBe(calendar);
  });
});
