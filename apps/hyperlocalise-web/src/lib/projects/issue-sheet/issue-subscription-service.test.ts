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
import { IssueSheetCommentService } from "@/lib/projects/issue-sheet/issue-sheet-comment-service";
import { IssueSheetService } from "@/lib/projects/issue-sheet/issue-sheet-service";
import {
  IssueSubscriptionService,
  issueSubscriptionService,
} from "@/lib/projects/issue-sheet/issue-subscription-service";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";

const authFixture = createAuthTestFixture();
const subscriptionService = new IssueSubscriptionService();
const issueSheetService = new IssueSheetService();
const commentService = new IssueSheetCommentService();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await authFixture.cleanup();
});

async function createProjectWithMembers() {
  const actorIdentity = authFixture.createWorkosIdentityWithRole("admin");
  await authFixture.authHeadersFor(actorIdentity);
  const { organization, user: actor } = await authFixture.createLocalWorkosIdentity(actorIdentity);

  const memberIdentity = authFixture.createWorkosIdentityForOrganization(
    actorIdentity.organization,
    "member",
  );
  await authFixture.authHeadersFor(memberIdentity);
  const memberUserId = await authFixture.getLocalUserId(memberIdentity.user.workosUserId);

  const team = await ensureDefaultWorkspaceTeam(organization.id);
  await db
    .insert(schema.teamMemberships)
    .values({
      teamId: team.id,
      userId: memberUserId,
      role: "member",
    })
    .onConflictDoNothing();

  await authFixture.authHeadersFor(actorIdentity);

  const [project] = await db
    .insert(schema.projects)
    .values({
      id: `project_${randomUUID()}`,
      organizationId: organization.id,
      teamId: team.id,
      createdByUserId: actor.id,
      name: "Subscription Project",
      description: "",
      translationContext: "",
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
    })
    .returning();

  return { actor, actorIdentity, memberUserId, organization, project };
}

describe("IssueSubscriptionService", () => {
  it("subscribes reporter and assignee when an issue is created", async () => {
    const { actor, memberUserId, organization, project } = await createProjectWithMembers();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "New issue",
        assigneeUserId: memberUserId,
      },
    });

    const rows = await db
      .select()
      .from(schema.issueSheetSubscriptions)
      .where(eq(schema.issueSheetSubscriptions.issueId, issue.id));

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.userId).sort()).toEqual([actor.id, memberUserId].sort());
  });

  it("is idempotent when subscribing the same user twice", async () => {
    const { actor, organization, project } = await createProjectWithMembers();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: { title: "Duplicate subscribe" },
    });

    await subscriptionService.subscribe({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      userId: actor.id,
    });

    const rows = await db
      .select()
      .from(schema.issueSheetSubscriptions)
      .where(
        and(
          eq(schema.issueSheetSubscriptions.issueId, issue.id),
          eq(schema.issueSheetSubscriptions.userId, actor.id),
        ),
      );

    expect(rows).toHaveLength(1);
  });

  it("keeps subscription when assignee is removed", async () => {
    const { actor, memberUserId, organization, project } = await createProjectWithMembers();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "Unassign me",
        assigneeUserId: memberUserId,
      },
    });

    await issueSheetService.updateIssue({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      body: { assigneeUserId: null },
    });

    const subscribed = await subscriptionService.isSubscribed({
      issueId: issue.id,
      userId: memberUserId,
    });
    expect(subscribed).toBe(true);
  });

  it("subscribes comment authors and mentioned users with project access", async () => {
    const { actor, actorIdentity, memberUserId, organization, project } =
      await createProjectWithMembers();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: { title: "Comment subscribe" },
    });

    const outsiderIdentity = authFixture.createWorkosIdentityForOrganization(
      actorIdentity.organization,
      "member",
    );
    await authFixture.authHeadersFor(outsiderIdentity);
    const outsiderUserId = await authFixture.getLocalUserId(outsiderIdentity.user.workosUserId);
    await authFixture.authHeadersFor(actorIdentity);

    const auth = globalThis.__testApiAuthContext!;
    await commentService.create({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
      actorUserId: actor.id,
      role: "admin",
      auth,
      body: {
        body: "ping",
        mentionedUserIds: [memberUserId, outsiderUserId],
      },
    });

    const watchers = await issueSubscriptionService.resolveWatchers(issue.id);
    expect(watchers.has(actor.id)).toBe(true);
    expect(watchers.has(memberUserId)).toBe(true);
    expect(watchers.has(outsiderUserId)).toBe(false);
  });

  it("lists subscribers with display names", async () => {
    const { actor, memberUserId, organization, project } = await createProjectWithMembers();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: {
        title: "List subscribers",
        assigneeUserId: memberUserId,
      },
    });

    const subscribers = await subscriptionService.listSubscribers({
      organizationId: organization.id,
      projectId: project.id,
      issueId: issue.id,
    });

    expect(subscribers).toHaveLength(2);
    expect(subscribers.map((subscriber) => subscriber.userId).sort()).toEqual(
      [actor.id, memberUserId].sort(),
    );
    expect(subscribers.every((subscriber) => subscriber.displayName.length > 0)).toBe(true);
  });

  it("removes subscriptions when the issue is deleted", async () => {
    const { actor, organization, project } = await createProjectWithMembers();
    const issue = await issueSheetService.createIssue({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: actor.id,
      body: { title: "Delete cascade" },
    });

    await db.delete(schema.issueSheetIssues).where(eq(schema.issueSheetIssues.id, issue.id));

    const rows = await db
      .select()
      .from(schema.issueSheetSubscriptions)
      .where(eq(schema.issueSheetSubscriptions.issueId, issue.id));

    expect(rows).toHaveLength(0);
  });
});
