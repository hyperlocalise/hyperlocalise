/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { randomUUID } from "node:crypto";

import type { AppType } from "@/api/app";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { testClient } from "hono/testing";

type CreateProjectInput = Partial<{
  name: string;
  description: string;
  translationContext: string;
  sourceLocale: string;
  targetLocales: string[];
}>;

type Client = ReturnType<typeof testClient<AppType>>;

export function createProjectTestFixture(client?: Client) {
  const authFixture = createAuthTestFixture();

  async function createProjectViaApi(identity: WorkosAuthIdentity, input?: CreateProjectInput) {
    if (!client) {
      throw new Error("createProjectViaApi requires a test client");
    }

    return client.api.orgs[":organizationSlug"].projects.$post(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: {
          name: input?.name ?? "Marketing Site",
          description: input?.description ?? "Primary website strings",
          translationContext: input?.translationContext ?? "Use a concise product-marketing tone.",
          sourceLocale: input?.sourceLocale ?? "en-US",
          targetLocales: input?.targetLocales ?? ["fr-FR", "de-DE"],
        },
      },
      {
        headers: await authFixture.authHeadersFor(identity),
      },
    );
  }

  async function createStoredProjectFixture() {
    const { identity, organization, user } = await authFixture.createLocalWorkosIdentity();
    const team = await ensureDefaultWorkspaceTeam(organization.id);

    const [project] = await db
      .insert(schema.projects)
      .values({
        id: `project_${randomUUID()}`,
        organizationId: organization.id,
        teamId: team.id,
        createdByUserId: user.id,
        name: "Docs",
        description: "",
        translationContext: "",
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
      })
      .returning();

    return { identity, organization, user, project };
  }

  return {
    authHeadersFor: authFixture.authHeadersFor,
    cleanup: authFixture.cleanup,
    createLocalWorkosIdentity: authFixture.createLocalWorkosIdentity,
    createProjectViaApi,
    createStoredProjectFixture,
    createWorkosIdentity: authFixture.createWorkosIdentity,
    createWorkosIdentityForOrganization: authFixture.createWorkosIdentityForOrganization,
    createWorkosIdentityWithRole: authFixture.createWorkosIdentityWithRole,
    getLocalUserId: authFixture.getLocalUserId,
  };
}
