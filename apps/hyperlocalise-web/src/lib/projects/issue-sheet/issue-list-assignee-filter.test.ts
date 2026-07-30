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
  issueMatchesAssigneeListQuery,
  parseIssueListFilterQueryFromApiQuery,
} from "./issue-list-assignee-filter";

const actorUserId = "user_actor";

describe("issueMatchesAssigneeListQuery", () => {
  it("requires the current user for my_work without an explicit assignee filter", () => {
    expect(
      issueMatchesAssigneeListQuery({
        assigneeUserId: actorUserId,
        actorUserId,
        query: { view: "my_work" },
      }),
    ).toBe(true);
    expect(
      issueMatchesAssigneeListQuery({
        assigneeUserId: "user_other",
        actorUserId,
        query: { view: "my_work" },
      }),
    ).toBe(false);
  });

  it("requires no assignee for qa_triage without an explicit assignee filter", () => {
    expect(
      issueMatchesAssigneeListQuery({
        assigneeUserId: null,
        actorUserId,
        query: { view: "qa_triage" },
      }),
    ).toBe(true);
    expect(
      issueMatchesAssigneeListQuery({
        assigneeUserId: actorUserId,
        actorUserId,
        query: { view: "qa_triage" },
      }),
    ).toBe(false);
  });

  it("honors explicit assignee filters", () => {
    expect(
      issueMatchesAssigneeListQuery({
        assigneeUserId: actorUserId,
        actorUserId,
        query: { assignee: "me" },
      }),
    ).toBe(true);
    expect(
      issueMatchesAssigneeListQuery({
        assigneeUserId: null,
        actorUserId,
        query: { assignee: "unassigned" },
      }),
    ).toBe(true);
    expect(
      issueMatchesAssigneeListQuery({
        assigneeUserId: actorUserId,
        actorUserId,
        query: { assignee: "unassigned" },
      }),
    ).toBe(false);
  });
});

describe("parseIssueListFilterQueryFromApiQuery", () => {
  it("maps api query records into filter query objects", () => {
    expect(
      parseIssueListFilterQueryFromApiQuery({
        view: "my_work",
        assignee: "me",
        sort: "updated_at",
        sortDir: "desc",
        limit: "50",
        offset: "0",
      }),
    ).toEqual({
      view: "my_work",
      assignee: "me",
      sort: "updated_at",
      sortDir: "desc",
      status: undefined,
      issueType: undefined,
      priority: undefined,
      locale: undefined,
      projectId: undefined,
      search: undefined,
    });
  });
});
