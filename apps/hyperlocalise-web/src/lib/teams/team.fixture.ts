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
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database/client";
import { slugifyTeamName } from "@/lib/teams/team-slug";
import type { CreateTeamBody, TeamRecord } from "@/lib/teams/team.schema";

export function createTeamTestFixture() {
  const authFixture = createAuthTestFixture();

  async function createTeamViaApi(
    identity: WorkosAuthIdentity,
    input: CreateTeamBody = { name: "Platform" },
  ) {
    const { user, organization } = await authFixture.createLocalWorkosIdentity(identity);
    const slug = input.slug ?? slugifyTeamName(input.name);

    const team = await db.transaction(async (tx) => {
      const [createdTeam] = await tx
        .insert(schema.teams)
        .values({
          organizationId: organization.id,
          name: input.name,
          slug,
        })
        .returning();

      await tx.insert(schema.teamMemberships).values({
        teamId: createdTeam.id,
        userId: user.id,
        role: "manager",
      });

      return createdTeam;
    });

    const record: TeamRecord = {
      id: team.id,
      organizationId: team.organizationId,
      slug: team.slug,
      name: team.name,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };

    return new Response(JSON.stringify({ team: record }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createTeamViaApi,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
  };
}
