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
import { eq, inArray, isNull } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";

import * as schema from "@/lib/database/schema";

import {
  buildIssueListFilterConditions,
  buildIssueListOrderBy,
  issueListNeedsCountPriorityJoin,
  issueListNeedsPriorityJoin,
} from "./issue-list-query";

const actorUserId = "user_actor";

describe("buildIssueListFilterConditions", () => {
  it("filters by translationKeyId for CAT linked-issue lists", () => {
    const translationKeyId = "11111111-1111-4111-8111-111111111111";
    expect(
      buildIssueListFilterConditions({
        actorUserId,
        query: { translationKeyId, status: "all" },
      }),
    ).toEqual([eq(schema.issueSheetIssues.translationKeyId, translationKeyId)]);
  });

  it("applies view defaults and lets explicit filters override them", () => {
    expect(
      buildIssueListFilterConditions({
        actorUserId,
        query: { view: "my_work" },
      }),
    ).toEqual([
      eq(schema.issueSheetIssues.assigneeUserId, actorUserId),
      inArray(schema.issueSheetIssues.status, ["open", "in_progress"]),
    ]);

    expect(
      buildIssueListFilterConditions({
        actorUserId,
        query: { view: "qa_triage", status: "resolved", issueType: "glossary_violation" },
      }),
    ).toEqual([
      isNull(schema.issueSheetIssues.assigneeUserId),
      eq(schema.issueSheetIssues.status, "resolved"),
      eq(schema.issueSheetIssues.issueType, "glossary_violation"),
    ]);

    expect(
      buildIssueListFilterConditions({
        actorUserId,
        query: { view: "source_context" },
      }),
    ).toEqual([
      inArray(schema.issueSheetIssues.issueType, [
        "source_mistake",
        "context_request",
        "general_question",
      ]),
      inArray(schema.issueSheetIssues.status, ["open", "in_progress"]),
    ]);

    expect(
      buildIssueListFilterConditions({
        actorUserId,
        query: { view: "all_open" },
      }),
    ).toEqual([inArray(schema.issueSheetIssues.status, ["open", "in_progress"])]);
  });

  it("combines project, locale, and assignee filters with translationKeyId", () => {
    const projectId = "project_docs";
    const translationKeyId = "22222222-2222-4222-8222-222222222222";
    expect(
      buildIssueListFilterConditions({
        actorUserId,
        query: {
          projectId,
          locale: "fr-FR",
          assignee: "unassigned",
          translationKeyId,
          status: "all",
        },
      }),
    ).toEqual([
      eq(schema.issueSheetIssues.targetLocale, "fr-FR"),
      isNull(schema.issueSheetIssues.assigneeUserId),
      eq(schema.issueSheetIssues.projectId, projectId),
      eq(schema.issueSheetIssues.translationKeyId, translationKeyId),
    ]);
  });
});

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
