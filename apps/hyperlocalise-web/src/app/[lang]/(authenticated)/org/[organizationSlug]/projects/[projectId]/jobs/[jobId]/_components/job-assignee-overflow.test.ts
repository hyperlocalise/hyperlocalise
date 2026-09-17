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

import { getAssigneeOverflowParts } from "./job-assignee-overflow";

describe("getAssigneeOverflowParts", () => {
  it("returns an empty summary when no names are assigned", () => {
    expect(getAssigneeOverflowParts([])).toEqual({
      firstLabel: null,
      remainingCount: 0,
      fullLabel: "",
    });
  });

  it("keeps a single name visible without an overflow count", () => {
    expect(getAssigneeOverflowParts(["Ada"])).toEqual({
      firstLabel: "Ada",
      remainingCount: 0,
      fullLabel: "Ada",
    });
  });

  it("shows the first name and how many assignees are hidden", () => {
    expect(getAssigneeOverflowParts(["Ada", "Beau", "Cora", "Drew", "Eden"])).toEqual({
      firstLabel: "Ada",
      remainingCount: 4,
      fullLabel: "Ada, Beau, Cora, Drew, Eden",
    });
  });

  it("ignores blank labels when counting overflow", () => {
    expect(getAssigneeOverflowParts(["", "Beau", ""])).toEqual({
      firstLabel: "Beau",
      remainingCount: 0,
      fullLabel: "Beau",
    });
  });
});
