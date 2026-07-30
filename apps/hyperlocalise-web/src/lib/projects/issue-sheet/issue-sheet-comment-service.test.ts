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
import { eq } from "drizzle-orm";

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

async function createProjectForIdentity(input?: {
  identity?: ReturnType<typeof authFixture.createWorkosIdentity>;
  teamId?: string;
  name?: string;
}) {
  const { identity, organization, user } = await authFixture.createLocalWorkosIdentity(
    input?.identity,
  );
  const team = input?.teamId
    ? { id: input.teamId }
    : await ensureDefaultWorkspaceTeam(organization.id);
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: user.id,
      name: input?.name ?? "Comment Service Project",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  return { identity, organization, user, project, team };
}

function actorAuth() {
  return globalThis.__testApiAuthContext!;
}

function assertOrderPreservingPath(path: string, id: string, parentPath: string | null = null) {
  const segmentPattern = new RegExp(`^\\d{20}_${id.replaceAll("-", "\\-")}$`);
  if (parentPath) {
    expect(path.startsWith(`${parentPath}.`)).toBe(true);
    expect(segmentPattern.test(path.slice(parentPath.length + 1))).toBe(true);
    return;
  }
  expect(segmentPattern.test(path)).toBe(true);
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
  it("computes order-preserving path and depth for root and nested replies", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = actorAuth().organization.localOrganizationId;
    const auth = actorAuth();

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
      auth,
      body: { body: "Root" },
    });
    expect(root.ok).toBe(true);
    if (!root.ok) {
      return;
    }
    assertOrderPreservingPath(root.value.path, root.value.id);
    expect(root.value.depth).toBe(0);

    const reply = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "Reply", parentId: root.value.id },
    });
    expect(reply.ok).toBe(true);
    if (!reply.ok) {
      return;
    }
    expect(reply.value.depth).toBe(1);
    assertOrderPreservingPath(reply.value.path, reply.value.id, root.value.path);

    const nested = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "Nested", parentId: reply.value.id },
    });
    expect(nested.ok).toBe(true);
    if (!nested.ok) {
      return;
    }
    expect(nested.value.depth).toBe(2);
    assertOrderPreservingPath(nested.value.path, nested.value.id, reply.value.path);

    const invalidParent = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "Missing parent", parentId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(invalidParent).toEqual({ ok: false, error: { code: "parent_not_found" } });
  });

  it("orders sibling roots and replies by creation time via path", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = actorAuth().organization.localOrganizationId;
    const auth = actorAuth();

    const issue = await issueSheetService.createIssue({
      organizationId,
      projectId: project.id,
      actorUserId: user.id,
      body: { title: "Sibling order", issueType: "general_question" },
    });

    const first = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "First root" },
    });
    const second = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "Second root" },
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    const earlyReply = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "Early reply", parentId: first.value.id },
    });
    const lateReply = await commentService.create({
      organizationId,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: user.id,
      role: "admin",
      auth,
      body: { body: "Late reply", parentId: first.value.id },
    });
    expect(earlyReply.ok && lateReply.ok).toBe(true);
    if (!earlyReply.ok || !lateReply.ok) {
      return;
    }

    expect(first.value.path < second.value.path).toBe(true);
    expect(earlyReply.value.path < lateReply.value.path).toBe(true);
  });

  it("rejects mentions of non-members and missing issues", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = actorAuth().organization.localOrganizationId;
    const auth = actorAuth();

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
      auth,
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
      auth,
      body: {
        body: "See @[ISSUE](mention:issue:00000000-0000-4000-8000-000000000001:other_project)",
        mentionedIssueIds: ["00000000-0000-4000-8000-000000000001"],
      },
    });
    expect(invalidIssue).toEqual({ ok: false, error: { code: "invalid_mentioned_issues" } });
  });

  it("rejects mentions of issues in inaccessible projects", async () => {
    const adminIdentity = authFixture.createWorkosIdentityWithRole("admin");
    const { organization, user: adminUser } =
      await authFixture.createLocalWorkosIdentity(adminIdentity);

    const memberIdentity = authFixture.createWorkosIdentityForOrganization(
      adminIdentity.organization,
      "member",
    );
    const { user: memberUser } = await authFixture.createLocalWorkosIdentity(memberIdentity);

    const accessibleSuffix = randomUUID().slice(0, 8);
    const inaccessibleSuffix = randomUUID().slice(0, 8);
    const [accessibleTeam] = await db
      .insert(schema.teams)
      .values({
        organizationId: organization.id,
        slug: `accessible-${accessibleSuffix}`,
        name: `Accessible ${accessibleSuffix}`,
      })
      .returning();
    const [inaccessibleTeam] = await db
      .insert(schema.teams)
      .values({
        organizationId: organization.id,
        slug: `inaccessible-${inaccessibleSuffix}`,
        name: `Inaccessible ${inaccessibleSuffix}`,
      })
      .returning();

    await db.insert(schema.teamMemberships).values({
      teamId: accessibleTeam!.id,
      userId: memberUser.id,
      role: "member",
    });

    const [accessibleProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: accessibleTeam!.id,
        createdByUserId: adminUser.id,
        name: "Accessible Project",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();
    const [inaccessibleProject] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: inaccessibleTeam!.id,
        createdByUserId: adminUser.id,
        name: "Inaccessible Project",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["de-DE"],
      })
      .returning();

    const accessibleIssue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: accessibleProject!.id,
      actorUserId: adminUser.id,
      body: { title: "Accessible issue", issueType: "general_question" },
    });
    const inaccessibleIssue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: inaccessibleProject!.id,
      actorUserId: adminUser.id,
      body: { title: "Hidden issue", issueType: "general_question" },
    });

    await authFixture.authHeadersFor(memberIdentity);
    const memberAuth = actorAuth();

    const rejected = await commentService.create({
      organizationId: organization.id,
      projectId: accessibleProject!.id,
      issueId: accessibleIssue.id,
      actorUserId: memberUser.id,
      role: "member",
      auth: memberAuth,
      body: {
        body: `See @[Hidden](mention:issue:${inaccessibleIssue.id}:${inaccessibleProject!.id})`,
        mentionedIssueIds: [inaccessibleIssue.id],
      },
    });
    expect(rejected).toEqual({ ok: false, error: { code: "invalid_mentioned_issues" } });

    const allowed = await commentService.create({
      organizationId: organization.id,
      projectId: accessibleProject!.id,
      issueId: accessibleIssue.id,
      actorUserId: memberUser.id,
      role: "member",
      auth: memberAuth,
      body: {
        body: "No mentions",
      },
    });
    expect(allowed.ok).toBe(true);
  });

  it("cascades reply deletion when deleting a parent comment", async () => {
    const { identity, project, user } = await createProjectForIdentity();
    await authFixture.authHeadersFor(identity);
    const organizationId = actorAuth().organization.localOrganizationId;
    const auth = actorAuth();

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
      auth,
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
      auth,
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

    const remaining = await db
      .select({ id: schema.issueSheetComments.id })
      .from(schema.issueSheetComments)
      .where(eq(schema.issueSheetComments.issueId, issue.id));
    expect(remaining).toHaveLength(0);
  });
});
