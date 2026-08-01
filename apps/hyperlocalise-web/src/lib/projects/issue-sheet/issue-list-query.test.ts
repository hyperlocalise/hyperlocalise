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
  buildIssueListOrderBy,
  issueListNeedsCountPriorityJoin,
  issueListNeedsPriorityJoin,
} from "./issue-list-query";

describe("buildIssueListOrderBy", () => {
  it("defaults to status sorting for the grouped Issues list", () => {
    expect(buildIssueListOrderBy({})).toEqual(buildIssueListOrderBy({ sort: "status" }));
  });

  it("keeps status as the primary key for non-status sorts", () => {
    const statusPrimary = buildIssueListOrderBy({ sort: "status" })[0];

    expect(buildIssueListOrderBy({ sort: "created_at" })[0]).toEqual(statusPrimary);
    expect(buildIssueListOrderBy({ sort: "priority" })[0]).toEqual(statusPrimary);
    expect(buildIssueListOrderBy({ sort: "updated_at" })[0]).toEqual(statusPrimary);
  });

  it("applies within-status updatedAt when sorting by status", () => {
    const statusOrder = buildIssueListOrderBy({ sort: "status" });
    const updatedOrder = buildIssueListOrderBy({ sort: "updated_at" });

    expect(statusOrder).toHaveLength(3);
    expect(statusOrder[1]).toEqual(updatedOrder[1]);
    expect(statusOrder[2]).toEqual(updatedOrder[2]);
  });

  it("honors explicit sort direction on the selected field", () => {
    const ascStatus = buildIssueListOrderBy({ sort: "status", sortDir: "asc" });
    const descStatus = buildIssueListOrderBy({ sort: "status", sortDir: "desc" });
    const ascCreated = buildIssueListOrderBy({ sort: "created_at", sortDir: "asc" });
    const descCreated = buildIssueListOrderBy({ sort: "created_at", sortDir: "desc" });

    expect(ascStatus[0]).not.toEqual(descStatus[0]);
    expect(ascStatus[1]).toEqual(descStatus[1]);
    expect(ascCreated[0]).toEqual(descCreated[0]);
    expect(ascCreated[1]).not.toEqual(descCreated[1]);
  });
});

describe("issue list priority join helpers", () => {
  it("requires a priority join for priority filters or priority sorts", () => {
    expect(issueListNeedsPriorityJoin({})).toBe(false);
    expect(issueListNeedsPriorityJoin({ sort: "updated_at" })).toBe(false);
    expect(issueListNeedsPriorityJoin({ priority: "P0" })).toBe(true);
    expect(issueListNeedsPriorityJoin({ sort: "priority" })).toBe(true);
  });

  it("requires a count-query priority join only when filtering by priority", () => {
    expect(issueListNeedsCountPriorityJoin({})).toBe(false);
    expect(issueListNeedsCountPriorityJoin({ priority: "P1" })).toBe(true);
  });
});
