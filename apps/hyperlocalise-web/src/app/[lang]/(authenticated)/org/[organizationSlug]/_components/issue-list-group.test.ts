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

import { groupIssuesByStatus } from "./issue-list-group";

describe("groupIssuesByStatus", () => {
  it("groups issues in status order and hides empty groups", () => {
    const groups = groupIssuesByStatus(
      [
        { id: "1", status: "resolved" },
        { id: "2", status: "open" },
        { id: "3", status: "in_progress" },
        { id: "4", status: "open" },
      ],
      {
        summary: { open: 2, inProgress: 1, resolved: 1, wontFix: 0 },
      },
    );

    expect(groups.map((group) => group.status)).toEqual(["open", "in_progress", "resolved"]);
    expect(groups[0]?.issues.map((issue) => issue.id)).toEqual(["2", "4"]);
    expect(groups[0]?.count).toBe(2);
  });

  it("keeps a single active status group even when empty", () => {
    const groups = groupIssuesByStatus([], {
      activeStatus: "open",
      summary: { open: 0, inProgress: 0, resolved: 0, wontFix: 0 },
    });

    expect(groups).toEqual([{ status: "open", issues: [], count: 0 }]);
  });
});
