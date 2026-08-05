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

import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { IssueNotificationService } from "@/lib/projects/issue-sheet/issue-notification-service";
import { IssueSheetCommentService } from "@/lib/projects/issue-sheet/issue-sheet-comment-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

const authFixture = createAuthTestFixture();
const notificationService = new IssueNotificationService();
const issueSheetService = new IssueSheetService();
const commentService = new IssueSheetCommentService();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function createProjectWithAssignee() {
  const actorIdentity = authFixture.createWorkosIdentityWithRole("admin");
  await authFixture.authHeadersFor(actorIdentity);
  const { organization, user: actor } = await authFixture.createLocalWorkosIdentity(actorIdentity);

  const memberIdentity = authFixture.createWorkosIdentityForOrganization(
    actorIdentity.organization,
    "member",
  );
  await authFixture.authHeadersFor(memberIdentity);
  const assigneeUserId = await authFixture.getLocalUserId(memberIdentity.user.workosUserId);

  const team = await ensureDefaultWorkspaceTeam(organization.id);
  await db
    .insert(schema.teamMemberships)
    .values({
      teamId: team.id,
      userId: assigneeUserId,
      role: "member",
    })
    .onConflictDoNothing();

  // Restore actor as the active test auth context for mutation calls.
  await authFixture.authHeadersFor(actorIdentity);

  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: actor.id,
      name: "Notification Project",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  return {
    actor,
    assigneeUserId,
    actorIdentity,
    memberIdentity,
    organization,
    project,
  };
}

describe("IssueNotificationService", () => {
  it("skips the actor and notifies the assignee on assign", async () => {
    const { actor, assigneeUserId, organization, project } = await createProjectWithAssignee();

    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Assign me",
        assigneeUserId,
      },
    });

    const rows = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientUserId: assigneeUserId,
      type: "assigned",
      actorUserId: actor.id,
    });
    expect(rows.every((row) => row.recipientUserId !== actor.id)).toBe(true);
  });

  it("dedupes repeated assignment notifications for the same assignee", async () => {
    const { actor, assigneeUserId, organization, project } = await createProjectWithAssignee();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: { title: "Dedupe assign" },
    });

    await notificationService.notifyAssigned({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      assigneeUserId,
    });
    await notificationService.notifyAssigned({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      assigneeUserId,
    });

    const rows = await db
      .select()
      .from(schema.issueNotifications)
      .where(
        and(
          eq(schema.issueNotifications.issueId, issue.id),
          eq(schema.issueNotifications.recipientUserId, assigneeUserId),
          eq(schema.issueNotifications.type, "assigned"),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.readAt).toBeNull();
  });

  it("sends mention notifications without also sending a comment notification to the same user", async () => {
    const { actor, assigneeUserId, organization, project } = await createProjectWithAssignee();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Comment watchers",
        assigneeUserId,
      },
    });

    await db
      .delete(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    const auth = globalThis.__testApiAuthContext!;
    const created = await commentService.create({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      role: "admin",
      auth,
      body: {
        body: "Hello assignee",
        mentionedUserIds: [assigneeUserId],
      },
    });
    expect(created.ok).toBe(true);

    const rows = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recipientUserId: assigneeUserId,
      type: "mentioned",
    });
  });

  it("notifies implicit watchers on status change and excludes the actor", async () => {
    const { actor, assigneeUserId, organization, project } = await createProjectWithAssignee();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Status watch",
        assigneeUserId,
      },
    });

    await db
      .delete(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    await issueSheetService.updateIssue({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      body: { status: "in_progress" },
    });

    const rows = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    expect(rows.some((row) => row.type === "status_changed")).toBe(true);
    expect(rows.every((row) => row.recipientUserId !== actor.id)).toBe(true);
    expect(rows.some((row) => row.recipientUserId === assigneeUserId)).toBe(true);
  });

  it("resolves implicit watchers from assignee, reporter, and mentions", async () => {
    const { actor, assigneeUserId, organization, project } = await createProjectWithAssignee();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Watchers",
        assigneeUserId,
      },
    });

    const auth = globalThis.__testApiAuthContext!;
    await commentService.create({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      role: "admin",
      auth,
      body: {
        body: "mention assignee again",
        mentionedUserIds: [assigneeUserId],
      },
    });

    const watchers = await notificationService.resolveImplicitWatchers(issue.id);
    expect(watchers.has(actor.id)).toBe(true);
    expect(watchers.has(assigneeUserId)).toBe(true);
  });

  it("notifies the new assignee and previous assignee watchers on reassignment", async () => {
    const { actor, assigneeUserId, organization, project, actorIdentity } =
      await createProjectWithAssignee();

    const nextIdentity = authFixture.createWorkosIdentityForOrganization(
      actorIdentity.organization,
      "member",
    );
    await authFixture.authHeadersFor(nextIdentity);
    const nextAssigneeUserId = await authFixture.getLocalUserId(nextIdentity.user.workosUserId);
    const team = await ensureDefaultWorkspaceTeam(organization.id);
    await db
      .insert(schema.teamMemberships)
      .values({
        teamId: team.id,
        userId: nextAssigneeUserId,
        role: "member",
      })
      .onConflictDoNothing();
    await authFixture.authHeadersFor(actorIdentity);

    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Reassign me",
        assigneeUserId,
      },
    });

    await db
      .delete(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    await issueSheetService.updateIssue({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      body: { assigneeUserId: nextAssigneeUserId },
    });

    const rows = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    expect(
      rows.some((row) => row.type === "assigned" && row.recipientUserId === nextAssigneeUserId),
    ).toBe(true);
    expect(
      rows.some((row) => row.type === "assignee_changed" && row.recipientUserId === assigneeUserId),
    ).toBe(true);
    expect(
      rows.some(
        (row) => row.type === "assignee_changed" && row.recipientUserId === nextAssigneeUserId,
      ),
    ).toBe(false);
    expect(rows.every((row) => row.recipientUserId !== actor.id)).toBe(true);
  });

  it("notifies the previous assignee on unassign without creating an assigned notification", async () => {
    const { actor, assigneeUserId, organization, project } = await createProjectWithAssignee();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Unassign me",
        assigneeUserId,
      },
    });

    await db
      .delete(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    await issueSheetService.updateIssue({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      body: { assigneeUserId: null },
    });

    const rows = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.issueId, issue.id));

    expect(rows.some((row) => row.type === "assigned")).toBe(false);
    expect(
      rows.some((row) => row.type === "assignee_changed" && row.recipientUserId === assigneeUserId),
    ).toBe(true);
    expect(rows.every((row) => row.recipientUserId !== actor.id)).toBe(true);
  });

  it("no-ops assignee-changed fan-out when the issue row is missing", async () => {
    const { actor, assigneeUserId, organization, project } = await createProjectWithAssignee();

    await notificationService.notifyAssigneeChanged({
      organizationId: organization.id,
      projectId: project.id,
      issueId: randomUUID(),
      actorUserId: actor.id,
      previousAssigneeUserId: assigneeUserId,
      nextAssigneeUserId: null,
    });

    const rows = await db
      .select()
      .from(schema.issueNotifications)
      .where(eq(schema.issueNotifications.organizationId, organization.id));

    expect(rows).toHaveLength(0);
  });
});
