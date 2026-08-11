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

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { setMembershipReplacingSentinelForTest } from "@/api/test-cleanup";
import { db, schema } from "@/lib/database";
import { isOk } from "@/lib/primitives/result/results";

import {
  assertAssignableIssueAssignee,
  filterAssignableAssigneeUserIds,
  listAssignableIssueMembers,
} from "./issue-sheet-assignee";

const projectFixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await projectFixture.cleanup();
});

async function localUserIdForOrgIdentity(
  identity: ReturnType<typeof projectFixture.createWorkosIdentityForOrganization>,
) {
  await projectFixture.authHeadersFor(identity);
  return projectFixture.getLocalUserId(identity.user.workosUserId);
}

describe("issue-sheet-assignee", () => {
  it("allows teams:write operators without project team membership", async () => {
    const { identity, organization, project, user } =
      await projectFixture.createStoredProjectFixture();

    const manager = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "localization_manager",
    );
    const managerUserId = await localUserIdForOrgIdentity(manager);

    const result = await assertAssignableIssueAssignee({
      organizationId: organization.id,
      projectId: project.id,
      assigneeUserId: managerUserId,
    });
    expect(isOk(result)).toBe(true);

    const members = await listAssignableIssueMembers({
      organizationId: organization.id,
      projectId: project.id,
      actorUserId: user.id,
    });
    const managerMember = members.find((member) => member.userId === managerUserId);
    expect(managerMember).toMatchObject({
      userId: managerUserId,
      isCurrentUser: false,
    });
  });

  it("rejects translators without project team membership and accepts teammates", async () => {
    const { identity, organization, project } = await projectFixture.createStoredProjectFixture();

    const outsider = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    const teammate = projectFixture.createWorkosIdentityForOrganization(
      identity.organization,
      "translator",
    );
    const outsiderUserId = await localUserIdForOrgIdentity(outsider);
    const teammateUserId = await localUserIdForOrgIdentity(teammate);

    await db.insert(schema.teamMemberships).values({
      teamId: project.teamId!,
      userId: teammateUserId,
      role: "member",
    });

    const outsiderResult = await assertAssignableIssueAssignee({
      organizationId: organization.id,
      projectId: project.id,
      assigneeUserId: outsiderUserId,
    });
    expect(isOk(outsiderResult)).toBe(false);
    if (!isOk(outsiderResult)) {
      expect(outsiderResult.error.code).toBe("assignee_not_assignable");
    }

    const teammateResult = await assertAssignableIssueAssignee({
      organizationId: organization.id,
      projectId: project.id,
      assigneeUserId: teammateUserId,
    });
    expect(isOk(teammateResult)).toBe(true);
  });

  it("rejects pending invites and replacing memberships", async () => {
    const { organization, project } = await projectFixture.createStoredProjectFixture();

    const pendingWorkosUserId = `invited_user_${randomUUID()}`;
    const replacingWorkosUserId = `user_${randomUUID()}`;
    projectFixture.trackWorkosUserId(pendingWorkosUserId);
    projectFixture.trackWorkosUserId(replacingWorkosUserId);

    const [pendingUser] = await db
      .insert(schema.users)
      .values({
        workosUserId: pendingWorkosUserId,
        email: `pending-${randomUUID()}@example.com`,
        firstName: "Pending",
        lastName: "Invite",
      })
      .returning();
    await db.insert(schema.organizationMemberships).values({
      organizationId: organization.id,
      userId: pendingUser.id,
      role: "translator",
      workosMembershipId: null,
    });

    const [replacingUser] = await db
      .insert(schema.users)
      .values({
        workosUserId: replacingWorkosUserId,
        email: `replacing-${randomUUID()}@example.com`,
        firstName: "Replacing",
        lastName: "Member",
      })
      .returning();
    await db.insert(schema.organizationMemberships).values({
      organizationId: organization.id,
      userId: replacingUser.id,
      role: "translator",
      workosMembershipId: `membership_${randomUUID()}`,
    });
    await setMembershipReplacingSentinelForTest(db, {
      organizationId: organization.id,
      userId: replacingUser.id,
    });
    await db.insert(schema.teamMemberships).values({
      teamId: project.teamId!,
      userId: replacingUser.id,
      role: "member",
    });

    for (const userId of [pendingUser.id, replacingUser.id]) {
      const result = await assertAssignableIssueAssignee({
        organizationId: organization.id,
        projectId: project.id,
        assigneeUserId: userId,
      });
      expect(isOk(result)).toBe(false);
    }

    const members = await listAssignableIssueMembers({
      organizationId: organization.id,
      projectId: project.id,
    });
    const memberIds = new Set(members.map((member) => member.userId));
    expect(memberIds.has(pendingUser.id)).toBe(false);
    expect(memberIds.has(replacingUser.id)).toBe(false);
  });

  it("returns not assignable for unknown projects and filters requested ids", async () => {
    const { organization, project, user } = await projectFixture.createStoredProjectFixture();

    const missingProject = await assertAssignableIssueAssignee({
      organizationId: organization.id,
      projectId: `project_missing_${randomUUID()}`,
      assigneeUserId: user.id,
    });
    expect(isOk(missingProject)).toBe(false);

    const filtered = await filterAssignableAssigneeUserIds({
      organizationId: organization.id,
      projectId: project.id,
      userIds: [user.id, `user_missing_${randomUUID()}`, ""],
    });
    expect(filtered).toEqual(new Set([user.id]));

    const empty = await filterAssignableAssigneeUserIds({
      organizationId: organization.id,
      projectId: project.id,
      userIds: [],
    });
    expect(empty.size).toBe(0);
  });
});
