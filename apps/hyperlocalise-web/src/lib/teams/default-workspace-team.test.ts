/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { db, schema } from "@/lib/database";
import { syncWorkosIdentity } from "@/api/auth/workos-sync";

import {
  DEFAULT_WORKSPACE_TEAM_NAME,
  DEFAULT_WORKSPACE_TEAM_SLUG,
  ensureDefaultWorkspaceTeam,
  ensureDefaultWorkspaceTeamMembership,
  ensureTeamMembership,
} from "./default-workspace-team";

describe("default workspace team membership helpers", () => {
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    for (const organizationId of createdOrganizationIds.splice(0)) {
      await db.delete(schema.organizations).where(eq(schema.organizations.id, organizationId));
    }
    for (const userId of createdUserIds.splice(0)) {
      await db.delete(schema.users).where(eq(schema.users.id, userId));
    }
  });

  async function createOrganizationAndUser() {
    const identity = await syncWorkosIdentity(db, {
      user: {
        workosUserId: `user_${crypto.randomUUID()}`,
        email: `dev-${crypto.randomUUID()}@example.com`,
      },
      organization: {
        workosOrganizationId: `org_${crypto.randomUUID()}`,
        name: "Membership Test Org",
        slug: `membership-test-${crypto.randomUUID().slice(0, 8)}`,
      },
      membership: {
        workosMembershipId: `membership_${crypto.randomUUID()}`,
        role: "developer",
      },
    });

    createdOrganizationIds.push(identity.organization.id);
    createdUserIds.push(identity.user.id);

    return identity;
  }

  it("creates the default workspace team once and reuses it", async () => {
    const identity = await createOrganizationAndUser();

    const first = await ensureDefaultWorkspaceTeam(identity.organization.id);
    const second = await ensureDefaultWorkspaceTeam(identity.organization.id);

    expect(first.id).toBe(second.id);
    expect(first.slug).toBe(DEFAULT_WORKSPACE_TEAM_SLUG);
    expect(first.name).toBe(DEFAULT_WORKSPACE_TEAM_NAME);
  });

  it("adds a user to the default team without demoting an existing manager role", async () => {
    const identity = await createOrganizationAndUser();
    const team = await ensureDefaultWorkspaceTeam(identity.organization.id);

    await ensureTeamMembership({
      teamId: team.id,
      userId: identity.user.id,
      role: "manager",
    });

    await ensureDefaultWorkspaceTeamMembership({
      organizationId: identity.organization.id,
      userId: identity.user.id,
      role: "member",
    });

    const [membership] = await db
      .select({ role: schema.teamMemberships.role })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.teamId, team.id),
          eq(schema.teamMemberships.userId, identity.user.id),
        ),
      )
      .limit(1);

    expect(membership?.role).toBe("manager");
  });
});
