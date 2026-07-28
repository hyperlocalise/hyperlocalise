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
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import {
  canMutateComment,
  IssueSheetCommentService,
} from "@/lib/projects/issue-sheet/issue-sheet-comment-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

const authFixture = createAuthTestFixture();
const commentService = new IssueSheetCommentService();
const issueSheetService = new IssueSheetService();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function createProjectForIdentity() {
  const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();
  const team = await ensureDefaultWorkspaceTeam(organization.id);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: "Comment Service Project",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  return { identity, organization, user, project };
}

describe("canMutateComment", () => {
  it("allows authors and organization admins only", () => {
    expect(
      canMutateComment({
        authorUserId: "user-1",
        actorUserId: "user-1",
        role: "translator",
      }),
    ).toBe(true);
    expect(
      canMutateComment({
        authorUserId: "user-1",
        actorUserId: "user-2",
        role: "admin",
      }),
    ).toBe(true);
    expect(
      canMutateComment({
        authorUserId: "user-1",
        actorUserId: "user-2",
        role: "translator",
      }),
    ).toBe(false);
    expect(
      canMutateComment({
        authorUserId: "user-1",
        actorUserId: "user-2",
        role: "localization_manager",
      }),
    ).toBe(false);
  });
});

describe("IssueSheetCommentService", () => {
  it("computes path and depth for root and nested replies", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const issue = await issueSheetService.createIssue({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: { title: "Threaded issue", issueType: "general_question" },
    });

    const root = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "Root" },
    });
    expect(root.ok).toBe(true);
    if (!root.ok) {
      return;
    }
    expect(root.value.path).toBe(root.value.id);
    expect(root.value.depth).toBe(0);

    const reply = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "Reply", parentId: root.value.id },
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) {
      return;
    }
    expect(reply.value.depth).toBe(1);
    expect(reply.value.path).toBe(`${root.value.id}.${reply.value.id}`);

    const nested = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "Nested", parentId: reply.value.id },
    });
    expect(nested.ok).toBe(true);
    if (!nested.ok) {
      return;
    }
    expect(nested.value.depth).toBe(2);
    expect(nested.value.path).toBe(`${root.value.id}.${reply.value.id}.${nested.value.id}`);

    const invalidParent = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "Missing parent", parentId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(invalidParent).toEqual({ ok: false, error: { code: "parent_not_found" } });
  });

  it("rejects mentions of non-members and missing issues", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const issue = await issueSheetService.createIssue({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: { title: "Mention issue", issueType: "general_question" },
    });

    const invalidUser = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: {
        body: "Hello @[Ghost](mention:user:00000000-0000-4000-8000-000000000000)",
        mentionedUserIds: ["00000000-0000-4000-8000-000000000000"],
      },
    });
    expect(invalidUser).toEqual({ ok: false, error: { code: "invalid_mentioned_users" } });

    const invalidIssue = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: {
        body: "See @[ISSUE](mention:issue:00000000-0000-4000-8000-000000000001)",
        mentionedIssueIds: ["00000000-0000-4000-8000-000000000001"],
      },
    });
    expect(invalidIssue).toEqual({ ok: false, error: { code: "invalid_mentioned_issues" } });
  });

  it("lists in thread order and supports created_at cursor pagination", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const issue = await issueSheetService.createIssue({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: { title: "List issue", issueType: "general_question" },
    });

    const first = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "A" },
    });
    const second = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "B" },
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    const reply = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "A-reply", parentId: first.value.id },
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) {
      return;
    }

    const threadList = await commentService.list({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      query: { limit: 50, offset: 0, sort: "thread" },
    });
    expect(threadList.ok).toBe(true);
    if (!threadList.ok) {
      return;
    }
    expect(threadList.value.issueComments.map((comment) => comment.body)).toEqual([
      "A",
      "A-reply",
      "B",
    ]);

    const pageOne = await commentService.list({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      query: { limit: 2, offset: 0, sort: "created_at" },
    });
    expect(pageOne.ok).toBe(true);
    if (!pageOne.ok) {
      return;
    }
    expect(pageOne.value.issueComments).toHaveLength(2);

    const cursorPage = await commentService.list({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      query: {
        limit: 2,
        offset: 0,
        sort: "thread",
        cursor: first.value.path,
      },
    });
    expect(cursorPage.ok).toBe(true);
    if (!cursorPage.ok) {
      return;
    }
    expect(cursorPage.value.issueComments.map((comment) => comment.body)).toEqual(["A-reply", "B"]);
  });

  it("cascades reply deletion when deleting a parent comment", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = globalThis.__testApiAuthContext!.organization.localOrganizationId;

    const issue = await issueSheetService.createIssue({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: { title: "Cascade issue", issueType: "general_question" },
    });

    const root = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "Parent" },
    });
    expect(root.ok).toBe(true);
    if (!root.ok) {
      return;
    }

    const child = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      body: { body: "Child", parentId: root.value.id },
    });
    expect(child.ok).toBe(true);
    if (!child.ok) {
      return;
    }

    const deleted = await commentService.delete({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      commentId: root.value.id,
      actorUserId: user.id,
      role: "admin",
    });
    expect(deleted).toEqual({ ok: true });

    const remaining = await commentService.list({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      query: { limit: 50, offset: 0, sort: "thread" },
    });
    expect(remaining.ok).toBe(true);
    if (!remaining.ok) {
      return;
    }
    expect(remaining.value.total).toBe(0);
  });
});
